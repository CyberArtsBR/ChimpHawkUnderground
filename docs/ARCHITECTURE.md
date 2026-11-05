# System architecture

Current architecture observed on 2026-11-03. This is a map of the existing game, not a proposed rewrite. [Profile](PROJECT_PROFILE.md) · [State](PROJECT_STATE.md).

```mermaid
flowchart TD
  Input[SkateInput: keyboard and gamepad] --> Semantic[InputInterpreter / CoreSkateController]
  Shell[GameShell / SessionFlow] -->|allow simulation; pause; new round| Runtime[game-main integration]
  Semantic --> Skate[StreetSkater and physics compatibility chain]
  World[ParkRegistry / collision BVH / rails / board probes] --> Skate
  Skate --> Results[Accepted score events / RunSummary / ScoreRecords]
  Skate --> Present[Procedural rider and board presentation]
  Skate --> Camera[FollowCamera / clearance]
  Skate --> Audio[SkateAudio / surface layers / reactions]
  Skate --> FX[SkateEffects / BailLiquid]
  Present --> Renderer[GraphicsPipeline: scene / bloom / shadows / CAS]
  FX --> Renderer
  Camera --> Renderer
  Runtime --> Renderer
  Results --> Shell
  Present --> Recorder[HighlightRecorder: bounded visual poses/events]
  Recorder --> Playback[HighlightPlayback: view only]
  Playback --> Renderer
  Settings[PlayerSettingsPanel / ControlBindings / localStorage] --> Input
  Settings --> Shell
  Settings --> Renderer
```

## Authority boundaries

- Simulation owns position, travel/stance, collision acceptance and trick scoring. Camera, shaders, lettering and IK must not rewrite physical root movement.
- `CoreSkateController` and pure result modules are the canonical decision seams. Existing class names provide migration compatibility; adding more override layers would increase risk. See the detailed [authority map](phase1-core-authority-map.md).
- `SessionFlow` owns ready/play/overtime/finish policy. Full `reset()` starts a new round; `resetRider()` respawns inside the same round, preserving accepted score/distance/stance and incrementing the contact serial. Practice-marker returns use the same transaction, then restore the marker's saved stance.
- `RunSummary` observes accepted settlements. Pose replay cannot award scores, advance physics or fabricate a live landing. Respawn serials separate contact segments.
- `ParkRegistry` validates spawn, collision, rails and boundaries before a world commit. It disposes replaced resources while retaining shared textures. Actor loads are cancellable/generation checked.
- `GraphicsPipeline` owns render state restoration and bloom masking. Static scenery local transforms are frozen; actors/bones remain dynamic. Rider identity invalidates actor masks immediately, without adding a per-frame whole-scene walk.
- `game-main` bridges runtime, menu and toolbar sound through one setter. `SkateAudio` remains the actual persisted enabled-state authority.
- Tutorial tables and video cues consume current validated bindings. Fixed menu navigation remains separate from remappable skating actions.
- Shader readiness includes one actual composed draw and the wheel materials' speed-dependent bloom variant while loadout is current. No game simulation runs for warmup. Resume consumes/discards the paused frame interval before the next ready/play update; shader work does not deduct playable time.
- GPU timer results carry a unique serial; held values are display state, not additional measurements. `cpuSubmitMs` brackets `GraphicsPipeline.render()` only.

## Remaining structural debt

`game-main.js` and `GameShell.js` still combine many responsibilities; the physics migration retains a long compatibility chain. Extract one tested responsibility at a time when a feature requires it. Avoid a broad framework/engine conversion or gameplay rewrite for presentation fixes. [Decisions](DECISIONS.md) · [Known issues](KNOWN_ISSUES.md).
