// Graphics quality policy is renderer-independent so it can be tested without WebGL.
export const GRAPHICS_PRESET_ORDER = Object.freeze(['performance', 'high-refresh', 'balanced', 'high', 'ultra', 'cinematic']);
const PRESETS = {
  performance: { label:'Performance', pixelRatioCap:1, anisotropy:2, environmentQuality:'Low', environmentIntensity:.74, environmentBlur:.11, metalReflectionStrength:1.8, exposureMultiplier:.98, fogDensity:.0038, vfxScale:.65, bloomScale:.25, bloomStrength:1.3, ssr:false, ssrScale:0, sharpen:0, msaaSamples:0, shadowCoverageRadius:44, shadowNormalBias:.038, ssrTargetLimit:0 },
  'high-refresh': { label:'144 FPS', targetFrameRate:144, pixelRatioCap:4, anisotropy:8, environmentQuality:'High', environmentIntensity:.84, environmentBlur:.05, metalReflectionStrength:2.4, exposureMultiplier:1, fogDensity:.0042, vfxScale:.8, bloomScale:.4, bloomStrength:1.3, ssr:false, ssrScale:0, sharpen:.12, msaaSamples:0, shadowCoverageRadius:36, shadowNormalBias:.028, ssrTargetLimit:0 },
  balanced: { label:'Balanced', pixelRatioCap:1.3, anisotropy:4, environmentQuality:'Medium', environmentIntensity:.79, environmentBlur:.075, metalReflectionStrength:2.0, exposureMultiplier:.99, fogDensity:.0040, vfxScale:.82, bloomScale:.55, bloomStrength:1.3, ssr:false, ssrScale:0, sharpen:.19, msaaSamples:2, shadowCoverageRadius:40, shadowNormalBias:.032, ssrTargetLimit:0 },
  high: { label:'High', pixelRatioCap:1.6, anisotropy:8, environmentQuality:'High', environmentIntensity:.84, environmentBlur:.05, metalReflectionStrength:2.4, exposureMultiplier:1, fogDensity:.0042, vfxScale:1, bloomScale:.58, bloomStrength:1.3, ssr:false, ssrScale:0, sharpen:.23, msaaSamples:2, shadowCoverageRadius:36, shadowNormalBias:.028, ssrTargetLimit:0 },
  ultra: { label:'Ultra', pixelRatioCap:2, anisotropy:16, environmentQuality:'Ultra', environmentIntensity:.88, environmentBlur:.035, metalReflectionStrength:2.8, exposureMultiplier:1.02, fogDensity:.0043, vfxScale:1.15, bloomScale:.7, bloomStrength:1.3, ssr:false, ssrScale:0, sharpen:.26, msaaSamples:4, shadowCoverageRadius:33, shadowNormalBias:.026, ssrTargetLimit:0 },
  cinematic: { label:'Cinematic', pixelRatioCap:2.25, anisotropy:16, environmentQuality:'Cinematic', environmentIntensity:1.15, environmentBlur:.025, metalReflectionStrength:3.4, exposureMultiplier:1, fogDensity:.0032, vfxScale:1.25, bloomScale:.75, bloomStrength:1.3, ssr:false, ssrScale:0, sharpen:.3, msaaSamples:4, shadowCoverageRadius:32, shadowNormalBias:.025, ssrTargetLimit:0 },
};
export const GRAPHICS_DESCRIPTIONS = Object.freeze({
  performance: 'Lower detail · low-cost glow when enabled',
  'high-refresh': '144 Hz target · native-resolution detail · lightweight glow',
  balanced: 'A lighter mix of detail and atmosphere',
  high: 'Detailed surfaces and the current production look',
  ultra: 'Sharper surfaces and edges · higher render cost',
  cinematic: 'Highest detail · shared glow settings',
});
// SSR on moving imported meshes creates ghost silhouettes and disappearing geometry at Ultra/Cinematic.\n// Use stable PBR environment reflections on all tiers; preserve high-tier AA, bloom, HDR and 1024 shadows.\n// The 1024 shadow-map size is intentional on ALL tiers: no hidden 2K/4K override.
const SURFACE_DETAIL = Object.freeze({performance:0,'high-refresh':.45,balanced:.6,high:.85,ultra:1,cinematic:1});
export const GRAPHICS_PRESETS = Object.freeze(Object.fromEntries(
  // 2026-11: crisper 2048 shadows from 144 FPS/High up; ambient occlusion from High up.
  Object.entries(PRESETS).map(([key,value])=>[key,Object.freeze({ ...value, postProcessing:true, shadowResolution:['performance','balanced'].includes(key)?1024:2048, surfaceDetailScale:SURFACE_DETAIL[key], contactDepth:['high','ultra','cinematic'].includes(key) })])
));
// New players start on Cinematic (2026-11). A preset a returning player
// already has saved is always kept.
export const DEFAULT_GRAPHICS_PRESET = 'cinematic';
export const GRAPHICS_STORAGE_KEY = 'streetskate.graphicsPreset.v2';

export function normalizedGraphicsPreset(value) {
  return Object.hasOwn(GRAPHICS_PRESETS, value) ? value : DEFAULT_GRAPHICS_PRESET;
}

/** Dimension preflight only; it does not guess VRAM or silently change quality. */
export function validateRenderAllocation(width,height,pixelRatio,capabilities={}) {
  const w=Math.ceil(width*pixelRatio),h=Math.ceil(height*pixelRatio);
  const limits=[capabilities.maxTextureSize,capabilities.maxRenderbufferSize]
    .filter(value=>Number.isFinite(value)&&value>0);
  const limit=limits.length?Math.min(...limits):Infinity;
  const valid=Number.isFinite(w)&&Number.isFinite(h)&&w>0&&h>0&&w<=limit&&h<=limit;
  return {valid,width:w,height:h,limit:Number.isFinite(limit)?limit:null,
    reason:valid?null:'unsupported-render-size'};
}
export function resolveRenderPixelRatio(preset, capabilities = {}) {
  const devicePixelRatio = Math.max(1, Number(capabilities.devicePixelRatio) || 1);
  const width = Math.max(1, Number(capabilities.width) || 1920);
  const height = Math.max(1, Number(capabilities.height) || 1080);
  const budgetRatio = preset.maxRenderPixels ? Math.sqrt(preset.maxRenderPixels / (width * height)) : Infinity;
  return Math.min(devicePixelRatio, preset.pixelRatioCap, budgetRatio);
}
export function resolveGraphicsSettings(value, capabilities = {}, overrides = {}) {
  const name = normalizedGraphicsPreset(value);
  const preset = GRAPHICS_PRESETS[name];
  const gpuAnisotropy = Math.max(1, Number(capabilities.maxAnisotropy) || 1);
  const maxSamples = Math.max(0, Number(capabilities.maxSamples) || 0);
  const bloomStrength = overrides.bloomEnabled === false ? 0 : preset.bloomStrength;
  return {
    ...preset, name,
    pixelRatio: resolveRenderPixelRatio(preset, capabilities) * Math.max(.6,Math.min(1.25,Number(overrides.renderScale)||1)),
    anisotropy: Math.min(gpuAnisotropy, preset.anisotropy),
    glowTuning: overrides.glowTuning || {},
    renderScale:Math.max(.6,Math.min(1.25,Number(overrides.renderScale)||1)),
    legacyGlowDefaults: overrides.legacyGlowDefaults === true,
    msaaSamples: Math.min(name === 'high-refresh' && overrides.smoothEdges ? 2 : preset.msaaSamples, maxSamples),
    bloomStrength,
    // With glow off, the two lean tiers bypass all offscreen passes.
    postProcessing: ['performance','high-refresh'].includes(name) ? bloomStrength > 0 : preset.postProcessing,
  };
}
export function loadGraphicsPresetFor(storage, renderer) {
  let saved = null;
  try { saved = storage?.getItem(GRAPHICS_STORAGE_KEY); } catch { /* none */ }
  return normalizedGraphicsPreset(saved);
}
export function loadGraphicsPreset(storage) {
  try { return normalizedGraphicsPreset(storage?.getItem(GRAPHICS_STORAGE_KEY)); }
  catch { return DEFAULT_GRAPHICS_PRESET; }
}
export function storeGraphicsPreset(storage, preset) {
  try { storage?.setItem(GRAPHICS_STORAGE_KEY, normalizedGraphicsPreset(preset)); }
  catch { /* Privacy mode and disabled storage must not interrupt gameplay. */ }
}
export function qualityFogDistance(near, far, fogDensity) {
  // Linear fog is scaled around its own map-specific range, not replaced with
  // the exponential fog definition used by the Legacy and Rooftop maps.
  const scale = fogDensity / GRAPHICS_PRESETS.high.fogDensity;
  return { near, far: near + (far - near) / scale };
}
