/** Opaque deck emission independent from global bloom and wheel boost. */
export const DECK_BASE_EMISSION = 0.75;
export const DECK_MAX_EMISSION = 0.95;
export function deckEmissionForGlow(glowAmount = 0) {
  const t = Math.max(0, Math.min(1, Number(glowAmount) || 0));
  return DECK_BASE_EMISSION + (DECK_MAX_EMISSION - DECK_BASE_EMISSION) * t;
}
