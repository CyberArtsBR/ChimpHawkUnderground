import * as THREE from 'three';
import { createSurfaceMaterials, surfaceTexturesReady } from './SurfaceMaterials.js';

/**
 * DOWNHILL BOMB (2026-11): a procedurally generated sunset mountain pass.
 *  - A winding road with left and right bends, banked into each turn.
 *  - The slope steepens with distance, so speed keeps building as you go.
 *  - Rounded curbs to grind, quarter-pipe banks on the outside of tight bends,
 *    and procedural kickers, fun boxes, manual pads, ledges, rails and gaps.
 *  - Forested hills, boulders, snowy mountains, a lake, roadside warning signs.
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
  const occupied = [];   // road lanes taken by features and hazards (traffic steers around them)
  const signs = [];
  const cones = [];

  // 1) Curvature plan: straights and left/right bends, eased in and out.
  const count = Math.ceil(C.length / C.step) + 1;
  const kappaRaw = new Float32Array(count);
  const bends = [];
  let s = C.startFlat + 50, sign = rand() < .5 ? 1 : -1;
  while (s < C.length - 80) {
    s += (25 + rand() * 40) * (1 - hard * .35); // straight
    const radius = (48 + rand() * 55) * (1 - hard * .2), angle = (35 + rand() * 50) * Math.PI / 180, len = radius * angle;
    if (rand() < .72) sign = -sign;
    bends.push({ s: s - 45, kind: sign > 0 ? 'right' : 'left' });
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
    sidewalk: new THREE.MeshStandardMaterial({ name: 'Downhill shoulder', map: gravelTexture(rand), bumpMap: surfaces.concrete.bumpMap, bumpScale: .03, roughness: .97 }),
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
  };
  // Procedural faces are built in several orientations: draw both sides.
  for (const key of ['sidewalk', 'kerb', 'barrier', 'bank', 'wood', 'ledge', 'planter']) mats[key].side = THREE.DoubleSide;
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
    let occLane = lane;
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
      occLane = null;
      const side = rand() < .5 ? -1 : 1, u = side * (W + 1.3), len = 8 + rand() * 4;
      box(f, u, .15 + .22, len / 2, .55, .45, len, mats.ledge, { name: 'Ledge', solid: false });
      const a = local(f, u - side * .27, .15 + .45 + .02, 0), b = local(f, u - side * .27, .15 + .45 + .02, len);
      rails.push({ name: `Ledge ${featureCount}`, points: [a.toArray(), b.toArray()], radius: .05 });
      bananaLine(fs + 1, u - side * .27, 1.3, 4, len / 4);
      bananaLine(fs + 2, free[0], .8, 4);
      used = 14 + len;
    } else if (roll < .82) {
      // Handrail along the sidewalk.
      occLane = null;
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
    if (occLane !== null) occupied.push({ s0: fs - 6, s1: fs + used + 4, u: occLane });
    featureCount++;
    fs += (used + 34 + rand() * 40 * (1.1 - Math.min(1, difficulty) * .4)) * (1 - hard * .3);
  }

  // Road hazards: oil slicks, potholes, fallen rocks, logs and road works,
  // always leaving at least one lane clear of features and hazards.
  const hazards = [];
  const laneTaken = (s0, s1, u) => occupied.some(o => Math.abs(o.u - u) < 1 && o.s1 > s0 && o.s0 < s1);
  const kinds = [['oil', .28], ['pothole', .22], ['rock', .18], ['log', .14], ['works', .18]];
  for (let hs = 150; hs < C.length - 70; hs += (34 + rand() * 46) * (1 - hard * .4)) {
    let r = rand(), kind = 'oil';
    for (const [k, w] of kinds) { if (r < w) { kind = k; break; } r -= w; }
    const free = lanes.filter(u => !laneTaken(hs - 8, hs + 8, u));
    if (free.length < 2) continue;
    const u = free[Math.floor(rand() * free.length)];
    hazards.push({ kind, s: hs, u: u + (rand() - .5) * 1.2, yaw: rand() * 6.3 });
    occupied.push({ s0: hs - 5, s1: hs + 5, u });
    if (kind === 'rock' && rand() < .6) signs.push({ s: hs - 60, kind: 'rocks' });
    if (kind === 'oil' && rand() < .4) signs.push({ s: hs - 60, kind: 'slippery' });
  }
  // Checkpoint arches every 400 m: a score bonus.
  const checkpoints = [];
  for (let cs = 320; cs < C.length - 120; cs += 400) checkpoints.push(cs);

  // 7) Mountain pass scenery.
  for (const b of bends) if (b.s > 60) signs.push(b);
  buildWilderness({ park, rand, count, P, L, N, theta, sArr, kappa, W, sidewalk: C.sidewalk, signs });

  // 8) Start platform gate and the tunnel at the bottom.
  buildGateAndTunnel({ park, collision, mats, point, frameAt, local, count, sArr, W, C, addMesh, stretch, checkpoints });

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
      bananas, cones, hazards, occupied, checkpoints,
      laterals: L.map(v => v.toArray()), normals: N.map(v => v.toArray()),
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
// ── Mountain pass: forested hills, boulders, mountains, a lake, road signs ─
function grassTexture(rand) {
  return canvasTexture(512, 512, (ctx, w, h) => {
    ctx.fillStyle = '#4c5e33'; ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 30000; i++) {
      ctx.fillStyle = ['#435530', '#56693a', '#5f6b3c', '#3d4a2a', '#6b6a44', '#4a4433'][Math.floor(rand() * 6)];
      ctx.fillRect(rand() * w, rand() * h, 1 + rand() * 3, 1 + rand() * 3);
    }
    for (let i = 0; i < 40; i++) {
      const x = rand() * w, y = rand() * h, r = 10 + rand() * 40;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, 'rgba(90,70,45,.35)'); g.addColorStop(1, 'rgba(90,70,45,0)');
      ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
  });
}

function gravelTexture(rand) {
  return canvasTexture(256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#5b5751'; ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 16000; i++) {
      ctx.fillStyle = ['#4a4742', '#6b665e', '#77716a', '#3f3c38', '#5f5a50'][Math.floor(rand() * 5)];
      ctx.fillRect(rand() * w, rand() * h, 1 + rand() * 2, 1 + rand() * 2);
    }
  });
}

function signTexture(kind) {
  return canvasTexture(256, 256, (ctx, w, h) => {
    ctx.translate(w / 2, h / 2); ctx.rotate(Math.PI / 4);
    ctx.fillStyle = '#1a1a1a'; ctx.fillRect(-92, -92, 184, 184);
    ctx.fillStyle = '#ffcf1f'; ctx.fillRect(-84, -84, 168, 168);
    ctx.rotate(-Math.PI / 4);
    ctx.fillStyle = '#141414'; ctx.strokeStyle = '#141414'; ctx.lineWidth = 16; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    if (kind === 'left' || kind === 'right') {
      const s = kind === 'left' ? -1 : 1;
      ctx.beginPath(); ctx.moveTo(-10 * s, 60); ctx.lineTo(-10 * s, 0); ctx.quadraticCurveTo(-10 * s, -30, 20 * s, -30); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(14 * s, -58); ctx.lineTo(52 * s, -30); ctx.lineTo(14 * s, -2); ctx.closePath(); ctx.fill();
    } else if (kind === 'rocks') {
      ctx.beginPath(); ctx.moveTo(-60, 60); ctx.lineTo(-60, -40); ctx.lineTo(10, 60); ctx.closePath(); ctx.fill();
      for (const [x, y, r] of [[20, -30, 12], [36, 6, 10], [50, 40, 14]]) { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); }
    } else {
      // Slippery road: a skidding car.
      ctx.fillRect(-26, -40, 52, 34); ctx.lineWidth = 8;
      for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(s * 14, 4); ctx.bezierCurveTo(s * 40, 24, s * -10, 40, s * 22, 64); ctx.stroke(); }
    }
  }, { repeat: false });
}

function buildWilderness({ park, rand, count, P, L, N, theta, sArr, kappa, W, sidewalk, signs }) {
  const out = W + sidewalk + .3;
  const clampN = (v, a, b) => Math.max(a, Math.min(b, v));
  const rightOf = i => new THREE.Vector3(Math.cos(theta[i]), 0, -Math.sin(theta[i]));
  const reach = (i, side) => (kappa[i] > 0 ? 1 : -1) === side && Math.abs(kappa[i]) > 1e-4
    ? clampN(1 / Math.abs(kappa[i]) - out - 6, 6, 72) : 72;
  const rise = (i, d, side) => d < 3 ? -d * .08
    : -.24 + Math.pow((d - 3) / 69, 1.25) * (17 + 9 * Math.sin(i * .021 + side * 1.7) + 4 * Math.sin(i * .087 + side));
  const ground = (i, side, d) => P[i].clone().addScaledVector(L[i], side * (out + .6)).addScaledVector(N[i], .15)
    .addScaledVector(rightOf(i), side * Math.max(0, d - .6)).add(new THREE.Vector3(0, rise(i, d, side), 0));

  // Terrain ribbons (visual only).
  const grass = new THREE.MeshStandardMaterial({ name: 'Downhill forest floor', map: grassTexture(rand), roughness: .97, side: THREE.DoubleSide });
  const columns = [.6, 3, 8, 16, 28, 44, 72];
  const CH = 60;
  for (const side of [-1, 1]) for (let i0 = 0; i0 < count - 1; i0 += CH) {
    const i1 = Math.min(count - 1, i0 + CH), pos = [], uv = [], index = [];
    for (let i = i0; i <= i1; i++) for (const d0 of columns) {
      const d = Math.min(d0, reach(i, side)), p = ground(i, side, d);
      pos.push(p.x, p.y, p.z); uv.push(d / 8, sArr[i] / 8);
    }
    const cols = columns.length;
    for (let r = 0; r < i1 - i0; r++) for (let j = 0; j < cols - 1; j++) { const a = r * cols + j, b = a + cols; index.push(a, a + 1, b, a + 1, b + 1, b); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(index); g.computeVertexNormals();
    const mesh = new THREE.Mesh(g, grass); mesh.name = 'Forest hills'; mesh.receiveShadow = true;
    park.add(mesh);
  }

  // Trees: pines and autumn broadleaf trees (instanced, coloured per tree).
  const pineParts = [new THREE.CylinderGeometry(.14, .24, 2.6, 6).translate(0, 1.3, 0)];
  for (const [r, h, y] of [[1.9, 3, 2.6], [1.5, 2.7, 4.2], [1.05, 2.4, 5.7], [.6, 1.8, 7]]) pineParts.push(new THREE.ConeGeometry(r, h, 8).translate(0, y + h / 2 - .4, 0));
  const pineGeo = mergeSimple(pineParts);
  const roundParts = [new THREE.CylinderGeometry(.16, .26, 3, 6).translate(0, 1.5, 0), new THREE.IcosahedronGeometry(2.2, 1).translate(0, 4.6, 0), new THREE.IcosahedronGeometry(1.5, 1).translate(.9, 5.6, .4)];
  const roundGeo = mergeSimple(roundParts);
  // Vertex colours: trunk brown, foliage white (tinted per instance).
  const paintTrunk = (geometry, trunkTop) => {
    const p = geometry.attributes.position, c = new Float32Array(p.count * 3);
    for (let k = 0; k < p.count; k++) { const trunk = p.getY(k) < trunkTop && Math.hypot(p.getX(k), p.getZ(k)) < .3; c.set(trunk ? [.32, .22, .14] : [1, 1, 1], k * 3); }
    geometry.setAttribute('color', new THREE.BufferAttribute(c, 3));
  };
  paintTrunk(pineGeo, 2.3); paintTrunk(roundGeo, 2.9);
  const foliage = new THREE.MeshStandardMaterial({ name: 'Downhill trees', vertexColors: true, roughness: .9, flatShading: true });
  const pines = [], rounds = [];
  for (let n = 0; n < count * 1.25; n++) {
    const i = Math.floor(rand() * count), side = rand() < .5 ? -1 : 1;
    const max = reach(i, side);
    const d = 5 + Math.pow(rand(), 1.3) * (max - 5);
    if (d > max) continue;
    (rand() < .72 ? pines : rounds).push({ p: ground(i, side, d), s: .75 + rand() * .85, yaw: rand() * 6.3 });
  }
  const forest = (list, geometry, palette, name) => {
    if (!list.length) return;
    const mesh = new THREE.InstancedMesh(geometry, foliage, list.length);
    mesh.name = name; mesh.castShadow = true; mesh.receiveShadow = true;
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), c = new THREE.Color();
    list.forEach((t, k) => {
      mesh.setMatrixAt(k, m.compose(t.p, q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, t.yaw), new THREE.Vector3(t.s, t.s * (.9 + rand() * .3), t.s)));
      mesh.setColorAt(k, c.set(palette[Math.floor(rand() * palette.length)]));
    });
    park.add(mesh);
  };
  forest(pines, pineGeo, ['#2f5a34', '#2a4f30', '#3a6a3a', '#24452b', '#3f5f33'], 'Pine trees');
  forest(rounds, roundGeo, ['#c8632b', '#d9902f', '#a8432a', '#6f8a35', '#b9762e'], 'Autumn trees');

  // Boulders scattered in the forest.
  const rocks = [];
  for (let n = 0; n < count * .25; n++) {
    const i = Math.floor(rand() * count), side = rand() < .5 ? -1 : 1, max = reach(i, side), d = 4 + rand() * (max - 4);
    rocks.push({ p: ground(i, side, d), s: .5 + rand() * 1.8 });
  }
  if (rocks.length) {
    const mesh = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1, 0), new THREE.MeshStandardMaterial({ name: 'Downhill boulders', color: '#7d7a73', roughness: .95, flatShading: true }), rocks.length);
    mesh.name = 'Boulders'; mesh.castShadow = true; mesh.receiveShadow = true;
    const m = new THREE.Matrix4(), q = new THREE.Quaternion();
    rocks.forEach((r, k) => mesh.setMatrixAt(k, m.compose(r.p, q.setFromEuler(new THREE.Euler(rand() * 3, rand() * 3, rand() * 3)), new THREE.Vector3(r.s * 1.3, r.s * .8, r.s))));
    park.add(mesh);
  }

  // Road signs on the right shoulder: bend warnings, falling rocks, slippery road.
  const post = new THREE.MeshStandardMaterial({ name: 'Downhill sign post', color: '#8c9096', metalness: .7, roughness: .4 });
  const textures = {};
  for (const sign of signs) {
    const f = Math.max(0, Math.min(count - 1, Math.round(sign.s / 1.5)));
    const p = P[f].clone().addScaledVector(L[f], W + sidewalk - .6).addScaledVector(N[f], .15);
    const group = new THREE.Group(); group.name = 'Road sign';
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(.05, .05, 2.4, 6), post); pole.position.y = 1.2; group.add(pole);
    textures[sign.kind] ||= signTexture(sign.kind);
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 1.3), new THREE.MeshStandardMaterial({ name: 'Downhill sign', map: textures[sign.kind], transparent: true, alphaTest: .4, roughness: .45 }));
    panel.position.y = 2.6; group.add(panel);
    group.traverse(o => { if (o.isMesh) o.castShadow = true; });
    group.position.copy(p);
    const facing = new THREE.Vector3(Math.sin(theta[f]), 0, Math.cos(theta[f])); // back up the hill
    group.lookAt(group.position.clone().add(facing));
    park.add(group);
  }

  // Mountains in three hazy layers, snow on the high ones.
  const mid = P[Math.floor(count / 2)], low = Math.min(...P.map(p => p.y));
  const mountain = (radius, height, snowy, color) => {
    const g = new THREE.ConeGeometry(radius, height, 9, 5);
    const p = g.attributes.position, c = new Float32Array(p.count * 3), base = new THREE.Color(color), snow = new THREE.Color('#f4f1f8');
    for (let k = 0; k < p.count; k++) {
      const y = p.getY(k) / height + .5;
      if (y < .98) { const wob = 1 + (rand() - .5) * .22; p.setX(k, p.getX(k) * wob); p.setZ(k, p.getZ(k) * wob); }
      const col = snowy && y > .62 + rand() * .08 ? snow : base;
      c.set([col.r, col.g, col.b], k * 3);
    }
    g.setAttribute('color', new THREE.BufferAttribute(c, 3)); g.computeVertexNormals();
    return g;
  };
  const rockMat = new THREE.MeshStandardMaterial({ name: 'Downhill mountains', vertexColors: true, roughness: 1, flatShading: true });
  for (const [n, rMin, rMax, hMin, hMax, snowy, color] of [
    [14, 700, 1200, 180, 380, false, '#3f5a3c'],
    [16, 1300, 2000, 420, 820, true, '#6b6478'],
    [18, 2300, 3300, 700, 1300, true, '#8d86a0'],
  ]) {
    for (let k = 0; k < n; k++) {
      const a = k / n * Math.PI * 2 + rand() * .3, r = rMin + rand() * (rMax - rMin), h = hMin + rand() * (hMax - hMin);
      const m = new THREE.Mesh(mountain(h * (1.1 + rand() * .6), h, snowy, color), rockMat);
      m.position.set(mid.x + Math.cos(a) * r, low - 60 + h / 2, mid.z + Math.sin(a) * r);
      m.rotation.y = rand() * 3;
      park.add(m);
    }
  }
  // A lake down in the valley.
  const end = P[count - 1];
  const lake = new THREE.Mesh(new THREE.PlaneGeometry(9000, 9000), new THREE.MeshStandardMaterial({ name: 'Downhill lake', color: '#2b5a6e', roughness: .08, metalness: .6 }));
  lake.rotation.x = -Math.PI / 2; lake.position.set(end.x, low - 40, end.z);
  park.add(lake);
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
function buildGateAndTunnel({ park, collision, mats, point, frameAt, local, count, sArr, W, C, addMesh, stretch = 1, checkpoints = [] }) {
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
  for (const cs of checkpoints) gate(cs, 'CHECKPOINT', '#8dff4f');
  // Tunnel mouth: dark arch over the last metres; a wall deep inside stops the rider.
  const f = frameAt(sArr[count - 1] - 30);
  const tunnel = new THREE.Mesh(new THREE.BoxGeometry(2 * (W + C.sidewalk + 1.5), 9, 22), new THREE.MeshStandardMaterial({ name: 'Downhill tunnel', color: '#18181e', roughness: .9, side: THREE.BackSide }));
  tunnel.position.copy(local(f, 0, 4.4, 11)); tunnel.lookAt(tunnel.position.clone().add(f.D)); park.add(tunnel);
  const back = new THREE.Mesh(new THREE.PlaneGeometry(30, 12), mats.collision);
  back.position.copy(local(f, 0, 4, 19)); back.lookAt(back.position.clone().sub(f.D)); back.userData.surface = 'solid'; back.name = 'Tunnel end';
  collision.add(back);
}
