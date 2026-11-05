import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { dedupeRails, objectName, tubePaths } from '../src/park/LegacyMaps';

describe('legacy map helpers', () => {
  it('uses the nearest Blender collection path as the object name', () => {
    const parent = new THREE.Group(); parent.name = '01_STREET / Ledge';
    const child = new THREE.Mesh(); child.name = 'Mesh_001';
    parent.add(child);
    expect(objectName(child)).toBe('01_STREET / Ledge');
  });

  it('rebuilds a rail path from ten-vertex tube rings', () => {
    // A straight tube: 3 rings of 10 vertices, radius 0.03, along X at height 0.5.
    const positions: number[] = [], indices: number[] = [];
    for (let ring = 0; ring < 3; ring++) for (let k = 0; k < 10; k++) {
      const a = (k / 10) * Math.PI * 2;
      positions.push(ring, 0.5 + Math.cos(a) * 0.03, Math.sin(a) * 0.03);
    }
    for (let ring = 0; ring < 2; ring++) for (let k = 0; k < 10; k++) {
      const a = ring * 10 + k, b = ring * 10 + ((k + 1) % 10), c = a + 10, d = b + 10;
      indices.push(a, c, b, b, c, d);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    g.setIndex(indices);
    const [path] = tubePaths(g);
    expect(path.points).toHaveLength(3);
    expect(path.points[1].x).toBeCloseTo(1, 5);
    expect(path.points[1].y).toBeCloseTo(0.5, 5);
    expect(path.radius).toBeCloseTo(0.03, 4);
  });

  it('drops duplicated rails (same path, either direction)', () => {
    const r = (pts: [number, number, number][]) => ({ name: 'r', type: 'rail' as const, points: pts.map(p => new THREE.Vector3(...p)) });
    const out = dedupeRails([r([[0, 1, 0], [5, 1, 0]]), r([[5, 1, 0], [0, 1, 0]]), r([[0, 1, 2], [5, 1, 2]])]);
    expect(out).toHaveLength(2);
  });
});

describe('warehouse copings', () => {
  it('turns a straight coping pipe into a grind segment along its top', async () => {
    const { copingPaths } = await import('../src/park/LegacyMaps');
    const pipe = new THREE.CylinderGeometry(0.04, 0.04, 6, 8).rotateZ(Math.PI / 2).translate(2, 1.5, 0);
    const [path] = copingPaths(pipe);
    expect(path).toHaveLength(2);
    expect(Math.abs(path[1].x - path[0].x)).toBeCloseTo(6, 3);
    expect(path[0].y).toBeCloseTo(1.54, 3);
  });

  it('ignores parts that are not long thin pipes', async () => {
    const { copingPaths } = await import('../src/park/LegacyMaps');
    expect(copingPaths(new THREE.BoxGeometry(1, 1, 1))).toEqual([]);
  });
});
