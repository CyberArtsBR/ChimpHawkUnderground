import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { GraphicsPipeline } from '../src/graphics/GraphicsPipeline.js';

test('loadout prepares the actual speed-dependent wheel materials; normal frames use the ordinary mask',()=>{
 const material={},actor={board:{wheelGlow:[{material}]}};
 const graphics=Object.create(GraphicsPipeline.prototype),masks=[];
 Object.assign(graphics,{settings:{postProcessing:true,bloomStrength:1},scene:{},camera:{},
  wheelContactShadows:{update(){}},bloomComposite:{enabled:true},renderer:{},
  updateContactShadows(){},composer:{render(){}},renderSelectiveBloom(materials){masks.push(materials);return true;}});
 graphics.render({contactSource:actor,warmup:true});graphics.render({contactSource:actor});
 assert.deepEqual([...masks[0]],[material]);assert.equal(masks[1],null);
});
test('dark wheels use their real shader for warmup, with emission and materials restored afterward',()=>{
 const scene=new THREE.Scene(),actor=new THREE.Group();scene.add(actor);
 const material=new THREE.MeshStandardMaterial({emissive:0,emissiveIntensity:0});
 const wheel=new THREE.Mesh(new THREE.BoxGeometry(),material);actor.add(wheel);
 const blackout=new THREE.MeshBasicMaterial({color:0});
 const graphics=Object.create(GraphicsPipeline.prototype);let warming=true;
 Object.assign(graphics,{scene,glowRoot:actor,world:null,blackoutMaterial:blackout,
  renderer:{shadowMap:{autoUpdate:true}},bloom:{renderTargetsHorizontal:[{texture:{}}]},
  bloomComposite:{uniforms:{bloomTexture:{value:null}}},bloomComposer:{render(){
   assert.equal(wheel.material,warming?material:blackout);
  }}});
 graphics.renderSelectiveBloom(new Set([material]));
 assert.equal(wheel.material,material);assert.equal(material.emissive.getHex(),0);assert.equal(material.emissiveIntensity,0);
 // A normally glowing board keeps the pass active, exposing the ordinary
 // wheel blackout path immediately after the load-time-only override.
 const board=new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshStandardMaterial({emissive:0x11ff33,emissiveIntensity:1}));actor.add(board);
 warming=false;graphics.renderSelectiveBloom();assert.equal(wheel.material,material);
 for(const mesh of [wheel,board]){mesh.geometry.dispose();mesh.material.dispose();}blackout.dispose();
});
