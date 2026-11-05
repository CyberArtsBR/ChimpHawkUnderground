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

function flatDeckWorld() {
  const root = new THREE.Group();
  const deck = new THREE.Mesh(
    new THREE.BoxGeometry(8, 0.1, 8),
    new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }),
  );
  deck.position.y = -0.05;
  root.add(deck);
  root.updateMatrixWorld(true);
  return root;
}

function transferAir({ abortToReturn = false } = {}) {
  const lipPoint = new THREE.Vector3(0, 0, 0);
  const targetPoint = abortToReturn
    ? new THREE.Vector3(0, 0.015, 0.30)
    : new THREE.Vector3(0, 0.015, -0.55);
  const returnTarget = new THREE.Vector3(0, 0.015, 0.30);
  const horizontalSpeed = 2.0;
  const verticalSpeed = 3.4;

  return {
    mode: abortToReturn ? 'return' : 'transfer',
    frame: {
      lipPoint,
      copingTangent: new THREE.Vector3(1, 0, 0),
      rampInward: new THREE.Vector3(0, 0, 1),
      deckOutward: new THREE.Vector3(0, 0, -1),
      surfaceNormal: new THREE.Vector3(0, 0.45, 0.893).normalize(),
      boardForward: new THREE.Vector3(0, 0, -1),
      takeoffFacing: new THREE.Vector3(0, 0, -1),
      takeoffStance: 1,
      takeoffHeading: 0,
      incomingTangentVelocity: new THREE.Vector3(0, 0, -5),
      incomingSpeed: 7,
      launchBoost: 0,
      returnTarget,
    },
    launchVertical: verticalSpeed,
    launchHorizontal: new THREE.Vector3(0, 0, abortToReturn ? 0.4 : -horizontalSpeed),
    lateralVelocity: 0,
    apexPassed: true,
    exitRequested: true,
    transferring: true,
    age: 0.35,
    copingName: 'replay-coping',
    returnError: targetPoint.distanceTo(new THREE.Vector3(0, 0.45, -0.15)),
    exitControl: {
      geometryAware: true,
      abortToReturn,
      found: !abortToReturn,
      startDistance: 0.10,
      endDistance: 0.95,
      usableWidth: 0.85,
      targetDistance: abortToReturn ? 0.30 : 0.55,
      targetPoint,
      targetNormal: new THREE.Vector3(0, 1, 0),
      horizontalSpeed,
      verticalSpeed,
    },
  };
}

function physics({ abortToReturn = false } = {}) {
  const p = new StatefulSkillStreetPhysics({
    collision: flatDeckWorld(),
    spawn: [0, 0.5, 0],
    rails: [],
  });
  const air = transferAir({ abortToReturn });
  p.position.set(0, 0.48, -0.15);
  p.heading = 0;
  p.airHeading = 0;
  p.airTakeoffHeading = 0;
  p.airTakeoffFacing.set(0, 0, -1);
  p.airTakeoffStance = 1;
  p.airTakeoffFromRamp = true;
  p.airSpin = 0;
  p.airDirection();
  p.velocity.set(0, -1.4, abortToReturn ? -0.8 : -1.6);
  p.transitionAir = air;
  p.setMovementState(MOVEMENT_STATE.VERT_AIR);
  p.grounded = false;
  p.airTime = 0.35;
  p.lastWheelSupport = null;
  p.syncTravelDirection({ preserveIfSlow: false });
  return p;
}

const tape = [replaySegment(72, { drive: 0, steer: 0, spin: 0 })];

function run(options) {
  return runDeterministicReplay({ controller: physics(options), segments: tape });
}

function firstGrounded(replay) {
  return replay.snapshots.find(snapshot => snapshot.state.grounded) || null;
}

test('geometry-aware coping transfer lands deterministically on the verified deck corridor', () => {
  const first = run({ abortToReturn: false });
  const second = run({ abortToReturn: false });
  const landed = firstGrounded(first);

  assert.ok(landed, 'controlled coping transfer never landed');
  assert.equal(firstReplayDivergence(first, second), null);
  assert.equal(first.signature, second.signature);
  assert.equal(landed.state.transitionActive, false);
  assert.equal(landed.state.bailActive, false);
  assert.equal(landed.state.fakie, false);
  assert.equal(landed.state.rollingSign, 1);
  assert.equal(landed.state.landingYawInvariantViolations, 0);
  assert.notEqual(landed.state.lastLandingYawViolated, true);
  assert.ok(landed.state.position[2] < -0.08 && landed.state.position[2] > -1.15,
    `transfer landed outside deck corridor: z=${landed.state.position[2]}`);
});

test('geometry-aware abort-to-return lands through return route without deck-target rejection', () => {
  const first = run({ abortToReturn: true });
  const second = run({ abortToReturn: true });
  const landed = firstGrounded(first);

  assert.ok(landed, 'abort-to-return never reconnected to support');
  assert.equal(firstReplayDivergence(first, second), null);
  assert.equal(first.signature, second.signature);
  assert.equal(landed.state.transitionActive, false);
  assert.equal(landed.state.bailActive, false);
  assert.equal(landed.state.landingYawInvariantViolations, 0);
  assert.notEqual(landed.state.lastLandingYawViolated, true);
  assert.ok(Math.abs(landed.state.heading) < 1e-6,
    `abort route invented yaw: ${landed.state.heading}`);
});

test('both coping routes remain finite and yaw-clean after touchdown', () => {
  for (const replay of [run({ abortToReturn: false }), run({ abortToReturn: true })]) {
    const landed = firstGrounded(replay);
    assert.ok(landed);
    for (const snapshot of replay.snapshots.filter(entry => entry.frame >= landed.frame)) {
      assert.equal(snapshot.state.landingYawInvariantViolations, 0,
        `yaw violation at fixed frame ${snapshot.frame}`);
      assert.notEqual(snapshot.state.lastLandingYawViolated, true,
        `yaw invariant failed at fixed frame ${snapshot.frame}`);
      assert.equal(snapshot.state.position.every(Number.isFinite), true);
      assert.equal(snapshot.state.velocity.every(Number.isFinite), true);
    }
  }
});
