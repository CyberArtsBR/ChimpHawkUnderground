import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { StatefulSkillStreetPhysics } from '../src/game/StatefulSkillStreetPhysics.js';
import { StableRampReturnSkillStreetPhysics } from '../src/game/StableRampReturnSkillStreetPhysics.js';
import { MOVEMENT_STATE } from '../src/game/StreetPhysics.js';

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

function support(normal = new THREE.Vector3(0, 1, 0)) {
  return {
    supported: true,
    count: 4,
    frontSupported: 2,
    rearSupported: 2,
    position: new THREE.Vector3(0, 0.015, 0),
    supportPoint: new THREE.Vector3(0, 0, 0),
    normal: normal.clone().normalize(),
    maxWheelGap: 0,
    contacts: [],
  };
}

function physics() {
  return new StatefulSkillStreetPhysics({
    collision: flatWorld(),
    spawn: [0, 0.5, 0],
    rails: [],
  });
}

function stableRampPhysics() {
  return new StableRampReturnSkillStreetPhysics({
    collision: flatWorld(),
    spawn: [0, 0.5, 0],
    rails: [],
  });
}

test('normal landing finishes with no hidden contact yaw write', () => {
  const p = physics();
  const s = support();
  p.setMovementState(MOVEMENT_STATE.AIR);
  p.airTime = 0.4;
  p.heading = 0.37;
  p.airHeading = 0.37;
  p.groundDirection();
  p.velocity.copy(p.forward).multiplyScalar(5).add(new THREE.Vector3(0, -1.2, 0));

  assert.equal(p.land(s), true);
  assert.equal(p.landingYawInvariantViolations, 0);
  assert.equal(p.lastLandingYawInvariant?.violated, false);
  assert.ok(Math.abs(p.heading - 0.37) < 1e-10);
});

test('explicit 180 landing is player-authored yaw, not a contact yaw violation', () => {
  const p = physics();
  const s = support();
  p.setMovementState(MOVEMENT_STATE.AIR);
  p.airTime = 0.5;
  p.heading = Math.PI;
  p.airHeading = Math.PI;
  p.airSpin = Math.PI;
  p.groundDirection();
  p.velocity.set(0, -1.1, -5.5);

  assert.equal(p.land(s), true);
  assert.equal(p.landingYawInvariantViolations, 0);
  assert.equal(p.lastLandingYawInvariant?.violated, false);
  assert.ok(Math.abs(Math.abs(p.heading) - Math.PI) < 1e-10);
});

test('passive ramp return keeps takeoff yaw and becomes fakie without contact yaw', () => {
  const p = physics();
  const s = support(new THREE.Vector3(0, 0.72, 0.694));
  p.position.copy(s.position).addScaledVector(s.normal, 0.04);
  p.setMovementState(MOVEMENT_STATE.AIR);
  p.airTime = 0.55;
  p.heading = 0;
  p.airHeading = 0;
  p.airSpin = 0;
  p.groundDirection();
  p.airTakeoffFromRamp = true;
  p.airTakeoffFacing.set(0, 0, -1);
  p.airTakeoffHeading = 0;
  p.airTakeoffStance = 1;

  const returnTangent = new THREE.Vector3(0, 0, 1).projectOnPlane(s.normal).normalize();
  p.velocity.copy(returnTangent).multiplyScalar(5).addScaledVector(s.normal, -1.1);

  assert.equal(p.land(s), true);
  assert.equal(p.landingYawInvariantViolations, 0);
  assert.equal(p.lastLandingYawInvariant?.violated, false);
  assert.ok(Math.abs(p.heading) < 1e-10, `ramp return invented yaw: ${p.heading}`);
  assert.equal(p.fakie, true, 'same-yaw return should be fakie relative to reversed travel');
  assert.ok(p.velocity.z > 0, 'return travel should descend opposite the deck nose');
});

test('final direct landing performs one immediate travel sync through post pipeline', () => {
  const p = physics();
  const s = support(new THREE.Vector3(0, 0.72, 0.694));
  p.position.copy(s.position).addScaledVector(s.normal, 0.04);
  p.setMovementState(MOVEMENT_STATE.AIR);
  p.airTime = 0.45;
  p.heading = 0;
  p.airHeading = 0;
  p.airTakeoffFromRamp = true;
  p.airTakeoffFacing.set(0, 0, -1);
  p.airTakeoffStance = 1;
  p.airSpin = 0;
  p.groundDirection();
  p.velocity.copy(new THREE.Vector3(0, 0, 1).projectOnPlane(s.normal).normalize())
    .multiplyScalar(5)
    .addScaledVector(s.normal, -1);

  const originalSync = p.syncTravelDirection.bind(p);
  let syncCalls = 0;
  p.syncTravelDirection = (...args) => {
    syncCalls += 1;
    return originalSync(...args);
  };

  assert.equal(p.land(s), true);
  assert.equal(syncCalls, 1,
    'nested legacy land hooks must defer immediate travel sync to LandingPostPipeline');
  assert.equal(p.fakie, true);
  assert.equal(p.landingYawInvariantViolations, 0);
});

test('stable ramp compatibility path also runs exactly one post-landing travel sync', () => {
  const p = stableRampPhysics();
  const s = support(new THREE.Vector3(0, 0.72, 0.694));
  p.position.copy(s.position).addScaledVector(s.normal, 0.04);
  p.setMovementState(MOVEMENT_STATE.AIR);
  p.airTime = 0.45;
  p.heading = 0;
  p.airHeading = 0;
  p.airTakeoffFromRamp = true;
  p.airTakeoffFacing.set(0, 0, -1);
  p.airTakeoffStance = 1;
  p.airSpin = 0;
  p.groundDirection();
  p.velocity.copy(new THREE.Vector3(0, 0, 1).projectOnPlane(s.normal).normalize())
    .multiplyScalar(5)
    .addScaledVector(s.normal, -1);

  const originalSync = p.syncTravelDirection.bind(p);
  let syncCalls = 0;
  p.syncTravelDirection = (...args) => {
    syncCalls += 1;
    return originalSync(...args);
  };

  assert.equal(p.land(s), true);
  assert.equal(syncCalls, 1,
    'StableRampReturn compatibility landing must not execute nested travel hooks');
  assert.equal(p.fakie, true);
  assert.equal(p.landingYawInvariantViolations || 0, 0);
});
