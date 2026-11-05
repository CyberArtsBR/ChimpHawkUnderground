/**
 * Phase 1 compatibility alias.
 *
 * This layer used to own a duplicate post-landing travel/fakie rewrite. That
 * authority moved to canonical TravelState and the override was removed. Keeping
 * an empty subclass would still add another prototype level to the runtime tower,
 * so old imports now resolve directly to RampWallSafetySkillStreetPhysics.
 */
export {
  RampWallSafetySkillStreetPhysics as IntegratedRampSafetySkillStreetPhysics,
} from './RampWallSafetySkillStreetPhysics.js';
