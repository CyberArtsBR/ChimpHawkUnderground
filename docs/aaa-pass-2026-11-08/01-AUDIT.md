# Document 1 — AAA Game Audit (2026-11-08)

Build audited: `main` at `bbf2569` (live chimphawk.pages.dev) plus today's work on branch `aaa-polish`.
Hardware: Windows 11, RTX 5060 Ti, Chrome (ANGLE/D3D11), 1080p unless stated.
Method: real gameplay driven by scripted keyboard input in Chrome (Playwright), per-frame instrumentation, Chrome traces, canvas captures, code review by four specialist reviewers (audio, UI, gameplay/input, lifecycle/memory), and the existing 1,141-test suite.

Owner constraints honoured throughout (from project memory): enhance the original game only; keep the existing menus; keep rider/deck/spot loadout on one screen; do not change physics, controls or camera behaviour unless asked. Several gameplay-feel recommendations below are therefore listed as **owner decisions**, not implemented.

## Executive summary

The game is in better technical shape than its history of patch layers suggests. Gameplay input, scoring and fixed-step timing were reviewed and found sound; resource cleanup on map and rider switches works; a two-minute multi-segment session shows no geometry, texture or heap growth after warm-up. Rendering is fast on this hardware (3.5–4.5 ms per frame at 1080p Cinematic).

The real defects were in places players feel without being able to name them:

- **Stutter**: flips stalled on half the frames above 120 FPS; the camera spent up to 18 ms per frame searching for a clear view on Paradise; Orbit materials re-resolved shaders ~69 times per frame.
- **Animation snaps**: the head jumped on every takeoff and turned 51° in one frame on stance switches; mid-flip the rider was lifted with locked legs.
- **Fragility**: one exception anywhere in a frame froze the game permanently.
- **Audio**: music clipped above ~70% volume during combos; music stayed muffled after a bail into pause/results; sounds clicked when cut and some kept playing after pause or Sound OFF.
- **Readability**: HUD and menu labels as small as 6–10 px that ignored the Text size setting; focus disappeared on chosen loadout cards.

All of these are fixed and verified (see Document 3). What remains is mostly creative direction (feel, content depth, art density) that needs owner decisions and human playtesting.

## Scores (0–10)

Scale: 10 = exceptional for a polished browser skateboarding game of this scope; 7 = solid, few visible flaws; 5 = works but clearly unfinished; 3 = frequently broken. Scores are reviewer judgements anchored to the measurements cited; "provisional" means no human playtest evidence.

| Category | Before → after | Basis |
|---|---|---|
| Stability | 7 → 8.5 | Unguarded loop (one exception froze the game) fixed and verified by fault injection; no page errors across long sessions and map switches; no resource growth. |
| Performance / frame pacing | 7 → 8 | Orbit 5.6–6.0 → 4.2–4.3 ms; camera hitches on Paradise removed (max 18.5 → 3.6 ms); flips now advance every frame. Remaining: rare 25–35 ms first-use frames. |
| Animation | 6 → 7.5 | Six measured discontinuities removed (Document 3); foot contact exact; pose extremes identical at 120 and 240 FPS. Remaining: procedural rig has no authored clips; small grab-in kink. |
| Audio | 6 → 7 | Clipping, stuck muffle, clicks and post-pause sounds fixed. Remaining: thin variant pool, one voice palette, wide roll pitch range (subjective). Provisional: no human listening. |
| UI / UX / typography | 7 → 7.5 | Labels readable and scalable; focus visible; hover distinct; overlaps fixed. Remaining: three stepper styles, inconsistent footnote sizes, legacy CSS. |
| Graphics / rendering | 7 → 7.5 | Same image, cheaper (shader thrash removed); pixel parity verified. Remaining: world art density uneven; 205 MB texture memory (no KTX2). |
| Gameplay / mechanics | 7 (unchanged) | Input edges across the 120 Hz step, scoring, combos and timers verified correct. Physics untouched by owner rule. |
| Game feel | provisional 6 | Smoother presentation now; prior audits report stalls against walls and "locked" ramps — owner decision items. |
| Skateboarding authenticity | provisional 6 | Arcade-leaning; flips/grabs/manuals/grinds/vert exist; board-body alignment improved today. Wall stalls and limited lines hold it back. |
| Camera | 7 (behaviour unchanged) | Same choices, now cheap; five modes retained. |
| Architecture / code quality | 6 (unchanged) | Physics subclass stack and large integration files remain; today's changes are small, tested and local. |
| Accessibility | 7 → 7.5 | Text size now reaches HUD and menu labels; focus visibility fixed; reduced motion already thorough. |

## Findings by category

### A/B. Gameplay, controls, skateboarding

- **Verified correct** (gameplay reviewer + tests): edge inputs (ollie, grind, direction taps) survive the 120 Hz fixed step without loss or doubling; pause/blur clear input; gamepad dead zone and hysteresis are correct; combo de-duplication, multiplier cap and single overtime bank are consistent; timers stop while paused; physics integration uses fixed steps and `exp(-k·dt)` smoothing (frame-rate independent).
- **P3 defect (fixed)**: falling out of the world reset the rider without the respawn signal, so the camera eased in from the old spot and drills/audio missed the new life.
- **Owner decisions (not implemented, physics/camera rule)**: rider can stall against walls at near-zero speed; vert lock makes bowls feel on rails; no revert/manual linking for long THUG-style lines; camera sits low and far on some maps. These are the biggest remaining "fun" levers.

### C. Graphics and rendering

- **P1 (fixed)**: shader program thrash. Floor mirrors rendered inside the main pass (three.js keeps separate light state for nested renders), one black glow material shared across skinned/instanced/plain meshes, double-sided transparent decals drawn twice, a rider material shared between skinned and rigid meshes. Lookups per frame: Orbit 69 → 4, Warehouse 19 → 6, Paradise 14 → 0.
- No shader compiles during gameplay (programs added = 0 across scripted runs). No textures above 2048 px (files named "4k" are already 2048).
- **P3 (open)**: ~205 MB estimated texture memory on Paradise; KTX2/Basis is the candidate if lower-end GPUs matter. Warehouse glass and lamp cones still re-resolve 6×/frame (double-sided transparent volumes: single-pass would change their look).

### D. Animation

Measured per frame in gameplay (joint second differences, board steps, foot IK error):

| Issue | Before | After |
|---|---|---|
| Flip board stepping above 120 FPS (jitter index) | 1.87 | 0.002 |
| Mid-flip pelvis lift / locked legs | up to 20 cm | none |
| Head on ollie takeoff | 6 cm / 16° in one frame | continuous |
| Head on stance switch / 180 landing | 51° in one frame | ≤9°/frame |
| Deck at flip start during the pop | 14° snap | eased |
| Elbow on grab release | ~4 cm jump | smooth |
| Japan grab knee | 11–12 cm pop | 2.5 cm |
| Deck-locked foot contact | exact | exact |

### E. UI

Measured by the UI reviewer at 1920×1080, 1280×720 and 800×720 (computed styles, rects, pixel contrast):

- **P1 (fixed)**: HUD labels 6–10 px; Text size setting ignored by HUD and many menu labels; focus ring removed on chosen loadout cards.
- **P2 (fixed)**: hover identical to selection; loadout status under the controls hint; 8 px stepper glyphs; invisible 720p scrollbars; results bar letting content through; low contrast on pink fill.
- **P3 (open)**: three stepper styles; footnote size varies per screen; legacy model-viewer CSS still shipped; pause poster title sits behind the rider (deliberate art — owner call); "96 SEC SESSION" overtime label may confuse.

### F. Audio

- **P1 (fixed)**: music chain peaked +1.3…+2.8 dBFS at full music volume (measured on all 7 tracks); reactive music froze muffled/boosted outside the render path.
- **P2 (fixed)**: hard-cut clicks on silence and the menu confirm cue killed by its own pause; combo stingers and car rumbles playing on after pause/Sound OFF; stale landing severity; wood loop seam; dead fallback condition.
- **P2/P3 (open)**: AudioContext is only resumed on pointer/key (no `statechange`/visibility handling; unverified on devices); replays record constant event strengths; roll loop pitch spans +16 semitones (subjective); impact variance narrow; one compressor for all buses; no voice stealing at the 16-voice cap.

### G. Performance

- Frame time (1080p Cinematic, uncapped, same scripted route): see Document 4.
- Garbage collection is not a hitch source (110 minor GCs ≤1 ms and 2 major ≤5.3 ms over ~35 s of play). Pooling the rider's per-frame allocations was therefore not prioritised.
- Camera clearance was the hitch source on Paradise (92 probes × 5 rays in blocked frames). Fixed with an exact broad phase.
- Bails cost +1–1.5 ms/frame (ragdoll collision); acceptable on this hardware, worth watching on low-end CPUs.
- Long session: geometries jump once on first play (pools/passes) then stay flat; heap stable ~90 MB; no page errors.

### H. Architecture and code quality

- **P1 (fixed)**: the main loop ran without an exception guard.
- **P2 (open)**: `webglcontextrestored` not handled (game asks for reload); unclamped real delta reaches highlight playback after a long hidden tab (cosmetic).
- **Debt (no rewrite recommended now)**: physics subclass stack, `game-main.js`/`GameShell.js` size, 14 CSS files with overlapping rules, `LoadoutBackdrop` dead code, 17 long-standing failing tests (asset/preset expectations that drifted).

### I. Competitive assessment

Against THUG 1/2 and skate. 3 as quality benchmarks (not content to copy):

- **What they have that this lacks**: long linked lines (reverts, manual linking, wallplants) — the core of THUG's addictiveness; dense, readable spots with named gaps and goals; physically weighty board feel and an expressive camera (skate.); varied, characterful audio.
- **Where this game already competes**: distinctive brand and title art, clean HUD language, fast load for a browser game, smooth 144+ FPS presentation now, flip/grab variety, Flip School tutorial, replays/highlights.
- **Objective vs subjective**: everything in Document 3 is objective and measured. Line-linking, wall-stall handling, camera framing and art density are creative recommendations that need owner approval and human playtests.
