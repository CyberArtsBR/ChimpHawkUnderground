import{test}from'node:test';import assert from'node:assert/strict';import * as THREE from'three';
import{StreetBoard}from'../src/skateboard/StreetBoard.js';import{loadGeometry}from'../tools/load-geometry.mjs';

test('actual board envelope stays above support plane through both manuals and handstand transitions',async()=>{
 const board=new StreetBoard('fixture');board.prepareContactGeometry(await loadGeometry('public/assets/rider/skateboard.glb'));
 const rig=JSON.stringify(board.contactRig);let checked=0,min=Infinity;
 for(const hz of [15,30,60,144])for(const stance of [1,-1])for(const manual of ['manual','noseManual'])for(const lag of [0,-.08]){
  board.resetPresentation();const n=new THREE.Vector3(.08,.99,.09).normalize(),plane={normal:n,offset:lag};
  for(const flatland of [null,'Handstand',null,'Casper',null])for(let i=0;i<hz;i++){
   board.update({manual,flatland,stance,dt:1/hz,supportPlane:plane,manualBalance:Math.sin(i/hz*4)*.7});
   for(const c of board.supportCorners){const distance=c.clone().applyQuaternion(board.root.quaternion).add(board.root.position).dot(n)+lag;
    min=Math.min(min,distance);assert.ok(distance>=-1e-8,`${manual}/${flatland}/${hz}: ${distance}`);checked++;}
  }
  for(let i=0;i<hz;i++){board.update({stance,dt:1/hz,supportPlane:plane});for(const c of board.supportCorners)assert.ok(c.clone().applyQuaternion(board.root.quaternion).add(board.root.position).dot(n)+lag>=-1e-8);}
 }
 assert.ok(checked>1000);assert.equal(JSON.stringify(board.contactRig),rig);
});
test('support correction does not constrain airborne grabs, flips or bails',async()=>{
 const board=new StreetBoard('fixture');board.prepareContactGeometry(await loadGeometry('public/assets/rider/skateboard.glb'));
 for(const flags of [{airborne:true},{bail:true,bailProgress:.6},{flipState:{progress:.5,roll:1}},{grind:{profile:{presentation:{pitch:.2}}}}]){
  board.resetPresentation();board.update({...flags});const pos=board.root.position.clone(),q=board.root.quaternion.clone();
  board.resetPresentation();board.update({...flags,supportPlane:{normal:new THREE.Vector3(0,1,0),offset:-2}});
  assert.ok(pos.distanceTo(board.root.position)<1e-8);assert.ok(q.angleTo(board.root.quaternion)<1e-6);
 }
});
