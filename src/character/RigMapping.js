// Keep original Unreal bone names authoritative. These aliases are intentionally
// narrow: uploaded Mixamo GLBs may be retargeted without renaming their joints.
const ALIASES = Object.freeze({
  root: ['root', 'rootbone'], pelvis: ['pelvis', 'hips'],
  spine_01: ['spine_01', 'spine'], spine_02: ['spine_02', 'spine1'],
  spine_03: ['spine_03', 'spine2'], neck_01: ['neck_01', 'neck'],
  head: ['head'],
  clavicle_l: ['clavicle_l', 'leftshoulder'],
  clavicle_r: ['clavicle_r', 'rightshoulder'],
  upperarm_l: ['upperarm_l', 'leftarm', 'leftupperarm'],
  upperarm_r: ['upperarm_r', 'rightarm', 'rightupperarm'],
  lowerarm_l: ['lowerarm_l', 'leftforearm', 'leftlowerarm'],
  lowerarm_r: ['lowerarm_r', 'rightforearm', 'rightlowerarm'],
  hand_l: ['hand_l', 'lefthand'], hand_r: ['hand_r', 'righthand'],
  thigh_l: ['thigh_l', 'leftupleg', 'leftupperleg', 'leftthigh'],
  thigh_r: ['thigh_r', 'rightupleg', 'rightupperleg', 'rightthigh'],
  calf_l: ['calf_l', 'leftleg', 'leftlowerleg', 'leftcalf'],
  calf_r: ['calf_r', 'rightleg', 'rightlowerleg', 'rightcalf'],
  foot_l: ['foot_l', 'leftfoot'], foot_r: ['foot_r', 'rightfoot'],
});

export function normalizeBoneName(name) {
  return String(name ?? '').split(/[:|]/).pop().replace(/^mixamorig[0-9_]*/i, '')
    .replace(/[^a-z0-9]/gi, '').toLowerCase();
}

export function resolveHumanoidBones(bones) {
  const result = Object.create(null), indexed = new Map();
  for (const bone of bones) {
    if (!bone?.name) continue;
    result[bone.name] = bone;
    const key = normalizeBoneName(bone.name);
    if (key && !indexed.has(key)) indexed.set(key, bone);
  }
  for (const [canonical, aliases] of Object.entries(ALIASES)) {
    const candidate = result[canonical] || aliases.map(name => indexed.get(normalizeBoneName(name))).find(Boolean);
    if (candidate) result[canonical] = candidate;
  }
  return result;
}

export function humanoidIKAudit(bones) {
  const legs = Object.fromEntries(['l', 'r'].map(side => [side,
    ['thigh_', 'calf_', 'foot_'].every(prefix => Boolean(bones[prefix + side]))]));
  const arms = Object.fromEntries(['l', 'r'].map(side => [side,
    ['upperarm_', 'lowerarm_', 'hand_'].every(prefix => Boolean(bones[prefix + side]))]));
  return { legs, arms, fullLegIK: legs.l && legs.r, fullArmIK: arms.l && arms.r };
}
