import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { StatefulSkillStreetPhysics } from '../src/game/StatefulSkillStreetPhysics.js';
import { MOVEMENT_STATE } from '../src/game/StreetPhysics.js';
import {
  WALL_CONTACT_AUTHORITY,
  wallClearanceCorrection,
  wallFaceContextAllows,
  wallFaceContinuityAllows,
} from '../src/game/WallContactAuthoritySkillStreetPhysics.js';

function worldWithObstacle({ width = 5, height = 2.4 } = {}) {
  const root = new THREE.Group();
  const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
  const floor = new THREE.Mesh(new THREE.BoxGeometry(12, 0.1, 12), material);
  floor.position.y = -0.05;
  root.add(floor);

  const obstacle = new THREE.Mesh(new THREE.BoxGeometry(width, height, 0.10), material.clone());
  obstacle.position.set(0, height * 0.5, -0.34);
  obstacle.userData.surface = 'solid';
  root.add(obstacle);
  root.updateMatrixWorld(true);
  return root;
}

function physics(root) {
  const p = new StatefulSkillStreetPhysics({
    collision: root,
    spawn: [0, 0.5, 1.5],
    rails: [],
  });
  p.position.set(0, 0.015, 0);
  p.normal.set(0, 1, 0);
  p.heading = 0;
  p.groundDirection();
  p.setMovementState(MOVEMENT_STATE.GROUND);
  p.velocity.set(0, 0, -8);
  p.rollingSign = 1;
  p.fakie = false;
  p.wallImpactCooldown = 0;
  p.rampReentrySteerLock = 0;
  return p;
}

test('wall geometry can still be classified without authorizing yaw', () => {
  assert.equal(wallFaceContextAllows({
    groundNormalY: 1,
    verticalSpeed: 0.2,
    hitNormalY: 0.12,
  }), true);
  assert.equal(wallFaceContextAllows({
    groundNormalY: 0.72,
    verticalSpeed: 4,
    hitNormalY: 0.02,
  }), false);
});

test('wall continuity helper still rejects thin rails and posts', () => {
  assert.equal(wallFaceContinuityAllows({
    low: true, high: true, lateralLeft: true, lateralRight: false,
  }), true);
  assert.equal(wallFaceContinuityAllows({
    low: true, high: true, lateralLeft: false, lateralRight: false,
  }), false);
  assert.equal(wallFaceContinuityAllows({
    low: false, high: true, lateralLeft: true, lateralRight: true,
  }), false);
});

test('final gameplay physics never requests automatic wall yaw', () => {
  const p = physics(worldWithObstacle({ width: 5, height: 2.4 }));
  assert.equal(p.detectGroundWallImpact(1 / 120), null);
  const heading = p.heading;
  assert.equal(p.applyWallRecovery({
    point: new THREE.Vector3(0, 0.3, -0.3),
    normal: new THREE.Vector3(0, 0, 1),
    speed: 8,
    broadWall: true,
  }), false);
  assert.equal(p.heading, heading, 'wall contact must never rotate yaw');
});

test('low wall and thin rail both have zero automatic yaw authority', () => {
  for (const root of [
    worldWithObstacle({ width: 5, height: 0.68 }),
    worldWithObstacle({ width: 0.12, height: 2.4 }),
  ]) {
    const p = physics(root);
    const heading = p.heading;
    p.stepGround(1 / 120, { brake: false }, 0);
    assert.equal(p.heading, heading, 'contact geometry cannot create a turn');
  }
});

test('wall clearance math remains available for anti-clipping without yaw', () => {
  assert.ok(wallClearanceCorrection(0.10) > 0.15);
  assert.equal(wallClearanceCorrection(WALL_CONTACT_AUTHORITY.bodyClearance + 0.05), 0);
});
