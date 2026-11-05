# The Hollow roster integration

The supplied `thehollowf.glb` is the first of five stock rider options, displayed as **The Hollow** (catalog ID `hollow`). Heretic, Adolescent, Anchor and Tuxr keep their relative order. The user supplied model is shipped without re-exporting, retargeting, recompressing or changing its materials.

- Runtime asset: `public/assets/rider/thehollowf.glb`
- Size: 924,560 bytes
- SHA-256: `c8e5f3c41a656580e2ce8b6761f46314add8390ed68fbfe22d0e7e82e6f278fc`
- GLB 2.0: 68 nodes, one 65-joint Mixamo skin, two meshes, three primitives, two materials and one embedded JPEG. No external resource URLs or embedded animation clips; the existing rider runtime poses the original rig.
- Both arm chains and both leg chains resolve through the existing Mixamo aliases. The asset has no optional `root` semantic bone; its required limb IK is complete.
- The pale yellow roster accent follows the supplied emissive material's yellow channel. The source texture and materials remain intact.

`public/assets/menu/riders/thehollowf.png` is a 320 × 340 static portrait baked by the unchanged production `renderPortrait` function. Stock menu presentation uses the baked PNG and never requests a GLB or allocates a portrait renderer during normal menu loading. Uploaded custom characters retain the existing preview path.

The roster occupies one full-width row above the loadout panels at desktop sizes. All five names and subtitles remain visible at 1280 × 720 and 1920 × 1080. Keyboard left/right and the gamepad D-pad share the existing focus route. Smaller windows reflow into three or two columns; an uploaded sixth rider can add a second row without replacing the stock crew.

Validation:

```powershell
node --test tests/hollow-roster.test.mjs tests/agent11-portrait-lifecycle.test.mjs tests/agent08-navigation-regressions.test.mjs
$env:STREETSKATE_URL='http://127.0.0.1:5182/'
node tools/verify-hollow-roster.mjs
```

The menu-only browser check validates every card and text bound, keyboard and gamepad traversal, selection confirmation, no page errors and zero GLB requests at both sizes. Evidence is saved in `artifacts/hollow-roster/`. To deliberately regenerate the portrait after an approved model or renderer change, run the same tool with `--bake-portrait` against the local Vite dev server.

Release checks require the fifth GLB and baked portrait. The focused Node test checks the original file hash and loads the supplied geometry and skin into the existing animation runtime; material decoding is omitted only inside that Node test.
