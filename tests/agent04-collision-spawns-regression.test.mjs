import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { ParkCollision } from '../src/game/ParkCollision.js';
import { SkateboardContactRig } from '../src/game/SkateboardContactRig.js';
import {
  ensureGrandWarehouseSpawns,
  isSafeGrandSpawnSupport,
} from '../src/park/GrandWarehouseSpawns.js';

const v = (x, y, z) => new THREE.Vector3(x, y, z);
const material = () => new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });

function surface(...meshes) {
  const root = new THREE.Group();
  root.add(...meshes);
  root.updateMatrixWorld(true);
  return new ParkCollision(root);
}

function levelFloor() {
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(160, 120), material());
  floor.rotation.x = -Math.PI / 2;
  floor.userData.surface = 'rideable';
  return floor;
}

function grandWorld(spots) {
  const collision = new THREE.Group();
  const floor = levelFloor();
  collision.add(floor);
  return { collision, floor, manifest: {
    spawn: [0, .15, 0], spawnHeading: 0,
    spots, statistics: {},
    playableRegions: [{ minX: -74, maxX: 74, minZ: -54, maxZ: 54 }],
  } };
}

test('Agent04 collision excludes zero-area, NaN and Infinity triangles from body broadphase', () => {
  const vertices = [
    0, 0, 0, 0, 0, 0, 0, 0, 0,
    1, 0, 0, Number.NaN, 1, 0, 0, 1, 0,
    1, 0, 0, Number.POSITIVE_INFINITY, 1, 0, 0, 1, 0,
  ];
  const invalid = new THREE.BufferGeometry();
  invalid.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  const badMesh = new THREE.Mesh(invalid, material());
  badMesh.userData.surface = 'solid';
  const floor = levelFloor();
  const collision = surface(floor, badMesh);
  assert.equal(collision.blocks.triangles.length, 0,
    'degenerate/invalid solid proxies must never form an invisible barrier');
  assert.equal(invalid.boundsTree, undefined,
    'invalid meshes must not be submitted to accelerated BVH construction');
  const hit = collision.ground(v(0, .25, 0), .3, .3);
  assert.ok(hit && Math.abs(hit.point.y) < 1e-5);
});

test('Agent04 geometry coverage includes reversed-winding but visible skateable surfaces', () => {
  const reversed = new THREE.Mesh(new THREE.PlaneGeometry(8, 8), material());
  reversed.rotation.x = Math.PI / 2;
  const collision = surface(reversed);
  const measured = collision.auditCoverage(reversed, [
    { minX: -3, maxX: 3, minZ: -3, maxZ: 3 },
  ], { samplesPerAxis: 7, originHeight: 4 });
  assert.equal(measured.sampled, 49);
  assert.equal(measured.visualSamples, 49);
  assert.equal(measured.matching, 49);
  assert.equal(measured.unsupported, 0);
  assert.equal(measured.heightMismatch, 0);
  assert.equal(measured.coverageRatio, 1);
});

function mockLandingSurface(bothTrucks) {
  const qualifies = p => bothTrucks || p.z < -0.1;
  return {
    sweepRideable(from, to, point, normal) {
      if (!qualifies(from)) return null;
      point.set(from.x, 0, from.z);
      normal.set(0, 1, 0);
      return { fraction: .5, distance: from.distanceTo(to) * .5 };
    },
    probeRideable(expected, previousNormal, rise, drop, point, normal) {
      if (!qualifies(expected)) return null;
      point.set(expected.x, 0, expected.z);
      normal.set(0, 1, 0);
      return { fraction: .5, distance: expected.y };
    },
  };
}

test('Agent04 airborne landing rejects a front-truck-only ledge catch', () => {
  const rig = new SkateboardContactRig(mockLandingSurface(false));
  const landing = rig.solveLanding(v(0, .6, 0), v(0, -.2, 0),
    0, v(0, 1, 0), v(0, -6, 0));
  assert.equal(landing, null, 'one-truck landing would falsely snap to a ledge');
  assert.equal(rig.state.frontSupported, 2);
  assert.equal(rig.state.rearSupported, 0);
});

test('Agent04 airborne landing still catches a genuine full-board floor', () => {
  const rig = new SkateboardContactRig(mockLandingSurface(true));
  const landing = rig.solveLanding(v(0, .6, 0), v(0, -.2, 0),
    0, v(0, 1, 0), v(0, -6, 0));
  assert.ok(landing?.supported);
  assert.equal(landing.count, 4);
  assert.equal(landing.frontSupported, 2);
  assert.equal(landing.rearSupported, 2);
});

test('Agent04 Grand spawn rejects stair-straddling wheels and wrong-facing normals', () => {
  const contact = y => ({
    valid: true, point: v(0, y, 0), normal: v(0, 1, 0),
  });
  const support = {
    supported: true, count: 4, normal: v(0, 1, 0), position: v(0, .015, 0),
    contacts: [contact(0), contact(0), contact(0), contact(0)],
  };
  assert.equal(isSafeGrandSpawnSupport(support, .15), true);
  support.contacts[2].point.y = .14;
  assert.equal(isSafeGrandSpawnSupport(support, .15), false);
  support.contacts[2].point.y = 0;
  support.contacts[2].normal.y = .92;
  assert.equal(isSafeGrandSpawnSupport(support, .15), false);
});

test('Agent04 Grand spawn placement is idempotent and preserves original floor transforms', () => {
  const world = grandWorld([
    { id: 'near', heading: 0, position: [0, .15, 0] },
    { id: 'second', heading: Math.PI, position: [6, .15, 6] },
  ]);
  // Cache the evaluated artist transform, not Three.js's stale default matrix.
  world.collision.updateMatrixWorld(true);
  const beforeTransform = world.floor.matrixWorld.clone();
  ensureGrandWarehouseSpawns(world);
  const first = JSON.stringify(world.manifest);
  assert.equal(world.manifest.statistics.grandValidatedSpawns, 3);
  ensureGrandWarehouseSpawns(world);
  assert.equal(JSON.stringify(world.manifest), first, 'second preparation moved validated spawns');
  assert.ok(world.floor.matrixWorld.equals(beforeTransform), 'spawn repair modified an artist-authored object');
});

test('Agent04 Grand spawn search does not partially overwrite manifest on failure', () => {
  const world = grandWorld([
    { id: 'unreachable', heading: 0, position: [300, 100, 300] },
  ]);
  const original = JSON.stringify(world.manifest);
  assert.throws(() => ensureGrandWarehouseSpawns(world), /no clear four-wheel spawn/);
  assert.equal(JSON.stringify(world.manifest), original);
});
