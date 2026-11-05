import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { launchAuditBrowser } from './quality-browser-runtime.mjs';

const browser=await launchAuditBrowser(),page=await browser.newPage({viewport:{width:1280,height:720}});
const errors=[];page.on('pageerror',error=>errors.push(error.message));
await mkdir('artifacts/balance-direction',{recursive:true});
try{
 await page.goto(process.env.STREETSKATE_URL||'http://127.0.0.1:5182/');
 await page.waitForFunction(()=>window.streetSkate?.ready,null,{timeout:120000});
 await page.locator('[data-action="practice"]').click();
 await page.locator('[data-action="hero"]').first().click();
 await page.locator('[data-action="board"]').first().click();
 await page.locator('[data-action="confirmLoadout"]').click();
 await page.locator('body[data-screen="playing"]').waitFor({timeout:120000});
 await page.waitForTimeout(400);

 // Enter a real manual using the normal keyboard sequence.
 await page.evaluate(()=>{
  const s=window.streetSkate.skater;s.reset();
  s.velocity.copy(s.forward).multiplyScalar(8);s.speed=8;
 });
 await page.keyboard.press('KeyW',{delay:70});await page.keyboard.press('KeyS',{delay:70});
 await page.waitForFunction(()=>window.streetSkate.skater.manual==='manual',null,{timeout:10000});
 await page.waitForFunction(()=>document.querySelector('#balance-hud')?.dataset.axis==='vertical');
 await page.evaluate(()=>{
  const s=window.streetSkate.skater;
  Object.assign(s.manualBalanceState,{value:.45,velocity:0,bias:0,phase:0,disturbance:0});
  s.manualBalance=.45;
 });
 await page.keyboard.down('KeyS');await page.waitForTimeout(180);await page.keyboard.up('KeyS');
 const manual=await page.evaluate(()=>({value:window.streetSkate.skater.manualBalance,mode:window.streetSkate.skater.manual}));
 assert.equal(manual.mode,'manual');assert.ok(manual.value<.45&&manual.value>0,'Down should recover an upward manual marker');
 await page.screenshot({path:'artifacts/balance-direction/manual-720.png'});

 // Start an actual rail capture at an authored rail and use keyboard input.
 const capture=await page.evaluate(()=>{
  const s=window.streetSkate.skater;s.reset();
  const rails=[...s.railNetwork.rails].filter(rail=>!rail.closed&&rail.length>4).sort((a,b)=>b.length-a.length);
  for(const rail of rails){
   const point=s.railNetwork.sample(rail,rail.length*.2,{clearance:.12});
   if(!point||Math.abs(point.tangent.y)>.3)continue;
   s.position.copy(point.point);s.velocity.copy(point.tangent).multiplyScalar(4);s.velocity.y=Math.min(s.velocity.y,-.1);
   s.forward.copy(point.tangent).setY(0).normalize();s.heading=Math.atan2(-s.forward.x,-s.forward.z);s.airHeading=s.heading;
   s.setMovementState('AIR');s.airTime=.2;s.contactCooldown=0;s.grindReentryGuard=null;
   if(s.enterGrind({name:'50-50',points:150})){
    s.grind.blendElapsed=s.grind.blendDuration;
    Object.assign(s.grind.balanceState,{value:.45,velocity:0,bias:0,phase:0,disturbance:0});
    s.grind.balance=.45;s.grindBalance=.45;
    return {captured:true,rail:rail.name,length:rail.length};
   }
  }
  return {captured:false,count:rails.length};
 });
 assert.equal(capture.captured,true,'Expected to capture an authored rail');
 await page.keyboard.down('KeyA');await page.waitForTimeout(180);await page.keyboard.up('KeyA');
 const grind=await page.evaluate(()=>({value:window.streetSkate.skater.grindBalance,active:!!window.streetSkate.skater.grind}));
 assert.equal(grind.active,true,'The grind must remain attached during correction');
 assert.ok(grind.value<.45&&grind.value>0,'Left should recover a rightward grind marker');

 // Inspect both marker axes at positive and negative balance values.
 const marker=await page.evaluate(async()=>{
  const s=window.streetSkate.skater;window.__balanceOriginalUpdate=s.update;s.update=()=>{};
  const hud=s.balanceHud,read=()=>{const track=hud.root.querySelector('.balance-track').getBoundingClientRect(),marker=hud.marker.getBoundingClientRect();
   return {axis:hud.root.dataset.axis,x:marker.left+marker.width/2-track.left,y:marker.top+marker.height/2-track.top,width:track.width,height:track.height};};
  const settle=()=>new Promise(resolve=>setTimeout(resolve,100));
  hud.update('MANUAL',.65);await settle();const manualUp=read();hud.update('MANUAL',-.65);await settle();const manualDown=read();
  hud.update('GRIND',.65);await settle();const grindRight=read();hud.update('GRIND',-.65);await settle();const grindLeft=read();
  return {manualUp,manualDown,grindRight,grindLeft};
 });
 assert.equal(marker.manualUp.axis,'vertical');assert.ok(marker.manualUp.y<marker.manualUp.height/2);
 assert.ok(marker.manualDown.y>marker.manualDown.height/2);
 assert.equal(marker.grindRight.axis,'horizontal');assert.ok(marker.grindRight.x>marker.grindRight.width/2);
 assert.ok(marker.grindLeft.x<marker.grindLeft.width/2);
 await page.screenshot({path:'artifacts/balance-direction/grind-720.png'});
 await page.setViewportSize({width:1920,height:1080});
 await page.evaluate(()=>window.streetSkate.skater.balanceHud.update('MANUAL',.5));
 const bounds=await page.locator('#balance-hud').boundingBox();
 assert.ok(bounds.x>=0&&bounds.y>=0&&bounds.x+bounds.width<=1920&&bounds.y+bounds.height<=1080);
 await page.screenshot({path:'artifacts/balance-direction/manual-1080.png'});
 assert.deepEqual(errors,[]);
 console.log('PASS: manual correction and both balance-meter axes');
}finally{await browser.close()}
