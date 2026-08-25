# Tengxian city-wall authored PBR

The Tengxian wall uses three dedicated, game-authored PBR sets. They are kept
separate from household brick, adobe houses, and generic stone so the 11.5 m
defensive wall can carry a larger and more weathered material scale.

## Runtime sets

| Material | Base Color | Normal | ORM |
| --- | --- | --- | --- |
| Gray-blue fired brick | `Texture_CityWallBrickBase.webp` | `Texture_CityWallBrickNormal.webp` | `Texture_CityWallBrickOrm.webp` |
| Exposed rammed-earth core | `Texture_CityWallCoreBase.webp` | `Texture_CityWallCoreNormal.webp` | `Texture_CityWallCoreOrm.webp` |
| Weathered limestone coping | `Texture_CityWallStoneBase.webp` | `Texture_CityWallStoneNormal.webp` | `Texture_CityWallStoneOrm.webp` |

ORM channels follow the glTF convention used by the game: red is ambient
occlusion, green is roughness, and blue is metallic. All three materials are
non-metallic.

## ImageGen source prompts

The Base Color sources were generated with the built-in ImageGen tool on
2026-08-26. Each prompt required an orthographic, square, seamless material
scan with flat neutral illumination and prohibited text, borders, directional
shadows, large focal damage, modern masonry, and watermarks.

- Brick: weathered gray-blue hand-made fired bricks in irregular running bond,
  pale lime-and-earth mortar, restrained soot, rain discoloration, and chipped
  corners appropriate to a 1930s Shandong county wall.
- Core: compacted ochre-brown earth with fine gravel, sparse straw fibres,
  horizontal tamping lifts, subtle clay bands, and dry erosion.
- Stone: weathered gray limestone coping and dressed slabs with fine mineral
  grain, shallow tool marks, chipped edges, pale mortar, dust, and faint lichen.

`_blender/Script_BuildCityWallPbrMaps.py` fits each selected source to 1024²,
closes opposite edges with a narrow periodic feather, and derives Normal and
ORM from that exact Base Color. This keeps mortar, brick chips, and compacted
earth lifts registered across all channels. The script rejects any output whose
opposite-edge continuity error exceeds 0.75 byte values.

## Blender-authored geometry

- `_blender/BuildCityWallBreachProps.py` builds the breach shoulders, full-depth
  earth lift relief, broken brick teeth, rubble fan, brick clusters, and fallen
  coping stones.
- `_blender/Script_BuildCityWallDetailProps.py` builds intact-wall repair
  patches, a stone drain, plinth spall, broken coping, shell scar, and a small
  exposed-core patch.

Both scripts use temporary Blender collections, export ground-ready UV-mapped
GLB nodes, and delete their generated scene data after export.
