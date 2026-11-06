import * as THREE from 'three';

/**
 * Procedural surface finishes (2026-11 graphics pass). World-space detail
 * added in the shader, so no new textures and no UV changes:
 *  - ORBIT floor: sci-fi panels with dark seams, some glowing cyan (slow
 *    pulse), per-panel tint and gloss variation.
 *  - ORBIT ramps: fine panel lines and a darker base.
 *  - GRAND WAREHOUSE floor: large stains and worn patches with a gentle
 *    sheen, so the plain floor stops reading as one flat colour.
 * Chains any existing onBeforeCompile hook on the material.
 */
const time = { value: 0 };
export function updateFloorFinishTime(seconds) { time.value = seconds; }

const COMMON = `
varying vec3 vFinishWorld;
uniform float uFinishTime;
float ffHash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float ffNoise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
  return mix(mix(ffHash(i),ffHash(i+vec2(1,0)),f.x),mix(ffHash(i+vec2(0,1)),ffHash(i+vec2(1,1)),f.x),f.y); }
`;

const FINISHES = {
  'orbit-floor': {
    color: `
      vec2 cell = vFinishWorld.xz / 4.;
      vec2 local = fract(cell), id = floor(cell);
      float edge = min(min(local.x, 1. - local.x), min(local.y, 1. - local.y)) * 4.;
      float seam = 1. - smoothstep(.02, .06, edge);
      float tint = .92 + .12 * ffHash(id);
      diffuseColor.rgb *= mix(vec3(tint), vec3(.18, .22, .28), seam);
      ffGlow = seam * step(.62, ffHash(id * 1.7 + 3.1)) * (.55 + .45 * sin(uFinishTime * 1.3 + ffHash(id) * 6.28));
      ffRough = .1 + .16 * ffHash(id + 7.) + .25 * ffNoise(vFinishWorld.xz * 1.7) * .4;`,
    roughness: 'roughnessFactor = mix(roughnessFactor, ffRough, .85);',
    emissive: 'totalEmissiveRadiance += vec3(.15, .85, 1.) * ffGlow * 1.6;',
  },
  'orbit-ramp': {
    color: `
      float lines = 1. - smoothstep(.015, .04, abs(fract(vFinishWorld.y / 1.2) - .5) * 1.2);
      diffuseColor.rgb *= 1. - .22 * lines;
      diffuseColor.rgb *= mix(.82, 1.04, clamp(vFinishWorld.y / 4., 0., 1.));
      ffRough = .5;`,
    roughness: '',
    emissive: '',
  },
  'warehouse-floor': {
    color: `
      float stain = ffNoise(vFinishWorld.xz * .07) * .6 + ffNoise(vFinishWorld.xz * .23) * .4;
      float worn = smoothstep(.55, .85, ffNoise(vFinishWorld.xz * .11 + 9.));
      diffuseColor.rgb *= mix(.82, 1.12, stain);
      diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(1.12, 1.08, 1.02) + .015, worn * .5);
      ffRough = mix(.92, .58, worn);`,
    roughness: 'roughnessFactor = min(roughnessFactor, ffRough);',
    emissive: '',
  },
};

export function applyFloorFinish(material, kind) {
  const finish = FINISHES[kind];
  if (!finish || !material || material.userData.floorFinish) return false;
  material.userData.floorFinish = kind;
  const previous = material.onBeforeCompile;
  const previousKey = material.customProgramCacheKey?.bind(material);
  material.onBeforeCompile = function (shader, renderer) {
    previous?.call(this, shader, renderer);
    shader.uniforms.uFinishTime = time;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vFinishWorld;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvFinishWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${COMMON}`)
      .replace('#include <color_fragment>', `#include <color_fragment>\nfloat ffGlow = 0., ffRough = 1.;\n${finish.color}`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>\n${finish.roughness}`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\n${finish.emissive}`);
  };
  material.customProgramCacheKey = () => `${previousKey ? previousKey() : ''}|floor-finish-${kind}`;
  material.needsUpdate = true;
  return true;
}

/** Apply the right finish to each material in a freshly loaded world. */
export function applyWorldFinishes(world) {
  const id = world?.id;
  if (!world?.park || !['orbit', 'grand-warehouse'].includes(id)) return 0;
  let count = 0;
  world.park.traverse(object => {
    if (!object.isMesh) return;
    for (const m of [].concat(object.material)) {
      const name = String(m?.name || '').replace(/\.\d+$/, '');
      if (id === 'orbit' && name === 'Ceramic / silver riding concrete') count += applyFloorFinish(m, 'orbit-floor');
      else if (id === 'orbit' && (name === 'Ceramic / pearl transition' || name === 'Panel / satin slate blue')) count += applyFloorFinish(m, 'orbit-ramp');
      else if (id === 'grand-warehouse' && /vulcanized rubber floor/i.test(name)) count += applyFloorFinish(m, 'warehouse-floor');
    }
  });
  return count;
}
