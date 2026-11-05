import * as THREE from 'three';
import { ParkCollision } from './ParkCollision.js';
import { TransitionGuide } from './TransitionGuide.js';
import { RailNetwork } from './RailNetwork.js';
import { SkateTricks } from './SkateTricks.js';
import { directionKey, grindFor } from './TrickCatalog.js';
import { constrainToPark } from './ParkBoundaries.js';
import { flipTurns } from '../character/TrickMotion.js';
import { groundForwardFromHeading } from './core/GroundMotor.js';
import { nearbyFlatRespawn } from './SafeRespawn.js';

export const MOVEMENT_STATE = Object.freeze({
  GROUND: 'GROUND',
  AIR: 'AIR',
  VERT_AIR: 'VERT_AIR',
  GRIND: 'GRIND',
  MANUAL: 'MANUAL',
  WALLRIDE: 'WALLRIDE',
  BAIL: 'BAIL',
});

export const PHYSICS = Object.freeze({
  step: 1 / 120, push: 8.5, maxSpeed: 18, gravity: 21, brake: 16,
  minJump: 5.6, maxJump: 7.9, chargeTime: 0.24, coyoteTime: 0.09, jumpBuffer: 0.12,
  vertOllieBuffer: 0.9, maxLandingCorrection: 0.22,
});
const UP = new THREE.Vector3(0, 1, 0);
const GRAVITY = new THREE.Vector3(0, -PHYSICS.gravity, 0);
const clamp = THREE.MathUtils.clamp;

function headingFrom(direction, fallback = 0) {
  const flat = direction.clone(); flat.y = 0;
  if (flat.lengthSq() < 1e-8) return fallback;
  flat.normalize();
  return Math.atan2(-flat.x, -flat.z);
}

/** Metres, seconds, Y up, local -Z travel. Presentation never changes trajectory. */
export class StreetPhysics {
  constructor({ collision, spawn, rails = [], playableRegions = null }) {
    this.playableRegions = playableRegions;
    this.surface = new ParkCollision(collision);
    this.transitions = new TransitionGuide(rails);
    this.railNetwork = new RailNetwork(rails);
    this.tricks = new SkateTricks();
    this.spawn = new THREE.Vector3(...spawn);
    this.position = new THREE.Vector3();
    this.velocity = new THREE.Vector3();
    this.normal = UP.clone();
    this.forward = new THREE.Vector3(0, 0, -1);
    this.config = PHYSICS;
    this.reset();
  }

  setMovementState(next) {
    this.movementState = next;
    this.grounded = next === MOVEMENT_STATE.GROUND || next === MOVEMENT_STATE.MANUAL;
  }

  reset(position = this.spawn, heading = this.spawnHeading || 0) {
    this.position.copy(position);
    const support = this.surface.ground(this.position, 5, 10);
    if (support) this.position.copy(support.point).addScaledVector(UP, 0.015);
    this.normal.copy(support?.normal || UP);
    this.velocity.set(0, 0, 0);
    this.heading = heading;
    this.airHeading = heading;
    this.setMovementState(support ? MOVEMENT_STATE.GROUND : MOVEMENT_STATE.AIR);
    this.speed = 0; this.charge = 0; this.airSpin = 0;
    this.flipState = null; this.lastCaughtFlip = null; this.grabState = null; this.manual = null; this.flatland = null;
    this.grind = null; this.wallRide = null; this.stance = 1;
    this.airTime = 0; this.accumulator = 0; this.coyote = 0; this.jumpBuffer = 0; this.jumpCharge = 0;
    this.pendingStepInput = { olliePressed: false, grindPressed: false, directionTaps: [] };
    this.distance = 0; this.justLanded = false; this.steer = 0; this.bailTime = 0;
    this.respawnTimer = 0; this.bailDuration = 1.25;
    this.bailLaunchVelocity = null; this.bailSeverity = 0;
    this.score = 0; this.feedback = ''; this.feedbackTime = 0; this.stableGroundTime = 0;
    this.transitionAir = null; this.pendingGrindTrick = null;
    this.vertJumpPending = 0; this.vertJumpTimer = 0;
    this.pendingOllieScore = null;
    this.takeoffOllieRequested = null;
    this.contactCooldown = 0; this.grindIntentTime = 0;
    this.lastWheelSupport = null;
    this.tricks.reset();
    this.groundDirection();
  }

  /** Return the rider to spawn without restarting the surrounding round. */
  resetRider(position = this.spawn, heading = this.spawnHeading || 0) {
    const score = this.score, stance = this.stance, distance = this.distance;
    const respawnSerial = this.respawnSerial || 0;
    // Use the complete reset pipeline to discard an unfinished combo, buffered
    // tricks and visual interpolation. Only already-earned round state survives.
    this.reset(position, heading);
    this.score = score;
    this.stance = stance;
    this.airTakeoffStance = stance;
    this.distance = distance;
    this.respawnSerial = respawnSerial + 1;
    this.syncCanonicalState?.();
  }

  groundDirection() {
    this.forward.copy(groundForwardFromHeading({ heading: this.heading, normal: this.normal }));
  }

  airDirection() {
    this.forward.set(-Math.sin(this.heading), 0, -Math.cos(this.heading)).normalize();
  }

  bodyUp() {
    if (this.movementState === MOVEMENT_STATE.WALLRIDE && this.wallRide) return this.wallRide.normal.clone();
    if (this.grounded) return this.normal.clone();
    return this.movementState === MOVEMENT_STATE.VERT_AIR && this.transitionAir
      ? this.transitions.presentationNormal(this.transitionAir, this.velocity.y).clone() : UP.clone();
  }

  resolveMotion(before, beforeUp, input = {}) {
    const result = this.surface.move(before, this.position, this.velocity, {
      fromUp: beforeUp, toUp: this.bodyUp(), grounded: this.grounded,
      forward: this.forward,
      ignoreRail: this.grind?.rail.name || null,
    });
    this.position.copy(result.position);
    const wall = result.contacts.find(hit => !hit.railId && Math.abs(hit.normal.y) < 0.3);
    if (wall && !this.grounded && !this.grind && !this.wallRide && this.contactCooldown <= 0
      && this.movementState !== MOVEMENT_STATE.VERT_AIR) {
      if (input.olliePressed) this.wallPlant(wall, this.position.clone());
      else if (input.grindHeld) this.startWallRide(wall, this.position.clone());
    }
    if (this.grounded) {
      const support = this.surface.ground(this.position, 0.12, 0.2);
      if (support) {
        const sign = this.velocity.dot(this.forward) < 0 ? -1 : 1;
        const speed = this.velocity.length() * sign;
        const clippedTravel = this.velocity.clone().projectOnPlane(support.normal);
        this.position.y = support.point.y + 0.015;
        this.normal.copy(support.normal); this.groundDirection();
        if (result.contacts.length && clippedTravel.lengthSq() > 0.0004) {
          // Collision may redirect world-space travel, but it never rotates the
          // deck. Preserve the clipped slide vector instead of rewriting heading.
          this.velocity.copy(clippedTravel);
        } else {
          this.velocity.copy(this.forward).multiplyScalar(speed);
        }
      } else this.takeoff();
    }
  }

  releaseJump() {
    this.jumpBuffer = PHYSICS.jumpBuffer;
    this.jumpCharge = Math.max(this.charge, 0.05);
    this.charge = 0;
  }

  // Rail and wall departures bypass takeoff(). Capture their own airborne basis
  // so a previous ramp's heading/spin cannot leak into the next flight.
  captureAirDeparture() {
    this.airHeading = this.heading;
    this.airTakeoffHeading = this.heading;
    this.airSpin = 0;
    this.airTime = 0;
    this.airTurnHoldTime = 0;
    this.airTurnDirection = 0;
    this.airTakeoffFacing ||= new THREE.Vector3();
    this.airTakeoffFacing.set(-Math.sin(this.heading), 0, -Math.cos(this.heading));
    this.airTakeoffStance = this.stance;
    this.airTakeoffFromRamp = false;
    this.pendingOllieScore = null;
    this.stableGroundTime = 0;
    this.jumpBuffer = 0;
    this.coyote = 0;
    this.airDirection();
  }

  takeoff(impulse = 0, transition = null) {
    const onSurface = this.grounded;
    this.manual = null;
    this.flatland = null;
    let edge = null;
    if (onSurface) edge = transition || this.transitions.launchAt(this.position, this.normal, this.velocity);

    if (edge) {
      this.transitionAir = this.transitions.begin(this.position, this.velocity, edge, {
        boardForward: this.forward,
        launchBoost: impulse,
      });
      this.setMovementState(MOVEMENT_STATE.VERT_AIR);
    } else {
      this.transitionAir = null;
      this.velocity.y += impulse;
      this.setMovementState(MOVEMENT_STATE.AIR);
    }

    this.airSpin = 0; this.airTime = 0; this.grabState = null;
    this.jumpBuffer = 0; this.coyote = impulse || this.transitionAir ? 0 : PHYSICS.coyoteTime;
    this.airHeading = this.heading;
    this.stableGroundTime = 0;
    this.vertJumpPending = 0; this.vertJumpTimer = 0;
    // Ramp energy is not an Ollie. Award a requested jump only after separation.
    this.pendingOllieScore = (this.takeoffOllieRequested ?? (impulse > 0.1))
      ? { origin: this.position.clone(), normal: this.normal.clone() } : null;
  }

  recordTrick(name, points) {
    const entry = this.tricks.record(name, points, { stance: this.stance });
    this.feedback = this.tricks.comboText();
    this.feedbackTime = 2.2;
    return entry;
  }

  settleCombo() {
    const result = this.tricks.settle();
    if (!result) return;
    this.score += result.points;
    this.feedback = `${result.names} · +${result.points}`;
    this.feedbackTime = 3.2;
  }

  handleEvents(events) {
    if (events.switchStance) {
      this.stance *= -1;
      this.feedback = this.stance < 0 ? 'Switch Stance' : 'Regular Stance';
      this.feedbackTime = 1;
    }
    if (events.manual && events.manual !== this.manual && this.grounded && !this.grind && !this.bailTime) {
      this.manual = events.manual;
      this.flatland = null;
      this.setMovementState(MOVEMENT_STATE.MANUAL);
      const info = this.tricks.manualInfo(events.manual);
      this.recordTrick(info?.name || 'Manual', info?.points || 100);
      this.stableGroundTime = 0;
    }
    if (events.flatland && events.flatland.name !== this.flatland && this.manual) {
      this.flatland = events.flatland.name;
      this.recordTrick(events.flatland.name, events.flatland.points);
    }
    if (events.flipUpgrade && this.flipState && !this.grounded && !this.grind && !this.wallRide) {
      const rotationFrom = flipTurns(this.flipState);
      const rotationStartProgress = this.flipState.progress;
      Object.assign(this.flipState, events.flipUpgrade, { rotationFrom, rotationStartProgress });
      this.tricks.upgrade(this.flipState.scoreEntry, events.flipUpgrade.name, events.flipUpgrade.points);
      this.feedback = this.tricks.comboText();
      this.feedbackTime = 2.2;
    }
    if (events.flip && !this.flipState && !this.grounded && !this.grind && !this.wallRide) {
      this.grabState = null;
      this.flipState = { ...events.flip, progress: 0 };
      this.flipState.scoreEntry = this.recordTrick(events.flip.name, events.flip.points);
    }
    if (events.grab && !this.flipState && !this.grounded && !this.grind && !this.wallRide) {
      this.grabState = { ...events.grab, heldTime: 0 };
      this.grabState.scoreEntry = this.tricks.recordAirGrab(events.grab.name, events.grab.points,{stance:this.stance});
      this.feedback=this.tricks.comboText();this.feedbackTime=2.2;
    }
    if (events.grind && !this.grounded && !this.grind) {
      this.pendingGrindTrick = events.grind; this.grindIntentTime = 0.18;
    }
    if (events.grindChange && this.grind && events.grindChange.name !== this.grind.trick.name) {
      this.grind.trick = events.grindChange;
      this.recordTrick(events.grindChange.name, events.grindChange.points);
    }
  }

  advance(delta, input = {}) {
    if (input.reset) { this.resetRider(); return; }
    if (this.recoverInvalidState()) return;
    this.tricks.tick(delta);
    const context = {
      grounded: this.grounded, grinding: this.movementState === MOVEMENT_STATE.GRIND,
      manual: this.movementState === MOVEMENT_STATE.MANUAL ? this.manual : null,
      speed: Math.abs(this.speed), airborne: !this.grounded, bailing: this.bailTime > 0,
      wallRiding: Boolean(this.wallRide), flipState: this.flipState, grabState: this.grabState,
      grindName: this.grind?.trick?.name, flatland: this.flatland,
    };
    this.handleEvents(this.tricks.resolve(input, context));
    if (input.grindHeld && !this.grind && !this.bailTime) {
      this.pendingGrindTrick ||= { ...grindFor(directionKey(input.steer, input.drive)) };
      this.grindIntentTime = 0.18;
    }

    if (input.ollieReleased && !this.bailTime) {
      if (this.grind) this.exitGrind(true);
      else this.releaseJump();
    }
    if (!input.grabHeld && this.grabState) this.grabState = null;

    this.justLanded = false;
    // Retain edges until a simulation step actually consumes them (high-refresh displays).
    this.pendingStepInput.olliePressed ||= Boolean(input.olliePressed && !this.bailTime);
    this.pendingStepInput.grindPressed ||= Boolean(input.grindPressed && !this.bailTime);
    if (!this.bailTime) this.pendingStepInput.directionTaps = [...new Set([
      ...this.pendingStepInput.directionTaps, ...(input.directionTaps || []),
    ])];
    this.accumulator += clamp(delta, 0, 0.2);
    let firstStep = true;
    while (this.accumulator + 1e-9 >= PHYSICS.step) {
      this.step(PHYSICS.step, {
        ...input,
        olliePressed: firstStep && this.pendingStepInput.olliePressed,
        grindPressed: firstStep && this.pendingStepInput.grindPressed,
        directionTaps: firstStep ? this.pendingStepInput.directionTaps : [],
      });
      if (firstStep) this.pendingStepInput = { olliePressed: false, grindPressed: false, directionTaps: [] };
      firstStep = false;
      this.accumulator = Math.max(0, this.accumulator - PHYSICS.step);
    }
    if (this.grounded || this.grind || this.wallRide || this.bailTime) this.tricks.clearAirQueue();
    this.speed = this.grind ? this.grind.speed : this.grounded ? this.velocity.dot(this.forward) : Math.hypot(this.velocity.x, this.velocity.z);
  }

  step(dt, input) {
    if (this.grounded || this.grind || this.wallRide) this.tricks.clearAirQueue();
    const drive = clamp(input.drive || 0, -1, 1);
    const steer = clamp(input.steer || 0, -1, 1);
    this.steer += (steer - this.steer) * (1 - Math.exp(-12 * dt));
    this.feedbackTime = Math.max(0, this.feedbackTime - dt);

    if (this.movementState === MOVEMENT_STATE.BAIL || this.bailTime > 0) {
      this.bailTime -= dt;
      this.bailVelocity ||= new THREE.Vector3();
      this.bailVelocity.y -= PHYSICS.gravity * dt;
      const next = this.position.clone().addScaledVector(this.bailVelocity, dt);
      const hitPoint = new THREE.Vector3(), hitNormal = new THREE.Vector3();
      const crossed = this.surface.sweepRideable(this.position, next, hitPoint, hitNormal);
      if (crossed) {
        next.copy(hitPoint).addScaledVector(hitNormal, .018);
        const into = this.bailVelocity.dot(hitNormal);
        if (into < 0) this.bailVelocity.addScaledVector(hitNormal, -into);
        this.bailVelocity.multiplyScalar(Math.exp(-5 * dt));
      }
      const support = this.surface.ground(next, 0.3, Math.max(0.4, this.position.y - next.y + 0.2));
      if (!crossed && support && next.y <= support.point.y + 0.015) {
        next.y = support.point.y + 0.015; this.bailVelocity.y = 0;
        this.bailVelocity.x *= Math.exp(-5 * dt); this.bailVelocity.z *= Math.exp(-5 * dt);
      }
      this.position.copy(this.surface.move(this.position, next, this.bailVelocity, { grounded: false }).position);
      if (this.bailTime <= 0) {
        const score = this.score, heading = this.heading, stance = this.stance;
        const safe = nearbyFlatRespawn(this);
        this.reset(safe, heading); this.score = score; this.stance = stance;
        this.respawnTimer = 1.8; this.contactCooldown = 0.6;
        this.respawnSerial = (this.respawnSerial || 0) + 1;
      }
      return;
    }
    this.respawnTimer = Math.max(0, (this.respawnTimer || 0) - dt);

    if (this.grabState && input.grabHeld && !this.grounded && !this.flipState && !this.grind && !this.wallRide) {
      this.grabState.heldTime += dt;
      const rate = Math.max(45, this.grabState.points * 0.35);
      this.tricks.addDuration(rate * dt, this.grabState.scoreEntry);
    }

    if (input.ollieHeld) this.charge = Math.min(1, this.charge + dt / PHYSICS.chargeTime);
    this.jumpBuffer = Math.max(0, this.jumpBuffer - dt);
    this.coyote = Math.max(0, this.coyote - dt);
    this.contactCooldown = Math.max(0, this.contactCooldown - dt);
    this.grindIntentTime = Math.max(0, this.grindIntentTime - dt);
    if (!this.grindIntentTime) this.pendingGrindTrick = null;
    this.vertJumpTimer = Math.max(0, this.vertJumpTimer - dt);
    if (this.vertJumpTimer <= 0) this.vertJumpPending = 0;

    if (this.movementState === MOVEMENT_STATE.GRIND && this.grind) {
      this.stepGrind(dt, input, drive);
      this.finishStep(dt);
      return;
    }
    if (this.movementState === MOVEMENT_STATE.WALLRIDE && this.wallRide) {
      this.stepWallRide(dt, input);
      this.finishStep(dt);
      return;
    }

    if ((this.grounded || this.coyote > 0) && this.jumpBuffer > 0) {
      const impulse = THREE.MathUtils.lerp(PHYSICS.minJump, PHYSICS.maxJump, this.jumpCharge);
      const vertApproach = this.grounded ? this.transitions.approachAt(this.position, this.normal, this.velocity) : null;
      if (vertApproach) {
        this.vertJumpPending = Math.max(this.vertJumpPending, impulse);
        this.vertJumpTimer = PHYSICS.vertOllieBuffer;
        this.jumpBuffer = 0;
      } else {
        this.takeoff(impulse);
      }
    }

    const before = this.position.clone();
    const beforeUp = this.bodyUp();
    if (this.grounded) this.stepGround(dt, input, drive);
    else this.stepAir(dt, input, drive, before);

    if (!this.bailTime) this.resolveMotion(before, beforeUp, input);

    this.distance += this.position.distanceTo(before);
    this.finishStep(dt);
  }

  stepGround(dt, input, drive) {
    let speed = this.velocity.dot(this.forward);
    const rate = THREE.MathUtils.lerp(2.7, 1.2, clamp(Math.abs(speed) / 12, 0, 1));
    this.heading -= this.steer * rate * (speed < -0.15 ? -1 : 1) * dt;
    this.groundDirection();
    speed += GRAVITY.dot(this.forward) * dt;
    if (drive > 0 && speed < PHYSICS.maxSpeed) speed += drive * PHYSICS.push * dt;
    const resistance = 0.26 + 0.012 * speed * speed + ((input.brake || drive < 0) ? PHYSICS.brake : 0);
    speed = Math.sign(speed) * Math.max(0, Math.abs(speed) - resistance * dt);
    speed = clamp(speed, -17, 17);
    this.velocity.copy(this.forward).multiplyScalar(speed);
    this.position.addScaledVector(this.velocity, dt);

    const transition = this.transitions.launchAt(this.position, this.normal, this.velocity);
    // Do not snap upward onto a stair/ledge simply because a high ray sees it.
    const support = this.surface.ground(this.position, this.normal.y < 0.5 ? 0.32 : 0.12, 0.2);
    if (transition) {
      const vertBoost = this.vertJumpTimer > 0 ? this.vertJumpPending : 0;
      this.takeoff(vertBoost, transition);
    } else if (support && this.position.y - support.point.y < 0.2
      && (support.point.y - this.position.y < 0.12 || (this.normal.y < 0.5 && support.normal.dot(this.normal) > 0.9))) {
      this.position.y = support.point.y + 0.015;
      this.normal.copy(support.normal);
      this.groundDirection();
      this.velocity.copy(this.forward).multiplyScalar(speed);
      if (this.manual && Math.abs(speed) < 0.55) {
        this.manual = null; this.flatland = null; this.setMovementState(MOVEMENT_STATE.GROUND);
      }
    } else {
      const armedVert = this.vertJumpTimer > 0 ? this.transitions.approachAt(this.position, this.normal, this.velocity) : null;
      if (armedVert) this.takeoff(this.vertJumpPending, armedVert);
      else this.takeoff();
    }
  }

  stepAir(dt, input, drive, before) {
    this.airTime += dt;
    const airTurn = clamp(this.steer + clamp(input.spin || 0, -1, 1), -1.65, 1.65);
    this.airSpin -= airTurn * 3.8 * dt;
    this.heading = this.airHeading + this.airSpin;
    this.airDirection();
    this.velocity.y -= PHYSICS.gravity * dt;
    if (this.movementState === MOVEMENT_STATE.VERT_AIR && this.transitionAir) {
      this.transitions.advance(this.transitionAir, this.position, this.velocity, input, dt);
    }
    this.position.addScaledVector(this.velocity, dt);

    if (this.flipState) {
      this.flipState.progress += dt / this.flipState.duration;
      if (this.flipState.progress >= 1) this.flipState = null;
    }

    if (this.pendingGrindTrick && this.contactCooldown <= 0 && !this.flipState) {
      if (this.enterGrind(this.pendingGrindTrick)) { this.pendingGrindTrick = null; return; }
    }

    // Broad sweep finds the transition, then all four wheels confirm final support.
    const support = this.surface.boardLanding(before, this.position, this.forward);
    if (support) this.land(support);
  }

  land(support) {
    if ((support.wheelCount || 0) < 2 || !support.frontSupported || !support.rearSupported) return false;
    const target = support.point.clone().addScaledVector(support.normal, 0.018);
    const correction = target.clone().sub(this.position);
    if (correction.length() > PHYSICS.maxLandingCorrection) return false;

    const boardForward = this.forward.clone().projectOnPlane(support.normal);
    const planar = this.velocity.clone().projectOnPlane(support.normal);
    if (boardForward.lengthSq() < 1e-7 || planar.lengthSq() < 1e-7) return false;
    boardForward.normalize();
    const transitionTangent = planar.clone().normalize();
    const alignment = boardForward.dot(transitionTangent);
    const unfinishedFlip = this.flipState && this.flipState.progress > 0.12 && this.flipState.progress < 0.88;
    if (Math.abs(alignment) < 0.44 || unfinishedFlip) {
      this.bail('BAIL · align your board before landing');
      return false;
    }

    // The sweep already crossed the surface; apply only the small measured contact correction.
    this.position.add(correction);
    this.normal.copy(support.normal);
    // Contact normal may tilt pitch/roll but cannot create horizontal yaw.
    this.groundDirection();

    const spin = Math.floor((Math.abs(this.airSpin) * 180 / Math.PI + 25) / 180) * 180;
    if (spin >= 180) this.recordTrick(`${spin}°`, spin);
    this.setMovementState(MOVEMENT_STATE.GROUND);
    this.coyote = 0;
    this.justLanded = true;
    this.transitionAir = null;
    this.wallRide = null;
    this.lastWheelSupport = {
      wheelCount: support.wheelCount,
      frontSupported: support.frontSupported,
      rearSupported: support.rearSupported,
      maxWheelGap: support.maxWheelGap,
      correction: correction.length(),
    };
    this.velocity.copy(this.forward).multiplyScalar(planar.length() * Math.sign(alignment || 1));
    this.flipState = null;
    this.grabState = null;
    this.airSpin = 0;
    this.stableGroundTime = 0;
    return true;
  }

  enterGrind(trick) {
    const capture = this.railNetwork.capture(this.position, this.velocity, 0.42, this.forward);
    if (!capture) return false;
    const sample = this.railNetwork.sample(capture.rail, capture.s);
    if (!sample) return false;
    this.grind = { ...capture, trick, speed: Math.max(2.8, capture.speed) };
    this.setMovementState(MOVEMENT_STATE.GRIND);
    this.manual = null; this.flatland = null; this.transitionAir = null; this.wallRide = null;
    this.grabState = null;
    this.tricks.clearAirQueue();
    this.position.copy(sample.point);
    const travel = sample.tangent.multiplyScalar(this.grind.direction);
    this.velocity.copy(travel).multiplyScalar(this.grind.speed);
    this.heading = headingFrom(travel, this.heading);
    this.airHeading = this.heading;
    this.recordTrick(trick.name, trick.points);
    return true;
  }

  stepGrind(dt, input, drive) {
    if (!this.grind) return;
    if (input.ollieReleased) { this.exitGrind(true); return; }
    this.grind.speed = clamp(this.grind.speed + Math.max(0, drive) * 1.1 * dt - 0.65 * dt, 2.2, 16);
    this.grind.s += this.grind.direction * this.grind.speed * dt;
    const sample = this.railNetwork.sample(this.grind.rail, this.grind.s);
    if (!sample) { this.exitGrind(false); return; }
    const before = this.position.clone();
    const beforeUp = this.bodyUp();
    this.position.copy(sample.point);
    const travel = sample.tangent.multiplyScalar(this.grind.direction);
    this.velocity.copy(travel).multiplyScalar(this.grind.speed);
    this.heading = headingFrom(travel, this.heading);
    this.airHeading = this.heading;
    this.airDirection();
    this.resolveMotion(before, beforeUp, input);
    if (this.position.distanceTo(sample.point) > 0.16) this.exitGrind(false);
    this.distance += this.position.distanceTo(before);
    this.stableGroundTime = 0;
  }

  exitGrind(pop) {
    if (!this.grind) return;
    const sample = this.railNetwork.sample(this.grind.rail, clamp(this.grind.s, 0, this.grind.rail.length));
    const tangent = sample?.tangent || this.forward.clone();
    const travel = tangent.multiplyScalar(this.grind.direction);
    this.velocity.copy(travel).multiplyScalar(this.grind.speed);
    this.grind = null;
    this.contactCooldown = 0.25; this.grindIntentTime = 0; this.pendingGrindTrick = null;
    this.setMovementState(MOVEMENT_STATE.AIR);
    this.transitionAir = null;
    this.airHeading = headingFrom(travel, this.heading);
    this.heading = this.airHeading;
    this.captureAirDeparture();
    if (pop) {
      const impulse = THREE.MathUtils.lerp(PHYSICS.minJump * 0.72, PHYSICS.maxJump * 0.82, Math.max(this.charge, 0.15));
      this.velocity.y += impulse;
      this.charge = 0;
      this.recordTrick('Ollie Out', 75);
    } else this.velocity.y += 0.25;
  }

  startWallRide(wall, before) {
    const tangent = this.velocity.clone().projectOnPlane(wall.normal);
    if (tangent.lengthSq() < 2) return;
    this.position.copy(before);
    this.contactCooldown = 0.2;
    tangent.y = Math.max(tangent.y, 1.2);
    this.velocity.copy(tangent);
    this.wallRide = { normal: wall.normal.clone(), time: 0, duration: 0.95 };
    this.transitionAir = null;
    this.setMovementState(MOVEMENT_STATE.WALLRIDE);
    this.heading = headingFrom(tangent, this.heading);
    this.airHeading = this.heading;
    this.recordTrick('Wall Ride', 250);
  }

  stepWallRide(dt, input) {
    if (!this.wallRide) return;
    if (input.olliePressed) {
      const normal = this.wallRide.normal.clone();
      this.velocity.projectOnPlane(normal).addScaledVector(normal, 4.2);
      this.velocity.y = Math.max(this.velocity.y, 4.8);
      this.wallRide = null;
      this.setMovementState(MOVEMENT_STATE.AIR);
      this.contactCooldown = 0.3;
      this.airHeading = headingFrom(this.velocity, this.heading);
      this.heading = this.airHeading;
      this.captureAirDeparture();
      this.recordTrick('Wallie', 300);
      return;
    }

    this.wallRide.time += dt;
    const normal = this.wallRide.normal;
    this.velocity.projectOnPlane(normal);
    this.velocity.y -= PHYSICS.gravity * 0.34 * dt;
    const candidate = this.position.clone().addScaledVector(this.velocity, dt);
    const floor = this.surface.boardLanding(this.position, candidate, this.forward);
    if (floor) { this.land(floor); this.contactCooldown = 0.3; return; }
    const contact = this.surface.wallContact(candidate, normal, 0.62);
    if (!contact || this.wallRide.time > this.wallRide.duration) {
      this.wallRide = null;
      this.setMovementState(MOVEMENT_STATE.AIR);
      this.contactCooldown = 0.3;
      this.captureAirDeparture();
      return;
    }
    const before = this.position.clone();
    this.position.copy(candidate);
    this.position.x = contact.point.x + normal.x * 0.13;
    this.position.z = contact.point.z + normal.z * 0.13;
    this.heading = headingFrom(this.velocity, this.heading);
    this.airHeading = this.heading;
    this.airDirection();
    this.resolveMotion(before, normal, input);
    this.stableGroundTime = 0;
  }

  wallPlant(wall, before) {
    this.position.copy(before);
    this.contactCooldown = 0.3;
    const incoming = Math.min(0, this.velocity.dot(wall.normal));
    this.velocity.addScaledVector(wall.normal, Math.max(4.3, -incoming * 1.8));
    this.velocity.y = Math.max(4.6, Math.abs(this.velocity.y) * 0.45 + 3.2);
    this.transitionAir = null;
    this.wallRide = null;
    this.setMovementState(MOVEMENT_STATE.AIR);
    this.airHeading = headingFrom(this.velocity, this.heading);
    this.heading = this.airHeading;
    this.captureAirDeparture();
    this.recordTrick('Wall Plant', 300);
  }

  finishAirborneTrickScoring() {
    if (this.pendingOllieScore) {
      const jump = this.pendingOllieScore;
      if (!this.grounded && !this.bailTime && this.airTime >= 0.10
        && this.position.clone().sub(jump.origin).dot(jump.normal) >= 0.12) {
        this.pendingOllieScore = null;
        this.recordTrick('Ollie', 50);
      } else if (this.grounded || this.bailTime || this.grind) this.pendingOllieScore = null;
    }
  }

  recoverInvalidState() {
    const finite = Number.isFinite(this.position.lengthSq()) && Number.isFinite(this.velocity.lengthSq()) && Number.isFinite(this.heading);
    if (this.position.y >= -6 && finite) return false;
    const score = Number.isFinite(this.score) ? this.score : 0;
    this.reset();
    this.score = score;
    return true;
  }

  finishStep(dt) {
    if (this.recoverInvalidState()) return;
    this.finishAirborneTrickScoring();
    constrainToPark(this);
    if (this.grounded && !this.manual && !this.grind && !this.bailTime) {
      this.stableGroundTime += dt;
      if (this.stableGroundTime > 0.38 && this.tricks.combo.length) this.settleCombo();
    } else this.stableGroundTime = 0;
  }

  bail(message) {
    if (this.bailTime > 0 || this.respawnTimer > 0) return;
    const impactSpeed = this.velocity.length();
    this.bailSeverity = clamp((impactSpeed - 2) / 16, .08, 1);
    this.bailVelocity = this.velocity.clone().clampLength(0, 10);
    this.bailLaunchVelocity = this.bailVelocity.clone();
    this.velocity.set(0, 0, 0);
    this.bailDuration = 1.35 + .55 * this.bailSeverity;
    this.bailTime = this.bailDuration;
    this.flipState = null; this.grabState = null;
    this.transitionAir = null; this.grind = null; this.wallRide = null; this.manual = null; this.flatland = null;
    this.setMovementState(MOVEMENT_STATE.BAIL);
    this.tricks.cancelCombo();
    this.pendingOllieScore = null;
    this.jumpBuffer = 0; this.charge = 0; this.vertJumpTimer = 0;
    this.pumpReleaseQueued = false; this.pumpHoldTime = 0;
    this.pendingStepInput = { olliePressed: false, grindPressed: false, directionTaps: [] };
    this.feedback = message; this.feedbackTime = 2;
  }
}
