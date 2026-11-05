import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { StreetSkater } from '../src/game/StreetSkater.js';
import { RunSummary } from '../src/game/RunSummary.js';

function skater() {
  const floor = new THREE.Mesh(new THREE.BoxGeometry(100, .1, 100),
    new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
  floor.position.y = -.05;
  floor.updateMatrixWorld(true);
  return new StreetSkater({ collision: floor, spawn: [0, .2, 0], rails: [] });
}

test('rider reset retains accepted round score and distance while discarding the unfinished combo', () => {
  const rider = skater();
  const summary = new RunSummary();
  rider.recordTrick('Kickflip', 100);
  const entries = rider.tricks.combo.map(entry => ({ ...entry }));
  const banked = rider.tricks.settle();
  rider.score += banked.points;
  summary.recordCombo({ ...banked, entries });
  rider.recordTrick('Indy', 200);
  rider.stance = -1;
  rider.distance = 42;
  rider.position.set(5, 2, 8);
  rider.velocity.set(0, 4, -8);
  rider.jumpBuffer = .1;
  rider.charge = .8;
  rider.pendingStepInput.olliePressed = true;
  rider._smoothedVisualPosition = rider.position.clone();

  rider.advance(1 / 144, { reset: true, ollieHeld: true, grabPressed: true });

  assert.equal(rider.score, 100);
  assert.equal(rider.score, summary.totalScore);
  assert.equal(rider.distance, 42);
  assert.equal(rider.stance, -1);
  assert.equal(rider.airTakeoffStance, -1);
  assert.equal(rider.playerState.stance, -1);
  assert.equal(rider.respawnSerial, 1);
  assert.equal(rider.tricks.combo.length, 0);
  assert.equal(rider.charge, 0);
  assert.equal(rider.jumpBuffer, 0);
  assert.equal(rider.pendingStepInput.olliePressed, false);
  assert.equal(rider.velocity.length(), 0);
  assert.equal(rider.position.x, rider.spawn.x);
  assert.equal(rider.position.z, rider.spawn.z);
  assert.equal(rider._smoothedVisualPosition, null);
  assert.equal(summary.finish({ totalScore: rider.score }).totalScore, 100);
});

test('each explicit rider reset starts a new contact segment; round restart still clears scores', () => {
  const rider = skater();
  rider.score = 700;
  rider.resetRider();
  rider.resetRider();
  assert.equal(rider.respawnSerial, 2);
  assert.equal(rider.score, 700);
  rider.reset();
  assert.equal(rider.score, 0);
  assert.equal(rider.stance, 1);
  assert.equal(rider.distance, 0);
});
