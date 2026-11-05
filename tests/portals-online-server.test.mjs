import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const text=fs.readFileSync(new URL('../public/server.js',import.meta.url),'utf8');
function harness(){
 let time=1000000,roster=[],kick=[],messages=[],states=new Map();
 const listeners={},timers=[];
 const server={
  on:(event,handler)=>{listeners[event]=handler},
  send:value=>messages.push(value),
  setState:(key,value)=>states.set(key,JSON.parse(JSON.stringify(value))),
  getState:key=>states.get(key),
  players:()=>roster,
  kick:id=>{kick.push(id);roster=roster.filter(p=>p.id!==id);listeners.playerleave?.({id})},
  setInterval:(fn,ms)=>{timers.push({fn,ms});return timers.length},
 };
 vm.runInNewContext(text,{server,Date:{now:()=>time},console});
 return{
  get state(){return states.get('server:online')},
  get kick(){return kick},
  get messages(){return messages},
  join:(id,name=id)=>{roster.push({id,playerId:null,displayName:name});listeners.playerjoin({id})},
  leave:id=>{roster=roster.filter(p=>p.id!==id);listeners.playerleave({id})},
  send:(id,payload)=>listeners.message(payload,id),
  advance:ms=>{for(let t=0;t<ms;t+=1000){time+=1000;for(const timer of timers)timer.fn()}},
 };
}
test('server.js exists in Vite public output and is the same as source',()=>{
 assert.equal(text,fs.readFileSync(new URL('../server.js',import.meta.url),'utf8'));
 assert.doesNotThrow(()=>new vm.Script(text));
});
test('first player is HOST, transfer on leave, maximum four players',()=>{
 const h=harness();for(let i=1;i<=4;i++)h.join('p'+i);
 assert.equal(h.state.host,'p1');assert.equal(h.state.participants.length,4);
 h.join('p5');assert.deepEqual(h.kick,['p5']);
 h.leave('p1');assert.equal(h.state.host,'p2');
});
test('READY requires two players and HOST starts 90-second jam',()=>{
 const h=harness();h.join('host');h.join('friend');
 h.send('host',{kind:'online:settings',mode:'jam',map:'orbit',apply:'now'});
 h.send('friend',{kind:'online:start'});assert.equal(h.state.phase,'lobby');
 h.send('host',{kind:'online:ready',ready:true});
 h.send('host',{kind:'online:start'});assert.equal(h.state.phase,'lobby');
 h.send('friend',{kind:'online:ready',ready:true});
 h.send('host',{kind:'online:start'});assert.equal(h.state.phase,'countdown');
 h.advance(3000);assert.equal(h.state.phase,'jam');
 h.send('host',{kind:'online:score',points:1200,combo:700,active:true});
 h.send('friend',{kind:'online:score',points:900,combo:900,active:false});
 h.advance(90000);assert.equal(h.state.phase,'last');
 h.send('host',{kind:'online:score',points:1500,combo:1000,active:false});
 assert.equal(h.state.phase,'results');
 assert.equal(h.state.scores[0].id,'host');
});
test('Last Trick ends by global 60-second safety cap',()=>{
 const h=harness();h.join('a');h.join('b');
 h.send('a',{kind:'online:settings',mode:'jam',apply:'now'});
 h.send('a',{kind:'online:ready',ready:true});h.send('b',{kind:'online:ready',ready:true});
 h.send('a',{kind:'online:start'});h.advance(3000);
 h.send('a',{kind:'online:score',points:1000,combo:900,active:true});
 h.advance(90000);assert.equal(h.state.phase,'last');
 h.advance(60000);assert.equal(h.state.phase,'results');
});
test('only HOST can change settings, kick only between rounds',()=>{
 const h=harness();h.join('a');h.join('b');
 h.send('b',{kind:'online:settings',map:'orbit',apply:'now'});
 assert.equal(h.state.map,'grand-warehouse');
 h.send('a',{kind:'online:settings',mode:'jam',apply:'now'});
 h.send('a',{kind:'online:ready',ready:true});h.send('b',{kind:'online:ready',ready:true});
 h.send('a',{kind:'online:start'});h.advance(3000);
 h.send('a',{kind:'online:kick',target:'b'});assert.equal(h.kick.length,0);
 h.send('a',{kind:'online:settings',map:'orbit',apply:'now'});
 assert.equal(h.state.phase,'lobby');assert.equal(h.state.map,'orbit');
 h.send('a',{kind:'online:kick',target:'b'});assert.deepEqual(h.kick,['b']);
});
