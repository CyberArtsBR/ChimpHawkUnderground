# Prioritized development roadmap

Cycle 2026-11-03 · integration owner: lead · [State/evidence](PROJECT_STATE.md) · [Known issues](KNOWN_ISSUES.md).

Current local follow-up: [The Hollow/contact/mix delivery](hollow-grip-mix-status-2026-11-03.md) completes the fifth-rider integration and advances EV-N01–03 with actual palm calibration, source-length soundtrack ducking and measured first-bail/respawn shader preparation. Exact finger wrap, human listening and sustained repeated profiling remain REVIEW. No release or new game mode is included.

## Completed foundation milestone

All tasks use existing architecture. Low-risk corrections stay independent; tutorial/render-cache changes are medium complexity because they cross presentation state. The shared recovery transaction precedes marker/spot integration. Final browser/build verification follows agent review.

| ID | Owner | Objective / player benefit | Systems / dependencies | Acceptance / evidence | Status |
|---|---|---|---|---|---|
| EV-GP-01 | Gameplay | Preserve earned points during R/toolbar recovery. | `StreetPhysics`, `StreetSkater`, main reset; baseline accepted-score observation. | Score100 survives reset; unfinished combo clears, stance/distance/contact serial remain coherent; reset tests + browser. | COMPLETED |
| EV-GP-02 | Gameplay | Keep deck opaque after rider swaps and respawn. | `StreetSkater`, actual visual hierarchy. | Only deduplicated rider materials flash; swap/ghost regression and browser hierarchy check. | COMPLETED |
| EV-GP-03 | Gameplay | Prevent nose/tail switching from refreshing manual difficulty. | `SkillStreetPhysics`, real direction sequences; retain existing balance coefficients. | Both transitions preserve drift/time/cooldown, fresh starts retain assistance, inverse correction works30–144 Hz;51 focused tests + real keyboard switch. | COMPLETED |
| EV-GFX-01 | Graphics | Remove first-frame costume glow after same-count rider replacement. | `GraphicsPipeline`, stable visual root. | Immediate mask invalidation, material restoration, disposed references released, ordinary cache reuse; new and existing bloom tests. | COMPLETED |
| EV-GFX-02 | Graphics | Keep ordinary particle footprints consistent with render resolution. | `SkateEffects`, actual drawing ratio. | Correct uniforms at.6–5 ratios; bounds/fallback and browser60/100/125% checks. Hardware point-size clamps retained. | COMPLETED |
| EV-GFX-06 | Graphics | Remove incomplete decorative black floor bars from ORBIT. | `OrbitPark` visual filter; source GLB unchanged. |785 short joints removed with the already-removed expansion direction; real seams/grilles,156 collision meshes and14 rails unchanged; actual-asset test + controlled production A/B. | COMPLETED |
| EX-01 | Experience | Make Settings fully traversable with keyboard. | `GameShell` available-focus route. | Tab/reverse Tab skip hidden/inert nodes, reach footer and wrap; native disclosure remains usable; browser + regression. | COMPLETED |
| EX-02 | Experience | Teach the controls the player actually selected. | `TutorialPages`, current validated bindings. | Readable pages regenerate from live/saved keys, directions and marker chords; actual remapped input test + browser. | COMPLETED |
| EX-03 | Experience | Show correct physical button position in Flip School. | `FlipSchool`, EX-02 binding source. | Xbox/PS face positions follow remaps; other buttons use explicit text; unit +720p screenshots. | COMPLETED |
| EX-04 | Lead | Keep HUD/menu sound state in sync with one click. | `game-main` shared setter / `SkateAudio`. | HUDoff→menuoff→menuon→HUDon; persisted state/ARIA agree in browser. | COMPLETED |
| EX-05 | Experience | Explain the existing overtime rule correctly. | Readable tutorial, `SessionFlow` policy. | Copy describes already-active attempt grace; round policies unchanged. | COMPLETED |
| EX-06 | Lead | Keep browser/accessibility identity consistent with the actual game. | `index.html`; no gameplay dependency. | Title uses Chimp Hawk — Underground; accessible viewport copy points to current controls, not fixed defaults; final HTML verification. | COMPLETED |
| EV-REC-01 | Lead | Avoid false contact events when returning to markers/named spots. | `game-main`, EV-GP-01. | Recovery increments serial, keeps accepted score and restores saved/current stance; actual keyboard marker return + spot browser fixture. | COMPLETED |

Review risks: do not let recoveries award discarded tricks; do not let an input remap change fixed menu keys; do not let visual geometry filtering change collision/rails; do not mistake a mask/particle fix for a measured frame-rate gain. Focused tests and independent review cover these boundaries.

## Next work and cycle 2 progress

Cycle 2 implements the bounded reach, recorded-audio continuity and first-use shader/telemetry parts of EV-N01–03. They remain REVIEW because exact grip authoring, subjective listening and long-run profiling have outstanding acceptance items. [Delivered changes and evidence](evolution-cycle2-status.md). Other rows remain recommendations. No new game mode is proposed.

| ID / owner / status | Objective and player benefit | Technical approach / affected systems / dependency | Complexity / risk | Acceptance |
|---|---|---|---|---|
| EV-N01 · animation/technical art · REVIEW | Better grab contact and silhouettes for every rider. | Review worst compact-rig poses, then bounded hand/deck targets and elbow planes in `ApprovedGrabPose`/rider IK; depends on recorded full-motion matrix. | Medium/high; hand fixes can stretch arms, move feet or contaminate physics. | Regular/switch, each rider, side/front/rear normal+slow video; no body/floor penetration or physical-root/trick-timing changes. |
| EV-N02 · audio+owner · REVIEW | Approve and refine impact/voice/crowd identity. | Audition existing recorded banks and in-game volume transitions first; select new licensed performances only for identified weaknesses. No rejected cheer. | Medium; subjective timbre, repetition, clipping, music masking. | Owner listening on speakers/headphones; contacts correctly timed, no clipping/repeated voice spam, crowd context/cooldowns preserved. |
| EV-N03 · performance · REVIEW | Improve measured frame pacing without sacrificing requested glow/sharpness. | Repeated fixed-route CPU/GPU capture in all parks at1080p/native high-DPI; one active game and same preset. | Medium; GPU contention and route differences can invalidate comparisons. | Identify hotspot, retain controlled baselines, demonstrate repeatable median/p95 improvement; no claimed144lock without evidence. |
| EV-N04 · asset pipeline · BACKLOG | Reduce GPU texture memory and cold loading. | Measure decoded footprint first, then evaluate KTX2/Basis on selected textures with source/fallback retained; depends on EV-N03. | High; normal/color-space artifacts, decoder/compatibility cost. | Lower measured memory/payload with bounded visual error; collision, rails, source GLBs and art direction intact. |
| EV-N05 · architecture/frontend · BACKLOG | Reduce initial download/parse cost. | Profile entry composition, then lazily load creator/diagnostic tools and noncritical panels when justified; preserve loader recovery. | Medium; chunk failure/cold input regressions. | Controlled cold-network boot improvement; no stale-module crash, missing art, delayed core controls or creator regressions. |
| EV-N06 · release engineer · BACKLOG | Make future deployment identity inspectable. | Wire trustworthy commit stamping into actual Render build path; distinguish uncommitted local builds. | Low/medium; misleading stamp or non-Git source archives. | Verified commit metadata from real release, CI/deployed identity check passes. Deployment requires the next release instruction. |
| EV-N07 · QA/accessibility · READY | Validate real-controller learning, text/focus and long sessions. | Fresh physical controller, screen reader/contrast/text scaling, browser/GPU matrix, repeated actor/park/replay heap sampling. | Medium; hardware and human participation required. | Record actual observations and traces; fix reproducible failures instead of inferring quality from unit tests. |

Independent investigations can run in parallel. Changes to shared animation/physics interfaces and final builds/browser captures remain sequential under the lead. Historical work: [prior polish status](aaa-polish-status.md).
