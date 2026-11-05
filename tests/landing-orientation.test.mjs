import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  explicitAirHalfTurns,
  rampLandingFacing,
  resolveRampLandingOrientation,
} from '../src/game/core/LandingOrientation.js';

const FORWARD = new THREE.Vector3(0, 0, -1);

test('passive ramp return preserves deck yaw and stance', () => {
  const result = resolveRampLandingOrientation({
    takeoffFacing: FORWARD,
    takeoffStance: 1,
    airSpin: 0,
  });
  assert.equal(result.halfTurns, 0);
  assert.equal(result.stance, 1);
  assert.ok(result.facing.distanceTo(FORWARD) < 1e-10);
  assert.ok(Math.abs(result.heading) < 1e-10);
});

test('explicit 180 reverses deck facing and stance exactly once', () => {
  const result = resolveRampLandingOrientation({
    takeoffFacing: FORWARD,
    takeoffStance: 1,
    airSpin: Math.PI,
  });
  assert.equal(result.halfTurns, 1);
  assert.equal(result.stance, -1);
  assert.ok(result.facing.distanceTo(new THREE.Vector3(0, 0, 1)) < 1e-10);
  assert.ok(Math.abs(Math.abs(result.heading) - Math.PI) < 1e-10);
});

test('explicit 360 preserves facing and stance', () => {
  const result = resolveRampLandingOrientation({
    takeoffFacing: FORWARD,
    takeoffStance: -1,
    airSpin: Math.PI * 2,
  });
  assert.equal(result.halfTurns, 2);
  assert.equal(result.stance, -1);
  assert.ok(result.facing.distanceTo(FORWARD) < 1e-10);
});

test('surface normal is intentionally absent from ramp yaw authority', () => {
  assert.equal(explicitAirHalfTurns(Math.PI / 2), 0);
  assert.ok(rampLandingFacing({ takeoffFacing: FORWARD, airSpin: 0 })
    .distanceTo(FORWARD) < 1e-10);
});
