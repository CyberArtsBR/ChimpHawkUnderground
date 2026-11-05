import test from 'node:test';
import assert from 'node:assert/strict';
import { xboxIcons } from '../src/game/TutorialPages.js';
test('Xbox face buttons use accessible, colored badges', () => {
  for (const [button,color] of [['A','a'],['B','b'],['X','x'],['Y','y']]) {
    const html=xboxIcons('Hold '+button);
    assert.match(html,new RegExp('xbox-'+color));
    assert.match(html,new RegExp('aria-label="Xbox '+button+'"'));
  }
  assert.match(xboxIcons('LB / RB'),/xbox-mod/);
  assert.match(xboxIcons('D-pad'),/Xbox D-pad/);
});
