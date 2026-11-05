import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { SkateAudio } from '../src/game/SkateAudio.js';
import { SURFACE_AUDIO, validatedSurfaceTag, surfaceAudioFor } from '../src/game/SurfaceAudio.js';
import { BailLiquid } from '../src/graphics/BailLiquid.js';
import { StreetBoard } from '../src/skateboard/StreetBoard.js';
import { UnrealRider } from '../src/character/UnrealRider.js';
import { impossibleMotion, grindWeightShift } from '../src/character/TrickMotion.js';
import { FLIP_TRICKS, DOUBLE_FLIP_TRICKS } from '../src/game/TrickCatalog.js';
import { loadGeometry } from '../tools/load-geometry.mjs';

test('surface profiles require explicit validated material tags and do not interpret object names', () => {
  assert.equal(surfaceAudioFor({ name: 'metal rail' }), SURFACE_AUDIO.neutral);
  assert.equal(surfaceAudioFor({ audioSurfaceTag: 'wood' }), SURFACE_AUDIO.wood);
  assert.equal(surfaceAudioFor({ audioSurfaceTag: 'wood', grind: { rail: { audioSurfaceTag: 'metal' } } }), SURFACE_AUDIO.metal);
  assert.equal(validatedSurfaceTag('__proto__'), 'neutral');
  assert.equal(validatedSurfaceTag('anything'), 'neutral');
  assert.ok(SURFACE_AUDIO.wood.rollPitch < SURFACE_AUDIO.metal.rollPitch);
});

test('bail body contact is consumed while paused or muted and never replays on resume', () => {
  const audio = new SkateAudio(), hits = [];
  audio.impact = (strength, metal, kind) => hits.push(kind);
  const parameter = () => ({ setTargetAtTime() {} });
  const layer = () => ({ gain: { gain: parameter() }, filter: { frequency: parameter() } });
  audio.roll = layer(); audio.grind = layer(); audio.wind = layer();
  audio.context = { currentTime: 1, state: 'running' };
  const player = { grounded: false, velocity: new THREE.Vector3(2,-5,0), normal: new THREE.Vector3(0,1,0),
    respawnSerial: 1, bailTime: 0, rider: { ragdoll: { groundImpact: null } } };
  audio.update(player, true);
  player.bailTime = 1;audio.update(player, true);
  assert.deepEqual(hits, ['loss']);
  player.rider.ragdoll.groundImpact = { speed: 5 };
  audio.update(player, false);audio.update(player, true);audio.update(player, true);
  assert.deepEqual(hits, ['loss']);
  player.bailTime = 0;player.rider.ragdoll.groundImpact = null;audio.update(player, true);
  player.bailTime = 1;audio.update(player, true);
  audio.enabled = false;player.rider.ragdoll.groundImpact = { speed: 6 };audio.update(player, true);
  audio.enabled = true;audio.update(player, true);
  assert.deepEqual(hits, ['loss','loss']);
});

test('announcer cues use independent channel while menu confirmation remains an effect', () => {
  const audio = new SkateAudio(), destinations = [];
  const parameter = { setValueAtTime() {}, exponentialRampToValueAtTime() {}, setTargetAtTime() {} };
  audio.master = { name: 'effects', gain: parameter };audio.announcer = { name: 'announcer', gain: parameter };
  audio.context = { currentTime: 1, state: 'running',
    createOscillator: () => ({ frequency: parameter, connect() {}, start() {}, stop() {} }),
    createGain: () => ({ gain: parameter, connect: bus => destinations.push(bus.name) }),
  };
  audio.setEffectsVolume(0);audio.setAnnouncerVolume(.6);
  audio.cue('confirm');audio.cue('ready');audio.cue('go');audio.countdownCue(5);audio.cue('roundOver');
  assert.deepEqual(destinations, ['effects','announcer','announcer','announcer','announcer']);
  audio.enabled = false;audio.context.currentTime += 1;audio.cue('go');
  assert.equal(destinations.length, 5);
});

test('liquid follows mild concave ground using bounded probes and toggle clears the pool', () => {
  const liquid = new BailLiquid(new THREE.Group());
  let calls = 0;
  const surface = { ground(point) { calls++;return { point: new THREE.Vector3(point.x,.1 * point.x ** 2,point.z),
    normal: new THREE.Vector3(-.2 * point.x,1,0).normalize() }; } };
  const impact = { point: new THREE.Vector3(), normal: new THREE.Vector3(0,1,0) };
  liquid.spawn(impact, false, surface);
  assert.equal(calls, 8);
  const pos = liquid.puddles[0].mesh.geometry.attributes.position;
  let lift = 0;
  for (let i=0;i<pos.count;i++) lift = Math.max(lift, pos.getZ(i) - liquid.basePositions[i*3+2]);
  assert.ok(lift > .03 && lift < .06, `curved edge lift ${lift}`);
  liquid.update(.1);assert.equal(calls,8,'no ongoing ground queries');
  liquid.setEnabled(false);assert.ok(liquid.puddles.every(p => !p.mesh.visible && !p.splash.visible));
  assert.equal(liquid.spawn(impact), false);
  liquid.setEnabled(true);liquid.spawn(impact);
  assert.ok(liquid.puddles.some(p => p.mesh.visible));
  liquid.dispose();liquid.dispose();assert.equal(liquid.spawn(impact),false);
});

test('Impossible has a rear-foot pivot through rotation and no displacement at catch', () => {
  const board = new StreetBoard('/unused');board.deckHeight = .12;
  board.contactRig = { deckTopY: .14, deckLength: 1.1, deckWidth: .42 };
  for (const stance of [1,-1]) for (const yaw of [0, Math.PI]) {
    board.resetPresentation();board._yawHold = yaw;
    for (const progress of [.3,.4,.55,.65]) {
      const flipState = { ...FLIP_TRICKS.up, progress };
      board.update({ flipState, airborne: true, stance, dt: 1/120 });
      const wrap = impossibleMotion(flipState, stance);
      const point = board.pointWorld(0,.02,wrap.pivotZ * Math.cos(yaw));
      assert.ok(point.distanceTo(new THREE.Vector3(0,board.riderHeight + .02 + wrap.lift,wrap.pivotZ)) < .001,
        'rotating deck stays attached to rear-foot pivot');
    }
    board.update({ flipState: { ...FLIP_TRICKS.up,progress:1 }, airborne:true,stance });
    assert.ok(Math.abs(board.root.position.x) < 1e-6 && Math.abs(board.root.position.z) < 1e-6);
    assert.ok(Math.abs(board.root.position.y-.145) < 1e-6);
  }
  assert.equal(impossibleMotion(FLIP_TRICKS.left),null);
  assert.equal(impossibleMotion(DOUBLE_FLIP_TRICKS['Varial Heelflip']),null);
});

test('grind weight shifts follow supporting truck and stay bounded near balance failure', () => {
  assert.ok(grindWeightShift('Nosegrind').foreAft < 0);
  assert.ok(grindWeightShift('5-0').foreAft > 0);
  assert.equal(grindWeightShift('50-50').foreAft,0);
  assert.ok(Math.abs(grindWeightShift('Nosegrind',1,0).foreAft) < 1e-9);
  assert.ok(grindWeightShift('50-50',1).compression > grindWeightShift('50-50',0).compression);
});

for (const name of ['The_Heretic','The_AdolescentUR','The_Anchor','TheanchoURi','TuxR']) {
  test(`${name}: Impossible catches, landing weight and stance-aware grab goals remain finite`, async () => {
    const rider = new UnrealRider(name).configureModel(await loadGeometry(`public/assets/rider/${name}.glb`));
    const board = new StreetBoard('/unused');board.deckHeight = .12;
    board.contactRig = { deckTopY:.14, deckLength:1.1,deckWidth:.42 };
    try {
      for (const stance of [1,-1]) {
        rider.resetPresentation();board.resetPresentation();
        const rear = stance < 0 ? 'l' : 'r', front = rear === 'l' ? 'r' : 'l';
        for (let i=0;i<=100;i++) {
          const params = { flipState:{...FLIP_TRICKS.up,progress:i/100},airborne:true,stance,presentation:{state:'AIR'},dt:1/120 };
          board.update(params);rider.update({...params,board});
          for (const bone of rider.rest.keys()) assert.ok(bone.quaternion.toArray().every(Number.isFinite));
          if (i===45) assert.ok(Math.abs(rider.ft[rear].z - (stance < 0 ? -.2 : .2)) < .01);
        }
        const catchTargets = ['l','r'].map(side => rider.ft[side].clone());
        rider.resetPresentation();board.resetPresentation();
        for(let i=0;i<45;i++){board.update({});rider.update({board,stance,presentation:{state:'COAST'},dt:1/120});}
        for(let i=0;i<2;i++) assert.ok(rider.ft[['l','r'][i]].distanceTo(catchTargets[i]) < .03);
        const nose = rider.grabTarget('Nosegrab',front,stance,board);
        const tail = rider.grabTarget('Tailgrab',rear,stance,board);
        assert.ok(nose.z * stance < -.4 && tail.z * stance > .4);
        const held=[];
        for(const severity of [.15,.9]) {
          rider.resetPresentation();
          for(let i=0;i<30;i++) rider.update({board,stance,presentation:{state:'LAND'},landingSeverity:severity,dt:1/120});
          held.push(rider.bones.pelvis.getWorldPosition(new THREE.Vector3()).y);
        }
        assert.ok(held[1] < held[0] - .02,'heavy landing bends deeper than light contact');
      }
    } finally {rider.dispose();}
  });
}
