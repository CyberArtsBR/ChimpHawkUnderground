import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { StatefulSkillStreetPhysics } from '../src/game/StatefulSkillStreetPhysics.js';
import { MOVEMENT_STATE } from '../src/game/StreetPhysics.js';
import { GRIND_CAPTURE, advanceGrindSpeed, createBalanceState, stepBalance } from '../src/game/SkateSystems.js';
import { groundSteeringDelta, resolveGroundPropulsion } from '../src/game/core/GroundMotor.js';

test('cruising ground turns are sharper while analog input and reentry lock remain proportional', () => {
  const turn = steer => groundSteeringDelta({steer, speed:17, dt:.5});
  assert.ok(Math.abs(turn(1)) > 1.4);
  assert.ok(Math.abs(turn(.25) / turn(1) - .25) < .001);
  assert.equal(Math.abs(groundSteeringDelta({steer:1,speed:17,dt:.5,reentryRemaining:.2})),0);
});

test('manual preserves normal momentum, including fakie, but explicit brake and slopes still work', () => {
  for (const sign of [-1,1]) {
    let speed=sign*8;
    for(let i=0;i<600;i++) speed=resolveGroundPropulsion({speed,travelSign:sign,normalY:1,forwardY:0,manual:true,dt:1/120}).nextSpeed;
    assert.equal(speed,sign*8);
    const braked=resolveGroundPropulsion({speed,travelSign:sign,normalY:1,forwardY:0,manual:true,brake:true,dt:.1});
    assert.ok(Math.abs(braked.nextSpeed)<8);
  }
  assert.ok(resolveGroundPropulsion({speed:8,forwardY:.3,normalY:.9,manual:true,dt:.1}).nextSpeed<8);
});

test('shipping controller captures a slow approach and accelerates without stalling', () => {
  const floor=new THREE.Mesh(new THREE.BoxGeometry(100,.1,100),new THREE.MeshBasicMaterial());floor.position.y=-.05;
  const p=new StatefulSkillStreetPhysics({collision:floor,spawn:[0,.015,0],rails:[{name:'slow rail',radius:.055,points:[[0,.8,40],[0,.8,-40]]}]});
  p.position.set(.04,1.02,1.25);p.heading=0;p.airHeading=0;p.airDirection();
  p.setMovementState(MOVEMENT_STATE.AIR);p.velocity.set(0,-.35,-.21);
  assert.equal(p.enterGrind({name:'50-50'}),true);
  assert.equal(p.grind.speed,0.21);
  const start=p.grind.s;
  for(let i=0;i<120;i++) {
    const previous=p.grind.speed;p.stepGrind(1/120,{});
    assert.ok(p.grind && p.grind.speed>=previous);
  }
  assert.ok(Math.abs(p.grind.s-start)>3.2);
  assert.ok(p.grind.speed>3.5);
});

test('zero-speed attempts reject cleanly and legitimate slow rail entries support long counterbalanced holds',()=>{
 for(const speed of [0,.03,.21,.3,5]){
  const floor=new THREE.Mesh(new THREE.BoxGeometry(30,.1,1200),new THREE.MeshBasicMaterial());floor.position.y=-.05;
  const p=new StatefulSkillStreetPhysics({collision:floor,spawn:[0,.015,0],rails:[{name:'long rail',radius:.055,points:[[0,.8,500],[0,.8,-500]]}]});
  p.position.set(.04,1.02,1.25);p.heading=0;p.airHeading=0;p.airDirection();
  p.setMovementState(MOVEMENT_STATE.AIR);p.velocity.set(0,-.35,-speed);
  const captured=p.enterGrind({name:'50-50'});
  if(speed===0){assert.equal(captured,false);assert.equal(p.grind,null);assert.equal(p.bailTime,0);continue;}
  assert.equal(captured,true,`entry speed ${speed}`);
  const start=p.grind.s;
  for(let i=0;i<120*12;i++){
   const state=p.grind.balanceState;
   // Correct against the marker and its velocity, preserving the game's opposite-direction controls.
   const steer=THREE.MathUtils.clamp(-2*state.value-.7*state.velocity,-1,1);
   p.stepGrind(1/120,{steer});assert.equal(p.bailTime,0);assert.ok(p.grind,'balanced contact must remain captured');
  }
  assert.ok(Math.abs(p.grind.s-start)>100,'neutral traction must move the rider along the rail');
  p.stepGrind(1/120,{ollieReleased:true});assert.equal(p.grind,null);assert.equal(p.bailTime,0);
  assert.ok(p.velocity.y>0,'deliberate jump-out must pop away from the rail');
 }
});

test('rail acceleration stays bounded on downhill and uphill rails at different step rates', () => {
  for(const gravity of [-12,0,12]) for(const hz of [30,120]){
    let speed=3.2;for(let i=0;i<hz*10;i++) {const next=advanceGrindSpeed(speed,gravity,1/hz);assert.ok(next>=speed&&next<=23);speed=next;}
  }
});

test('balance pressure keeps increasing beyond the first few seconds on a rail', () => {
  const pressure = duration => stepBalance(createBalanceState(),{dt:1/120,duration,speed:5,rail:true}).pressure;
  assert.ok(pressure(10)>pressure(3));assert.ok(pressure(18)>pressure(10));
});

