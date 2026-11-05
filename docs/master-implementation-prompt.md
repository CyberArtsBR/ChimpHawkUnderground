# Chimp Hawk — master implementation prompt

Paste the following prompt into a Codex chat attached to the StreetSkate repository. New game modes are explicitly excluded.

---

Act as the lead gameplay engineer, technical art director, skate-motion animator, audio engineer and QA lead for Chimp Hawk. Implement the current-release audit as a coherent, tested local upgrade. Deliver working changes and a playable local build; do not stop after a plan, mockup or first batch of fixes.

## Context and source of truth

- Repository: https://github.com/CyberArtsBR/StreetSkate
- Live reference: https://streetskate.onrender.com/
- Current task workspace: C:/Users/meltb/.codex/worktrees/coping-quality-pass/Streetskate
- Primary specification: docs/full-game-audit-current-release.md. Read it completely, including limitations and evidence.
- Last audited standalone commit: 29c3809; Portals counterpart: 8f2470b on fix/portals-bundled-fonts. Inspect actual Git state and remote changes before assuming these remain current.
- Audit evidence: artifacts/full-audit-release/, including report.json, presentation/, flip-validation/ and performance/report.json.
- Existing validation: npm run validate, npm run build and the relevant browser scripts in tools/.

The intended outcome is a clearer, more expressive and polished arcade street-skating game. All non-mode improvements in the audit are in scope. Implement them in verified phases. Do not create Line Challenge, One Combo, Spot Attack, a campaign, multiplayer expansion or any other new mode. Improvements to existing timed sessions and Free Practice are in scope.

## Working method and ownership

Inspect AGENTS.md, the current source, Git status, package scripts and relevant skill instructions. Preserve unrelated edits and audit artifacts. Use a codex/ branch from the appropriate current standalone base; reuse a suitable existing worktree and keep the user's dirty primary checkout intact. Do not reset or clean user files.

Use relevant Game Studio skills: game-playtest, game-ui-frontend, three-webgl-game, web-game-foundations and web-3d-asset-pipeline as their scope warrants. Use Blender for asset inspection/optimization when it helps; use image/audio generation only for a defined missing production asset with a clear art or sound brief. Keep the existing supplied identity, artwork and music. Do not invoke every plugin just because it exists. No engine migration is requested.

Use up to three specialist subagents alongside the lead, with explicit file ownership and bounded tasks:

1. Gameplay: scoring, jump/speed fixtures, rail/landing regressions and session-policy modules/tests.
2. Interface/input: menus, tutorials, type, settings, remapping and accessibility.
3. Presentation: rider animation, contact VFX, audio synchronization and related assets/tests.

The lead owns shared runtime integration, rendering/optimization, task sequencing and final QA. Coordinate before editing shared files such as game-main.js and GameShell.js. Reassign ownership between phases if needed. Do not let parallel agents overwrite changes or run competing GPU benchmarks. Use collaboration subagents rather than creating separate user chats.

Create a concise implementation checklist, then begin. Resolve routine choices from this brief and the source without repeatedly asking for approval. Ask only for a genuinely blocking product decision or an action beyond authorization. Continue independent work while waiting. Give short progress updates and keep a durable checkpoint of completed work, tests and remaining work so continuation does not restart the project.

## Preserve these established decisions

- PC/keyboard/gamepad scope; do not restore touch/mobile support.
- Automatic propulsion and the approved controls, vert-exit behavior and chimp proportions; no automatic push animation.
- Fixed 120 Hz simulation and established collision geometry, unless a reproduced defect justifies a narrowly tested correction.
- Flip School remains the first Tutorial page. Keep the original guide and remove any duplicate title-screen Flip School entry if one reappears.
- Staged instructional loops remain the demonstration approach. Correct/extend them instead of replacing them wholesale.
- Keep real glow available and enabled by default in the 144-target profile, with saved explicit off choices respected.
- Gameplay feedback shows trick names and points. Do not bring back the BANKED pop-up.
- Preserve entry-speed rail capture, ground-like grind acceleration, slower acceleration above normal speed, balance bails, actual rail ends and deliberate jump exits. No passive timeout or support-correction auto-detach.
- Preserve the larger dark-red liquid, shallow raised surface and restrained splash at actual torso/head ground contact, including swept impacts. Do not relocate it to the bail-initiation anchor.
- Current baseline tuning is ground cruise 18 m/s, gravity 21 m/s², jump impulses 5.6–7.9 m/s and charge time .24 s. Measure before changing it again.

## Phase 1 — menu, readability and instruction clarity

1. Fix the CSS cascade hiding the 10-second and final-five warning labels. Make each warning readable near the timer with a distinct final-five treatment, a restrained pulse and reduced-motion support. Audio mute must not remove visual urgency. Avoid full-screen countdown obstruction.
2. Establish shared typography/spacing tokens. Target roughly 14–16 px supporting text and 18–22 px primary controls at 1080p; keep decorative microcopy secondary. Add saved UI/text scaling and high-contrast HUD options. Test 1280×720, 1920×1080, 2560×1440 and larger UI settings. Use scrolling instead of shrinking essential content or hiding controls.
3. Make graffiti headings readable during loading. Predecode/pack or sensibly cache the supplied glyph artwork; show readable text until the complete heading is ready. Retain missing-image fallback. A first visit must not show a heading with missing letters.
4. Compact or reposition Now Playing on tutorial screens so it cannot cover headings or controls. Preserve the compact gameplay card.
5. Retain the title artwork and three-part rider/deck/park selector, clear confirmation and keyboard/controller focus. Move local GLB/test-map tools into Extras/Creator tools.
6. Preserve the existing eight lesson loops and synchronized overlays. Add staged lessons for 360 Flip, Laser Flip and double-tap upgrades, with input order, release and timing cues matching the actual implementation. Add Try This Trick: preserve rider/deck, set a validated grounded practice marker and activate the selected lesson's drill. Detect actual success, offer one useful failure hint, and keep retries immediate. Extend optional drills to pop height, clean switch landing, balance correction and ramp return without creating a new game mode.

## Phase 2 — settings and input

Implement saved keyboard/gamepad remapping with clear action labels, conflict handling, reset and migration of existing settings. Preserve default controls and platform-specific button labels. Define how simultaneous bindings/chords work; avoid stealing camera/menu commands or leaving held inputs stuck. Keep dead-zone settings and distinct menu thresholds.

Add bounded camera distance/FOV and speed-FOV strength controls, retaining Follow/Classic/Fixed, collision clearance and reduced motion. Add separate music, skating SFX and countdown/announcer levels, an explicit background-audio preference, and a saved liquid-VFX toggle. Add an optional compact measured FPS/frame-time display. Settings must expose useful player choices, not implementation jargon.

## Phase 3 — round flow, score and practice feel

1. Add a brief skippable READY/GO state after world, rider and camera readiness. The round clock and automatic movement must wait until GO. Consume the confirmation/skip input so it cannot become a jump or trick on entry. Keep Free Practice fast to enter.
2. Validate each park's timed spawn for four-wheel support, clear rider headroom, enough run-up, a visible first obstacle and an open initial line. Improve framing and a restrained environmental start cue. Preserve artist obstacle transforms unless a separately validated correction is necessary.
3. Add bounded last-combo resolution at zero: an eligible existing combo or scoring attempt can finish, while no fresh combo can start. Use a maximum six-second grace window to prevent endless grinds/manuals. Preserve steering/braking needed to land. A bail loses pending points; a valid finish settles exactly once. Then freeze score and create results/highlights consistently. Make the rule visible before the run. Handle pause, focus loss, restart and replay without duplicate events or extra time.
4. Make TIME'S UP skippable after its short arrival beat; keep a fuller beat for first viewing/new best. Add restrained sound punctuation and optional music ducking.
5. Redesign result hierarchy around final score, personal-best delta, best combo/highlight and an always-accessible retry action. Put detailed score arithmetic in an expandable section. Keep larger text, full keyboard/controller navigation and truthful earned-point labels.
6. Rebalance final scoring using an explicit comparison matrix. Current actual modules produce 551 points for three separate ollies and 421 for three linked ollies. Remove the fixed-bonus incentive to fragment a line. Reward variety, meaningful linked execution and clean landings while retaining repeat decay and caps. Do not merely increase every score. Validate trick upgrades, repeated obstacles, idle balance, separate/linked identical tricks, varied lines, bails and zero-clock resolution. Version score rules and saved personal bests; never compare incompatible records silently.
7. Add per-park personal bests and a best-line replay entry using existing session/highlight systems. Keep pose replay distinct from deterministic input/physics replay.
8. Build repeatable fixtures for low ledge, stairs, rail entry, bowl return and transfer. Measure low/high pop, braking distance, overshoot and clean landings. Add an optional precision-practice speed preset if justified; isolate it from timed scoring/default physics. Improve feedback before making another global gravity or speed change.

## Phase 4 — animation, audio and VFX

Use reference-led animation changes and front/side/rear rendered evidence for all shipped riders and both stances. Prioritize Impossible rear-foot wrap, impact-dependent landing compression/recovery, grind entry/weight/exit and named grab contact. Preserve corrected inward/varial/360/Laser directions, upright catches, joint reach and foot clearance. Test motion through the full trick, not just the end pose.

Separate loss-of-control audio from the actual ragdoll ground hit. Drive the heavy hit and liquid splash from the same real contact event, emitted once. Implement surface-dependent rolling/scrape timbres from validated surface tags rather than guessing from arbitrary object names. Add restrained confirm/back, ready/start and round-over cues. Mix catch, pop, scrape and landing so timing remains legible, with volume preferences and mute/background behavior honored.

Keep dust, sparks and liquid bounded and reusable; respect graphics quality and the liquid toggle. Check first-use compilation, curved/slope placement, reset/disposal and replay behavior. Preserve liquid surface thickness/gloss and environment reflections without adding expensive live reflections just for this effect.

## Phase 5 — art direction, assets, rendering and performance

Preserve the three park identities. Warehouse: warmer wood, structural lighting/beams, consistent grain scale, restrained wear and useful landmarks. ORBIT: inspect prominent seams, quiet competing background detail and improve rider separation while preserving blue/violet neon. Paradise: improve material-scale consistency, joins, restrained edge wear and street-line landmarks.

Create a compact art bible with palettes, surface roughness/metalness/emission ranges, prop scale, shared signage and typography. Add only purposeful props outside landing/runout paths. Fix silhouette, wheel/foot/board and landing-edge readability. Reduce clipped emissive detail without turning requested glow off. Cosmetic work must preserve collision alignment.

Profile before optimizing. The audit measured approximately 137.2/137.3/132.1 screen submissions per second in Warehouse/ORBIT/Paradise on RTX 5060 Ti at 1080p with glow. These are not certified presented frames or GPU timings. Use the same warmup, moving route and settings before/after; collect average/p95/p99 intervals, slow frames, draw calls, triangles, memory and GPU timing where supported. Compare 1080p/1440p with glow and AA variants; report unsupported measurements honestly. Preserve the 6.94 ms target budget without disguising a quality reduction as a speed improvement.

Inspect the actual largest assets: Paradise GLB about 50.69 MB, ORBIT GLB 14.47 MB and galaxy image 11.94 MB, Warehouse GLB 13.73 MB. Optimize geometry and texture payloads deliberately, configure any required loaders, and retain editable sources or reproducible conversion steps. Validate PBR colors, UVs, silhouettes and collisions after conversion. Distinguish compressed transfer size, decoding time, GPU memory and readiness time. Preserve selected-world loading/disposal and avoid loading every park at startup. Measure loading progress, cache reuse, glyph delivery and common shader prewarming. Do not migrate engines or replace the whole physics controller.

## Validation and acceptance

After each meaningful phase, run targeted regression checks and inspect browser captures. After integration, require npm run validate and npm run build, existing Flip School/menu/practice suites, and new tests for changed behavior. Do not weaken existing tests to hide a regression; update an old expectation only when the new specification intentionally changes that behavior.

Exercise one complete real-time timed round through READY, GO, ten/five warnings, zero-clock resolution, TIME'S UP, results, replay and retry. Test clean landing and bail across zero, pause/focus loss, reduced motion, muted audio, controller disconnect/reconnect and settings persistence. Test every shipped park; extend coping coverage and document any imported sections with no valid sampled approach. A no-launch case is not a successful return. Keep scripted gamepad checks distinct from physical-controller comfort.

Capture before/after screenshots for menus, 720p/1080p/larger UI, each park, trick phases, countdown and results. Record/listen to new audio where supported; if a listening or hardware test cannot be performed, report that limit without claiming acceptance. Benchmark once the final graphics/assets are stable and avoid competing GPU workloads.

Keep a persistent local server on http://127.0.0.1:5182/ when available, with logs and a hidden background process on Windows. Verify it is reachable from the user's browser and that a new test session actually loads the updated code. Do not merely report a started process.

Complete all feasible scoped work and deliver:
- The working local build and exact URL.
- A concise list of visible changes and controls/settings to try.
- Tests/build/browser evidence and before/after loading/performance numbers with hardware and limitations.
- Updated implementation checklist, tuning/scoring notes and any genuine remaining blockers.
- Reviewable commits/diff on the local task branch, preserving unrelated files.

Keep this upgrade local for review. Do not merge, push, deploy or sync hosted Portals as part of this prompt. Prepare changes so a later explicitly authorized update can be applied to main and the Portals source branch while preserving Portals-specific integration. Hosted Portals synchronization remains the owner's manual step.

Begin with repository verification and the short task checklist, then proceed directly into implementation. Do not finish by merely offering to begin.
