# 第一关 01–06 空间（2026-09-23 重排，现行）

本册是第一关 01–06 空间的**唯一现行口径**：坐标、路线、关键帧、敌我布设、战车路、可破坏掩体与静态验收。它取代 [2026-09-22 前沿白盒](Data_FirstLevelFrontTopology20260922.md) 的空间部分（那一册的流程叙述仍可参考）。需求来源：[01–02 新稿](Data_FirstLevelOpeningSource20260923.md)、[03–05 正文](Data_FirstLevelFrontSource20260922.md)、[拓扑参考](Data_FirstLevelTopologySource20260923.md)；分包契约见 [01–05 重构契约](Data_FirstLevel0105Refactor20260923Contract.md) §2 第 5/6/8 条与 §4。

这版来自三方比稿（A 战斗空间优先 / B 关键帧优先 / C 系统优先），两位评审合计 A 胜；最终实现以 A 的布局为底，嫁接了 B、C 的做法并修掉评审点名的缺陷（§11）。

**所有「看得见 / 看不见 / 打得到 / 走得通」都由数据表实算**：共享地面采样器 `SampleMissionTerrain` + `MISSION_LAYOUT.blocks`（01–02 另加 `BunkerCollapsed` 场景态）+ 铁丝网实心包络，视线每 0.1 m 采样，胶囊半径 0.35 m、爬坡上限 52°。量尺是 `Script_FirstLevelSpaceProbe.mjs`，阈值钉在 `Script_FirstLevelFrontTopologyTest.mjs`。本文的数字都是那把尺子量出来的（2026-09-23，分支 `claude/l1r-space-20260923`）。

- 俯视图：`Taierzhuang1938/_shots/Space0106/Map_New0106.png`（`_shots` 不进仓库，重画命令见 §12：`Script_FirstLevelSpaceMap.mjs`）。
- 引擎实拍：同目录 `K1.png … K11.png`、`TOP.png`（自由相机，机位取自关键帧表）。

---

## 0. 结论

- K1–K11（外加 K1i 完好态、K2b 还权位）静态视线全部成立；K3 观察射台一个画面（76°）看全 8 名守军、缺口、冒火的阵位机枪口和阵位山墙。
- 战车：起点视线外 → 路堑里只露炮塔（88 m）→ 北残院挡住 33 m 路程 → 驶出路弯 → 在 31 m 外压阵位 → 停在土坎线以北 7.5 m 封缺口；最后 21 m 路程炮口一直看得到缺口（42/42 采样），车体 5.75×2.18 m 全程不碰任何体块和铁丝网。
- 48 条路线（玩家、队友、守军撤退、全部敌人移动线）胶囊净空零碰撞、坡度可爬。
- 62 个敌人初始位置（含侧翼组、跃进组的末线与护兵槽）全部有掩体或在沟里；侧翼组末线四人都看得见缺口。
- 预算：01–05 累计 49 人（上限 55）；04/05 最坏同时存活 27/30（上限 30）。增援、04 推进和补员都从视线外进场。
- 01 日军进场通道离仍在开火的守军/老周最近 31.4 m，30 m 内互相看不见；取弹沟离守军背坡 37.7 m，去掉缺口后背坡与后方沟网不连通。

---

## 1. 设计：先定火力，再定地形

**一条防线的火力逻辑。** 前沿是一道东西向土坎（高度函数，顶线 z=−160，满高 x −30…12，x=−34 与 16 处归零，高 2.1 m）。它挡不住侧射，所以两端各一挺机枪交叉：西端**老周左枪**（−33.6,−156.4）顺着土坎北侧往东打正面跃进线；东端**右侧阵位**（残墙院，x 24…37、z −145.6…−156.8）既往西封缺口，又覆盖土坎东端外侧和道路。

**「东头丢了」= 东端阵位被日军夺了，交叉火力断了一半。** 于是日军的阵位机枪反过来封缺口；侧翼组能沿东侧弹坑摸到土坎东端、绕过端头看见缺口；先头兵从阵位后侧的连接口沿连接支沟进入我方交通壕（01 的来路），主力转进纵深支沟南下。03 夺回阵位 = 恢复交叉火力；04 战车冲着这个东端来，停在土坎线以北同时压阵位、封缺口；05 的攻击支路就是先头兵下来的那条连接支沟的上段——玩家沿敌人的来路打回去。

**三条方向。** 敌在北与东北（30 多米纵深的弹坑田，田北是 3 m 高的坡地，火力基地在坡上；东北是道路，从坡顶路堑下来）；我在南与西南（后交通壕、集结处、支沟都在土坎以南 20–60 m）；路在东。

**地标。** 路边电线杆（每 26 m 一根，南路岔口一根斜杆）、阵位院东山墙（顶 5.4 m，射台上 64 m 外看得见剪影）、北残院（战车路弯的遮挡物）、旧院枯树（7 m）与院门、土坎东端的弹坑群、后交通壕折角 RC 的木框（两柱一梁，梁高 2.2 m）。

**为什么整条前线北移 6 m。** 旧土坎在 z=−154、守军背坡沟在 −148，任何放在集结处与前线之间的 01 交通壕都落在守军背后 30 m 以内（旧版 9–15 m）。北移后 01 交通壕到守军 31 m 以上、互不可见；03 的纵深从 45 m 加到 51 m，放得下观察射台、缺口支沟和折角安全区。07 以后坐标一个不动（集结处、`southWalk`、`southTraffic` 原样，07 南行净空复测通过）。

---

## 2. 要素坐标（X 东、Z 南，米；深度为低于自然地面）

数据落点：`Data_FirstLevelFrontRoute`（`FRONT_SORTIE` 旧键全保留、只换坐标；新要素在 `FRONT_SPACE`、`FRONT_TANK_PATH`）、`Data_FirstLevelMissionTopology`（锚点与 01–02 沟线）、`Data_FirstLevelMissionTrenches`（21 段沟）、`Data_FirstLevelMissionTerrain`（土坎函数与 steps）、`Data_FirstLevelMissionLayout`（体块、摆位）、`Data_FirstLevelMissionFront`（名册、掩体行、breaches、授权射击点）。

### 2.1 01–02 前沿交通壕与防炮洞

| 要素 | 坐标 / 形状 | 说明 |
| --- | --- | --- |
| 前沿交通壕 `BunkerTrench` | SJ(−29,−110) → (−17,−111) → RC(−4,−113) → (−1,−118.5) → 弯 M(3,−124.4) → J(14,−124.6)，深 2.0、底宽 3.4 | 西段即后交通壕 |
| 防炮洞 | 坑心 (−0.4,−125.9) r1.9、深 2.0；洞口短沟 `BunkerMouth` (−0.8,−126)→(2.6,−124.9)；顶板 `BunkerRoof`；南侧木护壁；门柱与过梁 | 挖在弯 M 外侧壁上，洞口朝东，正对东西向那段沟 |
| 顺子受困位 `bunker` | (−1.3,−126.2)，躺姿眼高 0.42 | K1；压梁 `BunkerBeamPinWest/East` (−2.6,−125.4)/(−1.2,−127.5)，下垂顶板在腿上方 (−2.45,−126.2)，抬走压梁后站立胶囊在原位不卡 |
| 汉阳造 `bunker.rifle` | (0.1,−125.7)，离受困位 1.45 m | `rifleMouth` (1.4,−125.6) 是 01「枪托半埋」的道具位建议 |
| 杀俘位 `bunkerKilling` K | (6.5,−123.6) | 离受困位 8.2 m |
| 岔口 J `bunkerJunction` | (14,−124.6) | 连接支沟（东北）与纵深支沟（南）在此汇入 |
| 前方折角 F `bunkerFold` | (18.2,−125.6) | 连接支沟第一折（射击台阶），离杀俘位 11.9 m |
| 连接支沟 `BunkerFrontSap` | J → F → (23.5,−130) → (27,−135.5) → RJ(29.7,−141.5) | 01 先头兵、02 追兵来路；上段接阵位后墙岔口 |
| 纵深支沟 `BunkerDepthSap` | J → (15.2,−118.5) → (17.5,−111) → (20.5,−102) | 先头兵主力南下出视野，玩家不走 |
| 洞口塌土（塌方态） | `BunkerMouthSpoil` (1.5,−122.6) 1.4×1.4，带碰撞 | 还权位 `bunkerRear` (−0.2,−122.2) 在它西侧，J、F 都打不到（K2b） |
| 沟壁塌低段 | 近失弹坑 step (2.8,−120.4) r1.7，沟底抬到 1.05 m | 弯 M 内侧角；02 撤出还权位后短暂暴露给 F |
| 后交通壕折角 RC `rearCorner` | (−4,−113)，木框 `RearCornerFrameA/B` + `RearCornerLintel` | 罗班长出现处（K2）；03 何有田守西口 |
| 支沟交汇 SJ `supportJunction` | (−29,−110) | 02 途经、03 转入支沟 |
| 06 集结处 | (−37,−101) 不变 | 02 终点 = 03 起点 |

02 撤退 `rearTrench`：还权位 → (−1,−118.5) → RC → SJ → (−33,−106) → 集结处，**47.3 m**。RC→SJ 是沿后交通壕沟底的一条直腿（x=−17 处离中心线 0.4 m），这样前四点正好止于 SJ（`FrontEntryRoute` 取 `rearTrench.slice(0,4)` 接 03 路线）。

罗班长与何有田的来路 `bunker.rescueRoute`：RC → (−1,−118.5) → (1.2,−120.2) → (3.0,−121.3) → (4.4,−122.8) → 杀俘位，从塌土东侧（弹坑那边）绕过去，塌方态净空通过。

### 2.2 03 接近、观察射台、守军背坡

| 要素 | 坐标 / 形状 | 说明 |
| --- | --- | --- |
| 支沟 `SupportSap` | SJ → (−30,−118) → P2(−26.5,−126) → P3(−20.4,−126.8) → 折角 P4(−19.2,−133.2) → (−10.4,−134.2) → (−9.4,−138.6) → GJ(−8,−140.6)，深 2.0 | 锯齿走向，每段离阵位/战车火力轴 ≥25°；蹲姿全程零暴露 |
| 观察射台 OS | 短岔 `ObservationSpur` (−23.4,−126.5)→(−23.2,−129.4) 深 0.95；机位 (−23.2,−129.2) | 离 SJ 17 m；K3 |
| 安全区 `guardSafeZone` | (−21.6,−126.6)，守军沿 P3→P2 段排开 | 阵位、侧翼组末线、全部战车路点都看不见 |
| 守军刮沟 `GuardBackslope` | (−27.2,−156.4)→(4.5,−156.2)，深 0.55 | 土坎南坡脚，北面被土坎挡死、南面（射台）看得见；西头 `ScrapeWestTraverse` 土横墙封住，守军只能走缺口 |
| 守军 8 人 `FRONT_GUARD_POSTS` | (−11,−156.3) (−5,−156.3) 第一批；(−14.5,−156.4) (−1.5,−156.3) (−18,−156.4) (2,−156.2) (−22,−156.5) (−26,−156.5) | 缺口以东的人绕到最后遮挡南侧再进缺口 |
| 最后遮挡 `lastCover` | (−8,−155.2)；沙袋墩 `GapLastCover` (−6.2,−154.2) | 挡东面（阵位、战车） |
| 唯一缺口 `gap` | (−8,−150)，缺口支沟 `GuardWithdrawal` 在此塌浅到 0.5 m | 背坡铁丝网 `BackslopeWire0–5` 堵死缺口以东；整条带斜 0.073 rad（东头往北 1.4 m），让开机枪座看缺口的那条线（铁丝网的桩和线在运行时挡射线） |
| 右侧低沟 `RightApproach` | GJ → (0,−141.6) → (7,−143.5) → (13,−144.2) → (19,−146.8) → (22.2,−149.6) → 西门，**深 1.85** | 蹲着、站着走都不被阵位看见；折角处 `RightApproachTraverse`（顶在自然地面 +0.55 的土横墙）挡住阵位机枪顺沟的视线 |
| 射击踏台 `FRONT_FIRE_STEPS` | (1.5,−143.4)、(14.9,−146.4)，r1.4，沟底抬到 1.05 m，离行走中线 1.3 m | 站上去：前者看得到侧翼组末线四人（16–24 m），后者还看得到阵位机枪手（10 m）；蹲在踏台上阵位的人看不见你 |
| 老周左枪位 | 座 (−33.6,−156.4)、枪 (−33.8,−157.6)、胸墙朝东北 | 土坎西端外侧，沿土坎北侧侧射 |
| 左枪通道 `LeftGunAccess` | P2 → (−31,−136) → (−34,−147) → 座 | 何有田接枪、老周下撤（`FRONT_SORTIE.zhouExit`，61.8 m 到 zhouRest） |

03 接近 `support`：集结处 → SJ → 支沟 → GJ → 右低沟 → 西门 → 机枪座，**96.7 m**，没有一段直腿超过 10 m。

### 2.3 右侧阵位与后墙岔口

| 要素 | 坐标 | 说明 |
| --- | --- | --- |
| 院落 | x 24…37，z −145.6…−156.8，院内下挖 0.5 | 土坎东端外侧、道路西段以南 |
| 正面胸墙（可破坏） | `RightNestWestLow`（顶 +1.25）、`RightNestNorthLow`（+1.2）、`RightNestNorthHigh`（+2.3） | 低墙让机枪从缺口（西）转到正面（北）再到道路（东北） |
| 西门 | x=24，z −148.8…−151.8 | 03 从这里突入；`RightNestWestHigh` 在门南 |
| 东山墙（地标，不可破坏） | `RightNestEastGable` + `RightNestGablePeak`（到 +5.4） | |
| 后墙（不可破坏）与后门 | `RightNestRearWest/East`，门 x 28.8…30.6 | 04 短撤 `rearRoute` 13.8 m |
| 机枪 / 座 / 班长位 | `nest` (24.9,−153.9) / `seat` (25.9,−153.9) / `leaderCover` (24.75,−151.1)；枪架体块沿用 09.22 的 id `RightNestFrontRest`（驱动器按它量「枪架在枪下」） | 班长在西门内侧，离枪 2.8 m（夺点半径 4 − 到达 1）、离座 3.0 m；蹲着从门口打得到缺口 |
| 院内遮挡 | `RightNestRubble`（31.2,−149.4，0.8×1.0，顶 +1.1）、`RightEntryCrate`、`RightNestBaffle` | 碎砖堆在东侧守卫身前 2 m，只挡他到西门的线，他到机枪座的线从堆北边 0.3 m 过去（夺枪的人能收拾院子）；挡板挡护兵越过低墙的视线 |
| 后墙岔口 RJ `rear` | (29.7,−141.5) | 连接支沟、取弹沟、攻击支路在此汇合；K7 机位 (29.7,−144.4)；连接口守卫 `RightLinkGuard` 在后门内侧 (31.8,−146.7) 守它（放在墙外时西门和机枪座都看不见他，03 夺点判定要求四名守卫全灭，冷启动因此卡住，已挪进院内） |

### 2.4 05 取弹沟、旧院、攻击支路

| 要素 | 坐标 | 说明 |
| --- | --- | --- |
| 取弹沟 `BundleApproach` | RJ → (34,−136.4) → DL(40.6,−130.6) → (44.6,−125.6) → (41.6,−120.8)，深 1.85，底宽 3.8 | 爬出沟口有两级土台阶，进旧院北门 |
| 受损沟沿 DL | (40.6,−130.6)，沟底抬到 1.1 m | 蹲着（眼高 1.05）战车看不见你；站起来（1.6）看得到战车炮塔、也被它看见（K8 是个选择） |
| 道路连接支沟 `RoadLinkSap` | (62,−129) → (55,−126.8) → (48.5,−125.8) → 取弹沟 | 05 切入组来路 |
| 旧院 / 弹药屋 | 院墙 `OldYard*`、车挡 `OldYardCartScreen`；屋 `BundleSupplyHouse*` 中心 (47.5,−109)，后门在西 | 取弹线 `route` 39.3 m 到后门 |
| 枯树（地标） | `OldYardDeadTreeTrunk` (36,−122.8) 高 7 m | |
| 攻击支路 `RoadAttack` | RJ → (35,−142.5) → (39.4,−144.2) → (39.8,−150) → (41.8,−154.8) → 攻击位 (43.6,−159.6)，深 1.6；最后 4 m 抬到 0.75 m | 掩护节拍：后墙 → 山墙 → `AttackRuinA`；最后 4.7 m 是风险窗口 |
| 攻击位掩体 | `RoadsideRuin` | 蹲下被挡，站起看到战车左侧后并能投掷 |

### 2.5 正面田野与北侧出发壕

- 跃进线 z −193 / −181.5 / −173 / −166.5；掩体行 Bank −191.2（高 1.35）、Mound −179.3（1.15）、Ridge −171（0.94）、Stub −164.6（1.08）；掩体列 WestFarm(只 Ridge/Stub)、WestGrave、Ruin、CenterWest、Center、CenterEast、East(只 Bank/Mound)。x 30–70 留给战车、护兵、侧翼组。
- 火力基地残墙 `FireBaseRuinW/C/E`、`FireBaseCraterCW`（北坡 z −192.6）；田野残墙 `FieldRuin0/1/2`；侧翼组弹坑、跃进末线弹坑、护兵槽弹坑（`FRONT_SPACE.flankCraters/boundCraters/escortCraters`）。
- **北侧出发壕** `NorthJumpOff`（x −47…−8，z −222.2，深 1.9）+ 两条 9 m 宽的出口壕 `NorthJumpOffExitWest/East`（x −35.2 / −13.2，从 −222.2 到 −205，出口端 r9 的坡道抬到 0.15 m）。04 推进组、补员波次（`FRONT_ASSAULT.spawnZ` −219，`waveCentersX` −36/−14）和西侧增援都从这里出来：离老周、射台、背坡、机枪座都 ≥63 m 且完全看不见，出坡道时才露头。
- **南路路障**：战车路在岔口 BendExit 分出的南段旧路，9 m 后被弹坑（(61.5,−168) r2.8、深 1.3）、翻倒的大车 `RoadblockCart`、倒下的电线杆 `RoadblockPole` 截断——战车物理上开不进我方纵深，步兵能穿过去（05 切入组）。

---

## 3. 01–02 站位建议（给第二波 Opening 包；数据在 `MISSION_PLACEMENT.bunker`）

| 人 | 位置 | 说明 |
| --- | --- | --- |
| 顺子 | 洞内 (−1.3,−126.2)，面朝东 | K1：躺着看出去依次是 8 m 杀俘位、15 m 岔口 J、20 m 折角 F |
| 肩伤川军 comrade | 开场坐洞口 (0.6,−125.6)；被拖到杀俘位 (6.5,−123.6) | |
| 洞外士兵 shouter | (8.6,−122.9) | |
| 甲、乙 | 起点 (12.4,−124.2)/(13.4,−125.6)；杀俘 (6.8,−124.6)/(5.2,−124.4)；拖顺子 (1.8,−125.7)/(3.6,−124.7) | 顺子被拖到 `dragged` (3.8,−123.2)（K2 眼位，跪 0.9） |
| 丙 / 丁 | 名册站位就在 F / J；`enter` 给出从连接支沟下来的腿 | K1 锥里 |
| 罗班长 | RC (−4,−113) 出现（K2，越过翻译肩膀 12.8 m）→ `rescueRoute` 摸上来 | 不从敌后出现 |
| 何有田 | `heyoutianFire` (3.0,−121.3)，塌土东侧 | 打得到杀俘位 |
| 刘文财 | `liuwencaiShot` (−1.0,−121.0)，顺东西向那段沟看 J 15.4 m | 「十几米外」 |
| 还权位 | `returnSpot` (−0.2,−122.2) | 塌土挡住 J、F |
| 顺子出洞 `exitLane` | 受困位 → 洞口 → 被拖位 → 绕塌土东侧 → 还权位 → 南南西段 | 两态净空通过（MissionTest） |
| 02 追兵 `bunkerPursuit` | 1 人守 F；3 人沿连接支沟到 J、(6.8,−124.2)、(9.6,−125.1)，都不越过弯 M | 03 夺点后沿 `FRONT_SPACE.pursuitFallback` 撤回连接支沟 |
| 03 开场 | 何有田 + 1 名川军守 RC 西口 `FRONT_SPACE.rcHold` | 交代追兵去向 |

---

## 4. 03–05 逐段节奏（静态暴露，1 m 采样；蹲 1.0 / 站 1.55）

| 路段 | 长度 | 蹲姿暴露采样 | 最长连续暴露 | 说明 |
| --- | --- | --- | --- | --- |
| 02 还权位 → 集结处（对 J、F、杀俘位） | 47.3 m | 13/95（0.5 m 采样） | 4.5 m | 塌低段短暂暴露后全程土壁 |
| 03 SJ → 缺口交汇 | 45.3 m | 0/46 | 0 | 17 m 处观察射台 |
| 03 右低沟（对阵位四人） | 32.1 m | 1/33 | 1 m | 1.85 m 深 + 横墙；踏台上站起来才交战 |
| 04 座 → RJ（对战车、护兵） | 13.8 m | 6/14 | 6 m | 院内挡板和后墙分段 |
| 05 取弹沟 | 39.3 m | 12/40 | 12 m | 其中 8 个采样是切入组近战区 |
| 05 攻击支路 | 26.3 m | 5/27 | 3 m | 最后 4 m：8 个采样里 6 个对炮塔机枪/主炮/护兵可见（风险窗口） |

每段沟最多两种用途：01–02 交通壕（01 演出 + 02 撤退）、支沟（03 接近 + 守军撤退/05 返回）、右低沟（03 接近 + 05 返回）、连接支沟（01–02 敌方来路 + 05 攻击支路上段）、取弹沟（05 往返）。没有连续 90 m 无事的沟：03 最长的无事段是 SJ→射台 17 m。

---

## 5. 敌我布设（契约 §5.8 组 id；每人都带 `role`）

| 组 | 人数 | 初始位置 | role | 出现方式（`MISSION_ENCOUNTER_ACTIVATION`） | 生成方 |
| --- | --- | --- | --- | --- | --- |
| `bunkerAssault` 甲乙丙丁 | 4 | J 旁 2 人、F、J | ijaA–D | 步骤 Trapped（装睡演出） | 通用生成器 + Opening 导演 |
| `bunkerBackdrop` | 日 6 + 川 3 | 日：攻击支路/连接支沟上段；川：RC 与支沟 | backdrop / backdropNra | 事实 `bunkerCollapsed` | **Ai 包背景兵机制**（通用生成器会把川军建成日军，所以不进步骤表） |
| `bunkerPursuit` | 4 | F 守 1；连接支沟 3 | pursuitBase / pursuit | 事实 `rifleRecovered` | **Opening 包**后交通壕追兵 |
| `approach` 阵位组 | 4 | 机枪手在枪位；两名院内守卫朝西门；连接口守卫在后门内侧 (31.8,−146.7)，背靠后墙守连接支沟与取弹沟口 | nestGun / nestGuard / linkGuard | 步骤 BunkerRescue（hold） | 通用生成器 |
| `front` 火力基地 | 4 | 北坡 z −193.8 残墙后 | fireBase（hold） | 步骤 BunkerRescue | 通用 |
| `front` 跃进组 | 6 | Bank 行后 z −192.6 | bound | 同上，三跳到 −166.5 | 通用 |
| `frontFlank` 侧翼组（03 指定进攻组） | 4 | 北残院北侧 | flank，带 `lane` | 步骤 BunkerRescue，待命到 `frontBattleStarted` | 通用（跃进由 Front 包按 `lane` 接） |
| `frontOfficer` | 1 | (54.5,−193.6) | officer（IJA01、军刀） | 同上 | 通用 |
| `machineGun` 04 推进 | 4（2×2） | 出发壕出口 z −219 | push | 步骤 BunkerRescue | 通用 |
| `tank` 护兵 | 4 | 路堑里 | escort；封口槽 `FRONT_TANK_ESCORT_SLOTS` | 步骤 BunkerRescue | 通用 + Tank 大脑 |
| `frontReserve` | 5 | 出发壕西端 3、路堑 2（`slots`/`slotStages`：04 放 2+2，05 放 1） | reserve | 事实 `tankPositionPressured` | **Front 包**前沿压力机制 |
| `bundleApproach` 切入组 | 2 | 道路连接支沟东段 (59.6,−128.4)/(56.8,−127.4)，`hold`，面朝取弹沟交汇口 | cutIn | 步骤 BunkerRescue | 通用 |

- 03 夺点判定要求阵位组四人全灭（`Script_FirstLevelFrontBattle.UpdateCapture`）。所以四人初始位置都必须能从西门或机枪座打到：机枪手、入口守卫、连接口守卫对机枪座 2/2 通视，东侧守卫对机枪座 2/2、对西门 0/2（引擎内 `BlocksSight` 实测）。
- 预算：01 = 11（甲乙丙丁 4 + 背景日军 6 + 翻译 1）、02 = 4、03 = 19、04 = 12、05 = 3，**累计 49 ≤ 55**；04/05 最坏同时存活 **27/30 ≤ 30**。`Data_Tuning_FirstLevel.openingEnemyBudget` 同步为 26（它只数 bunkerAssault+front+machineGun+approach+tank）。
- 每个初始位置（含侧翼组与跃进组末线、护兵槽）都有 2.5 m 内朝向威胁的实心掩体（顶 ≥0.9 m）或下挖 ≥0.5 m。
- 视线外入口：出发壕里的推进组、补员中心、西侧增援对老周、射台、背坡、机枪座、RJ、GJ **都不可见**（≥63 m）；路堑里的护兵与增援 ≥93 m。
- 环境射击授权点 `FRONT_FIRE_POINTS`（`Data_FirstLevelMissionFront`，按步骤）：01/02 为 RC 胸墙、支沟唇、J、F；03 为土坎顶 6 点、左枪胸墙、缺口两侧与 GJ（`gap:true`，撤离窗口内关）；04 加阵位北墙、西墙、山墙；05 为土坎顶、阵位北墙、攻击位残墙顶——**都不是玩家实时位置**。

---

## 6. 战车语义路点（`FRONT_TANK_PATH`，契约 §5.7）

| id | 坐标 | kind | 车体 faceTo / 炮塔 turretTo / holdS | 从机枪座看 | 路程 |
| --- | --- | --- | --- | --- | --- |
| Start | (112,−229) | cruise | | 看不见 | 0 |
| Cutting | (106,−214) | cruise | | 露炮塔 | 16 |
| HullDown | (97,−205) | hullDown | nest / nest / 15 s | **只露炮塔**（88 m，路堑沿挡车体） | 29 |
| Shadow | (81,−204) | cruise | | 看不见 | 45 |
| Bend | (64,−189.5) | cruise | | 看不见（北残院后） | 67 |
| BendExit | (60,−177) | cruise | | 整车（41 m） | 80 |
| Pressure | (51,−172.5) | firePoint | nest / nest / 14 s | 整车，炮口直视座位（31 m） | 90 |
| Approach | (44.5,−169) | cruise | | 整车 | 98 |
| Block | (38,−167.5) | block | gap / gap / 0 | 整车；土坎线以北 7.5 m，到缺口 49 m | 104.5 |
| Squeeze | (35.5,−167) | squeeze | gap / attackTail / 0 | 05 前挤 2.6 m | 107 |

- 旧键 `tankPreviewIndex / tankPressureIndex / tankBlockIndex / tankEndIndex` 保留，由 `FrontTankIndex(id)` 按 id 解析（HullDown / Pressure / Block / Squeeze），**不手工编号**；`FRONT_SORTIE.tankPath` 就是这张表，`road` 是它加一段 5 m 断头。目标名在 `FRONT_SPACE.tankTargets`（nest / gap / attackTail，带离地高度）。
- 炮塔可见区间：路程 5–40 m 看得见 → 40–73 m 被北残院挡住 → 73 m 起一直看得见。炮口从路程 79 m 起看得到缺口，最后 21 m 42/42 采样通视；Block/Squeeze 对缺口 ±1 m × 4 个高度各 8/12 通视。
- Block/Squeeze 的炮口看不到：RJ 站姿、安全区、最后遮挡蹲姿、攻击位蹲姿、受损沟沿蹲姿；看得到机枪座（压制）。Pressure 看得到机枪座。
- **车体机枪与炮塔分工**：车头对缺口，车体机枪 ±26° 管缺口；攻击位在车头 105°（侧后，K9 成立），车体机枪够不到攻击支路。05 的风险窗口交给炮塔（并列/后部机枪，离地 2.0 m）：攻击支路最后 4.7 m 的 9 个采样，Block 看得到 6 个、Squeeze 看得到 7 个。
- 车体 5.75×2.18 m、离地 0.25–2.6 m 全程不碰体块与铁丝网，最大俯仰 1.4°。

---

## 7. 关键帧（`Data_FirstLevelSpaceKeyframes.mjs`；yaw = three.js 相机 `rotation.y`，0 朝北）

| K | 机位 (x, y, z) | 眼高 | yaw / pitch | 必须看见（距离，通视高度数） | 引擎实拍 |
| --- | --- | --- | --- | --- | --- |
| K1 洞内醒来 | (−1.3, −1.51, −126.2) | 0.42 躺 | −1.675 / 0.045 | 杀俘位 8.2 m 2/2、贴壁川军 8.4 m 2/2、J 15.4 m 2/2、F 19.5 m 2/2、洞口汉阳造 1/1 | K1.png |
| K1i 开场（完好态坐姿） | (−1.3, −1.03, −126.2) | 0.9 | −1.675 / 0.014 | 洞口外沟底、沟里来人 | — |
| K2 越过翻译肩膀 | (3.8, −1.04, −123.2) | 0.9 跪 | 2.489 / 0.042 | 罗班长在 RC 12.8 m 2/2、南南西段中途 2/2、RC 木框横梁 | K2.png |
| K2b 还权位 | (−0.2, −0.91, −122.2) | 1.0 | — | F、J **看不见**（塌土挡） | — |
| K3 观察射台 | (−23.2, 0.65, −129.2) | 1.6 | −0.559 / −0.027 | 8 名跪姿守军 27–37 m、缺口 26 m、阵位机枪口 53 m、山墙 64 m，**一个画面 76°**；老周在左侧 29 m（转头） | K3.png |
| K4 夺点射位 | (25.9, 1.14, −153.9) | 1.5 | 1.685 / −0.021 | 缺口 34 m、侧翼组末线 9–14 m（3 人 2/2、1 人 1/2）、路远段炮塔 88 m | K4.png |
| K5 路远段露炮塔 | 同 K4 | 1.5 | −0.948 / 0.013 | HullDown 炮塔 2/2、车体 0/3、起点 0/2 | K5.png |
| K6 驶出路弯 | 同 K4 | 1.5 | −0.975 / 0.009 | 路弯 0/3、BendExit 车体 2/2、Pressure 车体 2/2 | K6.png |
| K7 后墙回看 | (29.7, 0.86, −144.4) | 1.6 | 0.381 / −0.001 | 北墙顶（炮弹落点）、机枪座；战车在 Pressure/Block **都看不见** | K7.png |
| K8 受损沟沿 | (40.6, 0.43, −130.6) | 1.6 站 | 0.07 / 0.043 | 37 m 外封口战车炮塔 2/2（蹲下 1.05 则彼此看不见） | K8.png |
| K9 攻击位 | (43.6, 0.33, −159.6) | 1.5 站 | 0.617 / 0.093 | 战车车体侧面 9.7 m、后甲板、前挤后 11 m | K9.png |
| K10 缺口重开 | (25.8, 1.23, −150.5) | 1.6 | 1.586 / −0.017 | 缺口处过人 34 m | K10.png |
| K11 借火 | (−36.5, −0.24, −98.5) | 1.6 | −3.103 / −0.26 | 老周坐在土壁边 2.6 m | K11.png |

实拍用 p012 白盒按阶段起（`missionStage` 2/3/4/5/6）、自由相机摆到上表机位，战车在 4/5 阶段按表摆到 HullDown/BendExit/Pressure/Block。实拍观察与已知差异见 §10.3。

---

## 8. 可破坏掩体与环境射击

`Data_FirstLevelFrontBreakables.mjs`（纯数据，机制归 Tank 包 `Script_FirstLevelFrontBreakables`）：

- 可破坏：阵位正面胸墙三段（`RightNestWestLow`、`RightNestNorthLow`、`RightNestNorthHigh`，逐级降顶）、北残墙两段（`FieldRuin1`、`FireBaseRuinE`）、受损沟沿一段（1.1 m → 0.8 m）、北残院过梁（`NorthRuinGable`，只换外观，不改遮挡——路弯遮挡不许被打穿）。
- 永不破坏：阵位后墙两段、东山墙、西门南侧高墙、最后遮挡、`AttackRuinA`、`RoadsideRuin`、两道土横墙、旧院与弹药屋（`FRONT_UNBREAKABLE`）。支沟与安全区是地形，本来就不可破坏。

---

## 9. 验收（纯 Node）

| 命令 | 内容 |
| --- | --- |
| `node Taierzhuang1938/Script_FirstLevelFrontTopologyTest.mjs` | K1–K11 + K1i/K2b、运行时要断言的 5 条缺口视线（含铁丝网整卷）、05 切入组守位且看不到缺口与背坡、战车路（id 解析旧键、hull-down、路弯遮挡 ≥20 m、稳定射界、坎线以北、侧后、炮塔窗口、路障、车体净空）、48 条路线净空、暴露节奏、62 个初始掩体、侧翼组末线看得见缺口、预算、视线外入口、分离与 01 通道、背坡洪泛、交战距离、可破坏数据、03–06 分批与夺点判定 |
| `node Taierzhuang1938/Script_FirstLevelSpaceTest.mjs` | 锚点站得住人、老周下撤折线、防炮洞（单口、三眼高躺姿视线、封闭侧向、塌土挡还权位、救援来路）、集结处反坡等（07–18 原有断言不动） |
| `node Taierzhuang1938/Script_FirstLevelMissionTopologyTest.mjs` | 拓扑版本、02 止于集结处且 03 从同处起步、SJ 与集结处相邻 |
| `node Taierzhuang1938/Script_TrenchPlanTest.mjs` | 规划层契约跑在冻结夹具上（09.19 的七段网络），现行网络另查：人走的沟宽 ≥3.4、SJ/GJ/RJ/J 接口、取弹沟不接背坡 |
| `node Taierzhuang1938/Script_FirstLevelSpaceProbe.mjs [--json out]` | 量尺本身，打印全部数字 |

交战距离（玩家所在位置 → 他要打的敌人，60 对）：0–15 m 20 / 15–30 m 16 / 30–45 m 14 / 45–60 m 5 / 60 m+ 5。15 m 以内都是刻意的近战拍（02 塌土边追兵、夺下机枪对土坎东端侧翼组 9–14 m、04 护兵、05 切入组、攻击位对战车与护兵）；正面主力（火力基地 40–64 m、跃进组 21–65 m、老周对跃进线 10–53 m）都在 15–60 m。

路线长度：02 撤退 47.3 · 03 接近 96.7 · 04 短撤 13.8 · 05 取弹 39.3 · 05 攻击 26.3 · 05→06 返回 103.7 · 左枪通道 48.6 · 老周下撤 61.8 · 守军撤退 41.8–60.2 · 战车 107 · 07 南行 135.4（未改）。

---

## 10. 给其他包的接口与待办

### 10.1 冻结名字的变化（已按集成负责人决定执行）

- 战车路点旧键保留、按 id 解析，不重新编号。
- 新增组 id：`frontFlank`（03 指定进攻组）；`bunkerBackdrop`、`bunkerPursuit`、`frontOfficer`、`frontReserve` 按契约 §5.8。组 id 表写回契约 §8。
- 新增锚点键：`bunkerBend / bunkerJunction / bunkerFold / bunkerCrater / shunziDragged / supportJunction / frontObservation / guardSafeZone / gapJunction`；`bunkerRear` 语义改为「还权位」。
- `MISSION_TOPOLOGY_VERSION` = `first-level-20260923-space-0106`。
- 壕沟段 13 → 21（`MissionGatesTest` 改为对 `MISSION_TRENCH_NETWORK.segments` 计数）。

### 10.2 各包要接的线

- **Opening（第二波）**：导演坐标全换成 §3；演员直线插值要走沟里的折线（南南西段、连接支沟都有折角）；`exitLane`、`rescueRoute` 已给；`bunkerPursuit` 由你们在 `rifleRecovered` 时生成。`Data_OpeningStoryboards` 里 09.21 的绝对坐标（`positions`、`coverRoutes`、`pullReturnWaypoints`）仍在旧掩蔽部 x≈−40，需要重写。
- **Front（第二波）**：`frontReserve` 在 `tankPositionPressured` 后按 `slotStages` 放出；`frontFlank`/`frontOfficer` 目前只是在北残院待命并正常交火，跃进要按 `lane` 接（`FrontExplicitLanes()` 给出折线）；老周下撤改走 `FRONT_SORTIE.zhouExit`（`ZhouGunExitRoute` 仍是旧枪位时代的直线）；03 夺点判定见 §10.3 第 1 条。
- **Tank**：直接读 `FRONT_TANK_PATH`（id/kind/faceTo/turretTo/holdS）与 `FRONT_SPACE.tankTargets`；护兵槽 `FRONT_TANK_ESCORT_SLOTS`；可破坏数据见 §8；路障是体块 + 地形弹坑，不需要大脑判断「别往南开」。
- **Ai**：背景兵 `bunkerBackdrop`（含 3 名川军）在 `bunkerCollapsed` 时由你们生成；阵位守卫与机枪手 `hold`（守点，只探头/缩回）；每人 `role` 与 `faceTo` 已给；环境射击点 `FRONT_FIRE_POINTS`。
- **Sound**：土洞、交通壕、院落、路堑四种声学空间位置见 §2；路堑与北残院适合放「只闻其声」的发动机回响。

### 10.3 03→06 冷启动结果（`Script_FirstLevelMissionBrowserTest.mjs --campaign --stage-from=3 --stage-to=6 --probe-front-gun`）

见最终报告里的实跑记录；断点交第二波 Front 包，本包不改 `Script_FirstLevelFrontBattle` 逻辑。

---

## 11. 与比稿、评审的取舍

以 A 的布局为底（土坎两端交叉火力、「东头丢了」、路堑 hull-down + 路弯遮挡 + 坎线以北封口、05 攻击支路即先头兵来路），嫁接：

| 来源 | 做法 | 落点 |
| --- | --- | --- |
| C | 旧键名兼容：战车路点按 id 解析 | `FrontTankIndex`、`FRONT_SORTIE.tankPath` |
| C | 物理路障：南路岔口后弹坑 + 翻车 + 倒杆 | `FRONT_SPACE.roadblock`、`RoadblockCart/Pole` |
| C | 横墙挡顺沟视线 | `RightApproachTraverse`（实测阵位机枪原本能顺右低沟看进 9 m）；02 南南西段复测 F 站姿打不进（0/9），不需要另加 |
| C | 角色标签、侧翼车道进 `FrontAssaultLaneCuts` | 全部名册 `role`；`FrontExplicitLanes()` |
| C | 一条探针验全部 + 背坡洪泛 + 完好态 K1i | `Script_FirstLevelSpaceProbe` → `FrontTopologyTest` |
| B | 右侧低沟挖深到 1.85 + 射击踏台 | `RightApproach` 深 1.85、`FRONT_FIRE_STEPS`（踏台位置按实测视线重选） |
| B | 受损沟沿站蹲对照 | DL 沟底 1.1 m（蹲藏、站露） |
| B | 车体/炮塔朝向分开写 | `faceTo` / `turretTo`；05 窗口交给炮塔机枪 |
| B | RC 木框、路口斜杆、枯树加高 | `RearCornerFrame*`、`FrontRoadPoleFork`、枯树 7 m |
| B | 增援入口做成实沟 | 北侧出发壕 `NorthJumpOff*`（同时收 04 推进与补员） |
| 评审 | 03 开场交代追兵去向 | `FRONT_SPACE.rcHold`、`pursuitFallback` |
| 评审 | 尸体簇随前线北移、伤员挪出沟底 | `MISSION_AFTERMATH` 前沿六簇、`collection.wounded[4]` |

最终实现另外修掉的（03→06 冷启动逐个撞出来的三处也在内）：连接口守卫原在后墙外 (32.3,−140.2)，西门和机枪座都看不见，夺点永远不成立——挪进后门内侧；东侧守卫被 1.8 m 长的碎砖堆整个挡住（对机枪座也 0/2）——碎砖堆缩成 0.8×1.0 挪到他身前 2 m；背坡铁丝网东头压在机枪座看缺口的线上（引擎射线打在铁丝网桩上）——整条带斜过去，并在量尺里加了「运行时要断言的缺口视线按整卷铁丝网算」一项；枪架体块沿用 09.22 的 id `RightNestFrontRest`；05 切入组原先不守位（`hold:false`），03 里就顺连接支沟往西走、从 65 m 外隔着后方空地看到缺口，`FrontBattle.InfantryBlockade` 一直亮着，03 的撤离窗口永远不开——改成守位，并加断言「从岗位看不到缺口和背坡守军」；阵位院内尸体 18→8；旧的东侧 `MISSION_ROUTES.flank` 起点压着 `EastWire3`（基线就红的 FortificationsTest）——起点挪进铁丝网缺口。此外：守军刮沟西头与左枪通道连通（守军可以不走缺口，已加横墙截断）；三名守军撤退线穿过最后遮挡沙袋；05 最坏同时存活 32 人（超 30，05 增援降到 1 人）；班长位离枪 4.2 m 过不了夺点半径；压梁压住受困位导致站起来卡住；右低沟末腿指向阵位被顺沟看穿。

---

## 12. 复现

```powershell
node Taierzhuang1938/Script_FirstLevelSpaceProbe.mjs --json tmp/space_probe.json
node Taierzhuang1938/Script_FirstLevelFrontTopologyTest.mjs
node Taierzhuang1938/Script_FirstLevelSpaceTest.mjs
node Taierzhuang1938/Script_FirstLevelMissionBrowserTest.mjs --campaign --stage-from=3 --stage-to=6 --probe-front-gun
```

俯视图 `node Taierzhuang1938/Script_FirstLevelSpaceMap.mjs`（模板 `Tool_FirstLevelSpaceMap.html`），实拍 `node Taierzhuang1938/Script_FirstLevelSpaceShots.mjs [--only=K1,K3]`；只读数据表与量尺，产物写 `Taierzhuang1938/_shots/Space0106/`（不进仓库）。
