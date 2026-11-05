import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {HighlightRecorder} from '../src/game/HighlightRecorder.js';
import {HighlightPlayback} from '../src/game/HighlightPlayback.js';
import {GameShell} from '../src/game/GameShell.js';

function recording(){
 const skater={root:new THREE.Group(),score:123},recorder=new HighlightRecorder();recorder.reset(skater);
 for(let frame=1;frame<=180;frame++){
  recorder.record(skater,1/30);
  if(frame===30)recorder.markEvent({kind:'pop',point:[0,1,0]});
  if(frame===60)recorder.markEvent({kind:'landing',point:[0,0,0]});
 }
 recorder.markMoment({start:1,end:2,points:100});return {skater,recorder,clips:recorder.finish()};
}

for(const destination of ['results','pause','title'])test(`leaving highlights for ${destination} stops future contact callbacks`,()=>{
 const {skater,clips}=recording(),heard=[];let silenced=0;
 const playback=new HighlightPlayback({camera:new THREE.PerspectiveCamera(),onEvent:event=>heard.push(event.kind)});
 const shell=Object.create(GameShell.prototype);Object.assign(shell,{phase:'highlights',render(){},actions:{stopHighlights(){playback.stop();silenced++;}}});
 playback.start(clips);playback.update(1.1);assert.deepEqual(heard,['pop']);
 shell.setScreen(destination);assert.equal(silenced,1);assert.equal(playback.active,false);
 playback.update(60);assert.deepEqual(heard,['pop']);assert.equal(skater.score,123);
});

test('natural completion stops presentation on results and replaying restarts the event cursor exactly once',()=>{
 const {clips}=recording(),heard=[];let silenced=0;
 const shell=Object.create(GameShell.prototype),playback=new HighlightPlayback({camera:new THREE.PerspectiveCamera(),onEvent:e=>heard.push(e.kind),onFinish:()=>shell.showResults()});
 Object.assign(shell,{phase:'highlights',render(){},actions:{stopHighlights(){playback.stop();silenced++;}}});
 playback.start(clips);playback.update(60);assert.equal(shell.phase,'results');assert.equal(silenced,1);assert.deepEqual(heard,['pop','landing']);
 playback.update(60);assert.equal(heard.length,2);
 shell.phase='highlights';playback.start(clips);playback.update(60);assert.deepEqual(heard,['pop','landing','pop','landing']);assert.equal(silenced,2);
});

test('recorder reset drops prior contact events and sealed footage rejects new contacts',()=>{
 const {skater,recorder}=recording();assert.equal(recorder.markEvent({kind:'pop'}),false);
 recorder.reset(skater);assert.equal(recorder.events.length,0);
 for(let i=0;i<90;i++)recorder.record(skater,1/30);
 recorder.markMoment({start:1,end:2,points:100});assert.deepEqual(recorder.finish()[0].events,[]);
});
