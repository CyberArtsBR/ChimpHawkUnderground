import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { StaticPassProxy, proxyCandidate, PROXY_PASS } from '../src/graphics/StaticPassProxy.js';
import { GraphicsPipeline, neutralizeFog } from '../src/graphics/GraphicsPipeline.js';

const box = (material = new THREE.MeshStandardMaterial(), at = [0, 0, 0]) => {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), material);
  mesh.position.set(...at); mesh.castShadow = true;
  return mesh;
};
const tris = mesh => (mesh.geometry.index ? mesh.geometry.index.count : mesh.geometry.attributes.position.count) / 3;
const proxyTris = (proxy, pass) => proxy.proxies[pass].reduce((n, o) => n + o.geometry.index.count / 3, 0);

function world() {
  const scene = new THREE.Scene(), park = new THREE.Group();
  scene.add(park);
  return { scene, park };
}

test('only static, fully known park meshes are covered', () => {
  const { scene, park } = world();
  const plain = box(), far = box(undefined, [100, 0, 0]);
  const hidden = box(); hidden.visible = false;
  const parent = box(), leaf = box(); parent.add(leaf);
  const shader = box(new THREE.ShaderMaterial());
  const waving = box(new THREE.MeshStandardMaterial()); waving.material.userData.animatedVertices = true;
  const instanced = new THREE.InstancedMesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial(), 3);
  const outside = box(); scene.add(outside);
  park.add(plain, far, hidden, parent, shader, waving, instanced);
  const proxy = new StaticPassProxy(scene).build(park);
  assert.deepEqual([...proxy.entries.keys()].sort((a, b) => a.id - b.id), [plain, far, leaf].sort((a, b) => a.id - b.id), 'a mesh with children is skipped (hiding it would hide them); its leaf child is fine');
  assert.equal(proxyCandidate(outside, park), false, 'meshes outside the world are left alone');
  assert.equal(proxy.cells.size, 2, 'spatial cells keep off-screen culling');
  assert.equal(proxy.entries.has(parent), false);
});

test('the merged copy has exactly the same triangles, in world space', () => {
  const { scene, park } = world();
  const a = box(undefined, [3, 1, 2]), b = box(undefined, [5, 0, 1]);
  b.rotation.y = .7; park.add(a, b);
  const proxy = new StaticPassProxy(scene).build(park);
  for (const pass of ['occluder', 'shadow', 'normal']) assert.equal(proxyTris(proxy, pass), tris(a) + tris(b), pass);
  const bounds = new THREE.Box3();
  for (const object of proxy.proxies.occluder) bounds.union(object.geometry.boundingBox);
  const expected = new THREE.Box3().setFromObject(a).union(new THREE.Box3().setFromObject(b));
  assert.ok(bounds.min.distanceTo(expected.min) < 1e-5 && bounds.max.distanceTo(expected.max) < 1e-5);
});

test('a pass hides the covered meshes, shows its cells, and restores everything', () => {
  const { scene, park } = world();
  const a = box(), b = box(); park.add(a, b);
  const proxy = new StaticPassProxy(scene).build(park);
  assert.ok(proxy.root.children.every(o => !o.visible), 'cells are never drawn by the main view');
  assert.equal(proxy.begin('shadow'), true);
  assert.equal(a.visible || b.visible, false);
  assert.ok(proxy.proxies.shadow.every(o => o.visible && o.castShadow));
  assert.ok(proxy.proxies.occluder.every(o => !o.visible));
  proxy.end();
  assert.equal(a.visible && b.visible, true);
  assert.ok(proxy.root.children.every(o => !o.visible));
});

test('shadow copies follow three.js depth-material rules', () => {
  const { scene, park } = world();
  const front = box(new THREE.MeshStandardMaterial({ side: THREE.FrontSide }));
  const double = box(new THREE.MeshStandardMaterial({ side: THREE.DoubleSide }));
  const cutout = box(new THREE.MeshStandardMaterial({ map: new THREE.Texture(), alphaTest: .5 }));
  const noCast = box(); noCast.castShadow = false;
  park.add(front, double, cutout, noCast);
  const proxy = new StaticPassProxy(scene).build(park);
  const passes = mesh => proxy.entries.get(mesh).passes;
  assert.ok(passes(cutout) & PROXY_PASS.occluder, 'cut-outs still block glow (as the black swap did)');
  assert.equal(passes(cutout) & PROXY_PASS.shadow, 0, 'cut-out shadows keep their own alpha-tested pass');
  assert.equal(passes(noCast) & PROXY_PASS.shadow, 0);
  const sides = proxy.proxies.shadow.map(o => o.material.side).sort();
  assert.deepEqual(sides, [THREE.FrontSide, THREE.DoubleSide].sort(), 'one copy per side rule');
});

test('glow meshes keep their own material; contact-shading exclusions are respected', () => {
  const { scene, park } = world();
  const led = box(new THREE.MeshStandardMaterial({ name: 'LED / strip', emissive: 0xffffff }));
  const decal = box(new THREE.MeshBasicMaterial());
  park.add(led, decal);
  const proxy = new StaticPassProxy(scene).build(park, {
    glowMesh: mesh => mesh === led, normalExcluded: mesh => mesh.material.isMeshBasicMaterial,
  });
  assert.equal(proxy.entries.get(led).passes & PROXY_PASS.occluder, 0);
  assert.equal(proxy.entries.get(decal).passes & PROXY_PASS.normal, 0);
  assert.ok(proxy.entries.get(led).passes & PROXY_PASS.normal);
});

test('multi-material meshes copy each group into the right shadow rule', () => {
  const { scene, park } = world();
  const geometry = new THREE.BoxGeometry(); // 6 groups
  const mesh = new THREE.Mesh(geometry, [0, 1, 2, 3, 4, 5].map(i => new THREE.MeshStandardMaterial({ side: i < 3 ? THREE.FrontSide : THREE.DoubleSide })));
  mesh.castShadow = true; park.add(mesh);
  const proxy = new StaticPassProxy(scene).build(park);
  const bySide = Object.fromEntries(proxy.proxies.shadow.map(o => [o.material.side, o.geometry.index.count / 3]));
  assert.deepEqual(bySide, { [THREE.FrontSide]: 6, [THREE.DoubleSide]: 6 });
});

test('a covered mesh that moves is rebuilt; one that keeps moving is left out', () => {
  const { scene, park } = world();
  const a = box(undefined, [1, 0, 0]), b = box(undefined, [2, 0, 0]); park.add(a, b);
  const proxy = new StaticPassProxy(scene).build(park);
  a.position.x = 3; scene.updateMatrixWorld(true);
  assert.equal(proxy.verify(), true);
  assert.ok(proxy.entries.has(a), 'one move: rebuilt at the new place');
  const max = Math.max(...proxy.proxies.occluder.map(o => o.geometry.boundingBox.max.x));
  assert.ok(Math.abs(max - 3.5) < 1e-5);
  a.position.x = 4; scene.updateMatrixWorld(true);
  proxy.verify();
  assert.equal(proxy.entries.has(a), false, 'animated: draws itself from now on');
  assert.ok(proxy.entries.has(b));
  a.visible = true; b.visible = false; scene.updateMatrixWorld(true);
  proxy.verify();
  assert.equal(proxy.entries.has(b), false, 'hidden meshes leave the copy');
  assert.equal(proxy.verify(), false, 'nothing changed: no work');
});

test('the shadow map swaps in the copy only for real shadow updates', () => {
  const { scene, park } = world();
  const a = box(); park.add(a);
  const seen = [];
  const shadowMap = { enabled: true, autoUpdate: true, needsUpdate: false, render() { seen.push(a.visible); } };
  const pipeline = Object.create(GraphicsPipeline.prototype);
  Object.assign(pipeline, { scene, renderer: { shadowMap }, passProxy: new StaticPassProxy(scene).build(park) });
  pipeline.wrapShadowMap();
  shadowMap.render([{}], scene, null);
  shadowMap.autoUpdate = false;
  shadowMap.render([{}], scene, null);
  assert.deepEqual(seen, [false, true]);
  assert.equal(a.visible, true);
});

test('glow-pass fog keeps its shader variant but adds nothing, then restores', () => {
  const linear = new THREE.Fog('#123', 10, 90), exp = new THREE.FogExp2('#123', .02);
  const restoreLinear = neutralizeFog(linear), restoreExp = neutralizeFog(exp);
  assert.ok(linear.near >= 1e8 && exp.density === 0);
  restoreLinear(); restoreExp();
  assert.deepEqual([linear.near, linear.far, exp.density], [10, 90, .02]);
  assert.equal(neutralizeFog(null), null);
});
