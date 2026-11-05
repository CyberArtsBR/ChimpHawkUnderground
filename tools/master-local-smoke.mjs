import {chromium} from '@playwright/test';
const b=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
const p=await b.newPage({viewport:{width:1280,height:720}}),errors=[];p.on('pageerror',e=>errors.push(e.message));
try{await p.goto('http://127.0.0.1:5182/');await p.waitForFunction(()=>window.streetSkate?.ready,null,{timeout:90000});
await p.locator('[data-action=options]').click();await p.locator('[data-action=settings]').click();await p.locator('[data-action=preferenceStep][data-setting=uiScale][data-delta="1"]').click();
console.log('settings',await p.locator('[data-preference-value=uiScale]').textContent());
await p.locator('[data-action=back]').first().click();await p.locator('[data-action=back]').last().click();
await p.locator('[data-action=start]').click();await p.locator('[data-action=hero]').first().click();await p.locator('[data-action=board]').first().click();await p.locator('[data-action=confirmLoadout]').click();
await p.locator('body[data-screen=playing]').waitFor({timeout:90000});console.log('ready',await p.locator('.round-cue').textContent());await p.waitForTimeout(2500);console.log('timer',await p.locator('#run-timer').getAttribute('aria-label'));await p.screenshot({path:'artifacts/master-upgrade/local-smoke.png'});console.log('errors',JSON.stringify(errors));if(errors.length)process.exitCode=1;
}finally{await b.close()}
