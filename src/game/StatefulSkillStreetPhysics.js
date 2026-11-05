import * as THREE from 'three';
import { SafeCopingExitSkillStreetPhysics } from './SafeCopingExitSkillStreetPhysics.js';
import { ARCADE_PARK_MOBILITY } from './ArcadeParkMobilitySkillStreetPhysics.js';
import { MOVEMENT_STATE, PHYSICS } from './StreetPhysics.js';
import {
  PUMP_CONFIG,
  computePumpEnergy,
  evaluatePumpEligibility,
  phaseFromMotion,
  pumpEventTier,
  pumpTimingQuality,
} from './PumpSystem.js';
import { OLLIE_COMMAND } from '../input/InputInterpreter.js';
import { CoreSkateController } from './core/CoreSkateController.js';
import { PlayerState } from './core/PlayerState.js';
import { legacyStateViolations } from './core/LegacyStateInvariants.js';
import { rampLaunchBonus, updateRampLaunchMemory } from './core/LaunchEnergyModel.js';
import { captureTakeoffContext } from './core/TakeoffContext.js';
import { VERT_LAUNCH_ENVELOPE } from './transitions/TransitionController.js';
import { resolveRuntimeMovementMode } from './core/MovementStateResolver.js';
import { LaunchTelemetry } from './core/LaunchTelemetry.js';
import {
  applyLandingPostPipeline,
  captureLandingPostContext,
} from './core/LandingPostPipeline.js';

const clamp = THREE.MathUtils.clamp;

function horizontalFacing(source, fallback = null) {
  const out = source?.clone?.() || new THREE.Vector3();
  out.y = 0;
  if (out.lengthSq() > 1e-8) return out.normalize();
  if (fallback?.lengthSq?.() > 1e-8) {
    out.copy(fallback).setY(0);
    if (out.lengthSq() > 1e-8) return out.normalize();
  }
  return out.set(0, 0, -1);
}

/** Skill-based transition pumping layered on top of board contact + vert physics. */
export class StatefulSkillStreetPhysics extends SafeCopingExitSkillStreetPhysics {
  constructor(options = {}) {
    super(options);
    // Phase 1 composition root: canonical state, transition authority and body
    // collision are shared services instead of separate ownership hidden at
    // different prototype levels.
    this.coreController = new CoreSkateController({
      rails: options.rails || [],
      surface: this.surface,
      playerState: this.playerState,
    });
    this.coreController.bindLegacyRuntime(this);
    this.syncMovementState();
    this.syncCanonicalState();
  }

  syncMovementState() {
    this.movementState = this.coreController
      ? this.coreController.resolveMovementMode(this)
      : resolveRuntimeMovementMode(this);
    return this.movementState;
  }

  syncCanonicalState() {
    this.playerState ||= new PlayerState();
    const canonical = this.coreController
      ? this.coreController.syncState(this)
      : this.playerState.syncFromLegacy(this);
    this.playerState = canonical;
    this.stateInvariantViolations = legacyStateViolations(this, canonical);
    return canonical;
  }

  reset(position = this.spawn, heading = this.spawnHeading || 0) {
    super.reset(position, heading);
    this.launchTelemetry = new LaunchTelemetry();
    this.landingYawInvariantViolations = 0;
    this.lastLandingYawInvariant = null;
    this.playerState ||= new PlayerState();
    this.stateInvariantViolations = [];
    this.syncMovementState();
    this.syncCanonicalState();
    this.rampLaunchMemory = 0;
    this.rampLaunchMemoryTime = 0;

    this.rampTakeoffFacing ||= new THREE.Vector3(0, 0, -1);
    this.rampTakeoffFacing.copy(horizontalFacing(this.forward, this.travelDirection));
    this.airTakeoffFacing ||= new THREE.Vector3(0, 0, -1);
    this.airTakeoffFacing.copy(this.rampTakeoffFacing);
    this.airTakeoffHeading = heading;
    this.airTakeoffStance = Number(this.stance) || 1;
    this.airTakeoffFromRamp = false;

    this.pumpReleaseQueued = false;
    this.pumpEligible = false;
    this.pumpPhase = 0.5;
    this.pumpQuality = 0;
    this.pumpHoldTime = 0;
    this.pumpCooldown = 0;
    this.pumpLandingWindow = 0;
    this.pumpLandingImpact = 0;
    this.pumpPreviousNormal = null;
    this.pumpCurvatureMemory = 0;
    this.pumpState = 'OFF';
    this.pumpPresentationTimer = 0;
    this.pumpLastEnergy = 0;
    this.pumpLastDeltaSpeed = 0;
    this.pumpTangentSpeed = 0;
    this.gameplayEvents = [];
    this.pumpDebugEnabled = typeof globalThis.location !== 'undefined'
      && new URLSearchParams(globalThis.location.search).get('debug') === '1';
    this.pumpDebug = this.pumpDebugEnabled ? {} : null;
  }

  emitGameplayEvent(type, data = {}) { this.gameplayEvents.push({ type, ...data }); }
  drainGameplayEvents() { const events = this.gameplayEvents; this.gameplayEvents = []; return events; }
  getLaunchTelemetry() { return this.launchTelemetry.snapshot(); }
  drainLaunchTelemetry() { return this.launchTelemetry.drain(); }

  rememberRampClimb(dt = 0) {
    if (this.coreController) return this.coreController.updateRampEnergy(this, dt);

    const sample = this.grounded
      ? rampLaunchBonus({
        speed: this.velocity?.length?.() || 0,
        normalY: this.normal?.y ?? 1,
        verticalSpeed: this.velocity?.y ?? 0,
      })
      : 0;
    const memory = updateRampLaunchMemory({
      previousBoost: this.rampLaunchMemory,
      previousTime: this.rampLaunchMemoryTime,
      sampleBoost: sample,
      dt,
    });
    this.rampLaunchMemory = memory.boost;
    this.rampLaunchMemoryTime = memory.time;
    return sample;
  }

  samplePumpContacts() {
    if (!this.grounded || this.movementState !== MOVEMENT_STATE.GROUND || this.manual || this.grind || this.wallRide || this.bailTime > 0) {
      return { support: null, contactCount: 0, normal: this.normal.clone(), contactSpread: 0 };
    }

    // Consume the exact wheel contacts that currently support the board. This
    // avoids a second approximate wheel rig and four extra terrain probes/step.
    const support = this.lastWheelSupport?.supported ? this.lastWheelSupport : null;
    if (!support) return { support: null, contactCount: 0, normal: this.normal.clone(), contactSpread: 0 };

    const normal = support.normal.clone().normalize();
    let contactSpread = 0;
    for (const wheel of support.contacts || []) {
      if (!wheel.valid) continue;
      contactSpread = Math.max(contactSpread, wheel.normal.angleTo(normal));
    }
    return { support, contactCount: support.count || 0, normal, contactSpread };
  }

  applyPump(quality, state) {
    const tangent = this.velocity.clone().projectOnPlane(state.normal);
    const tangentSpeed = tangent.length();
    if (tangentSpeed < 1e-6) return { nextSpeed: tangentSpeed, deltaSpeed: 0, specificEnergy: 0, capFactor: 1 };

    const compression = Math.max(this.charge, clamp(this.pumpHoldTime / 0.28, 0, 1));
    const geometryFactor = clamp(0.68 + state.contactCount * 0.07 + Math.min(state.curvature * 1.6, 0.12), 0.55, 1);
    const result = computePumpEnergy({ tangentSpeed, quality, compression, geometryFactor });
    if (result.deltaSpeed > 0) this.velocity.copy(tangent.normalize()).multiplyScalar(result.nextSpeed);

    this.pumpLastEnergy = result.specificEnergy;
    this.pumpLastDeltaSpeed = result.deltaSpeed;
    this.pumpTangentSpeed = result.nextSpeed;
    const data = { quality, energyAdded: result.specificEnergy, deltaSpeed: result.deltaSpeed, tangentSpeed: result.nextSpeed, phase: this.pumpPhase };
    this.emitGameplayEvent('pump', data);
    const tier = pumpEventTier(quality);
    if (tier !== 'pump') this.emitGameplayEvent(tier, data);
    return result;
  }

  updatePumpState(dt, input) {
    if (this.bailTime > 0) {
      this.pumpReleaseQueued = false;
      this.pumpHoldTime = 0;
      this.charge = 0;
      return;
    }
    this.pumpCooldown = Math.max(0, this.pumpCooldown - dt);
    this.pumpLandingWindow = Math.max(0, this.pumpLandingWindow - dt);
    this.pumpPresentationTimer = Math.max(0, this.pumpPresentationTimer - dt);
    if (this.pumpPresentationTimer <= 0) this.pumpState = 'OFF';
    this.pumpCurvatureMemory *= Math.exp(-9 * dt);

    const contacts = this.samplePumpContacts();
    const supportNormal = contacts.normal;
    const normalDelta = this.pumpPreviousNormal && contacts.contactCount ? this.pumpPreviousNormal.angleTo(supportNormal) : 0;
    if (contacts.contactCount) this.pumpPreviousNormal = supportNormal.clone();
    else if (!this.grounded) this.pumpPreviousNormal = null;

    this.pumpCurvatureMemory = Math.max(this.pumpCurvatureMemory, normalDelta, contacts.contactSpread);
    const tangent = this.velocity.clone().projectOnPlane(supportNormal);
    const tangentSpeed = tangent.length();
    const ridingAlignment = tangentSpeed > 1e-6 ? Math.abs(this.forward.dot(tangent.clone().normalize())) : 0;
    const eligibility = evaluatePumpEligibility({
      contactCount: contacts.contactCount,
      normalY: supportNormal.y,
      normalDelta: this.pumpCurvatureMemory,
      contactSpread: contacts.contactSpread,
      tangentSpeed,
      ridingAlignment,
      landingWindow: this.pumpLandingWindow,
    });
    const phaseInfo = phaseFromMotion(supportNormal.y, this.velocity.y);
    this.pumpPhase = phaseInfo.phase;
    this.pumpQuality = pumpTimingQuality(this.pumpPhase);
    this.pumpTangentSpeed = tangentSpeed;

    const transitionApproach = this.grounded && this.movementState === MOVEMENT_STATE.GROUND
      ? this.transitions.approachAt(this.position, this.normal, this.velocity) : null;
    const nearCoping = Boolean(transitionApproach?.supportsVert);
    // A release while climbing is always a jump. Pumping remains available
    // on the descent and through the bottom of a transition.
    const climbing = this.normal.y < .995 && this.velocity.y > .05;
    this.pumpEligible = Boolean(eligibility.eligible && !nearCoping && !climbing);

    if (input.ollieHeld && this.pumpEligible) this.pumpHoldTime += dt;
    // Preserve accumulated compression through the physical release frame.
    // Clearing before interpretation made a normal held->released input report
    // zero hold time and could make real pumps unreachable at runtime.
    else if (!input.ollieHeld && !input.ollieReleased) this.pumpHoldTime = 0;
    else if (!input.ollieReleased) this.pumpHoldTime *= Math.exp(-8 * dt);

    let releaseCommand = OLLIE_COMMAND.NONE;
    if (input.ollieReleased) {
      releaseCommand = this.coreController.interpretOllieRelease({
        ollieReleased: true,
        grinding: false,
        grounded: this.grounded,
        nearCoping,
        pumpEligible: this.pumpEligible,
        pumpHoldTime: this.pumpHoldTime,
        pumpCooldown: this.pumpCooldown,
        pumpMinHold: PUMP_CONFIG.minHold,
      });

      this.launchTelemetry.resolve(releaseCommand, { nearCoping, coyote: this.coyote > 0 });
      if (releaseCommand === OLLIE_COMMAND.PUMP) {
        this.launchTelemetry.claim('pump');
        this.applyPump(this.pumpQuality, { normal: supportNormal, contactCount: contacts.contactCount, curvature: eligibility.curvature });
        this.pumpCooldown = PUMP_CONFIG.cooldown;
        this.pumpState = 'PUMP';
        this.pumpPresentationTimer = 0.18;
        this.charge = 0; this.jumpBuffer = 0; this.jumpCharge = 0;
      } else if (releaseCommand === OLLIE_COMMAND.PUMP_BLOCKED) {
        this.charge = 0; this.jumpBuffer = 0; this.jumpCharge = 0;
      } else if (releaseCommand === OLLIE_COMMAND.AIR_RELEASE && !(this.coyote > 0)) {
        // Allow the held charge to finish just after the wheels leave a lip.
        // It is consumed once and cannot turn a later release into a double jump.
        if (this.airTakeoffFromRamp && !this.takeoffOllieRequested
          && this.airTime <= .14 && this.velocity.y > 0 && this.charge > .05
          && this.launchTelemetry.claim('late-ramp')) {
          const impulse = THREE.MathUtils.lerp(PHYSICS.minJump, PHYSICS.maxJump, this.charge);
          this.velocity.y = Math.min(VERT_LAUNCH_ENVELOPE.maximumVerticalSpeed,
            Math.hypot(this.velocity.y, impulse * .85));
          this.takeoffOllieRequested = true;
          if (this.transitionAir) this.transitionAir.launchVertical = this.velocity.y;
          this.pendingOllieScore = { origin: this.position.clone(), normal: new THREE.Vector3(0, 1, 0) };
        }
        this.charge = 0; this.jumpBuffer = 0; this.jumpCharge = 0;
      } else if (releaseCommand !== OLLIE_COMMAND.NONE) {
        this.releaseJump();
      }
      this.pumpHoldTime = 0;
    }

    if (this.pumpDebugEnabled) {
      this.pumpDebug = {
        eligible: this.pumpEligible, contactCount: contacts.contactCount, slopeDeg: eligibility.slopeDeg,
        curvature: eligibility.curvature, normalDelta, contactSpread: contacts.contactSpread,
        phase: this.pumpPhase, timingQuality: this.pumpQuality, energyAdded: this.pumpLastEnergy,
        deltaSpeed: this.pumpLastDeltaSpeed, tangentSpeed: this.pumpTangentSpeed,
        cooldown: this.pumpCooldown, holdTime: this.pumpHoldTime,
        landingWindow: this.pumpLandingWindow, landingImpact: this.pumpLandingImpact,
        nearCoping,
        transitionId: transitionApproach?.transitionId ?? null,
        releaseCommand,
      };
    }
  }

  advance(delta, input = {}) {
    this.gameplayEvents = [];
    if (input.ollieReleased && !this.bailTime) this.launchTelemetry.beginRelease(this);
    const immediateCommand = this.coreController.interpretOllieRelease({
      ollieReleased: Boolean(input.ollieReleased),
      grinding: Boolean(this.grind),
      grounded: this.grounded,
    });

    if (immediateCommand === OLLIE_COMMAND.GRIND_OLLIE_OUT) {
      this.launchTelemetry.resolve(immediateCommand);
      this.launchTelemetry.claim('grind');
      // Preserve the validated immediate grind-pop timing, but execute the command
      // here so the base class never reinterprets this physical button release.
      this.exitGrind(true);
    } else if (input.ollieReleased && !this.bailTime) {
      this.pumpReleaseQueued = true;
    }

    // Preserve the former BaseStateful wrapper order exactly: semantic input
    // handling first, then canonical synchronization around lower execution.
    this.syncMovementState();
    this.syncCanonicalState();
    super.advance(delta, { ...input, ollieReleased: false });
    this.syncMovementState();
    this.syncCanonicalState();
  }

  step(dt, input = {}) {
    this.launchTelemetry.time += dt;
    this.copingTrace?.begin(this, input, dt);
    const releaseNow = this.pumpReleaseQueued;
    this.updatePumpState(dt, { ...input, ollieReleased: releaseNow });
    if (releaseNow) this.pumpReleaseQueued = false;

    this.syncMovementState();
    this.syncCanonicalState();
    super.step(dt, { ...input, ollieReleased: false });
    this.copingTrace?.finish(this);
    this.syncMovementState();
    this.syncCanonicalState();
    this.launchTelemetry.observe(this);
  }

  stepGround(dt, input = {}, drive = 0) {
    // Capture climb energy before the lower ground solver can move the final
    // wheel across the lip and trigger takeoff.
    this.rememberRampClimb(dt);
    return super.stepGround(dt, input, drive);
  }

  takeoff(impulse = 0, transition = null) {
    // A support retry cannot restart an already active flight or recharge it.
    if (!this.grounded && this.transitionAir) return false;
    this.pumpEligible = false;
    this.pumpHoldTime = 0;
    this.pumpPreviousNormal = null;

    // Preserve the pre-launch snapshot before consuming buffered transfer intent.
    // The prepared edge is then the single transition candidate passed through
    // orientation, transition-air creation and transfer-launch evaluation.
    const context = this.coreController
      ? this.coreController.captureTakeoff(this, impulse, transition)
      : captureTakeoffContext({
        grounded: this.grounded,
        normal: this.normal,
        velocity: this.velocity,
        forward: this.forward,
        travelDirection: this.travelDirection,
        heading: this.heading,
        stance: this.stance,
        requestedImpulse: impulse,
        transition,
        rampLaunchMemory: this.rampLaunchMemory,
        rampLaunchMemoryTime: this.rampLaunchMemoryTime,
        rampExitIntentTime: this.rampExitIntentTime,
      });

    const prepared = this.coreController
      ? this.coreController.prepareTransitionTakeoff(this, transition)
      : { edge: transition };
    const edge = prepared.edge;
    this.transitionLandingGrace = 0;
    this.rampExitIntentTime = 0;

    this.airTakeoffFacing ||= new THREE.Vector3(0, 0, -1);
    this.airTakeoffFacing.copy(context.takeoffFacing);
    this.airTakeoffHeading = context.takeoffHeading;
    this.airTakeoffStance = context.takeoffStance;
    this.airTakeoffFromRamp = context.rampContext;

    this.takeoffOllieRequested = context.requestedImpulse >= 4;
    const result = super.takeoff(context.composedImpulse, edge);
    if (this.takeoffOllieRequested && result !== false)
      this.launchTelemetry.claim(edge ? 'buffered-vert' : 'ground-or-coyote');

    // This is the actual shipping composition root (not the compatibility
    // UnifiedRampFeel prototype). A generic ramp lip can miss the coping edge
    // and add the remembered climb boost to an already large positive Y.
    // Enforce the same one-shot energy envelope for *both* AIR and VERT_AIR,
    // never on regular flat-ground Ollies or validated deck transfers.
    if (context.rampContext && !this.transitionAir?.transferring) {
      const maxY = context.requestedImpulse >= 4.5
        ? VERT_LAUNCH_ENVELOPE.maximumVerticalSpeed
        : VERT_LAUNCH_ENVELOPE.maximumPassiveVerticalSpeed;
      if (this.velocity.y > maxY) {
        this.velocity.y = maxY;
        if (this.transitionAir) this.transitionAir.launchVertical = maxY;
      }
    }

    if (this.transitionAir?.frame) {
      this.transitionAir.frame.takeoffFacing = context.takeoffFacing.clone();
      this.transitionAir.frame.takeoffStance = context.takeoffStance;
      this.transitionAir.frame.takeoffHeading = context.takeoffHeading;
    }

    if (this.coreController) this.coreController.consumeRampEnergy(this);
    else {
      this.rampLaunchMemory = 0;
      this.rampLaunchMemoryTime = 0;
    }
    return result;
  }

  land(support) {
    if (this.deferLandingPostHooks) return super.land(support);

    const context = captureLandingPostContext(this, support, {
      rampReentrySlopeY: ARCADE_PARK_MOBILITY.rampReentrySlopeY,
    });

    this.deferLandingPostHooks = true;
    let landed = false;
    try {
      landed = super.land(support);
    } finally {
      this.deferLandingPostHooks = false;
    }
    if (!landed) return false;

    const lowerLayerHeading = this.heading;
    applyLandingPostPipeline(this, support, context, {
      lowerLayerHeading,
      rampReentrySteerLock: ARCADE_PARK_MOBILITY.rampReentrySteerLock,
      pumpLandingWindow: PUMP_CONFIG.landingWindow,
    });
    return true;
  }
}
