import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { renderGameplayWarmup } from '../src/graphics/ShaderWarmup.js';

function fixture() {
  const root = new THREE.Group();root.visible=false;
  const liquid = new THREE.Mesh();liquid.visible=false;root.add(liquid);
  const rider = new THREE.MeshStandardMaterial();
  const skater={flashMaterials:[{material:rider,opacity:1,transparent:false,depthWrite:true}]};
  return {root,liquid,rider,skater};
}

test('first bail and both respawn material states draw before the original composed frame',()=>{
  const {root,liquid,rider,skater}=fixture(),states=[];
  renderGameplayWarmup({skater,effects:{root},render:()=>states.push({
    effects:root.visible&&liquid.visible,culling:liquid.frustumCulled,
    opacity:rider.opacity,transparent:rider.transparent,depthWrite:rider.depthWrite})});
  assert.deepEqual(states,[
    {effects:true,culling:false,opacity:1,transparent:false,depthWrite:true},
    {effects:true,culling:false,opacity:.22,transparent:true,depthWrite:false},
    {effects:false,culling:true,opacity:1,transparent:false,depthWrite:true},
  ]);
  rider.dispose();
});

test('warmup preserves an already flashing rider and live effect visibility without emitting or advancing them',()=>{
  const {root,liquid,rider,skater}=fixture();
  root.visible=true;liquid.visible=true;rider.transparent=true;rider.opacity=.22;rider.depthWrite=false;
  let calls=0;
  renderGameplayWarmup({skater,effects:{root},render:()=>calls++});
  assert.equal(calls,3);assert.equal(root.visible,true);assert.equal(liquid.visible,true);
  assert.equal(rider.transparent,true);assert.equal(rider.opacity,.22);assert.equal(rider.depthWrite,false);
  rider.dispose();
});

test('failed recovery preparation restores hidden effects and material state',()=>{
  const {root,liquid,rider,skater}=fixture();let calls=0;
  assert.throws(()=>renderGameplayWarmup({skater,effects:{root},render(){if(++calls===2)throw Error('context lost');}}),/context lost/);
  assert.equal(root.visible,false);assert.equal(liquid.visible,false);assert.equal(liquid.frustumCulled,true);
  assert.equal(rider.transparent,false);assert.equal(rider.opacity,1);assert.equal(rider.depthWrite,true);
  rider.dispose();
});
