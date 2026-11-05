import * as THREE from 'three';
import { resolveCameraClearance } from './CameraClearance.js';

const VALUES_PER_NODE = 11;

function applyPose(nodes, pose) {
  for (let i = 0, k = 0; i < nodes.length; i++, k += VALUES_PER_NODE) {
    const node = nodes[i];
    node.position.fromArray(pose, k);
    node.quaternion.fromArray(pose, k + 3);
    node.scale.fromArray(pose, k + 7);
    node.visible = Boolean(pose[k + 10]);
  }
  nodes[0]?.updateMatrixWorld(true);
}

/** Cinematic presentation of recorded visual poses, with live state untouched. */
export class HighlightPlayback {
  constructor({ camera, surface = null, getSurface = null, onFinish = null, onMoment = null, onEvent = null, onAdvance = null, onStop = null } = {}) {
    this.camera = camera;
    this.surface = surface;
    this.getSurface = getSurface;
    this.onFinish = onFinish;
    this.onMoment = onMoment;
    this.onEvent = onEvent;
    this.onAdvance = onAdvance;
    this.onStop = onStop;
    this.active = false;
    this._anchor = new THREE.Vector3();
    this._eye = new THREE.Vector3();
    this._direction = new THREE.Vector3();
    this._rotation = new THREE.Quaternion();
  }

  start(clips = []) {
    this.stop();
    this.clips = clips.filter(clip => clip?.nodes?.length && clip.duration > 0 && typeof clip.sample === 'function').slice(0, 3);
    if (!this.camera || !this.clips.length) return false;
    this.nodes = this.clips[0].nodes;
    if (this.clips.some(clip => clip.nodes !== this.nodes)) return false;
    // Exact original values (doubles), not rounded recorded values, for restoration.
    this.savedNodes = this.nodes.map(node => ({
      position: node.position.clone(), quaternion: node.quaternion.clone(), scale: node.scale.clone(), visible: node.visible,
    }));
    this.savedCamera = {
      position: this.camera.position.clone(), quaternion: this.camera.quaternion.clone(),
      up: this.camera.up.clone(), fov: this.camera.fov, zoom: this.camera.zoom,
    };
    this.pose = new Float32Array(this.clips[0].stride);
    this.active = true;
    this.index = 0;
    this._beginMoment();
    this._render();
    return true;
  }

  _beginMoment() {
    this.clip = this.clips[this.index];
    this.time = this.clip.start;
    this.eventIndex = 0;
    this._cameraCache = { minimumDistance: 2.2 };
    this.onMoment?.({ index: this.index, count: this.clips.length, points: this.clip.points, label: this.clip.label });
    this._events();
  }

  update(dt) {
    if (!this.active) return false;
    if (!Number.isFinite(dt) || dt < 0) return true;
    let remaining = dt;
    // Integrate across slow-motion boundaries; a long frame cannot skip an entire trick.
    while (remaining > 1e-8 && this.active) {
      const trick = this.time >= this.clip.trickStart && this.time < this.clip.trickEnd;
      const rate = trick ? 0.45 : 1;
      let boundary = this.time < this.clip.trickStart ? this.clip.trickStart
        : this.time < this.clip.trickEnd ? this.clip.trickEnd : this.clip.end;
      const nextEvent = this.clip.events?.[this.eventIndex];
      if (nextEvent && nextEvent.time > this.time) boundary = Math.min(boundary, nextEvent.time);
      const wallSeconds = Math.max(0, (boundary - this.time) / rate);
      if (remaining < wallSeconds) {
        const sourceDelta = remaining * rate;
        this.time += sourceDelta;
        this.onAdvance?.(sourceDelta);
        this._events();
        remaining = 0;
      } else {
        const sourceDelta = boundary - this.time;
        this.time = boundary;
        if (sourceDelta > 0) this.onAdvance?.(sourceDelta);
        this._events();
        remaining -= wallSeconds;
        if (this.time >= this.clip.end - 1e-8) {
          this.index++;
          if (this.index >= this.clips.length) {
            this.stop();
            this.onFinish?.();
            return false;
          }
          this._beginMoment();
        }
      }
    }
    if (this.active) this._render();
    return this.active;
  }

  _render() {
    if (!this.clip.sample(this.time, this.pose)) return;
    applyPose(this.nodes, this.pose);
    const progress = THREE.MathUtils.clamp((this.time - this.clip.start) / this.clip.duration, 0, 1);
    const action = this.time >= this.clip.trickStart && this.time <= this.clip.trickEnd;
    const root = this.nodes[0], visual = this.nodes[1] || root;
    root.getWorldPosition(this._anchor);
    this._anchor.y += 0.95;
    visual.getWorldQuaternion(this._rotation);
    this._direction.set(1, 0, 0).applyQuaternion(this._rotation);
    const heading = Math.atan2(this._direction.z, this._direction.x);
    const edits = [
      { angle: 0.8 + progress * 1.0, distance: 5.2 - progress * 1.1, height: 1.7 },
      { angle: -1.3 + progress * 0.5, distance: 4.7 - progress * 0.8, height: 0.65 + progress * 0.7 },
      { angle: 2.2 - progress * 0.7, distance: 5.0 - progress * 1.2, height: 2.2 - progress * 0.5 },
    ];
    const edit = edits[this.index % edits.length];
    // Keep both rider and board visible in narrow windows as the lens pushes in.
    const framing = Math.max(1, 0.95 / Math.max(0.35, this.camera.aspect || 1));
    const radius = edit.distance * framing;
    this._eye.set(Math.cos(heading + edit.angle) * radius, edit.height,
      Math.sin(heading + edit.angle) * radius).add(this._anchor);
    this.camera.position.copy(resolveCameraClearance(this.getSurface?.() || this.surface,
      this._anchor, this._eye, this.camera.position, this._cameraCache));
    this.camera.up.set(0, 1, 0);
    this.camera.lookAt(this._anchor);
    const fov = action ? 46 : 54 - 5 * Math.sin(progress * Math.PI);
    if (Math.abs(this.camera.fov - fov) > 1e-4) {
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
    }
  }

  _events() {
    const events=this.clip.events||[];
    while(this.eventIndex<events.length&&events[this.eventIndex].time<=this.time)
      this.onEvent?.(events[this.eventIndex++]);
  }

  stop() {
    if (!this.active) return false;
    for (let i = 0; i < this.nodes.length; i++) {
      const node = this.nodes[i], original = this.savedNodes[i];
      node.position.copy(original.position);
      node.quaternion.copy(original.quaternion);
      node.scale.copy(original.scale);
      node.visible = original.visible;
    }
    this.nodes[0]?.updateMatrixWorld(true);
    const original = this.savedCamera;
    this.camera.position.copy(original.position);
    this.camera.quaternion.copy(original.quaternion);
    this.camera.up.copy(original.up);
    this.camera.fov = original.fov;
    this.camera.zoom = original.zoom;
    this.camera.updateProjectionMatrix();
    this.active = false;
    this.savedNodes = null;
    this.savedCamera = null;
    this.pose = null;
    this.onStop?.();
    return true;
  }
}
