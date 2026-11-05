import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {BailLiquid} from '../src/graphics/BailLiquid.js';
import {SkateRagdoll} from '../src/character/SkateRagdoll.js';

test('liquid waits for body ground contact rather than feet, walls or bail position',()=>{
  const ragdoll=new SkateRagdoll(),up=new THREE.Vector3(0,1,0);
  const point=new THREE.Vector3(8,2,4),node={name:'foot_l',velocity:new THREE.Vector3(2,-4,1)};
  ragdoll.recordGroundImpact(node,point,up);assert.equal(ragdoll.groundImpact,null);
  node.name='pelvis';ragdoll.recordGroundImpact(node,point,new THREE.Vector3(1,0,0));
  assert.equal(ragdoll.groundImpact,null);
  node.velocity.y=1;ragdoll.recordGroundImpact(node,point,up);assert.equal(ragdoll.groundImpact,null);
  node.velocity.y=-4;ragdoll.recordGroundImpact(node,point,up);
  assert.deepEqual(ragdoll.groundImpact.point.toArray(),[8,2,4]);
  point.set(0,0,0);ragdoll.recordGroundImpact(node,point,up);
  assert.deepEqual(ragdoll.groundImpact.point.toArray(),[8,2,4],'contact is captured once and not aliased');
});

test('swept torso impact captures collider contact before penetration',()=>{
  const ragdoll=new SkateRagdoll();
  const node={name:'spine_03',p:new THREE.Vector3(4,1,3),previous:new THREE.Vector3(3,2,3),
    velocity:new THREE.Vector3(1,-5,0),radius:.15,contactNormal:new THREE.Vector3()};
  const point=new THREE.Vector3(4,0,3),normal=new THREE.Vector3(0,1,0);
  ragdoll.collide(node,{sweepRideable(from,to,p,n){p.copy(point);n.copy(normal);return true;}});
  assert.deepEqual(ragdoll.groundImpact.point.toArray(),point.toArray());
  assert.equal(ragdoll.groundImpact.body,'spine_03');
});

test('puddle is raised geometry, threefold footprint, opaque glossy liquid and surface aligned',()=>{
  const root=new THREE.Group(),liquid=new BailLiquid(root);
  const normal=new THREE.Vector3(0,1,1).normalize(),point=new THREE.Vector3(7,2,-3);
  liquid.spawn({point,normal});liquid.update(.5);
  const p=liquid.puddles[0];p.mesh.geometry.computeBoundingBox();
  const box=p.mesh.geometry.boundingBox;
  assert.ok(box.max.x-box.min.x>1.2);assert.ok(box.max.y-box.min.y>.85);
  assert.ok(box.max.z>.02,'surface has real thickness');
  assert.equal(p.mesh.material.clearcoat,1);assert.equal(p.mesh.material.opacity,1);
  assert.ok(new THREE.Vector3(0,0,1).applyQuaternion(p.mesh.quaternion).distanceTo(normal)<1e-6);
  assert.ok(p.mesh.position.distanceTo(point.clone().addScaledVector(normal,.003))<1e-6);
  liquid.dispose();assert.equal(root.children.length,0);
});

test('splash uses bounded 3D droplets, clears on landing and reset, and pool is reused',()=>{
  const liquid=new BailLiquid(new THREE.Group()),impact={point:new THREE.Vector3(),normal:new THREE.Vector3(0,1,0)};
  liquid.spawn(impact,true);assert.equal(liquid.puddles[0].splash.count,4);
  liquid.update(.1);assert.equal(liquid.puddles[0].splash.visible,true);
  liquid.update(.7);assert.equal(liquid.puddles[0].splash.visible,false);
  for(let i=0;i<10;i++)liquid.spawn(impact);
  assert.equal(liquid.puddles.length,3);
  liquid.update(5);assert.ok(liquid.puddles.every(p=>!p.mesh.visible&&!p.splash.visible));
  liquid.spawn(impact);liquid.reset();assert.ok(liquid.puddles.every(p=>!p.mesh.visible&&!p.splash.visible));
  liquid.dispose();
});
