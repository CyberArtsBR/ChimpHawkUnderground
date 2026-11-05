// Loaders for the two v1 maps that predate the tagged map format:
//  - ORBIT: surfaces classified by v1's naming rules; rails from orbit-manifest.json.
//  - Grand Warehouse: every structural mesh collides (walls vs floors are told
//    apart by angle in the skater), decoration excluded by name, grind rails
//    rebuilt from the swept rail tubes.
import * as THREE from 'three';
import type { Rail, ParkSpot } from './TestPark';
import type { Region } from './GlbPark';

export interface LegacyMapWorld {
  visual: THREE.Object3D;
  collision: THREE.BufferGeometry[];
  rails: Rail[];
  spawn: ParkSpot;
  regions: Region[];
}

/** v1 object naming: the nearest ancestor name containing " / " (Blender collection paths). */
export function objectName(object: THREE.Object3D): string {
  for (let node: THREE.Object3D | null = object; node; node = node.parent) {
    const name = (node.userData?.name as string) || node.name || '';
    if (name.includes(' / ')) return name;
  }
  return object.name || '';
}

function worldGeometry(mesh: THREE.Mesh): THREE.BufferGeometry {
  return mesh.geometry.clone().applyMatrix4(mesh.matrixWorld);
}

function prepareVisual(mesh: THREE.Mesh): void {
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
    const m = material as THREE.MeshStandardMaterial;
    if (!m) continue;
    // Authored LED / neon strips glow through the bloom pass.
    if (/^(LED|Grind) \//.test(m.name) && m.emissive) m.emissiveIntensity = Math.min(m.emissiveIntensity || 1, 2.2);
  }
}

// ── ORBIT ────────────────────────────────────────────────────────────────

interface OrbitManifest {
  spawn: [number, number, number];
  spawnHeading?: number;
  rails: { name: string; points: [number, number, number][]; radius?: number; kind?: string }[];
  playableRegions: Region[];
}

const ORBIT_RIDEABLE = /orbital.bowl.(flat|transition)|continuous.ride|broad.bank.circuit.ride|^Deck \/ (bowl apron|east|north|south|west)$|Skateable_Surface|manual.pad|^06 \/ ledge/i;
const ORBIT_SOLID = /Side_Wood_Core|accessible.side.panel|\/ back$|structural.cheek|collision.bar|\/ pedestal|knee.wall|equipment.cabinet/i;
const ORBIT_HELPER = /collision.bar|^07 \/ reused \/.*Street double-bank funbox|^Deck \/ (?:expansion|short) joint/;

export function assembleOrbit(scene: THREE.Object3D, manifest: OrbitManifest): LegacyMapWorld {
  scene.updateMatrixWorld(true);
  const collision: THREE.BufferGeometry[] = [];
  const remove: THREE.Object3D[] = [];
  const proxyNames = new Set<string>();
  const meshes: THREE.Mesh[] = [];
  scene.traverse(o => { if ((o as THREE.Mesh).isMesh) meshes.push(o as THREE.Mesh); });
  for (const mesh of meshes) {
    const name = objectName(mesh);
    if (/^COL_/.test(name)) { proxyNames.add(name.slice(4)); remove.push(mesh); }
  }
  for (const mesh of meshes) {
    const name = objectName(mesh);
    if (/^COL_/.test(name)) continue;
    if (name === 'Halo / ORBIT logotype' || ORBIT_HELPER.test(name)) { remove.push(mesh); continue; }
    if (!mesh.visible) continue;
    prepareVisual(mesh);
    const material = (mesh.material as THREE.Material)?.name || '';
    if (/Ceramic \/ silver riding concrete/.test(material)) {
      // v1's polished silver-blue floor instead of the near-black source texture.
      const m = mesh.material as THREE.MeshStandardMaterial;
      m.map = null; m.normalMap = null; m.roughnessMap = null; m.metalnessMap = null;
      m.color.set('#52677b'); m.roughness = 0.18; m.metalness = 0.28; m.envMapIntensity = 1.85; // v1 ORBIT_POLISHED_FLOOR
      m.needsUpdate = true;
    }
    const purpleRamp = /^04_FLOW_LAB \/ Flow launch ramp/.test(name);
    const rideable = (purpleRamp && /^Foundry_Plywood/.test(material)) || ORBIT_RIDEABLE.test(name);
    const solid = (purpleRamp && /^Foundry_Dark_Timber/.test(material)) || proxyNames.has(name) || ORBIT_SOLID.test(name);
    if (rideable || solid) collision.push(worldGeometry(mesh));
  }
  for (const object of remove) object.removeFromParent();

  const rails: Rail[] = manifest.rails.map(r => ({
    name: r.name,
    type: r.kind === 'coping' || /coping/i.test(r.name) ? 'coping' : 'rail',
    points: r.points.map(([x, y, z]) => new THREE.Vector3(x, y + (r.radius ?? 0.065), z)),
  }));
  return {
    visual: scene, collision, rails,
    spawn: { name: 'Terminal', position: new THREE.Vector3(...manifest.spawn), heading: manifest.spawnHeading ?? 0 },
    regions: manifest.playableRegions,
  };
}

// ── Grand Warehouse ──────────────────────────────────────────────────────

/** Rebuild rail paths from swept tubes exported as ten-vertex rings (v1 algorithm). */
export function tubePaths(geometry: THREE.BufferGeometry): { points: THREE.Vector3[]; radius: number }[] {
  const position = geometry.getAttribute('position');
  const key = (i: number) => [position.getX(i), position.getY(i), position.getZ(i)].map(v => Math.round(v * 1e5)).join(',');
  const unique = new Map<string, number>();
  const vertices: THREE.Vector3[] = [];
  const vertexIds: number[] = [];
  for (let i = 0; i < position.count; i++) {
    const k = key(i);
    if (!unique.has(k)) { unique.set(k, vertices.length); vertices.push(new THREE.Vector3().fromBufferAttribute(position, i)); }
    vertexIds.push(unique.get(k)!);
  }
  const parent = vertices.map((_, i) => i);
  const find = (i: number): number => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
  const index = geometry.index;
  const count = index ? index.count : position.count;
  for (let i = 0; i < count; i += 3) {
    const a = vertexIds[index ? index.getX(i) : i];
    for (let j = 1; j < 3; j++) parent[find(vertexIds[index ? index.getX(i + j) : i + j])] = find(a);
  }
  const components = new Map<number, THREE.Vector3[]>();
  vertices.forEach((v, i) => { const root = find(i); if (!components.has(root)) components.set(root, []); components.get(root)!.push(v); });
  const paths: { points: THREE.Vector3[]; radius: number }[] = [];
  for (const component of components.values()) {
    if (component.length < 20 || component.length % 10) return [];
    const points: THREE.Vector3[] = [];
    let radius = 0;
    for (let i = 0; i < component.length; i += 10) {
      const ring = component.slice(i, i + 10);
      const centre = ring.reduce((sum, v) => sum.add(v), new THREE.Vector3()).multiplyScalar(0.1);
      const radii = ring.map(v => v.distanceTo(centre));
      const average = radii.reduce((a, b) => a + b, 0) / 10;
      if (average < 0.01 || average > 0.4 || Math.max(...radii) / Math.min(...radii) > 4) return [];
      radius += average;
      points.push(centre);
    }
    paths.push({ points, radius: radius / points.length });
  }
  return paths;
}

/** The warehouse export repeats some rails per material slot; keep one of each path. */
export function dedupeRails(rails: Rail[]): Rail[] {
  const seen = new Set<string>();
  return rails.filter(rail => {
    const a = rail.points[0], b = rail.points[rail.points.length - 1];
    const key = [a, b].map(p => p.toArray().map(v => Math.round(v * 20)).join(',')).sort().join('|');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// Not collidable: roof, floor paint, fixings, light fittings, signage.
const WAREHOUSE_DECOR = /^06_ROOF|Floor_Markings|mounting_plate|Step_Edge|Yellow_Rim_Inlay|lamp|light|bulb|sign|poster|banner|cable|_Glass/i;
const MISPLACED_SIX_STAIR = /^01_STREET_DISTRICT \/ Six stair kinked down rail \/ Hubba_Solid_-1 001(?:_\d+)?$/;

export function assembleWarehouse(scene: THREE.Object3D): LegacyMapWorld {
  scene.updateMatrixWorld(true);
  const collision: THREE.BufferGeometry[] = [];
  const rails: Rail[] = [];
  const remove: THREE.Object3D[] = [];
  const meshes: THREE.Mesh[] = [];
  scene.traverse(o => { if ((o as THREE.Mesh).isMesh) meshes.push(o as THREE.Mesh); });
  for (const mesh of meshes) {
    const name = objectName(mesh);
    if (MISPLACED_SIX_STAIR.test(name)) {
      // v1 removes one duplicated stair assembly that sits inside the Flow Volcano.
      const centre = new THREE.Box3().setFromObject(mesh).getCenter(new THREE.Vector3());
      if (centre.x > 30 && centre.x < 55 && centre.z > -18 && centre.z < 5) { remove.push(mesh); continue; }
    }
    prepareVisual(mesh);
    // The roof would put the whole interior in the sun's shadow.
    if (/^06_ROOF/.test(name)) mesh.castShadow = false;
    if (/___tube/.test(name)) {
      const paths = tubePaths(worldGeometry(mesh));
      paths.forEach((path, i) => {
        if (path.points.length < 2) return;
        // Tube centres → grind contact on top of the pipe.
        const points = path.points.map(p => p.clone().setY(p.y + path.radius));
        rails.push({ name: `${name.split(' / ')[1] ?? name}${paths.length > 1 ? ` ${i + 1}` : ''}`, type: /coping/i.test(name) ? 'coping' : 'rail', points });
      });
      continue;
    }
    if (WAREHOUSE_DECOR.test(name) || !mesh.visible) continue;
    collision.push(worldGeometry(mesh));
  }
  for (const object of remove) object.removeFromParent();
  return {
    visual: scene, collision, rails: dedupeRails(rails),
    spawn: { name: 'Entrance', position: new THREE.Vector3(0, 0.15, 43), heading: 0.5 },
    regions: [{ minX: -75, maxX: 75, minZ: -55, maxZ: 55 }],
  };
}
