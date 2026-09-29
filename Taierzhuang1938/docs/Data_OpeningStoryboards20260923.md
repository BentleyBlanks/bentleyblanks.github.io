# 第一关 01–02 导演（2026-09-23 新稿）

> **2026-09-27 改稿**：Slash 以后的 01 与整个 02 以 [压在塌木下原地审问、反冲锋白刃战](Data_OpeningPinnedRescue20260927.md) 为准（phase 表、眼位、审问、耳光、反冲锋、拖出、还权前的站位都在那里）；下文涉及 Wipe…Boots、KickShunzi…LongShot、救援圈、SB03 独立机位、SB03A–SB05A 的内容只作历史。

2026-09-29：传令兵老远就喊话、在洞口外（不进屋）向班长报告，见 [§4b](#4b-2026-09-29-传令兵远喊--洞口外报告)；Orders 变长约 9 s，SB01 传令兵站位与判据随之改了。

当前四项现场修订（缓慢渐显、翻译绕行、国军旗被踹倒、独立过场机位）见 [过场修订](Data_OpeningCinematic20260926.md)，覆盖下文 SB03 的旧第一人称机位与旧人物站位。

2026-09-26 的首次爆炸、坐姿手部、愤怒配音与拖出近景细化见 [本轮记录](Data_OpeningPolish20260926.md)。

2026-09-27：Found 日兵甲翻越塌顶木进坑、DragOut 翻出后从木头底下攥腕倒拖（取代下文 DragOut 的 `CollarDrag` 往前走），见 [翻越与倒拖](Data_OpeningVaultHaul20260927.md)。

受审川军近爆后的倒地落点（贴坡、不再压进北壁木墙）与震晕循环 `BlastDazedStir` 见 [2026-09-27 记录](Data_OpeningComradeStunned20260927.md)；拖出后半到尸体的跪姿（R3 南移 0.12 m、跪在坡上背靠板墙、跪着死去、日兵甲擦刀改到左肩）见 [跪姿贴坡](Data_OpeningComradeKneelBank20260927.md)。

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
- 2026-09-29：`beats` / `events` 在 Orders 里多记一拍 `RunnerCall`（传令兵远喊第 1 句开口那一刻；**不是 phase**，`phases` 表和驾驶器的 phase 顺序核对不变；跳过 Orders 的起点也补记），同一刻记事实 `runnerCallHeard`，见 §4b。
- 成对动作按动作库 manifest 的 `stages` 相对站位摆位。接触时刻、事件时刻与 clip 时长都从 manifest 读（`ContactAt` / `EventAt` / `ClipLength`），Anim 包重烘后不用改导演。
- 演员沿数据里的沟内折线走，转身限速。导演移动不走物理，所以不会被卡住。
- 剔除：AI 在一帧里先按玩家自己的视角剔除人物（`Script_Main` 里 `ai.Update` 在任务的 `ApplyCamera` 之前），被剔掉的人整棵子树摘出场景、动画层不跑。导演镜头朝向和玩家视角不同，以前镜头正中的人会被摘掉（K2 时罗班长整个看不见）。现在导演在 `ApplyCamera` 之后按实际镜头再剔一次；导演正在摆姿势的人在镜头外也照样更新动画（根节点可见但不在场景里，什么都不画，跟 AI 对车厢乘客的做法一样）；其余被剔掉的人打上 `openingNotShown` 标记，下次回到画面时动画层不从旧姿态混合，也不按旧位置重新定根。
- 被剔掉的人骨骼不更新，所以视线、说话位置和镜头目标在这时改用身体位置（`culledHeadM`）；班组的脚本枪声从头部发出，但不低于脚下 `shotRiseM`（蹲在塌土后面的人要站起来开枪）。
- 重新定根时的混合起点：动作层记住的是骨架顶骨（GroundRoot）在世界空间里「被显示时」的位置，由导演在每帧做完所有摆位、AI 转身和最后一次剔除之后调用 `rig.openingRememberShown` 记下（没有导演的帧退回动画层自己更新完时记）。以前记的是动画层运行那一刻的父节点矩阵，而那时根节点还带着 AI 的朝向，导演随后又摆过一次，于是换动作那一帧骨盆会跳 0.15–0.8 m。
- `Put` 判断「重新定根」时，比较的是导演自己上一帧摆的位置和朝向，不是 AI 当前的朝向。装睡的 AI 会在两帧之间把人转向它最后听到动静的方向；以前按 AI 朝向判断，日兵甲在 02 每帧都被判成重新定根，姿态混合每帧重来，骨架顶骨的偏移越积越多，人沉到地下 10 m。动作层每帧开头把顶骨复位到静止姿态。

## 2. 还权（契约 §2 第 1 条）

- 日兵甲、乙必须在刀的接触帧被真实砍死。打不死就在 `contactKillS` 内补成致命伤。
- 岔口的日兵丁必须被真实击倒：刘文财到位后开枪，有视线才打中；打偏则何有田拿到步枪后补枪，再打偏由罗班长在 `longShotForceS` 补枪；超过 `longShotForceS + 0.5 s` 仍活着就强制击倒，记 `junctionShot{by:"forced"}`。
- 折角的日兵丙和追兵活着也可以还权。
- 先头兵不在敌人表里（生成失败、调试删除）时：岔口记 `junctionShot{by:"absent"}`；踢枪超过 `kickRifleS` 仍放行，缺席者写进 `playerDraggedFromWreck.missing`。
- 还权位（2026-09-25 分镜还原，契约 §2 第 9 条）是洞口塌土东面沟底的 `shunzi.cover` (2.40, −125.20)，背靠塌土、朝东看前沟（yaw −94°）。J 看得见（那里的日兵此时已被刘文财击倒），F 也看得见，这是已知暴露：从这个坐位看 J 在 −93.0°、F 在 −88.5°，只差 4.5°；2026-09-25 按 0.1 m 网格试了 x 1.6–4.6、z −126.2～−123.6 共 837 个坐位（比契约允许的 ±0.6 m 更大，眼高 0.72 和 1.0），没有一个能遮住 F 又看得见 J，所以塌土改形遮不了 F（契约 §4.5 那句要集成负责人改）。保护靠还权迟疑：还权那一刻 `handbackHoldFireM` 40 m 内活着的日军一律迟疑 `handbackHoldFireS` 3.5 s（不开枪、不移动）；战役驾驶器断言这些人每个都至少还剩 3 s 迟疑（`HANDBACK_HOLDFIRE` 一行），空间 K2b 把 F 记成「看得见」。追兵 `bunkerPursuit` 在拾枪（`rifleRecovered`）时才生成，开火前玩家早已能行动。战役驾驶器断言：还权后 3 s 内玩家不掉血、还权时追兵不在敌人表里（`HANDBACK_SAFE` 一行）。旧还权位（门柱后 (0.45,−124.35)）与空间文档的 `bunkerRear` 都不再用于还权。

## 3. 超时（`Data_OpeningStoryboards.timeouts`，单位秒）

每个等待点都有超时，超时的做法是强制完成那个动作，不跳过它。

| 等待 | 超时 | 超时后 |
|---|---|---|
| Banter 场景结束 | 场景时长 + `banterExtraS` 8 | 进 Orders |
| 传令兵到位 / 出洞 | `runnerArriveS` 16（2026-09-29 由 9 改，从 Orders 开始算，含远喊那一路）/ `ordersExitS` 9 | 开对白 / 进 Incoming |
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

- 2026-09-26 低头身体修复：第一人称保留连续的军服、腰胯、双腿与鞋，只裁头颈；手臂与身体使用同一骨架，不再按“腿部权重必须为 100%”删面。坐姿髋部与脚位共同移到眼位下方，骨盆朝向保留数据中的后倾，持弹夹的手跟随身体朝向，避免低头把手拉进衣服。回归覆盖混合权重膝面、纯骨盆面、上身保留，以及 −15° 至 −80° 低头时身体/手掌的稳定性。

- K1 醒来低视角、K2 越过翻译肩膀看罗班长，见契约 §7.4。`look.*` 是手成为画面主体时的低头量。
- 何有田顶枪劈砍（`DuelShot`）：从 `heChopAt` 到砍中后 `duelHoldS`，镜头对准两人头部的中点，眼位向远离日兵甲的一侧横移 `duelAsideM`（日兵甲转身背对顺子，会挡住何有田），砍中之后眼位才落回泥里。日兵甲蹲在顺子东侧偏北 115°（`ijaAHoldBearingDeg`）。按原来的 70°，何有田的站位会落在南沟壁坡上、嵌进沟壁里。何有田跟着罗班长的进度走：落后超过 `heTrailM` 就加快。
- Boots：先是日兵甲、乙两双军靴围过来，翻译过 `bootsInterpreterS` 才走进来。
- LongShot：眼位从门柱南沿探出，越过塌土看岔口；Check 坐回门柱后，离罗班长的脸拉开一点。
- 导演接管镜头期间清空 HUD 的来弹方位弧（它按玩家自己的朝向画，过场里指向不对，也没法反应）：09-24 评审看到的「天空里的白色弧形」就是近失弹的白色方位弧。
- 踢到手边的汉阳造枪口朝西落在洞里，避开南门柱与洞口塌土；刘文财第二跳在后折角拐角后面，不挡玩家回头看连接支沟的视线。
- 玩家可在列出的 phase 里小幅转头（±0.14 rad），其余 phase 平滑收回。耳鸣、重影、失衡由一条连续曲线驱动，还权后 16 s 内衰减完。

## 4a. 2026-09-25 分镜还原（契约 [Data_FirstLevelStoryboard0103Contract.md](Data_FirstLevelStoryboard0103Contract.md)）

- 抓帧与画面判据：`node Taierzhuang1938/Script_OpeningStoryboardShots.mjs [--shots=SB01,SB02] [--side-by-side=<分镜目录>]`（TestRunner 的 `OpeningStoryboardShotsTest`）。从 01 开场按真实流程推进，在 `Data_OpeningStoryboards.storyboardShots` 每镜的时刻截导演实际画面、写当帧 json，并判由站位与镜头决定的那部分画面判据（人物头部屏幕 x、距离、俯仰 / 横滚 / 眼高、地标屏幕 x、谁不许在画内）；`--side-by-side` 拼「分镜 | 实机」（分镜图不进仓库）。产物在 `_shots/OpeningStoryboards/`。
- 顺子的位置分三段（`shunzi.*`）：Banter / Orders 坐在洞底 `seat` (−1.95,−126.25)，眼高 0.95，SB01 机位 yaw −93°、pitch −15°（`banter.seatShot`，Banter 里朝说话人转头不超过 0.14 rad）；罗班长下令（`flags.exitAt`）以后到 Incoming 结束，顺子**收拾装备后跑向洞口**（2026-09-29 用户：「主角收拾装备增加一个转身背起自己的背包拿起枪然后匆匆往门口赶，不然现在的设定走的太慢了」；口径与数字见 [下令之后：收拾装备](Data_OpeningFirstPersonGear20260929.md)，数据在 `Data_OpeningFirstPersonGear`，`firstPerson.followUp` 已删）：起身、把桥夹压进弹仓推上枪栓（原来的装弹，压到 1 s 内）、枪挂到左肩、向右转 159° 蹲到西墙脚的背包旁、双手各抓一条肩带提起来甩过右肩背上、枪从肩上拉回手里、转回洞口、以 1.9 m/s 跑 2.5 m 到 `followTo` (0.35,−125.75)（原来是 0.24 m/s 走到 (−0.45,−126.02)，1.5 m 走 6 s 多），5.8 s 到位，近爆之前站定；回归口 `Script_OpeningFirstPersonTest` 查两只手抓着东西时的每一帧都在东西上（误差 < 5 mm）。Blast 被掀倒（`banter.blastShot`：0.22 s 炮弹落地，0.22–0.65 s 眼高降到 0.75、转到 yaw −66°、pitch −6°（契约 −14±8；−14 时过梁在画外、北门柱上半截悬在洞外沟壁前，抬到 −6 后门柱整根和过梁框住右边的洞口）、头向左倒 17°，0.95 s 闭眼，1.0 s 进 Black）；从 Black 起压在洞口 `trap` (0.1,−125.45)。MISSION_PLACEMENT.bunker.player 仍是掩蔽部锚点，不再是受困位。
- SB02 做镜像（契约 §2 第 2 条）：爆点与塌方在洞口南侧（世界不动），画面左侧是北门柱与洞里北壁，右侧是洞口。
- SB01 站位：幺娃靠北壁、侧身；传令兵（2026-09-29 起，见 §4b）从后交通壕沿 `runnerRoute` 跑到洞口外沟底 (3.05,−124.5)、面朝罗班长报告（以前是贴北壁进洞、停在北门柱内侧）；罗班长在洞口跪着朝东（`LuoKneelCheck` 停在跪姿段；以前站着的原因：Banter/Orders 里 `ResolveOpeningActorPose` 会把静止的罗班长换成 `MessengerReport`/`PointBlockade` 站姿，只有 ContactClips 里的 clip 不换，而导演的 Move 给原生层的 kneel 恒为 0——原生跪姿要 Anim 包加钩子，见 pendingWiring），自己那句台词（BunkerOrders.02）时起身回头指路；负伤川军脸转向洞里（yaw +30°）；纵深三名往前沿去的川军（`Data_FirstLevelBackdropSquads.OPENING_DEPTH_WALKERS`）Banter 时站在东沟、Orders 后沿东沟走进连接支沟，走到末点又不在镜头里就收走，最迟 Black 收走。
- 任务汉阳造：装填段手里拿的那支（supply）显示时它藏着；Blast 期间也藏着，从 Black 起才出现在洞口泥里（`rescue.rifleMouth`，枪口朝东南）。松动的断木从 Black 起压在背包上（不在睁眼时凭空出现）。
- 洞外（SB03–SB04A）：
  - 趴着的眼位（契约 §2 第 1 条）：Black→Found 眼在 `shunzi.witnessEye` (0.35,−125.15)、离地 `lieEyeM` 0.26，比压住的身体（`trap`）靠前一点；Reach 开始 1 s 内沉到 `reachEye` (0.25,−125.25)、0.18。
  - SB03（CaptiveDragged→Wipe，`interrogation.witnessShot`）：yaw −80°、pitch +5°、roll +4°。审问组在左中：翻译改到组东侧 `interrogation.interpreterAt` (4.75,−124.85) 侧身对川军，日兵乙在他身后 `ijaBAt` (5.0,−124.86)，不再蹲在镜头和川军之间。
  - Taunt 里远处那声喊（CaptiveTaunt.04）之后日兵乙原地转向前沟；Wipe 开始 `backOffAfterS`（2.5 s）后翻译、再过 0.8 s 日兵乙沿 `backOffRoute` 退进南南西沟（从 SB03 画面右边出画），停在 `backOff` 两点等着（契约 §2 第 7 条）。
  - SB03A（Reach 3 s 前后，`ija.reachShot`）：yaw −82°、pitch +4°、roll +3°，伸手时视线往下压 12°，压梁一响（Reach 2.0 s，`beamShift`）抬回来。日兵甲擦完刺刀后走到 `ija.lookBack` (4.9,−124.45) 背对洞口；压梁一响他停步回身（现用 `GuardTurn`，身体转到离镜头方向差 45°，头部 lookAt 顺子），看完才走 `foundRoute` 回来。伸手换成左手（分镜是左手）。
  - 纵深背身走远的日军：`Data_FirstLevelBackdropSquads.OPENING_DEPTH_IJA` 两人，Wipe 开始时生成在弯角弹坑台阶上（画外），`afterWipeS` 起逐个下到前沟、沿东沟南侧走向岔口 J 再拐进纵深支沟；走到末点又不在镜头里就收走，最迟 02 的 Hold 收走。剧本兵、不开枪，不进任务名册。
  - SB04（Butt，`ija.buttShot`）：枪托位 `shunzi.butt` (2.3,−124.4)（洞口塌土东边的沟边）。`dragOutRoute` 改成从洞口塌土北边出去再朝东南，拖完顺子正好在枪托位。日兵甲从顺子头的东边快步（brisk）绕到正北（`ija.butt.yawDeg` 0），镜头眼高 0.35、yaw −18°、仰 22°（契约约 30±8；仰 30 时北壁沿在画面正中、半幅是天，分镜要天空 ≤ 40%）、roll −4°：背景是北壁木框门（Set 的 `trenchFacadeN`，x 2.7–3.9）和门右边的死川军。2026-09-26 起接上 `IjaButtStrikeCollar`（蹲在他身上、左拳揪领口、单手把枪托举过头，顶点循环 0.55–1.05 s 就是「停在最高点」，`letGoS` 放开）：枪托在 `strikeS` 1.375 s 落下，`bootsAfterS` 0.3 s 后进 Boots；砸中后眼睛黑一下（`ija.knockOut`：0.07 s 闭上、0.72 s 起 0.3 s 睁开），枪收回去那段不给看。
  - SB04A（Boots，`ija.dragAway`）：2026-09-26 起接上 `IjaDragByForearm`（抓前臂倒退十步，根运动 2.0 m）。旧路线从枪托位绕回洞口再往南，顺子的眼睛和日兵甲从塌顶木的南支撑（x 0.6–1.05、z −124.82…−124.42）里穿过、从木头底下钻过去（实拍一整屏黑木头）；现在沿塌土南边、`BunkerMouthSpoil` 北边那条 0.75 m 的过道往西（`dragAway.route`），（2026-09-27 起穿过沟口继续往南拖到新救援圈 `shunzi.dragged`，4.1 m，clip 以 `dragAway.rate` 0.7 倍播放）。眼睛按 clip 自己的拖行进度（它的 player head 轨）沿路线走，日兵甲在 clip 的手长（`holdM` 0.93 m）处朝着 `dragAway.face` 同一比例的点、面朝顺子，根由 clip 的 head 点反解，最后在他南边的沟里。拖之前（`swingS` 0.42 s，眼睛还闭着）根绕眼睛从北边转到拖的一侧；拖完根挪回骨盆下面（`RerootUnderPelvis`）再走到 02 的位置。镜头（`ija.dragShot`）眼高取 clip 的 head 轨（约 0.32）、roll −8°，看日兵甲的脸，仰角限在 8–26°。洞口南门柱不再在画面左边（路线不再从门柱边下来），SB04A 判据去掉了这一条。翻译与日兵乙从 Boots 0.8 s 起从南南西沟深处跑回来（`hurryMps` 2.0，翻译现用 `InterpreterPoint` 叠在跑步上）；翻译直接上到日兵甲右肩后面的蹲位（`rescue.interpreterReturn`，2026-09-27）。顺子右手抓着拖他的那条胳膊（`beats.Boots` 的 `gripSleeve`）。拖完再用 `closeS` 0.5 s 拍「几双军靴围过来」，然后进 02。
  - 被拖那几拍（2026-09-26 审查「太拖节奏、穿模、扭曲」）：Drag / Snag / KickBeam 眼睛在领口，日兵甲蹲在他头上，原来镜头直接看他的脸，仰到 67–77°，脸倒过来、上衣领子穿进下巴；现在朝他看、仰角限在 `ija.snagShot` 24–30°（拳头在领口、他的膝盖和胸口，脸在上沿），Found 也限到 30°。`IjaCollarDragSnag` 重做（蹲得更低、上身不再整个折下来、抬头看前面，2.2 s → 1.75 s），`IjaKickBeam` 1.2 s → 1.0 s。DragOut 眼睛沿日兵甲走的路线跟在他身后（原来挂在他朝向的后面，起步转身时眼睛绕着他甩了 180°），`speed.dragOut` 1.7；Found 回洞口用 `pace.foundSpeed` 2.3，清木头、甩枪按 `pace` 的倍率快放，「还藏着一个」从清木头时就开口、提前 `foundLeadS` 甩枪。02 罗班长拖进遮挡同样改成沿路线跟随（原来盯一个固定点，从它旁边经过时仰到 40°、转到身后时侧翻），`speed.drag` 1.55，罗跑步过来抓领口。Found 到 02 从约 21 s 缩到约 17 s。
  - 罗班长拖进遮挡的镜头（2026-09-27 用户反馈「翻译审问后被班长拖出救出，镜头 360 度大错误旋转」）：09-26 版抓领后回看来路（背对罗），加上抓领前看罗跑过来、路线拐北、再接 LongShot 看岔口，4 s 内镜头转了一整圈（累计 582°，净 347°）。现在 `rescue.dragShot`：眼高 0.55，镜头始终朝前沟岔口（Flee 结束和 LongShot 看的都是这个方向，岔口日兵「回身举枪」也发生在这段里）；抓领前看罗跑过来，但偏离岔口方向最多 `asideDeg` 35°、俯仰 −10°～24°；抓领 0.4 s 后 0.6 s 内回到岔口方向，拖动时罗的腿在前景（同 01 DragOut 看日兵甲的腿）。实测 DragCover 累计 110°、净 −10°，LongShot 0.5°。`Script_FirstLevelCampaignOpening` 断言 DragCover+LongShot 累计 < 200°、净 < 60°（`HEADING` 行打印每拍的累计/净转量）。
  - 01 被日兵甲拖那几拍的镜头（2026-09-27 同一轮，用户「一起改了」）。在 master 翻越重做（`Data_OpeningVaultHaul20260927.md`）之上实测，Found→Boots 有三处毛病，按原因改：
    - DragOut 转反方向：日兵甲从眼睛北边起身、绕东边翻出去，镜头本该右转约 160°，实际左转了 220°，接着 Butt、Boots 又往同一个方向转，累计超过一圈。原因是每拍开头 `cameraBlendS` 的过渡从这一拍的起始朝向用 slerp 走最短弧，目标一越过起始朝向背后 180°，最短弧就换了边。现在 `BlendFromPhaseStart` 把目标的偏航逐帧展开，过渡沿镜头实际转过的路径走。这条对所有拍的开头都生效。
    - 看头顶上的日兵甲时来回甩：他蹲在躺着的眼睛上方，头离眼睛水平只有几厘米，头挪一点方位角就甩 30–60°（Found 落地、Drag、Snag、KickBeam），起身翻出时头从眼睛上方 3 cm 掠过，两帧翻了 150°。现在 `LookAtBody`：俯仰仍按头算（上限不变），方位按骨盆算，头进入画面高度（仰角 60° 以下、20° 内渐入）才按 `bodyLook.headWeight` 0.5 参与。骨盆离眼睛始终 ≥ 0.3 m，转得平滑。`VaultLook` 看头那一半和 Drag/Snag/KickBeam 都改用它。
    - Boots 黑屏遮不住转身：击晕黑屏本来就是为了让日兵甲「趁黑转到拖的一侧」，但镜头有 `cameraTurnRps` 转速上限，睁眼时还剩 60° 在甩。现在导演上一帧显示的闭眼程度 ≥ `cameraShutSnap` 0.95 时，镜头直接摆到位，不过渡、不限速。注意 `r.opening.eyeClosure` 在导演摆镜头之前会被开场模块自己的曲线覆盖，所以用导演自己记的 `shownEyeClosure`。
    - 实测（不计闭眼帧）：DragOut 累计 226°、净 −38°（改前 322°/+212°），KickBeam 8°（改前 35°），Boots 101°/净 50°（改前 141°/102°）；任意 4 s 同向最大净转 161°（改前 DragCover 443°、DragOut 232°）。18 张分镜全过。`Script_FirstLevelCampaignOpening` 新增断言：任意 4 s（`HEADING_WINDOW_S`）内同向净转 < 200°（`HEADING_WINDOW_MAX_DEG`），`HEADING_WINDOW` 行打印最大值和所在的拍。
  - 枪托血层（`strikeBlood`）：满 0.2 s，1.1 s 内淡到 0.3（SB04A「血层约 0.3」），再 8 s 淡完。（2026-09-30 已删：后来只剩耳光在用，耳光改成纯眩晕，见 Data_OpeningPinnedRescue20260927.md。）
- 02（SB05、SB05A、SB06，契约 §2 第 6、8、9 条）：
  - 救援圈（2026-09-27 起）在南南西沟北口往南 2.3 米、弃土 `BunkerMouthSpoil` 南面以外的 `shunzi.dragged` (−0.3,−121.5)，顺子朝沟里看（`rescue.circleShot`：眼高 0.75、yaw 174、pitch +3）；日兵甲按 `ijaAHoldBearingDeg` 2° 蹲在前面揪领（`IjaHoldCollarUp` 的顺子头部轨迹解到眼位上，眼跟着他拉，根再往外退 `ijaAStandoffM` 0.3 m），翻译蹲在日兵甲右肩后面 `rescue.interpreter` (0.18,−119.9)，日兵乙看守 `ijaBGuard` (−1.8,−118.1)、踢完退到劈砍位 `ijaBWatch` (−1.35,−118.9)。原来的沟北口位置、改动理由与各项站位见[过场修订](Data_OpeningCinematic20260926.md)「02 审问穿模修正」。
  - 罗班长、何有田、刘文财先在 RC 西侧后交通壕里等（x ≤ −8，画外），审问开始（`askAt` + `goAfterAskS` 1.5 s；最迟 `holdLineS`）才出发（`RescueGo`），贴西壁（画面右）摸进来：罗走 `luoRoute`、何晚 `heLagS` 1.4 s 走 `heRoute` 停在罗右后 `heWait` (−0.7,−119.9)，刘晚 `liuLagS` 3.2 s 去射击台阶 `liuShot`。RC 口的背景川军挪到 (−8.4,−112)（`Data_FirstLevelBackdropSquads` 的 `NRA_POST`），幺娃 Hold→Released 钉在 `banter.hide.yaowa`，都不进这条视线。
  - SB05A：罗落刀后 `chopDropS` 0.3 s 内眼高降到 `chopEyeM` 0.62、向西让开 `chopAsideM` 0.25、转到 yaw 185，罗劈乙出现在日兵甲右边；日兵甲头转向罗（替身，pending `IjaStartleTurn`）；何从 `heWait` 跑到甲背后格挡再劈；乙的枪在落刀后 `ijaBRifleDropS` 落到 `ijaBRifleDrop` (0.2,−122.55)（契约 0.55；眼已向西让开、转到 185，0.55 会落在画面中线左边，0.2 在中偏右下、约 1.3 m；抓帧 SB05A_Rifle 判它），Parry 里就落（劈砍构图还在）；拿不到武器时记 `guardRifleMissing`，抓帧判失败。劈砍画面定住 `duelHoldS` 0.45 s 后，眼抬到 `fleeEye` 跟拍翻译背影：他转到 `interpreterFleeYawDeg` 100° 做 `InterpreterFlee`，再沿 `interpreterFlee` 往东沟逃（Flee 总长 `fleeFollowS` 2.3 s）。
  - SB06：罗倒拖顺子走 `dragCoverRoute` 出沟口、穿过洞口两门柱、到塌土东面的还权位 `shunzi.cover`；镜头 `rescue.checkShot`（眼高 0.72、yaw −94、pitch −8，踢枪时压到 −13 并保持到还权）。罗跪在左前 `luoCheck` (3.12,−125.73)（替身 `LuoKneelCheck`，pending `LuoKneelReach`）；踢枪时退到顺子身后洞口泥里 `kickFrom` (0.88,−126.15)，把 01 就躺在那里的汉阳造（`rifleMouth`）经 `rifleKickVia` 踢过顺子右侧，停在 `rifleKicked` (3.2,−124.85)。与契约表的差别：契约写的踢枪起点 (3.9,−125.6) 在枪的东边，而枪从 01 起就在洞口西边的泥里，照那个点踢不到，所以改从枪后面踢。刘远射后翻过弹坑台阶到 `liuCover` (5.47,−123.52) 朝东；何换枪后到 `heCover` (3.6,−124.3)（契约表写 (3.23,−124.07)，这里往东约 0.4 m；实测 SB06 何在画面右边缘 x 0.86、1.5 m，判据成立）；两人导演期间站着（pending 跪姿钩子），还权后 AI 跪姿。Released 那一帧俯仰约 −13°（战役驾驶器断言 −15°～+5°）。
  - 抓帧工具另判「头不在更近的人后面」（`coveredBy`，人物是蒙皮网格、射线穿过，所以只画人物到头部那一个像素判谁挡着）；第一波允许的遮挡写 `coverOk`：SB04A 翻译和日兵乙可能被近处的日兵甲挡住（仍挂在 SB04A 其余 pendingWiring 条目下）（SB05 的遮挡已靠 `ijaAStandoffM` 和 `ijaBWatch` 解决）。`BunkerSouthRevetment` 一处放行统一走 `wave1Allowances.revetment`（SB04A behindOk、空间 K2 ignore、测试的视线和拖行净空），第二波把它设成 null 一处删完。`wave` 设成 2 时 `Script_OpeningStoryboardsTest` 要求 pendingWiring 为空、不再有任何放行项。
  - SB06 另判 J 处被击倒的日兵躺在地上（骨盆 ≤ 0.3 m）：导演开枪或 `Kill` 时先撤掉他身上的站姿（`FallNatively`），以前 `IjaBayonetGuard` 一直留在尸体上，他死了还站着。
- 第一波替身（`pendingWiring`）：别的包的新 clip、手势、腿、镜头后处理、布景、定向喷土还没接，导演先用最接近的现有 clip / 效果，逐条登记 `{shot, what, now, wave2}`，第二波接线后清空。

## 4b. 2026-09-29 传令兵远喊 + 洞口外报告

用户原话：「现在开局动画这里，传令兵应该是老远就喊话（玩家就能听到），然后在地道门外就和班长可以说话了，而不是一定要走到屋里才说话」。

**以前**：Orders 一开始传令兵才露面，沿南南西沟跑进洞里、停在北门柱内侧（约 4.4 s），到位才开 `BunkerOrders.01`；玩家要等他进屋才听见他。

**现在**：Orders 从 Banter 最后一句结束起算，传令兵一开始就在后交通壕里跑，边跑边喊，跑到洞口外沟底、罗班长身边停下报告，不再进洞。

| 时刻（Orders 起算） | 发生什么 |
|---|---|
| 0 s | Banter 最后一句刚结束。传令兵在 (−19,−110.7)（后交通壕，离顺子 23.1 m，洞的南墙和土挡着，画面里看不见）显示、起跑，跑速 `speed.run` 3.2 m/s |
| `runnerCall.afterS` 0.5 s | 第 1 句远喊 `BunkerRunnerCall.01`「班长——！罗班长——！」（3.0 s）。**此刻记事实 `runnerCallHeard`**、`beats` / `events` 记 `RunnerCall`（`flags.runnerCallAt`） |
| 他离顺子 ≤ `runnerCall.secondWithinM` 12.5 m（过后交通壕折角 RC 一带） | 第 2 句 `BunkerRunnerCall.02`「罗班长！罗班长！」（3.2 s，导演表 `after:"gate"`、`offsetS:0`，一开门就喊）；同时前沿方向那三名往前沿去的川军出发（`flags.walkersAt`，原来钉在 Orders 开始 + 1.4 s） |
| 约 9.3 s | 跑完 29.7 m，停在 `runnerRoute` 末点 (3.05,−124.5)：洞口外沟底，罗班长 (1.75,−125.7) 东南 1.77 m，面朝罗班长（`MessengerReport`）。从坐位透过洞口从右边进画，站在罗班长右手边 |
| 到位且远喊说完 | 开 `BunkerOrders.01`（远喊没说完最多再等 `runnerCall.holdMaxS` 1.5 s，之后掐掉第 2 句）。往后的 02–05、下令、撤出都和原来一样 |

- **听得见**：两句都挂在传令兵跑动中的头骨上（`spatial:"head"`，被 AI 剔掉时用身体位置 + `culledHeadM`），走引擎的距离衰减、HRTF / 声像、壕壁遮挡；方位是他在顺子右后方。听者相机就是顺子的头（坐位 (−1.95,−126.25)，眼高 0.97 m，实测偏差 0）。
- **远喊补偿 `gainDb`**（导演表新字段，`Script_DialoguePlayer.StartVoice` 乘在音量上，缺省 0）：不补时第 1 句（22→15 m）比 `BunkerOrders.01`（5.3 m）低 15.6 dB（RMS）/ 17.4 dB（峰值），超过「不比报告低 12 dB」；补第 1 句 +9 dB、第 2 句 +3 dB。
- **逐句取证**（无头浏览器实时跑、真解码真混音，每句在 `storyWorldGain` 之后测，即衰减、遮挡、声像之后的直达声，`tmp/ProbeRunnerCall.mjs`）：

| 句 | 距离 | 峰值 dBFS | 有声段 RMS dBFS | 比 `BunkerOrders.01` |
|---|---|---|---|---|
| `BunkerRunnerCall.01`（+9 dB） | 22.5 → 15.4 m | −22.0 | −34.6 | 峰值 −8.5 dB / RMS −7.5 dB |
| `BunkerRunnerCall.02`（+3 dB） | 12.4 → 6.8 m | −17.3 | −31.1 | −3.8 / −4.0 dB |
| `BunkerOrders.01` | 5.3 m | −13.5 | −27.1 | — |
| 同一洞里的 `BunkerBanter.14` | 3.2 m | −6.2 | −22.8 | （参照） |

  上表是最后一次实时跑；四次跑（其中一次没补 `gainDb`）之间同一句差 ±1 dB，第 1 句比报告低的量在峰值 8.5–10.0 dB、RMS 7.5–8.4 dB 之间。

  整个混音（最终输出总线）：远喊两句之间的间隙里只有前线背景那一路（`Trapped` 档，隔着土，450 Hz 低通），1–4 kHz 语音频段的中位功率 −61.1 dB，第 1 句期间 −45.0 dB，高出约 16 dB（100–450 Hz 段背景 −43.1 dB，对白侧链把它压到 −51.4 dB）；总 RMS 中位 −33.6 → −31.5 dBFS。也就是说远喊压在背景的上面而不是埋在里面。
- **节奏**（无头浏览器实时跑四次）：Banter 场景结束 → 远喊开口 **0.53–0.56 s**；远喊场景结束 → 报告开口 1.0–1.1 s（他在最后一个弯里跑进画面）；Orders 开始 → 报告 9.4–9.7 s（原来约 4.4 s）；Orders 整段 33.9–34.1 s（同样方法量改前的基线：27.0 s，约 +7 s）。`runnerCallHeard` 与远喊第 1 句起播是同一次调用（播放器 `StartLine` 先起声源、再回调 `onLine`，导演在回调里记）：实测记录时的 `r.time` 与起播 `r.time` 相同，音频时钟差 −0.33 ms。
- **配音**（`BunkerRunnerCall`，契约 §5.2 第 15 场，台词表登记为 2026-09-29 用户追加）：runner 定妆音做参考，整场一次请求；第一次生成第 2 句实际念成「罗班长罗班长」（与稿「班长！罗班长！」差一个字，自动硬错误规则漏掉，whisper 加提示词后也是这个结果），基频中位 400 Hz 以上、两句贴在一起；第二次把第 2 句稿改成「罗班长！罗班长！」（本来就是模型顺口念的），提示词加「成年男人洪亮的嗓门，用胸腔喊，不要尖细拔高」、第 2 句前停 1 秒：两句字错率 0、无提示、基频中位 271 / 276 Hz、句间干净（边缘 −44 / −38 dB）、整场 6.6 s。共 2 次 SeedAudio 请求。口型轨 `Data_FirstLevelFaceTracks.json` 新增两条（`Data_FaceTrackPhonemes` 补了「罗 luo」）。
- **跳阶段 / 调试入口**：`NoteRunnerCall` 是记事实的唯一口（幂等）。导演 `Setup` 里凡是过了 Orders 的起点（Trapped 近爆之后的检查点、直接进 02 及之后）、`PhaseIncoming` 第一帧、Banter / Orders 里被直接 `Blast()`，都补记；`BuildFirstLevelCheckpoint` 对第 2 阶段起的调试起点也带上它；`ResetBunker`（检查点重试落在 01）把它和另外三项一起撤掉。它不是 Trapped 的过关条件（Trapped 仍是 `bunkerCollapsed` / `captivesKilled` / `doorSearchStarted`），没有菜单条件文案。
- **出洞**：传令兵从自己的站位出发，走 `banter.runnerExitRoute`（`exitRoute` 去掉第一个点，那个点在罗班长膝下），其余人照旧走 `exitRoute`。
- **SB01 判据**：传令兵 `x` 由 [0.2, 0.5]（北门柱内侧）改为 [0.55, 0.75]，加 `distM` [4.5, 6.2]（实测 0.641、5.30 m），加 `actorSeparation`（罗 / 传令兵头部横向间距 ≥ 0.06、根距 ≥ 1.2 m，实测 0.098 / 1.77 m）；抓帧时刻由 `BunkerOrders.01` 后 1.2 s 改为 2.2 s（三名川军是在传令兵第 2 句时出发，过了约 2 s 才有两个越过罗班长背影露出来）；新增 `SB01_Call`（远喊开口后 0.8 s，传令兵 `absent`，不在画内）。`pendingWiring` 里传令兵那条改成「洞口外、罗班长身边」的说法（`RunnerLeanPostCall` 原来是扶北门柱内侧，第二波要重对）。
- **验收**：`Script_OpeningStoryboardsTest`、`Script_FirstLevelVoiceTest`（含 `--audio`：契约 15 场、`gainDb` 合法与乘法、覆盖录音间隔的句子多了 `BunkerRunnerCall.02`）、`Script_MissionGatesTest`（事实门 146 条，`runnerCallHeard` 是第 146 条）、`Script_FirstLevelMissionTest`（`OrdersRunner` 新路线在每个场景态下净空；此测试在 1199 行「07+ keeps the legacy fixed-source front」是改前就红的基线，干净基线同样红）、`Script_ModuleGraphTest`、`Script_OpeningStoryboardShots.mjs --shots=SB01_Call,SB01`。

- **集成验收（2026-09-29，与顺子收拾装备、战场声显现、环境床候选三包合并后）**：实时跑一趟（真实钩子，不模拟）：Orders 起 0.52 s 记下 `runnerCallHeard`，Banter 渐亮到近爆 70.9 s（改前约 50 s，多出的是传令兵跑来的 9 s 与收拾装备）。战场显现以后，罗班长两句压嗓盘算（`BunkerOrders` .02 / .04，整段母带后片段 RMS 比 .01 / .05 低 16 dB）在听者处 −35.7 / −35.1 dBFS，远声组 250 Hz–4 kHz −42 / −40，逐句平均余量只剩 6.6 / 4.8 dB；导演表给这两句 `gainDb` +7 后是 11.0 / 13.1 dB，整场逐句余量 11–21 dB。第一人称连拍与录音不进仓库。

## 5. 02 撤离与接上 03

- 拾枪（`rifleRecovered`）时生成 `bunkerPursuit`（据守 1 + 跟进 3）。跟进组的 `delayS` 乘 `pursuit.delayScale`（0.35），好让玩家在后折角回头时看见追兵已经进了刚离开的那段沟。追兵都不越过弯角 M。
- 罗班长先出洞口，越过塌低段，到第一道完整土壁回身掩护；何有田、刘文财交替后撤。过折角后罗班长走在玩家前面约 6 m。
- `collectionPointSeen` 时，追兵和活着的日兵丙经岔口 J 走 `FRONT_SPACE.pursuitFallback`，走到末点、并且不在玩家视野里才收走（最多 `pursuit.retireMaxS`）。
- 集结处：幺娃赶到后播 CollectionMeet；守军从支沟跑到 SJ，扶墙喘气，然后面向罗班长和玩家之间报告（SupportOrder）。
- 泥地抓痕与拖痕走 `BuildSink` 合成一块网格，离开 01–06（进入 07 之后）移除。

## 6. 验收

- 纯 node：`Script_OpeningStoryboardsTest`（含「导演类没有重名方法」）、`Script_OpeningFirstPersonTest`、`Script_MissionGatesTest`、`Script_FirstLevelVoiceTest`（含 `--audio`）。
- 浏览器：`Script_FirstLevelMissionBrowserTest.mjs --campaign --stage-to=3`（TestRunner 的 `FirstLevelOpeningCampaignTest`），从 01 正常输入连续跑到集结处交接，再接着打完 03、进入 MachineGun。Front 包合入前登记的是 `--stage-to=2`，2026-09-24 合入后恢复到 3（契约 v1.8）。还有 `Script_OpeningHandbackBrowserTest.mjs`（miss / hide / early / absent 四种非理想顺序）和 `Script_OpeningActorPerformanceBrowserTest.mjs`。
- 驾驶器（`Script_FirstLevelCampaignOpening.mjs`）检查以下各项：
  - phase 按序发生；
  - 甲乙死于刀的接触帧，丁被刘文财击中；
  - 前沿各组 02 就在场、离得远，进 03 时仍是同一批实体；
  - 零瞬移，镜头、手掌、拖拽方手掌都连续；
  - 说话人有表演、口型对（含集结处守军）；02–05 的取样挂在运行时的说话人绑定器上（谁在说＝`voice.Speech(who)`，哪具身体＝`speakers.ActorForWho`），03 罗班长的前沿命令（`Front*` 场景）必须在画面上被采到并有头部动作（`CheckFrontActing`）；
  - 回头能看见至少 2 名追兵；
  - 集结处交接完成。
