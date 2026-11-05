import fs from 'node:fs';
import * as THREE from 'three';

// Repairs the revision-3 artist GLB directly. Embedded images, UVs, materials,
// lights and the sky remain byte-identical; only edited geometry is appended.
const [input, output] = process.argv.slice(2);
if (!input || !output || input === output) throw new Error('Usage: node tools/repair-paradise-collision.mjs input.glb output.glb');
const source = fs.readFileSync(input);
const jsonLength = source.readUInt32LE(12);
const doc = JSON.parse(source.subarray(20, 20 + jsonLength));
const originalBin = source.subarray(28 + jsonLength);
const chunks = [originalBin];
let binLength = originalBin.length;
const anchor = doc.nodes.find(n => n.extras?.streetSkateMap);
const manifest = JSON.parse(anchor.extras.streetSkateMap);
if (manifest.collisionRevision !== 3) throw new Error('Expected the released revision-3 Paradise asset');
const report = { loweredRimVertices: 0, removedCollapsedFaces: 0, stairSideTriangles: 0, railColliders: [], repairedNormals: 0, restoredBankTriangles: 0 };
const components = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };
const types = { 5121: Uint8Array, 5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array };
function readAccessor(i) {
  const a = doc.accessors[i], v = doc.bufferViews[a.bufferView], Type = types[a.componentType];
  const width = components[a.type], bytes = Type.BYTES_PER_ELEMENT, result = new Type(a.count * width);
  const stride = v.byteStride || width * bytes, offset = (v.byteOffset || 0) + (a.byteOffset || 0);
  for (let j = 0; j < a.count; j++) {
    const row = originalBin.subarray(offset + j * stride, offset + j * stride + width * bytes);
    result.set(new Type(row.buffer.slice(row.byteOffset, row.byteOffset + row.byteLength)), j * width);
  }
  return result;
}
function appendAccessor(array, type, target) {
  const pad = (4 - binLength % 4) % 4;
  if (pad) { chunks.push(Buffer.alloc(pad)); binLength += pad; }
  const data = Buffer.from(array.buffer, array.byteOffset, array.byteLength);
  const view = doc.bufferViews.length;
  doc.bufferViews.push({ buffer: 0, byteOffset: binLength, byteLength: data.length, target });
  chunks.push(data); binLength += data.length;
  const a = { bufferView: view, componentType: array instanceof Float32Array ? 5126 : 5125,
    count: array.length / components[type], type };
  if (type === 'VEC3') {
    a.min = [Infinity, Infinity, Infinity]; a.max = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < array.length; i++) {
      a.min[i % 3] = Math.min(a.min[i % 3], array[i]); a.max[i % 3] = Math.max(a.max[i % 3], array[i]);
    }
  }
  return doc.accessors.push(a) - 1;
}
function geometry(p) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(readAccessor(p.attributes.POSITION), 3));
  if (p.indices !== undefined) g.setIndex(new THREE.BufferAttribute(readAccessor(p.indices), 1));
  return g;
}
function triangles(g, callback) {
  const pos = g.attributes.position, idx = g.index, count = idx?.count || pos.count;
  for (let i = 0; i < count; i += 3) {
    const ids = [0, 1, 2].map(j => idx ? idx.getX(i + j) : i + j);
    const points = ids.map(j => new THREE.Vector3().fromBufferAttribute(pos, j));
    callback(points, ids, i);
  }
}
const hiddenMaterial = doc.materials.findIndex(m => m.name?.startsWith('Collision /'));
if (hiddenMaterial < 0) throw new Error('Collision material missing');
function addCollision(name, positions, extras) {
  if (!positions.length) return;
  const mesh = doc.meshes.push({ name, primitives: [{ attributes: {
    POSITION: appendAccessor(new Float32Array(positions), 'VEC3', 34962),
  }, material: hiddenMaterial }] }) - 1;
  const node = doc.nodes.push({ name, mesh, extras: { streetSkateRole: 'collision', ...extras } }) - 1;
  doc.scenes[doc.scene || 0].nodes.push(node);
}
const rimPaths = [manifest.rails[20].points, manifest.rails[23].points];
function pathDistance(v, points) {
  let nearest = Infinity;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i], dx = b[0] - a[0], dz = b[2] - a[2];
    const t = THREE.MathUtils.clamp(((v.x - a[0]) * dx + (v.z - a[2]) * dz) / (dx * dx + dz * dz), 0, 1);
    nearest = Math.min(nearest, Math.hypot(v.x - a[0] - t * dx, v.z - a[2] - t * dz));
  }
  return nearest;
}
const baseY = 4.134769439697266;
for (const node of doc.nodes) {
  if (!['G-Object.022', 'Collision / G-Object.022 / rideable', 'Collision / G-Object.022 / solid'].includes(node.name)) continue;
  if (node.translation || node.rotation || node.scale || node.matrix) throw new Error('Unexpected transformed Paradise mesh');
  for (const p of doc.meshes[node.mesh].primitives) {
    const g = geometry(p), pos = g.attributes.position, before = pos.array.slice();
    let changed = false;
    for (let i = 0; i < pos.count; i++) {
      const v = new THREE.Vector3().fromBufferAttribute(pos, i);
      if (v.y <= baseY + .004 || v.y > 5.05) continue;
      const distances = rimPaths.map(path => pathDistance(v, path));
      if (Math.min(...distances) > .36) continue;
      const drop = v.y > 4.72 || distances[0] < distances[1] ? .72 : .42;
      pos.setY(i, Math.max(baseY, v.y - drop)); changed = true; report.loweredRimVertices++;
    }
    if (!changed) continue;
    const indices = [], seen = new Set();
    triangles(g, (v, ids) => {
      const triangle = new THREE.Triangle(...v);
      const collapsedUpperFace = ids.every(i => before[i * 3 + 1] > baseY + .18)
        && v.every(p => Math.abs(p.y - baseY) < .001);
      const key = v.map(p => p.toArray().map(n => n.toFixed(5)).join(',')).sort().join('|');
      if (triangle.getArea() < 1e-8 || collapsedUpperFace || seen.has(key)) { report.removedCollapsedFaces++; return; }
      seen.add(key); indices.push(...ids);
    });
    g.setIndex(indices); g.computeVertexNormals();
    p.attributes.POSITION = appendAccessor(pos.array, 'VEC3', 34962);
    p.attributes.NORMAL = appendAccessor(g.attributes.normal.array, 'VEC3', 34962);
    delete p.attributes.TANGENT;
    p.indices = appendAccessor(new Uint32Array(indices), 'SCALAR', 34963);
    g.dispose();
  }
}
for (const i of [20, 23]) {
  for (const p of manifest.rails[i].points) p[1] = baseY + .035;
}
manifest.rails[20].transition = { id: 'paradise-ramp-20', type: 'QUARTER', axisMode: 'RADIAL',
  supportsVert: true, supportsTransfer: true, supportsPump: true, supportsLipTricks: true, geometryRole: 'LIP' };

// The original stair mask removed every face within its rectangle, including
// the visible side panels. Restore those exact vertical faces, not a box that
// would fill the adjoining quarter-pipe or the arch underneath the platform.
const stairs = [
  { x0: 116.6745, x1: 124.419, z0: -111.63, z1: -97.35 },
  { x0: 120.261, x1: 126.024, z0: -69.57, z1: -56.98 },
];
const originalRim = doc.nodes.find(n => n.name === 'G-Object.022' && n.extras?.streetSkateRole === 'visual');
// Read source primitives, as readAccessor intentionally refers to original BIN.
const originalDoc = JSON.parse(source.subarray(20, 20 + jsonLength));
const originalRimMesh = originalDoc.meshes[originalDoc.nodes.find(n => n.name === originalRim.name && n.mesh !== undefined).mesh];
const stairSides = [];
for (const p of originalRimMesh.primitives) {
  if (/coping|metal/i.test(doc.materials[p.material]?.name || '')) continue;
  const g = geometry(p);
  triangles(g, v => {
    const center = new THREE.Triangle(...v).getMidpoint(new THREE.Vector3());
    if (!stairs.some(s => center.z >= s.z0 - .02 && center.z <= s.z1 + .02
      && [s.x0, s.x1].some(x => v.every(p => Math.abs(p.x - x) < .035)))) return;
    const n = new THREE.Triangle(...v).getNormal(new THREE.Vector3());
    if (Math.abs(n.x) < .98) return;
    for (const p of v) stairSides.push(...p.toArray());
  });
  g.dispose();
}
report.stairSideTriangles = stairSides.length / 9;
addCollision('Collision / restored stair sidewalls', stairSides, { surface: 'solid' });

// The south fan's old triangular proxy climbed along Z, while the visible bank
// climbs along X. Use the artist's actual planar bank, including its outer half.
const bank = [];
for (const p of originalRimMesh.primitives) {
  if (!/concrete/i.test(doc.materials[p.material]?.name || '')) continue;
  const g = geometry(p);
  triangles(g, v => {
    const n = new THREE.Triangle(...v).getNormal(new THREE.Vector3());
    if (n.y < .90 || n.y > .93 || Math.abs(n.z) > .001 || n.x > -.39) return;
    if (!v.every(p => p.x >= 44.80 && p.x <= 53.16 && p.z >= -9.05 && p.z <= -4.39)) return;
    v.forEach(p => bank.push(...p.toArray()));
  });
  g.dispose();
}
if (bank.length < 9) throw new Error('South entrance bank was not found');
const fanNode = doc.nodes.find(n => n.name === 'Collision / South stair fan ramp');
doc.meshes[fanNode.mesh].primitives = [{ attributes: {
  POSITION: appendAccessor(new Float32Array(bank), 'VEC3', 34962),
}, material: hiddenMaterial }];
report.restoredBankTriangles = bank.length / 9;

// Two reverse-wound faces on the north island's low launch ramp were classified
// as structural backing. Flip the visible faces and move their exact triangles
// to wheel support so a descent hits the ramp from above.
const northNode = doc.nodes.find(n => n.name === 'G-Object.023' && n.extras?.streetSkateRole === 'visual');
const northRepair = [];
const flippedFaceKeys = new Set();
const faceKey = v => v.map(p => p.toArray().map(n => n.toFixed(4)).join(',')).sort().join('|');
for (const p of doc.meshes[northNode.mesh].primitives) {
  if (!/concrete/i.test(doc.materials[p.material]?.name || '')) continue;
  const g = geometry(p), indices = []; let changed = false;
  triangles(g, (v, ids) => {
    const t = new THREE.Triangle(...v), c = t.getMidpoint(new THREE.Vector3()), n = t.getNormal(new THREE.Vector3());
    if (n.y < -.1 && c.y > 5.92 && c.y < 7 && t.getArea() > .5) {
      indices.push(ids[2], ids[1], ids[0]);
      for (const point of [...v].reverse()) northRepair.push(...point.toArray());
      flippedFaceKeys.add(faceKey(v)); report.repairedNormals++; changed = true;
    } else indices.push(...ids);
  });
  if (changed) {
    g.setIndex(indices); g.computeVertexNormals();
    p.indices = appendAccessor(new Uint32Array(indices), 'SCALAR', 34963);
    p.attributes.NORMAL = appendAccessor(g.attributes.normal.array, 'VEC3', 34962);
    delete p.attributes.TANGENT;
  }
  g.dispose();
}
const northSolid = doc.nodes.find(n => n.name === 'Collision / G-Object.023 / solid');
for (const p of doc.meshes[northSolid.mesh].primitives) {
  const g = geometry(p), indices = [];
  triangles(g, (v, ids) => { if (!flippedFaceKeys.has(faceKey(v))) indices.push(...ids); });
  p.indices = appendAccessor(new Uint32Array(indices), 'SCALAR', 34963); g.dispose();
}
addCollision('Collision / north island repaired landing ramp', northRepair, { surface: 'rideable', transitionSkin: true });

// Every freestanding grind tube now has a closed finite collider. A grind can
// ignore its own named tube; approaching it on the ground cannot pass through.
for (const rail of manifest.rails.filter(r => !r.transition)) {
  const positions = [];
  for (let i = 1; i < rail.points.length; i++) {
    const a = new THREE.Vector3(...rail.points[i - 1]), b = new THREE.Vector3(...rail.points[i]);
    const delta = b.clone().sub(a), length = delta.length();
    if (length < .005) continue;
    const g = new THREE.CylinderGeometry(rail.radius, rail.radius, length, 12, 1, false);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.normalize()));
    g.translate(...a.add(b).multiplyScalar(.5).toArray());
    triangles(g, v => v.forEach(p => positions.push(...p.toArray()))); g.dispose();
  }
  addCollision(`Collision / grind bar / ${rail.name}`, positions,
    { surface: 'solid', railId: rail.name, cameraTransparent: true });
  report.railColliders.push({ name: rail.name, triangles: positions.length / 9 });
}

// Preserve the actual posts of the standalone rails. Their vertices already
// include the artist's placement, so there are no invisible extra supports.
const railObjects = { 'G-Object.027': 34, 'G-Object.033': 36, 'G-Object.034': 37,
  'G-Object.035': 38, 'G-Object.036': 39, 'G-Object.037': 39 };
for (const [name, railIndex] of Object.entries(railObjects)) {
  const node = originalDoc.nodes.find(n => n.name === name && n.extras?.streetSkateRole === 'visual');
  const positions = [];
  for (const p of originalDoc.meshes[node.mesh].primitives) {
    const g = geometry(p); triangles(g, v => v.forEach(p => positions.push(...p.toArray()))); g.dispose();
  }
  addCollision(`Collision / rail posts / ${name}`, positions,
    { surface: 'solid', railId: manifest.rails[railIndex].name, cameraTransparent: true });
}
manifest.collisionRevision = 4;
manifest.name = 'Skate Paradise';
anchor.extras.streetSkateMap = JSON.stringify(manifest);
const pad = (4 - binLength % 4) % 4;
if (pad) { chunks.push(Buffer.alloc(pad)); binLength += pad; }
doc.buffers[0].byteLength = binLength;
const json = Buffer.from(JSON.stringify(doc)), paddedJsonLength = Math.ceil(json.length / 4) * 4;
const result = Buffer.alloc(28 + paddedJsonLength + binLength);
result.writeUInt32LE(0x46546c67, 0); result.writeUInt32LE(2, 4); result.writeUInt32LE(result.length, 8);
result.writeUInt32LE(paddedJsonLength, 12); result.writeUInt32LE(0x4e4f534a, 16);
result.fill(0x20, 20, 20 + paddedJsonLength); json.copy(result, 20);
result.writeUInt32LE(binLength, 20 + paddedJsonLength); result.writeUInt32LE(0x004e4942, 24 + paddedJsonLength);
Buffer.concat(chunks).copy(result, 28 + paddedJsonLength);
fs.writeFileSync(output, result);
console.log(JSON.stringify({ ...report, bytes: result.length }, null, 2));
