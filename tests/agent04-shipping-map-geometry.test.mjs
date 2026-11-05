import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as THREE from 'three';
import { loadGeometry } from '../tools/load-geometry.mjs';
import { ParkCollision } from '../src/game/ParkCollision.js';
import { SkateboardContactRig } from '../src/game/SkateboardContactRig.js';
import { createSolarDockPark } from '../src/park/SolarDockPark.js';
import { splitOrbitScene } from '../src/park/OrbitPark.js';
import { buildImportedWarehouseCollision, warehouseObjectName } from '../src/park/ImportedWarehouseCollision.js';
import { excludeGrandWarehouseMisplacedSixStair } from '../src/park/GrandWarehouseSceneFilter.js';
import { createWarehousePark } from '../src/park/WarehousePark.js';
import { ensureGrandWarehouseSpawns } from '../src/park/GrandWarehouseSpawns.js';

const UP = new THREE.Vector3(0, 1, 0);
const DOWN = new THREE.Vector3(0, -1, 0);

function sampleSpawnGeometry(map, collision, spawn, heading) {
  const surface = new ParkCollision(collision);
  const rig = new SkateboardContactRig(surface);
  const position = new THREE.Vector3(...spawn);
  const result = { map, spawn, supportedOffsets: 0, misses: [], reversed: 0 };
  for (const reverse of [0, Math.PI]) {
    const support = rig.snapToGround(position, heading + reverse, .5, 1);
    assert.equal(support.count, 4, `${map}: incomplete entrance wheels at reverse=${reverse}`);
    assert.ok(support.normal.y > .96, `${map}: invalid entrance normal`);
    result.reversed++;
    const moved = surface.move(support.position, support.position, new THREE.Vector3(), {
      grounded: false,
    });
    assert.equal(moved.contacts.length, 0, `${map}: blocked upright entrance`);
  }
  // Deterministic 5x5 sampling around actual start, not a random park position.
  for (const dx of [-.1, -.05, 0, .05, .1]) {
    for (const dz of [-.1, -.05, 0, .05, .1]) {
      const probe = position.clone().add(new THREE.Vector3(dx, .5, dz));
      const hit = surface.ground(probe, .5, 1);
      if (hit && hit.normal.y > .75) result.supportedOffsets++;
      else result.misses.push([dx, dz]);
    }
  }
  console.log('AGENT04_SHIPPING_GEOMETRY ' + JSON.stringify(result));
  assert.equal(result.supportedOffsets, 25, `${map}: spawn contact holes ${JSON.stringify(result.misses)}`);
  return surface;
}

// The Rooftop collision generator also initializes textures. Supply only the
// minimal image/canvas DOM used by material setup, never a fake physics mesh.
function installHeadlessTextureDom() {
  if (globalThis.document) return;
  const gradient = () => ({ addColorStop() {} });
  const context = new Proxy({
    createImageData: (width, height) => ({ width, height, data: new Uint8ClampedArray(width * height * 4) }),
    getImageData: (x, y, width, height) => ({ width, height, data: new Uint8ClampedArray(width * height * 4) }),
    createRadialGradient: gradient, createLinearGradient: gradient,
    measureText: () => ({ width: 10 }),
  }, { get: (target, name) => target[name] ?? (() => {}) });
  globalThis.document = {
    createElement: () => ({ width: 512, height: 512, getContext: () => context }),
    createElementNS: () => ({ addEventListener() {}, removeEventListener() {}, set src(_url) {} }),
  };
}

test('Agent04 shipping Skyline Rooftop: entrance four-wheel and 25 area probes', () => {
  installHeadlessTextureDom();
  const world = createSolarDockPark();
  sampleSpawnGeometry('Skyline Rooftop', world.collision, world.manifest.spawn,
    world.manifest.spawnHeading || 0);
});

test('Agent04 shipping ORBIT: imported entrance four-wheel and 25 area probes', async () => {
  const root = await loadGeometry(new URL('../public/assets/spacepark/orbit.glb', import.meta.url));
  const world = splitOrbitScene(root);
  const manifest = JSON.parse(await readFile(new URL('../public/assets/spacepark/orbit-manifest.json', import.meta.url)));
  sampleSpawnGeometry('ORBIT', world.collision, manifest.spawn, manifest.spawnHeading || 0);
});

test('Agent04 shipping Grand Warehouse: 25 entrance probes and depressed bowl sampling', async () => {
  const root = await loadGeometry(new URL('../public/assets/warehouse/granwarehouse.glb', import.meta.url));
  excludeGrandWarehouseMisplacedSixStair(root);
  const base = createWarehousePark({ textures: false });
  const imported = buildImportedWarehouseCollision(root, base.manifest.rails, { grandMode: true });
  base.collision = imported.collision;
  base.manifest.rails = imported.rails;
  ensureGrandWarehouseSpawns(base);
  const collision = sampleSpawnGeometry('Grand Warehouse', imported.collision,
    base.manifest.spawn, base.manifest.spawnHeading || 0);

  // Sample actual world-transformed deep bowl triangles from the edited GLB.
  // A collision-only flat cap over a depression must fail, even if a downward
  // near-floor probe would mistakenly hit the correct bowl below that cap.
  const candidates = [];
  root.updateMatrixWorld(true);
  root.traverse(mesh => {
    if (!mesh.isMesh || mesh.userData.grandWarehouseExcluded) return;
    const name = warehouseObjectName(mesh);
    if (!/Bowl.*(?:Transition|Floor|Rideable_Arc)/i.test(name)) return;
    const p = mesh.geometry?.attributes?.position, index = mesh.geometry?.index;
    if (!p) return;
    for (let i = 0; i + 2 < (index?.count || p.count); i += 3) {
      const verts = [0, 1, 2].map(j => new THREE.Vector3().fromBufferAttribute(p, index ? index.getX(i + j) : i + j).applyMatrix4(mesh.matrixWorld));
      const normal = new THREE.Triangle(...verts).getNormal(new THREE.Vector3());
      const centre = verts[0].clone().add(verts[1]).add(verts[2]).multiplyScalar(1 / 3);
      if (centre.y > -1.2 || Math.abs(normal.y) < .35 || !Number.isFinite(centre.y)) continue;
      candidates.push({ centre, name });
    }
  });
  let samples = 0, caps = 0;
  const findings = [];
  const point = new THREE.Vector3(), normal = new THREE.Vector3();
  // Bounded, uniform spacing across triangles rather than testing one handpicked point.
  const stride = Math.max(1, Math.ceil(candidates.length / 64));
  for (let i = 0; i < candidates.length; i += stride) {
    const entry = candidates[i], c = entry.centre;
    const hit = collision.rayRideable(new THREE.Vector3(c.x, 5, c.z), DOWN,
      20, point, normal);
    samples++;
    if (!hit || point.y > c.y + .23) {
      caps++;
      if (findings.length < 8) findings.push({
        name: entry.name, x: +c.x.toFixed(2), z: +c.z.toFixed(2),
        visualY: +c.y.toFixed(2), collisionY: hit ? +point.y.toFixed(2) : null,
      });
    }
  }
  console.log('AGENT04_GRAND_BOWL_SAMPLES ' + JSON.stringify({
    sampledTriangles: candidates.length, sampled: samples, coveredOrCapped: caps,
    findings,
  }));
  assert.ok(samples >= 8, 'Grand Warehouse: insufficient actual depressed bowl triangles');
  assert.equal(caps, 0, 'Grand Warehouse: invisible flat cap or missing recessed collision');
});
