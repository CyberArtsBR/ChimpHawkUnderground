import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { launchAuditBrowser } from './quality-browser-runtime.mjs';

const browser = await launchAuditBrowser();
const output = 'artifacts/loadout-selection';
await mkdir(output, { recursive: true });
try {
  for (const viewport of [{ width: 1280, height: 720 }, { width: 1920, height: 1080 }]) {
    const page = await browser.newPage({ viewport });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(process.env.STREETSKATE_URL || 'http://127.0.0.1:5182/');
    await page.waitForFunction(() => window.streetSkate?.ready, null, { timeout: 120000 });
    await page.locator('[data-action="practice"]').click();
    await page.waitForFunction(() => {
      const headings = document.querySelectorAll('.loadout-heading .graffiti-lettering');
      return headings.length === 3 && [...headings].every(el => el.classList.contains('graffiti-ready'));
    }, null, { timeout: 30000 });
    await page.screenshot({ path: `${output}/before-${viewport.width}.png` });
    await page.evaluate(() => { window.__loadoutHeadings = [...document.querySelectorAll('.loadout-heading .graffiti-lettering')]; });

    for (const [action, index] of [['hero', 2], ['board', 5], ['location', 1]]) {
      const button = page.locator(`[data-action="${action}"][data-index="${index}"]`);
      await button.scrollIntoViewIfNeeded();
      const before = await page.locator('.shell-content').evaluate(el => el.scrollTop);
      await button.click();
      const after = await page.evaluate(() => ({
        sameHeadings: window.__loadoutHeadings.every((el, i) => el === document.querySelectorAll('.loadout-heading .graffiti-lettering')[i]),
        allReady: [...document.querySelectorAll('.loadout-heading .graffiti-lettering')].every(el => el.classList.contains('graffiti-ready')),
        scroll: document.querySelector('.shell-content').scrollTop,
      }));
      assert.equal(after.sameHeadings, true, `${action}: section headings should stay mounted`);
      assert.equal(after.allReady, true, `${action}: graffiti should never switch to fallback text`);
      assert.ok(Math.abs(after.scroll - before) <= 2, `${action}: selection moved the menu scroll position`);
      assert.equal(await button.getAttribute('aria-pressed'), 'true');
      assert.equal(await page.locator('[data-action="confirmLoadout"]').isDisabled(), action === 'hero');
    }
    assert.equal(await page.locator('.selected-rider-copy strong').textContent(), 'Adolescent');
    assert.equal(await page.locator('.deck-panel .selection-note strong').textContent(), 'BLUE');
    assert.equal(await page.locator('.spot-panel .selection-note strong').textContent(), 'MAP 2 / ORBIT');
    assert.match(await page.locator('.loadout-recap').innerText(), /Adolescent\s*\/\s*BLUE\s*\/\s*MAP 2/);
    await page.screenshot({ path: `${output}/after-${viewport.width}.png` });

    // Keyboard/controller navigation uses the same focused-button click path.
    await page.locator('[data-action="hero"][data-index="0"]').focus();
    await page.keyboard.press('ArrowRight');
    assert.equal(await page.locator(':focus').getAttribute('data-index'), '1');
    await page.keyboard.press('Enter');
    assert.equal(await page.locator('[data-action="hero"][data-index="1"]').getAttribute('aria-pressed'), 'true');
    assert.equal(await page.evaluate(() => window.__loadoutHeadings.every(el => el.isConnected)), true);

    // A late portrait request must not replace a newer choice during rapid input.
    await page.evaluate(() => {
      for (const index of [0, 3, 4]) document.querySelector(`[data-action="hero"][data-index="${index}"]`).click();
    });
    await page.waitForFunction(() => {
      const portrait = document.querySelector('.selected-rider [data-portrait-url]');
      return portrait.dataset.previewState === 'ready' && portrait.querySelector('img')?.src.includes('TuxR.png');
    }, null, { timeout: 30000 });
    assert.equal(await page.locator('.selected-rider-copy strong').textContent(), 'Tuxr');
    await page.locator('[data-action="hero"][data-index="2"]').click();
    if (viewport.width === 1280) {
      await page.locator('[data-action="confirmLoadout"]').click();
      await page.locator('body[data-screen="playing"]').waitFor({ timeout: 120000 });
      const chosen = await page.evaluate(() => ({
        map: window.streetSkate.currentLocation,
        rider: window.streetSkate.skater.rider.url,
        finish: window.streetSkate.skater.board.finishIndex,
      }));
      assert.equal(chosen.map, 'orbit');
      assert.match(chosen.rider, /The_AdolescentUR\.glb/);
      assert.equal(chosen.finish, 5);
    }
    assert.deepEqual(errors, []);
    await page.close();
    console.log(`PASS ${viewport.width}x${viewport.height}: stable headings, selection, and scroll`);
  }
} finally {
  await browser.close();
}
