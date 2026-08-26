# 样条道路系统（铁路 / 道路 / 大街的唯一铺路口径）

2026-08-27 上线。此前全项目的「路」是六份互抄的一次性实现、七种数据形态；
现收拢为一条管线，所有道路类几何只从这里出。

## 管线

```
中心线控制点 [[x,z],...]
  → Script_RoadPath.MakeRoadPath        向心 Catmull-Rom（两点退化为直线，逐位同旧走向）
  → GapsToRuns / SampleRun              缺口先挖后分段、等弧长采样（不留尾巴）
  → Script_RoadSpline.*                 连续条带网格，逐顶点贴 groundAt
      BuildRoadRibbon                   路面（顶面 + 两侧裙边 + 可选路基碰撞）
      BuildRailBed                      道砟堤（梯形断面扫掠，台阶/低隆两种碰撞）
      BuildRailTrack                    枕木 + 双轨（钢轨按弦分节，道口连续）
      MakeCrownProfile                  轨面高程（平滑 + 对地面夹持）
```

## 谁在用（调用点清单）

| 对象 | 数据（未改格式） | 调用点 |
|---|---|---|
| 城内 19 条街 | `Data_Tengxian.STREETS` | `TengxianCity.BuildStreets` |
| 东关巷路 3 条 | `EAST_SUBURB.mapLanes` | `TengxianCity`（东关段） |
| 东关外大车道 | `EAST_FIELD.roadZ` | `TengxianCity.BuildEastApproach` |
| 西关大街 | `WEST_SUBURB.westStreet` | `Script_Landmark_Division122.RoadRibbon`（薄壳） |
| 北关大街 | `NORTH_SUBURB.street` | `Script_Landmark_NorthSuburb.RoadRibbon`（薄壳） |
| L0/L1 大车路 | `OUTFIELD_SCENES[*].roads.points` | `TengxianOutfield.BuildRoads` |
| 铁路（野外 1.35 m 堤） | `OUTFIELD_SCENES[*].railway` | `TengxianOutfield.BuildRailway` |
| 铁路（车站 0.46 m 低基） | `WEST_SUBURB.railway` | `Script_Landmark_Station.BuildRailway` |

数据故意**没有**集中成一张新路表：STREETS 的轴对齐格式被多个纯 Node 测试锁死，
outfield 的 points 折线本来就是控制点。样条层只负责解释这些数据。

## 硬账（从旧实现继承的血债，已写死在共享层）

- **碰撞盒长 = 采样步长（4 m）**：北关大街在 NorthMission 垫地过渡带上，
  10.5 m 一盒时两盒之间 0.79 m 直坎（> autostep 0.55）卡人。
- **缺口先挖后分段**：段心落在道口里就跳过的写法，会在道口两侧留下半段长豁口。
- **绕向不许手写**：每条带按第一格叉积 vs 期望朝向自动定向（写反一次，
  整条西关大街被背面剔除，实拍只剩车辙浮在田里）。
- **Blocked() 按样条实走的线判**：90° 拐角、百米边长时样条离弦 ~5 m，
  按控制点折线判走廊会让麦垄长上路面（`RoadPathFor(road).dense`）。
- 铁路缺口按世界坐标给（道口在 z=c），用 `path.ClosestS` 换算弧长；
  直线下 s = z - fromZ 逐位相同。
- 城内街照旧不避弹坑：`GroundHeight` 城内是解析平地（弹坑只在网格上），
  玩家踩的是解析地面，街面跟着弹坑凹下去反而会让脚穿出路面。
- NavGrid 两档：野外高堤走四级台阶碰撞（AI 能翻），城关低基碰撞顶只压
  地面 +0.34（贴高了导航沿轨线出随机断点）。
- **自动断水**（2026-08-27 第二轮）：`BuildRoadRibbon.cutWhere(x,z)` 谓词，
  按「中心 + 两路肩」三点判（濠沿在瓮城处是斜线，中心在岸上时路肩已悬在
  水上——图证：西门吊桥旁一整片路裙垂进濠里），判中的连续段扩 `cutMargin`
  挖成缺口。城侧口径 `TengxianCity.WaterAt`：濠槽内低于 MOAT.waterY(-1.6)
  + 荆河槽低于 -3.0（与 TengxianField.RIVER_SURFACE_Y 同数）。已接：城内街、
  东关巷路、东关外大车道（在荆河两岸自动收口）、西关/北关大街
  （host.WaterAt?.，编辑器平地替身没有就不剪）。**例外**：outfield 大车路
  不接 —— L0 那条按设计走浅滩渡口过界河，断水会把渡口剪断。

## 编辑器

设置面板（` 键）→「编辑器」→「道路样条」（`Script_EditorRoads.mjs`）：
按当前关卡列出全部路线，中心线 + 控制点 + **真几何预览**（调的就是上面那份
生成代码 + 宿主 groundAt，预览抬 0.02 m 盖在现路上）。选点/移动/插入/删除、
调宽、导出 JSON（每条带 source 说明誊回哪个文件哪个字段）。改动只存
localStorage —— **基线在源码里**，与采样点编辑器同一条纪律。
轴对齐来源（STREETS 等）拖弯后导出会带 warning：那些数据格式只有直线，
要么拉直、要么先改数据格式再誊。
预览叠在现路上：`polygonOffset(-4,-4)` + `depthWrite:false` + 抬 0.04 ——
没有 polygonOffset 时两层共面在中距离就互咬出锯齿条纹（实拍取证过）；
预览同样走 `WaterAt` 自动断水（宿主 WaterDepth 口径，桥面上不算水）。

## 回归

- `node Taierzhuang1938/Script_RoadPathTest.mjs`（纯 Node，tier0）：
  过点/弧长/切向/缺口/采样/最近点契约。
- 几何侧靠既有浏览器回归兜底：BootTest（七关开机 + 三角/draw call 红线）、
  ColliderTest、PlayTest、DressingProbeTest。
