// Trick data, ported from v1's TrickCatalog. Pure data: the skater reads it,
// nothing here knows about physics or rendering.

export type Dir = 'none' | 'left' | 'right' | 'up' | 'down' | 'upLeft' | 'upRight' | 'downLeft' | 'downRight';

export interface FlipTrick { name: string; points: number; roll: number; pitch: number; yaw: number; duration: number }
export interface Trick { name: string; points: number }
export interface ManualTrick extends Trick { pitch: number; difficulty: number }

export function directionKey(steer = 0, drive = 0, threshold = 0.32): Dir {
  const x = Math.abs(steer) >= threshold ? Math.sign(steer) : 0;
  const y = Math.abs(drive) >= threshold ? Math.sign(drive) : 0;
  if (x < 0 && y > 0) return 'upLeft';
  if (x > 0 && y > 0) return 'upRight';
  if (x < 0 && y < 0) return 'downLeft';
  if (x > 0 && y < 0) return 'downRight';
  if (x < 0) return 'left';
  if (x > 0) return 'right';
  if (y > 0) return 'up';
  if (y < 0) return 'down';
  return 'none';
}

export const FLIP_TRICKS: Readonly<Record<Dir, FlipTrick>> = {
  none: { name: 'Kickflip', points: 100, roll: 1, pitch: 0, yaw: 0, duration: 0.42 },
  left: { name: 'Kickflip', points: 100, roll: 1, pitch: 0, yaw: 0, duration: 0.42 },
  right: { name: 'Heelflip', points: 120, roll: -1, pitch: 0, yaw: 0, duration: 0.44 },
  up: { name: 'Impossible', points: 250, roll: 0, pitch: 1, yaw: 0, duration: 0.55 },
  down: { name: 'Pop Shove-It', points: 150, roll: 0, pitch: 0, yaw: 0.5, duration: 0.43 },
  upLeft: { name: 'Hardflip', points: 300, roll: 1, pitch: 0, yaw: -0.5, duration: 0.40 },
  upRight: { name: 'Inward Heelflip', points: 325, roll: -1, pitch: 0, yaw: 0.5, duration: 0.6 },
  downLeft: { name: 'Varial Kickflip', points: 250, roll: 1, pitch: 0, yaw: 0.5, duration: 0.54 },
  downRight: { name: 'Varial Heelflip', points: 275, roll: -1, pitch: 0, yaw: -0.5, duration: 0.56 },
};

/** A second press of flip during the same flip upgrades it (v1 double-tap rule). */
export const DOUBLE_FLIP_TRICKS: Readonly<Record<string, FlipTrick>> = {
  Kickflip: { name: 'Double Kickflip', points: 250, roll: 2, pitch: 0, yaw: 0, duration: 0.66 },
  Heelflip: { name: 'Double Heelflip', points: 275, roll: -2, pitch: 0, yaw: 0, duration: 0.68 },
  Impossible: { name: 'Double Impossible', points: 550, roll: 0, pitch: 2, yaw: 0, duration: 0.78 },
  'Pop Shove-It': { name: '360 Shove-It', points: 350, roll: 0, pitch: 0, yaw: 1, duration: 0.60 },
  Hardflip: { name: 'Double Hardflip', points: 650, roll: 2, pitch: 0, yaw: -0.5, duration: 0.56 },
  'Inward Heelflip': { name: 'Double Inward Heelflip', points: 675, roll: -2, pitch: 0, yaw: 0.5, duration: 0.80 },
  'Varial Kickflip': { name: '360 Flip', points: 500, roll: 1, pitch: 0, yaw: 1, duration: 0.70 },
  'Varial Heelflip': { name: 'Laser Flip', points: 550, roll: -1, pitch: 0, yaw: -1, duration: 0.72 },
  'Double Kickflip': { name: 'Triple Kickflip', points: 600, roll: 3, pitch: 0, yaw: 0, duration: 0.86 },
  'Double Heelflip': { name: 'Triple Heelflip', points: 625, roll: -3, pitch: 0, yaw: 0, duration: 0.88 },
};

export const GRAB_TRICKS: Readonly<Record<Dir, Trick>> = {
  none: { name: 'Indy', points: 100 },
  left: { name: 'Melon', points: 150 },
  right: { name: 'Indy', points: 100 },
  up: { name: 'Nosegrab', points: 175 },
  down: { name: 'Tailgrab', points: 175 },
  upLeft: { name: 'Japan', points: 250 },
  upRight: { name: 'Madonna', points: 275 },
  downLeft: { name: 'Benihana', points: 300 },
  downRight: { name: 'Airwalk', points: 300 },
};

export const DOUBLE_GRAB_TRICKS: Readonly<Record<string, Trick>> = {
  Melon: { name: 'Method', points: 350 },
  Indy: { name: 'Stalefish', points: 350 },
  Nosegrab: { name: 'Rocket Air', points: 450 },
  Tailgrab: { name: 'Seatbelt', points: 400 },
  Japan: { name: 'Mute', points: 325 },
  Madonna: { name: 'Judo', points: 450 },
  Benihana: { name: 'Crail', points: 425 },
  Airwalk: { name: 'Christ Air', points: 600 },
};

export const GRIND_TRICKS: Readonly<Record<Dir, Trick>> = {
  none: { name: '50-50', points: 150 },
  left: { name: 'Noseslide', points: 175 },
  right: { name: 'Tailslide', points: 175 },
  up: { name: 'Nosegrind', points: 200 },
  down: { name: '5-0', points: 200 },
  upLeft: { name: 'Overcrook', points: 300 },
  upRight: { name: 'Crook', points: 275 },
  downLeft: { name: 'Feeble', points: 250 },
  downRight: { name: 'Smith', points: 250 },
};

export const BOARDSLIDE: Trick = { name: 'Boardslide', points: 190 };

export const MANUALS: Readonly<Record<'manual' | 'noseManual', ManualTrick>> = {
  manual: { name: 'Manual', points: 100, pitch: -0.16, difficulty: 1.0 },
  noseManual: { name: 'Nose Manual', points: 100, pitch: 0.16, difficulty: 1.06 },
};

export const OLLIE: Trick = { name: 'Ollie', points: 50 };
export const WALLRIDE: Trick = { name: 'Wallride', points: 200 };

/** Spin names by half-turns completed (180, 360, 540 …). */
export function spinName(halfTurns: number): string | null {
  return halfTurns >= 1 ? `${halfTurns * 180}` : null;
}
