import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from 'three';
import { HighlightRecorder } from '../src/game/HighlightRecorder.js';
import { HighlightPlayback } from '../src/game/HighlightPlayback.js';

function actor() {
  const root = new THREE.Group(), visual = new THREE.Group();
  const bone = new THREE.Bone(), board = new THREE.Group();
  root.add(visual);
  visual.add(bone, board);
  return { root, visual, bone, board, position: new THREE.Vector3(900, 20, 500), score: 12345 };
}

function tape(skater, seconds = 40) {
  const recorder = new HighlightRecorder();
  recorder.reset(skater);
  for (let frame = 1; frame <= seconds * 30; frame++) {
    const t = frame / 30;
    skater.root.position.set(t, Math.sin(t), 0);
    skater.bone.rotation.z = Math.sin(t * 2) * 0.4;
    skater.board.rotation.x = t * 0.3;
    recorder.record(skater, 1 / 30);
  }
  return recorder;
}

function transform(node) {
  return [node.position.toArray(), node.quaternion.toArray(), node.scale.toArray(), node.visible];
}

test('records actual rider bones and board poses, interpolating quaternion motion', () => {
  const skater = actor(), recorder = new HighlightRecorder();
  recorder.reset(skater);
  skater.root.position.x = 10;
  skater.bone.rotation.y = Math.PI / 2;
  skater.board.position.y = 2;
  skater.board.scale.set(2, 3, 4);
  skater.board.visible = false;
  recorder.record(skater, 1);
  recorder.markMoment({ start: 0.1, end: 0.8, points: 100, label: 'Kickflip' });
  const [clip] = recorder.finish();
  const pose = new Float32Array(clip.stride);
  assert.equal(clip.nodes.length, 4);
  assert.equal(clip.sample(0.5, pose), true);
  assert.equal(pose[0], 5);
  const boneQ = new THREE.Quaternion().fromArray(pose, 2 * 11 + 3).normalize();
  assert.ok(boneQ.angleTo(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 4)) < 1e-6);
  assert.equal(pose[3 * 11 + 1], 1);
  assert.deepEqual([...pose.slice(3 * 11 + 7, 3 * 11 + 10)], [1.5, 2, 2.5]);
  assert.equal(pose[3 * 11 + 10], 0);
  assert.deepEqual(skater.position.toArray(), [900, 20, 500]);
  assert.equal(skater.score, 12345);
  assert.equal(recorder.record(skater, 1), false, 'sealed highlight footage stays immutable');
});

test('selects three highest banked moments without overlapping clips, including full lead-in and follow-through', () => {
  const recorder = tape(actor());
  recorder.markMoment({ start: 3, end: 4, points: 100, label: 'Ollie' });
  recorder.markMoment({ start: 12, end: 14, points: 900, label: 'Rail line' });
  recorder.markMoment({ start: 23, end: 24, points: 700, label: 'Kickflip' });
  recorder.markMoment({ start: 24.1, end: 24.5, points: 200, label: 'Adjacent landing' });
  recorder.markMoment({ start: 33, end: 34, points: 600, label: 'Manual line' });
  assert.equal(recorder.markMoment({ start: 23, end: 24, points: 700 }), false);
  assert.equal(recorder.markMoment({ start: 2, end: 3, points: 0 }), false);
  const clips = recorder.finish();
  assert.deepEqual(clips.map(clip => clip.points), [900, 700, 600]);
  assert.deepEqual(clips.map(clip => [clip.start, clip.end]), [[9.5, 16.5], [20.5, 26.5], [30.5, 36.5]]);
  assert.equal(recorder.finish(), clips, 'results can replay the same sealed clips repeatedly');
});

test('clips near run boundaries use only captured time, and expired ring-buffered tricks are excluded', () => {
  const recorder = tape(actor(), 10);
  recorder.markMoment({ start: 0.5, end: 1, points: 300 });
  recorder.markMoment({ start: 8, end: 9.5, points: 500 });
  const clips = recorder.finish();
  assert.ok(Math.abs(clips[0].end - 10) < 1e-6);
  assert.equal(clips[1].start, 0);
  const longTape = tape(actor(), 110);
  longTape.markMoment({ start: 1, end: 2, points: 9999 });
  longTape.markMoment({ start: 100, end: 102, points: 500 });
  assert.deepEqual(longTape.finish().map(clip => clip.points), [500]);
});

test('caps typed-array recording memory at 32 MB even for large imported rigs', () => {
  const skater = actor();
  for (let i = 0; i < 1000; i++) skater.visual.add(new THREE.Bone());
  const recorder = new HighlightRecorder({ sampleHz: 144, seconds: 10000, maxBytes: 128 * 1024 * 1024 });
  assert.equal(recorder.reset(skater), true);
  assert.ok(recorder.byteLength + recorder.stride * 8 <= 32 * 1024 * 1024);
  assert.ok(recorder.sampleHz > 1 && recorder.sampleHz <= 30);
  assert.equal(recorder.seconds, 95);
});

test('cinematic playback slows the trick and restores exact live transforms, camera, and untouched gameplay state', () => {
  const skater = actor(), recorder = tape(skater, 16);
  recorder.markMoment({ start: 8, end: 9, points: 1000, label: '360 kickflip' });
  const clips = recorder.finish();
  skater.root.position.set(78.123456789, 2, -19);
  skater.bone.rotation.x = 0.876543210987;
  skater.board.scale.set(1.234567891, 1, 1);
  skater.root.visible = false;
  const before = clips[0].nodes.map(transform);
  const camera = new THREE.PerspectiveCamera(63, 16 / 9, 0.1, 1000);
  camera.position.set(23.123456789, 18, -5);
  camera.rotation.set(0.2, 0.4, -0.1);
  camera.zoom = 1.123456789;
  const cameraBefore = [transform(camera), camera.up.toArray(), camera.fov, camera.zoom];
  let finishes = 0, sweeps = 0;
  const moments = [];
  const playback = new HighlightPlayback({
    camera, surface: { camera: (_, eye) => { sweeps++; return eye.clone(); } },
    onFinish: () => finishes++, onMoment: value => moments.push(value),
  });
  assert.equal(playback.start(clips), true);
  assert.equal(skater.root.visible, true);
  playback.update(2.5);
  assert.ok(Math.abs(playback.time - 8) < 1e-6);
  playback.update(1);
  assert.ok(Math.abs(playback.time - 8.45) < 1e-6);
  assert.equal(camera.fov, 46);
  assert.ok(sweeps > 0, 'cinematic camera uses park collision clearance');
  assert.equal(moments[0].label, '360 kickflip');
  assert.deepEqual(skater.position.toArray(), [900, 20, 500]);
  assert.equal(skater.score, 12345);
  assert.equal(playback.update(30), false);
  assert.equal(finishes, 1);
  assert.deepEqual(clips[0].nodes.map(transform), before);
  assert.deepEqual([transform(camera), camera.up.toArray(), camera.fov, camera.zoom], cameraBefore);
  assert.equal(playback.stop(), false);
  assert.equal(playback.start([]), false);
});

test('skipping or restarting highlights restores actors and traverses all available moments once', () => {
  const skater = actor(), recorder = tape(skater, 40);
  recorder.markMoment({ start: 5, end: 6, points: 300 });
  recorder.markMoment({ start: 15, end: 16, points: 200 });
  recorder.markMoment({ start: 25, end: 26, points: 100 });
  const clips = recorder.finish(), before = clips[0].nodes.map(transform);
  const moments = [];
  let finishes = 0;
  const playback = new HighlightPlayback({ camera: new THREE.PerspectiveCamera(),
    onMoment: value => moments.push(value.index), onFinish: () => finishes++ });
  playback.start(clips);
  playback.update(3);
  playback.stop();
  assert.deepEqual(clips[0].nodes.map(transform), before);
  assert.equal(finishes, 0, 'a manual skip leaves results navigation to the caller');
  playback.start(clips);
  playback.update(60);
  assert.deepEqual(moments, [0, 0, 1, 2]);
  assert.equal(finishes, 1);
  assert.deepEqual(clips[0].nodes.map(transform), before);
});
