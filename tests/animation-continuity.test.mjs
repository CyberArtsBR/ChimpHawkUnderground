import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { loadGeometry } from '../tools/load-geometry.mjs';
import { UnrealRider } from '../src/character/UnrealRider.js';
import { StreetBoard } from '../src/skateboard/StreetBoard.js';
import { StreetSkater } from '../src/game/StreetSkater.js';
import { FLIP_TRICKS } from '../src/game/TrickCatalog.js';
import { ensurePelvisDeckClearance } from '../src/character/SkatePoseConstraints.js';
import { flipMotion } from '../src/character/TrickMotion.js';

const board = new StreetBoard('fixture');
board.prepareContactGeometry(await loadGeometry('public/assets/rider/skateboard.glb'));
const rider = new UnrealRider('/assets/rider/thehollowf.glb').configureModel(await loadGeometry('public/assets/rider/thehollowf.glb'));
rider.deckHeight = board.deckHeight;
const scene = new THREE.Group(); scene.add(board.root, rider.root);
const head = () => rider.bones.head.getWorldPosition(new THREE.Vector3());
const headQ = () => rider.bones.head.getWorldQuaternion(new THREE.Quaternion());
const frame = (params, dt = 1 / 144) => { board.update({ ...params, dt }); rider.update({ ...params, board, dt }); };

test('a stance switch turns the head over several frames, not in one', () => {
  rider.resetPresentation(); board.resetPresentation();
  const ground = { presentation: { state: 'COAST' }, speedRatio: .4, airborne: false };
  for (let i = 0; i < 120; i++) frame({ ...ground, stance: 1 });
  let previous = headQ(), worst = 0;
  for (let i = 0; i < 150; i++) {
    frame({ ...ground, stance: -1 });
    const q = headQ(); worst = Math.max(worst, THREE.MathUtils.radToDeg(q.angleTo(previous))); previous = q;
  }
  assert.ok(worst < 12, `largest single-frame head turn ${worst.toFixed(1)} deg (was 51)`);
});

test('the chest lean follows the crouch spring: no head jump on the takeoff frame', () => {
  rider.resetPresentation(); board.resetPresentation();
  for (let i = 0; i < 120; i++) frame({ presentation: { state: 'CROUCH' }, crouch: 1, airborne: false, stance: 1 });
  const before = head();
  frame({ presentation: { state: 'OLLIE_POP', popProgress: 0 }, crouch: 0, airborne: true, airTime: 0, stance: 1 });
  const lateral = head().sub(before).setY(0).length();
  assert.ok(lateral < .025, `head moved ${(lateral * 100).toFixed(1)} cm sideways in one frame (was ~11)`);
});

test('a settled pose is unchanged by the lean and stance springs', () => {
  const settle = stance => { rider.resetPresentation(); board.resetPresentation();
    for (let i = 0; i < 400; i++) frame({ presentation: { state: 'COAST' }, speedRatio: .5, stance }); return head(); };
  const fresh = stance => { rider.resetPresentation(); board.resetPresentation(); frame({ presentation: { state: 'COAST' }, speedRatio: .5, stance }, 0); return head(); };
  for (const stance of [1, -1]) assert.ok(settle(stance).distanceTo(settle(stance)) < 1e-6);
  // First frame after a reset already uses the target lean and stance facing.
  assert.ok(fresh(-1).distanceTo(fresh(-1)) < 1e-9);
});

test('a flip started during the pop does not snap the deck', () => {
  board.resetPresentation();
  for (let i = 0; i < 6; i++) board.update({ airborne: true, presentation: { popProgress: i / 12 }, dt: 1 / 144 });
  const before = board.root.quaternion.clone();
  board.update({ airborne: true, presentation: { popProgress: 6 / 12 }, flipState: { ...FLIP_TRICKS.left, progress: 0 }, dt: 1 / 144 });
  assert.ok(THREE.MathUtils.radToDeg(board.root.quaternion.angleTo(before)) < 3);
});

test('flip feet start on the deck and are fully released by the flick', () => {
  assert.equal(flipMotion(0).release, 0);
  assert.equal(flipMotion(.14).release, 1);
});

test('mid-flip, the pelvis guard ignores a deck rolled on edge', () => {
  const root = new THREE.Group(), model = new THREE.Group(), pelvis = new THREE.Object3D();
  root.add(model); model.add(pelvis); pelvis.position.y = .25;
  const deck = { root: new THREE.Group(), deckHeight: .12, contactRig: { deckTopY: .14 }, pointWorld() {} };
  deck.root.position.y = .12; root.add(deck.root);
  assert.ok(ensurePelvisDeckClearance(model, pelvis, deck, .4) > 0, 'flat deck: guard active');
  model.position.y = 0; deck.root.rotation.z = Math.PI;
  assert.equal(ensurePelvisDeckClearance(model, pelvis, deck, .4), 0, 'upside-down deck: no lift');
  deck.root.rotation.z = .3;
  model.position.y = 0;
  assert.ok(ensurePelvisDeckClearance(model, pelvis, deck, .4) > 0, 'banked/manual tilt keeps the guard');
});

test('presented flip progress covers the unsimulated part of the frame', () => {
  const skater = Object.create(StreetSkater.prototype);
  Object.assign(skater, { config: { step: 1 / 120 }, accumulator: .5 / 120, flipState: { name: 'Kickflip', roll: 1, duration: .5, progress: .4 } });
  const shown = skater.presentedFlip();
  assert.notEqual(shown, skater.flipState, 'physics state is never modified');
  assert.equal(skater.flipState.progress, .4);
  assert.ok(Math.abs(shown.progress - (.4 + (.5 / 120) / .5)) < 1e-12);
  skater.flipState.progress = .999;
  assert.equal(skater.presentedFlip().progress, 1);
  skater.flipState = null;
  assert.equal(skater.presentedFlip(), null);
});

test('blended arm safety equals the original single modes at its ends', async () => {
  const { safeArmGoal, blendedSafeArmGoal } = await import('../src/character/AnimationDynamics.js');
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const shoulder = V(0, 1.4, 0), out = V(1, 0, 0), headP = V(0, 1.65, 0);
  for (const goal of [V(.2, 1.1, .1), V(-.3, 1.0, .2), V(.05, 1.6, 0), V(.5, 1.5, .3)]) {
    for (const [cross, neutral] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
      const a = blendedSafeArmGoal(shoulder, goal, out, headP, .6, cross, neutral);
      const b = safeArmGoal(shoulder, goal, out, headP, .6, { crossBody: cross === 1, neutral: neutral === 1 });
      assert.ok(a.distanceTo(b) < 1e-9);
    }
    const mid = blendedSafeArmGoal(shoulder, goal, out, headP, .6, 0, .5);
    const lo = safeArmGoal(shoulder, goal, out, headP, .6), hi = safeArmGoal(shoulder, goal, out, headP, .6, { neutral: true });
    assert.ok(mid.distanceTo(lo.clone().lerp(hi, .5)) < 1e-9);
  }
});
