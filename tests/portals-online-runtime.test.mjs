import test from 'node:test';
import assert from 'node:assert/strict';
import { shouldAdvancePortalsFrame as run } from '../src/portals/OnlineSimulationGate.js';
const game={loaded:true,mode:'skate',hidden:false};
test('focused solo frame behaves exactly as Render',()=>assert.equal(run({...game,focused:true,connected:false}),true));
test('unfocused solo game still pauses input/simulation',()=>assert.equal(run({...game,focused:false,connected:false}),false));
test('Portals Party runs ballistic physics when iframe loses keyboard focus',()=>assert.equal(run({...game,focused:false,connected:true}),true));
test('hidden tabs do not run rendering/simulation',()=>assert.equal(run({...game,hidden:true,focused:true,connected:true}),false));
test('loading state and explore mode do not step skater',()=>{
 assert.equal(run({...game,loaded:false,connected:true}),false);
 assert.equal(run({...game,mode:'explore',connected:true}),false);
});
