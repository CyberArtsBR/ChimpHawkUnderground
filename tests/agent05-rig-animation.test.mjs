import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as THREE from 'three';
import { resolveHumanoidBones, normalizeBoneName, humanoidIKAudit } from '../src/character/RigMapping.js';
import { springStep } from '../src/character/PresentationState.js';
import { UnrealRider } from '../src/character/UnrealRider.js';

test('Unreal names win over Mixamo aliases; both leg chains resolve', () => {
  const exact = { name: 'foot_l' };
  const mapped = resolveHumanoidBones([
    { name: 'mixamorig:LeftFoot' }, exact,
    { name: 'mixamorig:LeftUpLeg' }, { name: 'mixamorig:LeftLeg' },
    { name: 'mixamorig:RightUpLeg' }, { name: 'mixamorig:RightLeg' },
    { name: 'mixamorig:RightFoot' },
  ]);
  assert.equal(mapped.foot_l, exact);
  assert.equal(mapped.thigh_l.name, 'mixamorig:LeftUpLeg');
  assert.equal(mapped.calf_r.name, 'mixamorig:RightLeg');
  assert.equal(humanoidIKAudit(mapped).fullLegIK, true);
  assert.equal(humanoidIKAudit({ thigh_l: {}, calf_l: {} }).fullLegIK, false);
  assert.equal(normalizeBoneName('mixamorig:RightForeArm'), 'rightforearm');
});

test('presentation spring produces finite values for invalid target, timestep and velocity', () => {
  const channel = { value: NaN, velocity: Infinity };
  for (const [target, frequency, dt] of [
    [0, 6, 1 / 60], [NaN, Infinity, NaN], [1, 9, Infinity],
    [0, -4, -1], [0.6, 18, 0.05],
  ]) {
    springStep(channel, target, frequency, dt);
    assert.ok(Number.isFinite(channel.value));
    assert.ok(Number.isFinite(channel.velocity));
  }
});

function readGlb(path) {
  const data = readFileSync(path);
  assert.ok(data.length > 20);
  assert.equal(data.toString('ascii', 0, 4), 'glTF');
  assert.equal(data.readUInt32LE(4), 2);
  assert.equal(data.readUInt32LE(8), data.length);
  const jsonLength = data.readUInt32LE(12);
  assert.ok(jsonLength > 0 && jsonLength + 20 <= data.length);
  assert.equal(data.toString('ascii', 16, 20), 'JSON');
  return JSON.parse(data.toString('utf8', 20, 20 + jsonLength));
}

const avatars = {
  Heretic: 'The_Heretic.glb',
  Adolescent: 'The_AdolescentUR.glb',
  Anchor: 'The_Anchor.glb',
  Tuxr: 'TuxR.glb',
};
for (const [avatar, file] of Object.entries(avatars)) {
  test(avatar + ' GLB has a valid JSON scene and reports joint compatibility', t => {
    const gltf = readGlb(resolve('public/assets/rider', file));
    assert.ok(Array.isArray(gltf.scenes) && gltf.scenes.length > 0);
    assert.ok(Array.isArray(gltf.nodes) && gltf.nodes.length > 0);
    assert.ok(Array.isArray(gltf.skins) && gltf.skins.length > 0,
      avatar + ' must contain a skinned rig');
    for (const node of gltf.nodes) {
      for (const prop of ['translation', 'rotation', 'scale', 'matrix']) {
        if (node[prop]) assert.ok(node[prop].every(Number.isFinite),
          avatar + ' has nonfinite node ' + prop);
      }
    }
    const bones = resolveHumanoidBones(gltf.nodes.map((node, index) =>
      ({ name: node.name || '', index })));
    const ik = humanoidIKAudit(bones);
    assert.ok(ik.fullLegIK && ik.fullArmIK,
      avatar + ' is missing required left/right skinned limb nodes');
    const skinNodes = new Set(gltf.skins.flatMap(skin => skin.joints || []));
    const descendant = (ancestor, target) => {
      const todo = [...(gltf.nodes[ancestor]?.children || [])];
      const visited = new Set();
      while (todo.length) {
        const index = todo.pop();
        if (index === target) return true;
        if (visited.has(index)) continue;
        visited.add(index);
        todo.push(...(gltf.nodes[index]?.children || []));
      }
      return false;
    };
    for (const side of ['l', 'r']) {
      const thigh = bones['thigh_' + side].index;
      const calf = bones['calf_' + side].index;
      const foot = bones['foot_' + side].index;
      assert.ok([thigh, calf, foot].every(index => skinNodes.has(index)),
        avatar + ' leg chain absent from all GLB skins');
      assert.ok(descendant(thigh, calf) && descendant(calf, foot),
        avatar + ' leg hierarchy must be thigh -> calf -> foot');
    }
    t.diagnostic(avatar + ': ' + gltf.nodes.length + ' nodes, ' +
      (gltf.skins?.length || 0) + ' skins, leg chains=' + JSON.stringify(ik.legs) +
      ', arm chains=' + JSON.stringify(ik.arms));
  });
}

function makeSyntheticRig() {
  const rider = new UnrealRider('test');
  rider.model = new THREE.Group();
  rider.root.add(rider.model);
  rider.basePos = new THREE.Vector3();
  rider.baseQ = new THREE.Quaternion();
  const parts = [];
  for (const side of ['l', 'r']) {
    const sign = side === 'l' ? -1 : 1;
    const thigh = new THREE.Bone(); thigh.name = 'thigh_' + side;
    thigh.position.set(sign * 0.16, 1.1, 0);
    const calf = new THREE.Bone(); calf.name = 'calf_' + side;
    calf.position.set(0, -0.5, 0.02);
    const foot = new THREE.Bone(); foot.name = 'foot_' + side;
    foot.position.set(0, -0.5, -0.02);
    thigh.add(calf); calf.add(foot); rider.model.add(thigh);
    const upper = new THREE.Bone(); upper.name = 'upperarm_' + side;
    upper.position.set(sign * 0.28, 1.45, 0);
    const lower = new THREE.Bone(); lower.name = 'lowerarm_' + side;
    lower.position.set(0, -0.22, sign * 0.12);
    const hand = new THREE.Bone(); hand.name = 'hand_' + side;
    hand.position.set(0, -0.22, sign * 0.12);
    upper.add(lower); lower.add(hand); rider.model.add(upper);
    parts.push(thigh, calf, foot, upper, lower, hand);
    rider.kneePoles[side] = new THREE.Vector3(0, -0.5, 0.02);
    rider.hands[side] = { q: new THREE.Quaternion() };
  }
  rider.bones = Object.fromEntries(parts.map(bone => [bone.name, bone]));
  rider.rest = new Map(parts.map(bone => [bone, bone.quaternion.clone()]));
  rider.root.updateWorldMatrix(true, true);
  for (const side of ['l', 'r']) {
    const foot = rider.bones['foot_' + side];
    rider.feet[side] = {
      point: rider.root.worldToLocal(foot.getWorldPosition(new THREE.Vector3())),
      q: foot.getWorldQuaternion(new THREE.Quaternion()),
    };
    rider.soleOffsets[side] = 0.06;
  }
  const board = {
    deckHeight: 0.12,
    contactRig: { deckTopY: 0.14, deckWidth: 0.42, deckLength: 1.10 },
    root: new THREE.Group(),
    pointWorld(x, y, z, output) { return this.root.localToWorld(output.set(x, y, z)); },
  };
  board.root.position.y = 0.12;
  board.root.updateWorldMatrix(true, true);
  return { rider, board };
}


test('neutral arm IK directs elbows INWARD with compact wrists on either anatomical side', () => {
  const { rider, board } = makeSyntheticRig();
  for (const state of ['IDLE', 'COAST', 'PUSH']) {
    rider.resetPresentation();
    for (let i = 0; i < 12; i++)
      rider.update({ board, presentation: { state }, dt: 1 / 60, time: i / 60 });
    rider.root.updateWorldMatrix(true, true);
    for (const side of ['l', 'r']) {
      const sign = side === 'l' ? -1 : 1;
      const outward = new THREE.Vector3(sign, 0, 0);
      const shoulder = rider.bones['upperarm_' + side].getWorldPosition(new THREE.Vector3());
      const elbow = rider.bones['lowerarm_' + side].getWorldPosition(new THREE.Vector3());
      const wrist = rider.bones['hand_' + side].getWorldPosition(new THREE.Vector3());
      const axisMid = shoulder.clone().lerp(wrist, 0.5);
      const bend = elbow.clone().sub(axisMid).dot(outward);
      const spread = wrist.clone().sub(shoulder).dot(outward);
      assert.ok(bend < -0.005, `${state}/${side}: elbow must curve toward body, bend=${bend}`);
      assert.ok(spread >= 0.14 && spread < 0.40, `${state}/${side}: wrist should stay near torso, spread=${spread}`);
    }
  }
});

test('IK remains finite with planted feet during idle, fakie, manual, grind, air and bail', () => {
  const { rider, board } = makeSyntheticRig();
  const states = [
    { state: 'IDLE' }, { state: 'PUSH', speedRatio: 0.6 },
    { state: 'COAST', speedRatio: 1 }, { state: 'CROUCH', crouch: 0.8 },
    { state: 'OLLIE_POP' }, { state: 'AIR', vert: true },
    { state: 'LAND', landingSeverity: 0.8 },
    { state: 'GRIND', grindType: 'Smith' },
    { state: 'MANUAL', manual: 'manual', manualBalance: 0.5 },
    { state: 'NOSE_MANUAL', manual: 'noseManual' },
    { state: 'COAST', stance: -1 }, { state: 'WALLRIDE', wallRide: true },
    { state: 'AIR', flipState: { name: 'Kickflip', progress: 0.35 } },
    { state: 'AIR', grabState: { name: 'Indy' }, grabWeight: 0.7 },
    { state: 'BAIL', bail: true, bailProgress: 0.6 },
  ];
  for (const scenario of states) {
    for (let frame = 0; frame < 8; frame++) {
      rider.update({ board, presentation: { state: scenario.state },
        ...scenario, dt: 1 / 60, time: frame / 60 });
    }
    for (const bone of rider.rest.keys()) {
      const q = bone.quaternion;
      assert.ok([q.x, q.y, q.z, q.w].every(Number.isFinite),
        scenario.state + ': nonfinite ' + bone.name);
      assert.ok(Math.abs(q.lengthSq() - 1) < 1e-5,
        scenario.state + ': nonunit ' + bone.name);
    }
    if (['IDLE', 'COAST', 'CROUCH', 'MANUAL', 'NOSE_MANUAL'].includes(scenario.state)) {
      for (const side of ['l', 'r']) {
        const hand = rider.bones['hand_' + side];
        assert.ok(hand.quaternion.angleTo(rider.rest.get(hand)) < 1e-6,
          `${scenario.state}: neutral wrist must follow its forearm without added twist`);
      }
    }
    if (['IDLE', 'COAST', 'CROUCH', 'LAND', 'GRIND', 'MANUAL', 'NOSE_MANUAL'].includes(scenario.state)
      && !scenario.flipState && !scenario.bail) {
      for (const side of ['l', 'r']) {
        const anchor = rider.feet[side].point, contact = board.contactRig;
        const desired = board.pointWorld(
          THREE.MathUtils.clamp(anchor.x, -contact.deckWidth * 0.43, contact.deckWidth * 0.43),
          contact.deckTopY - board.deckHeight + rider.soleOffsets[side],
          THREE.MathUtils.clamp(anchor.z, -contact.deckLength * 0.39, contact.deckLength * 0.39),
          new THREE.Vector3());
        const foot = rider.bones['foot_' + side].getWorldPosition(new THREE.Vector3());
        assert.ok(foot.distanceTo(desired) < 0.13,
          scenario.state + ': foot contact distance ' + foot.distanceTo(desired));
      }
    }
  }
});
