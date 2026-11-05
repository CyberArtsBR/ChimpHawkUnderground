import * as THREE from 'three';
import {
  GRIND_CAPTURE,
  captureEligibility,
  contactLongitudinalOffsets,
  createBalanceState,
  grindProfile,
  projectedGrindSpeed,
  railSurfaceHeight,
} from '../SkateSystems.js';

const clamp = THREE.MathUtils.clamp;

export const GRIND_CAPTURE_POLICY = Object.freeze({
  railCaptureDistance: 0.52,
  railCaptureAbove: 0.46,
  railCaptureBelow: 0.44,
  railMaxRiseVelocity: 4.2,
  railPredictionTime: 0.16,
  railAlignmentRelax: 0.58,
  railMaxAlignmentSlack: 0.16,
  railMinTangentSpeed: 0,
  railBlendTime: 0.14,
});

// Evaluate all local paths before choosing a trick target. Nearest-only
// selection allows a perpendicular coping to hide an aligned handrail.
function nearbyRails(network, point, maxDistance) {
  return typeof network.nearby === 'function'
    ? network.nearby(point, maxDistance)
    : [network.nearest(point, maxDistance)].filter(Boolean);
}

function horizontal(source, fallback = null) {
  const out = source?.clone?.() || new THREE.Vector3();
  out.y = 0;
  if (out.lengthSq() > 1e-8) return out.normalize();
  if (fallback?.lengthSq?.() > 1e-8) {
    out.copy(fallback).setY(0);
    if (out.lengthSq() > 1e-8) return out.normalize();
  }
  return out.set(0, 0, -1);
}

/** Pure THPS-style magnetic fallback eligibility. */
export function grindCaptureEligibility({
  surfaceDistance = Infinity,
  verticalDelta = 0,
  velocityY = 0,
  tangentAlignment = 0,
  tangentSpeed = 0,
  profile = grindProfile('50-50'),
  config = GRIND_CAPTURE_POLICY,
} = {}) {
  if (velocityY > config.railMaxRiseVelocity) return false;
  if (surfaceDistance > config.railCaptureDistance) return false;
  if (verticalDelta < -config.railCaptureBelow || verticalDelta > config.railCaptureAbove) return false;

  const alignment = Math.abs(tangentAlignment);
  const minAlignment = Math.max(0.08, profile.approach.minAlignment * config.railAlignmentRelax);
  const maxAlignment = Math.min(1, profile.approach.maxAlignment + config.railMaxAlignmentSlack);
  if (alignment < minAlignment || alignment > maxAlignment) return false;
  if (Math.abs(tangentSpeed) < Math.min(profile.approach.minTangentSpeed, config.railMinTangentSpeed)) return false;
  return true;
}

/**
 * Exact Phase-1 representation of the former RailNetwork.capture gameplay policy.
 * RailNetwork supplies nearest/sample geometry only; capture authority lives here.
 */
export function resolveStrictGrindCapture({
  position,
  forward,
  velocity,
  railNetwork,
  trick = null,
  config = GRIND_CAPTURE,
} = {}) {
  if (!position?.clone || !velocity?.clone || !railNetwork?.nearest) return null;
  const profile = grindProfile(trick?.name);
  const flatForward = horizontal(forward);
  let best = null;

  for (const longitudinal of contactLongitudinalOffsets(profile)) {
    const contact = position.clone().addScaledVector(flatForward, longitudinal);
    for (const hit of nearbyRails(railNetwork, contact, config.distance + 0.18)) {

    const surfaceY = railSurfaceHeight(hit.point.y, hit.rail.radius, profile.clearance);
    const surfaceDistance = Math.max(0, hit.distance - hit.rail.radius);
    const predictedContact = contact.clone().addScaledVector(velocity, config.predictionTime);
    const predicted = nearbyRails(railNetwork, predictedContact, config.distance + 0.18)
      .find(candidate => candidate.rail === hit.rail);
    const predictedDistance = predicted?.rail === hit.rail
      ? Math.max(0, predicted.distance - hit.rail.radius)
      : surfaceDistance;
    const trajectoryClosing = surfaceDistance - predictedDistance;

    const horizontalVelocity = velocity.clone().setY(0);
    const tangentHorizontal = hit.tangent.clone().setY(0);
    if (horizontalVelocity.lengthSq() < 1e-8 || tangentHorizontal.lengthSq() < 1e-8) continue;
    horizontalVelocity.normalize();
    tangentHorizontal.normalize();
    const tangentAlignment = clamp(horizontalVelocity.dot(tangentHorizontal), -1, 1);
    const tangentSpeed = velocity.dot(hit.tangent);

    const eligibility = captureEligibility({
      surfaceDistance,
      verticalDelta: contact.y - surfaceY,
      velocityY: velocity.y,
      tangentAlignment,
      tangentSpeed,
      trajectoryClosing,
      trickName: profile.name,
    });
    if (!eligibility.eligible) continue;

    const verticalDelta = contact.y - surfaceY;
    const score = surfaceDistance + Math.abs(verticalDelta) * 0.55;
    if (!best || score < best.score) {
      best = {
        score,
        rail: hit.rail,
        s: hit.s,
        point: hit.point,
        tangent: hit.tangent,
        direction: (Math.abs(tangentSpeed) > 1e-8 ? tangentSpeed : flatForward.dot(hit.tangent)) >= 0 ? 1 : -1,
        speed: projectedGrindSpeed(tangentSpeed),
        projectedSpeed: Math.abs(tangentSpeed),
        surfaceDistance,
        verticalDelta,
        trajectoryClosing,
        contactLongitudinal: longitudinal,
        profile,
      };
    }
    }
  }

  return best;
}

/** Canonical THPS magnetic fallback query. */
export function resolveMagneticGrindCapture({
  position,
  forward,
  velocity,
  railNetwork,
  trick = null,
  gravity = 20,
  config = GRIND_CAPTURE_POLICY,
} = {}) {
  if (!position?.clone || !velocity?.clone || !railNetwork?.nearest) return null;

  const profile = grindProfile(trick?.name);
  const flatForward = horizontal(forward, velocity);
  let best = null;

  for (const longitudinal of contactLongitudinalOffsets(profile)) {
    const contact = position.clone().addScaledVector(flatForward, longitudinal);
    for (const hit of nearbyRails(railNetwork, contact, config.railCaptureDistance + 0.20)) {

    const surfaceY = railSurfaceHeight(hit.point.y, hit.rail.radius, profile.clearance);
    const verticalDelta = contact.y - surfaceY;
    const surfaceDistance = Math.max(0, hit.distance - hit.rail.radius);
    const horizontalVelocity = horizontal(velocity, flatForward);
    const tangentHorizontal = horizontal(hit.tangent);
    const tangentAlignment = clamp(horizontalVelocity.dot(tangentHorizontal), -1, 1);
    const tangentSpeed = velocity.dot(hit.tangent);

    if (!grindCaptureEligibility({
      surfaceDistance,
      verticalDelta,
      velocityY: velocity.y,
      tangentAlignment,
      tangentSpeed,
      profile,
      config,
    })) continue;

    const predictedContact = contact.clone().addScaledVector(
      velocity,
      config.railPredictionTime,
    );
    predictedContact.y -= 0.5 * gravity * config.railPredictionTime ** 2;
    const predicted = nearbyRails(
      railNetwork, predictedContact, config.railCaptureDistance + 0.22,
    ).find(candidate => candidate.rail === hit.rail);
    const predictedDistance = predicted?.rail === hit.rail
      ? Math.max(0, predicted.distance - hit.rail.radius)
      : surfaceDistance + 0.08;
    const closingBonus = clamp(surfaceDistance - predictedDistance, -0.08, 0.18);
    const score = surfaceDistance + Math.abs(verticalDelta) * 0.42 - closingBonus * 0.55;

    if (!best || score < best.score) {
      best = {
        score,
        rail: hit.rail,
        s: hit.s,
        point: hit.point,
        tangent: hit.tangent,
        direction: (Math.abs(tangentSpeed) > 1e-8 ? tangentSpeed : flatForward.dot(hit.tangent)) >= 0 ? 1 : -1,
        speed: projectedGrindSpeed(tangentSpeed),
        projectedSpeed: Math.abs(tangentSpeed),
        surfaceDistance,
        verticalDelta,
        contactLongitudinal: longitudinal,
        profile,
      };
    }
    }
  }

  return best;
}

/**
 * Single gameplay authority for grind capture.
 * Preserve validated behavior: strict capture wins; the forgiving THPS magnet is
 * only the fallback when strict capture cannot resolve the requested rail.
 */
export function resolveGrindCapture(context = {}) {
  const strict = resolveStrictGrindCapture(context);
  if (strict) {
    return {
      ...strict,
      captureMode: 'strict',
      blendDuration: GRIND_CAPTURE.blendTime,
      magneticEntry: false,
    };
  }

  const magnetic = resolveMagneticGrindCapture(context);
  if (!magnetic) return null;
  return {
    ...magnetic,
    captureMode: 'magnetic',
    blendDuration: GRIND_CAPTURE_POLICY.railBlendTime,
    magneticEntry: true,
  };
}

/** Apply one accepted canonical capture to runtime state. */
export function applyGrindEntry(runtime, capture, trick = {}) {
  if (!runtime || !capture?.rail || !runtime.railNetwork?.sample || !capture.profile) return false;
  if (!Number.isFinite(capture.s) || !Number.isFinite(capture.speed) || capture.speed <= 0) return false;

  // A held grind button must not repeatedly cash the same rail during the
  // contact cooldown. Require a genuine move away from the previous exit
  // before recapturing that exact rail, without blocking adjacent transfers.
  const guard = runtime.grindReentryGuard;
  if (guard?.rail === capture.rail && guard.position?.distanceTo
    && runtime.position?.distanceTo && runtime.position.distanceTo(guard.position) < 0.9) {
    return false;
  }
  const sample = runtime.railNetwork.sample(capture.rail, capture.s, {
    clearance: capture.profile.clearance,
  });
  if (!sample || !Number.isFinite(sample.point.x + sample.point.y + sample.point.z)) return false;

  const magneticEntry = capture.captureMode === 'magnetic' || capture.magneticEntry === true;
  const normalizedTrick = { ...trick, name: capture.profile.name };
  runtime.grind = {
    ...capture,
    trick: normalizedTrick,
    profile: capture.profile,
    speed: capture.speed,
    time: 0,
    // Rail-trick changes require both elapsed time and distance travelled.
    lastSwitchTime: 0,
    lastSwitchS: capture.s,
    lastSwitchTravel: 0,
    travelDistance: 0,
    trickSwitchCount: 0,
    balance: 0,
    balanceState: createBalanceState(1.18),
    instability: 0,
    blendElapsed: 0,
    blendDuration: capture.blendDuration
      ?? (magneticEntry ? GRIND_CAPTURE_POLICY.railBlendTime : GRIND_CAPTURE.blendTime),
    blendPosition: runtime.position.clone(),
    incomingVelocity: runtime.velocity.clone(),
    entryHeading: runtime.heading,
    contactClearance: capture.profile.clearance,
    contactClearanceTarget: capture.profile.clearance,
    ...(magneticEntry ? { magneticEntry: true } : {}),
  };
  runtime.grindBalanceState = runtime.grind.balanceState;
  runtime.grindBalance = 0;
  runtime.grounded = false;
  runtime.manual = null;
  runtime.flatland = null;
  runtime.transitionAir = null;
  runtime.wallRide = null;
  runtime.airHeading = runtime.heading;
  runtime.grind.scoreEntry = runtime.recordTrick(
    runtime.grind.trick.name,
    magneticEntry ? (runtime.grind.trick.points || 100) : runtime.grind.trick.points,
  );
  runtime.stableGroundTime = 0;

  if (magneticEntry) {
    runtime.ensureBoardContact?.().clearContacts?.();
    runtime.lastWheelSupport = null;
  }
  return true;
}
