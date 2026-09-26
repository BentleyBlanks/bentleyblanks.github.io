# 第一关配音同步 · 2026-09-19 重构版（2026-09-23 起 01–06 改为「场景整段一次生成 → 切句 → 各自定位播放」，见 §0）

需求来源：[Notion 2026.09.19 采用稿转录](Data_FirstLevelRebuildSource20260919.md)（台词一字不改）。
接口冻结在 [分包契约](Data_FirstLevelRebuild20260919Contract.md) §5。
本页取代 [2026-09-14 配音同步](Data_FirstLevelVoiceSyncSeptember14.md) 与 [屋内伏击配音同步](Data_FirstLevelVoiceSyncRoomAmbush.md)：那两页的 cue、录音、对齐已全部下线。

## 0. 2026-09-23 场景整段一次生成 → 切句 → 定位播放（01–06）

**适用范围**：第一关 01–06 的全部剧情对白（台词表里 `perLine: true` 的 32 场、109 句）。本页第 1–7 节的整段口径仍适用于 07–18（整条播放），以及契约 §5.2 已宣布下线、但旧 01–02 导演还在用的七条 09.21 cue（`BunkerKilling` `ShunziCurse` `RescueCall` `RescueLift` `RescueOut` `TrenchCurse` `CornerCheck`，Opening 包接上新导演后删）。契约见 [01–05 重构分包契约](Data_FirstLevel0105Refactor20260923Contract.md) §2.2、§5.2、§5.5。

**用户口径（2026-09-23 23:40）**：「配音重要的是同一段对白尽量能一次生成而不是分开，这样能保证听起来像是一个环境，尽量少抽卡」。所以：**一个场景 = 一次 SeedAudio 请求 = 一条干声整段录音**，同一段对白是同一次表演、同一个声学环境；只有硬错误才整段重抽；运行时再按句切开、每句从说话人的位置播放。这取代了当天下午试点后选的「逐句单独生成」（§0.2 A）。

为什么要切开、要定位：用户反馈「台词各说各的」。查下来是五个原因叠在一起——请求里没有参考音色，同一角色每段重新抽嗓子；提示词要求把环境声录进对白，整条单声道 take 跟着说话人跳位置；整条 loudnorm，同段电平差到 13 dB；剧情对白时 AI 自主喊话不让路；整段格式表达不了插话和重叠。整段一次生成解决「像不像一个环境」，定妆参考音解决「同一个人始终同一个嗓子」，干声 + 切句 + 定位解决「声音从谁嘴里出来」。

### 0.1 SeedAudio 接口（2026-09-23 实测）

| 项 | 结论 | 证据 |
| --- | --- | --- |
| 参考音 | `references: [{ audio_data: <base64 音频> }]`，最多 3 条；服务端先「注册音色」再合成。提示词里用 `@音频1`…`@音频3` 指代。 | 坏 base64 回 400 `[45001001] decode audio base64`；空音频回 500 `[55001307] clone speaker register failed`；带参考的 take 与参考音的音色余弦显著升高（下表） |
| 说话人绑定 | **台词行以 `@音频N` 开头**（`@音频2 翻译：“…”`）、参考音按在稿里第一次开口的先后排 @音频1…3，绑得最准；写成 `翻译（@音频2）：“…”` 时三人审问一场 11 句里 4 句串嗓（日兵甲的日语句用了翻译的嗓子），改写法后同一场 0 句串嗓。 | `CaptiveInterrogation` 两种写法各生成一次对比 |
| 逐字时间戳 | `audio_config.enable_subtitle: true` → 响应带 `subtitle.sentences[].words[]`（毫秒，约 40 ms 粒度），假名也逐字给。放在请求顶层**不生效**。**带长停顿、喘气的场景偶尔不可信**：后几句的字被挤进一两百毫秒（`CaptiveDragged` 第一次生成「たて！」给了 40 ms）。 | 探针请求；切句时检查字速 |
| 多 take | 同一提示词每次结果都不同（没有固定种子）。 | 同提示词两次 sha 不同 |
| 单次时长 | 整段 14 句、31.2 s 一次成功（`BunkerBanter`）；未测 120 s 上限。 | — |

### 0.2 试点：逐句 vs 整段（5 个角色，2026-09-23）与全量整段的实测

角色 `luo` `yaowa` `comrade` `ijaA` `interpreter`，各 3 条定妆候选，按客观指标选定后，每人 3 句剧情句。三种做法：

- **A 逐句带参考**：每句一次请求，`references` = 本人定妆音，每句 2 条 take；
- **B 一来一回整段带参考**：一次请求念 3–4 句（2–3 条参考音、`@音频N` 指派说话人），再按逐字时间戳切成逐句；
- **C 逐句不带参考**（对照）：只靠人设提示词。

音色用本机 Qwen3-TTS 1.7B Base 自带的说话人编码器（ECAPA-TDNN，`Script_FirstLevelVoiceSpeaker.py`，py3.10 + torch，只读 safetensors 里的 76 个张量）求 2048 维向量，减去固定背景均值（旧声库 135 条，`Audio/FirstLevel/Data_FirstLevelVoiceSpeakerCenter.json`）后算余弦。转写用 faster-whisper medium（`Script_FirstLevelVoiceAlign.py --lines`）。

| 做法 | take 数 | 与本人定妆音余弦 均值（最低） | 认对说话人 | 同一人不同句之间 | 不同人之间 | 转写字错率 | 请求数 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| A 逐句带参考（试点） | 30 | 0.805（0.463） | 30/30 | 0.739 | 0.375 | 0.41 | 每句 2–9 条 |
| B 整段带参考再切（试点，旧写法） | 14 | 0.582（0.230） | 8/14 | 0.516 | 0.459 | 0.25 | 每段 2 条 |
| C 逐句不带参考（试点） | 15 | 0.460（0.078） | 9/15 | 0.396 | 0.253 | 0.38 | — |
| **整段一次生成 + 切句（全量 32 场，`@音频N` 行首写法）** | 109 句 | 0.714（够长的 101 句） | **79/86**（与本场挂了参考音的其他人比，本人更近）；3 句串嗓单独补录 | — | — | 0.33（四川话被写成普通话同音字为主，42 句逐字核过） | **32 场共 47 次**（24 场 1 次、4 场 2 次、4 场 3 次，含 3 次单句补录）；另有 3 次调提示词写法时作废的生成 |

（对照：09.19 整段录音跨段认对说话人只有 20%，调研 `survey/Digest_audio.md`，MFCC 粗指标。）

为什么按用户要求选整段：A 虽然认嗓子最准，但每句单独生成，同一场戏里每句的音色质感、气口、远近都是各抽各的，听起来还是「各说各的」，而且每句要多抽几条 take 才选得出（试点 25 句用了上百次请求）；整段一次生成天然是同一次表演、同一个环境，全量 109 句只用了 47 次请求。整段的弱点是串嗓，试点 B 的 8/14 主要是写法问题：改成台词行以 `@音频N` 开头、参考音按开口先后排之后，全量认对 79/86；剩下的串嗓多出在「两个嗓子本来就近」的组合（罗班长与守军 / 老周 / 何有田的定妆音余弦 0.65–0.81），重抽两次还串的才单独补录那一句。

### 0.3 生成、母带与切句

1. **定妆音**（`Data_FirstLevelVoiceCast.mjs` 人设与定妆台词 → `node Taierzhuang1938/Script_SeedAudioCastBake.mjs --only=<who> --takes=2`）：15–25 s 干声独白，非剧情台词，**每人 1–2 条候选**。候选按 F0 是否落在人设区间、信噪比、转写字错率、与同阵营已选角色的音色余弦（> 0.55 扣分）打分；`--pick=who:n --note=who:理由` 选定，写 `Audio/FirstLevel/Cast/AudioVoiceCast_<Who>.mp3` 与 `Data_FirstLevelVoiceCastManifest.json`（sha256、指标、理由）。龙套 `sharesWith` 共用嗓子，同一场景不许撞嗓（`shouter`→`runner`、`relief`→`guard`、`keeper`→`bearer`）。
2. **整段生成**（`node Taierzhuang1938/Script_SeedAudioFirstLevelBake.mjs --only=<Scene>`）：一个场景一次请求。提示词 = 干声规矩（没有任何环境声、战场声、脚步、枪炮、爆炸、音效、音乐和混响）+ `@音频N 是谁的声音`（按台词字数取前 3 个有定妆音的人，再按开口先后排）+ 场景（在哪、谁对谁、彼此多远，导演表 `scene.context`）+ 人设 + 语言规矩（川军四川话；翻译鲁南北方官话，说日语带重北方口音；日兵日语母语）+ 逐句表演说明（不念出来：此刻情境、怎么说、音量档、情绪强度、开口前停多久 `pauseBeforeS`、句前句后的笑/喘/闷哼/冷笑 `effort`）+ 台词（每行 `@音频N 名字：“原文”`，日语行用假名）。**不烘环境声与音效**：炮声、枪声由游戏声景出，否则切开后环境会跟着说话人跳位置。
3. **硬错误才重抽**（`--attempts=2` / `3`，同场最多 3 次）：漏句（逐字时间戳对上稿面的字 < 一半）、多念（时间戳的字比稿多 25%）、念错词（片段够长、字错率 > 0.6 **且**字数差得多——字数对得上的高字错率是四川话被写成同音字）、某句明显是别人的嗓子（有声 ≥ 0.6 s 的片段，与本场挂了参考音的另一人的定妆音余弦比本人高 0.08 以上）、削波（原始 take 满幅连续 ≥ 3 采样出现 3 处以上）。每场选硬错误最少、提示最少的那次生成。
4. **单句补录（例外）**（`--patch=<Scene>.<NN>`）：3 次生成都在同一句串嗓时，只补这一句：带本人定妆音的单句提示词、1 条 take，有声段电平对齐到整段里原来那一片，清单记 `source: "patch"`、`patch.replacedSha256/targetDb/reason`。本轮补了 3 句：`BundleOrder.02`（罗班长三次都用了守军的嗓子）、`RescueInterrogation.01`（日兵甲三次都像日兵乙）、`FrontBlockade.01`（老周两次都像罗班长）。
5. **母带（整段一次）**（`Script_SeedAudioVoiceKit.MasterSceneWav`）：去首尾静音（各留 80 ms）→ 整段有声段 RMS 拉到本场各句档位按字数加权的平均（`PROJECTION_DB`：喊 −16、平常 −19、低声 −23、气声 −27 dBFS）→ 限幅 → 44.1 kHz 单声道 wav。切出来的片段**不再单独归一**，同一场里喊和低声的自然差别原样保留。编码后整段或任一片段真峰值超 −1 dBTP 时，整段统一再降（最多三轮；个别原始 take 句尾有咔嗒尖刺，44.1 kHz 限幅挡不住样间峰值，`RescueCheck` 因此整段降了约 4 dB）。
6. **切句**（`MapSubtitleToLines` + `SliceScene`）：逐字时间戳按编辑距离对到稿面各句；两句之间找静音段（比整段有声 RMS 低 30 dB 以上、≥ 20 ms）：句前有 `effort` 的切在最早那段静音（笑声归后一句）、句后有的切在最晚那段、否则切最长那段的正中；找不到静音就切在能量最低处并标 `tight`。每片两头多余的静音剪到 60 ms，两端 10 ms 淡入淡出。时间戳不可信（≥ 3 个字的句子字速快过 60 ms/字，或切出过短的片段）时改按「静音段 + 预计时长占比」切（`IslandLines`），逐字时间改用 whisper 对原文的强制对齐。整段原录音保留为 `Audio/FirstLevel/AudioVoice_FirstLevel<Scene>.mp3`（`manifest.scenes[<Scene>]`：sha256、promptHash、castKey、参考音、每次生成的硬错误、请求次数、目标与实际电平）；片段写 `Audio/FirstLevel/Lines/AudioVoice_FirstLevel<Scene>_<NN>.mp3`（`manifest.lines[<Scene>.<NN>]`：sceneSha256、在整段里的起止 `sceneStartS/sceneEndS`、与上一句的原始间隔 `gapBeforeS`、切点边缘电平、嗓子与字错率指标）。
7. **逐字时间**：`Audio/FirstLevel/Data_FirstLevelLineTimings.json`，**以片段 sha256 为键**（Face 包的口型轨读它），时间相对片段开头。
8. **字错率怎么算、怎么核对**：标点、空白去掉；片假名折成平假名；日语行对稿面汉字和送 TTS 的假名各算一次取小。whisper medium 会把四川话按普通话同音字写（`拿啥子谢`→`那啥子写`）、会把「莫」改写成「别」，短句一个同音字就是 0.25–0.5；不到 1 秒的片段还会凭空写出「ご視聴ありがとうございました」。所以片段字错率 > 0.34 的，逐字核对后写进 `Audio/FirstLevel/Data_FirstLevelVoiceTranscriptReview.json`：`lines[<句 id>] = { sha256, transcript, cer, note, needsListening? }`，sha256 与转写原文都要和清单当前那一片一致（重录即失效）。whisper 根本转不出来、我们没法确认的句子标 `needsListening: true`（本轮 5 句：`CaptiveDragged.01–03` 神志不清的含糊骂与 0.24 s 的「たて！」、`RescueFlee.01`、`SupportOrder.02`），要人工试听。
9. **笑声不算字、不算嗓子**（2026-09-26）：导演表写了句前句后 `effort`（狂笑、怪笑）的句子，whisper 会把笑声写成「アハハハ…」「ヘヘヘ」，字错率与字数差被撑爆；嗓子向量也会被笑声拉离定妆音。所以：字错率与 `lengthDiff` 去掉「同一个笑音节连着 ≥ 2 次、或笑音节连着 ≥ 4 个」的串（稿里本来就有的串不去；`Script_SeedAudioVoiceKit.StripLaughter` 与 `Script_FirstLevelVoiceAlign.py` 同一口径），这类句子转写多给 64 个 token；认嗓子只量逐字时间首字前 0.1 s 到末字后 0.2 s 那一段（清单 `metrics.speakerSpanS`；那一段不到 0.6 s 或占整片 85% 以上时仍量整片）。

### 0.4 对白导演表（`Data_FirstLevelDialogueDirection.mjs`）

**默认沿用整段录音里的原始间隔**（清单 `gapBeforeS`：模型一次演出来的轮替节奏，全量中位数 0.34 s），导演表只覆盖稿里要等动作、被打断、压尾音的 8 句：`BunkerSearch.02`（−0.3 s 丁压丙的尾音）、`CaptiveInterrogation.06`（−0.25 s 日兵乙压着翻译骂进来）、`BorrowLight.06/07`（借火两处动作空当 2 s / 3 s，沿用事件 `BorrowLightMatchesPocketed` / `BorrowLightCigaretteOffered`）、`RescueInterrogation.06` `FrontApproach.02` `BundleProne.02` `BundleAttack.02`（`gate`：等导演）；另有首句的 `event:ThroatCut`（割喉后才嘲弄）与 `BunkerIncoming.01` 的 `cutAtS` + `cutEvent`（句尾前 0.35 s 被爆炸截断、发 `BunkerBlast`）。

每句字段：`{ after: "prev"|"start"|"event:<名>"|"gate", offsetS（缺省 null = 录音间隔）, projection, intensity, spatial: "self"|"head"|"offscreen", cutAtS?, cutEvent?, stopOn?, emit?, context?, delivery?, effort?, pauseBeforeS? }`；`context/delivery/effort/pauseBeforeS/projection/intensity` 只进整段提示词。`PlaybackOffset(direction, gapBeforeS)` 给出播放间隔（没录音时兜底 0.3 s）。

### 0.5 运行时（`Script_DialoguePlayer.mjs` + `Script_FirstLevelMissionVoice`）

- 每句一个独立声源（`AudioEngine.PlayDialogueLine`），挂在说话人头骨上（`speakers[who]` = 演员 / 函数 / 坐标；缺的人退回运行时 `VoicePosition`），一句从头到尾只走一路：顺子（`spatial: "self"`）走居中干声，其余走带 HRTF / 遮挡 / 距离的世界声源；视线外且解析不到位置的人非定位播放、再降 4 dB。
- `BuildScene` 把清单里的 `gapBeforeS` 填进每句的 `offsetS`（导演表写了的以导演表为准）；两句可以同时响；剧情语音同时 ≤ 3 路（契约 §6，`MAX_LIVE_DIALOGUE_LINES`）由播放器卡住：各场景正在出声的句子加旧整段单槽算总数，满了再开口时最早开口的那句淡出 0.12 s 让位（照常发它的句尾事件，玩法不会卡在等它说完；`stats.budgetCuts` 记账）。字幕逐句起止（`hud.SayLines`，先开口的那句作 aside 叠在上面），句尾多挂 0.35 s。
- 侧链（`AudioEngine.SetDialogueDuck`）：priority 场景有句子在响（含句尾 0.6 s hold），环境床 + 音乐那一路压 −6 dB（`dialogueDuck` 节点）、远处战斗压 −3 dB（`dialogueFarDuck`，接在 `farGain` 后面，不跟开枪闪避抢节点）、SFX 不压；同时非 priority 的自主喊话让路（`drops.dialogue` 计数）。只有逐句播放器会置这一位，07 以后行为不变。
- 震荡低通在有逐句对白在响时保住 4.2 kHz 辅音（与整段单槽同一个下限）。
- 接口（契约 §5.5）：`voice.PlayScene(sceneId, { speakers, gate, onLine, onEnd, priority }) → handle { Pause, Resume, Stop, Skip, Signal, lineId, playing, done }`；`voice.PlayLine("<Scene>.<NN>", speaker)`；`voice.Signal(name)` 转给所有在播场景；`voice.Speech(who)` 先读 `dialogue.faceTrackSampler`（Face 包注入），否则按这句干声的实时包络给 `{ jaw, wide, round, close, stress, active, level, brightness }`；`voice.Say/Enqueue(cueId)` 兼容旧入口——逐句 cue 排队用默认时间轴播放、`voice.current.cue.id` 照旧可读，07–18 旧 cue 行为不变。每句开口发 `Line` 事件（`{ who, index, lineId, start, end }`，与旧整段同形）。
- 某场片段还没烘齐时按字数估时走字幕与事件（不静默）；门禁里「待烘场景」是写死的名单（现在为空、只许变短），不从清单现算——某场录音整条丢了 `--audio` 就红。

### 0.6 门禁

`node Taierzhuang1938/Script_FirstLevelVoiceTest.mjs`：01–02 逐字对 09.23 新稿（解析 `> **名字：**“…”` 与 `「…」` + `> **中文：**“…”`，切到「## 分镜参考」）、说话人与契约 §5.2 一致、18 句日语纯假名、整段提示词（一场一次、1–3 条参考音、每句原文都在且标明用哪条参考音的嗓子、禁环境声）、导演表逐句覆盖且字段合法、**覆盖录音间隔的只有上面那 8 句**、播放器行为（重叠、各挂各的头、截断事件、等事件/gate、暂停续播、Skip、侧链与让路、口型只给说话人）。`--audio`：整段录音存在且哈希、提示词、定妆参考音 sha 对得上；请求次数 = 生成次数 + 补录次数且每场 ≤ 3 次生成；装上的整段没有未处理的硬错误；整段真峰值 ≤ −1 dBTP、信噪比 ≥ 30 dB、有声段电平在目标 +1.5 / −5 dB；片段按句序不重叠、`gapBeforeS` 等于整段里的原始间隔、切点落在静音里（比整段有声段低 24 dB 以上，`tight` 的除外）、**片段就是整段里那一段**（解码后波形相关 ≥ 0.98、电平差 ≤ 0.5 dB）、电平是整段一次母带的结果（`sceneGainDb` 与整段一致）；补录句电平对齐原来那一片；够长的片段不许更像本场另一个挂了参考音的人；字错率超 0.34 要有绑定当前片段的核对记录、念错（字数差得多）不许放行；逐字时间以片段 sha256 为键且落在片段里；01–06 逐句场景切句录音缺了而又不在写死的待烘名单里就红；日军自主喊话纯假名、3 个固定嗓子、录音绑定定妆音 sha；班组战斗短句本人版本齐全（2026-09-25 清单 90 条 = 幺娃 / 何有田 / 刘文财 / 老周各 16 句 + 罗班长 `leader` 一套 19 句 + 顺子 7 句；原写 87 条是罗班长改 `leader` 之前）、哈希/提示词/定妆音 sha 对得上、每人 1–3 次请求且装上的那次没有硬错误、时长 0.3–2.6 s、真峰值 ≤ −1 dBTP、电平 −16.1（+0.6 / −2.5 dB）、每人更像别人的句子不超过 1/4、念错不放行、字错率超 0.34 的每一条都要在 `Audio/FirstLevel/Data_FirstLevelSquadBarkTranscriptReview.json` 有绑定 sha256 + 转写原文的逐字核对记录（与场景片段同一口径，重录即失效，过期记录也红；逐字对不上的标 `needsListening`，每次跑都列出来）。数据侧另验：本人版本覆盖 Script_Ai 会喊的与玩家下令的每一句、认人钩子（最近者、退回点不算、日军不认、出错退回公用、只在 01–06 认、死人不认、没注入关卡步骤不认）、Bark 只在本人版本里挑、剧情语音同时 ≤ 3 路。`node Taierzhuang1938/Script_FirstLevelVoicePerspectiveTest.mjs`：真 WebAudio 下量第一人称居中（只取场上只剩顺子那一句、别的声源停了 0.3 s 以上、且混响回路单独一块表显示已经安静的窗口，排除别人那句的混响尾巴与漏过来的喊话）、世界声源方向、重叠两句两个声源、侧链增益与喊话让路、震荡低通下限，证据在 `_shots/FirstLevelVoicePerspective/`（字幕截图、输出录音 webm、JSON）。

### 0.7 日军自主喊话与班组短句

- `Data_Voice.mjs` 里 `side: "ija"` 的 28 条战斗口令恢复为纯假名（取 `f0eac8f00` 之前的文本），去掉 `dialect`，按角色挂固定嗓子 `voice`：分隊長 → `ijaA`、古兵 → `ijaB`、兵 → `ijaD`（参考音就是第一关定妆音）。`Script_VoiceBake.mjs <key…>` 生成时带 `references`，记录写 `Audio/Data_IjaBarkManifest.json`（castSha256、sha256、时长），四川话旧记录从 `Data_SichuanBarkManifest.json` 删掉。`ija_spot_roof` / `ija_spot_wall` 只能点名触发（`event: true`）。喊话本来就是一句一次请求，不受整段规矩影响。
- 班组（顺子/幺娃/罗/何/刘/老周）的战斗短句用各自定妆音（2026-09-24）：
  - **录哪些**：`Data_FirstLevelVoiceCast.SQUAD_BARK_KEYS`。罗/幺娃/何/刘/老周各 16 条 = 班组 AI 自己会喊的中方口令（2026-09-24 敌军 AI 包合并后加了跃进/冲锋/卧倒三句：`move_go`、`rally_charge`、`warn_down`，全员重录）（`Script_Ai` 的 `BARK_LINES` 与直接喊的 hurt/ammo；`hurt_down` 是旁人喊阵亡者、`hurt_scream` 是真人素材，不分人）；顺子 7 条 = 玩家下令喊的（`IssueOrder` 的 `ORDER_LINE`）。文本取自 `Data_Voice`，一字不改。门禁直接读 `Script_Ai` 源码核对这两张表，AI 改了喊法就红。
  - **怎么录**：`Script_SeedAudioSquadBarkBake.mjs`，一个人 = 一次请求 = 一条录音（带本人定妆音作 @音频1，句间停约一秒），按逐字时间戳切开；喊话彼此独立，切开后**逐句**齐平到战斗口令同一档（有声段 −16.1 dBFS、真峰值 ≤ −1 dBTP）。硬错误（漏句/多念/念错/整条不像本人/满幅 ≥ 3 处/底噪/超 2.6 s）才整条重抽，最多 3 次；单句只超 2.6 s 上限 ≤ 8% 时不重抽，把那一句不变调压快进上限（`atempo`，清单里记 `tempo`）。2026-09-24 加三句后全员重录共 7 次请求：罗、幺娃、何有田、老周、顺子各 1 次（幺娃与何有田沿用 `--loudness=-40`），刘文彩语速慢、`rally_shoot`「打！打！莫歇气！」两次都是 2.7 s，装第 1 次并把这一句压快 5.5%。86 句够长的全部离本人定妆音比离其余 5 人近；字错率超 0.34 的 57 句字数都对得上，逐条看过是四川话被 whisper 写成普通话近音（f/h 不分：掩护→烟符；平翘舌不分：闪→三；趴倒→爬到；起→气、个→狗），没人工试听过。逐条的逐字对照写在 `Data_FirstLevelSquadBarkTranscriptReview.json`：53 条判为近音放行，4 条逐字对不上近音、标 `needsListening`——`warn_grenade@luo`「所有的三」、`warn_grenade@yaowa`「搜六胆」（缺「闪」）、`warn_grenade@heyoutian`「那么，开始吧」（整句对不上）、`warn_down@liuwencai`「拔刀」（只有两个字）。手榴弹预警是玩家最需要听清的一句，合并前要有人听。2026-09-24 晚 Front 包把罗班长改成 `leader` 一套（`SQUAD_BARK_KEYS.leader` = 班组 16 句 + 战车预兆 3 句 `LEADER_TANK_BARK_KEYS`），一次请求重录，逐字核对记录重新绑定到新录音；罗班长这边标 `needsListening` 的是 `warn_grenade@luo` 与 `ammo_reload@luo`，现在共 5 条（以 `Data_FirstLevelSquadBarkTranscriptReview.json` 为准）。以后再加罗班长专用的喊话键放进 `leader` 一套，只重录他一人。
  - **怎么播**：成品 `Audio/FirstLevel/Barks/`，清单 `Data_FirstLevelSquadBarkManifest.json`，声库键 `<key>@<who>`（带 `barkOf`，不进公用池子）。`Script_FirstLevelMissionVoice` 在对白之外另起一路装载（不挡 voiceReady），并装认人钩子 `audio.barkSpeaker`：Script_Ai 只给阵营、种子（士兵 id）与脚底位置，钩子拿位置对班组每人现在的位置（`VoicePosition` 按 who 找人那条通路，水平 ≤ 0.6 m 取最近；找不到人时 VoicePosition 退回玩家身边那一点，这一点先量出来、一律不算），无种子的 priority 喊话在玩家脚下就是顺子。`Script_Audio.Bark` 认出人后只在这个人的版本里挑、不叠 ±4% 变调，没有本人版本的 TTS 句不说、真人素材照常；一条本人版本都没有才退回公用声库；调用方也可以直接传 `who`。认人只在 01–06 生效（`SQUAD_BARK_STAGES` = Trapped…Orders，运行时构造 `FirstLevelMissionVoice` 时注入 `Stage: () => flow.stage.id`），07 以后班组喊话仍走公用声库、照旧 ±4% 变调；已阵亡的人不认（注入 `Alive(who)`，读 `companion.Handle(who).alive`）——`Script_Ai.Kill` 在阵亡处喊的 hurt 是旁边的人喊的，认成死者会让死者用自己的嗓子喊「担架兵」、「班长哦！班长！」再也挑不到。离开第一关（Dispose）摘掉钩子。老周只在开场分镜认得他的几段（Trapped–Support）能被认出。
  - 实机取证（03 起跑 150 s、真 AudioContext）：班组 AI 喊话 19 次，认人 19/19 对，实际播出的本人版本有 `spot_east@heyoutian`、`rally_shoot@luo`（其余被节流或让路吃掉）。
  - 已知取舍：顺子下令的 `rally_charge`「冲！给老子冲！」、`rally_hold`「……给老子顶到起！」按原文录了，Data_Voice 注释里「给老子只给班长督战句」的口径与玩家是普通兵有出入，文本要不要改待定。

## 1. 一句话口径（旧整段格式：07–18 与待下线的 09.21 旧 cue）

- 一段连续多人对白 = **一个 cue = 一次 SeedAudio 请求 = 一条 mp3**。动作打断处不拆音频，在提示词里写明停顿时长让模型留空当，再用 `VoiceTiming` 的事件把动作对上去。
- 全部剧情 cue 65 条、罗班长带路短命令 28 条（沿用 18 + 新增 10），共 93 条录音。
- 中国人物一律四川话表演（不是四川词汇配普通话播音腔）；惨叫、纯痛呼不走 TTS。
- 日语行送 TTS 用**纯假名**，屏幕字幕显示 Notion 括号里的中文译文，汉字写法只留注释。

## 2. 数据模型

台词表 `Data_FirstLevelMissionDialogue.mjs`，每一行的形状：

```js
{ who, text, tts?, subtitle?, lang? }
```

| 字段 | 含义 |
| --- | --- |
| `text` | 台词正文，同时是屏幕字幕的默认文本。**日语行这里放中文译文**（屏幕上看到的就是它） |
| `tts` | 送 SeedAudio 的写法，缺省 = `text` |
| `subtitle` | 屏幕文本覆盖，缺省 = `text` |
| `lang` | 该行语言，缺省 `"zh"`；`"ja"` 的行去假名侧表取念法 |

取用一律走这三个导出，别直接把 `line.text` 当「念的内容」：

- `MissionVoiceSpoken(cue, index)` —— 送 TTS / 强制对齐的文本（日语行返回假名）。
- `MissionVoiceSubtitle(cue, index)` —— 屏幕字幕文本。
- `MissionVoiceScriptJson(cue)` —— 绑定录音的台词规范串（只含 `who`/`text`），baker、门禁、对齐脚本三处共用同一口径，逐行字段不进哈希。

### 假名为什么单独一个模块

`Font/Script_FontChars.mjs` 会把 `Data_FirstLevelMissionDialogue.mjs` **整棵导出的字符串**收进界面字表。
假名写进台词表就得连打包字体一起带，而屏幕上永远不显示假名。
所以日语的假名与汉字写法放在 `Data_FirstLevelJapaneseSpeech.mjs`，**不登记进 `UI_MODULES`**，键是 `cue id:行下标`：

| 键 | 送 TTS（假名） | 稿面汉字 | 屏幕字幕 |
| --- | --- | --- | --- |
| `BunkerKilling:0` | たて！はやく！ | 立て！早く！ | 站起来！快点！ |
| `BunkerKilling:3` | ころせ！はやくしろ！ | 殺せ！早くしろ！ | 杀了他！快点！ |
| `BunkerSearch:0` | なかをみろ！ | 中を見ろ！ | 检查里面！ |
| `BunkerSearch:1` | まだいるぞ！ | まだいるぞ！ | 里面还有人！ |

`Script_FirstLevelVoiceTest` 有一条断言直接扫台词表源码：出现任何假名就红。

### 混合语言的提示词

`MissionVoicePrompt()` 只在 cue 真的含日语行时把结尾那句换成
「日军角色只念稿中给出的日语，用日语发音，不说中文；中国角色只说稿中四川话。」
**纯中文 cue 的提示词逐字保持旧模板**，所以 18 条沿用的带路短命令 promptHash 不变、录音一条都没重烘。
`ijaA` / `ijaB` 的音色描述写明「1938 年日本陆军步兵，成年男性，短促粗暴的日语命令，只说稿中日语假名，不说中文」。

## 3. 事件与时间轴

`Data_FirstLevelMissionVoiceTiming.mjs` 里军列相关的 gate / parallel / 事件全部下线，现在只剩一个整段区间加具名事件。

播放器每句开始发一条通用事件：

```js
Event("Line", cue.id, { who, index, start, end, sourceTime })
```

玩法包靠它把动作对到台词上。具名事件：

| 事件 | 落点 |
| --- | --- |
| `BunkerBlast` | `BunkerBanter` 末句「来了！顺哥，你那个——」结束的那一刻（录音在此戛然而止） |
| `RescueHeave` | `RescueLift`「一、二——起！」那句的末段（82%） |
| `BorrowLightMatchesPocketed` | `BorrowLight` 第五句之后的动作空当：顺子把火柴往兜里一收 |
| `BorrowLightCigaretteOffered` | `BorrowLight` 第六句之后的动作空当：老周摸出烟包递一根过去 |
| `AircraftDiveOrder` | `AircraftReturn`「先下沟！莫停车边！」句首（沿用旧 id） |
| `ZhouNoAnswer` | `ZhouDeath` 第一句之后那段「……」，没人应声 |

### 缺录音不再静默

cue 在台词表里但 manifest 没有录音时，播放器**不碰音频引擎**，按字数估时长照常走字幕、`Line` 事件和 `Done`，并 `console.warn` 一次（`State().missing`）。
未知 cue id（运行时还在引用已下线的名字）在 `Enqueue` 就被拒收并警告一次，`Guidance` / `Cancel` / `Replay` 都不抛异常（`State().unknown`）。
这两条是给并行期的 Spine / 玩法包兜底用的，不是常态。

## 4. cue 总表

| cue | 步骤 | 说话人 | 句数 | 秒数 | 重摇 | 机器验收 |
| --- | --- | --- | --- | --- | --- | --- |
| `BunkerBanter` | Trapped | 幺娃/顺子/罗班长 | 6 | 16.74 | 1 | 重摇 1 次；六句齐全，末句 13.7—15.5 秒后 1.2 秒近爆收尾 |
| `BunkerKilling` | Trapped | 日兵甲/伤兵/扶人川军/日兵乙 | 4 | 7.84 | 0 | 日/中/日三段分窗对齐，两句日语按 ja 转写核对无误 |
| `BunkerSearch` | Trapped | 日兵甲/日兵乙 | 2 | 3.24 | 0 | 两句日语按 ja 转写核对无误 |
| `ShunziCurse` | Trapped | 顺子 | 1 | 3.94 | 0 | 逐句在转写里按序出现，无多余台词，首尾无长空白 |
| `RescueCall` | BunkerRescue | 幺娃/顺子/罗班长 | 3 | 5.93 | 0 | 逐句在转写里按序出现，无多余台词，首尾无长空白 |
| `RescueLift` | BunkerRescue | 罗班长/顺子 | 3 | 8.05 | 0 | 逐句在转写里按序出现，无多余台词，首尾无长空白 |
| `RescueOut` | BunkerRescue | 罗班长 | 1 | 3.32 | 0 | 逐句在转写里按序出现，无多余台词，首尾无长空白 |
| `TrenchCurse` | RearTrench | 顺子/何有田/罗班长 | 3 | 11.42 | 0 | 逐句在转写里按序出现，无多余台词，首尾无长空白 |
| `CornerCheck` | RearTrench | 幺娃/顺子 | 3 | 9.22 | 0 | 逐句在转写里按序出现，无多余台词，首尾无长空白 |
| `SupportOrder` | RearTrench | 守军/罗班长 | 4 | 12.93 | 0 | 逐句在转写里按序出现，无多余台词，首尾无长空白 |
| `FrontBlockade` | Support | 老周/罗班长 | 2 | 8.72 | 0 | 逐句在转写里按序出现，无多余台词，首尾无长空白 |
| `TakeOverGun` | MachineGun | 老周/罗班长 | 2 | 5.62 | 0 | 逐句在转写里按序出现，无多余台词，首尾无长空白 |
| `TankTerror` | MachineGun | 何有田/罗班长 | 2 | 6.11 | 0 | 逐句在转写里按序出现，无多余台词，首尾无长空白 |
| `BundleOrder` | MachineGun | 守军/罗班长 | 2 | 8.41 | 0 | 逐句在转写里按序出现，无多余台词，首尾无长空白 |
| `BundleGo` | Tank | 何有田/罗班长 | 2 | 5.85 | 0 | 逐句在转写里按序出现，无多余台词，首尾无长空白 |
| `BundleProne` | Tank | 罗班长 | 1 | 3.53 | 0 | 逐句在转写里按序出现，无多余台词，首尾无长空白 |
| `BundleSupply` | Tank | 留守兵/罗班长 | 2 | 4.44 | 0 | 逐句在转写里按序出现，无多余台词，首尾无长空白 |
| `BundleReturnCall` | Tank | 何有田/罗班长 | 2 | 4.54 | 0 | 逐句在转写里按序出现，无多余台词，首尾无长空白 |
| `TankStopped` | Tank | 何有田/罗班长 | 2 | 5.93 | 0 | 逐句在转写里按序出现，无多余台词，首尾无长空白 |
| `Volunteer` | Orders | 传令兵/罗班长/顺子 | 5 | 18.81 | 0 | 逐句在转写里按序出现，无多余台词，首尾无长空白 |
| `BorrowLight` | Orders | 老周/顺子 | 9 | 21.81 | 0 | 九句齐全，两处动作空当在 8.4—9.5 秒与 12.8—14.3 秒 |
| `ZhouLift` | Orders | 担架员/老周 | 4 | 6.71 | 0 | 逐句在转写里按序出现，无多余台词，首尾无长空白 |
| `SouthWhisper` | South | 幺娃/顺子 | 6 | 12.93 | 0 | 逐句在转写里按序出现，无多余台词，首尾无长空白 |
| `VillagePointer` | South | 有人 | 1 | 7.94 | 0 | 逐句在转写里按序出现，无多余台词，首尾无长空白 |
| `StreetBlocked` | Village | 有人/守军 | 2 | 4.54 | 0 | 逐句在转写里按序出现，无多余台词，首尾无长空白 |
| `KitchenDetour` | Village | 罗班长/何有田 | 2 | 5.43 | 0 | 逐句在转写里按序出现，无多余台词，首尾无长空白 |
| `MeleeRight` | Melee | 罗班长 | 1 | 1.91 | 0 | 逐句在转写里按序出现，无多余台词，首尾无长空白 |
| `MeleeCurse` | Melee | 顺子 | 1 | 2.12 | 1 | 重摇 1 次后从 2.1 秒起就是那一声，开头不再铺 4 秒打斗声 |
| `WindowOrder` | Melee | 罗班长 | 1 | 4.05 | 0 | 逐句在转写里按序出现，无多余台词，首尾无长空白 |
| `CourtyardOpen` | Courtyard | 罗班长/幺娃 | 2 | 4.62 | 1 | 重摇 1 次后幺娃隔墙那句也能转写出来 |
| `TwoLitters` | Courtyard | 刘文财 | 1 | 2.82 | 0 | 逐句在转写里按序出现，无多余台词，首尾无长空白 |
| `LastLitter` | Courtyard | 刘文财/罗班长 | 2 | 3.81 | 0 | 逐句在转写里按序出现，无多余台词，首尾无长空白 |
| `TransferSorting` | TransferApproach | 接运兵 | 1 | 6.61 | 0 | 逐句在转写里按序出现，无多余台词，首尾无长空白 |
| `VillageRoadThreat` | TransferApproach | 何有田/罗班长 | 2 | 5.62 | 0 | 逐句在转写里按序出现，无多余台词，首尾无长空白 |
| `TransferDefense` | Transfer | 罗班长 | 1 | 4.44 | 0 | 逐句在转写里按序出现，无多余台词，首尾无长空白 |
| `TransferRight` | Transfer | 何有田 | 1 | 2.25 | 0 | 逐句在转写里按序出现，无多余台词，首尾无长空白 |
| `TransferBatch` | Transfer | 刘文财 | 1 | 3.32 | 0 | 逐句在转写里按序出现，无多余台词，首尾无长空白 |
| `EscortZhou` | Transfer | 何有田/顺子/罗班长 | 3 | 9.43 | 0 | 逐句在转写里按序出现，无多余台词，首尾无长空白 |
| `CartTalk` | CartRide | 老周/顺子 | 5 | 12.83 | 0 | 逐句在转写里按序出现，无多余台词，首尾无长空白 |
| `AircraftFirst` | AirFirst | 有人/赶车人/罗班长 | 3 | 6.61 | 1 | 重摇 1 次后三句全清楚（首句「飞机——！」0—1.0 秒） |
| `WestDitchOrder` | AirFirst | 接运兵 | 1 | 5.54 | 0 | 逐句在转写里按序出现，无多余台词，首尾无长空白 |
| `CarryZhou` | Carry / Dive / Rescue | 后抬手/罗班长/顺子 | 3 | 8.05 | 0 | 逐句在转写里按序出现，无多余台词，首尾无长空白 |
| `AircraftReturn` | Carry / Dive / Rescue | 幺娃/罗班长 | 2 | 4.44 | 0 | 逐句在转写里按序出现，无多余台词，首尾无长空白 |
| `RescueZhou` | Carry / Dive / Rescue | 幺娃/担架员/罗班长 | 3 | 6.84 | 0 | 逐句在转写里按序出现，无多余台词，首尾无长空白 |
| `PicketHold` | Regroup | 警戒兵/罗班长/刘文财 | 3 | 5.43 | 0 | 逐句在转写里按序出现，无多余台词，首尾无长空白 |
| `ZhouCheck` | Regroup | 幺娃/老周 | 3 | 6.84 | 0 | 老周那一声「嗯」对齐塌成 0.12 秒，已在 note 里记明；字幕会一闪而过，列入人工试听 |
| `Headcount` | Regroup | 何有田/刘文财/幺娃/顺子 | 6 | 7.03 | 0 | 逐句在转写里按序出现，无多余台词，首尾无长空白 |
| `CartAbandon` | Regroup | 顺子/赶车人 | 2 | 5.93 | 0 | 逐句在转写里按序出现，无多余台词，首尾无长空白 |
| `CarrySwap` | WallPath | 后抬手/罗班长/何有田/顺子/前抬手 | 7 | 10.42 | 0 | 逐句在转写里按序出现，无多余台词，首尾无长空白 |
| `RoadBump` | WallPath | 老周/顺子 | 2 | 5.22 | 0 | 逐句在转写里按序出现，无多余台词，首尾无长空白 |
| `HandsShake` | WallPath | 幺娃/顺子 | 2 | 4.94 | 0 | 逐句在转写里按序出现，无多余台词，首尾无长空白 |
| `GateChallenge` | ReceptionGate | 院门守军/刘文财 | 3 | 8.65 | 0 | 逐句在转写里按序出现，无多余台词，首尾无长空白 |
| `ReceptionAccept` | ReceptionGate | 罗班长/接收人员 | 4 | 14.34 | 0 | 逐句在转写里按序出现，无多余台词，首尾无长空白 |
| `WardGuide` | ReceptionGate | 刘文财/幺娃 | 2 | 7.13 | 0 | 逐句在转写里按序出现，无多余台词，首尾无长空白 |
| `Threshold` | Handover | 老周/顺子/前抬手 | 3 | 9.64 | 0 | 逐句在转写里按序出现，无多余台词，首尾无长空白 |
| `PlaceLitter` | Handover | 军医/前抬手/顺子 | 3 | 8.72 | 0 | 逐句在转写里按序出现，无多余台词，首尾无长空白 |
| `MedicAsk` | Handover | 军医/幺娃 | 5 | 15.65 | 0 | 逐句在转写里按序出现，无多余台词，首尾无长空白 |
| `SquadAssign` | Handover | 罗班长 | 3 | 10.63 | 0 | 逐句在转写里按序出现，无多余台词，首尾无长空白 |
| `ZhouDeath` | Death | 幺娃/军医/顺子 | 7 | 13.85 | 1 | 重摇 1 次；七句齐全，第一句后 1.6 秒空当（「……」） |
| `NextLitter` | Death | 接收人员/军医 | 2 | 6.71 | 0 | 逐句在转写里按序出现，无多余台词，首尾无长空白 |
| `BridgeOrders` | Bridge* | 传令兵/罗班长 | 3 | 11.65 | 0 | 逐句在转写里按序出现，无多余台词，首尾无长空白 |
| `BridgeCover` | Bridge* | 罗班长/何有田 | 2 | 6.43 | 0 | 逐句在转写里按序出现，无多余台词，首尾无长空白 |
| `BridgeWithdraw` | Bridge* | 桥头军官/罗班长/何有田 | 3 | 5.72 | 0 | 逐句在转写里按序出现，无多余台词，首尾无长空白 |
| `MarchToTengxian` | Bridge* | 桥头军官 | 1 | 5.33 | 0 | 逐句在转写里按序出现，无多余台词，首尾无长空白 |
| `NorthGate` | NightMarch | 带路军人/罗班长 | 2 | 4.94 | 0 | 逐句在转写里按序出现，无多余台词，首尾无长空白 |
| `GuideFollow` | 带路 | 罗班长 | 1 | 6.43 | 0 | 逐句在转写里按序出现，无多余台词，首尾无长空白 |
| `GuideWait` | 带路 | 罗班长 | 1 | 4.05 | 0 | 逐句在转写里按序出现，无多余台词，首尾无长空白 |
| `GuideHold` | 带路 | 罗班长 | 1 | 3.11 | 0 | 逐句在转写里按序出现，无多余台词，首尾无长空白 |
| `GuideRearTrench` | 带路 | 罗班长 | 1 | 3.11 | 0 | 逐句在转写里按序出现，无多余台词，首尾无长空白 |
| `GuideSupport` | 带路 | 罗班长 | 1 | 5.43 | 0 | 逐句在转写里按序出现，无多余台词，首尾无长空白 |
| `GuideGun` | 带路 | 罗班长 | 1 | 8.23 | 0 | 逐句在转写里按序出现，无多余台词，首尾无长空白 |
| `GuideGunSupply` | 带路 | 罗班长 | 1 | 5.85 | 0 | 逐句在转写里按序出现，无多余台词，首尾无长空白 |
| `GuideBundle` | 带路 | 罗班长 | 1 | 9.93 | 0 | 逐句在转写里按序出现，无多余台词，首尾无长空白 |
| `GuideThrow` | 带路 | 罗班长 | 1 | 8.23 | 0 | 逐句在转写里按序出现，无多余台词，首尾无长空白 |
| `GuideCollection` | 带路 | 罗班长 | 1 | 3.53 | 0 | 逐句在转写里按序出现，无多余台词，首尾无长空白 |
| `GuideOrders` | 带路 | 罗班长 | 1 | 6.61 | 0 | 逐句在转写里按序出现，无多余台词，首尾无长空白 |
| `GuideSouth` | 带路 | 罗班长 | 1 | 9.64 | 0 | 逐句在转写里按序出现，无多余台词，首尾无长空白 |
| `GuideKitchen` | 带路 | 罗班长 | 1 | 7.94 | 0 | 逐句在转写里按序出现，无多余台词，首尾无长空白 |
| `GuideMelee` | 带路 | 罗班长 | 1 | 4.54 | 0 | 逐句在转写里按序出现，无多余台词，首尾无长空白 |
| `GuideGate` | 带路 | 罗班长 | 1 | 6.35 | 0 | 逐句在转写里按序出现，无多余台词，首尾无长空白 |
| `GuideCourtCover` | 带路 | 罗班长 | 1 | 6.11 | 0 | 逐句在转写里按序出现，无多余台词，首尾无长空白 |
| `GuideTransfer` | 带路 | 罗班长 | 1 | 8.23 | 0 | 逐句在转写里按序出现，无多余台词，首尾无长空白 |
| `GuideAlley` | 带路 | 罗班长 | 1 | 3.32 | 0 | 逐句在转写里按序出现，无多余台词，首尾无长空白 |
| `GuideCart` | 带路 | 罗班长 | 1 | 3.32 | 0 | 逐句在转写里按序出现，无多余台词，首尾无长空白 |
| `GuideWestDitch` | 带路 | 罗班长 | 1 | 3.74 | 0 | 逐句在转写里按序出现，无多余台词，首尾无长空白 |
| `GuideCarry` | 带路 | 罗班长 | 1 | 6.61 | 0 | 逐句在转写里按序出现，无多余台词，首尾无长空白 |
| `GuideRescue` | 带路 | 罗班长 | 1 | 5.33 | 0 | 逐句在转写里按序出现，无多余台词，首尾无长空白 |
| `GuideWallPath` | 带路 | 罗班长 | 1 | 3.53 | 0 | 逐句在转写里按序出现，无多余台词，首尾无长空白 |
| `GuideYardGate` | 带路 | 罗班长 | 1 | 3.11 | 1 | 重摇 1 次（--force）；第一条 1.9 秒念得过快 |
| `GuidePlace` | 带路 | 罗班长 | 1 | 8.54 | 0 | 逐句在转写里按序出现，无多余台词，首尾无长空白 |
| `GuideBridge` | 带路 | 罗班长 | 1 | 3.53 | 0 | 逐句在转写里按序出现，无多余台词，首尾无长空白 |
| `GuideWithdraw` | 带路 | 罗班长 | 1 | 3.11 | 0 | 逐句在转写里按序出现，无多余台词，首尾无长空白 |
| `GuideNorthGate` | 带路 | 罗班长 | 1 | 2.82 | 0 | 逐句在转写里按序出现，无多余台词，首尾无长空白 |

合计 93 条、206 句、638.7 秒。

## 5. 带路短命令（Guide）

按契约 §5 重排。下线 10 条：`GuideTrench` `GuideShelter` `GuideRetreatFirst` `GuideRetreatWall` `GuideRetreatYard` `GuideReception` `GuideRearDefense` `GuideExit` `GuideSouthFlank` `GuideNorthRear`（mp3 与清单条目已 `--prune` 删除）。
沿用 18 条台词一个字没动，录音未重烘。

新增 10 条（≤12 字、四川话、罗班长口吻，供验收）：

| id | 台词 | 用在哪一步 |
| --- | --- | --- |
| `GuideRearTrench` | 顺子，跟到沟走！ | 02 撤入后交通壕 |
| `GuideCollection` | 回集结处那头接令！ | 06 回背坡伤员集结处 |
| `GuideAlley` | 侧巷头有人，压回去！ | 12 侧巷那处威胁 |
| `GuideCart` | 上车，跟到周哥走！ | 12 随老周的牛马车走一段 |
| `GuideWestDitch` | 下西沟！莫停车边！ | 13—14 弃车转西沟 |
| `GuideWallPath` | 贴到墙根走，跟紧！ | 15B 靠院墙的夹道 |
| `GuideYardGate` | 进院门！担架先过！ | 15C 桥南临时接收处院门 |
| `GuideBridge` | 到南岸去，接住尾队！ | 18 铁路桥接应尾队 |
| `GuideWithdraw` | 退下来！桥要炸了！ | 18 撤出爆破区 |
| `GuideNorthGate` | 跟到队伍，进北门！ | 18 夜入滕县北门 |

## 6. 机器验收

本轮的机器验收分三道，全部只用本机工具，**不冒充人工试听**。

### 6.1 时长

`ffprobe` 逐条量，93 条共 638.7 秒（剧情 65 条 484.5 秒、带路 28 条 154.3 秒）。
按字数折算的语速落在 1.6—4.7 字/秒，与各自的表演要求一致（喊话快、临终慢、单字命令最短 1.9 秒）。

### 6.2 无提示转写核对

本地 faster-whisper 1.2.x medium CPU int8，**不给提示词**先转一遍，只用来核对
「每句在不在、顺序对不对、有没有多出可辨识台词、末尾有没有被截断」。
日语句单独按 `ja` 再转一遍核对。证据在 `_shots/L1Voice/Data_Transcript.json`（不入库）。

**这一步踩过一个坑，记下来：** 战场环境声很厚，`transcribe()` **不开 `vad_filter`
会整段整段地漏**——`Volunteer` 前 12.8 秒、`BorrowLight` 前 8.9 秒、`PlaceLitter`
整条都转不出字，开了 VAD 之后每一句都在。所以**不要拿不开 VAD 的转写当漏句证据**。

四川话转写有大量同音误识（「顺哥」→「孫哥」、「挪点」→「落點」、「这里还有一副」→「嘞嘞還有衣服」），
所以判据是「字符顺序覆盖率 + 时间槽位」而不是字面相等；沿用的、用户早已验收过的带路短命令
覆盖率也只有 47%—85%，可见这个指标的噪声底就在这一带。**自动转写不等同于人工听审或声线鉴定。**

### 6.3 强制对齐

`Script_FirstLevelVoiceAlign.py`，同一份 medium 模型逐词强制对齐，结果由 `--emit`
直接写进 `Data_FirstLevelMissionVoiceAlignment.mjs`（65 条剧情 cue；带路 cue 的整段区间由
baker 写 `Data_FirstLevelGuideVoiceAlignment.mjs`）。全部录音都短于 30 秒，只有
`BunkerKilling` 需要 `--groups` 分成日/中/日三窗。

`ZhouCheck` 第 1 句是老周的一声「嗯」，逐词对齐塌成零长度，脚本把它撑到不越过下一句起点
（实得 0.12 秒）并在 `note` 里写明。

### 6.4 重摇

六条重摇过，各 1 次，都过了：

| cue | 第一条的问题 | 处理 |
| --- | --- | --- |
| `BunkerBanter` | 前两句根本没念，转写从第三句开始 | 提示词加「六句一句不许省、开头第一句就要有人说话」，重烘 |
| `ZhouDeath` | 第 2 句「周哥？」缺失，停顿拖到近五秒 | 停顿改写成「约两秒」、点名第 2 句单独成句，重烘 |
| `AircraftFirst` | 前两句被发动机声盖住，VAD 下 5.3 秒前没有人声 | 提示词要求人声压在飞机上面、第一秒就出声，重烘 |
| `MeleeCurse` | 6.6 秒里前 4.5 秒全是打斗声，那一句落得很晚 | 提示词要求「录音一开始就是这句、整条不超过三秒」，重烘（实得 2.12 秒） |
| `CourtyardOpen` | 幺娃隔墙那句小到转写不出来 | 提示词补「远归远，两句都要喊得清清楚楚」，重烘 |
| `GuideYardGate` | 1.9 秒念完 9 个字，明显赶 | `--force` 重摇（带路命令共用一段 delivery，不能单独改） |

### 6.5 需人工试听

机器只能证明「句子在、顺序对、没多话、没截断」，下面这些要人耳定：

| cue | 为什么 |
| --- | --- |
| 全部 93 条 | 四川话的**地道程度与播音腔**机器判不了；转写的同音误识也说明不了口音对错 |
| `ZhouCheck` | 老周那一声「嗯」只有 0.12 秒字幕窗口，实机看会不会一闪而过 |
| `BunkerKilling` / `BunkerSearch` | 日语发音是否像 1938 年日军口令，以及日/中在同一条里衔接是否自然 |
| `BunkerBanter` | 末句被近爆切断的**手感**（转写只能证明它停在「你那个」） |
| `BorrowLight` | 两处动作空当的长度对不对得上收火柴与递烟的实机动作 |
| `MeleeCurse` | 白刃顶住时的破音是不是发狠而不是喊疼（不许滑成惨叫） |
| `AircraftFirst` | 「飞机——！」的示警感与人群距离 |

## 7. 流水线命令

```powershell
# 1. 看清单与字符数（不发请求）
node Taierzhuang1938/Script_SeedAudioFirstLevelBake.mjs --dry
# 2. 烘焙。429/5xx/超时自动退避重试三次；--jobs 上限 3，再多必撞并发配额
node Taierzhuang1938/Script_SeedAudioFirstLevelBake.mjs --jobs=2
node Taierzhuang1938/Script_SeedAudioFirstLevelBake.mjs --force --only=ZhouDeath   # 单条重摇
# 3. 删掉台词表里已经不存在的 cue 的 mp3 与清单条目
node Taierzhuang1938/Script_SeedAudioFirstLevelBake.mjs --prune --only=__none__
# 4. 强制对齐并直接写回 Data_FirstLevelMissionVoiceAlignment.mjs（不再手抄）
PYTHONUTF8=1 py -3.13 Taierzhuang1938/Script_FirstLevelVoiceAlign.py `
  --model <faster-whisper medium 目录> --output Taierzhuang1938/_shots/L1Voice `
  --groups Taierzhuang1938/_shots/L1Voice/Data_AlignGroups.json --emit
# 5. 门禁
node Taierzhuang1938/Script_FirstLevelVoiceTest.mjs
node Taierzhuang1938/Script_FirstLevelVoiceTest.mjs --audio
```

密钥只从环境变量 `VOLCENGINE_API_KEY` 读、经 `X-Api-Key` 头发送；不进源码、提示词、日志、输出与 Git，异常信息里一律替换成 `[redacted]`。

`--groups` 的每个窗口是 `[start, end, firstLine, lastLineExclusive, language?]`，长度 ≤30 秒；
不写语言时按窗口内各行的 `lang` 推断，混合则退回 `zh`。本轮只有 `BunkerKilling` 需要分窗（日/中/日三段）。

改了台词表要抬 `index.html` import map 的 `?v=`；改了会出现在界面上的字要重跑
`Font/Script_FontSubset.py` 并把 `Style_Interface.css` 6 处 + `index.html` 4 处字体/样式 `?v=` 抬成同一个新戳。
