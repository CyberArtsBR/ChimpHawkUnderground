import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  DECK_CATCH_REASON,
  evaluateDeckCatch,
} from '../src/game/core/DeckCatchResult.js';

function air() {
  return {
    transferring: true,
    exitControl: {
      geometryAware: true,
      abortToReturn: false,
      targetPoint: new THREE.Vector3(0, 1, -0.5),
    },
  };
}

test('verified deck catch becomes eligible only while descending inside the target window', () => {
  const result = evaluateDeckCatch({
    transitionAir: air(),
    position: new THREE.Vector3(0.18, 1.24, -0.32),
    velocity: new THREE.Vector3(0, -2.5, -2),
  });
  assert.equal(result.eligible, true);
  assert.equal(result.reason, DECK_CATCH_REASON.ELIGIBLE);
  assert.ok(result.horizontalError < 0.52);
});

test('verified deck catch never probes while ascending', () => {
  const result = evaluateDeckCatch({
    transitionAir: air(),
    position: new THREE.Vector3(0.1, 1.2, -0.45),
    velocity: new THREE.Vector3(0, 1.1, -2),
  });
  assert.equal(result.eligible, false);
  assert.equal(result.reason, DECK_CATCH_REASON.ASCENDING);
});

test('abort-to-return and missing geometry never enter deck catch', () => {
  const abort = air();
  abort.exitControl.abortToReturn = true;
  assert.equal(evaluateDeckCatch({
    transitionAir: abort,
    position: new THREE.Vector3(),
    velocity: new THREE.Vector3(0, -1, 0),
  }).eligible, false);

  assert.equal(evaluateDeckCatch({
    transitionAir: null,
    position: new THREE.Vector3(),
    velocity: new THREE.Vector3(0, -1, 0),
  }).eligible, false);
});

test('lower or distant geometry cannot satisfy the verified catch window', () => {
  const low = evaluateDeckCatch({
    transitionAir: air(),
    position: new THREE.Vector3(0, 0.2, -0.5),
    velocity: new THREE.Vector3(0, -2, 0),
  });
  assert.equal(low.eligible, false);
  assert.equal(low.reason, DECK_CATCH_REASON.OUT_OF_RANGE);

  const far = evaluateDeckCatch({
    transitionAir: air(),
    position: new THREE.Vector3(1.2, 1.2, -0.5),
    velocity: new THREE.Vector3(0, -2, 0),
  });
  assert.equal(far.eligible, false);
});
