import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { StatefulSkillStreetPhysics } from '../src/game/StatefulSkillStreetPhysics.js';

function flatWorld() {
  const root = new THREE.Group();
  const floor = new THREE.Mesh(
    new THREE.BoxGeometry(40, 0.1, 40),
    new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }),
  );
  floor.position.y = -0.05;
  root.add(floor);
  root.updateMatrixWorld(true);
  return root;
}

function physics() {
  return new StatefulSkillStreetPhysics({
    collision: flatWorld(),
    spawn: [0, 0.5, 0],
    rails: [],
  });
}

test('final controller keeps one live canonical PlayerState mirror', () => {
  const p = physics();
  assert.ok(p.playerState, 'canonical playerState missing');

  p.advance(1 / 60, { drive: 1 });
  const state = p.playerState;

  assert.ok(state.position.distanceTo(p.position) < 1e-9);
  assert.ok(state.velocity.distanceTo(p.velocity) < 1e-9);
  assert.ok(state.surfaceNormal.distanceTo(p.normal) < 1e-9);
  assert.ok(Math.abs(state.deckHeading - p.heading) < 1e-12);
  assert.equal(state.stance, p.stance < 0 ? -1 : 1);
  assert.equal(state.mode, p.movementState);
  assert.equal(state.grounded, p.grounded);
  assert.deepEqual(p.stateInvariantViolations, []);
});

test('canonical mirror derives fakie from actual travel instead of copying legacy boolean', () => {
  const p = physics();
  p.heading = 0;
  p.groundDirection();
  p.velocity.set(0, 0, 5);
  p.travelDirection.set(0, 0, 1);
  p.rollingSign = -1;
  p.fakie = false;

  p.syncCanonicalState();

  assert.equal(p.playerState.fakie, true);
  assert.equal(p.fakie, false, 'shadow mirror must not repair legacy runtime');
  assert.ok(
    p.stateInvariantViolations.some(entry => entry.code === 'FAKIE_DIVERGENCE'),
    'legacy/canonical divergence should be observable',
  );
});
