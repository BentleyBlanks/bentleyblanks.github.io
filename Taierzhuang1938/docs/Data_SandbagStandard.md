# 沙袋标准：唯一模型、贴地与地形融合

2026-09-27 起全项目的沙袋只有一种画法。数据在 `Data_SandbagStandard.mjs`（纯数据），地形融合在 `Script_SandbagStandard.mjs`，门禁 `Script_SandbagStandardTest.mjs`（纯 Node）与 `Script_FirstLevelMissionFortificationsTest.mjs`（实机）。

## 1. 模型

- 只用 `Model_BattlefieldPack.glb` 里的三件沙袋：`battlefieldSandbag01/02/03`（ExternalProps 资产 id）。三件是同一种粗麻单袋，长约 1.9–2.0 m，靠缩放拼成各种袋墙。
- 不再用来表现沙袋的：`Script_Geo.MakeSandbag` 程序化椭圆袋、`Model_Sandbag.glb`（资产 id `sandbag`）、画了袋缝的白盒块、贴沙袋图的方盒子。`Script_SandbagStandardTest` 会拦：运行时代码调用 `MakeSandbag`（定义与调试探针页 `Script_Probe` 除外）、关卡摆 `asset: "sandbag"`、过场用 `kind: "box"` 摆土袋/街垒。
- 新写沙袋按场合选入口：

| 场合 | 入口 |
| --- | --- |
| 第一关有碰撞/掩体契约的体块 | 体块照常写进 Layout，id 登记进 `IsMissionSandbagBlock`（`Data_FirstLevelMissionFortifications`），外壳由标准模型分层填满 |
| 布景（无碰撞）的一段袋墙 | `SandbagRunPlacements`（开场 01–03 的洞内墙、沟沿压顶都走它） |
| 城区街垒 / 堵门 / 掩体 | `Script_World.AddBarricade / AddSandbagPlug / AddSandbagEmplacement`，底层自动带 `groundRow` |
| 手摆单件、PCG | ExternalProps 摆位 `asset: "battlefieldSandbag0N"`，不写 `y` 就自动贴地 |
| 过场道具 | `{ kind: "sandbag", size: [w,h,d], pos, ry }`，size 是占的盒子，高过 0.6 m 自动码成袋墙 |

## 2. 贴地

问题（用户截图，前沿右低壕北沿）：胸墙最底层按体块的一个点量底，沟沿、坡上的袋子底下是空的，能从缝里看到后面的东西；03 号袋子本身底面拱起，核心区袋底比包围盒底高约 22% 袋高，拉伸成胸墙后缝更大。

规则（`SANDBAG_GROUNDING`）：

- **按脚印采样**：袋子脚印（长、宽各取 80%）上 3×3 取样共享地面 `groundAt`。落地高度取最低点，但不比中位数低超过 `overhangToleranceM`（0.12 m）—— 坡上、坑洼里整只袋子压进土；横在沟沿上、一侧悬空的，按沟沿落地，悬出去的一角就悬着，不把整袋拽进沟里拉成长枕头。
- **袋底压进土 `embedM`（0.05 m）**，量的是袋底（`SANDBAG_METRICS.sole`，GLB 实测，门禁会从 GLB 重量），不是包围盒底。
- **只动最底层**：顶面不动、往下伸，上面几层照旧压在它上面，不开缝；下伸最多 `maxDropM`（0.45 m）；到上限的件测试单独列出。2026-09-27 实测第一关工事最底层 84 件：悬空 0、到上限 0。
- 有碰撞/掩体的体块外壳不变：顶面、四周贴着原外壳，底面只许往下伸（门禁按这个量）。

## 3. 地形融合

沙袋材质是地形混合的接收者，与壕沟碎石同一套（[壕沟表面](Data_TrenchSurface.md)「表面与接地」、[渲染管线](Data_TechRenderPipeline.md) `TerrainBlendPass`）：地形先画进两张材质缓冲，沙袋在光照前读同一像素。

- **核心带**（0.10 m，沿用 `Data_TrenchSurface.contact.blendWidthM`）：颜色、法线、粗糙度整换成下面那块地，金属度归零。预通道按同一 mask 改法线（`terrainBlendReceiver`）。
- **浮土带**（再往上 `dustBandM` 0.12 m，强度 0.35，上沿有世界噪声）：只把颜色往地面颜色拉，不改法线。
- `SandbagContactMaterial(源材质)`：按源材质缓存一份派生材质，补丁列表 = 源材质的补丁 + 融合补丁（排最后，写粗糙度与法线的是它）；多两只采样器：GI 开启时 `Sandbag_GroundContact` 正好 16（上限），`Script_SamplerBudgetTest --only=firstLevel` 全绿但没有余量 —— 再给沙袋材质加贴图前先腾位。ExternalProps 的克隆与实例化两条路、第一关工事、开场布景都经它。
- 没有地形缓冲的场景（旧城区关卡、编辑器、无浮点靶）补丁整段跳过，画面与未接入时相同，贴地只靠几何下沉。屏幕空间近似的局限同碎石：只混屏幕上可见的那块地。

## 4. 本次替换清单（2026-09-27）

| 位置 | 原来 | 现在 |
| --- | --- | --- |
| 第一关工事（IsMissionSandbagBlock） | 标准模型，最底层悬空 | 最底层贴地 + 融合 |
| 第一关 `GapLastCover`、`ObservationParapet`、`ReceptionSecondCover` | 蓝色白盒块（后者带袋缝） | 标准模型 |
| 第一关 `ReceptionGateSandbags`（15 门口） | 土色盒子 + 三道帆布条 | 标准模型（帆布条删除） |
| 第一关 `FieldRuin0/1` | 蓝盒子被通用规则画上袋缝 | 是残墙不是沙袋，不再画袋缝 |
| 开场 01–03 洞内墙、南沟沿、缺口西沿 | 程序化椭圆小袋 | `SandbagRunPlacements` |
| 旧城区手摆 6 件（CH1/CH5/CH6） | `Model_Sandbag.glb` | 标准模型（缩到 0.45 倍，原来那件约 0.84 m 长） |
| 城区街垒/堵门/掩体、布设、PCG | 标准模型，按中心点落地 | 脚印贴地 + 融合 |
| 过场《北门突围》六只土袋、《王铭章》三处 | 贴沙袋图的方盒子 | `kind: "sandbag"` |

没有换的（都不在正片关卡里出现）：`Model_TengxianConstructionKit.glb` 的城外防御组合里烘死的小袋子（该组合没有任何关卡摆放，只在编辑器构件库）、`_blender/Script_BuildGateDetailReference.py` 的参考模型、靶场 `?range=1` 射击台的沙袋色方块、`Script_Probe` 调试页。`Model_Sandbag.glb` 资产条目暂留在构件库里（标「旧 · 不再摆放」），删不删由用户定。
