import assert from 'node:assert/strict';
import { deploymentMetadataMatches, requireCommitSha, safeDeploymentUrl } from './agent10-release-utils.mjs';

const expected = requireCommitSha(process.env.AGENT10_EXPECTED_SHA);
assert.ok(process.env.AGENT10_DEPLOY_URL, 'AGENT10_DEPLOY_URL must be configured explicitly');
const url = safeDeploymentUrl(process.env.AGENT10_DEPLOY_URL,
  process.env.AGENT10_ALLOWED_DEPLOY_HOST || 'streetskate.onrender.com');
const response = await fetch(url, {
  redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(20000),
  headers: { Accept: 'application/json' },
});
assert.equal(response.status, 200, 'Release identity endpoint returned HTTP ' + response.status);
const body = await response.text();
assert.ok(body.length <= 8192, 'Deployment identity exceeded 8 KB');
let meta;
try { meta = JSON.parse(body); }
catch { throw new Error('Deployment identity was not valid JSON'); }
assert.ok(deploymentMetadataMatches(meta, expected),
  'DEPLOYMENT SHA MISMATCH: expected ' + expected + ', received ' + String(meta?.commit || 'missing'));
console.log('AGENT10 DEPLOYMENT SHA PASS: ' + expected + ' @ ' + url.origin);
