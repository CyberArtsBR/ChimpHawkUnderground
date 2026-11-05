# Recorded reactions with the soundtrack

The remaining mix issue was the handoff between reaction recordings and music. The existing overlap-priority/attack smoothing in `MusicPlayer` already worked. `SkateAudio.update` runs once per animation frame; there was no per-physics-step overwrite to fix.

The caller used one 650ms music hold for every severe contact and a 900ms hold for exceptional applause. The actual three pain recordings last only 176–264ms. Applause lasts 4.009s, with its final 700ms already fading. Those fixed holds kept music down after short voices and restored it during the body of applause.

## Runtime change

- A successful eligible recording emits `onMusicDuck({durationMs, amount, releaseMs})`. The hold follows that selected buffer's actual playback duration, less its existing release envelope. Failed, muted, ordinary and missing reactions emit no request. Existing severe-contact eligibility (speed at least 7), crowd bands, accepted-event IDs, cooldowns and empty-ORBIT suppression stay intact.
- The three pain takes now produce 184ms, 96ms and 145ms holds at amount .7, followed by an 80ms exponential release time constant. Exceptional applause produces a 3310ms hold at amount .65, followed by a 200ms release time constant. The applause fade begins with its existing recorded decay; music is near its original level by the end of the take.
- Each music request owns its release envelope. Overlapping cues retain the deepest active attenuation. The existing two-argument countdown/session API remains valid with a 120ms default release. Holds are bounded at 4500ms; release time constants at 40–500ms.
- `MusicPlayer.duck` returns a cancellation function. `SkateAudio.silence`, background muting, disposal, and muting an individual reaction channel release the corresponding holds. They preserve independent session/countdown requests. Changing music volume or muting music still applies to the current attenuation and survives recovery.
- The game wires the callback once and removes both caller-side fixed reaction timers. Boolean return values remain compatible with existing consumers/tests.

No recording, pitch, source gain correction, crowd/voice/default volume, musical arrangement or source attribution was changed. The rejected cheer remains absent. Existing board fallback synthesis was not replaced or expanded. The new Hollow rider uses the same existing shared recorded voice bank; this work does not add a new voice identity or a crowd session.

## Measured comparison with real music

`tools/audit-audio-mix.mjs` imports the baseline (`66fcd65`) and current runtime `SkateAudio` and `MusicPlayer` implementations into a text-only page. It schedules their actual playback/envelopes with `OfflineAudioContext`, at stereo 24kHz. The SFX buses and compressor match `SkateAudio.unlock`; music goes directly to output at its default .5 level. Voice, crowd and effects use their shipping .45, .3 and .35 settings plus the .85 base gain.

The audit decodes every existing soundtrack, selects its densest complete six-second block, and renders pain and applause before/after. Pain scenes also include existing loss/body-contact and cloth foley. The three source takes are forced into consecutive diagnostic contacts to compare them; the live three-second pain cooldown remains unchanged. A separate before/after applause case stops the reaction at 1.5s to exercise cancellation. In total there are 30 stereo mixes across all seven soundtrack files.

| Measurement | Before | After |
| --- | ---: | ---: |
| Music multiplier 300ms after first pain onset | .7000 | .9182 |
| Music multiplier 900ms after first pain onset | .9645 | 1.0000 |
| Music multiplier 1.5s after applause onset | .9975 | .6500 |
| Music multiplier 3s after applause onset | 1.0000 | .6500 |
| Music multiplier 4s after applause onset | 1.0000 | .9889 |
| Music multiplier 500ms after stopping applause | .9975 | 1.0000 |

Across all 30 default-level mixed renders, the maximum absolute output sample was .646552 (about -3.79dBFS). There were zero clipped samples, zero nonfinite samples and zero running duck timers after each six-second scene. These are bounded representative passage checks; they do not prove headroom for every possible event overlap or user-selected volume.

## Evidence and reproduction

- `artifacts/finish-mix-v3/audio/index.html`: six stereo A/B WAVs using the same authored Chimpion Drip passage (90–96s), event times and source takes. Native audio controls allow owner audition.
- `artifacts/finish-mix-v3/audio/report.json`: every mix's peak/RMS/clipping count, 20ms music-envelope samples, exact requested holds, chosen music offsets, source durations, audio SHA256 hashes and before/after runtime hashes.
- `artifacts/finish-mix-v3/audio/tests.log`: 32 focused checks covering existing audio behavior, source-derived requests, overlap/release, independent muting, cancellation and timer disposal.

```powershell
node --test tests/audio-polish.test.mjs tests/agent08-audio.test.mjs tests/audio-reactions.test.mjs
node tools/audit-audio-mix.mjs
```

The audit uses the repository's installed Chrome/Playwright helper and a temporary localhost server. It closes both after rendering. It requires localhost access but does not use external network access, launch the game, create WebGL, download/generate media, or use audio hardware. `AUDIO_BASELINE_REF` optionally selects another baseline revision.

No human headphone/speaker listening or subjective quality signoff is claimed. Continuous wheel/grind beds, location ambience and Warehouse reflections are omitted from these reaction-focused A/B scenes. Existing source provenance remains in `public/audio/foley/CREDITS.md`. More actors or independent crowd recordings would be a separate content change.
