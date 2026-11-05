import * as THREE from 'three';

const UP = new THREE.Vector3(0, 1, 0);
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const lerp = (a, b, t) => a + (b - a) * clamp(t, 0, 1);

export const GROUND_MOTOR = Object.freeze({
  autoPushTarget: 18,
  autoPushSurfaceY: 0.992,
  autoPushMinAccel: 3.6,
  autoPushMaxAccel: 13.5,
  // Crouching is aerodynamic, not an invisible extra throttle.
  crouchedPushTarget: 18,
  crouchedPushAccelScale: 0.78,
  crouchedDragScale: 0.55,
  softSpeedLimit: 21,
  // Progressive wind/overspeed drag, rather than the old speed-killing wall.
  overspeedDrag: 0.008,
  manualOverspeedDragScale: 0.70,
  rollingBase: 0.025,
  rollingQuadratic: 0.00115,
  transitionSurfaceY: 0.992,
  uphillGravityScale: 0.45,
  downhillGravityScale: 1.0,
  steerRateLowSpeed: 2.7,
  steerRateHighSpeed: 1.65,
  // Match the original runtime's 12 m/s steering-rate saturation: park-speed
  // carving must use the high-speed rate, not an unintended 17 m/s ramp.
  steerFullSpeed: 12,
  turnGainLowSpeed: 1.55,
  turnGainHighSpeed: 1.78,
  turnGainFullSpeed: 17,
  manualTurnGain: 1.14,
  rampReentrySteerLock: 0.20,
  rampReentryHardLock: 0.08,
  maxPhysicalSteer: 1.8,
  brakeDriveThreshold: -0.12,
  sharpTurnInputThreshold: 0.25,
  sharpTurnMinSpeed: 1.3,
  sharpTurnRateScale: 1.38,
  steepBrakeReleaseNormalY: 0.65,
  steepBrakeReleaseSpeed: 1.5,
  // At speeds beyond the validated park handling range, ease yaw to avoid
  // high-speed instant pivots without imposing a linear speed ceiling.
  highSpeedSteerReference: 17,
  highSpeedYawExponent: 1.3,
  groundSteerResponseLow: 0.045,
  groundSteerResponseHigh: 0.085,
  // Compatibility-only value for old QA/introspection, NOT applied as a cap.
  absoluteSpeedCap: 128,
});

/** Signed speed follows the canonical deck-relative travel sign, not raw magnitude. */
export function signedGroundSpeed({
  velocity,
  forward,
  rollingSign = 1,
} = {}) {
  const rawProjection = velocity?.dot?.(forward);
  const measuredSigned = Number.isFinite(rawProjection) ? rawProjection : 0;
  // Lateral collision slide is not usable forward speed. The former world-vector
  // magnitude projected *all* side slip onto the deck, creating phantom energy.
  // Forward is the unit tangent supplied by GroundMotor, including steep walls.
  const magnitude = Math.abs(measuredSigned);
  const travelSign = Number(rollingSign) < 0 ? -1 : 1;
  return {
    measuredSigned,
    magnitude,
    travelSign,
    speed: magnitude * travelSign,
  };
}

export function arcadeTurnGain(speed, config = GROUND_MOTOR) {
  const t = clamp(Math.abs(Number(speed) || 0) / config.turnGainFullSpeed, 0, 1);
  return lerp(config.turnGainLowSpeed, config.turnGainHighSpeed, t);
}

export function rampReentrySteerScale(remaining = 0, config = GROUND_MOTOR) {
  const left = Math.max(0, Number(remaining) || 0);
  if (left <= 0) return 1;
  const elapsed = Math.max(0, config.rampReentrySteerLock - left);
  if (elapsed <= config.rampReentryHardLock) return 0;
  const blendDuration = Math.max(0.001,
    config.rampReentrySteerLock - config.rampReentryHardLock);
  return clamp((elapsed - config.rampReentryHardLock) / blendDuration, 0, 1);
}

/**
 * Player steering is the only ground-motor source of horizontal heading change.
 * Park-speed carve gain and post-transition steering suppression are part of the
 * same pure decision, so no upper inheritance layer rewrites `this.steer`.
 */
export function groundSteeringDelta({
  steer = 0,
  speed = 0,
  manual = false,
  sharpTurn = false,
  reentryRemaining = 0,
  dt = 0,
  config = GROUND_MOTOR,
} = {}) {
  const gain = manual
    ? config.manualTurnGain
    : arcadeTurnGain(speed, config);
  const reentryScale = rampReentrySteerScale(reentryRemaining, config);
  const physicalSteer = clamp(
    (Number(steer) || 0) * gain * reentryScale,
    -config.maxPhysicalSteer,
    config.maxPhysicalSteer,
  );
  const rate = lerp(
    config.steerRateLowSpeed,
    config.steerRateHighSpeed,
    Math.abs(Number(speed) || 0) / config.steerFullSpeed,
  );
  const magnitude = Math.abs(Number(speed) || 0);
  const safeReference = Math.max(0.01, config.highSpeedSteerReference || 17);
  const highSpeedScale = magnitude > safeReference
    ? (safeReference / magnitude) ** (config.highSpeedYawExponent || 1)
    : 1;
  return -physicalSteer * rate * highSpeedScale
    * (sharpTurn ? config.sharpTurnRateScale : 1)
    * Math.max(0, Number.isFinite(dt) ? dt : 0);
}

/** Deterministic exponential steering response (independent of fixed tick rate). */
export function smoothGroundSteer({
  previous = 0,
  target = 0,
  speed = 0,
  dt = 0,
  config = GROUND_MOTOR,
} = {}) {
  const magnitude = Math.abs(Number(speed) || 0);
  const response = lerp(
    config.groundSteerResponseLow,
    config.groundSteerResponseHigh,
    magnitude / Math.max(1, config.highSpeedSteerReference),
  );
  const alpha = 1 - Math.exp(-Math.max(0, Number.isFinite(dt) ? dt : 0)
    / Math.max(0.001, response));
  const current = clamp(Number.isFinite(previous) ? previous : 0, -1, 1);
  const desired = clamp(Number.isFinite(target) ? target : 0, -1, 1);
  return lerp(current, desired, alpha);
}

/** Skate wheels should coast; neutral input must preserve useful park speed. */
export function passiveRollingResistance(speed, config = GROUND_MOTOR, crouched = false) {
  const magnitude = Math.abs(Number(speed) || 0);
  const dragScale = crouched ? config.crouchedDragScale : 1;
  const excess = Math.max(0, magnitude - config.softSpeedLimit);
  return (config.rollingBase + config.rollingQuadratic * magnitude * magnitude)
    * dragScale + config.overspeedDrag * excess * excess;
}

/** Neutral auto-push is only a flat-ground speed source. */
export function automaticPushAcceleration({
  speed = 0,
  normalY = 1,
  braking = false,
  manual = false,
  crouched = false,
  config = GROUND_MOTOR,
} = {}) {
  if (braking || manual || normalY < config.autoPushSurfaceY) return 0;
  const magnitude = Math.abs(Number(speed) || 0);
  const target = crouched ? config.crouchedPushTarget : config.autoPushTarget;
  if (magnitude >= target) return 0;
  const deficit = clamp((target - magnitude) / target, 0, 1);
  // Smoothly taper traction to zero; a fixed minimum acceleration caused an
  // abrupt acceleration spike/cut at cruise speed.
  return config.autoPushMaxAccel * Math.pow(deficit, 0.75)
    * (crouched ? config.crouchedPushAccelScale : 1);
}

/** Down + turn is an intentional carve; Shift remains an explicit brake. */
export function groundControlIntent({
  speed = 0,
  steer = 0,
  drive = 0,
  brake = false,
  manual = false,
  normalY = 1,
  config = GROUND_MOTOR,
} = {}) {
  const down = drive < config.brakeDriveThreshold;
  // Negative signed speed is fakie travel, not low/invalid ground speed.
  const sharpTurn = !manual && !brake && down && Math.abs(speed) >= config.sharpTurnMinSpeed
    && Math.abs(steer) >= config.sharpTurnInputThreshold;
  const steepAndSlow = Math.abs(speed) < config.steepBrakeReleaseSpeed
    && normalY < config.steepBrakeReleaseNormalY;
  return {
    sharpTurn,
    // On a steep wall, a near-stopped board must be allowed to roll back down.
    braking: Boolean(brake || (!steepAndSlow && !manual && down && !sharpTurn)),
    pushingAllowed: !down,
  };
}

/** Preserve downhill gravity while softening uphill transition energy loss. */
export function transitionGravityScale({
  signedSpeed = 0,
  forwardY = 0,
  normalY = 1,
  config = GROUND_MOTOR,
} = {}) {
  if (Math.abs(normalY) >= config.transitionSurfaceY) return 1;
  const verticalTravel = signedSpeed * forwardY;
  if (verticalTravel > 0.05) return config.uphillGravityScale;
  if (verticalTravel < -0.05) return config.downhillGravityScale;
  return 1;
}

/**
 * Pure propulsion/drag step. It never touches heading, position, contact state,
 * transition state, or the runtime object.
 */
export function resolveGroundPropulsion({
  speed = 0,
  travelSign = Number(speed) < 0 ? -1 : 1,
  forwardY = 0,
  normalY = 1,
  drive = 0,
  brake = false,
  manual = false,
  crouched = false,
  steer = 0,
  dt = 0,
  gravity = 20,
  brakeDecel = 13,
  config = GROUND_MOTOR,
} = {}) {
  const step = Math.max(0, Number.isFinite(dt) ? dt : 0);
  const directionSign = Number(travelSign) < 0 ? -1 : 1;
  let nextSpeed = Number.isFinite(speed) ? speed : 0;

  const gravityScale = transitionGravityScale({
    signedSpeed: nextSpeed,
    forwardY,
    normalY,
    config,
  });
  nextSpeed += (-gravity * forwardY) * gravityScale * step;

  const { braking, pushingAllowed } = groundControlIntent({
    speed: nextSpeed, steer, drive, brake, manual, normalY, config,
  });
  const pushAccel = automaticPushAcceleration({
    speed: nextSpeed,
    normalY,
    braking: braking || !pushingAllowed,
    manual,
    crouched,
    config,
  });
  if (pushAccel > 0) {
    const nextMagnitude = Math.min(
      crouched ? config.crouchedPushTarget : config.autoPushTarget,
      Math.abs(nextSpeed) + pushAccel * step,
    );
    nextSpeed = directionSign * nextMagnitude;
  }

  // Balance input must not act as a throttle, and a held manual must retain
  // its momentum. Slopes and the explicit brake still change speed.
  // Balance must retain ordinary-speed momentum; above cruising range only a
  // gentle progressive air/overspeed load applies. Brakes remain authoritative.
  const resistance = (manual
    ? config.manualOverspeedDragScale * config.overspeedDrag
      * Math.max(0, Math.abs(nextSpeed) - config.softSpeedLimit) ** 2
    : passiveRollingResistance(nextSpeed, config, crouched))
    + (braking ? brakeDecel : 0);
  const remainingMagnitude = Math.max(0, Math.abs(nextSpeed) - resistance * step);
  // Canonical stopped state is +0 in regular and fakie. Multiplying a zero
  // magnitude by Math.sign(-speed) otherwise leaves observable negative zero.
  nextSpeed = remainingMagnitude > 0 ? Math.sign(nextSpeed) * remainingMagnitude : 0;
  // No hard speed clamp: ramp transfers, gravity and skilled skating can exceed
  // cruise speed. Continuous resistance bleeds excess energy without a snap.

  return {
    nextSpeed,
    braking,
    autoPushActive: pushAccel > 0,
    pushAccel,
    resistance,
    gravityScale,
  };
}


/**
 * Rebuild the board tangent within the heading's vertical plane. Shared by the
 * ground motor, runtime forward and wheel probes, including near-vertical faces.
 */
export function groundForwardFromHeading({
  heading = 0,
  normal = null,
  out = new THREE.Vector3(),
} = {}) {
  const supportNormal = normal || UP;
  const forward = out.set(
    -Math.sin(Number(heading) || 0),
    0,
    -Math.cos(Number(heading) || 0),
  );
  // Intersect the heading's vertical plane with the support plane. Orthogonal
  // projection instead introduces lateral travel on near-vertical bowl facets.
  const facingInto = forward.dot(supportNormal);
  const ny = Math.max(0.001, Math.abs(supportNormal.y));
  forward.multiplyScalar(ny);
  forward.y = -facingInto;
  if (forward.lengthSq() < 1e-8) return new THREE.Vector3(0, 0, -1);
  return forward.normalize();
}

/**
 * Canonical post-balance grounded motor transaction.
 *
 * Contact/collision geometry is deliberately outside this result. The motor owns
 * only deliberate steering and energy along the current rideable tangent.
 */
export function resolveGroundMotion({
  heading = 0,
  normal = null,
  speedState = null,
  steer = 0,
  manual = false,
  crouched = false,
  reentryRemaining = 0,
  drive = 0,
  brake = false,
  dt = 0,
  gravity = 20,
  brakeDecel = 13,
  config = GROUND_MOTOR,
} = {}) {
  const sourceSpeed = Number(speedState?.speed) || 0;
  const travelSign = Number(speedState?.travelSign) < 0 ? -1 : 1;
  const intent = groundControlIntent({
    speed: sourceSpeed, steer, drive, brake, manual, normalY: normal?.y ?? 1, config,
  });
  const headingDelta = groundSteeringDelta({
    steer,
    speed: sourceSpeed,
    manual,
    sharpTurn: intent.sharpTurn,
    reentryRemaining,
    dt,
    config,
  });
  const nextHeading = (Number(heading) || 0) + headingDelta;
  const forward = groundForwardFromHeading({
    heading: nextHeading,
    normal,
  });
  const propulsion = resolveGroundPropulsion({
    speed: sourceSpeed,
    travelSign,
    forwardY: forward.y,
    normalY: normal?.y ?? 1,
    drive,
    brake,
    manual,
    crouched,
    steer,
    dt,
    gravity,
    brakeDecel,
    config,
  });
  const velocity = forward.clone().multiplyScalar(propulsion.nextSpeed);

  return Object.freeze({
    headingDelta,
    heading: nextHeading,
    forward,
    velocity,
    speed: propulsion.nextSpeed,
    propulsion: Object.freeze({ ...propulsion }),
  });
}
