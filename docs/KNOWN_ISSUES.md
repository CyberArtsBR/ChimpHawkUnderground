# Known issues and evidence limits

Current cycle: 2026-11-03. [State](PROJECT_STATE.md) · [Prioritized work](DEVELOPMENT_ROADMAP.md). Fixed defects are recorded in [CHANGELOG](CHANGELOG.md), not counted as unresolved here.

| ID / priority | Confirmed gap | Evidence / next verification |
|---|---|---|
| KI-01 / P2 | Exact finger wrap/full grip remains incomplete; Hollow intentionally keeps his prior motion. | [Current palm review](evolution-cycle3-grab-contact.md): four-rider mean actual palm gap 19.87→10.06cm; Heretic Japan improves, while switch Tailgrab still has a 21.4cm gap. No swept-mesh/contact certification. |
| KI-02 / P2 | One shared voice palette and limited retained applause reduce character/audience variety. Human approval of the refined mix is still pending. | [Soundtrack reaction mix](finish-mix-v3.md): source-length ducks, 30 offline mixes, no new people/takes. Current A/B: port 5187/mix-v3/. |
| KI-03 / P2 | Sustained144 FPS at high resolution has not been demonstrated. Paradise still has a 13.70ms p95 in the short final route. | [Current controlled capture](hollow-grip-mix-status-2026-11-03.md): first-bail/respawn stalls move into loadout; all three sampled routes have no intervals >50ms. Warehouse/ORBIT near144 callbacks/sec, Paradise136.89. Longer repeated routes/hardware coverage remain. |
| KI-04 / P2 | JPEG/PNG delivery optimization reduces transfer size, not ordinary decoded GPU texture memory. | [Asset delivery](asset-delivery-optimization.md). Measure target hardware memory before introducing KTX2/Basis, decoder costs and lossy comparisons. Preserve original assets and collision data. |
| KI-05 / P3 | Main JS entry still exceeds Vite's 500 kB advisory (about 1.315 MB minified /369.02 kB gzip). | `artifacts/hollow-grip-v3/build.log`. Direct Hollow boot avoids the legacy placeholder; entry splitting still requires cold-load evidence and loader recovery tests. |
| KI-06 / P3 | Release identity stamping exists in CI scripts but is not part of Render's ordinary build command. | `render.yaml`, `package.json`, `tools/agent10-stamp-release.mjs`. Future release work should integrate a trustworthy commit stamp without presenting an uncommitted local tree as an immutable release. No deployment performed here. |
| KI-07 / verification | Current fixes have no fresh physical-controller, screen-reader or human sound-quality certification. | Automated keyboard/gamepad contracts and prior owner tests do not substitute for a new hardware/human review of this candidate. |
| KI-08 / verification | Ten prior park switches and current clean browser transitions do not establish a browser-heap/VRAM leak-free long session. | Extend same-route lifecycle capture with heap/resource baselines and actor/replay stress before making a memory guarantee. |

Initial composed-frame/wheel-glow preparation now also includes hidden bail effects and faded rider states. The observed Paradise first-bail/respawn stalls move into loadout in the current capture. Rare later basic/preset/camera variants still lack complete cold-path coverage; do not claim all possible shader hitches are eliminated. Hardware point-size limits and the shader's 1–72 drawing-pixel clamp also bound particle-size invariance.

Portals multiplayer/economy/server security was not re-audited as part of this standalone main-runtime cycle. No certification or platform synchronization is implied.
