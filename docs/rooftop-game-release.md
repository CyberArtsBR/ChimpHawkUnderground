# Chimp Hawk — rooftop game release

## Player flow

The supplied title artwork is used as a 16:9 backdrop with real, focusable menu
transparent hit targets aligned to the artwork's painted buttons, with no repeated labels. D-pad/left stick navigates,
Xbox A selects, B goes back, and Menu pauses/resumes. Keyboard arrows/WASD,
Enter/Space and Escape perform the same menu actions.

The first Start Game opens the ChatGPT-generated landscape poster, followed by six readable 16:9 tutorial pages before the timed run begins.
The tutorial is also available on the title and pause menus. LB/RB or left/right
turn pages. The move tables are generated from the live trick catalogs.

Start Game starts a fresh 90-second run. The timer advances only during active,
focused play and is independent of the capped physics step. At zero it freezes
the run and displays banked points. Unlanded combo points are not awarded.
Options → Practice starts an unlimited session. Pause includes Resume, Tutorial,
Options, Restart and Main Menu. Development/showroom controls are hidden from
the normal player screen; the code-level QA hook remains available.

## Music

All seven user-supplied MP3s are packaged intact, with no transcoding. A shuffled
bag plays every track before refilling and avoids an immediate repeat across bags.
Tracks advance on natural ending, new run, timed run ending, Backspace, or Xbox
View/Select. Music also plays on menus. Volume and skate sound effects have
separate options. Browser autoplay policy can require the first click or keyboard
gesture; an on-screen message explains this instead of claiming sound is playing.

## Camera and physics

Follow is the default for every new session. Keyboard 1–4 selects Follow, Classic,
Fixed or First Person. Clicking the right stick cycles all four. First Person hides
the rider mesh and uses a wider field of view. The vert camera keeps its return
direction and framing through touchdown, takes meaningful ground velocity ahead
of stale travel state, and constrains clearance recovery to its current side.

Rail balance has a faster, unstable drift requiring active left/right correction.
Holding one direction indefinitely also overshoots. Crossing a balance limit bails
instead of gently exiting the grind. Manual balance retains its separate tuning.

Bails have a 1.25-second falling/sliding presentation and detached board motion.
The nearby respawn search requires a flat footprint, body clearance and headroom
within playable bounds. It falls back to the normal spawn if no nearby candidate
is safe. Banked score and stance survive a bail; the current combo does not.
The rider and board flash translucent three times over 1.8 seconds after recovery.

## Rooftop

The park geometry stays in its playable coordinate system. The rooftop support slab and fascia remain, with functional steel/glass perimeter guardrails. All fake skyline buildings, roads, in-world title sign, sign backing and support colliders are removed. Ground area labels are removed. The locally served 4K Poly Haven Qwantani Dusk 2 Pure Sky HDRI supplies detailed clouds and environment lighting; provenance remains in solar-dock-ramps-hdri-speed.md.

## Validation scope

Per the requested workflow: production compilation and deployment confirmation,
without gameplay tests, automated test suites, benchmarks or a new branch.

## Assets and navigation

Original, unmodified MP3s in `public/media`: Chimpion Drip, Slaying rails, West Park,
Old School flip, Aerial Flute, Skate Vibe, 808 Bas. Original title artwork is
`title-screen.png`. ChatGPT image editing reflowed the portrait guide into
`trick-guide-16x9.png`; prompt: `docs/trick-guide-landscape-prompt.txt`.
The generator returned 1672 × 941 pixels (near 16:9); it is contained without
stretching in an exact 16:9 frame. Detailed pages preserve the complete direction
legend and readable text, generated from the real trick catalog.

Back to Game Selection uses https://chimp-jump.onrender.com/ — the existing
launcher destination verified in CyberArtsBR/Skate src/main.js and an HTTP 200
page titled Chimpions Games on 2026-10-09. No new hub URL was invented.

Browser autoplay may still reject gamepad-only playback because many browsers
require a pointer or keyboard gesture. Every first controller input attempts
unlock; if denied, the unobtrusive music notice asks for a click/Enter.
Music loading errors skip unavailable tracks and stop after all seven fail.

Startup verification on the production build (2026-10-09): Chromium loaded the
original title with Start enabled, opened the poster, advanced to the detailed
keyboard/Xbox page, and returned to the title without page errors. All seven MP3s,
both PNGs and the 4K HDRI returned HTTP 200 with expected byte lengths. No run was
played. npm ci and npm run build passed (145 modules); Vite retains its advisory
warning about the main bundle exceeding 500 kB.

The newer remote 084317d was reconciled before publication. Its character tumble
and build-time music manifest are retained; overlapping shell/camera/recovery
implementations are consolidated to avoid duplicate listeners and rotations.
