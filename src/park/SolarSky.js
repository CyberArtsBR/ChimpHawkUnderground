import { gameAssetUrl } from '../game/AssetPaths.js';
import * as THREE from 'three';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';


/**
 * Atmospheric sky art is separate from HDRI material lighting.
 * Generated once (not per frame), with deterministic soft cloud clusters.
 * If Canvas 2D is unavailable, the original HDR panorama remains the fallback.
 */
export function createCloudBackdrop(fallback) {
  if (typeof document === 'undefined') return fallback;
  const canvas = document.createElement('canvas');
  canvas.width = 2048;
  canvas.height = 1024;
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) return fallback;

  // Saturated sunset, with its most interesting colors just above the horizon.
  // This is presentation-only: the HDRI still drives reflections and PBR.
  const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
  for (const [stop, color] of [
    [0, '#142e6c'], [.20, '#315e9d'], [.35, '#6775bb'],
    [.45, '#ad7cbd'], [.52, '#dd91b5'], [.60, '#f4ba91'],
    [.70, '#e68d91'], [.85, '#5c668e'], [1, '#233861'],
  ]) gradient.addColorStop(stop, color);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  let seed = 110319;
  const rand = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  // Canvas panorama must tile at longitude seam.
  const lobe = (x, y, rx, ry, color, opacity) => {
    for (const offset of [-canvas.width, 0, canvas.width]) {
      ctx.save();
      ctx.translate(x + offset, y);
      ctx.scale(rx, ry);
      const radial = ctx.createRadialGradient(0, 0, .12, 0, 0, 1);
      radial.addColorStop(0, color.replace('ALPHA', String(opacity)));
      radial.addColorStop(.57, color.replace('ALPHA', String(opacity * .86)));
      radial.addColorStop(1, color.replace('ALPHA', '0'));
      ctx.fillStyle = radial;
      ctx.beginPath(); ctx.arc(0, 0, 1, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
  };

  // Discrete stacked cumulus with shaded undersides and bright warm tops:
  // stronger shape/contrast than the previous almost-invisible fog wisps.
  for (let bank = 0; bank < 74; bank++) {
    const x = rand() * canvas.width;
    const y = 315 + rand() * 260;
    const radius = 25 + rand() * 84;
    const height = 13 + rand() * 24;
    const count = 4 + Math.floor(rand() * 6);
    const blobs = Array.from({length: count}, () => ({
      x: x + (rand() - .5) * radius * 2.3,
      y: y + (rand() - .5) * height * 1.3,
      r: radius * (.35 + rand() * .6),
      h: height * (.55 + rand() * .55),
    }));
    for (const cloud of blobs) {
      lobe(cloud.x, cloud.y + cloud.h * .38, cloud.r * 1.2,
        cloud.h * 1.25, 'rgba(82,74,131,ALPHA)', .48);
    }
    for (const cloud of blobs) {
      lobe(cloud.x, cloud.y - cloud.h * .15, cloud.r,
        cloud.h, 'rgba(255,237,241,ALPHA)', .65);
      lobe(cloud.x - cloud.r * .13, cloud.y - cloud.h * .42,
        cloud.r * .75, cloud.h * .62, 'rgba(255,251,237,ALPHA)', .48);
    }
  }
  // Wispy cirrus at high altitude for depth and visual scale.
  ctx.save();
  ctx.lineCap = 'round';
  for (let i = 0; i < 22; i++) {
    const x = rand() * canvas.width, y = 120 + rand() * 230;
    ctx.strokeStyle = 'rgba(235,234,255,' + (.11 + rand() * .13) + ')';
    ctx.lineWidth = 3 + rand() * 9;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.bezierCurveTo(x + 30, y - 6, x + 95, y + 15, x + 125 + rand() * 140, y - 13);
    ctx.stroke();
  }
  ctx.restore();

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.mapping = THREE.EquirectangularReflectionMapping;
  return texture;
}

// Full-resolution photographic sky; a smaller, one-time convolution supplies
// roughness-aware reflections without a 4K lighting bake on every frame.
export async function loadSolarSky(renderer) {
  const background = await new HDRLoader().loadAsync(gameAssetUrl('/assets/park/hd/solar-dusk-4k.hdr'));
  background.mapping = THREE.EquirectangularReflectionMapping;
  const skyScene = new THREE.Scene();
  skyScene.background = background;
  const generator = new THREE.PMREMGenerator(renderer);
  try {
    const environment = generator.fromScene(skyScene, 0, 0.1, 100, { size: 256 });
    const backdrop = createCloudBackdrop(background);
    if (backdrop !== background) background.dispose();
    return { background: backdrop, environment };
  } catch (error) {
    background.dispose();
    throw error;
  } finally {
    generator.dispose();
  }
}
