// "The Lab": a greybox park with one of every obstacle type, used to tune
// feel before real maps are built in Blender. Node-safe: no materials here.
import * as THREE from 'three';
import { box, kicker, quarterPipe, railMesh, stairs, wedge } from './shapes';

export type PieceKind = 'floor' | 'ramp' | 'ledge' | 'metal' | 'wall' | 'stairs';

export interface ParkPiece { name: string; kind: PieceKind; geometry: THREE.BufferGeometry }

export interface Rail {
  name: string;
  /** Polyline at the grind contact height (top of the rail / coping / ledge edge). */
  points: THREE.Vector3[];
  /** Coping counts for lip tricks later; ledges for slides. */
  type: 'rail' | 'ledge' | 'coping';
}

export interface ParkSpot { name: string; position: THREE.Vector3; heading: number }

export interface ParkDefinition {
  name: string;
  size: number;
  pieces: ParkPiece[];
  rails: Rail[];
  spawn: ParkSpot;
  spots: ParkSpot[];
}

interface Placement { x: number; z: number; y?: number; rotY?: number }

function place(geometry: THREE.BufferGeometry, { x, z, y = 0, rotY = 0 }: Placement): THREE.BufferGeometry {
  geometry.rotateY(rotY);
  geometry.translate(x, y, z);
  return geometry;
}

function placePoints(points: [number, number, number][], { x, z, y = 0, rotY = 0 }: Placement): THREE.Vector3[] {
  const m = new THREE.Matrix4().makeRotationY(rotY).setPosition(x, y, z);
  return points.map(([px, py, pz]) => new THREE.Vector3(px, py, pz).applyMatrix4(m));
}

export function buildTestPark(): ParkDefinition {
  const size = 120;
  const pieces: ParkPiece[] = [];
  const rails: Rail[] = [];
  const add = (name: string, kind: PieceKind, geometry: THREE.BufferGeometry) => pieces.push({ name, kind, geometry });

  // Floor slab (top at y = 0) and a boundary wall so nobody rolls off the world.
  add('Floor', 'floor', place(box(size, 1, size), { x: 0, z: 0, y: -1 }));
  const half = size / 2;
  for (const [x, z, w, d] of [[0, -half, size, 1], [0, half, size, 1], [-half, 0, 1, size], [half, 0, 1, size]] as const) {
    add('Boundary wall', 'wall', place(box(w, 2.2, d), { x, z }));
  }

  // 1. Big quarter pipe (north), with coping you can grind.
  const qpR = 3.4, qpExt = 0.45, qpW = 18, qpZ = -38;
  add('Quarter pipe', 'ramp', place(quarterPipe(qpR, qpExt, 3, qpW), { x: 0, z: qpZ }));
  rails.push({ name: 'Quarter pipe coping', type: 'coping',
    points: placePoints([[-qpW / 2, qpR + qpExt + 0.03, -qpR - 0.03], [qpW / 2, qpR + qpExt + 0.03, -qpR - 0.03]], { x: 0, z: qpZ }) });

  // 2. Mini halfpipe (west): two quarter pipes facing each other across a 6 m flat.
  const hpR = 2.4, hpExt = 0.2, hpW = 10, hpFlat = 6, hpX = -34, hpZ = -6;
  add('Halfpipe A', 'ramp', place(quarterPipe(hpR, hpExt, 2, hpW), { x: hpX, z: hpZ - hpFlat / 2 }));
  add('Halfpipe B', 'ramp', place(quarterPipe(hpR, hpExt, 2, hpW), { x: hpX, z: hpZ + hpFlat / 2, rotY: Math.PI }));
  for (const [label, zSign, rot] of [['A', -1, 0], ['B', 1, Math.PI]] as const) {
    rails.push({ name: `Halfpipe coping ${label}`, type: 'coping',
      points: placePoints([[-hpW / 2, hpR + hpExt + 0.03, -hpR - 0.03], [hpW / 2, hpR + hpExt + 0.03, -hpR - 0.03]],
        { x: hpX, z: hpZ + zSign * hpFlat / 2, rotY: rot }) });
  }

  // 3. Spine (east): two quarter pipes back to back with no deck between.
  const spR = 2.2, spW = 10, spX = 34, spZ = -10;
  add('Spine A', 'ramp', place(quarterPipe(spR, 0.1, 0.15, spW), { x: spX, z: spZ + spR + 0.15 }));
  add('Spine B', 'ramp', place(quarterPipe(spR, 0.1, 0.15, spW), { x: spX, z: spZ - spR - 0.15, rotY: Math.PI }));
  rails.push({ name: 'Spine coping', type: 'coping',
    points: placePoints([[-spW / 2, spR + 0.13, 0], [spW / 2, spR + 0.13, 0]], { x: spX, z: spZ }) });

  // 4. Kicker to a gap and a landing ramp (centre-left), facing north.
  add('Kicker', 'ramp', place(kicker(3.2, 0.9, 3), { x: -12, z: -4, rotY: 0 }));
  // Kicker crest is at z ≈ -6.2; a 2.5 m gap, then a 1.5 m deck and a ramp back down.
  add('Gap landing deck', 'ledge', place(box(3, 0.9, 1.5), { x: -12, z: -9.45 }));
  add('Gap landing ramp', 'ramp', place(wedge(3, 0.9, 3), { x: -12, z: -13.2, rotY: Math.PI }));

  // 5. Ledge with two grindable top edges.
  const ledgeLen = 8, ledgeH = 0.45, ledgeD = 0.6;
  add('Ledge', 'ledge', place(box(ledgeLen, ledgeH, ledgeD), { x: 10, z: 8 }));
  for (const side of [-1, 1]) {
    rails.push({ name: 'Ledge edge', type: 'ledge',
      points: placePoints([[-ledgeLen / 2, ledgeH, side * ledgeD / 2], [ledgeLen / 2, ledgeH, side * ledgeD / 2]], { x: 10, z: 8 }) });
  }

  // 6. Flat rail.
  const flatRail: [number, number, number][] = [[-5, 0.42, 0], [5, 0.42, 0]];
  add('Flat rail', 'metal', railMesh(placePoints(flatRail, { x: -10, z: 10 })));
  rails.push({ name: 'Flat rail', type: 'rail', points: placePoints(flatRail, { x: -10, z: 10 }) });

  // 7. Stair set with a kinked handrail (flat on top, down the stairs, flat at the bottom).
  const stairH = 1.2, stairRun = 3.2, stairW = 5, stairX = 20, stairZ = 22;
  add('Stair platform', 'ledge', place(box(stairW + 2, stairH, 6), { x: stairX, z: stairZ - 3 }));
  add('Stairs', 'stairs', place(stairs(5, stairH, stairRun, stairW), { x: stairX, z: stairZ }));
  // Ramp up to the platform: its crest meets the platform's west edge (x = stairX - 3.5).
  add('Platform ramp', 'ramp', place(wedge(4, stairH, 3), { x: stairX - 7.5, z: stairZ - 3, rotY: -Math.PI / 2 }));
  const handrail: [number, number, number][] = [
    [stairW / 2 + 0.25, stairH + 0.9, -1.5], [stairW / 2 + 0.25, stairH + 0.9, 0],
    [stairW / 2 + 0.25, 0.9, stairRun], [stairW / 2 + 0.25, 0.9, stairRun + 1.5],
  ];
  add('Kinked handrail', 'metal', railMesh(placePoints(handrail, { x: stairX, z: stairZ }), 0.03, false));
  rails.push({ name: 'Kinked handrail', type: 'rail', points: placePoints(handrail, { x: stairX, z: stairZ }) });

  // 8. Manual pad.
  add('Manual pad', 'ledge', place(box(2.2, 0.18, 7), { x: 0, z: 14 }));
  rails.push({ name: 'Manual pad edge', type: 'ledge', points: placePoints([[-1.1, 0.18, -3.5], [-1.1, 0.18, 3.5]], { x: 0, z: 14 }) });

  // 9. Bank (gentle 25° incline) and a wallride wall.
  add('Bank', 'ramp', place(wedge(5, 2.3, 8, 2), { x: -30, z: 24, rotY: Math.PI / 2 }));
  add('Wallride wall', 'wall', place(box(12, 3.2, 0.5), { x: 30, z: 30 }));

  const spawn: ParkSpot = { name: 'Start', position: new THREE.Vector3(4, 0.02, 34), heading: 0 };
  const spots: ParkSpot[] = [
    spawn,
    { name: 'Quarter pipe', position: new THREE.Vector3(0, 0.02, -20), heading: 0 },
    { name: 'Halfpipe', position: new THREE.Vector3(hpX, 0.02, hpZ), heading: 0 },
    { name: 'Stairs', position: new THREE.Vector3(stairX, stairH + 0.02, stairZ - 4), heading: Math.PI },
  ];

  return { name: 'The Lab', size, pieces, rails, spawn, spots };
}
