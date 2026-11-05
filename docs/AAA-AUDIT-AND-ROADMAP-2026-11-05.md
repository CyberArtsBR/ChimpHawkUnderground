# Chimp Hawk Underground — AAA Audit & Rebuild Roadmap

Date: 2026-11-05 · Build audited: live `streetskate.onrender.com` (main `e67b07a`) · Method: source review of the full repo + hands-on play in a browser at 1280×720 on an RTX 5060 Ti.

Benchmarks we are measuring against: **Tony Hawk's Underground 1/2** (arcade combo depth, level density, personality) and **skate. / Skate 3** (Flick-It analog control, physical weight, camera, filming culture).

---

## Owner decisions (2026-11-05)

| Question | Decision |
|---|---|
| Platform / engine | **Browser first** → v2 in TypeScript + Three.js (WebGPU renderer, WebGL2 fallback) + Rapier physics, hosted on Cloudflare Pages + R2, mirrored on itch.io. |
| Characters | **Chimp Hawk (title-art chimp) is the hero + a stylised primate/street-animal crew.** Current riders (Hollow, Heretic, Adolescent, Anchor, TuxR) become unlockables. |
| Controls | **Keep today's control scheme exactly as the default ("Classic").** Add an optional Skate-style right-stick flick scheme, switchable in Options, on the same physics. Port the current input mapping 1:1 into v2 and regression-test it against v1. |
| Art resources | **Owner models in Blender.** Maps, props and the Chimp Hawk rig are authored in Blender; Claude supplies specs, blockout dimensions, export/compression pipeline and in-engine integration. |

---

## 0. TL;DR verdict

| Area | Grade | One line |
|---|---|---|
| Title key art | **A-** | Strong, marketable, clear brand. The best asset in the project. |
| Brand consistency | **D** | Title sells a chimp in a horned helmet; the playable crew are vinyl toys and a hooded figure. No chimp in-game. |
| Menus / UI | **C** | Good graffiti headers, but three button styles, 7–9 px text, repeated labels, non-button "buttons", unclear Start gating. |
| In-game visuals | **D+** | Flat grey untextured concrete, washed lighting, no props/life, rider tiny on screen. Doesn't match the sunset neon promised by the title. |
| Game feel | **C-** | Auto-push, 120 Hz sim and lots of trick plumbing exist, but rider easily stalls into walls at 0 km/h; ramps feel "locked"; no Skate-style flick control. |
| Audio | **C** | Real CC0 foley + synth fallback is the right idea; thin bank (2 variants per sound), one voice palette, no music-reactive mix. |
| Performance / delivery | **D** | ~30 MB downloaded before pressing Start, 220 MB of public assets, 49 MB single GLB, 3.7 MB skateboard model, 2.6 MB title PNG. That's what hits Render's limits. |
| Code architecture | **D** | Physics is ~12 stacked "patch" subclasses (two classes share the name `StatefulSkillStreetPhysics`), plus a half-finished parallel `core/` controller. Each fix adds a layer. |
| Process / repo hygiene | **C-** | 848 commits, 97 doc files, 198 test files, many AI-agent "cycle" reports. 228 MB git history of binaries. Lots of verification, little forward design. |

**Bottom line:** the project has a great brand hook and a large amount of careful work, but it is stuck in "polish-the-prototype" mode. The physics core cannot be extended much further without breaking, the world art doesn't sell the fantasy, and hosting is bleeding bandwidth. The right move is a **clean v2 rebuild** that keeps the brand, audio, riders and lessons, on a new repo with proper asset hosting.

---

## 1. Menus, layout, fonts, buttons, UI FX

### What I saw
- **Title screen:** great art. But the button stack mixes three styles: hot-pink filled (Start), gold-outlined (Back to game selection), and small dark pills (Practice / Tutorial / Options). "Practice" renders greyed out while the park loads. ("Back to Game Selection" intentionally links to the owner's chimp-jump game launcher, so it stays.) The "Loading Skate Paradise…" chip sits over the art.
- **Loadout ("Build Your Line"):** solid structure (Rider / Deck / Spot), graffiti headers look good. Problems:
  - Rider names duplicated: "The Hollow / THE HOLLOW".
  - "LET'S SKATE" stays disabled with no visible reason until a deck is clicked (the deck shows pre-selected as ORANGE in the footer, but isn't counted). *Phase 0: button now reads PICK A RIDER / PICK A DECK.*
  - Graffiti headers fall back to plain font while loading (visible flicker).
  - Deck "gradient glow" swatches are just colours — no real board graphics.
- **HUD:** clean corners (score, time, speed) but too small at 1080p; "Riding / Ollie Charge" labels are ~7 px. No trick string / combo meter visible during basic skating; no special meter.
- **Typography:** 4 families (Bangers, Barlow Condensed ×3 weights, DM Sans, graffiti glyph PNGs). Sizes as small as 7–9 px. `style.css` still contains leftover CSS from an old 3D model-viewer page (`.download`, `.views`, `.asset-meta`).

### Target (THUG2 / Skate 3 level)
- **One design system:** 1 display face (graffiti/brush, used only for big titles and trick names), 1 condensed UI face (Barlow Condensed), 1 body face. Min 14 px at 1080p, scale by viewport.
- **Button hierarchy:** Primary (filled), Secondary (outline), Tertiary (text). Same height, same corner, same focus ring everywhere. Controller-first focus with a big animated "spray tag" focus state.
- **Menu FX:** spray-can wipe transitions, paper/sticker textures, subtle parallax on key art, audio ticks on focus/confirm, rider idle animation turntable in loadout.
- **Flow:** Title → (Career / Free Skate / Session Run / Create) → Loadout → Map. Keep "Back to game selection" (launcher link) as a tertiary button.
- **HUD:** big centred trick string with combo multiplier (THUG), balance meter only during grind/manual, special meter, and a minimal Skate-style "clean" mode toggle.

---

## 2. Game mechanics

### Current
- Auto-push, A/D turn, Space charge ollie, arrow-key flip/grab directions, Up = grind, Q/E spin, W/S manuals, Ctrl exits vert, 90-second score runs, 5 riders, 3–4 parks, 60 tricks, Flip School tutorial, replay/highlights, practice markers.
- In play: rider stalled against a ramp wall at 0 km/h within seconds; vert "lock" makes bowls feel on rails; camera sits low and far, rider small.

### Problems (critic view)
1. **No identity in control.** It's neither THUG (button combos + reverts + manuals = infinite lines) nor Skate (right-stick flicks). Keyboard arrow-plus-WASD is awkward.
2. **Flow breakers:** stalling into walls, no auto-carve off lips, no revert, no wallplant/wallride chain, no spine transfer, no lip tricks, no caveman/off-board.
3. **Physics core is unmaintainable** (see §6), so each feel fix risks new bugs.
4. **Only one mode** (90-second score run). No goals, no progression, no unlocks, no reason to return.

### Target design (pick-and-mix of the two greats)
- **Two control schemes, same physics** (decided):
  - *Classic (default):* today's exact controls, ported 1:1. New moves (revert, lip tricks, wallplant, specials) get added on spare inputs without changing existing bindings.
  - *Flick (optional, Skate-style):* left stick = body, right stick = feet flicks (ollie = down-up, kickflip = down-up-diagonal…), triggers = grabs per hand.
- **Core loop:** line → combo → land clean → score + "spot clout" → unlock.
- **Moveset v2:** ollie/nollie/fakie/switch, 30+ flips, 20+ grabs, 25+ grinds/slides, manuals + reverts, lip tricks, wallride/wallplant, boneless, caveman, bonks, spine transfer, slam ragdoll (already have `SkateRagdoll`).
- **Modes:**
  1. *Underground Story* (short career: tour 4–6 spots, goal lists like THUG — "SKATE letters", gaps, combo targets, film a line).
  2. *Session Run* (current 90 s mode, keep).
  3. *Free Skate* + *Skate.-style Replay Editor* (already have recorder — expose camera keyframes, export clip).
  4. *Create-a-Spot* (place ramps/rails — later).
  5. *Online* (ghost runs/leaderboards first; real-time multiplayer later — a Portals branch already exists).
- **Gap system** (named gaps per map), **SKATE letters**, **collectibles** (bananas fit the chimp brand), **unlockable decks/griptape/outfits**.

---

## 3. Graphics, environment, art direction

### Current
- Skate Paradise in-game: grey untextured concrete, low contrast, flat ambient light, almost no props, no people, no signage, no decals. The title promises a **sunset neon waterfront** — the game delivers a grey bowl.
- Riders: glossy vinyl-toy look (pink/blue Hollow) on a realistic-grey world → style clash.
- Some maps are imported ready-made GLBs (49 MB Paradise, 34 MB Iron District source) — heavy and not authored for gameplay readability.

### Art direction proposal: "Neon Street Toy"
- **Lock the brand:** the hero is **Chimp Hawk** (the horned-helmet chimp). Crew = stylised primates/street animals in the same vinyl-toy language. Keep current riders as unlockables if wanted.
- **World style:** stylised-realistic (think *Skate 3* city with *Jet Set Radio* colour). Painted concrete with wear, graffiti decals everywhere, strong sunset/neon key lighting, fog/haze, emissive signage.
- **Per-map environment checklist:** hero landmark, 3+ named gaps, readable coping/rails (colour-coded edges), 40+ props (benches, cones, dumpsters, planters, hydrants, ledges, stairs, kinked rails), ambient life (birds, pedestrians, cars passing at distance, pigeons scattering on landing), sound zones.
- **Rendering:** baked lightmaps + light probes (biggest quality jump for least runtime cost), proper PBR textures (KTX2 compressed), SSAO, colour grading LUT per map, controlled bloom, contact shadows, motion blur on speed, depth of field in replays.
- **VFX:** sparks on grinds (metal) / dust (concrete), wheel skid marks, landing dust puffs, speed lines, combo-ending "spray tag" burst, bail splat (already have `BailLiquid`), board-graphic decals.

---

## 4. Audio

### Current
- Real CC0 foley: pops, lands, roll loop, concrete/metal scrapes, cloth, crowd claps, voice pain/effort, cue sounds, 2 ambience beds, 7–8 music tracks (3–4 MB each), synth fallback. Good base.

### Gaps
- Only 1–2 variants per sound → repetition after 30 s.
- No wheel-type / surface variety (wood, metal, brick, tile, grass-stop).
- No speed-scaled roll pitch/filter layering, no "rattle" over cracks, no board-flip whoosh tied to rotation speed.
- No dynamic mix (music ducking on bails exists, but no low-pass in slow-mo/replay, no reverb zones per area).
- One voice palette for all riders. No announcer/crowd personality for the chimp brand.

### Target
- 6–10 variants per impact, randomised pitch/volume, surface matrix (concrete, smooth concrete, wood, metal rail, metal coping, brick, tile, dirt).
- Layered roll: base loop + speed layer + crack ticks + bearing whine.
- Per-zone reverb (indoor warehouse vs open sunset), Web Audio convolution.
- Music: streamed (not 4 MB MP3 up front), Opus/OGG ~96 kbps, playlist UI like THUG, original or licensed tracks with clear rights.
- Chimp vocal set (hoots/laughs on big combos) = instant brand personality.

---

## 5. Performance & delivery

### Measured
- **~30 MB transferred before the player presses Start**; ~34 MB once in a map.
- `public/assets` = **220 MB**; largest: Paradise GLB 49 MB (+16 MB gz copy), Iron District source 34 MB, warehouse 16 + 14 MB, Orbit 14 MB, galaxy texture 12 MB PNG **and** 7 MB WebP, skateboard **3.7 MB**.
- Main JS ~1.3 MB minified.
- Git repo history 228 MB (binaries committed directly).
- In-pane frame rate ~31 FPS at 720p (embedded browser, may be throttled; the project's own notes claim ~137–144 in Chrome).

### Fixes (expected 80–90% download reduction)
- Meshopt/Draco geometry + **KTX2/Basis** textures via `gltf-transform` → typical 49 MB GLB → 4–8 MB.
- Skateboard ≤ 300 KB, riders ≤ 1 MB each, title art as AVIF/WebP ≤ 300 KB.
- Load only what's needed: title screen loads nothing 3D; map streams after selection; music streams.
- Remove duplicates (`.glb` + `.glb.gz`, PNG + WebP, `IronDistrictSource.glb`).
- Code-split menus / Flip School / replay editor.
- Fixed simulation step, instanced props, frustum + distance culling, LODs, shadow cascades tuned per preset.

---

## 6. Code & architecture

### Findings
- **Physics by inheritance stack:** `StreetSkater → StatefulSkillStreetPhysics → SafeCopingExit… → DeckAwareRampExit… → … → SkillStreetPhysics → StreetPhysics`, with sibling branches (`BowlLanding`, `NoAutomaticYaw`, `RampWallSafety`, `MomentumRoll`, `UnifiedRampFeel`, `StableRampReturn`, `ArcadeParkMobility`…). Two different files both export a class named `StatefulSkillStreetPhysics`. Every feel fix becomes a new override layer — the root cause of "fix one thing, break another".
- A cleaner `src/game/core/` (`CoreSkateController`, `GroundMotor`, `AirController`, `LandingResult`…) exists but was only partly migrated.
- `game-main.js` (1,085 lines) and `GameShell.js` (765) are god-files.
- 11 CSS files with overlapping rules; leftover model-viewer CSS.
- Heavy test suite (1,000+ tests) mostly locks in current behaviour, which makes a feel redesign expensive.

### Target architecture (v2)
- **Entity/component or simple system modules**: `Input → SkaterStateMachine (Ground/Air/Grind/Manual/Lip/Wall/Bail) → Motor (one per state) → Collision (Rapier or BVH) → Animation → Camera → Audio/VFX events`.
- Data-driven tricks (JSON: input, anim clip, score, difficulty), data-driven maps (gaps, goals, spawn, surfaces).
- One `GameEvents` bus feeding audio, VFX, HUD, scoring, replay.
- Tests focused on deterministic physics scenarios + a small set of browser smoke tests, not 1,000 snapshot assertions.

---

## 7. Engine / language decision

| Option | Pros | Cons | Fit |
|---|---|---|---|
| **A. Stay web: Three.js (WebGPU renderer) + Rapier physics + Vite/TypeScript, clean rewrite** | Instant play in browser, shareable link, reuse riders/audio/know-how, free hosting possible | Visual ceiling below native, harder content tooling, browser input/audio quirks | Best if "click and play" matters most |
| **B. Godot 4 (GDScript/C#)** | Real editor for level design, animation trees, Jolt physics, free/open, exports PC + web + mobile | Web export is heavier/less polished than native Three.js, team must learn it | Best balance for PC + web + maybe Steam |
| **C. Unreal Engine 5** | True AAA visuals (Lumen/Nanite), Chaos physics, Control Rig for feet/board | No web, large downloads, steep learning curve, heavy hardware | Best if Steam/PC is the only target and visuals are #1 |
| D. Unity 6 | Big skate-game community knowledge (Skater XL, Session were Unity) | Licensing history, web export is middling | Viable but no clear win over B |

**My recommendation:** **Option A (TypeScript + Three.js WebGPU + Rapier) for a v2 web game**, *unless* you want a Steam release with top-tier graphics, in which case **Option C (Unreal 5)**. Godot is the safe middle ground.

---

## 8. Hosting (replacing Render)

| Service | Free tier | Notes |
|---|---|---|
| **Cloudflare Pages + R2** (recommended) | Pages: unlimited bandwidth; R2: 10 GB storage, **zero egress fees** | Pages has a 25 MB per-file cap → big assets go to R2 (or get compressed under 25 MB, which we should do anyway). Global CDN, custom domain free. |
| **itch.io** | Free, HTML5 games supported | Built-in game community/discovery, devlogs, optional pay-what-you-want. Great as a second storefront. |
| GitHub Pages | 1 GB site, ~100 GB/month soft | Simple, but the asset size works against it. |
| Netlify / Vercel | ~100 GB/month free | Same bandwidth-wall problem as Render. |
| Steam (later) | $100 fee per title | Only if going desktop (Godot/Unreal or Electron/Tauri wrapper). |

**Plan:** new repo `ChimpHawkUnderground` (clean history, assets via R2 or Git LFS), CI builds → Cloudflare Pages; assets on R2 with long cache headers; mirror builds on itch.io.

---

## 9. Roadmap

Each phase ends with a playable build.

### Phase 0 — Stop the bleeding (1 week, on the current game)
- Compress all GLBs/textures (gltf-transform: meshopt + KTX2), delete duplicates, stream music, lazy-load maps.
- Move hosting to Cloudflare Pages + R2. Keep Render as fallback until stable.
- Quick UI fixes: min font sizes, remove duplicate names, fix Start gating. (Unified button style moves to Phase 4.)
- **Goal:** first load under 8 MB, same game.

### Phase 1 — v2 foundation (3–4 weeks)
- New repo, TypeScript, chosen engine, clean state-machine skater, Rapier/BVH collision, data-driven tricks.
- Greybox test park with every obstacle type (ledge, rail, kinked rail, stairs, gap, QP, bowl, spine, wallride wall).
- Both control schemes prototyped; pick defaults after playtests.
- **Goal:** skating feels better than v1 in a grey box.

### Phase 2 — Feel & moveset (4 weeks)
- Full moveset (§2), reverts/manual linking, lip tricks, wallplants, specials, bails/ragdoll, camera (follow / low / filmer / fisheye), slow-mo.
- Scoring/combos, gaps, HUD v2.

### Phase 3 — Art & world (6–8 weeks, overlaps Phase 2)
- Art bible ("Neon Street Toy"), Chimp Hawk hero model rigged, crew restyle.
- 2 hero maps fully dressed (Sunset Waterfront from the title art + Underground Warehouse), baked lighting, props, ambient life, decals.
- VFX pass, colour grading, post FX presets.

### Phase 4 — Audio & menus (3 weeks)
- Foley expansion, surface matrix, reverb zones, chimp vocals, streamed music player.
- Full menu/HUD redesign with transitions and controller-first nav.

### Phase 5 — Content & modes (6+ weeks)
- Underground Story (goals, unlocks), Replay Editor, 2–3 more maps, ghost leaderboards (Cloudflare Workers + D1/KV), Create-a-Spot (stretch).

### Phase 6 — Launch
- itch.io + own domain, trailer from the replay editor, community feedback loop; Steam if desktop build exists.

---

## Phase 0 results (2026-11-05, branch `phase0-asset-diet`)

| Metric | Before | After |
|---|---|---|
| Download before pressing Start | 29.6 MB | 16.9 MB |
| Skate Paradise download (.gz) | 16.3 MB | 9.8 MB |
| ORBIT download (.gz) | 8.4 MB | 2.6 MB |
| Grand Warehouse download (.gz) | 6.0 MB | 1.9 MB |
| Skateboard model | 3.7 MB | 0.9 MB |
| Title art | 2.6 MB PNG | 0.35 MB WebP |
| `dist/` build | ~220 MB | 140 MB, largest file ~14 MB (fits Cloudflare's 25 MB cap) |

Method: textures re-encoded to WebP and capped at 2048 px; geometry, skeletons and collision kept byte-identical (verified by the collision-hash tests). The Hollow keeps its original file because its pose snapshot is precision-locked. All 1,095 tests + board/vert/pump checks pass.

Still open from Phase 0: the title screen preloads Skate Paradise (9.8 MB) behind the art, and music MP3s (~3.5 MB each) aren't re-encoded (ffmpeg not installed). Deferring the park preload and geometry compression (meshopt) are needed to hit the < 8 MB goal.

## 10. What to carry over from v1
- Title key art & brand, graffiti HUD glyphs, Flip School concept, practice markers, replay/highlight recorder concept, foley library + credits, rider GLBs (as unlockables), `classic-skate-reference.md` / `thug-*-notes.md` design research, physics lessons from the audits (coping exits, landing rules).

## 11. What to leave behind
- The physics subclass stack, god-files, duplicated assets, 97 cycle docs (archive them), oversized source GLBs in the shipping build.
