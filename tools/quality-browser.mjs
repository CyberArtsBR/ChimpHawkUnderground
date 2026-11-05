import {auditUrl,launchAuditBrowser} from './quality-browser-runtime.mjs';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const out='artifacts/quality-pass/browser';await mkdir(out,{recursive:true});
const browser=await launchAuditBrowser();
const context=await browser.newContext({viewport:{width:1280,height:720}});
const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
try{
 await page.goto(auditUrl,{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>window.streetSkate?.ready,{timeout:90000});
 await page.locator('[data-action="tutorial"]').click();
 await page.locator('[data-action="tutorialNext"]').click();
 await page.locator('[data-action="next"]').click();
 const sizes=[[1280,720],[1920,1080],[2560,1440],[1280,600]];const layouts=[];
 for(const [width,height] of sizes){
  await page.setViewportSize({width,height});
  await page.screenshot({path:`${out}/tutorial-${width}x${height}.png`});
  const layout=await page.evaluate(()=>{
   const body=document.querySelector('.tutorial-body'),frame=document.querySelector('.tutorial-frame');
   return {width:innerWidth,height:innerHeight,overflow:body.scrollWidth>body.clientWidth+1,
    font:getComputedStyle(body.querySelector('td')).fontSize,frame:frame.getBoundingClientRect().toJSON()};
  });layouts.push(layout);assert.equal(layout.overflow,false,`tutorial horizontal overflow at ${width}x${height}`);
 }
 await page.setViewportSize({width:1280,height:720});
 await page.locator('[data-action="skipTutorial"]').click();
 await page.locator('[data-action="practice"]').click();
 await page.locator('[data-action="hero"][data-index="1"]').click();
 await page.locator('[data-action="board"][data-index="6"]').click();
 await page.locator('[data-action="location"][data-index="2"]').click();
 await page.locator('[data-action="confirmLoadout"]').click();
 await page.waitForFunction(()=>document.body.dataset.screen==='playing',{timeout:90000});
 await page.waitForTimeout(300);
 await page.keyboard.press('Escape');
 await page.screenshot({path:`${out}/pause.png`});
 const maps=[],performance=[];
 for(const map of ['grand-warehouse','orbit','skate-paradise']){
  await page.evaluate(async id=>{await window.streetSkate.selectLocation(id);},map);
  const data=await page.evaluate(()=>({location:window.streetSkate.currentLocation,
    ready:window.streetSkate.ready,position:window.streetSkate.skater.position.toArray(),
    drawCalls:window.streetSkate.renderer.info.render.calls,triangles:window.streetSkate.renderer.info.render.triangles,
    rig:window.streetSkate.skater.board.contactRig}));
  maps.push(data);assert.equal(data.location,map);assert.ok(data.position.every(Number.isFinite));
  await page.evaluate(()=>window.streetSkate.setPaused(false));
  await page.waitForTimeout(200);
  await page.screenshot({path:`${out}/${map}.png`});
  for(const [preset,index]of[['performance',0],['high-refresh',1],['balanced',2],['high',3],['ultra',4],['cinematic',5]]){
   await page.keyboard.press('Escape');await page.locator('[data-action="options"]').click();
   await page.locator('[data-action="graphicsMenu"]').click();
   await page.locator(`[data-action="graphicsSet"][data-index="${index}"]`).click();
   assert.equal(await page.locator(`[data-action="graphicsSet"][data-index="${index}"]`).getAttribute('aria-pressed'),'true');
   await page.locator('[data-action="back"]').click();await page.locator('[data-action="back"]').click();
   await page.locator('[data-action="resume"]').click();await page.waitForTimeout(250);
   const sample=await page.evaluate(async()=>{
    const r=window.streetSkate.renderer,original=r.render,gl=r.getContext(),debug=gl.getExtension('WEBGL_debug_renderer_info');
    let calls=0,triangles=0,submit=0;const frames=[];
    r.render=function(...args){const start=performance.now();original.apply(this,args);submit+=performance.now()-start;
      calls+=this.info.render.calls;triangles+=this.info.render.triangles;};
    let previous=performance.now(),start=previous;
    await new Promise(resolve=>{function tick(now){frames.push({ms:now-previous,calls,triangles,submit});
      previous=now;calls=0;triangles=0;submit=0;if(now-start>1400||frames.length>=120)resolve();else requestAnimationFrame(tick)}requestAnimationFrame(tick)});
    r.render=original;const sorted=frames.map(f=>f.ms).sort((a,b)=>a-b),mean=sorted.reduce((a,b)=>a+b,0)/sorted.length;
    return{samples:frames.length,meanMs:mean,p95Ms:sorted[Math.floor(sorted.length*.95)],fps:1000/mean,
      meanDrawCalls:frames.reduce((n,f)=>n+f.calls,0)/frames.length,
      meanTriangles:frames.reduce((n,f)=>n+f.triangles,0)/frames.length,
      meanSubmitMs:frames.reduce((n,f)=>n+f.submit,0)/frames.length,
      gpu:debug?gl.getParameter(debug.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),
      shadows:window.streetSkate.scene.children.filter(o=>o.isDirectionalLight&&o.castShadow).map(o=>o.shadow.mapSize.toArray()),
      viewport:[innerWidth,innerHeight],pixelRatio:r.getPixelRatio()};
   });performance.push({map,preset,...sample});
  }
 }
 await page.keyboard.press('Escape');await page.locator('[data-action="options"]').click();
 await page.locator('[data-action="camera"]').click();const cameraLabel=await page.locator('[data-action="camera"]').textContent();
 await page.locator('[data-action="back"]').click();await page.locator('[data-action="restart"]').click();await page.keyboard.press('Escape');
 await page.locator('[data-action="options"]').click();assert.equal(await page.locator('[data-action="camera"]').textContent(),cameraLabel);
 await page.locator('[data-action="back"]').click();await page.locator('[data-action="resume"]').click();
 await page.evaluate(()=>window.dispatchEvent(new Event('blur')));
 assert.equal(await page.locator('body').getAttribute('data-screen'),'pause');
 const failurePage=await context.newPage();
 await failurePage.route('**/skate-paradise.glb*',route=>route.fulfill({status:404,body:'Missing QA asset'}));
 await failurePage.goto(auditUrl,{waitUntil:'domcontentloaded'});
 await failurePage.getByText('Unable to load the park. Reload to retry.').waitFor({timeout:60000});
 assert.equal(await failurePage.locator('[data-action="start"]').isDisabled(),true);
 await failurePage.screenshot({path:`${out}/asset-failure.png`});await failurePage.close();
 await writeFile(`${out}/report.json`,JSON.stringify({layouts,maps,performance,cameraLabel,focusPause:true,assetFailureHandled:true,errors},null,2));assert.deepEqual(errors,[]);
 console.log(JSON.stringify({layouts,performance,cameraLabel,focusPause:true,assetFailureHandled:true,errors}));
}finally{await browser.close();}
