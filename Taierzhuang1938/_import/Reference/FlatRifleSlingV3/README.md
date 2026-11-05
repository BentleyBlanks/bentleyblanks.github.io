# Flat rifle sling source

The runtime asset is flat khaki olive nylon webbing, following the user's material correction on 2026-11-05.

Built-in imagegen supplied one fine woven nylon base-colour tile. Its exact prompt is `Prompt_RifleSlingNylonV4.txt` and its 1024px WebP derivative is `Texture_RifleSlingNylonSourceV4.webp`. The full 1254px PNG and editable Blender project are in `C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/NylonRifleSlingV4_20261105/`.

`_blender/Script_FlatRifleSlingBakeV3.py` reads the repository WebP and builds the 25 mm wide, 2 mm thick strap, tapered 16 mm ends, folded loops, short return tabs and stitches. The repository Blender manager bakes a fine normal map with a 16 mm square texture repeat and 25 micrometre height scale. The GLB has 63 skinning bones driven by 32 simulation points. Its weave, colour, stitching and movement parameters are authored art direction.
