import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { UnrealRider } from '../src/character/UnrealRider.js';

test('rider disposal releases only its owned GPU objects, exactly once', () => {
  const rider = new UnrealRider('unused.glb');
  const scene = new THREE.Group();
  scene.add(rider.root);
  rider.model = new THREE.Group();
  rider.root.add(rider.model);

  const geometry = new THREE.BufferGeometry();
  const texture = new THREE.Texture();
  const material = new THREE.MeshBasicMaterial({ map: texture });
  const meshA = new THREE.Mesh(geometry, material);
  const meshB = new THREE.Mesh(geometry, material);
  const skeleton = { dispose() { counts.skeleton += 1; } };
  meshA.isSkinnedMesh = true;
  meshA.skeleton = skeleton;
  rider.model.add(meshA, meshB);

  const counts = { geometry: 0, material: 0, texture: 0, skeleton: 0 };
  for (const [obj, kind] of [[geometry,'geometry'], [material,'material'], [texture,'texture']]) {
    const original = obj.dispose.bind(obj);
    obj.dispose = () => { counts[kind] += 1; original(); };
  }

  const sharedBoard = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial());
  scene.add(sharedBoard);
  let sharedDisposed = 0;
  sharedBoard.geometry.dispose = () => { sharedDisposed += 1; };
  sharedBoard.material.dispose = () => { sharedDisposed += 1; };

  rider.dispose();
  rider.dispose();
  assert.equal(rider.root.parent, null);
  assert.equal(sharedBoard.parent, scene);
  assert.equal(sharedDisposed, 0);
  assert.deepEqual(counts, { geometry: 1, material: 1, texture: 1, skeleton: 1 });
});

test('failed or empty imports can be disposed safely', () => {
  const rider = new UnrealRider('unused.glb');
  assert.doesNotThrow(() => rider.dispose());
  assert.doesNotThrow(() => rider.dispose());
});
