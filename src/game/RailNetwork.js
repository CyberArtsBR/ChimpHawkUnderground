import * as THREE from 'three';
import { validatedSurfaceTag } from './SurfaceAudio.js';
import {
  GRIND_CAPTURE,
  captureEligibility,
  contactLongitudinalOffsets,
  grindProfile,
  projectedGrindSpeed,
  railSurfaceHeight,
} from './SkateSystems.js';

const clamp = THREE.MathUtils.clamp;

export class RailNetwork {
  constructor(rails = []) {
    this.rails = rails.map((rail, railIndex) => {
      const points = rail.points.map(p => new THREE.Vector3(...p));
      const cumulative = [0];
      for (let i = 1; i < points.length; i++) cumulative.push(cumulative[i - 1] + points[i].distanceTo(points[i - 1]));
      const closed = points.length > 2 && points[0].distanceTo(points.at(-1)) < 0.6;
      const name = rail.name || `Rail ${railIndex + 1}`;
      return {
        name,
        audioSurfaceTag:validatedSurfaceTag(rail.audioSurfaceTag ?? rail.surfaceType),
        points,
        cumulative,
        length: cumulative.at(-1) || 0,
        closed,
        radius: Math.max(0.04, rail.radius || 0.055),
        coping: /coping/i.test(name),
      };
    }).filter(rail => rail.length > 0.05);
  }

  /** Closest contact on each rail, sorted by proximity. Unlike nearest(),
   * unreachable coping cannot occlude a reachable warehouse handrail. */
  nearby(position, maxDistance = 0.9) {
    const results = [];
    for (const rail of this.rails) {
      let best = null, bestDistance = maxDistance;
      for (let i = 1; i < rail.points.length; i++) {
        const a = rail.points[i - 1], b = rail.points[i];
        const edge = b.clone().sub(a), lengthSq = edge.lengthSq();
        if (lengthSq < 1e-8) continue;
        const t = clamp(position.clone().sub(a).dot(edge) / lengthSq, 0, 1);
        const point = a.clone().addScaledVector(edge, t);
        const delta = position.clone().sub(point), distance = delta.length();
        if (distance >= bestDistance || Math.abs(delta.y) > 0.95) continue;
        const segmentLength = Math.sqrt(lengthSq);
        bestDistance = distance;
        best = {
          rail, railName: rail.name, segment: i - 1, segmentT: t,
          s: rail.cumulative[i - 1] + segmentLength * t,
          point, tangent: edge.multiplyScalar(1 / segmentLength), distance,
        };
      }
      if (best) results.push(best);
    }
    return results.sort((a, b) => a.distance - b.distance);
  }

  nearest(position, maxDistance = 0.9) {
    // Keep legacy single-hit queries consistent with multi-rail capture.
    // Both paths now apply exactly the same height and distance criteria.
    return this.nearby(position, maxDistance)[0] || null;
  }

  /**
   * Compatibility capture oracle retained for older tests/tools.
   * Final gameplay capture authority is GrindCaptureController; runtime callers
   * should use CoreSkateController.enterGrind() instead of this method.
   */
  capture(position, velocity, options = {}, legacyForward = null) {
    if (typeof options === 'number') options = { maxDistance: options, forward: legacyForward };
    const {
      maxDistance = GRIND_CAPTURE.distance,
      forward = new THREE.Vector3(0, 0, -1),
      trick = { name: '50-50' },
    } = options || {};
    const profile = grindProfile(trick?.name);
    const flatForward = forward.clone().setY(0);
    if (flatForward.lengthSq() < 1e-8) flatForward.set(0, 0, -1);
    flatForward.normalize();

    let best = null;
    for (const longitudinal of contactLongitudinalOffsets(profile)) {
      const contact = position.clone().addScaledVector(flatForward, longitudinal);
      const hit = this.nearest(contact, maxDistance + 0.18);
      if (!hit) continue;
      const surfaceY = railSurfaceHeight(hit.point.y, hit.rail.radius, profile.clearance);
      const surfaceDistance = Math.max(0, hit.distance - hit.rail.radius);
      const predictedContact = contact.clone().addScaledVector(velocity, GRIND_CAPTURE.predictionTime);
      const predicted = this.nearest(predictedContact, maxDistance + 0.18);
      const predictedDistance = predicted?.rail === hit.rail ? Math.max(0, predicted.distance - hit.rail.radius) : surfaceDistance;
      const trajectoryClosing = surfaceDistance - predictedDistance;
      const horizontal = velocity.clone().setY(0);
      const tangentHorizontal = hit.tangent.clone().setY(0);
      if (horizontal.lengthSq() < 1e-8 || tangentHorizontal.lengthSq() < 1e-8) continue;
      horizontal.normalize(); tangentHorizontal.normalize();
      const tangentAlignment = clamp(horizontal.dot(tangentHorizontal), -1, 1);
      const tangentSpeed = velocity.dot(hit.tangent);
      const eligibility = captureEligibility({
        surfaceDistance,
        verticalDelta: contact.y - surfaceY,
        velocityY: velocity.y,
        tangentAlignment,
        tangentSpeed,
        trajectoryClosing,
        trickName: profile.name,
      });
      if (!eligibility.eligible) continue;
      const score = surfaceDistance + Math.abs(contact.y - surfaceY) * 0.55;
      if (!best || score < best.score) {
        best = {
          score, rail: hit.rail, s: hit.s, point: hit.point, tangent: hit.tangent,
          direction: tangentSpeed >= 0 ? 1 : -1,
          speed: projectedGrindSpeed(tangentSpeed),
          projectedSpeed: Math.abs(tangentSpeed),
          surfaceDistance,
          verticalDelta: contact.y - surfaceY,
          trajectoryClosing,
          contactLongitudinal: longitudinal,
          profile,
        };
      }
    }
    return best;
  }

  sample(rail, s, { clearance = 0 } = {}) {
    if (rail.closed && rail.length > 0) s = ((s % rail.length) + rail.length) % rail.length;
    if (!rail.closed && (s < 0 || s > rail.length)) return null;
    s = clamp(s, 0, rail.length);
    let segment = 0;
    while (segment + 1 < rail.cumulative.length && rail.cumulative[segment + 1] < s) segment++;
    const a = rail.points[segment];
    const b = rail.points[Math.min(segment + 1, rail.points.length - 1)];
    const length = Math.max(1e-8, a.distanceTo(b));
    const t = clamp((s - rail.cumulative[segment]) / length, 0, 1);
    const center = a.clone().lerp(b, t);
    center.y = railSurfaceHeight(center.y, rail.radius, clearance);
    // Keep the contact point on the authored polyline while blending travel
    // direction across adjacent segments. This prevents visible snaps/velocity
    // changes at curved-rail vertices without moving the rider off the rail.
    let tangent = b.clone().sub(a).normalize();
    const span = Math.min(0.16, length * 0.45);
    const previous = segment > 0 ? rail.points[segment - 1]
      : (rail.closed ? rail.points.at(-2) : null);
    const next = segment + 2 < rail.points.length ? rail.points[segment + 2]
      : (rail.closed ? rail.points[1] : null);
    if (previous && s - rail.cumulative[segment] < span) {
      const incoming = a.clone().sub(previous).normalize();
      if (incoming.dot(tangent) > -0.98) {
        const fraction = clamp((s - rail.cumulative[segment]) / span, 0, 1);
        tangent = incoming.lerp(tangent, 0.5 + 0.5 * fraction).normalize();
      }
    }
    if (next && rail.cumulative[segment + 1] - s < span) {
      const outgoing = next.clone().sub(b).normalize();
      if (outgoing.dot(tangent) > -0.98) {
        const fraction = clamp((rail.cumulative[segment + 1] - s) / span, 0, 1);
        tangent.lerp(outgoing, 0.5 * (1 - fraction)).normalize();
      }
    }
    return { point: center, tangent, s, radius: rail.radius, clearance };
  }
}
