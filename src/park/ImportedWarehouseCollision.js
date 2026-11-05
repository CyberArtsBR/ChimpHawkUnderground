import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { repairImportedWarehouse } from './ImportedWarehouseRepairs.js';
import { shippingSurfaceTag } from '../game/SurfaceAudio.js';

export function warehouseObjectName(object) {
  for (let node = object; node; node = node.parent) {
    const name = node.userData?.name || node.name || '';
    if (name.includes(' / ')) return name;
  }
  return object.name || '';
}

// The Blender export stores swept tubes as ordered ten-vertex rings, with
// repeated vertices for split normals/UVs. Collapse only duplicate positions,
// average each ring and validate its radius before accepting a grind path.
export function warehouseTubePaths(geometry) {
  const position = geometry.attributes.position;
  const unique = new Map();
  for (let i = 0; i < position.count; i++) {
    const p = new THREE.Vector3().fromBufferAttribute(position, i);
    const id = p.toArray().map(v => Math.round(v * 100000)).join(',');
    if (!unique.has(id)) unique.set(id, p);
  }
  const vertices = [...unique.values()], ids = new Map([...unique.keys()].map((key, i) => [key, i]));
  const vertexIds = Array.from({ length: position.count }, (_, i) => ids.get(
    [position.getX(i), position.getY(i), position.getZ(i)].map(v => Math.round(v * 100000)).join(',')));
  const parents = vertices.map((_, i) => i);
  const find = i => { while (parents[i] !== i) { parents[i] = parents[parents[i]]; i = parents[i]; } return i; };
  const index = geometry.index;
  for (let i = 0; i < (index?.count || position.count); i += 3) {
    const a = vertexIds[index ? index.getX(i) : i];
    for (let j = 1; j < 3; j++) parents[find(vertexIds[index ? index.getX(i + j) : i + j])] = find(a);
  }
  // Joined materials may contain two independent coping bars. Never create a
  // phantom diagonal rail by connecting the end of one to the start of another.
  const components = new Map();
  vertices.forEach((vertex, i) => { const key = find(i); if (!components.has(key)) components.set(key, []); components.get(key).push(vertex); });
  const paths = [];
  for (const component of components.values()) {
    if (component.length < 20 || component.length % 10) return [];
    const points = []; let radius = 0;
    for (let i = 0; i < component.length; i += 10) {
      const ring = component.slice(i, i + 10);
      const centre = ring.reduce((sum, v) => sum.add(v), new THREE.Vector3()).multiplyScalar(.1);
      const radii = ring.map(v => v.distanceTo(centre));
      const average = radii.reduce((a, b) => a + b, 0) / 10;
      if (average < .01 || average > .4 || Math.max(...radii) / Math.min(...radii) > 4) return [];
      radius += average; points.push(centre.toArray());
    }
    paths.push({ points, radius: radius / points.length });
  }
  return paths;
}
export function buildImportedWarehouseCollision(root, authoredRails = [], { grandMode = false } = {}) {
  const repairs = repairImportedWarehouse(root, {
    preserveArtistLayout: grandMode,
    preserveFloorFinish: grandMode,
  });
  root.updateMatrixWorld(true);
  const collision = new THREE.Group(); collision.name = 'Urban warehouse / imported collision';
  const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
  const buckets = new Map(), rails = [], surfaces = [], railPaths = new Set();
  const add = (geometry, surface, name, railId = null, audioSurfaceTag = 'neutral') => {
    if (geometry.index) { const old = geometry; geometry = geometry.toNonIndexed(); old.dispose(); }
    for (const attribute of Object.keys(geometry.attributes)) if (attribute !== 'position') geometry.deleteAttribute(attribute);
    const cameraTransparent = Boolean(railId) || /vertical_post|Down_Rail_Support/.test(name);
    // Keep the actual rideable ramp skin separate from support walls in the
    // merged collision BVH. A near-vertical tip is not a blocking wall.
    const transitionSkin = surface === 'rideable'
      && /Skateable_Surface|Rideable_Arc|Continuous_Rideable_Surface|Bowl.*Transition|Flow.*ramp/i.test(name);
    const id = `${surface}:${railId || ''}:${cameraTransparent}:${transitionSkin}:${audioSurfaceTag}`;
    if (!buckets.has(id)) buckets.set(id, { geometries: [], surface, railId, cameraTransparent, transitionSkin, audioSurfaceTag });
    buckets.get(id).geometries.push(geometry);
    if (surface === 'rideable') surfaces.push(name);
  };
  
  // Additional Blender-imported SkateLite ramp and two long, low skate
  // obstacles have generic names rather than Foundry collision labels. Split
  // actual WORLD-SPACE triangles into the skateable upward skin versus solid
  // sides/back. This is deliberately Grand-only; Map 2 remains untouched.
  const addGrandFixture = (object, name) => {
    const geometry = object.geometry.clone().applyMatrix4(object.matrixWorld);
    const source = geometry.index ? geometry.toNonIndexed() : geometry;
    if (source !== geometry) geometry.dispose();
    const p = source.attributes.position;
    const up = [], side = [];
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
    const edge1 = new THREE.Vector3(), edge2 = new THREE.Vector3();
    for (let i = 0; i + 2 < p.count; i += 3) {
      a.fromBufferAttribute(p, i);
      b.fromBufferAttribute(p, i + 1);
      c.fromBufferAttribute(p, i + 2);
      const normal = edge1.subVectors(b, a).cross(edge2.subVectors(c, a));
      if (normal.lengthSq() < 1e-12) continue;
      // Very steep quarter/corner lip triangles used to be misclassified as
      // vertical structural walls, stopping the board just before takeoff.
      const vertices = normal.y > 0.005 * normal.length() ? up : side;
      vertices.push(a.x,a.y,a.z,b.x,b.y,b.z,c.x,c.y,c.z);
    }
    source.dispose();
    for (const [vertices,surface] of [[up,'rideable'],[side,'solid']]) {
      if (!vertices.length) continue;
      const proxy = new THREE.BufferGeometry();
      proxy.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
      add(proxy, surface, name, null, shippingSurfaceTag(object));
    }
  };

  root.traverse(object => {
    if (!object.isMesh || object.userData.grandWarehouseExcluded) return;
    const name = warehouseObjectName(object);
    // GLTFLoader removes periods (Cube__0.001 -> Cube__0001) and splits
    // the three SkateLite materials into numbered child Mesh instances.
    // Prefer preserved glTF userData names when present; normalize each
    // material primitive back to the same logical skate obstacle.
    if (grandMode) {
      const importedName = object.userData?.name || name;
      const cube = /^Cube__0(?:\.001)?$/.test(importedName) || /^Cube__0001$/.test(name);
      const skateLite = /^Plane_SkateLite_base_color(?:[._]?002)_0(?:_\d+)?$/.test(name)
        || /^Plane_SkateLite_base_color\.002_0$/.test(importedName);
      if (cube || skateLite) {
        const canonical = skateLite ? 'Plane_SkateLite_base_color.002_0'
          : (importedName.includes('.001') || name === 'Cube__0001' ? 'Cube__0.001' : 'Cube__0');
        addGrandFixture(object, canonical);
        return;
      }
    }
    const materialName = object.material?.name || '';
    const audioSurfaceTag = shippingSurfaceTag(object);
    const joinedRamp = object.parent?.userData?.name?.includes(' / ')
      && /Side_Edge_Band|Side_Wood_Core|Back_Panel/.test(name);
    const grandMetal = grandMode && /Foundry_(?:Stainless_Coping|Grind_Rail)/.test(materialName);
    // Blender can join metal rails into mixed-material ramp, ledge and side
    // meshes. GLTFLoader splits those materials into child primitives. Rebuild
    // grind paths only from the metal pipe primitive, not its wooden support.
    const grandEmbeddedCoping = grandMetal && !/___tube/.test(name)
      && /Skateable_Surface|Side_Wood_Core|Back_Panel|Hubba_Solid|Curved_Quarter_Rear_Panel/.test(name);
    const joinedCoping = (joinedRamp && /Stainless_Coping/.test(materialName))
      || grandEmbeddedCoping;
    const grandMixedTubePart = grandMode && /___tube/.test(name) && !grandMetal;
    const grandMixedRampPart = grandMode && /Skateable_Surface/.test(name)
      && !/Foundry_Plywood(?:\.\d+)?$/.test(materialName) && !grandMetal;
    // Imported multilayer quarter meshes contain dark timber sides under the
    // same Skateable_Surface object name. They are solids, not wheel support.
    if (grandMixedRampPart && /Plywood_Edges/.test(materialName)) return;
    if (grandMixedRampPart) {
      // An authored Skateable_Surface with a nonstandard imported material was
      // previously downgraded wholesale to solid. That blocks the long wooden
      // warehouse quarter near the horseshoe rail/bowl. Keep only actual
      // upward-facing skin rideable; vertical backs and undersides stay solid.
      // The triangles are taken directly from the GLB, with no geometry moves.
      addGrandFixture(object, name);
      return;
    }
    const joinedRiding = joinedRamp && /Foundry_Plywood(?:\.\d+)?$/.test(materialName);
    // Blender joins preserve material primitives, not the original object
    // labels. Edge trim must never become a second wall or wheel surface.
    if (joinedRamp && /Plywood_Edges/.test(materialName)) return;
    if (/^06_ROOF|Floor_Markings|mounting_plate|Step_Edge|Yellow_Rim_Inlay/.test(name)
      || (/Side_Edge_Band/.test(name) && !joinedRamp)) return;
    const stairLanding = /(?:Stair|Stairs)_(?:Landing|Top_Platform|Upper_Platform|Tread|Deck|Skateable_Surface)/i.test(name);
    const rideable = joinedRamp ? joinedRiding
      : (grandMixedTubePart || grandMixedRampPart)
        ? /Foundry_Plywood(?:\.\d+)?$/.test(materialName)
        : stairLanding || /Ground_Floor|Skateable_Surface|Surface_Plywood|Step_\d|Upper_Stair_Platform|Platform_Link|Bowl.*(?:Transition|Floor)|Rideable_Arc|Continuous_Rideable_Surface|Hubba_Solid/.test(name);
    const tube = joinedCoping || (/___tube/.test(name) && (!grandMode || grandMetal));
    const solid = joinedRamp || grandMixedTubePart || grandMixedRampPart || /Side_Wood_Core|Back_Panel|Concrete_or_wood_support|Hubba_Solid|vertical_post|Down_Rail_Support|End_Enclosure|Rear_Panel|Structural_Pillar|Column_Footing|Warehouse_Walls|Loading_Bay_Door|(?:Stair|Stairs)_(?:Riser|Sidewall|Side_Panel|Stringer|Support|Body|Core)/i.test(name);
    if (!rideable && !solid && !tube) return;
    const geometry = object.geometry.clone().applyMatrix4(object.matrixWorld);
    if (tube) {
      const base = name.split(' / ')[1] + (joinedCoping ? ' coping' : '');
      const template = authoredRails.find(rail => rail.name === base)
        || (joinedCoping ? authoredRails.find(rail => rail.name.startsWith(base.replace(/ coping$/, '') + ' ') && rail.transition) : null);
      const paths = warehouseTubePaths(geometry);
      if (!paths.length) {
        if (!grandMode) throw new Error(`Cannot extract grind path from ${name}`);
        // Some joined steel details are supports, not valid 10-sided pipes.
        // Preserve them as physical blockers, never create a phantom grind.
        add(geometry, 'solid', name, null, audioSurfaceTag);
        return;
      }
      const railId = `${base} / imported ${rails.length + 1}`;
      for (const [i, path] of paths.entries()) {
        const forward = path.points.map(p => p.map(v => Math.round(v * 10000)).join(',')).join(';');
        const reverse = path.points.slice().reverse().map(p => p.map(v => Math.round(v * 10000)).join(',')).join(';');
        const signature = forward < reverse ? forward : reverse;
        const coincident = rails.some(rail => rail.points.length === path.points.length
          && Math.abs(rail.radius - path.radius) < .0001
          && [path.points, path.points.slice().reverse()].some(points => points.every((p, j) =>
            p.every((v, axis) => Math.abs(v - rail.points[j][axis]) < .0001))));
        if (railPaths.has(signature) || coincident) continue;
        railPaths.add(signature);
        rails.push({
          ...path, name: i ? `${railId}.${i}` : railId, audioSurfaceTag,
          ...(template?.transition ? { transition: { ...template.transition, id: `${template.transition.id}-${rails.length}` } } : {}),
        });
      }
      // Coping stays available to grind/transition logic without blocking wheels
      // rolling through the lip. Regular handrails remain physical obstacles.
      if (template?.transition || /coping/i.test(base)) geometry.dispose();
      else add(geometry, 'solid', name, railId, audioSurfaceTag);
    } else add(geometry, rideable ? 'rideable' : 'solid', joinedRiding
      ? name.replace(/Side_Edge_Band|Side_Wood_Core|Back_Panel/, 'Skateable_Surface') : name, null, audioSurfaceTag);
  });
  let triangles = 0;
  for (const bucket of buckets.values()) {
    const geometry = mergeGeometries(bucket.geometries, false);
    for (const source of bucket.geometries) source.dispose();
    geometry.computeVertexNormals();
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = `Imported collision / ${bucket.surface} / ${bucket.railId || 'world'}`;
    mesh.userData.surface = bucket.surface;
    mesh.userData.audioSurfaceTag = bucket.audioSurfaceTag;
    mesh.userData.cameraTransparent = bucket.cameraTransparent;
    mesh.userData.transitionSkin = bucket.transitionSkin;
    if (bucket.railId) mesh.userData.railId = bucket.railId;
    collision.add(mesh); triangles += geometry.attributes.position.count / 3;
  }
  collision.updateMatrixWorld(true);
  if (!surfaces.length || !rails.length) throw new Error('Imported warehouse is missing riding surfaces or rails');
  return { collision, rails, triangles, surfaces, repairs };
}

