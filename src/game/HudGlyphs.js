import { gameAssetUrl } from './AssetPaths.js';
/** Numeric HUD artwork keeps real text in the DOM and writes only on change. */
export const HUD_GLYPH_URLS = Object.freeze(Object.fromEntries([
  ...Array.from({ length: 10 }, (_, digit) => [String(digit), gameAssetUrl(`/assets/hud/glyphs/${digit}.webp`)]),
  [':', gameAssetUrl('/assets/hud/glyphs/colon.webp')], ['∞', gameAssetUrl('/assets/hud/glyphs/infinity.webp')],
]));

const glyphs = new Map();
const readings = new WeakMap();
let preloaded = false;

function paintCell(cell, glyph) {
  // An unavailable bitmap leaves the literal digit visible with normal type.
  cell.dataset.glyphReady = String(glyph?.ready === true);
}

export function preloadHudGlyphs() {
  if (preloaded || typeof Image === 'undefined') return;
  preloaded = true;
  for (const [character, url] of Object.entries(HUD_GLYPH_URLS)) {
    const glyph = { ready: false, cells: new Set() };
    glyphs.set(character, glyph);
    const image = new Image();
    image.decoding = 'async';
    image.onload = () => {
      glyph.ready = image.naturalWidth > 0;
      for (const cell of glyph.cells) paintCell(cell, glyph);
    };
    image.onerror = () => {
      glyph.ready = false;
      for (const cell of glyph.cells) paintCell(cell, glyph);
    };
    image.src = url;
  }
}

/** Returns false for unchanged values, including all animation-loop calls. */
export function setHudGlyphValue(node, value) {
  if (!node) return false;
  const text = String(value);
  let reading = readings.get(node);
  if (reading?.text === text) return false;
  preloadHudGlyphs();
  if (!reading) {
    reading = { text: null, cells: [] };
    readings.set(node, reading);
    node.classList.add('hud-glyph-value');
  }
  for (const cell of reading.cells) glyphs.get(cell.dataset.character)?.cells.delete(cell);
  if (reading.cells.length !== text.length) {
    const fragment = document.createDocumentFragment();
    reading.cells = [...text].map(() => {
      const cell = document.createElement('span');
      fragment.append(cell);
      return cell;
    });
    node.replaceChildren(fragment);
  }
  for (const [index, character] of [...text].entries()) {
    const cell = reading.cells[index];
    const glyph = glyphs.get(character);
    cell.textContent = character;
    cell.dataset.character = character;
    cell.className = 'hud-glyph' + (character === ':' ? ' hud-glyph-colon' : character === '∞' ? ' hud-glyph-infinity' : /[, .]/.test(character) ? ' hud-glyph-separator' : '');
    cell.style.backgroundImage = glyph ? `url("${HUD_GLYPH_URLS[character]}")` : '';
    glyph?.cells.add(cell);
    paintCell(cell, glyph);
  }
  node.dataset.digitCount = String(text.replace(/\D/g, '').length);
  const units = [...text].reduce((width, character) => width + (character === ':' ? .38194 : character === '∞' ? 1.18056 : /[, .]/.test(character) ? .19 : .83333), 0);
  node.style.setProperty('--hud-glyph-units', String(Math.max(units, .83333)));
  reading.text = text;
  return true;
}
