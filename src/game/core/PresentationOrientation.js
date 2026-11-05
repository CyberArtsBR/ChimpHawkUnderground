import * as THREE from 'three';

const EPSILON = 1e-8;
const WORLD_UP = new THREE.Vector3(0, 1, 0);

/**
 * Build the rendered board/rider basis without projecting horizontal forward
 * into a near-parallel coping normal. Surface contact may pitch/roll the skater,
 * but horizontal yaw remains authored by gameplay heading.
 */
export function yawStableSurfaceBasis(
  heading,
  surfaceUp,
  rightOut = new THREE.Vector3(),
  backOut = new THREE.Vector3(),
  upOut = new THREE.Vector3(),
) {
  upOut.copy(surfaceUp || WORLD_UP);
  if (upOut.lengthSq() < EPSILON) upOut.copy(WORLD_UP);
  else upOut.normalize();

  const cos = Math.cos(Number(heading) || 0);
  const sin = Math.sin(Number(heading) || 0);

  rightOut.set(cos, 0, -sin);
  rightOut.addScaledVector(upOut, -rightOut.dot(upOut));

  if (rightOut.lengthSq() > 1e-6) {
    rightOut.normalize();
    backOut.crossVectors(rightOut, upOut).normalize();
    return { right: rightOut, up: upOut, back: backOut };
  }

  backOut.set(sin, 0, cos);
  backOut.addScaledVector(upOut, -backOut.dot(upOut));
  if (backOut.lengthSq() > 1e-6) {
    backOut.normalize();
    rightOut.crossVectors(upOut, backOut).normalize();
    return { right: rightOut, up: upOut, back: backOut };
  }

  rightOut.set(1, 0, 0);
  if (Math.abs(rightOut.dot(upOut)) > 0.98) rightOut.set(0, 0, 1);
  rightOut.addScaledVector(upOut, -rightOut.dot(upOut)).normalize();
  backOut.crossVectors(rightOut, upOut).normalize();
  return { right: rightOut, up: upOut, back: backOut };
}
