import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';

// End-to-end smoke for the published loadout flow; separate from legacy QA overlay tests.
const browser=await chromium.launch({headless:true,args:['--use-gl=swiftshader','--enable-webgl','--ignore-gpu-blocklist']});
const page=await browser.newPage({viewport:{width:1600,height:900}});
const errors=[];page.on('pageerror',error=>errors.push(String(error)));
try{
  await page.goto(process.env.STREETSKATE_URL||'http://127.0.0.1:4173',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.streetSkate?.ready===true,null,{timeout:90000});
  assert.equal(await page.locator('body').getAttribute('data-screen'),'title');
  await page.locator('[data-action="start"]').click();
  await page.waitForSelector('.loadout-shell');
  const hero=page.locator('.loadout-character');
  const decks=page.locator('.loadout-deck');
  assert.equal(await hero.count(),5);
  assert.equal(await decks.count(),8);
  assert.equal(await page.locator('[data-action="confirmLoadout"]').isDisabled(),true);
  // Keyboard navigation must be horizontal within a row and vertical between rows.
  await hero.first().focus();await page.keyboard.press('ArrowRight');
  assert.equal(await page.locator(':focus').getAttribute('data-index'),'1');
  await page.keyboard.press('ArrowDown');
  assert.ok(await page.locator(':focus').getAttribute('data-action')!=='hero');
  await hero.first().click();
  assert.equal(await page.locator('.loadout-character.is-chosen').count(),1);
  assert.equal(await page.locator('[data-action="confirmLoadout"]').isDisabled(),true);
  await decks.nth(5).click();
  assert.equal(await page.locator('.loadout-deck.is-chosen').count(),1);
  assert.equal(await page.locator('[data-action="confirmLoadout"]').isDisabled(),false);
  await page.locator('[data-action="confirmLoadout"]').click();
  await page.waitForSelector('body[data-screen="tutorial"]',{timeout:60000});
  const scene=await page.evaluate(()=>{
    const skater=window.streetSkate.skater;
    const camera=window.streetSkate.camera;
    window.streetSkate.setCameraMode('firstperson');
    const mode=window.streetSkate.camera;
    const foot=side=>skater.rider.bones['foot_'+side].getWorldPosition(camera.position.clone());
    const l=foot('l'),r=foot('r');
    const deckTop=skater.board.root.position.y+
      skater.board.contactRig.deckTopY-skater.board.deckHeight;
    const midpoint=l.clone().add(r).multiplyScalar(.5);
    return{
      rider:skater.rider.url,
      finishIndex:skater.board.finishIndex,
      deckTop,
      footY:[l.y,r.y],
      soleOffsets:skater.rider.soleOffsets,
      offsetXZ:Math.hypot(midpoint.x-skater.board.root.getWorldPosition(camera.position.clone()).x,
        midpoint.z-skater.board.root.getWorldPosition(camera.position.clone()).z),
      cameraVisible:skater.visual.visible,
    };
  });
  assert.match(scene.rider,/thehollowf\.glb/);
  assert.equal(scene.finishIndex,5);
  assert.ok(scene.footY.every(Number.isFinite));
  assert.ok(scene.offsetXZ<0.5,'foot midpoint misaligned with deck '+JSON.stringify(scene));
  assert.ok(scene.cameraVisible,'rider was hidden by the camera');
  assert.deepEqual(errors,[],'browser runtime errors');
  console.log('LOADOUT SMOKE PASS '+JSON.stringify(scene));
}finally{await browser.close();}
