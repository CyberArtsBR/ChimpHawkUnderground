import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { RailNetwork } from '../src/game/RailNetwork.js';
import {
  GRIND_CAPTURE_POLICY,
  grindCaptureEligibility,
  resolveGrindCapture,
  resolveMagneticGrindCapture,
  resolveStrictGrindCapture,
} from '../src/game/core/GrindCaptureController.js';

function network() {
  return new RailNetwork([{
    name: 'Canonical capture rail',
    points: [
      [0, 0.80, 2.5],
      [0, 0.80, -6.0],
    ],
    radius: 0.055,
  }]);
}

function context(overrides = {}) {
  return {
    position: new THREE.Vector3(0.18, 1.02, 1.25),
    forward: new THREE.Vector3(0, 0, -1),
    velocity: new THREE.Vector3(-0.35, -0.55, -6.4),
    railNetwork: network(),
    trick: { name: '50-50' },
    ...overrides,
  };
}

test('canonical grind capture resolves the nearby aligned rail', () => {
  const capture = resolveMagneticGrindCapture(context());
  assert.ok(capture, 'expected nearby aligned rail capture');
  assert.equal(capture.profile.name, '50-50');
  assert.ok(capture.surfaceDistance <= GRIND_CAPTURE_POLICY.railCaptureDistance);
  assert.ok(capture.projectedSpeed > 6);
});

test('canonical grind capture rejects an out-of-range trajectory', () => {
  const capture = resolveMagneticGrindCapture(context({
    position: new THREE.Vector3(1.4, 1.02, 1.25),
  }));
  assert.equal(capture, null);
});


test('unified grind capture preserves strict-first precedence', () => {
  const strict = resolveStrictGrindCapture(context());
  const unified = resolveGrindCapture(context());
  assert.ok(strict);
  assert.ok(unified);
  assert.equal(unified.captureMode, 'strict');
  assert.equal(unified.magneticEntry, false);
});

test('unified grind capture falls back to THPS magnet for fast rising approach', () => {
  const rising = context({
    velocity: new THREE.Vector3(0, 2.6, -6.4),
  });
  assert.equal(resolveStrictGrindCapture(rising), null,
    'legacy strict path should reject the rising approach');
  const unified = resolveGrindCapture(rising);
  assert.ok(unified, 'magnetic fallback should recover the rising approach');
  assert.equal(unified.captureMode, 'magnetic');
  assert.equal(unified.magneticEntry, true);
});

test('grind capture decision has no heading or yaw authority', () => {
  const capture = resolveMagneticGrindCapture(context());
  assert.ok(capture);
  assert.equal(Object.hasOwn(capture, 'heading'), false);
  assert.equal(Object.hasOwn(capture, 'yaw'), false);
});

test('canonical eligibility preserves validated THPS rail magnet envelope', () => {
  assert.equal(grindCaptureEligibility({
    surfaceDistance: 0.38,
    verticalDelta: -0.30,
    velocityY: 2.6,
    tangentAlignment: 0.78,
    tangentSpeed: 6.2,
  }), true);
  assert.equal(grindCaptureEligibility({
    surfaceDistance: 0.68,
    verticalDelta: -0.25,
    velocityY: 1.5,
    tangentAlignment: 0.8,
    tangentSpeed: 5,
  }), false);
});
