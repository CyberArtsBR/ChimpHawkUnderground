import test from 'node:test';
import assert from 'node:assert/strict';
import { GraphicsPipeline } from '../src/graphics/GraphicsPipeline.js';
import { resolveGraphicsSettings } from '../src/graphics/GraphicsSettings.js';

function profile(name, orbit, bloomEnabled = true) {
  const pipeline = Object.create(GraphicsPipeline.prototype);
  pipeline.settings = resolveGraphicsSettings(name, {}, {bloomEnabled});
  pipeline.world = {userData:{environmentBloom:orbit}};
  pipeline.bloom = {};
  pipeline.bloomComposite = {uniforms:{bloomMix:{value:0}}};
  pipeline.configureBloom();
  return { ...pipeline.bloom, mix:pipeline.bloomComposite.uniforms.bloomMix.value,
    enabled:pipeline.bloomComposite.enabled };
}

test('every tier renders the same glow response while retaining its own sampling budget', () => {
  for(const orbit of [false,true]) {
    const baseline=profile('high-refresh',orbit);
    for(const name of ['performance','balanced','high','ultra','cinematic'])assert.deepEqual(profile(name,orbit),baseline,name);
    assert.equal(baseline.strength,1.3);assert.equal(baseline.mix,.13);assert.equal(baseline.radius,.16);assert.equal(baseline.enabled,true);
  }
});

test('the glow switch still disables bloom in every preset', () => {
  for (const name of ['performance','high-refresh','balanced','high','ultra','cinematic']) {
    for (const orbit of [false,true]) {
      const effect = profile(name,orbit,false);
      assert.equal(effect.enabled,false);
      assert.equal(effect.strength,0);
    }
  }
});

test('shared emission survives tier switches and repeated updates without compounding', () => {
  const material = {emissive:{getHex:()=>0x4488ff}, emissiveIntensity:2};
  const pipeline = Object.create(GraphicsPipeline.prototype);
  pipeline.world = {traverse(visitor){visitor({isMesh:true, userData:{}, material});}};
  pipeline.emissiveBase = new WeakMap();
  pipeline.reflectionBase = new WeakMap();
  for(const name of ['cinematic','performance','high-refresh','balanced','ultra','high']) {
    pipeline.settings = resolveGraphicsSettings(name,{}, {legacyGlowDefaults:true});
    pipeline.updateMaterials();assert.equal(material.emissiveIntensity,2*1.8,name);
    pipeline.updateMaterials();assert.equal(material.emissiveIntensity,2*1.8,'repeated update remains based on authored emission');
  }
});
