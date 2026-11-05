import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {loadSkateFoley,loadSkateFoleyBanks,foleyCacheStatus,disposeFoleyCache,SKATE_FOLEY_FILES,SKATE_FOLEY_BANKS} from '../src/game/SkateFoley.js';
import {SkateAudio} from '../src/game/SkateAudio.js';
import {MapContactDepthPass} from '../src/graphics/MapContactDepthPass.js';
import {GraphicsPipeline} from '../src/graphics/GraphicsPipeline.js';
import {validateRenderAllocation,resolveGraphicsSettings} from '../src/graphics/GraphicsSettings.js';

test('base and banks share successful decodes and retry only failed URLs',async()=>{
  let healthy=false,requests=0,decodes=0;
  const context={decodeAudioData:async()=>{decodes++;return {duration:.2};}};
  const options={assetUrl:x=>x,fetcher:async path=>{requests++;return {ok:healthy||!path.includes('pop.wav'),arrayBuffer:async()=>new ArrayBuffer(4)};}};
  const unique=new Set([...Object.values(SKATE_FOLEY_FILES),...Object.values(SKATE_FOLEY_BANKS).flat()]).size;
  const load=()=>Promise.all([loadSkateFoley(context,()=>{},options),loadSkateFoleyBanks(context,()=>{},options)]);
  await load();assert.equal(requests,unique);assert.equal(decodes,unique-1);assert.equal(foleyCacheStatus(context).failed,1);
  healthy=true;await load();assert.equal(requests,unique+1);assert.equal(decodes,unique);assert.equal(foleyCacheStatus(context).failed,0);
  await load();assert.equal(requests,unique+1);disposeFoleyCache(context);
});

test('disposal invalidates a late decode before any consumer receives it',async()=>{
  let release;const wait=new Promise(resolve=>release=resolve);let accepted=0;
  const context={decodeAudioData:async()=>{await wait;return {duration:.2};}};
  const pending=loadSkateFoley(context,()=>accepted++,{assetUrl:x=>x,fetcher:async()=>({ok:true,arrayBuffer:async()=>new ArrayBuffer(4)})});
  await new Promise(resolve=>setImmediate(resolve));disposeFoleyCache(context);release();
  await pending;assert.equal(accepted,0);assert.equal(foleyCacheStatus(context).total,0);
});

test('same-count actor swaps and material fades update AO next frame without cached stale meshes',()=>{
  const scene=new THREE.Scene(),root=new THREE.Group();scene.add(root);
  const old=new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshStandardMaterial());root.add(old);
  const pass=new MapContactDepthPass(scene,new THREE.PerspectiveCamera());pass.setDynamicRoots([root]);
  pass._overrideVisibility();pass._restoreVisibility();
  old.material.transparent=true;old.material.opacity=.2;old.material.depthWrite=false;
  pass._overrideVisibility();assert.equal(old.visible,false);pass._restoreVisibility();assert.equal(old.visible,true);
  root.remove(old);const next=new THREE.Mesh(old.geometry,old.material);root.add(next);
  pass._overrideVisibility();assert.equal(next.visible,false);assert.equal(pass.exclusions.includes(old),false);assert.equal(pass.excluded.includes(old),false);
  pass._restoreVisibility();next.material.opacity=1;next.material.depthWrite=true;
  pass._overrideVisibility();assert.equal(next.visible,true);pass._restoreVisibility();pass.dispose();old.geometry.dispose();old.material.dispose();
});

test('unsupported dimensions reject resize before any allocation and preserve native baseline',()=>{
  assert.equal(validateRenderAllocation(1920,1080,1,{maxTextureSize:4096,maxRenderbufferSize:4096}).valid,true);
  assert.equal(validateRenderAllocation(1920,1080,4,{maxTextureSize:4096,maxRenderbufferSize:8192}).valid,false);
  assert.equal(validateRenderAllocation(Infinity,1080,1).valid,false);
  const p=Object.create(GraphicsPipeline.prototype);let calls=0;
  Object.assign(p,{width:1920,height:1080,settings:resolveGraphicsSettings('high-refresh',{devicePixelRatio:1}),capabilities:{maxTextureSize:4096},renderer:{setSize(){calls++;}}});
  assert.equal(p.resize(5000,3000),false);assert.equal(calls,0);assert.equal(p.width,1920);assert.equal(p.settings.pixelRatio,1);assert.equal(p.getStatus().allocation.state,'rejected');
});

test('replay routes recorded surface without changing live context and stops bounded scrape on source time',()=>{
  const audio=new SkateAudio(),events=[];audio.context={state:'running'};audio.surfaceTag='wood';
  audio.impact=(...args)=>events.push(args);
  audio.playRecordedEvent({kind:'landing',surface:'metal',strength:.7});
  assert.equal(events[0][3].surface,'metal');assert.equal(events[0][3].replay,true);assert.equal(audio.surfaceTag,'wood');
  let stopped=0;const source={stop(){stopped++;},disconnect(){}};
  audio.replayGrind={source,gain:{disconnect(){}},remaining:.5};audio.replayVoices.add(source);audio.voices.add(source);
  audio.updateReplay(.45);assert.equal(stopped,0);audio.updateReplay(.06);assert.equal(stopped,1);assert.equal(audio.replayGrind,null);
  audio.resetReplay();assert.equal(audio.replayVoices.size,0);
});

test('audio class recovers recordings after first-load failure without duplicate banks',async()=>{
  const oldWindow=globalThis.window,oldFetch=globalThis.fetch;
  const parameter=()=>({value:0,setValueAtTime(){},setTargetAtTime(){},exponentialRampToValueAtTime(){},linearRampToValueAtTime(){}});
  const node=()=>({connect(){},disconnect(){}});
  let requests=0,decodes=0,healthy=false;
  class Context {
    constructor(){this.state='running';this.currentTime=1;this.sampleRate=1000;this.destination=node();}
    createGain(){return {...node(),gain:parameter()};}
    createBiquadFilter(){return {...node(),frequency:parameter(),Q:parameter()};}
    createBufferSource(){return {...node(),playbackRate:parameter(),start(){},stop(){}};}
    createDynamicsCompressor(){return {...node(),...Object.fromEntries(['threshold','knee','ratio','attack','release'].map(k=>[k,parameter()]))};}
    createBuffer(channels,length,rate){const data=new Float32Array(length);return {length,sampleRate:rate,duration:length/rate,numberOfChannels:channels,getChannelData:()=>data};}
    async decodeAudioData(){decodes++;return this.createBuffer(1,100,1000);}
    async close(){this.state='closed';}
  }
  let audio;
  try {
    globalThis.window={AudioContext:Context};globalThis.fetch=async()=>{requests++;return {ok:healthy,arrayBuffer:async()=>new ArrayBuffer(4)};};
    audio=new SkateAudio();await audio.unlock();await audio.foleyPending;
    assert.equal(audio.getAudioStatus().state,'degraded');assert.equal(decodes,0);
    const failed=requests;healthy=true;await audio.retryFoley();
    assert.equal(audio.getAudioStatus().state,'ready');assert.equal(requests,failed*2);assert.equal(decodes,failed);
    assert.equal(audio.recordedFoley.size,4);assert.equal(audio.banks.pop.length,3);
    await audio.retryFoley();assert.equal(requests,failed*2);assert.equal(audio.banks.pop.length,3);
  } finally {
    await audio?.dispose();globalThis.fetch=oldFetch;
    if(oldWindow===undefined)delete globalThis.window;else globalThis.window=oldWindow;
  }
});

test('quality rollback restores the previous accepted settings after mutation and allocation failure',()=>{
  const p=Object.create(GraphicsPipeline.prototype),baseline=resolveGraphicsSettings('high-refresh',{maxSamples:4},{smoothEdges:true});
  Object.assign(p,{width:1920,height:1080,settings:baseline,renderer:{},lastQualityRequest:{key:'high-refresh',capabilities:{maxSamples:4},overrides:{smoothEdges:true}}});
  p.applyQuality=(key,caps,overrides)=>{
    p.settings=resolveGraphicsSettings(key,caps,overrides);
    if(key==='cinematic')throw new Error('target failure');
    return p.settings;
  };
  const accepted=p.setQuality('cinematic',{maxSamples:4},{});
  assert.equal(accepted.name,'high-refresh');assert.equal(accepted.msaaSamples,2);
  assert.equal(p.allocationStatus.state,'rolled-back');assert.equal(p.lastQualityRequest.key,'high-refresh');
});
