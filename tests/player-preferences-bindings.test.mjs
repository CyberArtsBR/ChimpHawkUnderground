import test from 'node:test';
import assert from 'node:assert/strict';
import { statSync } from 'node:fs';
import { cloneBindings, withBinding, saveBindings, readBindings, BINDINGS_KEY } from '../src/input/ControlBindings.js';
import { normalizePlayerPreferences, readPlayerPreferences, savePlayerPreferences, PLAYER_PREFERENCE_DEFAULTS } from '../src/game/PlayerPreferences.js';
import { SkateInput } from '../src/input/SkateInput.js';
import { ADVANCED_FLIP_LESSONS, FLIP_LESSON_TIMING as T, flipLessonFrame, flipLessonSteps } from '../src/game/FlipLessons.js';

function storage(){const data=new Map();return {getItem:k=>data.get(k),setItem:(k,v)=>data.set(k,v)};}
test('binding persistence preserves remapped controls, null buttons and keyboard aliases',()=>{
  const store=storage(),bindings=cloneBindings();bindings.flip.keyboard=['KeyF'];bindings.grind.gamepad=null;
  saveBindings(bindings,store);assert.deepEqual(readBindings(store),bindings);
  assert.deepEqual(readBindings(storage()),cloneBindings(),'existing players retain default controls');
});
test('bindings reject conflicts and reserved tutorial, menu and camera keys',()=>{
  const bindings=cloneBindings();
  for(const key of ['KeyH','Escape','Enter','Tab','Digit1','Backspace'])assert.equal(withBinding(bindings,'flip','keyboard',key).ok,false,key);
  assert.equal(withBinding(bindings,'flip','keyboard','Space').conflict,'ollie');
  assert.equal(withBinding(bindings,'flip','gamepad',0).conflict,'ollie');
  for(const button of [8,9,16,-1,20])assert.equal(withBinding(bindings,'flip','gamepad',button).ok,false);
  assert.equal(withBinding(bindings,'flip','gamepad',null).ok,true);
  assert.equal(withBinding(bindings,'flip','keyboard','KeyF').ok,true);
});
test('corrupt or duplicate saved bindings recover as a complete playable default',()=>{
  const store=storage(),bindings=cloneBindings();bindings.flip.keyboard=['Space'];
  store.setItem(BINDINGS_KEY,JSON.stringify({version:1,actions:bindings}));
  assert.deepEqual(readBindings(store),cloneBindings());
  store.setItem(BINDINGS_KEY,'{broken');assert.deepEqual(readBindings(store),cloneBindings());
});
test('player preferences clamp unsafe values and survive persistence',()=>{
  const store=storage();
  const value=savePlayerPreferences({uiScale:20,highContrast:true,cameraDistance:-1,cameraFov:NaN,speedFov:0,liquid:false,performance:true},store);
  assert.equal(value.uiScale,1.5);assert.equal(value.cameraDistance,.8);assert.equal(value.cameraFov,58);
  assert.deepEqual(readPlayerPreferences(store),value);
  assert.deepEqual(normalizePlayerPreferences({highContrast:'false',cameraFov:'70'}),PLAYER_PREFERENCE_DEFAULTS);
});
test('blocked browser storage keeps settings and controls usable',()=>{
  const descriptor=Object.getOwnPropertyDescriptor(globalThis,'localStorage');
  Object.defineProperty(globalThis,'localStorage',{configurable:true,get(){throw Error('Storage unavailable');}});
  try {assert.deepEqual(readBindings(),cloneBindings());assert.deepEqual(readPlayerPreferences(),PLAYER_PREFERENCE_DEFAULTS);saveBindings(cloneBindings());savePlayerPreferences({});}
  finally {if(descriptor)Object.defineProperty(globalThis,'localStorage',descriptor);else delete globalThis.localStorage;}
});
test('remapping a held key/button consumes it until release, without a phantom ollie',()=>{
  const descriptors=new Map(['window','navigator','localStorage'].map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
  const pad={id:'test-pad',index:0,connected:true,axes:[0,0,0,0],buttons:Array.from({length:17},()=>({pressed:false}))};
  Object.defineProperty(globalThis,'window',{configurable:true,value:{addEventListener(){},removeEventListener(){}}});
  Object.defineProperty(globalThis,'navigator',{configurable:true,value:{getGamepads:()=>[pad]}});
  Object.defineProperty(globalThis,'localStorage',{configurable:true,value:storage()});
  const input=new SkateInput();input.enabled=true;
  const event=code=>({code,repeat:false,target:{tagName:'BODY'},preventDefault(){}});
  try {
    input.read();input._down(event('Space'));pad.buttons[0].pressed=true;
    assert.equal(input.read().ollieHeld,true);
    input.setBindings(cloneBindings());assert.equal(input.read().ollieHeld,false);
    input._down({...event('Space'),repeat:true});assert.equal(input.read().ollieHeld,false);
    input._up(event('Space'));pad.buttons[0].pressed=false;
    assert.equal(input.read().ollieReleased,false);
    input._down(event('Space'));assert.equal(input.read().olliePressed,true);
    input._up(event('Space'));assert.equal(input.read().ollieReleased,true);
    assert.equal(input.bind('flip','keyboard','KeyF').ok,true);
    input._down(event('ArrowLeft'));assert.equal(input.read().flipPressed,false);
    input._down(event('KeyF'));assert.equal(input.read().flipPressed,true);
  } finally {input.dispose();for(const [k,d] of descriptors)if(d)Object.defineProperty(globalThis,k,d);else delete globalThis[k];}
});
test('advanced clips ship two discrete early taps, release, upright catch and actual input labels',()=>{
  assert.deepEqual(ADVANCED_FLIP_LESSONS.map(l=>l.trick.name),['360 Flip','Laser Flip','Double Kickflip','Double Heelflip']);
  const bindings=cloneBindings();bindings.flip.keyboard=['KeyF'];bindings.ollie.keyboard=['KeyJ'];bindings.flip.gamepad=4;
  for(const lesson of ADVANCED_FLIP_LESSONS){
    assert.ok(statSync(new URL(`../public${lesson.video}`,import.meta.url)).size>10000);
    assert.ok(statSync(new URL(`../public${lesson.poster}`,import.meta.url)).size>1000);
    assert.equal(flipLessonFrame(lesson,T.tap+.02).flip,true);
    assert.equal(flipLessonFrame(lesson,T.firstRelease+.02).flip,false);
    const second=flipLessonFrame(lesson,T.secondTap+.02);assert.equal(second.flip,true);assert.equal(second.tapNumber,2);
    assert.equal(second.flipState.name,lesson.trick.name);
    const release=flipLessonFrame(lesson,T.secondRelease+.02);assert.equal(release.flip,false);assert.equal(release.direction,false);
    assert.equal(flipLessonFrame(lesson,T.land-.01).flipState,null,'the board catches before landing');
    assert.equal(flipLessonFrame(lesson,T.land+.01).landing,true);
    assert.equal(flipLessonSteps(lesson,'keyboard',bindings)[0].input,'Hold J');
    assert.match(flipLessonSteps(lesson,'keyboard',bindings)[2].input,/F → release → F/);
    assert.match(flipLessonSteps(lesson,'playstation',bindings)[2].input,/L1 → release → L1/);
  }
});

test('the FPS counter is on by default and switched on once for players who saved it off', async () => {
  const { enableFpsCounterOnce, FPS_COUNTER_DEFAULT_KEY, PLAYER_PREFERENCES_KEY, PLAYER_PREFERENCE_DEFAULTS, readPlayerPreferences, savePlayerPreferences } = await import('../src/game/PlayerPreferences.js');
  assert.equal(PLAYER_PREFERENCE_DEFAULTS.performance, true);
  const values = new Map(), store = { getItem: k => values.get(k) ?? null, setItem: (k, v) => values.set(k, String(v)) };
  savePlayerPreferences({ performance: false, uiScale: 1.2 }, store);
  enableFpsCounterOnce(store);
  assert.equal(readPlayerPreferences(store).performance, true);
  assert.equal(readPlayerPreferences(store).uiScale, 1.2, 'other saved choices are kept');
  assert.equal(values.get(FPS_COUNTER_DEFAULT_KEY), 'on');
  savePlayerPreferences({ ...readPlayerPreferences(store), performance: false }, store);
  enableFpsCounterOnce(store);
  assert.equal(readPlayerPreferences(store).performance, false, 'turning it off later sticks');
  const fresh = new Map(), freshStore = { getItem: k => fresh.get(k) ?? null, setItem: (k, v) => fresh.set(k, String(v)) };
  enableFpsCounterOnce(freshStore);
  assert.equal(fresh.has(PLAYER_PREFERENCES_KEY), false, 'new players just use the default');
  assert.equal(readPlayerPreferences(freshStore).performance, true);
});
