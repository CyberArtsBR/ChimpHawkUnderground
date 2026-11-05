import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { launchAuditBrowser } from './quality-browser-runtime.mjs';

const browser=await launchAuditBrowser(),page=await browser.newPage({viewport:{width:1280,height:720}});
const errors=[];page.on('pageerror',error=>errors.push(error.message));
await mkdir('artifacts/trick-hud-stability',{recursive:true});
try{
 await page.goto(process.env.STREETSKATE_URL||'http://127.0.0.1:5182/');
 await page.waitForFunction(()=>window.streetSkate?.ready,null,{timeout:120000});
 await page.locator('[data-action="practice"]').click();
 await page.locator('[data-action="hero"]').first().click();
 await page.locator('[data-action="board"]').first().click();
 await page.locator('[data-action="confirmLoadout"]').click();
 await page.locator('body[data-screen="playing"]').waitFor({timeout:120000});
 await page.evaluate(()=>{
  const s=window.streetSkate.skater;
  window.__hudOriginalUpdate=s.update;s.update=()=>{};
  s.bailTime=0;s.feedback='OLLIE · +100';s.feedbackTime=30;
 });
 await page.waitForFunction(()=>document.querySelector('#trick-feedback .graffiti-ready')?.getAttribute('aria-label')==='OLLIE · +100',null,{timeout:15000});
 await page.route('**/assets/graffiti/cyan-purple/Q.png',async route=>{await new Promise(resolve=>setTimeout(resolve,500));await route.continue();});
 await page.evaluate(()=>{
  window.__hudFlashes=[];
  window.__hudPoll=setInterval(()=>{
   const hud=document.querySelector('#trick-feedback'),fallback=hud.querySelector('.graffiti-fallback');
   if(fallback&&getComputedStyle(fallback).display!=='none'&&getComputedStyle(fallback).visibility!=='hidden')
    window.__hudFlashes.push({text:fallback.textContent,classes:fallback.parentElement.className});
  },10);
  const s=window.streetSkate.skater;s.feedback='QUICKFLIP · +100';s.feedbackTime=30;
 });
 await page.waitForTimeout(180);
 const interim=await page.locator('#trick-feedback .graffiti-lettering').getAttribute('aria-label');
 assert.equal(interim,'OLLIE · +100','Keep the previous graffiti visible while new artwork loads');
 await page.waitForFunction(()=>document.querySelector('#trick-feedback .graffiti-ready')?.getAttribute('aria-label')==='QUICKFLIP · +100',null,{timeout:15000});
 await page.screenshot({path:'artifacts/trick-hud-stability/graffiti.png'});
 await page.evaluate(()=>new Promise(resolve=>{
  const s=window.streetSkate.skater;let i=0;
  const timer=setInterval(()=>{s.feedback=`KICKFLIP · +${100+i}`;s.feedbackTime=30;if(++i===30){clearInterval(timer);resolve();}},10);
 }));
 await page.waitForFunction(()=>document.querySelector('#trick-feedback .graffiti-ready')?.getAttribute('aria-label')==='KICKFLIP · +129',null,{timeout:15000});
 await page.route('**/assets/graffiti/fire/Q.png',async route=>{await new Promise(resolve=>setTimeout(resolve,600));await route.continue();});
 await page.evaluate(()=>{const s=window.streetSkate.skater;s.feedback='Q INDY · +200';s.feedbackTime=30;});
 await page.waitForTimeout(100);
 await page.evaluate(()=>{const s=window.streetSkate.skater;s.feedback='KICKFLIP · +129';s.feedbackTime=30;});
 await page.waitForTimeout(900);
 assert.equal(await page.locator('#trick-feedback .graffiti-lettering').getAttribute('aria-label'),'KICKFLIP · +129','A late sprite must not bring back an older trick');
 await page.route('**/assets/graffiti/red/B.png',async route=>{await new Promise(resolve=>setTimeout(resolve,500));await route.continue();});
 await page.evaluate(()=>{const s=window.streetSkate.skater;s.bailTime=1;s.feedback='BAIL';s.feedbackTime=30;});
 await page.waitForTimeout(180);
 assert.equal(await page.locator('#trick-feedback .graffiti-lettering').count(),0,'Cancelled combo points must disappear immediately on a bail');
 await page.waitForFunction(()=>document.querySelector('#trick-feedback .graffiti-ready')?.getAttribute('aria-label')==='BAIL',null,{timeout:15000});
 const flashes=await page.evaluate(()=>{clearInterval(window.__hudPoll);return window.__hudFlashes;});
 assert.deepEqual(flashes,[],'Plain fallback must not flash while artwork loads');

 // A genuinely missing sprite keeps feedback readable instead of disappearing.
 await page.route('**/assets/graffiti/gold/Q.png',route=>route.abort());
 await page.evaluate(()=>{const s=window.streetSkate.skater;s.bailTime=0;s.feedback='Q GRIND · +100';s.feedbackTime=30;});
 await page.waitForFunction(()=>document.querySelector('#trick-feedback .graffiti-failed')?.getAttribute('aria-label')==='Q GRIND · +100',null,{timeout:15000});
 assert.equal(await page.locator('#trick-feedback .graffiti-fallback').isVisible(),true);

 // Verify that an actual ollie still displays its name and points in gameplay.
 await page.evaluate(()=>{const s=window.streetSkate.skater;s.update=window.__hudOriginalUpdate;s.reset();});
 await page.keyboard.down('Space');await page.waitForTimeout(300);await page.keyboard.up('Space');
 await page.waitForFunction(()=>/ollie/i.test(document.querySelector('#trick-feedback .graffiti-ready')?.getAttribute('aria-label')||''),null,{timeout:15000});
 assert.deepEqual(errors,[]);
 console.log('PASS: graffiti stays stable through loading, score changes, and missing artwork');
}finally{await browser.close()}
