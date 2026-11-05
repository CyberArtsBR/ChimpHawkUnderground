import test from 'node:test';
import assert from 'node:assert/strict';
import { PUMP_CONFIG, computePumpEnergy, evaluatePumpEligibility,
  phaseFromMotion, pumpTimingQuality } from '../src/game/PumpSystem.js';
import { rampLaunchBonus, updateRampLaunchMemory,
  composeLaunchImpulse } from '../src/game/core/LaunchEnergyModel.js';

const curved = (degrees, overrides = {}) => evaluatePumpEligibility({
  contactCount: 4, normalY: Math.cos(degrees * Math.PI / 180),
  normalDelta: 0.04, contactSpread: 0.07, tangentSpeed: 8,
  ridingAlignment: 1, ...overrides,
});

test('small/large quarters and curved bowl contacts qualify, flat seams do not', () => {
  for (const slope of [20, 34, 58]) assert.equal(curved(slope).eligible, true);
  assert.equal(curved(1).eligible, false);
  assert.equal(curved(34, { normalDelta: 0, contactSpread: 0 }).eligible, false);
  assert.equal(curved(34, { contactCount: 2 }).eligible, false);
});

test('release phase: ideal compression beats mistimed bowl descent/ascent', () => {
  const perfect = pumpTimingQuality(PUMP_CONFIG.perfectPhase);
  const early = pumpTimingQuality(0.25);
  const late = pumpTimingQuality(0.84);
  assert.ok(perfect > early && perfect > late);
  assert.ok(early > 0 && late > 0, 'less effective pumps remain possible');
  const best = computePumpEnergy({ tangentSpeed: 7.5, quality: perfect, compression: 1 });
  for (const quality of [early, late]) {
    const result = computePumpEnergy({ tangentSpeed: 7.5, quality, compression: 1 });
    assert.ok(result.deltaSpeed > 0 && result.specificEnergy < best.specificEnergy);
  }
  assert.equal(pumpTimingQuality(0), 0);
  assert.equal(computePumpEnergy({ tangentSpeed: 7.5, quality: 0.1 }).deltaSpeed, 0);
});

test('pump energy has diminishing returns, a hard cap, and no double impulse in one pure evaluation', () => {
  let speed = 7.5;
  for (let i = 0; i < 75; i++) {
    const gain = computePumpEnergy({ tangentSpeed: speed, quality: 1, compression: 1 });
    const energy = (gain.nextSpeed ** 2 - speed ** 2) / 2;
    assert.ok(Math.abs(energy - gain.specificEnergy) < 1e-8);
    assert.ok(gain.deltaSpeed >= 0 && gain.deltaSpeed <= PUMP_CONFIG.maxDeltaSpeed + 1e-8);
    speed = gain.nextSpeed;
  }
  assert.ok(speed <= PUMP_CONFIG.hardSpeedCap + 1e-8);
  assert.equal(computePumpEnergy({ tangentSpeed: PUMP_CONFIG.hardSpeedCap,
    quality: 1 }).deltaSpeed, 0);
  assert.equal(composeLaunchImpulse({ ollieImpulse: 2, rampBonus: 3 }), 5);
});

test('low-speed and shallow-seam climb samples no longer get full ramp launch boost', () => {
  const seam = rampLaunchBonus({ speed: 2.3, normalY: 0.8, verticalSpeed: 0.08 });
  const bank = rampLaunchBonus({ speed: 8.5, normalY: 0.9, verticalSpeed: 1.5 });
  const quarter = rampLaunchBonus({ speed: 12.5, normalY: 0.36, verticalSpeed: 5 });
  assert.ok(seam < 0.1, 'slow seam must not be a jump exploit');
  assert.ok(bank > 3.4 && quarter > bank);
  const memory = updateRampLaunchMemory({ sampleBoost: quarter, dt: 1 / 120 });
  assert.ok(memory.boost > 0 && memory.time > 0);
  const expired = updateRampLaunchMemory({ previousBoost: memory.boost,
    previousTime: memory.time, dt: 1 });
  assert.equal(expired.boost, 0);
});

test('rising/descending phase remains ordered for bowl pumping', () => {
  const y = Math.cos(Math.PI / 4);
  assert.ok(phaseFromMotion(y, -5).phase < phaseFromMotion(y, 0).phase);
  assert.ok(phaseFromMotion(y, 0).phase < phaseFromMotion(y, 5).phase);
});
