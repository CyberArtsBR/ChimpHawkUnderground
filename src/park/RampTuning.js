import * as THREE from 'three';

const UP = new THREE.Vector3(0, 1, 0);
const RAMP_SCALE = 1.3;

// World-space definitions match the authored park before runtime tuning.
const RAMPS = [
  {
    name: '02 / western vert wall',
    origin: new THREE.Vector3(-27, 0, 1),
    forward: new THREE.Vector3(-1, 0, 0),
    side: new THREE.Vector3(0, 0, 1),
    width: 12, run: 4.3, total: 6.1, height: 3.6,
  },
  {
    name: '03 / rear mini north',
    origin: new THREE.Vector3(-22, 0, -12.3),
    forward: new THREE.Vector3(0, 0, -1),
    side: new THREE.Vector3(1, 0, 0),
    width: 11, run: 2.5, total: 4.0, height: 1.8,
  },
  {
    name: '03 / rear mini south',
    origin: new THREE.Vector3(-22, 0, -9.2),
    forward: new THREE.Vector3(0, 0, 1),
    side: new THREE.Vector3(1, 0, 0),
    width: 11, run: 2.5, total: 4.0, height: 1.8,
  },
  {
    name: '04 / eastern quarter',
    origin: new THREE.Vector3(29, 0, 3.5),
    forward: new THREE.Vector3(1, 0, 0),
    side: new THREE.Vector3(0, 0, 1),
    width: 8, run: 2.3, total: 4.0, height: 1.8,
  },
];

const VISUAL_TUNABLE = /PARK \/ (?:Steel \/ powder coated frame|Steel \/ brushed coping|Joint \/ graphite|Composite \/ charcoal riding panels)/;
const COLLISION_TUNABLE = /COL_(?:02 \/ western vert wall \/ transition|03 \/ rear mini (?:north|south) \/ transition|04 \/ eastern quarter \/ transition)/;

function rampCoordinates(point, ramp) {
  const d = point.clone().sub(ramp.origin);
  return { u: d.dot(ramp.forward), side: d.dot(ramp.side), y: point.y };
}

function contains(point, ramp) {
  const c = rampCoordinates(point, ramp);
  return c.u >= -0.08
    && c.u <= ramp.total + 0.18
    && Math.abs(c.side) <= ramp.width * 0.5 + 0.18
    && c.y >= -0.08
    && c.y <= ramp.height + 1.12;
}

function mapU(u, ramp, factor) {
  // Grow the curved riding surface inward into the park while leaving the coping
  // and rear deck at their authored X/Z positions. This avoids shrinking the deck
  // or pushing the ramp through the perimeter.
  const extraRun = ramp.run * (factor - 1);
  if (u <= ramp.run) return { value: -extraRun + Math.max(0, u) * factor, derivative: factor };
  return { value: u, derivative: 1 };
}

function transformWorldPoint(point, ramp, factor) {
  const c = rampCoordinates(point, ramp);
  const mapped = mapU(c.u, ramp, factor);
  return {
    point: ramp.origin.clone()
      .addScaledVector(ramp.forward, mapped.value)
      .addScaledVector(ramp.side, c.side)
      .addScaledVector(UP, c.y * factor),
    uScale: mapped.derivative,
  };
}

function tuneMesh(mesh, factor) {
  if (!mesh.geometry?.attributes?.position) return 0;
  mesh.geometry = mesh.geometry.clone();
  mesh.updateMatrixWorld(true);

  const position = mesh.geometry.attributes.position;
  const normal = mesh.geometry.attributes.normal;
  const world = mesh.matrixWorld.clone();
  const inverseWorld = world.clone().invert();
  const localNormalToWorld = new THREE.Matrix3().getNormalMatrix(world);
  const worldNormalToLocal = new THREE.Matrix3().getNormalMatrix(inverseWorld);
  const local = new THREE.Vector3();
  const p = new THREE.Vector3();
  const n = new THREE.Vector3();
  let changed = 0;

  for (let i = 0; i < position.count; i++) {
    local.fromBufferAttribute(position, i);
    p.copy(local).applyMatrix4(world);
    const ramp = RAMPS.find(r => contains(p, r));
    if (!ramp) continue;

    const mapped = transformWorldPoint(p, ramp, factor);
    p.copy(mapped.point).applyMatrix4(inverseWorld);
    position.setXYZ(i, p.x, p.y, p.z);

    if (normal) {
      n.fromBufferAttribute(normal, i).applyMatrix3(localNormalToWorld).normalize();
      const nu = n.dot(ramp.forward) / Math.max(0.001, mapped.uScale);
      const ns = n.dot(ramp.side);
      const ny = n.y / factor;
      n.copy(ramp.forward).multiplyScalar(nu)
        .addScaledVector(ramp.side, ns)
        .addScaledVector(UP, ny)
        .normalize()
        .applyMatrix3(worldNormalToLocal)
        .normalize();
      normal.setXYZ(i, n.x, n.y, n.z);
    }
    changed++;
  }

  if (changed) {
    position.needsUpdate = true;
    if (normal) normal.needsUpdate = true;
    mesh.geometry.computeBoundingBox();
    mesh.geometry.computeBoundingSphere();
  }
  return changed;
}

function tuneRoot(root, factor, visual) {
  if (!root || root.userData.transitionScale === factor) return 0;
  root.updateMatrixWorld(true);
  let changed = 0;
  root.traverse(object => {
    if (!object.isMesh) return;
    if (visual && !VISUAL_TUNABLE.test(object.name)) return;
    if (!visual && !COLLISION_TUNABLE.test(object.name)) return;
    changed += tuneMesh(object, factor);
  });
  root.updateMatrixWorld(true);
  root.userData.transitionScale = factor;
  return changed;
}

function tuneManifestRails(manifest, factor) {
  if (!manifest?.rails || manifest.transitionScale === factor) return;
  for (const rail of manifest.rails) {
    const ramp = RAMPS.find(r => rail.name === `${r.name} coping`);
    if (!ramp) continue;
    rail.points = rail.points.map(raw => {
      const original = new THREE.Vector3(...raw);
      const mapped = transformWorldPoint(original, ramp, factor).point;
      return [mapped.x, mapped.y, mapped.z];
    });
  }
  manifest.transitionScale = factor;
}

/**
 * Gives authored quarter/vert transitions 30% more riding surface. The coping and
 * rear deck keep their original X/Z footprint; the curved transition grows inward
 * into the park and height grows by the same factor. Bowl geometry is untouched.
 */
export function tuneQuarterPipes(park, collision, manifest, factor = RAMP_SCALE) {
  tuneManifestRails(manifest, factor);
  const visualVertices = tuneRoot(park, factor, true);
  const collisionVertices = tuneRoot(collision, factor, false);
  return { factor, visualVertices, collisionVertices };
}

export { RAMP_SCALE };
