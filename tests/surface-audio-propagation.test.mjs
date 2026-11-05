import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { ParkCollision } from '../src/game/ParkCollision.js';
import { SkateboardContactRig } from '../src/game/SkateboardContactRig.js';
import { RailNetwork } from '../src/game/RailNetwork.js';
import { assembleTestMap } from '../src/game/TestMapLoader.js';
import { SURFACE_AUDIO, shippingSurfaceTag, surfaceAudioFor } from '../src/game/SurfaceAudio.js';

function floor(x,tag) {
  const mesh=new THREE.Mesh(new THREE.PlaneGeometry(5,5).rotateX(-Math.PI/2),new THREE.MeshBasicMaterial({side:THREE.DoubleSide}));
  mesh.position.x=x;if(tag!==undefined)mesh.userData.audioSurfaceTag=tag;return mesh;
}

test('collision probes and sweeps carry actual surface identity without retaining a prior tag',()=>{
  const root=new THREE.Group(),wood=floor(-4,'wood'),unknown=floor(4);
  root.add(wood,unknown);const surface=new ParkCollision(root),point=new THREE.Vector3(),normal=new THREE.Vector3();
  const first=surface.rayRideable(new THREE.Vector3(-4,1,0),new THREE.Vector3(0,-1,0),2,point,normal);
  assert.equal(first.object,wood);assert.equal(first.audioSurfaceTag,'wood');assert.ok(Number.isInteger(first.faceIndex));
  const swept=surface.sweepRideable(new THREE.Vector3(-4,1,0),new THREE.Vector3(-4,-1,0),point,normal);
  assert.equal(swept.object,wood);assert.equal(swept.audioSurfaceTag,'wood');
  const second=surface.rayRideable(new THREE.Vector3(4,1,0),new THREE.Vector3(0,-1,0),2,point,normal);
  assert.equal(second.object,unknown);assert.equal(second.audioSurfaceTag,'neutral');
  const rig=new SkateboardContactRig(surface);
  rig.snapToGround(new THREE.Vector3(-4,.1,0),0,.5,1);
  assert.equal(surfaceAudioFor({boardContact:rig}),SURFACE_AUDIO.wood);
  rig.snapToGround(new THREE.Vector3(4,.1,0),0,.5,1);
  assert.equal(surfaceAudioFor({boardContact:rig}),SURFACE_AUDIO.neutral);
  rig.snapToGround(new THREE.Vector3(100,.1,0),0,.5,1);
  assert.equal(surfaceAudioFor({boardContact:rig}),SURFACE_AUDIO.neutral);
});

test('shipping material registry is exact and explicit author metadata wins',()=>{
  const mesh=new THREE.Mesh(undefined,new THREE.MeshStandardMaterial({name:'Foundry_Plywood.006'}));
  assert.equal(shippingSurfaceTag(mesh),'wood');
  mesh.material.name='fake Foundry_Plywood';assert.equal(shippingSurfaceTag(mesh),'neutral');
  mesh.material.name='Foundry_Plywood';mesh.userData.audioSurfaceTag='rubber';
  assert.equal(shippingSurfaceTag(mesh),'rubber');
  mesh.userData.audioSurfaceTag='__proto__';assert.equal(shippingSurfaceTag(mesh),'neutral');
  delete mesh.userData.audioSurfaceTag;mesh.material=[mesh.material,new THREE.MeshStandardMaterial({name:'Foundry_Concrete'})];
  assert.equal(shippingSurfaceTag(mesh),'neutral','mixed materials are not guessed');
});

test('imported explicit map and rail tags survive validation and runtime network construction',()=>{
  const root=new THREE.Group(),group=new THREE.Group();root.add(group);group.userData.audioSurfaceTag='wood';
  const proxy=floor(0);proxy.scale.set(4,1,4);proxy.userData.streetSkateRole='collision';group.add(proxy);
  const visible=floor(0);visible.scale.set(4,1,4);root.add(visible);
  root.userData.streetSkateMap={version:1,name:'Tagged map',spawn:[0,.04,0],
    rails:[{name:'Arbitrary rail name',points:[[-2,1,-2],[2,1,-2]],radius:.055,audioSurfaceTag:'metal'}],
    playableRegions:[{minX:-10,maxX:10,minZ:-10,maxZ:10}]};
  const world=assembleTestMap(root);assert.equal(world.collision.children[0].userData.audioSurfaceTag,'wood');
  const network=new RailNetwork(world.manifest.rails);
  assert.equal(surfaceAudioFor({grind:{rail:network.rails[0]}}),SURFACE_AUDIO.metal);
  assert.equal(new RailNetwork([{...world.manifest.rails[0],audioSurfaceTag:'bad'}]).rails[0].audioSurfaceTag,'neutral');
});
