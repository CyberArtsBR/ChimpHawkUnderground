import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

test('Grand Warehouse renders the exact Skatewarehouse GLB, not the former asset', () => {
  const bytes = readFileSync('public/assets/warehouse/granwarehouse.glb');
  assert.equal(createHash('sha256').update(bytes).digest('hex'),
    '759af97a43197371f68704e7f93092f5b416e7b282355a8b5554125a6c318c38');
});

test('Grand Warehouse adds no runtime graffiti to the warehouse visual root', () => {
  const code=readFileSync('src/park/WarehouseVariants.js','utf8');
  assert.doesNotMatch(code, /createGrandWarehouseGraffiti|GrandWarehouseGraffiti/);
  const path=readFileSync('src/park/GrandWarehouseSceneFilter.js','utf8');
  assert.match(path, /Six stair kinked down rail/);
});
