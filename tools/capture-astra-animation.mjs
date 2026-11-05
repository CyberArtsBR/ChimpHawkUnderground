import {mkdir,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {launchAuditBrowser} from './quality-browser-runtime.mjs';
const out='artifacts/astra-implementation/animation';await mkdir(out,{recursive:true});
const report={method:'Actual GLBs/presentation, isolated review lighting. Both stances/three views. Hollow candidate is explicitly opt-in; normal Hollow remains unchanged. Not a physics certificate.',errors:[],sheets:[],clips:[]};
const browser=await launchAuditBrowser();
try {
 const page=await browser.newPage();page.on('pageerror',e=>report.errors.push(e.message));
 await page.route('**/*',async route=>{
  const pathname=decodeURIComponent(new URL(route.request().url()).pathname),local=/^\/(src|tools|node_modules)\//.test(pathname)?pathname.slice(1):`public${pathname}`,filename=path.resolve(local);
  if(!filename.startsWith(process.cwd()+path.sep))return route.abort();
  try{await route.fulfill({body:await readFile(filename),contentType:pathname.endsWith('.js')?'text/javascript':pathname.endsWith('.html')?'text/html':undefined});}catch{await route.abort();}
 });
 await page.goto('http://127.0.0.1/tools/animation-review-scene.html');await page.waitForFunction(()=>window.reviewReady,null,{timeout:90000});
 async function sheet(rider,suffix,rows){const data=await page.evaluate(spec=>window.reviewSheet(spec),{title:`ASTRA animation · ${rider} · ${suffix}`,rows});const file=`${rider}-${suffix}.png`;await writeFile(`${out}/${file}`,Buffer.from(data.split(',')[1],'base64'));report.sheets.push(file);}
 for(const rider of ['thehollowf','The_Heretic','The_AdolescentUR','The_Anchor','TuxR']){
  await page.evaluate(name=>window.reviewSwapRider(name),rider);
  await sheet(rider,'held',['Airwalk','Japan','Tailgrab','Christ Air'].map(name=>({label:name,time:.65,spec:{kind:'grab',name}})));
  await sheet(rider,'airwalk-transition',[.30,.45,.85,1.50,1.65,2.15].map(time=>({label:`Airwalk ${time}s`,time,spec:{kind:'grabTransition',name:'Airwalk'}})));
  if(['The_Heretic','The_AdolescentUR'].includes(rider)){
   const name=rider==='The_Heretic'?'Airwalk':'Japan',data=await page.evaluate(args=>window.reviewGrabRecord(args),{name,stance:-1});const file=`${rider}-${name}-switch.webm`;await writeFile(`${out}/${file}`,Buffer.from(data.split(',')[1],'base64'));report.clips.push(file);
  }
  if(rider==='thehollowf'){
   await page.evaluate(()=>window.reviewGrabContactCandidate(true));
   await sheet(rider,'OPT-IN-candidate',['Airwalk','Japan','Tailgrab','Christ Air'].map(name=>({label:name,time:.65,spec:{kind:'grab',name}})));
   await page.evaluate(()=>window.reviewGrabContactCandidate(false));
  }
 }
 report.result=report.errors.length?'ERRORS':'PASS';
}catch(error){report.failure=error.stack;report.result='INCOMPLETE';process.exitCode=1;console.error(error);}
finally{await writeFile(`${out}/report.json`,JSON.stringify(report,null,2));await browser.close();}
