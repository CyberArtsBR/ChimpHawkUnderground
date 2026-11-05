import * as THREE from 'three';

const ROUND = 100;
const COLLISION_MATERIAL = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
const DECORATION_PATTERN = /(?:logo|decal|text|sticker|graphic|graffiti|banner|poster|light|lamp|emissive)/i;

function rounded(value) {
  return Math.round((Number(value) || 0) * ROUND) / ROUND;
}

function worldBounds(mesh, box = new THREE.Box3()) {
  if (!mesh?.geometry) return null;
  if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
  if (!mesh.geometry.boundingBox) return null;
  return box.copy(mesh.geometry.boundingBox).applyMatrix4(mesh.matrixWorld);
}

/**
 * Fingerprint a mesh by geometry density AND world-space placement. This lets the
 * runtime tell which meshes in the user's extended GLB already existed in the
 * original visual park, without depending on Blender object names remaining
 * identical after re-export.
 */
export function parkMeshFingerprint(mesh) {
  if (!mesh?.isMesh || !mesh.geometry?.attributes?.position) return null;
  const box = worldBounds(mesh);
  if (!box || box.isEmpty()) return null;
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const positions = mesh.geometry.attributes.position.count || 0;
  const indices = mesh.geometry.index?.count || positions;
  return [
    positions,
    indices,
    rounded(size.x), rounded(size.y), rounded(size.z),
    rounded(center.x), rounded(center.y), rounded(center.z),
  ].join('|');
}

function buildInventory(root) {
  const inventory = new Map();
  root?.updateMatrixWorld?.(true);
  root?.traverse?.((object) => {
    if (!object.isMesh) return;
    const key = parkMeshFingerprint(object);
    if (!key) return;
    inventory.set(key, (inventory.get(key) || 0) + 1);
  });
  return inventory;
}

function consumeInventory(inventory, key) {
  const remaining = inventory.get(key) || 0;
  if (remaining <= 0) return false;
  if (remaining === 1) inventory.delete(key);
  else inventory.set(key, remaining - 1);
  return true;
}

function collisionCandidate(mesh) {
  if (!mesh?.isMesh || !mesh.geometry?.attributes?.position) return false;
  if (DECORATION_PATTERN.test(mesh.name || '')) return false;
  const box = worldBounds(mesh);
  if (!box || box.isEmpty()) return false;
  const size = box.getSize(new THREE.Vector3());
  const dimensions = [Math.abs(size.x), Math.abs(size.y), Math.abs(size.z)].sort((a, b) => b - a);

  // Ignore tiny visual details. Long coping/rail-like pieces remain eligible,
  // while bolts, trims and decals never enter the collision broad phase.
  return dimensions[0] >= 0.45 && dimensions[1] >= 0.035;
}

function collisionGeometry(mesh) {
  const geometry = mesh.geometry.clone();
  geometry.applyMatrix4(mesh.matrixWorld);
  for (const name of Object.keys(geometry.attributes)) {
    if (name !== 'position') geometry.deleteAttribute(name);
  }
  geometry.clearGroups();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function triangleCount(mesh) {
  const geometry = mesh?.geometry;
  if (!geometry?.attributes?.position) return 0;
  return Math.floor((geometry.index?.count || geometry.attributes.position.count) / 3);
}

/**
 * Build one collision root from:
 *   1) the original optimized park-collision.glb for all legacy geometry;
 *   2) ONLY geometry newly introduced by halfpipenew.glb.
 *
 * The active visual GLB is therefore never used wholesale as the collision map.
 */
export function buildExtendedCollisionRoot({ activePark, legacyPark, legacyCollision } = {}) {
  const root = new THREE.Group();
  root.name = 'StreetSkate optimized extended collision';
  const diagnostics = {
    legacyMeshes: 0,
    activeMeshes: 0,
    matchedLegacyMeshes: 0,
    extensionMeshes: 0,
    extensionTriangles: 0,
    skippedSmallOrDecorative: 0,
  };

  legacyCollision?.traverse?.((object) => { if (object.isMesh) diagnostics.legacyMeshes += 1; });
  if (legacyCollision) root.add(legacyCollision);

  const inventory = buildInventory(legacyPark);
  activePark?.updateMatrixWorld?.(true);
  activePark?.traverse?.((object) => {
    if (!object.isMesh) return;
    diagnostics.activeMeshes += 1;
    const key = parkMeshFingerprint(object);
    if (key && consumeInventory(inventory, key)) {
      diagnostics.matchedLegacyMeshes += 1;
      return;
    }
    if (!collisionCandidate(object)) {
      diagnostics.skippedSmallOrDecorative += 1;
      return;
    }

    const proxy = new THREE.Mesh(collisionGeometry(object), COLLISION_MATERIAL);
    proxy.name = `EXT_COLLISION / ${object.name || `mesh-${diagnostics.extensionMeshes + 1}`}`;
    proxy.userData.surface = object.userData?.surface === 'solid' ? 'solid' : 'skateable';
    if (object.userData?.railId) proxy.userData.railId = object.userData.railId;
    diagnostics.extensionTriangles += triangleCount(proxy);
    diagnostics.extensionMeshes += 1;
    root.add(proxy);
  });

  root.updateMatrixWorld(true);
  return { root, diagnostics };
}

/** Release the temporary legacy visual reference after the diff is built. */
export function disposeParkReference(root) {
  root?.traverse?.((object) => {
    if (!object.isMesh) return;
    object.geometry?.dispose?.();
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      if (!material) continue;
      for (const value of Object.values(material)) {
        if (value?.isTexture) value.dispose?.();
      }
      material.dispose?.();
    }
  });
}

export function countParkTriangles(root) {
  let triangles = 0;
  root?.traverse?.((object) => {
    if (object.isMesh) triangles += triangleCount(object);
  });
  return triangles;
}
