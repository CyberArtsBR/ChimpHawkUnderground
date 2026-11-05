import * as T from 'three';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {loadGeometry} from './load-geometry.mjs';
import {loadRuntimeBoardRig} from './quality-board-rig.mjs';
import {buildImportedWarehouseCollision} from '../src/park/ImportedWarehouseCollision.js';
import {createWarehousePark} from '../src/park/WarehousePark.js';
import {excludeGrandWarehouseMisplacedSixStair} from '../src/park/GrandWarehouseSceneFilter.js';
import {splitOrbitScene} from '../src/park/OrbitPark.js';
import {ParkCollision} from '../src/game/ParkCollision.js';
import {StatefulSkillStreetPhysics} from '../src/game/StatefulSkillStreetPhysics.js';
import {PHYSICS} from '../src/game/StreetPhysics.js';
import assert from 'node:assert/strict';
const V=a=>new T.Vector3(...a),dt=1/120,traceMode=process.env.RAMP_TRACE==='1';
const root=await loadGeometry('public/assets/warehouse/granwarehouse.glb');
excludeGrandWarehouseMisplacedSixStair(root);
const warehouse=buildImportedWarehouseCollision(root,createWarehousePark({textures:false}).manifest.rails,{grandMode:true});
const manifest=JSON.parse(await readFile('public/assets/spacepark/orbit-manifest.json','utf8'));
const orbit=splitOrbitScene(await loadGeometry('public/assets/spacepark/orbit.glb'),manifest.rails);
const rig=await loadRuntimeBoardRig();
const worlds=[{id:'grand-warehouse',...warehouse},{id:'orbit',collision:orbit.collision,rails:orbit.rails}];
const report={gravity:PHYSICS.gravity,dt,method:'Node actual StatefulSkillStreetPhysics + shipped GLB collision + measured runtime board. Scripted held/released inputs; initial placement/speed are fixtures, not physical controller or full player approach. 4s maximum per case. Release distance is local signed horizontal distance to sampled lip, not nearest curved coping distance.',rig,rows:[],skipped:[]};
for(const world of worlds){
 if(traceMode&&world.id!=='grand-warehouse')continue;
 const surface=new ParkCollision(world.collision);
 const picked=[];
 for(const type of world.id==='orbit'?['BOWL','QUARTER']:['VERT','QUARTER']){
  const rails=world.rails.filter(r=>r.transition?.supportsVert&&r.transition.type===type);
  let fixture=null;
  outer:for(const rail of rails){
   const indices=[Math.floor((rail.points.length-2)/4),Math.floor((rail.points.length-2)/2),0];
   for(const index of [...new Set(indices)]){
    const a=V(rail.points[index]),b=V(rail.points[index+1]),lip=a.clone().add(b).multiplyScalar(.5),tangent=b.clone().sub(a).setY(0).normalize();
    for(const side of[-1,1]){
     const inward=new T.Vector3(-tangent.z,0,tangent.x).multiplyScalar(side);
     const near=surface.ground(lip.clone().addScaledVector(inward,.8).add(V([0,1,0])),1,12);
     if(!near||near.normal.y>.98||near.normal.dot(inward)<.15)continue;
     const start=surface.ground(lip.clone().addScaledVector(inward,3.4).add(V([0,1,0])),1,12);
     if(!start)continue;
     fixture={rail,lip,inward,start,type};break outer;
    }
   }
  }
  if(fixture)picked.push(fixture);else report.skipped.push({map:world.id,type,reason:'no sampled valid inward 3.4m approach'});
 }
 for(const f of picked){
  const cases=[];
  for(const speed of[10])for(const hold of[.08,.32])for(const timing of['early','near','late'])cases.push({speed,hold,timing,stance:1,angle:0});
  for(const stance of[-1,1])for(const angle of[.30])for(const timing of['early','near','late'])cases.push({speed:10,hold:.32,timing,stance,angle});
  cases.push({speed:10,hold:0,timing:'passive',stance:1,angle:0});
  cases.push({speed:17,hold:.32,timing:'near',stance:1,angle:0,transfer:true});
  cases.push({speed:5,hold:.32,timing:'near',stance:-1,angle:0});
  for(const c of cases){
   if(traceMode&&!(c.hold===.08&&c.timing==='early'&&c.stance===1&&c.angle===0&&c.speed===(f.type==='VERT'?10:17)))continue;
   const s=new StatefulSkillStreetPhysics({collision:world.collision,spawn:f.start.point.toArray(),rails:world.rails,playableRegions:[{minX:-300,maxX:300,minZ:-300,maxZ:300}]});
   s.setBoardContactRig(rig);const heading=Math.atan2(f.inward.x,f.inward.z)+c.angle;
   s.reset(f.start.point.clone().add(V([0,.12,0])),heading);s.stance=c.stance;s.normal.copy(f.start.normal);s.groundDirection();s.velocity.copy(s.forward).multiplyScalar(c.speed);
   let started=false,released=false,holdElapsed=0,release=null,launch=null,peak=s.position.y,returned=false,stuck=0,maxStall=0,bailed=false,airSteps=0,previousGround=s.grounded;
   const trace=[];
   for(let i=0;i<480;i++){
    const distance=s.position.clone().sub(f.lip).dot(f.inward),outward=Math.max(.3,-s.velocity.dot(f.inward));
    const releaseDistance=c.timing==='early'?2.5:.45;
    if(c.timing!=='passive'&&!started&&distance<=releaseDistance+outward*c.hold){started=true;}
    if(!s.grounded)airSteps++;
    const shouldRelease=started&&!released&&(c.timing==='late'?airSteps*dt>=.05:distance<=releaseDistance);
    if(shouldRelease){released=true;release={at:i*dt,distance,charge:s.charge,held:holdElapsed,speed:s.velocity.length(),vertical:s.velocity.y,normalY:s.normal.y,grounded:s.grounded,approach:!!s.transitions.approachAt(s.position,s.normal,s.velocity)};}
    const held=started&&!released;
    if(held)holdElapsed+=dt;
    s.advance(dt,{ollieHeld:held,ollieReleased:shouldRelease,vertExit:!!c.transfer});
    assert.ok([...s.position.toArray(),...s.velocity.toArray()].every(Number.isFinite),'nonfinite runtime sample');
    if(traceMode&&(i%12===0||previousGround!==s.grounded||shouldRelease))trace.push({at:(i+1)*dt,position:s.position.toArray(),velocity:s.velocity.toArray(),grounded:s.grounded,normal:s.normal.toArray(),mode:s.movementState,transition:s.transitionAir?.transitionId||null,charge:s.charge,jumpBuffer:s.jumpBuffer,coyote:s.coyote,feedback:s.feedback});
    previousGround=s.grounded;
    if(!launch&&!s.grounded)launch={at:(i+1)*dt,y:s.position.y,vertical:s.velocity.y,speed:s.velocity.length(),mode:s.movementState,transition:s.transitionAir?.transitionId||null,requested:s.takeoffOllieRequested};
    peak=Math.max(peak,s.position.y);bailed ||=s.bailTime>0;
    if(launch&&s.grounded&&s.velocity.y<-.2)returned=true;
    const lipGap=Math.hypot(s.position.x-f.lip.x,s.position.z-f.lip.z);
    stuck=launch&&!s.grind&&!s.bailTime&&Math.abs(s.position.y-f.lip.y)<.6&&lipGap<.85&&s.velocity.length()<.5?stuck+dt:0;
    maxStall=Math.max(maxStall,stuck);
    if(launch&&(s.bailTime>0||returned))break;
   }
   report.rows.push({map:world.id,type:f.type,rail:f.rail.name,lip:f.lip.toArray(),...c,release,launch,peak,riseAboveDeparture:launch?peak-launch.y:null,peakAboveCoping:peak-f.lip.y,returned,bailed,maxStall,finalPosition:s.position.toArray(),finalVelocity:s.velocity.toArray(),finalMode:s.movementState,telemetry:s.getLaunchTelemetry?.(),trace:traceMode?trace:undefined,finite:s.position.toArray().every(Number.isFinite)});
  }
  console.log(world.id,f.type,f.rail.name,cases.length);
 }
}
report.summary={rows:report.rows.length,launched:report.rows.filter(r=>r.launch).length,returnedDownhill:report.rows.filter(r=>r.returned).length,bailed:report.rows.filter(r=>r.bailed).length,finite:report.rows.every(r=>r.finite),maxStall:Math.max(...report.rows.map(r=>r.maxStall))};
assert.equal(report.skipped.length,0,'missing actual geometry fixture');
assert.ok(report.summary.finite,'nonfinite runtime state');
assert.ok(report.summary.maxStall<.5,'true lip stall');
const nearHalf=report.rows.find(r=>r.map==='grand-warehouse'&&r.type==='VERT'&&r.hold===.32&&r.timing==='near'&&r.angle===0&&!r.transfer&&r.speed===10);
assert.equal(nearHalf.launch.mode,'VERT_AIR','near coping release changed launch path');
assert.equal(nearHalf.returned,true,'near coping release lost downhill return');
assert.ok(nearHalf.launch.at>nearHalf.release.at,'buffered release and departure must be distinct');
for(const row of report.rows){const credits=row.telemetry?.history.filter(e=>e.type==='credit')||[];assert.equal(new Set(credits.map(e=>e.releaseId)).size,credits.length,'duplicate charge credit');}
await mkdir('artifacts/astra-gameplay',{recursive:true});
await writeFile('artifacts/astra-gameplay/'+(process.env.RAMP_REPORT||'runtime.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify(report.summary));
