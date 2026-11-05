import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { StreetBoard } from '../src/skateboard/StreetBoard.js';
import { footWorldOrientation, plantedFootWorldPoint } from '../src/character/FootOrientation.js';
import { UnrealRider } from '../src/character/UnrealRider.js';

const EPS = 1e-5;
const closeVec = (actual, expected, note) =>
  assert.ok(actual.distanceTo(expected) < EPS, note + ': ' + actual.toArray());

test('painted GLB deck is always opaque and depth-writing after choosing a finish', () => {
  const board = new StreetBoard('/test-board.glb');
  board.model = new THREE.Group();
  const original = new THREE.MeshStandardMaterial({
    transparent: true, opacity: 0.22, depthWrite: false, alphaTest: 0.45,
  });
  const deck = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.045, 1.26), original);
  deck.name = 'Board1';
  board.model.add(deck);
  board.root.add(board.model);
  board.setFinish(3);
  assert.notEqual(deck.material, original, 'GLB material must not be modified in-place');
  assert.equal(deck.material.opacity, 1);
  assert.equal(deck.material.transparent, false);
  assert.equal(deck.material.depthWrite, true);
  assert.equal(deck.material.alphaTest, 0);
  assert.equal(deck.material.vertexColors, false, 'smooth Half Pipe paint is shader-driven');
  assert.ok(deck.material.userData.halfPipeFinish.hpTail.value.isColor);
  const oldPaint = deck.material.userData.halfPipeFinish.hpMiddle.value.clone();
  board.setFinish(6);
  assert.ok(!deck.material.userData.halfPipeFinish.hpMiddle.value.equals(oldPaint));
  assert.equal(deck.material.opacity, 1, 'reselecting a finish must not restore GLB alpha');
  assert.equal(deck.material.transparent, false);
});

test('180 shove-it retains board graphic yaw but not inverted foot contacts', () => {
  const board = new StreetBoard('/test-board.glb');
  board.deckHeight = 0.13;
  board.root.position.set(0, 0.13, 0);
  const before = plantedFootWorldPoint(board, -0.15, 0.07, 0.35);
  board.update({flipState:{name:'Pop Shove-it',yaw:0.5,pitch:0,roll:0,progress:1}});
  board.update({flipState:null});
  board.update({flipState:null,dt:1});
  assert.ok(Math.abs(board._yawHold - Math.PI) < EPS, 'visual yaw stays at 180°');
  const after = plantedFootWorldPoint(board, -0.15, 0.07, 0.35);
  closeVec(after, before, 'left foot cannot swap to the right or front to rear');
  const right = plantedFootWorldPoint(board, 0.15, 0.07, -0.35);
  closeVec(right, new THREE.Vector3(0.15, 0.20, -0.35), 'right foot remains separate');
});

test('ankles inherit board pitch and bank but never cosmetic shove-it yaw', () => {
  const scene = new THREE.Group();
  scene.rotation.y = 0.37;
  const rider = new THREE.Group();
  const deck = new THREE.Group();
  scene.add(rider, deck);
  const board = {root:deck};
  const rest = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0),0.18);
  const original = footWorldOrientation(rider, board, rest);
  deck.rotation.y = Math.PI;
  const held = footWorldOrientation(rider, board, rest);
  assert.ok(original.angleTo(held) < EPS, 'deck yaw must not twist ankle joints');
  const released = footWorldOrientation(rider, board, rest, false);
  assert.ok(original.angleTo(released) < EPS);
  deck.rotation.set(0.25, Math.PI, -0.1);
  const tilted = footWorldOrientation(rider, board, new THREE.Quaternion());
  const deckNormal = new THREE.Vector3(0,1,0).applyQuaternion(deck.getWorldQuaternion(new THREE.Quaternion()));
  const tiltedUp = new THREE.Vector3(0,1,0).applyQuaternion(tilted);
  closeVec(tiltedUp, deckNormal, 'feet follow deck normal on ramps');
});

test('short-rig foot anchors do not cross after 180-shove catch', () => {
  const rider = new UnrealRider('/synthetic.glb');
  rider.model = new THREE.Group();
  rider.root.add(rider.model);
  rider.basePos = new THREE.Vector3();
  rider.baseQ = new THREE.Quaternion();
  rider.bones = {};
  const parts = [];
  for (const side of ['l','r']) {
    const sign = side === 'l' ? -1 : 1;
    const thigh = new THREE.Bone(); thigh.name = 'thigh_' + side; thigh.position.set(sign*.16, 1.05, 0);
    const calf = new THREE.Bone(); calf.name = 'calf_' + side; calf.position.set(0, -.47, .03);
    const foot = new THREE.Bone(); foot.name = 'foot_' + side; foot.position.set(0, -.44, -.03);
    thigh.add(calf); calf.add(foot); rider.model.add(thigh);
    rider.kneePoles[side] = new THREE.Vector3(0,-.47,.03);
    rider.bones[thigh.name] = thigh; rider.bones[calf.name] = calf; rider.bones[foot.name] = foot;
    parts.push(thigh,calf,foot);
  }
  rider.rest = new Map(parts.map(bone=>[bone,bone.quaternion.clone()]));
  rider.root.updateWorldMatrix(true,true);
  for(const side of ['l','r']) {
    const foot = rider.bones['foot_'+side];
    rider.feet[side] = {
      point:rider.root.worldToLocal(foot.getWorldPosition(new THREE.Vector3())),
      q:foot.getWorldQuaternion(new THREE.Quaternion()),
    };
    rider.soleOffsets[side] = 0.055;
  }
  const board = new StreetBoard('/board.glb');
  board.deckHeight = 0.13;
  board.contactRig = {deckTopY:.14,deckWidth:.42,deckLength:1.26};
  board.root.position.y = board.deckHeight;
  rider.update({board,presentation:{state:'COAST'},dt:1/60});
  const before = [rider.ft.l.x,rider.ft.r.x];
  board.update({flipState:{name:'Pop Shove-it',yaw:.5,pitch:0,roll:0,progress:1}});
  board.update({flipState:null,dt:1});
  rider.update({board,presentation:{state:'COAST'},dt:1/60});
  assert.ok(rider.ft.l.x < 0 && rider.ft.r.x > 0, 'knees must never be forced to cross the stance');
  assert.ok(Math.abs(before[0]-rider.ft.l.x)<.01);
  assert.ok(Math.abs(before[1]-rider.ft.r.x)<.01);
  for(const bone of parts) assert.ok(Number.isFinite(bone.quaternion.lengthSq()));
});
