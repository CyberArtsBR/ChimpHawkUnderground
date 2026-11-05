import * as THREE from 'three';
import { SkillStreetPhysics } from './SkillStreetPhysics.js';
import { MOVEMENT_STATE, PHYSICS } from './StreetPhysics.js';
import { SkateboardContactRig, PRODUCTION_BOARD_CONTACT_RIG } from './SkateboardContactRig.js';

const UP = new THREE.Vector3(0, 1, 0);
const clamp = THREE.MathUtils.clamp;

function headingFrom(direction, fallback = 0) {
  const x = direction.x, z = direction.z;
  if (x * x + z * z < 1e-8) return fallback;
  return Math.atan2(-x, -z);
}

/**
 * Integrates the six-point skateboard contact rig under the existing skill layer.
 * Rider/body collision remains a separate capsule; all rideable-terrain support,
 * landing orientation and deck clearance are owned by SkateboardContactRig.
 */
export class BoardContactSkillStreetPhysics extends SkillStreetPhysics {
  ensureBoardContact() {
    if (!this.boardContact) {
      this.boardContact = new SkateboardContactRig(this.surface, PRODUCTION_BOARD_CONTACT_RIG);
      this.contactRig = this.boardContact.rig;
    }
    if (!this._boardMoveStart) this._boardMoveStart = new THREE.Vector3();
    return this.boardContact;
  }

  reset(position = this.spawn, heading = 0) {
    super.reset(position, heading);
    const contact = this.ensureBoardContact();
    this.pendingBoardTransition = null;
    const support = contact.snapToGround(position, heading, 5, 10);
    if (support.supported) {
      this.position.copy(support.position);
      this.normal.copy(support.normal);
      this.setMovementState(MOVEMENT_STATE.GROUND);
      this.lastWheelSupport = support;
      this.groundDirection();
    } else {
      this.lastWheelSupport = null;
      this.setMovementState(MOVEMENT_STATE.AIR);
    }
  }

  setBoardContactRig(rig) {
    const contact = this.ensureBoardContact();
    contact.configure(rig || PRODUCTION_BOARD_CONTACT_RIG);
    this.contactRig = contact.rig;
    if (this.grounded) {
      const support = contact.snapToGround(this.position, this.heading, 0.55, 0.75);
      if (support.supported) {
        this.position.copy(support.position);
        this.normal.copy(support.normal);
        this.lastWheelSupport = support;
        this.groundDirection();
      }
    }
    return this.contactRig;
  }

  enterGrind(trick) {
    const entered = super.enterGrind(trick);
    if (entered) { this.ensureBoardContact().clearContacts(); this.lastWheelSupport = null; }
    return entered;
  }

  takeoff(impulse = 0, transition = null) {
    super.takeoff(impulse, transition);
    this.ensureBoardContact().clearContacts();
    this.lastWheelSupport = null;
    this.pendingBoardTransition = null;
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
    if (!this.grounded) return;

    if (this.pendingBoardTransition) {
      const transition = this.pendingBoardTransition;
      this.pendingBoardTransition = null;
      const vertBoost = this.vertJumpTimer > 0 ? this.vertJumpPending : 0;
      this.takeoff(vertBoost, transition);
      return;
    }

    const previousNormal = this.normal;
    const support = this.ensureBoardContact().solveGround(this.position, before, this.heading, previousNormal, true);
    if (!support.supported) {
      this.lastWheelSupport = null;
      const armedVert = this.vertJumpTimer > 0 ? this.transitions.approachAt(this.position, this.normal, this.velocity) : null;
      if (armedVert) this.takeoff(this.vertJumpPending, armedVert);
      else this.takeoff();
      return;
    }

    const sign = this.velocity.dot(this.forward) < 0 ? -1 : 1;
    const speed = this.velocity.length() * sign;
    if (result.contacts.length && this.velocity.lengthSq() > 0.04) {
      this.heading = headingFrom(this.velocity, this.heading) + (sign < 0 ? Math.PI : 0);
    }
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
    if (this.manual) this.updateManualBalance(dt, input, speed);
    if (this.bailTime) return;

    const rate = THREE.MathUtils.lerp(2.7, 1.2, clamp(Math.abs(speed) / 12, 0, 1));
    this.heading -= this.steer * rate * (speed < -0.15 ? -1 : 1) * dt;
    this.groundDirection();
    speed += (-PHYSICS.gravity * this.forward.y) * dt;

    const balanceDrive = Boolean(this.manual);
    if (!balanceDrive && drive > 0 && speed < PHYSICS.maxSpeed) speed += drive * PHYSICS.push * dt;
    const braking = input.brake || (!balanceDrive && drive < 0);
    const resistance = 0.26 + 0.012 * speed * speed + (braking ? PHYSICS.brake : 0);
    speed = Math.sign(speed) * Math.max(0, Math.abs(speed) - resistance * dt);
    speed = clamp(speed, -17, 17);
    this.velocity.copy(this.forward).multiplyScalar(speed);

    this._boardMoveStart.copy(this.position);
    this.position.addScaledVector(this.velocity, dt);
    this.ensureBoardContact().resolveClearance(
      this._boardMoveStart, this.position, this.velocity, this.heading, this.normal,
    );
    this.pendingBoardTransition = this.transitions.launchAt(this.position, this.normal, this.velocity);
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

    const support = this.ensureBoardContact().solveLanding(before, this.position, this.heading, UP, this.velocity);
    if (support) this.land(support);
  }

  land(support) {
    if ((support.count || 0) < 2 || !support.frontSupported || !support.rearSupported) return false;
    const correction = this._boardMoveStart.copy(support.position).sub(this.position);
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

    this.position.copy(support.position);
    this.normal.copy(support.normal);
    this.heading = headingFrom(boardForward, this.heading);
    this.groundDirection();
    const spin = Math.floor((Math.abs(this.airSpin) * 180 / Math.PI + 25) / 180) * 180;
    if (spin >= 180) this.recordTrick(`${spin}°`, spin);
    this.setMovementState(MOVEMENT_STATE.GROUND);
    this.coyote = 0;
    this.justLanded = true;
    this.transitionAir = null;
    this.wallRide = null;
    this.lastWheelSupport = support;
    this.velocity.copy(this.forward).multiplyScalar(planar.length() * Math.sign(alignment || 1));
    this.flipState = null;
    this.grabState = null;
    this.airSpin = 0;
    this.stableGroundTime = 0;
    return true;
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
    const candidate = this._boardMoveStart.copy(this.position).addScaledVector(this.velocity, dt);
    const floor = this.ensureBoardContact().solveLanding(this.position, candidate, this.heading, UP, this.velocity);
    if (floor && this.land(floor)) { this.contactCooldown = 0.3; return; }
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
}
