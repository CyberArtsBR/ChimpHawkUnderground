import * as THREE from 'three';
import { groundForwardFromHeading } from './core/GroundMotor.js';
import { validatedSurfaceTag } from './SurfaceAudio.js';

const UP = new THREE.Vector3(0, 1, 0);
const clamp = THREE.MathUtils.clamp;

export const PRODUCTION_BOARD_CONTACT_RIG = Object.freeze({
  source: 'public/assets/rider/skateboard.glb',
  deckLength: 1.05,
  deckWidth: 0.277586,
  center: [0, 0.118143, 0],
  frontTruckZ: -0.278866,
  rearTruckZ: 0.284387,
  leftWheelX: -0.097772,
  rightWheelX: 0.106795,
  wheelRadius: 0.041535,
  wheelContactY: 0,
  deckUndersideY: 0.095506,
  deckTopY: 0.140780,
  noseZ: -0.507,
  tailZ: 0.507,
});

function makeWheel(name, x, y, z, truck) {
  return {
    name, truck,
    local: new THREE.Vector3(x, y, z),
    predicted: new THREE.Vector3(), previous: new THREE.Vector3(),
    point: new THREE.Vector3(), normal: new THREE.Vector3(0, 1, 0),
    valid: false, distance: 0, sweepFraction: 1,
  };
}

/**
 * Deterministic arcade skateboard contact solver.
 * The board is the riding object: four wheel contacts define support while two
 * small nose/tail probes only protect deck clearance against obstacle sides.
 */
export class SkateboardContactRig {
  constructor(surface, rig = PRODUCTION_BOARD_CONTACT_RIG) {
    this.surface = surface;
    this.skin = 0.015;
    this.probeRise = 0.085;
    this.probeDrop = 0.19;
    this.clearanceRadius = 0.034;
    this._basis = {
      forward: new THREE.Vector3(0, 0, -1),
      right: new THREE.Vector3(1, 0, 0),
      back: new THREE.Vector3(0, 0, 1),
    };
    this._averagePoint = new THREE.Vector3();
    this._averageNormal = new THREE.Vector3();
    this._planeNormal = new THREE.Vector3();
    this._front = new THREE.Vector3();
    this._rear = new THREE.Vector3();
    this._left = new THREE.Vector3();
    this._right = new THREE.Vector3();
    this._edgeA = new THREE.Vector3();
    this._edgeB = new THREE.Vector3();
    this._scratchA = new THREE.Vector3();
    this._scratchB = new THREE.Vector3();
    this._scratchC = new THREE.Vector3();
    this._scratchD = new THREE.Vector3();
    this._candidate = new THREE.Vector3();
    this._landingNormal = new THREE.Vector3();
    this.landingImpact = null;
    this._landingImpact = { position: new THREE.Vector3(), normal: new THREE.Vector3() };
    this._hitPoint = new THREE.Vector3();
    this._hitNormal = new THREE.Vector3();
    this._validWheels = [];
    this.state = {
      supported: false,
      count: 0,
      position: new THREE.Vector3(),
      supportPoint: new THREE.Vector3(),
      normal: new THREE.Vector3(0, 1, 0),
      pitch: 0,
      roll: 0,
      contacts: [],
      frontSupported: 0,
      rearSupported: 0,
      maxWheelGap: 0,
      noseClear: true,
      tailClear: true,
    };
    this.configure(rig);
  }

  configure(rig = PRODUCTION_BOARD_CONTACT_RIG) {
    const r = { ...PRODUCTION_BOARD_CONTACT_RIG, ...(rig || {}) };
    this.rig = r;
    this.wheels = [
      makeWheel('frontLeftWheel', r.leftWheelX, r.wheelContactY, r.frontTruckZ, 'front'),
      makeWheel('frontRightWheel', r.rightWheelX, r.wheelContactY, r.frontTruckZ, 'front'),
      makeWheel('rearLeftWheel', r.leftWheelX, r.wheelContactY, r.rearTruckZ, 'rear'),
      makeWheel('rearRightWheel', r.rightWheelX, r.wheelContactY, r.rearTruckZ, 'rear'),
    ];
    this.noseLocal = new THREE.Vector3(0, r.deckUndersideY, r.noseZ);
    this.tailLocal = new THREE.Vector3(0, r.deckUndersideY, r.tailZ);
    this._clearanceLocals = [this.noseLocal, this.tailLocal];
    this.state.contacts = this.wheels;
    this.clearContacts();
    return this;
  }

  clearContacts() {
    for (const wheel of this.wheels) wheel.valid = false;
    this.state.supported = false;
    this.state.count = 0;
    this.state.frontSupported = 0;
    this.state.rearSupported = 0;
    this.state.maxWheelGap = 0;
    this.state.noseClear = true;
    this.state.tailClear = true;
  }

  basis(heading, normal, target = this._basis) {
    groundForwardFromHeading({ heading, normal, out: target.forward });
    target.back.copy(target.forward).negate();
    target.right.crossVectors(target.forward, normal);
    if (target.right.lengthSq() < 1e-8) target.right.set(1, 0, 0);
    else target.right.normalize();
    return target;
  }

  worldPoint(center, local, heading, normal, target, basis = this.basis(heading, normal)) {
    return target.copy(center)
      .addScaledVector(basis.right, local.x)
      .addScaledVector(normal, local.y)
      .addScaledVector(basis.back, local.z);
  }

  _probeWheel(wheel, center, previousCenter, heading, previousNormal, allowSweep) {
    const basis = this.basis(heading, previousNormal);
    this.worldPoint(center, wheel.local, heading, previousNormal, wheel.predicted, basis);
    this.worldPoint(previousCenter, wheel.local, heading, previousNormal, this._scratchA, basis);

    let hit = null;
    if (allowSweep && wheel.valid) {
      hit = this.surface.sweepRideable(
        wheel.previous, wheel.predicted, this._hitPoint, this._hitNormal, 0.02,
      );
    }
    if (!hit) {
      hit = this.surface.probeRideable(
        wheel.predicted, previousNormal, this.probeRise, this.probeDrop,
        this._hitPoint, this._hitNormal,
      );
    }

    // During a diagonal carve the four wheels touch different points on a
    // curved bowl. A single average board normal can miss the next facet even
    // while this SAME wheel was supported one fixed step ago. Retry from its
    // last measured face and then vertically; accept only nearby geometry
    // facing roughly the same way. Neither path invents a floor or snaps to a
    // distant lower deck, and takeoff/landing probes cannot use this grace.
    if (!hit && allowSweep && wheel.valid && previousNormal.y < 0.985) {
      const continuous = () => this._hitNormal.dot(wheel.normal) > 0.48
        && this._hitPoint.distanceTo(wheel.predicted) <= 0.22;
      hit = this.surface.probeRideable(
        wheel.predicted, wheel.normal, this.probeRise + 0.08,
        this.probeDrop + 0.10, this._hitPoint, this._hitNormal,
      );
      if (hit && !continuous()) hit = null;
      if (!hit) {
        hit = this.surface.probeRideable(
          wheel.predicted, UP, 0.16, 0.23, this._hitPoint, this._hitNormal,
        );
        if (hit && !continuous()) hit = null;
      }
    }

    if (!hit) {
      wheel.valid = false;
      wheel.audioSurfaceTag='neutral';
      wheel.previous.copy(wheel.predicted);
      return false;
    }

    wheel.valid = true;
    wheel.point.copy(this._hitPoint);
    wheel.normal.copy(this._hitNormal);
    wheel.previous.copy(wheel.point).addScaledVector(wheel.normal, this.skin);
    wheel.distance = hit.distance ?? 0;
    wheel.sweepFraction = hit.fraction ?? 1;
    wheel.triangleIndex = hit.faceIndex ?? null;
    wheel.surface = hit.object?.name || hit.object?.userData?.surface || null;
    wheel.audioSurfaceTag=validatedSurfaceTag(hit.audioSurfaceTag ?? hit.object?.userData?.audioSurfaceTag ?? hit.object?.userData?.surfaceType);
    return true;
  }

  _fitNormal(previousNormal) {
    const valid = this._validWheels;
    valid.length = 0;
    this._averageNormal.set(0, 0, 0);
    for (const wheel of this.wheels) {
      if (!wheel.valid) continue;
      valid.push(wheel);
      this._averageNormal.add(wheel.normal);
    }
    if (!valid.length) return this._planeNormal.copy(previousNormal);
    this._averageNormal.normalize();

    if (valid.length >= 4) {
      const fl = this.wheels[0].point, fr = this.wheels[1].point;
      const rl = this.wheels[2].point, rr = this.wheels[3].point;
      this._front.copy(fl).add(fr).multiplyScalar(0.5);
      this._rear.copy(rl).add(rr).multiplyScalar(0.5);
      this._left.copy(fl).add(rl).multiplyScalar(0.5);
      this._right.copy(fr).add(rr).multiplyScalar(0.5);
      this._edgeA.copy(this._front).sub(this._rear);
      this._edgeB.copy(this._right).sub(this._left);
      this._planeNormal.crossVectors(this._edgeB, this._edgeA).normalize();
      if (this._planeNormal.dot(previousNormal) < 0) this._planeNormal.negate();
      this._planeNormal.multiplyScalar(0.78).addScaledVector(this._averageNormal, 0.22).normalize();
    } else if (valid.length === 3) {
      this._edgeA.copy(valid[1].point).sub(valid[0].point);
      this._edgeB.copy(valid[2].point).sub(valid[0].point);
      this._planeNormal.crossVectors(this._edgeA, this._edgeB).normalize();
      if (this._planeNormal.dot(previousNormal) < 0) this._planeNormal.negate();
      this._planeNormal.multiplyScalar(0.85).addScaledVector(this._averageNormal, 0.15).normalize();
    } else if (valid.length === 2) {
      this._edgeA.copy(valid[1].point).sub(valid[0].point).normalize();
      this._planeNormal.copy(previousNormal).addScaledVector(this._edgeA, -previousNormal.dot(this._edgeA));
      if (this._planeNormal.lengthSq() < 1e-8) this._planeNormal.copy(this._averageNormal);
      else this._planeNormal.normalize();
      this._planeNormal.multiplyScalar(0.9).addScaledVector(this._averageNormal, 0.1).normalize();
    } else {
      this._planeNormal.copy(previousNormal).multiplyScalar(0.86).addScaledVector(this._averageNormal, 0.14).normalize();
    }

    if (!Number.isFinite(this._planeNormal.lengthSq()) || this._planeNormal.lengthSq() < 1e-8) this._planeNormal.copy(previousNormal);
    if (this._planeNormal.y < -0.02) this._planeNormal.negate();
    return this._planeNormal;
  }

  _stabilizeNormal(previousNormal, count) {
    const dot = clamp(this._planeNormal.dot(previousNormal), -1, 1);
    let alpha = 1;
    if (count >= 3 && dot > 0.997) alpha = 0.62;
    else if (count >= 3 && dot > 0.985) alpha = 0.82;
    else if (count === 2) alpha = 0.55;
    else if (count === 1) alpha = 0.22;
    this._scratchA.copy(this._planeNormal);
    this._planeNormal.copy(previousNormal).lerp(this._scratchA, alpha).normalize();
  }

  _finishSupport(position, heading, previousNormal, correctionDown = this.probeDrop,
    correctionUp = this.probeRise + this.skin, correctionAxis = null) {
    const state = this.state;
    let count = 0, front = 0, rear = 0, maxGap = 0;
    this._averagePoint.set(0, 0, 0);
    for (const wheel of this.wheels) {
      if (!wheel.valid) continue;
      count++;
      if (wheel.truck === 'front') front++; else rear++;
      this._averagePoint.add(wheel.point);
      maxGap = Math.max(maxGap, Math.abs(wheel.distance));
    }
    state.count = count;
    state.supported = count > 0;
    state.frontSupported = front;
    state.rearSupported = rear;
    state.maxWheelGap = maxGap;
    if (!count) {
      state.position.copy(position);
      state.supportPoint.copy(position);
      state.normal.copy(previousNormal);
      return state;
    }

    this._averagePoint.multiplyScalar(1 / count);
    this._fitNormal(previousNormal);
    this._stabilizeNormal(previousNormal, count);
    state.normal.copy(this._planeNormal);
    state.supportPoint.copy(this._averagePoint);

    const basis = this.basis(heading, state.normal);
    let correction = 0;
    let validCorrection = 0;
    for (const wheel of this.wheels) {
      if (!wheel.valid) continue;
      this.worldPoint(position, wheel.local, heading, state.normal, this._scratchA, basis);
      correction += this._scratchB.copy(wheel.point).sub(this._scratchA).dot(state.normal);
      validCorrection++;
    }
    correction = validCorrection ? correction / validCorrection : 0;
    const axis = correctionAxis || state.normal;
    const axisDotNormal = Math.max(0.08, Math.abs(axis.dot(state.normal)));
    correction = (correction + this.skin) / axisDotNormal;
    // One isolated wheel must not lever the entire board up/down a full
    // snap distance. Preserve the contact for lip-release decisions.
    const downLimit = count === 1 ? Math.min(correctionDown, 0.045) : correctionDown;
    const upLimit = count === 1 ? Math.min(correctionUp, 0.035) : correctionUp;
    correction = clamp(correction, -downLimit, upLimit);
    state.position.copy(position).addScaledVector(axis, correction);

    const surfaceForward = groundForwardFromHeading({ heading, normal: state.normal, out: this._scratchC });
    const surfaceRight = this._scratchD.crossVectors(surfaceForward, state.normal).normalize();
    state.pitch = Math.atan2(surfaceForward.y, Math.hypot(surfaceForward.x, surfaceForward.z));
    state.roll = Math.atan2(surfaceRight.y, Math.hypot(surfaceRight.x, surfaceRight.z));
    if (!Number.isFinite(state.pitch) || !Number.isFinite(state.roll) || !Number.isFinite(state.normal.lengthSq())) {
      state.normal.copy(previousNormal);
      state.pitch = 0;
      state.roll = 0;
    }
    return state;
  }

  snapToGround(position, heading, rise = 5, drop = 10) {
    const oldRise = this.probeRise, oldDrop = this.probeDrop;
    this.probeRise = rise; this.probeDrop = drop;
    this.clearContacts();
    for (const wheel of this.wheels) this._probeWheel(wheel, position, position, heading, UP, false);
    const result = this._finishSupport(position, heading, UP, rise + drop, rise + this.skin, UP);
    this.probeRise = oldRise; this.probeDrop = oldDrop;
    return result;
  }

  solveGround(position, previousPosition, heading, previousNormal, allowSweep = true) {
    for (const wheel of this.wheels) this._probeWheel(wheel, position, previousPosition, heading, previousNormal, allowSweep);
    return this._finishSupport(position, heading, previousNormal);
  }

  resolveClearance(from, desired, velocity, heading, normal) {
    const state = this.state;
    state.noseClear = true; state.tailClear = true;
    const basis = this.basis(heading, normal);
    for (let i = 0; i < 2; i++) {
      const local = this._clearanceLocals[i];
      this.worldPoint(from, local, heading, normal, this._scratchA, basis);
      this.worldPoint(desired, local, heading, normal, this._scratchB, basis);
      const hit = this.surface.sweepSolidSphere(
        this._scratchA, this._scratchB, this.clearanceRadius,
        this._hitPoint, this._hitNormal,
      );
      if (!hit) continue;
      if (i === 0) state.noseClear = false; else state.tailClear = false;
      const safeFraction = clamp((hit.fraction ?? 0) - 0.008, 0, 1);
      this._scratchC.copy(desired).sub(from).multiplyScalar(safeFraction);
      desired.copy(from).add(this._scratchC);
      const into = velocity.dot(this._hitNormal);
      if (into < 0) velocity.addScaledVector(this._hitNormal, -into);
    }
    return desired;
  }

  solveLanding(from, to, heading, previousNormal, velocity) {
    this.landingImpact = null;
    let earliest = 2;
    this._scratchC.set(0, 0, 0);
    this._scratchD.copy(previousNormal);
    const basis = this.basis(heading, previousNormal);
    for (const wheel of this.wheels) {
      this.worldPoint(from, wheel.local, heading, previousNormal, this._scratchA, basis);
      this.worldPoint(to, wheel.local, heading, previousNormal, this._scratchB, basis);
      const hit = this.surface.sweepRideable(this._scratchA, this._scratchB, this._hitPoint, this._hitNormal, 0.02);
      if (!hit || velocity.dot(this._hitNormal) >= -0.035) continue;
      const fraction = hit.fraction ?? 1;
      if (fraction < earliest) {
        earliest = fraction;
        this._scratchC.copy(this._hitPoint);
        this._scratchD.copy(this._hitNormal);
      }
    }
    // The centre also guards narrow seams where neither truck finds a face.
    if (earliest > 1) {
      const hit = this.surface.sweepRideable(from, to, this._hitPoint, this._hitNormal);
      if (!hit || velocity.dot(this._hitNormal) >= -.035) return null;
      earliest = hit.fraction ?? 1;
      this._scratchD.copy(this._hitNormal);
    }
    const candidate = this._candidate.copy(from).lerp(to, clamp(earliest, 0, 1));
    // Preserve the swept collision independently of landing acceptance and
    // scratch vectors reused by solveGround. Rejected landings still hit terrain.
    this._landingNormal.copy(this._scratchD);
    this._landingImpact.position.copy(candidate).addScaledVector(this._landingNormal, this.skin);
    this._landingImpact.normal.copy(this._landingNormal);
    this.landingImpact = this._landingImpact;
    const support = this.solveGround(candidate, from, heading, this._landingNormal, false);
    // The landing policy owns truck-first / wheel-first transition catches.
    if (support.supported && (support.normal.y < .995 ||
      (support.count >= 2 && support.frontSupported > 0 && support.rearSupported > 0))) return support;
    return null;
  }
}
