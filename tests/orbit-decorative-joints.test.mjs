import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { loadGeometry } from '../tools/load-geometry.mjs';
import { warehouseObjectName } from '../src/park/ImportedWarehouseCollision.js';
import { splitOrbitScene } from '../src/park/OrbitPark.js';

function positions(mesh) {
  const geometry = mesh.geometry.clone().applyMatrix4(mesh.matrixWorld);
  const points = geometry.attributes.position, keys = [];
  for (let i = 0; i < points.count; i++) keys.push(`${points.getX(i)},${points.getY(i)},${points.getZ(i)}`);
  geometry.dispose();
  return keys;
}

function collisionHash(collision) {
  const hash = createHash('sha256');
  for (const mesh of collision.children) {
    hash.update(JSON.stringify([mesh.name, mesh.userData]));
    for (const name of Object.keys(mesh.geometry.attributes).sort()) {
      const a = mesh.geometry.attributes[name];
      hash.update(JSON.stringify([name, a.itemSize, a.normalized, a.array.constructor.name]));
      hash.update(Buffer.from(a.array.buffer, a.array.byteOffset, a.array.byteLength));
    }
    const index = mesh.geometry.index?.array;
    if (index) hash.update(Buffer.from(index.buffer, index.byteOffset, index.byteLength));
  }
  return hash.digest('hex');
}

test('ORBIT removes both decorative deck-joint directions and preserves actual ramp seams, grilles and collision', async () => {
  const asset = new URL('../public/assets/spacepark/orbit.glb', import.meta.url);
  assert.equal(createHash('sha256').update(await readFile(asset)).digest('hex'),
    '62f48f9e794f383a9039e11791c8ee39812dd34cfdac83d62922a8791db56ae7', 'authored source GLB is untouched');
  const scene = await loadGeometry(asset);
  let expansion = 0, short = 0, panelJoins = 0, grilles = 0;
  const retainedPositions = [];
  scene.traverse(mesh => {
    if (!mesh.isMesh || mesh.material?.name !== 'Seam / charcoal rubber') return;
    const name = warehouseObjectName(mesh);
    if (/^Deck \/ expansion joint(?:\.\d+)?$/.test(name)) { expansion++; return; }
    if (/^Deck \/ short joint(?:\.\d+)?$/.test(name)) { short++; return; }
    if (/panel join(?:t)?(?:\.\d+)?$/.test(name)) panelJoins++;
    if (/^Utility \/ grille(?:\.\d+)?$/.test(name)) grilles++;
    retainedPositions.push(...positions(mesh));
  });
  assert.equal(expansion, 785); assert.equal(short, 785);
  assert.equal(panelJoins, 66); assert.equal(grilles, 32);
  const manifest = JSON.parse(await readFile(new URL('../public/assets/spacepark/orbit-manifest.json', import.meta.url)));
  const world = splitOrbitScene(scene, manifest.rails), actualPositions = [];
  world.park.updateMatrixWorld(true);
  world.park.traverse(mesh => {
    if (mesh.isMesh && mesh.material?.name === 'Seam / charcoal rubber') actualPositions.push(...positions(mesh));
  });
  assert.equal(actualPositions.length, retainedPositions.length, 'all 1570 decorative deck strips are absent');
  assert.deepEqual(actualPositions.sort(), retainedPositions.sort(), 'every real ramp-seam and grille vertex stays intact');
  // Captured from release f62779d before extending the decorative filter.
  assert.equal(world.collision.children.length, 156);
  assert.equal(collisionHash(world.collision), 'fa861429c7f0d9a8efc0ccb975b3d34034dc198c46d01f3c3888ebc8b3acb2d1',
    'collision names, metadata, attributes and indices remain byte-identical');
  assert.equal(createHash('sha256').update(JSON.stringify(world.rails)).digest('hex'),
    '4b61f92e37f72a05d7650e1e92c4a5e7980f616633c1855a28914d03733fe52a', 'all 14 grind paths remain unchanged');
});
