# Ramp launch height restoration

The previous Map 4 safety update capped passive ramp launches at 9.4 m/s and charged launches at 10.6 m/s. At gravity 20, a passive launch gained at most about 2.2 metres above departure. Real warehouse quarter approaches were already carrying 12–13 m/s vertically at the lip, so the cap discarded useful momentum and made fast ramps feel like small hops.

Raised the single launch envelope to 13.4 m/s passive and 15 m/s charged. The launch still consumes ramp energy once, respects the existing approach/boost calculation and then follows gravity. Low speed, flat-ground ollies, pump timing, heading ownership and transition return guidance retain their existing rules.

Validation:

- 571 tests pass, including five new full approach/launch/landing runs through the actual warehouse GLB: competition halfpipe, return quarter, Foundry mini, Flow launch and low kicker.
- Board 15/15, vert 20/20 and pump 15/15 checks pass; production build succeeds.
- Chrome with the loaded game board contact rig: halfpipe 4.43 m rise, quarter 4.13 m, mini 3.52 m, Flow launch 4.48 m, all landing without a bail. The previous cap limited the same fast launches to around 2.17 m.
- The physical ceiling remains 4.49 m passive / 5.63 m charged above departure; this avoids restoring unbounded stacked impulses.

Run `node tools/ramp-launch-browser.mjs` for browser checks. Set STREETSKATE_URL for the published site, PLAYWRIGHT_MODULE for the installed runtime package, and AUDIT_LABEL to distinguish local/live telemetry and screenshots. Captures are written to `artifacts/collision-audit`.
