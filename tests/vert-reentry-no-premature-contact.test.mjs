import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { SAFE_COPING_EXIT } from '../src/game/SafeCopingExitSkillStreetPhysics.js';
import { originalTransitionSweep, resolveSweepReentryCandidate } from '../src/game/core/TransitionReentryResult.js';

const frame=()=>({frame:{
 lipPoint:new THREE.Vector3(0,3,0),
 deckOutward:new THREE.Vector3(0,0,-1),
 rampInward:new THREE.Vector3(0,0,1),
 copingTangent:new THREE.Vector3(1,0,0),
 surfaceNormal:new THREE.Vector3(0,0.72,0.694).normalize(),
},apexPassed:true});
const surface=()=>({sweepRideable(from,to,point,normal,extra){
 assert.ok(extra>=0.2,'seam allowance is preserved');
 point.set(0,2.28,0.62);normal.set(0,0.68,0.733).normalize();
 return {fraction:1,distance:from.distanceTo(point)};
}});
test('future-only extended coping hit cannot snap rider before actual crossing',()=>{
 const before=new THREE.Vector3(0,2.8,0.10),after=new THREE.Vector3(0,2.72,0.17);
 assert.equal(originalTransitionSweep(surface(),before,after,frame(),SAFE_COPING_EXIT),null);
});
test('same ramp hit crossed in current step remains valid',()=>{
 const before=new THREE.Vector3(0,2.8,0.10),after=new THREE.Vector3(0,2.0,0.85);
 assert.ok(originalTransitionSweep(surface(),before,after,frame(),SAFE_COPING_EXIT));
});
test('center-only crossing guards penetration but never authorizes wheel touchdown',()=>{
 const before=new THREE.Vector3(0,2.8,0.10),position=new THREE.Vector3(0,2.0,0.85);
 const result=resolveSweepReentryCandidate({activeAir:frame(),grounded:false,sameAir:true,
  velocityY:-3,surface:surface(),contact:{solveGround(){return {supported:false}}},before,
  position,heading:0,velocity:new THREE.Vector3(0,-3,2),forward:new THREE.Vector3(0,0,-1),config:SAFE_COPING_EXIT});
 assert.equal(result?.wheelVerified,false);
 assert.equal(result?.support?.count,1);
});
