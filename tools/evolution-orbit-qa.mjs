import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { launchAuditBrowser } from './quality-browser-runtime.mjs';

const url = process.env.STREETSKATE_URL || 'http://127.0.0.1:5185/';
const out = 'artifacts/evolution-2026-11-03/orbit-final';
await mkdir(out, { recursive: true });
const report = { errors: [], httpErrors: [], variants: [], fixture: 'Before restores only the old decorative-joint filter in the browser response; repository files stay unchanged. Raw renderer captures use the same fixed camera to isolate geometry.' };
const browser = await launchAuditBrowser();
try {
  for (const variant of ['before', 'after']) {
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const page = await context.newPage(); let patched = false;
    page.on('pageerror', e => report.errors.push(e.message));
    page.on('response', r => { if (r.status() >= 400) report.httpErrors.push(r.url()); });
    if (variant === 'before') await page.route('**/assets/OrbitPark-*.js', async route => {
      const response = await route.fetch(), source = await response.text();
      assert.ok(source.includes('(?:expansion|short)'), 'new decorative-joint filter exists in the tested production module');
      patched = true;
      await route.fulfill({ response, body: source.replace('(?:expansion|short)', 'expansion') });
    });
    await page.goto(url); await page.waitForFunction(() => window.streetSkate?.ready, null, { timeout: 90000 });
    await page.locator('[data-action="practice"]').click();
    await page.locator('[data-action="hero"][data-index="1"]').click();
    await page.locator('[data-action="board"][data-index="3"]').click();
    await page.locator('[data-action="location"][data-location="orbit"]').click();
    await page.locator('[data-action="confirmLoadout"]').click();
    await page.locator('body[data-screen="playing"]').waitFor({ timeout: 90000 });
    const value = await page.evaluate(() => {
      const g = window.streetSkate; g.setPaused(true);
      g.skater.resetRider(g.skater.spawn.clone().set(10, .015, 36), 0); g.skater.update(0, {}, 0);
      g.camera.position.set(13.4, 2.215, 39.4); g.camera.lookAt(10, .865, 36); g.camera.updateMatrixWorld();
      g.scene.updateMatrixWorld(true); g.renderer.shadowMap.needsUpdate = true; g.renderer.render(g.scene, g.camera);
      let seamVertices = 0;
      g.park.traverse(n => { if (n.isMesh && n.material?.name === 'Seam / charcoal rubber') seamVertices += n.geometry.attributes.position.count; });
      return { image: g.renderer.domElement.toDataURL('image/png'), seamVertices, glow: g.graphicsStatus().glowTuning,
        collisionMeshes: g.collision.children.length, rails: g.manifest.rails.length };
    });
    await writeFile(`${out}/${variant}.png`, Buffer.from(value.image.split(',')[1], 'base64')); delete value.image;
    assert.equal(value.rails, 14); assert.deepEqual(value.glow, { emissive: 1.5, bloom: 1.09, glow: .1, radius: .11 });
    if (variant === 'before') assert.equal(patched, true);
    report.variants.push({ variant, ...value });
    if (variant === 'after') {
      report.spotRecovery = await page.evaluate(() => {
        const g = window.streetSkate, spot = g.manifest.spots[0], s = g.skater;
        s.score = 375; s.stance = -1; const serial = s.respawnSerial;
        g.goToSpot(spot.id);
        return { serialBefore: serial, serialAfter: s.respawnSerial, score: s.score, stance: s.stance, canonicalStance: s.playerState.stance };
      });
      assert.equal(report.spotRecovery.serialAfter, report.spotRecovery.serialBefore + 1);
      assert.equal(report.spotRecovery.score, 375); assert.equal(report.spotRecovery.stance, -1); assert.equal(report.spotRecovery.canonicalStance, -1);
      await page.evaluate(() => window.streetSkate.setPaused(false)); await page.waitForTimeout(200);
      await page.screenshot({ path: `${out}/gameplay.png` });
      report.entry = await page.locator('script[src]').evaluateAll(es => es.map(e => e.src));
    }
    await context.close();
  }
  assert.equal(report.variants[0].seamVertices - report.variants[1].seamVertices, 18840);
  assert.deepEqual(report.errors, []); assert.deepEqual(report.httpErrors, []);
  report.result = 'PASS'; console.log('ORBIT production A/B and named-spot recovery passed; decorative bars removed, gameplay geometry retained.');
} catch (error) { report.failure = error.stack; console.error(error); process.exitCode = 1; }
finally { await writeFile(`${out}/report.json`, JSON.stringify(report, null, 2)); await browser.close(); }
