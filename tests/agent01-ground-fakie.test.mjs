import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { StatefulSkillStreetPhysics } from '../src/game/StatefulSkillStreetPhysics.js';
import { MOVEMENT_STATE } from '../src/game/StreetPhysics.js';
import {
  GROUND_MOTOR,
  arcadeTurnGain,
  groundControlIntent,
  groundSteeringDelta,
  passiveRollingResistance,
  resolveGroundMotion,
  resolveGroundPropulsion,
  signedGroundSpeed,
} from '../src/game/core/GroundMotor.js';
import { resolveTravelState } from '../src/game/core/TravelState.js';

const EPS = 1e-9;
const dt = 1 / 120;
const flat = new THREE.Vector3(0, 1, 0);

function flatWorld() {
  const root = new THREE.Group();
  const floor = new THREE.Mesh(
    new THREE.BoxGeometry(80, 0.1, 80),
    new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }),
  );
  floor.position.y = -0.05;
  root.add(floor);
  root.updateMatrixWorld(true);
  return root;
}

function player() {
  return new StatefulSkillStreetPhysics({
    collision: flatWorld(),
    spawn: [0, 0.5, 0],
    rails: [],
  });
}

function landingSupport() {
  return {
    supported: true,
    count: 4,
    frontSupported: 2,
    rearSupported: 2,
    position: new THREE.Vector3(0, 0.015, 0),
    supportPoint: new THREE.Vector3(),
    normal: flat.clone(),
    maxWheelGap: 0,
    contacts: [],
  };
}

test('agent01: legacy 12 m/s park carve reaches its full high-speed steer rate', () => {
  // Regression: the implementation used 17 m/s while the existing physics
  // regression and historical runtime both use 12 m/s for rate saturation.
  assert.equal(GROUND_MOTOR.steerFullSpeed, 12);
  for (const speed of [0, 6, 12, 17, -12]) {
    const rate = speed === 0 ? GROUND_MOTOR.steerRateLowSpeed
      : GROUND_MOTOR.steerRateLowSpeed +
        (GROUND_MOTOR.steerRateHighSpeed - GROUND_MOTOR.steerRateLowSpeed) *
        Math.min(1, Math.abs(speed) / 12);
    const gain = arcadeTurnGain(speed);
    const expected = -Math.min(gain, GROUND_MOTOR.maxPhysicalSteer) * rate * dt;
    assert.ok(Math.abs(groundSteeringDelta({ steer: 1, speed, dt }) - expected) < EPS,
      `incorrect carve speed curve at ${speed} m/s`);
  }
});

test('agent01: down+turn sharp-carves in fakie instead of triggering the brake', () => {
  for (const speed of [8, -8]) {
    const intent = groundControlIntent({ speed, steer: 0.75, drive: -1 });
    assert.equal(intent.sharpTurn, true, `sharp turn disabled at ${speed} m/s`);
    assert.equal(intent.braking, false, `fakie carve braking at ${speed} m/s`);
    assert.equal(intent.pushingAllowed, false);
    const carve = resolveGroundPropulsion({
      speed, travelSign: Math.sign(speed), steer: 0.75, drive: -1,
      normalY: 1, forwardY: 0, dt,
    });
    const brake = resolveGroundPropulsion({
      speed, travelSign: Math.sign(speed), steer: 0.75, drive: -1,
      brake: true, normalY: 1, forwardY: 0, dt,
    });
    assert.equal(carve.braking, false);
    assert.ok(Math.abs(carve.nextSpeed) > Math.abs(brake.nextSpeed) + 0.1);
  }
  assert.equal(groundControlIntent({
    speed: -8, steer: 0, drive: -1,
  }).braking, true, 'down without turn still brakes in fakie');
});

test('agent01: steep slow rollback releases the brake in either travel sign', () => {
  for (const speed of [-0.5, 0.5]) {
    const intent = groundControlIntent({
      speed, steer: 0, drive: -1, normalY: 0.48,
    });
    assert.equal(intent.braking, false);
  }
});

test('agent01: Ollie 180 touchdown keeps original world velocity and fakie state', () => {
  const p = player();
  p.setMovementState(MOVEMENT_STATE.AIR);
  p.airTime = 0.5;
  p.heading = Math.PI;
  p.airHeading = Math.PI;
  p.airSpin = Math.PI;
  p.groundDirection();
  p.velocity.set(0, -1.1, -8.5);
  assert.equal(p.land(landingSupport()), true);
  assert.equal(p.rollingSign, -1);
  assert.equal(p.fakie, true);
  assert.ok(p.velocity.z < -8);
  const beforeHeading = p.heading;
  p.stepGround(dt, { brake: false }, 0);
  assert.ok(Math.abs(p.heading - beforeHeading) < EPS);
  assert.ok(p.velocity.z < -8, 'ground motor reversed world movement after 180');
  assert.equal(p.rollingSign, -1);
  p.syncTravelDirection();
  assert.equal(p.fakie, true);
  assert.ok(p.travelDirection.z < -0.999);
  assert.equal(p.landingYawInvariantViolations, 0);
});

test('agent01: Ollie 360 touchdown stays regular while retaining forward motion', () => {
  const p = player();
  p.setMovementState(MOVEMENT_STATE.AIR);
  p.airTime = 0.5;
  p.heading = Math.PI * 2;
  p.airHeading = p.heading;
  p.airSpin = Math.PI * 2;
  p.groundDirection();
  p.velocity.set(0, -1.1, -8.5);
  assert.equal(p.land(landingSupport()), true);
  assert.equal(p.rollingSign, 1);
  assert.equal(p.fakie, false);
  p.stepGround(dt, { brake: false }, 0);
  assert.ok(p.velocity.z < -8);
});

test('agent01: identical left/right control curves travel the same world-side in fakie', () => {
  for (const steer of [-0.65, 0.65]) {
    const regular = resolveGroundMotion({
      heading: 0, normal: flat,
      speedState: { speed: 8, travelSign: 1 }, steer, dt,
    });
    const fakie = resolveGroundMotion({
      heading: Math.PI, normal: flat,
      speedState: { speed: -8, travelSign: -1 }, steer, dt,
    });
    assert.ok(regular.velocity.x * fakie.velocity.x > 0,
      'fakie steering turned opposite the world-side from regular');
    assert.ok(Math.abs(regular.velocity.x - fakie.velocity.x) < EPS);
    assert.ok(regular.velocity.z < 0 && fakie.velocity.z < 0);
  }
});

test('agent01: 180 derives reverse deck sign independently of camera orientation', () => {
  const velocity = new THREE.Vector3(0, 0, -9);
  const state = resolveTravelState({ velocity, deckHeading: Math.PI });
  assert.equal(state.fakie, true);
  assert.equal(state.rollingSign, -1);
  assert.ok(state.travelDirection.z < -0.999);
  const speedState = signedGroundSpeed({
    velocity, forward: state.deckForward, rollingSign: state.rollingSign,
  });
  assert.ok(speedState.speed < -8.9);
});

test('agent01: uphill preserves useful speed, downhill accelerates, hard brake stops', () => {
  const climbNormal = new THREE.Vector3(0, Math.cos(Math.PI / 6), Math.sin(Math.PI / 6));
  const uphill = resolveGroundMotion({
    normal: climbNormal, speedState: { speed: 12.5, travelSign: 1 },
    dt, drive: 0,
  });
  const downhill = resolveGroundMotion({
    normal: climbNormal, speedState: { speed: -12.5, travelSign: -1 },
    dt, drive: 0,
  });
  assert.ok(uphill.speed > 12, 'one ground step bled too much ramp energy');
  assert.ok(Math.abs(downhill.speed) > 12.5, 'downhill gravity lost reverse momentum');
  const stopped = resolveGroundPropulsion({
    speed: -2, travelSign: -1, brake: true, dt: 0.25,
  });
  assert.equal(stopped.nextSpeed, 0);
});

test('agent01: flat neutral rolling and overspeed drag are bounded across step rates', () => {
  const run = hz => {
    let speed = 22;
    for (let i = 0; i < hz * 2; i++) {
      speed = resolveGroundPropulsion({
        speed, travelSign: 1, normalY: 1,
        forwardY: 0, manual: true, dt: 1 / hz,
      }).nextSpeed;
      assert.ok(Number.isFinite(speed));
      assert.ok(speed >= 0 && speed <= GROUND_MOTOR.absoluteSpeedCap);
    }
    return speed;
  };
  const results = [30, 60, 120, 144].map(run);
  assert.ok(Math.max(...results) - Math.min(...results) < 0.1,
    `unexpected frame-step drag drift: ${results}`);
  assert.ok(results.every(s => s < 22 && s > 0));
  assert.ok(passiveRollingResistance(22) > passiveRollingResistance(12));
});
