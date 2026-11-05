# Flip School demonstration media

These eight silent 960×540 WebM clips were rendered from StreetSkate's existing Adolescent rider, skateboard, and procedural presentation code. They are staged instructional animations, using the same flip definitions and deck/rider motion as the game. The training floor and camera are original code in `tools/flip-demo.js`; no third-party tutorial footage is included.

The shared timeline in `src/game/FlipLessons.js` controls both capture and the menu's input overlay. Each source clip is approximately 3.2 seconds at 30 FPS. The menu defaults to 0.5× playback, with normal speed available. JPEG posters cover loading, reduced-motion and playback failure states.

To regenerate, run the Vite development server at port 5180, then `node tools/record-flip-lessons.mjs`. Set `STREETSKATE_URL` to a different development server URL if needed. Recording requires Chrome/Chromium with WebM MediaRecorder support. Production only ships the media files and DOM video player, not the recording studio.
