// Greybox materials for the test park. Pieces are merged per material so the
// whole park costs a handful of draw calls. Grid lines (1 m / 5 m) make speed
// and height easy to read while tuning.
import * as THREE from 'three';
import type { ParkDefinition, PieceKind } from '../park/TestPark';
import { mergeGeometries, railMesh } from '../park/shapes';
import { graffitiTexture } from './Environment';

function gridTexture(base: string, line: string, major: string, anisotropy: number, minor = true): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const g = canvas.getContext('2d')!;
  g.fillStyle = base;
  g.fillRect(0, 0, size, size);
  // Subtle concrete speckle.
  for (let i = 0; i < 1800; i++) {
    g.fillStyle = `rgba(0,0,0,${Math.random() * 0.06})`;
    g.fillRect(Math.random() * size, Math.random() * size, 2, 2);
  }
  g.strokeStyle = line; g.lineWidth = 2;
  for (let i = 0; i <= 5 && minor; i++) {
    const p = (i / 5) * size;
    g.beginPath(); g.moveTo(p, 0); g.lineTo(p, size); g.stroke();
    g.beginPath(); g.moveTo(0, p); g.lineTo(size, p); g.stroke();
  }
  g.strokeStyle = major; g.lineWidth = 5;
  g.strokeRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = anisotropy;
  // One texture tile = 5 m.
  texture.repeat.set(0.2, 0.2);
  return texture;
}

/** World-space UVs (box projection) so the grid stays 1 m regardless of piece size. */
function worldUVs(geometry: THREE.BufferGeometry): void {
  const pos = geometry.getAttribute('position');
  const nor = geometry.getAttribute('normal');
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    const nx = Math.abs(nor.getX(i)), ny = Math.abs(nor.getY(i)), nz = Math.abs(nor.getZ(i));
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    if (ny >= nx && ny >= nz) { uv[i * 2] = x; uv[i * 2 + 1] = z; }
    else if (nx >= nz) { uv[i * 2] = z; uv[i * 2 + 1] = y; }
    else { uv[i * 2] = x; uv[i * 2 + 1] = y; }
  }
  geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
}

export function buildParkView(park: ParkDefinition, renderer: THREE.WebGLRenderer): THREE.Group {
  const group = new THREE.Group();
  group.name = park.name;
  const aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const materials: Record<PieceKind, THREE.Material> = {
    floor: new THREE.MeshStandardMaterial({ map: gridTexture('#857f86', 'rgba(40,30,48,0.18)', 'rgba(30,20,36,0.55)', aniso, false), roughness: 0.88 }),
    ramp: new THREE.MeshStandardMaterial({ map: gridTexture('#d8cfc8', 'rgba(60,40,60,0.10)', 'rgba(60,40,60,0.35)', aniso, false), roughness: 0.62 }),
    ledge: new THREE.MeshStandardMaterial({ map: gridTexture('#6d717a', 'rgba(20,20,24,0.4)', 'rgba(20,20,24,0.6)', aniso), roughness: 0.85 }),
    stairs: new THREE.MeshStandardMaterial({ map: gridTexture('#7c7f86', 'rgba(20,20,24,0.4)', 'rgba(20,20,24,0.6)', aniso), roughness: 0.85 }),
    wall: new THREE.MeshStandardMaterial({ map: gridTexture('#3b3550', 'rgba(255,255,255,0.12)', 'rgba(126,220,255,0.6)', aniso), roughness: 0.9 }),
    metal: new THREE.MeshStandardMaterial({ color: 0xff8a1f, metalness: 0.75, roughness: 0.3 }),
  };

  const byKind = new Map<PieceKind, THREE.BufferGeometry[]>();
  for (const piece of park.pieces) {
    const list = byKind.get(piece.kind) ?? [];
    list.push(piece.geometry);
    byKind.set(piece.kind, list);
  }
  // Coping pipes and ledge edges drawn as metal so grindable edges are obvious.
  const metal = byKind.get('metal') ?? [];
  for (const rail of park.rails) {
    if (rail.type === 'coping') metal.push(railMesh(rail.points.map(p => p.clone().setY(p.y - 0.03)), 0.04, false));
    if (rail.type === 'ledge') metal.push(railMesh(rail.points.map(p => p.clone().setY(p.y - 0.012)), 0.014, false));
  }
  byKind.set('metal', metal);

  // Neon line under every coping so lips read from across the park.
  const neonGeometries: THREE.BufferGeometry[] = [];
  for (const rail of park.rails.filter(r => r.type === 'coping')) {
    neonGeometries.push(railMesh(rail.points.map(p => p.clone().setY(p.y - 0.16)), 0.018, false));
  }
  if (neonGeometries.length) {
    const neon = new THREE.Mesh(mergeGeometries(neonGeometries), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff3d8b).multiplyScalar(2.4) }));
    neon.name = 'Coping neon';
    group.add(neon);
  }

  // Brand graffiti on the inside of the boundary walls and on the wallride wall.
  const half = park.size / 2 - 0.51;
  const panels: [string, string, string, number, number, number][] = [
    ['CHIMP HAWK', '#ff3d8b', '#2a1f3a', 0, half, Math.PI],
    ['UNDERGROUND', '#ffd23f', '#1f2a3a', -half, 18, Math.PI / 2],
    ['THE LAB', '#7edcff', '#2a1f3a', half, -18, -Math.PI / 2],
    ['SKATE OR HOOT', '#b46cff', '#22283a', -20, -half, 0],
  ];
  for (const [text, accent, base, x, z, rot] of panels) {
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(16, 4), new THREE.MeshStandardMaterial({ map: graffitiTexture(text, accent, base), roughness: 0.85 }));
    panel.position.set(x, 1.05, z);
    panel.rotation.y = rot;
    panel.scale.y = 0.5;
    group.add(panel);
  }
  const wallTag = new THREE.Mesh(new THREE.PlaneGeometry(11.6, 2.9), new THREE.MeshStandardMaterial({ map: graffitiTexture('WALLRIDE', '#7edcff', '#2b1d33'), roughness: 0.85 }));
  wallTag.position.set(30, 1.6, 30.26);
  group.add(wallTag);
  const wallTagBack = wallTag.clone();
  wallTagBack.position.z = 29.74; wallTagBack.rotation.y = Math.PI;
  group.add(wallTagBack);

  for (const [kind, geometries] of byKind) {
    const merged = mergeGeometries(geometries);
    if (kind !== 'metal') worldUVs(merged);
    merged.computeBoundingSphere();
    const mesh = new THREE.Mesh(merged, materials[kind]);
    mesh.name = `Park ${kind}`;
    mesh.receiveShadow = true;
    mesh.castShadow = kind !== 'floor';
    mesh.matrixAutoUpdate = false;
    group.add(mesh);
  }
  return group;
}
