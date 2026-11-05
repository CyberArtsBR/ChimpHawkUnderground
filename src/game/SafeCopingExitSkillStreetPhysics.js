import {
  DeckAwareRampExitSkillStreetPhysics,
  DECK_AWARE_EXIT,
  scanDeckTransferTarget,
  supportMatchesDeckTarget,
} from './DeckAwareRampExitSkillStreetPhysics.js';
import {
  RAMP_WALL_SAFETY,
  isControlledDeckExitTouchdown,
} from './RampWallSafetySkillStreetPhysics.js';
import { PRODUCTION_BOARD_CONTACT_RIG } from './SkateboardContactRig.js';
import { PHYSICS, MOVEMENT_STATE } from './StreetPhysics.js';
import { applyAcceptedLanding } from './core/LandingExecutor.js';
import {
  evaluateTransitionLanding,
  transitionLandingSupportMode,
  landingBailMessage,
} from './core/LandingResult.js';
import { LANDING_ROUTE, resolveLandingRoute } from './landing/LandingPolicy.js';
import { VERT_RETURN } from './transitions/VertReturnFlight.js';
import {
  resolveTransferLaunchResult,
  transferDeckCanFit,
} from './core/TransferLaunchResult.js';
import { evaluateDeckCatch } from './core/DeckCatchResult.js';
import {
  originalTransitionSweep as resolveOriginalTransitionSweep,
  resolveSweepReentryCandidate,
  resolveWheelReentryCandidate,
  supportMatchesOriginalTransition as matchesOriginalTransition,
  partialDeckContactDuringReturn,
} from './core/TransitionReentryResult.js';

export const SAFE_COPING_EXIT = Object.freeze({
  boardLength: PRODUCTION_BOARD_CONTACT_RIG.deckLength,
  edgeSafety: 0.18,
  minSafeDeckWidth: PRODUCTION_BOARD_CONTACT_RIG.deckLength + 0.36,

  recoveryOutwardMax: 0.34,
  recoveryInwardMax: 2.4,
  recoveryAboveLip: 0.42,
  recoveryBelowLip: 5.6,
  recoveryNormalMinY: 0.035,
  recoveryNormalMaxY: 0.985,
  recoveryNormalAlignment: 0.45,
  recoverySnapRise: 0.12,
  recoverySnapDrop: 0.18,

  // Continuous transition re-entry. The main airborne wheel sweep is normally
  // enough, but vert return needs a second pass oriented by the actual transition
  // normal so the board cannot cross a quarter/bowl face between fixed steps.
  continuousSweepExtra: 0.22,
  continuousContactSkin: 0.018,
  contactCorridor: VERT_RETURN.contactCorridor,
  autoAlignSpinToleranceDeg: 38,
});

/** Compatibility export backed by the canonical transfer-deck fit rule. */
export function deckCanFitBoard(control, config = SAFE_COPING_EXIT) {
  return transferDeckCanFit(control, config);
}

export function supportMatchesOriginalTransition(support, air,
  config = SAFE_COPING_EXIT) {
  return matchesOriginalTransition(support, air, config);
}

/**
 * Legacy classification helper retained for tests/migration only. It no longer
 * authorizes an automatic heading correction at touchdown.
 */
export function transitionSpinAlignmentErrorDeg(airSpin = 0) {
  const degrees = Math.abs(Number(airSpin) || 0) * 180 / Math.PI;
  const remainder = degrees % 180;
  return Math.min(remainder, 180 - remainder);
}

/** Legacy compatibility classifier; contact yaw alignment itself is removed. */
export function canAutoAlignTransitionLanding(airSpin = 0,
  config = SAFE_COPING_EXIT) {
  return transitionSpinAlignmentErrorDeg(airSpin) <= config.autoAlignSpinToleranceDeg;
}

export function originalTransitionSweep(surface, from, to, air,
  config = SAFE_COPING_EXIT) {
  return resolveOriginalTransitionSweep(surface, from, to, air, config);
}

/**
 * Coping/transition safety layer based on captured gameplay:
 *  - narrow decks must fit the real board before a straight-out transfer is allowed;
 *  - missed transfers can reconnect to the original quarter/bowl;
 *  - vert return is swept using the transition normal, not only world UP;
 *  - re-entry contact may correct position/velocity but never horizontal yaw.
 */
export class SafeCopingExitSkillStreetPhysics extends DeckAwareRampExitSkillStreetPhysics {
  takeoff(impulse = 0, transition = null) {
    super.takeoff(impulse, transition);
    const air = this.transitionAir;
    if (!air?.transferring || !air.frame) return;
    this.prepareTransfer(air);
  }

  prepareTransfer(air, midair = false) {
    if (!air?.frame || air.supportsTransfer === false) return false;

    // Single transfer-launch authority. Lower layers provide geometry services
    // and flight/landing behavior only; they no longer mutate launch state.
    const deck = scanDeckTransferTarget(this.surface, air.frame);
    const result = resolveTransferLaunchResult({
      frame: air.frame,
      incomingSpeed: air.frame.incomingSpeed,
      launchVertical: air.launchVertical,
      lateralVelocity: air.lateralVelocity,
      deck,
      gravity: PHYSICS.gravity,
      transferConfig: RAMP_WALL_SAFETY,
      deckConfig: DECK_AWARE_EXIT,
      copingConfig: SAFE_COPING_EXIT,
    });
    if (!result?.active) return false;

    const rejected = Boolean(result.exitControl?.abortToReturn);
    air.mode = rejected ? 'return' : result.mode;
    air.transferring = !rejected && result.transferring;
    air.transferRejected = rejected;
    if (rejected) air.exitRequested = false;
    air.exitControl = result.exitControl ? { ...result.exitControl } : null;
    // A transfer requested at the apex must not inject a second vertical jump.
    if (!midair) {
      air.launchVertical = result.launchVertical;
      if (result.launchHorizontal) air.launchHorizontal = result.launchHorizontal.clone();
      this.velocity.copy(result.velocity);
    }
    return !rejected;
  }

  /** Contact alignment is intentionally inert: only player input may change yaw. */
  autoAlignOriginalTransition() {}

  deferTransitionImpact(impact) {
    const air = this.transitionAir;
    return Boolean(air && !air.transferring
      && (supportMatchesOriginalTransition(impact, air)
        || partialDeckContactDuringReturn({support:this.ensureBoardContact().state,air,
          position:this.position,rig:this.contactRig,config:SAFE_COPING_EXIT})));
  }

  land(support) {
    const air = this.transitionAir;
    // A transfer can brush the departing ramp before clearing its lip. Resolve
    // that impact without calling it a new landing and immediately relaunching.
    if (air && !air.apexPassed && this.velocity.y > 0.05) {
      this.copingTrace?.contact('landing-rejected', support, 'departure');
      return false;
    }
    if (air && !air.transferring) {
      // Wheel probes can still see the coping while the rider is leaving it.
      // That is departure contact, not another touchdown/takeoff cycle.
      const nearLip = support?.position && air.frame?.lipPoint
        && support.position.y > air.frame.lipPoint.y - 0.25;
      if (nearLip && Math.abs(support.normal?.y ?? 1) > 0.985) {
        this.copingTrace?.contact('landing-rejected', support, 'flat-lip');
        return false;
      }
    }

    const control = air?.exitControl;
    // A verified deliberate exit owns its deck landing. Mixed lip support can
    // still geometrically overlap the original ramp, but must not bypass the
    // deck-target check and settle backward on that blended contact.
    const originalTransition = Boolean(air && (!air.transferring || control?.abortToReturn)
      && supportMatchesOriginalTransition(support, air));
    const deckTargetMatches = supportMatchesDeckTarget(support, air);
    const route = resolveLandingRoute({
      originalTransition,
      geometryAware: Boolean(control?.geometryAware),
      abortToReturn: Boolean(control?.abortToReturn),
      deckTargetMatches,
    });

    if (route === LANDING_ROUTE.REJECT_DECK_TARGET) return false;

    // Flat one-wheel deck contact is a special bridge only for a real outward
    // controlled transfer. Original-transition recovery and abort-to-return keep
    // normal transition support rules, matching the previous nested land chain.
    const detectedSupportMode = transitionLandingSupportMode(support);
    const allowDeckExitBridge = route === LANDING_ROUTE.STANDARD
      && Boolean(air?.transferring)
      && Boolean(control?.geometryAware)
      && !control?.abortToReturn;
    const deckExitTouchdown = detectedSupportMode === 'reject'
      && allowDeckExitBridge
      && isControlledDeckExitTouchdown(support, air);

    const landing = evaluateTransitionLanding({
      support,
      position: this.position,
      velocity: this.velocity,
      forward: this.forward,
      airTime: this.airTime,
      flipProgress: this.flipState?.progress ?? null,
      maxLandingCorrection: PHYSICS.maxLandingCorrection,
      supportModeOverride: deckExitTouchdown ? 'deckExit' : null,
    });

    if (landing.flipMode === 'autoCatch' && this.flipState) this.flipState.progress = 1;

    if (!landing.accepted) {
      this.copingTrace?.contact('landing-rejected', support, landing.rejectReason);
      if (landing.shouldBail) this.bail(landingBailMessage(landing));
      return false;
    }

    this.copingTrace?.contact('landing-accepted', support, route);
    return applyAcceptedLanding(this, support, landing, {
      partialGrace: 0.16,
      slopedGrace: 0.07,
    });
  }

  tryVerifiedDeckCatch(activeAir) {
    const context = {
      transitionAir: activeAir,
      position: this.position,
      velocity: this.velocity,
      catchHorizontalRadius: DECK_AWARE_EXIT.catchHorizontalRadius,
      catchVerticalWindow: DECK_AWARE_EXIT.catchVerticalWindow,
    };
    const decision = this.coreController
      ? this.coreController.resolveDeckCatch(context)
      : evaluateDeckCatch(context);
    if (!decision.eligible) return false;

    // Last-resort four-wheel catch inside the already verified deck corridor.
    // This is the former DeckAwareRampExit stepAir probe, kept in the same
    // post-air/pre-reentry order while removing that inheritance level.
    const support = this.ensureBoardContact().snapToGround(
      this.position,
      this.heading,
      0.34,
      0.48,
    );
    if (!support?.supported || !supportMatchesDeckTarget(support, activeAir)) return false;
    return this.land(support);
  }

  tryContinuousTransitionReentry(activeAir, before) {
    // Once a real deck is verified, its own support solver owns touchdown.
    // The original-wall fallback must never steal a deliberate deck transfer.
    if (activeAir?.transferring && !activeAir.exitControl?.abortToReturn) return false;
    const contact = this.ensureBoardContact();
    const context = {
      activeAir,
      grounded: this.grounded,
      sameAir: this.transitionAir === activeAir,
      velocityY: this.velocity.y,
      contact,
      surface: this.surface,
      before,
      position: this.position,
      heading: this.heading,
      referenceNormal: activeAir?.frame?.surfaceNormal || this.normal,
      velocity: this.velocity,
      forward: this.forward,
      config: SAFE_COPING_EXIT,
    };

    const wheel = this.coreController
      ? this.coreController.resolveWheelReentry(context)
      : resolveWheelReentryCandidate(context);
    if (wheel?.support) {
      if (this.land(wheel.support)) return true;
      if (this.bailTime > 0) {
        this.position.copy(wheel.support.position);
        return true;
      }
    }

    const sweep = this.coreController
      ? this.coreController.resolveSweepReentry(context)
      : resolveSweepReentryCandidate(context);
    if (!sweep?.support || !sweep.candidate) return false;

    // Only true wheel support can complete the landing. Contact with the
    // rider's center must never fabricate a grounded wheel catch.
    this.position.copy(sweep.candidate);
    if (sweep.wheelVerified && this.land(sweep.support)) return true;
    if (this.bailTime > 0) return true;

    // A rejected re-entry remains airborne. Resolve actual penetration along
    // the measured face while retaining ramp-tangent momentum. Stop steering
    // the following frame back into the same failed coping-return contact.
    const into = this.velocity.dot(sweep.hit.normal);
    if (into < 0) this.velocity.addScaledVector(sweep.hit.normal, -into);
    this.transitionAir = null;
    this.setMovementState(MOVEMENT_STATE.AIR);
    return true;
  }

  stepAir(dt, input, drive, before) {
    const activeAir = this.transitionAir;
    if (activeAir && !activeAir.transferring
      && this.transitions.requestTransfer(activeAir, input, this.velocity.y - PHYSICS.gravity * dt)) {
      this.prepareTransfer(activeAir, true);
    }
    super.stepAir(dt, input, drive, before);

    if (activeAir && !this.grounded && this.transitionAir === activeAir) {
      this.tryVerifiedDeckCatch(activeAir);
    }

    if (!activeAir || this.grounded || this.transitionAir !== activeAir) return;
    if (this.tryContinuousTransitionReentry(activeAir, before)) return;

    if (this.velocity.y > 0) return;
    if (!activeAir.exitControl?.geometryAware) return;

    const support = this.ensureBoardContact().snapToGround(
      this.position,
      this.heading,
      SAFE_COPING_EXIT.recoverySnapRise,
      SAFE_COPING_EXIT.recoverySnapDrop,
    );
    if (!support?.supported || support.position.distanceTo(this.position) > 0.18
      || !supportMatchesOriginalTransition(support, activeAir)) return;
    this.land(support);
  }
}
