# Presentation upgrade checkpoint

30 October 2026. Local work only; no publish or merge.

Implemented and initial 39 targeted tests pass (`artifacts/presentation-upgrade-tests.log`):
- Rear-foot visual pivot for Impossible shared by board and rider; no collision or fixed-step change.
- Bounded nose/tail grind body weighting and stance-aware grab goals.
- Heavy bail sound follows the exact ragdoll `groundImpact` object consumed by the liquid; loss-of-control is a separate softer sound.
- Explicit concrete/wood/metal/rubber sound profiles with neutral fallback (runtime tagging owned by lead).
- Independent announcer/session cues, background-audio preference, music ducking that follows current volume.
- Liquid preference, bounded eight-probe local curvature fit, pooled splash, idempotent disposal.

Integration APIs: `SkateAudio.setAnnouncerVolume`, `setBackgroundAudio`, `cue(kind)`; `MusicPlayer.setBackgroundAudio`, `duck(ms,amount)`; `SkateEffects.setLiquidEnabled`.

Outstanding: complete all-five-rider/both-stance/front-side-rear contact sheets and inspect them, add volume/background regression tests, validate audio render output (no claim of physical listening), check first-use effect and contact in browser. GPU capture follows interface lesson recording.

Motion reference: [Nollie Skateboarding — Backfoot Impossible](https://nollieskateboarding.com/en/news/15884), describing rear-foot wrapping and pressure. Existing landing/rig constraints remain the geometric reference. This is procedural stylization, not motion capture.
