import * as THREE from 'three';

const C=THREE.MathUtils.clamp;

/** Keep the rider in a skatable compact posture, without pushing the torso through the deck. */
export function riderCrouchOffset(compression, grabWeight = 0) {
  const kneeBend=C(Number.isFinite(compression)?compression:0,0,1);
  // One consistent drop for ollie charge, vert tuck and grab. Grabbing is an
  // upper-body reach, not a second whole-character crouch animation.
  return 0.025 + kneeBend * 0.185;
}

/** Keep the hips physically above the board rather than just hiding clipping. */
export function ensurePelvisDeckClearance(model, pelvis, board, minimum = 0.405) {
  if(!model || !pelvis || !board?.root || !board.pointWorld) return 0;
  model.updateWorldMatrix(true,true);
  board.root.updateWorldMatrix(true,true);
  const pelvisInBoard=board.root.worldToLocal(pelvis.getWorldPosition(new THREE.Vector3()));
  const surfaceY=(board.contactRig?.deckTopY ?? board.deckHeight ?? 0)-(board.deckHeight??0);
  const clearance=pelvisInBoard.y-surfaceY;
  if(!Number.isFinite(clearance) || clearance>=minimum) return 0;
  const correction=C(minimum-clearance,0,0.2);
  // Since the rider model is oriented relative to its root but translates
  // directly on local Y, this correction does not rotate the board physics.
  model.position.y+=correction;
  model.updateWorldMatrix(true,true);
  return correction;
}

/**
 * Avoid inward "knock knees" by requiring the knee-pole's lateral component
 * to point outside the rider's skate stance. Preserve the original forward
 * bias of the individual GLB when possible.
 */
export function outwardKneePole(restPole, outwardSign, compression=0) {
  const sign=outwardSign<0?-1:1;
  const rest=restPole?.isVector3 && restPole.lengthSq()>1e-7 ? restPole:new THREE.Vector3(0,-0.35,0.22);
  const lateral=Math.max(0.13+0.075*C(compression,0,1),rest.x*sign);
  const forward=Math.abs(rest.z)>=0.12?rest.z:0.22;
  return new THREE.Vector3(sign*lateral,C(rest.y,-0.6,-0.04),C(forward,-0.48,0.48));
}

/**
 * Reach toward the board with the hand, but only as far as the arm permits.
 * The elbow stays outside the torso, and the grab never moves the pelvis.
 */
export function boundedHandReach(shoulder, desired, armLength, margin=0.035) {
  if(!shoulder?.isVector3 || !desired?.isVector3) return desired?.clone?.()||null;
  const radius=Math.max(0.05,(Number.isFinite(armLength)?armLength:0.5)-margin);
  const travel=desired.clone().sub(shoulder);
  const len=travel.length();
  return len>radius ? shoulder.clone().addScaledVector(travel,radius/len):desired.clone();
}

/**
 * Neutral wrist IK for cartoon/short-arm Chimpions avatars.
 * Fixed adult-sized hand targets can sit outside a small rig's entire arm
 * reach; pin targets inside the measured chain with spare elbow bend.
 * Named grabs still use boundedHandReach and retain their own explicit reach.
 */
export function boundedNeutralHandTarget(shoulder, requested, armLength) {
  if (!shoulder?.isVector3 || !requested?.isVector3) return requested?.clone?.() || null;
  if (!Number.isFinite(armLength) || armLength <= 0) return requested.clone();
  const travel = requested.clone().sub(shoulder);
  const maxReach = Math.max(.075, armLength * .84);
  const distance = travel.length();
  if (distance > maxReach && distance > 1e-8) return shoulder.clone().addScaledVector(travel, maxReach / distance);
  return requested.clone();
}

/** Balanced, asymmetric ready stance: hands at the side, elbows away from the chest. */
export function neutralHandOffset(outwardSign, frontArm=false, compression=0, air=0, balance=0) {
  const sign=outwardSign<0?-1:1;
  return new THREE.Vector3(
    sign*(0.14+0.035*C(compression,0,1)),
    -0.36-0.035*C(compression,0,1)+0.045*C(air,0,1)+0.05*C(balance,-1,1)*sign,
    (frontArm?0.095:-0.065)+0.06*C(balance,-1,1)
  );
}

/**
 * Calibrate posture to an imported GLB's actual hip-to-ankle separation.
 * A hard-coded 40 cm clearance straightens short-legged cartoon characters
 * after we have crouched them. Tall and short rigs need different limits.
 */
export function avatarPoseCalibration(hipToAnkle) {
  const height = C(Number.isFinite(hipToAnkle) ? hipToAnkle : 0.72, 0.30, 1.20);
  return {
    crouchScale: C(height / 0.72, 0.72, 1.25),
    pelvisClearance: C(height * 0.52, 0.19, 0.405),
  };
}

/** Only correct genuinely overextended legs: never lift the hips to force a
 * knee bend, since that cancels the actual crouch pose. */
export function legOverextension(hip, target, upperLength, lowerLength) {
  if (!hip?.isVector3 || !target?.isVector3 ||
      !Number.isFinite(upperLength) || !Number.isFinite(lowerLength)) return 0;
  const reach = upperLength + lowerLength - 0.008;
  if (!(reach > 0)) return 0;
  return C(hip.distanceTo(target) - reach, 0, 0.14);
}
