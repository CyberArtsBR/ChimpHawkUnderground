import {auditUrl,launchAuditBrowser}from'./quality-browser-runtime.mjs';
import{mkdir,writeFile}from'node:fs/promises';
const out='artifacts/quality-pass/evidence';await mkdir(out,{recursive:true});
const browser=await launchAuditBrowser();
const page=await browser.newPage({viewport:{width:1280,height:720}});
try{
 await page.goto(auditUrl);await page.waitForFunction(()=>window.streetSkate?.ready,{timeout:90000});
 await page.evaluate(async()=>{
  const g=window.streetSkate;await g.selectLocation('grand-warehouse');
  await g.skater.setRiderModel('/assets/rider/The_AdolescentUR.glb');
  g.setPaused(true);g.renderer.setAnimationLoop(null);
  document.querySelector('#game-shell').hidden=true;document.body.dataset.screen='capture';
  g.skater.visual.visible=true;
 });
 const comparisons=[];
 for(const variant of ['before','after']){
  const data=await page.evaluate(async variant=>{
   const{supportMatchesOriginalTransition}=await import('/src/game/SafeCopingExitSkillStreetPhysics.js');
   const g=window.streetSkate,s=g.skater;
   s.reset(s.position.clone().set(3,.1,-40.8),0);s.velocity.copy(s.forward).multiplyScalar(17);
   const fixed=s.deferTransitionImpact;
   if(variant==='before')s.deferTransitionImpact=function(impact){
    return Boolean(this.transitionAir&&!this.transitionAir.transferring
      &&supportMatchesOriginalTransition(impact,this.transitionAir));
   };
   g.setCopingTrace(true,720);
   const stream=g.renderer.domElement.captureStream(30),chunks=[];
   const recorder=new MediaRecorder(stream,{mimeType:'video/webm;codecs=vp9',videoBitsPerSecond:2500000});
   const stopped=new Promise(resolve=>recorder.onstop=resolve);recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data)};
   const frames=[];let returned=false,launched=false;recorder.start();
   for(let i=0;i<300;i++){
    await new Promise(requestAnimationFrame);s.update(1/60,{},i/60);
    launched ||=!!s.transitionAir;returned ||=launched&&s.grounded&&s.velocity.y<-.5;
    g.camera.position.set(19,11,-40);g.camera.lookAt(3,4,-48);
    g.renderer.render(g.scene,g.camera);
    if([90,120,150,180,240,299].includes(i))frames.push({frame:i,time:i/60,
      position:s.position.toArray(),velocity:s.velocity.toArray(),grounded:s.grounded,
      image:g.renderer.domElement.toDataURL('image/png').split(',')[1]});
   }
   recorder.stop();await stopped;stream.getTracks().forEach(track=>track.stop());s.deferTransitionImpact=fixed;
   const blob=new Blob(chunks,{type:'video/webm'});
   const video=await new Promise(resolve=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result.split(',')[1]);reader.readAsDataURL(blob)});
   return{variant,returned,frames,video,trace:g.captureCopingTrace()};
  },variant);
  await writeFile(`${out}/coping-${variant}.webm`,Buffer.from(data.video,'base64'));
  for(const frame of data.frames)await writeFile(`${out}/${variant}-${frame.frame}.png`,Buffer.from(frame.image,'base64'));
  const metadata={variant,returned:data.returned,frames:data.frames.map(({image,...f})=>f),trace:data.trace};
  await writeFile(`${out}/coping-${variant}.json`,JSON.stringify(metadata,null,2));comparisons.push({variant,returned:data.returned});
 }
 for(const [label,progress] of [['pop',.14],['flick',.4],['catch',.86],['planted',.96]]){
  await page.evaluate(async progress=>{
   const{FLIP_TRICKS}=await import('/src/game/TrickCatalog.js');const g=window.streetSkate,s=g.skater;
   s.reset(s.position.clone().set(3,.1,-40.8),0);s.position.set(3,3,-40.8);
   s.grounded=false;s.movementState='AIR';s.normal.set(0,1,0);s.velocity.set(0,0,0);s.airTime=.5;
   s.flipState={...FLIP_TRICKS.left,progress};const advance=s.advance;s.advance=()=>{};
   for(let i=0;i<20;i++)s.update(1/60,{},i/60);s.advance=advance;
   g.camera.position.set(9,5,-39);g.camera.lookAt(3,3.8,-40.8);g.renderer.render(g.scene,g.camera);
  },progress);
  await page.screenshot({path:`${out}/animation-${label}-side.png`});
  await page.evaluate(()=>{const g=window.streetSkate;g.camera.position.set(3,4.4,-34);g.camera.lookAt(3,3.8,-40.8);g.renderer.render(g.scene,g.camera)});
  await page.screenshot({path:`${out}/animation-${label}-front.png`});
 }
 console.log(JSON.stringify(comparisons));
}finally{await browser.close()}
