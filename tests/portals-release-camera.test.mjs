import test from 'node:test';
import assert from 'node:assert/strict';
import { GameShell } from '../src/game/GameShell.js';
import { SessionFlow } from '../src/game/SessionFlow.js';

test('starting a Portals session keeps the selected close camera and emits the start hook', () => {
  const calls=[];
  const shell=Object.create(GameShell.prototype);
  Object.assign(shell,{sessionFlow:new SessionFlow(),phase:'options',cameraIndex:1,locationIndex:0,
    music:{unlock(){}},actions:{start:practice=>calls.push(['start',practice]),
      camera:mode=>calls.push(['camera',mode]),portalsStart:(map,practice)=>calls.push(['portals',map,practice])}});
  shell.setScreen=phase=>{shell.phase=phase;};
  shell.start(true);
  assert.equal(shell.phase,'playing');
  assert.deepEqual(calls,[['start',true],['camera','follow-close'],['portals','skate-paradise',true]]);
});

test('pause opens the Portals online overlay when connected, and pauses normally offline', () => {
  const calls=[];
  const shell=Object.create(GameShell.prototype);
  shell.phase='playing';shell.setScreen=phase=>{shell.phase=phase;};
  shell.actions={portalsOnlineConnected:()=>true,portalsOnlineOpen:()=>calls.push('online'),pause:()=>calls.push('pause')};
  shell.pause();assert.equal(shell.phase,'playing');assert.deepEqual(calls,['online']);
  shell.actions.portalsOnlineConnected=()=>false;
  shell.pause();assert.equal(shell.phase,'pause');assert.deepEqual(calls,['online','pause']);
});
