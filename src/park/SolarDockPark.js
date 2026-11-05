import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createSurfaceMaterials, createGraffitiMaterial } from './SurfaceMaterials.js';
import { createRooftopCity } from './RooftopCity.js';

// Metres, Y up. Every riding surface is also its collision surface; paint,
// lighting and scenery are deliberately excluded from the collision model.
export function createSolarDockPark() {
  const park = new THREE.Group();
  const collision = new THREE.Group();
  park.name = 'Chimp Hawk / sunset rooftop';
  collision.name = 'Solar Dock / authored collision';
  const rails = [];
  const batches = new Map();
  const muralMaterial = createGraffitiMaterial('TERMINAL');
  const materials = {
    ...createSurfaceMaterials(),
    graphite: new THREE.MeshStandardMaterial({ color: '#323c40', roughness: 0.72 }),
    amber: new THREE.MeshStandardMaterial({ color: '#edab38', roughness: 0.56 }),
    turquoise: new THREE.MeshStandardMaterial({ color: '#317f87', metalness: 0.25, roughness: 0.34 }),
    steel: new THREE.MeshStandardMaterial({ color: '#9bafb5', metalness: 0.82, roughness: 0.27 }),
    sand: new THREE.MeshStandardMaterial({ color: '#ae8060', roughness: 1, flatShading: true }),
    paint: new THREE.MeshStandardMaterial({ color: '#eee7d2', roughness: 0.9 }),
    guardGlass: new THREE.MeshStandardMaterial({ color: '#86bbc9', roughness: 0.15, transparent: true, opacity: 0.16, depthWrite: false }),
  };
  const proxyMaterial = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });

  function add(geometry, material, surface = null, railId = null) {
    // All batches use the same attributes, regardless of the primitive source.
    const authoredUV = geometry.userData.authoredUV;
    if (geometry.index) { const original = geometry; geometry = geometry.toNonIndexed(); original.dispose(); }
    for (const name of Object.keys(geometry.attributes)) {
      if (name !== 'position' && name !== 'normal' && name !== 'uv') geometry.deleteAttribute(name);
    }
    if (!geometry.attributes.normal) geometry.computeVertexNormals();
    if (!authoredUV) {
      const positions = geometry.attributes.position, normals = geometry.attributes.normal;
      const uv = new Float32Array(positions.count * 2);
      const scale = material === 'wood' ? 2.44 : 3.6;
      for (let i = 0; i < positions.count; i++) {
        const nx = Math.abs(normals.getX(i)), ny = Math.abs(normals.getY(i)), nz = Math.abs(normals.getZ(i));
        uv[i * 2] = (nx > ny && nx > nz ? positions.getZ(i) : positions.getX(i)) / scale;
        uv[i * 2 + 1] = (ny >= nx && ny >= nz ? positions.getZ(i) : positions.getY(i)) / scale;
      }
      geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    }
    if (!batches.has(material)) batches.set(material, []);
    batches.get(material).push(geometry);
    if (surface) {
      const proxy = new THREE.Mesh(geometry.clone(), proxyMaterial);
      proxy.userData.surface = surface;
      if (railId) proxy.userData.railId = railId;
      collision.add(proxy);
    }
  }

  function box(x, y, z, w, h, d, material, surface = null) {
    add(new THREE.BoxGeometry(w, h, d).translate(x, y, z), material, surface);
  }

  function triangles(points, indices, material, surface = 'rideable', uv = null) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(points.flat(), 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    if (uv) { geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geometry.userData.authoredUV = true; }
    add(geometry, material, surface);
  }

  function tube(a, b, radius, material, surface = null, railId = null) {
    const start = new THREE.Vector3(...a), end = new THREE.Vector3(...b);
    const delta = end.clone().sub(start);
    const geometry = new THREE.CylinderGeometry(radius, radius, delta.length(), 8);
    geometry.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.normalize()));
    geometry.translate(...start.add(end).multiplyScalar(0.5).toArray());
    add(geometry, material, surface, railId);
  }

  function rail(name, points, { coping = false, transition = null, posts = true } = {}) {
    const radius = coping ? 0.045 : 0.095;
    rails.push({ name, points, radius, ...(transition ? { transition } : {}) });
    for (let i = 1; i < points.length; i++) {
      tube(points[i - 1], points[i], radius, coping ? 'steel' : 'turquoise', coping ? null : 'solid', name);
    }
    if (!coping && posts) {
      for (const t of [0.08, 0.5, 0.92]) {
        const p = new THREE.Vector3(...points[0]).lerp(new THREE.Vector3(...points.at(-1)), t);
        tube([p.x, 0.04, p.z], p.toArray(), 0.055, 'graphite', 'solid', name);
      }
    }
  }

  const transition = (id, type, axisMode = 'LINEAR') => ({
    id, type, axisMode, supportsVert: true, supportsTransfer: true,
    supportsPump: true, supportsLipTricks: true, cameraHint: type,
  });

  // Extruded continuous profile. Upper faces always point up; side/back faces
  // are separate so smooth shading never rounds a hard collision edge.
  function profile(x, width, samples, material = 'wood', yaw = 0, originZ = 0) {
    const transform = ([px, py, pz]) => [
      x + px * Math.cos(yaw) + pz * Math.sin(yaw), py,
      originZ - px * Math.sin(yaw) + pz * Math.cos(yaw),
    ];
    const points = samples.flatMap(([z, y]) => [transform([-width / 2, y, z]), transform([width / 2, y, z])]);
    const indices = [];
    const descendingZ = samples.at(-1)[0] < samples[0][0];
    for (let i = 0; i < samples.length - 1; i++) {
      const a = i * 2, b = a + 2;
      indices.push(...(descendingZ ? [a, a + 1, b, a + 1, b + 1, b] : [a, b, a + 1, a + 1, b, b + 1]));
    }
    let arcLength = 0;
    const uv = samples.flatMap(([z, y], i) => {
      if (i) arcLength += Math.hypot(z - samples[i - 1][0], y - samples[i - 1][1]);
      return [0, arcLength / 2.44, width / 2.44, arcLength / 2.44];
    });
    triangles(points, indices, material, 'rideable', uv);
    // Painted artwork follows the exact ramp profile; it is a visual decal,
    // never a second contact surface. Keep exposed plywood along both edges.
    if (width >= 8) {
      const decal = new THREE.BufferGeometry();
      const p = samples.flatMap(([z, y]) => [transform([-width * 0.32, y + 0.025, z]), transform([width * 0.32, y + 0.025, z])]);
      const artUV = uv.map((value, i) => i % 4 === 0 ? 0 : i % 4 === 2 ? 1 : value / 4);
      decal.setAttribute('position', new THREE.Float32BufferAttribute(p.flat(), 3));
      decal.setAttribute('uv', new THREE.Float32BufferAttribute(artUV, 2));
      decal.setIndex(indices); decal.computeVertexNormals();
      const mesh = new THREE.Mesh(decal, muralMaterial); mesh.userData.castShadow = false; mesh.receiveShadow = true; park.add(mesh);
    }
    for (const side of [-1, 1]) {
      const vertices = [], faces = [];
      for (let i = 0; i < samples.length - 1; i++) {
        const [z0, y0] = samples[i], [z1, y1] = samples[i + 1];
        const base = vertices.length;
        vertices.push(...[[side * width / 2, 0, z0], [side * width / 2, y0, z0],
          [side * width / 2, y1, z1], [side * width / 2, 0, z1]].map(transform));
        if (y0 > 0) faces.push(base, base + 1, base + 2);
        if (y1 > 0) faces.push(base, base + 2, base + 3);
      }
      if (side * (descendingZ ? 1 : -1) > 0) {
        for (let i = 0; i < faces.length; i += 3) [faces[i + 1], faces[i + 2]] = [faces[i + 2], faces[i + 1]];
      }
      if (faces.length) triangles(vertices, faces, 'concrete', 'solid');
    }
    for (const [end, [z, y]] of [samples[0], samples.at(-1)].entries()) {
      if (y < 0.001) continue;
      triangles([[-width / 2, 0, z], [width / 2, 0, z], [width / 2, y, z], [-width / 2, y, z]].map(transform),
        (end === 0) === descendingZ ? [0, 1, 2, 0, 2, 3] : [0, 2, 1, 0, 3, 2], 'concrete', 'solid');
    }
    return transform;
  }

  function quarter(name, x, z, width, radius, yaw = 0) {
    const samples = Array.from({ length: 21 }, (_, i) => {
      const angle = i / 20 * Math.PI / 2;
      return [-radius * Math.sin(angle), radius * (1 - Math.cos(angle))];
    });
    // The deck belongs to the same profile: no hidden back wall at the coping.
    samples.push([-radius - 2.5, radius]);
    const transform = profile(x, width, samples, 'wood', yaw, z);
    rail(`${name} coping`, [-width / 2, width / 2].map(px => transform([px, radius + 0.025, -radius])),
      { coping: true, transition: transition(name, radius >= 4 ? 'VERT' : 'MINI') });
    for (const side of [-1, 1]) {
      for (let i = 1; i < samples.length; i++) {
        tube(transform([side * (width / 2 - 0.18), samples[i - 1][1] + 0.018, samples[i - 1][0]]),
          transform([side * (width / 2 - 0.18), samples[i][1] + 0.018, samples[i][0]]), 0.025, 'amber');
      }
    }
  }

  // Cut the plaza away wherever a wooden flat bottom occupies the same height.
  // Coplanar concrete used to show through the mega ramp as triangular patches.
  const floor = new THREE.Shape();
  floor.moveTo(-54, -66); floor.lineTo(54, -66); floor.lineTo(54, 82); floor.lineTo(-54, 82); floor.closePath();
  const hole = new THREE.Path();
  hole.absarc(-28, 24, 14, 0, Math.PI * 2, true);
  floor.holes.push(hole);
  for (const [minX, maxX, minZ, maxZ] of [[-37.5, -18.5, 23, 33], [23, 41, 3, 10]]) {
    const opening = new THREE.Path();
    opening.moveTo(minX, -minZ); opening.lineTo(maxX, -minZ);
    opening.lineTo(maxX, -maxZ); opening.lineTo(minX, -maxZ); opening.closePath();
    floor.holes.push(opening);
  }
  add(new THREE.ShapeGeometry(floor, 48).rotateX(-Math.PI / 2), 'concrete', 'rideable');

  // Bowl: 3.8 m deep, broad flat bottom, a full round transition and continuous
  // coping. The rim has exactly the same 96 segments as the hole in the plaza.
  const cx = -28, cz = -24, depth = 3.8, outerRadius = 14, bottomRadius = outerRadius - depth;
  const bowlPoints = [], bowlIndices = [];
  for (let row = 0; row <= 20; row++) {
    const angle = row / 20 * Math.PI / 2;
    const radius = bottomRadius + depth * Math.sin(angle), y = -depth * Math.cos(angle);
    for (let col = 0; col <= 96; col++) {
      const theta = col / 96 * Math.PI * 2;
      bowlPoints.push([cx + radius * Math.cos(theta), y, cz + radius * Math.sin(theta)]);
    }
  }
  for (let row = 0; row < 20; row++) for (let col = 0; col < 96; col++) {
    const a = row * 97 + col, b = a + 97;
    bowlIndices.push(a, a + 1, b, a + 1, b + 1, b);
  }
  triangles(bowlPoints, bowlIndices, 'bowl');
  add(new THREE.CircleGeometry(bottomRadius, 96).rotateX(-Math.PI / 2).translate(cx, -depth, cz), 'bowl', 'rideable');
  const rim = Array.from({ length: 97 }, (_, i) => [cx + outerRadius * Math.cos(i / 96 * Math.PI * 2),
    0.025, cz + outerRadius * Math.sin(i / 96 * Math.PI * 2)]);
  rail('Orbit pool coping', rim, { coping: true, transition: transition('orbit-pool', 'BOWL', 'RADIAL') });
  // Wide coloured rim stays outside the skating surface opening.
  add(new THREE.RingGeometry(14.12, 14.65, 96).rotateX(-Math.PI / 2).translate(cx, 0.008, cz), 'turquoise');
  add(new THREE.RingGeometry(14.85, 14.9, 96).rotateX(-Math.PI / 2).translate(cx, 0.009, cz), 'paint');

  // One continuous wooden half-pipe, including its ten-metre flat bottom.
  // Shared vertices and arc-length UVs carry both collision and grain through
  // each transition without a concrete seam or a hidden wall at the join.
  const halfpipe = [[16.7, 3.8]];
  for (let i = 20; i >= 0; i--) {
    const a = i / 20 * Math.PI / 2;
    halfpipe.push([23 - 3.8 * Math.sin(a), 3.8 * (1 - Math.cos(a))]);
  }
  for (let i = 0; i <= 20; i++) {
    const a = i / 20 * Math.PI / 2;
    halfpipe.push([33 + 3.8 * Math.sin(a), 3.8 * (1 - Math.cos(a))]);
  }
  halfpipe.push([39.3, 3.8]);
  profile(-28, 19, halfpipe);
  for (const [name, z] of [['Dock halfpipe north', 19.2], ['Dock halfpipe south', 36.8]]) {
    rail(`${name} coping`, [[-37.5, 3.825, z], [-18.5, 3.825, z]],
      { coping: true, transition: transition(name, 'MINI') });
  }
  for (const x of [-37.32, -18.68]) for (let i = 1; i < halfpipe.length; i++) {
    tube([x, halfpipe[i - 1][1] + 0.018, halfpipe[i - 1][0]],
      [x, halfpipe[i][1] + 0.018, halfpipe[i][0]], 0.025, 'amber');
  }
  quarter('North terminal vert', -2, -57, 27, 5);
  quarter('East return quarter', 32, -60, 20, 4.5);

  // Street: generous run-ups, bank-to-bank tabletop, pyramid/hip and ledges.
  profile(0, 12, [[22, 0], [17, 1.6], [12, 1.6], [7, 0]]);
  rail('Tabletop rail', [[-3, 2.35, 18], [-3, 2.35, 11]], { posts: false });
  tube([-3, 1.6, 16.5], [-3, 2.35, 16.5], 0.055, 'graphite', 'solid', 'Tabletop rail');
  tube([-3, 1.6, 12.5], [-3, 2.35, 12.5], 0.055, 'graphite', 'solid', 'Tabletop rail');
  // Four bank faces meet a square tabletop. Each face is a real riding plane.
  const inner = [[-2, 1.35, -6], [2, 1.35, -6], [2, 1.35, -10], [-2, 1.35, -10]];
  const outer = [[-7, 0, -1], [7, 0, -1], [7, 0, -15], [-7, 0, -15]];
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4;
    triangles([outer[i], outer[j], inner[j], inner[i]], [0, 1, 2, 0, 2, 3], 'graphite');
  }
  triangles(inner, [0, 1, 2, 0, 2, 3], 'graphite');
  box(-4, 0.3, 35, 3, 0.6, 9, 'bowl', 'rideable');
  rail('Manual pad edge', [[-5.48, 0.63, 30.5], [-5.48, 0.63, 39.5]], { coping: true });
  box(10, 0.45, -29, 3, 0.9, 11, 'bowl', 'rideable');
  rail('Long ledge', [[8.53, 0.93, -34.5], [8.53, 0.93, -23.5]], { coping: true });
  rail('Street flat rail', [[-10, 0.8, 29], [-10, 0.8, 47]]);
  rail('North flat rail', [[0, 0.85, -28], [0, 0.85, -48]]);
  // One rail ID and one uninterrupted path: 47 m straight, a 180-degree
  // return arc, then 47 m straight. Both ends have open, obstacle-free run-ups.
  const returnRail = [[-48, 0.95, 2], [-48, 0.95, 49]];
  for (let i = 1; i <= 64; i++) {
    const a = Math.PI - i / 64 * Math.PI;
    returnRail.push([-30 + 18 * Math.cos(a), 0.95, 49 + 10 * Math.sin(a)]);
  }
  returnRail.push([-12, 0.95, 2]);
  rail('Solar express continuous return rail', returnRail, { posts: false });
  for (const x of [-48, -12]) for (let z = 5; z <= 49; z += 5.5)
    tube([x, 0.04, z], [x, 0.95, z], 0.08, 'graphite', 'solid', 'Solar express continuous return rail');
  for (let i = 6; i <= 60; i += 6) {
    const p = returnRail[i + 1];
    tube([p[0], 0.04, p[2]], p, 0.08, 'graphite', 'solid', 'Solar express continuous return rail');
  }
  // Stair set with a parallel bank and down rail, outside the main run-up lanes.
  profile(-28, 10, [[-55, 0], [-60, 1.8], [-64.5, 1.8]]);
  for (let i = 0; i < 6; i++) box(-36, (i + 1) * 0.15, -55 - i * 0.75, 6, (i + 1) * 0.3, 0.75, 'bowl', 'rideable');
  box(-36, 0.9, -61.875, 6, 1.8, 5.25, 'bowl', 'rideable');
  rail('Six stair down rail', [[-36, 1, -54.7], [-36, 2.65, -59.6]], { posts: false });
  tube([-36, 0.3, -55.3], [-36, 1.2, -55.3], 0.055, 'graphite', 'solid', 'Six stair down rail');
  tube([-36, 1.8, -59], [-36, 2.45, -59], 0.055, 'graphite', 'solid', 'Six stair down rail');

  // Mega line: 11 m roll-in, 7 m gap, broad landing and a separate return wall.
  // The launch is a kicker (not a vert lip), so it retains forward momentum.
  const rollIn = [[58, 11], [52, 11]];
  for (let i = 1; i <= 42; i++) {
    const t = i / 42;
    rollIn.push([52 - t * 42, 11 * (1 - t * t * (3 - 2 * t))]);
  }
  rollIn.push([3, 0]);
  // Circular kicker ends at 58 degrees, substantially steeper than the old bank.
  const launchAngle = 58 * Math.PI / 180, launchRadius = 8 / Math.sin(launchAngle);
  for (let i = 1; i <= 32; i++) {
    const a = i / 32 * launchAngle;
    rollIn.push([3 - launchRadius * Math.sin(a), launchRadius * (1 - Math.cos(a))]);
  }
  profile(32, 18, rollIn);
  const landing = Array.from({ length: 29 }, (_, i) => {
    const t = i / 28;
    return [-12 - 19 * t, 2.4 * (1 - t) * (1 - t)];
  });
  profile(32, 21, landing);
  // Sloped side access reaches the start deck without requiring a teleport.
  profile(47, 8, [[7, 0], [58, 11], [62, 11]]);
  box(37.5, 5.5, 60, 27, 11, 4, 'graphite', 'rideable');
  for (const x of [23.25, 40.75]) {
    for (let i = 1; i < rollIn.length; i++) tube([x, rollIn[i - 1][1] + 0.02, rollIn[i - 1][0]],
      [x, rollIn[i][1] + 0.02, rollIn[i][0]], 0.035, 'amber');
  }
  box(32, 0.012, -8.5, 18, 0.012, 7, 'amber');
  for (let i = 0; i < 8; i++) box(24 + i * 2.25, 0.022, -8.5, 0.85, 0.01, 7, 'graphite');

  // Perimeter: flush painted apron and a visible low wall at the playable limit.
  for (const x of [-53.8, 53.8]) box(x, 0.4, -8, 0.4, 0.8, 148, 'graphite', 'solid');
  for (const z of [-81.8, 65.8]) box(0, 0.4, z, 108, 0.8, 0.4, 'graphite', 'solid');
  // Continuous safety railing: collidable infill, visible uprights and three
  // horizontal bars. It stays outside the established riding boundary.
  for (const x of [-53.8,53.8]) {
    for (let z=-81.8;z<=65.8;z+=3.075) box(x,1.55,z,.095,1.7,.095,'steel');
    for (const y of [1.05,1.7,2.4]) tube([x,y,-81.8],[x,y,65.8],.045,'steel');
    box(x,1.55,-8,.08,1.7,147.6,'guardGlass','solid');
  }
  for (const z of [-81.8,65.8]) {
    for (let x=-53.8;x<=53.8;x+=3.075) box(x,1.55,z,.095,1.7,.095,'steel');
    for (const y of [1.05,1.7,2.4]) tube([-53.8,y,z],[53.8,y,z],.045,'steel');
    box(0,1.55,z,107.6,1.7,.08,'guardGlass','solid');
  }
  for (const x of [-52.5, 52.5]) box(x, 0.009, -8, 0.14, 0.012, 144, 'amber');
  for (const z of [-80.5, 64.5]) box(0, 0.009, z, 105, 0.012, 0.14, 'amber');

  function mural(word, position, width, height, yaw = 0, seed = 15) {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), createGraffitiMaterial(word, seed));
    mesh.position.set(...position); mesh.rotation.y = yaw;
    mesh.receiveShadow = true; mesh.userData.castShadow = false;
    park.add(mesh);
  }
  mural('FLOW', [-28, 1.9, 16.69], 17, 3.1, Math.PI);
  mural('SOLAR', [-28, 1.9, 39.31], 17, 3.1);
  mural('AIRTIME', [22.99, 6.5, 47], 9, 3.4, -Math.PI / 2, 39);
  mural('NO LIMITS', [-2, 2.6, -64.51], 23, 3.8, Math.PI, 73);
  for (const [x, z, width, height, yaw] of [[0,38,15,7,0], [9,-23,13,6,0.35],
    [-27,-24,17,10,0], [31,-39,17,8,0], [-2,-39,11,7,-0.2], [-26,49,20,7,0], [0,-8,3.8,3.8,0]]) {
    const decal = new THREE.Mesh(new THREE.PlaneGeometry(width, height), muralMaterial);
    decal.rotation.set(-Math.PI / 2, 0, yaw);
    // The pool floor is recessed; the pyramid top has its own raised artwork.
    decal.position.set(x, x === -27 ? -depth + 0.025 : z === -8 ? 1.375 : 0.025, z);
    decal.userData.castShadow = false; decal.receiveShadow = true; park.add(decal);
  }
  // Pool mural conforms to the actual curved wall instead of floating in space.
  const muralPoints = [], muralUV = [], muralIndices = [];
  for (let row = 0; row <= 8; row++) for (let col = 0; col <= 24; col++) {
    const angle = 0.3 + row / 8 * 0.9, theta = -Math.PI / 2 - 0.55 + col / 24 * 1.1;
    const r = bottomRadius + depth * Math.sin(angle) - 0.014 * Math.sin(angle);
    muralPoints.push(cx + r * Math.cos(theta), -depth * Math.cos(angle) + 0.014 * Math.cos(angle), cz + r * Math.sin(theta));
    muralUV.push(col / 24, row / 8);
    if (row < 8 && col < 24) { const a = row * 25 + col; muralIndices.push(a, a + 1, a + 25, a + 1, a + 26, a + 25); }
  }
  const muralGeometry = new THREE.BufferGeometry();
  muralGeometry.setAttribute('position', new THREE.Float32BufferAttribute(muralPoints, 3));
  muralGeometry.setAttribute('uv', new THREE.Float32BufferAttribute(muralUV, 2));
  muralGeometry.setIndex(muralIndices); muralGeometry.computeVertexNormals();
  for (let i = 0; i < 6; i++) {
    const g = muralGeometry.clone().translate(-cx, 0, -cz).rotateY(i * Math.PI / 3).translate(cx, 0, cz);
    const poolMural = new THREE.Mesh(g, muralMaterial);
    poolMural.userData.castShadow = false; poolMural.receiveShadow = true; park.add(poolMural);
  }
  muralGeometry.dispose();
  for (let z = -47; z <= 47; z += 8) box(17.2, 0.012, z, 0.12, 0.015, 3, 'paint');

  // The same translucent mural material is used throughout the park.
  // Four spatial batches keep frustum culling useful without submitting a
  // separate WebGL draw for every profile decal, floor logo and bowl segment.
  // Art is visual-only: do not touch collision proxies, rails or transitions.
  const muralZones = new Map();
  for (const mesh of park.children) {
    if (!mesh.isMesh || mesh.material !== muralMaterial) continue;
    mesh.updateMatrix();
    const geometry = mesh.geometry.clone().applyMatrix4(mesh.matrix);
    geometry.computeBoundingBox();
    const center = geometry.boundingBox.getCenter(new THREE.Vector3());
    const zone = (center.x < 0 ? 'west-' : 'east-') + (center.z < 0 ? 'north' : 'south');
    if (!muralZones.has(zone)) muralZones.set(zone, []);
    muralZones.get(zone).push({ mesh, geometry });
  }
  for (const [zone, entries] of muralZones) {
    const merged = mergeGeometries(entries.map(entry => entry.geometry), false);
    for (const entry of entries) entry.geometry.dispose();
    if (!merged) continue; // Preserve originals rather than dropping art.
    const artwork = new THREE.Mesh(merged, muralMaterial);
    artwork.name = 'Solar Dock / mural batch / ' + zone;
    artwork.userData.castShadow = false;
    artwork.receiveShadow = true;
    for (const entry of entries) {
      park.remove(entry.mesh);
      entry.mesh.geometry.dispose();
    }
    park.add(artwork);
  }

  park.add(createRooftopCity());

  let visualTriangles = 0;
  for (const [material, geometries] of batches) {
    const geometry = mergeGeometries(geometries, false);
    geometry.computeBoundingSphere();
    const mesh = new THREE.Mesh(geometry, materials[material]);
    mesh.name = `Solar Dock / ${material}`;
    mesh.userData.castShadow = !['paint','sand','guardGlass'].includes(material);
    park.add(mesh);
    visualTriangles += geometry.attributes.position.count / 3;
    for (const source of geometries) source.dispose();
  }
  // Merge rideable collision proxies too. Keep solid rail IDs separate so a
  // grind can ignore only its own rail, never unrelated obstacles.
  const riding = collision.children.filter(mesh => mesh.userData.surface === 'rideable');
  const rideGeometry = mergeGeometries(riding.map(mesh => mesh.geometry), false);
  for (const mesh of riding) { collision.remove(mesh); mesh.geometry.dispose(); }
  const rideMesh = new THREE.Mesh(rideGeometry, proxyMaterial);
  rideMesh.userData.surface = 'rideable'; collision.add(rideMesh);
  park.updateMatrixWorld(true); collision.updateMatrixWorld(true);
  visualTriangles = 0;
  park.traverse(mesh => { if (mesh.isMesh) visualTriangles += (mesh.geometry.index?.count || mesh.geometry.attributes.position.count) / 3; });

  return { park, collision, manifest: {
    name: 'CHIMP HAWK', theme: 'Sunset cloud rooftop', visualTriangles,
    dimensions: '108 × 148 m · 4 SKATE ZONES', transitionScale: 1,
    spawn: [0, 0.15, 41], rails,
    playableRegions: [{ minX: -53.3, maxX: 53.3, minZ: -81.3, maxZ: 65.3 }],
    spots: [
      { id: 'street', label: 'Street', position: [0, 0.15, 41] },
      { id: 'bowl', label: 'Pool', position: [-28, -3.65, -24] },
      { id: 'flow', label: 'Half-pipe', position: [-28, 0.15, 28] },
      { id: 'mega', label: 'Mega', position: [32, 11.15, 55] },
      { id: 'rail', label: 'Long rail', position: [-48, 0.15, -3], heading: Math.PI },
    ],
    views: {
      overview: { position: [122, 110, 145], target: [0, 0, -8], caption: 'Solar Dock · Desert skate terminal', index: '01' },
      bowl: { position: [3, 28, 12], target: [-28, -1.5, -24], caption: 'Orbit pool · Continuous transitions', index: '02' },
      street: { position: [22, 23, 47], target: [0, 0, 8], caption: 'Street terminal · Build your line', index: '03' },
      top: { position: [0, 173, -7.99], target: [0, 0, -8], caption: 'Four zones. One connected park.', index: '—' },
    },
  } };
}
