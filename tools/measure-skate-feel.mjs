import fs from 'node:fs/promises';
import { PHYSICS } from '../src/game/StreetPhysics.js';
import { measureFeelFixture,measureBraking } from './fixtures/SkateFeelFixtures.mjs';
const fixtures=[measureFeelFixture('flat',{chargeFrames:1}),measureFeelFixture('flat',{chargeFrames:29}),...['low-ledge','stairs','rail','bowl-return','transfer'].map(kind=>measureFeelFixture(kind))];
const report={createdAt:new Date().toISOString(),step:PHYSICS.step,tuning:PHYSICS,fixtures,braking:[6,12,18].map(measureBraking),limitations:['Procedural fixtures isolate tuning; they do not certify every imported park approach.','No global physics changes or precision speed preset selected without player evidence.']};
await fs.mkdir('artifacts/upgrade-gameplay',{recursive:true});
await fs.writeFile('artifacts/upgrade-gameplay/feel-fixtures.json',JSON.stringify(report,null,2));
console.log(JSON.stringify({...report,fixtures:fixtures.map(({states,...item})=>item)},null,2));
