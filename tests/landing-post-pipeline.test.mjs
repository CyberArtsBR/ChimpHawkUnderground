import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  applyLandingPostPipeline,
  captureLandingPostContext,
} from '../src/game/core/LandingPostPipeline.js';

function controller({
  heading = 0,
  velocity = new THREE.Vector3(0, -1, -5),
  transitionAir = null,
  airTakeoffFromRamp = false,
  airSpin = 0,
  stance = 1,
} = {}) {
  const c = {
    heading,
    velocity: velocity.clone(),
    normal: new THREE.Vector3(0, 1, 0),
    forward: new THREE.Vector3(),
    travelDirection: new THREE.Vector3(0, 0, -1),
    transitionAir,
    airTakeoffFromRamp,
    airTakeoffFacing: new THREE.Vector3(0, 0, -1),
    airTakeoffStance: stance,
    airSpin,
    stance,
    rampReentrySteerLock: 0,
    landingYawInvariantViolations: 0,
    lastLandingYawInvariant: null,
    syncCalls: 0,
    groundDirection() {
      this.forward.set(-Math.sin(this.heading), 0, -Math.cos(this.heading))
        .projectOnPlane(this.normal).normalize();
    },
    syncTravelDirection() { this.syncCalls += 1; },
  };
  c.groundDirection();
  return c;
}

function support(normal = new THREE.Vector3(0, 1, 0)) {
  return { normal: normal.clone().normalize(), position: new THREE.Vector3() };
}

test('ordinary landing post pipeline preserves heading and syncs travel once', () => {
  const c = controller({ heading: 0.37 });
  const s = support();
  const context = captureLandingPostContext(c, s);
  const lowerHeading = c.heading;

  assert.equal(applyLandingPostPipeline(c, s, context, { lowerLayerHeading: lowerHeading }), true);
  assert.ok(Math.abs(c.heading - 0.37) < 1e-12);
  assert.equal(c.syncCalls, 1);
  assert.equal(c.airTakeoffFromRamp, false);
  assert.equal(c.landingYawInvariantViolations, 0);
  assert.equal(c.lastLandingYawInvariant?.violated, false);
});

test('explicit ramp 180 derives final facing from takeoff plus spin only', () => {
  const c = controller({
    heading: Math.PI,
    velocity: new THREE.Vector3(0, -1, -6),
    airTakeoffFromRamp: true,
    airSpin: Math.PI,
    stance: 1,
  });
  c.airTakeoffFacing.set(0, 0, -1);
  const s = support(new THREE.Vector3(0, 0.8, 0.6));
  const context = captureLandingPostContext(c, s);

  applyLandingPostPipeline(c, s, context, {
    lowerLayerHeading: Math.PI,
    rampReentrySteerLock: 0.2,
  });

  assert.ok(Math.abs(Math.abs(c.heading) - Math.PI) < 1e-9);
  assert.equal(c.stance, -1);
  assert.ok(c.rampReentrySteerLock >= 0.2);
  assert.equal(c.landingYawInvariantViolations, 0);
});

test('raw lower-layer yaw is observed before ramp post orientation can hide it', () => {
  const c = controller({
    heading: 0,
    airTakeoffFromRamp: true,
    airSpin: 0,
  });
  const s = support(new THREE.Vector3(0, 0.8, 0.6));
  const context = captureLandingPostContext(c, s);

  // Simulate a forbidden accepted-landing writer before post hooks run.
  c.heading = Math.PI / 2;
  c.groundDirection();
  applyLandingPostPipeline(c, s, context, {
    lowerLayerHeading: c.heading,
    rampReentrySteerLock: 0.2,
  });

  assert.equal(c.landingYawInvariantViolations, 1);
  assert.equal(c.lastLandingYawInvariant?.violated, true);
  assert.ok(Math.abs(c.heading) < 1e-9, 'ramp orientation still follows takeoff facing');
});

test('sloped non-ramp touchdown receives re-entry steering lock without yaw change', () => {
  const c = controller({ heading: -0.41 });
  const s = support(new THREE.Vector3(0.2, 0.97, 0.12));
  const context = captureLandingPostContext(c, s, { rampReentrySlopeY: 0.995 });
  applyLandingPostPipeline(c, s, context, {
    lowerLayerHeading: c.heading,
    rampReentrySteerLock: 0.2,
  });

  assert.ok(c.rampReentrySteerLock >= 0.2);
  assert.ok(Math.abs(c.heading + 0.41) < 1e-12);
});

test('pump bookkeeping is an explicit optional post hook', () => {
  const c = controller({ velocity: new THREE.Vector3(0, -4, -5) });
  const s = support();
  const context = captureLandingPostContext(c, s);
  applyLandingPostPipeline(c, s, context, {
    lowerLayerHeading: c.heading,
    pumpLandingWindow: 0.18,
  });

  assert.equal(c.pumpLandingWindow, 0.18);
  assert.ok(Math.abs(c.pumpLandingImpact - 0.5) < 1e-12);
  assert.deepEqual(c.pumpPreviousNormal.toArray(), [0, 1, 0]);
});
