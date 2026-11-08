import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { AudioReactions, pickNonRepeating } from '../src/game/AudioReactions.js';
import { SKATE_FOLEY_BANKS, loadSkateFoleyBanks, seamlessFoleyLoop } from '../src/game/SkateFoley.js';
import { SkateAudio } from '../src/game/SkateAudio.js';
import { readAudioVolume, saveAudioVolume } from '../src/game/AudioSettings.js';

test('accepted combo IDs, score bands, cooldown and empty ORBIT constrain applause', () => {
  const rules = new AudioReactions();
  assert.equal(rules.combo({id:1,points:50},0),null);
  assert.equal(rules.combo({id:2,points:400},0).kind,'crowdSubdued');
  assert.equal(rules.combo({id:3,points:4000},1),null);
  assert.equal(rules.combo({id:3,points:4000},12),null,'a suppressed ID stays consumed');
  assert.equal(rules.combo({id:4,points:1500,personalBest:true},12).exceptional,true);
  assert.equal(rules.combo({id:5,points:9000,location:'orbit'},24),null);
  assert.equal(rules.combo({id:6,points:3000},24).kind,'crowdExceptional');
  assert.equal(rules.combo({id:7,points:Infinity},36),null);
});

test('pain requires substantial physical contact and effort has a separate cooldown', () => {
  const rules = new AudioReactions();
  assert.equal(rules.contact(2,0),false); assert.equal(rules.effort(10,0),true);
  assert.equal(rules.contact(5,.3),true,'loss grunt must not suppress real contact pain');
  assert.equal(rules.contact(8,1),false); assert.equal(rules.effort(10,4),false);
  assert.equal(rules.contact(8,4),true);
});

test('selection never immediately repeats an actual recording', () => {
  const samples=[{}, {}, {}]; let previous;
  for(let i=0;i<30;i++){const chosen=pickNonRepeating(samples,previous,()=>.4);assert.notEqual(chosen,previous);previous=chosen;}
  assert.equal(pickNonRepeating([],null),null);
});

test('banks decode shared URLs once and a missing file does not silence other banks', async () => {
  const seen=[],clips=[]; let decoded=0;
  const result=await loadSkateFoleyBanks({decodeAudioData:async()=>({duration:.4,id:++decoded})},(kind,buffer)=>clips.push([kind,buffer]),{
    assetUrl:path=>path, fetcher:async path=>{seen.push(path);return{ok:!path.includes('pain-2'),arrayBuffer:async()=>new ArrayBuffer(1)};},
  });
  assert.equal(seen.length,new Set(Object.values(SKATE_FOLEY_BANKS).flat()).size);
  assert.equal(result.filter(x=>x.status==='rejected').length,1);
  assert.ok(clips.some(([kind])=>kind==='crowdExceptional')); assert.ok(clips.some(([kind])=>kind==='voicePain'));
});

test('crowd and voice settings persist independently and muted reactions never request ducking', () => {
  const old=globalThis.localStorage, storage=new Map();
  globalThis.localStorage={getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,value)};
  try {
    saveAudioVolume('crowd',0);saveAudioVolume('voice',.6);
    assert.equal(readAudioVolume('effects'),.45);assert.equal(readAudioVolume('crowd'),0);assert.equal(readAudioVolume('voice'),.6);
    const audio=new SkateAudio();audio.context={state:'running',currentTime:1};audio.crowd={gain:{setTargetAtTime(){}}};audio.banks.crowdExceptional=[{duration:2}];
    assert.equal(audio.onComboSettled({id:'accepted',points:4000}),false);assert.equal(audio.voices.size,0);
    audio.setCrowdVolume(.5);assert.equal(readAudioVolume('voice'),.6);
  } finally {globalThis.localStorage=old;}
});

test('field-recording loop has finite bounded samples and removes hard endpoint jump', () => {
  const source=Float32Array.from({length:1000},(_,i)=>i/1000),input={sampleRate:1000,length:1000,numberOfChannels:1,getChannelData:()=>source};
  const context={createBuffer(_channels,length,sampleRate){const data=new Float32Array(length);return{sampleRate,getChannelData:()=>data};}};
  const loop=seamlessFoleyLoop(context,input).getChannelData(0);
  assert.equal(loop.length,960);assert.ok(loop.every(value=>Number.isFinite(value)&&Math.abs(value)<=1));
  assert.ok(Math.abs(loop[0]-loop.at(-1))<.01);
});


test('active skate bank uses real skateboard takes and excludes rejected cheer and generic pop/body replacements',()=>{
  for(const kind of ['pop','landing'])assert.equal(SKATE_FOLEY_BANKS[kind].length,3);
  assert.ok(SKATE_FOLEY_BANKS.pop.includes('/audio/foley/pop.wav'));
  assert.ok(SKATE_FOLEY_BANKS.landing.includes('/audio/foley/land.wav'));
  assert.deepEqual(SKATE_FOLEY_BANKS.bail,['/audio/foley/bail.ogg']);
  assert.ok(SKATE_FOLEY_BANKS.catch.every(path=>path.includes('catch-skate')));
  assert.ok(SKATE_FOLEY_BANKS.scrapeMetal.every(path=>path.includes('scrape-skate')));
  const paths=Object.values(SKATE_FOLEY_BANKS).flat().join(' ');
  assert.doesNotMatch(paths,/crowd-cheer|pop-alt|bail-alt|scrape-concrete/);
  for(const name of ['land-skate-1.wav','land-skate-2.wav','pop-skate-1.wav','pop-skate-2.wav']){
    const wav=readFileSync(new URL('../public/audio/foley/'+name,import.meta.url));assert.equal(wav.toString('ascii',0,4),'RIFF');assert.equal(wav.readUInt32LE(24),44100);
    let peak=0;for(let i=44;i<wav.length;i+=2)peak=Math.max(peak,Math.abs(wav.readInt16LE(i))/32768);assert.ok(peak>.3&&peak<=.701,'level-matched real transient');
  }
});

test('location ambience reuses a bounded loop, returns after an unknown park and pauses with effects',()=>{
  const audio=new SkateAudio(),parameter=()=>({setTargetAtTime(){},setValueAtTime(){},linearRampToValueAtTime(){}});let created=0;
  audio.context={currentTime:1,createGain:()=>({gain:parameter(),connect(){},disconnect(){}}),createBufferSource(){created++;return{connect(){},start(){},stop(){},disconnect(){},playbackRate:parameter()};}};
  audio.ambience={gain:{gain:parameter()},filter:{frequency:parameter()},source:{stop(){},disconnect(){}}};
  audio.banks.ambienceWarehouse=[{duration:12}];audio.banks.ambienceParadise=[{duration:16}];
  audio.setLocation('grand-warehouse');assert.equal(created,1);assert.equal(audio.ambience.recorded,true);
  audio.setLocation('orbit');assert.equal(created,1,'same source, different filtered presentation');
  audio.setLocation('unknown');assert.equal(audio.ambience.recorded,false);
  audio.setLocation('orbit');assert.equal(audio.ambience.recorded,true);
  audio.setLocation('skate-paradise');assert.equal(created,2);
  assert.doesNotThrow(()=>audio.silence());
});
