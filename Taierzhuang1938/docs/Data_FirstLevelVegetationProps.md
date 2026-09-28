# 第一关道具换模型、碎砖瓦与植被（2026-09-28 起）

「对标 3A 画面」迭代的 B6 包：白盒里平色的箱 / 筐 / 缸 / 柴垛 / 草垛 / 车轮换成现成外部模型，墙根与倒墙脚下的散块换成低模碎砖瓦，
地面长出冬末干草簇、枯杂草、低矮荆棘灌木、河岸芦苇与零星绿芽。**只换「看起来」**：碰撞盒、掩体、路线、交互点、任务门一概不动。

## 1 入口与接线

| 系统 | 数据 / 规则（纯 Node） | 运行时 | 门禁 |
| --- | --- | --- | --- |
| 道具换模型 | `Data_FirstLevelPropDressing.mjs` 的 `PROP_DRESSING`、`FitPropToBox`、`PlanPropDressing` | `Script_FirstLevelPropDressing.mjs` | `Script_FirstLevelPropDressingTest.mjs` |
| 碎砖瓦 | 同上 `PROP_RUBBLE`、`PlanRubbleScatter` | 同上 | 同上 |
| 植被 | `Data_FirstLevelVegetation.mjs` 的 `VEGETATION`、`VEGETATION_CARDS`、`VEGETATION_QUALITY`、`PlanFirstLevelVegetation` | `Script_FirstLevelVegetation.mjs` | `Script_FirstLevelVegetationTest.mjs` |
| 植被图集 | `_import/Script_BakeVegetationAtlas.py`（烘焙记录 `_import/TextureBakes/Texture_FirstLevelVegetationAtlas.json`，提示词 `_import/Prompts/Texture_FirstLevelVegetationAtlas.txt`） | `Texture/Texture_FirstLevelVegetationAtlas.webp`（清单 `Data_TextureManifest` 的 `FirstLevelVegetationAtlas`：decal / Base 带 A / `level:FirstLevel`） | 同上（卡片表与记录一致、2 的幂、≤ 600 KB、URL 带戳）＋ `Script_TextureStandardsTest.mjs` |

接线只在 `Script_FirstLevelWhiteboxField.mjs` 几行：`PrepareAssets` 里（仅 `layout.fortifications` 的正式第一关）并行预载模型与图集；
`BuildWhiteBoxes` 里紧跟 `AddMissionFortifications`：`AddFirstLevelPropDressing` 往同一只 `BuildSink` 加几何，`new FirstLevelVegetation` 建植被，
两者返回的「不再画的块 id」并进 fortifications 的 `replaced`，原块照旧登记 `Solid` / `Cover`。`Dispose` 里释放植被与图集。
撒点的共同上下文（路线、锚点、弹坑、壕沟走廊、地表层、河）是 `MissionDressingContext(layout, groundAt)`。

## 2 道具换模型

- 替换表逐块写「块 id → 资产」，`hide` 是同一件道具的附属平色件（缸沿、柴垛顶三根木、草垛中 / 顶两层、物资箱铁箍），外观按并集盒算；
  `tile: [nw, nh, nd]` 把大盒按块自身 w/h/d 轴切格，每格一件（一整垛柴、一摞箱），不把一件模型拉成三米长。
- 配法 `FitPropToBox`：候选「原样 / 绕 Y 转 90°」（`roll` 先把模型放倒，平躺的车轮用），逐轴缩放到盒子，再按几何平均把压扁 / 拉长收进
  `maxStretch`，取变形最小的朝向。车轮允许把 0.54 m 的轮毂轴压到白盒的 0.12 m 圆片（`maxStretch` 3.2）。
- 贴地：盒底在地面 0.2 m 以内的，按并集脚印四角 + 中心取最低地面再压进土 3 cm（`PROP_GROUND`）；架在别的东西上的（车上的筐、摞着的箱）按盒底放。
- 调色 `PROP_MATERIAL_TINT`：只作用于本模块克隆的材质（键 `PropDressingMaterial_<uuid>`，随场地释放），木箱去橙、陶缸压成深褐灰、柳条褪色；
  没调色的库共享材质用 `MissionDefenseMaterial_<uuid>` 键，场地 `Dispose` 当共享件跳过。
- 合批：192 m 分区（`PROP_DRESSING_SECTOR_M`），每区每材质一个 draw（道具材质约 8 种，村子只落在一两区；64 m 一区时同页开关实测本包在村里多出 130 多个 draw）。网格名仍归 `FirstLevelWhitebox_StaticWhiteBoxes`，
  所以 `Script_FirstLevelFrontBreakables.TakeOverStatic` 塌块时同一处的模型顶点一起塌。
- 没换的（有意）：灶台、锅、炕、车身 / 车板（`StreetBlockCart`、`*CartBed`，只换了车轮）、担架摞（`visual:false`）、带标签的领枪 / 领弹箱
  （`missionRoute` 语义）与物资箱 `MISSION_SUPPLIES` 本身。

## 3 碎砖瓦

- 白盒 `RubbleStrip` / `Bats` 的散块（不实心、非掩体、脚印 ≤ 1.3 m、高 ≤ 0.45 m、id 命中 `Rubble|Foot|Bats|Chips|Spill|Brick|Stone`）整只换掉，
  按面积在原脚印里撒砖 / 半砖 / 瓦片 / 石块；残墙、倒墙（id 命中 `Ruin|RubbleWall|Fallen|Obstacle…`）脚下 1.1 m 带、完好房身 / 院墙脚下 0.7 m 带稀疏补撒；
  地形表 `steps` 里半径 ≥ 1 m 的坑沿撒石块。
- 纯视觉、不登记碰撞；单件高 ≤ 0.25 m；补撒的离路线 0.9 m、锚点 1.6 m 以外（换掉的散块在原位，本来就在那儿）。
- 几何是削角扁盒 / 扰动二十面体，按区预先并好（位置 / 法线 / 三平面米制 UV / 顶点色）一份交给 BuildSink（它自己的合并会丢顶点色）；
  材质 `Stone` 的克隆 + 顶点色（`FirstLevelRubble`）。碎块自己一只 BuildSink、**不投影**（比鞋小的碎块在三级阴影里各画一遍只是白费三角形），网格交给场地的 `meshes` 统一释放。

## 4 植被

- **图集**：Lovart（nano_banana_pro）生成一张 2048² 品红底 8 格植物卡（提示词 `_shots/Gap3A_Source/B6/Prompt_VegetationAtlas_v2.txt`，thread
  `a97e84e9-d6af-432d-9fcd-44e7d3347a58`；第一次 thread `d5ea5e4a-dfe3-4eba-a9c6-08a0e8e5ab9c` 被后端自作主张去了背景、填成剪影，废弃）。
  `Script_BakeVegetationAtlas.py` 按品红度键出 alpha、去溢色、粉紫压成米灰并降饱和（参考图的低饱和冷灰棕），每张卡按紧包围盒预乘 alpha
  缩进 256×512 格（根在格底），透明区推色防 mip 黑边。卡片的 UV / 宽高比 / 真实高度照抄烘焙脚本打印的表进 `VEGETATION_CARDS`。
- **撒点**（`PlanFirstLevelVegetation`，确定性、格子哈希种子）：1.6 m 抖动网格，每个命中的格子长一簇 2–5 张同种卡。
  - 不进：路线走廊 1.3 m、锚点 / 交互点 2.4 m、实体块脚印、屋顶下、水面与河槽底、壕沟沟底与沟壁、`steps` 坑、路面（`track` 层 > 0.3）；
    路面 / 场坪上只在墙脚 0.9 m 一窄条长，或离路线 ≥ 4 m 处稀疏长。
  - 长在：墙根（最密）、壕沟沟沿外 2.4 m、河岸（北沙河两岸，避开浅滩与两座桥）、路肩、田里（麦茬层给底子）；路线两侧 10 m 以内最密，22 m 外线性淡到很稀，70 m 外不撒。
  - 视线门槛：高于 0.6 m 的卡（枯蒿、荆棘、灌木、芦苇）只在河岸、墙根（离路线 ≥ 3 m）或离所有路线 ≥ 9 m；路边 3 m 内任何卡都压到 0.58 m 以下；
    锚点 6 m 内只长 0.3 m 以下的矮草；壕沟沟沿只长 ≤ 0.3 m 的矮草（人在沟里眼睛就在沿上方几十厘米）；01–06 前沿交战区（z < −95）墙根以外 ≤ 0.4 m。
  - 原 25 个平色 `foliage` 盒（河边芦苇、路边灌木、坎上草丛）由植被在原位按盒子尺寸长出同类植物接管。
  - 超过画质上限时按每件自带的随机数**均匀**抽稀（不按扫描顺序截断）。
- **合批与距离**：64 m 分区，每区所有卡片烘成一份静态几何（两张交叉面片、正反面各自建三角形），一区一个 draw；每区一只 `THREE.LOD`：
  近档全部、远档只留 ≥ 0.4 m 的卡、再远不画，由渲染器投影时自己切（主循环没有每帧代码）。半径与上限按画质 `VEGETATION_QUALITY`。
- **着色**：`library.Plain` 克隆 + 图集 map + `alphaTest 0.42` + 顶点色（亮度 / 冷暖抖动、根部压暗当接触 AO）+ 整体暖草黄调色 `VEGETATION_TINT`；
  法线 0.75 朝上 + 0.25 面朝向，明暗跟地面走。只有 ultra（主靶 4× MSAA）开 alpha-to-coverage。不投影。
- **MotionVector**：静态几何 + 静态世界矩阵 = 规范里「既有静态合批路径」，预通道自动写相机速度；AlphaTest + map 的 UV0 裁切由预通道覆盖材质逐 draw 接入，
  两边轮廓一致。**不做风摆**：自定义顶点位移不在预通道覆盖材质里，主场景摆、预通道不摆会让深度 / 法线 / 速度三张图对不上（规范明确禁止用于近景）。
  以后要风摆，先给预通道补顶点补丁通路与上一帧时间，再加。

## 5 旋钮

全部在两张 Data 表：密度 / 禁区 / 视线门槛 / 簇大小 `VEGETATION`，画质分档 `VEGETATION_QUALITY`，调色 `VEGETATION_TINT`；
替换表 `PROP_DRESSING`、配法容差 `PROP_FIT_TOLERANCE`、贴地 `PROP_GROUND`、调色 `PROP_MATERIAL_TINT`、碎砖瓦 `PROP_RUBBLE`。
改卡片图：重跑烘焙脚本 → 照抄打印的卡片表 → 改 `VEGETATION_ATLAS.bytes` 与 URL 的 `?v=` 戳（清单条目的 sha256 由门禁对烘焙记录核）。

## 6 门禁与验收

- `Script_FirstLevelPropDressingTest.mjs`（纯 Node）：表里的块都在、不重复、不碰交互件；资产登记在 `Script_ExternalProps`；
  按 GLB 实测尺寸配盒，外观与碰撞盒逐轴误差 ≤ max(30 %, 0.12 m)、压扁拉长 ≤ `maxStretch`；碎砖瓦确定、件数 / 高度上限、不进路线与锚点、只换不实心散块。
- `Script_FirstLevelVegetationTest.mjs`（纯 Node）：确定性、各档上限、均匀抽稀、全部禁区与视线门槛、25 个 foliage 盒被接管、图集与烘焙记录一致。
- 两者在 `Script_TestRunner` 的 `tier0Fast` 与 `firstLevelDressing` 域（改动路径命中 `FirstLevel(PropDressing|Vegetation)` / 烘焙脚本 / 白盒场地时自动选中）。
- 视觉对照：`Script_FirstLevelWhitebox0518Shots.mjs --quality=high --no-maps --no-top --only=07_1,07_2,08_1,08_2,10_1,11_1,11_2,13_1,13_2,17_1,18_1`。

## 6.5 性能取证（2026-09-28，同机多会话争用下）

- 量法：`?whitebox=p012&quality=high`，按 0518 机位摆相机，给本包的网格挂 `onBeforeRender` 计数，逐趟数真实 draw（预通道 / 主场景 / `shadowMap`）。
  **不要用「把本包藏起来再放出来」的整帧差**：藏一下会把这些网格踢出阴影静态合批（`Script_ShadowCasterBatch`，冷却 240 帧），
  差值里混着别的网格的重排，实测会高估两三倍。帧时在争用下抖 ±10 ms 以上，只报 draw / 三角形。
- 08_1（村里主街）：本包在预通道与主场景各 24 个 draw（道具 18 + 植被 6），阴影趟 0（道具影子已进静态投影合批）；
  64 m 一区时同一机位要多一倍。建场：植被撒点 + 烘几何约 0.2–0.4 s、道具 + 碎砖瓦约 0.05–0.1 s（争用下测，单独跑会更短）。
- 常驻：道具约 6.1 万三角（约 150 件），碎砖瓦约 2.3 万三角（1800 件，不投影），植被约 3 万件 × 8 三角分在 54 个 64 m 区里，
  近档一般 3–4 区、远档 8–10 区在画。

## 6.6 第二轮（2026-09-28，集成后主会话点名）

- **草垛**：`ryHayStack` 从纯色 `VillageStraw`（橙黄多面体）换成 Lovart 秸秆平铺 `HaystackStraw`（thread `5bd6317f-3d31-4ea4-838a-a3f86e22ee03`，
  提示词 `_import/Prompts/Texture_HaystackStraw.txt`，`Script_BakePbrTexture --preset fabric --tile-m 1.5 --mean 0.47,0.43,0.355 --contrast 0.085 --row-flatten on`），
  走第一关按需集（`Data_LevelTextureSets.FirstLevel`，fallback Sandbag），并把低模的硬边法线按同位置顶点平均（`smoothNormals`），读成圆的一垛。
- **木箱 / 市场箱**：换 B5 的 `OpeningCrate`（灰褐旧板箱），不再是新木的橙色。两条都在 `PROP_MATERIAL_OVERRIDE`。
- **担架**：`Script_StretcherAsset` 读 GLB 顶点色时按 `Data_Tuning_Materials.STRETCHER_COLOR_GRADE` 去饱和（饱和度 × 0.5、亮度 × 0.82、略压蓝），
  全游戏唯一的竹竿担架从亮黄变成旧竹的灰黄，布兜变灰褐。
- **08 障碍**：`StreetBlockCart` 的平色盒换成撤运牛车（`Script_DraftCartModel` 的 GLB，关里本来就下，不多下载）的静态几何，
  去掉左轮、朝缺轮一侧歪 14°（`PROP_SPECIAL_ASSETS.evacCartWreck`、`rollDeg`）；八块碎土坡 `StreetObstacleRubble0–7` 换成城墙缺口包的残砖簇（整件换成灰褐 GroundRubble，不要城砖 / 夯土的橙红）。
  碰撞仍是原盒。
- **植被加密**：网格 1.6 → 1.25 m、簇 3–6 张、墙根带 1.6 m、路肩 / 路边 / 河岸概率全面上调，高档约 8.3 万件（上限 9 万）；
  新增「低矮灌木丛」（离路线 11–48 m、前沿以北、一丛 5–8 张、≤ 0.62 m）与「坎上」矮草（土坎肩 / 坡脚平台顶面，≤ 0.22 m）；
  簇成员逐个复核实体 / 沟 / 坑 / 路面禁区（`MemberClear`）；芦苇顶点色压暗（`VEGETATION_CARDS` 的 `shade`）。视线门槛与通行禁区不变。

- **代价（交替 A/B，集成 tip 9ad460bf vs 本轮，各 3 次取中位，high，同机争用）**：整帧三角形 07_2 +13 万（+4.1%）、08_1 +16 万（+3.1%）、
  13_1 +11 万（+3.4%）、18_1 +17 万（+2.7%，6.69 M，红线 8.1 M 以内）；draw call 0 ～ +19（植被仍是一区一个 draw，残骸车 5 种材质
  + 残砖簇合进同区）；帧时差在噪声内（两边中位数谁高谁低不一致）；植被建场 0.2–0.3 s → 0.45–0.8 s（高档约 8.3 万件）。

## 7 遗留

- 灶台、锅、其余车板（`*CartBed`）仍是平色盒；08 的倒墙本身（`StreetBlockFallenWall`）归 B1 的墙体材质。
- 田坎（地形上的埂）没有专门的撒点规则，只吃「田里底子」那一档。
- 风摆（见 §4 MotionVector）；远档切换是整区跳变，没有逐件淡出。
- 图集只有漫反射 + alpha，没有法线 / 透光。
