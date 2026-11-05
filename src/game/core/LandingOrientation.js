import * as THREE from 'three';

const EPSILON = 1e-8;

function horizontal(source, fallback = null) {
  const out = source?.clone?.() || new THREE.Vector3();
  out.y = 0;
  if (out.lengthSq() > EPSILON) return out.normalize();
  if (fallback?.lengthSq?.() > EPSILON) {
    out.copy(fallback).setY(0);
    if (out.lengthSq() > EPSILON) return out.normalize();
  }
  return out.set(0, 0, -1);
}

export function explicitAirHalfTurns(airSpin = 0) {
  const degrees = Math.abs(Number(airSpin) || 0) * 180 / Math.PI;
  return Math.floor((degrees + 25) / 180);
}

export function rampLandingFacing({ takeoffFacing, airSpin = 0 } = {}) {
  const facing = horizontal(takeoffFacing);
  if (explicitAirHalfTurns(airSpin) % 2 === 1) facing.negate();
  return facing;
}

export function headingFromFacing(direction, fallback = 0) {
  const facing = horizontal(direction);
  if (facing.lengthSq() < EPSILON) return Number(fallback) || 0;
  return Math.atan2(-facing.x, -facing.z);
}

/**
 * Pure ramp-touchdown orientation result.
 * Surface contact is not an input: ramp/coping normals may tilt pitch/roll but
 * can never invent horizontal yaw. Only the takeoff deck facing plus explicit
 * airborne spin determine touchdown deck heading and stance.
 */
export function resolveRampLandingOrientation({
  takeoffFacing,
  takeoffStance = 1,
  airSpin = 0,
  fallbackHeading = 0,
} = {}) {
  const halfTurns = explicitAirHalfTurns(airSpin);
  const facing = rampLandingFacing({ takeoffFacing, airSpin });
  return {
    halfTurns,
    facing,
    heading: headingFromFacing(facing, fallbackHeading),
    stance: halfTurns % 2 === 1
      ? -(Number(takeoffStance) || 1)
      : (Number(takeoffStance) || 1),
  };
}
