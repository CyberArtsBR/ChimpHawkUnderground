import test from 'node:test';
import assert from 'node:assert/strict';
import { MOVEMENT_STATE } from '../src/game/StreetPhysics.js';
import { resolveMovementMode } from '../src/game/core/MovementStateResolver.js';

test('movement state priority is bail > grind > wallride > grounded > vert air > air', () => {
  assert.equal(resolveMovementMode({
    bailTime: 1,
    grind: {},
    wallRide: {},
    grounded: true,
    manual: 'manual',
    transitionAir: {},
  }), MOVEMENT_STATE.BAIL);

  assert.equal(resolveMovementMode({
    grind: {},
    wallRide: {},
    grounded: true,
    manual: 'manual',
    transitionAir: {},
  }), MOVEMENT_STATE.GRIND);

  assert.equal(resolveMovementMode({
    wallRide: {},
    grounded: true,
    manual: 'manual',
    transitionAir: {},
  }), MOVEMENT_STATE.WALLRIDE);

  assert.equal(resolveMovementMode({ grounded: true, manual: 'manual' }), MOVEMENT_STATE.MANUAL);
  assert.equal(resolveMovementMode({ grounded: true }), MOVEMENT_STATE.GROUND);
  assert.equal(resolveMovementMode({ grounded: false, transitionAir: {} }), MOVEMENT_STATE.VERT_AIR);
  assert.equal(resolveMovementMode({ grounded: false }), MOVEMENT_STATE.AIR);
});

test('manual cannot create MANUAL mode while airborne', () => {
  assert.equal(resolveMovementMode({
    grounded: false,
    manual: 'manual',
  }), MOVEMENT_STATE.AIR);
});

test('transition air does not outrank a real grind or wallride', () => {
  assert.equal(resolveMovementMode({
    grounded: false,
    transitionAir: {},
    grind: {},
  }), MOVEMENT_STATE.GRIND);
  assert.equal(resolveMovementMode({
    grounded: false,
    transitionAir: {},
    wallRide: {},
  }), MOVEMENT_STATE.WALLRIDE);
});
