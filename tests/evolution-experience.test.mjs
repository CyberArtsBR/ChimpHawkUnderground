import test from 'node:test';
import assert from 'node:assert/strict';
import { GameShell } from '../src/game/GameShell.js';
import { tutorialPages } from '../src/game/TutorialPages.js';
import { FlipSchoolPlayer, flipPadPlacement } from '../src/game/FlipSchool.js';
import { cloneBindings, saveBindings, readBindings } from '../src/input/ControlBindings.js';
import { SkateInput } from '../src/input/SkateInput.js';

test('keyboard Tab crosses hidden binding actions to reach the settings footer in both directions',()=>{
  const saved=globalThis.document;
  globalThis.document={activeElement:null};
  try {
    const target=(name,ancestor='',disabled=false)=>({name,disabled,hidden:false,
      closest:selector=>ancestor&&selector.includes(ancestor)?{}:null,
      focus(){if(!ancestor&&!this.disabled)document.activeElement=this;},scrollIntoView(){}});
    const reset=target('reset'),hidden=target('hidden-swap','[hidden]'),inert=target('inert-background','[inert]');
    const disabled=target('disabled','',true),summary=target('score-disclosure'),footer=target('back');
    const elements=[reset,hidden,inert,disabled,summary,footer];
    const shell=Object.create(GameShell.prototype);
    Object.assign(shell,{phase:'settings',music:{unlock(){}},content:{querySelectorAll:()=>elements}});
    const tab=shiftKey=>shell.key({code:'Tab',shiftKey,target:{tagName:'BUTTON'},preventDefault(){},stopImmediatePropagation(){}});
    reset.focus();tab(false);assert.equal(document.activeElement,summary);
    tab(false);assert.equal(document.activeElement,footer);
    tab(false);assert.equal(document.activeElement,reset);
    tab(true);assert.equal(document.activeElement,footer);
    tab(true);assert.equal(document.activeElement,summary);
    tab(true);assert.equal(document.activeElement,reset);
    assert.deepEqual(shell.menuButtons(),[reset,summary,footer],'menu navigation also excludes inert and hidden targets');
  } finally {globalThis.document=saved;}
});

test('readable trick guides use persisted remaps for directions, tricks, manual pairs, cameras and wall moves',()=>{
  const values=new Map(),storage={getItem:key=>values.get(key),setItem:(key,value)=>values.set(key,value)};
  const bindings=cloneBindings();
  for(const [action,code] of Object.entries({up:'KeyI',down:'KeyK',left:'KeyJ',right:'KeyL',ollie:'KeyO',flip:'KeyF',grab:'KeyG',grind:'KeyT',cameraMode:'KeyV'}))bindings[action].keyboard=[code];
  [bindings.flip.gamepad,bindings.grab.gamepad]=[bindings.grab.gamepad,bindings.flip.gamepad];
  [bindings.ollie.gamepad,bindings.grind.gamepad]=[bindings.grind.gamepad,bindings.ollie.gamepad];
  saveBindings(bindings,storage);
  const pages=tutorialPages(readBindings(storage));
  assert.equal(pages.length,6);
  assert.match(pages[0].html,/Hold O, then release/);
  assert.match(pages[0].html,/current saved controls/);
  assert.match(pages[1].subtitle,/F \/ Xbox B/);
  assert.match(pages[1].html,/I\+J \/ Up-left/);
  assert.match(pages[2].subtitle,/G \/ Xbox X/);
  assert.match(pages[3].subtitle,/T \/ Xbox A/);
  assert.match(pages[4].subtitle,/Manual: I then K/);
  assert.match(pages[4].html,/F then T/);
  assert.match(pages[5].html,/Hold T against a wall/);
  assert.match(pages[5].html,/O during a Wall Ride/);
  assert.match(pages[5].html,/V to cycle/);
  assert.match(pages[5].html,/grace period/);
});

test('practice marker instructions match remapped runtime chords and direct marker buttons',()=>{
  const saved=new Map(['window','navigator','localStorage'].map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
  const pad={id:'Marker test',index:0,connected:true,axes:[0,0,0,0],buttons:Array.from({length:17},()=>({pressed:false}))};
  Object.defineProperty(globalThis,'window',{configurable:true,value:{addEventListener(){},removeEventListener(){}}});
  Object.defineProperty(globalThis,'navigator',{configurable:true,value:{getGamepads:()=>[pad]}});
  Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:()=>null,setItem(){}}});
  const input=new SkateInput();input.enabled=true;
  try {
    const bindings=cloneBindings();
    for(const [first,second] of [['spinLeft','vertExit'],['spinRight','switchStance'],['up','left'],['down','right']])
      [bindings[first].gamepad,bindings[second].gamepad]=[bindings[second].gamepad,bindings[first].gamepad];
    bindings.practiceMark.gamepad=10;input.setBindings(bindings);input.read({practice:true});
    for(const index of [6,7,14])pad.buttons[index].pressed=true;
    const mark=input.read({practice:true});assert.equal(mark.practiceMark,true);assert.equal(mark.drive,0);
    pad.buttons[14].pressed=false;input.read({practice:true});pad.buttons[15].pressed=true;
    assert.equal(input.read({practice:true}).practiceReturn,true);
    for(const button of pad.buttons)button.pressed=false;input.read({practice:true});pad.buttons[10].pressed=true;
    assert.equal(input.read({practice:true}).practiceMark,true);
    const page=tutorialPages(bindings)[0].html.replace(/<[^>]+>/g,'');
    assert.match(page,/L3 or LT \+ RT \+ D-pad ← \/ LT \+ RT \+ D-pad →/);
    bindings.spinLeft.gamepad=null;
    const incomplete=tutorialPages(bindings)[0].html;
    assert.doesNotMatch(incomplete,/Unassigned<\/span> \+/);
    assert.match(incomplete,/Unassigned · bind in Settings/);
  } finally {input.dispose();for(const [key,descriptor] of saved)if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];}
});

function inputDiagram(bindings){
  const node=()=>({dataset:{},textContent:'',innerHTML:'',hidden:false,attributes:{},setAttribute(key,value){this.attributes[key]=String(value);}});
  const elements=new Map();
  const get=selector=>{if(!elements.has(selector))elements.set(selector,node());return elements.get(selector);};
  for(const action of ['ollie','flip']){
    const group=get(`[data-pad="${action}"]`),circle=node(),text=node();
    group.querySelector=selector=>selector==='circle'?circle:text;group.circle=circle;group.text=text;
  }
  const player=Object.create(FlipSchoolPlayer.prototype);
  Object.assign(player,{root:{querySelector:get,querySelectorAll:()=>[]},inputBindings:bindings,
    lesson:{x:0,y:-1,arrow:'↑',label:'Up'},update(){}});
  return {player,get};
}

test('Flip School highlights rebound face buttons at their physical positions for Xbox and PlayStation',()=>{
  const bindings=cloneBindings();bindings.ollie.gamepad=3;bindings.flip.gamepad=1;
  const {player,get}=inputDiagram(bindings);
  player.setInputMode('xbox');
  assert.equal(get('[data-pad="ollie"]').circle.attributes.cx,'210');
  assert.equal(get('[data-pad="ollie"]').circle.attributes.cy,'31');
  assert.equal(get('[data-pad="flip"]').circle.attributes.cx,'236');
  assert.equal(get('[data-pad="flip"]').circle.attributes.cy,'57');
  assert.equal(get('[data-pad-ollie]').textContent,'Y');assert.equal(get('[data-pad-flip]').textContent,'B');
  player.setInputMode('playstation');
  assert.equal(get('[data-pad-ollie]').textContent,'△');assert.equal(get('[data-pad-flip]').textContent,'○');
  assert.deepEqual(flipPadPlacement(0),{x:210,y:83});assert.deepEqual(flipPadPlacement(2),{x:184,y:57});
});

test('shoulder, trigger, stick, D-pad and unassigned remaps never light a false face-button position',()=>{
  for(const button of [4,5,6,7,10,11,12,13,14,15,null]){
    const bindings=cloneBindings();bindings.flip.gamepad=button;
    const {player,get}=inputDiagram(bindings);player.setInputMode('xbox');
    assert.equal(flipPadPlacement(button),null);
    assert.equal(get('[data-pad="flip"]').attributes.visibility,'hidden');
    assert.equal(get('[data-remap-note]').hidden,false);
    assert.match(get('[data-remap-note]').textContent,/Flip: .*Follow the button order below/);
    player.setInputMode('keyboard');assert.equal(get('[data-remap-note]').hidden,true);
  }
});
