import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { TransitionGuide, wantsRampExit } from '../src/game/TransitionGuide.js';
import { authoredTransitionRails } from '../src/game/transitions/TransitionController.js';
import { shouldReleaseRampLip } from '../src/game/StableBoardContactSkillStreetPhysics.js';
import { shouldBufferRampExit } from '../src/game/MomentumRollSkillStreetPhysics.js';

test('vert exit is explicit; forward hold never requests transfer', () => {
  assert.equal(wantsRampExit({ vertExit: true }), true);
  assert.equal(wantsRampExit({ drive: 1 }, { apexPassed: true }), false);
  assert.equal(wantsRampExit({ directionTaps: ['up'] }, { apexPassed: false }), false);
  assert.equal(wantsRampExit({ directionTaps: ['up'] }, { apexPassed: true }), true);
});

test('explicit vert exit only buffers while actually climbing a sloped surface', () => {
  assert.equal(shouldBufferRampExit({ vertExit: true, normalY: 0.86, verticalSpeed: 4 }), true);
  assert.equal(shouldBufferRampExit({ vertExit: true, normalY: 1, verticalSpeed: 4 }), false);
  assert.equal(shouldBufferRampExit({ vertExit: true, normalY: 0.86, verticalSpeed: -1 }), false);
  assert.equal(shouldBufferRampExit({ vertExit: false, normalY: 0.86, verticalSpeed: 4 }), false);
});

test('regular riding releases when front truck clears an uphill lip', () => {
  assert.equal(shouldReleaseRampLip({
    normalY: 0.82,
    verticalSpeed: 3.2,
    speed: 9,
    contactCount: 2,
    frontSupported: 0,
    rearSupported: 2,
    travelSign: 1,
  }), true);
});

test('fakie riding releases when rear truck clears an uphill lip', () => {
  assert.equal(shouldReleaseRampLip({
    normalY: 0.82,
    verticalSpeed: 3.2,
    speed: 9,
    contactCount: 2,
    frontSupported: 2,
    rearSupported: 0,
    travelSign: -1,
  }), true);
});

test('flat seams and downhill partial contacts never masquerade as ramp takeoff', () => {
  assert.equal(shouldReleaseRampLip({
    normalY: 1,
    verticalSpeed: 2,
    speed: 9,
    contactCount: 2,
    frontSupported: 0,
    rearSupported: 2,
    travelSign: 1,
  }), false);
  assert.equal(shouldReleaseRampLip({
    normalY: 0.82,
    verticalSpeed: -2,
    speed: 9,
    contactCount: 2,
    frontSupported: 0,
    rearSupported: 2,
    travelSign: 1,
  }), false);
});

test('authored coping accepts a realistic averaged wheel normal and buffered Up launches outward', () => {
  const guide = new TransitionGuide(authoredTransitionRails([{
    name: '04 / eastern quarter coping',
    points: [[-3, 2, 0], [3, 2, 0]],
  }]));
  const position = new THREE.Vector3(0, 1.72, 0.34);
  const normal = new THREE.Vector3(0, 0.82, 0.57).normalize();
  const velocity = new THREE.Vector3(0, 5.1, -7.4);
  const edge = guide.launchAt(position, normal, velocity);
  assert.ok(edge, 'authored transition capture should tolerate averaged wheel normal');
  edge.exitRequested = true;
  const air = guide.begin(position, velocity, edge, { boardForward: new THREE.Vector3(0, 0, -1) });
  assert.equal(air.transferring, true);
  assert.ok(velocity.clone().setY(0).dot(edge.deckOutward) > 4.5, 'launch should begin outward, not inward');
  assert.ok(velocity.y > 3, 'outward transfer must retain usable airtime');
});

test('transition controller rejects arbitrary coping names before geometry guide sees them', () => {
  const rails = authoredTransitionRails([{
    name: 'Random coping decoration',
    points: [[-3, 2, 0], [3, 2, 0]],
  }]);
  assert.equal(rails.length, 0);
  const guide = new TransitionGuide(rails);
  assert.equal(guide.edges.length, 0);
});

test('geometry guide itself is semantic-agnostic after Phase 1 handoff', () => {
  const guide = new TransitionGuide([{
    name: 'synthetic test lip',
    points: [[-3, 2, 0], [3, 2, 0]],
  }]);
  assert.equal(guide.edges.length, 1);
});
