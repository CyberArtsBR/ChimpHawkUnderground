import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { GraphicsPipeline } from '../src/graphics/GraphicsPipeline.js';
import { renderFloorReflections } from '../src/graphics/FloorReflections.js';
import { separateSkinnedMaterials } from '../src/character/UnrealRider.js';

test('glow-mask black: one identical copy per shader variant', () => {
  const pipeline = Object.create(GraphicsPipeline.prototype);
  pipeline.blackoutMaterial = new THREE.MeshBasicMaterial({ color: 0, side: THREE.DoubleSide });
  const plain = new THREE.Mesh(new THREE.BoxGeometry());
  const skinned = new THREE.SkinnedMesh(new THREE.BoxGeometry());
  const instanced = new THREE.InstancedMesh(new THREE.BoxGeometry(), undefined, 2);
  assert.equal(pipeline.occluderFor(plain), pipeline.blackoutMaterial);
  const s = pipeline.occluderFor(skinned), i = pipeline.occluderFor(instanced);
  assert.notEqual(s, pipeline.blackoutMaterial);
  assert.notEqual(s, i);
  assert.equal(pipeline.occluderFor(new THREE.SkinnedMesh(new THREE.BoxGeometry())), s, 'cached per variant');
  for (const m of [s, i]) assert.deepEqual([m.color.getHex(), m.side, m.toneMapped, m.fog],
    [0, THREE.DoubleSide, pipeline.blackoutMaterial.toneMapped, pipeline.blackoutMaterial.fog]);
});

test('a material shared by skinned and rigid rider meshes is split', () => {
  const model = new THREE.Group(), shared = new THREE.MeshStandardMaterial({ color: 0x336699 });
  const body = new THREE.SkinnedMesh(new THREE.BoxGeometry(), shared);
  const prop = new THREE.Mesh(new THREE.BoxGeometry(), shared);
  const other = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial());
  model.add(body, prop, other);
  assert.equal(separateSkinnedMaterials(model), 1);
  assert.equal(body.material, shared);
  assert.notEqual(prop.material, shared);
  assert.equal(prop.material.color.getHex(), 0x336699);
  assert.equal(separateSkinnedMaterials(model), 0, 'nothing left to split');
});

test('floor mirrors refresh top-level, every other frame, only when on screen', () => {
  const root = new THREE.Group(), camera = new THREE.PerspectiveCamera(60, 1, .1, 100);
  camera.position.set(0, 2, 5); camera.lookAt(0, 0, 0); camera.updateMatrixWorld();
  const make = x => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
    m.position.x = x; m.userData.reflectionFrame = 0; m.userData.calls = 0;
    m.userData.refreshReflection = function () { this.userData.calls++; };
    root.add(m); return m;
  };
  const seen = make(0), behind = make(500);
  root.updateMatrixWorld(true);
  for (let i = 0; i < 4; i++) renderFloorReflections(root, {}, new THREE.Scene(), camera);
  assert.equal(seen.userData.calls, 2, 'half rate');
  assert.equal(behind.userData.calls, 0, 'frustum culled');
  root.visible = false;
  assert.equal(renderFloorReflections(root, {}, new THREE.Scene(), camera), 0);
});
