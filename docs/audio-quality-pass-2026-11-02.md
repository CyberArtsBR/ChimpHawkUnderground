# Audio quality pass — 2026-11-02

Approved original skate recordings remain unchanged. New human voice and crowd recordings are credited in `public/audio/foley/CREDITS.md`, with upstream URLs and hashes in `SOURCE_MANIFEST.json`. No paid sound generation was used.

## Behavior and integration

- `SkateAudio.onComboSettled({id,points,personalBest,location})` consumes only an accepted bank event. IDs are consumed while muted too; suppressed events are never queued. Returns true only when an exceptional crowd sample actually played, for music ducking. Ordinary ollies are silent. ORBIT has no crowd.
- Provisional bands: 400 / 1200 / 3000 points; 10-second global crowd cooldown. The catalog's base flips are 100–325, advanced flips 250–675, with combo multiplication. These are conservative economy-based starting values, not empirical run percentiles. Tune against recorded score distributions after auditions.
- Crowd intensity uses short subdued claps, medium and exceptional applause with different mix levels. One shared real voice identity currently supplies three contact pain takes and one quieter loss-of-control grunt. Pain requires contact speed >=3 and a 3-second cooldown. Strong contact >=7 returns true from `update(player,active)` only when audible, for ducking; loss grunt has a separate 7-second cooldown.
- Existing `setLocation(world.id)` selects quiet real air-conditioner room tone for Warehouse, soft outdoor wind for Paradise, and a restrained low-pass/lower-pitch ventilation bed for ORBIT. Ambience follows effects volume and active gameplay/background gating. Warehouse retains the quiet52ms reflection; critical rider events remain centered and dry. No new integration hook is needed.
- Settings independently persist music, effects, session cues, crowd and character voice. `setCrowdVolume` / `setVoiceVolume` apply changes to the relevant bus.
- Pop/landing/catch now use additional real skateboard takes by nolimitkid, the same creator as the approved ollie; the original approved pop/landing/bail/roll remain unchanged. Generic wood pop/catch and soft-body replacement takes were retired from active banks. Two mid-trick board-contact excerpts replace the artificial wood catch. New landing peaks are limited to .70 and pop peaks to .65; no blanket loudness boost was applied. Existing generic metal/concrete support layers are quieter (.08/.045 times impact power).
- Actual skateboard-on-metal and skateboard-on-concrete recordings now replace the tin-box/cinder-block substitutes. They blend with the synthesized fallback by material and speed; field loops are mono with a40ms crossfade. No universal reverb is added.
- Music duck uses a 25ms attack / 120ms release time constant, retains the strongest overlapping live request and restores the latest user volume. Muted music stays muted.

## Audition list

Serve the local dev URL and open `/tools/audio-preview.html`. It lists every bank and source control. Suggested order:

1. Approved `pop.wav`, `land.wav`, `bail.ogg`, `roll.wav`.
2. `pop-skate-1/2.wav`, `catch-skate-1/2.wav`, `land-skate-1/2.wav`, quiet concrete/metal support layers, `cloth-1/2.ogg`.
3. `voice-pain-1/2/3.mp3`, `voice-effort-1.mp3`.
4. `crowd-claps.ogg`. The rejected cheer recording was removed following owner listening feedback.
5. `cue-confirm/back/ready/go/roundOver/tenSeconds/finalFive.ogg`.
6. `scrape-skate-metal.mp3`, `scrape-skate-concrete.mp3`, `ambience-warehouse.wav`, `ambience-paradise.wav`.

## Validation and limits

Unit checks cover accepted-ID deduplication, bands/cooldown/ORBIT, independent voice cooldowns, nonrepeat selection, missing-asset independence, independent persisted volume, crossfade continuity and deterministic music-duck attack/overlap/release/mute. `tools/verify-audio-banks.mjs` checks browser decoding and a worst simultaneous pop/catch/landing/voice/cheer/start-cue mix; report is `artifacts/audio-quality-pass/report.json`.

No human headphone or speaker listening was performed. Audition quiet/fast roll, material transitions, small/large fall, soft landing, major line, muted music, each channel mute, pause, tab switch and replay before audio signoff. This pass adds one shared voice bank, not bespoke voices for every rider. Bespoke per-character voices and additional surface-specific wheel/impact sessions remain content work. ORBIT uses a filtered version of the Warehouse ventilation recording rather than pretending to be an outdoor crowd scene.

Owner feedback: sounds need further work; removed the identified crowd cheer from every runtime bank and the audition page. Remaining audio is not marked owner-approved.

Further owner feedback refinement: active banks now prioritize real skateboard takes and skate-specific grinding instead of generic wood/soft impacts or tin/cinder proxies. Soft real ventilation and wind fill the map ambience gap without voices. Source audition was regenerated; these additions are candidates pending owner listening, not claimed owner-approved.
