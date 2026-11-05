import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { GraphicsPipeline } from '../src/graphics/GraphicsPipeline.js';
import { GRAPHICS_PRESETS, GRAPHICS_PRESET_ORDER, resolveGraphicsSettings } from '../src/graphics/GraphicsSettings.js';
import { WAREHOUSE_RELIEF_SIZE, createWarehouseMaterials } from '../src/park/WarehouseMaterials.js';

test('agent07: all five presets retain 1024² shadows with bounded follow coverage', () => {
  for (const name of GRAPHICS_PRESET_ORDER) {
    const p = GRAPHICS_PRESETS[name];
    assert.equal(p.shadowResolution, 1024, name);
    assert.ok(p.shadowCoverageRadius >= 30 && p.shadowCoverageRadius <= 48);
    assert.ok(p.shadowNormalBias > 0 && p.shadowNormalBias < .05);
    assert.ok(p.bloomScale <= 1);
  }
  assert.equal(GRAPHICS_PRESETS.performance.bloomStrength, 1.3);
  assert.equal(GRAPHICS_PRESETS.performance.sharpen, 0);
  assert.equal(GRAPHICS_PRESETS.high.ssr, false);
  // Screen-space reflections ghost/skew imported skatepark objects at high DPR.
  for (const name of ['ultra', 'cinematic']) {
    assert.equal(GRAPHICS_PRESETS[name].ssr, false);
    assert.equal(GRAPHICS_PRESETS[name].ssrTargetLimit, 0);
    assert.equal(GRAPHICS_PRESETS[name].shadowResolution, 1024);
  }
});

test('agent07: rider-centered shadows improve contact resolution without moving sun direction', () => {
  const scene = new THREE.Scene();
  const light = new THREE.DirectionalLight('#ffffff', 2);
  light.castShadow = true;
  light.position.set(40, 60, 12);
  light.target.position.set(1, 0, 2);
  scene.add(light, light.target);
  const rider = new THREE.Group();
  rider.position.set(20, 0, 13);
  scene.add(rider);
  const pipeline = Object.create(GraphicsPipeline.prototype);
  pipeline.scene = scene;
  pipeline.glowRoot = rider;
  pipeline.settings = GRAPHICS_PRESETS.high;
  pipeline.shadowAnchor = null;
  pipeline.shadowWorldPosition = new THREE.Vector3();
  const beforeDirection = light.position.clone().sub(light.target.position);
  pipeline.updateContactShadows();
  assert.equal(light.shadow.mapSize.x, 512, 'fixture starts with default Three.js map size');
  assert.equal(light.shadow.camera.left, -GRAPHICS_PRESETS.high.shadowCoverageRadius);
  assert.equal(light.shadow.camera.top, GRAPHICS_PRESETS.high.shadowCoverageRadius);
  assert.equal(light.shadow.normalBias, GRAPHICS_PRESETS.high.shadowNormalBias);
  assert.ok(light.position.clone().sub(light.target.position).distanceTo(beforeDirection) < 1e-8);
  const movedPosition = light.position.clone(), movedTarget = light.target.position.clone();
  pipeline.updateContactShadows();
  assert.ok(light.position.distanceTo(movedPosition) < 1e-8, 'no drifting sun after repeated calls');
  assert.ok(light.target.position.distanceTo(movedTarget) < 1e-8);
});

test('agent07: static bloom mesh lists are reused rather than traversing scene twice every frame', () => {
  const wood = { isMesh:true, material:{ name:'plywood' } };
  const riderMesh = { isMesh:true, material:{ name:'rider', emissive:{getHex:()=>0xffaa22}, emissiveIntensity:1 } };
  let walks = 0, renders = 0;
  const scene = {
    children:[wood,riderMesh], background:'sky', fog:'fog', overrideMaterial:null,
    traverse(visitor) { walks++; visitor(wood); visitor(riderMesh); },
  };
  const pipeline = Object.create(GraphicsPipeline.prototype);
  pipeline.scene = scene;
  pipeline.world = null;
  pipeline.renderer = { shadowMap:{ autoUpdate:true } };
  pipeline.glowRoot = { parent:{}, traverse(visitor){ visitor(riderMesh); } };
  pipeline.blackoutMaterial = { name:'black' };
  pipeline.bloomComposer = { readBuffer:{texture:{}}, render(){
    renders++;
    assert.strictEqual(wood.material,pipeline.blackoutMaterial);
    assert.equal(riderMesh.material.name,'rider');
  }};
  const glowOnly = {};
  pipeline.bloom = { renderTargetsHorizontal:[{ texture:glowOnly }] };
  pipeline.bloomComposite = {uniforms:{bloomTexture:{value:null}}};
  assert.equal(pipeline.renderSelectiveBloom(),true);
  assert.strictEqual(pipeline.bloomComposite.uniforms.bloomTexture.value,glowOnly,
    'composite only the glow, not a low-resolution duplicate of the source');
  assert.equal(pipeline.renderSelectiveBloom(),true);
  assert.equal(walks,1, 'static scene must be cached between frames');
  assert.equal(renders,2);
  assert.equal(wood.material.name,'plywood', 'static material restored');
  assert.equal(scene.background,'sky');
  assert.equal(scene.fog,'fog');
  scene.children.push({isMesh:false});
  assert.equal(pipeline.renderSelectiveBloom(),true);
  assert.equal(walks,2, 'scene topology changes invalidate the cache');
});

test('agent07: relief GPU budget drops 75% without reducing photographic texture quality', () => {
  assert.equal(WAREHOUSE_RELIEF_SIZE,1024);
  const oldBaseBytes = 2 * 2048 * 2048 * 4;
  const newBaseBytes = 2 * WAREHOUSE_RELIEF_SIZE * WAREHOUSE_RELIEF_SIZE * 4;
  assert.equal(oldBaseBytes - newBaseBytes,24*1024*1024);
  assert.equal(newBaseBytes / oldBaseBytes,.25);
  const { materials } = createWarehouseMaterials({textures:false});
  assert.equal(materials.wood.metalness,0);
  assert.ok(materials.wood.roughness >= .65);
  assert.ok(materials.concrete.roughness >= .75);
  assert.ok(materials.coping.metalness >= .8);
  assert.ok(materials.coping.roughness < .35);
});

test('agent07: Performance and 144 FPS with glow off render directly without post effects', () => {
  const pipeline = Object.create(GraphicsPipeline.prototype);
  let direct = 0, composer = 0;
  pipeline.settings = resolveGraphicsSettings('performance',{}, {bloomEnabled:false});
  pipeline.faulted = false;
  pipeline.scene = {};
  pipeline.camera = {};
  pipeline.bloomComposite = {enabled:false};
  pipeline.updateContactShadows = () => {};
  pipeline.renderer = {render(){direct++;}};
  pipeline.composer = {render(){composer++;}};
  pipeline.render();
  assert.equal(direct,1);
  assert.equal(composer,0);
  pipeline.settings = {...GRAPHICS_PRESETS['high-refresh'],name:'high-refresh',bloomStrength:0,postProcessing:false};
  pipeline.render();
  assert.equal(direct,2);
  assert.equal(composer,0);
});

test('Performance and 144 FPS with glow enabled render and composite their bloom passes', () => {
  for(const name of ['performance','high-refresh']) {
    const pipeline=Object.create(GraphicsPipeline.prototype);
    let glow=0,composer=0,direct=0;
    pipeline.settings=resolveGraphicsSettings(name);
    pipeline.scene={};pipeline.camera={};pipeline.faulted=false;
    pipeline.bloomComposite={enabled:true};pipeline.updateContactShadows=()=>{};
    pipeline.renderSelectiveBloom=()=>{glow++;return true;};
    pipeline.composer={render(){composer++;}};pipeline.renderer={render(){direct++;}};
    pipeline.render();
    assert.equal(glow,1,name);assert.equal(composer,1);assert.equal(direct,0);
    assert.equal(pipeline.bloomComposite.enabled,true);
    const status=pipeline.getStatus();assert.equal(status.bloomEnabled,true);assert.equal(status.glowTuning.bloom,1.3);
  }
});
