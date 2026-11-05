import {mkdir,writeFile} from 'node:fs/promises';
import {launchAuditBrowser} from './quality-browser-runtime.mjs';
const out=process.env.AUDIT_PERF_OUTPUT||'artifacts/local-update/performance';await mkdir(out,{recursive:true});
const duration=Math.max(3000,Number(process.env.AUDIT_PERF_DURATION_MS)||60000);
const browser=await launchAuditBrowser();
const page=await browser.newPage({viewport:{width:1920,height:1080}});
const report=[];
try {
  await page.goto(process.env.STREETSKATE_URL||'http://127.0.0.1:5182/');
  await page.waitForFunction(()=>window.streetSkate?.ready,null,{timeout:90000});
  await page.locator('[data-action="practice"]').click();
  await page.locator('[data-action="hero"][data-index="0"]').click();
  await page.locator('[data-action="board"][data-index="6"]').click();
  await page.locator('[data-action="confirmLoadout"]').click();
  await page.locator('body[data-screen="playing"]').waitFor({timeout:90000});
  for(const map of ['grand-warehouse','orbit','skate-paradise']){
    await page.evaluate(async id=>{await window.streetSkate.selectLocation(id);window.streetSkate.setPaused(false);},map);
    await page.waitForTimeout(3000);
    const sample=page.evaluate(async duration=>{
      const game=window.streetSkate,r=game.renderer,gl=r.getContext(),ext=gl.getExtension('WEBGL_debug_renderer_info');
      const initial=game.skater.position.toArray(),intervals=[],screenIntervals=[];let last,start,lastScreen;
      let screenFrames=0,renderCalls=0,cpuSubmitMs=0,distance=0;
      const previous=game.skater.position.clone(),originalRender=r.render;
      // Count completed render calls to the default framebuffer. Offscreen bloom
      // and post passes are excluded. This measures submission, not GPU completion.
      r.render=function(...args){
        const screen=this.getRenderTarget()===null,t=performance.now();
        const result=originalRender.apply(this,args);
        cpuSubmitMs+=performance.now()-t;renderCalls++;
        if(screen){screenFrames++;if(lastScreen!==undefined)screenIntervals.push(t-lastScreen);lastScreen=t;}
        return result;
      };
      const measuredStart=performance.now();
      try {
        await new Promise(resolve=>{function frame(now){
          distance+=previous.distanceTo(game.skater.position);previous.copy(game.skater.position);
          if(last!==undefined)intervals.push(now-last);else start=now;last=now;
          if(now-start>=duration)resolve();else requestAnimationFrame(frame);
        }requestAnimationFrame(frame)});
      }finally{r.render=originalRender;}
      const elapsed=performance.now()-measuredStart;
      screenIntervals.sort((a,b)=>a-b);
      const mean=intervals.reduce((a,b)=>a+b,0)/intervals.length;intervals.sort((a,b)=>a-b);
      return {map:game.currentLocation,initial,final:game.skater.position.toArray(),callbackFps:1000/mean,
        submittedScreenFps:screenFrames*1000/elapsed,screenFrames,renderCalls,
        screenP95:screenIntervals[Math.floor(screenIntervals.length*.95)]??null,
        screenP99:screenIntervals[Math.floor(screenIntervals.length*.99)]??null,
        meanRenderSubmissionCpuMs:cpuSubmitMs/Math.max(1,screenFrames),distance,
        elapsedMs:elapsed,measurement:'CPU screen submissions; not GPU timings or display presentation',
        p95:intervals[Math.floor(intervals.length*.95)],p99:intervals[Math.floor(intervals.length*.99)],
        samples:intervals.length,over16ms:intervals.filter(ms=>ms>16.7).length,
        gpu:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),
        canvas:[r.domElement.width,r.domElement.height],status:game.graphicsStatus()};
    },duration);
    for(let i=0;i<Math.ceil(duration/3000);i++){
      const key=i%2?'KeyA':'KeyD';await page.keyboard.down(key);await page.waitForTimeout(1200);await page.keyboard.up(key);await page.waitForTimeout(1800);
    }
    const result=await sample;report.push(result);await writeFile(`${out}/report.json`,JSON.stringify(report,null,2));
    await page.screenshot({path:`${out}/${map}.png`});console.log(`${map}: ${result.submittedScreenFps.toFixed(1)} screen submissions/s; ${result.callbackFps.toFixed(1)} callbacks/s; screen p95 ${result.screenP95?.toFixed(1)} ms`);
  }
}finally{await browser.close();}
