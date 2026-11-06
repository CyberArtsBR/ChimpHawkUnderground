import * as THREE from 'three';
import { createSurfaceMaterials, surfaceTexturesReady } from './SurfaceMaterials.js';
import { gameAssetUrl } from '../game/AssetPaths.js';

/**
 * DOWNHILL BOMB (2026-11, phase 1): a procedurally generated sunset city hill.
 *  - A winding road with left and right bends, banked into each turn.
 *  - The slope steepens with distance, so speed keeps building as you go.
 *  - Rounded curbs to grind, quarter-pipe banks on the outside of tight bends,
 *    and procedural kickers, fun boxes, manual pads, ledges, rails and gaps.
 *  - Sunset city around it: towers with lit windows, lamps, palms, the ocean.
 * Physics is the game's own, untouched. Bananas and bullet time live in
 * DownhillRun.js; this file only builds the world and lists their spots.
 */
export const DOWNHILL = Object.freeze({
  length: 1700,          // metres of road in one stretch
  step: 1.5,             // centre-line sample spacing
  halfWidth: 7,          // road half width (14 m road, three wide lanes)
  sidewalk: 5,           // sidewalk width beyond the curb
  startFlat: 40,
  gradeStart: .07,       // 7% at the top …
  gradeEnd: .22,         // … 22% near the bottom
  maxBank: 10 * Math.PI / 180,
});

function seeded(seed) {
  let h = (Number(seed) >>> 0) || 1;
  return () => { h = (Math.imul(h, 1664525) + 1013904223) >>> 0; return h / 4294967296; };
}
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const smooth = t => t * t * (3 - 2 * t);

// ── Procedural textures ─────────────────────────────────────────────────
function canvasTexture(w, h, draw, { color = true, repeat = true } = {}) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  if (color) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

/** Asphalt across the full road width (U) and 16 m along it (V), with markings. */
function asphaltTextures(rand) {
  const W = 512, H = 1024, lane = W / 3;
  const speckle = (ctx, n, colors) => {
    for (let i = 0; i < n; i++) { ctx.fillStyle = colors[Math.floor(rand() * colors.length)]; ctx.fillRect(rand() * W, rand() * H, 1 + rand() * 2, 1 + rand() * 2); }
  };
  const map = canvasTexture(W, H, ctx => {
    ctx.fillStyle = '#34353a'; ctx.fillRect(0, 0, W, H);
    speckle(ctx, 26000, ['#2a2b2f', '#3d3e44', '#45464c', '#2f3034', '#4a4a4f']);
    // Darker tyre lines in each lane and a few tar seams / patches.
    for (let l = 0; l < 3; l++) for (const o of [.3, .7]) {
      const g = ctx.createLinearGradient(l * lane + lane * o - 14, 0, l * lane + lane * o + 14, 0);
      g.addColorStop(0, 'rgba(15,15,18,0)'); g.addColorStop(.5, 'rgba(15,15,18,.13)'); g.addColorStop(1, 'rgba(15,15,18,0)');
      ctx.fillStyle = g; ctx.fillRect(l * lane + lane * o - 14, 0, 28, H);
    }
    ctx.strokeStyle = 'rgba(12,12,14,.55)'; ctx.lineWidth = 2.5;
    for (let i = 0; i < 7; i++) { let x = rand() * W, y = rand() * H; ctx.beginPath(); ctx.moveTo(x, y); for (let k = 0; k < 6; k++) { x += (rand() - .5) * 40; y += 20 + rand() * 30; ctx.lineTo(x, y); } ctx.stroke(); }
    // Markings: solid white edge lines, dashed lane lines.
    ctx.fillStyle = '#e9e6dc';
    ctx.fillRect(14, 0, 12, H); ctx.fillRect(W - 26, 0, 12, H);
    for (const x of [lane, lane * 2]) for (const y0 of [0, H / 2]) ctx.fillRect(x - 6, y0 + 40, 12, H / 4);
    // Worn paint.
    speckle(ctx, 2600, ['rgba(52,53,58,.9)']);
  });
  const bump = canvasTexture(W, H, ctx => {
    ctx.fillStyle = '#808080'; ctx.fillRect(0, 0, W, H);
    speckle(ctx, 40000, ['#6a6a6a', '#959595', '#777777', '#8c8c8c']);
  }, { color: false });
  return { map, bump };
}

function kerbTexture() {
  return canvasTexture(64, 256, (ctx, w, h) => {
    for (let i = 0; i < 4; i++) { ctx.fillStyle = i % 2 ? '#e8e4da' : '#c2372e'; ctx.fillRect(0, i * h / 4, w, h / 4); }
  });
}

function chevronTexture() {
  return canvasTexture(256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#141414'; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#ffd23f';
    for (const x of [40, 130]) { ctx.beginPath(); ctx.moveTo(x, 30); ctx.lineTo(x + 70, 128); ctx.lineTo(x, 226); ctx.lineTo(x + 40, 226); ctx.lineTo(x + 110, 128); ctx.lineTo(x + 40, 30); ctx.closePath(); ctx.fill(); }
  }, { repeat: false });
}

/**
 * Facade maps for one building style: colour, lit windows (emissive) and a
 * roughness/metalness pair so the glass reflects the sunset sky while the
 * walls stay matte. One tile = 3 bays x 4 floors (12 m x 14.4 m).
 */
function facadeTextures(style, rand) {
  const W = 512, H = 512, cols = 3, rows = 4, bw = W / cols, fh = H / rows;
  const lit = Array.from({ length: cols * rows }, () => rand() < style.lit);
  const windows = (fn) => { for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) fn(c * bw + 16, r * fh + 18, bw - 32, fh - 44, r * cols + c); };
  const map = canvasTexture(W, H, ctx => {
    ctx.fillStyle = style.wall; ctx.fillRect(0, 0, W, H);
    // Subtle plaster grain.
    for (let i = 0; i < 9000; i++) { ctx.fillStyle = rand() < .5 ? 'rgba(0,0,0,.05)' : 'rgba(255,255,255,.05)'; ctx.fillRect(rand() * W, rand() * H, 2, 2); }
    windows((x, y, w, h) => {
      const g = ctx.createLinearGradient(x, y, x + w * .4, y + h);
      g.addColorStop(0, style.glass); g.addColorStop(1, '#141a2a');
      ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
      ctx.fillStyle = style.frame; ctx.fillRect(x + w / 2 - 2, y, 4, h); ctx.fillRect(x, y + h * .35, w, 3);
      ctx.strokeStyle = style.frame; ctx.lineWidth = 5; ctx.strokeRect(x, y, w, h);
      ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.fillRect(x - 4, y + h, w + 8, 8); // sill shadow
      ctx.fillStyle = style.frame; ctx.fillRect(x - 6, y + h, w + 12, 4);
    });
    // Floor slabs and pilasters.
    for (let r = 0; r <= rows; r++) { ctx.fillStyle = 'rgba(0,0,0,.18)'; ctx.fillRect(0, r * fh - 6, W, 12); ctx.fillStyle = 'rgba(255,255,255,.14)'; ctx.fillRect(0, r * fh - 6, W, 3); }
    for (let c = 0; c <= cols; c++) { ctx.fillStyle = 'rgba(0,0,0,.12)'; ctx.fillRect(c * bw - 5, 0, 10, H); }
  });
  const emissive = canvasTexture(W, H, ctx => {
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
    windows((x, y, w, h, k) => {
      if (!lit[k]) return;
      const g = ctx.createLinearGradient(x, y, x, y + h);
      g.addColorStop(0, rand() < .5 ? '#ffd9a0' : '#ffe9c9'); g.addColorStop(1, '#a8682e');
      ctx.fillStyle = g; ctx.fillRect(x + 4, y + 4, w - 8, h - 8);
    });
  });
  // Roughness (G) and metalness (B) share one texture: glass smooth + metallic.
  const surface = canvasTexture(W, H, ctx => {
    ctx.fillStyle = `rgb(0,${style.glossy ? 150 : 225},${style.glossy ? 90 : 0})`; ctx.fillRect(0, 0, W, H);
    windows((x, y, w, h) => { ctx.fillStyle = 'rgb(0,30,200)'; ctx.fillRect(x, y, w, h); });
  }, { color: false });
  return { map, emissive, surface };
}

const BUILDING_STYLES = [
  { wall: '#e8a08a', glass: '#3c4a66', frame: '#f4d7c6', lit: .35, glossy: false },
  { wall: '#7fc4bf', glass: '#2e4057', frame: '#e8f2ef', lit: .3, glossy: false },
  { wall: '#efe2c4', glass: '#43506b', frame: '#ffffff', lit: .4, glossy: false },
  { wall: '#b49ad1', glass: '#30395a', frame: '#e9defa', lit: .3, glossy: false },
  { wall: '#2b3d5c', glass: '#6f9cc9', frame: '#1c2840', lit: .25, glossy: true },
];

// ── The generator ───────────────────────────────────────────────────────
/** Endless mode: the next stretch to build (1 = the first hill of a session). */
const nextStretch = { stretch: 1, seed: null };
export function setDownhillStretch(stretch = 1, seed = null) {
  nextStretch.stretch = Math.max(1, Math.floor(Number(stretch) || 1));
  nextStretch.seed = seed;
}

/** How much harder each stretch gets (0 on the first, capped). */
export function stretchDifficulty(stretch) { return Math.min(1, (Math.max(1, stretch) - 1) / 5); }

export function createDownhillBomb({ seed = nextStretch.seed ?? (Date.now() & 0xffffff), stretch = nextStretch.stretch } = {}) {
  const hard = stretchDifficulty(stretch);
  const rand = seeded(seed);
  const C = DOWNHILL, W = C.halfWidth;
  const park = new THREE.Group(); park.name = `Downhill Bomb (stretch ${stretch}, seed ${seed})`;
  const collision = new THREE.Group(); collision.name = 'Downhill Bomb collision';
  const rails = [];
  const bananas = [];
  const cones = [];

  // 1) Curvature plan: straights and left/right bends, eased in and out.
  const count = Math.ceil(C.length / C.step) + 1;
  const kappaRaw = new Float32Array(count);
  let s = C.startFlat + 50, sign = rand() < .5 ? 1 : -1;
  while (s < C.length - 80) {
    s += (25 + rand() * 40) * (1 - hard * .35); // straight
    const radius = (48 + rand() * 55) * (1 - hard * .2), angle = (35 + rand() * 50) * Math.PI / 180, len = radius * angle;
    if (rand() < .72) sign = -sign;
    const i0 = Math.floor(s / C.step), i1 = Math.min(count - 1, Math.floor((s + len) / C.step));
    for (let i = i0; i <= i1; i++) kappaRaw[i] = sign / radius;
    s += len;
  }
  // Smooth over ~30 m so bends ease in like real roads.
  const kappa = new Float32Array(count), win = Math.round(10 / C.step);
  for (let i = 0; i < count; i++) {
    let sum = 0, n = 0;
    for (let k = -win; k <= win; k++) { const j = i + k; if (j >= 0 && j < count) { sum += kappaRaw[j]; n++; } }
    kappa[i] = sum / n;
  }

  // 2) Centre line, slope and banking.
  const P = [], D = [], L = [], N = [], theta = new Float32Array(count), sArr = new Float32Array(count), grade = new Float32Array(count);
  let x = 0, z = 0, y = 0, th = 0;
  for (let i = 0; i < count; i++) {
    const si = i * C.step; sArr[i] = si;
    // Later stretches start on a short flat (the spawn must be level) and ramp
    // in quickly; the slope runs almost to the tunnel so speed carries through.
    const flat = stretch > 1 ? 22 : C.startFlat, rampIn = stretch > 1 ? 22 : 45;
    const intro = clamp((si - flat) / rampIn, 0, 1), outro = clamp((C.length - 14 - si) / 14, 0, 1);
    const g = smooth(intro) * outro * (C.gradeStart + hard * .04 + (C.gradeEnd - C.gradeStart) * (si / C.length) + .02 * Math.sin(si / 41) * (si > 120 ? 1 : 0));
    grade[i] = g; theta[i] = th;
    const dir = new THREE.Vector3(-Math.sin(th), 0, -Math.cos(th));
    const right = new THREE.Vector3(Math.cos(th), 0, -Math.sin(th));
    const bank = -clamp(kappa[i] * 50, -1, 1) * C.maxBank;
    const tangent = dir.clone().setY(-g).normalize();
    const lateral = right.clone().multiplyScalar(Math.cos(bank)).setY(Math.sin(bank)).normalize();
    const normal = new THREE.Vector3().crossVectors(lateral, tangent).normalize();
    P.push(new THREE.Vector3(x, y, z)); D.push(tangent); L.push(lateral); N.push(normal);
    x += dir.x * C.step; z += dir.z * C.step; y -= g * C.step;
    th -= kappa[i] * C.step;
  }
  // The game resets any rider below y = -6 as "fallen out of the world", so the
  // whole hill is lifted until its lowest point sits safely above ground level.
  const lowest = Math.min(...P.map(p => p.y));
  for (const p of P) p.y += 4 - lowest;
  const point = (i, u, h) => P[i].clone().addScaledVector(L[i], u).addScaledVector(N[i], h);
  /** Interpolated local frame at distance s (for features). */
  const frameAt = si => {
    const f = clamp(si / C.step, 0, count - 1.001), i = Math.floor(f), t = f - i;
    return {
      P: P[i].clone().lerp(P[i + 1], t), D: D[i].clone().lerp(D[i + 1], t).normalize(),
      L: L[i].clone().lerp(L[i + 1], t).normalize(), N: N[i].clone().lerp(N[i + 1], t).normalize(), i,
    };
  };
  const local = (f, lx, ly, lz) => f.P.clone().addScaledVector(f.L, lx).addScaledVector(f.N, ly).addScaledVector(f.D, lz);

  // 3) Materials.
  const surfaces = createSurfaceMaterials();
  const asphalt = asphaltTextures(rand);
  const mats = {
    road: new THREE.MeshStandardMaterial({ name: 'Downhill asphalt', map: asphalt.map, bumpMap: asphalt.bump, bumpScale: .025, roughness: .86, metalness: 0 }),
    sidewalk: new THREE.MeshStandardMaterial({ name: 'Downhill sidewalk', color: '#8d877e', map: surfaces.concrete.map, bumpMap: surfaces.concrete.bumpMap, bumpScale: .02, roughness: .92 }),
    kerb: new THREE.MeshStandardMaterial({ name: 'Downhill kerb', map: kerbTexture(), roughness: .7 }),
    barrier: new THREE.MeshStandardMaterial({ name: 'Downhill barrier', color: '#a7a198', roughness: .9, map: surfaces.concrete.map }),
    bank: surfaces.bowl,
    wood: surfaces.wood,
    steel: new THREE.MeshStandardMaterial({ name: 'Downhill steel', color: '#c3c9d1', metalness: .85, roughness: .32 }),
    coping: new THREE.MeshStandardMaterial({ name: 'Downhill coping', color: '#9aa3ad', metalness: .9, roughness: .28 }),
    ledge: surfaces.concrete,
    planter: new THREE.MeshStandardMaterial({ name: 'Downhill planter', color: '#7b6a5c', roughness: .85 }),
    bush: new THREE.MeshStandardMaterial({ name: 'Downhill bush', color: '#3f7a3a', roughness: .9 }),
    chevron: new THREE.MeshStandardMaterial({ name: 'Downhill chevron', map: chevronTexture(), roughness: .5, emissive: '#ffd23f', emissiveIntensity: .25 }),
    collision: new THREE.MeshBasicMaterial({ visible: false }),
    terrain: new THREE.MeshStandardMaterial({ name: 'Downhill terrain', color: '#4f4d47', roughness: .97, map: surfaces.concrete.map }),
  };
  // Procedural faces are built in several orientations: draw both sides.
  for (const key of ['sidewalk', 'kerb', 'barrier', 'bank', 'wood', 'ledge', 'planter', 'terrain']) mats[key].side = THREE.DoubleSide;
  mats.bank.polygonOffset = true; mats.bank.polygonOffsetFactor = -1; mats.bank.polygonOffsetUnits = -1;

  const addMesh = (geometry, material, { solid = false, collide = true, transition = false, rail = null, name = '', cast = true, cameraTransparent = false } = {}) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = name; mesh.castShadow = cast; mesh.receiveShadow = true;
    park.add(mesh);
    if (collide) {
      const body = new THREE.Mesh(geometry, mats.collision);
      body.name = `${name} (collision)`;
      if (solid) body.userData.surface = 'solid';
      if (transition) body.userData.transitionSkin = true;
      if (rail) body.userData.railId = rail;
      if (cameraTransparent) body.userData.cameraTransparent = true;
      collision.add(body);
    }
    return mesh;
  };

  /** A ribbon along samples i0..i1 through a cross-section of [u, h] columns. */
  const ribbon = (i0, i1, columns, uvOf) => {
    const positions = [], uvs = [], index = [];
    const cols = columns(i0).length;
    for (let i = i0; i <= i1; i++) {
      const profile = columns(i);
      for (let j = 0; j < cols; j++) {
        const [u, h] = profile[j];
        const p = point(i, u, h);
        positions.push(p.x, p.y, p.z);
        const [tu, tv] = uvOf(u, h, sArr[i], j);
        uvs.push(tu, tv);
      }
    }
    for (let r = 0; r < i1 - i0; r++) for (let j = 0; j < cols - 1; j++) {
      const a = r * cols + j, c = a + 1, b = a + cols, d = b + 1;
      index.push(a, c, b, c, d, b);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setIndex(index);
    geometry.computeVertexNormals();
    return geometry;
  };

  // 4) Banks on the outside of tighter bends (with tapered ends).
  const bankAmount = new Float32Array(count);
  for (let i = 0; i < count; i++) if (Math.abs(kappa[i]) > 1 / 125 && sArr[i] > 100) bankAmount[i] = 1;
  const taper = new Float32Array(count), tw = Math.round(12 / C.step);
  for (let i = 0; i < count; i++) {
    let m = 0; for (let k = -tw; k <= tw; k++) { const j = i + k; if (j >= 0 && j < count) m += bankAmount[j]; }
    taper[i] = smooth(clamp(m / (2 * tw + 1) * 1.6 - .3, 0, 1));
  }
  const bankSide = i => kappa[i] > 0 ? -1 : 1; // outside of the bend
  const BANK_IN = W + 2.6, BANK_R = 2.3, BANK_MAX = 68 * Math.PI / 180;
  const bankTop = i => .15 + BANK_R * (1 - Math.cos(BANK_MAX * taper[i]));

  // 5) Road, curbs, sidewalks, barriers, invisible containment walls.
  const CHUNK = 70;
  for (let i0 = 0; i0 < count - 1; i0 += CHUNK) {
    const i1 = Math.min(count - 1, i0 + CHUNK);
    addMesh(ribbon(i0, i1, () => [[-W, 0], [-W / 3, 0], [W / 3, 0], [W, 0]],
      (u, h, si) => [(u + W) / (2 * W), si / 16]), mats.road, { name: 'Road', cast: false });
    for (const side of [-1, 1]) {
      const curve = Math.abs(kappa[Math.floor((i0 + i1) / 2)]) > 1 / 200;
      addMesh(ribbon(i0, i1, () => side < 0 ? [[-W - .3, .15], [-W, 0]] : [[W, 0], [W + .3, .15]],
        (u, h, si, j) => [j, si / 2]), curve ? mats.kerb : mats.sidewalk, { name: 'Curb', cast: false });
      addMesh(ribbon(i0, i1, () => side < 0 ? [[-W - C.sidewalk - .3, .15], [-W - .3, .15]] : [[W + .3, .15], [W + C.sidewalk + .3, .15]],
        (u, h, si) => [u / 3, si / 3]), mats.sidewalk, { name: 'Sidewalk', cast: false });
      // Jersey barrier, taller where a bank sits in front of it.
      const out = W + C.sidewalk + .3;
      addMesh(ribbon(i0, i1, i => {
        const top = Math.max(1.05, bankSide(i) === side && taper[i] > 0 ? bankTop(i) + .95 : 1.05);
        return side < 0
          ? [[-out - .6, .15], [-out - .45, top], [-out - .2, top], [-out - .05, .4], [-out, .15]]
          : [[out, .15], [out + .05, .4], [out + .2, top], [out + .45, top], [out + .6, .15]];
      }, (u, h, si) => [h, si / 3]), mats.barrier, { name: 'Barrier', solid: true });
      // Invisible containment so a big air never leaves the hill.
      const fence = ribbon(i0, i1, () => side < 0 ? [[-out - 2, -2], [-out - 2, 9]] : [[out + 2, 9], [out + 2, -2]], () => [0, 0]);
      const wall = new THREE.Mesh(fence, mats.collision);
      wall.userData.surface = 'solid'; wall.userData.cameraTransparent = true; wall.name = 'Containment';
      collision.add(wall);
      // Ground beyond the barrier for the city to stand on (visual only).
      // On the inside of a tight bend the ground strip is narrower, so it never folds over itself.
      const groundWidth = i => (kappa[i] > 0 ? 1 : -1) === side && Math.abs(kappa[i]) > 1e-4
        ? clamp(1 / Math.abs(kappa[i]) - out - 6, 4, 44) : 44;
      addMesh(ribbon(i0, i1, i => side < 0 ? [[-out - groundWidth(i), -4], [-out - .6, .15]] : [[out + .6, .15], [out + groundWidth(i), -4]],
        (u, h, si) => [u / 6, si / 6]), mats.terrain, { name: 'Terrain', collide: false, cast: false });
    }
  }
  // Grindable curb edges (rails split into ~40 m pieces).
  for (const side of [-1, 1]) {
    for (let i0 = Math.round(60 / C.step); i0 < count - 20; i0 += Math.round(40 / C.step)) {
      const pts = [];
      for (let i = i0; i <= Math.min(count - 1, i0 + Math.round(40 / C.step)); i += 2) pts.push(point(i, side * (W + .3), .15).toArray());
      if (pts.length >= 2) rails.push({ name: `Curb ${side < 0 ? 'L' : 'R'} ${i0}`, points: pts, radius: .06 });
    }
  }
  // Banks: build each continuous run of samples with a bank.
  for (let i = 0; i < count - 1;) {
    if (taper[i] <= 0) { i++; continue; }
    let j = i; const side = bankSide(i);
    while (j < count - 1 && taper[j + 1] > 0 && bankSide(j + 1) === side) j++;
    if (j - i >= 4) {
      const segs = 10;
      const geometry = ribbon(i, j, k => {
        const cols = [];
        for (let q = 0; q <= segs; q++) {
          const t = BANK_MAX * taper[k] * q / segs;
          cols.push([side * (BANK_IN + BANK_R * Math.sin(t)), .15 + BANK_R * (1 - Math.cos(t))]);
        }
        // Deck from the lip back to the barrier.
        const top = cols[cols.length - 1];
        cols.push([side * (W + C.sidewalk + .3), top[1]]);
        return side < 0 ? cols.reverse() : cols;
      }, (u, h, si) => [Math.abs(u) / 3 + h / 3, si / 3]);
      addMesh(geometry, mats.bank, { name: 'Bend bank', transition: true });
      // Coping along the lip where the bank is full height.
      const pts = [];
      for (let k = i; k <= j; k += 2) if (taper[k] > .85) pts.push(point(k, side * (BANK_IN + BANK_R * Math.sin(BANK_MAX * taper[k])), bankTop(k) + .04).toArray());
      if (pts.length >= 3) {
        const name = `Bank coping ${i}`;
        rails.push({ name, points: pts, radius: .055 });
        const curve = new THREE.CatmullRomCurve3(pts.map(p => new THREE.Vector3(...p)));
        addMesh(new THREE.TubeGeometry(curve, pts.length * 2, .055, 8), mats.coping, { name, solid: true, rail: name });
      }
      // Chevron signs on the barrier.
      for (let k = i + 6; k < j - 6; k += Math.round(9 / C.step)) {
        const plate = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.1), mats.chevron);
        const out = W + C.sidewalk + .3;
        plate.position.copy(point(k, side * (out - .02), bankTop(k) + .7));
        const facing = L[k].clone().multiplyScalar(-side).setY(0).normalize();
        plate.lookAt(plate.position.clone().add(facing));
        if (side > 0) plate.scale.x = -1; // arrows point into the bend
        park.add(plate);
      }
    }
    i = j + 1;
  }

  // 6) Feature kit on the road and sidewalks.
  const box = (f, cx, cy, cz, w, h, l, material, opts) => {
    // Eight corners in the local frame, then faces with flat normals.
    const c = [];
    for (const [sx, sy, sz] of [[-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1], [-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]])
      c.push(local(f, cx + sx * w / 2, cy + sy * h / 2, cz + sz * l / 2));
    return addMesh(quadMesh(c, [[3, 2, 6, 7], [0, 4, 5, 1], [0, 3, 7, 4], [1, 5, 6, 2], [0, 1, 2, 3], [4, 7, 6, 5]], 2), material, opts);
  };
  const wedge = (f, cx, cz, w, h, l, rising = true, material = mats.wood) => {
    // Rising: low at cz, lip at cz + l. Falling: high at cz, ground at cz + l.
    const h0 = rising ? 0 : h, h1 = rising ? h : 0;
    const c = [
      local(f, cx - w / 2, 0, cz), local(f, cx + w / 2, 0, cz), local(f, cx + w / 2, 0, cz + l), local(f, cx - w / 2, 0, cz + l),
      local(f, cx - w / 2, h0, cz), local(f, cx + w / 2, h0, cz), local(f, cx + w / 2, h1, cz + l), local(f, cx - w / 2, h1, cz + l),
    ];
    addMesh(quadMesh(c, [[4, 7, 6, 5], [0, 3, 7, 4], [1, 5, 6, 2]], 2), material, { name: rising ? 'Kicker' : 'Landing' });
    // Ends: vertical faces only where the ramp has height.
    const end = rising ? [3, 2, 6, 7] : [0, 4, 5, 1];
    addMesh(quadMesh(c, [end], 2), material, { name: 'Ramp end', solid: true });
  };
  const railBar = (name, a, b, height, posts = true) => {
    const p1 = a.clone(), p2 = b.clone();
    rails.push({ name, points: [p1.toArray(), p2.toArray()], radius: .045 });
    const curve = new THREE.LineCurve3(p1, p2);
    addMesh(new THREE.TubeGeometry(curve, 4, .045, 8), mats.steel, { name, solid: true, rail: name });
    if (posts) for (const p of [p1, p1.clone().lerp(p2, .5), p2]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(.035, .035, height, 8), mats.steel);
      post.position.copy(p).addScaledVector(THREE.Object3D.DEFAULT_UP, -height / 2); post.castShadow = true;
      park.add(post);
    }
  };
  const lanes = [-4.6, 0, 4.6];
  const bananaLine = (f0s, u, h, n = 5, gap = 2.6) => {
    for (let k = 0; k < n; k++) { const f = frameAt(f0s + k * gap); bananas.push(local(f, u, h, 0).toArray()); }
  };

  let fs = 110;
  let featureCount = 0;
  while (fs < C.length - 70) {
    const f = frameAt(fs);
    const curvy = Math.abs(kappa[f.i]) > 1 / 120;
    const difficulty = Math.min(1.4, fs / C.length + hard * .6);
    const lane = lanes[Math.floor(rand() * 3)];
    const free = lanes.filter(l => l !== lane);
    const roll = rand();
    let used = 12;
    if (!curvy && roll < .26) {
      // Kicker, with a banana arc over the landing.
      const h = .65 + difficulty * .45;
      wedge(f, lane, 0, 2.3, h, 2.6);
      for (let k = 0; k < 5; k++) { const ff = frameAt(fs + 4 + k * 2.4); bananas.push(local(ff, lane, 1.4 + Math.sin(k / 4 * Math.PI) * (1.6 + difficulty), 0).toArray()); }
      used = 26;
    } else if (!curvy && roll < .42) {
      // Fun box: up, flat top with a ledge rail, down.
      const h = .75;
      wedge(f, lane, 0, 2.4, h, 2.4, true);
      box(f, lane, h / 2, 2.4 + 2, 2.4, h, 4, mats.ledge, { name: 'Fun box', solid: false });
      wedge(f, lane, 6.4, 2.4, h, 2.4, false);
      const a = local(f, lane + 1.2, h + .02, 2.4), b = local(f, lane + 1.2, h + .02, 6.4);
      rails.push({ name: `Fun box edge ${featureCount}`, points: [a.toArray(), b.toArray()], radius: .05 });
      bananaLine(fs + 2.8, lane, h + 1, 3, 1.6);
      used = 22;
    } else if (roll < .56) {
      // Manual pad (grind the edges too).
      const h = .22, len = 5 + rand() * 2;
      box(f, lane, h / 2, len / 2, 1.7, h, len, mats.ledge, { name: 'Manual pad', solid: false });
      for (const side of [-1, 1]) {
        const a = local(f, lane + side * .85, h + .02, 0), b = local(f, lane + side * .85, h + .02, len);
        rails.push({ name: `Manual pad ${featureCount} ${side}`, points: [a.toArray(), b.toArray()], radius: .04 });
      }
      bananaLine(fs + .5, lane, h + .9, 4, len / 4);
      used = 16 + len;
    } else if (roll < .7) {
      // Sidewalk ledge with a grind edge facing the road.
      const side = rand() < .5 ? -1 : 1, u = side * (W + 1.3), len = 8 + rand() * 4;
      box(f, u, .15 + .22, len / 2, .55, .45, len, mats.ledge, { name: 'Ledge', solid: false });
      const a = local(f, u - side * .27, .15 + .45 + .02, 0), b = local(f, u - side * .27, .15 + .45 + .02, len);
      rails.push({ name: `Ledge ${featureCount}`, points: [a.toArray(), b.toArray()], radius: .05 });
      bananaLine(fs + 1, u - side * .27, 1.3, 4, len / 4);
      bananaLine(fs + 2, free[0], .8, 4);
      used = 14 + len;
    } else if (roll < .82) {
      // Handrail along the sidewalk.
      const side = rand() < .5 ? -1 : 1, u = side * (W + 2.4), len = 9 + rand() * 5, hr = .6;
      railBar(`Handrail ${featureCount}`, local(f, u, .15 + hr, 0), local(f, u, .15 + hr, len), hr);
      bananaLine(fs + 1, u, .15 + hr + .7, 4, len / 4);
      used = 14 + len;
    } else if (!curvy && roll < .9) {
      // Gap: kicker, a planter to clear, landing ramp.
      const h = .8 + difficulty * .3;
      wedge(f, lane, 0, 2.4, h, 2.4, true);
      box(f, lane, .3, 2.4 + 2.2, 2.2, .6, 2.2, mats.planter, { name: 'Planter', solid: true });
      const bush = new THREE.Mesh(new THREE.IcosahedronGeometry(.75, 1), mats.bush);
      bush.position.copy(local(f, lane, .9, 4.6)); bush.scale.set(1.2, .6, 1.2); bush.castShadow = true; park.add(bush);
      wedge(f, lane, 6.6, 2.4, h, 2.8, false);
      for (let k = 0; k < 4; k++) { const ff = frameAt(fs + 2.8 + k * 1.3); bananas.push(local(ff, lane, h + 1.2 + Math.sin(k / 3 * Math.PI) * .9, 0).toArray()); }
      used = 26;
    } else {
      // Cone slalom (knock them over: they are decoration, not walls).
      for (let k = 0; k < 6; k++) cones.push({ position: local(frameAt(fs + k * 3.2), lane + (k % 2 ? 1.1 : -1.1), 0, 0).toArray(), heading: theta[frameAt(fs + k * 3.2).i] });
      bananaLine(fs, lane, .8, 6, 3.2);
      used = 24;
    }
    // A loose banana line now and then in a free lane.
    // Banana lines in the open road between features keep bullet time coming.
    bananaLine(fs + used + 6, free[Math.floor(rand() * free.length)], .8, 5, 2.4);
    if (rand() < .7) bananaLine(fs + used + 24, lanes[Math.floor(rand() * 3)], .8, 5, 2.4);
    featureCount++;
    fs += (used + 34 + rand() * 40 * (1.1 - Math.min(1, difficulty) * .4)) * (1 - hard * .3);
  }

  // 7) City around the hill.
  buildCity({ park, rand, count, P, L, D, theta, sArr, W, sidewalk: C.sidewalk, point, kappa, taper, bankSide });

  // 8) Start platform gate and the tunnel at the bottom.
  buildGateAndTunnel({ park, collision, mats, point, frameAt, local, count, sArr, W, C, addMesh, stretch });

  // Playable regions: generous boxes per 60 m of road.
  const playableRegions = [];
  for (let i0 = 0; i0 < count; i0 += Math.round(60 / C.step)) {
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (let i = i0; i <= Math.min(count - 1, i0 + Math.round(66 / C.step)); i++) {
      minX = Math.min(minX, P[i].x); maxX = Math.max(maxX, P[i].x); minZ = Math.min(minZ, P[i].z); maxZ = Math.max(maxZ, P[i].z);
    }
    const m = W + C.sidewalk + 6;
    playableRegions.push({ minX: minX - m, maxX: maxX + m, minZ: minZ - m, maxZ: maxZ + m });
  }

  park.updateMatrixWorld(true);
  collision.updateMatrixWorld(true);
  const spawn = point(Math.round(14 / C.step), 0, .45).toArray();
  const manifest = {
    spawn, spawnHeading: 0, transitionScale: 1, rails, playableRegions,
    name: 'DOWNHILL BOMB', spots: [{ id: 'start', label: 'Start', position: spawn, heading: 0 }],
  };
  return {
    park, collision, manifest, visualTriangles: 0,
    ready: surfaceTexturesReady().catch(() => {}),
    downhill: {
      seed, stretch, length: C.length, step: C.step, halfWidth: W,
      centre: P.map(p => p.toArray()), headings: Array.from(theta),
      bananas, cones,
    },
  };
}

/** Quads (as corner index lists) to a non-indexed geometry with flat normals. */
function quadMesh(corners, quads) {
  const positions = [];
  for (const [a, b, c, d] of quads) for (const k of [a, b, c, a, c, d]) positions.push(corners[k].x, corners[k].y, corners[k].z);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  const uv = [];
  for (let q = 0; q < quads.length; q++) uv.push(0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1);
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.computeVertexNormals();
  return geometry;
}

// ── City: towers with lit windows, lamps, palms, ocean and far hills ────
function buildCity({ park, rand, count, P, L, D, theta, sArr, W, sidewalk, point, kappa, taper, bankSide }) {
  const styles = BUILDING_STYLES.map(style => {
    const tex = facadeTextures(style, rand);
    return {
      style,
      material: new THREE.MeshStandardMaterial({
        name: 'Downhill facade', map: tex.map, emissiveMap: tex.emissive, emissive: '#ffcf8f', emissiveIntensity: 1.1, side: THREE.DoubleSide,
        roughnessMap: tex.surface, metalnessMap: tex.surface, roughness: 1, metalness: 1, envMapIntensity: 1.3,
      }),
      sides: [], roofs: [],
    };
  });
  const roofMaterial = new THREE.MeshStandardMaterial({ name: 'Downhill roof', color: '#4a4550', roughness: .9 });
  const corridor = W + sidewalk + 6;
  const clearOfRoad = (corners, near) => {
    for (const c of corners) {
      for (let i = Math.max(0, near - 90); i < Math.min(count, near + 90); i += 3) {
        const dx = c.x - P[i].x, dz = c.z - P[i].z;
        if (dx * dx + dz * dz < corridor * corridor) return false;
      }
    }
    return true;
  };
  const pushBuilding = (target, corners, base, height) => {
    const [a, b, c, d] = corners; // footprint, counter-clockwise from above
    const top = height;
    const walls = [[a, b], [b, c], [c, d], [d, a]];
    for (const [p, q] of walls) {
      const width = Math.hypot(q.x - p.x, q.z - p.z);
      const v0 = new THREE.Vector3(p.x, base, p.z), v1 = new THREE.Vector3(q.x, base, q.z);
      const v2 = new THREE.Vector3(q.x, base + top, q.z), v3 = new THREE.Vector3(p.x, base + top, p.z);
      const uMax = width / 12, vMax = top / 14.4;
      target.sides.push([v0, v1, v2, v3, uMax, vMax]);
    }
    target.roofs.push([new THREE.Vector3(a.x, base + top, a.z), new THREE.Vector3(b.x, base + top, b.z), new THREE.Vector3(c.x, base + top, c.z), new THREE.Vector3(d.x, base + top, d.z)]);
  };
  const shops = [], awnings = [[], [], [], []], roofProps = { tank: [], ac: [], antenna: [] }, billboards = [];
  const awningColors = ['#d9473b', '#2fa69a', '#f0b429', '#8e5bd1'];
  for (const side of [-1, 1]) {
    let si = 8, nextBoard = 60 + rand() * 60;
    while (si < sArr[count - 1] - 10) {
      const i = Math.min(count - 1, Math.round(si / 1.5));
      const width = 12 + rand() * 14, depth = 12 + rand() * 10;
      const tall = rand() < .16;
      const height = tall ? 45 + rand() * 40 : 10 + rand() * 26;
      const setback = 2 + rand() * 6;
      const right = new THREE.Vector3(Math.cos(theta[i]), 0, -Math.sin(theta[i]));
      const fwd = new THREE.Vector3(-Math.sin(theta[i]), 0, -Math.cos(theta[i]));
      const centre = P[i].clone().addScaledVector(right, side * (corridor + setback + depth / 2));
      const footprint = (hw, hd) => {
        const corner = (fx, rx) => centre.clone().addScaledVector(fwd, fx).addScaledVector(right, rx);
        return side > 0
          ? [corner(-hw, -hd), corner(-hw, hd), corner(hw, hd), corner(hw, -hd)]
          : [corner(-hw, hd), corner(-hw, -hd), corner(hw, -hd), corner(hw, hd)];
      };
      const corners = footprint(width / 2, depth / 2);
      const base = P[i].y - 6;
      if (clearOfRoad(corners, i)) {
        const style = () => styles[Math.floor(rand() * styles.length)];
        const roofY = base + height + 6;
        let roofCorners = corners;
        if (height > 24 && rand() < .55) {
          // Podium with an inset tower on top.
          const podium = 8 + rand() * 6;
          pushBuilding(style(), corners, base, podium + 6);
          roofCorners = footprint(width / 2 - 2 - rand() * 2, depth / 2 - 2 - rand() * 2);
          pushBuilding(style(), roofCorners, base + podium + 6, height - podium);
        } else pushBuilding(style(), corners, base, height + 6);
        // Shopfront on the road-facing wall (corners 3 to 0), with an awning.
        const toRoad = right.clone().multiplyScalar(-side);
        const a = corners[3].clone().addScaledVector(toRoad, .25), b = corners[0].clone().addScaledVector(toRoad, .25);
        const ground = P[i].y - 1.2, shopTop = P[i].y + 4;
        shops.push([a.clone().setY(ground), b.clone().setY(ground), b.clone().setY(shopTop), a.clone().setY(shopTop), a.distanceTo(b) / 24]);
        const out = toRoad.clone().multiplyScalar(1.5);
        awnings[Math.floor(rand() * 4)].push([a.clone().setY(shopTop + .5), b.clone().setY(shopTop + .5), b.clone().add(out).setY(shopTop - .1), a.clone().add(out).setY(shopTop - .1)]);
        // Rooftop clutter.
        const rc = roofCorners[0].clone().add(roofCorners[2]).multiplyScalar(.5);
        if (rand() < .4) roofProps.tank.push({ p: rc.clone().addScaledVector(fwd, (rand() - .5) * width * .4).setY(roofY), s: .8 + rand() * .5 });
        for (let k = 0, n = Math.floor(rand() * 4); k < n; k++) roofProps.ac.push({ p: rc.clone().addScaledVector(fwd, (rand() - .5) * width * .6).addScaledVector(right, (rand() - .5) * depth * .5).setY(roofY), s: .8 + rand() * .6 });
        if (tall || rand() < .2) roofProps.antenna.push({ p: rc.clone().setY(roofY), s: .7 + rand() * .8 });
      }
      // Billboards on tall poles just behind the barrier, angled up the hill.
      if (si > nextBoard) {
        nextBoard = si + 110 + rand() * 90;
        const spot = P[i].clone().addScaledVector(right, side * (corridor - 1.5));
        const facing = right.clone().multiplyScalar(-side * .55).addScaledVector(fwd, -.85).normalize();
        billboards.push({ p: spot, facing, groundY: P[i].y });
      }
      si += width + 2 + rand() * 6;
    }
  }
  for (const entry of styles) {
    if (entry.sides.length) {
      const pos = [], uv = [];
      for (const [v0, v1, v2, v3, uMax, vMax] of entry.sides) {
        for (const [v, u, w] of [[v0, 0, 0], [v1, uMax, 0], [v2, uMax, vMax], [v0, 0, 0], [v2, uMax, vMax], [v3, 0, vMax]]) { pos.push(v.x, v.y, v.z); uv.push(u, w); }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      g.computeVertexNormals();
      const mesh = new THREE.Mesh(g, entry.material); mesh.name = 'City towers'; mesh.castShadow = true; mesh.receiveShadow = true;
      park.add(mesh);
    }
  }
  const roofPos = [];
  for (const entry of styles) for (const [a, b, c, d] of entry.roofs) for (const v of [a, c, b, a, d, c]) roofPos.push(v.x, v.y, v.z);
  if (roofPos.length) {
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(roofPos, 3)); g.computeVertexNormals();
    const roofs = new THREE.Mesh(g, roofMaterial); roofs.name = 'City roofs'; roofs.material.side = THREE.DoubleSide; park.add(roofs);
  }

  // Shopfronts and awnings.
  const quadsMesh = (quads, material, name, uvScale = false) => {
    if (!quads.length) return;
    const pos = [], uv = [];
    for (const q of quads) {
      const [v0, v1, v2, v3] = q, u = uvScale ? q[4] : 1;
      for (const [v, tu, tv] of [[v0, 0, 0], [v1, u, 0], [v2, u, 1], [v0, 0, 0], [v2, u, 1], [v3, 0, 1]]) { pos.push(v.x, v.y, v.z); uv.push(tu, tv); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.computeVertexNormals();
    const mesh = new THREE.Mesh(g, material); mesh.name = name; mesh.receiveShadow = true; mesh.castShadow = true;
    park.add(mesh);
  };
  const shopTex = shopfrontTexture(rand);
  quadsMesh(shops, new THREE.MeshStandardMaterial({ name: 'Downhill shopfront', map: shopTex.map, emissiveMap: shopTex.emissive, emissive: '#ffe2b0', emissiveIntensity: 1.2, roughnessMap: shopTex.surface, metalnessMap: shopTex.surface, side: THREE.DoubleSide }), 'Shopfronts', true);
  const stripes = awningTexture();
  awningColors.forEach((color, k) => quadsMesh(awnings[k], new THREE.MeshStandardMaterial({ name: 'Downhill awning', map: stripes, color, roughness: .8, side: THREE.DoubleSide }), 'Awnings'));

  // Rooftop clutter (instanced).
  const roofInstances = (list, geometry, material, name) => {
    if (!list.length) return;
    const mesh = new THREE.InstancedMesh(geometry, material, list.length);
    mesh.name = name; mesh.castShadow = true;
    const m = new THREE.Matrix4(), q = new THREE.Quaternion();
    list.forEach((item, k) => mesh.setMatrixAt(k, m.compose(item.p, q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, (k * 2.39) % 6.28), new THREE.Vector3(item.s, item.s, item.s))));
    park.add(mesh);
  };
  const metalGrey = new THREE.MeshStandardMaterial({ name: 'Downhill rooftop metal', color: '#8b8f97', metalness: .6, roughness: .45 });
  const tankGeo = mergeSimple([
    new THREE.CylinderGeometry(1.4, 1.4, 2.4, 14).translate(0, 3.2, 0), new THREE.ConeGeometry(1.5, .8, 14).translate(0, 4.8, 0),
    ...[[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([x, z]) => new THREE.CylinderGeometry(.08, .08, 2, 6).translate(x * .9, 1, z * .9)),
  ]);
  roofInstances(roofProps.tank, tankGeo, new THREE.MeshStandardMaterial({ name: 'Downhill water tank', color: '#8a6a4f', roughness: .85 }), 'Water tanks');
  roofInstances(roofProps.ac, new THREE.BoxGeometry(1.6, 1.1, 1.2).translate(0, .55, 0), metalGrey, 'AC units');
  roofInstances(roofProps.antenna, new THREE.CylinderGeometry(.06, .12, 9, 6).translate(0, 4.5, 0), metalGrey, 'Antennas');
  roofInstances(roofProps.antenna, new THREE.SphereGeometry(.28, 10, 8).translate(0, 9.1, 0),
    new THREE.MeshStandardMaterial({ name: 'Downhill antenna light', color: '#ff2a2a', emissive: '#ff2a2a', emissiveIntensity: 4 }), 'Antenna lights');

  // Crew billboards.
  buildBillboards(park, billboards, rand);

  // Street lamps (instanced), alternating sides every 26 m.
  const lampPositions = [];
  for (let si = 20, k = 0; si < sArr[count - 1] - 10; si += 26, k++) {
    const i = Math.round(si / 1.5), side = k % 2 ? 1 : -1;
    if (taper[i] > 0 && bankSide(i) === side) continue;
    lampPositions.push({ p: point(i, side * (W + sidewalk - .3), .15), yaw: theta[i] + (side > 0 ? Math.PI / 2 : -Math.PI / 2) });
  }
  const poleGeo = new THREE.CylinderGeometry(.07, .1, 7, 8); poleGeo.translate(0, 3.5, 0);
  const armGeo = new THREE.BoxGeometry(.08, .08, 2.2); armGeo.translate(0, 6.9, -1.05);
  const headGeo = new THREE.BoxGeometry(.35, .12, .6); headGeo.translate(0, 6.82, -2.1);
  const lampMetal = new THREE.MeshStandardMaterial({ name: 'Downhill lamp', color: '#2d3038', metalness: .7, roughness: .4 });
  const lampLight = new THREE.MeshStandardMaterial({ name: 'Downhill lamp light', color: '#fff3d6', emissive: '#ffd9a0', emissiveIntensity: 3.2 });
  const instanced = (geometry, material, name) => {
    const mesh = new THREE.InstancedMesh(geometry, material, lampPositions.length);
    mesh.name = name; mesh.castShadow = true;
    const m = new THREE.Matrix4(), q = new THREE.Quaternion();
    lampPositions.forEach((lamp, i) => mesh.setMatrixAt(i, m.compose(lamp.p, q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, lamp.yaw), new THREE.Vector3(1, 1, 1))));
    park.add(mesh);
  };
  if (lampPositions.length) {
    instanced(poleGeo, lampMetal, 'Street lamp poles');
    instanced(armGeo, lampMetal, 'Street lamp arms');
    instanced(headGeo, lampLight, 'Street lamp heads');
  }

  // Palms on the sidewalks (instanced; their leaves sway via MapDressing).
  const palmSpots = [];
  for (let si = 34, k = 0; si < sArr[count - 1] - 10; si += 31 + rand() * 18, k++) {
    const i = Math.round(si / 1.5), side = rand() < .5 ? -1 : 1;
    if (taper[i] > 0 && bankSide(i) === side) continue;
    palmSpots.push({ p: point(i, side * (W + sidewalk - 1.2), .15), yaw: rand() * Math.PI * 2, scale: .85 + rand() * .4 });
  }
  if (palmSpots.length) {
    const trunkCurve = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0, 0), new THREE.Vector3(.25, 3, 0), new THREE.Vector3(.7, 6, 0), new THREE.Vector3(1.2, 8.5, 0)]);
    const trunk = new THREE.TubeGeometry(trunkCurve, 16, .2, 7);
    const fronds = [];
    for (let k = 0; k < 9; k++) {
      const g = new THREE.PlaneGeometry(.9, 3.6, 1, 6);
      const pos = g.attributes.position;
      for (let v = 0; v < pos.count; v++) { const yy = pos.getY(v) + 1.8; pos.setXYZ(v, pos.getX(v) * (1 - yy / 4.2), 0, yy); pos.setY(v, -Math.pow(yy / 3.6, 2) * 1.4); }
      g.rotateY(k / 9 * Math.PI * 2); g.translate(1.2, 8.5, 0);
      fronds.push(g);
    }
    const frondGeo = mergeSimple(fronds);
    const bark = new THREE.MeshStandardMaterial({ name: 'Downhill palm bark', color: '#7a5f45', roughness: .95 });
    const leaf = new THREE.MeshStandardMaterial({ name: 'Downhill palm leaf', color: '#4f8f3c', roughness: .8, side: THREE.DoubleSide });
    for (const [geometry, material, name] of [[trunk, bark, 'Downhill palm trunk'], [frondGeo, leaf, 'Downhill palm leaf']]) {
      const mesh = new THREE.InstancedMesh(geometry, material, palmSpots.length);
      mesh.name = name; mesh.castShadow = true;
      const m = new THREE.Matrix4(), q = new THREE.Quaternion();
      palmSpots.forEach((palm, i) => mesh.setMatrixAt(i, m.compose(palm.p, q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, palm.yaw), new THREE.Vector3(palm.scale, palm.scale, palm.scale))));
      park.add(mesh);
    }
  }

  // Ocean at the bottom of the hill and far hills around the city.
  const end = P[count - 1];
  const ocean = new THREE.Mesh(new THREE.PlaneGeometry(9000, 9000), new THREE.MeshStandardMaterial({ name: 'Downhill ocean', color: '#1d3f63', roughness: .1, metalness: .6 }));
  ocean.rotation.x = -Math.PI / 2; ocean.position.set(end.x, end.y - 45, end.z); ocean.receiveShadow = false;
  park.add(ocean);
  const hillMat = new THREE.MeshStandardMaterial({ name: 'Downhill far hills', color: '#5b4a6e', roughness: 1, flatShading: true });
  const mid = P[Math.floor(count / 2)];
  for (let k = 0; k < 18; k++) {
    const a = k / 18 * Math.PI * 2 + rand() * .2, r = 1500 + rand() * 700;
    const hill = new THREE.Mesh(new THREE.ConeGeometry(260 + rand() * 300, 120 + rand() * 260, 6), hillMat);
    hill.position.set(mid.x + Math.cos(a) * r, mid.y - 60, mid.z + Math.sin(a) * r);
    hill.rotation.y = rand() * 3;
    park.add(hill);
  }
}

function shopfrontTexture(rand) {
  const W = 1024, H = 256, bay = W / 4, signs = ['CAFE', 'SKATE', 'TACOS', 'VINYL', 'ARCADE', 'BANANA BAR', 'SURF', 'PIZZA'];
  const kinds = Array.from({ length: 4 }, () => ({ sign: signs[Math.floor(rand() * signs.length)], glow: ['#ff3d8b', '#4fe3ff', '#ffd23f', '#8dff4f'][Math.floor(rand() * 4)] }));
  const make = layer => canvasTexture(W, H, ctx => {
    ctx.fillStyle = layer === 'surface' ? 'rgb(0,220,0)' : layer === 'emissive' ? '#000' : '#2a2630'; ctx.fillRect(0, 0, W, H);
    kinds.forEach((k, n) => {
      const x = n * bay;
      if (layer === 'map') {
        ctx.fillStyle = '#1b1a20'; ctx.fillRect(x, 0, bay, 60);
        ctx.fillStyle = '#3a3640'; ctx.fillRect(x + 4, 60, bay - 8, 8);
        const g = ctx.createLinearGradient(x, 70, x, H); g.addColorStop(0, '#5a6a80'); g.addColorStop(1, '#1d2230');
        ctx.fillStyle = g; ctx.fillRect(x + 14, 74, bay - 28, H - 84);
        ctx.fillStyle = '#e8e2d4'; ctx.fillRect(x + bay / 2 - 3, 74, 6, H - 84);
        ctx.font = '400 44px Bangers, Impact, sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = k.glow;
        ctx.fillText(k.sign, x + bay / 2, 46, bay - 30);
      } else if (layer === 'emissive') {
        ctx.font = '400 44px Bangers, Impact, sans-serif'; ctx.textAlign = 'center'; ctx.shadowColor = k.glow; ctx.shadowBlur = 16; ctx.fillStyle = k.glow;
        ctx.fillText(k.sign, x + bay / 2, 46, bay - 30); ctx.shadowBlur = 0;
        const g = ctx.createLinearGradient(x, 74, x, H); g.addColorStop(0, 'rgba(255,214,160,.85)'); g.addColorStop(1, 'rgba(120,70,30,.3)');
        ctx.fillStyle = g; ctx.fillRect(x + 18, 78, bay - 36, H - 92);
      } else { ctx.fillStyle = 'rgb(0,25,160)'; ctx.fillRect(x + 14, 74, bay - 28, H - 84); }
    });
  }, { color: layer !== 'surface' });
  return { map: make('map'), emissive: make('emissive'), surface: make('surface') };
}

function awningTexture() {
  return canvasTexture(128, 64, (ctx, w, h) => {
    for (let i = 0; i < 8; i++) { ctx.fillStyle = i % 2 ? '#ffffff' : '#bdbdbd'; ctx.fillRect(i * w / 8, 0, w / 8, h); }
    ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.fillRect(0, h - 8, w, 8);
  });
}

/** Big pole billboards advertising the crew (art drawn in once it loads). */
function buildBillboards(park, list, rand) {
  if (!list.length) return;
  const ads = [
    { line: 'GO BANANAS', sub: 'CHIMP HAWK UNDERGROUND', color: '#ffd23f', art: 'tuxr' },
    { line: 'THE HOLLOW', sub: 'SKATE OR DIE', color: '#4fe3ff', art: 'hollow' },
    { line: 'TUXR ENERGY', sub: 'THE MASTERMIND DRINK', color: '#c879ff', art: 'tuxr' },
    { line: 'HERETIC DECKS', sub: 'BUILT TO BREAK RULES', color: '#ff5a4f', art: 'heretic' },
    { line: 'ANCHOR WAX', sub: 'WIZARD-GRADE GRINDS', color: '#8dff4f', art: 'anchor' },
    { line: 'YOUNGBLOOD', sub: 'ADOLESCENT CREW', color: '#ff9a3d', art: 'adolescent' },
  ];
  const poleMat = new THREE.MeshStandardMaterial({ name: 'Downhill billboard frame', color: '#25272e', metalness: .7, roughness: .4 });
  list.forEach((board, n) => {
    const ad = ads[(n + Math.floor(rand() * ads.length)) % ads.length];
    const c = document.createElement('canvas'); c.width = 1024; c.height = 512;
    const ctx = c.getContext('2d');
    const paint = art => {
      const g = ctx.createLinearGradient(0, 0, 1024, 512); g.addColorStop(0, '#1a1030'); g.addColorStop(1, '#3a1d4f');
      ctx.fillStyle = g; ctx.fillRect(0, 0, 1024, 512);
      ctx.fillStyle = ad.color; ctx.globalAlpha = .18; ctx.beginPath(); ctx.arc(250, 256, 230, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1;
      if (art) { const h = 470, w = h * art.width / art.height; ctx.drawImage(art, 250 - w / 2, 20, w, h); }
      ctx.textAlign = 'left'; ctx.font = '400 128px Bangers, Impact, sans-serif'; ctx.fillStyle = '#fffaf0';
      ctx.shadowColor = ad.color; ctx.shadowBlur = 24; ctx.fillText(ad.line, 480, 230, 520); ctx.shadowBlur = 0;
      ctx.font = '700 46px "Barlow Condensed", Impact, sans-serif'; ctx.fillStyle = ad.color; ctx.fillText(ad.sub, 486, 300, 510);
      ctx.strokeStyle = ad.color; ctx.lineWidth = 12; ctx.strokeRect(6, 6, 1012, 500);
    };
    paint(null);
    const texture = new THREE.CanvasTexture(c); texture.colorSpace = THREE.SRGBColorSpace;
    const art = new Image(); art.decoding = 'async';
    art.onload = () => { paint(art); texture.needsUpdate = true; };
    art.src = gameAssetUrl(`/assets/rider/art/${ad.art}.webp`);
    const group = new THREE.Group(); group.name = 'Billboard';
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(13, 6.5), new THREE.MeshStandardMaterial({ name: 'Downhill billboard', map: texture, emissiveMap: texture, emissive: '#ffffff', emissiveIntensity: .55, roughness: .6 }));
    panel.position.y = 13; group.add(panel);
    const back = new THREE.Mesh(new THREE.BoxGeometry(13.6, 7.1, .4), poleMat); back.position.set(0, 13, -.25); group.add(back);
    for (const x of [-4, 4]) { const pole = new THREE.Mesh(new THREE.CylinderGeometry(.22, .3, 13, 8), poleMat); pole.position.set(x, 6.5, -.4); group.add(pole); }
    group.traverse(o => { if (o.isMesh) o.castShadow = true; });
    group.position.copy(board.p).setY(board.groundY - 1);
    group.lookAt(group.position.clone().add(board.facing));
    park.add(group);
  });
}

function mergeSimple(geometries) {
  const pos = [], nor = [], uv = [], index = [];
  let offset = 0;
  for (const g of geometries) {
    const gp = g.attributes.position, gn = g.attributes.normal, gu = g.attributes.uv;
    for (let i = 0; i < gp.count; i++) { pos.push(gp.getX(i), gp.getY(i), gp.getZ(i)); nor.push(gn.getX(i), gn.getY(i), gn.getZ(i)); uv.push(gu.getX(i), gu.getY(i)); }
    const gi = g.index ? g.index.array : [...Array(gp.count).keys()];
    for (const v of gi) index.push(v + offset);
    offset += gp.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  out.setIndex(index);
  out.computeVertexNormals();
  return out;
}

// ── Start gate at the top, tunnel mouth at the bottom ───────────────────
function buildGateAndTunnel({ park, collision, mats, point, frameAt, local, count, sArr, W, C, addMesh, stretch = 1 }) {
  const neon = (text, color) => {
    const c = document.createElement('canvas'); c.width = 1024; c.height = 192;
    const ctx = c.getContext('2d');
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = '400 130px Bangers, Impact, sans-serif';
    for (const [blur, width, style] of [[36, 12, color], [14, 7, color], [4, 4, '#ffffff']]) { ctx.shadowColor = color; ctx.shadowBlur = blur; ctx.lineWidth = width; ctx.strokeStyle = style; ctx.strokeText(text, 512, 100, 980); }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  };
  const archMetal = new THREE.MeshStandardMaterial({ name: 'Downhill gate', color: '#20222a', metalness: .7, roughness: .4 });
  const gate = (si, text, color) => {
    const f = frameAt(si), span = W + 1.2;
    for (const side of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(.4, 6, .4), archMetal);
      post.position.copy(local(f, side * span, 3, 0)); post.castShadow = true; park.add(post);
    }
    const beam = new THREE.Mesh(new THREE.BoxGeometry(span * 2 + .4, .9, .5), archMetal);
    beam.position.copy(local(f, 0, 6.2, 0)); beam.lookAt(beam.position.clone().add(f.D.clone().setY(0))); park.add(beam);
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(span * 1.9, span * 1.9 * 192 / 1024), new THREE.MeshBasicMaterial({ map: neon(text, color), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    sign.position.copy(local(f, 0, 6.2, -.3));
    sign.lookAt(sign.position.clone().sub(f.D.clone().setY(0)));
    park.add(sign);
  };
  gate(26, stretch > 1 ? `STRETCH ${stretch}` : 'DOWNHILL BOMB', stretch > 1 ? '#ffd23f' : '#ff3d8b');
  gate(sArr[count - 1] - 40, 'NEXT STRETCH →', '#4fe3ff');
  // Tunnel mouth: dark arch over the last metres; a wall deep inside stops the rider.
  const f = frameAt(sArr[count - 1] - 30);
  const tunnel = new THREE.Mesh(new THREE.BoxGeometry(2 * (W + C.sidewalk + 1.5), 9, 22), new THREE.MeshStandardMaterial({ name: 'Downhill tunnel', color: '#18181e', roughness: .9, side: THREE.BackSide }));
  tunnel.position.copy(local(f, 0, 4.4, 11)); tunnel.lookAt(tunnel.position.clone().add(f.D)); park.add(tunnel);
  const back = new THREE.Mesh(new THREE.PlaneGeometry(30, 12), mats.collision);
  back.position.copy(local(f, 0, 4, 19)); back.lookAt(back.position.clone().sub(f.D)); back.userData.surface = 'solid'; back.name = 'Tunnel end';
  collision.add(back);
}
