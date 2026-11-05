import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  PlayerState,
  canonicalTravelDirection,
  deckForwardFromHeading,
  deriveFakie,
} from '../src/game/core/PlayerState.js';

test('deck heading zero points along local -Z', () => {
  const forward = deckForwardFromHeading(0);
  assert.ok(forward.distanceTo(new THREE.Vector3(0, 0, -1)) < 1e-12);
});

test('fakie is derived from deck facing versus travel direction', () => {
  assert.equal(deriveFakie({
    deckHeading: 0,
    travelDirection: new THREE.Vector3(0, 0, -1),
  }), false);
  assert.equal(deriveFakie({
    deckHeading: 0,
    travelDirection: new THREE.Vector3(0, 0, 1),
  }), true);
});

test('stance does not decide fakie', () => {
  const regular = new PlayerState();
  regular.deckHeading = 0;
  regular.travelDirection.set(0, 0, 1);
  regular.stance = 1;

  const switchState = new PlayerState();
  switchState.deckHeading = 0;
  switchState.travelDirection.set(0, 0, 1);
  switchState.stance = -1;

  assert.equal(regular.fakie, true);
  assert.equal(switchState.fakie, true);
});

test('canonical travel direction prefers actual horizontal velocity over stale legacy travel', () => {
  const state = new PlayerState();
  state.syncFromLegacy({
    position: new THREE.Vector3(),
    velocity: new THREE.Vector3(0, 0, 5),
    normal: new THREE.Vector3(0, 1, 0),
    heading: 0,
    travelDirection: new THREE.Vector3(0, 0, -1),
    stance: 1,
    movementState: 'GROUND',
    grounded: true,
  });

  assert.ok(state.travelDirection.distanceTo(new THREE.Vector3(0, 0, 1)) < 1e-9);
  assert.equal(state.fakie, true);
});

test('zero travel uses deck heading as a deterministic fallback', () => {
  const heading = Math.PI / 2;
  const travel = canonicalTravelDirection(new THREE.Vector3(), heading);
  const forward = deckForwardFromHeading(heading);
  assert.ok(travel.distanceTo(forward) < 1e-9);
  assert.equal(deriveFakie({ deckHeading: heading, travelDirection: new THREE.Vector3() }), false);
});
