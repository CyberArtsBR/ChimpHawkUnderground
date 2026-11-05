import fs from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { inspectTestMap, assembleTestMap } from '../src/game/TestMapLoader.js';
import { prepareParkRuntime, disposeParkWorld } from '../src/game/ParkRegistry.js';
import { ParkCollision } from '../src/game/ParkCollision.js';
import { SkateboardContactRig } from '../src/game/SkateboardContactRig.js';
import { MeshBVH } from 'three-mesh-bvh';
const file=process.argv[2];if(!file)throw Error('Pass the prepared GLB path.');
const source=fs.readFileSync(file),{json,triangles}=inspectTestMap(source);
// Geometry-only headless load: keep source BIN and exact transforms, substitute
// materials so Node does not need browser image decoders. Desktop checks cover
// the original file with its real embedded images.
const offset=20+source.readUInt32LE(12),bin=source.subarray(offset+8);
json.materials=(json.materials||[]).map(m=>({name:m.name,pbrMetallicRoughness:{metallicFactor:0}}));
delete json.images;delete json.textures;delete json.samplers;
// Reflections require browser image decoding, covered by the original-file
// desktop check. This copy validates geometry with the fallback environment.
for(const node of json.nodes||[]) if(node.extras?.streetSkateMap) {
  const string=typeof node.extras.streetSkateMap==='string';
  const metadata=string?JSON.parse(node.extras.streetSkateMap):node.extras.streetSkateMap;
  if(metadata.presentation?.environmentFromSky) metadata.presentation.environmentFromSky=false;
  node.extras.streetSkateMap=string?JSON.stringify(metadata):metadata;
}
const str=JSON.stringify(json),length=Math.ceil(Buffer.byteLength(str)/4)*4,j=Buffer.alloc(length,32);j.write(str);
const b=Buffer.alloc(28+length+bin.length);b.writeUInt32LE(0x46546c67);b.writeUInt32LE(2,4);b.writeUInt32LE(b.length,8);b.writeUInt32LE(length,12);b.writeUInt32LE(0x4e4f534a,16);j.copy(b,20);b.writeUInt32LE(bin.length,20+length);b.writeUInt32LE(0x004e4942,24+length);bin.copy(b,28+length);
const gltf=await new GLTFLoader().parseAsync(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'');
const metadata=json.nodes.find(n=>n.extras?.streetSkateMap)?.extras.streetSkateMap;
const authoredMetadata=metadata?JSON.parse(metadata):{};
const scale=authoredMetadata.authoringScale||1;
const world=assembleTestMap(gltf.scene);
if(process.env.MAP_FIND_SPAWN){
 const surface=new ParkCollision(world.collision),rig=new SkateboardContactRig(surface),hits=[];
 for(let x=8;x<75;x+=7)for(let z=-10;z>-105;z-=10){const pos=new THREE.Vector3(x,12,z),r=rig.snapToGround(pos,0,1,20);
  if(r.supported&&r.count===4&&r.normal.y>.99&&!surface.move(r.position,r.position,new THREE.Vector3(),{grounded:false}).contacts.length)hits.push(r.position.toArray());}
 console.log(JSON.stringify(hits));disposeParkWorld(world);process.exit(0);
}
const runtime=prepareParkRuntime(world),surface=runtime.surface;
const report={file,scale,triangles,spawn:runtime.spawn.toArray(),rails:runtime.railNetwork.rails.length,collisionMeshes:surface.meshes.length,stairSamples:0,stairFailures:[],railSamples:0,railFailures:[],rampSamples:0,rampFailures:[],boundaries:[]};
const p=new THREE.Vector3(),n=new THREE.Vector3(),down=new THREE.Vector3(0,-1,0);
const metal=[];world.park.traverse(o=>{if(o.isMesh&&/brushed stainless/.test(o.material?.name||''))metal.push(o);});
const metalTrees=metal.map(m=>new MeshBVH(m.geometry.clone().applyMatrix4(m.matrixWorld)));
report.railAlignmentFailures=[];
for(const stair of [{x:82.095,y0:37.994,y1:46.375,z0:7.767,z1:2.757},
  {x:80.365,y0:authoredMetadata.collisionRevision>=2?65.038:65.088,y1:74.420,z0:7.687,z1:.267}])for(let i=1;i<100;i++) {
  const t=i/100,position=new THREE.Vector3(stair.x,stair.z0+(stair.z1-stair.z0)*t,-(stair.y0+(stair.y1-stair.y0)*t)).multiplyScalar(scale);
  const hit=surface.rayRideable(position.clone().add(new THREE.Vector3(0,.1,0)),down,.2,p,n);
  report.stairSamples++;if(!hit||Math.abs(p.y-position.y)>.005)report.stairFailures.push({t,position:position.toArray()});
  const body=surface.move(position,position,new THREE.Vector3(),{grounded:false});if(body.contacts.length)report.stairFailures.push({t,blockers:body.contacts.length});
}
for(let i=1;i<100;i++){
 const t=i/100,position=new THREE.Vector3(29.885+5.54*t,.267+2.49*t,-2.5).multiplyScalar(scale);
 const hit=surface.rayRideable(position.clone().add(new THREE.Vector3(0,.1,0)),down,.2,p,n);
 report.stairSamples++;if(!hit||Math.abs(p.y-position.y)>.005)report.stairFailures.push({south:t,position:position.toArray()});
}
for(const rail of runtime.railNetwork.rails)for(let i=1;i<rail.points.length;i++){
  const mid=rail.points[i-1].clone().lerp(rail.points[i],.5);report.railSamples++;
  if(!runtime.railNetwork.nearby(mid,.2).some(hit=>hit.railName===rail.name))report.railFailures.push(rail.name);
  const distance=Math.min(...metalTrees.map(tree=>tree.closestPointToPoint(mid)?.distance??Infinity));
  if(distance>rail.radius+.04*scale)report.railAlignmentFailures.push({name:rail.name,point:mid.toArray(),distance});
}
// Probe inside every non-flat upward collision triangle, excluding perimeter
// fence tops. A higher overlapping ramp is allowed; gaps are not.
const a=new THREE.Vector3(),b1=new THREE.Vector3(),c=new THREE.Vector3(),norm=new THREE.Vector3();
for(const mesh of surface.ridingMeshes){const g=mesh.geometry,pos=g.attributes.position,idx=g.index;
  for(let i=0;i<(idx?.count||pos.count);i+=3){
    [a,b1,c].forEach((v,k)=>v.fromBufferAttribute(pos,idx?idx.getX(i+k):i+k).applyMatrix4(mesh.matrixWorld));
    const tri=new THREE.Triangle(a,b1,c);tri.getNormal(norm);if(norm.y<.02||norm.y>.99||tri.getArea()<.02)continue;
    const mid=tri.getMidpoint(new THREE.Vector3());const hit=surface.rayRideable(mid.clone().add(new THREE.Vector3(0,.05,0)),down,.1,p,n,.008);
    report.rampSamples++;if(!hit)report.rampFailures.push({mesh:mesh.name,point:mid.toArray()});
  }
}
for(const [from,to] of [[[1,1,-50],[-2,1,-50]],[[87,1,-50],[90,1,-50]],[[44,1,-3],[44,1,0]],[[44,1,-109],[44,1,-113]]]){
  const result=surface.move(new THREE.Vector3(...from).multiplyScalar(scale),new THREE.Vector3(...to).multiplyScalar(scale),new THREE.Vector3(),{grounded:false});
  report.boundaries.push({contacts:result.contacts.length,position:result.position.toArray()});
}
console.log(JSON.stringify(report,null,2));
if(process.argv[3])fs.writeFileSync(process.argv[3],JSON.stringify(report,null,2));
disposeParkWorld(world);
if(report.stairFailures.length||report.railFailures.length||report.railAlignmentFailures.length||report.rampFailures.length||report.boundaries.some(b=>!b.contacts))process.exitCode=1;
