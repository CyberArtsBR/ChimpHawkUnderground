import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  RampWallSafetySkillStreetPhysics,
  RAMP_WALL_SAFETY,
} from '../src/game/RampWallSafetySkillStreetPhysics.js';
import { DeckAwareRampExitSkillStreetPhysics } from '../src/game/DeckAwareRampExitSkillStreetPhysics.js';
import { resolveTransferFlightStep } from '../src/game/core/TransferFlightResult.js';

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

function frame() {
  return {
    lipPoint: new THREE.Vector3(0, 2, 0),
    deckOutward: new THREE.Vector3(0, 0, -1),
    rampInward: new THREE.Vector3(0, 0, 1),
    copingTangent: new THREE.Vector3(1, 0, 0),
    returnTarget: new THREE.Vector3(0, 1.965, 0.32),
  };
}

function genericAir({ apexPassed = false } = {}) {
  return {
    frame: frame(),
    exitControl: {
      horizontalSpeed: 4.4,
      verticalSpeed: 5.2,
      targetDistance: 1.65,
    },
    lateralVelocity: 1.1,
    age: 0.22,
    apexPassed,
    returnError: 1.2,
  };
}

function deckAir({ abortToReturn = false, apexPassed = false } = {}) {
  return {
    frame: frame(),
    exitControl: {
      geometryAware: true,
      abortToReturn,
      horizontalSpeed: 2.2,
      verticalSpeed: 5.2,
      targetDistance: abortToReturn ? 0.32 : 0.82,
      targetPoint: abortToReturn
        ? new THREE.Vector3(0, 1.965, 0.32)
        : new THREE.Vector3(0, 2, -0.82),
      startDistance: 0.22,
      endDistance: 1.5,
    },
    lateralVelocity: -0.75,
    age: 0.31,
    apexPassed,
    returnError: 0.9,
  };
}

function cloneAir(air) {
  return {
    ...air,
    frame: Object.fromEntries(Object.entries(air.frame).map(([key, value]) => [
      key,
      value?.clone?.() || value,
    ])),
    exitControl: Object.fromEntries(Object.entries(air.exitControl).map(([key, value]) => [
      key,
      value?.clone?.() || value,
    ])),
  };
}

function near(actual, expected, epsilon = 1e-10, message = '') {
  assert.ok(Math.abs(actual - expected) <= epsilon,
    message || `expected ${actual} ~= ${expected}`);
}

function vectorNear(actual, expected, epsilon = 1e-10) {
  near(actual.x, expected.x, epsilon, 'x differs');
  near(actual.y, expected.y, epsilon, 'y differs');
  near(actual.z, expected.z, epsilon, 'z differs');
}

function rampController() {
  return new RampWallSafetySkillStreetPhysics({
    collision: flatWorld(), spawn: [0, 0.5, 0], rails: [],
  });
}

function deckController() {
  return new DeckAwareRampExitSkillStreetPhysics({
    collision: flatWorld(), spawn: [0, 0.5, 0], rails: [],
  });
}

function compareCanonicalStep({ controller, air, position, velocity, dt }) {
  const sourceAir = cloneAir(air);
  const sourcePosition = position.clone();
  const sourceVelocity = velocity.clone();
  const expected = resolveTransferFlightStep({
    air: sourceAir,
    position: sourcePosition,
    velocity: sourceVelocity,
    dt,
    config: RAMP_WALL_SAFETY,
  });

  controller.position.copy(position);
  controller.velocity.copy(velocity);
  const runtimeAir = cloneAir(air);
  controller.advanceControlledTransfer(runtimeAir, dt);

  assert.equal(expected.active, true);
  near(runtimeAir.age, expected.age);
  assert.equal(runtimeAir.apexPassed, expected.apexPassed);
  near(runtimeAir.returnError, expected.returnError);
  vectorNear(controller.velocity, expected.velocity);
  return expected;
}

test('DeckAware is a compatibility alias over the single transfer-flight authority', () => {
  assert.equal(
    DeckAwareRampExitSkillStreetPhysics,
    RampWallSafetySkillStreetPhysics,
    'verified deck catch must not create a second transfer-flight prototype level',
  );
  assert.equal(
    DeckAwareRampExitSkillStreetPhysics.prototype.advanceControlledTransfer,
    RampWallSafetySkillStreetPhysics.prototype.advanceControlledTransfer,
  );
});

test('generic pre-apex transfer matches canonical fixed-step behavior', () => {
  const expected = compareCanonicalStep({
    controller: rampController(),
    air: genericAir({ apexPassed: false }),
    position: new THREE.Vector3(0.12, 2.8, -0.62),
    velocity: new THREE.Vector3(0.4, 2.1, -3.8),
    dt: 1 / 120,
  });
  assert.equal(expected.branch, 'generic');
  assert.equal(expected.apexPassed, false);
});

test('generic post-apex transfer matches canonical fixed-step behavior', () => {
  const expected = compareCanonicalStep({
    controller: rampController(),
    air: genericAir({ apexPassed: true }),
    position: new THREE.Vector3(-0.08, 2.35, -1.22),
    velocity: new THREE.Vector3(-0.2, -1.4, -2.2),
    dt: 1 / 120,
  });
  assert.equal(expected.branch, 'generic');
  assert.equal(expected.apexPassed, true);
});

test('geometry-aware deck target uses the same inherited pre-apex flight authority', () => {
  const expected = compareCanonicalStep({
    controller: deckController(),
    air: deckAir({ abortToReturn: false, apexPassed: false }),
    position: new THREE.Vector3(0.10, 2.6, -0.30),
    velocity: new THREE.Vector3(0.3, 1.8, -1.4),
    dt: 1 / 120,
  });
  assert.equal(expected.branch, 'deck-target');
});

test('geometry-aware deck target uses the same inherited post-apex flight authority', () => {
  const expected = compareCanonicalStep({
    controller: deckController(),
    air: deckAir({ abortToReturn: false, apexPassed: true }),
    position: new THREE.Vector3(0.05, 2.32, -0.62),
    velocity: new THREE.Vector3(0.2, -1.3, -0.9),
    dt: 1 / 120,
  });
  assert.equal(expected.branch, 'deck-target');
});

test('abort-to-return uses the same inherited post-apex flight authority', () => {
  const expected = compareCanonicalStep({
    controller: deckController(),
    air: deckAir({ abortToReturn: true, apexPassed: true }),
    position: new THREE.Vector3(-0.10, 2.28, -0.18),
    velocity: new THREE.Vector3(-0.3, -1.2, -0.5),
    dt: 1 / 120,
  });
  assert.equal(expected.branch, 'abort-return');
});

test('abort-to-return uses the same inherited rising flight authority', () => {
  const expected = compareCanonicalStep({
    controller: deckController(),
    air: deckAir({ abortToReturn: true, apexPassed: false }),
    position: new THREE.Vector3(0.06, 2.7, -0.15),
    velocity: new THREE.Vector3(0.4, 1.6, -0.7),
    dt: 1 / 120,
  });
  assert.equal(expected.branch, 'abort-return');
  assert.equal(expected.apexPassed, false);
});

test('pure flight result does not mutate air, position or velocity inputs', () => {
  const air = deckAir({ abortToReturn: false, apexPassed: false });
  const beforeAir = cloneAir(air);
  const position = new THREE.Vector3(0.1, 2.6, -0.3);
  const velocity = new THREE.Vector3(0.2, 1.8, -1.1);
  const beforePosition = position.clone();
  const beforeVelocity = velocity.clone();

  resolveTransferFlightStep({
    air,
    position,
    velocity,
    dt: 1 / 120,
    config: RAMP_WALL_SAFETY,
  });

  near(air.age, beforeAir.age);
  assert.equal(air.apexPassed, beforeAir.apexPassed);
  near(air.returnError, beforeAir.returnError);
  vectorNear(position, beforePosition);
  vectorNear(velocity, beforeVelocity);
});
