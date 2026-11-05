import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {HighlightRecorder} from '../src/game/HighlightRecorder.js';
import {HighlightPlayback} from '../src/game/HighlightPlayback.js';

test('replay emits recorded contact events once without changing live score',()=>{
 const root=new THREE.Group(),skater={root,score:42};
 const tape=new HighlightRecorder();tape.reset(skater);
 for(let i=0;i<90;i++){tape.record(skater,1/30);if(i===30)tape.markEvent({kind:'pop',strength:.4});if(i===45)tape.markEvent({kind:'landing',strength:.6});}
 tape.markMoment({start:.5,end:2,points:50,label:'Ollie'});
 const events=[],playback=new HighlightPlayback({camera:new THREE.PerspectiveCamera(),onEvent:e=>events.push(e.kind)});
 assert.equal(playback.start(tape.finish()),true);
 for(let i=0;i<400&&playback.active;i++)playback.update(.02);
 assert.deepEqual(events,['pop','landing']);assert.equal(skater.score,42);
 playback.update(1);assert.equal(events.length,2);
});
