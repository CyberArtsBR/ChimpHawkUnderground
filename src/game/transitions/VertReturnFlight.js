import * as THREE from 'three';

const clamp = THREE.MathUtils.clamp;

export const VERT_RETURN = Object.freeze({
  radialGain: 6,
  maxRadialSpeed: 2.4,
  acceleration: 14,
  lateralDrag: 1.8,
  lateralCorridor: 0.80,
  maxLateralSpeed: 1.4,
  // A return should not completely disengage after a modest off-axis arc.
  // Corrections stay acceleration-limited, preserving momentum and gravity.
  maxPlaneError: 3.4,
  contactCorridor: 1.55,
  approachHeight: 2.1,
  minimumAssist: 0.18,
});

/**
 * Preserve ballistic Y and existing XZ motion. Bounded air-control correction
 * is weakest during ascent; descent near the original wall earns more assist.
 * No teleport, forced path, or unconditional velocity overwrite is performed.
 */
export function resolveVertReturnVelocity(air, position, velocity, dt) {
  const frame = air?.frame;
  const next = velocity.clone();
  if (!frame?.returnTarget || !frame.rampInward || !frame.copingTangent
    || !frame.lipPoint || !Number.isFinite(dt) || dt <= 0) {
    return { velocity: next, error: 0, guided: false };
  }

  const offset = position.clone().sub(frame.returnTarget).setY(0);
  const radialError = offset.dot(frame.rampInward);
  const lateralOffset = position.clone().sub(frame.lipPoint).setY(0)
    .dot(frame.copingTangent);
  if (!Number.isFinite(radialError) || !Number.isFinite(lateralOffset)
    || Math.abs(radialError) > VERT_RETURN.maxPlaneError) {
    return { velocity: next, error: Math.abs(radialError), guided: false };
  }

  const heightAboveLip = position.y - frame.lipPoint.y;
  const descending = velocity.y <= 0;
  const proximity = clamp((VERT_RETURN.approachHeight - heightAboveLip)
    / VERT_RETURN.approachHeight, 0, 1);
  // Begin bringing the rider back before the final metre of descent instead
  // of waiting until an unrecoverable late wall impact.
  const assist = descending
    ? Math.max(0.32, proximity)
    : VERT_RETURN.minimumAssist;

  const maxStep = VERT_RETURN.acceleration * assist * dt;
  const radial = velocity.dot(frame.rampInward);
  // Do not hard-clip an already-moving board to 2.4 m/s in one frame.
  // Correction is always acceleration limited, including aborted transfers.
  const targetRadial = clamp(-radialError * VERT_RETURN.radialGain
    - radial * 0.45 * assist, -VERT_RETURN.maxRadialSpeed,
  VERT_RETURN.maxRadialSpeed);
  const nextRadial = radial + clamp(targetRadial - radial, -maxStep, maxStep);

  const lateral = velocity.dot(frame.copingTangent);
  let targetLateral = lateral;
  if (Math.abs(lateralOffset) > VERT_RETURN.lateralCorridor) {
    const excess = Math.abs(lateralOffset) - VERT_RETURN.lateralCorridor;
    // Do not steer backwards toward the *takeoff point* at a wide coping.
    // A shallow dt-aware drag is enough to avoid runaway lateral motion;
    // landing geometry validates whether the real authored lip continues.
    targetLateral = lateral * Math.exp(-0.5 * excess * dt);
  }
  const nextLateral = lateral
    + clamp(targetLateral - lateral, -maxStep, maxStep);

  next.copy(frame.rampInward).multiplyScalar(nextRadial)
    .addScaledVector(frame.copingTangent, nextLateral);
  next.y = velocity.y;
  return { velocity: next, error: Math.abs(radialError), guided: true };
}
