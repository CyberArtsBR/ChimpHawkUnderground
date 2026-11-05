import * as THREE from 'three';
import { applyOrbitFloorFinish } from './OrbitSurfaceMaterials.js';

// Low-frequency variation breaks up repeated source textures without new image
// downloads, UV edits, or geometry/collision changes. Color stays close to the
// artist's original; roughness carries most of the variation.
const NOISE = `
varying vec3 vFinishPosition;
float finishHash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * .1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float finishNoise(vec2 p) {
  vec2 cell = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(finishHash(cell), finishHash(cell + vec2(1.,0.)), f.x),
             mix(finishHash(cell + vec2(0.,1.)), finishHash(cell + vec2(1.)), f.x), f.y);
}`;

export function addSurfaceVariation(material, { tone = .08, roughness = .12, scale = .35 } = {}) {
  if (!material?.isMeshStandardMaterial || material.userData.surfaceFinish) return;
  material.userData.surfaceFinish = { tone, roughness, scale };
  const previousCompile = material.onBeforeCompile;
  const previousKey = material.customProgramCacheKey();
  material.onBeforeCompile = function(shader, renderer) {
    previousCompile.call(this, shader, renderer);
    shader.uniforms.finishTone = { value: tone };
    shader.uniforms.finishRoughness = { value: roughness };
    shader.uniforms.finishScale = { value: scale };
    shader.vertexShader = 'varying vec3 vFinishPosition;\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace('#include <worldpos_vertex>',
      '#include <worldpos_vertex>\nvFinishPosition = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = NOISE + '\nuniform float finishTone;\nuniform float finishRoughness;\nuniform float finishScale;\n' + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `
      #include <color_fragment>
      vec2 finishPlane = vFinishPosition.xz + vec2(vFinishPosition.y * .31, vFinishPosition.y * .57);
      float finishMacro = finishNoise(finishPlane * finishScale);
      float finishDetail = finishNoise(finishPlane * 2.1 + vec2(7.3, 13.7));
      float finishVariation = (finishMacro - .5) * 1.4 + (finishDetail - .5) * .35;
      diffuseColor.rgb *= 1.0 + finishVariation * finishTone;
    `);
    shader.fragmentShader = shader.fragmentShader.replace('#include <roughnessmap_fragment>', `
      #include <roughnessmap_fragment>
      roughnessFactor = clamp(roughnessFactor + finishVariation * finishRoughness, .16, 1.0);
    `);
  };
  material.customProgramCacheKey = () => `${previousKey}/surface-finish-v1`;
  material.needsUpdate = true;
}

export function refineMapSurfaces(root, id) {
  const touched = new Set();
  root.traverse(object => {
    if (!object.isMesh) return;
    for (const m of Array.isArray(object.material) ? object.material : [object.material]) {
      if (!m?.isMeshStandardMaterial || touched.has(m)) continue;
      touched.add(m);
      if (id === 'skate-paradise') {
        if (/Paradise \/ scanned concrete/.test(m.name)) {
          m.metalness = 0;
          m.roughness = Math.max(m.roughness, .82);
          addSurfaceVariation(m, { tone: .13, roughness: .09, scale: .23 });
        } else if (/Paradise \/ scanned asphalt/.test(m.name)) {
          m.metalness = 0;
          m.roughness = Math.max(m.roughness, .9);
          addSurfaceVariation(m, { tone: .10, roughness: .06, scale: .15 });
        } else if (/Paradise \/ oiled laminated timber/.test(m.name)) {
          addSurfaceVariation(m, { tone: .06, roughness: .09, scale: .48 });
        }
      } else if (id === 'rooftop') {
        if (['Concrete', 'Asphalt', 'Brick', 'RampPanel'].includes(m.name)) {
          m.metalness = 0;
          m.roughness = Math.max(m.roughness, m.name === 'RampPanel' ? .64 : .82);
          addSurfaceVariation(m, { tone: .20, roughness: .16, scale: .18 });
        } else if (['RustSteel', 'DarkSteel', 'OchrePaint', 'TealPaint'].includes(m.name)) {
          addSurfaceVariation(m, { tone: .07, roughness: .14, scale: .65 });
        }
      } else if (id === 'grand-warehouse') {
        if (/^Foundry_(Plywood(?:_Edges)?|Dark_Timber)(?:\.\d+)?$/.test(m.name)) {
          addSurfaceVariation(m, { tone: .11, roughness: .16, scale: .55 });
        } else if (/Concrete|Industrial_Brick|rubber/i.test(m.name)) {
          m.metalness = 0;
          m.roughness = Math.max(m.roughness, .8);
          addSurfaceVariation(m, { tone: .13, roughness: .12, scale: .24 });
        }
      } else if (id === 'orbit' && /^Ceramic \/ /.test(m.name)) {
        if(applyOrbitFloorFinish(m))addSurfaceVariation(m,{tone:.025,roughness:.025,scale:.28});
        else {
          m.metalness = .12;
          m.roughness = Math.max(m.roughness, .48);
          addSurfaceVariation(m, { tone: .07, roughness: .15, scale: .45 });
        }
      }
    }
  });

  // Imported warehouses previously disabled every static caster. Select only
  // a bounded set of opaque ramp/structure batches, never the enclosing roof.
  // Performance can disable these through GraphicsPipeline.updateMaterials.
  if (!['orbit', 'grand-warehouse'].includes(id)) return;
  const candidates = [],bounds=new THREE.Box3(),size=new THREE.Vector3();
  root.traverse(mesh => {
    if (!mesh.isMesh || mesh.userData.cameraRoof || Array.isArray(mesh.material)) return;
    const m = mesh.material;
    if (!m?.isMeshStandardMaterial || m.transparent || m.opacity < 1) return;
    if (!/^(Foundry_(Dark_Timber|Plywood)|Frame \/|Panel \/|Ceramic \/)/.test(m.name)) return;
    if(id==='orbit'&&/^Ceramic \/ /.test(m.name)) {
      bounds.setFromObject(mesh).getSize(size);
      // The broad coplanar deck self-shadowed into dense repeated bands in
      // Follow. It still receives rider/ramp shadows; only its own casting is
      // suppressed. Slope/obstacle geometry and every collision buffer stay.
      if(size.y<.03&&Math.max(size.x,size.z)>2) {
        mesh.userData.visualPassCaster=false;mesh.userData.castShadow=false;mesh.castShadow=false;
        return;
      }
    }
    candidates.push(mesh);
  });
  candidates.sort((a, b) => b.geometry.attributes.position.count - a.geometry.attributes.position.count);
  for (const mesh of candidates.slice(0, 12)) {
    mesh.userData.visualPassCaster = true;
    mesh.userData.castShadow = true;
    mesh.castShadow = true;
  }
}
