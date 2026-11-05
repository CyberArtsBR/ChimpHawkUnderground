import { wantsVertTransfer } from '../../input/InputInterpreter.js';

export const TRANSITION_INTENT = Object.freeze({
  bufferTime: 0.32,
  slopeY: 0.992,
  minRise: 0.06,
});

/**
 * Grounded transition intent is explicit only. Held forward is never an exit
 * command; Ctrl/L2 may arm the short buffer while actually climbing a slope.
 * Fresh Up taps remain a separate post-apex command handled by TransitionController.
 */
export function shouldArmTransitionExit({
  input = {},
  normalY = 1,
  verticalSpeed = 0,
  config = TRANSITION_INTENT,
} = {}) {
  return Boolean(
    wantsVertTransfer(input, { apexPassed: false })
    && Math.abs(Number(normalY) || 0) < config.slopeY
    && Number(verticalSpeed) > config.minRise
  );
}

export function advanceTransitionExitIntent({
  remaining = 0,
  dt = 0,
  input = {},
  normalY = 1,
  verticalSpeed = 0,
  config = TRANSITION_INTENT,
} = {}) {
  let next = Math.max(0, (Number(remaining) || 0) - Math.max(0, Number(dt) || 0));
  const justArmed = shouldArmTransitionExit({
    input,
    normalY,
    verticalSpeed,
    config,
  });
  if (justArmed) next = config.bufferTime;
  return Object.freeze({
    remaining: next,
    active: next > 0,
    justArmed,
  });
}

export function applyTransitionExitIntentToCandidate({
  controller,
  runtime,
  transition = null,
} = {}) {
  const active = Number(runtime?.rampExitIntentTime || 0) > 0;
  let edge = transition;
  if (active) {
    edge ||= controller?.transitions?.launchAt?.(
      runtime.position,
      runtime.normal,
      runtime.velocity,
    ) || null;
    if (edge) edge = { ...edge, exitRequested: true };
  }
  return Object.freeze({
    edge,
    exitRequested: Boolean(active && edge),
    consumed: active,
  });
}
