import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { FollowCamera, THPS_CAMERA } from '../src/game/FollowCamera.js';
import { resolveCameraClearance } from '../src/game/CameraClearance.js';

function rider() {
  return {
    position: new THREE.Vector3(0, 1, 0),
    velocity: new THREE.Vector3(0, 0, -8),
    forward: new THREE.Vector3(0, 0, -1),
    travelDirection: new THREE.Vector3(0, 0, -1),
    normal: new THREE.Vector3(0, 1, 0),
    wallRide: { normal: new THREE.Vector3(1, 0, 0) },
    grounded: false,
    visual: { visible: true },
    surface: {
      // The straight rear axis is blocked regardless of camera elevation.
      // Eyes displaced toward the open (+X) side can see the rider.
      camera(from, eye) {
        const arm = eye.clone().sub(from);
        return arm.x < 1.2
          ? from.clone().add(arm.setLength(Math.min(arm.length(), 1.05)))
          : eye.clone();
      },
    },
  };
}

function controller(player, mode = 'follow') {
  const camera = new THREE.PerspectiveCamera(58, 16 / 9, .1, 1000);
  const follow = new FollowCamera(camera);
  follow.setMode(mode, player);
  return follow;
}

test('wallride stays in the original follow camera with the rider visible', () => {
  const p = rider();
  const c = controller(p);
  const anchor = p.position.clone().add(new THREE.Vector3(0, THPS_CAMERA.anchorHeight, 0));
  assert.equal(c.mode, 'follow');
  assert.equal(p.visual.visible, true);
  assert.ok(c.direction.z < -.99, 'camera heading flipped during wallride');
  assert.ok(c.camera.position.x > 1.2, 'eye remained inside the wall');
  assert.ok(c.camera.position.distanceTo(anchor) >= 3.3 - 1e-8,
    'wallride wrongly collapsed into first-person distance');
});

test('camera exits wallride without a lingering one-metre eye distance', () => {
  const p = rider();
  const c = controller(p);
  p.wallRide = null;
  p.surface = { camera(_from, eye) { return eye.clone(); } };
  c.occlusionDistance = 1.05; // forced prior occlusion state
  c.update(p, 1 / 60, {});
  const anchor = p.position.clone().add(new THREE.Vector3(0, THPS_CAMERA.anchorHeight, 0));
  assert.ok(c.camera.position.distanceTo(anchor) >= 2.35 - 1e-8);
  assert.equal(c.mode, 'follow');
});

test('wallride probe never teleports through a completely sealed obstacle', () => {
  const anchor = new THREE.Vector3(0, 1, 0);
  const desired = new THREE.Vector3(0, 6, 9);
  const surface = { camera(from, eye) {
    const arm = eye.clone().sub(from);
    return from.clone().add(arm.setLength(Math.min(arm.length(), 1.0)));
  } };
  const resolved = resolveCameraClearance(surface, anchor, desired, null, {
    fixedAxis: true, minimumDistance: 3.3, wallNormal: new THREE.Vector3(1, 0, 0),
  });
  assert.ok(resolved.distanceTo(anchor) <= 1 + 1e-9);
});

test('wallride side probing does not modify the contact normal supplied by physics', () => {
  const p = rider();
  const original = p.wallRide.normal.clone();
  controller(p);
  assert.deepEqual(p.wallRide.normal.toArray(), original.toArray());
});
