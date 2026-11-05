import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { auditSolarDock } from '../tools/agent07-park-audit.mjs';

const audit = auditSolarDock();

test('agent07: surface bump generation avoids discarded high-resolution color canvases', async () => {
  const report = await audit;
  console.log('AGENT07_STRUCTURAL_METRICS=' + JSON.stringify({
    visibleMeshes: report.visibleMeshes,
    collisionMeshes: report.collisionMeshes,
    materialCount: report.materialCount,
    distinctTextures: report.distinctTextures,
    geometryAttributeMiB: report.geometryAttributeMiB,
    visualTriangles: report.visualTriangles,
    muralBatches: report.muralBatches,
    rooftopMeshCount: report.rooftopMeshCount,
    rideableCollisionBatches: report.rideableCollisionBatches,
    authoredRailCount: report.authoredRailCount,
    surfaceBumpBytesRGBA: report.surfaceBumpBytesRGBA,
  }));
  assert.equal(report.surfaceCanvasSizes.filter(([w, h]) => w === 512 && h === 512).length, 3);
  assert.equal(report.surfaceCanvasSizes.filter(([w, h]) => w === 1024 || h === 1024).length, 0);
  assert.equal(report.surfaceCanvasSizes.filter(([w, h]) => w === 128 && h === 128).length, 1,
    'one alpha mask for all murals, not one per mesh');
  assert.equal(report.surfaceBumpBytesRGBA, 3 * 512 * 512 * 4);
  assert.deepEqual(report.textureRequests.slice().sort(), [
    '/assets/park/hd/concrete.webp',
    '/assets/park/hd/graffiti.webp',
    '/assets/park/hd/plywood.webp',
  ]);
});

test('agent07: surface color spaces and PBR roughness remain correct', async () => {
  const { surfaceValidation: surface } = await audit;
  assert.equal(surface.woodAlbedoColorSpace, THREE.SRGBColorSpace);
  assert.equal(surface.concreteAlbedoColorSpace, THREE.SRGBColorSpace);
  assert.equal(surface.woodBumpColorSpace, THREE.NoColorSpace);
  assert.deepEqual(surface.woodReliefPixels, [512, 512]);
  assert.equal(surface.concreteAndBowlShareColorMap, true);
  assert.ok(surface.woodRoughness >= 0.5 && surface.woodRoughness <= 0.9);
  assert.ok(surface.concreteRoughness >= 0.7 && surface.concreteRoughness <= 1);
});

test('agent07: spatial mural and rooftop batching preserves visual triangles', async () => {
  const report = await audit;
  assert.ok(report.muralBatches >= 1 && report.muralBatches <= 4,
    'mural artwork should be in at most one batch per park quadrant');
  assert.equal(report.rooftopMeshCount, 2,
    'the slab must retain independent shadow flags while four fascia walls share one mesh');
  assert.equal(report.visualTriangles, report.manifestVisualTriangles,
    'reported triangle count must agree with real scene geometry');
  assert.ok(report.visualTriangles > 1000);
  assert.ok(report.materialCount <= 15);
});

test('agent07: all physical contacts and authored rail metadata survive batching', async () => {
  const report = await audit;
  assert.equal(report.rideableCollisionBatches, 1);
  assert.ok(report.collisionMeshes >= report.namedSolidRailCount);
  assert.ok(report.authoredRailCount >= 10);
  assert.ok(report.namedSolidRailCount > 0);
  assert.ok(report.geometryAttributeBytes > 0);
  assert.ok(report.transparentMeshes <= report.muralBatches + 2,
    'translucent mural count must shrink to spatial batches');
});
