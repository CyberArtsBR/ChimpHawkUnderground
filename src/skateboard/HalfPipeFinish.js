import * as THREE from 'three';

// Half Pipe's smooth, diagonally biased paint, adapted from X-forward to
// StreetSkate's Z-forward board frame. Preserve solid depth-writing deck paint.
export function installHalfPipeFinish(material, transform, bounds) {
  const uniforms = {
    hpTransform: { value: transform },
    hpBounds: { value: new THREE.Vector4(bounds.min.z, 1 / Math.max(.001, bounds.max.z - bounds.min.z),
      (bounds.min.x + bounds.max.x) * .5, 1 / Math.max(.001, bounds.max.x - bounds.min.x)) },
    hpTail: { value: new THREE.Color() }, hpMiddle: { value: new THREE.Color() }, hpNose: { value: new THREE.Color() },
  };
  material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader.replace('#include <common>',
      '#include <common>\nuniform mat4 hpTransform; varying vec3 hpPosition;')
      .replace('#include <project_vertex>', 'hpPosition=(hpTransform*vec4(transformed,1.0)).xyz;\n#include <project_vertex>');
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>',
      '#include <common>\nuniform vec4 hpBounds; uniform vec3 hpTail,hpMiddle,hpNose; varying vec3 hpPosition;')
      .replace('#include <color_fragment>', `#include <color_fragment>
        float t=clamp((hpPosition.z-hpBounds.x)*hpBounds.y+(hpPosition.x-hpBounds.z)*hpBounds.w*.12,0.,1.);
        vec3 paint=mix(hpTail,hpMiddle,smoothstep(0.,.56,t));
        paint=mix(paint,hpNose,smoothstep(.5,1.,t));
        diffuseColor.rgb*=paint;`);
  };
  material.customProgramCacheKey = () => 'streetskate-halfpipe-gradient-v1';
  material.userData.halfPipeFinish = uniforms;
  return uniforms;
}
