# Taihang 3D art assets

`taihang-ui-icons.png` was generated with Codex's built-in image generation tool for the 3D presentation pass. It is a 4 × 3 atlas used by the resource HUD and unit banners.

Prompt summary: twelve historical-strategy icons (grain, manpower, arms, organization, scout, work team, combat unit, veteran, commando, spy, watchtower, railway), arranged on a strict 4 × 3 grid with dark enamel medallions, aged-brass rims, a restrained 1941 North China palette, no text, no modern objects, and no watermark.

`taihang-loess-ground.png` was generated with the same built-in tool as a seamless, top-down winter loess albedo: compact ochre-brown soil, sparse dormant straw, fine grit and tiny grey pebbles, flat diffuse lighting, no objects, roads, footprints, borders, text, or watermark. It supplies the plain/hill color base; code-generated detail remains available as a loading fallback and provides the other terrain families.

The 3D renderer keeps code-generated tactical symbols and procedural surface maps as fallbacks so the game remains readable if a bitmap asset cannot be loaded.
