# Chimp Hawk Online — Portals Beta (Phase 3)

Scope: optional Portals-only multiplayer. Existing solo/leaderboards continue without the SDK.
Feature branch: feat/portals-online-beta -> fix/portals-bundled-fonts. Render/main need no multiplayer release.

## Currently implemented
- Optional title/options entry PLAY ONLINE · BETA.
- Channel-based global public rooms 01–08, Quick Play tries each and creates/joins an empty room when no one is present.
- Private invite code CHXXXXXXXX and copyable ?online-room=CHXXXXXXXX link; signed-out guests may create rooms.
- Portals.net movement broadcast at ~8Hz; rigged remote characters/boards loaded from existing GLB assets, interpolated and name-tagged.
- Portals.voice join/mute/retry via host consent UI; gameplay playable without mic.
- Protected server.js referee for HOST, ready, 3s countdown, 90s Skate Jam, 60s Last Trick, casual points, kick between rounds, leadership transfer, map/mode changes (queue or immediate).
- In-game bug report submits limited descriptions to Portals test/production Analytics as online_bug_report, not to external services.
- Practice-mode online gameplay, keeping solo leaderboard separate.
- Server script is duplicated at public/server.js: Vite copies this to dist/server.js, as required by Portals.

## Portals limitations and release blockers
- This is a beta prototype, NOT a verified production multiplayer build.
- Portals-managed lobbies require sign-in to host/private join. This implementation uses custom net channels to preserve guest hosting; its public browser is a fixed eight-room directory rather than a live occupancy list.
- Server requires Portals publishing the built dist; GitHub push is not the same as Portals publish.
- Portals voice works on hosted game pages, not the editor preview or outside Portals.
- The server script owns room rules, NOT trick physics. Scores are client-reported and must not award money/coins/prizes.
- Disconnected/closed clients may not be reconnectable by a new guest session ID.
- The platform may retain idle server sessions for about five minutes; the UI must treat an empty room as closed even if its internal server lifecycle takes longer.
- Portals public Room matchmaking profile/maxPlayers must be configured on the Portals dashboard if opting into managed features; custom channels do not need a matchmaking profile.
- Voice and synchronized remote character presentation must be tested with four separate hosted sessions before enabling general Beta release.

## Test
`npm ci && npm test && npm run build -- --base=./ && node tools/agent10-verify-dist.mjs`
Confirm that dist/server.js exists. Run the draft on Portals with two and four real browsers. Verify: guest Quick Play, invite link, sync trick pose, voice mute, HOST migration, jam start, cancellation, final 60s cap, map transitions and single-player regression.

## Publish
Import/refetch branch fix/portals-bundled-fonts into the existing Portals game. Build Vite in the repository root using npm ci and npm run build -- --base=./; output dist. Test draft before pressing Publish in Portals. No automatic Portals API publish or website-admin credentials are embedded in the repository.
