import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { seededRandom } from '../MapScan.js';
import { keepClearOfRider } from './lifeAnchors.js';

/**
 * World Life, Grand Warehouse pack (2026-11). Presentation only: nothing here
 * is solid, collides, or writes back to the skater.
 *  - Light shafts: soft additive volumes slanting in through the model's high
 *    wall windows on the sun-facing side (the windows are found from the
 *    model's glass, the slant from the scene's shadow-casting sun). A shaft
 *    fades out as the camera nears it, so it never washes the screen.
 *  - Dust (max 120 pooled points) drifts inside the shafts and swirls round a
 *    rider passing through.
 *  - Cardboard boxes (max 6) by the walls and crate stacks topple and slide
 *    from a rider passing within 1.2 m at > 3 m/s (thud), and go home after
 *    25 s unseen.
 *  - Rail rattle: a grind starting (or a wallride) within 5 m of a rail plays a
 *    rattle there, once per 1.5 s. The rails are the model's, so sound only.
 * Swinging lamps were dropped: the lamps are the artist model's pendants.
 */
export const WAREHOUSE_LIFE = Object.freeze({
  shaftMax: 6, shaftGap: 18, sunFacing: .35, shaftOpacity: .16, shaftFadeNear: 1, shaftFadeFar: 6,
  shaftReach: 1, shaftMaxLength: 40, inset: .06,
  dustMax: 120, dustSize: .07, dustSwirlRadius: 3.5, dustSwirlSpeed: 2, dustDrift: .05,
  boxMax: 6, boxSpawnClear: 2.5, boxRailClear: 3, boxRampProbe: 3, boxGap: 1.2, boxPropClear: .7, boxCrateGap: 1, boxesPerCrate: 2,
  toppleSpeed: 3, toppleTime: .35, boxDecel: 3.5, boxHomeAfter: 25, boxSoundGap: 2,
  rattleRadius: 5, rattleGap: 1.5,
  riderClear: 1.2, seenDistance: 70,
});
const L = WAREHOUSE_LIFE;
const TAU = Math.PI * 2;
const DEFAULT_SUN = new THREE.Vector3(-35, 42, 16).normalize();
const GLASS = /glass/i;
const BOX_SIZES = [[.62, .46, .5], [.46, .36, .4], [.8, .56, .6]]; // width x height x depth (m)
const CRATE_RING = [-Math.PI / 2, -Math.PI / 4, 0, Math.PI / 4, Math.PI / 2]; // room side of a crate stack
const BOX_TINTS = ['#ffffff', '#efe6d6', '#fff4e4'];
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const rand = (a, b) => a + Math.random() * (b - a);

// ------------------------------------------------------------ textures
function dataTexture(width, height, value) {
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const k = Math.round(255 * clamp(value((x + .5) / width, (y + .5) / height), 0, 1));
    data.set([k, k, k, 255], (y * width + x) * 4);
  }
  const texture = new THREE.DataTexture(data, width, height);
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

/** u across the window, v = 0 at the window to 1 at the far (floor) end. Mullion streaks. */
const shaftTexture = () => dataTexture(64, 64, (u, v) => {
  const edge = smooth(0, .16, u) * smooth(0, .16, 1 - u);
  const along = smooth(0, .08, v) * (1 - .4 * v) * smooth(0, .4, 1 - v); // gone where it meets the floor
  const streak = .6 + .4 * (.5 + .5 * Math.cos(u * TAU * 6));
  return edge * along * streak;
});
const glowTexture = () => dataTexture(32, 32, (u, v) => { const d = Math.hypot(u - .5, v - .5) * 2; return (1 - smooth(0, 1, d)) ** 1.5; });

// ------------------------------------------------------------ geometry
/** The four side faces of a unit prism: a (across), b (up) and t (along the light). uv = (across, t). */
function shaftGeometry() {
  const positions = [], uvs = [], index = [];
  const faces = [
    [[0, 0], [1, 0]], [[0, 1], [1, 1]], // bottom and top (u = a)
    [[0, 0], [0, 1]], [[1, 0], [1, 1]], // window sides (u = b)
  ];
  for (const [p0, p1] of faces) {
    const base = positions.length / 3;
    for (const [p, u, t] of [[p0, 0, 0], [p1, 1, 0], [p1, 1, 1], [p0, 0, 1]]) { positions.push(p[0], p[1], t); uvs.push(u, t); }
    index.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(index);
  return geometry;
}

function painted(geometry, color) {
  const g = geometry.index ? geometry.toNonIndexed() : geometry;
  if (g !== geometry) geometry.dispose();
  const c = new THREE.Color(color), n = g.attributes.position.count, colors = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) colors.set([c.r, c.g, c.b], i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  g.deleteAttribute('uv');
  return g;
}

/** Unit cardboard box (scaled per instance) with a tape band over the lid seam. */
function boxGeometry() {
  const parts = [
    painted(new THREE.BoxGeometry(1, 1, 1), '#a87a4a'),
    painted(new THREE.BoxGeometry(1.006, 1.006, .14), '#c9a46c'), // tape across the top, down front and back
    painted(new THREE.BoxGeometry(1.004, .02, 1.004).translate(0, .497, 0), '#8f6538'), // lid flap seam shade
  ];
  const merged = mergeGeometries(parts);
  parts.forEach(p => p.dispose());
  return merged;
}

/** Window panes from the model's glass: world-space clusters of glass triangles (cached per park). */
const paneCache = new WeakMap();
export function findWindowPanes(park) {
  if (!park) return [];
  if (paneCache.has(park)) return paneCache.get(park);
  const tris = [];
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  park.updateMatrixWorld?.(true);
  park.traverse?.(mesh => {
    if (!mesh.isMesh || mesh.isInstancedMesh || !mesh.visible) return;
    if (![].concat(mesh.material).some(m => GLASS.test(m?.name || ''))) return;
    const position = mesh.geometry?.attributes?.position, index = mesh.geometry?.index;
    if (!position) return;
    const count = index ? index.count : position.count;
    for (let i = 0; i + 2 < count; i += 3) {
      const v = k => (index ? index.getX(i + k) : i + k);
      a.fromBufferAttribute(position, v(0)).applyMatrix4(mesh.matrixWorld);
      b.fromBufferAttribute(position, v(1)).applyMatrix4(mesh.matrixWorld);
      c.fromBufferAttribute(position, v(2)).applyMatrix4(mesh.matrixWorld);
      tris.push(new THREE.Box3().setFromPoints([a, b, c]));
    }
  });
  // Union touching triangles (boxes within 0.3 m) into panes.
  const parent = tris.map((_, i) => i);
  const find = i => { while (parent[i] !== i) i = parent[i] = parent[parent[i]]; return i; };
  const grown = new THREE.Box3();
  for (let i = 0; i < tris.length; i++) {
    grown.copy(tris[i]).expandByScalar(.3);
    for (let j = i + 1; j < tris.length; j++) if (grown.intersectsBox(tris[j])) parent[find(i)] = find(j);
  }
  const groups = new Map();
  tris.forEach((box, i) => { const r = find(i); if (!groups.has(r)) groups.set(r, new THREE.Box3()); groups.get(r).union(box); });
  const panes = [...groups.values()];
  paneCache.set(park, panes);
  return panes;
}

// ------------------------------------------------------------ the module
export class WarehouseLife {
  /** Owner (2026-11-09): light shafts and boxes off by default; rail rattle stays. */
  constructor({ shafts = false, boxes = false } = {}) {
    this.features = { shafts, boxes };
    this.parks = ['grand-warehouse'];
    this.root = new THREE.Group();
    this.root.name = 'World life: warehouse';
    this.density = 1;
    this.time = 0;
    this.ctx = null;
    this.reactions = null;
    this.unsubscribe = [];
    this.world = null;
    this.spawn = new THREE.Vector3(Infinity, 0, Infinity);
    this.floorY = 0;
    this.railSegments = []; // [a, b] world points
    this.camera = null;
    this.riderFeet = new THREE.Vector3();
    this.riderCenter = new THREE.Vector3();
    this.lastRattle = -Infinity;
    this.wasWallRiding = false;
    this.sun = DEFAULT_SUN.clone();

    // Shafts: one instanced mesh, the per-instance colour carries the camera fade.
    this.shaftMaterial = new THREE.MeshBasicMaterial({
      name: 'World life / light shafts', map: shaftTexture(), color: '#ffe3b8', transparent: true, opacity: L.shaftOpacity,
      depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false, fog: false,
    });
    this.shaftMesh = new THREE.InstancedMesh(shaftGeometry(), this.shaftMaterial, L.shaftMax);
    this.shaftMesh.name = 'World life light shafts';
    this.shaftMesh.frustumCulled = false;
    this.shaftMesh.renderOrder = 3;
    const black = new THREE.Color(0, 0, 0);
    for (let i = 0; i < L.shaftMax; i++) this.shaftMesh.setColorAt(i, black);
    this.shaftMesh.count = 0;
    this.shafts = Array.from({ length: L.shaftMax }, () => ({
      matrix: new THREE.Matrix4(), inverse: new THREE.Matrix4(), width: 1, height: 1, length: 1, fade: 0, riderInside: false,
    }));
    this.shaftCount = 0;
    this.shaftsBuilt = false;

    // Dust: pooled points.
    this.dustMaterial = new THREE.PointsMaterial({
      name: 'World life / dust', size: L.dustSize, sizeAttenuation: true, map: glowTexture(), vertexColors: true, transparent: true,
      depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, fog: false,
    });
    const dustGeometry = new THREE.BufferGeometry();
    this.dustPositions = new Float32Array(L.dustMax * 3);
    this.dustColors = new Float32Array(L.dustMax * 3);
    dustGeometry.setAttribute('position', new THREE.BufferAttribute(this.dustPositions, 3));
    dustGeometry.setAttribute('color', new THREE.BufferAttribute(this.dustColors, 3));
    dustGeometry.setDrawRange(0, 0);
    this.dust = new THREE.Points(dustGeometry, this.dustMaterial);
    this.dust.name = 'World life dust';
    this.dust.frustumCulled = false;
    this.dustVelocity = new Float32Array(L.dustMax * 3);
    this.dustShaft = new Uint8Array(L.dustMax);
    this.dustPhase = new Float32Array(L.dustMax);
    this.dustCount = 0;

    // Boxes.
    this.boxMaterial = new THREE.MeshStandardMaterial({ name: 'World life / cardboard boxes', vertexColors: true, roughness: .92, metalness: 0 });
    this.boxMesh = new THREE.InstancedMesh(boxGeometry(), this.boxMaterial, L.boxMax);
    this.boxMesh.name = 'World life boxes';
    this.boxMesh.castShadow = true; this.boxMesh.receiveShadow = true;
    this.boxMesh.frustumCulled = false;
    const color = new THREE.Color();
    for (let i = 0; i < L.boxMax; i++) this.boxMesh.setColorAt(i, color.set(BOX_TINTS[i % BOX_TINTS.length]));
    this.boxMesh.count = 0;
    this.boxes = [];
    this.boxKey = '';
    this.boxScan = null;

    this.root.add(this.shaftMesh, this.dust, this.boxMesh);

    this.frustum = new THREE.Frustum();
    this.projScreen = new THREE.Matrix4();
    this.frustumTime = -1;
    this.matrix = new THREE.Matrix4();
    this.quat = new THREE.Quaternion();
    this.quatB = new THREE.Quaternion();
    this.scale = new THREE.Vector3();
    this.scratch = new THREE.Vector3();
    this.scratchB = new THREE.Vector3();
    this.local = new THREE.Vector3();
    this.color = new THREE.Color();
    this.axisX = new THREE.Vector3(1, 0, 0);
    this.axisY = new THREE.Vector3(0, 1, 0);
    this.axisZ = new THREE.Vector3(0, 0, 1);
  }

  get motion() { return this.ctx?.reducedMotion ? .5 : 1; }

  setWorld(world, ctx) {
    this.ctx = ctx;
    this.world = world || null;
    const spawn = world?.manifest?.spawn;
    if (Array.isArray(spawn)) this.spawn.set(spawn[0], spawn[1], spawn[2]); else this.spawn.set(Infinity, 0, Infinity);
    this.floorY = Array.isArray(spawn) ? spawn[1] : 0;
    this.railSegments.length = 0;
    for (const rail of world?.manifest?.rails || []) {
      const points = (rail.points || []).filter(p => Array.isArray(p)).map(p => new THREE.Vector3(p[0], p[1], p[2]));
      for (let i = 0; i + 1 < points.length; i++) this.railSegments.push([points[i], points[i + 1]]);
      if (points.length === 1) this.railSegments.push([points[0], points[0]]);
    }
    this.clearAgents();
    if (ctx?.reactions && ctx.reactions !== this.reactions) {
      this.unsubscribe.forEach(off => off());
      this.reactions = ctx.reactions;
      this.unsubscribe = [this.reactions.on('grindStart', e => this.rattleNear(e.point))];
    }
  }

  setQuality(settings) {
    const density = settings?.name === 'performance' ? 0 : Number(settings?.vfxScale) < 1 ? .5 : 1;
    const changed = density !== this.density;
    this.density = density;
    this.root.visible = density > 0;
    if (density === 0) this.reset();
    else if (changed) this.clearAgents(); // rebuilt lazily with the new counts
  }

  clearAgents() {
    this.shaftCount = 0;
    this.shaftMesh.count = 0;
    this.shaftsBuilt = false;
    this.dustCount = 0;
    this.dust.geometry.setDrawRange(0, 0);
    this.boxes.length = 0;
    this.boxMesh.count = 0;
    this.boxKey = '';
    this.wasWallRiding = false;
  }

  // ------------------------------------------------------------ shafts
  findSun() {
    let top = this.root;
    while (top.parent) top = top.parent;
    let light = null;
    top.traverse(o => { if (o.isDirectionalLight && (!light || (o.castShadow && !light.castShadow))) light = o; });
    if (!light) return this.sun.copy(DEFAULT_SUN);
    light.updateMatrixWorld();
    light.target?.updateMatrixWorld?.();
    const from = light.getWorldPosition(this.scratch), to = light.target ? light.target.getWorldPosition(this.scratchB) : this.scratchB.set(0, 0, 0);
    this.sun.subVectors(from, to);
    if (this.sun.lengthSq() < 1e-6 || this.sun.y <= .05) return this.sun.copy(DEFAULT_SUN);
    return this.sun.normalize();
  }

  /** Shafts through the sun-facing high wall windows, spread apart. */
  buildShafts() {
    this.shaftsBuilt = true;
    const panes = findWindowPanes(this.world?.park);
    const sun = this.findSun();
    const spawn = Number.isFinite(this.spawn.x) ? this.spawn : new THREE.Vector3();
    const candidates = [];
    for (const box of panes) {
      const ex = box.max.x - box.min.x, ey = box.max.y - box.min.y, ez = box.max.z - box.min.z;
      if (ey < 1 || Math.max(ex, ez) < 1 || Math.min(ex, ez) > .4) continue; // wall panes only
      if (box.min.y < this.floorY + 3) continue; // high windows, not doors
      const alongX = ex >= ez; // the pane runs along x: its normal is z
      const center = box.getCenter(new THREE.Vector3());
      const outward = alongX ? new THREE.Vector3(0, 0, Math.sign(center.z - spawn.z) || 1) : new THREE.Vector3(Math.sign(center.x - spawn.x) || 1, 0, 0);
      const facing = outward.dot(sun);
      if (facing < L.sunFacing) continue;
      candidates.push({ box, center, outward, facing, alongX });
    }
    candidates.sort((p, q) => q.facing - p.facing || p.center.x - q.center.x || p.center.z - q.center.z);
    const cap = Math.round(L.shaftMax * this.density);
    const picked = [];
    for (const pane of candidates) {
      if (picked.length >= cap) break;
      if (picked.every(p => p.center.distanceTo(pane.center) >= L.shaftGap)) picked.push(pane);
    }
    const light = sun.clone().negate();
    picked.forEach((pane, i) => {
      const shaft = this.shafts[i], { box, outward } = pane;
      const width = pane.alongX ? box.max.x - box.min.x : box.max.z - box.min.z;
      const height = box.max.y - box.min.y;
      const drop = Math.max(.5, (box.min.y + box.max.y) / 2 - this.floorY);
      const length = Math.min(L.shaftMaxLength, drop / Math.max(.1, -light.y) * L.shaftReach);
      const origin = new THREE.Vector3(pane.alongX ? box.min.x : 0, box.min.y, pane.alongX ? 0 : box.min.z);
      if (pane.alongX) origin.z = pane.center.z - outward.z * L.inset; else origin.x = pane.center.x - outward.x * L.inset;
      const across = pane.alongX ? new THREE.Vector3(width, 0, 0) : new THREE.Vector3(0, 0, width);
      shaft.matrix.makeBasis(across, new THREE.Vector3(0, height, 0), light.clone().multiplyScalar(length)).setPosition(origin);
      shaft.inverse.copy(shaft.matrix).invert();
      shaft.width = width; shaft.height = height; shaft.length = length; shaft.fade = 0; shaft.riderInside = false;
      this.shaftMesh.setMatrixAt(i, shaft.matrix);
    });
    this.shaftCount = picked.length;
    this.shaftMesh.count = this.shaftCount;
    this.shaftMesh.instanceMatrix.needsUpdate = true;
    // Dust spread evenly over the shafts.
    this.dustCount = this.shaftCount ? Math.round(L.dustMax * this.density) : 0;
    for (let i = 0; i < this.dustCount; i++) {
      this.dustShaft[i] = i % this.shaftCount;
      this.dustPhase[i] = Math.random() * TAU;
      this.respawnDust(i);
    }
    this.dust.geometry.setDrawRange(0, this.dustCount);
  }

  /** Outside distance (m) from a world point to a shaft volume; 0 inside. Writes local coords to this.local. */
  shaftDistance(shaft, point) {
    const l = this.local.copy(point).applyMatrix4(shaft.inverse);
    const out = v => Math.max(0, -v, v - 1);
    return Math.hypot(out(l.x) * shaft.width, out(l.y) * shaft.height, out(l.z) * shaft.length);
  }

  updateShafts(camera) {
    if (!this.shaftCount) return;
    for (let i = 0; i < this.shaftCount; i++) {
      const shaft = this.shafts[i];
      shaft.fade = camera?.position ? smooth(L.shaftFadeNear, L.shaftFadeFar, this.shaftDistance(shaft, camera.position)) : 1;
      this.shaftMesh.setColorAt(i, this.color.setScalar(shaft.fade));
      this.shaftDistance(shaft, this.riderCenter);
      const l = this.local;
      shaft.riderInside = l.x > -.1 && l.x < 1.1 && l.y > -.3 && l.y < 1.3 && l.z > 0 && l.z < 1.05;
    }
    this.shaftMesh.instanceColor.needsUpdate = true;
  }

  // ------------------------------------------------------------ dust
  respawnDust(i) {
    const shaft = this.shafts[this.dustShaft[i]];
    const p = this.scratch.set(rand(.08, .92), rand(.08, .92), rand(.08, .92)).applyMatrix4(shaft.matrix);
    keepClearOfRider(p, this.riderCenter, L.riderClear);
    this.dustPositions.set([p.x, p.y, p.z], i * 3);
    this.dustVelocity.fill(0, i * 3, i * 3 + 3);
  }

  updateDust(dt, speed, camera) {
    const n = this.dustCount;
    if (!n) return;
    const pos = this.dustPositions, vel = this.dustVelocity, col = this.dustColors;
    const motion = this.motion, damping = Math.exp(-dt * 1.4), t = this.time;
    const rc = this.riderCenter, cam = camera?.position;
    const p = this.scratchB;
    for (let i = 0; i < n; i++) {
      const j = i * 3, shaft = this.shafts[this.dustShaft[i]], phase = this.dustPhase[i];
      // Lazy drift, plus a swirl round a rider passing through this shaft.
      if (shaft.riderInside && speed > L.dustSwirlSpeed) {
        const dx = pos[j] - rc.x, dz = pos[j + 2] - rc.z, r = Math.hypot(dx, dz);
        if (r < L.dustSwirlRadius && r > 1e-3 && Math.abs(pos[j + 1] - rc.y) < 2.5) {
          const k = (1 - r / L.dustSwirlRadius) * Math.min(1.5, speed * .2) * motion * dt * 6;
          vel[j] += (-dz / r + dx / r * .4) * k;
          vel[j + 1] += .25 * k;
          vel[j + 2] += (dx / r + dz / r * .4) * k;
        }
      }
      vel[j] *= damping; vel[j + 1] *= damping; vel[j + 2] *= damping;
      pos[j] += (vel[j] + Math.sin(t * .31 + phase) * L.dustDrift) * dt;
      pos[j + 1] += (vel[j + 1] + Math.sin(t * .23 + phase * 1.7) * L.dustDrift * .6) * dt;
      pos[j + 2] += (vel[j + 2] + Math.cos(t * .27 + phase) * L.dustDrift) * dt;
      p.set(pos[j], pos[j + 1], pos[j + 2]);
      keepClearOfRider(p, rc, L.riderClear);
      pos[j] = p.x; pos[j + 1] = p.y; pos[j + 2] = p.z;
      this.shaftDistance(shaft, p);
      const l = this.local;
      if (l.x < -.03 || l.x > 1.03 || l.y < -.03 || l.y > 1.03 || l.z < .02 || l.z > .98) { this.respawnDust(i); p.set(pos[j], pos[j + 1], pos[j + 2]); this.shaftDistance(shaft, p); }
      // Glints: brightest mid-shaft, faded with the shaft and near the camera.
      const edge = smooth(0, .2, Math.min(l.x, 1 - l.x)) * smooth(0, .2, Math.min(l.y, 1 - l.y)) * smooth(0, .15, Math.min(l.z, 1 - l.z));
      const near = cam ? smooth(.8, 2.5, Math.hypot(p.x - cam.x, p.y - cam.y, p.z - cam.z)) : 1;
      const b = (.55 + .45 * Math.sin(t * 1.3 + phase * 3)) * edge * near * Math.max(shaft.fade, .35);
      col[j] = b; col[j + 1] = b * .92; col[j + 2] = b * .78;
    }
    this.dust.geometry.attributes.position.needsUpdate = true;
    this.dust.geometry.attributes.color.needsUpdate = true;
  }

  // ------------------------------------------------------------ boxes
  railDistance(point, out = null) {
    let best = Infinity;
    for (const [a, b] of this.railSegments) {
      const abx = b.x - a.x, aby = b.y - a.y, abz = b.z - a.z, lsq = abx * abx + aby * aby + abz * abz;
      const t = lsq > 1e-9 ? clamp(((point.x - a.x) * abx + (point.y - a.y) * aby + (point.z - a.z) * abz) / lsq, 0, 1) : 0;
      const x = a.x + abx * t, y = a.y + aby * t, z = a.z + abz * t;
      const d = Math.hypot(point.x - x, point.y - y, point.z - z);
      if (d < best) { best = d; out?.set(x, y, z); }
    }
    return best;
  }

  flatAt(surface, x, y, z) {
    const hit = surface.ground(this.scratch.set(x, y, z), .3, .5);
    return Boolean(hit && hit.normal.y > .95 && Math.abs(hit.point.y - y) < .12);
  }

  /**
   * Boxes on flat floor by the walls: spots with 3 m of flat floor round them
   * (clear of ramp edges) and clear of rails first; among those, round the
   * crate stacks (room side, two per stack) before the scan's wall-edge spots.
   * Always clear of props, posts and the spawn.
   */
  placeBoxes(scan, anchors, surface) {
    this.boxes.length = 0;
    const random = seededRandom(`warehouse-life-${this.world?.id || ''}`);
    const props = anchors?.props || [];
    const posts = [...(anchors?.poles || []), ...(anchors?.strings || [])];
    const spots = [];
    // Round each crate stack: the stack sits 0.6 m off its wall, facing the room.
    for (const crate of props) {
      if (crate.kind !== 'crates' || !crate.facing) continue;
      const f = crate.facing, r = crate.radius + L.boxCrateGap;
      for (const angle of CRATE_RING) {
        const c = Math.cos(angle), s = Math.sin(angle);
        const dx = f.x * c - f.z * s, dz = f.x * s + f.z * c;
        spots.push({ point: new THREE.Vector3(crate.position.x + dx * r, crate.position.y, crate.position.z + dz * r), facing: f, wallDistance: .6 + r * c, crate });
      }
    }
    for (const edge of scan.edges || []) {
      if (edge.point && edge.facing?.isVector3) spots.push({ point: edge.point, facing: edge.facing.clone().setY(0).normalize(), wallDistance: .9, crate: null });
    }
    const candidates = [];
    for (const spot of spots) {
      const point = spot.point;
      if (point.y > this.floorY + 8) continue; // the hall, not the roof
      if (Math.hypot(point.x - this.spawn.x, point.z - this.spawn.z) < L.boxSpawnClear) continue;
      if (props.some(p => Math.hypot(p.position.x - point.x, p.position.z - point.z) < p.radius + L.boxPropClear)) continue;
      if (posts.some(p => Math.hypot(p.position.x - point.x, p.position.z - point.z) < 1.2)) continue;
      const hit = surface.ground(this.scratch.copy(point), .3, .5);
      if (!hit || hit.normal.y <= .95 || Math.abs(hit.point.y - point.y) > .12) continue;
      const home = hit.point.clone();
      // Prefer spots clear of rails and ramp edges (3 m of flat floor out into the room and along the wall).
      const f = spot.facing;
      let open = this.railDistance(home) >= L.boxRailClear;
      if (open) for (const [ax, az] of [[f.x, f.z], [-f.z, f.x], [f.z, -f.x]]) {
        if (!this.flatAt(surface, home.x + ax * L.boxRampProbe, home.y, home.z + az * L.boxRampProbe)) { open = false; break; }
      }
      candidates.push({ spot, home, rank: (open ? 0 : 2) + (spot.crate ? 0 : 1), key: random() });
    }
    candidates.sort((p, q) => p.rank - q.rank || p.key - q.key);
    const cap = Math.round(L.boxMax * this.density);
    for (const { spot, home } of candidates) {
      if (this.boxes.length >= cap) break;
      if (this.boxes.some(b => Math.hypot(b.home.x - home.x, b.home.z - home.z) < L.boxGap)) continue;
      if (spot.crate && this.boxes.filter(b => b.crate === spot.crate).length >= L.boxesPerCrate) continue;
      const index = this.boxes.length, size = BOX_SIZES[index % BOX_SIZES.length];
      if (spot.wallDistance - Math.max(size[0], size[2]) / 2 < .1) continue; // would touch the wall
      const yaw = Math.atan2(spot.facing.x, spot.facing.z) + (random() - .5) * .5;
      const box = {
        index, size, home, homeYaw: yaw, crate: spot.crate, position: home.clone(), yaw,
        facing: spot.facing, wallReach: spot.wallDistance - Math.max(size[0], size[2]) / 2 - .05,
        velocity: new THREE.Vector3(), state: 'rest', armed: true, displaced: false,
        tilt: 0, tiltFrom: 0, tiltTarget: 0, tiltTime: 0, fallAxis: 'x', fallSign: 1, spin: 0,
        restTime: 0, lastSound: -Infinity, topples: 0,
      };
      this.boxes.push(box);
      this.writeBox(box);
    }
    this.boxMesh.count = this.boxes.length;
  }

  writeBox(box) {
    const [sx, sy, sz] = box.size;
    // Heading, then tip over about the local axis across the fall.
    this.quat.setFromAxisAngle(this.axisY, box.yaw);
    this.quatB.setFromAxisAngle(box.fallAxis === 'x' ? this.axisX : this.axisZ, box.fallSign * box.tilt);
    this.quat.multiply(this.quatB);
    const fall = box.fallAxis === 'x' ? sz : sx;
    const lift = (sy * Math.abs(Math.cos(box.tilt)) + fall * Math.abs(Math.sin(box.tilt))) / 2;
    this.scratch.copy(box.position).setY(box.position.y + lift);
    this.boxMesh.setMatrixAt(box.index, this.matrix.compose(this.scratch, this.quat, this.scale.set(sx, sy, sz)));
    this.boxMesh.instanceMatrix.needsUpdate = true;
  }

  boxClear(box) { return L.riderClear + Math.max(box.size[0], box.size[2]) / 2; }

  updateBox(box, dt, vx, vz, speed, surface) {
    const p = box.position, rider = this.riderFeet;
    const dx = p.x - rider.x, dz = p.z - rider.z, d = Math.hypot(dx, dz);
    const clear = this.boxClear(box);
    if (!box.armed && box.state === 'rest' && d > clear + 2) box.armed = true;
    if (box.state === 'rest' && box.armed && speed > L.toppleSpeed) {
      // Topple before the rider gets there: the box is in the line, just ahead.
      const ux = vx / speed, uz = vz / speed;
      const along = dx * ux + dz * uz, side = dx * uz - dz * ux;
      if (Math.abs(side) < clear && along > -.3 && along < 1.4 + speed * .45) {
        const s = Math.abs(side) > .02 ? Math.sign(side) : 1;
        const lateral = rand(2.2, 2.8) * s, forward = Math.min(3, speed * .35);
        this.topple(box, uz * lateral + ux * forward, -ux * lateral + uz * forward, speed, surface);
      }
    }
    if (box.state === 'topple') this.advanceBox(box, dt);
    else if (box.displaced) {
      box.restTime += dt;
      if (box.restTime >= L.boxHomeAfter && !this.seen(box.position) && !this.seen(box.home) && Math.hypot(box.home.x - rider.x, box.home.z - rider.z) > clear + 2) {
        p.copy(box.home);
        box.yaw = box.homeYaw; box.tilt = 0; box.displaced = false; box.restTime = 0; box.armed = true;
        this.writeBox(box);
      }
    }
    // Hard clearance: never inside the rider's space.
    const ex = p.x - rider.x, ez = p.z - rider.z, e = Math.hypot(ex, ez);
    if (e < clear) {
      if (e > 1e-4) { p.x = rider.x + ex / e * clear; p.z = rider.z + ez / e * clear; } else p.x = rider.x + clear;
      if (this.keepOffWall(box)) {
        // The wall is in the way: slide along it instead.
        const f = box.facing, tx = -f.z, tz = f.x;
        const rx = p.x - rider.x, rz = p.z - rider.z, b = rx * f.x + rz * f.z, a = rx * tx + rz * tz;
        const along = (a < 0 ? -1 : 1) * Math.sqrt(Math.max(0, clear * clear - b * b));
        p.x += tx * (along - a); p.z += tz * (along - a);
      }
      if (box.state === 'rest') { box.displaced = true; box.restTime = 0; }
      this.writeBox(box);
    }
  }

  /** Scan edge spots sit 0.9 m out from a wall: never slide through it. */
  keepOffWall(box) {
    const f = box.facing, p = box.position;
    if (!f) return false;
    const reach = box.wallReach;
    const w = (p.x - box.home.x) * f.x + (p.z - box.home.z) * f.z;
    if (w >= -reach) return false;
    const along = (p.x - box.home.x) * -f.z + (p.z - box.home.z) * f.x;
    if (Math.abs(along) > 4) return false;
    p.x += f.x * (-reach - w); p.z += f.z * (-reach - w);
    const into = box.velocity.x * f.x + box.velocity.z * f.z;
    if (into < 0) { box.velocity.x -= f.x * into; box.velocity.z -= f.z * into; }
    return true;
  }

  topple(box, vx, vz, riderSpeed, surface) {
    const motion = this.motion;
    vx *= motion; vz *= motion;
    let v = Math.hypot(vx, vz);
    if (v > 1e-4 && surface?.ground) {
      // Only slide as far as flat floor goes.
      const ok = distance => [.5, 1].every(f => this.flatAt(surface, box.position.x + vx / v * distance * f, box.position.y, box.position.z + vz / v * distance * f));
      let distance = v * v / (2 * L.boxDecel);
      while (distance > .2 && !ok(distance)) distance *= .5;
      if (distance <= .2) distance = .2;
      const scale = Math.sqrt(2 * L.boxDecel * distance) / v;
      vx *= scale; vz *= scale; v *= scale;
    }
    box.velocity.set(vx, 0, vz);
    if (box.tilt < .2) {
      // Fall towards the push: across whichever local axis faces it most.
      const c = Math.cos(-box.yaw), s = Math.sin(-box.yaw);
      const lx = vx * c + vz * s, lz = -vx * s + vz * c;
      if (Math.abs(lz) >= Math.abs(lx)) { box.fallAxis = 'x'; box.fallSign = lz >= 0 ? 1 : -1; } else { box.fallAxis = 'z'; box.fallSign = lx >= 0 ? -1 : 1; }
      box.tiltFrom = box.tilt; box.tiltTarget = Math.PI / 2;
    } else { box.tiltFrom = box.tilt; box.tiltTarget = box.tilt; } // already on its side: slide and spin
    box.tiltTime = 0;
    box.state = 'topple';
    box.armed = false;
    box.displaced = true;
    box.spin = rand(1.5, 4) * (Math.random() < .5 ? -1 : 1) * motion;
    box.topples++;
    if (this.time - box.lastSound >= L.boxSoundGap) {
      box.lastSound = this.time;
      this.ctx?.audio?.play?.('thud', box.position, { gain: .7, rate: rand(.9, 1.05) * (box.size[0] > .7 ? .85 : 1) * (riderSpeed > 6 ? 1.05 : 1) });
    }
  }

  advanceBox(box, dt) {
    const v = box.velocity, sp = Math.hypot(v.x, v.z);
    if (sp > 0) {
      v.multiplyScalar(Math.max(0, sp - L.boxDecel * dt) / sp);
      box.position.addScaledVector(v, dt);
      this.keepOffWall(box);
    }
    box.tiltTime += dt;
    const k = smooth(0, L.toppleTime, box.tiltTime);
    box.tilt = box.tiltFrom + (box.tiltTarget - box.tiltFrom) * k;
    box.yaw += box.spin * dt;
    box.spin *= Math.exp(-dt * 4);
    if (Math.hypot(v.x, v.z) === 0 && box.tiltTime > L.toppleTime) { box.state = 'rest'; box.restTime = 0; box.tilt = box.tiltTarget; }
    this.writeBox(box);
  }

  /** On screen: inside the camera frustum and close enough to read. */
  seen(point) {
    const camera = this.camera;
    if (!camera?.projectionMatrix || !camera.matrixWorldInverse) return false;
    if (this.frustumTime !== this.time) {
      this.frustumTime = this.time;
      this.projScreen.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
      this.frustum.setFromProjectionMatrix(this.projScreen);
    }
    const cp = camera.position;
    if (cp && Math.hypot(point.x - cp.x, point.y - cp.y, point.z - cp.z) > L.seenDistance) return false;
    return this.frustum.containsPoint(point);
  }

  // ------------------------------------------------------------ rattle
  /** A rattle at the nearest rail within 5 m of `point` (rails are the model's: sound only). */
  rattleNear(point) {
    if (this.density <= 0 || !this.root.parent || !point) return false;
    if (this.time - this.lastRattle < L.rattleGap) return false;
    const at = this.scratchB;
    if (!(this.railDistance(point, at) <= L.rattleRadius)) return false;
    this.lastRattle = this.time;
    this.ctx?.audio?.play?.('rattle', at, { gain: .55, rate: rand(.92, 1.08) });
    return true;
  }

  // ------------------------------------------------------------ update
  update(dt, skater, camera, ctx) {
    if (this.density <= 0 || !skater) return;
    this.ctx = ctx;
    this.camera = camera;
    this.time += dt;
    this.riderFeet.copy(skater.position);
    this.riderCenter.copy(skater.position).setY(skater.position.y + .9);
    if (this.features.shafts && !this.shaftsBuilt && this.world) this.buildShafts();
    const anchors = ctx.anchors;
    const key = ctx.scan?.edges?.length && ctx.surface?.ground ? `${ctx.scan.edges.length}|${anchors?.props?.length || 0}|${anchors?.poles?.length || 0}` : '';
    if (this.features.boxes && key && (key !== this.boxKey || ctx.scan !== this.boxScan)) {
      this.boxKey = key; this.boxScan = ctx.scan;
      this.placeBoxes(ctx.scan, anchors, ctx.surface);
    }
    const vx = skater.velocity?.x || 0, vz = skater.velocity?.z || 0;
    const speed = Math.hypot(vx, vz);
    if (this.features.shafts) { this.updateShafts(camera); this.updateDust(dt, speed, camera); }
    for (let i = 0; i < this.boxes.length; i++) this.updateBox(this.boxes[i], dt, vx, vz, speed, ctx.surface);
    const wallRiding = Boolean(skater.wallRide);
    if (wallRiding && !this.wasWallRiding) this.rattleNear(skater.position);
    this.wasWallRiding = wallRiding;
  }

  reset() {
    this.clearAgents();
    this.lastRattle = -Infinity;
    this.ctx?.audio?.stop?.('thud');
    this.ctx?.audio?.stop?.('rattle');
  }

  dispose() {
    this.unsubscribe.forEach(off => off());
    this.unsubscribe = [];
    this.reactions = null;
    this.clearAgents();
    this.root.removeFromParent();
    for (const mesh of [this.shaftMesh, this.boxMesh]) { mesh.geometry.dispose(); mesh.dispose(); }
    this.dust.geometry.dispose();
    for (const m of [this.shaftMaterial, this.dustMaterial, this.boxMaterial]) { m.map?.dispose(); m.dispose(); }
  }
}
