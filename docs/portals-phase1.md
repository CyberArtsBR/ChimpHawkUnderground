# Chimp Hawk Underground: Portals Phase 1

Only the branch **fix/portals-bundled-fonts** receives this feature pending owner approval; main stays unchanged.

Portals injects the managed SDK at **./_portals/sdk.js**. Never bundle an unofficial copy. Non-Portals hosts do not expose its global object; the gateway detects this and the game stays playable.

Build: `npm ci --no-audit --no-fund`, then `npm run build -- --base=./`; output `dist`.

Features: Portals account identity and sign-in button; Top 10 best-score leaderboards per Skyline Rooftop (`rooftop-90s`), ORBIT (`orbit-90s`) and Grand Warehouse (`warehouse-90s`); submit exactly one finished **timed** run final score, never individual tricks or Practice; guest scores require an explicit nickname; signed-in preferences (graphics/camera/audio/rider/deck/map) are saved with schemaVersion 1. Guest names are local-only. Uploaded GLB data never enters cloud saves. Casual scores are client-reported, not trusted for paid prizes.

The Portals rankings button appears in the title, Options and run results. Scores in editor/draft previews are separate from published leaderboards.

Test: run `npm test`, then the Portals build. In Portals draft, test a timed run per map with a nickname, log in and test reload/cloud sync, inspect Top 10, verify Practice doesn't submit, and test a temporary API/network failure. On Render verify gameplay remains usable when SDK is absent. No production leaderboard is populated by automated tests.
