import * as THREE from 'three';
import { Reflector } from 'three/addons/objects/Reflector.js';

/**
 * Planar floor reflections (2026-11 graphics pass) for ORBIT's polished floor
 * and the GRAND WAREHOUSE floor. The reflector copies only the floor mesh's
 * flat, level triangles (so bowls and floor holes stay open), sits a hair
 * above it and blends in faintly, stronger at grazing angles. High+ presets.
 */
const REFLECTIONS = {
  orbit: { match: name => name === 'Ceramic / silver riding concrete', opacity: .34, tint: '#bcd4ff' },
  'grand-warehouse': { match: name => /vulcanized rubber floor/i.test(name), opacity: .16, tint: '#ffe8cc' },
};

const ReflectionShader = {
  uniforms: { color: { value: null }, tDiffuse: { value: null }, textureMatrix: { value: null }, opacity: { value: .3 } },
  vertexShader: `
    uniform mat4 textureMatrix; varying vec4 vUv; varying vec3 vWorld;
    void main(){ vUv = textureMatrix * vec4(position, 1.0); vec4 w = modelMatrix * vec4(position, 1.0); vWorld = w.xyz;
      gl_Position = projectionMatrix * viewMatrix * w; }`,
  fragmentShader: `
    uniform vec3 color; uniform sampler2D tDiffuse; uniform float opacity; varying vec4 vUv; varying vec3 vWorld;
    void main(){
      vec4 base = texture2DProj(tDiffuse, vUv);
      vec3 view = normalize(cameraPosition - vWorld);
      float fresnel = .35 + .65 * pow(1. - clamp(view.y, 0., 1.), 3.);
      gl_FragColor = vec4(base.rgb * color, opacity * fresnel);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`,
};

/** Flat, level triangles of a mesh at its dominant floor height, in world space. */
function floorGeometry(mesh) {
  const g = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
  g.applyMatrix4(mesh.matrixWorld);
  const p = g.attributes.position, keep = [], a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3();
  const heights = new Map();
  for (let i = 0; i < p.count; i += 3) {
    a.fromBufferAttribute(p, i); b.fromBufferAttribute(p, i + 1); c.fromBufferAttribute(p, i + 2);
    n.subVectors(c, b).cross(new THREE.Vector3().subVectors(a, b)).normalize();
    if (Math.abs(n.y) < .999) continue;
    const y = Math.round((a.y + b.y + c.y) / 3 * 50) / 50;
    heights.set(y, (heights.get(y) || 0) + 1);
    keep.push(i, y);
  }
  if (!keep.length) { g.dispose(); return null; }
  const floorY = [...heights.entries()].sort((x, y) => y[1] - x[1])[0][0];
  const out = [];
  for (let k = 0; k < keep.length; k += 2) {
    if (Math.abs(keep[k + 1] - floorY) > .03) continue;
    const i = keep[k];
    for (let j = 0; j < 3; j++) out.push(p.getX(i + j), floorY + .012, p.getZ(i + j));
  }
  g.dispose();
  if (!out.length) return null;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(out, 3));
  // Reflector expects its plane normal on local +Z: lay the floor into XY.
  geometry.rotateX(Math.PI / 2);
  return geometry;
}

export class FloorReflections {
  constructor(scene) {
    this.scene = scene;
    this.root = new THREE.Group();
    this.root.name = 'Floor reflections';
    scene?.add(this.root);
    this.enabled = false;
    this.world = null;
    this.size = new THREE.Vector2(1, 1);
  }

  setQuality(settings) {
    this.enabled = ['high', 'ultra', 'cinematic'].includes(settings?.name);
    this.build();
  }

  setSize(width, height) { this.size.set(width, height); this.build(); }

  setWorld(world) { this.world = world; this.build(); }

  clear() {
    for (const child of [...this.root.children]) {
      child.removeFromParent(); child.geometry?.dispose(); child.getRenderTarget?.().dispose(); child.material?.dispose();
    }
  }

  build() {
    this.clear();
    const spec = REFLECTIONS[this.world?.id];
    if (!this.enabled || !spec || !this.world?.park) return;
    const meshes = [];
    this.world.park.updateMatrixWorld(true);
    this.world.park.traverse(o => { if (o.isMesh && [].concat(o.material).some(m => spec.match(String(m?.name || '').replace(/\.\d+$/, '')))) meshes.push(o); });
    for (const mesh of meshes) {
      const geometry = floorGeometry(mesh);
      if (!geometry) continue;
      const reflector = new Reflector(geometry, {
        textureWidth: Math.max(256, Math.round(this.size.x * .5)), textureHeight: Math.max(256, Math.round(this.size.y * .5)),
        color: new THREE.Color(spec.tint), clipBias: .003, shader: ReflectionShader,
      });
      reflector.rotation.x = -Math.PI / 2;
      reflector.material.transparent = true;
      reflector.material.depthWrite = false;
      reflector.material.uniforms.opacity.value = spec.opacity;
      reflector.renderOrder = 1;
      reflector.name = 'Floor reflection';
      this.root.add(reflector);
    }
  }
}
