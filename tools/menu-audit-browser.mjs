import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir,writeFile } from 'node:fs/promises';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch({headless:true,channel:'chrome',args:['--enable-unsafe-swiftshader']});
const label=process.env.AUDIT_LABEL||'local';
await mkdir('artifacts/menu-audit',{recursive:true});
try {
  const page=await browser.newPage({viewport:{width:1536,height:900}});
  const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto(process.env.STREETSKATE_URL||'http://127.0.0.1:5181');
  await page.waitForFunction(()=>window.streetSkate?.ready,null,{timeout:90000});
  await page.locator('[data-action="options"]').click();
  await page.locator('[data-action="practice"]').click();
  await page.waitForFunction(()=>document.querySelectorAll('.deck-thumb img').length===8&&document.querySelectorAll('.rider-portrait img').length===4,null,{timeout:60000});
  await page.waitForFunction(()=>[...document.querySelectorAll('.graffiti-word img')].every(i=>i.complete&&i.naturalWidth>0));
  assert.equal(await page.locator('.loadout-section').count(),3);
  assert.deepEqual(await page.locator('.loadout-location').evaluateAll(items=>items.map(i=>i.dataset.location)),['rooftop','urban-warehouse']);
  assert.deepEqual(await page.locator('.map-number').allTextContents(),['MAP 01','MAP 02']);
  assert.equal(await page.locator('.loadout-backdrop:visible').count(),1);
  const savedFinish=await page.evaluate(()=>localStorage.getItem('streetskate.boardFinish'));
  assert.ok(!savedFinish||savedFinish==='0','thumbnails must not change saved finish');
  await page.locator('[data-action="hero"][data-index="0"]').focus();
  await page.keyboard.press('ArrowRight');
  assert.equal(await page.evaluate(()=>document.activeElement.dataset.index),'1');
  await page.keyboard.press('ArrowDown');
  assert.equal(await page.evaluate(()=>document.activeElement.dataset.index),'3');
  await page.locator('[data-action="hero"][data-index="2"]').click();
  await page.locator('[data-action="board"][data-index="5"]').click();
  await page.locator('[data-location="urban-warehouse"]').click();
  const layouts=[];
  for(const [name,width,height] of [['desktop',1536,900],['laptop',1280,720],['short',800,450]]) {
    await page.setViewportSize({width,height});
    await page.locator('.shell-content').evaluate(el=>el.scrollTop=0);
    await page.waitForTimeout(500);
    const layout=await page.evaluate(()=>{
      const shell=document.querySelector('.shell-content');
      const panels=[...document.querySelectorAll('.loadout-section')].map(e=>{const r=e.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,radius:parseFloat(getComputedStyle(e).borderRadius)};});
      const footer=document.querySelector('.loadout-shell footer').getBoundingClientRect();
      return {overflow:shell.scrollWidth>shell.clientWidth+1,panels,footerTop:footer.top};
    });
    assert.equal(layout.overflow,false,`${name}: horizontal overflow`);
    assert.ok(await page.locator('.loadout-heading h3 img').first().evaluate(e=>e.clientHeight>=24),`${name}: graffiti heading too small`);
    assert.ok(await page.locator('.rider-portrait img').evaluateAll(images=>images.every(e=>e.clientHeight<=e.parentElement.clientHeight+1)),`${name}: clipped rider preview`);
    assert.ok(layout.panels.every(p=>p.radius>=20));
    assert.ok(layout.footerTop>=Math.max(...layout.panels.map(p=>p.bottom)),`${name}: footer overlaps panels`);
    for(let i=1;i<layout.panels.length;i++) {
      const a=layout.panels[i-1],b=layout.panels[i];
      assert.ok(b.left>=a.right-1||b.top>=a.bottom-1,`${name}: panels overlap`);
    }
    await page.screenshot({path:`artifacts/menu-audit/${label}-${name}.png`});
    await page.locator('[data-action="confirmLoadout"]').scrollIntoViewIfNeeded();
    assert.ok(await page.locator('[data-action="confirmLoadout"]').isEnabled());
    layouts.push({name,...layout});
  }
  await page.setViewportSize({width:1200,height:900});
  await page.locator('[data-action="confirmLoadout"]').click();
  await page.locator('body[data-screen="playing"]').waitFor({timeout:90000});
  assert.equal(await page.evaluate(()=>window.streetSkate.currentLocation),'urban-warehouse');
  assert.equal(await page.locator('.loadout-backdrop:visible').count(),0);
  await page.evaluate(()=>{const g=window.streetSkate;g.skater.feedback='Kickflip';g.skater.feedbackTime=10;});
  await page.waitForFunction(()=>document.querySelector('#trick-feedback .graffiti-word img')?.complete);
  assert.equal(await page.locator('#trick-feedback .graffiti-lettering').getAttribute('aria-label'),'Kickflip');
  assert.deepEqual(errors,[]);
  await writeFile(`artifacts/menu-audit/${label}-results.json`,JSON.stringify({layouts,errors},null,2));
  console.log(JSON.stringify({views:layouts.map(l=>l.name),maps:['rooftop','urban-warehouse'],riders:4,deckPreviews:8,errors}));
} finally { await browser.close(); }
