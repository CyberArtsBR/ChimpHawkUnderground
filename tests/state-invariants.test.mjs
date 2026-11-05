import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { PlayerState } from '../src/game/core/PlayerState.js';
import {
  legacyStateViolations,
  stateInvariantCodes,
} from '../src/game/core/LegacyStateInvariants.js';

function controller(overrides = {}) {
  return {
    position: new THREE.Vector3(),
    velocity: new THREE.Vector3(0, 0, -5),
    normal: new THREE.Vector3(0, 1, 0),
    heading: 0,
    travelDirection: new THREE.Vector3(0, 0, -1),
    stance: 1,
    fakie: false,
    rollingSign: 1,
    movementState: 'GROUND',
    grounded: true,
    manual: null,
    transitionAir: null,
    ...overrides,
  };
}

test('consistent legacy ground state produces no shadow violations', () => {
  const legacy = controller();
  const canonical = new PlayerState().syncFromLegacy(legacy);
  assert.deepEqual(legacyStateViolations(legacy, canonical), []);
});

test('canonical fakie exposes stale legacy fakie boolean', () => {
  const legacy = controller({
    velocity: new THREE.Vector3(0, 0, 5),
    travelDirection: new THREE.Vector3(0, 0, 1),
    fakie: false,
    rollingSign: -1,
  });
  const codes = stateInvariantCodes(legacyStateViolations(legacy));
  assert.ok(codes.includes('FAKIE_DIVERGENCE'));
});

test('rolling sign must agree with deck heading versus actual travel', () => {
  const legacy = controller({
    velocity: new THREE.Vector3(0, 0, 5),
    travelDirection: new THREE.Vector3(0, 0, 1),
    fakie: true,
    rollingSign: 1,
  });
  const codes = stateInvariantCodes(legacyStateViolations(legacy));
  assert.ok(codes.includes('ROLLING_SIGN_DIVERGENCE'));
});

test('stale travelDirection is observable instead of silently repaired', () => {
  const legacy = controller({
    velocity: new THREE.Vector3(0, 0, 5),
    travelDirection: new THREE.Vector3(0, 0, -1),
    fakie: true,
    rollingSign: -1,
  });
  const codes = stateInvariantCodes(legacyStateViolations(legacy));
  assert.ok(codes.includes('TRAVEL_DIRECTION_STALE'));
});

test('grounded flag and movement mode cannot contradict each other', () => {
  const legacy = controller({ movementState: 'AIR', grounded: true });
  const codes = stateInvariantCodes(legacyStateViolations(legacy));
  assert.ok(codes.includes('GROUND_MODE_MISMATCH'));
});

test('VERT_AIR requires transitionAir and transition air requires VERT_AIR', () => {
  const missingTransition = controller({ movementState: 'VERT_AIR', grounded: false });
  assert.ok(stateInvariantCodes(legacyStateViolations(missingTransition))
    .includes('VERT_MODE_WITHOUT_TRANSITION'));

  const wrongMode = controller({
    movementState: 'AIR',
    grounded: false,
    transitionAir: { frame: {} },
  });
  assert.ok(stateInvariantCodes(legacyStateViolations(wrongMode))
    .includes('TRANSITION_AIR_MODE_MISMATCH'));
});
