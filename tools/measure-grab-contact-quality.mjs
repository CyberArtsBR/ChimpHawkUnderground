import {mkdir,writeFile} from 'node:fs/promises';
import * as THREE from 'three';
import {loadGeometry} from './load-geometry.mjs';
import {UnrealRider} from '../src/character/UnrealRider.js';
import {StreetBoard} from '../src/skateboard/StreetBoard.js';
const rows=[],out='artifacts/quality-pass/animation-visual';await mkdir(out,{recursive:true});
for(const avatar of ['The_AdolescentUR','The_Heretic','The_Anchor','TuxR']){
 const rider=new UnrealRider(`/assets/rider/${avatar}.glb`).configureModel(await loadGeometry(`public/assets/rider/${avatar}.glb`));
 const board=new StreetBoard('fixture');board.prepareContactGeometry(await loadGeometry('public/assets/rider/skateboard.glb'));rider.deckHeight=board.deckHeight;
 for(const stance of [1,-1])for(const name of ['Indy','Melon','Nosegrab','Tailgrab','Japan','Stalefish']){
  rider.resetPresentation();board.resetPresentation();
  const params={stance,presentation:{state:'AIR'},airborne:true,grabState:{name},grabWeight:1,airTime:.5,verticalVelocity:0,dt:1/120};
  for(let i=0;i<90;i++){board.update(params);rider.update({...params,board,time:i/120});}
  for(const side of ['l','r']){
   const target=rider.grabTarget(name,side,stance,board);if(!target)continue;
   const shoulder=rider.bones['upperarm_'+side].getWorldPosition(new THREE.Vector3()),elbow=rider.bones['lowerarm_'+side].getWorldPosition(new THREE.Vector3()),hand=rider.bones['hand_'+side].getWorldPosition(new THREE.Vector3());
   rows.push({avatar,stance,name,side,kneeForward:rider.kneeForward.toArray(),target:board.root.worldToLocal(target.clone()).toArray(),wrist:hand.toArray(),wristGap:hand.distanceTo(target),armLength:shoulder.distanceTo(elbow)+elbow.distanceTo(hand),reachRequired:shoulder.distanceTo(target)});
  }
 }
 rider.dispose();
}
await writeFile(`${out}/grab-contact-${process.argv[2]||'current'}.json`,JSON.stringify(rows,null,2));
console.log(JSON.stringify(rows.filter(row=>row.avatar==='The_AdolescentUR'&&row.stance===1),null,2));
