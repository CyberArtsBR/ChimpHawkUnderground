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

function flatWorld() {
  const root = new THREE.Group();
  const floor = new THREE.Mesh(
    new THREE.BoxGeometry(20, 0.1, 20),
    new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }),
  );
  floor.position.y = -0.05;
  root.add(floor);
  root.updateMatrixWorld(true);
  return root;
}

function rampReturnPhysics({ spin = 0, heading = 0 } = {}) {
  const p = new StatefulSkillStreetPhysics({
    collision: flatWorld(),
    spawn: [0, 0.5, 0],
    rails: [],
  });

  // A real AIR state only a short distance above touchdown. World travel is +Z,
  // opposite the takeoff deck facing (-Z), reproducing a same-wall vert return.
  p.position.set(0, 0.16, 0);
  p.normal.set(0, 1, 0);
  p.heading = heading;
  p.airHeading = heading;
  p.airTakeoffHeading = 0;
  p.airTakeoffFacing.set(0, 0, -1);
  p.airTakeoffStance = 1;
  p.airTakeoffFromRamp = true;
  p.airSpin = spin;
  p.airDirection();
  p.velocity.set(0, -3.2, 3.0);
  p.setMovementState(MOVEMENT_STATE.AIR);
  p.grounded = false;
  p.airTime = 0.35;
  p.lastWheelSupport = null;
  p.syncTravelDirection({ preserveIfSlow: false });
  return p;
}

const touchdownTape = [replaySegment(24, { drive: 0, steer: 0, spin: 0 })];

function firstGrounded(replay) {
  return replay.snapshots.find(snapshot => snapshot.state.grounded) || null;
}

function runScenario(options) {
  return runDeterministicReplay({
    controller: rampReturnPhysics(options),
    segments: touchdownTape,
  });
}

test('fixed-step passive same-wall return deterministically lands fakie without yaw', () => {
  const first = runScenario({ spin: 0, heading: 0 });
  const second = runScenario({ spin: 0, heading: 0 });
  const landed = firstGrounded(first);

  assert.ok(landed, 'passive ramp return never reached a grounded snapshot');
  assert.equal(firstReplayDivergence(first, second), null);
  assert.equal(first.signature, second.signature);
  assert.ok(Math.abs(landed.state.heading) < 1e-6,
    `passive return invented yaw: ${landed.state.heading}`);
  assert.equal(landed.state.fakie, true);
  assert.equal(landed.state.rollingSign, -1);
  assert.equal(landed.state.stance, 1);
  assert.equal(landed.state.landingYawInvariantViolations, 0);
  assert.notEqual(landed.state.lastLandingYawViolated, true);
});

test('fixed-step explicit 180 return deterministically lands regular with reversed stance', () => {
  const first = runScenario({ spin: Math.PI, heading: Math.PI });
  const second = runScenario({ spin: Math.PI, heading: Math.PI });
  const landed = firstGrounded(first);

  assert.ok(landed, 'explicit 180 ramp return never reached a grounded snapshot');
  assert.equal(firstReplayDivergence(first, second), null);
  assert.equal(first.signature, second.signature);
  assert.ok(Math.abs(Math.abs(landed.state.heading) - Math.PI) < 1e-6,
    `explicit 180 heading was lost: ${landed.state.heading}`);
  assert.equal(landed.state.fakie, false);
  assert.equal(landed.state.rollingSign, 1);
  assert.equal(landed.state.stance, -1);
  assert.equal(landed.state.landingYawInvariantViolations, 0);
  assert.notEqual(landed.state.lastLandingYawViolated, true);
});

test('ramp return replay stays yaw-clean for every captured frame after touchdown', () => {
  for (const replay of [
    runScenario({ spin: 0, heading: 0 }),
    runScenario({ spin: Math.PI, heading: Math.PI }),
  ]) {
    const landed = firstGrounded(replay);
    assert.ok(landed);
    for (const snapshot of replay.snapshots.filter(entry => entry.frame >= landed.frame)) {
      assert.equal(snapshot.state.landingYawInvariantViolations, 0,
        `yaw violation at fixed frame ${snapshot.frame}`);
      assert.notEqual(snapshot.state.lastLandingYawViolated, true,
        `yaw invariant failed at fixed frame ${snapshot.frame}`);
    }
  }
});
