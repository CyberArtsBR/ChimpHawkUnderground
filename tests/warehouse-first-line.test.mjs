import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {loadGeometry} from '../tools/load-geometry.mjs';
import {loadRuntimeBoardRig} from '../tools/quality-board-rig.mjs';
import {createWarehousePark} from '../src/park/WarehousePark.js';
import {buildImportedWarehouseCollision} from '../src/park/ImportedWarehouseCollision.js';
import {excludeGrandWarehouseMisplacedSixStair} from '../src/park/GrandWarehouseSceneFilter.js';
import {ensureGrandWarehouseSpawns,GRAND_ENTRANCE_HEADING} from '../src/park/GrandWarehouseSpawns.js';
import {StatefulSkillStreetPhysics} from '../src/game/StatefulSkillStreetPhysics.js';
import {FollowCamera} from '../src/game/FollowCamera.js';

const root=await loadGeometry('public/assets/warehouse/granwarehouse.glb');
excludeGrandWarehouseMisplacedSixStair(root);
const world=createWarehousePark({textures:false}),imported=buildImportedWarehouseCollision(root,world.manifest.rails,{grandMode:true});
world.collision=imported.collision;world.manifest.rails=imported.rails;
const transforms=[];root.traverse(mesh=>transforms.push([mesh,mesh.matrixWorld.toArray()]));
ensureGrandWarehouseSpawns(world);
const rig=await loadRuntimeBoardRig();

test('Warehouse entrance provides a clear driven first line with the shipping collision and board',()=>{
 const rider=new StatefulSkillStreetPhysics({collision:world.collision,spawn:world.manifest.spawn,rails:imported.rails,playableRegions:world.manifest.playableRegions});
 rider.setBoardContactRig(rig);rider.reset(rider.spawn,world.manifest.spawnHeading);
 const view=new FollowCamera(new THREE.PerspectiveCamera(58,16/9,.08,1000));view.snap(rider);
 assert.ok(view.direction.dot(rider.forward)>.999,'initial view must snap behind the new entrance heading');
 let stationary=0,maxStationary=0;
 for(let i=0;i<120*20;i++){
  rider.advance(1/120,{drive:1});assert.equal(rider.bailTime,0,'first line must not bail');
  assert.ok(rider.position.toArray().every(Number.isFinite));
  stationary=i>360&&rider.velocity.length()<.5?stationary+1/120:0;maxStationary=Math.max(maxStationary,stationary);
 }
 assert.ok(rider.distance>200,'first line must carry into the plaza');
 assert.ok(maxStationary<.2,'first line must not park against the wooden wall');
});

test('Warehouse entrance direction is stable across preparation and leaves all imported art transforms intact',()=>{
 const spawn=[...world.manifest.spawn],spots=structuredClone(world.manifest.spots);
 assert.equal(world.manifest.spawnHeading,GRAND_ENTRANCE_HEADING);
 ensureGrandWarehouseSpawns(world);
 assert.deepEqual(world.manifest.spawn,spawn);assert.deepEqual(world.manifest.spots,spots);
 assert.equal(world.manifest.spawnHeading,GRAND_ENTRANCE_HEADING);
 for(const [mesh,matrix]of transforms)assert.deepEqual(mesh.matrixWorld.toArray(),matrix,mesh.name);
});
