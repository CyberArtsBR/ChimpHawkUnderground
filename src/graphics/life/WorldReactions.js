import * as THREE from 'three';
import { surfaceTagFor } from '../../game/SurfaceAudio.js';

/**
 * World Life reaction events (2026-11). Watches the skater once per simulated
 * frame and turns state edges into small events the park's life can react to
 * (a landing rattles a fence, a grind start makes a bird look up...).
 * Presentation only: reads skater state, never writes it.
 *
 * Kinds and payloads (payload objects are reused every time: copy what you keep):
 *   'landing'    { point, severity: 0..1, surface }
 *   'pop'        { point }
 *   'grindStart' { point, material }
 *   'grindEnd'   { point }
 *   'bail'       { point, speed }
 *
 * Nothing fires on the first update after construction/reset, on a frame where
 * `respawnSerial` changes, or when the rider jumps more than 2 m in one frame
 * (any teleport). While `skater.bailTime > 0` only the 'bail' edge fires.
 * Exception: every 'grindStart' gets exactly one 'grindEnd', also when a bail,
 * respawn, teleport or reset() ends the grind (it fires on the next update).
 */
export const REACTION_KINDS = Object.freeze(['landing', 'pop', 'grindStart', 'grindEnd', 'bail']);
const TELEPORT_DISTANCE_SQ = 4;

export class WorldReactions {
  constructor() {
    this.listeners = new Map(REACTION_KINDS.map(kind => [kind, []]));
    this.payloads = {
      landing: { point: new THREE.Vector3(), severity: 0, surface: 'neutral' },
      pop: { point: new THREE.Vector3() },
      grindStart: { point: new THREE.Vector3(), material: 'neutral' },
      grindEnd: { point: new THREE.Vector3() },
      bail: { point: new THREE.Vector3(), speed: 0 },
    };
    this.primed = false;
    this.grounded = true;
    this.grind = false;
    this.openGrind = false; // a grindStart was emitted and its grindEnd not yet
    this.pop = false;
    this.impact = null;
    this.respawn = 0;
    this.lastPosition = new THREE.Vector3();
  }

  /** Subscribe to one kind; returns the unsubscribe function. */
  on(kind, fn) {
    if (!this.listeners.has(kind)) throw new Error(`Unknown world reaction "${kind}"`);
    if (typeof fn !== 'function') throw new TypeError('World reaction listener must be a function');
    // Copy-on-write: emitting iterates the old array, so unsubscribing inside a listener is safe.
    this.listeners.set(kind, [...this.listeners.get(kind), fn]);
    return () => { this.listeners.set(kind, this.listeners.get(kind).filter(f => f !== fn)); };
  }

  emit(kind) {
    const list = this.listeners.get(kind), payload = this.payloads[kind];
    for (let i = 0; i < list.length; i++) list[i](payload);
  }

  /** Forget the previous frame, so the next update only records state. */
  reset() { this.primed = false; }

  update(skater) {
    if (!skater?.position) return;
    const grounded = Boolean(skater.grounded);
    const grind = Boolean(skater.grind);
    const pop = (skater.presentation?.popTime || 0) > 0;
    const impact = skater.rider?.ragdoll?.groundImpact || null;
    const respawn = skater.respawnSerial || 0;
    const teleported = !this.primed || respawn !== this.respawn ||
      this.lastPosition.distanceToSquared(skater.position) > TELEPORT_DISTANCE_SQ;

    const p = skater.position;
    const bailing = skater.bailTime > 0;
    // An open grind always closes, whatever ended it (grind off, bail, respawn,
    // teleport, reset): no listener is ever left mid-grind.
    if (this.openGrind && (teleported || bailing || !grind)) {
      this.openGrind = false;
      this.payloads.grindEnd.point.copy(p);
      this.emit('grindEnd');
    }
    if (!teleported) {
      if (impact && impact !== this.impact) {
        const bail = this.payloads.bail;
        bail.point.copy(impact.point?.isVector3 ? impact.point : p);
        bail.speed = Math.max(0, Number(impact.speed) || 0);
        this.emit('bail');
      }
      if (!bailing) {
        if (grounded && !this.grounded && !grind) {
          const landing = this.payloads.landing;
          landing.point.copy(p);
          landing.severity = Math.min(1, Math.max(0, Number(skater.presentation?.landingSeverity) || 0));
          landing.surface = surfaceTagFor(skater);
          this.emit('landing');
        }
        if (pop && !this.pop) { this.payloads.pop.point.copy(p); this.emit('pop'); }
        if (grind && !this.grind) {
          const start = this.payloads.grindStart;
          start.point.copy(p);
          start.material = surfaceTagFor(skater);
          this.openGrind = true;
          this.emit('grindStart');
        }
      }
    }
    this.primed = true;
    this.grounded = grounded; this.grind = grind; this.pop = pop;
    this.impact = impact; this.respawn = respawn;
    this.lastPosition.copy(skater.position);
  }
}
