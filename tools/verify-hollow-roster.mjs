import assert from 'node:assert/strict';
import { access, mkdir, writeFile } from 'node:fs/promises';
import { launchAuditBrowser, auditUrl } from './quality-browser-runtime.mjs';

// A menu-only fixture avoids loading a park or an extra game renderer during QA.
// --bake-portrait calls the unchanged production portrait renderer exactly once.
const output = 'artifacts/hollow-roster';
await mkdir(output, { recursive: true });
const portraitPath = 'public/assets/menu/riders/thehollowf.png';
const styles = ['style', 'game-shell', 'loadout-menu', 'game-hud', 'menu-presentation',
  'gameplay-instruments', 'session-results', 'menu-graphics', 'flip-school',
  'player-settings', 'graphics-glow', 'round-flow'];
const html = mode => `<!doctype html><html><head><meta charset="utf-8">
  ${styles.map(name => `<link rel="stylesheet" href="/src/${name}.css">`).join('')}
  <style>body{margin:0}#app{position:fixed;inset:0}</style></head><body><div id="app"></div>
  ${mode === 'menu' ? `<script type="module">
    import {GameShell} from '/src/game/GameShell.js';
    window.shell = new GameShell({loadout:async()=>{}});
    window.shell.music.unlock=()=>{};
    window.shell.setReady();window.shell.begin(true);
  </script>` : ''}</body></html>`;
const browser = await launchAuditBrowser();
try {
  const page = await browser.newPage();
  let mode = 'bake';
  await page.route('**/__hollow-roster-fixture', route => route.fulfill({ contentType: 'text/html', body: html(mode) }));
  const fixtureUrl = new URL('__hollow-roster-fixture', auditUrl).href;
  if (process.argv.includes('--bake-portrait')) {
    await page.goto(fixtureUrl);
    const png = await page.evaluate(async () => {
      const { renderPortrait } = await import('/src/game/CharacterPortraits.js');
      return renderPortrait('/assets/rider/thehollowf.glb');
    });
    assert.match(png, /^data:image\/png;base64,/);
    await writeFile(portraitPath, Buffer.from(png.split(',')[1], 'base64'));
    console.log('Baked Hollow with production renderPortrait: ' + portraitPath);
  }
  await access(portraitPath);
  mode = 'menu';
  const errors = [], glbRequests = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => { if (/\.glb(?:\?|$)/i.test(request.url())) glbRequests.push(request.url()); });
  const results = [];
  for (const viewport of [{ width: 1280, height: 720 }, { width: 1920, height: 1080 }]) {
    await page.setViewportSize(viewport);
    await page.goto(fixtureUrl);
    await page.waitForFunction(() => document.querySelectorAll('.loadout-character').length === 5);
    await page.waitForFunction(() => [...document.querySelectorAll('[data-portrait-url]')]
      .every(node => node.dataset.previewState === 'ready'), null, { timeout: 30000 });
    await page.evaluate(() => document.fonts.ready);
    assert.deepEqual(await page.locator('.loadout-character strong').allTextContents(), ['The Hollow', 'Heretic', 'Adolescent', 'Anchor', 'Tuxr']);
    const layout = await page.locator('.loadout-roster-band').evaluate(roster => {
      const clippedBy = (el, box) => {
        for (let parent = el.parentElement; parent; parent = parent.parentElement) {
          const style = getComputedStyle(parent), r = parent.getBoundingClientRect();
          if (/(auto|scroll|hidden|clip)/.test(style.overflowY) && (box.top < r.top - 1 || box.bottom > r.bottom + 1)) return parent.className;
          if (/(auto|scroll|hidden|clip)/.test(style.overflowX) && (box.left < r.left - 1 || box.right > r.right + 1)) return parent.className;
        }
        return null;
      };
      return [...roster.children].map(card => {
        const r = card.getBoundingClientRect();
        return { top: r.top, name: card.querySelector('strong').textContent,
          inViewport: r.top >= 0 && r.bottom <= innerHeight && r.left >= 0 && r.right <= innerWidth,
          clipped: clippedBy(card, r), labels: [...card.querySelectorAll('strong, small')].map(label => {
            const range = document.createRange();range.selectNodeContents(label);
            const text = range.getBoundingClientRect();
            return { text: label.textContent, clipped: clippedBy(label, text), fitsCard: text.left >= r.left && text.right <= r.right && text.top >= r.top && text.bottom <= r.bottom };
          }) };
      });
    });
    assert.ok(layout.every(card => card.inViewport && !card.clipped), JSON.stringify(layout));
    assert.ok(layout.every(card => card.labels.every(label => label.fitsCard && !label.clipped)), JSON.stringify(layout));
    assert.ok(layout.every(card => Math.abs(card.top - layout[0].top) < 1), 'all five stock riders share a row');

    const heroes = page.locator('.loadout-character');
    await heroes.first().focus();
    for (let i = 1; i < 5; i++) {
      await page.keyboard.press('ArrowRight');
      assert.equal(await page.locator(':focus').getAttribute('data-index'), String(i));
      await page.keyboard.press('Enter');
      assert.equal(await heroes.nth(i).getAttribute('aria-pressed'), 'true');
    }
    for (let i = 3; i >= 0; i--) {
      await page.keyboard.press('ArrowLeft');
      assert.equal(await page.locator(':focus').getAttribute('data-index'), String(i));
    }
    const gamepad = await page.evaluate(() => {
      const pad = {id:'Hollow roster QA controller',index:0,connected:true,axes:[0,0,0,0],buttons:Array.from({length:17},()=>({pressed:false}))};
      Object.defineProperty(navigator,'getGamepads',{configurable:true,value:()=>[pad]});
      Object.defineProperty(document,'hasFocus',{configurable:true,value:()=>true});
      shell.update(1/60);
      const indices=[];
      for(let i=1;i<5;i++){
        pad.buttons[15].pressed=true;shell.update(1/60);
        indices.push(document.activeElement.dataset.index);
        pad.buttons[15].pressed=false;shell.update(1/60);
        pad.buttons[0].pressed=true;shell.update(1/60);
        pad.buttons[0].pressed=false;shell.update(1/60);
      }
      for(let i=3;i>=0;i--){
        pad.buttons[14].pressed=true;shell.update(1/60);
        indices.push(document.activeElement.dataset.index);
        pad.buttons[14].pressed=false;shell.update(1/60);
      }
      return indices;
    });
    assert.deepEqual(gamepad, ['1','2','3','4','3','2','1','0']);
    await heroes.first().click();
    await page.locator('[data-action="board"][data-index="0"]').click();
    assert.equal(await page.locator('[data-action="confirmLoadout"]').isDisabled(), false);
    await heroes.first().focus();
    await page.screenshot({ path: `${output}/loadout-${viewport.width}x${viewport.height}.png` });
    results.push({ viewport, layout, gamepad });
    console.log(`PASS ${viewport.width}x${viewport.height}: five visible riders, full labels, keyboard + gamepad traversal`);
  }
  assert.deepEqual(glbRequests, [], 'stock menu portraits must not load a GLB');
  assert.deepEqual(errors, []);
  await writeFile(`${output}/report.json`, JSON.stringify({ results, errors, glbRequests }, null, 2));
} finally {
  await browser.close();
}
