# 第一关 01–02 导演（2026-09-23 新稿）

需求原文：[01–02 新稿](Data_FirstLevelOpeningSource20260923.md)。跨包口径：[01–05 重构契约](Data_FirstLevel0105Refactor20260923Contract.md) §2 第 1 条（还权门槛）、§5.1–§5.5（角色、对白场景、phase、clip、对白接口）。空间：[01–06 空间重排](Data_FirstLevelSpace0106_20260923.md) §2.1、§3、§10.2。
代码：导演 `Script_OpeningStoryboards.mjs`（`FirstLevelBunkerShow`），数据 `Data_OpeningStoryboards.mjs`（phase 表、标记、折线、超时、镜头与手部、震荡、追兵、集结处）。09.21 稿的分镜与验收见 [旧页](Data_OpeningStoryboards20260922.md)，只作历史。

## 1. phase 表

按契约 §5.3，`Data_OpeningStoryboards.phases` 是唯一来源，导演每进一拍记进 `beats` 与 `events`，驾驶器按这个顺序核对。

| 段 | phase |
|---|---|
| Trapped（01） | Banter → Orders → Incoming → Blast → Black → Wake → FrontPass → CaptiveDragged → CaptiveWall → Interrogation → Slash → Taunt → Wipe → Reach → Found → Drag → Snag → KickBeam → DragOut → Butt → Boots |
| BunkerRescue（02） | Hold → Ask → KickShunzi → Glimpse → Collar → Chop → Parry → Flee → DragCover → LongShot → Check → KickRifle → Released |
| RearTrench（02 撤离） | Withdraw → Corner → Collection → SupportOrder |

- 对白一律用 `voice.PlayScene` 播契约 §5.2 的 13 个场景。事件与动作对齐：`BunkerIncoming.01` 被近爆截断；「立て！」对上日兵甲 2.2 s 的猛拽（`IjaDragCollarFromDirt` 的 `jerkUp` 事件）；割喉接触帧发 `ThroatCut`，之后才嘲弄；「说话！」要等顺子抬眼、罗班长离刀位不到 3.6 m。
- 成对动作按动作库 manifest 的 `stages` 相对站位摆位。接触时刻、事件时刻与 clip 时长都从 manifest 读（`ContactAt` / `EventAt` / `ClipLength`），Anim 包重烘后不用改导演。
- 演员沿数据里的沟内折线走，转身限速。导演移动不走物理，所以不会被卡住。
- 剔除：AI 在一帧里先按玩家自己的视角剔除人物（`Script_Main` 里 `ai.Update` 在任务的 `ApplyCamera` 之前），被剔掉的人整棵子树摘出场景、动画层不跑。导演镜头朝向和玩家视角不同，以前镜头正中的人会被摘掉（K2 时罗班长整个看不见）。现在导演在 `ApplyCamera` 之后按实际镜头再剔一次；导演正在摆姿势的人在镜头外也照样更新动画（根节点可见但不在场景里，什么都不画，跟 AI 对车厢乘客的做法一样）；其余被剔掉的人打上 `openingNotShown` 标记，下次回到画面时动画层不从旧姿态混合，也不按旧位置重新定根。
- 被剔掉的人骨骼不更新，所以视线、说话位置和镜头目标在这时改用身体位置（`culledHeadM`）；班组的脚本枪声从头部发出，但不低于脚下 `shotRiseM`（蹲在塌土后面的人要站起来开枪）。
- `Put` 判断「重新定根」时，比较的是导演自己上一帧摆的位置和朝向，不是 AI 当前的朝向。装睡的 AI 会在两帧之间把人转向它最后听到动静的方向；以前按 AI 朝向判断，日兵甲在 02 每帧都被判成重新定根，姿态混合每帧重来，骨架顶骨的偏移越积越多，人沉到地下 10 m。动作层每帧开头把顶骨复位到静止姿态。

## 2. 还权（契约 §2 第 1 条）

- 日兵甲、乙必须在刀的接触帧被真实砍死。打不死就在 `contactKillS` 内补成致命伤。
- 岔口的日兵丁必须被真实击倒：刘文财到位后开枪，有视线才打中；打偏则何有田拿到步枪后补枪，再打偏由罗班长在 `longShotForceS` 补枪；超过 `longShotForceS + 0.5 s` 仍活着就强制击倒，记 `junctionShot{by:"forced"}`。
- 折角的日兵丙和追兵活着也可以还权。
- 先头兵不在敌人表里（生成失败、调试删除）时：岔口记 `junctionShot{by:"absent"}`；踢枪超过 `kickRifleS` 仍放行，缺席者写进 `playerDraggedFromWreck.missing`。
- 还权位是洞口南门柱与塌土后面的 `shunzi.cover` (0.45, −124.35)。门柱挡住 J 与 F，离踢过来的枪 0.34 m。空间文档 §3 的 `returnSpot` (−0.2, −122.2) 在塌土西侧，枪踢不过去，所以两处不一致，**待集成负责人拍板**改哪一边。`rearTrenchEntered` 的锚点离它不到 5 m，照样能触发。

## 3. 超时（`Data_OpeningStoryboards.timeouts`，单位秒）

每个等待点都有超时，超时的做法是强制完成那个动作，不跳过它。

| 等待 | 超时 | 超时后 |
|---|---|---|
| Banter 场景结束 | 场景时长 + `banterExtraS` 8 | 进 Orders |
| 传令兵到位 / 出洞 | `runnerArriveS` 9 / `ordersExitS` 9 | 开对白 / 进 Incoming |
| 近爆事件 | `blastEventS` 3.5 | 导演自己放近爆；近爆已记但导演没切时直接切 |
| 甲乙走到拖人位 | `frontPassS` 14 | 在场的人摆到位，拖人照演 |
| 翻译走进来 / 拖人场景 | `walkInS` 12 / 场景时长 + 12 | 进审问 |
| 审问、嘲弄对白 | 场景时长 + 10 / + 8 | 进割喉 / 进蹭刀 |
| 罗班长到刀位 | `luoArriveS` 7 | 就地落到刀位，开砍 |
| 何有田到位 | `heArriveS` 7 | 开始顶枪劈砍 |
| 岔口一枪 | `longShotRetryS` 4、`longShotForceS` 8（+0.5 强制） | 何有田补枪 / 罗班长补枪 / 强制击倒 |
| Check、踢枪 | `checkS` 9、`kickRifleS` 3 | 踢枪 / 还权（缺人也放行） |
| 幺娃赶到、守军跑来 | `collectionMeetS` 8、`guardArriveS` 10 | 开 CollectionMeet / 进 SupportOrder |

没有语音句柄的场景（没装声库，或者不是逐句格式）只起一次，之后按超时推进，不会每帧重新起。

## 4. 镜头与第一人称

- K1 醒来低视角、K2 越过翻译肩膀看罗班长，见契约 §7.4。`look.*` 是手成为画面主体时的低头量。
- 何有田顶枪劈砍（`DuelShot`）：从 `heChopAt` 到砍中后 `duelHoldS`，镜头对准两人头部的中点，眼位向远离日兵甲的一侧横移 `duelAsideM`（日兵甲转身背对顺子，会挡住何有田），砍中之后眼位才落回泥里。日兵甲蹲在顺子东侧偏北 115°（`ijaAHoldBearingDeg`）。按原来的 70°，何有田的站位会落在南沟壁坡上、嵌进沟壁里。何有田跟着罗班长的进度走：落后超过 `heTrailM` 就加快。
- Boots：先是日兵甲、乙两双军靴围过来，翻译过 `bootsInterpreterS` 才走进来。
- LongShot：眼位从门柱南沿探出，越过塌土看岔口；Check 坐回门柱后，离罗班长的脸拉开一点。
- 玩家可在列出的 phase 里小幅转头（±0.14 rad），其余 phase 平滑收回。耳鸣、重影、失衡由一条连续曲线驱动，还权后 16 s 内衰减完。

## 5. 02 撤离与接上 03

- 拾枪（`rifleRecovered`）时生成 `bunkerPursuit`（据守 1 + 跟进 3）。跟进组的 `delayS` 乘 `pursuit.delayScale`（0.35），好让玩家在后折角回头时看见追兵已经进了刚离开的那段沟。追兵都不越过弯角 M。
- 罗班长先出洞口，越过塌低段，到第一道完整土壁回身掩护；何有田、刘文财交替后撤。过折角后罗班长走在玩家前面约 6 m。
- `collectionPointSeen` 时，追兵和活着的日兵丙经岔口 J 走 `FRONT_SPACE.pursuitFallback`，走到末点、并且不在玩家视野里才收走（最多 `pursuit.retireMaxS`）。
- 集结处：幺娃赶到后播 CollectionMeet；守军从支沟跑到 SJ，扶墙喘气，然后面向罗班长和玩家之间报告（SupportOrder）。
- 泥地抓痕与拖痕走 `BuildSink` 合成一块网格，离开 01–06（进入 07 之后）移除。

## 6. 验收

- 纯 node：`Script_OpeningStoryboardsTest`（含「导演类没有重名方法」）、`Script_OpeningFirstPersonTest`、`Script_MissionGatesTest`、`Script_FirstLevelVoiceTest`（含 `--audio`）。
- 浏览器：`Script_FirstLevelMissionBrowserTest.mjs --campaign --stage-to=2`，从 01 正常输入连续跑到集结处交接。Front 包合入前 03 的驾驶器在基线上就是红的，合入后恢复 `--stage-to=3`。还有 `Script_OpeningHandbackBrowserTest.mjs`（miss / hide / early / absent 四种非理想顺序）和 `Script_OpeningActorPerformanceBrowserTest.mjs`。
- 驾驶器（`Script_FirstLevelCampaignOpening.mjs`）检查以下各项：
  - phase 按序发生；
  - 甲乙死于刀的接触帧，丁被刘文财击中；
  - 前沿各组 02 就在场、离得远，进 03 时仍是同一批实体；
  - 零瞬移，镜头、手掌、拖拽方手掌都连续；
  - 说话人有表演、口型对（含集结处守军）；
  - 回头能看见至少 2 名追兵；
  - 集结处交接完成。
