import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { SAFE_COPING_EXIT } from '../src/game/SafeCopingExitSkillStreetPhysics.js';
import {
  resolveSweepReentryCandidate,
  resolveWheelReentryCandidate,
  supportMatchesOriginalTransition,
} from '../src/game/core/TransitionReentryResult.js';

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
  };
}

function matchingSupport() {
  return {
    supported: true,
    count: 4,
    frontSupported: 2,
    rearSupported: 2,
    position: new THREE.Vector3(0, 2.35, 0.52),
    normal: new THREE.Vector3(0, 0.72, 0.694).normalize(),
  };
}

test('wheel reentry candidate accepts same-transition support after apex', () => {
  const support = matchingSupport();
  let calls = 0;
  const contact = {
    solveLanding() {
      calls += 1;
      return support;
    },
  };
  const result = resolveWheelReentryCandidate({
    activeAir: airFrame(),
    grounded: false,
    sameAir: true,
    velocityY: -1,
    contact,
    before: new THREE.Vector3(0, 2.8, 0.1),
    position: new THREE.Vector3(0, 2.2, 0.7),
    heading: 0,
    velocity: new THREE.Vector3(0, -3, 2),
    config: SAFE_COPING_EXIT,
  });
  assert.ok(result);
  assert.equal(result.source, 'wheel-sweep');
  assert.equal(result.support, support);
  assert.equal(calls, 1);
});

test('continuous reentry does not query board landing while still rising before apex', () => {
  let calls = 0;
  const result = resolveWheelReentryCandidate({
    activeAir: { ...airFrame(), apexPassed: false },
    grounded: false,
    sameAir: true,
    velocityY: 2.5,
    contact: { solveLanding() { calls += 1; return matchingSupport(); } },
    before: new THREE.Vector3(),
    position: new THREE.Vector3(),
    heading: 0,
    velocity: new THREE.Vector3(0, 2.5, 0),
    config: SAFE_COPING_EXIT,
  });
  assert.equal(result, null);
  assert.equal(calls, 0);
});

test('wrong-facing support cannot become a wheel reentry candidate', () => {
  const support = matchingSupport();
  support.normal.z *= -1;
  const result = resolveWheelReentryCandidate({
    activeAir: airFrame(),
    grounded: false,
    sameAir: true,
    velocityY: -1,
    contact: { solveLanding() { return support; } },
    before: new THREE.Vector3(0, 2.8, 0.1),
    position: new THREE.Vector3(0, 2.2, 0.7),
    heading: 0,
    velocity: new THREE.Vector3(0, -3, 2),
    config: SAFE_COPING_EXIT,
  });
  assert.equal(result, null);
});

test('center sweep creates emergency support on the same transition without yaw authority', () => {
  const activeAir = airFrame();
  const before = new THREE.Vector3(0, 2.8, 0.10);
  const position = new THREE.Vector3(0, 2.0, 0.85);
  const velocity = new THREE.Vector3(0, -4, 2.2);
  const originalVelocity = velocity.clone();
  const surface = {
    sweepRideable(from, to, pointOut, normalOut) {
      pointOut.set(0, 2.28, 0.62);
      normalOut.set(0, 0.68, 0.733).normalize();
      return { fraction: 0.72 };
    },
  };
  const contact = {
    solveGround() { return { supported: false }; },
  };

  const result = resolveSweepReentryCandidate({
    activeAir,
    grounded: false,
    sameAir: true,
    velocityY: velocity.y,
    surface,
    contact,
    before,
    position,
    heading: 0,
    velocity,
    forward: new THREE.Vector3(0, 0, -1),
    config: SAFE_COPING_EXIT,
  });

  assert.ok(result);
  assert.equal(result.source, 'center-sweep');
  assert.equal(result.support.supported, true);
  assert.equal(result.support.count, 1);
  assert.equal(Object.hasOwn(result, 'heading'), false);
  assert.equal(Object.hasOwn(result, 'yaw'), false);
  assert.deepEqual(velocity.toArray(), originalVelocity.toArray(),
    'candidate resolution must not mutate gameplay velocity');
});

test('same-transition matcher preserves authored coping corridor', () => {
  const support = matchingSupport();
  assert.equal(supportMatchesOriginalTransition(support, airFrame(), SAFE_COPING_EXIT), true);
  support.position.x = SAFE_COPING_EXIT.contactCorridor + 0.2;
  assert.equal(supportMatchesOriginalTransition(support, airFrame(), SAFE_COPING_EXIT), false);
});
