import test from 'node:test';
import assert from 'node:assert/strict';
import { DirectionTapDetector } from '../src/input/DirectionTapDetector.js';
import { isValidGlbHeader } from '../src/input/GlbHeader.js';
import { SkateInput } from '../src/input/SkateInput.js';
import { GameShell } from '../src/game/GameShell.js';

function validHeader(length = 40) {
  const bytes = new ArrayBuffer(20), v = new DataView(bytes);
  v.setUint32(0, 0x46546c67, true); v.setUint32(4, 2, true);
  v.setUint32(8, length, true); v.setUint32(12, 20, true);
  v.setUint32(16, 0x4e4f534a, true);
  return bytes;
}

test('GLB upload checks magic, version, declared size, chunk type and alignment', () => {
  const ok = validHeader();
  assert.equal(isValidGlbHeader(ok, 40), true);
  assert.equal(isValidGlbHeader(ok, 39), false);
  assert.equal(isValidGlbHeader(ok, 19), false);
  assert.equal(isValidGlbHeader(new ArrayBuffer(4), 40), false);
  const changes = [[0, 0], [4, 1], [8, 500], [12, 23], [16, 0]];
  for (const [offset, value] of changes) {
    const bad = validHeader();
    new DataView(bad).setUint32(offset, value, true);
    assert.equal(isValidGlbHeader(bad, 40), false, 'bad byte offset ' + offset);
  }
});

test('stick taps emit one edge per deflection, re-arm at neutral', () => {
  const taps = new DirectionTapDetector();
  assert.deepEqual(taps.update(0.8, -0.9), ['right', 'down']);
  assert.deepEqual(taps.update(0.9, -1), []);
  assert.deepEqual(taps.update(-1, 0.85), []);
  assert.deepEqual(taps.update(0, 0), []);
  assert.deepEqual(taps.update(-0.9, 0.9), ['left', 'up']);
});

function button(x, y, w = 100, h = 44) {
  return {
    disabled: false,
    classList: { toggle() {} },
    getBoundingClientRect() { return { left: x, top: y, width: w, height: h }; },
    focus() { globalThis.document.activeElement = this; },
    click() { this.clicks = (this.clicks || 0) + 1; },
  };
}

test('rider/deck grid navigation uses both axes and distinguishes focused button', () => {
  const original = globalThis.document;
  globalThis.document = { activeElement: null };
  try {
    const b = [button(0, 0), button(120, 0), button(0, 80), button(120, 80)];
    const shell = Object.create(GameShell.prototype);
    shell.phase = 'select'; shell.selection = 0;
    shell.menuButtons = () => b;
    shell.focusSelection();
    shell.moveSelection('x', 1);
    assert.equal(shell.selection, 1);
    shell.moveSelection('y', 1);
    assert.equal(shell.selection, 3);
    shell.moveSelection('x', -1);
    assert.equal(shell.selection, 2);
    shell.moveSelection('y', -1);
    assert.equal(shell.selection, 0);
    shell.music = { unlock() {} };
    const event = code => ({
      code, repeat: false, target: { tagName: 'BODY' },
      preventDefault() {}, stopImmediatePropagation() {},
    });
    shell.key(event('ArrowRight'));
    assert.equal(shell.selection, 1);
    shell.key(event('Enter'));
    assert.equal(b[1].clicks, 1);
  } finally { globalThis.document = original; }
});

test('keyboard one-shot actions debounce repeated down and gamepad reconnects safely', () => {
  const originalWindow = globalThis.window;
  const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  const handlers = {};
  const fakeWindow = {
    addEventListener(type, fn) { handlers[type] = fn; },
    removeEventListener() {},
  };
  const pad = { id: 'test-pad', index: 0, connected: true, axes: [0, 0, 0, 0],
    buttons: Array.from({ length: 17 }, () => ({ pressed: false })) };
  Object.defineProperty(globalThis, 'navigator', {
    value: { getGamepads: () => [pad] }, configurable: true,
  });
  globalThis.window = fakeWindow;
  try {
    const input = new SkateInput({ addEventListener() {}, removeEventListener() {} });
    input.enabled = true;
    const event = { code: 'Space', repeat: false, target: { tagName: 'BODY' },
      preventDefault() {} };
    handlers.keydown(event); handlers.keydown(event);
    assert.equal(input.read().olliePressed, true);
    assert.equal(input.read().olliePressed, false);
    handlers.keyup(event);
    assert.equal(input.read().ollieReleased, true);
    pad.buttons[9].pressed = true;
    // A new press on a connected controller must still register.
    assert.equal(input.read().pausePressed, true);
    pad.buttons[9].pressed = false; input.read();
    pad.buttons[9].pressed = true;
    assert.equal(input.read().pausePressed, true);
    input.clear();
    assert.equal(input.read().pausePressed, false);
    pad.connected = false; input.read();
    pad.connected = true;
    assert.equal(input.read().pausePressed, false);
    input.dispose();
  } finally {
    globalThis.window = originalWindow;
    if (originalNavigator) Object.defineProperty(globalThis, 'navigator', originalNavigator);
    else delete globalThis.navigator;
  }
});


test('pause and resume preserve gameplay state and add an input grace window', () => {
  const calls = [];
  const shell = Object.create(GameShell.prototype);
  shell.phase = 'playing';
  shell.actions = { pause: value => calls.push(value) };
  shell.setScreen = phase => { shell.phase = phase; };
  shell.pause();
  assert.equal(shell.phase, 'pause');
  assert.deepEqual(calls, [true]);
  shell.resume();
  assert.equal(shell.phase, 'playing');
  assert.equal(shell.inputGrace, 0.18);
  assert.deepEqual(calls, [true, false]);
  shell.syncPause(true);
  assert.equal(shell.phase, 'pause');
  shell.syncPause(false);
  assert.equal(shell.phase, 'playing');
  assert.deepEqual(calls, [true, false], 'sync callback never double-pauses simulation');
});

test('menu gamepad A is edge-triggered, not repeatedly selected while held', () => {
  const oldDocument = globalThis.document;
  const oldNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  const pad = { connected: true, axes: [0, 0],
    buttons: Array.from({ length: 17 }, () => ({ pressed: false })) };
  globalThis.document = { hasFocus: () => true };
  Object.defineProperty(globalThis, 'navigator', {
    value: { getGamepads: () => [pad] }, configurable: true,
  });
  try {
    const shell = Object.create(GameShell.prototype);
    shell.phase = 'select'; shell.selection = 0; shell.padFocused = false;
    shell.previousPad = {}; shell.navRepeat = 0; shell.inputGrace = 0;
    shell.music = { unlock() {}, next() {} };
    const btn = { clicks: 0, click() { this.clicks++; } };
    shell.menuButtons = () => [btn];
    shell.update(0.016);
    pad.buttons[0].pressed = true;
    shell.update(0.016);
    shell.update(0.016);
    shell.update(0.016);
    assert.equal(btn.clicks, 1);
    pad.buttons[0].pressed = false; shell.update(0.016);
    pad.buttons[0].pressed = true; shell.update(0.016);
    assert.equal(btn.clicks, 2);
  } finally {
    globalThis.document = oldDocument;
    if (oldNavigator) Object.defineProperty(globalThis, 'navigator', oldNavigator);
    else delete globalThis.navigator;
  }
});
