import { gameAssetUrl } from '../game/AssetPaths.js';
import * as THREE from 'three';

// Original industrial detail maps, plus the project's already-vendored photographic
// wood/concrete. All maps are local, shared within one world and created only once.
// 1K relief retains visible tactile detail with 75% less RGBA8 base-level
// memory than the previous pair of 2K procedural relief textures.
export const WAREHOUSE_RELIEF_SIZE = 1024;

export function createWarehouseMaterials({ textures = true } = {}) {
  const pending = [];
  const canvasEnabled = textures && typeof document !== 'undefined';
  const make = (color, roughness = .7, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness, ...extra });
  const materials = {
    wood: make('#e6c28b', .70), woodDark: make('#b18b59', .74),
    edge: make('#a17e50', .77), concrete: make('#c7c6bf', .83),
    brick: make('#74564a', .91), steel: make('#303b40', .45, { metalness: .72 }),
    coping: make('#a8b6bb', .26, { metalness: .86 }),
    rail: make('#252c2e', .33, { metalness: .72 }),
    cladding: make('#879397', .63, { metalness: .27, side: THREE.DoubleSide }),
    cream: make('#e4dfca', .69), yellow: make('#d5a83b', .66),
    oxide: make('#a74730', .8), rubber: make('#1c2223', .92),
    glass: make('#adcad5', .32, { emissive: '#779eae', emissiveIntensity: .28, side: THREE.DoubleSide }),
    lamp: make('#ffdf9d', .4, { emissive: '#ffd994', emissiveIntensity: 2.0 }),
    exit: make('#248568', .56, { emissive: '#258f68', emissiveIntensity: .5 }),
  };
  for (const [name, material] of Object.entries(materials)) material.name = `Foundry / ${name}`;
  if (!canvasEnabled) return { materials, ready: Promise.resolve(), textureSizes: [] };
  const random = (seed => () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; })(81723);
  const canvas = (w, h = w) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
  const map = (c, color = true) => {
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping;
    if (color) t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8; return t;
  };
  const localPhoto = url => {
    let resolve, reject;
    pending.push(new Promise((a, b) => { resolve = a; reject = b; }));
    const t = new THREE.TextureLoader().load(url, resolve, undefined, reject);
    t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8;
    return t;
  };
  const photo = name => localPhoto(gameAssetUrl(`/assets/park/hd/${name}.webp`));
  materials.wood.map = photo('plywood'); materials.woodDark.map = materials.wood.map;
  materials.wood.color.set('#fff0cb'); materials.woodDark.color.set('#c2a479');
  materials.concrete.map = photo('concrete'); materials.concrete.color.set('#dad9cf');

  const wood = canvas(WAREHOUSE_RELIEF_SIZE), w = wood.getContext('2d');
  w.fillStyle = '#bababa'; w.fillRect(0, 0, WAREHOUSE_RELIEF_SIZE, WAREHOUSE_RELIEF_SIZE);
  for (let i = 0; i < 800; i++) {
    const x = random() * WAREHOUSE_RELIEF_SIZE, y = random() * WAREHOUSE_RELIEF_SIZE;
    w.strokeStyle = `rgba(30,30,30,${.015 + random() * .075})`; w.lineWidth = .6 + random();
    w.beginPath(); w.moveTo(x, y); w.bezierCurveTo(x + 4, y + 80, x - 3, y + 160, x + 1, y + 240); w.stroke();
  }
  for (const x of [0, 512, 1022]) { w.fillStyle = '#4c4c4c'; w.fillRect(x, 0, 2, WAREHOUSE_RELIEF_SIZE); }
  for (const y of [0, 1022]) { w.fillStyle = '#555'; w.fillRect(0, y, WAREHOUSE_RELIEF_SIZE, 2); }
  for (const x of [9, 502, 521, 1014]) for (let y = 22; y < WAREHOUSE_RELIEF_SIZE; y += 128) {
    w.fillStyle = '#5c5c5c'; w.beginPath(); w.arc(x, y, 2.8, 0, Math.PI * 2); w.fill();
  }
  materials.wood.bumpMap = map(wood, false); materials.wood.bumpScale = .009;
  // The relief is a height signal, not a physically valid roughness map.
  // Reusing it as roughness artificially polished plywood by multiplication.
  materials.woodDark.bumpMap = materials.wood.bumpMap; materials.woodDark.bumpScale = .009;
  const layers = canvas(1024, 256), e = layers.getContext('2d');
  e.fillStyle = '#bc9862'; e.fillRect(0, 0, 1024, 256);
  for (let y = 0; y < 256; y += 12) {
    e.fillStyle = (y / 12) % 2 ? '#9c794a' : '#ceb183'; e.fillRect(0, y, 1024, 7);
    e.fillStyle = '#705b3e'; e.fillRect(0, y, 1024, 1);
  }
  materials.edge.map = map(layers);

  // Original photographic brick atlas has its own mortar courses. Do not overlay
  // the former 32-course procedural bump pattern onto the photographed joints.
  materials.brick.map = localPhoto(gameAssetUrl('/assets/warehouse/foundry-brick-albedo.webp'));
  materials.brick.color.set('#fff');

  const floor = canvas(WAREHOUSE_RELIEF_SIZE), f = floor.getContext('2d');
  f.fillStyle = '#cbcbcb'; f.fillRect(0, 0, WAREHOUSE_RELIEF_SIZE, WAREHOUSE_RELIEF_SIZE);
  for (let i = 0; i < 4500; i++) {
    f.fillStyle = `rgba(72,72,72,${random() * .09})`;
    f.fillRect(random() * WAREHOUSE_RELIEF_SIZE, random() * WAREHOUSE_RELIEF_SIZE, 1 + random() * 3, 1 + random() * 3);
  }
  f.strokeStyle = '#777'; f.lineWidth = 2; f.strokeRect(1, 1, WAREHOUSE_RELIEF_SIZE - 2, WAREHOUSE_RELIEF_SIZE - 2);
  for (let i = 0; i < 24; i++) {
    const x = random() * WAREHOUSE_RELIEF_SIZE, y = random() * WAREHOUSE_RELIEF_SIZE;
    f.strokeStyle = `rgba(50,50,50,${.02 + random() * .045})`; f.lineWidth = 2 + random() * 3;
    f.beginPath(); f.moveTo(x, y); f.bezierCurveTo(x + 35, y + 24, x + 57, y + 59, x + 94, y + 93); f.stroke();
  }
  materials.concrete.roughness = .78;
  materials.concrete.bumpMap = map(floor, false); materials.concrete.bumpScale = .004;
  // Keep concrete naturally matte; use the height texture only for bump.

  const metal = canvas(512), m = metal.getContext('2d');
  m.fillStyle = '#959d9d'; m.fillRect(0, 0, 512, 512);
  for (let x = 0; x < 512; x += 32) { m.fillStyle = '#697a7d'; m.fillRect(x, 0, 2, 512); m.fillStyle = '#bdc4c1'; m.fillRect(x + 3, 0, 3, 512); }
  materials.cladding.map = map(metal);
  return { materials, ready: Promise.all(pending), textureSizes: ['photographic plywood/concrete: existing 2K', 'wood relief: 1024² shared', 'original generated photographic brick albedo', 'concrete relief: 1024² shared', 'plywood edge: 1024×256', 'cladding: 512²'] };
}

export function createWarehouseSign(title, subtitle = '', { dark = true } = {}) {
  if (typeof document === 'undefined') return new THREE.MeshBasicMaterial({ color: dark ? '#273339' : '#ddcfac' });
  const c = document.createElement('canvas'); c.width = 2048; c.height = 512;
  const x = c.getContext('2d'); x.fillStyle = dark ? '#253337' : '#dfd2ad'; x.fillRect(0, 0, c.width, c.height);
  x.fillStyle = '#d9a640'; x.fillRect(0, 0, 26, 512); x.fillRect(2022, 0, 26, 512);
  x.strokeStyle = dark ? '#697577' : '#a28b61'; x.lineWidth = 3; x.strokeRect(43, 36, 1962, 440);
  x.textAlign = 'center'; x.fillStyle = dark ? '#f1e8cf' : '#28393d';
  x.font = '900 180px Impact, sans-serif'; x.fillText(title, 1024, 265, 1880);
  x.fillStyle = dark ? '#c7b996' : '#5f675d'; x.font = '500 48px sans-serif'; x.fillText(subtitle, 1024, 381, 1810);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  const mat = new THREE.MeshStandardMaterial({ map: t, roughness: .8, side: THREE.DoubleSide }); mat.name = `Foundry / sign / ${title}`;
  return mat;
}
