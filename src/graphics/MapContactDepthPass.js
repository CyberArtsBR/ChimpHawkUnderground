import { Color,DoubleSide } from 'three';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';

export function contactDepthResolution(width,height,scale=.6) {
  const w=Math.max(1,Number(width)||1),h=Math.max(1,Number(height)||1);
  const ratio=Math.min(scale,1280/Math.max(w,h));
  return [Math.max(1,Math.round(w*ratio)),Math.max(1,Math.round(h*ratio))];
}

/** Objects the contact-shading G-buffer leaves out (skies, decals, alpha effects). */
export function contactDepthExcludes(object) {
  if(object.userData?.skateEffects)return true;
  if(!object.isMesh)return false;
  const list=Array.isArray(object.material)?object.material:[object.material];
  return object.userData?.streetSkateRole==='sky'||list.some(m=>m&&
    (!m.depthWrite||(m.transparent&&m.opacity<1)||m.isMeshBasicMaterial));
}

/** Local contact shading, without temporal accumulation or reflection history.
 * The capped G-buffer deliberately excludes skies, decals and alpha effects.
 */
export class MapContactDepthPass extends GTAOPass {
  constructor(scene,camera) {
    super(scene,camera,1,1,undefined,
      {radius:.55,thickness:.18,distanceFallOff:1,samples:12},
      {radius:3,samples:12,rings:2});
    this.output=GTAOPass.OUTPUT.Default;
    this.blendIntensity=.3;
    this.normalMaterial.side=DoubleSide;
    this.resolutionScale=.6;
    this.savedClearColor=new Color();
    this.excluded=[];
    this.exclusions=[];
    this.exclusionsAge=120;
    this.dynamicRoots=[];
  }

  setDynamicRoots(roots=[]) {
    const next=roots.filter(Boolean);
    if(next.length===this.dynamicRoots.length&&next.every((root,i)=>root===this.dynamicRoots[i]))return;
    this.dynamicRoots=next;this.exclusions.length=0;this.exclusionsAge=120;
  }

  excludes(object) { return contactDepthExcludes(object); }

  setSize(width,height) {
    const [w,h]=contactDepthResolution(width,height,this.resolutionScale??.6);
    super.setSize(w,h);
  }

  refreshExclusions() {
    this.exclusions.length=0;
    const visit=object=>{
      if(this.dynamicRoots.includes(object))return;
      if(this.excludes(object))this.exclusions.push(object);
      for(const child of object.children)visit(child);
    };
    visit(this.scene);
    this.exclusionsAge=0;
    this.sceneChildren=this.scene.children.length;
  }

  _overrideVisibility() {
    super._overrideVisibility();
    if(this.exclusionsAge++>=120||this.sceneChildren!==this.scene.children.length)this.refreshExclusions();
    for(const object of this.exclusions)if(object.visible){object.visible=false;this.excluded.push(object);}
    for(const root of this.dynamicRoots)root.traverse(object=>{
      if(object.visible&&this.excludes(object)){object.visible=false;this.excluded.push(object);}
    });    // Static park meshes render as a few merged cells with the same normals.
    this.proxyActive=Boolean(this.passProxy?.begin('normal'));
  }

  _restoreVisibility() {
    if(this.proxyActive){this.passProxy.end();this.proxyActive=false;}
    super._restoreVisibility();
    for(const object of this.excluded)object.visible=true;
    this.excluded.length=0;
  }

  render(renderer,writeBuffer,readBuffer) {
    const override=this.scene.overrideMaterial,background=this.scene.background,fog=this.scene.fog;
    const autoClear=renderer.autoClear,clearAlpha=renderer.getClearAlpha();
    const shadowAutoUpdate=renderer.shadowMap.autoUpdate,target=renderer.getRenderTarget();
    renderer.getClearColor(this.savedClearColor);
    try {
      renderer.shadowMap.autoUpdate=false;
      this.scene.background=null;this.scene.fog=null;
      super.render(renderer,writeBuffer,readBuffer);
    } finally {
      // GTAOPass's internal override renderer does not restore on exceptions.
      this._restoreVisibility();
      this.scene.overrideMaterial=override;this.scene.background=background;this.scene.fog=fog;
      renderer.autoClear=autoClear;
      renderer.setClearColor(this.savedClearColor,clearAlpha);
      renderer.shadowMap.autoUpdate=shadowAutoUpdate;
      renderer.setRenderTarget(target);
    }
  }

  dispose() {
    // This three.js release omits these two materials in GTAOPass.dispose().
    this.gtaoMaterial.dispose();this.blendMaterial.dispose();
    super.dispose();
    this.exclusions.length=0;
    this.dynamicRoots.length=0;
  }
}
