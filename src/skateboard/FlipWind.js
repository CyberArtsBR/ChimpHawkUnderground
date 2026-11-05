import * as THREE from 'three';
import { FLIP_TIMING } from '../character/TrickMotion.js';

// Short, world-space histories trace the rotating deck's opposite corners.
// Fixed storage keeps the effect bounded even during long trick chains.
export class FlipWind {
  constructor(root) {
    this.root = root;
    this.samples = [];
    this.positions = new Float32Array(32 * 2 * 2 * 3);
    this.colors = new Float32Array(this.positions.length);
    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3).setUsage(THREE.DynamicDrawUsage));
    this.geometry.setAttribute('color', new THREE.BufferAttribute(this.colors, 3).setUsage(THREE.DynamicDrawUsage));
    this.material = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.65, depthWrite: false, blending: THREE.AdditiveBlending });
    this.lines = new THREE.LineSegments(this.geometry, this.material);
    this.lines.name = 'flip-wind';
    this.lines.frustumCulled = false;
    root.add(this.lines);
    this.point = new THREE.Vector3();
    this.inverse = new THREE.Matrix4();
    this.reset();
  }

  reset() {
    this.samples.length = 0;
    this.geometry.setDrawRange(0, 0);
    this.lines.visible = false;
  }

  update(flip, airborne, bail, dt) {
    if (bail || !airborne || dt > 0.15) { this.reset(); return; }
    const step = Math.max(0, dt);
    for (const sample of this.samples) sample.age += step;
    while (this.samples.length && this.samples[0].age > 0.16) this.samples.shift();
    this.root.updateWorldMatrix(true, false);
    const active = flip && flip.progress > 0.14 && flip.progress < FLIP_TIMING.rotationEnd;
    if (active && step > 0) {
      const points = [-1, 1].map(sign => this.root.localToWorld(new THREE.Vector3(sign * 0.12, 0.015, sign * 0.46)));
      if (this.samples.length && points[0].distanceTo(this.samples.at(-1).points[0]) > 3) this.reset();
      this.samples.push({ age: 0, points });
      if (this.samples.length > 33) this.samples.shift();
    }
    this.inverse.copy(this.root.matrixWorld).invert();
    let index = 0;
    for (let i = 1; i < this.samples.length; i++) for (let edge = 0; edge < 2; edge++) {
      for (const sample of [this.samples[i - 1], this.samples[i]]) {
        this.point.copy(sample.points[edge]).applyMatrix4(this.inverse).toArray(this.positions, index);
        const fade = Math.pow(Math.max(0, 1 - sample.age / 0.16), 2);
        this.colors[index] = fade * 0.65;
        this.colors[index + 1] = fade * 0.86;
        this.colors[index + 2] = fade;
        index += 3;
      }
    }
    this.geometry.setDrawRange(0, index / 3);
    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.attributes.color.needsUpdate = true;
    this.lines.visible = index > 0;
  }
}
