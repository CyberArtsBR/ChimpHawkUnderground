import { MathUtils } from 'three';

// Original procedural timings, shared by the deck and the rider. These are not
// imported animation clips or timings extracted from a commercial game's data.
const safe01 = value => MathUtils.clamp(Number.isFinite(value) ? value : 0, 0, 1);

export const FLIP_TIMING = Object.freeze({ pop: 0.14, flick: 0.34, rotationEnd: 0.82, catchEnd: 0.94 });

// Use the authored rotation, not the display name: 360 Flip is a kickflip
// family trick and Laser Flip is a heelflip family trick. Both names omit
// those words. Stance mirroring remains the rider's anatomical responsibility.
export function flipFlickOffset(flipState) {
  const roll = Number.isFinite(flipState?.roll) ? flipState.roll : 0;
  return roll < 0 ? -.19 : roll > 0 ? .22 : .06;
}

export function flipMotion(progress = 0) {
  const p = safe01(progress);
  const rotation = MathUtils.smoothstep(p, 0.12, FLIP_TIMING.rotationEnd);
  const lift = MathUtils.smoothstep(p, 0, FLIP_TIMING.flick);
  const catchWeight = MathUtils.smoothstep(p, FLIP_TIMING.rotationEnd, FLIP_TIMING.catchEnd);
  const clearance = lift * (1 - catchWeight);
  const flick = MathUtils.smoothstep(p, FLIP_TIMING.pop, FLIP_TIMING.flick)
    * (1 - MathUtils.smoothstep(p, 0.56, FLIP_TIMING.rotationEnd));
  // Tail foot snaps up first; front foot drags then flicks. Both tuck clear of
  // the spinning deck and return only after its rotation is complete.
  const rearLift = MathUtils.smoothstep(p, .04, .25) * (1 - catchWeight) * .23;
  const frontLift = lift * (1 - catchWeight) * .27;
  return { rotation, clearance, footLift: clearance * 0.22, frontLift, rearLift, flick, catchWeight };
}

export function flipTurns(flipState) {
  const progress = safe01(flipState?.progress);
  const rotation = flipMotion(progress).rotation;
  const start = flipState?.rotationStartProgress;
  const upgrading = Number.isFinite(start) && flipState?.rotationFrom;
  const blend = upgrading
    ? MathUtils.smoothstep(progress, start, Math.max(start + 0.01, FLIP_TIMING.rotationEnd))
    : rotation;
  const turns = {};
  for (const axis of ['pitch', 'yaw', 'roll']) {
    const startTurn = upgrading && Number.isFinite(flipState.rotationFrom[axis]) ? flipState.rotationFrom[axis] : 0;
    const finalTurn = Number.isFinite(flipState?.[axis]) ? flipState[axis] : 0;
    turns[axis] = MathUtils.lerp(startTurn, finalTurn, blend);
  }
  // A hardflip's nose-up accent is temporary. Ending with a fractional pitch
  // turn left the deck upside down during the catch and snapped it back later.
  const pitchArc = Number.isFinite(flipState?.pitchArc) ? flipState.pitchArc : 0;
  const arc = rotation > 0 && rotation < 1 ? Math.sin(Math.PI * rotation) ** 2 : 0;
  turns.pitch += pitchArc * arc * (upgrading ? blend : 1);
  return turns;
}

// Reference: Nollie Skateboarding's Backfoot Impossible breakdown (2025-10-19):
// pressure around the rear foot, front foot lifted clear, then catch. The
// rotation stays authored by flipTurns; this is a shared visual contact pivot.
export function impossibleMotion(flipState, stance = 1) {
  if (!flipState || !Number.isFinite(flipState.pitch) || Math.abs(flipState.pitch) < .99
    || flipState.roll || flipState.yaw) return null;
  const p = safe01(flipState.progress), motion = flipMotion(p);
  const weight = MathUtils.smoothstep(p, .08, .25) * (1 - MathUtils.smoothstep(p, .72, .84));
  return { weight, pivotZ: (stance < 0 ? -1 : 1) * .20,
    lift: motion.rearLift, frontLift: motion.frontLift + .08 * weight,
    anklePitch: Math.sin(flipTurns(flipState).pitch * Math.PI * 2) * .32 * weight };
}

export function grindWeightShift(name, balance = 0, weight = 1) {
  const w = safe01(weight), b = MathUtils.clamp(Number(balance) || 0, -1, 1);
  const nose = ['Nosegrind', 'Noseslide', 'Crook', 'Overcrook'].includes(name);
  const tail = ['5-0', 'Tailslide', 'Smith', 'Feeble'].includes(name);
  return { foreAft: (nose ? -.045 : tail ? .045 : 0) * w,
    lateral: b * .035 * w, compression: (.08 + Math.abs(b) * .04) * w };
}

// Original key poses: lift off the deck, reach beside it, drive backwards,
// roll off the toe, then recover above the deck. Values are in the rider frame.
const PUSH_KEYS = [
  // phase, side, lift, fore/aft, ground contact, ankle pitch, arm swing
  [0,    0,    0,     0,     0,  0,     0],
  [.14,  .18,  .045, -.22,   0, -.12,  -.55],
  [.26,  .23,  0,    -.24,   1,  0,    -.7],
  [.56,  .23,  0,     .27,   1,  0,     .8],
  [.68,  .21,  .09,   .34,   0,  .34,   .55],
  [.86,  .10,  .14,   .11,   0,  .12,  -.2],
  [1,    0,    0,     0,     0,  0,     0],
];

export function pushMotion(phase = 0) {
  const finitePhase = Number.isFinite(phase) ? phase : 0;
  const p = ((finitePhase % 1) + 1) % 1;
  const next = PUSH_KEYS.findIndex(key => key[0] > p);
  const from = PUSH_KEYS[next - 1], to = PUSH_KEYS[next];
  const t = MathUtils.smoothstep(p, from[0], to[0]);
  const mix = column => MathUtils.lerp(from[column], to[column], t);
  const contact = mix(4);
  return {
    side: mix(1), lift: mix(2), height: mix(2) - .14 * contact,
    foreAft: mix(3), anklePitch: mix(5), armSwing: mix(6),
    weightShift: MathUtils.smoothstep(p, 0, .16) * (1 - MathUtils.smoothstep(p, .72, 1)),
    contact,
  };
}

export function popMotion(progress = 1) {
  const p = safe01(progress);
  return -.36 * MathUtils.smoothstep(p, 0, .22) * (1 - MathUtils.smoothstep(p, .28, 1));
}

export function landingMotion(progress = 1) {
  const p = safe01(progress);
  // Begin absorbing the contact immediately, reach deepest bend quickly, then
  // recover over most of the landing. Never carry compression after the timer.
  if (p >= 1) return 0;
  return (0.38 + 0.62 * MathUtils.smoothstep(p, 0, 0.20))
    * (1 - MathUtils.smoothstep(p, 0.20, 1));
}

export const GRAB_POSES = Object.freeze({
  Indy: [-0.12, 0, 0.12], Melon: [-0.16, 0, -0.14],
  Nosegrab: [0.23, 0, 0], Tailgrab: [-0.23, 0, 0],
  Japan: [-0.18, 0.12, -0.28], Madonna: [0.18, -0.08, 0.12],
  Benihana: [-0.22, 0.1, 0.1], Airwalk: [0.08, 0, 0],
  Method: [-0.32, 0.18, -0.42], Stalefish: [-0.18, -0.18, -0.20],
  'Rocket Air': [0.48, 0, 0], Seatbelt: [-0.28, 0.24, 0.16],
  Mute: [-0.18, 0.12, 0.22], Judo: [0.20, -0.12, -0.16],
  Crail: [0.26, -0.24, 0.12], 'Christ Air': [0.12, 0, 0.15],
});
