import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  TRANSITION_INTENT,
  advanceTransitionExitIntent,
  applyTransitionExitIntentToCandidate,
  shouldArmTransitionExit,
} from '../src/game/transitions/TransitionIntent.js';

test('held forward and pre-apex Up do not arm grounded transition exit intent', () => {
  assert.equal(shouldArmTransitionExit({
    input: { drive: 1 },
    normalY: 0.82,
    verticalSpeed: 4,
  }), false);
  assert.equal(shouldArmTransitionExit({
    input: { directionTaps: ['up'] },
    normalY: 0.82,
    verticalSpeed: 4,
  }), false);
});

test('explicit vert exit arms only while climbing a real slope', () => {
  assert.equal(shouldArmTransitionExit({
    input: { vertExit: true },
    normalY: 0.82,
    verticalSpeed: 4,
  }), true);
  assert.equal(shouldArmTransitionExit({
    input: { vertExit: true },
    normalY: 1,
    verticalSpeed: 4,
  }), false);
  assert.equal(shouldArmTransitionExit({
    input: { vertExit: true },
    normalY: 0.82,
    verticalSpeed: -1,
  }), false);
});

test('transition exit intent buffer arms and decays deterministically', () => {
  const armed = advanceTransitionExitIntent({
    remaining: 0,
    dt: 1 / 120,
    input: { vertExit: true },
    normalY: 0.82,
    verticalSpeed: 4,
  });
  assert.equal(armed.justArmed, true);
  assert.equal(armed.remaining, TRANSITION_INTENT.bufferTime);

  const decayed = advanceTransitionExitIntent({
    remaining: armed.remaining,
    dt: 0.10,
    input: {},
    normalY: 0.82,
    verticalSpeed: 4,
  });
  assert.ok(Math.abs(decayed.remaining - (TRANSITION_INTENT.bufferTime - 0.10)) < 1e-12);
  assert.equal(decayed.active, true);

  const expired = advanceTransitionExitIntent({
    remaining: decayed.remaining,
    dt: 1,
    input: {},
  });
  assert.equal(expired.remaining, 0);
  assert.equal(expired.active, false);
});

test('active transition exit intent tags one canonical takeoff candidate without mutating source', () => {
  const source = {
    transitionId: 'quarter',
    transitionType: 'QUARTER',
    lipPoint: new THREE.Vector3(),
  };
  const runtime = {
    rampExitIntentTime: 0.2,
    position: new THREE.Vector3(),
    normal: new THREE.Vector3(0, 0.8, 0.6),
    velocity: new THREE.Vector3(0, 4, -6),
  };
  const controller = {
    transitions: {
      launchAt() { return source; },
    },
  };
  const result = applyTransitionExitIntentToCandidate({ controller, runtime });
  assert.equal(result.exitRequested, true);
  assert.equal(result.consumed, true);
  assert.notEqual(result.edge, source);
  assert.equal(result.edge.exitRequested, true);
  assert.equal(source.exitRequested, undefined);
});

test('inactive transition exit intent does not invent or tag a candidate', () => {
  const result = applyTransitionExitIntentToCandidate({
    controller: { transitions: { launchAt() { throw new Error('must not query'); } } },
    runtime: {
      rampExitIntentTime: 0,
      position: new THREE.Vector3(),
      normal: new THREE.Vector3(0, 1, 0),
      velocity: new THREE.Vector3(),
    },
    transition: null,
  });
  assert.equal(result.edge, null);
  assert.equal(result.exitRequested, false);
  assert.equal(result.consumed, false);
});
