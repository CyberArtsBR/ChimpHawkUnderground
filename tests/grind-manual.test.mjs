import test from 'node:test';
import assert from 'node:assert/strict';
import {
  GRIND_CAPTURE,
  advanceRailCoordinate,
  canAttemptGrind,
  captureEligibility,
  createBalanceState,
  disturbBalance,
  grindExitVelocity,
  grindProfile,
  manualSupportOffsets,
  projectedGrindSpeed,
  railSurfaceHeight,
  stepBalance,
} from '../src/game/SkateSystems.js';
import { SkateTricks } from '../src/game/SkateTricks.js';
import { DirectionTapDetector } from '../src/input/DirectionTapDetector.js';

const validCapture = (overrides = {}) => captureEligibility({
  surfaceDistance: 0.08,
  verticalDelta: 0.08,
  velocityY: -0.8,
  tangentAlignment: 0.82,
  tangentSpeed: 3.4,
  trajectoryClosing: 0.03,
  trickName: '50-50',
  ...overrides,
});

function simulateBalance({ seconds = 8, dt = 1 / 120, correction = 0, difficulty = 1, disturbance = 0 } = {}) {
  const state = createBalanceState(0.72);
  if (disturbance) disturbBalance(state, disturbance);
  let result = null;
  for (let t = 0; t < seconds; t += dt) {
    result = stepBalance(state, { dt, duration: t, difficulty, speed: 6, comboDuration: t, correction, steering: 0 });
    if (result.failed) break;
  }
  return { state, result };
}

test('1. rail surface height respects radius', () => {
  assert.equal(railSurfaceHeight(1.2, 0.09, 0.05), 1.34);
});

test('2. deck does not penetrate rail', () => {
  const profile = grindProfile('Boardslide');
  assert.ok(railSurfaceHeight(0, 0.06, profile.clearance) > 0.06);
});

test('3. 50-50 contact uses both trucks', () => {
  assert.equal(grindProfile('50-50').contact, 'bothTrucks');
});

test('4. 5-0 contact uses rear truck', () => {
  assert.equal(grindProfile('5-0').contact, 'rearTruck');
});

test('5. boardslide orientation is transverse', () => {
  assert.ok(Math.abs(Math.abs(grindProfile('Boardslide').presentation.yaw) - Math.PI / 2) < 1e-9);
});

test('6. Smith/Feeble first-pass orientation differs', () => {
  assert.ok(grindProfile('Smith').presentation.roll < 0);
  assert.ok(grindProfile('Feeble').presentation.roll > 0);
});

test('7. perpendicular 50-50 approach does not capture', () => {
  assert.equal(validCapture({ tangentAlignment: 0.02 }).eligible, false);
});

test('8. valid aligned approach captures', () => {
  assert.equal(validCapture().eligible, true);
});

test('9. low-speed capture preserves the incoming speed', () => {
  assert.equal(projectedGrindSpeed(0.21), 0.21);
  assert.equal(projectedGrindSpeed(0.03), 0.03);
  assert.equal(projectedGrindSpeed(0), 0);
});

test('10. rail-end exit is detected', () => {
  assert.equal(advanceRailCoordinate(4.9, 1, 2, 0.1, 5, false).ended, true);
});

test('11. Ollie-out adds vertical exit impulse', () => {
  const natural = grindExitVelocity(4, false);
  const pop = grindExitVelocity(4, true);
  assert.equal(natural.along, pop.along);
  assert.ok(pop.vertical > natural.vertical);
});

test('12. cooldown prevents immediate recapture', () => {
  assert.equal(canAttemptGrind(0.1), false);
  assert.equal(canAttemptGrind(0), true);
});

test('13. manual physics selects rear/front truck supports', () => {
  const rear = manualSupportOffsets('manual');
  const front = manualSupportOffsets('noseManual');
  assert.ok(rear.every(x => x.longitudinal < 0));
  assert.ok(front.every(x => x.longitudinal > 0));
});

test('14. queued manual around landing works', () => {
  const tricks = new SkateTricks();
  tricks.tick(0.01);
  tricks.resolve({ directionTaps: ['up'] }, { grounded: false, grinding: false, speed: 4, manual: null });
  tricks.tick(0.10);
  tricks.resolve({ directionTaps: ['down'] }, { grounded: false, grinding: false, speed: 4, manual: null });
  assert.equal(tricks.manualBridgePending(), true);
  tricks.tick(0.05);
  const events = tricks.resolve({ directionTaps: [] }, { grounded: true, grinding: false, speed: 4, manual: null });
  assert.equal(events.manual, 'manual');
});

test('15. previous combo remains alive through pending manual', () => {
  const tricks = new SkateTricks();
  tricks.record('Kickflip', 100);
  tricks.resolve({ directionTaps: ['up'] }, { grounded: true, grinding: false, speed: 4, manual: null });
  assert.equal(tricks.manualBridgePending(), true);
  assert.equal(tricks.combo.length, 1);
  assert.equal(tricks.combo[0].name, 'Kickflip');
});

test('16. analog threshold crossing generates a tap', () => {
  const detector = new DirectionTapDetector();
  assert.deepEqual(detector.update(0, 0.70), ['up']);
});

test('17. held analog stick does not repeat taps', () => {
  const detector = new DirectionTapDetector();
  assert.deepEqual(detector.update(0, 0.70), ['up']);
  assert.deepEqual(detector.update(0, 0.92), []);
  assert.deepEqual(detector.update(0, 0.70), []);
  detector.update(0, 0.2);
  assert.deepEqual(detector.update(0, 0.70), ['up']);
});

test('18. grind balance drifts', () => {
  const { state } = simulateBalance({ seconds: 2.4, difficulty: 1.3 });
  assert.ok(Math.abs(state.value) > 0.015);
});

test('19. manual balance drifts', () => {
  const { state } = simulateBalance({ seconds: 2.4, difficulty: 1.0 });
  assert.ok(Math.abs(state.value) > 0.01);
});

test('20. correction input saves balance', () => {
  const ignored = simulateBalance({ seconds: 5.5, difficulty: 1.25, correction: 0 });
  const corrected = simulateBalance({ seconds: 5.5, difficulty: 1.25, correction: -0.28 });
  assert.ok(Math.abs(corrected.state.value) < Math.abs(ignored.state.value));
});

test('21. ignored balance eventually fails', () => {
  const ignored = simulateBalance({ seconds: 12, difficulty: 1.35, correction: 0 });
  assert.equal(ignored.result.failed, true);
});

test('22. flatland-style disturbance increases instability', () => {
  const clean = simulateBalance({ seconds: 2.2, difficulty: 1 });
  const disturbed = simulateBalance({ seconds: 2.2, difficulty: 1, disturbance: 0.7 });
  assert.ok(Math.abs(disturbed.state.value) > Math.abs(clean.state.value));
});

test('23. grind trick switch disturbance increases instability', () => {
  const state = createBalanceState(0.72);
  const before = state.disturbance;
  disturbBalance(state, 0.46);
  assert.ok(state.disturbance > before);
});

test('24. duration score accumulation is stable across frame rates', () => {
  const run = (dt) => {
    const tricks = new SkateTricks();
    tricks.record('Manual', 100);
    for (let t = 0; t < 3 - 1e-9; t += dt) tricks.addDuration(28 * Math.min(dt, 3 - t));
    return tricks.settle().points;
  };
  assert.equal(run(1 / 30), run(1 / 60));
  assert.equal(run(1 / 60), run(1 / 120));
});
