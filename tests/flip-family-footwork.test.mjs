import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { loadGeometry } from '../tools/load-geometry.mjs';
import { UnrealRider } from '../src/character/UnrealRider.js';
import { StreetBoard } from '../src/skateboard/StreetBoard.js';
import { FLIP_TRICKS, DOUBLE_FLIP_TRICKS } from '../src/game/TrickCatalog.js';
import { flipFlickOffset } from '../src/character/TrickMotion.js';

test('named upgrades retain the foot flick of their rotation family', () => {
  assert.equal(flipFlickOffset(DOUBLE_FLIP_TRICKS['Varial Kickflip']), flipFlickOffset(FLIP_TRICKS.left));
  assert.equal(flipFlickOffset(DOUBLE_FLIP_TRICKS['Varial Heelflip']), flipFlickOffset(FLIP_TRICKS.right));
  assert.ok(flipFlickOffset(DOUBLE_FLIP_TRICKS['Varial Kickflip']) * flipFlickOffset(DOUBLE_FLIP_TRICKS['Varial Heelflip']) < 0);
});

test('360 and laser flips flick opposite ways and catch with both feet in regular and switch', async () => {
  const rider = new UnrealRider('test').configureModel(await loadGeometry('public/assets/rider/The_AdolescentUR.glb'));
  const board = new StreetBoard('/unused');
  board.deckHeight = .12;
  board.contactRig = { deckTopY: .14, deckWidth: .42, deckLength: 1.1 };
  try {
    for (const stance of [1, -1]) {
      const front = stance < 0 ? 'r' : 'l';
      const flicks = [];
      const catches = [];
      for (const trick of [DOUBLE_FLIP_TRICKS['Varial Kickflip'], DOUBLE_FLIP_TRICKS['Varial Heelflip']]) {
        rider.resetPresentation(); board.resetPresentation();
        for (let i = 0; i <= 100; i++) {
          const flipState = { ...trick, progress: i / 100 };
          const params = { flipState, stance, airborne: true, presentation: { state: 'AIR' }, dt: 1 / 144 };
          board.update(params); rider.update({ ...params, board });
          if (i === 34) flicks.push(rider.ft[front].x);
        }
        catches.push(['l','r'].map(side => rider.bones['foot_' + side].getWorldPosition(new THREE.Vector3())));
      }
      const outward = rider.outward[front];
      assert.ok((flicks[0] - flicks[1]) * outward > .35, `stance ${stance}: opposite distinct flicks`);
      for (let side = 0; side < 2; side++) assert.ok(catches[0][side].distanceTo(catches[1][side]) < .015, 'both directions return to the same catch anchors');
    }
  } finally { rider.dispose(); }
});
