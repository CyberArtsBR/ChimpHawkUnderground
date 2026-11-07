/** Prepare selected world/actor programs behind the loadout, before the clock
 * starts. Unsupported/lost contexts retain the normal renderer fallback. */
export async function warmScenePrograms(renderer,scene,camera,{renderFirstFrame,isCurrent=()=>true,target=null,reveal=[]}={}) {
  if(!renderer?.compileAsync||renderer.getContext?.().isContextLost?.())return false;
  // Hidden pools (dust, sparks, trails) are skipped by compile(); show them for it.
  const hidden=[];
  for(const root of reveal)root?.traverse?.(node=>{if(!node.visible){hidden.push(node);node.visible=true;}});
  try{
    // three picks tone mapping / output colour space from the CURRENT render
    // target. The game draws into the composer's off-screen buffer, so compile
    // against that buffer; compiling for the canvas built the wrong variants and
    // the first real frame then linked ~30 programs synchronously (page froze).
    const previous=renderer.getRenderTarget?.()??null;
    let pending;
    try{renderer.setRenderTarget?.(target);pending=renderer.compileAsync(scene,camera);}
    finally{renderer.setRenderTarget?.(previous);for(const node of hidden)node.visible=false;}
    await pending;
    if(!isCurrent()||renderer.getContext?.().isContextLost?.())return false;
    // compileAsync prepares scene materials, but the real composers also use
    // offscreen output, bloom occluders and fullscreen shaders. Their first
    // actual draw must finish behind loadout, before the playable clock starts.
    renderFirstFrame?.();
    return true;
  }
  catch{return false;}
}

/**
 * Compile the rider's respawn-blink variant (see-through materials) without
 * blocking: a transparent material is a different shader program, and the
 * synchronous warm-up draw below otherwise links it on the main thread.
 */
export async function warmFlashPrograms(renderer,camera,scene,{skater,target=null,alsoCompile=null,reveal=[]}={}) {
  const saved=skater?.flashMaterials||[];
  if(!renderer?.compileAsync||!saved.length||!skater?.root)return false;
  const changed=[],hidden=[];
  const previous=renderer.getRenderTarget?.()??null;
  let pending;
  try{
    // The rider can be hidden behind the menus; compile() skips hidden objects.
    let node=skater.root;while(node){if(!node.visible){hidden.push(node);node.visible=true;}node=node.parent;}
    // Hidden effect pools still matter: their grind light changes the light count.
    for(const root of [skater.root,...reveal])root?.traverse?.(child=>{if(!child.visible){hidden.push(child);child.visible=true;}});
    for(const {material} of saved)if(!material.transparent){material.transparent=true;material.needsUpdate=true;changed.push(material);}
    renderer.setRenderTarget?.(target);
    pending=[renderer.compileAsync(skater.root,camera,scene)];
    renderer.setRenderTarget?.(previous);
    // e.g. the glow pass, which draws the blinking rider too.
    if(alsoCompile)pending.push(alsoCompile());
  }finally{
    renderer.setRenderTarget?.(previous);
    for(const material of changed){material.transparent=false;material.needsUpdate=true;}
    for(const node of hidden)node.visible=false;
  }
  await Promise.allSettled(pending);return true;
}

/** Draw the real recovery variants behind loadout. Hidden particle/liquid
 * pools and translucent respawn materials otherwise compile on the first bail.
 * This transaction never emits an effect or advances animation/physics. */
export function renderGameplayWarmup({skater,effects,render,extraRoots=[]}) {
  const nodes = [];
  // extraRoots: other hidden pools (e.g. pigeons) drawn into reflections too.
  for (const root of [effects?.root,...extraRoots]) root?.traverse(node => {
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
