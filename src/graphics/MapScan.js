import * as THREE from 'three';
import { MeshBVH, acceleratedRaycast } from 'three-mesh-bvh';

/**
 * Finds places to dress a map (2026-11 enhancement pass), using the park's
 * own collision meshes (already BVH-accelerated):
 *  - walls: flat vertical faces big enough for a graffiti piece or a sign,
 *  - edges: flat floor right next to a wall, away from rails and the spawn,
 *    where props and spectators will not sit in a skate line.
 * Read-only: it never changes collision or physics.
 */
export function seededRandom(text) {
  let h = 2166136261;
  for (const ch of String(text)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return () => { h = (Math.imul(h, 1664525) + 1013904223) >>> 0; return h / 4294967296; };
}

const DIRECTIONS = Array.from({ length: 8 }, (_, i) => new THREE.Vector3(Math.cos(i * Math.PI / 4), 0, Math.sin(i * Math.PI / 4)));

export function collisionMeshes(collision) {
  const meshes = [];
  collision?.traverse?.(object => { if (object.isMesh && object.geometry?.boundsTree) meshes.push(object); });
  return meshes;
}

/**
 * Visible, solid park meshes (no sky dome, glass, nets or foliage cards), with
 * a BVH so rays stay fast. Collision alone is not enough: parks have invisible
 * boundary walls, and decorations on those would float in the air.
 */
export function visualMeshes(park) {
  const meshes = [];
  park?.traverse?.(object => {
    if (!object.isMesh || object.isInstancedMesh || object.isSkinnedMesh || !object.visible) return;
    if (object.userData?.streetSkateRole === 'sky' || /sky|sunset|dome|palm|leaf|tree|net|fence|glass/i.test(object.name || '')) return;
    const materials = [].concat(object.material);
    if (materials.some(m => !m || m.transparent || m.alphaTest > 0 || m.opacity < 1 || /glass|net|fence|leaf/i.test(m.name || ''))) return;
    const geometry = object.geometry;
    if (!geometry?.attributes?.position || geometry.attributes.position.count < 3) return;
    if (!geometry.boundingSphere) geometry.computeBoundingSphere();
    if (!(geometry.boundingSphere?.radius < 1500)) return;
    try { geometry.boundsTree ||= new MeshBVH(geometry, { indirect: true }); object.raycast = acceleratedRaycast; } catch { return; }
    meshes.push(object);
  });
  return meshes;
}

export function scanMap({ collision, park = null, manifest, spacing = 3 }) {
  const visual = park ? visualMeshes(park) : [];
  const meshes = visual.length ? visual : collisionMeshes(collision);
  const result = { walls: [], edges: [], floor: [], bounds: null, meshes };
  if (!meshes.length) return result;
  const raycaster = new THREE.Raycaster();
  raycaster.firstHitOnly = true;
  const normalMatrix = new THREE.Matrix3();
  const hitNormal = new THREE.Vector3();
  const cast = (origin, direction, far) => {
    raycaster.set(origin, direction); raycaster.far = far;
    const hit = raycaster.intersectObjects(meshes, false)[0];
    if (!hit?.face) return null;
    normalMatrix.getNormalMatrix(hit.object.matrixWorld);
    hitNormal.copy(hit.face.normal).applyNormalMatrix(normalMatrix).normalize();
    if (hitNormal.dot(direction) > 0) hitNormal.negate(); // face the ray, whatever the winding
    return { point: hit.point.clone(), normal: hitNormal.clone(), distance: hit.distance };
  };

  const box = new THREE.Box3();
  for (const mesh of meshes) { mesh.updateMatrixWorld(); if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox(); box.union(mesh.geometry.boundingBox.clone().applyMatrix4(mesh.matrixWorld)); }
  const region = manifest?.playableRegions?.[0];
  const minX = Math.max(box.min.x, region?.minX ?? -Infinity), maxX = Math.min(box.max.x, region?.maxX ?? Infinity);
  const minZ = Math.max(box.min.z, region?.minZ ?? -Infinity), maxZ = Math.min(box.max.z, region?.maxZ ?? Infinity);
  result.bounds = { minX, maxX, minZ, maxZ, minY: box.min.y, maxY: box.max.y };
  if (!(maxX > minX && maxZ > minZ)) return result;

  const railPoints = [];
  for (const rail of manifest?.rails || []) for (const p of rail.points || []) if (Array.isArray(p)) railPoints.push(p);
  const spawn = Array.isArray(manifest?.spawn) ? manifest.spawn : null;
  const nearRail = (x, z, r) => railPoints.some(p => (p[0] - x) ** 2 + (p[2] - z) ** 2 < r * r);

  const down = new THREE.Vector3(0, -1, 0);
  const origin = new THREE.Vector3();
  const top = box.max.y + 4, depth = box.max.y - box.min.y + 12;
  const step = Math.max(2, spacing * Math.max(1, Math.sqrt((maxX - minX) * (maxZ - minZ)) / 120));
  for (let x = minX + step / 2; x < maxX; x += step) {
    for (let z = minZ + step / 2; z < maxZ; z += step) {
      const ground = cast(origin.set(x, top, z), down, depth);
      if (!ground || ground.normal.y < .96) continue;
      const floor = { point: ground.point, normal: ground.normal };
      result.floor.push(floor);
      // Look around for a wall at chest height.
      let nearest = null;
      for (const dir of DIRECTIONS) {
        const hit = cast(origin.copy(ground.point).setY(ground.point.y + 1.1), dir, 5);
        if (!hit || Math.abs(hit.normal.y) > .2) continue;
        if (!nearest || hit.distance < nearest.distance) nearest = { ...hit, dir };
      }
      if (!nearest) continue;
      const wallNormal = nearest.normal.clone().setY(0).normalize();
      // Wall: how big a flat patch is there? Probe a grid of rays into it.
      const tangent = new THREE.Vector3(-wallNormal.z, 0, wallNormal.x);
      const into = wallNormal.clone().negate();
      for (const [w, h] of [[3.4, 1.7], [2.4, 1.2], [1.5, .75]]) {
        const centerY = ground.point.y + .35 + h / 2;
        const center = nearest.point.clone().setY(centerY);
        let ok = true;
        for (const u of [-.5, 0, .5]) {
          for (const v of [-.5, 0, .5]) {
            const probe = center.clone().addScaledVector(tangent, u * w).setY(centerY + v * h).addScaledVector(wallNormal, .5);
            const hit = cast(probe, into, .9);
            if (!hit || Math.abs(hit.distance - .5) > .08 || hit.normal.dot(wallNormal) < .97) { ok = false; break; }
          }
          if (!ok) break;
        }
        if (ok) {
          // Tall walls can carry a neon sign above the piece.
          let tall = true;
          for (const u of [-.4, 0, .4]) {
            const probe = center.clone().addScaledVector(tangent, u * 2.8).setY(ground.point.y + 2.7).addScaledVector(wallNormal, .5);
            const hit = cast(probe, into, .9);
            if (!hit || Math.abs(hit.distance - .5) > .1 || hit.normal.dot(wallNormal) < .95) { tall = false; break; }
          }
          result.walls.push({ point: center, normal: wallNormal, width: w, height: h, groundY: ground.point.y, tall });
          break;
        }
      }
      // Edge: flat floor hugging the wall, clear of rails and the spawn.
      if (nearest.distance < 1.8 && !nearRail(x, z, 2.6)
        && !(spawn && (spawn[0] - x) ** 2 + (spawn[2] - z) ** 2 < 36)) {
        const spot = nearest.point.clone().addScaledVector(wallNormal, .9).setY(ground.point.y);
        const check = cast(origin.copy(spot).setY(top), down, depth);
        if (check && check.normal.y > .96 && Math.abs(check.point.y - ground.point.y) < .1)
          result.edges.push({ point: check.point, facing: wallNormal, wallDistance: .9 });
      }
    }
  }
  return result;
}

/** Pick up to `count` items at least `gap` metres apart, in seeded order. */
export function spreadPick(items, count, gap, rand) {
  const pool = items.slice();
  for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
  const picked = [];
  for (const item of pool) {
    if (picked.length >= count) break;
    if (picked.every(p => p.point.distanceToSquared(item.point) >= gap * gap)) picked.push(item);
  }
  return picked;
}
