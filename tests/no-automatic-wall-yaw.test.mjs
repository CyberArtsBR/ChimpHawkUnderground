import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { MomentumRollSkillStreetPhysics } from '../src/game/MomentumRollSkillStreetPhysics.js';
import { StatefulSkillStreetPhysics } from '../src/game/StatefulSkillStreetPhysics.js';
import { MOVEMENT_STATE, StreetPhysics } from '../src/game/StreetPhysics.js';

function wallWorld() {
  const root = new THREE.Group();
  const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
  const floor = new THREE.Mesh(new THREE.BoxGeometry(12, 0.1, 12), material);
  floor.position.y = -0.05;
  root.add(floor);
  const wall = new THREE.Mesh(new THREE.BoxGeometry(5, 2.4, 0.1), material.clone());
  wall.position.set(0, 1.2, -0.34);
  wall.userData.surface = 'solid';
  root.add(wall);
  root.updateMatrixWorld(true);
  return root;
}

function armGrounded(p, heading = 0.31) {
  p.position.set(0, 0.015, 0);
  p.normal.set(0, 1, 0);
  p.heading = heading;
  p.groundDirection();
  p.setMovementState(MOVEMENT_STATE.GROUND);
  p.velocity.copy(p.forward).multiplyScalar(8);
  p.rollingSign = 1;
  p.fakie = false;
  return heading;
}

test('MomentumRoll itself has no automatic wall-turn authority', () => {
  const p = new MomentumRollSkillStreetPhysics({
    collision: wallWorld(),
    spawn: [0, 0.5, 1.5],
    rails: [],
  });
  const heading = armGrounded(p);

  assert.equal(p.detectGroundWallImpact(1 / 120), null);
  assert.equal(p.applyWallRecovery({
    point: new THREE.Vector3(0, 0.3, -0.3),
    normal: new THREE.Vector3(0, 0, 1),
    speed: 8,
    broadWall: true,
  }), false);
  assert.equal(p.heading, heading);
});

test('final runtime and lower momentum layer agree: contact cannot create yaw', () => {
  const p = new StatefulSkillStreetPhysics({
    collision: wallWorld(),
    spawn: [0, 0.5, 1.5],
    rails: [],
  });
  const heading = armGrounded(p);
  p.stepGround(1 / 120, { brake: false }, 0);
  assert.equal(p.heading, heading, 'only explicit steer may alter grounded heading');
});


test('base StreetPhysics landing preserves player yaw on steep support', () => {
  const p = new StreetPhysics({
    collision: wallWorld(),
    spawn: [0, 0.5, 1.5],
    rails: [],
  });
  const heading = 0.41;
  p.heading = heading;
  p.airHeading = heading;
  p.airSpin = 0;
  p.grounded = false;
  p.airTime = 0.4;
  p.groundDirection();

  const normal = new THREE.Vector3(0.55, 0.75, 0.37).normalize();
  const boardTangent = p.forward.clone().projectOnPlane(normal).normalize();
  p.velocity.copy(boardTangent).multiplyScalar(5).addScaledVector(normal, -0.6);

  const point = new THREE.Vector3(0, 0, 0);
  p.position.copy(point).addScaledVector(normal, 0.018);
  const landed = p.land({
    wheelCount: 4,
    frontSupported: 2,
    rearSupported: 2,
    point,
    normal,
    maxWheelGap: 0,
  });

  assert.equal(landed, true);
  assert.equal(p.heading, heading, 'base landing contact must not derive yaw from support geometry');
});
