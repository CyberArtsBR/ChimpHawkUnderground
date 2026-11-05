import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { buildParkRouteMetadata, validateParkManifest } from '../src/park/ParkRegistry.js';
import { createWarehousePark } from '../src/park/WarehousePark.js';
import { annotateWarehouseFeatures } from '../src/park/WarehouseVariants.js';
import { splitOrbitScene } from '../src/park/OrbitPark.js';
import { WorldResourceScope } from '../src/park/WorldLifecycle.js';

test('ORBIT routes use existing authored spots and rails without mutating the asset manifest', () => {
  const manifest = JSON.parse(readFileSync('public/assets/spacepark/orbit-manifest.json', 'utf8'));
  const before = JSON.stringify(manifest);
  const routes = buildParkRouteMetadata(manifest, 'orbit');
  assert.equal(routes.length, 3);
  assert.deepEqual(routes.map(route => route.category), ['technical', 'flow', 'showcase']);
  const spots = new Map(manifest.spots.map(spot => [spot.id, spot]));
  const rails = new Set(manifest.rails.map(rail => rail.name));
  for (const route of routes) {
    assert.equal(route.navigation, 'feature-sequence');
    assert.ok(route.waypoints.length >= 2);
    for (const point of route.waypoints) {
      assert.deepEqual(point.position, spots.get(point.spotId).position);
      assert.ok(Object.isFrozen(point.position));
    }
    for (const name of route.railNames) assert.ok(rails.has(name));
  }
  assert.deepEqual(routes.find(route => route.id === 'technical').railNames,
    ['Cross-orbit long rail', 'Ion runway long rail', 'Long ledge ultraviolet edge']);
  assert.equal(JSON.stringify(manifest), before, 'route construction must not mutate authored metadata');
  assert.doesNotThrow(() => validateParkManifest({ ...manifest, routes }));
});

test('Grand Warehouse route anchors correspond to the current 150 x 110 m topology', () => {
  const world = createWarehousePark({ textures: false });
  const { manifest } = world;
  assert.equal(manifest.dimensions.startsWith('150 × 110'), true);
  const routes = buildParkRouteMetadata(manifest, 'grand-warehouse');
  assert.deepEqual(routes.map(route => route.category), ['technical', 'flow', 'showcase']);
  assert.equal(routes.find(route => route.id === 'technical').waypoints.at(-1).spotId, 'horseshoe');
  assert.equal(routes.find(route => route.id === 'flow').waypoints.at(-1).spotId, 'vert');
  assert.doesNotThrow(() => validateParkManifest({ ...manifest, routes }));
});

test('invalid references in published routes fail early', () => {
  const manifest = JSON.parse(readFileSync('public/assets/spacepark/orbit-manifest.json', 'utf8'));
  const routes = buildParkRouteMetadata(manifest, 'orbit');
  assert.throws(() => validateParkManifest({
    ...manifest,
    routes: routes.map((route, index) => index ? route : { ...route, railNames: ['imaginary rail'] }),
  }), /routes/);
  assert.throws(() => validateParkManifest({
    ...manifest,
    routes: routes.map((route, index) => index ? route : {
      ...route, waypoints: [{ ...route.waypoints[0], position: [9999, 0, 9999] }, route.waypoints[1]],
    }),
  }), /routes/);
});

test('GLB extras allow stable warehouse names without changing artist transforms', () => {
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial());
  mesh.name = 'Blender001';
  mesh.position.set(19, 3, -7);
  mesh.userData.skateFeatureId = 'grand/flow/ramp-07';
  mesh.userData.skateCollisionName = '04_FLOW_LAB / launch / Skateable_Surface';
  const original = mesh.matrix.toArray(), originalName = mesh.name;
  const root = new THREE.Group();
  root.add(mesh);
  const result = annotateWarehouseFeatures(root, 'grand-warehouse');
  assert.equal(result.annotated, 1);
  assert.equal(result.explicitAliases, 1);
  assert.equal(mesh.userData.name, mesh.userData.skateCollisionName);
  assert.equal(mesh.userData.skateFeatureId, 'grand/flow/ramp-07');
  assert.deepEqual(mesh.matrix.toArray(), original);
  assert.equal(mesh.name, originalName);
  assert.deepEqual(mesh.position.toArray(), [19, 3, -7]);
});

test('GLB surface extras classify renamed warehouse meshes without legacy Blender names', () => {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, .2, 1), new THREE.MeshStandardMaterial());
  mesh.name = 'Exported_Surface_023';
  mesh.userData.skateFeatureId = 'grand/flow/quarter-a';
  mesh.userData.skateCollisionSurface = 'rideable';
  const root = new THREE.Group();
  root.add(mesh);
  const result = annotateWarehouseFeatures(root, 'grand-warehouse');
  assert.equal(result.explicitSurfaceHints, 1);
  assert.equal(mesh.name, 'Exported_Surface_023');
  assert.equal(mesh.userData.name, 'SKATE_META / grand/flow/quarter-a / Skateable_Surface');
  assert.equal(mesh.userData.skateClassification, 'glb-metadata');
});

test('ORBIT honors explicit surface metadata on an otherwise unnamed mesh', () => {
  const scene = new THREE.Group();
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(2, .2, 2), new THREE.MeshStandardMaterial());
  mesh.name = 'renamed-after-export';
  mesh.userData.skateCollisionSurface = 'rideable';
  mesh.userData.skateFeatureId = 'orbit/flow/rideable-01';
  scene.add(mesh);
  const world = splitOrbitScene(scene);
  assert.equal(world.collision.children.length, 1);
  assert.equal(world.collision.children[0].userData.surface, 'rideable');
  assert.equal(world.collision.children[0].userData.skateFeatureId, 'orbit/flow/rideable-01');
  assert.equal(world.collision.children[0].userData.skateClassification, 'glb-metadata');
});

test('late cancelled worlds sharing geometry dispose GPU resources exactly once', () => {
  const counts = { geometry: 0, material: 0, texture: 0 };
  const texture = { isTexture: true, dispose() { counts.texture++; } };
  const geometry = { dispose() { counts.geometry++; } };
  const material = { map: texture, dispose() { counts.material++; } };
  const mesh = { isMesh: true, geometry, material };
  const root = () => ({ traverse(fn) { fn(mesh); }, removeFromParent() {} });
  const scope = new WorldResourceScope();
  scope.dispose();
  scope.trackWorld({ park: root(), collision: root() }, { disposeTextures: true });
  assert.deepEqual(counts, { geometry: 1, material: 1, texture: 1 });
});
