import { gameAssetUrl } from '../src/game/AssetPaths.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
import { TRACKS } from '../src/game/MusicPlayer.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// Portals only accepts ASCII letters, digits, '.', '_' and '-' in path segments.
test('every tracked file and directory path is Portals-compatible', () => {
  const files = execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' })
    .split(String.fromCharCode(0)).filter(Boolean);
  assert.ok(files.length > 0, 'git must list tracked project files');
  const invalid = files.filter(path =>
    path.split('/').some(segment => !/^[A-Za-z0-9._-]+$/.test(segment)));
  assert.deepEqual(invalid, [], 'Rename incompatible paths before importing to Portals');
});

test('soundtrack files and committed playlist match runtime track paths', () => {
  const playlist = JSON.parse(readFileSync(resolve(root, 'public/media/playlist.json'), 'utf8'));
  const expected = TRACKS.map(([title, filename]) => ({ title, src: '/media/' + filename }));
  assert.deepEqual(playlist.tracks, expected);
  for (const [, filename] of TRACKS) {
    assert.match(filename, /^[A-Za-z0-9._-]+$/);
    assert.ok(statSync(resolve(root, 'public/media', filename)).size > 1024, filename);
  }
});

test('public runtime assets resolve against bundle location, even under a foreign host document base', () => {
  const js = 'https://game-assets.example/cdn/abc123/assets/index-BE4yDH3D.js';
  const doc = 'https://portals.to/g/chimp-hawk-skate?party=test';
  assert.equal(new URL('./assets/park/halfnew.glb', doc).href,
    'https://portals.to/g/assets/park/halfnew.glb', 'old relative URL follows the wrong document');
  assert.equal(gameAssetUrl('/assets/park/halfnew.glb', './', js),
    'https://game-assets.example/cdn/abc123/assets/park/halfnew.glb');
  assert.equal(gameAssetUrl('/media/chimpion-slide.mp3', './', js),
    'https://game-assets.example/cdn/abc123/media/chimpion-slide.mp3');
  assert.equal(gameAssetUrl('/audio/foley/pop.wav', './', js),
    'https://game-assets.example/cdn/abc123/audio/foley/pop.wav');
  assert.equal(gameAssetUrl('/assets/rider/TuxR.glb', './', js),
    'https://game-assets.example/cdn/abc123/assets/rider/TuxR.glb');
  assert.equal(gameAssetUrl('/assets/spacepark/orbit.glb', './', js),
    'https://game-assets.example/cdn/abc123/assets/spacepark/orbit.glb');
  assert.equal(gameAssetUrl('/assets/warehouse/granwarehouse.glb?v=fbc46ba3', './', js),
    'https://game-assets.example/cdn/abc123/assets/warehouse/granwarehouse.glb?v=fbc46ba3');
  assert.equal(gameAssetUrl('/assets/park/halfnew.glb', '/'),
    '/assets/park/halfnew.glb');
  assert.equal(gameAssetUrl('/assets/spacepark/orbit.glb', '/games/streetskate/'),
    '/games/streetskate/assets/spacepark/orbit.glb');
  assert.equal(gameAssetUrl('/audio/foley/pop.wav', '/games/streetskate/'),
    '/games/streetskate/audio/foley/pop.wav');
  assert.equal(gameAssetUrl('blob:local-rider', './', js), 'blob:local-rider');
  assert.equal(gameAssetUrl('https://example.org/a.glb', './', js), 'https://example.org/a.glb');
});
