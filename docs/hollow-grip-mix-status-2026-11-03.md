# The Hollow, grab contact and soundtrack mix — local delivery

Date: 2026-11-03. Base: `66fcd65`. Branch: `codex/hollow-grip-mix-20261103`. This is a local candidate for owner testing. No push, merge, deployment or Portals synchronization.

Game: http://127.0.0.1:5185/ . Refresh the tab to load this build. Soundtrack/reaction A/B: http://127.0.0.1:5187/mix-v3/ . The audition WAVs remain outside shipping assets.

## Delivered

- **The Hollow** is the first of five stock riders. The supplied 924,560-byte GLB is byte-identical to the original; no rig, texture, geometry or source material edits. His baked portrait and the full-width five-card roster fit at 720p/1080p with keyboard/gamepad navigation. Initial boot loads this rider directly, avoiding an unselected 2,700,460-byte legacy placeholder. [Asset and roster evidence](hollow-rider-2026-11-03.md).
- **Actual palm reach** is calibrated for Adolescent, Heretic, Anchor and TuxR. Across 48 held cases, mean deformed palm-patch gap to the real deck surface improves from 19.87 to 10.06 cm; Heretic Japan improves from 30.4/34.3 to 12.1/7.9 cm, regular/switch. A grab-only gather channel eases entry/release. Existing ankle targets, limb scales, physical root, input, trick timing and scoring remain intact. The Hollow's 36 reach/hold/release motion snapshots match the prior runtime. Deck triangles and authored targets prepare during loading. [Measurements and remaining contact gaps](evolution-cycle3-grab-contact.md).
- **Music/reaction handoff** follows the selected recording's actual duration. Short pain takes no longer leave a 650ms music dip; exceptional applause no longer restores music after only 900ms. Requests have independent holds/releases and cancel on silence/channel mute without erasing session cues. Thirty offline stereo mixes include all seven existing soundtrack files: maximum sample .646552, zero clipping/nonfinite samples or surviving duck timers. No source recording, voice identity or default volume was replaced; the rejected cheer remains excluded. [Audio details and audition](finish-mix-v3.md).
- **First-bail/respawn shader stalls** prepare behind loadout. The measured Paradise route exposed previously hidden liquid/splash and translucent rider variants: about 890ms of liquid program-log waits and 2,220ms of rider waits occurred during play. `renderGameplayWarmup` draws the actual normal and faded rider states with effect pools visible, then restores every material/visibility/culling value and the final composed image. It emits no effects and advances no simulation. The follow-up route contains no liquid/rider waits during play and no frame intervals over 50ms. Loading includes this work; shader compilation is moved rather than eliminated.

## Focused verification

Three native specialists handled roster/assets, rig contact and recorded-audio mix; the lead integrated boot/audio hooks, inspected screenshots and transitions, diagnosed the hitch and verified the final build. Game Studio asset-pipeline/playtest skills and existing Three.js, Chrome/Playwright, Web Audio and Git were sufficient. No installation, paid generation or new game mode.

| Check | Result / evidence |
| --- | --- |
| Roster / portrait / navigation | 19 focused tests; real menu fixture at 1280×720 and 1920×1080, keyboard and simulated gamepad, zero portrait GLB loads. `artifacts/hollow-roster/`. |
| Grab motion/contact | 25 focused tests; numerical palm, chain, ankle, wrist, Hollow invariance and transition checks. All-five before/after held sheets plus final Heretic Japan and Anchor Stalefish normal/slow recordings. `artifacts/hollow-grip-v3/animation/`, `artifacts/evolution-cycle3/`. |
| Audio | 32 focused tests and 30 soundtrack mixes. `artifacts/finish-mix-v3/audio/`. |
| Recovery shader preparation | 10 focused warmup checks, including restoration after failure and a previously flashing rider. `artifacts/hollow-grip-v3/warmup-tests.log`. Existing rider-swap checks also pass. |
| Production build/assets | `npm run build` and `node tools/agent10-verify-dist.mjs` pass. Entry `assets/index-BVUcSc7Z.js`; about 1.315 MB minified /369.02 kB gzip. Existing bundle-size advisory remains. `artifacts/hollow-grip-v3/build.log`. |
| Final local runtime | `node tools/verify-hollow-runtime.mjs`: first actor is Hollow, five baked cards/real rigs load, actual keyboard ollie+grab, unchanged glow defaults, no page/HTTP errors. `artifacts/hollow-grip-v3/browser/`. |

The owner requested minimal testing, so the prior full suite/physics/round results were retained. No new full 90-second round, physical-controller certification or human listening signoff is inferred.

## Performance capture and limits

One initial capture identified the Paradise hitch. One instrumented diagnostic reproduced it; one focused follow-up verified the correction. Same 10-second wall-clock keyboard workload per park, one automated game at a time, 1920×1080 CSS viewport, DPR1/native 144 FPS preset, 2× AA, 1024 shadows and requested glow 1.50/1.09/.10/.11. The diagnostic and follow-up also use CDP CPU sampling and timed program-log probes. Hardware: Windows Chrome, RTX 5060 Ti through ANGLE/D3D11. No focus loss or browser errors.

| Park | Final callback rate | Frame interval p95 | GPU time p95 | Frame intervals >50ms |
| --- | ---: | ---: | ---: | ---: |
| Warehouse | 143.69/sec | 7.00ms | 6.20ms | 0 |
| ORBIT | 143.79/sec | 7.00ms | 6.01ms | 0 |
| Paradise | 136.89/sec | 13.70ms | 6.68ms | 0 |

Evidence: `artifacts/hollow-grip-v3/performance/`, `hitch-diagnostic/`, `performance-final/`. The diagnostic Paradise route had two 451ms intervals and one 2,236ms interval. The final capture has none over 50ms. The critical compilation waits occur in select/pause instead of play. Small later basic-material variants still appear in the program probes.

These are short callback observations, not display-presentation FPS, repeated medians, deterministic replay or a sustained 144 FPS guarantee. Moving stalls changes simulation wall-clock progression, so final positions can differ despite identical input event times. Paradise's remaining 13.70ms p95 requires longer profiling before another optimization. Glow, sharpness, render scale, shadows and source art were not reduced.

Remaining limits: exact finger wrap/full grip is unauthored (largest calibrated gap 21.4cm, Heretic switch Tailgrab); Hollow intentionally keeps its prior grab motion. Voice/crowd identity variety, human sound approval, long-session memory and broader hardware/browser coverage remain future work. No online platform behavior or deployment is certified by this local pass.
