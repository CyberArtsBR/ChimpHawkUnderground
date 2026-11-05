# Flip School

Entry points: Tutorial on the title menu, the pause-menu shortcut, and Tutorial → Flip tricks. Tutorial opens Flip School first; Next: Controls opens the existing tutorial pages. Eight unique base flip lessons use the authoritative `TrickCatalog` definitions: Kickflip, Heelflip, Impossible, Pop Shove-It, Hardflip, Inward Heelflip, Varial Kickflip and Varial Heelflip. Upgrade names are shown as a next step; the videos demonstrate the base tricks.

Each lesson has one silent looping WebM, a poster, a controller/keyboard overlay driven by the video's media timestamp, four written steps, and a landing tip. Xbox, PlayStation and keyboard instructions all map to the existing game inputs. Slow motion is the initial playback speed. Pause, replay and normal speed use the same timestamp-based overlay, so there is no separate animation clock to drift.

The menu pauses an active session. Back returns to the originating menu or reference page. Free Practice opens the existing unlimited-session loadout. Keyboard and gamepad navigation use the shared menu focus implementation. Reduced-motion users start with a paused video and can play it explicitly. On a media error, written steps stay visible and Replay retries loading.

Only one video element/source is mounted. Leaving or changing lessons cancels frame callbacks, aborts listeners, pauses playback and releases the old source. A hidden page pauses the clip. No tutorial media is fetched during ordinary gameplay. All video/poster URLs honor Vite's base path for Portals.

Run `npm test`, `npm run build`, then `STREETSKATE_URL=http://127.0.0.1:5181/ node tools/quality-flip-school.mjs` against a preview. The browser check covers all video files, synchronized input cues, all instruction modes, speed, replay/looping, desktop layouts, keyboard/gamepad navigation, menu disposal, practice/resume, reduced motion and failed media. Evidence is written to `artifacts/flip-school/`.
