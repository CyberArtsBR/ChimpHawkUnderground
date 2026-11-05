import test from 'node:test';
import assert from 'node:assert/strict';
import { SkateTricks } from '../src/game/SkateTricks.js';

const input = (extra = {}) => ({
  steer: 0, drive: 0, directionTaps: [], flipPressed: false, grabPressed: false,
  grabHeld: false, grindPressed: false, ...extra,
});
const air = (extra = {}) => ({
  grounded: false, grinding: false, manual: null, wallRiding: false,
  speed: 8, flipState: null, grabState: null, ...extra,
});

test('aaa03: buffered grounded flip survives a fixed-step delayed ollie', () => {
  const tricks = new SkateTricks();
  tricks.resolve(input({ flipPressed: true, ollieHeld: true }), air({ grounded: true }));
  tricks.tick(0.20);
  const result = tricks.resolve(input(), air());
  assert.equal(result.flip.name, 'Kickflip');
  assert.equal(tricks.resolve(input(), air()).flip, undefined,
    'the grounded press is consumed only once');
});

test('aaa03: stale grounded flip expires without contaminating later jumps', () => {
  const tricks = new SkateTricks();
  tricks.resolve(input({ flipPressed: true }), air({ grounded: true }));
  tricks.tick(0.35);
  assert.equal(tricks.resolve(input(), air()).flip, undefined);
});

test('aaa03: queued air trick names deduplicate but distinct chains remain possible', () => {
  const tricks = new SkateTricks();
  tricks.queueAirTrick('flip', { name: 'Kickflip' });
  tricks.queueAirTrick('flip', { name: 'Kickflip' });
  tricks.queueAirTrick('flip', { name: 'Heelflip' });
  assert.deepEqual(tricks.airTrickQueue.map(x => x.trick.name), ['Kickflip', 'Heelflip']);
  tricks.clearAirQueue();
  assert.equal(tricks.airTrickQueue.length, 0);
});

test('aaa03: interleaved scoring edges for one trick count once', () => {
  const tricks = new SkateTricks();
  const first = tricks.record('Kickflip', 100);
  tricks.record('Indy', 100);
  assert.equal(tricks.record('Kickflip', 100), first);
  assert.equal(tricks.combo.length, 2);
  assert.equal(tricks.comboMultiplier, 2);
});

test('aaa03: combo farming cannot raise multiplier indefinitely', () => {
  const tricks = new SkateTricks();
  for (let i = 0; i < 40; i++) {
    tricks.tick(0.2);
    tricks.record(i % 2 === 0 ? 'Kickflip' : 'Heelflip', 100);
  }
  assert.ok(tricks.comboMultiplier <= 12);
  const result = tricks.settle();
  assert.ok(result.multiplier <= 12);
  assert.equal(tricks.settle(), null, 'banking is one-shot');
});

test('aaa03: switch stance awards legitimate variety without resets', () => {
  const tricks = new SkateTricks();
  tricks.record('Kickflip', 100, { stance: 1 });
  tricks.tick(0.2);
  tricks.record('Kickflip', 100, { stance: -1 });
  assert.equal(tricks.combo.length, 2);
  assert.equal(tricks.combo[1].repeatFactor, 1);
  assert.equal(tricks.comboMultiplier, 2);
});

test('aaa03: failed combo and pending input never bank later', () => {
  const tricks = new SkateTricks();
  tricks.record('50-50', 150);
  tricks.resolve(input({ flipPressed: true }), air({ grounded: true }));
  tricks.cancelCombo();
  assert.equal(tricks.settle(), null);
  assert.equal(tricks.resolve(input(), air()).flip, undefined);
});
