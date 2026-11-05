import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {loadGeometry} from '../tools/load-geometry.mjs';
import {UnrealRider} from '../src/character/UnrealRider.js';
import {StreetBoard} from '../src/skateboard/StreetBoard.js';
import {StreetSkater} from '../src/game/StreetSkater.js';
import {ALL_FLIP_LESSONS} from '../src/game/FlipLessons.js';
import {plantedFootWorldPoint} from '../src/character/FootOrientation.js';

const board=new StreetBoard('fixture');board.prepareContactGeometry(await loadGeometry('public/assets/rider/skateboard.glb'));
const rider=new UnrealRider('/assets/rider/The_AdolescentUR.glb').configureModel(await loadGeometry('public/assets/rider/The_AdolescentUR.glb'));rider.deckHeight=board.deckHeight;
const v=()=>new THREE.Vector3();

test('grab edges follow anatomy in regular and switch instead of changing with the reaching hand',()=>{
 board.update({dt:0});
 for(const stance of [1,-1]){
  const front=stance>0?'l':'r',rear=front==='l'?'r':'l',toe=Math.sign(rider.kneeForward.x);
  for(const [name,side,edge]of [['Indy',rear,1],['Melon',front,-1],['Stalefish',rear,-1]]){
   const target=board.root.worldToLocal(rider.grabTarget(name,side,stance,board));assert.ok(target.x*toe*edge>0,`${name}/${stance}: wrong rail`);
  }
 }
});

test('visual grab tuck never changes the physical root, contact rig or grounded support',()=>{
 const skater=new StreetSkater({collision:new THREE.Group(),spawn:[0,0,0],rails:[]});skater.visual.add(board.root,rider.root);skater.root.position.set(3,2,-4);skater.root.updateMatrixWorld(true);
 const root=skater.root.matrixWorld.toArray(),contact=structuredClone(board.contactRig),physicalPosition=skater.position.clone();
 board.update({airborne:true,grabState:{name:'Indy'},grabWeight:1});rider.update({board,airborne:true,presentation:{state:'AIR'},grabState:{name:'Indy'},grabWeight:1});
 assert.equal(board.grabLift,.18);assert.deepEqual(board.contactRig,contact);assert.ok(skater.position.equals(physicalPosition));assert.deepEqual(skater.root.matrixWorld.toArray(),root);
 board.update({airborne:false,grabState:{name:'Indy'},grabWeight:1});assert.equal(board.grabLift,0,'ground support never inherits the cosmetic tuck');
 skater.visual.remove(board.root,rider.root);
});

test('grab exit leaves all twelve flip paths identical and clears the cosmetic lift',()=>{
 for(const lesson of ALL_FLIP_LESSONS){
  board.resetPresentation();board.update({airborne:true,grabState:{name:'Indy'},grabWeight:1});board.resetPresentation();
  for(const progress of [.14,.34,.6,.94,1]){
   board.update({airborne:true,flipState:{...lesson.trick,progress}});assert.equal(board.grabLift,0);
   const pristine=new StreetBoard('fixture');pristine.deckHeight=board.deckHeight;pristine.contactRig=board.contactRig;pristine.update({airborne:true,flipState:{...lesson.trick,progress}});
   assert.ok(board.root.quaternion.angleTo(pristine.root.quaternion)<1e-6,lesson.id);assert.equal(board.root.position.y,pristine.root.position.y);
  }
 }
});

test('grab tuck keeps both ordinary grab feet planted and arm bones unscaled in either stance',()=>{
 const scales=new Map([...rider.rest.keys()].map(b=>[b,b.scale.toArray()]));
 for(const stance of [1,-1])for(const name of ['Indy','Melon','Nosegrab','Tailgrab','Stalefish']){
  rider.resetPresentation();board.resetPresentation();
  const params={airborne:true,presentation:{state:'AIR'},grabState:{name},grabWeight:1,stance,dt:1/120,airTime:.5};
  for(let i=0;i<90;i++){board.update(params);rider.update({...params,board});}
  for(const side of ['l','r']){
   const rig=board.contactRig,p=rider.feet[side].point,x=THREE.MathUtils.clamp(p.x,-Math.max(.15,rig.deckWidth*.43),Math.max(.15,rig.deckWidth*.43)),z=THREE.MathUtils.clamp(p.z,-Math.max(.35,rig.deckLength*.39),Math.max(.35,rig.deckLength*.39));
   const target=plantedFootWorldPoint(board,x,rig.deckTopY-board.deckHeight+rider.soleOffsets[side],z,v());
   const error=rider.bones['foot_'+side].getWorldPosition(v()).distanceTo(target);
   assert.ok(error<.015,`${name}/${stance}/${side}: missed board ${error}`);
  }
  for(const [bone,scale]of scales){assert.deepEqual(bone.scale.toArray(),scale);assert.ok(bone.quaternion.toArray().every(Number.isFinite));}
 }
 rider.dispose();
});
