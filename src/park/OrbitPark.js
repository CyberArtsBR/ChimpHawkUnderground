import { gameAssetUrl } from '../game/AssetPaths.js';
import * as THREE from 'three';
import { fetchCompressedGlb } from '../game/CompressedAsset.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { batchWarehouseVisuals } from './WarehouseVariants.js';
import { warehouseObjectName } from './ImportedWarehouseCollision.js';
import { buildParkRouteMetadata } from './ParkRegistry.js';
import { createOrbitVisualPass } from '../graphics/OrbitVisualPass.js';
import { applyOrbitFloorFinish } from '../graphics/OrbitSurfaceMaterials.js';
import { shippingSurfaceTag } from '../game/SurfaceAudio.js';

const authoredName = warehouseObjectName;

// GLB extras metadata overrides name-based classification without moving geometry.
// Existing ORBIT meshes retain their legacy aliases as a compatibility fallback.
function orbitSurfaceHint(object, legacySurface) {
  const explicit = object.userData?.skateCollisionSurface || object.userData?.skate?.collisionSurface;
  return ['rideable', 'solid', 'decorative'].includes(explicit) ? explicit : legacySurface;
}
function orbitFeatureId(object, fallbackName) {
  const explicit = object.userData?.skateFeatureId || object.userData?.skate?.featureId;
  if (typeof explicit === 'string' && /^[a-z0-9][a-z0-9._/-]*$/i.test(explicit))
    return explicit;
  const slug = String(fallbackName).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `orbit/legacy/${slug || 'feature'}`;
}


function prepareOrbitMaterials(object) {
  for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
    if (!material) continue;
    if (/Paint \/ crew graffiti/.test(material.name)) {
      // The imported BLEND graffiti overlay rendered partially transparent
      // over structural ramp panels. Cut out genuinely clear texels instead:
      // opaque colored paint now depth-writes without turning ramp structures
      // or their backs into ghost surfaces.
      material.transparent = false;
      material.opacity = 1;
      material.alphaTest = 0.42;
      material.depthWrite = true;
      material.depthTest = true;
      material.side = THREE.DoubleSide;
      if ('transmission' in material) material.transmission = 0;
      material.polygonOffset = true;
      material.polygonOffsetFactor = -1;
      material.polygonOffsetUnits = -1;
    } else {
      material.transparent = false;
      material.opacity = 1;
      material.alphaTest = 0;
      material.depthWrite = true;
      material.side = THREE.DoubleSide;
      if ('transmission' in material) material.transmission = 0;
    }
    if (/Ceramic \/ silver riding concrete/.test(material.name)) {
      material.map = null;
      material.normalMap = null;
      material.roughnessMap = null;
      material.metalnessMap = null;
      material.color.set('#52677b');
      applyOrbitFloorFinish(material);
    }
    // Preserve neon color and shape without saturating the ramps around it.
    if (/^(LED|Grind) \/ /.test(material.name)) {
      material.emissiveIntensity = Math.min(material.emissiveIntensity, 2.2);
    }
    material.needsUpdate = true;
  }
}

// Blender's curve export stores nine vertices per bevel ring. Average each
// ring in world space so grind paths follow edited positions and transforms.
function curvePoints(object) {
  const position = object.geometry.attributes.position;
  if (position.count < 18 || position.count % 9 !== 0) return null;
  const points = [];
  for (let start = 0; start < position.count; start += 9) {
    const center = new THREE.Vector3();
    // The first vertex duplicates the seam vertex; use the eight unique sides.
    for (let i = start + 1; i < start + 9; i++) center.add(new THREE.Vector3().fromBufferAttribute(position, i));
    points.push(center.multiplyScalar(1 / 8).applyMatrix4(object.matrixWorld).toArray());
  }
  return points;
}

// COL_ copies are semantic hints only: they can outlive deleted visual objects.
// All contact geometry and transforms come from the visible edited mesh.
export function splitOrbitScene(scene, sourceRails = []) {
  scene.updateMatrixWorld(true);
  const collision = new THREE.Group();
  collision.name = 'ORBIT / authored collision';
  const proxies = [], visuals = [], helpers = [];
  let brandingBounds = null;
  scene.traverse(object => {
    if (!object.isMesh) return;
    const name = authoredName(object);
    const explicit = object.userData?.skateCollisionSurface || object.userData?.skate?.collisionSurface;
    // The exact authored front-facing letter mesh must be omitted before
    // visual batching (batching intentionally ignores Object3D.visible).
    // The black arch/banner, cyan halo and subtitle stay intact.
    if (name === 'Halo / ORBIT logotype') {
      brandingBounds = new THREE.Box3().setFromObject(object);
      helpers.push(object);
    } else if (explicit === 'decorative') helpers.push(object);
    else if (object.visible && ['rideable', 'solid'].includes(explicit)) {
      prepareOrbitMaterials(object);
      visuals.push(object);
    } else if (/^COL_/.test(name)) proxies.push(object);
    // The deck's two decorative seam directions form one grid. Keeping only
    // its short counterparts left hundreds of disconnected black bars above
    // the polished floor. Ramp panel joins and utility grilles stay visible.
    else if (/collision.bar|^07 \/ reused \/.*Street double-bank funbox|^Deck \/ (?:expansion|short) joint/.test(name)) helpers.push(object);
    else if (object.visible) {
      prepareOrbitMaterials(object);
      visuals.push(object);
    }
  });
  const hints = new Set(proxies.map(object => authoredName(object).slice(4)));
  const rails = [];
  const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
  for (const object of visuals) {
    const name = authoredName(object);
    const luminousRail = name.includes(' / luminous grind bar');
    const railName = name.split(' / luminous grind bar')[0];
    if (luminousRail) {
      const points = curvePoints(object);
      if (points) {
        const template = sourceRails.find(rail => rail.name === railName);
        rails.push({ ...template, name: railName, points, radius: template?.radius || .075,
          audioSurfaceTag:shippingSurfaceTag(object) });
      }
    }
    const purpleRamp = /^04_FLOW_LAB \/ Flow launch ramp/.test(name);
    const purpleRide = purpleRamp && /^Foundry_Plywood/.test(object.material?.name || '');
    const purpleCore = purpleRamp && /^Foundry_Dark_Timber/.test(object.material?.name || '');
    const legacyRideable = purpleRide || /orbital.bowl.(flat|transition)|continuous.ride|broad.bank.circuit.ride|^Deck \/ (bowl apron|east|north|south|west)$|Skateable_Surface|manual.pad|^06 \/ ledge/i.test(name);
    const legacySolid = purpleCore || hints.has(name) || /Side_Wood_Core|accessible.side.panel|\/ back$|structural.cheek|collision.bar|\/ pedestal|knee.wall|equipment.cabinet/i.test(name);
    const semantic = orbitSurfaceHint(object, legacyRideable ? 'rideable' : legacySolid ? 'solid' : 'decorative');
    const rideable = semantic === 'rideable';
    const solid = semantic === 'solid';
    if (!rideable && !solid && !luminousRail) continue;
    // The pink bowl rim remains VISIBLE and GRINDABLE, but its narrow coping
    // tube cannot also be a rigid obstruction across the only roll-in. Let
    // four wheels transition on the actual curved bowl skin. All other bars
    // retain their existing solid collision; no invisible floor or bowl cap.
    if (luminousRail && railName === 'Orbit bowl coping'
        && !['rideable','solid'].includes(object.userData?.skateCollisionSurface)) continue;
    const mesh = new THREE.Mesh(object.geometry.clone().applyMatrix4(object.matrixWorld), material);
    mesh.name = name;
    mesh.userData.surface = rideable ? 'rideable' : 'solid';
    mesh.userData.audioSurfaceTag = shippingSurfaceTag(object);
    mesh.userData.skateFeatureId = orbitFeatureId(object, name);
    mesh.userData.skateClassification = object.userData?.skateCollisionSurface || object.userData?.skate?.collisionSurface ? 'glb-metadata' : 'legacy-alias';
    if (luminousRail) mesh.userData.railId = railName;
    else if (/collision.bar|\/ pedestal/.test(name)) mesh.userData.railId = name.split(' / ')[0];
    collision.add(mesh);
  }
  const discardedGeometry = new Set();
  for (const object of [...proxies, ...helpers]) {
    object.removeFromParent();
    discardedGeometry.add(object.geometry);
  }
  const retainedGeometry = new Set(visuals.map(object => object.geometry));
  for (const geometry of discardedGeometry) if (!retainedGeometry.has(geometry)) geometry.dispose();
  if (!collision.children.length) throw new Error('ORBIT has no visible collision surfaces.');
  const { park, visualTriangles } = batchWarehouseVisuals(scene, 'ORBIT');
  park.userData.environmentBloom = true;
  return { park, collision, visualTriangles, rails,
    brandingAnchor: brandingBounds?.isEmpty() ? null : brandingBounds ? {
      x: brandingBounds.getCenter(new THREE.Vector3()).x,
      y: brandingBounds.getCenter(new THREE.Vector3()).y,
      z: brandingBounds.max.z,
      width: brandingBounds.max.x - brandingBounds.min.x,
      height: brandingBounds.max.y - brandingBounds.min.y,
    } : null };
}

/**
 * Replace only the original ORBIT lettering on the imported halo sign with
 * CHIMPIONS. Keep the artist's sign board and arch exactly where they are.
 * CanvasTexture is created only in the live browser, never by Node collision
 * tests. Everything added is owned by the world and gets disposed on unload.
 */
export function addChimpionsOrbitSign(park, anchor, canvasFactory = () => document.createElement('canvas')) {
  if (!park?.isObject3D || !anchor) return null;
  const canvas = canvasFactory();
  canvas.width = 2048;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '900 230px Arial Black, Impact, sans-serif';
  ctx.lineJoin = 'round';
  ctx.shadowColor = '#04bfff';
  ctx.shadowBlur = 34;
  ctx.lineWidth = 19;
  ctx.strokeStyle = '#075070';
  ctx.strokeText('CHIMPIONS', 1024, 260, 1860);
  ctx.shadowBlur = 12;
  ctx.fillStyle = '#e8ffff';
  ctx.fillText('CHIMPIONS', 1024, 260, 1860);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const width = Math.max(11.0, anchor.width * 1.38);
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(width, Math.max(1.65, anchor.height * 1.08)),
    new THREE.MeshBasicMaterial({
      name: 'Chimpions / halo front logo', map: texture,
      transparent: true, opacity: 1, depthWrite: false, depthTest: true,
      side: THREE.DoubleSide, toneMapped: false,
    }),
  );
  mesh.name = 'Halo / CHIMPIONS logotype';
  mesh.position.set(anchor.x, anchor.y, anchor.z + 0.05);
  mesh.renderOrder = 5;
  mesh.userData.castShadow = false;
  mesh.userData.skateCollisionSurface = 'decorative';
  park.add(mesh);
  return mesh;
}

export async function createOrbitPark() {
  const [gltf, manifest, sky] = await Promise.all([
    fetchCompressedGlb(gameAssetUrl('/assets/spacepark/orbit.glb.gz'), gameAssetUrl('/assets/spacepark/orbit.glb'))
      .then(buffer => new GLTFLoader().parseAsync(buffer, '')),
    fetch(gameAssetUrl('/assets/spacepark/orbit-manifest.json')).then(response => {
      if (!response.ok) throw new Error('ORBIT manifest unavailable.');
      return response.json();
    }),
    new THREE.TextureLoader().loadAsync(gameAssetUrl('/assets/spacepark/textures/galaxy-4k.webp')),
  ]);
  const world = splitOrbitScene(gltf.scene, manifest.rails);
  addChimpionsOrbitSign(world.park, world.brandingAnchor);
  sky.colorSpace = THREE.SRGBColorSpace;
  sky.mapping = THREE.EquirectangularReflectionMapping;
  const backdrop = new THREE.Mesh(new THREE.SphereGeometry(900, 48, 24),
    // Dim the decorative galaxy separately from its environment reflections.
    new THREE.MeshBasicMaterial({ map: sky, color: '#a6b2c5', side: THREE.BackSide, depthWrite: false, fog: false }));
  backdrop.userData.castShadow = false;
  world.park.add(backdrop);
  manifest.visualTriangles = world.visualTriangles;
  manifest.rails = world.rails;
  manifest.routes = buildParkRouteMetadata(manifest, 'orbit');
  manifest.statistics = { ...manifest.statistics, visualTriangles: world.visualTriangles,
    collisionMeshes: world.collision.children.length, rails: world.rails.length,
    authoredRouteCount: manifest.routes.length };
  const result={ ...world, manifest, environment: sky };
  result.surfaceDetail=createOrbitVisualPass(result);
  return result;
}
