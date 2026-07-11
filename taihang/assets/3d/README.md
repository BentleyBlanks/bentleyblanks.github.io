# Taihang 3D art assets

`taihang-ui-icons.png` was generated with Codex's built-in image generation tool for the 3D presentation pass. It is a 4 × 3 atlas used by the resource HUD and unit banners.

Prompt summary: twelve historical-strategy icons (grain, manpower, arms, organization, scout, work team, combat unit, veteran, commando, spy, watchtower, railway), arranged on a strict 4 × 3 grid with dark enamel medallions, aged-brass rims, a restrained 1941 North China palette, no text, no modern objects, and no watermark.

`taihang-loess-ground.png` was generated with the same built-in tool as a seamless, top-down winter loess albedo: compact ochre-brown soil, sparse dormant straw, fine grit and tiny grey pebbles, flat diffuse lighting, no objects, roads, footprints, borders, text, or watermark. It supplies the plain/hill color base; code-generated detail remains available as a loading fallback and provides the other terrain families.

The 3D renderer keeps code-generated tactical symbols and procedural surface maps as fallbacks so the game remains readable if a bitmap asset cannot be loaded.

## Blender tile-asset kit

The Blender-authored building kit lives under this directory:

- `source/taihang-tile-assets.blend` — organized source scene and lit catalog.
- `source/build_taihang_assets.py` — deterministic Blender rebuild/export script.
- `models/*.glb` — separate ground-centered glTF binaries plus a combined catalog.
- `models/polycounts.json` — evaluated triangle counts, dimensions, and budget checks.
- `preview/taihang-tile-assets-preview.png` — final isometric QA render.
- `reference/` — generated turnaround boards and historical design notes used before modeling.

The kit contains neutral and headquarters villages, a completed railway pillbox, its
construction state, a compact county stronghold, a bandit stockade, a modular railway
segment, a small steam locomotive, and a mine-warning cluster. One Blender unit matches
one `render3d.mjs` world unit. Every complete exported root is below 2,000 evaluated
triangles; the exact current values are recorded in `models/polycounts.json`.

To rebuild through Blender, load `source/build_taihang_assets.py` into one Python
namespace and call `build_all()`, or call its six stage functions in the documented
order for easier inspection between stages.
