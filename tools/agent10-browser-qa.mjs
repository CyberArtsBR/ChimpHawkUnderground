// Agent 10: black-box tests of the built production app, with failure evidence.
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
const url=process.env.STREETSKATE_URL||'http://127.0.0.1:4173';
const out=process.env.AGENT10_ARTIFACT_DIR||'artifacts/agent10';
await mkdir(out,{recursive:true});
const report={url,started:new Date().toISOString(),checks:[],pageErrors:[],requestFailures:[],consoleErrors:[],samples:[]};
const stockRiderCount=5;
// Headless Chromium can deprioritize RAF in software WebGL even while the
// tab is under test. Disable background throttling without lowering the
// required number of animation frames.
const localChrome='C:/Program Files/Google/Chrome/Application/chrome.exe';
const executablePath=process.env.STREETSKATE_BROWSER_EXECUTABLE
 || (process.platform==='win32'&&existsSync(localChrome)?localChrome:undefined);
const browser=await chromium.launch({headless:true,...(executablePath?{executablePath}:{}),args:[
 '--use-gl=swiftshader','--enable-webgl','--ignore-gpu-blocklist',
 '--disable-background-timer-throttling','--disable-renderer-backgrounding',
 '--disable-backgrounding-occluded-windows',
]});
const context=await browser.newContext({viewport:{width:1440,height:900},deviceScaleFactor:1});
await context.addInitScript(()=>{
  window.__agent10Unhandled=[];
  window.addEventListener('unhandledrejection',event=>{
    window.__agent10Unhandled.push(String(event.reason?.message||event.reason));
  });
});
const page=await context.newPage();
page.setDefaultTimeout(60000);
page.on('pageerror',e=>report.pageErrors.push(String(e.stack||e)));
page.on('console',m=>{if(m.type()==='error')report.consoleErrors.push(m.text());});
page.on('requestfailed',r=>{report.requestFailures.push({url:r.url(),reason:r.failure()?.errorText||''});});
function checked(label,fn){return (async()=>{await fn();report.checks.push({label,ok:true});console.log('QA PASS: '+label);})();}
async function gotoTitle(){
 await page.goto(url,{waitUntil:'domcontentloaded',timeout:45000});
 await page.waitForFunction(()=>window.streetSkate?.ready===true,null,{timeout:90000});
 await page.locator('body[data-screen="title"]').waitFor();
 assert.equal(await page.locator('#viewport canvas').count(),1,'Expected exactly one canvas');
 await page.screenshot({path:join(out,'title-1440.png'),fullPage:true});
 assert.equal(await page.locator('#game-shell.title-screen .art-hit span:visible').count(),0,'No duplicate title button captions');
}
async function chooseLoadout(){
 await page.locator('.loadout-character').first().click();
 await page.locator('.loadout-deck').nth(2).click();
 await page.locator('.loadout-location[data-location="skate-paradise"]').click();
 assert.equal(await page.locator('[data-action="confirmLoadout"]').isDisabled(),false);
 await page.locator('[data-action="confirmLoadout"]').scrollIntoViewIfNeeded();
 if(page.viewportSize()?.width<=800) await page.screenshot({path:join(out,'selection-five-800.png'),fullPage:true});
 const layout=await page.locator('[data-action="confirmLoadout"]').evaluate(button=>{
   const cta=button.getBoundingClientRect();
   const cards=[...document.querySelectorAll('.loadout-location')].map(card=>{
     const box=card.getBoundingClientRect();
     let left=Math.max(0,box.left),right=Math.min(innerWidth,box.right),
       top=Math.max(0,box.top),bottom=Math.min(innerHeight,box.bottom);
     for(let parent=card.parentElement;parent;parent=parent.parentElement){
       const style=getComputedStyle(parent),clip=parent.getBoundingClientRect();
       if(/auto|scroll|hidden|clip/.test(style.overflowX)){left=Math.max(left,clip.left);right=Math.min(right,clip.right);}
       if(/auto|scroll|hidden|clip/.test(style.overflowY)){top=Math.max(top,clip.top);bottom=Math.min(bottom,clip.bottom);}
     }
     return {id:card.dataset.location,left,right,top,bottom,visible:right>left&&bottom>top};
   });
   return {cta:{left:cta.left,right:cta.right,top:cta.top,bottom:cta.bottom},cards};
 });
 assert.ok(layout.cta.top>=0&&layout.cta.bottom<=page.viewportSize().height,'START SESSION must be inside the viewport');
 assert.ok(layout.cards.every(card=>!card.visible||card.bottom<=layout.cta.top+2
   ||card.top>=layout.cta.bottom-2||card.right<=layout.cta.left||card.left>=layout.cta.right),
   'START SESSION must not overlap visible location cards: '+JSON.stringify(layout));
 await page.locator('[data-action="confirmLoadout"]').click();
 await page.locator('body[data-screen="playing"]').waitFor({timeout:60000});
 assert.equal(await page.locator('body[data-screen="tutorial"]').count(),0,
   'valid loadout must start gameplay directly without a mandatory tutorial');
}
async function finishTutorial(){
 await page.locator('body[data-screen="playing"]').waitFor({timeout:30000});
 assert.equal(await page.locator('body[data-screen="tutorial"]').count(),0);
}
async function stats(stage){
 const sample=await page.evaluate(async()=>{
  const g=window.streetSkate;
  const renderer=g?.renderer;
  const startFrame=renderer?.info?.render?.frame;
  const started=performance.now();
  const deltas=[];let previous=started,observing=true;
  // Collect RAF timing as telemetry, but the liveness gate uses Three.js's
  // real renderer.info.render.frame counter. A fixed observation window does
  // not prematurely abort when SwiftShader exceeds a 600ms frame time.
  const measure=()=>{
   const now=performance.now();
   deltas.push(now-previous);previous=now;
   if(observing)requestAnimationFrame(measure);
  };
  requestAnimationFrame(measure);
  await new Promise(resolve=>setTimeout(resolve,8000));
  observing=false;
  const elapsedMs=performance.now()-started;
  const finishFrame=renderer?.info?.render?.frame;
  const frameCount=Number.isFinite(startFrame)&&Number.isFinite(finishFrame)
   ?Math.max(0,finishFrame-startFrame):0;
  const sorted=deltas.filter(Number.isFinite).sort((a,b)=>a-b);
  const percentile=p=>sorted.length?sorted[Math.min(sorted.length-1,Math.floor(p*(sorted.length-1)))]:null;
  const render=renderer?.info?.render,memory=renderer?.info?.memory;
  return {frameCount,rafSamples:deltas.length,
   fps:frameCount/(elapsedMs/1000),elapsedMs,
   frameMsP50:percentile(.5),frameMsP95:percentile(.95),
   frameMsP99:percentile(.99),frameMsMax:sorted.at(-1)??null,
   drawCalls:render?.calls??null,triangles:render?.triangles??null,
   geometries:memory?.geometries??null,textures:memory?.textures??null,
   jsHeap:performance.memory?.usedJSHeapSize??null,
   player:g?.skater?.position?.toArray?.()??null,
   camera:g?.camera?.position?.toArray?.()??null,
   invariantViolations:g?.skater?.stateInvariantViolations?.map?.(x=>x.code)??[],
   focused:document.hasFocus(),hidden:document.hidden};
 });
 report.samples.push({stage,...sample});
 console.log('AGENT10 RENDER SAMPLE '+JSON.stringify({stage,...sample}));
 assert.ok(Array.isArray(sample.player)&&sample.player.every(Number.isFinite),'Non-finite player');
 assert.ok(Array.isArray(sample.camera)&&sample.camera.every(Number.isFinite),'Non-finite camera');
 assert.deepEqual(sample.invariantViolations,[],'Runtime invariant failures');
 assert.ok(sample.frameCount>3,'Game loop did not render sufficient frames');
}
try{
 await checked('startup and playable renderer',gotoTitle);
 // The owner has deferred map-hole testing; enable this diagnostic explicitly
 // with STREETSKATE_AUDIT_PARK_COVERAGE=1 after they provide gameplay reproductions.
 if(process.env.STREETSKATE_AUDIT_PARK_COVERAGE==='1') await checked('active park visual-versus-collision coverage diagnostic',async()=>{
  const coverage=await page.evaluate(()=>{
    const g=window.streetSkate;
    return g.skater.surface.auditCoverage(g.park,g.manifest.playableRegions,{samplesPerAxis:6});
  });
  assert.ok(coverage.sampled>0,'Expected at least one playable-region sample');
  assert.ok(coverage.visualSamples>0,'Expected physical floor visual samples');
  console.log('AGENT10 PARK COVERAGE '+JSON.stringify(coverage));
  report.parkCoverage=coverage;
 });
 await checked('packaged rider and title media are accessible',async()=>{
  for(const asset of ['/assets/rider/thehollowf.glb','/assets/menu/riders/thehollowf.png','/assets/rider/The_Heretic.glb','/assets/rider/The_AdolescentUR.glb',
   '/assets/rider/The_Anchor.glb','/assets/rider/TuxR.glb',
   '/media/title-screen.webp','/media/trick-guide-16x9.webp']){
   const r=await page.request.head(url+asset);
   assert.ok(r.ok(),asset+' returned '+r.status());
  }
 });
 await checked('options camera and persisted music volume',async()=>{
  await page.locator('[data-action="options"]').click();
  await page.locator('[data-action="camera"]').click();
  await page.locator('[data-action="musicDown"]').click();
  const stored=await page.evaluate(()=>localStorage.getItem('streetskate.musicVolume'));
  assert.ok(Number.isFinite(Number(stored))&&Number(stored)>=0&&Number(stored)<=1);
  await page.reload({waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.streetSkate?.ready===true,null,{timeout:90000});
  assert.equal(await page.evaluate(()=>localStorage.getItem('streetskate.musicVolume')),stored);
  await page.locator('body[data-screen="title"]').waitFor();
 });
 await checked('timed run selection, grid keyboard, and three playable locations',async()=>{
  await page.locator('[data-action="start"]').click();
  await page.locator('body[data-screen="select"]').waitFor();
  assert.equal(await page.locator('.loadout-character').count(),stockRiderCount);
  assert.deepEqual(await page.locator('.loadout-character strong').allTextContents(),
    ['The Hollow','Heretic','Adolescent','Anchor','Tuxr']);
  await page.waitForFunction(count => {
    const roster = document.querySelectorAll('.loadout-roster .rider-portrait img');
    const selected = document.querySelector('.selected-rider .rider-portrait img');
    return roster.length === count && [...roster, selected].every(img => img?.complete && img.naturalWidth > 0);
  }, stockRiderCount, {timeout:60000});
  await page.screenshot({path:join(out,'selection-five-1440.png'),fullPage:true});
  assert.equal(await page.locator('.loadout-deck').count(),8);
  assert.equal(await page.locator('.loadout-location').count(),3);
  assert.equal(await page.locator('.loadout-location[disabled]').count(),0);
  for (const id of ['skate-paradise', 'orbit', 'grand-warehouse']) {
    assert.equal(await page.locator(`.loadout-location[data-location="${id}"]`).isEnabled(),true,
      `${id} must remain available and selectable`);
  }
  assert.equal(await page.locator('[data-action="confirmLoadout"]').isDisabled(),true);
  await page.locator('.loadout-character').first().focus();
  await page.keyboard.press('ArrowRight');
  assert.equal(await page.locator(':focus').getAttribute('data-index'),'1');
  // Spatial navigation stays inside the rider grid when a second rider row is
  // below the current card. The old assertion demanded a different card TYPE,
  // incorrectly treating a valid downward rider-to-rider move as a defect.
  const beforeDown=await page.locator(':focus').evaluate(el=>({
    action:el.dataset.action,index:el.dataset.index,
    y:el.getBoundingClientRect().top+el.getBoundingClientRect().height/2,
  }));
  await page.keyboard.press('ArrowDown');
  const afterDown=await page.locator(':focus').evaluate(el=>({
    action:el.dataset.action,index:el.dataset.index,
    y:el.getBoundingClientRect().top+el.getBoundingClientRect().height/2,
  }));
  assert.notDeepEqual([afterDown.action,afterDown.index],
    [beforeDown.action,beforeDown.index],'ArrowDown did not change the focused card');
  assert.ok(afterDown.y>beforeDown.y+4,
    'ArrowDown did not move to a card lower on screen');
  // Reach the adjacent deck and location groups with the keyboard, not mouse.
  // This remains a hard failure if spatial navigation traps a keyboard user.
  await page.locator('.loadout-character').last().focus();
  let reachedDeck=false;
  for(let n=0;n<12;n++){
    await page.keyboard.press('ArrowRight');
    if(await page.locator(':focus').getAttribute('data-action')==='board'){
      reachedDeck=true;break;
    }
  }
  assert.ok(reachedDeck,'ArrowRight cannot navigate from rider to skateboard');
  let reachedLocation=false;
  for(let n=0;n<14;n++){
    await page.keyboard.press('ArrowRight');
    if(await page.locator(':focus').getAttribute('data-action')==='location'){
      reachedLocation=true;break;
    }
  }
  assert.ok(reachedLocation,'ArrowRight cannot navigate from skateboard to location');
 });
 await checked('invalid custom avatar is rejected without DOM injection',async()=>{
  const input=page.locator('input[type="file"][accept*=".glb"]').first();
  await input.setInputFiles({name:'not-a-model.glb',mimeType:'model/gltf-binary',buffer:Buffer.alloc(128)});
  await page.waitForFunction(() => /Invalid GLB header/i.test(document.querySelector('.loadout-status')?.textContent || ''), null, { timeout: 30000 });
  assert.match(await page.locator('.loadout-status').textContent(),/Invalid GLB header/i);
  assert.equal(await page.locator('.loadout-character').count(),stockRiderCount);
  // A magic-only fake is not a valid GLB. It must never become selectable.
  const invalid=Buffer.alloc(128);invalid.write('glTF');
  await input.setInputFiles({name:'<img src=x onerror=alert(1)>.glb',mimeType:'model/gltf-binary',buffer:invalid});
  await page.waitForFunction(() => /Invalid GLB header/i.test(document.querySelector('.loadout-status')?.textContent||''), null, { timeout: 30000 });
  assert.equal(await page.locator('.loadout-character').count(),stockRiderCount);
  assert.equal(await page.locator('img[src="x"]').count(),0);

  // Conversely, accept a real, small, self-contained GLB v2 and escape its
  // potentially dangerous filename. This tests validation and DOM safety.
  const json=Buffer.from(JSON.stringify({asset:{version:'2.0'},scene:0,scenes:[{nodes:[]}]}),'utf8');
  const aligned=Math.ceil(json.length/4)*4;
  const valid=Buffer.alloc(20+aligned,0x20);
  valid.write('glTF',0,'ascii');
  valid.writeUInt32LE(2,4);
  valid.writeUInt32LE(valid.length,8);
  valid.writeUInt32LE(aligned,12);
  valid.writeUInt32LE(0x4e4f534a,16);
  json.copy(valid,20);
  await input.setInputFiles({name:'<img src=x onerror=alert(1)>.glb',mimeType:'model/gltf-binary',buffer:valid});
  await page.waitForFunction(count => document.querySelectorAll('.loadout-character').length === count, stockRiderCount+1, { timeout: 30000 });
  assert.equal(await page.locator('img[src="x"]').count(),0);
  assert.equal(await page.locator('.loadout-character').count(),stockRiderCount+1);
 });
 await checked('direct Start Session flow without mandatory tutorial',async()=>{
  await chooseLoadout();
  await finishTutorial();
  // The tutorial stays available on demand and can be skipped back to pause.
  await page.keyboard.press('Escape');
  await page.locator('body[data-screen="pause"]').waitFor();
  await page.screenshot({path:join(out,'pause-800.png'),fullPage:true});
  await page.locator('[data-action="tutorial"]').click();
  await page.locator('body[data-screen="flipSchool"]').waitFor();
  await page.locator('[data-action="tutorialNext"]').click();
  await page.locator('body[data-screen="tutorial"]').waitFor();
  assert.equal(await page.locator('[data-action="skipTutorial"]').count(),1);
  const next=page.locator('[data-action="next"]');
  const nextBox=await next.boundingBox();
  const viewport=page.viewportSize();
  assert.ok(nextBox && viewport && nextBox.y>=0 && nextBox.y+nextBox.height<=viewport.height,
    'Poster next button must be fully visible at short heights');
  await next.click(); // Poster is image-only; icons appear on the control tables.
  assert.ok(await page.locator('.xbox-input.xbox-a').count()>0,'Tutorial must show colored Xbox A');
  await page.screenshot({path:join(out,'tutorial-800.png'),fullPage:true});
  await page.locator('[data-action="skipTutorial"]').click();
  await page.locator('body[data-screen="pause"]').waitFor();
  await page.locator('[data-action="resume"]').click();
  await page.locator('body[data-screen="playing"]').waitFor();
  // The virtual GitHub runner has no hardware GPU: exercise live gameplay at
  // a practical software-raster viewport; menu layout was checked at 1440x900.
  // Keep the >3-frame liveness assertion unchanged. Do not use these FPS
  // samples as end-user hardware performance results.
  await page.setViewportSize({width:800,height:450});
  await stats('timed-1');
  await page.screenshot({path:join(out,'timed-session.png'),fullPage:true});
 });
 await checked('gold/fire/red graffiti score fits on wide and narrow screens',async()=>{
  // SwiftShader captures can exceed a timed run. Use the real practice flow
  // for extended visual/camera checks; expiry is independently checked below.
  if(await page.locator('body').getAttribute('data-screen')==='playing')
    await page.keyboard.press('Escape');
  await page.locator('body[data-screen="pause"],body[data-screen="results"],body[data-screen="title"]').waitFor();
  if(await page.locator('body').getAttribute('data-screen')!=='title')
    await page.locator('[data-action="title"]').click();
  await page.locator('body[data-screen="title"]').waitFor();
  await page.locator('[data-action="practice"]').click();
  await page.locator('body[data-screen="select"]').waitFor();
  await chooseLoadout();
  await finishTutorial();
  assert.equal(await page.locator('#run-timer').getAttribute('data-practice'),'true');
  const original = await page.evaluate(() => ({
    feedback: window.streetSkate.skater.feedback,
    feedbackTime: window.streetSkate.skater.feedbackTime,
  }));
  try {
    const cases = [
      { tone:'fire', label:'INDY 999999999999', width:800, height:450 },
      { tone:'gold', label:'50-50 999999999999', width:360, height:640 },
      { tone:'red', label:'BAIL 999999999999', width:800, height:450 },
    ];
    for(const item of cases){
      await page.setViewportSize({width:item.width,height:item.height});
      await page.evaluate(label=>{
        const skater=window.streetSkate.skater;
        skater.feedback=label;skater.feedbackTime=12;
      },item.label);
      await page.waitForFunction(label=>{
        const node=document.querySelector('#trick-feedback');
        const imgs=[...node?.querySelectorAll('.graffiti-word img')||[]];
        return node?.dataset.graffitiText===label && imgs.length>=10 &&
          imgs.every(img=>img.complete&&img.naturalWidth>0);
      },item.label,{timeout:30000});
      await page.waitForTimeout(140);
      const result=await page.locator('#trick-feedback').evaluate(node=>{
        const imgs=[...node.querySelectorAll('.graffiti-word img')];
        const rects=imgs.map(img=>img.getBoundingClientRect());
        const viewport={width:innerWidth,height:innerHeight};
        const inside=rects.every(r=>r.width>1 && r.height>1
          && r.left>=3 && r.right<=innerWidth-3
          && r.top>=4 && r.bottom<=innerHeight-4);
        return {inside,count:imgs.length,
          minX:Math.min(...rects.map(r=>r.left)),
          maxX:Math.max(...rects.map(r=>r.right)),
          minY:Math.min(...rects.map(r=>r.top)),
          maxY:Math.max(...rects.map(r=>r.bottom)),
          variable:getComputedStyle(imgs[0]).getPropertyValue('--letter-height'),
          viewport};
      });
      assert.ok(result.inside,`cropped ${item.tone} score sprites: ${JSON.stringify(result)}`);
      await page.screenshot({path:join(out,`hud-${item.tone}-${item.width}.png`),fullPage:true});
    }
  }finally{
    await page.evaluate(original=>{
      const skater=window.streetSkate.skater;
      skater.feedback=original.feedback;
      skater.feedbackTime=original.feedbackTime;
    },original);
    await page.setViewportSize({width:800,height:450});
  }
 });
 await checked('camera modes, manual pause, focus loss and resume',async()=>{
  for(const mode of ['classic','fixed','follow']){
   await page.evaluate(m=>window.streetSkate.setCameraMode(m),mode);
   assert.equal((await page.locator('#camera-label').textContent()).trim(),mode.toUpperCase());
  }
  await page.keyboard.press('Escape');
  await page.locator('body[data-screen="pause"]').waitFor();
  await page.locator('[data-action="resume"]').click();
  await page.locator('body[data-screen="playing"]').waitFor();
  await page.evaluate(()=>window.dispatchEvent(new Event('blur')));
  await page.waitForFunction(()=>document.querySelector('#app')?.dataset.paused==='true');
  // GameShell owns the pause menu. Its legacy #pause-overlay is intentionally
  // hidden by game-shell.css, so require the *actual* visible pause controls.
  await page.locator('body[data-screen="pause"]').waitFor();
  assert.equal(await page.locator('#game-shell').isVisible(),true);
  assert.equal(await page.locator('[data-action="resume"]').isVisible(),true);
  await page.evaluate(()=>window.streetSkate.setPaused(false));
  await page.waitForFunction(()=>document.querySelector('#app')?.dataset.paused==='false');
 });
 await checked('repeat run, practice mode and restart',async()=>{
  await page.keyboard.press('Escape');
  await page.locator('body[data-screen="pause"]').waitFor();
  await page.locator('[data-action="title"]').click();
  await page.locator('body[data-screen="title"]').waitFor();
  await page.locator('[data-action="options"]').click();
  await page.locator('[data-action="practice"]').click();
  await page.locator('body[data-screen="select"]').waitFor();
  await chooseLoadout();
  await finishTutorial();
  await stats('practice-2');
  await page.keyboard.press('Escape');
  await page.locator('[data-action="restart"]').click();
  await page.locator('body[data-screen="playing"]').waitFor();
  await stats('practice-restart-3');
  await page.screenshot({path:join(out,'practice-restart.png'),fullPage:true});
 });
 await checked('all five stock GLB riders load and bind without stale resources',async()=>{
  const avatars=[
   ['hollow','/assets/rider/thehollowf.glb'],
   ['heretic','/assets/rider/The_Heretic.glb'],
   ['adolescent','/assets/rider/The_AdolescentUR.glb'],
   ['anchor','/assets/rider/The_Anchor.glb'],
   ['tuxr','/assets/rider/TuxR.glb'],
  ];
  const metrics=[];
  for(const [name,url] of avatars){
   const detail=await page.evaluate(async asset=>{
    const skater=window.streetSkate.skater;
    const rider=await skater.setRiderModel(asset);
    let meshCount=0;
    rider.model.traverse(node=>{if(node.isMesh)meshCount++;});
    const required=['pelvis','head','upperarm_l','upperarm_r','thigh_l','thigh_r','foot_l','foot_r'];
    return {meshCount,boneCount:rider.rigAudit?.boneCount??0,
     requiredRig:required.every(b=>!!rider.bones?.[b]),
     attached:rider.root.parent===skater.visual,
     geometries:window.streetSkate.renderer.info.memory.geometries,
     textures:window.streetSkate.renderer.info.memory.textures};
   },url);
   assert.ok(detail.meshCount>0,name+' has no visible model meshes');
   assert.ok(detail.boneCount>0&&detail.requiredRig,name+' has an invalid rig');
   assert.equal(detail.attached,true,name+' avatar not attached to board rig');
   metrics.push({name,...detail});
   await page.screenshot({path:join(out,'rider-'+name+'.png'),fullPage:true});
   // Capture an orthographic-like closer perspective of soles/knees and board,
   // without permanently changing the Follow/Classic/Fixed camera controls.
   const visual=await page.evaluate(() => {
     const game=window.streetSkate, rider=game.skater.rider, board=game.skater.board;
     const camera=game.camera;
     const previousPosition=camera.position.clone(), previousRotation=camera.quaternion.clone();
     const anchor=rider.root.getWorldPosition(camera.position.clone());
     const gaps={};
     rider.root.updateWorldMatrix(true,true);
     board.root.updateWorldMatrix(true,true);
     for (const side of ['l','r']) {
       const bone=rider.bones?.['foot_'+side];
       if (!bone) continue;
       const foot=bone.getWorldPosition(camera.position.clone());
       const inBoard=board.root.worldToLocal(foot);
       const top=(board.contactRig.deckTopY||board.deckHeight)-board.deckHeight;
       gaps[side]=Number((inBoard.y-top-rider.soleOffsets[side]).toFixed(4));
     }
     camera.position.copy(anchor).add({x:2.6,y:1.7,z:2.5});
     camera.lookAt(anchor.x,anchor.y+0.5,anchor.z);
     camera.updateMatrixWorld(true);
     game.renderer.render(game.scene,camera);
     const png=game.renderer.domElement.toDataURL('image/png').split(',')[1];
     camera.position.copy(previousPosition);
     camera.quaternion.copy(previousRotation);
     camera.updateMatrixWorld(true);
     return {png,gaps};
   });
   console.log('AGENT10 SOLE CLEARANCE '+name+' '+JSON.stringify(visual.gaps));
   if(visual.png) await writeFile(join(out,'rider-closeup-'+name+'.png'),Buffer.from(visual.png,'base64'));

   // Independently pose each stock rig using the same procedural IK as gameplay.
   const posed=await page.evaluate(() => {
     const game=window.streetSkate,skater=game.skater,rider=skater.rider;
     const board=skater.board,camera=game.camera;
     // The preceding live practice can leave the board tumbling in a bail.
     // Test a skating pose from a known ground state, not on a fallen board.
     skater.reset();
     const oldPosition=camera.position.clone(),oldRotation=camera.quaternion.clone();
     const images={},metrics={};
     for(const pose of ['crouch','grab']){
       rider.resetPresentation();
       const grab=pose==='grab';
       for(let i=0;i<18;i++){
         rider.update({board,presentation:{state:grab?'AIR':'CROUCH'},
           crouch:grab?0:1,grabState:grab?{name:'Indy'}:null,
           grabWeight:grab?1:0,dt:1/60,stance:1});
       }
       rider.root.updateMatrixWorld(true);board.root.updateMatrixWorld(true);
       const world=()=>camera.position.clone();
       const pelvis=rider.bones.pelvis.getWorldPosition(world());
       const localPelvis=board.root.worldToLocal(pelvis);
       const top=(board.contactRig.deckTopY??board.deckHeight)-board.deckHeight;
       const knees={};
       for(const side of ['l','r']){
         const hip=rider.bones['thigh_'+side].getWorldPosition(world());
         const knee=rider.bones['calf_'+side].getWorldPosition(world());
         const h=rider.root.worldToLocal(hip), k=rider.root.worldToLocal(knee);
         knees[side]=Number(((k.x-h.x)*rider.outward[side]).toFixed(3));
       }
       // A common pelvis-pivot height penalizes short, safely tucked rigs.
       // Check the actual deformed torso above the board footprint instead.
       const trunkBones=new Set(['pelvis','spine_01','spine_02','spine_03']
         .map(name=>rider.bones[name]).filter(Boolean));
       let trunkSamples=0,minTrunkClearance=Infinity;
       rider.model.traverse(mesh=>{
         if(!mesh.isSkinnedMesh)return;
         mesh.skeleton.update();
         const weights=mesh.geometry.attributes.skinWeight,indices=mesh.geometry.attributes.skinIndex;
         if(!weights||!indices)return;
         for(let vertex=0;vertex<weights.count;vertex++){
           let weight=0;
           for(let component=0;component<4;component++)
             if(trunkBones.has(mesh.skeleton.bones[indices.getComponent(vertex,component)]))
               weight+=weights.getComponent(vertex,component);
           if(weight<.55)continue;
           const point=board.root.worldToLocal(mesh.getVertexPosition(vertex,world()).applyMatrix4(mesh.matrixWorld));
           if(Math.abs(point.x)<=board.contactRig.deckWidth*.5&&Math.abs(point.z)<=board.contactRig.deckLength*.5){
             trunkSamples++;minTrunkClearance=Math.min(minTrunkClearance,point.y-top);
           }
         }
       });
       metrics[pose]={hipsAboveDeck:Number((localPelvis.y-top).toFixed(3)),knees,trunkSamples,minTrunkClearance};
       const center=rider.root.getWorldPosition(world());
       camera.position.copy(center).add({x:2.5,y:1.6,z:2.7});
       camera.lookAt(center.x,center.y+0.7,center.z);
       camera.updateMatrixWorld(true);
       game.renderer.render(game.scene,camera);
       images[pose]=game.renderer.domElement.toDataURL('image/png').split(',')[1];
     }
     camera.position.copy(oldPosition);camera.quaternion.copy(oldRotation);
     camera.updateMatrixWorld(true);rider.resetPresentation();skater.update(0,{},0);
     return {metrics,images,fixture:{grounded:skater.grounded,bailTime:skater.bailTime}};
   });
   console.log('AGENT10 ANIMATION POSE '+name+' '+JSON.stringify(posed.metrics));
   assert.equal(posed.fixture.grounded,true,name+' pose fixture must start grounded');
   assert.equal(posed.fixture.bailTime,0,name+' pose fixture must not be bailing');
   for(const pose of ['crouch','grab']){
     assert.ok(posed.metrics[pose].hipsAboveDeck>0,name+' pelvis intersects board during '+pose);
     assert.ok(posed.metrics[pose].trunkSamples>0&&posed.metrics[pose].minTrunkClearance>=.02,
       name+' deformed torso must clear the board by 2cm during '+pose+': '+JSON.stringify(posed.metrics[pose]));
     assert.ok(Number.isFinite(posed.metrics[pose].knees.l)&&
       Number.isFinite(posed.metrics[pose].knees.r),name+' knee IK must be finite');
     if(posed.images[pose]) await writeFile(join(out,'rider-'+name+'-'+pose+'.png'),
       Buffer.from(posed.images[pose],'base64'));
   }

  }
  console.log('AGENT10 FIVE RIDERS '+JSON.stringify(metrics));
 });
 await checked('90-second results screen, score and return to title',async()=>{
  await page.keyboard.press('Escape');
  await page.locator('body[data-screen="pause"]').waitFor();
  await page.locator('[data-action="title"]').click();
  await page.locator('body[data-screen="title"]').waitFor();
  await page.locator('[data-action="start"]').click();
  await page.locator('body[data-screen="select"]').waitFor();
  await chooseLoadout();
  await finishTutorial();
  // Exercise real in-game countdown; no timer bypass or fake result screen.
  await page.waitForFunction(()=>document.body.dataset.screen==='results',null,{timeout:160000});
  assert.match(await page.locator('.result-score').textContent(),/FINAL POINTS/);
  const runScore=await page.evaluate(()=>{
    const integer=text=>Number(String(text).replace(/[^0-9]/g,''));
    const metric=label=>{
      const row=[...document.querySelectorAll('.run-stat')].find(node=>node.querySelector('dt')?.textContent.trim()===label);
      return integer(row.querySelector('dd').textContent);
    };
    return {
      banked:integer(document.querySelector('[data-banked-score]').textContent),
      final:integer(document.querySelector('[data-final-score]').textContent),
      liveBanked:integer(document.querySelector('#score-value').textContent),
      combos:metric('LANDED COMBOS'),tricks:metric('TRICKS LANDED'),
      unique:metric('UNIQUE TRICKS'),bails:metric('BAILS'),
    };
  });
  const expectedFinal=Math.max(0,Math.round(runScore.banked
    *(100+Math.min(100,5*runScore.unique))/100)-250*runScore.bails);
  assert.equal(runScore.final,expectedFinal,'Final score must apply line-score-v2 variety and bail deductions');
  assert.equal(runScore.banked,runScore.liveBanked,'Final weighting must preserve the underlying gameplay score');
  await page.screenshot({path:join(out,'timed-results.png'),fullPage:true});
  await page.locator('[data-action="title"]').click();
  await page.locator('body[data-screen="title"]').waitFor();
 });
 const rejections=await page.evaluate(()=>window.__agent10Unhandled||[]);
 assert.deepEqual(report.pageErrors,[],'Uncaught runtime page errors');
 assert.deepEqual(rejections,[],'Unhandled Promise rejections');
 report.result='passed';
 console.log('AGENT10 PRODUCTION QA PASS: '+report.checks.length+' scenarios');
}catch(error){
 report.result='failed';report.error=String(error.stack||error);
 console.error('AGENT10 PRODUCTION QA FAILED',report.error);
 try{await page.screenshot({path:join(out,'failure.png'),fullPage:true,timeout:5000});}catch{}
 process.exitCode=1;
}finally{
 report.finished=new Date().toISOString();
 await writeFile(join(out,'telemetry.json'),JSON.stringify(report,null,2));
 await browser.close();
}
