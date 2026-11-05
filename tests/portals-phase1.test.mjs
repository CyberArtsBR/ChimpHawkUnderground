import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PORTALS_MAPS, PORTALS_MODES, guestName, scoreForPortals, safePreferences, PortalsGateway } from '../src/portals/PortalsGateway.js';

test('three valid separate ranking modes', () => {
  assert.deepEqual(Object.values(PORTALS_MODES), ['paradise-90s','orbit-90s','warehouse-90s']);
  assert.equal(new Set(PORTALS_MAPS.map(x => x.mode)).size, 3);
  for (const { mode } of PORTALS_MAPS) assert.match(mode, /^[a-z0-9-]{1,32}$/);
});
test('invalid scores and guest names are rejected', () => {
  assert.equal(scoreForPortals(1270.7), 1271);
  assert.equal(scoreForPortals(0), 0);
  for (const v of [NaN, Infinity, -1, 'bad', 1e22]) assert.equal(scoreForPortals(v), null);
  assert.equal(guestName(' SK8 Rider '),'SK8 Rider');
  for (const v of ['', '<script>', 'a'.repeat(25)]) assert.equal(guestName(v), '');
});
test('cloud preferences are versioned and whitelisted', () => {
  assert.equal(safePreferences(null), null);
  assert.deepEqual(safePreferences({camera:'classic',graphics:'high',masterVolume:.25,boardIndex:4,
    riderId:'heretic',locationId:'orbit',sound:false,injected:'ignore',bloomEnabled:true}), {
    camera:'classic',graphics:'high',masterVolume:.25,boardIndex:4,
    riderId:'heretic',locationId:'orbit',sound:false,bloomEnabled:true
  });
  assert.deepEqual(safePreferences({camera:'invalid',masterVolume:42,boardIndex:99}),{});
});
test('Render with no injected SDK keeps the game available', async () => {
  const gateway = new PortalsGateway(null);
  assert.equal(gateway.available,false);
  assert.equal(await gateway.connect(),false);
});
test('guest uses nickname; separate board retrieves the top ten', async () => {
  const calls = []; const sdk = {
    ready: async () => ({player:{playerId:null}}),
    getLeaderboard: async options => {calls.push(['read',options]);return {entries:[{rank:1,displayName:'SK8',score:500}]};},
    submitScore: async (...args) => {calls.push(['score',args]);},
    identity: {onChange:()=>()=>{}}
  };
  const gateway = new PortalsGateway(sdk);
  assert.equal(await gateway.connect(),true);
  await assert.rejects(gateway.submit(200,'skate-paradise'),/nickname/i);
  await gateway.submit(240.6,'orbit','SK8');
  assert.deepEqual(calls[0],['score',[241,'orbit-90s',{name:'SK8'}]]);
  assert.equal((await gateway.leaderboard('skate-paradise'))[0].displayName,'SK8');
  assert.deepEqual(calls[1],['read',{mode:'paradise-90s',limit:10}]);
  gateway.dispose();
});
test('signed-in account has cloud storage, player change and direct login', async () => {
  const calls=[]; let onChange, unsubscribed=false;
  const player={playerId:'per-game-id',displayName:'Portals Skater'};
  const sdk={
    ready:async()=>({player}),
    identity:{onChange(fn){onChange=fn;return()=>{unsubscribed=true;}},requestLogin:async()=>player},
    loadState:async()=>({schemaVersion:1,preferences:{camera:'fixed',masterVolume:.6}}),
    saveState:async state=>{calls.push(['save',state]);},
    submitScore:async(...args)=>{calls.push(['score',args]);},
    track:(event,props)=>{calls.push(['track',event,props]);}
  };
  const gateway=new PortalsGateway(sdk);
  assert.equal(await gateway.connect(),true);
  assert.deepEqual(await gateway.loadPreferences(),{camera:'fixed',masterVolume:.6});
  await gateway.savePreferences({sound:true,boardIndex:2,secret:'removed'});
  assert.deepEqual(calls[0],['save',{schemaVersion:1,preferences:{sound:true,boardIndex:2}}]);
  await gateway.submit(500,'grand-warehouse');
  assert.deepEqual(calls[1],['score',[500,'warehouse-90s',undefined]]);
  gateway.track('skate_run_complete',{map:'orbit',score:500});
  assert.equal(calls[2][1],'skate_run_complete');
  let changed=null;gateway.onIdentity=p=>{changed=p;};onChange({playerId:null});
  assert.equal(gateway.signedIn,false);assert.deepEqual(changed,{playerId:null});
  assert.equal(await gateway.savePreferences({}),false);
  assert.equal((await gateway.signIn()).playerId,'per-game-id');
  gateway.dispose();assert.equal(unsubscribed,true);
});
test('host SDK, timed result hook, and conditional ranking menu are integrated', () => {
  const main=readFileSync(new URL('../src/game-main.js',import.meta.url),'utf8');
  const shell=readFileSync(new URL('../src/game/GameShell.js',import.meta.url),'utf8');
  const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
  assert.match(html,/<script src="\.\/_portals\/sdk\.js"><\/script>/);
  assert.match(main,/new PortalsPhase1\(gameShell\)/);
  assert.match(shell,/this\.actions\.portalsFinish\?\.\(this\.runSummary/);
  assert.match(shell,/this\.actions\.portalsAvailable\?\.\(\)/);
});
