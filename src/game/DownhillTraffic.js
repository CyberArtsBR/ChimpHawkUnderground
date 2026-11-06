import * as THREE from 'three';

/**
 * Downhill Bomb hazards (2026-11): oncoming cars driving up the hill against
 * you, plus road hazards: oil slicks, potholes, fallen rocks, logs and road
 * works. Hit a car, rock, log or barrier and you bail (jump it and you are
 * fine); oil makes the board wobble; a pothole costs speed. Cars steer around
 * ramps and hazards.
 */
export const TRAFFIC = Object.freeze({
  lanes: [-4.6, 0, 4.6],
  aheadMin: 70, aheadMax: 260, behindDespawn: 40,
  upSpeed: [8, 12],     // m/s, oncoming cars coming up the hill
  maxCars: 7,
  spawnEvery: [1.6, 3.4],
  hitMargin: .25,
});

const rand = (a, b) => a + Math.random() * (b - a);
const PAINTS = ['#d63b3b', '#2e6fd6', '#f2f2ee', '#1d1f24', '#3fa66b', '#8b5cd6', '#ff8a2b', '#9aa3ad'];

/** Low-poly car; returns { group, length, width, height, lights }. */
/** Static road hazards. Footprint (w x l), height h and what hitting it does. */
const HAZARD_SPECS = {
  oil: { w: 2.6, l: 3.4, h: 0, effect: 'oil' },
  pothole: { w: 1.5, l: 1.8, h: 0, effect: 'pothole' },
  rock: { w: 1.8, l: 1.8, h: 1.25, effect: 'bail', message: 'ROCKSLIDE!' },
  log: { w: 3.6, l: .8, h: .75, effect: 'bail', message: 'TIMBER!' },
  works: { w: 2.6, l: .7, h: 1.15, effect: 'bail', message: 'ROAD WORKS!' },
};

function blobGeometry(rx, rz, seed) {
  const pts = [];
  for (let k = 0; k < 18; k++) { const a = k / 18 * Math.PI * 2, r = 1 + .18 * Math.sin(a * 3 + seed) + .1 * Math.sin(a * 5 + seed * 2); pts.push(new THREE.Vector2(Math.cos(a) * rx * r, Math.sin(a) * rz * r)); }
  const g = new THREE.ShapeGeometry(new THREE.Shape(pts), 1);
  g.rotateX(-Math.PI / 2);
  return g;
}

function makeHazard(kind) {
  const group = new THREE.Group(); group.name = `Hazard: ${kind}`;
  const seed = Math.random() * 10;
  if (kind === 'oil') {
    const slick = new THREE.Mesh(blobGeometry(1.3, 1.7, seed), new THREE.MeshPhysicalMaterial({
      color: '#07070a', metalness: .2, roughness: .04, clearcoat: 1, iridescence: 1, iridescenceIOR: 1.6, iridescenceThicknessRange: [180, 600],
      polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3,
    }));
    slick.position.y = .02; group.add(slick);
  } else if (kind === 'pothole') {
    const rim = new THREE.Mesh(blobGeometry(.85, 1, seed), new THREE.MeshStandardMaterial({ color: '#4a4844', roughness: 1, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
    const hole = new THREE.Mesh(blobGeometry(.62, .76, seed), new THREE.MeshStandardMaterial({ color: '#0e0d0c', roughness: 1, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }));
    rim.position.y = .015; hole.position.y = .02; group.add(rim, hole);
  } else if (kind === 'rock') {
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(.85, 0), new THREE.MeshStandardMaterial({ color: '#77736b', roughness: .95, flatShading: true }));
    rock.scale.set(1.1, .8, 1); rock.position.y = .55; rock.rotation.set(seed, seed * 2, seed * 3); rock.castShadow = true; group.add(rock);
    for (let k = 0; k < 4; k++) { const pebble = new THREE.Mesh(new THREE.DodecahedronGeometry(.18 + Math.random() * .12, 0), rock.material); pebble.position.set((Math.random() - .5) * 2.2, .12, (Math.random() - .5) * 2.2); pebble.castShadow = true; group.add(pebble); }
  } else if (kind === 'log') {
    const log = new THREE.Mesh(new THREE.CylinderGeometry(.34, .38, 3.6, 12), new THREE.MeshStandardMaterial({ color: '#6b4a2f', roughness: .9 }));
    log.rotation.z = Math.PI / 2; log.position.y = .36; log.castShadow = true; group.add(log);
    for (const x of [-1.8, 1.8]) { const end = new THREE.Mesh(new THREE.CircleGeometry(.36, 12), new THREE.MeshStandardMaterial({ color: '#c79a64', roughness: .8 })); end.position.set(x + Math.sign(x) * .01, .36, 0); end.rotation.y = Math.sign(x) * Math.PI / 2; group.add(end); }
  } else if (kind === 'works') {
    const stripes = document.createElement('canvas'); stripes.width = 256; stripes.height = 32;
    const ctx = stripes.getContext('2d');
    for (let k = 0; k < 8; k++) { ctx.fillStyle = k % 2 ? '#f4f4f4' : '#ff5a1a'; ctx.beginPath(); ctx.moveTo(k * 32, 32); ctx.lineTo(k * 32 + 16, 0); ctx.lineTo(k * 32 + 48, 0); ctx.lineTo(k * 32 + 32, 32); ctx.fill(); }
    const tex = new THREE.CanvasTexture(stripes); tex.colorSpace = THREE.SRGBColorSpace;
    const board = new THREE.Mesh(new THREE.BoxGeometry(2.6, .32, .06), new THREE.MeshStandardMaterial({ map: tex, roughness: .6 }));
    board.position.y = .95; board.castShadow = true; group.add(board);
    const leg = new THREE.MeshStandardMaterial({ color: '#d8d8d8', roughness: .6 });
    for (const x of [-1.1, 1.1]) for (const z of [-.25, .25]) { const l = new THREE.Mesh(new THREE.BoxGeometry(.06, 1.1, .06), leg); l.position.set(x, .52, z); l.rotation.x = z > 0 ? -.25 : .25; l.castShadow = true; group.add(l); }
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(.09, 10, 8), new THREE.MeshStandardMaterial({ color: '#ffb020', emissive: '#ffa000', emissiveIntensity: 4 }));
    lamp.position.set(1.1, 1.2, 0); group.add(lamp);
    group.userData.blink = lamp;
  }
  return group;
}

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
    this.hazards = [];
    this.moving = [];
    this.time = 0;
    this.spawnTimer = 2;
    this.data = null;
    this.tmp = new THREE.Vector3();
    this.onHit = null;
  }

  setData(data, frames) {
    for (const item of [...this.hazards, ...this.moving]) item.group.removeFromParent();
    this.hazards = []; this.moving = [];
    this.data = data; this.frames = frames;
    this.spawnTimer = 2;
    if (!data) return;
    for (const h of data.hazards || []) {
      const spec = HAZARD_SPECS[h.kind];
      if (!spec) continue;
      const group = makeHazard(h.kind);
      const pose = this.pose(h.s, h.u);
      group.position.copy(pose.position); group.quaternion.copy(pose.quaternion);
      if (h.kind === 'oil' || h.kind === 'pothole' || h.kind === 'rock') group.rotateY(h.yaw || 0);
      this.root.add(group);
      this.hazards.push({ group, kind: h.kind, width: spec.w, length: spec.l, height: spec.h, effect: spec.effect, message: spec.message, cooldown: 0 });
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
    // Traffic only comes up the hill, against the rider.
    const up = true;
    const s = progressS + rand(TRAFFIC.aheadMin, TRAFFIC.aheadMax);
    if (s > this.data.length - 60) return;
    const lanes = TRAFFIC.lanes.filter(u => this.laneFree(s, u) && !this.moving.some(c => Math.abs(c.s - s) < 18 && Math.abs(c.u - u) < 2));
    if (!lanes.length) return;
    const u = up ? lanes[0] : lanes[lanes.length - 1]; // oncoming keep left, downhill keep right
    const kinds = ['sedan', 'sedan', 'taxi', 'van', 'pickup'];
    const car = makeCar(kinds[Math.floor(Math.random() * kinds.length)], PAINTS[Math.floor(Math.random() * PAINTS.length)]);
    const speed = -rand(...TRAFFIC.upSpeed) * (1 + hard * .3);
    this.root.add(car.group);
    this.moving.push({ ...car, s, u, target: u, speed, honked: false, effect: 'bail', message: 'HIT A CAR!' });
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
  hits(item, rider, grounded) {
    const inv = item.group.quaternion.clone().invert();
    const local = this.tmp.copy(rider).sub(item.group.position).applyQuaternion(inv);
    const m = item.effect === 'bail' ? TRAFFIC.hitMargin : 0;
    if (Math.abs(local.x) > item.width / 2 + m || Math.abs(local.z) > item.length / 2 + m) return false;
    // Flat hazards only act on wheels on the ground; solid ones unless you clear them.
    if (!item.height) return grounded && local.y < .5;
    return local.y < item.height + .05 && local.y > -1;
  }

  update(dt, skater, progressS, hard) {
    if (!this.data) return;
    this.time += dt;
    for (const h of this.hazards) { if (h.cooldown > 0) h.cooldown -= dt; if (h.group.userData.blink) h.group.userData.blink.visible = (this.time % .8) < .4; }
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
    const grounded = Boolean(skater.grounded);
    for (const item of [...this.moving, ...this.hazards]) {
      if (item.cooldown > 0 || item.group.position.distanceToSquared(rider) > 64) continue;
      if (this.hits(item, rider, grounded)) { item.cooldown = 1.5; this.onHit?.(item); if (item.effect === 'bail') return; }
    }
    for (const car of this.moving) if (!car.honked && car.group.position.distanceToSquared(rider) < 900) { car.honked = true; this.honk(); }
  }
}
