import * as THREE from 'three';
import { resolveRampLandingOrientation } from './LandingOrientation.js';
import { evaluateLandingYawInvariant } from './OrientationInvariant.js';

const EPSILON = 1e-8;

function cloneFacing(source, fallback = null) {
  const out = source?.clone?.() || fallback?.clone?.() || new THREE.Vector3(0, 0, -1);
  out.y = 0;
  if (out.lengthSq() < EPSILON) out.set(0, 0, -1);
  return out.normalize();
}

/** Capture every value that post-landing hooks historically needed before land(). */
export function captureLandingPostContext(controller, support, {
  rampReentrySlopeY = 0.995,
} = {}) {
  const activeAir = controller?.transitionAir || null;
  const takeoffFacing = cloneFacing(
    activeAir?.frame?.takeoffFacing,
    controller?.airTakeoffFacing || controller?.forward,
  );
  const takeoffStance = activeAir?.frame?.takeoffStance
    ?? controller?.airTakeoffStance
    ?? (Number(controller?.stance) || 1);
  const landingSpin = Number(controller?.airSpin) || 0;
  const incomingPlanar = (controller?.velocity?.clone?.() || new THREE.Vector3())
    .projectOnPlane(support?.normal || new THREE.Vector3(0, 1, 0));

  return Object.freeze({
    playerHeading: Number(controller?.heading) || 0,
    wasTransitionAir: Boolean(activeAir),
    wasRampAir: Boolean(activeAir) || Boolean(controller?.airTakeoffFromRamp),
    slopedTouchdown: Math.abs(support?.normal?.y ?? 1) < rampReentrySlopeY,
    orientation: resolveRampLandingOrientation({
      takeoffFacing,
      takeoffStance,
      airSpin: landingSpin,
      fallbackHeading: Number(controller?.heading) || 0,
    }),
    incomingPlanar,
    incomingSpeed: incomingPlanar.length(),
    pumpImpactSpeed: Math.max(0,
      -(controller?.velocity?.dot?.(support?.normal || new THREE.Vector3(0, 1, 0)) || 0)),
  });
}

/**
 * Explicit post-landing composition for the final runtime. Acceptance/contact
 * mutation already happened below this boundary. These hooks may derive gameplay
 * state from player-authored orientation and travel, but contact geometry can
 * never invent yaw.
 */
export function applyLandingPostPipeline(controller, support, context, {
  rampReentrySteerLock = 0.20,
  pumpLandingWindow = null,
  lowerLayerHeading = controller?.heading,
} = {}) {
  if (!controller || !support || !context) return false;

  // Observe the raw accepted-landing result before any legitimate post hook can
  // restore ramp-facing semantics. A lower contact writer can therefore never be
  // hidden by the orientation hook that follows.
  const invariant = evaluateLandingYawInvariant({
    playerHeading: context.playerHeading,
    lowerLayerHeading,
  });
  controller.lastLandingYawInvariant = invariant;
  if (invariant.violated) {
    controller.landingYawInvariantViolations = Number(controller.landingYawInvariantViolations || 0) + 1;
  }

  if (context.wasTransitionAir || context.slopedTouchdown) {
    controller.rampReentrySteerLock = Math.max(
      controller.rampReentrySteerLock || 0,
      rampReentrySteerLock,
    );
  }

  if (context.wasRampAir) {
    controller.heading = context.orientation.heading;
    controller.groundDirection();

    if (context.incomingSpeed > 0.18 && controller.forward?.lengthSq?.() > EPSILON) {
      const travelSign = context.incomingPlanar.dot(controller.forward) < 0 ? -1 : 1;
      controller.velocity.copy(controller.forward)
        .multiplyScalar(context.incomingSpeed * travelSign);
    }

    controller.stance = context.orientation.stance;
    controller.rampReentrySteerLock = Math.max(
      controller.rampReentrySteerLock || 0,
      rampReentrySteerLock,
    );
  }

  controller.syncTravelDirection?.({ preserveIfSlow: true });
  controller.airTakeoffFromRamp = false;

  if (Number.isFinite(pumpLandingWindow)) {
    controller.pumpLandingWindow = pumpLandingWindow;
    controller.pumpLandingImpact = Math.max(0, Math.min(1, context.pumpImpactSpeed / 8));
    controller.pumpPreviousNormal = support.normal?.clone?.() || null;
  }

  return true;
}
