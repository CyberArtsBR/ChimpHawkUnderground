import * as THREE from 'three';

const UP = new THREE.Vector3(0, 1, 0);
export const CAMERA_CLEARANCE = Object.freeze({
  minimumDistance: 1.8,
  radius: 0.28,
  // Start finding alternate sightlines before the camera becomes a face close-up.
  comfortMargin: 1.3,
  comfortArmFraction: 0.6,
  recoveryMargin: 0.35,
  sideOffsets: [1.5, 3.5],
  verticalOffsets: [0, 2.6, 5.2],
});

/**
 * Choose an obstacle-aware third-person eye. Every candidate (including cached
 * positions) must pass through the world's camera-volume sweep. Never lengthen
 * or interpolate an occluded ray without rechecking it against the world.
 *
 * 'fixedAxis' locks the yaw of the gameplay rig, not the collision safety
 * offset. Follow and Fixed may slide sideways / rise past walls and stair rails
 * without switching camera modes or suddenly orbiting across the character.
 */
export function resolveCameraClearance(surface, anchor, desired, previousEye = null, cache = null) {
  const minimum = Math.max(CAMERA_CLEARANCE.minimumDistance, Number(cache?.minimumDistance) || 0);
  const probe = eye => surface?.camera
    ? surface.camera(anchor, eye, CAMERA_CLEARANCE.radius) : eye.clone();
  const arm = desired.clone().sub(anchor);
  if (arm.lengthSq() < 1e-8) arm.set(0, 2, minimum + 1);
  const armDistance = arm.length();
  const comfort = Math.max(minimum + CAMERA_CLEARANCE.comfortMargin,
    armDistance * CAMERA_CLEARANCE.comfortArmFraction);
  const direct = probe(desired);
  const directDistance = direct.distanceTo(anchor);
  // A coping edge can alternately cover and uncover the direct arm by a few
  // centimetres. Keep a proven side until the direct sightline has recovered
  // decisively, rather than switching back and forth at the same threshold.
  const recovery = cache?.side ? CAMERA_CLEARANCE.recoveryMargin : 0;
  if (directDistance >= comfort + recovery) {
    if (cache) {
      cache.arm = direct.clone().sub(anchor);
      cache.side = 0;
    }
    return direct;
  }

  const side = new THREE.Vector3(arm.z, 0, -arm.x);
  if (side.lengthSq() < 1e-8) side.set(1, 0, 0);
  side.normalize();

  let bestSafe = null;
  let bestScore = Infinity;
  let bestBlocked = direct;
  let furthestBlocked = directDistance;
  const priorArm = cache?.arm?.clone?.() || null;
  const priorSide = Number(cache?.side) || 0;
  const consider = (eye, baseCost = 0, sideSign = 0) => {
    const resolved = probe(eye);
    const distance = resolved.distanceTo(anchor);
    if (distance > furthestBlocked) {
      furthestBlocked = distance;
      bestBlocked = resolved;
    }
    if (distance + 1e-7 < minimum) return;

    // Keep the rider in frame, prefer a comfortable view, and add hysteresis:
    // a previous safe side should not swap every frame at a symmetric doorway.
    const displacement = resolved.distanceTo(desired);
    const shortfall = Math.max(0, comfort - distance);
    const switchCost = priorSide && sideSign && sideSign !== priorSide ? 0.7 : 0;
    const continuity = priorArm ? Math.min(0.8,
      resolved.clone().sub(anchor).distanceTo(priorArm) * 0.065) : 0;
    const score = baseCost + displacement * 0.145 + shortfall * 1.0
      + switchCost + continuity;
    if (score < bestScore - 1e-6) {
      bestSafe = { point: resolved, sign: sideSign };
      bestScore = score;
    }
  };
  consider(direct, 0.2, 0);

  // Returning to a known clear camera arm has priority over trying the
  // opposite side. All cached arms are re-probed from the CURRENT rider anchor.
  if (priorArm && priorArm.distanceTo(arm) < Math.max(8, armDistance * 1.25)) {
    consider(anchor.clone().add(priorArm), 0.12, priorSide);
  }
  if (previousEye && !cache?.fixedAxis && previousEye.distanceTo(anchor) < armDistance + 6) {
    consider(previousEye.clone(), 0.35, priorSide);
  }

  const normal = cache?.wallNormal?.clone?.();
  if (normal) {
    normal.y = 0;
    if (normal.lengthSq() > 1e-8) {
      normal.normalize();
      const normalSide = Math.sign(normal.dot(side)) || 0;
      for (const offset of [1.8, 4]) {
        for (const lift of [0, 2.5, 5]) {
          consider(desired.clone().addScaledVector(normal, offset)
            .addScaledVector(UP, lift), 0.1 + offset * 0.055 + lift * 0.07,
          normalSide);
          if (bestSafe && bestScore < 1.3 && bestSafe.point.distanceTo(anchor) >= comfort) break;
        }
        if (bestSafe && bestScore < 1.3 && bestSafe.point.distanceTo(anchor) >= comfort) break;
      }
    }
  }

  // Short lateral shifts are safer than swinging 180 degrees across the
  // rider in narrow indoor parks. Probe both sides and several heights.
  const signs = priorSide ? [priorSide, -priorSide] : [1, -1];
  for (const lift of CAMERA_CLEARANCE.verticalOffsets) {
    consider(desired.clone().addScaledVector(UP, lift), lift * 0.11, 0);
    for (const offset of CAMERA_CLEARANCE.sideOffsets) {
      for (const sign of signs) {
        consider(desired.clone().addScaledVector(side, offset * sign)
          .addScaledVector(UP, lift), 0.16 + offset * 0.09 + lift * 0.1, sign);
      }
    }
    if (bestSafe && bestScore < 1.3 && bestSafe.point.distanceTo(anchor) >= comfort) break;
  }

  // Classic is free to reframe slightly around obstructions, but large
  // behind-to-front flips are forbidden (especially around bowl lips).
  if (!cache?.fixedAxis && (!bestSafe || bestScore > 1)) {
    for (const degrees of [30, -30, 60, -60]) {
      for (const lift of [0, 3]) {
        const eye = anchor.clone().add(arm.clone().applyAxisAngle(
          UP, degrees * Math.PI / 180)).addScaledVector(UP, lift);
        consider(eye, 0.6 + Math.abs(degrees) / 100 + lift * 0.1,
          Math.sign(degrees));
      }
    }
  }

  // A sealed volume has no valid third-person eye. Return the furthest
  // collision-verified result, never an invented point through solid geometry.
  const result = bestSafe?.point || bestBlocked;
  if (cache && bestSafe) {
    cache.arm = result.clone().sub(anchor);
    cache.side = bestSafe.sign;
  }
  return result;
}
