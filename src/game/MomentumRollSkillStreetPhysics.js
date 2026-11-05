import * as THREE from 'three';
import { StableBoardContactSkillStreetPhysics } from './StableBoardContactSkillStreetPhysics.js';
import { PHYSICS } from './StreetPhysics.js';
import { resolveTravelState } from './core/TravelState.js';
import { resolveGroundStepStart } from './core/GroundStepResult.js';
import {
  GROUND_MOTOR,
  automaticPushAcceleration,
  passiveRollingResistance,
  resolveGroundMotion,
  smoothGroundSteer,
  transitionGravityScale,
} from './core/GroundMotor.js';
import {
  TRANSITION_INTENT,
  shouldArmTransitionExit,
} from './transitions/TransitionIntent.js';

export {
  automaticPushAcceleration,
  passiveRollingResistance,
  transitionGravityScale,
} from './core/GroundMotor.js';

export const MOMENTUM_ROLL = Object.freeze({
  // Compatibility surface: movement tuning now comes from canonical GroundMotor.
  ...GROUND_MOTOR,
  signMemoryThreshold: 0.18,

  // Explicit transfer modifier survives the last wheel-contact frames.
  rampExitInputThreshold: 0.35,
  rampExitBuffer: TRANSITION_INTENT.bufferTime,
  rampExitSlopeY: TRANSITION_INTENT.slopeY,
  rampExitMinRise: TRANSITION_INTENT.minRise,
  rampLipBoost: 0.9,

  // Deprecated wall-response tuning retained only while collision migration and
  // old QA helpers are being removed. These values no longer authorize yaw.
  wallImpactMinSpeed: 3.2,
  wallImpactMinApproach: 0.48,
  wallRecoverySpeedScale: 0.72,
  wallRecoveryMinSpeed: 3.0,
  wallImpactDuration: 0.52,
  wallImpactCooldown: 0.46,
  wallProbePadding: 0.20,
});

/** A held approach direction must never arm an outward launch. */
export function shouldBufferRampExit({
  vertExit = false,
  normalY = 1,
  verticalSpeed = 0,
  config = MOMENTUM_ROLL,
} = {}) {
  return shouldArmTransitionExit({
    input: { vertExit },
    normalY,
    verticalSpeed,
    config: {
      bufferTime: config.rampExitBuffer,
      slopeY: config.rampExitSlopeY,
      minRise: config.rampExitMinRise,
    },
  });
}

function horizontalDirection(source, fallback = null) {
  const result = source?.clone?.() || new THREE.Vector3();
  result.y = 0;
  if (result.lengthSq() > 1e-6) return result.normalize();
  if (fallback?.lengthSq?.() > 1e-6) {
    result.copy(fallback); result.y = 0;
    if (result.lengthSq() > 1e-6) return result.normalize();
  }
  return result.set(0, 0, -1);
}

/**
 * Deprecated geometry helper retained for migration tests only. It does NOT
 * authorize heading changes anywhere in gameplay.
 */
export function chooseWallRecoveryDirection(velocity, wallNormal, steer = 0) {
  const incoming = horizontalDirection(velocity);
  const normal = horizontalDirection(wallNormal, new THREE.Vector3(1, 0, 0));
  const a = new THREE.Vector3(normal.z, 0, -normal.x).normalize();
  const b = a.clone().negate();
  const scoreA = a.dot(incoming);
  const scoreB = b.dot(incoming);
  if (Math.abs(scoreA - scoreB) < 0.05 && Math.abs(steer) > 0.08) {
    return steer > 0 ? a : b;
  }
  return scoreA >= scoreB ? a : b;
}

/** Deprecated speed helper retained for migration tests only. */
export function wallRecoverySpeed(speed, config = MOMENTUM_ROLL) {
  const magnitude = Math.max(0, Number(speed) || 0);
  if (magnitude <= 0) return 0;
  return Math.min(magnitude, Math.max(config.wallRecoveryMinSpeed, magnitude * config.wallRecoverySpeedScale));
}

/**
 * Momentum-first skating with explicit travel/fakie state.
 *
 * Crucial distinction:
 *   deck forward = where the nose points
 *   travelDirection = where the board is actually moving in world space
 *
 * A 180 changes their relationship but must not rotate travelDirection. Camera
 * remains travel-oriented. Steering is ALSO travel/camera-oriented: pressing
 * left always curves left on screen, whether the deck is regular or fakie.
 *
 * Wall/contact geometry has zero yaw authority. The former automatic wall
 * recovery path has been deleted from stepGround; collision response may later
 * correct position/velocity through CollisionResolver, never heading.
 */
export class MomentumRollSkillStreetPhysics extends StableBoardContactSkillStreetPhysics {
  reset(position = this.spawn, heading = 0) {
    super.reset(position, heading);
    this.rollingSign = 1;
    this.fakie = false;
    this.travelDirection ||= new THREE.Vector3();
    this.travelDirection.copy(horizontalDirection(this.forward));
    this.autoPushActive = false;
    this.rampExitIntentTime = 0;
    this.rampReentrySteerLock = 0;
    this.groundSteerFiltered = 0;
    this.wallImpactTime = 0;
    this.wallImpactDuration = MOMENTUM_ROLL.wallImpactDuration;
    this.wallImpactCooldown = 0;
    this.wallImpactSide = 0;
    this.transitionLandingGrace = 0;
    this.wallSlideNormal = null;
    this.wallSlideTime = 0;
  }

  /**
   * Phase 1 migration: direction/sign/fakie are now resolved by one canonical
   * pure helper. Legacy fields remain populated so upper systems keep their
   * current API while duplicate travel math is removed incrementally.
   */
  syncTravelDirection({ preserveIfSlow = true } = {}) {
    this.travelDirection ||= new THREE.Vector3(0, 0, -1);
    if (this.coreController) {
      this.coreController.syncTravel(this, {
        preserveIfSlow,
        signMemoryThreshold: MOMENTUM_ROLL.signMemoryThreshold,
        directionThreshold: MOMENTUM_ROLL.signMemoryThreshold,
      });
      return this.travelDirection;
    }

    const state = resolveTravelState({
      velocity: this.velocity,
      deckHeading: this.heading,
      previousDirection: this.travelDirection,
      previousSign: this.rollingSign,
      preserveDirectionIfSlow: preserveIfSlow,
      config: {
        signMemoryThreshold: MOMENTUM_ROLL.signMemoryThreshold,
        directionThreshold: MOMENTUM_ROLL.signMemoryThreshold,
      },
    });
    this.travelDirection.copy(state.travelDirection);
    this.rollingSign = state.rollingSign;
    this.fakie = state.fakie;
    return this.travelDirection;
  }

  /** Automatic wall-turn detection has no runtime authority. */
  detectGroundWallImpact() {
    return null;
  }

  /** Contact recovery may never rewrite deck heading. */
  applyWallRecovery() {
    return false;
  }

  stepGround(dt, input = {}, drive = 0) {
    if (!Number.isFinite(this.rollingSign) || this.rollingSign === 0) {
      this.syncTravelDirection();
    }

    const startContext = {
      dt,
      input,
      velocity: this.velocity,
      forward: this.forward,
      rollingSign: this.rollingSign,
      normalY: this.normal.y,
      verticalSpeed: this.velocity.y,
      rampReentrySteerLock: this.rampReentrySteerLock,
      wallSlideTime: this.wallSlideTime,
      transitionLandingGrace: this.transitionLandingGrace,
      wallImpactTime: this.wallImpactTime,
      wallImpactCooldown: this.wallImpactCooldown,
      rampExitIntentTime: this.rampExitIntentTime,
    };
    const start = this.coreController
      ? this.coreController.resolveGroundStepStart(startContext)
      : resolveGroundStepStart(startContext);

    this.rampReentrySteerLock = start.timers.rampReentrySteerLock;
    this.wallSlideTime = start.timers.wallSlideTime;
    this.transitionLandingGrace = start.timers.transitionLandingGrace;
    this.wallImpactTime = start.timers.wallImpactTime;
    this.wallImpactCooldown = start.timers.wallImpactCooldown;
    this.rampExitIntentTime = start.transitionIntent.remaining;

    const speedState = start.speedState;
    let speed = speedState.speed;
    this.groundSteerFiltered = smoothGroundSteer({
      previous: this.groundSteerFiltered,
      target: this.steer,
      speed,
      dt,
      config: MOMENTUM_ROLL,
    });

    if (this.manual) this.updateManualBalance(dt, input, speed);
    if (this.bailTime) return;

    // One pure GroundMotor transaction owns deliberate steering plus tangent
    // propulsion. Contact geometry still owns only clearance/support/collision.
    const motionContext = {
      heading: this.heading,
      normal: this.normal,
      speedState,
      steer: this.groundSteerFiltered,
      manual: Boolean(this.manual),
      crouched: Boolean(input.ollieHeld),
      reentryRemaining: this.rampReentrySteerLock,
      drive,
      brake: input.brake,
      dt,
      gravity: PHYSICS.gravity,
      brakeDecel: PHYSICS.brake,
      config: MOMENTUM_ROLL,
    };
    const motion = this.coreController
      ? this.coreController.resolveGroundMotion(motionContext)
      : resolveGroundMotion(motionContext);
    this.heading = motion.heading;
    this.forward.copy(motion.forward);
    this.autoPushActive = motion.propulsion.autoPushActive;
    speed = motion.speed;
    this.velocity.copy(motion.velocity);
    // Keep the collision's slide vector instead of accelerating into the same
    // wall again next frame. Steering still belongs entirely to the player.
    if (this.wallSlideTime > 0 && this.wallSlideNormal) {
      const into = this.velocity.dot(this.wallSlideNormal);
      if (into < 0) this.velocity.addScaledVector(this.wallSlideNormal, -into);
    }

    this._boardMoveStart.copy(this.position);
    this.position.addScaledVector(this.velocity, dt);
    this.resolveSharpDeckClearance(
      this._boardMoveStart,
      this.position,
      this.velocity,
      this.heading,
      this.normal,
    );
    this.pendingBoardTransition = this.transitions.launchAt(this.position, this.normal, this.velocity);
  }

  resolveMotion(before, beforeUp, input = {}) {
    super.resolveMotion(before, beforeUp, input);
    if (this.grounded && this.wallSlideTime > 0 && this.wallSlideNormal) {
      const into = this.velocity.dot(this.wallSlideNormal);
      if (into < 0) this.velocity.addScaledVector(this.wallSlideNormal, -into);
    }
    if (this.grounded) this.syncTravelDirection();
    if (!this.grounded) {
      this.autoPushActive = false;
      // A new airborne segment must not inherit a stale held carve on reentry.
      this.groundSteerFiltered = 0;
    }
  }
}
