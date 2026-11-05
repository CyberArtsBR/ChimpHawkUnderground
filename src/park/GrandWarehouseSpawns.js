import * as THREE from 'three';
import { ParkCollision } from '../game/ParkCollision.js';
import { SkateboardContactRig } from '../game/SkateboardContactRig.js';

const UP = new THREE.Vector3(0, 1, 0);
// Aim the entrance into the open plaza instead of the tall wooden wall.
// The imported layout's verified 20-second approach stays clear at this angle.
export const GRAND_ENTRANCE_HEADING = .5;

/** Reject discontinuous stair/ledge height support masquerading as a flat spawn. */
export function isSafeGrandSpawnSupport(support, preferredHeight) {
  if (!support?.supported || support.count !== 4 || support.normal?.y < 0.985
    || !support.position || !Number.isFinite(support.position.y)
    || Math.abs(support.position.y - preferredHeight) > 0.38) return false;
  const wheels = support.contacts || [];
  if (wheels.length !== 4 || wheels.some(w => !w.valid || !w.point || !w.normal
    || !Number.isFinite(w.point.y) || w.normal.y < 0.985)) return false;
  const firstHeight = wheels[0].point.y;
  return wheels.every(w => Math.abs(w.point.y - firstHeight) <= 0.065);
}

// Grand's artist-authored obstacle layout differs from Map 2. Preserve every
// ramp transform, but relocate any obsolete respawn marker to the nearest safe,
// flat, unoccupied four-wheel contact on the original plaza.
export function ensureGrandWarehouseSpawns(world) {
  const surface = new ParkCollision(world.collision);
  const contact = new SkateboardContactRig(surface);
  const manifest = world.manifest;
  // The same park instance can be prepared more than once during map reloads.
  if (manifest.statistics?.grandValidatedSpawns === manifest.spots.length + 1) return;
  const reserved = [];
  const regions = manifest.playableRegions;
  const offsets = [[0,0]];
  for (const distance of [2,4,6,8,10,12,16,20,26]) {
    for (let i=0;i<16;i++) {
      const a = i * Math.PI * 2 / 16;
      offsets.push([distance*Math.cos(a),distance*Math.sin(a)]);
    }
  }
  const inBounds = p => regions.some(r=>
    p.x>r.minX+2 && p.x<r.maxX-2 && p.z>r.minZ+2 && p.z<r.maxZ-2);
  const candidateAt = (point, heading, preferredHeight) => {
    if (!inBounds(point)) return null;
    if (reserved.some(p=>p.distanceToSquared(point)<5)) return null;
    const support=contact.snapToGround(point,heading,.5,1);
    if (!isSafeGrandSpawnSupport(support, preferredHeight)) return null;
    const adjusted = support.position.clone();
    // The opposite stance must also have four-wheel contact at this marker.
    const reverse = contact.snapToGround(adjusted, heading + Math.PI, .2, .25);
    if (!isSafeGrandSpawnSupport(reverse, preferredHeight)) return null;
    const sweep = surface.move(adjusted, adjusted, new THREE.Vector3(), { grounded: false });
    if (sweep.contacts.length || sweep.position.distanceToSquared(adjusted) > .001) return null;
    // Reject a low beam or roof intersecting the rider's upright headroom.
    const head = adjusted.clone().addScaledVector(UP, 1.8);
    const eyeRay = adjusted.clone().addScaledVector(UP, .4);
    if (surface.camera(eyeRay, head, .18).distanceToSquared(head) > .01) return null;
    return adjusted;
  };
  const place = (coords, heading, label) => {
    const source = new THREE.Vector3(...coords);
    for (const [dx,dz] of offsets) {
      const candidate=new THREE.Vector3(source.x+dx,source.y,source.z+dz);
      const safe=candidateAt(candidate,heading,source.y);
      if (!safe) continue;
      reserved.push(safe);
      return safe.toArray();
    }
    throw new Error(`Grand Warehouse has no clear four-wheel spawn near ${label}`);
  };
  // Transactional: never leave half-repaired spawn positions if a later spot
  // has no viable placement. Visual GLB transforms are never changed.
  const entrance = place(manifest.spawn, GRAND_ENTRANCE_HEADING, 'entrance');
  const spots = manifest.spots.map(spot => ({
    ...spot, position: place(spot.position, spot.heading || 0, spot.id),
  }));
  manifest.spawn = entrance;
  manifest.spawnHeading = GRAND_ENTRANCE_HEADING;
  manifest.spots = spots;
  manifest.statistics = { ...manifest.statistics, grandValidatedSpawns: spots.length + 1 };
}
