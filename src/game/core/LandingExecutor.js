import { MOVEMENT_STATE } from '../StreetPhysics.js';

export const LANDING_VELOCITY_MODE = Object.freeze({
  PLANAR: 'planar',
  DECK_SIGNED: 'deckSigned',
});

/**
 * Apply one already-accepted LandingResult to the legacy runtime.
 *
 * Evaluation owns contact geometry and safety. This executor owns the common
 * state mutation after acceptance. Small explicit options preserve validated
 * differences between the old stable/base and transition landing paths without
 * duplicating the whole `land()` body again.
 *
 * IMPORTANT: boardForward is alignment-validation data only. Contact may tilt
 * pitch/roll through the support normal, but horizontal yaw remains exactly
 * player-authored.
 */
export function applyAcceptedLanding(controller, support, landing, {
  partialGrace = 0.14,
  slopedGrace = 0.07,
  applySpinStance = true,
  manageLandingGrace = true,
  velocityMode = LANDING_VELOCITY_MODE.PLANAR,
} = {}) {
  if (!controller || !support || !landing?.accepted) return false;

  const {
    partialTouchdown,
    boardForward,
    planarVelocity,
    planarSpeed,
    alignment = 1,
  } = landing;
  if (!boardForward || !planarVelocity || !Number.isFinite(planarSpeed)) return false;

  const halfTurns = Math.floor((Math.abs(Number(controller.airSpin) || 0) * 180 / Math.PI + 25) / 180);
  const spin = halfTurns * 180;
  const preservedHeading = controller.heading;

  controller.position.copy(support.position);
  controller.normal.copy(support.normal);
  controller.heading = preservedHeading;
  controller.groundDirection();

  if (spin >= 180) controller.recordTrick(`${spin}°`, spin);
  if (applySpinStance && halfTurns % 2 === 1) controller.stance *= -1;

  controller.setMovementState(MOVEMENT_STATE.GROUND);
  controller.coyote = 0;
  controller.justLanded = true;
  controller.transitionAir = null;
  controller.wallRide = null;
  controller.lastWheelSupport = support;
  if (manageLandingGrace) {
    controller.transitionLandingGrace = partialTouchdown
      ? partialGrace
      : (Math.abs(support.normal.y) < 0.995 ? slopedGrace : 0);
  }

  if (planarSpeed > 0.0001) {
    if (velocityMode === LANDING_VELOCITY_MODE.DECK_SIGNED) {
      const travelSign = planarSpeed > 0.18 && alignment < 0 ? -1 : 1;
      controller.velocity.copy(controller.forward).multiplyScalar(planarSpeed * travelSign);
    } else {
      controller.velocity.copy(planarVelocity);
    }
  } else {
    controller.velocity.set(0, 0, 0);
  }

  // Auto-catches can clear a flip between render frames. Preserve its completed
  // decorative orientation so a caught shove-it does not unwind on the deck.
  if(controller.flipState)controller.lastCaughtFlip={...controller.flipState,progress:1};
  controller.flipState = null;
  controller.grabState = null;
  controller.airSpin = 0;
  controller.stableGroundTime = 0;
  return true;
}
