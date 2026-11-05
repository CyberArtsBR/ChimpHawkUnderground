export const OLLIE_COMMAND = Object.freeze({
  NONE: 'NONE',
  GRIND_OLLIE_OUT: 'GRIND_OLLIE_OUT',
  VERT_OLLIE: 'VERT_OLLIE',
  PUMP: 'PUMP',
  PUMP_BLOCKED: 'PUMP_BLOCKED',
  OLLIE: 'OLLIE',
  AIR_RELEASE: 'AIR_RELEASE',
});

/** Deliberate current-frame air rotation input; no smoothed runtime steer state. */
export function interpretAirTurn(input = {}) {
  const steer = Number(input.steer) || 0;
  const spin = Number(input.spin) || 0;
  // Shoulder rotation owns the turn while held. A directional trick input must
  // not cancel it or double the spin speed.
  return Math.max(-1, Math.min(1, Math.abs(spin) > 0.1 ? spin : steer));
}

/** Held forward is approach/trick input. Only a new post-apex tap requests exit. */
export function wantsVertTransfer(input = {}, { apexPassed = false } = {}) {
  return Boolean(input.vertExit || (apexPassed && input.directionTaps?.includes?.('up')));
}

/**
 * Canonical semantic interpretation for one Ollie-button release.
 *
 * This module deliberately decides WHAT the input means but performs no physics.
 * Execution stays in the owning controller until Phase 1 has replay parity for
 * each command. Keeping interpretation pure makes priority rules testable and
 * prevents the same physical button from being independently reinterpreted by
 * grind, pump and jump layers.
 */
export function interpretOllieRelease({
  ollieReleased = false,
  grinding = false,
  grounded = false,
  nearCoping = false,
  pumpEligible = false,
  pumpHoldTime = 0,
  pumpCooldown = 0,
  pumpMinHold = 0.075,
} = {}) {
  if (!ollieReleased) return OLLIE_COMMAND.NONE;

  // A rail owns the release first: this is an Ollie Out, never a pump or ground ollie.
  if (grinding) return OLLIE_COMMAND.GRIND_OLLIE_OUT;

  // Authored coping has priority over pumping so a charged release cannot steal
  // a vert ollie immediately before the lip.
  if (grounded && nearCoping) return OLLIE_COMMAND.VERT_OLLIE;

  if (grounded && pumpEligible && pumpHoldTime >= pumpMinHold) {
    return pumpCooldown <= 0
      ? OLLIE_COMMAND.PUMP
      : OLLIE_COMMAND.PUMP_BLOCKED;
  }

  return grounded ? OLLIE_COMMAND.OLLIE : OLLIE_COMMAND.AIR_RELEASE;
}
