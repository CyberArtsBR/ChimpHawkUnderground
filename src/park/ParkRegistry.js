import { gameAssetUrl } from '../game/AssetPaths.js';
/** Stable park identifiers; public map numbers are independent of saved IDs. */
export const PARK_DEFINITIONS = Object.freeze([
  Object.freeze({ id: 'skate-paradise', number:1, name: 'SKATE PARADISE', subtitle: 'Sunset bowls / vert ramps / street lines', available: true, selectable: true }),
  Object.freeze({ id: 'rooftop', name: 'IRON DISTRICT', subtitle: 'Abandoned steelworks / freight yard', available: true, selectable: false }),
  Object.freeze({ id: 'orbit', number:2, name: 'ORBIT', subtitle: 'Neon lines / orbital skate terminal', available: true, selectable: true }),
  Object.freeze({ id: 'grand-warehouse', number:3, name: 'GRAND WAREHOUSE', subtitle: 'Your custom-built indoor wooden skatepark', available: true, selectable: true }),
  Object.freeze({ id: 'legacy', name: 'LEGACY PARK', subtitle: 'Expanded classic skatepark', available: true, selectable: false }),
]);


/**
 * Designer guidance keyed by ACTUAL scene spot IDs. These are feature sequences,
 * not collision-proven navigation meshes. Never infer geometry or teleport the rider.
 * The authoritative waypoint coordinates come from the active park manifest.
 */
const ROUTE_GUIDES = Object.freeze({
  rooftop: [
    { id: 'technical', name: 'Plaza to freight terminal', category: 'technical',
      spots: ['street', 'freight'], railMatches: ['GRIND_A_', 'GRIND_C_'] },
    { id: 'flow', name: 'Steel Flow Yard and transfers', category: 'flow',
      spots: ['street', 'flow', 'pipework'], railMatches: ['COPING_B_'] },
    { id: 'showcase', name: 'Iron District circuit', category: 'showcase',
      spots: ['street', 'mega', 'freight'], railMatches: ['COPING_E_', 'GRIND_C_'] },
  ],
  orbit: [
    { id: 'technical', name: 'Ion runway technique', category: 'technical',
      spots: ['street', 'rail', 'training'], rails: ['Ion runway long rail', 'Cross-orbit long rail', 'Long ledge ultraviolet edge'] },
    { id: 'flow', name: 'Halfpipe and broad banks', category: 'flow',
      spots: ['flow', 'banks', 'street'], rails: ['02 / north halfpipe coping', '02 / south halfpipe coping'] },
    { id: 'showcase', name: 'ORBIT signature circuit', category: 'showcase',
      spots: ['street', 'bowl', 'flow'], rails: ['Orbit bowl coping', '02 / north halfpipe coping'] },
  ],
  'grand-warehouse': [
    { id: 'technical', name: 'Warehouse street and horseshoe', category: 'technical',
      spots: ['entrance', 'street', 'horseshoe'], railMatches: ['Street', 'Nine stair', 'horseshoe'] },
    { id: 'flow', name: 'Warehouse flow to vert', category: 'flow',
      spots: ['entrance', 'flow', 'vert'], railMatches: ['Flow', 'Vert', 'halfpipe'] },
    { id: 'showcase', name: 'Grand Warehouse districts', category: 'showcase',
      spots: ['entrance', 'bowl', 'vert'], railMatches: ['bowl', 'Competition'] },
  ],
});

export function buildParkRouteMetadata(manifest, parkId) {
  const guides = ROUTE_GUIDES[parkId] || [];
  const spots = new Map((manifest?.spots || []).map(spot => [spot.id, spot]));
  const rails = (manifest?.rails || []).map(rail => rail.name).filter(name => typeof name === 'string');
  return Object.freeze(guides.map(guide => {
    const waypoints = guide.spots.map(id => spots.get(id)).filter(Boolean).map(spot =>
      Object.freeze({
        spotId: spot.id, label: spot.label || spot.id,
        position: Object.freeze([...spot.position]),
        ...(Number.isFinite(spot.heading) ? { heading: spot.heading } : {}),
      }));
    const railNames = [...new Set(rails.filter(name => guide.rails?.includes(name) ||
      guide.railMatches?.some(fragment => name.toLowerCase().includes(fragment.toLowerCase()))))];
    return Object.freeze({
      id: guide.id, name: guide.name, category: guide.category,
      navigation: 'feature-sequence', // Waypoints are safe spawn anchors, NOT a proven clear traversal.
      waypoints: Object.freeze(waypoints), railNames: Object.freeze(railNames),
    });
  }).filter(route => route.waypoints.length >= 2));
}

const isVec3 = value => Array.isArray(value) && value.length === 3 && value.every(Number.isFinite);
const fail = detail => { throw new Error(`Invalid park manifest: ${detail}`); };

export function validateParkManifest(source) {
  if (!source || typeof source !== 'object' || Array.isArray(source)) fail('missing object');
  if (!isVec3(source.spawn)) fail('spawn must contain three finite coordinates');
  if (!Number.isFinite(source.transitionScale) || source.transitionScale <= 0) fail('transitionScale must be positive');
  if (!Array.isArray(source.rails)) fail('rails must be an array');
  if (!Array.isArray(source.playableRegions) || !source.playableRegions.length) fail('playableRegions must not be empty');

  const rails = source.rails.map((rail, index) => {
    if (!rail || typeof rail !== 'object' || !Array.isArray(rail.points) ||
      rail.points.length < 2 || !rail.points.every(isVec3)) fail(`rails[${index}] points`);
    if (rail.radius !== undefined && (!Number.isFinite(rail.radius) || rail.radius <= 0)) fail(`rails[${index}] radius`);
    return Object.freeze({ ...rail, points: Object.freeze(rail.points.map(p => Object.freeze([...p]))) });
  });
  const playableRegions = source.playableRegions.map((region, index) => {
    if (!region || !['minX', 'maxX', 'minZ', 'maxZ'].every(key => Number.isFinite(region[key])) ||
        region.minX >= region.maxX || region.minZ >= region.maxZ) fail(`playableRegions[${index}] bounds`);
    return Object.freeze({ ...region });
  });
  if (source.spots !== undefined && !Array.isArray(source.spots)) fail('spots must be an array');
  const spotIds = new Set();
  const spots = (source.spots || []).map((spot, index) => {
    if (!spot || typeof spot.id !== 'string' || !spot.id.trim() ||
        spotIds.has(spot.id) || !isVec3(spot.position) ||
        (spot.heading !== undefined && !Number.isFinite(spot.heading))) fail(`spots[${index}]`);
    spotIds.add(spot.id);
    return Object.freeze({ ...spot, position: Object.freeze([...spot.position]) });
  });
  const views = {};
  if (source.views !== undefined) {
    if (!source.views || typeof source.views !== 'object' || Array.isArray(source.views)) fail('views must be an object');
    for (const [key, view] of Object.entries(source.views)) {
      if (!view || !isVec3(view.position) || !isVec3(view.target)) fail(`views.${key}`);
      views[key] = Object.freeze({
        ...view, position: Object.freeze([...view.position]), target: Object.freeze([...view.target]),
      });
    }
  }
  if (source.spawnHeading !== undefined && !Number.isFinite(source.spawnHeading)) fail('spawnHeading');
  const railNames = new Set(rails.map(rail => rail.name).filter(Boolean));
  const routes = [];
  if (source.routes !== undefined) {
    if (!Array.isArray(source.routes)) fail('routes must be an array');
    const routeIds = new Set();
    for (const [index, route] of source.routes.entries()) {
      if (!route || typeof route.id !== 'string' || !route.id.trim() ||
          routeIds.has(route.id) || !['technical', 'flow', 'showcase'].includes(route.category) ||
          !Array.isArray(route.waypoints) || route.waypoints.length < 2 ||
          !Array.isArray(route.railNames) || route.railNames.some(name => !railNames.has(name)))
        fail(`routes[${index}]`);
      routeIds.add(route.id);
      const waypoints = route.waypoints.map((point, waypointIndex) => {
        if (!point || !spotIds.has(point.spotId) || !isVec3(point.position) ||
            (point.heading !== undefined && !Number.isFinite(point.heading)) ||
            !playableRegions.some(region => point.position[0] >= region.minX &&
              point.position[0] <= region.maxX && point.position[2] >= region.minZ &&
              point.position[2] <= region.maxZ)) fail(`routes[${index}].waypoints[${waypointIndex}]`);
        return Object.freeze({ ...point, position: Object.freeze([...point.position]) });
      });
      routes.push(Object.freeze({
        ...route, waypoints: Object.freeze(waypoints),
        railNames: Object.freeze([...route.railNames]),
      }));
    }
  }
  if (source.visualTriangles !== undefined && (!Number.isFinite(source.visualTriangles) || source.visualTriangles < 0))
    fail('visualTriangles');
  return Object.freeze({
    ...source,
    spawn: Object.freeze([...source.spawn]),
    rails: Object.freeze(rails),
    playableRegions: Object.freeze(playableRegions),
    spots: Object.freeze(spots),
    ...(source.routes === undefined ? {} : { routes: Object.freeze(routes) }),
    ...(source.views === undefined ? {} : { views: Object.freeze(views) }),
  });
}

export function validateParkWorld(world) {
  if (!world || typeof world !== 'object') throw new Error('Park loader returned no world.');
  if (!world.park || typeof world.park.traverse !== 'function') throw new Error('Park visual root is missing.');
  if (!world.collision || typeof world.collision.traverse !== 'function') throw new Error('Park collision root is missing.');
  return { ...world, manifest: validateParkManifest(world.manifest) };
}

export class ParkRegistry {
  #entries = new Map();

  register(entry) {
    const { id, name, subtitle = '', available = true, selectable = true, load } = entry || {};
    if (typeof id !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id))
      throw new Error('Park ID must be a stable lowercase slug.');
    if (this.#entries.has(id)) throw new Error(`Duplicate park ID: ${id}`);
    if (typeof name !== 'string' || !name.trim()) throw new Error(`Park ${id} requires a display name.`);
    if (available && typeof load !== 'function') throw new Error(`Park ${id} requires a loader.`);
    if (!available && load !== undefined) throw new Error(`Unavailable park ${id} cannot expose a loader.`);
    const registered = Object.freeze({
      id, name, subtitle, available: Boolean(available), selectable: Boolean(selectable),
      ...(available ? { load } : {}),
    });
    this.#entries.set(id, registered);
    return this;
  }

  get(id) { return this.#entries.get(id) || null; }
  list({ selectableOnly = false } = {}) {
    return Object.freeze([...this.#entries.values()]
      .filter(entry => !selectableOnly || entry.selectable)
      .map(({ id, name, subtitle, available, selectable }) =>
        Object.freeze({ id, name, subtitle, available, selectable })));
  }
  requirePlayable(id) {
    const entry = this.get(id);
    if (!entry) throw new Error(`Unknown park ID: ${String(id)}`);
    if (!entry.available) throw new Error(`Park ${id} is not playable yet.`);
    return entry;
  }
}

function assertNotAborted(signal) {
  if (signal?.aborted) throw new Error('Park load was cancelled.');
}

async function loadRooftop({ scope, signal }) {
  const { createIronDistrict } = await import('./IronDistrict.js');
  assertNotAborted(signal);
  const world = await createIronDistrict();
  scope.trackWorld(world, { disposeTextures: true });
  assertNotAborted(signal);
  return world;
}

async function loadLegacy({ scope, signal }) {
  const [{ GLTFLoader }, { assembleExpandedPark }] = await Promise.all([
    import('three/addons/loaders/GLTFLoader.js'), import('./ExpandedPark.js'),
  ]);
  assertNotAborted(signal);
  const loader = new GLTFLoader();
  const loadModel = async url => {
    const gltf = await loader.loadAsync(url);
    // May resolve *after* cancellation: ResourceScope immediately disposes late
    // tracked roots, so partially successful Promise.all loads do not leak.
    scope.trackRoot(gltf.scene, { disposeTextures: true });
    return gltf.scene;
  };
  const loadManifest = async () => {
    const response = await fetch(gameAssetUrl('/assets/park/park-manifest.json'), { signal });
    if (!response.ok) throw new Error(`Legacy manifest unavailable (HTTP ${response.status}).`);
    return response.json();
  };
  const [park, collision, manifest, expanded] = await Promise.all([
    loadModel(gameAssetUrl('/assets/park/insanity-inspired-park.glb')),
    loadModel(gameAssetUrl('/assets/park/park-collision.glb')),
    loadManifest(),
    loadModel(gameAssetUrl('/assets/park/halfnew.glb?v=fixed-black')),
  ]);
  assertNotAborted(signal);
  const assembled = assembleExpandedPark(expanded, park, collision, manifest);
  scope.trackWorld(assembled, { disposeTextures: true });
  return { ...assembled, manifest };
}

async function loadWarehouseVariant({ scope, signal }, id) {
  const { createOrbitPark } = await import('./OrbitPark.js');
  const { createWarehouseVariant } = await import('./WarehouseVariants.js');
  assertNotAborted(signal);
  const world = id === 'orbit' ? await createOrbitPark() : await createWarehouseVariant(id);
  scope.trackWorld(world, { disposeTextures: true });
  await world.ready;
  assertNotAborted(signal);
  return world;
}

async function loadSkateParadise({scope,signal}) {
  const {createSkateParadise}=await import('./SkateParadise.js');
  assertNotAborted(signal);
  const world=await createSkateParadise({signal});
  scope.trackWorld(world,{disposeTextures:true});
  assertNotAborted(signal);
  return world;
}

export function createDefaultParkRegistry({ rooftopLoader = loadRooftop, legacyLoader = loadLegacy, paradiseLoader=loadSkateParadise } = {}) {
  const registry = new ParkRegistry();
  for (const definition of PARK_DEFINITIONS) {
    const load = definition.id === 'skate-paradise' ? paradiseLoader : definition.id === 'rooftop' ? rooftopLoader :
      definition.id === 'legacy' ? legacyLoader
        : ['orbit', 'grand-warehouse'].includes(definition.id)
          ? params => loadWarehouseVariant(params, definition.id) : undefined;
    registry.register({ ...definition, ...(load ? { load } : {}) });
  }
  return registry;
}
