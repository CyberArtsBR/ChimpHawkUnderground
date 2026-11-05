import test from 'node:test';
import assert from 'node:assert/strict';

import { ArcadeParkMobilitySkillStreetPhysics } from '../src/game/ArcadeParkMobilitySkillStreetPhysics.js';
import {
  WallContactAuthoritySkillStreetPhysics,
} from '../src/game/WallContactAuthoritySkillStreetPhysics.js';
import { StableRampReturnSkillStreetPhysics } from '../src/game/StableRampReturnSkillStreetPhysics.js';

import { RampWallSafetySkillStreetPhysics } from '../src/game/RampWallSafetySkillStreetPhysics.js';
import {
  IntegratedRampSafetySkillStreetPhysics,
} from '../src/game/IntegratedRampSafetySkillStreetPhysics.js';
import { DeckAwareRampExitSkillStreetPhysics } from '../src/game/DeckAwareRampExitSkillStreetPhysics.js';
import { SafeCopingExitSkillStreetPhysics } from '../src/game/SafeCopingExitSkillStreetPhysics.js';
import { StreetSkater } from '../src/game/StreetSkater.js';
import { YawStableStreetSkater } from '../src/game/YawStableStreetSkater.js';

test('arcade mobility compatibility alias is not a runtime prototype level', () => {
  assert.equal(ArcadeParkMobilitySkillStreetPhysics, SafeCopingExitSkillStreetPhysics);
  assert.equal(
    Object.getPrototypeOf(StableRampReturnSkillStreetPhysics.prototype),
    SafeCopingExitSkillStreetPhysics.prototype,
  );
});

test('wall authority compatibility alias is not a runtime prototype level', () => {
  assert.equal(WallContactAuthoritySkillStreetPhysics, ArcadeParkMobilitySkillStreetPhysics);
  assert.equal(
    Object.getPrototypeOf(StableRampReturnSkillStreetPhysics),
    ArcadeParkMobilitySkillStreetPhysics,
  );
});

test('integrated and deck-aware compatibility aliases are not runtime prototype levels', () => {
  assert.equal(IntegratedRampSafetySkillStreetPhysics, RampWallSafetySkillStreetPhysics);
  assert.equal(
    DeckAwareRampExitSkillStreetPhysics,
    RampWallSafetySkillStreetPhysics,
    'verified deck catch must not require a dedicated inheritance level',
  );
});


test('transfer launch has one runtime takeoff application seam', () => {
  assert.equal(
    Object.hasOwn(RampWallSafetySkillStreetPhysics.prototype, 'takeoff'),
    false,
    'RampWallSafety must not mutate transfer launch state',
  );
  assert.equal(
    Object.hasOwn(DeckAwareRampExitSkillStreetPhysics.prototype, 'takeoff'),
    false,
    'DeckAwareRampExit must provide geometry/landing services only',
  );
  assert.equal(
    Object.hasOwn(SafeCopingExitSkillStreetPhysics.prototype, 'takeoff'),
    true,
    'SafeCopingExit is the single transfer-launch application seam',
  );
});


test('yaw-stable presentation compatibility alias is not a runtime prototype level', () => {
  assert.equal(YawStableStreetSkater, StreetSkater);
});


test('final momentum chain bypasses standalone BowlLanding compatibility class', async () => {
  const { MomentumRollSkillStreetPhysics } = await import('../src/game/MomentumRollSkillStreetPhysics.js');
  const { StableBoardContactSkillStreetPhysics } = await import('../src/game/StableBoardContactSkillStreetPhysics.js');
  const { BowlLandingSkillStreetPhysics } = await import('../src/game/BowlLandingSkillStreetPhysics.js');

  assert.equal(Object.getPrototypeOf(MomentumRollSkillStreetPhysics.prototype), StableBoardContactSkillStreetPhysics.prototype);
  assert.notEqual(Object.getPrototypeOf(MomentumRollSkillStreetPhysics.prototype), BowlLandingSkillStreetPhysics.prototype);
});


test('final stateful runtime bypasses StableRampReturn and BaseStateful compatibility wrappers', async () => {
  const { StatefulSkillStreetPhysics } = await import('../src/game/StatefulSkillStreetPhysics.js');
  const { StableRampReturnSkillStreetPhysics } = await import('../src/game/StableRampReturnSkillStreetPhysics.js');
  const { StatefulSkillStreetPhysics: BaseStateful } = await import('../src/game/BaseStatefulSkillStreetPhysics.js');

  const parent = Object.getPrototypeOf(StatefulSkillStreetPhysics.prototype);
  assert.notEqual(parent, StableRampReturnSkillStreetPhysics.prototype);
  assert.notEqual(parent, BaseStateful.prototype);
  assert.equal(Object.hasOwn(StatefulSkillStreetPhysics.prototype, 'takeoff'), true);
  assert.equal(Object.hasOwn(StatefulSkillStreetPhysics.prototype, 'land'), true);
  assert.equal(Object.hasOwn(SafeCopingExitSkillStreetPhysics.prototype, 'land'), true,
    'transition acceptance must remain available below the top composition seam');
});


test('final stateful runtime bypasses UnifiedRampFeel compatibility wrapper', async () => {
  const { StatefulSkillStreetPhysics } = await import('../src/game/StatefulSkillStreetPhysics.js');
  const { UnifiedRampFeelSkillStreetPhysics } = await import('../src/game/UnifiedRampFeelSkillStreetPhysics.js');

  assert.notEqual(
    Object.getPrototypeOf(StatefulSkillStreetPhysics.prototype),
    UnifiedRampFeelSkillStreetPhysics.prototype,
  );
  assert.equal(Object.hasOwn(StatefulSkillStreetPhysics.prototype, 'rememberRampClimb'), true,
    'top composition seam owns ramp-energy sampling');
});


test('landing post-processing is not duplicated in arcade or momentum layers', async () => {
  const { MomentumRollSkillStreetPhysics } = await import('../src/game/MomentumRollSkillStreetPhysics.js');

  assert.equal(
    ArcadeParkMobilitySkillStreetPhysics,
    SafeCopingExitSkillStreetPhysics,
    'ArcadeParkMobility is a compatibility alias; SafeCopingExit owns the legitimate transition land seam',
  );
  assert.equal(
    Object.hasOwn(MomentumRollSkillStreetPhysics.prototype, 'land'),
    false,
    'MomentumRoll must not own travel/fakie landing post-processing',
  );
});


test('grind capture and entry have one canonical runtime authority', async () => {
  const { SkillStreetPhysics } = await import('../src/game/SkillStreetPhysics.js');
  const { CoreSkateController } = await import('../src/game/core/CoreSkateController.js');

  assert.equal(Object.hasOwn(SkillStreetPhysics.prototype, 'enterGrind'), true,
    'skill layer should expose only the adapter seam used by legacy runtime');
  assert.equal(Object.hasOwn(ArcadeParkMobilitySkillStreetPhysics.prototype, 'enterGrind'), false,
    'arcade compatibility alias must not add a second grind-entry override');
  assert.equal(Object.hasOwn(CoreSkateController.prototype, 'enterGrind'), true,
    'composition root must own canonical grind capture + entry');
});

test('transition landing routing has one active runtime owner', () => {
  assert.equal(
    Object.hasOwn(SafeCopingExitSkillStreetPhysics.prototype, 'land'),
    true,
    'SafeCopingExit must be the single transition landing routing seam',
  );
  assert.equal(
    Object.hasOwn(DeckAwareRampExitSkillStreetPhysics.prototype, 'land'),
    false,
    'DeckAwareRampExit must provide geometry/catch services only',
  );
  assert.equal(
    Object.hasOwn(RampWallSafetySkillStreetPhysics.prototype, 'land'),
    false,
    'RampWallSafety must provide air/transfer flight only',
  );
});


test('transition exit intent is prepared only at the top takeoff seam', async () => {
  const { StatefulSkillStreetPhysics } = await import('../src/game/StatefulSkillStreetPhysics.js');
  const { MomentumRollSkillStreetPhysics } = await import('../src/game/MomentumRollSkillStreetPhysics.js');

  assert.equal(
    Object.hasOwn(StatefulSkillStreetPhysics.prototype, 'takeoff'),
    true,
    'Stateful controller must own canonical takeoff preparation',
  );
  assert.equal(
    Object.hasOwn(MomentumRollSkillStreetPhysics.prototype, 'takeoff'),
    false,
    'MomentumRoll must not retag or reinterpret takeoff candidates',
  );
});


test('airborne fixed-step execution has one runtime owner', () => {
  assert.equal(
    Object.hasOwn(RampWallSafetySkillStreetPhysics.prototype, 'stepAir'),
    true,
    'RampWallSafety must own canonical airborne execution',
  );
  assert.equal(
    Object.hasOwn(StableRampReturnSkillStreetPhysics.prototype, 'stepAir'),
    false,
    'StableRampReturn must not wrap/reinterpret airborne input each frame',
  );
});
