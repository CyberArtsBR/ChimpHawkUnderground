import { StableRampReturnSkillStreetPhysics } from './StableRampReturnSkillStreetPhysics.js';
import {
  LAUNCH_ENERGY,
  rampLaunchBonus,
  updateRampLaunchMemory,
} from './core/LaunchEnergyModel.js';
import { captureTakeoffContext } from './core/TakeoffContext.js';
import { VERT_LAUNCH_ENVELOPE } from './transitions/TransitionController.js';

// Compatibility exports while call sites migrate to LaunchEnergyModel directly.
export const UNIFIED_RAMP_FEEL = LAUNCH_ENERGY;
export const unifiedRampAirBoost = rampLaunchBonus;
export const updateRampBoostMemory = updateRampLaunchMemory;

/**
 * Final park-feel authority for ramp launches.
 *
 * Authored quarters, bowls, banks and generic lips all consume one remembered
 * climb-energy sample. Lower mobility layers are no longer allowed to add a
 * second hidden ramp bonus, so final impulse composition happens exactly once.
 */
export class UnifiedRampFeelSkillStreetPhysics extends StableRampReturnSkillStreetPhysics {
  reset(position = this.spawn, heading = 0) {
    super.reset(position, heading);
    this.rampLaunchMemory = 0;
    this.rampLaunchMemoryTime = 0;
  }

  rememberRampClimb(dt = 0) {
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

  stepGround(dt, input = {}, drive = 0) {
    // Sample before lower layers move the final wheel over the lip and call takeoff.
    this.rememberRampClimb(dt);
    return super.stepGround(dt, input, drive);
  }

  takeoff(impulse = 0, transition = null) {
    const context = captureTakeoffContext({
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

    const result = super.takeoff(context.composedImpulse, transition, context);

    // Generic AIR lip releases were adding the climb's existing positive Y
    // velocity to the remembered ramp bonus. On tall quarters this could
    // produce 15+ m/s even when the authored coping was missed. Clamp only
    // ramp-origin departures; normal flat-ground Ollies are untouched.
    if (context.rampContext && !this.transitionAir?.transferring) {
      const maximum = context.requestedImpulse >= 4.5
        ? VERT_LAUNCH_ENVELOPE.maximumVerticalSpeed
        : VERT_LAUNCH_ENVELOPE.maximumPassiveVerticalSpeed;
      if (this.velocity.y > maximum) {
        this.velocity.y = maximum;
        if (this.transitionAir) {
          this.transitionAir.launchVertical = maximum;
        }
      }
    }

    // StableRampReturn uses this bit to apply identical no-auto-yaw/re-entry
    // semantics even when a generic lip became flat on the exact takeoff frame.
    if (context.rampContext) this.airTakeoffFromRamp = true;
    this.rampLaunchMemory = 0;
    this.rampLaunchMemoryTime = 0;
    return result;
  }
}
