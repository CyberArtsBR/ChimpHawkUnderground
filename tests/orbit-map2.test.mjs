import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { loadGeometry } from '../tools/load-geometry.mjs';
import { splitOrbitScene } from '../src/park/OrbitPark.js';
import { prepareParkRuntime } from '../src/game/ParkRegistry.js';
import { PARK_DEFINITIONS, validateParkManifest } from '../src/park/ParkRegistry.js';

test('official Map 2 uses ORBIT with a supported entrance and authored rail collisions', async () => {
  const definition = PARK_DEFINITIONS.find(park => park.number === 2);
  assert.equal(definition.id, 'orbit');
  const asset = new URL('../public/assets/spacepark/orbit.glb', import.meta.url);
  const manifest = JSON.parse(await readFile(new URL('../public/assets/spacepark/orbit-manifest.json', import.meta.url)));
  const world = splitOrbitScene(await loadGeometry(asset), manifest.rails);
  world.manifest = { ...manifest, rails: world.rails };
  validateParkManifest(world.manifest);
  const runtime = prepareParkRuntime(world);
  assert.deepEqual(runtime.spawn.toArray(), world.manifest.spawn);
  assert.ok(world.visualTriangles > 100000);
  assert.ok(world.collision.children.length > 100);
  assert.ok(world.collision.children.some(mesh => mesh.userData.surface === 'rideable'));
  const railNames = new Set(world.manifest.rails.map(rail => rail.name));
  for (const mesh of world.collision.children) {
    if (mesh.userData.railId) assert.ok(railNames.has(mesh.userData.railId));
  }
  world.park.traverse(object => assert.ok(!object.name.startsWith('COL_')));
});
