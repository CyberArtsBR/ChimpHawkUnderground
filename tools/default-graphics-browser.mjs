import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { launchAuditBrowser } from './quality-browser-runtime.mjs';

const browser = await launchAuditBrowser();
await mkdir('artifacts/default-graphics', {recursive:true});
const url = process.env.STREETSKATE_URL || 'http://127.0.0.1:5182/';
const desired = {emissive:1.2,bloom:.49,glow:.5,radius:.26};
async function ready(page) {
  await page.goto(url);
  await page.waitForFunction(()=>window.streetSkate?.ready,null,{timeout:120000});
}
async function openGraphics(page) {
  await page.locator('[data-action="options"]').click();
  await page.locator('[data-action="graphicsMenu"]').click();
}
const status = page => page.evaluate(()=>window.streetSkate.graphicsStatus());
const text = (page,key) => page.locator(`[data-glow-value="${key}"]`).textContent();

try {
  const fresh = await browser.newPage({viewport:{width:1280,height:720}});
  const errors = [];fresh.on('pageerror',error=>errors.push(error.message));
  await ready(fresh);
  let current = await status(fresh);
  assert.equal(current.name,'high-refresh');assert.equal(current.bloomEnabled,true);
  assert.deepEqual(current.glowTuning,desired);
  await openGraphics(fresh);
  assert.equal(await fresh.locator('[data-action="bloomToggle"]').getAttribute('aria-pressed'),'true');
  assert.equal(await fresh.locator('[data-action="edgeToggle"]').getAttribute('aria-pressed'),'true');
  for (const [key,value] of Object.entries({emissive:'1.20×',bloom:'0.49',glow:'0.50',radius:'0.26'}))
    assert.equal(await text(fresh,key),value);
  await fresh.locator('.graphics-glow-settings').scrollIntoViewIfNeeded();
  await fresh.screenshot({path:'artifacts/default-graphics/new-player.png'});
  await fresh.reload();await fresh.waitForFunction(()=>window.streetSkate?.ready,null,{timeout:120000});
  current = await status(fresh);
  assert.deepEqual(current.glowTuning,desired,'new player defaults must survive reload');
  assert.equal(current.legacyGlowDefaults,false);
  assert.deepEqual(errors,[]);
  await fresh.close();

  const existing = await browser.newPage({viewport:{width:1280,height:720}});
  await existing.addInitScript(()=>{
    if (sessionStorage.getItem('qa-existing')) return;
    localStorage.setItem('streetskate.graphicsPreset.v2','high-refresh');
    localStorage.setItem('streetskate.bloomEnabled','off');
    localStorage.setItem('streetskate.smoothEdges','off');
    localStorage.setItem('streetskate.glowTuning.v1',JSON.stringify({'high-refresh':{emissive:.95,bloom:.37}}));
    sessionStorage.setItem('qa-existing','yes');
  });
  await ready(existing);
  current = await status(existing);
  assert.equal(current.name,'high-refresh');assert.equal(current.bloomEnabled,false);
  assert.equal(current.legacyGlowDefaults,true);
  assert.equal(current.glowTuning.emissive,.95);assert.equal(current.glowTuning.bloom,.37);
  assert.ok([.38,.6].includes(current.glowTuning.glow));
  await openGraphics(existing);
  assert.equal(await existing.locator('[data-action="edgeToggle"]').getAttribute('aria-pressed'),'false');
  assert.equal(await text(existing,'emissive'),'0.95×');assert.equal(await text(existing,'bloom'),'0.37');
  await existing.locator('[data-action="glowReset"]').click();
  current=await status(existing);
  assert.deepEqual(current.glowTuning,desired,'reset adopts the new preset defaults');
  assert.equal(current.bloomEnabled,false,'reset preserves the player’s glow switch');
  await existing.reload();await existing.waitForFunction(()=>window.streetSkate?.ready,null,{timeout:120000});
  current=await status(existing);
  assert.deepEqual(current.glowTuning,desired);assert.equal(current.bloomEnabled,false);
  await existing.close();
  console.log('PASS: first-launch defaults, reload, existing preferences and preset reset');
} finally { await browser.close(); }
