import * as THREE from 'three';

function horizontal(vector) {
  return vector.clone().setY(0);
}

/**
 * A world-UP air wheel sweep may put the leading truck onto the top deck
 * while the board centre is already INSIDE its original wall. That partial
 * footprint cannot own a flat landing; the ramp-oriented sweep must finish
 * the descent. This is contact routing only, never synthetic wheel support.
 */
export function partialDeckContactDuringReturn({support,air,position,rig,config}={}) {
  if(!air?.frame || air.transferring || !air.apexPassed || !support?.supported
    || Math.abs(support.normal?.y ?? 0)<.985 || !position || !rig || !config) return false;
  const front=Boolean(support.frontSupported),rear=Boolean(support.rearSupported);
  if(front===rear)return false; // Full deck support belongs to the normal solver.
  const {lipPoint,rampInward,surfaceNormal}=air.frame;
  if(!lipPoint || !rampInward || !surfaceNormal)return false;
  const radial=horizontal(position.clone().sub(lipPoint)).dot(rampInward);
  const wheelReach=Math.hypot(Math.max(Math.abs(rig.frontTruckZ),Math.abs(rig.rearTruckZ)),
    Math.max(Math.abs(rig.leftWheelX),Math.abs(rig.rightWheelX)));
  if(radial<=.015 || radial> wheelReach+.04)return false;
  // Reuse the authored lip bounds/height gates. The saved face normal is only
  // a classification reference; it does not create or accept a contact.
  return supportMatchesOriginalTransition({position:support.position,normal:surfaceNormal},air,config);
}

/**
 * Verify that a support belongs to the same authored transition that launched
 * the active vert-air state. This is geometry evidence only; it never mutates
 * gameplay orientation or velocity.
 */
export function supportMatchesOriginalTransition(support, air, config) {
  if (!support?.position || !support?.normal || !air?.frame?.lipPoint
    || !air?.frame?.deckOutward || !air?.frame?.rampInward
    || !air?.frame?.copingTangent || !config) return false;

  const ny = Math.abs(support.normal.y);
  if (ny < config.recoveryNormalMinY || ny > config.recoveryNormalMaxY) return false;

  const outward = horizontal(air.frame.deckOutward);
  const inward = horizontal(air.frame.rampInward);
  if (outward.lengthSq() < 1e-8 || inward.lengthSq() < 1e-8) return false;
  outward.normalize();
  inward.normalize();

  const fromLip = support.position.clone().sub(air.frame.lipPoint);
  if (Number.isFinite(config.contactCorridor)) {
    const lipPath = air.frame.lipPath;
    if (Array.isArray(lipPath) && lipPath.length >= 2) {
      // A diagonal carve can reconnect anywhere along the SAME authored rail.
      // Only overhang past all coping segments is limited, never total distance
      // from the original takeoff point. Radial/normal/height gates remain below.
      let smallestOverhang = Infinity;
      for (let i = 1; i < lipPath.length; i++) {
        const a = lipPath[i - 1], b = lipPath[i];
        const ab = horizontal(b.clone().sub(a));
        const lengthSq = ab.lengthSq();
        if (lengthSq < 1e-8) continue;
        const t = horizontal(support.position.clone().sub(a)).dot(ab) / lengthSq;
        const overhang = t < 0 ? -t * Math.sqrt(lengthSq)
          : t > 1 ? (t - 1) * Math.sqrt(lengthSq) : 0;
        smallestOverhang = Math.min(smallestOverhang, overhang);
      }
      if (smallestOverhang > config.contactCorridor) return false;
    } else {
      const lateral = horizontal(fromLip).dot(air.frame.copingTangent);
      if (Math.abs(lateral) > config.contactCorridor) return false;
    }
  }

  const signedOutward = horizontal(fromLip).dot(outward);
  if (signedOutward > config.recoveryOutwardMax
    || signedOutward < -config.recoveryInwardMax) return false;

  const dy = support.position.y - air.frame.lipPoint.y;
  if (dy > config.recoveryAboveLip || dy < -config.recoveryBelowLip) return false;

  const horizontalNormal = horizontal(support.normal);
  if (horizontalNormal.lengthSq() < 1e-8) return false;
  horizontalNormal.normalize();
  if (horizontalNormal.dot(inward) < config.recoveryNormalAlignment) return false;

  return true;
}

export function originalTransitionSweep(surface, from, to, air, config) {
  if (!surface?.sweepRideable || !from || !to || !air?.frame || !config) return null;
  const point = new THREE.Vector3();
  const normal = new THREE.Vector3();
  const hit = surface.sweepRideable(
    from,
    to,
    point,
    normal,
    config.continuousSweepExtra,
  );
  if (!hit) return null;
  // Extra sweep range searches triangle seams but is not actual travel.
  // ParkCollision clamps an ahead-of-frame hit to fraction=1; do not snap
  // the skater to a surface not yet crossed by the current physics step.
  if (point.distanceTo(from) > from.distanceTo(to) + 0.008) return null;
  const candidate = { position: point.clone(), normal: normal.clone() };
  if (!supportMatchesOriginalTransition(candidate, air, config)) return null;
  return {
    point: point.clone(),
    normal: normal.clone(),
    fraction: hit.fraction ?? 1,
  };
}

export function makeEmergencyTransitionSupport({
  hit,
  velocity,
  forward,
  contactSkin = 0.018,
} = {}) {
  if (!hit?.normal?.clone || !hit?.point?.clone) return null;
  const normal = hit.normal.clone().normalize();
  const position = hit.point.clone().addScaledVector(normal, contactSkin);
  const leadingFront = (velocity?.dot?.(forward) || 0) >= 0;
  return {
    supported: true,
    count: 1,
    frontSupported: leadingFront ? 1 : 0,
    rearSupported: leadingFront ? 0 : 1,
    position,
    supportPoint: hit.point.clone(),
    normal,
    maxWheelGap: 0,
    contacts: [],
  };
}

export function continuousReentryEligible({
  activeAir,
  grounded = false,
  sameAir = true,
  velocityY = 0,
} = {}) {
  if (!activeAir?.frame || grounded || !sameAir) return false;
  return Boolean(activeAir.apexPassed || velocityY <= 0.8);
}

/**
 * First continuous re-entry candidate: the real board-contact solver with a
 * transition-oriented support basis.
 */
export function resolveWheelReentryCandidate({
  activeAir,
  grounded = false,
  sameAir = true,
  velocityY = 0,
  contact,
  before,
  position,
  heading = 0,
  referenceNormal,
  velocity,
  config,
} = {}) {
  if (!continuousReentryEligible({ activeAir, grounded, sameAir, velocityY })) return null;
  if (!contact?.solveLanding || !before || !position || !velocity || !config) return null;

  const normal = referenceNormal?.clone?.()
    || activeAir.frame.surfaceNormal?.clone?.()
    || new THREE.Vector3(0, 1, 0);
  if (normal.lengthSq() < 1e-8) normal.set(0, 1, 0);
  normal.normalize();

  const support = contact.solveLanding(
    before,
    position,
    heading,
    normal,
    velocity,
  );
  if (!support?.supported || !supportMatchesOriginalTransition(support, activeAir, config)) return null;
  return Object.freeze({
    source: 'wheel-sweep',
    support,
  });
}

/**
 * Hard anti-tunnelling fallback. The center sweep only becomes a landing
 * candidate when its hit belongs to the same authored transition; otherwise it
 * returns null and cannot steal contact from another ramp/floor.
 */
export function resolveSweepReentryCandidate({
  activeAir,
  grounded = false,
  sameAir = true,
  velocityY = 0,
  surface,
  contact,
  before,
  position,
  heading = 0,
  velocity,
  forward,
  config,
} = {}) {
  if (!continuousReentryEligible({ activeAir, grounded, sameAir, velocityY })) return null;
  if (!surface || !contact || !before || !position || !velocity || !config) return null;

  const hit = originalTransitionSweep(surface, before, position, activeAir, config);
  if (!hit) return null;

  const candidate = hit.point.clone().addScaledVector(
    hit.normal,
    config.continuousContactSkin,
  );
  const resolved = contact.solveGround?.(
    candidate,
    before,
    heading,
    hit.normal,
    false,
  );

  let support = resolved?.supported && resolved.position?.distanceTo?.(candidate) <= 0.18
    ? resolved
    : null;
  if (support && !supportMatchesOriginalTransition(support, activeAir, config)) support = null;
  // A center-only impact is a penetration guard, not an authorized landing.
  const wheelVerified = Boolean(support);
  if (!support) {
    support = makeEmergencyTransitionSupport({
      hit,
      velocity,
      forward,
      contactSkin: config.continuousContactSkin,
    });
  }
  if (!support) return null;

  return Object.freeze({
    source: 'center-sweep',
    hit,
    candidate,
    support,
    wheelVerified,
  });
}
