import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  GROUND_MOTOR,
  automaticPushAcceleration,
  groundSteeringDelta,
  passiveRollingResistance,
  resolveGroundMotion,
  resolveGroundPropulsion,
  signedGroundSpeed,
  smoothGroundSteer,
} from '../src/game/core/GroundMotor.js';
import { resolveTravelState } from '../src/game/core/TravelState.js';

const DT = 1 / 120;
const U = new THREE.Vector3(0, 1, 0);
const step = (speed, opts = {}, dt = DT) => resolveGroundPropulsion({
  speed,
  travelSign: speed < 0 ? -1 : 1,
  normalY: 1,
  forwardY: 0,
  dt,
  ...opts,
}).nextSpeed;

test('aaa01: post-transition speed is not hard-clamped at 23 m/s', () => {
  for (const sign of [-1, 1]) {
    const speed = step(sign * 36, { manual: false });
    assert.ok(Math.abs(speed) > 35.95);
    assert.ok(Math.abs(speed) < 36);
    assert.equal(Math.sign(speed), sign);
  }
});

test('aaa01: progressive drag is smooth across former overspeed threshold', () => {
  const values = [20.9, 21, 21.1, 25, 35].map(v => passiveRollingResistance(v));
  assert.ok(values.every(Number.isFinite));
  assert.ok(values[2] - values[1] < 0.05);
  assert.ok(values[4] > values[3] && values[3] > values[2]);
  assert.ok(values[4] < 5);
});

test('aaa01: manual keeps low-speed momentum and only gently damps overspeed', () => {
  for (const sign of [-1, 1]) {
    let low = sign * 8, high = sign * 22;
    for (let i = 0; i < 240; i++) {
      low = step(low, { manual: true });
      high = step(high, { manual: true });
    }
    assert.equal(low, sign * 8);
    assert.ok(Math.abs(high) > 21.8 && Math.abs(high) < 22);
  }
});

test('aaa01: push traction smoothly vanishes approaching cruise speed', () => {
  const a = [16, 17, 17.9, 17.99].map(speed => automaticPushAcceleration({ speed }));
  assert.ok(a[0] > a[1] && a[1] > a[2] && a[2] > a[3] && a[3] > 0);
  assert.ok(a[3] < 0.1);
  assert.equal(automaticPushAcceleration({ speed: 18 }), 0);
  assert.equal(automaticPushAcceleration({ speed: 2, normalY: 0.98 }), 0);
});

test('aaa01: side-slip from wall cannot masquerade as forward propulsion', () => {
  const measured = signedGroundSpeed({
    velocity: new THREE.Vector3(9, 0, -2),
    forward: new THREE.Vector3(0, 0, -1),
    rollingSign: 1,
  });
  assert.ok(Math.abs(measured.speed - 2) < 1e-10);
  assert.ok(measured.magnitude < 3);
});

test('aaa01: high-speed yaw eases smoothly while 17 m/s handling is retained', () => {
  const rate = s => Math.abs(groundSteeringDelta({ speed: s, steer: 1, dt: 1 }));
  assert.ok(rate(17) > rate(30) && rate(30) > rate(50));
  assert.ok(rate(50) * 50 < rate(17) * 50);
  assert.ok(Math.abs(rate(-30) - rate(30)) < 1e-12);
  assert.ok(Math.abs(rate(17) - GROUND_MOTOR.turnGainHighSpeed * GROUND_MOTOR.steerRateHighSpeed) < 1e-12);
});

test('aaa01: steer response is deterministic across rates and reversals', () => {
  const run = hz => {
    let v = 0;
    for (let i = 0; i < hz; i++) v = smoothGroundSteer({
      previous: v, target: 1, speed: 20, dt: 1 / hz,
    });
    return v;
  };
  assert.ok(Math.abs(run(30) - run(144)) < 1e-11);
  let v = 1;
  v = smoothGroundSteer({ previous: v, target: -1, speed: 25, dt: DT });
  assert.ok(v < 1 && v > -1);
});

test('aaa01: gravity accelerates downhill and slows uphill without a discontinuity', () => {
  const incline = new THREE.Vector3(0, Math.cos(Math.PI / 6), Math.sin(Math.PI / 6));
  const uphill = resolveGroundMotion({
    heading: 0, normal: incline, speedState: { speed: 12, travelSign: 1 }, dt: DT,
  });
  const downhill = resolveGroundMotion({
    heading: 0, normal: incline, speedState: { speed: -12, travelSign: -1 }, dt: DT,
  });
  assert.ok(uphill.speed < 12 && uphill.speed > 11.8);
  assert.ok(downhill.speed < -12);
  assert.ok(uphill.forward.dot(incline) < 1e-9);
});

test('aaa01: explicit braking works in fakie and regular and cannot reverse travel', () => {
  for (const sign of [-1, 1]) {
    const coast = Math.abs(step(sign * 10, { brake: false }, 0.2));
    const brake = Math.abs(step(sign * 10, { brake: true }, 0.2));
    assert.ok(brake < coast - 2);
    assert.equal(step(sign, { brake: true }, 1), 0);
  }
});

test('aaa01: crouch is aerodynamic but does not grant an extra automatic throttle', () => {
  assert.ok(passiveRollingResistance(18, GROUND_MOTOR, true)
    < passiveRollingResistance(18, GROUND_MOTOR, false));
  assert.ok(automaticPushAcceleration({ speed: 7, crouched: true })
    < automaticPushAcceleration({ speed: 7, crouched: false }));
});

test('aaa01: fakie sign is stable through near-perpendicular wall-slide jitter', () => {
  const travel = resolveTravelState({
    velocity: new THREE.Vector3(6, 0, -0.02),
    deckHeading: 0,
    previousSign: -1,
  });
  assert.equal(travel.rollingSign, -1);
  const opposite = resolveTravelState({
    velocity: new THREE.Vector3(0, 0, 6),
    deckHeading: 0,
    previousSign: 1,
  });
  assert.equal(opposite.rollingSign, -1);
});

test('aaa01: neutral momentum and manual are stable across fixed step rates', () => {
  const run = hz => {
    let speed = 28;
    for (let i = 0; i < hz * 3; i++)
      speed = step(speed, { manual: false }, 1 / hz);
    return speed;
  };
  const readings = [30, 60, 120, 144].map(run);
  assert.ok(Math.max(...readings) - Math.min(...readings) < 0.08);
  assert.ok(readings.every(v => v > 23));
});
