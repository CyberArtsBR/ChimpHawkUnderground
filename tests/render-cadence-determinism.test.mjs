import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { StatefulSkillStreetPhysics } from '../src/game/StatefulSkillStreetPhysics.js';
import {
  captureGameplayState,
  gameplayStateSignature,
} from '../src/game/core/GameplayStateSnapshot.js';

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

function inputAt(time) {
  if (time < 0.5) return { drive: 1, steer: 0 };
  if (time < 1.0) return { drive: 1, steer: 0.55 };
  if (time < 1.5) return { drive: 0, steer: -0.30 };
  return { drive: 0, steer: 0 };
}

function runCadence(fps, seconds = 2) {
  const p = physics();
  const delta = 1 / fps;
  const frames = Math.round(seconds * fps);
  for (let frame = 0; frame < frames; frame++) {
    p.advance(delta, inputAt(frame * delta));
  }
  const state = captureGameplayState(p);
  return {
    state,
    signature: gameplayStateSignature(state),
    accumulator: p.accumulator,
  };
}

test('30/60/120/144 FPS render cadence produces identical 120 Hz gameplay state', () => {
  const reference = runCadence(120);
  for (const fps of [30, 60, 144]) {
    const result = runCadence(fps);
    assert.equal(
      result.signature,
      reference.signature,
      `${fps} FPS render cadence diverged from 120 FPS fixed-step gameplay`,
    );
    assert.ok(Math.abs(result.accumulator - reference.accumulator) < 1e-9,
      `${fps} FPS left different fixed-step accumulator: ${result.accumulator}`);
  }
});

test('render-cadence determinism keeps yaw contact invariant clean', () => {
  for (const fps of [30, 60, 120, 144]) {
    const { state } = runCadence(fps);
    assert.equal(state.landingYawInvariantViolations, 0);
    assert.notEqual(state.lastLandingYawViolated, true);
  }
});
