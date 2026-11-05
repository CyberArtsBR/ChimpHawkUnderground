import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { StatefulSkillStreetPhysics } from '../src/game/StatefulSkillStreetPhysics.js';
import {
  MOMENTUM_ROLL,
  automaticPushAcceleration,
  passiveRollingResistance,
} from '../src/game/MomentumRollSkillStreetPhysics.js';
import { MOVEMENT_STATE } from '../src/game/StreetPhysics.js';

function floorWorld() {
  const root = new THREE.Group();
  const floor = new THREE.Mesh(new THREE.BoxGeometry(80, 0.1, 80), new THREE.MeshBasicMaterial());
  floor.position.y = -0.05;
  root.add(floor);
  root.updateMatrixWorld(true);
  return root;
}

function physics() {
  return new StatefulSkillStreetPhysics({ collision: floorWorld(), spawn: [0, 0.5, 0], rails: [] });
}

function setFlatRolling(p, signedSpeed) {
  p.position.set(0, 0.015, 0);
  p.normal.set(0, 1, 0);
  p.heading = 0;
  p.groundDirection();
  p.setMovementState(MOVEMENT_STATE.GROUND);
  p.velocity.copy(p.forward).multiplyScalar(signedSpeed);
  p.rollingSign = signedSpeed < 0 ? -1 : 1;
}

function simulateGround(p, seconds, { drive = 0, brake = false, steer = 0 } = {}) {
  const dt = 1 / 120;
  const steps = Math.round(seconds / dt);
  for (let i = 0; i < steps; i++) {
    p.steer = steer;
    p.stepGround(dt, { brake }, drive);
    if (!p.grounded) break;
  }
}

test('flat low-speed skating auto-pushes with completely neutral input', () => {
  const p = physics();
  setFlatRolling(p, 0);
  simulateGround(p, 2, { drive: 0 });
  const speed = Math.abs(p.velocity.dot(p.forward));
  assert.ok(speed > 4.0, `neutral rider should auto-push from rest, got ${speed}`);
  assert.ok(speed <= MOMENTUM_ROLL.autoPushTarget + 0.2, `auto-push exceeded cruise target: ${speed}`);
});

test('holding forward is not a throttle: neutral and forward produce the same roll', () => {
  const neutral = physics();
  const forwardHeld = physics();
  setFlatRolling(neutral, 4.0);
  setFlatRolling(forwardHeld, 4.0);

  simulateGround(neutral, 1.25, { drive: 0 });
  simulateGround(forwardHeld, 1.25, { drive: 1 });

  const neutralSpeed = neutral.velocity.dot(neutral.forward);
  const heldSpeed = forwardHeld.velocity.dot(forwardHeld.forward);
  assert.ok(Math.abs(neutralSpeed - heldSpeed) < 0.03,
    `forward input changed propulsion: neutral=${neutralSpeed}, held=${heldSpeed}`);
});

test('high-speed momentum coasts without forward input instead of rapidly dying', () => {
  const p = physics();
  setFlatRolling(p, 9.0);
  simulateGround(p, 2, { drive: 0 });
  const speed = Math.abs(p.velocity.dot(p.forward));
  assert.ok(speed > 8.25, `coasting drag is too strong: 9 -> ${speed}`);
});

test('explicit brake still slows strongly', () => {
  const p = physics();
  setFlatRolling(p, 7.0);
  simulateGround(p, 0.4, { brake: true });
  const speed = Math.abs(p.velocity.dot(p.forward));
  assert.ok(speed < 3.0, `brake did not remove enough speed: ${speed}`);
});

test('down input can brake but up input does not accelerate', () => {
  const up = physics();
  const down = physics();
  setFlatRolling(up, 7.0);
  setFlatRolling(down, 7.0);
  simulateGround(up, 0.35, { drive: 1 });
  simulateGround(down, 0.35, { drive: -1 });
  const upSpeed = Math.abs(up.velocity.dot(up.forward));
  const downSpeed = Math.abs(down.velocity.dot(down.forward));
  assert.ok(upSpeed > 6.8, `up unexpectedly acted like a throttle/brake: ${upSpeed}`);
  assert.ok(downSpeed < 3.5, `down should act as brake: ${downSpeed}`);
});

test('auto-push is disabled on bowls/ramps so transition energy stays physical', () => {
  assert.equal(automaticPushAcceleration({ speed: 2, normalY: 0.80 }), 0);
  assert.equal(automaticPushAcceleration({ speed: 2, normalY: 0.94 }), 0);
  assert.ok(automaticPushAcceleration({ speed: 2, normalY: 1 }) > 0);
});

test('rolling resistance stays much lower than the legacy ground drag', () => {
  assert.ok(passiveRollingResistance(6) < 0.2);
  assert.ok(passiveRollingResistance(10) < 0.35);
});

test('after a 180, neutral input keeps fakie momentum in the same world direction', () => {
  const p = physics();
  p.position.set(0, 0.015, 0);
  p.normal.set(0, 1, 0);
  p.heading = Math.PI;
  p.groundDirection();
  p.setMovementState(MOVEMENT_STATE.GROUND);
  // Deck forward points +Z, but the rider is travelling -Z after the 180.
  p.velocity.set(0, 0, -5.5);
  p.rollingSign = -1;
  const startZ = p.position.z;

  simulateGround(p, 0.8, { drive: 0 });

  assert.ok(p.position.z < startZ - 3.5, `fakie momentum did not continue in world -Z: ${p.position.z}`);
  assert.ok(p.velocity.dot(p.forward) < 0, 'deck-relative velocity should remain fakie after 180');
});
