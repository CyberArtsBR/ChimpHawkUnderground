import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  LANDING_REJECT_REASON,
  evaluateStableLanding,
  stableFlipLandingMode,
  stableLandingSupportMode,
} from '../src/game/core/LandingResult.js';
import { flipLandingMode as legacyFlipLandingMode } from '../src/game/StableBoardContactSkillStreetPhysics.js';

function support({
  count = 4,
  front = 2,
  rear = 2,
  normal = new THREE.Vector3(0, 1, 0),
  position = new THREE.Vector3(0, 0.015, 0),
} = {}) {
  return {
    supported: true,
    count,
    frontSupported: front,
    rearSupported: rear,
    position: position.clone(),
    normal: normal.clone().normalize(),
  };
}

function evaluate(overrides = {}) {
  const landingSupport = overrides.support || support();
  const position = overrides.position || landingSupport.position.clone();
  const forward = overrides.forward || new THREE.Vector3(0, 0, -1);
  const tangent = forward.clone().projectOnPlane(landingSupport.normal).normalize();
  const velocity = overrides.velocity || tangent.multiplyScalar(5).addScaledVector(landingSupport.normal, -1);
  return evaluateStableLanding({
    support: landingSupport,
    position,
    velocity,
    forward,
    airTime: overrides.airTime ?? 0.4,
    flipProgress: overrides.flipProgress ?? null,
    maxLandingCorrection: 0.22,
  });
}

test('stable flip mode preserves legacy thresholds exactly', () => {
  for (const normalY of [1, 0.99, 0.98, 0.9, 0.72]) {
    for (const progress of [0.05, 0.12, 0.13, 0.4, 0.61, 0.62, 0.71, 0.72, 0.88, 1]) {
      assert.equal(
        stableFlipLandingMode(progress, normalY),
        legacyFlipLandingMode(progress, normalY),
        `normalY=${normalY} progress=${progress}`,
      );
    }
  }
});

test('stable support requires both trucks like the old base landing', () => {
  assert.equal(stableLandingSupportMode(support()), 'full');
  assert.equal(stableLandingSupportMode(support({ count: 2, front: 2, rear: 0 })), 'reject');
  assert.equal(stableLandingSupportMode(support({ count: 1, front: 1, rear: 0 })), 'reject');
});

test('stable result accepts full flat support and preserves signed alignment data', () => {
  const result = evaluate();
  assert.equal(result.accepted, true);
  assert.equal(result.supportMode, 'full');
  assert.equal(result.partialTouchdown, false);
  assert.ok(result.planarSpeed > 4.9);
  assert.ok(result.alignment > 0.99);
});

test('stable result rejects partial transition support instead of using forgiving bridge', () => {
  const result = evaluate({
    support: support({
      count: 1,
      front: 1,
      rear: 0,
      normal: new THREE.Vector3(0, 0.72, 0.694),
    }),
  });
  assert.equal(result.accepted, false);
  assert.equal(result.shouldBail, false);
  assert.equal(result.rejectReason, LANDING_REJECT_REASON.SUPPORT);
});

test('stable flat early flip keeps legacy clear window while mid flip bails', () => {
  const early = evaluate({ flipProgress: 0.1 });
  const mid = evaluate({ flipProgress: 0.5 });
  assert.equal(early.accepted, true);
  assert.equal(early.flipMode, 'clear');
  assert.equal(mid.accepted, false);
  assert.equal(mid.shouldBail, true);
  assert.equal(mid.rejectReason, LANDING_REJECT_REASON.FLIP);
});

test('stable result never derives yaw from support geometry', () => {
  const headingForward = new THREE.Vector3(-Math.sin(0.41), 0, -Math.cos(0.41));
  const landingSupport = support({ normal: new THREE.Vector3(0.55, 0.75, 0.37) });
  const tangent = headingForward.clone().projectOnPlane(landingSupport.normal).normalize();
  const result = evaluate({
    support: landingSupport,
    forward: headingForward,
    velocity: tangent.multiplyScalar(6).addScaledVector(landingSupport.normal, -1),
    flipProgress: 1,
  });
  assert.equal(result.accepted, true);
  assert.ok(result.boardForward, 'boardForward is validation-only geometry');
  assert.equal(Object.hasOwn(result, 'heading'), false);
  assert.equal(Object.hasOwn(result, 'yaw'), false);
});
