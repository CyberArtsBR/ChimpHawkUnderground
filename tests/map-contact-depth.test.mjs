import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {GTAOPass} from 'three/addons/postprocessing/GTAOPass.js';
import {MapContactDepthPass,contactDepthResolution} from '../src/graphics/MapContactDepthPass.js';
import {GraphicsPipeline} from '../src/graphics/GraphicsPipeline.js';
import {resolveGraphicsSettings} from '../src/graphics/GraphicsSettings.js';

test('maximum-quality edge smoothing respects actual GPU sample limits',()=>{
  const caps={maxSamples:8};
  assert.equal(resolveGraphicsSettings('cinematic',caps).msaaSamples,4);
  assert.equal(resolveGraphicsSettings('ultra',caps).msaaSamples,4);
  assert.equal(resolveGraphicsSettings('high',caps).msaaSamples,2);
  assert.equal(resolveGraphicsSettings('cinematic',{maxSamples:2}).msaaSamples,2);
});

test('photographic uniform layers follow texture quality without changing their ownership',()=>{
  const photo=new THREE.Texture(),material=new THREE.MeshStandardMaterial();
  material.uniforms={photo:{value:photo}};
  const world=new THREE.Group();world.add(new THREE.Mesh(new THREE.PlaneGeometry(),material));
  const pipeline=Object.create(GraphicsPipeline.prototype);
  Object.assign(pipeline,{world,settings:resolveGraphicsSettings('cinematic',{maxAnisotropy:16}),
    reflectionBase:new WeakMap(),emissiveBase:new WeakMap()});
  pipeline.updateMaterials();assert.equal(photo.anisotropy,16);
  pipeline.settings=resolveGraphicsSettings('performance',{maxAnisotropy:16});
  pipeline.updateMaterials();assert.equal(photo.anisotropy,2);
  assert.equal(material.uniforms.photo.value,photo);
  photo.dispose();material.dispose();world.children[0].geometry.dispose();
});

test('MSAA framebuffer storage refreshes on tier changes without redundant disposal',()=>{
  const targets=[new THREE.WebGLRenderTarget(1,1),new THREE.WebGLRenderTarget(1,1)];
  let disposed=0;for(const t of targets)t.addEventListener('dispose',()=>disposed++);
  const noop=()=>{};
  const pipeline=Object.create(GraphicsPipeline.prototype);
  pipeline.settings=resolveGraphicsSettings('cinematic',{maxSamples:4});
  pipeline.renderer={setPixelRatio:noop,setSize:noop};
  pipeline.composer={setPixelRatio:noop,setSize:noop,renderTarget1:targets[0],renderTarget2:targets[1]};
  pipeline.bloomComposer={setPixelRatio:noop,setSize:noop};
  pipeline.cas={uniforms:{pixelStep:{value:new THREE.Vector2()}}};
  pipeline.resize(1280,720);assert.equal(disposed,2);
  pipeline.resize(1280,720);assert.equal(disposed,2);
  pipeline.settings.msaaSamples=2;pipeline.resize(1280,720);assert.equal(disposed,4);
  assert.equal(targets[0].samples,2);assert.equal(targets[1].samples,2);
});

test('contact depth only allocates for opted-in maps at Ultra and Cinematic',()=>{
  const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera();
  const pipeline=Object.create(GraphicsPipeline.prototype);
  const passes=[];
  Object.assign(pipeline,{scene,camera,width:1920,height:1080,world:new THREE.Group(),
    composer:{insertPass:p=>passes.push(p),removePass:p=>passes.splice(passes.indexOf(p),1)}});
  for(const tier of ['performance','high-refresh','balanced','high','ultra','cinematic']) {
    pipeline.settings=resolveGraphicsSettings(tier);
    pipeline.configureContactDepth();assert.ok(!pipeline.contactDepth,'other maps keep their authored AO');
  }
  pipeline.world.userData.contactDepth=true;
  pipeline.configureContactDepth();assert.equal(passes.length,1);
  const highPass=pipeline.contactDepth;
  assert.ok(highPass.width<=1280&&highPass.height<=1280);
  pipeline.settings=resolveGraphicsSettings('high');pipeline.configureContactDepth();
  assert.equal(pipeline.contactDepth,null);assert.equal(passes.length,0);
});

test('contact shading buffers remain capped through composer DPR and viewport resize',()=>{
  assert.deepEqual(contactDepthResolution(1920,1080,.5),[960,540]);
  assert.deepEqual(contactDepthResolution(7680,4320,.65),[1280,720]);
  const pass=new MapContactDepthPass(new THREE.Scene(),new THREE.PerspectiveCamera());
  pass.resolutionScale=.65;pass.setSize(5000,3000);
  assert.equal(pass.normalRenderTarget.width,1280);
  assert.equal(pass.gtaoRenderTarget.width,1280);
  assert.ok(pass.pdRenderTarget.height<1280);
  let disposed=0;
  pass.gtaoMaterial.addEventListener('dispose',()=>disposed++);
  pass.blendMaterial.addEventListener('dispose',()=>disposed++);
  pass.dispose();assert.equal(disposed,2);
});

test('AO normal pass excludes skies and decals, restoring renderer and visibility on failure',()=>{
  const scene=new THREE.Scene(),geometry=new THREE.BoxGeometry();
  const solid=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial());
  const sky=new THREE.Mesh(geometry,new THREE.MeshBasicMaterial());
  const decal=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({transparent:true,depthWrite:false}));
  const points=new THREE.Points(geometry,new THREE.PointsMaterial());
  scene.add(solid,sky,decal,points);scene.background=new THREE.Color('#121a23');scene.fog=new THREE.Fog('#121a23',1,40);
  const override=new THREE.MeshBasicMaterial();scene.overrideMaterial=override;
  const pass=new MapContactDepthPass(scene,new THREE.PerspectiveCamera());
  const background=scene.background,fog=scene.fog,target={id:'previous'},clear=new THREE.Color('#234567');
  let activeTarget=target,alpha=.7,color=clear.clone();
  const renderer={autoClear:true,shadowMap:{autoUpdate:true},getClearColor:c=>c.copy(color),
    getClearAlpha:()=>alpha,getRenderTarget:()=>activeTarget,setRenderTarget:t=>{activeTarget=t;},
    setClearColor:(c,a)=>{color.copy(c);if(a!==undefined)alpha=a;}};
  const original=GTAOPass.prototype.render;
  GTAOPass.prototype.render=function(){
    this._overrideVisibility();
    assert.equal(solid.visible,true);
    for(const o of [sky,decal,points])assert.equal(o.visible,false);
    this.scene.overrideMaterial=this.normalMaterial;
    renderer.autoClear=false;renderer.setRenderTarget({id:'AO'});renderer.setClearColor(new THREE.Color('red'),0);
    throw new Error('normal render failed');
  };
  try {
    assert.throws(()=>pass.render(renderer,{},{}),/normal render/);
    for(const o of [solid,sky,decal,points])assert.equal(o.visible,true);
    assert.equal(scene.overrideMaterial,override);assert.equal(scene.background,background);assert.equal(scene.fog,fog);
    assert.equal(renderer.shadowMap.autoUpdate,true);assert.equal(renderer.autoClear,true);
    assert.equal(activeTarget,target);assert.ok(color.equals(clear));assert.equal(alpha,.7);
  } finally {GTAOPass.prototype.render=original;pass.dispose();geometry.dispose();for(const o of [solid,sky,decal,points])o.material.dispose();override.dispose();}
});
