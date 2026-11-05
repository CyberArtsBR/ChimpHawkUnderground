// Rider motion curves and key poses, ported from v1 (TrickMotion.js,
// HalfPipePose.js, ApprovedBalancePose.js, UnrealRider.grabTarget). Pure
// functions in the board frame: +X rider's front (toe side), +Y up, -Z nose
// for a regular stance. Distances are for a v1-sized rider and get scaled.
//
// Pushing is intentionally not animated: the owner switched it off in v1.

const clamp01 = (v: number) => Math.min(1, Math.max(0, Number(v) || 0));
const smooth = (v: number) => { const t = clamp01(v); return t * t * (3 - 2 * t); };
const smoothstep = (x: number, a: number, b: number) => smooth((x - a) / (b - a));

export const FLIP_TIMING = { pop: 0.14, flick: 0.34, rotationEnd: 0.82, catchEnd: 0.94 } as const;

export interface FlipMotion { rotation: number; clearance: number; footLift: number; frontLift: number; rearLift: number; flick: number; catchWeight: number }

/** Foot and board timing through a flip: pop, flick, spin, catch (v1 flipMotion). */
export function flipMotion(progress: number): FlipMotion {
  const p = clamp01(progress);
  const rotation = smoothstep(p, 0.12, FLIP_TIMING.rotationEnd);
  const lift = smoothstep(p, 0, FLIP_TIMING.flick);
  const catchWeight = smoothstep(p, FLIP_TIMING.rotationEnd, FLIP_TIMING.catchEnd);
  const clearance = lift * (1 - catchWeight);
  const flick = smoothstep(p, FLIP_TIMING.pop, FLIP_TIMING.flick) * (1 - smoothstep(p, 0.56, FLIP_TIMING.rotationEnd));
  const rearLift = smoothstep(p, 0.04, 0.25) * (1 - catchWeight) * 0.23;
  const frontLift = lift * (1 - catchWeight) * 0.27;
  return { rotation, clearance, footLift: clearance * 0.22, frontLift, rearLift, flick, catchWeight };
}

/** Sideways flick of the front foot: heelflips go to the heel side, kickflips to the toe side. */
export function flipFlick(name: string): number {
  if (/Heel|Laser/i.test(name)) return -0.16;
  if (/Kick|Hard|Varial|360 Flip/i.test(name)) return 0.18;
  return 0.08;
}

/** Leg compression (0 standing … 1 fully tucked), v1 halfPipePose. */
export function compression({ charge = 0, air = 0, vert = false, verticalVelocity = 0, landing = 0, speed = 0, grab = 0, airTime = 0 }: {
  charge?: number; air?: number; vert?: boolean; verticalVelocity?: number; landing?: number; speed?: number; grab?: number; airTime?: number;
}): { value: number; response: number } {
  const airborne = clamp01(air);
  const anticipation = smooth(-verticalVelocity / (vert ? 11 : 8));
  const preload = 0.12 + 0.12 * clamp01(speed);
  const tucked = vert ? 0.9 : 0.82;
  const gather = smooth((airTime - 0.045) / 0.2);
  const flight = 0.3 + gather * (tucked - 0.3) - anticipation * (vert ? 0.22 : 0.3) * gather;
  const value = clamp01(Math.max(preload + smooth(charge) * (1 - preload), flight * airborne, clamp01(grab) * 0.86, preload + clamp01(landing) * 0.68));
  return { value, response: landing > 0.05 ? 13 : charge > 0 || airborne > 0.1 ? 15 : 9 };
}

/** Weight over the nose or tail on grinds, plus balance lean (v1 grindWeightShift). */
export function grindShift(name: string | null, balance: number): { foreAft: number; lateral: number; compression: number } {
  if (!name) return { foreAft: 0, lateral: 0, compression: 0 };
  const b = Math.max(-1, Math.min(1, balance || 0));
  const nose = ['Nosegrind', 'Noseslide', 'Crook', 'Overcrook'].includes(name);
  const tail = ['5-0', 'Tailslide', 'Smith', 'Feeble'].includes(name);
  return { foreAft: nose ? -0.045 : tail ? 0.045 : 0, lateral: b * 0.035, compression: 0.08 + Math.abs(b) * 0.04 };
}

type Side = 'front' | 'rear';
export interface GrabReach { side: Side | 'both'; x: number; y: number; z: number }

/**
 * Which hand grabs where on the deck (v1 UnrealRider.grabTarget). x across the
 * deck in units of a 0.42 m deck width (±0.14 = rail), z along it in units of
 * a 1.1 m deck (-0.43 = nose). Switch stance mirrors z.
 */
export const GRAB_REACH: Record<string, GrabReach> = {
  Indy: { side: 'rear', x: 0.14, y: 0.04, z: 0 },
  Melon: { side: 'front', x: -0.14, y: 0.04, z: 0 },
  Nosegrab: { side: 'front', x: 0, y: 0.05, z: -0.43 },
  Tailgrab: { side: 'rear', x: 0, y: 0.05, z: 0.43 },
  Japan: { side: 'front', x: -0.14, y: 0.04, z: -0.04 },
  Madonna: { side: 'front', x: 0.08, y: 0.05, z: -0.43 },
  Benihana: { side: 'rear', x: 0.08, y: 0.05, z: 0.35 },
  Method: { side: 'front', x: -0.14, y: 0.04, z: 0.08 },
  Stalefish: { side: 'rear', x: -0.14, y: 0.04, z: 0.16 },
  'Rocket Air': { side: 'both', x: 0.09, y: 0.05, z: -0.41 },
  Seatbelt: { side: 'front', x: 0.08, y: 0.05, z: 0.4 },
  Mute: { side: 'front', x: 0.14, y: 0.04, z: -0.04 },
  Judo: { side: 'front', x: 0, y: 0.05, z: -0.4 },
  Crail: { side: 'rear', x: 0, y: 0.05, z: -0.4 },
  'Christ Air': { side: 'front', x: -0.14, y: 0.04, z: 0 },
  Airwalk: { side: 'front', x: 0, y: 0.05, z: -0.35 },
};

export interface FootOffset { x: number; y: number; z: number }
/** Named grab foot moves in v1 (one-foot and no-foot grabs), regular stance; mirror x for switch. */
export function grabFeet(name: string): { front: FootOffset; rear: FootOffset } {
  const zero = () => ({ x: 0, y: 0, z: 0 });
  const front = zero(), rear = zero();
  switch (name) {
    case 'Japan': rear.y = 0.2; rear.x = 0.12; break;
    case 'Madonna': rear.y = 0.22; rear.z = 0.2; break;
    case 'Benihana': front.y = 0.32; front.z = -0.28; break;
    case 'Judo': rear.y = 0.22; rear.x = 0.36; rear.z = -0.18; break;
    case 'Rocket Air': rear.z = -0.18; front.z = -0.08; break;
    case 'Christ Air': front.y = rear.y = 0.24; front.x = -0.32; rear.x = 0.32; front.z = -0.2; rear.z = 0.2; break;
    case 'Airwalk': front.y = rear.y = 0.28; front.x = -0.2; rear.x = 0.2; front.z = -0.13; rear.z = 0.13; break;
    default: break;
  }
  return { front, rear };
}

/** Critically-damped spring toward a target (v1 springStep feel). */
export function spring(state: { value: number; velocity: number }, target: number, frequency: number, dt: number): number {
  const omega = frequency;
  const x = state.value - target;
  const exp = Math.exp(-omega * dt);
  const v = state.velocity;
  state.value = target + (x + (v + omega * x) * dt) * exp;
  state.velocity = (v - omega * (v + omega * x) * dt) * exp;
  return state.value;
}
