import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { launchAuditBrowser } from './quality-browser-runtime.mjs';

const out = process.env.GRAB_REVIEW_OUTPUT || 'artifacts/evolution-cycle2/animation';
const base = process.env.GRAB_REVIEW_BASE || '77fbf6d';
const riders = process.env.GRAB_REVIEW_RIDERS?.split(',') || ['The_AdolescentUR', 'The_Heretic', 'The_Anchor', 'TuxR'];
const browser = await launchAuditBrowser();
const report = { base, errors: [], sheets: [], note: 'Shipping-mesh presentation harness; both stances and three views. This does not replace physical-input, park-lighting or human motion approval.' };
const rows = ['Indy', 'Melon', 'Nosegrab', 'Tailgrab', 'Japan', 'Stalefish']
  .map(name => ({ label: name, time: .65, spec: { kind: 'grab', name } }));
try {
  for (const variant of process.env.GRAB_REVIEW_CLIPS === '1' ? ['after'] : ['before', 'after']) {
    await mkdir(`${out}/${variant}`, { recursive: true });
    const context = await browser.newContext({ viewport: { width: 1200, height: 800 } });
    const page = await context.newPage(); page.on('pageerror', e => report.errors.push(e.message));
    const overrides = new Map();
    if (variant === 'before') for (const file of ['src/character/UnrealRider.js', 'src/skateboard/StreetBoard.js', 'src/character/GrabReachPose.js']) {
      try { overrides.set('/' + file, execFileSync('git', ['show', `${base}:${file}`],{stdio:['ignore','pipe','pipe']})); }
      catch(error) { if(file!=='src/character/GrabReachPose.js')throw error; }
    }
    await page.route('**/*', async route => {
      const pathname = decodeURIComponent(new URL(route.request().url()).pathname);
      const local = /^\/(src|tools|node_modules)\//.test(pathname) ? pathname.slice(1) : `public${pathname}`;
      const filename = path.resolve(local);
      if (!filename.startsWith(process.cwd() + path.sep)) return route.abort();
      try {
        await route.fulfill({ body: overrides.get(pathname) || await readFile(filename),
          contentType: pathname.endsWith('.js') ? 'text/javascript; charset=utf-8' : pathname.endsWith('.html') ? 'text/html; charset=utf-8' : undefined });
      } catch { await route.abort(); }
    });
    await page.goto('http://127.0.0.1/tools/animation-review-scene.html');
    await page.waitForFunction(() => window.reviewReady, null, { timeout: 90000 });
    let currentRider = 'The_AdolescentUR';
    for (const rider of riders) {
      if (rider !== currentRider) await page.evaluate(name => window.reviewSwapRider(name), rider);
      currentRider = rider;
      const image = await page.evaluate(spec => window.reviewSheet(spec), { title: `${rider} · ${variant} · named grabs`, rows });
      const file = `${variant}/${rider}.png`;
      await writeFile(`${out}/${file}`, Buffer.from(image.split(',')[1], 'base64')); report.sheets.push(file);
      console.log(file);
      if(process.env.GRAB_REVIEW_CLIPS==='1'){
        const transitionName=rider==='The_Heretic'?'Japan':rider==='The_Anchor'?'Stalefish':'Nosegrab';
        const transitionRows=[.30,.40,.65,1.50,1.65,2.15].map(time=>({label:`${transitionName} ${time}s`,time,spec:{kind:'grabTransition',name:transitionName}}));
        const sheet=await page.evaluate(spec=>window.reviewSheet(spec),{title:`${rider} · engage / hold / release`,rows:transitionRows});
        await writeFile(`${out}/after/${rider}-transition.png`,Buffer.from(sheet.split(',')[1],'base64'));
        // Both stances are on the sheets; record one representative transition
        // per rider to keep this focused visual pass short.
        for(const stance of [rider==='The_AdolescentUR'||rider==='The_Heretic'||rider==='The_Anchor'?-1:1]){
          const name=transitionName;
          const clip=await page.evaluate(args=>window.reviewGrabRecord(args),{name,stance});
          const clipPath=`after/${rider}-${name}-${stance===1?'regular':'switch'}.webm`;
          await writeFile(`${out}/${clipPath}`,Buffer.from(clip.split(',')[1],'base64'));
          report.clips??=[];report.clips.push(clipPath);console.log(clipPath);
        }
      }
    }
    await context.close();
  }
  if (report.errors.length) throw Error(report.errors.join('; ')); report.result = 'PASS';
} catch (error) { report.failure = error.stack; console.error(error); process.exitCode = 1; }
finally { await writeFile(`${out}/report.json`, JSON.stringify(report, null, 2)); await browser.close(); }
