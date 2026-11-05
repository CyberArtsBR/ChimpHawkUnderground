import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { UnrealRider } from '../src/character/UnrealRider.js';
import { StreetBoard } from '../src/skateboard/StreetBoard.js';
import { avatarPoseCalibration, legOverextension } from '../src/character/SkatePoseConstraints.js';

const v = (x=0,y=0,z=0)=>new THREE.Vector3(x,y,z);
function makeRider(hipHeight=0.88) {
  const rider = new UnrealRider('/test.glb');
  rider.model = new THREE.Group(); rider.root.add(rider.model);
  rider.basePos = v(); rider.baseQ = new THREE.Quaternion();
  const pelvis = new THREE.Bone(); pelvis.name='pelvis'; pelvis.position.y=hipHeight; rider.model.add(pelvis);
  const spine1=new THREE.Bone();spine1.name='spine_01';spine1.position.y=.15;pelvis.add(spine1);
  const spine2=new THREE.Bone();spine2.name='spine_02';spine2.position.y=.15;spine1.add(spine2);
  const spine3=new THREE.Bone();spine3.name='spine_03';spine3.position.y=.14;spine2.add(spine3);
  const bones=[pelvis,spine1,spine2,spine3];
  for(const side of ['l','r']) {
    const sign=side==='l'?-1:1;
    const thigh=new THREE.Bone();thigh.name='thigh_'+side;thigh.position.set(sign*.16,-.06,0);pelvis.add(thigh);
    const calf=new THREE.Bone();calf.name='calf_'+side;calf.position.set(0,-hipHeight*.46,.06);thigh.add(calf);
    const foot=new THREE.Bone();foot.name='foot_'+side;foot.position.set(0,-hipHeight*.46,-.06);calf.add(foot);
    const upper=new THREE.Bone();upper.name='upperarm_'+side;upper.position.set(sign*.26,0,0);spine3.add(upper);
    const lower=new THREE.Bone();lower.name='lowerarm_'+side;lower.position.set(sign*.05,-.21,0);upper.add(lower);
    const hand=new THREE.Bone();hand.name='hand_'+side;hand.position.set(0,-.19,0);lower.add(hand);
    bones.push(thigh,calf,foot,upper,lower,hand);
    rider.kneePoles[side]=v(0,-hipHeight*.46,.06);
    rider.outward[side]=sign;
  }
  rider.bones=Object.fromEntries(bones.map(b=>[b.name,b]));
  rider.rest=new Map(bones.map(b=>[b,b.quaternion.clone()]));
  rider.root.updateWorldMatrix(true,true);
  for(const side of ['l','r']){
    const foot=rider.bones['foot_'+side];
    rider.feet[side]={point:rider.root.worldToLocal(foot.getWorldPosition(v())),q:foot.getWorldQuaternion(new THREE.Quaternion())};
    rider.soleOffsets[side]=.06;
    rider.hands[side]={q:rider.bones['hand_'+side].getWorldQuaternion(new THREE.Quaternion())};
  }
  rider.poseCalibration=avatarPoseCalibration(hipHeight*.94);
  const board=new StreetBoard('/unused.glb');
  board.deckHeight=.12;board.contactRig={deckTopY:.14,deckWidth:.42,deckLength:1.2};
  board.root.position.y=.12;
  return {rider,board};
}
function holdPose(rider,board,state,params={}) {
  rider.resetPresentation();
  for(let i=0;i<32;i++) rider.update({board,presentation:{state},dt:1/60,time:i/60,...params});
  const hip=rider.bones.pelvis.getWorldPosition(v());
  const sole=board.root.worldToLocal(hip).y-(board.contactRig.deckTopY-board.deckHeight);
  const wrist=rider.bones.hand_r.getWorldPosition(v());
  return {hipHeight:sole,wrist};
}

test('short GLB rigs get lower collision-safe pelvis thresholds, not a hardcoded .405m',()=>{
  const small=avatarPoseCalibration(.42),tall=avatarPoseCalibration(.91);
  assert.ok(small.pelvisClearance<tall.pelvisClearance);
  assert.ok(small.pelvisClearance<=.23&&small.pelvisClearance>=.19);
  assert.ok(small.crouchScale<tall.crouchScale);
});

test('leg correction occurs only when stance extends past the real bone chain',()=>{
  assert.equal(legOverextension(v(0,.7,0),v(0,.1,0),.36,.36),0);
  assert.ok(legOverextension(v(0,1,0),v(0,.1,0),.36,.36)>.1);
  assert.equal(legOverextension(v(0,1,0),v(0,.1,0),NaN,.36),0);
});

for(const hipHeight of [.53,.88]){
  test('rig '+hipHeight+' visibly crouches without losing deck clearance or foot support',()=>{
    const {rider,board}=makeRider(hipHeight);
    const idle=holdPose(rider,board,'IDLE');
    const crouch=holdPose(rider,board,'CROUCH',{crouch:1});
    assert.ok(crouch.hipHeight<idle.hipHeight-.07,JSON.stringify({idle:idle.hipHeight,crouch:crouch.hipHeight}));
    assert.ok(crouch.hipHeight>rider.poseCalibration.pelvisClearance-.025,
      'pelvis must stay above board with a small numerical tolerance');
    for(const side of ['l','r']){
      const ankle=rider.bones['foot_'+side].getWorldPosition(v());
      const footTarget=board.pointWorld(
        THREE.MathUtils.clamp(rider.feet[side].point.x,-.1806,.1806),.08,
        THREE.MathUtils.clamp(rider.feet[side].point.z,-.468,.468));
      assert.ok(ankle.distanceTo(footTarget)<.16,side+' foot should be near its board anchor');
    }
  });
  test('rig '+hipHeight+' grab reaches toward the deck without collapsing leg IK',()=>{
    const {rider,board}=makeRider(hipHeight);
    const neutral=holdPose(rider,board,'AIR');
    const grab=holdPose(rider,board,'AIR',{grabState:{name:'Indy'},grabWeight:1});
    const target=rider.grabTarget('Indy','r',1,board);
    assert.ok(grab.wrist.distanceTo(target)<neutral.wrist.distanceTo(target)-.025,
      JSON.stringify({before:neutral.wrist.distanceTo(target),after:grab.wrist.distanceTo(target)}));
    assert.ok(grab.hipHeight>rider.poseCalibration.pelvisClearance-.025);
    for(const bone of rider.rest.keys()){
      assert.ok([bone.quaternion.x,bone.quaternion.y,bone.quaternion.z,bone.quaternion.w].every(Number.isFinite),
        bone.name+' has non-finite pose');
    }
  });
}
