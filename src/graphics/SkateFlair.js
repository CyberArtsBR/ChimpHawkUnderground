import * as THREE from 'three';

/**
 * Rider rim light (2026-11 enhancement pass): an edge glow in the rider's
 * accent colour so they pop against busy backgrounds, brighter for a moment
 * on big combos. Presentation only.
 * (Trick trails and landing shockwaves were tried and removed by request.)
 */
export const FLAIR = Object.freeze({
  rimStrength: .32,
  rimPower: 2.6,
});

export class SkateFlair {
  constructor() {
    this.rimUniforms = {
      uRimColor: { value: new THREE.Color('#ff5fae') },
      uRimStrength: { value: FLAIR.rimStrength },
      uRimPower: { value: FLAIR.rimPower },
    };
    this.rimBoost = 0;
    this.rimRider = null;
    this.patched = new WeakSet();
  }

  setRiderAccent(color) {
    try { this.rimUniforms.uRimColor.value.set(color || '#ff5fae'); } catch { /* keep the last colour */ }
  }

  /** Patch every standard material under a rider model with the rim glow. */
  patchRider(root) {
    root?.traverse?.(mesh => {
      if (!mesh.isMesh) return;
      for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
        if (!material?.isMeshStandardMaterial || this.patched.has(material)) continue;
        this.patched.add(material);
        const previous = material.onBeforeCompile;
        const previousKey = material.customProgramCacheKey?.bind(material);
        const uniforms = this.rimUniforms;
        material.onBeforeCompile = function (shader, renderer) {
          previous?.call(this, shader, renderer);
          Object.assign(shader.uniforms, uniforms);
          shader.fragmentShader = shader.fragmentShader
            .replace('#include <common>', '#include <common>\nuniform vec3 uRimColor;\nuniform float uRimStrength;\nuniform float uRimPower;')
            .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
  {
    float rimFacing = saturate( dot( normal, normalize( vViewPosition ) ) );
    totalEmissiveRadiance += uRimColor * ( pow( 1.0 - rimFacing, uRimPower ) * uRimStrength );
  }`);
        };
        material.customProgramCacheKey = () => `${previousKey ? previousKey() : ''}|chimp-rim`;
        material.needsUpdate = true;
      }
    });
  }

  /** Big combos briefly brighten the rim (level 2 SICK … level 4 CHIMPTASTIC). */
  comboGlow(level) { this.rimBoost = Math.max(this.rimBoost, [0, .3, .6, 1, 1.6][level] || 0); }

  update(delta, skater) {
    const dt = Math.min(.05, Math.max(0, Number(delta) || 0));
    // Patch a newly swapped rider, then ease any combo boost away.
    if (skater?.rider && skater.rider !== this.rimRider) { this.rimRider = skater.rider; this.patchRider(skater.rider.root); }
    this.rimBoost = Math.max(0, this.rimBoost - dt * 1.4);
    this.rimUniforms.uRimStrength.value = FLAIR.rimStrength * (1 + this.rimBoost * 2.2);
  }
}
