import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { SkillStreetPhysics } from '../src/game/SkillStreetPhysics.js';
import { MOVEMENT_STATE } from '../src/game/StreetPhysics.js';

function wallWorld() {
  const root = new THREE.Group();
  const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });

  const floor = new THREE.Mesh(new THREE.BoxGeometry(20, 0.1, 20), material);
  floor.position.y = -0.05;
  root.add(floor);

  const wall = new THREE.Mesh(new THREE.BoxGeometry(8, 3, 0.12), material.clone());
  wall.position.set(0, 1.5, -0.45);
  wall.userData.surface = 'solid';
  root.add(wall);

  root.updateMatrixWorld(true);
  return root;
}

test('lower SkillStreetPhysics collision can slide velocity but never rewrite heading', () => {
  const p = new SkillStreetPhysics({
    collision: wallWorld(),
    spawn: [0, 0.5, 1],
    rails: [],
  });

  p.position.set(0, 0.015, 0.75);
  p.normal.set(0, 1, 0);
  p.heading = 0;
  p.groundDirection();
  p.grounded = true;
  p.setMovementState(MOVEMENT_STATE.GROUND);

  // Deliberate lateral component makes the old bug obvious: wall collision
  // removes most -Z motion, leaving a sideways vector. The historical code then
  // converted that clipped vector into heading and could snap close to 90 degrees.
  p.velocity.set(-2.2, 0, -12);
  const before = p.position.clone();
  p.position.addScaledVector(p.velocity, 0.12);

  p.resolveMotion(before, new THREE.Vector3(0, 1, 0), {});

  assert.ok(Math.abs(p.heading) < 1e-12,
    `contact changed lower-layer heading: ${p.heading}`);
  assert.ok(p.position.z > -0.30,
    `lower-layer body tunneled through wall: z=${p.position.z}`);
  assert.ok(p.velocity.x < -0.1,
    `collision slide lost lateral travel unexpectedly: vx=${p.velocity.x}`);
});
