import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {StatefulSkillStreetPhysics}from'../src/game/StatefulSkillStreetPhysics.js';
import {StreetBoard}from'../src/skateboard/StreetBoard.js';
import {FollowCamera}from'../src/game/FollowCamera.js';
import {MOVEMENT_STATE}from'../src/game/StreetPhysics.js';

test('accepted mid-frame auto-catch preserves shove-it yaw for rendered deck and feet',()=>{
 const floor=new THREE.Mesh(new THREE.PlaneGeometry(40,40));floor.rotation.x=-Math.PI/2;floor.updateMatrixWorld(true);
 const p=new StatefulSkillStreetPhysics({collision:floor,spawn:[0,.1,0]});
 p.position.set(0,.015,0);p.velocity.set(0,-2,-4);p.airTime=.5;p.setMovementState(MOVEMENT_STATE.AIR);
 p.flipState={name:'Varial Kickflip',progress:.68,duration:1,roll:1,yaw:.5};
 const support={supported:true,count:4,frontSupported:2,rearSupported:2,position:p.position.clone(),normal:new THREE.Vector3(0,1,0),contacts:[]};
 assert.equal(p.land(support),true);assert.equal(p.flipState,null);
 assert.equal(p.lastCaughtFlip.progress,1);
 const board=new StreetBoard('test');board.deckHeight=.12;
 board.catchFlip(p.lastCaughtFlip);board.update({dt:1/60});
 assert.ok(Math.abs(board._yawHold-Math.PI)<1e-8);
 for(let i=0;i<30;i++)board.update({dt:1/60});
 assert.ok(Math.abs(board._yawHold-Math.PI)<1e-8,'completed half turn unwound after touchdown');
 assert.ok(Math.abs(p.heading)<1e-8,'decorative catch must never rotate physical heading');
 p.reset();assert.equal(p.lastCaughtFlip,null);
});

test('reduced motion keeps the follow lens constant without disabling travel tracking',()=>{
 const saved=globalThis.matchMedia;globalThis.matchMedia=()=>({matches:true});
 try{
  const camera=new THREE.PerspectiveCamera(58,16/9,.08,1000),follow=new FollowCamera(camera);
  const player={position:new THREE.Vector3(),velocity:new THREE.Vector3(0,0,-22),
   forward:new THREE.Vector3(0,0,-1),normal:new THREE.Vector3(0,1,0),grounded:true};
  for(let i=0;i<60;i++){player.position.z-=22/60;follow.update(player,1/60,{});}
  assert.ok(Math.abs(camera.fov-58)<1e-8);assert.ok(camera.position.z<0);
  assert.ok(camera.position.toArray().every(Number.isFinite));
 }finally{globalThis.matchMedia=saved;}
});
