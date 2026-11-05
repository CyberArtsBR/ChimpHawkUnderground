import * as THREE from 'three';
import {gameAssetUrl} from '../game/AssetPaths.js';

// Cosmetic response only: retain authored colors, textures, UVs, names and
// geometry. Some imported timber/rail materials use zero roughness, producing
// mirror highlights on wood and unstable bright pixels on narrow coping.
export function refineWarehouseMaterials(root,{detail=false}={}){
  const touched=new Set();
  root.traverse(object=>{
    if(!object.isMesh)return;
    for(const material of Array.isArray(object.material)?object.material:[object.material]){
      if(!material?.isMeshStandardMaterial||touched.has(material))continue;
      touched.add(material);
      if(/^Foundry_(Plywood(?:_Edges)?|Dark_Timber)(?:\.\d+)?$/.test(material.name)){
        material.metalness=0;
        material.roughness=Math.max(material.roughness,.58);
      }else if(/^Foundry_(Grind_Rail|Stainless_Coping)(?:\.\d+)?$/.test(material.name)){
        material.roughness=Math.max(material.roughness,.16);
      }else if(/^Foundry_Concrete(?:\.\d+)?$/.test(material.name)){
        material.metalness=0;
        material.roughness=Math.max(material.roughness,.82);
      }
      if(detail)enhanceWarehouseMaterial(material);
    }
  });
}

const PHOTO_TIMBER=/^Foundry_(Plywood|Dark_Timber)(?:\.\d+)?$/;
export const WAREHOUSE_PLYWOOD_ASSET='/assets/park/hd/plywood.webp';

// One owned photograph per warehouse world, shared only by its own materials.
// A direct material property makes lifetime and anisotropy updates discoverable.
export function installWarehousePhotoFinish(root,texture){
  texture.name='Grand Warehouse / photographed plywood finish';
  texture.colorSpace=THREE.SRGBColorSpace;
  texture.wrapS=texture.wrapT=THREE.RepeatWrapping;
  texture.minFilter=THREE.LinearMipmapLinearFilter;texture.magFilter=THREE.LinearFilter;
  texture.anisotropy=8;texture.needsUpdate=true;
  const touched=new Set();
  root.traverse(object=>{
    if(!object.isMesh)return;
    for(const material of Array.isArray(object.material)?object.material:[object.material]){
      if(!material?.isMeshStandardMaterial||!PHOTO_TIMBER.test(material.name)||touched.has(material))continue;
      touched.add(material);material.warehouseGrainMap=texture;
      enhanceWarehouseMaterial(material);material.needsUpdate=true;
    }
  });
  return {texture,materials:touched.size};
}

export async function loadWarehousePhotoFinish(root,{loader=new THREE.TextureLoader(),url=gameAssetUrl(WAREHOUSE_PLYWOOD_ASSET)}={}){
  const texture=await loader.loadAsync(url);
  return installWarehousePhotoFinish(root,texture);
}

// World-space microfinish retains source photographs and UVs, including
// materials reused on differently sized panels. Fine relief needs no images.
export function enhanceWarehouseMaterial(material){
  if(!material?.isMeshStandardMaterial||material.userData.warehouseMicrofinish)return;
  const timber=/^Foundry_(Plywood(?:_Edges)?|Dark_Timber)(?:\.\d+)?$/.test(material.name);
  const stone=/^Foundry_Concrete(?:\.\d+)?$/.test(material.name);
  const metal=/^Foundry_(Steel|Grind_Rail|Stainless_Coping)(?:\.\d+)?$/.test(material.name);
  if(/^Foundry_Warm_Lights(?:\.\d+)?$/.test(material.name)){
    material.emissive.set('#ffd6a1');material.emissiveIntensity=1.35;
    material.roughness=.45;material.metalness=0;
    material.userData.warehousePractical=true;
  }
  if(!timber&&!stone&&!metal)return;
  const kind=timber?1:stone?2:3;
  if(timber){material.metalness=0;material.roughness=Math.max(material.roughness,.64);}
  if(metal){material.roughness=Math.max(material.roughness,.24);material.envMapIntensity=.58;}
  const previous=material.onBeforeCompile,cacheKey=material.customProgramCacheKey();
  material.userData.warehouseMicrofinish={kind};
  material.onBeforeCompile=function(shader,renderer){
    previous.call(this,shader,renderer);
    shader.uniforms.warehouseFinishKind={value:kind};
    shader.uniforms.warehousePhotoMap={value:this.warehouseGrainMap||null};
    shader.uniforms.warehousePhotoBlend={value:(this.warehouseGrainMap&&PHOTO_TIMBER.test(this.name)) ? .74 : 0};
    shader.vertexShader='varying vec3 vWarehouseFinishPosition;\nvarying vec3 vWarehouseFinishNormal;\n'+shader.vertexShader;
    shader.vertexShader=shader.vertexShader.replace('#include <worldpos_vertex>',
      '#include <worldpos_vertex>\nvWarehouseFinishPosition=(modelMatrix*vec4(transformed,1.0)).xyz;\nvWarehouseFinishNormal=inverseTransformDirection(transformedNormal,viewMatrix);');
    shader.fragmentShader=`
#define WAREHOUSE_FINISH_KIND ${kind}
varying vec3 vWarehouseFinishPosition;
varying vec3 vWarehouseFinishNormal;
uniform float warehouseFinishKind;
uniform sampler2D warehousePhotoMap;
uniform float warehousePhotoBlend;
vec3 warehousePhotograph(vec3 position,vec3 surfaceNormal){
  // The photo contains two 1.22m-wide plywood sheets, each 2.44m long.
  vec3 weights=pow(abs(normalize(surfaceNormal)),vec3(8.0));
  weights/=max(dot(weights,vec3(1.0)),.0001);
  vec3 sheet=position/2.44;
  return texture2D(warehousePhotoMap,sheet.zy).rgb*weights.x
    +texture2D(warehousePhotoMap,sheet.xz).rgb*weights.y
    +texture2D(warehousePhotoMap,sheet.xy).rgb*weights.z;
}
// Each wave integrates toward its mean as its own pixel footprint grows.
// Fine fibres disappear before broad grain, avoiding a shared distant moire.
float warehouseFilteredSine(float phase){
  float angularFootprint=fwidth(phase);
  float resolvable=1.0-smoothstep(.35,2.8,angularFootprint);
  return sin(phase)*resolvable;
}
float warehouseGrain(vec3 p){
  float lateral=p.x+p.y*.37;
  float longitudinal=p.z+p.y*.61;
#if WAREHOUSE_FINISH_KIND == 1
    float bend=warehouseFilteredSine(longitudinal*1.7)*.9+warehouseFilteredSine(longitudinal*.21)*2.2;
    return .5+.24*warehouseFilteredSine(lateral*76.0+bend)+.16*warehouseFilteredSine(lateral*191.0+bend*2.1)
      +.1*warehouseFilteredSine(longitudinal*3.0);
#elif WAREHOUSE_FINISH_KIND == 2
  return .5+.23*warehouseFilteredSine(lateral*107.0)*warehouseFilteredSine(longitudinal*121.0)
    +.17*warehouseFilteredSine((lateral+longitudinal)*227.0);
#else
  return .5+.29*warehouseFilteredSine(lateral*241.0+warehouseFilteredSine(longitudinal*.7));
#endif
}
`+shader.fragmentShader;
    shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`
      vec3 warehouseAuthoredTint=diffuseColor.rgb;
      #include <map_fragment>
      vec3 warehousePhotoColor=vec3(.3);
      if(warehousePhotoBlend>0.0){
        warehousePhotoColor=warehousePhotograph(vWarehouseFinishPosition,vWarehouseFinishNormal);
        diffuseColor.rgb=mix(diffuseColor.rgb,warehousePhotoColor*warehouseAuthoredTint,warehousePhotoBlend);
      }
    `);
    shader.fragmentShader=shader.fragmentShader.replace('#include <normal_fragment_maps>',`
      #include <normal_fragment_maps>
      float warehouseDetail=warehouseGrain(vWarehouseFinishPosition);
      float warehousePhotoGrain=dot(warehousePhotoColor,vec3(.2126,.7152,.0722))-.3;
      float warehouseHeight=(warehouseDetail-.5)*(warehouseFinishKind<1.5?.0015:warehouseFinishKind<2.5?.0009:.00025)
        +warehousePhotoGrain*.0011*warehousePhotoBlend;
      vec3 warehouseDx=dFdx(-vViewPosition),warehouseDy=dFdy(-vViewPosition);
      vec3 warehouseRx=cross(warehouseDy,normal),warehouseRy=cross(normal,warehouseDx);
      float warehouseDet=dot(warehouseDx,warehouseRx);
      vec3 warehouseGradient=sign(warehouseDet)*(dFdx(warehouseHeight)*warehouseRx+dFdy(warehouseHeight)*warehouseRy);
      normal=normalize(max(abs(warehouseDet),1e-9)*normal-warehouseGradient);
    `);
    shader.fragmentShader=shader.fragmentShader.replace('#include <roughnessmap_fragment>',`
      #include <roughnessmap_fragment>
      float warehouseRoughnessGrain=warehouseGrain(vWarehouseFinishPosition);
      roughnessFactor=clamp(roughnessFactor+(warehouseRoughnessGrain-.5)*.09,.2,1.0);
    `);
  };
  material.customProgramCacheKey=()=>`${cacheKey}/warehouse-microfinish-v4/${kind}`;
  material.needsUpdate=true;
}
