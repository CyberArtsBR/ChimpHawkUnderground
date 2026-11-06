import test from 'node:test';
import assert from 'node:assert/strict';
import { calloutTier, ComboCallouts, CALLOUT_TIERS } from '../src/game/ComboCallouts.js';

test('callouts only start at 3000+ points', () => {
  assert.equal(calloutTier(0), null);
  assert.equal(calloutTier(2999), null);
  assert.equal(calloutTier(3000).label, 'SICK!');
  assert.equal(Math.min(...CALLOUT_TIERS.map(tier => tier.min)), 3000);
});

test('three tiers: SICK 3k, INSANE 5k, CHIMPTASTIC 7k', () => {
  assert.equal(CALLOUT_TIERS.length, 3);
  assert.equal(calloutTier(4999).label, 'SICK!');
  assert.equal(calloutTier(5000).label, 'INSANE!');
  assert.equal(calloutTier(6999).label, 'INSANE!');
  assert.equal(calloutTier(7000).label, 'CHIMPTASTIC!');
  assert.equal(calloutTier(999999).level, 4);
  assert.equal(calloutTier('nope'), null);
  assert.equal(calloutTier(NaN), null);
});

test('showing a callout without a page or audio is safe', () => {
  const callouts = new ComboCallouts({ parent: null, audio: null });
  assert.equal(callouts.show(1000), null);
  assert.equal(callouts.show(4000).label, 'SICK!');
  callouts.dispose();
});

test('the stinger stays silent while audio is suspended or muted', () => {
  let made = 0;
  const context = { state: 'suspended', createOscillator() { made++; } };
  const callouts = new ComboCallouts({ parent: null, audio: { context, master: {}, enabled: true } });
  callouts.stinger(4);
  context.state = 'running';
  callouts.audio.enabled = false;
  callouts.stinger(4);
  assert.equal(made, 0);
});
