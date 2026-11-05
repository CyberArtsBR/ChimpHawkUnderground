import * as THREE from 'three';

/** Cache shoe bounds in each ankle's frame once, using the supplied GLB skin. */
export function calibrateFootSupportBounds(rider) {
  rider.root.updateMatrixWorld(true);
  const feet = ['l','r'].map(side=>{
    const bone=rider.bones['foot_'+side],descendants=new Set();bone?.traverse(part=>descendants.add(part));
    return {side,bone,descendants,inverse:bone?bone.matrixWorld.clone().invert():null,box:new THREE.Box3()};
  });
  const point=new THREE.Vector3();
  rider.root.traverse(mesh=>{
    if(!mesh.isMesh||!mesh.geometry?.attributes.position)return;
    const {position,skinIndex,skinWeight}=mesh.geometry.attributes;
    for(const foot of feet){
      if(!foot.bone)continue;
      let rigid=mesh;while(rigid&&!foot.descendants.has(rigid))rigid=rigid.parent;
      if(!mesh.isSkinnedMesh&&!rigid)continue;
      for(let i=0;i<position.count;i++){
        if(mesh.isSkinnedMesh){
          if(!skinIndex||!skinWeight)continue;
          let weight=0;for(let k=0;k<4;k++)if(foot.descendants.has(mesh.skeleton.bones[skinIndex.getComponent(i,k)]))weight+=skinWeight.getComponent(i,k);
          if(weight<=.6)continue;
        }
        mesh.getVertexPosition(i,point).applyMatrix4(mesh.matrixWorld).applyMatrix4(foot.inverse);
        foot.box.expandByPoint(point);
      }
    }
  });
  rider.footSupportBounds=feet.filter(foot=>!foot.box.isEmpty()).map(({bone,box})=>({bone,corners:Array.from({length:8},(_,i)=>new THREE.Vector3(i&1?box.max.x:box.min.x,i&2?box.max.y:box.min.y,i&4?box.max.z:box.min.z))}));
  return rider.footSupportBounds;
}

/** Keep the inversion's shoe sweep above the same plane supporting the deck.
 * This translates only the rider model, before hand IK restores deck contact.
 * The full approved Handstand and upright poses need no correction.
 */
export function clearFeetAboveSupport(rider,board,margin=.008) {
  const frame=board?.root?.parent||rider.root.parent;
  const normal=board?.supportPlane?.normal||new THREE.Vector3(0,1,0);
  const offset=Number(board?.supportPlane?.offset)||0;
  if(!Number.isFinite(normal.y)||normal.y<.05)return 0;
  rider.root.updateWorldMatrix(true,true);
  const inverse=frame?.matrixWorld?.clone().invert()||new THREE.Matrix4();
  const point=new THREE.Vector3();let minimum=Infinity;
  for(const foot of rider.footSupportBounds||[])for(const corner of foot.corners){
    point.copy(corner).applyMatrix4(foot.bone.matrixWorld).applyMatrix4(inverse);
    minimum=Math.min(minimum,normal.dot(point)+offset);
  }
  if(!Number.isFinite(minimum)||minimum>=margin)return 0;
  const lift=(margin-minimum)/normal.y;
  // Convert visual-parent up into rider-root space, preserving sloped parents.
  const origin=frame?frame.localToWorld(new THREE.Vector3()):new THREE.Vector3();
  const raised=frame?frame.localToWorld(new THREE.Vector3(0,lift,0)):new THREE.Vector3(0,lift,0);
  rider.model.position.add(rider.root.worldToLocal(raised).sub(rider.root.worldToLocal(origin)));
  rider.root.updateWorldMatrix(true,true);
  return lift;
}
