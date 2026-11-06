import * as THREE from 'three';

// Half Pipe's smooth, diagonally biased paint, adapted from X-forward to
// StreetSkate's Z-forward board frame. Preserve solid depth-writing deck paint.
export function installHalfPipeFinish(material, transform, bounds) {
  const uniforms = {
    hpTransform: { value: transform },
    hpBounds: { value: new THREE.Vector4(bounds.min.z, 1 / Math.max(.001, bounds.max.z - bounds.min.z),
      (bounds.min.x + bounds.max.x) * .5, 1 / Math.max(.001, bounds.max.x - bounds.min.x)) },
    hpTail: { value: new THREE.Color() }, hpMiddle: { value: new THREE.Color() }, hpNose: { value: new THREE.Color() },
    // Board customization: a crew character on the top of the deck.
    hpGraphic: { value: null }, hpGraphicOn: { value: 0 },
  };
  material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader.replace('#include <common>',
      '#include <common>\nuniform mat4 hpTransform; varying vec3 hpPosition; varying vec3 hpNormal;')
      .replace('#include <project_vertex>', 'hpPosition=(hpTransform*vec4(transformed,1.0)).xyz;\nhpNormal=normalize(mat3(hpTransform)*objectNormal);\n#include <project_vertex>');
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>',
      '#include <common>\nuniform vec4 hpBounds; uniform vec3 hpTail,hpMiddle,hpNose; varying vec3 hpPosition; varying vec3 hpNormal;\n'
      + 'uniform float hpGraphicOn; uniform sampler2D hpGraphic;')
      .replace('#include <color_fragment>', `#include <color_fragment>
        float t=clamp((hpPosition.z-hpBounds.x)*hpBounds.y+(hpPosition.x-hpBounds.z)*hpBounds.w*.12,0.,1.);
        vec3 paint=mix(hpTail,hpMiddle,smoothstep(0.,.56,t));
        paint=mix(paint,hpNose,smoothstep(.5,1.,t));
        // Deck art on the top faces: along the deck (tail to nose) and across it.
        // The deck top is slightly concave: count anything facing up as top, so the art never fades out.
        float hpTop=smoothstep(.12,.3,hpNormal.y), hpArt=0.;
        if(hpGraphicOn>.5){vec4 art=texture2D(hpGraphic,vec2(t,(hpPosition.x-hpBounds.z)*hpBounds.w+.5));hpArt=art.a*hpTop;paint=mix(paint,art.rgb,hpArt);}
        diffuseColor.rgb*=paint;`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        totalEmissiveRadiance*=1.-hpArt;`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor=mix(roughnessFactor,.85,hpArt);`);
  };
  material.customProgramCacheKey = () => 'streetskate-halfpipe-gradient-v4';
  material.userData.halfPipeFinish = uniforms;
  return uniforms;
}
