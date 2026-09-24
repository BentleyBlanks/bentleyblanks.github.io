# 第一关空间拓扑 · 2026-09-19 采用稿

> 2026-09-24：06–18建筑围合、遮挡和屋顶按[概念/拓扑白盒迭代](Data_FirstLevelWhitebox20260924.md)更新；本页锚点、路线和桥梁接口继续有效。

> 2026-09-22 更新：03–05 的当前空间、事件门和对白以 [新采用稿](Data_FirstLevelFrontSource20260922.md) 与 [白盒契约](Data_FirstLevelFrontTopology20260922.md) 为准；本文其他阶段继续有效。


> 01–03 已由 [2026.09.21 正文](Data_FirstLevelOpeningSource20260921.md) 和 [分镜重构](Data_OpeningStoryboards20260922.md) 覆盖。以下旧受困/双俘虏/掀架段落仅作历史；04–18 保留原口径。

需求来源：[Notion 2026.09.19 采用稿转录](Data_FirstLevelRebuildSource20260919.md)，接口冻结在[分包契约](Data_FirstLevelRebuild20260919Contract.md) §3 与 §8。
本页取代 [2026-09-14 空间与流程重构](Data_FirstLevelTopologySeptember14.md)。

**数字一律以代码为准**，下面每一条都标了出处。代码与契约对不上的地方集中在第 8 节，别照契约改代码。

坐标系：X 向东、Z 向南、Y 向上，单位米，原点是城中心十字街口。

---

## 1. 四个分区与整关范围

Z 一路向南单调递增，只有第 18 阶段回头向北过铁路桥。分区本身不是导出的数据，
只写在 `Script_FirstLevelMissionTopologyTest.mjs` 的 `ZONES` 表里（它按这张表核对锚点没有串区）：

| 区 | 内容 | z 范围 | 这一区的新锚点 |
| --- | --- | --- | --- |
| A | 掩蔽部、后交通壕、前沿、集结处（01–06） | −220 … −96 | `bunker` `bunkerDoor` `bunkerKilling` `bunkerRear` `rearCorner` `collection` |
| B | 村落主街、灶屋连屋、内院（07–10） | −30 … 46 | `litterHold` `streetBlock` `eastAlley` `streetRejoin` |
| C | 桥头接运点、空袭、西沟（11–14） | 86 … 145 | `cartBoard` `cartHalt` `sideAlley` |
| D | 桥南接收院、铁路桥、夜入北门（15–18） | 165 … 252 | `wallPathStart` `wallPathEnd` `receptionGate` `bridgeSouthEnd` `bridgeCover` `blastSafe` `marchOut` |

北沙河（z=153）夹在 C 的南界 145 与 D 的北界 165 之间。`railBridge`(z=153)、`bridgeNorthEnd`(z=136)、
`bridgeEnemy`(z=130.5) 三个锚点不在任何一区里 —— 它们就是那次回头向北。

整关范围 `MISSION_LAYOUT.bounds`（`Data_FirstLevelMissionLayout.mjs` 的 `MISSION_BOUNDS`）：

```
minX -205   maxX 137   minZ -232   maxZ 370
```

`MISSION_LAYOUT.ground` 与它同一个矩形（342 × 602，中心 (−34, 69)）。
z 已经从旧版的 743 收到 370（军列进站跑道下线）；**x 没收** —— 再收就削掉东西两道地形墙，
理由写在 `Data_FirstLevelMissionLayout.mjs` 文件头。

---

## 2. 北沙河与两座桥

### 北沙河 `MISSION_NORTH_RIVER`（`Data_FirstLevelMissionTopology.mjs`）

| 项 | 值 |
| --- | --- |
| `z` | 153 |
| `depth` | 4.2 |
| `floorHalfW` | 11（平槽底半宽） |
| `bankRun` | 3.2（岸坡水平进深） |
| 河面总宽 | 2×(11+3.2) = **28.4 m**，河口 z 138.8 … 167.2 |
| 岸坡斜率 | 1.5×4.2/3.2 ≈ 1.97（约 63°），超过 Rapier 的 52° 爬坡上限 |

所以河槽本身处处过不去，只有三处例外（`crossings`）：浅滩 `WestDitchFord`（x=47，半宽 13）、
路桥 `TemporaryBridge`（x=76，半宽 5）、铁路桥 `RailBridge`（x=−77，半宽 4）。

浅滩 `fords` 只有一条：`{ id:"WestDitchFord", x:47, halfW:8, blend:5, depth:1.05, floorHalfW:5, bankRun:7 }`。
浅滩坡度 1.5×1.05/7 = 0.225，人走得过去，车过不去。
中心放在 x=47 而不是撤离线实际过河的 x≈51.2，是为了让西侧下坡不踩在 4.2 m 的正坡上。

断面由 `RiverProfileAt(x)` / `RiverCutAt(x,z)` 算，地形侧在 `Data_FirstLevelMissionTerrain.mjs`
的 `MISSION_TERRAIN.rivers` 取 `min` 切进共享高度场。水面是示意体块（`semantic:"water"`、`solid:false`，
52 块），不参与碰撞。

### 路桥 `MISSION_SOUTH_BRIDGE`（x=76）

甲板 `deck {x:76, z:153, w:8, d:32}`、`deckY 0.13`、`deckH 0.25`，桥面 z 137…169。
桥墩 `pierRows [72.8, 79.2]` × `pierZ [142,147,159,164]` 共 8 根。
gate：`TemporaryBridge`，消失信号 `MissionBridgeDestroyed`，`walkableId "TemporaryBridge"`；
残骸 `MissionBridgeWreck`（8.8×4.4×6）按同一信号出现。13 的第一轮航过炸的就是它。

### 铁路桥 `MISSION_RAIL_BRIDGE`（x=−77）

| 项 | 值 |
| --- | --- |
| 桥面 | `deckHalfD 18` → z 135…171（跨过河口 138.8…167.2），`deckW 5.4`，`deckTopY 0.66`，`deckH 0.55` |
| 桁架 | `trussOffsetX 2.95`、`trussW 0.5`、`trussH 2.4` |
| 钢轨 | `railGaugeHalf 0.7175`（轨距 1.435，与 `MISSION_RAILWAY.gauge` 一致） |
| 断开段 | `gapZ [137, 169]`，进 `MISSION_RAILWAY` 时统一 `z+186` → `[323, 355]` |
| 桥台 | `abutmentZ [140.5, 165.5]`，`abutmentW 7`、`abutmentD 3` |
| 信号 | `RailBridgeDestroyed` |

- **完好 5 件**（带 `signal`，炸了就消失）：`RailBridgeDeck`（可走面）、`RailBridgeTrussWest/East`、`RailBridgeRailWest/East`。
- **残骸 3 件**（带 `appearSignal`，炸了才出现）：`RailBridgeWreckSpan`、`RailBridgeWreckTruss`、`RailBridgeWreckStub`（堵住北引道）。
- **桥台 4 件是普通体块不是 gate**：`RailBridgeAbutment{North|South}{West|East}`，炸完还在。做成翼墙、让开 x=−77 中线，否则净空判定会把它算成挡路。

---

## 3. 锚点

`MISSION_ANCHORS`（`Data_FirstLevelMissionLayout.mjs`）= 本地 13 键 + `MISSION_REAR_ANCHORS`(11) + `MISSION_STAGE_ANCHORS`(27)。

### 新建：`MISSION_STAGE_ANCHORS`（27 个，就是契约 §3 冻结的那 27 个）

```
bunker(-40,-123.4)         bunkerDoor(-40,-129.6)      bunkerKilling(-40,-131.9)
bunkerRear(-40,-119)       rearCorner(-42,-113)        collection(-37,-101)
streetBlock(76.65,15)      litterHold(66,-20)          eastAlley(88,11)
streetRejoin(77,34)        cartBoard(85.6,113)         cartHalt(76,135)
sideAlley(103,122)         wallPathStart(56,207)       wallPathEnd(16,220)
receptionGate(2,240)       railBridge(-77,153)         bridgeNorthEnd(-77,136)
bridgeSouthEnd(-77,170)    bridgeCover(-81,179.4)      bridgeEnemy(-68,130.5)
blastSafe(-66,201)         marchOut(-62,232)           nightSpawn(-160,292)
northGateApproach(-160,318) northGate(-160,340)        gateInside(-160,352)
```

### 沿用：`MISSION_REAR_ANCHORS`（11 个，在 `Data_FirstLevelMissionTopology.mjs`）

```
ditchMouth(53,114)  ditch(39,116)      retreatA(32,134)    retreatB(56,184)
retreatC(16,222)    reception(-6,231)  zhouPickup(-14,247) zhouDrop(-25,242)
finalCover(-35,247) rearExit(-44,244)  end(-61,192)
```

`retreatA` 比旧版的 z=140 北移 6 m —— 河槽现在切到 138.8…167.2，收拢点落在河岸上就等于落在沟壁里。

### 沿用：Layout 本地 13 个

```
front(0,-124)   orders(-34,-99)   gun(0,-128)        bundle   throw(30,-117)
village(55,-20) melee(58,6)       transferSupply(93,110)      forwardNest(-24,-130)
gate(53,34)     courtCover(67,24) transfer(95,103)   queue(74,111)
```

`orders` 已按契约迁到集结处 (−34,−99)，运行时统一用 `collection`。
旧的 `train` / `unload` 两个锚点已随军列下线（2026-09-19 第三波）。

接收院另有一张 `MISSION_RECEPTION_SPACE`：`bounds{−41…1, 218…252}`、`ward{−32…−20, 225…243}`、
`litterOrigin(−30,229)`、`walkerOrigin(−37,244.2)`、`entry(−13,240)`、`wardEntry(−26,240)`、
`wardExit(−26,247)`、`yardJunction(−13,249)`、`deathView(−26,243.6)`、`wardThreshold(−26,243)`。

---

## 4. 路线

`MISSION_ROUTES` = 本地 10 键 + `MISSION_REAR_ROUTES`(3) + `MISSION_STAGE_ROUTES`(11)。
长度用 `MissionRouteLength`（`Script_FirstLevelMissionColumn.mjs`）实算。

### 契约新线（`MISSION_STAGE_ROUTES`，11 条）

| 键 | 点数 | 长度 m | 首 → 末 |
| --- | --- | --- | --- |
| `rearTrench` | 9 | 71.9 | (−40,−119) → (6,−124) |
| `collectionReturn` | 8 | 86.6 | (30,−117) → (−37,−101) |
| `southWalk` | 8 | 135.4 | (−37,−101) → (48,−20) |
| `courtyardBypass` | 9 | 76.6 | (58,−9) → (77,34) |
| `cartRide` | 5 | 26.7 | (85.6,113) → (76,135) |
| `wallPath` | 7 | 74.4 | (56,207) → (2,240) |
| `toBridge` | 8 | 80.5 | (−41,244) → (−81,179.4) |
| `bridgeCrossing` | 6 | 114.0 | (−77,120) → (−62,232) |
| `bridgeWithdraw` | 4 | 27.1 | (−81,179.4) → (−66,201) |
| `marchOut` | 3 | 31.3 | (−66,201) → (−62,232) |
| `nightMarch` | 4 | 60.0 | (−160,292) → (−160,352) |

`MISSION_ROUTES.south` 与 `southWalk` 是同一个数组（不是两份拷贝）；
07 的目标时长 45–75 秒就是 135.4 m ÷ 2.2–2.6 m/s。

### 沿用的线

| 键 | 点数 | 长度 m | 谁在用 |
| --- | --- | --- | --- |
| `evacuation` | 13 | 210.1 | 14–15 的撤离线；尾段（index 6 起）就是 15B 夹道 |
| `reception` | 4 | 30.0 | `Column.StartReception/StartRetreat`、运行时老周入院 |
| `exit` | 9 | 84.9 | `Column.StartFinalExit`（见第 8 节） |
| `bundle` / `bundleReturn` | 16 / 13 | 182.5 / 148.0 | 05 取集束弹去程与返程 |
| `orders` / `ordersRejoin` | 8 / 20 | 86.6 / 234.6 | 05→06 回集结处 |
| `village` | 14 | 174.8 | 10 出内院接回主街再南下（内嵌 `courtyardBypass`） |
| `southTraffic` | 10 | 323.8 | 后方车流背景 |
| `flank` | 4 | 131.2 | `UpdateFlank()` 给带 `missionFlank` 的敌人走 |
| `support` | 7 | 124.5 | 03 接应线（运行时、带路、返程规则都在读） |
| `opening` | 9 | 123.1 | **没有人走了**，只剩几何按它让路 |

15A/15B/15C 另有三条走廊 `MISSION_REGROUP_CORRIDORS`：`Regroup`(= `evacuation` 前四点，落在 `retreatA`)、
`WallPath`(= `wallPath`，落在 `wallPathStart`)、`ReceptionGate`(= `wallPath` 末三点)。

---

## 5. scenario 三态与 gates

### 三态 `MISSION_SCENARIO`（线性；`SyncScenario` 取「最后一个信号已满足」的那一态）

| # | id | 信号 | 体块数 |
| --- | --- | --- | --- |
| 0 | `BunkerIntact` | 无（默认） | 12 |
| 1 | `BunkerCollapsed` | `BunkerCollapsed` | 19 |
| 2 | `NightGate` | `NightGateShown` | 34（= 19 + 夜景 15） |

- 共用壳 8 件：`BunkerWest/East` `BunkerFrontWest/East` `BunkerRearWest/East` `BunkerPartitionWest/East`。
- 完好独有 4 件：`BunkerDoorLintel` `BunkerRearLintel` `BunkerPartitionLintel` `BunkerRoof`。
- 坍塌独有 11 件，其中 `BunkerFrontLintel`（h=1.0）把前门压成 0–1.20 m 的低破口 —— 01 透过它看门外行刑。
- 夜景 15 件（`MISSION_NIGHT_GATE_BLOCK_IDS`）：两段城墙（h=9）、门洞过梁与门楼、瓮城五件、两段引道墙、4 盏火盆。门洞净宽 3.80 m。

**信号 → 事实** 只有三条，在 `Data_FirstLevelMissionGates.mjs` 的 `MISSION_SCENARIO_SIGNALS`：

```
BunkerCollapsed     → bunkerCollapsed        （01 近爆）
RailBridgeDestroyed → bridgeDestroyed        （18 炸桥）
NightGateShown      → nightArrivalPlaced     （18 黑屏里瞬移到夜景）
```

回跳或重试清掉事实时，空间自动退回上一态；名字与事实同名的信号（`MissionBridgeDestroyed`、
`MissionCourtyardGateOpen`）由 `Signalled` 直接按事实名查，不进这张表。

**为什么 scenario 体块不在 `MISSION_LAYOUT.blocks` 里**：一是坍塌与完好两套墙不能同时存在；
二是 gate 是「一块一个网格」，四十块就是四十个 draw call，而 scenario 走 `BuildSink` 合批，
切态只重建这一个 sink。

### gates（`MISSION_LAYOUT.gates`，11 件）

| 信号 | 件 |
| --- | --- |
| `MissionCourtyardGateOpen` | `MissionCourtyardGate`（10 的内院门） |
| `MissionBridgeDestroyed` | 消失 `TemporaryBridge`（连可走面）；出现 `MissionBridgeWreck` |
| `RailBridgeDestroyed` | 消失 5 件、出现 3 件（见第 2 节） |

可走面 `walkableSurfaces` 现在只剩两块桥面：`["TemporaryBridge", "RailBridgeDeck"]`。

---

## 6. `MISSION_PLACEMENT`

23 个顶层键。本轮新建 8 个（空间测试 §12 点名要求它们存在）：

| 键 | 里面有什么 |
| --- | --- |
| `bunker` | 01/02：玩家位与眼高、缴下的步枪、压住人的木架、两名川军与他们的步枪、两名日兵的起手/行刑/进门三个位 |
| `collection` | 06：4 副担架、5 名伤员、4 名搬运人员、老周靠的土壁、传令兵 |
| `streetBlock` | 08：人缝、街那头的两组人、担架停靠的三个位、东巷窗口射手 |
| `cartRide` | 12：车上三个**相对车体**的座位偏移（玩家 / 老周 / 赶车人） |
| `wallPath` | 15B：夹道上三名掉队的步行伤员 |
| `receptionYard` | 15C–17：院门守军 2、接收人员、军医、放担架的位置、下一副担架进来的入口 |
| `bridge` | 18：回援尾队三个成形位与三组编队、桥头军官、爆破两人位、班里两个掩护位、北岸土坎四个敌位 |
| `night` | 关尾夜景：8 人行军队列、4 人搬弹药箱、2 人分配防区、带路军人、4 盏火盆（与 `NightBrazier0–3` 一一对应） |

沿用的 15 个：`squadFrontPositions` `reliefApproach` `reliefPositions` `guardWithdrawalRoutes`
`kitchenInterior` `roomInterior` `ambushSquadPosts` `ambushYaowaPost` `ambushSquadEntry`
`ambushSquadRoute` `ambushSquadLanesM` `wardInterior` `tankStart` `tankTargets` `cartBays`。
（`ambush*` 那五个现在只用来摆 09 灶屋—连屋那一段的班组掩护位，屋内伏击拍本身已下线。
`cartBays` 本轮挪了位：旧的 (86,141)/(86,132) 落在河北坡与河口上。）

已下线：`stationCasualties`、`Layout.derailCar`（空间测试断言它们是 `undefined`）。

---

## 7. 空间验收

命令（从 worktree 根跑）：

```powershell
node Taierzhuang1938/Script_FirstLevelSpaceTest.mjs
node Taierzhuang1938/Script_FirstLevelMissionTopologyTest.mjs
node Taierzhuang1938/Script_FirstLevelMissionTest.mjs
node Taierzhuang1938/Script_FirstLevelMissionTopologyBrowserTest.mjs
```

`Script_FirstLevelSpaceTest.mjs` 的口径（常量在文件头：`CAPSULE_R = 0.35`，
= `MakeCharacter` 的 0.34 加余量；`TAN52` 对应 `setMaxSlopeClimbAngle(52°)`；
扫描步长 0.4 m、高度带 `y+0.3 … y+1.7`）：

| 段 | 断言 | 实测 |
| --- | --- | --- |
| 锚点 | 27 个契约锚点都不被埋（margin 0.34） | 通过 |
| 路线 | 11 条契约路线过 0.35 m 胶囊；`Routes[name]` 与 `StageRoutes[name]` 是同一个数组 | 通过 |
| 07 | `southWalk` 长度 110–140；担架队 1.25 m 宽也过得去 | 135.4 m |
| 01 | 掩蔽部 7×7 m；受困位到前墙 4.6 m、到行刑锚点 8.5 m；躺姿三档眼高（0.35/0.42/0.50）看得见四个人全身及门外 8 m、12 m；五条侧翼射线被门框或塌方遮住；步枪够不到（> 2.5 m） | 2.83 m |
| 06 | 背坡挡住前沿四个方向；`orders` 与 `collection` 相距 < 12 m；担架放得下 | 通过 |
| 08 | **主街人缝 0.72–1.0 m**：> 0.68（玩家过得去）、< 1.25（担架过不去）；障碍横跨整街；东窗看得见障碍以北的街 | **0.90 m** |
| 12 | 牛车盒（2.5×2.9、净高 2.2）过得去；`cartHalt.z < 138.8`（停在河北岸） | 135 |
| 15B | **夹道净宽 2.5–3.0 m**；北侧院墙 ≥ 2.7、南侧矮墙 1.0–1.3；一处直角左拐；一道坎 | 2.80 m，坎 0.22 m |
| 15C/16 | 院门净宽 ≥ 3.2（担架）；厢房门槛 0.12–0.18 且小于 `stepMax` | 4.00 m / 0.15 m |
| 18 | 五条视线（掩体↔桥面/敌、爆破区↔桥面、敌↔桥面/南桥头）全通；胸墙高 1.1–1.7（蹲姿断线）；**爆破安全距离 ≥ 40 m** | 49.2 m |
| 夜景 | 白天不存在（不在更早的态、不在 blocks、不在 gates）；城墙 8–10 m；门洞 3.6–4.2 m | 15 件、9 m、3.80 m |
| 北沙河 | 河宽 24–34；除浅滩与两桥外逐米扫过全都过不去；撤离线过河坡度 < tan52 | 28.4 m，最陡 0.53 |
| 侧巷 | 净宽 5–9 m；两侧墙 ≥ 2.4；巷口朝西四条视线全通 | 7.30 m |
| 军列下线 | 一条正则扫 blocks / gates / 三态体块；`walkableSurfaces` 恰是两块桥面；铁路只剩两段引道 | 通过 |
| bounds | maxZ 360–400、minZ −225…−245；每一件与每个锚点都在里面 | −232 / 370 |

**分态净空怎么扫**：`Solids(stateId)` = `MISSION_LAYOUT.blocks` 里的实心体块（剔掉 `solid:false`
与可走面）∪ 指定 scenario 态的实心体块。夜景四个锚点与 `nightMarch` 用 `NightGate` 态，
其余用 `BunkerCollapsed` 态。掩蔽部那一带另有三条**必经短路** × **三态**的闸在
`Script_FirstLevelMissionTest.mjs`：`BunkerExit`（玩家位 → 抬架中点 → `luoEntry` → `bunkerRear` → `rearTrench[1]`）、
`BunkerAssault`、`BunkerAssaultB`（`ijaStart → ijaKill → ijaDoor → bunkerDoor`），0.2 m 步长、
0.35 m 边距、`y+0.3 … y+1.7` 全扫。**新增必经短路要加进这张表**。

沟的两条尺寸不在空间测试里，在别处：全高沟深 ≥ 1.83 由 `Script_FirstLevelMissionTest.mjs`
与 `Script_TrenchPlanTest.mjs` 看着；沟底宽 3.24 是 `Script_TrenchPlan.mjs` 里推出来的下限，
交通壕实际取 `TRENCH_PRESETS.communication.floorW = 3.4`。样条壕沟的完整口径见
[壕沟样条 PCG](Data_TrenchSpline.md)。

---

## 8. 代码与契约对不上的地方

下面这些以代码为准，契约 §3/§8 还没改。

1. **掩蔽部已按实拍收小。** 契约最初写「前门低处破口能看清门外 8–12 m」，第一版把行刑锚点放到
   受困位 13.5 m 外，720p 下人物只有约 70 px。2026-09-20 演出打磨把掩蔽部收到 7×7 m，
   `bunkerKilling` 为 (−40,−131.9)：离受困位 8.5 m。纯 Node 已验证四个人全身与必经短路；
   130 px 的视觉目标仍须以 720p 实拍确认。
2. **`StreetBlocked` 不是信号。** 契约 §3 把它列进「信号（gate/scenario）」。代码里它只是一个
   对白 cue id；主街障碍（`StreetBlockFallenWall` / `StreetBlockCart` / `StreetBlockCartWheel`）
   是永久体块，不换态。
3. **`BunkerCollapsed` / `NightGateShown` 只是 scenario 信号，不是 gate id。**
   `Data_FirstLevelMissionGates.mjs` 的注释记着这个坑：`OpenGate("BunkerCollapsed")` 从来没生效过。
4. **沟深与沟底宽不在空间测试里**（见第 7 节末）。按契约去 `Script_FirstLevelSpaceTest` 找会扑空。
5. **契约 §3 的「沿用旧键」清单不全**：代码里还有 `forwardNest` `retreatB` `retreatC` `reception`
   `zhouPickup` `finalCover` `rearExit` `end` 八个键在用。
6. **已下线的步骤还留着活路线**：`Reception` 与 `Exit` 两个步骤按契约 §1 下线了，但
   `MISSION_ROUTES.reception` / `.exit` 仍被 `Script_FirstLevelMissionColumn.mjs` 与运行时消费
   （`StartReception` / `StartRetreat` / `StartFinalExit`）。
7. **浅滩中心与实际过河点差 4 m**：ford 中心 x=47，撤离线在 x≈51.2 过河（见第 2 节的理由）。
8. **x 方向的 bounds 没收**：契约说第二波「下线军列几何并收缩 bounds」，实际只收了 z。
