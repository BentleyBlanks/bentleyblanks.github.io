# 样条围墙系统（沿线布墙的唯一口径）

2026-08-27 上线，与样条道路（`Data_RoadSpline.md`）同一套思路：此前「沿线布墙」
是四份互抄的一次性循环、三种贴地写法、三套缺口坐标系；现收拢为一条管线，
所有**独立线状围墙**只从这里出。渲染从「逐段 MakeBox 合并」改成 **InstancedMesh**。

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

| 对象 | 数据 | 调用点 | 风格 / tag |
|---|---|---|---|
| 东关寨墙 455 m | `Data_Tengxian.EAST_SUBURB.zhaiWall` | `TengxianCity`（东关段） | rammedEarth / zhaiWall |
| 北关坝墙 660 m | `Data_Tengxian.NORTH_SUBURB.stockade` | `Script_Landmark_NorthSuburb.Stockade` | rammedEarth / zhaiWall |
| 石墙村圩墙 | `OUTFIELD_SCENES[*].villages[*].stoneWall`（矩形+外扩 8 m） | `TengxianOutfield.BuildVillages` | dryStone / villageStoneWall |
| 村院墙 | 村布局推得（闭环矩形 + 南门缺口） | `TengxianOutfield.AddVillageCourtyard` | yardAdobe·yardBrick / villageCourtyard |

数据故意没有集中成一张新墙表（与道路同一条纪律）：zhaiWall/stockade 的
轴对齐格式、村矩形都保持原样，样条层只负责解释。

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
- **城内街坊院墙**（WallRing/GapWall 一族）：数据是街坊格子不是线，城内是
  解析平地（无贴地需求），且接着 masonry 破坏路（合并网格的 OBB 裁切）。
- **地标院墙**（各 Script_Landmark_* 的 AddYardWall 变体，至少 6 份近重复）：
  平地 + 工作包纪律，值得下一轮收拢到本管线（closed 矩形就是为它们留的）。
- **篱笆**（AddWattleFence）：LivedInProps 层，细杆件不值得上模块变体。

## 编辑器

设置面板（` 键）→「编辑器」→「**场景样条PCG**」（`Script_EditorSplines.mjs`，
原「道路样条」扩围墙后改名）：道路路线照旧；围墙路线（东关寨墙/北关坝墙/
石墙村）列在「围墙」一档，选中给**墙高**滑杆，预览调的就是上面那份
BuildWallSpline（变体/塌段/破口逐位一致），抬 0.04 + polygonOffset 盖在现墙上。
改动存 localStorage（新键 `tz1938.sceneSplines.v1`，认旧道路键迁移）；
**基线在源码里**，导出 JSON 誊回 source 指的文件。轴对齐/矩形来源拖弯会带警告。

## 回归

- `node Taierzhuang1938/Script_WallPlanTest.mjs`（纯 Node，tier0）：
  覆盖无洞/缺口真空/破口残根/贴地/闭环角互搭/塌段/掩体抽稀/确定性。
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
