# 第一关 08–14 · 村落改道、桥头接运与空袭（2026.09.19 第二波 Mid 包）

需求原文：[Notion 2026.09.19 采用稿转录](Data_FirstLevelRebuildSource20260919.md) 的 08—14。
接口契约（步骤 id、事实名、锚点、遭遇组、cue id 一律以它为准）：[分包契约](Data_FirstLevelRebuild20260919Contract.md)。
本文件只讲**这一段怎么实装的**：谁在什么时候真的做了什么，数值从哪儿来，怎么验收。

2026-09-24空间迭代见[概念/拓扑对应与验收](Data_FirstLevelWhitebox20260924.md)：主街东窗与侧间院口是两处真实射位，沿用现有敌人名册和事实门。

## 1. 文件

| 文件 | 管什么 |
| --- | --- |
| `Script_FirstLevelVillageBlock.mjs` | 08/09/10：街上的人、担架停进遮挡、班长查看房屋、进门遭伏击的副作用、连屋来敌、开院门放行 |
| `Script_FirstLevelKitchenAmbush.mjs` | 09 进门遭伏击的拍表（纯规则，不碰场景）：藏 → 扑 → 撞翻 → 一次性按键 → 反刺／被捅 |
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

#### 进门遭伏击（2026-09-28 用户：「我进屋子的时候怎么被日军偷袭的 QTE 没有！具体形式就参考 COD5 里的 QTE」）

照《使命召唤：战争世界》（COD5）的万岁冲锋：藏着的日军嚎一声扑出来把人撞翻、骑上来举刺刀往下捅，
屏幕上只剩一个按键，窗口里按一下就反手捅死他，漏掉就是被捅死、回检查点重来这一拍。
Notion 09 原文「提前击败近战敌人则不强制播放固定 QTE」照旧成立：他冲过来那半秒里被打死就不进 QTE。

| 拍 | 发生什么 | 数（`MID_TUNING.kitchenAmbush`） |
| --- | --- | --- |
| 藏 | `MeleeLead` 装睡在灶屋与连屋之间那条带顶过道（x 52.3–63.7、z −1.2–0.2，两头封死）的西段 `hide` (54,−0.5)。灶屋南门洞只有两米宽，灶屋里任何一处都看不见他（`FirstLevelMidTest` 用布局体块逐条连线量过）。另加 `meleeDormant`，免得共用白刃层在 5.5 m 内把他认领过去 | `hide` `hideYaw` |
| 扑 | 玩家**真的跨进过道**（门框墙厚里不算：站在门框里往西看被门框挡着）或从别处绕进连屋，就触发：他嚎「突撃！」（`ija_rally_charge`），罗班长插队吼「右手！」（`MeleeRight`，往南走时右手就是西），`emergeS` 之后以 `lungeMps` 冲。扳机整段不扣（`missionSurfaceRest`），刺刀一直在枪上。人在过道里、目标在过道外时先冲门洞口再拐（`KitchenAmbushLungeTarget`） | `triggers` `emergeS` 0.22 s、`lungeMps` 6.2 |
| 先手打掉 | 冲锋途中被打死：记 `kitchenAmbushPreempted`，不撞、不锁、不开僵持，其余三人照常放出 | — |
| 追不上 | 冲了 `lungeMaxS` 还够不着（玩家从连屋深处触发一路往外跑）：这一拍作罢（`kitchenAmbushBroken`），他当场转普通白刃兵，不隔着几米把人「撞」翻 | `lungeMaxS` 1.4 s |
| 撞翻 | 够到 `tackleReachM`：掉 `tackleDamage`，手上的换弹／拉栓当场收尾（`Viewmodel.CompleteAction`，不然地面镜头落不下来），借一把刺刀给 `player.meleeWeapon`，共用 `ScriptedKnockDown` 真的倒地 + `HoldScriptedGround` 摆 `Pressure`，锁控制 `ambush`、HUD 整个让位（只留字幕与血）。视线每帧跟着他**头骨**的世界位置走（`TrackControl`，倒地那半秒眼位从 1.6 m 掉到地板上），第一人称的枪和手整体挪开（`grappleHandM`），他的刺刀走近景档（`Actor.SetWeaponDetail`）。锁着的这几拍玩家挂着保护，别的枪不在这时候把人打死 | `tackleReachM` 1.25、`tackleDamage` 8、`grappleHandM` |
| 按键 | 撞上 `promptDelayS` 后开共用倒地僵持的一次性按键（`input: "press"`，见 [白刃战说明](Data_MeleeQte.md)）：屏幕中间一个 F 环钉在他握枪处，弧在 `windowS` 里漏完。F 由 `runtime.AmbushInput` 先于共用白刃层与键位表接走 | `promptDelayS` 0.85 s、`windowS` 1.8 s |
| 反刺 | 按上了：他死在这一下上（摘掉叙事保护、走共用白刃伤害链，血与击杀回执照常），顺子插队骂「滚你妈的！」（`MeleeCurse`）。共用结算（`GroundWin`）0.6 s + 起身 1.05 s，视线同时从他脸上转回平视远处（`levelGazeS`），起完身还权、借的刺刀还回去 | `counterDamage` 200、`levelGazeS` 1.65 s |
| 被捅 | 漏掉了：先摘保护再补一刀 `failDamage`，满血也死（「体验」档 0.8 倍受伤率下仍是 320）。检查点重试时 `VillageBlock.RearmAmbush` 把他摆回过道里装睡、把「右手！」「滚你妈的！」两句放回可播，玩家从灶屋正中 `retryPoint` 重来（不是原地复活在他脚下），晚一帧给一行「被扑倒压住时，看准了按 F 反刺」 | `failDamage` 400、`retryPoint`、`retryHintS` |
| 收尾 | 反刺／先手打掉／作罢之后，其余三人按 `releaseDelaysS` 错峰醒来从东巷那扇门压进来（落 `meleeBreachStarted`），真贴上身走共用白刃僵持（`Script_MeleeCombat` 自己开）。那一拍用过的僵持配额清掉（`ClearQteBudget`） | `releaseDelaysS` 0.4/1.2/2.0 s |

- **在 08 就可能演**：「进灶屋」常常是 08 最后落的那条事实，但玩家也可能先冲过去、担架还没停好。
  所以这一拍在 08 记下 `kitchenEntered` 之后就上膛，不等 09 开了才补；09 的 `Enter` 只在它还藏着时重置。
- **09 调试跳转的起点**改到灶屋正中、面朝南（原来落在连屋正中，一跳过去就当场扑上来）。
- **`MeleeLead` 不挂战术折线**：冲锋归这一拍驱动，折线会跟冲锋抢着下命令。
- **「右手！」只剩这一处喊**：原来破门 + `meleeBreachHoldS` 那一拍（与这个数）删了。
- 还权后 `UpdateMelee` 只给**醒着的**人装刺刀：剧本旗单位每拍会被 AI 摘刺刀，再每帧装回去等于每拍重建一次手持武器；
  「全灭」的判定仍数所有活人（装睡的也算活着）。

#### 窗口火力

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

- **2026-09-27 起守来时路**（[口径](Data_FirstLevelTransferCover20260927.md)）：顺子的射位是村口低墙射口 `A.transferWall`
  (67.5,86)，`transferArrived` 改成到它 ±8 m；第一处威胁从 10 担架队走过的绕回短巷冲出来、顺主街穿门楼压向装载区，
  第二处是守线右手东巷口的机枪（`A.sideAlley` 挪到 (95.2,61)）；装载区受压的判定点改成排队道
  `M.loadingThreatPoint`；弹药箱挪到射口身后。下面几条里的旧射位与旧威胁位置以该文为准。
- **射位**：`M.defencePosts` 把班里三个人摆在低墙背后一线（罗班长路口西、刘文财西头、何有田东段），
  没目标时脸朝门楼 / 东巷口（`face` → `watchYaw`）；幺娃跟着担架在装载区。全部到位记 `transferPostsManned`。
- **威胁 ↔ 装载联动**：`column.loadAllowance` 每帧由 `TransferCart.LoadAllowance()` 写：
  解除 0 处 → 0（`Load()` 直接 return，装载与出发一起被压住）；解除 1 处 → 2
  （`loadAllowancePerThreat` = `R.transferBatchLoads` = cartCapacity 2 × 2 车）；
  两处都解除 → `Infinity`（Notion「解除后，接运继续」；不放开的话最后一副装不上、
  老周永远轮不到）。
- `firstBatchLoaded` 要求 `loadEvents ≥ 2` **且 `column.departed ≥ 1`** —— 这一批真的装完开走了。
- **轮到老周**：`column.ReserveBoardingCart(cartBays[0])` 把下一辆空车叫到上车位旁边；
  他被 `Load()` 真的抬上那一辆（只许上那一辆）。何有田真的走到顺子的射口 `A.transferWall`
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
牲口按当地品种的真实体型建（2026-09-27 重做，旧版两头都有 2 m 多高）：鲁西黄牛、华北挽马肩高都约 1.40 m，
1.7 m 的人站旁边齐肩。牲口躯干中心挂在车心前 `MID_TUNING.draft.teamOffsetM` = 3.3 m，模型按这个距离贴着车辕建，
GLB 根节点 extras 里带 `teamOffsetM` 与 `strideM`，与数据表对不上时 `Script_DraftCartModel` 加载即报错。
步态：每条腿在躯干里藏一个肩/髋关节，着地时的长度变化全在那里消化，看得见的腿柱着地时是直的；
抬腿时前膝往后折、后跗关节往前折。Walk 一圈 = 一个步幅（马 1.25 m、牛 1.05 m），着地的蹄子按车速后退、不打滑。
Blender 导出的时间轴从 1/30 s 起，加载时挪到 0（不挪的话循环长 1.033 s，蹄子比车慢 21%）。
历史造型参考为 1930 年前后中国牛车照片及山东地方交通资料；生图概念稿只作建模参考，
可编辑 `.blend` 保存在仓库外的 `OneDrive/AI/Models/Blender/Taierzhuang1938/OxCart`。
参考：[1930 年中国牛车照片](https://www.bridgemanimages.com/en-US/williams-maynard-owen/chinese-peasants-with-cart-pulled-by-an-ox-pass-a-city-gate-1930-photo/photograph/asset/8777732)、
[烟台交易运输民俗中的木轮铁瓦和骡马牛牵引记载](https://dsyjy.yantai.gov.cn/art/2010/7/26/art_1335_378567.html)。

## 4. 新增的内部辅助事实

契约 §2 允许实现包增加内部事实。这一段加了 13 条，全部登记进 `MISSION_FACT_GATES`
（工作台照它讲人话）：`houseChecked` `outsideWatched` `meleeBreachStarted` `windowFireHolding`
（2026-09-28 进门遭伏击再加 7 条：`kitchenAmbushSprung` `kitchenAmbushTackled` `kitchenAmbushPrompted`
`kitchenAmbushCountered` `kitchenAmbushFailed` `kitchenAmbushPreempted` `kitchenAmbushBroken`）
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

## 6. 2026-09-30 概念图 13 / 12 / 14 场景白盒（12–18 白盒改造 C2 包）

对照概念图 12_2 / 12_4 / 13_1–13_4 / 14_1–14_4（机位表 `Data_FirstLevelWhitebox0518Cameras` 同名条目；引导机位 G13_1 / G13_2 / G13_3 / G14_1 不动）。玩法、事实名与通过条件一个字没改，改的是「夹道的样子」和它牵动的疏散 / 撤退通道。

**夹道高墙**（`Data_FirstLevelWhiteboxTransfer`，墙的位置与缺口在 `MID_TUNING.transferEvac.walls` 的 `westTall` / `eastTall`）

- 西侧（路右，13_3 近处那道）：青砖高墙 3.7 m + 瓦压顶 + 四根壁柱，z 118.5–129.6 连续，只在 z 123.4–124.8 开一扇窗（窗台 1.1、窗顶 2.3，12_2 概念「墙上带窗洞」），墙脚一条 0.75 m 深的路沟（地形表 `RoadSideDitchWest`，底宽 1.6，两端各 1.6 m 进出坡）。
- 东侧（路左）：夯土高墙 3.05 / 2.75 m，z 125.6–136.4 连续、z 129.2–130.6 一扇窗，顶上是土冠，墙脚两垛标准沙袋（`TransferRoadFootBags0/1`）。
- 两墙内皮净距 8.3 m（概念 8–10 m）。东墙 z 125.6 以北保持敞开：车位、上车位 (80,120)、cartRide 的第一段与空车驶离的线都在那儿。
- 12_4：车位一排东边一段带窗洞的无顶残砖墙（`TransferBayRuin*`，x 100.4）；14：沟东沿外 2.4 m 一段带窗山墙（`TransferDitchLipRuin*`）、南边一段高些的山墙（`TransferDitchLipGable*`），沟口南侧砖房朝沟的北墙补两扇窗洞。13_2：河口石栏往西延到 x 55.6，柱顶加瓦帽。

**停滞车列与残车**（`MID_TUNING.transferConvoy`；`column.convoy` 由 `TransferCart.UpdateConvoy` 按步骤开关，`Script_FirstLevelMissionView` 画）

原来 13 空袭时路上一辆车都没有：装好的车 12 里就开过桥走了（3.2 m/s，二十来秒后出画），没装的停在 x 88–94 的车位上。现在多五件布景车（真牛 / 真马与真车模型，车板上码 18 只麻袋 = View 的 `cartSack` 桶；不载人、不参与 12 的装载与 13 的翻车）：

| id | 位置 | 何时在 |
| --- | --- | --- |
| ConvoyCartB / C | 桥面上 (74.4,146) / (78,156) | TransferApproach 起；桥被炸（`MissionBridgeDestroyed`）或进 14 就撤 |
| ConvoyCartE | 停车处 (76,135) | 只在 13 且没有 cartRide 时（阶段跳转进 13 / 出图）替顺子那辆车站着；真流程里 cartRide 到了就撤 |
| ConvoyWreck | 西墙脚路沟 (73.3,125.8) | 13 起，侧翻残车 + 撒在沟里的 7 只麻袋，留在原地（13_4） |
| ConvoyCartD | 沟口北侧 (40.5,108.3) | TransferApproach 起，14 起牲口跑了、车留着（14_1） |

路上放不下别的停滞车：西半路是墙脚沟与散开 / 撤退的口子，东半路是 cartRide 的车身（x 75.5–80.5 @ z 118–127），北半路是分拣与后送队的路（MidTest 逐条量车列与 cartRide 整套车 / 撤退通道 / 卸车走廊不叠）。

**疏散遮挡点与撤退通道重排**（`MID_TUNING.transferEvac`、`MidTransferScatterPlan`、`MidTransferRetreatJoin`）

- 遮挡点：西高墙墙脚两处 `WestFootA`（z 120）/ `WestFootB`（z 129.6，人贴墙蹲在路沟里，侧翻残车夹在两处中间）替掉 `WestWallD`；东高墙外的洼地 / 草棚三处改从墙北头 z 122.5 的口子绕过去。其余墙外遮挡点不变。
- 撤退通道：`Middle`（z 120.8 的口子）的口子落在西高墙里，改成 `westOnly`（只给墙后的人走，从 `westEntry.via` 接）；车路一侧 z < 124.5 的人一律走 `North` 口（`roadUntilZ`）。`MISSION_PURSUIT_ROUTE` 的 z 120.5 横穿段改走墙北头敞口（z 114.8）。
- 出口只剩：北口 (73.5,111)、南口 (72.8,133.4)（卸车点旁），西墙 z 108.4–118.5 一段 10 m 敞口是分拣台入口。

**约束变更**

| 条 | 原值 → 新值 | 为什么 |
| --- | --- | --- |
| `scatterCoverOffRoadM`（散开后离路中线） | 6.5 → 2.5 | 概念 13_3 的人是「贴墙根蹲下」。原来遮挡点都在墙外侧（≥ 6.5 m），两道高墙夹路后要让人留在墙这一侧；西墙根遮挡点离路中线 3.4 m（担架停到 ≤ 0.6 m 内，实测 2.8 m），在牛车车道（车盒半宽 1.5）以外，「让出车道」的原意不变 |
| 西墙残段 | z 122–125.8、127–130 两段 1.3–2.5 m 残墙 → 一整段 z 118.5–129.6 的 3.7 m 高墙（终点 130 → 129.6：卸车点 (72.6,135) 到沟口斜向走廊 0.8 m 余量要求） | 13_1 / 13_3 的连续高墙 |
| 东墙 | z 104.2 止 → 另加 z 125.6–136.4 一段 3 m 高墙 | 13_3 左手夯土墙 |
| 撤退通道 | 三条口（z 111 / 120.8 / 133.4）→ 两条口 + 一条只给墙后的人的 `Middle` | 高墙不留 z 120.8 的口子 |
| `MISSION_PURSUIT_ROUTE` | z 120.5 横穿西墙 → 墙北头敞口 z 114.8 | 追兵线不穿墙 |
| MidTest 扫测 | 通道从各自「口子」起扫（`westOnly` 从 `westEntry.via` 起）；`scatterCoverOffRoadM` 阈值随上表；新增夹道高墙 / 停滞车列一节（墙高 / 长度 / 净距 / 窗净高；车列不与 cartRide 整套车、撤退通道、卸车走廊叠） | 断言原意不变（担架走廊、遮挡点到得了、场上任意可站位接得上通道） |
| 东高墙挡住停车处朝东的视线 | 停车处 (76,135) 看场院东头原来一览无余 → 只剩 z 122.5 北头口子与一扇窗 | G13_3 的「错误方向 ②：朝东不是路」更读得出来；追兵从口子出来才看得见 |

**门禁与取证**：`Script_FirstLevelMidTest` / `Script_FirstLevelWhiteboxTransferTest` / `Script_FirstLevelWhiteboxTerrainTest` / `Script_FirstLevelMissionTest` / `Script_FirstLevelMissionTopologyTest --rear-only` / `Script_FirstLevelSpaceTest`（07+ 指纹红是预期：本包改了 z ≥ 100 的体块与地面，指纹由集成者重生）。整关驾驶 `Script_FirstLevelMissionBrowserTest --campaign --stage-jumps --stage-from=11 --stage-to=14`（`--stage-from=12` 不在 `CAMPAIGN_SEGMENT_STARTS`，从 11 起）在 13 停车后从机位表 13_1–13_4 各拍一张（`Kit.CapturePose`，证据在 `_shots/FirstLevelStageMiddle*/Scene_AirRaidView13_*.png`）；`CarryToDitch` 的路线改走南通道（卸车口 (72.8,133.4) → (64.6,125) → 沟口），老走法 (70,112) 会顶在西高墙上。

**已知遗留**：① 14 的西沟本身（宽度、沟壁陡度）是壕沟样条，本包没动，14_2 / 14_4 的「窄陡泥沟」只靠沟沿外的残墙 / 山墙压出上方的高度感，沟底仍偏宽；② 概念图 13_3 左手的夯土墙是「很长一整道」，这里东高墙只有 z 125.6–136.4（车位与 cartRide 的车线占了北边）；③ 飞机、弹着、烟尘、路面尘土是运行时演出，不在白盒范围；④ 整关驾驶脚本 `--stage-from=11 --stage-to=14` 在 14 的 MedicalRescue 之后死于 playwright `ERR_STRING_TOO_LONG`（Node 把一条超长 CDP 消息转成字符串），改前基线 e080b510 同一位置同一报错，与本包无关；`Script_FirstLevelMissionFortificationsTest`（FrontCommunication 沟）、`Script_FirstLevelMissionStageJumpTest`、`Script_FirstLevelEndTest`（ZhouDeath 接管时长）、`Script_FirstLevelMissionPresentationTest`（抬担架握杆误差）同样在基线上就红。`Kit.CapturePose` 瞬移后先空转 60 帧再拍（紧接着拍会拍到旧位置的残影）。

### 6.1 第二轮（集成者验收后）：两道长墙 + 门洞

第一轮两道墙各 ~10 m、一前一后错开，尽头仍是空田野。第二轮改成一对长墙夹着车路，口子一律做成带门垛的门洞：

- **西墙**（青砖 3.7 m，压顶、壁柱）：z 103.6–129.6，只在 z 108.0–112.95 留一个 4.95 m 门洞（两侧门垛、垛帽瓦压顶）。北撤退通道 (73.5,111) → (60,111)、幺娃 (79,110) 直奔沟口的斜线（x 71 处 z≈111.3）、刘文才从东侧 (84,106) 一带直奔沟口的斜线（x 71 处 z≈109.5）都从这里过（14 救人靠 MoveActor 直线走：门洞先开 2.9 m，整关驾驶卡在 Rescue 里 575 s 不动，量出来是刘文才的斜线擦墙，加宽到 4.95 m）。原来 z 103.6–108.4 的残墙并进这一道。南端 129.6 不动。
- **东墙**（夯土 3 m，x 81.7）：z 117.85–136.4，北头一根砖门垛；门垛以北到低墙端 z 104.2 是一个 13.65 m 的院门式开口，cartRide 第一段 (85.6,113) → (82,113) → (79,118)（TransferTest 按车盒 2.5 × 2.9 + 1.25 / 1.45 余量扫，净宽 ≥ 6.1 m 才过得去）、bay 车去上车位（`approachRoute` 改从 x 82.6、z 116.6 进路，上车位从 (80,120) 西挪 1 m 到 (79,120)：车盒不压进东墙内皮，Kit 的「车挡子弹」射线验的起点也不能落在墙里；路线长度与原来 ±2 m）、幺娃 / 刘文才的斜线都在里头。开口上方不封顶（车路上方开天，8 m 净空）。
- **没能做到的**：东墙拉不到 z 104–111。TransferTest「B covers departing carts」——侧巷机枪 B（`MISSION_TACTICS` transferAlley 最后一个折点 (94.3,67.15)，12 的敌军战术，本包不动）打上车位一带的射线穿 x 81.7 处 z≈107–110.4，一段 3 m 高的墙会把它挡掉；装载区人群口袋 (82,100)、(82,106) 也离 x 81.7 太近。所以东墙实长 18.55 m，北头的开口比要求的「只留一个院门」宽；画面里东墙从夹道中段才开始。
- 疏散 / 撤退：`WalkRoute` 把东高墙当第三条墙线；东墙外的人从院门式开口进路（`eastGapZ` 97.6 / 106.4 / 114.6）；`triageGap` 关掉（西墙敞口收成门洞，墙后的人按墙外算）；`MISSION_PURSUIT_ROUTE` 改走「东开口 (86,117) → 西门洞 z 112 → (61,112)」。
- 停滞车列：B、C 在桥面上；E、E2、E3 三辆替身排在停车处到夹道中段（(76,135)、(77.2,126.4)、(78.9,119)，只在没有 cartRide 时站着，真流程里它们撤，顺子那辆车走这条线）；残车在西墙脚路沟里；13 真实驱动里是顺子那辆车 + 空袭掀翻的 bay 车 + 残车。
- 14 救人：幺娃 / 刘文才 MoveActor 直线奔向老周，没有寻路。墙连续之后从路上出发的直线会顶在墙上，所以 `Script_FirstLevelMissionRuntime` 的 Rescue 段（一行）改成先问 `TransferCart.RescueWaypoint`（`MidTransferWalkRoute` 的第一个折点，12 班里人上射位用的同一份），MidTest 从路上 x 72.5–79.5、z 104–134 的每个格点出发逐折点扫墙与门垛。
- 13_3 机位：蹲姿站进夹道北口 (76.8,107.2)，视线落在桥头墩，两墙向桥头收拢。

**第二轮约束变更**

| 条 | 原值 → 新值 | 为什么 |
| --- | --- | --- |
| 西墙 | z 118.5–129.6 一段 → z 103.6–108.0 + 112.95–129.6 两段（一个 4.95 m 门洞） | 向北接长 |
| 东墙 | x 80、z 125.6–136.4 → x 81.7、z 117.85–136.4 | 路更宽（内皮净距 9.975 m），贴到 bay 车进路的北头 |
| `Middle` 之外的「北」通道口 | (73.5,111) 不变，但西墙在那里是门洞 z 108.0–112.95 | 门洞正对通道口 |
| `MISSION_PURSUIT_ROUTE` | 第一轮 (100,120.5)→(84,117)→(74,114.8)→(61,114.8)；现在 (100,120.5)→(86,117)→(74,112)→(61,112) | 穿门洞，不穿墙 |
| bay 车 `approachRoute` 与上车位 | 经 (86,123)、(80,123)，终点 (80,120) → 经 (82.6,116.6)、(79.4,117)，终点 (79,120) | 东墙 z ≥ 117.85 连续，车盒不能压进墙 |
| `triageGap` | z 112–118 → 关闭 | 敞口收成门洞 |
