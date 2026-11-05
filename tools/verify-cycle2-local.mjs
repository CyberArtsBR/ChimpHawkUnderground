import assert from 'node:assert/strict';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { launchAuditBrowser } from './quality-browser-runtime.mjs';

const out='artifacts/evolution-cycle2/local';await mkdir(out,{recursive:true});
const report={errors:[],httpErrors:[],maps:[]},browser=await launchAuditBrowser();
try{
 const page=await browser.newPage({viewport:{width:1920,height:1080}});
 page.on('pageerror',e=>report.errors.push(e.message));
 page.on('response',r=>{if(r.status()>=400)report.httpErrors.push(r.url());});
 await page.addInitScript(()=>localStorage.setItem('streetskate.playerPreferences.v1',JSON.stringify({performance:true})));
 await page.goto(process.env.STREETSKATE_URL||'http://127.0.0.1:5185/');
 await page.waitForFunction(()=>window.streetSkate?.ready,null,{timeout:120000});
 report.entry=await page.locator('script[src]').evaluateAll(es=>es.map(e=>e.src));
 await page.locator('[data-action="practice"]').click();
 await page.locator('[data-action="hero"][data-index="0"]').click();
 await page.locator('[data-action="board"][data-index="6"]').click();
 await page.evaluate(()=>{
  const gl=window.streetSkate.renderer.getContext(),original=gl.getProgramInfoLog;
  window.shaderProbe={logs:[]};gl.getProgramInfoLog=function(...args){const start=performance.now(),result=original.apply(this,args);
   const entry=window.streetSkate.renderer.info.programs.find(program=>program.program===args[0]);
   window.shaderProbe.logs.push({ms:performance.now()-start,phase:document.body.dataset.screen,name:entry?.name,cacheKey:entry?.cacheKey});return result;};
 });
 await page.locator('[data-action="confirmLoadout"]').click();
 await page.locator('body[data-screen="playing"]').waitFor({timeout:120000});
 await page.waitForTimeout(500);
 report.firstUse=await page.evaluate(()=>window.shaderProbe.logs.slice());
 assert.ok(report.firstUse.some(log=>log.phase==='select'),'first composed shader use occurs before loadout completes');
 assert.equal(report.firstUse.filter(log=>log.phase==='playing').length,0,'initial playable frames have no deferred program-log stalls');
 report.metrics=await page.evaluate(async()=>{
  const g=window.streetSkate,serials=[];
  for(let i=0;i<60;i++){await new Promise(requestAnimationFrame);serials.push(g.performanceMetrics().gpuSampleSerial);}
  return{...g.performanceMetrics(),serials,quality:g.graphicsStatus()};
 });
 if(report.metrics.gpuSupported)assert.ok(report.metrics.gpuSampleSerial>0);
 assert.equal(report.metrics.cpuSubmitScope,'graphicsPipeline.render');
 assert.equal(report.metrics.quality.bloomEnabled,true);assert.equal(report.metrics.quality.postProcessingAvailable,true);
 assert.deepEqual(report.metrics.quality.glowTuning,{emissive:1.5,bloom:1.09,glow:.1,radius:.11});
 await page.keyboard.down('Space');await page.waitForTimeout(250);await page.keyboard.up('Space');await page.waitForTimeout(120);
 await page.keyboard.down('ArrowRight');await page.waitForTimeout(400);await page.screenshot({path:`${out}/live-grab.png`});
 await page.keyboard.up('ArrowRight');await page.waitForTimeout(1000);
 report.grab=await page.evaluate(()=>({position:window.streetSkate.skater.position.toArray(),score:window.streetSkate.skater.score}));
 assert.ok(report.grab.position.every(Number.isFinite));
 for(const id of ['orbit','grand-warehouse']){
  await page.evaluate(async id=>{await window.streetSkate.selectLocation(id);window.streetSkate.setPaused(false);},id);
  await page.waitForTimeout(150);await page.screenshot({path:`${out}/${id}.png`});
  report.maps.push(await page.evaluate(()=>({id:window.streetSkate.currentLocation,position:window.streetSkate.skater.position.toArray()})));
 }
 assert.ok(report.maps.every(map=>map.position.every(Number.isFinite)));
 // A blocked paused task must not consume READY or advance the new round.
 // This is a brief explicit timing fixture, not another full timed session.
 await page.keyboard.press('Escape');await page.locator('[data-action="title"]').click();
 await page.locator('[data-action="start"]').click();
 await page.locator('[data-action="hero"][data-index="0"]').click();
 await page.locator('[data-action="board"][data-index="6"]').click();
 await page.locator('[data-action="confirmLoadout"]').click();
 await page.waitForFunction(()=>document.querySelector('.round-cue')?.dataset.phase==='ready');
 await page.evaluate(()=>{
  window.streetSkate.setPaused(true);
  const start=performance.now();while(performance.now()-start<1300){}
  window.streetSkate.setPaused(false);
 });
 await page.waitForTimeout(100);
 report.readyAfterPausedWork=await page.locator('.round-cue').getAttribute('data-phase');
 assert.equal(report.readyAfterPausedWork,'ready','paused work must not be charged to the next ready frame');
 const before=JSON.parse(await readFile('artifacts/evolution-cycle2-performance/shader-first-use/before.json','utf8'));
 const totals=logs=>logs.reduce((out,log)=>{const value=out[log.phase]??={calls:0,ms:0};value.calls++;value.ms+=log.ms;return out},{});
 report.shaderComparison={before:totals(before.logs),after:totals(report.firstUse),note:'First-use diagnostics moved into loadout; these are individual cold runs, not steady-state FPS benchmarks.'};
 assert.deepEqual(report.errors,[]);assert.deepEqual(report.httpErrors,[]);report.result='PASS';
 console.log(JSON.stringify({result:report.result,shaderComparison:report.shaderComparison,gpuSampleSerial:report.metrics.gpuSampleSerial,errors:report.errors}));
}catch(error){report.failure=error.stack;console.error(error);process.exitCode=1;}
finally{await writeFile(`${out}/report.json`,JSON.stringify(report,null,2));await browser.close();}
