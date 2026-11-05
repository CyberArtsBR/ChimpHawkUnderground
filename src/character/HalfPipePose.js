// Adapted from CyberArtsBR/Skate SkatePoseController / SkateAnimationController
// at 53af1f2. StreetSkate owns movement and trick timing; this is presentation.
const clamp = value => Math.min(1, Math.max(0, Number(value) || 0));
const smooth = value => { const t = clamp(value); return t * t * (3 - 2 * t); };

// RiderFootIK's law-of-cosines pelvis target: respects each avatar's leg lengths.
export function kneeHeight(upper, lower, flex, lateralSquared) {
  return Math.sqrt(Math.max(.001, upper * upper + lower * lower
    + 2 * upper * lower * Math.cos(flex) - lateralSquared));
}

export function halfPipePose({ charge = 0, air = 0, vert = false, verticalVelocity = 0,
  landing = 0, speed = 0, grab = 0, popProgress = 1, airTime = null } = {}) {
  const airborne = clamp(air);
  const anticipation = smooth(-verticalVelocity / (vert ? 11 : 8));
  const preload = 0.12 + 0.12 * clamp(speed);
  const tuckedCompression = vert ? .90 : .82;
  // Extension, knee gathering, then a partial leg extension for contact.
  // Actual airtime keeps the gather readable after the short tail-pop event.
  const gather = Number.isFinite(airTime) ? smooth((airTime - .045) / .20) : smooth(popProgress);
  const flightCompression = .30 + gather * (tuckedCompression - .30)
    - anticipation * (vert ? .22 : .30) * gather;
  const compression = clamp(Math.max(
    preload + smooth(charge) * (1 - preload),
    flightCompression * airborne,
    clamp(grab) * 0.86,
    preload + clamp(landing) * .68,
  ));
  return { compression, torsoLean: 0.09 + compression * 0.42 + airborne * 0.03,
    response: landing > .05 ? 13 : charge > 0 || airborne > 0.1 ? 15 : 9 };
}
