import * as THREE from 'three';
import { MeshBVH, acceleratedRaycast } from 'three-mesh-bvh';

const DOWN=new THREE.Vector3(0,-1,0);
const SURFACES=/Paradise \/ scanned (concrete|asphalt)/i;
export const PARADISE_DETAIL_LIMITS=Object.freeze({patches:48,triangles:18000,drawCalls:3,textureSize:256});

function randomSource(seed) {
  let state=seed>>>0;
  return ()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296;};
}

// Small deterministic masks are shared by a single merged batch per finish.
// DataTexture also makes the authored detail identical in Node validation.
export function createParadiseWearMask(style,seed=851) {
  const size=PARADISE_DETAIL_LIMITS.textureSize,data=new Uint8Array(size*size*4),random=randomSource(seed);
  for(let y=0;y<size;y++)for(let x=0;x<size;x++) {
    const u=x/(size-1),v=y/(size-1),noise=random();
    const edge=Math.min(1,u*16,(1-u)*16,v*12,(1-v)*12);
    let alpha=0;
    if(style==='scuff') {
      for(const lane of [.24,.34,.65,.75]) {
        const curve=lane+.08*Math.sin(v*2.6+lane*8)+.025*(v-.5)**2;
        const width=.006+((lane===.34||lane===.65)? .012:.004);
        alpha=Math.max(alpha,Math.max(0,1-Math.abs(u-curve)/width));
      }
      alpha*=edge*(.32+.68*noise)*(.6+.4*Math.sin(v*19)**2);
    } else if(style==='patch') {
      const radius=Math.hypot((u-.5)*1.65,(v-.5)*1.85);
      alpha=Math.max(0,Math.min(1,(.76-radius+(noise-.5)*.09)*15))*edge*(.55+.45*noise);
    } else {
      const lane=Math.abs(u-.5)<.028;
      const chevron=Math.abs(v-(.38+Math.abs(u-.5)*.72))<.026&&Math.abs(u-.5)<.29;
      alpha=(lane&&v>.16&&v<.65||chevron?1:0)*edge*(noise>.32?(.35+.65*noise):0);
    }
    const i=(y*size+x)*4;data[i]=data[i+1]=data[i+2]=255;data[i+3]=Math.round(255*alpha);
  }
  const texture=new THREE.DataTexture(data,size,size,THREE.RGBAFormat);
  texture.name=`Paradise / ${style} wear mask`;
  texture.colorSpace=THREE.SRGBColorSpace;
  texture.magFilter=THREE.LinearFilter;texture.minFilter=THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps=true;texture.needsUpdate=true;
  return texture;
}

function flagged(object,role) {
  let current=object;
  while(current){if(current.userData?.streetSkateRole===role)return true;current=current.parent;}
  return false;
}

function visible(object) {
  let current=object;
  while(current){if(!current.visible)return false;current=current.parent;}
  return true;
}

/** Add visual-only, triangle-projected wear without touching the riding proxies. */
export function createParadiseSurfaceDetail(world,{seed=851,maxPatches=48}={}) {
  const root=new THREE.Group();root.name='Paradise / wheel wear and repaired concrete';
  root.userData.streetSkateRole='decoration';root.userData.castShadow=false;
  const stats={patches:0,triangles:0,drawCalls:0,rejectedCells:0};
  const batches=[],meshes=[];
  world.park.updateMatrixWorld(true);
  world.park.traverse(object=>{
    if(!object.isMesh||!visible(object)||flagged(object,'collision')||flagged(object,'decoration'))return;
    const materials=Array.isArray(object.material)?object.material:[object.material];
    if(!materials.some(material=>SURFACES.test(material?.name||'')))return;
    object.geometry.boundsTree||=new MeshBVH(object.geometry,{indirect:true});
    object.raycast=acceleratedRaycast;meshes.push(object);
  });
  const bounds=new THREE.Box3();for(const mesh of meshes)bounds.expandByObject(mesh);
  const ray=new THREE.Raycaster();ray.firstHitOnly=true;
  const inverse=world.park.matrixWorld.clone().invert(),normalMatrix=new THREE.Matrix3();
  const localNormalMatrix=new THREE.Matrix3().setFromMatrix4(world.park.matrixWorld).transpose(),localNormal=new THREE.Vector3();
  const normal=new THREE.Vector3(),hits=[];
  const sample=(x,z)=>{
    ray.set(new THREE.Vector3(x,bounds.max.y+3,z),DOWN);ray.far=bounds.max.y-bounds.min.y+6;
    hits.length=0;ray.intersectObjects(meshes,false,hits);
    for(const hit of hits) {
      const material=Array.isArray(hit.object.material)?hit.object.material[hit.face.materialIndex]:hit.object.material;
      if(!SURFACES.test(material?.name||''))return null;
      normal.copy(hit.face.normal).applyMatrix3(normalMatrix.getNormalMatrix(hit.object.matrixWorld)).normalize();
      if(normal.y<0)normal.negate();
      if(normal.y<.62)return null;
      return {point:hit.point.clone(),normal:normal.clone(),mesh:hit.object};
    }
    return null;
  };
  const random=randomSource(seed),candidates=[];
  const spawn=world.manifest.spawn;
  for(const offset of [[-1.8,-1.5],[2.2,1.2],[.5,3.8]])candidates.push({x:spawn[0]+offset[0],z:spawn[2]+offset[1],angle:0});
  for(const rail of world.manifest.rails||[]) {
    const points=rail.points;if(points.length<2)continue;
    const index=Math.max(0,Math.floor((points.length-1)*.43)),a=points[index],b=points[index+1];
    const dx=b[0]-a[0],dz=b[2]-a[2],length=Math.hypot(dx,dz);if(length<.05)continue;
    const side=random()>.5?1:-1,offset=1.4+random()*1.2;
    candidates.push({x:(a[0]+b[0])*.5-dz/length*offset*side,z:(a[2]+b[2])*.5+dx/length*offset*side,
      angle:Math.atan2(dx,dz)+(rail.transition?Math.PI/2:0)});
  }
  const kinds=[
    {style:'scuff',color:0x514b43,opacity:.49,width:1.2,length:3.5},
    {style:'patch',color:0x707574,opacity:.25,width:2.0,length:2.65},
    {style:'paint',color:0xe1c990,opacity:.38,width:1.15,length:1.8},
  ];
  const budget=Math.min(PARADISE_DETAIL_LIMITS.patches,Math.max(0,Math.floor(maxPatches)));
  const placed=[];
  for(const [kindIndex,kind] of kinds.entries()) {
    const positions=[],normals=[],uvs=[],ends=[];
    for(let index=kindIndex;index<candidates.length&&stats.patches<budget;index+=kindIndex===0?1:kindIndex===1?5:8) {
      if(kindIndex===0&&index%5===4)continue;
      const candidate=candidates[index],center=sample(candidate.x,candidate.z);if(!center)continue;
      // Repairs and painted approach arrows belong to flat concrete, never walls.
      if(kindIndex>0&&center.normal.y<.96)continue;
      const width=kind.width*(.85+random()*.3),length=kind.length*(.85+random()*.3);
      const sx=6,sy=14,grid=[],cos=Math.cos(candidate.angle),sin=Math.sin(candidate.angle);
      for(let y=0;y<=sy;y++)for(let x=0;x<=sx;x++){
        const px=(x/sx-.5)*width,pz=(y/sy-.5)*length;
        grid.push(sample(candidate.x+px*cos+pz*sin,candidate.z-px*sin+pz*cos));
      }
      const before=positions.length;
      for(let y=0;y<sy;y++)for(let x=0;x<sx;x++) {
        const ids=[y*(sx+1)+x,y*(sx+1)+x+1,(y+1)*(sx+1)+x+1,(y+1)*(sx+1)+x];
        const corners=ids.map(i=>grid[i]);
        if(corners.some(p=>!p)||corners.some(p=>p.mesh!==corners[0].mesh||p.normal.dot(corners[0].normal)<.94)
          ||Math.max(...corners.map(p=>p.point.y))-Math.min(...corners.map(p=>p.point.y))>.5){stats.rejectedCells++;continue;}
        for(const [a,b,c] of [[0,2,1],[0,3,2]])for(const vertex of [a,b,c]){
          const p=corners[vertex],local=p.point.clone().addScaledVector(p.normal,.004).applyMatrix4(inverse);
          localNormal.copy(p.normal).applyMatrix3(localNormalMatrix).normalize();
          positions.push(local.x,local.y,local.z);normals.push(localNormal.x,localNormal.y,localNormal.z);
          const id=ids[vertex];uvs.push((id%(sx+1))/sx,Math.floor(id/(sx+1))/sy);
        }
      }
      if(positions.length>before){stats.patches++;ends.push(positions.length/3);placed.push({style:kind.style,x:candidate.x,z:candidate.z});}
      if(stats.triangles+positions.length/9>=PARADISE_DETAIL_LIMITS.triangles)break;
    }
    if(!positions.length)continue;
    const geometry=new THREE.BufferGeometry();
    geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
    geometry.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));
    geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));
    geometry.computeBoundingSphere();
    const material=new THREE.MeshStandardMaterial({name:`Paradise / projected ${kind.style}`,map:createParadiseWearMask(kind.style,seed+kindIndex),
      color:kind.color,transparent:true,opacity:kind.opacity,roughness:.97,metalness:0,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1,
      side:THREE.DoubleSide});
    const mesh=new THREE.Mesh(geometry,material);mesh.name=material.name;mesh.castShadow=false;mesh.receiveShadow=true;
    mesh.userData.castShadow=false;mesh.userData.streetSkateRole='decoration';mesh.renderOrder=1;root.add(mesh);
    batches.push({mesh,ends});stats.triangles+=positions.length/9;stats.drawCalls++;
  }
  root.userData.patchLocations=placed;root.userData.surfaceDetail=stats;
  world.park.add(root);
  function setQuality(settings={}) {
    const scale=THREE.MathUtils.clamp(Number(settings.surfaceDetailScale??1)||0,0,1);
    root.visible=scale>0;
    for(const {mesh,ends} of batches) {
      const count=scale>0?Math.max(1,Math.ceil(ends.length*scale)):0;
      mesh.geometry.setDrawRange(0,count?ends[count-1]:0);mesh.visible=count>0;
    }
  }
  setQuality();
  return {root,setQuality,stats};
}
