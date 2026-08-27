# 样条围墙系统（全项目布墙的唯一口径）

2026-08-27 上线，与样条道路（`Data_RoadSpline.md`）同一套思路：此前「沿线布墙」
是四份互抄的一次性循环、三种贴地写法、三套缺口坐标系；现收拢为一条管线。
渲染从「逐段 MakeBox 合并」改成 **InstancedMesh**。

**同日第二轮（覆盖面扩张）**：又把**十一份**近重复的「一圈矩形院墙」实现
（城内街坊 / 机关 / 学校 / 庙 / 当铺 / 衙署 / 监狱 / 电灯厂 / 教堂…）连同
枣刺篱笆一并收进来，中间隔了一层 `Script_YardWall.AddYardWallRing`。
布设参数（间隔 / 重叠 / 抖动 / 变体 / 碱脚 / 压顶）集中成
`Script_WallSpline.WALL_PRESETS` 一张表，编辑器里能看能调。

## 三层

```
Script_WallPlan     纯数学摆位计划（Node 可测）
Script_WallSpline   几何 + 预设表 WALL_PRESETS + 实例化分桶
Script_YardWall     「一圈矩形院墙」这一种用法的门面（局部坐标 / 边 / 门洞 / 撞街）
```

调用点只说「我是哪一路墙」（`preset`）与「我自己的事」（尺寸、缺口、种子、
撞街判据）。间隔多大、重叠多少、抖几路、要不要碱脚压顶 —— 全部落在 WALL_PRESETS。

## 管线

```
中心线控制点 [[x,z],...]（围墙默认折线不平滑 —— 院墙要直角，不是圆角）
  → Script_WallPlan.PlanWallRoute     纯数学：缺口先挖后分段 → 闭环按角切边
      → 逐模块贴地（两端+中心三点采地，底压最低点再埋 embed）
      → 六路随机（见下）→ 输出矩阵表 + 碰撞/掩体表
  → Script_WallSpline.BuildWallSpline 几何：按风格烘 variants 份模块变体
      → 模块按「变体 × 分区」分桶 → sink.props（kind:"wallInstances"）
      → 碰撞/掩体照旧 sink.Solid / sink.Cover（碰撞不实例化）
  → FlushWallInstances                宿主收尾：桶 → MakeInstanced → scene
      （城：TengxianCity.FlushProps；城外：TengxianOutfield 合批段）
```

## 谁在用（调用点清单）

线状墙（直接调 `BuildWallSpline`）：

| 对象 | 数据 | 调用点 | preset / tag |
|---|---|---|---|
| 东关寨墙 455 m | `Data_Tengxian.EAST_SUBURB.zhaiWall` | `TengxianCity`（东关段） | zhaiWall / zhaiWall |
| 北关坝墙 660 m | `Data_Tengxian.NORTH_SUBURB.stockade` | `Script_Landmark_NorthSuburb.Stockade` | stockade / zhaiWall |
| 石墙村圩墙 | `OUTFIELD_SCENES[*].villages[*].stoneWall`（矩形+外扩 8 m） | `TengxianOutfield.BuildVillages` | villageStone / villageStoneWall |
| 村院墙 | 村布局推得（闭环矩形 + 南门缺口） | `TengxianOutfield.AddVillageCourtyard` | villageCourtyard\* / villageCourtyard |
| 枣刺篱笆 | 调用点给中心 + 长度 + 沿线缺口 | `Script_LivedInProps.AddWattleFence`（北关 / 城内共 4 处） | wattleFence / fence |

一圈院墙（走 `Script_YardWall.AddYardWallRing`）：

| 对象 | 调用点 | preset |
|---|---|---|
| 城内街坊院墙（六种原型 + 一格两户，全城 ~500 户） | `Script_CityBlockKit.WallRing` | cityYardBrick · cityYardAdobe |
| 当铺高墙 4.2 m / 商会机关院 | `Script_Landmark_Commerce.AddYardWall` | landmarkYard |
| 第二区公所 / 祠堂 | `Script_Landmark_Misc.AddYardWall` | landmarkYard（临街一面才上压顶） |
| 西关通讯队 / 交易所等 | `Script_Landmark_WestSuburb.AddYardWall` | landmarkYard |
| 警备队 / 警察所 | `Script_Landmark_Garrison.AddOfficeYardWall` | landmarkYard |
| 师部 / 团部 / 营连驻地 | `Script_Landmark_Headquarters.Enclosure` | landmarkYard · cityYardAdobe |
| 教堂院墙 / 学校围墙 | `Script_Landmark_ChurchSchool` | landmarkYardPlain · landmarkYard |
| 三座街庙 / 文庙 | `Script_Landmark_Temple.AddTempleYard` | landmarkYard |
| 县衙一圈（南墙断于大门、东墙一道侧门） | `Script_Landmark_Yamen` | landmarkYard（南面）+ landmarkYardPlain |
| 监狱 / 看守所围墙 | `Script_Landmark_Prison` | prisonWall |
| 电灯厂厂墙 / 变电小院 | `Script_Landmark_PowerPlant` | landmarkYardPlain |

数据故意没有集中成一张新墙表（与道路同一条纪律）：zhaiWall/stockade 的
轴对齐格式、村矩形、地块 rect 都保持原样，样条层只负责解释。

## 布设参数表 WALL_PRESETS

`Script_WallSpline.WALL_PRESETS`：一处改，全城跟着改。每一项 = PlanWallRoute
的参数 + `style` / `plinth` / `cope` / `geoQuant*` / `sample`。调用点可逐条覆盖，
但覆盖的应该只有「这一条墙自己的事」（尺寸、缺口、种子、tag）。

两条定过的账，别再回头调：

- **cityBrick 一族 `variants: 1`。** 变体之间的差别只有顶四角各抬压
  `crest × height`，cityBrick 的 crest 是 0.012 —— 2.2 m 的墙上差 2.6 cm，
  读不出来；而每多一份变体就是「每分区每材质多一只 InstancedMesh」
  （城内实测 +120 draw call）。城内院墙的差别来自逐实例的 ruin / 高度包络 /
  tint，那几路一分钱 draw call 不花。土坯墙 crest 0.035，留两份。
- **`geoQuantH` / `geoQuantW` 对连续随机尺寸是必需项。** 几何缓存的键里带着
  墙高墙厚，而城内每格院子的墙高是 `2.15 + rnd()*0.3`。不量化 = 395 格各烘
  一套变体几何 = 1185 只几何 + 同样多的实例网格，实例化当场归零。量化后全城
  落进两三套，真实尺寸由 `syFix` / `szFix` 精确补回（差的只有顶檐起伏与护坡土
  那点比例）。

## 碱脚 / 压顶

各自一只实例网格（材质与墙身不同：条石 / 小青瓦），矩阵只吃「弦长 + 拼接
重叠」，**不吃墙身的高度缩放**（旧版合并几何时压顶会被拉成 1.4 倍厚的瓦条）。

- 碱脚坐在**地面**上 —— 墙身埋进土里那一截是画面，碱脚不跟着埋；塌段不给。
- 压顶跟着**每一块**自己的墙头落，塌段与破口残根（`visH < height × cope.minH`）
  不给。旧 AddWall 的做法是「整段 ruin ≥ 0.35 就全撤压顶」，于是残墙上要么
  一条不剩、要么整条悬着 —— 管线层面消掉了。

## 贴地口径

- 逐模块三点采地（两端 + 中心）：顶 = 中心地高 + 本模块高；底 = 三点最低 −
  `embed`（默认 0.5，北关坝墙的账：不埋半米相邻段高差在墙脚漏缝）。
- 碰撞盒照旧从中心地高起（埋土部分只是画面），盒长 = 模块弦长，带 ry。
- 掩体点按 `coverEvery` 抽稀（坝墙的账：一道 660 m 的墙逐段插会灌满 AI 掩体表）。

## 随机参数（减少重复感的六路，全部确定性、按弧长哈希取种）

1. **低频高度包络**：`heightCell`(18 m) 一档线性混合 ± `heightJitter`，
   逐模块再叠小抖 —— 土墙顶参差但不锯齿。
2. **几何变体**：每风格 `variants`(4) 份模块，顶部四角各自抬压（模块级
   「顶不平」）；实例逐个挑变体，天际线不再是直线。
3. **姿态抖动**：侧倾 `leanJitter` + 偏航 `yawJitter` + 横向错位 `sideJitter`
   （三合板围挡那一版的账：一条完美平面读不出「夯的土」）。
4. **塌段 / 破口**：`collapseChance` 塌段压扁摊宽（碰撞跟着矮、不给掩体）；
   `breaches` / `randomBreaches` 破口按 `0.10+0.90·t^1.5` 剖面塌成残根
   （残根不登记碰撞 —— 那是给人走的）；`edgeCollapseChance` 整边塌成瓦砾线
   （fallenRuns 交还调用方摆瓦砾，村院墙用）。
5. **逐实例色调**：`tintJitter` 亮度 ± 冷暖微差写进 `instanceColor`
   （r185 下 instanceColor 自动定义 USE_COLOR，材质不用开 vertexColors）。
6. **弧长哈希取种**：模块种子 = `seed:m{round(4s)}` —— 改缺口/调参不重掷整条墙。

## 渲染（实例化）的硬账

- 桶粒度 = **变体 × 分区**（`sectorKey` 传宿主的：城 150 m / 北关镜像 / 城外 380 m），
  分区不切的话一条 660 m 墙一只包围球，视锥剔除失效（BuildSink.SetSector 的账）。
- 实例化网格吃 GI 的唯一保证是 `Script_Materials.InjectIndirectLighting` 的
  USE_INSTANCING 分支（vGiWorldPos 重算）—— **只许用 library 出的共享材质**。
- 几何在每次建关时新烘（宿主 Dispose 会 dispose mesh.geometry，跨关缓存会被销毁）。
- **实例化材质不吃破口 OBB 裁切**（那是 `library.Static` 合并网格的通道）。
  围墙类 tag 的运行时破坏当前关着（`GAMEPLAY_DESTRUCTION_ENABLED=false`）；
  破坏预览编辑器里凿这些墙只掉碰撞不掉画面 —— 已知让步，真要开运行时破坏，
  要给 wallInstances 补「按碰撞盒把实例矩阵置零」的通道。

## 未迁移的墙（例外清单，别当成漏了）

- **内城城墙**（AddCityWall + 马面/角楼）：structural 不可破坏、两段式碰撞、
  建造期破口剖面、上城道联动 —— 是防御工事不是围墙，收益/风险不成比。
- **村落中景 / 远景档的院墙**（`Script_CityBlockKit.SimpleYardWall`）：那一档
  **一面墙就是一只盒子**（整段，不切片），合并进分区网格后 draw call 是 0。
  转成实例化反而变成每院十几只实例 + 每分区每材质一次 draw —— 方向是反的。
  远景的正解本来就是"少一点几何"，不是"同一件几何摆多次"。
- **房屋墙体**（AddRoomBlock / AdobeHouse / 车站外墙 / 值班房那一类）与
  **单堵特征墙**（影壁、照壁、布告墙、二门、夹道墙、监狱内部隔墙）：
  它们不是"沿线布"的东西 —— 门窗洞、椽头、屋面都压在同一面墙上，
  换成模块拼接只会把这些接口全部打断。`GapWall` / `AddWall` / `AddSlabWall`
  为这些留着。
- **`Script_World.AddCompound`**：编辑器可摆放构件清单里的"四合院"，
  与城内街坊那一套是两份实现。城内跑的是 CityBlockKit（已迁），
  AddCompound 只服务编辑器摆件，暂留。

## 覆盖面第二轮的实测账（2026-08-27）

`Script_BootTest` 七关，改造前 → 改造后：

| 关 | draw call | 三角 |
|---|---|---|
| L0 稽核 | 765 → **496** | 3198k → 2944k |
| L1 北沙河 | 913 → 955 | 3108k → 3026k |
| L2 东关 | 793 → 839 | 2371k → 2187k |
| L3 反击 | 710 → 770 | 1692k → 1604k |
| L4 城墙 | 1345 → 1488 | 3559k → 3421k |
| L5 十字街 | 1053 → 1199 | 3675k → 3511k |
| L6 北门 | 660 → 703 | 2162k → 2088k |

三角一律降 2—8%（城内几万只院墙盒子换成共享几何），draw call 在城内几关
涨 40—145（每分区每材质多出的那几只实例网格），最坏 1488，离红线 5000 还远；
L0 反而降了 269 —— 城外那一片篱笆与村院墙的碎件收敛得最多。

**这一档是刻意选的**：三角/顶点是显存与几何管线的账，draw call 是 CPU 提交的账，
本作现在卡在后者的余量比前者大得多（见 `taierzhuang-instancing-audit` 那轮实测）。
真要再压 draw call，先动的应该是"城内院墙有四种墙材"这件事，不是变体数。

## 编辑器

设置面板（` 键）→「编辑器」→「**场景样条PCG**」（`Script_EditorSplines.mjs`，
原「道路样条」扩围墙后改名）。三档：

**① 路线**（照旧）：道路/铁路/大街 + 三条线状围墙的控制点，拖点、加减点、
预览调的就是真的 BuildWallSpline（变体/塌段/破口逐位一致），抬 0.04 +
polygonOffset 盖在现墙上。

**② 拼接资产**：`MakeWallAssetSet` 把当前预设烘成**可以直接看的原始件**，
在场里摆一台：从左到右是变体模块（建城时实例化的就是这几只）、碱脚条、
压顶条，最后一组是按当前「模块间隔 / 拼接重叠」拼起来的三块 —— 缝和压茬
看这一组。地上一米一格的尺，不给刻度就没法把「重叠 3 cm」读成一个长度。
材质走 `ResolveTengxianMaterial`，是真材质不是示意色。

**③ 布设参数**：WALL_PRESETS 那张表的直接滑杆，分「拼接」（间隔 / 重叠 /
埋深 / 变体数 / 几何量化）与「随机」（六路抖动 + 塌段 + 掩体抽稀 + 碰撞并段）
两组。改动经 `SetWallPresetOverride` 推给管线 —— **预览与建城读同一份**，
退出面板重建关卡立刻看到，不用改源码。

改动存 localStorage（键 `tz1938.sceneSplines.v1`，预设改动放在 `__presets`
子键，认旧道路键迁移）；**基线在源码里**，导出 JSON 分 `routes` 与 `presets`
两节，各带 source 说明誊回哪里。轴对齐/矩形来源拖弯会带警告。

## 回归

- `node Taierzhuang1938/Script_WallPlanTest.mjs`（纯 Node，tier0）：
  覆盖无洞/缺口真空/破口残根/贴地/闭环角互搭/塌段/掩体抽稀/确定性/
  拼接重叠/残破咬口/碰撞并段。
- `node Taierzhuang1938/Script_ColliderTest.mjs`：**2026-08-27 修好了一处
  测试盲区** —— 它原来只读 `mesh.matrixWorld`，于是 InstancedMesh 的每一个
  实例都被算成"堆在原点"，一整片实例化的砖在它眼里等于不存在。城内院墙转
  样条 PCG 那一刻，几百道**画得好好的**院墙被判成隐形墙，才把这条挖出来。
  现在按 `instanceMatrix` 逐实例摊开，寨墙/坝墙/村墙/篱笆也第一次进了它的账。
- 几何与性能靠既有浏览器回归兜底：BootTest（draw call/三角红线）、
  ColliderTest、PlayTest、DressingProbeTest。
- 视觉：`Script_DressingShot.mjs` 拍东关寨墙（540,-65 一带）、北关坝墙
  （z=-560）、石墙村，与改造前对位看。

## 历史修正

- 旧 AddZhaiWall 的寨门缺口挖在局部 0（世界 z=0），门垛却砌在 zhaiGate.z=-65：
  门洞被墙封死、z=0 处反倒有个没名目的洞。缺口改世界坐标口径时已对齐
  （现在墙在 (540,-65) 断开、门垛贴地），东关的通行拓扑与旧版不同 —— 这是修复。
- 石墙村塌口从「整段消失」改成「压扁摊宽的石堆」：干垒墙塌了剩一线石堆，
  不是凭空少一截。
