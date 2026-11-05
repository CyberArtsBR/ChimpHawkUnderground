import * as THREE from 'three';
import { StreetPhysics, PHYSICS, MOVEMENT_STATE } from './StreetPhysics.js';
import { constrainToPark } from './ParkBoundaries.js';
import {
  GRIND_CAPTURE,
  advanceGrindSpeed,
  createBalanceState,
  disturbBalance,
  grindProfile,
  manualSupportOffsets,
  stepBalance,
} from './SkateSystems.js';
import { applyGrindEntry, resolveGrindCapture } from './core/GrindCaptureController.js';

const GRAVITY = new THREE.Vector3(0, -PHYSICS.gravity, 0);
const clamp = THREE.MathUtils.clamp;

function headingFrom(direction, fallback = 0) {
  const flat = direction.clone(); flat.y = 0;
  if (flat.lengthSq() < 1e-8) return fallback;
  flat.normalize();
  return Math.atan2(-flat.x, -flat.z);
}

function lerpAngle(a, b, t) {
  const delta = Math.atan2(Math.sin(b - a), Math.cos(b - a));
  return a + delta * t;
}

function smoothstep(t) {
  t = clamp(t, 0, 1);
  return t * t * (3 - 2 * t);
}

/**
 * Skill layer for grinds/manuals. It intentionally extends the validated base
 * physics so vert, park collision and existing trick behavior stay intact.
 */
export class SkillStreetPhysics extends StreetPhysics {
  reset(position = this.spawn, heading = 0) {
    super.reset(position, heading);
    this.manualBalance = 0;
    this.manualBalanceState = createBalanceState(0.72);
    this.manualTime = 0;
    this.manualInstability = 0;
    this.grindBalance = 0;
    this.grindBalanceState = createBalanceState(1.18);
    this.manualScoreEntry = null;
    this.lastFlatlandAt = -Infinity;
    this.grindReentryGuard = null;
  }

  balanceMode() {
    if (this.grind) return 'GRIND';
    if (this.manual === 'noseManual') return 'NOSE MANUAL';
    if (this.manual) return 'MANUAL';
    return '';
  }

  balanceValue() {
    if (this.grind) return this.grind.balance || 0;
    if (this.manual) return this.manualBalance || 0;
    return 0;
  }

  handleEvents(events) {
    const previousManual = this.manual;
    const previousGrind = this.grind?.trick?.name;
    // Every rail trick grants points, so do not permit stationary button spam
    // to manufacture a long combo. New tricks require actual rail travel.
    if (events.grindChange && this.grind) {
      const elapsed = this.grind.time - (this.grind.lastSwitchTime ?? 0);
      const travelled = this.grind.travelDistance == null
        ? Math.abs(this.grind.s - (this.grind.lastSwitchS ?? this.grind.s))
        : this.grind.travelDistance - (this.grind.lastSwitchTravel ?? 0);
      // First rail trick change is responsive; consecutive changes need more
      // distance and skill, even around a closed rail's wraparound.
      const minTravel = (this.grind.trickSwitchCount || 0) > 0 ? 0.9 : 0.55;
      if (elapsed < 0.26 || travelled < minTravel) {
        events = { ...events, grindChange: null };
      } else if (events.grindChange.name !== previousGrind) {
        this.grind.lastSwitchTime = this.grind.time;
        this.grind.lastSwitchS = this.grind.s;
        this.grind.lastSwitchTravel = this.grind.travelDistance ?? 0;
      }
    }
    if (events.flatland && this.manual && this.tricks
      && this.tricks.time - this.lastFlatlandAt < 0.65) {
      events = { ...events, flatland: null };
    }
    super.handleEvents(events);

    if (events.manual && this.manual && this.manual !== previousManual) {
      // Nose/tail changes are one continuous balancing challenge. Reinitializing
      // here let alternating manual sequences erase drift and restart assistance.
      // A genuinely new manual still receives the existing initial grace/seed.
      if (!previousManual) {
        this.manualBalanceState = createBalanceState(this.manual === 'noseManual' ? 2.05 : 0.72);
        this.manualBalance = 0;
        this.manualTime = 0;
        this.manualInstability = 0;
        this.lastFlatlandAt = -Infinity;
      }
      this.manualScoreEntry = this.tricks?.combo?.at(-1) || null;
      this.stableGroundTime = 0;
    }

    if (events.flatland && this.manual) {
      this.lastFlatlandAt = this.tricks?.time ?? 0;
      const amount = events.flatland.instability ?? 0.38;
      this.manualInstability = Math.min(1.4, this.manualInstability + amount);
      disturbBalance(this.manualBalanceState, amount);
    }

    if (events.grindChange && this.grind && previousGrind !== events.grindChange.name) {
      this.grind.profile = grindProfile(events.grindChange.name);
      this.grind.instability = Math.min(1.5, (this.grind.instability || 0) + 0.46);
      disturbBalance(this.grind.balanceState, 0.46);
      this.grind.contactClearanceTarget = this.grind.profile.clearance;
      this.grind.trickSwitchCount = (this.grind.trickSwitchCount || 0) + 1;
      this.grind.scoreEntry = this.tricks?.combo?.at(-1) || this.grind.scoreEntry;
    }
  }

  takeoff(impulse = 0, transition = null) {
    super.takeoff(impulse, transition);
    this.manualBalance = 0;
    this.manualTime = 0;
    this.manualInstability = 0;
    this.manualScoreEntry = null;
  }

  endManual({ bail = false } = {}) {
    if (!this.manual) return;
    if (bail) {
      this.bail('BAIL · manual balance lost');
      return;
    }
    this.manual = null;
    this.flatland = null;
    if (this.grounded) this.setMovementState(MOVEMENT_STATE.GROUND);
    this.manualBalance = 0;
    this.manualTime = 0;
    this.manualInstability = 0;
    this.manualBalanceState = createBalanceState(0.72);
    this.manualScoreEntry = null;
    this.stableGroundTime = 0;
  }

  manualSupport(kind = this.manual, rise = 0.18, drop = 0.28) {
    if (!kind) return null;
    const right = new THREE.Vector3().crossVectors(this.forward, this.normal);
    if (right.lengthSq() < 1e-8) right.set(1, 0, 0);
    right.normalize();
    const hits = [];
    for (const offset of manualSupportOffsets(kind)) {
      const probe = this.position.clone()
        .addScaledVector(this.forward, offset.longitudinal)
        .addScaledVector(right, offset.lateral);
      const hit = this.surface.ground(probe, rise, drop);
      if (hit) hits.push(hit);
    }
    if (!hits.length) return null;
    const point = new THREE.Vector3();
    const normal = new THREE.Vector3();
    for (const hit of hits) { point.add(hit.point); normal.add(hit.normal); }
    point.multiplyScalar(1 / hits.length);
    normal.multiplyScalar(1 / hits.length).normalize();
    return { point, normal, wheelCount: hits.length, support: kind === 'noseManual' ? 'frontTruck' : 'rearTruck' };
  }

  supportForState(rise = 0.12, drop = 0.2) {
    if (this.manual) return this.manualSupport(this.manual, Math.max(0.18, rise), Math.max(0.28, drop));
    return this.surface.ground(this.position, rise, drop);
  }

  resolveMotion(before, beforeUp, input = {}) {
    const result = this.surface.move(before, this.position, this.velocity, {
      fromUp: beforeUp, toUp: this.bodyUp(), grounded: this.grounded,
      forward: this.forward,
      ignoreRail: this.grind?.rail.name || null,
    });
    this.position.copy(result.position);
    const wall = result.contacts.find(hit => !hit.railId && Math.abs(hit.normal.y) < 0.3);
    if (wall && !this.grounded && !this.grind && !this.wallRide && this.contactCooldown <= 0) {
      if (input.olliePressed) this.wallPlant(wall, this.position.clone());
      else if (input.grindHeld) this.startWallRide(wall, this.position.clone());
    }
    if (this.grounded) {
      let support = this.supportForState(0.12, 0.2);
      if (!support && this.manual) {
        this.endManual();
        support = this.surface.ground(this.position, 0.12, 0.2);
      }
      if (support) {
        const sign = this.velocity.dot(this.forward) < 0 ? -1 : 1;
        const speed = this.velocity.length() * sign;
        const clippedTravel = this.velocity.clone().projectOnPlane(support.normal);

        // Collision may clip/slide world travel, but contact geometry never owns
        // horizontal board yaw. This lower compatibility layer follows the same
        // invariant as StableBoardContact so future inheritance changes cannot
        // resurrect the historical ~90-degree contact snap.
        this.position.y = support.point.y + 0.015;
        this.normal.copy(support.normal);
        this.groundDirection();
        if (result.contacts.length && clippedTravel.lengthSq() > 0.0004) {
          this.velocity.copy(clippedTravel);
        } else {
          this.velocity.copy(this.forward).multiplyScalar(speed);
        }
      } else this.takeoff();
    }
  }

  updateManualBalance(dt, input, speed) {
    if (!this.manual) return true;
    this.manualTime += dt;
    const info = this.tricks.manualInfo(this.manual) || { difficulty: 1, durationRate: 28 };
    this.manualInstability *= Math.exp(-2.5 * dt);
    if (this.manualInstability > 0.005) disturbBalance(this.manualBalanceState, this.manualInstability * dt * 1.7);
    const result = stepBalance(this.manualBalanceState, {
      dt,
      duration: this.manualTime,
      difficulty: info.difficulty || 1,
      speed: Math.abs(speed),
      comboDuration: this.tricks.comboDuration(),
      correction: clamp(input.drive || 0, -1, 1),
      steering: this.steer,
    });
    this.manualBalance = result.value;
    // Manual duration must reward rolling balance rather than stationary
    // button farming. Credit its manual score entry, not an intervening flatland.
    const motionQuality = clamp((Math.abs(speed) - 0.4) / 3.6, 0, 1);
    this.tricks.addDuration((info.durationRate || 28) * dt * motionQuality,
      this.manualScoreEntry || this.tricks.combo.at(-1));
    if (!result.failed) return true;
    const severe = Math.abs(result.value) + Math.abs(result.velocity) * 0.18 > 1.16;
    this.endManual({ bail: severe });
    return false;
  }

  stepGround(dt, input, drive) {
    let speed = this.velocity.dot(this.forward);
    if (this.manual) this.updateManualBalance(dt, input, speed);
    if (this.bailTime) return;

    const rate = THREE.MathUtils.lerp(2.7, 1.2, clamp(Math.abs(speed) / 12, 0, 1));
    this.heading -= this.steer * rate * (speed < -0.15 ? -1 : 1) * dt;
    this.groundDirection();
    speed += GRAVITY.dot(this.forward) * dt;

    const balanceDrive = Boolean(this.manual);
    if (!balanceDrive && drive > 0 && speed < PHYSICS.maxSpeed) speed += drive * PHYSICS.push * dt;
    const braking = input.brake || (!balanceDrive && drive < 0);
    const resistance = 0.26 + 0.012 * speed * speed + (braking ? PHYSICS.brake : 0);
    speed = Math.sign(speed) * Math.max(0, Math.abs(speed) - resistance * dt);
    speed = clamp(speed, -17, 17);
    this.velocity.copy(this.forward).multiplyScalar(speed);
    this.position.addScaledVector(this.velocity, dt);

    const transition = this.transitions.launchAt(this.position, this.normal, this.velocity);
    let support = this.supportForState(this.normal.y < 0.5 ? 0.32 : 0.12, 0.2);
    if (!support && this.manual) {
      this.endManual();
      support = this.surface.ground(this.position, this.normal.y < 0.5 ? 0.32 : 0.12, 0.2);
    }

    if (transition) {
      const vertBoost = this.vertJumpTimer > 0 ? this.vertJumpPending : 0;
      this.takeoff(vertBoost, transition);
    } else if (support && this.position.y - support.point.y < 0.2
      && (support.point.y - this.position.y < 0.12 || (this.normal.y < 0.5 && support.normal.dot(this.normal) > 0.9))) {
      this.position.y = support.point.y + 0.015;
      this.normal.copy(support.normal);
      this.groundDirection();
      this.velocity.copy(this.forward).multiplyScalar(speed);
      if (this.manual && Math.abs(speed) < 0.55) this.endManual();
    } else {
      const armedVert = this.vertJumpTimer > 0 ? this.transitions.approachAt(this.position, this.normal, this.velocity) : null;
      if (armedVert) this.takeoff(this.vertJumpPending, armedVert);
      else this.takeoff();
    }
  }

  enterGrind(trick) {
    let captured;
    if (this.coreController) captured = this.coreController.enterGrind(this, trick);
    else {
      const capture = resolveGrindCapture({
        position: this.position,
        forward: this.forward,
        velocity: this.velocity,
        railNetwork: this.railNetwork,
        trick,
      });
      captured = applyGrindEntry(this, capture, trick);
    }
    if (captured) {
      this.grabState = null;
      this.tricks.clearAirQueue();
    }
    return captured;
  }

  updateGrindBalance(dt, input) {
    const grind = this.grind;
    if (!grind) return true;
    grind.time += dt;
    grind.instability *= Math.exp(-2.5 * dt);
    if (grind.instability > 0.005) disturbBalance(grind.balanceState, grind.instability * dt * 1.8);
    const result = stepBalance(grind.balanceState, {
      dt,
      duration: grind.time,
      rail: true,
      difficulty: grind.profile.difficulty,
      speed: grind.speed,
      comboDuration: this.tricks.comboDuration(),
      correction: clamp(input.steer || 0, -1, 1),
      steering: input.drive || 0,
    });
    grind.balance = result.value;
    this.grindBalance = result.value;
    const motionQuality = clamp((Math.abs(grind.speed) - 0.8) / 3.2, 0, 1);
    this.tricks.addDuration(grind.profile.durationRate * dt * motionQuality,
      grind.scoreEntry || this.tricks.combo.at(-1));
    if (!result.failed) return true;
    this.bail('BAIL · grind balance lost');
    return false;
  }

  stepGrind(dt, input) {
    if (!this.grind) return;
    if (input.ollieReleased) { this.exitGrind(true); return; }
    if (!this.updateGrindBalance(dt, input) || !this.grind || this.bailTime) return;

    const current = this.railNetwork.sample(this.grind.rail, this.grind.s, { clearance: this.grind.contactClearance });
    if (!current) { this.exitGrind(false); return; }
    const currentTravel = current.tangent.clone().multiplyScalar(this.grind.direction);
    const gravityAlong = GRAVITY.dot(currentTravel);
    this.grind.speed = advanceGrindSpeed(this.grind.speed, gravityAlong, dt, input.brake);

    const railStep = this.grind.direction * this.grind.speed * dt;
    this.grind.s += railStep;
    this.grind.travelDistance = (this.grind.travelDistance || 0) + Math.abs(railStep);
    this.grind.contactClearance += (this.grind.contactClearanceTarget - this.grind.contactClearance) * (1 - Math.exp(-18 * dt));
    const sample = this.railNetwork.sample(this.grind.rail, this.grind.s, { clearance: this.grind.contactClearance });
    if (!sample) { this.exitGrind(false); return; }

    const before = this.position.clone();
    const beforeUp = this.bodyUp();
    const travel = sample.tangent.clone().multiplyScalar(this.grind.direction);
    this.velocity.copy(travel).multiplyScalar(this.grind.speed);

    this.grind.blendElapsed += dt;
    const blendT = smoothstep(this.grind.blendElapsed / this.grind.blendDuration);
    if (blendT < 1) {
      this.grind.blendPosition.addScaledVector(this.grind.incomingVelocity, dt);
      this.position.copy(this.grind.blendPosition).lerp(sample.point, blendT);
    } else this.position.copy(sample.point);

    const targetHeading = headingFrom(travel, this.heading);
    this.heading = blendT < 1 ? lerpAngle(this.grind.entryHeading, targetHeading, blendT) : targetHeading;
    this.airHeading = this.heading;
    this.airDirection();
    this.resolveMotion(before, beforeUp, input);
    // While captured, the rail owns support. Ground/coping collision correction
    // must not silently detach the board. Real collision/balance bails still win.
    if (this.grind && !this.bailTime && blendT >= 1) this.position.copy(sample.point);
    this.distance += this.position.distanceTo(before);
    this.stableGroundTime = 0;
  }

  exitGrind(pop) {
    if (!this.grind) return;
    const grind = this.grind;
    this.grindReentryGuard = { rail: grind.rail, position: this.position.clone() };
    const sample = this.railNetwork.sample(grind.rail, clamp(grind.s, 0, grind.rail.length), { clearance: grind.contactClearance });
    const tangent = sample?.tangent || this.forward.clone();
    const travel = tangent.clone().multiplyScalar(grind.direction);
    this.velocity.copy(travel).multiplyScalar(grind.speed);
    this.grind = null;
    this.grindBalance = 0;
    this.grindBalanceState = createBalanceState(1.18);
    this.contactCooldown = GRIND_CAPTURE.cooldown;
    this.grindIntentTime = 0;
    this.pendingGrindTrick = null;
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

  finishStep(dt) {
    if (this.recoverInvalidState()) return;
    this.finishAirborneTrickScoring();
    constrainToPark(this);
    if (this.grounded && !this.manual && !this.grind && !this.bailTime) {
      if (this.tricks.manualBridgePending()) this.stableGroundTime = 0;
      else {
        this.stableGroundTime += dt;
        if (this.stableGroundTime > 0.38 && this.tricks.combo.length) this.settleCombo();
      }
    } else this.stableGroundTime = 0;
  }

  bail(message) {
    super.bail(message);
    this.manualBalance = 0;
    this.manualTime = 0;
    this.manualInstability = 0;
    this.manualScoreEntry = null;
    this.grindBalance = 0;
    this.manualBalanceState = createBalanceState(0.72);
    this.grindBalanceState = createBalanceState(1.18);
  }
}
