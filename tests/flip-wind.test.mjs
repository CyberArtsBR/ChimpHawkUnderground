import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { FlipWind } from '../src/skateboard/FlipWind.js';

test('wind retains world-space history while the board rotates and travels', () => {
  const root = new THREE.Group(), wind = new FlipWind(root);
  wind.update({ progress: 0.2 }, true, false, 1 / 60);
  const first = wind.samples[0].points[0].clone();
  root.position.x = 0.2;
  root.rotation.z = 1;
  wind.update({ progress: 0.3 }, true, false, 1 / 60);
  const rendered = new THREE.Vector3().fromBufferAttribute(wind.geometry.attributes.position, 0);
  root.localToWorld(rendered);
  assert.ok(rendered.distanceTo(first) < 1e-6);
  assert.equal(wind.geometry.drawRange.count, 4);
  for (let i = 0; i < 12; i++) wind.update(null, true, false, 1 / 60);
  assert.equal(wind.lines.visible, false);
});

test('wind is bounded and clears on landing, bail and reset', () => {
  const wind = new FlipWind(new THREE.Group());
  for (let i = 0; i < 100; i++) wind.update({ progress: 0.4 }, true, false, 0.001);
  assert.ok(wind.samples.length <= 33);
  assert.ok(wind.geometry.drawRange.count <= wind.positions.length / 3);
  wind.update(null, false, false, 1 / 60);
  assert.equal(wind.samples.length, 0);
  wind.update({ progress: 0.4 }, true, false, 1 / 60);
  wind.update({ progress: 0.4 }, true, true, 1 / 60);
  assert.equal(wind.samples.length, 0);
  wind.reset();
  assert.equal(wind.lines.visible, false);
});
