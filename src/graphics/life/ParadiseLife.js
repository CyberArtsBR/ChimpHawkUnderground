import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { seededRandom } from '../MapScan.js';
import { keepClearOfRider } from './lifeAnchors.js';

/**
 * World Life, Skate Paradise pack (2026-11). Presentation only: nothing here is
 * solid, collides, or writes back to the skater.
 *  - Gulls (max 5) perch on flag-pole and string-light pole tops, take off when
 *    the rider comes within 9 m (or grinds / lands within 14 m), circle 12-20 m
 *    up for 8-20 s and glide back to a free perch.
 *  - Fireflies and moths (max 60 pooled points) drift around the string-light
 *    spans and pole tops; a fast rider parts them and they drift back.
 *  - Cans and cones (max 8) by the wall edges tumble away from a passing rider
 *    with a scripted slide and spin, rest, and go home after 25 s unseen.
 * Anchors and scan arrive asynchronously from MapDressing: everything is placed
 * lazily in update() and re-placed after reset().
 */
const TAU = Math.PI * 2;
const RIDER_CLEAR = 1.2;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const rand = (a, b) => a + Math.random() * (b - a);
const wrapAngle = a => Math.atan2(Math.sin(a), Math.cos(a));

const GULL_MAX = 5, GULL_NEAR = 9, GULL_EVENT = 14, GULL_LAND_CLEAR = 12, CHIRP_GAP = 3;
const FIREFLY_MAX = 44, MOTH_MAX = 16, SCATTER_RADIUS = 3, SCATTER_SPEED = 4;
const PROP_MAX = 8, PROP_SPAWN_CLEAR = 2.5, PROP_GAP = 3, PROP_HOME_AFTER = 25, PROP_SOUND_GAP = 2;
const TUMBLE_SPEED = 3, TUMBLE_LATERAL = 1, SEEN_DISTANCE = 70, WALL_REACH = .7;
const CAN_COLORS = ['#8e3d36', '#3e5f78', '#a8985a'];

// ------------------------------------------------------------- geometry kit
/** Non-indexed copy of `geometry` with a per-vertex colour from `paint(v, color)`. */
function painted(geometry, color, paint = null) {
  const g = geometry.index ? geometry.toNonIndexed() : geometry;
  if (g !== geometry) geometry.dispose();
  if (g.attributes.uv) g.deleteAttribute('uv');
  if (!g.attributes.normal) g.computeVertexNormals();
  const pos = g.attributes.position, colors = new Float32Array(pos.count * 3);
  const v = new THREE.Vector3(), c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    c.set(color);
    paint?.(v, c);
    colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return g;
}
function merged(parts) {
  const g = mergeGeometries(parts, false);
  parts.forEach(p => p.dispose());
  g.computeBoundingSphere();
  return g;
}

/**
 * A wing segment spanning +x: two sheets (upper faces up, under faces down),
 * leading edge at z = lead, swept back by `sweep` at the tip.
 * paint(s along span, c across chord 0 lead → 1 trail, upper, color).
 */
function wingGeometry(span, rootChord, tipChord, sweep, lead, paint) {
  const segs = 8, chords = 3, pos = [], col = [], c = new THREE.Color();
  const point = (s, k, y) => {
    const leading = lead - sweep * s, chord = lerp(rootChord, tipChord, s);
    return [span * s, y + .006 * Math.sin(Math.PI * k) * (1 - s * .5), leading - chord * k];
  };
  for (const upper of [true, false]) {
    const y = upper ? .002 : -.002;
    for (let i = 0; i < segs; i++) for (let j = 0; j < chords; j++) {
      const s0 = i / segs, s1 = (i + 1) / segs, k0 = j / chords, k1 = (j + 1) / chords;
      const quad = [[s0, k0], [s1, k0], [s1, k1], [s0, k1]];
      const tris = upper ? [0, 2, 1, 0, 3, 2] : [0, 1, 2, 0, 2, 3];
      for (const t of tris) {
        const [s, k] = quad[t];
        pos.push(...point(s, k, y));
        paint(s, k, upper, c);
        col.push(c.r, c.g, c.b);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

/**
 * Both wings folded: a grey shell over each upper flank (white tertial edge
 * along the back) and the black, white-tipped primaries crossing over the tail.
 */
function foldedWings(profile, grey, white, black) {
  const radius = z => { // body lathe radius at z (profile is [r, z], scaled .92 in x)
    for (let i = 1; i < profile.length; i++) {
      const a = profile[i - 1], b = profile[i];
      if (z <= b.y) return lerp(a.x, b.x, clamp((z - a.y) / (b.y - a.y), 0, 1));
    }
    return 0;
  };
  const pos = [], col = [], c = new THREE.Color();
  const quad = (pts, colors) => {
    for (const k of [0, 1, 2, 0, 2, 3]) { pos.push(...pts[k]); c.set(colors[k]); col.push(c.r, c.g, c.b); }
  };
  for (const s of [1, -1]) {
    const rows = 7, cols = 4, shell = [];
    for (let i = 0; i <= rows; i++) {
      const z = lerp(.1, -.2, i / rows), row = [];
      for (let j = 0; j <= cols; j++) {
        const theta = lerp(-.25, 1.3, j / cols), r = radius(z) + .006;
        row.push([s * r * Math.cos(theta) * .95, r * Math.sin(theta), z]);
      }
      shell.push(row);
    }
    const shade = (i, j) => (j === cols ? white : grey);
    for (let i = 0; i < rows; i++) for (let j = 0; j < cols; j++) {
      const q = [shell[i][j], shell[i + 1][j], shell[i + 1][j + 1], shell[i][j + 1]];
      const k = [shade(i, j), shade(i + 1, j), shade(i + 1, j + 1), shade(i, j + 1)];
      if (s > 0) quad(q, k); else quad([q[0], q[3], q[2], q[1]], [k[0], k[3], k[2], k[1]]);
    }
    // Primaries: from the rear of the shell to a point crossing over the tail.
    const segs = 6;
    for (let i = 0; i < segs; i++) {
      const pts = [], cs = [];
      for (const t of [i / segs, (i + 1) / segs]) {
        const z = lerp(-.17, -.42, t), x = s * lerp(.058, -.012, t), y = lerp(.05, .036, t) + s * .002, w = lerp(.034, .01, t);
        pts.push([x + s * w, y - .012, z], [x - s * w, y + .012, z]);
        const tone = t < .25 ? grey : t > .9 ? white : black;
        cs.push(tone, tone);
      }
      const q = [pts[0], pts[2], pts[3], pts[1]], k = [cs[0], cs[2], cs[3], cs[1]];
      quad(q, k); // two-sided: one face each way
      quad([q[0], q[3], q[2], q[1]].map(p => [p[0], p[1] - .002, p[2]]), [k[0], k[3], k[2], k[1]]);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

let GULL_GEOMETRY = null;
/** Herring-gull parts (metres, +z forward, body centre at the origin). Shared by every gull. */
function gullGeometry() {
  if (GULL_GEOMETRY) return GULL_GEOMETRY;
  const white = '#f1f1ee', grey = '#9ba7b5', black = '#18191c', yellow = '#efc232', red = '#d2462c', leg = '#deab8e';
  const profile = [[0, -.25], [.03, -.22], [.058, -.15], [.078, -.06], [.085, .02], [.079, .09], [.06, .15], [.033, .19], [0, .205]]
    .map(([r, y]) => new THREE.Vector2(r, y));
  const body = painted(new THREE.LatheGeometry(profile, 14).rotateX(Math.PI / 2).scale(.92, 1, 1), white,
    (v, c) => { if (v.y > .05 && v.z < .1 && v.z > -.2) c.set(grey); });
  const tail = painted(new THREE.BoxGeometry(.12, .014, .13).translate(0, .012, -.29), white);
  const head = painted(new THREE.SphereGeometry(.05, 12, 9).scale(.9, .95, 1.12), white);
  const beak = painted(new THREE.ConeGeometry(.012, .07, 8).rotateX(Math.PI / 2).translate(0, -.01, .085), yellow,
    (v, c) => { if (v.z > .085 && v.z < .105 && v.y < -.012) c.set(red); });
  const eyes = [-1, 1].map(s => painted(new THREE.SphereGeometry(.0075, 6, 5).translate(s * .034, .012, .028), '#141414'));
  const legs = [-1, 1].flatMap(s => [
    painted(new THREE.CylinderGeometry(.006, .005, .13, 5).translate(s * .03, .065, .01), leg),
    painted(new THREE.BoxGeometry(.036, .006, .05).translate(s * .03, .003, .025), leg),
  ]);
  GULL_GEOMETRY = {
    folded: foldedWings(profile, grey, white, black),
    body: merged([body, tail]),
    head: merged([head, beak, ...eyes]),
    legs: merged(legs),
    inner: wingGeometry(.32, .17, .14, .02, .03, (s, k, upper, c) => c.set(upper ? (k > .8 ? white : grey) : white)),
    outer: wingGeometry(.4, .14, .04, .12, .01, (s, k, upper, c) => {
      c.set(upper ? grey : white);
      if (s > (upper ? .6 : .68)) c.set(black);
      if (s > .9 && k > .2 && k < .7) c.set(white); // the "mirror" spot at the tip
    }),
  };
  return GULL_GEOMETRY;
}

/** Traffic cone (origin at the base): orange body, white reflective band, dark base plate. */
function coneGeometry() {
  const orange = '#f0611c';
  const plate = painted(new THREE.BoxGeometry(.32, .03, .32).translate(0, .015, 0), '#3a2a24');
  const body = painted(new THREE.CylinderGeometry(.022, .13, .44, 12, 6, true).translate(0, .25, 0), orange,
    (v, c) => { if (v.y > .25 && v.y < .33) c.set('#f4f2ec'); });
  const tip = painted(new THREE.CircleGeometry(.022, 10).rotateX(-Math.PI / 2).translate(0, .47, 0), orange);
  return merged([plate, body, tip]);
}
/** Drink can (origin at the base): body tinted per instance, pale rims. */
function canGeometry() {
  const body = painted(new THREE.CylinderGeometry(.034, .034, .124, 12).translate(0, .062, 0), '#ffffff',
    (v, c) => { if (v.y > .116 || v.y < .008) c.set('#cfd2d6'); });
  return merged([body]);
}
/** Soft radial dot for the glow points. */
function glowTexture() {
  const size = 32, data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const dx = (x + .5) / size * 2 - 1, dy = (y + .5) / size * 2 - 1;
    const r2 = dx * dx + dy * dy, k = Math.round(255 * Math.exp(-r2 * 5) * (r2 < 1 ? 1 : 0));
    data.set([k, k, k, k], (y * size + x) * 4);
  }
  const texture = new THREE.DataTexture(data, size, size);
  texture.magFilter = texture.minFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

// ---------------------------------------------------------------- the gull
const GLIDE = { sweep: .04, raise: .1, twist: 0, wristSweep: .32, wristRaise: -.12, innerSpan: 1, outerSpan: 1 };
const POSE_KEYS = Object.keys(GLIDE);
const BODY_Y = .2;

function bezier(out, a, b, c, d, u) {
  const v = 1 - u, k0 = v * v * v, k1 = 3 * v * v * u, k2 = 3 * v * u * u, k3 = u * u * u;
  return out.set(a.x * k0 + b.x * k1 + c.x * k2 + d.x * k3, a.y * k0 + b.y * k1 + c.y * k2 + d.y * k3, a.z * k0 + b.z * k1 + c.z * k2 + d.z * k3);
}
function bezierTangent(out, a, b, c, d, u) {
  const v = 1 - u, k0 = -3 * v * v, k1 = 3 * v * v - 6 * u * v, k2 = 6 * u * v - 3 * u * u, k3 = 3 * u * u;
  return out.set(a.x * k0 + b.x * k1 + c.x * k2 + d.x * k3, a.y * k0 + b.y * k1 + c.y * k2 + d.y * k3, a.z * k0 + b.z * k1 + c.z * k2 + d.z * k3);
}

class Gull {
  constructor(material) {
    const geo = gullGeometry();
    this.root = new THREE.Group();
    this.root.name = 'Gull';
    this.body = new THREE.Group();
    this.body.position.y = BODY_Y;
    this.root.add(this.body);
    this.body.add(new THREE.Mesh(geo.body, material));
    this.head = new THREE.Group();
    this.head.position.set(0, .09, .17);
    this.head.add(new THREE.Mesh(geo.head, material));
    this.body.add(this.head);
    this.wings = [1, -1].map(side => {
      const mirror = new THREE.Group();
      mirror.scale.x = side;
      const shoulder = new THREE.Group();
      shoulder.position.set(.052, .05, .07);
      shoulder.rotation.order = 'YZX';
      const inner = new THREE.Mesh(geo.inner, material);
      const wrist = new THREE.Group();
      wrist.rotation.order = 'YZX';
      const outer = new THREE.Mesh(geo.outer, material);
      wrist.add(outer);
      shoulder.add(inner, wrist);
      mirror.add(shoulder);
      this.body.add(mirror);
      return { mirror, shoulder, inner, wrist, outer };
    });
    // Perched, the open-wing rig is swapped for wings folded along the flanks.
    this.folded = new THREE.Mesh(geo.folded, material);
    this.body.add(this.folded);
    this.legs = new THREE.Mesh(geo.legs, material);
    this.root.add(this.legs);
    this.root.traverse(o => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; } });
    this.root.visible = false;

    this.state = 'hidden'; // hidden | perch | alert | fly | return
    this.perch = null; this.target = null;
    this.velocity = new THREE.Vector3();
    this.center = new THREE.Vector3();
    this.from = new THREE.Vector3();
    this.p0 = new THREE.Vector3(); this.c1 = new THREE.Vector3(); this.c2 = new THREE.Vector3(); this.p3 = new THREE.Vector3();
    this.tangent = new THREE.Vector3();
    this.timer = 0; this.flyTime = 0; this.pathLength = 4; this.radius = 9; this.altitude = 15; this.dir = 1; this.cruise = 7;
    this.yaw = 0; this.targetYaw = 0; this.bank = 0; this.flap = 0; this.flapWeight = 0;
    this.look = 0; this.lookTarget = 0; this.lookTimer = 0; this.shuffleTimer = 3; this.phase = Math.random() * 10;
    this.pose = { ...GLIDE };
    this.flapPose = { ...GLIDE };
    this.applyWings(GLIDE);
    this.setFolded(true);
  }

  setFolded(folded) {
    if (this.folded.visible === folded && this.wings[0].mirror.visible === !folded) return;
    this.folded.visible = folded;
    for (const wing of this.wings) wing.mirror.visible = !folded;
  }

  hide() {
    if (this.perch?.occupant === this) this.perch.occupant = null;
    if (this.target?.occupant === this) this.target.occupant = null;
    this.perch = this.target = null;
    this.state = 'hidden';
    this.root.visible = false;
  }

  sit(perch) {
    if (this.target?.occupant === this && this.target !== perch) this.target.occupant = null;
    this.perch = perch; this.target = null;
    perch.occupant = this;
    this.root.position.copy(perch.position);
    this.yaw = this.targetYaw = rand(0, TAU);
    this.root.rotation.set(0, this.yaw, 0, 'YXZ');
    this.root.visible = true;
    this.state = 'perch';
    this.legs.visible = true;
    this.body.rotation.set(-.08, 0, 0);
    this.body.position.y = BODY_Y;
    this.setFolded(true);
    this.bank = 0; this.flapWeight = 0;
    this.lookTimer = rand(.3, 1.2);
  }

  applyWings(pose) {
    for (const wing of this.wings) {
      wing.shoulder.rotation.set(pose.twist, pose.sweep, pose.raise);
      wing.inner.scale.x = pose.innerSpan;
      wing.wrist.position.set(.32 * pose.innerSpan, 0, -.02);
      wing.wrist.rotation.set(0, pose.wristSweep, pose.wristRaise);
      wing.outer.scale.x = pose.outerSpan;
    }
  }

  /** Perched: head turns, a shuffle round now and then, breathing. */
  animatePerch(dt, motion) {
    this.phase += dt;
    this.lookTimer -= dt;
    if (this.lookTimer <= 0) { this.lookTarget = rand(-1.1, 1.1) * motion; this.lookTimer = rand(.6, 2.4); }
    this.look += (this.lookTarget - this.look) * Math.min(1, dt * 9 * motion);
    this.head.rotation.set(0, this.look, 0);
    this.shuffleTimer -= dt;
    if (this.shuffleTimer <= 0) { this.targetYaw = this.yaw + rand(-.9, .9) * motion; this.shuffleTimer = rand(3, 7); }
    this.yaw += wrapAngle(this.targetYaw - this.yaw) * Math.min(1, dt * 3 * motion);
    this.root.rotation.set(0, this.yaw, 0, 'YXZ');
    this.body.scale.setScalar(1 + Math.sin(this.phase * 2.6) * .01);
  }

  /**
   * Wingbeats tied to the climb (flap when climbing or flaring, glide when
   * level or sinking), banking into turns, the landing flare at the end.
   */
  animateFlight(dt, hs, vy, turnRate, boost, flare) {
    this.setFolded(false);
    const climb = smooth(.35, 1.6, vy);
    const want = Math.max(climb, boost, flare);
    this.flapWeight += ((want > .15 ? 1 : 0) - this.flapWeight) * Math.min(1, dt * 4);
    const freq = lerp(2.4, 4.4, Math.max(climb, flare, boost));
    if (this.flapWeight > .02) this.flap += dt * freq * TAU;
    const amp = lerp(.55, .9, Math.max(climb, boost)) * (1 - .4 * flare);
    const sn = Math.sin(this.flap), cs = Math.cos(this.flap), fp = this.flapPose;
    fp.sweep = .04 + .14 * Math.max(0, cs); fp.raise = .12 + amp * sn; fp.twist = -.22 * cs;
    fp.wristSweep = .22; fp.wristRaise = amp * .5 * Math.sin(this.flap - .8); fp.innerSpan = 1; fp.outerSpan = 1;
    const fw = this.flapWeight;
    for (const key of POSE_KEYS) this.pose[key] = lerp(GLIDE[key], fp[key], fw);
    if (flare > 0) { // wings forward and up, cupped against the air
      this.pose.sweep = lerp(this.pose.sweep, -.3, flare);
      this.pose.raise += .25 * flare;
      this.pose.wristSweep = lerp(this.pose.wristSweep, .05, flare);
    }
    this.applyWings(this.pose);
    let pitch = clamp(-Math.atan2(vy, Math.max(.5, hs)) * .6, -.55, .35);
    pitch = lerp(pitch, -.7, flare);
    this.bank += (clamp(-turnRate * hs * .12, -.7, .7) * (1 - flare) - this.bank) * Math.min(1, dt * 3);
    this.root.rotation.set(pitch, this.yaw, this.bank, 'YXZ');
    this.body.rotation.set(0, 0, 0);
    this.body.position.y = BODY_Y + sn * .012 * fw;
    this.body.scale.setScalar(1);
    this.legs.visible = flare > .3;
    this.look *= .9;
    this.head.rotation.set(-pitch * .5, this.look, 0);
  }
}

// ---------------------------------------------------------- glow swarms
class Swarm {
  constructor(name, max, material) {
    this.max = max;
    this.count = 0;
    this.positions = new Float32Array(max * 3);
    this.colors = new Float32Array(max * 3);
    this.home = new Float32Array(max * 3);
    this.offset = new Float32Array(max * 3);
    this.tint = new Float32Array(max * 3);
    this.phase = new Float32Array(max * 4);
    const geometry = new THREE.BufferGeometry();
    this.positionAttr = new THREE.BufferAttribute(this.positions, 3).setUsage(THREE.DynamicDrawUsage);
    this.colorAttr = new THREE.BufferAttribute(this.colors, 3).setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute('position', this.positionAttr);
    geometry.setAttribute('color', this.colorAttr);
    geometry.setDrawRange(0, 0);
    this.points = new THREE.Points(geometry, material);
    this.points.name = name;
    this.points.frustumCulled = false;
  }

  clear() { this.count = 0; this.offset.fill(0); this.points.geometry.setDrawRange(0, 0); }

  add(x, y, z, color) {
    if (this.count >= this.max) return;
    const i = this.count++, j = i * 3;
    this.home[j] = this.positions[j] = x; this.home[j + 1] = this.positions[j + 1] = y; this.home[j + 2] = this.positions[j + 2] = z;
    this.offset[j] = this.offset[j + 1] = this.offset[j + 2] = 0;
    this.tint[j] = color.r; this.tint[j + 1] = color.g; this.tint[j + 2] = color.b;
    for (let k = 0; k < 4; k++) this.phase[i * 4 + k] = Math.random();
    this.points.geometry.setDrawRange(0, this.count);
  }

  offsetLength(i) { const j = i * 3; return Math.hypot(this.offset[j], this.offset[j + 1], this.offset[j + 2]); }
}

// ------------------------------------------------------------- the module
export class ParadiseLife {
  /** Owner (2026-11-09): cones off by default; cans stay. */
  constructor({ cones = false } = {}) {
    this.features = { cones };
    this.parks = ['skate-paradise'];
    this.root = new THREE.Group();
    this.root.name = 'World life: paradise';
    this.density = 1;
    this.time = 0;
    this.ctx = null;
    this.reactions = null;
    this.unsubscribe = [];
    this.spawn = new THREE.Vector3(Infinity, 0, Infinity);
    this.worldId = '';
    this.lastChirp = -Infinity;
    this.riderCenter = new THREE.Vector3();
    this.riderFeet = new THREE.Vector3();
    this.scratch = new THREE.Vector3();
    this.anchorsRef = null; this.anchorsCount = 0; this.scanRef = null;

    // One material per visual kind, all created now so shader warm-up compiles them.
    this.gullMaterial = new THREE.MeshStandardMaterial({ name: 'World life / gull', vertexColors: true, roughness: .78, metalness: 0 });
    this.propMaterial = new THREE.MeshStandardMaterial({ name: 'World life / cans and cones', vertexColors: true, roughness: .55, metalness: .1 });
    this.glow = glowTexture();
    const glowMaterial = (name, size) => new THREE.PointsMaterial({
      name, size, sizeAttenuation: true, map: this.glow, vertexColors: true, transparent: true,
      depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, fog: false,
    });
    this.fireflyMaterial = glowMaterial('World life / fireflies', .34);
    this.mothMaterial = glowMaterial('World life / moths', .16);

    this.gulls = Array.from({ length: GULL_MAX }, () => new Gull(this.gullMaterial));
    this.gulls.forEach(g => this.root.add(g.root));
    this.perches = [];

    this.fireflies = new Swarm('World life fireflies', FIREFLY_MAX, this.fireflyMaterial);
    this.moths = new Swarm('World life moths', MOTH_MAX, this.mothMaterial);
    this.root.add(this.fireflies.points, this.moths.points);

    this.props = [];
    this.meshes = {
      can: new THREE.InstancedMesh(canGeometry(), this.propMaterial, PROP_MAX),
      cone: new THREE.InstancedMesh(coneGeometry(), this.propMaterial, PROP_MAX),
    };
    const white = new THREE.Color(1, 1, 1);
    for (const [kind, mesh] of Object.entries(this.meshes)) {
      mesh.name = `World life ${kind}s`;
      mesh.castShadow = true; mesh.receiveShadow = true;
      mesh.frustumCulled = false;
      for (let i = 0; i < PROP_MAX; i++) mesh.setColorAt(i, white); // both share one program
      mesh.count = 0;
      this.root.add(mesh);
    }
    this.frustum = new THREE.Frustum();
    this.projScreen = new THREE.Matrix4();
    this.frustumTime = -1;
    this.camera = null;
    this.matrix = new THREE.Matrix4();
    this.quat = new THREE.Quaternion();
    this.quatB = new THREE.Quaternion();
    this.euler = new THREE.Euler();
    this.one = new THREE.Vector3(1, 1, 1);
    this.color = new THREE.Color();
  }

  get motion() { return this.ctx?.reducedMotion ? .5 : 1; }

  setWorld(world, ctx) {
    this.ctx = ctx;
    this.worldId = world?.id || '';
    const spawn = world?.manifest?.spawn;
    if (Array.isArray(spawn)) this.spawn.set(spawn[0], spawn[1], spawn[2]); else this.spawn.set(Infinity, 0, Infinity);
    this.clearAgents();
    if (ctx?.reactions && ctx.reactions !== this.reactions) {
      this.unsubscribe.forEach(off => off());
      this.reactions = ctx.reactions;
      this.unsubscribe = [
        this.reactions.on('grindStart', e => this.onReaction(e.point)),
        this.reactions.on('landing', e => this.onReaction(e.point)),
      ];
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

  /** A grind or landing within 14 m sends perched gulls up (staggered). */
  onReaction(point) {
    if (this.density <= 0 || !this.root.parent) return;
    for (let i = 0; i < this.gulls.length; i++) {
      const g = this.gulls[i];
      if (g.state !== 'perch') continue;
      const p = g.root.position;
      if (Math.hypot(p.x - point.x, p.z - point.z) < GULL_EVENT) this.alert(g, point, rand(0, .35) / this.motion);
    }
  }

  // -------------------------------------------------------------- placement
  clearAgents() {
    for (const g of this.gulls) g.hide();
    this.perches.length = 0;
    this.fireflies.clear();
    this.moths.clear();
    this.props.length = 0;
    this.meshes.can.count = 0;
    this.meshes.cone.count = 0;
    this.anchorsRef = null; this.anchorsCount = 0; this.scanRef = null;
  }

  placeAnchored(anchors) {
    for (const g of this.gulls) g.hide();
    this.perches.length = 0;
    this.fireflies.clear();
    this.moths.clear();
    const tops = [...(anchors.poles || []), ...(anchors.strings || []), ...(anchors.lamps || [])];
    for (const a of tops) if (a?.position?.isVector3) this.perches.push({ position: a.position.clone(), ground: a.position.y - (Number(a.height) || 0), occupant: null });
    // Gulls: distinct random perches, away from the rider (one that is too close starts aloft).
    const count = Math.min(Math.round(GULL_MAX * this.density), this.perches.length);
    const order = this.perches.slice().sort(() => Math.random() - .5);
    for (let i = 0; i < count; i++) {
      const g = this.gulls[i];
      const free = order.find(p => !p.occupant && this.horizontalToRider(p.position) > GULL_NEAR + 1);
      if (free) g.sit(free);
      else this.launchAloft(g, order[i]);
    }
    // Glow sites: string spans (consecutive string pole tops) and pole tops.
    const spans = [];
    const strings = anchors.strings || [];
    for (let i = 0; i + 1 < strings.length; i += 2) {
      const a = strings[i], b = strings[i + 1];
      const d = a.position.distanceTo(b.position);
      if (d > 3 && d < 25) spans.push({ a: a.position, b: b.position, ga: a.position.y - a.height, gb: b.position.y - b.height, sag: .6 + d * .05 });
    }
    const poles = [...(anchors.poles || [])];
    const lamps = anchors.lamps || [];
    const color = this.color;
    const fireflyCount = Math.round(FIREFLY_MAX * this.density), mothCount = Math.round(MOTH_MAX * this.density);
    const sites = spans.length + poles.length;
    if (sites > 0) for (let i = 0; i < fireflyCount; i++) {
      const k = i % (spans.length * 2 + poles.length);
      color.set('#c6f25a').lerp(this.scratchColor('#ffb43c'), Math.random() * .7);
      if (k < spans.length * 2) {
        const s = spans[k % spans.length], t = Math.random();
        const sx = -(s.b.z - s.a.z), sz = s.b.x - s.a.x, sl = Math.hypot(sx, sz) || 1, side = rand(-1.6, 1.6);
        this.fireflies.add(lerp(s.a.x, s.b.x, t) + sx / sl * side, lerp(s.ga, s.gb, t) + rand(.7, 3), lerp(s.a.z, s.b.z, t) + sz / sl * side, color);
      } else {
        const p = poles[k - spans.length * 2], angle = rand(0, TAU), r = rand(.6, 2.2);
        this.fireflies.add(p.position.x + Math.cos(angle) * r, p.position.y - p.height + rand(.8, 2.8), p.position.z + Math.sin(angle) * r, color);
      }
    }
    const lights = spans.length + lamps.length;
    for (let i = 0; i < mothCount && (lights > 0 || poles.length > 0); i++) {
      color.set('#fff0d2');
      if (lights > 0) {
        const k = i % lights;
        if (k < spans.length) {
          const s = spans[k], t = rand(.1, .9);
          this.moths.add(lerp(s.a.x, s.b.x, t) + rand(-.3, .3), lerp(s.a.y, s.b.y, t) - .1 - Math.sin(Math.PI * t) * s.sag - rand(.05, .35), lerp(s.a.z, s.b.z, t) + rand(-.3, .3), color);
        } else {
          const l = lamps[k - spans.length];
          this.moths.add(l.position.x + rand(-.5, .5), l.position.y - l.height - rand(.2, .6), l.position.z + rand(-.5, .5), color);
        }
      } else {
        const p = poles[i % poles.length];
        this.moths.add(p.position.x + rand(-.4, .4), p.position.y + rand(-.4, .3), p.position.z + rand(-.4, .4), color);
      }
    }
  }

  scratchColor(hex) { return (this._c2 ||= new THREE.Color()).set(hex); }

  /** Cans and cones on flat wall-edge spots: deterministic per park. */
  placeProps(scan, surface) {
    this.props.length = 0;
    const random = seededRandom(`paradise-life-${this.worldId}`);
    const edges = scan.edges;
    const order = edges.map((_, i) => i);
    for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
    const cap = Math.round(PROP_MAX * this.density);
    const counts = { can: 0, cone: 0 };
    let picked = 0;
    for (const index of order) {
      if (this.props.length >= cap) break;
      const yaw = random() * TAU;
      const point = edges[index]?.point, facing = edges[index]?.facing;
      if (!point) continue;
      if (Math.hypot(point.x - this.spawn.x, point.z - this.spawn.z) < PROP_SPAWN_CLEAR) continue;
      if (this.props.some(p => Math.hypot(p.home.x - point.x, p.home.z - point.z) < PROP_GAP)) continue;
      const hit = surface.ground(point, .3, .5);
      if (!hit || hit.normal.y <= .95 || Math.abs(hit.point.y - point.y) > .15) continue;
      const kind = this.features.cones && picked % 3 === 1 ? 'cone' : 'can';
      picked++;
      if (this.horizontalToRider(hit.point) < RIDER_CLEAR + .25) continue; // never appear at the rider
      const prop = {
        kind, index: counts[kind]++, home: hit.point.clone(), homeYaw: yaw, position: hit.point.clone(), yaw,
        facing: facing?.isVector3 ? facing.clone().setY(0).normalize() : null, // away from the wall it hugs
        velocity: new THREE.Vector3(), state: 'rest', armed: true, displaced: false, tilt: 0, tiltTime: 0,
        roll: 0, spin: 0, decel: kind === 'can' ? 2.4 : 4,
        // Lying angle: a can on its side; a cone on its base rim with the tip on the ground.
        restTilt: kind === 'can' ? Math.PI / 2 : 1.9,
        restTime: 0, lastSound: -Infinity, tumbles: 0,
      };
      if (kind === 'can') this.meshes.can.setColorAt(prop.index, this.color.set(CAN_COLORS[prop.index % CAN_COLORS.length]));
      this.props.push(prop);
      this.writeProp(prop);
    }
    this.meshes.can.count = counts.can;
    this.meshes.cone.count = counts.cone;
    if (this.meshes.can.instanceColor) this.meshes.can.instanceColor.needsUpdate = true;
  }

  writeProp(prop) {
    const mesh = this.meshes[prop.kind];
    // Heading, then tip over about the local x axis, then roll about its own axis.
    this.quat.setFromEuler(this.euler.set(0, prop.yaw, 0, 'YXZ'));
    this.quatB.setFromEuler(this.euler.set(prop.tilt, 0, 0));
    this.quat.multiply(this.quatB);
    this.quatB.setFromEuler(this.euler.set(0, prop.roll, 0));
    this.quat.multiply(this.quatB);
    // Lift so the lowest point (base rim, top rim or tip) rests on the ground.
    const sin = Math.abs(Math.sin(prop.tilt)), cos = Math.cos(prop.tilt);
    const lift = prop.kind === 'can' ? .034 * sin - Math.min(0, .124 * cos) : Math.max(0, .16 * sin, -.47 * cos);
    this.scratch.copy(prop.position).setY(prop.position.y + lift);
    mesh.setMatrixAt(prop.index, this.matrix.compose(this.scratch, this.quat, this.one));
    mesh.instanceMatrix.needsUpdate = true;
  }

  horizontalToRider(point) { return Math.hypot(point.x - this.riderFeet.x, point.z - this.riderFeet.z); }

  // ----------------------------------------------------------------- update
  update(dt, skater, camera, ctx) {
    if (this.density <= 0 || !skater) return;
    this.ctx = ctx;
    this.camera = camera;
    this.time += dt;
    this.riderFeet.copy(skater.position);
    this.riderCenter.copy(skater.position).setY(skater.position.y + .9);
    const anchors = ctx.anchors;
    const anchorCount = (anchors?.poles?.length || 0) + (anchors?.strings?.length || 0) + (anchors?.lamps?.length || 0);
    if (anchors !== this.anchorsRef || anchorCount !== this.anchorsCount) {
      this.anchorsRef = anchors; this.anchorsCount = anchorCount;
      this.placeAnchored(anchors || {});
    }
    if (ctx.scan !== this.scanRef && ctx.scan?.edges?.length && ctx.surface?.ground) {
      this.scanRef = ctx.scan;
      this.placeProps(ctx.scan, ctx.surface);
    }
    const vx = skater.velocity?.x || 0, vz = skater.velocity?.z || 0;
    const speed = Math.hypot(vx, vz);
    for (let i = 0; i < this.gulls.length; i++) this.updateGull(this.gulls[i], dt);
    this.updateSwarm(this.fireflies, dt, speed, false);
    this.updateSwarm(this.moths, dt, speed, true);
    for (let i = 0; i < this.props.length; i++) this.updateProp(this.props[i], dt, vx, vz, speed, ctx.surface);
  }

  // ------------------------------------------------------------------ gulls
  alert(g, from, delay) {
    if (g.state !== 'perch') return;
    g.state = 'alert';
    g.timer = delay;
    g.from.copy(from);
  }

  takeOff(g) {
    const motion = this.motion, p = g.root.position;
    let ax = p.x - g.from.x, az = p.z - g.from.z;
    const al = Math.hypot(ax, az);
    if (al < 1e-3) { const a = rand(0, TAU); ax = Math.cos(a); az = Math.sin(a); } else { ax /= al; az /= al; }
    const ground = g.perch ? g.perch.ground : p.y - 3.5;
    if (g.perch?.occupant === g) g.perch.occupant = null;
    g.perch = null;
    g.velocity.set(ax * 3 * motion, 3.2 * motion, az * 3 * motion);
    g.yaw = Math.atan2(ax, az);
    this.circleParams(g, ground, ax, az);
    g.state = 'fly'; g.flyTime = 0; g.flap = -Math.PI / 2; g.flapWeight = 1;
    g.timer = rand(8, 20);
    if (this.time - this.lastChirp >= CHIRP_GAP) {
      this.lastChirp = this.time;
      this.ctx?.audio?.play?.('chirp', p, { gain: .6, rate: .55 });
    }
  }

  circleParams(g, ground, ax, az) {
    const p = g.root.position, reach = rand(6, 12);
    g.center.set(p.x + ax * reach, 0, p.z + az * reach);
    g.radius = rand(7, 12);
    g.altitude = ground + rand(12, 20);
    g.dir = Math.random() < .5 ? -1 : 1;
    g.cruise = rand(6.5, 8) * (this.motion < 1 ? .7 : 1);
  }

  /** A gull that cannot perch near the rider starts circling high above its pole. */
  launchAloft(g, perch) {
    if (!perch) return;
    g.root.visible = true; g.legs.visible = false;
    g.root.position.set(perch.position.x + rand(-4, 4), perch.ground + rand(12, 20), perch.position.z + rand(-4, 4));
    this.circleParams(g, perch.ground, rand(-1, 1), rand(-1, 1));
    g.velocity.set(rand(-1, 1), 0, rand(-1, 1)).setLength(g.cruise);
    g.yaw = Math.atan2(g.velocity.x, g.velocity.z);
    g.state = 'fly'; g.flyTime = 2; g.flapWeight = 0; g.timer = rand(4, 10);
  }

  chooseLanding(g) {
    let best = null, bestD = Infinity;
    for (const perch of this.perches) {
      if (perch.occupant || this.horizontalToRider(perch.position) < GULL_LAND_CLEAR) continue;
      const d = perch.position.distanceToSquared(g.root.position) * rand(.6, 1.4);
      if (d < bestD) { best = perch; bestD = d; }
    }
    return best;
  }

  updateGull(g, dt) {
    if (g.state === 'hidden') return;
    const motion = this.motion;
    if (g.state === 'perch') {
      if (this.horizontalToRider(g.root.position) < GULL_NEAR) this.alert(g, this.riderFeet, rand(0, .15) / motion);
      else { g.animatePerch(dt, motion); return; }
    }
    if (g.state === 'alert') {
      g.timer -= dt;
      g.animatePerch(dt, motion);
      g.head.rotation.x = -.25 * motion; // head up, watching
      if (g.timer <= 0) this.takeOff(g); else return;
    }
    if (g.state === 'fly') this.flyCircle(g, dt);
    else if (g.state === 'return') this.flyHome(g, dt);
    // Never inside the rider's space.
    keepClearOfRider(g.root.position, this.riderCenter, RIDER_CLEAR);
    keepClearOfRider(g.root.position, this.riderFeet, RIDER_CLEAR);
  }

  flyCircle(g, dt) {
    g.flyTime += dt; g.timer -= dt;
    const p = g.root.position, v = g.velocity;
    const rx = p.x - g.center.x, rz = p.z - g.center.z, d = Math.hypot(rx, rz) || 1e-3;
    const radial = clamp((d - g.radius) / g.radius, -1, 1) * 1.2;
    const dx = -rz / d * g.dir - rx / d * radial, dz = rx / d * g.dir - rz / d * radial;
    let hs = Math.hypot(v.x, v.z);
    const heading = hs > .05 ? Math.atan2(v.x, v.z) : g.yaw;
    const turn = g.flyTime > .7 ? clamp(wrapAngle(Math.atan2(dx, dz) - heading), -1.1 * dt, 1.1 * dt) : 0;
    const next = heading + turn;
    hs += (g.cruise - hs) * Math.min(1, dt * .8);
    v.x = Math.sin(next) * hs; v.z = Math.cos(next) * hs;
    const climbOut = g.flyTime < 1.2 ? 3.2 * this.motion : 0;
    const vyTarget = Math.max(climbOut, clamp((g.altitude - p.y) * .45, -1.6, 2.6));
    v.y += (vyTarget - v.y) * Math.min(1, dt * 1.8);
    p.addScaledVector(v, dt);
    g.yaw = next;
    g.animateFlight(dt, hs, v.y, dt > 0 ? turn / dt : 0, smooth(1.2, 0, g.flyTime), 0);
    if (g.timer <= 0) {
      const perch = this.chooseLanding(g);
      if (!perch) { g.timer = rand(3, 6); return; }
      perch.occupant = g;
      g.target = perch;
      g.p0.copy(p);
      g.p3.copy(perch.position);
      const dist = g.p0.distanceTo(g.p3);
      g.pathLength = clamp(dist / (g.cruise * .75), 3, 9);
      // u = 1 - (1 - x)^2 leaves at the current velocity and arrives at rest.
      g.c1.copy(p).addScaledVector(v, g.pathLength / 6);
      const bx = g.p0.x - g.p3.x, bz = g.p0.z - g.p3.z, bl = Math.hypot(bx, bz) || 1;
      g.c2.set(g.p3.x + bx / bl * 3, g.p3.y + 1.4, g.p3.z + bz / bl * 3);
      g.flyTime = 0;
      g.state = 'return';
    }
  }

  flyHome(g, dt) {
    g.flyTime += dt;
    const length = g.pathLength, x = Math.min(1, g.flyTime / length);
    // The rider came close to the perch: go round again.
    if (x < .85 && this.horizontalToRider(g.p3) < GULL_NEAR) {
      if (g.target?.occupant === g) g.target.occupant = null;
      g.target = null;
      g.state = 'fly'; g.timer = rand(3, 6); g.flyTime = 2;
      return;
    }
    if (x >= 1) { g.sit(g.target); return; }
    const u = 1 - (1 - x) * (1 - x), du = 2 * (1 - x) / length;
    bezier(g.root.position, g.p0, g.c1, g.c2, g.p3, u);
    const t = bezierTangent(g.tangent, g.p0, g.c1, g.c2, g.p3, u);
    g.velocity.copy(t).multiplyScalar(du);
    const hs = Math.hypot(g.velocity.x, g.velocity.z);
    const heading = Math.hypot(t.x, t.z) > 1e-4 ? Math.atan2(t.x, t.z) : g.yaw;
    const turnRate = dt > 0 ? wrapAngle(heading - g.yaw) / dt : 0;
    g.yaw = heading;
    const flare = smooth(length - .9, length - .1, g.flyTime);
    g.animateFlight(dt, hs, g.velocity.y, turnRate, 0, flare);
  }

  // ---------------------------------------------------------------- swarms
  updateSwarm(swarm, dt, speed, moth) {
    if (swarm.count === 0) return;
    const t = this.time, motion = this.motion, c = this.riderCenter;
    const fast = speed > SCATTER_SPEED;
    const out = Math.min(1, dt * 7 * motion), back = 1 - Math.exp(-dt * motion);
    const { home, offset, positions, colors, tint, phase } = swarm;
    for (let i = 0; i < swarm.count; i++) {
      const j = i * 3, q = i * 4;
      const p0 = phase[q] * TAU, p1 = phase[q + 1] * TAU, p2 = phase[q + 2] * TAU, f = .5 + phase[q + 3];
      let wx, wy, wz, bright;
      if (moth) {
        const a = t * f * 3 + p0, r = .22 + .08 * Math.sin(t * 7 + p1);
        wx = Math.cos(a) * r + Math.sin(t * 23 + p2) * .03;
        wy = Math.sin(t * f * 2.2 + p1) * .14 + Math.sin(t * 31 + p0) * .025;
        wz = Math.sin(a) * r + Math.cos(t * 19 + p1) * .03;
        bright = .5 + .14 * Math.sin(t * 13 + p2);
      } else {
        wx = Math.sin(t * .35 * f + p0) * .6;
        wy = Math.sin(t * .27 * f + p1) * .35;
        wz = Math.cos(t * .31 * f + p2) * .6;
        const s = Math.sin(t * (.8 + phase[q + 3] * .9) + p0);
        bright = .05 + .95 * (s > 0 ? s * s * s * s : 0);
      }
      const bx = home[j] + wx, by = home[j + 1] + wy, bz = home[j + 2] + wz;
      const dx = bx - c.x, dy = by - c.y, dz = bz - c.z, d = Math.hypot(dx, dy, dz);
      if (fast && d < SCATTER_RADIUS) {
        const push = (SCATTER_RADIUS + .2 - d) * motion / Math.max(d, 1e-3);
        offset[j] += (dx * push - offset[j]) * out;
        offset[j + 1] += (dy * push * .6 - offset[j + 1]) * out;
        offset[j + 2] += (dz * push - offset[j + 2]) * out;
      } else {
        offset[j] -= offset[j] * back; offset[j + 1] -= offset[j + 1] * back; offset[j + 2] -= offset[j + 2] * back;
      }
      let px = bx + offset[j], py = by + offset[j + 1], pz = bz + offset[j + 2];
      const ex = px - c.x, ey = py - c.y, ez = pz - c.z, e = Math.hypot(ex, ey, ez);
      if (e < RIDER_CLEAR) { // hard bubble round the rider
        const k = e > 1e-4 ? RIDER_CLEAR / e : 0;
        if (k) { px = c.x + ex * k; py = c.y + ey * k; pz = c.z + ez * k; } else { px = c.x + RIDER_CLEAR; py = c.y; pz = c.z; }
      }
      positions[j] = px; positions[j + 1] = py; positions[j + 2] = pz;
      colors[j] = tint[j] * bright; colors[j + 1] = tint[j + 1] * bright; colors[j + 2] = tint[j + 2] * bright;
    }
    swarm.positionAttr.needsUpdate = true;
    swarm.colorAttr.needsUpdate = true;
  }

  offsetLength(i) {
    return i < this.fireflies.count ? this.fireflies.offsetLength(i) : this.moths.offsetLength(i - this.fireflies.count);
  }

  // ----------------------------------------------------------------- props
  updateProp(prop, dt, vx, vz, speed, surface) {
    const p = prop.position, rider = this.riderFeet;
    const dx = p.x - rider.x, dz = p.z - rider.z, d = Math.hypot(dx, dz);
    if (!prop.armed && prop.state === 'rest' && d > 3) prop.armed = true;
    if (prop.state === 'rest') {
      if (speed > TUMBLE_SPEED && prop.armed) {
        // Tumble before the rider gets there: it is in the line, just ahead.
        const ux = vx / speed, uz = vz / speed;
        const along = dx * ux + dz * uz, side = dx * uz - dz * ux;
        if (Math.abs(side) < TUMBLE_LATERAL && along > -.3 && along < 1.4 + speed * .45) {
          const s = Math.abs(side) > .02 ? Math.sign(side) : 1;
          const lateral = (prop.kind === 'can' ? rand(2.6, 3.2) : rand(2.1, 2.6)) * s;
          const forward = Math.min(3.5, speed * .4);
          this.tumble(prop, uz * lateral + ux * forward, -ux * lateral + uz * forward, speed, surface);
        }
      } else if (d < RIDER_CLEAR + .25) {
        // A slow roll into it: a gentle shove straight away.
        const k = d > 1e-3 ? 1 / d : 0, push = 1.4 + speed * .5;
        this.tumble(prop, (k ? dx * k : 1) * push, (k ? dz * k : 0) * push, speed, surface);
      }
    }
    if (prop.state === 'tumble') this.advanceTumble(prop, dt);
    else if (prop.displaced) {
      prop.restTime += dt;
      if (prop.restTime >= PROP_HOME_AFTER && !this.seen(prop.position) && !this.seen(prop.home)
        && this.horizontalToRider(prop.home) > 3) {
        p.copy(prop.home);
        prop.yaw = prop.homeYaw; prop.tilt = 0; prop.roll = 0;
        prop.displaced = false; prop.restTime = 0; prop.armed = true;
        this.writeProp(prop);
      }
    }
    // Hard clearance: never inside the rider's space (pushed along the ground,
    // along the wall when the wall is in the way).
    const ex = p.x - rider.x, ez = p.z - rider.z, e = Math.hypot(ex, ez);
    if (e < RIDER_CLEAR) {
      if (e > 1e-4) { p.x = rider.x + ex / e * RIDER_CLEAR; p.z = rider.z + ez / e * RIDER_CLEAR; } else p.x = rider.x + RIDER_CLEAR;
      if (this.keepOffWall(prop)) {
        const f = prop.facing, tx = -f.z, tz = f.x;
        const rx = p.x - rider.x, rz = p.z - rider.z, b = rx * f.x + rz * f.z, a = rx * tx + rz * tz;
        const along = (a < 0 ? -1 : 1) * Math.sqrt(Math.max(0, RIDER_CLEAR * RIDER_CLEAR - b * b));
        p.x += tx * (along - a); p.z += tz * (along - a);
      }
      if (prop.state === 'rest') { prop.displaced = true; prop.restTime = 0; }
      this.writeProp(prop);
    }
  }

  /**
   * Scan edge spots sit 0.9 m out from a wall: never go through it. Returns
   * true when the prop had to be held off the wall.
   */
  keepOffWall(prop) {
    const f = prop.facing, p = prop.position;
    if (!f) return false;
    const w = (p.x - prop.home.x) * f.x + (p.z - prop.home.z) * f.z;
    if (w >= -WALL_REACH) return false;
    const along = (p.x - prop.home.x) * -f.z + (p.z - prop.home.z) * f.x;
    if (Math.abs(along) > 4) return false; // well along the wall: it may have ended
    p.x += f.x * (-WALL_REACH - w); p.z += f.z * (-WALL_REACH - w);
    const into = prop.velocity.x * f.x + prop.velocity.z * f.z;
    if (into < 0) { prop.velocity.x -= f.x * into; prop.velocity.z -= f.z * into; }
    return true;
  }

  tumble(prop, vx, vz, riderSpeed, surface) {
    const motion = this.motion;
    vx *= motion; vz *= motion;
    let v = Math.hypot(vx, vz);
    if (v > 1e-4 && surface?.ground) {
      // Only slide as far as flat ground goes (one probe at the stop, one halfway).
      const ok = distance => {
        for (const f of [.5, 1]) {
          const hit = surface.ground(this.scratch.set(prop.position.x + vx / v * distance * f, prop.position.y, prop.position.z + vz / v * distance * f), .3, .5);
          if (!hit || hit.normal.y <= .95 || Math.abs(hit.point.y - prop.position.y) > .12) return false;
        }
        return true;
      };
      let distance = v * v / (2 * prop.decel);
      while (distance > .2 && !ok(distance)) distance *= .5;
      if (distance <= .2) distance = .2;
      const scale = Math.sqrt(2 * prop.decel * distance) / v;
      vx *= scale; vz *= scale; v *= scale;
    }
    prop.velocity.set(vx, 0, vz);
    prop.state = 'tumble';
    prop.armed = false;
    prop.displaced = true;
    prop.tiltTime = prop.tilt > 1 ? .3 : 0; // already lying: just slide and spin
    prop.spin = rand(4, 9) * (Math.random() < .5 ? -1 : 1) * motion;
    prop.tumbles++;
    if (this.time - prop.lastSound >= PROP_SOUND_GAP) {
      prop.lastSound = this.time;
      const can = prop.kind === 'can';
      this.ctx?.audio?.play?.(can ? 'clink' : 'thud', prop.position, { gain: can ? .5 : .75, rate: rand(.92, 1.08) * (riderSpeed > 6 ? 1.05 : 1) });
    }
  }

  advanceTumble(prop, dt) {
    const v = prop.velocity, sp = Math.hypot(v.x, v.z);
    if (sp > 0) {
      const next = Math.max(0, sp - prop.decel * dt);
      v.multiplyScalar(next / sp);
      prop.position.addScaledVector(v, dt);
      this.keepOffWall(prop);
    }
    prop.tiltTime += dt;
    const k = Math.min(1, prop.tiltTime / .25);
    const settle = prop.tiltTime > .25 ? .14 * Math.sin(Math.min(1, (prop.tiltTime - .25) / .3) * Math.PI) * this.motion : 0;
    prop.tilt = prop.restTilt * k * k * (3 - 2 * k) - settle;
    prop.yaw += prop.spin * dt;
    prop.spin *= Math.exp(-dt * 3);
    if (prop.kind === 'can') prop.roll += sp / .034 * dt;
    if (sp === 0 && prop.tiltTime > .6) { prop.state = 'rest'; prop.restTime = 0; prop.tilt = prop.restTilt; }
    this.writeProp(prop);
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
    if (cp && Math.hypot(point.x - cp.x, point.y - cp.y, point.z - cp.z) > SEEN_DISTANCE) return false;
    return this.frustum.containsPoint(point);
  }

  reset() {
    this.clearAgents();
    this.lastChirp = -Infinity;
    this.ctx?.audio?.stop?.('chirp');
    this.ctx?.audio?.stop?.('clink');
    this.ctx?.audio?.stop?.('thud');
  }

  dispose() {
    this.unsubscribe.forEach(off => off());
    this.unsubscribe = [];
    this.reactions = null;
    this.clearAgents();
    this.root.removeFromParent();
    for (const mesh of Object.values(this.meshes)) { mesh.geometry.dispose(); mesh.dispose(); }
    this.fireflies.points.geometry.dispose();
    this.moths.points.geometry.dispose();
    for (const m of [this.gullMaterial, this.propMaterial, this.fireflyMaterial, this.mothMaterial]) m.dispose();
    this.glow.dispose();
  }
}
