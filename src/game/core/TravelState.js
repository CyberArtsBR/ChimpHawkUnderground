import * as THREE from 'three';
import { deckForwardFromHeading } from './PlayerState.js';

const EPSILON = 1e-8;

export const TRAVEL_STATE_CONFIG = Object.freeze({
  signMemoryThreshold: 0.18,
  directionThreshold: 0.18,
  alignmentHysteresis: 0.06,
});

export function horizontalUnit(source, fallback = null, out = new THREE.Vector3()) {
  out.set(Number(source?.x) || 0, 0, Number(source?.z) || 0);
  if (out.lengthSq() > EPSILON) return out.normalize();

  if (fallback) {
    out.set(Number(fallback?.x) || 0, 0, Number(fallback?.z) || 0);
    if (out.lengthSq() > EPSILON) return out.normalize();
  }
  return out.set(0, 0, -1);
}

/**
 * Signed travel relative to the deck nose. Positive = moving with deck forward,
 * negative = moving opposite the deck. At very low speed we keep the previous
 * sign so stopping does not randomly toggle fakie/regular presentation.
 */
export function signedTravelRelativeToDeck({
  velocity,
  deckHeading = 0,
  previousSign = 1,
  threshold = TRAVEL_STATE_CONFIG.signMemoryThreshold,
  alignmentHysteresis = TRAVEL_STATE_CONFIG.alignmentHysteresis,
} = {}) {
  const planar = new THREE.Vector3(
    Number(velocity?.x) || 0,
    0,
    Number(velocity?.z) || 0,
  );
  const speed = planar.length();
  const previous = Number(previousSign) < 0 ? -1 : 1;
  if (speed <= threshold) return previous;
  const deckForward = deckForwardFromHeading(deckHeading);
  // Near-perpendicular slide is not proof that the skater switched from
  // regular to fakie. Keep the sign until there is meaningful axial travel.
  const alignment = planar.dot(deckForward) / speed;
  if (Math.abs(alignment) < Math.max(0, alignmentHysteresis || 0)) return previous;
  return alignment < 0 ? -1 : 1;
}

/**
 * Canonical world travel state. This is a pure function so physics, camera and
 * replay validation can share one definition without each owning another copy of
 * fakie/rolling-sign math.
 */
export function resolveTravelState({
  velocity,
  deckHeading = 0,
  previousDirection = null,
  previousSign = 1,
  preserveDirectionIfSlow = true,
  config = TRAVEL_STATE_CONFIG,
} = {}) {
  const planarVelocity = new THREE.Vector3(
    Number(velocity?.x) || 0,
    0,
    Number(velocity?.z) || 0,
  );
  const planarSpeed = planarVelocity.length();
  const deckForward = deckForwardFromHeading(deckHeading);
  const rollingSign = signedTravelRelativeToDeck({
    velocity: planarVelocity,
    deckHeading,
    previousSign,
    threshold: config.signMemoryThreshold,
    alignmentHysteresis: config.alignmentHysteresis ?? TRAVEL_STATE_CONFIG.alignmentHysteresis,
  });

  const direction = new THREE.Vector3();
  if (planarSpeed > config.directionThreshold) {
    direction.copy(planarVelocity).multiplyScalar(1 / planarSpeed);
  } else if (preserveDirectionIfSlow && previousDirection) {
    horizontalUnit(previousDirection, deckForward, direction);
  } else {
    direction.copy(deckForward).multiplyScalar(rollingSign);
  }

  return {
    deckForward,
    travelDirection: direction,
    planarSpeed,
    rollingSign,
    fakie: rollingSign < 0,
  };
}
