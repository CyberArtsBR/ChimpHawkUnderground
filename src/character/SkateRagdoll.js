import * as THREE from 'three';
import { safeLimbReach } from './AnimationDynamics.js';

const V = () => new THREE.Vector3();
const STEP = 1 / 120;
const TORSO = ['pelvis', 'spine_03', 'head', 'thigh_l', 'thigh_r', 'upperarm_l', 'upperarm_r'];
const CHAINS = [
  ['upperarm_l', 'lowerarm_l', 'hand_l', 2.1],
  ['upperarm_r', 'lowerarm_r', 'hand_r', 2.1],
  ['thigh_l', 'calf_l', 'foot_l', 2.3],
  ['thigh_r', 'calf_r', 'foot_r', 2.3],
];
const NAMES = [...new Set([...TORSO, ...CHAINS.flatMap(chain => chain.slice(0, 3))])];

function bodyFrame(nodes, scratch) {
  const up = scratch.up.copy(nodes.get('spine_03').p).sub(nodes.get('pelvis').p).normalize();
  const side = scratch.side.copy(nodes.get('upperarm_l').p).sub(nodes.get('upperarm_r').p)
    .projectOnPlane(up).normalize();
  if (up.lengthSq() < .5 || side.lengthSq() < .5) return null;
  const forward = scratch.forward.copy(side).cross(up).normalize();
  return scratch.frame.setFromRotationMatrix(scratch.basis.makeBasis(side, up, forward));
}

/** A small position-based articulated body, active only during a bail.
 * Real park contact, fixed bone lengths and bounded impulses keep falls modest.
 * Particle positions are world-space, independent of the board's visual pose. */
export class SkateRagdoll {
  constructor() {
    // The six constraint passes previously cloned 46,800 vectors/quaternions
    // per simulated second. Scratch belongs to each body, never a shared pose.
    this.scratch = Object.fromEntries(['up','side','forward','axis','pole','bend','hitPoint','hitNormal','offset','desired','current'].map(name=>[name,V()]));
    this.scratch.frame = new THREE.Quaternion();
    this.scratch.pelvisRotation = new THREE.Quaternion();
    this.scratch.basis = new THREE.Matrix4();
    this.reset();
  }

  reset() {
    this.active = false;
    this.nodes = new Map();
    this.links = [];
    this.chains = [];
    this.pose = new Map();
    this.accumulator = 0;
    this.groundImpact = null;
  }

  start(rider, { velocity, severity = 0 } = {}) {
    this.reset();
    if (NAMES.some(name => !rider.bones[name])) return false;
    rider.root.updateWorldMatrix(true, true);
    const launch = velocity?.clone?.() || V();
    if (!Number.isFinite(launch.lengthSq())) launch.set(0, 0, 0);
    launch.clampLength(0, 10);
    this.severity = THREE.MathUtils.clamp(Number(severity) || 0, 0, 1);
    const travel = launch.clone().setY(0);
    if (travel.lengthSq() < .01) travel.set(0, 0, -1).applyQuaternion(rider.root.getWorldQuaternion(new THREE.Quaternion()));
    const angular = V().crossVectors(new THREE.Vector3(0, 1, 0), travel.normalize())
      .multiplyScalar(.4 + this.severity * 1.6);
    const centre = rider.bones.pelvis.getWorldPosition(V());
    for (const name of NAMES) {
      const p = rider.bones[name].getWorldPosition(V());
      const radius = name === 'head' ? .29 : name === 'pelvis' || name === 'spine_03' ? .15
        : /upperarm|thigh/.test(name) ? .09 : .055;
      const mass = name === 'pelvis' ? 6 : name === 'spine_03' ? 5 : name === 'head' ? 3 : 1;
      this.nodes.set(name, { name, p, previous: p.clone(), radius, inverseMass: 1 / mass, contactNormal: V(),
        velocity: launch.clone().multiplyScalar(.92)
          .add(V().crossVectors(angular, p.clone().sub(centre))).clampLength(0, 12) });
    }
    this.initialFrame = bodyFrame(this.nodes,this.scratch)?.clone();
    if (!this.initialFrame) return false;
    this.initialFrameInverse = this.initialFrame.clone().invert();
    this.initialPelvisQ = rider.bones.pelvis.getWorldQuaternion(new THREE.Quaternion());
    for (const [bone] of rider.rest) this.pose.set(bone, bone.quaternion.clone());
    this.modelPosition = rider.model.position.clone();
    this.modelQuaternion = rider.model.quaternion.clone();
    // A rigid torso distributes impact torque; arms and legs remain articulated.
    for (let a = 0; a < TORSO.length; a++) for (let b = a + 1; b < TORSO.length; b++)
      this.addLink(TORSO[a], TORSO[b]);
    for (const [a, b, c, maxFlex] of CHAINS) {
      const upper = this.addLink(a, b), lower = this.addLink(b, c);
      this.links.push({ a, b: c, min: safeLimbReach(upper, lower, 0, maxFlex), max: upper + lower - .001 });
      const start = this.nodes.get(a).p, end = this.nodes.get(c).p;
      const axis = end.clone().sub(start).normalize();
      const pole = this.nodes.get(b).p.clone().sub(start).projectOnPlane(axis);
      if (pole.lengthSq() < 1e-6) pole.copy(rider.kneeForward)
        .applyQuaternion(rider.root.getWorldQuaternion(new THREE.Quaternion()))
        .multiplyScalar(a.startsWith('upperarm') ? -1 : 1).projectOnPlane(axis);
      this.chains.push({ a, b, c, maxFlex, pole: pole.normalize() });
    }
    // Keep loose extremities out of the head and pelvis during a tumble.
    for (const name of NAMES.filter(name => /lowerarm|hand|calf|foot/.test(name))) {
      for (const centreName of ['head', 'pelvis']) this.links.push({ a: centreName, b: name,
        min: this.nodes.get(centreName).radius + this.nodes.get(name).radius, max: Infinity });
    }
    this.active = true;
    return true;
  }

  addLink(a, b) {
    const length = this.nodes.get(a).p.distanceTo(this.nodes.get(b).p);
    this.links.push({ a, b, min: length, max: length });
    return length;
  }

  constrain() {
    for (const link of this.links) {
      const a = this.nodes.get(link.a), b = this.nodes.get(link.b);
      const axis = this.scratch.axis.copy(b.p).sub(a.p), length = axis.length();
      if (length < 1e-7) continue;
      const target = THREE.MathUtils.clamp(length, link.min, link.max);
      const correction = (length - target) / (length * (a.inverseMass + b.inverseMass));
      a.p.addScaledVector(axis, correction * a.inverseMass);
      b.p.addScaledVector(axis, -correction * b.inverseMass);
    }
    const frame = bodyFrame(this.nodes,this.scratch);
    if (!frame) return;
    const rotation = frame.multiply(this.initialFrameInverse);
    // Prevent elbows and knees from flipping to the other side of their hinge.
    for (const chain of this.chains) {
      const a = this.nodes.get(chain.a).p, b = this.nodes.get(chain.b).p, c = this.nodes.get(chain.c).p;
      const axis = this.scratch.axis.copy(c).sub(a).normalize();
      const pole = this.scratch.pole.copy(chain.pole).applyQuaternion(rotation).projectOnPlane(axis).normalize();
      const bend = this.scratch.bend.copy(b).sub(a).projectOnPlane(axis);
      const reverse = bend.dot(pole);
      if (reverse < 0) b.addScaledVector(pole, -reverse * 1.2);
    }
  }

  recordGroundImpact(node, point, normal) {
    // Feet may already touch down when a bail starts. Wait for the falling
    // torso/head, and use the collider's world contact rather than the skater anchor.
    if (this.groundImpact || !['pelvis','spine_03','head'].includes(node.name)) return;
    if (normal.y > .45 && node.velocity.dot(normal) < -.8)
      this.groundImpact = {point:point.clone(), normal:normal.clone().normalize(), body:node.name,
        speed: Math.max(0, -node.velocity.dot(normal))};
  }

  collide(node, surface) {
    if (!surface) return;
    const {hitPoint,hitNormal}=this.scratch;
    // Sweeps cover thin walls and ramps even when the initial fall is fast.
    if (surface.sweepSolidSphere?.(node.previous, node.p, node.radius, hitPoint, hitNormal)) {
      node.p.copy(hitPoint).addScaledVector(hitNormal, node.radius + .003);
      node.contactNormal.add(hitNormal);
      this.recordGroundImpact(node, hitPoint, hitNormal);
    }
    if (surface.sweepRideable?.(node.previous, node.p, hitPoint, hitNormal, node.radius)) {
      node.p.copy(hitPoint).addScaledVector(hitNormal, node.radius + .003);
      node.contactNormal.add(hitNormal);
      this.recordGroundImpact(node, hitPoint, hitNormal);
    }
    const floor = surface.ground?.(node.p, node.radius + .12, node.radius + .16);
    if (floor) {
      const depth = node.radius - this.scratch.offset.copy(node.p).sub(floor.point).dot(floor.normal);
      if (depth > 0) {
        node.p.addScaledVector(floor.normal, depth + .002);
        node.contactNormal.add(floor.normal);
        this.recordGroundImpact(node, floor.point, floor.normal);
      }
    }
  }

  update(dt, { surface, anchor } = {}) {
    if (!this.active) return;
    this.accumulator += Number.isFinite(dt) ? THREE.MathUtils.clamp(dt, 0, .05) : 0;
    while (this.accumulator >= STEP) {
      for (const node of this.nodes.values()) {
        node.contactNormal.set(0, 0, 0);
        node.previous.copy(node.p);
        node.velocity.y -= 20 * STEP;
        node.velocity.multiplyScalar(Math.exp(-.7 * STEP)).clampLength(0, 14);
        node.p.addScaledVector(node.velocity, STEP);
      }
      for (let pass = 0; pass < 6; pass++) {
        this.constrain();
        if (pass === 2 || pass === 5) for (const node of this.nodes.values()) this.collide(node, surface);
      }
      for (const node of this.nodes.values()) {
        node.velocity.copy(node.p).sub(node.previous).divideScalar(STEP).clampLength(0, 14);
        if (node.contactNormal.lengthSq() > 1e-8) {
          // Dissipate contact energy once per step, without a restitution boost.
          node.velocity.projectOnPlane(node.contactNormal.normalize()).multiplyScalar(Math.exp(-7 * STEP));
        }
      }
      // Keep visual fall distance within the gameplay recovery/camera area.
      if (anchor?.isVector3) {
        const offset = this.scratch.offset.copy(this.nodes.get('pelvis').p).sub(anchor).setY(0);
        const distance = offset.length();
        if (distance > 3) {
          offset.multiplyScalar((distance - 3) / distance);
          for (const node of this.nodes.values()) {
            node.p.sub(offset); node.previous.sub(offset);
          }
        }
      }
      this.accumulator -= STEP;
    }
  }

  apply(rider, setWorldQ, solveLimb) {
    const frame = bodyFrame(this.nodes,this.scratch);
    if (!frame) return;
    for (const [bone, q] of this.pose) bone.quaternion.copy(q);
    rider.model.position.copy(this.modelPosition);
    rider.model.quaternion.copy(this.modelQuaternion);
    rider.root.updateWorldMatrix(true, true);
    const rotation = frame.multiply(this.initialFrameInverse);
    setWorldQ(rider.bones.pelvis, this.scratch.pelvisRotation.copy(rotation).multiply(this.initialPelvisQ));
    const desired = rider.root.worldToLocal(this.scratch.desired.copy(this.nodes.get('pelvis').p));
    const current = rider.root.worldToLocal(rider.bones.pelvis.getWorldPosition(this.scratch.current));
    rider.model.position.add(desired.sub(current));
    rider.root.updateWorldMatrix(true, true);
    for (const chain of this.chains) solveLimb(rider.bones[chain.a], rider.bones[chain.b], rider.bones[chain.c],
      this.nodes.get(chain.c).p, this.nodes.get(chain.b).p, chain.maxFlex);
    rider.root.updateWorldMatrix(true, true);
  }
}
