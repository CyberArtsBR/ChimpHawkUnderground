import { launchAuditBrowser } from './quality-browser-runtime.mjs';import {mkdir,writeFile} from 'node:fs/promises';import assert from 'node:assert/strict';
const output='artifacts/master-upgrade/overtime-qa',browser=await launchAuditBrowser(),report={scenarios:[],errors:[],note:'Synthetic browser-clock jump to zero; real physics and input afterwards. Not an additional real-time round.'};await mkdir(output,{recursive:true});
try{
 for(const variant of ['land','bail']){
  const context=await browser.newContext({viewport:{width:1280,height:720}});const page=await context.newPage();page.on('pageerror',e=>report.errors.push(e.message));
  await page.addInitScript(()=>{const real=performance.now.bind(performance);window.auditClockOffset=0;performance.now=()=>real()+window.auditClockOffset;});
  await page.goto('http://127.0.0.1:5182/');await page.waitForFunction(()=>window.streetSkate?.ready,null,{timeout:90000});await page.locator('[data-action=start]').click();await page.locator('[data-action=hero]').first().click();await page.locator('[data-action=board]').first().click();await page.locator('[data-action=location][data-index="2"]').click();await page.locator('[data-action=confirmLoadout]').click();await page.locator('body[data-screen=playing]').waitFor({timeout:90000});await page.locator('.round-cue').waitFor({state:'hidden',timeout:10000});
  await page.keyboard.down('Space');await page.waitForTimeout(240);await page.keyboard.up('Space');await page.waitForFunction(()=>!window.streetSkate.skater.grounded,null,{timeout:5000});
  const remaining=await page.locator('#run-timer').getAttribute('aria-label');const m=remaining.match(/(\d+):(\d+)/),ms=(Number(m[1])*60+Number(m[2]))*1000;
  await page.evaluate(ms=>window.auditClockOffset+=ms,ms);await page.waitForFunction(()=>document.querySelector('.round-cue')?.dataset.phase==='overtime',null,{timeout:5000});
  const before=await page.evaluate(()=>({score:window.streetSkate.skater.score,combo:window.streetSkate.skater.tricks.comboText(),grounded:window.streetSkate.skater.grounded}));await page.screenshot({path:`${output}/${variant}-overtime.png`});
  if(variant==='bail')await page.evaluate(()=>window.streetSkate.skater.bail('QA overtime bail'));
  await page.waitForFunction(()=>['timeup','results'].includes(document.body.dataset.screen),null,{timeout:12000});
  const after=await page.evaluate(()=>({score:window.streetSkate.skater.score,phase:document.body.dataset.screen}));assert.ok(before.combo,`expected pending trick: ${JSON.stringify(before)}`);
  if(variant==='land')assert.ok(after.score>before.score,`valid land must score once: ${JSON.stringify({before,after})}`);else assert.equal(after.score,before.score,'bail forfeits pending trick');
  report.scenarios.push({variant,remaining,before,after,result:'PASS'});await context.close();
 }
 assert.deepEqual(report.errors,[]);report.result='PASS';
}catch(e){report.result='FAIL';report.failure=String(e.stack||e);process.exitCode=1;console.error(e)}finally{await writeFile(`${output}/report.json`,JSON.stringify(report,null,2));await browser.close();console.log(JSON.stringify(report))}
