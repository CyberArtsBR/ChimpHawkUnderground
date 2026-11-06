import * as THREE from 'three';
import { gameAssetUrl } from '../game/AssetPaths.js';

/**
 * Board customization (2026-11): wheel colour and a crew character printed on
 * the top of the deck. Defaults keep the original look (stock wheels, no art).
 * Saved per browser.
 */
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
  { id: 'hollow', label: 'HOLLOW', art: '/assets/rider/art/hollow.webp' },
  { id: 'heretic', label: 'HERETIC', art: '/assets/rider/art/heretic.webp' },
  { id: 'adolescent', label: 'ADOLESCENT', art: '/assets/rider/art/adolescent.webp' },
  { id: 'anchor', label: 'ANCHOR', art: '/assets/rider/art/anchor.webp' },
  { id: 'tuxr', label: 'TUXR', art: '/assets/rider/art/tuxr.webp' },
]);
export const BOARD_STYLE_KEY = 'streetskate.boardStyle.v2';
export const DEFAULT_BOARD_STYLE = Object.freeze({ wheels: 0, graphic: 0 });

const index = (value, list) => Number.isInteger(value) && value >= 0 && value < list.length ? value : 0;
export function normalizeBoardStyle(style = {}) {
  return { wheels: index(style.wheels, WHEELS), graphic: index(style.graphic, GRAPHICS) };
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
 * Deck-art texture: canvas X runs along the deck (tail → nose), Y across it.
 * Transparent everywhere except the character, so the deck paint shows around it.
 */
export function graphicTexture(graphicIndex) {
  if (typeof document === 'undefined') return null;
  const graphic = GRAPHICS[index(graphicIndex, GRAPHICS)];
  if (!graphic.art) return null;
  const canvas = document.createElement('canvas'); canvas.width = 1024; canvas.height = 256;
  const ctx = canvas.getContext('2d');
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = 8;
  loadArt(graphic.art).then(image => {
    if (!image) return;
    // The character stands along the deck, head toward the nose, filling the
    // deck's width (canvas height) with a crisp white sticker outline.
    // Trim the art's empty transparent margins so the character itself fills the deck.
    const probe = document.createElement('canvas'); probe.width = image.width; probe.height = image.height;
    const pctx = probe.getContext('2d', { willReadFrequently: true }); pctx.drawImage(image, 0, 0);
    const pixels = pctx.getImageData(0, 0, probe.width, probe.height).data;
    let minX = probe.width, minY = probe.height, maxX = 0, maxY = 0;
    for (let y = 0; y < probe.height; y += 2) for (let x = 0; x < probe.width; x += 2) {
      if (pixels[(y * probe.width + x) * 4 + 3] > 24) { if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; }
    }
    const crop = maxX > minX && maxY > minY ? { x: minX, y: minY, w: maxX - minX + 2, h: maxY - minY + 2 } : { x: 0, y: 0, w: image.width, h: image.height };
    const w = 228, h = Math.min(940, w * crop.h / crop.w), border = 7;
    const sticker = document.createElement('canvas');
    sticker.width = Math.ceil(w + border * 2); sticker.height = Math.ceil(h + border * 2);
    const sctx = sticker.getContext('2d');
    const silhouette = document.createElement('canvas'); silhouette.width = sticker.width; silhouette.height = sticker.height;
    const silctx = silhouette.getContext('2d');
    silctx.drawImage(image, crop.x, crop.y, crop.w, crop.h, border, border, w, h);
    silctx.globalCompositeOperation = 'source-in'; silctx.fillStyle = '#ffffff'; silctx.fillRect(0, 0, silhouette.width, silhouette.height);
    for (let k = 0; k < 16; k++) { const a = k / 16 * Math.PI * 2; sctx.drawImage(silhouette, Math.cos(a) * border, Math.sin(a) * border); }
    sctx.drawImage(image, crop.x, crop.y, crop.w, crop.h, border, border, w, h);
    ctx.save(); ctx.translate(512, 128); ctx.rotate(Math.PI / 2);
    ctx.drawImage(sticker, -sticker.width / 2, -sticker.height / 2);
    ctx.restore();
    texture.needsUpdate = true;
  });
  return texture;
}
