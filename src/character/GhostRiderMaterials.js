import * as THREE from 'three';

const GHOST_COLOR = new THREE.Color('#00ff39');
const GHOST_RIM_CODE = `
  // Green spectral edge: bloom concentrates at the silhouette, not the body.
  float streetGhostFacing = abs(dot(normalize(normal), normalize(vViewPosition)));
  float streetGhostRim = pow(1.0 - clamp(streetGhostFacing, 0.0, 1.0), 2.0);
  totalEmissiveRadiance += vec3(0.015, 0.80, 0.09) * streetGhostRim * 1.65;
`;

/** Only the explicit Teddy.glb uploaded from the custom-rider menu glows.
 * Browser blob URLs do not retain source filenames, so caller must pass the
 * validated original upload name along the rider-loading chain. */
export function isCustomRiderUpload(url) {
  return typeof url === 'string' && url.startsWith('blob:');
}

export function isTeddyUploadFilename(filename) {
  return typeof filename === 'string' && /^teddy(?:_ghost)?(?:\s*\(\d+\))?\.glb$/i.test(filename.trim());
}

export function isTaggedGhostRider(root) {
  if (!root?.traverse) return false;
  if (root.userData?.streetskateGhost === true) return true;
  let tagged = false;
  root.traverse(object => {
    if (object.isMesh && object.userData?.streetskateGhost === true) tagged = true;
  });
  return tagged;
}

export function shouldApplyGhostRiderPresentation(url, uploadFilename, model = null) {
  return isCustomRiderUpload(url) &&
    (isTeddyUploadFilename(uploadFilename) || isTaggedGhostRider(model));
}

/**
 * Decorate materials, not geometry or bones. Existing skinned meshes, IK,
 * morph targets, proportions and imported texture maps remain unchanged.
 * The selective bloom pass already includes any positive emissive material.
 */
export function applyGhostRiderPresentation(root) {
  if (!root?.traverse) return 0;
  const owned = new Map();
  let affected = 0;
  const decorate = source => {
    if (!source) return source;
    if (owned.has(source)) return owned.get(source);
    const material = source.isMeshStandardMaterial
      ? source.clone()
      : new THREE.MeshStandardMaterial({
        name: source.name || 'Uploaded ghost rider',
        color: source.color?.clone?.() || new THREE.Color('#ffffff'),
        map: source.map || null,
        alphaMap: source.alphaMap || null,
        side: source.side ?? THREE.FrontSide,
      });
    material.name = (source.name || 'Custom') + ' / spectral glow';
    // Respect authored green/yellow-green Teddy textures; no cyan or white wash.
    // The base material provides silhouette and facial detail; rim supplies glow.
    material.color.lerp(new THREE.Color('#24da49'), 0.10);
    material.emissive.copy(GHOST_COLOR);
    // Clamp imported emissive strength: extreme HDR intensity desaturates to white.
    // Use the separate green Fresnel term for a strong outer bloom instead.
    material.emissiveIntensity = THREE.MathUtils.clamp(
      Number(source.emissiveIntensity) || 0.68, 0.45, 0.78);
    material.roughness = Math.max(0.58, material.roughness ?? 0.58);
    material.metalness = Math.min(0.06, material.metalness ?? 0);
    material.transparent = true;
    material.opacity = Math.min(0.90, Number.isFinite(source.opacity) ? source.opacity : 1);
    material.depthWrite = false;
    material.depthTest = true;
    material.blending = THREE.NormalBlending;
    const previousHook = material.onBeforeCompile;
    material.onBeforeCompile = shader => {
      previousHook.call(material, shader);
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <emissivemap_fragment>',
        '#include <emissivemap_fragment>\n' + GHOST_RIM_CODE,
      );
    };
    material.customProgramCacheKey = () => 'streetskate-custom-ghost-green-fresnel-v2';
    material.needsUpdate = true;
    owned.set(source, material);
    affected++;
    return material;
  };
  root.traverse(object => {
    if (!object.isMesh) return;
    object.material = Array.isArray(object.material)
      ? object.material.map(decorate) : decorate(object.material);
    object.userData.ghostRiderGlow = true;
    object.castShadow = false;
    object.receiveShadow = false;
  });
  // The imported materials have been replaced. Their texture maps remain
  // owned by the rider and will be released on normal UnrealRider disposal.
  for (const source of owned.keys()) source?.dispose?.();
  return affected;
}
