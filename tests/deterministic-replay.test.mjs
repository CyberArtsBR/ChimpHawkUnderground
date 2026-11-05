import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { StatefulSkillStreetPhysics } from '../src/game/StatefulSkillStreetPhysics.js';
import {
  firstReplayDivergence,
  replaySegment,
  runDeterministicReplay,
} from '../src/game/replay/DeterministicReplay.js';
import { gameplayStateFiniteErrors } from '../src/game/core/GameplayStateSnapshot.js';

function flatWorld() {
  const root = new THREE.Group();
  const floor = new THREE.Mesh(
    new THREE.BoxGeometry(80, 0.1, 80),
    new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }),
  );
  floor.position.y = -0.05;
  root.add(floor);
  root.updateMatrixWorld(true);
  return root;
}

function physics() {
  return new StatefulSkillStreetPhysics({
    collision: flatWorld(),
    spawn: [0, 0.5, 0],
    rails: [],
  });
}

const baselineTape = [
  replaySegment(90, { drive: 1 }),
  replaySegment(45, { drive: 1, steer: 0.55 }),
  replaySegment(30, { drive: 1, steer: -0.35 }),
  replaySegment(24, { drive: 0 }),
  replaySegment(1, { ollieHeld: true, olliePressed: true }),
  replaySegment(28, { ollieHeld: true }),
  replaySegment(1, { ollieReleased: true }),
  replaySegment(96, { drive: 0, spin: 0 }),
];

test('same fixed-step input tape produces byte-identical gameplay snapshots', () => {
  const first = runDeterministicReplay({ controller: physics(), segments: baselineTape });
  const second = runDeterministicReplay({ controller: physics(), segments: baselineTape });

  assert.equal(first.frameCount, second.frameCount);
  assert.equal(first.signature, second.signature);
  assert.equal(firstReplayDivergence(first, second), null);
  assert.deepEqual(first.snapshots, second.snapshots);
});

test('replay baseline never emits non-finite canonical gameplay state', () => {
  const replay = runDeterministicReplay({ controller: physics(), segments: baselineTape });
  for (const snapshot of replay.snapshots) {
    assert.deepEqual(
      gameplayStateFiniteErrors(snapshot.state),
      [],
      `non-finite state at fixed frame ${snapshot.frame}`,
    );
  }
});

test('replay baseline never permits contact-driven landing yaw', () => {
  const replay = runDeterministicReplay({ controller: physics(), segments: baselineTape });
  for (const snapshot of replay.snapshots) {
    assert.equal(
      snapshot.state.landingYawInvariantViolations,
      0,
      `contact-driven landing yaw violation at fixed frame ${snapshot.frame}`,
    );
    assert.notEqual(
      snapshot.state.lastLandingYawViolated,
      true,
      `landing yaw invariant reported a violation at fixed frame ${snapshot.frame}`,
    );
  }
});

test('canonical player state stays invariant-clean across baseline replay', () => {
  const replay = runDeterministicReplay({ controller: physics(), segments: baselineTape });
  for (const snapshot of replay.snapshots) {
    assert.deepEqual(
      snapshot.state.stateInvariantCodes,
      [],
      `canonical state divergence at fixed frame ${snapshot.frame}: ${snapshot.state.stateInvariantCodes.join(', ')}`,
    );
  }
});

test('multi-frame replay segments emit edge-triggered inputs only once', () => {
  class ProbeController {
    constructor() { this.events = []; }
    advance(_dt, input) { this.events.push({ ...input }); }
  }

  const probe = new ProbeController();
  runDeterministicReplay({
    controller: probe,
    segments: [replaySegment(4, { olliePressed: true, ollieHeld: true })],
    throwOnNonFinite: false,
  });

  assert.equal(probe.events.length, 4);
  assert.equal(probe.events[0].olliePressed, true);
  assert.equal(probe.events[1].olliePressed, false);
  assert.equal(probe.events[2].olliePressed, false);
  assert.equal(probe.events[3].olliePressed, false);
  assert.equal(probe.events.every(frame => frame.ollieHeld === true), true);
});
