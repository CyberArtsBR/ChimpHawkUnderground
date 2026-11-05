import test from 'node:test';
import assert from 'node:assert/strict';
import { FlatlandMotion, FLATLAND_NAMES, flatlandDeckPose } from '../src/character/FlatlandMotion.js';
import { StreetBoard } from '../src/skateboard/StreetBoard.js';

test('variant crossfades are bounded and consistent across frame rates', () => {
  const results = [30, 60, 120].map(hz => {
    const motion = new FlatlandMotion();
    for (const name of ['Casper', 'Handstand', null]) {
      for (let i = 0; i < hz / 2; i++) {
        motion.update(name, 1 / hz);
        assert.ok(Object.values(motion.weights).reduce((a, b) => a + b, 0) <= 1.000001);
      }
    }
    return motion.weights;
  });
  for (const name of FLATLAND_NAMES) assert.ok(Math.abs(results[0][name] - results[2][name]) < 1e-9);
});

test('every board variation produces finite poses and returns to riding', () => {
  const board = new StreetBoard('unused');
  board.deckHeight = 0.12;
  for (const flatland of FLATLAND_NAMES) {
    for (let i = 0; i < 60; i++) board.update({flatland, manual:'manual', dt:1/60});
    assert.ok(board.root.quaternion.toArray().every(Number.isFinite));
    assert.ok(Object.values(flatlandDeckPose(board.flatlandMotion)).every(Number.isFinite));
  }
  for (let i = 0; i < 120; i++) board.update({dt:1/60});
  assert.ok(board.root.quaternion.angleTo(board._poseQuaternion) < 1e-5);
  board.resetPresentation();
  assert.ok(Object.values(board.flatlandMotion.weights).every(w => w === 0));
});

test('only approved flatland tricks remain selectable', async () => {
  const { FLATLAND_TRICKS } = await import('../src/game/TrickCatalog.js');
  assert.deepEqual(Object.values(FLATLAND_TRICKS).map(t => t.name).sort(), ['Casper', 'Handstand']);
  assert.deepEqual([...FLATLAND_NAMES].sort(), ['Casper', 'Handstand']);
});

test('nose manual has a more pronounced deck lift', () => {
  const board = new StreetBoard('unused'); board.deckHeight = 0.12;
  board.update({manual: 'noseManual'});
  assert.ok(board.root.rotation.x > 0.28);
});

test('manuals match angles in both stances and settle without an abrupt height drop', () => {
  for (const stance of [1, -1]) for (const manual of ['manual', 'noseManual']) {
    const board = new StreetBoard('unused'); board.deckHeight = 0.12;
    board.update({manual, stance});
    assert.ok(Math.abs(Math.abs(board.root.rotation.x) - 0.30) < 1e-8);
    const raised = board.root.position.y;
    board.update({stance, dt: 1/60});
    assert.ok(board.root.position.y > board.deckHeight + 0.025);
    assert.ok(board.root.position.y < raised);
    for (let i = 0; i < 90; i++) board.update({stance, dt: 1/60});
    assert.ok(Math.abs(board.root.position.y - board.deckHeight) < 1e-5);
    board.resetPresentation();
    assert.equal(board.manualSupport, false);
  }
});
