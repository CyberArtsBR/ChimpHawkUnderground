import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { GraphicsPipeline } from '../src/graphics/GraphicsPipeline.js';

function fixture(shouldThrow = false) {
  const concrete = { name:'Concrete' }, glass = { name:'Warehouse glass' };
  const riderMaterial = { name:'Uploaded GLB rider' }, deckMaterial = { name:'Skateboard finish',emissive:{getHex:()=>0x18212b},emissiveIntensity:.16 };
  const warehouse = { isMesh:true, material:concrete };
  const windowMesh = { isMesh:true, material:glass };
  const rider = { isMesh:true, material:riderMaterial };
  const board = { isMesh:true, material:deckMaterial };
  const background = { id:'HDRI-background' }, fog={ id:'per-map-fog' }, override={ id:'before' };
  const scene = {
    background, fog, overrideMaterial:override,
    traverse(visitor) {
      for (const m of [warehouse,windowMesh,rider,board]) visitor(m);
    },
  };
  const darkMaterial={name:'Bloom depth-only black'};
  let called=0;
  const pipeline=Object.create(GraphicsPipeline.prototype);
  pipeline.scene=scene;
  pipeline.renderer={shadowMap:{autoUpdate:true}};
  pipeline.blackoutMaterial=darkMaterial;
  pipeline.glowRoot={
    parent:{}, 
    traverse(visitor) { visitor(rider);visitor(board); }
  };
  pipeline.bloomComposer={
    readBuffer:{texture:{id:'actor-plus-glow'}},
    render() {
      called++;
      assert.equal(scene.background,null,'HDRI must not contribute to bloom');
      assert.equal(scene.fog,null,'map fog must not contribute to bloom');
      assert.equal(warehouse.material,darkMaterial,'floor cannot glow');
      assert.equal(windowMesh.material,darkMaterial,'glass cannot glow');
      assert.equal(rider.material,darkMaterial,'ordinary costume highlights must not contribute to bloom');
      assert.equal(board.material,deckMaterial,'deck must contribute to bloom');
      if(pipeline.effectsRoot)assert.equal(pipeline.effectsRoot.visible,false,'dust and sparks stay out of the glow buffer');
      if(shouldThrow) throw new Error('simulated WebGL failure');
    },
  };
  pipeline.bloom={renderTargetsHorizontal:[{texture:{id:'actor-bloom-only'}}]};
  pipeline.bloomComposite={uniforms:{bloomTexture:{value:null}}};
  return {pipeline, scene, meshes:[warehouse,windowMesh,rider,board], materials:[concrete,glass,riderMaterial,deckMaterial], background,fog,override,called:()=>called};
}

test('bloom masks environment and non-emissive costume, retains board glow and restores scene',()=>{
  const {pipeline,scene,meshes,materials,background,fog,override,called}=fixture();
  assert.equal(pipeline.renderSelectiveBloom(),true);
  assert.equal(called(),1);
  assert.equal(scene.background,background);
  assert.equal(scene.fog,fog);
  assert.equal(scene.overrideMaterial,override);
  assert.equal(pipeline.renderer.shadowMap.autoUpdate,true);
  meshes.forEach((m,i)=>assert.equal(m.material,materials[i]));
  assert.deepEqual(pipeline.bloomComposite.uniforms.bloomTexture.value,{id:'actor-bloom-only'});
});

test('renderer errors never leave warehouse materials black or clear the sky',()=>{
  const {pipeline,scene,meshes,materials,background,fog,override}=fixture(true);
  assert.throws(()=>pipeline.renderSelectiveBloom(),/simulated WebGL failure/);
  assert.equal(scene.background,background);
  assert.equal(scene.fog,fog);
  assert.equal(scene.overrideMaterial,override);
  assert.equal(pipeline.renderer.shadowMap.autoUpdate,true);
  meshes.forEach((m,i)=>assert.equal(m.material,materials[i]));
});

test('particle visibility restores after the bloom pass, including a renderer failure',()=>{
  for(const fail of [false,true])for(const visible of [false,true]) {
    const {pipeline}=fixture(fail);
    const effects={visible};pipeline.setEffectsTarget(effects);
    if(fail)assert.throws(()=>pipeline.renderSelectiveBloom(),/WebGL/);
    else assert.equal(pipeline.renderSelectiveBloom(),true);
    assert.equal(effects.visible,visible);
  }
});

test('no bloom work is attempted until rider and board are in the scene',()=>{
  const {pipeline,called}=fixture();
  pipeline.glowRoot=null;
  assert.equal(pipeline.renderSelectiveBloom(),false);
  assert.equal(called(),0);
});

test('normal environment shader chain does not include an all-scene bloom pass',()=>{
  const fx=readFileSync(new URL('../src/graphics/GraphicsPipeline.js',import.meta.url),'utf8');
  const main=readFileSync(new URL('../src/game-main.js',import.meta.url),'utf8');
  assert.match(fx,/this\.bloomComposer\.addPass\(this\.bloom\)/);
  assert.doesNotMatch(fx,/this\.composer\.addPass\(this\.bloom\)/);
  assert.match(fx,/this\.scene\.background = null/);
  assert.match(main,/graphicsPipeline\.setGlowTarget\(skater\.visual\)/);
  assert.match(fx,/this\.composite|this\.bloomComposite/);
  assert.match(fx,/this\.settings\.bloomScale/);
});

test('repeated bloom passes release saved materials, including after failure and material changes',()=>{
  const {pipeline,meshes,materials}=fixture();
  pipeline.renderSelectiveBloom();
  const storage=pipeline.bloomReplacements;
  assert.equal(storage.length,0);
  const changed={name:'replacement concrete'};
  meshes[0].material=changed;
  pipeline.bloomComposer.render=()=>{throw new Error('lost context');};
  assert.throws(()=>pipeline.renderSelectiveBloom(),/lost context/);
  assert.equal(meshes[0].material,changed);
  assert.equal(meshes[1].material,materials[1]);
  assert.equal(pipeline.bloomReplacements,storage);
  assert.equal(storage.length,0,'no old park materials retained after rendering');
  pipeline.bloomComposer.render=()=>{};
  pipeline.renderSelectiveBloom();
  assert.equal(meshes[0].material,changed);
});
