import test from 'node:test';
import assert from 'node:assert/strict';
import { GraphicsPipeline } from '../src/graphics/GraphicsPipeline.js';
import { GRAPHICS_PRESET_ORDER, GRAPHICS_STORAGE_KEY, resolveGraphicsSettings } from '../src/graphics/GraphicsSettings.js';
import { GLOW_CONTROLS, GLOW_TUNING_KEY, GLOW_DEFAULTS_KEY, readGlowPresets, saveGlowPresets, resolveGlowTuning, stepGlowValue, initializeGlowDefaults, useCurrentGlowDefaults } from '../src/graphics/GlowTuning.js';

function pipeline(name, enabled = true) {
  const material = {emissive:{getHex:()=>0x4488ff},emissiveIntensity:2};
  const p = Object.create(GraphicsPipeline.prototype);
  p.settings = resolveGraphicsSettings(name, {}, {bloomEnabled:enabled});
  p.world = {userData:{environmentBloom:true},traverse(visitor){visitor({isMesh:true,userData:{},material});}};
  p.emissiveBase = new WeakMap();p.reflectionBase = new WeakMap();
  p.bloom = {};p.bloomComposite = {uniforms:{bloomMix:{value:0}}};
  p.configureBloom();p.updateMaterials();
  return {p,material};
}

test('all preset and legacy baselines use the requested shared controls', () => {
  for(const name of GRAPHICS_PRESET_ORDER)for(const orbit of [false,true])for(const legacyGlowDefaults of [false,true]) {
    const settings=resolveGraphicsSettings(name,{}, {legacyGlowDefaults});
    assert.deepEqual(resolveGlowTuning(settings,orbit),{emissive:1.5,bloom:1.09,glow:.1,radius:.11});
  }
  assert.equal(stepGlowValue(GLOW_CONTROLS[0],1.5,1),1.55);
});

test('each control changes its real rendering value without compounding world emission', () => {
  const {p,material} = pipeline('cinematic');
  p.setGlowTuning({emissive:1.4,bloom:.6,glow:.5,radius:.25});
  assert.equal(material.emissiveIntensity,2.8);
  assert.equal(p.bloom.strength,.6);assert.equal(p.bloom.radius,.25);
  assert.equal(p.bloomComposite.uniforms.bloomMix.value,.5);
  p.setGlowTuning({emissive:1.4,bloom:.7,glow:.6,radius:.3});
  assert.equal(material.emissiveIntensity,2.8,'repeated changes must not multiply the material again');
  p.setGlowTuning({});
  assert.equal(material.emissiveIntensity,2*1.5);
  assert.equal(p.bloom.strength,1.09);
});

test('saved values are per preset, clamped, and survive disabled storage', () => {
  const values = new Map();
  const store = {getItem:key=>values.get(key),setItem:(key,value)=>values.set(key,value)};
  const result = saveGlowPresets({cinematic:{emissive:1.4,bloom:99},'high-refresh':{glow:.55},unknown:{glow:1}},store);
  assert.deepEqual(result,{cinematic:{emissive:1.4,bloom:2.5},'high-refresh':{glow:.55}});
  assert.deepEqual(readGlowPresets(store),result);
  values.set(GLOW_TUNING_KEY,'not json');assert.deepEqual(readGlowPresets(store),{});
  const forbidden = {getItem(){throw Error('denied');},setItem(){throw Error('denied');}};
  assert.deepEqual(readGlowPresets(forbidden),{});
  assert.doesNotThrow(()=>saveGlowPresets(result,forbidden));
});

test('switching glow off keeps bloom off in every preset despite saved custom values', () => {
  for (const name of GRAPHICS_PRESET_ORDER) {
    const {p} = pipeline(name,false);
    p.setGlowTuning({bloom:2,glow:1,radius:.5});
    assert.equal(p.bloomComposite.enabled,false);assert.equal(p.bloom.strength,0);
    assert.equal(resolveGlowTuning(p.settings,true).bloom,2,'saved choice stays editable while off');
  }
});

test('shared-default migration preserves explicit preset values and glow on/off for every install generation', () => {
  for(const marker of [null,'legacy','current'])for(const glowEnabled of ['on','off']) {
    const overrides={'high-refresh':{emissive:.95,bloom:.37},cinematic:{radius:.44},performance:{glow:.24}};
    const values=new Map([[GRAPHICS_STORAGE_KEY,'cinematic'],['streetskate.bloomEnabled',glowEnabled],[GLOW_TUNING_KEY,JSON.stringify(overrides)]]);
    if(marker)values.set(GLOW_DEFAULTS_KEY,marker);
    const store={getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value)};
    assert.equal(initializeGlowDefaults(store),false);
    assert.equal(values.get(GLOW_DEFAULTS_KEY),'current');
    assert.equal(values.get('streetskate.bloomEnabled'),glowEnabled);
    assert.equal(values.get(GRAPHICS_STORAGE_KEY),'cinematic');
    assert.deepEqual(readGlowPresets(store),overrides);
    for(const name of GRAPHICS_PRESET_ORDER){
      const settings=resolveGraphicsSettings(name,{}, {legacyGlowDefaults:true,glowTuning:readGlowPresets(store)[name],bloomEnabled:glowEnabled==='on'});
      assert.deepEqual(resolveGlowTuning(settings,true),{emissive:1.5,bloom:1.09,glow:.1,radius:.11,...overrides[name]});
      assert.equal(settings.bloomStrength>0,glowEnabled==='on');
    }
    useCurrentGlowDefaults(store);assert.deepEqual(readGlowPresets(store),overrides);
  }
  const readOnly={getItem:()=> 'legacy',setItem(){throw Error('denied');}};
  assert.equal(initializeGlowDefaults(readOnly),false);
  assert.equal(initializeGlowDefaults(null),false);
  assert.deepEqual(resolveGlowTuning(resolveGraphicsSettings('performance',{}, {legacyGlowDefaults:true})),{emissive:1.5,bloom:1.09,glow:.1,radius:.11});
});
