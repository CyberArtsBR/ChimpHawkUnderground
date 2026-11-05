import * as THREE from 'three';

const EPSILON = 1e-8;
const clamp = THREE.MathUtils.clamp;

function horizontal(vector, fallback = null) {
  const out = vector?.clone?.() || new THREE.Vector3();
  out.y = 0;
  if (out.lengthSq() > EPSILON) return out;
  if (fallback?.lengthSq?.() > EPSILON) return fallback.clone().setY(0);
  return out;
}

function copyPlan(plan) {
  if (!plan) return null;
  return {
    ...plan,
    exitControl: plan.exitControl ? { ...plan.exitControl } : null,
    launchHorizontal: plan.launchHorizontal?.clone?.() || null,
    velocity: plan.velocity?.clone?.() || new THREE.Vector3(),
  };
}

/**
 * Pure equivalent of the legacy RampWallSafety post-takeoff transfer profile.
 * The caller supplies the existing config so this model owns composition/order,
 * not tuning values.
 */
export function resolveControlledTransferLaunch({
  frame = null,
  incomingSpeed = 0,
  launchVertical = 0,
  lateralVelocity = 0,
  config,
} = {}) {
  if (!frame?.deckOutward || !frame?.copingTangent || !config) {
    return Object.freeze({ active: false });
  }

  const speed = Math.max(0, Number(incomingSpeed) || 0);
  const horizontalSpeed = clamp(speed * 0.30 + 0.8,
    config.exitHorizontalMin, config.exitHorizontalMax);
  const verticalSpeed = clamp((Number(launchVertical) || 0) * 0.62,
    config.exitVerticalMin, config.exitVerticalMax);
  const targetDistance = clamp(speed * 0.10 + 0.55,
    config.exitDistanceMin, config.exitDistanceMax);
  const exitControl = { horizontalSpeed, verticalSpeed, targetDistance };

  const retainedLateral = frame.copingTangent.clone()
    .multiplyScalar((Number(lateralVelocity) || 0) * 0.32);
  const launchHorizontal = frame.deckOutward.clone()
    .multiplyScalar(horizontalSpeed)
    .add(retainedLateral);
  const velocity = launchHorizontal.clone();
  velocity.y = verticalSpeed;

  return Object.freeze({
    active: true,
    mode: 'transfer',
    transferring: true,
    exitControl,
    launchVertical: verticalSpeed,
    launchHorizontal,
    velocity,
  });
}

/** Same distance/airtime formula used by DeckAwareRampExit, kept pure here. */
export function transferDeckLaunchSpeed(targetDistance, verticalSpeed, {
  gravity = 20,
  config,
} = {}) {
  if (!config) return 0;
  const vertical = Math.max(0.1, Math.abs(Number(verticalSpeed) || 0));
  const airTime = Math.max(0.28, (2 * vertical) / Math.max(Number(gravity) || 0, 0.1));
  const speed = (Math.max(0, Number(targetDistance) || 0) / airTime) * 1.08;
  return clamp(speed, config.launchHorizontalMin, config.launchHorizontalMax);
}

/**
 * Pure equivalent of DeckAwareRampExit.takeoff() after transitionAir exists.
 * `deck` is the already-scanned real collision-deck result; raycasting remains a
 * geometry service and is deliberately outside this decision model.
 */
export function resolveDeckAwareTransferLaunch({
  plan,
  frame = null,
  deck = null,
  lateralVelocity = 0,
  gravity = 20,
  config,
} = {}) {
  if (!plan?.active || !frame || !config) return copyPlan(plan);

  if (!deck) {
    const velocity = plan.velocity.clone();
    const tangent = frame.copingTangent.clone()
      .multiplyScalar((Number(lateralVelocity) || 0) * 0.35);
    const inward = frame.rampInward.clone().multiplyScalar(0.34).add(tangent);
    velocity.x = inward.x;
    velocity.z = inward.z;

    return Object.freeze({
      ...copyPlan(plan),
      mode: 'return',
      exitControl: {
        geometryAware: true,
        abortToReturn: true,
        targetPoint: frame.returnTarget.clone(),
      },
      velocity,
    });
  }

  const verticalSpeed = clamp(plan.exitControl.verticalSpeed,
    config.launchVerticalMin, config.launchVerticalMax);
  const horizontalSpeed = transferDeckLaunchSpeed(deck.targetDistance, verticalSpeed, {
    gravity,
    config,
  });
  const exitControl = {
    ...plan.exitControl,
    ...deck,
    geometryAware: true,
    abortToReturn: false,
    horizontalSpeed,
    verticalSpeed,
  };

  const towardTarget = horizontal(deck.targetPoint.clone().sub(frame.lipPoint), deck.direction);
  if (towardTarget.lengthSq() < EPSILON) towardTarget.copy(deck.direction);
  towardTarget.normalize();
  const lateral = frame.copingTangent.clone()
    .multiplyScalar((Number(lateralVelocity) || 0) * 0.10);
  const launchHorizontal = towardTarget.multiplyScalar(horizontalSpeed).add(lateral);
  const velocity = launchHorizontal.clone();
  velocity.y = verticalSpeed;

  return Object.freeze({
    ...copyPlan(plan),
    mode: 'transfer',
    exitControl,
    launchVertical: verticalSpeed,
    launchHorizontal,
    velocity,
  });
}

export function transferDeckCanFit(control, config) {
  if (!control?.found || !Number.isFinite(control.usableWidth) || !config) return false;
  const required = Math.max(config.minSafeDeckWidth,
    config.boardLength + config.edgeSafety * 2);
  return control.usableWidth + 1e-6 >= required;
}

/**
 * Pure equivalent of SafeCopingExit's final narrow-deck safety conversion.
 * A verified but unsafe transfer becomes a same-wall return without changing yaw.
 */
export function resolveSafeCopingTransferLaunch({
  plan,
  frame = null,
  lateralVelocity = 0,
  config,
} = {}) {
  if (!plan?.active || !frame || !config) return copyPlan(plan);
  const control = plan.exitControl;
  if (!plan.transferring || !control?.geometryAware || control.abortToReturn) {
    return copyPlan(plan);
  }
  if (transferDeckCanFit(control, config)) return copyPlan(plan);

  const velocity = plan.velocity.clone();
  const retainedVertical = clamp(Math.max(velocity.y, 3.2), 3.2, 7.2);
  const lateral = frame.copingTangent.clone()
    .multiplyScalar((Number(lateralVelocity) || 0) * 0.28);
  const inward = frame.rampInward.clone().multiplyScalar(0.36).add(lateral);
  velocity.x = inward.x;
  velocity.z = inward.z;
  velocity.y = retainedVertical;

  return Object.freeze({
    ...copyPlan(plan),
    mode: 'return',
    exitControl: {
      ...control,
      geometryAware: true,
      abortToReturn: true,
      unsafeDeckWidth: control.usableWidth,
      targetPoint: frame.returnTarget.clone(),
    },
    velocity,
  });
}

/** Execute the full current post-takeoff transfer decision without mutation. */
export function resolveTransferLaunchResult({
  frame = null,
  incomingSpeed = 0,
  launchVertical = 0,
  lateralVelocity = 0,
  deck = null,
  gravity = 20,
  transferConfig,
  deckConfig,
  copingConfig,
} = {}) {
  // An explicit Up tap does not grant a free jump from a stationary board.
  // Low-energy/descending deck attempts recover toward the original wall.
  if (frame?.rampInward && frame?.copingTangent && frame?.returnTarget
    && (incomingSpeed < 4.8 || launchVertical < 1.5)) {
    const retainedLateral = frame.copingTangent.clone()
      .multiplyScalar((Number(lateralVelocity) || 0) * 0.35);
    const velocity = frame.rampInward.clone().multiplyScalar(0.34)
      .add(retainedLateral);
    velocity.y = Math.max(0, Number(launchVertical) || 0);
    return Object.freeze({
      active: true,
      mode: 'return',
      transferring: false,
      launchVertical: velocity.y,
      launchHorizontal: horizontal(velocity),
      velocity,
      exitControl: {
        geometryAware: true,
        abortToReturn: true,
        insufficientEnergy: true,
        targetPoint: frame.returnTarget.clone(),
      },
    });
  }

  const controlled = resolveControlledTransferLaunch({
    frame,
    incomingSpeed,
    launchVertical,
    lateralVelocity,
    config: transferConfig,
  });
  if (!controlled.active) return controlled;

  const deckAware = resolveDeckAwareTransferLaunch({
    plan: controlled,
    frame,
    deck,
    lateralVelocity,
    gravity,
    config: deckConfig,
  });
  return resolveSafeCopingTransferLaunch({
    plan: deckAware,
    frame,
    lateralVelocity,
    config: copingConfig,
  });
}
