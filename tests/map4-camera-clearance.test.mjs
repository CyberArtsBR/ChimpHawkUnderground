import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { ParkCollision } from '../src/game/ParkCollision.js';
import { resolveCameraClearance } from '../src/game/CameraClearance.js';

function obstacle() {
  const root = new THREE.Group();
  const block = new THREE.Mesh(
    new THREE.BoxGeometry(2, 2, 2),
    new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }),
  );
  block.userData.surface = 'solid';
  root.add(block);
  return new ParkCollision(root);
}

test('map4 camera: a starting eye anchor just inside a ramp solid can escape its exit face', () => {
  const collision = obstacle();
  const start = new THREE.Vector3(.9,0,0);
  const eye = new THREE.Vector3(5,0,0);
  const recovered = collision.camera(start, eye, .28);
  assert.ok(recovered.x > 2, 'exiting a solid should not collapse chase arm to first person');
  assert.ok(recovered.x <= 5);
  const direct = resolveCameraClearance(collision, start, eye);
  assert.ok(direct.distanceTo(start) >= 1.8);
});

test('map4 camera: incoming wall intersection still blocks the same chase ray', () => {
  const collision = obstacle();
  const start = new THREE.Vector3(-1.1,0,0);
  const resolved = collision.camera(start, new THREE.Vector3(5,0,0), .28);
  assert.ok(resolved.x < -1.0, 'cannot tunnel from outside through a masonry wall');
});
