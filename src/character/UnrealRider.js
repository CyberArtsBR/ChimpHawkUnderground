import { updateApprovedBalancePose, handstandTarget } from './ApprovedBalancePose.js';
import { halfPipePose, kneeHeight } from './HalfPipePose.js';
import * as THREE from 'three';
import { calibrateRiderMaterials } from './RiderMaterialPresentation.js';
import { applyGhostRiderPresentation, shouldApplyGhostRiderPresentation } from './GhostRiderMaterials.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { flipMotion, flipFlickOffset, impossibleMotion, grindWeightShift, pushMotion } from './TrickMotion.js';
import { safeLimbReach, anatomicalKneeDirection, preserveFootOrder, smoothHandDestination, neutralArmIKTargets, skatingArmIKTargets, safeArmGoal, blendedSafeArmGoal } from './AnimationDynamics.js';
import { PRESENTATION_STATES, springStep, transitionFrequency } from './PresentationState.js';
import { resolveHumanoidBones, humanoidIKAudit } from './RigMapping.js';
import { ensurePelvisDeckClearance, boundedHandReach, boundedNeutralHandTarget, avatarPoseCalibration } from './SkatePoseConstraints.js';
import { footWorldOrientation, plantedFootWorldPoint } from './FootOrientation.js';
import { SkateRagdoll } from './SkateRagdoll.js';
import { calibrateFootSupportBounds } from './FootSupportClearance.js';
import { grabReachPose, grabReachMargin, calibrateGrabPalms, grabPalmOrientation, grabDeckSurface, calibrateGrabFingers, applyGrabFingers } from './GrabReachPose.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const Q = () => new THREE.Quaternion();
const C = THREE.MathUtils.clamp;
const SIDES = ['l', 'r'];
/**
 * Per-grab body styling (2026-11): each grab gets its own silhouette. arch
 * leans the chest back (+) or tucks it (-), twist turns the shoulders, and the
 * free (non-grabbing) arm goes up / out / forward in arm lengths.
 */
const GRAB_STYLE = Object.freeze({
  Indy: { arch: .1, twist: .28, up: .75, out: .45, fwd: -.35 },
  Melon: { arch: .04, twist: -.22, up: .35, out: .75, fwd: .4 },
  Nosegrab: { arch: -.08, twist: .12, up: .65, out: .35, fwd: -.55 },
  Tailgrab: { arch: .14, twist: -.12, up: .8, out: .3, fwd: .5 },
  Japan: { arch: -.16, twist: .32, up: .25, out: .45, fwd: -.25 },
  Madonna: { arch: .2, twist: -.18, up: .7, out: .55, fwd: .2 },
  Benihana: { arch: .16, twist: -.26, up: .85, out: .55, fwd: 0 },
  Method: { arch: .3, twist: .38, up: .55, out: .9, fwd: -.25 },
  Stalefish: { arch: .08, twist: -.32, up: .8, out: .4, fwd: .3 },
  'Rocket Air': { arch: .22, twist: 0, up: .5, out: .3, fwd: .3 },
  Seatbelt: { arch: .05, twist: .42, up: .45, out: .5, fwd: -.4 },
  Mute: { arch: -.06, twist: .22, up: .55, out: .5, fwd: -.15 },
  Judo: { arch: .24, twist: -.3, up: .75, out: .55, fwd: .1 },
  Crail: { arch: .1, twist: .36, up: .6, out: .6, fwd: .45 },
  'Christ Air': { arch: .26, twist: 0, up: .3, out: 1, fwd: 0 },
  Airwalk: { arch: .2, twist: .15, up: .4, out: .7, fwd: .1 },
});
const GESTURE_TIME = Object.freeze({ celebrate: 1.15, stumble: .75, switch: .45 });
/** Rise quickly, hold, then ease out over a gesture's 0..1 progress. */
const gestureEnvelope = p => THREE.MathUtils.smoothstep(p, 0, .14) * (1 - THREE.MathUtils.smoothstep(p, .62, 1));
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
function finiteV(v) {
  return v && Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z);
}

/**
 * Some rigs attach rigid props (helmets, pads) with the body's own material.
 * A material drawn on both a skinned and an unskinned mesh flips between two
 * shader variants every frame. Give the rigid meshes an identical copy.
 */
export function separateSkinnedMaterials(model) {
  const usage = new Map();
  model.traverse(object => {
    if (!object.isMesh) return;
    for (const material of [].concat(object.material)) {
      if (!material) continue;
      const entry = usage.get(material) || { skinned: false, rigid: [] };
      if (object.isSkinnedMesh) entry.skinned = true; else entry.rigid.push(object);
      usage.set(material, entry);
    }
  });
  let split = 0;
  for (const [material, { skinned, rigid }] of usage) {
    if (!skinned || !rigid.length) continue;
    const copy = material.clone();
    for (const object of rigid) {
      object.material = Array.isArray(object.material)
        ? object.material.map(m => (m === material ? copy : m)) : copy;
    }
    split++;
  }
  return split;
}

function setWorldQ(bone, quaternion) {
  if (!bone?.parent || !finiteQ(quaternion) || quaternion.lengthSq() < 1e-12) return;
  const local = bone.parent.getWorldQuaternion(Q()).invert().multiply(quaternion).normalize();
  if (!finiteQ(local)) return;
  bone.quaternion.copy(local);
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

/**
 * Two-bone IK. `swivel` (optional) limits how fast the bend plane may turn
 * about the hip-ankle axis: { side: last unit side in `frame` space or null,
 * frame: Quaternion (world <- frame), maxStep: radians this frame }.
 */
function limb(upper, lower, end, target, pole, maximumFlex = 2.55, swivel = null) {
  if (!upper || !lower || !end || !finiteV(target) || !finiteV(pole)) return;
  const origin = upper.getWorldPosition(V());
  const joint = lower.getWorldPosition(V());
  const tip = end.getWorldPosition(V());
  const a = origin.distanceTo(joint), b = joint.distanceTo(tip);
  const axis = target.clone().sub(origin);
  if (a < 1e-5 || b < 1e-5 || axis.lengthSq() < 1e-9) return;
  const distance = safeLimbReach(a, b, axis.length(), maximumFlex);
  if (distance < 1e-6) return;
  axis.normalize();
  const along = (a * a + distance * distance - b * b) / (2 * distance);
  const side = pole.clone().sub(origin).projectOnPlane(axis);
  // Prefer the current knee plane over flipping between world axes.
  if (side.lengthSq() < 1e-8) side.copy(joint).sub(origin).projectOnPlane(axis);
  if (side.lengthSq() < 1e-8) side.set(0, 0, 1).projectOnPlane(axis);
  if (side.lengthSq() < 1e-8) side.set(1, 0, 0).projectOnPlane(axis);
  side.normalize();
  if (swivel) {
    // A lifted foot can sweep past the knee's preferred direction, where the
    // projected pole flips sides within a frame or two (an 11 cm knee pop in
    // Japan). Turn from last frame's bend plane at a bounded rate instead.
    const toWorld = swivel.frame, last = swivel.side && swivel.side.clone().applyQuaternion(toWorld).projectOnPlane(axis);
    if (last && last.lengthSq() > 1e-8) {
      last.normalize();
      const angle = Math.atan2(last.clone().cross(side).dot(axis), C(last.dot(side), -1, 1));
      if (Math.abs(angle) > swivel.maxStep)
        side.copy(last).applyAxisAngle(axis, Math.sign(angle) * swivel.maxStep).normalize();
    }
    swivel.side = side.clone().applyQuaternion(toWorld.clone().invert());
  }
  const wantedJoint = origin.clone().addScaledVector(axis, along)
    .addScaledVector(side, Math.sqrt(Math.max(0, a * a - along * along)));
  aim(upper, lower, wantedJoint);
  aim(lower, end, origin.clone().addScaledVector(axis, distance));
}

export class UnrealRider {
  constructor(url, { uploadFilename = '' } = {}) {
    this.url = url;
    this.uploadFilename = uploadFilename;
    this.calibratedGrabReach = /\/(The_AdolescentUR|The_Heretic|The_Anchor|TuxR)\.glb(?:\?|$)/.test(url);
    this.ghostRider = shouldApplyGhostRiderPresentation(url, uploadFilename);
    this.root = new THREE.Group();
    this.root.name = 'street-rider';
    this.rest = new Map();
    this.feet = {};
    this.legLengths = {};
    this.hands = {};
    this.deckHeight = 0.12;
    this.channels = new Map(Object.values(PRESENTATION_STATES)
      .map(state => [state, { value: state === 'IDLE' ? 1 : 0, velocity: 0 }]));
    this.scalar = { compression: { value: 0, velocity: 0 }, balance: { value: 0, velocity: 0 },
      airBalance: { value: 0, velocity: 0 }, grabGather: { value: 0, velocity: 0 },
      torsoLean: { value: 0, velocity: 0 }, stanceYaw: { value: 0, velocity: 0 } };
    this.leanReady = false;
    this.kneeSwivel = { l: null, r: null };
    this.grabReachName = null;
    this.grabReachDirection = 1;
    this.gestureState = null;
    this.lastStance = null;
    this.ragdoll = new SkateRagdoll();
    this.ft = { l: V(), r: V() };
    this.soleOffsets={l:0.05,r:0.05};
    this.kneePoles={};
    this.armOutward = {};
    this.kneeForward = V(1, 0, 0);
    this.outward={l:-1,r:1};
    this.at = { l: V(), r: V() };
    this.smoothedHands = { l: null, r: null };
    this.poseCalibration = avatarPoseCalibration(0.72);
  }

  async load() {
    return this.configureModel((await new GLTFLoader().loadAsync(this.url)).scene);
  }

  configureModel(model) {
    this.model = model;
    calibrateRiderMaterials(this.model,this.url);
    // The prepared Teddy_Ghost.glb carries its spectral marker in mesh extras;
    // this also works for cached portrait loads where the filename is unknown.
    this.ghostRider = this.ghostRider ||
      shouldApplyGhostRiderPresentation(this.url, this.uploadFilename, this.model);
    if (this.ghostRider) applyGhostRiderPresentation(this.model);
    const box = new THREE.Box3().setFromObject(this.model);
    const height = box.getSize(V()).y;
    if (!Number.isFinite(height) || height < 1e-4 || !Number.isFinite(box.min.y)) {
      this.dispose();
      throw new Error('Rider GLB has invalid or empty visual bounds');
    }
    this.model.scale.setScalar(1.82 / height);
    this.model.rotation.y = Math.PI / 2;
    this.model.position.y = -box.min.y * this.model.scale.x;
    this.basePos = this.model.position.clone();
    this.baseQ = this.model.quaternion.clone();
    this.root.add(this.model);
    this.model.traverse(object => {
      if (object.isMesh) {
        object.castShadow = !this.ghostRider;
        object.receiveShadow = !this.ghostRider;
        object.frustumCulled = false;
      }
      if (object.isBone) this.rest.set(object, object.quaternion.clone());
    });
    separateSkinnedMaterials(this.model);
    this.bones = resolveHumanoidBones([...this.rest.keys()]);
    const missing = Object.entries(SEMANTIC).filter(([, name]) => !this.bones[name]).map(([key]) => key);
    this.rigAudit = {
      boneCount: this.rest.size, missing, ik: humanoidIKAudit(this.bones),
      semanticNames: Object.fromEntries(Object.entries(SEMANTIC).map(([key, name]) => [key, this.bones[name]?.name || null])),
    };
    if (missing.length) console.warn('[StreetSkate] rider rig missing:', missing.join(', '));
    this.root.updateWorldMatrix(true, true);
    // Imported rigs have different pivots. Center the ACTUAL two foot anchors
    // on the board rather than centering the visual bounding box or pelvis.
    const leftFoot=this.bones.foot_l, rightFoot=this.bones.foot_r;
    if(leftFoot&&rightFoot){
      const midpoint=leftFoot.getWorldPosition(V()).add(rightFoot.getWorldPosition(V())).multiplyScalar(0.5);
      const localMidpoint=this.root.worldToLocal(midpoint);
      this.model.position.x-=localMidpoint.x;
      this.model.position.z-=localMidpoint.z;
      this.basePos.copy(this.model.position);
      this.root.updateWorldMatrix(true,true);
    }
    // A foot bone is at the ankle, not the bottom of the shoe. Calibrate its
    // sole clearance per avatar once; don't reuse the imported ankle height as
    // the skateboard's deck top.
    const floorY=new THREE.Box3().setFromObject(this.model).min.y;
    // The imported rest pose may hold one sneaker above the other. A single
    // whole-model floor height must not make the lifted ankle's *extra height*
    // masquerade as extra sole thickness. Both Chimpions shoes use the same
    // board clearance, measured from the lowest rest ankle.
    const restAnkles = SIDES.map(side => this.bones['foot_' + side])
      .filter(Boolean).map(foot => this.root.worldToLocal(foot.getWorldPosition(V())).y);
    // Calibrate the ANKLE-to-sole contact, never the character or skateboard
    // scale. The full-model AABB includes tails/clothing on some Chimpions;
    // using it unbounded could create a fake 16cm shoe sole and a visible
    // air gap between sneakers and the actual deck while idle or in the air.
    const soleClearance = restAnkles.length
      ? C(Math.min(...restAnkles) - floorY - 0.018, 0.025, 0.11)
      : 0.045;
    // The proportions of uploaded Chimpions/animal rigs differ dramatically.
    // Scale crouching and deck clearance by the rig's actual leg height.
    if (restAnkles.length && this.bones.pelvis) {
      const hipY = this.root.worldToLocal(this.bones.pelvis.getWorldPosition(V())).y;
      this.poseCalibration = avatarPoseCalibration(hipY - Math.min(...restAnkles));
      // Tux's broad body needs a little more clearance than his short leg
      // proportions alone predict. Keep sole targets and bone scale intact.
      if (String(this.url).split('?')[0].endsWith('/assets/rider/TuxR.glb'))
        this.poseCalibration.pelvisClearance = Math.max(.35, this.poseCalibration.pelvisClearance);
    }
    // Imported character axes can be mirrored by the +90 degree GLB rotation.
    // Infer leg sides from the actual positioned feet, never side labels alone.
    if (this.bones.foot_l && this.bones.foot_r) {
      const lx=this.root.worldToLocal(this.bones.foot_l.getWorldPosition(V())).x;
      const rx=this.root.worldToLocal(this.bones.foot_r.getWorldPosition(V())).x;
      this.outward.l=lx<=rx?-1:1;
      this.outward.r=-this.outward.l;
    }
    for (const side of SIDES) {
      const foot = this.bones['foot_' + side], knee=this.bones['calf_'+side];
      if (foot) {
        const footLocal=this.root.worldToLocal(foot.getWorldPosition(V()));
        this.feet[side] = { point:footLocal, q:foot.getWorldQuaternion(Q()) };
        // Excessive ankle-to-floor offsets cause visibly floating shoes on some rigs.
        this.soleOffsets[side]=soleClearance;
      }
      const thigh = this.bones['thigh_' + side];
      if (knee && thigh) {
        if (foot) this.legLengths[side] = thigh.getWorldPosition(V()).distanceTo(knee.getWorldPosition(V()))
          + knee.getWorldPosition(V()).distanceTo(foot.getWorldPosition(V()));
        // The pole tracks its HIP instead of remaining fixed during crouches.
        const kneeLocal = this.root.worldToLocal(knee.getWorldPosition(V()));
        const hipLocal = this.root.worldToLocal(thigh.getWorldPosition(V()));
        this.kneePoles[side] = kneeLocal.sub(hipLocal);
      }
      const hand = this.bones['hand_' + side];
      if (hand) this.hands[side] = { q: hand.getWorldQuaternion(Q()) };
    }
    // Skate stance is sideways to the deck. Infer the avatar's anatomical
    // axes from its shoulders and knees instead of treating deck X as left/right.
    const shoulderL = this.bones.upperarm_l, shoulderR = this.bones.upperarm_r;
    this.armOutward = {};
    if (shoulderL && shoulderR) {
      const lateral = this.root.worldToLocal(shoulderL.getWorldPosition(V()))
        .sub(this.root.worldToLocal(shoulderR.getWorldPosition(V()))).setY(0).normalize();
      this.armOutward.l = lateral; this.armOutward.r = lateral.clone().negate();
    }
    const restKneeDirection = V();
    for (const pole of Object.values(this.kneePoles)) restKneeDirection.add(pole.clone().setY(0));
    // Nearly straight imported knees contain rounding noise, not a reliable
    // facing direction (notably Tux). Shoulders define a stable sagittal plane.
    this.kneeForward = (this.armOutward.l || V(0, 0, -1)).clone().cross(V(0, 1, 0)).normalize();
    if (restKneeDirection.length() > .02 && restKneeDirection.dot(this.kneeForward) < 0)
      this.kneeForward.negate();
    this.root.userData.rigAudit = this.rigAudit;
    this.root.userData.rig = `Unreal-style ${this.rest.size}-bone skeleton; procedural presentation + IK`;
    calibrateFootSupportBounds(this);
    this.grabPalms = calibrateGrabPalms(this.model, { l: this.bones.hand_l, r: this.bones.hand_r });
    this.grabFingers = Object.fromEntries(SIDES.map(side => [side,
      calibrateGrabFingers(this.bones[`hand_${side}`], this.grabPalms[side])]));
    return this;
  }

  resetPresentation() {
    this.ragdoll.reset();
    this.smoothedHands.l = null;
    this.smoothedHands.r = null;
    this.grabReachName = null;
    this.grabReachDirection = 1;
    for (const [name, channel] of this.channels) Object.assign(channel, { value: name === 'IDLE' ? 1 : 0, velocity: 0 });
    for (const channel of Object.values(this.scalar)) Object.assign(channel, { value: 0, velocity: 0 });
    this.leanReady = false;
    this.kneeSwivel = { l: null, r: null };
    for (const [bone, quaternion] of this.rest) bone.quaternion.copy(quaternion);
    if (this.model) {
      this.model.position.copy(this.basePos);
      this.model.quaternion.copy(this.baseQ);
    }
  }

  w(state) { return this.channels.get(state)?.value || 0; }

  blendState(state, dt) {
    let total = 0;
    for (const [name, channel] of this.channels) {
      springStep(channel, name === state ? 1 : 0, transitionFrequency(name === state ? state : name), dt);
      channel.value = C(channel.value, 0, 1);
      total += channel.value;
    }
    // Different transition rates must not add up to two complete poses.
    if (total <= 1e-6) {
      const active = this.channels.get(state) || this.channels.get(PRESENTATION_STATES.IDLE);
      active.value = 1;
      active.velocity = 0;
      return;
    }
    for (const channel of this.channels.values()) {
      channel.value /= total;
      channel.velocity /= total;
    }
  }

  rotate(name, axis, angle, rootQ) {
    const bone = this.bones[name];
    if (!bone || Math.abs(angle) < 1e-5) return;
    setWorldQ(bone, Q().setFromAxisAngle(axis.clone().applyQuaternion(rootQ), angle).multiply(bone.getWorldQuaternion(Q())));
  }

  boardPoint(board, x, y, z) { return board?.pointWorld?.(x, y, z, V()) || null; }

  /** Local review opt-in only; Hollow's supplied motion remains the default.
   * This does not persist a preference or modify the GLB. */
  setGrabContactCandidate(enabled = false) {
    if (!/\/thehollowf\.glb(?:\?|$)/i.test(this.url)) return false;
    this.calibratedGrabReach = Boolean(enabled);
    this.resetPresentation();
    return true;
  }

  handstandTarget(side, board) { return handstandTarget.call(this, side, board); }

  grabTarget(name, side, stance, board) {
    // Toe/heel edges belong to the rider's anatomical facing, not to which
    // hand is reaching. Per-foot signs inverted Indy/Stalefish in one stance.
    const sign = Math.sign(this.kneeForward.x) || 1;
    const front = stance < 0 ? 'r' : 'l', rear = front === 'l' ? 'r' : 'l';
    const width = Math.max(.15, board?.contactRig?.deckWidth || .42) / .42;
    const length = Math.max(.6, board?.contactRig?.deckLength || 1.1) / 1.1;
    const point = (x, y, z) => {
      if (!board?.pointWorld) return null;
      if (!this.calibratedGrabReach)
        return plantedFootWorldPoint(board, x * width, y, z * length * (stance < 0 ? -1 : 1), V());
      const railX = Math.abs(x) === .14 ? Math.sign(x) * (board.contactRig?.deckWidth || .42) * .5 : x * width;
      const endZ = Math.abs(z) >= .4 ? Math.sign(z) * (board.contactRig?.deckLength || 1.1) * .5 : z * length;
      const local = grabDeckSurface(board, railX, endZ * (stance < 0 ? -1 : 1));
      return local ? plantedFootWorldPoint(board, local.x, local.y, local.z, V())
        : plantedFootWorldPoint(board, x * width, y, z * length * (stance < 0 ? -1 : 1), V());
    };
    switch (name) {
      case 'Indy': return side === rear ? point(sign * 0.14, 0.04, 0) : null;
      case 'Melon': return side === front ? point(-sign * 0.14, 0.04, 0) : null;
      case 'Nosegrab': return side === front ? point(0, 0.05, -0.43) : null;
      case 'Tailgrab': return side === rear ? point(0, 0.05, 0.43) : null;
      case 'Japan': return side === front ? point(-sign * 0.14, 0.04, -0.04) : null;
      case 'Madonna': return side === front ? point(sign * 0.08, 0.05, -0.43) : null;
      case 'Benihana': return side === rear ? point(sign * 0.08, 0.05, 0.35) : null;
      case 'Method': return side === front ? point(-sign * 0.14, 0.04, 0.08) : null;
      case 'Stalefish': return side === rear ? point(-sign * 0.14, 0.04, 0.16) : null;
      case 'Rocket Air': return point(sign * 0.09, 0.05, -0.41);
      case 'Seatbelt': return side === front ? point(0.08 * sign, 0.05, 0.4) : null;
      case 'Mute': return side === front ? point(sign * 0.14, 0.04, -0.04) : null;
      case 'Judo': return side === front ? point(0, 0.05, -0.4) : null;
      case 'Crail': return side === rear ? point(0, 0.05, -0.4) : null;
      case 'Christ Air': return side === front ? point(-sign * 0.14, 0.04, 0) : null;
      case 'Airwalk': return this.calibratedGrabReach && side === front ? point(0, 0.05, -0.35) : null;
      default: return null;
    }
  }

  /**
   * Reach one hand to a world point (hand plants), blended by weight, with the
   * elbow bending toward `pole`. The head turns to look at the hand.
   */
  reachArm(side, target, pole, weight = 1) {
    const upper = this.bones['upperarm_' + side], lower = this.bones['lowerarm_' + side], hand = this.bones['hand_' + side];
    if (!upper || !lower || !hand || !finiteV(target) || weight <= 0) return;
    const goal = hand.getWorldPosition(V()).lerp(target, C(weight, 0, 1));
    limb(upper, lower, hand, goal, pole, 2.1);
    const head = this.bones.head;
    if (head) {
      const from = head.getWorldPosition(V()), look = target.clone().sub(from);
      const facing = V(0, 0, 1).applyQuaternion(head.getWorldQuaternion(Q()));
      if (look.lengthSq() > 1e-6) {
        const turn = Q().setFromUnitVectors(facing.normalize(), look.normalize());
        setWorldQ(head, Q().slerp(turn, .35 * weight).multiply(head.getWorldQuaternion(Q())));
      }
    }
    this.root.updateWorldMatrix(true, true);
  }

  /** Straighten a leg toward a world point (Sad Plant), knee bending toward `pole`. */
  reachLeg(side, target, pole, weight = 1) {
    const upper = this.bones['thigh_' + side], lower = this.bones['calf_' + side], foot = this.bones['foot_' + side];
    if (!upper || !lower || !foot || !finiteV(target) || weight <= 0) return;
    limb(upper, lower, foot, foot.getWorldPosition(V()).lerp(target, C(weight, 0, 1)), pole);
    this.root.updateWorldMatrix(true, true);
  }

  /**
   * One-shot body gestures layered over the skating pose (2026-11):
   * 'celebrate' (big landed combo), 'stumble' (sloppy landing). Stance
   * switches start their own 'switch' gesture. Strength is 0..1.
   */
  gesture(kind, strength = 1) {
    if (!GESTURE_TIME[kind]) return;
    const current = this.gestureState;
    if (current && current.kind === 'celebrate' && kind !== 'celebrate' && current.t < current.duration * .7) return;
    this.gestureState = { kind, t: 0, duration: GESTURE_TIME[kind], strength: C(strength, 0, 1), seed: Math.random() * 6 };
  }

  update({ presentation, board, speedRatio = 0, crouch = 0, steer = 0, pushWeight = 0, pushPhase = 0,
    flipState = null, grabState = null, grabWeight = 0, manual = null, manualBalance = 0,
    grindType = null, grindBalance = 0, wallRide = null, vert = false, verticalVelocity = 0, airTime = null,
    airborne = null, bailPhysics = null, plantExtend = 0,
    bail = false, bailProgress = 0, stance = 1, flatland = null, landingSeverity = 0, time = 0, dt = 1 / 60 }) {
    if (!this.model) return;
    this.poseFrame = (this.poseFrame || 0) + 1;
    if (bail && bailPhysics && (this.ragdoll.active || this.ragdoll.start(this, bailPhysics))) {
      this.ragdoll.update(dt, bailPhysics);
      this.ragdoll.apply(this, setWorldQ, limb);
      return;
    }
    if (!bail && this.ragdoll.active) this.resetPresentation();
    const balanceResidual = this.w(PRESENTATION_STATES.FLATLAND);
    if (!bail && !flipState && !grabState && !grindType && !wallRide && !airborne
      && (flatland || (balanceResidual > 0.001 && !['AIR', 'VERT_AIR', 'OLLIE_POP'].includes(presentation?.state)))) {
      return updateApprovedBalancePose.call(this, arguments[0]);
    }
    for (const [bone, quaternion] of this.rest) bone.quaternion.copy(quaternion);
    this.model.position.copy(this.basePos);
    this.model.quaternion.copy(this.baseQ);
    this.blendState(presentation?.state || PRESENTATION_STATES.IDLE, dt);
    const air = this.w(PRESENTATION_STATES.AIR) + this.w(PRESENTATION_STATES.VERT_AIR) + this.w(PRESENTATION_STATES.OLLIE_POP);
    const brake = this.w(PRESENTATION_STATES.BRAKE), wall = this.w(PRESENTATION_STATES.WALLRIDE);
    const flat = this.w(PRESENTATION_STATES.FLATLAND), grind = this.w(PRESENTATION_STATES.GRIND);
    const manualW = this.w(PRESENTATION_STATES.MANUAL) + this.w(PRESENTATION_STATES.NOSE_MANUAL);
    const pump = this.w(PRESENTATION_STATES.PUMP);
    const rolling = C(this.w(PRESENTATION_STATES.COAST) + this.w(PRESENTATION_STATES.PUSH), 0, 1);
    const poseTime = Number.isFinite(time) ? time : 0;
    const rollSway = Math.sin(poseTime * 1.9) * rolling;
    const grab = grabState?.name ? C(grabWeight, 0, 1) : 0;
    const front = stance < 0 ? 'r' : 'l', rear = front === 'l' ? 'r' : 'l';
    const motion = flipState ? flipMotion(flipState.progress) : null;
    const wrap = impossibleMotion(flipState, stance);
    const grindShift = grindWeightShift(grindType, grindBalance, grind);
    const push = null; // User disabled the pushing animation; propulsion stays in physics.
    const pushAmount = push ? C(pushWeight, 0, 1) : 0;
    const supportShift = (push?.weightShift || 0) * pushAmount;
    const balance = C(springStep(this.scalar.balance,
      C(steer * (.3 + .7 * C(speedRatio, 0, 1)) + manualBalance * .45 + grindBalance * .5, -1, 1), 5, dt), -1, 1);
    const halfPipe = halfPipePose({ charge: crouch, air, vert, verticalVelocity,
      landing: landingSeverity, speed: speedRatio, grab,
      popProgress: presentation?.popProgress ?? 1, airTime });
    // Hand plants open the knees at the top so the board rides high overhead.
    if (plantExtend > 0) halfPipe.compression = THREE.MathUtils.lerp(halfPipe.compression, .42, C(plantExtend, 0, 1));
    const compTarget = C(halfPipe.compression + grindShift.compression + manualW * 0.04 + supportShift * .08, 0, 1);
    const compression = C(springStep(this.scalar.compression, compTarget, halfPipe.response, dt), 0, 1);
    // The chest lean and the stance-facing twist follow their targets on the
    // same springs as the crouch. Driving the lean from the raw target snapped
    // the head ~6 cm/16 deg on the takeoff frame (charge drops to 0 at once),
    // and the stance twist turned the head 51 deg in one frame on a switch.
    // Resting poses are unchanged: each spring settles on the old value.
    if (!this.leanReady) {
      Object.assign(this.scalar.torsoLean, { value: halfPipe.torsoLean, velocity: 0 });
      Object.assign(this.scalar.stanceYaw, { value: stance, velocity: 0 });
      this.leanReady = true;
    }
    const torsoLean = springStep(this.scalar.torsoLean, halfPipe.torsoLean, halfPipe.response, dt);
    const stanceFacing = C(springStep(this.scalar.stanceYaw, stance, 3.2, dt), -1, 1);
    const inAir = airborne ?? ['AIR', 'VERT_AIR', 'OLLIE_POP'].includes(presentation?.state);
    const calibratedGrab = this.calibratedGrabReach;
    const requestedSides = grab > 0 && inAir && !bail && !flipState && !flatland && board
      ? SIDES.filter(side => this.grabTarget(grabState?.name, side, stance, board)) : null;
    if (calibratedGrab && (!inAir || bail || flipState || flatland)) {
      // A different motion family must not inherit a residual grab gather.
      Object.assign(this.scalar.grabGather, { value: 0, velocity: 0 });
      this.grabReachName = null;
    }
    // Smooth only the newly authored body gather. The gameplay grip envelope,
    // deck and original Hollow motion continue to use their existing weights.
    const gather = calibratedGrab ? C(springStep(this.scalar.grabGather,
      requestedSides?.length ? grab : 0, 8, dt), 0, 1) : grab;
    if (calibratedGrab && requestedSides?.length && this.grabReachName !== grabState.name) {
      const target = this.root.worldToLocal(this.grabTarget(grabState.name, requestedSides[0], stance, board));
      const pelvis = this.root.worldToLocal(this.bones.pelvis.getWorldPosition(V()));
      this.grabReachDirection = target.clone().sub(pelvis).dot(this.kneeForward) < -.025 ? -1 : 1;
      this.grabReachName = grabState.name;
    }
    if (gather < 1e-5) this.grabReachName = null;
    const reachingSides = calibratedGrab && gather > 1e-5 && inAir && !bail && !flipState && !flatland && board && this.grabReachName
      ? SIDES.filter(side => this.grabTarget(this.grabReachName, side, stance, board)) : requestedSides;
    const grabPose = reachingSides ? (calibratedGrab
      ? grabReachPose(gather, reachingSides, true, { direction: this.grabReachDirection, compact: this.url.includes('The_Heretic') ? 1 : 0,
        endGrab: ['Nosegrab', 'Tailgrab', 'Airwalk'].includes(this.grabReachName) })
      : { pelvisHinge: .35 * grab, spineCurl: .15 * grab, shoulderBend: .25 * grab, weight: grab }) : null;
    // Hold the chosen flight pose through the descent. Only contact releases
    // it, so the arms do not drop as soon as vertical velocity turns negative.
    const airBalance = C(springStep(this.scalar.airBalance,
      inAir ? 1 : 0, inAir ? 3.5 : 2.6, dt), 0, 1);
    this.root.position.y = wrap || grab > .01 ? (board?.riderHeight ?? board?.root.position.y ?? this.deckHeight) : (board?.root.position.y ?? this.deckHeight);
    // Sit the hips back while the chest leans forward. The actual vertical
    // crouch is solved from each leg's lengths after foot targets are known.
    const hipSetback = compression * .09 * this.poseCalibration.crouchScale;
    this.model.position.addScaledVector(this.kneeForward, -hipSetback);
    // Keep the centre of mass over the supporting truck during a push.
    const travelSign = Math.sign(this.feet[front]?.point.z) || (stance < 0 ? 1 : -1);
    this.model.position.z += travelSign * .105 * supportShift * this.poseCalibration.crouchScale;
    this.model.position.x += balance * .045 + grindShift.lateral;
    this.model.position.z += grindShift.foreAft;
    if (manual === 'manual') this.model.position.z += 0.035 * manualW;
    if (manual === 'noseManual') this.model.position.z -= 0.035 * manualW;
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
    const apex = vert ? C(1 - Math.abs(verticalVelocity) / 4, 0, 1) : 0;
    const pitchAxis = this.kneeForward.clone().cross(V(0, 1, 0));
    // A low deck target needs a lower shoulder, not a stretched arm. Hinge
    // before foot IK, then share the small extra curl across the spine.
    let shoulderBendAxis = null;
    if (grabPose?.weight > 0) {
      this.rotate('pelvis', pitchAxis, -grabPose.pelvisHinge, rootQ);
      const reachingOutward = V();
      for (const side of reachingSides) if (this.armOutward[side])
        reachingOutward.add(this.armOutward[side]);
      shoulderBendAxis = V(0, 1, 0).cross(reachingOutward).normalize();
    }
    for (const name of ['spine_01', 'spine_02', 'spine_03']) {
      this.rotate(name, V(0, 1, 0), (.075 * stanceFacing + balance * .07
        + (push?.armSwing || 0) * pushAmount * .065) / 3, rootQ);
      const reachLean = calibratedGrab && grabPose?.weight > 0
        ? (torsoLean + grab * .24) * (1 - grabPose.weight) + grabPose.spineCurl
        : torsoLean + grab * .24 + (grabPose?.spineCurl || 0);
      this.rotate(name, pitchAxis, -(reachLean + pump * .025 + supportShift * .10) / 3, rootQ);
      this.rotate(name, this.kneeForward, (-balance * .14 + brake * .04 - wall * .05 + apex * .03) / 3, rootQ);
      if (shoulderBendAxis && shoulderBendAxis.lengthSq() > .5)
        this.rotate(name, shoulderBendAxis, grabPose.shoulderBend / 3, rootQ);
    }
    // Gesture and grab-style layer (2026-11). Advances once per frame.
    const gs = this.gestureState;
    if (gs) { gs.t += dt; if (gs.t >= gs.duration || bail) this.gestureState = null; }
    const gw = gs && !bail ? gestureEnvelope(gs.t / gs.duration) * gs.strength : 0;
    const gKind = gw > 0 ? gs.kind : null;
    if (!this.lastStance) this.lastStance = stance;
    if (stance !== this.lastStance) {
      if (!inAir && !bail && !flipState && !grabState) this.gesture('switch', 1);
      this.lastStance = stance;
    }
    const style = grab > .01 && !flipState && !bail ? GRAB_STYLE[grabState?.name] : null;
    for (const name of ['spine_01', 'spine_02', 'spine_03']) {
      if (style) {
        this.rotate(name, pitchAxis, style.arch * grab / 3, rootQ);
        this.rotate(name, V(0, 1, 0), style.twist * stance * grab / 3, rootQ);
      }
      if (gKind === 'celebrate') this.rotate(name, pitchAxis, .14 * gw / 3, rootQ);
      if (gKind === 'stumble') {
        const wobble = Math.sin(gs.t * 13 + gs.seed) * .2 * gw;
        this.rotate(name, this.kneeForward, wobble / 3, rootQ);
        this.rotate(name, pitchAxis, -.12 * gw / 3, rootQ);
      }
      if (gKind === 'switch') this.rotate(name, V(0, 1, 0), -stance * .85 * gw / 3, rootQ);
    }
    if (gKind === 'celebrate') this.rotate('head', pitchAxis, .22 * gw, rootQ);
    if (gKind === 'switch') this.rotate('head', V(0, 1, 0), -stance * .5 * gw, rootQ);
    if (style) this.rotate('head', pitchAxis, style.arch * .5 * grab, rootQ);
    this.rotate('pelvis', V(0, 0, 1), manualBalance * manualW * 0.08 - grindBalance * grind * 0.06, rootQ);
    this.rotate('neck_01', V(0, 1, 0), .12 * stanceFacing + balance * .04, rootQ);
    this.rotate('head', V(0, 1, 0), .25 * stanceFacing + balance * .08, rootQ);
    this.rotate('head', this.kneeForward.clone().cross(V(0, 1, 0)), torsoLean * .28, rootQ);
    this.rotate('head', V(0, 0, 1), wall * -0.08 + (bail ? 0.13 : 0), rootQ);
    // Parent-bone adjustments precede IK so they cannot move solved feet/hands.
    if (grindType === 'Smith' || grindType === 'Feeble') this.rotate('pelvis', V(1, 0, 0), -0.08 * grind, rootQ);
    if (grindType === 'Crook' || grindType === 'Overcrook') this.rotate('pelvis', V(0, 0, 1), 0.1 * grind, rootQ);
    if (wallRide) this.rotate('pelvis', V(1, 0, 0), -0.1 * wall, rootQ);
    if (flatland === 'Handstand') this.rotate('spine_02', V(1, 0, 0), 0.28 * flat, rootQ);
    if (bail) {
      this.rotate('spine_02', V(1, 0, 0), 0.22, rootQ);
      this.rotate('spine_03', V(0, 0, 1), (stance < 0 ? -1 : 1) * 0.2, rootQ);
    }

    // Grabs use constrained upper-arm reach; never compress the entire rig to
    // place a hand on a target the skeleton cannot reach.
    this.root.updateWorldMatrix(true,true);
    const deckLocked = Boolean(board && !flipState && !bail && !flatland);
    for (const side of SIDES) {
      if (!this.feet[side]) continue;
      this.ft[side].copy(this.feet[side].point);
      if (board && !bail && !flatland) {
        const contact=board.contactRig||{};
        const deckTop=(contact.deckTopY||board.deckHeight)-(board.deckHeight||0);
        const width=Math.max(0.15,(contact.deckWidth||0.42)*0.43);
        const halfLength=Math.max(0.35,(contact.deckLength||1.1)*0.39);
        const x=C(this.feet[side].point.x,-width,width);
        const z=C(this.feet[side].point.z,-halfLength,halfLength);
        const y=deckTop+this.soleOffsets[side];
        // A completed 180 shove-it changes the deck's cosmetic yaw, not
        // which foot is in front. Never cross the rider's leg targets.
        // Released flip feet stay in the skater's frame while the board spins.
        // Blend onto the final deck tilt only during the catch.
        const catchYaw = (board._yawHold || 0) + (flipState?.yaw || 0) * Math.PI * 2;
        const planted = this.root.worldToLocal(plantedFootWorldPoint(board,x,y,z,V(),catchYaw));
        if (deckLocked) this.ft[side].copy(planted);
        else {
          this.ft[side].set(x, y, z).lerp(planted, motion?.catchWeight || 0);
          // On the first frames of a flip both feet still stand on the deck
          // (tilted by the pop) and peel off it, instead of jumping to the
          // flat rider frame. The deck has not rotated yet before 0.12.
          const stay = motion ? 1 - motion.release : 0;
          if (stay > 0) this.ft[side].lerp(this.root.worldToLocal(plantedFootWorldPoint(board, x, y, z, V())), stay);
        }
      }
    }
    // Ollie/vert tuck lowers the pelvis with the feet on the deck. Only a flip
    // or a named one-foot trick releases them; a generic air pose must not float.
    if (motion) {
      this.ft[front].y += motion.frontLift;
      this.ft[rear].y += motion.rearLift;
      const outward = this.outward[front] || (front === 'l' ? -1 : 1);
      this.ft[front].x += outward * flipFlickOffset(flipState) * motion.flick;
      const noseSign = Math.sign(this.feet[front].point.z) || -1;
      this.ft[front].z += noseSign * .16 * motion.flick;
      this.ft[rear].z -= noseSign * .06 * motion.clearance;
      if (/Impossible|Shove/.test(flipState.name)) this.ft[rear].z -= noseSign * .10 * motion.flick;
      if (wrap) {
        // The rear ankle stays over the shared deck pivot while the front foot
        // lifts straight clear. A generic outward flip flick reads as a shove.
        this.ft[rear].z = THREE.MathUtils.lerp(this.ft[rear].z, wrap.pivotZ, wrap.weight);
        this.ft[rear].x = THREE.MathUtils.lerp(this.ft[rear].x, this.feet[rear].point.x, wrap.weight);
        this.ft[front].x -= outward * flipFlickOffset(flipState) * motion.flick * wrap.weight;
        this.ft[front].y += wrap.frontLift - motion.frontLift;
      }
    }
    if (push) {
      // The pushing foot leaves the deck; the support foot stays locked to it.
      const scale = C((this.legLengths[rear] || .54) / .75, .42, 1.1);
      const toeSide = Math.sign(this.kneeForward.x) || 1;
      this.ft[rear].x += toeSide * push.side * pushAmount * scale;
      // Contact follows the wheel plane, rather than a fixed 13 cm drop that
      // left some shoes hovering and pushed other rigs into the pavement.
      const groundAnkle = this.soleOffsets[rear] - this.root.position.y;
      this.ft[rear].y = THREE.MathUtils.lerp(this.ft[rear].y, groundAnkle, push.contact * pushAmount)
        + push.lift * pushAmount * scale;
      this.ft[rear].z -= travelSign * push.foreAft * pushAmount * scale;
    }
    if (flatland) {
      const wave = Math.sin(time * 7);
      switch (flatland) {
        case 'Pogo': this.ft[front].y += 0.22; this.ft[rear].y += 0.05; break;
        case 'Wrap Around': this.ft[rear].x += (rear === 'l' ? -1 : 1) * (0.18 + 0.08 * wave); break;
        case 'Handstand': this.ft.l.y += 0.36; this.ft.r.y += 0.36; break;
        case 'Casper': this.ft[front].y += 0.2; this.ft[rear].z += 0.14; break;
        case 'Truck Stand': this.ft.l.y += 0.15; this.ft.r.y += 0.05; break;
        case 'Anti Casper': this.ft[rear].y += 0.2; this.ft[front].z -= 0.14; break;
        case 'To Rail': this.ft.l.x -= 0.1; this.ft.r.x += 0.1; break;
        case 'Switch Foot Pogo': this.ft[rear].y += 0.24; break;
        case 'One Foot Manual': this.ft[front].y += 0.28; break;
        default: break;
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
      const lift = calibratedGrab ? .10 : .28;
      this.ft.l.y += lift * grab; this.ft.r.y += lift * grab;
      this.ft.l.x -= 0.2 * grab; this.ft.r.x += 0.2 * grab;
      this.ft.l.z -= 0.13 * grab; this.ft.r.z += 0.13 * grab;
    }
    if (bail) {
      this.ft.l.x -= 0.2 + bailProgress * 0.2; this.ft.r.x += 0.2 + bailProgress * 0.2;
      this.ft.l.y += 0.16; this.ft.r.y += 0.1;
    }
    if (motion && this.feet.l && this.feet.r)
      preserveFootOrder(this.ft, { l: this.feet.l.point, r: this.feet.r.point }, 1 - motion.catchWeight);
    // Solve a visible knee bend against the final ankle anchors. This replaces
    // a fixed centimetre drop that barely moved the head on short-legged rigs.
    // The target is absolute from rest each frame, so it cannot accumulate.
    if (!bail && !flatland) {
      let hipCorrection = Infinity;
      let grabMinimumHipCorrection = -Infinity;
      for (const side of SIDES) {
        const thigh = this.bones['thigh_' + side], calf = this.bones['calf_' + side],
          foot = this.bones['foot_' + side];
        if (!thigh || !calf || !foot || !this.feet[side]) continue;
        const hip = thigh.getWorldPosition(V()), knee = calf.getWorldPosition(V());
        const ankle = foot.getWorldPosition(V());
        const upperLength = hip.distanceTo(knee), lowerLength = knee.distanceTo(ankle);
        const hipLocal = this.root.worldToLocal(hip.clone()), target = this.ft[side];
        const horizontalSquared = (hipLocal.x - target.x) ** 2 + (hipLocal.z - target.z) ** 2;
        if (grab > .01) {
          const releasedJapan = calibratedGrab && grabState?.name === 'Japan' && side === rear;
          const releasedAirwalk = calibratedGrab && grabState?.name === 'Airwalk';
          const minimumReach = safeLimbReach(upperLength,lowerLength,0,releasedAirwalk ? 2.8 : releasedJapan ? 2.50 + .30 * gather : 2.50);
          const minimumHeight = Math.sqrt(Math.max(0,minimumReach*minimumReach-horizontalSquared));
          grabMinimumHipCorrection = Math.max(grabMinimumHipCorrection,target.y+minimumHeight-hipLocal.y);
        }
        // Pull the knees toward the chest for a grab instead of extending a
        // short cartoon arm past its bone length to reach the board.
        const ordinaryFlex = .45 + compression * 1.65 + grab * .38 + (side === rear ? air * .08 : 0);
        // Both Airwalk ankles are free: fold the knees to bring the shoulder
        // within anatomical reach instead of raising the whole torso with them.
        const ridingFlex = calibratedGrab && this.grabReachName === 'Airwalk'
          ? THREE.MathUtils.lerp(ordinaryFlex, 2.15, gather) : ordinaryFlex;
        // The drive leg extends while the support knee absorbs the drop to
        // the pavement. Applying the same crouch to both caused a deep bob.
        const flex = side === rear && push
          ? THREE.MathUtils.lerp(ridingFlex, .28, supportShift) : ridingFlex;
        const wantedHeight = kneeHeight(upperLength, lowerLength, flex, horizontalSquared);
        hipCorrection = Math.min(hipCorrection, target.y + wantedHeight - hipLocal.y);
      }
      if (Number.isFinite(hipCorrection)) {
        // Keep the pelvis steady while the grabbed deck and both knees rise.
        // The following clearance guard still prevents torso/deck overlap.
        hipCorrection -= grab > .01 ? (board?.grabLift || 0) : 0;
        hipCorrection = Math.max(hipCorrection,grabMinimumHipCorrection);
        this.model.position.y += hipCorrection;
        this.root.updateWorldMatrix(true, true);
        // Guard both short and tall rigs from dipping the pelvis into the deck
        // during full crouch. The shoe-contact calibration is independent:
        // corrected feet remain anchored by the following two-leg IK solve.
        ensurePelvisDeckClearance(this.model, this.bones.pelvis, board,
          Math.max(.19, this.poseCalibration.pelvisClearance));
      }
    }
    for (const side of SIDES) {
      const upper = this.bones['thigh_' + side], lower = this.bones['calf_' + side], foot = this.bones['foot_' + side];
      if (!upper || !lower || !foot || !this.feet[side]) continue;
      const lateral = this.armOutward[side] || V(this.outward[side], 0, 0);
      const poleDirection = anatomicalKneeDirection(this.kneeForward, lateral, this.kneePoles[side], compression);
      const kneePole = upper.getWorldPosition(V()).add(poleDirection.applyQuaternion(rootQ));
      const releasedFoot = (push && side === rear) || (grab > 0.01 && (
        (['Japan', 'Madonna', 'Judo'].includes(grabState?.name) && side === rear)
        || (grabState?.name === 'Benihana' && side === front) || ['Airwalk', 'Christ Air'].includes(grabState?.name)));
      // Knee bend plane turns at most ~14 rad/s (stored in the rider frame;
      // only last frame's plane is used, so resets never leave a stale one).
      const kept = this.kneeSwivel[side];
      const swivel = { frame: rootQ, maxStep: 14 * C(dt, 1 / 1000, .05),
        side: kept && kept.frame === this.poseFrame - 1 ? kept.side : null };
      limb(upper, lower, foot, this.root.localToWorld(this.ft[side].clone()), kneePole,
        calibratedGrab && grabState?.name === 'Airwalk' ? 2.8 : calibratedGrab && grabState?.name === 'Japan' && releasedFoot ? 2.55 + .25 * gather : 2.55,
        swivel);
      this.kneeSwivel[side] = { side: swivel.side, frame: this.poseFrame };
      // The board may have spun 180 degrees while the skater stayed facing
      // forward. Preserve the skater's ankle yaw and only align deck tilt.
      // Ankles tilt with the deck while standing on it and blend to the rider
      // frame as the feet leave it (and back during the catch), not in one frame.
      const footPlant = releasedFoot ? 0 : deckLocked ? 1
        : motion ? Math.max(motion.catchWeight, 1 - motion.release) : 0;
      const footQ = footWorldOrientation(this.root, board, this.feet[side].q, footPlant > 0);
      if (footPlant > 0 && footPlant < 1)
        footQ.slerp(footWorldOrientation(this.root, board, this.feet[side].q, false), 1 - footPlant);
      setWorldQ(foot, footQ);
      if (push && side === rear) this.rotate('foot_' + side, V(1, 0, 0),
        -travelSign * push.anklePitch * pushAmount, rootQ);
      if (wrap && side === rear) this.rotate('foot_' + side, V(1, 0, 0), wrap.anklePitch, rootQ);
    }

    this.root.updateWorldMatrix(true, true);
    const armUp = V(0, 1, 0).applyQuaternion(rootQ);
    for (const side of SIDES) {
      const sign = side === 'l' ? -1 : 1;
      const upper = this.bones['upperarm_' + side], lower = this.bones['lowerarm_' + side], hand = this.bones['hand_' + side];
      if (!upper || !lower || !hand) continue;
      const shoulder = this.root.worldToLocal(upper.getWorldPosition(V()));
      const lateral = this.armOutward[side] || V(this.outward[side], 0, 0);
      const target=this.at[side].copy(shoulder)
        .addScaledVector(lateral, .12 + compression * .07 + air * .16)
        .addScaledVector(this.kneeForward, .045 + compression * .10 + balance * .04);
      target.y += -.36 + compression * .10 + air * .15;
      target.y += sign * manualBalance * 0.07 * manualW + sign * grindBalance * 0.1 * grind;
      target.z += sign * rollSway * 0.025;
      target.y += rollSway * 0.012;
      target.z += sign * (0.07 * grind + 0.14 * wall);
      target.y += 0.06 * (wall + flat);
      if (bail) { target.y += 0.24 + bailProgress * 0.12; target.z += sign * 0.16; }
      const grabTarget = this.grabTarget(calibratedGrab ? this.grabReachName : grabState?.name, side, stance, board);
      if (grabState?.name === 'Madonna' && side === rear) target.addScaledVector(V(-0.04, 0.34, sign * 0.26), grab);
      if (grabState?.name === 'Japan' && side === rear) target.addScaledVector(V(-0.03, 0.18, sign * 0.14), grab);
      if (grabState?.name === 'Airwalk') target.addScaledVector(V(0, 0.18, sign * 0.2), grab);
      if (grabState?.name === 'Christ Air' && side === rear) target.addScaledVector(V(0, 0.30, sign * 0.38), grab);
      const handstand = flatland === 'Handstand' && board;
      const reach = handstand ? this.boardPoint(board, sign * 0.14, 0.04, 0) : grabTarget;
      const shoulderWorld = upper.getWorldPosition(V());
      const elbowWorld = lower.getWorldPosition(V());
      const wristWorld = hand.getWorldPosition(V());
      const armLength = shoulderWorld.distanceTo(elbowWorld) + elbowWorld.distanceTo(wristWorld);
      // Avoid forcing adult-sized hand offsets onto compact avatars.
      // Active skating poses keep elbow slack for balance and board reaches.
      const world = boundedNeutralHandTarget(
        shoulderWorld, this.root.localToWorld(target.clone()), armLength,
      );
      const skatingWeight = (1 - flat) * (1 - wall) * (bail ? 0 : 1);
      const skatingPose = skatingArmIKTargets(
        shoulderWorld, lateral.clone().applyQuaternion(rootQ),
        this.kneeForward.clone().applyQuaternion(rootQ), armLength,
        { front: side === front, balance, airBalance,
          balancePose: C(manualW + grind, 0, 1),
          up: armUp,
          breathing: Math.sin(poseTime * 1.8 + (side === front ? .3 : 0)) * .006 * (1 - air) },
      );
      world.lerp(skatingPose.wrist, skatingWeight);
      // Gesture / free-arm styling: a goal in arm lengths from the shoulder.
      const armGoal = (up, out, fwd) => shoulderWorld.clone()
        .addScaledVector(armUp, up * armLength).addScaledVector(lateral.clone().applyQuaternion(rootQ), out * armLength)
        .addScaledVector(this.kneeForward.clone().applyQuaternion(rootQ), fwd * armLength);
      if (style && !grabTarget) world.lerp(armGoal(style.up, style.out, style.fwd), .85 * grab);
      if (gKind === 'celebrate') {
        const pump = side === front ? .1 * Math.sin(gs.t * 15) : 0;
        world.lerp(side === front ? armGoal(.95 + pump, .2, .1) : armGoal(.15, .85, 0), gw);
      }
      if (gKind === 'stumble') {
        const flail = Math.sin(gs.t * 17 + gs.seed + (side === 'l' ? 0 : 2.4));
        world.lerp(armGoal(.25 + .4 * flail, .85, .25 * flail), gw);
      }
      const reachWeight = handstand ? flat : calibratedGrab ? gather : grab;
      let palmRotation = null;
      let wristReach = reach;
      if (reach && !handstand && calibratedGrab && this.grabPalms?.[side] && board) {
        const deckUp = V(0, 1, 0).applyQuaternion(board.root.getWorldQuaternion(Q()));
        const center = plantedFootWorldPoint(board, 0, 0, 0, V());
        palmRotation = grabPalmOrientation(this.grabPalms[side], reach.clone().sub(center), deckUp);
        if (palmRotation) {
          const padOffset = this.grabPalms[side].point.clone().multiply(hand.getWorldScale(V())).applyQuaternion(palmRotation);
          wristReach = reach.clone().sub(padOffset);
        }
      }
      if (reach) {
        world.lerp(boundedHandReach(shoulderWorld, wristReach, armLength,
          grabPose?.weight > 0 ? grabReachMargin(armLength) : .035), reachWeight);
      }
      const outwardWorld = lateral.clone().applyQuaternion(rootQ);
      const headWorld = this.bones.head?.getWorldPosition(V()) || null;
      // Stop wrists traversing the body or the head during ground, vert,
      // landing, turn and grab blends. Cross-body deck grabs retain their
      // intent but never pass through the face.
      // The modes ease across narrow bands around the old switch points
      // (grab .12, reach .01, skating .98) rather than flipping in one frame.
      const crossWeight = flatland ? 1 : reach ? THREE.MathUtils.smoothstep(grab, .08, .16) : 0;
      // Keep the requested A-pose nearly extended through both safety passes.
      // Shortening its wrist goal forces the elbow to fold against the torso.
      const neutralWeight = THREE.MathUtils.smoothstep(skatingWeight, .96, .99)
        * (reach ? 1 - THREE.MathUtils.smoothstep(reachWeight, .004, .03) : 1);
      world.copy(blendedSafeArmGoal(shoulderWorld, world, outwardWorld, headWorld,
        armLength, crossWeight, neutralWeight));
      // Pole offsets must also scale to the actual chain, or short-rig elbows
      // swing across the body even when their wrist target is reachable.
      const elbowPoleReach = Math.max(.075, Math.min(.24, armLength * .42));
      const elbowPole = this.root.localToWorld(shoulder.clone()
        .addScaledVector(lateral, elbowPoleReach)
        .addScaledVector(this.kneeForward, -elbowPoleReach * .35)
        .add(V(0, -elbowPoleReach * .58, 0)));
      elbowPole.lerp(skatingPose.elbow, skatingWeight * (reach ? 1 - reachWeight : 1));
      if (headWorld) {
        const fromHead = elbowPole.clone().sub(headWorld);
        const radius = Math.max(.075, armLength * .34);
        if (fromHead.lengthSq() < radius * radius) {
          // Elbow pole must stay on its own anatomical side if a trick brings
          // the hand close to the face; a tiny headward pole causes IK flips.
          elbowPole.copy(headWorld).addScaledVector(
            outwardWorld.clone().setY(0).normalize(), radius);
        }
      }
      // Smooth the gesture relative to its moving shoulder. Smoothing world
      // positions dragged the wrists behind the rider at skating speed.
      const localOffset = this.root.worldToLocal(world.clone()).sub(shoulder);
      const smoothedOffset = smoothHandDestination(this.smoothedHands[side], localOffset,
        dt, grab > .01 ? 24 : 16);
      const smoothedWorld = this.root.localToWorld(shoulder.clone().add(smoothedOffset));
      // Critically, safety must be checked AFTER interpolation too: a prior
      // frame's grab/air destination can otherwise cut straight through the
      // head even when both animation endpoints are safe.
      const safeWorld = blendedSafeArmGoal(shoulderWorld, smoothedWorld, outwardWorld,
        headWorld, armLength, crossWeight, neutralWeight);
      this.smoothedHands[side] = this.root.worldToLocal(safeWorld.clone()).sub(shoulder);
      limb(upper, lower, hand, safeWorld, elbowPole, 2.10);
      if (headWorld) {
        // A hand target can be clear while the two-bone IK arc still crosses
        // the skull. Check actual solved joints and retreat to a safe open
        // A-pose on those frames, with finite travel and no bone resizing.
        const clearance = Math.max(.105, armLength * .37);
        const headClipping = () => lower.getWorldPosition(V()).distanceTo(headWorld) < clearance
          || hand.getWorldPosition(V()).distanceTo(headWorld) < clearance;
        if (headClipping()) {
          const rest = neutralArmIKTargets(shoulderWorld, outwardWorld,
            this.kneeForward.clone().applyQuaternion(rootQ), armLength);
          if (rest) {
            const safeRest = safeArmGoal(shoulderWorld, rest.wrist, outwardWorld,
              headWorld, armLength, { neutral: true });
            limb(upper, lower, hand, safeRest, rest.elbow, 2.10);
            this.smoothedHands[side].copy(this.root.worldToLocal(safeRest.clone()).sub(shoulder));
          }
        }
      }
      if (this.hands[side]) {
        const restHand = this.rest.get(hand);
        // Neutral wrists follow their forearms in local space. Holding the
        // imported world wrist orientation while IK moves the elbow twists it.
        hand.quaternion.copy(restHand);
        // Keep the wrist aligned to the deck surface without copying the
        // decorative 180-degree shove-it yaw into the rider's forearm.
        if (reach && board) {
          if (palmRotation) {
            // Share pronation with the forearm around its actual wrist axis.
            // This changes neither arm segment nor the solved wrist position.
            const axis = hand.getWorldPosition(V()).sub(lower.getWorldPosition(V())).normalize();
            const restWorld = lower.getWorldQuaternion(Q()).multiply(restHand);
            const delta = palmRotation.clone().multiply(restWorld.invert());
            if (delta.w < 0) delta.set(-delta.x, -delta.y, -delta.z, -delta.w);
            const projection = V(delta.x, delta.y, delta.z).dot(axis);
            const twist = C(2 * Math.atan2(projection, delta.w), -.85, .85) * reachWeight;
            setWorldQ(lower, Q().setFromAxisAngle(axis, twist).multiply(lower.getWorldQuaternion(Q())));
            const local = lower.getWorldQuaternion(Q()).invert().multiply(palmRotation);
            hand.quaternion.copy(restHand).rotateTowards(local, .95 * reachWeight);
          } else {
            setWorldQ(hand, footWorldOrientation(this.root, board, this.hands[side].q, true));
            const grabLocal = hand.quaternion.clone();
            hand.quaternion.copy(restHand).rotateTowards(grabLocal, .45 * reachWeight);
          }
        }
      }
      if (calibratedGrab) applyGrabFingers(this.grabFingers?.[side], reach && !handstand ? reachWeight : 0);
    }
    for (const [bone, quaternion] of this.rest) if (!finiteQ(bone.quaternion)) bone.quaternion.copy(quaternion);
    this.root.updateWorldMatrix(true, true);
  }
  /** Release resources owned by this GLB instance after a successful hot-swap
   * or rejected import. Board, scene lighting, renderer and other riders are
   * never owned here. Repeated calls are safe.
   */
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.ragdoll.reset();
    const geometries = new Set(), materials = new Set();
    const textures = new Set(), skeletons = new Set();
    this.model?.traverse(object => {
      if (object.isSkinnedMesh && object.skeleton) skeletons.add(object.skeleton);
      if (object.geometry) geometries.add(object.geometry);
      for (const material of (Array.isArray(object.material) ? object.material : [object.material])) {
        if (!material) continue;
        materials.add(material);
        for (const value of Object.values(material)) {
          if (value?.isTexture) textures.add(value);
        }
        for (const uniform of Object.values(material.uniforms || {})) {
          if (uniform?.value?.isTexture) textures.add(uniform.value);
        }
      }
    });
    this.root.removeFromParent();
    for (const skeleton of skeletons) skeleton.dispose?.();
    for (const geometry of geometries) geometry.dispose?.();
    for (const material of materials) material.dispose?.();
    for (const texture of textures) texture.dispose?.();
  }

}
