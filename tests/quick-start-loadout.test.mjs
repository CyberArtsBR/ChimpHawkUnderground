import test from 'node:test';
import assert from 'node:assert/strict';
import { GameShell } from '../src/game/GameShell.js';
import { DEFAULT_CHARACTERS, BOARD_CHOICES, LOCATIONS } from '../src/game/LoadoutCatalog.js';

function shellAt(phase, extra = {}) {
  const shell = Object.create(GameShell.prototype);
  Object.assign(shell, {
    ready: true, phase, selection: 0, heroes: [...DEFAULT_CHARACTERS], heroIndex: 3, boardIndex: 5, locationIndex: 1,
    finishIndex: 6, hasSavedFinish: false, heroConfirmed: false, boardConfirmed: false,
    setScreen(value) { this.phase = value; },
  }, extra);
  return shell;
}

test('first loadout pre-selects The Hollow, Grey and Skate Paradise, ready to skate', () => {
  const shell = shellAt('title');
  shell.begin(false);
  assert.equal(shell.heroes[shell.heroIndex].id, 'hollow');
  assert.equal(BOARD_CHOICES[shell.boardIndex].label, 'GREY');
  assert.equal(LOCATIONS[shell.locationIndex].id, 'skate-paradise');
  assert.equal(shell.heroConfirmed, true);
  assert.equal(shell.boardConfirmed, true);
  assert.equal(shell.loadoutStartLabel(), 'LET’S SKATE →');
  assert.deepEqual(shell.focusHint, { action: 'confirmLoadout', index: 0 });
});

test('later loadouts keep the player’s last picks', () => {
  const shell = shellAt('title');
  shell.begin(false);
  shell.heroIndex = 1; shell.boardIndex = 4; shell.locationIndex = 2;
  shell.phase = 'results';
  shell.begin(false);
  assert.equal(shell.heroIndex, 1);
  assert.equal(shell.boardIndex, 4);
  assert.equal(shell.locationIndex, 2);
  assert.equal(shell.heroConfirmed, true);
});

test('a deck the player saved earlier wins over the Grey default', () => {
  const shell = shellAt('title', { hasSavedFinish: true, finishIndex: 3 });
  shell.begin(false);
  assert.equal(shell.boardIndex, 3);
});

test('the dropping-in screen is told to close as soon as loading succeeds', async () => {
  const calls = [];
  const shell = shellAt('select', {
    heroIndex: 0, boardIndex: 0, locationIndex: 0, heroConfirmed: true, boardConfirmed: true, loadoutGeneration: 0,
    actions: { loadout: async () => {} }, render() {}, start() { calls.push('start'); },
    updateLoadingOverlay() { calls.push(this.selectBusy ? 'overlay-busy' : 'overlay-closed'); },
  });
  await shell.confirmLoadout();
  assert.deepEqual(calls.slice(-2), ['overlay-closed', 'start']);
});
