import * as THREE from 'three';
import { spreadPick } from './MapScan.js';

/**
 * Extra map detail (2026-11 visual pass). Presentation only: no collision and
 * no physics. Spots come from MapScan (flat walls, quiet floor by the walls,
 * clear of rails and the spawn), seeded per map.
 *  - ORBIT: lit edge trims along the ramps and boxes, stencilled bay numbers.
 *  - GRAND WAREHOUSE: posters, crate stacks on pallets, benches, and an open
 *    roller door with daylight spilling across the floor.
 */
const canvas2d = (w, h) => {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  return ctx ? { c, ctx } : null;
};
const toTexture = c => { const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; };
const Z = new THREE.Vector3(0, 0, 1);

function faceWall(object, normal) {
  object.quaternion.setFromUnitVectors(Z, normal.clone().setY(0).normalize());
}

// ── ORBIT ────────────────────────────────────────────────────────────────
const TRIM_MATERIALS = new Set(['Ceramic / pearl transition', 'Panel / satin slate blue', 'Foundry_Plywood', 'Foundry_Dark_Timber']);

/** Thin lit strips along the hard edges of Orbit's ramps and boxes. */
export function buildEdgeTrims(park, floorY = 0) {
  const segments = [];
  const a = new THREE.Vector3(), b = new THREE.Vector3();
  park.updateMatrixWorld(true);
  park.traverse(o => {
    if (!o.isMesh || ![].concat(o.material).some(m => TRIM_MATERIALS.has(String(m?.name || '').replace(/\.\d+$/, '')))) return;
    const edges = new THREE.EdgesGeometry(o.geometry, 35);
    const p = edges.attributes.position;
    for (let i = 0; i < p.count; i += 2) {
      a.fromBufferAttribute(p, i).applyMatrix4(o.matrixWorld);
      b.fromBufferAttribute(p, i + 1).applyMatrix4(o.matrixWorld);
      if (a.distanceTo(b) < .05) continue;
      if (a.y < floorY + .06 && b.y < floorY + .06) continue; // skip outlines on the ground
      segments.push(a.clone(), b.clone());
    }
    edges.dispose();
  });
  if (!segments.length) return null;
  const count = segments.length / 2;
  const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshBasicMaterial({ color: '#7fe6ff', toneMapped: false }), count);
  mesh.name = 'Orbit edge trims';
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), mid = new THREE.Vector3(), dir = new THREE.Vector3();
  for (let i = 0; i < count; i++) {
    const p0 = segments[i * 2], p1 = segments[i * 2 + 1];
    dir.subVectors(p1, p0); const len = dir.length(); dir.normalize();
    q.setFromUnitVectors(Z, dir);
    mid.addVectors(p0, p1).multiplyScalar(.5);
    mesh.setMatrixAt(i, m.compose(mid, q, s.set(.035, .035, len + .02)));
  }
  mesh.frustumCulled = false;
  return mesh;
}

function stencilTexture(number) {
  const canvas = canvas2d(512, 320);
  if (!canvas) return null;
  const { c, ctx } = canvas;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = '400 210px Impact, "Arial Black", sans-serif';
  // Overspray, then the crisp stencil, then stencil bridges cut through it.
  ctx.filter = 'blur(6px)'; ctx.fillStyle = 'rgba(232,244,255,.35)'; ctx.fillText(number, 256, 150);
  ctx.filter = 'none'; ctx.fillStyle = 'rgba(236,246,255,.92)'; ctx.fillText(number, 256, 150);
  ctx.globalCompositeOperation = 'destination-out';
  for (const x of [200, 318]) ctx.fillRect(x, 40, 9, 230);
  ctx.fillRect(120, 146, 280, 8);
  for (let i = 0; i < 260; i++) { ctx.globalAlpha = Math.random() * .5; ctx.fillRect(Math.random() * 512, Math.random() * 320, 2 + Math.random() * 5, 2 + Math.random() * 3); }
  ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  ctx.font = '400 40px Impact, "Arial Black", sans-serif'; ctx.fillStyle = 'rgba(255,176,60,.9)';
  ctx.fillText('BAY', 256, 286);
  ctx.fillStyle = 'rgba(255,176,60,.85)';
  for (const x of [120, 392]) { ctx.beginPath(); ctx.moveTo(x - 22, 270); ctx.lineTo(x + 22, 270); ctx.lineTo(x, 300); ctx.closePath(); ctx.fill(); }
  return toTexture(c);
}

export function buildOrbitDetail(root, world, scan, rand, floorY) {
  const trims = buildEdgeTrims(world.park, floorY);
  if (trims) root.add(trims);
  const walls = spreadPick(scan.walls.filter(w => w.width >= 2.4), 8, 11, rand);
  walls.forEach((wall, i) => {
    const texture = stencilTexture(String(i + 1).padStart(2, '0'));
    if (!texture) return;
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1.25, .78), new THREE.MeshStandardMaterial({
      map: texture, transparent: true, roughness: .8, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3,
    }));
    mesh.name = 'Orbit bay stencil';
    faceWall(mesh, wall.normal);
    mesh.position.copy(wall.point).setY(wall.groundY + .85).addScaledVector(wall.normal, .03);
    root.add(mesh);
  });
  return { trims: trims ? trims.count : 0, stencils: walls.length };
}

// ── GRAND WAREHOUSE ─────────────────────────────────────────────────────
const POSTERS = [
  { bg: '#ff3d8b', ink: '#141020', title: 'LATE SESSION', sub: 'FRI · 9PM · BRING BANANAS', art: '/assets/rider/art/hollow.webp' },
  { bg: '#ffd23f', ink: '#141020', title: 'CHIMP HAWK', sub: 'UNDERGROUND SKATE JAM', art: '/assets/rider/art/heretic.webp' },
  { bg: '#4fe3ff', ink: '#0d1830', title: 'BEST TRICK', sub: 'CASH FOR TRIPLES', art: '/assets/rider/art/adolescent.webp' },
  { bg: '#8dff4f', ink: '#102010', title: 'GO BANANAS', sub: 'ALL AGES · ALL DAY', art: '/assets/rider/art/anchor.webp' },
  { bg: '#c879ff', ink: '#1a0c26', title: 'THE MASTERMIND', sub: 'NEW PART OUT NOW', art: '/assets/rider/art/tuxr.webp' },
  { bg: '#f5efe2', ink: '#1b1b1b', title: 'NO SKATING', sub: '(SERIOUSLY THOUGH)', art: null },
];

function posterTexture(spec) {
  const canvas = canvas2d(512, 724);
  if (!canvas) return null;
  const { c, ctx } = canvas;
  const draw = image => {
    ctx.fillStyle = spec.bg; ctx.fillRect(0, 0, 512, 724);
    // Halftone dots for a printed look.
    ctx.fillStyle = 'rgba(0,0,0,.08)';
    for (let y = 8; y < 724; y += 16) for (let x = (y / 16 % 2) * 8; x < 512; x += 16) { ctx.beginPath(); ctx.arc(x, y, 3, 0, 7); ctx.fill(); }
    if (image) {
      const s = Math.min(420 / image.width, 430 / image.height);
      ctx.drawImage(image, 256 - image.width * s / 2, 150, image.width * s, image.height * s);
    } else {
      ctx.strokeStyle = spec.ink; ctx.lineWidth = 26; ctx.beginPath(); ctx.arc(256, 360, 150, 0, 7); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(150, 466); ctx.lineTo(362, 254); ctx.stroke();
    }
    ctx.textAlign = 'center'; ctx.fillStyle = spec.ink;
    ctx.font = '400 92px Bangers, Impact, sans-serif'; ctx.fillText(spec.title, 256, 112, 470);
    ctx.font = '400 40px Bangers, Impact, sans-serif'; ctx.fillText(spec.sub, 256, 664, 470);
    // Tape on the corners and a little wear.
    ctx.fillStyle = 'rgba(240,232,200,.75)';
    for (const [x, y, r] of [[30, 20, -.5], [482, 20, .5], [30, 704, .5], [482, 704, -.5]]) { ctx.save(); ctx.translate(x, y); ctx.rotate(r); ctx.fillRect(-40, -12, 80, 24); ctx.restore(); }
    ctx.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < 90; i++) { ctx.globalAlpha = Math.random() * .4; ctx.fillRect(Math.random() * 512, Math.random() * 724, 3 + Math.random() * 10, 2 + Math.random() * 4); }
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  };
  draw(null);
  const texture = toTexture(c);
  if (spec.art && typeof Image !== 'undefined') {
    const image = new Image();
    image.onload = () => { draw(image); texture.needsUpdate = true; };
    image.src = spec.art;
  }
  return texture;
}

function crateTexture(label) {
  const canvas = canvas2d(256, 256);
  if (!canvas) return null;
  const { c, ctx } = canvas;
  ctx.fillStyle = '#9c7446'; ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 5; i++) {
    ctx.fillStyle = `hsl(32, ${38 + i * 3}%, ${36 + (i % 2) * 6}%)`; ctx.fillRect(0, i * 51 + 2, 256, 47);
    ctx.strokeStyle = 'rgba(60,36,16,.35)'; ctx.lineWidth = 1;
    for (let k = 0; k < 9; k++) { ctx.beginPath(); ctx.moveTo(0, i * 51 + 6 + k * 5); ctx.bezierCurveTo(80, i * 51 + 3 + k * 5, 170, i * 51 + 9 + k * 5, 256, i * 51 + 5 + k * 5); ctx.stroke(); }
  }
  ctx.fillStyle = '#6b4a28'; ctx.fillRect(0, 0, 256, 18); ctx.fillRect(0, 238, 256, 18); ctx.fillRect(0, 0, 18, 256); ctx.fillRect(238, 0, 18, 256);
  ctx.font = '400 34px Impact, sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = 'rgba(25,18,12,.75)'; ctx.fillText(label, 128, 140);
  return toTexture(c);
}

function rollerTexture() {
  const canvas = canvas2d(64, 256);
  if (!canvas) return null;
  const { c, ctx } = canvas;
  for (let y = 0; y < 256; y += 16) {
    const g = ctx.createLinearGradient(0, y, 0, y + 16);
    g.addColorStop(0, '#9aa1a8'); g.addColorStop(.5, '#6c737b'); g.addColorStop(1, '#3d4248');
    ctx.fillStyle = g; ctx.fillRect(0, y, 64, 16);
  }
  const t = toTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
}

function daylightTexture() {
  const canvas = canvas2d(64, 256);
  if (!canvas) return null;
  const { c, ctx } = canvas;
  const g = ctx.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, '#dff1ff'); g.addColorStop(.55, '#fffaf0'); g.addColorStop(.62, '#fff1d6'); g.addColorStop(1, '#d9d2c4');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 64, 256);
  return toTexture(c);
}

function fadeTexture() {
  const canvas = canvas2d(64, 256);
  if (!canvas) return null;
  const { c, ctx } = canvas;
  const g = ctx.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(.35, 'rgba(255,255,255,.55)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 64, 256);
  // Soft side edges so the light patch has no hard rectangle.
  const img = ctx.getImageData(0, 0, 64, 256);
  for (let y = 0; y < 256; y++) for (let x = 0; x < 64; x++) {
    const e = Math.min(1, Math.min(x, 63 - x) / 14), i = (y * 64 + x) * 4 + 3;
    img.data[i] = img.data[i] * e;
  }
  ctx.putImageData(img, 0, 0);
  return toTexture(c);
}

function buildRollerDoor(root, wall) {
  const group = new THREE.Group();
  group.name = 'Roller door';
  const width = Math.min(3.4, wall.width), open = 2.5, top = 3.7;
  const day = new THREE.Mesh(new THREE.PlaneGeometry(width, open), new THREE.MeshBasicMaterial({ map: daylightTexture(), toneMapped: false, fog: false }));
  day.position.set(0, open / 2, .02);
  const door = new THREE.Mesh(new THREE.PlaneGeometry(width, top - open), new THREE.MeshStandardMaterial({ map: rollerTexture(), metalness: .6, roughness: .5 }));
  door.material.map && door.material.map.repeat.set(1, (top - open) / 1.1);
  door.position.set(0, open + (top - open) / 2, .04);
  const frameMat = new THREE.MeshStandardMaterial({ color: '#25282d', metalness: .7, roughness: .45 });
  const sideL = new THREE.Mesh(new THREE.BoxGeometry(.16, top, .16), frameMat), sideR = sideL.clone();
  sideL.position.set(-width / 2 - .08, top / 2, .08); sideR.position.set(width / 2 + .08, top / 2, .08);
  const header = new THREE.Mesh(new THREE.BoxGeometry(width + .32, .24, .3), frameMat);
  header.position.set(0, top + .1, .15);
  const bottomEdge = new THREE.Mesh(new THREE.BoxGeometry(width, .08, .1), frameMat);
  bottomEdge.position.set(0, open, .06);
  // Daylight on the floor and a faint dusty shaft.
  const fade = fadeTexture();
  const patch = new THREE.Mesh(new THREE.PlaneGeometry(width * 1.15, 8), new THREE.MeshBasicMaterial({
    map: fade, color: '#ffe6c4', transparent: true, opacity: .55, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, fog: false,
    polygonOffset: true, polygonOffsetFactor: -4 }));
  patch.rotation.x = -Math.PI / 2; patch.position.set(0, .03, 4);
  const shaft = new THREE.Mesh(new THREE.PlaneGeometry(width * 1.1, Math.hypot(open, 7)), new THREE.MeshBasicMaterial({
    map: fade, color: '#fff0d8', transparent: true, opacity: .1, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, side: THREE.DoubleSide }));
  shaft.position.set(0, open / 2, 3.5); shaft.rotation.x = -Math.atan2(7, open) ;
  group.add(day, door, sideL, sideR, header, bottomEdge, patch, shaft);
  faceWall(group, wall.normal);
  group.position.copy(wall.point).setY(wall.groundY);
  root.add(group);
}

function buildCrates(root, spot, rand, materials) {
  const group = new THREE.Group();
  group.name = 'Crate stack';
  const pallet = new THREE.Mesh(new THREE.BoxGeometry(1.25, .14, 1.05), materials.pallet);
  pallet.position.y = .07;
  group.add(pallet);
  const n = 2 + Math.floor(rand() * 3);
  for (let i = 0; i < n; i++) {
    const size = .62 + rand() * .2;
    const crate = new THREE.Mesh(new THREE.BoxGeometry(size, size, size), materials.crates[Math.floor(rand() * materials.crates.length)]);
    const level = i < 2 ? 0 : 1;
    crate.position.set(level ? (rand() - .5) * .2 : (i ? .3 : -.3), .14 + size / 2 + level * .72, (rand() - .5) * .2);
    crate.rotation.y = (rand() - .5) * .3;
    crate.castShadow = crate.receiveShadow = true;
    group.add(crate);
  }
  faceWall(group, spot.facing);
  group.position.copy(spot.point).addScaledVector(spot.facing, -.3);
  root.add(group);
}

function buildBench(root, spot, materials) {
  const group = new THREE.Group();
  group.name = 'Bench';
  const seat = new THREE.Mesh(new THREE.BoxGeometry(1.8, .06, .4), materials.wood);
  seat.position.y = .45;
  const back = new THREE.Mesh(new THREE.BoxGeometry(1.8, .3, .05), materials.wood);
  back.position.set(0, .78, -.18); back.rotation.x = -.12;
  group.add(seat, back);
  for (const x of [-.75, .75]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(.05, .45, .38), materials.steel);
    leg.position.set(x, .225, 0);
    const post = new THREE.Mesh(new THREE.BoxGeometry(.05, .42, .05), materials.steel);
    post.position.set(x, .66, -.17);
    group.add(leg, post);
  }
  group.traverse(o => { if (o.isMesh) o.castShadow = o.receiveShadow = true; });
  faceWall(group, spot.facing);
  group.position.copy(spot.point).addScaledVector(spot.facing, -.15);
  root.add(group);
}

export function buildWarehouseProps(root, scan, rand, avoid = []) {
  const clear = p => avoid.every(q => q.distanceTo(p) > 3.5);
  // Roller door on the widest tall wall, posters on other walls.
  const tall = scan.walls.filter(w => w.tall && w.width >= 3.4);
  const doorWall = spreadPick(tall, 1, 0, rand)[0];
  if (doorWall) buildRollerDoor(root, doorWall);
  const posterWalls = spreadPick(scan.walls.filter(w => w !== doorWall && (!doorWall || w.point.distanceTo(doorWall.point) > 6)), 7, 7, rand);
  posterWalls.forEach((wall, i) => {
    const spec = POSTERS[i % POSTERS.length];
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(.9, 1.27), new THREE.MeshStandardMaterial({
      map: posterTexture(spec), roughness: .85, transparent: true, polygonOffset: true, polygonOffsetFactor: -3, depthWrite: false }));
    mesh.name = 'Poster';
    faceWall(mesh, wall.normal);
    mesh.rotateZ((rand() - .5) * .08);
    mesh.position.copy(wall.point).setY(wall.groundY + 1.65 + (rand() - .5) * .2).addScaledVector(wall.normal, .025);
    root.add(mesh);
  });
  const materials = {
    pallet: new THREE.MeshStandardMaterial({ map: crateTexture(''), roughness: .9 }),
    crates: ['CHIMP CO.', 'FRAGILE', 'BANANAS', 'WHEELS'].map(label => new THREE.MeshStandardMaterial({ map: crateTexture(label), roughness: .85 })),
    wood: new THREE.MeshStandardMaterial({ map: crateTexture(''), roughness: .7 }),
    steel: new THREE.MeshStandardMaterial({ color: '#2d3136', metalness: .7, roughness: .45 }),
  };
  const spots = scan.edges.filter(e => clear(e.point) && (!doorWall || e.point.distanceTo(doorWall.point) > 7));
  const crates = spreadPick(spots, 5, 14, rand);
  for (const spot of crates) buildCrates(root, spot, rand, materials);
  const benches = spreadPick(spots.filter(s => crates.every(c => c.point.distanceTo(s.point) > 6)), 4, 15, rand);
  for (const spot of benches) buildBench(root, spot, materials);
  return { door: Boolean(doorWall), posters: posterWalls.length, crates: crates.length, benches: benches.length };
}
