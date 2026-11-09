import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { seededRandom } from '../MapScan.js';

/**
 * World Life, Orbit pack (2026-11). Presentation only: nothing here is solid,
 * collides, or writes back to the skater.
 *  - Glowing tiles: the floor grid cell under each truck lights cyan once per
 *    entry and fades over 0.8 s (max 48 pooled). Cells match FloorFinish's
 *    'orbit-floor' seams: 4 m squares on world x/z multiples of 4.
 *  - Landing ripple: a thin ring expands over 0.7 s to 4 m x severity (max 4).
 *  - Hover bots (max 4): glowing orbs wandering 1.2-2.2 m over open floor;
 *    a rider within 4 m (or the camera's line to the rider) makes one dart
 *    3-5 m away with a beep (one per 2 s per bot).
 *  - REC drone: hovers 5-7 m from the rider on the far side from the camera,
 *    3-4 m up, blinking red at 1 Hz; it keeps >= 1.5 m from the camera-rider
 *    line. It is silent: LifeAudio voices are fixed where they start, and a
 *    hum re-triggered every ~1.5 s on frame time left audible seams.
 * Orbit has no dressing anchors: bots use MapDressing's floor scan, which
 * arrives asynchronously, so they are placed lazily in update().
 */
export const ORBIT_LIFE = Object.freeze({
  tileSize: 4, tileMax: 48, tileFade: .8, tileAttack: .05, tileLift: .01, tileGlow: .5,
  truckOffset: .4, floorNormalY: .95, floorTolerance: .12,
  rippleMax: 4, rippleTime: .7, rippleRadius: 4, rippleMinRadius: .3, rippleGlow: .8,
  botMax: 4, botNear: 4, botDart: [3, 5], botDartTime: .7, botHeight: [1.2, 2.2], botBeepGap: 2,
  botSpeed: .7, botSpread: 12, botWander: 10, botSpawnClear: 6, botLineClear: 1.2,
  droneDistance: [5, 7], droneHeight: [3, 4], droneSegmentClear: 1.5,
  riderClear: 1.2,
});
const TAU = Math.PI * 2;
const CYAN = new THREE.Color('#4fe3ff'), VIOLET = new THREE.Color('#c879ff');
const RED_ON = new THREE.Color(1, .08, .1).multiplyScalar(3), RED_OFF = new THREE.Color(.12, .01, .01);
const DOWN = new THREE.Vector3(0, -1, 0);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const rand = (a, b) => a + Math.random() * (b - a);
const wrapAngle = a => Math.atan2(Math.sin(a), Math.cos(a));
const NO_CELL = 0x7fffffff;
const PATH_CHECKS = [.25, .5, .75, 1];
const DART_TURNS = [0, .5, -.5, 1, -1, 1.6, -1.6, 2.2, -2.2]; // radians off straight away
const cellKey = (ix, iz) => (ix + 32768) * 65536 + (iz + 32768);

/** Distance from p to segment ab; the closest point is written to `out`. */
function segmentDistance(p, a, b, out) {
  const abx = b.x - a.x, aby = b.y - a.y, abz = b.z - a.z;
  const lengthSq = abx * abx + aby * aby + abz * abz;
  const t = lengthSq > 1e-9 ? clamp(((p.x - a.x) * abx + (p.y - a.y) * aby + (p.z - a.z) * abz) / lengthSq, 0, 1) : 0;
  out.set(a.x + abx * t, a.y + aby * t, a.z + abz * t);
  return p.distanceTo(out);
}

// ------------------------------------------------------------ textures
function dataTexture(size, value) {
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const k = Math.round(255 * clamp(value((x + .5) / size, (y + .5) / size), 0, 1));
    data.set([k, k, k, 255], (y * size + x) * 4);
  }
  const texture = new THREE.DataTexture(data, size, size);
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}
/** A lit floor cell: a bright band just inside the dark seam, a soft fill inside. */
const tileTexture = () => dataTexture(128, (u, v) => {
  const edge = Math.min(u, 1 - u, v, 1 - v) * ORBIT_LIFE.tileSize; // metres from the seam
  if (edge < .045) return 0;
  return Math.max(Math.exp(-(((edge - .12) / .06) ** 2)), .16 + .3 * Math.exp(-(edge - .05) / .3));
});
/** A thin ring on the plane's rim with a faint inner wash. */
const ringTexture = () => dataTexture(128, (u, v) => {
  const r = Math.hypot(u * 2 - 1, v * 2 - 1);
  if (r > 1) return 0;
  return Math.exp(-(((r - .9) / .04) ** 2)) + .18 * Math.exp(-(((r - .78) / .12) ** 2)) * (r < .9 ? 1 : 0);
});
function glowTexture() {
  return dataTexture(32, (u, v) => {
    const r2 = (u * 2 - 1) ** 2 + (v * 2 - 1) ** 2;
    return r2 < 1 ? Math.exp(-r2 * 5) : 0;
  });
}

// ------------------------------------------------------------ drone model
function colored(geometry, color) {
  const g = geometry.index ? geometry.toNonIndexed() : geometry;
  if (g !== geometry) geometry.dispose();
  if (g.attributes.uv) g.deleteAttribute('uv');
  const c = new THREE.Color(color), n = g.attributes.position.count, colors = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return g;
}
function merged(parts) {
  const g = mergeGeometries(parts, false);
  parts.forEach(p => p.dispose());
  g.computeBoundingSphere();
  return g;
}
const ARM = .22;
function droneBodyGeometry() {
  const parts = [
    colored(new THREE.BoxGeometry(.34, .1, .26), '#2b303c'),
    colored(new THREE.BoxGeometry(.2, .05, .16).translate(0, .07, -.01), '#3c4456'),
    colored(new THREE.BoxGeometry(.1, .018, .012).translate(0, .02, .135), '#4fe3ff'),
    colored(new THREE.SphereGeometry(.05, 12, 8).translate(0, -.075, .1), '#0b0c10'),
  ];
  for (const angle of [Math.PI / 4, -Math.PI / 4]) parts.push(colored(new THREE.BoxGeometry(.66, .025, .035).rotateY(angle), '#20242d'));
  for (const [x, z] of [[ARM, ARM], [-ARM, ARM], [ARM, -ARM], [-ARM, -ARM]]) parts.push(colored(new THREE.CylinderGeometry(.032, .032, .05, 10).translate(x, .025, z), '#15181e'));
  return merged(parts);
}
function rotorGeometry() {
  const parts = [];
  for (const [x, z] of [[ARM, ARM], [-ARM, ARM], [ARM, -ARM], [-ARM, -ARM]]) parts.push(colored(new THREE.CylinderGeometry(.115, .115, .006, 20).translate(x, .058, z), '#ffffff'));
  return merged(parts);
}

// ------------------------------------------------------------ the module
export class OrbitLife {
  constructor() {
    this.parks = ['orbit'];
    this.root = new THREE.Group();
    this.root.name = 'World life: orbit';
    this.density = 1;
    this.time = 0;
    this.ctx = null;
    this.reactions = null;
    this.unsubscribe = [];
    this.scanRef = null;
    this.floorY = null;
    this.lattice = null;
    this.open = [];
    this.pendingLanding = { active: false, point: new THREE.Vector3(), severity: 0 };
    this.riderCenter = new THREE.Vector3();
    this.forward = new THREE.Vector3();
    this.scratch = new THREE.Vector3();
    this.scratchB = new THREE.Vector3();
    this.closest = new THREE.Vector3();
    this.matrix = new THREE.Matrix4();
    this.quat = new THREE.Quaternion();
    this.euler = new THREE.Euler();
    this.scale = new THREE.Vector3();
    this.color = new THREE.Color();

    // Everything is built now, so shader warm-up compiles every program.
    const additive = (name, map) => new THREE.MeshBasicMaterial({
      name, map, color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, toneMapped: false, fog: false,
    });
    const black = new THREE.Color(0, 0, 0);
    const instanced = (name, geometry, material, max, color = true) => {
      const mesh = new THREE.InstancedMesh(geometry, material, max);
      mesh.name = name; mesh.frustumCulled = false; mesh.castShadow = false; mesh.receiveShadow = false;
      if (color) for (let i = 0; i < max; i++) mesh.setColorAt(i, black);
      mesh.count = 0;
      this.root.add(mesh);
      return mesh;
    };
    this.tileMaterial = additive('World life / orbit lit tile', tileTexture());
    this.tileMesh = instanced('World life orbit tiles', new THREE.PlaneGeometry(ORBIT_LIFE.tileSize, ORBIT_LIFE.tileSize).rotateX(-Math.PI / 2), this.tileMaterial, ORBIT_LIFE.tileMax);
    this.tileMesh.renderOrder = 2;
    this.tiles = Array.from({ length: ORBIT_LIFE.tileMax }, () => ({ alive: false, ix: 0, iz: 0, age: 0 }));
    this.trucks = [{ cell: NO_CELL }, { cell: NO_CELL }];

    this.rippleMaterial = additive('World life / orbit landing ripple', ringTexture());
    this.rippleMesh = instanced('World life orbit ripples', new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2), this.rippleMaterial, ORBIT_LIFE.rippleMax);
    this.rippleMesh.renderOrder = 2;
    this.ripples = Array.from({ length: ORBIT_LIFE.rippleMax }, () => ({ alive: false, center: new THREE.Vector3(), age: 0, life: 0, max: 0, radius: 0 }));

    this.botMaterial = new THREE.MeshBasicMaterial({ name: 'World life / orbit bot core', color: 0xffffff, toneMapped: false, fog: false });
    this.botMesh = instanced('World life orbit bots', new THREE.SphereGeometry(.11, 16, 12), this.botMaterial, ORBIT_LIFE.botMax);
    this.ringMaterial = new THREE.MeshStandardMaterial({ name: 'World life / orbit bot ring', color: '#2a2f3d', metalness: .7, roughness: .3 });
    this.ringMesh = instanced('World life orbit bot rings', new THREE.TorusGeometry(.19, .016, 6, 28), this.ringMaterial, ORBIT_LIFE.botMax, false);
    this.glow = glowTexture();
    this.haloMaterial = new THREE.PointsMaterial({
      name: 'World life / orbit bot halo', size: .85, sizeAttenuation: true, map: this.glow, vertexColors: true,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, fog: false,
    });
    const haloGeometry = new THREE.BufferGeometry();
    haloGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(ORBIT_LIFE.botMax * 3), 3));
    haloGeometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(ORBIT_LIFE.botMax * 3), 3));
    this.halos = new THREE.Points(haloGeometry, this.haloMaterial);
    this.halos.name = 'World life orbit bot halos'; this.halos.frustumCulled = false;
    this.root.add(this.halos);
    this.bots = Array.from({ length: ORBIT_LIFE.botMax }, (_, index) => ({
      index, state: 'hidden', position: new THREE.Vector3(), home: new THREE.Vector3(), target: new THREE.Vector3(),
      velocity: new THREE.Vector3(), from: new THREE.Vector3(), to: new THREE.Vector3(), t: 0, height: 1.6, phase: index * 1.7,
      lastBeep: -Infinity, retarget: 0, cooldown: 0, color: index % 2 ? CYAN : VIOLET,
    }));

    this.droneMaterial = new THREE.MeshStandardMaterial({ name: 'World life / orbit drone', vertexColors: true, metalness: .55, roughness: .38 });
    this.rotorMaterial = new THREE.MeshBasicMaterial({ name: 'World life / orbit drone rotors', color: '#b8c4d8', transparent: true, opacity: .28, depthWrite: false, fog: false });
    this.droneLightMaterial = new THREE.MeshBasicMaterial({ name: 'World life / orbit drone REC light', color: RED_OFF, toneMapped: false, fog: false });
    const droneRoot = new THREE.Group();
    droneRoot.name = 'World life orbit REC drone';
    const body = new THREE.Mesh(droneBodyGeometry(), this.droneMaterial);
    body.castShadow = false;
    const rotors = new THREE.Mesh(rotorGeometry(), this.rotorMaterial);
    const light = new THREE.Mesh(new THREE.SphereGeometry(.035, 10, 8), this.droneLightMaterial);
    light.position.set(0, .1, -.1);
    droneRoot.add(body, rotors, light);
    droneRoot.visible = false;
    this.root.add(droneRoot);
    this.drone = {
      root: droneRoot, ready: false, lightOn: false, theta: 0, radius: 6, height: 3.5, groundY: -Infinity,
      probeTimer: 0, lastRider: new THREE.Vector3(),
    };
    this.probePoint = new THREE.Vector3(); this.probeNormal = new THREE.Vector3();
  }

  get motion() { return this.ctx?.reducedMotion ? .5 : 1; }

  setWorld(world, ctx) {
    this.ctx = ctx;
    this.clearAgents();
    if (ctx?.reactions && ctx.reactions !== this.reactions) {
      this.unsubscribe.forEach(off => off());
      this.reactions = ctx.reactions;
      this.unsubscribe = [this.reactions.on('landing', e => this.onLanding(e))];
    }
  }

  setQuality(settings) {
    const density = settings?.name === 'performance' ? 0 : Number(settings?.vfxScale) < 1 ? .5 : 1;
    const changed = density !== this.density;
    this.density = density;
    this.root.visible = density > 0;
    if (density === 0) this.reset();
    else if (changed) this.clearAgents(); // re-placed lazily with the new counts
  }

  onLanding(event) {
    if (this.density <= 0 || !this.root.parent) return;
    this.pendingLanding.active = true;
    this.pendingLanding.point.copy(event.point);
    this.pendingLanding.severity = event.severity;
  }

  clearAgents() {
    for (const tile of this.tiles) tile.alive = false;
    for (const ripple of this.ripples) ripple.alive = false;
    this.trucks[0].cell = this.trucks[1].cell = NO_CELL;
    this.tileMesh.count = 0;
    this.rippleMesh.count = 0;
    for (const bot of this.bots) bot.state = 'hidden';
    this.botMesh.count = 0;
    this.ringMesh.count = 0;
    this.halos.geometry.attributes.color.array.fill(0);
    this.halos.geometry.attributes.color.needsUpdate = true;
    this.drone.root.visible = false;
    this.drone.ready = false;
    this.pendingLanding.active = false;
    this.scanRef = null; this.floorY = null; this.lattice = null; this.open = [];
  }

  // ------------------------------------------------------------ the floor
  /**
   * Floor level (the most common scan height) and the "open floor" lattice:
   * scan samples at floor level whose 3x3 neighbourhood and axis neighbours
   * two steps out are floor too (no ramp, ledge or wall within a few metres).
   */
  analyseScan(scan) {
    const floor = scan?.floor || [];
    const hist = new Map();
    let best = null, bestCount = 0;
    for (const f of floor) {
      const k = Math.round(f.point.y * 20), n = (hist.get(k) || 0) + 1;
      hist.set(k, n);
      if (n > bestCount) { bestCount = n; best = k; }
    }
    if (best === null) return false;
    this.floorY = best / 20;
    const level = floor.filter(f => Math.abs(f.point.y - this.floorY) < .05).map(f => f.point);
    const xs = [...new Set(level.map(p => Math.round(p.x * 100) / 100))].sort((a, b) => a - b);
    let step = Infinity;
    for (let i = 1; i < xs.length; i++) if (xs[i] - xs[i - 1] > .5) step = Math.min(step, xs[i] - xs[i - 1]);
    if (!Number.isFinite(step)) step = 3;
    const x0 = Math.min(...level.map(p => p.x)), z0 = Math.min(...level.map(p => p.z));
    const index = (p, axis, origin) => Math.round((p[axis] - origin) / step);
    const flat = new Set(level.map(p => cellKey(index(p, 'x', x0), index(p, 'z', z0))));
    const ring = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1], [-2, 0], [2, 0], [0, -2], [0, 2]];
    this.open = level.filter(p => {
      const i = index(p, 'x', x0), j = index(p, 'z', z0);
      return ring.every(([a, b]) => flat.has(cellKey(i + a, j + b)));
    });
    this.lattice = { x0, z0, step, open: new Set(this.open.map(p => cellKey(index(p, 'x', x0), index(p, 'z', z0)))) };
    return true;
  }

  isOpen(x, z) {
    const l = this.lattice;
    return Boolean(l) && l.open.has(cellKey(Math.round((x - l.x0) / l.step), Math.round((z - l.z0) / l.step)));
  }

  /** Open both at `to` and along the way from `from`. */
  isOpenPath(from, to) {
    for (const f of PATH_CHECKS) if (!this.isOpen(from.x + (to.x - from.x) * f, from.z + (to.z - from.z) * f)) return false;
    return true;
  }

  // ------------------------------------------------------------ update
  update(dt, skater, camera, ctx) {
    if (this.density <= 0 || !skater?.position) return;
    this.ctx = ctx;
    this.time += dt;
    const p = skater.position;
    this.riderCenter.set(p.x, p.y + .9, p.z);
    if (ctx.scan !== this.scanRef && ctx.scan?.floor?.length) {
      this.scanRef = ctx.scan;
      if (this.analyseScan(ctx.scan)) this.placeBots(p);
    }
    this.detectTiles(skater);
    this.updateTiles(dt);
    this.updateRipples(dt, skater);
    this.updateBots(dt, skater, camera);
    if (camera?.position) this.updateDrone(dt, skater, camera, ctx);
  }

  // ------------------------------------------------------------ tiles
  onFloor(skater) {
    if (this.floorY === null || !skater.grounded || skater.grind || skater.wallRide || skater.bailTime > 0) return false;
    if ((skater.normal?.y ?? 1) <= ORBIT_LIFE.floorNormalY) return false;
    return Math.abs(skater.position.y - this.floorY) < ORBIT_LIFE.floorTolerance;
  }

  detectTiles(skater) {
    const trucks = this.trucks;
    if (!this.onFloor(skater)) { trucks[0].cell = trucks[1].cell = NO_CELL; return; }
    const f = skater.forward, size = ORBIT_LIFE.tileSize;
    this.forward.set(f?.x || 0, 0, f?.z || 0);
    if (this.forward.lengthSq() < 1e-6) this.forward.set(0, 0, -1);
    this.forward.normalize();
    for (let k = 0; k < 2; k++) {
      const s = (k ? -1 : 1) * ORBIT_LIFE.truckOffset;
      const ix = Math.floor((skater.position.x + this.forward.x * s) / size);
      const iz = Math.floor((skater.position.z + this.forward.z * s) / size);
      const key = cellKey(ix, iz);
      if (key === trucks[k].cell) continue;
      trucks[k].cell = key;
      // One light per cell entry: the second truck following into the cell
      // the first one just lit does not light it again.
      if (trucks[1 - k].cell !== key) this.lightCell(ix, iz);
    }
  }

  lightCell(ix, iz) {
    const cap = Math.max(1, Math.round(ORBIT_LIFE.tileMax * this.density));
    let slot = null;
    for (let i = 0; i < cap; i++) {
      const tile = this.tiles[i];
      if (tile.alive && tile.ix === ix && tile.iz === iz) { tile.age = 0; return tile; }
      if (!tile.alive) { if (!slot || slot.alive) slot = tile; }
      else if (!slot || (slot.alive && tile.age > slot.age)) slot = tile;
    }
    slot.alive = true; slot.ix = ix; slot.iz = iz; slot.age = 0;
    return slot;
  }

  updateTiles(dt) {
    const { tileFade, tileAttack, tileGlow, tileSize, tileLift } = ORBIT_LIFE;
    const mesh = this.tileMesh;
    let n = 0;
    for (const tile of this.tiles) {
      if (!tile.alive) continue;
      tile.age += dt;
      if (tile.age >= tileFade) { tile.alive = false; continue; }
      const k = tile.age < tileAttack ? tile.age / tileAttack : (1 - (tile.age - tileAttack) / (tileFade - tileAttack)) ** 2;
      this.matrix.makeTranslation(tile.ix * tileSize + tileSize / 2, this.floorY + tileLift, tile.iz * tileSize + tileSize / 2);
      mesh.setMatrixAt(n, this.matrix);
      mesh.setColorAt(n, this.color.copy(CYAN).multiplyScalar(tileGlow * k));
      n++;
    }
    mesh.count = n;
    mesh.instanceMatrix.needsUpdate = true;
    mesh.instanceColor.needsUpdate = true;
  }

  // ------------------------------------------------------------ ripples
  updateRipples(dt, skater) {
    const landing = this.pendingLanding, motion = this.motion;
    if (landing.active) {
      landing.active = false;
      const max = ORBIT_LIFE.rippleRadius * clamp(landing.severity, 0, 1) * motion;
      const flat = this.floorY !== null && (skater.normal?.y ?? 1) > ORBIT_LIFE.floorNormalY
        && Math.abs(landing.point.y - this.floorY) < ORBIT_LIFE.floorTolerance;
      if (flat && max >= ORBIT_LIFE.rippleMinRadius) {
        const cap = Math.max(1, Math.round(ORBIT_LIFE.rippleMax * this.density));
        let slot = null;
        for (let i = 0; i < cap; i++) {
          const r = this.ripples[i];
          if (!r.alive) { slot = r; break; }
          if (!slot || r.age / r.life > slot.age / slot.life) slot = r;
        }
        slot.alive = true; slot.age = 0; slot.life = ORBIT_LIFE.rippleTime / motion; slot.max = max; slot.radius = 0;
        slot.center.set(landing.point.x, this.floorY + ORBIT_LIFE.tileLift * 1.5, landing.point.z);
      }
    }
    const mesh = this.rippleMesh;
    let n = 0;
    for (const r of this.ripples) {
      if (!r.alive) continue;
      r.age += dt;
      const u = r.age / r.life;
      if (u >= 1) { r.alive = false; continue; }
      r.radius = r.max * (1 - (1 - u) ** 2);
      this.scale.set(Math.max(.01, r.radius), 1, Math.max(.01, r.radius));
      mesh.setMatrixAt(n, this.matrix.compose(r.center, this.quat.identity(), this.scale));
      mesh.setColorAt(n, this.color.copy(CYAN).multiplyScalar(ORBIT_LIFE.rippleGlow * (1 - u) ** 1.5));
      n++;
    }
    mesh.count = n;
    mesh.instanceMatrix.needsUpdate = true;
    mesh.instanceColor.needsUpdate = true;
  }

  // ------------------------------------------------------------ hover bots
  placeBots(rider) {
    for (const bot of this.bots) bot.state = 'hidden';
    const cap = Math.round(ORBIT_LIFE.botMax * this.density);
    const random = seededRandom('orbit-life-bots');
    const order = this.open.map((_, i) => i);
    for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
    let placed = 0;
    for (const i of order) {
      if (placed >= cap) break;
      const point = this.open[i];
      if (Math.hypot(point.x - rider.x, point.z - rider.z) < ORBIT_LIFE.botSpawnClear) continue;
      if (this.bots.some(b => b.state !== 'hidden' && Math.hypot(b.home.x - point.x, b.home.z - point.z) < ORBIT_LIFE.botSpread)) continue;
      const bot = this.bots[placed++];
      const [lo, hi] = ORBIT_LIFE.botHeight;
      bot.state = 'wander';
      bot.height = lo + .25 + random() * (hi - lo - .5);
      bot.home.set(point.x, this.floorY, point.z);
      bot.position.set(point.x, this.floorY + bot.height, point.z);
      bot.velocity.set(0, 0, 0);
      bot.lastBeep = -Infinity; bot.cooldown = 0;
      this.pickTarget(bot);
    }
  }

  pickTarget(bot) {
    bot.retarget = rand(5, 9);
    for (let tries = 0; tries < 8 && this.open.length; tries++) {
      const p = this.open[Math.floor(Math.random() * this.open.length)];
      if (Math.hypot(p.x - bot.home.x, p.z - bot.home.z) > ORBIT_LIFE.botWander) continue;
      if (!this.isOpenPath(bot.position, p)) continue;
      bot.target.set(p.x, 0, p.z);
      return;
    }
    // No reachable spot: idle around home in a small circle.
    const a = Math.random() * TAU;
    bot.target.set(bot.home.x + Math.cos(a) * 1.5, 0, bot.home.z + Math.sin(a) * 1.5);
  }

  /**
   * Dart 3-5 m (half with reduced motion) away from the rider, over open floor.
   * No open spot at that range: try half the distance, else stay put (the
   * rider clamp still holds) and look again shortly. Returns whether it darted.
   */
  dart(bot, skater) {
    const p = skater.position, motion = this.motion;
    let dx = bot.position.x - p.x, dz = bot.position.z - p.z;
    let len = Math.hypot(dx, dz);
    const before = len;
    if (len < 1e-4) { dx = 1; dz = 0; len = 1; }
    dx /= len; dz /= len;
    // A fast rider: get out of the line of travel, not just ahead of it.
    const vx = skater.velocity?.x || 0, vz = skater.velocity?.z || 0, speed = Math.hypot(vx, vz);
    if (speed > 2) {
      const ux = vx / speed, uz = vz / speed, along = dx * ux + dz * uz;
      let lx = dx - along * ux, lz = dz - along * uz;
      const ll = Math.hypot(lx, lz);
      if (ll > 1e-3) { lx /= ll; lz /= ll; } else { lx = -uz; lz = ux; }
      dx = lx + dx * .5; dz = lz + dz * .5;
      len = Math.hypot(dx, dz); dx /= len; dz /= len;
    }
    const full = rand(...ORBIT_LIFE.botDart) * motion;
    let chosen = false;
    for (const distance of [full, full * .5]) {
      for (const turn of DART_TURNS) {
        const c = Math.cos(turn), s = Math.sin(turn);
        const x = bot.position.x + (dx * c - dz * s) * distance, z = bot.position.z + (dx * s + dz * c) * distance;
        if (Math.hypot(x - p.x, z - p.z) <= before + .5 * motion) continue;
        this.scratch.set(x, 0, z);
        if (!this.isOpenPath(bot.position, this.scratch)) continue;
        bot.to.set(x, 0, z); chosen = true; break;
      }
      if (chosen) break;
    }
    if (!chosen) { bot.cooldown = .3; return false; }
    bot.from.copy(bot.position);
    bot.state = 'dart'; bot.t = 0;
    if (this.time - bot.lastBeep >= ORBIT_LIFE.botBeepGap) {
      bot.lastBeep = this.time;
      this.ctx?.audio?.play?.('beep', bot.position, { gain: .5, rate: bot.index % 2 ? 1.15 : .9 });
    }
    return true;
  }

  updateBots(dt, skater, camera) {
    const { botNear, botDartTime, botHeight, botSpeed, riderClear, botLineClear } = ORBIT_LIFE;
    const motion = this.motion, rider = skater.position;
    const halo = this.halos.geometry.attributes, hp = halo.position.array, hc = halo.color.array;
    let n = 0;
    for (const bot of this.bots) {
      const i = bot.index;
      if (bot.state === 'hidden') { hc[i * 3] = hc[i * 3 + 1] = hc[i * 3 + 2] = 0; continue; }
      bot.cooldown -= dt;
      if (bot.state === 'wander' && bot.cooldown <= 0) {
        const near = bot.position.distanceTo(this.riderCenter) < botNear;
        const inLine = camera?.position && segmentDistance(bot.position, camera.position, this.riderCenter, this.closest) < botLineClear;
        if (near || inLine) this.dart(bot, skater);
      }
      let lift = 0;
      if (bot.state === 'dart') {
        bot.t += dt;
        const u = Math.min(1, bot.t / botDartTime), e = 1 - (1 - u) ** 3;
        bot.position.x = bot.from.x + (bot.to.x - bot.from.x) * e;
        bot.position.z = bot.from.z + (bot.to.z - bot.from.z) * e;
        lift = Math.sin(u * Math.PI) * .3 * motion;
        if (u >= 1) {
          bot.state = 'wander'; bot.cooldown = .3; bot.velocity.set(0, 0, 0);
          if (this.isOpen(bot.position.x, bot.position.z)) bot.home.set(bot.position.x, this.floorY, bot.position.z);
          this.pickTarget(bot);
        }
      } else {
        bot.retarget -= dt;
        const dx = bot.target.x - bot.position.x, dz = bot.target.z - bot.position.z, d = Math.hypot(dx, dz);
        if (d < .6 || bot.retarget <= 0) this.pickTarget(bot);
        const speed = botSpeed * Math.min(1, d / 2) / Math.max(d, 1e-4);
        const k = 1 - Math.exp(-dt * 1.5);
        bot.velocity.x += (dx * speed - bot.velocity.x) * k;
        bot.velocity.z += (dz * speed - bot.velocity.z) * k;
        bot.position.x += bot.velocity.x * dt;
        bot.position.z += bot.velocity.z * dt;
      }
      const bob = Math.sin(this.time * 1.3 + bot.phase) * .15 * motion;
      bot.position.y = clamp(this.floorY + bot.height + bob + lift, this.floorY + botHeight[0], this.floorY + botHeight[1]);
      // Never within 1.2 m of the rider (horizontally, so also in the air).
      const rx = bot.position.x - rider.x, rz = bot.position.z - rider.z, rd = Math.hypot(rx, rz);
      if (rd < riderClear) {
        const s = rd > 1e-4 ? riderClear / rd : 0;
        bot.position.x = rider.x + (s ? rx * s : riderClear);
        bot.position.z = rider.z + (s ? rz * s : 0);
      }
      this.matrix.makeTranslation(bot.position.x, bot.position.y, bot.position.z);
      this.botMesh.setMatrixAt(n, this.matrix);
      this.botMesh.setColorAt(n, this.color.copy(bot.color).multiplyScalar(1.6));
      this.quat.setFromEuler(this.euler.set(1.1 + Math.sin(this.time * .7 + bot.phase) * .3, this.time * 1.4 + bot.phase, 0));
      this.ringMesh.setMatrixAt(n, this.matrix.compose(bot.position, this.quat, this.scale.set(1, 1, 1)));
      hp[i * 3] = bot.position.x; hp[i * 3 + 1] = bot.position.y; hp[i * 3 + 2] = bot.position.z;
      hc[i * 3] = bot.color.r * .55; hc[i * 3 + 1] = bot.color.g * .55; hc[i * 3 + 2] = bot.color.b * .55;
      n++;
    }
    this.botMesh.count = n; this.ringMesh.count = n;
    this.botMesh.instanceMatrix.needsUpdate = true; this.botMesh.instanceColor.needsUpdate = true;
    this.ringMesh.instanceMatrix.needsUpdate = true;
    halo.position.needsUpdate = true; halo.color.needsUpdate = true;
  }

  // ------------------------------------------------------------ REC drone
  updateDrone(dt, skater, camera, ctx) {
    const d = this.drone, root = d.root, rider = skater.position, cam = camera.position;
    const [rMin, rMax] = ORBIT_LIFE.droneDistance, [hMin, hMax] = ORBIT_LIFE.droneHeight;
    const camYaw = Math.atan2(cam.x - rider.x, cam.z - rider.z);
    const sweep = .45 + .25 * Math.sin(this.time * .13); // radians off the far side
    const radiusTarget = (rMin + rMax) / 2 + (rMax - rMin) * .45 * Math.sin(this.time * .21);
    const heightTarget = (hMin + hMax) / 2 + (hMax - hMin) * .45 * Math.sin(this.time * .17);
    if (!d.ready || d.lastRider.distanceToSquared(rider) > 36) { // first frame or a respawn/teleport: snap
      d.ready = true;
      d.theta = camYaw + Math.PI - sweep;
      d.radius = radiusTarget; d.height = heightTarget;
      d.groundY = -Infinity; d.probeTimer = 0;
      root.visible = true;
    } else {
      // Ease the angle round the far side, never through the camera's side.
      let phi = wrapAngle(d.theta - camYaw);
      const target = (phi >= 0 ? 1 : -1) * (Math.PI - sweep);
      phi += clamp((target - phi) * (1 - Math.exp(-dt * 1.5)), -2.5 * dt, 2.5 * dt);
      d.theta = camYaw + phi;
      d.radius += (radiusTarget - d.radius) * (1 - Math.exp(-dt * 1.2));
      d.height += (heightTarget - d.height) * (1 - Math.exp(-dt * 2));
    }
    d.lastRider.copy(rider);
    const pos = root.position;
    pos.set(rider.x + Math.sin(d.theta) * d.radius, 0, rider.z + Math.cos(d.theta) * d.radius);
    // Stay clear of ramp decks and walls below it.
    d.probeTimer -= dt;
    if (d.probeTimer <= 0 && ctx?.surface) { d.probeTimer = .25; d.groundY = this.groundBelow(pos.x, rider.y + hMax + 2, pos.z, ctx.surface); }
    pos.y = Math.max(rider.y + d.height, d.groundY + 2) + Math.sin(this.time * 2.1) * .04;
    // Never in the camera's view of the rider: >= 1.5 m from the camera-to-rider
    // line, with 0.9 m extra for the rider's body (feet to head).
    const need = ORBIT_LIFE.droneSegmentClear + .9;
    const dist = segmentDistance(pos, cam, this.riderCenter, this.closest);
    if (dist < need) {
      this.scratch.subVectors(pos, this.closest);
      if (this.scratch.lengthSq() < 1e-8) this.scratch.set(0, 1, 0);
      pos.copy(this.closest).addScaledVector(this.scratch.normalize(), need);
    }
    root.rotation.set(0, Math.atan2(rider.x - pos.x, rider.z - pos.z), 0);
    const on = (this.time % 1) < .5;
    if (on !== d.lightOn) { d.lightOn = on; this.droneLightMaterial.color.copy(on ? RED_ON : RED_OFF); }
  }

  groundBelow(x, top, z, surface) {
    this.scratch.set(x, top, z);
    if (typeof surface.rayRideable === 'function') {
      const hit = surface.rayRideable(this.scratch, DOWN, 30, this.probePoint, this.probeNormal);
      return hit ? this.probePoint.y : -Infinity;
    }
    const hit = surface.ground?.(this.scratch, 0, 30);
    return hit ? hit.point.y : -Infinity;
  }

  /**
   * LifeAudio can only stop by kind, not by owner, so Orbit's short one-shot
   * beeps are left to finish (the director silences every voice itself on a
   * park switch or when life turns off).
   */
  reset() {
    this.clearAgents();
  }

  dispose() {
    this.unsubscribe.forEach(off => off());
    this.unsubscribe = [];
    this.reactions = null;
    this.clearAgents();
    this.root.removeFromParent();
    for (const mesh of [this.tileMesh, this.rippleMesh, this.botMesh, this.ringMesh]) { mesh.geometry.dispose(); mesh.dispose(); }
    this.halos.geometry.dispose();
    this.drone.root.traverse(o => o.geometry?.dispose());
    for (const m of [this.tileMaterial, this.rippleMaterial, this.botMaterial, this.ringMaterial, this.haloMaterial, this.droneMaterial, this.rotorMaterial, this.droneLightMaterial]) m.dispose();
    for (const t of [this.tileMaterial.map, this.rippleMaterial.map, this.glow]) t.dispose();
  }
}
