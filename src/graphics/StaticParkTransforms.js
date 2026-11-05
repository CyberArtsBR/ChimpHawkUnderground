/** Freeze local matrices of shipped static scenery, retaining world propagation
 * and visibility updates. Actors, lights and explicitly animated branches remain live. */
export function freezeStaticParkTransforms(root) {
  root.updateMatrixWorld(true);
  let frozen=0;
  const visit=node=>{
    if(node.isBone||node.isSkinnedMesh||node.userData?.dynamicTransform)return;
    if(!node.isLight&&node.matrixAutoUpdate){node.updateMatrix();node.matrixAutoUpdate=false;frozen++;}
    for(const child of node.children)visit(child);
  };
  visit(root);return frozen;
}
