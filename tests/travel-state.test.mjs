import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  horizontalUnit,
  resolveTravelState,
  signedTravelRelativeToDeck,
} from '../src/game/core/TravelState.js';

test('travel with deck nose is regular', () => {
  const result = resolveTravelState({
    velocity: new THREE.Vector3(0, 0, -6),
    deckHeading: 0,
  });
  assert.equal(result.rollingSign, 1);
  assert.equal(result.fakie, false);
  assert.ok(result.travelDirection.distanceTo(new THREE.Vector3(0, 0, -1)) < 1e-9);
});

test('travel opposite deck nose is fakie regardless of stance concept', () => {
  const result = resolveTravelState({
    velocity: new THREE.Vector3(0, 0, 6),
    deckHeading: 0,
  });
  assert.equal(result.rollingSign, -1);
  assert.equal(result.fakie, true);
  assert.ok(result.travelDirection.distanceTo(new THREE.Vector3(0, 0, 1)) < 1e-9);
});

test('slow travel preserves previous sign and world direction', () => {
  const previous = new THREE.Vector3(1, 0, 0);
  const result = resolveTravelState({
    velocity: new THREE.Vector3(0.01, 0, 0),
    deckHeading: 0,
    previousDirection: previous,
    previousSign: -1,
  });
  assert.equal(result.rollingSign, -1);
  assert.equal(result.fakie, true);
  assert.ok(result.travelDirection.distanceTo(previous) < 1e-9);
});

test('explicit direction rebuild at rest follows deck times remembered sign', () => {
  const result = resolveTravelState({
    velocity: new THREE.Vector3(),
    deckHeading: Math.PI / 2,
    previousSign: -1,
    preserveDirectionIfSlow: false,
  });
  assert.equal(result.rollingSign, -1);
  assert.equal(result.fakie, true);
  assert.ok(result.travelDirection.distanceTo(new THREE.Vector3(1, 0, 0)) < 1e-9);
});

test('signed travel keeps memory below threshold but measures above threshold', () => {
  assert.equal(signedTravelRelativeToDeck({
    velocity: new THREE.Vector3(0, 0, 0.05),
    deckHeading: 0,
    previousSign: 1,
  }), 1);
  assert.equal(signedTravelRelativeToDeck({
    velocity: new THREE.Vector3(0, 0, 2),
    deckHeading: 0,
    previousSign: 1,
  }), -1);
});

test('horizontalUnit has deterministic fallback', () => {
  const result = horizontalUnit(new THREE.Vector3(0, 4, 0), new THREE.Vector3(-2, 0, 0));
  assert.ok(result.distanceTo(new THREE.Vector3(-1, 0, 0)) < 1e-9);
});
