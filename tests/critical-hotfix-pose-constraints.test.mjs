import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { riderCrouchOffset, ensurePelvisDeckClearance, outwardKneePole, boundedHandReach, neutralHandOffset } from '../src/character/SkatePoseConstraints.js';

test('ollie charge lowers the hip while a grab cannot add another torso plunge',()=>{
  const idle=riderCrouchOffset(0,0),crouch=riderCrouchOffset(1,0);
  assert.ok(crouch>idle+0.14 && crouch<0.23);
  assert.equal(riderCrouchOffset(1,1),crouch);
});
test('imported inward knee poles become outward for both sides',()=>{
  const left=outwardKneePole(new THREE.Vector3(0.1,-0.3,0.01),-1,1);
  const right=outwardKneePole(new THREE.Vector3(-0.15,-0.3,0.01),1,1);
  assert.ok(left.x<=-0.20);assert.ok(right.x>=0.20);
  assert.ok(left.z>0&&right.z>0);
});
test('balanced hands stay lateral and do not form opposed straight-z Egyptian arms',()=>{
  const left=neutralHandOffset(-1,true,0,0,0);
  const right=neutralHandOffset(1,false,0,0,0);
  assert.ok(left.x<0&&right.x>0);
  assert.ok(Math.abs(left.z)<0.15&&Math.abs(right.z)<0.15);
  assert.ok(left.y<-.2&&right.y<-.2);
});
test('grab reach respects actual limb length and never forces torso relocation',()=>{
  const shoulder=new THREE.Vector3(0,.9,0),target=new THREE.Vector3(0,-.5,0);
  const bounded=boundedHandReach(shoulder,target,.58);
  assert.ok(bounded.distanceTo(shoulder)<=.5451);
  assert.ok(bounded.y>.34);
  assert.equal(shoulder.y,.9);
});
test('pelvis never sinks through the skateboard during full crouch or grab',()=>{
  const rider=new THREE.Group(),pelvis=new THREE.Bone();rider.add(pelvis);
  const boardRoot=new THREE.Group(),model=new THREE.Group();model.add(rider);
  pelvis.position.set(0,.17,0);model.position.y=.1;
  const board={root:boardRoot,pointWorld:()=>new THREE.Vector3(),deckHeight:0.12,contactRig:{deckTopY:.12}};
  const offset=ensurePelvisDeckClearance(model,pelvis,board);
  assert.ok(offset>0&&offset<=.2);
  const boardLocal=boardRoot.worldToLocal(pelvis.getWorldPosition(new THREE.Vector3()));
  assert.ok(boardLocal.y>=.404);
  assert.equal(ensurePelvisDeckClearance(model,pelvis,board),0);
});
