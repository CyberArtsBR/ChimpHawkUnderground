import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {loadGeometry} from '../tools/load-geometry.mjs';
import {collectSoleSamples,minimumSoleHeight} from '../tools/sole-samples.mjs';
import {UnrealRider} from '../src/character/UnrealRider.js';
import {StreetBoard} from '../src/skateboard/StreetBoard.js';

const fixtures=[];
for(const name of ['The_AdolescentUR','The_Heretic','The_Anchor','TuxR']){
 const rider=new UnrealRider(`/assets/rider/${name}.glb`).configureModel(await loadGeometry(`public/assets/rider/${name}.glb`));
 const board=new StreetBoard('fixture');board.prepareContactGeometry(await loadGeometry('public/assets/rider/skateboard.glb'));rider.deckHeight=board.deckHeight;
 const parent=new THREE.Group();parent.position.set(3,1,-2);parent.rotation.set(.35,.3,.14);parent.add(board.root,rider.root);parent.updateMatrixWorld(true);
 fixtures.push({name,rider,board,parent,samples:collectSoleSamples(rider)});
}

function sequence(fixture,{fps=144,manual='noseManual',stance=1,guard=true}={}){
 const {rider,board,parent,samples}=fixture,bounds=rider.footSupportBounds;
 rider.resetPresentation();board.resetPresentation();if(!guard)rider.footSupportBounds=[];
 const supportPlane={normal:new THREE.Vector3(.08,.99,.09).normalize(),offset:-.08};
 const normal=supportPlane.normal.clone().applyQuaternion(parent.quaternion),origin=parent.getWorldPosition(new THREE.Vector3());
 let minimum=Infinity;const endpoints={};
 try{for(let i=0;i<=Math.ceil(fps*3.4);i++){
  const time=i/fps,flatland=time>.7&&time<2?'Handstand':null,params={manual,flatland,stance,supportPlane,time,dt:1/fps,presentation:{state:flatland?'FLATLAND':manual==='manual'?'MANUAL':'NOSE_MANUAL'}};
  board.update(params);rider.update({...params,board});parent.updateMatrixWorld(true);
  minimum=Math.min(minimum,minimumSoleHeight(samples,normal,origin)+supportPlane.offset);
  if(i===Math.round(fps*1.8)||i===Math.round(fps*3.4))endpoints[i===Math.round(fps*1.8)?'held':'upright']=['pelvis','head','hand_l','hand_r','foot_l','foot_r'].map(name=>rider.bones[name].getWorldPosition(new THREE.Vector3()).toArray());
 }}finally{rider.footSupportBounds=bounds;}
 return {minimum,endpoints};
}

test('actual shoes stay above tilted support through both manual/Handstand entry and exit at low/high frame rates',()=>{
 for(const fixture of fixtures){
  assert.ok(fixture.samples.reduce((n,s)=>n+s.indices.length,0)>100,'test must sample real shoe geometry');
  const contact=structuredClone(fixture.board.contactRig),parentPosition=fixture.parent.position.toArray(),parentQuaternion=fixture.parent.quaternion.toArray();
  for(const fps of [15,144])for(const manual of ['manual','noseManual'])for(const stance of [1,-1]){
   const result=sequence(fixture,{fps,manual,stance});assert.ok(result.minimum>=-.002,`${fixture.name}/${fps}/${manual}/${stance}: shoe penetrated ${result.minimum}m`);
  }
  assert.deepEqual(fixture.board.contactRig,contact);assert.deepEqual(fixture.parent.position.toArray(),parentPosition);assert.deepEqual(fixture.parent.quaternion.toArray(),parentQuaternion);
 }
});

test('mid-inversion clearance fixes the reproduced sweep while preserving approved held/upright endpoints',()=>{
 const fixture=fixtures[0],before=sequence(fixture,{guard:false}),after=sequence(fixture);
 assert.ok(before.minimum<-.01,`fixture must reproduce the old shoe sweep: ${before.minimum}`);
 assert.ok(after.minimum>=0,`corrected shoes must clear support: ${after.minimum}`);
 for(const key of ['held','upright'])for(let i=0;i<before.endpoints[key].length;i++){
  assert.ok(new THREE.Vector3(...before.endpoints[key][i]).distanceTo(new THREE.Vector3(...after.endpoints[key][i]))<1e-5,`${key}: approved endpoint changed`);
 }
 for(const fixture of fixtures)fixture.rider.dispose();
});
