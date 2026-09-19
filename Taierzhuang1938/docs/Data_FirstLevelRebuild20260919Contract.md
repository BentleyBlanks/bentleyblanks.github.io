# 第一关 2026.09.19 重构 · 分包契约

需求来源：[Notion 2026.09.19 采用稿转录](Data_FirstLevelRebuildSource20260919.md)（台词一字不改）。本文件是各实现包之间的接口契约：**名字（步骤 id、事实名、锚点/路线键、遭遇组 id、cue id）在这里冻结**，实现包不许各自改名；确需改动先报给集成方（主会话），由集成方改本文件后再动代码。坐标、数值、内部实现归各包自己定。

入口不变：`?whitebox=p012`（`fullMission`）。`?whitebox=p012-archive` 夹具及其 `Script_FirstLevelP012*` / `Data_FirstLevelP012*` / `Data_Text_P012` **本轮一律不动**。

## 1. 公开阶段与内部步骤

公开阶段仍是 18 个（调试菜单 18 项）；Notion 的 15A/15B/15C 是第 15 阶段的三个内部步骤。内部步骤 27 个 + `Complete`。

| 阶段 | 阶段 id | 标题 | 内部步骤（按序） |
| --- | --- | --- | --- |
| 1 | Trapped | 黑屏、爆炸、受困 | `Trapped` |
| 2 | Rescue | 班长救人，撤入后交通壕 | `BunkerRescue` → `RearTrench` |
| 3 | Support | 接回第一批守军 | `Support` |
| 4 | MachineGun | 接替火力，战车压口 | `MachineGun` |
| 5 | Tank | 班长带路取弹，炸停战车 | `Tank` |
| 6 | Orders | 回到伤员集结处，接下后送 | `Orders` |
| 7 | South | 沿沟南行 | `South` |
| 8 | Village | 主街受阻 | `Village` |
| 9 | Melee | 灶屋—连屋近战 | `Melee` |
| 10 | Courtyard | 打开内院，放行担架 | `Courtyard` |
| 11 | TransferApproach | 抵达桥头接运点 | `TransferApproach` |
| 12 | Transfer | 掩护装载与离开 | `Transfer` → `CartRide` |
| 13 | AirFirst | 日机空袭桥头道路与车列 | `AirFirst` |
| 14 | Dive | 第二轮扫射，转入西沟 | `Carry` → `Dive` → `Rescue` |
| 15 | Regroup | 降压：收拢、换手抬运、找到接收处 | `Regroup`(15A) → `WallPath`(15B) → `ReceptionGate`(15C) |
| 16 | Handover | 完成交接 | `Handover` |
| 17 | Death | 确认老周死亡 | `Death` |
| 18 | Bridge | 接应回援尾队，奉令毁桥，夜入滕城 | `BridgeOrders` → `BridgeCover` → `BridgeWithdraw` → `NightMarch` |

下线的旧步骤：`Train` `Unloading` `TrenchEntry` `Shelter` `RetreatFirst` `RetreatWall` `RetreatYard` `Reception` `FinalCarry` `FinalDefense` `Exit`。沿用旧 id 的步骤（`Support` … `Rescue`、`Death`）语义按下表调整。

## 2. 每步的事实（requirements）

事实名冻结；`kind` 是建议的触发口径（走 `MISSION_FACT_GATES`，距离门一律 `GateNear`）。实现包可以**增加**内部辅助事实，但下表这些必须存在且含义一致。通过条件逐条对应 Notion「通过条件」，**不许用纯计时器代替“真实发生”**（人真的走到、车真的开走、敌人真的被打掉）。

| 步骤 | requirements | 说明 |
| --- | --- | --- |
| Trapped | `bunkerCollapsed`(scripted) `captivesKilled`(scripted) `doorSearchStarted`(scripted) | 黑屏对白 `BunkerBanter` 被近爆打断 → 受困（控制接管 `trapped`，只能小幅转头）→ 透过前门低处破口目睹两名失去抵抗能力的川军被刺杀 → 日兵转向门内；同时后侧响起清理坍塌物的声音。无「救俘虏」假目标 |
| BunkerRescue | `rescueCallHeard`(voice) `luoRescueComplete`(scripted) `rifleRecovered`(interaction) | 何有田从后侧交通壕开火逼日兵转身；罗班长掀木架、幺娃拉背包（短暂接管 `rescue`）→ 还权 → 玩家拾枪 |
| RearTrench | `rearTrenchEntered`(proximity) `cornerReached`(proximity) `collectionPointSeen`(proximity) `supportOrdersHeard`(voice) | 经折角（幺娃检查顺子）→ 途经背坡伤员集结处（第一次看见担架、伤员、搬运人员）→ 撤回守军指路 |
| Support | `frontReached` `frontContact` `frontRifleDefense` `rifleWithdrawalResolved` | 打断封锁撤路的直接火力（老周指「右边破墙」）；第一批存活守军**真实**撤入沟内。老周此时仍在机枪位作战 |
| MachineGun | `zhouGunWounded` `frontAttackRepelled` `guardWithdrawalResolved` `tankBlocksExit` `bundleOrderHeard`(voice) | 老周腿伤恶化退出枪位 → 玩家接替（机枪仍可选）→ 后续守军退到最后遮挡 → 战车压口 → 守军指出北头弹药屋。**旧 04 关中过场 `CS_MachineGunCaptives` 不再由任务触发**（主题已由 01 承担；过场资产与文件保留，不删） |
| Tank | `bundleRouteTraversed` `bundleTaken` `tankImmobilized` `lastGuardsWithdrawn` `reliefInPosition` | 返程不复活去程敌人；最后一批守军真实撤入、接防人员进入阵位 |
| Orders | `ordersReached` `volunteerHeard`(voice) `lightShared`(voice) `zhouOnLitter` `columnDeparted` | 回到 02 途经过的集结处；借火戏 `BorrowLight`；后送队**真实**起行 |
| South | `southWhisperHeard`(voice) `villageMouthReached`(proximity) `mainStreetPointed`(voice) | **真走一段**（取消旧黑屏转场 `southTransition`），目标时长 45–75 秒；顺子与幺娃私语 |
| Village | `streetBlockSeen`(proximity) `littersInCover`(column) `kitchenEntered`(proximity) | 主街被倒墙＋横车堵住，东巷窗口日军火力；担架队停入可靠遮挡，不跟进未清空间 |
| Melee | `meleeResolved` | 日军来自与东巷相通的连屋。**提前击败近战敌人则不强制固定 QTE**；旧「老周挨刀、两名担架员阵亡」的屋内伏击拍下线（担架不进屋）。敌人真的贴上玩家时才走共用白刃僵持 |
| Courtyard | `villageGunSilent` `courtyardGateOpen` `courtyardPassed` | 担架从 08 等待点真实移动，穿院落绕过障碍，在障碍南侧 `streetRejoin` 接回主街 |
| TransferApproach | `transferApproachReached` `transferSortingHeard`(voice) `villageRoadThreatSeen`(voice) | 牛车、马车、人力担架、步行伤员；无汽车 |
| Transfer | `transferArrived` `loadingThreatResolved`(combat) `firstBatchLoaded`(column) `alleyThreatResolved`(combat) `zhouNext` `escortGranted`(voice) | **只有两处威胁**（压向装载区的 `transfer`、侧巷的 `transferAlley`），不做四拍守波次；每解除一处，接运真实推进一批 |
| CartRide | `cartBoarded`(interaction) `zhouCartDeparted`(scripted) `cartTalkHeard`(voice) | 何有田接住射位；顺子随老周的牛/马车缓慢离开（控制接管 `cartRide`，可环视）；车**真实**离开装载位置 |
| AirFirst | `firstAirPassComplete` `cartHalted`(scripted) `zhouUnloaded`(scripted) `westDitchPointed`(voice) | 第一轮航过扫射桥头道路与车列，道路受损堵塞（沿用路桥被炸）；老周卸回担架 |
| Carry | `zhouCarried` `atDitchMouth` `carryOrdersHeard` | 顺子接担架后端，双手占用 |
| Dive | `diveComplete` | 固定角色剧情：松手扑沟，不做必败 QTE；老周再次受创 |
| Rescue | `zhouRecovered` `rescuePassageClear` | 第二轮航过后飞机离开；`air` 追兵短暂断后 |
| Regroup | `picketHolding`(voice) `zhouChecked`(voice) `headcountDone`(voice) `litterRemanned`(scripted) `columnMoving`(column) | **无战斗**。警戒兵在车路方向接住追兵，沟壁折角切断射线 |
| WallPath | `carryHandover`(interaction) `wallPathTraversed`(proximity) `stragglersTended`(column) | 顺子再次接担架（`CarrySwap`）；留一段无对白行走；全程无敌人 |
| ReceptionGate | `gateChallenged`(voice) `receptionAccepted`(voice) `woundedEntering`(column) | 院门守军确认身份 → 接收人员明确安置位置 → 伤员实际入院 |
| Handover | `thresholdCrossed`(proximity) `zhouPlaced`(interaction) `medicExamining`(voice) `squadAssigned`(voice) | 过门槛「脚……慢点」是老周最后一句话；放下担架后恢复持枪 |
| Death | `deathSceneComplete` | 第一人称，不切尸体特写；接收处继续工作（`NextLitter`）；不判全关失败 |
| BridgeOrders | `bridgeOrdersHeard`(voice) | 传令兵到接收处；HUD 目标「掩护回援分队通过铁路桥」 |
| BridgeCover | `southBankReached`(proximity) `bridgeFireBroken`(combat) `rearColumnCrossed`(column) | 不做多波守点；敌军来自北侧外围战场（`bridgeNorth`，北岸土坎），不在桥边凭空生成；威胁解除后尾队**真实**通过 |
| BridgeWithdraw | `blastZoneCleared`(proximity) `bridgeDestroyed`(scripted) `marchOrderHeard`(voice) | 爆破由在场人员完成；玩家在安全距离看见桥被破坏（不可逆）；无己方剧情伤亡；不说「所有人都过来了」 |
| NightMarch | `nightTransitionComplete`(scripted) `northGateReached`(proximity) `gateEntered`(proximity) | 行军脚步持续 → 淡出 → 字幕「1938年3月15日 夜｜滕县」→ 切夜间天空（藏在黑屏里）→ 淡入北门外行军队列 → 随罗班长进北门 → `Complete` |

控制接管 kind：保留 `rescue` `dive` `death`，新增 `trapped` `cartRide` `nightTransition`；下线 `derail` `southTransition` `ambush`（若 09 仍复用僵持 QTE 的接管则保留 `ambush`）。**`BeginControl` 释放分支不许再有「兜底当成 death」的 else**，未知 kind 必须抛错。黑屏字幕类 `FirstLevelTransition` 改成参数化（标题/正文从文本表取）。

## 3. 空间：四区、锚点与路线

坐标系 X 东、Z 南。总体保持 Z 单调南行：A(−220…−96) → B(−30…46) → C(86…145) → 北沙河(z≈153) → D(165…252)；18 是唯一一次回头向北。

- **北沙河**：把现有 `54<x<99, z≈153` 的排水沟下切推广为东西贯穿的河槽。路桥在 `x=76`（沿用 `TemporaryBridge` / `MissionBridgeWreck` 被炸机制）；**铁路桥在现有铁路轴 `x=-77`**；西沟（`WestEvacuation`）与河槽交会处是人能走、车过不去的缓坡浅滩。
- 复用：后交通壕、机枪位、战车路、集束弹沟与弹药屋、灶屋/连屋/内院、转运棚与车位、西沟、接收院与厢房。
- 新建：掩蔽部（完好/坍塌两态，前门低处破口能看清门外 8–12 m）、背坡伤员集结处、主街倒墙＋横车（留人缝、担架过不去）与东巷窗口、内院出口接回主街的短巷、侧巷、15B 靠院墙夹道（2.5–3 m 宽）、接收院院门、厢房门槛（可走、会颠一下）、铁路桥（桥台/桥面/桁架，可整体「炸毁」换态）＋南岸遮挡＋北岸土坎＋爆破安全区、关尾北门外夜景小片（**白天不可见**）。
- 军列/车站几何与 `z>370` 的进站跑道：第一波保留（旧运行时还在用），第二波由空间包下线并收缩 `bounds`。

新增锚点与路线已写在 `Data_FirstLevelMissionTopology.mjs` 的 `MISSION_STAGE_ANCHORS` / `MISSION_STAGE_ROUTES`（锚点已并入 `MISSION_ANCHORS`；路线等沿线几何过了 0.35 m 胶囊净空后由空间包并入 `MISSION_ROUTES`）。键名：

- 锚点：`bunker` `bunkerDoor` `bunkerKilling` `bunkerRear` `rearCorner` `collection` `streetBlock` `litterHold` `eastAlley` `streetRejoin` `cartBoard` `cartHalt` `sideAlley` `wallPathStart` `wallPathEnd` `receptionGate` `railBridge` `bridgeNorthEnd` `bridgeSouthEnd` `bridgeCover` `bridgeEnemy` `blastSafe` `marchOut` `nightSpawn` `northGateApproach` `northGate` `gateInside`
- 路线：`rearTrench` `collectionReturn` `southWalk` `courtyardBypass` `cartRide` `wallPath` `toBridge` `bridgeCrossing` `bridgeWithdraw` `marchOut` `nightMarch`
- 沿用的旧键：`front` `gun` `bundle` `throw` `village` `melee` `gate` `courtCover` `transfer` `transferSupply` `queue` `ditchMouth` `ditch` `retreatA`（=15A 收拢点）`zhouDrop` 及 `MISSION_RECEPTION_SPACE`。`orders` 锚点**迁到伤员集结处**（与 `collection` 同区）。
- 信号（gate/scenario）：`BunkerCollapsed` `StreetBlocked`（开局即生效亦可）`MissionBridgeDestroyed`（路桥，沿用）`RailBridgeDestroyed` `NightGateShown`。

空间验收口径沿用旧规则：路线 0.35 m 胶囊净空、全高沟深 ≥1.83、沟底宽不小于 3.24（错身）、掩体贴坡、单一地面采样器、无 `semantic:"ground"` 块、静态几何走 `BuildSink`、工事合批预算、`SCENE_RENDER_LIMITS`。

## 4. 遭遇组

| id | 出现 | 说明 |
| --- | --- | --- |
| `bunkerAssault` | Trapped（scripted） | 门外 2 名行刑日兵＋随后跟进的 1–2 人；被何有田火力逼转身；玩家拾枪后可交火但不是过关条件 |
| `front` `approach` `machineGun` `tank` `bundleApproach` | 沿用 | 03–05 同一场前沿压力 |
| `village` `melee` `courtyard` | 沿用 | `melee` 改为从连屋（通东巷）进来，不再预埋伏击位 |
| `transfer` | Transfer 进入 | 第一处威胁：压向装载区 |
| `transferAlley` | `loadingThreatResolved` 后 | 第二处威胁：侧巷火力 |
| `air` | 沿用 | 空袭后的村东追兵 |
| `bridgeNorth` | BridgeCover | 北岸土坎火力，来自北侧外围战场 |

下线：`surface` `intrusion` `shelterPursuit` `transferFlank` `transferLast` `transferRear` `retreat` `retreatWall` `retreatYard` `reception` `final`，以及 `MISSION_TRANSFER_BEATS` 四拍（改成两处威胁的表）。

## 5. 对白 cue

规矩：同一段连续多人对白 = 一个 cue = 一次 SeedAudio 请求 = 一条音频；动作打断处用 `VoiceTiming` 的分段（`gate`/`wait`/`events`）在同一条音频里停/续，不拆成多条。台词逐字取自 Notion 转录；日语行送 TTS 用纯假名、汉字写法留注释、屏幕字幕显示中文译文（Notion 括号里的译文）。旧 cue 全部下线（含四条死 cue），旧音频删除。

| 步骤 | cue id（句数） |
| --- | --- |
| Trapped | `BunkerBanter`(6，黑屏；末句被近爆打断) · `BunkerKilling`(4，日兵甲/伤兵/扶人川军/日兵乙) · `BunkerSearch`(2，日语) · `ShunziCurse`(1，压声) |
| BunkerRescue | `RescueCall`(3) · `RescueLift`(3) · `RescueOut`(1) |
| RearTrench | `TrenchCurse`(3) · `CornerCheck`(3) · `SupportOrder`(4) |
| Support | `FrontBlockade`(2) |
| MachineGun | `TakeOverGun`(2) · `TankTerror`(2) · `BundleOrder`(2) |
| Tank | `BundleGo`(2) · `BundleProne`(1) · `BundleSupply`(2) · `BundleReturnCall`(2) · `TankStopped`(2) |
| Orders | `Volunteer`(5：传令兵/罗/传令兵/顺子/罗) · `BorrowLight`(9，含两处动作停顿) · `ZhouLift`(4) |
| South | `SouthWhisper`(6) · `VillagePointer`(1) |
| Village | `StreetBlocked`(2) · `KitchenDetour`(2) |
| Melee | `MeleeRight`(1) · `MeleeCurse`(1) · `WindowOrder`(1) |
| Courtyard | `CourtyardOpen`(2) · `TwoLitters`(1) · `LastLitter`(2) |
| TransferApproach | `TransferSorting`(1) · `VillageRoadThreat`(2) |
| Transfer | `TransferDefense`(1) · `TransferRight`(1) · `TransferBatch`(1) · `EscortZhou`(3) |
| CartRide | `CartTalk`(5) |
| AirFirst | `AircraftFirst`(3) · `WestDitchOrder`(1) |
| Carry / Dive / Rescue | `CarryZhou`(3) · `AircraftReturn`(2) · `RescueZhou`(3) |
| Regroup | `PicketHold`(3) · `ZhouCheck`(3) · `Headcount`(6) · `CartAbandon`(2) |
| WallPath | `CarrySwap`(7) · `RoadBump`(2) · `HandsShake`(2) |
| ReceptionGate | `GateChallenge`(3) · `ReceptionAccept`(4) · `WardGuide`(2) |
| Handover | `Threshold`(3) · `PlaceLitter`(3) · `MedicAsk`(5) · `SquadAssign`(3) |
| Death | `ZhouDeath`(7，含「……」停顿) · `NextLitter`(2) |
| Bridge* | `BridgeOrders`(3) · `BridgeCover`(2) · `BridgeWithdraw`(3) · `MarchToTengxian`(1) |
| NightMarch | `NorthGate`(2) |

播完记事实的对应（`MISSION_VOICE_FACTS`）：`RescueCall→rescueCallHeard` `SupportOrder→supportOrdersHeard` `BundleOrder→bundleOrderHeard` `Volunteer→volunteerHeard` `BorrowLight→lightShared` `SouthWhisper→southWhisperHeard` `VillagePointer→mainStreetPointed` `TransferSorting→transferSortingHeard` `VillageRoadThreat→villageRoadThreatSeen` `EscortZhou→escortGranted` `CartTalk→cartTalkHeard` `WestDitchOrder→westDitchPointed` `CarryZhou→carryOrdersHeard` `PicketHold→picketHolding` `ZhouCheck→zhouChecked` `Headcount→headcountDone` `GateChallenge→gateChallenged` `ReceptionAccept→receptionAccepted` `MedicAsk→medicExamining` `SquadAssign→squadAssigned` `BridgeOrders→bridgeOrdersHeard` `MarchToTengxian→marchOrderHeard`。

罗班长带路短命令（Guide）按新步骤重排：下线 `GuideTrench` `GuideShelter` `GuideRetreatFirst` `GuideRetreatWall` `GuideRetreatYard` `GuideReception` `GuideRearDefense` `GuideExit` `GuideSouthFlank` `GuideNorthRear`；新增 `GuideRearTrench` `GuideCollection` `GuideAlley` `GuideCart` `GuideWestDitch` `GuideWallPath` `GuideYardGate` `GuideBridge` `GuideWithdraw` `GuideNorthGate`；其余沿用（台词不变则不重烘）。新 Guide 台词不在 Notion 里，由配音包按罗班长口吻写短句（≤12 字，四川话），写进交付报告供验收。

新增说话人（`MISSION_VOICE_CAST`）：`ijaA` `ijaB`（日兵甲/乙，日语）、`captiveWounded`（腿伤川军）、`captiveHelper`（扶人川军）、`guard`（守军）、`keeper`（弹药屋留守兵）、`loader`（接运兵）、`drover`（赶车人）、`picket`（警戒兵）、`rearBearer`/`frontBearer`（后/前抬手）、`gateGuard`（院门守军）、`receiver`（接收人员）、`surgeon`（军医）、`officer`（桥头军官）、`usher`（带路军人）、`crowd`（「飞机——！」「过了村子就是…」这类无名喊话）。沿用：`luo` `shunzi` `yaowa` `heyoutian` `liuwencai` `zhou` `bearer` `runner`。

## 6. 分包与文件归属

并行期间**每个包只改自己名下的文件**；需要动别人文件时把补丁意图写进交付报告，由集成方处理。共享登记点（`index.html` import map、`Script_TestRunner.mjs`）各包只增改自己的行。

### 第一波（并行三路，各自独立 worktree）

| 包 | 名下文件 | 交付 |
| --- | --- | --- |
| **Spine 骨架** | `Data_FirstLevelMission.mjs` `Data_FirstLevelMissionStages.mjs` `Data_FirstLevelMissionGates.mjs` `Data_FirstLevelLeaderGuide.mjs` `Data_Text_FirstLevel.mjs` `Data_Tuning_FirstLevel.mjs` `Script_FirstLevelMissionRuntime.mjs` `Script_FirstLevelOpening*.mjs` `Script_FirstLevelMissionFlow/Checkpoint/StageJump/Column/View/People/Ambush/Transition/LeaderGuide.mjs` `Script_Main.mjs` 里第一关装配那几行 · `Script_FirstLevelMissionTest.mjs` `Script_MissionGatesTest.mjs` `Script_FirstLevelMissionStageJumpTest.mjs` `Script_MenuTest.mjs` `Script_BrowserBundleTest.mjs` 的相关断言 · 军列专属模块/测试的下线与 runner 登记 | 新 27 步表与四张编排表；军列开场从运行时摘除；**每个新步骤先有能走通的最小实现**（按 §2 的事实、用真实触发而不是跳过）；检查点/阶段跳转按新 18 阶段重写；纯 node 门禁全绿；18 个阶段起点都能跳进去且不报错 |
| **Space 空间** | `Data_FirstLevelMissionLayout.mjs` `Data_FirstLevelMissionTerrain.mjs` `Data_FirstLevelMissionTrenches.mjs` `Data_FirstLevelMissionTrenchCover.mjs` `Data_FirstLevelMissionTopology.mjs` `Data_FirstLevelMissionFortifications.mjs` `Data_FirstLevelMissionCrowd.mjs` `Data_FirstLevelMissionCivilianAftermath.mjs` `Script_FirstLevelWhiteboxField.mjs`（仅当确需新图元）· 新测试 `Script_FirstLevelSpaceTest.mjs` · 重写 `Script_FirstLevelMissionTopologyTest.mjs` / `…TopologyBrowserTest.mjs` | §3 的全部新建与改造；契约路线并入 `MISSION_ROUTES`；每个新区一张第一人称白盒截图（留本地 `_shots/`）；**不改** `Script_FirstLevelMissionTest.mjs` |
| **Voice 台词配音** | `Data_FirstLevelMissionDialogue.mjs` `Data_FirstLevelGuideDialogue.mjs` `Data_FirstLevelMissionVoiceAlignment.mjs` `Data_FirstLevelGuideVoiceAlignment.mjs` `Data_FirstLevelMissionVoiceTiming.mjs` `Script_FirstLevelMissionVoice.mjs` `Script_SeedAudioFirstLevelBake.mjs` `Script_FirstLevelVoiceAlign.py` `Audio/FirstLevel/*` `Font/*` 子集与字体戳 | §5 全部 cue 的台词表、逐行字幕开关/译文、SeedAudio 整段烘焙、强制对齐、manifest 清理、`--audio` node 门禁的数据侧全绿 |

### 第二波（骨架合入后并行三路）

**Front（01–07）/ Mid（08–14）/ End（15–18）** 三个玩法包：把各自阶段从「最小实现」做到符合 Notion 的完整演出与通过条件，新逻辑尽量放新模块（运行时只留薄钩子），各自写本段的 `--campaign` 驾驶脚本与定向浏览器验证。空间包同时做军列几何下线与 `bounds` 收缩。

### 第三波（集成）

整关 `--campaign --audio` 正常通关、阶段跳转、编排工作台标签/图标、文档（AGENTS 第一关九条、RebuildAcceptance、StageJump、Topology、VoiceSync、Orchestration §1/§6、AgentReference 第一关节）、缓存戳、prepush。

## 7. 不许丢的既有约束

- 玩家可见中文只进文本表/台词表；运行时闸门模块零中文字面量（`Script_TextTest`）。数值进 `Data_Tuning_FirstLevel`，带出处。
- 编排是表不是脚本：`Script_MissionGatesTest` 的静态对账（运行时只许一处按表 `SpawnEncounter`、`this.Near(` 白名单）继续有效。
- MotionVector 门禁 `Script_MotionVectorContractTest` 与 `Script_CarriagePropVelocityTest` **不得随重构删除**；后者的被测对象随开场更换时，改成新开场的近景道具，保持 high 画质真实资产检查。
- 普通队员阵亡不判失败；老周死亡不判失败；NPC 带路跑停节奏走共享 `SquadMarchAi`。
- 调试跳转、改写任务事实不算正常通关证据。
- 删除资产包（`Animation/FirstLevelTrain/`、车厢环境声等）先列清单报集成方，不自行删。
