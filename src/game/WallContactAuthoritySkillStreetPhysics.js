import { ArcadeParkMobilitySkillStreetPhysics } from './ArcadeParkMobilitySkillStreetPhysics.js';

export const WALL_CONTACT_AUTHORITY = Object.freeze({
  groundMinY: 0.92,
  maxVerticalSpeed: 1.10,
  faceMaxY: 0.22,

  // Geometry classifier dimensions remain useful for collision QA / anti-clipping,
  // but classification never authorizes horizontal yaw.
  lowHeight: 0.18,
  highHeight: 0.52,
  lateralHeight: 0.34,
  lateralHalfWidth: 0.28,
  normalContinuity: 0.74,

  probePadding: 0.42,
  minProbeReach: 0.44,
  bodyClearance: 0.29,
});

export function wallFaceContextAllows({
  groundNormalY = 1,
  verticalSpeed = 0,
  hitNormalY = 0,
  config = WALL_CONTACT_AUTHORITY,
} = {}) {
  return Math.abs(Number(groundNormalY) || 0) >= config.groundMinY
    && Math.abs(Number(verticalSpeed) || 0) <= config.maxVerticalSpeed
    && Math.abs(Number(hitNormalY) || 0) <= config.faceMaxY;
}

/** A broad wall classifier remains available to collision QA. It has no yaw authority. */
export function wallFaceContinuityAllows({
  low = false,
  high = false,
  lateralLeft = false,
  lateralRight = false,
} = {}) {
  return Boolean(low && high && (lateralLeft || lateralRight));
}

/** Clearance correction remains reusable by the future CollisionResolver. */
export function wallClearanceCorrection(distanceAlongNormal = Infinity,
  config = WALL_CONTACT_AUTHORITY) {
  const distance = Number(distanceAlongNormal);
  if (!Number.isFinite(distance)) return 0;
  return Math.max(0, config.bodyClearance - distance);
}

/**
 * Phase 1 compatibility alias.
 *
 * The former subclass was the historical "broad wall => turn ~90 degrees"
 * authority. Final gameplay has explicitly prohibited contact-driven yaw, and the
 * top runtime already made those methods inert. Keeping the subclass in the
 * prototype chain only preserved dead behavior and architectural ambiguity.
 *
 * Old imports remain valid, but runtime now skips that layer entirely.
 */
export { ArcadeParkMobilitySkillStreetPhysics as WallContactAuthoritySkillStreetPhysics };
