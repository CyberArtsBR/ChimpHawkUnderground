// Skate camera, ported from v1's FollowCamera / THPS_CAMERA tuning.
// Modes (C / R3 cycles): Follow (high THPS framing), Follow Close, Follow Low,
// Classic (low chase that goes overhead on vert) and Fixed (world-axis shot).
// Direction changes are angular, and a near-180° reversal (a quarter-pipe
// return) turns slowly so the view never whips around.
import * as THREE from 'three';
import type { Skater } from '../skater/Skater';
import type { InputFrame } from '../input/Input';
import type { PhysicsWorld } from '../physics/PhysicsWorld';

export const CAMERA_MODES = ['follow', 'follow-close', 'follow-low', 'classic', 'fixed'] as const;
export type CameraMode = typeof CAMERA_MODES[number];
export const CAMERA_LABELS: Record<CameraMode, string> = {
  follow: 'Follow', 'follow-close': 'Follow Close', 'follow-low': 'Follow Low', classic: 'Classic', fixed: 'Fixed',
};

/** v1 THPS_CAMERA values (metres / per-second rates). */
export const CAM = {
  distance: 5.8, height: 1.55, anchorHeight: 1.15, targetHeight: 1.0,
  airDistance: 6.5, airHeight: 2.2,
  classicVertDistance: 3.6, classicVertHeight: 4.4,
  classicGrindZoom: 0.94, classicTrickZoom: 0.92,
  contextFollowRate: 5,
  directionFollowRate: 4.2, reverseDirectionFollowRate: 0.82, reverseDotThreshold: -0.18,
  maximumYawRate: 3.6,
  positionFollowRate: 7.5, highSpeedFollowGain: 0.48, highSpeedFollowCap: 9,
  verticalFollowRate: 8.5, vertVerticalFollowRate: 13, maximumFollowLag: 1.4,
  targetFollowRate: 8.5, fastAimRateGain: 0.14, maximumAimLag: 1.35,
  speedLookAheadGain: 0.065, speedLookAheadCap: 0.85, fastLookAheadGain: 0.07, fastLookAheadCap: 1.25,
  baseFov: 62, highSpeedFovGain: 0.14, highSpeedFovCap: 3.5,
  occlusionReleaseRate: 4, minimumArm: 2.35,
  landingHoldTime: 0.9,
} as const;

/** v1 high Follow framing (the THPS look: high and behind). */
export function highFollowFraming(state: { grounded: boolean; returning: boolean; wallride: boolean; speed: number }) {
  if (state.returning) return { distance: 10.9, height: 5.3, lookAhead: 1.4 };
  const lead = Math.min(CAM.speedLookAheadCap, Math.max(0, state.speed) * CAM.speedLookAheadGain);
  if (state.wallride) return { distance: 10.0, height: 6.1, lookAhead: 0.8 + lead };
  if (state.grounded) return { distance: 8.5, height: 4.9, lookAhead: 0.55 + lead };
  return { distance: 9.8, height: 5.5, lookAhead: 0.75 + lead };
}

function wrapAngle(a: number): number {
  let r = (a + Math.PI) % (Math.PI * 2);
  if (r < 0) r += Math.PI * 2;
  return r - Math.PI;
}

/** Angular interpolation of a horizontal direction; avoids the vector-lerp flip at 180°. */
export function smoothDirection(current: THREE.Vector3, target: THREE.Vector3, dt: number, rate: number, maxYawRate: number): THREE.Vector3 {
  const from = Math.atan2(current.x, current.z);
  const to = Math.atan2(target.x, target.z);
  const delta = wrapAngle(to - from);
  const step = THREE.MathUtils.clamp(delta * (1 - Math.exp(-rate * dt)), -maxYawRate * dt, maxYawRate * dt);
  const angle = from + step;
  return current.set(Math.sin(angle), 0, Math.cos(angle));
}

const UP = new THREE.Vector3(0, 1, 0);

export class FollowCamera {
  mode: CameraMode = 'follow';
  private direction = new THREE.Vector3(0, 0, -1);
  private fixedDirection = new THREE.Vector3(0, 0, -1);
  private center = new THREE.Vector3();
  private aim = new THREE.Vector3();
  private distance: number = CAM.distance;
  private height: number = CAM.height;
  private lookAhead = 0;
  private zoom = 1;
  private lookYaw = 0;
  private lookTilt = 0;
  private returnHold = 0;
  private occlusion: number | null = null;
  private wasVert = false;
  private initialized = false;

  constructor(readonly camera: THREE.PerspectiveCamera, private world: PhysicsWorld | null = null) {
    try {
      const saved = localStorage.getItem('chimphawk.cameraMode');
      if (saved && (CAMERA_MODES as readonly string[]).includes(saved)) this.mode = saved as CameraMode;
    } catch { /* ignore */ }
  }

  cycle(): string {
    this.mode = CAMERA_MODES[(CAMERA_MODES.indexOf(this.mode) + 1) % CAMERA_MODES.length];
    try { localStorage.setItem('chimphawk.cameraMode', this.mode); } catch { /* ignore */ }
    if (this.mode === 'fixed') this.fixedDirection.copy(this.direction);
    return CAMERA_LABELS[this.mode];
  }

  update(skater: Skater, position: THREE.Vector3, input: InputFrame | null, dt: number): void {
    dt = Math.min(0.1, Math.max(1e-4, dt));
    const first = !this.initialized;
    const grounded = skater.state === 'ground' || skater.state === 'manual';
    const grinding = skater.state === 'grind';
    const vert = skater.state === 'air' && !!skater.air?.vertNormal && !skater.air.released;
    const wallride = !!skater.air?.wall;
    const horizontalSpeed = skater.state === 'air' ? Math.hypot(skater.velocity.x, skater.velocity.z)
      : grinding ? skater.grind!.speed : skater.speed;
    const highFollow = this.mode === 'follow' || this.mode === 'follow-close' || this.mode === 'follow-low';
    const classic = this.mode !== 'fixed';

    // Travel direction; held still through vert airs, reversals turn slowly afterwards.
    if (this.wasVert && !vert) this.returnHold = CAM.landingHoldTime;
    this.wasVert = vert;
    this.returnHold = Math.max(0, this.returnHold - dt);
    const travel = new THREE.Vector3();
    if (skater.state === 'air') travel.set(skater.velocity.x, 0, skater.velocity.z);
    else travel.set(skater.forward.x, 0, skater.forward.z);
    if (first) {
      if (travel.lengthSq() > 1e-4) this.direction.copy(travel.normalize());
      this.fixedDirection.copy(this.direction);
    } else if (!vert && skater.state !== 'bail' && travel.lengthSq() > 0.04) {
      travel.normalize();
      const reversing = travel.dot(this.direction) < CAM.reverseDotThreshold;
      const rate = reversing ? CAM.reverseDirectionFollowRate : CAM.directionFollowRate;
      smoothDirection(this.direction, travel, dt, this.returnHold > 0 && reversing ? rate * 0.6 : rate, CAM.maximumYawRate);
    }

    // Framing for the current mode and moment.
    const returning = vert || this.returnHold > 0;
    let distance: number, height: number, baseLead: number;
    if (highFollow) {
      const f = highFollowFraming({ grounded: grounded || grinding, returning, wallride, speed: horizontalSpeed });
      distance = f.distance; height = f.height; baseLead = f.lookAhead;
    } else if (classic) {
      distance = vert ? CAM.classicVertDistance : grounded || grinding ? CAM.distance : CAM.airDistance;
      height = vert ? CAM.classicVertHeight : grounded || grinding ? CAM.height : CAM.airHeight;
      baseLead = vert ? 0 : 0.55;
    } else {
      distance = CAM.distance; height = CAM.height; baseLead = 0;
    }
    const trick = !!(skater.air?.flip || skater.air?.grab);
    const zoomTarget = this.mode === 'classic' ? (trick ? CAM.classicTrickZoom : grinding ? CAM.classicGrindZoom : 1) : 1;
    const blend = first ? 1 : 1 - Math.exp(-CAM.contextFollowRate * dt);
    this.zoom = THREE.MathUtils.lerp(this.zoom, zoomTarget, blend);
    this.distance = THREE.MathUtils.lerp(this.distance, distance * this.zoom, blend);
    this.height = THREE.MathUtils.lerp(this.height, height, blend);

    // Tripod follows the rider with a little lag (more vertical stiffness on vert).
    if (first) this.center.copy(position);
    else {
      const h = 1 - Math.exp(-(CAM.positionFollowRate + Math.min(CAM.highSpeedFollowCap, horizontalSpeed * CAM.highSpeedFollowGain)) * dt);
      const v = 1 - Math.exp(-(vert ? CAM.vertVerticalFollowRate : CAM.verticalFollowRate) * dt);
      this.center.x += (position.x - this.center.x) * h;
      this.center.z += (position.z - this.center.z) * h;
      this.center.y += (position.y - this.center.y) * v;
      const lag = this.center.clone().sub(position);
      if (lag.length() > CAM.maximumFollowLag) this.center.copy(position).add(lag.setLength(CAM.maximumFollowLag));
    }

    // Player look-around (mouse drag / right stick), drifting back when released.
    if (input && this.mode !== 'fixed') {
      if (input.cameraActive) {
        this.lookYaw -= input.mouseDX * 0.005 + input.cameraX * 2.4 * dt;
        this.lookTilt = THREE.MathUtils.clamp(this.lookTilt + input.mouseDY * 0.002 + input.cameraY * 0.8 * dt, -0.35, 0.6);
      } else {
        this.lookYaw = THREE.MathUtils.damp(this.lookYaw, 0, 2.2, dt);
        this.lookTilt = THREE.MathUtils.damp(this.lookTilt, 0, 2.2, dt);
      }
    }

    const view = (this.mode === 'fixed' ? this.fixedDirection : this.direction).clone();
    if (classic) view.applyAxisAngle(UP, this.lookYaw);
    const fastLead = Math.min(CAM.fastLookAheadCap, Math.max(0, horizontalSpeed - 12) * CAM.fastLookAheadGain);
    const leadTarget = classic ? baseLead + (returning ? 0 : fastLead * (highFollow ? 1 : 0.45)) : 0;
    this.lookAhead = THREE.MathUtils.lerp(this.lookAhead, leadTarget, first ? 1 : 1 - Math.exp(-8 * dt));

    let frameDistance = this.distance;
    let frameHeight = this.height + (classic ? this.lookTilt * 3 : 0);
    if (this.mode === 'follow-close' || this.mode === 'follow-low') {
      // Same viewing angle, 28% closer; Low also drops the eye (v1).
      const scale = 0.72;
      frameDistance = Math.max(2.6, (frameDistance + this.lookAhead) * scale - this.lookAhead);
      const rise = frameHeight + CAM.anchorHeight - CAM.targetHeight;
      frameHeight = rise * (this.mode === 'follow-low' ? 0.38 : scale) - CAM.anchorHeight + CAM.targetHeight;
    }
    const anchor = this.center.clone().addScaledVector(UP, CAM.anchorHeight);
    const desired = anchor.clone().addScaledVector(view, -frameDistance).addScaledVector(UP, frameHeight);
    const target = this.center.clone().addScaledVector(UP, CAM.targetHeight).addScaledVector(view, this.lookAhead);

    if (first) this.aim.copy(target);
    else {
      this.aim.lerp(target, 1 - Math.exp(-(CAM.targetFollowRate + Math.min(5, horizontalSpeed * CAM.fastAimRateGain)) * dt));
      const aimLag = this.aim.distanceTo(target);
      if (aimLag > CAM.maximumAimLag) this.aim.lerp(target, 1 - CAM.maximumAimLag / aimLag);
    }

    // Clearance: walls and roofs between rider and camera pull the camera in
    // at once, and release smoothly.
    const riderAnchor = position.clone().addScaledVector(UP, CAM.anchorHeight);
    const toCamera = desired.clone().sub(riderAnchor);
    const wanted = toCamera.length();
    let clear = wanted;
    if (this.world && wanted > 1e-3) {
      const hit = this.world.raycast(riderAnchor, toCamera.clone().normalize(), wanted);
      if (hit) clear = Math.max(Math.min(CAM.minimumArm, wanted), hit.distance - 0.3);
    }
    if (this.occlusion === null || clear < this.occlusion) this.occlusion = clear;
    else this.occlusion = THREE.MathUtils.lerp(this.occlusion, clear, 1 - Math.exp(-CAM.occlusionReleaseRate * dt));
    const eye = riderAnchor.addScaledVector(toCamera.normalize(), Math.min(wanted, this.occlusion));
    this.camera.position.copy(eye);
    this.camera.lookAt(this.aim);

    // Lens opens a little at speed (not in Fixed).
    const fov = CAM.baseFov + (this.mode === 'fixed' ? 0 : Math.min(CAM.highSpeedFovCap, Math.max(0, horizontalSpeed - 12) * CAM.highSpeedFovGain));
    if (Math.abs(this.camera.fov - fov) > 0.05) {
      this.camera.fov = first ? fov : THREE.MathUtils.lerp(this.camera.fov, fov, 1 - Math.exp(-5 * dt));
      this.camera.updateProjectionMatrix();
    }
    this.initialized = true;
  }
}
