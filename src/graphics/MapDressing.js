import * as THREE from 'three';
import { scanMap, seededRandom, spreadPick } from './MapScan.js';
import { buildOrbitDetail, buildWarehouseProps } from './MapDetail.js';

/**
 * Map dressing (2026-11 enhancement pass). Presentation only: no collision,
 * no physics. Placed by MapScan on visible walls and quiet floor spots by the
 * edges, seeded per map so the layout is the same every visit.
 *  - Neon signs (with the odd flicker) and swaying string lights on poles.
 *  - Flags that wave, and the palm trees' leaves swaying in the wind.
 * (Graffiti, crew spectators and street props were tried and removed by request.)
 */
const NO_FLAGS = new Set(['skate-paradise', 'grand-warehouse']);
export const DRESSING = Object.freeze({
  signs: 4, strings: 3, flags: 4,
  signTexts: ['CHIMP HAWK', 'GO BANANAS', 'SKATE OR DIE', 'UNDERGROUND'],
});

const neonColors = ['#ff3d8b', '#4fe3ff', '#ffd23f', '#8dff4f', '#c879ff'];
const UP = new THREE.Vector3(0, 1, 0);
const canvas2d = (w, h) => {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  return ctx ? { c, ctx } : null;
};
const toTexture = c => { const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; };

function neonTexture(text, color) {
  const canvas = canvas2d(1024, 256);
  if (!canvas) return null;
  const { c, ctx } = canvas;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = '400 150px Bangers, Impact, sans-serif';
  ctx.lineJoin = 'round';
  for (const [blur, width, style] of [[40, 14, color], [18, 9, color], [6, 5, '#ffffff']]) {
    ctx.shadowColor = color; ctx.shadowBlur = blur; ctx.lineWidth = width; ctx.strokeStyle = style;
    ctx.strokeText(text, 512, 132, 960);
  }
  return toTexture(c);
}

function flagTexture(color, rand) {
  const canvas = canvas2d(512, 320);
  if (!canvas) return null;
  const { c, ctx } = canvas;
  ctx.fillStyle = color; ctx.fillRect(0, 0, 512, 320);
  ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.fillRect(0, 250, 512, 70);
  ctx.fillStyle = '#141020';
  ctx.beginPath(); ctx.moveTo(176, 170); ctx.lineTo(160, 70); ctx.lineTo(214, 120); ctx.lineTo(256, 50); ctx.lineTo(298, 120); ctx.lineTo(352, 70); ctx.lineTo(336, 170); ctx.closePath(); ctx.fill();
  ctx.font = '400 54px Bangers, Impact, sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = '#fffaf0';
  ctx.fillText(rand() < .5 ? 'CHIMP HAWK' : 'UNDERGROUND', 256, 230);
  return toTexture(c);
}

function glowTexture() {
  const canvas = canvas2d(64, 64);
  if (!canvas) return null;
  const { c, ctx } = canvas;
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(.3, 'rgba(255,255,255,.55)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 64, 64);
  return toTexture(c);
}

/** Orient a flat plane (+Z facing) onto a wall with a small roll. */
function placeOnWall(mesh, point, normal, roll = 0, lift = .03) {
  mesh.position.copy(point).addScaledVector(normal, lift);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);
  mesh.rotateZ(roll);
}

/**
 * Glow sprites keep a sane on-screen size: they shrink and fade as the camera
 * gets close instead of turning into screen-filling blobs.
 */
export function glowScaleForDistance(distance) {
  if (!(distance > 0)) return 0;
  if (distance < 2.5) return 0;
  return Math.min(1, (distance - 2.5) / 5);
}

const PENDANT_MATERIAL = /^Foundry_Warm_Lights/i;
const PERCH_OFFSET = .4; // m from the pendant's centre: near the shade's rim, clear of its rod

/**
 * Perches on top of the Grand Warehouse model's pendant lamps (its 20 red
 * pendants, material Foundry_Warm_Lights, merged in one roof batch). Each
 * pendant is a world-space cluster of that material's triangles; the perch
 * sits on the shade top near the rim on the side facing the middle of the
 * hall (so a bird there shows from the floor, past the shade), measured with a
 * downward ray against `meshes` (the scan's visual meshes). Returns [] when
 * there are none.
 */
export function findPendantPerches(park, meshes = []) {
  const clusters = [];
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  park?.updateMatrixWorld?.(true);
  park?.traverse?.(mesh => {
    if (!mesh.isMesh || mesh.isInstancedMesh || !mesh.visible) return;
    const materials = [].concat(mesh.material);
    if (!materials.some(m => PENDANT_MATERIAL.test(m?.name || ''))) return;
    const position = mesh.geometry?.attributes?.position;
    if (!position) return;
    const index = mesh.geometry.index;
    const groups = mesh.geometry.groups?.length ? mesh.geometry.groups : [{ start: 0, count: index ? index.count : position.count, materialIndex: 0 }];
    for (const group of groups) {
      const material = Array.isArray(mesh.material) ? mesh.material[group.materialIndex] : mesh.material;
      if (!PENDANT_MATERIAL.test(material?.name || '')) continue;
      for (let i = group.start; i + 2 < group.start + group.count; i += 3) {
        const v = k => (index ? index.getX(i + k) : i + k);
        a.fromBufferAttribute(position, v(0)).applyMatrix4(mesh.matrixWorld);
        b.fromBufferAttribute(position, v(1)).applyMatrix4(mesh.matrixWorld);
        c.fromBufferAttribute(position, v(2)).applyMatrix4(mesh.matrixWorld);
        const x = (a.x + b.x + c.x) / 3, y = (a.y + b.y + c.y) / 3, z = (a.z + b.z + c.z) / 3;
        let cluster = clusters.find(k => Math.hypot(k.cx - x, k.cz - z) < 1.5 && Math.abs(k.cy - y) < 1);
        if (!cluster) clusters.push(cluster = { cx: x, cy: y, cz: z, box: new THREE.Box3() });
        cluster.box.expandByPoint(a).expandByPoint(b).expandByPoint(c);
      }
    }
  });
  const raycaster = new THREE.Raycaster();
  raycaster.firstHitOnly = true;
  const down = new THREE.Vector3(0, -1, 0), from = new THREE.Vector3();
  const pendants = clusters.filter(({ box }) => box.max.x - box.min.x <= 2.5 && box.max.z - box.min.z <= 2.5);
  let mx = 0, mz = 0;
  for (const { box } of pendants) { mx += (box.min.x + box.max.x) / 2 / pendants.length; mz += (box.min.z + box.max.z) / 2 / pendants.length; }
  const perches = [];
  for (const { box } of pendants) {
    const cx = (box.min.x + box.max.x) / 2, cz = (box.min.z + box.max.z) / 2;
    const dx = mx - cx, dz = mz - cz, d = Math.hypot(dx, dz);
    const x = cx + (d > .5 ? dx / d : 1) * PERCH_OFFSET, z = cz + (d > .5 ? dz / d : 0) * PERCH_OFFSET;
    raycaster.set(from.set(x, box.max.y + 1.2, z), down); raycaster.far = 1.5;
    const hit = meshes.length ? raycaster.intersectObjects(meshes, false)[0] : null;
    const top = hit && hit.point.y > box.min.y - .05 && hit.point.y < box.max.y + .6 ? hit.point.y : box.max.y + .12;
    perches.push({ position: new THREE.Vector3(x, top, z), height: 0 });
  }
  return perches;
}

const mat = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: .7, ...extra });

export class MapDressing {
  constructor(scene = null) {
    this.root = new THREE.Group();
    this.root.name = 'Map dressing';
    scene?.add(this.root);
    this.world = null;
    this.pending = false;
    this.time = 0;
    this.enabled = true;
    this.signs = [];
    this.strings = [];
    this.flags = [];
    this.windUniforms = { uWindTime: { value: 0 } };
    this.glow = glowTexture();
    this.generation = 0;
    // World Life anchors: { position (world space), height }. Poles and string
    // ends give the pole top; lamps give a perch on top of each of the
    // Warehouse model's pendant shades (height 0). props: footprints of the
    // Warehouse crates, benches and door ({ position, radius, kind, facing }). Filled
    // as the dressing builds, cleared with the park.
    this.anchors = { poles: [], lamps: [], strings: [], props: [] };
    this.scan = null;
  }

  setQuality(settings) { this.enabled = settings?.name !== 'performance'; this.root.visible = this.enabled; }

  setWorld(world) {
    this.clear();
    this.world = world || null;
    this.pending = Boolean(world);
  }

  clear() {
    this.generation++;
    this.root.traverse(object => {
      if (!object.isMesh && !object.isLine) return;
      object.geometry?.dispose();
      for (const m of [].concat(object.material)) { m?.map?.dispose(); m?.dispose(); }
    });
    this.root.clear();
    this.signs = []; this.strings = []; this.flags = [];
    this.anchors = { poles: [], lamps: [], strings: [], props: [] };
    this.scan = null;
  }

  async build(world) {
    const generation = this.generation;
    const scan = scanMap({ collision: world.collision, park: world.park, manifest: world.manifest });
    this.scan = scan;
    if (!scan.walls.length && !scan.edges.length) return;
    const rand = seededRandom(`chimp-hawk-${world.id}`);
    const indoor = world.id === 'grand-warehouse';
    const space = world.id === 'orbit';
    await document.fonts?.load?.('400 60px Bangers').catch?.(() => {});
    if (generation !== this.generation) return;

    // Neon signs high on walls (not in space: Orbit already glows).
    if (!space) {
      const high = spreadPick(scan.walls.filter(w => w.tall), DRESSING.signs, 18, rand);
      high.forEach((wall, i) => {
        const color = neonColors[i % neonColors.length];
        const texture = neonTexture(DRESSING.signTexts[i % DRESSING.signTexts.length], color);
        if (!texture) return;
        const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2.8, .7), new THREE.MeshBasicMaterial({
          map: texture, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, fog: false,
        }));
        mesh.name = 'Neon sign';
        placeOnWall(mesh, wall.point.clone().setY(wall.groundY + 2.6), wall.normal, 0, .05);
        this.root.add(mesh);
        this.signs.push({ mesh, flicker: 0, next: 3 + rand() * 8 });
        // Coloured light pool on the ground in front of the sign.
        const pool = this.lightPool(color, 4.4, 3.2, .42);
        pool.position.copy(wall.point).setY(wall.groundY + .03).addScaledVector(wall.normal, 1.7);
        pool.rotation.set(-Math.PI / 2, 0, Math.atan2(wall.normal.x, wall.normal.z));
        this.root.add(pool);
        this.signs.at(-1).pool = pool;
      });
    }

    // Edge spots: flags first, then string lights between the rest.
    let edges = scan.edges.slice();
    const take = (list, count, gap) => { const picked = spreadPick(list, count, gap, rand); edges = edges.filter(e => !picked.includes(e)); return picked; };
    // Owner (2026-11-09): no flags on Skate Paradise or the Grand Warehouse. The
    // spots are still drawn so string lights and props keep their places.
    const flagSpots = space ? [] : take(edges, DRESSING.flags, 10);
    if (!NO_FLAGS.has(world.id)) for (const spot of flagSpots) this.buildFlag(spot, rand);
    // String lights stay clear of the start area so they never block the opening view.
    const clearOfSpawn = spawn => edges.filter(e => !spawn || e.point.distanceTo(spawn) > 32);
    if (!space) this.buildStrings(clearOfSpawn(Array.isArray(world.manifest?.spawn) ? new THREE.Vector3(...world.manifest.spawn) : null), rand, indoor);
    if (indoor) {
      this.skipRetiredLampDraws(scan, rand);
      this.anchors.lamps.push(...findPendantPerches(world.park, scan.meshes));
    }
    // Extra detail: Orbit trims and stencils; Warehouse props and roller door.
    const ys = scan.floor.map(f => f.point.y).sort((x, y) => x - y);
    const floorY = world.userData?.finishMask?.floorY ?? ys[Math.floor(ys.length / 2)] ?? 0;
    if (space) this.detail = buildOrbitDetail(this.root, world, scan, rand, floorY);
    if (indoor) {
      const avoid = this.strings.flatMap(s => [s.a, s.b]).map(e => e?.point || e).filter(p => p?.isVector3);
      this.detail = buildWarehouseProps(this.root, scan, rand, avoid);
      this.anchors.props.push(...this.detail.props);
    }
    this.patchPalms(world.park);
  }

  /** A soft additive pool of coloured light lying on the ground. */
  lightPool(color, width, depth, opacity) {
    this.poolMaterials ||= new Map();
    const key = `${color}|${opacity}`;
    if (!this.poolMaterials.has(key)) this.poolMaterials.set(key, new THREE.MeshBasicMaterial({
      map: this.glow, color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending,
      toneMapped: false, fog: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4,
    }));
    const pool = new THREE.Mesh(new THREE.PlaneGeometry(width, depth), this.poolMaterials.get(key));
    pool.name = 'Light pool'; pool.renderOrder = 2;
    return pool;
  }

  /**
   * The Warehouse's hanging lamps are the model's own pendants (perches come
   * from findPendantPerches). The dressing used to add a second lamp grid at
   * the median floor height, which the roof pulled above the roof, out of
   * sight; it is gone. Its random draws are still taken so the seeded layout
   * of the props placed after it (crates, benches, posters, door) is unchanged.
   */
  skipRetiredLampDraws(scan, rand) {
    const b = scan.bounds;
    if (!b || !scan.floor.length) return;
    const ys = scan.floor.map(f => f.point.y).sort((x, y) => x - y);
    const floorY = ys[Math.floor(ys.length / 2)];
    const step = 22;
    for (let x = b.minX + step / 2; x < b.maxX; x += step) for (let z = b.minZ + step / 2; z < b.maxZ; z += step) {
      if (scan.floor.some(f => (f.point.x - x) ** 2 + (f.point.z - z) ** 2 < 25 && Math.abs(f.point.y - floorY) < .5)) { rand(); rand(); }
    }
  }

  buildFlag(spot, rand) {
    const group = new THREE.Group(); group.name = 'Flag';
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(.03, .04, 3.4, 8), mat('#b7bcc6', { metalness: .8, roughness: .35 }));
    pole.position.y = 1.7; pole.castShadow = true;
    const texture = flagTexture(neonColors[Math.floor(rand() * neonColors.length)], rand);
    const geometry = new THREE.PlaneGeometry(1.5, .94, 18, 8); geometry.translate(.75, 0, 0);
    const material = new THREE.MeshStandardMaterial({ map: texture, side: THREE.DoubleSide, roughness: .8 });
    const uniforms = this.windUniforms;
    material.onBeforeCompile = shader => {
      Object.assign(shader.uniforms, uniforms);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uWindTime;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>
  float flagT = clamp(position.x / 1.5, 0.0, 1.0);
  transformed.z += sin(position.x * 4.2 - uWindTime * 5.0) * 0.13 * flagT + sin(position.y * 3.0 - uWindTime * 3.1) * 0.03 * flagT;
  transformed.y -= flagT * flagT * 0.08;`);
    };
    const cloth = new THREE.Mesh(geometry, material);
    cloth.position.y = 2.9; cloth.castShadow = true;
    group.add(pole, cloth);
    group.position.copy(spot.point);
    group.rotation.y = Math.atan2(spot.facing.x, spot.facing.z) + Math.PI / 2 + (rand() - .5) * .6;
    this.root.add(group);
    this.flags.push(group);
    this.anchors.poles.push({ position: spot.point.clone().setY(spot.point.y + 3.4), height: 3.4 });
  }

  buildStrings(spots, rand, indoor) {
    // Pair each spot with its nearest free partner 5–22 m away.
    const pairs = [], used = new Set();
    for (const a of spots) {
      if (used.has(a) || pairs.length >= DRESSING.strings) continue;
      let best = null, bestD = Infinity;
      for (const b of spots) {
        if (b === a || used.has(b)) continue;
        const d = a.point.distanceTo(b.point);
        if (d > 5 && d < 22 && d < bestD && Math.abs(a.point.y - b.point.y) < 1.5) { best = b; bestD = d; }
      }
      if (best) { used.add(a); used.add(best); pairs.push([a, best]); }
    }
    const poleMat = mat('#2b2d35', { metalness: .6, roughness: .5 });
    for (const [a, b] of pairs) {
      const height = indoor ? 3.6 : 4.4;
      const ends = [a, b].map(spot => {
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(.045, .06, height, 8), poleMat);
        pole.position.copy(spot.point); pole.position.y += height / 2; pole.castShadow = true;
        this.root.add(pole);
        this.anchors.strings.push({ position: spot.point.clone().setY(spot.point.y + height), height });
        return spot.point.clone().setY(spot.point.y + height - .1);
      });
      const span = ends[0].distanceTo(ends[1]);
      const bulbs = Math.max(6, Math.round(span / .75));
      const colors = rand() < .5 ? ['#ffcf7a'] : neonColors;
      const bulbMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(.05, 8, 6), new THREE.MeshBasicMaterial({ toneMapped: false }), bulbs);
      const glowMesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(.55, .55), new THREE.MeshBasicMaterial({
        map: this.glow, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, fog: false, opacity: .55,
      }), bulbs);
      const color = new THREE.Color();
      for (let i = 0; i < bulbs; i++) { color.set(colors[i % colors.length]); bulbMesh.setColorAt(i, color); glowMesh.setColorAt(i, color); }
      bulbMesh.name = 'String light bulbs'; glowMesh.name = 'String light glow';
      bulbMesh.frustumCulled = glowMesh.frustumCulled = false;
      const wire = new THREE.Line(new THREE.BufferGeometry().setFromPoints(Array.from({ length: 24 }, () => new THREE.Vector3())), new THREE.LineBasicMaterial({ color: '#15161b' }));
      wire.frustumCulled = false;
      this.root.add(bulbMesh, glowMesh, wire);
      const across = ends[1].clone().sub(ends[0]).setY(0).normalize();
      // Warm pools on the ground under the string.
      for (let k = 1; k <= 3; k++) {
        const t = k / 4, pool = this.lightPool(colors.length === 1 ? '#ffcf7a' : neonColors[k % neonColors.length], 3.2, 3.2, .26);
        pool.position.lerpVectors(a.point, b.point, t).setY(a.point.y + (b.point.y - a.point.y) * t + .03);
        pool.rotation.x = -Math.PI / 2;
        this.root.add(pool);
      }
      this.strings.push({ a: ends[0], b: ends[1], bulbs, bulbMesh, glowMesh, wire, sag: .6 + span * .05, phase: rand() * 10, side: new THREE.Vector3(-across.z, 0, across.x) });
    }
  }

  /** Palm leaves sway: a per-vertex weight (0 at the crown, 1 at frond tips). */
  patchPalms(park) {
    const uniforms = this.windUniforms;
    park?.traverse?.(mesh => {
      if (!mesh.isMesh || !/palm/i.test(mesh.name) || !/leaf|leaflet|frond/i.test(`${mesh.name} ${[].concat(mesh.material)[0]?.name}`)) return;
      const geometry = mesh.geometry;
      if (!geometry.attributes.aSway) {
        geometry.computeBoundingBox();
        const box = geometry.boundingBox, center = box.getCenter(new THREE.Vector3());
        const reach = Math.max(1e-3, Math.max(box.max.x - box.min.x, box.max.z - box.min.z) / 2);
        const pos = geometry.attributes.position, sway = new Float32Array(pos.count);
        for (let i = 0; i < pos.count; i++) sway[i] = Math.min(1, Math.hypot(pos.getX(i) - center.x, pos.getZ(i) - center.z) / reach);
        geometry.setAttribute('aSway', new THREE.BufferAttribute(sway, 1));
      }
      for (const material of [].concat(mesh.material)) {
        if (!material || material.userData.chimpSway) continue;
        material.userData.chimpSway = true;
        const previous = material.onBeforeCompile, previousKey = material.customProgramCacheKey?.bind(material);
        material.onBeforeCompile = function (shader, renderer) {
          previous?.call(this, shader, renderer);
          Object.assign(shader.uniforms, uniforms);
          shader.vertexShader = shader.vertexShader
            .replace('#include <common>', '#include <common>\nuniform float uWindTime;\nattribute float aSway;')
            .replace('#include <begin_vertex>', `#include <begin_vertex>
  {
    vec3 palmOrigin = modelMatrix[3].xyz;
    float palmPhase = palmOrigin.x * 0.37 + palmOrigin.z * 0.21;
    float gust = sin(uWindTime * 0.9 + palmPhase) * 0.6 + sin(uWindTime * 2.3 + palmPhase * 1.7) * 0.25;
    float flutter = sin(uWindTime * 6.0 + position.x * 2.0 + position.z * 2.0) * 0.04;
    float swayW = aSway * aSway;
    transformed.x += (gust * 0.18 + flutter) * swayW;
    transformed.z += (gust * 0.10 + flutter) * swayW;
    transformed.y += (abs(gust) * -0.06 + flutter * 0.5) * swayW;
  }`);
        };
        material.customProgramCacheKey = () => `${previousKey ? previousKey() : ''}|chimp-palm-sway`;
        material.needsUpdate = true;
      }
    });
  }

  update(delta, skater, camera) {
    const dt = Math.min(.1, Math.max(0, Number(delta) || 0));
    this.time += dt;
    this.windUniforms.uWindTime.value = this.time;
    if (this.pending && this.world) {
      this.pending = false;
      this.build(this.world).catch(error => console.warn('Map dressing skipped', error));
    }
    if (!this.enabled || !camera) return;
    // Neon signs: an occasional flicker.
    for (const sign of this.signs) {
      sign.next -= dt;
      if (sign.next <= 0) { sign.flicker = .5; sign.next = 4 + Math.random() * 9; }
      if (sign.flicker > 0) { sign.flicker -= dt; sign.mesh.material.opacity = Math.random() < .5 ? .25 : 1; }
      else sign.mesh.material.opacity = 1;
    }
    // String lights sway; glows face the camera.
    const m = new THREE.Matrix4(), q = camera.quaternion, s1 = new THREE.Vector3(1, 1, 1), p = new THREE.Vector3(), identity = new THREE.Quaternion(), glowScale = new THREE.Vector3();
    for (const str of this.strings) {
      const sway = Math.sin(this.time * 1.1 + str.phase) * .12;
      const point = t => p.lerpVectors(str.a, str.b, t).addScaledVector(UP, -Math.sin(t * Math.PI) * str.sag).addScaledVector(str.side, Math.sin(t * Math.PI) * sway);
      for (let i = 0; i < str.bulbs; i++) {
        point((i + .5) / str.bulbs);
        str.bulbMesh.setMatrixAt(i, m.compose(p, identity, s1));
        const g = glowScaleForDistance(p.distanceTo(camera.position));
        str.glowMesh.setMatrixAt(i, m.compose(p, q, glowScale.setScalar(g)));
      }
      str.bulbMesh.instanceMatrix.needsUpdate = true; str.glowMesh.instanceMatrix.needsUpdate = true;
      const wire = str.wire.geometry.attributes.position;
      for (let i = 0; i < wire.count; i++) { point(i / (wire.count - 1)); wire.setXYZ(i, p.x, p.y + .03, p.z); }
      wire.needsUpdate = true;
    }

  }
}
