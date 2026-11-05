const PRECISION = 1e6;

function roundNumber(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * PRECISION) / PRECISION;
}

function vectorArray(vector) {
  if (!vector) return null;
  return [roundNumber(vector.x), roundNumber(vector.y), roundNumber(vector.z)];
}

function transitionIdentifier(air) {
  return air?.transitionId
    ?? air?.frame?.transitionId
    ?? null;
}

function transitionType(air) {
  return air?.transitionType
    ?? air?.frame?.transitionType
    ?? null;
}

/**
 * Read-only JSON-safe snapshot of gameplay state.
 *
 * Phase 1 uses this as the common observability/replay boundary before state
 * ownership is migrated away from the legacy inheritance tower. Keep this
 * function side-effect free: it must never normalize or repair runtime state.
 * Transition identity is intentionally canonical-only: raw coping/rail names are
 * not accepted as fallback IDs, so replay detects lost metadata propagation.
 */
export function captureGameplayState(controller) {
  const support = controller?.lastWheelSupport || null;
  const transitionAir = controller?.transitionAir || null;
  const travel = controller?.travelDirection || null;
  const yawInvariant = controller?.lastLandingYawInvariant || null;
  const canonical = controller?.playerState || null;
  const invariantCodes = (controller?.stateInvariantViolations || [])
    .map(entry => entry?.code)
    .filter(Boolean);

  return {
    position: vectorArray(controller?.position),
    velocity: vectorArray(controller?.velocity),
    normal: vectorArray(controller?.normal),
    forward: vectorArray(controller?.forward),
    travelDirection: vectorArray(travel),

    heading: roundNumber(controller?.heading),
    airHeading: roundNumber(controller?.airHeading),
    airSpin: roundNumber(controller?.airSpin),
    speed: roundNumber(controller?.speed),

    grounded: Boolean(controller?.grounded),
    movementState: controller?.movementState ?? null,
    stance: Number.isFinite(Number(controller?.stance)) ? Number(controller.stance) : null,
    fakie: typeof controller?.fakie === 'boolean' ? controller.fakie : null,
    rollingSign: Number.isFinite(Number(controller?.rollingSign)) ? Number(controller.rollingSign) : null,

    canonicalState: canonical ? {
      deckHeading: roundNumber(canonical.deckHeading),
      travelDirection: vectorArray(canonical.travelDirection),
      stance: Number(canonical.stance),
      fakie: Boolean(canonical.fakie),
      mode: canonical.mode ?? null,
      grounded: Boolean(canonical.grounded),
      transitionId: canonical.transitionId ?? null,
      transitionType: canonical.transitionType ?? null,
    } : null,
    stateInvariantCodes: invariantCodes,

    transitionId: transitionIdentifier(transitionAir),
    transitionType: transitionType(transitionAir),
    transitionActive: Boolean(transitionAir),
    grindActive: Boolean(controller?.grind),
    grindName: controller?.grind?.trick?.name ?? null,
    manual: controller?.manual ?? null,
    wallRideActive: Boolean(controller?.wallRide),
    bailActive: Number(controller?.bailTime || 0) > 0,

    landingYawInvariantViolations: Number(controller?.landingYawInvariantViolations || 0),
    lastLandingYawDelta: roundNumber(yawInvariant?.delta),
    lastLandingYawViolated: yawInvariant ? Boolean(yawInvariant.violated) : null,

    wheelSupport: support ? {
      supported: Boolean(support.supported),
      count: Number(support.count ?? support.wheelCount ?? 0),
      frontSupported: Number(support.frontSupported ?? 0),
      rearSupported: Number(support.rearSupported ?? 0),
      maxWheelGap: roundNumber(support.maxWheelGap),
      normal: vectorArray(support.normal),
    } : null,

    pumpState: controller?.pumpState ?? null,
    pumpQuality: roundNumber(controller?.pumpQuality),
    pumpLastEnergy: roundNumber(controller?.pumpLastEnergy),
    pumpLastDeltaSpeed: roundNumber(controller?.pumpLastDeltaSpeed),
    pumpTangentSpeed: roundNumber(controller?.pumpTangentSpeed),
    rampLaunchMemory: roundNumber(controller?.rampLaunchMemory),
    rampLaunchMemoryTime: roundNumber(controller?.rampLaunchMemoryTime),
  };
}

export function gameplayStateFiniteErrors(snapshot) {
  const errors = [];
  const visit = (value, path) => {
    if (Array.isArray(value)) {
      value.forEach((entry, index) => visit(entry, `${path}[${index}]`));
      return;
    }
    if (value && typeof value === 'object') {
      for (const [key, entry] of Object.entries(value)) visit(entry, path ? `${path}.${key}` : key);
      return;
    }
    if (typeof value === 'number' && !Number.isFinite(value)) errors.push(path);
  };
  visit(snapshot, '');
  return errors;
}

export function gameplayStateSignature(snapshot) {
  return JSON.stringify(snapshot);
}
