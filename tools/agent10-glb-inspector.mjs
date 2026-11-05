// Agent 10: safe structural validation; never executes uploaded content.
export const GLB_LIMITS=Object.freeze({bytes:35*1024*1024,nodes:1024,meshes:512,primitives:2048,skins:24,joints:256,animations:128});
const supported=new Set(['KHR_materials_unlit','KHR_texture_transform','KHR_mesh_quantization','KHR_materials_clearcoat','KHR_materials_emissive_strength','KHR_materials_sheen','KHR_materials_transmission','KHR_materials_ior','KHR_materials_specular','KHR_lights_punctual','EXT_texture_webp']);
function fail(code,message){const error=new Error(message);error.code=code;throw error;}
function arr(x,n,max){if(x===undefined)return [];if(!Array.isArray(x))fail('INVALID_JSON',n+' is not an array');if(x.length>max)fail('RESOURCE_LIMIT',n+' exceeds '+max);return x;}
export function inspectGlb(input,limits=GLB_LIMITS){
 const bytes=input instanceof Uint8Array?input:input instanceof ArrayBuffer?new Uint8Array(input):null;
 if(!bytes)fail('INVALID_INPUT','A byte array is required');
 if(bytes.length>limits.bytes)fail('RESOURCE_LIMIT','GLB exceeds maximum upload size');
 if(bytes.length<20)fail('INVALID_HEADER','Truncated header');
 const v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
 if(v.getUint32(0,true)!==0x46546c67)fail('INVALID_HEADER','Invalid glTF magic');
 if(v.getUint32(4,true)!==2)fail('UNSUPPORTED_VERSION','Only GLB v2');
 if(v.getUint32(8,true)!==bytes.length)fail('INVALID_LENGTH','Incorrect declared byte length');
 let offset=12,chunk=0,bin=0,jsonBytes=null;
 while(offset<bytes.length){
  if(offset+8>bytes.length)fail('INVALID_CHUNK','Truncated chunk');
  const n=v.getUint32(offset,true),type=v.getUint32(offset+4,true);
  if(n%4||n>bytes.length-offset-8)fail('INVALID_CHUNK','Invalid chunk length');
  if(chunk===0){if(type!==0x4e4f534a||!n)fail('INVALID_JSON','JSON must be first');jsonBytes=bytes.subarray(offset+8,offset+8+n);}
  else if(chunk===1){if(type!==0x004e4942)fail('INVALID_CHUNK','BIN expected');bin=n;}
  else fail('INVALID_CHUNK','Extra chunks are not supported');
  offset+=8+n;chunk++;
 }
 if(!jsonBytes)fail('INVALID_JSON','Missing JSON chunk');
 let gltf;try{gltf=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(jsonBytes).trimEnd());}
 catch{fail('INVALID_JSON','Cannot decode glTF JSON');}
 if(!gltf||gltf.asset?.version!=='2.0')fail('INVALID_JSON','Missing glTF 2.0 asset declaration');
 const nodes=arr(gltf.nodes,'nodes',limits.nodes);
 const meshes=arr(gltf.meshes,'meshes',limits.meshes);
 const skins=arr(gltf.skins,'skins',limits.skins);
 arr(gltf.animations,'animations',limits.animations);
 arr(gltf.accessors,'accessors',12000);
 arr(gltf.bufferViews,'bufferViews',12000);
 let primitives=0;
 for(const m of meshes){primitives+=arr(m?.primitives,'primitives',limits.primitives).length;if(primitives>limits.primitives)fail('RESOURCE_LIMIT','Too many primitives');}
 for(const s of skins)if(!Array.isArray(s?.joints)||s.joints.length>limits.joints)fail('RESOURCE_LIMIT','Too many/invalid skeleton joints');
 for(const e of arr(gltf.extensionsRequired,'extensionsRequired',64))if(!supported.has(e))fail('UNSUPPORTED_EXTENSION','Unknown required extension: '+e);
 for(const x of [...arr(gltf.buffers,'buffers',8),...arr(gltf.images,'images',1024)])if(typeof x?.uri==='string')fail('EXTERNAL_RESOURCE','External and data URIs are forbidden in custom GLBs');
 if(gltf.buffers?.length>1)fail('EXTERNAL_RESOURCE','Only embedded BIN buffers supported');
 if(gltf.buffers?.[0]&&(!Number.isSafeInteger(gltf.buffers[0].byteLength)||gltf.buffers[0].byteLength>bin))fail('INVALID_CHUNK','BIN shorter than buffer declaration');
 return Object.freeze({bytes:bytes.length,nodes:nodes.length,meshes:meshes.length,primitives,skins:skins.length});
}
