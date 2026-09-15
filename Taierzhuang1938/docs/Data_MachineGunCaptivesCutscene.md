# 04 机枪点位关中过场《空地上的三个人》（2026-09-15）

第一关（`?whitebox=p012`）04 机枪阶段的关中过场。玩家第一次走进机枪点位时播一次：
北面四十米的开阔地上，三名退路被截断的川军举手投降，被日军喝令跪下、打倒、辱骂，
最后用刺刀杀害。玩家坐在机枪后面，看得见，够不着。

- 分镜与台词原稿：[`Data_CutsceneMachineGunCaptives.mjs`](../Data_CutsceneMachineGunCaptives.mjs)（导出 `CS_MachineGunCaptives` 与本场 `VOICE_LINES`）
- 注册：`Data_TengxianScript.MISSION_CUTSCENES` → `CUTSCENES` / `CUTSCENE_ORDER`
- 触发：`Script_FirstLevelMissionRuntime.UpdateCaptivesCutscene()`
- 数值：`Data_Tuning_FirstLevel.MISSION_TUNING.captivesCutsceneRadiusM`
- 字段口径：[`Data_CutsceneRedo.md`](Data_CutsceneRedo.md) §1

## 1 来源与目的

**这一场不承载任何事实断言。** 七个人全是虚构无名者；它不说「滕县战役中日军屠杀过
战俘」，它说的是「这三个人今天死在这里」。这条边界写在三处：`presumed`
（`machineGunCaptivesScene`）、`skipCard` 的第三行、以及所有台词的 `tier: "虚构"`。

目的是把 04 阶段的战斗换一个视角。在此之前，玩家打死的日军是靶子，日军打死的守军
是数字。这一段把镜头交给望远镜那一端，而过场期间玩家没有扳机 —— 机枪的射程到得了
那里，他只能看着。

尺度参照《血战台儿庄》：克制、不给脸、刺刀那一下用剪影 + 黑场，不做血腥特写、
不用慢镜头、不给音乐。**杀人的过程听得见，看不见。**

史实纪律的落点：

- 日方口语称中国军队「支那兵」是 1938 年日方文书与部队用语（`Data_Voice` 日方那一批
  的头注），全场**只出现一次**，只在羞辱句里，不进任何旁白；
- `forbiddenLines` 守住「八格牙路」这条神剧红线；
- 中方台词是四川话口语（莫／屋头／龟儿子／记到起），说话的是被抓壮丁的兵，不喊口号；
- 日方录音文本必须是**纯假名**（seed-audio 从文本判断语言），汉字写法只留在 `kanji`
  字段，屏幕字幕是中文。`Data_Voice` 的拼表体检按 `IsIjaCast(who)` 硬查这一条。

## 2 分镜表

总时长 **44 s**，六镜。机位全部钉在机枪座这一侧，靠焦距而不是走位改变距离感 ——
这一场的前提就是「他只能看」。机位固定在 `(0.4, 1.9, -132.5)`。

| 镜 | 全局秒 | 秒 | 焦距 | 机位 / 被摄 | 内容 | 台词 |
|---|---|---:|---:|---|---|---|
| 1 | 0–10 | 10 | 200 | 固定机位，锚 `captive_third` | 押解进场；7.4 s 站住、举手过头（`CaptiveHandsUpStand`） | 罗班长（画外）「莫开枪！…」 / 军曹「站住！手举起来！」 |
| 2 | 10–20 | 10 | 200 | 锚 `captive_young` | 10.5 s 喝令跪下；12.9 s 两个跪了，老兵拖到 13.6 s；14.2 s 起脚、**14.62 s 接触**→老兵前扑趴倒；15.4 s 小兵改成跪着求饶 | 军曹「跪下！手抱到脑壳上！」 / 小兵「莫杀我……」 |
| 3 | 20–30 | 10 | 200 | 锚 `captive_old`（已趴地） | 日兵站在他旁边指着骂；老兵从地上顶回去；27.6 s 抡枪托、**28.45 s 砸在跪着的小兵头肩**→他收手抱头不再出声 | 日兵「站起来啊，支那兵。」 / 老兵「龟儿子……」 / 日兵「闭嘴！」 |
| 4 | 30–35 | 5 | 200 | 锚 `ija_gunso` 背影前景，`blackOutAt 4.2` | 军曹下令；日兵乙退半步，33.4 s 起刺、**34.16 s 刺进跪着的小兵**（全片唯一看得见的一刀）；黑场从 34.2 s 起收，35.0 s 全黑 | 军曹「处理掉。一个不留。」 |
| 5 | 35–38 | 3 | 200 | `black: true` | 全黑。第三人那一刀（35.36 s）与趴着的老兵那一刀（36.36 s）只有声音；末 1 s 全静 | （无） |
| 6 | 38–44 | 6 | 135 | 固定机位，`fadeIn 1.0` | 空地上三个伏着的影子，四名日军往北走出画 | 罗班长（画外）「顺子，记到起。…」 |

`blackOutAt` 是「**从这一秒起线性收到本镜结束**」，不是「这一秒黑」。第一版把它写在一
个 8 秒的镜子里，实拍到 34.6 s 画面还是全亮的 —— 镜 4 因此缩到 5 s（只剩 0.8 s 可收），
剩下的黑由镜 5 的 `black: true` 硬接；4.2 这个值刚好卡在 34.16 s 那一刀**之后**，
接触那一帧仍是全亮的。

### 2.1 站位：按作者动作的实测触及距离反推

演出区在机枪座 `(0, -127.4)` 正北偏东约 38 m：x 4.0–9.5 / z −165…−171。
`groundSnap: true` —— 演员 `pos[1]` 是**离地高度**，真实地面由 `Script_Cutscene` 的
`groundAt` 钩子问共享地形采样器要（跨系统契约 5），不硬编码绝对 y。

三名俘虏跪成一排面朝机枪位（间距 1.4 m），动手的日军站在各自目标的**侧后方**。
站位不是摆好看的，是按作者动作实测的触及距离反推的（资产实测列见
[`Animation/MachineGunCaptives/Data_MachineGunCaptivesAnimation.md`](../Animation/MachineGunCaptives/Data_MachineGunCaptivesAnimation.md)）：

| 打击 | 施动者站位 | 受击者 | 俯视距离 | 动作触及 | **俯视误差** | 打击高度 | 受击者姿态 |
|---|---|---|---:|---:|---:|---:|---|
| 踢 `IjaKickPrisoner` | hei (5.7, −170.0) | 老兵 | 0.78 | 0.63 | **0.15** | 0.63 | 跪姿胸口 |
| 枪托砸 `IjaRifleButtStrike` | bing (8.35, −169.95) | 小兵 | 0.93 | 0.797 | **0.13** | 0.646 | 跪姿头肩 |
| 下刺（可见）`IjaBayonetDownThrust` | bing (8.55, −170.6) | 小兵 | 1.53 | 1.41 | **0.12** | 0.79 | 跪姿上半身 |
| 下刺（黑场） | ding (9.5, −170.8) | 第三人 | 1.49 | 1.41 | **0.08** | 0.79 | 跪姿上半身 |
| 下刺（黑场） | hei (5.7, −170.75) | 老兵 | 1.44 | 1.41 | **0.03** | 0.79 | 趴姿 0.2–0.35 —— 高度对不上，**所以只能在黑场里** |

三条硬规矩，改站位前先读：

1. **每一次看得见的打击，受击者都必须是跪着的。** 三种打击的高度（0.63 / 0.646 /
   0.79）全落在跪姿的躯干带上（跪姿胯 0.45、头 0.98）。趴着的人躯干只有
   0.2–0.35 m，1.41/0.79 的下刺对他在几何上就够不着 —— 老兵那一刀因此只放在镜 5 的
   全黑里，第一版把它放在可见镜头里是错的。
2. **施动者不许站在受击者的正后方。** 正后方的话整个动作被受击者挡住（第一轮实拍
   抡枪托只看得见举过头顶的半截枪）。偏出去约 0.017 rad —— 200 mm 画面上一个人宽
   0.0132 rad。日兵丁例外：他那一刀在黑场里，露不露侧影无所谓。
3. **军曹要让开踢的那条视线。** 他离机位只有 33 m，一旦压在日兵的屏幕位上，
   整条腿都被他的背挡掉（第一轮实拍如此）。现在两人差 0.032 rad。

`CaptiveStruckDown` 是**向前扑倒**，所以踢他的人站在他正后方，他就朝着机位倒下去；
三名俘虏的 `ry` 因此一律面朝 +Z（`FACE_GUN`）。

机位为什么是 1.9 m 而不是枪口那个高度：机枪座在 z=-128 的浅坑里（地面 −0.81），
架起来的枪口只有 0.64，而这一段战场上守军自己的土袋墙顶在 0.90–1.08 之间。第一版
把机位放在 1.55 m，实拍出来趴在地上的老兵被自家胸墙齐腰切掉。抬到 1.9 之后两道
胸墙的顶落在视线下方：它们仍然横在画面下缘当前景，但不再挡住任何一个人。

逐面核对过的通视（机位 → 掩体排 → 人）：`z=-146.25`（GuardWaitingCover，顶 1.08）与
`z=-150`（WithdrawCover，顶 0.90）两道在 1.9 m 机位下对**全部十一个站位**都完全让开；
`z=-158`（Stub）与 `z=-164`（Ridge）按 x 分列（Stub 挡 −1.85…1.85 / 8.15…9.85，
Ridge 挡 −1.8…1.8 / 8.25…9.75），人都摆在列与列之间的走廊里。
**Ridge 那一列是东边的硬边界**：日兵丁一度摆到 x=9.8，实测小腿被它挡掉（遮到 Y=0.76），
退回 9.5 才干净。掩体表在 `Data_FirstLevelMissionFront.FRONT_COVER`，实际方块由
`Data_FirstLevelMissionLayout.MISSION_LAYOUT.blocks` 生成。

从**真正的枪位**（座位 `(0,-127.4)`、站姿眼高约 0.89）看过去，这三个人正好落在
z=-146.25 的 x∈(−1.05,4.05) 与 z=-150 的 x∈(3.9,5.1) 两个豁口里 —— 玩家坐在枪后面
看得见他们的上半身，下半身被自家胸墙切掉。机位与演出区坐标登记在
`presumed.machineGunCaptivesStage`，是本实现推定，不是史料。

### 2.2 作者动作对照表

演员的 `state.perform: "<ClipId>"` 指向作者动作库 `Animation/MachineGunCaptives/`
（实现 `Script_CutscenePerformance.mjs`，契约见 `docs/Data_CutsceneRedo.md` §1.3）。
**受击者换 clip 的时刻与打击动作的接触帧逐个对齐过**（接触帧取自资产实测：
踢 +0.42 s、砸 +0.85 s、刺 +0.76 s）：

| 全局秒 | 谁 | clip | 秒 / 播放 | 说明 |
|---:|---|---|---|---|
| 7.4 | 三名俘虏 | `CaptiveHandsUpStand` | 4.0 loop | 站住那一顿上切进去（普通姿态→perform 是硬切） |
| 12.9 | 小兵 / 第三人 | `CaptiveKneelHandsHead` | 4.0 loop | 喝令跪下 |
| 13.6 | 老兵 | `CaptiveKneelHandsHead` | 4.0 loop | 拖了 0.7 s 才跪 —— 挨那一脚的理由 |
| 14.2 | hei | `IjaKickPrisoner` | 1.2 once→站姿 | 接触 **14.62** |
| **14.62** | 老兵 | `CaptiveStruckDown` | 1.6 once，末帧趴伏保持 | 与接触帧对齐；头 0.98→0.21 |
| 15.4 | 小兵 | `CaptiveKneelPlead` | 4.0 loop | 看见老兵被踢翻，改成求饶 |
| 20.0 | hei | `IjaTauntGesture` | 4.0 loop | 站在趴着的人旁边指着骂 |
| 27.6 | bing | `IjaRifleButtStrike` | 1.4 once→站姿 | 0.50 s 抡过头顶、接触 **28.45** |
| **28.45** | 小兵 | `CaptiveKneelHandsHead` | 4.0 loop | 收手抱头、不再出声；**仍然跪着**（后面那一刀要用） |
| 30.4 | 军曹 | `IjaTauntGesture` | 4.0 loop | 抬手下令（落在「处理掉」那一顿上） |
| 33.4 | bing | `IjaBayonetDownThrust` | 1.6 once | 刺入 0.76 s、保持到 1.06 s 再抽回；接触 **34.16** |
| **34.16** | 小兵 | `CaptiveStabbedCollapse` | 2.0 once，末帧瘫倒保持 | 全片唯一看得见的一刀 |
| 34.62 | ding | `IjaBayonetDownThrust` | 1.6 once | 接触 **35.36**（黑场） |
| **35.36** | 第三人 | `CaptiveStabbedCollapse` | 2.0 once | 黑场 |
| 35.6 | hei | `IjaBayonetDownThrust` | 1.6 once | 接触 **36.36**（黑场，对趴着的老兵） |
| 其余 | 四名日军 | `IjaBayonetGuard` | 4.0 loop | 上着刺刀的押解姿 |
| 38.0 | 四名日军 | `perform: null` | — | 镜 6 的切镜帧上退回 POSE_CLIPS 走路 |

**老兵没有 `CaptiveStabbedCollapse`**：那条 clip 从跪姿起手，给已经趴着的人用会把他
先弹回跪姿再倒一次。他从 14.62 s 起一直保持 `CaptiveStruckDown` 的末帧（趴伏），
末帧与「死了」在画面上是同一件事；36.36 s 那一刀只出声。

每一帧 `perform` 旁边仍然写着等效的普通姿态（`kneel` / `prone` / `melee`），
**那不是给回退用的**：`CutsceneDirector.ActorHeadY` 表演期间照样按 crouch/kneel/prone
估头高，自动转头与听者俯仰都靠它 —— 写掉了，跪着的人会被按站姿算，头点飘到一米四。

外观按骨架钉死（`cast[].modelVariant`）：俘虏 NRA05(4) / NRA02(1)，日军 IJA01(0) /
IJA02(1) / IJA03(2)，全部取自 `Data_CharacterSelection` 的选模清单，`ValidateCutscene`
会核对 —— 作者动作是按骨架分号烘的，换一号皮就没有这套动作。
日军的刺刀走 `state.bayonetFixed`（`Script_Actor` 每帧读这一位）。

### 2.3 音效

全部取现成 cue（`Data_SfxSources` / `Script_Audio` 的配方），本轮**不新生成**任何音效：
`explosionFar`（远处炮声垫底）、`footstepDirt`（押解的脚步）、`impactFlesh`（踢与枪托）、
`bodyFall`（倒地）、`impactDirt`、`bayonetHit`（刺入）。惨叫与闷哼一律不走 TTS，
这一场干脆一声都不给 —— 黑场里三记 `bayonetHit` + 三记 `bodyFall` 已经够了。

## 3 触发规则

写在 `Script_FirstLevelMissionRuntime.UpdateCaptivesCutscene()`，由 04 阶段的逐帧块调用。

- **条件**：阶段是 `MachineGun`，且玩家第一次进入机枪座 `GUN_SEAT = (0, -127.4)` 的
  半径 `MISSION_TUNING.captivesCutsceneRadiusM`（当前 **4 m**）以内。这一条逐帧查、
  不挂在 `Enter` 上，所以阶段切进来时玩家已经站在圈里（从检查点或调试跳转进来就是
  这样）也立刻算数。4 m 比机枪交互半径（`EmplacementInteraction.reachM` = 3 m）大一点：
  玩家还没按 F 就已经看见了，接枪那一下不会被打断。
- **事实名**：`captivesWitnessed`。记在 `flow.facts` 里，随 `FirstLevelMissionFlow`
  的 `Snapshot` / `Restore` 一起存取，`Retry` / `ContinueCheckpoint` 都不清 ——
  死亡回退到本阶段检查点不会重播。
- **事实先记再播**：宿主 `PlayMidCutscene` 回 `null` 的三种情形（过场系统还没建起来、
  已经在播一场、正在换关）都是正常状态，记了事实就不会每帧重试，也不报错。
- **调试跳转不播**：`ApplyFirstLevelStageJump` 跳到 04 或更后面时直接把
  `captivesWitnessed` 记上。04 的起点就在机枪座上，也就是这一场的触发圈里，而跳转是
  「把人放过去」不是「走过去」—— 与 `?phase=N` 只建场不装剧本同一口径。正常游玩
  不受影响：走到枪位照样播。`Script_FirstLevelMissionBrowserTest --campaign` 的
  `JumpStage` 在没有 `--stage-jumps` 时是空操作，所以那条整关回归走的仍然是正常触发。
- **走宿主口**：`host.PlayMidCutscene(id)`（`Script_Main` 的 `PlayMidCutscene` →
  `RunCutscene`），与关首 / 关末过场同一条路：夺控制权、掐战斗输入、放指针锁、
  收枪、Esc 跳过并以卡片补出字幕、播完还回来。任务层只报「该播了」，不自己当导演。

### 3.1 播放期间为什么不用另外冻谁

`Script_Main.Frame()` 在 `cutscene.Playing` 时只推过场与画面，玩法（玩家、AI、战车、
`missionRuntime.Update`）**一律不跑**。所以：

- 玩家不会在看戏的时候被打死（血量一点不掉）；
- `SpawnEncounter("machineGun")` 已经在 `Enter("MachineGun")` 里撒下的那一队是活的，
  但过场期间一步不前、一枪不开；战车同理。

这两条由专项逐帧取证（见 §5），不是推断。

### 3.2 与班长提醒的顺序

`Enter("MachineGun")` 先 `Say(stage.cue)`，也就是 `FrontWeaponChoice`
（「机枪就在旁边，顺手就接！先把前头那队鬼子打退！」）。玩家走到枪位时那条多半
正在播，所以触发时**先 `voice.Pause()`**，过场的 Promise 结束（正常播完或 Esc）
再 `voice.Resume()` —— 与 `OnPlayerDown` / `Retry` 用的是同一对。结果是：整段班长
提醒一个字不丢，也不会和过场里的台词压在一起。

`TakeMachineGun` 那一条老 cue 当前没有任何调用方（04 的 cue 是 `FrontWeaponChoice`），
本轮没有动它。

## 4 配音清单

九条，全部经 `Script_VoiceBake.mjs` 直连火山引擎 `seed-audio-1.0` 整句生成（一条一
cue，不拼接），走 `ch1_*` 章节语音通道并入 `Data_Voice` 总表；`dur` 由 baker 写回
`Data_CutsceneMachineGunCaptives.mjs`。文件名只经 `VoiceFileName(key)` 推导。

| key | who | 交付档 | 字幕（中文） | 录音文本 | 实测时长 | 底噪 | 文件 |
|---|---|---|---|---|---:|---:|---|
| `ch1_luo_28` | luo | shout | 莫开枪！北边那几个是我们的人。 | 同左 | 2.79 s | −58.5 dB | `AudioVoice_Ch1Luo_28.mp3` |
| `ch1_ija_gunso_01` | ija_gunso | shout | 站住！手举起来！ | とまれ！てをあげろ！ | 1.59 s | −74.9 dB | `AudioVoice_Ch1IjaGunso_01.mp3` |
| `ch1_ija_gunso_02` | ija_gunso | shout | 跪下！手抱到脑壳上！ | ひざまずけ！てをあたまのうしろへ！ | 2.91 s | −72.1 dB | `AudioVoice_Ch1IjaGunso_02.mp3` |
| `ch1_captive_young_01` | captive_young | weak | 莫杀我……我屋头还有老娘。 | 同左 | 3.00 s | −73.9 dB | `AudioVoice_Ch1CaptiveYoung_01.mp3` |
| `ch1_ija_hei_01` | ija_hei | shout | 站起来啊，支那兵。 | たてよ、シナへい。 | 1.56 s | −70.7 dB | `AudioVoice_Ch1IjaHei_01.mp3` |
| `ch1_captive_old_01` | captive_old | weak | 龟儿子……你们也有屋头人。 | 同左 | 3.74 s | −61.4 dB | `AudioVoice_Ch1CaptiveOld_01.mp3` |
| `ch1_ija_hei_02` | ija_hei | shout | 闭嘴！ | だまれ！ | 0.69 s | −87.7 dB（原始 take） | `AudioVoice_Ch1IjaHei_02.mp3` |
| `ch1_ija_gunso_03` | ija_gunso | normal | 处理掉。一个不留。 | しまつしろ。ひとりものこすな。 | 2.61 s | −61.8 dB | `AudioVoice_Ch1IjaGunso_03.mp3` |
| `ch1_luo_29` | luo | normal | 顺子，记到起。今天这个，记到起。 | 同左 | 4.29 s | −53.9 dB | `AudioVoice_Ch1Luo_29.mp3` |

日方三条的汉字写法在 `VOICE_LINES[].kanji`（止まれ！手を上げろ！／跪け！手を頭の
後ろへ！／始末しろ。一人も残すな。／立てよ、支那兵。／黙れ！）。

字幕时长全部按字数规则（每字 ≥0.22 s + 1.2 s）给，**每一条都长于对应录音**，
所以没有一句被下一镜截断，也不需要按录音时长反过来改 `at`。

### 4.1 新增的三个音色

`captive_old` / `captive_young` / `ija_hei` 三个 CAST id 是本场新增的：登记在
`Data_Voice.STORY_CAST_IDS` 与 `Script_VoiceBake.CAST_VOICE_PROMPTS`（缺一条 baker
直接退出 2，不会悄悄换成通用川军男兵）。`ija_hei` 走日语分支，判据从
`who === "ija_gunso"` 推广成 `Data_Voice.IsIjaCast(who)`（`^ija(_|$)`）。

**踩过一次的坑写在这里**：`captive_old` 第一版按 `normal` 档烘，提示词里写了
「音量不大」，模型交回来一条 max −30.4 dB / mean −55.6 dB 的气声 take ——
`Encode` 的 `silenceremove` 阈值是 −45 dB，整条 4.6 s 被削得只剩 0.08 s，而日志只报
「烘好 1 条」。两处一起改才修好：交付档换 `weak`（trim 阈值 −55 dB、目标 RMS −19 dB），
提示词里明写「每个字都要实实在在地发出声来，绝对不许做成气声」。
另外 `--clean` 对**改过词或音量异常**的行不安全：它按底噪挑最干净的一条，而一条几乎
全是静音的截断 take 底噪当然最低 —— 实测它把一条 4.04 s 的好 take 换成了 0.53 s。

## 5 验证入口与本轮结果

```powershell
node Taierzhuang1938/Script_CutsceneCheck.mjs CS_MachineGunCaptives      # 纯数据自检
node Taierzhuang1938/Script_CutsceneShot.mjs --cut=CS_MachineGunCaptives # 出图（自带 whitebox=p012&menu=0）
node Taierzhuang1938/Script_FirstLevelMachineGunCutsceneTest.mjs         # 本场专项（浏览器）
node Taierzhuang1938/Script_FirstLevelMachineGunTest.mjs                 # 04 既有专项，必须仍绿
node Taierzhuang1938/Script_CutscenePoseTest.mjs                         # 逐人量骨头高度 + performClip
node Taierzhuang1938/Script_MachineGunCaptivesAnimationTest.mjs           # 动作库与 perform 契约
node Taierzhuang1938/Script_VoiceTest.mjs                                # 声库与交付档
```

两条「动作真的生效了」的门禁（`visible ≠ 看得见` 那条老教训的同一手法：量涂色，不看旗标）：

- `Script_CutscenePoseTest` 的 `CUTSCENE_CASES` 里本场有四个时刻逐人量，判据是
  **`rig.cutscenePerformance.state.clipId`**（表演层当前在播的 clip id）+ 骨头世界高度。
  clipId 是 null 就说明这一帧根本没在播作者动作 —— 而那种情形画面上只是「动作没做」，
  不报错、不红脸。
- `Script_FirstLevelMachineGunCutsceneTest` 在 **p012 正片入口**推到 17 s 读同样两样东西，
  证明 `Script_Main` 那条**不 await** 的预取（`LoadMachineGunCaptivesAnimation`）
  真的在到达这个拍子之前把库放进了缓存。

出图脚本本轮补了两件事（白盒关的过场以前没法出图）：

- `--whitebox=<id>` 与数据侧的 `cut.shotWhitebox`：白盒关的场不由 `?phase=N` 建。
  URL 里**必须**带 `menu=0` —— 白盒关无条件建主菜单，而菜单开着时 `StepFrames` 推的是
  菜单帧，过场时间轴一帧都不走（症状：每张图都停在第 0 秒）。
- 白盒关不再把 `state.running` 置 false：`Frame()` 开头有一条「`missionRuntime` 在场且
  `!running` 就只渲染不推进」的终局守卫，排在过场分支之前，置了 false 之后同样是
  「每张图都停在第 0 秒」。`manual=1` 本来就已经接管了时钟。

本场专项守的五件事：正常输入走进枪位才触发、只播一次（走出去再走回来 / 检查点存取 /
flow 快照往返都不重播）、播放期间玩家不掉血且机枪进攻队一步不前一枪不开（那一队是
**活的**，不是被夹具杀光的空场）、播完控制权还回来且仍在 04、还权之后按 F 上枪开火
`gunUsed` 照旧记得上。截图落 `_shots/MachineGunCutscene/`（已 gitignore）。

`Script_FirstLevelMachineGunTest` 的跳转夹具直接把玩家放到座位上 —— 那正是本场的触发
圈。夹具里补了一行 `r.Record("captivesWitnessed")`，它**不削弱那条测试原有的任何断言**。

### 5.1 本轮结果（2026-09-15，合入作者动作库之后）

全绿：`CutsceneCheck`（硬错 0 / 软错 0）、`MachineGunCaptivesAnimationTest`
（5 骨架 × 25 绑定、`rootDrift=0`/`restoreError=0`/`scrub=0`）、`CutscenePoseTest`
（本场四个时刻逐人 `performClip` + 高度全中）、`MissionHooksTest`、`TextTest`
（0 失败 / 1 既有动态键警告）、`ModuleGraphTest`、`TestRunnerTest`、`VoiceTest`（31/31）、
`FirstLevelMachineGunCutsceneTest`、`FirstLevelMachineGunTest`、
`FirstLevelMissionStageJumpTest`。

`FirstLevelMissionBrowserTest --campaign --through-south --allow-checkpoint-retry`
跑了两趟：第二趟通过（1 次检查点重试），第一趟停在
`living withdrawn guards finish their physical rear route`。那一条与本场无关，是
**跑得太快**的时序敏感：撤回守军的七段后撤路只在 Support/MachineGun/Tank/Orders
四个阶段里走（`UpdateGuards` 的阶段白名单），第一趟玩家零重试、血剩 80 一路推到
South，守军才走到第 4 个折点就被冻住。过场不消耗任务时钟（`Frame()` 在
`cutscene.Playing` 时整个玩法停摆），两趟日志里都能看到
`"cutscene":"CS_MachineGunCaptives"` 正常播完。

`TestRunner --changed=origin/master --profile=quick --fail-fast` 通过 59、失败 1：
`FirstLevelWhiteboxSurfaceTest` 是**既有红**（`FirstLevelP012FlowTest` 同根因）——
仓库 `package.json` 是 `"type":"commonjs"`，`Script_ExternalProps` / `Script_GrenadeAsset`
以 ESM 方式 import `vendor/three/examples/jsm/loaders/GLTFLoader.js`（`.js` 扩展名）必然
链接失败。在干净的 `origin/master` worktree 上复现出同一条报错，且失败链上六个文件与
`origin/master` 逐字节相同。

## 6 未完成 / 妥协

1. **第一关战场仍是白盒**：画面里那些蓝色方块是掩体的白盒色，不是过场的布景问题。
2. `IjaKickPrisoner` / `IjaRifleButtStrike` 的接触帧上，脚尖与枪托会**陷进受击者身体
   约 0.1 m** —— 俯视误差 0.13–0.15 m 全在动作触及之内，多出来的那一点是站位取整。
   真要贴到零误差得把站位精确到厘米，而演员的 sizeScale 本来就散在 ±4%，没有意义。
3. 受击者**没有挨打的反应动作**（挨枪托那一下只换成抱头 + 一次镜头抖 + 一记
   `impactFlesh`）。作者动作库里没有「跪着挨打抽搐」这一条，本轮不扩库。
4. `Script_CutscenePoseTest` 的高度带按演员 sizeScale 的实际散布给（资产实测值 ±7%）；
   「动作库有没有真的生效」由 `performClip`（表演层在播的 clip id）钉死，不靠高度带。
   POSE_CLIPS 那张 `CLIP_BANDS` 一个数没动。
5. 本场没有 `props`：就地演，用的是战场上已有的东西。要补散落装具得先确认不与
   `FRONT_COVER` 的掩体列和 `MISSION_AFTERMATH` 的尸体层打架。
6. Esc 跳过那条路由 `skipCard` 承担，本轮没有专门实跑（专项与整关回归走的都是自然播完）。
