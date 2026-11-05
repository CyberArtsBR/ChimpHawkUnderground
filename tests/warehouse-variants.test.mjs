import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { PARK_DEFINITIONS } from '../src/park/ParkRegistry.js';
import { PARK_REGISTRY } from '../src/game/ParkRegistry.js';

// Map 4's urban-warehouse.glb belonged to an abandoned fourth-map experiment.
// Test the actual shipping three-location catalog and its two imported GLBs.
const assets = [
  { id:'orbit', file:'public/assets/spacepark/orbit.glb', minMeshes:100 },
  { id:'grand-warehouse', file:'public/assets/warehouse/granwarehouse.glb', minMeshes:1400,
    sha256:'759af97a43197371f68704e7f93092f5b416e7b282355a8b5554125a6c318c38' },
];
function readGlb(file) {
  const bytes=readFileSync(resolve(file));
  assert.equal(bytes.toString('ascii',0,4),'glTF',file+' magic');
  assert.equal(bytes.readUInt32LE(4),2,file+' GLB v2');
  assert.equal(bytes.readUInt32LE(8),bytes.length,file+' declared length');
  assert.equal(bytes.toString('ascii',16,20),'JSON',file+' JSON chunk');
  const length=bytes.readUInt32LE(12);
  assert.ok(length>0 && 20+length<=bytes.length,file+' JSON bounds');
  const json=JSON.parse(bytes.subarray(20,20+length).toString('utf8'));
  return {bytes,json};
}
test('only Skate Paradise, ORBIT and Grand Warehouse are selectable maps 1–3',()=>{
  const ids=PARK_DEFINITIONS.filter(p=>p.selectable).map(p=>p.id);
  assert.deepEqual(ids,['skate-paradise','orbit','grand-warehouse']);
  assert.deepEqual(PARK_DEFINITIONS.filter(p=>p.selectable).map(p=>p.number),[1,2,3]);
  assert.equal(PARK_REGISTRY['urban-warehouse'],undefined);
  assert.equal(PARK_REGISTRY['tron-warehouse'],undefined);
  assert.equal(PARK_REGISTRY['grand-warehouse'].name,'Grand Warehouse');
  for(const id of ids){
    assert.equal(PARK_DEFINITIONS.find(p=>p.id===id).available,true);
    assert.equal(typeof PARK_REGISTRY[id].create,'function');
  }
});

test('shipping ORBIT and Grand Warehouse GLBs are present, distinct and preserve geometry',()=>{
  const parsed=assets.map(({id,file,minMeshes,sha256})=>{
    const {bytes,json}=readGlb(file);
    const hash=createHash('sha256').update(bytes).digest('hex');
    if(sha256)assert.equal(hash,sha256,id+' artist asset changed');
    assert.ok(json.meshes.length>=minMeshes,id+' missing mesh geometry');
    assert.ok(json.nodes.length>json.meshes.length*.5,id+' incomplete node hierarchy');
    assert.ok(Array.isArray(json.materials)&&json.materials.length>10,id+' material slots missing');
    assert.ok(Array.isArray(json.bufferViews)&&json.bufferViews.length>0,id+' missing embedded buffers');
    return {hash,json};
  });
  assert.notEqual(parsed[0].hash,parsed[1].hash,'ORBIT and Grand Warehouse cannot be the same GLB');
  assert.ok(parsed[1].json.nodes.some(n=>/Ground_Floor/.test(n.name||'')),'Grand ground missing');
  assert.ok(parsed[1].json.nodes.some(n=>/^02_TIMBER_BOWL/.test(n.name||'')),'Grand bowl missing');
  assert.ok(parsed[1].json.nodes.some(n=>/^03_VERT_HALL/.test(n.name||'')),'Grand vert hall missing');
  assert.ok(parsed[1].json.nodes.some(n=>/^04_FLOW_LAB/.test(n.name||'')),'Grand flow transitions missing');
});

test('Grand Warehouse West transfer quarter preserves upward riding-surface normals',()=>{
  const {bytes,json}=readGlb(assets[1].file);
  const target=json.nodes.find(node=>
    /03_VERT_HALL \/ West transfer quarter \/ Skateable_Surface/.test(node.name||''));
  assert.ok(target&&Number.isInteger(target.mesh),'Grand West transfer quarter is missing');
  const primitive=json.meshes[target.mesh].primitives[0];
  const normals=json.accessors[primitive.attributes.NORMAL];
  assert.equal(normals.componentType,5126,'West transfer normal format');
  assert.equal(normals.type,'VEC3');
  const view=json.bufferViews[normals.bufferView];
  const stride=view.byteStride||12;
  const offset=28+bytes.readUInt32LE(12)+(view.byteOffset||0)+(normals.byteOffset||0);
  let upward=0;
  for(let vertex=0;vertex<normals.count;vertex++)
    upward+=bytes.readFloatLE(offset+vertex*stride+4);
  assert.ok(upward/normals.count>0.40,'Grand riding surface normals point away from skater');
});
