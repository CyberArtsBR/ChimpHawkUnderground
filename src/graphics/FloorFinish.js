import * as THREE from 'three';

/**
 * Procedural surface finishes. World-space detail added in the shader, so no
 * new textures and no UV changes.
 *
 * Each world also gets a small top-down "proximity" texture built from its own
 * geometry when it loads:
 *  R = near a skate feature (ramps, rails, boxes), fading out over ~6 m
 *  G = near coping / ledge / rail edges, fading out over ~0.9 m
 * Finishes use it to put glow, wax and wear where riders actually skate.
 *
 *  - ORBIT floor: thin dark panel seams everywhere; seams glow only near the
 *    features, with a slow ripple. Satin, not mirror (no glare blob).
 *  - ORBIT ramps: 1.2 m panel lines, darker base, lit lip near the coping.
 *  - GRAND WAREHOUSE: none (kept light; its original look is unchanged).
 *  - SKATE PARADISE concrete: skid marks, wax on ledges, chipped coping edge.
 * Chains any existing onBeforeCompile hook on the material.
 */
const time = { value: 0 };
const mask = { value: null };
const rect = { value: new THREE.Vector4(0, 0, 1, 1) };
const floorY = { value: 0 };
export function updateFloorFinishTime(seconds) { time.value = seconds; }

const COMMON = `
varying vec3 vFinishWorld;
varying vec3 vFinishNormal;
uniform float uFinishTime;
uniform float uFinishFloorY;
uniform sampler2D uFinishMask;
uniform vec4 uFinishRect;
float ffHash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float ffNoise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
  return mix(mix(ffHash(i),ffHash(i+vec2(1,0)),f.x),mix(ffHash(i+vec2(0,1)),ffHash(i+vec2(1,1)),f.x),f.y); }
vec4 ffMask(vec2 xz){ vec2 uv=(xz-uFinishRect.xy)/uFinishRect.zw;
  if(uv.x<0.||uv.y<0.||uv.x>1.||uv.y>1.) return vec4(0.); return texture2D(uFinishMask, uv); }
// Planar coordinates that follow the surface: top faces use XZ, walls use the
// horizontal axis most across the face plus height.
vec2 ffPlanar(vec3 w, vec3 n){ n=abs(n); if(n.y>.6) return w.xz; return n.x>n.z ? vec2(w.z,w.y) : vec2(w.x,w.y); }
// Long thin rubber streaks, each patch running its own direction.
float ffSkid(vec2 q, float density){ float a=ffNoise(q*.045+5.)*6.2832; vec2 r=mat2(cos(a),-sin(a),sin(a),cos(a))*q;
  return smoothstep(.8,.97,ffNoise(vec2(r.x*3.2, r.y*.22)))*smoothstep(1.-density,1.-density*.4,ffNoise(q*.11+21.)); }
`;

const FINISHES = {
  'orbit-floor': {
    color: `
      vec2 cell = vFinishWorld.xz / 4.;
      vec2 local = fract(cell), id = floor(cell);
      float edge = min(min(local.x, 1. - local.x), min(local.y, 1. - local.y)) * 4.;
      float seam = 1. - smoothstep(.012, .04, edge);
      diffuseColor.rgb *= (.95 + .07 * ffHash(id));
      diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(.42, .48, .58), seam * .85);
      vec4 m = ffMask(vFinishWorld.xz);
      float near = smoothstep(.12, .75, m.r);
      float ripple = .45 + .55 * pow(.5 + .5 * sin(uFinishTime * 1.4 - length(vFinishWorld.xz - uFinishRect.xy - uFinishRect.zw * .5) * .16), 2.);
      ffGlow = seam * near * ripple;
      // Polished wheel paths around the features.
      diffuseColor.rgb *= 1. + .1 * near;
      ffRough = .36 + .12 * ffHash(id + 7.) + .12 * ffNoise(vFinishWorld.xz * 1.7);`,
    roughness: 'roughnessFactor = mix(roughnessFactor, ffRough, .9);',
    emissive: 'totalEmissiveRadiance += vec3(.12, .8, 1.) * ffGlow * 1.25;',
  },
  'orbit-ramp': {
    color: `
      vec3 n = normalize(vFinishNormal);
      vec2 p = ffPlanar(vFinishWorld, n);
      vec2 cell = p / 1.2, local = fract(cell), id = floor(cell);
      float edge = min(min(local.x, 1. - local.x), min(local.y, 1. - local.y)) * 1.2;
      float seam = 1. - smoothstep(.008, .022, edge);
      float bevel = (1. - smoothstep(.022, .05, edge)) - seam;
      diffuseColor.rgb *= .9 + .12 * ffHash(id);
      diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * .42, seam);
      diffuseColor.rgb += bevel * .035;
      diffuseColor.rgb *= mix(.74, 1.04, clamp((vFinishWorld.y - uFinishFloorY) / 3.5, 0., 1.));
      vec4 m = ffMask(vFinishWorld.xz);
      ffGlow = m.g * smoothstep(.5, 1., (vFinishWorld.y - uFinishFloorY) / 2.5);
      ffRough = .42 + .1 * ffHash(id + 3.);`,
    roughness: 'roughnessFactor = mix(roughnessFactor, ffRough, .6);',
    emissive: 'totalEmissiveRadiance += vec3(.25, .7, 1.) * ffGlow * .55;',
  },
  'paradise-concrete': {
    color: `
      vec3 n = normalize(vFinishNormal);
      vec2 p = ffPlanar(vFinishWorld, n);
      vec4 m = ffMask(vFinishWorld.xz);
      // Wax on ledges and coping edges: darker, glossier band.
      float wax = m.g * (.5 + .5 * ffNoise(p * 6.)) * step(.35, n.y);
      diffuseColor.rgb *= 1. - .28 * wax;
      // Chipped concrete right at the coping: lighter, broken spots.
      float chip = smoothstep(.72, .92, m.g) * smoothstep(.68, .82, ffNoise(p * 9. + 4.));
      diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * 1.35 + .03, chip);
      diffuseColor.rgb *= 1. - .38 * ffSkid(p, .42) * step(.35, n.y);
      ffRough = mix(1., .5, wax);`,
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
    Object.assign(shader.uniforms, { uFinishTime: time, uFinishMask: mask, uFinishRect: rect, uFinishFloorY: floorY });
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vFinishWorld;\nvarying vec3 vFinishNormal;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvFinishWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvFinishNormal = normalize(mat3(modelMatrix) * objectNormal);');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${COMMON}`)
      .replace('#include <color_fragment>', `#include <color_fragment>\nfloat ffGlow = 0., ffRough = 1.;\n${finish.color}`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>\n${finish.roughness}`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\n${finish.emissive}`);
  };
  material.customProgramCacheKey = () => `${previousKey ? previousKey() : ''}|floor-finish-v2-${kind}`;
  material.needsUpdate = true;
  return true;
}

const clean = name => String(name || '').replace(/\.\d+$/, '');

/** Which finish (if any) a material gets, and how it feeds the proximity map. */
const WORLD_RULES = {
  orbit: {
    finish: name => name === 'Ceramic / silver riding concrete' ? 'orbit-floor'
      : ['Ceramic / pearl transition', 'Panel / satin slate blue', 'Foundry_Plywood', 'Foundry_Dark_Timber'].includes(name) ? 'orbit-ramp' : null,
    floor: name => name === 'Ceramic / silver riding concrete',
    feature: name => /^(Ceramic \/ pearl|Panel \/ satin|Foundry_|Grind \/|Hardware \/)/.test(name),
    edge: name => /^(Grind \/|Hardware \/)/.test(name),
  },
  'skate-paradise': {
    finish: name => /^Paradise \/ scanned (concrete|asphalt)/.test(name) ? 'paradise-concrete' : null,
    floor: name => /^Paradise \/ scanned asphalt/.test(name),
    feature: name => /^Paradise \/ (scanned concrete|brushed stainless|petrol enamel|powder coated|oiled laminated)/.test(name),
    edge: name => /^Paradise \/ (brushed stainless|petrol enamel|powder coated)/.test(name),
  },
};

/** Chamfer distance transform (in cells) from the marked cells. */
function distanceField(marked, w, h) {
  const INF = 1e9, d = new Float32Array(w * h);
  for (let i = 0; i < d.length; i++) d[i] = marked[i] ? 0 : INF;
  const a = 1, b = Math.SQRT2;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x; let v = d[i];
    if (x > 0) v = Math.min(v, d[i - 1] + a);
    if (y > 0) { v = Math.min(v, d[i - w] + a); if (x > 0) v = Math.min(v, d[i - w - 1] + b); if (x < w - 1) v = Math.min(v, d[i - w + 1] + b); }
    d[i] = v;
  }
  for (let y = h - 1; y >= 0; y--) for (let x = w - 1; x >= 0; x--) {
    const i = y * w + x; let v = d[i];
    if (x < w - 1) v = Math.min(v, d[i + 1] + a);
    if (y < h - 1) { v = Math.min(v, d[i + w] + a); if (x < w - 1) v = Math.min(v, d[i + w + 1] + b); if (x > 0) v = Math.min(v, d[i + w - 1] + b); }
    d[i] = v;
  }
  return d;
}

/** Build the top-down proximity texture for a world (see header). */
export function buildProximityMask(world, rules) {
  const park = world.park;
  park.updateMatrixWorld(true);
  const box = new THREE.Box3(), meshes = [];
  const floorHeights = [];
  park.traverse(o => {
    if (!o.isMesh || !o.visible) return;
    const names = [].concat(o.material).map(m => clean(m?.name));
    const feature = names.some(rules.feature), edge = names.some(rules.edge), floor = names.some(rules.floor);
    if (!feature && !edge && !floor) return;
    o.geometry.computeBoundingBox?.();
    const b = o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld);
    if (b.isEmpty() || b.max.x - b.min.x > 900) return;
    box.union(b);
    meshes.push({ o, feature, edge, floor });
  });
  if (box.isEmpty()) return null;
  box.expandByScalar(4);
  const sizeX = box.max.x - box.min.x, sizeZ = box.max.z - box.min.z;
  const cell = Math.max(.18, Math.max(sizeX, sizeZ) / 640);
  const w = Math.ceil(sizeX / cell), h = Math.ceil(sizeZ / cell);
  // Floor height: the most common height among floor-mesh vertices.
  const v = new THREE.Vector3(), hist = new Map();
  for (const { o, floor } of meshes) if (floor) {
    const p = o.geometry.attributes.position;
    for (let i = 0; i < p.count; i += Math.max(1, p.count / 4000 | 0)) {
      v.fromBufferAttribute(p, i).applyMatrix4(o.matrixWorld);
      const k = Math.round(v.y * 10); hist.set(k, (hist.get(k) || 0) + 1);
    }
  }
  const baseY = hist.size ? [...hist.entries()].sort((a, b) => b[1] - a[1])[0][0] / 10 : box.min.y + 4;
  const feat = new Uint8Array(w * h), edge = new Uint8Array(w * h);
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), q = new THREE.Vector3();
  const mark = (arr, p, minY) => {
    if (p.y < minY || p.y > baseY + 9) return;
    const x = (p.x - box.min.x) / cell | 0, z = (p.z - box.min.z) / cell | 0;
    if (x >= 0 && z >= 0 && x < w && z < h) arr[z * w + x] = 1;
  };
  for (const { o, feature, edge: isEdge, floor } of meshes) {
    if (floor && !feature) continue;
    const g = o.geometry, p = g.attributes.position, idx = g.index;
    const tris = idx ? idx.count / 3 : p.count / 3;
    for (let t = 0; t < tris; t++) {
      const i0 = idx ? idx.getX(t * 3) : t * 3, i1 = idx ? idx.getX(t * 3 + 1) : t * 3 + 1, i2 = idx ? idx.getX(t * 3 + 2) : t * 3 + 2;
      a.fromBufferAttribute(p, i0).applyMatrix4(o.matrixWorld);
      b.fromBufferAttribute(p, i1).applyMatrix4(o.matrixWorld);
      c.fromBufferAttribute(p, i2).applyMatrix4(o.matrixWorld);
      const span = Math.max(a.distanceTo(b), b.distanceTo(c), c.distanceTo(a));
      const n = Math.min(40, Math.max(1, Math.ceil(span / cell)));
      for (let i = 0; i <= n; i++) for (let j = 0; j <= n - i; j++) {
        q.copy(a).multiplyScalar(1 - (i + j) / n).addScaledVector(b, i / n).addScaledVector(c, j / n);
        if (feature) mark(feat, q, baseY + .15);
        if (isEdge) mark(edge, q, baseY + .05);
      }
    }
  }
  const df = distanceField(feat, w, h), de = distanceField(edge, w, h);
  const R = 6 / cell, E = .9 / cell;
  const data = new Uint8Array(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    data[i * 4] = Math.round(255 * Math.max(0, 1 - df[i] / R) ** 1.5);
    data[i * 4 + 1] = Math.round(255 * Math.max(0, 1 - de[i] / E));
    data[i * 4 + 3] = 255;
  }
  const texture = new THREE.DataTexture(data, w, h, THREE.RGBAFormat);
  texture.magFilter = texture.minFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return { texture, rect: new THREE.Vector4(box.min.x, box.min.z, sizeX, sizeZ), floorY: baseY };
}

/** Apply the right finish to each material in a freshly loaded world. */
export function applyWorldFinishes(world) {
  const rules = WORLD_RULES[world?.id];
  if (!world?.park || !rules) return 0;
  const built = buildProximityMask(world, rules);
  if (built) {
    mask.value?.dispose?.();
    mask.value = built.texture; rect.value.copy(built.rect); floorY.value = built.floorY;
    world.userData ||= {};
    world.userData.finishMask = built;
  }
  let count = 0;
  world.park.traverse(object => {
    if (!object.isMesh) return;
    for (const m of [].concat(object.material)) {
      const kind = rules.finish(clean(m?.name));
      if (kind) count += applyFloorFinish(m, kind);
    }
  });
  return count;
}
