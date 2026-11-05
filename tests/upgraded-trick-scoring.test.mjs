import test from 'node:test';
import assert from 'node:assert/strict';
import { SkateTricks } from '../src/game/SkateTricks.js';

test('repeated upgraded flips obey the same multiplier limit as direct tricks', () => {
  const upgraded = new SkateTricks(), direct = new SkateTricks();
  for (let i = 0; i < 8; i++) {
    upgraded.tick(.3); direct.tick(.3);
    const entry = upgraded.record('Kickflip', 100);
    upgraded.upgrade(entry, 'Double Kickflip', 200);
    direct.record('Double Kickflip', 200);
  }
  assert.equal(upgraded.comboMultiplier, 2);
  assert.deepEqual(upgraded.settle(), direct.settle());
});

test('upgrades preserve stance variety, duration, and one entry per execution', () => {
  const tricks = new SkateTricks();
  for (const stance of [1, 1, -1]) {
    tricks.tick(.3);
    const entry = tricks.record('Kickflip', 100, { stance });
    tricks.addDuration(10, entry);
    tricks.upgrade(entry, 'Double Kickflip', 200);
  }
  assert.equal(tricks.combo.length, 3);
  assert.equal(tricks.comboMultiplier, 3);
  assert.equal(tricks.comboBase, 577);
  assert.equal(tricks.settle().points, 1734);
  assert.equal(tricks.settle(), null);
});
