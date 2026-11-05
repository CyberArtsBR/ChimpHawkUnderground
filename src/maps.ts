// Map catalog. Skate Paradise is the original v1 map (authored GLB with its
// own sky, collision and rails); The Lab is the code-built test park.
import * as THREE from 'three';
import { buildTestPark, type ParkSpot, type Rail } from './park/TestPark';
import { assembleGlbPark, type Region } from './park/GlbPark';
import { assembleOrbit, assembleWarehouse } from './park/LegacyMaps';
import { buildParkView } from './render/ParkView';
import { loadGlb } from './render/loadGltf';
import type { EnvironmentOptions } from './render/Environment';

export type MapId = 'paradise' | 'orbit' | 'warehouse' | 'lab';
const MAP_IDS: readonly MapId[] = ['paradise', 'orbit', 'warehouse', 'lab'];

export const MAPS: readonly { id: MapId; name: string; subtitle: string }[] = [
  { id: 'paradise', name: 'Skate Paradise', subtitle: 'Sunset bowls, vert ramps and street lines' },
  { id: 'orbit', name: 'Orbit', subtitle: 'Neon lines under the galaxy' },
  { id: 'warehouse', name: 'Grand Warehouse', subtitle: 'Indoor wood and steel park' },
  { id: 'lab', name: 'The Lab', subtitle: 'Test park: one of every obstacle' },
];

export interface LoadedMap {
  id: MapId;
  name: string;
  visual: THREE.Object3D;
  collision: THREE.BufferGeometry[];
  rails: Rail[];
  spawn: ParkSpot;
  regions: Region[];
  environment: Omit<EnvironmentOptions, 'quality'>;
}

export function readMapId(): MapId {
  const valid = (v: string | null): v is MapId => !!v && (MAP_IDS as readonly string[]).includes(v);
  const fromUrl = new URLSearchParams(location.search).get('map');
  if (valid(fromUrl)) return fromUrl;
  try { const saved = localStorage.getItem('chimphawk.map'); return valid(saved) ? saved : 'paradise'; } catch { return 'paradise'; }
}

export function saveMapId(id: MapId): void {
  try { localStorage.setItem('chimphawk.map', id); } catch { /* ignore */ }
}

export async function loadMap(id: MapId, renderer: THREE.WebGLRenderer, onProgress: (f: number) => void): Promise<LoadedMap> {
  if (id === 'lab') {
    const park = buildTestPark();
    onProgress(1);
    return {
      id, name: park.name, visual: buildParkView(park, renderer), collision: park.pieces.map(p => p.geometry),
      rails: park.rails, spawn: park.spawn, regions: [],
      environment: { parkSize: park.size, procedural: true },
    };
  }

  const base = import.meta.env.BASE_URL + 'assets/maps/';
  if (id === 'orbit') {
    const [gltf, manifest, sky] = await Promise.all([
      loadGlb(base + 'orbit.glb.gz', onProgress),
      fetch(base + 'orbit-manifest.json').then(r => r.json()),
      new THREE.TextureLoader().loadAsync(base + 'galaxy-4k.webp'),
    ]);
    sky.colorSpace = THREE.SRGBColorSpace;
    sky.mapping = THREE.EquirectangularReflectionMapping;
    const world = assembleOrbit(gltf.scene, manifest);
    // Galaxy backdrop, dimmed so the neon park stays the focus.
    const dome = new THREE.Mesh(new THREE.SphereGeometry(600, 48, 24),
      new THREE.MeshBasicMaterial({ map: sky, color: '#a6b2c5', side: THREE.BackSide, depthWrite: false, fog: false }));
    dome.renderOrder = -10;
    world.visual.add(dome);
    return {
      id, name: 'Orbit', ...world,
      environment: {
        parkSize: 140, procedural: false,
        fogColor: '#141a33', fogDensity: 0.004,
        hemiSky: '#8fb4ff', hemiGround: '#1a1430', hemiIntensity: 0.9,
        sunColor: '#bcd4ff', sunIntensity: 2.2, sunDirection: [25, 40, 18],
        environmentMap: sky, environmentIntensity: 0.6,
      },
    };
  }
  if (id === 'warehouse') {
    const gltf = await loadGlb(base + 'grand-warehouse.glb.gz', onProgress);
    const world = assembleWarehouse(gltf.scene);
    return {
      id, name: 'Grand Warehouse', ...world,
      environment: {
        parkSize: 150, procedural: false,
        fogColor: '#30323a', fogDensity: 0.0035,
        // White marble blows out easily: softer fill, warm key through the skylights.
        hemiSky: '#c9d3ea', hemiGround: '#41392e', hemiIntensity: 0.7,
        sunColor: '#ffd9a8', sunIntensity: 1.6, sunDirection: [-20, 60, 15],
      },
    };
  }

  const gltf = await loadGlb(base + 'skate-paradise.glb.gz', onProgress);
  // v1 also started riders at the calm plaza entrance instead of the authored test spawn.
  const world = assembleGlbPark(gltf.scene, { spawn: { name: 'Plaza', position: new THREE.Vector3(27, 0.46, -75), heading: 0 } });
  const p = world.presentation;
  const center = p.center ?? [66, 0, -84];
  const key = p.keyPosition ?? [-45, 55, -25];
  return {
    id, name: 'Skate Paradise', visual: world.visual, collision: world.collision, rails: world.rails,
    spawn: world.spawn, regions: world.regions,
    environment: {
      parkSize: 160,
      procedural: false,
      // Warmer, slightly denser haze than v1 for sunset depth.
      fogColor: '#8f7a9e', fogDensity: Math.max(0.0016, (p.fogDensity ?? 0.0007) * 2.2),
      hemiSky: p.ambientSky, hemiGround: p.ambientGround, hemiIntensity: (p.ambientIntensity ?? 0.9) * 0.75,
      sunColor: p.keyColor ?? '#ffc28b', sunIntensity: (p.keyIntensity ?? 2.1) * 1.35,
      sunDirection: [key[0] - center[0], key[1] - center[1], key[2] - center[2]],
      environmentMap: world.skyTexture,
      environmentIntensity: p.environmentIntensity ?? 0.8,
    },
  };
}
