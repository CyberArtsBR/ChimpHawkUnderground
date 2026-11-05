import {mkdir,writeFile} from 'node:fs/promises';
import {launchAuditBrowser} from './quality-browser-runtime.mjs';
const out='artifacts/master-upgrade/performance-matrix';await mkdir(out,{recursive:true});
const browser=await launchAuditBrowser(),report={samples:[],errors:[],note:'Moving route; frame submissions and optional asynchronous GPU query, not display presentation.'};
try{
 for(const scenario of [{w:1920,h:1080,glow:true,aa:false},{w:1920,h:1080,glow:false,aa:false},{w:2560,h:1440,glow:true,aa:false},{w:2560,h:1440,glow:true,aa:true}]){
  const context=await browser.newContext({viewport:{width:scenario.w,height:scenario.h}});
  await context.addInitScript(({glow,aa})=>{
    localStorage.setItem('streetskate.bloomEnabled',glow?'on':'off');localStorage.setItem('streetskate.smoothEdges',aa?'on':'off');
    localStorage.setItem('streetskate.playerPreferences.v1',JSON.stringify({performance:true}));
  },scenario);
  const page=await context.newPage();page.on('pageerror',e=>report.errors.push(e.message));
  await page.goto('http://127.0.0.1:5182/');await page.waitForFunction(()=>window.streetSkate?.ready,null,{timeout:120000});
  await page.locator('[data-action=practice]').click();await page.locator('[data-action=hero]').first().click();await page.locator('[data-action=board][data-index="6"]').click();await page.locator('[data-action=confirmLoadout]').click();await page.locator('body[data-screen=playing]').waitFor({timeout:120000});
  for(const map of ['grand-warehouse','orbit','skate-paradise']){
    await page.evaluate(async id=>{await window.streetSkate.selectLocation(id);window.streetSkate.setPaused(false);},map);await page.waitForTimeout(3000);
    const sample=page.evaluate(async()=>{
      const g=window.streetSkate,r=g.renderer,gl=r.getContext(),ext=gl.getExtension('WEBGL_debug_renderer_info'),intervals=[],gpu=[],cpu=[],calls=[],triangles=[];
      let prev,start;await new Promise(resolve=>{function tick(now){if(prev!=null)intervals.push(now-prev);else start=now;prev=now;const x=g.performanceMetrics();
        if(Number.isFinite(x.gpuMs))gpu.push(x.gpuMs);if(Number.isFinite(x.cpuSubmitMs))cpu.push(x.cpuSubmitMs);if(Number.isFinite(x.calls))calls.push(x.calls);if(Number.isFinite(x.triangles))triangles.push(x.triangles);
        if(now-start>=10000)resolve();else requestAnimationFrame(tick)}requestAnimationFrame(tick)});
      const percentile=(a,q)=>{if(!a.length)return null;a.sort((x,y)=>x-y);return a[Math.min(a.length-1,Math.floor(a.length*q))]};
      const sum=a=>a.reduce((n,x)=>n+x,0)/Math.max(1,a.length),frames=[...intervals];
      return{map:g.currentLocation,viewport:[innerWidth,innerHeight],canvas:[r.domElement.width,r.domElement.height],
        callbackFps:1000/sum(frames),p95Ms:percentile(frames,.95),p99Ms:percentile(frames,.99),over16ms:frames.filter(x=>x>16.7).length,
        gpuTimingSupported:!!gl.getExtension('EXT_disjoint_timer_query_webgl2'),gpuTimingSamples:gpu.length,gpuP95Ms:percentile(gpu,.95),
        cpuSubmitMeanMs:sum(cpu),meanDrawCalls:sum(calls),meanTriangles:sum(triangles),memory:{geometries:r.info.memory.geometries,textures:r.info.memory.textures},
        hardware:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),quality:g.graphicsStatus()};
    });
    for(let n=0;n<4;n++){const key=n%2?'KeyA':'KeyD';await page.keyboard.down(key);await page.waitForTimeout(1100);await page.keyboard.up(key);await page.waitForTimeout(1400)}
    const data=await sample;report.samples.push({...data,scenario});console.log(JSON.stringify({map,scenario,fps:data.callbackFps,p95:data.p95Ms,gpu:data.gpuP95Ms}));
    await writeFile(`${out}/report.json`,JSON.stringify(report,null,2));
  }
  await context.close();
 }
 if(report.errors.length)throw Error(report.errors.join('; '));report.result='PASS';
} catch(e){report.result='FAIL';report.failure=String(e.stack||e);process.exitCode=1;console.error(e)}
finally{await writeFile(`${out}/report.json`,JSON.stringify(report,null,2));await browser.close()}
