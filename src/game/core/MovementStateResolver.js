import { MOVEMENT_STATE } from '../StreetPhysics.js';

export function resolveMovementMode({
  bailTime = 0,
  grind = null,
  wallRide = null,
  grounded = false,
  manual = null,
  transitionAir = null,
} = {}) {
  if (Number(bailTime) > 0) return MOVEMENT_STATE.BAIL;
  if (grind) return MOVEMENT_STATE.GRIND;
  if (wallRide) return MOVEMENT_STATE.WALLRIDE;
  if (grounded) return manual ? MOVEMENT_STATE.MANUAL : MOVEMENT_STATE.GROUND;
  if (transitionAir) return MOVEMENT_STATE.VERT_AIR;
  return MOVEMENT_STATE.AIR;
}

export function resolveRuntimeMovementMode(runtime) {
  return resolveMovementMode({
    bailTime: runtime?.bailTime || 0,
    grind: runtime?.grind || null,
    wallRide: runtime?.wallRide || null,
    grounded: Boolean(runtime?.grounded),
    manual: runtime?.manual || null,
    transitionAir: runtime?.transitionAir || null,
  });
}
