// Independent production-black-box coverage of all three locations and a simulated gamepad.
// No source imports or internal GameShell mutation: observe the shipped UI and public gameplay API.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { chromium } from '@playwright/test';
import { LOCATION_IDS } from './agent10-release-utils.mjs';

const base = process.env.STREETSKATE_URL || 'http://127.0.0.1:4173';
const out = process.env.AGENT10_ARTIFACT_DIR || 'artifacts/agent10';
await mkdir(out, { recursive: true });
const result = { url:base, checks:[], errors:[], failedRequests:[], started:new Date().toISOString() };
const localChrome = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const executablePath = process.env.STREETSKATE_BROWSER_EXECUTABLE
  || (process.platform === 'win32' && existsSync(localChrome) ? localChrome : undefined);
const browser = await chromium.launch({ headless:true, ...(executablePath ? { executablePath } : {}), args:[
  '--use-gl=swiftshader','--enable-webgl','--ignore-gpu-blocklist',
  '--disable-background-timer-throttling','--disable-renderer-backgrounding',
  '--disable-backgrounding-occluded-windows',
]});
const context = await browser.newContext({ viewport:{width:1440,height:900},deviceScaleFactor:1 });
await context.addInitScript(()=>{
  window.__agent10Pad={
    connected:true, id:'QA virtual controller',
    axes:[0,0,0,0],
    buttons:Array.from({length:17},()=>({pressed:false,touched:false,value:0})),
  };
  Object.defineProperty(navigator,'getGamepads',{
    configurable:true,value:()=>[window.__agent10Pad],
  });
});
const page = await context.newPage();
page.setDefaultTimeout(90000);
page.on('pageerror',err=>result.errors.push(String(err.stack||err)));
page.on('requestfailed',req=>{
  if(req.url().startsWith(base))result.failedRequests.push(req.url()+': '+req.failure()?.errorText);
});
async function record(name, action) {
  await action();
  result.checks.push({name,status:'PASS'});
  console.log('AGENT10 MAP QA PASS '+name);
}
async function loadedTitle() {
  await page.goto(base,{waitUntil:'domcontentloaded',timeout:45000});
  await page.waitForFunction(()=>window.streetSkate?.ready===true,null,{timeout:90000});
  await page.locator('body[data-screen="title"]').waitFor();
  assert.equal(await page.locator('#viewport canvas').count(),1);
}
// The separate browser-qa suite checks genuine Playwright pointer clicks.
 // This runner exercises the same user-facing button handlers directly to
 // isolate three-world load reliability from SwiftShader pointer-action stalls.
async function clickMenu(selector) {
  await page.locator(selector).evaluate(button=>{
    if(button.disabled)throw new Error('Required menu button disabled: '+button.dataset.action);
    button.click();
  });
}
async function chooseLocation(id) {
  await clickMenu('[data-action="start"]');
  await page.locator('body[data-screen="select"]').waitFor();
  const locations=await page.locator('.loadout-location').evaluateAll(nodes=>nodes.map(n=>n.dataset.location));
  assert.deepEqual(locations,LOCATION_IDS,'Loadout cards must exactly match shipped maps');
  assert.equal(await page.locator('.loadout-location[disabled]').count(),0);
  await clickMenu('.loadout-location[data-location="'+id+'"]');
  await clickMenu('.loadout-character[data-index="0"]');
  await clickMenu('.loadout-deck[data-index="0"]');
  const confirm=page.locator('[data-action="confirmLoadout"]');
  assert.equal(await confirm.isEnabled(),true);
  await clickMenu('[data-action="confirmLoadout"]');
  await page.locator('body[data-screen="playing"]').waitFor({timeout:90000});
  await page.waitForFunction(target=>window.streetSkate?.currentLocation===target,id,{timeout:30000});
}
async function assertLiveness(id) {
  const start=await page.evaluate(()=>window.streetSkate.renderer.info.render.frame);
  await page.waitForFunction(previous=>window.streetSkate?.renderer.info.render.frame>=previous+3,
    start,{timeout:60000});
  const state=await page.evaluate(()=>{
    const game=window.streetSkate;
    return {
      id:game.currentLocation,
      manifest:game.manifest.locationId,
      player:game.skater.position.toArray(),
      camera:game.camera.position.toArray(),
      invariantCodes:(game.skater.stateInvariantViolations||[]).map(v=>v.code),
      frames:game.renderer.info.render.frame,
      canvasCount:document.querySelectorAll('#viewport canvas').length,
      visible:!!game.park.parent,
    };
  });
  assert.equal(state.id,id);
  assert.equal(state.manifest,id);
  assert.equal(state.canvasCount,1);
  assert.equal(state.visible,true,'Active world missing from scene');
  assert.equal(state.player.length,3);
  assert.ok(state.player.every(Number.isFinite),'Player transform is not finite');
  assert.ok(state.camera.every(Number.isFinite),'Camera transform is not finite');
  assert.deepEqual(state.invariantCodes,[]);
  result.checks.push({name:'runtime '+id,status:'PASS',state});
  await page.screenshot({path:join(out,'agent10-location-'+id+'.png'),fullPage:true});
}
async function toTitle(){
  await page.keyboard.press('Escape');
  await page.locator('body[data-screen="pause"]').waitFor();
  await clickMenu('[data-action="title"]');
  await page.locator('body[data-screen="title"]').waitFor();
}
async function setButton(index,pressed){
  await page.evaluate(({index,pressed})=>{
    const button=window.__agent10Pad.buttons[index];
    button.pressed=pressed;button.touched=pressed;button.value=Number(pressed);
  },{index,pressed});
}
try{
  await record('renderer startup',loadedTitle);
  for(const id of LOCATION_IDS){
    await record('select '+id,()=>chooseLocation(id));
    await assertLiveness(id);
    await toTitle();
  }
  await record('gamepad Start/A and D-pad rider selection',async()=>{
    await page.bringToFront();
    assert.equal(await page.evaluate(()=>document.hasFocus()),true,
      'Browser must be focused for gamepad edge processing');
    // Input sampling continues each animation frame while idle menus skip rendering.
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));
    await setButton(0,true);
    try { await page.locator('body[data-screen="select"]').waitFor({timeout:30000}); }
    finally { await setButton(0,false); }
    await page.locator('.loadout-character[data-index="0"]').focus();
    const before=await page.evaluate(()=>document.activeElement?.dataset.index);
    assert.equal(before,'0');
    await setButton(15,true);
    try {
      await page.waitForFunction(()=>document.activeElement?.dataset.action==='hero'
        && document.activeElement?.dataset.index==='1',null,{timeout:30000});
    } finally { await setButton(15,false); }
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));
    await setButton(0,true);
    try { await page.locator('.loadout-character[data-index="1"].is-chosen').waitFor({timeout:30000}); }
    finally { await setButton(0,false); }
  });
  assert.deepEqual(result.errors,[],'Uncaught browser exceptions');
  assert.deepEqual(result.failedRequests,[],'Local asset request failures');
  result.status='PASS';
}catch(error){
  result.status='FAIL';
  result.error=String(error.stack||error);
  console.error('AGENT10 MAP/CONTROLLER QA FAIL',result.error);
  try{await page.screenshot({path:join(out,'agent10-location-failure.png'),fullPage:true,timeout:5000});}catch{}
  process.exitCode=1;
}finally{
  result.finished=new Date().toISOString();
  await writeFile(join(out,'location-controller.json'),JSON.stringify(result,null,2));
  await browser.close();
}
