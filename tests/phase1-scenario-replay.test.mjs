import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { StatefulSkillStreetPhysics } from '../src/game/StatefulSkillStreetPhysics.js';
import { MOVEMENT_STATE } from '../src/game/StreetPhysics.js';
import {
  firstReplayDivergence,
  replaySegment,
  runDeterministicReplay,
} from '../src/game/replay/DeterministicReplay.js';

function floorWorld({ wall = false } = {}) {
  const root = new THREE.Group();
  const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });

  const floor = new THREE.Mesh(new THREE.BoxGeometry(40, 0.1, 40), material);
  floor.position.y = -0.05;
  root.add(floor);

  if (wall) {
    const barrier = new THREE.Mesh(
      new THREE.BoxGeometry(8, 3, 0.12),
      material.clone(),
    );
    barrier.position.set(0, 1.5, -0.45);
    barrier.userData.surface = 'solid';
    root.add(barrier);
  }

  root.updateMatrixWorld(true);
  return root;
}

function assertReplayClean(replay) {
  for (const snapshot of replay.snapshots) {
    assert.equal(snapshot.state.landingYawInvariantViolations, 0,
      `contact-driven yaw at frame ${snapshot.frame}`);
    assert.equal(snapshot.state.lastLandingYawViolated === true, false,
      `landing yaw invariant failed at frame ${snapshot.frame}`);
    for (const vector of [
      snapshot.state.position,
      snapshot.state.velocity,
      snapshot.state.normal,
      snapshot.state.travelDirection,
    ]) {
      if (!vector) continue;
      assert.equal(vector.every(Number.isFinite), true,
        `non-finite replay vector at frame ${snapshot.frame}`);
    }
  }
}

function wallPhysics(speed = 15) {
  const p = new StatefulSkillStreetPhysics({
    collision: floorWorld({ wall: true }),
    spawn: [0, 0.5, 1.8],
    rails: [],
  });
  p.position.set(0, 0.015, 0.75);
  p.normal.set(0, 1, 0);
  p.heading = 0;
  p.groundDirection();
  p.velocity.copy(p.forward).multiplyScalar(speed);
  p.grounded = true;
  p.setMovementState(MOVEMENT_STATE.GROUND);
  p.syncTravelDirection({ preserveIfSlow: false });
  return p;
}

test('fixed-step high-speed wall replay cannot tunnel or rotate yaw', () => {
  const tape = [replaySegment(36, { drive: 0, steer: 0 })];
  const first = runDeterministicReplay({ controller: wallPhysics(15), segments: tape });
  const second = runDeterministicReplay({ controller: wallPhysics(15), segments: tape });

  assert.equal(firstReplayDivergence(first, second), null);
  assert.equal(first.signature, second.signature);
  assertReplayClean(first);

  for (const snapshot of first.snapshots) {
    assert.ok(Math.abs(snapshot.state.heading) < 1e-8,
      `wall collision changed heading at frame ${snapshot.frame}: ${snapshot.state.heading}`);
    // Wall center is z=-0.45, thickness 0.12. Capsule/skin must keep the rider
    // safely on the approach side instead of tunnelling through to negative Z.
    assert.ok(snapshot.state.position[2] > -0.30,
      `body tunneled through wall at frame ${snapshot.frame}: z=${snapshot.state.position[2]}`);
  }
});

function manualBridgePhysics() {
  const p = new StatefulSkillStreetPhysics({
    collision: floorWorld(),
    spawn: [0, 0.5, 0],
    rails: [],
  });
  p.position.set(0, 0.22, 0);
  p.normal.set(0, 1, 0);
  p.heading = 0;
  p.airHeading = 0;
  p.airTakeoffHeading = 0;
  p.airTakeoffFacing.set(0, 0, -1);
  p.airTakeoffStance = 1;
  p.airSpin = 0;
  p.airDirection();
  p.velocity.set(0, -2.4, -4.5);
  p.speed = p.velocity.length();
  p.grounded = false;
  p.airTime = 0.28;
  p.setMovementState(MOVEMENT_STATE.AIR);
  p.syncTravelDirection({ preserveIfSlow: false });
  return p;
}

const manualBridgeTape = [
  replaySegment(1, { directionTaps: ['up'] }),
  replaySegment(5, {}),
  replaySegment(1, { directionTaps: ['down'] }),
  replaySegment(42, { drive: 0, steer: 0 }),
];

test('fixed-step air-to-manual bridge survives touchdown deterministically', () => {
  const first = runDeterministicReplay({
    controller: manualBridgePhysics(),
    segments: manualBridgeTape,
  });
  const second = runDeterministicReplay({
    controller: manualBridgePhysics(),
    segments: manualBridgeTape,
  });

  assert.equal(firstReplayDivergence(first, second), null);
  assert.equal(first.signature, second.signature);
  assertReplayClean(first);

  const manualFrame = first.snapshots.find(snapshot => snapshot.state.manual === 'manual');
  assert.ok(manualFrame, 'queued up/down air taps never bridged into a manual');
  assert.equal(manualFrame.state.grounded, true);
  assert.equal(manualFrame.state.movementState, MOVEMENT_STATE.MANUAL);
});

class PumpReplayPhysics extends StatefulSkillStreetPhysics {
  constructor() {
    super({ collision: floorWorld(), spawn: [0, 0.5, 0], rails: [] });
    this._pumpFixtureNormal = new THREE.Vector3(0, Math.cos(Math.PI / 6), Math.sin(Math.PI / 6)).normalize();
    this.position.set(0, 0.015, 0);
    this.normal.copy(this._pumpFixtureNormal);
    this.heading = 0;
    this.groundDirection();
    this.velocity.copy(this.forward).multiplyScalar(7.5);
    this.grounded = true;
    this.setMovementState(MOVEMENT_STATE.GROUND);
    this.syncTravelDirection({ preserveIfSlow: false });
  }

  // Deterministic transition-contact fixture: execution remains the real pump,
  // input, energy, cooldown and state pipeline; only terrain sampling is fixed.
  samplePumpContacts() {
    const normal = this._pumpFixtureNormal.clone();
    return {
      support: { supported: true, count: 4, normal, contacts: [] },
      contactCount: 4,
      normal,
      contactSpread: 0.06,
    };
  }

  stepGround(dt, input = {}, drive = 0) {
    // Keep this replay focused on pump energy rather than translating off the
    // synthetic contact fixture. The real pump update runs before this method.
    this.normal.copy(this._pumpFixtureNormal);
    this.grounded = true;
    this.setMovementState(MOVEMENT_STATE.GROUND);
    this.syncTravelDirection();
  }
}

const pumpTape = [
  replaySegment(12, { ollieHeld: true }),
  replaySegment(1, { ollieReleased: true }),
  replaySegment(30, {}),
  replaySegment(12, { ollieHeld: true }),
  replaySegment(1, { ollieReleased: true }),
  replaySegment(30, {}),
];

test('fixed-step pump loop adds energy reproducibly and respects cooldown flow', () => {
  const firstController = new PumpReplayPhysics();
  const secondController = new PumpReplayPhysics();
  const startSpeed = firstController.velocity.length();

  const first = runDeterministicReplay({ controller: firstController, segments: pumpTape });
  const second = runDeterministicReplay({ controller: secondController, segments: pumpTape });

  assert.equal(firstReplayDivergence(first, second), null);
  assert.equal(first.signature, second.signature);
  assertReplayClean(first);

  assert.ok(firstController.pumpLastEnergy > 0,
    `pump replay never added energy: ${firstController.pumpLastEnergy}`);

  const stateAt = frame => {
    const snapshot = first.snapshots.find(entry => entry.frame === frame);
    assert.ok(snapshot, `missing replay snapshot at frame ${frame}`);
    return snapshot.state;
  };
  const firstRelease = stateAt(13);
  const secondRelease = stateAt(56);

  assert.ok(firstRelease.pumpLastDeltaSpeed > 0,
    `first pump transaction added no speed: ${firstRelease.pumpLastDeltaSpeed}`);
  assert.ok(firstRelease.pumpLastEnergy > 0,
    `first pump transaction added no energy: ${firstRelease.pumpLastEnergy}`);
  assert.ok(secondRelease.pumpLastDeltaSpeed > 0,
    `second pump transaction added no speed: ${secondRelease.pumpLastDeltaSpeed}`);
  assert.ok(secondRelease.pumpLastEnergy > 0,
    `second pump transaction added no energy: ${secondRelease.pumpLastEnergy}`);
  assert.equal(firstController.grounded, true);
});


function genericRampLaunchPhysics() {
  const p = new StatefulSkillStreetPhysics({
    collision: floorWorld(),
    spawn: [0, 0.5, 0],
    rails: [],
  });
  p.position.set(0, 0.015, 6);
  p.normal.set(0, 1, 0);
  p.heading = 0;
  p.groundDirection();
  p.velocity.copy(p.forward).multiplyScalar(9.5);
  p.speed = 9.5;
  p.grounded = true;
  p.setMovementState(MOVEMENT_STATE.GROUND);
  p.syncTravelDirection({ preserveIfSlow: false });

  // Represents the climb energy sampled on the preceding bank/kicker frames.
  // The exact lip may already be flat when takeoff occurs; this memory is the
  // canonical generic-ramp path that keeps launch energy consistent.
  p.rampLaunchMemory = 5.2;
  p.rampLaunchMemoryTime = 0.24;
  return p;
}

const genericRampLaunchTape = [
  replaySegment(1, { ollieReleased: true }),
  replaySegment(150, { drive: 0, steer: 0, spin: 0 }),
];

test('generic ramp-memory launch replay creates deterministic big air without yaw', () => {
  const first = runDeterministicReplay({
    controller: genericRampLaunchPhysics(),
    segments: genericRampLaunchTape,
  });
  const second = runDeterministicReplay({
    controller: genericRampLaunchPhysics(),
    segments: genericRampLaunchTape,
  });

  assert.equal(firstReplayDivergence(first, second), null);
  assert.equal(first.signature, second.signature);
  assertReplayClean(first);

  const airborne = first.snapshots.find(snapshot => !snapshot.state.grounded);
  assert.ok(airborne, 'generic ramp launch never became airborne');
  assert.ok(airborne.state.velocity[1] > 8.0,
    `remembered ramp energy produced weak vertical launch: ${airborne.state.velocity[1]}`);

  const maxHeight = Math.max(...first.snapshots.map(snapshot => snapshot.state.position[1]));
  assert.ok(maxHeight > 2.0, `generic ramp launch did not produce big air: y=${maxHeight}`);

  for (const snapshot of first.snapshots) {
    assert.ok(Math.abs(snapshot.state.heading) < 1e-8,
      `no-input generic ramp air invented yaw at frame ${snapshot.frame}: ${snapshot.state.heading}`);
  }

  assert.ok(first.snapshots.some(snapshot => snapshot.state.grounded && snapshot.frame > 40),
    'generic ramp launch never reconnected to ground');
});
