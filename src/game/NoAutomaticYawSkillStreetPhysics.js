import { UnifiedRampFeelSkillStreetPhysics } from './UnifiedRampFeelSkillStreetPhysics.js';
import { evaluateLandingYawInvariant } from './core/OrientationInvariant.js';

/**
 * Landing-yaw observability only.
 *
 * Contact geometry may correct position, surface normal, pitch/roll, velocity and
 * support state, but horizontal yaw belongs only to deliberate ground steering or
 * explicit airborne spin. Lower-layer automatic wall/coping/landing yaw writers
 * have been removed during Phase 1; this layer now measures the invariant instead
 * of owning gameplay behavior or silently repairing violations.
 */
export class NoAutomaticYawSkillStreetPhysics extends UnifiedRampFeelSkillStreetPhysics {
  reset(position = this.spawn, heading = 0) {
    super.reset(position, heading);
    this.landingYawInvariantViolations = 0;
    this.lastLandingYawInvariant = null;
  }

  /**
   * Observe, never repair. The final runtime can defer this hook to the explicit
   * LandingPostPipeline; direct subclass tests retain the same compatibility path.
   */
  land(support) {
    if (this.deferLandingPostHooks) return super.land(support);

    const playerHeading = this.heading;
    const landed = super.land(support);
    if (!landed) return false;

    const invariant = evaluateLandingYawInvariant({
      playerHeading,
      lowerLayerHeading: this.heading,
    });
    this.lastLandingYawInvariant = invariant;
    if (invariant.violated) this.landingYawInvariantViolations += 1;
    return true;
  }
}
