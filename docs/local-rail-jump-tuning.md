# Local rail and jump tuning

Requested arcade behavior: entry keeps projected rail speed, without the former 3.2 m/s injection. Aligned near-zero/zero fallback captures can attach; heading selects direction when stationary. Neutral rail propulsion uses the flat-ground automatic motor up to 18 m/s, with a minimum smooth .35 m/s² progression through cruise; above cruise .35 m/s² continues to 23 m/s. Incoming overspeed is retained rather than abruptly clamped. Explicit brake subtracts 16 m/s² and can stop the grind. Rail downhill gravity still adds speed; uphill does not defeat the requested automatic traction behavior.

Initial local feel tuning: flat cruise 17→18 m/s (61.2→64.8 km/h); gravity 20→21 m/s²; charged pop range 5.4–7.6→5.6–7.9 m/s. Ideal flat apex becomes .747–1.486m versus .729–1.444m; flight .533–.752s versus .540–.760s. This is a modest higher/crisper pop, not a dramatic floaty jump. Vert controllers, fixed step and explicit exit controls unchanged.

Validation: 37 targeted grind/rider tests passed; new propulsion/braking regression passed. Full suite initially had one failure, an old test hardcoding 17 m/s as the cruise cutoff; updated it to the new 18 target and targeted rerun passed. Board/vert/pump verification passed 15/20/15. Parent should rerun full suite after integrating UI/VFX. Physical controller feel and broad coping/browser runs remain review tasks.

## Rail support retention

Removed the passive detach triggered by a post-collision support displacement above 20 cm. Captured rails retain their support point after collision resolution unless a real bail has occurred. Existing rail-end and explicit ollie release paths remain. The new grind-support-lock regression exercises ten seconds of repeated .3m support corrections plus deliberate jump and endpoint exits. This reproduces the release condition in isolation; the user's exact rail route has not been replayed.
