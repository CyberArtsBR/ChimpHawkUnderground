/** Prepare selected world/actor programs behind the loadout, before the clock
 * starts. Unsupported/lost contexts retain the normal renderer fallback. */
export async function warmScenePrograms(renderer,scene,camera,{renderFirstFrame,isCurrent=()=>true}={}) {
  if(!renderer?.compileAsync||renderer.getContext?.().isContextLost?.())return false;
  try{
    await renderer.compileAsync(scene,camera);
    if(!isCurrent()||renderer.getContext?.().isContextLost?.())return false;
    // compileAsync prepares scene materials, but the real composers also use
    // offscreen output, bloom occluders and fullscreen shaders. Their first
    // actual draw must finish behind loadout, before the playable clock starts.
    renderFirstFrame?.();
    return true;
  }
  catch{return false;}
}

/** Draw the real recovery variants behind loadout. Hidden particle/liquid
 * pools and translucent respawn materials otherwise compile on the first bail.
 * This transaction never emits an effect or advances animation/physics. */
export function renderGameplayWarmup({skater,effects,render}) {
  const nodes = [];
  effects?.root?.traverse(node => {
    nodes.push({node,visible:node.visible,frustumCulled:node.frustumCulled});
  });
  const materials = (skater?.flashMaterials || []).map(saved => ({saved,
    transparent:saved.material.transparent,opacity:saved.material.opacity,depthWrite:saved.material.depthWrite}));
  try {
    for (const {node} of nodes) { node.visible=true;node.frustumCulled=false; }
    for (const flashing of [false,true]) {
      for (const {saved} of materials) {
        const material=saved.material,transparent=flashing||saved.transparent;
        if(material.transparent!==transparent){material.transparent=transparent;material.needsUpdate=true;}
        material.opacity=flashing ? .22 : saved.opacity;
        material.depthWrite=flashing?false:saved.depthWrite;
      }
      render();
    }
  } finally {
    for (const {node,visible,frustumCulled} of nodes) {node.visible=visible;node.frustumCulled=frustumCulled;}
    for (const {saved,transparent,opacity,depthWrite} of materials) {
      const material=saved.material;
      if(material.transparent!==transparent){material.transparent=transparent;material.needsUpdate=true;}
      material.opacity=opacity;material.depthWrite=depthWrite;
    }
  }
  // Leave the actual final composed image in its original presentation state.
  render();
}
