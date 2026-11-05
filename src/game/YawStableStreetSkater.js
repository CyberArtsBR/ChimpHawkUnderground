import { StreetSkater } from './StreetSkater.js';

export { yawStableSurfaceBasis } from './core/PresentationOrientation.js';

/**
 * Phase 1 compatibility alias.
 *
 * Coping-safe presentation orientation now lives directly in StreetSkater, and
 * canonical PlayerState / TransitionController instances are owned by
 * CoreSkateController. Keeping a subclass here would recreate duplicate services
 * and add a dead runtime prototype level.
 */
export { StreetSkater as YawStableStreetSkater };
