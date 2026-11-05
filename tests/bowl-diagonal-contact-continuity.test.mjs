import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { SkateboardContactRig } from '../src/game/SkateboardContactRig.js';

const v=(x,y,z)=>new THREE.Vector3(x,y,z);
const bowlNormal=v(0.62,0.52,0.58).normalize();
const previous=v(0.34,0.81,0.48).normalize();
function readyRig(surface){
 const rig=new SkateboardContactRig(surface);
 for(const wheel of rig.wheels){
  wheel.valid=true;
  wheel.normal.copy(bowlNormal);
  wheel.previous.set(wheel.local.x,0.04,wheel.local.z);
 }
 return rig;
}
test('diagonal bowl carve continues on each wheel own real curved face when average-normal probe misses',()=>{
 const calls=[];
 const surface={
  sweepRideable(){return null},
  probeRideable(expected,n,rise,drop,point,normal){
   calls.push(n.y);
   if(n.y>0.70)return null;
   point.copy(expected).addScaledVector(bowlNormal,-0.03);
   normal.copy(bowlNormal);
   return {distance:0.03,fraction:1};
  }
 };
 const rig=readyRig(surface);
 const state=rig.solveGround(v(0,0.04,0),v(0,0.04,0),0,previous,true);
 assert.equal(state.count,4,'all four real bowl contacts must continue');
 assert.ok(state.normal.y>0.25&&state.normal.y<0.9);
 assert.ok(calls.some(y=>y>0.7)&&calls.some(y=>y<0.7));
});
test('bowl contact retries reject a disconnected lower surface even with matching normals',()=>{
 const surface={
  sweepRideable(){return null},
  probeRideable(expected,n,rise,drop,point,normal){
   if(n.y>0.70)return null;
   point.copy(expected).addScaledVector(bowlNormal,-0.65);
   normal.copy(bowlNormal);
   return {distance:0.65,fraction:1};
  }
 };
 const rig=readyRig(surface);
 assert.equal(rig.solveGround(v(0,0.04,0),v(0,0.04,0),0,previous,true).count,0);
});
test('airborne or no-history board contact cannot acquire synthetic bowl support',()=>{
 const surface={sweepRideable(){return null},probeRideable(expected,n,r,d,p,normal){
  if(n.y>0.70)return null; p.copy(expected);normal.copy(bowlNormal);return {distance:0,fraction:1};
 }};
 const rig=readyRig(surface);
 // With no swept ground tracking, no special per-wheel fallback runs.
 assert.equal(rig.solveGround(v(0,0.04,0),v(0,0.04,0),0,previous,false).count,0);
 rig.clearContacts();
 assert.equal(rig.solveGround(v(0,0.04,0),v(0,0.04,0),0,previous,true).count,0);
});
