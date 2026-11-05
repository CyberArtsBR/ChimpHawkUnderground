import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { RELEASE_META_FILE, requireCommitSha } from './agent10-release-utils.mjs';

const commit = requireCommitSha(process.env.AGENT10_BUILD_SHA ||
  process.env.RENDER_GIT_COMMIT || process.env.GITHUB_SHA ||
  execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim());
const root = resolve(process.env.AGENT10_DIST || 'dist');
await mkdir(root, { recursive: true });
const payload = { schema: 1, commit };
await writeFile(join(root, RELEASE_META_FILE), JSON.stringify(payload, null, 2) + '\n');
console.log('AGENT10 BUILD IDENTITY: ' + commit);
