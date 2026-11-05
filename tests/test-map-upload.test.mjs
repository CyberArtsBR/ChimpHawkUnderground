import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { inspectTestMap, assembleTestMap, readTestMapManifest, readTestMapPresentation, createTestMapEnvironment, createTestMapWorld } from '../src/game/TestMapLoader.js';
import { prepareParkRuntime, disposeParkWorld, PARK_REGISTRY } from '../src/game/ParkRegistry.js';
import { GameShell } from '../src/game/GameShell.js';
import { DEFAULT_CHARACTERS, BOARD_CHOICES, LOCATIONS } from '../src/game/LoadoutCatalog.js';

function bytes(changes={}) {
  const json={asset:{version:'2.0'},nodes:[{mesh:0}],meshes:[{primitives:[{attributes:{POSITION:0}}]}],accessors:[{count:3}],...changes};
  const text=JSON.stringify(json), length=Math.ceil(text.length/4)*4;
  const b=new Uint8Array(20+length),v=new DataView(b.buffer);
  v.setUint32(0,0x46546c67,true);v.setUint32(4,2,true);v.setUint32(8,b.length,true);v.setUint32(12,length,true);v.setUint32(16,0x4e4f534a,true);
  b.fill(32,20);b.set(new TextEncoder().encode(text),20);return b.buffer;
}
const manifest=()=>({version:1,name:'Test park',spawn:[0,.04,0],rails:[{name:'Test rail',points:[[-2,1,-2],[2,1,-2]],radius:.055}],playableRegions:[{minX:-10,maxX:10,minZ:-10,maxZ:10}]});
test('uploaded coping retains authorized ramp transitions and rejects ambiguous authoring',()=>{
  const root=park(),data=manifest();
  data.rails[0].transition={id:'uploaded-quarter',type:'QUARTER',axisMode:'LINEAR',supportsVert:true,supportsTransfer:true,supportsPump:true,supportsLipTricks:true};
  root.userData.streetSkateMap=data;
  const world=assembleTestMap(root),runtime=prepareParkRuntime(world);
  assert.equal(world.manifest.rails[0].transition.id,'uploaded-quarter');
  assert.equal(runtime.coreController.transitions.transitions[0].id,'uploaded-quarter');
  disposeParkWorld(world);
  data.rails.push({...data.rails[0],name:'Duplicate'});
  assert.throws(()=>readTestMapManifest(root),/Duplicate/);
  data.rails.pop();data.rails[0].transition.supportsVert='true';
  assert.throws(()=>readTestMapManifest(root),/capability/);
});
function park(authored=true) {
  const root=new THREE.Group();if(authored)root.userData.streetSkateMap=JSON.stringify(manifest());
  const floor=new THREE.Mesh(new THREE.PlaneGeometry(20,20).rotateX(-Math.PI/2),new THREE.MeshStandardMaterial());root.add(floor);
  if(authored){const proxy=floor.clone();proxy.userData.streetSkateRole='collision';proxy.userData.transitionSkin=true;root.add(proxy);}
  return root;
}
test('GLB map validation bounds resources before parsing',()=>{
  assert.equal(inspectTestMap(bytes()).triangles,1);
  assert.throws(()=>inspectTestMap(bytes({buffers:[{uri:'https://example.com/map.bin'}]})),/forbidden/);
  assert.throws(()=>inspectTestMap(bytes({images:[{uri:'data:image/png;base64,abc'}]})),/forbidden/);
  assert.throws(()=>inspectTestMap(bytes({accessors:[{count:2000000}]})),/geometry/);
  assert.throws(()=>inspectTestMap(bytes({nodes:[{children:[1]},{children:[0]}]})),/hierarchy/);
  assert.throws(()=>inspectTestMap(bytes({nodes:[{children:[2]},{children:[2]},{}]})),/parents/);
  assert.throws(()=>inspectTestMap(bytes({animations:[{}]})),/static/);
});
test('bad file types and size are rejected before reading',async()=>{
  await assert.rejects(createTestMapWorld({name:'bad.txt',size:40,arrayBuffer(){throw Error('read');}}),/GLB/);
  await assert.rejects(createTestMapWorld({name:'huge.glb',size:90*1024*1024,arrayBuffer(){throw Error('read');}}),/80 MB/);
});
test('authored map uses only explicit collision and hides proxy visuals',()=>{
  const root=park(),world=assembleTestMap(root),runtime=prepareParkRuntime(world);
  assert.equal(world.collision.children.length,1);assert.equal(root.children[1].visible,false);
  assert.equal(runtime.railNetwork.rails.length,1);assert.equal(runtime.spawn.x,0);
  assert.equal(world.manifest.locationId,'test-map');disposeParkWorld(world);
});
test('embedded sky never expands bounds or becomes collision',()=>{
  const root=park(),sky=new THREE.Mesh(new THREE.SphereGeometry(430),new THREE.MeshBasicMaterial());
  sky.userData.streetSkateRole='sky';root.add(sky);const world=assembleTestMap(root);
  assert.equal(world.collision.children.length,1);assert.match(world.manifest.dimensions,/20 × 20/);
  assert.equal(sky.material.fog,false);assert.equal(sky.userData.castShadow,false);disposeParkWorld(world);
});
test('generic static GLBs get probed flat spawn and mesh collision',()=>{
  const world=assembleTestMap(park(false),'My park.glb');prepareParkRuntime(world);
  assert.equal(world.manifest.name,'My park');assert.deepEqual(world.manifest.rails,[]);disposeParkWorld(world);
});
test('malformed metadata and missing authored collision fail instead of silently losing rails',()=>{
  const root=park(),data=manifest();data.rails[0].points[0][0]=Infinity;root.userData.streetSkateMap=data;
  assert.throws(()=>readTestMapManifest(root),/grind/);
  root.userData.streetSkateMap=manifest();root.remove(root.children[1]);assert.throws(()=>assembleTestMap(root),/collision/);
});
test('authored lighting accepts bounded settings and preserves older map defaults',()=>{
  const stock=assembleTestMap(park());assert.equal(stock.presentation.exposure,1.03);disposeParkWorld(stock);
  const root=park(),data=manifest();data.presentation={exposure:.9,ambientSky:'#819ac7',ambientIntensity:.4,
    keyColor:'#ffd09b',keyIntensity:1.2,keyPosition:[-40,70,20],fogColor:'#26344e',fogDensity:.001,
    environmentIntensity:.25,fillColor:'#99beff',fillIntensity:.8,fillPosition:[30,15,-50],center:[0,0,-2],background:'#19263a'};
  root.userData.streetSkateMap=data;const world=assembleTestMap(root);
  assert.equal(world.presentation.exposure,.9);assert.equal(world.presentation.keyIntensity,1.2);
  assert.deepEqual(world.presentation.keyPosition,[-40,70,20]);assert.equal(world.presentation.sky,false);
  data.presentation.keyPosition[0]=999;assert.equal(world.presentation.keyPosition[0],-40);
  disposeParkWorld(world);
});
test('lighting metadata rejects unknown fields, malformed colors and unbounded values',()=>{
  for(const data of [null,[],{sky:true},{keyColor:'red'},{fogColor:'#fff'},{exposure:10},{ambientIntensity:-1},
    {keyIntensity:Infinity},{fogDensity:.1},{center:[0,NaN,0]},{keyPosition:[0,10000,0]},{environmentFromSky:'true'}])
    assert.throws(()=>readTestMapPresentation(data),/lighting/);
});
test('decorative surroundings do not expand gameplay bounds or add collision',()=>{
  const root=park(),decor=new THREE.Group(),building=new THREE.Mesh(new THREE.BoxGeometry(100,100,100),new THREE.MeshStandardMaterial());
  building.position.set(500,0,500);decor.userData.streetSkateRole='decoration';decor.add(building);root.add(decor);
  const world=assembleTestMap(root);assert.match(world.manifest.dimensions,/20 × 20/);
  assert.equal(world.collision.children.length,1);assert.equal(world.manifest.visualTriangles,14);disposeParkWorld(world);
});
test('embedded point and spot lights have bounded counts, range and no shadow maps',()=>{
  const root=park(),lights=Array.from({length:14},(_,i)=>i%2?new THREE.PointLight(0xffffff,10000):new THREE.SpotLight(0xffffff,900));
  for(const light of lights){light.castShadow=true;light.distance=0;root.add(light);}
  const world=assembleTestMap(root);
  assert.ok(lights.slice(0,12).every(l=>l.intensity>0&&l.intensity<=5000&&l.distance===80&&l.castShadow===false));
  assert.ok(lights.slice(12).every(l=>l.intensity===0&&l.castShadow===false));
  disposeParkWorld(world);
});
test('punctual light definitions are validated before GLTF parsing',()=>{
  const withLight=light=>bytes({extensions:{KHR_lights_punctual:{lights:[light]}}});
  inspectTestMap(withLight({type:'point',intensity:800,color:[.1,.5,1],range:30}));
  inspectTestMap(withLight({type:'spot',spot:{innerConeAngle:.1,outerConeAngle:.7}}));
  for(const light of [{type:'directional'},{type:'point',intensity:-1},{type:'point',color:[2,0,0]},
    {type:'point',range:0},{type:'spot',spot:[]},{type:'spot',spot:{innerConeAngle:.8,outerConeAngle:.7}},
    {type:'spot',spot:{outerConeAngle:3}}])assert.throws(()=>inspectTestMap(withLight(light)),/lights/);
});
test('named neon materials enable the existing environment glow pass',()=>{
  const root=park();root.children[0].material.name='LED / cyan coping';root.children[0].material.emissive.set('#00bbff');
  const world=assembleTestMap(root);assert.equal(world.park.userData.environmentBloom,true);disposeParkWorld(world);
});
test('sky reflections clone the dome texture and dispose the independent environment',()=>{
  const root=park(),data=manifest();data.presentation={environmentFromSky:true};root.userData.streetSkateMap=data;
  const texture=new THREE.Texture();texture.flipY=false;texture.offset.set(.2,.3);texture.repeat.set(2,2);
  const sky=new THREE.Mesh(new THREE.SphereGeometry(430),new THREE.MeshBasicMaterial({map:texture}));
  sky.userData.streetSkateRole='sky';root.add(sky);const world=assembleTestMap(root);
  assert.notEqual(world.environment,texture);assert.equal(world.environment.image,texture.image);
  assert.equal(world.environment.mapping,THREE.EquirectangularReflectionMapping);assert.equal(world.environment.flipY,true);
  assert.equal(texture.mapping,THREE.UVMapping);assert.equal(texture.flipY,false);assert.deepEqual(texture.offset.toArray(),[.2,.3]);
  assert.deepEqual(world.environment.offset.toArray(),[0,0]);assert.deepEqual(world.environment.repeat.toArray(),[1,1]);
  let disposed=0;world.environment.addEventListener('dispose',()=>disposed++);disposeParkWorld(world);assert.equal(disposed,1);
});
test('emission-only sky textures provide reflections and keep sky fog and shadows disabled',()=>{
  const root=park(),data=manifest();data.presentation={environmentFromSky:true};root.userData.streetSkateMap=data;
  const texture=new THREE.Texture(),material=new THREE.MeshStandardMaterial({emissiveMap:texture,emissive:'#ffffff'});
  const sky=new THREE.Mesh(new THREE.SphereGeometry(430),material);sky.castShadow=true;sky.userData.streetSkateRole='sky';root.add(sky);
  const world=assembleTestMap(root);
  assert.notEqual(world.environment,texture);assert.equal(world.environment.image,texture.image);
  assert.equal(sky.userData.castShadow,false);assert.equal(sky.castShadow,false);assert.equal(sky.material.fog,false);assert.equal(sky.material.depthWrite,false);
  assert.equal(sky.material.toneMapped,false);disposeParkWorld(world);
});
test('sky materials become unlit and cannot acquire metallic reflections or emissive scaling',()=>{
  const root=park(),texture=new THREE.Texture();
  const material=new THREE.MeshStandardMaterial({color:0x000000,metalness:1,roughness:1,
    emissive:'#ffffff',emissiveMap:texture,emissiveIntensity:5});
  let retired=0;material.addEventListener('dispose',()=>retired++);
  const sky=new THREE.Mesh(new THREE.SphereGeometry(430),material);sky.userData.streetSkateRole='sky';root.add(sky);
  const world=assembleTestMap(root);
  assert.equal(sky.material.isMeshBasicMaterial,true);assert.equal(sky.material.map,texture);
  assert.equal(sky.material.color.getHex(),0xffffff);assert.equal(sky.material.side,THREE.DoubleSide);
  assert.equal(sky.material.emissiveIntensity,undefined);assert.equal(sky.material.metalness,undefined);assert.equal(retired,1);
  disposeParkWorld(world);
});
test('sky normalization preserves source materials shared by a non-sky mesh',()=>{
  const root=park(),material=root.children[0].material;let retired=0;material.addEventListener('dispose',()=>retired++);
  const sky=new THREE.Mesh(new THREE.SphereGeometry(430),material);sky.userData.streetSkateRole='sky';root.add(sky);
  const world=assembleTestMap(root);assert.equal(retired,0);assert.equal(root.children[0].material,material);
  disposeParkWorld(world);assert.equal(retired,1);
});
test('retained world protects its environment texture when disposing another world',()=>{
  const world=assembleTestMap(park()),environment=new THREE.Texture();world.environment=environment;
  let disposed=0;environment.addEventListener('dispose',()=>disposed++);
  disposeParkWorld(world,{environment});assert.equal(disposed,0);environment.dispose();assert.equal(disposed,1);
});
test('large reflection skies downsample independently without changing the visible texture',()=>{
  const descriptor=Object.getOwnPropertyDescriptor(globalThis,'OffscreenCanvas');let draw;
  class Canvas {
    constructor(width,height){this.width=width;this.height=height;}
    getContext(){return {drawImage(...args){draw=args;}};}
  }
  Object.defineProperty(globalThis,'OffscreenCanvas',{configurable:true,value:Canvas});
  try {
    const image={width:8192,height:4096},sky=new THREE.Texture(image),environment=createTestMapEnvironment(sky);
    assert.equal(environment.image.width,2048);assert.equal(environment.image.height,1024);
    assert.notEqual(environment.source,sky.source);assert.equal(sky.image,image);
    assert.deepEqual(draw,[image,0,0,2048,1024]);environment.dispose();sky.dispose();
  } finally {if(descriptor)Object.defineProperty(globalThis,'OffscreenCanvas',descriptor);else delete globalThis.OffscreenCanvas;}
});
test('large reflection skies fall back when a canvas context is unavailable',()=>{
  const descriptor=Object.getOwnPropertyDescriptor(globalThis,'OffscreenCanvas');
  Object.defineProperty(globalThis,'OffscreenCanvas',{configurable:true,value:class {getContext(){return null;}}});
  try {const sky=new THREE.Texture({width:8192,height:4096});assert.equal(createTestMapEnvironment(sky),null);sky.dispose();}
  finally {if(descriptor)Object.defineProperty(globalThis,'OffscreenCanvas',descriptor);else delete globalThis.OffscreenCanvas;}
});
test('sky reflection requests without a textured sky are rejected',()=>{
  const root=park(),data=manifest();data.presentation={environmentFromSky:true};root.userData.streetSkateMap=data;
  assert.throws(()=>assembleTestMap(root),/embedded textured sky dome/);
});
function shellHarness(action) {
  const shell=Object.create(GameShell.prototype),starts=[];
  Object.assign(shell,{phase:'creator',ready:true,mapUploadGeneration:0,mapUploadBusy:false,heroes:[...DEFAULT_CHARACTERS],
    actions:{testMap:action},render(){},start(practice){starts.push(practice);this.phase='playing';}});
  return {shell,starts};
}
test('upload starts practice with built-in random rider and board without changing catalog',async()=>{
  let request;const {shell,starts}=shellHarness(async r=>{request=r;return {locationId:'test-map'};});
  await shell.uploadTestMap({name:'park.glb'});
  assert.ok(DEFAULT_CHARACTERS.includes(request.hero));assert.ok(BOARD_CHOICES.includes(request.board));
  assert.deepEqual(starts,[true]);assert.equal(shell.mapUploadBusy,false);
  assert.equal(PARK_REGISTRY['test-map'],undefined);assert.ok(LOCATIONS.every(l=>l.id!=='test-map'));
});
test('load failure stays in Creator tools with readable error and no practice start',async()=>{
  const {shell,starts}=shellHarness(async()=>{throw Error('Invalid map geometry');});
  await shell.uploadTestMap({name:'bad.glb'});assert.equal(shell.phase,'creator');assert.equal(shell.mapUploadBusy,false);
  assert.match(shell.mapUploadStatus,/Invalid map geometry/);assert.deepEqual(starts,[]);
});
test('canceled upload cannot start practice or replace selection after completion',async()=>{
  let resolve;const {shell,starts}=shellHarness(()=>new Promise(r=>{resolve=r;}));
  const pending=shell.uploadTestMap({name:'park.glb'});shell.mapUploadGeneration++;shell.phase='title';resolve({locationId:'test-map'});
  await pending;assert.deepEqual(starts,[]);
});
