import * as THREE from 'three';
import {
  ArcadeParkMobilitySkillStreetPhysics,
  ARCADE_PARK_MOBILITY,
} from './ArcadeParkMobilitySkillStreetPhysics.js';
import {
  explicitAirHalfTurns,
  rampLandingFacing,
} from './core/LandingOrientation.js';
import {
  applyLandingPostPipeline,
  captureLandingPostContext,
} from './core/LandingPostPipeline.js';
import { captureTakeoffContext } from './core/TakeoffContext.js';
import { interpretAirTurn } from '../input/InputInterpreter.js';

const EPSILON = 1e-8;
const clamp = THREE.MathUtils.clamp;

function horizontal(source, fallback = null) {
  const out = source?.clone?.() || new THREE.Vector3();
  out.y = 0;
  if (out.lengthSq() > EPSILON) return out.normalize();
  if (fallback?.lengthSq?.() > EPSILON) {
    out.copy(fallback).setY(0);
    if (out.lengthSq() > EPSILON) return out.normalize();
  }
  return out.set(0, 0, -1);
}

function angleDelta(from, to) {
  let delta = (to - from + Math.PI) % (Math.PI * 2);
  if (delta < 0) delta += Math.PI * 2;
  return delta - Math.PI;
}

export function lerpHeading(from, to, t) {
  return from + angleDelta(from, to) * clamp(t, 0, 1);
}

/** Backwards-compatible helper: passive ramp turnaround is intentionally zero. */
export function naturalRampReturnProgress() {
  return 0;
}

/** Backwards-compatible exports now backed by the canonical orientation model. */
export const rampReturnHalfTurns = explicitAirHalfTurns;
export const rampReturnFacing = rampLandingFacing;

/** Direct directional input and bumpers rotate the rider; inertial steering does not. */
export function transitionAirSpinInput(input = {}) {
  return interpretAirTurn(input);
}

/**
 * Ramp-air orientation authority during the Phase 1 migration:
 * - ground steering inertia / analog smoothing NEVER becomes airborne yaw;
 * - passive ramp air freezes the takeoff heading until explicit spin is pressed;
 * - touchdown yaw is takeoff facing + explicit spin only;
 * - fakie is NOT stored/restored here anymore. It is derived after touchdown by
 *   canonical TravelState from final deck heading versus actual travel.
 */
export class StableRampReturnSkillStreetPhysics extends ArcadeParkMobilitySkillStreetPhysics {
  reset(position = this.spawn, heading = 0) {
    super.reset(position, heading);
    this.rampTakeoffFacing ||= new THREE.Vector3(0, 0, -1);
    this.rampTakeoffFacing.copy(horizontal(this.forward, this.travelDirection));
    this.airTakeoffFacing ||= new THREE.Vector3(0, 0, -1);
    this.airTakeoffFacing.copy(this.rampTakeoffFacing);
    this.airTakeoffHeading = heading;
    this.airTakeoffStance = Number(this.stance) || 1;
    this.airTakeoffFromRamp = false;
  }

  takeoff(impulse = 0, transition = null, canonicalContext = null) {
    // Final runtime passes one canonical context from UnifiedRampFeel. Direct
    // subsystem instances retain a compatibility fallback that computes it here.
    const context = canonicalContext || captureTakeoffContext({
      grounded: this.grounded,
      normal: this.normal,
      velocity: this.velocity,
      forward: this.forward,
      travelDirection: this.travelDirection,
      heading: this.heading,
      stance: this.stance,
      requestedImpulse: impulse,
      transition,
      rampLaunchMemory: this.rampLaunchMemory,
      rampLaunchMemoryTime: this.rampLaunchMemoryTime,
      rampExitIntentTime: this.rampExitIntentTime,
    });

    this.airTakeoffFacing.copy(context.takeoffFacing);
    this.airTakeoffHeading = context.takeoffHeading;
    this.airTakeoffStance = context.takeoffStance;
    this.airTakeoffFromRamp = context.rampContext;

    const result = super.takeoff(impulse, transition);

    if (this.transitionAir?.frame) {
      this.transitionAir.frame.takeoffFacing = context.takeoffFacing.clone();
      this.transitionAir.frame.takeoffStance = context.takeoffStance;
      this.transitionAir.frame.takeoffHeading = context.takeoffHeading;
    }
    return result;
  }

  /** Disable every lower-layer automatic transition alignment. */
  autoAlignOriginalTransition() {}

  land(support) {
    if (this.deferLandingPostHooks) return super.land(support);

    const context = captureLandingPostContext(this, support, {
      rampReentrySlopeY: ARCADE_PARK_MOBILITY.rampReentrySlopeY,
    });

    // Direct subsystem instances should match the final runtime: acceptance and
    // geometry routing still execute below, but legacy post hooks are deferred so
    // orientation/travel/re-entry bookkeeping is composed exactly once here.
    this.deferLandingPostHooks = true;
    let landed = false;
    try {
      landed = super.land(support);
    } finally {
      this.deferLandingPostHooks = false;
    }
    if (!landed) return false;

    applyLandingPostPipeline(this, support, context, {
      lowerLayerHeading: this.heading,
      rampReentrySteerLock: ARCADE_PARK_MOBILITY.rampReentrySteerLock,
    });
    return true;
  }
}
