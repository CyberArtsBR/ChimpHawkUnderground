import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  SAFE_COPING_EXIT,
  canAutoAlignTransitionLanding,
  deckCanFitBoard,
  originalTransitionSweep,
  supportMatchesOriginalTransition,
  transitionSpinAlignmentErrorDeg,
} from '../src/game/SafeCopingExitSkillStreetPhysics.js';
import { PRODUCTION_BOARD_CONTACT_RIG } from '../src/game/SkateboardContactRig.js';

function airFrame() {
  return {
    frame: {
      lipPoint: new THREE.Vector3(0, 3, 0),
      deckOutward: new THREE.Vector3(0, 0, -1),
      rampInward: new THREE.Vector3(0, 0, 1),
      copingTangent: new THREE.Vector3(1, 0, 0),
      surfaceNormal: new THREE.Vector3(0, 0.72, 0.694).normalize(),
    },
    apexPassed: true,
    transferring: true,
    exitControl: {
      geometryAware: true,
      abortToReturn: false,
    },
  };
}

test('latest video: 0.82m top deck cannot fit the real 1.05m board straight out', () => {
  assert.equal(PRODUCTION_BOARD_CONTACT_RIG.deckLength, 1.05);
  assert.equal(deckCanFitBoard({ found: true, usableWidth: 0.82 }), false);
  assert.ok(SAFE_COPING_EXIT.minSafeDeckWidth > 1.05,
    `safety width should exceed board length: ${SAFE_COPING_EXIT.minSafeDeckWidth}`);
});

test('wide bowl deck still permits contextual Up exit', () => {
  assert.equal(deckCanFitBoard({ found: true, usableWidth: 1.65 }), true);
  assert.equal(deckCanFitBoard({ found: true, usableWidth: 2.4 }), true);
});

test('missed transfer can reconnect to the original quarter transition', () => {
  const air = airFrame();
  const support = {
    position: new THREE.Vector3(0, 2.35, 0.52),
    normal: new THREE.Vector3(0, 0.72, 0.694).normalize(),
  };
  assert.equal(supportMatchesOriginalTransition(support, air), true);
});

test('latest video: deep pool wall is still inside original-transition recovery envelope', () => {
  const air = airFrame();
  const support = {
    position: new THREE.Vector3(0, -2.1, 1.15),
    normal: new THREE.Vector3(0, 0.55, 0.835).normalize(),
  };
  assert.equal(supportMatchesOriginalTransition(support, air), true);
});

test('flat deck behind coping is not mistaken for ramp recovery', () => {
  const air = airFrame();
  const support = {
    position: new THREE.Vector3(0, 3.01, -0.72),
    normal: new THREE.Vector3(0, 1, 0),
  };
  assert.equal(supportMatchesOriginalTransition(support, air), false);
});

test('lower floor under the structure cannot masquerade as original transition', () => {
  const air = airFrame();
  const support = {
    position: new THREE.Vector3(0, -3.0, 0.4),
    normal: new THREE.Vector3(0, 1, 0),
  };
  assert.equal(supportMatchesOriginalTransition(support, air), false);
});

test('wrong-facing sloped geometry cannot steal transfer recovery', () => {
  const air = airFrame();
  const support = {
    position: new THREE.Vector3(0, 2.4, 0.48),
    normal: new THREE.Vector3(0, 0.72, -0.694).normalize(),
  };
  assert.equal(supportMatchesOriginalTransition(support, air), false);
});

test('latest video: continuous sweep recognizes the original quarter before tunnelling through it', () => {
  const air = airFrame();
  const surface = {
    sweepRideable(from, to, pointOut, normalOut, extra) {
      assert.ok(extra >= 0.2, `continuous sweep padding too small: ${extra}`);
      pointOut.set(0, 2.28, 0.62);
      normalOut.set(0, 0.68, 0.733).normalize();
      return { fraction: 0.72 };
    },
  };
  const hit = originalTransitionSweep(
    surface,
    new THREE.Vector3(0, 2.8, 0.10),
    new THREE.Vector3(0, 2.0, 0.85),
    air,
  );
  assert.ok(hit, 'original transition must become a continuous collision barrier');
  assert.equal(hit.fraction, 0.72);
  assert.ok(hit.normal.z > 0.7);
});

test('continuous sweep ignores a different ramp facing the wrong direction', () => {
  const air = airFrame();
  const surface = {
    sweepRideable(from, to, pointOut, normalOut) {
      pointOut.set(0, 2.28, 0.62);
      normalOut.set(0, 0.68, -0.733).normalize();
      return { fraction: 0.5 };
    },
  };
  const hit = originalTransitionSweep(
    surface,
    new THREE.Vector3(0, 2.8, 0.10),
    new THREE.Vector3(0, 2.0, 0.85),
    air,
  );
  assert.equal(hit, null);
});

test('THPS-style vert landing auto-aligns 0/180/360 but not a sideways 90', () => {
  assert.ok(transitionSpinAlignmentErrorDeg(0) < 1e-6);
  assert.ok(transitionSpinAlignmentErrorDeg(Math.PI) < 1e-6);
  assert.ok(transitionSpinAlignmentErrorDeg(Math.PI * 2) < 1e-6);
  assert.equal(canAutoAlignTransitionLanding(0), true);
  assert.equal(canAutoAlignTransitionLanding(Math.PI), true);
  assert.equal(canAutoAlignTransitionLanding(Math.PI * 2), true);
  assert.equal(canAutoAlignTransitionLanding(Math.PI * 0.5), false);
});
