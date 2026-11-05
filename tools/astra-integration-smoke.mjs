import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {launchAuditBrowser} from './quality-browser-runtime.mjs';
const out='artifacts/astra-implementation/browser';await mkdir(out,{recursive:true});
const report={errors:[],maps:[],checks:[]},browser=await launchAuditBrowser();
try{
 const page=await browser.newPage({viewport:{width:1280,height:720}});
 page.on('pageerror',e=>report.errors.push(e.message));
 await page.goto('http://127.0.0.1:5188/');await page.waitForFunction(()=>window.streetSkate?.ready,null,{timeout:90000});
 const click=a=>page.locator(`[data-action="${a}"]`).first().click();
 const snap=async name=>{await page.screenshot({path:`${out}/${name}.png`});};
 const choose=async()=>{await page.locator('[data-action="hero"][data-index="0"]').click();await page.locator('[data-action="board"][data-index="6"]').click();};
 await click('start');await choose();await click('confirmLoadout');await page.locator('body[data-screen="playing"]').waitFor({timeout:90000});
 await page.waitForTimeout(1800);
 for(let i=0;i<2;i++){await page.keyboard.down('Space');await page.waitForTimeout(300);await page.keyboard.up('Space');await page.waitForTimeout(1500);}
 report.glyphLatency=await page.evaluate(async()=>{
   const s=window.streetSkate.skater,text='LASER FLIP · +900',start=performance.now();s.feedback=text;s.feedbackTime=3;
   await new Promise((resolve,reject)=>{function tick(){if(document.querySelector('#trick-feedback')?.dataset.graffitiText===text)return resolve();if(performance.now()-start>5000)return reject(Error('glyph feedback timeout'));requestAnimationFrame(tick);}tick();});
   return{ms:performance.now()-start,method:'First-use diagnostic label in fresh browser cache; local asset delivery, not network-throttled scoring test',glyphImages:document.querySelectorAll('#trick-feedback img').length};
 });
 await page.keyboard.press('Escape');
 const state=()=>page.evaluate(()=>{const s=window.streetSkate.skater;return{score:s.score,position:s.position.toArray(),rider:s.rider.url,map:window.streetSkate.currentLocation};});
 const before=await state();await click('options');await click('practice');await click('back');
 assert.equal(await page.locator('body').getAttribute('data-screen'),'options');assert.deepEqual(await state(),before);
 report.checks.push('Paused setup cancellation preserves actual rider, map, score and position');
 await click('practice');
 await page.route('**/The_Anchor.glb*',async route=>{await new Promise(r=>setTimeout(r,1800));await route.continue().catch(()=>{});});
 await page.locator('[data-action="hero"][data-index="3"]').click();await page.locator('[data-action="board"][data-index="2"]').click();await click('confirmLoadout');
 await page.waitForTimeout(150);await click('back');await page.waitForTimeout(2400);
 assert.deepEqual(await state(),before);assert.equal(await page.locator('body').getAttribute('data-screen'),'options');
 report.checks.push('Cancel delayed rider load rejects stale completion without replacing live rider');
 await page.unroute('**/The_Anchor.glb*');await click('back');await click('resume');
 await snap('playing');
 console.log('Waiting for actual timed run and replay');
 await page.locator('body[data-screen="results"]').waitFor({timeout:105000});await snap('results');
 const highlights=page.locator('[data-action="watchHighlights"]');
 const alternative=page.locator('[data-action="highlights"]');
 const button=(await highlights.count())?highlights:alternative;
 if(await button.count()){await button.first().click();await page.locator('body[data-screen="highlights"]').waitFor();await page.waitForTimeout(1400);await snap('replay');await page.keyboard.press('Escape');report.checks.push('Timed round results and replay start/stop');}
 else throw Error('No highlight button after scored ollies');
 for(const id of ['grand-warehouse','orbit','skate-paradise']){
   await click('practice');await choose();await page.locator(`[data-action="location"][data-location="${id}"]`).click();await click('confirmLoadout');
   await page.locator('body[data-screen="playing"]').waitFor({timeout:90000});await page.waitForTimeout(500);
   await page.keyboard.down('Space');await page.waitForTimeout(260);await page.keyboard.up('Space');await page.waitForTimeout(180);
   await snap(id);report.maps.push(await state());assert.ok((await state()).position.every(Number.isFinite));
   await page.keyboard.press('Escape');await click('options');await click('graphicsMenu');
   await page.locator('[data-action="graphicsSet"][data-index="5"]').click();
   assert.equal(await page.evaluate(()=>window.streetSkate.graphicsStatus().allocation.state),'ready');
   await click('back');await click('back');await click('resume');await page.waitForTimeout(100);await snap(id+'-cinematic');
   await page.keyboard.press('Escape');await click('options');await click('graphicsMenu');await page.locator('[data-action="graphicsSet"][data-index="1"]').click();await click('back');
 }
 assert.deepEqual(report.errors,[]);report.result='PASS';console.log(JSON.stringify(report));
}catch(error){report.result='FAIL';report.failure=error.stack;process.exitCode=1;console.error(error);}
finally{await writeFile(`${out}/report.json`,JSON.stringify(report,null,2));await browser.close();}
