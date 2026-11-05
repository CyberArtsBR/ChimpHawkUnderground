import test from 'node:test';
import assert from 'node:assert/strict';
import { ParkRegistry } from '../src/park/ParkRegistry.js';
import {
  WorldLifecycle, WorldLoadCancelledError, WorldResourceScope,
} from '../src/park/WorldLifecycle.js';

function makeRoot(counters = {}) {
  const mesh = {
    isMesh: true,
    geometry: {
      disposeBoundsTree() { counters.bvh = (counters.bvh || 0) + 1; },
      dispose() { counters.geometry = (counters.geometry || 0) + 1; },
    },
    material: {
      isMaterial: true,
      map: { isTexture: true, dispose() { counters.texture = (counters.texture || 0) + 1; } },
      dispose() { counters.material = (counters.material || 0) + 1; },
    },
  };
  return {
    traverse(fn) { fn(this); fn(mesh); },
    removeFromParent() { counters.detach = (counters.detach || 0) + 1; },
  };
}
function world(counters = {}) {
  const park = makeRoot(counters);
  return {
    park, collision: park,
    manifest: {
      spawn: [0, 0.15, 1], transitionScale: 1,
      rails: [], playableRegions: [{ minX: -2, maxX: 2, minZ: -3, maxZ: 3 }],
    },
  };
}
function registryFor(loaders) {
  const registry = new ParkRegistry();
  for (const [id, load] of Object.entries(loaders))
    registry.register({ id, name: id.toUpperCase(), load });
  return registry;
}

test('scope disposes geometry, BVH, materials and owned textures once', () => {
  const counts = {};
  const group = makeRoot(counts);
  const scope = new WorldResourceScope();
  scope.trackRoot(group, { disposeTextures: true });
  scope.trackRoot(group, { disposeTextures: true });
  assert.deepEqual(scope.dispose(), []);
  scope.dispose();
  assert.deepEqual(counts, { detach: 1, bvh: 1, geometry: 1, material: 1, texture: 1 });
});

test('cached Rooftop textures are deliberately excluded from park ownership', () => {
  const counts = {};
  const scope = new WorldResourceScope();
  scope.trackRoot(makeRoot(counts), { disposeTextures: false });
  scope.dispose();
  assert.equal(counts.geometry, 1);
  assert.equal(counts.material, 1);
  assert.equal(counts.texture, undefined);
});

test('scope owns listeners, cleanup callbacks and late async completions', () => {
  const events = [];
  const target = {
    addEventListener(type, fn) { events.push('add:' + type); },
    removeEventListener(type, fn) { events.push('remove:' + type); },
  };
  const scope = new WorldResourceScope();
  scope.trackEvent(target, 'resize', () => {});
  scope.trackCleanup(() => events.push('cleanup'));
  scope.dispose();
  const counters = {};
  scope.trackRoot(makeRoot(counters));
  assert.deepEqual(events, ['add:resize', 'cleanup', 'remove:resize']);
  assert.equal(counters.geometry, 1);
});

test('two locations switch transactionally; previous is retained until activation', async () => {
  const a = {}, b = {};
  const sequence = [];
  const registry = registryFor({
    rooftop: () => world(a),
    other: () => world(b),
  });
  const lifecycle = new WorldLifecycle({
    registry,
    prepare: async ({ id, world: preparedWorld, previous }) => {
      sequence.push('prepare:' + id + ':' + (previous?.id || 'none'));
      return { collision: preparedWorld.collision, rails: preparedWorld.manifest.rails };
    },
    activate: ({ next, previous }) => {
      sequence.push('activate:' + next.id + ':' + (previous?.id || 'none'));
      if (previous) assert.equal(a.geometry, undefined);
    },
  });
  await lifecycle.switchTo('rooftop');
  await lifecycle.switchTo('other');
  assert.equal(lifecycle.current.id, 'other');
  assert.deepEqual(sequence, [
    'prepare:rooftop:none', 'activate:rooftop:none',
    'prepare:other:rooftop', 'activate:other:rooftop',
  ]);
  assert.equal(a.geometry, 1);
  assert.equal(b.geometry, undefined);
  lifecycle.dispose();
  assert.equal(b.geometry, 1);
});

test('repeating same location is a no-op unless reload is requested', async () => {
  let calls = 0;
  const counts = [];
  const registry = registryFor({
    rooftop: () => { calls++; const count = {}; counts.push(count); return world(count); },
  });
  const lifecycle = new WorldLifecycle({ registry });
  const first = await lifecycle.switchTo('rooftop');
  assert.equal(await lifecycle.switchTo('rooftop'), first);
  assert.equal(calls, 1);
  const replacement = await lifecycle.switchTo('rooftop', { reload: true });
  assert.notEqual(replacement, first);
  assert.equal(calls, 2);
  assert.equal(counts[0].geometry, 1);
  lifecycle.dispose();
  assert.equal(counts[1].geometry, 1);
});

test('bad IDs and unavailable locations leave active Rooftop untouched', async () => {
  const counts = {};
  const registry = registryFor({ rooftop: () => world(counts) });
  registry.register({ id: 'foundry', name: 'THE FOUNDRY', available: false });
  const lifecycle = new WorldLifecycle({ registry });
  const active = await lifecycle.switchTo('rooftop');
  await assert.rejects(lifecycle.switchTo('missing'), /Unknown park ID/);
  await assert.rejects(lifecycle.switchTo('foundry'), /not playable/);
  assert.equal(lifecycle.current, active);
  assert.equal(counts.geometry, undefined);
});

test('failed load and failed prepare release staging but preserve old world', async () => {
  const old = {}, bad = {}, failedPrepare = {};
  const registry = registryFor({
    rooftop: () => world(old),
    bad: ({ scope }) => { scope.trackWorld(world(bad)); throw Error('network failure'); },
    prepare: () => world(failedPrepare),
  });
  const lifecycle = new WorldLifecycle({
    registry,
    prepare: async ({ id }) => { if (id === 'prepare') throw Error('bad physics binding'); },
  });
  const current = await lifecycle.switchTo('rooftop');
  await assert.rejects(lifecycle.switchTo('bad'), /network failure/);
  await assert.rejects(lifecycle.switchTo('prepare'), /bad physics binding/);
  assert.equal(lifecycle.current, current);
  assert.equal(bad.geometry, 1);
  assert.equal(failedPrepare.geometry, 1);
  assert.equal(old.geometry, undefined);
});

test('activation error invokes restore before disposing new world', async () => {
  const old = {}, staged = {};
  const observations = [];
  const registry = registryFor({
    rooftop: () => world(old),
    candidate: () => world(staged),
  });
  const lifecycle = new WorldLifecycle({
    registry,
    activate: ({ next }) => { if (next.id === 'candidate') throw Error('scene attach failed'); },
    restore: ({ previous, failed }) => {
      observations.push([previous.id, failed.id, staged.geometry || 0]);
    },
  });
  const current = await lifecycle.switchTo('rooftop');
  await assert.rejects(lifecycle.switchTo('candidate'), /scene attach failed/);
  assert.deepEqual(observations, [['rooftop', 'candidate', 0]]);
  assert.equal(lifecycle.current, current);
  assert.equal(old.geometry, undefined);
  assert.equal(staged.geometry, 1);
});

test('a slow superseded load never replaces the later successful world', async () => {
  let finish;
  const delayed = {};
  const registry = registryFor({
    rooftop: () => new Promise(resolve => { finish = () => resolve(world(delayed)); }),
    legacy: () => world(),
  });
  const lifecycle = new WorldLifecycle({ registry });
  const pending = lifecycle.switchTo('rooftop');
  await lifecycle.switchTo('legacy');
  finish();
  await assert.rejects(pending, WorldLoadCancelledError);
  assert.equal(lifecycle.current.id, 'legacy');
  assert.equal(delayed.geometry, 1);
  lifecycle.dispose();
});

test('disposing during a pending load cancels activation and frees its resources', async () => {
  let finish;
  const counts = {};
  const registry = registryFor({
    rooftop: () => new Promise(resolve => { finish = () => resolve(world(counts)); }),
  });
  let activations = 0;
  const lifecycle = new WorldLifecycle({ registry, activate: () => { activations++; } });
  const pending = lifecycle.switchTo('rooftop');
  lifecycle.dispose();
  finish();
  await assert.rejects(pending, WorldLoadCancelledError);
  assert.equal(activations, 0);
  assert.equal(counts.geometry, 1);
});

test('failed resource cleanup does not discard the newly activated world', async () => {
  const problems = [];
  const old = {};
  const registry = registryFor({
    rooftop: ({ scope }) => {
      scope.trackCleanup(() => { throw Error('listener cleanup failed'); });
      return world(old);
    },
    legacy: () => world(),
  });
  const lifecycle = new WorldLifecycle({
    registry, onCleanupError: errors => problems.push(...errors.map(error => error.message)),
  });
  await lifecycle.switchTo('rooftop');
  await lifecycle.switchTo('legacy');
  assert.equal(lifecycle.current.id, 'legacy');
  assert.deepEqual(problems, ['listener cleanup failed']);
  lifecycle.dispose();
});

test('25 consecutive world switches never retain old collision, rails or resources', async () => {
  const seen = [];
  let generation = 0;
  const make = id => () => {
    const counts = {};
    const candidate = world(counts);
    candidate.manifest.spawn = [generation, 0.15, 1];
    candidate.manifest.rails = [{
      name: `${id}-rail-${generation}`,
      points: [[0, 1, 0], [4, 1, 0]],
    }];
    generation++;
    seen.push(counts);
    return candidate;
  };
  const lifecycle = new WorldLifecycle({
    registry: registryFor({ rooftop: make('roof'), legacy: make('legacy') }),
  });
  for (let n = 0; n < 25; n++) {
    const expectedId = n % 2 ? 'legacy' : 'rooftop';
    const active = await lifecycle.switchTo(expectedId);
    assert.equal(active.id, expectedId);
    assert.equal(active.world.manifest.spawn[0], n);
    assert.equal(active.world.manifest.rails[0].name, `${n % 2 ? 'legacy' : 'roof'}-rail-${n}`);
    if (n > 0) assert.equal(seen[n - 1].geometry, 1);
    assert.equal(seen[n].geometry, undefined);
  }
  lifecycle.dispose();
  assert.equal(seen.length, 25);
  for (const counts of seen) assert.equal(counts.geometry, 1);
});
