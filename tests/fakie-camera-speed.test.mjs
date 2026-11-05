import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { StatefulSkillStreetPhysics } from '../src/game/StatefulSkillStreetPhysics.js';
import {
  THPS_CAMERA,
  fixedChaseFrame,
  resolveTravelFollowDirection,
} from '../src/game/FollowCamera.js';
import {
  MOMENTUM_ROLL,
  transitionGravityScale,
} from '../src/game/MomentumRollSkillStreetPhysics.js';
import { MOVEMENT_STATE } from '../src/game/StreetPhysics.js';

function floorWorld() {
  const root = new THREE.Group();
  const floor = new THREE.Mesh(new THREE.BoxGeometry(100, 0.1, 100), new THREE.MeshBasicMaterial());
  floor.position.y = -0.05;
  root.add(floor);
  root.updateMatrixWorld(true);
  return root;
}

function physics() {
  return new StatefulSkillStreetPhysics({ collision: floorWorld(), spawn: [0, 0.5, 0], rails: [] });
}

function setRolling(p, heading, signedSpeed) {
  p.position.set(0, 0.015, 0);
  p.normal.set(0, 1, 0);
  p.heading = heading;
  p.groundDirection();
  p.setMovementState(MOVEMENT_STATE.GROUND);
  p.velocity.copy(p.forward).multiplyScalar(signedSpeed);
  p.rollingSign = signedSpeed < 0 ? -1 : 1;
  p.fakie = p.rollingSign < 0;
  p.syncTravelDirection?.({ preserveIfSlow: false });
}

test('camera follows persistent world travel after 180 even if instantaneous velocity is rebuilt', () => {
  const player = {
    forward: new THREE.Vector3(0, 0, 1),
    velocity: new THREE.Vector3(0, 0, 1),
    travelDirection: new THREE.Vector3(0, 0, -1),
    fakie: true,
  };
  const previous = new THREE.Vector3(0, 0, -1);
  const direction = resolveTravelFollowDirection(player, previous, true);
  assert.ok(direction.z < -0.999, `camera crossed behind deck after 180: ${direction.z}`);
});

test('camera keeps previous travel side if fakie rider briefly becomes nearly stationary', () => {
  const player = {
    forward: new THREE.Vector3(0, 0, 1),
    velocity: new THREE.Vector3(0.01, 0, -0.01),
    travelDirection: new THREE.Vector3(0, 0, -1),
    fakie: true,
  };
  const previous = new THREE.Vector3(0, 0, -1);
  const direction = resolveTravelFollowDirection(player, previous, true);
  assert.ok(direction.z < -0.999, 'camera should not orbit 180 merely because fakie speed becomes small');
});

test('fixed world-axis camera keeps the current compact chase dimensions', () => {
  const player = { position: new THREE.Vector3(2, 3, 4) };
  const direction = new THREE.Vector3(0, 0, -1);
  const frame = fixedChaseFrame(player, direction);
  const cameraToTarget = frame.desired.clone().sub(frame.target);
  const vertical = cameraToTarget.y;
  cameraToTarget.y = 0;
  const angleDeg = Math.atan2(vertical, cameraToTarget.length()) * 180 / Math.PI;

  assert.equal(THPS_CAMERA.distance, 5.8);
  assert.equal(THPS_CAMERA.height, 1.55);
  assert.ok(angleDeg > 13 && angleDeg < 15,
    `fixed compact chase angle should be about 14°, got ${angleDeg}`);
});

test('regular and fakie use the exact same camera frame for the same world travel direction', () => {
  const position = new THREE.Vector3(0, 1, 0);
  const direction = new THREE.Vector3(1, 0, 0);
  const regularFrame = fixedChaseFrame({ position, fakie: false }, direction);
  const fakieFrame = fixedChaseFrame({ position, fakie: true }, direction);

  assert.ok(regularFrame.desired.distanceTo(fakieFrame.desired) < 1e-9);
  assert.ok(regularFrame.target.distanceTo(fakieFrame.target) < 1e-9);
});

test('fakie steering is camera-relative: left/right are not inverted after a 180', () => {
  const regular = physics();
  const fakie = physics();
  setRolling(regular, 0, 8.0);
  setRolling(fakie, Math.PI, -8.0);

  regular.steer = 0.65;
  fakie.steer = 0.65;
  const regularHeading = regular.heading;
  const fakieHeading = fakie.heading;

  for (let i = 0; i < 30; i++) {
    regular.stepGround(1 / 120, { brake: false }, 0);
    fakie.stepGround(1 / 120, { brake: false }, 0);
  }

  const regularDelta = regular.heading - regularHeading;
  const fakieDelta = fakie.heading - fakieHeading;
  assert.ok(regularDelta * fakieDelta > 0,
    `same stick direction must turn the same way: regular=${regularDelta}, fakie=${fakieDelta}`);
  assert.ok(Math.abs(Math.abs(regularDelta) - Math.abs(fakieDelta)) < 0.03,
    `regular/fakie steering magnitude diverged: ${regularDelta} vs ${fakieDelta}`);
  assert.equal(fakie.rollingSign, -1, 'fakie sign must remain latched');
  assert.equal(fakie.fakie, true, 'explicit fakie state must remain active');
});

test('contact systems expose no automatic wall-turn authority in final physics', () => {
  const p = physics();
  setRolling(p, 0.37, 8.0);
  const heading = p.heading;
  assert.equal(p.detectGroundWallImpact(1 / 120), null);
  assert.equal(p.applyWallRecovery({
    point: new THREE.Vector3(0, 0.3, -0.3),
    normal: new THREE.Vector3(0, 0, 1),
    speed: 8,
    broadWall: true,
  }), false);
  assert.equal(p.heading, heading);
});

test('neutral flat skating reaches a real skatepark cruise without forward throttle', () => {
  const p = physics();
  setRolling(p, 0, 0);
  const dt = 1 / 120;
  for (let i = 0; i < 3 * 120; i++) {
    p.steer = 0;
    p.stepGround(dt, { brake: false }, 0);
  }
  const speed = Math.abs(p.velocity.dot(p.forward));
  assert.ok(MOMENTUM_ROLL.autoPushTarget >= 12.0, `cruise target too low: ${MOMENTUM_ROLL.autoPushTarget}`);
  assert.ok(speed > 11.5, `neutral cruise should build useful ramp-entry speed, got ${speed}`);
  assert.ok(speed <= MOMENTUM_ROLL.autoPushTarget + 0.2, `neutral cruise exceeded target: ${speed}`);
});

test('uphill transition gravity is softened so a small ramp does not kill all speed', () => {
  assert.equal(transitionGravityScale({ signedSpeed: 12, forwardY: 0, normalY: 1 }), 1);
  assert.ok(transitionGravityScale({ signedSpeed: 12, forwardY: 0.5, normalY: 0.866 }) < 0.5);
  assert.equal(transitionGravityScale({ signedSpeed: 12, forwardY: -0.5, normalY: 0.866 }), 1);

  const p = physics();
  p.position.set(0, 0.015, 0);
  p.normal.set(0, Math.cos(Math.PI / 6), Math.sin(Math.PI / 6));
  p.heading = 0;
  p.groundDirection();
  p.setMovementState(MOVEMENT_STATE.GROUND);
  p.rollingSign = 1;
  p.fakie = false;
  p.velocity.copy(p.forward).multiplyScalar(12.5);

  for (let i = 0; i < 60; i++) p.stepGround(1 / 120, { brake: false }, 0);
  const speed = Math.abs(p.velocity.dot(p.forward));
  assert.ok(speed > 10.0, `small-ramp climb lost too much speed: 12.5 -> ${speed}`);
});
