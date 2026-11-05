import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { createWarehousePark } from '../src/park/WarehousePark.js';
import { ParkCollision } from '../src/game/ParkCollision.js';
import { RailNetwork } from '../src/game/RailNetwork.js';
import { SkateboardContactRig } from '../src/game/SkateboardContactRig.js';
import { compileTransitionMetadata, transitionMetadataCoverage } from '../src/game/transitions/TransitionMetadata.js';

// Environment checks use the shipping collision/board/rail services. No renderer,
// alternate movement engine, timers, input simulation, or gameplay tuning here.
const world = createWarehousePark({ textures: false });
const surface = new ParkCollision(world.collision);
const board = new SkateboardContactRig(surface);
const network = new RailNetwork(world.manifest.rails);
const ground = (x, z, y = 10, drop = 20) => surface.ground(new THREE.Vector3(x, y, z), 0, drop);
const near = (actual, expected, epsilon = .035) => assert.ok(Math.abs(actual - expected) < epsilon, `${actual} differs from ${expected}`);

test('Foundry has finite nondegenerate collision geometry and bounded render complexity', () => {
  let count = 0;
  world.collision.traverse(mesh => {
    if (!mesh.isMesh) return;
    const position = mesh.geometry.attributes.position;
    assert.ok(['rideable', 'solid'].includes(mesh.userData.surface));
    for (let i = 0; i < position.count; i += 3) {
      const points = [0, 1, 2].map(j => new THREE.Vector3().fromBufferAttribute(position, i + j));
      assert.ok(points.every(point => point.toArray().every(Number.isFinite)));
      assert.ok(points[1].clone().sub(points[0]).cross(points[2].clone().sub(points[0])).lengthSq() > 1e-14, `degenerate collision facet in ${mesh.name}`);
      count++;
    }
  });
  assert.ok(count > 20000 && count < 60000);
  assert.ok(world.manifest.statistics.visualMeshes < 50);
  assert.ok(world.manifest.statistics.visualTriangles < 150000);
  assert.ok(world.manifest.statistics.collisionMeshes < 20);
});

test('every named spawn has four supported wheels and a clear rider capsule in both stances', () => {
  assert.ok(world.manifest.spots.length >= 5);
  for (const spot of world.manifest.spots) for (const reversal of [0, Math.PI]) {
    const position = new THREE.Vector3(...spot.position);
    const contact = board.snapToGround(position, spot.heading + reversal, .5, 1);
    assert.equal(contact.count, 4, `${spot.id}: four wheel support`);
    assert.ok(contact.normal.y > .98, `${spot.id}: flat support`);
    const result = surface.move(contact.position, contact.position, new THREE.Vector3());
    assert.equal(result.contacts.length, 0, `${spot.id}: body clearance`);
  }
});

test('the warehouse floor has no unfilled cutouts or inverted rideable patches', () => {
  let samples = 0;
  // Offsets avoid sampling precisely on shared mesh edges. Every authored hole
  // must contain its matching riding surface, including the depressed bowl.
  for (let x = -72.63; x < 73; x += 1.3) for (let z = -52.71; z < 53; z += 1.3) {
    const hit = ground(x, z);
    if (!hit) {
      // Production wheel probes intentionally exclude the last near-vertical
      // facet at a lip. A real upward facet must still close that footprint.
      const ray = new THREE.Raycaster(new THREE.Vector3(x, 10, z), new THREE.Vector3(0, -1, 0), 0, 20);
      assert.ok(ray.intersectObjects(surface.ridingMeshes, false).some(hit => hit.face.normal.y > .005),
        `unfilled cutout at ${x.toFixed(2)}, ${z.toFixed(2)}`);
    } else assert.ok(hit.normal.y > .035);
    samples++;
  }
  assert.ok(samples > 8000);
});

test('central 35 by 25 metre plaza remains flat and unobstructed', () => {
  for (let x = -17.5; x <= 17.5; x += 2.5) for (let z = -12.5; z <= 12.5; z += 2.5) {
    const hit = ground(x, z);
    near(hit.point.y, 0);
    assert.ok(hit.normal.y > .999);
    assert.equal(surface.move(hit.point, hit.point, new THREE.Vector3()).contacts.length, 0);
  }
});

test('Timber Bowl stays open below plaza level with three depths and a flush roll-in', () => {
  near(ground(-48, -17).point.y, -3.05);
  assert.ok(ground(-48, -30).point.y < -3.5, 'deep north pocket');
  assert.ok(ground(-48, -5).point.y > -2.7, 'shallow south pocket');
  for (let z = -4; z <= 3; z += .1) {
    const hit = ground(-48, z);
    assert.ok(hit, 'continuous roll-in floor');
    assert.ok(hit.normal.y > .6, 'roll-in cannot hide a vertical wall');
  }
  const ray = new THREE.Raycaster(new THREE.Vector3(-48, 1, -17), new THREE.Vector3(0, -1, 0), 0, 10);
  const hits = ray.intersectObjects(surface.ridingMeshes, false);
  assert.ok(hits.length && hits.every(hit => hit.point.y < -3), 'no invisible flat spanning the opening');
  assert.ok(!world.manifest.rails.find(rail => rail.name.includes('bowl')).points.some(p => Math.hypot(p[0] + 48, p[2] - 1) < 2), 'no coping across roll-in');
});

test('competition halfpipe uses smooth 4.5 metre transitions, eight metre flat and full-width decks', () => {
  for (let x = -4; x <= 14; x += 3) for (let z = -37.9; z <= -30.1; z += .6) {
    const hit = ground(x, z); near(hit.point.y, 0); assert.ok(hit.normal.y > .999);
  }
  for (const side of [-1, 1]) {
    let previous = null;
    for (let i = 0; i < 47; i++) {
      const angle = (i + .25) / 48 * Math.PI / 2;
      const z = -34 + side * (4 + 4.5 * Math.sin(angle));
      const hit = ground(5, z);
      near(hit.point.y, 4.5 * (1 - Math.cos(angle)), .025);
      if (previous) assert.ok(hit.normal.dot(previous) > .995, 'no abrupt transition normal step');
      previous = hit.normal;
    }
    near(ground(5, -34 + side * 9.6).point.y, 4.5);
  }
});

test('signature curved rail is one continuous 25.8 metre path with smooth tangents and real supports', () => {
  const rail = network.rails.find(rail => rail.name === 'Foundry continuous horseshoe rail');
  assert.ok(rail && !rail.closed);
  assert.ok(rail.length > 25.7 && rail.length < 26);
  let previous = null;
  for (let distance = 0; distance <= rail.length; distance += .1) {
    const sample = network.sample(rail, distance);
    assert.ok(sample && sample.point.toArray().every(Number.isFinite));
    const capture = network.nearest(sample.point, .2);
    assert.equal(capture.rail, rail, 'curve never switches logical paths');
    if (previous) assert.ok(sample.tangent.dot(previous) > .995, 'smooth return tangent');
    previous = sample.tangent;
  }
  const solid = world.collision.children.find(mesh => mesh.userData.railId === rail.name);
  // Several regular posts belong to this same ID, including inside the arc.
  const positions = solid.geometry.attributes.position;
  let arcFootVertices = 0;
  for (let i = 0; i < positions.count; i++) if (positions.getY(i) < .1 && positions.getZ(i) > 29) arcFootVertices++;
  assert.ok(arcFootVertices > 50, 'supports present under curved span');
  assert.ok(rail.points.every(p => Math.abs(p.y - .9) < 1e-6));
});

test('all coping transitions compile using the shipping metadata contract', () => {
  const names = world.manifest.rails.map(rail => rail.name);
  assert.equal(new Set(names).size, names.length);
  assert.equal(transitionMetadataCoverage(world.manifest.rails).complete, true);
  const transitions = compileTransitionMetadata(world.manifest.rails);
  assert.ok(transitions.length >= 12);
  assert.ok(transitions.some(t => t.type === 'BOWL' && t.axisMode === 'RADIAL'));
  assert.ok(transitions.some(t => t.type === 'VERT' && t.lipHeight > 4.4));
  assert.ok(world.park.children.some(object => object.userData.cameraRoof));
  assert.equal(world.manifest.lines.length, 6);
});
