import * as THREE from 'three';
import { WheelContactShadows } from './WheelContactShadows.js';
import { createBloomOccluderMaterial } from './BloomOccluderMaterial.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { SSRPass } from 'three/addons/postprocessing/SSRPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { BokehPass } from 'three/addons/postprocessing/BokehPass.js';
import { AfterimagePass } from 'three/addons/postprocessing/AfterimagePass.js';
import { resolveGraphicsSettings, resolveRenderPixelRatio, validateRenderAllocation } from './GraphicsSettings.js';
import { normalizeGlowOverrides, resolveGlowTuning } from './GlowTuning.js';
import { MapContactDepthPass, contactDepthExcludes } from './MapContactDepthPass.js';
import { StaticPassProxy } from './StaticPassProxy.js';
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { CopyShader } from 'three/addons/shaders/CopyShader.js';

// Five-tap contrast-adaptive sharpening: edge-adaptive, avoids amplifying
// flat-area noise, and is deliberately cheaper than a full extra AA algorithm.
/**
 * Colour grade (2026-11), applied last in display space: contrast and
 * saturation, a cool lift in the shadows and a warm push in the highlights
 * (tinted per map), and a soft vignette. Values come from MapLook `grade`.
 */
export const DEFAULT_GRADE = Object.freeze({
  contrast: 1.06, saturation: 1.06, shadowTint: [-.05, 0, .1], highlightTint: [.08, .04, -.04], vignette: .28,
});
const GRADE_SHADER = {
  uniforms: {
    tDiffuse: { value: null },
    contrast: { value: DEFAULT_GRADE.contrast },
    saturation: { value: DEFAULT_GRADE.saturation },
    shadowTint: { value: new THREE.Vector3(...DEFAULT_GRADE.shadowTint) },
    highlightTint: { value: new THREE.Vector3(...DEFAULT_GRADE.highlightTint) },
    vignette: { value: DEFAULT_GRADE.vignette },
  },
  vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float contrast, saturation, vignette; uniform vec3 shadowTint, highlightTint;
    varying vec2 vUv;
    void main(){
      vec4 src = texture2D(tDiffuse, vUv);
      vec3 c = src.rgb;
      float l = dot(c, vec3(.2126, .7152, .0722));
      c = mix(vec3(l), c, saturation);
      c = (c - .5) * contrast + .5;
      float shadows = 1. - smoothstep(0., .55, l), highs = smoothstep(.45, 1., l);
      c += shadowTint * shadows * .35 + highlightTint * highs * .35;
      vec2 d = vUv - .5; d.x *= 1.15;
      c *= 1. - vignette * smoothstep(.18, .75, dot(d, d) * 2.2);
      gl_FragColor = vec4(clamp(c, 0., 1.), src.a);
    }`,
};

const CAS_SHADER = {
  uniforms: {
    tDiffuse: { value: null },
    pixelStep: { value: new THREE.Vector2(1,1) },
    strength: { value: .23 },
  },
  vertexShader: `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform vec2 pixelStep;
    uniform float strength;
    varying vec2 vUv;
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      vec3 n = texture2D(tDiffuse, vUv + vec2(0.0, pixelStep.y)).rgb;
      vec3 s = texture2D(tDiffuse, vUv - vec2(0.0, pixelStep.y)).rgb;
      vec3 e = texture2D(tDiffuse, vUv + vec2(pixelStep.x, 0.0)).rgb;
      vec3 w = texture2D(tDiffuse, vUv - vec2(pixelStep.x, 0.0)).rgb;
      vec3 lowest = min(c.rgb, min(min(n, s), min(e, w)));
      vec3 highest = max(c.rgb, max(max(n, s), max(e, w)));
      float localContrast = clamp(dot(highest - lowest, vec3(.2126,.7152,.0722)) * 1.8, 0.0, 1.0);
      float adaptive = strength * (1.0 - localContrast * .65);
      vec3 sharp = c.rgb * (1.0 + adaptive * 4.0) - (n + s + e + w) * adaptive;
      gl_FragColor = vec4(max(sharp, vec3(0.0)), c.a);
    }
  `,
};


// Add the selective glow buffer over the normally lit environment.
// The environment never contributes to this texture.
const SELECTIVE_BLOOM_COMPOSITE = {
  uniforms: {
    tDiffuse: { value: null },
    bloomTexture: { value: null },
    bloomMix: { value: .38 },
  },
  vertexShader: `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform sampler2D bloomTexture;
    uniform float bloomMix;
    varying vec2 vUv;
    void main() {
      vec4 base = texture2D(tDiffuse, vUv);
      vec3 actorGlow = texture2D(bloomTexture, vUv).rgb;
      gl_FragColor = vec4(base.rgb + actorGlow * bloomMix, base.a);
    }
  `,
};

/** Map LEDs and grind lights keep their own material in the glow mask. */
export function isEnvironmentGlowMesh(object) {
  if (!object?.isMesh) return false;
  const materials = Array.isArray(object.material) ? object.material : [object.material];
  return materials.some(material => /^(LED|Grind) \/ /.test(material?.name || '') && material.emissive?.getHex?.() > 0);
}

/**
 * Fog that keeps its shader variant but adds nothing: the glow mask must not be
 * fogged, and switching scene.fog off made three.js re-pick every material's
 * shader twice per frame.
 */
export function neutralizeFog(fog) {
  if (!fog?.isFog && !fog?.isFogExp2) return null;
  const saved = fog.isFogExp2 ? { density: fog.density } : { near: fog.near, far: fog.far };
  if (fog.isFogExp2) fog.density = 0;
  else { fog.near = 1e9; fog.far = 2e9; }
  return () => Object.assign(fog, saved);
}

/**
 * Main scene pass with its own anti-aliased target (2026-11 performance pass).
 * Only the 3D scene needs MSAA; the full-screen effects after it run on plain
 * targets instead of resolving four samples per pixel each time.
 */
export class MsaaRenderPass extends Pass {
  constructor(scene, camera) {
    super();
    this.inner = new RenderPass(scene, camera);
    this.needsSwap = false;
    this.samples = 0;
    this.target = null;
    this.width = 1; this.height = 1;
    this.copyMaterial = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.clone(CopyShader.uniforms),
      vertexShader: CopyShader.vertexShader, fragmentShader: CopyShader.fragmentShader,
      blending: THREE.NoBlending, depthTest: false, depthWrite: false,
    });
    this.quad = new FullScreenQuad(this.copyMaterial);
  }
  get scene() { return this.inner.scene; }
  get camera() { return this.inner.camera; }
  setSamples(samples) {
    samples = Math.max(0, samples | 0);
    if (samples === this.samples) return;
    this.samples = samples;
    this.target?.dispose();
    this.target = samples > 0 ? new THREE.WebGLRenderTarget(this.width, this.height, {
      type: THREE.HalfFloatType, depthBuffer: true, stencilBuffer: false, samples,
    }) : null;
  }
  setSize(width, height) {
    this.width = width; this.height = height;
    this.target?.setSize(width, height);
  }
  render(renderer, writeBuffer, readBuffer, deltaTime, maskActive) {
    if (!this.target) {
      this.inner.renderToScreen = this.renderToScreen;
      this.inner.render(renderer, writeBuffer, readBuffer, deltaTime, maskActive);
      return;
    }
    this.inner.renderToScreen = false;
    this.inner.render(renderer, writeBuffer, this.target, deltaTime, maskActive);
    this.copyMaterial.uniforms.tDiffuse.value = this.target.texture;
    renderer.setRenderTarget(this.renderToScreen ? null : readBuffer);
    this.quad.render(renderer);
  }
  dispose() { this.target?.dispose(); this.copyMaterial.dispose(); this.quad.dispose(); }
}

export class GraphicsPipeline {
  constructor(renderer, scene, camera) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
    this.width = Math.max(1, window.innerWidth);
    this.height = Math.max(1, window.innerHeight);
    this.reflectionBase = new WeakMap();
    this.emissiveBase = new WeakMap();
    this.faulted = false;

    // Render target provides HDR headroom to the bloom pass; two-sample MSAA
    // is enabled when supported to preserve edge AA lost through a composer.
    const target = new THREE.WebGLRenderTarget(1, 1, {
      type: THREE.HalfFloatType,
      depthBuffer: true,
      stencilBuffer: false,
    });
    this.composer = new EffectComposer(renderer, target);
    this.scenePass = new MsaaRenderPass(scene, camera);
    this.composer.addPass(this.scenePass);
    this.ssr = null; // Heavy pass is allocated only on an SSR-enabled preset.
    this.contactDepth = null;

    // A separate HDR composer isolates actor glow and ORBIT's emissive fixtures.
    // Other geometry stays black in this pass while preserving occlusion.
    const bloomTarget = new THREE.WebGLRenderTarget(1, 1, {
      type: THREE.HalfFloatType, depthBuffer: true, stencilBuffer: false,
    });
    this.bloomComposer = new EffectComposer(renderer, bloomTarget);
    this.bloomComposer.renderToScreen = false;
    this.bloomComposer.addPass(new RenderPass(scene, camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(1,1), .25, .24, .88);
    this.bloomComposer.addPass(this.bloom);
    this.blackoutMaterial = createBloomOccluderMaterial();
    this.glowRoot = null;
    this.effectsRoot = null;
    this.bloomSceneMeshes = null;
    this.bloomEnvironmentEmissives = [];
    this.bloomSceneChildCount = -1;
    this.bloomGlowMeshCount = -1;
    this.bloomGlowChildren = null;
    this.bloomCacheAge = 0;
    this.shadowAnchor = null;
    this.shadowWorldPosition = new THREE.Vector3();
    this.wheelContactShadows = new WheelContactShadows();
    scene.add(this.wheelContactShadows.mesh);
    // Merged park copies for the glow mask, shadows and contact shading.
    this.passProxy = new StaticPassProxy(scene);
    this.passProxyDirty = true;
    this.wrapShadowMap();

    this.bloomComposite = new ShaderPass(SELECTIVE_BLOOM_COMPOSITE);
    this.bloomComposite.enabled = false;
    this.composer.addPass(this.bloomComposite);
    this.cas = new ShaderPass(CAS_SHADER);
    this.composer.addPass(this.cas);
    this.composer.addPass(new OutputPass());
    this.grade = new ShaderPass(GRADE_SHADER);
    this.composer.addPass(this.grade);
    this.world = null;
    this.settings = null;
  }

  /**
   * The shadow map draws the merged park copy instead of every park mesh.
   * Only a real shadow update is swapped; skipped updates cost nothing.
   */
  wrapShadowMap() {
    const shadowMap = this.renderer?.shadowMap;
    if (!shadowMap?.render || shadowMap.render.passProxyWrapped) return;
    const original = shadowMap.render;
    const pipeline = this;
    const render = function (lights, scene, camera) {
      const proxy = pipeline.passProxy;
      const swap = Boolean(proxy && !proxy.active && scene === pipeline.scene && this.enabled &&
        (this.autoUpdate || this.needsUpdate) && lights?.length && proxy.begin('shadow'));
      try { return original.call(this, lights, scene, camera); }
      finally { if (swap) proxy.end(); }
    };
    render.passProxyWrapped = true;
    shadowMap.render = render;
  }

  rebuildPassProxy() {
    this.passProxyDirty = false;
    if (!this.passProxy) return;
    this.passProxy.build(this.world, {
      occluderMaterial: this.blackoutMaterial,
      glowMesh: object => Boolean(this.world?.userData?.environmentBloom) && isEnvironmentGlowMesh(object),
      normalExcluded: contactDepthExcludes,
      clipping: Boolean(this.renderer?.localClippingEnabled),
    });
  }

  /**
   * Cinematic look for the highlights replay only: depth of field focused on
   * the rider and a light afterimage for motion blur. Created on first use and
   * switched off during gameplay, so normal frames never pay for it.
   */
  setCinematic(active, focusDistance = 8) {
    if (!active && !this.cinematic) return;
    if (active && !this.cinematic) {
      const bokeh = new BokehPass(this.scene, this.camera, { focus: focusDistance, aperture: .00045, maxblur: .007 });
      const afterimage = new AfterimagePass(.72);
      const at = this.composer.passes.indexOf(this.cas);
      this.composer.insertPass(afterimage, at);
      this.composer.insertPass(bokeh, at + 1);
      this.cinematic = { bokeh, afterimage };
      this.resize(this.width, this.height);
    }
    const { bokeh, afterimage } = this.cinematic;
    bokeh.enabled = afterimage.enabled = Boolean(active);
    if (active) bokeh.uniforms.focus.value = Math.max(1, focusDistance);
  }

  /** Per-map colour grade (falls back to a gentle default). */
  setGrade(grade = null) {
    const g = { ...DEFAULT_GRADE, ...(grade || {}) }, u = this.grade.uniforms;
    u.contrast.value = g.contrast; u.saturation.value = g.saturation; u.vignette.value = g.vignette;
    u.shadowTint.value.set(...g.shadowTint); u.highlightTint.value.set(...g.highlightTint);
  }

  createSSR() {
    if (this.ssr) return;
    this.ssr = new SSRPass({
      renderer:this.renderer, scene:this.scene, camera:this.camera,
      width:this.width, height:this.height, selects:[],
    });
    this.ssr.thickness = .018;
    this.ssr.opacity = .38;
    this.ssr.distanceAttenuation = true;
    this.ssr.fresnel = true;
    this.ssr.blur = true;
    this.ssr.resolutionScale = .5;
    this.composer.insertPass(this.ssr, 1);
    this.refreshSSRTargets();
  }

  refreshSSRTargets() {
    if (!this.ssr) return;
    const candidates = [];
    this.world?.traverse(object => {
      if (!object.isMesh || !object.visible) return;
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      const reflective = materials.find(m => m && m.metalness >= .45 &&
        m.roughness <= .48 && m.transparent !== true && (m.emissiveIntensity || 0) < 1);
      if (!reflective) return;
      // Prefer large reflective floors/ramps over small repeated metal details.
      // Selection is rebuilt at world/preset changes, never each rendered frame.
      const radius = object.geometry?.boundingSphere?.radius || 1;
      const scale = object.getWorldScale?.(new THREE.Vector3()) || new THREE.Vector3(1, 1, 1);
      const projectedSize = radius * Math.max(scale.x, scale.y, scale.z);
      candidates.push({ object, score: projectedSize * (1.2 - reflective.roughness) });
    });
    candidates.sort((a, b) => b.score - a.score);
    this.ssr.selects = candidates.slice(0, this.settings?.ssrTargetLimit || 40).map(entry => entry.object);
  }

  setWorld(world) {
    this.world = world;
    this.passProxyDirty = true;
    this.bloomSceneMeshes = null;
    this.shadowAnchor = null;
    this.configureContactDepth();
    this.configureBloom();
    this.refreshSSRTargets();
    this.updateMaterials();
  }

  // StreetSkater.visual always contains ONLY the active rider and board.
  // Keeping the root rather than a static mesh list automatically handles
  // runtime rider GLB swaps and changes to the skateboard finish.
  setGlowTarget(root) {
    this.glowRoot = root;
    this.contactDepth?.setDynamicRoots([root,this.effectsRoot]);
    this.bloomSceneMeshes = null;
    this.bloomGlowChildren = null;
  }

  setEffectsTarget(root) {
    this.effectsRoot = root;
    this.contactDepth?.setDynamicRoots([this.glowRoot,root]);
  }

  configureContactDepth() {
    const enabled=this.world?.userData?.contactDepth===true&&this.settings?.contactDepth===true;
    if(!enabled&&this.contactDepth) {
      this.composer.removePass(this.contactDepth);this.contactDepth.dispose();this.contactDepth=null;
    } else if(enabled&&!this.contactDepth) {
      this.contactDepth=new MapContactDepthPass(this.scene,this.camera);
      this.contactDepth.passProxy=this.passProxy;
      this.composer.insertPass(this.contactDepth,1);
    }
    if(this.contactDepth) {
      this.contactDepth.setDynamicRoots([this.glowRoot,this.effectsRoot]);
      this.contactDepth.resolutionScale=this.settings.name==='cinematic'?.65:.5;
      this.contactDepth.setSize(this.width*this.settings.pixelRatio,this.height*this.settings.pixelRatio);
      this.contactDepth.exclusionsAge=120;
    }
  }

  /**
   * Compile the glow-mask variants ahead of time: the selective bloom pass draws
   * the rider and LED meshes with fog off into the bloom buffer, which needs its
   * own shader variants. Without this they link synchronously on the first frame.
   */
  compileBloomVariants() {
    if (!this.glowRoot?.parent || !this.renderer?.compileAsync || !this.bloomComposer) return Promise.resolve();
    this.refreshBloomSceneCache();
    const roots = [this.glowRoot, ...this.bloomEnvironmentEmissives];
    const previous = this.renderer.getRenderTarget();
    // Mirror renderSelectiveBloom exactly: fog neutralized (same variant) and
    // the effects (with the grind spark light), reflections and contact patch
    // hidden. Light count is part of the shader variant.
    const hidden = [this.effectsRoot, this.reflectionRoot, this.wheelContactShadows?.mesh].filter(o => o?.visible);
    const pending = [];
    const restoreFog = neutralizeFog(this.scene.fog);
    try {
      for (const object of hidden) object.visible = false;
      this.renderer.setRenderTarget(this.bloomComposer.readBuffer);
      // compile() runs synchronously here; only completion is awaited later.
      for (const root of roots) pending.push(this.renderer.compileAsync(root, this.camera, this.scene));
    } finally {
      restoreFog?.();
      for (const object of hidden) object.visible = true;
      this.renderer.setRenderTarget(previous);
    }
    return Promise.allSettled(pending);
  }

  refreshBloomSceneCache() {
    const meshes = [];
    this.scene.traverse(object => { if (object.isMesh) meshes.push(object); });
    const environmentEmissives = [];
    if (this.world?.userData.environmentBloom) {
      this.world.traverse(object => { if (isEnvironmentGlowMesh(object)) environmentEmissives.push(object); });
    }
    this.bloomSceneMeshes = meshes;
    this.bloomEnvironmentEmissives = environmentEmissives;
    this.bloomSceneChildCount = this.scene.children?.length ?? 0;
    this.bloomGlowChildren = (this.glowRoot?.children || []).slice();
    this.bloomCacheAge = 0;
  }

  // Keep the existing directional light's direction intact while following
  // the active rider. This concentrates 1024² shadow texels near wheel contact
  // instead of spreading them across an entire 150-metre warehouse.
  updateContactShadows() {
    if (!this.settings || !this.glowRoot?.parent) return;
    const light = this.scene.children?.find(object => object.isDirectionalLight && object.castShadow && object.shadow);
    if (!light) return;
    const radius = this.settings.shadowCoverageRadius;
    const shadow = light.shadow, camera = shadow.camera;
    if (camera.left !== -radius || camera.right !== radius ||
        camera.top !== radius || camera.bottom !== -radius) {
      camera.left = camera.bottom = -radius;
      camera.right = camera.top = radius;
      camera.updateProjectionMatrix();
      shadow.needsUpdate = true;
    }
    // The former normal bias (0.07 m) separated board/wheel contact shadows.
    shadow.normalBias = this.settings.shadowNormalBias;
    if (!this.shadowAnchor || this.shadowAnchor.light !== light) {
      this.shadowAnchor = {
        light, position: light.position.clone(), target: light.target.position.clone(),
      };
    }
    this.glowRoot.getWorldPosition(this.shadowWorldPosition);
    const texel = (radius * 2) / (light.shadow.mapSize.x || 1024);
    const snap = value => Math.round(value / texel) * texel;
    const offsetX = snap(this.shadowWorldPosition.x - this.shadowAnchor.target.x);
    const offsetZ = snap(this.shadowWorldPosition.z - this.shadowAnchor.target.z);
    const anchor = this.shadowAnchor;
    if (Math.abs(light.target.position.x - anchor.target.x - offsetX) > 1e-6 ||
        Math.abs(light.target.position.z - anchor.target.z - offsetZ) > 1e-6) {
      light.position.set(anchor.position.x + offsetX, anchor.position.y, anchor.position.z + offsetZ);
      light.target.position.set(anchor.target.x + offsetX, anchor.target.y, anchor.target.z + offsetZ);
      light.target.updateMatrixWorld();
      shadow.needsUpdate = true;
    }
  }

  renderSelectiveBloom(warmupMaterials = null) {
    if (!this.glowRoot?.parent) return false;
    const allowed = new Set();
    this.glowRoot.traverse(object => {
      if (!object.isMesh) return;
      const materials=Array.isArray(object.material)?object.material:[object.material];
      // Light-colored costumes are reflective surfaces, not light sources.
      // Bloom the board's neon and authored emissive details; leave faces and
      // fabric out of the glow mask so ordinary highlights retain definition.
      if(materials.some(material=>warmupMaterials?.has(material)||
        (material?.emissive?.getHex?.()>0 && material.emissiveIntensity>0)))allowed.add(object);
    });
    const childCount = this.scene.children?.length ?? 0;
    // A rider swap replaces a child of the stable visual group, often with
    // exactly the same mesh/emissive counts. Compare its few direct children
    // so the new costume is masked on its first frame and disposed meshes are
    // dropped immediately. Static scenery still avoids a full scene walk.
    const glowChildren = this.glowRoot.children || [];
    const previousChildren = this.bloomGlowChildren;
    let actorChanged = !previousChildren || glowChildren.length !== previousChildren.length;
    if (!actorChanged) for (let i = 0; i < glowChildren.length; i++) {
      if (glowChildren[i] !== previousChildren[i]) { actorChanged = true; break; }
    }
    // Recheck occasionally for procedural objects, immediately for rider swaps
    // and top-level scene changes; ordinary frames avoid two full traversals.
    if (!this.bloomSceneMeshes || actorChanged || this.bloomCacheAge >= 120 ||
        this.bloomSceneChildCount !== childCount || this.bloomGlowMeshCount !== allowed.size) {
      this.refreshBloomSceneCache();
      this.bloomGlowMeshCount = allowed.size;
    }
    this.bloomCacheAge++;
    for (const object of this.bloomEnvironmentEmissives) allowed.add(object);
    if (!allowed.size) return false;
    // Reuse flat scratch storage: a park can contain thousands of meshes, so
    // allocating one [mesh, material] pair per mesh at 144 Hz creates needless GC.
    const replaced = this.bloomReplacements ??= [];
    const originalBackground = this.scene.background;
    let restoreFog = null, proxied = false;
    const originalOverride = this.scene.overrideMaterial;
    const shadowAutoUpdate = this.renderer.shadowMap.autoUpdate;
    const contactMesh = this.wheelContactShadows?.mesh;
    const contactVisible = contactMesh?.visible;
    const effectsVisible = this.effectsRoot?.visible;
    const reflectionsVisible = this.reflectionRoot?.visible;
    try {
      // Reuse the preceding shadow atlas; do not recalculate costly maps twice
      // per frame merely to produce a small actor-only glow mask.
      this.renderer.shadowMap.autoUpdate = false;
      this.scene.background = null;
      restoreFog = neutralizeFog(this.scene.fog);
      this.scene.overrideMaterial = null;
      // Contact patches darken receivers only. Their quad must not become an
      // opaque depth-writing square when the bloom mask blacks out the scene.
      if (contactMesh) contactMesh.visible = false;
      // Dust and spark Points are already shaded in the base pass. Keeping them
      // out of the glow pass prevents additive halos around ordinary wheel dust.
      if (this.effectsRoot) this.effectsRoot.visible = false;
      // Planar reflections re-render the scene; never inside the glow mask pass.
      if (this.reflectionRoot) this.reflectionRoot.visible = false;
      // Dark geometry still writes depth: rider bloom cannot appear through walls.
      // Static park meshes are drawn as a few merged black cells instead.
      proxied = Boolean(this.passProxy?.begin('occluder'));
      for (const object of this.bloomSceneMeshes) {
        if (object.visible === false || allowed.has(object)) continue;
        replaced.push(object, object.material);
        object.material = this.blackoutMaterial;
      }
      this.bloomComposer.render();
      // UnrealBloomPass adds its glow over the low-resolution source buffer.
      // Only composite its bloom texture: adding that source buffer a second
      // time creates a soft duplicate over bright details on moving objects.
      this.bloomComposite.uniforms.bloomTexture.value = this.bloom.renderTargetsHorizontal[0].texture;
      return true;
    } finally {
      for (let i = 0; i < replaced.length; i += 2) replaced[i].material = replaced[i + 1];
      replaced.length = 0;
      if (proxied) this.passProxy.end();
      this.scene.background = originalBackground;
      restoreFog?.();
      this.scene.overrideMaterial = originalOverride;
      this.renderer.shadowMap.autoUpdate = shadowAutoUpdate;
      if (contactMesh) contactMesh.visible = contactVisible;
      if (this.effectsRoot) this.effectsRoot.visible = effectsVisible;
      if (this.reflectionRoot) this.reflectionRoot.visible = reflectionsVisible;
    }
  }

  updateMaterials() {
    if (!this.world || !this.settings) return;
    const touched = new Set(), textures = new Set();
    const emissive = resolveGlowTuning(this.settings, Boolean(this.world?.userData?.environmentBloom)).emissive;
    this.world.traverse(object => {
      if (!object.isMesh) return;
      if (object.userData.visualPassCaster)
        object.castShadow = this.settings.name !== 'performance';
      for (const m of Array.isArray(object.material) ? object.material : [object.material]) {
        if (!m || touched.has(m)) continue;
        touched.add(m);
        const maps=['map','normalMap','bumpMap','roughnessMap','metalnessMap','aoMap','emissiveMap','alphaMap','warehouseGrainMap'].map(key=>m[key]);
        // World-projected detail layers own their textures through uniforms.
        // Apply the same quality cap as ordinary PBR maps when tiers change.
        for(const uniform of Object.values(m.uniforms||{}))if(uniform?.value?.isTexture)maps.push(uniform.value);
        for (const map of maps) {
          if (!map?.isTexture || textures.has(map)) continue;
          textures.add(map);
          if (map.anisotropy !== this.settings.anisotropy) {
            map.anisotropy = this.settings.anisotropy;
            map.needsUpdate = true;
          }
        }
        if (m.metalness >= .45 && 'envMapIntensity' in m) {
          if (!this.reflectionBase.has(m)) this.reflectionBase.set(m, m.envMapIntensity);
          m.envMapIntensity = this.reflectionBase.get(m) * this.settings.metalReflectionStrength;
        }
        if (m.emissive?.getHex?.() > 0 && 'emissiveIntensity' in m) {
          if (!this.emissiveBase.has(m)) this.emissiveBase.set(m, m.emissiveIntensity);
          m.emissiveIntensity = this.emissiveBase.get(m) * emissive;
        }
      }
    });
  }

  allocationCapabilities(capabilities=this.capabilities||{}) {
    const gl=this.renderer.getContext?.();
    const read=key=>{try{return gl?.getParameter?.(gl[key]);}catch{return undefined;}};
    return {...capabilities,maxTextureSize:read('MAX_TEXTURE_SIZE')||capabilities.maxTextureSize,
      maxRenderbufferSize:read('MAX_RENDERBUFFER_SIZE')||capabilities.maxRenderbufferSize};
  }

  setQuality(key, capabilities, overrides) {
    const caps=this.allocationCapabilities(capabilities);
    const next=resolveGraphicsSettings(key,{...caps,width:this.width,height:this.height},overrides);
    const check=validateRenderAllocation(this.width,this.height,next.pixelRatio,caps);
    if(!check.valid) {
      this.allocationStatus={state:'rejected',...check,requestedPreset:key,recovery:'Resize the window or choose a supported render scale.'};
      if(this.settings)return this.settings;
      throw new Error('This render size exceeds the GPU limit. Resize the window and retry.');
    }
    const previous=this.lastQualityRequest;
    try {
      const result=this.applyQuality(key,caps,overrides);
      this.lastQualityRequest={key,capabilities:caps,overrides:{...overrides}};
      this.allocationStatus={state:'ready',...check};return result;
    } catch(error) {
      let restored=false;
      if(previous)try{this.applyQuality(previous.key,previous.capabilities,previous.overrides);restored=true;}catch{}
      this.allocationStatus={state:restored?'rolled-back':'failed',reason:'allocation-failed',recovery:'Resize the window or choose a supported render scale.'};
      if(restored)return this.settings;
      throw error;
    }
  }

  applyQuality(key, capabilities, overrides) {
    this.capabilities = capabilities;
    const settings = resolveGraphicsSettings(key, { ...capabilities, width:this.width, height:this.height }, overrides);
    this.settings = settings;
    this.renderer.setPixelRatio(settings.pixelRatio);
    this.renderer.setSize(this.width, this.height, false);
    const mapSize = settings.shadowResolution;
    const lights = this.scene.children.filter(object => object.isLight && object.castShadow && object.shadow);
    for (const light of lights) {
      if (light.shadow.mapSize.x !== mapSize || light.shadow.mapSize.y !== mapSize) {
        light.shadow.mapSize.set(mapSize, mapSize);
        light.shadow.map?.dispose();
        light.shadow.map = null;
        light.shadow.needsUpdate = true;
      }
    }

    try {
      if (settings.ssr) this.createSSR();
      else if (this.ssr) {
        // Reclaim the SSR render targets when downgrading instead of merely
        // hiding a pass that continues to occupy GPU memory.
        this.composer.passes.splice(this.composer.passes.indexOf(this.ssr), 1);
        this.ssr.dispose();
        this.ssr = null;
      }
      if (this.ssr) {
        this.ssr.enabled = true;
        this.ssr.resolutionScale = settings.ssrScale || .5;
        this.refreshSSRTargets();
      }
    } catch (error) {
      console.warn('SSR unavailable on this GPU; falling back to environment reflections.', error);
      if (this.ssr) this.ssr.enabled = false;
    }
    this.configureBloom();
    this.cas.enabled = settings.sharpen > 0;
    this.configureContactDepth();
    this.cas.uniforms.strength.value = settings.sharpen;
    this.shadowAnchor = null;
    this.updateMaterials();
    this.passProxyDirty = true;
    if(this.resize(this.width, this.height)===false)throw new Error('Render target allocation failed');
    return settings;
  }

  getStatus() {
    if (!this.settings) return null;
    return { ...this.settings,
      allocation: this.allocationStatus || {state:'ready'},
      glowTuning:resolveGlowTuning(this.settings, Boolean(this.world?.userData?.environmentBloom)),
      bloomEnabled: !this.faulted && this.settings.bloomStrength > 0,
      postProcessingAvailable: !this.faulted,
      postProcessingEnabled: !this.faulted && this.settings.postProcessing,
      contactDepthEnabled: !this.faulted&&Boolean(this.contactDepth?.enabled),
      renderWidth: Math.round(this.width * this.settings.pixelRatio),
      renderHeight: Math.round(this.height * this.settings.pixelRatio),
    };
  }

  setGlowTuning(value, {legacyGlowDefaults = this.settings?.legacyGlowDefaults} = {}) {
    if (!this.settings) return;
    const previous = resolveGlowTuning(this.settings, Boolean(this.world?.userData?.environmentBloom));
    this.settings.glowTuning = normalizeGlowOverrides(value);
    this.settings.legacyGlowDefaults = legacyGlowDefaults === true;
    this.configureBloom();
    const next = resolveGlowTuning(this.settings, Boolean(this.world?.userData?.environmentBloom));
    if (previous.emissive !== next.emissive) this.updateMaterials();
  }

  configureBloom() {
    if (!this.settings) return;
    const orbit = Boolean(this.world?.userData?.environmentBloom);
    // Every tier honors the glow switch; quality changes bloom resolution.
    this.bloomComposite.enabled = this.settings.bloomStrength > 0;
    const tuning = resolveGlowTuning(this.settings, orbit);
    this.bloom.strength = this.bloomComposite.enabled ? tuning.bloom : 0;
    this.bloom.radius = tuning.radius;
    // Shared thresholds keep the glow response consistent across quality tiers.
    this.bloom.threshold = orbit ? .98 : .75;
    this.bloomComposite.uniforms.bloomMix.value = tuning.glow;
  }

  resize(width, height) {
    if(!this.settings){this.width=Math.max(1,width);this.height=Math.max(1,height);return true;}
    const caps=this.allocationCapabilities();
    const ratio=resolveRenderPixelRatio(this.settings,{...caps,width,height})*(this.settings.renderScale||1);
    const check=validateRenderAllocation(width,height,ratio,caps);
    if(!check.valid){this.allocationStatus={state:'rejected',...check,recovery:'Resize the window or choose a supported render scale.'};return false;}
    const previous={width:this.width,height:this.height,pixelRatio:this.settings.pixelRatio};
    try{this.applySize(width,height);this.allocationStatus={state:'ready',...check};return true;}
    catch(error){
      this.width=previous.width;this.height=previous.height;this.settings.pixelRatio=previous.pixelRatio;
      let restored=false;
      try{this.applySize(previous.width,previous.height);restored=true;}catch{}
      this.allocationStatus={state:restored?'rolled-back':'failed',reason:'allocation-failed',recovery:'Resize the window or choose a supported render scale.'};
      if(!restored)throw error;
      return false;
    }
  }

  applySize(width, height) {
    this.width = Math.max(1, width);
    this.height = Math.max(1, height);
    if (!this.settings) return;
    this.settings.pixelRatio = resolveRenderPixelRatio(this.settings,
      { ...this.capabilities, width:this.width, height:this.height }) * (this.settings.renderScale||1);
    this.renderer.setPixelRatio(this.settings.pixelRatio);
    this.renderer.setSize(this.width, this.height, false);
    const postProcessing = this.settings.postProcessing;
    this.composer.setPixelRatio(postProcessing ? this.settings.pixelRatio : 1);
    this.composer.setSize(postProcessing ? this.width : 1, postProcessing ? this.height : 1);
    // Disabled glow releases the bloom render-size budget even on Performance.
    const bloomEnabled = this.settings.bloomStrength > 0;
    this.bloomComposer.setPixelRatio(bloomEnabled
      ? this.settings.pixelRatio * this.settings.bloomScale : 1);
    this.bloomComposer.setSize(bloomEnabled ? this.width : 1, bloomEnabled ? this.height : 1);
    const sw = Math.max(1, Math.round(this.width * this.settings.pixelRatio));
    const sh = Math.max(1, Math.round(this.height * this.settings.pixelRatio));
    const samples = this.settings.msaaSamples;
    // MSAA belongs to the scene pass alone; effect targets stay single-sample.
    const sceneMsaa = Boolean(this.scenePass?.setSamples);
    if (sceneMsaa) this.scenePass.setSamples(samples);
    const effectSamples = sceneMsaa ? 0 : samples;
    for(const target of [this.composer.renderTarget1,this.composer.renderTarget2]) {
      if(target.samples!==effectSamples) {
        target.samples=effectSamples;
        // Existing framebuffer storage must be rebuilt when sample count
        // changes, even if a 1× DPR display keeps the same dimensions.
        target.dispose();
      }
    }
    this.cas.uniforms.pixelStep.value.set(1 / sw, 1 / sh);
  }

  render({ contactSource = null, warmup = false } = {}) {
    this.wheelContactShadows?.update(contactSource);
    if (!this.settings || this.faulted) {
      this.renderer.render(this.scene, this.camera);
      return;
    }
    // Wheels begin dark but join the bloom pass as speed rises. Prepare that
    // material/target/fog variant during loadout without changing their paint
    // or actual emission. Ordinary frames allocate no extra collection here.
    const warmupMaterials=warmup&&contactSource?.board?.wheelGlow?.length
      ? new Set(contactSource.board.wheelGlow.map(entry=>entry.material)) : null;
    const scene = this.scene, matrixAuto = scene.matrixWorldAutoUpdate;
    try {
      this.updateContactShadows();
      if (this.passProxyDirty && this.world) this.rebuildPassProxy();
      this.passProxy?.update();
      // Nothing moves between this frame's passes: update world matrices once
      // instead of once per scene render (glow, contact shading, main, reflection).
      if (matrixAuto !== false && scene.updateMatrixWorld) { scene.updateMatrixWorld(); scene.matrixWorldAutoUpdate = false; }
      // Performance and 144 FPS with glow disabled use one scene pass. The
      // canvas retains hardware AA, ACES tone mapping and output conversion.
      if (!this.settings.postProcessing) {
        this.renderer.render(this.scene, this.camera);
        return;
      }
      if (this.bloomComposite.enabled) {
        const validBloom = this.renderSelectiveBloom(warmupMaterials);
        this.bloomComposite.enabled = validBloom;
      }
      this.composer.render();
      // Re-enable on the next frame after a transient/no-rider loading state.
      this.bloomComposite.enabled = this.settings.bloomStrength > 0;
    } catch (error) {
      console.warn('Post-processing failed; disabling it for stable skating.', error);
      this.faulted = true;
      this.passProxy?.end();
      scene.matrixWorldAutoUpdate = matrixAuto;
      this.renderer.setRenderTarget(null);
      this.renderer.render(this.scene, this.camera);
    } finally {
      scene.matrixWorldAutoUpdate = matrixAuto;
    }
  }

  dispose() {
    this.passProxy?.dispose();
    this.scenePass?.dispose?.();
    this.wheelContactShadows?.dispose();
    this.ssr?.dispose();
    this.contactDepth?.dispose();
    this.bloom.dispose();
    this.bloomComposite.dispose();
    this.bloomComposer.dispose();
    this.blackoutMaterial.dispose();
    this.cas.dispose();
    this.composer.dispose();
  }
}
