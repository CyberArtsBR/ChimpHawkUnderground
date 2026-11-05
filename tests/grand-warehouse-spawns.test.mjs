import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { ensureGrandWarehouseSpawns } from '../src/park/GrandWarehouseSpawns.js';
test('Grand spawn repair leaves ramp transforms alone and picks close four-wheel candidates',()=>{
  const world={manifest:{spawn:[0,.15,0],spawnHeading:0,playableRegions:[{minX:-74,maxX:74,minZ:-54,maxZ:54}],
    spots:[{id:'near',position:[0,.15,0],heading:0},{id:'other',position:[5,.15,5],heading:0}],
    statistics:{}},collision:new THREE.Group()};
  const floor=new THREE.Mesh(new THREE.PlaneGeometry(150,110),new THREE.MeshBasicMaterial());
  floor.rotation.x=-Math.PI/2;
  floor.userData.surface='rideable';world.collision.add(floor);
  const originalRotation=floor.rotation.clone();
  const originalPosition=floor.position.clone();
  ensureGrandWarehouseSpawns(world);
  assert.equal(world.manifest.spots.length,2);
  assert.ok(new THREE.Vector3(...world.manifest.spots[0].position).distanceTo(new THREE.Vector3(...world.manifest.spawn))>2);
  assert.deepEqual(floor.rotation.toArray(),originalRotation.toArray());
  assert.deepEqual(floor.position.toArray(),originalPosition.toArray());
});
