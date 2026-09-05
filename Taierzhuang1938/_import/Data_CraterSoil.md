# 弹坑焦土资产

2026-09-06，使用当前环境直接提供的 OpenAI 内置 `image_gen__imagegen` 生成，未走 CLI 或付费回退。
生成编号：`exec-f471f4e4-6d64-4a07-afa4-c8eb03c604e9`。原图为独立生成，未使用游戏截图作为输入。
Battlefield / Call of Duty 截图仅作视觉参考，不放入站点资源。

运行时资产位于 `../Texture/`：

| 文件 | 内容 | 尺寸 / 色彩空间 |
| --- | --- | --- |
| `Texture_CraterScorchedBase.webp` | 焦褐色破碎粘土、细砾与零星石片 | 1024² / sRGB |
| `Texture_CraterScorchedNormal.webp` | 与颜色对位的毫米级微法线 | 1024² / linear |
| `Texture_CraterScorchedOrm.webp` | R 间隙遮蔽、G 干土粗糙度、B 非金属 | 1024² / linear |

`Script_BakeCraterSoil.py` 用 Pillow 转换运行时 WebP，并从局部亮度梯度构建微法线、
局部高通构建间隙 ORM。它们是美术辅助信号，不声称由实物扫描获得真实高度。
大尺度地形与碰撞始终来自 TerrainDeformation 的共享高度格点。

```powershell
python Taierzhuang1938/_import/Script_BakeCraterSoil.py <imagegen-source.png> Taierzhuang1938/Texture
```

完整生成提示词：

```text
Use case: photorealistic-natural. Asset type: seamless square game PBR base-color texture for freshly blasted scorched earth, covering 1.8m x 1.8m. Create a highly realistic flat orthographic overhead scan of irregular fragmented compact clay soil after an artillery explosion, dark umber and charred sepia earth, occasional charcoal-black powder pockets and pale brown freshly fractured gritty edges. Dense irregular crushed angular earth clumps (1-8 cm), tiny gray limestone chips (5-20 mm), finer dusty ash and sand in interstices, very sparse exposed broken dry root fibres. Rich multiscale random material detail. This is a TILEABLE ALBEDO TEXTURE, uniform material coverage to all four edges, flat cross-polarized diffuse lighting, no directional shadows, no baked large shadows, no perspective, no horizon, no crater bowl, no central round motif, no large boulders, no paving or rounded cobblestones, no recognizable objects, no text, no border. Fine granular and cracked soil should dominate. Keep color dark earthy warm brown with organic mottled scorch. 2048 square.
```

实体碎石复用已有 `Model_StackableStoneSet.glb` 的七种几何，不改动原模型。
来源为 Poly Haven CC0，详见 [现有署名表](Data_SourceLicenses.md#poly-haven-cc0-构件)。
厘米级小土块由 `Script_CraterDebris.mjs` 生成；两者都在当前脏块按 BuildSink 合批。
照片的平铺尺度与碎块尺寸是游戏美术参数，以运行时代码为准。
