import { FLIP_TIMING } from './TrickMotion.js';

export const PRESENTATION_STATES = Object.freeze({
  IDLE: 'IDLE', PUSH: 'PUSH', COAST: 'COAST', BRAKE: 'BRAKE', CROUCH: 'CROUCH', PUMP: 'PUMP',
  OLLIE_POP: 'OLLIE_POP', AIR: 'AIR', VERT_AIR: 'VERT_AIR', LAND: 'LAND', MANUAL: 'MANUAL',
  NOSE_MANUAL: 'NOSE_MANUAL', GRIND: 'GRIND', WALLRIDE: 'WALLRIDE', FLATLAND: 'FLATLAND', BAIL: 'BAIL',
});

export const FLIP_PHASES = Object.freeze({ POP: 'POP', FLICK: 'FLICK', ROTATION: 'ROTATION', CATCH: 'CATCH', LAND: 'LAND' });

export function flipPhaseFor(flipState) {
  if (!flipState) return null;
  const p = Math.max(0, Math.min(1, Number(flipState.progress) || 0));
  if (p < FLIP_TIMING.pop) return FLIP_PHASES.POP;
  if (p < FLIP_TIMING.flick) return FLIP_PHASES.FLICK;
  if (p < FLIP_TIMING.rotationEnd) return FLIP_PHASES.ROTATION;
  if (p < FLIP_TIMING.catchEnd) return FLIP_PHASES.CATCH;
  return FLIP_PHASES.LAND;
}

export function physicsMovementState(ctx) {
  if (ctx.bail) return 'BAIL';
  if (ctx.wallRide) return 'WALLRIDE';
  if (ctx.grind) return 'GRIND';
  if (ctx.manual) return ctx.manual === 'noseManual' ? 'NOSE_MANUAL' : 'MANUAL';
  if (!ctx.grounded) return ctx.vert ? 'VERT_AIR' : 'AIR';
  if (ctx.braking) return 'BRAKE';
  if (ctx.pushDemand) return 'PUSH';
  if (ctx.speed > 0.35) return 'COAST';
  return 'IDLE';
}

export function resolvePresentationState(ctx) {
  if (ctx.bail) return PRESENTATION_STATES.BAIL;
  if (ctx.wallRide) return PRESENTATION_STATES.WALLRIDE;
  if (ctx.grind) return PRESENTATION_STATES.GRIND;
  if (ctx.flatland) return PRESENTATION_STATES.FLATLAND;
  if (ctx.manual) return ctx.manual === 'noseManual' ? PRESENTATION_STATES.NOSE_MANUAL : PRESENTATION_STATES.MANUAL;
  if (ctx.landingActive && ctx.grounded) return PRESENTATION_STATES.LAND;
  if (ctx.pumpActive && ctx.grounded) return PRESENTATION_STATES.PUMP;
  if (ctx.charge > 0.04 && ctx.grounded) return PRESENTATION_STATES.CROUCH;
  if (ctx.popActive && !ctx.grounded) return PRESENTATION_STATES.OLLIE_POP;
  if (!ctx.grounded) return ctx.vert ? PRESENTATION_STATES.VERT_AIR : PRESENTATION_STATES.AIR;
  if (ctx.braking) return PRESENTATION_STATES.BRAKE;
  if (ctx.pushDemand) return PRESENTATION_STATES.PUSH;
  if (ctx.speed > 0.35) return PRESENTATION_STATES.COAST;
  return PRESENTATION_STATES.IDLE;
}

export function transitionFrequency(state) {
  switch (state) {
    case PRESENTATION_STATES.OLLIE_POP:
    case PRESENTATION_STATES.LAND:
    case PRESENTATION_STATES.BAIL:
      return 12;
    case PRESENTATION_STATES.PUSH:
    case PRESENTATION_STATES.BRAKE:
    case PRESENTATION_STATES.PUMP:
      return 9;
    case PRESENTATION_STATES.GRIND:
    case PRESENTATION_STATES.WALLRIDE:
    case PRESENTATION_STATES.FLATLAND:
      return 8;
    default:
      return 6;
  }
}

export function springStep(channel, target, frequency, dt) {
  const safeTarget = Number.isFinite(target) ? target : (Number.isFinite(channel.value) ? channel.value : 0);
  if (!Number.isFinite(channel.value)) channel.value = safeTarget;
  if (!Number.isFinite(channel.velocity)) channel.velocity = 0;
  const safeDt = Number.isFinite(dt) ? Math.max(0, Math.min(0.05, dt)) : 0;
  const omega = Math.max(0.01, Number.isFinite(frequency) ? frequency : 6) * Math.PI * 2;
  const x = omega * safeDt;
  const decay = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
  const change = channel.value - safeTarget;
  const temp = (channel.velocity + omega * change) * safeDt;
  channel.velocity = (channel.velocity - omega * temp) * decay;
  channel.value = safeTarget + (change + temp) * decay;
  if (!Number.isFinite(channel.value) || !Number.isFinite(channel.velocity)) {
    channel.value = safeTarget;
    channel.velocity = 0;
  }
  return channel.value;
}
