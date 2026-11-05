import fs from 'node:fs';
import * as THREE from 'three';
import { loadGeometry } from './load-geometry.mjs';
import { assembleTestMap } from '../src/game/TestMapLoader.js';
import { StatefulSkillStreetPhysics } from '../src/game/StatefulSkillStreetPhysics.js';

const root=await loadGeometry(process.argv[2]);
let meta;
root.traverse(o=>{if(o.userData.streetSkateMap){meta=JSON.parse(o.userData.streetSkateMap);if(meta.presentation)meta.presentation.environmentFromSky=false;
 o.userData.streetSkateMap=JSON.stringify(meta);}});
const world=assembleTestMap(root);
const report=[];
for(const trial of [
 {name:'small-quarter-front',spawn:[112,4.16,-70],heading:0},
 {name:'small-quarter-back',spawn:[112,4.16,-82],heading:Math.PI},
 {name:'small-quarter-front-fast',spawn:[112,4.16,-70],heading:0,speed:17},
 {name:'small-quarter-back-fast',spawn:[112,4.16,-82],heading:Math.PI,speed:17},
 {name:'small-quarter-coast',spawn:[112,4.16,-70],heading:0,drive:0},
 {name:'small-quarter-standing-start',spawn:[112,4.16,-68],heading:0,speed:0,expectLaunch:false},
]) {
 const rider=new StatefulSkillStreetPhysics({collision:world.collision,spawn:trial.spawn,rails:world.manifest.rails,playableRegions:world.manifest.playableRegions});
 rider.reset(new THREE.Vector3(...trial.spawn),trial.heading);rider.speed=trial.speed??10;rider.groundDirection();rider.velocity.copy(rider.forward).multiplyScalar(rider.speed);
 let maxY=rider.position.y,flight=null,bails=0,stationary=0,maxStationary=0;const trace=[];
 for(let i=0;i<2400;i++){
  rider.advance(1/120,{drive:trial.drive??1,steer:0});maxY=Math.max(maxY,rider.position.y);
  if(rider.transitionAir&&!flight)flight={time:i/120,id:rider.transitionAir.transitionId||rider.transitionAir.frame?.transitionId,position:rider.position.toArray(),velocity:rider.velocity.toArray()};
  if(rider.bailTime>0)bails++;
  // Horizontal speed approaches zero at a valid vert apex: only count a hang
  // when the complete 3D velocity remains near zero at the recorded lip.
  if(rider.velocity.length()<.3&&rider.position.y>8.7&&rider.position.z<-74&&rider.position.z>-78)stationary+=1/120;else stationary=0;
  maxStationary=Math.max(maxStationary,stationary);
  if(i%30===0)trace.push({time:i/120,p:rider.position.toArray(),v:rider.velocity.toArray(),n:rider.normal.toArray(),grounded:rider.grounded,mode:rider.movementState,speed:rider.speed,flight:!!rider.transitionAir,bail:rider.bailTime});
 }
 report.push({name:trial.name,expectLaunch:trial.expectLaunch!==false,transitions:rider.coreController.transitions.transitions.length,maxY,flight,bailFrames:bails,maxStationary,position:rider.position.toArray(),trace});
}
if(process.argv[3])fs.writeFileSync(process.argv[3],JSON.stringify(report,null,2));
console.log(JSON.stringify(report.map(({trace,...r})=>r),null,2));
if(process.argv.includes('--assert')) {
 for(const r of report) {
  if((r.expectLaunch&&!r.flight)||r.maxStationary>.75)throw new Error(`${r.name}: missing takeoff or rider trapped at lip (${r.maxStationary}s)`);
  if(!r.expectLaunch&&!r.trace.some(t=>t.grounded&&t.v[1]<-1&&t.p[2]<-74))throw new Error(`${r.name}: low-energy approach did not roll back`);
 }
}
