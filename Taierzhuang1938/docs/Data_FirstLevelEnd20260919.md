# 第一关公开阶段 15–18（End 玩法包）

需求原文：[Notion 2026.09.19 采用稿转录](Data_FirstLevelRebuildSource20260919.md) 的 15A / 15B / 15C / 16 / 17 / 18。
分包契约与名字冻结：[2026.09.19 重构分包契约](Data_FirstLevelRebuild20260919Contract.md) §2 / §3 / §4 / §5 / §8。
本文件是这四个公开阶段的**唯一现状口径**：谁在场、什么时候说话、每一条事实是怎么判出来的、
数值从哪儿来、怎么验收。名字（步骤 id、事实名、锚点、cue id）以契约为准，这里不另起一套。

## 0. 一句话

15–18 是空袭之后的**降压 → 交接 → 死亡 → 新任务**。除了 18 桥头那一场，全段没有战斗；
所有过关条件都挂在「真的发生了」上 —— 人真的走到、替补真的接手、伤员真的进院、
尾队真的过桥、爆破区真的空了。**一处都没有用「进这一步就记事实」或者「等 N 秒」替过去。**

## 1. 模块与归属

| 文件 | 管什么 |
| --- | --- |
| `Script_FirstLevelEndCast.mjs` | 公共层：`EndExtras`（真人实体：生成 / 站住 / 沿折线走 / 转头 / 撤掉）、`EndDressing`（布景里的人、担架与白盒小件，每帧重报）、折线几何helper。**零 three** |
| `Script_FirstLevelQuietMarch.mjs` | 15A 沟口收拢 + 15B 换手抬运、沿墙缓行 |
| `Script_FirstLevelReception.mjs` | 15C 院门 + 16 完成交接 + 17 确认死亡 |
| `Script_FirstLevelBridge.mjs` | 18 BridgeOrders / BridgeCover / BridgeWithdraw |
| `Script_FirstLevelNightGate.mjs` | 18 NightMarch（随队走 marchOut → 黑屏字幕 → 夜景 → 进北门） |
| `Script_FirstLevelNightLights.mjs` | 夜景的点光（**唯一**带 three 的一只；不投影） |
| `Data_Tuning_FirstLevelEnd.mjs` | 这四个阶段的全部数值与摆位；`Data_Tuning_FirstLevel.mjs` 末尾 re-export |

四个步骤模块**零 three**，`Script_FirstLevelEndTest.mjs` 用一个替身宿主在 node 里真跑它们的 `Update`。

运行时（`Script_FirstLevelMissionRuntime.mjs`）只剩薄钩子：

* 构造：建 `extras` / `dressing` / `nightLights` 与四个模块，`view.extras = dressing`；
* `Enter`：各步骤一行 `this.<模块>.Enter(step)`；
* `Update`：每帧 `dressing.Begin()`，然后按步骤调 `Update(dt, step)`；
  距离门仍走 `GateNear`（`thresholdCrossed` / `southBankReached` / `blastZoneCleared` /
  `northGateReached` / `gateEntered` / `marchOutReached`）；
* `VoiceEvent` 的 `Line` 转给 `quietMarch.OnLine`（15A 点名要对着真人）；
* `controls` 的 `death` 收尾改成 `reception.OnDeathSceneEnd()`（不再直接记 `deathSceneComplete`）。

`FirstLevelMissionView` 只加了两处：`litter.roll`（过门槛那一歪）与
`this.extras?.Draw(this, time)`（画在 `people.Begin/End` 之间）。

## 2. 逐阶段编排

### 15A Regroup — 沟口收拢（无战斗）

* **在场的真人**：三名警戒兵（`PicketLeft/Centre/Right`，步枪，`E.picketPosts`），
  站在收拢点与车路之间，`fight: true` —— 空袭之后的 `air` 追兵是他们接住的，
  玩家不进新一轮守波次。沟壁在 (39,116)→(32,134) 的折角切断直射。
* **布景**：赶车人 + 他丢下的那辆车（`E.droverPost` / `E.droverCart`）。
* **对白挂在什么上**：
  * `PicketHold` 进步骤即起（人同一帧就位）；
  * `ZhouCheck` —— 幺娃真的走到担架边（`E.zhouCheckReachM`）才开口；
  * `Headcount` —— 文财、幺娃、顺子三个人都在 `E.headcountReachM` 里才点名；
    每句的 `Line` 事件让说话的人与何有田互相转过去；
  * `CartAbandon` —— 玩家走到赶车人跟前（`E.cartAbandonReachM`）才问。
* **事实**：`survivorsSheltered`（全部活人贴进撤离沟 `E.ditchShelterM`、且追兵谁也看不见）
  → `litterRemanned`（倒下的担架重新立起来，缺的抬手由民夫**真的走过去**接手，
  走的是既有的 `BearerShort` / `RequestBearer` / `UpdateBearers` 那条路）
  → `columnMoving`（重新成形**之后**队首又走出一个担架间距 `E.columnMovingM`）。
  旧的 `regroupRemanSeconds` 三秒定时器已删。

### 15B WallPath — 换手抬运，沿墙缓行

* 夹道就是撤离线尾段（北侧 2.8 m 院墙、南侧 1.1 m 矮墙，净宽 2.8 m，全长 74.4 m）。
* `carrySwapProgressM`(12 m) 处后抬手体力不支：`zhou.bearers[0] = 0`、`zhou.ambushHold = true`
  （那把闸的意思就是「别叫民夫顶上，这是顺子的活」），担架停下 → `carrySwapOffered` → `CarrySwap`。
  `MissionZhouCarry` 的 `Enabled` 在 15B 加了 `carrySwapOffered` 前置，撒手之前按不了 F。
  接过之后把槽位填回去、解开 `ambushHold`。
* 过坎：抬着人走进 `E.roadBump`(24,211.25) 的 `roadBumpReachM` → `roadBumpCrossed` → `RoadBump`。
* 手抖：过坎之后再走 `handsShakeAfterBumpM` → `HandsShake`。
* **无对白行走**：`silenceFromProgressM`(46 m) 之后不再起任何 cue；
  量到连续 `silenceSeconds`(14 s) 没人说话就记 `quietWalkObserved`（取证，不是过关条件）。
* `stragglersTended`：三名掉队伤员的位置读 `MISSION_PLACEMENT.wallPath.stragglers`，
  **投影回夹道中线**再用（原始三点落在南侧矮墙上）；照应的人从后头赶上来，
  并排（同里程 + 横向 `stragglerLateralM`）才算照应上。
* 全程无敌人：`MISSION_STEP_SPAWNS` 里 15 的三个步骤一个组都没有。

### 15C ReceptionGate — 桥南临时接收处

顺序是硬的，一步都不许跳：

1. `GateGuardNorth` 横到门洞中线 `E.gateBlock` 上拦住；担架队被 `maxProgress` 压在
   院门以东 `gateQueuePadM` 排队（`reception.GateLimit()`）。
2. 玩家走进 `gateChallengeReachM` → `GateChallenge` → `gateChallenged`；守军让回门垛。
3. `YardReceiver` 从院里走出来迎到 `E.receiverMeet` → `ReceptionAccept` → `receptionAccepted`。
4. **这时候才** `column.StartReception()`（原来在 Enter 里），并起 `WardGuide`。
5. `woundedEntering`：全部幸存担架都上了入院路线、而且已经有
   `woundedEnteringLitters`(2) 副真的进了院子。

### 16 Handover — 完成交接

* `thresholdCrossed`（`wardEntry` 3 m）→ `Threshold`，同时 `zhou.roll` 走一条
  `thresholdTiltS`(1.2 s) 的正弦，峰值 `thresholdTiltRad`(0.14) —— 担架真的歪一下再回正。
  **「脚……慢点」是老周最后一句话**：台词表里 `Threshold` 之后没有任何一句 `who: "zhou"`（测试守着）。
* 军医 `WardSurgeon` 走到 `E.surgeonPoint` 指位置 → `PlaceLitter` → `placeOrderHeard`；
  `MissionZhouPlace` 的 `Enabled` 加了这条前置，喊出口之前按不了 F。
* 按 F 放下 → `zhouPlaced` → `carry.ForceRelease("delivered")` + `RestoreRifle()`（恢复正常持枪）。
* 军医挪到 `E.surgeonExamine`（离放置点 1.65 m）蹲下 → `MedicAsk` → `medicExamining`。
* 其余幸存伤员都在接收流程里（`received || receiveProgress > 0`）班长才 `SquadAssign`；
  播完记 `squadAssigned`，随后 `squadDispersed`：文财出院门问路、何有田跟班长到门外看外头、
  幺娃留下。这三个人走的是 `reception.walks` 这条剧情走位，`UpdateSquad` 与 `SquadMarchAi` 都让开。

### 17 Death — 确认老周死亡

* 军医真的走到担架边（`surgeonReachM`）→ `deathMedicArrived` → `BeginControl("death", 14 s)`
  → `ZhouDeath`（七句，第一句之后有 `ZhouNoAnswer` 的停顿）。
  `deathSeconds` 从 12 抬到 **14**：强制对齐量出 `ZhouDeath` 是 13.52 s，旧的 8–12 s 口径作废。
* 受控演出放完只是**确认**（`reception.OnDeathSceneEnd()`）。17 走完还要接收处真的继续工作：
  门外一副担架沿 `E.nextLitterRoute` 抬进来 → `NextLitter` → 军医转过去救下一个
  → 幺娃在老周身边待满 `coverStraightenS`（把覆盖物拉正）→ 才记 `deathSceneComplete`。
  何有田经过门边看一眼又转向外面（`E.heDoorLook`）。
* 第一人称、不切尸体特写（沿用 `death` 接管的 `lookAt` 指向担架）。
* **老周死亡不判全关失败**：过关条件里没有「老周活着」，`MissionFailure` 这一段一次都不调。

### 18 BridgeOrders → BridgeCover → BridgeWithdraw → NightMarch

* **接令**：`BridgeRunner` 是真人，从院门外 `E.runnerSpawn` 沿 `E.runnerRoute` 跑进来，
  跑到玩家 `runnerArriveM` 以内才 `BridgeOrders`（`bridgeRunnerArrived`）。
  HUD 目标是阶段 objective「掩护回援分队通过铁路桥」。罗班长沿 `toBridge` 带到南岸射位。
* **回援尾队**：六个**真人实体**（`RearColumn0..5`），0 号扛 Zb26、1/2 号两人抬一根白盒炮管
  （`dressing.Prop("limb", …)`）、其余步枪（背上一只白盒小件）。沿 `bridgeCrossing`（114 m）走。
  * 火力没打断以前进度封在 `rearColumnHoldM`(13 m)，压在北引道上；
    被北岸看得见的人 `Defend` + 伏倒还击（真的会中弹）。
  * 尾队被顶住那一刻才起 `BridgeCover`（「别堵桥口」「北边土坎」）。
  * `bridgeFireBroken` 的判据：`BridgeNorthGunner` 必须哑，且活着的人谁也够不到
    `bridgeNorthEnd` 与 `railBridge`。**不要求杀光**（Notion：玩家不承担「杀光所有敌军」）。
  * `rearColumnCrossed`：还活着的每一个都走到南桥头 `rearColumnClearM` 以内。中弹倒下的不拦这一条。
* **撤出爆破区**：桥头军官喊 `BridgeWithdraw`（三句里没有「所有人都过来了」）；
  爆破人员是**此前就在场**的两个人，走到 `MISSION_PLACEMENT.bridge.demolition` 蹲 `demolitionSetS`(6 s)
  装药（`demolitionCharged`），然后沿 `demolitionPullback` / `officerPullback` 自己撤出去。
* **爆破**：三个条件全满足才点火 ——
  ① `demolitionCharged`；② 玩家 `blastZoneCleared`（`blastSafe` 10 m 内，该点离桥心 48 m）；
  ③ `BlastZoneOccupant()` 为空：玩家、班里人、桥头人员、尾队，**没有一个**在桥心
  `blastClearRadiusM`(30 m) 以内。有人就一直等（每次等都记一条 `blastHeldForFriendly` 取证），
  **不是到点就炸的计时器**。点火 → `vfx.Explosion` + `shellImpact` → `bridgeDestroyed`
  → 信号 `RailBridgeDestroyed` 一次翻完 **5 个完好件 + 3 个残骸件**，桥面退出可走面（不可逆）
  → `MarchToTengxian`。爆破不造成己方剧情伤亡。
* **夜入滕城**：
  * 先随队沿 `marchOut` 真走一段（行军脚步不停），走到 `marchOutReached`
    （锚点 `marchOut`，`marchOutArriveM` 8 m）才 `BeginNightTransition()` ——
    Notion 明写「不让玩家从桥边跑几步就到城门」。
  * 黑屏 1 / 4 / 1 s，字幕「1938年3月15日 夜｜滕县」；黑屏里 `PlaceNightArrival()`
    瞬移到 `nightSpawn` 并 `ApplySky("night")`，记 `nightArrivalPlaced`
    → scenario 信号 `NightGateShown` → 北门夜景那一片才存在（白天它根本不画、不进碰撞）。
  * 淡入之后：`Guide(nightMarch)`，夜景布景每帧重报 —— 八个人的行军队列沿夜行路线走、
    四个人来回搬弹药箱、两个人站着分配防区、带路军人 `NightUsher`（真人）。
    **不是胜利庆典。**
  * 走近北门 `northGateCueM`(20 m) → `NorthGate`（「补东边阵位的，跟我来！」）→
    带路军人领着往门洞走（`nightUsherLeading`）→ `northGateReached` → `gateEntered` → `Complete`。

### 夜景的光

`night` 预设曝光低，**没有点光的白盒会糊成一团**（口径见 `Data_CutsceneBeimenBreakout` 文件头）。
`NightLightSpecs()` 按 `MISSION_PLACEMENT.night.braziers`（4 盏火盆）+ 门洞 1 盏出数据，
`FirstLevelNightLights.Sync()` 建 three 的 `PointLight`。两条纪律：

1. **一盏都不投影**（`castShadow = false`）—— 一帧只许烘一张阴影；
2. 只在夜景真的出现时存在。`Retry()`（NightMarch 分支）与 `ApplyFirstLevelStageJump` 都会
   清 `nightArrivalPlaced` + `RestoreSky()` + `nightLights.Sync([])`，白天那几步一盏不留。

### 还原与回跳

| 换的东西 | 怎么回去 |
| --- | --- |
| 铁路桥（gate，5+3 件） | 事实 `bridgeDestroyed` 清掉 → `SyncScenario` 自动复原 |
| 北门夜景（scenario 第三态） | 事实 `nightArrivalPlaced` 清掉 → 退回坍塌掩蔽部那一态 |
| 夜间天空 | `RestoreSky()`（Retry / StageJump / Dispose 各一处） |
| 夜景点光 | `nightLights.Sync([])`（同上三处） |
| 剧情实体 | `extras.Keep([...])` / `extras.Clear()`；`Dispose` 里一次清干净 |

跳进 16 / 17 时 15C 的 `Enter` 没跑过，运行时的 `EnsureYardCast()` 补齐院门守军两名、
接收人员与军医 —— 演出不许靠「上一步一定走过」。

## 3. 数值出处

全部在 `Data_Tuning_FirstLevelEnd.mjs`，每条带注释。几个关键的：

| 名字 | 值 | 出处 |
| --- | --- | --- |
| `MISSION_TUNING.deathSeconds` | 14 | `MISSION_VOICE_ALIGNMENT.ZhouDeath` 末句结束 13.52 s + 收尾 |
| `ditchShelterM` | 2.5 | 沟底宽下限 3.24 m 的一半 + 0.9 m 排队余量 |
| `columnMovingM` | 3.4 | `R.litterSpacingM` |
| `carrySwapProgressM` | 12 | 夹道 84 m 的前 1/7：先听见枪火消失再换人 |
| `silenceFromProgressM` / `silenceSeconds` | 46 / 14 | 夹道 74.4 m，46 m 之后还剩 28 m，抬担架 1.4 m/s 够走满 14 s |
| `woundedEnteringLitters` | 2 | `R.litterCount` 7 里先进院的头两副 |
| `surgeonReachM` | 2.4 | 站位离放置点 1.65 m + 走位到达余量 0.5 m |
| `rearColumnHoldM` | 13 | `bridgeCrossing` 起点到北桥头 16 m，停在离桥头 3 m |
| `blastClearRadiusM` | 30 | 特效半径 12 m 的两倍半；`blastSafe` 离桥心 48 m，退到那儿一定算走净 |
| `marchOutArriveM` | 8 | `marchOut` 那一段约 35 m，到锚点 8 m 内算走完 |

摆位读空间包已有的 `MISSION_PLACEMENT.wallPath / receptionYard / bridge / night`；
只有两处自己定：15A 的警戒兵射位与赶车人（空间包没给），以及
`wallPath.stragglers` 投影回夹道中线（原始三点落在矮墙上）。

## 4. 配乐

`Data_FirstLevelMissionMusic.mjs` 的 15–18 按新情绪核重排（不新烘，只在现有九首里重排）：

| 步骤 | 曲目 | 为什么 |
| --- | --- | --- |
| Regroup | **无** | 整关第一次真正的安静：飞机声远去，只剩喘息与远炮。旧的「别闭眼」既压过降压感，又把老周提前写成死亡倒计时（Notion 15A 明确不安排临终预告） |
| WallPath / ReceptionGate | 后头还有活人（`wallPathScale` 0.5） | 沿墙缓行，配乐压在喘息与脚步下面 |
| Handover | 别闭眼（`handoverScale` 0.55） | 「别闭眼」挪到这里才对 |
| Death | **无** | 沿用 |
| BridgeOrders | 前线压来 | 新任务，紧张回来 |
| BridgeCover | 交火前沿 | 沿用 |
| BridgeWithdraw | 南路断了 | 这一段真正发生的是一条通路被不可逆切断；「把路打开」说反了 |
| NightMarch | 后头还有活人 | 连夜准备迎敌，不是胜利庆典 |

## 5. 验收命令

纯 Node（毫秒级）：

```powershell
node Taierzhuang1938/Script_FirstLevelEndTest.mjs
node Taierzhuang1938/Script_FirstLevelMissionTest.mjs
node Taierzhuang1938/Script_MissionGatesTest.mjs
node Taierzhuang1938/Script_FirstLevelVoiceTest.mjs
node Taierzhuang1938/Script_FirstLevelSpaceTest.mjs
node Taierzhuang1938/Script_TextTest.mjs
node Taierzhuang1938/Script_ModuleGraphTest.mjs
node Taierzhuang1938/Script_TestRunnerTest.mjs
node Taierzhuang1938/Script_FirstLevelMissionMusicTest.mjs
node Taierzhuang1938/Script_MissionOrchestrationFilterTest.mjs
```

浏览器（有跨 worktree 全局串行锁，别并排跑）：

```powershell
node Taierzhuang1938/Script_FirstLevelMissionBrowserTest.mjs --campaign --stage-jumps --stage-from=15
node Taierzhuang1938/Script_FirstLevelMissionBrowserTest.mjs --campaign --stage-jumps --stage-from=18
node Taierzhuang1938/Script_FirstLevelMissionStageJumpTest.mjs
node Taierzhuang1938/Script_FirstLevelMissionMusicBrowserTest.mjs
node Taierzhuang1938/Script_FirstLevelMissionTopologyBrowserTest.mjs
node Taierzhuang1938/Script_OrchestrationEditorTest.mjs
```

runner 登记：纯 node 的 `FirstLevelEndTest` 在 `firstLevel` 域；
两个分段浏览器夹具是 `FirstLevelMissionStageRegroupTest`（`--stage-from=15`）与
`FirstLevelMissionStageTailTest`（`--stage-from=18`），都在 `firstLevelTail` 域。

取证截图留在忽略目录 `Taierzhuang1938/_shots/`（`FirstLevelStageRegroup` / `FirstLevelStageTail` /
`L1End`）。调试跳转与改写事实不算正常通关证据。
