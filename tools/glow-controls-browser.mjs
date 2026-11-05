import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { launchAuditBrowser } from './quality-browser-runtime.mjs';

const browser = await launchAuditBrowser();
const page = await browser.newPage({viewport:{width:1280,height:720}});
const errors = [];
page.on('pageerror', error => errors.push(error.message));
await mkdir('artifacts/glow-controls', {recursive:true});
await page.addInitScript(() => {
  if (!sessionStorage.getItem('glow-qa-initialized')) {
    localStorage.setItem('streetskate.graphicsPreset.v2','cinematic');
    localStorage.setItem('streetskate.bloomEnabled','on');
    sessionStorage.setItem('glow-qa-initialized','yes');
  }
  window.__testPad = {index:0,id:'QA controller',connected:true,axes:[0,0,0,0],
    buttons:Array.from({length:17},()=>({pressed:false,value:0}))};
  Object.defineProperty(navigator,'getGamepads',{configurable:true,value:()=>[window.__testPad]});
});
try {
  await page.goto(process.env.STREETSKATE_URL || 'http://127.0.0.1:5182/');
  await page.waitForFunction(()=>window.streetSkate?.ready,null,{timeout:120000});
  async function openGraphics() {
    await page.locator('[data-action="options"]').click();
    await page.locator('[data-action="graphicsMenu"]').click();
  }
  await openGraphics();
  const output = key => page.locator(`[data-glow-value="${key}"]`);
  const button = index => page.locator(`[data-action="glowAdjust"][data-index="${index}"]`);
  for (const [key,value] of Object.entries({emissive:'1.69×',bloom:'1.00',glow:'0.75',radius:'0.38'}))
    assert.equal(await output(key).textContent(),value);
  await page.locator('.graphics-glow-settings').scrollIntoViewIfNeeded();
  await page.screenshot({path:'artifacts/glow-controls/cinematic-720.png'});

  const originalEmission = await page.evaluate(() => {
    let found = null;
    window.streetSkate.park.traverse(mesh => {
      const m=Array.isArray(mesh.material)?mesh.material[0]:mesh.material;
      if (!found && m?.emissive?.getHex?.() > 0 && m.emissiveIntensity > 0)
        found={uuid:m.uuid,intensity:m.emissiveIntensity};
    });
    return found;
  });
  assert.ok(originalEmission,'expected an emissive park material');
  for (const [index,key,value] of [[1,'emissive','1.74×'],[3,'bloom','1.05'],[5,'glow','0.80'],[7,'radius','0.43']]) {
    await button(index).click();
    assert.equal(await output(key).textContent(),value);
    assert.equal(await page.evaluate(()=>document.activeElement?.dataset.action),'glowAdjust','focus remains on the edited control');
  }
  const changedEmission = await page.evaluate(uuid => {
    let intensity;
    window.streetSkate.park.traverse(mesh => {
      for (const m of Array.isArray(mesh.material)?mesh.material:[mesh.material])
        if (m?.uuid===uuid) intensity=m.emissiveIntensity;
    });
    return intensity;
  },originalEmission.uuid);
  assert.ok(changedEmission > originalEmission.intensity,'emissive control updates the real material');
  let status=await page.evaluate(()=>window.streetSkate.graphicsStatus());
  assert.deepEqual(status.glowTuning,{emissive:1.74,bloom:1.05,glow:.8,radius:.43});

  // Keyboard activation and controller navigation use the same controls.
  await button(1).focus();
  await page.keyboard.press('Enter');
  assert.equal(await output('emissive').textContent(),'1.79×');
  await button(0).focus();
  await page.keyboard.press('Enter');
  assert.equal(await output('emissive').textContent(),'1.74×');
  await button(7).focus();
  await page.evaluate(()=>{window.__testPad.buttons[14].pressed=true;window.__testPad.buttons[14].value=1;});
  await page.waitForFunction(()=>document.activeElement?.dataset.index==='6',null,{timeout:5000});
  await page.evaluate(()=>{window.__testPad.buttons[14].pressed=false;window.__testPad.buttons[14].value=0;});
  await page.waitForTimeout(100);
  await page.evaluate(()=>{window.__testPad.buttons[15].pressed=true;window.__testPad.buttons[15].value=1;});
  await page.waitForFunction(()=>document.activeElement?.dataset.index==='7',null,{timeout:5000});
  await page.evaluate(()=>{window.__testPad.buttons[15].pressed=false;window.__testPad.buttons[15].value=0;});
  await page.waitForTimeout(100);
  // Gamepad A activates the focused adjustment without losing focus.
  await page.evaluate(()=>{window.__testPad.buttons[0].pressed=true;window.__testPad.buttons[0].value=1;});
  await page.waitForFunction(()=>document.querySelector('[data-glow-value="radius"]').textContent==='0.48',null,{timeout:5000});
  await page.evaluate(()=>{window.__testPad.buttons[0].pressed=false;window.__testPad.buttons[0].value=0;});
  await page.waitForTimeout(100);

  await page.reload();
  await page.waitForFunction(()=>window.streetSkate?.ready,null,{timeout:120000});
  await openGraphics();
  for (const [key,value] of Object.entries({emissive:'1.74×',bloom:'1.05',glow:'0.80',radius:'0.48'}))
    assert.equal(await output(key).textContent(),value,'saved value survives reload');
  await page.locator('[data-action="graphicsSet"][data-index="1"]').click();
  assert.equal(await output('emissive').textContent(),'0.80×','144 FPS has independent settings');
  await page.locator('[data-action="graphicsSet"][data-index="5"]').click();
  assert.equal(await output('emissive').textContent(),'1.74×','Cinematic retains its own settings');
  await page.locator('[data-action="bloomToggle"]').click();
  status=await page.evaluate(()=>window.streetSkate.graphicsStatus());
  assert.equal(status.bloomEnabled,false);assert.equal(status.glowTuning.bloom,1.05);
  await page.locator('[data-action="bloomToggle"]').click();
  status=await page.evaluate(()=>window.streetSkate.graphicsStatus());
  assert.equal(status.bloomEnabled,true);assert.equal(status.glowTuning.bloom,1.05);
  await page.locator('[data-action="glowReset"]').click();
  for (const [key,value] of Object.entries({emissive:'1.69×',bloom:'1.00',glow:'0.75',radius:'0.38'}))
    assert.equal(await output(key).textContent(),value,'reset restores the preset default');
  await page.setViewportSize({width:1920,height:1080});
  await page.locator('.graphics-glow-settings').scrollIntoViewIfNeeded();
  await page.screenshot({path:'artifacts/glow-controls/cinematic-1080.png'});
  await page.locator('[data-action="graphicsSet"][data-index="0"]').click();
  assert.equal(await button(1).isEnabled(),true);
  assert.equal(await button(3).isEnabled(),false,'Performance keeps post-processing off');
  assert.deepEqual(errors,[]);
  console.log('PASS: default values, live adjustments, controller, persistence, presets, toggle and reset');
} finally { await browser.close(); }
