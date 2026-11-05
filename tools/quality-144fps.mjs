import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {auditUrl,launchAuditBrowser} from './quality-browser-runtime.mjs';

const out=process.env.FPS_ARTIFACT_DIR||'artifacts/144fps';
await mkdir(out,{recursive:true});
const browser=await launchAuditBrowser();
const page=await browser.newPage({viewport:{width:2560,height:1440},deviceScaleFactor:2});
const report={url:auditUrl,errors:[],samples:[],checks:[]};
page.on('pageerror',error=>report.errors.push(error.message));
await page.addInitScript(()=>{
  localStorage.setItem('streetskate.graphicsPreset.v1','cinematic');
  window.testPad={connected:true,id:'144 FPS QA gamepad',index:0,mapping:'standard',axes:[0,0,0,0],
    buttons:Array.from({length:17},()=>({pressed:false,touched:false,value:0}))};
  Object.defineProperty(navigator,'getGamepads',{value:()=>[window.testPad]});
});
async function chooseQuality(index){
  await page.keyboard.press('Escape');
  await page.locator('[data-action="options"]').click();
  await page.locator('[data-action="graphicsMenu"]').click();
  await page.locator(`[data-action="graphicsSet"][data-index="${index}"]`).click();
  await page.locator('[data-action="back"]').click();
  await page.locator('[data-action="back"]').click();
  await page.locator('[data-action="resume"]').click();
}
async function sample(){
  await page.waitForTimeout(1500);
  return page.evaluate(async()=>{
    const game=window.streetSkate,r=game.renderer,gl=r.getContext();
    const debug=gl.getExtension('WEBGL_debug_renderer_info');
    let previous,start;const intervals=[];
    await new Promise(resolve=>{
      const tick=now=>{if(previous!==undefined)intervals.push(now-previous);else start=now;
        previous=now;if(now-start>=3000)resolve();else requestAnimationFrame(tick);};
      requestAnimationFrame(tick);
    });
    const mean=intervals.reduce((a,b)=>a+b,0)/intervals.length;
    intervals.sort((a,b)=>a-b);
    return {map:game.currentLocation,preset:game.graphicsStatus().name,
      fps:1000/mean,p95Ms:intervals[Math.floor(intervals.length*.95)],frames:intervals.length,
      gpu:debug?gl.getParameter(debug.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),
      canvas:[r.domElement.width,r.domElement.height],status:game.graphicsStatus(),
      position:game.skater.position.toArray()};
  });
}
try{
  await page.goto(auditUrl,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.streetSkate?.ready,null,{timeout:90000});
  assert.equal(await page.evaluate(()=>window.streetSkate.graphicsStatus().name),'high-refresh');
  report.checks.push('Existing v1 Cinematic preference upgrades to 144 FPS');
  await page.locator('[data-action="practice"]').click();
  await page.locator('[data-action="hero"][data-index="1"]').click();
  await page.locator('[data-action="board"][data-index="6"]').click();
  await page.locator('[data-action="location"][data-index="2"]').click();
  await page.locator('[data-action="confirmLoadout"]').click();
  await page.locator('body[data-screen="playing"]').waitFor({timeout:90000});
  for(const map of ['grand-warehouse','orbit','skate-paradise']){
    await page.evaluate(async id=>{
      const game=window.streetSkate;await game.selectLocation(id);game.setPaused(false);
    },map);
    const measured=await sample();report.samples.push(measured);
    assert.deepEqual(measured.canvas,[1920,1080]);
    assert.equal(measured.status.postProcessingEnabled,true);
    assert.equal(measured.status.bloomEnabled,true);
    assert.ok(measured.position.every(Number.isFinite));
    await page.screenshot({path:`${out}/${map}.png`});
    console.log(`${map}: ${measured.fps.toFixed(1)} FPS, p95 ${measured.p95Ms.toFixed(1)} ms`);
  }
  await page.keyboard.down('KeyA');
  await page.waitForFunction(()=>window.streetSkate.captureInput().steer===-1);
  await page.keyboard.up('KeyA');
  await page.evaluate(()=>window.testPad.axes[0]=1);
  await page.waitForFunction(()=>window.streetSkate.captureInput().steer===1);
  await page.evaluate(()=>{window.testPad.axes[0]=0;window.testPad.buttons[9]={pressed:true,value:1};});
  await page.locator('body[data-screen="pause"]').waitFor();
  await page.evaluate(()=>{window.testPad.buttons[9]={pressed:false,value:0};});
  await page.locator('[data-action="resume"]').click();
  report.checks.push('Keyboard steering; gamepad steering and Start pause');
  for(const [width,height,expected] of [[3840,2160,[1920,1080]],[1280,720,[1280,720]]]){
    await page.setViewportSize({width,height});
    await page.waitForTimeout(250);
    assert.deepEqual(await page.evaluate(()=>{
      const c=window.streetSkate.renderer.domElement;return[c.width,c.height];
    }),expected);
    assert.deepEqual(await page.evaluate(()=>{
      const rect=window.streetSkate.renderer.domElement.getBoundingClientRect();return[rect.width,rect.height];
    }),[width,height]);
  }
  report.checks.push('4K resize stays within 1080p budget; smaller viewport returns to native pixels');
  // A short comparison at 1080p/DPR 2 also verifies effect buffers rebuild after direct rendering.
  await page.setViewportSize({width:1920,height:1080});
  await chooseQuality(5);report.samples.push(await sample());
  assert.equal(await page.evaluate(()=>window.streetSkate.graphicsStatus().postProcessingEnabled),true);
  await chooseQuality(1);report.samples.push(await sample());
  await page.reload();
  await page.waitForFunction(()=>window.streetSkate?.ready,null,{timeout:90000});
  assert.equal(await page.evaluate(()=>window.streetSkate.graphicsStatus().name),'high-refresh');
  report.checks.push('Quality changes rebuild effects; explicit 144 FPS choice persists on reload');
  assert.deepEqual(report.errors,[]);
  report.result='PASS';
}catch(error){report.result='FAIL';report.failure=String(error.stack||error);process.exitCode=1;console.error(error);}
finally{await writeFile(`${out}/report.json`,JSON.stringify(report,null,2));await browser.close();}
