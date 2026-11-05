import { createRequire } from 'node:module';
import { writeFile, mkdir } from 'node:fs/promises';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({ headless: true, channel: 'chrome', args: ['--enable-unsafe-swiftshader'] });
const label = process.env.AUDIT_LABEL || 'local';
await mkdir('artifacts/collision-audit', { recursive: true });
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
  await page.goto(process.env.STREETSKATE_URL || 'http://127.0.0.1:5181');
  await page.waitForFunction(() => window.streetSkate?.ready, null, { timeout: 60000 });
  await page.locator('[data-action="options"]').click();
  await page.locator('[data-action="practice"]').click();
  await page.locator('.loadout-character').first().click();
  await page.locator('.loadout-deck').nth(2).click();
  await page.locator('.loadout-location').filter({ hasText: 'URBAN WAREHOUSE' }).click();
  await page.locator('[data-action="confirmLoadout"]').click();
  await page.locator('body[data-screen="playing"]').waitFor({ timeout: 60000 });
  await page.waitForFunction(() => window.streetSkate.currentLocation === 'urban-warehouse');
  await page.evaluate(() => window.streetSkate.setMode('explore'));
  await page.waitForTimeout(2000);
  const results = [];
  for (const route of [
    { name: 'halfpipe', start: [8.33, .3, -36.43], heading: 0, minimumRise: 4 },
    { name: 'quarter', start: [46.33, .3, -41.28], heading: 0, minimumRise: 4 },
    { name: 'mini', start: [-15.83, .3, -35.8], heading: -Math.PI / 2, minimumRise: 3.2 },
    { name: 'flow-launch', start: [27.25, .3, 27.54], heading: Math.PI, minimumRise: 4 },
  ]) {
    const result = await page.evaluate(route => {
      const g = window.streetSkate, s = g.skater;
      s.reset(s.position.clone().fromArray(route.start), route.heading);
      s.update(0, {}, 0); s.groundDirection(); s.velocity.copy(s.forward).multiplyScalar(14); s.rollingSign = 1;
      let launch = null, peak = -Infinity, png = null, landed = false;
      const takeoff = s.takeoff;
      s.takeoff = function(...args) {
        const ground = this.grounded;
        const result = takeoff.apply(this, args);
        if (ground && !this.grounded && !launch) launch = { y: this.position.y, vy: this.velocity.y,
          transition: this.transitionAir?.copingName || null };
        return result;
      };
      try {
        for (let i = 0; i < 480; i++) {
          s.update(1 / 120, { steer: 0, drive: 0, spin: 0, directionTaps: [], grabHeld: false }, i / 120);
          if (launch && s.position.y > peak) {
            peak = s.position.y;
            const p = s.position;
            g.camera.position.set(p.x + 9, p.y + 3, p.z + 8);
            g.camera.lookAt(p.x, p.y, p.z);
            g.renderer.render(g.scene, g.camera); png = g.renderer.domElement.toDataURL();
          }
          if (launch && s.grounded) { landed = true; break; }
          if (s.bailTime) break;
        }
      } finally { s.takeoff = takeoff; }
      return { name: route.name, minimumRise: route.minimumRise, launch, rise: launch ? peak - launch.y : 0, landed, bail: s.bailTime, png };
    }, route);
    const { png, ...data } = result;
    results.push(data);
    if (png) await writeFile(`artifacts/collision-audit/ramp-${label}-${route.name}.png`, Buffer.from(png.split(',')[1], 'base64'));
  }
  await writeFile(`artifacts/collision-audit/ramp-browser-${label}.json`, JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results));
  if (results.some(r => r.rise < r.minimumRise || !r.landed || r.bail)) throw new Error('Ramp height or return failed');
} finally { await browser.close(); }
