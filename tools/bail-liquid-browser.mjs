import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {launchAuditBrowser} from './quality-browser-runtime.mjs';
const out=process.env.BAIL_AUDIT_OUTPUT||'artifacts/bail-liquid-v2';await mkdir(out,{recursive:true});
const browser=await launchAuditBrowser();
try {
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(process.env.STREETSKATE_URL||'http://127.0.0.1:5182/');
  await page.waitForFunction(()=>window.streetSkate?.ready,null,{timeout:90000});
  await page.locator('[data-action="practice"]').click();
  await page.locator('[data-action="hero"][data-index="0"]').click();
  await page.locator('[data-action="board"][data-index="6"]').click();
  await page.locator('[data-action="confirmLoadout"]').click();
  await page.locator('body[data-screen="playing"]').waitFor({timeout:90000});
  await page.evaluate(()=>{
    const s=window.streetSkate.skater;
    window.bailOrigin=s.position.toArray();s.velocity.set(0,-3,-4);s.bail('QA impact');
    // Preserve the rendered impact pose briefly for a repeatable splash capture.
    const original=s.update.bind(s);let frames=0;
    s.update=function(...args){if(s.rider.ragdoll.groundImpact&&++frames>8)return;return original(...args);};
  });
  await page.waitForFunction(()=>window.streetSkate.scene.children.find(o=>o.userData.skateEffects)
    ?.children.some(o=>o.userData.bailLiquid&&o.visible),null,{timeout:10000});
  await page.screenshot({path:`${out}/impact.png`});
  const report=await page.evaluate(()=>{
    const g=window.streetSkate,impact=g.skater.rider.ragdoll.groundImpact;
    const fx=g.scene.children.find(o=>o.userData.skateEffects),p=fx.children.find(o=>o.userData.bailLiquid&&o.visible);
    p.geometry.computeBoundingBox();
    return {origin:window.bailOrigin,impact,position:p.position.toArray(),bounds:p.geometry.boundingBox,
      physical:p.material.isMeshPhysicalMaterial,clearcoat:p.material.clearcoat,
      glow:g.graphicsStatus().bloomEnabled,environment:Boolean(g.scene.environment),errors:[]};
  });
  assert.ok(['pelvis','spine_03','head'].includes(report.impact.body));
  assert.ok(report.physical);assert.equal(report.clearcoat,1);
  const point=report.impact.point,n=report.impact.normal;
  assert.ok(Math.hypot(...report.position.map((v,i)=>v-[point.x+n.x*.003,point.y+n.y*.003,point.z+n.z*.003][i]))<.00001);
  await page.waitForTimeout(350);
  await page.screenshot({path:`${out}/settled.png`});
  await page.evaluate(()=>{
    const g=window.streetSkate,p=g.skater.rider.ragdoll.groundImpact.point,render=g.renderer.render;
    g.renderer.render=function(scene,camera){
      if(camera===g.camera){camera.position.set(p.x+1.4,p.y+.65,p.z+1.5);camera.lookAt(p.x,p.y,p.z);}
      return render.call(this,scene,camera);
    };
  });
  await page.waitForTimeout(100);await page.screenshot({path:`${out}/surface-detail.png`});
  assert.deepEqual(errors,[]);report.errors=errors;
  await writeFile(`${out}/report.json`,JSON.stringify(report,null,2));console.log(JSON.stringify(report));
} finally {await browser.close();}
