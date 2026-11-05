import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { StatefulSkillStreetPhysics } from '../src/game/StatefulSkillStreetPhysics.js';
import {
  transitionLandingSupportMode,
  transitionFlipLandingMode,
  transitionAlignmentThreshold,
} from '../src/game/BowlLandingSkillStreetPhysics.js';
import { MOVEMENT_STATE } from '../src/game/StreetPhysics.js';

function floorWorld() {
  const root = new THREE.Group();
  const floor = new THREE.Mesh(new THREE.BoxGeometry(20, 0.1, 20), new THREE.MeshBasicMaterial());
  floor.position.y = -0.05;
  root.add(floor);
  root.updateMatrixWorld(true);
  return root;
}

function physics() {
  return new StatefulSkillStreetPhysics({ collision: floorWorld(), spawn: [0, 0.5, 0], rails: [] });
}

function bowlSupport({ count = 2, front = 2, rear = 0 } = {}) {
  const normal = new THREE.Vector3(0, 0.72, 0.694).normalize();
  return {
    supported: true,
    count,
    frontSupported: front,
    rearSupported: rear,
    position: new THREE.Vector3(0, 0.18, -0.1),
    supportPoint: new THREE.Vector3(0, 0.16, -0.1),
    normal,
    maxWheelGap: 0.06,
  };
}

function flatSupport() {
  return {
    supported: true,
    count: 4,
    frontSupported: 2,
    rearSupported: 2,
    position: new THREE.Vector3(0, 0.015, 0),
    supportPoint: new THREE.Vector3(0, 0, 0),
    normal: new THREE.Vector3(0, 1, 0),
    maxWheelGap: 0,
  };
}

function armAirLanding(p, support, progress) {
  p.position.copy(support.position).addScaledVector(support.normal, 0.04);
  p.heading = 0;
  p.airHeading = 0;
  p.airTime = 0.34;
  p.setMovementState(MOVEMENT_STATE.AIR);
  p.forward.set(0, 0, -1);
  const tangent = new THREE.Vector3(0, 0, -1).projectOnPlane(support.normal).normalize();
  p.velocity.copy(tangent).multiplyScalar(5).addScaledVector(support.normal, -1.1);
  p.flipState = { name: 'Kickflip', progress, duration: 0.42, roll: 1, pitch: 0, yaw: 0 };
}

function arm180Landing(p, support, speed = 5) {
  p.position.copy(support.position).addScaledVector(support.normal, 0.04);
  p.setMovementState(MOVEMENT_STATE.AIR);
  p.airTime = 0.5;
  p.airHeading = 0;
  p.heading = Math.PI;
  p.airSpin = Math.PI;
  p.forward.set(0, 0, 1);
  p.velocity.set(0, -1, -speed);
  p.flipState = null;
}

test('curved bowl allows one-truck first touchdown', () => {
  const support = bowlSupport();
  assert.equal(transitionLandingSupportMode(support), 'truckFirst');
});

test('curved ramp allows a single swept wheel to start touchdown', () => {
  const support = bowlSupport({ count: 1, front: 1, rear: 0 });
  assert.equal(transitionLandingSupportMode(support), 'wheelFirst');
});

test('flat partial-truck contact remains rejected', () => {
  const support = bowlSupport();
  support.normal.set(0, 1, 0);
  assert.equal(transitionLandingSupportMode(support), 'reject');
});

test('flat one-wheel contact remains rejected', () => {
  const support = bowlSupport({ count: 1, front: 1, rear: 0 });
  support.normal.set(0, 1, 0);
  assert.equal(transitionLandingSupportMode(support), 'reject');
});

test('bowl flip gets earlier THPS-style auto-catch than flat ground', () => {
  assert.equal(transitionFlipLandingMode(0.52, 0.72, 'truckFirst'), 'autoCatch');
  assert.equal(transitionFlipLandingMode(0.52, 1, 'full'), 'bail');
  assert.ok(transitionAlignmentThreshold(0.72, 'truckFirst') < transitionAlignmentThreshold(1, 'full'));
});

test('single-wheel ramp touchdown gets the most forgiving catch bridge', () => {
  assert.equal(transitionFlipLandingMode(0.20, 0.82, 'wheelFirst'), 'autoCatch');
  assert.ok(transitionAlignmentThreshold(0.82, 'wheelFirst') < transitionAlignmentThreshold(0.82, 'truckFirst'));
});

test('advanced kickflip lands on bowl from first truck contact', () => {
  const p = physics();
  const support = bowlSupport();
  armAirLanding(p, support, 0.58);
  const landed = p.land(support);
  assert.equal(landed, true, 'truck-first bowl touchdown should be accepted');
  assert.equal(p.grounded, true, 'rider should reconnect to bowl');
  assert.equal(p.bailTime > 0, false, 'completed-enough flip must not bail on bowl');
  assert.equal(p.flipState, null, 'flip should be caught at touchdown');
  assert.ok(p.transitionLandingGrace > 0, 'partial transition touchdown should open a contact bridge');
});

test('kickflip lands from a single wheel on a real-style transition contact', () => {
  const p = physics();
  const support = bowlSupport({ count: 1, front: 1, rear: 0 });
  armAirLanding(p, support, 0.24);
  const landed = p.land(support);
  assert.equal(landed, true, 'first swept wheel must be allowed to pin the landing');
  assert.equal(p.grounded, true);
  assert.equal(p.bailTime > 0, false);
  assert.ok(p.transitionLandingGrace >= 0.13);
});

test('very early flip can still bail on bowl', () => {
  const p = physics();
  const support = bowlSupport();
  armAirLanding(p, support, 0.12);
  const landed = p.land(support);
  assert.equal(landed, false);
  assert.equal(p.bailTime > 0, true, 'very early rotation should still be unsafe');
});

test('180 landing preserves world travel direction and toggles stance', () => {
  const p = physics();
  const support = flatSupport();
  arm180Landing(p, support, 5);
  const initialStance = p.stance;

  const landed = p.land(support);
  assert.equal(landed, true);
  assert.ok(p.velocity.z < -4.9, `180 rotated momentum instead of preserving it: ${p.velocity.z}`);
  assert.ok(p.velocity.dot(p.forward) < 0, 'after 180 the rider should roll fakie relative to deck forward');
  assert.equal(p.stance, -initialStance, 'odd 180 should swap regular/switch stance');
  assert.equal(p.rollingSign, -1, '180 landing must latch fakie travel sign');
  assert.equal(p.fakie, true, '180 landing must expose explicit fakie state');
  assert.ok(p.travelDirection.z < -0.99, 'persistent travel direction must remain world-forward after the 180');
});

test('neutral and forward input preserve the same fakie propulsion after a 180', () => {
  const neutral = physics();
  const forwardHeld = physics();
  const support = flatSupport();
  arm180Landing(neutral, support, 7);
  arm180Landing(forwardHeld, support, 7);
  assert.equal(neutral.land(support), true);
  assert.equal(forwardHeld.land(support), true);

  for (let i = 0; i < 30; i++) {
    neutral.stepGround(1 / 120, { brake: false }, 0);
    forwardHeld.stepGround(1 / 120, { brake: false }, 1);
  }

  assert.ok(neutral.velocity.z < 0, 'neutral fakie must continue in the original world direction');
  assert.ok(forwardHeld.velocity.z < 0, 'holding forward must not reverse fakie world travel');
  assert.ok(Math.abs(neutral.velocity.length() - forwardHeld.velocity.length()) < 0.03,
    'forward must not act as a fakie throttle');
  assert.equal(neutral.rollingSign, -1);
  assert.equal(forwardHeld.rollingSign, -1);
});
