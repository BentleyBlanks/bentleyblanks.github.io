# 贴图资产规范（2026-09-28 起）

《滕县》所有贴图（`Taierzhuang1938/Texture/` 下的每一个文件）的唯一口径。用户原话：「所有的资产都需要规范化」。

| 东西 | 位置 |
|---|---|
| 清单（每个文件登记一次） | `Data_TextureManifest.mjs` |
| 通用烘焙脚本 | `_import/Script_BakePbrTexture.py` |
| 材质类预设与门槛（烘焙脚本与门禁共用） | `_import/Data_TextureBakePresets.json` |
| 烘焙记录（机器写，进仓库） | `_import/TextureBakes/Texture_<Name>.json` |
| 提示词（进仓库，便于重生） | `_import/Prompts/Texture_<Name>.txt` |
| 关卡按需集表与加载器 | `Data_LevelTextureSets.mjs`、`Script_LevelTextureSets.mjs`、`MaterialLibrary.LoadLevelSets` |
| 门禁 | `Script_TextureStandardsTest.mjs`（quick 档，纯 Node，毫秒级） |

模型（GLB / tzm）的面数与朝向规范不在这里：见 `Data_AssetStandards.mjs` + `Script_AssetStandardsTest.mjs`、`Script_ModelFacingTest.mjs`（AGENTS.md 跨系统契约 4、7）。模型自带的贴图若落在 `Texture/`，同样要登记本清单。

---

## 0. 一页用法（新贴图四步）

```powershell
# ① 生成（Lovart，每张新开 thread；源图不进仓库）
$env:PYTHONUTF8 = "1"
python "C:/Users/Bentl/.claude/skills/lovart/scripts/agent_skill.py" chat --prompt (Get-Content -Raw -Encoding UTF8 Taierzhuang1938/_import/Prompts/Texture_VillageGreyBrick.txt) --json --download --output-dir Taierzhuang1938/_shots/Gap3A_Source/Village
#   记下返回的 thread_id；final_status 为 pending_confirmation 时停下问用户，不许自动 confirm

# ② 烘焙（先 --dry-run 看 _shots/TextureBake/<Name>/Preview_<Name>.png，满意再去掉 --dry-run）
python Taierzhuang1938/_import/Script_BakePbrTexture.py --source Taierzhuang1938/_shots/Gap3A_Source/Village/Gen_VillageGreyBrick.png --name VillageGreyBrick --preset greyBrick --tile-m 1.45 --dry-run
python Taierzhuang1938/_import/Script_BakePbrTexture.py --source Taierzhuang1938/_shots/Gap3A_Source/Village/Gen_VillageGreyBrick.png --name VillageGreyBrick --preset greyBrick --tile-m 1.45

# ③ 登记：把脚本打印的条目骨架贴进 Data_TextureManifest.mjs（补 thread id），
#    再在 Data_LevelTextureSets.mjs 的 FirstLevel 里加 { name: "VillageGreyBrick", v: "20260928", fallback: "BrickWall" }，
#    消费方建场时 await this.library.LoadLevelSets("FirstLevel") 之后 library.Get("VillageGreyBrick", …)

# ④ 测试
node Taierzhuang1938/Script_TextureStandardsTest.mjs
node Taierzhuang1938/Script_TestRunner.mjs --changed=<起点提交> --profile=quick --fail-fast
```

烘焙打印的指标里任何一条「门槛未过」就不要登记：调参数（`--seamless`、`--tone-strength`、`--flatten-sigma`）或重抽源图（每个材质最多重抽 2 次）。

---

## 1. 目录

- `Texture/` 只放**运行时会请求的成品图**与它们的说明（`Data_*.md`）。子目录：`Hud/`（HUD 叠层与 HUD 图标）、`Menu/`（菜单插画）、`Editor/`（工作台图标）。
- 源图（Lovart / imagegen 原始下载、高分辨率扫描）**不进仓库**：放 `_shots/Gap3A_Source/<Package>/`（已忽略）或本机素材目录；确需入库的可重建源放 `_import/Source/<Name>/`（例：`_import/Source/TrenchPom/`）。
- 生成脚本放 `_import/`（或 `_blender/`），不放 `Texture/`。

## 2. 命名

`Texture_<DescriptivePascalCase><Channel>.<ext>`，图标 `Icon_<PascalCase>[_<Name>].<ext>`。套名（`<DescriptivePascalCase>`）= 清单 `id`；不带下划线（序列帧编号 `_01`、HUD 变体 `_<Variant>` 除外）。

| 通道 | 语义 | 色彩空间（消费方设） |
|---|---|---|
| `Base` | 反照率 RGB；带 A 时 A = 镂空 / 不透明度 | `SRGBColorSpace` |
| `Normal` | 切线空间法线，rgb = n·0.5 + 0.5，约定见 §3.2 | `NoColorSpace` |
| `Orm` | R = AO，G = 粗糙度，B = 金属（glTF 顺序；三个槽喂同一张，见 `Script_Materials.Get`） | `NoColorSpace` |
| `Orh` | R = AO，G = 粗糙度，B = 高度（地形 / 壕沟纹理数组；没有金属） | `NoColorSpace` |
| `Mask` | 数据遮罩 / 噪声；每通道语义写在清单 `packing` | `NoColorSpace` |
| `Detail` | 细节层打包（例：军装布纹 RG 法线 / B 明暗 / A 污渍），语义写 `packing` | `NoColorSpace` |
| `Atlas` | 序列帧 / 多格图集（颜色） | `SRGBColorSpace` |
| `Image` | 整张画面：HUD、菜单、印刷品、图标 | CSS / sRGB |
| `Environment` | HDR 环境图（`.hdr` 白名单） | 线性 |

`BaseColor` / `MetallicRoughness`（glTF 通道名）与 `Tool` 只允许出现在 legacy 条目。另外存 `…Metallic.webp` / `…Roughness.webp` 这种拆通道图是**禁止**的：运行时只读 ORM（2026-09-28 已删 30 张）。

清单的 `kind` 决定规则分支：`material`、`terrainLayer`、`decal`、`vfx`、`detail`、`print`、`hud`、`menu`、`icon`、`environment`、`doc`（以及只许 legacy 的 `bakeInput`、`tool`）。完整定义在 `Data_TextureManifest.TEXTURE_KINDS`。

## 3. 格式与尺寸

### 3.1 格式

- 游戏贴图一律 **WebP**。取舍：
  - `Base`：有损 q≈86（`--base-quality`），`method=6`；带 A 的 alpha 无损（`alpha_quality=100`）。
  - `Normal` / `Orm` / `Orh`：默认有损 q≈90 + `use_sharp_yuv`（地形层实测够用、体积约为无损的一半）；POM 高度、要逐位精确的遮罩用 `--data-lossless`。
  - 转换旧图：颜色图有损、数据图无损，量 PSNR（可见像素 ≥ 37 dB）并目测。
- PNG 只许 ≤ 64 KB 的图标 / HUD 小图；**不许 JPEG**（有损法线、无 alpha）；`.hdr` 只许 `environment`。
- 尺寸 2 的幂（`material` / `terrainLayer` 还要正方形）：`Base` ≤ 1024；特写件可 2048，须在清单写 `sizeReason`；`Normal` / `Orm` 默认半分辨率（`--data-size`），不得大于 `Base`。HUD / 菜单 / 印刷品不要求 2 的幂（≤ 2048）；图标边长 ≤ 512。

### 3.2 法线约定（写死）

| `normalConvention` | 绿通道 | 给谁 |
|---|---|---|
| `gl`（默认） | 图像**上方**（OpenGL / Y+） | three `MeshStandardMaterial`：`Script_Materials` 的外部 PBR 与 `TextureLoader` 都是 `flipY = true`，图像上方 = +V，与 three 的切线空间一致。glTF 路径 `flipY = false` 时 `GLTFLoader` 会自动把 `normalScale.y` 取负，同一张图照样对；自己用 `flipY = false` 载 `gl` 法线（例：`Script_ExternalProps` 的作者 atlas）要自己把 `normalScale.y` 取负 |
| `terrain` | 图像**下方** | 地形 / 壕沟纹理数组（`Script_TerrainMaterial`、`Script_TrenchSurfaceMaterial`）：`flipY = false`、uv = 世界 (x, z) / 平铺米数，图像向下 = 世界 +Z，扰动直接 `vec3(n.x, 0, n.y)`；与 `Script_BakeTerrainLayers.py`、`Script_BakeTrenchPom.py` 一致 |

盒投影 / 三平面：每个投影面各自以 (u, v) 取样，把 `n.xy` 当作该面切线 / 副切线方向的扰动（UDN / Golus 2017 的写法）；侧面 v = 世界 −y 时 `gl` 图的绿要按该面的 v 方向解释。放进地形数组的外部图（例：Poly Haven `nor_gl`）必须先翻绿成 `terrain` 约定——`TrenchStone` 就是没翻的反例（见 §10）。

烘焙脚本对两种约定用凸圆盘做过合成验证（`gl`：上沿绿 172 / 下沿 83；`terrain` 相反）。

## 4. 平铺材质的质量门

烘焙脚本在**存盘后的 Base** 上量这些指标并写进烘焙记录，门禁按 `_import/Data_TextureBakePresets.json` 的 `gates` 与材质类核对：

| 指标 | 含义 | 门槛 |
|---|---|---|
| `seamRatio` | 接缝两侧相邻像素差 ÷ 图内相邻像素差（≈ 1 = 接缝与图内一样连续） | ≤ 1.5 |
| `border` | 图边带与图内的局部对比度之比（接缝一圈发平发糊时低） | ≥ 0.90（只查 `isotropic` 类） |
| `swing` | 亮度随「离图边距离」的起伏（平铺后就是网格） | ≤ 2%（只查 `isotropic` 类） |
| `lowFreq` | σ = 边长/16 的大尺度明暗 ÷ 均值（烘进去的投影、侧光、暗角） | ≤ 3.5% |
| `clipLow` / `clipHigh` | 亮度 < 0.03 / > 0.95 的像素比例（暗部 / 高光堆积） | 各 ≤ 2% |
| 纹素密度 | Base 边长 ÷ `metersPerTile` | 128–1024 px/m |
| 定色 | sRGB 三通道均值的亮度、均色饱和 (max−min)/max、亮度标准差 | 按材质类范围 |

材质类（`toneClass`，数值以 JSON 为准）：`greyBrick` 青砖（冷灰、饱和 ≤ 0.10）、`rammedEarth` 夯土 / 土坯、`limePlaster` 石灰抹面、`roofTile` 小青瓦、`weatheredWood` 风化灰褐木（饱和 ≤ 0.30，不是橙黄新木）、`drySoil` 干土、`wetMud` 湿泥（暗、粗糙度 0.55 附近、暗处更光滑）、`stone` 石材、`fabric` 粗布麻袋、`wornSteel` 旧钢铁。目标贴近参考图的 1938 年 3 月鲁南阴天：低饱和冷灰棕。作者 UV 图集（刀、井台）不是平铺材质：`toneClass: null` + `toneReason`、`metersPerTile: null`，不查平铺与定色。

无缝方式（`--seamless`，预设给默认值）：

| 模式 | 做法 | 用于 |
|---|---|---|
| `blend` | 半图偏移 + 沿噪声等值线的交叉淡化，方差保持混合（同 `Script_BakeTerrainLayers`） | 土、泥、抹面、石、布这类无结构材质 |
| `courses` | 自相关找砖缝周期，从砖缝中心裁出整数层、拉回正方形（竖向形变 ≤ 一层），只焊左右边 | 青砖（生成图说「无缝」，上下边往往各切在半层上，焊边会糊出一层双高的砖——Lovart 试样实测） |
| `weld` | 只羽化四边 32 px（同 `Script_BakeTrenchPom`） | 瓦、木纹等源图已近似无缝的结构材质 |
| `none` | 不处理 | 源图已严格无缝 |

砖、瓦、木纹（`isotropic: false`）不做行列拉平（`rowFlatten`，会把砖缝抹平），也不查 `border` / `swing`（离边距离上的明暗本来就按砖层起伏）。`heightFromLuma: invert` 表示亮处是凹（石灰砖缝）。

## 5. 来源、许可、提示词

- `source.provider`：`lovart`（本轮用户指定，优先于仓库默认生图顺序）、`imagegen`、`jimeng`、`polyhaven`、`cc0`、`sourcePack`（第三方素材包 / 模型源包，许可写 `license`）、`user`、`procedural`。
- 生成类（lovart / imagegen / jimeng）：`prompt` 必填（`_import/Prompts/Texture_<Name>.txt` 或已有文档路径），Lovart 还要 `ref` = thread id；下载类要 `license` + `ref`；程序生成写脚本。门禁核对提示词文件存在、`_import/Prompts` 与 `_import/TextureBakes` 里没有孤儿。
- Lovart：每张图新开 thread（不带 `--thread-id`），`PYTHONUTF8=1`，长提示词写文件；`pending_confirmation` 一律不自动确认；402 / 2012 停止并报告；`generation_succeeded: false` 视为失败。alpha 素材不信生成器的透明通道：画在纯色（品红 / 纯黑）背景上自己抠。
- 贴图提示词模板（英文给生成器，按材质改 `{…}`）：

```text
Generate ONE square image, 2048x2048. Use case: production game PBR albedo texture (base color only).
A strictly front-on (or top-down) orthographic photographic texture scan of a {N} metre by {N} metre patch of {material},
in a rural village near Tengxian, southern Shandong, North China, March 1938, overcast early spring. {细节：尺寸、成分、风化}.
Low saturation, {cool grey / grey-brown}, not orange. Lighting: completely flat, even, shadowless overcast diffuse light like a
delit photogrammetry albedo; no cast shadows, no directional sunlight, no specular highlights, no vignetting, no perspective,
no camera tilt. Uniform overall brightness with no large stains, gradients or dominant single features, because the texture
will be tiled many times. The image must tile seamlessly left-right and top-bottom{, brick courses continue across the edges}.
No text, no labels, no borders, no frames, no objects, no people.
```

## 6. 两级加载与体积预算

线上 Pages 约 0.5 MB/s。每个清单条目有 `tier`：

| tier | 谁在下 | 预算 |
|---|---|---|
| `boot` | `Script_Main.PBR_SETS`，开机就下 | 14 MB 总额由 `Script_BootPayloadTest` 管，**已近满额**；门禁核对 tier=boot 的文件 = PBR_SETS 的文件 |
| `level:<LevelId>` | 该关建场时下（第一关 = `FirstLevel`） | 新贴图走 `Data_LevelTextureSets`：每套 ≤ 1 MB、每关按需集合计 ≤ `LEVEL_TEXTURE_BUDGET_BYTES`（第一关 6 MB）；整层（含地形、壕沟等历史按需图）另有上限 `TEXTURE_BUDGETS.tierBytes` |
| `lazy` | 首次用到时（外部道具专属 PBR、军装细节、GLB 外链） | 整层上限 |
| `fx` / `ui` / `editor` | 特效系统 / HUD 与菜单 CSS / 工作台 | 整层上限 |
| `offline` | 运行时不请求（离线输入、说明、搁置资产） | 只算全目录总额 |

**新贴图默认进关卡按需集**，不进 PBR_SETS：

```js
// Data_LevelTextureSets.mjs
FirstLevel: Object.freeze([
  { name: "VillageGreyBrick", v: "20260928", fallback: "BrickWall" },            // Base + Normal + Orm
  { name: "VillageTimber", v: "20260928", pack: "none", ormFrom: "WoodBeam", fallback: "WoodBeam" },  // 只有 Base + Normal
]),

// 建场处（例：Script_FirstLevelWhiteboxField.PrepareAssets 开头，造任何网格之前）
const report = await this.library.LoadLevelSets("FirstLevel");   // 永不 reject；report.failed 里是退回了的套
const brick = this.library.Get("VillageGreyBrick", { repeat: [4, 2] });
```

加载器（`Script_LevelTextureSets.LoadLevelTextureSets`）复用 `LoadExternalSet` / `LoadExternalBaseNormal`：每套独立 30 s 超时、独立失败；失败时保留同名程序化配方（`Script_TexBake.RECIPES`），没有就把 `fallback` 那套借给这个名字；同一 library 同名套只下一次；只换 `library.baked` 的纹理，所以**必须在建网格之前 await**。它是动态 import 的，开机模块图与现有贴图的加载时机都不变。

缓存戳：每个运行时 URL 都要带 `?v=`（改图就改戳，否则线上玩家拿到缓存旧图）。按需集的 URL 由 `LevelTextureSetUrls` 统一拼戳；门禁扫描运行时源码里的贴图字面量，没带戳的只能是冻结名单里的历史条目（只许变短）。改浏览器模块照旧 bump `index.html` 的 `?v=`。

体积账：非 legacy 的 `material` / `terrainLayer` 一套（Base + Normal + Orm）≤ 1 MB、单张 ≤ 600 KB；特效单张 ≤ 1 MB；超了写 `budgetReason`（抬预算是决定，不是手续）。

## 7. 新增流程（细则）

1. **生成**：按 §5 写提示词文件 `_import/Prompts/Texture_<Name>.txt`，Lovart 生一张，源图落 `_shots/Gap3A_Source/<Package>/`。
2. **烘焙**：`Script_BakePbrTexture.py --dry-run` 试参数、看预览（3×3 平铺 | 左上打光 | 法线 | Orm）；满意后正式烘，产物进 `Texture/`，烘焙记录进 `_import/TextureBakes/`。`--rebake <记录>` 可在源图还在时原样重烘；`--audit` 给已有的一套补记录（不烘）。
3. **登记**：贴烘焙脚本打印的条目骨架，补 `source.ref`（thread id）、`consumers`（文件 + 文件里真的出现的 token）、`tier`；按需集再加 `Data_LevelTextureSets` 条目。
4. **消费**：`await library.LoadLevelSets(levelId)` 后 `library.Get(name, …)`；材质补丁只走 `Script_MaterialPatches`，每个材质变体 sampler ≤ 16（`Script_SamplerBudgetTest`）。
5. **测试**：`Script_TextureStandardsTest`、`--changed` quick、相关系统的浏览器门，看像素（「visible 不等于看得见」）。

## 8. 清单字段

见 `Data_TextureManifest.mjs` 文件头（字段含义、通道表、类别、层级、来源、预算常量都在那里，本文不复制）。

## 9. 门禁（`Script_TextureStandardsTest.mjs`）

1. 磁盘 ↔ 清单一一对应（没登记的、登记了却不存在的都红），文件头尺寸 = 登记尺寸；
2. 命名 / 格式 / 2 的幂 / 尺寸上限 / 套件完整（有 Base 必有 Normal + Orm|Orh，或 `ormFrom` / `albedoOnly`——legacy 也查）；
3. 非 legacy：来源与提示词、消费方文件里真的出现 token、PBR 套的烘焙记录（sha256 = 磁盘、平铺与定色指标过门槛）；
4. 体积：每套 / 单张 / 各层 / 全目录；
5. tier=boot = PBR_SETS；按需集的文件、戳、预算、可退回材质，以及加载器行为（替身 library）；
6. 运行时贴图 URL 指向的文件存在；无戳 URL 只能是冻结名单里的；
7. **legacy 名单冻结在测试文件里，只许变短**：新条目不许挂 legacy；某套规范化了就从 `LEGACY_IDS` 删掉。

登记在 `Script_TestRunner` 的 quick 档（tier0Fast）与 `textureAssets` 域；`Texture/**`、清单、`_import/Script_BakePbrTexture.py`（唯一不被 `--changed` 忽略的 .py）、预设、烘焙记录、按需集都会选中它。

## 10. 2026-09-28 首轮规范化记录

- **删除（零引用，全仓扫代码 / 文档 / GLB-glTF JSON / 模板拼名确认）44 个**：ORM 拆出来的 `…Metallic` / `…Roughness.webp` 30 张（`BuildWeaponPbr.py` 不再导出）、V2 之前的 `WeaponSteel` / `WeaponWood` 6 张、`GroundBase` / `GroundNormal`（`Ground` 套运行时用 MissionSoil，只剩 Orm 被 PloughedSoil 借用）、已退役的 `BattleSmokeAtlas.png`、`mudLayer` 改 TrenchPom 后无消费方的 `TrenchMud{Base,Normal,Orh}`（`Script_ImportTrenchMaterials.py --mud` 可重建）、运行时从未读过的 `LugouqiaoMetalOrm` / `WoodOrm.png`。
- **转 WebP 14 个**（21.4 MB → 4.1 MB）：菜单插画 7 张、`HudCriticalBlood`、`Icon_GrenadeWarning`、`TrenchRootMat`、`BloodSplatterCc0`（运行时只采 A，A 逐位不变）、`MissionSoilOrm`、`Type89Orm`、`ExplosionFire_01`（无损）。新 URL 都带戳；开机贴图 13.92 → 13.77 MB；第一关不再下 2.3 MB 的根毯 PNG。
- **挪出 `Texture/`**：`TrenchPom` 两张生成源图 → `_import/Source/TrenchPom/`。
- **legacy（57 套，理由逐条写在清单）**：来源 / 提示词未入库的 2026-08 imagegen 批次、非 2 的幂（弹痕图集、落点准星、血迹、根毯、手榴弹）、GLB 外链 JPEG（乡村房屋）、Blender 管线写 JPEG / PNG（卢沟桥武器、壕沟泥面遮罩）、超预算（城墙芯、TrenchPom）、搁置章节纸品、OxCart 离线输入、`Texture/` 里的两个生成脚本等。
- **阶段 B 值得先看的问题**（本轮只登记、不改观感）：
  - `TrenchStone` 的法线是 Poly Haven `nor_gl`（gl 约定）却进了 terrain 约定的数组，绿通道方向相反；它的 `Orm` B 是金属（0）却被当高度用。
  - 均色饱和偏高、与「低饱和冷灰棕」不符：`TrenchPom` 0.53、`WoodCrate` 0.58、`CityWallCore` 0.58、`Adobe` 0.51、`Sandbag` 0.45、`WeaponWoodV2` 0.51。
  - `RuralHouse` 的 Normal 存成 JPEG（有损法线，单张最大 840 KB），也没有 ORM。
  - 47 处运行时贴图 URL 没有 `?v=` 戳（名单在门禁里，只许变短），其中军装布细节 `Data_Tuning_Materials.NRA_CLOTH_DETAIL.texture` 是本轮点名的一处。

## 11. 验收入口

```powershell
node Taierzhuang1938/Script_TextureStandardsTest.mjs            # 规范门禁
node Taierzhuang1938/Script_BootPayloadTest.mjs                 # 开机贴图 14 MB
node Taierzhuang1938/Script_TerrainLayersTest.mjs               # 地形层
node Taierzhuang1938/Script_SamplerBudgetTest.mjs --only=firstLevel   # 新材质变体的 sampler（浏览器）
```
