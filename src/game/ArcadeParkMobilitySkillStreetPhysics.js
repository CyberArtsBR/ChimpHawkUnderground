import * as THREE from 'three';
import {
  SafeCopingExitSkillStreetPhysics,
} from './SafeCopingExitSkillStreetPhysics.js';
import {
  GRIND_CAPTURE_POLICY,
  grindCaptureEligibility,
} from './core/GrindCaptureController.js';
import {
  GROUND_MOTOR,
  arcadeTurnGain,
  rampReentrySteerScale,
} from './core/GroundMotor.js';

export {
  arcadeTurnGain,
  rampReentrySteerScale,
} from './core/GroundMotor.js';


export const ARCADE_PARK_MOBILITY = Object.freeze({
  // THPS-style rail magnetism. This is only consulted while airborne with an
  // explicit grind intent, so normal riding cannot snap to nearby rails.
  railCaptureDistance: GRIND_CAPTURE_POLICY.railCaptureDistance,
  railCaptureAbove: GRIND_CAPTURE_POLICY.railCaptureAbove,
  railCaptureBelow: GRIND_CAPTURE_POLICY.railCaptureBelow,
  railMaxRiseVelocity: GRIND_CAPTURE_POLICY.railMaxRiseVelocity,
  railPredictionTime: GRIND_CAPTURE_POLICY.railPredictionTime,
  railAlignmentRelax: GRIND_CAPTURE_POLICY.railAlignmentRelax,
  railMaxAlignmentSlack: GRIND_CAPTURE_POLICY.railMaxAlignmentSlack,
  railMinTangentSpeed: GRIND_CAPTURE_POLICY.railMinTangentSpeed,
  railBlendTime: GRIND_CAPTURE_POLICY.railBlendTime,

  // Tighter arcade carving without changing regular/fakie semantics.
  turnGainLowSpeed: GROUND_MOTOR.turnGainLowSpeed,
  turnGainHighSpeed: GROUND_MOTOR.turnGainHighSpeed,
  turnGainFullSpeed: GROUND_MOTOR.turnGainFullSpeed,
  manualTurnGain: GROUND_MOTOR.manualTurnGain,
  highSpeedSteerReference: GROUND_MOTOR.highSpeedSteerReference,
  highSpeedYawExponent: GROUND_MOTOR.highSpeedYawExponent,
  groundSteerResponseLow: GROUND_MOTOR.groundSteerResponseLow,
  groundSteerResponseHigh: GROUND_MOTOR.groundSteerResponseHigh,

  // Re-entry steering protection. A steep transition has almost no horizontal
  // tangent near vertical, so steering is briefly suppressed after touchdown.
  // Contact itself never changes heading.
  rampReentrySteerLock: GROUND_MOTOR.rampReentrySteerLock,
  rampReentryHardLock: GROUND_MOTOR.rampReentryHardLock,
  rampReentrySlopeY: 0.995,
});

function horizontal(source, fallback = null) {
  const out = source?.clone?.() || new THREE.Vector3();
  out.y = 0;
  if (out.lengthSq() > 1e-8) return out.normalize();
  if (fallback?.lengthSq?.() > 1e-8) {
    out.copy(fallback).setY(0);
    if (out.lengthSq() > 1e-8) return out.normalize();
  }
  return out.set(0, 0, -1);
}

/**
 * Legacy pure helper retained for replay compatibility only. Runtime landing yaw
 * no longer uses this function; LandingOrientation owns takeoff-facing + explicit
 * spin semantics and contact normals have zero yaw authority.
 */
export function transitionReturnBoardDirection({
  rampInward = null,
  fallbackTravel = null,
  rollingSign = 1,
  airSpin = 0,
} = {}) {
  const travel = horizontal(rampInward, fallbackTravel);
  const halfTurns = Math.round((Math.abs(Number(airSpin) || 0) * 180 / Math.PI) / 180);
  const initialDeckSign = rollingSign < 0 ? -1 : 1;
  const spinSign = halfTurns % 2 === 1 ? -1 : 1;
  return travel.multiplyScalar(initialDeckSign * spinSign);
}

export const arcadeGrindEligibility = grindCaptureEligibility;

/**
 * Compatibility surface for the former arcade mobility subclass.
 *
 * Ground steering/re-entry now belongs to GroundMotor/MomentumRoll, and grind
 * capture/entry belongs to GrindCaptureController/CoreSkateController. Keeping
 * the exported constructor as an alias preserves old imports without another
 * runtime prototype level.
 */
export const ArcadeParkMobilitySkillStreetPhysics = SafeCopingExitSkillStreetPhysics;
