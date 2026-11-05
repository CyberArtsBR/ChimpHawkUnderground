import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createParadiseSurfaceDetail,createParadiseWearMask,PARADISE_DETAIL_LIMITS} from '../src/graphics/ParadiseSurfaceDetail.js';
import {loadGeometry} from '../tools/load-geometry.mjs';
import {assembleTestMap} from '../src/game/TestMapLoader.js';
import {disposeParkWorld} from '../src/game/ParkRegistry.js';

function flatWorld() {
  const park=new THREE.Group(),collision=new THREE.Group();
  const material=new THREE.MeshStandardMaterial({name:'Paradise / scanned concrete 4K'});
  park.add(new THREE.Mesh(new THREE.PlaneGeometry(30,30).rotateX(-Math.PI/2),material));
  return {park,collision,manifest:{spawn:[0,.04,0],rails:[]}};
}

test('surface masks are deterministic, transparent at borders and include broken wear',()=>{
  for(const style of ['scuff','patch','paint']) {
    const a=createParadiseWearMask(style),b=createParadiseWearMask(style);
    assert.deepEqual(a.image.data,b.image.data);
    assert.equal(a.image.width,256);
    const alpha=a.image.data.filter((_,index)=>index%4===3);
    assert.ok(alpha.some(value=>value>0));assert.ok(alpha.some(value=>value===0));
    for(let x=0;x<256;x++)assert.equal(a.image.data[x*4+3],0);
    a.dispose();b.dispose();
  }
});

test('projected wear stays on actual visual triangles and scales without changing collision',()=>{
  const world=flatWorld(),detail=createParadiseSurfaceDetail(world);
  assert.equal(world.collision.children.length,0);
  assert.equal(detail.root.parent,world.park);
  assert.equal(detail.root.userData.streetSkateRole,'decoration');
  assert.ok(detail.stats.triangles>0&&detail.stats.triangles<=PARADISE_DETAIL_LIMITS.triangles);
  assert.ok(detail.root.children.length<=3);
  for(const mesh of detail.root.children) {
    const pos=mesh.geometry.attributes.position;
    for(let i=0;i<pos.count;i++)assert.ok(Math.abs(pos.getY(i)-.004)<1e-6);
    assert.equal(mesh.castShadow,false);assert.equal(mesh.material.depthWrite,false);
  }
  const count=detail.root.children[0].geometry.drawRange.count;
  detail.setQuality({surfaceDetailScale:.45});assert.ok(detail.root.children[0].geometry.drawRange.count<count);
  detail.setQuality({surfaceDetailScale:0});assert.equal(detail.root.visible,false);
  detail.setQuality({surfaceDetailScale:1});assert.equal(detail.root.children[0].geometry.drawRange.count,count);
  disposeParkWorld(world);
});

test('no decals bridge unsupported gaps or use invisible riding proxies',()=>{
  const world=flatWorld();world.park.children[0].visible=false;
  const proxy=new THREE.Mesh(new THREE.PlaneGeometry(30,30).rotateX(-Math.PI/2),new THREE.MeshStandardMaterial({name:'Paradise / scanned concrete 4K'}));
  proxy.userData.streetSkateRole='collision';world.park.add(proxy);
  const detail=createParadiseSurfaceDetail(world);
  assert.equal(detail.stats.triangles,0);assert.equal(detail.root.children.length,0);
  disposeParkWorld(world);
});

test('bundled Skate Paradise wear has a bounded batch budget without adding riding surfaces',async()=>{
  const root=await loadGeometry('public/assets/park/skate-paradise.glb');
  root.traverse(o=>{if(o.userData.streetSkateMap){const m=JSON.parse(o.userData.streetSkateMap);m.presentation.environmentFromSky=false;o.userData.streetSkateMap=JSON.stringify(m);}});
  const world=assembleTestMap(root),collisions=world.collision.children.length;
  try {
    const detail=createParadiseSurfaceDetail(world);
    assert.ok(detail.stats.patches>=20,`found only ${detail.stats.patches} supported patches`);
    assert.equal(detail.stats.drawCalls,3);
    assert.ok(detail.stats.triangles<18000);assert.ok(detail.stats.patches<=48);
    assert.equal(world.collision.children.length,collisions);
  } finally {disposeParkWorld(world);}
});
