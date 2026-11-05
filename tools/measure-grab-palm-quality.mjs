import { mkdir, writeFile } from 'node:fs/promises';
import * as T from 'three';
import {loadGeometry} from './load-geometry.mjs';
import {UnrealRider} from '../src/character/UnrealRider.js';
import {StreetBoard} from '../src/skateboard/StreetBoard.js';
import {plantedFootWorldPoint} from '../src/character/FootOrientation.js';
import {calibrateGrabPalms} from '../src/character/GrabReachPose.js';
import {loadRiderAtRevision} from './grab-quality-fixtures.mjs';
let Rider = UnrealRider;
const revision = process.argv.find(argument => argument.startsWith('--baseline='))?.split('=')[1];
if (revision) {
 Rider = await loadRiderAtRevision(revision);
}
const avatars=['The_AdolescentUR','The_Heretic','The_Anchor','TuxR','thehollowf'];
const rows=[];const v=()=>new T.Vector3();
for(const avatar of avatars){
 const rider=new Rider(`/assets/rider/${avatar}.glb`).configureModel(await loadGeometry(`public/assets/rider/${avatar}.glb`));
 // Baselines solve their original wrist targets. Both versions are measured
 // against the same real deck edge and the same deformed palmar mesh patch.
 rider.grabPalms ||= calibrateGrabPalms(rider.model,{l:rider.bones.hand_l,r:rider.bones.hand_r});
 const measureTarget=(name,side,stance,board)=>UnrealRider.prototype.grabTarget.call({...rider,calibratedGrabReach:true},name,side,stance,board);
 const board=new StreetBoard('fixture');board.prepareContactGeometry(await loadGeometry('public/assets/rider/skateboard.glb'));
 const trunk=[];const trunkBones=new Set(['pelvis','spine_01','spine_02','spine_03'].map(key=>rider.bones[key]));
 rider.model.traverse(mesh=>{if(!mesh.isSkinnedMesh)return;const indices=[],w=mesh.geometry.attributes.skinWeight,bi=mesh.geometry.attributes.skinIndex;for(let i=0;i<w.count;i++){let weight=0;for(let j=0;j<4;j++)if(trunkBones.has(mesh.skeleton.bones[bi.getComponent(i,j)]))weight+=w.getComponent(i,j);if(weight>.55)indices.push(i);}trunk.push({mesh,indices});});
 for(const stance of[1,-1])for(const name of['Indy','Melon','Nosegrab','Tailgrab','Japan','Stalefish']){
  rider.resetPresentation();board.resetPresentation();const p={stance,airborne:true,presentation:{state:'AIR'},grabState:{name},grabWeight:1,dt:1/120,airTime:.5};
  for(let i=0;i<90;i++){board.update(p);rider.update({...p,board,time:i/120});}
  let footError=0;for(const side of['l','r']){if(name==='Japan'&&side===(stance>0?'r':'l'))continue;const rg=board.contactRig,f=rider.feet[side].point,x=T.MathUtils.clamp(f.x,-Math.max(.15,rg.deckWidth*.43),Math.max(.15,rg.deckWidth*.43)),z=T.MathUtils.clamp(f.z,-Math.max(.35,rg.deckLength*.39),Math.max(.35,rg.deckLength*.39));const target=plantedFootWorldPoint(board,x,rg.deckTopY-board.deckHeight+rider.soleOffsets[side],z,v());footError=Math.max(footError,rider.bones['foot_'+side].getWorldPosition(v()).distanceTo(target));}
  rider.root.updateMatrixWorld(true);board.root.updateMatrixWorld(true);let minTrunk=Infinity;for(const{mesh,indices}of trunk){mesh.skeleton.update();for(const i of indices){const point=board.root.worldToLocal(mesh.getVertexPosition(i,v()).applyMatrix4(mesh.matrixWorld));if(Math.abs(point.x)<board.contactRig.deckWidth*.5&&Math.abs(point.z)<board.contactRig.deckLength*.5)minTrunk=Math.min(minTrunk,point.y-(board.contactRig.deckTopY-board.deckHeight));}}
  for(const side of['l','r']){const target=measureTarget(name,side,stance,board);if(!target)continue;const palm=rider.grabPalms[side];if(!palm)continue;let center=v(),nearest=Infinity;for(const sample of palm.samples){sample.mesh.skeleton.update();const point=sample.mesh.getVertexPosition(sample.vertex,v()).applyMatrix4(sample.mesh.matrixWorld);center.add(point);nearest=Math.min(nearest,point.distanceTo(target));}center.divideScalar(palm.samples.length);const h=rider.bones['hand_'+side];rows.push({avatar,stance,name,side,palmGap:center.distanceTo(target),nearestPalmVertexGap:nearest,wristGap:h.getWorldPosition(v()).distanceTo(target),palmNormalDotDeckUp:palm.normal.clone().transformDirection(h.matrixWorld).dot(v().set(0,1,0).applyQuaternion(board.root.getWorldQuaternion(new T.Quaternion()))),wristRotation:rider.rest.get(h).angleTo(h.quaternion),footError,minTrunkClearance:Number.isFinite(minTrunk)?minTrunk:null,palmSamples:palm.samples.length});}
 }
 rider.dispose();
}
const out='artifacts/evolution-cycle3';await mkdir(out,{recursive:true});await writeFile(`${out}/grab-palm-${process.argv[2]||'current'}.json`,JSON.stringify(rows,null,2));
console.log(JSON.stringify(avatars.map(avatar=>({avatar,mean:rows.filter(r=>r.avatar===avatar).reduce((n,r)=>n+r.palmGap,0)/12,Japan:rows.filter(r=>r.avatar===avatar&&r.name==='Japan').map(r=>r.palmGap),feet:Math.max(...rows.filter(r=>r.avatar===avatar).map(r=>r.footError)),trunk:Math.min(...rows.filter(r=>r.avatar===avatar&&r.minTrunkClearance!==null).map(r=>r.minTrunkClearance)),wrist:Math.max(...rows.filter(r=>r.avatar===avatar).map(r=>r.wristRotation))})),null,2));
