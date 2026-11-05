import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {SkillStreetPhysics} from '../src/game/SkillStreetPhysics.js';
import {RailNetwork} from '../src/game/RailNetwork.js';
test('captured grind ignores support displacement until rail end or requested jump',()=>{
 const network=new RailNetwork([{points:[[0,1,0],[0,1,-1000]]}]);
 const s=Object.create(SkillStreetPhysics.prototype);
 Object.assign(s,{railNetwork:network,position:new THREE.Vector3(),velocity:new THREE.Vector3(),heading:0,distance:0,bailTime:0,
  grind:{rail:network.rails[0],s:1,direction:1,speed:5,contactClearance:.03,contactClearanceTarget:.03,blendElapsed:1,blendDuration:.1},
  updateGrindBalance(){return true;},bodyUp(){return new THREE.Vector3(0,1,0);},airDirection(){},
  resolveMotion(){this.position.x+=.3;},exitGrind(pop){this.exit=pop;this.grind=null;}});
 for(let i=0;i<1200;i++)s.stepGrind(1/120,{});
 assert.ok(s.grind,'support corrections cannot force exit after ten seconds');assert.equal(s.position.x,0);
 const retained=s.grind;s.stepGrind(1/120,{ollieReleased:true});assert.equal(s.grind,null);assert.equal(s.exit,true);
 s.grind=retained;s.grind.s=network.rails[0].length+.1;s.stepGrind(1/120,{});assert.equal(s.grind,null);assert.equal(s.exit,false);
});
