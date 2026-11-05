import test from 'node:test';
import assert from 'node:assert/strict';
import { SkateTricks } from '../src/game/SkateTricks.js';

const input = (overrides = {}) => ({
  steer: 0,
  drive: 0,
  directionTaps: [],
  flipPressed: false,
  grabPressed: false,
  grindPressed: false,
  ...overrides,
});

const context = (overrides = {}) => ({
  grounded: false,
  grinding: false,
  manual: null,
  speed: 5,
  ...overrides,
});

test('flip pressed on takeoff frame survives into first airborne frame', () => {
  const tricks = new SkateTricks();
  tricks.tick(0.01);
  const grounded = tricks.resolve(input({ flipPressed: true }), context({ grounded: true }));
  assert.equal(grounded.flip, undefined);

  tricks.tick(1 / 60);
  const airborne = tricks.resolve(input(), context({ grounded: false }));
  assert.equal(airborne.flip?.name, 'Kickflip');
});

test('ground flip buffer expires instead of firing late', () => {
  const tricks = new SkateTricks();
  tricks.resolve(input({ flipPressed: true }), context({ grounded: true }));
  tricks.tick(0.25);
  const airborne = tricks.resolve(input(), context({ grounded: false }));
  assert.equal(airborne.flip, undefined);
});

test('manual flip input stays reserved for flatland combinations', () => {
  const tricks = new SkateTricks();
  tricks.resolve(input({ flipPressed: true }), context({ grounded: true, manual: 'manual' }));
  tricks.tick(1 / 60);
  const airborne = tricks.resolve(input(), context({ grounded: false, manual: null }));
  assert.equal(airborne.flip, undefined);
});
