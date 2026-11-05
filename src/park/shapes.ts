// Geometry builders for skate obstacles. Every builder returns geometry in
// local space; the park places it. Units: metres, Y up.
import * as THREE from 'three';

const ARC_SEGMENTS = 28;

/** Extrude a profile drawn in the (u = depth, v = height) plane across a width. */
function extrudeProfile(profile: THREE.Vector2[], width: number): THREE.BufferGeometry {
  const shape = new THREE.Shape(profile);
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: width, bevelEnabled: false, curveSegments: 1 });
  // Shape u -> world -Z (ramp faces +Z), extrusion -> world X, centred on X.
  geometry.rotateY(Math.PI / 2);
  geometry.translate(-width / 2, 0, 0);
  return geometry;
}

/**
 * Quarter pipe facing +Z. The curve starts at z = 0 on the ground and reaches
 * vertical at z = -radius; a short vertical extension and a deck follow.
 */
export function quarterPipe(radius: number, verticalExtension: number, deckDepth: number, width: number): THREE.BufferGeometry {
  const height = radius + verticalExtension;
  const points: THREE.Vector2[] = [new THREE.Vector2(0, 0)];
  for (let i = 1; i <= ARC_SEGMENTS; i++) {
    const t = (i / ARC_SEGMENTS) * (Math.PI / 2);
    points.push(new THREE.Vector2(radius * Math.sin(t), radius - radius * Math.cos(t)));
  }
  points.push(new THREE.Vector2(radius, height));
  points.push(new THREE.Vector2(radius + deckDepth, height));
  points.push(new THREE.Vector2(radius + deckDepth, 0));
  return extrudeProfile(points, width);
}

/** Straight wedge facing +Z: rises from z = 0 to `height` at z = -length. Optional flat top behind. */
export function wedge(length: number, height: number, width: number, topDepth = 0): THREE.BufferGeometry {
  const points = [new THREE.Vector2(0, 0), new THREE.Vector2(length, height)];
  if (topDepth > 0) points.push(new THREE.Vector2(length + topDepth, height));
  points.push(new THREE.Vector2(length + topDepth, 0));
  return extrudeProfile(points, width);
}

/** Kicker: a curved launch ramp (radius larger than height) facing +Z with an open back. */
export function kicker(radius: number, height: number, width: number): THREE.BufferGeometry {
  const endAngle = Math.acos(1 - height / radius);
  const points: THREE.Vector2[] = [new THREE.Vector2(0, 0)];
  for (let i = 1; i <= 12; i++) {
    const t = (i / 12) * endAngle;
    points.push(new THREE.Vector2(radius * Math.sin(t), radius - radius * Math.cos(t)));
  }
  const back = radius * Math.sin(endAngle);
  points.push(new THREE.Vector2(back, 0));
  return extrudeProfile(points, width);
}

export function box(width: number, height: number, depth: number): THREE.BufferGeometry {
  const geometry = new THREE.BoxGeometry(width, height, depth);
  geometry.translate(0, height / 2, 0);
  return geometry;
}

/** Stair set descending toward +Z from a platform of `height`. Steps are solid blocks. */
export function stairs(steps: number, height: number, run: number, width: number): THREE.BufferGeometry {
  const rise = height / steps;
  const tread = run / steps;
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < steps; i++) {
    const h = height - i * rise;
    const step = new THREE.BoxGeometry(width, h, tread);
    step.translate(0, h / 2, i * tread + tread / 2);
    parts.push(step);
  }
  return mergeGeometries(parts);
}

/** Round rail along a polyline, with posts down to the ground. */
export function railMesh(points: THREE.Vector3[], radius = 0.03, posts = true): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i], b = points[i + 1];
    const length = a.distanceTo(b);
    const tube = new THREE.CylinderGeometry(radius, radius, length, 10, 1);
    tube.translate(0, length / 2, 0);
    tube.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize()));
    tube.translate(a.x, a.y, a.z);
    parts.push(tube);
  }
  if (posts) {
    for (const p of [points[0], points[points.length - 1]]) {
      if (p.y < 0.05) continue;
      const post = new THREE.CylinderGeometry(0.025, 0.025, p.y, 8);
      post.translate(p.x, p.y / 2, p.z);
      parts.push(post);
    }
  }
  return mergeGeometries(parts);
}

/** Minimal merge (position + normal + uv), avoiding the examples/ addon for node tests. */
export function mergeGeometries(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const flat = parts.map(p => (p.index ? p.toNonIndexed() : p));
  const count = flat.reduce((n, p) => n + p.getAttribute('position').count, 0);
  const position = new Float32Array(count * 3), normal = new Float32Array(count * 3), uv = new Float32Array(count * 2);
  let offset = 0;
  for (const p of flat) {
    const pos = p.getAttribute('position'), nor = p.getAttribute('normal'), tex = p.getAttribute('uv');
    for (let i = 0; i < pos.count; i++) {
      position.set([pos.getX(i), pos.getY(i), pos.getZ(i)], (offset + i) * 3);
      if (nor) normal.set([nor.getX(i), nor.getY(i), nor.getZ(i)], (offset + i) * 3);
      if (tex) uv.set([tex.getX(i), tex.getY(i)], (offset + i) * 2);
    }
    offset += pos.count;
  }
  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.BufferAttribute(position, 3));
  merged.setAttribute('normal', new THREE.BufferAttribute(normal, 3));
  merged.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return merged;
}
