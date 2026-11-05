// Trick lettering tones match the supplied graffiti alphabet palettes.
// This is presentation-only: names, scores, combos and trick rules stay intact.
export function graffitiToneForTrick(text = '') {
  const label = String(text).toLowerCase();
  if (!label.trim()) return 'aqua';
  if (/bail|crash|wipeout|fail|slam/.test(label)) return 'red';
  if (/grind|slide|blunt|crook|feeble|smith|50-50|5-0|nosegrind/.test(label)) return 'gold';
  if (/grab|indy|melon|method|stale|japan|mute|madonna|benihana|nosegrab|tailgrab|christ air/.test(label)) return 'fire';
  if (/manual|wallride|wall ride|handstand|casper|primo/.test(label)) return 'lime';
  if (/kickflip|heelflip|shove|shuv|ollie|flip|spin|360|180|transfer/.test(label)) return 'aqua';
  return 'purple';
}
