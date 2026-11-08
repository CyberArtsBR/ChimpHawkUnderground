import * as THREE from 'three';
import { Pigeon, pigeonMaterials, looseFeatherGeometry } from './Pigeon.js';
import { keepClearOfRider } from './life/lifeAnchors.js';

/**
 * Ambient world life (2026-11 enhancement pass). Presentation only: nothing
 * here touches physics, scoring or collision.
 *  - Pigeon flocks (see Pigeon.js) walk, peck and coo on flat ground near the
 *    rider, then take off in a staggered burst when the rider lands close by
 *    or rolls through them, sometimes shedding a loose feather. A slow rider
 *    only makes them hop aside; a grind start or bail nearby makes them
 *    flinch, and flee if it was close.
 *  - In the Grand Warehouse three of them roost up by the lamp rods and
 *    flutter round a loop when a hard landing or a bail startles them.
 *  - A few glowing signs / LED strips occasionally flicker like real neon.
 *  - Drifting specks (leaves outdoors, dust indoors) float around the camera
 *    and part around a fast rider.
 *  - Outdoors, a quiet car passes in the distance now and then (synthesised).
 * With a World Life context (setLifeContext) wing claps are 3D sounds and the
 * birds react to its events (grindStart, bail, landing).
 */
export const WORLD_LIFE = Object.freeze({
  maxBirds: 7,
  flockRadius: 1.3,
  spawnDistance: [11, 22],
  fleeRadius: 3.4,
  landingFleeRadius: 8,
  despawnDistance: 48,
  respawnDelay: [6, 12],
  moteCount: 240,
  moteBox: [34, 12, 34],
  flickerEvery: [5, 11],
  carEvery: [14, 30],
  looseFeathers: 6,
  // Hop aside: a rider this slow (m/s) within fleeRadius only makes them hop.
  hopMaxSpeed: 1.5,
  hopDistance: [.6, 1.2],
  hopTime: [.25, .35],
  hopHeight: .12,
  hopCooldown: [1.4, 2.4],
  // Lateral half-width (m) of the rider's path a bird hops clear of.
  hopCorridor: 1.5,
  // Startle (grindStart / bail): flinch within flinchRadius, flee within flinchFleeRadius.
  flinchRadius: 10,
  flinchFleeRadius: 6,
  flinchTime: .4,
  // Warehouse roost on the lamp rod tips (MapDressing lamp anchors).
  roostPark: 'grand-warehouse',
  roostBirds: 3,
  roostDisturbRadius: 14,
  roostSeverity: .5,
  roostLoop: [3, 5],
  // Rods (m, horizontal) a roost bird picks from around its current one.
  roostRange: 26,
  // Second bird on an already taken rod tip sits this far off its axis.
  perchShareOffset: .14,
  // Motes part around a fast rider (centre height above skater.position).
  moteRiderHeight: .9,
  motePartRadius: 1.6,
  motePartSpeed: 6,
  motePartMin: .8,
  motePartLookahead: .15,
  motePartEase: .1,
  moteReturnEase: .6,
});

const OUTDOOR = new Set(['skate-paradise', 'rooftop']);
const rand = (a, b) => a + Math.random() * (b - a);
const UP = new THREE.Vector3(0, 1, 0);
const TAU = Math.PI * 2;
// Hop directions tried in turn (radians off the preferred one).
const HOP_TURNS = [0, .5, -.5, 1, -1];

function moteTexture() {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 32;
  const g = canvas.getContext('2d');
  if (!g) return null;
  const grad = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(.5, 'rgba(255,255,255,.5)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 32, 32);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export class WorldLife {
  constructor(scene = null) {
    this.root = new THREE.Group();
    this.root.name = 'Ambient world life';
    this.birds = Array.from({ length: WORLD_LIFE.maxBirds }, () => new Pigeon());
    for (const bird of this.birds) this.root.add(bird.root);
    const featherGeometry = looseFeatherGeometry();
    this.feathers = Array.from({ length: WORLD_LIFE.looseFeathers }, () => {
      const mesh = new THREE.Mesh(featherGeometry, pigeonMaterials().feather);
      mesh.name = 'Loose feather'; mesh.visible = false; mesh.castShadow = true;
      this.root.add(mesh);
      return { mesh, life: 0, velocity: new THREE.Vector3(), spin: new THREE.Vector3(), seed: 0 };
    });
    this.surface = null;
    this.flockTimer = 2;
    this.enabled = true;
    this.world = null;
    this.outdoor = false;
    this.flicker = [];
    this.flickerTimer = rand(...WORLD_LIFE.flickerEvery);
    this.activeFlicker = null;
    this.carTimer = rand(...WORLD_LIFE.carEvery);
    this.audio = null;
    this.previousGrounded = true;
    this.airTime = 0;
    this._probe = new THREE.Vector3();
    // World Life context (reactions, 3D audio, anchors) and its subscriptions.
    this.life = null;
    this.unsubscribe = [];
    this.roostPark = false;
    this.roostHome = -1;
    this.startleTimer = 0;
    this.startlePoint = new THREE.Vector3();
    this._birdCtx = { surface: null, indoor: false };
    this._threatened = [];
    this._scared = [];
    this._flock = [];
    this._heading = new THREE.Vector3(0, 0, -1);
    this._rel = new THREE.Vector3();
    this._side = new THREE.Vector3();
    this._target = new THREE.Vector3();
    this._perch = new THREE.Vector3();
    this._featherAt = new THREE.Vector3();
    this._partSide = new THREE.Vector3();
    this._partUp = new THREE.Vector3();

    const [bx, by, bz] = WORLD_LIFE.moteBox;
    const positions = new Float32Array(WORLD_LIFE.moteCount * 3);
    this.moteSeeds = new Float32Array(WORLD_LIFE.moteCount);
    for (let i = 0; i < WORLD_LIFE.moteCount; i++) {
      positions[i * 3] = rand(-bx / 2, bx / 2);
      positions[i * 3 + 1] = rand(0, by);
      positions[i * 3 + 2] = rand(-bz / 2, bz / 2);
      this.moteSeeds[i] = Math.random() * 100;
    }
    // The drift simulation runs on moteBase; the drawn positions add a
    // parting offset that eases out around a fast rider and drifts back.
    this.moteBase = Float32Array.from(positions);
    this.moteOffset = new Float32Array(WORLD_LIFE.moteCount * 3);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage));
    this.motes = new THREE.Points(geometry, new THREE.PointsMaterial({
      size: .09, map: moteTexture(), transparent: true, opacity: .55, depthWrite: false, color: 0xe8c58a, sizeAttenuation: true,
    }));
    this.motes.name = 'Drifting specks';
    this.motes.frustumCulled = false;
    this.moteCenter = new THREE.Vector3();
    this.root.add(this.motes);
    scene?.add(this.root);
  }

  setAudio(audio) { this.audio = audio; }

  /**
   * Hook up the World Life context (LifeDirector.ctx): its reactions drive
   * flinches and the roost, its audio places the wing claps, its anchors give
   * the perches. The ctx object is refreshed by the director: its fields are
   * read fresh every time, never cached.
   */
  setLifeContext(ctx) {
    for (const off of this.unsubscribe) off();
    this.unsubscribe = [];
    this.life = ctx || null;
    const reactions = ctx?.reactions;
    if (!reactions?.on) return;
    this.unsubscribe.push(
      reactions.on('grindStart', event => this.startle(event.point)),
      reactions.on('bail', event => { this.startle(event.point); this.disturbRoost(event.point); }),
      reactions.on('landing', event => { if (event.severity >= WORLD_LIFE.roostSeverity) this.disturbRoost(event.point); }),
    );
  }

  setQuality(settings) {
    this.enabled = settings?.name !== 'performance';
    this.root.visible = this.enabled;
    if (!this.enabled) this.reset();
  }

  setWorld(world) {
    this.restoreFlicker();
    this.world = world;
    this.outdoor = OUTDOOR.has(world?.id);
    this.motes.material.color.set(this.outdoor ? 0xe8c58a : 0xdfe6f2);
    this.motes.material.opacity = this.outdoor ? .55 : .32;
    this.flicker = [];
    const seen = new Set();
    world?.park?.traverse?.(node => {
      if (!node.isMesh) return;
      for (const material of Array.isArray(node.material) ? node.material : [node.material]) {
        if (!material || seen.has(material) || !material.emissive || !(material.emissiveIntensity > 0)) continue;
        if (material.emissive.r + material.emissive.g + material.emissive.b < .15) continue;
        if (!/neon|sign|led|logo|light|lamp|glow|brand|halo/i.test(`${material.name} ${node.name}`)) continue;
        seen.add(material);
        this.flicker.push(material);
      }
    });
    this.flicker = this.flicker.slice(0, 16);
    // Warehouse: the last few birds roost on the lamp rods (once anchors exist).
    this.roostPark = world?.id === WORLD_LIFE.roostPark;
    this.birds.forEach((bird, i) => { bird.roost = this.roostPark && i >= this.birds.length - WORLD_LIFE.roostBirds; });
    this.reset();
  }

  reset() {
    for (const bird of this.birds) { bird.hide(); bird.perchAnchor = null; bird.perchIndex = -1; }
    for (const feather of this.feathers) { feather.life = 0; feather.mesh.visible = false; }
    this.flockTimer = 2;
    this.airTime = 0;
    this.startleTimer = 0;
    this.roostHome = -1;
    this.moteOffset.fill(0);
  }

  /** Lamp anchors to perch on, or null outside the warehouse / before the dressing is built. */
  perches() {
    const lamps = this.roostPark ? this.life?.anchors?.lamps : null;
    return lamps?.length ? lamps : null;
  }

  /**
   * A grind start or bail: idle birds within flinchRadius freeze for a beat;
   * after it, those within flinchFleeRadius take off (see update).
   */
  startle(point) {
    if (!this.enabled || !this.world || !point) return;
    const reduced = Boolean(this.life?.reducedMotion);
    this.startlePoint.copy(point);
    this.startleTimer = WORLD_LIFE.flinchTime;
    for (const bird of this.birds) {
      if (bird.state !== 'idle' || bird.root.position.distanceTo(point) >= WORLD_LIFE.flinchRadius) continue;
      if (bird.flinch(WORLD_LIFE.flinchTime, reduced ? .5 : 1, reduced ? 9 : 18)) bird.startled = true;
    }
  }

  fleeStartle() {
    const scared = this._scared;
    scared.length = 0;
    for (const bird of this.birds) {
      if (bird.startled && bird.state === 'idle' && bird.root.position.distanceTo(this.startlePoint) < WORLD_LIFE.flinchFleeRadius) scared.push(bird);
      bird.startled = false;
    }
    this.scatter(scared, this.startlePoint);
  }

  /**
   * Sit `bird` on a lamp rod (instantly, or by flying a loop there). The
   * Warehouse has no roof: the rods end in open air at their (static) top
   * anchor, so a bird stands on the very tip. A second bird on the same rod
   * (only when there are too few rods) squeezes in beside the first.
   * Positional parameters: reaction handlers call this, so no option objects.
   */
  settle(bird, lamps, fly = false, length = 0, delay = 0, swing = 4, depth = 1) {
    const index = this.pickPerch(lamps, bird);
    const anchor = lamps[index];
    let angle = rand(0, TAU), shared = false;
    for (const other of this.birds) {
      if (other === bird || other.perchAnchor !== anchor) continue;
      shared = true;
      angle = other.perchAngle + Math.PI + rand(-.4, .4);
    }
    const r = shared ? WORLD_LIFE.perchShareOffset : 0, a = anchor.position;
    const spot = this._perch.set(a.x + Math.sin(angle) * r, a.y, a.z + Math.cos(angle) * r);
    bird.perchAnchor = anchor; bird.perchIndex = index; bird.perchAngle = angle;
    // Default flight time: about 5 m/s along the way, 3-6 s.
    if (fly) return bird.flyToPerch(spot, length || THREE.MathUtils.clamp(bird.root.position.distanceTo(spot) / 5, 3, 6), delay, swing, depth);
    bird.perch(spot, rand(0, TAU));
    return true;
  }

  /**
   * A random rod near the bird's current perch (or the roost's home rod),
   * preferring one no other bird has taken; it may be the same rod again.
   */
  pickPerch(lamps, bird) {
    if (!(this.roostHome >= 0 && this.roostHome < lamps.length)) this.roostHome = Math.floor(Math.random() * lamps.length);
    const current = lamps.indexOf(bird.perchAnchor);
    const ref = lamps[current >= 0 ? current : this.roostHome].position;
    let free = -1, freeSeen = 0, any = this.roostHome, anySeen = 0;
    for (let i = 0; i < lamps.length; i++) {
      const p = lamps[i].position;
      if (Math.hypot(p.x - ref.x, p.z - ref.z) > WORLD_LIFE.roostRange) continue;
      if (Math.random() * ++anySeen < 1) any = i;
      let taken = false;
      for (const other of this.birds) if (other !== bird && other.perchAnchor === lamps[i]) { taken = true; break; }
      if (!taken && Math.random() * ++freeSeen < 1) free = i;
    }
    return free >= 0 ? free : any;
  }

  /** Put roost birds on their perches once anchors exist; follow a rebuilt dressing. */
  updateRoost() {
    const lamps = this.perches();
    if (!lamps) return;
    for (const bird of this.birds) {
      if (!bird.roost) continue;
      if (bird.state === 'hidden') this.settle(bird, lamps);
      else if (bird.state === 'idle' && bird.action !== 'hop') {
        // Was waiting on the floor for the anchors: fly up to a rod tip.
        if (this.settle(bird, lamps, true, 0, rand(0, .4), 3) && this.life?.audio) bird.clapGain = .6;
      } else if (bird.state === 'perch' && lamps[bird.perchIndex] !== bird.perchAnchor) this.settle(bird, lamps);
    }
  }

  /**
   * A hard landing or bail near the roost: they flutter round a loop and
   * resettle. Reduced motion: the loop is half as wide and deep, flown in the
   * same time (half speed, half amplitude).
   */
  disturbRoost(point) {
    const lamps = this.enabled && point ? this.perches() : null;
    if (!lamps) return;
    const scale = this.life?.reducedMotion ? .5 : 1, loop = WORLD_LIFE.roostLoop;
    let n = 0, first = null;
    for (const bird of this.birds) {
      if (bird.state !== 'perch') continue;
      const p = bird.root.position;
      // Horizontal reach: the perches sit far above the floor the rider is on.
      if (Math.hypot(p.x - point.x, p.z - point.z) > WORLD_LIFE.roostDisturbRadius) continue;
      const delay = n === 0 ? 0 : rand(.06, .3);
      if (n === 0) first = this._featherAt.copy(p);
      if (!this.settle(bird, lamps, true, rand(loop[0], loop[1]) - delay, delay, rand(4, 6) * scale, scale)) continue;
      if (this.life?.audio) bird.clapGain = n === 0 ? .8 : n === 1 ? .5 : 0;
      n++;
    }
    if (!n) return;
    this.dropFeather(first);
    if (Math.random() < .5) this.dropFeather(first);
  }

  /** Scare birds near a point (e.g. a landing). */
  disturb(point, radius) {
    const scared = this._flock;
    scared.length = 0;
    for (let i = 0; i < this.birds.length; i++) {
      const bird = this.birds[i];
      if (bird.state === 'idle' && bird.root.position.distanceTo(point) < radius) scared.push(bird);
    }
    this.scatter(scared, point);
  }

  /**
   * The nearest bird bolts at once; the rest follow a beat later, like a real
   * flock. Sorts `birds` in place (nearest first) without allocating.
   */
  scatter(birds, from) {
    if (!birds.length) return;
    for (let i = 1; i < birds.length; i++) {
      const bird = birds[i], d = bird.root.position.distanceToSquared(from);
      let j = i - 1;
      while (j >= 0 && birds[j].root.position.distanceToSquared(from) > d) { birds[j + 1] = birds[j]; j--; }
      birds[j + 1] = bird;
    }
    for (let i = 0; i < birds.length; i++) {
      const bird = birds[i];
      const delay = i === 0 ? 0 : rand(.04, .1) + i * rand(.03, .07);
      if (!bird.scare(from, delay)) continue;
      if (this.life?.audio) {
        // 3D wing claps, each when that bird actually leaves (keeps the stagger).
        // Only the first three sound, so a flock never floods the life voices.
        bird.clapGain = i === 0 ? 1 : i < 3 ? .55 : 0;
        if (bird.tookOff) this.clap(bird);
      } else this.flapSound(delay, i === 0);
    }
    // Now and then a feather comes loose in the scramble.
    if (Math.random() < .55) this.dropFeather(birds[0].root.position);
    if (birds.length > 3 && Math.random() < .35) this.dropFeather(birds[Math.floor(birds.length / 2)].root.position);
  }

  flee(bird, from) { this.scatter([bird], from); }

  /** Play a bird's pending take-off clap through the World Life 3D audio. */
  clap(bird) {
    bird.tookOff = false;
    const gain = bird.clapGain;
    bird.clapGain = 0;
    if (gain > 0) this.life?.audio?.play?.('flap', bird.root.position, { gain, rate: rand(.9, 1.12) });
  }

  /**
   * Hop an idle bird aside from a slow rider: 0.6-1.2 m away from the rider's
   * path (or straight away from a standing rider), onto flat ground only.
   */
  hopAside(bird, rider, heading, moving, near, surface, reduced) {
    // A flinching bird stays frozen for the flinch (then flees if it was close).
    if (bird.action === 'hop' || bird.flinchTime > 0 || !surface?.ground) return;
    const position = bird.root.position;
    const rel = this._rel.subVectors(position, rider).setY(0);
    const along = rel.dot(heading);
    const side = this._side.copy(rel).addScaledVector(heading, -along);
    const lateral = side.length();
    // Still in the way (ahead of the rider, inside the path): hop again at once.
    const inPath = moving && along > -.3 && lateral < WORLD_LIFE.hopCorridor;
    if (bird.hopCooldown > 0 && !(inPath && near < 2.4)) return;
    if (rel.lengthSq() < 1e-6) rel.set(bird.hopSide, 0, 0);
    rel.normalize();
    if (!moving) side.copy(rel);
    else {
      if (lateral < .05) side.set(heading.z * bird.hopSide, 0, -heading.x * bird.hopSide);
      side.normalize().addScaledVector(rel, .35).normalize();
    }
    const hd = WORLD_LIFE.hopDistance, ht = WORLD_LIFE.hopTime, hc = WORLD_LIFE.hopCooldown;
    const distance = rand(hd[0], hd[1]);
    const length = rand(ht[0], ht[1]) * (reduced ? 2 : 1);
    const height = WORLD_LIFE.hopHeight * (reduced ? .5 : 1);
    for (const turn of HOP_TURNS) {
      const target = this._target.copy(side).applyAxisAngle(UP, turn).multiplyScalar(distance).add(position);
      const hit = surface.ground(this._probe.copy(target), .3, .5);
      if (!hit || hit.normal.y < .97 || Math.abs(hit.point.y - position.y) > .06) continue;
      target.y = hit.point.y;
      if (target.distanceTo(rider) < 1.2) continue;
      bird.hop(target, length, height, rand(hc[0], hc[1]));
      return;
    }
    bird.hopCooldown = .4; // boxed in: try again shortly (it still flies if the rider comes right up)
  }

  dropFeather(at) {
    let feather = null;
    for (let i = 0; i < this.feathers.length && !feather; i++) if (this.feathers[i].life <= 0) feather = this.feathers[i];
    if (!feather) return;
    feather.life = rand(3.2, 4.5);
    feather.seed = Math.random() * 10;
    feather.mesh.position.set(at.x + rand(-.15, .15), at.y + rand(.25, .45), at.z + rand(-.15, .15));
    feather.mesh.rotation.set(rand(0, 6), rand(0, 6), rand(0, 6));
    feather.velocity.set(rand(-.4, .4), rand(.6, 1.1), rand(-.4, .4));
    feather.spin.set(rand(-2, 2), rand(-3, 3), rand(-2, 2));
    feather.mesh.visible = true;
  }

  updateFeathers(dt) {
    const t = performance.now() / 1000;
    for (const f of this.feathers) {
      if (f.life <= 0) continue;
      f.life -= dt;
      // Light and draggy: it rises with the scramble, then sways down.
      f.velocity.y += (-.32 - f.velocity.y) * Math.min(1, dt * 2.2);
      f.velocity.x += Math.sin(t * 2.3 + f.seed) * .9 * dt;
      f.velocity.z += Math.cos(t * 1.9 + f.seed) * .9 * dt;
      f.velocity.x *= 1 - Math.min(1, dt * .8); f.velocity.z *= 1 - Math.min(1, dt * .8);
      f.mesh.position.addScaledVector(f.velocity, dt);
      f.mesh.rotation.x += f.spin.x * dt; f.mesh.rotation.y += f.spin.y * dt;
      f.mesh.rotation.z = Math.sin(t * 3.1 + f.seed) * .7;
      if (f.life <= 0) f.mesh.visible = false;
    }
  }

  spawnFlock(skater) {
    const surface = skater?.surface;
    if (!surface?.ground || !skater?.position) return;
    this.surface = surface;
    const forward = skater.forward?.clone?.().setY(0) || new THREE.Vector3(0, 0, -1);
    if (forward.lengthSq() < 1e-4) forward.set(0, 0, -1);
    forward.normalize();
    for (let attempt = 0; attempt < 8; attempt++) {
      const direction = forward.clone().applyAxisAngle(UP, rand(-1.4, 1.4));
      const center = skater.position.clone().addScaledVector(direction, rand(...WORLD_LIFE.spawnDistance));
      const hit = surface.ground(center.setY(skater.position.y), 4, 6);
      if (!hit || hit.normal.y < .97 || Math.abs(hit.point.y - skater.position.y) > 2.5) continue;
      let placed = 0;
      for (const bird of this.birds) {
        if (bird.state !== 'hidden') continue; // roosting birds stay on their perches
        const offset = new THREE.Vector3(rand(-1, 1), 0, rand(-1, 1)).multiplyScalar(WORLD_LIFE.flockRadius);
        const spot = surface.ground(this._probe.copy(hit.point).add(offset).setY(hit.point.y), .8, 1.2);
        if (!spot || spot.normal.y < .97 || Math.abs(spot.point.y - hit.point.y) > .05) continue;
        bird.spawn(spot.point, rand(0, Math.PI * 2));
        placed++;
      }
      if (placed >= 3) return;
    }
  }

  update(delta, skater, camera = null) {
    const dt = Math.min(.05, Math.max(0, Number(delta) || 0));
    if (!this.enabled || !dt || !skater?.position) return;
    const p = skater.position;
    const speed = Math.abs(Number(skater.speed) || 0);

    // Landings scare nearby birds (and the camera keeps its own drama).
    const grounded = Boolean(skater.grounded);
    if (!grounded) this.airTime += dt;
    if (grounded && !this.previousGrounded && this.airTime > .3) this.disturb(p, WORLD_LIFE.landingFleeRadius);
    if (grounded) this.airTime = 0;
    this.previousGrounded = grounded;

    // The rider's line of travel (horizontal), for hopping out of the way.
    const heading = this._heading, v = skater.velocity, f = skater.forward;
    if (v && Math.hypot(v.x, v.z) > .2) heading.set(v.x, 0, v.z).normalize();
    else if (f && Math.hypot(f.x, f.z) > 1e-3) heading.set(f.x, 0, f.z).normalize();
    const moving = speed > .3;
    const reduced = Boolean(this.life?.reducedMotion);

    this.updateRoost();
    if (this.startleTimer > 0) {
      this.startleTimer -= dt;
      if (this.startleTimer <= 0) this.fleeStartle();
    }

    let alive = 0;
    const ctx = this._birdCtx;
    ctx.surface = this.surface || skater.surface; ctx.indoor = !this.outdoor;
    const threatened = this._threatened;
    threatened.length = 0;
    for (const bird of this.birds) {
      if (bird.state === 'hidden') continue;
      if (!bird.roosting) alive++;
      if (bird.state === 'idle') {
        // A rider rolling through (or walking right up to them) sends them up;
        // a slow one only makes them hop out of the way.
        const near = bird.root.position.distanceTo(p);
        if ((near < WORLD_LIFE.fleeRadius && speed > WORLD_LIFE.hopMaxSpeed) || near < 1.2) threatened.push(bird);
        else if (near < WORLD_LIFE.fleeRadius) this.hopAside(bird, p, heading, moving, near, ctx.surface, reduced);
        else if (near > WORLD_LIFE.despawnDistance) { bird.hide(); continue; }
      }
      bird.update(dt, ctx);
      if (bird.state === 'roost') keepClearOfRider(bird.root.position, p, 1.2);
      if (bird.tookOff) this.clap(bird);
    }
    if (threatened.length) {
      // Their flock-mates react too, a moment later.
      const flock = this._flock, reach = WORLD_LIFE.flockRadius * 2.5;
      flock.length = 0;
      for (let i = 0; i < this.birds.length; i++) {
        const b = this.birds[i];
        if (b.state !== 'idle') continue;
        for (let k = 0; k < threatened.length; k++) {
          if (threatened[k] === b || threatened[k].root.position.distanceTo(b.root.position) < reach) { flock.push(b); break; }
        }
      }
      this.scatter(flock, p);
    }
    this.updateFeathers(dt);
    if (alive === 0) {
      this.flockTimer -= dt;
      if (this.flockTimer <= 0) { this.spawnFlock(skater); this.flockTimer = rand(WORLD_LIFE.respawnDelay[0], WORLD_LIFE.respawnDelay[1]); }
    }

    this.updateMotes(dt, camera?.position || p, skater);
    this.updateFlicker(dt);
    this.updateCars(dt, speed);
  }

  updateMotes(dt, center, skater = null) {
    const [bx, by, bz] = WORLD_LIFE.moteBox;
    this.moteCenter.lerp(center, Math.min(1, dt * 2));
    const position = this.motes.geometry.attributes.position;
    const a = this.moteBase;
    const t = performance.now() / 1000;
    const wind = this.outdoor ? .55 : .08;
    for (let i = 0; i < WORLD_LIFE.moteCount; i++) {
      const s = this.moteSeeds[i];
      a[i * 3] += (wind + Math.sin(t * .7 + s) * .25) * dt;
      a[i * 3 + 1] += (Math.sin(t * .9 + s * 1.7) * .18 + (this.outdoor ? -.05 : .03)) * dt;
      a[i * 3 + 2] += Math.cos(t * .6 + s) * .2 * dt;
      // Wrap the specks around the camera so they always surround the player.
      const dx = a[i * 3] - this.moteCenter.x, dz = a[i * 3 + 2] - this.moteCenter.z;
      if (dx > bx / 2) a[i * 3] -= bx; else if (dx < -bx / 2) a[i * 3] += bx;
      if (dz > bz / 2) a[i * 3 + 2] -= bz; else if (dz < -bz / 2) a[i * 3 + 2] += bz;
      const dy = a[i * 3 + 1] - (this.moteCenter.y - 2);
      if (dy > by) a[i * 3 + 1] -= by; else if (dy < 0) a[i * 3 + 1] += by;
    }
    this.partMotes(dt, skater, position.array);
    position.needsUpdate = true;
  }

  /**
   * Drawn mote = drifting base + parting offset. Around a rider faster than
   * motePartSpeed, motes within motePartRadius of the rider (and just ahead of
   * them) ease sideways off the line of travel; they never come within
   * motePartMin. Slower, the offsets drift back to zero.
   */
  partMotes(dt, skater, out) {
    const base = this.moteBase, off = this.moteOffset, n = WORLD_LIFE.moteCount;
    const R = WORLD_LIFE.motePartRadius, min = WORLD_LIFE.motePartMin;
    // Reduced motion: half the push, eased in at half the speed.
    const reduced = Boolean(this.life?.reducedMotion), amplitude = reduced ? .5 : 1;
    const kIn = 1 - Math.exp(-dt / (WORLD_LIFE.motePartEase * (reduced ? 2 : 1))), kOut = 1 - Math.exp(-dt / WORLD_LIFE.moteReturnEase);
    const speed = Math.abs(Number(skater?.speed) || 0);
    const parting = speed > WORLD_LIFE.motePartSpeed && skater?.position;
    let rx = 0, ry = 0, rz = 0, hx = 0, hy = 0, hz = -1, reach = 0;
    if (parting) {
      rx = skater.position.x; ry = skater.position.y + WORLD_LIFE.moteRiderHeight; rz = skater.position.z;
      const v = skater.velocity?.lengthSq?.() > 1e-4 ? skater.velocity : skater.forward;
      const vl = v ? Math.hypot(v.x, v.y, v.z) : 0;
      if (vl > 1e-6) { hx = v.x / vl; hy = v.y / vl; hz = v.z / vl; }
      reach = speed * WORLD_LIFE.motePartLookahead;
      // A basis across the line of travel, for motes dead on it.
      const side = this._partSide.set(hx, hy, hz).cross(UP);
      if (side.lengthSq() < 1e-6) side.set(1, 0, 0);
      side.normalize();
      this._partUp.set(hx, hy, hz).cross(side).normalize();
    }
    const side = this._partSide, up = this._partUp;
    for (let i = 0; i < n; i++) {
      const j = i * 3;
      let tx = 0, ty = 0, tz = 0;
      if (parting) {
        const dx = base[j] - rx, dy = base[j + 1] - ry, dz = base[j + 2] - rz;
        const along = dx * hx + dy * hy + dz * hz;
        const c = Math.min(reach, Math.max(0, along));
        const sx = dx - hx * c, sy = dy - hy * c, sz = dz - hz * c;
        if (sx * sx + sy * sy + sz * sz < R * R) {
          // Push straight out from the line of travel, to motePartRadius. The
          // direction comes from where the mote is drawn now (base + offset),
          // so a mote already moving aside keeps going the same way.
          const wx = dx + off[j], wy = dy + off[j + 1], wz = dz + off[j + 2];
          const wa = wx * hx + wy * hy + wz * hz;
          let qx = wx - hx * wa, qy = wy - hy * wa, qz = wz - hz * wa;
          const q = Math.hypot(qx, qy, qz);
          if (q < 1e-3) {
            const s = this.moteSeeds[i];
            qx = side.x * Math.cos(s) + up.x * Math.sin(s); qy = side.y * Math.cos(s) + up.y * Math.sin(s); qz = side.z * Math.cos(s) + up.z * Math.sin(s);
          } else { qx /= q; qy /= q; qz /= q; }
          const push = Math.max(0, R - (dx * qx + dy * qy + dz * qz)) * amplitude;
          tx = qx * push; ty = qy * push; tz = qz * push;
        }
      }
      const k = tx * tx + ty * ty + tz * tz > off[j] * off[j] + off[j + 1] * off[j + 1] + off[j + 2] * off[j + 2] ? kIn : kOut;
      off[j] += (tx - off[j]) * k; off[j + 1] += (ty - off[j + 1]) * k; off[j + 2] += (tz - off[j + 2]) * k;
      let px = base[j] + off[j], py = base[j + 1] + off[j + 1], pz = base[j + 2] + off[j + 2];
      if (parting) {
        // Hard floor: never inside motePartMin of the rider. Slide it sideways
        // (off the line of travel) just far enough, never ahead of the rider.
        const ex = px - rx, ey = py - ry, ez = pz - rz;
        if (ex * ex + ey * ey + ez * ez < min * min) {
          const along = ex * hx + ey * hy + ez * hz;
          let ux = ex - hx * along, uy = ey - hy * along, uz = ez - hz * along;
          const across = Math.hypot(ux, uy, uz);
          if (across > 1e-4) { ux /= across; uy /= across; uz /= across; } else { ux = side.x; uy = side.y; uz = side.z; }
          const fix = Math.sqrt(Math.max(0, min * min - along * along)) - across + 1e-5;
          off[j] += ux * fix; off[j + 1] += uy * fix; off[j + 2] += uz * fix;
          px += ux * fix; py += uy * fix; pz += uz * fix;
        }
      }
      out[j] = px; out[j + 1] = py; out[j + 2] = pz;
    }
  }

  updateFlicker(dt) {
    if (!this.flicker.length) return;
    if (this.activeFlicker) {
      const f = this.activeFlicker;
      f.t += dt;
      const step = Math.floor(f.t / .07);
      if (step >= f.pattern.length) { this.restoreFlicker(); return; }
      f.material.emissiveIntensity = f.base * f.pattern[step];
      return;
    }
    this.flickerTimer -= dt;
    if (this.flickerTimer > 0) return;
    this.flickerTimer = rand(WORLD_LIFE.flickerEvery[0], WORLD_LIFE.flickerEvery[1]);
    const material = this.flicker[Math.floor(Math.random() * this.flicker.length)];
    const patterns = [[.2, 1, .25, 1], [.35, .8, .15, 1, .5, 1], [.1, 1]];
    this.activeFlicker = { material, base: material.emissiveIntensity, pattern: patterns[Math.floor(Math.random() * patterns.length)], t: 0 };
  }

  restoreFlicker() {
    if (!this.activeFlicker) return;
    this.activeFlicker.material.emissiveIntensity = this.activeFlicker.base;
    this.activeFlicker = null;
  }

  audioContext() {
    const ctx = this.audio?.context;
    if (!ctx || ctx.state !== 'running' || !this.audio.master || this.audio.enabled === false) return null;
    return ctx;
  }

  noiseBuffer(ctx, seconds) {
    if (this._noise?.sampleRate === ctx.sampleRate && this._noise.duration >= seconds) return this._noise;
    const buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * seconds), ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < data.length; i++) { last = last * .97 + (Math.random() * 2 - 1) * .03; data[i] = last * 6; }
    this._noise = buffer;
    return buffer;
  }

  flapSound(delay = 0, lead = false) {
    const ctx = this.audioContext();
    if (!ctx) return;
    const t = ctx.currentTime + Math.max(0, delay);
    if (lead) {
      // The first bird's wing-clap: a soft, low thump under the flutter.
      const source = ctx.createBufferSource();
      source.buffer = this.noiseBuffer(ctx, 2);
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass'; filter.frequency.value = 620;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(.09, t + .006);
      gain.gain.exponentialRampToValueAtTime(.0005, t + .09);
      source.connect(filter).connect(gain).connect(this.audio.extras || this.audio.master);
      source.start(t, Math.random(), .1);
    }
    for (let i = 0; i < 6; i++) {
      const source = ctx.createBufferSource();
      source.buffer = this.noiseBuffer(ctx, 2);
      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass'; filter.frequency.value = 1400 + Math.random() * 900; filter.Q.value = 1.2;
      const gain = ctx.createGain();
      const at = t + i * .07 + Math.random() * .02;
      gain.gain.setValueAtTime(0, at);
      gain.gain.linearRampToValueAtTime(lead ? .05 : .03, at + .01);
      gain.gain.exponentialRampToValueAtTime(.0005, at + .06);
      source.connect(filter).connect(gain).connect(this.audio.extras || this.audio.master);
      source.start(at, Math.random(), .08);
    }
  }

  updateCars(dt, speed) {
    if (!this.outdoor) return;
    this.carTimer -= dt;
    if (this.carTimer > 0) return;
    this.carTimer = rand(WORLD_LIFE.carEvery[0], WORLD_LIFE.carEvery[1]);
    const ctx = this.audioContext();
    if (!ctx) return;
    // A distant car: filtered rumble that swells and fades while panning across.
    const t = ctx.currentTime, length = rand(4.5, 6.5);
    const source = ctx.createBufferSource();
    source.buffer = this.noiseBuffer(ctx, 2);
    source.loop = true;
    source.playbackRate.setValueAtTime(1.06, t);
    source.playbackRate.linearRampToValueAtTime(.94, t + length);
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(260, t);
    filter.frequency.linearRampToValueAtTime(520, t + length * .5);
    filter.frequency.linearRampToValueAtTime(240, t + length);
    const gain = ctx.createGain();
    const peak = speed > 14 ? .025 : .04;
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(peak, t + length * .5);
    gain.gain.linearRampToValueAtTime(0, t + length);
    let node = source.connect(filter).connect(gain);
    if (ctx.createStereoPanner) {
      const pan = ctx.createStereoPanner();
      const side = Math.random() < .5 ? -1 : 1;
      pan.pan.setValueAtTime(-.8 * side, t);
      pan.pan.linearRampToValueAtTime(.8 * side, t + length);
      node = node.connect(pan);
    }
    node.connect(this.audio.extras || this.audio.master);
    source.start(t);
    source.stop(t + length + .1);
  }

  dispose() {
    for (const off of this.unsubscribe) off();
    this.unsubscribe = [];
    this.life = null;
    this.restoreFlicker();
    this.root.removeFromParent();
    // Pigeon materials are shared across WorldLife instances; only free geometry.
    for (const bird of this.birds) bird.dispose();
    this.feathers[0]?.mesh.geometry.dispose();
    this.motes.geometry.dispose(); this.motes.material.map?.dispose?.(); this.motes.material.dispose();
  }
}
