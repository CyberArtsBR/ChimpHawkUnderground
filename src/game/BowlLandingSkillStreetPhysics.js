import { StableBoardContactSkillStreetPhysics } from './StableBoardContactSkillStreetPhysics.js';
import { PHYSICS } from './StreetPhysics.js';
import { applyAcceptedLanding } from './core/LandingExecutor.js';
import {
  evaluateTransitionLanding,
  transitionAlignmentThreshold,
  transitionFlipLandingMode,
  transitionLandingSupportMode,
} from './core/LandingResult.js';

export {
  transitionAlignmentThreshold,
  transitionFlipLandingMode,
  transitionLandingSupportMode,
} from './core/LandingResult.js';

/**
 * Bowl/pool/ramp landing bridge.
 * Triangulated transitions often touch one wheel, then one truck, then all four.
 * Lock the first real swept wheel contact long enough for the contact rig to grow
 * support instead of rejecting it and letting the board cross the rideable mesh.
 */
export class BowlLandingSkillStreetPhysics extends StableBoardContactSkillStreetPhysics {
  reset(position = this.spawn, heading = 0) {
    super.reset(position, heading);
    this.transitionLandingGrace = 0;
  }

  takeoff(impulse = 0, transition = null) {
    this.transitionLandingGrace = 0;
    return super.takeoff(impulse, transition);
  }

  stepGround(dt, input, drive) {
    this.transitionLandingGrace = Math.max(0, (this.transitionLandingGrace || 0) - dt);
    super.stepGround(dt, input, drive);
  }

  land(support) {
    const landing = evaluateTransitionLanding({
      support,
      position: this.position,
      velocity: this.velocity,
      forward: this.forward,
      airTime: this.airTime,
      flipProgress: this.flipState?.progress ?? null,
      maxLandingCorrection: PHYSICS.maxLandingCorrection,
    });

    // Preserve legacy side-effect order: an eligible auto-catch completes the
    // flip before a separate alignment failure can still request a bail.
    if (landing.flipMode === 'autoCatch' && this.flipState) this.flipState.progress = 1;

    if (!landing.accepted) {
      if (landing.shouldBail) this.bail('BAIL · align your board before landing');
      return false;
    }

    return applyAcceptedLanding(this, support, landing, {
      partialGrace: 0.14,
      slopedGrace: 0.07,
    });
  }
}
