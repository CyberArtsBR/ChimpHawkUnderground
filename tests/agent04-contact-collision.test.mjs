import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { ParkCollision } from '../src/game/ParkCollision.js';
import { SkateboardContactRig } from '../src/game/SkateboardContactRig.js';
import { CollisionResolver } from '../src/game/collision/CollisionResolver.js';

const material = () => new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
const UP = new THREE.Vector3(0, 1, 0);
const v = (x, y, z) => new THREE.Vector3(x, y, z);

function box({ x = 0, y = -0.05, z = 0, w = 8, h = 0.1, d = 8, solid = false, railId = null } = {}) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material());
  mesh.position.set(x, y, z);
  if (solid) mesh.userData.surface = 'solid';
  if (railId) mesh.userData.railId = railId;
  return mesh;
}

function world(...meshes) {
  const root = new THREE.Group();
  root.add(...meshes);
  root.updateMatrixWorld(true);
  const surface = new ParkCollision(root);
  return { surface, rig: new SkateboardContactRig(surface) };
}

function profile(fn, start = -5, end = 5, segments = 160) {
  const vertices = [], indices = [];
  for (let i = 0; i <= segments; i++) {
    const z = THREE.MathUtils.lerp(start, end, i / segments);
    const y = fn(z);
    vertices.push(-3, y, z, 3, y, z);
  }
  for (let i = 0; i < segments; i++) {
    const k = i * 2;
    indices.push(k, k + 2, k + 3, k, k + 3, k + 1);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return new THREE.Mesh(geometry, material());
}

test('Agent04 flatground: four stable wheel contacts and consistent clearance', () => {
  const { rig } = world(box());
  let state = rig.snapToGround(v(0, 0.7, 0), 0, 1, 2);
  assert.equal(state.count, 4);
  assert.equal(state.frontSupported, 2);
  assert.equal(state.rearSupported, 2);
  assert.ok(Math.abs(state.position.y - rig.skin) < 0.025);
  let previous = state.position.clone(), maxDrift = 0;
  for (let i = 0; i < 120; i++) {
    state = rig.solveGround(previous, previous, 0, state.normal.clone());
    assert.equal(state.count, 4);
    assert.ok(Number.isFinite(state.pitch) && Number.isFinite(state.roll));
    maxDrift = Math.max(maxDrift, Math.abs(state.position.y - previous.y));
    previous = state.position.clone();
  }
  assert.ok(maxDrift < 0.025, `flat contact jittered by ${maxDrift}`);
});

test('Agent04 bank: wheels conform to inclined surface without losing support', () => {
  const { rig } = world(profile(z => z > 1 ? 0 : z > -2 ? (1 - z) * 0.27 : 0.81));
  let state = rig.snapToGround(v(0, 0.8, 2), 0, 2, 3), minY = 1;
  for (let i = 0; i < 68; i++) {
    const before = state.position.clone();
    const desired = before.clone().add(v(0, 0, -0.05));
    state = rig.solveGround(desired, before, 0, state.normal.clone(), true);
    assert.ok(state.supported, `lost support at bank step ${i}`);
    minY = Math.min(minY, state.normal.y);
  }
  assert.ok(minY < 0.99, `bank normal did not track the slope: ${minY}`);
});

test('Agent04 curve: bowl-floor to ramp normal remains finite and continuous', () => {
  const { rig } = world(profile(z => z > 0.5 ? 0 : Math.pow(Math.max(0, 0.5 - z), 2) * 0.14, -3, 3, 200));
  let state = rig.snapToGround(v(0, 0.7, 1.2), 0, 2, 3), previous = state.normal.clone();
  let minY = 1;
  for (let i = 0; i < 80; i++) {
    const before = state.position.clone();
    state = rig.solveGround(before.clone().add(v(0, 0, -0.045)), before, 0, previous, true);
    assert.ok(state.supported);
    assert.ok(Number.isFinite(state.position.y) && Number.isFinite(state.normal.lengthSq()));
    assert.ok(state.normal.dot(previous) > 0.88, 'normal flipped or snapped discontinuously');
    minY = Math.min(minY, state.normal.y);
    previous = state.normal.clone();
  }
  assert.ok(minY < 0.96);
});

test('Agent04 seam: front and rear wheels bridge separate rideable meshes', () => {
  const { rig } = world(box({ z: 1.51, d: 3 }), box({ z: -1.51, d: 3 }));
  let state = rig.snapToGround(v(0, 0.7, 1), 0, 1, 2), minCount = 4;
  for (let i = 0; i < 50; i++) {
    const before = state.position.clone();
    state = rig.solveGround(before.clone().add(v(0, 0, -0.045)), before, 0, state.normal.clone());
    assert.ok(state.supported, `false airborne state at seam step ${i}`);
    minCount = Math.min(minCount, state.count);
  }
  assert.ok(minCount >= 2, `seam count dropped to ${minCount}`);
});

test('Agent04 two-surface: wheel-height disagreement produces roll without NaN', () => {
  const { rig } = world(box({ x: -1, w: 2, y: -0.05 }), box({ x: 1, w: 2, y: 0 }));
  const state = rig.snapToGround(v(0, 0.7, 0), 0, 2, 3);
  assert.ok(state.count >= 3);
  assert.ok(Math.abs(state.roll) > 0.005 || Math.abs(state.normal.x) > 0.005);
});

test('Agent04 contact loss and re-entry: no phantom previous-wheel support', () => {
  const { rig } = world(box({ d: 4 }));
  let state = rig.snapToGround(v(0, 0.8, 0), 0, 2, 3);
  assert.equal(state.count, 4);
  const lost = rig.solveGround(v(0, state.position.y, 8), state.position.clone(), 0, UP, false);
  assert.equal(lost.supported, false);
  assert.equal(lost.count, 0);
  assert.equal(lost.frontSupported, 0);
  assert.equal(lost.rearSupported, 0);
  state = rig.snapToGround(v(0, 0.8, 0), 0, 2, 3);
  assert.equal(state.count, 4);
});

test('Agent04 one-wheel support never leverages an entire snap distance', () => {
  const mockSurface = {
    sweepRideable: () => null,
    probeRideable(expected, _normal, _rise, _drop, point, normal) {
      if (expected.x >= 0 || expected.z >= 0) return null;
      point.set(expected.x, 0, expected.z);
      normal.set(0, 1, 0);
      return { distance: expected.y, fraction: 1 };
    },
  };
  const rig = new SkateboardContactRig(mockSurface);
  const original = v(0, 0.35, 0);
  const state = rig.solveGround(original, original, 0, UP, false);
  assert.equal(state.count, 1);
  assert.ok(state.position.y >= original.y - 0.045001,
    `single wheel dragged deck down ${original.y - state.position.y}`);
  assert.ok(state.position.y <= original.y + 0.035001);
});

test('Agent04 sharp deck sweep skips floor overlap and still detects wall', () => {
  const { surface } = world(
    box({ w: 10, d: 10 }),
    box({ y: 0.3, z: 0, w: 3, h: 0.6, d: 0.018, solid: true }),
  );
  const point = v(0, 0, 0), normal = v(0, 0, 0);
  const hit = surface.sweepSolidSphere(v(0, 0.05, 0.9), v(0, 0.05, -0.9),
    0.07, point, normal, null, 0.08);
  assert.ok(hit, 'wall was hidden by strong floor-sphere overlap');
  assert.ok(hit.fraction >= 0 && hit.fraction <= 1);
  assert.ok(normal.z > 0.6, `wrong blocking face: ${normal.toArray()}`);
});

test('Agent04 sharp deck sweep ignores horizontal rideable floor', () => {
  const { surface } = world(box());
  const hit = surface.sweepSolidSphere(v(0, 0.05, 1), v(0, 0.05, -1),
    0.07, v(0, 0, 0), v(0, 0, 0), null, 0.08);
  assert.equal(hit, null);
});

test('Agent04 coping ignoreRail remains effective for board sphere sweeps', () => {
  const { surface } = world(box({
    y: 0.25, z: 0, w: 3, h: 0.5, d: 0.02, solid: true, railId: 'agent04-coping',
  }));
  const from = v(0, 0.23, 0.7), to = v(0, 0.23, -0.7);
  assert.ok(surface.sweepSolidSphere(from, to, 0.04, v(0, 0, 0), v(0, 0, 0)));
  assert.equal(surface.sweepSolidSphere(from, to, 0.04, v(0, 0, 0), v(0, 0, 0), 'agent04-coping'), null);
});

test('Agent04 large motion still sweeps thin wall and clips velocity without yaw authority', () => {
  const { surface } = world(box({ y: 1, z: 0, w: 6, h: 2, d: 0.012, solid: true }));
  const resolver = new CollisionResolver(surface);
  const start = v(0, 0.015, 1.8), inputVelocity = v(0, 0, -17);
  const resolved = resolver.resolveBody({
    from: start, desired: start.clone().addScaledVector(inputVelocity, 0.2),
    velocity: inputVelocity, grounded: true,
  });
  assert.ok(resolved.position.z > 0.1, `wall tunnelling: ${resolved.position.z}`);
  assert.ok(resolved.velocity.z >= -1e-7);
  assert.equal('heading' in resolved, false);
  assert.deepEqual(inputVelocity.toArray(), [0, 0, -17]);
});

test('Agent04 hard descending landing: sweep recovers multiple wheel supports', () => {
  const { rig } = world(box());
  const state = rig.solveLanding(v(0, 1.8, 0.3), v(0, -0.25, -0.2),
    0, UP, v(0, -12, -3));
  assert.ok(state?.supported);
  assert.ok(state.count >= 2 && state.frontSupported && state.rearSupported,
    `incomplete hard landing support: ${state?.count}`);
  assert.ok(state.position.y > -0.09);
});
