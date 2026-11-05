import test from 'node:test';
import assert from 'node:assert/strict';
import {statSync} from 'node:fs';
import {FLIP_LESSONS,FLIP_LESSON_TIMING as T,flipLessonFrame,flipLessonSteps} from '../src/game/FlipLessons.js';
import {directionKey,flipFor} from '../src/game/TrickCatalog.js';

test('all eight unique base flips teach the actual game direction and ship playable clips',()=>{
  assert.equal(FLIP_LESSONS.length,8);
  assert.equal(new Set(FLIP_LESSONS.map(l=>l.trick.name)).size,8);
  let bytes=0;
  for(const lesson of FLIP_LESSONS){
    const direction=directionKey(lesson.x,-lesson.y);
    assert.equal(direction,lesson.direction);
    assert.deepEqual(flipFor(direction),lesson.trick);
    const clip=statSync(new URL(`../public${lesson.video}`,import.meta.url));
    assert.ok(clip.size>10000&&clip.size<1500000,`${lesson.id} clip budget`);
    assert.ok(statSync(new URL(`../public${lesson.poster}`,import.meta.url)).size>1000);
    bytes+=clip.size;
  }
  assert.ok(bytes<8*1024*1024);
});

test('recording and overlay share charge, release, direction tap, catch and landing boundaries',()=>{
  for(const lesson of FLIP_LESSONS){
    const charge=flipLessonFrame(lesson,.7);
    assert.equal(charge.ollie,true);assert.equal(charge.airborne,false);
    const pop=flipLessonFrame(lesson,T.pop+.01);
    assert.equal(pop.ollie,false);assert.equal(pop.airborne,true);assert.equal(pop.step,1);
    const flick=flipLessonFrame(lesson,T.tap+.03);
    assert.equal(flick.flip,true);assert.equal(flick.direction,true);assert.equal(flick.step,2);
    assert.equal(flick.flipState.name,lesson.trick.name);
    const released=flipLessonFrame(lesson,T.release+.01);
    assert.equal(released.flip,false);assert.equal(released.direction,false);
    const catchFrame=flipLessonFrame(lesson,T.tap+lesson.trick.duration+.01);
    assert.equal(catchFrame.flipState,null);assert.equal(catchFrame.airborne,true);
    const land=flipLessonFrame(lesson,T.land+.01);
    assert.equal(land.airborne,false);assert.equal(land.landing,true);assert.equal(land.step,3);
  }
});

test('controller and keyboard instructions distinguish jump, flip and direction inputs',()=>{
  const heel=FLIP_LESSONS[1];
  assert.equal(flipLessonSteps(heel,'xbox')[0].input,'Hold A');
  assert.equal(flipLessonSteps(heel,'xbox')[2].input,'→ Right + X');
  assert.equal(flipLessonSteps(heel,'playstation')[0].input,'Hold Cross');
  assert.equal(flipLessonSteps(heel,'playstation')[2].input,'→ Right + Square');
  assert.equal(flipLessonSteps(heel,'keyboard')[0].input,'Hold Space');
  assert.equal(flipLessonSteps(heel,'keyboard')[2].input,'D + ← arrow');
});
