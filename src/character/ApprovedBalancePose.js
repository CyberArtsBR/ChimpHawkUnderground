import * as THREE from 'three';
import { flipMotion } from './TrickMotion.js';
import { PRESENTATION_STATES, springStep, transitionFrequency } from './PresentationState.js';
import { clearFeetAboveSupport } from './FootSupportClearance.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const Q = () => new THREE.Quaternion();
const C = THREE.MathUtils.clamp;
const SIDES = ['l', 'r'];
const SEMANTIC = Object.freeze({
  root: 'root', pelvis: 'pelvis', spine1: 'spine_01', spine2: 'spine_02', spine3: 'spine_03',
  neck: 'neck_01', head: 'head', clavicleL: 'clavicle_l', clavicleR: 'clavicle_r',
  upperArmL: 'upperarm_l', upperArmR: 'upperarm_r', lowerArmL: 'lowerarm_l', lowerArmR: 'lowerarm_r',
  handL: 'hand_l', handR: 'hand_r', thighL: 'thigh_l', thighR: 'thigh_r',
  calfL: 'calf_l', calfR: 'calf_r', footL: 'foot_l', footR: 'foot_r',
});

function finiteQ(q) {
  return Number.isFinite(q.x) && Number.isFinite(q.y) && Number.isFinite(q.z) && Number.isFinite(q.w);
}

function setWorldQ(bone, quaternion) {
  if (!bone?.parent || !finiteQ(quaternion)) return;
  bone.quaternion.copy(bone.parent.getWorldQuaternion(Q()).invert().multiply(quaternion));
  if (!finiteQ(bone.quaternion)) bone.quaternion.identity();
  bone.updateWorldMatrix(false, true);
}

function aim(bone, child, target) {
  if (!bone || !child) return;
  bone.updateWorldMatrix(true, true);
  const origin = bone.getWorldPosition(V());
  const restDirection = child.getWorldPosition(V()).sub(origin);
  const direction = target.clone().sub(origin);
  if (restDirection.lengthSq() < 1e-9 || direction.lengthSq() < 1e-9) return;
  setWorldQ(bone, Q().setFromUnitVectors(restDirection.normalize(), direction.normalize())
    .multiply(bone.getWorldQuaternion(Q())));
}

function limb(upper, lower, end, target, pole) {
  if (!upper || !lower || !end) return;
  const origin = upper.getWorldPosition(V());
  const joint = lower.getWorldPosition(V());
  const tip = end.getWorldPosition(V());
  const a = origin.distanceTo(joint), b = joint.distanceTo(tip);
  const axis = target.clone().sub(origin);
  if (a < 1e-5 || b < 1e-5 || axis.lengthSq() < 1e-9) return;
  const distance = C(axis.length(), Math.abs(a - b) + 0.001, a + b - 0.001);
  axis.normalize();
  const along = (a * a + distance * distance - b * b) / (2 * distance);
  const side = pole.clone().sub(origin).projectOnPlane(axis);
  if (side.lengthSq() < 1e-8) side.set(0, 0, 1).projectOnPlane(axis);
  if (side.lengthSq() < 1e-8) side.set(1, 0, 0).projectOnPlane(axis);
  side.normalize();
  const wantedJoint = origin.clone().addScaledVector(axis, along)
    .addScaledVector(side, Math.sqrt(Math.max(0, a * a - along * along)));
  aim(upper, lower, wantedJoint);
  aim(lower, end, origin.clone().addScaledVector(axis, distance));
}


export function handstandTarget(side, board) {
    return this.boardPoint(board, 0, 0.045, side === 'l' ? 0.18 : -0.18);
  }

export function applyHandstand(weight, board) {
    if (!board || weight <= 0) return;
    // Rotate the complete body, then place the shoulders within measured arm
    // reach. Translating only the hands cannot produce an inverted silhouette.
    this.model.quaternion.premultiply(Q().setFromAxisAngle(V(1, 0, 0), Math.PI * weight));
    this.root.updateWorldMatrix(true, true);
    const shift = V();
    let count = 0;
    for (const side of SIDES) {
      const upper = this.bones['upperarm_' + side], lower = this.bones['lowerarm_' + side], hand = this.bones['hand_' + side];
      if (!upper || !lower || !hand) continue;
      const a = upper.getWorldPosition(V()), b = lower.getWorldPosition(V()), c = hand.getWorldPosition(V());
      const reach = (a.distanceTo(b) + b.distanceTo(c)) * 0.96;
      const shoulder = this.root.worldToLocal(a);
      const target = this.root.worldToLocal(handstandTarget.call(this, side, board));
      shift.add(target.sub(shoulder).add(V(0, reach, 0)));
      count++;
    }
    if (count) this.model.position.addScaledVector(shift, weight / count);
    this.root.updateWorldMatrix(true, true);
  }


export function updateApprovedBalancePose({ presentation, board, speedRatio = 0, crouch = 0, steer = 0, pushWeight = 0, pushPhase = 0,
    flipState = null, grabState = null, grabWeight = 0, manual = null, manualBalance = 0,
    grindType = null, grindBalance = 0, wallRide = null, vert = false, verticalVelocity = 0,
    bail = false, bailProgress = 0, stance = 1, flatland = null, landingSeverity = 0, time = 0, dt = 1 / 60 }) {
    if (!this.model) return;
    for (const [bone, quaternion] of this.rest) bone.quaternion.copy(quaternion);
    this.model.position.copy(this.basePos);
    this.model.quaternion.copy(this.baseQ);
    this.blendState(presentation?.state || PRESENTATION_STATES.IDLE, dt);
    const air = this.w(PRESENTATION_STATES.AIR) + this.w(PRESENTATION_STATES.VERT_AIR) + this.w(PRESENTATION_STATES.OLLIE_POP);
    const brake = this.w(PRESENTATION_STATES.BRAKE), wall = this.w(PRESENTATION_STATES.WALLRIDE);
    const flat = this.w(PRESENTATION_STATES.FLATLAND), grind = this.w(PRESENTATION_STATES.GRIND);
    const manualW = this.w(PRESENTATION_STATES.MANUAL) + this.w(PRESENTATION_STATES.NOSE_MANUAL);
    const manualLean = this.w(PRESENTATION_STATES.MANUAL) - this.w(PRESENTATION_STATES.NOSE_MANUAL);
    const balanceSway = Math.sin(time * 4.2) * 0.012 * manualW;
    const pump = this.w(PRESENTATION_STATES.PUMP);
    const grab = grabState?.name ? C(grabWeight, 0, 1) : 0;
    const handstandWeight = !bail && !flipState && board
      ? THREE.MathUtils.smoothstep(board.flatlandMotion?.weights.Handstand || 0, 0, 1) : 0;
    // Half Pipe's compact air silhouette: knees stay tucked through the flight,
    // instead of standing at takeoff and only bending near the apex.
    const tuck = air * (vert ? 0.78 : 0.62);
    const compTarget = C(Math.max(crouch, tuck, grab * 0.98)
      + landingSeverity * 0.45 + grind * 0.22 + manualW * 0.12 + pump * 0.1, 0, 1);
    const compression = C(springStep(this.scalar.compression, compTarget, grab > 0 ? 18 : 14, dt), 0, 1);
    this.root.position.y = board?.root.position.y ?? this.deckHeight;
    this.model.position.y -= 0.025 + compression * 0.43;
    this.model.position.z += manualLean * 0.065 + manualBalance * manualW * 0.018;
    if (bail) {
      this.model.position.x += (stance < 0 ? -1 : 1) * (0.08 + bailProgress * 0.16);
      this.model.position.y -= Math.min(0.58, bailProgress * 0.72);
      // Sideways tumble sells the crash instead of merely recoiling in place.
      this.model.quaternion.multiply(
        new THREE.Quaternion().setFromAxisAngle(V(0,0,1), (stance < 0 ? 1 : -1) * Math.min(1.28, bailProgress * 1.68))
      );
    }
    this.root.updateWorldMatrix(true, true);
    const rootQ = this.root.getWorldQuaternion(Q());
    const balance = C(steer + manualBalance * 0.45 + grindBalance * 0.5, -1, 1);
    const apex = vert ? C(1 - Math.abs(verticalVelocity) / 4, 0, 1) : 0;
    for (const name of ['spine_01', 'spine_02', 'spine_03']) {
      this.rotate(name, V(0, 1, 0), 0.045, rootQ);
      this.rotate(name, V(0, 0, 1), (-0.02 - compression * 0.38 - balance * 0.025 + brake * 0.04 - wall * 0.05) / 3, rootQ);
      this.rotate(name, V(1, 0, 0), apex * 0.03 - pump * 0.025 - manualLean * 0.035, rootQ);
    }
    this.rotate('pelvis', V(0, 0, 1), manualBalance * manualW * 0.08 - grindBalance * grind * 0.06, rootQ);
    this.rotate('neck_01', V(0, 1, 0), 0.11, rootQ);
    this.rotate('head', V(0, 1, 0), 0.22, rootQ);
    this.rotate('head', V(0, 0, 1), wall * -0.08 + (bail ? 0.13 : 0), rootQ);
    // Parent-bone adjustments precede IK so they cannot move solved feet/hands.
    if (grindType === 'Smith' || grindType === 'Feeble') this.rotate('pelvis', V(1, 0, 0), -0.08 * grind, rootQ);
    if (grindType === 'Crook' || grindType === 'Overcrook') this.rotate('pelvis', V(0, 0, 1), 0.1 * grind, rootQ);
    if (wallRide) this.rotate('pelvis', V(1, 0, 0), -0.1 * wall, rootQ);
    if (bail) {
      this.rotate('spine_02', V(1, 0, 0), 0.22, rootQ);
      this.rotate('spine_03', V(0, 0, 1), (stance < 0 ? -1 : 1) * 0.2, rootQ);
    }

    // Bring the shoulder into the measured arm's reach before solving IK.
    // Stretching an unreachable arm alone leaves the hand near the knee.
    this.root.updateWorldMatrix(true, true);
    let reachDrop = 0;
    if (grab > 0 && board) for (const side of SIDES) {
      const target = this.grabTarget(grabState?.name, side, stance, board);
      const upper = this.bones['upperarm_' + side], lower = this.bones['lowerarm_' + side], hand = this.bones['hand_' + side];
      if (!target || !upper || !lower || !hand) continue;
      const a = upper.getWorldPosition(V()), b = lower.getWorldPosition(V()), c = hand.getWorldPosition(V());
      const length = (a.distanceTo(b) + b.distanceTo(c)) * 0.96;
      const shoulder = this.root.worldToLocal(a), localTarget = this.root.worldToLocal(target.clone());
      const lateral = Math.hypot(shoulder.x - localTarget.x, shoulder.z - localTarget.z);
      reachDrop = Math.max(reachDrop, shoulder.y - localTarget.y - Math.sqrt(Math.max(0.005, length * length - lateral * lateral)));
    }
    this.model.position.y -= C(reachDrop, 0, 0.28) * grab;
    applyHandstand.call(this, handstandWeight, board);
    // Look toward the deck edge; the rider's oversized hat needs clearance
    // beside the board rather than pointing straight through it.
    this.rotate('neck_01', V(0, 0, 1), 1.05 * handstandWeight, rootQ);
    this.root.updateWorldMatrix(true, true);
    const front = stance < 0 ? 'r' : 'l', rear = front === 'l' ? 'r' : 'l';
    const motion = flipState ? flipMotion(flipState.progress) : null;
    const deckLocked = Boolean(board && !flipState && !bail);
    const flatMotion = board?.flatlandMotion;
    const weights = flatMotion?.weights || {};

    for (const side of SIDES) {
      if (!this.feet[side]) continue;
      this.ft[side].copy(this.feet[side].point);
      if (deckLocked) this.ft[side].copy(this.root.worldToLocal(this.boardPoint(board,
        this.ft[side].x, this.ft[side].y, this.ft[side].z)));
    }
    // Ollie/vert tuck lowers the pelvis with the feet on the deck. Only a flip
    // or a named one-foot trick releases them; a generic air pose must not float.
    if (motion) {
      this.ft.l.y += motion.footLift;
      this.ft.r.y += motion.footLift;
      const heel = /Heel/i.test(flipState.name), kick = /Kick|Hard|Varial/i.test(flipState.name);
      this.ft[front].x += (front === 'l' ? -1 : 1) * (heel ? -0.16 : kick ? 0.18 : 0.08) * motion.flick;
      this.ft[front].z -= 0.12 * motion.flick;
      if (/Impossible|Shove/.test(flipState.name)) this.ft[rear].z += 0.16 * motion.clearance;
    }
    // Blend named offsets over measured deck contacts, including variant exits.
    if (flatMotion && board && !flipState && !bail) {
      for (const side of SIDES) {
        if (!this.feet[side]) continue;
        // The ankle is above the sole: preserve its measured rest clearance
        // on the inverted underside instead of placing the ankle in the deck.
        const clearance = Math.max(0.08, this.feet[side].point.y) + 0.075;
        const z = side === front ? -0.28 : 0.28;
        const target = this.root.worldToLocal(this.boardPoint(board, 0, -clearance, z));
        this.ft[side].lerp(target, weights.Casper);
      }
    }
    if (grabState?.name === 'Japan') { this.ft[rear].y += 0.2 * grab; this.ft[rear].x += (rear === 'l' ? -1 : 1) * 0.12 * grab; }
    if (grabState?.name === 'Madonna') { this.ft[rear].y += 0.22 * grab; this.ft[rear].z += 0.2 * grab; }
    if (grabState?.name === 'Benihana') { this.ft[front].y += 0.32 * grab; this.ft[front].z -= 0.28 * grab; }
    if (grabState?.name === 'Judo') { this.ft[rear].y += 0.22 * grab; this.ft[rear].x += (rear === 'l' ? -1 : 1) * 0.36 * grab; this.ft[rear].z -= 0.18 * grab; }
    if (grabState?.name === 'Rocket Air') { this.ft[rear].z -= 0.18 * grab; this.ft[front].z -= 0.08 * grab; }
    if (grabState?.name === 'Christ Air') {
      this.ft.l.y += 0.24 * grab; this.ft.r.y += 0.24 * grab;
      this.ft.l.x -= 0.32 * grab; this.ft.r.x += 0.32 * grab;
      this.ft.l.z -= 0.20 * grab; this.ft.r.z += 0.20 * grab;
    }
    if (grabState?.name === 'Airwalk') {
      this.ft.l.y += 0.28 * grab; this.ft.r.y += 0.28 * grab;
      this.ft.l.x -= 0.2 * grab; this.ft.r.x += 0.2 * grab;
      this.ft.l.z -= 0.13 * grab; this.ft.r.z += 0.13 * grab;
    }
    if (bail) {
      this.ft.l.x -= 0.2 + bailProgress * 0.2; this.ft.r.x += 0.2 + bailProgress * 0.2;
      this.ft.l.y += 0.16; this.ft.r.y += 0.1;
    }
    if (handstandWeight > 0) for (const side of SIDES) {
      const foot = this.bones['foot_' + side];
      if (!foot) continue;
      const inverted = this.root.worldToLocal(foot.getWorldPosition(V()));
      // Slightly scissor the legs while keeping their actual transformed length.
      inverted.z += (side === 'l' ? -1 : 1) * 0.06 * handstandWeight;
      this.ft[side].lerp(inverted, handstandWeight);
    }
    for (const side of SIDES) {
      const upper = this.bones['thigh_' + side], lower = this.bones['calf_' + side], foot = this.bones['foot_' + side];
      if (!upper || !lower || !foot || !this.feet[side]) continue;
      const restPoint = this.feet[side].point;
      const kneePole = V(restPoint.x + 0.35, 0.25, restPoint.z);
      if (handstandWeight > 0) kneePole.lerp(this.root.worldToLocal(lower.getWorldPosition(V())), handstandWeight);
      limb(upper, lower, foot, this.root.localToWorld(this.ft[side].clone()), this.root.localToWorld(kneePole));
      const releasedFoot = (weights.Handstand || 0) > 0.05 || (grab > 0.01 && (
        (['Japan', 'Madonna', 'Judo'].includes(grabState?.name) && side === rear)
        || (grabState?.name === 'Benihana' && side === front) || ['Airwalk', 'Christ Air'].includes(grabState?.name)));
      const footQ = deckLocked ? board.root.getWorldQuaternion(Q()) : rootQ.clone();
      if (deckLocked) {
        const correction = -Math.PI * ((weights.Casper || 0) + (weights['Anti Casper'] || 0))
          - Math.PI * 0.5 * (weights['To Rail'] || 0);
        footQ.multiply(Q().setFromAxisAngle(V(0, 0, 1), correction));
        const release = C(weights.Handstand || 0, 0, 1);
        footQ.slerp(rootQ, releasedFoot ? Math.max(release, grab) : release);
      }
      if (handstandWeight > 0) footQ.slerp(rootQ.clone().multiply(Q().setFromAxisAngle(V(1, 0, 0), Math.PI)), handstandWeight);
      setWorldQ(foot, footQ.multiply(this.feet[side].q));
    }

    this.root.updateWorldMatrix(true, true);
    if (handstandWeight > 0) clearFeetAboveSupport(this,board);
    for (const side of SIDES) {
      const sign = side === 'l' ? -1 : 1;
      const upper = this.bones['upperarm_' + side], lower = this.bones['lowerarm_' + side], hand = this.bones['hand_' + side];
      if (!upper || !lower || !hand) continue;
      const shoulder = this.root.worldToLocal(upper.getWorldPosition(V()));
      const target = this.at[side].copy(shoulder)
        .add(V(0.14 + compression * 0.02, -0.31 + air * 0.08 + sign * balance * 0.04, sign * (0.14 + air * 0.08)));
      target.y += Math.sin(time * 3.5 + sign * 0.4) * 0.01 * speedRatio;
      target.y += sign * manualBalance * 0.07 * manualW + sign * grindBalance * 0.1 * grind;
      target.z += sign * (0.07 * grind + 0.14 * wall + 0.10 * manualW);
      target.y += manualW * 0.07 + sign * balanceSway;
      target.x -= manualLean * 0.045;
      target.y += 0.06 * (wall + flat);
      if (bail) { target.y += 0.24 + bailProgress * 0.12; target.z += sign * 0.16; }
      const grabTarget = this.grabTarget(grabState?.name, side, stance, board);
      if (grabState?.name === 'Madonna' && side === rear) target.addScaledVector(V(-0.04, 0.34, sign * 0.26), grab);
      if (grabState?.name === 'Japan' && side === rear) target.addScaledVector(V(-0.03, 0.18, sign * 0.14), grab);
      if (grabState?.name === 'Airwalk') target.addScaledVector(V(0, 0.18, sign * 0.2), grab);
      if (grabState?.name === 'Christ Air' && side === rear) target.addScaledVector(V(0, 0.30, sign * 0.38), grab);
      const handstand = handstandWeight > 0 && board;
      const reach = handstand ? handstandTarget.call(this, side, board) : grabTarget;
      const world = this.root.localToWorld(target.clone());
      const reachWeight = handstand ? handstandWeight : grab;
      if (reach) world.lerp(reach, reachWeight);
      const elbowPole = shoulder.clone().add(V(-0.18, -0.2, sign * 0.7));
      if (handstand) {
        // The inverted left shoulder is on +Z: elbows must follow that side,
        // rather than keeping the upright pole and folding toward the head.
        elbowPole.lerp(shoulder.clone().add(V(-0.16, -0.1, -sign * 0.55)), handstandWeight);
      }
      limb(upper, lower, hand, world, this.root.localToWorld(elbowPole));
      if (this.hands[side]) {
        const handQ = rootQ.clone().multiply(this.hands[side].q);
        if (reach && board) {
          const contactQ = board.root.getWorldQuaternion(Q());
          // Rest fingers face inward at these inverted shoulder positions.
          // Turn around the deck normal so both hands point away from center,
          // preserving palm contact and the existing grab orientations.
          if (handstand) contactQ.multiply(Q().setFromAxisAngle(V(0, 1, 0), Math.PI));
          handQ.slerp(contactQ.multiply(this.hands[side].q), reachWeight);
        }
        setWorldQ(hand, handQ);
      }
    }
    for (const [bone, quaternion] of this.rest) if (!finiteQ(bone.quaternion)) bone.quaternion.copy(quaternion);
    this.root.updateWorldMatrix(true, true);
  }
