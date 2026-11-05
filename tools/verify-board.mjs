import * as THREE from 'three';
import { ParkCollision } from '../src/game/ParkCollision.js';
import { SkateboardContactRig } from '../src/game/SkateboardContactRig.js';

function surfaceProfile(fn, zMin, zMax, segments = 48, width = 5) {
  const vertices = [];
  const indices = [];
  for (let i = 0; i <= segments; i++) {
    const z = THREE.MathUtils.lerp(zMin, zMax, i / segments);
    const y = fn(z);
    vertices.push(-width * 0.5, y, z, width * 0.5, y, z);
  }
  for (let i = 0; i < segments; i++) {
    const a = i * 2, b = a + 1, c = a + 2, d = a + 3;
    indices.push(a, c, d, a, d, b);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setIndex(indices); geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
  return mesh;
}

function flatBox({ x = 0, y = -0.05, z = 0, w = 8, h = 0.1, d = 8, solid = false } = {}) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
  mesh.position.set(x, y, z);
  if (solid) mesh.userData.surface = 'solid';
  return mesh;
}

function makeWorld(...meshes) {
  const root = new THREE.Group(); root.add(...meshes); root.updateMatrixWorld(true);
  const surface = new ParkCollision(root);
  const rig = new SkateboardContactRig(surface);
  return { root, surface, rig };
}

function assert(condition, message) { if (!condition) throw new Error(message); }
function near(a, b, eps, message) { assert(Math.abs(a - b) <= eps, `${message}: ${a} vs ${b}`); }
function finiteState(s) {
  return Number.isFinite(s.position.lengthSq()) && Number.isFinite(s.normal.lengthSq())
    && Number.isFinite(s.pitch) && Number.isFinite(s.roll);
}

const tests = [];
function test(name, fn) { tests.push([name, fn]); }

test('stationary board on flat ground', () => {
  const { rig } = makeWorld(flatBox());
  const state = rig.snapToGround(new THREE.Vector3(0, 0.7, 0), 0, 1, 2);
  assert(state.supported && state.count === 4, `expected 4 wheel contacts, got ${state.count}`);
  near(state.normal.y, 1, 1e-4, 'flat normal');
  near(state.position.y, rig.skin, 0.025, 'flat support height');
});

test('forward riding on flat ground', () => {
  const { rig } = makeWorld(flatBox({ d: 20 }));
  let p = rig.snapToGround(new THREE.Vector3(0, 0.5, 3), 0, 1, 2).position.clone();
  for (let i = 0; i < 180; i++) {
    const before = p.clone(); p.z -= 0.035;
    const state = rig.solveGround(p, before, 0, new THREE.Vector3(0, 1, 0));
    assert(state.supported && state.count >= 3, `lost flat support at ${i}`);
    p.copy(state.position);
  }
  assert(p.z < -3, 'board did not travel forward');
});

test('flat to bank', () => {
  const profile = z => z > 1 ? 0 : z > -2 ? (1 - z) * 0.32 : 0.96;
  const { rig } = makeWorld(surfaceProfile(profile, -5, 5, 140));
  let p = rig.snapToGround(new THREE.Vector3(0, 0.5, 3), 0, 1, 2).position.clone();
  let normal = new THREE.Vector3(0, 1, 0), minY = 1;
  for (let i = 0; i < 130; i++) {
    const before = p.clone(); p.z -= 0.045;
    const state = rig.solveGround(p, before, 0, normal); assert(state.supported, `lost support ${i}`);
    p.copy(state.position); normal.copy(state.normal); minY = Math.min(minY, normal.y);
  }
  assert(minY < 0.97, `bank did not pitch board: ${minY}`);
});

test('bank to flat', () => {
  const profile = z => z > 2 ? 0 : z > -1 ? (2 - z) * 0.28 : 0.84;
  const { rig } = makeWorld(surfaceProfile(profile, -6, 6, 160));
  let p = rig.snapToGround(new THREE.Vector3(0, 1.2, 0.7), 0, 2, 3).position.clone();
  let normal = new THREE.Vector3(0, 0.96, 0.28).normalize();
  for (let i = 0; i < 70; i++) {
    const before = p.clone(); p.z -= 0.04;
    const state = rig.solveGround(p, before, 0, normal); assert(state.supported, `lost bank support ${i}`);
    p.copy(state.position); normal.copy(state.normal);
  }
  assert(normal.y > 0.985, `did not settle flat: ${normal.y}`);
});

test('quarter pipe ascent', () => {
  const profile = z => {
    if (z > 0) return 0;
    const t = THREE.MathUtils.clamp(-z / 3, 0, 0.94);
    return 3 * (1 - Math.sqrt(Math.max(0, 1 - t * t)));
  };
  const { rig } = makeWorld(surfaceProfile(profile, -3, 2, 220));
  let p = rig.snapToGround(new THREE.Vector3(0, 0.5, 1), 0, 1, 2).position.clone();
  let normal = new THREE.Vector3(0, 1, 0), minY = 1;
  while (p.z >= -2.73) {
    const before = p.clone(); p.z -= 0.025;
    const state = rig.solveGround(p, before, 0, normal); assert(state.supported, `lost quarter support z=${p.z}`);
    p.copy(state.position); normal.copy(state.normal); minY = Math.min(minY, normal.y);
  }
  assert(minY < 0.5, `quarter pipe never became steep: ${minY}`);
});

test('bowl ascent', () => {
  const profile = z => z > 0.3 ? 0 : 1.8 * Math.pow(THREE.MathUtils.clamp((0.3 - z) / 3.2, 0, 1), 2.05);
  const { rig } = makeWorld(surfaceProfile(profile, -3.4, 2.5, 200));
  let p = rig.snapToGround(new THREE.Vector3(0, 0.6, 1.2), 0, 1, 2).position.clone();
  let normal = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i < 130; i++) {
    const before = p.clone(); p.z -= 0.025;
    const state = rig.solveGround(p, before, 0, normal); assert(state.supported, `lost bowl support ${i}`);
    p.copy(state.position); normal.copy(state.normal);
  }
  assert(p.y > 0.65 && normal.y < 0.9, `bowl ascent failed y=${p.y}, ny=${normal.y}`);
});

test('riding beside stairs without climbing stair wall', () => {
  const floor = flatBox({ w: 10, d: 12 });
  const steps = [];
  for (let i = 0; i < 4; i++) steps.push(flatBox({ x: 1.45, y: 0.09 + i * 0.18, z: -0.3 - i * 0.5, w: 1.5, h: 0.18 + i * 0.36, d: 0.5, solid: true }));
  const { rig } = makeWorld(floor, ...steps);
  let p = rig.snapToGround(new THREE.Vector3(0.35, 0.5, 2), 0, 1, 2).position.clone();
  let normal = new THREE.Vector3(0, 1, 0);
  const maxY = p.y;
  for (let i = 0; i < 90; i++) {
    const before = p.clone(); const desired = p.clone(); desired.z -= 0.045;
    const v = new THREE.Vector3(0, 0, -5.4);
    rig.resolveClearance(before, desired, v, 0, normal);
    const state = rig.solveGround(desired, before, 0, normal); assert(state.supported, 'lost floor beside stairs');
    p.copy(state.position); normal.copy(state.normal);
  }
  assert(p.y < maxY + 0.08, `stair wall lifted board to ${p.y}`);
});

test('hitting a ledge side', () => {
  const { rig } = makeWorld(flatBox({ d: 12 }), flatBox({ y: 0.19, z: -0.8, w: 2, h: 0.38, d: 0.35, solid: true }));
  const from = rig.snapToGround(new THREE.Vector3(0, 0.5, 0.6), 0, 1, 2).position.clone();
  const desired = new THREE.Vector3(0, from.y, -1.3);
  const velocity = new THREE.Vector3(0, 0, -10);
  rig.resolveClearance(from, desired, velocity, 0, new THREE.Vector3(0, 1, 0));
  assert(desired.z > -0.72, `board crossed ledge side: ${desired.z}`);
  assert(Math.abs(velocity.z) < 0.5, `velocity not blocked: ${velocity.z}`);
});

test('crossing a seam', () => {
  const a = flatBox({ z: 1.51, d: 3 });
  const b = flatBox({ z: -1.51, d: 3 });
  const { rig } = makeWorld(a, b);
  let p = rig.snapToGround(new THREE.Vector3(0, 0.5, 1), 0, 1, 2).position.clone();
  let normal = new THREE.Vector3(0, 1, 0), minContacts = 4;
  for (let i = 0; i < 60; i++) {
    const before = p.clone(); p.z -= 0.04;
    const state = rig.solveGround(p, before, 0, normal); assert(state.supported, `fell into seam ${i}`);
    p.copy(state.position); normal.copy(state.normal); minContacts = Math.min(minContacts, state.count);
  }
  assert(minContacts >= 2, `seam support collapsed to ${minContacts}`);
});

test('ollie and slope landing', () => {
  const profile = z => (z < 0.5 ? (0.5 - z) * 0.22 : 0);
  const { rig } = makeWorld(surfaceProfile(profile, -5, 4, 160));
  const from = new THREE.Vector3(0, 1.15, 1.0);
  const to = new THREE.Vector3(0, 0.15, -0.4);
  const velocity = to.clone().sub(from).multiplyScalar(6);
  const state = rig.solveLanding(from, to, 0, new THREE.Vector3(0, 1, 0), velocity);
  assert(state?.supported && state.count >= 2, 'slope landing did not establish wheel support');
  assert(state.normal.y < 0.995, `landing ignored slope: ${state.normal.y}`);
});

test('nose clearance', () => {
  const { rig } = makeWorld(flatBox({ d: 10 }), flatBox({ y: 0.16, z: -0.55, w: 2, h: 0.32, d: 0.06, solid: true }));
  const from = rig.snapToGround(new THREE.Vector3(0, 0.5, 0.7), 0, 1, 2).position.clone();
  const desired = new THREE.Vector3(0, from.y, -0.7); const velocity = new THREE.Vector3(0, 0, -9);
  rig.resolveClearance(from, desired, velocity, 0, new THREE.Vector3(0, 1, 0));
  assert(!rig.state.noseClear, 'nose probe missed obstacle');
  assert(rig.state.tailClear, 'tail incorrectly blocked during forward impact');
});

test('tail clearance', () => {
  const { rig } = makeWorld(flatBox({ d: 10 }), flatBox({ y: 0.16, z: 0.55, w: 2, h: 0.32, d: 0.06, solid: true }));
  const from = rig.snapToGround(new THREE.Vector3(0, 0.5, -0.7), Math.PI, 1, 2).position.clone();
  const desired = new THREE.Vector3(0, from.y, 0.7); const velocity = new THREE.Vector3(0, 0, 9);
  rig.resolveClearance(from, desired, velocity, Math.PI, new THREE.Vector3(0, 1, 0));
  assert(!rig.state.noseClear || !rig.state.tailClear, 'clearance probes missed reverse obstacle');
});

test('different wheel heights', () => {
  const left = flatBox({ x: -1, y: 0, w: 2, d: 6, h: 0.1 });
  const right = flatBox({ x: 1, y: 0.07, w: 2, d: 6, h: 0.1 });
  const { rig } = makeWorld(left, right);
  const state = rig.snapToGround(new THREE.Vector3(0, 0.7, 0), 0, 1, 2);
  assert(state.supported && state.count >= 3, `mixed-height support count ${state.count}`);
  assert(Math.abs(state.roll) > 0.01 || Math.abs(state.normal.x) > 0.01, 'roll did not reflect wheel height difference');
});

test('high-speed movement without tunneling', () => {
  const wall = flatBox({ y: 0.17, z: -0.45, w: 2.5, h: 0.34, d: 0.035, solid: true });
  const { rig } = makeWorld(flatBox({ d: 12 }), wall);
  const from = rig.snapToGround(new THREE.Vector3(0, 0.5, 1.2), 0, 1, 2).position.clone();
  const desired = new THREE.Vector3(0, from.y, -2.2); const velocity = new THREE.Vector3(0, 0, -22);
  rig.resolveClearance(from, desired, velocity, 0, new THREE.Vector3(0, 1, 0));
  assert(desired.z > -0.39, `thin wall tunneled through at z=${desired.z}`);
  assert(Math.abs(velocity.z) < 0.6, `high-speed velocity not resolved ${velocity.z}`);
});

test('no NaN board orientation', () => {
  const profile = z => z < 0 ? Math.min(1.9, (-z) * 0.62) : 0;
  const { rig } = makeWorld(surfaceProfile(profile, -3, 3, 120));
  let p = rig.snapToGround(new THREE.Vector3(0, 0.5, 1.3), 0, 1, 2).position.clone();
  let normal = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i < 120; i++) {
    const before = p.clone(); p.z -= 0.027;
    const state = rig.solveGround(p, before, 0, normal);
    if (!state.supported) break;
    assert(finiteState(state), `non-finite state at ${i}`);
    p.copy(state.position); normal.copy(state.normal);
  }
});

let passed = 0;
for (const [name, fn] of tests) {
  try { fn(); passed++; console.log(`PASS ${name}`); }
  catch (error) { console.error(`FAIL ${name}: ${error.message}`); }
}
console.log(`Board physics verification: ${passed}/${tests.length} passed.`);
if (passed !== tests.length) process.exitCode = 1;
