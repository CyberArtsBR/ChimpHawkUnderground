# Session menus, results and highlights

The owner-supplied sunset skatepark image is served as `public/assets/menu/run-sunset.webp`. It is the backdrop for character selection, pause, the three-second end-of-session transition, and the final results. The original title artwork is preserved.

At zero on the 90-second clock, gameplay freezes immediately. Graffiti `TIME’S UP` appears for three seconds, followed by the scored run report. The report opens at its heading, including on empty runs; keyboard and controller navigation can reveal later actions.

Results show the final weighted score, original banked points, best combo, landed combo/trick counts, unique landed tricks, bails, top speed, travelled distance, air time, grinding and manuals. Achievements describe observed accomplishments in this run. They do not claim persistent records or unlocks.

The final score is `max(0, round((banked points + 100 × landed combos + 25 × landed tricks) × variety multiplier) − 250 × bails)`. Variety adds five percent per unique landed trick, capped at a 2.00 multiplier. The results display every contribution and deduction. Only accepted, landed scoring events earn bonuses; a lost combo does not inflate the counts. Each separate bail is counted once. Live trick scoring and highlight ranking keep their original banked points.

For example, the inspected 13,929-point run with 12 landed combos, 32 landed tricks, 13 unique tricks and six bails finishes at 24,783 points: a 15,929-point subtotal × 1.65, rounded to 26,283, then minus 1,500 bail points.

`Watch the Highlights` plays up to three highest-scoring, distinct landed combo moments. Each clip includes 2.5 seconds before the combo begins, its full recorded action, and 2.5 seconds afterwards where recorded samples exist. Closely overlapping clips are represented by the best scoring moment. The start of the run naturally limits the first clip’s available lead-in. Frozen post-roll is captured during the three-second transition when a moment ends near the timer limit.

Playback uses recorded rider bones, board and visual transforms, cinematic camera moves, lens changes and 0.45× action slow motion. It restores the original visual and camera state when completed or skipped. It never replays physics or changes scores. Replays are kept in memory for the current run; they are not exported video files or persistent recordings.

Recording samples actual poses at up to 30 Hz into a bounded 95-second ring buffer. The buffer stays within 32 MiB; unusually large rigs reduce the sampling rate to respect the cap. The live 144 FPS target remains hardware-dependent and has not been benchmarked for this change.

Validation: production build and focused summary, replay, menu and final-score checks passed. A real timed browser run ended with 900 banked points from three landed combos; all three cinematic highlights played and returned to the unchanged banked score. Release browser checks independently calculate the weighted final from the visible achievements and confirm the original gameplay score is preserved. No map geometry, materials, live trick scoring or gameplay physics changed.
