import assert from 'node:assert/strict';

export const LOCATION_IDS = Object.freeze(['skate-paradise', 'orbit', 'grand-warehouse']);
export const RELEASE_META_FILE = 'agent10-build.json';
const shaPattern = /^[0-9a-f]{40}$/i;

export function requireCommitSha(value) {
  assert.match(String(value || ''), shaPattern, 'A complete 40-character Git SHA is required');
  return String(value).toLowerCase();
}

export function hasSkipCiDirective(message) {
  return /\[(?:skip ci|ci skip|no ci|skip actions|actions skip)\]/i.test(String(message)) ||
    /(?:^|\n)skip-checks:\s*true\s*(?:\n|$)/i.test(String(message));
}

export function checkGlbChunkHeader(bytes, actualSize) {
  assert.ok(bytes instanceof Uint8Array && bytes.byteLength >= 20, 'GLB header is truncated');
  assert.ok(Number.isSafeInteger(actualSize) && actualSize >= 20, 'Invalid GLB file size');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  assert.equal(view.getUint32(0, true), 0x46546c67, 'GLB magic mismatch');
  assert.equal(view.getUint32(4, true), 2, 'Only GLB version 2 is supported');
  assert.equal(view.getUint32(8, true), actualSize, 'GLB declared length differs from file size');
  const jsonLength = view.getUint32(12, true);
  assert.ok(jsonLength > 0 && jsonLength % 4 === 0, 'Missing or unaligned JSON chunk');
  assert.equal(view.getUint32(16, true), 0x4e4f534a, 'GLB first chunk is not JSON');
  assert.ok(20 + jsonLength <= actualSize, 'GLB JSON chunk overruns file');
  return jsonLength;
}

export function deploymentMetadataMatches(meta, expected) {
  return meta?.schema === 1 &&
    typeof meta.commit === 'string' &&
    shaPattern.test(meta.commit) &&
    meta.commit.toLowerCase() === requireCommitSha(expected);
}

export function safeDeploymentUrl(value, allowedHost = 'streetskate.onrender.com') {
  const url = new URL(value);
  assert.equal(url.protocol, 'https:', 'Only HTTPS deployment verification is permitted');
  assert.equal(url.hostname.toLowerCase(), allowedHost.toLowerCase(), 'Deployment host is not allowed');
  assert.ok(!url.username && !url.password && !url.search && !url.hash,
    'Deployment URL must not contain credentials, query, or fragment');
  assert.equal(url.port, '', 'Nonstandard deployment port is forbidden');
  return new URL(RELEASE_META_FILE, url.pathname.endsWith('/') ? url : new URL(url.pathname + '/', url.origin));
}
