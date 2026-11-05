import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { launchAuditBrowser } from './quality-browser-runtime.mjs';

const label = process.env.GLOW_QA_LABEL || 'after';
const browser = await launchAuditBrowser();
const page = await browser.newPage({viewport:{width:1280,height:720}});
const errors = [];
page.on('pageerror', error => errors.push(error.message));
await mkdir('artifacts/cinematic-glow', {recursive:true});
await page.addInitScript(() => {
  localStorage.setItem('streetskate.graphicsPreset.v2', 'cinematic');
  localStorage.setItem('streetskate.bloomEnabled', 'on');
  localStorage.setItem('streetskate.camera', 'follow-low');
});
try {
  await page.goto(process.env.STREETSKATE_URL || 'http://127.0.0.1:5182/');
  await page.waitForFunction(() => window.streetSkate?.ready, null, {timeout:120000});
  await page.locator('[data-action="practice"]').click();
  await page.locator('[data-action="hero"]').first().click();
  await page.locator('[data-action="board"]').first().click();
  await page.locator('[data-action="confirmLoadout"]').click();
  await page.locator('body[data-screen="playing"]').waitFor({timeout:120000});
  await page.evaluate(async () => {
    await window.streetSkate.selectLocation('orbit');
    window.streetSkate.setPaused(false);
    window.streetSkate.setCameraMode('follow-low');
    const s=window.streetSkate.skater;
    window.__glowOriginalUpdate=s.update;
    s.update=()=>{};
  });
  await page.waitForTimeout(500);
  async function screenshot(name) {
    await page.screenshot({path:`artifacts/cinematic-glow/${label}-${name}.png`});
    return page.evaluate(() => window.streetSkate.graphicsStatus());
  }
  const on = await screenshot('cinematic-on');
  assert.equal(on.name,'cinematic'); assert.equal(on.bloomEnabled,true);

  async function changeGraphics(index, glowOn) {
    await page.keyboard.press('Escape');
    await page.locator('[data-action="options"]').click();
    await page.locator('[data-action="graphicsMenu"]').click();
    await page.locator(`[data-action="graphicsSet"][data-index="${index}"]`).click();
    const toggle = page.locator('[data-action="bloomToggle"]');
    if ((await toggle.getAttribute('aria-pressed')) !== String(glowOn)) await toggle.click();
    await page.locator('[data-action="back"]').click();
    await page.locator('[data-action="back"]').click();
    await page.locator('[data-action="resume"]').click();
    await page.waitForTimeout(500);
  }
  await changeGraphics(5,false);
  const off = await screenshot('cinematic-off');
  assert.equal(off.name,'cinematic'); assert.equal(off.bloomEnabled,false);
  await changeGraphics(1,true);
  const fast = await screenshot('144-on');
  assert.equal(fast.name,'high-refresh'); assert.equal(fast.bloomEnabled,true);
  await changeGraphics(5,true);
  for (const location of ['skate-paradise','grand-warehouse']) {
    await page.evaluate(async id => {
      const s=window.streetSkate.skater;
      s.update=window.__glowOriginalUpdate;
      await window.streetSkate.selectLocation(id);
      window.streetSkate.setPaused(false);
      window.streetSkate.setCameraMode('follow-low');
    },location);
    await page.waitForTimeout(350);
    await page.evaluate(() => { window.streetSkate.skater.update=()=>{}; });
    await page.waitForTimeout(300);
    const status = await screenshot(`${location}-cinematic`);
    assert.equal(status.name,'cinematic'); assert.equal(status.bloomEnabled,true);
  }
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({result:'PASS',cinematic:on.name,off:off.bloomEnabled,fast:fast.name},null,2));
} finally { await browser.close(); }
