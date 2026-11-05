import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Group, Quaternion, Vector3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { UnrealRider } from '../src/character/UnrealRider.js';
import { StreetBoard } from '../src/skateboard/StreetBoard.js';
import { FLATLAND_NAMES } from '../src/character/FlatlandMotion.js';

test('production skeleton keeps finite joints through every variation, push and exit', async () => {
  const bytes = await readFile(new URL('../public/assets/rider/TheanchoURi.glb', import.meta.url));
  const length = bytes.readUInt32LE(12);
  const json = JSON.parse(bytes.subarray(20, 20 + length).toString());
  // Keep production geometry and bones; texture decoding is unnecessary for IK.
  for (const mesh of json.meshes) for (const primitive of mesh.primitives) delete primitive.material;
  delete json.materials; delete json.textures; delete json.images;
  const binary = bytes.subarray(28 + length);
  json.buffers[0].uri = 'data:application/octet-stream;base64,' + binary.toString('base64');
  globalThis.ProgressEvent ||= class { constructor(type, init) { Object.assign(this, {type}, init); } };
  const loader = new GLTFLoader();
  const parsed = await loader.parseAsync(JSON.stringify(json), '');
  const original = GLTFLoader.prototype.loadAsync;
  GLTFLoader.prototype.loadAsync = async () => parsed;
  const rider = new UnrealRider('test');
  try { await rider.load(); } finally { GLTFLoader.prototype.loadAsync = original; }
  const board = new StreetBoard('test');
  board.deckHeight = 0.12;
  const parent = new Group();
  parent.add(board.root, rider.root);
  let elapsed = 0;
  for (const stance of [1, -1]) for (const flatland of [...FLATLAND_NAMES, null]) {
    for (let i = 0; i < 20; i++) {
      elapsed += 1/60;
      board.update({ flatland, stance, manual: 'manual', dt: 1/60 });
      rider.update({ board, flatland, stance, manual: 'manual', time: elapsed, dt: 1/60,
        pushWeight: flatland ? 0 : 1, pushPhase: i / 20,
        presentation: {state: flatland ? 'FLATLAND' : 'PUSH'} });
      for (const bone of rider.rest.keys()) {
        assert.ok(bone.quaternion.toArray().every(Number.isFinite), `${flatland}: ${bone.name}`);
        assert.ok(bone.matrixWorld.elements.every(Number.isFinite));
      }
    }
  }
  for (const stance of [1, -1]) {
    parent.rotation.set(0.1, 0.6, -0.08);
    parent.position.set(3, 1, -2);
    for (let i = 0; i < 120; i++) {
      board.update({flatland: 'Handstand', manual: 'manual', stance, dt: 1/60});
      rider.update({board, flatland: 'Handstand', manual: 'manual', stance, dt: 1/60,
        presentation: {state: 'FLATLAND'}});
    }
    const local = name => rider.root.worldToLocal(rider.bones[name].getWorldPosition(new Vector3()));
    assert.ok(local('pelvis').y > local('head').y + 0.25, 'body must be inverted');
    for (const side of ['l', 'r']) {
      assert.ok(local('foot_' + side).y > local('pelvis').y + 0.4, 'feet must extend above hips');
      const hand = rider.bones['hand_' + side].getWorldPosition(new Vector3());
      const finger = rider.bones['middle_01_' + side].getWorldPosition(new Vector3());
      const outward = new Vector3(0, 0, side === 'l' ? 1 : -1)
        .applyQuaternion(board.root.getWorldQuaternion(new Quaternion()));
      assert.ok(finger.sub(hand).normalize().dot(outward) > 0.9, 'handstand fingers must point outward');
      const elbow = local('lowerarm_' + side);
      assert.ok(elbow.z * (side === 'l' ? 1 : -1) > 0.18, 'elbows must stay outside the head');
      assert.ok(hand.distanceTo(rider.handstandTarget(side, board)) < 0.025, 'hands must reach deck: ' + hand.distanceTo(rider.handstandTarget(side, board)) + ' shoulder ' + local('upperarm_' + side).toArray());
    }
    for (let i = 0; i < 120; i++) {
      board.update({manual: 'manual', stance, dt: 1/60});
      rider.update({board, manual: 'manual', stance, dt: 1/60, presentation: {state: 'MANUAL'}});
    }
    assert.ok(local('head').y > local('pelvis').y + 0.25, 'exit must restore upright posture');
  }
  rider.resetPresentation();
  board.resetPresentation();
  assert.equal(rider.scalar.compression.value, 0);
});
