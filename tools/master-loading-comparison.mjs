import {mkdir,writeFile} from 'node:fs/promises';import {launchAuditBrowser} from './quality-browser-runtime.mjs';
const out='artifacts/master-upgrade/asset-loading',b=await launchAuditBrowser(),report={samples:[],errors:[],network:'Chrome simulated 40 Mbps down, 20 ms latency',method:'cold isolated contexts; world readiness includes decompression, parsing, collision and setup; one sample per case'};await mkdir(out,{recursive:true});
try{for(const delivery of ['optimized','original']){
 const context=await b.newContext({viewport:{width:1280,height:720}}),page=await context.newPage();page.on('pageerror',e=>report.errors.push(e.message));
 if(delivery==='original')await page.addInitScript(()=>{const real=window.fetch;window.fetch=(input,init)=>String(input instanceof Request?input.url:input).includes('.glb.gz')?Promise.resolve(new Response('',{status:404})):real(input,init);
   const imageSrc=Object.getOwnPropertyDescriptor(HTMLImageElement.prototype,'src');Object.defineProperty(HTMLImageElement.prototype,'src',{...imageSrc,set(url){imageSrc.set.call(this,String(url).replace('galaxy-4k.webp','galaxy-4k.png'));}});
 });
 const cdp=await context.newCDPSession(page);await cdp.send('Network.enable');await cdp.send('Network.emulateNetworkConditions',{offline:false,latency:20,downloadThroughput:40*1000000/8,uploadThroughput:40*1000000/8});
 await page.goto('http://127.0.0.1:5182/');await page.waitForFunction(()=>window.streetSkate?.ready,null,{timeout:120000});
 await page.locator('[data-action=practice]').click();await page.locator('[data-action=hero]').first().click();await page.locator('[data-action=board]').first().click();await page.locator('[data-action=confirmLoadout]').click();await page.locator('body[data-screen=playing]').waitFor();
 for(const map of ['grand-warehouse','orbit']){
  const result=await page.evaluate(async id=>{performance.clearResourceTimings();const begin=performance.now();await window.streetSkate.selectLocation(id);const readyMs=performance.now()-begin;
    return {map:id,readyMs,resources:performance.getEntriesByType('resource').filter(x=>/granwarehouse|orbit\.glb|galaxy-4k/.test(x.name)).map(x=>({url:x.name.split('/').slice(-1)[0],encodedBytes:x.encodedBodySize,decodedBytes:x.decodedBodySize,durationMs:x.duration}))};},map);
  report.samples.push({delivery,...result});await writeFile(`${out}/report.json`,JSON.stringify(report,null,2));console.log(JSON.stringify({delivery,...result}));
 }
 await context.close();
}report.result=report.errors.length?'FAIL':'PASS';if(report.errors.length)process.exitCode=1;
}catch(e){report.result='FAIL';report.failure=String(e.stack||e);process.exitCode=1;console.error(e)}finally{await writeFile(`${out}/report.json`,JSON.stringify(report,null,2));await b.close()}
