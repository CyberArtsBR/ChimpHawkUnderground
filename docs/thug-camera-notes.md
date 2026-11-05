# THUG camera adaptation

Reference: [SkaterCameraComponent.cpp](https://github.com/RetailGameSourceCode/TonyHawksUnderground/blob/master/Code/Gel/Components/SkaterCameraComponent.cpp), studied through the source archive supplied with this project.

The reference separates the tripod position, orientation, contextual zoom and collision correction. Update chooses movement velocity rather than the animated deck as its ordinary facing source. UseVertCam selects special framing for locked vert airs and lip states. GetTripodPos uses separate horizontal/vertical smoothing and faster vert tracking, adjusted for elapsed time. CalculateZoom changes zoom for rail and big-air trick states and keeps the big-air trick zoom active for that flight. Update also retains a short landing transition before returning to ordinary framing. Many final tuning values are loaded from camera script structures, so this repository alone does not specify a complete identical camera preset.

StreetSkate implements these concepts in its own JavaScript and metre-based tuning:

- Fixed is still the initial preference requested by the player: world orientation, distance and pitch remain fixed; only the tracked position translates. Horizontal and vertical follow rates are separate, with a bounded tracking lag.
- C, right-stick click or the camera toolbar button selects Classic. The choice persists in local browser storage; unavailable storage falls back safely to Fixed.
- Classic follows the canonical travel direction and ignores deck spins. A same-ramp return holds the approach side through the vert flight and briefly through landing. Ordinary 180-degree travel reversals ease more slowly.
- Vert changes to higher, closer framing; ordinary air has more room than ground. A trick started in vert latches a modest zoom for that flight; rail framing has its own zoom. Transitions are time-based and smooth.
- Mouse drag/right stick provides temporary lookaround in Classic. It returns after release and recenters for a locked vert flight. Fixed ignores lookaround.
- Both modes retain collision clearance and recovery. Camera operations consume copied presentation state and cannot mutate the skater trajectory or heading.

This is an adaptation of behavior, not a binary-compatible port, copied C++ implementation or assertion of identical THUG constants. No runtime camera tests were performed by request.
