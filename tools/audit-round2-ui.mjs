import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {launchAuditBrowser} from './quality-browser-runtime.mjs';
const out='artifacts/audit-round2/ui';await mkdir(out,{recursive:true});
const browser=await launchAuditBrowser();
try{
  const page=await browser.newPage({viewport:{width:1280,height:720}});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(process.env.STREETSKATE_URL||'http://127.0.0.1:5182/');
  await page.waitForFunction(()=>window.streetSkate?.ready,null,{timeout:90000});
  assert.equal(await page.locator('[data-action="flipSchool"]').count(),0);
  await page.locator('[data-action="practice"]').click();
  for(const guide of [false,true]){
    await page.keyboard.press('h');
    await page.locator('body[data-screen="flipSchool"]').waitFor();
    if(guide){
      await page.locator('[data-action="tutorialNext"]').click();
      while(await page.locator('[data-action="next"]').count())await page.locator('[data-action="next"]').click();
      assert.equal(await page.locator('[data-action="closeTutorial"]').textContent(),'BACK TO LOADOUT');
      await page.locator('[data-action="closeTutorial"]').click();
    }else await page.keyboard.press('Escape');
    await page.locator('body[data-screen="select"]').waitFor();
    assert.equal(await page.locator('[data-action="confirmLoadout"]').isDisabled(),true);
  }
  await page.screenshot({path:`${out}/loadout-return.png`});
  const buttons=page.locator('button[data-menu]:enabled');
  await buttons.last().focus();await page.keyboard.press('Tab');
  assert.equal(await buttons.first().evaluate(el=>el===document.activeElement),true);
  await page.keyboard.press('Shift+Tab');
  assert.equal(await buttons.last().evaluate(el=>el===document.activeElement),true);
  await page.locator('[data-action="hero"][data-index="0"]').click();
  await page.locator('[data-action="board"][data-index="6"]').click();
  await page.locator('[data-action="confirmLoadout"]').click();
  await page.locator('body[data-screen="playing"]').waitFor({timeout:90000});
  await page.keyboard.press('Escape');
  await page.locator('[data-action="practiceDrills"]').waitFor();
  await page.screenshot({path:`${out}/practice-preserved.png`});
  await page.locator('[data-action="options"]').click();
  await page.locator('[data-action="graphicsMenu"]').click();
  await page.locator('[data-action="back"]').focus();await page.keyboard.press('Shift+Tab');
  assert.equal(await page.locator('.graphics-advanced summary').evaluate(el=>el===document.activeElement),true);
  await page.keyboard.press('Enter');assert.equal(await page.locator('.graphics-advanced').getAttribute('open'),'');
  assert.deepEqual(errors,[]);
  await writeFile(`${out}/report.json`,JSON.stringify({passed:true,errors,checks:['tutorial returns to unconfirmed loadout','guide return preserves practice mode','Tab and Shift+Tab wrap','native graphics disclosure remains keyboard accessible','no title Flip School duplicate']},null,2));
  console.log('PASS tutorial loadout return, practice mode, menu Tab route');
}finally{await browser.close();}
