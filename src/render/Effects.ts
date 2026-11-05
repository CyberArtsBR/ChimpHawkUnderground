// Pooled GPU particles: one Points draw call for every effect. No allocation
// after construction; dead particles are recycled ring-buffer style.
import * as THREE from 'three';
import type { Skater, SkaterEvent } from '../skater/Skater';

const MAX = 1400;

const vertex = /* glsl */`
  attribute float size;
  attribute vec4 tint;
  varying vec4 vTint;
  void main() {
    vTint = tint;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = size * (300.0 / -mv.z);
    gl_Position = projectionMatrix * mv;
  }`;
const fragment = /* glsl */`
  varying vec4 vTint;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float d = dot(c, c);
    if (d > 0.25) discard;
    float a = vTint.a * smoothstep(0.25, 0.0, d);
    gl_FragColor = vec4(vTint.rgb * a, a);
  }`;

type Kind = 'spark' | 'dust' | 'burst';

export class Effects {
  readonly points: THREE.Points;
  private pos = new Float32Array(MAX * 3);
  private vel = new Float32Array(MAX * 3);
  private life = new Float32Array(MAX);
  private maxLife = new Float32Array(MAX);
  private baseSize = new Float32Array(MAX);
  private size = new Float32Array(MAX);
  private tint = new Float32Array(MAX * 4);
  private color = new Float32Array(MAX * 3);
  private drag = new Float32Array(MAX);
  private gravity = new Float32Array(MAX);
  private next = 0;
  private sparkTimer = 0;
  private tmpColor = new THREE.Color();

  constructor() {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    geometry.setAttribute('size', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    geometry.setAttribute('tint', new THREE.BufferAttribute(this.tint, 4).setUsage(THREE.DynamicDrawUsage));
    geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
    const material = new THREE.ShaderMaterial({
      vertexShader: vertex, fragmentShader: fragment,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    this.points = new THREE.Points(geometry, material);
    this.points.frustumCulled = false;
    this.points.name = 'Effects';
  }

  private spawn(kind: Kind, x: number, y: number, z: number, vx: number, vy: number, vz: number, color: number, life: number, size: number): void {
    const i = this.next;
    this.next = (this.next + 1) % MAX;
    this.pos.set([x, y, z], i * 3);
    this.vel.set([vx, vy, vz], i * 3);
    this.life[i] = life; this.maxLife[i] = life; this.baseSize[i] = size;
    this.tmpColor.setHex(color);
    // Sparks and the burst feed the bloom pass; dust stays dim.
    const boost = kind === 'dust' ? 0.35 : kind === 'spark' ? 2.2 : 1.6;
    this.color.set([this.tmpColor.r * boost, this.tmpColor.g * boost, this.tmpColor.b * boost], i * 3);
    this.drag[i] = kind === 'dust' ? 2.2 : kind === 'spark' ? 0.4 : 1.4;
    this.gravity[i] = kind === 'dust' ? -0.4 : kind === 'spark' ? 14 : 3;
  }

  handle(event: SkaterEvent, skater: Skater): void {
    const p = skater.position;
    if (event.type === 'land' && event.impact > 1.5) {
      const count = Math.min(40, 8 + Math.round(event.impact * 3));
      for (let k = 0; k < count; k++) {
        const a = Math.random() * Math.PI * 2, s = 0.6 + Math.random() * (0.6 + event.impact * 0.15);
        this.spawn('dust', p.x, p.y + 0.05, p.z, Math.cos(a) * s, 0.2 + Math.random() * 0.6, Math.sin(a) * s, 0xd8cfc2, 0.7 + Math.random() * 0.5, 0.35 + Math.random() * 0.35);
      }
    }
    if (event.type === 'bail') {
      for (let k = 0; k < 30; k++) {
        const a = Math.random() * Math.PI * 2;
        this.spawn('dust', p.x, p.y + 0.2, p.z, Math.cos(a) * 2, Math.random() * 1.5, Math.sin(a) * 2, 0xcfc6ba, 1 + Math.random() * 0.5, 0.5);
      }
    }
    if (event.type === 'bank') {
      const palette = [0xff3d8b, 0x7edcff, 0xffd23f, 0xb46cff];
      const count = Math.min(160, 30 + Math.round(event.points / 60));
      for (let k = 0; k < count; k++) {
        const a = Math.random() * Math.PI * 2, up = Math.random();
        const s = 2.5 + Math.random() * 3.5;
        this.spawn('burst', p.x, p.y + 1.1, p.z, Math.cos(a) * s * (1 - up * 0.5), 2 + up * 4, Math.sin(a) * s * (1 - up * 0.5),
          palette[k % palette.length], 0.9 + Math.random() * 0.6, 0.12 + Math.random() * 0.1);
      }
    }
  }

  update(skater: Skater, dt: number): void {
    // Continuous grind sparks on metal; concrete ledges throw a little grit.
    if (skater.grind) {
      const metal = skater.grind.rail.type !== 'ledge';
      this.sparkTimer += dt * (metal ? 140 : 35) * Math.min(1.5, 0.3 + skater.grind.speed / 10);
      const f = skater.forward, p = skater.position;
      while (this.sparkTimer >= 1) {
        this.sparkTimer -= 1;
        const spread = 1.6;
        const back = -(2 + Math.random() * 3);
        this.spawn(metal ? 'spark' : 'dust', p.x, p.y + 0.02, p.z,
          f.x * back + (Math.random() - 0.5) * spread, 0.5 + Math.random() * 2.2, f.z * back + (Math.random() - 0.5) * spread,
          metal ? (Math.random() < 0.7 ? 0xffb347 : 0xfff1a8) : 0xbdb6aa, metal ? 0.25 + Math.random() * 0.3 : 0.5, metal ? 0.09 + Math.random() * 0.06 : 0.18);
      }
    }

    for (let i = 0; i < MAX; i++) {
      if (this.life[i] <= 0) { this.tint[i * 4 + 3] = 0; this.size[i] = 0; continue; }
      this.life[i] -= dt;
      const k = Math.max(0, 1 - this.drag[i] * dt);
      this.vel[i * 3] *= k; this.vel[i * 3 + 2] *= k;
      this.vel[i * 3 + 1] = this.vel[i * 3 + 1] * k - this.gravity[i] * dt;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] = Math.max(0.01, this.pos[i * 3 + 1] + this.vel[i * 3 + 1] * dt);
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      const t = Math.max(0, this.life[i] / this.maxLife[i]);
      this.size[i] = this.baseSize[i] * (this.gravity[i] < 0 ? 1.8 - t * 0.8 : 0.6 + t * 0.4);
      this.tint[i * 4] = this.color[i * 3]; this.tint[i * 4 + 1] = this.color[i * 3 + 1]; this.tint[i * 4 + 2] = this.color[i * 3 + 2];
      this.tint[i * 4 + 3] = t * (this.gravity[i] < 0 ? 0.45 : 1);
    }
    const g = this.points.geometry;
    g.attributes.position.needsUpdate = true;
    g.attributes.size.needsUpdate = true;
    g.attributes.tint.needsUpdate = true;
  }
}
