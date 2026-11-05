import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {resolveMapLook} from '../src/graphics/MapLook.js';
import {GRAPHICS_PRESET_ORDER,resolveGraphicsSettings} from '../src/graphics/GraphicsSettings.js';
import {refineMapSurfaces} from '../src/graphics/SurfaceFinish.js';

test('Paradise sunset treatment preserves its authored sky and bounds while balancing fill',()=>{
  const look=resolveMapLook('skate-paradise',{center:[66,0,-84],sky:false,environmentFromSky:true,shadowExtent:90});
  assert.deepEqual(look.center,[66,0,-84]);
  assert.equal(look.environmentFromSky,true);
  assert.equal(look.sky,false);
  assert.ok(look.ambientIntensity<.9&&look.keyIntensity>2.1);
  assert.ok(look.fillIntensity>0&&look.exposure<=1.07);
});

test('surface wear budgets increase with detail presets without enabling unstable reflections',()=>{
  const settings=GRAPHICS_PRESET_ORDER.map(p=>resolveGraphicsSettings(p));
  assert.equal(settings[0].surfaceDetailScale,0);
  assert.equal(settings.at(-1).surfaceDetailScale,1);
  assert.ok(settings.every(s=>s.surfaceDetailScale>=0&&s.surfaceDetailScale<=1&&!s.ssr));
  assert.ok(resolveGraphicsSettings('high-refresh').surfaceDetailScale<resolveGraphicsSettings('high').surfaceDetailScale);
});

test('Paradise surface finish keeps textures and collision geometry intact across preparation',()=>{
  const material=new THREE.MeshStandardMaterial({name:'Paradise / scanned concrete 4K',map:new THREE.Texture(),roughness:.7});
  const root=new THREE.Group(),geometry=new THREE.BoxGeometry();
  root.add(new THREE.Mesh(geometry,material));
  const vertices=[...geometry.attributes.position.array],map=material.map;
  refineMapSurfaces(root,'skate-paradise');
  const compile=material.onBeforeCompile;
  refineMapSurfaces(root,'skate-paradise');
  assert.equal(material.onBeforeCompile,compile);
  assert.equal(material.map,map);
  assert.deepEqual([...geometry.attributes.position.array],vertices);
  assert.ok(material.roughness>=.82);
  map.dispose();material.dispose();geometry.dispose();
});
