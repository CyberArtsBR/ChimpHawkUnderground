import * as THREE from 'three';

export function nearbyFlatRespawn(player) {
  const origin = player.position;
  const inside = p => !player.playableRegions?.length || player.playableRegions.some(r =>
    p.x > r.minX + 1.3 && p.x < r.maxX - 1.3 && p.z > r.minZ + 1.3 && p.z < r.maxZ - 1.3);
  for (const radius of [1.5, 3, 5, 8, 12, 18, 24, 32]) for (let i = 0; i < 20; i++) {
    const angle = i / 20 * Math.PI * 2 + player.heading;
    const probe = new THREE.Vector3(origin.x + Math.cos(angle) * radius, origin.y + 2, origin.z + Math.sin(angle) * radius);
    if (!inside(probe)) continue;
    const hit = player.surface.ground(probe, 3, 45);
    if (!hit || hit.normal.y < 0.985) continue;
    const point = hit.point.clone().add(new THREE.Vector3(0, 0.015, 0));
    const flat = [[0.85,0],[-0.85,0],[0,0.85],[0,-0.85]].every(([x,z]) => {
      const support = player.surface.ground(point.clone().add(new THREE.Vector3(x,0,z)), 0.2, 0.4);
      return support && support.normal.y > 0.985 && Math.abs(support.point.y - hit.point.y) < 0.08;
    });
    if (!flat) continue;
    const body = player.surface.move(point, point, new THREE.Vector3(), { grounded: false });
    if (body.contacts.length || body.position.distanceToSquared(point) > 0.001) continue;
    // An upward ray catches low ramp undersides above otherwise flat concrete.
    const eye = point.clone().add(new THREE.Vector3(0,1.65,0));
    if (player.surface.camera(point.clone().add(new THREE.Vector3(0,0.2,0)), eye).distanceTo(eye) > 0.1) continue;
    return point;
  }
  return player.spawn.clone();
}
