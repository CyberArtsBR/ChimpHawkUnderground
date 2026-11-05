import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { StreetSkater } from '../src/game/StreetSkater.js';
import { UnrealRider } from '../src/character/UnrealRider.js';

test('newer model wins when old GLB resolves late', async () => {
  const previousLoad = UnrealRider.prototype.load;
  const previousDispose = UnrealRider.prototype.dispose;
  const complete = new Map();
  const disposed = [];
  try {
    UnrealRider.prototype.load = function() {
      const required = ['pelvis','head','upperarm_l','upperarm_r','thigh_l','thigh_r','foot_l','foot_r'];
      this.bones = Object.fromEntries(required.map(n => [n, {name:n}]));
      return new Promise(resolve => complete.set(this.url, () => resolve(this)));
    };
    UnrealRider.prototype.dispose = function() {
      disposed.push(this.url); this.root.removeFromParent();
    };
    const skater = Object.create(StreetSkater.prototype);
    skater.visual = new THREE.Group();
    skater.board = {deckHeight:0.12};
    skater.rider = {url:'old',dispose(){}};
    skater.resetPresentationAfterSwap = () => {};
    const older = skater.setRiderModel('older');
    const newer = skater.setRiderModel('newer');
    complete.get('newer')(); await newer;
    complete.get('older')(); await older;
    assert.equal(skater.rider.url,'newer');
    assert.deepEqual(disposed,['older']);
    const cancelled = skater.setRiderModel('cancelled');
    skater.cancelRiderSwap();
    complete.get('cancelled')(); await cancelled;
    assert.equal(skater.rider.url,'newer');
    assert.deepEqual(disposed,['older','cancelled']);
  } finally {
    UnrealRider.prototype.load = previousLoad;
    UnrealRider.prototype.dispose = previousDispose;
  }
});

test('character swap keeps respawn ghosting off the skateboard', async () => {
  const previousLoad = UnrealRider.prototype.load;
  const previousDispose = UnrealRider.prototype.dispose;
  const boardMaterial = new THREE.MeshBasicMaterial();
  const riderMaterial = new THREE.MeshBasicMaterial({ transparent: true, opacity: .85, depthWrite: false });
  try {
    UnrealRider.prototype.load = async function() {
      this.bones = Object.fromEntries(['pelvis','head','upperarm_l','upperarm_r','thigh_l','thigh_r','foot_l','foot_r'].map(name => [name, { name }]));
      this.root.add(new THREE.Mesh(new THREE.BoxGeometry(), [riderMaterial, riderMaterial]));
      return this;
    };
    UnrealRider.prototype.dispose = function() { this.root.removeFromParent(); };
    const skater = Object.create(StreetSkater.prototype);
    skater.visual = new THREE.Group();
    skater.visual.add(new THREE.Mesh(new THREE.BoxGeometry(), boardMaterial));
    skater.board = { deckHeight: .12 };
    skater.rider = { url: 'old', dispose() {} };
    skater.resetPresentationAfterSwap = () => {};

    await skater.setRiderModel('replacement');

    assert.deepEqual(skater.flashMaterials, [{ material: riderMaterial,
      opacity: .85, transparent: true, depthWrite: false }]);
    // Apply the respawn material transaction exactly as the runtime does.
    for (const saved of skater.flashMaterials) {
      saved.material.transparent = true;
      saved.material.opacity = .22;
      saved.material.depthWrite = false;
    }
    assert.equal(boardMaterial.opacity, 1);
    assert.equal(boardMaterial.transparent, false);
    assert.equal(boardMaterial.depthWrite, true);
  } finally {
    UnrealRider.prototype.load = previousLoad;
    UnrealRider.prototype.dispose = previousDispose;
  }
});
