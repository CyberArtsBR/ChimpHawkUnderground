import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { loadSkateFoley, SKATE_FOLEY_FILES } from '../src/game/SkateFoley.js';

test('all four recording files exist, are small, and contain the expected audio formats',async()=>{
  for(const [kind,url] of Object.entries(SKATE_FOLEY_FILES)){
    const bytes=await readFile(`public${url}`);
    assert.ok(bytes.length>3000 && bytes.length<200000,kind);
    assert.equal(bytes.subarray(0,4).toString(),kind==='bail'?'OggS':'RIFF',kind);
  }
});

test('each recording loads independently and a missing or invalid clip preserves fallback',async()=>{
  const accepted=[];const context={async decodeAudioData(bytes){return {duration:new Uint8Array(bytes)[0]===1?.25:0}}};
  const fetcher=async path=>path.includes('land.wav')?{ok:false}: {ok:true,arrayBuffer:async()=>new Uint8Array([path.includes('bail')?0:1]).buffer};
  const results=await loadSkateFoley(context,(kind)=>accepted.push(kind),{fetcher,assetUrl:x=>x});
  assert.deepEqual(accepted.sort(),['pop','roll']);
  assert.equal(results.filter(r=>r.status==='fulfilled').length,2);
  assert.equal(results.filter(r=>r.status==='rejected').length,2);
});
