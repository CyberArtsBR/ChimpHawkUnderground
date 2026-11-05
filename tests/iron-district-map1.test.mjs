import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import { loadGeometry } from '../tools/load-geometry.mjs';
import { createIronDistrict, IRON_DISTRICT_ASSET } from '../src/park/IronDistrict.js';
import { PARK_DEFINITIONS, validateParkManifest, buildParkRouteMetadata } from '../src/park/ParkRegistry.js';
import { PARK_REGISTRY, prepareParkRuntime } from '../src/game/ParkRegistry.js';

const base = new URL('../public/assets/iron-district/', import.meta.url);
const json = async name => JSON.parse(await readFile(new URL(name, base)));
const requests = [];
const worldPromise = createIronDistrict({
  loader: { loadAsync: async url => {
    requests.push(url);
    return { scene: await loadGeometry(new URL('IronDistrictSource.glb', base)) };
  } },
  fetcher: async url => ({ ok: true, json: () => json(url.split('/').at(-1)) }),
});

test('archived Iron District retains the edited GLB with a preserved source digest', async () => {
  const world = await worldPromise;
  assert.equal(PARK_DEFINITIONS.find(park => park.id === 'rooftop').selectable, false);
  assert.equal(PARK_REGISTRY.rooftop.name, 'Iron District');
  assert.deepEqual(requests, [IRON_DISTRICT_ASSET]);
  const receipt = await json('integration-receipt.json');
  const hash = createHash('sha256').update(await readFile(new URL('IronDistrictSource.glb', base))).digest('hex');
  assert.equal(hash, receipt.editedSourceSha256);
  assert.equal(world.manifest.statistics.drawCalls, world.park.children.length);
  assert.ok(world.park.children.length < 40, 'unbatched source would render over 1,000 objects');
  assert.ok(world.manifest.statistics.sourceMeshes > 1000);
  validateParkManifest(world.manifest);
});

test('Moved obstacles collide at their edited positions without their old proxies', async () => {
  const world = await worldPromise;
  const runtime = prepareParkRuntime(world);
  const colliders = world.collision.children;
  assert.ok(colliders.every(mesh => !mesh.userData.sourceObject.startsWith('COL_')));
  const bank = colliders.find(mesh => mesh.userData.sourceObject === 'RIDE_A_Bank_W');
  const bankBox = new THREE.Box3().setFromObject(bank);
  assert.ok(bankBox.min.x < -54 && bankBox.max.x < -42, 'west bank must follow user move');
  const pad = colliders.find(mesh => mesh.userData.sourceObject === 'RIDE_A_ManualPad_2');
  const padBox = new THREE.Box3().setFromObject(pad);
  assert.ok(padBox.min.z > -6 && padBox.max.z > -4, 'manual pad must follow user move');
  for (const [position, height] of [
    [[-48, 3, 17], 1.3], [[-23, 3, 17], 0],
    [[0, 2, -4.6], 0.46], [[0, 2, -17], 0],
    [[64, 10, 9.93], 6], [[64, 10, 49], 0],
  ]) {
    const hit = runtime.surface.ground(new THREE.Vector3(...position), 0.1, 20);
    assert.ok(hit, `missing riding geometry at ${position}`);
    assert.ok(Math.abs(hit.point.y - height) < 0.08, `wrong support height at ${position}: ${hit.point.y}`);
  }
  for (const suffix of ['.001', '.002']) assert.ok(colliders.some(mesh =>
    mesh.userData.sourceObject === `RIDE_E_DeckSideAccess${suffix}`), 'new access decks need collision');
});

test('Edited grind paths align with moved stairs and the relocated pad', async () => {
  const { manifest } = await worldPromise;
  const stair = manifest.rails.find(rail => rail.name === 'GRIND_RIDE_C_EightStair');
  assert.ok(Math.abs(stair.points[0][0] - (50.4 - 8.421198844909668)) < 0.001);
  assert.ok(Math.abs(stair.points[0][2] - (-15.4 - 5.342102527618408)) < 0.001);
  const pad = manifest.rails.find(rail => rail.name === 'GRIND_A_PadEdge_2');
  assert.ok(Math.abs(pad.points[0][2] - (-18.1 + 12.391908645629883)) < 0.001);
  assert.equal(manifest.rails.filter(rail => rail.transition).length, 4);
  const routes = buildParkRouteMetadata(manifest, 'rooftop');
  assert.equal(routes.length, 3);
  validateParkManifest({ ...manifest, routes });
});

test('Every actual Iron District start area has flat support in both stances', async () => {
  const world = await worldPromise;
  const runtime = prepareParkRuntime(world);
  for (const spot of world.manifest.spots) {
    for (const reverse of [0, Math.PI]) {
      const point = new THREE.Vector3(...spot.position);
      const support = runtime.boardContact.snapToGround(point, spot.heading + reverse, 0.2, 0.3);
      assert.equal(support.count, 4, spot.id);
      assert.ok(support.normal.y > 0.985, spot.id);
      assert.equal(runtime.surface.move(support.position, support.position, new THREE.Vector3(),
        { grounded: false }).contacts.length, 0, spot.id);
    }
  }
  assert.ok(world.manifest.spots.find(spot => spot.id === 'mega').position[2] < 11);
  // The bowl stays recessed; an accidental full rectangle collider would close it.
  const hit = runtime.surface.ground(new THREE.Vector3(-73, 1, -39), 0.1, 8);
  assert.ok(hit && hit.point.y < -2.8, 'bowl pocket must remain open');
});
