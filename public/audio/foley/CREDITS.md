# Skateboard and impact recordings

These audio recordings are CC0 1.0 and may be used, edited and redistributed commercially. Attribution is not required but is retained here to credit the authors and identify the source.

- `pop.wav` and `land.wav`: excerpts from **“skateboard ollie” by nolimitkid**, [Freesound 515229](https://freesound.org/people/nolimitkid/sounds/515229/), CC0. Trimmed/normalized versions obtained from the public [gk2-skateboard audio directory](https://github.com/scheissgeist/gk2-skateboard/tree/main/sfx).
- `roll.wav`: **“SkateRolling.wav” by Lanterr**, [Freesound 688733](https://freesound.org/people/Lanterr/sounds/688733/), CC0. Looped/crossfaded version obtained from the same public audio directory.
- `bail.ogg`: **“BODY FALL - V HVY - DIRT” by leonelmail**, [Freesound 504626](https://freesound.org/people/leonelmail/sounds/504626/), CC0. A processed excerpt obtained from the public [counter-strike-in-browser audio directory](https://github.com/StarKnightt/counter-strike-in-browser/tree/main/public/audio). The recording is a fall on dirt; it is used as a general body-impact layer.

These are recordings, not newly generated AI audio. Downloaded files ship locally; the game does not stream audio from the source websites.


## 2026-11-02 added recording banks

All additions below are real recordings or authored game sounds, not newly generated AI sound. Original approved pop/land/roll/bail bytes are retained. Exact upstream paths, download URLs and SHA-256 hashes are in `SOURCE_MANIFEST.json`.

- `voice-pain-1..3.mp3`, `voice-effort-1.mp3`: **Hurt Sound Effects** by **EZduzziteh**, [creator submission](https://opengameart.org/content/hurt-sound-effects), [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/). Source files hurt_01_0, hurt_03, hurt_04 and hurt_02 respectively. The fourth quiet hurt take is repurposed as a loss-of-control grunt; this is one shared voice bank, not three newly recorded character identities.
- `crowd-claps.ogg`: **Well Done** by **qubodup**, [creator submission](https://opengameart.org/content/well-done), CC0 1.0. Author's own hackathon clapping recording, mixed. The creator explicitly changed it to CC0 on 2024-10-05; the original filename still contains CCBY3.
- `pop-alt-*`, `catch-*`, `landing-concrete-*`, `landing-metal-*`, `bail-alt-*`: **Kenney Impact Sounds**, [official CC0 asset page](https://kenney.nl/assets/impact-sounds). Wood light/medium, generic light, metal light and soft heavy takes used as support layers. These are material foley, not additional skateboard field sessions. Original paths retained in the manifest.
- `cloth-*`: **Kenney RPG Audio**, [official asset page](https://kenney.nl/assets/rpg-audio), CC0 1.0.
- `cue-*`: **Kenney Interface Sounds**, [official CC0 asset page](https://kenney.nl/assets/interface-sounds). Exact click/confirmation/select/back sources in manifest; runtime envelopes keep them short.
- Kenney downloads returned HTML in this environment. Those files were not shipped. Unmodified OGG files were acquired from the public [GeorgeQLe combat mirror](https://github.com/GeorgeQLe/assets-sfx-combat) and [UI mirror](https://github.com/GeorgeQLe/assets-sfx-ui), which preserve the pack source and CC0 licenses. Creator's asset pages independently verify CC0.
- `scrape-concrete-1..2.ogg`: **Scrapes** by **AntumDeluge**, [creator submission](https://opengameart.org/content/scrapes), CC0 1.0. Dragging an object across a cinder block, edited in Audacity by its author. It is a concrete support texture, not mislabeled as a steel rail recording.

No physical headphone/speaker listening session was performed by the agent. See `docs/audio-quality-pass-2026-11-02.md` and the browser preview for the remaining audition checks.

- `scrape-metal.mp3`: **Metal Scraping.wav** by **Doctor_Jekyll**, [Freesound 254064](https://freesound.org/people/Doctor_Jekyll/sounds/254064/), [Creative Commons Attribution 4.0](https://creativecommons.org/licenses/by/4.0/). Metal tin box sliding on a metal railing, 3.217 seconds. Original public HQ MP3 preview redistributed with attribution; mixed to mono, crossfaded and filtered/rate-modulated at runtime to support the steel grind layer. This CC BY asset is an exception to the CC0 additions above.


## Real skateboard and quiet ambience refinement — 2026-11-02

After owner feedback, generic wood pop/catch takes, soft-body substitute takes and the tin-box/cinder-block scraping substitutes were retired from active banks. Approved `pop.wav`, `land.wav`, `roll.wav` and `bail.ogg` remain unchanged. The explicitly rejected cheer remains absent. Historical file credits above are retained for provenance.

- `pop-skate-1/2.wav`, `land-skate-1/2.wav`, `catch-skate-1/2.wav`: excerpts from **skateboard kickflip** ([Freesound515230](https://freesound.org/people/nolimitkid/sounds/515230/)) and **skateboard360flip** ([Freesound515225](https://freesound.org/people/nolimitkid/sounds/515225/)) by **nolimitkid**, the same creator as the approved ollie. [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/). Real skateboard takes; trimmed to separate pop, short mid-trick board contact, and wheel landing. Mono44.1kHz WAV, restrained peak matching and short tail fades. Exact excerpt times and gains in `SOURCE_MANIFEST.json` and `artifacts/audio-quality-pass/real-recording-edits.json`.
- `scrape-skate-metal.mp3`: **Skateboard Metal Grinding.1** by **rokenjocu / Sound of Leeds Sound Library** (Roland Palmer, John Kennedy, Johan Paez, Curran Brown, Kurt Martinez), [Freesound262079](https://freesound.org/people/rokenjocu/sounds/262079/), CC0 1.0. Public HQ MP3, runtime mono loop crossfade and speed filtering.
- `scrape-skate-concrete.mp3`: **skateboard grinding on concreate slab** by **21100495**, [Freesound655372](https://freesound.org/people/21100495/sounds/655372/), CC0 1.0. Public HQ MP3, runtime mono loop crossfade and speed filtering.
- `ambience-warehouse.wav`: quiet12-second excerpt from **Old Air Conditioner Loop** by **loganzsound**, [Freesound873136](https://freesound.org/people/loganzsound/sounds/873136/), CC0 1.0. Recorded using Audio-Technica ATR6550x and Zoom H1n, edited by its author in Reaper. Converted to mono22.05kHz, gently faded; low-level warehouse ventilation and a lower-pitched/filter version for sparse ORBIT ambience.
- `ambience-paradise.wav`: quiet16-second excerpt from **Soft Wind** by **florianreichelt**, [Freesound459977](https://freesound.org/people/florianreichelt/sounds/459977/), CC0 1.0. Converted to mono22.05kHz, gently faded and looped under outdoor skate sound.

These new sounds still require owner audition. Browser decode, waveform and scheduling checks do not certify subjective sound quality or replace headphone/speaker review.

## Runtime continuity refinement — 2026-11-03

Original audio bytes and source hashes remain unchanged. The metal skate loop uses the sustained 2.35–3.80-second pass; the concrete skate loop uses 19.70–21.75 seconds. Both receive an 80ms mono overlap crossfade in memory, excluding the full field takes' separate mounting contacts and quiet gaps. Voice pain playback uses bounded gain correction without pitch changes; the quiet take receives at most +2.6dB. See `docs/evolution-cycle2-audio.md` for measurements and local before/after audition files. No new recordings, generated sounds or replacement source identities were added.

## 2026-11 audio pass (synthesized in-house)

These were generated for Chimp Hawk with the Web Audio API (offline render), not recorded or downloaded:
`landing-wood-1/2.wav`, `landing-rubber-1.wav`, `roll-wood.wav`, `grind-clack-1/2.wav`, `ambience-orbit.wav`,
`crowd-cheer-small/medium/big.wav`, `crowd-groan.wav`.
`voice-effort-2/3/4.wav` are pitched and EQ'd variants of the existing `voice-effort-1.mp3` take (same license as that file).
