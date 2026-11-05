# First pass: skater pose and arcade movement

Requested behavior: natural limbs, sharper grounded turns, manual momentum,
minimum grind speed with gradual acceleration and increasing balance difficulty.

- Infer anatomical shoulder directions and a shared forward knee bend from the
  avatar skeleton. The old deck-axis left/right assumption could reverse one
  knee and pull elbow poles across the body in a sideways skate stance.
- Keep neutral wrist rotation local to the forearm; limit grab wrist adjustment
  to 0.45 radians instead of locking a world wrist orientation against arm IK.
- Increase the high-speed ground steering rate from 1.2 to 1.65 rad/s before
  existing carve gains. Analog steering and ramp reentry suppression remain.
- Manuals retain normal rolling momentum without automatic pushing. Explicit
  brakes, slope gravity and overspeed drag still act.
- Valid rail captures receive a minimum 3.2 m/s (11.52 km/h). Grinds gain
  0.35 m/s per second on flat rails; downhill gravity may add more. Uphill
  rail travel no longer subtracts speed. The existing 23 m/s cap remains.
- Rail balance pressure grows beyond the first 2.5 seconds, over the next 15
  seconds; higher speed also contributes more pressure.

Validation: 554 tests, board 15/15, vert 20/20, pumping 15/15, production build,
and browser checks of finite poses and neutral wrists on all five bundled
avatars. Multi-angle snapshots are under artifacts/collision-audit.

This is the initial correction based on code and rendered poses. The user's
forthcoming recording will guide additional animation and feel adjustments.
