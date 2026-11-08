import * as THREE from 'three';
import { applyOrbitFloorFinish } from './OrbitSurfaceMaterials.js';
import {MeshBVH,acceleratedRaycast} from 'three-mesh-bvh';

export const ORBIT_VISUAL_LIMITS=Object.freeze({textureSize:512,patches:42,drawCalls:3,triangles:9000,lights:6});
const RIDING=/^(Ceramic \/|Foundry_Plywood(?:\.|$))/;
const DOWN=new THREE.Vector3(0,-1,0);

function randomSource(seed) {
  let value=seed>>>0;
  return ()=>{value=(Math.imul(value,1664525)+1013904223)>>>0;return value/4294967296;};
}

/** Fine satin/ceramic relief. Source color maps and UVs remain untouched. */
export function createOrbitMicroTextures() {
  const size=ORBIT_VISUAL_LIMITS.textureSize,heights=new Float32Array(size*size),random=randomSource(27183);
  for(let y=0;y<size;y++)for(let x=0;x<size;x++)heights[y*size+x]=random()*.34
    +Math.sin(x*.31)*.045+Math.sin(y*.19)*.045;
  const normalBytes=new Uint8Array(size*size*4),roughBytes=new Uint8Array(size*size*4);
  for(let y=0;y<size;y++)for(let x=0;x<size;x++) {
    const index=y*size+x,i=index*4;
    const dx=heights[y*size+(x+1)%size]-heights[y*size+(x+size-1)%size];
    const dy=heights[((y+1)%size)*size+x]-heights[((y+size-1)%size)*size+x];
    const inv=1/Math.hypot(dx,dy,1);
    normalBytes[i]=Math.round(128-dx*inv*127);normalBytes[i+1]=Math.round(128-dy*inv*127);
    normalBytes[i+2]=Math.round(128+127*inv);normalBytes[i+3]=255;
    const rough=Math.round(177+heights[index]*62);
    roughBytes[i]=roughBytes[i+1]=roughBytes[i+2]=rough;roughBytes[i+3]=255;
  }
  const make=(bytes,name)=>{
    const texture=new THREE.DataTexture(bytes,size,size,THREE.RGBAFormat);
    texture.name=name;texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.repeat.set(7,7);
    texture.minFilter=THREE.LinearMipmapLinearFilter;texture.magFilter=THREE.LinearFilter;
    texture.generateMipmaps=true;texture.needsUpdate=true;return texture;
  };
  return {normal:make(normalBytes,'ORBIT / ceramic micro relief'),roughness:make(roughBytes,'ORBIT / satin micro roughness')};
}

function createMarkMask(kind) {
  const size=256,bytes=new Uint8Array(size*size*4),random=randomSource(812+kind);
  for(let y=0;y<size;y++)for(let x=0;x<size;x++) {
    const u=x/(size-1),v=y/(size-1),edge=Math.min(1,u*16,(1-u)*16,v*10,(1-v)*10),noise=random();
    let alpha=0;
    if(kind===0) {
      for(const lane of [.25,.34,.66,.75]) {
        const curve=lane+.065*Math.sin(v*3.1+lane*7);
        alpha=Math.max(alpha,Math.max(0,1-Math.abs(u-curve)/.013));
      }
      alpha*=edge*(.25+noise*.75)*(.55+.45*Math.sin(v*32)**2);
    } else if(kind===1) {
      const spine=Math.abs(u-.5)<.018&&v>.16&&v<.72;
      const arrow=Math.abs(v-(.33+Math.abs(u-.5)*.7))<.021&&Math.abs(u-.5)<.31;
      const ticks=Math.abs(u-.5)>.35&&Math.abs(u-.5)<.45&&v>.23&&v<.75&&Math.sin(v*65)>0;
      alpha=(spine||arrow||ticks?1:0)*edge*(noise>.15?.4+.6*noise:0);
    } else {
      const border=Math.abs(u-.5)>.37&&Math.abs(u-.5)<.43&&v>.15&&v<.85;
      const stripe=Math.sin((u+v*.65)*31)>0&&v>.27&&v<.73&&Math.abs(u-.5)<.34;
      alpha=(border||stripe?1:0)*edge*(noise>.28?.35+noise*.65:0);
    }
    const i=(y*size+x)*4;bytes[i]=bytes[i+1]=bytes[i+2]=255;bytes[i+3]=Math.round(alpha*255);
  }
  const texture=new THREE.DataTexture(bytes,size,size,THREE.RGBAFormat);
  texture.name=`ORBIT / worn ${['wheel scuff','navigation','caution'][kind]} mask`;
  texture.colorSpace=THREE.SRGBColorSpace;texture.minFilter=THREE.LinearMipmapLinearFilter;
  texture.magFilter=THREE.LinearFilter;texture.generateMipmaps=true;texture.needsUpdate=true;return texture;
}

function isSurface(mesh) {
  if(!mesh.isMesh||mesh.userData.cameraRoof)return false;
  let parent=mesh;
  while(parent) {
    if(!parent.visible||['decoration','collision','sky'].includes(parent.userData?.streetSkateRole))return false;
    parent=parent.parent;
  }
  const materials=Array.isArray(mesh.material)?mesh.material:[mesh.material];
  return materials.some(material=>RIDING.test(material?.name||''));
}

/** Presentation only. Authored riding/collision meshes are never moved or replaced. */
export function createOrbitVisualPass(world) {
  const root=new THREE.Group();root.name='ORBIT / surface treatment and fixture bounce';
  root.userData.streetSkateRole='decoration';root.userData.castShadow=false;
  const stats={patches:0,triangles:0,drawCalls:0,lights:0,rejectedCells:0},batches=[],lights=[];
  const textures=createOrbitMicroTextures(),materials=new Set(),surfaces=[];
  world.park.updateMatrixWorld(true);
  world.park.traverse(mesh=>{
    if(!mesh.isMesh)return;
    for(const material of Array.isArray(mesh.material)?mesh.material:[mesh.material]) {
      if(!material?.isMeshStandardMaterial||materials.has(material))continue;
      materials.add(material);
      if(/^(Ceramic \/|Panel \/)/.test(material.name)) {
        material.normalMap ||= textures.normal;material.normalScale.set(.16,.16);
        material.roughnessMap ||= textures.roughness;
        material.roughness=/^Ceramic/.test(material.name)?.68:.61;
        material.metalness=/^Ceramic/.test(material.name)?.16:.42;
      } else if(/^Titanium \/|^Hardware \//.test(material.name)) {
        material.roughnessMap ||= textures.roughness;
        material.roughness=.45;material.metalness=.82;
      } else if(/^Foundry_(Dark_Timber|Plywood)/.test(material.name)) {
        // The artist's blue/violet coatings retain their color, with a
        // painted structural response instead of mirror-like wood sides.
        material.normalMap ||= textures.normal;material.normalScale.set(.09,.09);
        material.roughnessMap ||= textures.roughness;
        material.roughness=/Plywood/.test(material.name)?.88:.72;material.metalness=.12;
      }
      applyOrbitFloorFinish(material);
      material.needsUpdate=true;
    }
    if(isSurface(mesh)) {
      mesh.geometry.boundsTree ||= new MeshBVH(mesh.geometry,{indirect:true});
      mesh.raycast=acceleratedRaycast;surfaces.push(mesh);
    }
  });
  const bounds=new THREE.Box3();for(const mesh of surfaces)bounds.expandByObject(mesh);
  const inverse=world.park.matrixWorld.clone().invert(),normalMatrix=new THREE.Matrix3(),localNormalMatrix=new THREE.Matrix3().setFromMatrix4(world.park.matrixWorld).transpose();
  const ray=new THREE.Raycaster(),normal=new THREE.Vector3(),hits=[];ray.firstHitOnly=true;
  const sample=(x,z)=>{
    if(bounds.isEmpty())return null;
    ray.set(new THREE.Vector3(x,bounds.max.y+2,z),DOWN);ray.far=bounds.max.y-bounds.min.y+4;
    hits.length=0;ray.intersectObjects(surfaces,false,hits);
    const hit=hits[0];if(!hit?.face)return null;
    normal.copy(hit.face.normal).applyMatrix3(normalMatrix.getNormalMatrix(hit.object.matrixWorld)).normalize();
    if(normal.y<0)normal.negate();
    return normal.y>.68?{point:hit.point.clone(),normal:normal.clone(),mesh:hit.object}:null;
  };
  const candidates=[],random=randomSource(65103);
  for(const spot of world.manifest.spots||[])for(const offset of [-2.1,2.1])candidates.push({x:spot.position[0]+offset,z:spot.position[2]+1.2,angle:spot.heading||0});
  for(const rail of world.manifest.rails||[]) {
    for(const fraction of [.2,.68]) {
      const index=Math.min(rail.points.length-2,Math.floor((rail.points.length-1)*fraction)),a=rail.points[index],b=rail.points[index+1];
      const dx=b[0]-a[0],dz=b[2]-a[2],length=Math.hypot(dx,dz);if(length<.05)continue;
      const side=random()>.5?1:-1,offset=1.2+random()*1.8;
      candidates.push({x:(a[0]+b[0])*.5-dz/length*offset*side,z:(a[2]+b[2])*.5+dx/length*offset*side,
        angle:Math.atan2(dx,dz)+(rail.points.length>5?Math.PI/2:0)});
    }
  }
  const kinds=[{color:0x17212d,opacity:.48,width:1.1,length:3.4},{color:0xb6e6ee,opacity:.36,width:1.4,length:2.8},{color:0xe6bd69,opacity:.3,width:1.15,length:1.7}];
  for(let kindIndex=0;kindIndex<3;kindIndex++) {
    const kind=kinds[kindIndex],positions=[],normals=[],uvs=[],ends=[];
    const subset=candidates.filter((_,index)=>kindIndex===0?index%3!==2:kindIndex===1?index%5===2:index%8===4);
    for(const candidate of subset) {
      if(stats.patches>=ORBIT_VISUAL_LIMITS.patches)break;
      const center=sample(candidate.x,candidate.z);if(!center||kindIndex>0&&center.normal.y<.97)continue;
      const sx=5,sy=10,grid=[],cos=Math.cos(candidate.angle),sin=Math.sin(candidate.angle);
      for(let y=0;y<=sy;y++)for(let x=0;x<=sx;x++) {
        const px=(x/sx-.5)*kind.width,pz=(y/sy-.5)*kind.length;
        grid.push(sample(candidate.x+px*cos+pz*sin,candidate.z-px*sin+pz*cos));
      }
      const before=positions.length;
      for(let y=0;y<sy;y++)for(let x=0;x<sx;x++) {
        const ids=[y*(sx+1)+x,y*(sx+1)+x+1,(y+1)*(sx+1)+x+1,(y+1)*(sx+1)+x],corners=ids.map(i=>grid[i]);
        if(corners.some(p=>!p)||corners.some(p=>p.mesh!==center.mesh||p.normal.dot(center.normal)<.94)
          ||Math.max(...corners.map(p=>p.point.y))-Math.min(...corners.map(p=>p.point.y))>.45){stats.rejectedCells++;continue;}
        for(const triangle of [[0,2,1],[0,3,2]])for(const vertex of triangle) {
          const p=corners[vertex],local=p.point.clone().addScaledVector(p.normal,.004).applyMatrix4(inverse),n=p.normal.clone().applyMatrix3(localNormalMatrix).normalize();
          positions.push(local.x,local.y,local.z);normals.push(n.x,n.y,n.z);
          const id=ids[vertex];uvs.push((id%(sx+1))/sx,Math.floor(id/(sx+1))/sy);
        }
      }
      if(positions.length>before){stats.patches++;ends.push(positions.length/3);}
      if(stats.triangles+positions.length/9>=ORBIT_VISUAL_LIMITS.triangles)break;
    }
    if(!positions.length)continue;
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
    geometry.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));geometry.computeBoundingSphere();
    const material=new THREE.MeshStandardMaterial({name:`ORBIT / projected ${['wheel wear','navigation','caution'][kindIndex]}`,
      map:createMarkMask(kindIndex),color:kind.color,opacity:kind.opacity,transparent:true,roughness:.9,metalness:0,
      depthWrite:false,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1,side:THREE.DoubleSide,
      // A floor decal shows one face per pixel. Three draws transparent
      // double-sided materials twice (back, then front) and re-resolves the
      // shader each time; one pass draws the same pixels.
      forceSinglePass:true});
    const mesh=new THREE.Mesh(geometry,material);mesh.name=material.name;mesh.renderOrder=1;mesh.receiveShadow=true;mesh.castShadow=false;
    mesh.userData.castShadow=false;mesh.userData.streetSkateRole='decoration';root.add(mesh);batches.push({mesh,ends});
    stats.drawCalls++;stats.triangles+=positions.length/9;
  }
  const lightSpecs=[['Orbit bowl coping',.12,0x41bcff,22,9],['Orbit bowl coping',.59,0xd96bff,18,8],
    ['02 / north halfpipe coping',.5,0x5acfff,28,10],['02 / south halfpipe coping',.5,0x9479ff,20,9],
    ['Ion runway long rail',.48,0x56d5ec,12,6],['Long ledge ultraviolet edge',.5,0xb77eff,15,7]];
  for(const [name,fraction,color,intensity,range] of lightSpecs) {
    const rail=world.manifest.rails?.find(r=>r.name===name);if(!rail)continue;
    const p=new THREE.Vector3();
    if(rail.points.length===2)p.fromArray(rail.points[0]).lerp(new THREE.Vector3().fromArray(rail.points[1]),fraction);
    else p.fromArray(rail.points[Math.floor((rail.points.length-1)*fraction)]);
    const light=new THREE.PointLight(color,intensity,range,2);light.position.copy(p);light.position.y+=.38;
    light.name=`ORBIT / bounce from ${name}`;light.castShadow=false;light.userData.orbitBaseIntensity=intensity;root.add(light);lights.push(light);stats.lights++;
  }
  root.userData.visualDetail=stats;world.park.add(root);
  // Textures are shared only within this world's materials; the ordinary
  // world disposer gathers and releases each one once.
  if(![...materials].some(m=>m.normalMap===textures.normal))textures.normal.dispose();
  if(![...materials].some(m=>m.roughnessMap===textures.roughness))textures.roughness.dispose();
  function setQuality(settings={}) {
    const scale=THREE.MathUtils.clamp(Number(settings.surfaceDetailScale??1)||0,0,1);
    root.visible=scale>0;
    for(const {mesh,ends} of batches){const count=scale>0?Math.max(1,Math.ceil(ends.length*scale)):0;mesh.visible=count>0;mesh.geometry.setDrawRange(0,count?ends[count-1]:0);}
    const budget=scale>=.8?6:scale>=.5?4:scale>0?2:0;
    for(const [index,light] of lights.entries())light.visible=index<budget;
  }
  setQuality();return {root,setQuality,stats};
}
