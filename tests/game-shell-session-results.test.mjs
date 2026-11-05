import test from 'node:test';
import assert from 'node:assert/strict';
import { SessionFlow } from '../src/game/SessionFlow.js';
import { GameShell } from '../src/game/GameShell.js';
import { calculateRunFinalScore } from '../src/game/RunFinalScore.js';

function sessionHarness(run) {
  const shell=Object.create(GameShell.prototype),calls=[],sessionFlow=new SessionFlow({duration:.01});
  sessionFlow.begin({ready:false});
  Object.assign(shell,{phase:'playing',practice:false,remaining:.01,inputGrace:0,navRepeat:0,
    sessionFlow,goRemaining:0,timeupSeen:false,songToastRemaining:0,previousPad:{},padFocused:true,padIdentity:null,selection:0,
    music:{unlock(){},duck(){},next(){calls.push('nextSong');}},
    actions:{score:()=>run.totalScore,pause:value=>calls.push(['pause',value]),
      finishRun:()=>{calls.push('finishRun');return run;}},
    updateTimer(){},setScreen(phase){this.phase=phase;calls.push(phase);},
    menuButtons:()=>[{click(){calls.push('select');}}],
    moveSelection(){calls.push('move');}});
  return {shell,calls};
}

function withBrowserClock(work) {
  const descriptors=new Map(['performance','document','navigator'].map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
  let now=1000;
  const pad={connected:true,index:0,id:'test controller',axes:[0,0],buttons:Array.from({length:17},()=>({pressed:false}))};
  Object.defineProperty(globalThis,'performance',{configurable:true,value:{now:()=>now}});
  Object.defineProperty(globalThis,'document',{configurable:true,value:{hasFocus:()=>true}});
  Object.defineProperty(globalThis,'navigator',{configurable:true,value:{getGamepads:()=>[pad]}});
  try {work({at:value=>{now=value;},pad});}
  finally {for(const [key,descriptor] of descriptors)if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];}
}

test('session expiry freezes the summary and shows Time’s Up for three uncapped seconds',()=>{
  withBrowserClock(({at})=>{
    const run=Object.freeze({totalScore:900,landedCombos:3});
    const {shell,calls}=sessionHarness(run);
    shell.update(.02);
    assert.equal(shell.phase,'timeup');
    assert.equal(shell.runSummary,run);
    assert.equal(shell.finalScore,900);
    assert.deepEqual(calls,[['pause',true],'finishRun','timeup']);
    at(3999);shell.update(.016);
    assert.equal(shell.phase,'timeup','results must not skip the three-second celebration');
    at(4000);shell.update(.016);
    assert.equal(shell.phase,'results','wall-clock timing must not depend on capped simulation delta');
    assert.equal(calls.filter(call=>call==='finishRun').length,1,'freeze exactly once');
    assert.equal(shell.runSummary,run,'presentation cannot alter the scored summary');
  });
});

test('Time’s Up consumes early input and allows skipping after its arrival beat',()=>{
  withBrowserClock(({at,pad})=>{
    const {shell,calls}=sessionHarness(Object.freeze({totalScore:0}));
    shell.update(.02);
    for(const code of ['Escape','Enter','Space','KeyH']){
      let prevented=false,stopped=false;
      shell.key({code,target:{tagName:'BODY'},preventDefault(){prevented=true;},stopImmediatePropagation(){stopped=true;}});
      assert.equal(prevented,true);assert.equal(stopped,true);
    }
    shell.choose('title');shell.back();
    assert.equal(shell.phase,'timeup');
    pad.buttons[0].pressed=true;pad.buttons[1].pressed=true;pad.buttons[9].pressed=true;pad.buttons[15].pressed=true;
    at(1449);shell.update(.016);
    assert.equal(shell.phase,'timeup');
    assert.equal(calls.includes('select'),false);assert.equal(calls.includes('move'),false);
    at(1450);shell.key({code:'Enter',target:{tagName:'BODY'},preventDefault(){},stopImmediatePropagation(){}});
    assert.equal(shell.phase,'results');
    assert.equal(calls.includes('select'),false,'skip input cannot activate a results action');
    shell.update(.016);
    assert.equal(calls.includes('select'),false,'holding A through the transition cannot activate results');
  });
});

test('session expiry exposes the immutable achievement-weighted final score',()=>{
  withBrowserClock(()=>{
    const scoreBreakdown=Object.freeze(calculateRunFinalScore({bankedScore:900,landedCombos:3,tricksLanded:7,uniqueTricks:4,bails:2}));
    const run=Object.freeze({totalScore:900,finalScore:580,scoreBreakdown});
    const {shell,calls}=sessionHarness(run);
    shell.update(.02);
    assert.equal(shell.finalScore,580,'the frozen run result replaces the banked-score snapshot');
    assert.equal(shell.runSummary,run);
    assert.equal(shell.runSummary.totalScore,900,'banked gameplay score remains intact');
    assert.equal(shell.runSummary.scoreBreakdown,scoreBreakdown);
    assert.deepEqual(calls,[['pause',true],'finishRun','timeup']);
  });
});

test('results collapse v2 arithmetic and distinguish earned points, variety and bail penalties',()=>{
  const scoreBreakdown=Object.freeze(calculateRunFinalScore({bankedScore:900,landedCombos:3,tricksLanded:7,uniqueTricks:4,bails:2}));
  const run=Object.freeze({totalScore:900,finalScore:580,scoreBreakdown,landedCombos:3,tricksLanded:7,uniqueTricks:4,bails:2,
    bestCombo:{points:300,label:'Ollie + Kickflip',trickCount:2}});
  const {shell}=sessionHarness(run);
  Object.assign(shell,{runSummary:run,heroes:[{name:'Heretic'}],heroIndex:0,boardIndex:0,locationIndex:0});
  const html=shell.renderResults();
  assert.ok(html.includes(`<strong data-final-score>${(580).toLocaleString()}</strong>`));
  assert.match(html,/FINAL SCORE/);assert.match(html,/FINAL POINTS/);
  assert.match(html,/<dd data-banked-score>900<\/dd>/);
  assert.doesNotMatch(html,/3 × 100 points|7 × 25 points/,'flat bonuses are removed in line-score-v3');
  assert.match(html,/<details class="run-score-breakdown"[^>]*>/);
  assert.doesNotMatch(html,/<details class="run-score-breakdown"[^>]*open/,'arithmetic starts collapsed');
  assert.match(html,/line-score-v3/);
  assert.match(html,/4 different tricks · \+20%/);
  assert.match(html,/<dd class="score-multiplier">×1\.20<\/dd>/);
  assert.match(html,/2 × 250 point penalty/);assert.match(html,/<dd>−500<\/dd>/);
  assert.ok(html.includes(`<dd>${(1080).toLocaleString()}</dd>`),'weighted subtotal precedes the bail deduction');
  assert.match(html,/<strong>300 <small>PTS<\/small><\/strong>/,'best combo remains the original banked highlight');
  assert.match(html,/up to ×2\.00/);assert.match(html,/Final score never falls below zero/);
});

test('results offer one header highlights button and accurate empty-run details',()=>{
  const {shell}=sessionHarness({totalScore:900,highlightsCount:3,bestCombo:{points:300,label:'Ollie',trickCount:1}});
  Object.assign(shell,{heroes:[{name:'Heretic'}],heroIndex:0,boardIndex:0,locationIndex:0});
  shell.runSummary={totalScore:900,highlightsCount:3};
  shell.actions.canWatchHighlights=()=>true;
  const html=shell.renderResults();
  assert.equal((html.match(/data-action="watchHighlights"/g)||[]).length,1);
  assert.ok(html.indexOf('data-action="watchHighlights"')<html.indexOf('</header>'),'the first menu control belongs in the report header');
  shell.runSummary={totalScore:0,highlightsCount:0};shell.actions.canWatchHighlights=()=>false;
  const empty=shell.renderResults();
  assert.match(empty,/data-action="watchHighlights" disabled/);
  assert.match(empty,/No scored achievements this run/);
  assert.match(empty,/No combo banked this run/);
  assert.match(empty,/No scored tricks landed/);
});

test('results initial focus stays at the report top while later navigation reveals controls',()=>{
  const shell=Object.create(GameShell.prototype);
  let reveals=0;
  const button={classList:{toggle(){}},focus(options){assert.deepEqual(options,{preventScroll:true});},scrollIntoView(){reveals++;}};
  Object.assign(shell,{phase:'results',selection:0,menuButtons:()=>[button]});
  shell.focusSelection(false);
  assert.equal(reveals,0,'initial focus does not jump down to the enabled footer on an empty run');
  shell.focusSelection();
  assert.equal(reveals,1,'subsequent keyboard/controller navigation still exposes the focused action');
});
