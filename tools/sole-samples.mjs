import * as THREE from 'three';

// Geometry-only QA: sample actual skinned shoe vertices, not ankle bone pivots.
export function collectSoleSamples(rider){
 const footBones=new Set();for(const side of ['l','r'])rider.bones['foot_'+side]?.traverse(bone=>footBones.add(bone));
 const samples=[];rider.root.traverse(mesh=>{
  if(!mesh.isMesh)return;
  if(mesh.isSkinnedMesh){
   const {position,skinIndex,skinWeight}=mesh.geometry.attributes;if(!skinIndex||!skinWeight)return;
   const indices=[];for(let i=0;i<position.count;i++){
    let weight=0;for(let k=0;k<4;k++)if(footBones.has(mesh.skeleton.bones[skinIndex.getComponent(i,k)]))weight+=skinWeight.getComponent(i,k);
    if(weight>.6)indices.push(i);
   }
   if(indices.length)samples.push({mesh,indices});
  }else{
   let part=mesh;while(part&&!footBones.has(part))part=part.parent;
   if(part)samples.push({mesh,indices:Array.from({length:mesh.geometry.attributes.position.count},(_,i)=>i)});
  }
 });return samples;
}
export function minimumSoleHeight(samples,normal=new THREE.Vector3(0,1,0),origin=new THREE.Vector3()){
 let minimum=Infinity;const point=new THREE.Vector3();
 for(const {mesh,indices}of samples)for(const index of indices){mesh.getVertexPosition(index,point).applyMatrix4(mesh.matrixWorld).sub(origin);minimum=Math.min(minimum,point.dot(normal));}
 return minimum;
}
