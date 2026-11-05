import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { gunzipSync, gzipSync } from 'node:zlib';
import { fetchCompressedGlb } from '../src/game/CompressedAsset.js';

const buffer = value => value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength);
const glb = Buffer.concat([Buffer.from('glTF'), Buffer.alloc(8), Buffer.from('park fixture')]);

test('shipped gzip parks round-trip byte for byte, preserving all source scene and collision data', async () => {
  for (const path of ['public/assets/spacepark/orbit.glb', 'public/assets/warehouse/granwarehouse.glb']) {
    const [original, packed] = await Promise.all([readFile(path), readFile(`${path}.gz`)]);
    assert.deepEqual(gunzipSync(packed), original);
    assert.ok(packed.length < original.length * .7, `${path} should reduce delivery substantially`);
  }
});

test('fetchCompressedGlb expands gzip in a modern browser and fetches only the optimized URL', async () => {
  const calls = [], compressed = gzipSync(glb);
  const fetcher = async url => { calls.push(url); return new Response(compressed); };
  assert.deepEqual(new Uint8Array(await fetchCompressedGlb('packed', 'original', { fetcher })), new Uint8Array(glb));
  assert.deepEqual(calls, ['packed']);
});

test('a server that transparently decompresses gzip still returns the identical GLB', async () => {
  const fetcher = async () => new Response(buffer(glb));
  assert.deepEqual(new Uint8Array(await fetchCompressedGlb('packed', 'original', { fetcher })), new Uint8Array(glb));
});

test('missing, corrupt or unsupported gzip falls back to the untouched original', async () => {
  for (const kind of ['missing', 'corrupt', 'unsupported']) {
    const calls = [];
    const fetcher = async url => {
      calls.push(url);
      return url === 'original' ? new Response(buffer(glb))
        : kind === 'missing' ? new Response('', { status: 404 }) : new Response('not gzip');
    };
    const settings = kind === 'unsupported' ? { fetcher, DecompressionStream: false } : { fetcher };
    assert.deepEqual(new Uint8Array(await fetchCompressedGlb('packed', 'original', settings)), new Uint8Array(glb));
    assert.deepEqual(calls, kind === 'unsupported' ? ['original'] : ['packed', 'original']);
  }
});

test('aborted load does not start a fallback request', async () => {
  const controller = new AbortController(), calls = [];
  const fetcher = async url => { calls.push(url); controller.abort(); throw new Error('aborted'); };
  await assert.rejects(fetchCompressedGlb('packed', 'original', { fetcher, signal: controller.signal }), /aborted/);
  assert.deepEqual(calls, ['packed']);
});
