import { launchAuditBrowser } from './quality-browser-runtime.mjs';
import { mkdir,writeFile } from 'node:fs/promises';
const b=await launchAuditBrowser(),p=await b.newPage({viewport:{width:960,height:540}}),out='artifacts/master-upgrade/flip-sync';await mkdir(out,{recursive:true});
try{await p.goto('http://127.0.0.1:5182/tools/flip-demo.html');await p.waitForFunction(()=>window.demoReady,null,{timeout:90000});
const result=await p.evaluate(async()=>{
  const ref=document.querySelector('canvas'),sample=document.createElement('canvas');sample.width=192;sample.height=108;const ctx=sample.getContext('2d',{willReadFrequently:true});
  const data=()=>{ctx.drawImage(ref,0,0,192,108);return ctx.getImageData(30,10,132,80).data};
  const candidates=[];for(let i=0;i<=32;i++){const t=i/10;window.demoPose('360-flip',t);candidates.push({t,data:data()});}
  const v=document.createElement('video');v.muted=true;v.src='/media/flip-school/360-flip.webm';await new Promise((resolve,reject)=>{v.onloadeddata=resolve;v.onerror=reject;});
  const rows=[];for(const t of [.4,.7,.95,1.1,1.2,1.3,1.4,1.55,1.7,1.9,2.1,2.4,2.6]){
    v.currentTime=t;await new Promise(resolve=>v.addEventListener('seeked',resolve,{once:true}));ctx.drawImage(v,0,0,192,108);const f=ctx.getImageData(30,10,132,80).data;
    const scored=candidates.map(c=>{let error=0;for(let k=0;k<f.length;k+=4)error+=Math.abs(f[k]-c.data[k])+Math.abs(f[k+1]-c.data[k+1])+Math.abs(f[k+2]-c.data[k+2]);return {t:c.t,error};}).sort((a,b)=>a.error-b.error);
    rows.push({videoTime:t,nearestDemo:scored[0].t,error:scored[0].error,nominalError:scored.find(s=>Math.abs(s.t-t)<.051)?.error});
  }return {duration:v.duration,rows};});await writeFile(`${out}/report.json`,JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}finally{await b.close()}
