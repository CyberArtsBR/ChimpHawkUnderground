import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  LOCATION_IDS, checkGlbChunkHeader, deploymentMetadataMatches,
  hasSkipCiDirective, requireCommitSha, safeDeploymentUrl,
} from '../tools/agent10-release-utils.mjs';
import { verifyGlbFile } from '../tools/agent10-asset-integrity.mjs';

const SHA='17259ec6f5dc8eb1aee0ba449b3db84e90a814f9';
function glb() {
  const bytes=Buffer.from('{"asset":{"version":"2.0"}}');
  const padded=Buffer.alloc(Math.ceil(bytes.length/4)*4,0x20);
  bytes.copy(padded);
  const b=Buffer.alloc(20+padded.length);
  b.write('glTF');b.writeUInt32LE(2,4);b.writeUInt32LE(b.length,8);
  b.writeUInt32LE(padded.length,12);b.writeUInt32LE(0x4e4f534a,16);
  padded.copy(b,20);
  return b;
}

test('Agent10 released park IDs are stable and exact',()=>{
  assert.deepEqual(LOCATION_IDS,['skate-paradise','orbit','grand-warehouse']);
});
test('Agent10 GLB verifies all chunk boundaries, not only the magic', async()=>{
  const temp=await mkdtemp(join(tmpdir(),'agent10-glb-'));
  const p=join(temp,'test.glb');
  try {
    const valid=glb();
    assert.ok(checkGlbChunkHeader(valid.subarray(0,20),valid.length)>0);
    await writeFile(p,valid);
    await verifyGlbFile(p);
    const broken=Buffer.from(valid);
    broken.writeUInt32LE(0xffffffff,12);
    await writeFile(p,broken);
    await assert.rejects(()=>verifyGlbFile(p));
    broken.writeUInt32LE(8,12);
    await writeFile(p,broken);
    await assert.rejects(()=>verifyGlbFile(p));
  } finally { await rm(temp,{recursive:true,force:true}); }
});
test('Agent10 detects all supported GitHub Actions skip directives',()=>{
  for(const message of ['patch [skip ci]','fix [ci skip]','[no ci]','[skip actions]',
    '[actions skip]','patch\n\nskip-checks: true\n'])
    assert.ok(hasSkipCiDirective(message),message);
  for(const message of ['Fix release gate','[ci] test','skipping unrelated tests'])
    assert.equal(hasSkipCiDirective(message),false,message);
});
test('Agent10 identity requires exact complete commit SHA',()=>{
  assert.equal(requireCommitSha(SHA),SHA);
  assert.throws(()=>requireCommitSha('abc'));
  assert.ok(deploymentMetadataMatches({schema:1,commit:SHA},SHA));
  assert.equal(deploymentMetadataMatches({schema:1,commit:'a'.repeat(40)},SHA),false);
  assert.equal(deploymentMetadataMatches({schema:2,commit:SHA},SHA),false);
  assert.equal(deploymentMetadataMatches({schema:1},SHA),false);
});
test('Agent10 remote verification rejects unsafe or unapproved URLs',()=>{
  assert.equal(safeDeploymentUrl('https://streetskate.onrender.com/').href,
    'https://streetskate.onrender.com/agent10-build.json');
  for(const url of ['http://streetskate.onrender.com/',
    'https://127.0.0.1/', 'https://example.invalid/',
    'https://streetskate.onrender.com:8443/',
    'https://user:pw@streetskate.onrender.com/',
    'https://streetskate.onrender.com/?token=secret'])
    assert.throws(()=>safeDeploymentUrl(url),url);
});
