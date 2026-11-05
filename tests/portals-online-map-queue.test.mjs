import test from 'node:test';
import assert from 'node:assert/strict';
import { OnlineMapLoadQueue } from '../src/portals/OnlineMapLoadQueue.js';
const defer=()=>{
 let resolve,reject;
 const promise=new Promise((r,j)=>{resolve=r;reject=j;});
 return {promise,resolve,reject};
};
test('joining the same map twice waits for the in-flight load',async()=>{
 const gate=defer(),loads=[];
 const queue=new OnlineMapLoadQueue(async map=>{loads.push(map);if(loads.length===1)await gate.promise;});
 const first=queue.request('grand-warehouse');
 const second=queue.request('grand-warehouse');
 assert.strictEqual(first,second);
 gate.resolve();
 assert.equal(await second,true);
 assert.deepEqual(loads,['grand-warehouse','grand-warehouse']);
});
test('host map changes while assets load are processed in latest order',async()=>{
 const gate=defer(),loads=[];
 const queue=new OnlineMapLoadQueue(async map=>{loads.push(map);if(loads.length===1)await gate.promise;});
 const a=queue.request('rooftop');
 queue.request('orbit');
 const latest=queue.request('grand-warehouse');
 gate.resolve();
 assert.equal(await latest,true);
 assert.equal(await a,true);
 assert.deepEqual(loads,['rooftop','grand-warehouse'],'intermediate transient map not loaded');
});
test('leave cancels queued map changes without a second load',async()=>{
 const gate=defer(),loads=[];
 const queue=new OnlineMapLoadQueue(async map=>{loads.push(map);await gate.promise;});
 const first=queue.request('rooftop');queue.request('orbit');queue.cancel();
 gate.resolve();assert.equal(await first,false);
 assert.deepEqual(loads,['rooftop']);
 assert.equal(await queue.request('warehouse'),false);
});
test('loading failure rejects all pending callers, reset permits new session',async()=>{
 const queue=new OnlineMapLoadQueue(async()=>{throw new Error('asset unavailable')});
 await assert.rejects(queue.request('orbit'),/asset unavailable/);
 assert.equal(queue.running,null);
 const newSession=new OnlineMapLoadQueue(async()=>{});
 assert.equal(await newSession.request('grand-warehouse'),true);
});
