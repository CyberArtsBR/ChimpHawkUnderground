import { gameAssetUrl } from './AssetPaths.js';
import * as THREE from 'three';
import { UnrealRider } from '../character/UnrealRider.js';
import { PortraitPromiseCache } from './PortraitPromiseCache.js';

const cache = new PortraitPromiseCache(8);
let renderer = null;
const bakedPortraits=new Map(['thehollowf','The_Heretic','The_AdolescentUR','The_Anchor','TuxR']
  .map(name=>[gameAssetUrl(`/assets/rider/${name}.glb`),gameAssetUrl(`/assets/menu/riders/${name}.png?v=full-body-2`)]));

/** Drop cached previews before revoking an uploaded character's blob URL. */
export function forgetCharacterPortrait(url) {
  if (url) cache.delete(url);
}

/**
 * Offscreen GLB rendering owns its imported textures, skeletons and materials.
 * Without this cleanup, every custom preview can leak GPU resources on the
 * shared portrait renderer even after the canvas has produced its PNG.
 */
function disposePortraitModel(model) {
  const skeletons = new Set();
  const geometries = new Set();
  const materials = new Set();
  const textures = new Set();
  model.traverse(item => {
    if (item.skeleton) skeletons.add(item.skeleton);
    if (item.geometry) geometries.add(item.geometry);
    const list = Array.isArray(item.material) ? item.material : [item.material];
    for (const material of list) if (material) materials.add(material);
  });
  for (const material of materials) {
    for (const value of Object.values(material)) if (value?.isTexture) textures.add(value);
    if (material.uniforms) {
      for (const uniform of Object.values(material.uniforms)) {
        const value = uniform?.value;
        if (value?.isTexture) textures.add(value);
        if (Array.isArray(value)) for (const entry of value) if (entry?.isTexture) textures.add(entry);
      }
    }
  }
  for (const skeleton of skeletons) skeleton.dispose?.();
  for (const geometry of geometries) geometry.dispose?.();
  for (const material of materials) material.dispose?.();
  for (const texture of textures) texture.dispose?.();
  model.removeFromParent();
}

/** Render an imported GLB as a small static image, never keeping its mesh alive. */
export async function renderPortrait(url) {
  const rider = await new UnrealRider(url).load();
  const model = rider.root;
  try {
    if (!renderer) {
      renderer = new THREE.WebGLRenderer({
        antialias: true, alpha: true, powerPreference: 'low-power',
        preserveDrawingBuffer: true,
      });
      renderer.setPixelRatio(1);
      renderer.setSize(320, 340);
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
    }
    const scene = new THREE.Scene();
    const hemi = new THREE.HemisphereLight('#eff5ff', '#4d3146', 2.15);
    scene.add(hemi);
    const key = new THREE.DirectionalLight('#ffe8ce', 3);
    key.position.set(-3, 7, 5);
    scene.add(key);
    const fill = new THREE.DirectionalLight('#bce9ff', 1.2);
    fill.position.set(3, 3, 4);scene.add(fill);
    const rim = new THREE.DirectionalLight('#c5b4ff', 1.8);
    rim.position.set(1, 4, -3);scene.add(rim);
    // Preview the same planted, bent-knee stance used during a session.
    for(let frame=0;frame<40;frame++) rider.update({dt:1/60,time:frame/60});
    const bounds = new THREE.Box3().setFromObject(model);
    const dims = bounds.getSize(new THREE.Vector3());
    if (!(dims.y > 0.001) || !Number.isFinite(dims.y)) throw new Error('Invalid GLB bounds');
    const normalized = new THREE.Group();
    normalized.add(model);
    scene.add(normalized);
    model.scale.setScalar(2.0 / dims.y);
    const scaledBounds = new THREE.Box3().setFromObject(model);
    const center = scaledBounds.getCenter(new THREE.Vector3());
    model.position.sub(center);
    model.rotation.y = -Math.PI / 3;
    // Fit the actual posed, rotated bounds, including feet and headwear.
    // A raised perspective aim previously clipped feet in the baked PNG itself.
    const framedBounds = new THREE.Box3().setFromObject(model);
    const framedSize = framedBounds.getSize(new THREE.Vector3());
    const framedCenter = framedBounds.getCenter(new THREE.Vector3());
    const aspect = 320 / 340;
    const halfHeight = Math.max(framedSize.y / 2, framedSize.x / (2 * aspect)) * 1.12;
    const camera = new THREE.OrthographicCamera(-halfHeight * aspect, halfHeight * aspect, halfHeight, -halfHeight, .05, 40);
    camera.position.set(framedCenter.x, framedCenter.y, framedBounds.max.z + 4);
    camera.lookAt(framedCenter);
    renderer.setClearColor(0, 0);
    renderer.clear();
    renderer.render(scene, camera);
    return renderer.domElement.toDataURL('image/png');
  } finally {
    // Three's render list otherwise retains references to the last avatar
    // despite its GLB and preview scene no longer being in the DOM.
    renderer?.renderLists?.dispose();
    disposePortraitModel(model);
  }
}

export function characterPortrait(url) {
  return cache.getOrLoad(url, async () => {
    const baked=bakedPortraits.get(url);
    if(baked){
      try{
        await new Promise((resolve,reject)=>{
          const image=new Image();image.onload=()=>Promise.resolve(image.decode?.()).then(resolve,reject);image.onerror=reject;image.src=baked;
        });
        return baked;
      }catch{ /* A missing static asset falls back to the real GLB preview. */ }
    }
    return renderPortrait(url);
  });
}
