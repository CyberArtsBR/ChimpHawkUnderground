import { MathUtils } from 'three';

export const FLATLAND_NAMES = Object.freeze(['Handstand', 'Casper']);

// Shared deck/rider channels crossfade even when switching between variants.
export class FlatlandMotion {
  constructor() { this.reset(); }
  reset() {
    this.weights = Object.fromEntries(FLATLAND_NAMES.map(name => [name, 0]));
    this.time = 0;
  }
  update(name, dt) {
    const step = Number.isFinite(dt) ? MathUtils.clamp(dt, 0, 0.1) : 0;
    this.time += step;
    // Give the complete body inversion time to read. Apply the same rate to
    // every channel during its exit so overlapping variants stay normalized.
    const rate = name === 'Handstand' || this.weights.Handstand > 0.001 ? 6 : 16;
    const alpha = 1 - Math.exp(-rate * step);
    for (const key of FLATLAND_NAMES) this.weights[key] += ((key === name ? 1 : 0) - this.weights[key]) * alpha;
    return this;
  }
}

export function flatlandDeckPose(motion) {
  const w = motion.weights;
  return {
    pitch: 0.11 * w.Handstand - 0.12 * w.Casper,
    yaw: 0,
    roll: Math.PI * w.Casper,
    lift: 0,
  };
}
