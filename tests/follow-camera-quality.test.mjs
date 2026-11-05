import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { FollowCamera } from '../src/game/FollowCamera.js';
import { CAMERA_MODES, CAMERA_SHORTCUTS } from '../src/game/CameraModes.js';
import { StreetSkater } from '../src/game/StreetSkater.js';

function player() {
  return { position:new THREE.Vector3(0, 1, 0), velocity:new THREE.Vector3(0, 0, -10),
    forward:new THREE.Vector3(0, 0, -1), travelDirection:new THREE.Vector3(0, 0, -1),
    normal:new THREE.Vector3(0, 1, 0), grounded:true, visual:{visible:true} };
}

test('camera cycle inserts both close follows and keeps the original numeric shortcuts', () => {
  assert.deepEqual(CAMERA_MODES, ['follow', 'follow-close', 'follow-low', 'classic', 'fixed']);
  assert.deepEqual(CAMERA_SHORTCUTS, ['follow', 'classic', 'fixed']);
  const p = player(), rig = new FollowCamera(new THREE.PerspectiveCamera(58, 16/9, .08, 1000));
  const shots = {};
  for (const mode of CAMERA_MODES.slice(0, 3)) {
    rig.setMode(mode, p);
    const arm = rig.camera.position.clone().sub(rig.target);
    shots[mode] = { length:arm.length(), angle:Math.atan2(arm.y, Math.hypot(arm.x, arm.z)) };
  }
  assert.ok(shots['follow-close'].length < shots.follow.length * .8);
  assert.ok(Math.abs(shots['follow-close'].angle - shots.follow.angle) < 1e-6,
    'the closer follow must preserve the original viewing angle');
  assert.ok(shots['follow-low'].angle < shots['follow-close'].angle - .1);
  assert.ok(shots['follow-low'].length < shots.follow.length);
});

test('camera follows the rendered position without moving the collision anchor', () => {
  const p = player(), original = p.position.clone(), presented = p.position.clone().add(new THREE.Vector3(.1, 0, .05));
  let anchor;
  p.surface = { camera(from, eye) { anchor = from.clone(); return eye.clone(); } };
  const rig = new FollowCamera(new THREE.PerspectiveCamera());
  rig.update(p, 1/144, {}, presented);
  assert.ok(rig.followCenter.equals(presented));
  assert.ok(p.position.equals(original), 'presentation cannot change gameplay position');
  assert.ok(Math.abs(anchor.x - original.x) < 1e-9, 'clearance must use the real rider position');
});

test('the rendered rider moves smoothly on frames between 120 Hz physics steps', () => {
  const root = new THREE.Group();
  const floor = new THREE.Mesh(new THREE.BoxGeometry(80, .1, 80), new THREE.MeshBasicMaterial());
  floor.position.y = -.05; root.add(floor); root.updateMatrixWorld(true);
  const skater = new StreetSkater({collision:root, spawn:[0, .5, 0], rails:[]});
  skater.velocity.set(0, 0, -8);
  let priorPhysics = null, priorRendered = null, repeatedPhysics = 0, repeatedRendered = 0;
  for (let i = 0; i < 200; i++) {
    skater.update(1/144, {drive:1}, i/144);
    const physics = skater.position.z, rendered = skater._renderPhysicsPosition.z;
    if (i > 20 && Math.abs(physics-priorPhysics) < 1e-10) repeatedPhysics++;
    if (i > 20 && Math.abs(rendered-priorRendered) < 1e-10) repeatedRendered++;
    priorPhysics = physics; priorRendered = rendered;
  }
  assert.ok(repeatedPhysics > 10, 'the 120 Hz simulation should skip some 144 Hz frames');
  assert.equal(repeatedRendered, 0, 'interpolated rendering must not stall on those frames');
  skater.reset(new THREE.Vector3(8, .5, 0));
  skater.update(0, {}, 2);
  assert.ok(skater._renderPhysicsPosition.distanceTo(skater.position) < 1e-9,
    'reset must not interpolate across a teleport');
});

test('all five views keep a stable rider-relative arm and recover after an obstruction',()=>{
 for(const mode of CAMERA_MODES){
  const p=player(),camera=new THREE.PerspectiveCamera(58,16/9,.08,1000),rig=new FollowCamera(camera);
  let blocked=false;p.surface={camera(from,eye){return blocked?from.clone().lerp(eye,.35):eye.clone();}};
  rig.setMode(mode,p);
  const step=()=>{p.position.addScaledVector(p.velocity,1/120);rig.update(p,1/120,{});};
  for(let i=0;i<720;i++)step();
  let previous=camera.position.clone().sub(p.position),maxRelativeStep=0;
  for(let i=0;i<120;i++){
   step();const relative=camera.position.clone().sub(p.position);
   maxRelativeStep=Math.max(maxRelativeStep,relative.distanceTo(previous));previous=relative;
  }
  assert.ok(maxRelativeStep<.001,`${mode}: camera-relative jitter ${maxRelativeStep}`);
  const clearArm=camera.position.distanceTo(p.position);
  blocked=true;for(let i=0;i<24;i++)step();
  assert.ok(camera.position.distanceTo(p.position)<clearArm*.8,`${mode}: obstruction must compress the arm`);
  blocked=false;for(let i=0;i<360;i++)step();
  assert.ok(camera.position.toArray().every(Number.isFinite));
  assert.ok(camera.position.distanceTo(p.position)>clearArm*.95,`${mode}: camera must recover after clearance`);
 }
});
