# Agent 09 — World Architecture & Multi-Location Integration

**Baseline main:** `ff33677541f61b803901ac37c2465226799ec8a3`
**Isolated branch:** `audit-fix/09-world-architecture`
**Integration owner:** final lead assistant only (`src/game-main.js` is intentionally untouched).
**Status:** registry and lifecycle ready for integration; runtime map switching is **not yet wired**.
**THE FOUNDRY:** deliberately unavailable. No fake warehouse or Rooftop geometry alias.

## Audit of current main

1. **World-specific bootstrap** — `src/game-main.js:282-339` selects `?park=legacy`, manually loads four legacy assets or constructs Solar Dock, modifies global lighting/floor, then builds `StreetSkater`. The renderer, collision, rails, UI and world selection share one startup path.
2. **Only one active skater binding** — `new StreetSkater({ collision, spawn, rails, playableRegions }).load()` receives world-specific inputs in its constructor. No safe hot-rebind currently exists. Until the physics team exposes one, stage a *new* skater before swapping the old skater out.
3. **Stale navigation and camera state** — `Object.assign(views, manifest.views)` retains keys from the previous location; `#spot-nav` appends buttons without removing earlier spots. Use clean replacement per location, and reset all view keys to defaults.
4. **Stale scene/QA references** — `window.streetSkate` captures `park`, `collision`, `manifest`, `skater` as properties only once. Update those properties on each successful swap; keep stable callbacks.
5. **World asset ownership unclear** — Rooftop's `SurfaceMaterials.js` uses globally cached photographic textures; disposing these on map exit breaks later Rooftop re-entry. GLTF-loaded legacy meshes, however, should own their own GPU resources. The default factories distinguish both categories.
6. **Legacy expansion mutation** — `assembleExpandedPark()` mutates the loaded manifest/rail list, geometry and collision arrangement. It must happen **before** validating/freezing a fresh per-load manifest; never reuse a previously mutated manifest.
7. **Lighting ownership is shared** — `scene`, renderer, `sun`, ambient, PMREM fallback, audio and input must belong to the application, not a park. Solar HDRI background and PMREM output should have a world-scoped owner if live world changes are enabled.
8. **No transactional failure recovery** — Current `showError()` is startup-only; after the player is already playing, a failed next map must leave the old scene, collision, menus and camera functional.

## Files delivered

- `src/park/ParkRegistry.js` — stable IDs, selectable metadata, available/unavailable checks, validated and isolated manifests, lazy Rooftop and legacy loaders
- `src/park/WorldLifecycle.js` — staged asynchronous switch, generation cancellation, activation/restore boundary, scoped resources/listeners, idempotent cleanup
- `src/game/LoadoutCatalog.js` — selection metadata references the park definitions; existing Rooftop remains the sole selectable playable location
- `tests/agent09-registry.test.mjs` — registry, manifest, rooftop/legacy compatibility contracts
- `tests/agent09-lifecycle.test.mjs` — repeat/reload, unavailable IDs, load/prepare/activate failures, cancellation, teardown, texture ownership

## Existing asset factories

```js
import { createDefaultParkRegistry } from './park/ParkRegistry.js';
const registry = createDefaultParkRegistry();
registry.requirePlayable('rooftop'); // valid
registry.requirePlayable('legacy');  // valid, non-selectable legacy route
registry.requirePlayable('foundry'); // throws: not playable yet
```

Rooftop loads `createSolarDockPark()`, then `surfaceTexturesReady()`; partial loading roots are scope-tracked before waiting for the textures. **Never dispose Rooftop's shared cached photo textures.** Geometry and materials are world-owned. Legacy loads the current three GLB assets + JSON manifest, composes via `assembleExpandedPark()`, and owns its asset textures. Late-completing GLBs are scope-tracked and disposed even after a rejected/cancelled load. If desired, a future loader may inject `resourceOwnership: { textures: 'owned' }` into its result.

`validateParkManifest` produces a new, frozen manifest snapshot, checking spawn, rails, regions, spots, transitionScale and views; fresh collision and rail systems must use *that* returned snapshot, not mutable factory source metadata.

## Precise integration contract for final lead

Do not cherry-pick shared physics/camera/UI edits into this branch. In the **integration branch only**, edit `src/game-main.js` as follows.

### 1. Construct registry and lifecycle once

```js
import { createDefaultParkRegistry } from './park/ParkRegistry.js';
import { WorldLifecycle } from './park/WorldLifecycle.js';

const parkRegistry = createDefaultParkRegistry();
const worldLifecycle = new WorldLifecycle({
  registry: parkRegistry,

  prepare: async ({ id, world, scope, signal }) => {
    // All work here is STAGED; do not modify scene, global skater or HUD yet.
    // Current physics has no safe rebind API: create a separate skater.
    const candidate = await new StreetSkater({
      collision: world.collision,
      spawn: world.manifest.spawn,
      rails: world.manifest.rails,
      playableRegions: world.manifest.playableRegions,
    }).load();
    scope.trackRoot(candidate.root, { disposeTextures: true });
    if (signal.aborted) throw new Error('Location changed during preparation.');
    return { skater: candidate };
  },

  activate: ({ next, previous }) => {
    // Synchronous, no await. Keep all other global services alive.
    // Determine next park-specific lighting/view/spawn/sky plan before commit.
    // Attach new first, atomically replace bindings, then detach old.
    scene.add(next.world.park);
    scene.add(next.prepared.skater.root);
    park = next.world.park;
    collision = next.world.collision;
    manifest = next.world.manifest;
    skater = next.prepared.skater;
    if (previous) {
      scene.remove(previous.world.park, previous.prepared.skater.root);
    }
    // See steps 3 and 4 before this can be production-ready.
  },

  restore: ({ previous, failed }) => {
    // Called if activate throws, including after partial attachment.
    if (failed) {
      scene.remove(failed.world.park, failed.prepared?.skater?.root);
    }
    if (previous) {
      scene.add(previous.world.park, previous.prepared.skater.root);
      park = previous.world.park;
      collision = previous.world.collision;
      manifest = previous.world.manifest;
      skater = previous.prepared.skater;
    }
    // Restore active camera, environment, lighting and HUD references too.
  },

  deactivate: ({ previous }) => {
    scene.remove(previous.world.park, previous.prepared.skater.root);
  },
  onCleanupError: errors => console.warn('Park cleanup:', errors),
});
```

The snippet is an **integration skeleton**, not a finished drop-in game-main replacement: side effects (global sky, views, spot buttons, camera, debug helpers and UI) must be handled in the same commit. The `activate` callback MUST remain synchronous. A staged world remains isolated until prepare completes. If `activate` throws, `restore` must restore any partially changed global references. The old world is not freed until activation succeeds.

### 2. Replace the existing world allocation path

Replace only the map-loading branch around `loadGame():282-303` and the skater construction around `336-338` with **one** `await worldLifecycle.switchTo(legacyPark ? 'legacy' : 'rooftop')`. Pass a progress reporter into callbacks if desired; do not duplicate the renderer, `GameShell`, `SkateAudio`, `FollowCamera` or `SkateInput`.

Maintain current startup behavior: Rooftop default, `?park=legacy` still works, player starts paused, initial cam follow, current model and board. Surface textures may take time to load; use the existing loading HUD. Update any HUD bindings only after the transaction commits.

### 3. Rebind every dependent system

For each committed world, rebind in this order: `park/collision` → staged physics skater and rail network (the skater constructor creates world-specific collision/rail data) → `spawn`, `spots`, `playableRegions`, `transitionScale` → camera defaults and `views` → environment/lighting/HDRI → world UI/QA hooks. Avoid stale references to old `RailNetwork`, `ParkCollision`, `transitionDebug`, respawn state or input state. Only after a successful commit, invoke `setMode('skate')`, clear pending input, and `followCamera.snap(skater)`. Preserve selected character and deck by applying chosen options to the *staged* skater before activation; do not download a rider a second time after the park is live.

Remove old debug/transition scene objects and dispose them through the scope; rebuild any debug visualization against the new skater's transition controller. Release prior `skater.root` GPU buffers as a scoped resource; do not dispose globally shared renderer/audio/UI objects.

### 4. Reset rather than append map-specific presentation

- Capture immutable default `views` at bootstrap, then replace all location views on commit. No `Object.assign` against the previous park's view dictionary.
- Run `spotNav.replaceChildren()` before creating the chosen world's spot buttons; each new button must target current spot IDs. Remove outdated event handlers and data references.
- Snapshot/restore `scene.background`, fog, environment, `renderer.toneMappingExposure`, `sun`, `ambient`, `floor` and `sun.target` in the activation transaction.
- For rooftop, `loadSolarSky(renderer)` currently returns `{ background, environment }`. Treat them as *per-world* resources and register `scope.trackCleanup(() => { background.dispose(); environment.dispose(); })`; ensure alternate worlds restore a retained fallback environment.
- Update `window.streetSkate.park/collision/manifest/skater` and transition-debug references. Never leave old QA objects pointing to disposed skaters.
- Ensure player input is paused while a candidate is committed. On load failure keep current gameplay active (or return to the previous pause state), and show a nonfatal retry notification.

### 5. Loading and race handling

```js
try {
  const next = await worldLifecycle.switchTo(selectedId);
  // All gameplay-facing global references now point at next.
} catch (error) {
  if (error.name !== 'WorldLoadCancelledError') {
    // Show toast/error; keep previous world + menus intact and allow retry.
  }
}
```

`switchTo(id, { reload: true })` intentionally reloads even if already active. Normal repeated selection returns the same active world without allocating another skater. A new request aborts the pending request, and its stale result is disposed. The caller must *never* use a pending candidate before completion. `worldLifecycle.dispose()` is for final application teardown, not a normal park transition.

## Warehouse team contract

THE FOUNDRY must ship its own real environment and collision mesh. When ready:

1. Add `src/park/FoundryPark.js` with a factory returning `{ park, collision, manifest }` (plus optional `resourceOwnership`, environment settings and cleanup registrations).
2. Give THE FOUNDRY physically authored rideable floors/wood bowls, quarter-pipes, half-pipes and curved grindable rail polylines. Visual and collision roots must match scale and orientation.
3. Manifest requires `spawn: [x,y,z]`, `transitionScale`, `rails: [{name,points,radius?}]`, `playableRegions: [{minX,maxX,minZ,maxZ}]`; recommended `spots`, `views`, `visualTriangles`, `dimensions`, optional `worldBounds`. All coordinates are metres, Y up.
4. Register a **distinct lazy Foundry loader** and only then change its entry `available` to `true`. Do not alias `createSolarDockPark` and do not reuse its visual root.
5. Run separate bowl-to-rail, spawn-validity, camera-clearance, collision and repeated switch stress scenarios before displaying FOUNDRY as available.

## Known constraints / pending integrator work

- The current live `game-main.js` is unchanged, so the new lifecycle is **ready to wire, not active in production**.
- Shared PhotoTexture caching in `SurfaceMaterials.js` currently has no reference counting. Rooftop uses `disposeTextures:false` to preserve correctness; photo textures remain cached intentionally. Agent 07 owns that file if future cache eviction/refcounting is desired.
- `ParkCollision` installs `boundsTree` on geometry; the scope attempts `disposeBoundsTree()`, clears its reference and disposes geometry. Avoid giving collision geometry to two simultaneously live maps.
- Async GLTF requests that cannot abort transport may finish after switching, but the scope disposes their results. External event listeners registered outside the scope cannot be automatically discovered.
- Do not dispose shared PMREM fallback, global scene, camera, music, renderer, UI shell, ambient or sun when switching maps.
- Existing pre-Agent-09 core physics failures are not caused by these modules; isolate them from new regression tests.

## Verification

The new pure-Node tests can be run without a browser:

```sh
node --test tests/agent09-*.test.mjs
```

Full repository gates after integration: `npm test`, `npm run verify:physics`, `npm run build`, then Chrome/Playwright manual soak for Rooftop → legacy → Rooftop → Foundry once Foundry exists. Verify stable drawcalls/texture counts and no old rails/spot buttons during 20+ consecutive switches.

### CI result — 2026-10-09

[Phase 1 Core CI, Agent 09 branch](https://github.com/CyberArtsBR/StreetSkate/actions/runs/37919157561) executed the complete Node test suite on GitHub Actions after the 25-switch stress test was added:

- **363 tests executed; 361 passed; 2 failed.**
- All **18 Agent 09 registry/lifecycle tests passed**, including cancellation, failure rollback, double-dispose protection and 25 location changes.
- Existing unrelated failures remain in `tests/grind-manual.test.mjs` ("low-speed capture does not create large fake speed") and `tests/ground-motor.test.mjs` ("ground steering owns the complete park carve curve"). Both belong to Agents 03/01, respectively.
- The global workflow stops after `npm test` fails and therefore **did not run** the later physics verification or Vite build steps. No successful production build is claimed for this branch.
