import test from 'node:test';
import assert from 'node:assert/strict';
import { chooseOnlinePartyEntry } from '../src/portals/OnlinePartyEntry.js';
test('managed lobby takes precedence over URL channels',()=>{
 assert.deepEqual({...chooseOnlinePartyEntry({match:{managed:true,visibility:'public'},channel:'other'})},{kind:'managed',privateRoom:false});
});
test('private lobby keeps private visibility',()=>{
 assert.equal(chooseOnlinePartyEntry({match:{managed:true,visibility:'private'}}).privateRoom,true);
});
test('Portals Party Join Game URL uses the existing top-level bucket',()=>{
 assert.equal(chooseOnlinePartyEntry({channel:'party-s7H2'}).kind,'party');
});
test('existing invite code is still supported',()=>{
 const p=chooseOnlinePartyEntry({invite:'ch23456789'});
 assert.equal(p.kind,'invite');assert.equal(p.code,'CH23456789');
});
test('normal solo launch does not autojoin multiplayer',()=>{
 assert.equal(chooseOnlinePartyEntry({}).kind,'manual');
 assert.equal(chooseOnlinePartyEntry({channel:'invalid link?'}).kind,'manual');
});
