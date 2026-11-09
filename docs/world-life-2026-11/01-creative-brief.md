# World Life — Creative Brief (2026-11-08, revised after owner Q&A)

## Intent (owner's words, summarised)

More interactive things like the birds: small, cosmetic, visual touches that respond to the skater and **add up** to parks that feel alive. The combo moment is already covered by the on-screen callout and its sounds, so the world does **not** add another combo celebration. The owner left the choice of parks and features to the builder.

## Goals

- Many small interactive details across **all three parks**, each simple on its own.
- Reactions keyed to **presence and movement**: passing close, speed, landing nearby, grinding, bailing.
- Each detail reads instantly and settles back to calm (the park is never noisy when you stand still).
- Subtle sound where it helps the detail read (a flutter, a clink, a creak).

## Non-goals and anti-goals

- No changes to physics, controls, camera behaviour, collision or scoring (owner rules).
- No combo celebrations, crowd cheers or "hype pulse" (already covered by the callout).
- Nothing solid: props never block, push or trip the skater, and nothing covers the rider or the camera's view.
- No new game modes; no paid or unlicensed assets (procedural geometry, shaders and synthesised sound).
- No spectators or rider characters in the parks (owner removed the "crew" idea).
- Never more than a light sprinkle on screen: if it distracts from skating, it's wrong.

## Constraints and budgets

- ≤ 0.5 ms CPU and ≤ 0.5 ms GPU added per park (mean frame time, 1080p Cinematic, dev machine); p99 no worse than +1 ms; no new 33 ms frames.
- Off in the Performance preset; reduced density below High; respects reduced motion (gentler, slower reactions).
- No shader compiles during play (warm in loadout); no new per-frame shader lookups; pooled agents; geometry/texture counts flat over long sessions and after map switches.
- All sounds through the existing extras bus, so pause and Sound OFF silence them.

## The touches (builder's choice, in build order)

### Shared foundation
- **Reaction events** from the skater: near-pass (position, speed), landing (point, severity, surface), grind start/stop (material), bail (impact point).
- **Spatial sound helper** (3D panning, distance falloff) on the extras bus.
- **Agent pool** with distance and visibility update tiers.

### Everywhere
- **Grind tail**: a ringing metal tail sound that fades after metal grinds.
- **Bail marks**: board clatter and short skid marks that fade.
- **Wake**: litter, leaves and paper swirl behind you at speed (extends the existing litter).

### Skate Paradise
1. **Smarter pigeons**: hop aside from slow rolls instead of always flying; flinch at grind screeches and nearby bails; 3D wing claps.
2. **Gulls on the lamp posts**: perch on lamp tops and rail ends, take off as you approach, circle and come back later.
3. **Fireflies and moths** around the string lights and lamps: drift lazily, scatter as you pass.
4. **Cans and cones**: a few scattered props that tumble with a clink when you roll right past.

### Orbit
1. **Glowing tiles**: grid tiles light up under your wheels and fade behind you; landings send a ripple ring across the floor.
2. **Hover bots**: small floating orbs that bob around the park and scoot out of your way.
3. **REC drone**: a little camera drone that shadows your line with a blinking red light, keeping clear of the camera.
4. **Motes part** around you at speed.
5. **Holograms flicker** when you ride close to them.

### Grand Warehouse
1. **Rafter pigeons**: perched on the roof trusses; flutter up on loud landings and bails, drop a few feathers, resettle.
2. **Swinging lamps**: hanging lamps near a hard landing or bail swing and creak; their light pools sway.
3. **Dust in the light shafts**: beams from the roof windows; dust swirls as you ride through.
4. **Cardboard boxes**: a few loose boxes that topple and slide when you pass close.
5. **Fence rattle**: chain-link and rails visibly shake and rattle on grinds and wallrides nearby.

### Creature animation
Procedural: wing flaps tied to flight speed, glide vs flap, hops, head tracking toward the rider, flinch poses blended with springs (no snaps).

## Left to the builder

Exact placement per park (from the existing map scan of walls, edges, lamps and floor), counts within budget, timings, colours matched to each park's palette, and dropping any item that cannot meet the budget (reported, not silently).

## Builder's calls (made during review; owner to check)

1. **Upgrade, never duplicate.** Where a touch overlaps something the game already has, the existing feature is enhanced in place: existing landing dust ring kept as is (dropped from this list), existing holograms gain the proximity flicker, the existing lamp grid gains swing on the nearest lamps, the existing pigeons gain the new behaviours. The REC drone is a single new close drone, separate from Orbit's far-off drone formation.
2. **Existing pigeons stay on every park** (shipped feature). In the Warehouse some of them roost up in the rafters instead of all walking the floor.
3. **Budget scope.** The 0.5 ms CPU + 0.5 ms GPU limit covers *all* new World Life work on one park together (foundation + everywhere items + that park's items), measured against the current build (which already includes pigeons, litter and drones).
4. **Anchors.** Use only what each park already has: MapDressing's string-light and flag poles, existing rail ends and ramp edges, the Warehouse lamp grid, roof structure and windows. No new scenery is added just to host a touch; if a park has no anchor for an item, that item is dropped for that park and reported.
5. **Replays.** The world does not react during highlight replays (unchanged from today).

## Verification

Per item: before/after frame time on the same scripted route (2 runs), shader lookups per frame, a 4 × 40 s resource check, map switch round-trip, Performance preset off-check, pause/Sound OFF silence check, fixed-view captures plus a short reaction sequence, `npm test` with no new failures, and code review.
