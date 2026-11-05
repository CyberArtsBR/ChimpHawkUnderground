import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectGlb} from '../tools/agent10-glb-inspector.mjs';
function glb(doc={asset:{version:'2.0'}},bin=0){
 const json=Buffer.from(JSON.stringify(doc));const pad=Buffer.alloc(Math.ceil(json.length/4)*4,32);json.copy(pad);
 const length=20+pad.length+(bin?8+bin:0);const b=Buffer.alloc(length);
 b.write('glTF');b.writeUInt32LE(2,4);b.writeUInt32LE(length,8);
 b.writeUInt32LE(pad.length,12);b.writeUInt32LE(0x4e4f534a,16);pad.copy(b,20);
 if(bin){b.writeUInt32LE(bin,20+pad.length);b.writeUInt32LE(0x004e4942,24+pad.length);}
 return b;
}
const rejects=(v,code)=>assert.throws(()=>inspectGlb(v),e=>e.code===code);
test('agent10: good GLB structures pass',()=>assert.equal(inspectGlb(glb({asset:{version:'2.0'},nodes:[{}]})).nodes,1));
test('agent10: rejects invalid header and v1',()=>{const x=glb();x.write('FAKE');rejects(x,'INVALID_HEADER');const y=glb();y.writeUInt32LE(1,4);rejects(y,'UNSUPPORTED_VERSION');});
test('agent10: rejects incorrect length and truncated chunk',()=>{const x=glb();x.writeUInt32LE(x.length+4,8);rejects(x,'INVALID_LENGTH');const y=glb();y.writeUInt32LE(0xffffffff,12);rejects(y,'INVALID_CHUNK');});
test('agent10: rejects remote and embedded URI payloads without fetching them',()=>{rejects(glb({asset:{version:'2.0'},images:[{uri:'https://example.invalid/a.png'}]}),'EXTERNAL_RESOURCE');rejects(glb({asset:{version:'2.0'},buffers:[{uri:'data:application/octet-stream;base64,AA==',byteLength:1}]}),'EXTERNAL_RESOURCE');});
test('agent10: unknown required extension and oversized skeleton fail',()=>{rejects(glb({asset:{version:'2.0'},extensionsRequired:['EXT_unknown']}),'UNSUPPORTED_EXTENSION');rejects(glb({asset:{version:'2.0'},skins:[{joints:Array(300).fill(0)}]}),'RESOURCE_LIMIT');rejects(glb({asset:{version:'2.0'},nodes:Array(1025).fill({})}),'RESOURCE_LIMIT');});
test('agent10: refuses upload larger than 35 MB',()=>rejects(Buffer.alloc(35*1024*1024+1),'RESOURCE_LIMIT'));
test('agent10: embedded BIN size cannot overrun declared buffer',()=>rejects(glb({asset:{version:'2.0'},buffers:[{byteLength:60}]},4),'INVALID_CHUNK'));
