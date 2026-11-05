# Ultimate graphics upgrade prompt — StreetSkate / Chimp Hawk Underground

Use this as the full enhancement brief for a coding assistant, technical artist or game art team. The first implementation pass is documented in `docs/graphics-enhancement-first-pass.md`; use that report to avoid repeating completed work. The companion historical audit contains hypotheses that must be checked against production.

---

Act as the art director, UI designer and technical artist for this existing Three.js arcade skateboarding game. Enhance the CURRENT LIVE PRODUCTION version on `main`: it is the best version so far and the authoritative baseline. Improve its graphic design, menus, HUD, textures, materials, props, lighting and environmental composition while preserving the visual direction and gameplay improvements already achieved. Prefer sustained 144 FPS on 144 Hz displays on a documented target desktop. Produce real reviewable improvements and comparisons grounded in current production evidence.

## 1. Establish the baseline

The baseline is the version of `main` deployed to production when enhancement work begins. Record the live URL, deployed commit/build identity where available, capture date, production settings and matching `main` source revision. Establish which source/assets actually produced the live version before editing. Do not replace this baseline with an older commit, local branch, historical screenshot, preview build or worktree. If `main` has undeployed commits, preserve the distinction between live baseline and development head.

`G:/Streetskate/warehouse-update` contains this brief and the earlier source inspection; its branch and commit are not proof of the live baseline. Read applicable repository instructions and `docs/graphics-art-direction-audit-2026-10-11.md`, treating that audit's older observations as hypotheses to recheck against production. Preserve unrelated work and implement changes in an isolated branch derived from verified production source without resetting the user's checkout.

Scope is EXACTLY THREE LIVE MAPS: Skyline Rooftop, ORBIT and Grand Warehouse. Confirm their production IDs, names and loaded assets. Do not add maps, restore retired maps, change the map count or use historical Urban Warehouse images as evidence of current presentation. Exclude legacy content from enhancement work.

Inspect actual title/loadout/options/pause/tutorial/results states and gameplay. Create a repeatable capture set with fixed camera, rider, pose, exposure, quality setting and viewport. Inventory visible GLB materials, texture dimensions, UV conventions, decals, lights, props and import overrides. State which findings are visible, source-proven or still hypotheses.

Create a preservation checklist from production: current map layouts, removed unwanted geometry, working purple ramps, reflective ORBIT finish, existing sky and bloom treatment, character/deck identities, graffiti branding, camera behavior, collision, grind routes, controls and session flow. Enhance these deliberately. Earlier audit suggestions are not instructions to undo recent improvements. If a proposed change does not look better in a matched comparison or harms performance/gameplay, revise or discard that change.

## 2. Creative target

Create a premium stylized underground skate experience: expressive toy-like riders, tactile skate-worn surfaces, bold graffiti identity, disciplined readable interface, warm cinematic Rooftop light, calm celestial ORBIT atmosphere, and authentic industrial Warehouse depth.

Use believable material behavior without turning the stylized riders into unrelated realistic humans. Preserve owner-supplied glyph art and recognizable costumes. Make the promotional art and gameplay feel like the same product through palette, pose, lighting and presentation. Keep the next obstacle and rider more visually important than the sky, floor reflections, particles or music UI.

Do not equate quality with blanket 4K textures, more props, larger shadow atlases or maximal post-processing. Select changes by visible benefit and measured cost. Do not copy another game's logos, UI or copyrighted assets.

## 3. Menus and graphic design

Create a compact shared visual system: ink surfaces, warm neutral text, restrained cyan/violet atmosphere and gold primary actions. Define spacing, type scale, border/radius, focus, selection, disabled, loading and error tokens. Apply them to all screens. Preserve the game's colorful identity while quieting surfaces behind text.

Preserve the current graffiti identity in the logo and decorative headings. Recheck legibility on production before changing typography. Where functional action labels, graphics headings, instructions or vital trick feedback are hard to read, use readable real text or improve the existing glyph composition. Give decorative glyphs correct bounds and advance instead of assuming uniform width; verify complete words and implement visible image-failure fallback. Accessibility labels alone do not solve visual readability.

Rework title action controls as responsive DOM buttons when practical while retaining the existing title illustration. Ensure hitboxes, focus and artwork remain aligned. Prefer layered artwork without baked functional labels for future title assets. Check localization, short displays and narrow screens.

Improve loadout subject occupancy with consistent pre-rendered portraits using the same camera and lighting. Keep live 3D preview optional. Make black costumes readable without washing them out. Show deck shape, trucks and finish clearly; expose a closer side/underside preview for the selected board. Give each selectable map a genuine current in-engine image with consistent framing and labeling; ORBIT's sky alone should not stand in for its skatepark.

Make focus different from selection. Mark selection with a check and readable label, not color alone. Preserve already-valid loadout choices when replaying; show why any start button is disabled. Surface explicit loading and failure states for portraits and previews. Test cold cache, unavailable assets, keyboard and controller navigation.

Use body text around 14–16 CSS px and secondary labels around 12–13 px as initial goals; tune against viewport fit and contrast. Target readable contrast, 44 px primary interactive targets where practical, clear focus, and no clipped actions at 200% text zoom. Resolve the accumulated CSS overrides into coherent ownership where necessary; avoid adding another fragile cascade patch.

## 4. Gameplay HUD and feedback

Review the live HUD first. Preserve its current successful layout and add or restore banked score and meaningful active combo/multiplier presentation only where missing or unclear. Keep time, balance and ollie charge understandable. Use a compact speed unit of `km/h` if the value is actually kilometres per hour. Verify current data and state flow before changing labels.

Check the current music card for actual gameplay overlap. If it competes with essential feedback, offer a short track-change toast followed by a compact unobtrusive indicator, retaining its visual identity. Keep full track details and skip instructions in pause or a deliberately expanded state. Define screen-safe regions so combo feedback, balance, timer and music never overlap.

Give bank, bail and landing distinct restrained visual feedback. Use short readable text for bail causes if the existing gameplay state provides reliable reasons. Offer HUD scale and reduced motion where feasible. Ensure animated decoration never obscures a landing or rail approach.

## 5. Texture and material production

Build a material test scene with a neutral key, soft fill, grazing light and a metre-scale reference. Review concrete, plywood, brick, coated steel, bare coping, rubber, painted alloy/ceramic and character costume materials together.

Define world-scale UVs and texel-density targets by expected camera distance. Inspect authored GLBs before replacing textures. Use arc-length mapping on transitions, align plywood grain to construction, keep screws and joints plausible, and avoid stretching one tile across a giant obstacle.

Separate albedo, normal/height and roughness signals. Keep color textures in sRGB and data textures in their appropriate linear interpretation. Verify correct channels, orientation and renderer support before introducing packed maps. Align wood/brick relief to visible grain/mortar; do not blindly reuse height as roughness. Remove strong baked directional lighting from reusable albedo where possible.

Author material variation at macro, medium and micro scales. Concrete needs restrained aggregate and localized wheel wear; plywood needs grain, panel seams, screws and directional skate scuffs; coping needs polished contact wear; painted metal needs sparse edge wear; rubber should remain matte. Avoid uniform grunge on every surface and noisy cracks across clean ride lines.

Use 1K–2K shared surface sets and 512–1K prop atlases as starting budgets. Higher resolution needs a demonstrated closeup benefit. Measure decoded memory, mip behavior and startup cost. Precompute deterministic canvas detail when runtime generation is unnecessary. Preserve transparent decal behavior while ensuring ramps remain opaque.

Create several original graffiti/decal compositions in a shared atlas. Prefer walls, vertical ramp faces and rest-zone storytelling. Use riding-surface marks sparingly. Preserve efficient sharing, but stop visibly stamping the same mural everywhere.

## 6. Map-specific art direction

**Skyline Rooftop:** warm sunset key, balanced cool fill and softer distant mauve sky. Reduce bleached concrete and repeated floor graffiti. Separate deck, coping, timber and concrete by value and roughness. Establish one skyline landmark and one major mural wall. Cluster HVAC, vents, seating, fence repairs and small utility props along safe boundaries. Keep the first playable line and landing areas clean.

**ORBIT:** preserve the production sky, reflective finish, current neon direction and successful reduced bloom as the starting look. Test restrained refinements to rider/rail separation; soften the gameplay horizon or decouple sky and environment illumination only where matched production captures show a clear benefit. Evaluate subtle roughness/material information without returning unwanted floor grids or sacrificing the chosen smooth reflective finish. Decide whether each surface is ceramic, concrete or painted alloy and make its physical response coherent. Preserve opaque purple ramps. Distinguish actual grindable coping from decorative lights using silhouette, supports and continuity; rails must read with bloom off. Retain colored neon cores and small halos. Do not reintroduce removed blue funboxes. Add a restrained docking landmark, equipment bay or observation structure only where composition and route clearance justify it.

**Grand Warehouse:** warm timber, cool daylight and readable structural depth. Inspect the actual imported map rather than assuming `WarehouseMaterials.js` controls every face. Correct panel grain scale, brick alignment, end caps, steel response and local floor wear. Use believable architectural light direction and static occlusion before adding many realtime lights. Compose a workshop corner, storage rack, rest zone, posters and conduit groups. Preserve intended stairs, grind paths and transition shapes; do not accidentally restore previously removed misplaced geometry.

## 7. Props and geometry craft

Audit existing full-map prop coverage first. Define hero landmarks, medium story groups and small detail props. Give every new asset a map-specific purpose, plausible scale, material family, source/license record and explicit decorative/solid/rideable role.

Improve visible silhouette and shading with selective bevels, weighted or authored normals, clean coping joins, support brackets and layered timber edges. Inspect for flipped normals, duplicate faces and z-fighting before adding detail. Keep gameplay collision unchanged for cosmetic work. If geometry, scale or placement must change, verify collision, rails, transitions and camera clearance together.

Place dense detail in rest areas and boundaries. Keep run-ins, ollie paths, coping tops, landings and camera corridors clear. Validate new props against import logic: names and materials currently influence surface/collision classification. Prefer explicit metadata over introducing more naming exceptions.

Use shared textures, atlases, LOD and instancing when appropriate. Evaluate culling and material groups before merging whole maps. Never claim a performance improvement solely because draw-call count decreased.

## 8. Lighting and rendering

Calibrate all selectable avatars and neutral/saturated deck finishes on all selectable maps. Preserve black-costume details using controlled fill and highlights. Establish convincing wheel/foot contact and landing shadows. Avoid solving material problems through global exposure or glow.

Retain the existing intentional 1024 shadow-map constraint unless current project/user instructions allow revisiting it. First test local frustum coverage, bias, normal bias and stable contact detail. Evaluate baked static occlusion or lightweight contact techniques only through a visual/performance comparison. Do not add indiscriminate SSAO, heavy reflections or shadow-casting fixtures.

Make bloom optional and selective. Correct `GraphicsPipeline.configureBloom()` and its per-frame re-enable policy so ORBIT cannot silently force bloom when the effective setting disables it. Keep settings, UI summaries and actual render passes synchronized. Distinguish selected preset, hardware-resolved values and user overrides. Show understandable player-facing descriptions with optional technical details.

Keep sharpening conservative; inspect thin rails and moving-camera shimmer. Evaluate SSR only where it contributes useful material cues and survives offscreen/reflection limitations. Ensure the fallback still looks intentionally authored. Avoid motion blur, film grain, chromatic aberration or strong vignette by default if they reduce skating readability.

Reduce menu rendering cost when idle or under reduced motion; disabling pointer parallax alone does not stop the current backdrop render loop. Inspect map-switch disposal and post-process targets when testing memory.

### Preferred 144 Hz / 144 FPS performance target

Treat high-refresh responsiveness as a core quality requirement. On a documented representative desktop with a 144 Hz display, target sustained 144 FPS at 1920×1080 with the intended enhanced gameplay preset. Record CPU, GPU, browser, display refresh, device pixel ratio, internal render resolution and effective settings. Refresh rate and delivered FPS are separate measurements; verify both. Do not claim universal 144 FPS across all hardware or quality tiers.

The total frame budget is approximately **6.94 ms**. Measure CPU and GPU work separately where supported; overlapping CPU/GPU timings are not simply added. Seek p95 frame times at or below 6.94 ms on representative warmed-up routes, record p99 and missed-frame counts, and preserve headroom for tricks, particles, transitions and HUD events. Use the same timed route, settings and device for baseline/candidate comparisons, including each map's demanding view. Capture at least 60 seconds per representative route after warm-up; report loading and cold shader stalls separately. Averages alone do not establish smooth 144 FPS.

Use display-synchronized rendering and elapsed-time-based presentation. Audit animation, camera smoothing, VFX and menu motion for frame-rate dependence. Preserve the existing fixed-step gameplay simulation unless evidence requires a separately scoped change: a 120 Hz simulation can feed interpolated presentation at 144 Hz. Verify whether interpolation already exists; add it only if necessary, interpolating visual transforms while keeping authoritative collision, trick timing and gameplay state fixed-step. Never change physics tick rate to 144 merely to match the monitor.

Prioritize cheap visible improvements: coherent albedo/roughness, calibrated lighting, baked static detail, sensible local shadows, shared materials, spatial culling, suitable LOD, instanced repeated props, limited transparent overdraw and fewer unnecessary fullscreen passes. Profile expensive map traversals, allocations, DOM writes and repeated shadow/bloom scene work before optimizing them. Cache stable render classifications and update them on scene/rider changes where useful. Avoid large unbounded per-frame scans and asset construction during active skating.

Provide a quality path that prioritizes 144 FPS, with optional dynamic render scale using hysteresis to avoid oscillation if measurement justifies it. Keep DOM text sharp and gameplay silhouettes stable. Higher visual presets may cost more; label their tradeoff honestly. If hardware cannot sustain 144 FPS, retain the improved art direction and offer explicit 120/90/60 FPS options as supported fallbacks. Lower settings should reduce render cost before removing important gameplay cues. Do not silently cap suitable hardware at 60 FPS or make 30 FPS the design target.

Acceptance requires a visible improvement over live production AND measured high-refresh performance on the stated target device. If production already reaches 144 FPS, preserve that performance. If it does not, establish a measured path toward 144 instead of claiming it was achieved. Reject added effects or props that regress baseline frame pacing without a justified quality-tier tradeoff.

## 9. Execution order and deliverables

Implement in bounded reviewable phases:

1. Verify live production `main`, capture its three maps, document preservation requirements, and measure baseline frame pacing at 144 Hz.
2. Typography, HUD hierarchy, rider visibility, portrait states and effective graphics controls.
3. A polished representative scene section in each of the three live maps; verify the style through matched comparisons and 144 FPS profiling before propagating it.
4. Material/UV/decal and geometry craft pass.
5. Landmark and prop composition, genuine map thumbnails, consistent loadout previews.
6. Measured rendering and asset-delivery improvements, followed by complete visual regression review.

Provide a short rationale for each change, edited source and assets, provenance, before/after captures, implementation limitations and a rollback path. Do not publish, deploy, buy assets or start paid generation unless authorized in the work session. Complete local reviewable work first. If paid generation would help, supply exact prompts and estimated asset requirements while continuing work that does not depend on it.

## 10. Acceptance criteria

- Menus remain usable at 1920×1080, 1366×768, 1280×720, 844×390 and 390×844; check text zoom, focus and asset failures. Responsive UI does not establish touch-control support.
- The rider, board, next obstacle and grindable rails remain recognizable in every map and with bloom off.
- Functional text is readable; no heading visually loses letters; unavailable portraits have understandable states.
- Essential score/combo/time/balance/charge feedback stays visible during track changes and low-time warnings.
- Materials preserve plausible world scale; wood grain, screws, brick relief and highlights align; no visible UV stretching or obvious decal stamping on the reviewed routes.
- Ramps stay opaque; reflections and neon do not conceal slope changes or imply missing geometry; no new z-fighting or obvious normal artifacts.
- Prop additions preserve collision, approach/landing clearance and indoor camera visibility. Run relevant gameplay checks when changing geometry or metadata.
- Graphics OFF states actually disable their effects on all maps; quality labels reflect effective settings and supported fallbacks.
- The verified live production version on `main` is the comparison baseline; the game still contains exactly the same three live maps and preserves its successful current direction.
- Prefer sustained 144 FPS on a verified 144 Hz display at 1920×1080 on the documented target desktop and enhanced gameplay preset. Target a 6.94 ms frame budget and p95 at or below that budget on warmed-up representative routes; report median, p95, p99, missed frames, CPU/GPU timings where supported, stalls, draw calls, triangles, texture allocations and cold load time. Preserve existing baseline performance and identify device/preset limitations. Do not present targets as achieved measurements.
- Check presentation and unchanged gameplay timing at 60/120/144 Hz and across quality changes. Lower-powered devices can use explicit supported fallbacks; 144 FPS remains the preferred design target.
- Verify repeated map switching and menu entry for resource accumulation. Evaluate asset compression through real load and fidelity comparisons.

## Optional asset-generation briefs

Use these only when asset production is authorized. They are separate outputs, not one image mixing textures, props and interface.

**Tileable plywood albedo:** Create an original seamless square skatepark plywood color texture, straight construction-aligned grain, natural warm tan variation, sparse knots, restrained directional wheel scuffs, plausible panel treatment. Orthographic flat material scan appearance, neutral diffuse light, no perspective, directional shadows, shine, labels or logos. If screws/seams are included, document tile coverage in metres and align companion maps exactly. Inspect tile seams before admission.

**Coherent companion material maps:** From the approved base material, author registered height/normal and physically motivated roughness maps; keep identical crop, scale and feature placement. Use shallow grain relief and wear-specific roughness. Do not fabricate unrelated noisy maps and call them a coherent PBR set. Validate lighting response in-engine.

**Original graffiti atlas:** Original underground skate lettering and abstract motifs in restrained cyan, violet, warm white and gold. Several distinct mural compositions with transparent surrounding space and padded atlas regions, no licensed logos or copied artist tags. Keep text-critical UI separate and authored as real text. Supply placement/UV regions and check alpha edges.

**Warehouse prop family:** Stylized believable industrial workshop kit: storage rack, closed equipment cabinet, skate rest bench, cable conduit modules and maintenance cart. Consistent metre scale, coated dark steel, restrained worn timber, rounded visible edges, sparse original stickers. Supply clean geometry, efficient shared textures, LOD guidance and explicit decorative/collision roles. No clutter across skating routes.

**Map thumbnail brief:** Capture the actual current map from a consistent elevated three-quarter camera showing a recognizable playable feature and landmark. Use the map's real lighting and materials; keep enough contrast for a small card. Add labels in the interface, not baked into the image. Do not invent props or geometry absent from gameplay.

**Concept reference only:** A polished stylized underground skateboarding game frame featuring the existing rider identity, readable action silhouette and one clearly visible skating route; tactile plywood and concrete, restrained original graffiti, convincing contact light, selective colored neon and calm background composition. Rooftop uses warm sunset/cool fill, ORBIT uses midnight alloy/celestial accents, Warehouse uses warm timber/cool daylight. No excessive bloom, mirror floors, noisy grunge, illegible typography or decorative clutter. Label generated references as concepts; never present them as screenshots or completed implementation.
