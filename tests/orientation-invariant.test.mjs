import test from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluateLandingYawInvariant,
  yawDelta,
} from '../src/game/core/OrientationInvariant.js';

test('yaw delta wraps across the -pi/pi seam', () => {
  const from = Math.PI - 0.02;
  const to = -Math.PI + 0.03;
  assert.ok(Math.abs(yawDelta(from, to) - 0.05) < 1e-10);
});

test('landing invariant accepts unchanged yaw', () => {
  const result = evaluateLandingYawInvariant({
    playerHeading: 0.75,
    lowerLayerHeading: 0.75,
  });
  assert.equal(result.violated, false);
  assert.equal(result.preservedHeading, 0.75);
});

test('landing invariant flags contact-driven 90 degree yaw', () => {
  const result = evaluateLandingYawInvariant({
    playerHeading: 0,
    lowerLayerHeading: Math.PI / 2,
  });
  assert.equal(result.violated, true);
  assert.ok(Math.abs(result.delta - Math.PI / 2) < 1e-10);
  assert.equal(result.preservedHeading, 0);
});

test('landing invariant does not erase explicit player heading before contact', () => {
  const explicitSpinHeading = Math.PI;
  const result = evaluateLandingYawInvariant({
    playerHeading: explicitSpinHeading,
    lowerLayerHeading: explicitSpinHeading + 0.4,
  });
  assert.equal(result.violated, true);
  assert.equal(result.preservedHeading, explicitSpinHeading);
});
