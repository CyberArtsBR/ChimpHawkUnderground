import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import * as THREE from 'three';
import {loadGeometry} from '../tools/load-geometry.mjs';
import {batchWarehouseVisuals} from '../src/park/WarehouseVariants.js';
import {refineWarehouseMaterials,loadWarehousePhotoFinish} from '../src/park/WarehouseMaterialPresentation.js';
import {createWarehouseVisualPass,collectWarehousePracticalAnchors,WAREHOUSE_DETAIL_LIMITS} from '../src/graphics/WarehouseVisualPass.js';
import {createWarehousePark} from '../src/park/WarehousePark.js';
import {disposeParkWorld} from '../src/game/ParkRegistry.js';

test('Grand microfinish retains photographs, tint and normal maps while layering stable detail',()=>{
  const root=new THREE.Group(),map=new THREE.Texture(),normalMap=new THREE.Texture();
  const wood=new THREE.MeshStandardMaterial({name:'Foundry_Plywood.004',map,normalMap,color:'#bc9971',roughness:.1});
  const rail=new THREE.MeshStandardMaterial({name:'Foundry_Stainless_Coping',color:'#2c4abf',metalness:.86,roughness:0});
  const fixture=new THREE.MeshStandardMaterial({name:'Foundry_Warm_Lights',color:'#ffffff'});
  const geometry=new THREE.BoxGeometry();root.add(new THREE.Mesh(geometry,[wood,rail,fixture]));
  const color=wood.color.getHex(),railColor=rail.color.getHex();
  refineWarehouseMaterials(root,{detail:true});
  assert.equal(wood.map,map);assert.equal(wood.normalMap,normalMap);assert.equal(wood.color.getHex(),color);
  assert.ok(wood.roughness>=.64);assert.equal(rail.color.getHex(),railColor);
  assert.ok(rail.roughness>=.24);assert.equal(rail.envMapIntensity,.58);
  assert.ok(fixture.emissive.getHex()>0&&fixture.emissiveIntensity>1);
  const compile=wood.onBeforeCompile;refineWarehouseMaterials(root,{detail:true});assert.equal(compile,wood.onBeforeCompile);
  const shader={vertexShader:THREE.ShaderLib.standard.vertexShader,fragmentShader:THREE.ShaderLib.standard.fragmentShader,uniforms:{}};
  compile.call(wood,shader,{});
  assert.equal(shader.uniforms.warehouseFinishKind.value,1);
  assert.match(shader.fragmentShader,/#define WAREHOUSE_FINISH_KIND 1/);
  assert.match(shader.fragmentShader,/#if WAREHOUSE_FINISH_KIND == 1/);
  assert.doesNotMatch(shader.fragmentShader,/if\(warehouseFinishKind<1\.5\)/);
  assert.notEqual(wood.customProgramCacheKey(),rail.customProgramCacheKey());
  assert.match(shader.fragmentShader,/warehouseGradient/);assert.match(shader.fragmentShader,/roughnessFactor/);
  assert.match(shader.fragmentShader,/angularFootprint=fwidth\(phase\)/);
  assert.match(shader.fragmentShader,/warehouseFilteredSine\(lateral\*76\.0\+bend\)/);
  assert.match(shader.fragmentShader,/warehouseFilteredSine\(lateral\*191\.0\+bend\*2\.1\)/);
  assert.match(shader.fragmentShader,/warehouseFilteredSine\(lateral\*241\.0/);
  map.dispose();normalMap.dispose();wood.dispose();rail.dispose();fixture.dispose();geometry.dispose();
});

test('warehouse wear follows visible faces, leaves collision alone and scales practical lights',()=>{
  const park=new THREE.Group(),collision=new THREE.Group();
  const floor=new THREE.Mesh(new THREE.PlaneGeometry(30,30).rotateX(-Math.PI/2),
    new THREE.MeshStandardMaterial({name:'Foundry_Concrete'}));park.add(floor);
  const world={park,collision,manifest:{spots:[{position:[0,0,0],heading:0}],rails:[]}};
  const detail=createWarehouseVisualPass(world,{practicalAnchors:[[-8,16,-8],[8,16,8],[-8,16,8],[8,16,-8]]});
  assert.equal(collision.children.length,0);assert.equal(detail.root.userData.streetSkateRole,'decoration');
  assert.ok(detail.stats.triangles>0);assert.ok(detail.stats.drawCalls<=2);assert.equal(detail.stats.lights,4);
  const lights=[];detail.root.traverse(o=>{if(o.isLight)lights.push(o);});
  assert.ok(lights.every(light=>!light.castShadow));
  detail.setQuality({name:'balanced',surfaceDetailScale:.6});assert.equal(lights.filter(l=>l.visible).length,2);
  detail.setQuality({name:'performance',surfaceDetailScale:0});assert.equal(detail.root.visible,false);
  detail.setQuality({name:'cinematic',surfaceDetailScale:1});assert.equal(lights.filter(l=>l.visible).length,4);
  for(const mesh of detail.root.children.filter(o=>o.isMesh)){
    const positions=mesh.geometry.attributes.position;
    for(let i=0;i<positions.count;i++)assert.ok(Math.abs(positions.getY(i)-.004)<1e-6);
  }
  disposeParkWorld(world);
});

test('photographed plywood uses one per-world texture while preserving source albedo and tint',async()=>{
  const world=()=>({park:new THREE.Group(),collision:new THREE.Group()});
  const a=world(),b=world(),source=new THREE.Texture();
  const first=new THREE.MeshStandardMaterial({name:'Foundry_Plywood',map:source,color:'#bf9f73'});
  const second=new THREE.MeshStandardMaterial({name:'Foundry_Dark_Timber.002',color:'#7f604a'});
  const edges=new THREE.MeshStandardMaterial({name:'Foundry_Plywood_Edges.019',color:'#905f26'});
  const geometry=new THREE.BoxGeometry();a.park.add(new THREE.Mesh(geometry,[first,second,edges]));
  b.park.add(new THREE.Mesh(geometry.clone(),new THREE.MeshStandardMaterial({name:'Foundry_Plywood'})));
  const requested=[],loader={loadAsync:async url=>{requested.push(url);return new THREE.Texture();}};
  const originalTint=first.color.getHex();
  const loaded=await loadWarehousePhotoFinish(a.park,{loader,url:'local-plywood.webp'});
  const other=await loadWarehousePhotoFinish(b.park,{loader,url:'local-plywood.webp'});
  assert.equal(loaded.materials,2);assert.equal(first.warehouseGrainMap,second.warehouseGrainMap);
  assert.equal(edges.warehouseGrainMap,undefined);assert.notEqual(loaded.texture,other.texture);
  assert.deepEqual(requested,['local-plywood.webp','local-plywood.webp']);
  assert.equal(first.map,source);assert.equal(first.color.getHex(),originalTint);
  assert.equal(loaded.texture.wrapS,THREE.RepeatWrapping);assert.equal(loaded.texture.colorSpace,THREE.SRGBColorSpace);
  const shader={vertexShader:THREE.ShaderLib.standard.vertexShader,fragmentShader:THREE.ShaderLib.standard.fragmentShader,uniforms:{}};
  first.onBeforeCompile(shader,{});
  assert.equal(shader.uniforms.warehousePhotoMap.value,loaded.texture);
  assert.equal(shader.uniforms.warehousePhotoBlend.value,.74);
  assert.match(shader.fragmentShader,/vec3 sheet=position\/2\.44/);
  assert.match(shader.fragmentShader,/warehouseAuthoredTint/);
  let disposal=0;loaded.texture.addEventListener('dispose',()=>disposal++);
  disposeParkWorld(a);assert.equal(disposal,1,'world disposal discovers its directly owned detail texture');
  disposeParkWorld(b);
});

test('Grand Warehouse detail respects source geometry, roof separation and bounded budgets',async()=>{
  const source=await loadGeometry('public/assets/warehouse/granwarehouse.glb');
  const anchors=collectWarehousePracticalAnchors(source);assert.equal(anchors.length,20);
  const rubber=new THREE.MeshStandardMaterial({name:'Urban Warehouse / premium charcoal vulcanized rubber floor'});
  const batched=batchWarehouseVisuals(source,'GRAND WAREHOUSE',{rubberMaterial:rubber});
  const authored=createWarehousePark({textures:false});
  const world={park:batched.park,collision:new THREE.Group(),manifest:authored.manifest};
  const hash=()=>{
    const digest=createHash('sha256');for(const mesh of world.park.children.filter(o=>o.isMesh)){
      digest.update(new Uint8Array(mesh.geometry.attributes.position.array.buffer));
      if(mesh.geometry.index)digest.update(new Uint8Array(mesh.geometry.index.array.buffer));
    }return digest.digest('hex');
  };
  const before=hash(),railCount=world.manifest.rails.length,roofCount=world.park.children.filter(o=>o.userData.cameraRoof).length;
  try{
    const detail=createWarehouseVisualPass(world,{practicalAnchors:anchors});
    assert.equal(hash(),before);assert.equal(world.manifest.rails.length,railCount);
    assert.equal(world.park.children.filter(o=>o.userData.cameraRoof).length,roofCount);
    assert.ok(detail.stats.patches>=20,`too few patches: ${detail.stats.patches}`);
    assert.ok(detail.stats.triangles<=WAREHOUSE_DETAIL_LIMITS.triangles);
    assert.ok(detail.stats.drawCalls<=WAREHOUSE_DETAIL_LIMITS.drawCalls);
    assert.equal(detail.stats.lights,4);
  }finally{disposeParkWorld(world);disposeParkWorld(authored);}
});
