import * as THREE from 'three';
import { PlayerState } from './PlayerState.js';
import { resolveTravelState } from './TravelState.js';

const EPSILON = 1e-8;
export const STATE_INVARIANT_CONFIG = Object.freeze({
  travelSpeedThreshold: 0.25,
  rollingSignThreshold: 0.18,
});

function addViolation(list, code, details = {}) {
  list.push({ code, ...details });
}

/**
 * Shadow-mode migration validator.
 *
 * This function is deliberately read-only. It compares the legacy inheritance
 * runtime with the new canonical PlayerState/TravelState model and reports
 * contradictions, but never repairs them. Once replay parity is proven, these
 * violations become removal targets for duplicated legacy writers.
 */
export function legacyStateViolations(
  controller,
  canonicalState = new PlayerState().syncFromLegacy(controller),
  config = STATE_INVARIANT_CONFIG,
) {
  const violations = [];
  const mode = controller?.movementState ?? null;
  const grounded = Boolean(controller?.grounded);
  const manual = controller?.manual ?? null;
  const transitionAir = controller?.transitionAir ?? null;

  const groundMode = mode === 'GROUND' || mode === 'MANUAL';
  if (grounded !== groundMode) {
    addViolation(violations, 'GROUND_MODE_MISMATCH', { grounded, mode });
  }
  if (mode === 'MANUAL' && !manual) {
    addViolation(violations, 'MANUAL_MODE_WITHOUT_MANUAL', { mode });
  }
  if (manual && grounded && mode !== 'MANUAL') {
    addViolation(violations, 'MANUAL_WITHOUT_MANUAL_MODE', { mode, manual });
  }
  if (transitionAir && !grounded && mode !== 'VERT_AIR') {
    addViolation(violations, 'TRANSITION_AIR_MODE_MISMATCH', { mode });
  }
  if (mode === 'VERT_AIR' && !transitionAir) {
    addViolation(violations, 'VERT_MODE_WITHOUT_TRANSITION', { mode });
  }
  if (grounded && transitionAir) {
    addViolation(violations, 'GROUNDED_WITH_TRANSITION_AIR', { mode });
  }

  const expectedTravel = resolveTravelState({
    velocity: controller?.velocity,
    deckHeading: canonicalState.deckHeading,
    previousDirection: controller?.travelDirection,
    previousSign: controller?.rollingSign,
    config: {
      signMemoryThreshold: config.rollingSignThreshold,
      directionThreshold: config.travelSpeedThreshold,
    },
  });
  const planarSpeed = expectedTravel.planarSpeed;

  if (planarSpeed > config.travelSpeedThreshold) {
    const legacyFakie = Boolean(controller?.fakie);
    if (legacyFakie !== expectedTravel.fakie) {
      addViolation(violations, 'FAKIE_DIVERGENCE', {
        legacyFakie,
        canonicalFakie: expectedTravel.fakie,
        planarSpeed,
      });
    }
  }

  if (planarSpeed > config.rollingSignThreshold) {
    const actualSign = Number(controller?.rollingSign);
    if (Number.isFinite(actualSign)
      && Math.sign(actualSign || 1) !== expectedTravel.rollingSign) {
      addViolation(violations, 'ROLLING_SIGN_DIVERGENCE', {
        legacyRollingSign: actualSign,
        expectedRollingSign: expectedTravel.rollingSign,
        planarSpeed,
      });
    }
  }

  const legacyTravel = controller?.travelDirection;
  if (legacyTravel && planarSpeed > config.travelSpeedThreshold) {
    const travel = new THREE.Vector3(
      Number(legacyTravel.x) || 0,
      0,
      Number(legacyTravel.z) || 0,
    );
    if (travel.lengthSq() > EPSILON) {
      travel.normalize();
      const alignment = travel.dot(expectedTravel.travelDirection);
      if (alignment < 0.25) {
        addViolation(violations, 'TRAVEL_DIRECTION_STALE', { alignment });
      }
    }
  }

  return violations;
}

export function stateInvariantCodes(violations = []) {
  return violations.map(entry => entry.code);
}
