import * as THREE from 'three';
import {
  composeLaunchImpulse,
  rampLaunchBonus,
} from './LaunchEnergyModel.js';

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

function headingFromFacing(direction, fallback = 0) {
  const flat = horizontal(direction);
  if (flat.lengthSq() < EPSILON) return Number(fallback) || 0;
  return Math.atan2(-flat.x, -flat.z);
}

/**
 * Read-only Phase 1 shadow model for the decisions currently spread across the
 * takeoff inheritance chain. It intentionally performs no mutation and does not
 * replace runtime takeoff yet.
 *
 * The object captures only pre-launch facts/derived values. Geometry-aware deck
 * transfer scanning still happens after the lower transition path creates
 * `transitionAir`, so that remains outside this context until parity is proven.
 */
export function captureTakeoffContext({
  grounded = false,
  normal = null,
  velocity = null,
  forward = null,
  travelDirection = null,
  heading = 0,
  stance = 1,
  requestedImpulse = 0,
  transition = null,
  rampLaunchMemory = 0,
  rampLaunchMemoryTime = 0,
  rampExitIntentTime = 0,
} = {}) {
  const sourceVelocity = velocity?.clone?.() || new THREE.Vector3();
  const speed = sourceVelocity.length();
  const normalY = normal?.y ?? 1;
  const currentRampBonus = grounded
    ? rampLaunchBonus({
      speed,
      normalY,
      verticalSpeed: sourceVelocity.y,
    })
    : 0;
  const rememberedRampBonus = Number(rampLaunchMemoryTime) > 0
    ? Math.max(0, Number(rampLaunchMemory) || 0)
    : 0;
  const rampBonus = Math.max(currentRampBonus, rememberedRampBonus);
  // A surface-projected forward vector approaches vertical at the coping.
  // Flattening that vector magnifies tiny facet errors into a sideways yaw.
  const takeoffHeading = Number.isFinite(heading) ? heading : headingFromFacing(forward);
  const takeoffFacing = new THREE.Vector3(-Math.sin(takeoffHeading), 0, -Math.cos(takeoffHeading));
  const takeoffStance = Number(stance) || 1;
  const rampContext = Boolean(transition)
    || rampBonus > 0
    || (grounded && Math.abs(Number(normalY) || 0) < 0.995);

  return Object.freeze({
    grounded: Boolean(grounded),
    speed,
    verticalSpeed: sourceVelocity.y,
    normalY,
    requestedImpulse: Math.max(0, Number(requestedImpulse) || 0),
    currentRampBonus,
    rememberedRampBonus,
    rampBonus,
    composedImpulse: composeLaunchImpulse({
      ollieImpulse: requestedImpulse,
      rampBonus,
    }),
    rampContext,
    exitRequested: Number(rampExitIntentTime) > 0,
    transitionProvided: Boolean(transition),
    transitionId: transition?.transitionId ?? null,
    transitionType: transition?.transitionType ?? null,
    takeoffFacing,
    takeoffHeading,
    takeoffStance,
  });
}
