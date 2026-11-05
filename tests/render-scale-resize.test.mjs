import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {GraphicsPipeline} from '../src/graphics/GraphicsPipeline.js';
import {resolveGraphicsSettings} from '../src/graphics/GraphicsSettings.js';

test('resize applies render scale once to renderer and postprocess buffers across viewport changes',()=>{
 const calls={};const target=()=>({samples:2,dispose(){}});
 const composer=key=>({setPixelRatio(value){calls[key+'Ratio']=value;},setSize(w,h){calls[key+'Size']=[w,h];},renderTarget1:target(),renderTarget2:target()});
 const pipeline=Object.create(GraphicsPipeline.prototype);
 Object.assign(pipeline,{capabilities:{devicePixelRatio:2},settings:resolveGraphicsSettings('high-refresh',{devicePixelRatio:2,maxSamples:4},{renderScale:.75,smoothEdges:true}),
  renderer:{setPixelRatio(value){calls.rendererRatio=value;},setSize(w,h){calls.rendererSize=[w,h];}},composer:composer('composer'),bloomComposer:composer('bloom'),cas:{uniforms:{pixelStep:{value:new THREE.Vector2()}}}});
 for(const [width,height]of [[1280,720],[1920,1080],[800,600],[1920,1080]]){
  pipeline.resize(width,height);assert.equal(calls.rendererRatio,1.5);assert.equal(calls.composerRatio,1.5);
  assert.equal(calls.bloomRatio,1.5*pipeline.settings.bloomScale);assert.deepEqual(calls.rendererSize,[width,height]);
  assert.deepEqual(calls.composerSize,[width,height]);assert.equal(pipeline.cas.uniforms.pixelStep.value.x,1/(width*1.5));
  const status=pipeline.getStatus();assert.equal(status.renderWidth,width*1.5);assert.equal(status.renderHeight,height*1.5);
 }
});
