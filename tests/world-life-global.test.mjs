import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { WorldReactions } from '../src/graphics/life/WorldReactions.js';
import { LifeDirector } from '../src/graphics/life/LifeDirector.js';
import { GlobalLife } from '../src/graphics/life/GlobalLife.js';

const fakeSkater = () => ({
  position: new THREE.Vector3(), velocity: new THREE.Vector3(0, 0, -5), forward: new THREE.Vector3(0, 0, -1),
  grounded: true, grind: null, bailTime: 0, respawnSerial: 0,
  presentation: { popTime: 0, landingSeverity: 0 },
  rider: { ragdoll: { groundImpact: null } },
  audioSurfaceTag: 'metal',
  surface: { ground: point => ({ point: new THREE.Vector3(point.x, 0, point.z), normal: new THREE.Vector3(0, 1, 0) }) },
});
function rig() {
  const plays = [];
  const director = new LifeDirector(null, {});
  director.audio.play = (kind, position, opts) => { plays.push({ kind, position: position.clone(), opts }); return true; };
  const life = new GlobalLife();
  director.register(life);
  director.setWorld({ id: 'skate-paradise' }, fakeSkater());
  const skater = fakeSkater();
  director.skater = skater;
  const step = (dt = .1) => director.update(dt, skater, null);
  return { director, life, plays, skater, step };
}
function grind(r, { material = 'metal', frames = 5 } = {}) {
  r.skater.audioSurfaceTag = material;
  r.step();
  r.skater.grind = { rail: { audioSurfaceTag: material } };
  r.step();
  for (let i = 0; i < frames; i++) { r.skater.position.x += .1; r.step(); }
  r.skater.grind = null;
  r.step();
}
const bail = r => { r.skater.bailTime = 1.5; r.skater.rider.ragdoll.groundImpact = { point: new THREE.Vector3(1, 0, 1), speed: 6 }; r.step(); };
const liveMarks = life => life.marks.filter(m => m.life > 0).length;

test('ring only after a metal grind of at least 0.25 s that ended normally', () => {
  const r = rig();
  grind(r, { frames: 5 });
  assert.equal(r.plays.filter(p => p.kind === 'ring').length, 1);
  assert.equal(r.plays[0].opts.gain, .5);
  const short = rig(); grind(short, { frames: 0 });
  assert.equal(short.plays.length, 0, 'too short');
  const wood = rig(); grind(wood, { material: 'wood', frames: 5 });
  assert.equal(wood.plays.length, 0, 'not metal');
});

test('no ring when the grind ends in a bail', () => {
  const r = rig();
  r.step();
  r.skater.grind = { rail: {} };
  for (let i = 0; i < 5; i++) { r.skater.position.x += .1; r.step(); }
  r.skater.bailTime = 1.5; r.skater.grind = null;
  r.step();
  assert.equal(r.plays.filter(p => p.kind === 'ring').length, 0);
});

test('bail plays one clatter (rate limited) and lays 2-4 marks', () => {
  const r = rig();
  r.step();
  bail(r);
  assert.equal(r.plays.filter(p => p.kind === 'clatter').length, 1);
  assert.ok(liveMarks(r.life) >= 2 && liveMarks(r.life) <= 4);
  r.skater.rider.ragdoll.groundImpact = { point: new THREE.Vector3(1, 0, 1), speed: 6 };
  r.step();
  assert.equal(r.plays.filter(p => p.kind === 'clatter').length, 1, 'rate limited within 1 s');
});

test('skid pool never exceeds 12, marks hide after the fade, setWorld clears', () => {
  const r = rig();
  r.step();
  for (let i = 0; i < 12; i++) {
    r.skater.rider.ragdoll.groundImpact = { point: new THREE.Vector3(i, 0, 0), speed: 6 };
    r.step();
  }
  assert.ok(r.life.marks.length <= 12);
  assert.ok(r.life.mesh.count <= 12);
  assert.ok(liveMarks(r.life) <= 12);
  for (let i = 0; i < 130; i++) r.step(.05);
  assert.equal(liveMarks(r.life), 0);
  assert.equal(r.life.mesh.count, 0);
  bail(r);
  assert.ok(liveMarks(r.life) > 0);
  r.director.setWorld({ id: 'orbit' });
  assert.equal(liveMarks(r.life), 0);
  assert.equal(r.life.mesh.count, 0);
});

test('setWorld twice leaves the same children; performance hides and does nothing', () => {
  const r = rig();
  const before = r.life.root.children.length;
  r.director.setWorld({ id: 'orbit' }); r.director.setWorld({ id: 'skate-paradise' });
  assert.equal(r.life.root.children.length, before);
  r.director.setQuality({ name: 'performance' });
  assert.equal(r.director.root.visible, false);
  r.step(); bail(r);
  assert.equal(liveMarks(r.life), 0);
  assert.equal(r.plays.length, 0);
});

test('reduced density caps marks at 6', () => {
  const r = rig();
  r.director.setQuality({ name: 'high', vfxScale: .5 });
  r.step();
  for (let i = 0; i < 6; i++) {
    r.skater.rider.ragdoll.groundImpact = { point: new THREE.Vector3(i, 0, 0), speed: 6 };
    r.step(1.1);
  }
  assert.ok(liveMarks(r.life) <= 6);
});

test('marks are skipped where there is no ground', () => {
  const r = rig();
  r.step();
  r.skater.surface.ground = () => null;
  bail(r);
  assert.equal(liveMarks(r.life), 0);
});
