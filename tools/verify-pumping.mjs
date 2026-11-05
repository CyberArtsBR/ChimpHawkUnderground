import assert from 'node:assert/strict';
import {
  PUMP_CONFIG,
  computePumpEnergy,
  evaluatePumpEligibility,
  expApproach,
  phaseFromMotion,
  pumpTimingQuality,
} from '../src/game/PumpSystem.js';
import {
  OLLIE_COMMAND,
  interpretOllieRelease,
} from '../src/input/InputInterpreter.js';

const rad = degrees => degrees * Math.PI / 180;
const normalY = degrees => Math.cos(rad(degrees));
const approx = (a, b, epsilon = 1e-7) => assert.ok(Math.abs(a - b) <= epsilon, `${a} != ${b}`);

const transition = (slope, extra = {}) => evaluatePumpEligibility({
  contactCount: 4,
  normalY: normalY(slope),
  normalDelta: rad(2.2),
  contactSpread: rad(5),
  tangentSpeed: 8,
  ridingAlignment: 1,
  ...extra,
});

const releaseCommand = ({
  grounded = false,
  pumpEligible = false,
  holdTime = 0,
  cooldown = 0,
  nearCoping = false,
  grinding = false,
} = {}) => interpretOllieRelease({
  ollieReleased: true,
  grinding,
  grounded,
  nearCoping,
  pumpEligible,
  pumpHoldTime: holdTime,
  pumpCooldown: cooldown,
  pumpMinHold: PUMP_CONFIG.minHold,
});

// 1. Flat release still performs Ollie.
assert.equal(releaseCommand({ grounded: true, pumpEligible: false, holdTime: 0.4 }), OLLIE_COMMAND.OLLIE);

// 2. Transition compression is recognized from contact/slope/curvature, not a ramp name.
assert.equal(transition(28).eligible, true);

// 3. Correct pump adds tangent speed.
const perfectPhase = PUMP_CONFIG.perfectPhase;
const perfectQuality = pumpTimingQuality(perfectPhase);
const perfectBoost = computePumpEnergy({ tangentSpeed: 8, quality: perfectQuality, compression: 1 });
assert.ok(perfectBoost.deltaSpeed > 0.7 && perfectBoost.deltaSpeed <= PUMP_CONFIG.maxDeltaSpeed);

// 4. Early pump gives a smaller boost.
const earlyQuality = pumpTimingQuality(0.25);
const earlyBoost = computePumpEnergy({ tangentSpeed: 8, quality: earlyQuality, compression: 1 });
assert.ok(earlyBoost.deltaSpeed > 0 && earlyBoost.deltaSpeed < perfectBoost.deltaSpeed);

// 5. Late pump gives a smaller boost.
const lateQuality = pumpTimingQuality(0.84);
const lateBoost = computePumpEnergy({ tangentSpeed: 8, quality: lateQuality, compression: 1 });
assert.ok(lateBoost.deltaSpeed > 0 && lateBoost.deltaSpeed < perfectBoost.deltaSpeed);

// 6. Very poor timing gives no boost.
assert.equal(pumpTimingQuality(0.01), 0);
assert.equal(computePumpEnergy({ tangentSpeed: 8, quality: 0, compression: 1 }).deltaSpeed, 0);

// 7. Airborne release cannot resolve to a pump.
assert.equal(releaseCommand({ grounded: false, pumpEligible: true, holdTime: 0.4 }), OLLIE_COMMAND.AIR_RELEASE);

// 8. Repeated pumping respects the hard cap and diminishes after the soft cap.
let speed = 7;
let previousGain = Infinity;
for (let i = 0; i < 40; i++) {
  const result = computePumpEnergy({ tangentSpeed: speed, quality: 1, compression: 1 });
  if (speed >= PUMP_CONFIG.softSpeedCap) assert.ok(result.deltaSpeed <= previousGain + 1e-9);
  previousGain = result.deltaSpeed;
  speed = result.nextSpeed;
}
assert.ok(speed <= PUMP_CONFIG.hardSpeedCap + 1e-9);
assert.ok(speed > PUMP_CONFIG.softSpeedCap);

// 9. Bowl-like curved contact set is eligible.
assert.equal(transition(34, { contactSpread: rad(7.5), normalDelta: rad(1.2) }).eligible, true);

// 10. Quarter-pipe-like curved contact set is eligible.
assert.equal(transition(52, { contactSpread: rad(4.2), normalDelta: rad(2.8) }).eligible, true);

// 11. Landing window permits immediate compression/pump even before a stable normal history exists.
assert.equal(transition(24, { contactSpread: 0, normalDelta: 0, landingWindow: 0.3 }).eligible, true);
assert.equal(releaseCommand({ grounded: true, pumpEligible: true, holdTime: 0.12, cooldown: 0 }), OLLIE_COMMAND.PUMP);

// 12. Near-coping context wins over pump and preserves vert behavior.
assert.equal(releaseCommand({ grounded: true, pumpEligible: true, holdTime: 0.4, nearCoping: true }), OLLIE_COMMAND.VERT_OLLIE);

// 13. Vert-Ollie remains reachable even with a long crouch hold.
assert.equal(releaseCommand({ grounded: true, pumpEligible: false, holdTime: 0.6, nearCoping: true }), OLLIE_COMMAND.VERT_OLLIE);

// 14. A real pump release is consumed as pump, never as a regular Ollie; refractory releases are consumed too.
assert.equal(releaseCommand({ grounded: true, pumpEligible: true, holdTime: 0.2, cooldown: 0 }), OLLIE_COMMAND.PUMP);
assert.equal(releaseCommand({ grounded: true, pumpEligible: true, holdTime: 0.2, cooldown: 0.1 }), OLLIE_COMMAND.PUMP_BLOCKED);

// 15. Compression smoothing is fixed-step/framerate independent.
const runCompression = dt => {
  let value = 0;
  for (let t = 0; t < 1 - 1e-10; t += dt) value = expApproach(value, 1, 14, dt);
  return value;
};
approx(runCompression(1 / 60), runCompression(1 / 120), 1e-6);

// Sanity-check phase ordering: descent -> bottom -> ascent.
const descend = phaseFromMotion(normalY(45), -5).phase;
const bottom = phaseFromMotion(normalY(8), 0).phase;
const ascend = phaseFromMotion(normalY(45), 5).phase;
assert.ok(descend < bottom && bottom < ascend);

console.log('Pumping verification: 15/15 deterministic checks passed');
console.log(JSON.stringify({ perfectQuality, earlyQuality, lateQuality, perfectDelta: perfectBoost.deltaSpeed, cappedSpeed: speed }, null, 2));
