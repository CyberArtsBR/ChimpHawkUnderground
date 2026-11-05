import test from 'node:test';
import assert from 'node:assert/strict';
import { GameShell } from '../src/game/GameShell.js';
import { renderFlipSchool } from '../src/game/FlipSchool.js';

function shellAt(phase='title') {
  const shell=Object.create(GameShell.prototype);
  Object.assign(shell,{phase,page:0,pages:[{},{}],pendingMode:null,
    actions:{pause(){}},music:{unlock(){}},render(){},
    setScreen(value){this.phase=value;},resume(){this.phase='playing';}});
  return shell;
}

test('Tutorial opens Flip School first and Next enters the original guide',()=>{
  const shell=shellAt();shell.openTutorial();
  assert.equal(shell.phase,'flipSchool');assert.equal(shell.flipTutorial,true);
  assert.match(renderFlipSchool(0,'xbox',true),/data-action="tutorialNext"/);
  assert.doesNotMatch(renderFlipSchool(0,'xbox',false),/data-action="tutorialNext"/);
  shell.choose('tutorialNext');assert.equal(shell.phase,'tutorial');assert.equal(shell.page,0);
  shell.choose('next');assert.equal(shell.page,1);
  shell.choose('previous');assert.equal(shell.page,0);
  shell.choose('previous');assert.equal(shell.phase,'flipSchool');
  shell.back();assert.equal(shell.phase,'title');
});

test('Tutorial entry returns to a paused session and direct Flip School returns to its source',()=>{
  const paused=shellAt('pause');paused.openTutorial();paused.back();assert.equal(paused.phase,'pause');
  const playing=shellAt('playing');playing.openTutorial();playing.back();assert.equal(playing.phase,'playing');
  const guide=shellAt('tutorial');guide.page=1;guide.openFlipSchool();
  assert.equal(guide.flipTutorial,false);guide.back();assert.equal(guide.phase,'tutorial');assert.equal(guide.page,1);
});

test('tutorial never starts an unconfirmed loadout or discards its practice mode',()=>{
  for(const mode of ['practice','timed'])for(const originalGuide of [false,true]){
    const shell=shellAt('select');shell.pendingMode=mode;
    shell.heroConfirmed=false;shell.boardConfirmed=false;
    shell.start=()=>assert.fail('tutorial must not start a session');
    shell.openTutorial();
    if(originalGuide)shell.choose('tutorialNext');
    shell.back();
    assert.equal(shell.phase,'select');
    assert.equal(shell.pendingMode,mode);
    assert.equal(shell.heroConfirmed,false);assert.equal(shell.boardConfirmed,false);
  }
});

test('Tab stays inside the menu, wraps both ways, and leaves browser shortcuts alone',()=>{
  const oldDocument=globalThis.document;
  globalThis.document={activeElement:null};
  try{
    const shell=shellAt('options');shell.selection=0;
    const buttons=Array.from({length:3},()=>({classList:{toggle(){}},focus(){document.activeElement=this;}}));
    shell.menuButtons=()=>buttons;
    let prevented=0;
    const tab=(extra={})=>shell.key({code:'Tab',target:{tagName:'BUTTON'},preventDefault(){prevented++;},stopImmediatePropagation(){},...extra});
    buttons[2].focus();tab();assert.equal(document.activeElement,buttons[0]);
    tab({shiftKey:true});assert.equal(document.activeElement,buttons[2]);
    tab({ctrlKey:true});assert.equal(prevented,2);
    globalThis.document.activeElement=null;tab();assert.equal(document.activeElement,buttons[0]);
    shell.phase='playing';tab();assert.equal(prevented,3);
  }finally{globalThis.document=oldDocument;}
});
