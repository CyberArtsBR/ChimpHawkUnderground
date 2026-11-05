import test from 'node:test';
import assert from 'node:assert/strict';
import { nextMenuIndex } from '../src/input/MenuNavigation.js';
import { SessionFlow } from '../src/game/SessionFlow.js';
import { GameShell } from '../src/game/GameShell.js';
import { SkateAudio } from '../src/game/SkateAudio.js';

function card(action, x, y, w=100, h=48) {
  return {
    dataset:{action},disabled:false, scrollCount:0,
    classList:{toggle(){}},
    getBoundingClientRect(){return {left:x,top:y,width:w,height:h};},
    focus(){ if(globalThis.document)document.activeElement=this; },
    scrollIntoView(){this.scrollCount++;},
    click(){this.clickCount=(this.clickCount||0)+1;},
  };
}
const group = (cards,index)=>cards[index].dataset.action;
function desktop(){
  return [
    card('hero',0,0),card('hero',120,0),
    card('hero',0,110),card('hero',120,110),
    card('upload',50,235,100),
    ...Array.from({length:8},(_,i)=>card('board',390+(i%2)*120,Math.floor(i/2)*78)),
    card('location',780,0,200,95),card('location',780,125,200,95),card('location',780,250,200,95),
    card('back',30,510,140),card('confirmLoadout',800,510,170),
  ];
}
function mobile(){
  return [
    ...Array.from({length:4},(_,i)=>card('hero',(i%2)*120,Math.floor(i/2)*140)),
    card('upload',0,290,225),
    ...Array.from({length:8},(_,i)=>card('board',(i%2)*120,380+Math.floor(i/2)*78)),
    card('location',0,730,225,120),card('location',0,880,225,120),card('location',0,1030,225,120),
    card('back',0,1180,100),card('confirmLoadout',115,1180,120),
  ];
}

test('desktop: keyboard/controller can traverse rider, import, deck, all three maps and footer',()=>{
  const b=desktop();
  let i=1;
  i=nextMenuIndex(b,i,'x',1,true);
  assert.equal(group(b,i),'board','right edge of rider region must reach boards');
  i=nextMenuIndex(b,i,'x',1,true);
  assert.equal(group(b,i),'board','deck row has two choices');
  i=nextMenuIndex(b,i,'x',1,true);
  assert.equal(group(b,i),'location','right edge of decks must reach maps');
  i=nextMenuIndex(b,i,'y',1,true);
  assert.equal(i,14);
  i=nextMenuIndex(b,i,'y',1,true);
  assert.equal(i,15,'all three selectable locations reachable');
  i=nextMenuIndex(b,i,'y',1,true);
  assert.equal(group(b,i),'confirmLoadout','footer is accessible after maps');
  i=nextMenuIndex(b,i,'x',-1,true);
  assert.equal(group(b,i),'back');
  const upload=nextMenuIndex(b,3,'y',1,true);
  assert.equal(group(b,upload),'upload','rider import is not stranded');
});

test('stacked narrow viewport: controller can enter each region while scrolling',()=>{
  const b=mobile();
  let i=1;
  i=nextMenuIndex(b,i,'x',1,true);
  assert.equal(group(b,i),'board','horizontal region fallback works on vertical CSS stacks');
  i=nextMenuIndex(b,i,'y',1,true);
  assert.equal(group(b,i),'board');
  // Descend to the last deck row and then into the location region.
  for(let n=0;n<6&&group(b,i)==='board';n++){
    const next=nextMenuIndex(b,i,'y',1,true);
    if(group(b,next)!=='board') { i=next;break; }
    i=next;
  }
  assert.equal(group(b,i),'location');
  i=nextMenuIndex(b,i,'y',1,true);
  i=nextMenuIndex(b,i,'y',1,true);
  assert.equal(group(b,i),'location');
  i=nextMenuIndex(b,i,'y',1,true);
  assert.equal(group(b,i),'back','footer stays navigable below the fold');
});

test('menu focus scrolls selected loadout card into view and arrow keys share route',()=>{
  const saved=globalThis.document;
  globalThis.document={activeElement:null};
  try {
    const b=desktop();
    const shell=Object.create(GameShell.prototype);
    shell.phase='select';shell.selection=1;shell.music={unlock(){}};
    shell.menuButtons=()=>b;
    shell.focusSelection();
    assert.equal(b[1].scrollCount,1);
    shell.moveSelection('x',1);
    assert.equal(b[shell.selection].dataset.action,'board');
    assert.ok(b[shell.selection].scrollCount>0);
    shell.key({code:'ArrowRight',repeat:false,target:{tagName:'BODY'},
      preventDefault(){},stopImmediatePropagation(){}});
    assert.equal(group(b,shell.selection),'board');
    shell.key({code:'Enter',repeat:false,target:{tagName:'BODY'},
      preventDefault(){},stopImmediatePropagation(){}});
    assert.equal(b[shell.selection].clickCount,1);
  }finally{globalThis.document=saved;}
});

test('newly connected controller never activates a menu with a pre-held A button',()=>{
  const oldDoc=globalThis.document,oldNav=Object.getOwnPropertyDescriptor(globalThis,'navigator');
  const pad={index:2,id:'Xbox Wireless Controller',connected:true,axes:[0,0],
    buttons:Array.from({length:17},()=>({pressed:false}))};
  globalThis.document={hasFocus:()=>true,activeElement:null};
  Object.defineProperty(globalThis,'navigator',{value:{getGamepads:()=>[pad]},configurable:true});
  try {
    const b=desktop();
    const shell=Object.create(GameShell.prototype);
    shell.phase='select';shell.selection=0;shell.navRepeat=0;shell.inputGrace=0;
    shell.padFocused=false; shell.previousPad={}; shell.padIdentity=null;
    shell.menuButtons=()=>b;shell.music={unlock(){},next(){}};
    pad.buttons[0].pressed=true;
    shell.update(.016);
    assert.equal(b[0].clickCount||0,0);
    pad.buttons[0].pressed=false;shell.update(.016);
    pad.buttons[0].pressed=true;shell.update(.016);
    assert.equal(b[0].clickCount,1,'A activates exactly once on the new edge');
    shell.update(.016);
    assert.equal(b[0].clickCount,1,'held A must not retrigger');
  }finally{
    globalThis.document=oldDoc;
    if(oldNav)Object.defineProperty(globalThis,'navigator',oldNav);
    else delete globalThis.navigator;
  }
});

function fakeAudioContext() {
  class Param {
    value=0; target=0;
    setValueAtTime(v){this.value=v;}
    exponentialRampToValueAtTime(v){this.value=v;}
    setTargetAtTime(v){this.target=v;}
  }
  const node=()=>({
    gain:new Param(),frequency:new Param(),Q:new Param(),
    connect(){},disconnect(){},start(){},stop(){},onended:null
  });
  return class {
    state='running';currentTime=1;sampleRate=8000;
    destination=node();sources=[];oscillators=[];
    createGain(){return node();}
    createBiquadFilter(){return node();}
    createDynamicsCompressor(){return {...node(),threshold:new Param(),knee:new Param(),ratio:new Param(),attack:new Param(),release:new Param()};}
    createBufferSource(){const n=node();this.sources.push(n);return n;}
    createOscillator(){const n=node();this.oscillators.push(n);return n;}
    createBuffer(channels,length,sampleRate){const samples=new Float32Array(length);return {duration:length/sampleRate,getChannelData:()=>samples};}
    async close(){this.state='closed';}
  };
}
test('synthesized pop, rail and landing voices remain gated and respect pause',async()=>{
  const oldWindow=globalThis.window;
  globalThis.window={AudioContext:fakeAudioContext()};
  const fx=new SkateAudio();
  try {
    await fx.unlock();
    const c=fx.context;
    const loops=['roll','texture','grind','brake','wind','concreteScrape','metalScrape','ambience'];
    assert.equal(c.sources.length,loops.length);
    for(const name of loops)assert.ok(fx[name]?.source,`${name}: persistent gated layer`);
    const player={
      velocity:{length:()=>12},grounded:true,grind:null,bailTime:0,
      presentation:{landingSeverity:0.8}
    };
    fx.update(player,true);
    assert.ok(fx.roll.gain.gain.target>0);
    player.grounded=false;player.presentation.popTime=.12;c.currentTime+=.2;fx.update(player,true);
    assert.equal(c.sources.length,loops.length+1,'ollie pop is a distinct transient');
    player.grind={};c.currentTime+=.2;fx.update(player,true);
    assert.ok(fx.grind.gain.gain.target>0);
    assert.equal(fx.roll.gain.gain.target,0,'grind masks wheel hiss');
    player.grind=null;player.grounded=true;c.currentTime+=.2;fx.update(player,true);
    assert.equal(c.sources.length,loops.length+3,'rail contact and truck landing each produce their own voice');
    assert.ok(c.sources.at(-1).buffer.duration>c.sources[loops.length].buffer.duration,'landing has a longer resonant decay than pop');
    fx.update(player,false);
    for(const name of loops)assert.equal(fx[name].gain.gain.target,0,`${name}: pause silences loop`);
  }finally{await fx.dispose();globalThis.window=oldWindow;}
});

test('camera option persists and is retained when starting the session',()=>{
  const oldStorage=globalThis.localStorage;
  const preferences=new Map();
  globalThis.localStorage={
    getItem:k=>preferences.get(k)||null,
    setItem:(k,v)=>preferences.set(k,v)
  };
  try {
    const cameraCalls=[];
    const shell=Object.create(GameShell.prototype);
    shell.sessionFlow=new SessionFlow();shell.phase='options';shell.cameraIndex=0;shell.music={unlock(){}};
    shell.actions={
      camera:value=>cameraCalls.push(value),
      start:()=>{}
    };
    shell.render=()=>{};
    shell.setScreen=phase=>{shell.phase=phase;};
    shell.choose('camera');
    assert.equal(preferences.get('streetskate.camera'),'follow-close');
    shell.choose('camera');
    assert.equal(preferences.get('streetskate.camera'),'follow-low');
    shell.start(false);
    assert.equal(shell.phase,'playing');
    assert.equal(cameraCalls.at(-1),'follow-low','starting a run must not reset the chosen camera');
  }finally{globalThis.localStorage=oldStorage;}
});
