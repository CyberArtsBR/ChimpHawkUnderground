import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {FollowCamera} from '../src/game/FollowCamera.js';
import {resolveCameraClearance} from '../src/game/CameraClearance.js';

const player=()=>({position:new THREE.Vector3(0,1,0),velocity:new THREE.Vector3(0,0,-10),
  forward:new THREE.Vector3(0,0,-1),travelDirection:new THREE.Vector3(0,0,-1),
  normal:new THREE.Vector3(0,1,0),grounded:true,visual:{visible:true}});
const rig=p=>{const r=new FollowCamera(new THREE.PerspectiveCamera(58,16/9,.1,1000));r.snap(p);return r;};

test('landing settles from the air frame and recovers without steering camera yaw',()=>{
  const p=player(),settled=rig(p),immediate=rig(p);
  p.grounded=false;p.position.y=3;
  for(let i=0;i<24;i++){settled.update(p,1/120);immediate.update(p,1/120);}
  // Compare touchdown after a real jump to a wheel-contact flicker. Both begin
  // at the same camera pose, but only the jump should soften the landing.
  immediate.airborneTime=0;
  p.grounded=true;p.position.y=1;p.justLanded=true;
  settled.update(p,1/120);immediate.update(p,1/120);
  settled.update(p,1/120);immediate.update(p,1/120);
  assert.ok(settled.camera.position.y>immediate.camera.position.y);
  assert.ok(settled.height>immediate.height,'retain a little air headroom at impact');
  assert.ok(settled.direction.dot(p.travelDirection)>.9999,'no landing orbit');
  p.justLanded=false;
  for(let i=0;i<240;i++)settled.update(p,1/120);
  assert.equal(settled.landingSettle,0);
  assert.ok(Math.abs(settled.height-4.9)<.001);
  assert.ok(Math.abs(settled.distance-8.5)<.001);
});

test('single-frame wheel contact flicker and respawn do not create a landing hold',()=>{
  const p=player(),c=rig(p);
  p.grounded=false;c.update(p,1/120);
  p.grounded=true;c.update(p,1/120);
  assert.equal(c.landingSettle,0);
  p.grounded=false;
  for(let i=0;i<24;i++)c.update(p,1/120);
  p.grounded=true;c.update(p,1/120);
  assert.ok(c.landingSettle>0);
  c.snap(p);
  assert.equal(c.landingSettle,0);
});

test('coping occlusion seeks a comfortable arm before collapsing to a close-up',()=>{
  const anchor=new THREE.Vector3(),desired=new THREE.Vector3(0,3,9),cache={fixedAxis:true};
  const surface={camera(from,eye){return Math.abs(eye.x)<.5
    ? from.clone().add(eye.clone().sub(from).setLength(5)):eye.clone();}};
  const resolved=resolveCameraClearance(surface,anchor,desired,null,cache);
  assert.ok(Math.abs(resolved.x)>=1.5,'choose a clear side rather than shortened direct arm');
  assert.ok(resolved.distanceTo(anchor)>8);
  assert.deepEqual(desired.toArray(),[0,3,9]);
});

test('a partly recovered coping sightline retains the safe side until it clears decisively',()=>{
  const anchor=new THREE.Vector3(),desired=new THREE.Vector3(0,3,9);
  const cache={fixedAxis:true,arm:new THREE.Vector3(1.5,3,9),side:1};
  let direct=5.8;
  const surface={camera(from,eye){return Math.abs(eye.x)<.5
    ? from.clone().add(eye.clone().sub(from).setLength(direct)):eye.clone();}};
  const side=resolveCameraClearance(surface,anchor,desired,null,cache);
  assert.ok(side.x>.5,'small threshold crossing should not switch the camera back');
  assert.equal(cache.side,1);
  direct=6.3;
  const recovered=resolveCameraClearance(surface,anchor,desired,null,cache);
  assert.equal(recovered.x,0);
  assert.equal(cache.side,0);
});
