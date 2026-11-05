import fs from 'node:fs';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { assembleTestMap, inspectTestMap } from '../src/game/TestMapLoader.js';
import { prepareParkRuntime, disposeParkWorld } from '../src/game/ParkRegistry.js';

async function load(path) {
  const source=fs.readFileSync(path),{json}=inspectTestMap(source),bin=source.subarray(28+source.readUInt32LE(12));
  json.materials=json.materials.map(m=>({name:m.name,pbrMetallicRoughness:{metallicFactor:0}}));
  delete json.images;delete json.textures;delete json.samplers;
  for(const node of json.nodes)if(node.extras?.streetSkateMap){const m=JSON.parse(node.extras.streetSkateMap);if(m.presentation)m.presentation.environmentFromSky=false;node.extras.streetSkateMap=JSON.stringify(m);}
  const text=Buffer.from(JSON.stringify(json)),length=Math.ceil(text.length/4)*4,b=Buffer.alloc(28+length+bin.length,32);
  b.writeUInt32LE(0x46546c67);b.writeUInt32LE(2,4);b.writeUInt32LE(b.length,8);b.writeUInt32LE(length,12);b.writeUInt32LE(0x4e4f534a,16);text.copy(b,20);b.writeUInt32LE(bin.length,20+length);b.writeUInt32LE(0x004e4942,24+length);bin.copy(b,28+length);
  const gltf=await new GLTFLoader().parseAsync(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'');
  const world=assembleTestMap(gltf.scene),runtime=prepareParkRuntime(world);
  return {world,runtime};
}
const source=await load(process.argv[2]),fixed=await load(process.argv[3]);
function height(surface,x,z){
  const p=new THREE.Vector3(),n=new THREE.Vector3();
  return surface.rayRideable(new THREE.Vector3(x,18,z),new THREE.Vector3(0,-1,0),22,p,n,.008)?p.y:null;
}
function seam(runtime){
  const samples=[];
  for(let i=0;i<26;i++){
    const z=-(48+i*.19)*1.5,inside=height(runtime.surface,114.2,z),gap=height(runtime.surface,114.58,z);
    samples.push({z,inside,gap,continuous:inside!==null&&gap!==null&&Math.abs(inside-gap)<.025});
  }
  return {samples,failures:samples.filter(s=>!s.continuous).length};
}
function stair(runtime){
  const samples=[];
  for(let i=0;i<101;i++){
    const y=65.044*1.5-.5+i*.01;
    const expected=y<65.038*1.5?7.687*1.5:(7.687+( .267-7.687)*(y/1.5-65.038)/(74.42-65.038))*1.5;
    const at=new THREE.Vector3(80.365*1.5,expected,-y);
    const support=runtime.boardContact.snapToGround(at,0,.5,1);
    samples.push({y,support:support.count,supported:support.supported});
  }
  return {samples,failures:samples.filter(s=>!s.supported||s.support<4).length};
}
function funbox(world){
  const edges=new Map();let triangles=0;
  world.park.traverse(o=>{
    if(!o.isMesh||o.name.replace(/[^a-z0-9]/gi,'').toLowerCase()!=='gobject001')return;
    const p=o.geometry.attributes.position,idx=o.geometry.index,count=idx?.count||p.count;
    for(let i=0;i<count;i+=3){const points=[];for(let k=0;k<3;k++)points.push(new THREE.Vector3().fromBufferAttribute(p,idx?idx.getX(i+k):i+k).applyMatrix4(o.matrixWorld).toArray().map(n=>Math.round(n*10000)).join(','));
      triangles++;for(let k=0;k<3;k++){const key=[points[k],points[(k+1)%3]].sort().join('|');edges.set(key,(edges.get(key)||0)+1);}
    }
  });
  return {triangles,nonManifoldEdges:[...edges.values()].filter(n=>n!==2).length};
}
const report={old:{seam:seam(source.runtime),stair:stair(source.runtime),funbox:funbox(source.world)},
  fixed:{seam:seam(fixed.runtime),stair:stair(fixed.runtime),funbox:funbox(fixed.world)}};
console.log(JSON.stringify({old:{seamFailures:report.old.seam.failures,stairFailures:report.old.stair.failures,funbox:report.old.funbox},
  fixed:{seamFailures:report.fixed.seam.failures,stairFailures:report.fixed.stair.failures,funbox:report.fixed.funbox}},null,2));
if(process.argv[4])fs.writeFileSync(process.argv[4],JSON.stringify(report,null,2));
assert.ok(report.old.seam.failures>0,'fixture must reproduce the narrow-channel defect');
assert.equal(report.fixed.seam.failures,0,'quarter-pipe must support wheels across the repaired seam');
assert.equal(report.fixed.stair.failures,0,'all four wheels must remain supported across the stair entrance');
assert.ok(report.fixed.funbox.triangles>0);assert.equal(report.fixed.funbox.nonManifoldEdges,0,'funbox exterior must be closed');
assert.ok(report.fixed.funbox.triangles<report.old.funbox.triangles,'remove the duplicate/interior funbox faces');
assert.equal(fixed.world.manifest.rails.length,44);assert.deepEqual(fixed.world.manifest.spawn,source.world.manifest.spawn);
disposeParkWorld(source.world);disposeParkWorld(fixed.world);
