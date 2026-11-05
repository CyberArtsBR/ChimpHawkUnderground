# StreetSkate — FINAL RELEASE REPORT
Date: 2026-10-09
Repository: https://github.com/CyberArtsBR/StreetSkate
Release PR: https://github.com/CyberArtsBR/StreetSkate/pull/16
Integration branch: `release/parallel-aaa-improvements`
Baseline main: `ff33677541f61b803901ac37c2465226799ec8a3`
Validated runtime SHA: `9aeacca7e4acbaf5d393d341ab250b697a6d89c6`
Release classification: **RELEASE READY on automated gates; final deployment must be verified after PR merge**.

## 1. Integration summary
All ten source branches #6–#15 were staged in isolated integration commits. Exact feature branch heads were checked again against live GitHub and had not moved. No changes were merged to main individually; source ancestry is preserved through distinct integration merge commits.

| Agent | Function | Status |
|---|---|---|
| 10 | CI, browser smoke, GLB security | Included |
| 04 | Collision, wheel support, ledge wall contacts | Included |
| 01 | Ground motor, 180/fakie, steering | Included |
| 02 | Vert, bowl return, pump | Included |
| 03 | Grind, manuals, combo scoring | Included |
| 05 | Four-rider rig aliasing, IK safety | Included; visual aesthetic review recommended |
| 06 | Follow/Classic/Fixed camera & clearance | Included |
| 07 | Environment materials and batching | Included; visual sorting review recommended |
| 09 | Registry/lifecycle infrastructure | Included; live location switch intentionally deferred |
| 08 | Grid input, gamepad focus edges, GLB upload header, audio | Included |

## 2. Confirmed fixes
- **Ground:** restored legacy full-speed carve saturation at 12 m/s; signed-fakie sharp-carve parity; positive zero when braking to a stop.
- **Grind:** removed artificial 8.5 m/s capture floor (which previously turned 0.21 m/s into 8.5 m/s); smoother curved rail tangents; stall/release and scoring anti-spam controls.
- **Vert/pumping:** slope-supported, energy-bounded launch; physically bounded reentry and transfer trajectory; improved ramp pumping timing.
- **Collision/board:** valid sharp-ledge normal selection, isolated single-wheel snap clamp, allocation reuse and four-wheel solver retention.
- **Character:** semantic Unreal/Mixamo rig mapping; moving pelvis-relative knee poles, finite IK/reach handling and spring recovery. **Integrator additionally fixed GLB hot-swap GPU leaks**, disposing only previous avatar-owned skeletons, geometry, materials and textures.
- **Camera:** speed-aware smoothing, fakie/travel stability, coping reframe, collision-safe clearance. No first-person mode.
- **Graphics:** reduced discarded canvas work and relief texture base bytes (theoretical 12 MiB→3 MiB), batched graffiti artwork (25 meshes to four batches) and fascia geometry, adjusted steel/paint response without changing rideable collision.
- **UI/audio/security:** 2D menu navigation and focus behavior; edge-safe gamepad reconnection; visible title hit targets, compact viewport rules; music skip races and repeated SFX; complete GLB v2 inspection before custom-upload acceptance, no external/data URIs.

## 3. QA evidence
GitHub Actions run: https://github.com/CyberArtsBR/StreetSkate/actions/runs/37925547985
- `npm ci`: PASS.
- `npm test`: **458/458 passed; 0 failures**. Includes two new integration rider-disposal regression tests.
- `npm run verify:physics`: **50/50 passed** (board 15, vert 20, pump 15).
- `npm run validate` component commands: PASS individually (`npm test` + `npm run verify:physics`).
- `npm run build`: PASS. Built-dist asset checks: one bundled JS entry, four stock GLB riders, title art and trick-guide asset.
- **10/10 production Chromium smoke scenarios PASS**, including title, persistent volume, 2D loadout, disabled maps, security rejection, tutorial/gameplay, three cameras, pause/focus/resume, practice/restart, all four avatar GLB swaps and actual timed-run result screen plus return to title.
- Four stock GLB meshes/rigs checked in live Three.js: Heretic 2 meshes/61 bones; Adolescent 2/61; Anchor 2/61; Tuxr 3/70. Resource counters after swaps: geometries 44→42→42→42, textures 17→14→15→16.
- Browser screenshots and telemetry: https://github.com/CyberArtsBR/StreetSkate/actions/runs/37925547985/artifacts/11614695436
- The earlier five browser failures were isolated to timing instrumentation and assertions targeting an intentionally hidden legacy pause overlay. Test code was corrected to measure actual Three.js frame counts and visible GameShell pause without weakening gameplay or physics assertions.

## 4. Performance
Code-level geometry/material batching and reduced temporary canvas writes were verified by deterministic construction tests. Integrated WebGL instrumentation observed **42–43 draw calls** and approximately **57,166–57,258 triangles** in the sampled scenes. No comparable production GPU baseline exists. The Chromium runner uses SwiftShader, around 1.5 FPS under its CPU-bound WebGL load, **not a valid measure of user GPU FPS**. No FPS improvement claim is made.

## 5. Preserved product scope
Chimp Hawk Underground title and music playlist; all four riders/custom rigged GLB upload; eight skateboard finishes; Rooftop gameplay; 90-second/practice modes; trick guide; wheel contact; grounded/fakie travel; ollies/flips/grabs/spins; grinding/manuals/pumping/vert/wallrides; scoring; Follow, Classic and Fixed camera; pause/gamepad and master volume are preserved. First-person remains absent.

## 6. Known limitations and deferred changes
- **P2 — Visual/art QA:** independent human visual inspection of all four riders during tricks/IK and overlap sorting of transparent mural batches is still desirable; screenshots provided but not manually adjudicated in this connector execution.
- **P2 — Hardware/browser QA:** native controller, GPU FPS/VRAM/thermals and browser diversity/mobile hardware were not measured. Software Chromium findings are structural/behavioral, not real-world GPU benchmarks.
- **P2 — Locations:** transactional `ParkRegistry`/`WorldLifecycle` exists but live location swaps require careful `src/game-main.js` rebind/sky/resource ownership work. No fictitious Warehouse is selectable; Rooftop remains default; legacy query path untouched.
- **P3 — Security follow-up:** review custom portrait cache bounds and any future glTF extension whitelist expansion; current upload inspector rejects unsupported required extensions and external URIs.

No known unresolved P0/P1 regression surfaced from the integrated automated suite.

## 7. Rollback and release
- Final PR: https://github.com/CyberArtsBR/StreetSkate/pull/16
- Merge target: `main`, one integration PR only.
- Render service `streetskate`, ID `srv-db14qiqd0e5s73e45vhg`. Do not touch similarly named Halfpipe service.
- On successful merge, check auto-deployment instead of triggering duplicate deploys. Verify LIVE deployed SHA equals merged main SHA.
- If a severe regression is later discovered, use an auditable Git revert and verify corresponding Render deployment; never force-push main.
- Merge commit SHA and final Render status are assigned after merge; the PR's merged-state metadata and final assistant response provide exact verified values without adding a second documentation-only production deploy.
