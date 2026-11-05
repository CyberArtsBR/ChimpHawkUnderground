import {mkdir,writeFile}from'node:fs/promises';
import * as THREE from 'three';
import {loadGeometry}from'./load-geometry.mjs';
import {UnrealRider}from'../src/character/UnrealRider.js';
import {StreetBoard}from'../src/skateboard/StreetBoard.js';
import {GRAB_QUALITY_NAMES,grabTransitionParams}from'./grab-quality-fixtures.mjs';
const rows=[];
for(const avatar of ['The_AdolescentUR','The_Heretic','The_Anchor','TuxR','thehollowf']) {
 const rider=new UnrealRider(`/assets/rider/${avatar}.glb`).configureModel(await loadGeometry(`public/assets/rider/${avatar}.glb`));
 const board=new StreetBoard('fixture');board.prepareContactGeometry(await loadGeometry('public/assets/rider/skateboard.glb'));
 for(const stance of [1,-1])for(const name of GRAB_QUALITY_NAMES) {
  rider.resetPresentation();board.resetPresentation();const prior={};let maximum={head:0,pelvis:0,wrist:0,ankle:0};
  for(let frame=0;frame<264;frame++) {
   const params=grabTransitionParams(name,stance,frame/120);board.update(params);rider.update({...params,board});
   for(const joint of ['head','pelvis','hand_l','hand_r','foot_l','foot_r']) {
    const point=rider.bones[joint].getWorldPosition(new THREE.Vector3());
    const category=joint.startsWith('hand')?'wrist':joint.startsWith('foot')?'ankle':joint;
    if(frame>35&&prior[joint])maximum[category]=Math.max(maximum[category],point.distanceTo(prior[joint]));
    prior[joint]=point;
   }
  }
  rows.push({avatar,stance,name,maximumStep:maximum});
 }
 rider.dispose();
}
await mkdir('artifacts/evolution-cycle3',{recursive:true});
await writeFile('artifacts/evolution-cycle3/grab-transition-final.json',JSON.stringify(rows,null,2));
console.log(JSON.stringify(['The_AdolescentUR','The_Heretic','The_Anchor','TuxR','thehollowf'].map(avatar=>({avatar,head:Math.max(...rows.filter(row=>row.avatar===avatar).map(row=>row.maximumStep.head)),pelvis:Math.max(...rows.filter(row=>row.avatar===avatar).map(row=>row.maximumStep.pelvis))})),null,2));
