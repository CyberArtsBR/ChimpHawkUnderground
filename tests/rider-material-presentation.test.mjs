import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { calibrateRiderMaterials } from '../src/character/RiderMaterialPresentation.js';
import { refineWarehouseMaterials } from '../src/park/WarehouseMaterialPresentation.js';

test('known fully metallic Heretic costume gains diffuse response without replacing artwork',()=>{
  const root=new THREE.Group(),map=new THREE.Texture();
  const material=new THREE.MeshStandardMaterial({map,metalness:1,roughness:.4});
  root.add(new THREE.Mesh(new THREE.BoxGeometry(),material));
  calibrateRiderMaterials(root,'/assets/rider/The_Heretic.glb');
  assert.equal(material.metalness,.08);
  assert.equal(material.roughness,.72);
  assert.strictEqual(material.map,map);
});

test('warehouse response refinements retain artwork, geometry and colored rail identity',()=>{
  const root=new THREE.Group(),map=new THREE.Texture(),geometry=new THREE.BoxGeometry();
  const wood=new THREE.MeshStandardMaterial({name:'Foundry_Plywood.030',map,roughness:0});
  const rail=new THREE.MeshStandardMaterial({name:'Foundry_Stainless_Coping.003',color:'#0055ff',metalness:.86,roughness:0});
  const custom=new THREE.MeshStandardMaterial({name:'Artist_Chrome',metalness:1,roughness:0});
  const mesh=new THREE.Mesh(geometry,[wood,rail,custom]);root.add(mesh);
  refineWarehouseMaterials(root);
  assert.equal(wood.roughness,.58);assert.equal(wood.metalness,0);
  assert.equal(rail.roughness,.16);assert.equal(rail.metalness,.86);
  assert.equal(rail.color.getHexString(),'0055ff');
  assert.strictEqual(wood.map,map);assert.strictEqual(mesh.geometry,geometry);
  assert.equal(custom.roughness,0);assert.equal(custom.metalness,1);
});

test('custom and other default rider materials retain their authored metal response',()=>{
  const root=new THREE.Group(),material=new THREE.MeshStandardMaterial({metalness:1,roughness:.15});
  root.add(new THREE.Mesh(new THREE.BoxGeometry(),material));
  for(const url of ['blob:custom-rider','/assets/rider/The_Anchor.glb'])calibrateRiderMaterials(root,url);
  assert.equal(material.metalness,1);assert.equal(material.roughness,.15);
});
