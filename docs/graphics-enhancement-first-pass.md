# Graphics enhancement — first implementation pass

## Production baseline

The starting revision is `dd53bd4bd94123b6e43a64c4699bdbe6c3cd431f`, fetched from production main on 2026-10-11. The unchanged local build emitted `index-BmnDvb47.js`, matching the script filename observed at https://streetskate.onrender.com/. This establishes source/build alignment; it is not a hardware performance benchmark.

Work is isolated on `codex/production-graphics-enhancement`. Exactly three maps remain: Skyline Rooftop, ORBIT and Grand Warehouse. Map geometry, collision, grind routes, controls, camera behavior, current purple ramps, ORBIT reflections and production hotfixes are retained. High remains the default preset.

## Implemented

- Four consistent rider portraits and eight deck previews are baked from existing game models. Default menu previews load these small images instead of importing and rendering every default GLB. Custom riders retain the live rendering fallback.
- All three map cards show the actual current parks. ORBIT no longer downloads its large sky texture solely for a menu card; Grand Warehouse has an actual park image.
- Functional menu headings and graphics descriptions use readable text. Graphics settings describe effective glow, expose an independent persistent glow preference and include optional rendering details. Owner-supplied decorative graffiti remains, with a visible text fallback on missing glyph images.
- The High refresh preset preserves High material settings with a 1× pixel-ratio cap, 2-sample MSAA, lighter bloom and the existing 1024 local shadows. Performance and disabled SSR behavior remain intact. This is a candidate for 144 Hz responsiveness, not a measured 144 FPS result.
- Heretic's known exported materials receive less metallic, more diffuse response, revealing costume and face detail. Other avatars and custom uploads retain their authored response.
- Known Grand Warehouse timber and concrete materials receive appropriate matte response; perfectly smooth coping receives restrained roughness. Existing colors, textures, UVs and geometry remain intact.
- Gameplay restores the small charge/state instrument, uses `km/h`, reduces the music card after its track-change toast and separates it from trick feedback. HUD/timer DOM writes occur only when displayed values change.
- The loadout alley draws on demand for pointer, resize and artwork changes. Static menus reuse the last park frame. Gameplay continues to use the existing display-synchronized renderer loop.

## Lean verification

The two focused test files passed all 10 tests: preset capability limits, glow overrides, retained SSR/shadow behavior and narrowly scoped material changes. Production build succeeds. Its existing large-chunk/dynamic-import warnings remain.

Browser inspection covered the three rendered maps, four portraits, eight deck previews and graphics selection/glow state. No console errors were observed during the final menu check. Development thumbnail capture is excluded from production output. No broad gameplay regression suite or hardware benchmark was run for this cosmetic pass.

Screenshots are in `artifacts/graphics-enhancement/`. Local preview: http://127.0.0.1:5186/.

## Next art passes

The companion ultimate graphics prompt remains the larger brief. New props, reauthored texture sets, new lighting rigs, collision changes and heavy rendering effects are not part of this first pass. Prioritize matched close-up comparisons for timber grain/brick scale and restrained environment storytelling before adding cost. Place decorative props only outside playable lines and camera corridors.

Before promoting a high-refresh configuration, measure the same representative routes on a documented 144 Hz desktop, using a 6.94 ms frame budget and reporting p95/p99 frame times. Keep the production build and this candidate separate until review. Nothing has been pushed or deployed.
