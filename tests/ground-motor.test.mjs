import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  GROUND_MOTOR,
  arcadeTurnGain,
  automaticPushAcceleration,
  groundSteeringDelta,
  passiveRollingResistance,
  rampReentrySteerScale,
  resolveGroundMotion,
  resolveGroundPropulsion,
  signedGroundSpeed,
  transitionGravityScale,
} from '../src/game/core/GroundMotor.js';

test('signed ground speed preserves canonical fakie sign at zero speed', () => {
  const state = signedGroundSpeed({
    velocity: new THREE.Vector3(),
    forward: new THREE.Vector3(0, 0, -1),
    rollingSign: -1,
  });
  assert.equal(state.travelSign, -1);

  const step = resolveGroundPropulsion({
    speed: state.speed,
    travelSign: state.travelSign,
    forwardY: 0,
    normalY: 1,
    drive: 0,
    dt: 1 / 120,
  });
  assert.ok(step.nextSpeed < 0, `fakie auto-push restarted regular: ${step.nextSpeed}`);
});

test('forward hold remains non-propulsive compared with neutral input', () => {
  const base = {
    speed: 4,
    travelSign: 1,
    forwardY: 0,
    normalY: 1,
    dt: 1 / 120,
  };
  const neutral = resolveGroundPropulsion({ ...base, drive: 0 });
  const forward = resolveGroundPropulsion({ ...base, drive: 1 });
  assert.equal(forward.nextSpeed, neutral.nextSpeed);
  assert.equal(forward.autoPushActive, neutral.autoPushActive);
});

test('ground motor keeps auto-push off transition slopes', () => {
  assert.equal(automaticPushAcceleration({ speed: 2, normalY: 0.80 }), 0);
  assert.equal(automaticPushAcceleration({ speed: 2, normalY: 0.94 }), 0);
  assert.ok(automaticPushAcceleration({ speed: 2, normalY: 1 }) > 0);
});

test('braking removes substantially more speed than rolling resistance', () => {
  const coast = resolveGroundPropulsion({
    speed: 7,
    travelSign: 1,
    normalY: 1,
    forwardY: 0,
    dt: 0.25,
  });
  const brake = resolveGroundPropulsion({
    speed: 7,
    travelSign: 1,
    normalY: 1,
    forwardY: 0,
    brake: true,
    dt: 0.25,
  });
  assert.ok(brake.nextSpeed < coast.nextSpeed - 2.5);
});

test('transition gravity preserves validated uphill/downhill scaling', () => {
  assert.equal(transitionGravityScale({
    signedSpeed: 8,
    forwardY: 0.5,
    normalY: 0.8,
  }), GROUND_MOTOR.uphillGravityScale);
  assert.equal(transitionGravityScale({
    signedSpeed: -8,
    forwardY: 0.5,
    normalY: 0.8,
  }), GROUND_MOTOR.downhillGravityScale);
  assert.equal(transitionGravityScale({
    signedSpeed: 8,
    forwardY: 0.5,
    normalY: 1,
  }), 1);
});

test('ground steering owns the complete park carve curve', () => {
  const dt = 1 / 120;
  const low = Math.abs(groundSteeringDelta({ steer: 1, speed: 0, dt }));
  const park = Math.abs(groundSteeringDelta({ steer: 1, speed: 12, dt }));
  const expectedLow = GROUND_MOTOR.turnGainLowSpeed * GROUND_MOTOR.steerRateLowSpeed * dt;
  const expectedPark = arcadeTurnGain(12)
    * GROUND_MOTOR.steerRateHighSpeed * dt;
  assert.ok(low > park);
  assert.ok(Math.abs(low - expectedLow) < 1e-9);
  assert.ok(Math.abs(park - expectedPark) < 1e-9);
});

test('reentry steering lock is part of the same canonical motor decision', () => {
  const dt = 1 / 120;
  const locked = groundSteeringDelta({
    steer: 1,
    speed: 8,
    reentryRemaining: GROUND_MOTOR.rampReentrySteerLock - 0.03,
    dt,
  });
  const blended = groundSteeringDelta({
    steer: 1,
    speed: 8,
    reentryRemaining: GROUND_MOTOR.rampReentrySteerLock - 0.13,
    dt,
  });
  const free = groundSteeringDelta({ steer: 1, speed: 8, reentryRemaining: 0, dt });
  assert.ok(Math.abs(locked) < 1e-12);
  assert.ok(Math.abs(blended) > 0 && Math.abs(blended) < Math.abs(free));
  assert.equal(rampReentrySteerScale(0), 1);
});

test('rolling resistance stays at the validated low-drag values', () => {
  assert.ok(passiveRollingResistance(6) < 0.2);
  assert.ok(passiveRollingResistance(10) < 0.35);
});


test('ground motion composes steering and propulsion without contact yaw authority', () => {
  const normal = new THREE.Vector3(0, 1, 0);
  const speedState = { speed: 8, travelSign: 1 };
  const dt = 1 / 120;
  const result = resolveGroundMotion({
    heading: 0.25,
    normal,
    speedState,
    steer: 0.6,
    drive: 0,
    dt,
  });

  const expectedDelta = groundSteeringDelta({
    steer: 0.6,
    speed: 8,
    dt,
  });
  assert.ok(Math.abs(result.heading - (0.25 + expectedDelta)) < 1e-12);
  assert.ok(Math.abs(result.forward.length() - 1) < 1e-12);
  assert.ok(Math.abs(result.velocity.length() - Math.abs(result.speed)) < 1e-10);
  assert.equal('contactNormal' in result, false);
  assert.equal('headingFromContact' in result, false);
});

test('ground motion rebuilds a finite tangent on steep transition faces', () => {
  const normal = new THREE.Vector3(0, 0.05, 0.99875).normalize();
  const result = resolveGroundMotion({
    heading: 0,
    normal,
    speedState: { speed: 7, travelSign: 1 },
    steer: 0,
    drive: 0,
    dt: 1 / 120,
  });

  assert.ok(result.forward.toArray().every(Number.isFinite));
  assert.ok(result.velocity.toArray().every(Number.isFinite));
  assert.ok(Math.abs(result.forward.dot(normal)) < 1e-9);
  assert.ok(result.forward.y > 0.9,
    `near-vertical ramp should produce climb tangent, got ${result.forward.toArray()}`);
});

test('ground motion preserves fakie sign through neutral coasting', () => {
  const result = resolveGroundMotion({
    heading: Math.PI,
    normal: new THREE.Vector3(0, 1, 0),
    speedState: { speed: -6, travelSign: -1 },
    steer: 0,
    drive: 0,
    dt: 1 / 120,
  });
  assert.ok(result.speed < 0);
  assert.ok(result.velocity.z < 0,
    `fakie world travel reversed unexpectedly: ${result.velocity.toArray()}`);
});

test('ground motion keeps reentry steering lock inside canonical transaction', () => {
  const locked = resolveGroundMotion({
    heading: 0.4,
    normal: new THREE.Vector3(0, 1, 0),
    speedState: { speed: 8, travelSign: 1 },
    steer: 1,
    reentryRemaining: GROUND_MOTOR.rampReentrySteerLock - 0.03,
    dt: 1 / 120,
  });
  assert.ok(Math.abs(locked.heading - 0.4) < 1e-12);
});

test('ground motion braking is identical to canonical propulsion result', () => {
  const normal = new THREE.Vector3(0, 1, 0);
  const speedState = { speed: 7, travelSign: 1 };
  const dt = 0.1;
  const motion = resolveGroundMotion({
    heading: 0,
    normal,
    speedState,
    brake: true,
    dt,
  });
  const propulsion = resolveGroundPropulsion({
    speed: speedState.speed,
    travelSign: speedState.travelSign,
    forwardY: 0,
    normalY: 1,
    brake: true,
    dt,
  });
  assert.ok(Math.abs(motion.speed - propulsion.nextSpeed) < 1e-12);
  assert.equal(motion.propulsion.braking, true);
});
