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

* **规模感受限于几何**：河拓宽之后北岸离射位 90–100 m，1280×720、默认视野下一个人只有十来个像素，30 个人 + 3 辆车 + 烟尘读出来是「岸上有一群人和车在动、在打」，
  不是 COD5 那种压满画面的黑压压一片。桥头人堆（8 人单膝跪在桥面北两孔、离玩家 50–90 m）与冲桥组（离玩家 40 m）是最近、最显眼的一群。要再加强得靠更多、更近的东西（继续加兵会撞 actorPool ija:48）。
* **真 AI 站姿才看得见**：`SIGHT_BY_STANCE` 是目标姿态决定被发现的距离，蹲在射位上的玩家对岸步枪手看不见（机枪手靠听枪声也只压制）。
* 冲桥组按「到位再起爆」等，但 Bridge 只在药装好、玩家到安全区、爆破区清空之后才问 `ReadyForBlast`；手快的玩家（约 14 s）会比冲桥组早，`rushWaitMaxS`（16 s）封顶：超时放行时冲桥兵还在桥北孔上，起爆后他们没被炸死、退回岸边（不会走进断口）。
* 三孔桥的桥墩挡在桥轴下：任何按「河床高度」判净空的测试（`Script_FirstLevelMissionTest` 的路线净空）要按桥面算（R1a 已改）。
* 前沿交通壕的尾巴（x −58…−30、z −80…60 深 2 m）横在东边战车的直线上，东边那辆走 `via` 绕院子；R1a 的北岸村子（x −143…−102、z 54…83）占了原来的西边战车线，西边战车挪到 x −99。
* 空气墙（`semantic airWall`）只挡角色控制器，测试里视线判定要排除它，路线 / 站位净空要算它（R1a 的北岸沿线空气墙留了 x −79.7…−74.2 的口子给桥面）。
* 撤离土岗改了地形，**07+ 指纹（`Data_FirstLevelSpaceSouthFingerprint.json`）会红，集成时统一重生**；`Data_BreakableTreePlacements` 的随机撒树按路线避让，新增的 `marchOut` 延长段会让含这段路线的树区重抽。
* 基线红（改前就红，与本包无关）：`Script_FirstLevelEndTest` 的 death 接管 14 s 与 `ZhouDeath` 15.62 s（配音重录后没同步 `deathSeconds`）、`Script_TestRunnerTest` 三个未登记文件（LitterBearer 相关）、`Script_RailBridgeTest` 地形快照（R1b 的桥重建要重导）。
