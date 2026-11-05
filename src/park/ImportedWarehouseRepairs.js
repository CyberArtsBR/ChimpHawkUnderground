import * as THREE from 'three';

const nameOf = object => {
  for (let node = object; node; node = node.parent) {
    const name = node.userData?.name || node.name || '';
    if (name.includes(' / ')) return name;
  }
  return object.name || '';
};

/** Repair the edited import before deriving either batched art or collision. */
export function repairImportedWarehouse(root, { preserveArtistLayout = false, preserveFloorFinish = false } = {}) {
  if (root.userData.warehouseRepairs) return root.userData.warehouseRepairs;
  root.updateMatrixWorld(true);
  const diagnostics = { movedRamps: [], floorPatched: false };
  const joined = new Set(), lowSpines = [];
  let floor = null;
  const rim = new Map();
  root.traverse(object => {
    if (!object.isMesh) return;
    const name = nameOf(object);
    if (/Side_Edge_Band|Side_Wood_Core|Back_Panel/.test(name)
      && object.parent?.userData?.name?.includes(' / ')) joined.add(object.parent);
    if (/Flow low spine/.test(name)) lowSpines.push(object);
    if (/Ground_Floor/.test(name)) floor ||= object;
    if (!/Bowl.*Transition/.test(name)) return;
    const p = object.geometry.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const point = new THREE.Vector3().fromBufferAttribute(p, i).applyMatrix4(object.matrixWorld);
      if (Math.abs(point.y) > .002) continue;
      rim.set(`${point.x.toFixed(4)},${point.z.toFixed(4)}`, point);
    }
  });
  const move = (object, delta) => {
    // Convert a world translation into the parent's coordinates, preserving
    // the artist's rotation/scale and all material primitives together.
    const inverse = object.parent.matrixWorld.clone().invert();
    const local = delta.clone().applyMatrix4(inverse).sub(new THREE.Vector3().applyMatrix4(inverse));
    object.position.add(local);
    diagnostics.movedRamps.push({ name: nameOf(object), delta: delta.toArray() });
  };
  for (const object of preserveArtistLayout ? [] : joined) {
    const bounds = new THREE.Box3().setFromObject(object);
    const name = nameOf(object), centre = bounds.getCenter(new THREE.Vector3());
    const shift = new THREE.Vector3(
      bounds.min.x < -73.2 ? -73.2 - bounds.min.x : bounds.max.x > 73.2 ? 73.2 - bounds.max.x : 0,
      -bounds.min.y,
      bounds.min.z < -53.2 ? -53.2 - bounds.min.z : bounds.max.z > 53.2 ? 53.2 - bounds.max.z : 0,
    );
    // Two joined halfpipes were moved over other transitions; the mini was
    // also sunk three metres beneath the plaza. Restore their free original
    // lanes while retaining the user's enlarged geometry and materials.
    if (/Foundry mini halfpipe/.test(name)) { shift.x = -18 - centre.x; shift.z = -39 - centre.z; }
    if (/Flow mini transition/.test(name)) { shift.x = 58 - centre.x; shift.z = -32 - centre.z; }
    // The copied kicker's back panel coincides with the north ends of both
    // manual-pad ledges. Leave a rider-width gap for entering/exiting grinds.
    if (/Street low kicker east.*Side_Edge_Band 001\.003/.test(name)) shift.z -= .8;
    if (shift.lengthSq() > 1e-8) move(object, shift);
  }
  // These copies are separate objects (one coping was independently moved), so
  // apply one common translation to preserve every existing ramp/rail join.
  if (!preserveArtistLayout && lowSpines.length) {
    const bounds = new THREE.Box3();
    for (const mesh of lowSpines) bounds.union(new THREE.Box3().setFromObject(mesh));
    if (bounds.max.z > 53.2) {
      const delta = new THREE.Vector3(0, -bounds.min.y, 53.2 - bounds.max.z);
      for (const mesh of lowSpines) move(mesh, delta);
    }
  }
  root.updateMatrixWorld(true);
  // Keep the charcoal plaza finish independently of the imported marble asset.
  // Clone only the floor material so ramps sharing an atlas retain their finish.
  if (floor && !preserveFloorFinish) {
    floor.material = floor.material.clone();
    floor.material.name = 'Urban warehouse / charcoal floor';
    floor.material.color.set('#24272a');
    floor.material.roughness = .9;
    floor.material.metalness = 0;
  }
  // The edited asset moved ramps but retained their old plaza cutouts. A small
  // matching charcoal underlay fills those holes; the actual bowl rim is excluded.
  // Keep the original textured floor above it to avoid coplanar visual flicker.
  if (floor && rim.size >= 64) {
    const points = [...rim.values()];
    const centre = points.reduce((sum, p) => sum.add(p), new THREE.Vector3()).multiplyScalar(1 / points.length);
    points.sort((a, b) => Math.atan2(a.z - centre.z, a.x - centre.x) - Math.atan2(b.z - centre.z, b.x - centre.x));
    const bounds = new THREE.Box3().setFromObject(floor);
    const shape = new THREE.Shape();
    shape.moveTo(bounds.min.x, -bounds.min.z); shape.lineTo(bounds.max.x, -bounds.min.z);
    shape.lineTo(bounds.max.x, -bounds.max.z); shape.lineTo(bounds.min.x, -bounds.max.z); shape.closePath();
    const hole = new THREE.Path();
    points.forEach((p, i) => i ? hole.lineTo(p.x, -p.z) : hole.moveTo(p.x, -p.z)); hole.closePath();
    shape.holes.push(hole);
    const geometry = new THREE.ShapeGeometry(shape).rotateX(-Math.PI / 2).translate(0, -.006, 0);
    const p = geometry.attributes.position, uv = geometry.attributes.uv;
    for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / 4, p.getZ(i) / 4);
    const patch = new THREE.Mesh(geometry, floor.material);
    patch.name = '00_WAREHOUSE / Ground_Floor / repaired cutouts';
    patch.userData.name = patch.name;
    // Geometry is authored in world space; compensate for a transformed root.
    patch.applyMatrix4(root.matrixWorld.clone().invert());
    root.add(patch); diagnostics.floorPatched = true;
  }
  root.updateMatrixWorld(true);
  root.userData.warehouseRepairs = diagnostics;
  return diagnostics;
}
