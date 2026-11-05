import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {GameShell} from '../src/game/GameShell.js';
import {HighlightRecorder} from '../src/game/HighlightRecorder.js';
import {HighlightPlayback} from '../src/game/HighlightPlayback.js';
import {SkateEffects} from '../src/graphics/SkateEffects.js';

test('cancel selection restores caller and choices without resetting paused session',()=>{
  for(const phase of ['title','options','pause']){
    const shell=Object.create(GameShell.prototype);
    Object.assign(shell,{ready:true,phase,selection:3,heroIndex:1,boardIndex:2,locationIndex:2,finishIndex:2,
      heroConfirmed:true,boardConfirmed:true,remaining:37,practice:false,runSummary:{totalScore:450},
      setScreen(value){this.phase=value;this.selection=0;},focusSelection(){}});
    const summary=shell.runSummary;
    shell.begin(true);shell.heroIndex=4;shell.boardIndex=0;shell.locationIndex=1;shell.back();
    assert.equal(shell.phase,phase);assert.equal(shell.selection,3);
    assert.equal(shell.heroIndex,1);assert.equal(shell.boardIndex,2);assert.equal(shell.locationIndex,2);
    assert.equal(shell.remaining,37);assert.equal(shell.practice,false);assert.equal(shell.runSummary,summary);
    assert.equal(shell.pendingMode,null);
  }
});

test('replay effects follow source time across speed and event boundaries and reset on cuts',()=>{
  const root=new THREE.Group(),tape=new HighlightRecorder();tape.reset({root});
  for(let i=0;i<300;i++){tape.record({root},1/30);if(i===44)tape.markEvent({kind:'landing',point:[1,2,3],normal:[0,1,0],surface:'metal'});}
  tape.markMoment({start:1,end:2,points:100});
  const clips=tape.finish(),ages=[];let age=0,total=0,stops=0;
  const playback=new HighlightPlayback({camera:new THREE.PerspectiveCamera(),
    onAdvance:dt=>{age+=dt;total+=dt;},onEvent:()=>{ages.push(age);age=0;},onStop:()=>stops++});
  playback.start(clips);playback.update(3);
  assert.ok(Math.abs(total-1.9)<1e-7);assert.ok(Math.abs(ages[0]-1.5)<1e-7);
  assert.ok(Math.abs(age-.4)<1e-7);playback.stop();assert.equal(stops,1);
});

test('recorded context is an immutable copy and replay age does not drop long-frame time',()=>{
  const root=new THREE.Group(),tape=new HighlightRecorder();tape.reset({root});
  const point=[1,2,3];tape.markEvent({kind:'bail',point,normal:[0,1,0],mapId:'orbit',surface:'metal'});
  point[0]=99;assert.equal(tape.events[0].point[0],1);assert.ok(Object.isFrozen(tape.events[0]));
  const effects=new SkateEffects();let elapsed=0;effects.bailLiquid.update=dt=>{elapsed+=dt;};
  effects.updateReplay(.45);assert.ok(Math.abs(elapsed-.45)<1e-9);effects.dispose();
});
