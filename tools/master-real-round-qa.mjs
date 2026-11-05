import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { launchAuditBrowser } from './quality-browser-runtime.mjs';
import { ALL_FLIP_LESSONS } from '../src/game/FlipLessons.js';

const out='artifacts/master-upgrade/round-qa';
await mkdir(out,{recursive:true});
const result={url:'http://127.0.0.1:5182/',checks:[],clips:[],events:[],errors:[],consoleErrors:[]};
const browser=await launchAuditBrowser();
const context=await browser.newContext({viewport:{width:1920,height:1080},reducedMotion:'no-preference'});
const page=await context.newPage();
page.on('pageerror',e=>result.errors.push(e.message));
page.on('console',m=>{if(m.type()==='error')result.consoleErrors.push(m.text())});
const wait=ms=>page.waitForTimeout(ms);
const snap=async name=>page.screenshot({path:`${out}/${name}.png`});
const state=()=>page.evaluate(()=>({phase:document.body.dataset.screen,focused:document.hasFocus(),
  timer:document.querySelector('#run-timer')?.getAttribute('aria-label'),
  warning:document.querySelector('#run-timer')?.dataset.timerWarning,
  warningLabel:document.querySelector('#run-timer')?.dataset.warningLabel,
  pseudo:(()=>{const style=getComputedStyle(document.querySelector('#run-timer'),'::after');return {display:style.display,content:style.content,visibility:style.visibility}})(),
  roundCue:document.querySelector('.round-cue')?.textContent,
  cueHidden:document.querySelector('.round-cue')?.hidden,
  skater:window.streetSkate?.skater?{grounded:window.streetSkate.skater.grounded,
    bailTime:window.streetSkate.skater.bailTime,score:window.streetSkate.skater.score,
    position:window.streetSkate.skater.position.toArray(),combo:window.streetSkate.skater.tricks.comboText(),
    feedback:window.streetSkate.skater.feedback}:null}));
async function log(name){const data={name,at:new Date().toISOString(),...await state()};result.events.push(data);console.log(name,JSON.stringify(data));}

try {
  const boot=Date.now();await page.goto(result.url,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.streetSkate?.ready,null,{timeout:120000});
  result.bootMs=Date.now()-boot;await snap('title-1080');
  await page.locator('[data-action="tutorial"]').click();
  await page.locator('body[data-screen="flipSchool"]').waitFor();
  for(const [i,lesson] of ALL_FLIP_LESSONS.entries()){
    if(i)await page.locator(`[data-action="flipLesson"][data-index="${i}"]`).click();
    await page.waitForFunction(()=>{const v=document.querySelector('video');return v?.readyState>=2&&Number.isFinite(v.duration)},{},{timeout:30000});
    const video=page.locator('video');const meta=await video.evaluate(v=>({duration:v.duration,width:v.videoWidth,height:v.videoHeight,src:v.currentSrc}));
    assert.equal(meta.width,960);assert.ok(meta.src.endsWith(lesson.id+'.webm'));
    result.clips.push({name:lesson.trick.name,...meta}); if(meta.duration<2.8||meta.duration>3.6)result.checks.push(`${lesson.trick.name}: ${meta.duration.toFixed(3)}s, differs from nominal 3.2s timeline`);
    if(lesson.taps===2){await video.evaluate(v=>{v.pause();v.currentTime=1.35;});
      await page.waitForFunction(()=>document.querySelector('[data-pad="flip"]')?.classList.contains('is-active'));
      assert.match(await page.locator('[data-live-cue]').textContent(),/2\s*\/\s*2|tap/i);}
  }
  result.checks.push('12 lesson videos decoded, including four two-tap upgrades');
  for(const [w,h] of [[1280,720],[1920,1080],[2560,1440]]){
    await page.setViewportSize({width:w,height:h});await snap(`lesson-${w}`);
    const overflow=await page.locator('.shell-content').evaluate(el=>el.scrollWidth>el.clientWidth+1);
    assert.equal(overflow,false,`tutorial horizontal overflow at ${w}`);
  }
  await page.setViewportSize({width:1920,height:1080});
  await page.locator('[data-action="flipLesson"][data-index="8"]').click();
  await page.locator('[data-action="flipTry"]').click();
  await page.locator('body[data-screen="playing"]').waitFor();
  await page.waitForFunction(()=>document.querySelector('.practice-drill')?.textContent.includes('360 Flip'),{},{timeout:15000});
  await snap('try-trick');await log('try-trick');
  result.checks.push('Try This Trick opens practice with selected 360 Flip target');
  await page.keyboard.press('Escape');await page.locator('body[data-screen="pause"]').waitFor();
  await page.locator('[data-action="title"]').click();
  await page.locator('[data-action="options"]').click();await page.locator('[data-action="settings"]').click();
  for(const [w,h] of [[1280,720],[1920,1080],[2560,1440]]){
    await page.setViewportSize({width:w,height:h});await snap(`settings-${w}`);
    assert.equal(await page.locator('.shell-content').evaluate(el=>el.scrollWidth>el.clientWidth+1),false,`settings overflow at ${w}`);
  }
  await page.locator('[data-action="preferenceStep"][data-setting="uiScale"][data-delta="1"]').click();
  assert.equal(await page.locator('[data-preference-value="uiScale"]').textContent(),'110%');
  await page.locator('[data-action="preferenceToggle"][data-setting="highContrast"]').click();await snap('settings-high-contrast');
  await page.locator('[data-action="back"]').first().click();await page.locator('[data-action="back"]').last().click();
  result.checks.push('Settings size/high contrast controls work without 720p–1440p horizontal overflow');
  await page.setViewportSize({width:1920,height:1080});
  await page.locator('[data-action="start"]').click();await snap('loadout-1080');
  await page.locator('[data-action="hero"][data-index="0"]').click();
  await page.locator('[data-action="board"][data-index="6"]').click();
  await page.locator('[data-action="location"][data-index="2"]').click();
  await page.locator('[data-action="confirmLoadout"]').click();
  await page.locator('body[data-screen="playing"]').waitFor({timeout:120000});
  const roundStart=Date.now();await log('ready-go');await snap('round-ready');
  await page.waitForFunction(()=>document.querySelector('.round-cue')?.hidden,{},{timeout:15000});
  await log('round-start');await snap('round-start');
  // Genuine keyboard inputs; successful landing makes a real replay moment.
  for(let i=0;i<5;i++){
    await page.keyboard.down('Space');await wait(250);await page.keyboard.up('Space');await wait(1400);
  }
  await log('after-ollies');
  await page.keyboard.press('Escape');await page.locator('body[data-screen="pause"]').waitFor();
  const pausedBefore=await state();await wait(1100);const pausedAfter=await state();
  assert.equal(pausedBefore.timer,pausedAfter.timer,'clock must pause');await snap('pause');
  await page.locator('[data-action="resume"]').click();
  let warned=false,critical=false,timeup=false;
  while(Date.now()-roundStart<130000){
    const current=await state();
    if(!warned&&current.warning==='warning'){
      warned=true;assert.notEqual(current.pseudo.display,'none');assert.notEqual(current.pseudo.visibility,'hidden');
      await log('10-seconds');await snap('warning-10');
    }
    if(!critical&&current.warning==='critical'){
      critical=true;assert.notEqual(current.pseudo.display,'none');assert.notEqual(current.pseudo.visibility,'hidden');
      await log('5-seconds');await snap('warning-5');
    }
    if(current.phase==='timeup'){timeup=true;await log('timeup');await snap('timeup');break;}
    if(current.phase==='results')break;
    await wait(250);
  }
  assert.ok(warned&&critical,'both visual warning thresholds must be reached');
  assert.ok(timeup,'timed round must reach TIME UP');
  await wait(650);if(await page.locator('body').getAttribute('data-screen')==='timeup')await page.keyboard.press('Enter');
  await page.locator('body[data-screen="results"]').waitFor({timeout:10000});await log('results');await snap('results-1080');
  const final=await page.locator('[data-final-score]').textContent();result.finalScore=final;
  const replay=page.locator('[data-action="watchHighlights"]');
  result.replayEnabled=await replay.isEnabled();
  if(result.replayEnabled){await replay.click();await page.locator('body[data-screen="highlights"]').waitFor();await snap('replay');await wait(1200);await page.keyboard.press('Escape');await page.locator('body[data-screen="results"]').waitFor();}
  else result.checks.push('Replay unavailable: no scored moment captured during actual automated input');
  await page.locator('[data-action="restart"]').click();await page.locator('body[data-screen="playing"]').waitFor();await log('retry');
  result.checks.push('Real-time round: READY/GO, pause, 10/5 warnings, zero, skippable TIME UP, results and retry');
  if(result.replayEnabled)result.checks.push('Played and exited a real scored highlight');
  result.roundWallClockMs=Date.now()-roundStart;
  assert.deepEqual(result.errors,[]);result.status='PASS';
} catch(error){result.status='FAIL';result.failure=String(error.stack||error);console.error(error);process.exitCode=1;}
finally{await writeFile(`${out}/report.json`,JSON.stringify(result,null,2));await browser.close();console.log(JSON.stringify(result));}
