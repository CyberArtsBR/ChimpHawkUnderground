import {test}from'node:test';import assert from'node:assert/strict';import{warmScenePrograms}from'../src/graphics/ShaderWarmup.js';
test('world readiness waits for shader compilation without rendering or changing the scene',async()=>{
 let done,called=false;const scene={},camera={},renderer={compileAsync(s,c){assert.equal(s,scene);assert.equal(c,camera);called=true;return new Promise(r=>done=r)}};
 let ready=false;const p=warmScenePrograms(renderer,scene,camera).then(v=>{ready=v});assert.equal(called,true);assert.equal(ready,false);done();await p;assert.equal(ready,true);assert.deepEqual(scene,{});
});
test('shader warmup fails softly for unavailable or lost contexts',async()=>{
 assert.equal(await warmScenePrograms({}, {}, {}),false);assert.equal(await warmScenePrograms({compileAsync(){throw Error('driver')}},{},{}),false);
 assert.equal(await warmScenePrograms({compileAsync(){throw Error('must not call')},getContext:()=>({isContextLost:()=>true})},{},{}),false);
});
test('actual first composed frame finishes after compile and before loadout readiness',async()=>{
 let finishCompile;const events=[];
 const renderer={compileAsync(){events.push('compile');return new Promise(resolve=>finishCompile=resolve)}};
 const ready=warmScenePrograms(renderer,{},{},{renderFirstFrame(){events.push('first composed draw')}})
   .then(result=>{events.push('ready');return result});
 assert.deepEqual(events,['compile']);
 finishCompile();assert.equal(await ready,true);
 assert.deepEqual(events,['compile','first composed draw','ready']);
});
test('cancelled loadout and context lost while compiling never draw stale content',async()=>{
 for(const lost of [false,true]){
  let finishCompile,draws=0,current=true,contextLost=false;
  const renderer={compileAsync:()=>new Promise(resolve=>finishCompile=resolve),getContext:()=>({isContextLost:()=>contextLost})};
  const ready=warmScenePrograms(renderer,{},{},{isCurrent:()=>current,renderFirstFrame(){draws++}});
  if(lost)contextLost=true;else current=false;
  finishCompile();assert.equal(await ready,false);assert.equal(draws,0);
 }
});
test('failed compilation or first draw keeps the existing soft-failure path',async()=>{
 let draws=0;
 assert.equal(await warmScenePrograms({compileAsync:async()=>{throw Error('compile failed')}},{},{},{renderFirstFrame(){draws++}}),false);
 assert.equal(draws,0);
 assert.equal(await warmScenePrograms({compileAsync:async()=>{}},{},{},{renderFirstFrame(){draws++;throw Error('draw failed')}}),false);
 assert.equal(draws,1);
});
