import { gameAssetUrl } from '../game/AssetPaths.js';
import * as THREE from 'three';

// Original, deterministic material artwork. Generated once at park load; no
// per-frame canvas work, asset downloads or texture changes to collision.
function random(seed) {
  return () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
}

function canvas(size = 1024, height = size) {
  const value = document.createElement('canvas'); value.width = size; value.height = height;
  return value;
}

function texture(source, color = true, repeat = true) {
  const map = new THREE.CanvasTexture(source);
  if (color) map.colorSpace = THREE.SRGBColorSpace;
  if (repeat) map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.anisotropy = 4;
  return map;
}

// Photo albedo is already provided by pinned, shared WebP artwork.
// Generate only the small, tileable bump signal that the photographs lack.
// No unused 1024px color canvases or million-pixel RGB loops at startup.
const RELIEF_SIZE = 512;
function surface(kind) {
  const wood = kind === 'wood';
  const relief = canvas(RELIEF_SIZE);
  const ctx = relief.getContext('2d');
  const height = ctx.createImageData(RELIEF_SIZE, RELIEF_SIZE);
  const rng = random(wood ? 518 : kind === 'bowl' ? 733 : 903);
  for (let y = 0; y < RELIEF_SIZE; y++) {
    const warp = Math.sin(y * Math.PI / 256) * 4 + Math.sin(y * Math.PI / 64);
    for (let x = 0; x < RELIEF_SIZE; x++) {
      const i = (y * RELIEF_SIZE + x) * 4;
      const noise = rng() - 0.5;
      const grain = Math.sin((x + warp) * 0.58) * 3 + Math.sin((x + warp) * 0.12) * 6;
      const mottling = Math.sin(x * Math.PI / 64) * Math.sin(y * Math.PI / 128) * 3;
      const h = 128 + (wood ? grain + noise * 6 : noise * (kind === 'bowl' ? 14 : 20) + mottling);
      height.data[i] = height.data[i + 1] = height.data[i + 2] = h;
      height.data[i + 3] = 255;
    }
  }
  ctx.putImageData(height, 0, 0);
  if (wood) {
    // Fine tactile fibres, plywood sheet joins and countersunk screw heads.
    for (let i = 0; i < 85; i++) {
      const x = rng() * RELIEF_SIZE, y = rng() * RELIEF_SIZE;
      ctx.strokeStyle = 'rgba(65,65,65,' + (0.07 + rng() * 0.11) + ')';
      ctx.lineWidth = 0.6;
      ctx.beginPath(); ctx.moveTo(x, y);
      ctx.bezierCurveTo(x + 2, y + 20, x - 2, y + 50, x + rng() * 2, y + 110);
      ctx.stroke();
    }
    ctx.fillStyle = '#747474';
    for (const x of [0, 256, 511]) ctx.fillRect(x, 0, 1, RELIEF_SIZE);
    for (const y of [0, 511]) ctx.fillRect(0, y, RELIEF_SIZE, 1);
    for (const x of [7, 249, 263, 505]) for (let y = 9; y < RELIEF_SIZE; y += 82) {
      ctx.fillStyle = '#666'; ctx.beginPath(); ctx.arc(x, y, 1.3, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#b0b0b0'; ctx.lineWidth = 0.6;
      ctx.beginPath(); ctx.moveTo(x - 1, y); ctx.lineTo(x + 1, y); ctx.stroke();
    }
  } else if (kind !== 'bowl') {
    // Avoid a seam through the bowl while retaining the plaza's slab joins.
    ctx.strokeStyle = '#777'; ctx.lineWidth = 1;
    ctx.strokeRect(0.5, 0.5, RELIEF_SIZE - 1, RELIEF_SIZE - 1);
  }
  const map = photo(wood ? 'plywood' : 'concrete');
  return new THREE.MeshStandardMaterial({
    color: kind === 'bowl' ? '#dfebe7' : '#ffffff',
    map,
    bumpMap: texture(relief, false),
    bumpScale: wood ? 0.009 : kind === 'bowl' ? 0.009 : 0.013,
    roughness: wood ? 0.71 : kind === 'bowl' ? 0.84 : 0.88,
    metalness: 0,
  });
}

const loader = new THREE.TextureLoader();
let muralMap;
const photos = new Map();
const pending = [];
function photo(name) {
  if (photos.has(name)) return photos.get(name);
  let ready, failed;
  pending.push(new Promise((resolve, reject) => { ready = resolve; failed = reject; }));
  const map = loader.load(gameAssetUrl('/assets/park/hd/' + name + '.webp'), ready, undefined, failed);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.anisotropy = 8;
  photos.set(name, map);
  return map;
}
export const surfaceTexturesReady = () => Promise.all(pending);
export function createSurfaceMaterials() {
  return { wood: surface('wood'), concrete: surface('concrete'), bowl: surface('bowl') };
}
let sharedGraffitiMaterial;
export function createGraffitiMaterial() {
  // All murals use the exact same texture/alpha/BRDF. A shared material also
  // allows spatially adjacent decal geometry to be rendered in one draw call.
  if (sharedGraffitiMaterial) return sharedGraffitiMaterial;
  muralMap ||= photo('graffiti');
  const edge = canvas(128), ctx = edge.getContext('2d');
  const gradient = ctx.createRadialGradient(64, 64, 42, 64, 64, 82);
  gradient.addColorStop(0, 'white'); gradient.addColorStop(1, 'black');
  ctx.fillStyle = gradient; ctx.fillRect(0, 0, 128, 128);
  sharedGraffitiMaterial = new THREE.MeshStandardMaterial({
    map: muralMap, alphaMap: texture(edge, false, true),
    transparent: true, depthWrite: false, roughness: 0.88,
    metalness: 0, polygonOffset: true, polygonOffsetFactor: -2,
  });
  sharedGraffitiMaterial.name = 'Solar Dock / shared murals';
  return sharedGraffitiMaterial;
}

export const sharedSurfaceTextures = () => new Set(photos.values());
