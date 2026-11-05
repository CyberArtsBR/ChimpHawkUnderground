import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { StreetSkater } from '../src/game/StreetSkater.js';
import { landingMotion } from '../src/character/TrickMotion.js';
import { UnrealRider } from '../src/character/UnrealRider.js';
import { StreetBoard } from '../src/skateboard/StreetBoard.js';
import { loadGeometry } from '../tools/load-geometry.mjs';

test('shipping skater keeps pushing cosmetic motion disabled while preserving acceleration state', () => {
  const floor = new THREE.Mesh(new THREE.BoxGeometry(40, 0.1, 40));
  floor.position.y = -0.05; floor.updateMatrixWorld(true);
  const skater = new StreetSkater({ collision: floor, spawn: [0,0.015,0] });
  let pose;
  skater.rider = { root: new THREE.Group(), update: value => { pose = value; } };
  skater.advance = () => { skater.autoPushActive = true; };
  skater.speed = 6; skater.velocity.set(0,0,-6); skater.grounded = true;
  const velocity = skater.velocity.clone();
  for (let i=0;i<30;i++) skater.update(1/60, {}, i/60);
  assert.equal(pose.pushWeight, 0, 'both feet stay on the board while accelerating');
  assert.equal(pose.pushPhase, 0, 'no push cycle or footstep audio');
  assert.equal(skater.presentation.state, 'COAST');
  assert.ok(skater.velocity.equals(velocity), 'presentation must preserve physics velocity');
  skater.grounded = false;
  skater.update(1/60, {}, 1);
  assert.equal(pose.pushWeight, 0, 'air feet follow the trick instead of pushing');
  skater.grounded = true; skater.charge = 1;
  skater.update(1/60, {}, 2);
  assert.equal(pose.pushWeight, 0, 'charged ollie keeps both feet on deck');
});

for (const name of ['TheanchoURi','The_Heretic','TuxR']) {
  test(`${name}: disabled push animation keeps both feet planted`, async () => {
    const rider = new UnrealRider(name).configureModel(await loadGeometry(`public/assets/rider/${name}.glb`));
    const board = new StreetBoard('/unused');
    board.deckHeight = 0.12;
    board.contactRig = { deckTopY: 0.14, deckWidth: 0.42, deckLength: 1.1 };
    board.update({ dt: 0 });
    for (const stance of [1,-1]) {
      rider.resetPresentation();
      const front = stance < 0 ? 'r' : 'l', rear = front === 'l' ? 'r' : 'l';
      const options = { board, stance, dt: 1/60, presentation: { state: 'PUSH' } };
      for (let i=0;i<35;i++) rider.update(options);
      const leading = rider.bones[`foot_${front}`].getWorldPosition(new THREE.Vector3());
      const trailing = rider.bones[`foot_${rear}`].getWorldPosition(new THREE.Vector3());
      for (let i=0;i<35;i++) rider.update({ ...options, pushWeight: 1, pushPhase: 0.5 });
      assert.ok(rider.bones[`foot_${front}`].getWorldPosition(new THREE.Vector3()).distanceTo(leading) < 0.015);
      assert.ok(rider.bones[`foot_${rear}`].getWorldPosition(new THREE.Vector3()).distanceTo(trailing) < 0.015);
      assert.ok([...rider.rest.keys()].every(bone => bone.quaternion.toArray().every(Number.isFinite)));
    }
    rider.dispose();
  });
}

test('landing absorbs contact immediately and fully relaxes after recovery', () => {
  assert.ok(landingMotion(0) > 0.3);
  assert.ok(landingMotion(0.16) > landingMotion(0));
  assert.ok(landingMotion(0.7) < landingMotion(0.16));
  assert.equal(landingMotion(1), 0);
});
