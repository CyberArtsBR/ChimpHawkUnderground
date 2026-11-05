/** UI-only countdown state, with no gameplay clock changes. */
export function countdownCrossing(previous, current, practice = false) {
  if (practice || !Number.isFinite(previous) || !Number.isFinite(current)) return 0;
  // Large frame times must not emit competing cues on the same tick.
  if (previous > 5 && current <= 5) return 5;
  if (previous > 10 && current <= 10) return 10;
  return 0;
}

export function sessionWarning(remaining, practice = false) {
  if (practice || !Number.isFinite(remaining) || remaining > 10) return 'none';
  return remaining <= 5 ? 'critical' : 'warning';
}
