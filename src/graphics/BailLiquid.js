import * as THREE from 'three';

const NORMAL = new THREE.Vector3(0, 0, 1);
const RADIUS_X = .69, RADIUS_Y = .48; // Three times the previous .23 × .16 radii.
const LIFE = 5, DROPS = 8;

// A shallow convex surface with a rounded, irregular meniscus, not a decal.
// Local +Z is the contact normal; XY follows the impact surface.
function liquidGeometry() {
  const segments = 48, rings = 10, positions = [0, 0, .0225], indices = [];
  for (let ring = 1; ring <= rings; ring++) {
    const r = ring / rings;
    for (let i = 0; i < segments; i++) {
      const a = i * Math.PI * 2 / segments;
      const edge = .95 + .028 * Math.sin(3 * a) + .022 * Math.cos(5 * a);
      const height = .0225 * Math.pow(Math.max(0, 1 - r * r), .65)
        + .0006*Math.exp(-Math.pow((1-r)/.035,2))
        + .0018 * Math.sin(r * 15 + a * 2) * r * (1 - r);
      positions.push(Math.cos(a) * r * edge * RADIUS_X, Math.sin(a) * r * edge * RADIUS_Y, height);
    }
  }
  for (let i = 0; i < segments; i++) indices.push(0, 1 + i, 1 + (i + 1) % segments);
  for (let ring = 1; ring < rings; ring++) for (let i = 0; i < segments; i++) {
    const a = 1 + (ring - 1) * segments + i, b = 1 + (ring - 1) * segments + (i + 1) % segments;
    const c = a + segments, d = b + segments;
    indices.push(a, c, b, b, c, d);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);geometry.computeVertexNormals();geometry.computeBoundingSphere();
  return geometry;
}

function liquidMaterial() {
  const material = new THREE.MeshPhysicalMaterial({color:0x510309, metalness:0, roughness:.16,
    clearcoat:1, clearcoatRoughness:.07, envMapIntensity:1.5,
    transparent:true, opacity:1, depthWrite:true});
  // Wet center rolls into a slightly rougher, thin meniscus instead of a hard shiny disk.
  material.onBeforeCompile=shader=>{
    shader.vertexShader='varying float vLiquidEdge;\n'+shader.vertexShader;
    shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvLiquidEdge=length(position.xy/vec2(.69,.48));');
    shader.fragmentShader='varying float vLiquidEdge;\n'+shader.fragmentShader;
    shader.fragmentShader=shader.fragmentShader.replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor+=smoothstep(.62,1.,vLiquidEdge)*.07;');
  };
  material.customProgramCacheKey=()=> 'bail-liquid-meniscus-v1';
  return material;
}

export class BailLiquid {
  constructor(root) {
    this.geometry = liquidGeometry();this.dropGeometry = new THREE.SphereGeometry(1, 8, 6);
    this.cursor = 0;this.transform = new THREE.Object3D();this.normal = new THREE.Vector3();
    this.enabled = true;this.disposed = false;
    this.basePositions = this.geometry.attributes.position.array.slice();
    this.puddles = Array.from({length:3}, () => {
      const mesh = new THREE.Mesh(this.geometry.clone(), liquidMaterial());
      mesh.name = 'Bail liquid surface';mesh.userData.bailLiquid = true;mesh.visible = false;
      const splash = new THREE.InstancedMesh(this.dropGeometry, liquidMaterial(), DROPS);
      splash.name = 'Bail liquid droplets';splash.visible = false;splash.frustumCulled = false;
      splash.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      root.add(mesh, splash);
      return {mesh, splash, age:0, count:0, gravity:new THREE.Vector3()};
    });
  }

  spawn(impact, performance = false, surface = null) {
    if (!this.enabled || this.disposed || !impact?.point?.isVector3 || !impact?.normal?.isVector3
      || !Number.isFinite(impact.point.lengthSq()) || !Number.isFinite(impact.normal.lengthSq())
      || impact.normal.lengthSq() < .01) return false;
    const p = this.puddles[this.cursor++ % this.puddles.length];
    this.normal.copy(impact.normal).normalize();
    p.age = 0;p.count = performance ? 4 : DROPS;
    p.severity=THREE.MathUtils.clamp((Number(impact.speed)||8)/8,.35,1);
    p.mesh.position.copy(impact.point).addScaledVector(this.normal, .003);
    p.mesh.quaternion.setFromUnitVectors(NORMAL, this.normal);
    this.conformSurface(p.mesh, surface);
    p.mesh.visible = true;p.mesh.material.opacity = 1;
    p.splash.position.copy(p.mesh.position);p.splash.quaternion.copy(p.mesh.quaternion);
    p.splash.material.opacity = 1;p.splash.count = p.count;p.splash.visible = true;
    p.gravity.set(0, -9.8, 0).applyQuaternion(p.mesh.quaternion.clone().invert());
    this.updatePuddle(p, 0);
    return true;
  }

  conformSurface(mesh, surface) {
    const position = mesh.geometry.attributes.position;
    position.array.set(this.basePositions);
    // Eight bounded contact probes fit local curvature; flat slopes already
    // follow the contact normal. No per-frame raycasts or live reflections.
    if (surface?.ground) {
      const point = new THREE.Vector3(), offset = new THREE.Vector3();
      const sample = (x, y) => {
        point.set(x, y, 0).applyQuaternion(mesh.quaternion).add(mesh.position);
        const hit = surface.ground(point, .35, .40);
        if (!hit?.point || !hit?.normal || hit.normal.dot(this.normal) < .8) return 0;
        const height = offset.copy(hit.point).sub(point).dot(this.normal) + .003;
        return Math.abs(height) <= .18 ? height : 0;
      };
      const xx = (sample(RADIUS_X, 0) + sample(-RADIUS_X, 0)) / (2 * RADIUS_X ** 2);
      const yy = (sample(0, RADIUS_Y) + sample(0, -RADIUS_Y)) / (2 * RADIUS_Y ** 2);
      const xy = (sample(RADIUS_X, RADIUS_Y) - sample(-RADIUS_X, RADIUS_Y)
        - sample(RADIUS_X, -RADIUS_Y) + sample(-RADIUS_X, -RADIUS_Y)) / (4 * RADIUS_X * RADIUS_Y);
      for (let i = 0; i < position.count; i++) {
        const x = position.getX(i), y = position.getY(i);
        position.setZ(i, position.getZ(i) + THREE.MathUtils.clamp(xx*x*x + yy*y*y + xy*x*y, -.16, .16));
      }
    }
    position.needsUpdate = true;mesh.geometry.computeVertexNormals();mesh.geometry.computeBoundingSphere();
  }

  updatePuddle(p, dt) {
    p.age += Number.isFinite(dt) ? Math.max(0, dt) : 0;
    if (p.age >= LIFE) {p.mesh.visible = p.splash.visible = false;return;}
    p.mesh.material.opacity = Math.min(1, (LIFE - p.age) / 1.5);
    const spread = .72 + .28 * (1 - Math.exp(-p.age * 14));
    p.mesh.scale.set(spread, spread, 1);
    if (!p.splash.visible) return;
    let alive = false;
    for (let i = 0; i < p.count; i++) {
      const a = i * Math.PI * 2 / p.count + .3;
      const speed = (.65 + (i % 3) * .19)*p.severity, lift = (1.1 + (i % 3) * .19)*(.6+.4*p.severity), t = p.age;
      const z = .045 + lift * t + .5 * p.gravity.z * t * t;
      const visible = t < .65 && z > .02;
      alive ||= visible;
      this.transform.position.set(Math.cos(a) * (.07 + speed * t) + .5 * p.gravity.x * t * t,
        Math.sin(a) * (.07 + speed * t) + .5 * p.gravity.y * t * t, Math.max(.02, z));
      const radius = visible ? .022 + (i % 3) * .006 : 0;
      this.transform.scale.set(radius, radius, radius * 1.5);this.transform.updateMatrix();
      p.splash.setMatrixAt(i, this.transform.matrix);
    }
    p.splash.instanceMatrix.needsUpdate = true;p.splash.visible = alive;
  }

  update(dt) {for (const p of this.puddles) if (p.mesh.visible) this.updatePuddle(p, dt);}
  reset() {for (const p of this.puddles) p.mesh.visible = p.splash.visible = false;}
  setEnabled(value) {this.enabled = Boolean(value);if (!this.enabled) this.reset();}
  dispose() {
    if (this.disposed) return;this.disposed = true;
    for (const p of this.puddles) {
      p.mesh.removeFromParent();p.splash.removeFromParent();p.splash.dispose();
      p.mesh.material.dispose();p.splash.material.dispose();p.mesh.geometry.dispose();
    }
    this.geometry.dispose();this.dropGeometry.dispose();
  }
}
