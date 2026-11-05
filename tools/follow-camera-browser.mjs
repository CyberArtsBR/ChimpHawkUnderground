import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { launchAuditBrowser } from './quality-browser-runtime.mjs';

const browser = await launchAuditBrowser();
const page = await browser.newPage({viewport:{width:1280,height:720}});
const errors = [];
page.on('pageerror', error => errors.push(error.message));
await mkdir('artifacts/follow-camera', {recursive:true});
try {
  await page.goto(process.env.STREETSKATE_URL || 'http://127.0.0.1:5182/');
  await page.waitForFunction(() => window.streetSkate?.ready, null, {timeout:120000});
  const graphics = await page.evaluate(() => window.streetSkate.graphicsStatus());
  assert.equal(graphics.name, 'high-refresh');
  assert.equal(graphics.renderWidth, 1280);
  assert.equal(graphics.renderHeight, 720);
  assert.equal(graphics.bloomEnabled, true);
  await page.locator('[data-action="practice"]').click();
  await page.locator('[data-action="hero"]').first().click();
  await page.locator('[data-action="board"]').first().click();
  await page.locator('[data-action="confirmLoadout"]').click();
  await page.locator('body[data-screen="playing"]').waitFor({timeout:120000});
  await page.waitForTimeout(400);

  // Freeze the same rider pose so screenshots and camera distances compare fairly.
  await page.evaluate(() => {
    const skater = window.streetSkate.skater;
    window.__cameraOriginalUpdate = skater.update;
    skater.update = () => {};
  });
  await page.keyboard.press('Digit1');
  const modes = ['follow','follow-close','follow-low','classic','fixed','follow'];
  const distances = {};
  for (const [index, mode] of modes.entries()) {
    if (index) await page.keyboard.press('KeyC');
    await page.waitForFunction(expected => window.streetSkate.captureAuditTelemetry().cameraMode === expected, mode);
    await page.waitForTimeout(120);
    const info = await page.evaluate(() => ({
      mode:window.streetSkate.captureAuditTelemetry().cameraMode,
      stored:localStorage.getItem('streetskate.camera'),
      distance:window.streetSkate.camera.position.distanceTo(window.streetSkate.skater.position),
    }));
    assert.equal(info.stored, mode);
    distances[mode] = info.distance;
    if (index < 3) await page.screenshot({path:`artifacts/follow-camera/${mode}.png`});
  }
  assert.ok(distances['follow-close'] < distances.follow);
  assert.ok(distances['follow-low'] < distances.follow);
  for (const [key, mode] of [['Digit2','classic'],['Digit3','fixed'],['Digit1','follow']]) {
    await page.keyboard.press(key);
    await page.waitForFunction(expected => window.streetSkate.captureAuditTelemetry().cameraMode === expected, mode);
  }
  await page.evaluate(() => { window.streetSkate.skater.update = window.__cameraOriginalUpdate; });
  const start = await page.evaluate(() => window.streetSkate.skater.position.toArray());
  await page.keyboard.down('KeyW'); await page.waitForTimeout(1500); await page.keyboard.up('KeyW');
  const end = await page.evaluate(() => window.streetSkate.skater.position.toArray());
  assert.ok(Math.hypot(end[0]-start[0], end[2]-start[2]) > .2, 'the player can still skate');
  // Verify the new sight lines at the actual spawn of both other parks.
  for (const location of ['orbit','grand-warehouse']) {
    await page.evaluate(async id => {
      await window.streetSkate.selectLocation(id);
      window.streetSkate.setPaused(false);
    }, location);
    for (const mode of ['follow-close','follow-low']) {
      await page.evaluate(value => window.streetSkate.setCameraMode(value), mode);
      await page.waitForTimeout(250);
      const view = await page.evaluate(() => {
        const {camera,skater} = window.streetSkate;
        const rider = camera.position.clone();
        skater.visual.getWorldPosition(rider);
        rider.y += 1;
        rider.project(camera);
        return { x:rider.x, y:rider.y, z:rider.z, visible:skater.visual.visible };
      });
      assert.ok(view.visible && Math.abs(view.x) < 1 && Math.abs(view.y) < 1 && view.z < 1,
        `${mode} should keep the rider in view at ${location}`);
      await page.screenshot({path:`artifacts/follow-camera/${location}-${mode}.png`});
    }
  }
  await page.reload();
  await page.waitForFunction(() => window.streetSkate?.ready, null, {timeout:120000});
  assert.equal(await page.evaluate(() => window.streetSkate.captureAuditTelemetry().cameraMode), 'follow-low',
    'the chosen camera should survive a reload');
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ result:'PASS', distances, graphics, moved:Math.hypot(end[0]-start[0], end[2]-start[2]) }, null, 2));
} finally {
  await browser.close();
}
