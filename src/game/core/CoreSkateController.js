import { PlayerState } from './PlayerState.js';
import { TransitionController } from '../transitions/TransitionController.js';
import { CollisionResolver } from '../collision/CollisionResolver.js';
import { interpretOllieRelease } from '../../input/InputInterpreter.js';
import { resolveTravelState } from './TravelState.js';
import { rampLaunchBonus, updateRampLaunchMemory } from './LaunchEnergyModel.js';
import { captureTakeoffContext } from './TakeoffContext.js';
import {
  groundSteeringDelta,
  resolveGroundMotion,
  resolveGroundPropulsion,
  signedGroundSpeed,
} from './GroundMotor.js';
import { resolveAirMotion } from './AirController.js';
import { evaluateDeckCatch } from './DeckCatchResult.js';
import {
  resolveSweepReentryCandidate,
  resolveWheelReentryCandidate,
} from './TransitionReentryResult.js';
import { applyGrindEntry, resolveGrindCapture } from './GrindCaptureController.js';
import { resolveRuntimeMovementMode } from './MovementStateResolver.js';
import { resolveGroundStepStart } from './GroundStepResult.js';
import {
  advanceTransitionExitIntent,
  applyTransitionExitIntentToCandidate,
} from '../transitions/TransitionIntent.js';

/**
 * Phase 1 composition root.
 *
 * The legacy class hierarchy remains temporarily for behavior parity, but the
 * canonical state/transition/collision services are owned here and shared by all
 * adapters. New core authorities should be attached here rather than introduced
 * as another physics subclass.
 */
export class CoreSkateController {
  constructor({
    rails = [],
    surface = null,
    playerState = null,
  } = {}) {
    this.state = playerState || new PlayerState();
    this.transitions = new TransitionController({ rails });
    this.collision = surface ? new CollisionResolver(surface) : null;
  }

  syncState(runtime) {
    return this.state.syncFromLegacy(runtime);
  }

  interpretOllieRelease(context) {
    return interpretOllieRelease(context);
  }

  measureGroundSpeed(context) {
    return signedGroundSpeed(context);
  }

  resolveGroundSteering(context) {
    return groundSteeringDelta(context);
  }

  resolveGroundMotion(context) {
    return resolveGroundMotion(context);
  }

  resolveGroundPropulsion(context) {
    return resolveGroundPropulsion(context);
  }

  resolveGroundStepStart(context) {
    return resolveGroundStepStart(context);
  }

  resolveAirMotion(context) {
    return resolveAirMotion(context);
  }

  resolveDeckCatch(context) {
    return evaluateDeckCatch(context);
  }

  resolveWheelReentry(context) {
    return resolveWheelReentryCandidate(context);
  }

  resolveSweepReentry(context) {
    return resolveSweepReentryCandidate(context);
  }

  resolveGrindCapture(context) {
    return resolveGrindCapture(context);
  }

  enterGrind(runtime, trick) {
    if (!runtime) return false;
    const capture = this.resolveGrindCapture({
      position: runtime.position,
      forward: runtime.forward,
      velocity: runtime.velocity,
      railNetwork: runtime.railNetwork,
      trick,
    });
    return applyGrindEntry(runtime, capture, trick);
  }

  resolveMovementMode(runtime) {
    return resolveRuntimeMovementMode(runtime);
  }

  updateTransitionExitIntent(runtime, input, dt) {
    const state = advanceTransitionExitIntent({
      remaining: runtime?.rampExitIntentTime || 0,
      dt,
      input,
      normalY: runtime?.normal?.y ?? 1,
      verticalSpeed: runtime?.velocity?.y ?? 0,
    });
    if (runtime) runtime.rampExitIntentTime = state.remaining;
    return state;
  }

  prepareTransitionTakeoff(runtime, transition = null) {
    const result = applyTransitionExitIntentToCandidate({
      controller: this,
      runtime,
      transition,
    });
    if (runtime && result.consumed) runtime.rampExitIntentTime = 0;
    return result;
  }

  syncTravel(runtime, {
    preserveIfSlow = true,
    signMemoryThreshold = 0.18,
    directionThreshold = signMemoryThreshold,
  } = {}) {
    if (!runtime) return null;
    const resolved = resolveTravelState({
      velocity: runtime.velocity,
      deckHeading: runtime.heading,
      previousDirection: runtime.travelDirection || this.state.travelDirection,
      previousSign: runtime.rollingSign,
      preserveDirectionIfSlow: preserveIfSlow,
      config: { signMemoryThreshold, directionThreshold },
    });

    // Canonical state receives the resolved relationship first.
    this.state.deckHeading = Number.isFinite(Number(runtime.heading))
      ? Number(runtime.heading)
      : this.state.deckHeading;
    this.state.travelDirection.copy(resolved.travelDirection);
    this.state.stance = Number(runtime.stance) < 0 ? -1 : 1;

    // Compatibility fields remain outputs while old callers migrate away.
    runtime.travelDirection ||= resolved.travelDirection.clone();
    runtime.travelDirection.copy(this.state.travelDirection);
    runtime.rollingSign = resolved.rollingSign;
    runtime.fakie = this.state.fakie;
    return resolved;
  }

  updateRampEnergy(runtime, dt = 0) {
    if (!runtime) return 0;
    const sample = runtime.grounded
      ? rampLaunchBonus({
        speed: runtime.velocity?.length?.() || 0,
        normalY: runtime.normal?.y ?? 1,
        verticalSpeed: runtime.velocity?.y ?? 0,
      })
      : 0;
    const memory = updateRampLaunchMemory({
      previousBoost: runtime.rampLaunchMemory,
      previousTime: runtime.rampLaunchMemoryTime,
      sampleBoost: sample,
      dt,
    });
    runtime.rampLaunchMemory = memory.boost;
    runtime.rampLaunchMemoryTime = memory.time;
    return sample;
  }

  captureTakeoff(runtime, requestedImpulse = 0, transition = null) {
    return captureTakeoffContext({
      grounded: runtime?.grounded,
      normal: runtime?.normal,
      velocity: runtime?.velocity,
      forward: runtime?.forward,
      travelDirection: runtime?.travelDirection,
      heading: runtime?.heading,
      stance: runtime?.stance,
      requestedImpulse,
      transition,
      rampLaunchMemory: runtime?.rampLaunchMemory,
      rampLaunchMemoryTime: runtime?.rampLaunchMemoryTime,
      rampExitIntentTime: runtime?.rampExitIntentTime,
    });
  }

  consumeRampEnergy(runtime) {
    if (!runtime) return;
    runtime.rampLaunchMemory = 0;
    runtime.rampLaunchMemoryTime = 0;
  }

  ensureCollision(surface) {
    if (!surface) return null;
    if (!this.collision || this.collision.surface !== surface) {
      this.collision = new CollisionResolver(surface);
    }
    return this.collision;
  }

  bindLegacyRuntime(runtime) {
    if (!runtime) return this;
    runtime.playerState = this.state;
    runtime.transitionController = this.transitions;
    runtime.transitions = this.transitions;
    if (this.collision) runtime.collisionResolver = this.collision;
    return this;
  }
}
