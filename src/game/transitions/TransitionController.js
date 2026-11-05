import * as THREE from 'three';
import {
  compileTransitionMetadata,
  PRODUCTION_TRANSITION_AUTHORING,
} from './TransitionMetadata.js';
import { wantsVertTransfer } from '../../input/InputInterpreter.js';
import { resolveVertReturnVelocity } from './VertReturnFlight.js';

const UP = new THREE.Vector3(0, 1, 0);
const CAPTURE_SCALE = 1.3;
const EPSILON = 1e-8;
const clamp = THREE.MathUtils.clamp;
// Preserve useful climbing momentum and room for tricks. The old 9.4 m/s
// passive cap cut an ordinary fast quarter's upward speed by about a third,
// making different ramp sizes all produce the same short, 2.2 m air.
// Apply this envelope once at departure; gravity still owns the whole flight.
export const VERT_LAUNCH_ENVELOPE = Object.freeze({
  maximumVerticalSpeed: 17.0,
  maximumPassiveVerticalSpeed: 13.4,
});

function horizontal(vector) {
  return vector.clone().setY(0);
}

function safeNormal(vector, fallback) {
  if (!vector || vector.lengthSq() < EPSILON) return fallback.clone();
  return vector.clone().normalize();
}

function accelerateToward(current, target, maxDelta) {
  const correction = target.clone().sub(current);
  const length = correction.length();
  if (length <= maxDelta || length < EPSILON) return target.clone();
  return current.clone().addScaledVector(correction, maxDelta / length);
}

function nearestPointOnSegmentXZ(position, a, b, out = new THREE.Vector3()) {
  const ab = b.clone().sub(a);
  const flatAB = new THREE.Vector3(ab.x, 0, ab.z);
  const lengthSq = flatAB.lengthSq();
  if (lengthSq < EPSILON) return out.copy(a);

  const ap = position.clone().sub(a);
  const t = clamp((ap.x * flatAB.x + ap.z * flatAB.z) / lengthSq, 0, 1);
  return out.copy(a).lerp(b, t);
}

function legacySourceName(candidate) {
  return candidate?.name
    ?? candidate?.copingName
    ?? candidate?.edge?.name
    ?? null;
}

/**
 * Authoritative semantic gate for transition rails.
 * Every runtime rail must pass through this exact authoring table before it can
 * participate in vert physics.
 */
export function authoredTransitionRails(
  rails = [],
  authoring = PRODUCTION_TRANSITION_AUTHORING,
) {
  return rails.filter(rail => Boolean(rail?.transition || authoring[rail?.name]));
}

/**
 * Debug/migration bridge for inspecting legacy candidates. Runtime takeoff no
 * longer uses this lookup: canonical identity must originate at candidate time.
 */
export function authoredTransitionIdentity(
  candidate,
  authoring = PRODUCTION_TRANSITION_AUTHORING,
) {
  const sourceName = legacySourceName(candidate);
  const authored = sourceName ? authoring[sourceName] : null;
  return {
    sourceName,
    transitionId: authored?.id ?? null,
    type: authored?.type ?? null,
    supportsVert: Boolean(authored?.supportsVert),
    supportsTransfer: Boolean(authored?.supportsTransfer),
    supportsPump: Boolean(authored?.supportsPump),
    mapped: Boolean(authored),
  };
}

/**
 * Canonical transition authority for Phase 1.
 *
 * Owns authored rail selection, approach/launch detection, vert-air trajectory,
 * transfer/return steering and presentation normal. TransitionGuide remains only
 * as a legacy regression oracle while the inheritance stack is being dismantled.
 */
export class TransitionController {
  constructor({ rails = [], authoring = PRODUCTION_TRANSITION_AUTHORING } = {}) {
    this.rails = authoredTransitionRails(rails, authoring);
    this.transitions = compileTransitionMetadata(this.rails, authoring);
    this.byId = new Map(this.transitions.map(transition => [transition.id, transition]));
    this.byRailName = new Map(this.transitions.map(transition => [transition.sourceRail, transition]));

    this.edges = [];
    for (const transition of this.transitions) {
      if (!transition.supportsVert) continue;
      const path = transition.lipPath;
      for (let i = 1; i < path.length; i++) {
        const a = path[i - 1].clone();
        const b = path[i].clone();
        const tangent = horizontal(b.clone().sub(a));
        if (tangent.lengthSq() < EPSILON) continue;
        this.edges.push({
          a,
          b,
          tangent: tangent.normalize(),
          name: transition.sourceRail,
          transitionId: transition.id,
          transitionType: transition.type,
          supportsVert: transition.supportsVert,
          supportsTransfer: transition.supportsTransfer,
          supportsPump: transition.supportsPump,
        });
      }
    }
  }

  get(id) {
    return this.byId.get(id) || null;
  }

  forRail(name) {
    return this.byRailName.get(name) || null;
  }

  nearestLip(position, maxGap = Infinity) {
    if (!position) return null;
    let best = null;
    let bestGap = Number(maxGap);

    for (const transition of this.transitions) {
      if (!transition.supportsVert) continue;
      const path = transition.lipPath;
      for (let i = 1; i < path.length; i++) {
        const point = nearestPointOnSegmentXZ(position, path[i - 1], path[i]);
        const dx = position.x - point.x;
        const dz = position.z - point.z;
        const gap = Math.hypot(dx, dz);
        if (gap >= bestGap) continue;

        const tangent = path[i].clone().sub(path[i - 1]).setY(0);
        if (tangent.lengthSq() > EPSILON) tangent.normalize();
        bestGap = gap;
        best = {
          transition,
          point: point.clone(),
          tangent,
          segmentIndex: i - 1,
          gap,
          verticalDelta: position.y - point.y,
        };
      }
    }
    return best;
  }

  candidate(position, normal, velocity, {
    maxGap,
    below,
    above,
    maxNormalY,
    minAlignment,
  }) {
    if (!normal || normal.y > maxNormalY) return null;
    const rampInward = horizontal(normal);
    if (rampInward.lengthSq() < EPSILON) return null;
    rampInward.normalize();
    const deckOutward = rampInward.clone().negate();
    const travel = horizontal(velocity);
    if (travel.lengthSq() > 0.001 && travel.normalize().dot(deckOutward) < minAlignment) return null;

    let closest = null;
    let distance = maxGap;
    for (const edgeInfo of this.edges) {
      const edge = edgeInfo.b.clone().sub(edgeInfo.a).setY(0);
      const t = clamp(
        position.clone().sub(edgeInfo.a).setY(0).dot(edge) / Math.max(edge.lengthSq(), EPSILON),
        0,
        1,
      );
      // A nearby crossing rail may be geometrically close but belong to a
      // perpendicular ramp. Its lip cannot launch this surface normal.
      if (Math.abs(edgeInfo.tangent.dot(rampInward)) > 0.63) continue;
      const lipPoint = edgeInfo.a.clone().lerp(edgeInfo.b, t);
      const gap = horizontal(position.clone().sub(lipPoint)).length();
      const lipSurfaceY = lipPoint.y - 0.025;
      if (gap >= distance || position.y < lipSurfaceY - below || position.y > lipSurfaceY + above) continue;

      let copingTangent = edgeInfo.tangent.clone();
      copingTangent.addScaledVector(rampInward, -copingTangent.dot(rampInward));
      copingTangent = safeNormal(copingTangent, edgeInfo.tangent);
      closest = {
        lipPoint,
        copingTangent,
        rampInward: rampInward.clone(),
        deckOutward: deckOutward.clone(),
        surfaceNormal: safeNormal(normal, UP),
        name: edgeInfo.name,
        gap,
        transitionId: edgeInfo.transitionId,
        transitionType: edgeInfo.transitionType,
        supportsVert: edgeInfo.supportsVert,
        supportsTransfer: edgeInfo.supportsTransfer,
        supportsPump: edgeInfo.supportsPump,
      };
      distance = gap;
    }
    return closest;
  }

  approachAt(position, normal, velocity) {
    if (velocity.y < 0.05) return null;
    return this.candidate(position, normal, velocity, {
      maxGap: 1.7 * CAPTURE_SCALE,
      below: 1.9 * CAPTURE_SCALE,
      above: 0.32 * CAPTURE_SCALE,
      maxNormalY: 0.9,
      minAlignment: 0.06,
    });
  }

  launchAt(position, normal, velocity) {
    if (velocity.y <= -0.05) return null;
    return this.candidate(position, normal, velocity, {
      maxGap: 0.62 * CAPTURE_SCALE,
      below: 0.48 * CAPTURE_SCALE,
      above: 0.34 * CAPTURE_SCALE,
      maxNormalY: 0.84,
      minAlignment: 0.05,
    });
  }

  begin(position, velocity, edge, { boardForward = null, launchBoost = 0 } = {}) {
    const incomingVelocity = velocity.clone();
    const incomingSpeed = incomingVelocity.length();
    const tangentVelocity = incomingVelocity.dot(edge.copingTangent);
    // A diagonal run has a genuine along-coping velocity. Do not count it
    // as climb energy and then delete it when leaving the lip.
    const tangentSpeed = Math.abs(tangentVelocity);
    const normalY = clamp(Math.abs(edge.surfaceNormal.y), 0, 1);
    const nonLateralSpeed = Math.sqrt(Math.max(0,
      incomingSpeed * incomingSpeed - tangentSpeed * tangentSpeed));
    // Convert only the component of approach speed physically supported by the
    // face's pitch. Shallow ramps cannot turn all forward velocity into lift.
    const climbProjection = nonLateralSpeed * Math.sqrt(Math.max(0, 1 - normalY * normalY));
    const baseVertical = Math.max(0, incomingVelocity.y, climbProjection);
    const boost = clamp(Number(launchBoost) || 0, 0, 16);
    const verticalBoost = boost * 0.82;
    const energyBudget = Math.sqrt(incomingSpeed * incomingSpeed + verticalBoost * verticalBoost);
    let launchVertical = clamp(Math.min(
      Math.sqrt(baseVertical * baseVertical + verticalBoost * verticalBoost),
      energyBudget,
    ), 0, VERT_LAUNCH_ENVELOPE.maximumVerticalSpeed);
    // This is a physical speed bound, not a scripted trajectory. It limits
    // launch energy once at departure, then leaves gravity/steering unchanged.
    launchVertical = Math.min(launchVertical, VERT_LAUNCH_ENVELOPE.maximumVerticalSpeed);
    const lateralVelocity = tangentVelocity;
    const exitRequested = Boolean(edge.exitRequested && edge.supportsTransfer !== false
      && incomingSpeed >= 4.8 && incomingVelocity.y > 0.12);

    let launchHorizontal;
    if (exitRequested) {
      // First-stage direction only: real collision-deck transfer planning will
      // replace this vector. Avoid spending all rise energy on a phantom 12 m/s
      // outward kick before that geometry has been checked.
      const exitSpeed = Math.min(8.4, incomingSpeed * 0.64);
      const retainedLateral = edge.copingTangent.clone().multiplyScalar(lateralVelocity * 0.45);
      launchHorizontal = edge.deckOutward.clone().multiplyScalar(exitSpeed).add(retainedLateral);
      launchVertical = clamp(launchVertical * 0.84, 0, VERT_LAUNCH_ENVELOPE.maximumVerticalSpeed);
    } else {
      // Near-vertical coping retains a small physically directional outward
      // component rather than annihilating radial velocity in one frame.
      // Rounded/shallow lip samples do NOT create a deck-crossing catapult.
      const outwardSpeed = Math.max(0, incomingVelocity.dot(edge.deckOutward));
      const vertAmount = clamp((0.42 - normalY) / 0.24, 0, 1);
      const radialRetention = Math.min(1.65, outwardSpeed * 0.22 * vertAmount);
      launchHorizontal = edge.copingTangent.clone()
        .multiplyScalar(lateralVelocity)
        .addScaledVector(edge.deckOutward, radialRetention);
    }
    // All retained XZ energy is paid for from the *same* launch budget.
    // Even a fast diagonal approach cannot receive duplicate lift + sideways
    // kinetic energy through the coping projection.
    const remainingVertical = Math.sqrt(Math.max(0,
      energyBudget * energyBudget - launchHorizontal.lengthSq()));
    launchVertical = Math.min(launchVertical, remainingVertical);
    velocity.copy(launchHorizontal).addScaledVector(UP, launchVertical);

    const returnTarget = edge.lipPoint.clone().addScaledVector(edge.rampInward, 0.30);
    returnTarget.y = edge.lipPoint.y - 0.035;

    const transition = edge?.transitionId ? this.get(edge.transitionId) : null;
    const air = {
      mode: exitRequested ? 'transfer' : 'return',
      frame: {
        lipPoint: edge.lipPoint.clone(),
        copingTangent: edge.copingTangent.clone(),
        rampInward: edge.rampInward.clone(),
        deckOutward: edge.deckOutward.clone(),
        surfaceNormal: edge.surfaceNormal.clone(),
        boardForward: safeNormal(boardForward || incomingVelocity, edge.deckOutward),
        incomingTangentVelocity: incomingVelocity.clone().projectOnPlane(edge.surfaceNormal),
        incomingSpeed,
        launchBoost: boost,
        returnTarget,
      },
      launchVertical,
      launchHorizontal: launchHorizontal.clone(),
      lateralVelocity,
      apexPassed: false,
      exitRequested,
      transferring: exitRequested,
      age: 0,
      copingName: edge.name,
      returnError: horizontal(returnTarget.clone().sub(position)).length(),
    };

    if (transition) {
      air.transitionId = transition.id;
      air.transitionType = transition.type;
      air.supportsTransfer = transition.supportsTransfer;
      air.supportsPump = transition.supportsPump;
      air.frame.transitionId = transition.id;
      air.frame.transitionType = transition.type;
      // Re-entry may occur several metres sideways from takeoff, especially
      // after a deliberate diagonal carve. Match the whole authored coping.
      air.frame.lipPath = transition.lipPath.map(point => point.clone());
    }
    return air;
  }

  requestTransfer(air, input = {}, verticalSpeed = 0) {
    if (verticalSpeed <= 0) air.apexPassed = true;
    if (wantsVertTransfer(input, air)) air.exitRequested = true;
    return Boolean(air.exitRequested && air.apexPassed && !air.transferRejected
      && air.supportsTransfer !== false);
  }

  advance(air, position, velocity, input = {}, dt) {
    air.age += dt;
    if (this.requestTransfer(air, input, velocity.y) && !air.transferring) {
      air.mode = 'transfer';
      air.transferring = true;
    }

    const frame = air.frame;
    const currentHorizontal = horizontal(velocity);
    if (air.transferring) {
      // Verified deck geometry owns the transfer speed. Bound midair steering
      // acceleration instead of applying an artificial 30m/s2 boost each frame.
      const exitSpeed = air.exitControl?.geometryAware && !air.exitControl.abortToReturn
        ? air.exitControl.horizontalSpeed
        : clamp(frame.incomingSpeed * 0.78 + 0.9, 4.8, 12.8);
      const retainedLateral = frame.copingTangent.clone()
        .multiplyScalar(air.lateralVelocity * 0.45);
      const desired = frame.deckOutward.clone().multiplyScalar(Math.max(0, exitSpeed))
        .add(retainedLateral);
      const next = accelerateToward(currentHorizontal, desired, 8 * Math.max(0, dt));
      velocity.x = next.x;
      velocity.z = next.z;
    } else {
      const result = resolveVertReturnVelocity(air, position, velocity, dt);
      velocity.copy(result.velocity);
      air.returnGuideLost = !result.guided;
    }

    air.returnError = horizontal(frame.returnTarget.clone().sub(position)).length();
  }

  presentationNormal(air, verticalSpeed) {
    if (air?.transferring) return UP;
    if (!air?.frame) return UP;
    const level = 1 - clamp(Math.abs(verticalSpeed) / Math.max(air.launchVertical, 0.01), 0, 1);
    const blend = THREE.MathUtils.smoothstep(level, 0, 0.78);
    return air.frame.surfaceNormal.clone().lerp(UP, blend).normalize();
  }

  /** Debug-only bridge for comparing old name-based candidates during migration. */
  inspectLegacyCandidate(candidate) {
    const identity = authoredTransitionIdentity(candidate);
    if (!identity.mapped) return identity;
    const transition = this.forRail(identity.sourceName);
    return {
      ...identity,
      transitionId: transition?.id ?? null,
      type: transition?.type ?? null,
      mapped: Boolean(transition),
    };
  }

  debugSummary(position, maxGap = 2.5) {
    const nearest = this.nearestLip(position, maxGap);
    if (!nearest) return { count: this.transitions.length, nearest: null };
    return {
      count: this.transitions.length,
      nearest: {
        id: nearest.transition.id,
        type: nearest.transition.type,
        sourceRail: nearest.transition.sourceRail,
        gap: nearest.gap,
        verticalDelta: nearest.verticalDelta,
        segmentIndex: nearest.segmentIndex,
      },
    };
  }
}
