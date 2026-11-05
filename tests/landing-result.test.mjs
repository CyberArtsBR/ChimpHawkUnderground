import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  LANDING_REJECT_REASON,
  evaluateTransitionLanding,
  transitionAlignmentThreshold,
  transitionFlipLandingMode,
  transitionLandingSupportMode,
} from '../src/game/core/LandingResult.js';
import {
  transitionAlignmentThreshold as legacyAlignmentThreshold,
  transitionFlipLandingMode as legacyFlipLandingMode,
  transitionLandingSupportMode as legacySupportMode,
} from '../src/game/BowlLandingSkillStreetPhysics.js';

function support({
  count = 2,
  front = 2,
  rear = 0,
  normal = new THREE.Vector3(0, 0.72, 0.694).normalize(),
  position = new THREE.Vector3(0, 0.18, -0.1),
} = {}) {
  return {
    supported: true,
    count,
    frontSupported: front,
    rearSupported: rear,
    position: position.clone(),
    normal: normal.clone(),
  };
}

function evaluate(overrides = {}) {
  const landingSupport = overrides.support || support();
  const position = overrides.position
    || landingSupport.position.clone().addScaledVector(landingSupport.normal, 0.04);
  const forward = overrides.forward || new THREE.Vector3(0, 0, -1);
  const tangent = forward.clone().projectOnPlane(landingSupport.normal).normalize();
  const velocity = overrides.velocity
    || tangent.multiplyScalar(5).addScaledVector(landingSupport.normal, -1.1);

  return evaluateTransitionLanding({
    support: landingSupport,
    position,
    forward,
    velocity,
    airTime: overrides.airTime ?? 0.34,
    flipProgress: overrides.flipProgress ?? 0.58,
    maxLandingCorrection: 0.22,
    supportModeOverride: overrides.supportModeOverride ?? null,
  });
}

test('canonical landing helper thresholds are byte-for-byte equivalent to legacy helpers', () => {
  const modes = ['full', 'truckFirst', 'wheelFirst'];
  const normals = [1, 0.98, 0.94, 0.82, 0.72];
  const progresses = [0.1, 0.2, 0.35, 0.52, 0.88, 1];

  for (const mode of modes) {
    for (const normalY of normals) {
      assert.equal(
        transitionAlignmentThreshold(normalY, mode),
        legacyAlignmentThreshold(normalY, mode),
      );
      for (const progress of progresses) {
        assert.equal(
          transitionFlipLandingMode(progress, normalY, mode),
          legacyFlipLandingMode(progress, normalY, mode),
        );
      }
    }
  }

  for (const candidate of [
    support(),
    support({ count: 1, front: 1, rear: 0 }),
    support({ normal: new THREE.Vector3(0, 1, 0) }),
  ]) {
    assert.equal(transitionLandingSupportMode(candidate), legacySupportMode(candidate));
  }
});

test('canonical result accepts forgiving single-wheel transition catch', () => {
  const landingSupport = support({ count: 1, front: 1, rear: 0 });
  const result = evaluate({ support: landingSupport, flipProgress: 0.24 });
  assert.equal(result.accepted, true);
  assert.equal(result.supportMode, 'wheelFirst');
  assert.equal(result.partialTouchdown, true);
  assert.equal(result.flipMode, 'autoCatch');
  assert.equal(result.shouldBail, false);
});

test('verified deck exit overrides flat partial-support rejection', () => {
  const landingSupport = support({
    count: 1,
    front: 1,
    rear: 0,
    normal: new THREE.Vector3(0, 1, 0),
  });
  const result = evaluate({
    support: landingSupport,
    supportModeOverride: 'deckExit',
    flipProgress: 0.24,
  });
  assert.equal(result.accepted, true);
  assert.equal(result.supportMode, 'deckExit');
  assert.equal(result.rulesMode, 'truckFirst');
  assert.equal(result.partialTouchdown, true);
  assert.equal(result.correctionLimit, 0.42);
  assert.equal(result.flipMode, 'autoCatch');
});

test('flat partial support is rejected without triggering a bail', () => {
  const landingSupport = support({
    count: 1,
    front: 1,
    rear: 0,
    normal: new THREE.Vector3(0, 1, 0),
  });
  const result = evaluate({ support: landingSupport });
  assert.equal(result.accepted, false);
  assert.equal(result.shouldBail, false);
  assert.equal(result.rejectReason, LANDING_REJECT_REASON.SUPPORT);
});

test('landing correction outside the contact bridge is rejected', () => {
  const landingSupport = support();
  const result = evaluate({
    support: landingSupport,
    position: landingSupport.position.clone().add(new THREE.Vector3(0, 1, 0)),
  });
  assert.equal(result.accepted, false);
  assert.equal(result.shouldBail, false);
  assert.equal(result.rejectReason, LANDING_REJECT_REASON.CORRECTION);
});

test('unsafe board alignment requests a gameplay bail', () => {
  const landingSupport = support({
    count: 4,
    front: 2,
    rear: 2,
    normal: new THREE.Vector3(0, 1, 0),
  });
  const result = evaluate({
    support: landingSupport,
    forward: new THREE.Vector3(0, 0, -1),
    velocity: new THREE.Vector3(5, -1, 0),
    flipProgress: 1,
  });
  assert.equal(result.accepted, false);
  assert.equal(result.shouldBail, true);
  assert.equal(result.rejectReason, LANDING_REJECT_REASON.ALIGNMENT);
});

test('very early flip requests a bail even on a forgiving transition', () => {
  const result = evaluate({ flipProgress: 0.12 });
  assert.equal(result.accepted, false);
  assert.equal(result.shouldBail, true);
  assert.equal(result.rejectReason, LANDING_REJECT_REASON.FLIP);
});

test('young upward contact is ignored rather than snapped into a landing', () => {
  const landingSupport = support();
  const result = evaluate({
    support: landingSupport,
    airTime: 0.03,
    velocity: new THREE.Vector3(0, 1, -4),
    flipProgress: 1,
  });
  assert.equal(result.accepted, false);
  assert.equal(result.shouldBail, false);
  assert.equal(result.rejectReason, LANDING_REJECT_REASON.YOUNG_UPWARD);
});
