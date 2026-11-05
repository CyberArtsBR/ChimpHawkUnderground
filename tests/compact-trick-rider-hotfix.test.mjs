import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import { boundedNeutralHandTarget } from '../src/character/SkatePoseConstraints.js';

const vec = (x,y,z) => new THREE.Vector3(x,y,z);

test('neutral wrist target stays inside compact Chimpions arm reach', () => {
  const shoulder = vec(0,1,0);
  const oldAdultTarget = vec(-.25,.56,.11);
  const compact = boundedNeutralHandTarget(shoulder, oldAdultTarget, .31);
  assert.ok(compact.distanceTo(shoulder) <= .31*.84+1e-5);
  assert.ok(compact.distanceTo(shoulder) > .2);
  assert.deepEqual(shoulder.toArray(), [0,1,0]);
  const tall = boundedNeutralHandTarget(shoulder,oldAdultTarget,.95);
  assert.ok(tall.distanceTo(oldAdultTarget) < 1e-8, 'normal limb can keep authored target');
});

test('invalid arm lengths leave neutral target unchanged, never NaN', () => {
  const target = vec(.23,.8,.12);
  for (const length of [NaN,0,-1]) {
    const actual = boundedNeutralHandTarget(vec(0,1,0),target,length);
    assert.deepEqual(actual.toArray(), target.toArray());
    assert.notEqual(actual,target);
  }
});

test('rider posture derives wrist and elbow placement from measured arm chain',()=>{
  const src=readFileSync(new URL('../src/character/UnrealRider.js', import.meta.url), 'utf8');
  assert.match(src,/boundedNeutralHandTarget\(/);
  assert.match(src,/shoulderWorld\.distanceTo\(elbowWorld\) \+ elbowWorld\.distanceTo\(wristWorld\)/);
  assert.match(src,/Math\.min\(\.24, armLength \* \.42\)/);
});

test('trick announcements stay compact, colorful and readable',()=>{
  const css=readFileSync(new URL('../src/game-shell.css', import.meta.url), 'utf8');
  const main=readFileSync(new URL('../src/game-main.js', import.meta.url), 'utf8');
  assert.match(css,/font: 400 clamp\(20px, 2\.5vw, 39px\)/);
  assert.match(css,/#trick-feedback::after/);
  assert.match(css,/-webkit-text-stroke: \.95px/);
  assert.match(css,/-webkit-text-fill-color: var\(--graffiti-mid\)/);
  assert.match(main,/trickNode\.dataset\.graffitiText = trickLabel/);
  // The previous oversized rule remains higher in the stylesheet; only the
  // last winning CSS declaration affects the browser.
  const appliedHotfix = css.slice(css.lastIndexOf('/* HOTFIX — 2026-10-10:'));
  assert.match(appliedHotfix,/font: 400 clamp\(20px, 2\.5vw, 39px\)/);
  assert.doesNotMatch(appliedHotfix,/font:[^;]*77px/);
});
