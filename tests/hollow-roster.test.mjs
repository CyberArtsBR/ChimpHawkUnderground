import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { Vector3 } from 'three';
import { DEFAULT_CHARACTERS } from '../src/game/LoadoutCatalog.js';
import { characterPortrait, forgetCharacterPortrait } from '../src/game/CharacterPortraits.js';
import { resolveHumanoidBones, humanoidIKAudit } from '../src/character/RigMapping.js';
import { UnrealRider } from '../src/character/UnrealRider.js';
import { nextMenuIndex } from '../src/input/MenuNavigation.js';
import { inspectGlb } from '../tools/agent10-glb-inspector.mjs';

const asset = new URL('../public/assets/rider/thehollowf.glb', import.meta.url);
const originalSha256 = 'c8e5f3c41a656580e2ce8b6761f46314add8390ed68fbfe22d0e7e82e6f278fc';

test('Hollow is first among five stock riders; the existing crew keeps its order', () => {
  assert.deepEqual(DEFAULT_CHARACTERS.map(hero => hero.id), ['hollow', 'heretic', 'adolescent', 'anchor', 'tuxr']);
  assert.equal(DEFAULT_CHARACTERS[0].name, 'The Hollow');
  assert.equal(DEFAULT_CHARACTERS[0].url, '/assets/rider/thehollowf.glb');
});

test('Hollow ships the exact supplied self-contained GLB and a complete skinned Mixamo rig', async () => {
  const bytes = await readFile(asset);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), originalSha256);
  assert.deepEqual(inspectGlb(bytes), { bytes: 924560, nodes: 68, meshes: 2, primitives: 3, skins: 1 });
  const json = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString());
  const joints = new Set(json.skins.flatMap(skin => skin.joints));
  const bones = resolveHumanoidBones(json.nodes.map((node, index) => ({ ...node, index })));
  const audit = humanoidIKAudit(bones);
  assert.ok(audit.fullArmIK && audit.fullLegIK);
  for (const side of ['l', 'r']) {
    for (const prefix of ['thigh_', 'calf_', 'foot_', 'upperarm_', 'lowerarm_', 'hand_']) {
      assert.ok(joints.has(bones[prefix + side].index), prefix + side + ' must belong to the real skin');
    }
  }
  assert.equal(joints.size, 65);
  assert.ok(json.images.every(image => Number.isInteger(image.bufferView) && !image.uri));
});

test('Hollow uses its baked portrait without loading or rendering the GLB', async () => {
  const url = DEFAULT_CHARACTERS[0].url;
  const OriginalImage = globalThis.Image;
  const requested = [];
  globalThis.Image = class {
    set src(value) { requested.push(value); queueMicrotask(() => this.onload()); }
    decode() { return Promise.resolve(); }
  };
  try {
    const portrait = await characterPortrait(url);
    assert.equal(portrait, '/assets/menu/riders/thehollowf.png?v=full-body-2');
    assert.deepEqual(requested, [portrait]);
    const png = await readFile(new URL('../public/assets/menu/riders/thehollowf.png', import.meta.url));
    assert.equal(png.subarray(1, 4).toString(), 'PNG');
    assert.equal(png.readUInt32BE(16), 320);
    assert.equal(png.readUInt32BE(20), 340);
  } finally {
    forgetCharacterPortrait(url);
    if (OriginalImage === undefined) delete globalThis.Image;
    else globalThis.Image = OriginalImage;
  }
});

test('a five-card roster traverses every rider left and right through the shared controller route', () => {
  const buttons = DEFAULT_CHARACTERS.map((hero, index) => ({
    dataset: { action: 'hero', index: String(index) },
    getBoundingClientRect: () => ({ left: index * 220, top: 0, width: 210, height: 80 }),
  }));
  let focused = 0;
  for (let expected = 1; expected < buttons.length; expected++) {
    focused = nextMenuIndex(buttons, focused, 'x', 1, true);
    assert.equal(focused, expected);
  }
  for (let expected = buttons.length - 2; expected >= 0; expected--) {
    focused = nextMenuIndex(buttons, focused, 'x', -1, true);
    assert.equal(focused, expected);
  }
});

test('the supplied Hollow geometry and skin animate through the existing runtime without retargeting', async () => {
  const bytes = await readFile(asset);
  const jsonLength = bytes.readUInt32LE(12);
  const json = JSON.parse(bytes.subarray(20, 20 + jsonLength).toString());
  // Decode the original geometry and skeleton; only omit texture work in Node.
  for (const mesh of json.meshes) for (const primitive of mesh.primitives) delete primitive.material;
  delete json.materials; delete json.textures; delete json.images;
  json.buffers[0].uri = 'data:application/octet-stream;base64,' + bytes.subarray(28 + jsonLength).toString('base64');
  const OriginalProgressEvent = globalThis.ProgressEvent;
  globalThis.ProgressEvent ||= class { constructor(type, init) { Object.assign(this, { type }, init); } };
  try {
    const gltf = await new GLTFLoader().parseAsync(JSON.stringify(json), '');
    const rider = new UnrealRider(DEFAULT_CHARACTERS[0].url).configureModel(gltf.scene);
    assert.ok(rider.rigAudit.ik.fullArmIK && rider.rigAudit.ik.fullLegIK);
    const hand = rider.bones.hand_l;
    const rest = hand.getWorldPosition(new Vector3());
    for (const stance of [1, -1]) for (let frame = 0; frame < 45; frame++) {
      rider.update({ dt: 1 / 60, time: frame / 60, stance, pushWeight: 1, pushPhase: frame / 45,
        presentation: { state: 'PUSH' } });
      for (const bone of rider.rest.keys()) {
        assert.ok(bone.quaternion.toArray().every(Number.isFinite), bone.name);
        assert.ok(bone.matrixWorld.elements.every(Number.isFinite), bone.name);
      }
    }
    assert.ok(hand.getWorldPosition(new Vector3()).distanceTo(rest) > 0.01, 'the real skeleton must move');
  } finally {
    if (OriginalProgressEvent === undefined) delete globalThis.ProgressEvent;
    else globalThis.ProgressEvent = OriginalProgressEvent;
  }
});
