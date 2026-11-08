# World Life Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Many small cosmetic, interactive touches across Skate Paradise, Orbit and Grand Warehouse that react to where the skater rides and how they move, within 0.5 ms CPU + 0.5 ms GPU per park.

**Architecture:** A `LifeDirector` owns a per-frame skater event detector (`WorldReactions`), a spatial sound helper (`LifeAudio`) and one life module per park plus a global module. Existing systems (pigeons in `WorldLife`/`Pigeon`, holograms and litter in `MapAmbience`, lamps in `MapDressing`/`MapDetail`, particles in `SkateEffects`) are upgraded in place by the task that owns them. Each task owns disjoint files, so tasks 2–6 run in parallel worktrees and merge one at a time.

**Tech Stack:** Three.js 0.180, Web Audio, Vite 7, `node --test`, Playwright (system Chrome) for in-game checks.

**Spec:** `docs/world-life-2026-11/01-creative-brief.md`

## Global Constraints

- Cosmetic only: no change to physics, controls, camera behaviour, collision or scoring. Nothing solid; nothing may sit between the camera and the rider for more than a moment, and no new object is added to any collision or camera-clearance mesh list.
- No spectators or rider characters in the parks.
- Procedural geometry, shaders and synthesised sound only. No new asset files, no paid generation.
- Budget per park, all new World Life work together: ≤ 0.5 ms CPU and ≤ 0.5 ms GPU added to mean frame time at 1080p Cinematic; p99 no worse than +1 ms; no new frame > 33 ms.
- Off in the `performance` preset (`settings.name === 'performance'`); half density when `settings.vfxScale < 1`.
- Reduced motion (`matchMedia('(prefers-reduced-motion: reduce)')`): reactions use half speed and half amplitude.
- No shader compile during play: every new root is revealed in the warm-up lists (`game-main.js` `warmScenePrograms`). No new per-frame shader-program lookups. Pool everything; no allocation inside `update` beyond pools.
- All sound goes to `skateAudio.extras` (pause and Sound OFF already silence it). Max 8 simultaneous life voices.
- Only existing anchors (MapDressing poles/strings/flags/lamps, rail ends, ramp edges, Warehouse roof, lamp grid and windows). No anchor → drop the item for that park and report it.
- No reactions during highlight replays.
- Upgrade, never duplicate an existing feature.

## Review Focus

1. **Map switch mid-reaction** (a gull mid-flight, a lamp mid-swing, a box mid-tumble): after `setWorld` nothing from the old park remains and geometry/texture counts return to the same values. Task 1 owns a director round-trip test; every module test includes `setWorld` twice then counts children.
2. **Respawn / reset** (R key, bail respawn, fall-out): reactions must not fire a fake landing or bail when the skater teleports. Task 1 test: `respawnSerial` change suppresses events that frame.
3. **Performance preset and reduced motion toggled mid-run:** everything hides and stops sound immediately; switching back restores it. Each module test calls `setQuality({name:'performance'})` and asserts its root is hidden and `update` does no work.
4. **Pause / Sound OFF during a reaction sound:** silence within ~30 ms (extras bus). Task 1 test: `LifeAudio.play` routes to `audio.extras`; voice cap respected.
5. **Skater far from the park centre or flying high (vert):** agents never pop into view at the rider's position or block the camera. Each module uses only anchors and keeps agents ≥ 1.2 m from the rider at all times (asserted in module tests).

---

### Task 1: Foundation — reactions, spatial sound, director, wiring (lead, in branch `world-life`)

**Files:**
- Create: `src/graphics/life/WorldReactions.js`, `src/graphics/life/LifeAudio.js`, `src/graphics/life/LifeDirector.js`, `src/graphics/life/lifeAnchors.js`
- Modify: `src/game-main.js` (construct next to `worldLife` at ~:147; `setQuality` at ~:400; `setWorld` in `commitWorld` ~:814 and initial ~:940; `update` right after `worldLife.update` ~:1185; add `lifeDirector.root` to the warm-up reveal arrays ~:849/:895)
- Modify: `src/graphics/MapDressing.js` (record anchors only: `this.anchors = { poles: [], lamps: [], strings: [] }` filled in `buildLamps`/`buildFlag`/`buildStrings`, cleared in `clear()`)
- Test: `tests/world-life-foundation.test.mjs`

**Interfaces (produced):**
- `class WorldReactions { on(kind, fn): () => void; update(skater): void; reset(): void }`. Kinds and payloads (payload objects are reused; copy what you keep):
  `'landing' {point: Vector3, severity: 0..1, surface: string}` · `'pop' {point}` · `'grindStart' {point, material: string}` · `'grindEnd' {point}` · `'bail' {point, speed: number}`. Suppressed on the frame `respawnSerial` changes and while `skater.bailTime > 0` except the `'bail'` edge itself.
- `class LifeAudio { constructor(skateAudio); setListener(camera): void; play(kind: string, position: Vector3, {gain=1, rate=1}={}): boolean }`. Kinds: `'flap','chirp','clink','thud','creak','rattle','beep','hum','ring','clatter','whoosh'` (synthesised once, cached). Equal-power `PannerNode`, `distanceModel 'inverse'`, `refDistance 4`, `maxDistance 60`, routed to `skateAudio.extras`; returns `false` when no running context or 8 voices busy.
- `class LifeDirector { constructor(scene, {skateAudio, mapDressing}); register(module): void; setWorld(world): void; setQuality(settings): void; update(dt, skater, camera): void; reset(): void; root: Group; reactions: WorldReactions; audio: LifeAudio; reducedMotion: boolean }`.
- Life module contract (every module in tasks 2–6): `{ parks: string[] | '*', root: Group, setWorld(world, ctx), setQuality(settings), update(dt, skater, camera, ctx), reset(), dispose() }` where `ctx = { reactions, audio, anchors, scan, surface, reducedMotion, density: 0|0.5|1 }`. `anchors = mapDressing.anchors` (`{poles, lamps, strings}` arrays of `{position: Vector3, height: number}`), `scan` = the existing `scanMap` result, `surface` = the park collision (`skater.surface`). Director calls only modules whose `parks` includes `world.id` (or `'*'`).
- `lifeAnchors.js`: `nearestFree(points, from, minDistance): Vector3|null`, `keepClearOfRider(position, riderPosition, minDistance=1.2): Vector3` (pushes a point out of the radius).

- [ ] Write failing tests: reactions fire `landing` once on a grounded false→true edge with severity from `presentation.landingSeverity`; no events on a `respawnSerial` change frame; `bail` fires once per new `rider.ragdoll.groundImpact`; `grindStart/grindEnd` edges with material from `surfaceTagFor`; `LifeAudio.play` connects to a fake `extras` node and refuses a 9th voice; director activates only matching modules, `setWorld` twice leaves `root` children equal, `setQuality({name:'performance'})` hides `root`.
- [ ] Run `node --test tests/world-life-foundation.test.mjs` → FAIL.
- [ ] Implement the four files and the MapDressing anchor recording; wire `game-main.js`.
- [ ] Tests PASS; `npm test` shows only the 17 known failures; `npx vite build` passes; game boots on all three parks with no console errors.
- [ ] Commit `feat(world-life): reaction events, spatial life audio, director`.

### Task 2: Global touches (subagent, worktree `wl-global`)

**Files:** Create `src/graphics/life/GlobalLife.js` (`parks: '*'`); modify `src/graphics/SkateEffects.js` (skid marks only). Test `tests/world-life-global.test.mjs`.

- **Grind tail**: on `grindEnd` after a metal grind ≥ 0.25 s, `audio.play('ring', point, {gain: 0.5})` decaying over ~0.6 s.
- **Bail marks**: on `bail`, `audio.play('clatter', point)` and 2–4 short skid-mark decals (pooled, max 12, fade over 6 s) along the board's travel direction, laid on the ground via `surface.ground`.
- Tests: ring only for metal and ≥ 0.25 s; skid pool never exceeds 12; marks hidden after fade; `setWorld` clears marks.
- [ ] TDD steps as Task 1; commit `feat(world-life): grind tail and bail marks`.

### Task 3: Pigeons and motes (subagent, worktree `wl-birds`)

**Files:** modify `src/graphics/WorldLife.js`, `src/graphics/Pigeon.js`. Test `tests/world-life-birds.test.mjs`. `WorldLife` gains `react(ctx)` usage via `lifeDirector.reactions` passed through a new `setLifeContext(ctx)` method (called by the director's owner in `game-main.js` — this task adds that one call).

- **Hop aside**: rider within 3.4 m at speed ≤ 1.5 → pigeons hop 0.6–1.2 m away (walk state) instead of flying; flight stays for fast passes and landings (existing thresholds).
- **Flinch**: `grindStart` or `bail` within 10 m → alert flinch (0.4 s) then flee if within 6 m.
- **3D wing claps**: existing flap sounds go through `ctx.audio.play('flap', bird.position)`.
- **Warehouse roost**: on `grand-warehouse`, 3 of the 7 pigeons perch on roof/lamp-grid anchors (`ctx.anchors.lamps` tops); `landing` with severity ≥ 0.5 or `bail` within 14 m makes them flutter, drop 1–2 feathers, and resettle on a perch after 3–5 s.
- **Motes part**: motes within 1.6 m of the rider at speed > 6 are pushed outward (eased, no pop).
- Tests: slow approach → hop not flight; grind within 10 m → flinch; roost count = 3 only on warehouse; motes never inside 0.8 m of the rider at speed; existing pigeon tests still pass.
- [ ] TDD; commit `feat(world-life): smarter pigeons, rafter roost, parting motes`.

### Task 4: Skate Paradise pack (subagent, worktree `wl-paradise`)

**Files:** create `src/graphics/life/ParadiseLife.js` (`parks: ['skate-paradise']`). Test `tests/world-life-paradise.test.mjs`.

- **Gulls** (max 5): perch on `anchors.poles`/`anchors.lamps` tops; take off when the rider comes within 9 m or on `grindStart`/`landing` within 14 m; circle at 12–20 m altitude for 8–20 s, return to a free perch. Procedural wings (flap rate tied to climb, glide when level). `audio.play('chirp', pos)` on take-off, max one call per 3 s.
- **Fireflies and moths** (max 60 points, two pooled `Points`): drift around `anchors.strings`/`anchors.lamps`; within 3 m of a rider moving > 4 m/s they scatter outward and drift back over 3 s. Warm glow colour from the park palette.
- **Cans and cones** (max 8): placed near rail ends and ramp edges on flat ground (`surface.ground`), ≥ 2.5 m from spawn; when the rider passes within 1.0 m at > 3 m/s, tumble with a scripted spin + slide (no physics engine), `audio.play('clink'|'thud', pos)`, rest, and reset to origin after 25 s when off-screen.
- Tests: gull count ≤ 5 and all perched at rest; take-off on approach; fireflies ≤ 60; can tumbles once per pass and returns home when unseen; nothing spawns within 1.2 m of the rider.
- [ ] TDD; commit `feat(world-life): Paradise gulls, fireflies, cans and cones`.

### Task 5: Orbit pack + MapAmbience upgrades (subagent, worktree `wl-orbit`)

**Files:** create `src/graphics/life/OrbitLife.js` (`parks: ['orbit']`); modify `src/graphics/MapAmbience.js` (hologram proximity flicker, litter wake on all parks). Test `tests/world-life-orbit.test.mjs`.

- **Glowing tiles**: under each wheel contact on the grid floor, a pooled additive quad (max 48) lights the tile cell (match the floor grid pitch measured from the scene) and fades over 0.8 s. **Landing ripple**: on `landing`, an expanding ring quad (max 4 live) over 0.7 s, radius ≤ 4 m × severity.
- **Hover bots** (max 4): glowing orbs bobbing on lazy paths at 1.2–2.2 m height over open floor; when the rider is within 4 m they dart 3–5 m away with a `beep`; never inside 1.2 m.
- **REC drone** (1): flies a lazy offset 5–7 m from the rider on the side opposite the camera, 3–4 m up, blinking red light; never enters the camera-to-rider segment (keeps ≥ 1.5 m from it); soft `hum` loop at low gain.
- **Hologram flicker** (MapAmbience): rider within 6 m of a hologram → glitch burst for 0.5 s, cooldown 2 s.
- **Litter wake** (MapAmbience, all parks with litter): at speed > 8, kick 1–2 pieces per second from behind the rider (existing pool, no new pieces).
- Tests: tile pool ≤ 48 and recycled; ring count ≤ 4; bots never within 1.2 m; drone never within 1.5 m of the camera-rider segment over a scripted path; hologram flicker respects cooldown; wake uses only the existing pool.
- [ ] TDD; commit `feat(world-life): Orbit tiles, ripples, hover bots, REC drone; hologram flicker, litter wake`.

### Task 6: Grand Warehouse pack + lamp swing (subagent, worktree `wl-warehouse`)

**Files:** create `src/graphics/life/WarehouseLife.js` (`parks: ['grand-warehouse']`); modify `src/graphics/MapDressing.js` and `src/graphics/MapDetail.js` (lamp swing only; Task 1's anchor recording must be preserved). Test `tests/world-life-warehouse.test.mjs`.

- **Swinging lamps**: `landing` with severity ≥ 0.5 or `bail` within 9 m → the nearest 1–3 lamps swing as damped pendulums (amplitude ≤ 12°, settle ≤ 6 s), updating only those instance matrices; their floor light pools follow; `creak` sound per lamp, one per 1.5 s.
- **Dust in light shafts**: for each roof window found in the scan or model (anchor search; drop if none), a soft additive shaft volume with pooled dust points (max 120 total) that swirl when the rider passes through.
- **Cardboard boxes** (max 6): loose boxes on flat floor near walls/crates, topple and slide when passed within 1.2 m at > 3 m/s, `thud`, reset unseen after 25 s.
- **Fence rattle**: on `grindStart` or wallride within 5 m of a rail/fence anchor, a visual shake (≤ 2 cm, 0.4 s) on that anchor's dressing mesh if it is dressing-owned, plus `rattle`; the model's own rails get sound only.
- Tests: swing amplitude ≤ 12° and settles; only nearest ≤ 3 lamps; dust ≤ 120; boxes ≤ 6 and reset; `MapDressing.anchors` still populated after `setWorld`.
- [ ] TDD; commit `feat(world-life): Warehouse lamp swing, dust shafts, boxes, rail rattle`.

### Task 7: Integrate, measure, verify, document (lead)

- [ ] Merge tasks 2–6 one at a time into `world-life`; after each: `npm test` (17 known failures only), `npx vite build`, boot all three parks, no console errors.
- [ ] Measure each park against the baseline (`docs/world-life-2026-11` baseline, same scripted route, 2 runs): mean/p95/p99, program lookups per frame (must stay 0/4/6), 4 × 40 s resource check, map round-trip, performance preset hides everything, pause/Sound OFF silence.
- [ ] Over budget → reduce density or drop the costliest item for that park; record it.
- [ ] Fixed-view captures plus a reaction sequence per park; view them.
- [ ] `feature-dev:code-reviewer` on the full diff; fix confirmed findings.
- [ ] Write `docs/world-life-2026-11/02-results.md` (what shipped, costs, dropped items, unverified) and an infographic page.
- [ ] Ask the owner before merging or pushing.

## Rollback (owner requirement)

- The live build before this work is tagged `pre-world-life-main` (main `f93f1ec`) and `pre-world-life-portals` (portals `ed7c3f5`), both pushed to GitHub.
- World Life merges into `main` as **one** `--no-ff` merge commit, so undoing it is one command: `git revert -m 1 <merge-commit>` then push (the site redeploys the previous behaviour).
- Full reset alternative: `git reset --hard pre-world-life-main` on main, then force-push (owner approval required).
- Cloudflare's dashboard can also re-promote the previous deployment instantly.
- Document the exact merge hash and these commands in `02-results.md`.
