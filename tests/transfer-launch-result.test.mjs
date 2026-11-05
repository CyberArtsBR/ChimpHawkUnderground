import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  RAMP_WALL_SAFETY,
  controlledTransferProfile,
} from '../src/game/RampWallSafetySkillStreetPhysics.js';
import {
  DECK_AWARE_EXIT,
  deckAwareLaunchSpeed,
} from '../src/game/DeckAwareRampExitSkillStreetPhysics.js';
import {
  SAFE_COPING_EXIT,
  deckCanFitBoard,
} from '../src/game/SafeCopingExitSkillStreetPhysics.js';
import { PHYSICS } from '../src/game/StreetPhysics.js';
import {
  resolveControlledTransferLaunch,
  resolveDeckAwareTransferLaunch,
  resolveSafeCopingTransferLaunch,
  resolveTransferLaunchResult,
  transferDeckCanFit,
} from '../src/game/core/TransferLaunchResult.js';

function frame() {
  return {
    lipPoint: new THREE.Vector3(0, 2, 0),
    deckOutward: new THREE.Vector3(0, 0, -1),
    rampInward: new THREE.Vector3(0, 0, 1),
    copingTangent: new THREE.Vector3(1, 0, 0),
    returnTarget: new THREE.Vector3(0, 1.965, 0.26),
  };
}

function deck({ width = 1.65, targetDistance = 0.78 } = {}) {
  return {
    found: true,
    direction: new THREE.Vector3(0, 0, -1),
    startDistance: 0.30,
    endDistance: 0.30 + width,
    usableWidth: width,
    targetDistance,
    targetPoint: new THREE.Vector3(0, 2, -targetDistance),
    targetNormal: new THREE.Vector3(0, 1, 0),
  };
}

function near(actual, expected, epsilon = 1e-9, message = '') {
  assert.ok(Math.abs(actual - expected) <= epsilon,
    message || `expected ${actual} ~= ${expected}`);
}

function vectorNear(actual, expected, epsilon = 1e-9) {
  near(actual.x, expected.x, epsilon, 'x differs');
  near(actual.y, expected.y, epsilon, 'y differs');
  near(actual.z, expected.z, epsilon, 'z differs');
}

test('controlled transfer stage matches legacy RampWallSafety profile and launch vector', () => {
  const f = frame();
  const incomingSpeed = 13.2;
  const launchVertical = 8.4;
  const lateralVelocity = 1.5;
  const legacy = controlledTransferProfile(incomingSpeed, launchVertical);
  const result = resolveControlledTransferLaunch({
    frame: f,
    incomingSpeed,
    launchVertical,
    lateralVelocity,
    config: RAMP_WALL_SAFETY,
  });

  assert.equal(result.active, true);
  near(result.exitControl.horizontalSpeed, legacy.horizontalSpeed);
  near(result.exitControl.verticalSpeed, legacy.verticalSpeed);
  near(result.exitControl.targetDistance, legacy.targetDistance);
  near(result.launchVertical, legacy.verticalSpeed);

  const expectedHorizontal = f.deckOutward.clone().multiplyScalar(legacy.horizontalSpeed)
    .addScaledVector(f.copingTangent, lateralVelocity * 0.32);
  vectorNear(result.launchHorizontal, expectedHorizontal);
  vectorNear(result.velocity, expectedHorizontal.clone().setY(legacy.verticalSpeed));
});

test('real wide deck stage matches legacy deck-aware speed and target launch', () => {
  const f = frame();
  const d = deck({ width: 1.65, targetDistance: 0.82 });
  const lateralVelocity = 1.2;
  const controlled = resolveControlledTransferLaunch({
    frame: f,
    incomingSpeed: 12,
    launchVertical: 8,
    lateralVelocity,
    config: RAMP_WALL_SAFETY,
  });
  const result = resolveDeckAwareTransferLaunch({
    plan: controlled,
    frame: f,
    deck: d,
    lateralVelocity,
    gravity: PHYSICS.gravity,
    config: DECK_AWARE_EXIT,
  });

  const expectedVertical = THREE.MathUtils.clamp(
    controlled.exitControl.verticalSpeed,
    DECK_AWARE_EXIT.launchVerticalMin,
    DECK_AWARE_EXIT.launchVerticalMax,
  );
  const expectedHorizontalSpeed = deckAwareLaunchSpeed(d.targetDistance, expectedVertical);
  near(result.launchVertical, expectedVertical);
  near(result.exitControl.horizontalSpeed, expectedHorizontalSpeed);
  assert.equal(result.exitControl.geometryAware, true);
  assert.equal(result.exitControl.abortToReturn, false);

  const expectedHorizontal = d.targetPoint.clone().sub(f.lipPoint).setY(0).normalize()
    .multiplyScalar(expectedHorizontalSpeed)
    .addScaledVector(f.copingTangent, lateralVelocity * 0.10);
  vectorNear(result.launchHorizontal, expectedHorizontal);
  vectorNear(result.velocity, expectedHorizontal.clone().setY(expectedVertical));
});

test('missing deck produces the same immediate controlled same-wall return', () => {
  const f = frame();
  const lateralVelocity = -1.4;
  const controlled = resolveControlledTransferLaunch({
    frame: f,
    incomingSpeed: 10,
    launchVertical: 7,
    lateralVelocity,
    config: RAMP_WALL_SAFETY,
  });
  const result = resolveDeckAwareTransferLaunch({
    plan: controlled,
    frame: f,
    deck: null,
    lateralVelocity,
    gravity: PHYSICS.gravity,
    config: DECK_AWARE_EXIT,
  });

  assert.equal(result.mode, 'return');
  assert.equal(result.exitControl.geometryAware, true);
  assert.equal(result.exitControl.abortToReturn, true);
  vectorNear(result.exitControl.targetPoint, f.returnTarget);
  const expected = f.rampInward.clone().multiplyScalar(0.34)
    .addScaledVector(f.copingTangent, lateralVelocity * 0.35);
  near(result.velocity.x, expected.x);
  near(result.velocity.z, expected.z);
  near(result.velocity.y, controlled.velocity.y,
    1e-9, 'missing-deck abort must retain current vertical velocity');
});

test('narrow verified deck converts transfer to safe return with legacy coping rules', () => {
  const f = frame();
  const d = deck({ width: 0.82, targetDistance: 0.54 });
  const lateralVelocity = 0.8;
  const controlled = resolveControlledTransferLaunch({
    frame: f,
    incomingSpeed: 13,
    launchVertical: 9,
    lateralVelocity,
    config: RAMP_WALL_SAFETY,
  });
  const deckAware = resolveDeckAwareTransferLaunch({
    plan: controlled,
    frame: f,
    deck: d,
    lateralVelocity,
    gravity: PHYSICS.gravity,
    config: DECK_AWARE_EXIT,
  });

  assert.equal(deckCanFitBoard(deckAware.exitControl), false);
  assert.equal(transferDeckCanFit(deckAware.exitControl, SAFE_COPING_EXIT), false);

  const result = resolveSafeCopingTransferLaunch({
    plan: deckAware,
    frame: f,
    lateralVelocity,
    config: SAFE_COPING_EXIT,
  });
  assert.equal(result.mode, 'return');
  assert.equal(result.exitControl.abortToReturn, true);
  assert.equal(result.exitControl.unsafeDeckWidth, d.usableWidth);
  vectorNear(result.exitControl.targetPoint, f.returnTarget);
  const expected = f.rampInward.clone().multiplyScalar(0.36)
    .addScaledVector(f.copingTangent, lateralVelocity * 0.28);
  near(result.velocity.x, expected.x);
  near(result.velocity.z, expected.z);
  assert.ok(result.velocity.y >= 3.2 && result.velocity.y <= 7.2);
});

test('wide verified deck survives all three transfer stages unchanged by coping safety', () => {
  const f = frame();
  const d = deck({ width: 1.8, targetDistance: 0.88 });
  const result = resolveTransferLaunchResult({
    frame: f,
    incomingSpeed: 11.5,
    launchVertical: 8.3,
    lateralVelocity: 0.45,
    deck: d,
    gravity: PHYSICS.gravity,
    transferConfig: RAMP_WALL_SAFETY,
    deckConfig: DECK_AWARE_EXIT,
    copingConfig: SAFE_COPING_EXIT,
  });

  assert.equal(deckCanFitBoard(result.exitControl), true);
  assert.equal(transferDeckCanFit(result.exitControl, SAFE_COPING_EXIT), true);
  assert.equal(result.mode, 'transfer');
  assert.equal(result.exitControl.abortToReturn, false);
  assert.equal(result.exitControl.geometryAware, true);
});

test('pure transfer model never mutates frame or deck inputs', () => {
  const f = frame();
  const d = deck({ width: 1.7, targetDistance: 0.9 });
  const beforeLip = f.lipPoint.clone();
  const beforeTarget = d.targetPoint.clone();

  resolveTransferLaunchResult({
    frame: f,
    incomingSpeed: 12,
    launchVertical: 8,
    lateralVelocity: 1,
    deck: d,
    gravity: PHYSICS.gravity,
    transferConfig: RAMP_WALL_SAFETY,
    deckConfig: DECK_AWARE_EXIT,
    copingConfig: SAFE_COPING_EXIT,
  });

  vectorNear(f.lipPoint, beforeLip);
  vectorNear(d.targetPoint, beforeTarget);
});
