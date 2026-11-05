import * as THREE from 'three';

// These are Blender's actual authored ground identifiers in Map 4.
// We deliberately do not match "Skateable_Surface", bowls, stair platforms,
// rails, Floor_Markings or generic materials shared with other obstacles.
export function isUrbanRubberFloorName(name = '') {
  return /(?:^|[\s/])(?:Ground_Floor|Premium_White_Marble_Floor)(?=$|[\s/._])/i.test(String(name));
}

function makeRubberMap({ bump = false, size = 256 } = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) throw new Error('Urban rubber floor requires a 2D texture canvas.');
  ctx.fillStyle = bump ? '#808080' : '#353b40';
  ctx.fillRect(0, 0, size, size);

  // Deterministic fine-grained vulcanized rubber speckle. Each 256px tile
  // covers ~1.8 m and repeats seamlessly; no downloaded texture required.
  let seed = bump ? 0x5a82c31 : 0x4367a1d;
  const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
  for (let i = 0; i < 7200; i++) {
    const x = random() * size, y = random() * size;
    const brightness = random();
    const opacity = .035 + random() * .15;
    const radius = .16 + random() * .68;
    ctx.fillStyle = bump
      ? `rgba(${brightness > .5 ? '208,208,208' : '53,53,53'},${opacity})`
      : `rgba(${brightness > .53 ? '177,184,190' : '8,11,16'},${opacity})`;
    ctx.beginPath();
    ctx.ellipse(x, y, radius * 1.5, radius, random() * 6.28, 0, Math.PI * 2);
    ctx.fill();
  }
  // Very faint rubber aggregate grain, kept less pronounced than concrete.
  for (let i = 0; i < 250; i++) {
    ctx.strokeStyle = bump ? 'rgba(175,175,175,.085)' : 'rgba(160,167,173,.045)';
    ctx.lineWidth = .3 + random() * .45;
    const x = random() * size, y = random() * size;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + (random() - .5) * 14, y + (random() - .5) * 9);
    ctx.stroke();
  }
  const texture = new THREE.CanvasTexture(canvas);
  if (!bump) texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 8;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

export function createUrbanRubberFloorMaterial() {
  const map = makeRubberMap();
  const bumpMap = makeRubberMap({ bump: true });
  const material = new THREE.MeshStandardMaterial({
    name: 'Urban Warehouse / premium charcoal vulcanized rubber floor',
    color: '#ffffff',
    map, bumpMap, bumpScale: .010,
    roughness: .94, metalness: .015,
    side: THREE.DoubleSide,
  });
  return material;
}

// Re-project only the floor UVs into world-space metres. Otherwise Blender's
// single 0..1 UV rectangle would stretch a 256px tile over the 150m warehouse.
// Vertex positions, triangles and collision are NOT changed.
export function tileUrbanRubberFloorUVs(geometry, tileMetres = 1.8) {
  const positions = geometry.attributes.position;
  if (!positions) return geometry;
  const uv = new Float32Array(positions.count * 2);
  for (let i = 0; i < positions.count; i++) {
    uv[i * 2] = positions.getX(i) / tileMetres;
    uv[i * 2 + 1] = positions.getZ(i) / tileMetres;
  }
  geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return geometry;
}
