import { gameAssetUrl } from './AssetPaths.js';
import * as THREE from 'three';
import { ParkCollision } from './ParkCollision.js';
import { RailNetwork } from './RailNetwork.js';
import { CoreSkateController } from './core/CoreSkateController.js';
import { SkateboardContactRig } from './SkateboardContactRig.js';
import { sharedSurfaceTextures, surfaceTexturesReady } from '../park/SurfaceMaterials.js';
import { buildParkRouteMetadata, validateParkManifest } from '../park/ParkRegistry.js';
import { resolveMapLook } from '../graphics/MapLook.js';
import { refineMapSurfaces } from '../graphics/SurfaceFinish.js';

// Location-specific presentation only; universal skate physics stays unchanged.
export const PARK_REGISTRY = Object.freeze({
  'skate-paradise': {
    name:'Skate Paradise',
    create:async()=>(await import('../park/SkateParadise.js')).createSkateParadise(),
    presentation:{},
  },
  rooftop: {
    name: 'Iron District',
    create: async () => (await import('../park/IronDistrict.js')).createIronDistrict(),
    presentation: { center: [0, 0, 0], sky: true, exposure: 1.02,
      fogColor: '#c5b7a7', fogDensity: 0.0008,
      ambientSky: '#bce1ff', ambientGround: '#635649', ambientIntensity: 0.65,
      keyColor: '#ffddb8', keyIntensity: 2.1, keyPosition: [-55, 70, 35],
      shadowExtent: 110, backgroundIntensity: 0.9, environmentIntensity: 0.65,
      fallback: { background: '#c1d1cf', fogColor: '#c1d1cf', keyColor: '#fff1d9',
        keyIntensity: 2.8, keyPosition: [-25, 65, 2], ambientIntensity: 0.9, environmentIntensity: 0.24 } },
  },
  orbit: {
    name: 'ORBIT',
    create: async () => (await import('../park/OrbitPark.js')).createOrbitPark(),
    presentation: { center: [0, 0, 0], sky: false, exposure: 1.05, background: '#090e22',
      fogColor: '#090e22', fogDensity: 0, ambientSky: '#b2d8ff',
      ambientGround: '#233452', ambientIntensity: 1.4,
      keyColor: '#c6efff', keyIntensity: 2.2, keyPosition: [25, 55, 10],
      shadowExtent: 82, environmentIntensity: .45 },
  },
  'grand-warehouse': {
    name: 'Grand Warehouse',
    create: async () => (await import('../park/WarehouseVariants.js')).createWarehouseVariant('grand-warehouse'),
    presentation: { center: [0, 0, 0], sky: false, exposure: 1.06, background: '#30323a',
      fogColor: '#30323a', fogNear: 100, fogFar: 225, ambientSky: '#d4ddf2',
      ambientGround: '#41392e', ambientIntensity: 1.6,
      keyColor: '#ffe4bc', keyIntensity: 2.6, keyPosition: [25, 35, 10],
      shadowExtent: 82, environmentIntensity: .38, roofCutawayHeight: 18.5 },
  },
  legacy: {
    name: 'Legacy park',
    create: async () => {
      const [{ GLTFLoader }, { assembleExpandedPark }] = await Promise.all([
        import('three/addons/loaders/GLTFLoader.js'), import('../park/ExpandedPark.js'),
      ]);
      const loader = new GLTFLoader();
      const [original, proxies, manifest, extended] = await Promise.all([
        loader.loadAsync(gameAssetUrl('/assets/park/insanity-inspired-park.glb')),
        loader.loadAsync(gameAssetUrl('/assets/park/park-collision.glb')),
        fetch(gameAssetUrl('/assets/park/park-manifest.json')).then(response => {
          if (!response.ok) throw new Error('Legacy park manifest unavailable');
          return response.json();
        }),
        loader.loadAsync(gameAssetUrl('/assets/park/halfnew.glb?v=fixed-black')),
      ]);
      return { ...assembleExpandedPark(extended.scene, original.scene, proxies.scene, manifest), manifest };
    },
    presentation: { center: [34, 0, 23], sky: false, exposure: 1.05,
      background: '#25363d', fogColor: '#25363d', fogDensity: 0.005,
      ambientSky: '#bce1ff', ambientGround: '#635649', ambientIntensity: 1.3,
      keyColor: '#fff1d9', keyIntensity: 2.8, keyPosition: [9, 65, 33],
      shadowExtent: 90, environmentIntensity: 0.32, floor: true },
  },
});

export function validateParkWorld(world) {
  if (!world?.park?.isObject3D || !world?.collision?.isObject3D)
    throw new Error('Location did not provide visual and collision roots.');
  const manifest = world.manifest;
  if (!Array.isArray(manifest?.spawn) || manifest.spawn.length !== 3 || !manifest.spawn.every(Number.isFinite))
    throw new Error('Location is missing a valid spawn point.');
  if (!Array.isArray(manifest.rails) || !manifest.playableRegions?.length)
    throw new Error('Location is missing rails or playable boundaries.');
  if (!manifest.playableRegions.every(region =>
    ['minX', 'maxX', 'minZ', 'maxZ'].every(key => Number.isFinite(region[key]))
    && region.minX < region.maxX && region.minZ < region.maxZ))
    throw new Error('Location has invalid playable boundaries.');
  const names = new Set();
  for (const rail of manifest.rails) {
    if (!rail.name || names.has(rail.name) || !Array.isArray(rail.points) || rail.points.length < 2
      || !rail.points.every(point => Array.isArray(point) && point.length === 3 && point.every(Number.isFinite)))
      throw new Error('Location contains an invalid or duplicate grind path.');
    names.add(rail.name);
  }
  // The core game retains a mutable manifest for locationId/presentation updates.
  // Validate against the same strict contract used by the transactional loader.
  validateParkManifest(manifest);
  return world;
}

export async function createParkWorld(id, onProgress = () => {}) {
  const entry = PARK_REGISTRY[id];
  if (!entry) throw new Error('This location is not available yet.');
  let world;
  try {
    onProgress(`BUILDING ${entry.name.toUpperCase()}…`);
    world = await entry.create();
    validateParkWorld(world);
    onProgress('LOADING LOCATION MATERIALS…');
    // Readiness belongs to the selected world: a Rooftop texture failure must
    // never stop the independent warehouse or archived GLB park from loading.
    await world.ready;
    if (world.manifest.routes === undefined)
      world.manifest.routes = buildParkRouteMetadata(world.manifest, id);
    validateParkWorld(world);
    world.id = id;
    world.park.userData.contactDepth = ['orbit','grand-warehouse'].includes(id);
    world.presentation = resolveMapLook(id,
      { ...entry.presentation, ...world.manifest.environment, ...world.presentation });
    refineMapSurfaces(world.park, id);
    world.manifest.locationId = id;
    world.cameraRoof = [];
    world.park.traverse(object => { if (object.userData.cameraRoof) world.cameraRoof.push(object); });
    return world;
  } catch (error) {
    if (world) disposeParkWorld(world);
    throw error;
  }
}

// Prepare independent services before touching the current actor or scene. In
// particular the wheel solver, transition controller and body resolver must all
// refer to this same collision world after a switch.
export function prepareParkRuntime(world, contactRig) {
  validateParkWorld(world);
  const surface = new ParkCollision(world.collision);
  const boardContact = new SkateboardContactRig(surface, contactRig);
  const spawn = new THREE.Vector3(...world.manifest.spawn);
  const spawnHeading = Number(world.manifest.spawnHeading) || 0;
  const support = boardContact.snapToGround(spawn, spawnHeading, 0.5, 1);
  if (!support.supported || support.count < 4 || support.normal.y < 0.96)
    throw new Error('Location entrance needs a clear, flat four-wheel spawn.');
  const inside = world.manifest.playableRegions.some(region =>
    spawn.x > region.minX + 0.8 && spawn.x < region.maxX - 0.8
    && spawn.z > region.minZ + 0.8 && spawn.z < region.maxZ - 0.8);
  const body = surface.move(support.position, support.position, new THREE.Vector3(), { grounded: false });
  if (!inside || body.contacts.length || body.position.distanceToSquared(support.position) > 0.001)
    throw new Error('Location entrance is obstructed or outside the playable area.');
  const coreController = new CoreSkateController({ surface, rails: world.manifest.rails });
  return { surface, boardContact, contactRig: boardContact.rig, coreController,
    railNetwork: new RailNetwork(world.manifest.rails), spawn, spawnHeading,
    playableRegions: world.manifest.playableRegions };
}

export function bindParkRuntime(skater, runtime) {
  Object.assign(skater, runtime);
  runtime.coreController.bindLegacyRuntime(skater);
  skater.reset(runtime.spawn, runtime.spawnHeading);
  skater.update(0, {}, 0);
}

export function disposeParkWorld(world, retainedWorld = null) {
  if (!world) return;
  const protectedTextures = sharedSurfaceTextures();
  const protectedMaterials = new Set(), protectedGeometry = new Set();
  const textures = new Set(), materials = new Set(), geometries = new Set();
  const gather = (root, geometrySet, materialSet, textureSet) => root?.traverse(object => {
    if (object.geometry) geometrySet.add(object.geometry);
    const list = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of list) if (material) {
      materialSet.add(material);
      for (const value of Object.values(material)) if (value?.isTexture) textureSet.add(value);
      for (const uniform of Object.values(material.uniforms || {}))
        if (uniform?.value?.isTexture) textureSet.add(uniform.value);
    }
  });
  gather(retainedWorld?.park, protectedGeometry, protectedMaterials, protectedTextures);
  gather(retainedWorld?.collision, protectedGeometry, protectedMaterials, protectedTextures);
  if(retainedWorld?.environment?.isTexture) protectedTextures.add(retainedWorld.environment);
  gather(world.park, geometries, materials, textures);
  gather(world.collision, geometries, materials, textures);
  if(world.environment?.isTexture) textures.add(world.environment);
  world.park?.removeFromParent();
  world.collision?.removeFromParent();
  for (const geometry of geometries) if (!protectedGeometry.has(geometry)) {
    geometry.disposeBoundsTree?.();
    geometry.boundsTree = null;
    geometry.dispose();
  }
  for (const material of materials) if (!protectedMaterials.has(material)) material.dispose();
  for (const texture of textures) if (!protectedTextures.has(texture)) texture.dispose();
}
