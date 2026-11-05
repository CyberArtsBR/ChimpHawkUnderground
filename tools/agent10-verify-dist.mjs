import assert from 'node:assert/strict';
import {readFile,stat,readdir} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import { RELEASE_META_FILE, deploymentMetadataMatches } from './agent10-release-utils.mjs';
const root=resolve(process.env.AGENT10_DIST||'dist');
async function nonempty(file){const st=await stat(join(root,file));assert.ok(st.isFile()&&st.size>0,file+' missing/empty');}
const html=await readFile(join(root,'index.html'),'utf8');
assert.match(html,/id="app"/);assert.match(html,/id="viewport"/);
assert.ok(!html.includes('src="/src/game-main.js"'),'Development entrypoint shipped');
assert.match(html,/assets\/[^"' ]+\.js/,'No bundled production entrypoint');
const scripts=(await readdir(join(root,'assets'))).filter(x=>x.endsWith('.js'));
assert.ok(scripts.length>0,'No production JS');
for(const x of scripts)await nonempty('assets/'+x);
for(const x of ['thehollowf.glb','The_Heretic.glb','The_AdolescentUR.glb','The_Anchor.glb','TuxR.glb'])await nonempty('assets/rider/'+x);
await nonempty('assets/menu/riders/thehollowf.png');
for(const x of ['title-screen.webp','trick-guide-16x9.webp'])await nonempty('media/'+x);
for(const x of ['orbit.glb'])await nonempty('assets/spacepark/'+x);
await nonempty('assets/warehouse/granwarehouse.glb');
for(const x of ['rooftop.webp','urban-warehouse.webp'])await nonempty('assets/menu/'+x);
const expected = process.env.AGENT10_EXPECTED_SHA;
if(expected){
 await nonempty(RELEASE_META_FILE);
 const metadata=JSON.parse(await readFile(join(root,RELEASE_META_FILE),'utf8'));
 assert.ok(deploymentMetadataMatches(metadata,expected),'Built release identity mismatches expected Git SHA');
}
console.log('AGENT10 PRODUCTION VERIFY PASS: '+scripts.length+' JS bundles, five riders, baked Hollow portrait, three location bundles, two UI assets'+(expected?', commit '+expected:''));
