import * as THREE from 'three';

const UP = new THREE.Vector3(0, 1, 0);

/**
 * Feet follow the BOARD NORMAL (nose/tail tilt, bank) but never inherit the
 * board's visual yaw. Pop Shove-it/360 Shove-it can finish with a 180-degree
 * yaw hold even though the rider did not rotate: copying board quaternion
 * to ankle bones twists both shins inside the skinned character.
 *
 * During a flip, grab release or bail, the feet follow rider orientation
 * until the board is safely caught.
 */
/**
 * The mesh can keep the completed shove-it yaw for continuity, but riders
 * must plant on the deck in their original stance frame. Undo ONLY the held
 * trick yaw for the foot contact points; the deck's bank/pitch still applies.
 */
export function plantedFootWorldPoint(board, x, y, z, output = new THREE.Vector3(), presentationYaw = board?._yawHold) {
  const heldYaw = Number.isFinite(presentationYaw) ? presentationYaw : 0;
  const cos = Math.cos(heldYaw), sin = Math.sin(heldYaw);
  return board.pointWorld(cos * x - sin * z, y, sin * x + cos * z, output);
}

export function footWorldOrientation(riderRoot, board, restFootQuaternion, plantOnBoard = true) {
  const riderWorld = riderRoot.getWorldQuaternion(new THREE.Quaternion());
  if (!plantOnBoard || !board?.root) return riderWorld.multiply(restFootQuaternion);
  const riderUp = UP.clone().applyQuaternion(riderWorld);
  const boardUp = UP.clone().applyQuaternion(
    board.root.getWorldQuaternion(new THREE.Quaternion()),
  );
  const tiltOnly = new THREE.Quaternion().setFromUnitVectors(riderUp, boardUp);
  return tiltOnly.multiply(riderWorld).multiply(restFootQuaternion).normalize();
}
