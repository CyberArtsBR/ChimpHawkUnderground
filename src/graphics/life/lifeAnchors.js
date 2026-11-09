/**
 * Anchor helpers for World Life modules. Anchors come from MapDressing
 * (`{ position: Vector3, height }`) or are plain Vector3 points.
 */
const pointOf = item => (item?.isVector3 ? item : item?.position?.isVector3 ? item.position : null);

/**
 * The nearest point to `from` that is at least `minDistance` away from it,
 * or null. Returns the stored Vector3 itself (no allocation): do not mutate it.
 */
export function nearestFree(points, from, minDistance = 0) {
  if (!points?.length || !from) return null;
  const minSq = Math.max(0, minDistance) ** 2;
  let best = null, bestSq = Infinity;
  for (let i = 0; i < points.length; i++) {
    const point = pointOf(points[i]);
    if (!point) continue;
    const dSq = point.distanceToSquared(from);
    if (dSq >= minSq && dSq < bestSq) { best = point; bestSq = dSq; }
  }
  return best;
}

/**
 * Push `position` (in place) out to `minDistance` from the rider when it is
 * inside that radius. Returns `position`.
 */
export function keepClearOfRider(position, riderPosition, minDistance = 1.2) {
  if (!position || !riderPosition) return position;
  const dx = position.x - riderPosition.x, dy = position.y - riderPosition.y, dz = position.z - riderPosition.z;
  const distance = Math.hypot(dx, dy, dz);
  if (distance >= minDistance) return position;
  if (distance < 1e-6) return position.set(riderPosition.x + minDistance, riderPosition.y, riderPosition.z);
  const scale = minDistance / distance;
  return position.set(riderPosition.x + dx * scale, riderPosition.y + dy * scale, riderPosition.z + dz * scale);
}
