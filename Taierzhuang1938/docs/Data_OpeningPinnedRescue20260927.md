# 01–02 压在塌木下原地审问、反冲锋白刃战（2026-09-27 改稿）

用户原话：「开局的过场动画，那个川兵应该离主角再近一点，保持第一人称，不在切换视角；其次是那个割喉的日军动作还需要优化现在看不出来是割喉，然后是说话的台词应该是一割马上就嚣张的说了那些台词；然后边说边走，看到了被木头压住的主角（主角变成压在房梁下，半个身子在外面），日军也不再拖出主角，直接在原地审问，把从枪托改成扇巴掌（被扇的单边的屏幕有眩晕效果）其他暂时不变；在主角被审问了几句之后，附近忽然枪炮声四起，杀喊声四起（全都是四川话）然后班长等一大帮人提着大刀冲上去和现存日军部队白刃战；这里镜头、日军友军、变化所需的动作请你自己 blendermcp 完成并完善，之前做的过场里的动作可以暂时废弃」；补充：「主角从废墟中出来也就自然的改成是班长拖出来的了」。

本文覆盖 [开场导演口径](Data_OpeningStoryboards20260923.md) 里 Slash 以后的 01 与整个 02（BunkerRescue），以及 [过场修订](Data_OpeningCinematic20260926.md) 的独立机位、[翻越与倒拖](Data_OpeningVaultHaul20260927.md)、[02 审问穿模修正](Data_OpeningCinematic20260926.md) 的救援圈。Banter → Interrogation 的流程、配音、03 以后不变。

## 1. phase 表

| 段 | phase |
|---|---|
| Trapped（01） | Banter → Orders → Incoming → Blast → Black → Wake → FrontPass → CaptiveDragged → CaptiveWall → Interrogation → Slash → Taunt → Found |
| BunkerRescue（02） | Hold → Ask → Charge → Melee → Lift → Check → Released（2026-09-29 起 KickRifle 删掉，见 [拖出与递枪](Data_OpeningRescueHandover20260929.md)） |

旧的 Wipe、Reach、Drag、Snag、KickBeam、DragOut、Butt、Boots、KickShunzi、Glimpse、Collar、Chop、Parry、Flee、DragCover、LongShot 下线。事实（`captivesKilled`、`doorSearchStarted`、`rescueCallHeard`、`vanguardMeleeResolved`、`junctionShot`、`luoRescueComplete`、`playerDraggedFromWreck`）名字与门槛不变，只是记在新的拍上；`playerButtStruck` 换成 `playerSlapped`。

## 2. 顺子的位置（全程第一人称）

- 近爆后的黑场里塌顶木（Set `roofTimberDown`）就落定，横在洞口正中、压着他的胯 `shunzi.pinnedHips` (0.95,−125.3)；腿在洞里，胸口和头在洞外的沟底上，眼位 `shunzi.witnessEye` (1.85,−125.25)、离地 0.28 m，朝东看前沟。以前眼在洞里 (0.35,−125.15)，离受审川军 3.8 m；现在 2.3 m。
- 不再有独立机位：`interrogation.cinematic` 删除，CaptiveDragged → Interrogation 都是趴着的第一人称（`interrogation.witnessShot`：yaw −88°、仰 12°）。玩家在 Wake…Ask 可小幅转头。
- 塌顶木两头垫着齐胯高的土堆；门楣断头、断板随木料改了位置（Set 数据里注释）。还权坐位的靠背（`rubbleMoundBack`）要等他被拖出来坐上去（Check 起）才出现，否则会从他胸口底下冒出来（`Script_OpeningSet.RescueShown`）。

## 3. 割喉、嘲弄、发现

- Slash：审问时日兵甲已揪着衣领站在川军左前（`interrogation.ijaAHold`），开割前一步挪到川军**左肩**后面（manifest 站位 slashGrab，离眼远的一侧），揪住后脑头发往后扯、把脸往顺子这边拧 45–55°，喉咙朝着镜头；从左胯反握拔出刺刀，在自己胸前把刀在拳里翻成正握，刀刃压在喉咙右侧、拳头在脖子前面；割中是朝自己右胯的一记拉割：拳头领先，刃口一路贴着脖子绕过喉咙前面，刀身顺着自己的长度滑过去（割中 0.24 s，0.12–0.40 s 刀走 ≥0.25 m；2026-09-29 改，见第 6 节），血朝顺子这一侧喷（动脉喷射 + 割中一团血雾）。川军割中后右手捂住喉咙，左手仍抠着揪头发的那只手，被松开后左手才落到喉咙上。镜头跟着川军的头（`interrogation.slashShot`，最多偏离主视线 18°），并从揪发起把视野收窄到 0.7（`interrogation.fixate`：眼睛盯住那一刀，仍是第一人称、不切镜），他走开后 1.2 s 放回。动作见第 6 节。
- 割中那一帧就起 `CaptiveTaunt`，第一句（「怎么了，支那混蛋！」，录音开头带狂笑）在割中后 0.1 s 开口（导演表 `Data_FirstLevelDialogueDirection` 的 offsetS 0.7 → 0.1，录音不动）；血从脖子朝顺子这一侧喷。
- Taunt：日兵甲揪着头发嘲弄 `ija.tauntHoldS` 1.76 s（其间把刀身在川军左袖上擦一下），松手推开头（川军顺板墙滑下死去），原地把刺刀在拳里翻回反握、低头插回左胯刀鞘（`IjaReleaseSheathe` 1.33 s），然后空着手沿沟底慢慢往洞口晃过去（`ija.tauntWalk`），边走边回头骂、甩手（上身 `IjaTauntWalk`）。步速按他自己最后一句（`ija.tauntLastLine` = CaptiveTaunt.02「用你那张嘴，再骂啊！」）剩下的时长算，夹在 `tauntWalkMps` 0.45–`tauntWalkMaxMps` 0.75 m/s，骂完正好走到；走到了而这句还没完，就站着回头骂完再转身。
- Found（2026-09-30 改，用户：「日军说『还藏着一个』这里，节奏不对，应该是一转身就看到了主角，而不是原地罚站了一会儿才动手」）：改前实测（割喉为 0）：+4.8 s 走到 `ija.found`，站着等日兵乙「蠢货。」和远处「往前！快！」说完，+11.0 s 才开口，+12.4 s 蹲下后又定格到 +14.8 s 才揪头发，+16.2 s 第一巴掌。现在：骂完最后一句（+6.8 s）走到 `ija.found` (2.98,−125.2) 一回身就看见脚下木头压着的顺子（`IjaFoundLook`），`ija.foundLineS` 0.15 s 后「还藏着一个，支那混蛋。」（ShunziFound，开头带一段怪笑）；说到 `ija.foundStepS` 0.8 s 上前蹲到他头前 `ija.crouch` (2.45,−125.22)，一蹲下就揪头发（进 Hold，+8.3 s），「このしなやろう」是揪着头提起来说的；第一巴掌等这句话说完（`rescue.slap.blows[0].afterLine`，句尾 −0.55 s，尾巴是笑声），+11.4 s。CaptiveTaunt 剩下没开口的两句（日兵乙「蠢货。」、远处「往前！快！」）在他回身时掐掉，日兵乙照旧转身朝东（`frontCallAt` 记在这一刻）；若其中一句已经在播，就让它说完再开口。记 `doorSearchStarted`（流程进 02）。
- 装死（同日，用户：「一看到主角主角就闭眼假装装死，眼睛开了一个小缝，随后被一巴掌扇眩晕+睁眼，然后接后续内容」，`rescue.playDead`）：Found 进来 `closeAtS` 0.3 s（他回身看过来）眼睛在 `closeS` 0.14 s 里闭到只剩一条缝（`eyeClosure` = `squint` 0.84：两侧眼皮合拢，画面偏下中间留一道约占画高五分之一的缝，带 ±0.012 的轻微颤动），不再撑地、不再抓泥（手部 Found 只剩 flat/flatFwd，Hold 的抓挠推地从第一巴掌 `wokenAt` 起算）。装死期间视线对着日兵甲的脸再上抬 `slitAboveDeg` 9°（缝在画高 0.62 处，65° 视场），缝里先看到他低头看下来，再是蹲下揪头发凑近的脸。第一巴掌在 `openS` 0.08 s 里把眼睛打开（这一记不带挨打时的半闭抽眼，免得刚睁开又闭一下），之后甩头、单边晕、慢眨与原来相同。

## 4. 原地审问与耳光（Hold / Ask）

- 日兵甲蹲在头前，左手揪住头发把头提起来（`IjaCrouchHairHold`；眼位抬 `rescue.holdShot.liftM` 0.16 m、仰看他的脸）；顺子这时还在装死（第 3 节），手不动，挨了第一巴掌才抓泥推地。
- 「这个也问！」；翻译从 SB03 的位置小跑过来蹲在右前 `rescue.interpreter`（离眼 1.3 m），日兵乙站到 `rescue.ijaBGuard` 朝东望着前沟。
- 耳光（`rescue.slap`，2026-09-29 改：用户「看不出来是扇巴掌的动作，扇了巴掌我应该头也会自然的被转动才对，而且应该是看见我了就扇巴掌，等翻译问了一句主角还没说话就再来了一巴掌」）：揪起头（Hold 0.75 s，抓发的保持循环起点）、「还藏着一个，支那混蛋。」说完（2026-09-30 起，见第 3 节）就是一记正手（打左脸，视线被甩向右），「这个也问！」等这一下落地 0.4 s 后才开口；翻译问完「醒醒！你们的人往哪儿撤了？」、顺子不吭声，句尾后 1.1 s 再一记正手，「听见没有？……」等它落地 0.6 s 后才接（对白播放器的 `hold`，`HeldBySlap`；没配音时按估计时长顺推）；「说话！」时抬手要打第三下。两记都是正手：反手的举手在顺子眼里被日兵甲自己揪头发的左臂整个挡住，看不出是扇。每一记：手先高举过肩停一拍（压在天空上是剪影），0.58 s 抽下；头甩开 44°、横滚 12°、下沉 6 cm、朝甩去的一侧挪 5 cm，停 0.35 s 再用 1.2 s 回正——甩头期间视线钉在挨打那一刻他脸的位置，转过去的全是头，不被他收势的上身带回来；眼睛只抽一下（0.45，不黑屏），0.5 s 后再慢眨一下；被打那半边屏幕发晕——模糊、重影朝那边拖、发白发灰（2026-09-30 用户「扇巴掌不需要出现血雾 Mask，应该是个眩晕的状态」：去掉泛血红、嘴角血层和 held 的红角，落手那一下闪白 0.2、0.3 s 退），2.4 s 退掉（`Data_OpeningLens` 的 `held.slap` → `Script_OpeningLens` 的 `slap` → `Script_PostComposite` 的 `uSideDaze`/`SideDaze`，量为 0 时与原来逐像素相同）；另叠一层短促的震荡峰值（`perception.kick`）、听觉闷 0.35。音效是 Sonniss 的真实耳光录音（`Data_SfxSources` FaceSlap → `AudioSfx_Slap_01`，`Script_Audio` 有同名合成退路）。

## 5. 反冲锋、白刃战、拖出来（Charge / Melee / Lift）

- Charge 从第三下耳光抬手后 `chargeAfterRaiseS` 开始：冲锋号、`noise.rifles` 一串汉阳造枪声（从南南西沟与弹坑台阶朝东打，带曳光）、三发场外近弹（只有冲击与声音，不伤人）、九声四川话喊杀（`noise.yells`：公用的「杀！大刀砍拢去！」「弟兄伙，跟到我上！」「莫退！」与罗班长、何有田、刘文才本人的「冲！给老子冲！」，从各人所在的位置发声）。
- 镜头（2026-09-30 改，用户：「班长等人出现的太突兀了，现在一个镜头直接切过去很不自然，完全可以镜头不动，但是前面的翻译或者日军被砍死倒下吧」）：原来冲锋一开始视线就追着何有田的头甩过去约 100°（他正是在那一刻才在弹坑台阶上显形）。现在视线留在眼前的日兵甲身上（他上身：头下 `rescue.chargeView.ijaChestDropM`，仰角封顶 `maxPitchDeg`），看点按 `lookS` 时间常数平滑跟随：他惊起、转身、迎上去，罗班长、何有田、刘文才从画面右沿跑进来；何有田那一刀落下后看两人中间 `heCutHoldS`，罗班长那一刀看 `luoCutHoldS`，Melee 再慢慢转到岔口。整段视线只随日兵甲偏转约 50°。
- 日兵甲松手（头落回泥里）惊起回身（`IjaStartleTurn`）；翻译「有敌人！」转身逃（`InterpreterFlee` 以 1.4 倍速，免得挡住冲下台阶的罗班长），贴沟北侧往东跑、进纵深支沟后收走。
- 罗班长、何有田、刘文才和五名提大刀的弟兄（`rescue.extras`，NRA02 / NRA05 两种身体）原先藏在弃土后面的南南西沟里，按 `delayS` 错开冲下弹坑台阶（`rescue.chargeRoute`，4.2 m/s；罗班长打头，何有田隔 0.2 s 跟上、相距约 1.4 m——反过来两人会跑成叠在一起；起步按 `runPace` 猛冲，去劈人的三个按 `strikePace` 不减速冲到位，不用导演走路默认的 4 m/s² 起停）：
  - 日兵甲惊起（`IjaStartleTurn`）后爬起来朝台阶跑两步迎上去（`rescue.parryMeet` (3.15,−124.55)），何有田在那里格开枪口一刀砍倒他（`chopParry` 那一对，锚点朝台阶转 `parryTurnDeg` −50°）：两人离眼 1.5 m、何有田在他右边进画；尸体也倒在那里，不压在顺子脸前、拖出的路上或还权坐位上（蹲位原地砍的话三处都压着）；
  - 罗班长从日兵乙右后一刀劈倒（`chopRear`，`IjaChoppedFallWall`）；
  - 弟兄 ChargeA 把守在沟里的纵深日兵（`DepthIjaB`，停在 `rescue.depthPost`）劈倒；其余冲到沟里各自的位置朝东；还权后出了画面就收走（最迟 `extrasRetireS`）。
  - 刘文才下到台阶 `rescue.liuShot` 打岔口 J 的日兵丁（原 LongShotTick 规则与强制兜底不变），打完下沟到 `rescue.liuCover`。
- Melee：两刀都落下、再看 `meleeHoldS` 后进 Lift；超时 `meleeS` 强制致死。
- **（2026-09-29 起本条作废，见 [拖出与递枪](Data_OpeningRescueHandover20260929.md)：翻身架腋拖出、跪起递枪、站姿还权，不再踢枪和捡枪。以下保留当时的做法。）** - Lift：何有田到木头边 `rescue.lift.heLift` 把塌顶木抬起（`HeLiftTimber` + Set `LiftRoofTimber`），罗班长蹲到头前揪住衣领把他倒拖出来：罗的根由 `LuoDragToCover` 的 `player` 衣领轨迹第 0 帧对到顺子衣领上反解（`LuoGrabRoot`），眼位沿这条轨迹走到 `haulStopS` 1.4 s（拖出约 0.85 m），镜头朝下看泥地和罗往后退的两只脚（抬头看他会被他俯着的上身整个糊住镜头），然后撑起来坐回还权坐位 `shunzi.cover`；木头在他出来 0.4 s 后落回去。然后 Check「还能打不？」→ KickRifle → 还权，与以前相同（枪现在躺在他左前方泥里 `rescue.rifleMouth`，罗班长从西北把它踢到他右前方 `rifleKicked`）。

## 6. 动作（Blender）

新动作与重做的割喉链在 `_import/Script_OpeningStoryboardClips.py`，只烘 IJA02 / NRA02（manifest `20260928OpeningStoryboardsV14PinnedRescue`；烘焙 spec 新增 `sink`：贴近时骨盆下沉量，割喉链为 0，免得日兵甲被拽进川军身体里；站位新增 `yM`：两人脚下的高差）：`IjaTauntWalk`、`IjaFoundLook`、`IjaCrouchHairHold`、`IjaSlapForehand`、`IjaSlapBackhand`、`IjaSlapRaise`、`HeLiftTimber`，割喉链 `IjaHairGrabPull` / `IjaDrawBayonet` / `IjaThroatSlash` 与 `CaptiveHeadPulledBack` / `CaptiveThroatCut` / `CaptiveClutchThroat` / `CaptiveWallSlideTwitch` 按新站位重做。导演在某条动作还没烘进 manifest 时用最接近的旧动作顶替（`OpeningClipMeta(name)` 为空）。`IjaWipeSheathBayonet` 停用（`retired`）；翻越/倒拖三条仍在库里但不再播放。已知小账：何有田的抬木保持循环只有 1.0–1.5 s、松手最多比木头落下晚 0.5 s；耳光 2026-09-29 重做（manifest `20260929OpeningStoryboardsV18SlapWindup`，只烘 IJA02 两条耳光，可编辑工程在 OneDrive `AI/Models/Blender/Taierzhuang1938/OpeningSlapWindup_20260929`）：长 1.5 s，0–0.30 s 手举到肩上 1.1 m、0.42 s 前停住蓄力，0.58 s 打中（实际 0.583，清单写 0.58），1.3 s 回到抓发姿势；反手也重烘了（举在左肩前上方，原先举到左耳后够不着、把揪头发的左手扯脱 8 cm），导演现在不用它；`IjaTauntWalk` 是从右肩回头（川军在他右后方）。割喉后的揪发保持里日兵甲胯部只前探 0.5 cm（前探 3 cm 时胸口顶到川军的头，2.9–3.2 cm 穿插）。可编辑工程在 OneDrive `AI/Models/Blender/Taierzhuang1938/OpeningPinnedRescue_20260927`。

### 6.2 审问时的揪领动作（2026-09-30）

用户原话：「日军的动作有问题 修（BlenderMCP）」（截图：第一人称看 CaptiveInterrogation 那一拍，日兵甲直挺挺站着，双手叠在胸前，步枪枪口顶在川军胸口）。manifest `20260930OpeningStoryboardsV21CollarQuestion`，可编辑工程与伙伴轨在 OneDrive `AI/Models/Blender/Taierzhuang1938/OpeningCollarQuestion_20260930`。

- 改前的问题（实拍核对）：审问一拍（CaptiveWall 起、Interrogation 全程）导演放的是 09-22 的旧 `CollarControl`：站姿参数化动作，步枪一直在右手里（`oneHandRight`）枪口顶进川军胸口，左手张开悬在半空、离领口一掌远——站位 (−0.40, −0.45) 离领口 0.86 m，臂长才 0.45 m，根本够不着；脚踩平地，躯干几乎直立；接着 Slash 里步枪又跳回背上（IjaShoveToWall / IjaHairGrabPull 都是 `slungBack`）。
- 新 `IjaCollarQuestion`（IJA02，stage `collarQuestion`：川军 `CaptiveKneelMud` + 日兵甲）：站位改到臂长之内 `interrogation.ijaAHold` (−0.26, −0.17, −150°)（与割喉站位 (−0.23, −0.175) 只差几厘米，Slash 那一步几乎不用挪）；步枪一直背着（`slungBack`，前后动作一致，不再手→背跳变）；髋部后退、上身前倾 0.7 rad 压在川军上方（腿站直，膝盖不顶到他的大腿——曾经膝盖下沉、左膝进他髋部 15 cm），左拳攥紧他的前领口（`collarFront`，拳到领口 ≤ 3 cm，`WithFist` 握拳，指尖合拢），脸对着他的脸；右拳举在胸前，随喊问的节拍向他戳两下（保持循环第 0.55–0.95 s、1.75–2.15 s），同时把领口摇一摇。
- 时长 3.5 s：0–0.5 s 从推墙后的姿势进入，0.5–3.5 s 是保持循环（`holdLoop`，接缝 0，与 `CaptiveKneelMud` 的 3.0 s 呼吸同步，拳跟着领口起伏）。导演的 `QuestionClip()` 在 CaptiveWall（推完后走到站位）和 Interrogation 都用它；没烘进 manifest 时退回旧 `CollarControl`。
- 人与人不穿插（`Script_OpeningClipsBrowserTest`）：大腿对大腿 7.0 cm（限 8）、躯干/头 0.0 cm；SB03 判据（ijaA 头 x、川军距离等）全过。

### 6.1 割喉拉割与收刀（2026-09-29）

用户原话：「割喉的日军动作还有点问题，比如割喉的时候的手部动作，朝着玩家走过来的时候没有收起来的小刀等，帮我做的更写实更物理一些，BlenderMCP」。manifest `20260929OpeningStoryboardsV19PullCutSheathe`，可编辑工程与伙伴轨在 OneDrive `AI/Models/Blender/Taierzhuang1938/OpeningThroatCutSheathe_20260929`。

- 改前的问题（实拍核对）：握刀的手指只弯前两节、刀柄卡在指根，远看是一只摊开的手捏着刀；割法是反握刀先离开喉咙往外「蓄力」再横扫，右手够不到（手离轨迹 17.8 cm），手掌糊在川军下巴上，拖在后面的刀身穿进自己前臂；走过来时带血的刀一直攥在手里，停下后才收。
- 握刀：`KNIFE_CURL` 1.55 弯前两节，`CloseFist` 把末节按中节的 0.8 合拢、正握时拇指扣在食指中指上，刀柄放在指根往掌心 1.6 cm 处（`FistKnife`）。
- 拔刀（`IjaDrawBayonet`）：反握拔出（0.28–0.44 s），在自己胸前把刀在拳里翻成正握（0.44–0.58 s，手不动、刀在手里转，刀身从他自己这一侧翻过去，不扫到川军的脸），伸到川军脖子前面把刃压在喉咙右侧（0.80 s = `IjaThroatSlash` 第 0 帧）。掌心在刀转向时按刀的转动带过去（`CarryPalm`），不在 `KnifePalm` 换参考轴处跳。
- 割（`IjaThroatSlash`）：刀身是一条从拳头出发、与（压进 6 mm 的）脖子相切的直线（`NeckBlade`），按 `SLASH_DRAW` 的「接触角、刀柄到接触点距离、拳高」走：0–0.12 s 压实（往他右边推一点让刃咬住），0.12–0.40 s 朝自己右胯一拉，接触点从喉咙右侧绕过前面到左侧、刀身顺长度滑过，0.40 s 刀尖离开，收到右胯低处刀尖朝前下。躯干只小转（大了他揪头发那侧的左肩会顶到川军抬起的左肘），重心后移。1.0–1.6 s 在川军左袖上把刀身平贴着拉一下（擦刀，接触 `shoulderL`），2.0–5.0 s 是保持循环。
- 收刀（新 `IjaReleaseSheathe`，站位 `slashRelease`，第 0 帧 = `IjaThroatSlash` 2.0 s）：松手推开头，刀到胸前翻回反握（拔刀那一下倒放），弯腰看着插回左胯刀鞘（0.80 s 到位），手松开垂下。导演 `PhaseTaunt` 在松手后原地放完它再起步走；`IjaTauntWalk` / `IjaFoundLook` 不再带刺刀（刀按骨骼挂载显示在刀鞘里），走路时右手改成往后一甩。
- 刀鞘握柄上移：`SCABBARD_UP` 0.04 → 0.09（Type 30 刀挂在腰带上时握柄高出腰带），原来的位置本 rig 的右手隔着身体够不到（差 9–12 cm）；运行时刀鞘挂载点随 `IjaDrawBayonet` 第 0 帧一起改。
- 川军（NRA02）：捂喉的右手比 patch 低 3.8 cm（patch 挂在头骨上，头被扳后仰时原来的高度捂的是嘴）；割中后左手留在揪头发的拳上（`leftHair`），被松开（`CaptiveWallSlideTwitch` 0.05–0.45 s）才落到喉咙。原因：本仓库现在的烘焙代码已经复现不了 master 上提交的 `CaptiveHeadPulledBack`（肘部限速之后烘的结果不同），重烘时两手同时从头发落下，左肘会以限速慢慢划过站在他左肩的日兵甲胸口（浏览器审片 11–14 cm 穿插）；试过让左手去抓持刀手腕，同样撞，已放弃。

## 7. 验收

- 纯 node：`Script_OpeningStoryboardsTest`、`Script_OpeningLensTest`、`Script_OpeningSetTest`、`Script_OpeningFirstPersonTest`、`Script_FirstLevelMissionTest`。
- 浏览器：`Script_OpeningStoryboardShots.mjs`（新机位 SB03…SB06 的判据）、`Script_FirstLevelMissionBrowserTest.mjs --campaign --stage-to=3`、`Script_OpeningHandbackBrowserTest.mjs`、`Script_OpeningClipsBrowserTest.mjs --clip=…`、`Script_PostTest.mjs`（`uSideDaze` 为 0 时逐像素不变）。
