import * as THREE from 'three';
import { resolveCameraClearance } from './CameraClearance.js';
import { CAMERA_MODES, DEFAULT_CAMERA_MODE } from './CameraModes.js';
import {
  captureCameraState,
  resolveCameraTravelDirection,
} from './core/CameraState.js';

const UP = new THREE.Vector3(0, 1, 0);

export const THPS_CAMERA = Object.freeze({
  // Fixed world-axis view. Only player position translates the gameplay rig.
  distance: 5.8,
  height: 1.55,
  anchorHeight: 1.15,
  lookAhead: 1.1,
  targetHeight: 1.0,
  airDistance: 6.5,
  airHeight: 2.2,
  vertDistance: 6.8,
  vertHeight: 2.6,
  contextFollowRate: 5,
  returnHoldTime: 0.35,
  occlusionReleaseRate: 4,
  highSpeedFollowGain: 0.48,
  highSpeedFollowCap: 9,
  speedLookAheadGain: 0.065,
  speedLookAheadCap: 0.85,
  // These affect only the camera; movement/physics stay entirely untouched.
  maximumAimLag: 1.35,
  fastAimRateGain: 0.14,
  fastLookAheadGain: 0.07,
  fastLookAheadCap: 1.25,
  highSpeedFovGain: 0.14,
  highSpeedFovCap: 3.5,
  portraitFovCap: 2.5,
  // Prevent a momentary 180° downhill reversal from whipping the camera.
  maximumTrackedYawRadiansPerSecond: 3.6,
  occlusionSideFollowRate: 11,

  // Classic skate cameras do not instantly orbit behind the rider every time a
  // quarter pipe reverses world travel. Normal carving recenters deliberately;
  // a near-180 travel reversal rotates much more slowly and stays readable.
  directionFollowRate: 4.2,
  reverseDirectionFollowRate: 0.82,
  reverseDotThreshold: -0.18,
  positionFollowRate: 7.5,
  targetFollowRate: 8.5,
  verticalFollowRate: 8.5,
  landingSettleDuration: 0.24,
  landingVerticalFollowRate: 5.5,
  vertVerticalFollowRate: 13,
  maximumFollowLag: 1.4,
  classicVertDistance: 3.6,
  classicVertHeight: 4.4,
  classicGrindZoom: 0.94,
  classicTrickZoom: 0.92,
  landingHoldTime: 0.9,
  returnReframeRate: 8,
  reverseReturnReframeRate: 2.4,
  // Follow Classic 2 (2026-11): the vert-air swing pauses at a raised side view on
  // the open side of the ramp, then finishes behind the rider on the way down.
  testOrbitMinimumAngle: 100 * Math.PI / 180,
  testRiseSeconds: .38,
  testHoldMinimum: .22,
  testHoldMaximum: .9,
  testFinishSeconds: .5,
  testCraneHeight: 3,     // camera rises during the swing so it passes above the coping
  testCranePull: .15,      // and comes ~15% closer at the halfway pause
});

const easeInOut = t => t * t * (3 - 2 * t);
const yawOf = v => Math.atan2(v.x, v.z);
const directionOfYaw = yaw => new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));

function wrapAngle(value) {
  let result = (value + Math.PI) % (Math.PI * 2);
  if (result < 0) result += Math.PI * 2;
  return result - Math.PI;
}

/**
 * Angular interpolation avoids the classic vector-lerp failure at a 180° change,
 * where opposite vectors shrink toward zero and then suddenly flip. This is the
 * key to keeping the camera on a Tony-Hawk-like side during vert reversals.
 */
export function smoothCameraDirection(current, target, dt, rate, maximumYawRate = null) {
  const from = current?.clone?.() || new THREE.Vector3(0, 0, -1);
  const to = target?.clone?.() || new THREE.Vector3(0, 0, -1);
  from.y = 0;
  to.y = 0;
  if (from.lengthSq() < 1e-8) from.set(0, 0, -1);
  if (to.lengthSq() < 1e-8) to.copy(from);
  from.normalize();
  to.normalize();

  const fromYaw = Math.atan2(from.x, from.z);
  const toYaw = Math.atan2(to.x, to.z);
  const delta = wrapAngle(toYaw - fromYaw);
  const alpha = 1 - Math.exp(-Math.max(0, Number(rate) || 0) * Math.max(0, Number(dt) || 0));
  const limit = Number(maximumYawRate) > 0
    ? Number(maximumYawRate) * Math.max(0, Number(dt) || 0) : Infinity;
  const yaw = fromYaw + THREE.MathUtils.clamp(delta * alpha, -limit, limit);
  return new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw)).normalize();
}

export function cameraDirectionRate(current, target, config = THPS_CAMERA) {
  const from = current?.clone?.() || new THREE.Vector3(0, 0, -1);
  const to = target?.clone?.() || new THREE.Vector3(0, 0, -1);
  from.y = 0;
  to.y = 0;
  if (from.lengthSq() < 1e-8 || to.lengthSq() < 1e-8) return config.directionFollowRate;
  from.normalize();
  to.normalize();
  return from.dot(to) < config.reverseDotThreshold
    ? config.reverseDirectionFollowRate
    : config.directionFollowRate;
}

/**
 * A long camera arm is intentional on the bowl return: shorter, taller rigs
 * become a near top-down shot as the rider crosses the lip. Keep ground and
 * downhill landing visible while retaining high behind-the-skater framing.
 */
export function highFollowFraming({
  grounded = false, transitionReturning = false, wallRideActive = false,
  horizontalSpeed = 0,
} = {}) {
  // Slightly tighter default Follow framing (~11% closer on flat ground).
  // Keep a longer arm and high vantage during wallrides/vert so the next
  // landing remains readable and collision clearance can still reposition us.
  if (transitionReturning) return { distance: 10.9, height: 5.3, lookAhead: 1.4 };
  const lead = Math.min(THPS_CAMERA.speedLookAheadCap,
    Math.max(0, horizontalSpeed) * THPS_CAMERA.speedLookAheadGain);
  if (wallRideActive) return { distance: 10.0, height: 6.1, lookAhead: 0.8 + lead };
  if (grounded) return { distance: 8.5, height: 4.9, lookAhead: 0.55 + lead };
  return { distance: 9.8, height: 5.5, lookAhead: 0.75 + lead };
}

/** Backward-compatible helper now delegated to canonical CameraState. */
export function resolveTravelFollowDirection(player, previousDirection = null, initialized = true) {
  return resolveCameraTravelDirection(player, previousDirection, initialized);
}

/**
 * Deterministic fixed camera frame. Speed, stance, jump state and vert state do
 * not change the distance or pitch unless the caller supplies a different frame
 * configuration. The first argument can be gameplay or CameraState because
 * this frame only consumes its copied `position`.
 */
export function fixedChaseFrame(player, direction, config = THPS_CAMERA) {
  const travel = direction.clone();
  travel.y = 0;
  if (travel.lengthSq() < 1e-8) travel.set(0, 0, -1);
  travel.normalize();

  const anchor = player.position.clone().addScaledVector(UP, config.anchorHeight);
  const desired = anchor.clone()
    .addScaledVector(travel, -config.distance)
    .addScaledVector(UP, config.height);
  const target = player.position.clone()
    .addScaledVector(travel, config.lookAhead)
    .addScaledVector(UP, config.targetHeight);

  return { anchor, desired, target, travel };
}

export class FollowCamera {
  constructor(camera) {
    this.camera = camera;
    this.preferences = { cameraDistance: 1, cameraFov: 58, speedFov: 1 };
    this.motionPreference=globalThis.matchMedia?.('(prefers-reduced-motion: reduce)');
    this.mode = DEFAULT_CAMERA_MODE;
    this.position = new THREE.Vector3();
    this.target = new THREE.Vector3();
    this.direction = new THREE.Vector3(0, 0, -1);
    this.vertDirection = this.direction.clone();
    this.wasReturning = false;
    this.returnHold = 0;
    this.distance = THPS_CAMERA.distance;
    this.height = THPS_CAMERA.height;
    this.occlusionDistance = null;
    this.occlusionActive = false;
    this.clearanceCache = { fixedAxis: true };
    this.initialized = false;
    this.lookYaw = 0;
    this.lookTilt = 0;
    this.lookHold = 0;
    this.trickZoomActive = false;
    this.zoom = 1;
    this.lookAhead = 0;
    this.aimTarget = null;
    this.airborneTime = 0;
    this.landingSettle = 0;
    this.testOrbit = null;
    this.testCrane = 0;
  }

  /**
   * Follow Test: choose the halfway (side-view) yaw with the most clear space,
   * checked with the same camera collision ray the rig uses everywhere else.
   */
  chooseOrbitSide(player, fromYaw, deltaYaw, distance, height) {
    const natural = Math.sign(deltaYaw) || 1;
    const surface = player?.surface;
    if (!surface?.camera || !player?.position) return natural;
    const anchor = player.position.clone().addScaledVector(UP, THPS_CAMERA.anchorHeight);
    const clearance = side => {
      const eye = anchor.clone().addScaledVector(directionOfYaw(fromYaw + side * Math.PI / 2), -distance)
        .addScaledVector(UP, height + THPS_CAMERA.testCraneHeight);
      return surface.camera(anchor, eye, .28).distanceTo(anchor);
    };
    const a = clearance(natural), b = clearance(-natural);
    return b > a + .75 ? -natural : natural;
  }

  /** Advance the staged Follow Test swing; returns the camera yaw to use. */
  stepTestOrbit(state, dt, landed) {
    const o = this.testOrbit, C = THPS_CAMERA;
    o.time += dt;
    if (o.stage === 'rise') {
      const t = Math.min(1, o.time / C.testRiseSeconds);
      o.yaw = o.from + o.side * (Math.PI / 2) * easeInOut(t);
      this.testCrane = C.testCraneHeight * easeInOut(t);
      if (t >= 1) { o.stage = 'hold'; o.time = 0; }
    } else if (o.stage === 'hold') {
      o.yaw = o.from + o.side * Math.PI / 2;
      this.testCrane = C.testCraneHeight;
      const pastApex = state.verticalSpeed <= 0 && o.time >= C.testHoldMinimum;
      if (pastApex || o.time >= C.testHoldMaximum || landed) { o.stage = 'finish'; o.time = 0; o.mid = o.yaw; }
    } else {
      // Finish the swing in the same rotational direction, onto the return heading.
      const remaining = wrapAngle(o.to - o.mid);
      const sweep = Math.sign(remaining) === o.side || Math.abs(remaining) < 1e-3 ? remaining : remaining + o.side * Math.PI * 2;
      const t = Math.min(1, o.time / (landed ? C.testFinishSeconds * .5 : C.testFinishSeconds));
      o.yaw = o.mid + sweep * easeInOut(t);
      this.testCrane = C.testCraneHeight * (1 - easeInOut(t));
      if (t >= 1) { this.testOrbit = null; this.testCrane = 0; this.testOrbitCooldown = .8; return o.yaw; }
    }
    return o.yaw;
  }

  setMode(mode, player = null) {
    this.mode = CAMERA_MODES.includes(mode) ? mode : DEFAULT_CAMERA_MODE;
    this.camera.fov = this.preferences.cameraFov;
    this.camera.updateProjectionMatrix();
    if (player) this.snap(player);
  }

  setPreferences(value = {}) {
    const bounded = (n, fallback, min, max) => Number.isFinite(Number(n))
      ? THREE.MathUtils.clamp(Number(n), min, max) : fallback;
    this.preferences = {
      cameraDistance: bounded(value.cameraDistance, 1, .8, 1.3),
      cameraFov: bounded(value.cameraFov, 58, 48, 80),
      speedFov: bounded(value.speedFov, 1, 0, 2),
    };
  }

  snap(player) {
    this.clearanceCache = { fixedAxis: this.mode === 'fixed' };
    this.initialized = false;
    this.wasReturning = false;
    this.returnHold = 0;
    this.distance = THPS_CAMERA.distance;
    this.height = THPS_CAMERA.height;
    this.occlusionDistance = null;
    this.occlusionActive = false;
    this.lookYaw = 0; this.lookTilt = 0; this.lookHold = 0;
    this.trickZoomActive = false; this.zoom = 1;
    this.lookAhead = 0;
    this.aimTarget = null;
    this.airborneTime = 0;
    this.landingSettle = 0;
    this.testOrbit = null;
    this.testCrane = 0;
    this.update(player, 1, {});
  }

  update(player, dt, input = {}, presentationPosition = null) {
    dt = THREE.MathUtils.clamp(Number(dt) || 0, 0, 0.1);
    const reducedMotion=this.motionPreference?.matches===true;
    const firstFrame = !this.initialized;
    const state = captureCameraState(player, {
      previousDirection: this.direction,
      initialized: this.initialized,
      presentationPosition,
    });
    const classic = this.mode !== 'fixed';
    const highFollow = this.mode === 'follow' || this.mode === 'follow-test' || this.mode === 'follow-close' || this.mode === 'follow-low';
    const testOrbitMode = this.mode === 'follow-test';
    const returning = state.transitionReturning;
    this.landingSettle = Math.max(0, this.landingSettle - dt);
    if (!state.grounded && !state.grindActive && !state.bailing) this.airborneTime += dt;
    else {
      // Ignore one-frame wheel-contact flicker. A real landing settles the
      // lens height and boom gently without adding camera shake or yaw.
      if (state.grounded && this.airborneTime >= .1 && !state.bailing)
        this.landingSettle = THPS_CAMERA.landingSettleDuration;
      this.airborneTime = 0;
    }
    const landingBlend = this.landingSettle / THPS_CAMERA.landingSettleDuration;
    if (classic) {
      if (!this.initialized) this.direction.copy(state.travelDirection);
      if (returning && !this.wasReturning) {
        this.vertDirection.copy(highFollow && state.returnDirection ? state.returnDirection : this.direction);
        // A trick/vert transition must not reset a player-selected look angle
        // in one frame. Release manual look through the normal damped recovery.
        if (highFollow) this.lookHold = 0;
        if (testOrbitMode && !firstFrame) {
          const from = yawOf(this.direction), to = yawOf(this.vertDirection), delta = wrapAngle(to - from);
          if (Math.abs(delta) >= THPS_CAMERA.testOrbitMinimumAngle) {
            const frame = highFollowFraming({ ...state, transitionReturning: true });
            const side = this.chooseOrbitSide(player, from, delta, frame.distance, frame.height);
            this.testOrbit = { stage: 'rise', time: 0, from, to, side, yaw: from, mid: from, source: 'vert' };
          }
        }
      }
      // Vert air off any ramp (rising mostly straight up): start the staged
      // orbit as the rider climbs, so the camera is at the side view, above
      // the coping, before the ramp can come between it and the rider.
      this.testOrbitCooldown = Math.max(0, (this.testOrbitCooldown || 0) - dt);
      if (testOrbitMode && !this.testOrbit && !firstFrame && !this.testOrbitCooldown && !state.bailing
        && !state.grindActive && !state.grounded && this.airborneTime > .04 && state.verticalSpeed > 3
        && state.horizontalSpeed < Math.max(3.5, state.verticalSpeed * .7)) {
        const from = yawOf(this.direction), to = wrapAngle(from + Math.PI);
        const frame = highFollowFraming({ ...state, transitionReturning: true });
        const side = this.chooseOrbitSide(player, from, Math.PI, frame.distance, frame.height);
        this.testOrbit = { stage: 'rise', time: 0, from, to, side, yaw: from, mid: from, source: 'air' };
      }
      if (this.testOrbit && !returning && state.grounded && this.testOrbit.stage !== 'finish') {
        this.testOrbit.stage = 'finish'; this.testOrbit.time = 0; this.testOrbit.mid = this.testOrbit.yaw;
      }
      if (returning) this.returnHold = THPS_CAMERA.landingHoldTime;
      else {
        // Keep the chosen return side through touchdown. Release only into
        // matching downhill travel or deliberate player steering, never a stale
        // uphill heading from the coping contact.
        const aligned = state.travelDirection.dot(this.vertDirection) > 0.5;
        // A mismatched downhill vector must never latch the camera on the
        // old vert side forever. Deliberate steering/alignment clears it sooner.
        const deliberateExit = aligned || Math.abs(input.steer || 0) > 0.25
          || state.grindActive || input.vertExit;
        this.returnHold = Math.max(0, this.returnHold - dt * (deliberateExit ? 2 : 1));
      }
      // High Follow anticipates the downhill return as soon as vert air begins.
      // Classic retains its original ramp-side framing. Trick spins steer neither.
      if (this.testOrbit) {
        // Aim the end of the swing at the return heading: the vert return when the
        // game reports one, otherwise the real travel once the rider is coming back.
        if (this.testOrbit.source === 'vert') this.testOrbit.to = yawOf(this.vertDirection);
        else if (state.verticalSpeed < 0 && state.horizontalSpeed > 2) this.testOrbit.to = yawOf(state.travelDirection);
        this.direction.copy(directionOfYaw(this.stepTestOrbit(state, dt, state.grounded && !returning)));
      } else if (returning || this.returnHold > 0) {
        if (highFollow) {
          // Even a true 180-degree coping reversal must not whip the camera.
          const reverse = this.direction.dot(this.vertDirection) < THPS_CAMERA.reverseDotThreshold;
          const rate = reverse ? THPS_CAMERA.reverseReturnReframeRate : THPS_CAMERA.returnReframeRate;
          this.direction.copy(smoothCameraDirection(this.direction, this.vertDirection, dt, rate,
            THPS_CAMERA.maximumTrackedYawRadiansPerSecond));
        } else this.direction.copy(this.vertDirection);
      }
      else if (!state.bailing) this.direction.copy(smoothCameraDirection(
        this.direction, state.travelDirection, dt,
        cameraDirectionRate(this.direction, state.travelDirection),
        THPS_CAMERA.maximumTrackedYawRadiansPerSecond));
      if (returning && state.doingTrick) this.trickZoomActive = true;
      if (!returning) this.trickZoomActive = false;
      const zoomTarget = highFollow || reducedMotion ? 1 : this.trickZoomActive ? THPS_CAMERA.classicTrickZoom
        : state.grindActive ? THPS_CAMERA.classicGrindZoom : 1;
      this.zoom = THREE.MathUtils.lerp(this.zoom, zoomTarget, 1 - Math.exp(-5 * dt));
      const highFrame = highFollow ? highFollowFraming({ ...state, transitionReturning: returning || this.returnHold > 0 }) : null;
      let distance = highFollow ? highFrame.distance
        : returning ? THPS_CAMERA.classicVertDistance
        : state.grounded || state.grindActive ? THPS_CAMERA.distance : THPS_CAMERA.airDistance;
      let height = highFollow ? highFrame.height
        : returning ? THPS_CAMERA.classicVertHeight
        : state.grounded || state.grindActive ? THPS_CAMERA.height : THPS_CAMERA.airHeight;
      if (landingBlend > 0 && state.grounded && !returning && !state.grindActive) {
        const airFrame = highFollow ? highFollowFraming({ ...state, grounded: false })
          : { distance: THPS_CAMERA.airDistance, height: THPS_CAMERA.airHeight };
        distance = THREE.MathUtils.lerp(distance, airFrame.distance, landingBlend);
        height = THREE.MathUtils.lerp(height, airFrame.height, landingBlend);
      }
      const blend = this.initialized ? 1 - Math.exp(-THPS_CAMERA.contextFollowRate * dt) : 1;
      this.distance = THREE.MathUtils.lerp(this.distance, distance * this.zoom, blend);
      this.height = THREE.MathUtils.lerp(this.height, height, blend);
      if (input.cameraActive && !returning) {
        this.lookYaw -= (input.mouseDX || 0) * 0.004 + (input.cameraX || 0) * dt * 2.1;
        this.lookTilt = THREE.MathUtils.clamp(this.lookTilt
          + (input.mouseDY || 0) * 0.003 + (input.cameraY || 0) * dt, -0.45, 0.65);
        this.lookHold = 1.2;
      } else {
        this.lookHold = returning ? 0 : Math.max(0, this.lookHold - dt);
        if (!this.lookHold) {
          const recenterRate = returning ? 6.5 : 4;
          this.lookYaw = wrapAngle(this.lookYaw) * Math.exp(-recenterRate * dt);
          this.lookTilt *= Math.exp(-recenterRate * dt);
        }
      }
    } else {
      this.direction.set(0, 0, -1);
      this.distance = THPS_CAMERA.distance;
      this.height = THPS_CAMERA.height;
    }
    this.wasReturning = returning;
    if (!this.initialized) this.followCenter = state.position.clone();
    else {
      // Fast cruises need a faster tripod, not an ever-growing lag behind a
      // 20+ m/s skater. Exponential damping remains stable across frame rates.
      const followRate = THPS_CAMERA.positionFollowRate + Math.min(
        THPS_CAMERA.highSpeedFollowCap,
        state.horizontalSpeed * THPS_CAMERA.highSpeedFollowGain,
      );
      const horizontal = 1 - Math.exp(-followRate * dt);
      const verticalRate = returning ? THPS_CAMERA.vertVerticalFollowRate
        : classic && landingBlend > 0 ? THREE.MathUtils.lerp(THPS_CAMERA.verticalFollowRate,
          THPS_CAMERA.landingVerticalFollowRate, landingBlend) : THPS_CAMERA.verticalFollowRate;
      const vertical = 1 - Math.exp(-verticalRate * dt);
      this.followCenter.x = THREE.MathUtils.lerp(this.followCenter.x, state.position.x, horizontal);
      this.followCenter.z = THREE.MathUtils.lerp(this.followCenter.z, state.position.z, horizontal);
      this.followCenter.y = THREE.MathUtils.lerp(this.followCenter.y, state.position.y, vertical);
      const lag = this.followCenter.clone().sub(state.position);
      if (lag.length() > THPS_CAMERA.maximumFollowLag) {
        this.followCenter.copy(state.position).add(lag.setLength(THPS_CAMERA.maximumFollowLag));
      }
    }
    const viewDirection = this.direction.clone();
    if (classic) viewDirection.applyAxisAngle(UP, this.lookYaw);
    // A small bounded lead keeps the approaching lip or narrow-run obstacle
    // visible before the rider reaches it. Retaining the canonical travel
    // direction prevents flip tricks and fakie stance from steering the aim.
    const fastLead = Math.min(THPS_CAMERA.fastLookAheadCap,
      Math.max(0, state.horizontalSpeed - 12) * THPS_CAMERA.fastLookAheadGain);
    const baseLead = highFollow
      ? highFollowFraming({ ...state, transitionReturning: returning || this.returnHold > 0 }).lookAhead
      : classic && !returning ? 0.55 : 0;
    const lookAheadTarget = classic
      ? baseLead + (returning ? 0 : fastLead * (highFollow ? 1 : 0.45)) : 0;
    this.lookAhead = classic ? THREE.MathUtils.lerp(this.lookAhead, lookAheadTarget,
      this.initialized ? 1 - Math.exp(-8 * dt) : 1) : 0;
    let frameDistance = this.distance * this.preferences.cameraDistance
      * (testOrbitMode ? 1 - THPS_CAMERA.testCranePull * (this.testCrane / THPS_CAMERA.testCraneHeight) : 1);
    if (!this.testOrbit) this.testCrane = Math.max(0, this.testCrane - dt * 4);
    let frameHeight = this.height + (classic ? this.lookTilt * 3 : 0) + (testOrbitMode ? this.testCrane : 0);
    if (this.mode === 'follow-close' || this.mode === 'follow-low') {
      // Scale the whole eye-to-target vector to keep the Follow viewing angle;
      // the low variant uses the same closer distance with a lower eye.
      const scale = 0.72;
      frameDistance = Math.max(2.6, (frameDistance + this.lookAhead) * scale - this.lookAhead);
      const rise = frameHeight + THPS_CAMERA.anchorHeight - THPS_CAMERA.targetHeight;
      frameHeight = rise * (this.mode === 'follow-low' ? 0.38 : scale)
        - THPS_CAMERA.anchorHeight + THPS_CAMERA.targetHeight;
    }
    const frame = fixedChaseFrame({ position: this.followCenter }, viewDirection,
      { ...THPS_CAMERA, distance: frameDistance,
        height: frameHeight,
        lookAhead: this.lookAhead });
    this.position.copy(frame.desired);
    if (firstFrame || !this.aimTarget) this.aimTarget = frame.target.clone();
    else {
      const rate = THPS_CAMERA.targetFollowRate + Math.min(5,
        state.horizontalSpeed * THPS_CAMERA.fastAimRateGain);
      this.aimTarget.lerp(frame.target, 1 - Math.exp(-rate * dt));
      const aimLag = this.aimTarget.distanceTo(frame.target);
      if (aimLag > THPS_CAMERA.maximumAimLag) {
        this.aimTarget.lerp(frame.target, 1 - THPS_CAMERA.maximumAimLag / aimLag);
      }
    }
    this.target.copy(this.aimTarget);
    // Fixed is intentionally a constant-lens, world-axis shot. Gameplay
    // follow modes can gently open their lens at speed; portrait displays get
    // extra visibility without altering the avatar or authored geometry.
    const speedFov = this.mode === 'fixed' || reducedMotion ? 0 : Math.min(
      THPS_CAMERA.highSpeedFovCap,
      Math.max(0, state.horizontalSpeed - 12) * THPS_CAMERA.highSpeedFovGain);
    const portraitFov = this.mode === 'fixed' ? 0 : Math.min(
      THPS_CAMERA.portraitFovCap, Math.max(0, 1.2 - (this.camera.aspect || 1.78)) * 3);
    const requestedFov = this.preferences.cameraFov + speedFov * this.preferences.speedFov + portraitFov;
    if (Math.abs(this.camera.fov - requestedFov) > 0.05) {
      this.camera.fov = THREE.MathUtils.lerp(this.camera.fov, requestedFov,
        firstFrame ? 1 : 1 - Math.exp(-5 * dt));
      this.camera.updateProjectionMatrix();
    }
    this.initialized = true;

    // The tripod is intentionally smoothed, but all clearance rays originate
    // at the real rider, so follow lag never conceals a camera/character overlap.
    const riderAnchor = (player?.position?.clone?.() || state.position.clone())
      .addScaledVector(UP, THPS_CAMERA.anchorHeight);
    const minArm = state.wallRideActive ? 3.3 : 2.35;
    this.clearanceCache.fixedAxis = highFollow || this.mode === 'fixed';
    this.clearanceCache.minimumDistance = minArm;
    // Wallride contact normals identify the open side of the wall; passing
    // them only to the collision solver preserves Follow/Classic camera mode.
    this.clearanceCache.wallNormal = state.wallRideActive
      ? player?.wallRide?.normal : null;
    let resolvedPosition = resolveCameraClearance(
      player?.surface, riderAnchor, this.position, this.camera.position, this.clearanceCache,
    );
    // On some coping lips and deck edges the head anchor itself touches the
    // ramp, so every sightline fails at zero length and the camera would land
    // on the rider's head (rider gone, sky only). Re-solve from a nearby clear
    // anchor; if none is clear, hold the last verified eye for this frame.
    let clearanceAnchor = riderAnchor;
    if (resolvedPosition.distanceTo(riderAnchor) < minArm && player?.surface?.camera && player?.position) {
      let fixed = false;
      for (const lift of [0.55, 2.2, 3.4]) {
        const alt = player.position.clone().addScaledVector(UP, lift);
        const solved = resolveCameraClearance(player.surface, alt,
          this.position.clone().add(alt.clone().sub(riderAnchor)), null, null);
        if (solved.distanceTo(alt) >= minArm) {
          resolvedPosition = solved;
          clearanceAnchor = alt;
          fixed = true;
          break;
        }
      }
      if (!fixed && !firstFrame && this.camera.position.distanceTo(riderAnchor) >= minArm) {
        if (player?.visual) player.visual.visible = true;
        this.occlusionActive = true;
        // Aim at the rider directly: the damped target can lag a fast drop-in.
        this.camera.lookAt(this.framedTarget(player));
        return;
      }
    }
    const wasOccluded = this.occlusionActive;
    const eyeOffset = resolvedPosition.clone().sub(clearanceAnchor);
    const clearDistance = eyeOffset.length();
    const clipped = resolvedPosition.distanceToSquared(this.position) > 0.0001;

    // Occlusion gets out of the way immediately and releases smoothly. Never
    // expand the collision-verified eye vector beyond the resolved distance:
    // that would put the camera back inside the very wall that shortened it.
    if (this.occlusionDistance === null || clearDistance < this.occlusionDistance) {
      this.occlusionDistance = clearDistance;
    } else {
      this.occlusionDistance = THREE.MathUtils.lerp(this.occlusionDistance, clearDistance,
        1 - Math.exp(-THPS_CAMERA.occlusionReleaseRate * dt));
    }
    // Never keep a one-metre first-person-looking arm while an actually
    // collision-verified third-person point is already available. Do not
    // extrapolate if the world is too narrow to offer this clearance.
    const safeDistance = Math.min(clearDistance, Math.max(minArm, this.occlusionDistance));
    if (clearDistance > 1e-8) eyeOffset.multiplyScalar(safeDistance / clearDistance);
    this.occlusionActive = clipped || safeDistance < clearDistance - 0.02;
    const safeEye = clearanceAnchor.clone().add(eyeOffset);
    // Smooth the lateral/vertical escape once the old camera is still in a
    // valid third-person space. A final collision sweep is mandatory: never
    // visually interpolate through a wall for the sake of a smooth transition.
    if (!firstFrame && (clipped || wasOccluded) && player?.surface?.camera) {
      const intermediate = this.camera.position.clone().lerp(safeEye,
        1 - Math.exp(-THPS_CAMERA.occlusionSideFollowRate * dt));
      const checked = player.surface.camera(clearanceAnchor, intermediate, 0.28);
      const unobstructed = checked.distanceToSquared(intermediate) < 0.0025
        && checked.distanceTo(clearanceAnchor) >= minArm;
      this.camera.position.copy(unobstructed ? intermediate : safeEye);
    } else if (!firstFrame && !clipped && !wasOccluded && dt > 0) {
      // Clear sight lines also need a damped tripod. Previously the camera
      // jumped straight to the new eye whenever per-wheel ground normals or
      // travel heading changed between frames, creating visible screen shake.
      // Preserve the collision authority: accept interpolation only when its
      // entire eye ray is verified clear, never look through a wall.
      const alpha = 1 - Math.exp(-11 * dt);
      const candidate = this.camera.position.clone().lerp(safeEye, alpha);
      const tested = player?.surface?.camera
        ? player.surface.camera(clearanceAnchor, candidate, 0.28) : candidate;
      const safe = tested.distanceToSquared(candidate) < 0.0025
        && candidate.distanceTo(clearanceAnchor) >= minArm;
      this.camera.position.copy(safe ? candidate : safeEye);
    } else {
      this.camera.position.copy(safeEye);
    }
    // Even when geometry offers no minimum-clearance solution, never hide the
    // model or choose an untested point through a solid surface.
    if (player?.visual) player.visual.visible = true;
    this.camera.lookAt(this.framedTarget(player));
  }

  /**
   * The aim point is damped, so after a fast drop-in it can trail metres above
   * the rider. When the camera is pulled in close (walls, coping) that lag
   * pushes the rider off screen. Turn the final aim just enough to keep the
   * rider inside ~70% of the lens; with no lag this returns the target as is.
   */
  framedTarget(player) {
    if (!player?.position) return this.target;
    const eye = this.camera.position;
    const toTarget = this.target.clone().sub(eye), toRider = player.position.clone().addScaledVector(UP, 0.9).sub(eye);
    const reach = toTarget.length();
    if (reach < 1e-6 || toRider.lengthSq() < 1e-6) return this.target;
    const angle = toTarget.angleTo(toRider);
    const limit = THREE.MathUtils.degToRad(this.camera.fov * 0.5 * 0.7);
    if (angle <= limit) return this.target;
    const turn = new THREE.Quaternion().setFromUnitVectors(toTarget.clone().normalize(), toRider.normalize());
    const partial = new THREE.Quaternion().slerp(turn, 1 - limit / angle);
    return eye.clone().add(toTarget.applyQuaternion(partial).setLength(reach));
  }
}
