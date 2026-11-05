import * as THREE from 'three';

const clamp = THREE.MathUtils.clamp;

/**
 * Single authoritative ramp launch-energy model for Phase 1.
 *
 * These values intentionally preserve the validated UnifiedRampFeel behavior.
 * The architectural change is ownership: lower mobility layers no longer add a
 * second hidden ramp bonus and the top-level launch path does not compensate for
 * energy injected elsewhere.
 */
export const LAUNCH_ENERGY = Object.freeze({
  memoryTime: 0.30,
  slopeThresholdY: 0.996,
  minVerticalSpeed: 0.045,
  minSpeed: 2.2,
  boostMin: 3.15,
  boostMax: 6.55,
  boostFullSpeed: 13.0,
});

export function rampLaunchBonus({
  speed = 0,
  normalY = 1,
  verticalSpeed = 0,
  config = LAUNCH_ENERGY,
} = {}) {
  const ny = Math.abs(Number(normalY) || 0);
  const magnitude = Math.abs(Number(speed) || 0);
  const rise = Number(verticalSpeed) || 0;
  if (ny >= config.slopeThresholdY
    || rise <= config.minVerticalSpeed
    || magnitude < config.minSpeed) return 0;

  const slope = clamp((config.slopeThresholdY - ny) / 0.76, 0, 1);
  const energy = clamp((magnitude - config.minSpeed)
    / Math.max(0.1, config.boostFullSpeed - config.minSpeed), 0, 1);
  const riseQuality = clamp(rise / 5.5, 0, 1);
  // Avoid full-strength launch energy from barely moving, shallow seam contacts.
  // Well-established carving speeds continue to use the original arcade curve.
  const entrySpeed = clamp((magnitude - config.minSpeed) / 2.8, 0, 1);
  const entryRise = clamp((rise - config.minVerticalSpeed) / 0.65, 0, 1);
  const entryWeight = (entrySpeed * entrySpeed * (3 - 2 * entrySpeed))
    * (entryRise * entryRise * (3 - 2 * entryRise));
  const quality = clamp(
    0.34 + slope * 0.38 + energy * 0.34 + riseQuality * 0.18,
    0,
    1,
  );
  return THREE.MathUtils.lerp(config.boostMin, config.boostMax, quality) * entryWeight;
}

export function updateRampLaunchMemory({
  previousBoost = 0,
  previousTime = 0,
  sampleBoost = 0,
  dt = 0,
  config = LAUNCH_ENERGY,
} = {}) {
  const sample = Math.max(0, Number(sampleBoost) || 0);
  if (sample > 0) {
    return {
      boost: Math.max(sample, Math.max(0, Number(previousBoost) || 0)),
      time: config.memoryTime,
    };
  }
  const time = Math.max(
    0,
    (Number(previousTime) || 0) - Math.max(0, Number(dt) || 0),
  );
  return {
    boost: time > 0 ? Math.max(0, Number(previousBoost) || 0) : 0,
    time,
  };
}

/** Compose the final impulse exactly once. */
export function composeLaunchImpulse({ ollieImpulse = 0, rampBonus = 0 } = {}) {
  return Math.max(0, Number(ollieImpulse) || 0)
    + Math.max(0, Number(rampBonus) || 0);
}
