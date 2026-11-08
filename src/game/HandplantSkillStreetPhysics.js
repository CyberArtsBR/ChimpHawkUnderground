import * as THREE from 'three';
import { StatefulSkillStreetPhysics } from './StatefulSkillStreetPhysics.js';
import { MOVEMENT_STATE } from './StreetPhysics.js';
import { createBalanceState, disturbBalance, stepBalance } from './SkateSystems.js';
import { directionKey, handplantFor } from './TrickCatalog.js';

const clamp = THREE.MathUtils.clamp;
const UP = new THREE.Vector3(0, 1, 0);
const DOWN = new THREE.Vector3(0, -1, 0);

export const HANDPLANT = Object.freeze({
  lateGrace: 0.08,     // Grab pressed this long after leaving the coping still plants
  maxNormalY: 0.7,     // near-vertical copings only (vert ramps, bowls)
  plantTime: 0.22,     // swing up into the invert
  releaseTime: 0.3,    // push off, turn 180 and come back down
  maxHold: 6,
  lean: 0.5,           // body lean (rad) at the edge of the balance meter
  bodyAngle: Math.PI / 2 + 0.26, // balanced: head hangs a little over the ramp side
  difficulty: 1.7,
  difficultyGrowth: 0.2, // per second held: long plants get harder
  wobble: 0.35,          // a shove to the balance about once a second
  bonusFrom: 1,          // clean releases after this many seconds earn a hold bonus
  bonusScale: 40,        // bonus = scale × seconds^1.7 (≈130 at 2 s, 260 at 3 s)
  exitHeight: 0.4,     // where the board is when the rider lets go
  exitInward: 0.36,
  exitUp: 2.3,         // small pop off the coping: the trick window
  exitIn: 0.55,
  rejoin: 0.16,        // feet still finding the board: touching down now bails
});

/** Bonus points for a clean release after holding `seconds` upside down. */
export function handplantHoldBonus(seconds) {
  if (!(seconds >= HANDPLANT.bonusFrom)) return 0;
  return Math.round(HANDPLANT.bonusScale * seconds ** 1.7);
}

const smooth = t => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
const stripAirTricks = events => ({ ...events, flip: null, flipUpgrade: null, grab: null, grind: null, grindChange: null, manual: null, flatland: null });

/**
 * Hand plants (2026-11). Hold Grab through a vert coping: the rider plants a
 * hand on the coping, swings upside down over it and balances (Up/Down) until
 * Grab is released. Letting go pushes off with a 180° turn into a short return
 * flight, where flips, grabs and spins still work. Losing balance bails onto
 * the deck or back into the ramp.
 *
 * While planted the rider is held kinematically at the coping; the return
 * flight reuses the takeoff's vert frame, so landing uses the normal rules.
 */
export class HandplantSkillStreetPhysics extends StatefulSkillStreetPhysics {
  reset(position, heading) {
    super.reset(position, heading);
    this.handplant = null;
    this.handplantRejoin = 0;
    this.plantGrabHeld = false;
    this.plantGrabFromGround = false;
    this.plantDirection = 'none';
  }

  handplantEligible() {
    const air = this.transitionAir, frame = air?.frame;
    if (!air || !frame?.lipPoint || !frame.rampInward || this.grounded) return false;
    if (air.transferring || air.exitRequested || air.supportsVert === false) return false;
    if (Math.abs(frame.surfaceNormal?.y ?? 1) > HANDPLANT.maxNormalY) return false;
    return !(this.handplant || this.flipState || this.grind || this.wallRide || this.bailTime > 0);
  }

  step(dt, input = {}) {
    const held = Boolean(input.grabHeld);
    // Grab must already be held on the way up (or pressed right at the lip).
    if (held && !this.plantGrabHeld) this.plantGrabFromGround = this.grounded;
    if (!held) this.plantGrabFromGround = false;
    this.plantGrabHeld = held;
    this.plantDirection = directionKey(input.steer, input.drive);
    if (this.handplant) { this.stepHandplant(dt, input); return; }
    this.handplantRejoin = Math.max(0, this.handplantRejoin - dt);
    super.step(dt, input);
  }

  takeoff(impulse = 0, transition = null) {
    const result = super.takeoff(impulse, transition);
    if (result !== false && this.plantGrabHeld && this.plantGrabFromGround && this.handplantEligible()) this.beginHandplant();
    return result;
  }

  handleEvents(events) {
    if (this.handplant) events = stripAirTricks(events);
    else if (events.grab && this.airTime <= HANDPLANT.lateGrace && this.handplantEligible()) {
      // A Grab pressed right at the lip becomes the plant instead of a grab.
      this.beginHandplant();
      events = stripAirTricks(events);
    }
    super.handleEvents(events);
  }

  land(support) {
    if (this.handplantRejoin > 0 && !this.grounded) {
      this.bail('BAIL · feet not back on the board');
      return true;
    }
    return super.land(support);
  }

  balanceMode() {
    return this.handplant && this.handplant.phase !== 'release' ? 'HANDPLANT' : super.balanceMode();
  }

  balanceValue() {
    return this.handplant ? this.handplant.balance : super.balanceValue();
  }

  beginHandplant() {
    const air = this.transitionAir, frame = air.frame;
    const inward = frame.rampInward.clone().setY(0).normalize();
    const facing = (frame.takeoffFacing || frame.boardForward || this.forward).clone().setY(0);
    const variant = handplantFor(this.plantDirection);
    const swing = clamp(this.velocity.y / 1.1, 3.5, 9);
    const balanceState = createBalanceState(0.4 + ((this.tricks?.time || 0) * 2.3) % 5);
    // A fast entry swings over harder and starts shakier.
    disturbBalance(balanceState, clamp((swing - 5) / 6, 0, 0.6));
    this.handplant = {
      phase: 'plant', time: 0, holdTime: 0, nextWobble: 0.7, air, frame, variant,
      inward,
      axis: inward.clone().cross(DOWN).normalize(),
      hand: frame.lipPoint.clone().addScaledVector(UP, 0.09),
      noseUp: facing.dot(frame.deckOutward || inward.clone().negate()) >= 0 ? 1 : -1,
      origin: this.position.clone(),
      angle: 0, angularVelocity: swing, releaseAngle: 0,
      balanceState, balance: 0,
      scoreEntry: this.recordTrick(variant.name, variant.points),
      exit: null, releaseFrom: null,
    };
    this.velocity.set(0, 0, 0);
    this.grabState = null; this.flipState = null; this.pendingGrindTrick = null;
    if (this.tricks) { this.tricks.pendingAirGrab = null; this.tricks.pendingAirFlip = null; this.tricks.clearAirQueue(); }
    this.jumpBuffer = 0; this.charge = 0; this.vertJumpTimer = 0;
    this.emitGameplayEvent('handplant', { name: variant.name });
  }

  stepHandplant(dt, input) {
    const hp = this.handplant;
    hp.time += dt;
    this.feedbackTime = Math.max(0, this.feedbackTime - dt);
    this.respawnTimer = Math.max(0, (this.respawnTimer || 0) - dt);
    this.jumpBuffer = 0; this.charge = 0;
    this.velocity.set(0, 0, 0);
    if (hp.phase !== 'release' && hp.time > 0.06 && (!input.grabHeld || hp.holdTime >= HANDPLANT.maxHold)) this.releaseHandplant();

    if (hp.phase !== 'release') {
      // Spring the body toward upside down, leaning with the balance.
      const target = HANDPLANT.bodyAngle + hp.balance * HANDPLANT.lean;
      hp.angularVelocity += (70 * (target - hp.angle) - 11 * hp.angularVelocity) * dt;
      hp.angle += hp.angularVelocity * dt;
      if (hp.phase === 'plant' && hp.time >= HANDPLANT.plantTime) hp.phase = 'hold';
      if (hp.phase === 'hold') {
        hp.holdTime += dt;
        if (hp.holdTime >= hp.nextWobble) {
          disturbBalance(hp.balanceState, HANDPLANT.wobble);
          hp.nextWobble += 0.85 + ((hp.holdTime * 7.31) % 1) * 0.5;
        }
        const result = stepBalance(hp.balanceState, {
          dt, duration: hp.holdTime, rail: true,
          difficulty: HANDPLANT.difficulty * (1 + hp.holdTime * HANDPLANT.difficultyGrowth),
          correction: clamp(input.drive || 0, -1, 1),
        });
        hp.balance = result.value;
        this.tricks?.addDuration(hp.variant.holdRate * dt, hp.scoreEntry);
        if (result.failed) { this.failHandplant(); return; }
      }
      this.position.copy(hp.origin);
      return;
    }

    const e = smooth(hp.time / HANDPLANT.releaseTime);
    this.position.lerpVectors(hp.releaseFrom, hp.exit, e);
    if (hp.time >= HANDPLANT.releaseTime) this.finishHandplant();
  }

  releaseHandplant() {
    const hp = this.handplant;
    hp.phase = 'release';
    hp.time = 0;
    hp.releaseAngle = hp.angle;
    hp.releaseFrom = this.position.clone();
    hp.exit = hp.hand.clone().addScaledVector(hp.inward, HANDPLANT.exitInward).addScaledVector(UP, HANDPLANT.exitHeight);
    // A clean release after a long balance earns a hold bonus on the plant.
    const bonus = handplantHoldBonus(hp.holdTime);
    if (bonus > 0 && this.tricks) {
      this.tricks.addDuration(bonus, hp.scoreEntry);
      hp.bonus = bonus;
      this.feedback = `${hp.variant.name} · ${hp.holdTime.toFixed(1)}s HOLD +${bonus}`;
      this.feedbackTime = 2.2;
    }
    this.emitGameplayEvent('handplantRelease', { name: hp.variant.name, held: hp.holdTime });
  }

  finishHandplant() {
    const hp = this.handplant, air = hp.air, frame = air.frame;
    this.position.copy(hp.exit);
    this.velocity.copy(hp.inward).multiplyScalar(HANDPLANT.exitIn).addScaledVector(UP, HANDPLANT.exitUp);
    // An invert turns 180° over the hand and comes back in forward. Flip the
    // takeoff facing instead of adding air spin, so no extra "180" is scored
    // and the stance stays the same.
    this.airTakeoffFacing?.negate();
    if (Number.isFinite(this.airTakeoffHeading)) this.airTakeoffHeading += Math.PI;
    frame.takeoffFacing?.negate();
    frame.boardForward?.negate();
    if (Number.isFinite(frame.takeoffHeading)) frame.takeoffHeading += Math.PI;
    this.airHeading = Math.atan2(Math.sin(this.heading + Math.PI), Math.cos(this.heading + Math.PI));
    this.heading = this.airHeading;
    this.airSpin = 0;
    this.airDirection();
    air.apexPassed = true;
    air.mode = 'return';
    air.launchVertical = Math.max(HANDPLANT.exitUp, air.launchVertical || 0);
    this.transitionAir = air;
    this.airTime = 0.2;
    this.handplant = null;
    this.handplantRejoin = HANDPLANT.rejoin;
    this.setMovementState(MOVEMENT_STATE.VERT_AIR);
  }

  failHandplant() {
    const hp = this.handplant;
    // A bigger angle puts the feet over the deck, so that side falls onto the deck.
    const intoRamp = hp.balance < 0;
    const away = intoRamp ? hp.inward : hp.inward.clone().negate();
    this.position.copy(hp.hand).addScaledVector(UP, 0.6).addScaledVector(away, 0.25);
    this.velocity.copy(away).multiplyScalar(intoRamp ? 2.2 : 2.6).addScaledVector(UP, intoRamp ? 0.5 : 1);
    this.handplant = null;
    this.bail(intoRamp ? 'BAIL · fell back into the ramp' : 'BAIL · over the coping');
  }

  bail(message) {
    this.handplant = null;
    this.handplantRejoin = 0;
    super.bail(message);
  }
}
