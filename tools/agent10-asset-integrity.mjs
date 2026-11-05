import assert from 'node:assert/strict';
import { open, stat, readFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { PARK_DEFINITIONS } from '../src/park/ParkRegistry.js';
import { checkGlbChunkHeader, LOCATION_IDS } from './agent10-release-utils.mjs';

const root = resolve(process.env.AGENT10_ASSET_ROOT || 'public');
export const REQUIRED_GLBS = Object.freeze([
  'assets/rider/thehollowf.glb',
  'assets/rider/The_Heretic.glb',
  'assets/rider/The_AdolescentUR.glb',
  'assets/rider/The_Anchor.glb',
  'assets/rider/TuxR.glb',
  'assets/rider/skateboard.glb',
  'assets/spacepark/orbit.glb',
  'assets/warehouse/granwarehouse.glb',
]);
export const REQUIRED_MEDIA = Object.freeze([
  'assets/menu/riders/thehollowf.png',
  'media/title-screen.webp', 'media/trick-guide-16x9.webp',
  'assets/menu/rooftop.webp', 'assets/menu/urban-warehouse.webp',
]);
async function readExactly(handle, count, at) {
  const buffer = Buffer.alloc(count);
  const { bytesRead } = await handle.read(buffer, 0, count, at);
  assert.equal(bytesRead, count, 'Truncated GLB chunk header at ' + at);
  return buffer;
}
export async function verifyGlbFile(file) {
  const size = (await stat(file)).size;
  const handle = await open(file, 'r');
  try {
    const header = await readExactly(handle, 20, 0);
    checkGlbChunkHeader(header, size);
    let offset = 12, chunks = 0;
    while (offset < size) {
      const chunk = await readExactly(handle, 8, offset);
      const n = chunk.readUInt32LE(0), kind = chunk.readUInt32LE(4);
      assert.ok(n > 0 && n % 4 === 0 && n <= size - offset - 8,
        file + ': invalid chunk length at ' + offset);
      assert.equal(kind, chunks === 0 ? 0x4e4f534a : 0x004e4942,
        file + ': unexpected GLB chunk kind');
      offset += 8 + n; chunks++;
      assert.ok(chunks <= 2, file + ': too many GLB chunks');
    }
    assert.equal(offset, size, file + ': trailing bytes');
  } finally { await handle.close(); }
}
export async function auditAssets(assetRoot = root) {
  const available = PARK_DEFINITIONS.filter(p => p.selectable && p.available);
  assert.deepEqual(available.map(x => x.id), LOCATION_IDS,
    'Selectable park registry differs from the three released locations');
  const knownNumbers = available.map(x => x.number);
  assert.deepEqual(knownNumbers, [1, 2, 3], 'Park numbering changed');
  for (const asset of REQUIRED_GLBS) await verifyGlbFile(join(assetRoot, asset));
  for (const asset of REQUIRED_MEDIA) {
    const pathname = join(assetRoot, asset);
    const data = await readFile(pathname);
    assert.ok(data.byteLength > 32, asset + ' is missing or empty');
    if (asset.endsWith('.png'))
      assert.equal(data.subarray(0, 8).toString('hex'), '89504e470d0a1a0a',
        asset + ' does not have a PNG signature');
    if (asset.endsWith('.webp'))
      assert.ok(data.toString('ascii', 0, 4) === 'RIFF' &&
        data.toString('ascii', 8, 12) === 'WEBP', asset + ' is not WEBP');
  }
  return { locations: available.map(x => x.name), glbs: REQUIRED_GLBS.length, media: REQUIRED_MEDIA.length };
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const result = await auditAssets();
  console.log('AGENT10 ASSET INTEGRITY PASS ' + JSON.stringify(result));
}
