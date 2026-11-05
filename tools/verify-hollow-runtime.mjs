import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { launchAuditBrowser } from './quality-browser-runtime.mjs';

const url = process.env.STREETSKATE_URL || 'http://127.0.0.1:5185/';
const output = 'artifacts/hollow-grip-v3/browser';
await mkdir(output, { recursive: true });
const report = { url, errors: [], httpErrors: [], riders: [] };
const browser = await launchAuditBrowser();
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('pageerror', error => report.errors.push(error.message));
  page.on('response', response => { if (response.status() >= 400) report.httpErrors.push([response.url(), response.status()]); });
  await page.goto(url);
  await page.waitForFunction(() => window.streetSkate?.ready, null, { timeout: 120000 });
  report.boot = await page.evaluate(() => ({
    rider: window.streetSkate.skater.rider.url,
    models: performance.getEntriesByType('resource').filter(resource => /\.glb(?:\?|$)/.test(resource.name)).map(resource => resource.name),
    quality: window.streetSkate.graphicsStatus(),
  }));
  assert.match(report.boot.rider, /thehollowf\.glb$/);
  assert.ok(!report.boot.models.some(resource => resource.endsWith('/TheanchoURi.glb')), 'boot must not load the legacy placeholder rider');
  assert.equal(report.boot.quality.name, 'high-refresh');
  assert.equal(report.boot.quality.bloomEnabled, true);
  assert.deepEqual(report.boot.quality.glowTuning, { emissive: 1.5, bloom: 1.09, glow: .1, radius: .11 });
  await page.locator('[data-action="practice"]').click();
  assert.deepEqual(await page.locator('.loadout-character strong').allTextContents(), ['The Hollow', 'Heretic', 'Adolescent', 'Anchor', 'Tuxr']);
  await page.waitForFunction(() => [...document.querySelectorAll('.loadout-roster-band [data-portrait-url]')]
    .every(node => node.dataset.previewState === 'ready'));
  await page.locator('[data-action="hero"][data-index="0"]').click();
  await page.locator('[data-action="board"][data-index="6"]').click();
  await page.screenshot({ path: `${output}/five-rider-loadout.png` });
  await page.locator('[data-action="location"][data-location="orbit"]').click();
  await page.locator('[data-action="confirmLoadout"]').click();
  await page.locator('body[data-screen="playing"]').waitFor({ timeout: 120000 });
  await page.bringToFront();
  await page.waitForTimeout(800);
  await page.keyboard.down('Space');
  await page.waitForTimeout(250);
  await page.keyboard.up('Space');
  await page.waitForFunction(() => !window.streetSkate.skater.grounded);
  await page.keyboard.down('ArrowRight');
  await page.waitForFunction(() => !!window.streetSkate.skater.grabState);
  report.grab = await page.evaluate(() => ({
    name: window.streetSkate.skater.grabState.name,
    rider: window.streetSkate.skater.rider.url,
    presentation: window.streetSkate.skater.getPresentationDebug(),
  }));
  await page.screenshot({ path: `${output}/hollow-grab-orbit.png` });
  await page.keyboard.up('ArrowRight');
  await page.waitForTimeout(800);
  await page.keyboard.press('r');
  await page.waitForTimeout(600);
  for (const rider of ['The_Heretic', 'The_AdolescentUR', 'The_Anchor', 'TuxR', 'thehollowf']) {
    await page.evaluate(async name => {
      await window.streetSkate.selectLocation('orbit', { hero: { url: `/assets/rider/${name}.glb` } });
      window.streetSkate.setPaused(false);
    }, rider);
    const value = await page.evaluate(() => {
      const skater = window.streetSkate.skater;
      const bones = Object.values(skater.rider.bones).filter(Boolean);
      return { url: skater.rider.url, audit: skater.rider.rigAudit,
        finite: bones.every(bone => bone.matrixWorld.elements.every(Number.isFinite)) };
    });
    assert.match(value.url, new RegExp(`${rider}\\.glb$`));
    assert.equal(value.finite, true);
    assert.equal(value.audit.ik.fullArmIK, true);
    assert.equal(value.audit.ik.fullLegIK, true);
    report.riders.push(value);
  }
  await page.screenshot({ path: `${output}/hollow-orbit.png` });
  await page.evaluate(() => window.streetSkate.setPaused(true));
  assert.deepEqual(report.errors, []);
  assert.deepEqual(report.httpErrors, []);
  report.result = 'PASS';
  console.log('PASS: Hollow boot, five portraits/rigs, real ollie+grab, unchanged glow defaults, no browser/HTTP errors');
} catch (error) {
  report.result = 'FAIL'; report.failure = error.stack; process.exitCode = 1; console.error(error);
} finally {
  await writeFile(`${output}/report.json`, JSON.stringify(report, null, 2));
  await browser.close();
}
