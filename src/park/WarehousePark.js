import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createWarehouseMaterials, createWarehouseSign } from './WarehouseMaterials.js';

const TAU = Math.PI * 2;
const clamp = THREE.MathUtils.clamp;
const smooth = t => t * t * (3 - 2 * t);
const transition = (id, type = 'QUARTER', axisMode = 'LINEAR') => ({
  id, type, axisMode, supportsVert: true, supportsTransfer: true,
  supportsPump: true, supportsLipTricks: true, cameraHint: type,
});

/** Original 150 × 110 m warehouse. Y-up metres, same physics/rail contract as Rooftop. */
export function createWarehousePark(options = {}) {
  const park = new THREE.Group(), collision = new THREE.Group(), roof = new THREE.Group();
  park.name = 'THE FOUNDRY / industrial skate warehouse'; collision.name = 'Foundry / authored collision';
  roof.name = 'Foundry / roof and overhead steel'; roof.userData.cameraRoof = true; roof.userData.warehouseRoof = true;
  park.add(roof);
  const { materials, ready, textureSizes } = createWarehouseMaterials(options);
  const batches = new Map(), proxies = new Map(), rails = [], holes = [], features = [];
  const proxyMaterial = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });

  function add(geometry, material, surface = null, railId = null, overhead = false) {
    const authoredUV = geometry.userData.authoredUV;
    if (geometry.index) { const original = geometry; geometry = geometry.toNonIndexed(); original.dispose(); }
    for (const key of Object.keys(geometry.attributes)) if (!['position', 'normal', 'uv'].includes(key)) geometry.deleteAttribute(key);
    if (!geometry.attributes.normal) geometry.computeVertexNormals();
    if (!authoredUV) {
      const p = geometry.attributes.position, n = geometry.attributes.normal, uv = new Float32Array(p.count * 2);
      const scale = material === 'brick' ? 1.1 : ['wood', 'woodDark'].includes(material) ? 2.44 : material === 'edge' ? .3 : 4;
      for (let i = 0; i < p.count; i++) {
        const nx = Math.abs(n.getX(i)), ny = Math.abs(n.getY(i)), nz = Math.abs(n.getZ(i));
        uv[i * 2] = (nx > ny && nx > nz ? p.getZ(i) : p.getX(i)) / scale;
        uv[i * 2 + 1] = (ny >= nx && ny >= nz ? p.getZ(i) : p.getY(i)) / scale;
      }
      geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    }
    const key = `${overhead ? 'roof' : 'park'}:${material}`;
    if (!batches.has(key)) batches.set(key, []);
    batches.get(key).push(geometry);
    if (surface) {
      const proxyKey = `${surface}:${railId || ''}`;
      if (!proxies.has(proxyKey)) proxies.set(proxyKey, { surface, railId, geometries: [] });
      proxies.get(proxyKey).geometries.push(geometry.clone());
    }
  }
  function box(x, y, z, w, h, d, material, surface = null, overhead = false) {
    add(new THREE.BoxGeometry(w, h, d).translate(x, y, z), material, surface, null, overhead);
  }
  function triangles(points, indices, material, surface = 'rideable', uv = null, overhead = false) {
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(points.flat(), 3));
    g.setIndex(indices); g.computeVertexNormals();
    if (uv) { g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.userData.authoredUV = true; }
    add(g, material, surface, null, overhead);
  }
  function tube(a, b, radius, material = 'steel', surface = null, railId = null, overhead = false, sides = 8) {
    const start = new THREE.Vector3(...a), end = new THREE.Vector3(...b), delta = end.clone().sub(start);
    if (delta.lengthSq() < 1e-10) return;
    const g = new THREE.CylinderGeometry(radius, radius, delta.length(), sides);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.normalize()));
    g.translate(...start.add(end).multiplyScalar(.5).toArray()); add(g, material, surface, railId, overhead);
  }
  const cut = points => holes.push(points.map(p => [p[0], -p[2]]));
  function rail(name, points, { coping = false, metadata = null, supports = true, supportFloor = 0, radius = coping ? .045 : .065 } = {}) {
    rails.push({ name, points, radius, ...(metadata ? { transition: metadata } : {}) });
    for (let i = 1; i < points.length; i++) tube(points[i - 1], points[i], radius, coping ? 'coping' : 'rail', coping ? null : 'solid', name, false, 10);
    if (!coping && supports) {
      let travelled = 0, nextSupport = .28;
      for (let i = 1; i < points.length; i++) {
        const a = new THREE.Vector3(...points[i - 1]), b = new THREE.Vector3(...points[i]), len = a.distanceTo(b);
        while (nextSupport <= travelled + len) {
          const p = a.clone().lerp(b, (nextSupport - travelled) / len); tube([p.x, supportFloor + .045, p.z], p.toArray(), .044, 'rail', 'solid', name);
          box(p.x, supportFloor + .028, p.z, .26, .035, .26, 'steel');
          nextSupport += 2.65;
        }
        travelled += len;
      }
    }
    return points;
  }
  function profile(name, x, z, width, samples, { yaw = 0, material = 'wood', cutFloor = true, framing = true } = {}) {
    const transform = ([px, py, pz]) => [x + px * Math.cos(yaw) + pz * Math.sin(yaw), py, z - px * Math.sin(yaw) + pz * Math.cos(yaw)];
    const points = samples.flatMap(([s, y]) => [transform([-width / 2, y, s]), transform([width / 2, y, s])]);
    const descending = samples.at(-1)[0] < samples[0][0], indices = [], uv = [];
    let arc = 0;
    for (let i = 0; i < samples.length; i++) {
      if (i) arc += Math.hypot(samples[i][0] - samples[i - 1][0], samples[i][1] - samples[i - 1][1]);
      uv.push(0, arc / 2.44, width / 2.44, arc / 2.44);
      if (i < samples.length - 1) { const a = i * 2, b = a + 2; indices.push(...(descending ? [a, a + 1, b, a + 1, b + 1, b] : [a, b, a + 1, a + 1, b, b + 1])); }
    }
    triangles(points, indices, material, 'rideable', uv);
    if (cutFloor) cut([transform([-width / 2, 0, samples[0][0]]), transform([width / 2, 0, samples[0][0]]), transform([width / 2, 0, samples.at(-1)[0]]), transform([-width / 2, 0, samples.at(-1)[0]])]);
    for (const side of [-1, 1]) {
      const vertices = [], faces = [], edges = [], edgeFaces = [];
      for (let i = 0; i < samples.length - 1; i++) {
        const [s0, y0] = samples[i], [s1, y1] = samples[i + 1], a = vertices.length;
        vertices.push(...[[side * width / 2, 0, s0], [side * width / 2, y0, s0], [side * width / 2, y1, s1], [side * width / 2, 0, s1]].map(transform));
        if (y0 > .001) faces.push(a, a + 1, a + 2);
        if (y1 > .001) faces.push(a, a + 2, a + 3);
        const e = edges.length;
        edges.push(...[[side * (width / 2 + .006), Math.max(0, y0 - .11), s0], [side * (width / 2 + .006), y0, s0], [side * (width / 2 + .006), y1, s1], [side * (width / 2 + .006), Math.max(0, y1 - .11), s1]].map(transform));
        edgeFaces.push(e, e + 1, e + 2, e, e + 2, e + 3);
      }
      if (side * (descending ? 1 : -1) > 0) for (const list of [faces, edgeFaces]) for (let i = 0; i < list.length; i += 3) [list[i + 1], list[i + 2]] = [list[i + 2], list[i + 1]];
      if (faces.length) triangles(vertices, faces, 'woodDark', 'solid');
      triangles(edges, edgeFaces, 'edge', null);
      if (framing) for (let i = 0; i < samples.length; i += Math.max(1, Math.floor(samples.length / 7))) {
        const [s, y] = samples[i]; if (y < .6) continue;
        tube(transform([side * (width / 2 + .055), .06, s]), transform([side * (width / 2 + .055), y - .17, s]), .052, 'steel');
      }
    }
    for (const [i, [s, y]] of [samples[0], samples.at(-1)].entries()) if (y > .001) {
      triangles([[-width / 2, 0, s], [width / 2, 0, s], [width / 2, y, s], [-width / 2, y, s]].map(transform), (i === 0) === descending ? [0, 1, 2, 0, 2, 3] : [0, 2, 1, 0, 3, 2], 'woodDark', 'solid');
    }
    features.push({ name, type: 'profile', center: [x, 0, z], width, length: Math.abs(samples.at(-1)[0] - samples[0][0]), height: Math.max(...samples.map(p => p[1])) });
    return transform;
  }
  function quarter(name, x, z, width, radius, yaw = 0) {
    const samples = Array.from({ length: 49 }, (_, i) => { const a = i / 48 * Math.PI / 2; return [-radius * Math.sin(a), radius * (1 - Math.cos(a))]; });
    samples.push([-radius - 2.2, radius]);
    const t = profile(name, x, z, width, samples, { yaw });
    rail(`${name} coping`, [-width / 2, width / 2].map(px => t([px, radius + .025, -radius])), { coping: true, metadata: transition(name, radius >= 4 ? 'VERT' : 'QUARTER') });
    return t;
  }
  function halfpipe(name, x, z, width, radius, flat, yaw = 0) {
    const samples = [[-flat / 2 - radius - 2.5, radius]];
    for (let i = 48; i >= 0; i--) { const a = i / 48 * Math.PI / 2; samples.push([-flat / 2 - radius * Math.sin(a), radius * (1 - Math.cos(a))]); }
    for (let i = 1; i <= 48; i++) { const a = i / 48 * Math.PI / 2; samples.push([flat / 2 + radius * Math.sin(a), radius * (1 - Math.cos(a))]); }
    // The flat is one plane; the first point of the second transition is explicitly included.
    samples.splice(50, 0, [flat / 2, 0]);
    samples.push([flat / 2 + radius + 2.5, radius]);
    const t = profile(name, x, z, width, samples, { yaw });
    for (const side of [-1, 1]) {
      rail(`${name} ${side < 0 ? 'north' : 'south'} coping`, [-width / 2, width / 2].map(px => t([px, radius + .025, side * (flat / 2 + radius)])), { coping: true, metadata: transition(`${name}-${side}`, radius >= 4 ? 'VERT' : 'MINI') });
      for (let px = -width / 2; px <= width / 2; px += 2.5) tube(t([px, radius, side * (flat / 2 + radius + 2.35)]), t([px, radius + 1.05, side * (flat / 2 + radius + 2.35)]), .04, 'steel');
      for (const y of [.55, 1.03]) tube(t([-width / 2, radius + y, side * (flat / 2 + radius + 2.35)]), t([width / 2, radius + y, side * (flat / 2 + radius + 2.35)]), .035, 'steel');
    }
    return t;
  }
  function pad(name, x, z, width, length, height) {
    box(x, height / 2, z, width, height, length, 'woodDark', 'rideable');
    box(x, height + .003, z, width - .04, .008, length - .04, 'wood');
    for (const side of [-1, 1]) rail(`${name} ${side < 0 ? 'left' : 'right'} ledge`, [[x + side * (width / 2 - .045), height + .025, z - length / 2], [x + side * (width / 2 - .045), height + .025, z + length / 2]], { coping: true });
    features.push({ name, type: 'manual-pad', center: [x, height, z], width, length, height });
  }
  function pyramid(name, x, z, radius, topRadius, height) {
    const outer = [[x - radius, 0, z + radius], [x + radius, 0, z + radius], [x + radius, 0, z - radius], [x - radius, 0, z - radius]];
    const inner = [[x - topRadius, height, z + topRadius], [x + topRadius, height, z + topRadius], [x + topRadius, height, z - topRadius], [x - topRadius, height, z - topRadius]];
    for (let i = 0; i < 4; i++) { const j = (i + 1) % 4; triangles([outer[i], outer[j], inner[j], inner[i]], [0, 1, 2, 0, 2, 3], 'wood'); }
    triangles(inner, [0, 1, 2, 0, 2, 3], 'woodDark'); cut(outer);
    features.push({ name, type: 'pyramid-hip', center: [x, height, z], width: radius * 2, height });
  }
  function stairs(name, x, z, count, width) {
    const step = .5, rise = .25, height = count * rise, topZ = z + count * step;
    for (let i = 0; i < count; i++) box(x, (i + 1) * rise / 2, z + (i + .5) * step, width, (i + 1) * rise, step, 'concrete', 'rideable');
    box(x, height / 2, topZ + 2, width, height, 4, 'concrete', 'rideable');
    for (let i = 0; i < count; i++) box(x, (i + 1) * rise + .006, z + i * step + .06, width, .014, .075, 'steel');
    cut([[x - width / 2, 0, z], [x + width / 2, 0, z], [x + width / 2, 0, topZ + 4], [x - width / 2, 0, topZ + 4]]);
    const points = [[x, .85, z - .2], [x, height + .85, topZ], [x, height + .85, topZ + 3.2]];
    rail(`${name} kinked down rail`, points, { supports: false });
    for (const [pz, floor] of [[z + .5, rise], [topZ - .25, height], [topZ + 2.8, height]]) tube([x, floor, pz], [x, pz < topZ ? .85 + (pz - z + .2) / (count * step + .2) * height : height + .85, pz], .045, 'rail', 'solid', `${name} kinked down rail`);
    // Solid hubbas are independent ledges, with exact visual/capture top edges.
    for (const side of [-1, 1]) {
      const px = x + side * (width / 2 + .22), a = [px, .5, z], b = [px, height + .5, topZ];
      const points = [[px - .2, 0, z], [px + .2, 0, z], [px + .2, .5, z], [px - .2, .5, z], [px - .2, height, topZ], [px + .2, height, topZ], [px + .2, height + .5, topZ], [px - .2, height + .5, topZ]];
      triangles(points, [3, 7, 2, 2, 7, 6, 0, 4, 3, 3, 4, 7, 1, 2, 5, 2, 6, 5, 0, 3, 1, 1, 3, 2, 4, 5, 7, 5, 6, 7], 'concrete', 'rideable');
      rail(`${name} ${side < 0 ? 'west' : 'east'} hubba`, [a, b], { coping: true });
    }
    features.push({ name, type: 'stairs', steps: count, center: [x, 0, z], height });
    profile(`${name} parallel access bank`, x + width / 2 + 3.3, z, 4.5, [[0, 0], [count * step, height], [count * step + 4, height]]);
    // Join the bank and stair head into one accessible upper platform. The hubba
    // ends at the top riser, leaving the rear three metres clear for a turn-in.
    box(x + width / 2 + .525, height / 2, topZ + 2, 1.05, height, 4, 'concrete', 'rideable');
  }

  // A deliberate four-district plan leaves the central 40 × 27 m plaza open.
  // A — STREET DISTRICT: two technical clusters with generous run-up lanes.
  profile('Street double-bank funbox', -35, 17, 9, [[-6, 0], [-2, 1.25], [2, 1.25], [6, 0]]);
  pad('Funbox ledge', -38.1, 17, .7, 3.3, 1.65);
  rail('Street tabletop rail', [[-33.5, 2.02, 14.9], [-33.5, 2.02, 19.1]], { supportFloor: 1.25 });
  stairs('Six stair', -29, 31, 6, 5.5);
  stairs('Nine stair', 10, 26, 9, 6);
  pad('Low manual', -12, 30, 3, 8, .28);
  pad('Long manual', -46, 13, 3.2, 9, .45);
  pad('Raised manual', -10, 43, 3, 6, .65);
  rail('Street approach flat rail', [[-47, .79, 27], [-47, .79, 40]]);
  rail('Street central flat rail', [[-4, .84, 24], [-4, .84, 36]]);
  rail('Low technical round rail', [[-18, .48, 16], [-9, .48, 16]], { radius: .045 });
  // One rail ID, one exact polyline, continuous tangent through both joins.
  const returnRail = [[-64, .9, 22], [-64, .9, 28]];
  for (let i = 1; i <= 56; i++) { const a = Math.PI - i / 56 * Math.PI; returnRail.push([-59.6 + 4.4 * Math.cos(a), .9, 28 + 4.4 * Math.sin(a)]); }
  returnRail.push([-55.2, .9, 22]);
  rail('Foundry continuous horseshoe rail', returnRail);
  features.push({ name: 'Continuous horseshoe rail', type: 'signature-rail', length: 12 + Math.PI * 4.4 });
  pyramid('Street pyramid west', -57, 43, 4.2, 1.2, 1.15);
  pyramid('Street pyramid east', 22, 43, 3.5, .9, .95);
  profile('Euro takeoff', -39, 42, 5, [[-3.5, 0], [0, 1.1]]);
  profile('Euro landing bank', -39, 47, 6, [[-2, 1.4], [0, 1.4], [3, 0]]);
  profile('Street low kicker west', -57, 15, 3.8, [[-2.5, 0], [0, .65]]);
  profile('Street low kicker east', 22, 20, 4, [[-3, 0], [0, .8]]);
  box(-68.6, 1.85, 12, .45, 3.7, 12, 'oxide', 'solid');
  features.push({ name: 'Street wallride', type: 'wallride', center: [-68.6, 1.85, 12] });

  // B — TIMBER BOWL. An asymmetric three-pocket outline and varying floor depth;
  // the triangulated plaza uses this exact same rim, never an invisible cover.
  const cx = -48, cz = -17, segments = 128, wallRows = 32, bottomRows = 14;
  const bowlOutline = [], bowlDepths = [], bowlBottom = [], roll = [];
  for (let i = 0; i <= segments; i++) {
    const theta = i / segments * TAU, shape = 1 + .068 * Math.cos(3 * theta) + .032 * Math.sin(2 * theta);
    const rx = 17 * shape * Math.cos(theta), rz = 18 * shape * Math.sin(theta), length = Math.hypot(rx, rz);
    const depth = 3.05 - .65 * Math.sin(theta); // south shallow 2.4 m, north deep 3.7 m
    const angular = Math.abs(Math.atan2(Math.sin(theta - Math.PI / 2), Math.cos(theta - Math.PI / 2)));
    const rollIn = 1 - smooth(clamp((angular - .13) / .23, 0, 1));
    const inset = depth * (1 + 1.1 * rollIn);
    bowlOutline.push([cx + rx, 0, cz + rz]); bowlDepths.push(depth); roll.push(rollIn);
    bowlBottom.push([cx + rx * (1 - inset / length), -depth, cz + rz * (1 - inset / length)]);
  }
  cut(bowlOutline.slice(0, -1));
  const bp = [], bi = [], buv = [];
  for (let row = 0; row <= wallRows; row++) for (let col = 0; col <= segments; col++) {
    const t = row / wallRows, a = t * Math.PI / 2, inner = bowlBottom[col], outer = bowlOutline[col];
    const fraction = THREE.MathUtils.lerp(Math.sin(a), t, roll[col]);
    const y = THREE.MathUtils.lerp(-bowlDepths[col] * Math.cos(a), -bowlDepths[col] * (1 - smooth(t)), roll[col]);
    bp.push([THREE.MathUtils.lerp(inner[0], outer[0], fraction), y, THREE.MathUtils.lerp(inner[2], outer[2], fraction)]);
    buv.push(col / segments * 45, t * bowlDepths[col] * Math.PI / 2 / 2.44);
    if (row < wallRows && col < segments) { const n = row * (segments + 1) + col, m = n + segments + 1; bi.push(n, n + 1, m, n + 1, m + 1, m); }
  }
  triangles(bp, bi, 'wood', 'rideable', buv);
  const bottom = [[cx, -3.05, cz]], bottomIndex = [];
  for (let row = 1; row <= bottomRows; row++) for (let col = 0; col <= segments; col++) {
    const t = row / bottomRows, p = bowlBottom[col]; bottom.push([cx + (p[0] - cx) * t, -3.05 + (p[1] + 3.05) * smooth(t), cz + (p[2] - cz) * t]);
    if (row === 1 && col < segments) bottomIndex.push(0, col + 2, col + 1);
    if (row > 1 && col < segments) { const n = 1 + (row - 2) * (segments + 1) + col, m = n + segments + 1; bottomIndex.push(n, m + 1, m, n, n + 1, m + 1); }
  }
  triangles(bottom, bottomIndex, 'wood');
  // Coping stops on both sides of the wide, flush roll-in; no steel bar across it.
  const bowlCoping = [];
  for (let i = 0; i <= segments; i++) {
    const index = (Math.ceil(segments * .25) + 9 + i) % segments;
    if (i > segments - 18) break;
    bowlCoping.push([bowlOutline[index][0], .025, bowlOutline[index][2]]);
  }
  rail('Timber bowl open roll-in coping', bowlCoping, { coping: true, metadata: transition('timber-bowl', 'BOWL', 'RADIAL') });
  // Warm inlaid deck apron follows the noncircular silhouette without covering the hole.
  const apron = [], apronIndices = [];
  for (let i = 0; i <= segments; i++) {
    const p = bowlOutline[i], dx = p[0] - cx, dz = p[2] - cz, inv = 1 / Math.hypot(dx, dz);
    apron.push([p[0] + dx * inv * .10, .011, p[2] + dz * inv * .10], [p[0] + dx * inv * .62, .011, p[2] + dz * inv * .62]);
    if (i < segments) { const a = i * 2; apronIndices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
  }
  triangles(apron, apronIndices, 'yellow', null);
  features.push({ name: 'Timber multi-depth bowl', type: 'bowl', center: [cx, -3.05, cz], width: 36.4, length: 38.4, minDepth: 2.4, maxDepth: 3.7, rollIn: [cx, 0, 1] });

  // C — VERT HALL. Continuous decks, arcs and flat, with explicit lip metadata.
  halfpipe('Competition halfpipe', 5, -34, 20, 4.5, 8);
  halfpipe('Foundry mini halfpipe', -18, -39, 12, 2, 5);
  quarter('West transfer quarter', -51, -43, 23, 3.3);
  quarter('Competition quarter extension', 29, -43, 11, 4.8);
  quarter('Vert hall return quarter', 49, -43, 16, 3.8);
  // A back-to-back spine uses one shared surface, not overlapping quarter backs.
  const spine = [];
  for (let i = 0; i <= 40; i++) { const a = i / 40 * Math.PI / 2; spine.push([-2.3 + 2.3 * Math.sin(a), 2.3 * (1 - Math.cos(a))]); }
  for (let i = 1; i <= 40; i++) { const a = Math.PI / 2 - i / 40 * Math.PI / 2; spine.push([2.3 - 2.3 * Math.sin(a), 2.3 * (1 - Math.cos(a))]); }
  const spineTransform = profile('Vert spine transfer', 30, -29, 8, spine);
  rail('Vert spine transfer coping', [-4, 4].map(x => spineTransform([x, 2.325, 0])), { coping: true, metadata: transition('vert-spine', 'SPINE') });

  // D — FLOW LAB. Banks and rolling surfaces provide through-routes, not dead ends.
  const wave = Array.from({ length: 97 }, (_, i) => { const t = i / 96; return [-14 + t * 28, 1.05 * Math.sin(t * Math.PI * 3) ** 2 * Math.sin(t * Math.PI) ** .7]; });
  profile('Flow triple rolling wave', 41, 14, 8, wave);
  profile('Flow north access bank', 55, -16, 8, [[-5, 0], [-1, 1.6], [2, 1.6], [7, 0]], { yaw: Math.PI / 2 });
  profile('Flow south transfer bank', 58, 30, 8, [[-5, 0], [-1, 1.5], [2, 1.5], [7, 0]], { yaw: Math.PI / 2 });
  pyramid('Flow east hip', 60, 8, 5, .8, 1.7);
  pyramid('Flow west hip', 28, -9, 4.2, 1.1, 1.1);
  halfpipe('Flow mini transition', 58, -32, 11, 1.65, 4);
  const flowSpine = spine.map(([s, y]) => [s * .68, y * .68]);
  const flowSpineTransform = profile('Flow low spine', 52, 42, 9, flowSpine, { yaw: Math.PI / 2 });
  rail('Flow low spine coping', [-4.5, 4.5].map(x => flowSpineTransform([x, 2.3 * .68 + .025, 0])), { coping: true, metadata: transition('flow-spine', 'SPINE') });
  profile('Flow launch ramp', 28, 29, 4.5, Array.from({ length: 25 }, (_, i) => { const a = i / 24 * Math.PI / 3; return [4.5 * Math.sin(a), 4.5 * (1 - Math.cos(a))]; }));
  // Low volcano: broad smooth annular climb, flat crown, no open hole or sharp seam.
  const vp = [[44, 1.55, -11]], vi = [], volcanoRings = 28, volcanoSegments = 80;
  for (let row = 0; row <= volcanoRings; row++) for (let col = 0; col <= volcanoSegments; col++) {
    const r = 1 + row / volcanoRings * 5, t = row / volcanoRings, theta = col / volcanoSegments * TAU;
    vp.push([44 + r * Math.cos(theta), 1.55 * (1 - smooth(t)), -11 + r * Math.sin(theta)]);
    if (!row && col < volcanoSegments) vi.push(0, col + 2, col + 1);
    if (row < volcanoRings && col < volcanoSegments) { const n = 1 + row * (volcanoSegments + 1) + col, m = n + volcanoSegments + 1; vi.push(n, m + 1, m, n, n + 1, m + 1); }
  }
  triangles(vp, vi, 'wood');
  cut(Array.from({ length: volcanoSegments }, (_, i) => [44 + 6 * Math.cos(i / volcanoSegments * TAU), 0, -11 + 6 * Math.sin(i / volcanoSegments * TAU)]));
  features.push({ name: 'Flow volcano', type: 'volcano', center: [44, 1.55, -11], radius: 6, height: 1.55 });
  // A curved quarter arc frames the eastern line without occupying its exit lane.
  const cp = [], ci = [], cuv = [], curvedRim = [], curvedBack = [], ccols = 56, crows = 32, qRadius = 2.3, innerRadius = 8, curvedDeck = 2.1;
  for (let row = 0; row <= crows + 1; row++) for (let col = 0; col <= ccols; col++) {
    const a = Math.min(row, crows) / crows * Math.PI / 2, theta = -.6 + col / ccols * 1.2;
    const r = innerRadius + qRadius * Math.sin(a) + (row > crows ? curvedDeck : 0);
    cp.push([57 + r * Math.cos(theta), qRadius * (1 - Math.cos(a)), -5 + r * Math.sin(theta)]);
    cuv.push(theta * (innerRadius + qRadius / 2) / 2.44, (a * qRadius + (row > crows ? curvedDeck : 0)) / 2.44);
    if (row <= crows && col < ccols) { const n = row * (ccols + 1) + col, m = n + ccols + 1; ci.push(n, n + 1, m, n + 1, m + 1, m); }
    if (row === crows) curvedRim.push([57 + r * Math.cos(theta), qRadius + .025, -5 + r * Math.sin(theta)]);
    if (row === crows + 1) curvedBack.push([57 + r * Math.cos(theta), qRadius, -5 + r * Math.sin(theta)]);
  }
  triangles(cp, ci, 'wood', 'rideable', cuv);
  const curvedFootprint = [];
  for (let i = 0; i <= ccols; i++) { const a = -.6 + i / ccols * 1.2; curvedFootprint.push([57 + innerRadius * Math.cos(a), 0, -5 + innerRadius * Math.sin(a)]); }
  for (let i = ccols; i >= 0; i--) { const a = -.6 + i / ccols * 1.2; curvedFootprint.push([57 + (innerRadius + qRadius + curvedDeck) * Math.cos(a), 0, -5 + (innerRadius + qRadius + curvedDeck) * Math.sin(a)]); }
  cut(curvedFootprint);
  rail('Flow curved quarter coping', curvedRim, { coping: true, metadata: transition('flow-curved-quarter', 'QUARTER', 'RADIAL') });
  // Back and two ends enclose the timber structure, avoiding an open shell.
  for (let i = 1; i < curvedBack.length; i++) triangles([[curvedBack[i - 1][0], 0, curvedBack[i - 1][2]], [curvedBack[i][0], 0, curvedBack[i][2]], curvedBack[i], curvedBack[i - 1]], [0, 1, 2, 0, 2, 3], 'woodDark', 'solid');
  for (const col of [0, ccols]) {
    const p = [], ix = [];
    for (let row = 0; row <= crows + 1; row++) { const v = cp[row * (ccols + 1) + col]; p.push([v[0], 0, v[2]], v); if (row <= crows) { const n = row * 2; if (row > 0) ix.push(n, n + 1, n + 3); ix.push(n, n + 3, n + 2); } }
    triangles(p, ix, 'woodDark', 'solid');
  }
  features.push({ name: 'Flow curved quarter', type: 'curved-quarter', height: 2.3 });

  // FLOOR: every surface reaching Y=0 has one matching cutout. No doubled flats.
  const floor = new THREE.Shape(); floor.moveTo(-75, -55); floor.lineTo(75, -55); floor.lineTo(75, 55); floor.lineTo(-75, 55); floor.closePath();
  for (const outline of holes) {
    const hole = new THREE.Path(); outline.forEach(([x, y], i) => i ? hole.lineTo(x, y) : hole.moveTo(x, y)); hole.closePath(); floor.holes.push(hole);
  }
  add(new THREE.ShapeGeometry(floor, 1).rotateX(-Math.PI / 2), 'concrete', 'rideable');

  // ARCHITECTURE: a 15 m portal rhythm, no columns inside the central sightline.
  for (const x of [-75, 75]) {
    box(x, 3.4, 0, .6, 6.8, 110, 'brick', 'solid'); box(x, 14.4, 0, .5, 14.4, 110, 'cladding', 'solid');
    box(x - Math.sign(x) * .33, 6.85, 0, .18, .3, 110, 'cream');
    for (let z = -49; z <= 49; z += 14) {
      box(x - Math.sign(x) * .32, 9.3, z, .08, 4.1, 11.7, 'glass');
      for (let pz = z - 5.6; pz <= z + 5.7; pz += 1.4) box(x - Math.sign(x) * .39, 9.3, pz, .14, 4.2, .06, 'steel');
      for (const y of [7.25, 9.3, 11.35]) box(x - Math.sign(x) * .4, y, z, .15, .08, 11.8, 'steel');
    }
  }
  for (const z of [-55, 55]) {
    box(0, 3.4, z, 150, 6.8, .6, 'brick', 'solid'); box(0, 14.4, z, 150, 14.4, .5, 'cladding', 'solid');
    box(0, 6.85, z - Math.sign(z) * .33, 150, .3, .18, 'cream');
    for (let x = -64; x <= 64; x += 16) {
      box(x, 10, z - Math.sign(z) * .33, 12, 3.6, .08, 'glass');
      for (let px = x - 6; px <= x + 6; px += 1.5) box(px, 10, z - Math.sign(z) * .4, .075, 3.7, .12, 'steel');
      for (const y of [8.2, 10, 11.8]) box(x, y, z - Math.sign(z) * .4, 12, .075, .12, 'steel');
    }
  }
  const column = (x, z) => {
    box(x, 10.3, z, .28, 20.6, .78, 'steel', 'solid');
    for (const px of [x - .31, x + .31]) box(px, 10.3, z, .16, 20.6, .78, 'steel');
    box(x, .09, z, 1.25, .18, 1.25, 'steel'); box(x, 1.05, z, .82, 2.1, .86, 'yellow');
    for (const dx of [-.47, .47]) for (const dz of [-.47, .47]) box(x + dx, .21, z + dz, .09, .08, .09, 'coping');
  };
  for (let z = -50; z <= 50; z += 12.5) { column(-73.7, z); column(73.7, z); }
  for (const z of [-53.7, 53.7]) for (let x = -60; x <= 60; x += 15) column(x, z);
  for (let z = -50; z <= 50; z += 12.5) {
    tube([-74, 19.7, z], [74, 19.7, z], .18, 'steel', null, null, true);
    tube([-74, 20.6, z], [0, 24, z], .21, 'steel', null, null, true);
    tube([0, 24, z], [74, 20.6, z], .21, 'steel', null, null, true);
    for (let x = -72; x < 72; x += 9) {
      const y = 24 - Math.abs(x) / 74 * 3.4, ny = 24 - Math.abs(x + 9) / 74 * 3.4;
      tube([x, 19.7, z], [x, y, z], .075, 'steel', null, null, true);
      tube([x, 19.7, z], [x + 9, ny, z], .085, 'steel', null, null, true);
    }
  }
  // Solid roof panels with actual inset skylight bays, not holes into empty sky.
  for (const side of [-1, 1]) for (let z = -55; z < 55; z += 11) {
    for (let x = 0; x < 75; x += 15) {
      const a = side * x, b = side * Math.min(75, x + 15), ya = 24.3 - x / 75 * 3.4, yb = 24.3 - Math.min(75, x + 15) / 75 * 3.4;
      triangles([[a, ya, z], [b, yb, z], [b, yb, z + 11], [a, ya, z + 11]], [0, 1, 2, 0, 2, 3], ((x / 15 + z / 11) % 3 === 0) ? 'glass' : 'cladding', null, null, true);
      tube([a, ya - .03, z], [b, yb - .03, z], .08, 'steel', null, null, true);
      tube([a, ya - .03, z], [a, ya - .03, z + 11], .065, 'steel', null, null, true);
    }
  }
  // Lamps are emissive reflectors, not 24 expensive shadow-casting point lights.
  for (const x of [-57, -19, 19, 57]) for (const z of [-42, -21, 0, 21, 42]) {
    tube([x, 21, z], [x, 16.6, z], .025, 'steel', null, null, true);
    add(new THREE.ConeGeometry(.62, .38, 12, 1, true).rotateX(Math.PI).translate(x, 16.5, z), 'steel', null, null, true);
    add(new THREE.CircleGeometry(.48, 12).rotateX(Math.PI / 2).translate(x, 16.37, z), 'lamp', null, null, true);
  }
  // High ducts, fans and conduits remain above every active line.
  for (const x of [-71.5, 71.5]) {
    tube([x, 15, -51], [x, 15, 51], .36, 'cladding', null, null, true, 12);
    for (let z = -44; z <= 44; z += 22) {
      box(x, 14.98, z, 1.1, 1.1, .14, 'steel', null, true);
      for (let y = 14.58; y < 15.5; y += .14) box(x, y, z + .1, 1.0, .035, .08, 'coping', null, true);
      tube([x * 1.015, 2.3, z], [x * 1.015, 14.8, z], .035, 'steel');
    }
  }
  function sign(title, subtitle, position, width, height, yaw = 0, dark = true) {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), createWarehouseSign(title, subtitle, { dark }));
    mesh.position.set(...position); mesh.rotation.y = yaw; mesh.receiveShadow = true; mesh.userData.castShadow = false; park.add(mesh);
  }
  sign('THE FOUNDRY', 'CHIMP HAWK UNDERGROUND / EST. 2026', [3, 9.2, -54.6], 24, 6);
  sign('TIMBER / 02', 'CARVE / PUMP / REPEAT', [-74.58, 4.9, -17], 13, 3.25, Math.PI / 2, false);
  sign('FLOW LAB / 04', 'SKATE EVERYTHING', [74.58, 5.1, 19], 15, 3.75, -Math.PI / 2);
  sign('STREET / 01', 'BUILD YOUR LINE', [-41, 7.1, 54.57], 16, 4, Math.PI, false);
  sign('VERT HALL / 03', 'KEEP THE LINE ALIVE', [43, 10, -54.6], 16, 4);

  // Loading bay, workshop and observation room frame the front edge, outside routes.
  for (const x of [-25, 25]) {
    box(x, 3.2, 54.58, 11, 6.4, .18, 'steel');
    for (let y = .25; y < 6.4; y += .32) box(x, y, 54.45, 10.7, .035, .06, 'coping');
    for (const px of [x - 5.65, x + 5.65]) box(px, 3.25, 54.37, .2, 6.5, .32, 'yellow');
  }
  for (const [x, z, yaw] of [[-74.52, 38, Math.PI / 2], [74.52, -38, -Math.PI / 2]]) {
    const door = new THREE.BoxGeometry(.12, 2.65, 1.6).translate(x, 1.325, z); add(door, 'oxide');
    box(x, 2.98, z, .13, .4, 1.3, 'exit'); tube([x, 1.2, z - .45], [x, 1.2, z + .45], .035, 'coping');
    sign('EXIT', 'KEEP CLEAR', [x - Math.sign(x) * .08, 3, z], 1.3, .35, yaw);
    box(x - Math.sign(x) * .2, 1.15, z + 2.4, .24, .85, .25, 'oxide');
  }
  // Workshop fenced behind the final riding apron. Selected details are batched.
  box(62, 1.1, 49, 7, .18, 1.5, 'woodDark', 'solid');
  for (const x of [59, 65]) for (const z of [48.5, 49.5]) box(x, .55, z, .16, 1.1, .16, 'steel');
  box(69.3, .8, 49, 2.3, 1.6, 1.3, 'oxide', 'solid');
  for (let y = .3; y < 1.6; y += .29) { box(69.3, y, 48.34, 2.1, .028, .03, 'rubber'); box(69.3, y + .1, 48.31, .6, .04, .04, 'coping'); }
  for (let i = 0; i < 7; i++) box(61, .11 + i * .043, 52, 6, .035, 1.8, 'edge');
  for (let i = 0; i < 4; i++) {
    const z = 51.2 + i * .14; box(-66, .25 + i * .14, z, 3.8, .13, 2.2, 'woodDark');
    for (const x of [-67.5, -66, -64.5]) box(x, .14 + i * .14, z, .16, .13, 2.2, 'woodDark');
  }
  // Observation room belongs in the front service apron, clear of the west vert.
  box(-62, 2.7, 50.9, 16, .28, 6.2, 'concrete', 'solid');
  for (const x of [-69.5, -54.5]) for (const z of [48.2, 53.6]) box(x, 1.35, z, .3, 2.7, .3, 'steel', 'solid');
  box(-62, 4.25, 53.85, 16, 2.9, .2, 'brick');
  box(-62, 4.3, 47.8, 16, 2.8, .12, 'glass');
  for (let x = -70; x <= -54; x += 2) box(x, 4.3, 47.65, .09, 2.85, .16, 'steel');
  box(-62, 5.8, 50.9, 16.5, .15, 6.6, 'steel');
  sign('FOUNDATION', 'SERVICE / REPAIR / COMMUNITY', [61.5, 4.25, 54.55], 15, 3.75, Math.PI);
  // Subtle lane edge inlays; no floating UI-like text on the floor.
  for (const x of [-20.5, 20.5]) for (let z = -12; z <= 12; z += 5) box(x, .008, z, .09, .01, 2.3, 'cream');
  for (const z of [-52.2, 52.2]) box(0, .008, z, 145, .01, .07, 'yellow');

  let visualTriangles = 0, collisionTriangles = 0;
  for (const [key, sources] of batches) {
    const [group, material] = key.split(':'); const geometry = mergeGeometries(sources, false); geometry.computeBoundingSphere();
    const mesh = new THREE.Mesh(geometry, materials[material]); mesh.name = `Foundry / ${group} / ${material}`;
    mesh.receiveShadow = true; mesh.userData.castShadow = !['glass', 'lamp', 'cream', 'yellow'].includes(material);
    // The main sun remains legible indoors. Roof panels do not seal off all key light;
    // steel trusses cast the architectural shadows instead.
    if (group === 'roof' && ['cladding', 'glass'].includes(material)) mesh.userData.castShadow = false;
    (group === 'roof' ? roof : park).add(mesh);
    for (const source of sources) source.dispose();
  }
  for (const { surface, railId, geometries } of proxies.values()) {
    const geometry = mergeGeometries(geometries, false), mesh = new THREE.Mesh(geometry, proxyMaterial);
    mesh.name = `Foundry collision / ${surface}${railId ? ` / ${railId}` : ''}`; mesh.userData.surface = surface;
    if (railId) mesh.userData.railId = railId; collision.add(mesh);
    collisionTriangles += geometry.attributes.position.count / 3;
    for (const source of geometries) source.dispose();
  }
  park.updateMatrixWorld(true); collision.updateMatrixWorld(true);
  park.traverse(o => { if (o.isMesh) visualTriangles += (o.geometry.index?.count || o.geometry.attributes.position.count) / 3; });
  const visualMeshes = []; park.traverse(o => { if (o.isMesh) visualMeshes.push(o); });
  const signatureRail = rails.find(r => r.name === 'Foundry continuous horseshoe rail');
  const signatureRailLength = signatureRail.points.slice(1).reduce((sum, p, i) => sum + new THREE.Vector3(...p).distanceTo(new THREE.Vector3(...signatureRail.points[i])), 0);
  return { park, collision, ready, manifest: {
    id: 'warehouse', name: 'THE FOUNDRY', theme: 'Industrial skate warehouse', dimensions: '150 × 110 m · FOUR CONNECTED DISTRICTS',
    transitionScale: 1, spawn: [0, .15, 43], spawnHeading: 0, rails,
    playableRegions: [{ minX: -74, maxX: 74, minZ: -54, maxZ: 54 }],
    spots: [
      { id: 'entrance', label: 'Entrance', position: [0, .15, 43], heading: 0 },
      { id: 'street', label: 'Street District', position: [-46, .15, 22], heading: Math.PI },
      { id: 'bowl', label: 'Timber Bowl', position: [-48, .15, 7], heading: 0 },
      { id: 'vert', label: 'Vert Hall', position: [5, .15, -34], heading: 0 },
      { id: 'flow', label: 'Flow Lab', position: [41, .15, 33], heading: 0 },
      { id: 'horseshoe', label: 'Horseshoe Rail', position: [-64, .15, 16], heading: Math.PI },
    ],
    views: {
      overview: { position: [94, 102, 105], target: [0, 0, -2], caption: 'The Foundry · Industrial skate warehouse', index: '01' },
      bowl: { position: [-17, 22, 7], target: [-48, -1.5, -17], caption: 'Timber Bowl · Three depths, one continuous line', index: '02' },
      street: { position: [2, 19, 51], target: [-33, 0, 22], caption: 'Street District · Build your line', index: '03' },
      top: { position: [0, 164, .01], target: [0, 0, 0], caption: 'Four connected districts · 150 × 110 metres', index: '—' },
    },
    environment: { indoor: true, background: '#919faa', fog: '#89959d', fogNear: 110, fogFar: 240, exposure: 1.05, keyColor: '#ffe6bf', keyIntensity: 2.2, keyPosition: [25, 35, 10], ambientSky: '#c5dae9', ambientGround: '#73614c', ambientIntensity: 1.7, roofFadeHeight: 18 },
    statistics: { visualTriangles, collisionTriangles, visualMeshes: visualMeshes.length, collisionMeshes: collision.children.length, rails: rails.length, signatureRailLength, materialCount: new Set(visualMeshes.map(m => m.material)).size, textureSizes },
    features, visualTriangles, collisionTriangles,
    lines: [
      { name: 'Street timber chain', route: ['Street double-bank funbox', 'Street tabletop rail', 'Low manual', 'Street low kicker east'] },
      { name: 'Stairs and tech', route: ['Nine stair parallel access bank', 'Nine stair kinked down rail', 'Street central flat rail', 'Raised manual'] },
      { name: 'Horseshoe return', route: ['Street low kicker west', 'Foundry continuous horseshoe rail', 'Street pyramid west', 'Euro takeoff'] },
      { name: 'Timber pocket loop', route: ['Timber bowl roll-in', 'Shallow pocket', 'Deep north pocket', 'East hip', 'Shallow pocket'] },
      { name: 'Competition vert', route: ['Competition halfpipe flat', 'Competition halfpipe north coping', 'Competition halfpipe south coping', 'Flat return'] },
      { name: 'Cross-zone flow', route: ['Street low kicker east', 'Flow triple rolling wave', 'Flow volcano', 'Flow north access bank', 'Vert hall return quarter'] },
    ],
  } };
}
