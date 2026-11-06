import * as THREE from 'three';
import { prepareCalloutLettering } from './ComboCallouts.js';
import { DownhillTraffic } from './DownhillTraffic.js';

/**
 * Downhill Bomb run layer (2026-11, phase 1). Active only on the downhill map.
 *  - Bananas spin along the hill; ride through them to collect.
 *  - Every 10 bananas: BANANA TIME, five real seconds of bullet time (the game
 *    simulation runs slower; the session clock keeps real time).
 *  - Traffic cones tip over when you hit them (decoration, not walls).
 *  - Reaching the tunnel at the bottom brings you back to the top (phase 2
 *    will make the hill endless).
 */
export const DOWNHILL_RUN = Object.freeze({
  pickupRadius: 1.35,
  bananasForBulletTime: 10,
  bulletSeconds: 5,
  bulletScale: .35,
  easeSeconds: .35,
  // Downhill riding rules (this map only).
  maxTurn: 35 * Math.PI / 180,  // travel direction stays within ±35° of the road
  steerAssist: 1.15,            // extra yaw rate (rad/s) at speed for sharper carving
  speedFloorStart: 15,          // m/s (54 km/h) …
  speedFloorGrowth: .1,         // … plus 0.1 m/s every second of riding …
  speedFloorMax: 38,            // … up to 137 km/h
  checkpointBonus: 1000,  // points x stretch number
  oilSeconds: 1.6,
});
const UP = new THREE.Vector3(0, 1, 0);
const wrapAngle = a => Math.atan2(Math.sin(a), Math.cos(a));

function bananaGeometry() {
  // A curved, tapered tube with brown tips (vertex colours).
  const segments = 14, ring = 8, positions = [], colors = [], index = [];
  const curve = t => new THREE.Vector3(Math.sin((t - .5) * 1.9) * .2, Math.cos((t - .5) * 1.9) * .2 - .2, 0);
  for (let i = 0; i <= segments; i++) {
    const t = i / segments, c = curve(t);
    const ahead = curve(Math.min(1, t + .01)).sub(curve(Math.max(0, t - .01))).normalize();
    const side = new THREE.Vector3(0, 0, 1), up = new THREE.Vector3().crossVectors(side, ahead);
    const r = .012 + .05 * Math.pow(Math.sin(Math.PI * t), .7);
    const tip = t < .1 || t > .92;
    for (let j = 0; j < ring; j++) {
      const a = j / ring * Math.PI * 2;
      const p = c.clone().addScaledVector(up, Math.cos(a) * r).addScaledVector(side, Math.sin(a) * r * .9);
      positions.push(p.x, p.y, p.z);
      const ridge = .92 + .08 * Math.cos(a * 5);
      if (tip) colors.push(.32, .22, .1); else colors.push(1 * ridge, .86 * ridge, .2 * ridge);
    }
  }
  for (let i = 0; i < segments; i++) for (let j = 0; j < ring; j++) {
    const a = i * ring + j, b = i * ring + (j + 1) % ring, c = a + ring, d = b + ring;
    index.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  g.setIndex(index);
  g.computeVertexNormals();
  g.scale(1.6, 1.6, 1.6);
  return g;
}

function glowTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,236,140,1)'); g.addColorStop(.35, 'rgba(255,214,80,.45)'); g.addColorStop(1, 'rgba(255,200,60,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

function propCone() {
  const g = new THREE.Group();
  const orange = new THREE.MeshStandardMaterial({ color: '#ff6a1a', roughness: .6 });
  const white = new THREE.MeshStandardMaterial({ color: '#f4f4f4', roughness: .5 });
  const base = new THREE.Mesh(new THREE.BoxGeometry(.44, .05, .44), new THREE.MeshStandardMaterial({ color: '#1f1f1f', roughness: .8 })); base.position.y = .025;
  const body = new THREE.Mesh(new THREE.ConeGeometry(.18, .68, 16), orange); body.position.y = .38;
  const band = new THREE.Mesh(new THREE.CylinderGeometry(.1, .125, .11, 16), white); band.position.y = .44;
  for (const m of [base, body, band]) { m.castShadow = true; g.add(m); }
  return g;
}

export class DownhillRun {
  constructor({ scene, audio = null, music = null, callouts = null } = {}) {
    this.scene = scene;
    this.audio = audio;
    this.music = music;
    this.callouts = callouts;
    this.root = new THREE.Group(); this.root.name = 'Downhill run';
    scene?.add(this.root);
    this.active = false;
    this.count = 0;
    this.bullet = 0;          // seconds of bullet time left (real time)
    this.scale = 1;           // current eased time scale
    this.time = 0;
    this.bananas = [];
    this.cones = [];
    this.centre = [];
    this.progress = 0;
    this.onAdvance = null;     // async: build the next stretch, resolve true on success
    this.onRestart = null;     // fallback: back to the top of this stretch
    this.swapping = false;
    this.stretch = 1;
    this.distanceBase = 0;
    this.runTime = 0;
    this.onCheckpoint = null;
    this.traffic = new DownhillTraffic(this.root, audio);
    this.oilTime = 0;
    this.traffic.onHit = item => this.hazard(item);
    this.geometry = typeof document === 'undefined' ? null : bananaGeometry();
    this.glow = typeof document === 'undefined' ? null : glowTexture();
    this.matrix = new THREE.Matrix4(); this.quat = new THREE.Quaternion(); this.scaleV = new THREE.Vector3(); this.pos = new THREE.Vector3();
    this.hud = null;
    this.buildHud();
  }

  /** Game simulation speed multiplier (1 normally, slower in bullet time). */
  get timeScale() { return this.active ? (this.swapping ? 0 : this.scale) : 1; }

  buildHud() {
    if (typeof document === 'undefined') return;
    const hud = document.createElement('div');
    hud.id = 'banana-hud'; hud.hidden = true;
    hud.innerHTML = `<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M10 40c10 14 34 16 46-6 2-4-2-6-4-3-10 15-28 13-38 2-2-2-6 3-4 7z" fill="#ffd93b" stroke="#3a2a10" stroke-width="3" stroke-linejoin="round"/><path d="M52 31l5-9" stroke="#5a4320" stroke-width="5" stroke-linecap="round"/></svg>
      <span class="stretch-label">STRETCH <b>1</b></span><span class="banana-count"><b>0</b><i>/${DOWNHILL_RUN.bananasForBulletTime}</i></span><span class="banana-meter"><span></span></span>`;
    document.body.append(hud);
    this.hud = hud;
  }

  setWorld(world) {
    this.traffic?.setData(null);
    // Clear the previous map's bananas and cones.
    for (const child of [...this.root.children]) {
      child.removeFromParent();
      child.traverse?.(o => { if (o.isMesh && o.material !== this.bananaMaterial) { o.geometry?.dispose?.(); } });
    }
    this.bananas = []; this.cones = [];
    const data = world?.downhill;
    // A new stretch in the same run keeps bananas and bullet time; a new map starts fresh.
    const continuing = this.active && Boolean(data) && (data.stretch || 1) > 1;
    this.active = Boolean(data);
    if (!continuing) { this.endBulletTime(true); this.count = 0; this.distanceBase = 0; this.runTime = 0; }
    this.stretch = data?.stretch || 1;
    this.progress = 0;
    if (this.hud) this.hud.querySelector('.stretch-label b').textContent = String(this.stretch);
    if (this.hud) this.hud.hidden = !this.active;
    this.updateHud();
    if (!this.active || !this.geometry) return;
    prepareCalloutLettering('BANANA TIME!', 'gold'); prepareCalloutLettering('5 SEC SLOW-MO', 'cyan-purple');
    this.centre = data.centre.map(p => new THREE.Vector3(...p));
    this.length = data.length;
    // Bananas: one instanced mesh plus one instanced glow.
    this.bananaMaterial ||= new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .45, metalness: .05, emissive: '#5a4100', emissiveIntensity: .35 });
    this.glowMaterial ||= new THREE.MeshBasicMaterial({ map: this.glow, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, fog: false });
    const n = data.bananas.length;
    this.bananaMesh = new THREE.InstancedMesh(this.geometry, this.bananaMaterial, n);
    this.bananaMesh.name = 'Bananas'; this.bananaMesh.castShadow = true; this.bananaMesh.frustumCulled = false;
    this.glowMesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1.1, 1.1), this.glowMaterial, n);
    this.glowMesh.name = 'Banana glow'; this.glowMesh.frustumCulled = false;
    this.root.add(this.bananaMesh, this.glowMesh);
    this.bananas = data.bananas.map((p, i) => ({ position: new THREE.Vector3(...p), taken: false, phase: i * .7, pop: 0 }));
    // Cones.
    for (const c of data.cones) {
      const cone = propCone();
      cone.position.set(...c.position); cone.rotation.y = c.heading || 0;
      this.root.add(cone);
      this.cones.push({ group: cone, hit: false, tip: 0, axis: new THREE.Vector3(1, 0, 0), velocity: new THREE.Vector3(), home: cone.position.clone(), homeQuat: cone.quaternion.clone() });
    }
    this.headings = data.headings || [];
    this.step = data.step || 1.5;
    this.frames = {
      centre: this.centre,
      laterals: (data.laterals || []).map(v => new THREE.Vector3(...v)),
      normals: (data.normals || []).map(v => new THREE.Vector3(...v)),
    };
    this.traffic.setData(data, this.frames);
    this.checkpoints = (data.checkpoints || []).slice();
    this.nextCheckpoint = 0;
  }

  updateHud(bump = false) {
    if (!this.hud) return;
    this.hud.querySelector('.banana-count b').textContent = String(this.count);
    this.hud.classList.toggle('is-bullet', this.bullet > 0);
    this.hud.querySelector('.banana-meter span').style.width = this.bullet > 0
      ? `${(this.bullet / DOWNHILL_RUN.bulletSeconds) * 100}%` : `${(this.count / DOWNHILL_RUN.bananasForBulletTime) * 100}%`;
    if (bump) { this.hud.classList.remove('bump'); void this.hud.offsetWidth; this.hud.classList.add('bump'); }
  }

  playable() {
    const ctx = this.audio?.context;
    return Boolean(ctx && ctx.state === 'running' && this.audio.master && this.audio.enabled !== false);
  }

  blip(step) {
    if (!this.playable()) return;
    const ctx = this.audio.context, t = ctx.currentTime;
    for (const [k, mult] of [[0, 1], [.06, 1.5]]) {
      const osc = ctx.createOscillator(), g = ctx.createGain();
      osc.type = 'triangle'; osc.frequency.value = (660 + step * 55) * mult;
      g.gain.setValueAtTime(0, t + k); g.gain.linearRampToValueAtTime(.08, t + k + .01); g.gain.exponentialRampToValueAtTime(.001, t + k + .22);
      osc.connect(g).connect(this.audio.master); osc.start(t + k); osc.stop(t + k + .25);
    }
  }

  whoosh(down) {
    if (!this.playable()) return;
    const ctx = this.audio.context, t = ctx.currentTime;
    const osc = ctx.createOscillator(), g = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(down ? 420 : 70, t); osc.frequency.exponentialRampToValueAtTime(down ? 55 : 380, t + .6);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(.18, t + .05); g.gain.exponentialRampToValueAtTime(.001, t + .7);
    osc.connect(g).connect(this.audio.master); osc.start(t); osc.stop(t + .75);
  }

  startBulletTime() {
    this.bullet = DOWNHILL_RUN.bulletSeconds;
    document.body.classList.add('banana-time');
    const audio = this.music?.audio;
    if (audio) { audio.preservesPitch = false; audio.playbackRate = .78; }
    this.whoosh(true);
    this.callouts?.showLabel?.('BANANA TIME!', '5 SEC SLOW-MO', { letters: 'gold', digits: 'cyan-purple', tone: 'gold', level: 3 });
    this.callouts?.chimpCalls?.((this.audio?.context?.currentTime || 0) + .1);
  }

  endBulletTime(silent = false) {
    const was = this.bullet > 0;
    this.bullet = 0;
    if (typeof document !== 'undefined') document.body.classList.remove('banana-time');
    const audio = this.music?.audio;
    if (audio) { audio.playbackRate = 1; audio.preservesPitch = true; }
    if (was && !silent) this.whoosh(false);
  }

  async enterTunnel() {
    this.swapping = true;
    document.body.classList.add('downhill-fade');
    const finished = this.length || 0;
    await new Promise(resolve => setTimeout(resolve, 380));
    let advanced = false;
    try { advanced = Boolean(await this.onAdvance?.()); } catch (error) { console.warn('Next stretch failed', error); }
    if (advanced) {
      this.distanceBase += finished;
      const km = (this.distanceBase / 1000).toFixed(1);
      setTimeout(() => this.callouts?.showLabel?.(`STRETCH ${this.stretch}`, `${km} KM`, { letters: 'cyan-purple', digits: 'gold', tone: 'gold', level: 2 }), 250);
    } else {
      // Could not build a new hill: ride this one again from the top.
      this.onRestart?.();
      for (const b of this.bananas) { b.taken = false; b.pop = 0; }
      for (const c of this.cones) { c.hit = false; c.tip = 0; c.group.position.copy(c.home); c.group.quaternion.copy(c.homeQuat); }
      this.progress = 0;
    }
    document.body.classList.remove('downhill-fade');
    this.swapping = false;
  }

  /** Nearest centre-line index near the last one (cheap progress tracking). */
  track(position) {
    let best = this.progress, bestD = Infinity;
    const from = Math.max(0, this.progress - 30), to = Math.min(this.centre.length - 1, this.progress + 60);
    for (let i = from; i <= to; i++) { const d = this.centre[i].distanceToSquared(position); if (d < bestD) { bestD = d; best = i; } }
    if (bestD > 900) { // lost (respawn/teleport): search everything
      for (let i = 0; i < this.centre.length; i += 4) { const d = this.centre[i].distanceToSquared(position); if (d < bestD) { bestD = d; best = i; } }
    }
    this.progress = best;
    return best;
  }

  /** realDelta: wall-clock seconds; the simulation slow-down is handled by timeScale. */
  hazard(item) {
    const skater = this.lastSkater;
    if (!skater) return;
    if (item.effect === 'bail') { skater.bail?.(item.message || 'WIPEOUT!'); return; }
    if (item.effect === 'oil') {
      this.oilTime = DOWNHILL_RUN.oilSeconds;
      skater.feedback = 'OIL SLICK!'; skater.feedbackTime = 1.4;
      this.skid();
    } else if (item.effect === 'pothole') {
      this.setSpeed(skater, Math.abs(Number(skater.speed) || 0) * .78);
      if (skater.velocity) skater.velocity.y = Math.max(skater.velocity.y, 2.2);
      skater.feedback = 'POTHOLE!'; skater.feedbackTime = 1.2;
      skater.syncCanonicalState?.();
      this.blip(-10);
    }
  }

  skid() {
    if (!this.playable()) return;
    const ctx = this.audio.context, t = ctx.currentTime, src = ctx.createBufferSource();
    const buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * .9), ctx.sampleRate), data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
    src.buffer = buffer;
    const band = ctx.createBiquadFilter(); band.type = 'bandpass'; band.Q.value = 6;
    band.frequency.setValueAtTime(2400, t); band.frequency.exponentialRampToValueAtTime(900, t + .8);
    const g = ctx.createGain(); g.gain.value = .12;
    src.connect(band).connect(g).connect(this.audio.master); src.start(t);
  }

  /** On an oil slick the steering goes wobbly: the board slides side to side. */
  filterInput(state) {
    if (!this.active || this.oilTime <= 0 || !state) return state;
    return { ...state, steer: Math.sin(this.time * 9) * .9 };
  }

  /** Rotate the rider (heading, velocity, travel direction) by delta radians. */
  turn(skater, delta) {
    if (!delta) return;
    skater.heading += delta;
    if (Number.isFinite(skater.airHeading)) skater.airHeading += delta;
    skater.velocity?.applyAxisAngle(UP, delta);
    skater.travelDirection?.applyAxisAngle(UP, delta);
    if (skater.grounded) skater.groundDirection?.(); else skater.forward?.applyAxisAngle(UP, delta);
  }

  setSpeed(skater, magnitude) {
    const sign = Math.sign(Number(skater.speed) || 0) || 1;
    skater.speed = sign * magnitude;
    const v = skater.velocity, len = v.length();
    if (len > .5) v.multiplyScalar(magnitude / len); else v.copy(skater.forward).multiplyScalar(magnitude * sign);
  }

  /** Downhill rules: sharper carving, never more than ±35° off the road, rising speed. */
  ride(dt, skater, input) {
    if (!skater || dt <= 0 || skater.bailTime > 0 || skater.grind || skater.wallRide || skater.transitionAir) return;
    if (!skater.grounded) return; // spins and grabs in the air stay untouched
    const roadYaw = this.headings[Math.min(this.headings.length - 1, this.progress)] ?? skater.heading;
    const speed = Math.abs(Number(skater.speed) || 0);
    const steer = this.oilTime > 0 ? 0 : Number(input?.steer) || 0;
    if (steer) this.turn(skater, -steer * DOWNHILL_RUN.steerAssist * Math.min(1, Math.max(0, (speed - 5) / 15)) * dt);
    const v = skater.velocity;
    if (Math.hypot(v.x, v.z) > 1.5) {
      const diff = wrapAngle(Math.atan2(-v.x, -v.z) - roadYaw);
      if (Math.abs(diff) > DOWNHILL_RUN.maxTurn) this.turn(skater, -(diff - Math.sign(diff) * DOWNHILL_RUN.maxTurn));
    }
    const hard = Math.min(1, (this.stretch - 1) / 5);
    const floor = Math.min(DOWNHILL_RUN.speedFloorMax, DOWNHILL_RUN.speedFloorStart + this.runTime * DOWNHILL_RUN.speedFloorGrowth) * (1 + hard * .1);
    if (speed < floor) this.setSpeed(skater, Math.min(floor, speed + 8 * dt));
    skater.syncCanonicalState?.();
  }

  update(realDelta, skater, camera, input = null) {
    if (!this.active) return;
    this.lastSkater = skater;
    const dt = Math.min(.1, Math.max(0, Number(realDelta) || 0));
    this.time += dt;
    // Bullet time: count down in real time, ease in and out.
    if (this.bullet > 0) {
      this.bullet = Math.max(0, this.bullet - dt);
      if (this.bullet === 0) this.endBulletTime();
      this.updateHud();
    }
    const target = this.bullet > 0 ? DOWNHILL_RUN.bulletScale : 1;
    this.scale += (target - this.scale) * Math.min(1, dt / DOWNHILL_RUN.easeSeconds * 3);
    if (Math.abs(this.scale - target) < .01) this.scale = target;

    const rider = skater?.position;
    const hip = rider ? this.pos.copy(rider).add(new THREE.Vector3(0, .7, 0)) : null;
    // Bananas: spin, bob, collect.
    if (this.bananaMesh && camera) {
      const r2 = DOWNHILL_RUN.pickupRadius ** 2;
      for (let i = 0; i < this.bananas.length; i++) {
        const b = this.bananas[i];
        if (!b.taken && hip && hip.distanceToSquared(b.position) < r2 && !(skater.bailTime > 0)) {
          b.taken = true; b.pop = .3;
          this.count++;
          this.blip(this.count);
          if (this.count >= DOWNHILL_RUN.bananasForBulletTime) { this.count = 0; this.startBulletTime(); }
          this.updateHud(true);
        }
        if (b.taken && b.pop > 0) b.pop = Math.max(0, b.pop - dt);
        // Collected bananas swell and vanish.
        const size = b.taken ? (b.pop > 0 ? 1 + (.3 - b.pop) * 3 : 0) : 1;
        const bob = Math.sin(this.time * 2.4 + b.phase) * .08;
        this.pos.copy(b.position); this.pos.y += bob;
        this.quat.setFromEuler(new THREE.Euler(.25, this.time * 2.6 + b.phase, 0));
        this.scaleV.setScalar(size);
        this.bananaMesh.setMatrixAt(i, this.matrix.compose(this.pos, this.quat, this.scaleV));
        this.scaleV.setScalar(size * .9);
        this.glowMesh.setMatrixAt(i, this.matrix.compose(this.pos, camera.quaternion, this.scaleV));
      }
      this.bananaMesh.instanceMatrix.needsUpdate = true;
      this.glowMesh.instanceMatrix.needsUpdate = true;
    }
    // Cones tip over when hit.
    for (const cone of this.cones) {
      if (!cone.hit && rider && cone.group.position.distanceToSquared(rider) < .5 && Math.abs(Number(skater.speed) || 0) > 2) {
        cone.hit = true;
        const push = skater.velocity ? skater.velocity.clone().setY(0) : new THREE.Vector3(0, 0, -1);
        cone.velocity.copy(push).multiplyScalar(.45).setY(2.2);
        cone.axis.crossVectors(THREE.Object3D.DEFAULT_UP, push.lengthSq() > 0 ? push.normalize() : new THREE.Vector3(0, 0, -1)).normalize();
        this.blip(-6);
      }
      if (cone.hit && cone.tip < 3) {
        cone.tip += dt;
        cone.velocity.y -= 12 * dt;
        cone.group.position.addScaledVector(cone.velocity, dt);
        if (cone.tip > .5) cone.velocity.multiplyScalar(.9);
        cone.group.rotateOnWorldAxis(cone.axis, dt * 7 * Math.max(0, 1 - cone.tip / 1.2));
        if (cone.tip > 1.2) cone.velocity.y = Math.max(0, cone.velocity.y);
      }
    }
    // Riding rules, traffic and checkpoints run on simulation time (slower in bullet time).
    if (rider && this.centre.length && !this.swapping) {
      const simDt = dt * this.scale;
      this.runTime += simDt;
      this.oilTime = Math.max(0, this.oilTime - simDt);
      this.track(rider);
      const progressS = this.progress * this.step;
      this.ride(simDt, skater, input);
      this.traffic.update(simDt, skater, progressS, Math.min(1, (this.stretch - 1) / 5));
      while (this.nextCheckpoint < this.checkpoints.length && progressS >= this.checkpoints[this.nextCheckpoint]) {
        this.nextCheckpoint++;
        const bonus = DOWNHILL_RUN.checkpointBonus * this.stretch;
        this.onCheckpoint?.(bonus);
        this.blip(12);
        this.callouts?.showLabel?.('CHECKPOINT', `+${bonus.toLocaleString('en-US')}`, { letters: 'green', digits: 'gold', tone: 'gold', level: 2 });
      }
    }
    // Reaching the tunnel: freeze behind a fade and build the next stretch.
    if (rider && this.centre.length && !this.swapping) {
      const i = this.track(rider);
      if (i >= this.centre.length - Math.round(26 / 1.5)) this.enterTunnel();
    }
  }
}
