// Follow camera with three framings (C / R3 cycles). Mouse drag or the right
// stick orbits; it drifts back behind the rider when released. On vert airs it
// keeps the pre-launch heading so the view doesn't whip around.
import * as THREE from 'three';
import type { Skater } from '../skater/Skater';
import type { InputFrame } from '../input/Input';

export const CAMERA_MODES = [
  { name: 'Follow', distance: 5.4, height: 2.1, lookHeight: 1.0, fov: 62 },
  { name: 'Follow Close', distance: 3.8, height: 1.5, lookHeight: 1.0, fov: 66 },
  { name: 'Follow Low', distance: 4.6, height: 0.8, lookHeight: 0.9, fov: 70 },
] as const;

export class FollowCamera {
  mode = 0;
  private heading = new THREE.Vector3(0, 0, -1);
  private orbitYaw = 0;
  private orbitPitch = 0;
  private target = new THREE.Vector3();
  private desired = new THREE.Vector3();
  private flat = new THREE.Vector3();
  private initialised = false;

  constructor(readonly camera: THREE.PerspectiveCamera) {
    try { this.mode = Math.min(CAMERA_MODES.length - 1, Math.max(0, Number(localStorage.getItem('chimphawk.cameraMode')) || 0)); } catch { /* ignore */ }
  }

  cycle(): string {
    this.mode = (this.mode + 1) % CAMERA_MODES.length;
    try { localStorage.setItem('chimphawk.cameraMode', String(this.mode)); } catch { /* ignore */ }
    return CAMERA_MODES[this.mode].name;
  }

  update(skater: Skater, position: THREE.Vector3, input: InputFrame | null, dt: number): void {
    const m = CAMERA_MODES[this.mode];
    // Heading: travel direction on the ground/grind; frozen during vert airs.
    const vert = skater.state === 'air' && !!skater.air?.vertNormal;
    if (!vert && skater.state !== 'bail') {
      const source = skater.state === 'air' ? skater.velocity : skater.forward;
      this.flat.set(source.x, 0, source.z);
      if (this.flat.lengthSq() > 0.04) {
        this.flat.normalize();
        const rate = skater.state === 'air' ? 2.5 : 5;
        this.heading.lerp(this.flat, 1 - Math.exp(-rate * dt)).normalize();
      }
    }

    if (input) {
      if (input.cameraActive) {
        this.orbitYaw -= (input.mouseDX * 0.005) + input.cameraX * 2.4 * dt;
        this.orbitPitch = THREE.MathUtils.clamp(this.orbitPitch + input.mouseDY * 0.004 + input.cameraY * 1.6 * dt, -0.35, 0.9);
      } else {
        this.orbitYaw = THREE.MathUtils.damp(this.orbitYaw, 0, 2.2, dt);
        this.orbitPitch = THREE.MathUtils.damp(this.orbitPitch, 0, 2.2, dt);
      }
    }

    const behind = this.flat.copy(this.heading).applyAxisAngle(THREE.Object3D.DEFAULT_UP, this.orbitYaw).negate();
    this.target.copy(position).y += m.lookHeight;
    this.desired.copy(this.target).addScaledVector(behind, m.distance * Math.cos(this.orbitPitch));
    this.desired.y += m.height - m.lookHeight + m.distance * Math.sin(this.orbitPitch);
    this.desired.y = Math.max(this.desired.y, 0.4);

    if (!this.initialised) { this.camera.position.copy(this.desired); this.initialised = true; }
    this.camera.position.lerp(this.desired, 1 - Math.exp(-8 * dt));
    if (Math.abs(this.camera.fov - m.fov) > 0.01) { this.camera.fov = THREE.MathUtils.damp(this.camera.fov, m.fov, 6, dt); this.camera.updateProjectionMatrix(); }
    this.camera.lookAt(this.target);
  }
}
