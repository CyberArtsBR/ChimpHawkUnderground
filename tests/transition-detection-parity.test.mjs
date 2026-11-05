import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import { TransitionGuide } from '../src/game/TransitionGuide.js';
import { TransitionController } from '../src/game/transitions/TransitionController.js';

const manifest = JSON.parse(fs.readFileSync(
  new URL('../public/assets/park/park-manifest.json', import.meta.url),
  'utf8',
));

function assertVectorParity(actual, expected, label) {
  assert.ok(actual && expected, `${label} missing vector`);
  assert.ok(actual.distanceTo(expected) < 1e-10,
    `${label} mismatch: ${actual.toArray()} vs ${expected.toArray()}`);
}

function assertCandidateParity(actual, expected, label) {
  assert.equal(Boolean(actual), Boolean(expected), `${label} presence mismatch`);
  if (!actual || !expected) return;
  assert.equal(actual.name, expected.name, `${label} source rail mismatch`);
  assert.ok(Math.abs(actual.gap - expected.gap) < 1e-10, `${label} gap mismatch`);
  assertVectorParity(actual.lipPoint, expected.lipPoint, `${label}.lipPoint`);
  assertVectorParity(actual.copingTangent, expected.copingTangent, `${label}.copingTangent`);
  assertVectorParity(actual.rampInward, expected.rampInward, `${label}.rampInward`);
  assertVectorParity(actual.deckOutward, expected.deckOutward, `${label}.deckOutward`);
  assertVectorParity(actual.surfaceNormal, expected.surfaceNormal, `${label}.surfaceNormal`);
}

function sampleForTransition(transition) {
  const a = transition.lipPath[0];
  const b = transition.lipPath[1];
  const tangent = b.clone().sub(a).setY(0).normalize();
  const rampInward = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();
  const deckOutward = rampInward.clone().negate();
  const lip = a.clone().lerp(b, 0.5);
  const position = lip.clone().addScaledVector(rampInward, 0.18);
  position.y -= 0.10;
  const normal = rampInward.clone().multiplyScalar(0.57)
    .addScaledVector(new THREE.Vector3(0, 1, 0), 0.82)
    .normalize();
  const velocity = deckOutward.clone().multiplyScalar(6.2)
    .add(new THREE.Vector3(0, 4.4, 0));
  return { position, normal, velocity };
}

test('canonical approach/launch detection matches legacy geometry on all authored park transitions', () => {
  const controller = new TransitionController({ rails: manifest.rails });
  const vertTransitions = controller.transitions.filter(transition => transition.supportsVert);
  const vertRails = controller.rails.filter(rail => controller.forRail(rail.name)?.supportsVert);
  const legacy = new TransitionGuide(vertRails);
  assert.equal(controller.transitions.length, 8);
  assert.equal(vertTransitions.length, 5);

  for (const transition of vertTransitions) {
    const { position, normal, velocity } = sampleForTransition(transition);
    const canonicalApproach = controller.approachAt(position, normal, velocity);
    const legacyApproach = legacy.approachAt(position, normal, velocity);
    assertCandidateParity(canonicalApproach, legacyApproach, `${transition.id}.approach`);

    const canonicalLaunch = controller.launchAt(position, normal, velocity);
    const legacyLaunch = legacy.launchAt(position, normal, velocity);
    assertCandidateParity(canonicalLaunch, legacyLaunch, `${transition.id}.launch`);

    assert.equal(canonicalLaunch?.transitionId, transition.id);
    assert.equal(canonicalLaunch?.transitionType, transition.type);
  }
});

test('canonical detection preserves legacy rejection rules', () => {
  const controller = new TransitionController({ rails: manifest.rails });
  const vertRails = controller.rails.filter(rail => controller.forRail(rail.name)?.supportsVert);
  const legacy = new TransitionGuide(vertRails);
  const transition = controller.get('eastern-quarter');
  const sample = sampleForTransition(transition);

  const flatNormal = new THREE.Vector3(0, 1, 0);
  assertCandidateParity(
    controller.launchAt(sample.position, flatNormal, sample.velocity),
    legacy.launchAt(sample.position, flatNormal, sample.velocity),
    'flat-normal rejection',
  );

  const descending = sample.velocity.clone();
  descending.y = -1;
  assertCandidateParity(
    controller.launchAt(sample.position, sample.normal, descending),
    legacy.launchAt(sample.position, sample.normal, descending),
    'descending rejection',
  );

  const wrongWay = sample.velocity.clone().setY(0).negate();
  wrongWay.y = 4;
  assertCandidateParity(
    controller.launchAt(sample.position, sample.normal, wrongWay),
    legacy.launchAt(sample.position, sample.normal, wrongWay),
    'alignment rejection',
  );
});
