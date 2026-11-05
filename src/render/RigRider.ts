// Poses any humanoid GLB on the board with world-space IK, so rigs from
// Mixamo, Unreal Mannequin, Blender Rigify-exported or custom skeletons all
// work without retargeting: bones are found by name, then feet are planted on
// the deck and knees/arms are aimed at targets (bone axes don't matter).
import * as THREE from 'three';

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

const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _v4 = new THREE.Vector3();
const _q1 = new THREE.Quaternion(), _q2 = new THREE.Quaternion();

function setWorldQuaternion(bone: THREE.Object3D, world: THREE.Quaternion): void {
  if (!bone.parent) return;
  bone.parent.getWorldQuaternion(_q2);
  bone.quaternion.copy(_q2.invert().multiply(world));
  bone.updateMatrixWorld(true);
}

/** Rotate `bone` so the direction to `child` points at `target`. */
function aim(bone: THREE.Object3D, child: THREE.Object3D, target: THREE.Vector3): void {
  bone.updateWorldMatrix(true, true);
  const origin = bone.getWorldPosition(_v1);
  const rest = child.getWorldPosition(_v2).sub(origin);
  const want = _v3.copy(target).sub(origin);
  if (rest.lengthSq() < 1e-10 || want.lengthSq() < 1e-10) return;
  _q1.setFromUnitVectors(rest.normalize(), want.normalize());
  setWorldQuaternion(bone, _q1.multiply(bone.getWorldQuaternion(new THREE.Quaternion())));
}

/** Analytic two-bone IK: upper → lower → end reaches `target`, bending toward `pole`. */
function twoBone(upper: THREE.Object3D, lower: THREE.Object3D, end: THREE.Object3D, target: THREE.Vector3, pole: THREE.Vector3): void {
  upper.updateWorldMatrix(true, true);
  const origin = upper.getWorldPosition(new THREE.Vector3());
  const a = origin.distanceTo(lower.getWorldPosition(_v4));
  const b = lower.getWorldPosition(_v4).distanceTo(end.getWorldPosition(_v2));
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
  crouch: number;      // 0 standing … 1 deep crouch
  grab: boolean;
  lean: number;        // balance lean, -1 … 1
  air: boolean;
  bail: number;        // 0 … 1 tumble progress
  switchStance: boolean;
}

export class RigRider {
  readonly model: THREE.Object3D;
  readonly bones: Partial<Record<BoneKey, THREE.Bone>>;
  private rest = new Map<THREE.Bone, THREE.Quaternion>();
  private restPelvisHeight = 0.9;
  private legLength = 0.8;
  private baseY = 0;

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
    const size = box.getSize(new THREE.Vector3()).y || 1;
    scene.scale.multiplyScalar(height / size);
    scene.rotation.y = Math.PI / 2;
    scene.updateMatrixWorld(true);
    const box2 = new THREE.Box3().setFromObject(scene);
    this.baseY = -box2.min.y;
    scene.position.y = this.baseY;
    scene.updateMatrixWorld(true);
    const pelvis = this.bones.pelvis!.getWorldPosition(new THREE.Vector3());
    this.restPelvisHeight = pelvis.y;
    const thigh = this.bones.thighL!.getWorldPosition(new THREE.Vector3());
    const knee = this.bones.calfL!.getWorldPosition(new THREE.Vector3());
    const ankle = this.bones.footL!.getWorldPosition(new THREE.Vector3());
    this.legLength = thigh.distanceTo(knee) + knee.distanceTo(ankle);
  }

  /**
   * Pose on the board. `parent` is the rider root (board space: nose -Z, up +Y),
   * `deckTop` the deck surface height, `feet` the front/back foot z offsets.
   */
  pose(parent: THREE.Object3D, deckTop: number, input: PoseInput, footSpread = 0.24): void {
    for (const [bone, q] of this.rest) bone.quaternion.copy(q);
    const crouch = THREE.MathUtils.clamp(input.crouch, 0, 1);
    // Lower the body: legs fold, feet stay on the deck.
    // Always a little knee bend (skaters never ride straight-legged), deeper when charging/landing.
    const drop = this.legLength * (0.2 + crouch * 0.3) + (input.grab ? this.legLength * 0.22 : 0);
    this.model.position.set(0, this.baseY + deckTop - drop, 0);
    this.model.rotation.set(input.lean * 0.25, Math.PI / 2, -input.bail * 1.3);
    this.model.updateMatrixWorld(true);
    parent.updateMatrixWorld(true);

    const toWorld = (x: number, y: number, z: number) => parent.localToWorld(new THREE.Vector3(x, y, z));
    const front = input.switchStance ? 'R' : 'L';
    const back = front === 'L' ? 'R' : 'L';
    const ankleY = deckTop + this.legLength * 0.09 + (input.grab ? 0.12 : 0);
    const feet: Record<'L' | 'R', THREE.Vector3> = {
      [front]: toWorld(0.02, ankleY, -footSpread),
      [back]: toWorld(0.02, ankleY, footSpread),
    } as Record<'L' | 'R', THREE.Vector3>;
    // Knees point forward over the toes (+X, the rider's front) and slightly out.
    for (const side of ['L', 'R'] as const) {
      const thigh = this.bones[`thigh${side}` as BoneKey], calf = this.bones[`calf${side}` as BoneKey], foot = this.bones[`foot${side}` as BoneKey];
      if (!thigh || !calf || !foot) continue;
      const out = side === front ? -0.25 : 0.25;
      twoBone(thigh, calf, foot, feet[side], toWorld(0.9, deckTop + 0.5, (side === front ? -footSpread : footSpread) + out));
    }

    // Upper body: chest twists toward the nose, head looks down the line.
    const twist = (input.switchStance ? -1 : 1) * 0.35;
    for (const key of ['spine2', 'spine3'] as BoneKey[]) {
      const bone = this.bones[key];
      if (!bone) continue;
      const q = bone.getWorldQuaternion(new THREE.Quaternion());
      setWorldQuaternion(bone, new THREE.Quaternion().setFromAxisAngle(parent.getWorldDirection(_v4).set(0, 1, 0).applyQuaternion(parent.getWorldQuaternion(_q1)), twist * 0.5).multiply(q));
    }
    const head = this.bones.head;
    if (head) {
      const q = head.getWorldQuaternion(new THREE.Quaternion());
      const up = new THREE.Vector3(0, 1, 0).applyQuaternion(parent.getWorldQuaternion(new THREE.Quaternion()));
      setWorldQuaternion(head, new THREE.Quaternion().setFromAxisAngle(up, (input.switchStance ? -1 : 1) * 0.55).multiply(q));
    }

    // Arms out for balance; on a grab the leading hand reaches the deck edge.
    const shoulderY = this.restPelvisHeight + deckTop - drop + this.legLength * 0.55;
    for (const side of ['L', 'R'] as const) {
      const upper = this.bones[`upperArm${side}` as BoneKey], lower = this.bones[`lowerArm${side}` as BoneKey], hand = this.bones[`hand${side}` as BoneKey];
      if (!upper || !lower || !hand) continue;
      const leading = side === front;
      let target: THREE.Vector3;
      if (input.grab && leading) target = toWorld(0.12, deckTop + 0.04, 0);
      else {
        const swing = input.air ? 0.15 : 0;
        // Balance pose: arms out along the board, a little below shoulder height.
        target = toWorld(0.08 + swing, shoulderY - this.legLength * 0.25 + input.lean * (leading ? 0.15 : -0.15), (leading ? -1 : 1) * (this.legLength * 1.15 + 0.12 + crouch * 0.08));
      }
      twoBone(upper, lower, hand, target, toWorld(-0.6, shoulderY, leading ? -0.3 : 0.3));
    }
  }
}
