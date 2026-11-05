import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { batchWarehouseVisuals } from '../src/park/WarehouseVariants.js';
import { isUrbanRubberFloorName, tileUrbanRubberFloorUVs } from '../src/park/UrbanRubberFloor.js';
import { graffitiToneForTrick } from '../src/game/GraffitiTypography.js';
import { loadGeometry } from '../tools/load-geometry.mjs';

test('only Map 4 authored floor names match the material swap', () => {
  for (const name of [
    '01_STREET_DISTRICT / Ground_Floor',
    'Ground_Floor.001',
    'Premium_White_Marble_Floor',
    '00_GROUND / Premium_White_Marble_Floor.002',
  ]) assert.equal(isUrbanRubberFloorName(name), true, name);
  for (const name of [
    'Skateable_Surface', 'Floor_Markings', 'Step_05', 'Bowl_Floor',
    'Surface_Plywood', 'Warehouse_Walls', 'Side_Edge_Band',
    'Ground_FloorExtra',
  ]) assert.equal(isUrbanRubberFloorName(name), false, name);
});

test('shipped Grand Warehouse GLB contains named ground suitable for floor-finish classification',()=>{
  const bytes=readFileSync(new URL('../public/assets/warehouse/granwarehouse.glb',import.meta.url));
  assert.equal(bytes.toString('ascii',0,4),'glTF');
  assert.equal(bytes.readUInt32LE(8),bytes.length,'complete GLB asset');
  const length=bytes.readUInt32LE(12);
  const json=JSON.parse(bytes.subarray(20,20+length).toString('utf8'));
  const matchingNodes=json.nodes.filter(node=>isUrbanRubberFloorName(node.name||''));
  assert.ok(matchingNodes.length>0,'shipped asset has no classifiable Ground_Floor node');
  assert.ok(matchingNodes.some(node=>/Ground_Floor/.test(node.name)),
    'the Grand ground was lost from the exported scene');
});

test('Grand Warehouse visual batching can override named floors without changing ramps',async()=>{
  const world=await loadGeometry('public/assets/warehouse/granwarehouse.glb');
  const rubber=new THREE.MeshStandardMaterial({color:'#343b40'});
  const batched=batchWarehouseVisuals(world,'Grand floor test fixture',{rubberMaterial:rubber});
  assert.ok(batched.rubberFloorMeshes>=1,'exported ground must be identifiable by actual meshes');
  assert.ok(batched.park.children.some(mesh=>mesh.material===rubber),
    'floor override is not assigned to any resulting batch');
  assert.ok(batched.park.children.some(mesh=>mesh.material!==rubber),
    'non-floor ramp materials must remain independently batched');
  assert.ok(batched.visualTriangles>1000,'authored mesh topology was lost');
});

test('world-space tiled rubber floor UVs never change the actual floor geometry', () => {
  const geometry = new THREE.BoxGeometry(20, .1, 12);
  const before = Array.from(geometry.attributes.position.array);
  tileUrbanRubberFloorUVs(geometry, 2);
  assert.deepEqual(Array.from(geometry.attributes.position.array), before);
  const uv = geometry.attributes.uv;
  const p = geometry.attributes.position;
  for (let i = 0; i < p.count; i++) {
    assert.ok(Math.abs(uv.getX(i) - p.getX(i) / 2) < .00001);
    assert.ok(Math.abs(uv.getY(i) - p.getZ(i) / 2) < .00001);
  }
});

test('visual batching isolates rubber floor material from ramps and markings', () => {
  const root = new THREE.Group();
  const marble = new THREE.MeshStandardMaterial({ color:'#eeeeee' });
  const wood = new THREE.MeshStandardMaterial({ color:'#a47743' });
  const marking = new THREE.MeshStandardMaterial({ color:'#ffffee' });
  const rubber = new THREE.MeshStandardMaterial({ color:'#343b40' });
  for (const [name,material,px] of [
    ['Premium_White_Marble_Floor',marble,0],
    ['Skateable_Surface',wood,5],
    ['Floor_Markings',marking,9],
  ]) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(4,.1,4), material);
    mesh.name = name;
    mesh.position.x = px;
    root.add(mesh);
  }
  const result = batchWarehouseVisuals(root, 'URBAN WAREHOUSE', { rubberMaterial:rubber });
  assert.equal(result.rubberFloorMeshes,1);
  assert.equal(result.drawCalls,3);
  const materials = result.park.children.map(mesh => mesh.material);
  assert.ok(materials.includes(rubber));
  assert.ok(materials.includes(wood));
  assert.ok(materials.includes(marking));
  assert.ok(!materials.includes(marble));
  assert.equal(result.park.children.reduce((n,mesh)=>n + mesh.geometry.index.count / 3,0),36);
});

test('graffiti trick tone changes only presentation, not original trick names', () => {
  assert.equal(graffitiToneForTrick('360 Kickflip'),'aqua');
  assert.equal(graffitiToneForTrick('50-50 Grind'),'gold');
  assert.equal(graffitiToneForTrick('Indy Grab'),'fire');
  assert.equal(graffitiToneForTrick('Nose Manual'),'lime');
  assert.equal(graffitiToneForTrick('BAIL'),'red');
  assert.equal(graffitiToneForTrick('Some New Trick'),'purple');
});

test('trick text is upper-screen graffiti and existing title hitboxes stay unchanged', () => {
  const ui = readFileSync(new URL('../src/game-shell.css',import.meta.url),'utf8');
  const main = readFileSync(new URL('../src/game-main.js',import.meta.url),'utf8');
  const variants = readFileSync(new URL('../src/park/WarehouseVariants.js',import.meta.url),'utf8');
  assert.match(ui, /#trick-feedback \{/);
  assert.match(ui, /top:clamp\(55px,8\.5vh,94px\)/);
  assert.match(ui, /#trick-feedback\[data-tone='gold'\]/);
  assert.match(ui, /#game-shell\.menu-screen \.menu-card h2/);
  assert.match(main, /trickNode\.dataset\.tone = graffitiToneForTrick/);
  assert.match(variants, /id === 'urban-warehouse' \? createUrbanRubberFloorMaterial\(\)/);
  assert.doesNotMatch(variants, /gltf\.scene\.scale/);
});
