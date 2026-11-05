import {test} from 'node:test';import assert from 'node:assert/strict';
import {resolveGraphicsSettings} from '../src/graphics/GraphicsSettings.js';
import {normalizePlayerPreferences} from '../src/game/PlayerPreferences.js';
test('optional render scale preserves native defaults and approved glow',()=>{
 const base=resolveGraphicsSettings('high-refresh',{devicePixelRatio:2,maxSamples:4},{smoothEdges:true});
 const scaled=resolveGraphicsSettings('high-refresh',{devicePixelRatio:2,maxSamples:4},{smoothEdges:true,renderScale:.75});
 assert.equal(base.pixelRatio,2);assert.equal(base.renderScale,1);assert.equal(scaled.pixelRatio,1.5);
 assert.equal(scaled.bloomStrength,base.bloomStrength);assert.equal(scaled.msaaSamples,2);
 assert.equal(normalizePlayerPreferences().renderScale,1);
 assert.equal(normalizePlayerPreferences({renderScale:.1}).renderScale,.6);
});
