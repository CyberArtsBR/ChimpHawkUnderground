import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { RailNetwork } from '../src/game/RailNetwork.js';
import { applyGrindEntry, resolveGrindCapture } from '../src/game/core/GrindCaptureController.js';
import { SkillStreetPhysics } from '../src/game/SkillStreetPhysics.js';
import { grindProfile, createBalanceState } from '../src/game/SkateSystems.js';

const network = () => new RailNetwork([
  { name: 'handrail', radius: 0.055, points: [[0, 0.8, 3], [0, 0.8, -7]] },
]);

test('aaa03: nearest and nearby agree on chosen rail and contact', () => {
  const rails = network();
  const position = new THREE.Vector3(0.1, 0.99, 1);
  assert.equal(rails.nearest(position).rail, rails.nearby(position)[0].rail);
  assert.equal(rails.nearest(position).s, rails.nearby(position)[0].s);
});

test('aaa03: a legitimate high-speed rail capture preserves projected speed', () => {
  const rails = network();
  const capture = resolveGrindCapture({
    position: new THREE.Vector3(0.03, 1.02, 1.25),
    forward: new THREE.Vector3(0, 0, -1),
    velocity: new THREE.Vector3(0, -0.3, -10),
    railNetwork: rails, trick: { name: '50-50', points: 150 },
  });
  assert.ok(capture);
  assert.ok(capture.speed >= 9.9);
});

test('aaa03: same-rail reentry requires actual clearance after exit', () => {
  const rails = network(), rail = rails.rails[0], trick = { name: '50-50', points: 150 };
  const initial = new THREE.Vector3(0, 1.02, 1);
  const runtime = {
    position: initial.clone(), velocity: new THREE.Vector3(0, -0.2, -6),
    heading: 0, railNetwork: rails, grounded: false,
    recordTrick() { return { name: '50-50' }; },
  };
  const capture = {
    rail, s: 2.0, profile: grindProfile('50-50'), speed: 6,
    direction: 1, captureMode: 'strict',
  };
  assert.equal(applyGrindEntry(runtime, capture, trick), true);
  assert.equal(runtime.grind.scoreEntry.name, '50-50');
  runtime.grind = null;
  runtime.grindReentryGuard = { rail, position: initial.clone() };
  assert.equal(applyGrindEntry(runtime, capture, trick), false);
  runtime.position.z -= 1.2;
  assert.equal(applyGrindEntry(runtime, capture, trick), true);
});

test('aaa03: rail switch requires movement and rejects instant reversal', () => {
  const runtime = Object.create(SkillStreetPhysics.prototype);
  const awarded = [];
  runtime.grind = {
    trick: { name: '50-50' }, profile: grindProfile('50-50'),
    s: 0.1, time: 0.20, travelDistance: 0.4, lastSwitchTravel: 0,
    lastSwitchTime: 0, trickSwitchCount: 0, balanceState: createBalanceState(),
  };
  runtime.recordTrick = (name) => { awarded.push(name); return { name }; };
  runtime.handleEvents({ grindChange: { name: '5-0', points: 200 } });
  assert.deepEqual(awarded, []);
  runtime.grind.time = 0.4;
  runtime.grind.travelDistance = 0.6;
  runtime.handleEvents({ grindChange: { name: '5-0', points: 200 } });
  assert.deepEqual(awarded, ['5-0']);
  runtime.grind.time = 0.8;
  runtime.grind.travelDistance = 1.2;
  runtime.handleEvents({ grindChange: { name: '50-50', points: 150 } });
  assert.deepEqual(awarded, ['5-0'], 'second switch needs more travel');
});

test('aaa03: cancelled manual clears duration attribution', () => {
  const runtime = Object.create(SkillStreetPhysics.prototype);
  runtime.manual = 'manual';
  runtime.grounded = true;
  runtime.manualBalanceState = createBalanceState();
  runtime.manualScoreEntry = { name: 'Manual' };
  runtime.stableGroundTime = 0;
  runtime.setMovementState = () => {};
  runtime.endManual();
  assert.equal(runtime.manual, null);
  assert.equal(runtime.manualScoreEntry, null);
});
