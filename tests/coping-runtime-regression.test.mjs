import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {loadGeometry} from '../tools/load-geometry.mjs';
import {loadRuntimeBoardRig} from '../tools/quality-board-rig.mjs';
import {buildImportedWarehouseCollision} from '../src/park/ImportedWarehouseCollision.js';
import {createWarehousePark} from '../src/park/WarehousePark.js';
import {excludeGrandWarehouseMisplacedSixStair} from '../src/park/GrandWarehouseSceneFilter.js';
import {StatefulSkillStreetPhysics} from '../src/game/StatefulSkillStreetPhysics.js';
import {MOVEMENT_STATE} from '../src/game/StreetPhysics.js';
import {CopingTrace} from '../src/game/CopingTrace.js';
import {partialDeckContactDuringReturn} from '../src/game/core/TransitionReentryResult.js';
import {SAFE_COPING_EXIT} from '../src/game/SafeCopingExitSkillStreetPhysics.js';
import {readFileSync} from 'node:fs';
import {splitOrbitScene} from '../src/park/OrbitPark.js';
import {ParkCollision} from '../src/game/ParkCollision.js';

const root=await loadGeometry('public/assets/warehouse/granwarehouse.glb');
excludeGrandWarehouseMisplacedSixStair(root);
const world=buildImportedWarehouseCollision(root,createWarehousePark({textures:false}).manifest.rails,{grandMode:true});
const rig=await loadRuntimeBoardRig();
const v=a=>new THREE.Vector3(...a);

function descendingReturn(rail,inward,{stance=1,angle=0,radial=.1,trick=null,nearVertical=false,
  activeWorld=world,segment=null}={}){
  const a=v(rail.points[segment??0]),b=v(rail.points[segment===null?rail.points.length-1:segment+1]);
  const lip=a.clone().add(b).multiplyScalar(.5),tangent=b.sub(a).setY(0).normalize();
  const rider=new StatefulSkillStreetPhysics({collision:activeWorld.collision,spawn:lip.toArray(),rails:activeWorld.rails,
    playableRegions:[{minX:-250,maxX:250,minZ:-250,maxZ:250}]});
  rider.setBoardContactRig(rig);
  const face=rider.surface.ground(lip.clone().addScaledVector(inward,.8).add(v([0,1,0])),1,10);
  assert.ok(face&&face.normal.dot(inward)>.15,'fixture must find the real ramp face');
  const heading=Math.atan2(inward.x,inward.z)+angle;
  rider.reset(lip,heading);rider.position.copy(lip).addScaledVector(inward,radial).add(v([0,.6,0]));
  if(nearVertical)face.normal.copy(inward).multiplyScalar(Math.sqrt(1-.13**2)).setY(.13);
  rider.normal.copy(face.normal);rider.groundDirection();rider.stance=stance;
  const edge={lipPoint:lip,copingTangent:tangent,rampInward:inward,deckOutward:inward.clone().negate(),
    surfaceNormal:face.normal,name:rail.name,transitionId:rail.transition.id};
  const air=rider.transitions.begin(lip,v([0,8,0]),edge,{boardForward:rider.forward});
  air.apexPassed=true;air.frame.takeoffFacing=v([-Math.sin(heading),0,-Math.cos(heading)]);
  air.frame.takeoffHeading=heading;air.frame.takeoffStance=stance;
  rider.transitionAir=air;rider.airTakeoffFromRamp=true;rider.airTakeoffHeading=heading;
  rider.airHeading=heading;rider.airTime=.7;rider.setMovementState(MOVEMENT_STATE.VERT_AIR);
  rider.velocity.set(0,nearVertical?-12.3:-4,0);rider.copingTrace=new CopingTrace(300);
  if(trick==='flip')rider.flipState={name:'Kickflip',duration:.7,progress:.94,roll:1};
  if(trick==='grab')rider.grabState={name:'Indy',points:100,heldTime:.3};
  return {rider,lip,heading};
}

test('regressions use the measured shipped board, including the extended deck',()=>{
  assert.ok(Math.abs(rig.deckLength-1.4868)<1e-5);
  assert.ok(rig.rearTruckZ-rig.frontTruckZ>.67);
  assert.ok(Math.abs(rig.wheelContactY)<1e-6);
});

for(const [fragment,inward]of[
 ['imported 12',v([0,0,1])],['imported 12.1',v([0,0,-1])],['imported 14',v([-1,0,0])],
])for(const variant of[
 {name:'straight regular'}, {name:'switch',stance:-1}, {name:'diagonal',angle:.3},
 {name:'completed flip',trick:'flip'}, {name:'held grab',trick:'grab'},
 {name:'recorded front truck on flat deck',nearVertical:true,radial:.30},
])test(`runtime board returns downhill: ${fragment}, ${variant.name}`,()=>{
  const rail=world.rails.find(r=>r.name.endsWith(fragment));assert.ok(rail);
  const outcomes=[];
  for(const fps of [30,60,120]){
    const {rider,lip,heading}=descendingReturn(rail,inward,variant);
    let accepted=false,downhill=false,stationary=0,worst=0,minimumY=Infinity;
    for(let i=0;i<fps*2;i++){
      rider.advance(1/fps,{grabHeld:variant.trick==='grab'});
      assert.ok(rider.position.toArray().every(Number.isFinite));assert.equal(rider.bailTime,0);
      if(rider.grounded){accepted=true;downhill ||=rider.velocity.y<-.5;assert.equal(rider.transitionAir,null);}
      minimumY=Math.min(minimumY,rider.position.y);
      stationary=rider.position.y>lip.y-.5&&rider.velocity.length()<.5?stationary+1/fps:0;
      worst=Math.max(worst,stationary);
    }
    assert.ok(accepted&&downhill,'return never acquired downhill wheel support');
    assert.ok(minimumY<lip.y-1.5,'return remained at the lip');
    assert.ok(worst<.2,'unexplained coping stall');
    assert.ok(Math.abs(Math.atan2(Math.sin(rider.heading-heading),Math.cos(rider.heading-heading)))<1e-6);
    assert.equal(rider.landingYawInvariantViolations,0);
    outcomes.push(rider.position.clone());
  }
  assert.ok(outcomes[0].distanceTo(outcomes[2])<1e-6,'fixed-step return depends on render cadence');
});

test('coping trace bounds history, preserves order and exports independent snapshots',()=>{
 const trace=new CopingTrace(2),rider={position:v([0,1,0]),velocity:v([1,0,0]),normal:v([0,1,0]),bailTime:0};
 for(let i=0;i<4;i++){trace.begin(rider,{steer:i},1/120);trace.contact('candidate',null,'unsupported');trace.finish(rider);}
 const data=trace.snapshot();assert.deepEqual(data.map(x=>x.frame),[2,3]);
 data[0].before.position[0]=999;assert.equal(trace.snapshot()[0].before.position[0],0);
 assert.equal(data[1].decisions[0].reason,'unsupported');
});

test('full halfpipe approach keeps return ownership through a partial flat truck catch',()=>{
 const p=new StatefulSkillStreetPhysics({collision:world.collision,spawn:[3,.1,-40.8],rails:world.rails,
   playableRegions:[{minX:-90,maxX:90,minZ:-70,maxZ:70}]});
 p.setBoardContactRig(rig);p.reset();p.velocity.copy(p.forward).multiplyScalar(17);
 let launched=false,returned=false;const positions=[];
 for(let i=0;i<600;i++){
  p.advance(1/120,{});launched ||=!!p.transitionAir;
  if(launched&&p.grounded&&p.velocity.y<-.5)returned=true;
  assert.equal(p.bailTime,0);
  positions.push(p.position.clone());if(positions.length>30)positions.shift();
  if(positions.length===30&&Math.abs(p.position.y-5.76328)<.4){
   const box=new THREE.Box3().setFromPoints(positions);
   assert.ok(box.getSize(new THREE.Vector3()).length()>.10,'air/deck catch is repeating at the lip');
  }
 }
 assert.ok(launched&&returned,'never completed a real halfpipe return');
});

test('partial deck deferral never captures transfers, full decks or outward landings',()=>{
 const rail=world.rails.find(r=>r.name.endsWith('imported 12'));
 const {rider}=descendingReturn(rail,v([0,0,1]),{nearVertical:true,radial:.3});
 const air=rider.transitionAir,position=air.frame.lipPoint.clone().add(v([0,0,.3]));
 const support={supported:true,position:position.clone(),normal:v([0,1,0]),count:2,frontSupported:2,rearSupported:0};
 const context={support,air,position,rig,config:SAFE_COPING_EXIT};
 assert.equal(partialDeckContactDuringReturn(context),true);
 assert.equal(partialDeckContactDuringReturn({...context,air:{...air,transferring:true}}),false);
 assert.equal(partialDeckContactDuringReturn({...context,support:{...support,rearSupported:2}}),false);
 assert.equal(partialDeckContactDuringReturn({...context,position:air.frame.lipPoint.clone().add(v([0,0,-.3]))}),false);
 assert.equal(partialDeckContactDuringReturn({...context,position:position.clone().add(v([0,0,2]))}),false);
});

const orbitManifest=JSON.parse(readFileSync('public/assets/spacepark/orbit-manifest.json'));
const orbit=splitOrbitScene(await loadGeometry('public/assets/spacepark/orbit.glb'),orbitManifest.rails);
const orbitSurface=new ParkCollision(orbit.collision);
for(const rail of orbit.rails.filter(r=>r.transition?.supportsVert)){
 const segment=rail.transition.type==='BOWL'?Math.floor((rail.points.length-2)/4):null;
 const a=v(rail.points[segment??0]),b=v(rail.points[segment===null?rail.points.length-1:segment+1]);
 const lip=a.clone().add(b).multiplyScalar(.5),tangent=b.sub(a).setY(0).normalize();
 const direction=[-1,1].map(side=>new THREE.Vector3(-tangent.z,0,tangent.x).multiplyScalar(side)).find(inward=>{
  const face=orbitSurface.ground(lip.clone().addScaledVector(inward,.8).add(v([0,1,0])),1,10);
  return face&&face.normal.y<.95&&face.normal.dot(inward)>.15;
 });
 test(`ORBIT measured-board coping return: ${rail.name}`,()=>{
  assert.ok(direction,'authored lip has no inward ramp face');
  for(const fps of [30,60,120]){
   const {rider,lip}=descendingReturn(rail,direction,{activeWorld:orbit,segment,nearVertical:true,radial:.3});
   let landed=false,descent=false,minimumY=lip.y;
   for(let i=0;i<fps*2;i++){
    rider.advance(1/fps,{});assert.equal(rider.bailTime,0);
    if(rider.grounded){landed=true;descent ||=rider.velocity.y<-.3;}
    minimumY=Math.min(minimumY,rider.position.y);
    assert.ok(rider.position.toArray().every(Number.isFinite));
   }
   assert.ok(landed&&descent,'ORBIT return never acquired downhill wheel support');
   assert.ok(minimumY<lip.y-.35,'ORBIT return remained at the coping');
  }
 });
}
