import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { yawStableSurfaceBasis } from '../src/game/YawStableStreetSkater.js';

function horizontal(v) {
  const out = v.clone();
  out.y = 0;
  return out.lengthSq() > 1e-10 ? out.normalize() : out;
}

test('vertical coping cannot collapse yaw into a sideways 90 degree visual snap', () => {
  const heading = 0; // faces -Z, right is +X
  const up = new THREE.Vector3(0, 0.015, 0.9998875).normalize();
  const { right, back } = yawStableSurfaceBasis(heading, up);

  assert.ok(right.dot(new THREE.Vector3(1, 0, 0)) > 0.999999,
    `coping changed yaw-right axis: ${right.toArray()}`);
  assert.ok(Math.abs(right.dot(up)) < 1e-8);
  assert.ok(Math.abs(back.dot(up)) < 1e-8);
  assert.ok(Math.abs(right.dot(back)) < 1e-8);
});

test('same coping normal gives identical yaw basis on ascent and descent', () => {
  const heading = 0.37;
  const up = new THREE.Vector3(-Math.sin(heading) * 0.999, 0.045, -Math.cos(heading) * 0.999).normalize();
  const ascent = yawStableSurfaceBasis(heading, up);
  const descent = yawStableSurfaceBasis(heading, up);

  assert.ok(ascent.right.distanceTo(descent.right) < 1e-12);
  assert.ok(ascent.back.distanceTo(descent.back) < 1e-12);

  const expectedRight = new THREE.Vector3(Math.cos(heading), 0, -Math.sin(heading));
  assert.ok(horizontal(ascent.right).dot(expectedRight) > 0.999,
    'surface pitch must not rewrite horizontal yaw');
});

test('flat ground basis remains identical to original heading convention', () => {
  const heading = -0.82;
  const { right, up, back } = yawStableSurfaceBasis(heading, new THREE.Vector3(0, 1, 0));
  const expectedRight = new THREE.Vector3(Math.cos(heading), 0, -Math.sin(heading));
  const expectedBack = new THREE.Vector3(Math.sin(heading), 0, Math.cos(heading));

  assert.ok(right.distanceTo(expectedRight) < 1e-12);
  assert.ok(back.distanceTo(expectedBack) < 1e-12);
  assert.ok(up.distanceTo(new THREE.Vector3(0, 1, 0)) < 1e-12);
});
