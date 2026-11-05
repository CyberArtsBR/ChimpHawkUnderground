/** A union of walkable sector bounds; internal seams never clamp the player. */
export function constrainToPark(controller) {
  const regions = controller.playableRegions?.length ? controller.playableRegions : [
    { minX: -33.2, maxX: 33.2, minZ: -22.1, maxZ: 22.1 },
  ];
  const p = controller.position;
  if (regions.some(r => p.x >= r.minX && p.x <= r.maxX && p.z >= r.minZ && p.z <= r.maxZ)) return;
  let nearest = null, best = Infinity;
  for (const r of regions) {
    const x = Math.max(r.minX, Math.min(r.maxX, p.x));
    const z = Math.max(r.minZ, Math.min(r.maxZ, p.z));
    const d = (x - p.x) ** 2 + (z - p.z) ** 2;
    if (d < best) { best = d; nearest = { x, z }; }
  }
  if (nearest.x !== p.x) controller.velocity.x = 0;
  if (nearest.z !== p.z) controller.velocity.z = 0;
  p.x = nearest.x; p.z = nearest.z;
}
