import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { TransitionGuide } from '../src/game/TransitionGuide.js';
import { VERT_LAUNCH_ENVELOPE } from '../src/game/transitions/TransitionController.js';
import { PHYSICS } from '../src/game/StreetPhysics.js';

// Map 4's deleted urban-warehouse.glb cannot provide valid launch routes.
// Keep five deterministic *real vert controller* launch/reentry scenarios,
// while Grand Warehouse's authored collision is verified by its own GLB tests.
// Component-level TransitionGuide check; whole-runtime geometry coverage is in charged-ramp-runtime.mjs.
const DT=1/120, GRAVITY=PHYSICS.gravity;
const rail={name:'04 / eastern quarter coping',points:[[-3,2,0],[3,2,0]]};
const scenarios=[
  {name:'low-speed quarter',speed:5,boost:0},
  {name:'medium-speed quarter',speed:7,boost:0},
  {name:'fast quarter',speed:10,boost:0},
  {name:'high-speed quarter',speed:13,boost:0},
  {name:'buffered ollie at coping',speed:9,boost:4},
];

for(const {name,speed,boost} of scenarios)test(name+': actual vert preserves launch rise and natural return',()=>{
  const guide=new TransitionGuide([rail]);
  const position=new THREE.Vector3(0,1.9,.18);
  const initial=position.clone();
  const normal=new THREE.Vector3(0,.08,1).normalize();
  const velocity=new THREE.Vector3(0,speed*.92,-speed*.38);
  const edge=guide.launchAt(position,normal,velocity);
  assert.ok(edge,'authored coping not detected: '+name);
  const air=guide.begin(position,velocity,edge,{
    boardForward:new THREE.Vector3(0,0,-1),launchBoost:boost,
  });
  assert.ok(velocity.y>0,'launch must have upward velocity');
  assert.ok(velocity.y<=VERT_LAUNCH_ENVELOPE.maximumVerticalSpeed+1e-6,
    'launch energy exceeds the documented maximum');
  if(!boost)assert.ok(velocity.y<=VERT_LAUNCH_ENVELOPE.maximumPassiveVerticalSpeed+1e-6);
  const launchVertical=velocity.y;
  let peak=position.y,descendingLip=null;
  for(let i=0;i<500;i++){
    velocity.y-=GRAVITY*DT;
    guide.advance(air,position,velocity,{},DT);
    position.addScaledVector(velocity,DT);
    assert.ok([...position.toArray(),...velocity.toArray()].every(Number.isFinite),'NaN in vert flight');
    peak=Math.max(peak,position.y);
    if(air.apexPassed&&velocity.y<0&&position.y<=edge.lipPoint.y&&air.age>.25){
      descendingLip=position.clone();break;
    }
  }
  const theoreticalRise=launchVertical*launchVertical/(2*GRAVITY);
  assert.ok(peak-initial.y>=theoreticalRise*.85,
    'launch lost height: '+(peak-initial.y)+'m, expected near '+theoreticalRise+'m');
  assert.ok(air.apexPassed,'vert never completed ascent');
  assert.ok(descendingLip,'vert never returned through coping height');
  assert.equal(air.transferring,false,'neutral approach must not auto-transfer across the deck');
  assert.ok(descendingLip.clone().sub(edge.lipPoint).dot(air.frame.rampInward)>0.01,
    'return must stay ramp-side');
});
