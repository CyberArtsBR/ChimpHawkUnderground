# Agent 10 — QA, Security & CI

Baseline: main ff33677541f61b803901ac37c2465226799ec8a3 (2026-10-09).
Branch: audit-fix/10-qa-security-ci. No direct gameplay edits, merge or deployment.

## Baseline regression evidence

GitHub Actions run 37897786890, job 113713017701 (pre-merge main-equivalent code):
345 tests, 343 pass, 2 fail, 0 skipped.

- tests/grind-manual.test.mjs:76, "low-speed capture does not create large fake speed": expected 0.21, actual 8.5.
- tests/ground-motor.test.mjs:93, "ground steering owns the complete park carve curve": assertion fails.

The existing unit-test job failed before physics verification and browser smoke could run; browser-smoke was **skipped**. Both failures remain blocking and unchanged. Agent 03 owns grind and Agent 01 owns ground; they must correct behavior or substantiate a legitimate design change.

## Changes

- Added bounded GLB v2 structural inspection (header, lengths/chunks, UTF-8 JSON, embedded buffer, resource ceilings, joint/primitive counts, supported required extensions, external references) and seven safe deterministic tests. This is a **standalone tool**, not yet wired into production player upload.
- Added verification of actual dist/ assets, riders, title art and tutorial artwork, rejecting unbundled dev HTML.
- Reworked Phase 1 CI: push main + PR main, independent core and production-browser jobs; always attempt physics verification after unit failure; preserve diagnostics on browser failures. No ignored assertions, no permissive continue-on-error.
- Added actual Vite production Chromium smoke: boot/asset HEAD requests; persistent master volume; camera options; 2D selection keyboard; invalid GLB recovery and DOM escaping; loadout; tutorial; timed run; pause/resume; focus loss; practice; restart; multiple play sessions; frame-time percentiles, FPS, draw calls, triangles, memory counters and runtime exceptions. Telemetry is observational; no fabricated FPS threshold.

## Security observations

1. **High / production not yet hardened:** GameShell.js checks magic, size and extension, not GLB version/JSON/chunks/extensions/complexity or remote URIs. A magic-only fake file can reach a GLTFLoader. Suggested owner patch: validate file.arrayBuffer() before URL.createObjectURL, reject errors in status text, and impose limits. Relocate/consume agent10-glb-inspector.mjs in a production-owned src module only after integrator review.
2. **Medium / lifecycle:** GameShell.js revokes the prior custom avatar URL on replacement; audit teardown/scene transitions to ensure final URL release; CharacterPortraits.js holds a URL-keyed promise cache and shared WebGLRenderer without obvious bounds or disposal. Owner Agent 05 or 08 should implement bounded cache and lifecycle cleanup.
3. **Medium / glTF:** GLTFLoader can process external buffers/images in a user GLB; rejecting URI references before loading is recommended. Unknown required extensions should be rejected before parse.
4. **Medium / CSP:** GameShell's inline styles plus Vite/Three rendering and data URLs need a deployed-report-only CSP trial before any strict policy. Avoid a CSP that breaks WebGL, required media, blob previews or CSS.
5. **Low / DOM:** GameShell.safe escapes custom hero names and URL attributes; regression smoke checks HTML-encoded custom names. This does not prove all DOM sinks are safe.
6. **Low / storage:** MusicPlayer clamps numeric saved master volume and catches localStorage failures. Test persists volume on reload. Broader storage recovery and invalid values warrant additional review.
7. **Dependency scope:** Three 0.180.0, three-mesh-bvh ^0.9.15, Vite 7.3.5. Schedule npm audit with locked dependencies in integration CI; no assertion that a vulnerability exists without an audit result.
8. **Errors:** Browser smoke records pageerror, unhandledrejection, network errors and console errors as artifacts. Current media/autoplay errors are collected rather than universally treated as fatal.

## Suggested integration matrix

| Category | Critical scenarios | Gate |
|---|---|---|
| Startup | production bundle, failed assets, retry, canvas, no unhandled rejection | Must pass |
| Input/UI | title, 2D grid, rider/deck/location, tutorial, gamepad, pause/resume | Must pass |
| Modes | timed and untimed, restart, repeated sessions, focus lost | Must pass |
| Movement | high-speed/fakie, vert/bowl, grind/manual, collision, landing | Must pass existing + agent-specific tests |
| Characters | four rigs, invalid custom GLB, rig change, memory cleanup | Must pass / extend browser checks |
| Camera | follow, classic, fixed, no first-person | Must pass |
| Security | invalid chunks/length, external URI, joints/meshes budget, CSP trial | Must pass structural tests; production wiring pending |
| Rendering | frame p50/p95/p99, draw calls/triangles, heap and GPU resources across sessions | Report initially, set hardware baselines later |
| Release | npm ci, npm test, verify:physics, npm run build, dist verification, Chromium | All mandatory gates |

## Limitations and follow-up

No direct edits to package.json, package-lock.json, game-main.js or other agents' code. The GLB inspector is not automatically applied to runtime input until the owning integrator wires it. CI browser results require a GitHub runner with Chromium/SwiftShader; GPU timings are not representative of real player hardware. A browser production smoke covers targeted scenarios, not all gameplay interactions: add per-system scenarios from Agents 01–09 after integration. Existing regressions keep core CI red until corrected.
