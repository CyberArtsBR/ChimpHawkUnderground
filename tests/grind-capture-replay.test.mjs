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

function floorWorld() {
  const root = new THREE.Group();
  const floor = new THREE.Mesh(
    new THREE.BoxGeometry(30, 0.1, 30),
    new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }),
  );
  floor.position.y = -0.05;
  root.add(floor);
  root.updateMatrixWorld(true);
  return root;
}

const rails = [{
  name: 'Replay grind rail',
  points: [
    [0, 0.80, 2.5],
    [0, 0.80, -6.0],
  ],
  radius: 0.055,
}];

function grindApproachPhysics() {
  const p = new StatefulSkillStreetPhysics({
    collision: floorWorld(),
    spawn: [0, 0.5, 0],
    rails,
  });
  p.position.set(0.18, 1.02, 1.25);
  p.normal.set(0, 1, 0);
  p.heading = 0;
  p.airHeading = 0;
  p.airTakeoffHeading = 0;
  p.airTakeoffFacing.set(0, 0, -1);
  p.airTakeoffStance = 1;
  p.airSpin = 0;
  p.airDirection();
  p.velocity.set(-0.35, -0.55, -6.4);
  p.speed = p.velocity.length();
  p.grounded = false;
  p.airTime = 0.22;
  p.contactCooldown = 0;
  p.setMovementState(MOVEMENT_STATE.AIR);
  p.syncTravelDirection({ preserveIfSlow: false });
  return p;
}

const captureTape = [
  replaySegment(1, { grindPressed: true, grindHeld: true }),
  replaySegment(24, { grindHeld: true }),
];

test('fixed-step airborne grind intent captures the authored rail deterministically', () => {
  const first = runDeterministicReplay({
    controller: grindApproachPhysics(),
    segments: captureTape,
  });
  const second = runDeterministicReplay({
    controller: grindApproachPhysics(),
    segments: captureTape,
  });

  assert.equal(firstReplayDivergence(first, second), null);
  assert.equal(first.signature, second.signature);

  const firstGrind = first.snapshots.find(snapshot => snapshot.state.grindActive);
  const secondGrind = second.snapshots.find(snapshot => snapshot.state.grindActive);
  assert.ok(firstGrind, 'explicit grind intent never captured the nearby aligned rail');
  assert.ok(secondGrind);
  assert.equal(firstGrind.frame, secondGrind.frame,
    'rail capture frame changed across identical fixed-step runs');
  assert.equal(firstGrind.state.movementState, MOVEMENT_STATE.GRIND);
  assert.ok(firstGrind.state.grindName,
    'captured grind did not expose canonical trick identity');

  for (const snapshot of first.snapshots) {
    assert.equal(snapshot.state.landingYawInvariantViolations, 0,
      `grind approach generated contact yaw at frame ${snapshot.frame}`);
  }
});

test('same airborne trajectory cannot magnetize to rail without grind intent', () => {
  const replay = runDeterministicReplay({
    controller: grindApproachPhysics(),
    segments: [replaySegment(25, {})],
  });
  assert.equal(
    replay.snapshots.some(snapshot => snapshot.state.grindActive),
    false,
    'rail magnet captured without explicit grind intent',
  );
});

test('out-of-reach grind intent does not capture a different trajectory', () => {
  const p = grindApproachPhysics();
  p.position.x = 1.4;
  const replay = runDeterministicReplay({
    controller: p,
    segments: captureTape,
  });
  assert.equal(
    replay.snapshots.some(snapshot => snapshot.state.grindActive),
    false,
    'rail magnet captured from clearly out-of-reach lateral distance',
  );
});
