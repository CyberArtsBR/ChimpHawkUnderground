import * as THREE from 'three';

const EPSILON = 1e-8;

function finiteNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function deckForwardFromHeading(heading, out = new THREE.Vector3()) {
  const h = finiteNumber(heading, 0);
  return out.set(-Math.sin(h), 0, -Math.cos(h)).normalize();
}

export function canonicalTravelDirection(source, fallbackHeading = 0, out = new THREE.Vector3()) {
  if (source) out.set(finiteNumber(source.x), 0, finiteNumber(source.z));
  else out.set(0, 0, 0);
  if (out.lengthSq() > EPSILON) return out.normalize();
  return deckForwardFromHeading(fallbackHeading, out);
}

/**
 * Fakie is not independent state. It is the relationship between where the deck
 * points and where the skater is actually travelling. Hysteresis belongs in the
 * future travel-direction owner; this pure derivation intentionally has none.
 */
export function deriveFakie({ deckHeading = 0, travelDirection = null } = {}) {
  const deckForward = deckForwardFromHeading(deckHeading, new THREE.Vector3());
  const travel = canonicalTravelDirection(travelDirection, deckHeading, new THREE.Vector3());
  return deckForward.dot(travel) < 0;
}

/**
 * Canonical Phase 1 gameplay state model.
 *
 * During migration this class is an adapter only: it reads the legacy runtime and
 * exposes the future ownership model without changing gameplay. Controllers will
 * gradually be moved to write this state directly once replay parity is proven.
 */
export class PlayerState {
  constructor() {
    this.position = new THREE.Vector3();
    this.velocity = new THREE.Vector3();
    this.surfaceNormal = new THREE.Vector3(0, 1, 0);
    this.travelDirection = new THREE.Vector3(0, 0, -1);
    this.deckHeading = 0;
    this.stance = 1;
    this.mode = 'AIR';
    this.grounded = false;
    this.transitionId = null;
    this.transitionType = null;
    this.grind = null;
    this.manual = null;
  }

  get deckForward() {
    return deckForwardFromHeading(this.deckHeading, new THREE.Vector3());
  }

  get fakie() {
    return deriveFakie({
      deckHeading: this.deckHeading,
      travelDirection: this.travelDirection,
    });
  }

  syncFromLegacy(controller) {
    this.position.copy(controller?.position || new THREE.Vector3());
    this.velocity.copy(controller?.velocity || new THREE.Vector3());
    this.surfaceNormal.copy(controller?.normal || new THREE.Vector3(0, 1, 0));
    this.deckHeading = finiteNumber(controller?.heading, this.deckHeading);

    const velocityHorizontal = controller?.velocity
      ? new THREE.Vector3(controller.velocity.x, 0, controller.velocity.z)
      : null;
    const legacyTravel = controller?.travelDirection;
    const travelSource = velocityHorizontal?.lengthSq() > EPSILON
      ? velocityHorizontal
      : legacyTravel;
    canonicalTravelDirection(travelSource, this.deckHeading, this.travelDirection);

    this.stance = finiteNumber(controller?.stance, 1) < 0 ? -1 : 1;
    this.mode = controller?.movementState ?? this.mode;
    this.grounded = Boolean(controller?.grounded);
    this.transitionId = controller?.transitionAir?.transitionId
      ?? controller?.transitionAir?.frame?.transitionId
      ?? null;
    this.transitionType = controller?.transitionAir?.transitionType
      ?? controller?.transitionAir?.frame?.transitionType
      ?? null;
    this.grind = controller?.grind?.trick?.name ?? null;
    this.manual = controller?.manual ?? null;
    return this;
  }

  toJSON() {
    return {
      position: this.position.toArray(),
      velocity: this.velocity.toArray(),
      surfaceNormal: this.surfaceNormal.toArray(),
      travelDirection: this.travelDirection.toArray(),
      deckHeading: this.deckHeading,
      stance: this.stance,
      fakie: this.fakie,
      mode: this.mode,
      grounded: this.grounded,
      transitionId: this.transitionId,
      transitionType: this.transitionType,
      grind: this.grind,
      manual: this.manual,
    };
  }
}
