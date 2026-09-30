# 第一关 18 · 对岸日军步坦部队与脱离战场后再黑屏

用户 2026-09-30 原话：「在最后撤离炸桥的过程中，河对岸还是有比较大量的步坦部队的，只是暂时没有桥过不来（参考 COD5 第一关的结尾），然后脱离战场后才黑幕进入下一幕。」

本文件是这件事的**唯一现状口径**。所属阶段的总口径在 [15–18 玩法包](Data_FirstLevelEnd20260919.md) §「18」，铁路桥模型与坍塌在 [铁路桥](Data_RailBridge.md)，河与桥的几何在 [拓扑](Data_FirstLevelTopology20260919.md) §2。

## 0. 一句话

BridgeCover 起河对岸就有人和车：岸线一排排的步兵、待命的人堆、三辆傀儡八九式；BridgeWithdraw 放出 8 个真战斗 AI，一队冲桥兵沿桥轴冲到被炸那一孔的北半；起爆瞬间桥上的日军被炸死抛起、跟着那一孔落河；桥断后对岸全停在岸边隔河射击，**没有一个日军能过河**；撤离路线延到 113 m、翻过一道缓坡土岗，走到离北岸 200 m 外、对岸真 AI 连续 1.5 s 看不见玩家，才黑屏。

**2026-09-30 R2b 规模感**：对岸再多出约 300 个只画不打的视觉人群、16 面旗、战车挪到看得见的位置（一辆在桥面上），见 [§10](#10-2026-09-30-规模感r2b)。R1c 之后射位是南堤西段堤顶 (−97,173.5)、桥面高 1.5，本文 §2 表格里的射位距离按 R1c 之前写的，以 §10 与 `Data_FirstLevelMissionTopology` 为准。

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
| 脚本兵 | 岸线 12 + 补拨 6 + 待命 10（前六个是冲桥组）+ 前锋 2（从岸线抽） | `scriptedNoncombatant` + 环境射击（`ambientFirePoints`，命中恒 false） | 走位、站岸线、来回踱、涌上桥；同时有授权点的最多 `ambientMax` 人，轮换；`missionUntargetable`（班里人不隔河点名，玩家照样打得到） |
| 战车 | 3 | 傀儡 `Type89Tank` | 运动学开进、转炮塔、炮击安全落点、机枪曳光；不可摧毁；碰撞盒 tag `farBankTank`（**不是** `missionTank`，不触发 03–05 的 `tankRuntime.OnBulletHit`） |

**走进来的路（没有导航网格，直走会卡）**：所有人都从桥轴（x −77）上往北 100–130 m 出生，沿桥轴走下来 —— 桥轴两侧是 BridgeNorthRidge 两段土坎之间的缺口，
北边一路没有 RearFarm 院子、前沿壕沟尾巴与北岸西侧村子 —— 走到自己那一排的 z 再横着走（`FarBankWalkInVia`）；岸线上的人穿过缺口到 z 85.5 再横走，土坎后面的人在北面 z 78 走廊里横走。
桥面上退回岸边同样先走出缺口（`GoHome`）。测试逐条量净空（0.5 m 内无实心件、地面不低于 −0.5 m）。**这一条是实拍抓出来的**：待命兵直线走下来卡在 RearFarm 北墙前，冲桥组因此迟迟到不齐；
桥面上的人斜插回岸边会顶在桁架与空气墙上，起爆 14 s 后还有 8 个人在桥上。

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
| 起爆 20 s 后 | 活着的人全在岸沿以南 0.5 m 之内（`bankSettleS`），没有一个过南水线 |
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

* 同屏日军峰值 40（BridgeWithdraw：真 AI 8 + `bridgeNorth` 幸存者 + 脚本兵 28），远低于 `ijaCap` 44 / actorPool 48；黑屏前补员靠 `ijaCap` 卡死。
* 傀儡战车 3 辆 × 约 4.1 k 三角 / 4 draw（`Type89Tank`，材质共用，履带材质每辆克隆一份、共用补丁 key），碰撞盒只进 `physics`（不进 `battlefield.colliders`）；
  发动机循环只跟最近的一辆（一个共用 TankAudio 实例，三条循环 × 三辆会占满声部预算）；对岸兵在 46 m 外全是 ActorCrowd 批渲染。
* 环境射击同时最多 `ambientMax`（12）人有授权点、每 2 s 轮换；车载机枪每辆每 3.5–7 s 一串 4–8 发。
* 集结地上空 10 团大而淡的 dust 源（半径 11 m、不透明 0.2，预热成稳态）：九十米外一个人只有十来个像素，成片的烟尘才读得出「一大群」。

实测（`Script_FirstLevelFarBankShots --perf`，whitebox 画质，headless Chromium，本机同时有别的会话在跑浏览器，所以**只看同一轮里 A/B 的差**；
基线树 = 河拓宽提交 a35a763e，本树 = 本包，交替 基-本-基-本-基-本 各 3 轮，单位 ms，取三轮 p50 的中位数）：

| 时间点（游戏时间） | 基线 p50 | 本树 p50 | 差 | draw（基线 → 本树） | 三角形（基线 → 本树） | 日军数 |
| --- | --- | --- | --- | --- | --- | --- |
| BridgeCover +60 s（第一拨与战车到位） | 15.8 | 18.9 | +3.1 | 413 → 430 | 2.33 M → 2.42 M | 5 → 26 |
| BridgeWithdraw +22 s（真 AI、冲桥、桥头人堆、炮击） | 10.2 | 15.1 | +4.9 | 358 → 386 | 2.25 M → 2.44 M | 5 → 40 |
| 起爆 +0.2 s | 12.5 | 19.3 | +6.8 | 413 → 423 | 2.33 M → 2.43 M | 5 → 34 |
| 起爆 +3 s | 11.7 | 16.1 | +4.4 | 398 → 405 | 2.29 M → 2.39 M | 5 → 34 |
| 撤离离北岸 ~120 m | 12.6 | 12.7 | ≈ 0 | 404 → 416 | 2.43 M → 2.53 M | 5 → 34 |

相邻一对（基→本）的差：Withdraw +4.9 / +5.8 / +7.9，起爆瞬间 +4.6 / +7.6 / +2.8。CPU 侧（AI 思考、环境射击、战车运动学与炮击）花的：多出的 ~35 个日军 AI 与 3 辆车 ≈ **+5 ms / 帧**（约 +45 %），
drawcall 只多 10–28、三角形多 0.1–0.19 M（第一关整场约 4.3 M、红线 8.1 M，远未到线）。离北岸 120 m 起对岸单位大半在 ActorCrowd 里，差回到 0。
另：whitebox 首轮出图里 Withdraw +22 s 那一组样本出现过一次 0.88 s 的 p95 卡顿（首次见到炮口焰 / 炮弹爆点的着色器编译一类），
之后的 A/B 三轮与 high 画质出图都没复现（p95 ≤ 24 ms）；如果线上要根治，把 `Shell57` 爆点与 `cannon` 炮口焰放进第一关的着色器预热清单。

## 8. 门禁

| 门 | 覆盖 |
| --- | --- |
| `Script_FirstLevelFarBankTest`（纯 node，`firstLevel` 域） | 名册站得住、兵力账、冲桥终点、射击点与炮击点安全、战车路线净空、撤离路线净空与土岗断视线、替身宿主时间线（放兵 / 冲桥 / `ReadyForBlast` / 起爆杀伤 / 不过河 / 补员 / 分档 / 黑屏条件 / `Retire` / 回跳） |
| `Script_FirstLevelEndTest` | 13b：黑屏要等 `retreatOutOfReach`、走过头也算走完、半路不黑屏 |
| `Script_MissionGatesTest` | 新事实 `retreatOutOfReach` 登记（147 条事实门） |
| `Script_FirstLevelMissionBrowserTest --campaign --stage-jumps --stage-from=18` | 驾驶脚本 `Script_FirstLevelCampaignEnd` 的对岸断言：数量、战车落点最小距离、冲桥、桥断后对岸停在岸边、没有日军到南岸、黑屏前脱离战场、黑屏后全部收走、整趟玩家血量 |
| `Script_FirstLevelFarBankShots` | 出图（whitebox / high 两套）与 A/B 帧耗时（`--perf`、`--baseline-root`） |
| `Script_FirstLevelFarBankTest` 的规模感块（§10.7） | 视觉人群名册 / 站位 / 路线 / 时间线 / 枪口焰按档 / 射位视野离线估计；战车摆位与桥面推进 |

## 9. 实测与坑

### 玩家会不会被隔河秒掉（驾驶脚本整趟实测，2026-09-30）

`Script_FirstLevelCampaignEnd` 在整趟 18 里每次 `StepFrames` 之后采样玩家血量与开火（`FARBANK_PROBE`）。整趟：**血量始终 100，0 次受伤，压制最高 0.29**；
其中一趟里玩家开了 2 枪、2 枪都打中对岸的人（最远 96.9 m，`hitKind soldier`，落差 0.10 m）；另一趟 BridgeCover 是班里人先把 `bridgeNorth` 压下来的、玩家一枪没开 —— 所以「打得下来」的证据是前一趟的命中，而不是每趟都必须玩家亲手打。驾驶脚本在 BridgeWithdraw 起点站姿原地等了 20 s 以上（真 AI 8 + 战车 3 + 车载机枪 + 环境射击都在场）也没掉一点血 ——
90–100 m 上真 AI 只有机枪手（`ENGAGE.supportM` 95）够得着，蹲姿 80 m 外根本看不见，炮弹与机枪曳光是零伤害。玩家要真被打到得站起来往前走进 74 m 内（对岸真 AI 的步枪手才会真打）。
BridgeCover 打得下来：driver 的 `Target` 射程在 18 放到 105 m，站在射位上一边打土坎一边等对岸第一拨，`bridgeFireBroken` 由真开枪 + 班里人压下来。

### 数量、落点、过河（驾驶脚本断言）

* BridgeCover 到位后对岸岸线 12 + 待命 10（`FARBANK_COVER`），同屏日军 30 ≤ 44；BridgeWithdraw 真 AI 8、`ija` 40 ≤ 44。
* 战车炮击：整趟 15–21 发（撤离 160 m 时），**离玩家最近 23.5 m（contact 档下限 22）、离己方最近 19.6 m（下限 10）**；三辆车同一拍瞄好时后到的等着（全场间隔 3.5 s）。
* 起爆：冲桥组 6 人全在被炸孔北半（z 139–144）被炸死抛起（`blastKilled` 6），尸体 8 s 后移除；起爆 20 s 后 `overAfterSettle` 0，**整趟对岸最靠南的日军 z 143.1（桥面上），`southBank` 恒 0**。
* 黑屏：`retreatOutOfReach` 记在离北岸 196–202 m、岗后视线被挡住（`hidden` true）、连续 ≥ 1.5 s 没有真 AI 看见；黑屏里 `Retire` 后对岸 0 人。
* 节奏（游戏秒，最后一趟）：BridgeCover 124、BridgeWithdraw 44（原 24：多出来的是玩家在射位的 20 s 观察与等冲桥组）、NightMarch 69（原 33：路线延长到 109 m）。

### 已知遗留与坑

* **（R2 时的口径，R2b 已加强，见 §10）规模感受限于几何**：河拓宽之后北岸离射位 90–100 m，1280×720、默认视野下一个人只有十来个像素，30 个人 + 3 辆车 + 烟尘读出来是「岸上有一群人和车在动、在打」，
  不是 COD5 那种压满画面的黑压压一片。桥头人堆（8 人单膝跪在桥面北两孔、离玩家 50–90 m）与冲桥组（离玩家 40 m）是最近、最显眼的一群。要再加强得靠更多、更近的东西（继续加兵会撞 actorPool ija:48）。
* **真 AI 站姿才看得见**：`SIGHT_BY_STANCE` 是目标姿态决定被发现的距离，蹲在射位上的玩家对岸步枪手看不见（机枪手靠听枪声也只压制）。
* 冲桥组按「到位再起爆」等，但 Bridge 只在药装好、玩家到安全区、爆破区清空之后才问 `ReadyForBlast`；手快的玩家（约 14 s）会比冲桥组早，`rushWaitMaxS`（16 s）封顶：超时放行时冲桥兵还在桥北孔上，起爆后他们没被炸死、退回岸边（不会走进断口）。
* 三孔桥的桥墩挡在桥轴下：任何按「河床高度」判净空的测试（`Script_FirstLevelMissionTest` 的路线净空）要按桥面算（R1a 已改）。
* 前沿交通壕的尾巴（x −58…−30、z −80…60 深 2 m）横在东边战车的直线上，东边那辆走 `via` 绕院子；R1a 的北岸村子（x −143…−102、z 54…83）占了原来的西边战车线，西边战车挪到 x −99。
* 空气墙（`semantic airWall`）只挡角色控制器，测试里视线判定要排除它，路线 / 站位净空要算它（R1a 的北岸沿线空气墙留了 x −79.7…−74.2 的口子给桥面）。
* 撤离土岗改了地形，**07+ 指纹（`Data_FirstLevelSpaceSouthFingerprint.json`）会红，集成时统一重生**；`Data_BreakableTreePlacements` 的随机撒树按路线避让，新增的 `marchOut` 延长段会让含这段路线的树区重抽。
* 基线红（改前就红，与本包无关）：`Script_FirstLevelEndTest` 的 death 接管 14 s 与 `ZhouDeath` 15.62 s（配音重录后没同步 `deathSeconds`）、`Script_TestRunnerTest` 三个未登记文件（LitterBearer 相关）、`Script_RailBridgeTest` 地形快照（R1b 的桥重建要重导）。

## 10. 2026-09-30 规模感（R2b）

用户的意思：R2 把兵力、时间线、撤离做对了，但从射位看，对岸只是地平线上一条细带、人十来个像素、战车根本看不见，读不出「河对岸压着成片的步兵和坦克」。
R1c 合入之后射位是南堤西段堤顶 (−97,173.5)（眼高 3.15 m，离北岸岸沿 83 m，垂直视场 55°、1280×720 时一米高的东西约 7–8 px）。本节是这一轮加的东西，**只加视觉，不加战斗**。

### 10.1 一句话

对岸多出 **约 300 个只画不打的日军**（岸线五排、桥头纵队、路堤两侧留守成堆、沿路堤成纵队涌来）、16 面日章旗、21 把举起的指挥刀，
岸线上每秒 24 个枪口焰 / 曳光；三辆傀儡战车挪到看得见的地方（一辆在桥面上、两辆在岸边空地上，炮口对南岸）；岸线人群身后一条浅色尘幕。
同屏日军的 AI 账不变（`ijaCap` 44、`actorPool` ija:48）：这批人不进 `ai.soldiers` / `r.enemies`。

### 10.2 新模块与改动

| 文件 | 管什么 |
| --- | --- |
| `Data_FirstLevelFarBankCrowd.mjs` | 名册生成（确定性）：岸线五排 / 桥头纵队 / 留守 / 旗与刀 / 出发路线 / 分拨；`CrowdGroundY`（桥面上取桥面高度，其余取地形）。纯数据，零 three |
| `Script_FirstLevelFarBankCrowd.mjs` | `FarBankCrowd`：状态机（等 → 跑 → 在位 → 起爆趴下 → 爬起 / 溜达）、分拨触发、枪口焰事件、`Draw(crowd, view)`（往一层 ActorCrowd 里 Push）。零 three |
| `Script_FirstLevelFarBankCrowdView.mjs` | 表现层：人群自己的一层 `ActorCrowd`（粗聚类 `cellM` 0.07、军装提亮 2.6 倍）、日章旗与指挥刀（**逐个普通 Mesh**，不是 InstancedMesh：会动的实例没有前帧历史，见 `Data_MotionVectorContract.md`）、枪口焰 / 曳光 / 弹着（共用 vfx） |
| `Script_FirstLevelBridgeFarBank.mjs` | 持有 `this.crowd`；桥面上那辆战车（`kind: "bridge"`）起爆后的推进 `UpdateBridgeTank`；开炮的炮口焰与尘环放大（`cannonFxScale`）；`State().crowd` |
| `Data_FirstLevelBridgeFarBank.mjs` | 战车摆位（见 10.4）；R2 冲桥组 / 人堆 / 前锋的车道 ±1.4 → **±1.75**（让出桥面中线给战车）；`axisS2` 与 `axis` 射击表；官员位与几个射击点按新射位重摆 |
| `Script_FirstLevelFarBankView.mjs` | 战车按 `groundAt` 贴地（桥面上那辆按桥面高度）；战车组挂 `whiteboxCharacter`（白盒里战车保持本色）；岸线尘幕（11 团贴地浅尘，`SHORE_DUST_SPOTS`） |
| `Data_FirstLevelVegetation.mjs` | 新增 `northBankMaxHeightM` 0.55：拓宽河段北岸岸沿带（岸沿以北 9 m）的卡片压到 0.55 m 以下 —— 1.8 m 的芦苇把站着的人整个挡住（high 画质里岸上一个人也看不见，只剩旗） |
| `Data_Tuning_FirstLevelEnd.mjs` `farBank.crowd` | 分拨占比与出发间隔、跑速、`spawnBackM`、起爆趴下、枪口焰频率与放大倍数、溜达；`blastAdvanceWaitS` / `blastAdvanceMaxS`、`cannonFxScale` |
| `Script_FirstLevelMissionRuntime.mjs` | 构造 `farBankCrowdView`、`Sync`、`Dispose`；BridgeOrders 进入时预烘（约 0.2 s） |
| `index.html` | import map 登记三个新模块；`?v=20261003400001` |

**为什么人群自己一层 ActorCrowd，不挂进 AI 的远景层**：AI 的那层每人约 2.7 k 面（`cellM` 0.045），三百人 = 0.8 M 面；这层 `cellM` 0.07 每人约 1.2 k 面。
更要紧的是 high 画质下一百米外的雾里，暗橄榄色的人**看不见**（实拍：岸上只剩几面旗）—— 提亮只能作用在自己这层的材质克隆上，不能动 AI 的远景层与近景人物。
代价：一次约 0.2 s 的烘焙（BridgeOrders 时付）、多 7 个 draw call。

### 10.3 兵力分层（更新 §3）

| 层 | 数量 | 说明 |
| --- | --- | --- |
| bridgeNorth / 真 AI / 脚本兵 | 4 / 8 / ≤ 28 | R2 原样，占 actorPool |
| **视觉人群** | 岸线 180、桥头纵队 49、留守 78、共 307（`State().crowd.total`） | 不占 actorPool，不进 `r.enemies`，**打不中**（玩家的子弹穿过去；离玩家 ≥ 45 m）；枪口焰 / 曳光只是事件 |
| 战车 | 3 | 傀儡 |

- **岸线五排**：离岸沿 1.7 / 2.9 / 4.1 / 5.3 / 6.6 m，排内间距 1.15–1.5 m；姿势靠前的卧与跪、靠后的站；桥轴缺口 ±7 m 与两辆岸边战车的车体让开，压到 R2 名册位 1.4 m 内、贴土坎、彼此 0.85 m 内的位置拒绝。
- **桥头纵队**：桥中北两孔桥面上两列（离桥轴 ±2.15 m，桁架内净宽 ±2.7），z 94…117、每 0.95 m 一个，前排跪、后排站；R2 的人堆（z 120…132）与冲桥组（z ≥ 136）在它前面接上。
- **留守**：桥轴路堤两侧土坎以北的八堆，站着、每 5–12 s 在 2.2 m 内换个位置。
- **旗 / 刀**：站姿的人里每 11 个挑一个举旗（旗杆 4.2 m、旗面 2.1×1.4 m、白底红圆，随风摆）；桥头前排两把刀、留守与岸线站姿里再挑；刀边走边挥。
- **分拨**（占比与出发间隔在 `farBank.crowd.waves`）：cover（BridgeCover 起，44 %）→ fire（`bridgeFireBroken` 或 cover 起 40 s，24 %）→ withdraw（BridgeWithdraw 起，24 %）→ blast（起爆后 1.5 s，8 %，桥断后仍源源不断涌到岸边）。
  出发点在桥轴路堤上离岸沿 100 m（离射位 ≥ 150 m）、跑速 3.5 ± 0.5 m/s，翻页相位按 `strideM` 2.995 m 走，脚不打滑；最长的一条路 < 60 s，所以射位站姿 +60 s 那一刻第一、二拨都到位。
  路线：桥轴路堤（±2.4 m 内错开）→ z 72 → 缺口南口 z 84.5 → 西 / 东段沿岸沿以北 3.2 m 的走廊横走 → 自己的位（贴着走廊，不穿岸沿空气墙、房子与杨树）。
- **起爆**：90 m 内在位的人趴 1.4 ± 0.8 s 再爬起来接着打；被炸孔上（z ≥ 135.5）没有人，也没有人越过岸沿。
- **开火**（只挑上一帧在视锥里的人）：contact / mid / far / out 档每秒 24 / 14 / 5 / 0 个枪口焰（`MuzzleFlash` rifle、放大 2.6）+ 曳光（`Tracer` ija）打向南岸沙滩与堤顶的授权点（R2 那批点里去掉桥面与桥墩的），30 % 带弹着尘。**没有枪声**（现有真 AI 的环境射击与战车机枪的声音够用，声部预算不加）。

### 10.4 战车摆位（改 §2 / §3）

| 车 | 位置 | 时间线 |
| --- | --- | --- |
| `FarBankTankBridge`（`kind: "bridge"`） | 沿桥轴路堤开下来，BridgeCover 起停在桥中孔桥面上 z 122（离射位 ≈ 55 m）；起爆 5 s 后（桥面上没有己方了，最多等 16 s）往前开到 z 128.5，车头 z 130.7，**断口（2 号墩 z 136）北侧** | 只打机枪曳光（`axis` 表：桥轴南端两个点）；主炮不开 —— 在桁架里弹道出不去，桥轴南岸 10 m 内还站着官员 |
| `FarBankTankWest` | (−98, 84.2)，岸沿以北 6 m，西土坎（x −92…−82）以西 | 炮击安全落点 + 机枪；开炮炮口焰与尘环放大 1.7 倍 |
| `FarBankTankEast` | (−57, 84.1)，东土坎（x −72…−60）以东 | 同上 |

三辆都在 BridgeCover 起进场（间隔 `tankStaggerS` 7 s），都从桥轴路堤出发（`startX` −77）：桥面上那辆一路开到位，另两辆在 z≈70 处分头（`via`），不穿土坎、不压 RearFarm 院子与前沿壕沟尾巴。
桥面上那辆的车轮高度由 `groundAt` 给（桥面 `deckTopY`，不是河床）；R1c 又改桥面高度时自动跟着走。

### 10.5 性能（`Script_FirstLevelFarBankShots --perf --baseline-root`，同机交替 基-本-基-本-基-本，三轮取 p50）

基线树 = `80e7722b`（R1c 合入后、规模感之前）。单位 ms；本机同时有别的会话在跑浏览器，只看同一轮里 A/B 的差。

whitebox（默认画质）：

| 时间点 | 基线 p50 | 本树 p50 | 差 | draw | 三角形 |
| --- | --- | --- | --- | --- | --- |
| BridgeCover +60 s | 6.9 | 8.0 | +1.1（逐对 +1.0 / +0.9 / +2.6） | 388 → 424 | 2.36 M → 2.63 M |
| BridgeWithdraw +22 s | 11.6 | 12.8 | +1.2（+1.4 / +1.7 / −0.8） | 392 → 436 | 2.50 M → 2.86 M |
| 起爆 +0.2 s | 7.9 | 10.1 | +2.2（+2.2 / +2.8 / +1.0） | 425 → 469 | 2.45 M → 2.80 M |
| 起爆 +3 s | 7.2 | 7.6 | +0.4 | 407 → 451 | 2.41 M → 2.78 M |
| 撤离 ~120 m | 6.9 | 9.0 | +2.1 | 418 → 461 | 2.53 M → 2.92 M |

high 画质（噪声大：本机同时有别的会话在跑，首轮着色器编译会把某一轮拉到 30 ms 以上；下表取三轮 p50，逐对差取中位数）：

| 时间点 | 基线 p50 | 本树 p50 | 差（逐对 基→本） | draw | 三角形 |
| --- | --- | --- | --- | --- | --- |
| BridgeCover +60 s | 31.7（其中一轮 18.3） | 17.1（另两轮 16.1 / 34.2） | 逐对 +2.5 / −14.8 / −2.2，中位 ≈ 0（干净的两轮：基线 18.3、本树 16.1–17.1） | 1145 → 1218 | 7.37 M → 7.91 M |
| BridgeWithdraw +22 s | 26.8 | 29.3 | +2.5（+4.2 / +1.7 / +2.0） | 903 → 1022 | 6.94 M → 7.66 M |
| 起爆 +0.2 s | 15.3 | 16.8 | +1.5（−3.7 / +1.6 / +1.6） | 1083 → 1170 | 7.66 M → 8.35 M |
| 起爆 +3 s | 13.8 | 14.6 | +0.8 | 1017 → 1101 | 6.92 M → 7.66 M |
| 撤离 ~120 m | 15.6 | 19.1 | +3.5（+16.7 噪声 / +3.5 / +0.7） | 1012 → 1112 | 7.92 M → 8.72 M |

high 下三角形整场最多 8.72 M（撤离 120 m 处），在 `SCENE_RENDER_LIMITS` 的 9.0 M 线内、余量 0.28 M；基线（R2 + R1c）在同一处已经是 7.92 M（high 画质的植被 / 桥 / 水面占大头），本轮多出 0.6–0.8 M（人群 ≈ 0.4 M + 旗刀 + 尘 + 战车）。
再要加人先动人群的 `cellM`（0.07 → 0.1，每人再少 ~500 面）或岸线第五排。

目标是比 R2 现状多 ≤ 3 ms（p50）：whitebox 三个必量点 +1.1 / +1.2 / +2.2，达标。多出来的是：~300 个人的 Push（CPU，每人 7 个网格各一次矩阵写入）+ 16 个旗 / 刀 Mesh + 每秒 24 个枪口焰粒子事件 + 战车尘环；
draw +36…44（人群自己 7 个批次 + 旗刀 + 战车尘），三角形 +0.27…0.39 M（第一关整场约 4.3 M、红线 8.1 M）。

### 10.6 实拍取证（`Script_FirstLevelFarBankShots`，出图目录见报告）

* 射位站姿默认视野（垂直视场 55°）里：岸线一排排的人加旗（whitebox 里深浅分明，high 里靠提亮的军装与浅色尘幕读出剪影）、桥上一辆战车、岸边两辆战车；桥头纵队在桁架里（high 画质桁架是黑钢，人与桁架混在一起，比岸线上的更难读）。
* **一个没看过项目的人看 whitebox 图能说出「对岸有一排排的日军和旗、还有坦克」**；high 里岸线的人仍偏小（六七个像素），主要靠旗、战车、烟尘和枪口焰读出规模。这是几何决定的：北岸离射位 83–90 m、眼高 3.15 m，
  平地在屏幕上被压成地平线下 5–8 px 的一条带，再多的人也只是这条带上更密一点。
* 起爆与「桥断停岸」两张（blastSafe 离北岸 111 m）人更小，读规模靠旗、战车与断口北侧那辆车。

### 10.7 门禁与坑

* `Script_FirstLevelFarBankTest`（1570 项）加了一整块规模感：名册数量与分拨、站位（实心体块 / 地面 / 挤压 / 让战车）、每条路线逐 0.5 m 量净空、最长路线 < 60 s、时间线（+20 s / +60 s 到位、分拨放行、起爆趴下再爬起、桥断后全在位、没人过岸沿也没人到被炸孔上）、枪口焰频率按档、射位默认视野里 ≥ 60 个 ≥ 6 px 高的人的离线估计、`Retire` 与阶段跳转直接在位。
  `FARBANK_SOFT=1` 让每条 Check 只报不停（开发时一次看全）。
* 驾驶脚本 `Script_FirstLevelCampaignEnd` 加：BridgeWithdraw 视觉人群 ≥ 200、三辆战车都到位且桥面上那辆在桥中孔；桥断 21 s 后视觉人群 ≥ 280 在场、桥面上那辆车头在 2 号墩以北。
* **坑 1（实拍抓出来）**：岸沿带的植被（芦苇 1.8 m）把人挡光，见上表 `northBankMaxHeightM`。
* **坑 2**：high 画质下暗橄榄色的人在一百米外的雾里几乎看不见，军装必须在人群自己那层材质上提亮（2.6 倍）；不能动 AI 远景层的材质（同一 kind 全场共用）。
* **坑 3**：桥面上的人被桁架切碎（从西南岸斜着看桥，隔着西侧桁架）；桥头纵队在 high 里更难读，靠旗与那辆车。
* **坑 4**：桥面上的战车与 R2 冲桥组 / 人堆共用桥面：车道 ±1.4 → ±1.75、战车车宽 ±1.075，起爆前后各留 ≥ 0.4 m。
* 视觉人群**不吃子弹**：玩家瞄着岸线开枪，子弹穿过去、没有受击反馈（离玩家 ≥ 45 m，真 AI 与脚本兵才是被打的对象）。要让它们吃子弹得给人群补命中体与死亡表现，本轮没做。
* 基线红（改前就红）：`Script_FirstLevelEndTest` 的 `ZhouDeath` 15.62 s 一条、`Script_FirstLevelVegetationTest` 的「40 个平色 foliage 盒由植被接管（46）」、`Script_FirstLevelSpaceTest --rear-only` 的 07+ 指纹（R1c 合入后要集成者统一重生）。
