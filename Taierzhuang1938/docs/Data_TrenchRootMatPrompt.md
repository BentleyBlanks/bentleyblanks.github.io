# 细根贴图生成记录

2026-10-10，使用内置 `image_gen__imagegen` 编辑既有根毡参考，`transparent_background: true`，只生成一张。原图保存在 `C:/Users/Bentl/.codex/artifacts/TrenchReferenceTenImplementation20261009/Source/RootFringe106/Texture_TrenchRootFringeSource.png`，1254² RGBA。经 `_import/Script_BakeTrenchRootMat.py` 缩至 1024²，并在低透明区域延展根须颜色，避免 mipmap 渗色；保持缩放后的 alpha 逐位不变，输出 `Texture/Texture_TrenchRootMat.webp`。未调用 CLI/API 付费回退。

重建命令（`--source` 指向保留的 PNG，`--output` 可指定独立验收目录）：

```powershell
python Taierzhuang1938/_import/Script_BakeTrenchRootMat.py --source "C:/Users/Bentl/.codex/artifacts/TrenchReferenceTenImplementation20261009/Source/RootFringe106/Texture_TrenchRootFringeSource.png"
```

完整提示词：

```text
Use case: precise-object-edit. Asset type: one square production game root cutout texture for an earthen trench wall. The attached image is the edit target and root-material reference. Replace the dense soil-bound mat with a lighter, irregular fringe of exposed fine roots, keeping the natural dry gray-brown root material and photographic realism. Remove ALL opaque earth masses, clods, leaf masses and the dense thatch carpet. Keep only roughly 15–25 branching main rootlets with many thinner irregular side branches, varied lengths and gently crooked paths, hanging downward from a loose uneven upper edge. Some overlapping small groups, plenty of genuinely transparent gaps; no continuous rectangular mass. Main rootlets should remain readable when the texture is small: varied thickness, several around 5–8 mm and many fine 1–3 mm branches, in a patch roughly 50 cm wide and 35 cm high. Muted weathered brown/taupe, entirely matte, even diffuse neutral light, no cast shadows, no glow, no outline, no colored fringe, no ground or scenery, no text. Center the complete fringe in a 1024×1024 square with modest transparent margins, keep all fine branch tips inside the canvas. Output a genuine transparent-background RGBA image.
```

## 旧版根毡


2026-09-26，直接内置 `image_gen__imagegen`，单张生成，`transparent_background: true`，未使用 CLI 或付费回退。输出原样复制到 `Texture/Texture_TrenchRootMat.png`，1254×1254 RGBA（2026-09-28 按贴图资产规范转 `.webp`：有损 q95、alpha 逐位不变）；不是用概念参考图裁出的图片。

完整提示词：

```text
Use case: photorealistic-natural. Asset type: a single production game foliage cutout texture, square. Create a dense irregular mat of DEAD DRY GRASS AND FINE EXPOSED ROOTS hanging from an excavated earthen bank edge, isolated on genuinely transparent background. Orthographic front-on botanical scan, 1.2 metres wide by 0.7 metres high. Top half is a thick, messy interwoven sideways flattened thatch of very fine weathered gray-umber tan grass blades, curled broken stems and fibrous roots; bottom half tapers into many uneven short branching rootlets hanging downward. Organic tangled clumps, many small transparent holes between strands; asymmetric outline feathering naturally on all four edges. The top crown is gently undulating, not a straight rectangular strip. Detailed fine fibers with varied thickness, only a few longer loose strands. Muted dirty brown and straw taupe, matte, not orange or bright yellow. Flat diffuse lighting suitable for albedo, no strong baked shadows or highlights. No ground plane, no rocks, no large clod, no scenery, no green plants, no container, no text, no ruler, no background colour. This is one compact root-bound grass mat, not widely spaced individual grass stems and not a ball or bouquet. Preserve alpha in all gaps.
```
