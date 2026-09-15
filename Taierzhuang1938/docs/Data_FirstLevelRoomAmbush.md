# 第一关 · 屋内伏击（内部步骤 `Melee` / 公开阶段 9）

入口 `?whitebox=p012`。这一步夹在公开阶段 8「村口截击」和阶段 10「夺下院子」之间，
是第一关唯一一次被人贴身顶住的戏。本文件是这一拍的唯一口径：需求原文、拍表、事实、
数值出处、动作与配音依赖、验收命令与结果。

## 1. 需求原文（2026-09-15 用户）

罗班长刚喊完：

> 「顺子！穿右手那间屋！把窗口的机枪干掉，再把院门打开！担架从里头过！幺娃跟他！」

顺子（玩家）进那间屋（`ConnectedHouse`，中心 (58,8)，墙心 x 52/64、z 0.5/15.5，
北门开在 z=0.5、x 56.1–59.9），**老周的担架队就跟在他身后**（老周躺担架、两个抬担架的、幺娃）。
屋里藏着几个日军，一起动手：

- 玩家被刺刀捅一刀 → 站立 QTE（连按 F）跟领头那个较劲；
- 背景里老周和两个抬担架的被另外几个捅穿肚子；
- 玩家挣脱（成败都挣脱得开，控制权还回来）；
- 罗班长／何有田／刘文财几秒后从灶屋冲进来，和玩家一起把屋里的日军清掉。

已定、不再讨论的设计：

- **老周活下来**，带着肚子上的伤继续往南（他要撑到公开阶段 17「老周牺牲」才死）；
  **两个抬担架的都死**，由担架队既有的替补机制补上；**幺娃被撞倒但活着**（`scriptEssential`）。
- **复用既有内部步骤 `Melee`**。不新增步骤：`MISSION_STAGES` 仍是 27 条、公开阶段仍是 18 个、
  `Melee` 的通过条件仍然只有 `["meleeResolved"]`（＝四个人全死）。旧的 `MeleeTutor` 删除。
- 惨叫不走 TTS，用既有的白刃／创伤音效；只有台词是 Seed Audio。

## 2. 拍表（实装）

时间以**伏击触发**为零点。括号里是 `Data_Tuning_FirstLevel.mjs` 的键。

| 时刻 | 发生什么 | 事实 |
| --- | --- | --- |
| −∞ | 南行转场的黑屏里，老周这一副担架被提到队首前一个车距（`ambushLitterLeadM` 3.4） | — |
| 村口→屋门口 | 只推老周这一副：目标＝玩家在同一条路线上的投影减 `ambushLitterFollowGapM`(4)，速度 `ambushLitterLeadMps`(3.2)，上限是屋子北门口 `ambushLitterDoorZ`(1.4)。其余九副原地等 | — |
| 进入 `Melee` | 担架没到门口就再等，最多 `ambushLitterWaitS`(3) 秒，期间提速到 `ambushLitterRushMps`(4.2)，到点照样触发 | — |
| 0.00 | 触发。锁控制（kind `"ambush"`，**不给 spawnGrace**）、视线在 `ambushLookSeconds`(0.35) 内甩到领头那个胸口（`ambushLookHeightM` 1.4）；`Say("RoomAmbush",{urgent:true})`；领头的和后面两个起身（`AmbushRise`），侧翼那个不动 | `ambushTriggered` |
| ≈0.8 | 领头那个扑到刺刀接触距离（`ambushBindReachM` 1.15，速度 `ambushLungeMps` 3.4，超过 `ambushLungeMaxS`(1.2) 也照样捅；实拍 3.61 m → 1.11 m 用 0.75 s，见 §4.1 第 3 条）→ 剧本伤害 `ambushStabDamage`(24)，kind `"qte"`；随即**顶住**：`MeleeCombat.HoldScriptedBind` 把两个人摆成僵持姿势（`Bind`），**连按窗口还没开，按 F 不算数** | `ambushStabbed` |
| 1.5 | `AmbushRearA` `BayonetStabStanding` → **前抬者**倒（`ambushBearerStabAtS`） | — |
| 2.4 | 幺娃被撞倒，趴 `ambushYaowaDownS`(6) 秒（`ambushYaowaDownAtS`） | — |
| 3.2 | `AmbushRearA` 第二刀 → **后抬者**倒（`ambushRearBearerStabAtS`） | — |
| ≈3.2 | 顶住 `ambushPinHoldS`(2.4) 到时间：开连按窗口 `BeginScriptedBind`（窗口 `min(MELEE_QTE_RULES.windowS 4.8, ambushQteWindowS 3.2)`、力度 `ambushQteStrength` 0.75、标题 `gameplay.melee.qte.ambush`），底部进度卡与 `firstLevel.hint.ambush` 这时才出来 | — |
| ≈4.3–7.0 | QTE 结算（成功或失败；实拍 5 Hz 连按用 2.1 秒挣脱）。失败额外扣 `ambushFailureExtraDamage`(18)，叠在共用 `standingFailureDamage`(12) 之上。结算完**控制权还不还**：进 witness 段，视线在 `ambushLookSeconds`(0.35) 内从刺刀拉到担架上（`ambushLitterLookHeightM` 0.7） | — |
| 7.50 | **老周挨刀 —— 还锁着的时候**。由 Package B 在 `RoomAmbush` 第三句「啊！肚子……狗日的……」上打的事件 `AmbushZhouLine` 触发；`AmbushRearB` 的 `BayonetStabDown` 在此前 `ambushClipLeadS`(0.55) 起播。老周血量降到 `ambushZhouHealthAfter`(45)，担架落地 | `zhouStabbed` |
| ≈8.4 | 这一刀**演完**（`ambushWitnessTailS` 0.9：刀拔出来了）才**挣脱**：还控制权、清掉剧本僵持留下的配额与冷却；四个人按 §3.3 的延迟排队转成普通敌兵；`Say("RoomAmbushBreak")`，底部提示换成 `firstLevel.hint.melee`。整段锁住约 8.5 秒，兜底上限 `ambushLockMaxS`(9.5) | `ambushBroken` |
| ≈9.9 | `ambushBroken + ambushSquadDelayS`(1.5)：罗班长、何有田、刘文财沿 `ambushSquadRoute` 穿灶屋进屋（`ambushSquadSpeedMps` 3.6 档，走共用行进节奏） | — |
| 第一个人进屋 | 判定用 `MISSION_PLACEMENT.roomInterior` | `ambushSquadArrived` |
| 四个全死 | `Say("RoomAmbushCleared")`；担架队请两个替补来抬；幺娃起身 | `meleeResolved`（保留既有 `sharedCombat:true`） |
| 之后 | `RoomAmbushCleared` 第四句「后头喊两个人上来抬！」处的 `AmbushLuoOrders` 再调一次替补请求（幂等） | — |

### 2.1 顺序是怎么保住的：顶住 → 连按 → 看着那一刀 → 挣脱

需求要的是「背景里老周和两个抬担架的**在玩家被顶住的时候**被捅」。四条事实的顺序因此是
`ambushTriggered` → `ambushStabbed` → `zhouStabbed` → `ambushBroken`，**`ambushBroken` 永远排在
`zhouStabbed` 之后**（纯 Node 与浏览器两处都断言了这一条）。

难点在已经烘好的整段配音：`RoomAmbush` 全长 14.03 s，老周那一声在 7.50 s；而共用僵持窗口的上限是
`MELEE_QTE_RULES.windowS` 4.8 s（`MeleeQte.Begin` 会夹取），**这条共用规则不动**（放宽它会改全项目的
僵持手感）。于是把这一拍拆成三段，靠两头的编排把 7.50 秒这一刀圈进控制锁里：

1. **顶住（`pinned`，`ambushPinHoldS` 2.4 s）**：刀已经进去了，两个人摆成 `Bind`，连按窗口还没开。
   三条背景拍（前抬者 1.5 / 幺娃 2.4 / 后抬者 3.2）全落在这一段里 —— 玩家在锁住的视锥里看着他们倒下，
   手上没有该按的键。这一段**不上 QTE 卡、不给「连按 F」的提示**：一张按了不算数的进度卡教的是错东西，
   这几秒该看的是背景。
2. **连按（`bind`，`min(4.8, 3.2)` = 3.2 s）**：窗口最晚在 1.2 + 2.4 + 3.2 + 0.6（共用 `resolveS`）= 7.4 s
   收尾，正好压在老周那一声之前。`Script_FirstLevelMissionTest` 守着这条不等式。
3. **看着那一刀（`witness`）**：连按结算完控制权仍然不还，视线拉到担架上，等 `zhouStabbed` 落下、
   再让 `BayonetStabDown` 把刀拔出来（`ambushWitnessTailS` 0.9 s）才记 `ambushBroken`。
   实拍（5 Hz 连按、2.1 秒挣脱）里这一段是 2.1 + 0.9 秒；连按赢得更快就更长，输到超时最短约 1 秒。
   这是把刀钉在 7.50 秒那一声上必然要付的等待，代价记在这里。

`ambushZhouStabAtS`(7.6) 是**没有配音时的兜底期限**，取自同一条对齐，所以关掉音频跑出来的节奏一样。
整段锁住约 8.5 秒，控制锁兜底 `ambushLockMaxS` 9.5 秒；两条都由数值自洽断言守着。

顶住那一段的入口是共用层新加的 `MeleeCombat.HoldScriptedBind` / `EndScriptedHold`（`Script_MeleeCombatTest`
两条新规则测试）：只摆姿势、不动 QTE 配额，出口要么是 `BeginScriptedBind`，要么是 `EndScriptedHold` ——
`"qte"` 这个状态不会自己超时，旁路（领头那个被打死、控制锁兜底超时）必须显式收掉，否则两个人会一直顶着。

witness 那一段里如果玩家先把 `AmbushRearB` 打死，运行时仍然把这一拍落下（`UpdateAmbush` 里那一条）：
刀已经推出去了，而且 `RoomAmbushCleared` 的台词与老周后面几级血量台阶都建立在他挨了这一刀上，
让这几秒的运气取消整条线是更糟的结果。不过这时候玩家的手是锁着的，只有班里人能打死他 ——
而班里人要挣脱之后才出发，所以实际上这条兜底几乎不会用到。

## 3. 名单与坐标

### 3.1 敌军（`Data_FirstLevelMission.MISSION_ENCOUNTERS.melee`，全部 `Type38` + 上刺刀）

| id | 藏身点 | 靠什么挡住视线 | 职责 |
| --- | --- | --- | --- |
| `AmbushLead` | (61, 4) | 既有 `MeleeAlcoveScreen` | 扑玩家、剧本刺击、站立 QTE |
| `AmbushRearA` | (53.6, 2.4) | 新增 `AmbushWestScreen` | 先捅前抬者，再捅后抬者 |
| `AmbushRearB` | (53.6, 4.6) | 新增 `AmbushWestScreen` | 捅担架上的老周 |
| `AmbushFlank` | (62.4, 14.3) | 新增 `AmbushCornerCrates` | 压到挣脱之后才动 |

### 3.2 新增布景（`Data_FirstLevelMissionLayout.mjs`）

- `Wall("AmbushWestScreen", 54.6, 3.5, 0.35, 1.9, 4.2)` —— 贴西墙的南北向隔断。
- `Block("AmbushCornerCrates", 61.9, 12.6, 3, 1.7, 1.6, "cover")` —— 东南角货箱堆。
  南面到墙内侧留 1.8 m：留窄了 `ai.Spawn` 会把侧翼那个挤出屋外（实拍顶到过 (60.5,16.5)）。

两块都不挨 x=58 的担架通道，也不挨南北两扇门 x 56.1–59.9 的开口；
「从北门 (58,0.5) 看不见」「从触发点 (58,6) 看不见」这两条由 `Script_FirstLevelMissionTest` 逐段求交断言。

### 3.3 屋里这一场的战斗规则（实拍调出来的，别回滚）

1. **屋内不开枪，全程刺刀。** 四个伏击兵整段 `Melee` 都挂着 `ambushSilentSector`
   （`InFireSector` 对任何候选返回 false），走位与出手交给共用白刃规则。
   依据：三八式一枪 72 点伤害，挨过剧本那一刀之后顺子只剩 76 血 —— 实拍里两米外被点名就是一枪死，
   而且贴脸端枪瞄准本来就不合理。罗班长自己的命令就是「进！上刺刀！看准了打，里头有自己人！」。
   刺刀的 50/110 走 `COMBAT.player.meleeScale`，打起来是有来有回的。
2. **四个人排队上，不是一起压。** `ambushReleaseDelayS` / `ambushFlankReleaseS`：
   顶住玩家那个 0 秒、刚拔出刺刀那个 4.5 秒、绕货箱堆那个 7 秒、捅老周那个等自己那一刀落完。
   实拍：三个人同时压上来时，顺子在班里人赶到之前必死（两次实测都是挣脱后 4–6 秒阵亡）。
   班里人在挣脱后 `ambushSquadDelayS`(1.5) 起跑、约 3 秒进屋，正好接上第二个人放出来的时刻。
3. 与契约建议值的两处下调，都是实拍改的，理由写在 `Data_Tuning_FirstLevel` 对应行的注释里：
   `ambushStabDamage` 30 → 24（挨完这一刀是 76 血不是 70 血），`ambushSquadDelayS` 2.5 → 1.5。

### 3.4 友军站位（`MISSION_PLACEMENT`）

- `ambushSquadPosts` = (55,−14.2) / (61,−14.2) / (58,−15.4) —— 罗班长、何有田、刘文财贴着灶屋北门内侧掩护。
  贴门口而不是门外十米，是因为挣脱之后他们要在顺子被围死之前跑进屋（同样是实拍量出来的）。
  冲进屋那一段跳过共用的「看见敌人就停下来对射」（`RespondToContact`）：隔着灶屋门口对射帮不上忙。
- `ambushYaowaPost` = (56.4, 0.6) —— 幺娃跟着担架到屋门口。
- `ambushSquadRoute` = (58,−8) → (58,−3) → (58,−0.4)，每人再按 `ambushSquadLanesM` 左右错开 —— 挣脱之后进屋的折线。
- `ambushSquadEntry` = (56.4,4.6) / (60.2,4.2) / (57.4,8.6) —— 三个人在屋里的落点。
- `roomInterior` = x 52.6–63.4、z 1–15 —— 判定「进屋了没有」。

## 4. 实装位置

| 做什么 | 在哪 |
| --- | --- |
| 编排状态机（纯 Node，注入钩子） | `Script_FirstLevelMissionAmbush.mjs` |
| 副作用（锁、走位、伤害、担架、班组、动作、重试） | `Script_FirstLevelMissionRuntime.mjs` 的 `AmbushHooks()` 与其下一整段 |
| 顶住（不给连按）/ 收掉顶住 | `Script_MeleeCombat.HoldScriptedBind` / `EndScriptedHold` |
| 剧本僵持入口 / 清配额 | `Script_MeleeCombat.BeginScriptedBind` / `ClearQteBudget` |
| 锁着的时候改看的地方 | `Script_FirstLevelMissionRuntime.AimControl`（`BeforePlayer` 的转头段带 `lookFrom` 起点） |
| QTE 标题覆盖 | `Script_MeleeQte`（`context.label === "ambush"`） |
| 担架队：提到队首、跟进、伤亡、替补 | `Script_FirstLevelMissionColumn`：`PromoteZhouLead` / `UpdateLead` / `AmbushCasualty` / `AmbushRecover` |
| 演出层（骨骼 clip 盖在 mixer 之上） | `Script_FirstLevelMissionPeople`：`InstallAmbushPerformance`（士兵）、`SetAmbushClip` / `PlayAmbushClip`（担架员） |
| 数值 | `Data_Tuning_FirstLevel.MISSION_TUNING` 的 `ambush*`（每条带出处注释） |
| 文本 | `firstLevel.hint.ambush`、`gameplay.melee.qte.ambush`、`menu.condition.meleeResolved` |
| 调试跳转 / 检查点重建 | `Script_FirstLevelMissionStageJump`、`Script_FirstLevelMissionCheckpoint`（阶段 8/9/10 分别是「队首在村口」「担架在门口、四个人藏着」「伏击已打完」） |

### 4.1 五条会咬人的实现细节

1. **控制锁不许给 spawnGrace。** `BeginControl` 里 death/dive/southTransition 三种会置
   `player.spawnGrace`（等于无敌，见 `Script_Player`）。`"ambush"` 不在那张表里 —— 这一刀必须真的落上。
   浏览器验收专门断言 `player.Protected === false`。
2. **演出中的人要能走、又一枪不开。** `scriptedNoncombatant` 的人在 `Script_Ai.Think` 里直接 return，
   根本不走位；所以起身之后必须清掉这个旗，改挂 `ambushSilentSector`（`InFireSector` 对任何候选都返回 false）。
   四个人整段保持 `meleeTraining.passive`，`ImmediateThreat` 才不会把玩家从僵持里拽出来
   （它挑的是 `!e.meleeTraining?.passive` 的人）。
3. **扑过来那一段，领头那个也必须是 `meleeDormant`。** 挂着 `meleeTraining` 又不 dormant 的人会被
   `MeleeCombat.Step` 认领（`managed`），于是 `Script_Ai.Act` 第一句就把整帧交给 `StepMeleeCombat` ——
   那条路不走导航。症状：他站在藏身点一步不动，`ambushLungeMaxS` 超时照样记刺中，
   玩家在三米外凭空掉 24 点血（2026-09-15 实拍量到 3.67 m，就是这么漏过去的）。
   正确的接法是：`WakeAmbusher` 四个人全 dormant，顶住那一瞬 `HoldAmbushBind` 再把领头那个
   交回白刃层（`meleeDormant=false`）摆僵持姿势。实拍：3.61 m → 1.11 m 用 0.75 s，
   顶住全程 1.11–1.18 m。浏览器验收断言 `leadDistanceM <= ambushBindReachM + 0.5`。
4. **`"qte"` 这个 fighter 状态不会自己超时。** `StepFighter` 见到它直接 return，出口只有
   `FinishQte` 或显式的 `EndScriptedHold`。顶住那一段（`pinned`）不是 QTE，所以每一条旁路
   —— 领头那个被打死、控制锁兜底超时、检查点重试 —— 都要经过 `EndBind` 钩子，否则两个人
   会一直保持顶住的姿势、玩家挥不动也换不了枪。
5. **换过 `squadRoutes` 就必须重建 `SquadMarchAi`。** 它在构造时把每个人当时的路线数组抓进 `members`，
   之后换掉 Map 里的数组，共用层还在按旧数组算前后与间距。运行时统一走 `RebuildSquadMarch(route)`。

## 5. 与另外两个包的接口

- **配音（Package B，已交付；口径见 [屋内伏击配音同步](Data_FirstLevelVoiceSyncRoomAmbush.md)）**：`RoomAmbush`(14.03 s，urgent) / `RoomAmbushBreak`(9.14 s) /
  `RoomAmbushCleared`(19.54 s)，以及两个段内事件 `AmbushZhouLine`、`AmbushLuoOrders`，
  由 `FirstLevelMissionRuntime.VoiceEvent` 消费。
- **动作（Package C，已交付；口径见 [屋内伏击动画库](Data_FirstLevelAmbushAnimation.md)）**：`Script_FirstLevelAmbushAnimation.mjs` 加载器 +
  `Animation/FirstLevelAmbush/`（LugouIja01/02/03 各 `AmbushRise` / `BayonetStabStanding` / `BayonetStabDown`，
  LugouNra02/05 各 `BearerStabbed` / `PatientStabbed` / `PatientWoundedIdle`）。
  实拍里 `Debug.FirstLevelMission().ambush.animationError === null`、三个人起身时 `clip === "AmbushRise"`。
  库拉不下来时整条演出层静默让路（`Prepare…` 返回 null）：日军退回既有站姿／受击姿态，
  抬担架的退回既有布娃娃倒地，任务与事实一条不差。
- **老周换成带骨架的伤员**：平时他由 `MissionPeople.Patient()` 画，是实例化的烘焙静态姿势，
  播不了动作；挨刀那一瞬 `view.people.SetAmbushClip(zhou.id, "PatientStabbed", "PatientWoundedIdle")`
  一置上，`MissionPeople.RiggedPatient()` 就改用真的 Person（LugouNra02）并按担架床面 `deckY` 采样，
  放完 2.6 s 的挨刀段自动接上 3.0 s 的循环喘息段，一直演到第 17 阶段他断气为止
  （`litter.health <= 0` 就退回实例化姿势 —— 死人不能继续喘）。库不在也退回那条实例化路。
  另外可见的变化：担架落地（`state:"fallen"`，高度 0.22 m、前倾 0.45 rad）＋ 两个抬担架的成为尸体。

## 6. 验收

命令从 worktree 根执行。

| 命令 | 结果 |
| --- | --- |
| `node Taierzhuang1938/Script_FirstLevelMissionTest.mjs`（配音资产改过时加 `--audio`） | 见下方「验收记录」 |
| `node Taierzhuang1938/Script_FirstLevelMissionTopologyTest.mjs` | |
| `node Taierzhuang1938/Script_TextTest.mjs` | |
| `node Taierzhuang1938/Script_MeleeCombatTest.mjs` | |
| `node Taierzhuang1938/Script_MeleeQteTest.mjs` | |
| `node Taierzhuang1938/Script_FirstLevelAmbushAnimationTest.mjs` | |
| `node Taierzhuang1938/Script_ModuleGraphTest.mjs`（改过浏览器模块必跑） | |
| `node Taierzhuang1938/Script_FirstLevelMissionTopologyBrowserTest.mjs` | |
| `node Taierzhuang1938/Script_FirstLevelMissionStageJumpTest.mjs` | |
| `node Taierzhuang1938/Script_FirstLevelMissionBrowserTest.mjs --campaign` | |

屋内伏击这一段还有一条更短的定向入口（只跑公开阶段 8 → 12，约六分钟）：

```powershell
node Taierzhuang1938/Script_FirstLevelMissionBrowserTest.mjs --campaign --stage-jumps --stage-from=8
```

它逐拍驱动这一拍并断言：担架跟到屋门口、四个人都真的站在屋里（出生点没被物理挤出墙外）、
控制锁起来且**没有出生保护**（这一刀必须真的掉血）、领头那个**真的扑到刺刀接触距离**、
顶住那一段里共用 QTE 没开（按 F 不算数）、连按窗口开在刺中之后 `ambushPinHoldS`、
底部 QTE 进度卡真的在屏幕上、连按 F 之后控制锁**还在**、老周在锁着的时候挨刀且血量落到
`ambushZhouHealthAfter`、事实顺序 `zhouStabbed` 排在 `ambushBroken` 前面、两个抬担架的成尸体、
班里人进屋、四个人全死之后阶段自己推进到 Courtyard。

截图留在忽略目录 `_shots/FirstLevelStageVillage/`：担架跟进、触发、顶住（左边是刚倒下的抬担架的）、
连按进度卡、老周挨刀、挣脱、班里人进屋、屋子清干净。

**`--campaign` 从第一阶段整跑不稳，卡点全在公开阶段 5 的集束弹那一段**（不是这一拍）：

| 跑次 | 树 | 结果 |
| --- | --- | --- |
| A 包 2026-09-15 两次 | 本分支 | `BundleSupply` 死三回超预算 / 带 41 血走到 Orders 之后流血致死 |
| 集成轮第 1 次 | 本分支 | `BundleSupply` 第 17 航点死一次（重试 1/2）→ 带 16 血 0 绷带到村口 → `VillageKitchen` 流血致死 → 再重试弹药归零走不动 |
| 集成轮第 2 次 | 本分支 | 卡在 `Tank` 那一步没推进到 `Orders`（离集束弹还有 108 m），零重试 |
| 集成轮基线 | 干净 `origin/master` `62cf16926` | 通关（途中两次检查点重试） |

判断依据不是「基线也红」，而是**这一拍够不到阶段 1–6**：屋内伏击最早介入的代码是阶段 7 的
`PlaceSouthArrival` 与阶段 8 的 `Enter("Village")`；跨阶段共用的三处改动
（`Guide` 抽出 `RebuildSquadMarch`、`BeginControl`/`BeforePlayer` 的 `lookFrom` 视线段、
`MeleeCombat` 新增的两个 `ScriptedHold` 入口）对非 `ambush` 的路径逐字等价 ——
`lookFrom` 缺省为 0 就是旧公式，两个新入口除了这一拍没有任何调用点。
阶段 8→18 的连续真输入通关（上面那条定向入口）是绿的：合三包、修完扑刺、rebase 之后各跑一次，
三次都一路跑到 `Complete`，零 pageerror。阶段 1–6 的失血账留给前沿那一拍的负责人。

### 验收记录（2026-09-15 · 合三包之后的集成轮）

纯 Node 闸门全绿：`Script_FirstLevelMissionTest`（27 段，含本拍的规则测试：
触发闸 / 出生保护闸 / 顶住那一段不算连按 / 成功挣脱 / 失败挣脱 / 连按窗口最短可见 /
配音驱动老周那一刀（早到就早挣脱）/ 领头在扑过来路上或顶住时被打死 / 重试两条路 /
担架队伤亡·快照还原·替补 / 数值自洽）、`Script_FirstLevelMissionTopologyTest`、
`Script_TextTest`（0 失败）、`Script_MeleeCombatTest`（46 条，含新加的顶住入口两条）、
`Script_MeleeQteTest`、`Script_FirstLevelAmbushAnimationTest`（五个模型 × 各三段全过）、
`Script_ModuleGraphTest`、`Script_TestRunnerTest`、`Script_TextGather --check`。
选测入口 `Script_TestRunner --changed=origin/master --profile=quick --fail-fast`：54 过 0 败。

定向浏览器验收（`--campaign --stage-jumps --stage-from=8`，真实输入跑到 `Complete`）实测这一拍：

| 量 | 实测 |
| --- | --- |
| 触发 | 控制锁 `ambush`，`player.Protected === false`，四个人都站在屋里 |
| 扑上来 | 3.61 m → 1.11 m，0.75 s；顶住全程 1.11–1.18 m |
| 刺中 | 100 → 76（24 点，kind `qte`） |
| 顶住 | 2.03 s 里 `meleeCombat.Active === false`（按 F 不算数），期间前抬者倒下 |
| 连按窗口 | 开在刺中之后 2.4 s，`windowS` 3.2 s，标题「被刺刀顶住」，底部进度卡在屏幕上 |
| 挣脱 | 11 次 F，结算完控制锁**仍是** `ambush`、相位 `witness`、没有 `ambushBroken` |
| 老周挨刀 | 锁着的时候落下（story 7.53），血量 45、`stabbed`，两个抬担架的成尸体 |
| 还控制权 | story 8.42，事实顺序 `zhouStabbed` → `ambushBroken` |
| 之后 | 班里人进屋、四个全死、阶段自己推进到 Courtyard，玩家存活（53 血） |

截图实看（`_shots/FirstLevelStageVillage/`）：`Scene_AmbushTrigger`（锁住的视线甩到起身的领头那个）、
`Scene_AmbushPinned`（被刺刀顶住，左边是刚倒下的抬担架的）、`Scene_AmbushQte`（底部僵持进度卡）、
`Scene_AmbushZhouStab`（落地的担架、担架上的老周、字幕正是他那一声，两个日军站在担架旁）、
`Scene_AmbushBreak`、`Scene_AmbushSquadEntry`、`Scene_AmbushCleared`。

已知的基线红（不是这次改出来的，别去「修」）：`Script_PhysicsTest.mjs` 的帧耗时、
`Script_BootTest.mjs` 的「远景辨识材质 count=0」、`Script_DamageTest.mjs` 的手榴弹警告文字、
`Script_RangeTest.mjs` 的刺刀大刀复位（2026-09-15 基线，见 memory）。

留给后续的两处：

- **`?whitebox=p012&missionStage=9` 这条 URL 起点不建屋子的几何**（只建当前切片），
  所以直接开这个地址取证只能看到空地上的四个人；这一拍的视觉验收要走
  `--campaign --stage-jumps --stage-from=8`（它先把整关建起来再 `Debug.FirstLevelJump(9)`）。
- `Scene_AmbushSquadEntry` 那一帧构图很挤：班里人贴着玩家站，近裁面切进身体。
  不影响事实与流程，属于后续打磨。

