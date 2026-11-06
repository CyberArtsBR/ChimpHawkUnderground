import * as THREE from 'three';

/**
 * Downhill Bomb hazards (2026-11, phase 3): parked cars by the curb and live
 * traffic, both ways. Hitting a car makes you bail; ollie over it and you are
 * fine. Cars steer around ramps and other features. Presentation + a bail
 * call only: no change to the skate physics.
 */
export const TRAFFIC = Object.freeze({
  lanes: [-4.6, 0, 4.6],
  aheadMin: 70, aheadMax: 260, behindDespawn: 40,
  downSpeed: [9, 14],   // m/s, cars going downhill (you overtake them)
  upSpeed: [8, 12],     // m/s, oncoming cars coming up the hill
  maxCars: 7,
  spawnEvery: [1.6, 3.4],
  hitMargin: .25,
});

const rand = (a, b) => a + Math.random() * (b - a);
const PAINTS = ['#d63b3b', '#2e6fd6', '#f2f2ee', '#1d1f24', '#3fa66b', '#8b5cd6', '#ff8a2b', '#9aa3ad'];

/** Low-poly car; returns { group, length, width, height, lights }. */
function makeCar(kind, paint) {
  const group = new THREE.Group();
  const spec = { sedan: [4.4, 1.8, 1.42], taxi: [4.5, 1.82, 1.46], van: [5.0, 2.0, 2.1], pickup: [5.2, 1.95, 1.75] }[kind];
  const [L, W, H] = spec;
  const body = new THREE.MeshStandardMaterial({ color: kind === 'taxi' ? '#f5c518' : paint, metalness: .55, roughness: .32 });
  const glass = new THREE.MeshStandardMaterial({ color: '#1b2533', metalness: .9, roughness: .08 });
  const dark = new THREE.MeshStandardMaterial({ color: '#16171b', roughness: .7 });
  const add = (geometry, material, x, y, z) => { const m = new THREE.Mesh(geometry, material); m.position.set(x, y, z); m.castShadow = true; group.add(m); return m; };
  // Lower body (nose toward -Z, like the rider's forward).
  add(new THREE.BoxGeometry(W, H * .45, L), body, 0, .32 + H * .225, 0);
  if (kind === 'van') add(new THREE.BoxGeometry(W * .98, H * .5, L * .8), body, 0, .32 + H * .7, L * .08);
  else if (kind === 'pickup') add(new THREE.BoxGeometry(W * .94, H * .42, L * .38), body, 0, .32 + H * .66, -L * .1);
  else add(new THREE.BoxGeometry(W * .9, H * .4, L * .5), body, 0, .32 + H * .64, L * .04);
  // Windows band.
  const cabinLen = kind === 'van' ? L * .8 : kind === 'pickup' ? L * .38 : L * .5;
  const cabinZ = kind === 'van' ? L * .08 : kind === 'pickup' ? -L * .1 : L * .04;
  add(new THREE.BoxGeometry(W * .92, H * .22, cabinLen * .96), glass, 0, .32 + H * (kind === 'van' ? .78 : .66), cabinZ);
  if (kind === 'taxi') {
    const sign = add(new THREE.BoxGeometry(.7, .22, .3), new THREE.MeshStandardMaterial({ color: '#fff7d6', emissive: '#ffe08a', emissiveIntensity: 1.5 }), 0, .32 + H * .9, cabinZ);
    sign.castShadow = false;
  }
  // Wheels.
  const wheel = new THREE.CylinderGeometry(.34, .34, .26, 14); wheel.rotateZ(Math.PI / 2);
  for (const [x, z] of [[-W / 2, -L * .32], [W / 2, -L * .32], [-W / 2, L * .32], [W / 2, L * .32]]) add(wheel, dark, x, .34, z);
  // Lights: headlights at the nose, tail lights at the back.
  const head = new THREE.MeshStandardMaterial({ color: '#fffbe8', emissive: '#fff1c0', emissiveIntensity: 3 });
  const tail = new THREE.MeshStandardMaterial({ color: '#ff2a2a', emissive: '#ff2020', emissiveIntensity: 2.6 });
  for (const x of [-W * .35, W * .35]) {
    add(new THREE.BoxGeometry(.38, .14, .05), head, x, .32 + H * .32, -L / 2 - .01).castShadow = false;
    add(new THREE.BoxGeometry(.36, .12, .05), tail, x, .32 + H * .32, L / 2 + .01).castShadow = false;
  }
  return { group, length: L, width: W, height: H + .32 };
}

export class DownhillTraffic {
  constructor(root, audio = null) {
    this.root = root;
    this.audio = audio;
    this.parked = [];
    this.moving = [];
    this.spawnTimer = 2;
    this.data = null;
    this.tmp = new THREE.Vector3();
    this.onHit = null;
  }

  setData(data, frames) {
    for (const car of [...this.parked, ...this.moving]) car.group.removeFromParent();
    this.parked = []; this.moving = [];
    this.data = data; this.frames = frames;
    this.spawnTimer = 2;
    if (!data) return;
    const kinds = ['sedan', 'sedan', 'taxi', 'van', 'pickup'];
    for (const p of data.parked || []) {
      const car = makeCar(kinds[Math.floor(Math.random() * kinds.length)], PAINTS[Math.floor(Math.random() * PAINTS.length)]);
      const pose = this.pose(p.s, p.u);
      car.group.position.copy(pose.position); car.group.quaternion.copy(pose.quaternion);
      this.root.add(car.group);
      this.parked.push({ ...car, s: p.s, u: p.u });
    }
  }

  /** Road pose at distance s and lateral offset u (follows banking). */
  pose(s, u) {
    const f = this.frames, step = this.data.step || 1.5;
    const x = Math.max(0, Math.min(f.centre.length - 1.001, s / step)), i = Math.floor(x), t = x - i;
    const c = f.centre[i].clone().lerp(f.centre[i + 1], t);
    const lat = f.laterals[i].clone().lerp(f.laterals[i + 1], t).normalize();
    const nor = f.normals[i].clone().lerp(f.normals[i + 1], t).normalize();
    const ahead = f.centre[Math.min(f.centre.length - 1, i + 2)].clone().sub(f.centre[Math.max(0, i - 1)]).normalize();
    const position = c.addScaledVector(lat, u);
    // Car local axes: +X right (lateral), +Y up (normal), +Z backward (-ahead).
    const back = ahead.clone().negate();
    const right = new THREE.Vector3().crossVectors(nor, back).normalize();
    const m = new THREE.Matrix4().makeBasis(right, nor, back);
    return { position, quaternion: new THREE.Quaternion().setFromRotationMatrix(m) };
  }

  laneFree(s, u) {
    return !(this.data.occupied || []).some(o => Math.abs(o.u - u) < 1.2 && o.s1 > s - 6 && o.s0 < s + 6);
  }

  spawn(progressS, hard) {
    const up = Math.random() < .45;
    const s = progressS + rand(TRAFFIC.aheadMin, TRAFFIC.aheadMax);
    if (s > this.data.length - 60) return;
    const lanes = TRAFFIC.lanes.filter(u => this.laneFree(s, u) && !this.moving.some(c => Math.abs(c.s - s) < 18 && Math.abs(c.u - u) < 2));
    if (!lanes.length) return;
    const u = up ? lanes[0] : lanes[lanes.length - 1]; // oncoming keep left, downhill keep right
    const kinds = ['sedan', 'sedan', 'taxi', 'van', 'pickup'];
    const car = makeCar(kinds[Math.floor(Math.random() * kinds.length)], PAINTS[Math.floor(Math.random() * PAINTS.length)]);
    const speed = up ? -rand(...TRAFFIC.upSpeed) * (1 + hard * .3) : rand(...TRAFFIC.downSpeed);
    this.root.add(car.group);
    this.moving.push({ ...car, s, u, target: u, speed, honked: false });
  }

  honk() {
    const ctx = this.audio?.context;
    if (!ctx || ctx.state !== 'running' || !this.audio.master || this.audio.enabled === false) return;
    const t = ctx.currentTime, gain = ctx.createGain(), filter = ctx.createBiquadFilter();
    filter.type = 'lowpass'; filter.frequency.value = 1800;
    gain.gain.setValueAtTime(0, t); gain.gain.linearRampToValueAtTime(.09, t + .02);
    gain.gain.setValueAtTime(.09, t + .38); gain.gain.exponentialRampToValueAtTime(.001, t + .5);
    for (const f of [392, 494]) { const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.connect(filter); o.start(t); o.stop(t + .52); }
    filter.connect(gain).connect(this.audio.master);
  }

  /** Is the rider overlapping this car (and not clearing it in the air)? */
  hits(car, rider) {
    const inv = car.group.quaternion.clone().invert();
    const local = this.tmp.copy(rider).sub(car.group.position).applyQuaternion(inv);
    const m = TRAFFIC.hitMargin;
    return Math.abs(local.x) < car.width / 2 + m && Math.abs(local.z) < car.length / 2 + m && local.y < car.height + .05 && local.y > -1;
  }

  update(dt, skater, progressS, hard) {
    if (!this.data) return;
    // Spawn ahead, despawn behind.
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0 && this.moving.length < TRAFFIC.maxCars + Math.round(hard * 3)) {
      this.spawn(progressS, hard);
      const [a, b] = TRAFFIC.spawnEvery;
      this.spawnTimer = rand(a, b) * (1 - hard * .35);
    }
    for (let k = this.moving.length - 1; k >= 0; k--) {
      const car = this.moving[k];
      car.s += car.speed * dt;
      // Swerve around features ahead in this lane.
      const look = car.s + Math.sign(car.speed) * 22;
      if (!this.laneFree(look, car.target)) {
        const free = TRAFFIC.lanes.filter(u => this.laneFree(look, u));
        if (free.length) car.target = free.reduce((a, b) => Math.abs(b - car.u) < Math.abs(a - car.u) ? b : a);
      }
      car.u += (car.target - car.u) * Math.min(1, dt * 1.6);
      if (car.s < progressS - TRAFFIC.behindDespawn || car.s > this.data.length - 30 || car.s < 5) { car.group.removeFromParent(); this.moving.splice(k, 1); continue; }
      const pose = this.pose(car.s, car.u);
      car.group.position.copy(pose.position);
      car.group.quaternion.copy(pose.quaternion);
      if (car.speed < 0) car.group.rotateY(Math.PI); // oncoming: nose up the hill
    }
    // Hits and honks.
    const rider = skater?.position;
    if (!rider || skater.bailTime > 0) return;
    for (const car of [...this.moving, ...this.parked]) {
      const d2 = car.group.position.distanceToSquared(rider);
      if (d2 > 64) continue;
      if (car.speed !== undefined && !car.honked && d2 < 400) { car.honked = true; this.honk(); }
      if (this.hits(car, rider)) { this.onHit?.(car); return; }
    }
    for (const car of this.moving) if (!car.honked && car.group.position.distanceToSquared(rider) < 900) { car.honked = true; this.honk(); }
  }
}
