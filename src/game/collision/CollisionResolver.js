import * as THREE from 'three';

const DEFAULT_UP = new THREE.Vector3(0, 1, 0);
const DEFAULT_FORWARD = new THREE.Vector3(0, 0, -1);

function cloneContact(contact) {
  if (!contact) return null;
  return {
    ...contact,
    normal: contact.normal?.clone?.() || null,
    point: contact.point?.clone?.() || null,
  };
}

/**
 * Explicit collision result. Deliberately contains no heading/yaw/orientation
 * field: collision may correct position and velocity, never deck yaw.
 */
export function collisionResult({
  position,
  velocity,
  contacts = [],
} = {}) {
  const clonedContacts = contacts.filter(Boolean).map(cloneContact);
  return {
    position: position?.clone?.() || new THREE.Vector3(),
    velocity: velocity?.clone?.() || new THREE.Vector3(),
    contacts: clonedContacts,
    contactCount: clonedContacts.length,
    wallContacts: clonedContacts.filter(hit => !hit.railId && Math.abs(hit.normal?.y ?? 1) < 0.3),
    railContacts: clonedContacts.filter(hit => Boolean(hit.railId)),
  };
}

/**
 * Composition boundary around the existing ParkCollision continuous body solver.
 * ParkCollision may mutate the velocity object passed to it; this adapter keeps
 * that mutation local and returns an explicit result for the gameplay controller
 * to apply. The caller's input velocity is never changed as a side effect.
 */
export class CollisionResolver {
  constructor(surface) {
    this.surface = surface;
  }

  resolveBody({
    from,
    desired,
    velocity,
    fromUp = DEFAULT_UP,
    toUp = DEFAULT_UP,
    forward = DEFAULT_FORWARD,
    grounded = false,
    ignoreRail = null,
  } = {}) {
    if (!this.surface?.move) {
      return collisionResult({ position: desired || from, velocity, contacts: [] });
    }

    const localVelocity = velocity?.clone?.() || new THREE.Vector3();
    const raw = this.surface.move(
      from,
      desired,
      localVelocity,
      { fromUp, toUp, forward, grounded, ignoreRail },
    );

    return collisionResult({
      position: raw?.position || desired || from,
      velocity: localVelocity,
      contacts: raw?.contacts || [],
    });
  }

  /** Apply only translation/velocity. Orientation is intentionally impossible here. */
  applyBodyResult(controller, result) {
    if (!controller || !result) return false;
    controller.position.copy(result.position);
    controller.velocity.copy(result.velocity);
    return true;
  }
}
