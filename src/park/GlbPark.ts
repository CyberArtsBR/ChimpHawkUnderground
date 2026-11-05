// Loads an authored StreetSkate map GLB (v1 format): nodes tagged with
// extras.streetSkateRole = visual | decoration | collision | sky, and one node
// carrying extras.streetSkateMap = { spawn, rails, playableRegions, presentation }.
import * as THREE from 'three';
import type { Rail, ParkSpot } from './TestPark';

export interface MapPresentation {
  exposure?: number;
  fogColor?: string; fogDensity?: number;
  ambientSky?: string; ambientGround?: string; ambientIntensity?: number;
  keyColor?: string; keyIntensity?: number; keyPosition?: [number, number, number];
  fillColor?: string; fillIntensity?: number; fillPosition?: [number, number, number];
  environmentIntensity?: number; environmentFromSky?: boolean;
  center?: [number, number, number];
}

export interface Region { minX: number; maxX: number; minZ: number; maxZ: number }

export interface GlbParkWorld {
  name: string;
  visual: THREE.Object3D;
  collision: THREE.BufferGeometry[];
  rails: Rail[];
  spawn: ParkSpot;
  regions: Region[];
  presentation: MapPresentation;
  skyTexture: THREE.Texture | null;
}

interface MapDescription {
  version: number;
  name?: string;
  spawn: [number, number, number];
  spawnHeading?: number;
  rails: { name: string; points: [number, number, number][]; radius: number; transition?: { type: string } }[];
  playableRegions: Region[];
  presentation?: MapPresentation;
}

function role(node: THREE.Object3D): string | undefined {
  for (let n: THREE.Object3D | null = node; n; n = n.parent) {
    const value = n.userData?.streetSkateRole;
    if (value !== undefined) return value;
  }
  return undefined;
}

export interface GlbParkOptions {
  /** Override the authored spawn (e.g. a calmer entrance). */
  spawn?: ParkSpot;
}

export function assembleGlbPark(scene: THREE.Object3D, options: GlbParkOptions = {}): GlbParkWorld {
  scene.updateMatrixWorld(true);
  let description: MapDescription | null = null;
  scene.traverse(node => {
    const raw = node.userData?.streetSkateMap;
    if (raw !== undefined) description = typeof raw === 'string' ? JSON.parse(raw) : raw;
  });
  if (!description) throw new Error('Map has no StreetSkate description');
  const desc = description as MapDescription;

  const collision: THREE.BufferGeometry[] = [];
  let skyTexture: THREE.Texture | null = null;
  const hidden: THREE.Object3D[] = [];
  scene.traverse(node => {
    const mesh = node as THREE.Mesh;
    if ((node as THREE.Light).isLight) {
      // The game owns the one shadowed sun; authored lamps stay as cheap fills.
      const light = node as THREE.PointLight;
      light.castShadow = false;
      if ('distance' in light) light.distance = Math.min(light.distance || 60, 60);
      return;
    }
    if (!mesh.isMesh) return;
    const r = role(node);
    if (r === 'sky') {
      const material = mesh.material as THREE.MeshStandardMaterial;
      skyTexture = material.map ?? material.emissiveMap ?? null;
      if (skyTexture) skyTexture.colorSpace = THREE.SRGBColorSpace;
      mesh.material = new THREE.MeshBasicMaterial({ map: skyTexture, side: THREE.DoubleSide, fog: false, depthWrite: false });
      mesh.renderOrder = -10;
      mesh.frustumCulled = false;
      return;
    }
    if (r === 'collision') {
      collision.push(mesh.geometry.clone().applyMatrix4(mesh.matrixWorld));
      hidden.push(mesh);
      return;
    }
    mesh.castShadow = r !== 'decoration';
    mesh.receiveShadow = true;
    mesh.matrixAutoUpdate = false;
  });
  for (const node of hidden) node.visible = false;
  if (!collision.length) throw new Error('Map has no collision meshes');

  const rails: Rail[] = desc.rails.map(r => ({
    name: r.name,
    type: r.transition ? 'coping' : 'rail',
    // Authored rail paths run along the pipe centre; grind contact is on top.
    points: r.points.map(([x, y, z]) => new THREE.Vector3(x, y + r.radius, z)),
  }));

  const spawn: ParkSpot = options.spawn ?? {
    name: 'Start',
    position: new THREE.Vector3(...desc.spawn),
    heading: desc.spawnHeading ?? 0,
  };

  return {
    name: desc.name ?? 'Map',
    visual: scene,
    collision,
    rails,
    spawn,
    regions: desc.playableRegions,
    presentation: desc.presentation ?? {},
    skyTexture,
  };
}
