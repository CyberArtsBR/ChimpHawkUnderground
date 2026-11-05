import { launchAuditBrowser } from './quality-browser-runtime.mjs';
import { mkdir,writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const out='artifacts/master-upgrade/flip-sync',b=await launchAuditBrowser(),p=await b.newPage({viewport:{width:1280,height:720}}),errors=[],clips=[];
p.on('pageerror',e=>errors.push(e.message));await mkdir(out,{recursive:true});
try{
 await p.goto('http://127.0.0.1:5182/');await p.waitForFunction(()=>window.streetSkate?.ready,null,{timeout:90000});await p.locator('[data-action=tutorial]').click();
 for(const [i,name] of [[8,'360-flip'],[9,'laser-flip'],[10,'double-kickflip'],[11,'double-heelflip']]){
   await p.locator(`[data-action=flipLesson][data-index="${i}"]`).click();
   const v=p.locator('video');await p.waitForFunction(()=>{const v=document.querySelector('video');return v?.readyState>=2&&Number.isFinite(v.duration)},null,{timeout:30000});
   const duration=await v.evaluate(v=>v.duration);assert.ok(duration>3.1&&duration<3.3,`${name}: ${duration}`);
   const probes=[];for(const [time,active] of [[1.19,true],[1.27,false],[1.35,true],[1.5,false]]){
     await v.evaluate((v,t)=>{v.pause();v.currentTime=t},time);await p.waitForFunction(({active})=>document.querySelector('[data-pad=flip]').classList.contains('is-active')===active,{active},{timeout:3000});
     probes.push({time,active});
   }
   await p.screenshot({path:`${out}/${name}.png`});clips.push({name,duration,probes});
 }
 assert.deepEqual(errors,[]);console.log(JSON.stringify({result:'PASS',clips,errors}));await writeFile(`${out}/advanced-verified.json`,JSON.stringify({result:'PASS',clips,errors},null,2));
}finally{await b.close()}
