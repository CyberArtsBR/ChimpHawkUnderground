import{writeFile}from'node:fs/promises';
import{auditUrl,launchAuditBrowser}from'./quality-browser-runtime.mjs';
const browser=await launchAuditBrowser();
const page=await browser.newPage({viewport:{width:1280,height:720}});
try{
 await page.goto(auditUrl);await page.waitForFunction(()=>window.streetSkate?.ready,{timeout:90000});
 await page.evaluate(()=>window.streetSkate.selectLocation('grand-warehouse'));
 const results=await page.evaluate(()=>{
  const s=window.streetSkate.skater,results=[];
  window.streetSkate.setPaused(true);
  for(const angle of[0,.2,-.2,.4,-.4])for(const mode of['passive','ollie','flip','grab']){
   s.reset(s.position.clone().set(3,.1,-40.8),angle);s.velocity.copy(s.forward).multiplyScalar(17);
   let pop=false,trick=false,air=false,stall=0,worst=0,bails=0;
   for(let i=0;i<900;i++){
    const release=!pop&&s.position.y>3;if(release)pop=true;
    const doTrick=!trick&&!s.grounded&&s.velocity.y>3;
    if(doTrick)trick=true;
    s.update(1/120,{ollieHeld:mode!=='passive'&&!pop,ollieReleased:mode!=='passive'&&release,
      flipPressed:mode==='flip'&&doTrick,grabPressed:mode==='grab'&&doTrick,grabHeld:mode==='grab'&&trick},i/120);
    air ||=!s.grounded;bails +=s.bailTime>0?1:0;
    stall=!s.grounded&&!s.bailTime&&s.position.y>3&&s.velocity.length()<.5?stall+1/120:0;worst=Math.max(worst,stall);
   }
   results.push({angle,mode,air,worst,bails,position:s.position.toArray(),velocity:s.velocity.toArray(),
    normal:s.normal.toArray(),grounded:s.grounded,transition:!!s.transitionAir,
    trace:angle===0&&mode==='passive'?s.copingTrace?.snapshot():undefined});
  }
  return results;
 });
 await writeFile('artifacts/quality-pass/full-runtime.json',JSON.stringify(results,null,2));console.log(results.map(({trace,...r})=>r));
}finally{await browser.close()}
