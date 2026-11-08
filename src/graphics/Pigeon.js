import * as THREE from 'three';

/**
 * Procedural city pigeon (rock dove). Presentation only.
 *  - Shaped body, iridescent neck, beak with white cere, orange eyes, legs.
 *  - Feathered wings in two segments (arm with secondaries, hand with
 *    primaries) that fold against the body or open for flight.
 *  - Fanned tail with the dark terminal band.
 *  - Real behaviours: head-bob walk, pecking, glances, cooing display,
 *    staggered take-off, flap/glide flight with banking, a quick hop aside,
 *    an alert flinch, and roosting (perch, preen, fly a loop, resettle).
 * All parts share three vertex-coloured materials, so a whole flock costs
 * three shader programs.
 */

const TAU = Math.PI * 2;
const UP = new THREE.Vector3(0, 1, 0);
const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const wrapAngle = a => Math.atan2(Math.sin(a), Math.cos(a));

/** Common city plumages; weights roughly follow what you see on a plaza. */
export const PLUMAGES = Object.freeze([
  { name: 'blue bar', weight: .38, body: '#8a92a0', back: '#949cab', head: '#666d7d', chest: '#7a7f90', belly: '#9aa1ad', rump: '#c8ccd4', wing: '#a6aebb', bar: '#2a2c32', primary: '#3d4049', tail: '#7f8693', band: '#25272c', neckA: '#3f7564', neckB: '#6e4f86', check: 0 },
  { name: 'checker', weight: .26, body: '#787f8e', back: '#7f879a', head: '#5a6070', chest: '#6c7383', belly: '#89909c', rump: '#8f96a3', wing: '#8f97a6', bar: '#2a2c33', primary: '#353840', tail: '#6d7482', band: '#212328', neckA: '#386b5a', neckB: '#664a7a', check: .7 },
  { name: 'dark check', weight: .14, body: '#494d57', back: '#4e525d', head: '#373a43', chest: '#434752', belly: '#555a64', rump: '#4f535e', wing: '#565b67', bar: '#222429', primary: '#282a30', tail: '#42464e', band: '#1b1c20', neckA: '#2f6553', neckB: '#5c3e6c', check: .45 },
  { name: 'red', weight: .1, body: '#9c8073', back: '#a4897c', head: '#87695c', chest: '#93705f', belly: '#b49f94', rump: '#c4b4ab', wing: '#b89e90', bar: '#6c3a2a', primary: '#5e4a42', tail: '#9e8678', band: '#58322a', neckA: '#7d6c45', neckB: '#8c5268', check: .2 },
  { name: 'pied', weight: .12, body: '#d8d6d0', back: '#c8cacf', head: '#727888', chest: '#cecbc4', belly: '#e4e2dc', rump: '#e6e4de', wing: '#dddbd5', bar: '#8a8f99', primary: '#e0ded8', tail: '#cdced2', band: '#6b6f78', neckA: '#4f7a69', neckB: '#715a82', check: 0, pied: true },
]);

export function pickPlumage(r = Math.random()) {
  const total = PLUMAGES.reduce((sum, p) => sum + p.weight, 0);
  let acc = 0;
  for (const plumage of PLUMAGES) { acc += plumage.weight / total; if (r <= acc) return plumage; }
  return PLUMAGES[0];
}

// ---------------------------------------------------------------- materials
let MATERIALS = null;
export function pigeonMaterials() {
  if (MATERIALS) return MATERIALS;
  MATERIALS = {
    solid: new THREE.MeshStandardMaterial({ name: 'Pigeon / body', vertexColors: true, roughness: .74, metalness: 0 }),
    feather: new THREE.MeshStandardMaterial({ name: 'Pigeon / feathers', vertexColors: true, roughness: .82, metalness: 0, side: THREE.DoubleSide }),
    // Real thin-film iridescence: the neck shifts green ↔ purple with the view angle.
    sheen: new THREE.MeshPhysicalMaterial({
      name: 'Pigeon / neck sheen', vertexColors: true, roughness: .4, metalness: 0,
      iridescence: 1, iridescenceIOR: 1.8, iridescenceThicknessRange: [240, 560], iridescenceMap: neckSheenMap(),
    }),
  };
  return MATERIALS;
}

// ------------------------------------------------------------ colour helpers
const COLOR_CACHE = new Map();
function col(hex) {
  let c = COLOR_CACHE.get(hex);
  if (!c) { c = new THREE.Color(hex); COLOR_CACHE.set(hex, c); }
  return c;
}
function hash3(x, y, z) {
  const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
  return s - Math.floor(s);
}
/** Smooth 3D value noise in [0, 1]. */
function noise3(x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const xf = x - xi, yf = y - yi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), w = zf * zf * (3 - 2 * zf);
  const n = (a, b, c) => hash3(xi + a, yi + b, zi + c);
  const x00 = lerp(n(0, 0, 0), n(1, 0, 0), u), x10 = lerp(n(0, 1, 0), n(1, 1, 0), u);
  const x01 = lerp(n(0, 0, 1), n(1, 0, 1), u), x11 = lerp(n(0, 1, 1), n(1, 1, 1), u);
  return lerp(lerp(x00, x10, v), lerp(x01, x11, v), w);
}

/** Collects pieces into one vertex-coloured geometry. */
class PartBuilder {
  constructor() { this.pos = []; this.nor = []; this.col = []; this.idx = []; }
  /** paint(position, normal, outColor, vertexIndex) */
  add(geometry, matrix, paint) {
    if (matrix) geometry.applyMatrix4(matrix);
    if (!geometry.attributes.normal) geometry.computeVertexNormals();
    const p = geometry.attributes.position, n = geometry.attributes.normal;
    const base = this.pos.length / 3;
    const v = new THREE.Vector3(), nv = new THREE.Vector3(), c = new THREE.Color();
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i); nv.fromBufferAttribute(n, i);
      this.pos.push(v.x, v.y, v.z); this.nor.push(nv.x, nv.y, nv.z);
      paint(v, nv, c, i);
      this.col.push(c.r, c.g, c.b);
    }
    if (geometry.index) for (let i = 0; i < geometry.index.count; i++) this.idx.push(geometry.index.getX(i) + base);
    else for (let i = 0; i < p.count; i++) this.idx.push(base + i);
    geometry.dispose();
    return this;
  }
  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setIndex(this.idx);
    g.computeBoundingSphere();
    return g;
  }
}

const M = new THREE.Matrix4();
const compose = (x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) =>
  M.clone().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(sx, sy, sz));
const flat = color => (p, n, out) => out.copy(color);

/**
 * One feather: a cambered, tapered blade with a rounded tip.
 * dir/side lie in the part's plane; t runs 0 (base) → 1 (tip).
 */
function featherGeometry(base, dir, side, length, width, { lift = .004, droop = 0 } = {}) {
  const rows = 6, positions = [], uvs = [], index = [];
  for (let r = 0; r <= rows; r++) {
    const t = r / rows;
    const w = width * (t < .85 ? .62 + .38 * Math.sin(Math.min(1, t / .85) * Math.PI * .5) : lerp(1, .18, (t - .85) / .15));
    for (let c = -1; c <= 1; c++) {
      const p = base.clone().addScaledVector(dir, t * length).addScaledVector(side, c * w * .5)
        .addScaledVector(UP, lift * Math.sin(Math.PI * Math.min(1, t * 1.1)) * (1 - .45 * Math.abs(c)) - droop * t * t);
      positions.push(p.x, p.y, p.z); uvs.push(t, c);
    }
  }
  for (let r = 0; r < rows; r++) for (let c = 0; c < 2; c++) {
    const a = r * 3 + c, b = a + 1, d = a + 3, e = d + 1;
    index.push(a, d, b, b, d, e);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(index);
  g.computeVertexNormals();
  return g;
}

/** Paint a feather by its (t along, c across) coordinates. */
function addFeather(builder, base, dir, side, length, width, options, paint) {
  const g = featherGeometry(base, dir, side, length, width, options);
  const uv = g.attributes.uv;
  builder.add(g, null, (p, n, out, i) => paint(uv.getX(i), uv.getY(i), out, p));
}

// ---------------------------------------------------------------- the model
/** Body-local anchor points (metres; +z forward, y up from the body centre). */
const BODY_Y = .108;
const NECK_BASE = new THREE.Vector3(0, .022, .066);
const HEAD_REST = new THREE.Vector3(0, .1, .118);
const SHOULDER = new THREE.Vector3(.038, .058, .05);
const TAIL_BASE = new THREE.Vector3(0, .004, -.108);
const HIP = new THREE.Vector3(.026, .058, .008); // root-local: legs stay upright

function buildBody(plumage, seed) {
  const b = new PartBuilder();
  // Teardrop torso: full chest, tapering to the tail.
  const profile = [[0, -.142], [.026, -.132], [.048, -.105], [.064, -.065], [.074, -.02], [.077, .018], [.073, .055], [.06, .088], [.04, .112], [.016, .126], [0, .13]]
    .map(([r, y]) => new THREE.Vector2(r, y));
  const lathe = new THREE.LatheGeometry(profile, 18);
  lathe.deleteAttribute('uv');
  const C = {
    back: col(plumage.back), body: col(plumage.body), chest: col(plumage.chest), belly: col(plumage.belly),
    rump: col(plumage.rump), band: col(plumage.band), white: col('#eceae4'), dark: col(plumage.head),
  };
  const tmp = new THREE.Color();
  b.add(lathe, compose(0, 0, 0, Math.PI / 2, 0, 0, .93, .84, 1.05), (p, n, out) => {
    const u = (p.z + .142) / .272; // 0 tail → 1 chest
    out.copy(C.belly).lerp(C.back, smooth(-.035, .04, p.y));
    tmp.copy(C.chest); out.lerp(tmp, smooth(.62, .86, u) * (1 - smooth(.04, .07, p.y)));
    out.lerp(C.rump, smooth(.32, .14, u) * smooth(.0, .03, p.y) * .85);
    out.lerp(C.band, smooth(.2, .02, u) * smooth(.0, -.03, p.y) * .6);
    if (plumage.pied) {
      const patch = noise3(p.x * 34 + seed, p.y * 34, p.z * 34);
      out.lerp(patch > .62 ? C.dark : C.white, patch > .62 ? .55 : .35);
    }
    out.multiplyScalar(.94 + noise3(p.x * 90 + seed, p.y * 90, p.z * 90) * .12);
  });
  // Bake the y-squash fix back into positions (paint mutated p for colour only).
  const g = b.build();
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) if (pos.getY(i) < 0) pos.setY(i, pos.getY(i) * 1.08);
  g.computeVertexNormals();
  return g;
}

function buildHead(plumage, seed) {
  const b = new PartBuilder();
  const head = col(plumage.head), beak = col('#2b2b30'), cere = col('#ebe7de'), eye = col('#e2731a'), pupil = col('#0d0d0f'), lid = col('#7d6f6a');
  const sphere = (r, w = 14, h = 10) => { const g = new THREE.SphereGeometry(r, w, h); g.deleteAttribute('uv'); return g; };
  b.add(sphere(.033, 16, 12), compose(0, 0, 0, 0, 0, 0, .9, .94, 1.12), (p, n, out) => {
    out.copy(head).multiplyScalar(.95 + noise3(p.x * 120 + seed, p.y * 120, p.z * 120) * .1);
    if (p.y > .02) out.multiplyScalar(1.05);
  });
  const cone = new THREE.ConeGeometry(.0056, .024, 10); cone.deleteAttribute('uv');
  b.add(cone, compose(0, -.006, .044, Math.PI / 2, 0, 0), (p, n, out) => out.copy(beak).lerp(col('#4a4a52'), smooth(.05, .058, p.z)));
  b.add(sphere(.0068, 10, 8), compose(0, -.0005, .0355, -.3, 0, 0, 1.05, .55, 1.4), flat(cere));
  for (const s of [-1, 1]) {
    b.add(sphere(.0066, 10, 8), compose(s * .0215, .0075, .0135), flat(lid));
    b.add(sphere(.0058, 10, 8), compose(s * .0232, .0078, .0148), flat(eye));
    b.add(sphere(.0031, 8, 6), compose(s * .0281, .008, .0163), flat(pupil));
  }
  // A pigeon's head is small for its body.
  const g = b.build();
  g.scale(.9, .9, .9);
  g.computeBoundingSphere();
  return g;
}

const tmpNeck = new THREE.Color();
function buildNeck(plumage) {
  // Unit-height tube along +y, stretched between body and head every frame.
  // Flared at the root so it swells into the chest instead of ending in a ring.
  const profile = [[.046, 0], [.04, .1], [.034, .26], [.03, .5], [.027, .78], [.026, 1]].map(([r, y]) => new THREE.Vector2(r, y));
  const g = new THREE.LatheGeometry(profile, 16);
  g.deleteAttribute('uv');
  const b = new PartBuilder();
  const body = col(plumage.body), head = col(plumage.head), a = col(plumage.neckA), bb = col(plumage.neckB);
  b.add(g, null, (p, n, out) => {
    const t = p.y; // 0 base → 1 head
    out.copy(body).lerp(head, smooth(.1, .95, t));
    const patch = Math.sin(Math.PI * clamp((t - .05) / .85, 0, 1)) * (.55 + .35 * Math.abs(n.x));
    tmpNeck.copy(bb).lerp(a, smooth(.3, .7, t + n.z * .12));
    out.lerp(tmpNeck, patch * .8);
  });
  const geometry = b.build();
  // v = height along the neck, for the iridescence fade map.
  const pos = geometry.attributes.position, uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) { uv[i * 2] = .5; uv[i * 2 + 1] = pos.getY(i); }
  geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return geometry;
}

/** Iridescence strength up the neck: none where it meets chest and head. */
function neckSheenMap() {
  const size = 32, data = new Uint8Array(size * 4);
  for (let i = 0; i < size; i++) {
    const v = i / (size - 1), k = Math.round(255 * smooth(.08, .38, v) * (1 - smooth(.72, .92, v)));
    data.set([k, k, k, 255], i * 4);
  }
  const texture = new THREE.DataTexture(data, 1, size);
  texture.magFilter = texture.minFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

/** Arm (inner) wing: coverts surface + 10 secondaries. Span along +x. */
function buildInnerWing(plumage, seed) {
  const b = new PartBuilder();
  const wing = col(plumage.wing), bar = col(plumage.bar), back = col(plumage.back);
  const span = .115;
  // Coverts: a cambered sheet from leading edge (z +.026) back to z -.034.
  for (let i = 0; i < 9; i++) {
    const x = .006 + i * (span / 9), base = new THREE.Vector3(x, .002, .026);
    addFeather(b, base, new THREE.Vector3(.12, 0, -1).normalize(), new THREE.Vector3(1, 0, .12).normalize(), .062, .03, { lift: .005 }, (t, c, out, p) => {
      out.copy(i < 2 ? back : wing).lerp(wing, smooth(0, .4, t));
      if (plumage.check) {
        const spot = noise3(p.x * 160 + seed, 0, p.z * 160);
        if (spot > 1 - plumage.check * .55) out.lerp(bar, .75);
      }
      // Front wing bar on the greater coverts.
      if (!plumage.check || plumage.check < .5) out.lerp(bar, smooth(.58, .68, t) * (1 - smooth(.9, .97, t)) * (i > 1 ? .95 : .3));
      out.multiplyScalar(.95 + Math.abs(c) * -.06 + .06 * (1 - t));
    });
  }
  // Secondaries: overlapping blades at the trailing edge.
  for (let i = 0; i < 10; i++) {
    const x = .004 + i * .0118;
    const base = new THREE.Vector3(x, -.001, -.008);
    const length = lerp(.066, .082, i / 9);
    addFeather(b, base, new THREE.Vector3(.06 + i * .012, 0, -1).normalize(), new THREE.Vector3(1, 0, .08).normalize(), length, .027, { lift: .003, droop: .002 }, (t, c, out) => {
      out.copy(wing).multiplyScalar(.96 - t * .08);
      // Second (rear) wing bar.
      if (!plumage.check || plumage.check < .5) out.lerp(bar, smooth(.34, .44, t) * (1 - smooth(.66, .76, t)));
      out.lerp(col(plumage.primary), smooth(.82, 1, t) * .5);
      if (Math.abs(c) > .5) out.multiplyScalar(.9);
    });
  }
  return b.build();
}

/** Hand (outer) wing: coverts + 9 primaries fanned from the wrist. */
function buildHandWing(plumage) {
  const b = new PartBuilder();
  const wing = col(plumage.wing), primary = col(plumage.primary);
  for (let i = 0; i < 4; i++) {
    const base = new THREE.Vector3(.002 + i * .011, .002, .02);
    addFeather(b, base, new THREE.Vector3(.25, 0, -1).normalize(), new THREE.Vector3(1, 0, .25).normalize(), .05, .02, { lift: .004 },
      (t, c, out) => out.copy(wing).multiplyScalar(.98 - t * .06));
  }
  for (let j = 0; j < 9; j++) {
    const k = j / 8; // 0 innermost → 1 outermost
    const angle = lerp(-1.22, -.1, Math.pow(k, .85));
    const length = lerp(.1, .152, Math.sin(Math.min(1, k * 1.12) * Math.PI * .5)) - (j === 8 ? .01 : 0);
    const dir = new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle));
    const side = new THREE.Vector3(-dir.z, 0, dir.x);
    const base = new THREE.Vector3(.004 + k * .036, -.0015 * (1 - k), .004 - k * .004);
    addFeather(b, base, dir, side, length, .027 - k * .005, { lift: .004, droop: .003 }, (t, c, out) => {
      out.copy(wing).lerp(primary, smooth(.12, .5, t) * lerp(.55, 1, k));
      if (c > .4) out.multiplyScalar(.88); // inner vane shade
      out.multiplyScalar(1.02 - t * .1);
    });
  }
  return b.build();
}

/** Tail: 12 rectrices fanned behind, dark terminal band. Points along -z. */
function buildTail(plumage) {
  const b = new PartBuilder();
  const tail = col(plumage.tail), band = col(plumage.band), white = col('#e9e7e2');
  for (let i = 0; i < 12; i++) {
    const k = i / 11 - .5; // -.5 .. .5
    const angle = k * .5;
    const dir = new THREE.Vector3(Math.sin(angle), 0, -Math.cos(angle));
    const side = new THREE.Vector3(-dir.z, 0, dir.x);
    const base = new THREE.Vector3(k * .03, -.002 * Math.abs(k) * 4, 0);
    const length = .108 - Math.abs(k) * .016;
    addFeather(b, base, dir, side, length, .024, { lift: .002, droop: .004 }, (t, c, out) => {
      out.copy(tail).multiplyScalar(.98 - t * .05);
      out.lerp(band, smooth(.68, .75, t) * (1 - smooth(.93, .99, t) * .4));
      // Rock-dove outer tail feathers have a pale outer edge.
      if (Math.abs(k) > .44 && c * Math.sign(k) > .3 && t < .68) out.lerp(white, .6);
    });
  }
  return b.build();
}

function buildLeg(plumage) {
  const b = new PartBuilder();
  const skin = col('#c2535d'), claw = col('#2a2426'), thigh = col(plumage.belly);
  const cyl = (r1, r2, h) => { const g = new THREE.CylinderGeometry(r1, r2, h, 7, 1); g.deleteAttribute('uv'); return g; };
  // Leg origin = hip; ground at y = -HIP.y.
  const ground = -HIP.y;
  const thighG = new THREE.SphereGeometry(.014, 8, 6); thighG.deleteAttribute('uv');
  b.add(thighG, compose(0, -.006, 0, 0, 0, 0, 1, 1.3, 1.1), flat(thigh));
  b.add(cyl(.0042, .0048, .046), compose(0, ground + .03, .002, .08, 0, 0), flat(skin));
  for (const [yaw, len] of [[-.42, .026], [0, .03], [.42, .026], [Math.PI, .015]]) {
    const toe = cyl(.0026, .0018, len);
    const dir = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
    const mid = new THREE.Vector3(0, ground + .003, .004).addScaledVector(dir, len * .5);
    const q = new THREE.Quaternion().setFromUnitVectors(UP, dir.clone().setY(-.08).normalize());
    b.add(toe, new THREE.Matrix4().compose(mid, q, new THREE.Vector3(1, 1, 1)), (p, n, out) =>
      out.copy(skin).lerp(claw, smooth(len * .35, len * .5, p.clone().sub(mid).dot(dir))));
  }
  return b.build();
}

// --------------------------------------------------------------- the actor
const FOLDED = { sweep: 1.5, raise: 0, twist: -2.1, wristRaise: .03, wristSweep: .04, handSpread: .42, innerChord: .84 };
const GLIDE = { sweep: .22, raise: .3, twist: .06, wristRaise: -.12, wristSweep: .12, handSpread: .96, innerChord: 1 };
const POSE_KEYS = Object.keys(FOLDED);
const NECK_TO_HEAD = new THREE.Vector3(0, -.014, -.014);

/** Point on a cubic Bezier curve (writes into out). */
function bezier(out, a, b, c, d, u) {
  const v = 1 - u, k0 = v * v * v, k1 = 3 * v * v * u, k2 = 3 * v * u * u, k3 = u * u * u;
  return out.set(
    a.x * k0 + b.x * k1 + c.x * k2 + d.x * k3,
    a.y * k0 + b.y * k1 + c.y * k2 + d.y * k3,
    a.z * k0 + b.z * k1 + c.z * k2 + d.z * k3);
}
/** Derivative d/du of the same curve (writes into out). */
function bezierTangent(out, a, b, c, d, u) {
  const v = 1 - u, k0 = -3 * v * v, k1 = 3 * v * v - 6 * u * v, k2 = 6 * u * v - 3 * u * u, k3 = 3 * u * u;
  return out.set(
    a.x * k0 + b.x * k1 + c.x * k2 + d.x * k3,
    a.y * k0 + b.y * k1 + c.y * k2 + d.y * k3,
    a.z * k0 + b.z * k1 + c.z * k2 + d.z * k3);
}

export class Pigeon {
  constructor(plumage = pickPlumage()) {
    const mats = pigeonMaterials();
    const seed = Math.random() * 100;
    this.plumage = plumage;
    this.root = new THREE.Group();
    this.root.name = `Pigeon (${plumage.name})`;
    this.body = new THREE.Group();
    this.body.position.y = BODY_Y;
    this.root.add(this.body);

    this.torso = new THREE.Mesh(buildBody(plumage, seed), mats.solid);
    this.neck = new THREE.Mesh(buildNeck(plumage), mats.sheen);
    this.neck.position.copy(NECK_BASE);
    this.head = new THREE.Mesh(buildHead(plumage, seed), mats.solid);
    this.head.position.copy(HEAD_REST);
    this.tail = new THREE.Group();
    this.tail.position.copy(TAIL_BASE);
    this.tail.add(new THREE.Mesh(buildTail(plumage), mats.feather));
    this.body.add(this.torso, this.neck, this.head, this.tail);

    const inner = buildInnerWing(plumage, seed), hand = buildHandWing(plumage);
    this.wings = [];
    for (const side of [1, -1]) {
      const mirror = new THREE.Group();
      mirror.scale.x = side;
      const shoulder = new THREE.Group();
      shoulder.position.set(SHOULDER.x, SHOULDER.y, SHOULDER.z);
      shoulder.rotation.order = 'YZX';
      const innerMesh = new THREE.Mesh(inner, mats.feather);
      const wrist = new THREE.Group();
      wrist.position.set(.113, 0, -.002);
      wrist.rotation.order = 'YZX';
      wrist.add(new THREE.Mesh(hand, mats.feather));
      shoulder.add(innerMesh, wrist);
      mirror.add(shoulder);
      this.body.add(mirror);
      this.wings.push({ shoulder, inner: innerMesh, wrist });
    }

    const legGeometry = buildLeg(plumage);
    this.legs = [1, -1].map(side => {
      const leg = new THREE.Mesh(legGeometry, mats.solid);
      leg.position.set(side * HIP.x, HIP.y, HIP.z);
      this.root.add(leg);
      return leg;
    });

    this.root.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = false; } });
    this.root.visible = false;

    this.state = 'hidden';
    this.velocity = new THREE.Vector3();
    this.fleeFrom = new THREE.Vector3();
    this.phase = Math.random() * 10;
    this.flap = Math.random() * TAU;
    this.yaw = 0; this.targetYaw = 0;
    this.action = 'stand'; this.actionTime = 0; this.actionLength = 1;
    this.walkCycle = 0; this.groundTimer = 0;
    this.look = 0; this.lookTarget = 0; this.lookTimer = 0;
    this.timer = 0; this.flightTime = 0; this.flightBlend = 0;
    this.bank = 0; this.turnRate = 0; this.cruise = 7; this.startY = 0; this.maxRise = 12;
    this.flapWeight = 1; this.glideTimer = 0; this.gliding = false;
    // Hop aside (ground action 'hop'): a short arc from hopFrom to hopTo.
    this.hopFrom = new THREE.Vector3(); this.hopTo = new THREE.Vector3();
    this.hopLength = .3; this.hopHeight = .12; this.hopCooldown = 0; this.hopSide = 1;
    // Alert flinch: freeze, head up, crouch.
    this.flinchTime = 0; this.flinchAmp = 1; this.flinchRate = 18; this.flinchBlend = 0; this.startled = false;
    // Take-off bookkeeping for the owner's wing-clap sound.
    this.tookOff = false; this.clapGain = 0;
    // Roost: role flag, current perch (owner-managed), path to a perch.
    this.roost = false; this.perchAnchor = null; this.perchIndex = -1; this.perchAngle = 0; this.perchYaw = 0;
    this.pathStart = new THREE.Vector3(); this.pathC1 = new THREE.Vector3();
    this.pathC2 = new THREE.Vector3(); this.pathEnd = new THREE.Vector3();
    this.pathLength = 4; this.launched = false; this.preenSide = 1;
    this.pose = { ...FOLDED };
    this._flapPose = { ...FOLDED };
    this._head = new THREE.Vector3();
    this._probe = new THREE.Vector3();
    this._dir = new THREE.Vector3();
    this._velocity = new THREE.Vector3();
    this.applyWings(this.pose);
    this.posHead(0, 0, .2, 1);
  }

  /** Legacy alias used by WorldLife's callers and tests. */
  get group() { return this.root; }

  hide() { this.state = 'hidden'; this.root.visible = false; this.tookOff = false; this.clapGain = 0; this.startled = false; }

  /** On a perch, or flying to one. */
  get roosting() { return this.state === 'perch' || this.state === 'roost'; }

  spawn(point, yaw) {
    this.root.position.copy(point);
    this.yaw = this.targetYaw = yaw;
    this.root.rotation.set(0, yaw, 0, 'YXZ');
    this.root.visible = true;
    this.state = 'idle';
    this.flightBlend = 0;
    this.legs.forEach(l => { l.visible = true; l.rotation.set(0, 0, 0); });
    this.body.rotation.set(0, 0, 0);
    this.body.position.set(0, BODY_Y, 0);
    Object.assign(this.pose, FOLDED);
    this.applyWings(this.pose);
    this.tail.rotation.set(.08, 0, 0); this.tail.scale.set(1, 1, 1);
    this.look = this.lookTarget = 0;
    this.hopCooldown = 0; this.hopSide = Math.random() < .5 ? -1 : 1;
    this.flinchTime = 0; this.flinchBlend = 0; this.startled = false;
    this.tookOff = false; this.clapGain = 0;
    this.posHead(0, 0, .2, 1); // never draw a frame with an unposed neck
    this.chooseAction(true);
  }

  /** Sit on a perch (no walking: stand, shuffle round, glance, preen). */
  perch(point, yaw) {
    this.spawn(point, yaw);
    this.state = 'perch';
    this.chooseAction();
  }

  /**
   * Hop aside to `target` (same ground height): `length` s, peaking `height` m
   * above the ground; no new hop for `cooldown` s after it lands.
   */
  hop(target, length, height, cooldown = 0) {
    if (this.state !== 'idle' || this.action === 'hop') return false;
    this.hopFrom.copy(this.root.position);
    this.hopTo.copy(target);
    this.hopLength = Math.max(.05, length); this.hopHeight = height;
    this.hopCooldown = this.hopLength + Math.max(0, cooldown);
    this.action = 'hop'; this.actionTime = 0; this.actionLength = this.hopLength;
    this.targetYaw = Math.atan2(target.x - this.hopFrom.x, target.z - this.hopFrom.z);
    return true;
  }

  /** Startle: freeze with the head up for `duration` s (amplitude and ease rate scale it). */
  flinch(duration, amplitude = 1, rate = 18) {
    if (this.state !== 'idle') return false;
    this.flinchTime = duration; this.flinchAmp = amplitude; this.flinchRate = rate;
    return true;
  }

  /**
   * Leave the perch (or the floor) and fly a curved loop to `end`, landing
   * there after `length` s. `delay` s of stillness first (staggered flocks);
   * `swing` is how far out the loop bulges.
   */
  flyToPerch(end, length, { delay = 0, swing = 4, yaw = rand(0, TAU) } = {}) {
    if (this.state === 'hidden' || this.state === 'flee' || this.state === 'alert') return false;
    const s = this.pathStart.copy(this.root.position);
    this.pathEnd.copy(end);
    const rise = end.y - s.y, climb = rise > 2;
    const a = rand(0, TAU), b = a + (Math.random() < .5 ? -1 : 1) * rand(.9, 1.6);
    // Control points never above the start/end heights, so the loop stays under the roof.
    this.pathC1.set(s.x + Math.sin(a) * swing, s.y + (climb ? rise * .55 : -.9), s.z + Math.cos(a) * swing);
    this.pathC2.set(end.x + Math.sin(b) * swing * .8, end.y - (climb ? 1.2 : .5), end.z + Math.cos(b) * swing * .8);
    this.state = 'roost';
    this.pathLength = Math.max(.5, length);
    this.flightTime = -Math.max(0, delay);
    this.launched = false;
    this.perchYaw = yaw;
    this.flightBlend = 0; this.bank = 0;
    this.gliding = false; this.glideTimer = rand(1, 1.4); this.flapWeight = 1;
    this.flap = -Math.PI / 2;
    return true;
  }

  /** Start a take-off after `delay` seconds (staggered flocks look natural). */
  scare(from, delay = 0) {
    if (this.state !== 'idle') return false;
    this.fleeFrom.copy(from);
    this.state = 'alert';
    this.timer = delay;
    if (delay <= 0) this.takeOff();
    return true;
  }

  takeOff() {
    this.state = 'flee';
    this.flightTime = 0;
    this.tookOff = true;
    const away = this.root.position.clone().sub(this.fleeFrom).setY(0);
    if (away.lengthSq() < 1e-4) away.set(Math.random() - .5, 0, Math.random() - .5);
    away.normalize().applyAxisAngle(UP, rand(-.6, .6));
    this.velocity.copy(away).multiplyScalar(rand(2.2, 3.2)).setY(rand(3, 3.9));
    this.turnRate = rand(-.55, .55);
    this.cruise = rand(6.5, 8.5);
    this.startY = this.root.position.y;
    this.gliding = false; this.glideTimer = rand(1, 1.4); this.flapWeight = 1;
    this.flap = -Math.PI / 2; // start from wings-up
    this.yaw = Math.atan2(this.velocity.x, this.velocity.z);
    return true;
  }

  chooseAction(first = false) {
    const r = Math.random();
    this.actionTime = 0;
    if (this.state === 'perch') {
      // Perched: no walking. Stand and glance, shuffle round, or preen.
      if (r < .45) { this.action = 'stand'; this.actionLength = rand(1, 2.6); }
      else if (r < .7) { this.action = 'turn'; this.actionLength = rand(.5, .9); this.targetYaw = this.yaw + rand(.5, 1.4) * (Math.random() < .5 ? -1 : 1); }
      else { this.action = 'preen'; this.actionLength = rand(1.2, 2.4); this.preenSide = Math.random() < .5 ? -1 : 1; }
      return;
    }
    if (first || r < .36) { this.action = 'walk'; this.actionLength = rand(.8, 2.2); this.targetYaw = this.yaw + rand(-.9, .9); }
    else if (r < .66) { this.action = 'peck'; this.actionLength = rand(.7, 1.6); }
    else if (r < .82) { this.action = 'stand'; this.actionLength = rand(.6, 1.6); }
    else if (r < .94) { this.action = 'turn'; this.actionLength = rand(.5, .9); this.targetYaw = this.yaw + rand(1, 2.4) * (Math.random() < .5 ? -1 : 1); }
    else { this.action = 'coo'; this.actionLength = rand(1.6, 2.6); }
  }

  /**
   * ctx: { surface, indoor }. Returns false once the bird is gone.
   */
  update(dt, ctx = {}) {
    if (this.state === 'hidden') return false;
    this.phase += dt;
    if (this.state === 'flee') return this.updateFlight(dt, ctx);
    if (this.state === 'roost') return this.updateRoostFlight(dt);
    this.updateGround(dt, ctx);
    return true;
  }

  updateGround(dt, ctx) {
    const alert = this.state === 'alert';
    if (alert) {
      this.timer -= dt;
      if (this.timer <= 0) { this.takeOff(); return; }
    } else {
      this.actionTime += dt;
      if (this.action === 'hop') {
        if (this.actionTime >= this.hopLength) { this.root.position.copy(this.hopTo); this.chooseAction(); }
      } else if (this.actionTime > this.actionLength) this.chooseAction();
    }
    this.hopCooldown = Math.max(0, this.hopCooldown - dt);
    const flinching = !alert && this.flinchTime > 0;
    if (flinching) this.flinchTime = Math.max(0, this.flinchTime - dt);
    this.flinchBlend += ((flinching ? 1 : 0) - this.flinchBlend) * Math.min(1, dt * this.flinchRate);
    // A flinch freezes the bird where it stands (a hop already under way finishes).
    const action = alert || (flinching && this.action !== 'hop') ? 'stand' : this.action;
    let speed = 0, stepping = false;
    if (action === 'walk') { speed = .27; stepping = true; }
    if (action === 'turn' || action === 'hop') stepping = true;
    if (action === 'coo') { stepping = true; this.targetYaw += dt * 1.6; speed = .05; }

    this.yaw += wrapAngle(this.targetYaw - this.yaw) * Math.min(1, dt * (action === 'hop' ? 12 : action === 'turn' ? 5 : 3));
    if (stepping) this.walkCycle += dt / (action === 'walk' ? .3 : action === 'hop' ? .14 : .26);

    // Hop: a quick, low arc to the side (the stepping legs and head-bob carry it).
    let hop = 0;
    if (action === 'hop') {
      const u = Math.min(1, this.actionTime / this.hopLength);
      hop = Math.sin(Math.PI * u);
      this.root.position.lerpVectors(this.hopFrom, this.hopTo, u);
      this.root.position.y += 4 * this.hopHeight * u * (1 - u);
    }

    // Walk forward, but only over flat ground (never off a ledge or up a ramp).
    if (speed > 0) {
      const p = this.root.position;
      this._dir.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
      this.groundTimer -= dt;
      if (this.groundTimer <= 0 && ctx.surface?.ground) {
        this.groundTimer = .12;
        const probe = this._probe.copy(p).addScaledVector(this._dir, .16);
        const hit = ctx.surface.ground(probe, .3, .5);
        if (!hit || hit.normal.y < .97 || Math.abs(hit.point.y - p.y) > .06) {
          this.targetYaw = this.yaw + Math.PI + rand(-.6, .6);
          this.action = 'turn'; this.actionTime = 0; this.actionLength = .7;
          speed = 0;
        } else p.y = hit.point.y;
      }
      p.addScaledVector(this._dir, speed * dt);
    }
    this.root.rotation.set(0, this.yaw, 0, 'YXZ');

    // ---- body
    const s = this.walkCycle % 1;
    const step = stepping ? Math.sin(s * TAU) : 0;
    const breathe = Math.sin(this.phase * 3.1) * .012;
    let bodyPitch = -.2, headDrop = 0, headForward = 0, headPitch = 0, headSide = 0, neckPuff = 1, tailSpread = 1, tailPitch = .08;
    if (action === 'walk' || action === 'turn' || action === 'hop') {
      // Pigeon head-bob: a quick thrust forward, then the head holds still
      // in the world while the body walks up underneath it.
      const thrust = .26;
      headForward = s < thrust ? lerp(-.017, .019, smooth(0, 1, s / thrust)) : lerp(.019, -.017, (s - thrust) / (1 - thrust));
      headDrop = Math.abs(headForward) * .12;
      tailPitch += step * .05;
    }
    if (action === 'peck') {
      const pp = (this.actionTime * 2.4) % 1;
      const dip = smooth(0, .28, pp) * (1 - smooth(.42, .78, pp));
      headDrop = .088 * dip; headForward = .035 * dip; headPitch = 1.05 * dip;
      bodyPitch += .42 * dip;
      tailPitch -= .18 * dip;
    }
    if (action === 'coo') {
      // Courtship display: puffed neck, bowing, fanned dragging tail.
      const bow = Math.max(0, Math.sin(this.actionTime * 5.2));
      neckPuff = 1.38; bodyPitch += .32 * bow - .06; headDrop = .035 * bow; headPitch = .5 * bow;
      tailSpread = 1.5; tailPitch = -.12;
    }
    if (action === 'preen') {
      // Head turned back into the shoulder feathers, nibbling.
      const k = smooth(0, .25, this.actionTime) * (1 - smooth(this.actionLength - .25, this.actionLength, this.actionTime));
      this.lookTarget = this.preenSide * 2.3 * k; this.lookTimer = 1;
      headForward = -.045 * k; headSide = this.preenSide * .028 * k; headPitch = .5 * k;
      headDrop = (.04 + .006 * Math.sin(this.actionTime * 15)) * k;
      tailPitch += .06 * Math.sin(this.actionTime * 9) * k;
    }
    if (action === 'hop') { bodyPitch -= .12 * hop; tailPitch += .1 * hop; tailSpread = 1 + .3 * hop; }
    const flinch = this.flinchBlend * this.flinchAmp;
    if (flinch > .001) {
      headDrop = lerp(headDrop, -.02, flinch); headForward = lerp(headForward, -.008, flinch); headPitch *= 1 - flinch;
      bodyPitch = lerp(bodyPitch, -.36, flinch); neckPuff = lerp(neckPuff, .9, flinch);
    }
    if (alert) {
      headDrop = -.016; bodyPitch = -.32; neckPuff = .92;
      if (this.timer < .1) { this.body.position.y = BODY_Y - .014; bodyPitch = -.05; }
    }
    if (!alert || this.timer >= .1) this.body.position.y = BODY_Y + Math.abs(step) * .003 - .012 * flinch;
    this.body.rotation.set(bodyPitch, 0, step * .055, 'YXZ');
    this.body.scale.setScalar(1 + breathe);
    this.legs[0].rotation.x = step * .5;
    this.legs[1].rotation.x = -step * .5;

    // Quick glances: pigeons snap their heads between targets.
    this.lookTimer -= dt;
    if (this.lookTimer <= 0 && flinch > .5) { this.lookTarget *= .5; this.lookTimer = .1; } // eyes front
    else if (this.lookTimer <= 0) { this.lookTarget = action === 'peck' ? rand(-.2, .2) : rand(-.75, .75); this.lookTimer = rand(.35, 1.2); }
    this.look += (this.lookTarget - this.look) * Math.min(1, dt * 16);

    this.posHead(headForward, headDrop, headPitch - bodyPitch, neckPuff, headSide);
    this.tail.rotation.set(tailPitch, 0, 0);
    this.tail.scale.set(tailSpread, 1, 1);
    if (hop > 0) {
      // A little wing flick for balance mid-hop.
      const pose = this._flapPose, k = .3 * hop;
      for (const key of POSE_KEYS) pose[key] = lerp(FOLDED[key], GLIDE[key], k);
      this.applyWings(pose);
    } else this.applyWings(FOLDED);
  }

  /** Place the head (keeping it level in the world) and stretch the neck to it. */
  posHead(forward, drop, pitch, puff, side = 0) {
    this.head.position.set(HEAD_REST.x + side, HEAD_REST.y - drop, HEAD_REST.z + forward);
    // Counter the body pitch so the head reads level, then add its own pitch.
    this.head.rotation.set(pitch, this.look, 0, 'YXZ');
    const target = this._head.copy(this.head.position).add(NECK_TO_HEAD);
    const dir = target.sub(NECK_BASE);
    const length = dir.length();
    this.neck.quaternion.setFromUnitVectors(UP, dir.multiplyScalar(1 / length));
    this.neck.scale.set(puff, length, puff);
  }

  applyWings(pose) {
    for (const wing of this.wings) {
      wing.shoulder.rotation.set(pose.twist, pose.sweep, pose.raise);
      wing.inner.scale.z = pose.innerChord;
      wing.wrist.rotation.set(0, pose.wristSweep, pose.wristRaise);
      wing.wrist.scale.z = pose.handSpread;
    }
  }

  updateFlight(dt, ctx) {
    this.flightTime += dt;
    const t = this.flightTime;
    this.flightBlend = Math.min(1, this.flightBlend + dt / .12);
    const v = this.velocity;

    // Horizontal: accelerate to cruise and curve gently.
    let hs = Math.hypot(v.x, v.z);
    let heading = Math.atan2(v.x, v.z);
    hs += (this.cruise - hs) * Math.min(1, dt * 1.1);
    if (t > .35) heading += this.turnRate * dt;
    v.x = Math.sin(heading) * hs; v.z = Math.cos(heading) * hs;

    // Vertical: strong climb out, then a gentle climb (capped indoors).
    const rise = this.root.position.y - this.startY;
    const cap = ctx.indoor ? 4.2 : this.maxRise;
    const targetVy = rise > cap ? 0 : t < .7 ? 3.4 : ctx.indoor ? .5 : 1.3;
    v.y += (targetVy - v.y) * Math.min(1, dt * 2.2);
    this.root.position.addScaledVector(v, dt);

    this.animateFlight(dt, t, hs, v.y, heading, this.turnRate, smooth(0, 1, this.flightBlend));

    if (t > 6.5) { this.hide(); return false; }
    return true;
  }

  /** Follow the curved path to a perch; land, fold up and sit when it ends. */
  updateRoostFlight(dt) {
    this.flightTime += dt;
    const t = this.flightTime;
    if (t < 0) return true; // poised on the perch for a beat (staggered flock)
    if (!this.launched) { this.launched = true; this.tookOff = true; }
    const length = this.pathLength, x = Math.min(1, t / length);
    if (x >= 1) { this.perch(this.pathEnd, this.perchYaw); return true; }
    // Ease in and out along the curve: slow lift-off, flare to land.
    const u = smooth(0, 1, x), du = 6 * x * (1 - x) / length;
    bezier(this.root.position, this.pathStart, this.pathC1, this.pathC2, this.pathEnd, u);
    const tangent = bezierTangent(this._dir, this.pathStart, this.pathC1, this.pathC2, this.pathEnd, u);
    const v = this._velocity.copy(tangent).multiplyScalar(du);
    const hs = Math.hypot(v.x, v.z);
    const heading = Math.hypot(tangent.x, tangent.z) > 1e-4 ? Math.atan2(tangent.x, tangent.z) : this.yaw;
    const turnRate = dt > 0 ? wrapAngle(heading - this.yaw) / dt : 0;
    // Wings open over the first 0.12 s and fold over the last 0.3 s (the landing flare).
    const fb = smooth(0, .12, t) * (1 - smooth(length - .3, length, t));
    this.animateFlight(dt, t, hs, v.y, heading, turnRate, fb, { braking: length - t < .6, tilt: fb });
    return true;
  }

  /**
   * Wingbeats, glides, banking and body/tail/head posture for a flying bird.
   * fb blends folded (0) to flying (1); tilt scales pitch and bank.
   */
  animateFlight(dt, t, hs, vy, heading, turnRate, fb, { braking = false, tilt = 1 } = {}) {
    // Flap bursts and glides, like a real pigeon leaving a plaza.
    this.glideTimer -= dt;
    if (this.glideTimer <= 0) {
      this.gliding = !this.gliding;
      this.glideTimer = this.gliding ? rand(.35, .65) : rand(.5, .9);
    }
    const wantFlap = braking || t < 1.1 || !this.gliding;
    this.flapWeight += ((wantFlap ? 1 : 0) - this.flapWeight) * Math.min(1, dt * 7);
    const freq = lerp(6.4, 9.6, smooth(1.4, 0, t));
    const amp = lerp(.82, 1.18, smooth(1.2, 0, t));
    this.flap += dt * freq * TAU * Math.max(.25, this.flapWeight);

    const sn = Math.sin(this.flap), cs = Math.cos(this.flap);
    const flapPose = this._flapPose;
    flapPose.sweep = .1 + .3 * Math.max(0, cs);
    flapPose.raise = .16 + amp * sn;
    flapPose.twist = -.34 * cs;
    flapPose.wristRaise = amp * .55 * Math.sin(this.flap - .9);
    flapPose.wristSweep = .5 * Math.max(0, cs);
    flapPose.handSpread = 1 - .3 * Math.max(0, cs);
    flapPose.innerChord = 1;
    const fw = this.flapWeight;
    for (const key of POSE_KEYS) {
      const air = lerp(GLIDE[key], flapPose[key], fw);
      this.pose[key] = lerp(FOLDED[key], air, fb);
    }
    this.applyWings(this.pose);

    // Orientation: face the flight path, pitch with the climb, bank into turns.
    this.yaw = heading;
    const pitch = clamp(-Math.atan2(vy, hs) * .75, -.75, .3);
    this.bank += (clamp(-turnRate * hs * .1, -.6, .6) - this.bank) * Math.min(1, dt * 3);
    this.root.rotation.set(pitch * tilt, heading, this.bank * tilt, 'YXZ');

    // Body rides the wingbeat; legs tuck away; tail fans for lift.
    this.body.position.y = BODY_Y + sn * .01 * fw * fb;
    this.body.rotation.set(lerp(-.2, 0, fb), 0, 0, 'YXZ');
    this.body.scale.setScalar(1);
    for (const leg of this.legs) { leg.rotation.x = lerp(0, 1.25, fb); leg.visible = fb < .7; }
    this.tail.rotation.set(lerp(.08, -.05 + (1 - fw) * .06, fb), 0, 0);
    this.tail.scale.set(lerp(1, lerp(1.25, 1.75, smooth(1, 0, t)), fb), 1, 1);
    this.look *= .9;
    this.posHead(.01 * fb, -.012 * fb, lerp(.2, -.05, fb), 1);
  }

  dispose() {
    const seen = new Set();
    this.root.traverse(o => { if (o.isMesh && !seen.has(o.geometry)) { seen.add(o.geometry); o.geometry.dispose(); } });
    this.root.removeFromParent();
  }
}

/** A single loose contour feather (drifts down after a take-off). */
export function looseFeatherGeometry(plumage = PLUMAGES[0]) {
  const b = new PartBuilder();
  const c = col(plumage.wing), d = col(plumage.back);
  addFeather(b, new THREE.Vector3(0, 0, -.022), new THREE.Vector3(0, 0, 1), new THREE.Vector3(1, 0, 0), .044, .018, { lift: .003 },
    (t, cc, out) => out.copy(d).lerp(c, t).multiplyScalar(1 - Math.abs(cc) * .08));
  return b.build();
}
