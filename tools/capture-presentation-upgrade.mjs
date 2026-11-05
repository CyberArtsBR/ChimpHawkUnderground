import {mkdir,writeFile} from 'node:fs/promises';
import {launchAuditBrowser} from './quality-browser-runtime.mjs';
const out='artifacts/presentation-upgrade';await mkdir(out,{recursive:true});
const browser=await launchAuditBrowser(),report={sheets:[],errors:[]};
try{
  const page=await browser.newPage({viewport:{width:1920,height:1440}});
  page.on('pageerror',e=>report.errors.push(e.message));
  await page.goto((process.env.STREETSKATE_URL||'http://127.0.0.1:5182/')+'tools/presentation-studio.html');
  await page.waitForFunction(()=>window.studioReady,null,{timeout:90000});
  const riders=(process.env.RIDERS||'The_Heretic,The_AdolescentUR,The_Anchor,TheanchoURi,TuxR').split(',');
  for(const riderName of riders)for(const stance of [1,-1])for(const angle of ['front','side','rear'])for(const type of ['motion','grabs']){
    const options={riderName,stance,angle,type};const result=await page.evaluate(options=>window.capturePresentationSheet(options),options);
    const file=`${riderName}-${stance===1?'regular':'switch'}-${angle}-${type}.png`;
    await writeFile(`${out}/${file}`,Buffer.from(result.image.split(',')[1],'base64'));
    report.sheets.push({...options,file,contacts:result.contacts,cells:result.cells});console.log(file);
  }
}finally{await writeFile(`${out}/report.json`,JSON.stringify(report,null,2));await browser.close();}
if(report.errors.length)throw new Error(report.errors.join('\n'));
