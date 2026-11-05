import test from 'node:test';
import assert from 'node:assert/strict';
import { PortraitPromiseCache } from '../src/game/PortraitPromiseCache.js';
import { GameShell } from '../src/game/GameShell.js';

test('portrait cache shares concurrent renders for one URL', async () => {
  const cache = new PortraitPromiseCache(4);
  let calls = 0;
  const loader = () => { calls += 1; return 'image-data'; };
  const a = cache.getOrLoad('heretic', loader);
  const b = cache.getOrLoad('heretic', loader);
  assert.strictEqual(a, b);
  assert.equal(await a, 'image-data');
  assert.equal(calls, 1);
});

test('portrait cache bounds entries and uses LRU ordering', async () => {
  const cache = new PortraitPromiseCache(2);
  await cache.getOrLoad('a', () => 'A');
  await cache.getOrLoad('b', () => 'B');
  await cache.getOrLoad('a', () => 'unexpected');
  await cache.getOrLoad('c', () => 'C');
  assert.equal(cache.size, 2);
  assert.equal(await cache.getOrLoad('a', () => 'unexpected'), 'A');
  assert.equal(await cache.getOrLoad('b', () => 'B2'), 'B2');
  assert.equal(cache.size, 2);
});

test('portrait cache releases revoked blob URLs and supports new loads', async () => {
  const cache = new PortraitPromiseCache(8);
  const url = 'blob:custom-1';
  await cache.getOrLoad(url, () => 'old-preview');
  assert.equal(cache.delete(url), true);
  assert.equal(cache.size, 0);
  assert.equal(await cache.getOrLoad(url, () => 'new-preview'), 'new-preview');
  cache.clear();
  assert.equal(cache.size, 0);
});

test('failed portrait rendering is not retained and can retry', async () => {
  const cache = new PortraitPromiseCache();
  await assert.rejects(cache.getOrLoad('broken', () => { throw Error('decode failed'); }), /decode failed/);
  assert.equal(cache.size, 0);
  assert.equal(await cache.getOrLoad('broken', () => 'recovered'), 'recovered');
});

test('late rejection does not delete a newer promise for the same key', async () => {
  const cache = new PortraitPromiseCache();
  let rejectOld;
  const old = cache.getOrLoad('custom', () => new Promise((_, reject) => {rejectOld = reject;}));
  await Promise.resolve();
  cache.delete('custom');
  const next = cache.getOrLoad('custom', () => 'valid');
  rejectOld(Error('late failure'));
  await assert.rejects(old, /late failure/);
  await Promise.resolve();
  assert.equal(await cache.getOrLoad('custom', () => 'wrong'), 'valid');
  assert.equal(await next, 'valid');
});

test('invalid cache limits are rejected', () => {
  assert.throws(() => new PortraitPromiseCache(0), RangeError);
  assert.throws(() => new PortraitPromiseCache(-1), RangeError);
});

function fixtureLoadout(loader) {
  const shell = Object.create(GameShell.prototype);
  shell.phase = 'select';
  shell.selectBusy = false;
  shell.loadoutGeneration = 0;
  shell.heroConfirmed = true;
  shell.boardConfirmed = true;
  shell.heroIndex = 0;
  shell.boardIndex = 0;
  shell.locationIndex = 0;
  shell.heroes = [{id: 'heretic', name: 'Heretic', url: '/assets/rider/The_Heretic.glb'}];
  shell.actions = { loadout: loader };
  shell.render = () => {};
  shell.openedTutorial = 0;
  shell.openTutorial = () => { shell.openedTutorial++; };
  shell.startedSessions = [];
  shell.start = practice => { shell.startedSessions.push(practice); shell.phase='playing'; };
  return shell;
}

test('returning to title invalidates stale loadout completion', async () => {
  let finish;
  const shell = fixtureLoadout(() => new Promise(resolve => { finish = resolve; }));
  const pending = shell.confirmLoadout();
  assert.equal(shell.selectBusy, true);
  shell.setScreen('title');
  finish();
  await pending;
  assert.equal(shell.phase, 'title');
  assert.equal(shell.openedTutorial, 0);
  assert.deepEqual(shell.startedSessions, [], 'stale selection must never start gameplay');
  assert.equal(shell.selectBusy, false);
});

test('late load failure cannot overwrite a newer selection', async () => {
  let failOld, finishNew, requests = 0;
  const shell = fixtureLoadout(() => {
    requests++;
    return new Promise((resolve, reject) => {
      if (requests === 1) failOld = reject;
      else finishNew = resolve;
    });
  });
  const previous = shell.confirmLoadout();
  shell.setScreen('title');
  shell.setScreen('select');
  const current = shell.confirmLoadout();
  assert.equal(shell.selectBusy, true);
  failOld(Error('stale GLB failure'));
  await previous;
  assert.equal(shell.selectBusy, true);
  assert.equal(shell.selectError, 'Loading Heretic…');
  finishNew();
  await current;
  assert.equal(shell.openedTutorial, 0, 'tutorial is optional, never forced');
  assert.deepEqual(shell.startedSessions, [false], 'latest valid selection starts exactly one session');
  assert.equal(shell.phase, 'playing');
  assert.equal(shell.selectBusy, false);
});
