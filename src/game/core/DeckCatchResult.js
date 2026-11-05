export const DECK_CATCH_REASON = Object.freeze({
  INACTIVE: 'inactive',
  ASCENDING: 'ascending',
  OUT_OF_RANGE: 'out-of-range',
  ELIGIBLE: 'eligible',
});

/**
 * Pure verified-deck catch window.
 *
 * Geometry evidence (targetPoint / geometryAware corridor) is authored by the
 * transfer/deck scan path. This result only decides whether the airborne board is
 * close enough for one short support probe. It never mutates position, velocity,
 * heading, transition state or contacts.
 */
export function evaluateDeckCatch({
  transitionAir = null,
  position = null,
  velocity = null,
  catchHorizontalRadius = 0.52,
  catchVerticalWindow = 0.46,
} = {}) {
  const control = transitionAir?.exitControl;
  if (!transitionAir || !control?.geometryAware || control.abortToReturn || !control.targetPoint) {
    return Object.freeze({
      eligible: false,
      reason: DECK_CATCH_REASON.INACTIVE,
      horizontalError: Infinity,
      verticalAboveDeck: Infinity,
    });
  }

  if ((Number(velocity?.y) || 0) > 0) {
    return Object.freeze({
      eligible: false,
      reason: DECK_CATCH_REASON.ASCENDING,
      horizontalError: Infinity,
      verticalAboveDeck: Infinity,
    });
  }

  if (!position?.clone || !control.targetPoint?.clone) {
    return Object.freeze({
      eligible: false,
      reason: DECK_CATCH_REASON.INACTIVE,
      horizontalError: Infinity,
      verticalAboveDeck: Infinity,
    });
  }

  const delta = control.targetPoint.clone().sub(position);
  delta.y = 0;
  const horizontalError = delta.length();
  const verticalAboveDeck = position.y - control.targetPoint.y;
  const eligible = horizontalError <= catchHorizontalRadius
    && verticalAboveDeck >= -0.08
    && verticalAboveDeck <= catchVerticalWindow;

  return Object.freeze({
    eligible,
    reason: eligible ? DECK_CATCH_REASON.ELIGIBLE : DECK_CATCH_REASON.OUT_OF_RANGE,
    horizontalError,
    verticalAboveDeck,
  });
}
