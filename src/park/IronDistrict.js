import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { gameAssetUrl } from '../game/AssetPaths.js';
import { ParkCollision } from '../game/ParkCollision.js';
import { SkateboardContactRig } from '../game/SkateboardContactRig.js';

export const IRON_DISTRICT_ASSET = '/assets/iron-district/IronDistrictSource.glb';
const authoredName = object => object.userData.name || object.name;
const triangles = geometry => (geometry.index?.count || geometry.attributes.position.count) / 3;

function addCollision(root, object, material, userData) {
  object.traverse(mesh => {
    if (!mesh.isMesh) return;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', mesh.geometry.attributes.position.clone());
    if (mesh.geometry.index) geometry.setIndex(mesh.geometry.index.clone());
    geometry.applyMatrix4(mesh.matrixWorld);
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    const proxy = new THREE.Mesh(geometry, material);
    proxy.name = `IRON / ${authoredName(object)}`;
    proxy.userData = { ...userData, sourceObject: authoredName(object) };
    root.add(proxy);
  });
}

function alignPath(path, object, baseline) {
  if (!baseline) throw new Error(`Missing original transform for ${path.object}.`);
  const delta = object.matrixWorld.clone().multiply(new THREE.Matrix4().fromArray(baseline).invert());
  return path.points.map(point => new THREE.Vector3(...point).applyMatrix4(delta).toArray());
}

// Every collider comes from the same edited geometry as the visible obstacle.
// COL_* is the old export and must never render or contribute phantom walls.
export function assembleIronDistrict(source, metadata, originalTransforms) {
  source.updateMatrixWorld(true);
  const objects = new Map();
  // A Blender node with several material primitives is a group; index the
  // authored node, not each primitive, to preserve its original transform.
  for (const object of source.children) objects.set(authoredName(object), object);
  const collision = new THREE.Group();
  collision.name = 'Iron District / edited collision';
  const colliderMaterial = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
  const surfaces = new Map(metadata.rideableSurfaces.map(surface => [surface.object, surface]));
  for (const [name, object] of objects) {
    if (name.startsWith('RIDE_')) {
      addCollision(collision, object, colliderMaterial, { surface: 'rideable',
        surfaceType: surfaces.get(name)?.surfaceType || 'concrete' });
    } else if (name.startsWith('VIS_') && objects.has(`COL_${name}`)) {
      addCollision(collision, object, colliderMaterial, { surface: 'solid' });
    }
  }
  if (!collision.children.length) throw new Error('Iron District has no edited riding surfaces.');

  const rails = [];
  for (const path of [...metadata.rails, ...metadata.copings]) {
    const object = objects.get(path.object);
    if (!object) continue; // Deleted art must not retain invisible grind paths.
    const coping = path.object.startsWith('COPING_');
    const transitionType = /Foundry|Ladle/.test(path.object) ? 'BOWL'
      : /Halfpipe/.test(path.object) ? 'MINI' : /Quarter/.test(path.object) ? 'QUARTER' : null;
    const rail = { name: path.object, points: alignPath(path, object, originalTransforms[path.object]),
      radius: path.radius, closed: path.closed, coping };
    if (coping && transitionType) rail.transition = {
      id: path.object, type: transitionType, axisMode: transitionType === 'BOWL' ? 'RADIAL' : 'LINEAR',
      supportsVert: true, supportsTransfer: true, supportsPump: true,
      supportsLipTricks: true, cameraHint: transitionType,
    };
    rails.push(rail);
    // Coping is wheel/transition guidance; narrow grind bars only block the
    // body, with an ID matching RailNetwork's ignore-while-grinding contract.
    if (!coping) addCollision(collision, object, colliderMaterial, { surface: 'solid', railId: rail.name });
  }

  const park = new THREE.Group();
  park.name = 'IRON DISTRICT';
  const batches = new Map(), oldGeometry = new Set();
  let visualTriangles = 0, sourceMeshes = 0;
  for (const [name, object] of objects) {
    if (!/^(RIDE|GRIND|COPING|VIS|DECO)_/.test(name)) continue;
    object.traverse(mesh => {
      if (!mesh.isMesh) return;
      if (Array.isArray(mesh.material)) throw new Error('Unexpected unsplit Iron District material groups.');
      const geometry = mesh.geometry.clone().applyMatrix4(mesh.matrixWorld);
      // The exporter splits material primitives, so merging by material and
      // attribute layout retains all UVs, normals, tangents and authored paint.
      const key = [mesh.material.uuid, Object.keys(geometry.attributes).sort().join(','),
        geometry.index ? 'indexed' : 'flat'].join(':');
      if (!batches.has(key)) batches.set(key, { material: mesh.material, geometries: [] });
      batches.get(key).geometries.push(geometry);
      oldGeometry.add(mesh.geometry);
      visualTriangles += triangles(geometry);
      sourceMeshes++;
    });
  }
  for (const { material, geometries } of batches.values()) {
    const geometry = geometries.length === 1 ? geometries[0] : mergeGeometries(geometries, false);
    if (!geometry) throw new Error('Could not batch Iron District geometry.');
    if (geometries.length > 1) for (const input of geometries) input.dispose();
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = `Iron District / ${material.name || 'material'} / ${park.children.length + 1}`;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    park.add(mesh);
  }
  for (const geometry of oldGeometry) geometry.dispose();

  const spots = metadata.spawns.map(marker => {
    const object = objects.get(marker.name);
    const position = object ? object.getWorldPosition(new THREE.Vector3()).toArray() : [...marker.position];
    const id = { SPAWN_MAIN: 'street', SPAWN_FLOW: 'flow', SPAWN_FREIGHT: 'freight',
      SPAWN_PIPEWORK: 'pipework', SPAWN_MEGARAMP: 'mega' }[marker.name];
    return { id, label: { street: 'Plaza', flow: 'Flow yard', freight: 'Freight',
      pipework: 'Transfers', mega: 'Megaramp' }[id], position,
      // Package heading 0 faces +Z; the game's heading 0 faces -Z.
      heading: Math.PI + THREE.MathUtils.degToRad(marker.headingDegrees || 0) };
  });
  // The mega ramp was moved independently of its old spawn marker. Keep its
  // approach at the corresponding edited position rather than the old yard.
  const mega = objects.get('RIDE_E_IronMegaramp');
  const megaSpot = spots.find(spot => spot.id === 'mega');
  if (mega && megaSpot) {
    const delta = mega.matrixWorld.clone().multiply(new THREE.Matrix4()
      .fromArray(originalTransforms.RIDE_E_IronMegaramp).invert());
    megaSpot.position = new THREE.Vector3(...megaSpot.position).applyMatrix4(delta).toArray();
  }
  const bounds = metadata.mapBounds;
  const manifest = {
    id: 'iron-district', name: 'IRON DISTRICT', activeAsset: IRON_DISTRICT_ASSET,
    dimensions: '200 × 150 m · STEELWORKS / FREIGHT YARD', sizeMetres: [200, 150],
    transitionScale: 1, spawn: [...spots[0].position], spawnHeading: spots[0].heading,
    spots, rails, visualTriangles,
    // Package zones are planning envelopes with gaps between them. Use the
    // continuous authored ground for boundaries so connecting paths stay open.
    playableRegions: [{ minX: bounds.minX + 0.5, maxX: bounds.maxX - 0.5,
      minZ: bounds.minZ + 0.5, maxZ: bounds.maxZ - 0.5 }],
    worldBounds: { min: [bounds.minX, -3.2, bounds.minZ], max: [bounds.maxX, 35, bounds.maxZ] },
    statistics: { sourceMeshes, drawCalls: park.children.length,
      collisionTriangles: collision.children.reduce((sum, mesh) => sum + triangles(mesh.geometry), 0),
      collisionSource: 'edited visual geometry; stale COL proxies excluded' },
    views: {
      overview: { position: [175, 130, 180], target: [0, 1, 0], caption: 'Iron District · Steelworks and freight yard', index: '01' },
      bowl: { position: [-18, 42, 16], target: [-65, -1, -32], caption: 'Steel Flow Yard · Bowls and halfpipe', index: '02' },
      street: { position: [45, 28, 42], target: [0, 0, 0], caption: 'Blast Furnace Plaza · Street lines', index: '03' },
      top: { position: [0, 205, 0.01], target: [0, 0, 0], caption: 'Iron District · All connected sectors', index: '—' },
    },
  };
  return { park, collision, manifest };
}

export function validateIronDistrictSpawns(world) {
  const surface = new ParkCollision(world.collision);
  const contact = new SkateboardContactRig(surface);
  const offsets = [[0, 0]];
  for (const distance of [1, 2, 4, 6, 8, 12, 16]) for (let i = 0; i < 16; i++)
    offsets.push([distance * Math.cos(i * Math.PI / 8), distance * Math.sin(i * Math.PI / 8)]);
  const find = spot => {
    for (const [dx, dz] of offsets) {
      const point = new THREE.Vector3(spot.position[0] + dx, spot.position[1], spot.position[2] + dz);
      const region = world.manifest.playableRegions[0];
      if (point.x < region.minX + 2 || point.x > region.maxX - 2 ||
          point.z < region.minZ + 2 || point.z > region.maxZ - 2) continue;
      const support = contact.snapToGround(point, spot.heading, 0.5, 1);
      if (!support.supported || support.count !== 4 || support.normal.y < 0.985 ||
          Math.abs(support.position.y - point.y) > 0.38) continue;
      const heights = support.contacts.map(wheel => wheel.point.y);
      if (Math.max(...heights) - Math.min(...heights) > 0.065) continue;
      const reverse = contact.snapToGround(support.position, spot.heading + Math.PI, 0.2, 0.25);
      if (!reverse.supported || reverse.count !== 4 || reverse.normal.y < 0.985) continue;
      const body = surface.move(support.position, support.position, new THREE.Vector3(), { grounded: false });
      if (body.contacts.length || body.position.distanceToSquared(support.position) > 0.001) continue;
      const head = support.position.clone().add(new THREE.Vector3(0, 1.8, 0));
      const eye = support.position.clone().add(new THREE.Vector3(0, 0.4, 0));
      if (surface.camera(eye, head, 0.18).distanceToSquared(head) > 0.01) continue;
      return { ...spot, position: support.position.toArray() };
    }
    throw new Error(`Iron District has no clear four-wheel spawn near ${spot.label}.`);
  };
  const spots = world.manifest.spots.map(find);
  world.manifest.spots = spots;
  world.manifest.spawn = [...spots[0].position];
  world.manifest.statistics.validatedSpawns = spots.length;
  return world;
}

export async function createIronDistrict({ loader = new GLTFLoader(), fetcher = fetch } = {}) {
  const json = async path => {
    const response = await fetcher(gameAssetUrl(`/assets/iron-district/${path}`));
    if (!response.ok) throw new Error(`Iron District ${path} unavailable (HTTP ${response.status}).`);
    return response.json();
  };
  // Check the small metadata files before allocating the model's textures.
  const [metadata, transforms] = await Promise.all([
    json('IronDistrict_Metadata.json'), json('original-transforms.json'),
  ]);
  const gltf = await loader.loadAsync(gameAssetUrl(IRON_DISTRICT_ASSET));
  let world;
  try {
    world = assembleIronDistrict(gltf.scene, metadata, transforms);
    return validateIronDistrictSpawns(world);
  } catch (error) {
    const { disposeParkWorld } = await import('../game/ParkRegistry.js');
    disposeParkWorld(world || { park: gltf.scene });
    throw error;
  }
}
