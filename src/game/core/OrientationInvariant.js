const TAU = Math.PI * 2;

export function wrapAngle(angle = 0) {
  let value = Number(angle) || 0;
  value = ((value + Math.PI) % TAU + TAU) % TAU - Math.PI;
  return value;
}

export function yawDelta(from = 0, to = 0) {
  return wrapAngle((Number(to) || 0) - (Number(from) || 0));
}

/**
 * Contact/landing is never allowed to invent horizontal deck yaw. This helper
 * turns the old "restore heading afterwards" behavior into an observable
 * invariant so lower-layer violations can be counted and removed one by one.
 */
export function evaluateLandingYawInvariant({
  playerHeading = 0,
  lowerLayerHeading = 0,
  tolerance = 1e-7,
} = {}) {
  const delta = yawDelta(playerHeading, lowerLayerHeading);
  return {
    preservedHeading: Number(playerHeading) || 0,
    lowerLayerHeading: Number(lowerLayerHeading) || 0,
    delta,
    violated: Math.abs(delta) > Math.max(0, Number(tolerance) || 0),
  };
}
