import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { resolveGroundStepStart } from '../src/game/core/GroundStepResult.js';
import { TRANSITION_INTENT } from '../src/game/transitions/TransitionIntent.js';

test('tiny downhill reversal escapes sign memory on a ramp while flat jitter stays filtered',()=>{
  const forward=new THREE.Vector3(0,.8,-.6);
  for(const sign of [1,-1]) {
    const deck=forward.clone().multiplyScalar(sign);
    const velocity=forward.clone().multiplyScalar(-.08);
    const slope=resolveGroundStepStart({velocity,forward:deck,rollingSign:sign,normalY:.6});
    assert.equal(Math.sign(slope.speedState.speed),-sign);
  }
  const velocity=new THREE.Vector3(0,0,.04),flat=new THREE.Vector3(0,0,-1);
  assert.ok(resolveGroundStepStart({velocity,forward:flat,rollingSign:1,normalY:1}).speedState.speed>0);
});

test('ground step start decays runtime timers without mutating inputs', () => {
  const velocity = new THREE.Vector3(0, 2, -6);
  const forward = new THREE.Vector3(0, 0, -1);
  const result = resolveGroundStepStart({
    dt: 0.05,
    velocity,
    forward,
    rollingSign: 1,
    rampReentrySteerLock: 0.20,
    wallSlideTime: 0.18,
    transitionLandingGrace: 0.16,
    wallImpactTime: 0.10,
    wallImpactCooldown: 0.04,
  });

  assert.ok(Math.abs(result.timers.rampReentrySteerLock - 0.15) < 1e-12);
  assert.ok(Math.abs(result.timers.wallSlideTime - 0.13) < 1e-12);
  assert.ok(Math.abs(result.timers.transitionLandingGrace - 0.11) < 1e-12);
  assert.ok(Math.abs(result.timers.wallImpactTime - 0.05) < 1e-12);
  assert.equal(result.timers.wallImpactCooldown, 0);
  assert.deepEqual(velocity.toArray(), [0, 2, -6]);
  assert.deepEqual(forward.toArray(), [0, 0, -1]);
});

test('explicit vert exit re-arms transition intent after fixed-step decay', () => {
  const result = resolveGroundStepStart({
    dt: 1 / 120,
    input: { vertExit: true },
    velocity: new THREE.Vector3(0, 4, -6),
    forward: new THREE.Vector3(0, 0, -1),
    rollingSign: 1,
    normalY: 0.82,
    verticalSpeed: 4,
    rampExitIntentTime: 0.04,
  });

  assert.equal(result.transitionIntent.justArmed, true);
  assert.equal(result.transitionIntent.remaining, TRANSITION_INTENT.bufferTime);
  assert.equal(result.transitionIntent.active, true);
});

test('held forward cannot arm transition exit in ground step transaction', () => {
  const result = resolveGroundStepStart({
    dt: 1 / 120,
    input: { drive: 1 },
    velocity: new THREE.Vector3(0, 4, -6),
    forward: new THREE.Vector3(0, 0, -1),
    rollingSign: 1,
    normalY: 0.82,
    verticalSpeed: 4,
    rampExitIntentTime: 0,
  });
  assert.equal(result.transitionIntent.active, false);
  assert.equal(result.transitionIntent.remaining, 0);
});

test('ground step speed preserves canonical fakie sign', () => {
  const result = resolveGroundStepStart({
    dt: 1 / 120,
    velocity: new THREE.Vector3(0, 0, -7),
    forward: new THREE.Vector3(0, 0, 1),
    rollingSign: -1,
  });
  assert.equal(result.speedState.travelSign, -1);
  assert.ok(result.speedState.speed < -6.99);
});

test('ground step result is immutable at its authority boundary', () => {
  const result = resolveGroundStepStart({
    dt: 1 / 120,
    velocity: new THREE.Vector3(0, 0, -3),
    forward: new THREE.Vector3(0, 0, -1),
  });
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.timers), true);
  assert.equal(Object.isFrozen(result.transitionIntent), true);
  assert.equal(Object.isFrozen(result.speedState), true);
});
