// Poses any humanoid GLB on the board with world-space IK, so rigs from
// Mixamo, Unreal Mannequin, Blender Rigify-exported or custom skeletons all
// work without retargeting: bones are found by name, then feet are planted on
// the deck and knees/arms are aimed at targets (bone axes don't matter).
//
// The motion itself (compression, flips, grabs, grinds, manuals, bails) is a
// port of v1's ApprovedBalancePose / UnrealRider, scaled to each rig's legs.
import * as THREE from 'three';
import { compression, flipFlick, flipMotion, grabFeet, GRAB_REACH, grindShift, spring } from './RiderMotion';

const ALIASES: Record<string, string[]> = {
  pelvis: ['pelvis', 'hips', 'hip'],
  spine1: ['spine01', 'spine', 'spine1'], spine2: ['spine02', 'spine1', 'spine2'], spine3: ['spine03', 'spine2', 'chest', 'upperchest'],
  neck: ['neck01', 'neck'], head: ['head'],
  upperArmL: ['upperarml', 'leftarm', 'leftupperarm', 'upperarmleft', 'arml'],
  upperArmR: ['upperarmr', 'rightarm', 'rightupperarm', 'upperarmright', 'armr'],
  lowerArmL: ['lowerarml', 'leftforearm', 'leftlowerarm', 'forearml', 'lowerarmleft'],
  lowerArmR: ['lowerarmr', 'rightforearm', 'rightlowerarm', 'forearmr', 'lowerarmright'],
  handL: ['handl', 'lefthand', 'handleft'], handR: ['handr', 'righthand', 'handright'],
  thighL: ['thighl', 'leftupleg', 'leftupperleg', 'leftthigh', 'upperlegl', 'thighleft'],
  thighR: ['thighr', 'rightupleg', 'rightupperleg', 'rightthigh', 'upperlegr', 'thighright'],
  calfL: ['calfl', 'leftleg', 'leftlowerleg', 'leftcalf', 'lowerlegl', 'shinl', 'calfleft'],
  calfR: ['calfr', 'rightleg', 'rightlowerleg', 'rightcalf', 'lowerlegr', 'shinr', 'calfright'],
  footL: ['footl', 'leftfoot', 'footleft'], footR: ['footr', 'rightfoot', 'footright'],
};
export type BoneKey = keyof typeof ALIASES;

export function normalizeBoneName(name: string): string {
  return String(name ?? '').split(/[:|]/).pop()!.replace(/^mixamorig[0-9_]*/i, '').replace(/^(def|org|mch)[-_.]/i, '')
    .replace(/[^a-z0-9]/gi, '').toLowerCase();
}

export function resolveBones(bones: THREE.Bone[]): Partial<Record<BoneKey, THREE.Bone>> {
  const indexed = new Map<string, THREE.Bone>();
  for (const bone of bones) {
    const key = normalizeBoneName(bone.name);
    if (key && !indexed.has(key)) indexed.set(key, bone);
  }
  const result: Partial<Record<BoneKey, THREE.Bone>> = {};
  for (const [key, aliases] of Object.entries(ALIASES)) {
    const bone = aliases.map(a => indexed.get(a)).find(Boolean);
    if (bone) result[key as BoneKey] = bone;
  }
  return result;
}

export interface RigCheck { ok: boolean; missing: BoneKey[] }

/** Legs are required (feet must reach the board); arms and spine are optional. */
export function checkRig(bones: Partial<Record<BoneKey, THREE.Bone>>): RigCheck {
  const required: BoneKey[] = ['pelvis', 'thighL', 'calfL', 'footL', 'thighR', 'calfR', 'footR'];
  const missing = required.filter(k => !bones[k]);
  return { ok: missing.length === 0, missing };
}

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3();
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion();

function setWorldQuaternion(bone: THREE.Object3D, world: THREE.Quaternion): void {
  if (!bone.parent) return;
  bone.parent.getWorldQuaternion(_q2);
  bone.quaternion.copy(_q2.invert().multiply(world));
  bone.updateMatrixWorld(true);
}

/** Rotate `bone` so the direction to `child` points at `target`. */
function aim(bone: THREE.Object3D, child: THREE.Object3D, target: THREE.Vector3): void {
  bone.updateWorldMatrix(true, true);
  const origin = bone.getWorldPosition(_a);
  const rest = child.getWorldPosition(_b).sub(origin);
  const want = _c.copy(target).sub(origin);
  if (rest.lengthSq() < 1e-10 || want.lengthSq() < 1e-10) return;
  const delta = new THREE.Quaternion().setFromUnitVectors(rest.normalize(), want.normalize());
  setWorldQuaternion(bone, delta.multiply(bone.getWorldQuaternion(_q)));
}

/** Analytic two-bone IK: upper → lower → end reaches `target`, bending toward `pole`. */
function twoBone(upper: THREE.Object3D, lower: THREE.Object3D, end: THREE.Object3D, target: THREE.Vector3, pole: THREE.Vector3): void {
  upper.updateWorldMatrix(true, true);
  const origin = upper.getWorldPosition(new THREE.Vector3());
  const joint0 = lower.getWorldPosition(new THREE.Vector3());
  const a = origin.distanceTo(joint0);
  const b = joint0.distanceTo(end.getWorldPosition(_b));
  const axis = target.clone().sub(origin);
  if (a < 1e-5 || b < 1e-5 || axis.lengthSq() < 1e-10) return;
  const distance = THREE.MathUtils.clamp(axis.length(), Math.abs(a - b) + 1e-3, a + b - 1e-3);
  axis.normalize();
  const along = (a * a + distance * distance - b * b) / (2 * distance);
  const side = pole.clone().sub(origin).projectOnPlane(axis);
  if (side.lengthSq() < 1e-8) side.set(0, 0, 1).projectOnPlane(axis);
  side.normalize();
  const joint = origin.clone().addScaledVector(axis, along).addScaledVector(side, Math.sqrt(Math.max(0, a * a - along * along)));
  aim(upper, lower, joint);
  aim(lower, end, origin.clone().addScaledVector(axis, distance));
}

export interface PoseInput {
  dt: number;
  time: number;
  charge: number;               // ollie charge 0…1
  air: boolean;
  vert: boolean;
  verticalVelocity: number;
  airTime: number;
  speedRatio: number;           // speed / cruise speed
  steer: number;
  landing: number;              // 0…1, decays after a landing
  flip: { name: string; progress: number } | null;
  grab: { name: string } | null;
  grind: { name: string; balance: number } | null;
  manual: { kind: 'manual' | 'noseManual'; balance: number } | null;
  wallride: boolean;
  bail: number;                 // 0 = riding, 0…1 tumble progress
  switchStance: boolean;
  deckTop: number;
  deckWidth: number;
  deckLength: number;
}

type Side = 'L' | 'R';

export class RigRider {
  readonly model: THREE.Object3D;
  readonly bones: Partial<Record<BoneKey, THREE.Bone>>;
  private rest = new Map<THREE.Bone, THREE.Quaternion>();
  private restFootRel: Partial<Record<Side, THREE.Quaternion>> = {};
  private legLength = 0.8;
  private ankleHeight = 0.08;
  private baseY = 0;
  private comp = { value: 0.2, velocity: 0 };
  private grabGather = { value: 0, velocity: 0 };
  private balance = { value: 0, velocity: 0 };
  private lastGrab = '';

  /**
   * @param scene  The loaded GLB scene (skinned humanoid).
   * @param height Target standing height in metres.
   */
  constructor(scene: THREE.Object3D, height = 1.75) {
    this.model = scene;
    const bones: THREE.Bone[] = [];
    scene.traverse(o => {
      if ((o as THREE.Bone).isBone) bones.push(o as THREE.Bone);
      const mesh = o as THREE.SkinnedMesh;
      if (mesh.isMesh) { mesh.castShadow = true; mesh.receiveShadow = true; mesh.frustumCulled = false; }
    });
    this.bones = resolveBones(bones);
    const check = checkRig(this.bones);
    if (!check.ok) throw new Error(`Rider rig is missing: ${check.missing.join(', ')}`);
    for (const bone of bones) this.rest.set(bone, bone.quaternion.clone());

    // Normalise size and stand on y = 0, facing +X (sideways on the board, regular stance).
    const box = new THREE.Box3().setFromObject(scene);
    scene.scale.multiplyScalar(height / (box.getSize(new THREE.Vector3()).y || 1));
    scene.rotation.y = Math.PI / 2;
    scene.updateMatrixWorld(true);
    this.baseY = -new THREE.Box3().setFromObject(scene).min.y;
    scene.position.y = this.baseY;
    scene.updateMatrixWorld(true);
    const p = (k: BoneKey) => this.bones[k]!.getWorldPosition(new THREE.Vector3());
    this.legLength = p('thighL').distanceTo(p('calfL')) + p('calfL').distanceTo(p('footL'));
    this.ankleHeight = Math.max(0.03, (p('footL').y + p('footR').y) / 2);
    const rootQ = scene.getWorldQuaternion(new THREE.Quaternion()).multiply(
      new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -Math.PI / 2));
    for (const side of ['L', 'R'] as const) {
      const foot = this.bones[`foot${side}` as BoneKey]!;
      // Foot orientation relative to the board frame, so feet stay flat on the deck.
      this.restFootRel[side] = rootQ.clone().invert().multiply(foot.getWorldQuaternion(new THREE.Quaternion()));
    }
  }

  /** Rotate a bone about an axis given in the board frame. */
  private rotate(key: BoneKey, axis: THREE.Vector3, angle: number, rootQ: THREE.Quaternion): void {
    const bone = this.bones[key];
    if (!bone || !angle) return;
    const worldAxis = axis.clone().applyQuaternion(rootQ).normalize();
    const q = new THREE.Quaternion().setFromAxisAngle(worldAxis, angle).multiply(bone.getWorldQuaternion(new THREE.Quaternion()));
    setWorldQuaternion(bone, q);
  }

  /** Pose on the board. `parent` is the rider root (board space: nose -Z, up +Y, rider front +X). */
  pose(parent: THREE.Object3D, i: PoseInput): void {
    for (const [bone, q] of this.rest) bone.quaternion.copy(q);
    const dt = Math.min(0.05, Math.max(1e-4, i.dt));
    const k = THREE.MathUtils.clamp(this.legLength / 0.75, 0.42, 1.15); // v1 distances were for ~0.75 m legs
    const stance = i.switchStance ? -1 : 1;
    const front: Side = i.switchStance ? 'R' : 'L';
    const rear: Side = front === 'L' ? 'R' : 'L';
    const air = i.air ? 1 : 0;
    const grabName = i.grab?.name ?? '';
    if (grabName !== this.lastGrab && grabName) this.grabGather.velocity = 0;
    this.lastGrab = grabName;
    const grabW = THREE.MathUtils.clamp(spring(this.grabGather, grabName ? 1 : 0, 8, dt), 0, 1);
    const manualW = i.manual ? 1 : 0;
    const manualLean = i.manual ? (i.manual.kind === 'manual' ? 1 : -1) : 0;
    const manualBalance = i.manual?.balance ?? 0;
    const grindW = i.grind ? 1 : 0;
    const grindBalance = i.grind?.balance ?? 0;
    const shift = grindShift(i.grind?.name ?? null, grindBalance);
    const wall = i.wallride ? 1 : 0;
    const bail = THREE.MathUtils.clamp(i.bail, 0, 1);
    const balance = THREE.MathUtils.clamp(spring(this.balance,
      THREE.MathUtils.clamp(i.steer * (0.3 + 0.7 * Math.min(1, i.speedRatio)) + manualBalance * 0.45 + grindBalance * 0.5, -1, 1), 5, dt), -1, 1);
    const compTarget = compression({
      charge: i.charge, air, vert: i.vert, verticalVelocity: i.verticalVelocity, landing: i.landing,
      speed: i.speedRatio, grab: grabW, airTime: i.airTime,
    });
    const comp = THREE.MathUtils.clamp(spring(this.comp, Math.min(1, compTarget.value + shift.compression * grindW + manualW * 0.04), compTarget.response, dt), 0, 1);

    // Whole-body placement: crouch, weight shifts, bail tumble.
    const drop = (0.025 + comp * 0.43) * (this.legLength / 0.8);
    this.model.position.set(
      shift.lateral * grindW * k + (bail ? stance * (0.08 + bail * 0.16) * k : 0),
      this.baseY + i.deckTop - drop - (bail ? Math.min(0.58, bail * 0.72) * k : 0),
      (manualLean * 0.065 + manualBalance * manualW * 0.018 + shift.foreAft * grindW) * k,
    );
    this.model.rotation.set(0, Math.PI / 2, 0);
    // Sideways tumble about the board axis, applied in the board frame.
    if (bail) this.model.quaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -stance * Math.min(1.28, bail * 1.68)));
    this.model.updateMatrixWorld(true);
    parent.updateMatrixWorld(true);
    const rootQ = parent.getWorldQuaternion(new THREE.Quaternion());
    const X = new THREE.Vector3(1, 0, 0), Y = new THREE.Vector3(0, 1, 0), Z = new THREE.Vector3(0, 0, 1);

    // Spine, pelvis and head (parents first, so IK below isn't disturbed).
    const apex = i.vert ? THREE.MathUtils.clamp(1 - Math.abs(i.verticalVelocity) / 4, 0, 1) : 0;
    for (const key of ['spine1', 'spine2', 'spine3'] as BoneKey[]) {
      this.rotate(key, Y, 0.045 * stance, rootQ);
      this.rotate(key, Z, (-0.02 - comp * 0.38 - balance * 0.025 - wall * 0.05) / 3, rootQ);
      this.rotate(key, X, apex * 0.03 - manualLean * 0.035, rootQ);
    }
    this.rotate('pelvis', Z, manualBalance * manualW * 0.08 - grindBalance * grindW * 0.06, rootQ);
    if (i.grind?.name === 'Smith' || i.grind?.name === 'Feeble') this.rotate('pelvis', X, -0.08, rootQ);
    if (i.grind?.name === 'Crook' || i.grind?.name === 'Overcrook') this.rotate('pelvis', Z, 0.1, rootQ);
    if (wall) this.rotate('pelvis', X, -0.1, rootQ);
    if (bail) { this.rotate('spine2', X, 0.22, rootQ); this.rotate('spine3', Z, stance * 0.2, rootQ); }
    this.rotate('neck', Y, 0.11 * stance + 0.2 * stance, rootQ);
    this.rotate('head', Y, 0.22 * stance + 0.25 * stance, rootQ);
    if (bail || wall) this.rotate('head', Z, -wall * 0.08 + (bail ? 0.13 : 0), rootQ);

    // Lower the body so a grabbing hand can actually reach the deck (v1 reachDrop).
    const toWorld = (x: number, y: number, z: number) => parent.localToWorld(new THREE.Vector3(x, y, z));
    const toLocal = (v: THREE.Vector3) => parent.worldToLocal(v.clone());
    const reach = GRAB_REACH[grabName];
    const deckX = i.deckWidth / 0.42, deckZ = i.deckLength / 1.1;
    const grabPoint = (side: Side): THREE.Vector3 | null => {
      if (!reach) return null;
      const reachSide = reach.side === 'both' || (reach.side === 'front' ? side === front : side === rear);
      if (!reachSide) return null;
      const railX = Math.abs(reach.x) === 0.14 ? Math.sign(reach.x) * i.deckWidth * 0.5 : reach.x * deckX;
      return toWorld(railX, i.deckTop + reach.y * 0.5, reach.z * deckZ * stance);
    };
    if (grabW > 0.01 && reach) {
      let reachDrop = 0;
      for (const side of ['L', 'R'] as const) {
        const target = grabPoint(side);
        const upper = this.bones[`upperArm${side}` as BoneKey], lower = this.bones[`lowerArm${side}` as BoneKey], hand = this.bones[`hand${side}` as BoneKey];
        if (!target || !upper || !lower || !hand) continue;
        const sa = upper.getWorldPosition(new THREE.Vector3()), sb = lower.getWorldPosition(new THREE.Vector3()), sc = hand.getWorldPosition(new THREE.Vector3());
        const length = (sa.distanceTo(sb) + sb.distanceTo(sc)) * 0.96;
        const shoulder = toLocal(sa), local = toLocal(target);
        const lateral = Math.hypot(shoulder.x - local.x, shoulder.z - local.z);
        reachDrop = Math.max(reachDrop, shoulder.y - local.y - Math.sqrt(Math.max(0.005, length * length - lateral * lateral)));
      }
      this.model.position.y -= THREE.MathUtils.clamp(reachDrop, 0, 0.28 * k) * grabW;
      this.model.updateMatrixWorld(true);
    }

    // Feet: planted on the deck, then trick offsets (v1 foot targets).
    const spread = Math.min(0.28 * k, i.deckLength * 0.27);
    const ft: Record<Side, THREE.Vector3> = {
      [front]: new THREE.Vector3(0.02, i.deckTop + this.ankleHeight, -spread * stance),
      [rear]: new THREE.Vector3(0.02, i.deckTop + this.ankleHeight, spread * stance),
    } as Record<Side, THREE.Vector3>;
    if (i.flip) {
      const m = flipMotion(i.flip.progress);
      ft[front].y += (m.footLift + m.frontLift * 0.6) * k;
      ft[rear].y += (m.footLift + m.rearLift * 0.6) * k;
      ft[front].x += flipFlick(i.flip.name) * m.flick * k;
      ft[front].z += -stance * 0.16 * m.flick * k;
      ft[rear].z += stance * 0.06 * m.clearance * k;
      if (/Impossible|Shove/.test(i.flip.name)) ft[rear].z += stance * 0.1 * m.flick * k;
    }
    if (grabW > 0.01) {
      const offsets = grabFeet(grabName);
      for (const [side, o] of [[front, offsets.front], [rear, offsets.rear]] as const) {
        ft[side].x += o.x * stance * grabW * k;
        ft[side].y += o.y * grabW * k;
        ft[side].z += o.z * stance * grabW * k;
      }
    }
    if (bail) {
      ft[front].x -= (0.2 + bail * 0.2) * k; ft[rear].x += (0.2 + bail * 0.2) * k;
      ft[front].y += 0.16 * k; ft[rear].y += 0.1 * k;
    }
    for (const side of ['L', 'R'] as const) {
      const thigh = this.bones[`thigh${side}` as BoneKey], calf = this.bones[`calf${side}` as BoneKey], foot = this.bones[`foot${side}` as BoneKey];
      if (!thigh || !calf || !foot) continue;
      const t = ft[side];
      twoBone(thigh, calf, foot, toWorld(t.x, t.y, t.z), toWorld(t.x + 0.35, t.y + 0.25 + this.legLength * 0.4, t.z));
      // Feet stay flat to the board, except when a grab or bail takes them off it.
      const released = bail > 0 || (grabW > 0.3 && (grabFeet(grabName).front.y > 0 && side === front || grabFeet(grabName).rear.y > 0 && side === rear));
      const footQ = rootQ.clone().multiply(this.restFootRel[side]!);
      if (released) footQ.slerp(rootQ.clone().multiply(new THREE.Quaternion().setFromAxisAngle(Z, -0.4)).multiply(this.restFootRel[side]!), 0.5);
      setWorldQuaternion(foot, footQ);
    }

    // Arms: relaxed balance pose around the shoulders, grabs reach the deck.
    for (const side of ['L', 'R'] as const) {
      const upper = this.bones[`upperArm${side}` as BoneKey], lower = this.bones[`lowerArm${side}` as BoneKey], hand = this.bones[`hand${side}` as BoneKey];
      if (!upper || !lower || !hand) continue;
      const sign = side === 'L' ? -1 : 1; // left hand toward the nose side
      const shoulder = toLocal(upper.getWorldPosition(new THREE.Vector3()));
      const target = shoulder.clone().add(new THREE.Vector3(
        (0.14 + comp * 0.02) * k,
        (-0.31 + air * 0.08 + sign * balance * 0.04) * k,
        sign * (0.14 + air * 0.08) * k));
      target.y += Math.sin(i.time * 3.5 + sign * 0.4) * 0.01 * i.speedRatio * k;
      target.y += (sign * manualBalance * 0.07 * manualW + sign * grindBalance * 0.1 * grindW + manualW * 0.07 + 0.06 * wall) * k;
      target.z += sign * (0.07 * grindW + 0.14 * wall + 0.1 * manualW) * k;
      target.x -= manualLean * 0.045 * k;
      if (bail) { target.y += (0.24 + bail * 0.12) * k; target.z += sign * 0.16 * k; }
      const isRear = side === rear;
      if (grabName === 'Madonna' && isRear) target.add(new THREE.Vector3(-0.04, 0.34, sign * 0.26).multiplyScalar(grabW * k));
      if (grabName === 'Japan' && isRear) target.add(new THREE.Vector3(-0.03, 0.18, sign * 0.14).multiplyScalar(grabW * k));
      if (grabName === 'Airwalk') target.add(new THREE.Vector3(0, 0.18, sign * 0.2).multiplyScalar(grabW * k));
      if (grabName === 'Christ Air' && isRear) target.add(new THREE.Vector3(0, 0.3, sign * 0.38).multiplyScalar(grabW * k));
      const world = parent.localToWorld(target.clone());
      const deck = grabPoint(side);
      if (deck) world.lerp(deck, grabW);
      twoBone(upper, lower, hand, world, parent.localToWorld(shoulder.clone().add(new THREE.Vector3(-0.18, -0.2, sign * 0.7).multiplyScalar(k))));
    }
  }
}
