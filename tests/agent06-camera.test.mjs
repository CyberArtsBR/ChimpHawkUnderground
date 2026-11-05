import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { FollowCamera, THPS_CAMERA, highFollowFraming, smoothCameraDirection } from '../src/game/FollowCamera.js';
import { captureCameraState, resolveCameraTravelDirection } from '../src/game/core/CameraState.js';
import { resolveCameraClearance } from '../src/game/CameraClearance.js';

function player() {
  return {
    position: new THREE.Vector3(0, 1, 0),
    velocity: new THREE.Vector3(0, 0, -9),
    forward: new THREE.Vector3(0, 0, -1),
    travelDirection: new THREE.Vector3(0, 0, -1),
    normal: new THREE.Vector3(0, 1, 0),
    grounded: true, fakie: false, wallRide: null,
    visual: { visible: true }, surface: null,
  };
}
function rig(p = player(), mode = 'follow') {
  const camera = new THREE.PerspectiveCamera(58, 16 / 9, 0.1, 1000);
  const controller = new FollowCamera(camera);
  controller.setMode(mode, p);
  return controller;
}
function horizontal(v) { return new THREE.Vector3(v.x, 0, v.z).normalize(); }


test('default Follow framing is a little closer without pulling wall/vert cameras into obstacles', () => {
  const ground = highFollowFraming({ grounded: true, horizontalSpeed: 7 });
  const air = highFollowFraming({ grounded: false, horizontalSpeed: 7 });
  const wall = highFollowFraming({ wallRideActive: true, horizontalSpeed: 7 });
  const returning = highFollowFraming({ transitionReturning: true, horizontalSpeed: 7 });
  assert.equal(ground.distance, 8.5);
  assert.equal(ground.height, 4.9);
  assert.ok(ground.distance > 7.8 && ground.distance < 9.5, 'moderate zoom, not first-person');
  assert.ok(air.distance > ground.distance);
  assert.ok(wall.distance > ground.distance && wall.height >= 6, 'maintain wall clearance');
  assert.ok(returning.distance > ground.distance && returning.lookAhead >= 1, 'landings remain visible');
  const c = rig(player(), 'follow');
  assert.ok(c.distance <= 9 && c.distance >= 8, 'first-person gameplay frame uses closer default');
  assert.equal(c.mode, 'follow');
});
test('agent06: straight travel remains behind the movement vector', () => {
  const p = player();
  const c = rig(p);
  assert.ok(c.direction.dot(p.travelDirection) > 0.999);
  assert.ok(c.camera.position.z > p.position.z);
  assert.ok(c.camera.position.distanceTo(p.position) > 4);
});

test('agent06: speed-aware ground look-ahead remains bounded and grows with speed', () => {
  const slow = highFollowFraming({ grounded: true, horizontalSpeed: 2 });
  const fast = highFollowFraming({ grounded: true, horizontalSpeed: 30 });
  assert.ok(fast.lookAhead > slow.lookAhead);
  assert.ok(fast.lookAhead <= 0.55 + THPS_CAMERA.speedLookAheadCap + 1e-9);
  assert.equal(slow.distance, fast.distance);
});

test('agent06: high speed and rapid position updates do not accumulate unbounded lag', () => {
  const p = player();
  const c = rig(p);
  p.position.set(25, 1, -25);
  p.velocity.set(22, 0, -22);
  c.update(p, 1 / 60, {});
  assert.ok(c.followCenter.distanceTo(p.position) <= THPS_CAMERA.maximumFollowLag + 1e-9);
  for (let i = 0; i < 60; i++) {
    p.position.addScaledVector(p.velocity, 1 / 60);
    c.update(p, 1 / 60, {});
    assert.ok(c.followCenter.distanceTo(p.position) <= THPS_CAMERA.maximumFollowLag + 1e-9);
  }
});

test('agent06: fakie 180 changes board heading without orbiting behind the deck', () => {
  const p = player();
  const c = rig(p);
  p.forward.set(0, 0, 1);
  p.fakie = true;
  p.velocity.set(0, 0, -9);
  for (let i = 0; i < 25; i++) c.update(p, 1 / 60, {});
  assert.ok(c.direction.z < -0.99);
  assert.ok(c.camera.position.z > p.position.z);
});

test('agent06: ordinary turning at 90 degrees has smooth, bounded yaw steps', () => {
  const p = player(), c = rig(p);
  p.travelDirection.set(1, 0, 0);
  p.velocity.set(9, 0, 0);
  const prior = c.direction.clone();
  c.update(p, 1 / 60, {});
  assert.ok(c.direction.dot(prior) > 0.99);
  assert.ok(c.direction.x > 0 && c.direction.z < 0);
});

test('agent06: sudden travel reversal does not cause a one-frame camera flip', () => {
  const p = player(), c = rig(p);
  p.travelDirection.set(0, 0, 1);
  p.velocity.set(0, 0, 9);
  c.update(p, 1 / 60, {});
  assert.ok(c.direction.z < -0.99);
});

test('agent06: bowl carving and rapid steering cannot use the surface normal as yaw', () => {
  const p = player(), c = rig(p);
  p.normal.set(0.999, 0.045, 0).normalize();
  for (let i = 0; i < 8; i++) {
    p.travelDirection.set(i % 2 ? -1 : 1, 0, 0);
    const before = c.direction.clone();
    c.update(p, 1 / 120, { steer: i % 2 ? -1 : 1 });
    assert.ok(c.direction.dot(before) > 0.98);
  }
});

test('agent06: coping launch and bowl return reverse at a controlled rate', () => {
  const p = player(), c = rig(p);
  p.grounded = false;
  p.transitionAir = { transferring: false, frame: { rampInward: new THREE.Vector3(0, 0, 1) } };
  const prior = c.direction.clone();
  c.update(p, 1 / 60, {});
  assert.ok(c.direction.dot(prior) > 0.98, '180 coping reframe whipped the camera');
  assert.ok(c.returnHold > 0);
  assert.ok(c.distance > 5);
});

test('agent06: vert re-entry eventually releases a mismatched downhill return hold', () => {
  const p = player(), c = rig(p);
  p.grounded = false;
  p.transitionAir = { transferring: false, frame: { rampInward: new THREE.Vector3(0, 0, 1) } };
  c.update(p, 1 / 60, {});
  p.transitionAir = null;
  p.grounded = true;
  p.travelDirection.set(0, 0, -1);
  for (let i = 0; i < 160; i++) c.update(p, 1 / 60, {});
  assert.equal(c.returnHold, 0, 'return direction remained latched indefinitely');
});

test('agent06: wallride retains avatar visibility and higher chase clearance', () => {
  const p = player();
  p.wallRide = { normal: new THREE.Vector3(1, 0, 0) };
  // A coping blocks low sightlines, but an elevated rear eye is clear.
  p.surface = {
    camera(from, eye) {
      const arm = eye.clone().sub(from);
      return arm.y < 6.5 ? from.clone().add(arm.setLength(1.2)) : eye.clone();
    },
  };
  const c = rig(p);
  assert.equal(p.visual.visible, true);
  assert.ok(c.camera.position.distanceTo(p.position.clone().add(new THREE.Vector3(0, THPS_CAMERA.anchorHeight, 0))) >= 3.3 - 1e-8);
  assert.ok(c.camera.position.y > p.position.y + 6.5);
});

test('agent06: bail holds camera yaw until normal travel resumes', () => {
  const p = player(), c = rig(p);
  p.bailTime = 0.75;
  p.travelDirection.set(1, 0, 0);
  p.velocity.set(9, 0, 0);
  c.update(p, 1 / 60, {});
  assert.ok(c.direction.z < -0.999);
  p.bailTime = 0;
  c.update(p, 1 / 60, {});
  assert.ok(c.direction.x > 0);
});

test('agent06: a respawn snap clears follow lag and prior occlusion memory', () => {
  const p = player(), c = rig(p);
  p.position.set(120, 5, -110);
  c.update(p, 1 / 60, {});
  c.occlusionDistance = 2.5;
  c.snap(p);
  assert.ok(c.followCenter.distanceTo(p.position) < 1e-9);
  assert.ok(c.camera.position.distanceTo(p.position) > 5);
  assert.ok(c.occlusionDistance > 2.5);
});

test('agent06: fixed mode retains world-axis direction, without a close-up', () => {
  const p = player(), c = rig(p, 'fixed');
  const startDirection = c.direction.clone();
  p.travelDirection.set(1, 0, 0);
  p.velocity.set(16, 0, 0);
  p.position.x += 8;
  c.update(p, 1 / 60, {});
  assert.ok(c.direction.distanceTo(startDirection) < 1e-9);
  assert.ok(c.camera.position.distanceTo(p.position) > 2.35);
});

test('agent06: presentation snapshots stay decoupled from ground-contact yaw changes', () => {
  const p = player();
  p.normal.set(0.99, 0.11, 0).normalize();
  const dir = resolveCameraTravelDirection(p, new THREE.Vector3(1, 0, 0));
  const state = captureCameraState(p);
  assert.ok(dir.z < -0.99);
  assert.equal(state.wallRideActive, false);
  assert.ok(state.surfaceNormal.dot(p.normal) > 0.999);
  assert.notEqual(state.surfaceNormal, p.normal);
});

test('agent06: frame-rate changes preserve the 90-degree camera recovery', () => {
  function simulate(hz) {
    const p = player(), c = rig(p);
    p.travelDirection.set(1, 0, 0);
    p.velocity.set(9, 0, 0);
    for (let i = 0; i < hz; i++) c.update(p, 1 / hz, {});
    return horizontal(c.direction);
  }
  assert.ok(simulate(30).distanceTo(simulate(120)) < 0.025);
});

test('agent06: directional interpolation is deterministic for equivalent elapsed time', () => {
  const a = new THREE.Vector3(0, 0, -1), b = new THREE.Vector3(1, 0, 0);
  const once = smoothCameraDirection(a, b, 0.1, 4.2);
  let stepped = a;
  for (let i = 0; i < 6; i++) stepped = smoothCameraDirection(stepped, b, 1 / 60, 4.2);
  assert.ok(once.distanceTo(stepped) < 1e-10);
});

test('agent06: a fully blocked camera never fabricates untested clearance', () => {
  const anchor = new THREE.Vector3(0, 1, 0), eye = new THREE.Vector3(0, 6, 9);
  const surface = { camera(from, desired) {
    const arm = desired.clone().sub(from);
    return from.clone().add(arm.setLength(Math.min(arm.length(), 1.1)));
  } };
  const resolved = resolveCameraClearance(surface, anchor, eye, null,
    { fixedAxis: true, minimumDistance: 3.3 });
  assert.ok(resolved.distanceTo(anchor) <= 1.1 + 1e-9);
  const p = player(); p.surface = surface;
  const c = rig(p);
  assert.ok(c.camera.position.distanceTo(p.position.clone().add(new THREE.Vector3(0, THPS_CAMERA.anchorHeight, 0))) <= 1.1 + 1e-9);
});
