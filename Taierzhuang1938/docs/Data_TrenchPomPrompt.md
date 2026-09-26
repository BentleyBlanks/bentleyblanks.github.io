# 壕沟 POM 素材生成记录

2026-09-26，实际使用内置 `image_gen__imagegen`。用户建议的 Lovart 在本次宿主无可用插件，仓库记载的本机 Lovart 脚本缺失，浏览器桥接也失败。未调用付费 API 回退。

本次只制作一套土壁材质，第一版实机颗粒过密，第二版修正后用于运行时。源图是生成图，高度是根据颜色图推断的形状，不是扫描或实测位移。法线/AO/roughness 由 `_import/Script_BakeTrenchPom.py` 从同一高度派生。早期试图生成的两份图留在宿主工具输出目录，仓库仅保留实际采用的两份源图与三个派生文件。

采用的颜色输出：`exec-ebe32480-cfd1-41ef-bc2d-d757195b050f.png` → `Texture/Texture_TrenchPomSource.png`。

颜色修正提示词（输入为第一版土壁源图）：

```text
Edit this single terrain PBR albedo source tile for a realistic excavated trench wall. Keep square, orthographic, tightly cropped surface-only texture, 1.5 metre physical extent. The current tile is much too gravelly and has strong baked directional lighting. Replace most of the fine raised gravel with compact brown loess/clay: about 70% softly eroded compact matte earth with broad flatter patches, narrow irregular vertical erosion striations and occasional shallow cracks; only 30% scattered small gravel and 5-8 partially buried flat angular stones. Stones must sink softly into the same clay. Important: true flat diffuse albedo under uniform fully overcast illumination, almost no directional shadows, no highlights, no artificial dark outlines around every grain. Natural subtle warm brown variations, darker dust between clay plates, small-scale fine porous detail. It must read as a cut soil bank, not a gravel pile, carpet, sponge or rocky mountain. Edge-to-edge seamless tiling; no horizon, vegetation, objects, text, grids, borders or diagram. Preserve realistic fine detail but much calmer and more cohesive than current image.
```

采用的高度输出：`exec-da589db3-094f-47e8-b228-834ee749fd81.png` → `Texture/Texture_TrenchPomHeightSource.png`。

高度提示词（唯一输入为上面的采用颜色图）：

```text
Create the exactly spatially aligned GRAYSCALE HEIGHT / displacement map for this terrain texture, preserving every major shape and every stone at the identical pixel location. This is technical surface elevation data, not a grayscale photograph. Uniform grayscale only. Use mid gray for compact broad clay faces, shallow softly varying elevation across them; dark narrow cracks and eroded channels; small stones moderately lighter than the surrounding earth. Maximum physical height difference about 5cm. Suppress fine tiny grain elevation: tiny grains should be very low contrast, not bright dots. No light source, no cast shadows, no directional bright rims, no highlights or shading. Absolute heights: darkest cavities ~35/255, compacted clay faces ~140/255, highest sparse stone protrusions ~205/255. Smooth height within each face, steep transitions at cracks. Exact same square image framing and registration as input, no new stones or cracks, no text, borders, diagram, color, normals or split panels. Seamless edge continuity.
```

提示词描述的是意图，输出仍有少量烘焙明暗和生成配准误差；不据此声称获得了真正无光照反照率或测量级高度数据。实际验收以游戏内近景、斜视和交界处截图为准。
