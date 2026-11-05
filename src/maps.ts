// Map catalog. Skate Paradise is the original v1 map (authored GLB with its
// own sky, collision and rails); The Lab is the code-built test park.
import * as THREE from 'three';
import { buildTestPark, type ParkSpot, type Rail } from './park/TestPark';
import { assembleGlbPark, type Region } from './park/GlbPark';
import { buildParkView } from './render/ParkView';
import { loadGlb } from './render/loadGltf';
import type { EnvironmentOptions } from './render/Environment';

export type MapId = 'paradise' | 'lab';

export const MAPS: readonly { id: MapId; name: string; subtitle: string }[] = [
  { id: 'paradise', name: 'Skate Paradise', subtitle: 'Sunset bowls, vert ramps and street lines' },
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
  const fromUrl = new URLSearchParams(location.search).get('map');
  if (fromUrl === 'lab' || fromUrl === 'paradise') return fromUrl;
  try { return localStorage.getItem('chimphawk.map') === 'lab' ? 'lab' : 'paradise'; } catch { return 'paradise'; }
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

  const gltf = await loadGlb(import.meta.env.BASE_URL + 'assets/maps/skate-paradise.glb.gz', onProgress);
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
