import { gameAssetUrl } from '../game/AssetPaths.js';
import * as THREE from 'three';
import { buildExtendedCollisionRoot, countParkTriangles } from '../game/ExtendedParkCollision.js';

export function extensionHalfpipeRails() {
  return [
    [1, 6.74, -9.04, 7.30, 61.0, 76.8],
    [2, 6.69, 36.94, 53.30, 60.9, 76.7],
  ].flatMap(([area, y, z0, z1, west, east]) => [
    ['west', west],
    ['east', east],
  ].map(([side, x]) => ({
    name: `Extension halfpipe ${area} ${side} coping`,
    radius: 0.055,
    points: [[x, y, z0], [x, y, z1]],
  })));
}

export function appendExtensionHalfpipeRails(manifest) {
  manifest.rails ||= [];
  const existing = new Set(manifest.rails.map(rail => rail?.name).filter(Boolean));
  for (const rail of extensionHalfpipeRails()) {
    if (existing.has(rail.name)) continue;
    manifest.rails.push(rail);
    existing.add(rail.name);
  }
  return manifest.rails;
}

// Remove only the old east perimeter fence at the seam with the new slabs.
// The quarter-pipe behind it and every other perimeter remain intact.
function openEastPassage(root) {
  root.updateMatrixWorld(true);
  root.traverse(mesh => {
    if (!mesh.isMesh || !/(powder coated frame|warm aggregate|fence|perimeter)/i.test(mesh.name)) return;
    const geometry = mesh.geometry.clone(), positions = geometry.attributes.position;
    const originalIndex = geometry.index;
    const kept = [], points = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
    const count = originalIndex?.count || positions.count;
    for (let i = 0; i < count; i += 3) {
      const indices = [0, 1, 2].map(j => originalIndex ? originalIndex.getX(i + j) : i + j);
      indices.forEach((index, j) => points[j].fromBufferAttribute(positions, index).applyMatrix4(mesh.matrixWorld));
      const atSeam = points.every(p => p.x >= 33.45 && p.x <= 34.4 && p.z >= -23.3 && p.z <= 23.3);
      if (!atSeam) kept.push(...indices);
    }
    geometry.setIndex(kept);
    geometry.computeBoundingBox(); geometry.computeBoundingSphere();
    mesh.geometry = geometry;
  });
}

export function assembleExpandedPark(activePark, legacyPark, legacyCollision, manifest) {
  // Retain the current park's optimized, matching visual/collision pair. The
  // supplied file also includes an older copy of this sector; do not duplicate it.
  const duplicates = [];
  activePark.traverse(o => { if (o.isMesh && /^PARK \/ /.test(o.name)) duplicates.push(o); });
  for (const mesh of duplicates) mesh.removeFromParent();
  openEastPassage(legacyPark);
  openEastPassage(legacyCollision);
  manifest.rails = manifest.rails.filter(rail => !(/perimeter/i.test(rail.name)
    && rail.points.every(p => p[0] >= 33.45 && p[0] <= 34.4)));
  const extended = buildExtendedCollisionRoot({ activePark, legacyPark, legacyCollision });
  activePark.add(legacyPark);
  activePark.updateMatrixWorld(true);

  // New long flat rails are authored in the supplied GLB, including some whose
  // Blender names still say "support". Use shape rather than the suffix.
  activePark.traverse(mesh => {
    if (!mesh.isMesh || !/^EXT \/ flat rail/.test(mesh.name)) return;
    const box = new THREE.Box3().setFromObject(mesh), size = box.getSize(new THREE.Vector3());
    if (size.x < 2 || size.z > 0.35 || size.y > 0.7) return;
    const center = box.getCenter(new THREE.Vector3());
    const railId = `extension-flat-${manifest.rails.length}`;
    manifest.rails.push({ name: railId, radius: 0.06,
      points: [[box.min.x, center.y, center.z], [box.max.x, center.y, center.z]] });
  });
  appendExtensionHalfpipeRails(manifest);
  manifest.worldBounds = { min: [-33.65, -3.15, -22.65], max: [101.65, 8, 68.65] };
  manifest.playableRegions = [
    { minX: -33.65, maxX: 34.4, minZ: -22.65, maxZ: 22.65 },
    { minX: 33.5, maxX: 101.65, minZ: -22.65, maxZ: 68.65 },
  ];
  manifest.visualTriangles = countParkTriangles(activePark);
  manifest.sizeMetres = [136, 92];
  manifest.activeAsset = gameAssetUrl('/assets/park/halfnew.glb');
  return { park: activePark, collision: extended.root, diagnostics: extended.diagnostics };
}
