import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { inspectGlb, GLB_LIMITS } from '../../tools/agent10-glb-inspector.mjs';
import { ParkCollision } from './ParkCollision.js';
import { validateParkWorld, disposeParkWorld } from './ParkRegistry.js';
import { authoredSurfaceTag, validatedSurfaceTag } from './SurfaceAudio.js';

export const TEST_MAP_LIMITS = Object.freeze({ ...GLB_LIMITS, bytes:80*1024*1024, nodes:2048, meshes:1024 });
const MAX_TRIANGLES = 350000;
const finiteVector = v => Array.isArray(v) && v.length === 3 && v.every(n => Number.isFinite(n) && Math.abs(n) < 10000);
const PRESENTATION_NUMBERS = Object.freeze({ exposure:[.25,2], ambientIntensity:[0,3], keyIntensity:[0,8],
  environmentIntensity:[0,2], fillIntensity:[0,3], fogDensity:[0,.01] });
const PRESENTATION_COLORS = new Set(['ambientSky','ambientGround','keyColor','fillColor','fogColor','background']);
const PRESENTATION_VECTORS = new Set(['center','keyPosition','fillPosition']);
const MAX_MAP_LIGHTS = 12;
const TRANSITION_TYPES=new Set(['BOWL','VERT','MINI','QUARTER','BANK','KICKER','HIP','SPINE']);

export function readTestMapTransition(source) {
  if(source===undefined)return undefined;
  if(!source||typeof source!=='object'||Array.isArray(source)
    ||typeof source.id!=='string'||!/^[a-z0-9][a-z0-9-]{0,79}$/.test(source.id)
    ||!TRANSITION_TYPES.has(source.type)||!['LINEAR','RADIAL'].includes(source.axisMode))
    throw new Error('Invalid test map ramp transition.');
  const result={id:source.id,type:source.type,axisMode:source.axisMode};
  for(const key of ['supportsVert','supportsTransfer','supportsPump','supportsLipTricks']) {
    if(typeof source[key]!=='boolean')throw new Error('Invalid test map ramp capability.');
    result[key]=source[key];
  }
  if(source.geometryRole!==undefined&&!['LIP','AREA_ANCHOR'].includes(source.geometryRole))throw new Error('Invalid test map ramp role.');
  result.geometryRole=source.geometryRole||(result.supportsVert?'LIP':'AREA_ANCHOR');
  result.cameraHint=source.type;
  return result;
}

export function readTestMapPresentation(source) {
  if(source === undefined) return {};
  if(!source || typeof source !== 'object' || Array.isArray(source)) throw new Error('Invalid test map lighting description.');
  const presentation={};
  for(const [key,value] of Object.entries(source)) {
    if(Object.hasOwn(PRESENTATION_NUMBERS,key)) {
      const [min,max]=PRESENTATION_NUMBERS[key];
      if(!Number.isFinite(value) || value<min || value>max) throw new Error(`Invalid test map lighting value: ${key}.`);
      presentation[key]=value;
    } else if(PRESENTATION_COLORS.has(key)) {
      if(typeof value!=='string' || !/^#[0-9a-f]{6}$/i.test(value)) throw new Error(`Invalid test map lighting color: ${key}.`);
      presentation[key]=value;
    } else if(PRESENTATION_VECTORS.has(key)) {
      if(!finiteVector(value)) throw new Error(`Invalid test map lighting position: ${key}.`);
      presentation[key]=[...value];
    } else if(key==='environmentFromSky') {
      if(typeof value!=='boolean') throw new Error('Invalid test map lighting setting: environmentFromSky.');
      presentation[key]=value;
    } else throw new Error(`Unsupported test map lighting setting: ${key}.`);
  }
  return presentation;
}

export function createTestMapEnvironment(skyTexture) {
  const image=skyTexture.image;
  const resize=Number.isFinite(image?.width)&&image.width>2048;
  const imageBitmap=typeof ImageBitmap==='function'&&image instanceof ImageBitmap;
  let reflectionImage=null;
  if(resize || imageBitmap) {
    const width=Math.min(2048,image.width),height=Math.max(1,Math.round(image.height*width/image.width));
    try {
      const canvas=typeof OffscreenCanvas==='function'?new OffscreenCanvas(width,height):
        typeof document!=='undefined'&&typeof document.createElement==='function'?document.createElement('canvas'):null;
      if(!canvas) return null;
      canvas.width=width;canvas.height=height;
      const context=canvas.getContext('2d',{alpha:false});
      if(!context) return null;
      context.drawImage(image,0,0,width,height);
      reflectionImage=canvas;
    } catch { return null; }
  }
  const environment=skyTexture.clone();
  // Texture.clone shares its Source. Assign a new Source for the downsampled
  // image, so replacing it cannot shrink or flip the visible sky dome.
  if(reflectionImage) environment.source=new THREE.Source(reflectionImage);
  environment.mapping=THREE.EquirectangularReflectionMapping;
  environment.flipY=true;
  environment.offset.set(0,0);environment.repeat.set(1,1);
  environment.center.set(0,0);environment.rotation=0;
  environment.matrix.identity();environment.matrixAutoUpdate=false;
  environment.needsUpdate=true;
  return environment;
}

// Validate before GLTFLoader creates images, meshes or requests resources.
export function inspectTestMap(buffer) {
  inspectGlb(buffer, TEST_MAP_LIMITS);
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const json = JSON.parse(new TextDecoder().decode(bytes.subarray(20,20+view.getUint32(12,true))).trimEnd());
  if (json.skins?.length || json.animations?.length) throw new Error('Test maps must be static scenes, without character rigs or animations.');
  const lights=json.extensions?.KHR_lights_punctual?.lights;
  if(lights!==undefined) {
    if(!Array.isArray(lights) || lights.length>128) throw new Error('Invalid test map lights.');
    for(const light of lights) if(!light || !['point','spot'].includes(light.type)
      || (light.intensity!==undefined && (!Number.isFinite(light.intensity) || light.intensity<0))
      || (light.range!==undefined && (!Number.isFinite(light.range) || light.range<=0))
      || (light.color!==undefined && (!Array.isArray(light.color) || light.color.length!==3
        || !light.color.every(v=>Number.isFinite(v)&&v>=0&&v<=1)))
      || (light.type==='spot' && light.spot!==undefined && (!light.spot || typeof light.spot!=='object' || Array.isArray(light.spot)
        || (light.spot.innerConeAngle!==undefined && (!Number.isFinite(light.spot.innerConeAngle) || light.spot.innerConeAngle<0))
        || (light.spot.outerConeAngle!==undefined && (!Number.isFinite(light.spot.outerConeAngle) || light.spot.outerConeAngle<=0
          || light.spot.outerConeAngle>Math.PI/2))
        || (light.spot.innerConeAngle??0)>(light.spot.outerConeAngle??Math.PI/4))))
      throw new Error('Test maps support finite point and spot lights only.');
  }
  let triangles = 0;
  for (const mesh of json.meshes || []) for (const p of mesh.primitives || []) {
    if (p.mode !== undefined && p.mode !== 4) throw new Error('Map geometry must use triangles.');
    const position = json.accessors?.[p.attributes?.POSITION];
    const count = json.accessors?.[p.indices]?.count ?? position?.count;
    if (!position || !Number.isSafeInteger(count) || count < 3 || !Number.isSafeInteger(position.count)
      || position.count > MAX_TRIANGLES*3) throw new Error('Invalid map geometry.');
    triangles += count / 3;
  }
  if (!triangles || triangles > MAX_TRIANGLES) throw new Error('Choose a map with at most 350,000 triangles.');
  const nodes = json.nodes || [], parents = new Set(), visiting = new Set(), visited = new Set();
  const visit = i => {
    if (!Number.isInteger(i) || !nodes[i] || visiting.has(i)) throw new Error('Invalid map scene hierarchy.');
    if (visited.has(i)) return;
    visiting.add(i);
    const n=nodes[i];
    for (const key of ['translation','rotation','scale','matrix']) if (n[key] &&
      (!Array.isArray(n[key]) || n[key].length !== ({translation:3,rotation:4,scale:3,matrix:16}[key]) ||
      !n[key].every(x=>Number.isFinite(x)&&Math.abs(x)<10000))) throw new Error('Invalid map transform.');
    for (const child of n.children || []) {
      if (parents.has(child)) throw new Error('Map nodes cannot have multiple parents.');
      parents.add(child); visit(child);
    }
    visiting.delete(i); visited.add(i);
  };
  nodes.forEach((_,i)=>visit(i));
  return { triangles, json };
}

export function readTestMapManifest(park) {
  const entries=[];
  park.traverse(node=>{ if(node.userData.streetSkateMap !== undefined) entries.push(node.userData.streetSkateMap); });
  if (!entries.length) return null;
  if(entries.length!==1) throw new Error('The GLB must contain one map description.');
  const data=typeof entries[0]==='string'?JSON.parse(entries[0]):entries[0];
  if(data?.version!==1 || !finiteVector(data.spawn) || !Array.isArray(data.rails) || data.rails.length>512
    || !Array.isArray(data.playableRegions) || data.playableRegions.length>64 || !data.playableRegions.length)
    throw new Error('Invalid StreetSkate map description.');
  for(const rail of data.rails) if(typeof rail.name!=='string' || rail.name.length>120 || !Array.isArray(rail.points)
    || rail.points.length<2 || rail.points.length>4096 || !rail.points.every(finiteVector)
    || !Number.isFinite(rail.radius) || rail.radius<.02 || rail.radius>.5)
    throw new Error('Invalid grind path in test map.');
  for(const r of data.playableRegions) if(!['minX','maxX','minZ','maxZ'].every(k=>Number.isFinite(r[k])&&Math.abs(r[k])<10000)
    || r.minX>=r.maxX || r.minZ>=r.maxZ) throw new Error('Invalid test map boundary.');
  if(data.spawnHeading!==undefined&&!Number.isFinite(data.spawnHeading))throw new Error('Invalid spawn heading.');
  const transitionIds=new Set();
  const rails=data.rails.map(r=>{
    const transition=readTestMapTransition(r.transition);
    if(transition){if(transitionIds.has(transition.id))throw new Error('Duplicate test map ramp transition.');transitionIds.add(transition.id);}
    return {name:r.name,points:r.points,radius:r.radius,
      audioSurfaceTag:validatedSurfaceTag(r.audioSurfaceTag ?? r.surfaceType),...(transition?{transition}:{})};
  });
  const presentation=readTestMapPresentation(data.presentation);
  return { name:String(data.name||'Uploaded test map').slice(0,80), spawn:data.spawn, spawnHeading:data.spawnHeading||0,
    transitionScale:1, rails,
    playableRegions:data.playableRegions.map(r=>({minX:r.minX,maxX:r.maxX,minZ:r.minZ,maxZ:r.maxZ})), spots:[], routes:[], presentation };
}

function nodeFlag(node, key) {
  for(let n=node;n;n=n.parent) if(n.userData[key]!==undefined) return n.userData[key];
}

export function assembleTestMap(park, filename='Uploaded map.glb') {
  const world={id:'test-map',park,collision:new THREE.Group(),cameraRoof:[]};
  try {
    const authored=readTestMapManifest(park), bounds=new THREE.Box3();
    const material=new THREE.MeshBasicMaterial({side:THREE.DoubleSide});
    park.updateMatrixWorld(true);
    let triangles=0, collisionCount=0, lightCount=0, skyTexture=null;
    const retiredSkyMaterials=new Set();
    park.traverse(node=>{
      if(node.isLight) {
        // Keep embedded fill/neon lights bounded. The game owns the single sun
        // shadow map; authored bounce light comes from materials/vertex colors.
        node.castShadow=false;
        if((node.isPointLight || node.isSpotLight) && lightCount++<MAX_MAP_LIGHTS) {
          node.intensity=Number.isFinite(node.intensity)?THREE.MathUtils.clamp(node.intensity,0,5000):0;
          node.distance=Number.isFinite(node.distance)&&node.distance>0?Math.min(node.distance,80):80;
          node.decay=2;
        } else node.intensity=0;
        return;
      }
      if(!node.isMesh)return;
      const role=nodeFlag(node,'streetSkateRole');
      if(role==='sky') {
        node.userData.castShadow=false;node.castShadow=false;
        const unlit=(Array.isArray(node.material)?node.material:[node.material]).map(material=>{
          const map=material?.map?.isTexture?material.map:material?.emissiveMap?.isTexture?material.emissiveMap:null;
          if(!skyTexture) skyTexture=map;
          if(material) retiredSkyMaterials.add(material);
          // A Blender emission shader can export as a metallic standard material.
          // Normalize to unlit so scene reflections and quality-dependent emissive
          // scaling can never wash out the photographic panorama.
          return new THREE.MeshBasicMaterial({name:`${material?.name||'Test map sky'} / unlit`,map,
            color:0xffffff,side:THREE.DoubleSide,fog:false,depthWrite:false,toneMapped:false});
        });
        node.material=Array.isArray(node.material)?unlit:unlit[0];
        node.renderOrder=-10;
        return;
      }
      if((Array.isArray(node.material)?node.material:[node.material]).some(m=>
        /^(LED|Grind) \/ /.test(m?.name||'') && m.emissive?.getHex?.()>0 && m.emissiveIntensity>0))
        park.userData.environmentBloom=true;
      const p=node.geometry?.attributes.position;
      if(!p)throw new Error('Map contains a mesh without positions.');
      for(let i=0;i<p.count;i++) if(![p.getX(i),p.getY(i),p.getZ(i)].every(Number.isFinite))throw new Error('Map contains invalid vertices.');
      const box=new THREE.Box3().setFromObject(node);
      if(![...box.min.toArray(),...box.max.toArray()].every(n=>Number.isFinite(n)&&Math.abs(n)<10000))throw new Error('Map is too large or has invalid coordinates.');
      if(role!=='collision') {
        if(role!=='decoration') bounds.union(box);
        triangles+=(node.geometry.index?.count||p.count)/3;
      }
      if(authored ? role!=='collision' : role==='decoration') return;
      const geometry=node.geometry.clone().applyMatrix4(node.matrixWorld);
      const mesh=new THREE.Mesh(geometry,material);
      mesh.name=node.name;
      mesh.userData.surface=nodeFlag(node,'surface')==='solid'?'solid':'rideable';
      mesh.userData.audioSurfaceTag=authoredSurfaceTag(node)||'neutral';
      mesh.userData.transitionSkin=nodeFlag(node,'transitionSkin')===true;
      mesh.userData.railId=nodeFlag(node,'railId');
      mesh.userData.cameraTransparent=nodeFlag(node,'cameraTransparent')===true;
      world.collision.add(mesh);collisionCount++;
      if(role==='collision')node.visible=false;
    });
    if(retiredSkyMaterials.size) {
      const retainedMaterials=new Set(),retainedTextures=new Set();
      park.traverse(node=>{
        for(const material of Array.isArray(node.material)?node.material:[node.material]) if(material) {
          retainedMaterials.add(material);
          for(const value of Object.values(material)) if(value?.isTexture) retainedTextures.add(value);
        }
      });
      for(const material of retiredSkyMaterials) if(!retainedMaterials.has(material)) {
        for(const value of Object.values(material)) if(value?.isTexture&&!retainedTextures.has(value)) value.dispose();
        material.dispose();
      }
    }
    if(!collisionCount) {material.dispose();throw new Error('Map has no collision surfaces.');}
    if(bounds.isEmpty())throw new Error('Map has no visible skating geometry.');
    const size=bounds.getSize(new THREE.Vector3()), center=bounds.getCenter(new THREE.Vector3());
    if(size.x<3||size.z<3||Math.max(size.x,size.z)>2000)throw new Error('Map must be between 3 and 2,000 metres across.');
    if(!authored) {
      // Generic GLBs get static mesh collision and a probed flat entrance.
      // Explicit authored paths are required to identify real grind rails.
      const surface=new ParkCollision(world.collision), ray=new THREE.Raycaster(), normal=new THREE.Vector3();
      let spawn=null;
      for(let ring=0;ring<=7&&!spawn;ring++)for(let x=-ring;x<=ring&&!spawn;x++)for(let z=-ring;z<=ring&&!spawn;z++) {
        if(ring&&Math.abs(x)!==ring&&Math.abs(z)!==ring)continue;
        ray.set(new THREE.Vector3(center.x+x*size.x/18,bounds.max.y+2,center.z+z*size.z/18),new THREE.Vector3(0,-1,0));
        for(const hit of ray.intersectObjects(surface.ridingMeshes,false)) {
          surface.normal(hit,normal);if(Math.abs(normal.y)<.98)continue;
          const p=hit.point.clone().add(new THREE.Vector3(0,.04,0));
          const body=surface.move(p,p,new THREE.Vector3(),{grounded:false});
          if(!body.contacts.length){spawn=p.toArray();break;}
        }
      }
      if(!spawn)throw new Error('No clear, flat entrance found. Add StreetSkate spawn and collision metadata.');
      world.manifest={name:filename.replace(/\.glb$/i,''),spawn,spawnHeading:0,transitionScale:1,rails:[],spots:[],routes:[],
        playableRegions:[{minX:bounds.min.x,maxX:bounds.max.x,minZ:bounds.min.z,maxZ:bounds.max.z}]};
    } else world.manifest=authored;
    Object.assign(world.manifest,{locationId:'test-map',visualTriangles:triangles,dimensions:`${Math.round(size.x)} × ${Math.round(size.z)} m · LOCAL TEST`});
    world.presentation={center:[center.x,0,center.z],sky:false,background:'#afc8d2',fogColor:'#c3d7dc',fogDensity:.00025,
      exposure:1.03,ambientSky:'#c5e3ff',ambientGround:'#827567',ambientIntensity:1.15,keyColor:'#fff0d3',keyIntensity:2.6,
      keyPosition:[center.x-45,85,center.z+30],shadowExtent:Math.max(size.x,size.z)*.6,environmentIntensity:.4,fillIntensity:.25};
    for(const key of Object.keys(authored?.presentation||{})) world.presentation[key]=authored.presentation[key];
    if(world.presentation.environmentFromSky) {
      if(!skyTexture) throw new Error('Sky reflections require an embedded textured sky dome.');
      // Reflect the same sky seen by the player without changing the dome's
      // glTF UV mapping or the material's flip convention.
      world.environment=createTestMapEnvironment(skyTexture);
    }
    validateParkWorld(world);
    return world;
  } catch(error) {disposeParkWorld(world);throw error;}
}

export async function createTestMapWorld(file, onProgress=()=>{}) {
  if(!file || !/\.glb$/i.test(file.name) || file.size>TEST_MAP_LIMITS.bytes || file.size<20)
    throw new Error('Choose a self-contained .GLB map smaller than 80 MB.');
  onProgress('READING LOCAL MAP…');
  const buffer=await file.arrayBuffer();
  inspectTestMap(buffer);
  onProgress('PREPARING MAP SURFACES…');
  const manager=new THREE.LoadingManager();
  manager.setURLModifier(url=>{if(!url.startsWith('blob:'))throw new Error('Test maps cannot load external resources.');return url;});
  const gltf=await new GLTFLoader(manager).parseAsync(buffer,'');
  return assembleTestMap(gltf.scene,file.name);
}
