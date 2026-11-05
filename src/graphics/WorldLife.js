import * as THREE from 'three';

/**
 * Ambient world life (2026-11 enhancement pass). Presentation only: nothing
 * here touches physics, scoring or collision.
 *  - Pigeon flocks settle on flat ground near the rider and scatter when the
 *    rider lands close by or rolls through them.
 *  - A few glowing signs / LED strips occasionally flicker like real neon.
 *  - Drifting specks (leaves outdoors, dust indoors) float around the camera.
 *  - Outdoors, a quiet car passes in the distance now and then (synthesised).
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
});

const OUTDOOR = new Set(['skate-paradise', 'rooftop']);
const rand = (a, b) => a + Math.random() * (b - a);
const UP = new THREE.Vector3(0, 1, 0);

function makeBird() {
  const group = new THREE.Group();
  const grey = new THREE.MeshStandardMaterial({ color: 0x8a8d96, roughness: .85 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x4d5060, roughness: .8 });
  const body = new THREE.Mesh(new THREE.SphereGeometry(.1, 10, 8), grey);
  body.scale.set(1, .85, 1.6);
  body.position.y = .1;
  const head = new THREE.Mesh(new THREE.SphereGeometry(.055, 8, 6), dark);
  head.position.set(0, .19, .13);
  const wingGeometry = new THREE.BufferGeometry();
  wingGeometry.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, -.07, 0, 0, .09, .26, 0, -.02], 3));
  wingGeometry.computeVertexNormals();
  const wingMaterial = new THREE.MeshStandardMaterial({ color: 0x6e717c, roughness: .9, side: THREE.DoubleSide });
  const left = new THREE.Mesh(wingGeometry, wingMaterial);
  const right = new THREE.Mesh(wingGeometry, wingMaterial);
  left.position.set(.04, .13, 0); right.position.set(-.04, .13, 0); right.scale.x = -1;
  group.add(body, head, left, right);
  group.traverse(o => { if (o.isMesh) o.castShadow = true; });
  group.visible = false;
  return { group, head, left, right, state: 'hidden', velocity: new THREE.Vector3(), phase: Math.random() * 10, timer: 0 };
}

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
    this.birds = Array.from({ length: WORLD_LIFE.maxBirds }, makeBird);
    for (const bird of this.birds) this.root.add(bird.group);
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

    const [bx, by, bz] = WORLD_LIFE.moteBox;
    const positions = new Float32Array(WORLD_LIFE.moteCount * 3);
    this.moteSeeds = new Float32Array(WORLD_LIFE.moteCount);
    for (let i = 0; i < WORLD_LIFE.moteCount; i++) {
      positions[i * 3] = rand(-bx / 2, bx / 2);
      positions[i * 3 + 1] = rand(0, by);
      positions[i * 3 + 2] = rand(-bz / 2, bz / 2);
      this.moteSeeds[i] = Math.random() * 100;
    }
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
    this.reset();
  }

  reset() {
    for (const bird of this.birds) { bird.state = 'hidden'; bird.group.visible = false; }
    this.flockTimer = 2;
    this.airTime = 0;
  }

  /** Scare birds near a point (e.g. a landing). */
  disturb(point, radius) {
    for (const bird of this.birds) {
      if (bird.state !== 'idle') continue;
      if (bird.group.position.distanceTo(point) < radius) this.flee(bird, point);
    }
  }

  flee(bird, from) {
    bird.state = 'flee';
    bird.timer = 0;
    const away = bird.group.position.clone().sub(from).setY(0);
    if (away.lengthSq() < 1e-4) away.set(Math.random() - .5, 0, Math.random() - .5);
    away.normalize().applyAxisAngle(UP, rand(-.6, .6));
    bird.velocity.copy(away).multiplyScalar(rand(3.5, 5.5)).setY(rand(2.6, 4));
    bird.group.lookAt(bird.group.position.clone().add(bird.velocity.clone().setY(0)));
    this.flapSound();
  }

  spawnFlock(skater) {
    const surface = skater?.surface;
    if (!surface?.ground || !skater?.position) return;
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
        const offset = new THREE.Vector3(rand(-1, 1), 0, rand(-1, 1)).multiplyScalar(WORLD_LIFE.flockRadius);
        const spot = surface.ground(this._probe.copy(hit.point).add(offset).setY(hit.point.y), .8, 1.2);
        if (!spot || spot.normal.y < .97) continue;
        bird.group.position.copy(spot.point);
        bird.group.rotation.set(0, rand(0, Math.PI * 2), 0);
        bird.group.visible = true;
        bird.state = 'idle';
        bird.timer = rand(0, 2);
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

    let alive = 0;
    for (const bird of this.birds) {
      const g = bird.group;
      if (bird.state === 'hidden') continue;
      alive++;
      bird.phase += dt;
      if (bird.state === 'idle') {
        // Peck and shuffle; flee from a rider rolling through.
        bird.head.position.y = .19 - Math.max(0, Math.sin(bird.phase * 5)) * .05;
        bird.left.rotation.z = bird.right.rotation.z = 0;
        bird.timer -= dt;
        if (bird.timer < 0) { g.rotation.y += rand(-1, 1); bird.timer = rand(.8, 2.6); }
        const near = g.position.distanceTo(p);
        if ((near < WORLD_LIFE.fleeRadius && speed > 1.5) || near < 1.2) this.flee(bird, p);
        if (near > WORLD_LIFE.despawnDistance) { bird.state = 'hidden'; g.visible = false; }
      } else {
        bird.timer += dt;
        const flap = Math.sin(bird.phase * 38) * 1.1;
        bird.left.rotation.z = flap; bird.right.rotation.z = -flap;
        bird.velocity.y = Math.max(.6, bird.velocity.y - .8 * dt);
        g.position.addScaledVector(bird.velocity, dt);
        if (bird.timer > 4) { bird.state = 'hidden'; g.visible = false; }
      }
    }
    if (alive === 0) {
      this.flockTimer -= dt;
      if (this.flockTimer <= 0) { this.spawnFlock(skater); this.flockTimer = rand(...WORLD_LIFE.respawnDelay); }
    }

    this.updateMotes(dt, camera?.position || p);
    this.updateFlicker(dt);
    this.updateCars(dt, speed);
  }

  updateMotes(dt, center) {
    const [bx, by, bz] = WORLD_LIFE.moteBox;
    this.moteCenter.lerp(center, Math.min(1, dt * 2));
    const position = this.motes.geometry.attributes.position;
    const a = position.array;
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
    position.needsUpdate = true;
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
    this.flickerTimer = rand(...WORLD_LIFE.flickerEvery);
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

  flapSound() {
    const ctx = this.audioContext();
    if (!ctx) return;
    const t = ctx.currentTime;
    for (let i = 0; i < 6; i++) {
      const source = ctx.createBufferSource();
      source.buffer = this.noiseBuffer(ctx, 2);
      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass'; filter.frequency.value = 1400 + Math.random() * 900; filter.Q.value = 1.2;
      const gain = ctx.createGain();
      const at = t + i * .07 + Math.random() * .02;
      gain.gain.setValueAtTime(0, at);
      gain.gain.linearRampToValueAtTime(.05, at + .01);
      gain.gain.exponentialRampToValueAtTime(.0005, at + .06);
      source.connect(filter).connect(gain).connect(this.audio.master);
      source.start(at, Math.random(), .08);
    }
  }

  updateCars(dt, speed) {
    if (!this.outdoor) return;
    this.carTimer -= dt;
    if (this.carTimer > 0) return;
    this.carTimer = rand(...WORLD_LIFE.carEvery);
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
    node.connect(this.audio.master);
    source.start(t);
    source.stop(t + length + .1);
  }

  dispose() {
    this.restoreFlicker();
    this.root.removeFromParent();
    this.root.traverse(o => { o.geometry?.dispose?.(); o.material?.map?.dispose?.(); o.material?.dispose?.(); });
  }
}
