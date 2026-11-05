import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { ParkCollision } from '../src/game/ParkCollision.js';
import { fitGraffitiHud } from '../src/game/GraffitiHudLayout.js';

function verticalPanel(surface, transitionSkin) {
  const mesh = new THREE.Mesh(
    new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-2,0,0), new THREE.Vector3(2,0,0), new THREE.Vector3(-2,2,0),
      new THREE.Vector3(2,0,0), new THREE.Vector3(2,2,0), new THREE.Vector3(-2,2,0),
    ]),
    new THREE.MeshBasicMaterial({side:THREE.DoubleSide}),
  );
  mesh.userData.surface = surface;
  mesh.userData.transitionSkin = transitionSkin;
  const root = new THREE.Group(); root.add(mesh);
  return new ParkCollision(root);
}

test('nose/tail sweep and wallride probes never treat a rideable steep ramp as a structural wall', () => {
  const rideable = verticalPanel('rideable',true);
  const from = new THREE.Vector3(0,0.9,-0.65);
  const to = new THREE.Vector3(0,0.9,0.65);
  const point = new THREE.Vector3(), normal = new THREE.Vector3();
  assert.equal(rideable.solidMeshes.length, 0, 'rideable ramp included in solid probes');
  assert.equal(rideable.ridingMeshes.length, 1, 'rideable contact lost');
  assert.equal(rideable.sweepSolidSphere(from,to,0.08,point,normal),null,
    'skateboard nose blocks against a quarter pipe skin');
  assert.equal(rideable.wallContact(new THREE.Vector3(0,0,0.15),new THREE.Vector3(0,0,1),0.6),null,
    'ramp triggered an unintended wallride');
});

test('reversed winding on a steep authored corner remains a riding skin, not a capsule or sphere wall', () => {
  const mesh = new THREE.Mesh(
    new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-2,0,-.08),new THREE.Vector3(2,0,-.08),new THREE.Vector3(-2,2,.08),
      new THREE.Vector3(2,0,-.08),new THREE.Vector3(2,2,.08),new THREE.Vector3(-2,2,.08),
    ]),
    new THREE.MeshBasicMaterial({side:THREE.DoubleSide}),
  );
  mesh.userData.surface='rideable';
  mesh.userData.transitionSkin=true;
  const root = new THREE.Group();root.add(mesh);
  const collision = new ParkCollision(root);
  assert.equal(collision.ridingMeshes.length,1);
  assert.equal(collision.blocks.triangles.length,0,
    'negative nearly vertical ramp winding became a phantom body wall');
  const from=new THREE.Vector3(0,0,-.7);
  const end=new THREE.Vector3(0,0,.7);
  const moved=collision.move(from,end,new THREE.Vector3(0,0,6),{grounded:false});
  assert.equal(moved.contacts.length,0,'body capsule stopped on real transition skin');
});

test('sphere-sweep fallback also ignores steep rideable facets lacking transition metadata', () => {
  // Unlabelled imported skins can still enter the body-index because they
  // look vertical. That must not resurrect a *board* stop through sphere BVH.
  const riding = verticalPanel('rideable',false);
  assert.ok(riding.blocks.triangles.length>0,'fixture must exercise BVH fallback');
  const from = new THREE.Vector3(0,.9,-.65),to = new THREE.Vector3(0,.9,.65);
  const point = new THREE.Vector3(),normal = new THREE.Vector3();
  assert.equal(riding.sweepSolidSphere(from,to,.08,point,normal),null,
    'fallback sphere sweep still blocks a riding facet');
});

test('real structural wall still stops skateboard nose/tail and remains wallride-eligible', () => {
  const solid = verticalPanel('solid',false);
  const from = new THREE.Vector3(0,0.9,-0.65);
  const to = new THREE.Vector3(0,0.9,0.65);
  const point = new THREE.Vector3(), normal = new THREE.Vector3();
  assert.equal(solid.solidMeshes.length,1);
  assert.equal(solid.ridingMeshes.length,0);
  const impact = solid.sweepSolidSphere(from,to,0.08,point,normal);
  assert.ok(impact,'genuine structural wall no longer blocks the board');
  assert.ok(impact.distance>=0 && impact.distance<=from.distanceTo(to));
});

test('gold/fire/red digit widths are measured independently and fitted inside the viewport', () => {
  for (const viewport of [320,480,720,1280,1920]) {
    const state = {value:0};
    const style = {
      setProperty(name,value){ if(name==='--letter-height')state.value=parseFloat(value); },
    };
    const words = ['INDY', 'OLLIE', '99999999999999999'].map(label=>({
      get scrollWidth(){ return label.length*0.72*state.value; },
    }));
    const node = {style,querySelectorAll(selector){assert.equal(selector,'.graffiti-word');return words;}};
    const fitted = fitGraffitiHud(node,viewport,720);
    const allowed = viewport-40;
    const largest = Math.max(...words.map(word=>word.scrollWidth));
    assert.ok(largest<=allowed-24+.1,`at width ${viewport}, digit sprites exceed safe region: ${largest}`);
    assert.ok(fitted.height>0 && fitted.height<=40);
    // Short subsequent scores recover their full size, without retaining the
    // previous long-score fit from the same node.
    words.pop();
    const short = fitGraffitiHud(node,viewport,720);
    assert.ok(short.height>=fitted.height);
  }
});

test('graffiti HUD keeps a clear top margin and only sprites render the visible score',()=>{
 const css=readFileSync('src/game-hud.css','utf8');
 assert.match(css,/top:clamp\(125px,18vh,190px\)/);
 assert.match(css,/#trick-feedback \.graffiti-word img\{[^}]*max-height:none;/);
 assert.match(css,/#trick-feedback \.graffiti-lettering\{[^}]*--letter-height:inherit/,
   'child lettering must not overwrite parent fitted sprite height');
 assert.match(css,/#trick-feedback::after\{content:none!important\}/);
 const main=readFileSync('src/game-main.js','utf8');
 assert.match(main,/scheduleTrickHudFit\(\)/);
 assert.match(main,/image\.addEventListener\('load', scheduleTrickHudFit/);
});
