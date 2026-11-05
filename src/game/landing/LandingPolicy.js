export const LANDING_ROUTE = Object.freeze({
  STANDARD: 'standard',
  ORIGINAL_TRANSITION: 'originalTransition',
  ABORT_TO_RETURN: 'abortToReturn',
  REJECT_DECK_TARGET: 'rejectDeckTarget',
});

/**
 * Pure policy for the upper landing filters that currently live in separate
 * inheritance layers. Geometry tests remain outside this module; this function
 * only decides which route owns the touchdown after those tests have run.
 *
 * Priority is deliberate:
 * 1. verified contact with the original transition always wins;
 * 2. an explicit abort-to-return is treated as a transition return, not a deck transfer;
 * 3. a geometry-aware transfer may land only inside its authored deck target;
 * 4. everything else follows the normal landing chain.
 */
export function resolveLandingRoute({
  originalTransition = false,
  geometryAware = false,
  abortToReturn = false,
  deckTargetMatches = true,
} = {}) {
  if (originalTransition) return LANDING_ROUTE.ORIGINAL_TRANSITION;
  if (geometryAware && abortToReturn) return LANDING_ROUTE.ABORT_TO_RETURN;
  if (geometryAware && !deckTargetMatches) return LANDING_ROUTE.REJECT_DECK_TARGET;
  return LANDING_ROUTE.STANDARD;
}
