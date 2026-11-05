import * as THREE from 'three';
import { BoardContactSkillStreetPhysics } from './BoardContactSkillStreetPhysics.js';
import { CollisionResolver } from './collision/CollisionResolver.js';
import {
  evaluateStableLanding,
  stableFlipLandingMode,
  landingBailMessage,
} from './core/LandingResult.js';
import {
  applyAcceptedLanding,
  LANDING_VELOCITY_MODE,
} from './core/LandingExecutor.js';
import { MOVEMENT_STATE, PHYSICS } from './StreetPhysics.js';

const clamp = THREE.MathUtils.clamp;

/**
 * Nose/tail clearance is only meant to stop sharp obstacle sides.
 * Curved rideable faces (banks/quarters/bowls) must stay wheel-owned.
 */
export function isSharpDeckBlocker(normal, maxVerticalComponent = 0.08) {
  return Boolean(normal && Math.abs(normal.y) <= maxVerticalComponent);
}

/**
 * A board may keep partial edge support, but it must never be pulled sharply
 * downward toward a disconnected lower surface. That transition should become air.
 */
export function isUnsafeSupportDrop({
  contactCount = 0,
  maxWheelGap = 0,
  correctionAlongNormal = 0,
  normalContinuity = 1,
} = {}) {
  if (correctionAlongNormal >= -0.045) return false;
  if (contactCount < 3) return true;
  return correctionAlongNormal < -0.065
    && maxWheelGap > 0.075
    && normalContinuity > 0.94;
}

/**
 * A ramp takeoff is the opposite of a partial landing. While climbing, once the
 * leading truck has fully cleared the lip and only the trailing truck remains,
 * keeping the board grounded makes it hinge over the last wheels and fall. Let
 * the board become ballistic immediately. Travel sign makes this work in fakie.
 */
export function shouldReleaseRampLip({
  normalY = 1,
  verticalSpeed = 0,
  speed = 0,
  contactCount = 0,
  frontSupported = 0,
  rearSupported = 0,
  travelSign = 1,
} = {}) {
  if (Math.abs(normalY) >= 0.985) return false;
  if (verticalSpeed <= 0.12 || Math.abs(speed) < 2.5) return false;
  if (contactCount < 1 || contactCount > 3) return false;
  const leadingSupported = travelSign < 0 ? rearSupported : frontSupported;
  const trailingSupported = travelSign < 0 ? frontSupported : rearSupported;
  if (!trailingSupported) return false;
  if (!leadingSupported) return true;
  // On a diagonal quarter/corner crossing, one leading wheel may cling to the
  // coping while the other three have reached the end of ramp support. Allow
  // release only when there is genuine steep upward momentum, not on flats,
  // gentle rolling seams or ordinary uneven ground.
  return contactCount === 3 && leadingSupported === 1
    && trailingSupported === 2 && Math.abs(normalY) < 0.78
    && verticalSpeed > 0.65 && Math.abs(speed) > 5.0;
}

/** Backward-compatible public helper now owned by canonical LandingResult. */
export function flipLandingMode(progress, normalY = 1) {
  return stableFlipLandingMode(progress, normalY);
}

/**
 * Positive drive means "keep going" rather than "move toward the deck nose".
 * This matters after a 180: the deck has reversed, but momentum should continue
 * in the same world direction while the rider rolls fakie/switch.
 */
export function signedDriveAcceleration(speed, drive, push = PHYSICS.push, maxSpeed = PHYSICS.maxSpeed) {
  if (!(drive > 0) || Math.abs(speed) >= maxSpeed) return 0;
  return drive * push * (speed < 0 ? -1 : 1);
}

/**
 * Regression guard around the validated six-point board solver.
 * It preserves the same contact rig while rejecting disconnected downward snaps
 * and filtering nose/tail clearance to near-vertical obstacle faces only.
 */
export class StableBoardContactSkillStreetPhysics extends BoardContactSkillStreetPhysics {
  ensureBoardSafetyScratch() {
    this._supportPreviousNormal ||= new THREE.Vector3(0, 1, 0);
    this._supportCorrection ||= new THREE.Vector3();
    this._deckProbeFrom ||= new THREE.Vector3();
    this._deckProbeTo ||= new THREE.Vector3();
    this._deckProbeDelta ||= new THREE.Vector3();
    this._deckHitPoint ||= new THREE.Vector3();
    this._deckHitNormal ||= new THREE.Vector3();
  }

  ensureCollisionResolver() {
    if (this.coreController) {
      this.collisionResolver = this.coreController.ensureCollision(this.surface);
      return this.collisionResolver;
    }
    if (!this.collisionResolver || this.collisionResolver.surface !== this.surface) {
      this.collisionResolver = new CollisionResolver(this.surface);
    }
    return this.collisionResolver;
  }

  resolveSharpDeckClearance(from, desired, velocity, heading, normal) {
    const contact = this.ensureBoardContact();
    this.ensureBoardSafetyScratch();
    const state = contact.state;
    state.noseClear = true;
    state.tailClear = true;
    const basis = contact.basis(heading, normal);

    for (let i = 0; i < 2; i++) {
      const local = i === 0 ? contact.noseLocal : contact.tailLocal;
      contact.worldPoint(from, local, heading, normal, this._deckProbeFrom, basis);
      contact.worldPoint(desired, local, heading, normal, this._deckProbeTo, basis);
      const hit = this.surface.sweepSolidSphere(
        this._deckProbeFrom,
        this._deckProbeTo,
        contact.clearanceRadius,
        this._deckHitPoint,
        this._deckHitNormal,
        null,
        0.08, // Search sharp ledge sides, not the nearest sloping ramp surface.
      );
      if (!hit || !isSharpDeckBlocker(hit.normal)) continue;

      if (i === 0) state.noseClear = false;
      else state.tailClear = false;

      const safeFraction = clamp((hit.fraction ?? 0) - 0.008, 0, 1);
      this._deckProbeDelta.copy(desired).sub(from).multiplyScalar(safeFraction);
      desired.copy(from).add(this._deckProbeDelta);
      const into = velocity.dot(hit.normal);
      if (into < 0) velocity.addScaledVector(hit.normal, -into);
    }
    return desired;
  }

  /**
   * A wheel leaving a steep authored lip can momentarily lose all support
   * before launchAt's narrow capture window sees the edge. Recover only a
   * physically ascending, explicitly authored nearby quarter/bowl lip.
   * Flat seams, downward drops and walls cannot become synthetic vert jumps.
   */
  releaseRisingRamp(impulse = 0) {
    const rising = this.grounded
      && this.velocity.y > 0.12
      && this.normal.y >= 0
      && this.normal.y < 0.93;
    const edge = rising
      ? this.transitions.approachAt(this.position, this.normal, this.velocity)
      : null;
    return this.takeoff(impulse, edge);
  }

  resolveMotion(before, beforeUp, input = {}) {
    const collision = this.ensureCollisionResolver();
    const velocityBefore = this.copingTrace ? this.velocity.toArray() : null;
    const result = collision.resolveBody({
      from: before,
      desired: this.position,
      velocity: this.velocity,
      fromUp: beforeUp,
      toUp: this.bodyUp(),
      grounded: this.grounded,
      forward: this.forward,
      ignoreRail: this.grind?.rail.name || null,
    });
    collision.applyBodyResult(this, result);
    this.copingTrace?.decision('body-collision', {velocityBefore,velocityAfter:this.velocity.toArray(),
      contacts:result.wallContacts.map(c=>({normal:c.normal?.toArray(),surface:c.surface,rail:c.railId}))});

    const wall = result.wallContacts[0] || null;
    const slideContact = result.contacts.find(hit => Math.abs(hit.normal?.y ?? 1) < 0.3);
    if (slideContact && this.grounded) {
      this.wallSlideNormal = slideContact.normal.clone().setY(0).normalize();
      this.wallSlideTime = 0.18;
    }
    if (wall && !this.grounded && !this.grind && !this.wallRide && this.contactCooldown <= 0
      && this.movementState !== MOVEMENT_STATE.VERT_AIR) {
      if (input.olliePressed) this.wallPlant(wall, this.position.clone());
      else if (input.grindHeld) this.startWallRide(wall, this.position.clone());
    }
    if (!this.grounded) return;

    if (this.pendingBoardTransition) {
      const transition = this.pendingBoardTransition;
      this.pendingBoardTransition = null;
      const vertBoost = this.vertJumpTimer > 0 ? this.vertJumpPending : 0;
      this.takeoff(vertBoost, transition);
      return;
    }

    this.ensureBoardSafetyScratch();
    this._supportPreviousNormal.copy(this.normal);
    const contact = this.ensureBoardContact();
    let support = contact.solveGround(
      this.position,
      before,
      this.heading,
      this._supportPreviousNormal,
      true,
    );

    const landingGrace = (this.transitionLandingGrace || 0) > 0;
    // Recovery is allowed only while the board was already grounded on a
    // non-flat rideable transition. At diagonal bowl seams, its previous
    // pitch/roll basis can lose all four wheel rays for a single fixed step.
    // Re-check the actual mesh vertically before classifying that as takeoff.
    // Never bridge real lips: all recovered contacts must be very near the
    // current center and face roughly the same direction as the prior bowl.
    if (!support.supported && this._supportPreviousNormal.y > 0.1
      && this._supportPreviousNormal.y < 0.985 && this.velocity.y > -1.5) {
      const corrected = contact.snapToGround(this.position, this.heading, 0.16, 0.20);
      if (!(corrected.supported && corrected.count >= 2
        && corrected.position.distanceTo(this.position) <= 0.14
        && corrected.normal.dot(this._supportPreviousNormal) >= 0.48)) {
        contact.clearContacts();
        support = contact.state;
        support.supported = false;
      } else support = corrected;
    }

    if (!support.supported && landingGrace) {
      const oldRise = contact.probeRise;
      const oldDrop = contact.probeDrop;
      contact.probeRise = Math.max(oldRise, 0.16);
      contact.probeDrop = Math.max(oldDrop, 0.34);
      support = contact.solveGround(
        this.position,
        before,
        this.heading,
        this._supportPreviousNormal,
        false,
      );
      contact.probeRise = oldRise;
      contact.probeDrop = oldDrop;
    }

    if (!support.supported) {
      this.lastWheelSupport = null;
      const armedVert = this.vertJumpTimer > 0
        ? this.transitions.approachAt(this.position, this.normal, this.velocity)
        : null;
      if (armedVert) this.takeoff(this.vertJumpPending, armedVert);
      else this.releaseRisingRamp();
      return;
    }

    const correctionAlongNormal = this._supportCorrection
      .copy(support.position)
      .sub(this.position)
      .dot(this._supportPreviousNormal);
    const normalContinuity = support.normal.dot(this._supportPreviousNormal);

    if (!landingGrace && isUnsafeSupportDrop({
      contactCount: support.count || 0,
      maxWheelGap: support.maxWheelGap || 0,
      correctionAlongNormal,
      normalContinuity,
    })) {
      this.lastWheelSupport = null;
      this.releaseRisingRamp();
      return;
    }

    const measuredSign = this.velocity.dot(this.forward) < 0 ? -1 : 1;
    const downhillReversal = this.normal.y < .95 && this.velocity.y < -.01;
    const sign = !downhillReversal && Number.isFinite(this.rollingSign) && this.rollingSign !== 0
      ? (this.rollingSign < 0 ? -1 : 1)
      : measuredSign;
    const speed = this.velocity.length() * sign;

    if (!landingGrace && shouldReleaseRampLip({
      normalY: this._supportPreviousNormal.y,
      verticalSpeed: this.velocity.y,
      speed,
      contactCount: support.count || 0,
      frontSupported: support.frontSupported || 0,
      rearSupported: support.rearSupported || 0,
      travelSign: sign,
    })) {
      this.lastWheelSupport = support;
      const lipBoost = (this.rampExitIntentTime || 0) > 0 ? 0.9 : 0;
      this.releaseRisingRamp(lipBoost);
      return;
    }

    // Generic contacts correct support position/normal/velocity only. They never
    // rewrite horizontal yaw; heading remains player-authored.
    this.position.copy(support.position);
    this.normal.copy(support.normal);
    this.lastWheelSupport = support;
    this.groundDirection();
    this.velocity.copy(this.forward).multiplyScalar(speed);

    if (this.manual) {
      const truckSupported = this.manual === 'noseManual' ? support.frontSupported : support.rearSupported;
      if (!truckSupported || Math.abs(speed) < 0.55) this.endManual();
    }
  }

  stepGround(dt, input, drive) {
    let speed = this.velocity.dot(this.forward);
    const persistentSign = Number.isFinite(this.rollingSign) && this.rollingSign !== 0
      ? (this.rollingSign < 0 ? -1 : 1)
      : 0;
    if (persistentSign && Math.abs(speed) > 1e-5) speed = Math.abs(speed) * persistentSign;

    if (this.manual) this.updateManualBalance(dt, input, speed);
    if (this.bailTime) return;

    const rate = THREE.MathUtils.lerp(2.7, 1.2, clamp(Math.abs(speed) / 12, 0, 1));
    const steeringSign = persistentSign || (speed < -0.15 ? -1 : 1);
    this.heading -= this.steer * rate * steeringSign * dt;
    this.groundDirection();
    speed += (-PHYSICS.gravity * this.forward.y) * dt;

    const balanceDrive = Boolean(this.manual);
    if (!balanceDrive) speed += signedDriveAcceleration(speed, drive) * dt;
    const braking = input.brake || (!balanceDrive && drive < 0);
    const resistance = 0.26 + 0.012 * speed * speed + (braking ? PHYSICS.brake : 0);
    speed = Math.sign(speed) * Math.max(0, Math.abs(speed) - resistance * dt);
    speed = clamp(speed, -17, 17);
    this.velocity.copy(this.forward).multiplyScalar(speed);

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

  land(support) {
    const landing = evaluateStableLanding({
      support,
      position: this.position,
      velocity: this.velocity,
      forward: this.forward,
      airTime: this.airTime,
      flipProgress: this.flipState?.progress ?? null,
      maxLandingCorrection: PHYSICS.maxLandingCorrection,
    });

    // Preserve legacy side-effect order: eligible auto-catch completes the flip
    // before a separate alignment failure may still request a bail.
    if (landing.flipMode === 'autoCatch' && this.flipState) this.flipState.progress = 1;

    if (!landing.accepted) {
      if (landing.shouldBail) this.bail(landingBailMessage(landing));
      return false;
    }

    return applyAcceptedLanding(this, support, landing, {
      applySpinStance: false,
      manageLandingGrace: false,
      velocityMode: LANDING_VELOCITY_MODE.DECK_SIGNED,
    });
  }
}
