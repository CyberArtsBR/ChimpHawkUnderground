import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {launchAuditBrowser} from './quality-browser-runtime.mjs';
const out=process.env.AUDIO_AUDIT_OUTPUT||'artifacts/presentation-upgrade/audio';await mkdir(out,{recursive:true});
const browser=await launchAuditBrowser();
try {
  const page=await browser.newPage();
  // A text-only page avoids another WebGL workload during motion QA.
  await page.goto((process.env.STREETSKATE_URL||'http://127.0.0.1:5182/')+'tools/audio-preview.html');
  const result=await page.evaluate(async()=>{
    const [{SkateAudio},{createSkateImpact},{loadSkateFoley}]=await Promise.all([
      import('/src/game/SkateAudio.js'),import('/src/game/SkateSoundSynthesis.js'),import('/src/game/SkateFoley.js')]);
    const sampleRate=24000,duration=10,context=new OfflineAudioContext(1,sampleRate*duration,sampleRate);
    const audio=new SkateAudio();let scheduled=0;
    audio.context=new Proxy(context,{get(target,key){
      if(key==='state')return 'running';if(key==='currentTime')return scheduled;
      const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;
    }});
    audio.master=context.createGain();audio.master.gain.value=.35;
    audio.announcer=context.createGain();audio.announcer.gain.value=.45;
    audio.master.connect(context.destination);audio.announcer.connect(context.destination);
    audio.impacts=Object.fromEntries(['pop','catch','landing','grind','loss','bail'].map(kind=>[kind,createSkateImpact(context,kind)]));
    // Use the exact shipped real recordings and playback envelopes, retaining
    // the procedural fallback for any single unavailable asset.
    const decoded=await loadSkateFoley(context,(kind,buffer)=>{
      if(kind==='roll')return;
      audio.impacts[kind]=buffer;if(kind==='landing')audio.impacts.catch=buffer;
      audio.recordedFoley.add(kind);
    });
    const segments=[];
    for(const kind of ['confirm','back','ready','go','tenSeconds','finalFive','roundOver']){
      segments.push({kind,start:scheduled});audio.cue(kind);scheduled+=.65;
    }
    for(const kind of ['pop','catch','landing','grind','loss','bail']){
      segments.push({kind,start:scheduled});audio.impact(.7,false,kind);scheduled+=.65;
    }
    const buffer=await context.startRendering(),data=buffer.getChannelData(0);
    for(const segment of segments){
      const samples=data.subarray(Math.floor(segment.start*sampleRate),Math.floor((segment.start+.5)*sampleRate));
      segment.peak=Math.max(...samples.map(Math.abs));segment.rms=Math.sqrt(samples.reduce((sum,x)=>sum+x*x,0)/samples.length);
    }
    return {sampleRate,segments,samples:Array.from(data),recordings:[...audio.recordedFoley],
      decoded:decoded.map(r=>r.status),limitations:'Offline graph render verifies signal and scheduling; no physical listening or hardware latency claim.'};
  });
  const {samples,...report}=result;
  for(const segment of report.segments){assert.ok(segment.peak<1&&segment.peak>.001);assert.ok(segment.rms>.0001);}
  const wav=Buffer.alloc(44+samples.length*2);wav.write('RIFF',0);wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);
  wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(result.sampleRate,24);
  wav.writeUInt32LE(result.sampleRate*2,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(samples.length*2,40);
  samples.forEach((x,i)=>wav.writeInt16LE(Math.round(Math.max(-1,Math.min(1,x))*32767),44+i*2));
  await writeFile(`${out}/cues-and-impacts.wav`,wav);await writeFile(`${out}/report.json`,JSON.stringify(report,null,2));
  console.log(report);
} finally {await browser.close();}
