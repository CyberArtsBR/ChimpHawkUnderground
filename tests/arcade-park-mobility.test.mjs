import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  ARCADE_PARK_MOBILITY,
  arcadeGrindEligibility,
  arcadeTurnGain,
  rampReentrySteerScale,
  transitionReturnBoardDirection,
} from '../src/game/ArcadeParkMobilitySkillStreetPhysics.js';
import {
  LAUNCH_ENERGY,
  rampLaunchBonus,
} from '../src/game/core/LaunchEnergyModel.js';
import { grindProfile } from '../src/game/SkateSystems.js';

test('THPS rail magnet catches an ascending rider below a handrail', () => {
  const eligible = arcadeGrindEligibility({
    surfaceDistance: 0.38,
    verticalDelta: -0.30,
    velocityY: 2.6,
    tangentAlignment: 0.78,
    tangentSpeed: 6.2,
    profile: grindProfile('50-50'),
  });
  assert.equal(eligible, true);
  assert.ok(ARCADE_PARK_MOBILITY.railCaptureDistance >= 0.5);
  assert.ok(ARCADE_PARK_MOBILITY.railCaptureBelow >= 0.4);
});

test('rail magnet still rejects rails that are clearly out of reach', () => {
  assert.equal(arcadeGrindEligibility({
    surfaceDistance: 0.68,
    verticalDelta: -0.25,
    velocityY: 1.5,
    tangentAlignment: 0.8,
    tangentSpeed: 5,
    profile: grindProfile('50-50'),
  }), false);
});

test('single launch energy model adds real airtime on a small rising ramp', () => {
  const boost = rampLaunchBonus({ speed: 9.5, normalY: 0.86, verticalSpeed: 2.1 });
  assert.ok(boost >= 3.0, `expected useful small-ramp boost, got ${boost}`);
});

test('steep fast ramp gets more launch energy than a shallow slower ramp', () => {
  const shallow = rampLaunchBonus({ speed: 7, normalY: 0.91, verticalSpeed: 1.2 });
  const steep = rampLaunchBonus({ speed: 12.5, normalY: 0.42, verticalSpeed: 5.5 });
  assert.ok(steep > shallow, `steep ${steep} should exceed shallow ${shallow}`);
  assert.ok(steep <= LAUNCH_ENERGY.boostMax + 1e-9);
});

test('flat ground and descending ramps do not receive ramp launch bonus', () => {
  assert.equal(rampLaunchBonus({ speed: 12, normalY: 1, verticalSpeed: 0 }), 0);
  assert.equal(rampLaunchBonus({ speed: 12, normalY: 0.6, verticalSpeed: -1 }), 0);
});

test('park-speed steering gain produces a much tighter carve', () => {
  const low = arcadeTurnGain(2);
  const park = arcadeTurnGain(12.5);
  assert.ok(low >= 1.5);
  assert.ok(park >= 1.7, `park-speed gain too weak: ${park}`);
  assert.ok(park > low);
});

test('steep ramp return heading is locked to authored ramp axis, not tiny lateral drift', () => {
  const direction = transitionReturnBoardDirection({
    rampInward: new THREE.Vector3(0, 0, 1),
    fallbackTravel: new THREE.Vector3(1, 0, 0.02),
    rollingSign: 1,
    airSpin: 0,
  });
  assert.ok(direction.z > 0.999, `expected ramp-axis return, got ${direction.toArray()}`);
  assert.ok(Math.abs(direction.x) < 1e-6, `lateral drift leaked into heading: ${direction.x}`);
});

test('180 return keeps same ramp travel axis but reverses deck facing', () => {
  const regular = transitionReturnBoardDirection({
    rampInward: new THREE.Vector3(0, 0, 1),
    rollingSign: 1,
    airSpin: 0,
  });
  const oneEighty = transitionReturnBoardDirection({
    rampInward: new THREE.Vector3(0, 0, 1),
    rollingSign: 1,
    airSpin: Math.PI,
  });
  assert.ok(regular.dot(oneEighty) < -0.999);
});

test('ramp re-entry hard-locks steering first, then blends tight carving back in', () => {
  const total = ARCADE_PARK_MOBILITY.rampReentrySteerLock;
  const early = rampReentrySteerScale(total - 0.03);
  const middle = rampReentrySteerScale(total - 0.13);
  const done = rampReentrySteerScale(0);
  assert.equal(early, 0);
  assert.ok(middle > 0 && middle < 1, `expected blend scale, got ${middle}`);
  assert.equal(done, 1);
});
