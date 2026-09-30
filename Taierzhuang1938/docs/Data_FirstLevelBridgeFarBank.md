# 第一关 18 · 对岸日军步坦部队与脱离战场后再黑屏

用户 2026-09-30 原话：「在最后撤离炸桥的过程中，河对岸还是有比较大量的步坦部队的，只是暂时没有桥过不来（参考 COD5 第一关的结尾），然后脱离战场后才黑幕进入下一幕。」

本文件是这件事的**唯一现状口径**。所属阶段的总口径在 [15–18 玩法包](Data_FirstLevelEnd20260919.md) §「18」，铁路桥模型与坍塌在 [铁路桥](Data_RailBridge.md)，河与桥的几何在 [拓扑](Data_FirstLevelTopology20260919.md) §2。

## 0. 一句话

BridgeCover 起河对岸就有人和车：岸线一排排的步兵、待命的人堆、三辆傀儡八九式；BridgeWithdraw 放出 8 个真战斗 AI，一队冲桥兵沿桥轴冲到被炸那一孔的北半；起爆瞬间桥上的日军被炸死抛起、跟着那一孔落河；桥断后对岸全停在岸边隔河射击，**没有一个日军能过河**；撤离路线延到 113 m、翻过一道缓坡土岗，走到离北岸 200 m 外、对岸真 AI 连续 1.5 s 看不见玩家，才黑屏。

## 1. 模块与归属

| 文件 | 管什么 |
| --- | --- |
| `Data_FirstLevelBridgeFarBank.mjs` | 名册与摆位（一律写成「离北岸岸沿往北 back 米」，岸沿 z 由 `RiverReachAt` 取）、环境射击授权点、炮击落点候选、战车路线、补员出生带。纯数据 |
| `Data_Tuning_FirstLevelEnd.mjs` 的 `farBank` 块 | 全部数值（兵力账、分档、时间线、炮击与机枪节奏、黑屏条件），每条带出处注释 |
| `Script_FirstLevelBridgeFarBank.mjs` | 规则与状态（**零 three**，node 里直接跑）：放兵 / 走位 / 冲桥 / 起爆杀伤 / 分档开火权 / 环境射击轮换 / 补员 / 战车运动学与炮击 / `retreatOutOfReach` |
| `Script_FirstLevelFarBankView.mjs` | 三辆傀儡战车的表现层（带 three）：模型、炮管枢轴、履带滚动、扬尘、排烟、`farBankTank` 碰撞盒、一个共用的 TankAudio |
| `Script_FirstLevelBridge.mjs` | 只加两处接线：按起爆器前问 `farBank.ReadyForBlast`，`Fire()` 里调 `farBank.OnBridgeBlast` |
| `Script_FirstLevelNightGate.mjs` | 黑屏谓词：走过 marchOut 终点（单调）+ `retreatOutOfReach` |
| `Script_FirstLevelMissionRuntime.mjs` | 薄钩子：构造、`Enter`、`Update`、`PlaceNightArrival` 里 `Retire`、`Retry` 的 NightMarch 分支、`State`、`Dispose` |
| `Data_FirstLevelMissionTopology.mjs` | `marchOut` 路线与锚点延长；`bridgeCrossing` 终点改成字面量 (−62,232)，不再引用 `marchOut` |
| `Data_FirstLevelWhiteboxTerrainRear.mjs` / `Data_FirstLevelWhiteboxRear.mjs` | 撤离土岗 `RetreatRise`（新框 `Retreat18`）与岗上的枯树 / 残屋 / 坟包 |

## 2. 几何（河拓宽之后）

北岸岸沿（自然地面）z 90，水面 z 91.6…158.3，南沙滩 158.3…166；桥轴 x −77，三孔桥、炸最南一孔（z 136…160，中心 148）。对岸留给本包的场地是 x −100…−40、z 20…90（R1a 的北岸村子在 x −140…−100）。

| 位置 | 离北岸 dz（m） | 档 |
| --- | --- | --- |
| bridgeCover (−81,179.4) | 89 | contact |
| blastSafe (−66,201) | 111 | mid |
| 原 marchOut (−62,232) | 142 | far |
| (−62,250) | 160 | far |
| 岗脊 z≈276 | 186 | out |
| 新 marchOut (−98,295) | 205 | out |

**前沿交通壕的尾巴（x −58…−30、z −80…60，地面 −2 m）**和 RearFarm 院子（x −72.5…−59.5、z 21.5…32.5）横在东边战车的直线上，所以东边那辆走 `via` 绕过去（Data 里 `FarBankTankEast.via`）。BridgeNorthRidge 两段土坎（z 82.2，厚 1.2 m）在岸沿以北 7.8 m，战车停位 `pushBackM` 不小于 12（车头长 2.15 m）。

## 3. 三层兵力

同屏日军总数不超 `actorPool` 预建的 ija:48：`ijaCap` 44，`bridgeNorth` 4 个 + 真 AI 8 + 脚本兵峰值 28。

| 层 | 数量 | 实现 | 行为 |
| --- | --- | --- | --- |
| bridgeNorth | 4 | 原样（`MISSION_ENCOUNTERS.bridgeNorth`） | BridgeCover 打玩家与尾队；`BridgeNorthA` 出生点挪到土坎北面（z−1，原来的走位线擦着土坎南脸） |
| 真 AI | 8（三八式 5、十一年式 2、军官位 1） | `ai.Spawn("ija")`，**不进 `r.enemies`** | BridgeWithdraw 放出，走到射位 `Defend`；开火权按分档写 `missionFireHold` / `missionFireSuppressOnly` |
| 脚本兵 | 岸线 12 + 补拨 6 + 待命 10（前六个是冲桥组）+ 前锋 2（从岸线抽） | `scriptedNoncombatant` + 环境射击（`ambientFirePoints`，命中恒 false） | 走位、站岸线、来回踱；同时有授权点的最多 `ambientMax` 人，轮换；`missionUntargetable`（班里人不隔河点名，玩家照样打得到） |
| 战车 | 3 | 傀儡 `Type89Tank` | 运动学开进、转炮塔、炮击安全落点、机枪曳光；不可摧毁；碰撞盒 tag `farBankTank`（**不是** `missionTank`，不触发 03–05 的 `tankRuntime.OnBulletHit`） |

**为什么真 AI 不进 `r.enemies`**：`FireWindows` 每拍会重置 `r.enemies` 里的 `missionFireHold`；`Threatens` / `FireBroken` / `BlastZoneOccupant` 也不该看见他们（EndTest 的「爆破区无己方」不受影响）。**为什么脚本兵用 AI 兵**：46 m 外自动降为 ActorCrowd 批渲染；开枪走大脑的环境射击，不需要自己打一发子弹。

真 AI 在 90–100 m 上几乎只有机枪手能开火：`ENGAGE.defaultM` 74、`supportM` 95，步枪手超了只 `WATCH`；玩家蹲着 80 m 外根本看不见（`SIGHT_BY_STANCE` 站 120 / 蹲 80 / 卧 45，是**目标姿态**决定被发现的距离）。所以对岸对玩家的真实威胁本来就小，分档开火权是兜底。

## 4. 时间线（挂事实，不挂计时器）

| 时刻 / 事实 | 对岸 |
| --- | --- |
| BridgeOrders | 无 |
| BridgeCover 起 | 放第一拨：岸线 12 + 待命 10 从北面 100–124 m 外走进来（每 0.9 s 一个）；T1（东）、T2（西，隔 7 s）从岸沿以北 140 m 开进来 |
| `southBankReached` +8 s | 战车机枪曳光（contact / mid 档，`damageScale` 0） |
| `bridgeFireBroken` | 岸线上靠桥轴的两个人（前锋）冲上桥北段趴下朝尾队开火；T3 进场 |
| `rearColumnCrossed` | 前锋退回岸边 |
| BridgeWithdraw 起 | 放第二拨：真 AI 8 + 岸线补拨 6 从视线外走进来；`rushDelayS` 1.5 s 后六个待命兵沿桥轴冲到被炸孔北半（z 136…148）趴下；战车推到岸边开始炮击安全落点；桥头人员与尾队标 `missionUntargetable` |
| 药装好 + 玩家到 blastSafe + 爆破区清空 | Bridge 在按起爆器之前问 `farBank.ReadyForBlast`：冲桥组没到位就等（`rushWaitMaxS` 9 s 封顶），到位后站稳 `rushSettleS` 1.2 s 才放行 |
| `bridgeDestroyed` +0.25 s | 桥面 x ±5.5、z 136…160、离起爆中心 13 m 内的日军当场炸死：`Kill` + `deathPush`（向上 6.2 m/s、水平 2.2 m/s），24 m 内其余的趴 1.6 s；桥面 gate 在同一拍摘掉，人跟着那一孔落河；尸体 8 s 后 `ai.Remove` |
| 起爆 14 s 后 | 活着的人全在岸沿以南 0.5 m 之内（`bankSettleS`），没有一个过南水线 |
| NightMarch | 分档衰减；补员保持脚本兵 ≥ 16 |
| 黑屏（`PlaceNightArrival`） | `farBank.Retire()`：对岸全部移除、战车收起 |

## 5. 撤离路线与黑屏条件

`marchOut`：blastSafe → (−64,216) → (−62,232) → (−62,250) → (−68,268) → (−80,284) → (−98,295)，共 109 m。锚点 `marchOut` 挪到 (−98,295)；`bridgeCrossing`（尾队线）终点 (−62,232) 与它解耦。

**撤离土岗 `RetreatRise`**（`Data_FirstLevelWhiteboxTerrainRear`，新框 `Retreat18`：x −132…−30、z 260…330，与 Bridge18 / Reception15 / Night18 只在边线相接）：岗脊 z≈276（离北岸 186 m）、最高 2.7 m、每侧 13 m 缓坡（最陡 17°），脊线略弯、两头收低；岸边加两个小土包。岗上五棵枯树、两处残屋、八个坟包与几丛枯草（`Data_FirstLevelWhiteboxRear` 的 Retreat18 一节）一起断视线，读起来是田埂岗子，不是一堵土墙。站在岗后 z ≥ 290，眼高 1.65 m 到对岸的视线被岗脊挡住；离北岸 ≥ 140 m 之前一路都还看得见对岸（回头看那两张图）。`Script_FirstLevelFarBankTest` 量这两条。

**`retreatOutOfReach`**（`FirstLevelFarBank.UpdateOutOfReach`，只在 NightMarch 判）：`dz ≥ outDzM`（190）、对岸真 AI（含 `bridgeNorth` 幸存者）连续 `blindS`（1.5）秒没有 `target` 是玩家且 `targetVisible`，且眼位到最近三个对岸单位的视线被地形 / 地物挡住（`BlocksSight`）；绕开土岗走空地的兜底是 `dz ≥ outFallbackDzM`（215）。**夜转场要 `marchOutReached`（沿路线走完，单调：走过头、擦过终点都算，不再要求踩进 8 m 圈）且 `retreatOutOfReach`**。`marchOutReached` 只在黑屏真的起来那一刻记 —— `Retry()` 的 NightMarch 分支据它分辨「A 段阵亡」（正常在检查点重生、接着走）与「黑屏之后阵亡」（重演黑屏）。修了原来那个隐患：A 段阵亡也会被直接送进夜景。

## 6. 分档与伤害平衡

dz = 玩家 z − 北岸岸沿 z。阈值 `tierM = [100, 130, 170]`。

| 档 | dz | 真 AI | 环境射击 | 炮弹落点离玩家 | 车载机枪 |
| --- | --- | --- | --- | --- | --- |
| contact | < 100（射位 89） | 2 个机枪手轮换真开火，其余只压制 | 开 | ≥ 22 m | 开 |
| mid | 100–130（安全区 111） | 全体只压制 | 开 | ≥ 32 m | 开 |
| far | 130–170 | 全体只压制 | 停 | ≥ 48 m（远雷） | 停 |
| out | ≥ 170 | — | 停 | — | 停 |

炮击安全落点：离玩家 ≥ 档位下限、离**任何己方**（班里人、桥头人员、尾队）≥ 10 m、离玩家要走的路线（toBridge / bridgeWithdraw / marchOut）≥ 8 m；起飞前再验一次，`PredictShellImpact` 偏离目标超过 4 m（弹道被桁架 / 土坎截了）就放弃这个点；全场每 3.5 s 最多一发、单车 7 s、离玩家 35 m 内的每 7 s 最多一发。炮弹一律 `FireShell {kind:"Shell57", flight:1.5, damage:0, feedbackOnly:true}`，只给震屏 / 耳鸣 / 爆炸声，不伤人、不炸士兵、不制坑。车载机枪 `FireVehicleBullet {weaponId:"Type11", damageScale:0}`，曳光与枪口焰照出。

## 7. 性能

（见 §9 实测。）

## 8. 门禁

| 门 | 覆盖 |
| --- | --- |
| `Script_FirstLevelFarBankTest`（纯 node，`firstLevel` 域） | 名册站得住、兵力账、冲桥终点、射击点与炮击点安全、战车路线净空、撤离路线净空与土岗断视线、替身宿主时间线（放兵 / 冲桥 / `ReadyForBlast` / 起爆杀伤 / 不过河 / 补员 / 分档 / 黑屏条件 / `Retire` / 回跳） |
| `Script_FirstLevelEndTest` | 13b：黑屏要等 `retreatOutOfReach`、走过头也算走完、半路不黑屏 |
| `Script_MissionGatesTest` | 新事实 `retreatOutOfReach` 登记（147 条事实门） |
| `Script_FirstLevelMissionBrowserTest --campaign --stage-jumps --stage-from=18` | 驾驶脚本 `Script_FirstLevelCampaignEnd` 的对岸断言：数量、战车落点最小距离、冲桥、桥断后对岸停在岸边、没有日军到南岸、黑屏前脱离战场、黑屏后全部收走、整趟玩家血量 |
| `Script_FirstLevelFarBankShots` | 出图（whitebox / high 两套）与 A/B 帧耗时（`--perf`、`--baseline-root`） |

## 9. 实测与坑

（实测数据、性能与已知遗留见本节，验收后填写。）
