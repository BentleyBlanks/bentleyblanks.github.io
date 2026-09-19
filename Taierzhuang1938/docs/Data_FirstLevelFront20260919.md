# 第一关 · 公开阶段 1–7（Front 玩法包）

需求原文：[Notion 2026.09.19 采用稿转录](Data_FirstLevelRebuildSource20260919.md) 的 01–07（台词一字不改）。
接口冻结：[分包契约](Data_FirstLevelRebuild20260919Contract.md) §2 / §3 / §5 / §8。
对白与事件接口：[配音同步](Data_FirstLevelVoiceSync20260919.md)。

本页只讲阶段 1–7 怎么编排、事件怎么对位、数值从哪儿来、怎么验收。
步骤 id、事实名、锚点名、cue id **一律以契约为准**，这里不重新命名。

---

## 1. 文件与运行时钩子

| 文件 | 管什么 |
| --- | --- |
| `Script_FirstLevelBunker.mjs` | 01 门外行刑的整拍、缴下的步枪、后侧清理坍塌物的声音；02 掀木架那一拍的到位判定与何有田压制 |
| `Script_FirstLevelCollection.mjs` | 背坡伤员集结处的摆位（02 就在）、传令兵、06 借火戏、老周上担架 |
| `Script_FirstLevelFrontShow.mjs` | 总线：按步骤分发，外加 02 的 `RescueOut`/`TrenchCurse`、04 的指弹药屋与接枪换位、05 的三条对白、07 的私语与路边指路 |
| `Data_Tuning_FirstLevelFront.mjs` | 本段的全部数值与两张节拍表（`BUNKER_KILL_BEATS` / `BORROW_LIGHT_BEATS`） |
| `Script_FirstLevelCampaignFront.mjs` | 阶段 1–7 的正常输入驾驶脚本（`--campaign` 的第一段） |
| `Script_FirstLevelFrontTest.mjs` | 纯 Node 门禁 |

`Script_FirstLevelMissionRuntime` 里只有四个钩子加两条事件转发：

```
constructor   this.frontShow = new FirstLevelFrontShow(this)     // 在 flow.Start() 之前
Enter         this.frontShow?.Enter(stage.id)                    // 紧跟 opening.Enter
Update        this.frontShow?.Update(dt)                         // UpdateSquad 之后（剧情走位压过接触反应）
Update        this.frontShow?.Draw(this.time)                    // view.Update 之后（people.End 会藏没提交的人）
VoiceEvent    Line → OnLine，具名事件 → OnEvent
VoiceDone     → OnVoiceDone
VoicePosition → frontShow.VoicePosition 优先
```

两个位置是**有讲究的**，改动前先看这两条：

- `Update` 在 `UpdateSquad` 之后。剧情要求某人走到某处时，接触反应 / 找掩体每帧都会把他推回掩体；
  放在后面下的走位命令才留得住。02 罗班长掀架的先例在 `UpdateSquad` 里，本包把幺娃也一并放行。
- `Draw` 在 `view.Update` 之后。集结处的伤员与搬运人员走 `FirstLevelMissionView.Person`
  那条实例化人群（不占 AI 的 `actorPool`，那 40 个名额被守军、接防班与前沿防御排满了）。
  它是立即模式，`view.Update` 末尾的 `people.End()` 会把这一帧没提交的人藏起来。

`Script_FirstLevelOpening` 只留近爆兜底与感知曲线，门外那一拍整段转交 `FirstLevelBunkerShow`
（`SpawnCaptives` / `UpdateBunker` / `ResetBunker` 三处转发，`captives` 变成只读 getter）。

---

## 2. 逐阶段编排

### 01 Trapped —— 黑屏、爆炸、受困

```
BunkerBanter（6 句，黑屏）
  └ 末句「来了！顺哥，你那个——」→ 具名事件 BunkerBlast
       → 近爆、控制接管 trapped（只能小幅转头）、scenario 换坍塌态、bunkerCollapsed
BunkerKilling（4 句）→ 逐句 Line 驱动四拍
  line 0 日兵甲「站起来！快点！」  butt    枪托猛砸扶人川军 → 打倒（stance 2）；腿伤者本能后缩
  line 1 伤兵「站你妈……」        recoil  腿伤者再往后缩 bunkerRecoilM
  line 2 扶人川军「日你先人——」   rise    挣扎着要起身（stance 1）
  line 3 日兵乙「杀了他！快点！」  stab    挺刺刀 → 伸手抓枪身 → 被踹开 → 刺杀
  +bunkerCaptiveStabGapS          flank   另一名日兵从侧面补刺腿伤者 → captivesKilled
  +bunkerRifleKickAtS             kick    靴子踢开尸体旁的步枪；另一人枪口转向门内；
                                          后侧同伴清理坍塌物的声音（debrisFall）开始
                                          → Say BunkerSearch
BunkerSearch 播完 → Say ShunziCurse
ShunziCurse 播完 +bunkerCreakAfterS  creak 木架轻响 → 日兵真的走向 ijaDoor → doorSearchStarted
```

**注意两条**：

- 行刑期间两名日兵保持 `scriptedNoncombatant`（编排表 `bunkerAssault` 就是「整段装睡，
  `doorSearchStarted` 才醒」）。放开的话通用 AI 会抢在补刺之前把腿伤者打死，
  「另一名日兵从侧面补刺」整拍消失 —— 这是本轮实拍踩到的第一个坑。
- 不做血腥特写：只有位置、姿态与一次 `TakeHit`，创口由门框、尘土与身体遮挡。

没有音频时按 `bunkerKillFallbackS`（相对 killAt 的 0 / 2.1 / 4.2 / 6.3 秒）兜底，
整段再有一道 `bunkerShowFallbackS` = 16 秒（短于 `trappedMaxS` 20 秒）。

### 02 BunkerRescue / RearTrench —— 班长救人，撤入后交通壕

```
RescueCall（3 句）                                → rescueCallHeard
何有田在 heyoutianFire 开火逼日兵转身还击（真实弹道）
罗班长走到 luoLift、幺娃走到 yaowaLift（两个人在 UpdateSquad 里都被放行）
  两人到位或等满 rescueGatherMaxS → BeginControl("rescue") + Say RescueLift
RescueLift「一、二——起！」82% → 具名事件 RescueHeave
还权 → luoRescueComplete → +rescueOutAfterS → Say RescueOut「枪拿到！从后头走！」
玩家按 F 拾枪                                     → rifleRecovered
—— RearTrench ——
rearTrenchEntered（bunkerRear 5 m）
玩家在沟里站直 trenchPeekS 秒（或 trenchCurseFallbackS 兜底）→ Say TrenchCurse（探头挨骂）
cornerReached（rearCorner 5 m）→ Say CornerCheck（幺娃检查顺子）
collectionPointSeen（collection 14 m）—— 第一次看见担架、伤员与搬运人员
  → Say SupportOrder（撤回守军指路，声音从集结处那个人身上出来）→ supportOrdersHeard
```

集结处的摆位在 `Enter("RearTrench")` 就铺好，读 `MISSION_PLACEMENT.collection`：
4 副担架（常驻白盒体块）＋ 5 名伤员 ＋ 4 名搬运人员（实例化人群）。
传令兵 06 才到（02 路过时只有伤员与搬运人员）。

### 03 Support —— 接回第一批守军

沿用旧演出。入口变成后交通壕尽头：`MISSION_STAGE_ROUTES.rearTrench` 的尾段与
`MISSION_ROUTES.support` 共用 `(-8,-112) → (6,-124)` 两点，`MissionGuideRoute` 的
join 逻辑自己把「集结处 → 前沿」这一截接上，不需要新路线。

`FrontBlockade`（老周指右边破墙）由 `UpdateFrontDialogue` 按「封锁是真的」判时机。
通过条件不变：`frontReached` `frontContact` `frontRifleDefense` `rifleWithdrawalResolved`。

> **遗留**：契约要求这一段有「掩体交替站位」。`TC.support` 的四个站位里只有
> `FrontLeft(-8,-106)` 落在新入口这一段上，另外三个在旧的车站方向。
> 补齐要空间包在集结处→前沿这一段加实体掩体（虚拟站位没有墙＝人站在开阔地上），
> 本包没有自造几何。

### 04 MachineGun —— 接替火力，战车压口

```
TakeOverGun（进场自动）：老周腿伤恶化退出枪位 → zhouGunWounded
玩家接替（机枪可选，步枪也能顶）
战车推进 → 前沿观察所被打掉 → Say TankTerror
frontAttackRepelled → 挑一个离玩家最近、还活着的撤退守军当「指路的人」，
  让他朝 A.bundle（北头弹药屋）转头 bundleOrderPointS 秒 → Say BundleOrder
  （BundleOrder 的声音从这个守军身上出来）
bundleOrderHeard → 何有田走到机枪位、刘文财走到沟口 trenchMouthWatch（一路保持到 05 结束）
tankBlocksExit：战车压到 tankStopZ 附近
```

**04 不再由任务触发关中过场 `CS_MachineGunCaptives`**（契约 §2：主题已由 01 承担）。
过场资产与文件保留，回归改成两条：任务侧断言「不触发」，过场自身仍可直接播。

### 05 Tank —— 班长带路取弹，炸停战车

```
BundleGo（进场自动）：何有田压制、战车转火
去程：战车在 bundleProneRangeM 内、炮塔朝玩家 bundleProneArcRad 以内 → Say BundleProne
弹药屋：Say BundleSupply（留守兵）；F 取弹 → bundleTaken
返程：战车比取弹那一刻又往南压了 bundleReturnTankGainM（或 bundleReturnFallbackS 兜底）
  → Say BundleReturnCall「班长！它往沟口挤了！」
投集束弹 → tankImmobilized → +tankStoppedAfterS → Say TankStopped「停了！」
lastGuardsWithdrawn（最后一批守军真的走完撤退线）
reliefInPosition（接防班从集结处沿后交通壕进阵位）
```

返程不复活去程敌人（`bundleApproach` 只在 `Enter("Tank")` 生成一次）。

### 06 Orders —— 回到伤员集结处，接下后送

```
ordersReached（collection 5 m）→ 依次排队 Volunteer → BorrowLight → ZhouLift
老周靠在土壁边（collection.zhouWall，state "fallen"，不参与队列前进）
BorrowLight（9 句）逐句 / 逐事件驱动七个姿态：
  line 0                             ask     靠土壁叼烟，看见顺子经过，开口要火
  line 4「……就剩这一根了」            pat     摸了两遍衣兜，没找到火
  事件 BorrowLightMatchesPocketed     pocket  顺子把火柴往兜里一收
  事件 BorrowLightCigaretteOffered    offer   老周摸出压扁的纸烟包，抽一根递过去
  line 7「不是最后一根？」             light   顺子先划火给自己点上
  line 8「这下是了。」                 share   再把火递近一点让老周借火
  +borrowLightS+borrowWinceS         wince   老周挪身牵到伤腿，皱眉吸气
ZhouLift 播完 → zhouOnLitter → 老周用 zhouLiftMoveS 秒从土壁挪回队列（state 转 "waiting"）
担架队起行 → columnDeparted
```

烟与火柴是两个小白盒（`MissionZhouCigarette` / `MissionShunziMatchbox`），
不做手部 IK —— 本轮口径是「流程与白盒到位，人物动作可以简化」。

### 07 South —— 沿沟南行

```
真走 MISSION_ROUTES.southWalk（= south，135.4 m）
幺娃靠到玩家侧后方 southWhisperSideM 米（或 southWhisperFallbackS 兜底）→ Say SouthWhisper
  班长不参加这一段随机喘息（带路跑停节奏仍走共享 SquadMarchAi）
villageMouthReached（village 4 m）→ Say VillagePointer
  声音从路边指路的人身上出来：村口以北 southPointerBackM 米、偏出路面 southPointerSideM 米
```

**时长闸**：2.2–2.6 m/s 走完 135.4 m 是 52–62 秒，再加抵达村口后 `VillagePointer`（7.94 秒）
播完，落在 60–70 秒，符合契约的 45–75 秒。`Script_FirstLevelFrontTest` 用
`SouthWalkSeconds()` 静态核这条算式，`--campaign` 的 Front 段实测阶段时长再核一次。

**到达闸的半径**：`villageMouthReached` 是 9 m，不是 4 m。`southWalk` 的终点 (48,−20)
离 `village` 锚点 (55,−20) 整整 7 m —— 4 m 的门意味着沿路走到头的人还差三米够不着，
07 会永远停在那儿（2026-09-20 实测：走完全程 150 秒仍停在 South）。契约 §8 把这条路
冻在 135 m，所以动的是门的半径，不是路。

---

## 3. 数值出处

全部在 `Data_Tuning_FirstLevelFront.mjs`，每一条前面都有一段说明它从哪儿来
（`Script_FirstLevelFrontTest` 有一条断言扫这个）。几条关键的：

| 数值 | 出处 |
| --- | --- |
| `bunkerKillFallbackS` `[0,2.1,4.2,6.3]` | `MissionVoiceTimeline` 对 `BunkerKilling` 的 7.84 秒 / 4 句 |
| `bunkerShowFallbackS` 16 | 短于 `MISSION_TUNING.trappedMaxS` 20 秒 |
| `bunkerButtStrikeS` 0.45 | `Data_MeleeCombat` 的近战 windup 同量级 |
| `bundleProneRangeM` 40 / `bundleProneArcRad` 0.5 | `Data_Tuning_AiShooting` 的 `CLOSE_RANGE` 一档；0.5 rad≈29°，比 `tankHullMgArcRad` 宽一点 |
| `southMarchSpeedMps` 2.2–2.6 | Notion 采用稿 07 的配速要求 |
| `southTargetSecondsMin/Max` 45 / 75 | 契约 §2 |
| `zhouLiftMoveS` 2.6 | `MISSION_TUNING.litterSpeedMps` 1.4 m/s 量级 |

摆位坐标一律来自 `MISSION_PLACEMENT`（`bunker` / `collection`），本包不写坐标。

---

## 4. 验收命令

纯 Node（秒级）：

```powershell
node Taierzhuang1938/Script_FirstLevelFrontTest.mjs
node Taierzhuang1938/Script_FirstLevelMissionTest.mjs
node Taierzhuang1938/Script_MissionGatesTest.mjs
node Taierzhuang1938/Script_FirstLevelVoiceTest.mjs
node Taierzhuang1938/Script_FirstLevelVoiceTest.mjs --audio
node Taierzhuang1938/Script_FirstLevelSpaceTest.mjs
node Taierzhuang1938/Script_TextTest.mjs
node Taierzhuang1938/Script_ModuleGraphTest.mjs
node Taierzhuang1938/Script_TestRunnerTest.mjs
node Taierzhuang1938/Script_FirstLevelLeaderGuideTest.mjs
```

浏览器（有跨 worktree 全局锁，单跑直接 node 脚本）：

```powershell
node Taierzhuang1938/Script_FirstLevelMissionBrowserTest.mjs                 # 基线：01 坐着看完
node Taierzhuang1938/Script_FirstLevelMissionBrowserTest.mjs --campaign --stage-to=7   # 只跑 1–7（runner 的 FirstLevelSquadMarchTest 就是这条）
node Taierzhuang1938/Script_FirstLevelMissionBrowserTest.mjs --campaign      # 整关（Mid 还是 TODO，会在那儿停下）
node Taierzhuang1938/Script_FirstLevelMissionStageJumpTest.mjs
node Taierzhuang1938/Script_FirstLevelMachineGunTest.mjs
node Taierzhuang1938/Script_FirstLevelMachineGunCutsceneTest.mjs
node Taierzhuang1938/Script_FirstLevelFrontPresenceTest.mjs
node Taierzhuang1938/Script_FirstLevelFrontRouteBrowserTest.mjs
node Taierzhuang1938/Script_FirstLevelCasualtyBrowserTest.mjs
node Taierzhuang1938/Script_FirstLevelLeaderGuideBrowserTest.mjs
```

取证截图落在 `Taierzhuang1938/_shots/L1Front/`（忽略目录）：受困视角看行刑的四个关键帧、
获救、后交通壕途经集结处、前沿接应、机枪位、弹药屋、战车压口、借火、南行途中。

---

## 5. 已知缺口

- **03 的掩体交替站位**：需要空间包在「集结处 → 前沿」这一段加实体掩体，见上文 03。
- **借火的手部动作**：烟与火柴是白盒，没有手部 IK，也没有点火的光。
- **老周靠土壁**：用 `state "fallen"` 表示「还没上担架」，视觉上是躺在土壁边而不是靠坐。
- **行刑的创口遮挡**：靠门框与身体位置，没有专门的遮挡体积；换摆位时要重新看一眼。
