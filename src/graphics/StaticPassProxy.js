import * as THREE from 'three';

/**
 * Static pass proxy (2026-11 performance pass).
 *
 * The glow mask, the shadow map and the contact-shading normal pass only need
 * the park's shape, yet each used to draw every park mesh again: hundreds of
 * draw calls per pass. This builds untextured, merged copies of the park
 * meshes that never move, in coarse spatial cells (so off-screen cells are
 * still culled). During those three passes the covered meshes are hidden and
 * the few cell meshes are drawn instead. The main view still draws the real
 * meshes with their materials, so nothing visible changes.
 *
 * Every pass copies exactly what three.js would have drawn:
 *  - glow mask: the whole geometry in black (as the old material swap did);
 *  - shadows: the same triangles with the same side rules, per material group;
 *  - contact shading: the same triangles with their normals.
 *
 * Covered meshes are checked every couple of seconds. One that moved, was
 * hidden, removed, re-materialled or stopped casting shadows has its cell
 * rebuilt; a mesh that keeps moving is left out for good.
 */
export const PROXY_CELL_SIZE = 40;
const CHECK_EVERY = 90;
export const PROXY_PASS = Object.freeze({ occluder: 1, shadow: 2, normal: 4 });

const materialsOf = mesh => (Array.isArray(mesh.material) ? mesh.material : [mesh.material]);
const defaultHook = THREE.Object3D.prototype.onBeforeRender;

/** Meshes the proxy may ever stand in for (shape is fixed and fully known). */
export function proxyCandidate(mesh, world) {
  if (!mesh?.isMesh || mesh.isSkinnedMesh || mesh.isInstancedMesh || mesh.isBatchedMesh) return false;
  if (mesh.children.length || mesh.layers.mask !== 1 || mesh.userData?.skateEffects || mesh.userData?.noPassProxy) return false;
  if (mesh.onBeforeRender !== defaultHook) return false;
  const geometry = mesh.geometry;
  if (!geometry?.attributes?.position || geometry.morphAttributes?.position?.length) return false;
  if (geometry.drawRange.start !== 0 || geometry.drawRange.count !== Infinity) return false;
  for (const m of materialsOf(mesh)) {
    if (!m || m.isShaderMaterial || m.isRawShaderMaterial || m.userData?.animatedVertices) return false;
    if (m.displacementMap && m.displacementScale !== 0) return false;
    if (m.wireframe) return false;
  }
  // Must be shown now, all the way up to the world root.
  for (let node = mesh; node; node = node.parent) {
    if (!node.visible) return false;
    if (node === world) return true;
  }
  return false;
}

/** Same rule three.js uses to pick a plain (shareable) shadow depth material. */
export function plainShadowMaterial(m, clipping = false) {
  if (!m.visible) return false;
  if (clipping && m.clipShadows && m.clippingPlanes?.length) return false;
  if ((m.alphaMap && m.alphaTest > 0) || (m.map && m.alphaTest > 0) || m.alphaToCoverage) return false;
  return true;
}

export class StaticPassProxy {
  constructor(scene, { cellSize = PROXY_CELL_SIZE } = {}) {
    this.scene = scene;
    this.cellSize = cellSize;
    this.root = new THREE.Group();
    this.root.name = 'Static pass proxy';
    this.root.matrixAutoUpdate = false;
    this.root.userData.noPassProxy = true;
    scene?.add(this.root);
    this.occluderMaterial = null;
    this.normalMaterial = new THREE.MeshLambertMaterial({ name: 'Pass proxy normals' });
    this.shadowMaterials = new Map();
    this.entries = new Map();      // mesh -> entry
    this.cells = new Map();        // key -> cell
    this.dynamic = new WeakSet();  // meshes that kept moving
    this.members = { occluder: [], shadow: [], normal: [] };
    this.hidden = [];
    this.active = null;
    this.frame = 0;
    this.world = null;
  }

  get coveredCount() { return this.entries.size; }

  /**
   * (Re)build for a world. `options.glowMesh(mesh)` marks meshes that keep
   * their own material in the glow pass; `options.normalExcluded(mesh)` marks
   * meshes the contact-shading pass hides anyway.
   */
  build(world, options = {}) {
    this.clear();
    this.world = world || null;
    this.options = options;
    this.occluderMaterial = options.occluderMaterial || this.occluderMaterial;
    if (!world) return this;
    world.updateMatrixWorld(true);
    world.traverse(object => {
      if (this.dynamic.has(object) || !proxyCandidate(object, world)) return;
      const entry = this.describe(object);
      if (!entry.passes) return;
      this.entries.set(object, entry);
      let cell = this.cells.get(entry.cell);
      if (!cell) this.cells.set(entry.cell, cell = { key: entry.cell, entries: [], objects: [], geometries: [] });
      cell.entries.push(entry);
    });
    for (const cell of this.cells.values()) this.buildCell(cell);
    this.refreshMembers();
    return this;
  }

  describe(mesh) {
    const geometry = mesh.geometry;
    if (!geometry.boundingSphere) geometry.computeBoundingSphere();
    const center = geometry.boundingSphere.center.clone().applyMatrix4(mesh.matrixWorld);
    const size = this.cellSize;
    const cell = `${Math.floor(center.x / size)},${Math.floor(center.z / size)}`;
    const materials = materialsOf(mesh);
    const clipping = Boolean(this.options?.clipping);
    let passes = 0;
    if (!this.options?.glowMesh?.(mesh)) passes |= PROXY_PASS.occluder;
    if (mesh.castShadow && !mesh.customDepthMaterial && !mesh.customDistanceMaterial &&
      materials.every(m => plainShadowMaterial(m, clipping))) passes |= PROXY_PASS.shadow;
    if (geometry.attributes.normal && materials.every(m => m.visible) && !this.options?.normalExcluded?.(mesh)) passes |= PROXY_PASS.normal;
    return {
      mesh, cell, passes, geometry, material: mesh.material, castShadow: mesh.castShadow,
      matrix: Float32Array.from(mesh.matrixWorld.elements), moves: 0,
    };
  }

  /** Triangle index ranges three.js draws for this mesh with one material or per group. */
  static ranges(mesh) {
    const geometry = mesh.geometry;
    const total = geometry.index ? geometry.index.count : geometry.attributes.position.count;
    if (!Array.isArray(mesh.material)) return [{ start: 0, count: total, material: mesh.material }];
    return geometry.groups.map(group => ({
      start: group.start, count: Math.min(group.count, total - group.start), material: mesh.material[group.materialIndex],
    })).filter(range => range.material && range.count > 0);
  }

  buildCell(cell) {
    this.disposeCell(cell);
    const live = cell.entries.filter(entry => !this.dynamic.has(entry.mesh));
    cell.entries = live;
    if (!live.length) { this.cells.delete(cell.key); return; }
    let vertexCount = 0;
    for (const entry of live) vertexCount += entry.geometry.attributes.position.count;
    const positions = new Float32Array(vertexCount * 3);
    const normals = new Float32Array(vertexCount * 3);
    const occluder = [], normal = [], shadow = new Map();
    const v = new THREE.Vector3(), n = new THREE.Vector3(), normalMatrix = new THREE.Matrix3(), matrix = new THREE.Matrix4();
    let base = 0;
    for (const entry of live) {
      const { mesh, geometry } = entry;
      matrix.fromArray(entry.matrix);
      normalMatrix.getNormalMatrix(matrix);
      const pos = geometry.attributes.position, nor = geometry.attributes.normal;
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i).applyMatrix4(matrix);
        positions[(base + i) * 3] = v.x; positions[(base + i) * 3 + 1] = v.y; positions[(base + i) * 3 + 2] = v.z;
        if (nor) {
          n.fromBufferAttribute(nor, i).applyMatrix3(normalMatrix).normalize();
          normals[(base + i) * 3] = n.x; normals[(base + i) * 3 + 1] = n.y; normals[(base + i) * 3 + 2] = n.z;
        }
      }
      const index = geometry.index;
      const at = k => base + (index ? index.getX(k) : k);
      const push = (list, start, count) => { for (let k = start; k < start + count - (count % 3); k++) list.push(at(k)); };
      const total = index ? index.count : pos.count;
      // A swapped-in single material draws the whole geometry, groups ignored.
      if (entry.passes & PROXY_PASS.occluder) push(occluder, 0, total);
      for (const range of StaticPassProxy.ranges(mesh)) {
        if (entry.passes & PROXY_PASS.normal) push(normal, range.start, range.count);
        if (entry.passes & PROXY_PASS.shadow) {
          const key = `${range.material.side}|${range.material.shadowSide}`;
          if (!shadow.has(key)) shadow.set(key, []);
          push(shadow.get(key), range.start, range.count);
        }
      }
      base += pos.count;
    }
    const position = new THREE.BufferAttribute(positions, 3);
    const normalAttribute = new THREE.BufferAttribute(normals, 3);
    const make = (indices, material, pass, withNormals = false) => {
      if (!indices.length) return;
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', position);
      if (withNormals) geometry.setAttribute('normal', normalAttribute);
      geometry.setIndex(vertexCount > 65535 ? new THREE.Uint32BufferAttribute(indices, 1) : new THREE.Uint16BufferAttribute(indices, 1));
      geometry.computeBoundingSphere();
      geometry.computeBoundingBox();
      const object = new THREE.Mesh(geometry, material);
      object.name = `Pass proxy ${pass} ${cell.key}`;
      object.matrixAutoUpdate = false;
      object.visible = false;
      object.castShadow = pass === 'shadow';
      object.receiveShadow = false;
      object.userData.passProxy = pass;
      object.userData.noPassProxy = true;
      this.root.add(object);
      cell.objects.push(object);
      cell.geometries.push(geometry);
    };
    make(occluder, this.occluderMaterial, 'occluder');
    make(normal, this.normalMaterial, 'normal', true);
    for (const [key, indices] of shadow) make(indices, this.shadowMaterial(key), 'shadow');
  }

  shadowMaterial(key) {
    if (!this.shadowMaterials.has(key)) {
      const [side, shadowSide] = key.split('|');
      const material = new THREE.MeshBasicMaterial({ name: `Pass proxy shadow ${key}`, side: Number(side) });
      material.shadowSide = shadowSide === 'null' ? null : Number(shadowSide);
      this.shadowMaterials.set(key, material);
    }
    return this.shadowMaterials.get(key);
  }

  refreshMembers() {
    const members = { occluder: [], shadow: [], normal: [] };
    for (const entry of this.entries.values()) {
      if (entry.passes & PROXY_PASS.occluder) members.occluder.push(entry.mesh);
      if (entry.passes & PROXY_PASS.shadow) members.shadow.push(entry.mesh);
      if (entry.passes & PROXY_PASS.normal) members.normal.push(entry.mesh);
    }
    this.members = members;
    this.proxies = { occluder: [], shadow: [], normal: [] };
    for (const object of this.root.children) this.proxies[object.userData.passProxy]?.push(object);
  }

  /** Hide the covered meshes and show this pass's merged cells. */
  begin(pass) {
    if (this.active) this.end();
    const members = this.members[pass];
    if (!members?.length) return false;
    const hidden = this.hidden;
    for (let i = 0; i < members.length; i++) {
      const mesh = members[i];
      if (!mesh.visible) { this.invalidate(mesh); continue; }
      mesh.visible = false;
      hidden.push(mesh);
    }
    for (const object of this.proxies[pass]) object.visible = true;
    this.active = pass;
    return true;
  }

  end() {
    if (!this.active) return;
    for (let i = 0; i < this.hidden.length; i++) this.hidden[i].visible = true;
    this.hidden.length = 0;
    for (const object of this.proxies[this.active]) object.visible = false;
    this.active = null;
  }

  invalidate(mesh) { const entry = this.entries.get(mesh); if (entry) entry.stale = true; }

  /** Call once per frame; every CHECK_EVERY frames it verifies covered meshes. */
  update() {
    if (!this.entries.size || ++this.frame % CHECK_EVERY) return false;
    return this.verify();
  }

  verify() {
    const dirty = new Set();
    for (const entry of this.entries.values()) {
      const { mesh } = entry;
      let changed = entry.stale || mesh.geometry !== entry.geometry || mesh.material !== entry.material ||
        mesh.castShadow !== entry.castShadow || !proxyCandidate(mesh, this.world);
      if (!changed) {
        const e = mesh.matrixWorld.elements, m = entry.matrix;
        for (let i = 0; i < 16; i++) if (Math.abs(e[i] - m[i]) > 1e-5) { changed = true; entry.moves++; break; }
      }
      if (changed) dirty.add(entry);
    }
    if (!dirty.size) return false;
    for (const entry of dirty) {
      const cell = this.cells.get(entry.cell);
      this.entries.delete(entry.mesh);
      if (cell) cell.entries = cell.entries.filter(item => item !== entry);
      // A mesh that moved twice is animated: leave it to draw itself.
      if (entry.moves >= 2) this.dynamic.add(entry.mesh);
      else if (!this.dynamic.has(entry.mesh) && proxyCandidate(entry.mesh, this.world)) {
        const fresh = this.describe(entry.mesh);
        fresh.moves = entry.moves;
        if (fresh.passes) {
          this.entries.set(entry.mesh, fresh);
          let target = this.cells.get(fresh.cell);
          if (!target) this.cells.set(fresh.cell, target = { key: fresh.cell, entries: [], objects: [], geometries: [] });
          target.entries.push(fresh);
          target.rebuild = true;
        }
      }
      if (cell) cell.rebuild = true;
    }
    for (const cell of [...this.cells.values()]) if (cell.rebuild) { cell.rebuild = false; this.buildCell(cell); }
    this.refreshMembers();
    return true;
  }

  disposeCell(cell) {
    for (const object of cell.objects) object.removeFromParent();
    // Index buffers are per geometry; the shared vertex buffers go with the last one.
    for (const geometry of cell.geometries) geometry.dispose();
    cell.objects = []; cell.geometries = [];
  }

  clear() {
    this.end();
    for (const cell of this.cells.values()) this.disposeCell(cell);
    this.cells.clear();
    this.entries.clear();
    this.members = { occluder: [], shadow: [], normal: [] };
    this.proxies = { occluder: [], shadow: [], normal: [] };
  }

  dispose() {
    this.clear();
    this.root.removeFromParent();
    this.normalMaterial.dispose();
    for (const material of this.shadowMaterials.values()) material.dispose();
    this.shadowMaterials.clear();
  }
}
