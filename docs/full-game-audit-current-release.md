# Chimp Hawk — current release audit

Reviewed 29 October 2026. Standalone source: `29c3809`. Live build: `index-gEvcqnB8.js` at https://streetskate.onrender.com/. This report supersedes older open-issue lists; previously corrected inward/varial rotations, tutorial activation, loadout return, upgraded-trick scoring, rail acceleration and bail-contact placement are not being reported again as unfixed bugs.

## Assessment

The strongest direction is a fast arcade street-skating game built around the chimp cast, expressive trick motion, short replayable sessions and distinctive parks. The title art, park selection, sparse gameplay HUD and Flip School give it a recognizable identity. The next substantial improvement should be clarity and game-loop quality: know where to start, understand the last ten seconds, finish a line fairly, understand the score, and immediately want another attempt.

The game is not ready for a claim of stable 144 FPS across hardware or complete competitive balance. It is playable and has extensive automated coverage, but the score incentives, countdown presentation, small supporting text, asset loading and some motion/material details still need work. This is a source, browser and visual review, not a physical-controller/pro-player panel or professional listening session.

## Fresh evidence

- Full standalone validation: **895/895 tests**, board **15/15**, vert **20/20**, pumping **15/15**. Log: `artifacts/full-audit-release-tests.log`.
- Live browser audit completed a real-time timed session, captured start/10 seconds/5 seconds/time-up/results, watched a highlight, restarted, and entered all three public parks. No captured page or console errors. Data: `artifacts/full-audit-release/report.json`.
- Fresh Flip School suite passed: all eight videos decode, timed input overlays, Xbox/PlayStation/keyboard labels, playback controls, keyboard/simulated gamepad navigation, gameplay pause/return, reduced-motion startup and missing-video fallback. No page errors. Data: `artifacts/full-audit-release/flip-validation/report.json`.
- Screenshots cover title, loadout, options, graphics, Flip School, original guide, pause, round states, results at 1080p/720p, replay and three park entry/riding views. The original guide and results had no measured page-level horizontal overflow in these views.
- Cold-context readiness in this run: **8.98 seconds**. This is one machine/network sample, not a universal load-time figure.
- A synthetic scoring comparison used the actual `SkateTricks` and `RunFinalScore` modules; see finding 2.
- Moving screen-submission measurements and supplementary presentation captures are recorded separately below. Screen submissions are not GPU completion, display presentation or input-latency measurements.

Supplementary checks confirmed the incomplete lettering is a loading transition: 26 decorative letter images were initially unready in the selected loadout view; none remained unready after 1.5 seconds. The decoded Flip School loop and settled time-up/results headings rendered correctly. The extra end-card capture used a synthetic browser-clock advance solely for presentation inspection; the main audit's full round used real time. Evidence: `artifacts/full-audit-release/presentation/report.json` and its screenshots.

### Moving performance sample

Headless Chrome/ANGLE Direct3D11, NVIDIA RTX 5060 Ti, 1920×1080 canvas, 144 profile, glow on, optional AA off. One approximately 60-second moving sample per park, after three seconds of warmup, using a repeating left/right steering sequence. Traveled path length was about 540–563 metres per sample; this is not an expert-authored clean line. Browser measurement overhead, background machine load, collisions and recovery are included.

| Park | Screen submissions/second | p95 interval | p99 interval | CPU render-submission time / screen frame |
|---|---:|---:|---:|---:|
| Grand Warehouse | 137.2 | 8.2 ms | 8.9 ms | 2.77 ms |
| ORBIT | 137.3 | 8.3 ms | 9.1 ms | 2.29 ms |
| Skate Paradise | 132.1 | 8.6 ms | 9.6 ms | 4.07 ms |

The 144 Hz frame interval is 6.94 ms. These samples do not demonstrate a locked 144 FPS. Paradise warrants deeper profiling, but the measurements do not isolate CPU versus GPU bottlenecks. Repeat on a controlled route at 1080p/1440p, with glow/AA variants and a lower-tier GPU; obtain GPU timings before choosing rendering changes. Data: `artifacts/full-audit-release/performance/report.json`.

## Highest priorities

P1 means a high-value next patch or release-quality concern. P2 means important polish or depth. A design issue is not necessarily an implementation failure.

| Priority | Finding | Evidence | Recommended action / acceptance |
|---|---|---|---|
| P1 | Last-ten-second warning text is hidden | Timer state sets `10 SECONDS LEFT` / `FINAL 5 SECONDS`; both `game-hud.css` and `gameplay-instruments.css` hide `#run-timer::after` with `!important`. Live 0:10/0:05 captures show numerals and a small TIME label. Audio threshold cues still fire. | Restore one short high-contrast warning near the timer. Use a distinct final-five treatment and one modest pulse, respecting reduced motion. Muting audio must still leave an unmistakable warning. |
| P1 design | Fixed per-combo bonuses encourage isolated low-risk tricks in a tested case | Three separate 50-point ollies: final **551**. Three linked ollies: combo 226, final **421**. The +100 bonus per bank outweighs the benefit of linking those repetitions. | Reduce or reshape the flat bonus; reward meaningful line length, variety and risk. Compare isolated vs linked repetitions, varied lines and one-obstacle loops before choosing values. Version scoring rules if retaining personal bests. |
| P1 UX | Supporting text is too small across key screens | Computed live sizes include **7 px** rider subtitles, **9–10 px** graphics guidance and **8–9 px** results details at 1080p. | Establish a shared scale: approximately 14–16 px normal supporting text at 1080p, 18–22 px primary controls, with a larger UI option. Let long panels scroll instead of shrinking all text. Validate couch distance and 720p. |
| P1 loading | Heavy first-play assets and delayed decorative lettering | Paradise GLB is **50.69 MB**; ORBIT GLB **14.47 MB**, its galaxy texture **11.94 MB**, Warehouse GLB **13.73 MB**, Heretic **6.37 MB**. First-use menu/result captures show partial letter artwork while images arrive. | Optimize the large park/texture payloads, preload/decode frequently used lettering or use a packed atlas, and show readable fallback text immediately. Keep tutorial/menu navigation available during park preparation; show useful loading progress. |
| P2 design | Timed round begins without a preparation beat | `GameShell.start()` starts play and resets the 90-second clock immediately; input grace is .3 s. | Add a brief skippable READY/GO beat after world, rider and camera are ready. Freeze the timer during it. Retry must use the same spawn and framing. Practice should stay quick to enter. |
| P2 design | Clock zero cuts off the current attempt | `finishRun()` pauses immediately and reads the already earned score; no pending-combo resolution phase exists. | Define the rule explicitly. Prefer a bounded “finish this combo” phase: no fresh combo, land or bail, then results. Alternatively retain hard cutoff and explain it before the run. Test a jump, grind, manual and bail crossing zero. |
| P2 UX | Results explain arithmetic before they encourage replay | At 1080p the large calculation panel occupies most of the first view; retry actions are below the fold. | Lead with final score, best-line highlight, personal-best delta and sticky retry. Collapse detailed arithmetic. Keep every number available, with larger text and truthful labels. |
| P2 audio | Bail impact sound occurs at bail initiation | `SkateAudio.update()` fires the bail hit when `bailTime` begins; the newer liquid VFX waits for actual torso/head ground impact. | Separate a short loss-of-control sound from the body-ground impact transient, driven by the same contact event as the splash. Airborne bails should not sound like they already struck concrete. |
| P2 art | Rider, deck and landing edges lose detail in some views | Dark rider silhouette in ORBIT/shadowed Paradise; bright orange deck masks small surface details; conspicuous ORBIT seams. | Tune rider fill/rim separation and board emissive energy, inspect seams, and preserve the requested glow. Validate in motion, not only close-up screenshots. |
| P2 tutorial | Observation does not transfer directly into selected-trick practice | Eight staged base lessons and a generic Free Practice action; four optional drills. Advanced upgrades are explained in text but have no dedicated loop. | Add “Try this trick” that starts a safe practice setup with that lesson selected and a quick retry marker. Add 360/Laser/double-flip loops and timing cues while preserving the current staged lessons. |

## Menus, typography and settings

Keep the supplied title artwork and cast. They establish the game's identity far better than another broad redesign. The loadout's three-column rider/deck/park structure is understandable, with visible confirmation and strong focus outlines. Preserve the fixed tutorial-return behavior and the single Tutorial entry.

The owner-supplied graffiti lettering needs a reliable loading state. A heading made of separate PNG letters can appear incomplete on first exposure; the early loadout/result captures demonstrate that presentation risk. A missing-image fallback already exists for errors, but it does not cover a slow image that has not failed. Predecode or use readable text until the complete heading can be revealed. Reserve this display treatment for short headings and rewards; body instructions and settings need the plain text family.

Move the Now Playing card away from tutorial headers, or compact/hide it during instruction screens. At 1280×720 it overlaps the upper-left tutorial area. The gameplay version is already restrained and belongs at an edge.

Recommended settings additions, in order:

1. UI/text scale and a high-contrast HUD option.
2. Full keyboard/gamepad remapping, with conflict detection, reset and saved presets. Existing dead-zone presets are useful but do not replace this.
3. Camera distance/FOV and optional speed-based FOV strength. Keep existing follow/classic/fixed modes.
4. Separate music, skating SFX and countdown/announcer levels; explicit background-audio preference.
5. Optional liquid VFX toggle, retained by saved preference.
6. Optional frame-time/FPS display that reports measured performance; a 144-target preset is not a guarantee of 144 Hz output.

The local-GLB test-map importer currently appears in ordinary Options. Move it into an Extras / Creator tools section so normal setup stays focused. This preserves the feature while making the public menu easier to understand.

## Spawn, final ten seconds and round over

The park entries tested produced finite positions and movement; Warehouse/ORBIT/Paradise were running near 17.7/17.7/16.6 m/s after three seconds in the captured approaches. Grand Warehouse also has explicit four-wheel support/headroom validation. These checks do not certify every spot or the entire path ahead of a spawn.

For timed play, author a clear first line at each entry: visible first obstacle, enough run-up, an open landing, a recognizable landmark, and a camera facing the opportunity. Use a clean floor mark or environmental cue. Do not force a tutorial overlay or a cinematic camera during normal precision landings.

The threshold state and two synthesized cues at 10/5 seconds are implemented and triggered during the real timed run. The missing visual warning is the immediate fix. Keep a single short 10-second cue, a tighter final-five signal, and an optional voice announcement. Avoid multiple full-screen countdown numbers competing with the board and coping.

At zero, the current game changes to a three-second TIME'S UP card and then results. This transition completed in the browser. The fixed wait ignores input, so repeated runs incur a presentation delay. Make it skippable after the first short arrival beat; keep the three-second version for first-time viewing or a new best. Use a brief musical/SFX punctuation and optional music ducking, rather than simply adding another persistent sound layer. The end-of-run and overtime rules must agree with scoring and highlights.

## Gameplay, pace, speed, jumps and fairness

The current default is automatic propulsion toward **18 m/s (64.8 km/h)**, gravity **21 m/s²**, jump impulses **5.6–7.9 m/s**, and charge time **.24 s**. Ideal same-height ballistic flight is approximately **.53–.75 s**, rising **.75–1.49 m**, before ramp/runtime adjustments. Rail speed accelerates toward 18 m/s and then more slowly toward 23 m/s. These are deliberate arcade settings, not incorrect physical constants.

Do not immediately raise speed or airtime again. Test this tuning on a small fixture set: low ledge, stairs, rail entry, bowl return and transfer. Record overshoots, clean landings, braking distance and time to next attempt. Offer a precision-practice speed preset if skilled and new players need different setup time. A single global gravity change should not substitute for better obstacle spacing or contact animation.

The previous passive grind detach was removed; balance failure, real rail end and ollie-out remain. The balance system intentionally drifts toward failure without correction. Make the balance meter and its failure reason readable so a balance bail is not mistaken for an automatic rail timeout. Physical-controller correction comfort and the user's exact historical rail route were not retested in this audit.

The scoring comparison above exposes one incentive problem, not proof that every varied combo is undervalued. Build a score regression matrix before tuning: three isolated identical tricks, one linked repetition, one varied line, trick upgrades, idle balance, repeated obstacles, bail and timer-zero. Reward the behavior the game wants players to learn.

Add per-park personal bests with the scoring-rule version, a best-line replay entry, and optional clear goals. These provide reasons to return without requiring more maps immediately.

## Animation and skate motion

The corrected inward/varial board rotations and opposite 360/Laser footwork are in this release. Base timing separates preload, pop, flick, rotation, catch and landing. Automated rig tests are valuable and passed, but they cannot certify weight or skate credibility.

Prioritize a reference-led visual pass in this order:

1. **Impossible:** make the rear-foot wrap relationship convincing; a general deck end-over-end rotation and released-foot offsets do not by themselves communicate the trick.
2. **Landing:** check compression against impact severity, slope and stance; avoid sliding feet or a sudden neutral return.
3. **Grinds:** clarify entry weight transfer, sustained body balance and intentional exit versus balance loss.
4. **Grabs:** verify hand-to-deck reach and clearance for each named grab, including switch.
5. **Ragdoll recovery:** verify the impact, puddle, sound and respawn as one readable event, with a short consistent recovery.

Capture front/side/rear at takeoff, flick, half rotation, catch and impact for every rider. Preserve established proportions and the approved absence of automatic push animation. Do not claim a foot-contact error solely from a single obstructed screenshot.

## Tutorial

Flip School's structure is good: selected trick, staged loop, synchronized input overlay, ordered steps, slow playback and a path to the original controls guide. The current eight lessons should remain the first tutorial page. The older Enter/controller/loadout-return defects are corrected.

Add explicit double-tap timing for 360 Flip and Laser Flip, a comparison between holding a direction and releasing it after the trick tap, and a short “why it did not register” hint based on actual input. A selected-trick practice action should preserve the player's rider, set a safe practice marker, and progress only after a valid landing. Do not bring back the BANKED pop-up; explain earned points in the guide and use trick names plus points during play.

The current drills cover ollie, kickflip, grind and a three-trick combo. Extend them with low/high pop, clean switch landing, balance correction, ramp return and a planned line. Optional practice remains accessible immediately.

## Lighting, graphics, shaders and level art

| Park | Current read | Most useful improvement |
|---|---|---|
| Grand Warehouse | Warm wooden obstacles over a large dark floor; functional but sparse in the tested view. | Structural beams/lighting, consistent plywood scale, restrained wear, district signs and a few recognizable landmarks. Keep landing/runout paths open. |
| ORBIT | Clear blue/violet identity and bright coping, but black rider areas and repeated dark seams compete with reading the route. | Inspect seam construction/material joins, quiet background detail, separate the rider silhouette and reserve strongest glow for useful features. |
| Skate Paradise | Sunset atmosphere and readable concrete/metal, but hard material transitions and repeated near-field textures dominate some views. | Consistent texel scale, restrained edge wear, smoother material transitions and clearer street-line landmarks. Keep concrete, wood and coping distinct. |

Use a small art bible: three park palettes; roughness/metal/emission ranges; consistent prop scale; shared signage and typography. Add props with a gameplay purpose—line landmarks, a recognizable start area, benches/bins outside runouts, restrained banners—before filling empty space indiscriminately. Decorative geometry must not alter approved collision routes without a separate physics check.

The 144 profile retains real selective glow. Edge smoothing is optional. Keep both. Current puddles have shallow raised geometry, clearcoat/environment highlights and bounded droplets at torso/head contact. Their reflection is an environment reflection, not a live mirror of nearby objects. Curved-ground conformity and all slope cases remain visual test targets.

Avoid adding expensive reflection passes or new full-screen shaders before measuring them. Stable material response, good light direction and readable edges will improve this game more reliably than another stack of post effects. If depth/edge artifacts are unresolved, inspect a captured render frame before guessing at the cause.

## Audio and VFX

Rolling/grinding/braking/wind layers and pop/catch/landing transients already exist; music and effects volume are separate. The two clock cues are synthesized. No claim about the subjective quality of the mix is made without listening tests.

Recommended pass: compare wood/concrete/metal wheel and scrape timbres using actual surface tags; align ragdoll impact audio with the physical hit; add restrained menu confirm/back sounds, a ready cue and round-over punctuation; briefly duck music for critical timing cues. Check overlap between catch, landing and grinding, as well as pause/mute/background behavior. More layers are useful only when their timing remains readable.

Maintain bounded dust/sparks/liquid pools. Keep liquid and dust out of the selective bloom mask, and keep normal wheel contact lighter than a heavy bail. Add a saved liquid toggle for preference and screen capture. Verify the first use of any new effect for shader-compilation hitches.

## Engine, assets and optimization

The Three.js/Vite runtime is suitable for the current game. A wholesale engine migration is not supported by the evidence. The fixed 120 Hz simulation, BVH collision, reusable visual effects, static-menu render gating and world resource disposal are useful foundations. The long inherited physics-controller chain is a maintenance risk: continue extracting tested services gradually, with recorded ramp/landing regressions, rather than rewriting it during feel tuning.

Immediate asset work should start with the largest live payloads, not just the JavaScript bundle. Measure geometry, embedded image sizes and texture resolution inside each GLB; reduce excess detail, package supported compressed assets deliberately, and validate silhouettes/materials/collision afterward. The 11.94 MB galaxy image is an obvious candidate for a smaller delivery format. File size alone does not prove every asset is loaded at boot; the browser resource report identifies which were requested during this audit.

The measured 8.98-second readiness includes network, decoding, collision preparation and initialization. Split those costs before choosing a fix. Cache reuse, selected-park loading and prewarming likely material variants should be measured. Do not preload every park merely to make selection instant; that would increase initial download/memory.

Keep graphics settings understandable by their actual tradeoffs: internal resolution, AA and glow. The 144 target uses an internal pixel budget, so a 1440p/4K display may not render the scene at native resolution. Add profiling that distinguishes submitted frames, GPU time, slow frames and shader warmup. No broad claim of CPU/GPU bottleneck is justified by callback or submission counts alone.

Highlight capture is bounded to 32 MB and up to 30 Hz visual poses; it is not a complete deterministic physics/input replay. Reuse the separate deterministic tools for reproducible bug reports, and keep the player-facing replay lightweight.

## New mode recommendation

**Build Line Challenge first.** Each park gets three authored lines with a visible start marker and 2–4 clear objectives—for example, flip the stairs, grind a named rail, then land clean in the exit zone. Bronze/silver/gold evaluate completion, variety and cleanliness. A quick retry returns to the same grounded marker and heading. Make the first version untimed or use a generous optional target; do not let UI prompts cover landings.

This mode uses existing parks, trick events, practice markers and route metadata. That metadata describes feature sequences, not a proven clear navigation path, so each route needs authored coordinates and an actual playtest. A line must reward a distinct trick sequence, not repeated low-risk banks.

Next choices: **One Combo** (best single line, bank-or-bail), then **Spot Attack** (short score challenge around one authored obstacle). Ghost time trials are later work because visual highlights alone cannot supply reliable replay simulation. A campaign or wider multiplayer system should follow the core clarity/performance work, not delay it.

## Implementation order

1. Countdown visibility, readable type, music-card/tutorial overlap and stable heading loading.
2. Scoring incentive matrix, explicit zero-clock rule, ready/start and faster repeat-run flow.
3. Largest asset optimization, sustained frame profiling and readability/material corrections.
4. Animation contact/reference pass and synchronized surface/impact audio.
5. A small Line Challenge vertical slice on one park, then expand after player feedback.

This audit adds reports and QA scripts only. It does not implement or publish the recommendations. Remaining acceptance work includes physical gamepad comfort, skilled-player line tests, audio listening, missing imported coping approaches and a wider GPU/display matrix.
