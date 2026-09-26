# 第一关 08–14 · 村落改道、桥头接运与空袭（2026.09.19 第二波 Mid 包）

需求原文：[Notion 2026.09.19 采用稿转录](Data_FirstLevelRebuildSource20260919.md) 的 08—14。
接口契约（步骤 id、事实名、锚点、遭遇组、cue id 一律以它为准）：[分包契约](Data_FirstLevelRebuild20260919Contract.md)。
本文件只讲**这一段怎么实装的**：谁在什么时候真的做了什么，数值从哪儿来，怎么验收。

2026-09-24空间迭代见[概念/拓扑对应与验收](Data_FirstLevelWhitebox20260924.md)：主街东窗与侧间院口是两处真实射位，沿用现有敌人名册和事实门。

## 1. 文件

| 文件 | 管什么 |
| --- | --- |
| `Script_FirstLevelVillageBlock.mjs` | 08/09/10：街上的人、担架停进遮挡、班长查看房屋、连屋来敌、开院门放行 |
| `Script_FirstLevelTransferCart.mjs` | 11/12/13/14：四类人流分流、辨认三样、装载额度、上车与停车、卸回担架、进沟 |
| `Data_Tuning_FirstLevelMid.mjs` | 这一段的全部数值（每条带出处）与三个摆位生成函数 |
| `Script_FirstLevelMissionColumn.mjs` | 担架队与车：新增停靠/放行、预留上车的车、装载额度、散开 |
| `Script_FirstLevelMissionView.mjs` | 牛/马两种白盒变体、牛角、接运点的步行伤员 |
| `Script_FirstLevelMissionRuntime.mjs` | 只有薄钩子：自己步骤的 `Enter` 分支与 `Update` 里那两行 |
| `Script_FirstLevelMidTest.mjs` | 这一段的纯 Node 闸门 |
| `Script_FirstLevelCampaignMid.mjs` | 这一段的正常输入驾驶脚本 |

`Data_Tuning_FirstLevelMid` **没有**从 `Data_Tuning_FirstLevel` 再导出：它自己 import 后者取
`R.ambushBindReachM` / `R.transferBatchLoads`，入口再 re-export 会成求值期的环（Mid 先被求值，
那时 `MISSION_TUNING` 还在 TDZ 里）。需要它的模块直接 import 这一份。

## 2. 逐阶段：Notion 要求 → 实装

### 08 主街受阻

- **街那一头真的有人**：`VILLAGE_BYSTANDERS` 按空间包的 `MISSION_PLACEMENT.streetBlock.frontParty`
  与 `withdrawnGuards` 生出四个 NRA（`scriptEssential`、`scriptedNoncombatant`：只站位与喊话）。
  `streetBlockSeen`（距离门，锚点 `streetBlock` 22 m）落下时喊 `StreetBlocked`。
- **东巷窗口**：`village` 组的 `RearWindow` 占住主街东窗，实际摆位与遮挡判定共同读取
  `P.streetBlock.windowShooter`；`VillageGunner` 则占侧间朝向内院的射位。
- **担架队真的停进遮挡**：`MidLitterHoldSlots` 按 `litterWait` 三个点派生车位（多于三副按行往北排），
  `column.UpdateHold` 把每一副担架/每一个民夫从后送线上横着走过去、走到就钉住（`litter.held`）。
  `littersInCover` 要求**全部活着的担架都停到位**，而且窗口射手与主街缺口**两条射线都被
  `LitterHoldCover` 切断**（`VillageHoldCovered`）。停着的人不再沿后送线前进 —— 这就是
  「不跟进未清空间」。
- **班长查看相邻房屋**：罗班长的带路线终点本来就是灶屋北门内侧；他真的走到
  `P.ambushSquadPosts[2]` 才记 `houseChecked`，`KitchenDetour` 在这之后才喊。
  何有田被指到主街这一侧的观察位，到位记 `outsideWatched`（「外头我看着！」）。
- **通过条件**：`streetBlockSeen` + `littersInCover` + `kitchenEntered`（契约 §2 原样）。

### 09 灶屋—连屋近战

- **玩家先进**：`melee` 组生成即装睡；`kitchenEntered` 落下、而且玩家走到连屋
  （`A.melee`）`wake.radiusM`(26 m) 以内，才 `meleeBreachStarted` 并解除装睡 ——
  激活表 `MISSION_ENCOUNTER_ACTIVATION.melee.wake` 已经写成这条口径。
- **「右手！」压到破门之后**：`Melee` 加进了 `Enter` 的「不自动播 cue」名单，
  破门 + `meleeBreachHoldS` 才 `Say("MeleeRight")`。
- **不强制固定 QTE**：这一层一次都不调 `BeginBind` / `BeginScriptedGround`。
  敌人真贴上来时，共用 `Script_MeleeCombat` 自己在 `StepFighter` 的 `contact` 出口开僵持；
  玩家先手打掉就什么都不发生（`meleeEngaged` 也不落）。贴上身（或 `meleeCombat.Active`）
  才 `Say("MeleeCurse")`。
- **窗口火力仍封锁院口**：`meleeResolved` 之后，若 `VillageGunner` 还活着**且**它到院门
  `A.gate` 的射线是通的，记 `windowFireHolding` 并 `Say("WindowOrder")`。

### 10 打开内院，放行担架

- 开院门（`courtyardGateOpen`）的那一刻 `column.ReleaseHold(rejoinIndex)`：每个人从自己停的
  地方接一条 `joinRoute` 回 `courtyardBypass` 的第一个点（`courtyardRejoinPoint` (58,−9)）——
  **不是**把 progress 一改让整队人横着瞬移回线上。
- `litter.passedGate` 改成先折算 joinRoute 的进度再判：老写法 `!litter.joinRoute && …`
  让放行之后的担架永远过不了院门。
- `TwoLitters` / `LastLitter` 按 `VillagePendingLitters` 的真实计数喊。
- **通过条件**：`VillageCourtyardCleared` = 活着的担架全部 `passedGate` **且**队尾掩护脱离
  （`rearCoverDisengaged`：刘文财走过院门以南 `rearCoverClearM`）。

### 11 抵达桥头接运点

- **四类人流**：
  1. 牛车 / 2. 马车 —— `column.vehicles` / `column.traffic` 各带 `draft`，由
     `MidDraftKind` 按 `oxBayIndices` / `oxTrafficIndices` 分。正常加载时共用
     `Model_WoodenEvacCart.glb` 双轮板车，并按 `draft` 加载 `Model_WorkingOx.glb` 或
     `Model_WorkingHorse.glb`；两种牲口都有 Blender `Walk` 动画，车轮按行进距离转动。
     `Script_DraftCartModel.mjs` 同时供关卡和「人物动作」编辑器使用。三件模型由
     `_blender/Script_OxCartBake.py` 重建；原白盒实例桶只在资产加载中或失败时保底。
     **提交预算（2026-09-27）**：导出前 `BatchForRuntime` 把每件模型合成一只蒙皮网格、
     每种材质一个图元（车 5、牛 5、马 4；原来一辆车 59–64 个分件），活动节点变成同名骨头
     （`WheelLeft`、`OxFrontLeftPivot`…），无贴图的纯色件并成两只顶点色材质 `FlatPaint` /
     `FlatPaintMetal`；`CompactGlb` 再把刚性权重和顶点色压成定点数。分件身份
     （deck / rail / wheel / draftBody…）按材质映射到承载它的合并网格。车与牲口必须能被视锥剔除
     （蒙皮网格的剔除球按绑定姿势放宽 0.45 m）——车队从 01 起停在两三百米外，
     不剔除时每帧白画约一千个 draw。
  3. 人力担架 —— 后送队本身。
  4. 能走的伤员 —— `MidWalkingWounded()` 在接运点现场摆六个人三对（一个搀一个被搀）。
     后送队自己的 `walkingWoundedCount` 是 0（用户 2026-09-16 砍的是随队护送编制），
     这一批是这一片本来就有的人，挂在 `column.transferWalkers` 上由 View 画。
     `TransferSorting` 播完他们真的往桥头那一头走。
- **辨认三样（朝向 / 到位门，不是计时器）**：
  - `transferApproachReached`（到位，锚点 `transfer` 14 m）→ 喊 `TransferSorting`；
  - `transferSorted`：装载区集结口袋里真有 `sortedLitterCount` 副担架，而且步行的那批真的走了；
  - `bridgeHeadSeen`：对准路桥（`identifyConeRad` ±0.95 rad），**或**人已经走到
    `bridgeHeadSouthZ`(122) 以南；
  - `villageRoadWatched`：站在接运区（`A.transfer` 周围 `identifyRangeM`）回头对着村路来路
    (76,85)，**或**追兵已经露头。
  - 三样齐了才 `Say("VillageRoadThreat")` ——「后头追出来了！」「顺子，看住村路！」
    于是 `villageRoadThreatSeen` 这条 requirement 就带着三样一起过。

### 12 掩护装载与离开

- **射位**：`M.defencePosts` 把班里四个人摆到 `TransferCorner` / `TransferEastCover` 一线，
  朝村路；全部到位记 `transferPostsManned`。玩家自己的射位就是 `A.transfer` 那个墙角。
- **威胁 ↔ 装载联动**：`column.loadAllowance` 每帧由 `TransferCart.LoadAllowance()` 写：
  解除 0 处 → 0（`Load()` 直接 return，装载与出发一起被压住）；解除 1 处 → 2
  （`loadAllowancePerThreat` = `R.transferBatchLoads` = cartCapacity 2 × 2 车）；
  两处都解除 → `Infinity`（Notion「解除后，接运继续」；不放开的话最后一副装不上、
  老周永远轮不到）。
- `firstBatchLoaded` 要求 `loadEvents ≥ 2` **且 `column.departed ≥ 1`** —— 这一批真的装完开走了。
- **轮到老周**：`column.ReserveBoardingCart(cartBays[0])` 把下一辆空车叫到上车位旁边；
  他被 `Load()` 真的抬上那一辆（只许上那一辆）。何有田真的走到 `A.transfer`
  （`escortReliefM` 以内）才记 `escortRelieved` 并 `Say("EscortZhou")`。
- **上车**：`MissionCart` 交互 → `TransferCart.Board()`（老周已在车上，顺子上车板）→
  `BeginControl("cartRide")`。座位偏移读 `MISSION_PLACEMENT.cartRide.playerSeat`，
  世界坐标由 `CartSeatPoint` 换算（局部 −z 是车头，与 `CartInstance` 同一套）。
  车沿 `MISSION_STAGE_ROUTES.cartRide` 真走，起点取车**当前**位置再接上authored折线
  （否则上车那一帧车会跳 2.4 m）。离开 `cartTalkAfterM` 才 `Say("CartTalk")`，
  离开 `R.cartDepartedM` 才记 `zhouCartDeparted`。
- **牛马车压过尸体（2026-09-27）**：所有牛马车（接运的、过路的、顺子坐的）车轮滚上尸体都会
  软软地颠一下 —— 车身起伏、车头下沉、压到哪边哪边抬。规则在 `Script_CartCorpseBump`（纯规则、
  无 three），数值在 `M.cartCorpseBump`（轮距/轮半径/辕头位置量自 `Model_WoodenEvacCart.glb`）。
  - 尸体两路：静态战场尸体（`MissionAftermath` 的 512 具）开机由 `BuildAftermathTopField` 烘成
    10 cm 顶面高度格（约 3.7 万格、30–55 ms）；战斗里倒下的人（AI 尸体、`MissionPeople` 里
    `alive:false` 的人）按命中体胶囊现算，只看车周 `dynamicRangeM`。
  - 两轮大车：每只轮子沿行进方向探一个轮半径，按轮子滚过障碍的几何求轮心抬升，乘 `softness`、
    封顶 `maxLiftM`；每只轮子一根欠阻尼弹簧（`springHz` / `dampingRatio`），落回地面按
    `groundRestitution` 小弹。车辕前端搭在牲口身上当支点 → `cart.bumpHeave / bumpPitch / bumpRoll`。
  - 消费方一律从 `CartDeckLift(cart, 局部x, 局部z)` 取：`DraftCartModels.Sync`（车模）、
    `MissionView` 白盒回退件、车上担架与老周（`zhouRoot` 跟着俯仰侧倾）、过路车上的伤员、
    `TransferCart.UpdateRide` 的顺子眼位（晚一帧，弹簧是连续的，看不出来）。
  - 碰撞盒不跟着颠（玩家踩不到车板，量级也只有十几厘米）。
  - 回归：`Script_CartCorpseBumpTest`（纯 Node）；实机取证 `Script_CartCorpseBumpBrowserProbe.mjs`
    （12 直接切 CartRide，两条车辙各放一具真打死的日军，出 `_shots/CartCorpseBump/`：左轮压过时车身
    抬 0.17 m、侧倾 7.6°，顺子眼位 1.24 → 1.36 m；南向车流穿过的 31 号尸堆顶面 0.47 m）。

### 13 日机空袭桥头道路与车列

- 第一轮航过沿用既有 `UpdateAir`：炸路桥（`MissionBridgeDestroyed`）+ 炸车列
  （`column.AirDamage()` → 翻车、受惊牲口拖着挣脱跑）。**翻的那一辆不会是顺子坐的那一辆**。
- `TransferCart.Scatter()`：`column.ScatterFromRoad(scatterFromRoadM)` 让还在路上的人各自
  往两边让（复用 08 的 `holdSlot` 机制），接运点的步行伤员也散开。
- 罗班长从后方赶到：真的跑到 `A.cartHalt` 附近才记 `luoAtHalt`。
- 玩家那辆车在 `cartHalt` 停住（`cartHalted`）并**还权**。
- **卸人有过程**：`BeginUnload` 挑两个最近的民夫（期间 `treating=true`，不被队列拖走），
  他们走到车侧 `unloadOffsetM` 的落点，然后用 `unloadSeconds`(3.2 s) 把担架从车板
  （`liftFraction` 1 → 0）放到地面，才记 `zhouUnloaded` 并 `Say("WestDitchOrder")`。

### 14 第二轮扫射，转入西沟

- 沿用既有 `Carry` → `Dive` → `Rescue`：`CarryZhou`（后抬手「换个人！手使不上劲了！」）
  在 `Enter` 播，`AircraftReturn` 的具名事件 `AircraftDiveOrder` 触发松手扑沟
  （固定角色剧情，不做必败 QTE），`RescueZhou` 与幺娃/搬运兵救人照旧。
- 新加两条位置门：`ditchSheltered`（老周离 `A.ditch` `ditchShelterM` 以内）与
  `columnOffRoad`（活着的担架都离桥头路中线 `offRoadM` 以外）——「进入沟内遮挡 / 队伍离开主车道」。

## 3. 数值出处

全部在 `Data_Tuning_FirstLevelMid.mjs`，每条都有注释。引既有表的几条：
`meleeCurseReachM` = `R.ambushBindReachM` + 0.4（与 `meleeEngaged` 同一把尺）、
`loadAllowancePerThreat` = `R.transferBatchLoads`、
`zhouCartDeparted` 用 `R.cartDepartedM`、担架步速用 `R.litterSpeedMps`。
新车板为 2.3 × 3.5 m、离地约 1.12 m，木辐条轮直径 1.44 m；保留原车位与装载座位偏移。
历史造型参考为 1930 年前后中国牛车照片及山东地方交通资料；生图概念稿只作建模参考，
可编辑 `.blend` 保存在仓库外的 `OneDrive/AI/Models/Blender/Taierzhuang1938/OxCart`。
参考：[1930 年中国牛车照片](https://www.bridgemanimages.com/en-US/williams-maynard-owen/chinese-peasants-with-cart-pulled-by-an-ox-pass-a-city-gate-1930-photo/photograph/asset/8777732)、
[烟台交易运输民俗中的木轮铁瓦和骡马牛牵引记载](https://dsyjy.yantai.gov.cn/art/2010/7/26/art_1335_378567.html)。

## 4. 新增的内部辅助事实

契约 §2 允许实现包增加内部事实。这一段加了 13 条，全部登记进 `MISSION_FACT_GATES`
（工作台照它讲人话）：`houseChecked` `outsideWatched` `meleeBreachStarted` `windowFireHolding`
`rearCoverDisengaged` `transferSorted` `bridgeHeadSeen` `villageRoadWatched`
`transferPostsManned` `escortRelieved` `luoAtHalt` `ditchSheltered` `columnOffRoad`。
**`MISSION_STAGES` 的 requirements 一条没动**（08–14 仍是 29 条）。

## 5. 验收

纯 Node：

```
node Taierzhuang1938/Script_FirstLevelMidTest.mjs
node Taierzhuang1938/Script_CartCorpseBumpTest.mjs
node Taierzhuang1938/Script_FirstLevelMissionTest.mjs
node Taierzhuang1938/Script_MissionGatesTest.mjs
node Taierzhuang1938/Script_FirstLevelVoiceTest.mjs
node Taierzhuang1938/Script_FirstLevelSpaceTest.mjs
node Taierzhuang1938/Script_TextTest.mjs
node Taierzhuang1938/Script_ModuleGraphTest.mjs
node Taierzhuang1938/Script_TestRunnerTest.mjs
node Taierzhuang1938/Script_MissionOrchestrationFilterTest.mjs
```

浏览器（有跨 worktree 全局锁，长测试后台跑）：

```
node Taierzhuang1938/Script_FirstLevelMissionBrowserTest.mjs --campaign --stage-from=8  --stage-jumps
node Taierzhuang1938/Script_FirstLevelMissionBrowserTest.mjs --campaign --stage-from=11 --stage-jumps
node Taierzhuang1938/Script_FirstLevelMissionStageJumpTest.mjs
node Taierzhuang1938/Script_CarriagePropVelocityTest.mjs
node Taierzhuang1938/Script_MotionVectorContractTest.mjs
```

取证截图在 `Taierzhuang1938/_shots/L1Mid/`（忽略目录）。
