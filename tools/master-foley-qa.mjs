import {launchAuditBrowser} from './quality-browser-runtime.mjs';import {mkdir,writeFile} from 'node:fs/promises';import assert from 'node:assert/strict';
const out='artifacts/master-upgrade/foley-qa',b=await launchAuditBrowser(),p=await b.newPage(),errors=[];await mkdir(out,{recursive:true});
p.on('pageerror',e=>errors.push(e.message));
try{
 await p.goto('http://127.0.0.1:5182/');await p.waitForFunction(()=>window.streetSkate?.ready,null,{timeout:90000});
 await p.locator('[data-action=practice]').click();await p.locator('[data-action=hero]').first().click();await p.locator('[data-action=board]').first().click();await p.locator('[data-action=confirmLoadout]').click();await p.locator('body[data-screen=playing]').waitFor({timeout:90000});
 await p.waitForFunction(()=>window.streetSkate.audioStatus().recorded.length===4,null,{timeout:15000});
 const status=await p.evaluate(()=>window.streetSkate.audioStatus());assert.deepEqual([...status.recorded].sort(),['bail','landing','pop','roll']);
 await p.keyboard.down('Space');await p.waitForTimeout(250);await p.keyboard.up('Space');await p.waitForTimeout(1200);
 assert.deepEqual(errors,[]);const report={status,errors,result:'PASS',limitations:'Browser decoding and event path only; human listening still required.'};
 await writeFile(`${out}/report.json`,JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{await b.close()}
