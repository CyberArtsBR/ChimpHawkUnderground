import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {loadGeometry} from '../tools/load-geometry.mjs';
import {assembleTestMap,inspectTestMap} from '../src/game/TestMapLoader.js';
import {configureSkateParadise} from '../src/park/SkateParadise.js';
import {prepareParkRuntime,disposeParkWorld} from '../src/game/ParkRegistry.js';
import {LOCATIONS} from '../src/game/LoadoutCatalog.js';

test('bundled Map 1 has a playable plaza spawn and preserves authored ramp transitions',async()=>{
  const file='public/assets/park/skate-paradise.glb';
  assert.ok(inspectTestMap(readFileSync(file)).triangles>100000);
  const root=await loadGeometry(file);
  root.traverse(o=>{
    if(o.userData.streetSkateMap){
      const data=JSON.parse(o.userData.streetSkateMap);
      data.presentation.environmentFromSky=false;
      o.userData.streetSkateMap=JSON.stringify(data);
    }
  });
  const world=configureSkateParadise(assembleTestMap(root));
  try {
    const runtime=prepareParkRuntime(world);
    assert.equal(world.id,'skate-paradise');
    assert.equal(world.manifest.name,'Skate Paradise');
    assert.deepEqual(runtime.spawn.toArray(),[27,.4605,-75]);
    assert.equal(runtime.railNetwork.rails.length,44);
    assert.equal(runtime.coreController.transitions.transitions.length,25);
    assert.equal(LOCATIONS[0].id,'skate-paradise');
    assert.equal(LOCATIONS[0].number,1);
    assert.equal(world.manifest.spots[0].id,'entrance');
  } finally {disposeParkWorld(world);}
});
