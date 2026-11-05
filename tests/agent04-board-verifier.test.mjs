import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// Run the project's canonical board verification even if tests owned by other
// agents fail; the usual CI pipeline skips verify:physics after npm test fails.
test('Agent04 official board verification: all legacy board scenarios still pass', () => {
  const script = fileURLToPath(new URL('../tools/verify-board.mjs', import.meta.url));
  const run = spawnSync(process.execPath, [script], {
    encoding: 'utf8',
    timeout: 60_000,
    maxBuffer: 2 * 1024 * 1024,
  });
  assert.equal(run.error, undefined, `board verifier process error: ${run.error}`);
  assert.equal(run.status, 0, `board verifier failed:\n${run.stdout}\n${run.stderr}`);
  const summary = run.stdout.match(/Board physics verification: (\d+)\/(\d+) passed\./);
  assert.ok(summary, `missing board verifier summary:\n${run.stdout}`);
  assert.equal(summary[1], summary[2], `board scenarios failed:\n${run.stdout}`);
  console.log(`Official board verification: ${summary[1]}/${summary[2]} passed`);
});
