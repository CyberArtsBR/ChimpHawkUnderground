# Agent 10 — StreetSkate release gate and rollback playbook

Baseline: `17259ec6f5dc8eb1aee0ba449b3db84e90a814f9`.
Working branch: `aaa/10-qa-release`. Scope: CI, tools/agent10-*, tests/agent10-*, this document.
This work **does not deploy**, modify `main`, or configure repository administration.

## What failed in production-browser?

Observed source: Phase 1 Core CI, run [38141693862](https://github.com/CyberArtsBR/StreetSkate/actions/runs/38141693862), job 114476687638 (2026-10-11).
- PASS: dependency installation, Vite production build, emitted bundle/rider checks, Chromium setup, preview startup, renderer boot, asset HEAD checks, options/camera/music persistence.
- FAIL: `tools/agent10-browser-qa.mjs:153` asserted that ArrowDown must change the selected *type* from `hero`. Actual spatial navigation may move vertically to the second **rider row**, remaining `hero`. That predicate was obsolete: verify *focused identity and screen-space vertical motion* instead. Traversal from riders through decks and locations still fails hard if impossible.
- OBSOLETE: the old test expected location `urban-warehouse`, but `src/park/ParkRegistry.js` declares exactly `rooftop`, `orbit`, `grand-warehouse` for selectable maps; labels are SKYLINE ROOFTOP, ORBIT, GRAND WAREHOUSE.
- NOT RUN in that job: custom upload security, controller operation, live map switching, practice, restart, avatar swaps, 90-second results, and end-to-end success checks. A test stopped before these cases; do not interpret absence of failures as a pass.

Observed on this branch creation: pinned baseline commit message ended in `[skip ci]`. Neither a passing build nor a live deploy proves that skipped commit was tested. An API read returned zero repository rulesets; the branch-protection API returned 403 (not readable through this integration). **Protected-branch enforcement is unverified.**

## Mandatory gate

`Agent10 Release Gate` runs on main-targeted PRs, main pushes, manual dispatch, and the QA implementation branch. Its **Release decision** job fails closed if either dependency fails:
1. Asset + security/identity checks, `npm test`, and all board/vert/pump regressions.
2. `npm run build`, exact SHA stamp, emitted production assets, Chromium black-box tests for menu/rider/GLB/timed/practice/pause/results, all three maps, and a simulated controller.

Browser job artifacts include screenshots, console/request errors, full telemetry, and preview logs, even on failure. Software Chromium timing is useful for liveness but **not** indicative of consumer GPU FPS. Never weaken assertions or hide a failed command with `|| true`.

Run the checks locally (Node 22, clean checkout of candidate branch):

```bash
npm ci
node tools/agent10-asset-integrity.mjs
node --test tests/agent10-release-gate.test.mjs tests/agent10-glb-security.test.mjs
npm test
npm run verify:physics
npm run build
AGENT10_BUILD_SHA="$(git rev-parse HEAD)" node tools/agent10-stamp-release.mjs
AGENT10_EXPECTED_SHA="$(git rev-parse HEAD)" node tools/agent10-verify-dist.mjs
npm install --no-save --package-lock=false @playwright/test@1.56.1
npx playwright install chromium
npm run preview -- --host 127.0.0.1 --port 4173
# In another terminal, with preview running:
STREETSKATE_URL=http://127.0.0.1:4173 node tools/agent10-browser-qa.mjs
STREETSKATE_URL=http://127.0.0.1:4173 node tools/agent10-location-controller-smoke.mjs
```

A `PASS` is only meaningful for the exact tested SHA and the exact files that actually ran. Check the Actions run logs for all job results and retain artifacts; a green `StreetSkate validation` build alone does not replace the browser release gate.

## Mandatory GitHub and Render administration (NOT enabled by these files)

A repository administrator must configure main branch protection/rulesets with:
- Pull requests required; direct pushes and force pushes prohibited, including administrators or deploy bots, with no bypass actors except a documented break-glass process.
- At least one non-author approval and no unresolved conversations; dismiss stale reviews and require latest merge-base/up-to-date checks.
- Required status check **Agent10 Release Gate / Release decision** (select the exact GitHub check context after observing a completed PR run); retain `StreetSkate validation / test-and-build` and existing required checks as appropriate.
- Restrict who may bypass PR checks, audit ruleset changes, and **disable any deploy-on-push pipeline that can publish a commit before required checks**. Do not treat `[skip ci]` as an acceptable release path.
- Configure Render to deploy ONLY explicitly approved, passing commit SHAs, or promote exactly the artifact tested by the gate. If Render builds separately, ensure it stamps the actual commit used by Render (not a manually entered unrelated SHA). Example build command requiring the provided Render commit variable: `npm ci && npm run build && AGENT10_BUILD_SHA="$RENDER_GIT_COMMIT" node tools/agent10-stamp-release.mjs`. Verify your Render service exposes `RENDER_GIT_COMMIT` before adopting that command.
- A commit containing `[skip ci]`, `[ci skip]`, `[no ci]`, `[skip actions]`, `[actions skip]`, or `skip-checks: true` must NEVER bypass promotion. Required checks block a skipped PR only when correctly enforced; an unprotected direct push is still dangerous. GitHub-side policies and a promotion gate, not a workflow alone, close that hole.

## Verify the exact deployed commit after promotion

Run **Agent10 Deployment Identity** manually from the intended commit/ref, set `deployment_url` to `https://streetskate.onrender.com/`. The job checks the hosted `/agent10-build.json` endpoint against its exact `github.sha`; it does not deploy.

Or use:

```bash
AGENT10_EXPECTED_SHA="<exact-40-hex-approved-sha>" \
AGENT10_DEPLOY_URL="https://streetskate.onrender.com/" \
node tools/agent10-verify-deployment.mjs
```

An absent JSON, unexpected host, malformed SHA, HTTP failure, or SHA mismatch is a **FAIL / no release certification**. The metadata endpoint is a verifiable build claim, not a cryptographic attestation; restrict build credentials and audit the deployment provider as well. Older releases without `agent10-build.json` cannot pass identity verification, even if their UI works.

## Rollback / incident response

1. Stop promotion/automatic deployment and preserve the failed run URL, production URL, observed expected/actual SHAs, browser screenshots, telemetry, and runtime/network errors.
2. In Render deployment history, select a *previously verified* known-good commit or immutable artifact; rollback/redeploy that **specific SHA**, without editing `main` or force-pushing.
3. Confirm the rollback URL reports the known-good SHA with the deployment verification script. Smoke-test title, menu navigation, Rooftop, ORBIT, Grand Warehouse, rider load, pause and resume on the rolled-back build.
4. If identity verification or smoke tests fail, mark production **FAIL**, keep rollback open, and escalate; do not mark green based solely on HTTP 200.
5. Open a follow-up defect and PR. Re-enable promotion only after all checks succeed on the new candidate and the production SHA matches.

## Evidence semantics

- **PASS**: command/run executed successfully, with run ID / artifact.
- **FAIL**: executed and failed, including legitimate product defects or outdated assertions; classify with proof.
- **NOT RUN**: not attempted / not observable. Never replace with PASS.
- **UNVERIFIED**: external admin setting or deployment provenance cannot be read; do not claim it is enabled.


## Observed implementation-branch CI evidence (2026-10-11)

Run [38151099868](https://github.com/CyberArtsBR/StreetSkate/actions/runs/38151099868) (superseded by later QA-only commits):
- PASS: required three-map asset structure, additional Agent10 security regressions, Vite production build, build SHA stamp, emitted asset/identity verification, browser renderer startup and packaged media availability.
- FAIL: `npm test` reported **572 PASS / 10 FAIL / 582 tests** on the pinned baseline. Failures include retired Map 4 fixtures requiring unshipped `public/assets/warehouse/urban-warehouse.glb`, a stale relative import for `tools/load-geometry.mjs`, and assumptions about old Map 2/3 identities. Do **not** hide or skip these tests. Their owning agents must migrate or retire the obsolete cases with explicit review; any remaining user-facing physics failure remains blocking.
- FAIL / INCONCLUSIVE: the independent map runner timed out on a Playwright *pointer action* against the title button under software WebGL, before any world-select assertions. It does **not** establish that Rooftop/ORBIT/Grand Warehouse failed to load; the map runner now invokes real DOM button handlers without pointer timing, while the original browser suite retains actual pointer-input coverage.
- NOT RUN: full all-three-map and simulated gamepad PASS/FAIL outcome on the final branch tip; check its latest run before merging. Production deployment-SHA verification remains NOT RUN because no deployment was authorized.
- The release decision was correctly **FAIL**. No publish was made.
