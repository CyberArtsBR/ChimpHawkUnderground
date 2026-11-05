import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { launchAuditBrowser } from './quality-browser-runtime.mjs';
import { BINDINGS_KEY, cloneBindings } from '../src/input/ControlBindings.js';

const url = process.env.STREETSKATE_URL || 'http://127.0.0.1:5185/';
const out = process.env.EVOLUTION_OUTPUT || 'artifacts/evolution-2026-11-03/browser';
await mkdir(out, { recursive: true });
const report = { url, errors: [], httpErrors: [], screenshots: [], parks: [], fixtures: [] };
const browser = await launchAuditBrowser();
const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
let page;
function watch(p) {
  p.on('pageerror', e => report.errors.push(e.message));
  p.on('response', r => { if (r.status() >= 400) report.httpErrors.push({ url: r.url(), status: r.status() }); });
}
async function snap(name) {
  await page.screenshot({ path: `${out}/${name}.png` });
  report.screenshots.push(name);
}
const click = action => page.locator(`[data-action="${action}"]`).first().click();
async function boot() {
  await page.goto(url);
  await page.waitForFunction(() => window.streetSkate?.ready, null, { timeout: 90000 });
}
async function loadout(park) {
  await page.locator('[data-action="hero"][data-index="1"]').click();
  await page.locator('[data-action="board"][data-index="3"]').click();
  await page.locator(`[data-action="location"][data-location="${park}"]`).click();
  await click('confirmLoadout');
  await page.locator('body[data-screen="playing"]').waitFor({ timeout: 90000 });
}
try {
  page = await context.newPage(); watch(page); await boot();
  report.entry = await page.locator('script[src]').evaluateAll(es => es.map(e => e.src));
  await snap('title');
  await click('tutorial');
  await page.waitForFunction(() => document.querySelector('video')?.readyState >= 2);
  await page.waitForTimeout(250);
  report.video = await page.locator('video').evaluate(v => ({ width: v.videoWidth, height: v.videoHeight, duration: v.duration }));
  await snap('flip-school');
  assert.ok(report.video.width > 0);
  await page.keyboard.press('Escape'); await click('options'); await click('settings');
  await page.locator('[data-action="resetBindings"]').focus();
  await page.keyboard.press('Tab');
  report.footerFocus = await page.evaluate(() => ({ action: document.activeElement.dataset.action, text: document.activeElement.textContent }));
  assert.equal(report.footerFocus.action, 'back');
  await page.keyboard.press('Shift+Tab');
  assert.equal(await page.evaluate(() => document.activeElement.dataset.action), 'resetBindings');
  await snap('settings-keyboard-footer');
  await page.locator('[data-action="settingsSection"][data-section="settings-graphics"]').click();
  report.particleScales = [];
  for (const [scale, steps, delta] of [[.6, 8, -1], [1.25, 13, 1], [1, 5, -1]]) {
    for (let i = 0; i < steps; i++) await page.locator(`[data-setting="renderScale"][data-delta="${delta}"]`).click();
    const measurement = await page.evaluate(() => {
      const g = window.streetSkate, values = [];
      g.scene.traverse(n => { if (n.isPoints && n.material?.uniforms?.viewportHeight) values.push(n.material.uniforms.viewportHeight.value); });
      return { scale: g.graphicsStatus().renderScale, ratio: g.renderer.getPixelRatio(), expected: innerHeight * g.renderer.getPixelRatio(), values };
    });
    assert.equal(measurement.scale, scale);
    assert.ok(measurement.values.length >= 2);
    assert.ok(measurement.values.every(v => Math.abs(v - measurement.expected) < 1e-6));
    report.particleScales.push(measurement);
  }
  await click('back'); await click('graphicsMenu');
  report.glowPresets = [];
  for (let index = 0; index < 6; index++) {
    await page.locator(`[data-action="graphicsSet"][data-index="${index}"]`).click();
    const status = await page.evaluate(() => window.streetSkate.graphicsStatus());
    assert.deepEqual(status.glowTuning, { emissive: 1.5, bloom: 1.09, glow: .1, radius: .11 });
    report.glowPresets.push(status);
  }
  await page.locator('[data-action="graphicsSet"][data-index="1"]').click();
  await click('back'); await click('back'); await click('practice'); await loadout('orbit');
  await page.waitForTimeout(700);
  // Deterministic accepted-combo fixture exercises the real score observers;
  // physical ollies and a complete timed round are tested separately below.
  report.fixtures.push('accepted 100-point combo through runtime record/settle before keyboard R');
  report.beforeReset = await page.evaluate(() => {
    const s = window.streetSkate.skater;
    s.recordTrick('Kickflip', 100); const combo = s.tricks.settle(); s.score += combo.points;
    return { score: s.score, serial: s.respawnSerial || 0 };
  });
  await page.keyboard.press('r'); await page.waitForTimeout(80);
  report.afterReset = await page.evaluate(() => ({ score: window.streetSkate.skater.score, serial: window.streetSkate.skater.respawnSerial }));
  assert.equal(report.afterReset.score, report.beforeReset.score);
  assert.equal(report.afterReset.serial, report.beforeReset.serial + 1);
  await page.waitForFunction(() => window.streetSkate.skater.grounded);
  await page.keyboard.press('m'); await page.waitForTimeout(50);
  assert.match(await page.evaluate(() => window.streetSkate.skater.feedback), /MARKER SAVED/);
  const markerSerial = await page.evaluate(() => window.streetSkate.skater.respawnSerial);
  await page.keyboard.down('Space'); await page.waitForTimeout(250); await page.keyboard.up('Space');
  await page.waitForTimeout(150); await page.keyboard.press('n'); await page.waitForTimeout(80);
  report.markerReturn = await page.evaluate(() => ({ serial: window.streetSkate.skater.respawnSerial, score: window.streetSkate.skater.score }));
  assert.equal(report.markerReturn.serial, markerSerial + 1);
  assert.equal(report.markerReturn.score, report.beforeReset.score);
  await page.waitForTimeout(700);
  await page.keyboard.press('w'); await page.waitForTimeout(35); await page.keyboard.press('s'); await page.waitForTimeout(60);
  assert.equal(await page.evaluate(() => window.streetSkate.skater.manual), 'manual');
  report.fixtures.push('manual accumulated-time fixture before real nose-manual keyboard sequence');
  await page.evaluate(() => { window.streetSkate.skater.manualTime = 4; });
  await page.keyboard.press('s'); await page.waitForTimeout(35); await page.keyboard.press('w'); await page.waitForTimeout(60);
  report.manualSwitch = await page.evaluate(() => ({ kind: window.streetSkate.skater.manual, time: window.streetSkate.skater.manualTime }));
  assert.equal(report.manualSwitch.kind, 'noseManual'); assert.ok(report.manualSwitch.time >= 4);
  await snap('manual-switch'); await page.keyboard.press('r');
  // The toolbar is normally collapsed; dispatch its same click handler without
  // changing HUD visibility purely for this state-consistency regression.
  await page.locator('#sound-toggle').evaluate(b => b.click());
  assert.equal(await page.locator('#sound-toggle').getAttribute('aria-pressed'), 'false');
  await page.keyboard.press('Escape'); await click('options');
  assert.match(await page.locator('[data-action="sound"]').textContent(), /OFF/);
  await click('sound');
  assert.match(await page.locator('[data-action="sound"]').textContent(), /ON/);
  assert.equal(await page.locator('#sound-toggle').getAttribute('aria-pressed'), 'true');
  assert.equal(await page.evaluate(() => localStorage.getItem('streetskate.sound')), 'on');
  report.soundSynchronized = true;
  await click('back'); await click('resume');
  for (const [park, rider] of [['orbit', 'The_Heretic.glb'], ['grand-warehouse', 'The_Anchor.glb'], ['skate-paradise', 'TuxR.glb']]) {
    await page.evaluate(async ({ park, rider }) => {
      await window.streetSkate.selectLocation(park, { hero: { url: `/assets/rider/${rider}` } });
      window.streetSkate.setPaused(false);
    }, { park, rider });
    await page.waitForTimeout(100);
    const value = await page.evaluate(async () => {
      const g = window.streetSkate, frames = []; let previous;
      await new Promise(resolve => { const tick = time => {
        if (previous !== undefined) frames.push(time - previous); previous = time;
        if (frames.length === 120) resolve(); else requestAnimationFrame(tick);
      }; requestAnimationFrame(tick); });
      const gl = g.renderer.getContext(), ext = gl.getExtension('WEBGL_debug_renderer_info');
      const sorted = [...frames].sort((a, b) => a - b), mean = frames.reduce((a, b) => a + b, 0) / frames.length;
      return { park: g.currentLocation, position: g.skater.position.toArray(), flashMaterials: g.skater.flashMaterials.length,
        boardExcluded: g.skater.flashMaterials.every(item => !g.skater.board.materials?.includes(item.material)),
        frames: frames.length, meanFrameMs: mean, p95FrameMs: sorted[Math.floor(sorted.length * .95)],
        drawingRatio: g.renderer.getPixelRatio(), memory: { ...g.renderer.info.memory },
        gpu: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : null };
    });
    assert.equal(value.park, park); assert.ok(value.position.every(Number.isFinite));
    const riderOnly = await page.evaluate(() => {
      const s = window.streetSkate.skater, boardMaterials = new Set();
      s.board.root.traverse(n => { for (const m of Array.isArray(n.material) ? n.material : [n.material]) if (m) boardMaterials.add(m); });
      return s.flashMaterials.every(saved => !boardMaterials.has(saved.material));
    });
    assert.equal(riderOnly, true); value.boardExcluded = riderOnly;
    report.parks.push(value); await snap(park);
  }
  await page.keyboard.press('Escape'); await click('title'); await click('start'); await loadout('grand-warehouse');
  await snap('round-ready'); await page.waitForTimeout(1500);
  for (let i = 0; i < 3; i++) {
    await page.keyboard.down('Space'); await page.waitForTimeout(250); await page.keyboard.up('Space'); await page.waitForTimeout(1600);
  }
  report.physicalOllieScore = await page.evaluate(() => window.streetSkate.skater.score);
  assert.ok(report.physicalOllieScore > 0, 'real keyboard ollies must land and bank score');
  const stages = new Set(), deadline = Date.now() + 100000;
  while (Date.now() < deadline) {
    const state = await page.evaluate(() => ({ screen: document.body.dataset.screen, warning: document.querySelector('#run-timer').dataset.timerWarning }));
    const name = state.screen === 'playing' ? state.warning : state.screen;
    if (['warning', 'critical', 'timeup', 'results'].includes(name) && !stages.has(name)) { stages.add(name); await snap(name); }
    if (state.screen === 'results') break;
    await page.waitForTimeout(400);
  }
  report.roundStages = [...stages]; assert.ok(stages.has('results')); assert.ok(stages.has('warning')); assert.ok(stages.has('critical'));
  const replay = page.locator('[data-action="watchHighlights"]'); assert.equal(await replay.isEnabled(), true);
  await replay.click(); await page.waitForTimeout(900); await snap('replay');
  assert.equal(await page.locator('body').getAttribute('data-screen'), 'highlights');
  await page.keyboard.press('Escape');
  await page.close();

  const remaps = cloneBindings();
  [remaps.ollie.gamepad, remaps.grind.gamepad] = [3, 0];
  [remaps.flip.gamepad, remaps.grab.gamepad] = [1, 2];
  remaps.ollie.keyboard = ['KeyO']; remaps.flip.keyboard = ['KeyF'];
  page = await context.newPage(); watch(page);
  await page.addInitScript(({ key, actions }) => localStorage.setItem(key, JSON.stringify({ version: 1, actions })), { key: BINDINGS_KEY, actions: remaps });
  await boot(); await click('tutorial'); await page.waitForFunction(() => document.querySelector('video')?.readyState >= 2);
  report.remapDiagram = await page.locator('[data-pad="flip"] circle').evaluate(n => ({ x: n.getAttribute('cx'), y: n.getAttribute('cy') }));
  assert.deepEqual(report.remapDiagram, { x: '236', y: '57' });
  await page.locator('[data-action="flipInput"][data-index="1"]').click(); await snap('remapped-playstation');
  await click('tutorialNext'); await click('next');
  assert.match(await page.locator('.tutorial-body').innerText(), /Hold O, then release/);
  await click('next'); assert.match(await page.locator('.tutorial-frame header').innerText(), /F \/ Xbox B/); await snap('remapped-readable-guide');
  await page.close();
  [remaps.flip.gamepad, remaps.spinLeft.gamepad] = [4, 1];
  page = await context.newPage(); watch(page);
  await page.addInitScript(({ key, actions }) => localStorage.setItem(key, JSON.stringify({ version: 1, actions })), { key: BINDINGS_KEY, actions: remaps });
  await boot(); await click('tutorial'); await page.waitForFunction(() => document.querySelector('video')?.readyState >= 2);
  assert.equal(await page.locator('[data-pad="flip"]').getAttribute('visibility'), 'hidden');
  assert.match(await page.locator('[data-remap-note]').innerText(), /Flip: LB/);
  await snap('remapped-shoulder');
  assert.deepEqual(report.errors, []); assert.deepEqual(report.httpErrors, []);
  report.result = 'PASS'; console.log('Evolution local QA passed: menus/remaps, six glow presets, particle scaling, score/marker recovery, sound state, three parks, real ollies, full round and replay.');
} catch (error) {
  report.failure = error.stack; console.error(error); process.exitCode = 1;
} finally {
  await writeFile(`${out}/report.json`, JSON.stringify(report, null, 2)); await browser.close();
}
