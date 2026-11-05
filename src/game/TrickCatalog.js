import { grindProfile } from './SkateSystems.js';

export const DIR = Object.freeze({
  NONE: 'none', LEFT: 'left', RIGHT: 'right', UP: 'up', DOWN: 'down',
  UP_LEFT: 'upLeft', UP_RIGHT: 'upRight', DOWN_LEFT: 'downLeft', DOWN_RIGHT: 'downRight',
});

export function directionKey(steer = 0, drive = 0, threshold = 0.32) {
  const x = Math.abs(steer) >= threshold ? Math.sign(steer) : 0;
  const y = Math.abs(drive) >= threshold ? Math.sign(drive) : 0;
  if (x < 0 && y > 0) return DIR.UP_LEFT;
  if (x > 0 && y > 0) return DIR.UP_RIGHT;
  if (x < 0 && y < 0) return DIR.DOWN_LEFT;
  if (x > 0 && y < 0) return DIR.DOWN_RIGHT;
  if (x < 0) return DIR.LEFT;
  if (x > 0) return DIR.RIGHT;
  if (y > 0) return DIR.UP;
  if (y < 0) return DIR.DOWN;
  return DIR.NONE;
}

export const FLIP_TRICKS = Object.freeze({
  [DIR.NONE]:       { name: 'Kickflip', points: 100, roll: 1, pitch: 0, yaw: 0, duration: 0.42 },
  [DIR.LEFT]:       { name: 'Kickflip', points: 100, roll: 1, pitch: 0, yaw: 0, duration: 0.42 },
  [DIR.RIGHT]:      { name: 'Heelflip', points: 120, roll: -1, pitch: 0, yaw: 0, duration: 0.44 },
  [DIR.UP]:         { name: 'Impossible', points: 250, roll: 0, pitch: 1, yaw: 0, duration: 0.55 },
  [DIR.DOWN]:       { name: 'Pop Shove-It', points: 150, roll: 0, pitch: 0, yaw: 0.5, duration: 0.43 },
  [DIR.UP_LEFT]:    { name: 'Hardflip', points: 300, roll: 1, pitch: 0, pitchArc: 0.22, yaw: -0.5, duration: 0.40 },
  [DIR.UP_RIGHT]:   { name: 'Inward Heelflip', points: 325, roll: -1, pitch: 0, pitchArc: 0.22, yaw: 0.5, duration: 0.6 },
  [DIR.DOWN_LEFT]:  { name: 'Varial Kickflip', points: 250, roll: 1, pitch: 0, yaw: 0.5, duration: 0.54 },
  [DIR.DOWN_RIGHT]: { name: 'Varial Heelflip', points: 275, roll: -1, pitch: 0, yaw: -0.5, duration: 0.56 },
});

// Double taps extend the matching flip; a different direction queues a new trick.
export const DOUBLE_FLIP_TRICKS = Object.freeze({
  Kickflip: { name: 'Double Kickflip', points: 250, roll: 2, pitch: 0, yaw: 0, duration: 0.66 },
  Heelflip: { name: 'Double Heelflip', points: 275, roll: -2, pitch: 0, yaw: 0, duration: 0.68 },
  Impossible: { name: 'Double Impossible', points: 550, roll: 0, pitch: 2, yaw: 0, duration: 0.78 },
  'Pop Shove-It': { name: '360 Shove-It', points: 350, roll: 0, pitch: 0, yaw: 1, duration: 0.60 },
  Hardflip: { name: 'Double Hardflip', points: 650, roll: 2, pitch: 0, pitchArc: 0.22, yaw: -0.5, duration: 0.56 },
  'Inward Heelflip': { name: 'Double Inward Heelflip', points: 675, roll: -2, pitch: 0, pitchArc: 0.22, yaw: 0.5, duration: 0.80 },
  'Varial Kickflip': { name: '360 Flip', points: 500, roll: 1, pitch: 0, yaw: 1, duration: 0.70 },
  'Varial Heelflip': { name: 'Laser Flip', points: 550, roll: -1, pitch: 0, yaw: -1, duration: 0.72 },
  'Double Kickflip': { name: 'Triple Kickflip', points: 600, roll: 3, pitch: 0, yaw: 0, duration: 0.86 },
  'Double Heelflip': { name: 'Triple Heelflip', points: 625, roll: -3, pitch: 0, yaw: 0, duration: 0.88 },
});

export const GRAB_TRICKS = Object.freeze({
  [DIR.NONE]:       { name: 'Indy', points: 100 },
  [DIR.LEFT]:       { name: 'Melon', points: 150 },
  [DIR.RIGHT]:      { name: 'Indy', points: 100 },
  [DIR.UP]:         { name: 'Nosegrab', points: 175 },
  [DIR.DOWN]:       { name: 'Tailgrab', points: 175 },
  [DIR.UP_LEFT]:    { name: 'Japan', points: 250 },
  [DIR.UP_RIGHT]:   { name: 'Madonna', points: 275 },
  [DIR.DOWN_LEFT]:  { name: 'Benihana', points: 300 },
  [DIR.DOWN_RIGHT]: { name: 'Airwalk', points: 300 },
});

export const GRIND_TRICKS = Object.freeze({
  [DIR.NONE]:       { name: '50-50', points: 150 },
  [DIR.LEFT]:       { name: 'Noseslide', points: 175 },
  [DIR.RIGHT]:      { name: 'Tailslide', points: 175 },
  [DIR.UP]:         { name: 'Nosegrind', points: 200 },
  [DIR.DOWN]:       { name: '5-0', points: 200 },
  [DIR.UP_LEFT]:    { name: 'Overcrook', points: 300 },
  [DIR.UP_RIGHT]:   { name: 'Crook', points: 275 },
  [DIR.DOWN_LEFT]:  { name: 'Feeble', points: 250 },
  [DIR.DOWN_RIGHT]: { name: 'Smith', points: 250 },
});

export const BOARDSLIDE = Object.freeze({ name: 'Boardslide', points: 190 });

export const DOUBLE_GRAB_TRICKS = Object.freeze({
  Melon: { name: 'Method', points: 350 },
  Indy: { name: 'Stalefish', points: 350 },
  Nosegrab: { name: 'Rocket Air', points: 450 },
  Tailgrab: { name: 'Seatbelt', points: 400 },
  Japan: { name: 'Mute', points: 325 },
  Madonna: { name: 'Judo', points: 450 },
  Benihana: { name: 'Crail', points: 425 },
  Airwalk: { name: 'Christ Air', points: 600 },
});

export const DOUBLE_GRIND_TRICKS = Object.freeze({
  '50-50': { name: 'Lipslide', points: 300 },
  Boardslide: { name: 'Lipslide', points: 300 },
  Noseslide: { name: 'Noseblunt', points: 450 },
  Tailslide: { name: 'Bluntslide', points: 450 },
  Nosegrind: { name: 'Hurricane', points: 500 },
  '5-0': { name: 'Salad', points: 375 },
  Overcrook: { name: 'Noseblunt', points: 450 },
  Crook: { name: 'Hurricane', points: 500 },
  Feeble: { name: 'Suski', points: 400 },
  Smith: { name: 'Salad', points: 375 },
});

export const FLATLAND_TRICKS = Object.freeze({
  'grab+grab': { name: 'Handstand', points: 300, instability: 0.48 },
  'flip+grind': { name: 'Casper', points: 250, instability: 0.40 },
});

export const MANUALS = Object.freeze({
  manual: { name: 'Manual', points: 100, pitch: -0.16, difficulty: 1.0, durationRate: 28 },
  noseManual: { name: 'Nose Manual', points: 100, pitch: 0.16, difficulty: 1.06, durationRate: 30 },
});

export function flipFor(direction) { return FLIP_TRICKS[direction] || FLIP_TRICKS[DIR.NONE]; }
export function doubleFlipFor(name) { return DOUBLE_FLIP_TRICKS[name] || null; }
export function flipUpgradeFor(activeName, baseName) {
  const second = doubleFlipFor(baseName);
  return activeName === baseName || activeName === second?.name ? doubleFlipFor(activeName) : null;
}
export function grabFor(direction) { return GRAB_TRICKS[direction] || GRAB_TRICKS[DIR.NONE]; }
export function grindFor(direction, boardslide = false) { return boardslide ? BOARDSLIDE : (GRIND_TRICKS[direction] || GRIND_TRICKS[DIR.NONE]); }
export function grindPresentation(name) { return grindProfile(name); }
