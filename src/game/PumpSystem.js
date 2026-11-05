const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export const PUMP_CONFIG = Object.freeze({
  minContacts: 3,
  minTangentSpeed: 1.55,
  minSlopeDeg: 7,
  maxSlopeDeg: 68,
  minCurvatureRad: 0.008,
  // A sharp wheel-normal discontinuity is a ledge/seam, not a pumpable arc.
  maxCoherentCurvatureRad: 0.48,
  minHold: 0.075,
  cooldown: 0.22,
  landingWindow: 0.42,
  perfectPhase: 0.56,
  timingSigma: 0.19,
  timingCutoff: 0.35,
  goodThreshold: 0.60,
  perfectThreshold: 0.90,
  specificEnergy: 9.2,
  maxDeltaSpeed: 1.35,
  softSpeedCap: 14.5,
  hardSpeedCap: 17.0,
});

export function expApproach(current, target, rate, dt) {
  return target + (current - target) * Math.exp(-Math.max(0, rate) * Math.max(0, dt));
}

export function phaseFromMotion(normalY, verticalSpeed) {
  const slopeRad = Math.acos(clamp(normalY, 0, 1));
  const slope01 = clamp(slopeRad / (Math.PI * 0.45), 0, 1);
  const verticalDirection = verticalSpeed < -0.08 ? -1 : verticalSpeed > 0.08 ? 1 : 0;
  return {
    slopeRad,
    slopeDeg: slopeRad * 180 / Math.PI,
    slope01,
    phase: 0.5 + verticalDirection * slope01 * 0.5,
  };
}

export function pumpTimingQuality(phase, config = PUMP_CONFIG) {
  const distance = Math.abs(clamp(phase, 0, 1) - config.perfectPhase);
  if (distance >= config.timingCutoff) return 0;
  const quality = Math.exp(-0.5 * (distance / Math.max(0.001, config.timingSigma)) ** 2);
  // Bad timing must not reward repeated release attempts.
  return quality < 0.24 ? 0 : clamp(quality, 0, 1);
}

export function evaluatePumpEligibility({
  contactCount = 0,
  normalY = 1,
  normalDelta = 0,
  contactSpread = 0,
  tangentSpeed = 0,
  ridingAlignment = 1,
  landingWindow = 0,
} = {}, config = PUMP_CONFIG) {
  const motion = phaseFromMotion(normalY, 0);
  const curvature = Math.max(Math.abs(normalDelta), Math.abs(contactSpread));
  // Four wheels straddling a hard 90-degree corner can report enormous
  // curvature; rewarding that as a bowl compression creates seam exploits.
  const coherent = Number.isFinite(curvature)
    && curvature <= config.maxCoherentCurvatureRad;
  const hasTransitionShape = coherent
    && (curvature >= config.minCurvatureRad || landingWindow > 0);
  const eligible = contactCount >= config.minContacts
    && motion.slopeDeg >= config.minSlopeDeg
    && motion.slopeDeg <= config.maxSlopeDeg
    && Math.abs(tangentSpeed) >= config.minTangentSpeed
    && Math.abs(ridingAlignment) >= 0.25
    && hasTransitionShape;
  return { eligible, curvature, slopeDeg: motion.slopeDeg };
}

export function speedCapFactor(tangentSpeed, config = PUMP_CONFIG) {
  const speed = Math.abs(tangentSpeed);
  if (speed <= config.softSpeedCap) return 1;
  if (speed >= config.hardSpeedCap) return 0;
  const t = (speed - config.softSpeedCap) / (config.hardSpeedCap - config.softSpeedCap);
  return (1 - t) ** 2;
}

export function computePumpEnergy({
  tangentSpeed = 0,
  quality = 0,
  compression = 1,
  geometryFactor = 1,
} = {}, config = PUMP_CONFIG) {
  const speed = Math.abs(Number(tangentSpeed) || 0);
  const validQuality = Number.isFinite(quality) && quality >= 0.24
    ? clamp(quality, 0, 1) : 0;
  const capFactor = speedCapFactor(speed, config);
  const compressionFactor = 0.55 + 0.45 * clamp(compression, 0, 1);
  const specificEnergy = config.specificEnergy
    * validQuality
    * compressionFactor
    * clamp(geometryFactor, 0.55, 1)
    * capFactor;
  if (specificEnergy <= 0 || speed >= config.hardSpeedCap) {
    return { nextSpeed: speed, deltaSpeed: 0, specificEnergy: 0, capFactor };
  }
  const energySpeed = Math.sqrt(speed * speed + 2 * specificEnergy);
  const deltaSpeed = Math.min(config.maxDeltaSpeed, Math.max(0, energySpeed - speed));
  const nextSpeed = Math.min(config.hardSpeedCap, speed + deltaSpeed);
  const actualEnergy = Math.max(0, 0.5 * (nextSpeed * nextSpeed - speed * speed));
  return { nextSpeed, deltaSpeed: nextSpeed - speed, specificEnergy: actualEnergy, capFactor };
}

export function pumpEventTier(quality, config = PUMP_CONFIG) {
  if (quality >= config.perfectThreshold) return 'perfectPump';
  if (quality >= config.goodThreshold) return 'goodPump';
  return 'pump';
}
