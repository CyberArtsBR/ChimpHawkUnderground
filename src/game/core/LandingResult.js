import * as THREE from 'three';

export const LANDING_REJECT_REASON = Object.freeze({
  YOUNG_UPWARD: 'YOUNG_UPWARD',
  SUPPORT: 'SUPPORT',
  CORRECTION: 'CORRECTION',
  BOARD_FORWARD: 'BOARD_FORWARD',
  ALIGNMENT: 'ALIGNMENT',
  FLIP: 'FLIP',
});

export function transitionLandingSupportMode(support) {
  const count = support?.count || 0;
  const front = Boolean(support?.frontSupported);
  const rear = Boolean(support?.rearSupported);
  if (count < 1) return 'reject';
  if (count >= 2 && front && rear) return 'full';

  const normalY = Math.abs(support?.normal?.y ?? 1);
  if (normalY < 0.995 && (front || rear)) {
    if (count >= 2) return 'truckFirst';
    return 'wheelFirst';
  }
  return 'reject';
}

export function stableLandingSupportMode(support) {
  const count = support?.count || 0;
  const front = Boolean(support?.frontSupported);
  const rear = Boolean(support?.rearSupported);
  return count >= 2 && front && rear ? 'full' : 'reject';
}

export function transitionFlipLandingMode(progress, normalY = 1, contactMode = 'full') {
  if (!Number.isFinite(progress)) return 'clear';
  if (progress >= 0.88) return 'clear';

  const mode = contactMode === true ? 'truckFirst' : contactMode;
  const ny = Math.abs(normalY);
  let threshold = 0.62;
  if (ny < 0.90) threshold = 0.28;
  else if (ny < 0.97) threshold = 0.34;
  else if (ny < 0.995) threshold = 0.40;
  if (mode === 'truckFirst') threshold = Math.min(threshold, 0.22);
  if (mode === 'wheelFirst') threshold = Math.min(threshold, 0.18);
  return progress >= threshold ? 'autoCatch' : 'bail';
}

/** Preserve the validated flat/base flip-catch behavior from StableBoardContact. */
export function stableFlipLandingMode(progress, normalY = 1) {
  if (!Number.isFinite(progress)) return 'clear';
  if (progress <= 0.12 || progress >= 0.88) return 'clear';
  const catchThreshold = Math.abs(normalY) < 0.985 ? 0.62 : 0.72;
  return progress >= catchThreshold ? 'autoCatch' : 'bail';
}

export function transitionAlignmentThreshold(normalY = 1, contactMode = 'full') {
  const mode = contactMode === true ? 'truckFirst' : contactMode;
  const ny = Math.abs(normalY);
  if (mode === 'wheelFirst') return 0.08;
  if (mode === 'truckFirst') return 0.12;
  if (ny < 0.90) return 0.14;
  if (ny < 0.97) return 0.22;
  if (ny < 0.995) return 0.30;
  return 0.44;
}

function rejected(rejectReason, supportMode = 'reject', extra = {}) {
  return {
    accepted: false,
    shouldBail: false,
    rejectReason,
    supportMode,
    rulesMode: supportMode,
    ...extra,
  };
}

export function landingBailMessage(landing) {
  return landing?.rejectReason===LANDING_REJECT_REASON.FLIP
    ? 'BAIL · finish your flip before landing'
    : 'BAIL · land along your direction of travel';
}

/** Shared pure geometry/safety evaluation. It never mutates gameplay state. */
function evaluateLandingCore({
  support,
  position,
  velocity,
  forward,
  airTime,
  flipProgress,
  supportMode,
  rulesMode = supportMode,
  partialTouchdown = supportMode !== 'full',
  correctionLimit = 0.22,
  alignmentThreshold = 0.44,
  flipMode = 'clear',
} = {}) {
  const verticalSpeed = Number(velocity?.y) || 0;
  if (airTime < 0.075 && verticalSpeed > 0.05) {
    return rejected(LANDING_REJECT_REASON.YOUNG_UPWARD, 'reject');
  }

  if (supportMode === 'reject' || !support?.position || !support?.normal) {
    return rejected(LANDING_REJECT_REASON.SUPPORT, supportMode, { rulesMode });
  }

  const correction = support.position.clone().sub(position || new THREE.Vector3());
  if (correction.length() > correctionLimit) {
    return rejected(LANDING_REJECT_REASON.CORRECTION, supportMode, {
      rulesMode,
      partialTouchdown,
      correction,
      correctionLimit,
    });
  }

  const boardForward = (forward?.clone?.() || new THREE.Vector3(0, 0, -1))
    .projectOnPlane(support.normal);
  if (boardForward.lengthSq() < 1e-7 && Math.abs(support.normal.y) < 0.2) {
    const facingInto = forward?.dot?.(support.normal) || -1;
    boardForward.set(0, 1, 0).projectOnPlane(support.normal)
      .multiplyScalar(facingInto > 0 ? -1 : 1);
  }
  if (boardForward.lengthSq() < 1e-7) {
    return rejected(LANDING_REJECT_REASON.BOARD_FORWARD, supportMode, {
      rulesMode,
      partialTouchdown,
      correction,
      correctionLimit,
    });
  }
  boardForward.normalize();

  const planarVelocity = (velocity?.clone?.() || new THREE.Vector3())
    .projectOnPlane(support.normal);
  const planarSpeed = planarVelocity.length();
  let alignment = 1;
  if (planarSpeed > 0.18) {
    const tangent = planarVelocity.clone().multiplyScalar(1 / planarSpeed);
    alignment = boardForward.dot(tangent);
  }

  const alignmentUnsafe = planarSpeed > 0.18 && Math.abs(alignment) < alignmentThreshold;
  const flipUnsafe = flipMode === 'bail';
  if (alignmentUnsafe || flipUnsafe) {
    return {
      accepted: false,
      shouldBail: true,
      rejectReason: flipUnsafe ? LANDING_REJECT_REASON.FLIP : LANDING_REJECT_REASON.ALIGNMENT,
      supportMode,
      rulesMode,
      partialTouchdown,
      correction,
      correctionLimit,
      boardForward,
      planarVelocity,
      planarSpeed,
      alignment,
      flipMode,
      alignmentThreshold,
    };
  }

  return {
    accepted: true,
    shouldBail: false,
    rejectReason: null,
    supportMode,
    rulesMode,
    partialTouchdown,
    correction,
    correctionLimit,
    boardForward,
    planarVelocity,
    planarSpeed,
    alignment,
    flipMode,
    alignmentThreshold,
  };
}

/**
 * Pure landing decision boundary extracted from the legacy BowlLanding layer.
 * `supportModeOverride` is only for an already-verified special contact such as
 * controlled flat-deck `deckExit`; geometry-specific layers authorize it.
 */
export function evaluateTransitionLanding({
  support,
  position,
  velocity,
  forward,
  airTime = 0,
  flipProgress = null,
  maxLandingCorrection = 0.22,
  supportModeOverride = null,
} = {}) {
  const supportMode = supportModeOverride || transitionLandingSupportMode(support);
  const rulesMode = supportMode === 'deckExit' ? 'truckFirst' : supportMode;
  let correctionLimit = maxLandingCorrection;
  if (supportMode === 'truckFirst') correctionLimit = Math.max(correctionLimit, 0.34);
  if (supportMode === 'wheelFirst' || supportMode === 'deckExit') {
    correctionLimit = Math.max(correctionLimit, 0.42);
  }
  const flipMode = Number.isFinite(flipProgress) && support?.normal
    ? transitionFlipLandingMode(flipProgress, support.normal.y, rulesMode)
    : 'clear';
  const alignmentThreshold = support?.normal
    ? transitionAlignmentThreshold(support.normal.y, rulesMode)
    : 0.44;

  return evaluateLandingCore({
    support,
    position,
    velocity,
    forward,
    airTime,
    flipProgress,
    supportMode,
    rulesMode,
    partialTouchdown: supportMode !== 'full',
    correctionLimit,
    alignmentThreshold,
    flipMode,
  });
}

/** Canonical result for the stricter legacy/base flat-air landing path. */
export function evaluateStableLanding({
  support,
  position,
  velocity,
  forward,
  airTime = 0,
  flipProgress = null,
  maxLandingCorrection = 0.22,
} = {}) {
  const supportMode = stableLandingSupportMode(support);
  const flipMode = Number.isFinite(flipProgress) && support?.normal
    ? stableFlipLandingMode(flipProgress, support.normal.y)
    : 'clear';

  return evaluateLandingCore({
    support,
    position,
    velocity,
    forward,
    airTime,
    flipProgress,
    supportMode,
    rulesMode: supportMode,
    partialTouchdown: false,
    correctionLimit: maxLandingCorrection,
    alignmentThreshold: 0.44,
    flipMode,
  });
}
