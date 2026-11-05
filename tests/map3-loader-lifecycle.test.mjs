import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { refineWarehouseMaterials } from '../src/park/WarehouseMaterialPresentation.js';

// Execute the actual warehouse loader's function body with a synthetic GLB.
// Previous unit tests checked geometry in isolation and missed a ReferenceError
// after the loader finished, when manifest statistics were being constructed.
test('Grand Warehouse completes the loader and retains its stair exclusion count', async () => {
  const source = readFileSync('src/park/WarehouseVariants.js', 'utf8');
  const start = source.indexOf('export async function createWarehouseVariant(id) {');
  assert.ok(start >= 0, 'warehouse loader declaration missing');
  const functionBody = source.slice(start).replace(/^export /, '');
  const requests = [];
  let exclusionCalls = 0;
  const mocks = {
    VARIANTS: {
      'grand-warehouse': { name: 'GRAND WAREHOUSE', url: '/granwarehouse.glb', theme: 'artist', floor: '#444', background: '#333', light: '#eee', ambient: '#ddd', ground: '#555', exposure: 1 },
      'urban-warehouse': { name: 'URBAN WAREHOUSE', url: '/urban-warehouse.glb', theme: 'original', floor: '#222', background: '#111', light: '#eee', ambient: '#ddd', ground: '#555', exposure: 1 },
    },
    GLTFLoader: class {
      async loadAsync(url) { requests.push(url); return { scene: {} }; }
    },
    createWarehousePark() {
      return {
        park: {}, collision: {},
        manifest: {
          spawn: [0, .15, 0], rails: [], statistics: {},
          features: [], lines: [],
          views: { overview: {}, top: {} },
          environment: {},
        },
      };
    },
    createUrbanRubberFloorMaterial: () => ({ dispose() {} }),
    excludeGrandWarehouseMisplacedSixStair: () => { exclusionCalls++; return 7; },
    buildImportedWarehouseCollision: () => ({ collision: { children: [] }, rails: [], triangles: 120, surfaces: [] }),
    batchWarehouseVisuals: () => ({
      park: {traverse() {}}, sourceMeshes: 1400, visualTriangles: 10000,
      drawCalls: 30, rubberFloorMeshes: 1,
    }),
    releaseVisualRoot: () => {},
    ensureGrandWarehouseSpawns: () => {},
    refineWarehouseMaterials,
  };
  const load = runInNewContext(functionBody + '\ncreateWarehouseVariant', mocks, {
    filename: 'src/park/WarehouseVariants.js', timeout: 5000,
  });
  const grand = await load('grand-warehouse');
  assert.equal(grand.manifest.id, 'grand-warehouse');
  assert.equal(grand.manifest.statistics.excludedMisplacedSixStairMeshes, 7);
  assert.equal(grand.manifest.statistics.rubberFloorMeshes, 1);
  assert.equal(exclusionCalls, 1);

  // Same test safeguards Map 2's loader against accidental Grand-only edits.
  const urban = await load('urban-warehouse');
  assert.equal(urban.manifest.id, 'urban-warehouse');
  assert.equal('excludedMisplacedSixStairMeshes' in urban.manifest.statistics, false);
  assert.equal(exclusionCalls, 1);
  assert.deepEqual(requests, ['/granwarehouse.glb', '/urban-warehouse.glb']);
});
