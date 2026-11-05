import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { StatefulSkillStreetPhysics } from '../src/game/StatefulSkillStreetPhysics.js';
import {
  UNIFIED_RAMP_FEEL,
  unifiedRampAirBoost,
  updateRampBoostMemory,
} from '../src/game/UnifiedRampFeelSkillStreetPhysics.js';
import {
  THPS_CAMERA,
  cameraDirectionRate,
  highFollowFraming,
  smoothCameraDirection,
} from '../src/game/FollowCamera.js';

function floorWorld() {
  const root = new THREE.Group();
  const floor = new THREE.Mesh(
    new THREE.BoxGeometry(40, 0.1, 40),
    new THREE.MeshBasicMaterial(),
  );
  floor.position.y = -0.05;
  root.add(floor);
  root.updateMatrixWorld(true);
  return root;
}

test('every real climbing ramp receives a strong arcade launch target', () => {
  const bank = unifiedRampAirBoost({ speed: 8.5, normalY: 0.90, verticalSpeed: 1.5 });
  const quarter = unifiedRampAirBoost({ speed: 12.5, normalY: 0.36, verticalSpeed: 5.0 });
  assert.ok(bank >= 3.4, `bank boost should be visibly strong, got ${bank}`);
  assert.ok(quarter > bank, `quarter ${quarter} should exceed bank ${bank}`);
  assert.ok(quarter <= UNIFIED_RAMP_FEEL.boostMax + 1e-9);
});

test('ramp climb memory survives a flat final lip frame', () => {
  const sample = unifiedRampAirBoost({ speed: 10.5, normalY: 0.72, verticalSpeed: 3.4 });
  const armed = updateRampBoostMemory({ sampleBoost: sample, dt: 1 / 120 });
  const lip = updateRampBoostMemory({
    previousBoost: armed.boost,
    previousTime: armed.time,
    sampleBoost: 0,
    dt: 1 / 120,
  });
  assert.ok(lip.boost >= sample - 1e-9);
  assert.ok(lip.time > 0.25, `memory should survive the lip seam, time=${lip.time}`);
});

test('generic ramp takeoff consumes remembered boost even if takeoff normal is flat', () => {
  const p = new StatefulSkillStreetPhysics({ collision: floorWorld(), spawn: [0, 0.5, 0], rails: [] });
  p.position.set(0, 0.015, 0);
  p.normal.set(0, 1, 0);
  p.heading = 0;
  p.groundDirection();
  p.grounded = true;
  p.rampLaunchMemory = 5.2;
  p.rampLaunchMemoryTime = 0.20;
  p.velocity.set(0, 0, -8);

  p.takeoff(0, null);

  assert.ok(p.velocity.y > 5.0, `remembered ramp should produce big air, vy=${p.velocity.y}`);
  assert.equal(p.airTakeoffFromRamp, true, 'generic flat lip must keep ramp-return semantics');
});

test('camera uses slow angular recovery for a 180-degree ramp reversal', () => {
  const before = new THREE.Vector3(0, 0, -1);
  const reversed = new THREE.Vector3(0, 0, 1);
  const rate = cameraDirectionRate(before, reversed);
  assert.equal(rate, THPS_CAMERA.reverseDirectionFollowRate);

  const afterOneFrame = smoothCameraDirection(before, reversed, 1 / 60, rate);
  assert.ok(afterOneFrame.dot(before) > 0.99,
    `camera must not instantly jump behind rider on reversal: ${afterOneFrame.toArray()}`);
  assert.ok(afterOneFrame.distanceTo(reversed) > 1.8,
    'one ramp-return frame must remain on the established THPS camera side');
});

test('normal carving recenters faster than an abrupt world-travel reversal', () => {
  const current = new THREE.Vector3(0, 0, -1);
  const quarterTurn = new THREE.Vector3(1, 0, 0);
  const reverse = new THREE.Vector3(0, 0, 1);
  assert.equal(cameraDirectionRate(current, reverse), THPS_CAMERA.reverseDirectionFollowRate);
  assert.equal(cameraDirectionRate(current, quarterTurn), THPS_CAMERA.directionFollowRate);
  assert.ok(THPS_CAMERA.directionFollowRate > THPS_CAMERA.reverseDirectionFollowRate * 4);
});

test('high follow leaves a long horizontal arm and shows the descending bowl runout', () => {
  const ground = highFollowFraming({ grounded: true });
  const returning = highFollowFraming({ grounded: false, transitionReturning: true });
  assert.ok(returning.distance > ground.distance);
  assert.ok(returning.lookAhead > ground.lookAhead);
  assert.ok(Math.atan2(returning.height, returning.distance) * 180 / Math.PI < 30,
    'return camera must avoid an overhead angle');
});
