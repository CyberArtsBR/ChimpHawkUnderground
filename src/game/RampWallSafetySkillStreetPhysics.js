import * as THREE from 'three';
import { MomentumRollSkillStreetPhysics } from './MomentumRollSkillStreetPhysics.js';
import { resolveTransferFlightStep } from './core/TransferFlightResult.js';
import { resolveAirMotion } from './core/AirController.js';
import { MOVEMENT_STATE, PHYSICS } from './StreetPhysics.js';
import { interpretAirTurn } from '../input/InputInterpreter.js';

const UP = new THREE.Vector3(0, 1, 0);
const clamp = THREE.MathUtils.clamp;

export const RAMP_WALL_SAFETY = Object.freeze({
  // Legacy wall-classification thresholds remain exported for geometry QA only.
  // Runtime collision response no longer owns yaw or performs wall-turn probes.
  wallGroundMinY: 0.94,
  wallMaxVerticalSpeed: 0.9,
  wallFaceMaxY: 0.04,
  transitionFaceMinY: 0.035,
  transitionFaceMaxY: 0.62,
  wallProbeLow: 0.26,
  wallProbeHigh: 0.46,
  wallProbePadding: 0.24,

  // THPS-style Up exit should clear the coping and land on the deck, not become
  // a horizontal cannon. The old implementation could sustain 12.8 m/s outward
  // for the whole air and launch the rider beyond the park boundary.
  exitHorizontalMin: 2.8,
  exitHorizontalMax: 6.4,
  exitVerticalMin: 2.8,
  exitVerticalMax: 7.2,
  exitDistanceMin: 1.15,
  exitDistanceMax: 2.55,
  exitLandingMinSpeed: 0.7,
  exitLandingMaxSpeed: 3.2,
});

/** Legacy geometry classifier kept for regression tests; it has no yaw authority. */
export function wallRecoveryContextAllows({
  groundNormalY = 1,
  verticalSpeed = 0,
  hitNormalY = 0,
  config = RAMP_WALL_SAFETY,
} = {}) {
  return Math.abs(groundNormalY) >= config.wallGroundMinY
    && Math.abs(verticalSpeed) <= config.wallMaxVerticalSpeed
    && Math.abs(hitNormalY) <= config.wallFaceMaxY;
}

/**
 * Compatibility helper retained for tests/tuning. Runtime takeoff now consumes
 * the equivalent pure TransferLaunchResult stage.
 */
export function controlledTransferProfile(incomingSpeed = 0, launchVertical = 0,
  config = RAMP_WALL_SAFETY) {
  const speed = Math.max(0, Number(incomingSpeed) || 0);
  const horizontalSpeed = clamp(speed * 0.30 + 0.8,
    config.exitHorizontalMin, config.exitHorizontalMax);
  const verticalSpeed = clamp((Number(launchVertical) || 0) * 0.62,
    config.exitVerticalMin, config.exitVerticalMax);
  const targetDistance = clamp(speed * 0.10 + 0.55,
    config.exitDistanceMin, config.exitDistanceMax);
  return { horizontalSpeed, verticalSpeed, targetDistance };
}

/** Compatibility helper retained for tests/tuning; flight runtime uses the pure result model. */
export function controlledTransferOutwardSpeed({
  apexPassed = false,
  outwardDistance = 0,
  targetDistance = 1.5,
  initialSpeed = 4,
  age = 0,
  config = RAMP_WALL_SAFETY,
} = {}) {
  if (!apexPassed) return Math.max(config.exitLandingMaxSpeed,
    initialSpeed * Math.exp(-0.28 * Math.max(0, age)));
  const remaining = Math.max(0, targetDistance - outwardDistance);
  return clamp(remaining * 2.35,
    config.exitLandingMinSpeed, config.exitLandingMaxSpeed);
}

export function isControlledDeckExitTouchdown(support, transitionAir) {
  if (!transitionAir?.transferring) return false;
  const count = support?.count || 0;
  if (count < 1) return false;
  return Math.abs(support?.normal?.y ?? 0) >= 0.985;
}

/**
 * Transition/deck-exit safety layer. Wall-turn detection was removed in Phase 1:
 * collision can correct position/velocity but never owns horizontal yaw.
 */
export class RampWallSafetySkillStreetPhysics extends MomentumRollSkillStreetPhysics {
  advanceControlledTransfer(air, dt) {
    const result = resolveTransferFlightStep({
      air,
      position: this.position,
      velocity: this.velocity,
      dt,
      config: RAMP_WALL_SAFETY,
    });
    if (!result.active) return;

    air.age = result.age;
    air.apexPassed = result.apexPassed;
    air.returnError = result.returnError;
    this.velocity.copy(result.velocity);
  }

  stepAir(dt, input = {}, drive, before) {
    if (this.airTime <= 0) {
      this.airTurnHoldTime = 0;
      this.airTurnDirection = 0;
    }
    this.airTime += dt;

    // Air orientation is anchored to takeoff facing every fixed step. Only the
    // deliberate current-frame command from InputInterpreter may accumulate spin;
    // residual ground steering never participates in airborne yaw.
    const frameHeading = this.transitionAir?.frame?.takeoffHeading;
    const takeoffHeading = Number.isFinite(frameHeading)
      ? frameHeading
      : (Number.isFinite(this.airTakeoffHeading) ? this.airTakeoffHeading : this.airHeading);
    this.airHeading = takeoffHeading;

    const turnInput = Number.isFinite(Number(input?.airTurnCommand))
      ? Number(input.airTurnCommand)
      : interpretAirTurn(input);
    const airContext = {
      airHeading: this.airHeading,
      airSpin: this.airSpin,
      turnInput,
      directSpinInput: input.spin,
      turnHoldTime: this.airTurnHoldTime || 0,
      previousTurnDirection: this.airTurnDirection || 0,
      velocityY: this.velocity.y,
      gravity: PHYSICS.gravity,
      dt,
    };
    const air = this.coreController
      ? this.coreController.resolveAirMotion(airContext)
      : resolveAirMotion(airContext);
    this.airSpin = air.airSpin;
    this.airTurnHoldTime = air.turnHoldTime;
    this.airTurnDirection = air.turnDirection;
    this.heading = air.heading;
    this.airDirection();
    this.velocity.y = air.velocityY;

    if (this.movementState === MOVEMENT_STATE.VERT_AIR && this.transitionAir) {
      if (this.transitionAir.transferring && this.transitionAir.exitControl) {
        this.advanceControlledTransfer(this.transitionAir, dt);
      } else {
        this.transitions.advance(this.transitionAir, this.position, this.velocity, input, dt);
      }
    }
    this.position.addScaledVector(this.velocity, dt);

    if (this.flipState) {
      this.flipState.progress += dt / this.flipState.duration;
      if (this.flipState.progress >= 1) this.flipState = null;
    }

    if (this.pendingGrindTrick && this.contactCooldown <= 0 && !this.flipState) {
      if (this.enterGrind(this.pendingGrindTrick)) {
        this.pendingGrindTrick = null;
        return;
      }
    }

    const contact = this.ensureBoardContact();
    const support = contact.solveLanding(before, this.position, this.heading, UP, this.velocity);
    const impact = contact.landingImpact;
    if (support && this.land(support)) return;
    if (impact && !this.grounded && !this.grind && !this.wallRide) {
      // The outer coping layer must receive the unmodified swept trajectory.
      // Clamping/projecting here first removed its re-entry crossing and left
      // the rider airborne with no downhill momentum on the transition.
      // Only a same-wall return has a second sweep in the outer coping layer.
      // Deck transfers skip that path, so deferring their impacts here lets a
      // partial truck catch pass through the deck and even the floor below it.
      if (this.deferTransitionImpact?.(impact) && this.bailTime <= 0) return;
      // Generic ramps also need a contact basis aligned to the actual face,
      // rather than the world-UP wheel rig used for the initial air sweep.
      const touchdown = impact.position.clone();
      const contactNormal = impact.normal.clone();
      if (this.bailTime <= 0) {
        const aligned = contact.solveGround(touchdown, before, this.heading, contactNormal, false);
        if (aligned.supported && this.land(aligned)) return;
      }
      // A failed trick/partial edge catch still collides with the terrain.
      this.position.copy(touchdown);
      const motion = this.bailTime > 0 ? this.bailVelocity : this.velocity;
      const into = motion.dot(contactNormal);
      if (into < 0) motion.addScaledVector(contactNormal, -into);
      // A rejected descent has still struck real terrain. Finish it as ordinary
      // air contact instead of letting an obsolete ramp/deck target drive the
      // rider through an unrelated surface on the next frame.
      if (this.transitionAir && this.transitionAir.apexPassed && this.bailTime <= 0) {
        this.transitionAir = null;
        this.setMovementState(MOVEMENT_STATE.AIR);
      }
    }
  }

}
