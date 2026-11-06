import * as THREE from 'three';

// Half Pipe's smooth, diagonally biased paint, adapted from X-forward to
// StreetSkate's Z-forward board frame. Preserve solid depth-writing deck paint.
export function installHalfPipeFinish(material, transform, bounds) {
  const uniforms = {
    hpTransform: { value: transform },
    hpBounds: { value: new THREE.Vector4(bounds.min.z, 1 / Math.max(.001, bounds.max.z - bounds.min.z),
      (bounds.min.x + bounds.max.x) * .5, 1 / Math.max(.001, bounds.max.x - bounds.min.x)) },
    hpTail: { value: new THREE.Color() }, hpMiddle: { value: new THREE.Color() }, hpNose: { value: new THREE.Color() },
    // Board customization: grip tape (top) and bottom graphic.
    hpGripColor: { value: new THREE.Color('#1c1c21') }, hpGripMix: { value: 0 }, hpGripCamo: { value: 0 },
    hpGraphic: { value: null }, hpGraphicOn: { value: 0 },
  };
  material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader.replace('#include <common>',
      '#include <common>\nuniform mat4 hpTransform; varying vec3 hpPosition; varying vec3 hpNormal;')
      .replace('#include <project_vertex>', 'hpPosition=(hpTransform*vec4(transformed,1.0)).xyz;\nhpNormal=normalize(mat3(hpTransform)*objectNormal);\n#include <project_vertex>');
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>',
      '#include <common>\nuniform vec4 hpBounds; uniform vec3 hpTail,hpMiddle,hpNose; varying vec3 hpPosition; varying vec3 hpNormal;\n'
      + 'uniform vec3 hpGripColor; uniform float hpGripMix,hpGripCamo,hpGraphicOn; uniform sampler2D hpGraphic;\n'
      + 'float hpHash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}')
      .replace('#include <color_fragment>', `#include <color_fragment>
        float t=clamp((hpPosition.z-hpBounds.x)*hpBounds.y+(hpPosition.x-hpBounds.z)*hpBounds.w*.12,0.,1.);
        vec3 paint=mix(hpTail,hpMiddle,smoothstep(0.,.56,t));
        paint=mix(paint,hpNose,smoothstep(.5,1.,t));
        float hpTop=smoothstep(.55,.8,hpNormal.y), hpBottom=smoothstep(.55,.8,-hpNormal.y);
        // Grip tape: sandpaper grain over the chosen colour (optionally camo blotches).
        vec3 grip=hpGripColor;
        if(hpGripCamo>.5){float blot=step(.55,hpHash(floor(hpPosition.xz*9.)));grip=mix(grip,grip*.55+vec3(.08,.06,.03),blot);}
        grip*=.82+.32*hpHash(floor(hpPosition.xz*420.));
        paint=mix(paint,grip,hpTop*hpGripMix);
        // Bottom graphic: along the deck (tail to nose) and across it.
        float hpArt=0.;
        if(hpGraphicOn>.5){vec4 art=texture2D(hpGraphic,vec2(t,(hpPosition.x-hpBounds.z)*hpBounds.w+.5));hpArt=art.a*hpBottom;paint=mix(paint,art.rgb,hpArt);}
        diffuseColor.rgb*=paint;`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor=mix(roughnessFactor,.97,hpTop*hpGripMix);`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        totalEmissiveRadiance*=1.-.92*hpTop*hpGripMix;
        totalEmissiveRadiance*=1.-.75*hpArt;`);
  };
  material.customProgramCacheKey = () => 'streetskate-halfpipe-gradient-v2';
  material.userData.halfPipeFinish = uniforms;
  return uniforms;
}
