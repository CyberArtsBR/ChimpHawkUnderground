import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { captureTakeoffContext } from '../src/game/core/TakeoffContext.js';
import { composeLaunchImpulse, rampLaunchBonus } from '../src/game/core/LaunchEnergyModel.js';
import { StableRampReturnSkillStreetPhysics } from '../src/game/StableRampReturnSkillStreetPhysics.js';

function flatWorld() {
  const root = new THREE.Group();
  const floor = new THREE.Mesh(
    new THREE.BoxGeometry(20, 0.1, 20),
    new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }),
  );
  floor.position.y = -0.05;
  root.add(floor);
  root.updateMatrixWorld(true);
  return root;
}

test('flat-ground ollie has no ramp bonus and preserves requested impulse', () => {
  const context = captureTakeoffContext({
    grounded: true,
    normal: new THREE.Vector3(0, 1, 0),
    velocity: new THREE.Vector3(0, 0, -6),
    forward: new THREE.Vector3(0, 0, -1),
    requestedImpulse: 4.8,
  });

  assert.equal(context.rampBonus, 0);
  assert.equal(context.composedImpulse, 4.8);
  assert.equal(context.rampContext, false);
  assert.ok(context.takeoffFacing.distanceTo(new THREE.Vector3(0, 0, -1)) < 1e-12);
  assert.ok(Math.abs(context.takeoffHeading) < 1e-12);
});

test('remembered climb bonus survives a flat final lip frame', () => {
  const context = captureTakeoffContext({
    grounded: true,
    normal: new THREE.Vector3(0, 1, 0),
    velocity: new THREE.Vector3(0, 0.02, -9),
    forward: new THREE.Vector3(0, 0, -1),
    requestedImpulse: 1.2,
    rampLaunchMemory: 5.1,
    rampLaunchMemoryTime: 0.18,
  });

  assert.equal(context.currentRampBonus, 0);
  assert.equal(context.rememberedRampBonus, 5.1);
  assert.equal(context.rampBonus, 5.1);
  assert.equal(context.composedImpulse, composeLaunchImpulse({ ollieImpulse: 1.2, rampBonus: 5.1 }));
  assert.equal(context.rampContext, true);
});

test('live slope sample uses the same authoritative launch-energy model', () => {
  const velocity = new THREE.Vector3(0, 3.4, -9.5);
  const normal = new THREE.Vector3(0, 0.72, 0.694).normalize();
  const expected = rampLaunchBonus({
    speed: velocity.length(),
    normalY: normal.y,
    verticalSpeed: velocity.y,
  });
  const context = captureTakeoffContext({
    grounded: true,
    normal,
    velocity,
    forward: new THREE.Vector3(0, 0, -1),
  });

  assert.ok(expected > 0);
  assert.equal(context.currentRampBonus, expected);
  assert.equal(context.rampBonus, expected);
  assert.equal(context.rampContext, true);
});

test('authored transition is ramp context even without a sampled boost', () => {
  const context = captureTakeoffContext({
    grounded: true,
    normal: new THREE.Vector3(0, 1, 0),
    velocity: new THREE.Vector3(0, 0, -4),
    forward: new THREE.Vector3(0, 0, -1),
    transition: {
      transitionId: 'eastern-quarter',
      transitionType: 'quarter',
    },
  });

  assert.equal(context.rampBonus, 0);
  assert.equal(context.rampContext, true);
  assert.equal(context.transitionProvided, true);
  assert.equal(context.transitionId, 'eastern-quarter');
  assert.equal(context.transitionType, 'quarter');
});

test('canonical heading defines takeoff facing even if projected forward and travel disagree', () => {
  const forward = new THREE.Vector3(-1, 0, 0);
  const travel = new THREE.Vector3(0, 0, 1);
  const context = captureTakeoffContext({
    grounded: false,
    forward,
    travelDirection: travel,
    heading: 0,
    stance: -1,
  });

  assert.ok(context.takeoffFacing.distanceTo(new THREE.Vector3(0, 0, -1)) < 1e-9);
  assert.ok(Math.abs(context.takeoffHeading) < 1e-9);
  assert.equal(context.takeoffStance, -1);
});

test('context records buffered ramp-exit intent without mutating source vectors', () => {
  const velocity = new THREE.Vector3(1, 2, 3);
  const forward = new THREE.Vector3(0, 0, -1);
  const context = captureTakeoffContext({
    grounded: true,
    normal: new THREE.Vector3(0, 0.8, 0.6),
    velocity,
    forward,
    rampExitIntentTime: 0.12,
  });

  assert.equal(context.exitRequested, true);
  velocity.set(99, 99, 99);
  forward.set(1, 0, 0);
  assert.notEqual(context.speed, velocity.length());
  assert.ok(context.takeoffFacing.distanceTo(new THREE.Vector3(0, 0, -1)) < 1e-12);
});

test('StableRampReturn runtime consumes canonical takeoff orientation/ramp context', () => {
  const p = new StableRampReturnSkillStreetPhysics({
    collision: flatWorld(),
    spawn: [0, 0.5, 0],
    rails: [],
  });
  p.grounded = true;
  p.normal.set(0, 1, 0);
  p.heading = Math.PI / 2;
  p.stance = -1;
  p.groundDirection();
  p.velocity.copy(p.forward).multiplyScalar(8);
  p.rampLaunchMemory = 4.9;
  p.rampLaunchMemoryTime = 0.16;

  p.takeoff(0, null);

  assert.ok(p.airTakeoffFacing.x < -0.999);
  assert.ok(Math.abs(p.airTakeoffFacing.z) < 1e-9);
  assert.ok(Math.abs(p.airTakeoffHeading - Math.PI / 2) < 1e-9);
  assert.equal(p.airTakeoffStance, -1);
  assert.equal(p.airTakeoffFromRamp, true,
    'remembered climb context must survive a flat exact takeoff frame');
});
