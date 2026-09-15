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
| 1 | 0–10 | 10 | 200 | 固定机位，锚 `captive_third` | 三个举着手的人被四名日军押进空地；先从土坎上露出半身，走近才看全 | 罗班长（画外）「莫开枪！北边那几个是我们的人。」 / 军曹「站住！手举起来！」 |
| 2 | 10–19 | 9 | 200 | 锚 `captive_young` | 喝令跪下、抱头。两个跪了，老兵没跪，挨了一脚翻在地上；小兵跪在地上讨命 | 军曹「跪下！手抱到脑壳上！」 / 小兵「莫杀我……我屋头还有老娘。」 |
| 3 | 19–30 | 11 | 200 | 锚 `captive_old` | 日兵站在趴着的老兵旁边指着骂；老兵从地上顶回去一句；一记枪托砸下去 | 日兵「站起来啊，支那兵。」 / 老兵「龟儿子……你们也有屋头人。」 / 日兵「闭嘴！」 |
| 4 | 30–35 | 5 | 200 | 锚 `ija_gunso`（他的背影在前景） | 军曹下令；刺刀那一下从 33.4 s 起，黑场从 33.6 s 开始收，到 35.0 s 全黑 —— 只留 0.8 s 剪影 | 军曹「处理掉。一个不留。」 |
| 5 | 35–38 | 3 | 200 | 同上（`black: true`） | 全黑。后两刀与两次倒地只有声音；最后 1 s 全静 | （无） |
| 6 | 38–44 | 6 | 135 | 固定机位，`fadeIn 1.0` | 从黑里淡回：空地上三个伏着的影子，日军往北走出画。机位一动不动 | 罗班长（画外）「顺子，记到起。今天这个，记到起。」 |

`blackOutAt` 是「**从这一秒起线性收到本镜结束**」，不是「这一秒黑」。第一版把它写在一
个 8 秒的镜子里，实拍到 34.6 s 画面还是全亮的 —— 镜 4 因此缩到 5 s（只剩 1.4 s 可收），
剩下的黑由镜 5 的 `black: true` 硬接。

### 2.1 站位与通视

演出区在机枪座 `(0, -127.4)` 正北偏东约 38 m：x 5.4–9.6 / z −165…−172。
`groundSnap: true` —— 演员 `pos[1]` 是**离地高度**，真实地面由 `Script_Cutscene` 的
`groundAt` 钩子问共享地形采样器要（跨系统契约 5），不硬编码绝对 y。

机位为什么是 1.9 m 而不是枪口那个高度：机枪座在 z=-128 的浅坑里（地面 −0.81），
架起来的枪口只有 0.64，而这一段战场上守军自己的土袋墙顶在 0.90–1.08 之间。第一版
把机位放在 1.55 m，实拍出来趴在地上的老兵被自家胸墙齐腰切掉。抬到 1.9 之后两道
胸墙的顶落在视线下方：它们仍然横在画面下缘当前景，但不再挡住任何一个人。

逐面核对过的通视（机位 → 掩体排 → 人；「挡到 Y」是这条视线上被遮住的最高点，
≤0 表示完全不挡）：

| 排 | z | 顶高 | 挡住 x 段 | 老兵 (7.7,−169.8) | 小兵 (8.4,−169.3) | 第三个 (9.1,−168.8) |
|---|---:|---:|---|---|---|---|
| GuardWaitingCover | −146.25 | 1.08 | −6.9…−1.05 / 4.05…9.9 / 11.1…16.9 | 走豁口 | 走豁口 | 走豁口 |
| WithdrawCover | −150 | 0.90 | −4.9…−1.1 / 0.1…3.9 / 5.1…8.9 | 挡到 Y −0.23 | 走豁口 | 走豁口 |
| FrontCover Stub | −158 | 1.03 | −1.85…1.85 / 8.15…9.85 | 走廊 | 走廊 | 走廊 |
| FrontCover Ridge | −164 | 0.96 | −1.8…1.8 / 8.25…9.75 | 走廊 | 走廊 | 走廊 |

Ridge 那一列是东边的硬边界：**往东超过 x≈9.6 就会被它挡住小腿**，别再往东挪人。
掩体表在 `Data_FirstLevelMissionFront.FRONT_COVER`，实际方块由
`Data_FirstLevelMissionLayout.MISSION_LAYOUT.blocks` 生成。

从**真正的枪位**（座位 `(0,-127.4)`、站姿眼高约 0.89）看过去，这三个人正好落在
z=-146.25 的 x∈(−1.05,4.05) 与 z=-150 的 x∈(3.9,5.1) 两个豁口里 —— 玩家坐在枪后面
看得见他们的上半身，下半身被自家胸墙切掉。机位与演出区坐标登记在
`presumed.machineGunCaptivesStage`，是本实现推定，不是史料。

### 2.2 作者动作（另一路交付）

演员的 `state.perform: "<ClipId>"` 指向作者动作库 `Animation/MachineGunCaptives/`：

| 时刻 | 谁 | clip | 合入前的等效普通姿态 |
|---:|---|---|---|
| 7.4 | 三名俘虏 | `CaptiveHandsUpStand`（loop） | 站姿待机 |
| 12.9 | 小兵 / 第三个 | `CaptiveKneelHandsHead`（loop） | `kneel: 1` |
| 14.2 | 日兵 | `IjaKickPrisoner`（once 1.2 s） | `melee: 0.7` |
| 14.7 | 老兵 | `CaptiveStruckDown`（once 1.6 s，末帧趴伏保持） | `prone: 1` |
| 14.4 | 小兵 | `CaptiveKneelPlead`（loop） | `kneel: 1, reach: 0.45` |
| 19.8 | 日兵 | `IjaTauntGesture`（loop） | `reach: 0.5` |
| 27.8 | 日兵 | `IjaRifleButtStrike`（once 1.4 s） | `melee: 0.85` |
| 30.4 | 军曹 | `IjaTauntGesture`（抬手下令） | `reach: 0.5` |
| 33.4 / 34.2 / 34.9 | 日兵 / 日兵乙 / 日兵丁 | `IjaBayonetDownThrust`（once 1.6 s） | `melee: 0.9` |
| 34.2 / 35.0 / 35.7 | 老兵 / 小兵 / 第三个 | `CaptiveStabbedCollapse`（once 2.0 s，末帧瘫倒保持） | `prone: 1, dying: 1` |
| 其余 | 四名日军 | `IjaBayonetGuard`（loop） | 站姿待机 |

**每一帧 `perform` 旁边都同时写了等效的普通姿态**，所以合入前这一场也读得懂：跪着的
人是跪着的、被打倒的人趴着、被捅的人瘫下去 —— 只是没有那几下动作。等效姿态刻意
**不用 `dead: true`**：布娃娃会和作者动作抢骨头。

外观按骨架钉死（`cast[].modelVariant`）：俘虏 NRA05(4) / NRA02(1)，日军 IJA01(0) /
IJA02(1) / IJA03(2)，全部取自 `Data_CharacterSelection` 的选模清单，`ValidateCutscene`
会核对。日军的刺刀走 `state.bayonetFixed`（`Script_Actor` 每帧读这一位），数据侧不
需要引擎改动。

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
node Taierzhuang1938/Script_VoiceTest.mjs                                # 声库与交付档
```

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

## 6 未完成 / 待合入后再调

1. **作者动作库未合入**：本轮所有 `perform` 都回退成普通姿态（这是预期）。合入后要按
   实际 clip 时长复核这几处秒数：踢（14.2）、被打倒（14.7）、枪托砸（27.8）、
   三刀（33.4 / 34.2 / 34.9）与三次瘫倒（34.2 / 35.0 / 35.7）。机位、走位、台词、
   音频、触发都不用动。
2. 合入前「举手投降」读成普通站姿待机、「跪着抱头」读成蹲姿、倒地的人用 `proneFire`
   （撑着的匍匐姿）而不是瘫的 —— 三处都要等 `CaptiveHandsUpStand` /
   `CaptiveKneelHandsHead` / `CaptiveStabbedCollapse` 才对。
3. 第一关战场当前仍是白盒：画面里那些蓝色方块是掩体的白盒色，不是过场的布景问题。
4. `Script_CutscenePoseTest` 的 `CUTSCENE_CASES` 是一张点名表，本场没有进去。要把跪姿
   高度带纳入守护，等作者动作合入、跪姿实测高度稳定之后再加一条用例 ——
   **不许为了把它加进去而放宽既有高度带**。
5. 本场没有 `props`：就地演，用的是战场上已有的东西。真要补一两件散落的装具，
   得先确认不与 `FRONT_COVER` 的掩体列和 `MISSION_AFTERMATH` 的尸体层打架。
