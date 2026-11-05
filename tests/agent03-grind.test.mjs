import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { RailNetwork } from '../src/game/RailNetwork.js';
import { SkillStreetPhysics } from '../src/game/SkillStreetPhysics.js';
import { advanceGrindSpeed, createBalanceState, grindProfile, contactLongitudinalOffsets, GRIND_CAPTURE } from '../src/game/SkateSystems.js';
import { applyGrindEntry, resolveGrindCapture } from '../src/game/core/GrindCaptureController.js';

function straightRail() {
  return new RailNetwork([{ name: 'Agent03 test rail', radius: 0.055, points: [[0, 0.8, 2.5], [0, 0.8, -6]] }]);
}
function approach(velocity) {
  return {
    position: new THREE.Vector3(0.04, 1.02, 1.25),
    forward: new THREE.Vector3(0, 0, -1),
    velocity,
    railNetwork: straightRail(),
    trick: { name: '50-50', points: 150 },
  };
}

test('agent03: low-speed valid capture preserves projected entry speed', () => {
  const ctx = approach(new THREE.Vector3(0, -0.35, -0.21));
  const capture = resolveGrindCapture(ctx);
  assert.ok(capture, 'aligned and close low-speed approach should capture');
  assert.ok(capture.speed === 0.21);
  assert.equal(GRIND_CAPTURE.antiStallSpeed, 0);
  let recorded = 0;
  const runtime = {
    position: ctx.position.clone(), velocity: ctx.velocity.clone(),
    heading: 0, railNetwork: ctx.railNetwork,
    recordTrick() { recorded++; },
  };
  assert.equal(applyGrindEntry(runtime, capture, ctx.trick), true);
  assert.ok(runtime.grind.speed === 0.21);
  assert.equal(recorded, 1);
});

test('agent03: high-speed aligned capture retains projected tangent speed', () => {
  const capture = resolveGrindCapture(approach(new THREE.Vector3(0, -0.35, -9.2)));
  assert.ok(capture);
  assert.ok(Math.abs(capture.speed - 9.2) < 1e-6);
});

test('agent03: perpendicular 50-50 approach cannot magnetize to the rail', () => {
  const capture = resolveGrindCapture(approach(new THREE.Vector3(8, -0.35, -0.01)));
  assert.equal(capture, null);
});

test('agent03: contact profiles distinguish both trucks, rear truck and transverse slides', () => {
  assert.equal(contactLongitudinalOffsets('50-50').length, 2);
  assert.ok(contactLongitudinalOffsets('5-0')[0] < 0);
  assert.equal(contactLongitudinalOffsets('Boardslide')[0], 0);
  assert.ok(Math.abs(grindProfile('Boardslide').presentation.yaw) > 1.5);
});

test('agent03: curved rail tangent stays continuous at an authored vertex', () => {
  const network = new RailNetwork([{
    points: [[0, 0.8, 2], [0, 0.8, 0], [2, 0.8, 0]],
  }]);
  const rail = network.rails[0];
  const before = network.sample(rail, 1.999);
  const after = network.sample(rail, 2.001);
  assert.ok(before && after);
  assert.ok(before.tangent.dot(after.tangent) > 0.99,
    'tangent discontinuity at rail vertex would snap board heading');
  assert.ok(before.point.distanceTo(new THREE.Vector3(0, before.point.y, 0.001)) < 1e-5);
  assert.ok(after.point.distanceTo(new THREE.Vector3(0.001, after.point.y, 0)) < 1e-5);
});

test('agent03: an open rail has no sample beyond its endpoint', () => {
  const network = straightRail();
  const rail = network.rails[0];
  assert.ok(network.sample(rail, rail.length - 0.01));
  assert.equal(network.sample(rail, rail.length + 0.01), null);
});

test('agent03: a near-stalled grind receives minimum speed and acceleration', () => {
  const next = advanceGrindSpeed(.101, 0, 1 / 60);
  assert.ok(next > GRIND_CAPTURE.antiStallSpeed);
});

test('agent03: grind-trick switching needs actual time and distance to prevent multiplier spam', () => {
  const simulation = Object.create(SkillStreetPhysics.prototype);
  simulation.grind = {
    trick: { name: '50-50' }, profile: grindProfile('50-50'), s: 0.1, time: 0.08,
    lastSwitchS: 0, lastSwitchTime: 0, instability: 0,
    balanceState: createBalanceState(1.18),
  };
  const awarded = [];
  simulation.recordTrick = (name) => { awarded.push(name); };
  simulation.handleEvents({ grindChange: { name: '5-0', points: 200 } });
  assert.equal(awarded.length, 0, 'stationary rapid trick swapping should not score');
  simulation.grind.time = 0.4;
  simulation.grind.s = 0.6;
  simulation.handleEvents({ grindChange: { name: '5-0', points: 200 } });
  assert.deepEqual(awarded, ['5-0']);
  simulation.handleEvents({ grindChange: { name: '50-50', points: 150 } });
  assert.equal(awarded.length, 1, 'immediate reversal should not score twice');
});
