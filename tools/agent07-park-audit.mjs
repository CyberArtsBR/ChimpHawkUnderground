import * as THREE from 'three';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { createSolarDockPark } from '../src/park/SolarDockPark.js';
import { surfaceTexturesReady } from '../src/park/SurfaceMaterials.js';

// Headless, deterministic *structural* audit. Does not pretend to measure FPS,
// driver allocations or actual WebGL draw calls (use agent07-browser-audit).
// Mock only image/canvas IO; Three.js constructs real geometry and materials.
export async function auditSolarDock() {
  const previousDocument = globalThis.document;
  const previousLoad = THREE.TextureLoader.prototype.load;
  const canvases = [], textureRequests = [];
  globalThis.document = {
    createElement(tag) {
      if (tag !== 'canvas') throw new Error('Unexpected element: ' + tag);
      const canvas = { width: 0, height: 0 };
      canvas.getContext = () => ({
        createImageData: (width, height) => ({
          width, height, data: new Uint8ClampedArray(width * height * 4),
        }),
        putImageData() {}, fillRect() {}, strokeRect() {}, beginPath() {},
        moveTo() {}, lineTo() {}, stroke() {}, arc() {}, fill() {},
        bezierCurveTo() {},
        createRadialGradient: () => ({ addColorStop() {} }),
      });
      canvases.push(canvas);
      return canvas;
    },
  };
  THREE.TextureLoader.prototype.load = function load(url, onLoad) {
    textureRequests.push(url);
    const map = new THREE.Texture();
    onLoad?.(map);
    return map;
  };
  try {
    const { park, collision, manifest } = createSolarDockPark();
    await surfaceTexturesReady();
    const geometryIds = new Set();
    const materials = new Set(), textures = new Set();
    let visibleMeshes = 0, collisionMeshes = 0, actualTriangles = 0;
    let geometryBytes = 0, sourceVertices = 0, indexedTriangles = 0;
    let opaqueMeshes = 0, transparentMeshes = 0, muralBatches = 0;
    const visualMaterials = new Set(), groupedMuralNames = [];
    park.updateMatrixWorld(true);
    park.traverse(mesh => {
      if (!mesh.isMesh) return;
      visibleMeshes++;
      const geometry = mesh.geometry;
      const tris = (geometry.index?.count || geometry.attributes.position.count) / 3;
      actualTriangles += tris;
      if (geometry.index) indexedTriangles += tris;
      sourceVertices += geometry.attributes.position.count;
      if (!geometryIds.has(geometry.uuid)) {
        geometryIds.add(geometry.uuid);
        for (const name in geometry.attributes) {
          const attr = geometry.attributes[name];
          geometryBytes += attr.array.byteLength;
        }
        if (geometry.index) geometryBytes += geometry.index.array.byteLength;
      }
      for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
        if (!material) continue;
        visualMaterials.add(material);
        materials.add(material);
        if (material.transparent) transparentMeshes++;
        else opaqueMeshes++;
        for (const key of ['map', 'bumpMap', 'roughnessMap', 'normalMap', 'alphaMap', 'envMap']) {
          if (material[key]) textures.add(material[key]);
        }
      }
      if (mesh.name.startsWith('Solar Dock / mural batch /')) {
        muralBatches++; groupedMuralNames.push(mesh.name);
      }
    });
    collision.traverse(mesh => { if (mesh.isMesh) collisionMeshes++; });
    const rideable = collision.children.filter(o => o.userData.surface === 'rideable');
    const namedSolidRails = new Set(collision.children
      .filter(o => o.userData.surface === 'solid' && o.userData.railId)
      .map(o => o.userData.railId));
    const fascia = park.getObjectByName('Rooftop / batched fascia');
    const wood = park.getObjectByName('Solar Dock / wood')?.material;
    const concrete = park.getObjectByName('Solar Dock / concrete')?.material;
    const bowl = park.getObjectByName('Solar Dock / bowl')?.material;
    const surfaceValidation = {
      woodAlbedoColorSpace: wood?.map?.colorSpace,
      concreteAlbedoColorSpace: concrete?.map?.colorSpace,
      woodBumpColorSpace: wood?.bumpMap?.colorSpace,
      woodReliefPixels: [wood?.bumpMap?.image?.width, wood?.bumpMap?.image?.height],
      concreteAndBowlShareColorMap: concrete?.map === bowl?.map,
      woodRoughness: wood?.roughness,
      concreteRoughness: concrete?.roughness,
    };
    const summary = {
      scope: 'static scene construction; WebGL calls and FPS not measured',
      visibleMeshes, collisionMeshes, opaqueMeshes, transparentMeshes,
      materialCount: visualMaterials.size, distinctTextures: textures.size, surfaceValidation,
      uniqueGeometryCount: geometryIds.size,
      geometryAttributeBytes: geometryBytes,
      geometryAttributeMiB: +(geometryBytes / (1024 * 1024)).toFixed(3),
      vertices: sourceVertices, indexedTriangles,
      visualTriangles: actualTriangles,
      manifestVisualTriangles: manifest.visualTriangles,
      muralBatches, groupedMuralNames,
      rooftopMeshCount: fascia?.parent?.children.filter(o => o.isMesh).length ?? 0,
      rideableCollisionBatches: rideable.length,
      namedSolidRailCount: namedSolidRails.size,
      authoredRailCount: manifest.rails.length,
      surfaceCanvasSizes: canvases.map(c => [c.width, c.height]),
      textureRequests,
      surfaceBumpBytesRGBA: canvases.filter(c => c.width === 512)
        .reduce((size,c) => size + c.width*c.height*4, 0),
    };
    // Release temporary CPU/GPU objects when the test exits.
    park.traverse(obj => {
      if (obj.isMesh) obj.geometry.dispose();
    });
    collision.traverse(obj => { if (obj.isMesh) obj.geometry.dispose(); });
    for (const material of materials) material.dispose();
    for (const texture of textures) texture.dispose();
    return summary;
  } finally {
    THREE.TextureLoader.prototype.load = previousLoad;
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const report = await auditSolarDock();
  console.log(JSON.stringify(report, null, 2));
}
