import * as THREE from 'three';
import {MeshBVH,acceleratedRaycast} from 'three-mesh-bvh';

const SURFACES=/^(Foundry_(Plywood(?:_Edges)?|Dark_Timber|Concrete)(?:\.\d+)?$|Urban Warehouse \/ premium charcoal)/;
const DOWN=new THREE.Vector3(0,-1,0);
export const WAREHOUSE_DETAIL_LIMITS=Object.freeze({patches:56,drawCalls:2,triangles:14000,lights:4,textureSize:256});

const seeded=seed=>()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);

export function collectWarehousePracticalAnchors(root){
  const anchors=[];root.updateMatrixWorld(true);
  root.traverse(object=>{
    const materials=Array.isArray(object.material)?object.material:[object.material];
    if(!object.isMesh||!materials.some(m=>/^Foundry_Warm_Lights(?:\.\d+)?$/.test(m?.name||'')))return;
    const point=new THREE.Box3().setFromObject(object).getCenter(new THREE.Vector3());
    if(point.y>8&&point.y<30)anchors.push(point.toArray());
  });
  return anchors;
}

function makeWearTexture(style){
  const size=WAREHOUSE_DETAIL_LIMITS.textureSize,data=new Uint8Array(size*size*4),random=seeded(7001+style);
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const u=x/(size-1),v=y/(size-1),noise=random();
    const fade=Math.max(0,Math.min(1,u*18,(1-u)*18,v*8,(1-v)*8));
    let mask=0;
    if(style===0){
      for(const lane of [.23,.32,.68,.77]){
        const bend=lane+.055*Math.sin(v*3.1+lane*5);
        mask=Math.max(mask,Math.max(0,1-Math.abs(u-bend)/.009));
      }
      mask*=fade*(.25+.75*noise)*(.55+.45*Math.sin(v*36)**2);
    }else{
      const radius=Math.hypot((u-.5)*1.9,(v-.5)*1.6);
      mask=Math.max(0,Math.min(1,(.72-radius+(noise-.5)*.05)*22))*fade*(.6+.4*noise);
    }
    const i=(y*size+x)*4;data[i]=data[i+1]=data[i+2]=255;data[i+3]=Math.round(mask*255);
  }
  const map=new THREE.DataTexture(data,size,size,THREE.RGBAFormat);
  map.name=`Warehouse / ${style?'floor repair':'urethane wheel rub'} mask`;
  map.colorSpace=THREE.SRGBColorSpace;map.generateMipmaps=true;
  map.minFilter=THREE.LinearMipmapLinearFilter;map.magFilter=THREE.LinearFilter;map.needsUpdate=true;
  return map;
}

/** Visual wear follows visible riding faces, never stale proxies or the roof. */
export function createWarehouseVisualPass(world,{practicalAnchors=[]}={}){
  const root=new THREE.Group();root.name='Grand Warehouse / workshop finish';
  root.userData.streetSkateRole='decoration';root.userData.castShadow=false;
  const stats={patches:0,triangles:0,drawCalls:0,lights:0,rejectedCells:0};
  const meshes=[],batches=[],lights=[],bounds=new THREE.Box3();
  world.park.updateMatrixWorld(true);
  world.park.traverse(mesh=>{
    if(!mesh.isMesh||!mesh.visible||mesh.userData.cameraRoof||mesh.userData.streetSkateRole==='decoration')return;
    if(Array.isArray(mesh.material)||!SURFACES.test(mesh.material?.name||''))return;
    mesh.geometry.boundsTree||=new MeshBVH(mesh.geometry,{indirect:true});mesh.raycast=acceleratedRaycast;
    meshes.push(mesh);bounds.expandByObject(mesh);
  });
  const ray=new THREE.Raycaster();ray.firstHitOnly=true;
  const normalMatrix=new THREE.Matrix3(),normal=new THREE.Vector3(),hits=[];
  const inverse=world.park.matrixWorld.clone().invert();
  const localNormalMatrix=new THREE.Matrix3().setFromMatrix4(world.park.matrixWorld).transpose();
  const sample=(x,z)=>{
    if(!meshes.length)return null;
    ray.set(new THREE.Vector3(x,bounds.max.y+2,z),DOWN);ray.far=bounds.max.y-bounds.min.y+4;
    hits.length=0;ray.intersectObjects(meshes,false,hits);
    const hit=hits[0];if(!hit)return null;
    normal.copy(hit.face.normal).applyMatrix3(normalMatrix.getNormalMatrix(hit.object.matrixWorld)).normalize();
    if(normal.y<0)normal.negate();
    if(normal.y<.62)return null;
    return {point:hit.point.clone(),normal:normal.clone(),mesh:hit.object};
  };
  const random=seeded(65019),candidates=[];
  for(const spot of world.manifest.spots||[]){
    const [x,,z]=spot.position;
    for(const [dx,dz]of [[-1.5,1.1],[1.8,-1.3]])candidates.push({x:x+dx,z:z+dz,angle:spot.heading||0});
  }
  for(const rail of world.manifest.rails||[]){
    const pts=rail.points;if(pts.length<2)continue;
    const i=Math.min(pts.length-2,Math.floor((pts.length-1)*.47)),a=pts[i],b=pts[i+1];
    const dx=b[0]-a[0],dz=b[2]-a[2],len=Math.hypot(dx,dz);if(len<.1)continue;
    for(const side of [-1,1])candidates.push({x:(a[0]+b[0])*.5-dz/len*1.7*side,z:(a[2]+b[2])*.5+dx/len*1.7*side,
      angle:Math.atan2(dx,dz)+(rail.transition?Math.PI/2:0)});
  }
  const styles=[{width:1.15,length:3.2,color:0x3c342c,opacity:.38},{width:1.55,length:2.0,color:0x9a8c77,opacity:.16}];
  for(const [style,finish]of styles.entries()){
    const positions=[],normals=[],uv=[],ends=[];
    const maxForStyle=style===0?42:WAREHOUSE_DETAIL_LIMITS.patches;
    for(let index=style?2:0;index<candidates.length&&stats.patches<maxForStyle;index+=style?7:1){
      const center=candidates[index],hit=sample(center.x,center.z);if(!hit)continue;
      if(style&&(!/Concrete|charcoal/.test(hit.mesh.material.name)||hit.normal.y<.98))continue;
      const width=finish.width*(.9+random()*.2),length=finish.length*(.9+random()*.2);
      const cos=Math.cos(center.angle),sin=Math.sin(center.angle),nx=6,nz=12,grid=[];
      for(let z=0;z<=nz;z++)for(let x=0;x<=nx;x++){
        const px=(x/nx-.5)*width,pz=(z/nz-.5)*length;
        grid.push(sample(center.x+px*cos+pz*sin,center.z-px*sin+pz*cos));
      }
      const start=positions.length;
      for(let z=0;z<nz;z++)for(let x=0;x<nx;x++){
        const ids=[z*(nx+1)+x,z*(nx+1)+x+1,(z+1)*(nx+1)+x+1,(z+1)*(nx+1)+x];
        const corners=ids.map(i=>grid[i]);
        if(corners.some(p=>!p)||corners.some(p=>p.mesh!==corners[0].mesh||p.normal.dot(corners[0].normal)<.94)
          ||Math.max(...corners.map(p=>p.point.y))-Math.min(...corners.map(p=>p.point.y))>.45){stats.rejectedCells++;continue;}
        for(const id of [0,2,1,0,3,2]){
          const p=corners[id],local=p.point.clone().addScaledVector(p.normal,.004).applyMatrix4(inverse);
          const localNormal=p.normal.clone().applyMatrix3(localNormalMatrix).normalize();
          positions.push(local.x,local.y,local.z);normals.push(localNormal.x,localNormal.y,localNormal.z);
          const vertex=ids[id];uv.push((vertex%(nx+1))/nx,Math.floor(vertex/(nx+1))/nz);
        }
      }
      if(positions.length>start){stats.patches++;ends.push(positions.length/3);}
      if(stats.triangles+positions.length/9>=WAREHOUSE_DETAIL_LIMITS.triangles)break;
    }
    if(!positions.length)continue;
    const geometry=new THREE.BufferGeometry();
    geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
    geometry.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));
    geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geometry.computeBoundingSphere();
    const material=new THREE.MeshStandardMaterial({name:`Grand Warehouse / projected ${style?'floor maintenance':'wheel rub'}`,
      map:makeWearTexture(style),color:finish.color,opacity:finish.opacity,transparent:true,roughness:.95,metalness:0,
      side:THREE.DoubleSide,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1});
    const mesh=new THREE.Mesh(geometry,material);mesh.name=material.name;mesh.renderOrder=1;
    mesh.userData.streetSkateRole='decoration';mesh.userData.castShadow=false;mesh.castShadow=false;mesh.receiveShadow=true;
    root.add(mesh);batches.push({mesh,ends});stats.triangles+=positions.length/9;stats.drawCalls++;
  }
  // Four actual roof fixtures provide warm pools. No new solid geometry or
  // expensive point-light shadow cubes are introduced into the skating lanes.
  const selected=[];
  for(const target of [[-57,-21],[-19,21],[19,-21],[57,21]]){
    const candidate=[...practicalAnchors].sort((a,b)=>Math.hypot(a[0]-target[0],a[2]-target[1])-Math.hypot(b[0]-target[0],b[2]-target[1]))[0];
    if(!candidate||selected.some(p=>Math.hypot(p[0]-candidate[0],p[2]-candidate[2])<1))continue;
    selected.push(candidate);
    const light=new THREE.SpotLight('#ffcb91',420,42,.8,.65,2);
    light.name='Grand Warehouse / warm roof practical';light.position.set(candidate[0],candidate[1]-.12,candidate[2]);
    light.target.position.set(candidate[0],0,candidate[2]);light.castShadow=false;
    light.userData.warehousePractical=true;root.add(light,light.target);lights.push(light);
  }
  stats.lights=lights.length;root.userData.surfaceDetail=stats;
  world.park.add(root);
  function setQuality(settings={}){
    const scale=THREE.MathUtils.clamp(Number(settings.surfaceDetailScale??1)||0,0,1);
    root.visible=scale>0;
    for(const {mesh,ends}of batches){const count=scale>0?Math.max(1,Math.ceil(ends.length*scale)):0;
      mesh.geometry.setDrawRange(0,count?ends[count-1]:0);mesh.visible=count>0;}
    const lightBudget=settings.name==='performance'?0:['high-refresh','balanced'].includes(settings.name)?2:4;
    for(const [i,light]of lights.entries())light.visible=i<lightBudget;
  }
  setQuality();return {root,setQuality,stats};
}
