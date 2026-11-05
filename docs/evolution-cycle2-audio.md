# Local audio continuity pass — 2026-11-03

This pass refines playback of the existing credited recordings. The approved original pop, landing, roll and bail files keep their exact bytes. No new recording, download, generation, dependency or paid service was used. The rejected `crowd-cheer.ogg` remains absent. Audio still needs owner listening approval.

## Behavior changes

- Body contact starts pain on the contact frame. A loss-of-control grunt already in flight fades over 25ms; pain is never delayed behind it. When loss and physical contact arrive together, only pain starts. The independent contact/effort cooldowns remain intact.
- Contact pain takes use a cached gain correction measured during decode: target RMS .07, peak ceiling .45, positive gain capped at 1.35 (+2.6dB). Most correction attenuates the loud take. Timbre, pitch, recording bytes, and the intentionally quieter effort take remain unchanged.
- Applause gets a 35ms onset and longer releases: 280ms subdued, 450ms medium, 700ms exceptional. Exceptional applause can finish its 4.009-second recorded decay; the previous 2.7-second cutoff omitted later claps. Score thresholds, accepted-ID deduplication and the ten-second crowd cooldown remain unchanged. ORBIT also suppresses applause when an event omits its location.
- Recorded session/menu cues now receive the same 70ms duplicate guard as their fallback. Repeated cue callbacks in one physics tick produce one sound.
- One-shot envelopes and stop times account for playback rate. A take played at .98 speed gets its full source-time tail instead of being cut at the original buffer duration.
- Location ambience crossfades independent outgoing/incoming sources over 350ms. Previously the old source stopped immediately despite a scheduled fade on its shared gain. The same-location recording is reused; outgoing sources are cleaned up after the fade and during disposal.
- Real skateboard scrape loops now use sustained sections of the credited field recordings. The previous full recordings included separate contacts and long quiet intervals inside an ongoing grind. Source files remain unchanged; trimming/downmixing/crossfading happens in memory.

## Measurements

The audit decodes at 24kHz and measures mono signal. Numbers describe signal and scheduling, not perceived loudness or listening quality.

| Contact recording | Source RMS | Source peak |
| --- | ---: | ---: |
| `voice-pain-1.mp3` | .15427 | .94672 |
| `voice-pain-2.mp3` | .09255 | .39213 |
| `voice-pain-3.mp3` | .03393 | .15242 |

At identical runtime event strength and the default voice bus, the three rendered pain takes' peak span falls from 15.86dB to 6.39dB. RMS measured over equal 600ms event windows falls from a 14.25dB span to 4.78dB. The quiet take gains at most +2.6dB; silence/noise below RMS .01 is not lifted. The bail-to-contact audition keeps the same pain recording and contact time before/after.

The applause file's last sample above -40dBFS occurs at 3.484 seconds. Keeping its full recorded tail prevents the old exceptional cutoff at 2.7 seconds. Rendered applause peak at the default crowd bus stays .0830 before/after; this is a tail/envelope change rather than a blanket volume boost.

| Skate loop | Source window | Window length | Overlap | Resulting loop |
| --- | --- | ---: | ---: | ---: |
| Metal | 2.35–3.80s | 1.45s | 80ms | 1.37s |
| Concrete | 19.70–21.75s | 2.05s | 80ms | 1.97s |

These are the longest contiguous measured runs of 50ms blocks with RMS at least .005, excluding the separated impact peaks. The full concrete take contains multi-second intervals near RMS .001 and isolated mounting/contact transients around .50, 3.35 and 6.35 seconds. The selected windows retain the sustained skate sound without those unrelated events. The report records each final loop's RMS, peak, minimum block RMS and endpoint step. No additional loop gain or pitch change was added.

## Evidence and reproduction

- `artifacts/evolution-cycle2/audio/index.html`: native audio controls comparing before/after pain levels, loss-to-contact handoff, crowd bands, and raw full-take scrape loops against sustained windows. All audition audio stays in artifacts, outside shipping assets.
- `artifacts/evolution-cycle2/audio/report.json`: decoded waveform measurements, exact source hashes, baseline/current runtime hashes and rendered event metrics. The baseline is revision `77fbf6d`.
- `artifacts/evolution-cycle2/audio/tests.log`: focused event/mix regression results.

Run the focused checks:

```powershell
node --test tests/audio-polish.test.mjs tests/audio-reactions.test.mjs tests/agent08-audio.test.mjs tests/surface-audio-propagation.test.mjs tests/presentation-upgrade.test.mjs
```

Regenerate the A/B files:

```powershell
node tools/audit-audio-polish.mjs
```

The audit uses the repository's existing Playwright/Chrome helper, a temporary text-only localhost page and `OfflineAudioContext`. It never starts the game or creates WebGL. `AUDIO_BASELINE_REF` can select another revision; `AUDIO_MEASURE_ONLY=1` skips audition renders. The script records and checks finite unclipped output, then closes its browser/server.

Unit checks cover recorded cue deduplication, source-rate tail scheduling, immediate same-frame contact pain, effort-to-pain priority without stolen contact cooldowns, gain bounds, full applause release, local ORBIT suppression, independent ambience source fades/cleanup, and excluding unrelated contacts/gaps from scrape loops. Existing mute/background/resume/deduplication checks remain in the focused run.

## Remaining listening decisions

No physical headphone/speaker listening was performed. A/B previews isolate reactions and scrape continuity; they do not include music or certify the complete in-game mix. Scrape previews deliberately use matching gain and normal speed without material filters so the source-window change is audible. In-game filters/rate modulation still follow speed/material.

The bank still has one shared voice identity and one applause recording. Reusing sections and shaping envelopes does not create additional people or new takes. Owner audition should judge the quieter pain balance, longer exceptional applause and repeat character of the sustained loops. Bespoke voices and more crowd/skate sessions remain content decisions.
