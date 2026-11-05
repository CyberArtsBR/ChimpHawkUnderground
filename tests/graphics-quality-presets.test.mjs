import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  DEFAULT_GRAPHICS_PRESET, GRAPHICS_PRESET_ORDER, GRAPHICS_PRESETS,
  GRAPHICS_STORAGE_KEY, resolveGraphicsSettings, normalizedGraphicsPreset,
  loadGraphicsPreset, storeGraphicsPreset, qualityFogDistance,
} from '../src/graphics/GraphicsSettings.js';

test('existing tiers and the high-refresh profile retain 1024 shadow resolution', () => {
  assert.deepEqual(GRAPHICS_PRESET_ORDER, ['performance','high-refresh','balanced','high','ultra','cinematic']);
  for (const key of GRAPHICS_PRESET_ORDER) {
    const p = GRAPHICS_PRESETS[key];
    assert.equal(p.shadowResolution, 1024, key);
    assert.ok(p.pixelRatioCap >= 1);
    assert.ok(p.bloomScale > 0 && p.bloomScale <= 1);
  }
});

test('high-refresh preserves High material response at lower render cost, and explicit glow off survives tier changes', () => {
  const caps={devicePixelRatio:2,maxAnisotropy:16,maxSamples:4};
  const fast=resolveGraphicsSettings('high-refresh',caps);
  const high=resolveGraphicsSettings('high',caps);
  assert.equal(fast.pixelRatio,2);
  assert.equal(fast.environmentIntensity,high.environmentIntensity);
  assert.equal(fast.metalReflectionStrength,high.metalReflectionStrength);
  assert.ok(fast.bloomScale<high.bloomScale);
  for(const name of GRAPHICS_PRESET_ORDER){
    assert.equal(resolveGraphicsSettings(name,caps,{bloomEnabled:false}).bloomStrength,0);
  }
});

test('preset caps never exceed DPR, MSAA or GPU anisotropy capabilities', () => {
  for (const name of GRAPHICS_PRESET_ORDER) {
    const p = resolveGraphicsSettings(name, { devicePixelRatio:1.5, maxAnisotropy:4, maxSamples:0 });
    assert.ok(p.pixelRatio <= 1.5);
    assert.ok(p.pixelRatio <= p.pixelRatioCap);
    assert.ok(p.anisotropy <= 4);
    assert.equal(p.msaaSamples, 0);
    assert.equal(p.shadowResolution, 1024);
  }
  assert.equal(resolveGraphicsSettings('cinematic', {devicePixelRatio:3,maxAnisotropy:32,maxSamples:4}).pixelRatio,2.25);
});

test('optional 144 FPS edge smoothing respects GPU limits',()=>{
  assert.equal(resolveGraphicsSettings('high-refresh',{maxSamples:4},{smoothEdges:true}).msaaSamples,2);
  assert.equal(resolveGraphicsSettings('high-refresh',{maxSamples:0},{smoothEdges:true}).msaaSamples,0);
  assert.equal(resolveGraphicsSettings('high-refresh',{maxSamples:4},{smoothEdges:false}).msaaSamples,0);
});

test('unstable SSR is disabled across all tiers while preserving high preset bloom', () => {
  assert.equal(GRAPHICS_PRESETS.performance.ssr,false);
  assert.equal(GRAPHICS_PRESETS.balanced.ssr,false);
  assert.equal(GRAPHICS_PRESETS.high.ssr,false);
  assert.equal(GRAPHICS_PRESETS.ultra.ssr,false);
  assert.equal(GRAPHICS_PRESETS.cinematic.ssr,false);
  assert.equal(GRAPHICS_PRESETS.performance.bloomStrength,1.09);
  assert.ok(GRAPHICS_PRESETS.high.bloomStrength>0);
});

test('preset storage is versioned and resistant to disabled local storage', () => {
  const values = new Map();
  const storage = {getItem:k=>values.get(k), setItem:(k,v)=>values.set(k,v)};
  assert.equal(normalizedGraphicsPreset('wrong'),DEFAULT_GRAPHICS_PRESET);
  assert.equal(loadGraphicsPreset(storage),DEFAULT_GRAPHICS_PRESET);
  storeGraphicsPreset(storage,'ultra');
  assert.equal(values.get(GRAPHICS_STORAGE_KEY),'ultra');
  assert.equal(loadGraphicsPreset(storage),'ultra');
  const forbidden = {getItem(){throw Error('denied')},setItem(){throw Error('denied')}};
  assert.equal(loadGraphicsPreset(forbidden),DEFAULT_GRAPHICS_PRESET);
  assert.doesNotThrow(()=>storeGraphicsPreset(forbidden,'ultra'));
});

test('144 FPS is the new default while subsequent explicit quality choices persist', () => {
  const values = new Map([['streetskate.graphicsPreset.v1','cinematic']]);
  const storage = {getItem:k=>values.get(k),setItem:(k,v)=>values.set(k,v)};
  assert.equal(DEFAULT_GRAPHICS_PRESET,'high-refresh');
  assert.equal(loadGraphicsPreset(storage),'high-refresh');
  storeGraphicsPreset(storage,'high');
  assert.equal(loadGraphicsPreset(storage),'high');
});

test('144 FPS retains native detail on high-DPI and 4K displays', () => {
  for (const [width,height,dpr] of [[1280,720,2],[1920,1080,2],[2560,1440,1],[3840,2160,2],[3440,1440,1],[1280,720,3]]) {
    const fast=resolveGraphicsSettings('high-refresh',{width,height,devicePixelRatio:dpr});
    assert.equal(fast.pixelRatio,dpr);
    assert.equal(fast.postProcessing,true);
    assert.ok(fast.bloomStrength>0);
    assert.equal(fast.contactDepth,false);
    assert.equal(fast.targetFrameRate,144);
  }
  assert.equal(resolveGraphicsSettings('high-refresh',{width:3840,height:2160}).pixelRatio,1);
  assert.equal(resolveGraphicsSettings('high-refresh',{width:1280,height:720}).pixelRatio,1);
});

test('lean tiers enable glow by default and its off switch restores direct rendering', () => {
  for(const name of ['performance','high-refresh']) {
  const on=resolveGraphicsSettings(name,{}, {bloomEnabled:true});
  const off=resolveGraphicsSettings(name,{}, {bloomEnabled:false});
  assert.ok(on.bloomStrength>0);
  assert.equal(on.postProcessing,true);
  assert.equal(off.bloomStrength,0);
  assert.equal(off.postProcessing,false);
  }
  assert.ok(GRAPHICS_PRESETS.performance.bloomScale<GRAPHICS_PRESETS['high-refresh'].bloomScale);
  assert.equal(GRAPHICS_PRESETS.performance.surfaceDetailScale,0);
});

test('linear fog maintains near plane and adjusts far distance relative to the map', () => {
  assert.deepEqual(qualityFogDistance(100,225,GRAPHICS_PRESETS.high.fogDensity),{near:100,far:225});
  assert.ok(qualityFogDistance(100,225,GRAPHICS_PRESETS.cinematic.fogDensity).far>225);
  assert.ok(qualityFogDistance(100,225,GRAPHICS_PRESETS.ultra.fogDensity).far<225);
});

test('integration maintains scene-specific exposure and uses shared post FX compositor', () => {
  const main = readFileSync(new URL('../src/game-main.js',import.meta.url),'utf8');
  const shell = readFileSync(new URL('../src/game/GameShell.js',import.meta.url),'utf8');
  const fx = readFileSync(new URL('../src/graphics/GraphicsPipeline.js',import.meta.url),'utf8');
  assert.match(main,/sun\.shadow\.mapSize\.set\(1024, 1024\)/);
  assert.match(main,/renderer\.toneMappingExposure = settings\.exposure \*/);
  assert.match(main,/graphicsPipeline\.render\(\{ contactSource: gameShell\.phase === 'highlights' \? null : skater \}\)/);
  assert.match(main,/graphicsPipeline\.setWorld\(park\)/);
  assert.match(shell,/graphicsSet/);
  assert.match(shell,/graphicsMenu/);
  assert.match(fx,/SSRPass/);
  assert.match(fx,/UnrealBloomPass/);
  assert.match(fx,/CAS_SHADER/);
});
