import { execFileSync } from 'node:child_process';

export const GRAB_QUALITY_NAMES = ['Indy', 'Melon', 'Nosegrab', 'Tailgrab', 'Japan', 'Stalefish'];

/** Snapshot both pose modules; loading only the rider would accidentally use
 * today's reach calibration when measuring an earlier revision. */
export async function loadRiderAtRevision(revision) {
  const read = file => execFileSync('git', ['show', `${revision}:src/character/${file}`], { encoding: 'utf8' });
  const reach = read('GrabReachPose.js')
    .replace("import * as THREE from 'three';", '').replaceAll('export function ', 'function ');
  const source = read('UnrealRider.js')
    .replace(/import \{ grabReachPose, grabReachMargin \} from '[^']+';/, reach)
    .replace(/from '([^']+)'/g, (_, specifier) => `from '${specifier.startsWith('.')
      ? new URL(`../src/character/${specifier}`, import.meta.url).href : import.meta.resolve(specifier)}'`);
  return (await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`)).UnrealRider;
}

/** Same fixed 120 Hz engage/hold/release envelope as the visual fixture. */
export function grabTransitionParams(name, stance, time) {
  const active = time >= .35 && time < 1.5;
  const weight = time < .35 ? 0 : active ? 1 - Math.exp(-28 * (time - .35))
    : (1 - Math.exp(-28 * 1.15)) * Math.exp(-28 * (time - 1.5));
  return { stance, airborne: true, presentation: { state: 'AIR' },
    grabState: active || weight >= .005 ? { name } : null, grabWeight: weight,
    airTime: .5 + time, verticalVelocity: 0, time, dt: 1 / 120 };
}
