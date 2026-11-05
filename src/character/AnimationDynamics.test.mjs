// Run directly: node --test src/character/AnimationDynamics.test.mjs
// The repository's existing tests/agent05-rig-animation.test.mjs checks the
// four packaged GLB skeletons. These tests cover procedural runtime safety.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { safeLimbReach, anatomicalKneeDirection, preserveFootOrder, smoothHandDestination } from './AnimationDynamics.js';
import { flipMotion, flipTurns, pushMotion, popMotion, landingMotion } from './TrickMotion.js';
import { UnrealRider } from './UnrealRider.js';

const v = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const finiteQ = q => [q.x, q.y, q.z, q.w].every(Number.isFinite) && Math.abs(q.lengthSq() - 1) < 1e-4;

test('IK distance respects chain reach, minimum flex and nonfinite distances', () => {
  for (const [a, b] of [[0.48, 0.50], [0.19, 0.25], [0.85, 0.65]]) {
    for (const desired of [-Infinity, -1, 0, 0.01, 0.4, 2.5, Infinity, NaN]) {
      const d = safeLimbReach(a, b, desired);
      assert.ok(Number.isFinite(d));
      assert.ok(d >= Math.abs(a - b) && d <= a + b, [a, b, d].join(','));
    }
  }
});

test('anatomical knee poles stay outward for mirrored stances, never become NaN', () => {
  const forward = v(0, 0, 1);
  const l = anatomicalKneeDirection(forward, v(-1, 0, 0), v(-0.1, -0.4, 0.14), 0.8);
  const r = anatomicalKneeDirection(forward, v(1, 0, 0), v(0.1, -0.4, 0.14), 0.8);
  assert.ok(l.x < 0 && r.x > 0);
  for (const pole of [l, r, anatomicalKneeDirection(v(), v(), v(), NaN)]) {
    assert.ok(pole.toArray().every(Number.isFinite));
    assert.ok(pole.lengthSq() > 1e-5);
  }
});

test('airborne feet cannot swap places; deck-locked feet are unchanged', () => {
  const anchors = { l: v(-0.19, 0.08, 0.12), r: v(0.19, 0.08, -0.12) };
  const targets = { l: v(0.14, 0.34, 0), r: v(-0.14, 0.35, 0) };
  const ref = { l: targets.l.clone(), r: targets.r.clone() };
  preserveFootOrder(targets, anchors, 0);
  assert.ok(targets.l.equals(ref.l) && targets.r.equals(ref.r));
  preserveFootOrder(targets, anchors, 1);
  assert.ok(targets.l.distanceTo(targets.r) > 0.05);
  assert.ok(targets.l.toArray().every(Number.isFinite));
});

test('wrist smoothing recovers after teleport and never overshoots the target', () => {
  const a = v(), b = v(0.3, 0.2, 0.1);
  const middle = smoothHandDestination(a, b, 1 / 60);
  assert.ok(middle.distanceTo(b) < a.distanceTo(b));
  assert.ok(middle.distanceTo(a) < a.distanceTo(b));
  assert.ok(smoothHandDestination(a, v(4, 4, 4), 1 / 60).equals(v(4, 4, 4)));
  assert.ok(smoothHandDestination(a, b, NaN).equals(b));
});

test('all trick movement phases remain finite at invalid inputs and rotations', () => {
  for (const p of [NaN, Infinity, -Infinity, -2, 0, 0.17, 0.45, 0.81, 0.94, 1, 3]) {
    for (const fn of [flipMotion, pushMotion]) {
      assert.ok(Object.values(fn(p)).every(Number.isFinite), fn.name + String(p));
    }
    for (const fn of [popMotion, landingMotion]) assert.ok(Number.isFinite(fn(p)));
    for (const turns of [
      flipTurns({ name: 'Kickflip', progress: p, pitch: NaN, yaw: Infinity, roll: -1 }),
      flipTurns({ name: '360 Shove-it', progress: p, yaw: 1, rotationStartProgress: 0.2,
        rotationFrom: { pitch: Infinity, yaw: NaN, roll: -0.3 } }),
    ]) assert.ok(Object.values(turns).every(Number.isFinite));
  }
});

function syntheticRider() {
  const rider = new UnrealRider('synthetic');
  rider.model = new THREE.Group(); rider.root.add(rider.model);
  rider.basePos = v(); rider.baseQ = new THREE.Quaternion();
  const bones = [];
  for (const side of ['l', 'r']) {
    const sign = side === 'l' ? -1 : 1;
    const thigh = new THREE.Bone(); thigh.name = 'thigh_' + side; thigh.position.set(sign * 0.16, 1.05, 0);
    const calf = new THREE.Bone(); calf.name = 'calf_' + side; calf.position.set(0, -0.47, 0.04);
    const foot = new THREE.Bone(); foot.name = 'foot_' + side; foot.position.set(0, -0.47, -0.04);
    thigh.add(calf); calf.add(foot); rider.model.add(thigh);
    const arm = new THREE.Bone(); arm.name = 'upperarm_' + side; arm.position.set(sign * 0.28, 1.42, 0);
    const elbow = new THREE.Bone(); elbow.name = 'lowerarm_' + side; elbow.position.set(0, -0.20, sign * 0.13);
    const hand = new THREE.Bone(); hand.name = 'hand_' + side; hand.position.set(0, -0.20, sign * 0.13);
    arm.add(elbow); elbow.add(hand); rider.model.add(arm);
    bones.push(thigh, calf, foot, arm, elbow, hand);
    rider.kneePoles[side] = v(0, -0.47, 0.04);
    rider.hands[side] = { q: new THREE.Quaternion() };
  }
  rider.bones = Object.fromEntries(bones.map(bone => [bone.name, bone]));
  rider.rest = new Map(bones.map(bone => [bone, bone.quaternion.clone()]));
  rider.root.updateWorldMatrix(true, true);
  for (const side of ['l', 'r']) {
    const foot = rider.bones['foot_' + side];
    rider.feet[side] = { point: rider.root.worldToLocal(foot.getWorldPosition(v())),
      q: foot.getWorldQuaternion(new THREE.Quaternion()) };
  }
  const board = {
    deckHeight: 0.12, contactRig: { deckTopY: 0.14, deckWidth: 0.42, deckLength: 1.10 },
    root: new THREE.Group(),
    pointWorld(x, y, z, output = v()) { return this.root.localToWorld(output.set(x, y, z)); },
  };
  board.root.position.y = 0.12;
  board.root.updateWorldMatrix(true, true);
  return { rider, board };
}

test('regular/switch flips, shove-its, grabs, landings and bail keep unit rotations', () => {
  const { rider, board } = syntheticRider();
  const poses = [
    { state: 'IDLE' }, { state: 'COAST', speedRatio: 0.85 },
    { state: 'PUSH', pushWeight: 1, pushPhase: 0.3 },
    { state: 'CROUCH', crouch: 0.9 }, { state: 'OLLIE_POP' },
    { state: 'AIR', flipState: { name: 'Kickflip', progress: 0.31 } },
    { state: 'AIR', flipState: { name: 'Heelflip', progress: 0.58 } },
    { state: 'AIR', flipState: { name: '360 Shove-it', progress: 0.72, yaw: 1 } },
    { state: 'AIR', flipState: { name: 'Varial Kickflip', progress: 0.92, roll: 1 } },
    { state: 'AIR', grabState: { name: 'Indy' }, grabWeight: 1 },
    { state: 'AIR', grabState: { name: 'Melon' }, grabWeight: 1 },
    { state: 'AIR', grabState: { name: 'Japan' }, grabWeight: 1 },
    { state: 'LAND', landingSeverity: 0.9 },
    { state: 'BAIL', bail: true, bailProgress: 0.65 },
  ];
  for (const stance of [-1, 1]) {
    for (const pose of poses) {
      for (let i = 0; i < 6; i++) {
        rider.update({ board, presentation: { state: pose.state }, ...pose,
          stance, dt: 1 / 60, time: i / 60 });
        for (const bone of rider.rest.keys())
          assert.ok(finiteQ(bone.quaternion), pose.state + ' ' + (pose.flipState?.name || pose.grabState?.name || '') + ' ' + bone.name);
      }
    }
  }
});
