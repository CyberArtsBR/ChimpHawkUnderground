import * as THREE from 'three';
import { gameAssetUrl } from '../game/AssetPaths.js';

/**
 * Board customization (2026-11): grip tape, wheel colour and the deck's
 * bottom graphic. Defaults keep the original look (deck paint on top, stock
 * wheels, no graphic). Saved per browser.
 */
export const GRIPS = Object.freeze([
  { id: 'deck', label: 'DECK PAINT', color: null },
  { id: 'black', label: 'BLACK', color: '#1c1c21' },
  { id: 'pink', label: 'PINK', color: '#ff3d8b' },
  { id: 'cyan', label: 'CYAN', color: '#2fc8ff' },
  { id: 'banana', label: 'BANANA', color: '#ffd23f' },
  { id: 'camo', label: 'CAMO', color: '#4d6b3a', camo: true },
]);
export const WHEELS = Object.freeze([
  { id: 'stock', label: 'STOCK', color: null },
  { id: 'white', label: 'WHITE', color: '#f2efe6' },
  { id: 'black', label: 'BLACK', color: '#25252b' },
  { id: 'pink', label: 'PINK', color: '#ff4f9a' },
  { id: 'cyan', label: 'CYAN', color: '#3fd2ff' },
  { id: 'lime', label: 'LIME', color: '#8dff4f' },
  { id: 'gold', label: 'GOLD', color: '#ffcf3a' },
]);
export const GRAPHICS = Object.freeze([
  { id: 'none', label: 'NONE' },
  { id: 'crown', label: 'CROWN' },
  { id: 'hollow', label: 'HOLLOW', art: '/assets/rider/art/hollow.webp' },
  { id: 'heretic', label: 'HERETIC', art: '/assets/rider/art/heretic.webp' },
  { id: 'adolescent', label: 'ADOLESCENT', art: '/assets/rider/art/adolescent.webp' },
  { id: 'anchor', label: 'ANCHOR', art: '/assets/rider/art/anchor.webp' },
  { id: 'tuxr', label: 'TUXR', art: '/assets/rider/art/tuxr.webp' },
]);
export const BOARD_STYLE_KEY = 'streetskate.boardStyle';
export const DEFAULT_BOARD_STYLE = Object.freeze({ grip: 0, wheels: 0, graphic: 0 });

const index = (value, list) => Number.isInteger(value) && value >= 0 && value < list.length ? value : 0;
export function normalizeBoardStyle(style = {}) {
  return { grip: index(style.grip, GRIPS), wheels: index(style.wheels, WHEELS), graphic: index(style.graphic, GRAPHICS) };
}
export function readBoardStyle(storage = globalThis.localStorage) {
  try { return normalizeBoardStyle(JSON.parse(storage?.getItem(BOARD_STYLE_KEY) || '{}')); } catch { return { ...DEFAULT_BOARD_STYLE }; }
}
export function saveBoardStyle(style, storage = globalThis.localStorage) {
  try { storage?.setItem(BOARD_STYLE_KEY, JSON.stringify(normalizeBoardStyle(style))); } catch { /* session only */ }
}

const artCache = new Map();
function loadArt(path) {
  if (!artCache.has(path)) artCache.set(path, new Promise(resolve => {
    const image = new Image(); image.decoding = 'async';
    image.onload = () => resolve(image); image.onerror = () => resolve(null);
    image.src = gameAssetUrl(path);
  }));
  return artCache.get(path);
}

/**
 * Bottom-graphic texture: canvas X runs along the deck (tail → nose), Y across
 * it. Transparent where the deck paint should show through.
 */
export function graphicTexture(graphicIndex) {
  if (typeof document === 'undefined') return null;
  const graphic = GRAPHICS[index(graphicIndex, GRAPHICS)];
  if (graphic.id === 'none') return null;
  const canvas = document.createElement('canvas'); canvas.width = 1024; canvas.height = 256;
  const ctx = canvas.getContext('2d');
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = 8;
  const banner = () => {
    ctx.save(); ctx.translate(512, 128);
    ctx.font = '400 54px Bangers, Impact, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineWidth = 8; ctx.strokeStyle = 'rgba(16,10,24,.85)';
    for (const [x, text] of [[-330, 'CHIMP'], [330, 'HAWK']]) { ctx.strokeText(text, x, 0); ctx.fillStyle = '#fffaf0'; ctx.fillText(text, x, 0); }
    ctx.restore();
  };
  if (graphic.id === 'crown') {
    ctx.save(); ctx.translate(512, 128); ctx.rotate(-Math.PI / 2);
    ctx.fillStyle = '#141020'; ctx.strokeStyle = '#fffaf0'; ctx.lineWidth = 10; ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(-90, 70); ctx.lineTo(-105, -55); ctx.lineTo(-45, 0); ctx.lineTo(0, -85); ctx.lineTo(45, 0); ctx.lineTo(105, -55); ctx.lineTo(90, 70); ctx.closePath();
    ctx.fill(); ctx.stroke(); ctx.restore();
    banner();
    texture.needsUpdate = true;
  } else {
    banner();
    texture.needsUpdate = true;
    loadArt(graphic.art).then(image => {
      if (!image) return;
      // Character stands along the deck (head toward the nose).
      ctx.save(); ctx.translate(512, 128); ctx.rotate(-Math.PI / 2);
      const h = 360, w = h * image.width / image.height;
      ctx.shadowColor = 'rgba(0,0,0,.45)'; ctx.shadowBlur = 12;
      ctx.drawImage(image, -w / 2, -h / 2, w, h);
      ctx.restore();
      texture.needsUpdate = true;
    });
  }
  return texture;
}
