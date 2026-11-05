import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import {
  TRANSITION_TYPE,
  compileTransitionMetadata,
  transitionMetadataCoverage,
} from '../src/game/transitions/TransitionMetadata.js';
import {
  TransitionController,
  authoredTransitionIdentity,
} from '../src/game/transitions/TransitionController.js';
import { appendExtensionHalfpipeRails } from '../src/park/ExpandedPark.js';

const manifest = JSON.parse(fs.readFileSync(
  new URL('../public/assets/park/park-manifest.json', import.meta.url),
  'utf8',
));
const runtimeManifest = JSON.parse(JSON.stringify(manifest));
appendExtensionHalfpipeRails(runtimeManifest);

test('current production park has explicit metadata for every authored transition anchor', () => {
  const coverage = transitionMetadataCoverage(runtimeManifest.rails);
  assert.equal(coverage.complete, true, JSON.stringify(coverage));
  assert.equal(coverage.authoredCount, 12);
  assert.equal(coverage.presentAuthoredCount, 12);
  assert.deepEqual(coverage.missingAuthoredRails, []);
  assert.deepEqual(coverage.unclassifiedCopingRails, []);
});

test('production transition metadata classifies vert and non-vert park areas explicitly', () => {
  const transitions = compileTransitionMetadata(runtimeManifest.rails);
  const byId = new Map(transitions.map(transition => [transition.id, transition]));

  assert.equal(transitions.length, 12);
  assert.equal(byId.get('bowl-main')?.type, TRANSITION_TYPE.BOWL);
  assert.equal(byId.get('western-vert')?.type, TRANSITION_TYPE.VERT);
  assert.equal(byId.get('rear-mini-north')?.type, TRANSITION_TYPE.MINI);
  assert.equal(byId.get('rear-mini-south')?.type, TRANSITION_TYPE.MINI);
  assert.equal(byId.get('eastern-quarter')?.type, TRANSITION_TYPE.QUARTER);
  assert.equal(byId.get('central-hip')?.type, TRANSITION_TYPE.HIP);
  assert.equal(byId.get('south-spine')?.type, TRANSITION_TYPE.SPINE);
  assert.equal(byId.get('east-bank')?.type, TRANSITION_TYPE.BANK);
  assert.equal(byId.get('extension-halfpipe-1-west')?.type, TRANSITION_TYPE.VERT);
  assert.equal(byId.get('extension-halfpipe-1-east')?.type, TRANSITION_TYPE.VERT);
  assert.equal(byId.get('extension-halfpipe-2-west')?.type, TRANSITION_TYPE.VERT);
  assert.equal(byId.get('extension-halfpipe-2-east')?.type, TRANSITION_TYPE.VERT);
  assert.equal(byId.get('central-hip')?.supportsVert, false);
  assert.equal(byId.get('south-spine')?.supportsVert, false);
  assert.equal(byId.get('east-bank')?.supportsVert, false);
});

test('named park-area rails become semantic anchors while unrelated grind rails stay grind-only', () => {
  const transitions = compileTransitionMetadata(runtimeManifest.rails);
  const bySource = new Map(transitions.map(transition => [transition.sourceRail, transition]));

  assert.equal(bySource.get('05 / hip rail')?.geometryRole, 'AREA_ANCHOR');
  assert.equal(bySource.get('10 / spine handrail')?.geometryRole, 'AREA_ANCHOR');
  assert.equal(bySource.get('11 / bank handrail')?.geometryRole, 'AREA_ANCHOR');

  assert.equal(bySource.has('07 / angled rail'), false);
  assert.equal(bySource.has('08 / downrail'), false);
  assert.equal(bySource.has('13 / flat bar'), false);
});

test('compiled metadata includes deterministic lip bounds center and axis semantics', () => {
  const transitions = compileTransitionMetadata(runtimeManifest.rails);
  const western = transitions.find(transition => transition.id === 'western-vert');
  const bowl = transitions.find(transition => transition.id === 'bowl-main');

  assert.ok(western.transitionAxis?.length() > 0.999);
  assert.equal(bowl.transitionAxis, null);
  assert.ok(western.bounds.min.x <= western.bounds.max.x);
  assert.ok(western.bounds.min.y <= western.bounds.max.y);
  assert.ok(western.bounds.min.z <= western.bounds.max.z);
  assert.ok(Number.isFinite(western.center.x));
  assert.ok(Number.isFinite(western.lipHeight));
});

test('shadow controller finds the nearest explicit transition lip without mutating physics', () => {
  const controller = new TransitionController({ rails: runtimeManifest.rails });
  const western = controller.get('western-vert');
  assert.ok(western);

  const sample = western.lipPath[0].clone().add(new THREE.Vector3(0.18, 0.12, 0.08));
  const nearest = controller.nearestLip(sample, 1);
  assert.equal(nearest?.transition.id, 'western-vert');
  assert.ok(nearest.gap < 0.25);
  assert.ok(Number.isFinite(nearest.verticalDelta));
});

test('legacy coping candidate maps to canonical transition id by exact authored source name', () => {
  const controller = new TransitionController({ rails: runtimeManifest.rails });
  assert.deepEqual(controller.inspectLegacyCandidate({ name: '04 / eastern quarter coping' }), {
    sourceName: '04 / eastern quarter coping',
    transitionId: 'eastern-quarter',
    type: TRANSITION_TYPE.QUARTER,
    supportsVert: true,
    supportsTransfer: true,
    supportsPump: true,
    mapped: true,
  });
  assert.equal(controller.inspectLegacyCandidate({ name: '07 / angled rail' }).mapped, false);
  const hip = controller.inspectLegacyCandidate({ name: '05 / hip rail' });
  assert.equal(hip.mapped, true);
  assert.equal(hip.type, TRANSITION_TYPE.HIP);
  assert.equal(hip.supportsVert, false);
});

test('semantic bridge classifies legacy transitionAir without requiring geometry mutation', () => {
  assert.deepEqual(authoredTransitionIdentity({ copingName: '02 / western vert wall coping' }), {
    sourceName: '02 / western vert wall coping',
    transitionId: 'western-vert',
    type: TRANSITION_TYPE.VERT,
    supportsVert: true,
    supportsTransfer: true,
    supportsPump: true,
    mapped: true,
  });
  assert.equal(authoredTransitionIdentity({ copingName: 'anything coping' }).mapped, false);
});


test('non-vert transition anchors can never enter vert lip detection', () => {
  const controller = new TransitionController({ rails: runtimeManifest.rails });
  const hip = controller.get('central-hip');
  const bank = controller.get('east-bank');
  const spine = controller.get('south-spine');
  assert.ok(hip && bank && spine);

  for (const transition of [hip, bank, spine]) {
    const sample = transition.lipPath[0].clone();
    const near = controller.nearestLip(sample, 0.5);
    assert.notEqual(near?.transition?.id, transition.id,
      `${transition.id} must not be exposed as a vert lip`);

    const normal = new THREE.Vector3(0, 0.6, 0.8).normalize();
    const velocity = new THREE.Vector3(0, 4, -6);
    const candidate = controller.launchAt(sample, normal, velocity);
    assert.notEqual(candidate?.transitionId, transition.id,
      `${transition.id} must not become transitionAir`);
  }
});
