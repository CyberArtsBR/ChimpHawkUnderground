import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch({headless:true,channel:'chrome',args:['--enable-unsafe-swiftshader']});
await mkdir('artifacts/menu-audit',{recursive:true});
try {
  const page=await browser.newPage({viewport:{width:1024,height:600}});
  await page.goto('http://127.0.0.1:5181');
  await page.waitForFunction(()=>window.streetSkate?.ready,null,{timeout:90000});
  for(const id of ['rooftop','urban-warehouse']) {
    if(id==='urban-warehouse') {
      await page.locator('[data-action="options"]').click();
      await page.locator('[data-action="practice"]').click();
      await page.locator('.loadout-character').first().click();
      await page.locator('.loadout-deck').first().click();
      await page.locator('[data-location="urban-warehouse"]').click();
      await page.locator('[data-action="confirmLoadout"]').click();
      await page.locator('body[data-screen="playing"]').waitFor({timeout:90000});
    }
    const png=await page.evaluate(async id=>{
      const g=window.streetSkate;g.setMode('explore');g.setExploreView('overview',true);
      if(id==='rooftop') {g.camera.position.set(40,30,47);g.camera.lookAt(0,0,-8);}
      else {g.camera.position.set(80,48,75);g.camera.lookAt(0,0,-3);}
      await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
      g.renderer.render(g.scene,g.camera);
      return g.renderer.domElement.toDataURL('image/png');
    },id);
    await writeFile(`artifacts/menu-audit/${id}.png`,Buffer.from(png.split(',')[1],'base64'));
  }
} finally {await browser.close();}
