# 第一关空间拓扑 · 2026-09-19 采用稿

> **2026-09-30（白盒 12–18 改造 R1a）：北沙河在铁路桥一带拓宽到 ~66 m、桥改三孔、南岸加高堤与沙滩，见 §2「拓宽河段」与「铁路桥」；
> 本页 §2 里原断面（28.4 m）的数值仍然有效——只是 x −140…−30 一段（及两端各 20 m 过渡）被替换了。**

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
| C | 桥头接运点、空袭、西沟（11–14） | 86 … 145 | `cartBoard` `cartHalt` `transferWall` |
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

### 拓宽河段 `RailBridgeReach`（2026-09-30，`MISSION_NORTH_RIVER.reaches[0]`）

用户：「最后的炸桥，连条河都没有，要桥干什么用」。概念图 18_1 / 18_3 的河宽在 60 m 以上、水面离岸顶只有一两米、
南岸是高堤 + 堤下沙滩、河上是多孔桁架桥。原来的 28.4 m 槽 + 槽底以上 1.2 m 的水面（比岸顶低约 3 m）从南岸射位
根本望不见水，所以铁路桥这一段改成下面的断面。**旧数值（28.4 m 河口 138.8…167.2、水在 z 153 槽底 +1.2、单孔桥）
在 x −140…−30 以内作废，以外不变**（浅滩 x=47、路桥 x=76 也不变）。

| 项 | 值 |
| --- | --- |
| 范围 | x ∈ [−140, −30] 全宽；**第二轮（2026-09-30）过渡拉长**：西端 65 m（x −205…−140，正好止于 `MISSION_BOUNDS.minX`）、东端 60 m（x −30…30，不碰浅滩插值带 x 34…60 与路桥 x 76），按 smoothstep(x) 把六个位置参数混回原断面（第一轮是各 20 m 的直角收口，从高空看像一个长方形水池） |
| 只往北拓宽 | 南岸自然地面位置不动：南沿 `shoreZ` 166（原 167.2）；北岸岸沿 `crestZ` 90（原 138.8），北移 ~49 m |
| 北岸陡坡 | `crestZ` 90 → `floorZ` 94.5，一条 smoothstep，峰值斜率 1.5·4.2/4.5 = **1.40 > tan52°**，人爬不上来 |
| 河底 | `floorZ` 94.5 → `dropZ` 156，深 4.2（水面下 2.95 m） |
| 水下陡坎 | `dropZ` 156 → `waterZ` 158.6，深从 4.2 收到 `waterCut` 1.15：斜率 1.5·3.05/2.6 = **1.76**，下得去上不来 |
| 南岸沙滩 | `waterZ` 158.6 → `shoreZ` 166，深 1.15 → 0：峰值斜率 0.23（13°），人走得上去 |
| 水面 | 相对南岸自然地面 **−1.25 m**（`waterRel`），水线 z0 ≈ 91.6（北）… z1 ≈ 158.3（南），宽 **66.7 m**，河心水深 2.95 m |
| 过渡 | 水位在两端按同一个权重从原低水位 −3.0 混到 −1.25；水线宽度同样混合，水面在 x 上连续 |
| 岸线起伏 `wander` | 北岸线（`crestZ`/`floorZ` 同量平移）与南水线（`dropZ`/`waterZ`/`shoreZ` 同量平移）各叠三个正弦（波长 110/63/41 m 与 95/57/43 m，确定性，只依赖 x）。包络在 **x −95…−60 恰好为 0**（铁路桥一带断面不变），向两侧 30 m smoothstep 长到 1。北岸只往南缩 0…9 m（岸沿绝不比 z 90 更靠北，北岸村子与土坎安全），南水线只往北缩 0…7 m（沙滩水线绝不比 z 158.3 更靠南，南堤脚不被吃掉）；起伏与过渡权重相乘，过渡带里随权重收回原断面。函数 `RiverReachOffsets(x, reach)` |
| 跟着岸线走的东西 | 空气墙（按断面「深度 1.05 / 0.9 m」现算）、芦苇（`RiverWaterAt` 水线外）、沙滩植被（`RiverReachAt` 的岸沿/沙滩南端）、水面块、南堤堤顶点表（堤顶 z = shoreZ + 7，点表在 `Data_FirstLevelWhiteboxTerrainRear`，`Script_FirstLevelWhiteboxTerrainTest` 断言与 `RiverReachAt` 一致）；北岸村子与土坎在北岸 z ≤ 84，岸线只往南缩，不受影响 |
| 铁路桥一带不变的验证 | x −95…−60 的 `RiverReachAt` / `RiverWaterAt` / `RiverCutAt`（z 40…200 每 0.25 m，90 381 点）与 a35a763e 逐位相同（`Object.is`），地形高度场与第一轮（6b159cfd）逐位相同 |

函数：`RiverReachAt(x)`（混合后的六个参数或 null）、`RiverCutAt`（全河槽下切深度，地形取 min 的接法不变）、
`RiverWaterAt(x)`（水面剖面 {level, z0, z1}，Layout 铺水面与芦苇、测试都读它）、`RiverReachWeight`。
`RiverProfileAt` 仍然只回原断面（含浅滩）参数，旧读者不受影响。

**除铁路桥外处处过不去**（原口径保留，但**实现方式变了**）：纸面口径是「岸坡斜率 > tan52°（Rapier 爬坡上限）」——拓宽段北岸 1.40、水下陡坎 1.76、原断面 1.97。
**实测这条口径拦不住真胶囊**：在 e080b510 基线上，把 Rapier 胶囊放进原 28 m 河槽，它 autostep + 贴地吸附把 smoothstep 岸坡（缓头缓尾）一节节爬掉，
从北岸一路走到南岸（1500 帧，y 回到 0）。所以拓宽段（含两端 20 m 过渡）靠**空气墙**（`tag:"airWall"`+`visual:false`，`Data_FirstLevelMissionLayout` 里 `BridgeShoreAirWall*` / `BridgeNorthBankAirWall*`，每 4 m 一段）：
南岸墙摆在沙滩上「深度到 1.05 m」处（离水线约 0.9 m）——沙滩可以走到水边（爆破手就在那儿），下不了水；北岸墙摆在岸沿外侧「深度到 0.9 m」的陡坡顶（岸沿以北约 1 m），下不去也就爬不上来。
铁路桥两侧：|x−桥轴|<3.4 不摆，桥面 x −79.7…−74.3 下面是净空不够的桥台/引桥/1 号墩，西侧那条 2 m 露天窄缝另补一段窄墙（x −80.75）。
墙只挡角色控制器，子弹与视线穿过。真胶囊实测（`Script_FirstLevelMissionTopologyBrowserTest` 的 shore 段）：从沙滩往北走停在 z≈161（水线南 ~0.9 m 处，过渡带停在岸坡顶），从北岸往南走停在岸沿。
原断面（x < −160 与 x > −10）仍是旧口径，没动。

**南堤**（白盒地形 `Data_FirstLevelWhiteboxTerrainRear` 的 `BridgeLeveeWest/East`）：堤顶 z≈173（核心 z 171.5…174.5）比自然地面高 **1.4 m**，
北坡 5.5 m 从沙滩南端 z 166 起爬（斜率 0.38）、南坡 5.5 m 落回自然地面；堤在铁路桥头断开
（西段止于 x −88，东段始于 x −64，缺口 x −82.5…−70.5 是路基 +0.62 的铁路与尾队的路，也是射位看河的缺口）。
Bridge18 框西缘 −100 → −148，堤沿河向西伸到 x −136。旧岸垄 `BridgeBankBerm*`（0.85 m）删除。

**南岸射位**（`bridgeCover` (−81,179.4)）：原来两道 1.3–1.45 m 的胸墙（离射位 1.4 m，把河挡在墙后）拆掉；缺口里只留一个土垄
`BridgeSouthMound`（(−81,177.7)，3.2×0.9 m，顶 = 射位地面 + 1.25 m）和两段零星沙袋 `BridgeSouthSandbagsWest/East`。
**蹲下（眼高 1.05）被土垄挡住，站起来（1.62）越得过它看见沙滩、河面和桥**（`Script_FirstLevelSpaceTest` 第 9 节）。
几何上「蹲姿被挡」与「蹲姿看得见近水」互斥（挡住水平线就挡住向下的线），所以蹲姿只能看见远半边水面与桥桁架，近处的水与沙滩要站起来看。

**对岸**：北岸整体北移 50 m —— 土坎 `BridgeNorthRidgeWest/East` 移到 z 82.2、`MISSION_PLACEMENT.bridge.rearColumn*`/`enemyRidge`、
`MISSION_TACTICS.BridgeNorth*` 同量平移。机枪位 `bridgeEnemy` 挪到桥轴西侧 (−84.5, 80.5)：南岸射位到它的连线整段在西桁架（x −79.95）以西，
不被三孔桥的桁架挡住（射位到机枪 99 m）。北岸 x −140…−100、z 40…90 是一小片村子（`NorthBankHouseA–D` + `WestFieldHouse`(−121,67) + 六棵枯树），
**x −100…−40、z 20…90 留空**给 R2 摆日军步坦部队的进场地与岸边阵地。

### 路桥 `MISSION_SOUTH_BRIDGE`（x=76）

甲板 `deck {x:76, z:153, w:8, d:32}`、`deckY 0.13`、`deckH 0.25`，桥面 z 137…169。
桥墩 `pierRows [72.8, 79.2]` × `pierZ [142,147,159,164]` 共 8 根。
gate：`TemporaryBridge`，消失信号 `MissionBridgeDestroyed`，`walkableId "TemporaryBridge"`；
残骸 `MissionBridgeWreck`（8.8×4.4×6）按同一信号出现。13 的第一轮航过炸的就是它。

### 铁路桥 `MISSION_RAIL_BRIDGE`（x=−77）

> **2026-09-30 起是三孔桥**（下表「新」列）；下面第二张表是旧单孔桥的历史数值，仅作对照（`deckHalfD 18`、`abutmentZ [140.5,165.5]`、`gapZ [137,169]` 全部作废）。
> `x`,`z` 现在是**被炸那一孔的中心**（z 148；旧值 153 是单孔桥心），`RailBridgeDeck`/桁架/直轨这 5 个带 signal 的完好件就是这一孔。

| 项 | 新（三孔） |
| --- | --- |
| 桥台 | 南桥台 z 165.5（坐在沙滩后的路基上）、北桥台 z 88（坐在北岸，`abutmentZ [88,165.5]`），仍是让开 x=−77 中线的翼墙 |
| 桥墩 | `piers`：1 号墩 z 160（**沙滩水边**，墩脚是沙地）、2 号墩 z 136、3 号墩 z 112（水里）；`pierW 3.4 × pierD 3.6`，永久实体（`RailBridgePier1..3`），顶在桥面下 |
| 三孔 | `spans`：SpanSouth 160→136（**要炸**，`RailBridgeDeck`，d 24，中心 148）、SpanMid 136→112、SpanNorth 112→86（含台后引道）；南引桥段 `approachSouth` 160→169；各孔 24 m，桁架 `trussH 2.4` |
| 永久件 | 另两孔与南引桥段的桥面（`RailBridgeSpanMidDeck`/`SpanNorthDeck`/`ApproachSouthDeck`，进 walkableSurfaces）、桁架、直轨都是永久体块，炸后仍在 |
| 断口 | `gapZ [86,169]`：道砟/枕木/钢轨样条在这一段断开；桥面分孔总长 83 m |
| 起爆 | 1 号墩药包 + 跨中药包；`blast {spanId:"SpanSouth", centerZ:148, pierChargeZ:160}`；`blastSafe` 离 `railBridge`（=被炸孔中心）54.1 m ≥ 40 |
| 完好 5 件 / 残骸 3 件 | 不变：`RailBridgeDeck`（可走面）、`RailBridgeTrussWest/East`、`RailBridgeRailWest/East` 带 signal；`RailBridgeWreckSpan/Truss/Stub` 带 appearSignal。残骸按新位置摆（Stub 挂在 2 号墩南面 z 137.5） |

旧单孔桥（历史）：

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
sideAlley(95.2,61)         wallPathStart(56,207)       wallPathEnd(16,220)
receptionGate(2,240)       railBridge(-77,148)*        bridgeNorthEnd(-77,86)*
bridgeSouthEnd(-77,170)    bridgeCover(-81,179.4)      bridgeEnemy(-84.5,80.5)*
blastSafe(-66,201)         marchOut(-62,232)           nightSpawn(-160,292)
northGateApproach(-160,318) northGate(-160,340)        gateInside(-160,352)
```

带 * 的三个 2026-09-30 河拓宽后的新值（原 railBridge(-77,153)、bridgeNorthEnd(-77,136)、bridgeEnemy(-68,130.5)）。

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
| `bridgeCrossing` | 6 | 164.0 | (−77,70) → (−62,232)（2026-09-30 起点北移 50 m、桥长 83 m；旧 114.0） |
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
| 侧巷 | 2026-09-27 起是 12 守线右手的东巷（[守来时路](Data_FirstLevelTransferCover20260927.md)）：净宽 5–9 m；两侧墙 ≥ 2.4；巷口机枪罩住出场路与桥头路；低墙东段打得到它、射口打不到 | 7.15 m |
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
