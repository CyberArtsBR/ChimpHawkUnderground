import { createRequire } from 'node:module';
import { writeFile } from 'node:fs/promises';
const require = createRequire(import.meta.url);
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({headless:true,channel:'chrome',args:['--enable-unsafe-swiftshader']});
try {
 const page=await browser.newPage({viewport:{width:1200,height:900}});
 await page.goto(process.env.STREETSKATE_URL || 'http://127.0.0.1:5181');
 await page.waitForFunction(()=>window.streetSkate?.ready,null,{timeout:60000});
 await page.locator('[data-action="options"]').click();
 await page.locator('[data-action="practice"]').click();
 await page.locator('.loadout-character').first().click();
 await page.locator('.loadout-deck').nth(2).click();
 await page.locator('.loadout-location').filter({hasText:'URBAN WAREHOUSE'}).click();
 await page.locator('[data-action="confirmLoadout"]').click();
 await page.locator('body[data-screen="playing"]').waitFor({timeout:60000});
 await page.waitForFunction(()=>window.streetSkate.currentLocation==='urban-warehouse');
 await page.evaluate(()=>{ const g=window.streetSkate;g.skater.reset();g.skater.position.set(0,.015,40);g.skater.velocity.set(0,0,0);g.skater.update(0,{},0);g.setMode('explore'); });
 await page.waitForTimeout(2000);
 const data=await page.evaluate(()=>{
  const r=window.streetSkate.skater.rider;
  const bones={};for(const [key,b] of Object.entries(r.bones)) if(/thigh|calf|foot|upperarm|lowerarm|hand/.test(key))bones[key]={point:r.root.worldToLocal(b.getWorldPosition(r.root.position.clone())).toArray(),q:b.quaternion.toArray()};
  return {url:r.url,outward:r.outward,poles:r.kneePoles,bones};
 });
 await writeFile('artifacts/collision-audit/rider-pose.json',JSON.stringify(data,null,2));
 for(const [name,offset] of [['front',[0,.8,-2.7]],['side',[2.7,.8,0]],['rear',[0,.8,2.7]]]){
  const png=await page.evaluate(offset=>{const g=window.streetSkate;const p=g.skater.position;g.camera.position.set(p.x+offset[0],p.y+offset[1],p.z+offset[2]);g.camera.lookAt(p.x,p.y+.65,p.z);g.renderer.render(g.scene,g.camera);return g.renderer.domElement.toDataURL();},offset);
  await writeFile(`artifacts/collision-audit/rider-${process.env.POSE_LABEL||'before'}-${name}.png`,Buffer.from(png.split(',')[1],'base64'));
 }
 const checks=[];
 for (const name of ['The_Heretic','The_Anchor','The_AdolescentUR','TheanchoURi','TuxR']) {
  const check = await page.evaluate(async name=>{
   const g=window.streetSkate;await g.skater.setRiderModel(`/assets/rider/${name}.glb`);g.skater.update(0,{},0);
   const r=g.skater.rider;
   const wrists=['l','r'].map(side=>r.bones['hand_'+side].quaternion.angleTo(r.rest.get(r.bones['hand_'+side])));
   const finite=[...r.rest.keys()].every(b=>b.quaternion.toArray().every(Number.isFinite));
   return {name,wrists,finite};
  },name);
  checks.push(check);
  const png=await page.evaluate(()=>{const g=window.streetSkate,p=g.skater.position;g.camera.position.set(p.x+2.7,p.y+.8,p.z);g.camera.lookAt(p.x,p.y+.65,p.z);g.renderer.render(g.scene,g.camera);return g.renderer.domElement.toDataURL();});
  await writeFile(`artifacts/collision-audit/pose-${name}.png`,Buffer.from(png.split(',')[1],'base64'));
 }
 await writeFile('artifacts/collision-audit/pose-avatar-checks.json',JSON.stringify(checks,null,2));
 if(checks.some(c=>!c.finite || c.wrists.some(angle=>angle>.001)))throw new Error('Nonfinite pose or twisted neutral wrist');
 console.log(JSON.stringify(checks));
} finally {await browser.close();}


