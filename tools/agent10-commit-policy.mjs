// GitHub skip-token detection is defense in depth. Protected branches and
// deploy gating are still required: GitHub may not start jobs for [skip ci].
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { hasSkipCiDirective } from './agent10-release-utils.mjs';

const git = (...args) => execFileSync('git',args,{encoding:'utf8',maxBuffer:2*1024*1024});
const messages=[git('log','-1','--format=%B')];
if (process.env.GITHUB_EVENT_NAME === 'pull_request' && process.env.GITHUB_BASE_REF) {
  const upstream='origin/'+process.env.GITHUB_BASE_REF;
  // Requires checkout fetch-depth: 0. Examine ALL commits proposed in this PR.
  messages.push(git('log','--format=%B%x00',upstream+'..HEAD'));
}
const offenders=messages.filter(hasSkipCiDirective);
assert.equal(offenders.length,0,'CI-bypass directive found in release candidate commit message(s)');
console.log('AGENT10 COMMIT POLICY PASS: no CI skip directives in candidate');
