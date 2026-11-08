import * as THREE from 'three';
import { WorldReactions } from './WorldReactions.js';
import { LifeAudio } from './LifeAudio.js';

/**
 * World Life director (2026-11): the one object game-main talks to for the
 * per-park life modules. Presentation only: no physics, collision or scoring.
 *
 * Module contract:
 *   { parks: string[] | '*', root: Group, setWorld(world, ctx), setQuality(settings),
 *     update(dt, skater, camera, ctx), reset(), dispose() }
 * ctx = { reactions, audio, anchors, scan, surface, reducedMotion, density: 0|0.5|1 }.
 * The ctx object is reused and refreshed before every call: read its fields
 * each time, never cache them (MapDressing builds anchors/scan asynchronously,
 * after setWorld).
 *
 * Only modules whose `parks` include the world id (or '*') are active: their
 * roots sit under `root`, and only they get setWorld/update. A module leaving
 * the active set is reset and its root removed from the tree.
 */
const EMPTY_ANCHORS = Object.freeze({ poles: Object.freeze([]), lamps: Object.freeze([]), strings: Object.freeze([]) });

export function lifeDensity(settings) {
  if (settings?.name === 'performance') return 0;
  return Number(settings?.vfxScale) < 1 ? .5 : 1;
}

export class LifeDirector {
  constructor(scene = null, { skateAudio = null, mapDressing = null } = {}) {
    this.root = new THREE.Group();
    this.root.name = 'World life';
    scene?.add(this.root);
    this.mapDressing = mapDressing;
    this.reactions = new WorldReactions();
    this.audio = new LifeAudio(skateAudio);
    this.modules = [];
    this.active = [];
    this.world = null;
    this.skater = null;
    this.settings = null;
    this.density = 1;
    this.enabled = true;
    const query = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)');
    this.reducedMotion = Boolean(query?.matches);
    query?.addEventListener?.('change', event => { this.reducedMotion = Boolean(event.matches); });
    this.ctx = {
      reactions: this.reactions, audio: this.audio, anchors: EMPTY_ANCHORS, scan: null, surface: null,
      reducedMotion: this.reducedMotion, density: this.density,
    };
  }

  matches(module, world = this.world) {
    if (!world) return false;
    return module.parks === '*' || (Array.isArray(module.parks) && module.parks.includes(world.id));
  }

  refreshContext(skater = this.skater) {
    const ctx = this.ctx;
    ctx.anchors = this.mapDressing?.anchors || EMPTY_ANCHORS;
    ctx.scan = this.mapDressing?.scan || null;
    ctx.surface = skater?.surface || null;
    ctx.reducedMotion = this.reducedMotion;
    ctx.density = this.density;
    return ctx;
  }

  register(module) {
    if (!module || this.modules.includes(module)) return;
    this.modules.push(module);
    if (this.settings) module.setQuality?.(this.settings);
    if (this.matches(module)) this.activate(module);
  }

  activate(module) {
    this.active.push(module);
    if (module.root) this.root.add(module.root);
    module.setWorld?.(this.world, this.refreshContext());
  }

  /** `skater` is optional: it supplies ctx.surface when the park changes before the next update. */
  setWorld(world, skater = this.skater) {
    if (skater) this.skater = skater;
    this.world = world || null;
    this.reactions.reset();
    this.audio.stop();
    for (const module of this.active) {
      if (this.matches(module)) continue;
      module.reset?.();
      module.root?.removeFromParent();
    }
    this.active = [];
    for (const module of this.modules) if (this.matches(module)) this.activate(module);
  }

  setQuality(settings) {
    const wasEnabled = this.enabled;
    this.settings = settings || null;
    this.density = lifeDensity(this.settings);
    this.enabled = this.density > 0;
    this.root.visible = this.enabled;
    for (const module of this.modules) module.setQuality?.(settings);
    if (!this.enabled) {
      this.audio.stop();
      for (const module of this.active) module.reset?.();
    } else if (!wasEnabled) this.reactions.reset();
  }

  /** Call only from the simulating block (never during highlight replays). */
  update(delta, skater, camera) {
    if (!this.enabled || !this.world || !skater) return;
    const dt = Math.min(.05, Math.max(0, Number(delta) || 0));
    this.skater = skater;
    this.audio.setListener(camera);
    this.reactions.update(skater);
    const ctx = this.refreshContext(skater);
    for (let i = 0; i < this.active.length; i++) this.active[i].update?.(dt, skater, camera, ctx);
  }

  /** A fresh run / reset: forget reaction state, silence life voices, reset active modules. */
  reset() {
    this.reactions.reset();
    this.audio.stop();
    for (const module of this.active) module.reset?.();
  }
}
