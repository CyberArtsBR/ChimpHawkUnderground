import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({ headless: true, channel: 'chrome', args: ['--enable-unsafe-swiftshader'] });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(process.env.STREETSKATE_URL || 'http://127.0.0.1:5181', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.streetSkate?.ready, null, { timeout: 60000 });
  await page.locator('[data-action="options"]').click();
  await page.locator('[data-action="practice"]').click();
  await page.locator('.loadout-character').first().click();
  await page.locator('.loadout-deck').nth(2).click();
  await page.locator('.loadout-location').filter({ hasText: 'URBAN WAREHOUSE' }).click();
  await page.locator('[data-action="confirmLoadout"]').click();
  await page.locator('body[data-screen="playing"]').waitFor({ timeout: 60000 });
  await page.waitForFunction(() => window.streetSkate.currentLocation === 'urban-warehouse', null, { timeout: 60000 });
  const result = await page.evaluate(() => {
    const game = window.streetSkate;
    game.setMode('explore'); game.setExploreView('top');
    return { location: game.currentLocation, rails: game.manifest.rails.length,
      triangles: game.manifest.collisionTriangles, spots: game.manifest.spots.map(s => s.id),
      player: game.skater.position.toArray(), violations: game.skater.stateInvariantViolations || [] };
  });
  await page.waitForTimeout(1500);
  await mkdir('artifacts/collision-audit', { recursive: true });
  await page.screenshot({ path: 'artifacts/collision-audit/urban-top.png' });
  await page.evaluate(() => window.streetSkate.setExploreView('overview'));
  await page.waitForTimeout(1500);
  await page.screenshot({ path: 'artifacts/collision-audit/urban-overview.png' });
  result.stairCamera = await page.evaluate(() => {
    const game = window.streetSkate;
    game.setMode('skate'); game.setPaused(true);
    game.skater.position.set(10.587409, .216215, 26.264255);
    game.skater.heading = 0; game.skater.groundDirection();
    game.skater.velocity.set(0, 0, -17);
    game.setCameraMode('follow');
    return { distance: game.camera.position.distanceTo(game.skater.position),
      eye: game.camera.position.toArray() };
  });
  await page.evaluate(() => {
    const game = window.streetSkate;
    game.skater.velocity.set(0, 0, 0);
    game.setPaused(false);
  });
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'artifacts/collision-audit/stair-camera.png' });
  if (result.stairCamera.distance < 2.35) throw new Error('Stair camera collapsed into rider');
  result.errors = errors;
  await writeFile('artifacts/collision-audit/browser.json', JSON.stringify(result, null, 2));
  if (errors.length || result.violations.length) throw new Error(JSON.stringify(result));
  console.log(JSON.stringify(result, null, 2));
} finally { await browser.close(); }
