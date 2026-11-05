import {mkdir,writeFile} from 'node:fs/promises';
import * as T from 'three';
import {UnrealRider} from '../src/character/UnrealRider.js';
import {StreetBoard} from '../src/skateboard/StreetBoard.js';
import {loadGeometry} from './load-geometry.mjs';
import {grabPalmOrientation} from '../src/character/GrabReachPose.js';
import {plantedFootWorldPoint} from '../src/character/FootOrientation.js';
const rows=[],v=()=>new T.Vector3();
for(const avatar of ['The_AdolescentUR','The_Heretic','The_Anchor','TuxR']){
 const r=new UnrealRider(`/assets/rider/${avatar}.glb`).configureModel(await loadGeometry(`public/assets/rider/${avatar}.glb`));
 const b=new StreetBoard('fixture');b.prepareContactGeometry(await loadGeometry('public/assets/rider/skateboard.glb'));
 for(const stance of [1,-1])for(const name of ['Indy','Melon','Nosegrab','Tailgrab','Japan','Stalefish','Airwalk']){
  r.resetPresentation();b.resetPresentation();const p={airborne:true,presentation:{state:'AIR'},grabState:{name},grabWeight:1,stance,dt:1/120,airTime:.5};
  for(let i=0;i<100;i++){b.update(p);r.update({...p,board:b});}r.root.updateMatrixWorld(true);
  for(const side of ['l','r']){
   const target=r.grabTarget(name,side,stance,b);if(!target)continue;
   const h=r.bones[`hand_${side}`],l=r.bones[`lowerarm_${side}`],u=r.bones[`upperarm_${side}`];
   const palm=r.grabPalms[side],center=v();for(const x of palm.samples){x.mesh.skeleton.update();center.add(x.mesh.getVertexPosition(x.vertex,v()).applyMatrix4(x.mesh.matrixWorld));}center.divideScalar(palm.samples.length);
   const shoulder=u.getWorldPosition(v()),elbow=l.getWorldPosition(v()),wrist=h.getWorldPosition(v()),length=shoulder.distanceTo(elbow)+elbow.distanceTo(wrist);
   const up=v().set(0,1,0).applyQuaternion(b.root.getWorldQuaternion(new T.Quaternion()));
   const ideal=grabPalmOrientation(palm,target.clone().sub(plantedFootWorldPoint(b,0,0,0,v())),up);
   const currentOffset=palm.point.clone().multiply(h.getWorldScale(v())).applyQuaternion(h.getWorldQuaternion(new T.Quaternion()));
   const idealOffset=palm.point.clone().multiply(h.getWorldScale(v())).applyQuaternion(ideal);
   const currentGoal=target.clone().sub(currentOffset),idealGoal=target.clone().sub(idealOffset);
   rows.push({avatar,stance,name,side,palmGap:center.distanceTo(target),armLength:length,
    currentOrientationReachExcess:shoulder.distanceTo(currentGoal)-length,
    idealOrientationReachExcess:shoulder.distanceTo(idealGoal)-length,
    orientationOffsetDifference:currentOffset.distanceTo(idealOffset),actualPalmOffsetError:center.distanceTo(wrist.clone().add(currentOffset))});
  }
 }
 r.dispose();
}
const out='artifacts/astra-implementation/animation';await mkdir(out,{recursive:true});await writeFile(`${out}/reach-diagnostic-${process.argv[2]||'current'}.json`,JSON.stringify(rows,null,2));
console.log(JSON.stringify(rows.sort((a,b)=>b.palmGap-a.palmGap).slice(0,16),null,2));
