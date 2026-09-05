# 音频资产：音效 / 环境床 / 音乐

## 部署素材本体响度（2026-08-25）

所有非对白部署音频必须在提交前运行统一的素材本体归一化：

```text
node Taierzhuang1938/Script_AudioNormalize.mjs --write
node Taierzhuang1938/Script_AudioNormalize.mjs
```

短音效（`Audio/Sfx` 与 `Audio/Amb` 的一次性 cue）按相对最响 20 ms 帧门限计算有声段 RMS，对齐到
−25 dBFS；环境床与音乐按整段 RMS 对齐到 −27 dBFS；峰值上限为 −1 dBFS，验收容差
为 ±0.5 dB。这样静音头尾、衰减尾巴和素材长度不会把同样响的冲击误判成不同音量。
远近、脚步与炮弹的类别差、环境层配比、剧情音乐轻重仍只由 `Script_Audio.mjs` 的运行时
混音决定，不再把这些决策烘进文件音量。对白由 `Script_VoiceTest.mjs` 的有声段 RMS 闸
单独管理，不纳入本脚本。

不带参数运行是只读验收，任何一组散布超过 1 dB（单文件偏离目标超过 0.5 dB）都会失败；
`--report` 会打印逐文件读数。三个 manifest 的 `normalization` 字段记录目标、容差和执行日期。

三层都从「全部合成」换成了实录。音效在下面第一节（2026-08-19），
环境床与音乐在中间两节（2026-08-20，整层推倒重做）。
**最后一节是混音层**（距离 / 混响 / 谁先被丢），2026-08-20 修
「一打起来就充斥着不知道哪儿来的、带拖尾的音效」那一轮 —— 素材基本全是对的，
坏的是它们怎么被送到耳朵里。那一节只添了一条素材（`shellDrop`，25 KB），
因为原来根本没有弹壳这个音，代码拿「迫击炮爆炸」顶了它的位置。

---

# 序章｜出川：102 秒车厢音频（2026-08-24）

本批只为 Notion 2026-08-24 定稿的 102 秒车厢序章服务，仍走现有 ambience / sfx / voice 三总线；不新增播放系统。
环境床使用 `trainInterior` preset，音乐由过场接入时显式设为 `null`。制动段不是第二套环境床：
时间轴在 0:40—0:56 触发一次 `trainBrake` 专用 cue；preset 的 `transition.brake` 记录了这一接口。
两次炮声继续复用现有 `amb.cannonFar` / `explosionFar`，擦枪的发涩枪栓继续复用现有 `bolt`，本批没有重复生成这三条。

## 程序合成与许可

车厢环境与七条专用音全部是仓库内确定性程序合成，没有外部录音、网络下载或第三方许可问题：

- `Script_AmbBake.mjs TrainInteriorGenerated` 生成 30 秒立体声 `AudioAmb_TrainInterior.mp3`，由低频棕噪（车体）、72 Hz 轮轨节奏、290 Hz 木结构共振和高频空气摩擦组成；两端 150 ms 淡入淡出，运行时由 `AmbLayer` 双头交叉淡化。
- `Script_SfxBake.mjs PrologueTrainGenerated` 用固定 LCG 噪声、衰减正弦和 cue 专属包络生成 `TrainBrake`、`CarriageRattle`、`StretcherWood`、`CoughLow`、`GearRustle`、`CarriageDoorSlide`、`StepBallast`。
- `Script_VoiceBake.mjs --prologue --force` 只允许直接调用火山引擎 `seed-audio-1.0`。密钥只读 `VOLCENGINE_API_KEY`，不得写入仓库、日志或 GitHub；不得经 Lovart、本机 MiniMax Hub，也不得回退 Qwen、系统朗读或其他模型冒充成品。
- 1:08—1:30 的班长问答在 `Data_Voice.mjs` 只登记一个 `prologue_motivation_01`：同一个提示词一次生成完整八句与停顿，运行时只触发一次音频；`Data_CutsceneChuchuan.mjs` 的八条 `lines` 只负责逐句字幕。2026-08-24 定稿采用 Notion 新台词“这次你们去啊。出川，晓不晓得啊？”，班长三次发问逐级抬升；十到十二名十七八岁的年轻男兵以约 80—250 ms 的自然错拍、抢话和参差尾音回应。“不怕！”保持短促炸裂，但不做机械同步的录音棚合唱，也不堆成百人大场面。

所有对白用四川话；不是只把普通话换几个词，而是由 SeedAudio 1.0 统一输出四川口音与语气。单句 cue 使用 0.45—5.2 s 时长闸，连续动员 cue 使用独立 22.5 s 闸，火山引擎原始 take 的底噪闸为 −48 dB；两者都不套战斗 Bark 的 2.6 s 上限。人工试听仍需确认咬字、角色区分、齐声层次、班长哽咽与方言可信度。未使用英文、女性声线或无声占位。

## 序章 18 句／11 个音频 cue 清单

顺序就是时间轴顺序；前 9 句与最后 1 句逐句生成，1:08—1:30 的 8 句合成一个连续 cue：

| # | 角色 | cue | 文件 | 实测时长 |
| ---: | --- | --- | --- | ---: |
| 1 | 年轻传令兵 | `prologue_young_dispatch_01` | `AudioSfx_PrologueVoiceYoungDispatch_01.mp3` | 2.07 s |
| 2 | 旧伤士兵 | `prologue_old_wound_01` | `AudioSfx_PrologueVoiceOldWound_01.mp3` | 2.88 s |
| 3 | 年轻传令兵 | `prologue_young_dispatch_02` | `AudioSfx_PrologueVoiceYoungDispatch_02.mp3` | 3.12 s |
| 4 | 机枪手 | `prologue_machine_gunner_01` | `AudioSfx_PrologueVoiceMachineGunner_01.mp3` | 1.62 s |
| 5 | 年轻传令兵 | `prologue_young_dispatch_03` | `AudioSfx_PrologueVoiceYoungDispatch_03.mp3` | 2.12 s |
| 6 | 机枪手 | `prologue_machine_gunner_02` | `AudioSfx_PrologueVoiceMachineGunner_02.mp3` | 3.16 s |
| 7 | 擦枪士兵 | `prologue_rifleman_01` | `AudioSfx_PrologueVoiceRifleman_01.mp3` | 0.71 s |
| 8 | 旧伤士兵 | `prologue_old_wound_02` | `AudioSfx_PrologueVoiceOldWound_02.mp3` | 2.70 s |
| 9 | 旧伤士兵 | `prologue_old_wound_03` | `AudioSfx_PrologueVoiceOldWound_03.mp3` | 0.48 s |
| 10 | 班长与十来名年轻士兵（连续八句） | `prologue_motivation_01` | `AudioSfx_PrologueVoiceMotivation_04.mp3` | 21.21 s |
| 11 | 车外军官 | `prologue_external_officer_01` | `AudioSfx_PrologueVoiceExternalOfficer_01.mp3` | 3.65 s |

## 本批验证入口

```text
node Taierzhuang1938/Script_AmbBake.mjs TrainInteriorGenerated
node Taierzhuang1938/Script_SfxBake.mjs PrologueTrainGenerated
node Taierzhuang1938/Script_VoiceBake.mjs --prologue --force
node Taierzhuang1938/Script_AudioTest.mjs
node Taierzhuang1938/Script_VoiceTest.mjs
```

`Script_AudioTest.mjs` 会检查 40 条 SFX manifest/cue、7 条序章专用音、trainInterior preset、床首尾采样跳变（Δ ≤ 0.03）和循环续接；`Script_VoiceTest.mjs` 会强制检查 18 句对白恰好映射为 11 个音频 cue、全部锁定 `seedaudio1.0`，并断言 1:08—1:30 八句只触发一个 `continuousScene` cue；同时保留战斗 Bark 的 0.3—2.6 s 闸，并复用全声库响度/底噪闸。

---

# 章节剧情语音（2026-08-28 任务流程重制）

章节台词语音通道。规格出处：`docs/Data_MissionRemake.md` §10.2（CAST id）与 §10.3（台词→语音）。

> **2026-09-06：** 第一关到终章暂时废弃。`vo_ch2_*`–`vo_ch6_*`（281 条）已从 `Audio/` 删除、对应章的 `VOICE_LINES` 清空，`Data_Voice.mjs` 现在只拼接序章与第一关（第一关的 67 条留给 P0/P1/P2 白盒）。下文「七章 379 条」是当时的烘焙记录，不是现状。
与战场口令（下面那三十几条 Bark）**是两类活**，除了共用同一条 SeedAudio 管线与同一个
`Audio/` 目录，后期参数、挑选方式、失败行为全都不一样：

| | 战场口令 | 章节剧情台词 |
| --- | --- | --- |
| 谁喊 | 谁都行，按 `kind` 随机挑 | 只能是那个人（`who` = CAST id） |
| 怎么触发 | `Audio.Bark(kind)`，带全局与同类两道节流闸 | `beat.voice` 点名 → `Audio.PlayStoryVoice(key)`，**不吃那两道闸** |
| 变调 | ±4%，把 6 个音色摊成一个班 | 无。调一动就不是那个人了 |
| 长度 | 3—12 字，压到 Bark 的默认上限 | 整句，按字数给上限（`StoryMaxDur`） |
| 响度 | 全部齐平到 `TARGET_RMS` | 按交付档分（`VOICE_DELIVERY_MIX`），耳语必须更轻 |
| 没有音频时 | 不喊 | **纯字幕照演**（台词先写、音频后烘是常态） |

## 命名规则

- 语音 key：`ch<N>_<who>_<两位序号>`，例如 `ch3_yaowa_07`。
- 文件名：`vo_<key>.mp3`，落 `Audio/`。行里不写 `file` 时由 `Data_Voice.Normalize` 按 key 推出来 —— 别手写，写错的后果是静默 404。
- 行本体写在 `Data_MissionChX.mjs` 的 `VOICE_LINES`（章节内容批的文件），`Data_Voice.mjs` 只做拼接与体检；
  拼表时 key 命名、`who` 是否在 `STORY_CAST_IDS` 里、`delivery` 是否合法、日方是否纯假名、有无重复 key 逐条查，
  坏行会被**剔出总表**并记进 `VOICE_MERGE_WARNINGS`（`Script_VoiceTest` 断言它是空的 —— 坏行被剔掉的样子就是「台词静默消失」）。

一行的最小写法（其余字段可省）：

```js
{ key: "ch3_yaowa_07", who: "yaowa", delivery: "whisper", dur: 0, text: "这些人都没枪了……" }
```

`dur: 0` 是**必须写的占位**：烘焙完由 `Script_VoiceBake` 把实测时长写回这一行（写回的是行所在的
`Data_MissionChX.mjs`，不是 `Data_Voice.mjs`）。运行时用的是解码出来的真实时长，`dur` 只给纯 Node 侧估算用。

## 音色表

一个 CAST id 一条提示词，在 `Script_VoiceBake.CAST_VOICE_PROMPTS`；年龄/性格口径来自
`Data_MissionRemake.md` §8 人物速查。SeedAudio 这条接口没有音色 id、没有情绪参数
（pitch/speech/loudness 三个 rate 固定为 0），**音色完全靠描述词约束**，所以提示词就是演员表：

| CAST id | 人物 | 声音口径（摘要） |
| --- | --- | --- |
| `shunzi` | 顺子（玩家） | 二十出头，年轻偏干不亮，警惕木讷、话短，不油滑 |
| `luo` | 罗班长 | 三十五到四十，沙哑粗嗓男中低音，命令不容置疑，骂人是日常语气 |
| `yaowa` | 幺娃 | 十六七岁少年兵，偏亮偏细、气息浅，情绪藏不住 |
| `heyoutian` | 何有田 | 三十上下，嗓门大位置靠前、尾音上扬，带笑意的江湖气 |
| `liuwencai` | 刘文财 | 二十五到三十，嗓子紧、语速快、咬字碎，算账口吻 |
| `xiaoqin` | 小秦 | 二十出头通信兵，清亮干净、咬字清楚，报话一板一眼 |
| `zhaodegui` | 赵德贵 | 四十上下，胸腔厚、语速慢，话不多但落地 |
| `paizhang` | 负伤排长 | 三十多岁军官，有威信但气息不够用，句尾往下掉 |
| `junyi` | 军医/卫生兵 | 三十多岁，疲惫、语速快、边动手边说，情绪已磨平 |
| `s124` | 124 师伤兵 | 二十五到三十川军，气力不足、慢半拍，带建制被打散的茫然 |
| `danjiayuan` | 担架员 | 二十多岁，说话夹在喘气里，句子被呼吸切断 |
| `shangbing` | 伤员 | 重伤躺着，轻、靠后、断续，从牙缝里挤字 |
| `junguan` | 兵站军官 | 三十五上下，中低音有穿透力，急而清楚，不表演式咆哮 |
| `canmou` | 通信参谋 | 四十上下，稳、咬字清楚，复诵电文的职业口吻 |
| `wangmingzhang` | 王铭章 | 四十五到五十的川籍将领，沉毅克制，冷静追问，不慷慨陈词 |
| `ija_gunso` | 日军军曹 | 三十上下日本男性，硬、方正、操典断句；**text 必须纯假名** |

CAST id 与音色表一一对应是**硬闸**：`Script_VoiceBake` 启动时对表，缺一条直接退出（缺了不会报错，
只会把那个人换成通用四川男兵 —— 听得出来，但没人查得到原因）。

## 交付档（delivery）

与音色正交的第二层：同一个顺子要能压着嗓子说、也要能在最后一条街上吼。
四档的数值在 `Data_Voice.VOICE_DELIVERY_MIX`（烘焙与测试共读这一张表），提示词在
`Script_VoiceBake.DELIVERY_PROMPTS`：

- `normal` —— 常态对白；
- `shout` —— 战场急喊（与战斗口令同一档音量）；
- `whisper` —— 第三关摸到救护点外那一段的耳语。**必须比常态轻**：拉齐了就是「压低声音地大喊」，
  玩家是靠音量差听出「现在不能出声」的。atempo 上限也压到几乎不动，气声被拉快会先碎；
- `weak` —— 负伤、临终、脱力。同理不许抬齐。

**惨叫、哭嚎、纯痛呼不走 TTS。** 非语言的嗓音模型做不像（`hurt_scream` 那一条的教训在下一节），
这类行写 `sample: { item, path, credit, maxDur }` 从免版税素材库取真人录音。按新剧本，
以下位置已知需要走实录，内容批写到时直接标 `sample`，不要让 SeedAudio 去演：

- 第三关前沿救护点：处决段的短促惨叫（§4 阶段 7）；
- 第三关/第四关：大出血伤员的痛呼（有词的呻吟仍可走 `weak` 档 TTS，纯「啊——」走实录）；
- 第四关：罗班长中弹瞬间的闷哼。
- 有词的怒吼（顺子最后那四句、幺娃的「日你先人！」）走 `shout` 档 TTS —— 那是台词，不是惨叫。

## 烘焙命令

```powershell
node Taierzhuang1938/Script_VoiceBake.mjs --story          # 七章全部剧情台词（只烘没有音频的）
node Taierzhuang1938/Script_VoiceBake.mjs --chapter=3      # 只烘第三关那一章
node Taierzhuang1938/Script_VoiceBake.mjs ch3_yaowa_07 --force   # 单条重烘
node Taierzhuang1938/Script_VoiceBake.mjs --story --dry    # 只看要烘哪些、各自什么档，不花钱
```

密钥只从 `VOLCENGINE_API_KEY` 环境变量读，绝不进仓库、日志或截图。

**短句的两条闸都改过（2026-08-28 实测「晓得。」踩出来的）：**

1. **响度要量成品，不量中间产物。** 原来按 stage.wav 一次性写死增益，成品从不回看；
   一条 0.6 s 的短话目标 −16.1 dBFS，出来是 −13.4。病根不是 mp3，是**有声段 RMS 在短句上本来就不稳**
   （20 ms 帧格与句子起点对不齐，30 个帧里换掉一两个就是好几分贝，和 loudnorm 在短句上不准是同一个道理）。
   现在按成品实测值补差、从同一份 stage 重编，**永远只有一代 mp3**。
2. **底噪要量原始 take，不量削完静音的成品。** 削掉首尾静音之后，短句里一格静音都不剩，
   第 8 百分位量到的是最轻的那个人声帧（实测 −23 dB），干净的一条会被判成「有房间声」，
   白重摇两次还差点被 `afftdn` 啃掉辅音。短于 `FLOOR_MIN_S` 的成品改从原始 take 上量
   （`NoiseFloorRaw`：先扔掉数字静音，取最轻的**真实**信号，再按施加的增益折算），
   并且短句一律不做降噪 —— 0.4 s 的音里没有可供建模的噪声段。

## 烘焙记录：V1 全量（2026-08-29）

七章 379 条 `kind: "story"` 全部烘出，成品总长 11 分 30 秒，缺失 0、`dur: 0` 0。

| 章 | 条数 | 总时长 | 平均时长 | normal / shout / whisper / weak 实测均值（dBFS） |
| --- | ---: | ---: | ---: | --- |
| ch0 | 31 | 1m18s | 2.52s | −16.1 / −16.0 / −22.1 / — |
| ch1 | 67 | 2m27s | 2.19s | −16.1 / −16.1 / — / −19.1 |
| ch2 | 29 | 0m39s | 1.33s | −16.0 / −16.1 / −21.9 / −19.1 |
| ch3 | 70 | 2m17s | 1.95s | −16.1 / −16.1 / −22.0 / −19.1 |
| ch4 | 96 | 2m36s | 1.62s | −16.1 / −16.1 / −22.1 / −19.0 |
| ch5 | 54 | 1m6s | 1.23s | −16.1 / −16.1 / — / −19.0 |
| ch6 | 32 | 1m7s | 2.10s | −16.0 / −16.1 / — / — |

四档分离干净（耳语比常态轻 6 dB，虚弱轻 3 dB），没有一条判死。

**火山引擎有并发配额，且超了不排队、直接丢件。** 七章并行时回
`HTTP 429 {"code":45000292,"message":"quota exceeded for types: concurrency"}`，
实测同时 5 个进程干净、7 个就开始报。**要命的是管线对这个错误的处理是 `break`** ——
那一条不重试、直接跳过，一轮下来 ch0 丢了 29 条、ch6 丢了 32 条，日志里只有一行 `✗`。
重跑一遍会补上（已有文件按 `Has()` 跳过），但**别拿并行换速度换过头**：三路以内是安全的。

**`Encode()` 里 `SpeechStats(dst)` 没有保护，一条坏 take 会崩掉整个进程。**
`silenceremove` 偶尔会把一条 take 整个削光（实测 `ch4_s124_02` 的 stage.wav 只剩 78 字节），
接着编出一个 237 字节的废 mp3，`execFileSync` 抛异常直接掀桌。代价不是那一条 ——
是 **`WriteDurations` 在进程末尾才跑**，于是那一轮已经烘好的行全变成「文件在盘上、`dur` 还是 0」
（实测一次崩掉丢了 80 条的写回）。崩完还会在 `Audio/` 留下一个无法解码的 mp3，
下一轮按 `Has()` 当成「已烘」跳过 —— **补烘前先扫一遍能不能 ffprobe 解开，解不开的删掉再跑。**

**烘焙侧与测试侧的量法不是同一个采样率，耳语最容易被这条坑到。**
`Script_VoiceBake` 解到 16 kHz 量，`Script_VoiceTest` 走浏览器 `decodeAudioData`（48 kHz）。
算法一样，但有声闸是 `peak × 0.1` —— 带宽一变闸就变，动态大的句子两边能差 4 dB
（实测 `ch3_xiaoqin_04` 耳语：16 kHz 量 −22.0 正中靶心，48 kHz 量 −18.2 直接出档）。
**验收要按 48 kHz 量**，否则会出现「烘焙侧全绿、测试侧翻红」。同理，幺娃那种偏亮的
少年声在 48 kHz 上第 8 百分位会被自己的气声顶到 −32 dB 左右，看着像房间声，其实不是。

**模型会在句中标点上停很久，管线不管这一段。** `silenceremove` 只削首尾，
`StoryMaxDur` 按字数给预算又发现不了空洞：379 条里内部静音超过 1 秒的有 46 条，
最长的 `ch4_heyoutian_02`「我姐屋头那棵桃树，也该开了。」全长 4.39 s 里有 2.80 s 是空的。
抒情句尚可当作留白，`ch3_ija_gunso_03`「しなへいだな。ばんごうをいえ。」中间空 1.98 s
就明显是断了。**下一轮要收的话，收在这里，不要去动响度。**

### 2026-08-29 抛光批 P3：收了 20 条，留了 7 条

按上面那条口径逐条判过一遍。判据不是「有没有停」，是**停在不在标点上、剩下的字够不够念**：

- **留**：停顿落在原文写着的「……」或逗号上，且去掉停顿之后的语速仍在 3—5 字/秒。
  `ch1_shangbing_02`「狗日的小日本……连躺起的人都不放过。」1.66 s 正落在那个省略号上，
  一个躺着的伤兵说这句话本来就要喘一口；`ch0_shunzi_05` / `ch0_shunzi_07` 是耳语独白，
  `ch6_canmou_03`「小秦，东关是个啥子情况？」是叫完名字等人应声。这些不是断，是句读。
- **收**：停顿不在标点上，或者剩下的字被挤到 6—9 字/秒（模型把时间花在了空白上）。
  `ch4_shunzi_16`「再包一道。他刚才还在喘。」2.99 s 里空掉 1.70 s，12 个字塞进 1.29 s；
  `ch1_luo_03`「莫等他走拢！打！」是喊话，中间空 1.00 s 等于把命令拆成两句。

全表 20 条重烘，句中最长静音 **24 条 >1 s → 7 条**（>0.8 s 55 → 39）。
7 条里 6 条是上面「留」的那一档，第 7 条是 `ch4_ija_gunso_01`。

**重烘是掷骰子，不是修复 —— 必须留候选池。** `Script_VoiceBake` 一次调用内部最多摇 3 条 take，
但它**按底噪挑**，不看句中静音；也就是说每跑一次只是抽一次样，而且**新的直接盖掉旧的**。
第一轮 20 条里有 3 条（`ch4_ija_gunso_01` 1.50→2.78 s）被摇得比原来更差。
正确做法是每摇一轮先把成品拷进候选池，最后按静音挑一条装回去，
再按 `WriteDurations` 同一条正则把 `dur` 写回 `Data_MissionChX.mjs`
（**别手算 `dur`**：管线用的是 `ffprobe format=duration` 四舍五入到两位）。

**日语两句一顿的那条收不动。** `ch4_ija_gunso_01`「とまれ。おとをたてるな。」摇了 9 条，
最好的一条仍有 1.10 s（从 1.50 s 降下来）。句号在中间、又是耳语，模型每次都在那儿断开。
1.10 s 上留住了 —— 一个日军军曹压着嗓子先喝「站住」再补「别出声」，中间隔一拍并不假，
再摇下去只是烧钱。**要真收干净得改词**（把两句并成一句），那是台词的事，不是烘焙的事。

## 运行时：从 beat 到声音

```
Data_MissionChX.beats[i].voice = "ch3_yaowa_07"
  → Script_Story.Play()  ── beat.voice 存在就调宿主回调
  → StoryDirector.AttachVoice(playFn) 注入的 playFn({ key, who, position })
  → Script_Audio.PlayStoryVoice(key, { position })
  → RECIPES["voice.ch3_yaowa_07"]（与音效共用 Panner / 空气低通 / 混响 / 预算闸）
```

- **定位说话人是宿主的事**，不是叙事层的：Story 手里没有场景、没有演员表位置，只报 `who` 与 `key`。
  宿主可以传对象形式 `AttachVoice({ play, locate, stop })`，`locate(who)` 给世界坐标、`stop()` 换关时掐掉上一句。
- **单槽**：`PlayStoryVoice` 播新的之前先停旧的（不叠成两个人同时说话）。
  排队的那一半在 Story 侧：带语音的一条会按音频时长把下一条压住（`VOICE_HOLD_MAX` 封顶），
  所以正常节奏下根本轮不到「顶掉」，它只是最后一道保险。
- **字幕跟着语音走**：字幕停留取「默认时长」与「音频时长 + 尾巴」的**长者**（`SUBTITLE_MAX` 封顶）。
  反过来不成立 —— 音频短不代表字幕可以更短，字幕有自己的可读下限。
- **位置只用于空间化，不用于丢句子**：说话人超出人声剔除半径就退化成非空间化播放。
  一句「顺哥！机枪停了！」本来就是从街那头喊过来的，被距离闸丢掉等于剧情丢了。
- 剧情台词**进不了 Bark 的随机池**（`kind === "story"` 在挑选时直接跳过），只能点名。

## 降级链（每一层都不许报错阻塞）

| 情况 | 行为 |
| --- | --- |
| beat 没写 `voice` | 纯字幕，与改造前逐字等价 |
| 宿主没接 `AttachVoice` | 纯字幕，默认字幕时长 |
| 那条还没烘出音频（404） | 纯字幕；`LoadVoices` 对 `kind:"story"` **不重试**（几十条未烘焙 = 开机几百个白等的请求），失败计入 `voiceErrors` |
| 宿主回调抛异常 | 吞掉、记进 `StoryDirector.VoiceMisses`、字幕照出 |
| 玩家关了语音 / AudioContext 没解锁 | 同上，纯字幕 |

取证口：`StoryDirector.VoicedCount` / `.VoiceMisses`（这一关点了名却没响的 key）、
`AudioEngine.storyVoiceKey`（此刻槽里是谁）。

## 本节验证入口

```powershell
node Taierzhuang1938/Script_VoiceBake.mjs --story --dry
node Taierzhuang1938/Script_TestRunner.mjs --domain-only=voice
```

`Script_VoiceTest.mjs` 除原有的声库闸外，还验：章节台词拼表零告警、剧情行进不了随机池、
`PlayStoryVoice` 点名能播且不吃节流闸、单槽顶掉、缺音频返回 null、`beat.voice` 把 key 与说话人交给宿主、
字幕不早于音频结束、没接线/宿主抛异常都只降级成纯字幕。
剧情台词的响度按各自交付档验（不并进战场口令那条「散布 ≤ 2.5 dB」的平线）。

---

# 音效：从「全部合成」换成「实录采样盖在合成上」

2026-08-19。此前这个项目的 32 个音效全部是 WebAudio 现场合成的（`Script_Audio.mjs`
的 `RECIPES`）。合成那套一行没删，现在只是被一层实录素材盖住了。

## 为什么换

合成的长处很实在：零加载、零 404、完全确定性，二十条枪靠随机种子抖出二十种。
但它有一条过不去的坎 —— **枪声的瞬态是炸开的空气，不是包络**。
噪声过带通再削顶，出来永远是「啪」，不像「炸」；一整场听下来是二十个合成器在响，
不是二十支枪在打。爆炸、入肉、倒地同理：这些声音的信息量在瞬态的微结构里，
不在包络的形状里，而节点图能控的只有包络。

复读的问题（同一个 wav 反复播会露馅）在采样层用**多变体 + 逐发 ±3% 变调**解掉，
和合成版靠随机种子取噪声偏移是同一条思路：**随机来自播放时，不来自素材**。

**但这条只对「没人挑过的音」成立。** `SAMPLE_CYCLE` 里那几个 cue（白刃三音）走另一套：
**按顺序轮播、且不做逐发变调**。它们的变体是人工一条条试听选定的，随机挑会连出两次
同一条 —— 恰恰是挑三条想避免的事；±3% 变调则会把选中的音色拧走（0.2 秒的破风声
听得出来）。挑过的音要的就是它本来的样子，别拿概率去糊。

## 素材来源与许可

| 来源 | 许可 | 用途 |
| --- | --- | --- |
| [Sonniss GDC Game Audio Bundle](https://archive.org/details/sonniss.com-gdc-game-audio-bundles)（2015—2026 历届，archive.org 镜像） | 免版税，可用于商业与非商业项目 | 除军号与哨子以外的全部 |
| [Wikimedia Commons](https://commons.wikimedia.org/) | 军号为美国政府作品（PD）；哨子为 CC0 | `bugleTone` / `whistle` |

Sonniss 的许可不要求署名，但 `Data_SfxSources.mjs` 仍然逐条记着厂商与型号 ——
**那是选材的依据**，不是法务义务：K98k 之所以能当中正式，是因为它就是 7.92×57 毛瑟。
换成别家的「设计音」这条理由立刻不成立。

## 选材的三条硬标准

1. **口径与枪机对得上。** 中正式＝毛瑟标准型的中国版，同弹同枪机 → K98k 实录；
   三八式 6.5×50「又尖又脆」→ .30-06 的 M1903A3 升调 10%；九二式重机 7.7mm 慢速 →
   M1919A4（同为弹链供弹的中型机枪，且录的是**架在枪架上**那版，为的是每发后面
   那记金属余振 —— 重机与轻机在听感上真正的分界是它，不是射速）；
   捷克式 ZB-26 → L7A2 GPMG 7.62 单发（同为全威力弹的班用自动武器）。
2. **只切单发，射速由引擎排。** 直接用一段连发录音的话，射速就被素材钉死了，
   九二式 200 rpm 的「啄木鸟」身份证会当场作废。采样版的 `SAMPLE_BURST` 与合成版
   `GunAuto` 用的是同一组史实数字。
3. **远近是两条真的录音，不是近射加低通。** 50 m 外那一枪的尾巴是环境给的，
   滤波器造不出来。

## 成品

72 个文件 / 747 KB（44.1 kHz 单声道 72 kbps MP3），在 `Audio/Sfx/`，
清单 `Audio/Sfx/Data_SfxManifest.json`。下面这张表是 2026-08-19 那一批的 33 个 cue；
2026-08-28 缺口批 A2 补的 15 个 cue 另有一张表，见本文末「重制新增音效」。

| cue | 变体 | 时长 | 体积 | 素材 |
| --- | --- | --- | --- | --- |
| `rifleNra` | 3 | 1.15 s | 28.9 KB | Pole Position Production · K98k 7.92×57 毛瑟 · Sonniss GDC 2020 |
| `rifleNraFar` | 3 | 1.50 s | 36.9 KB | FLYSOUND · 莫辛纳甘 50 m 外 · Sonniss GDC 2020 |
| `rifleIja` | 3 | 0.86 s | 22.2 KB | Pole Position Production · 斯普林菲尔德 M1903A3 · Sonniss GDC 2020 |
| `rifleIjaFar` | 1 | 0.85 s | 7.2 KB | Watson Wu · 两次大战步枪（来弹视角）· Sonniss Game Audio Monthly #3 |
| `zb26` | 1 | 0.90 s | 7.6 KB | Pole Position Production · L7A2 GPMG 7.62×51 单发 · Sonniss GDC 2016 |
| `type11` | 1 | 0.54 s | 4.7 KB | Pole Position Production · M1919A4 .30cal · Sonniss GDC 2016 |
| `type92` | 1 | 0.92 s | 7.8 KB | Pole Position Production · M1919A4 .30cal（枪架）· Sonniss GDC 2016 |
| `shellDrop` | 3 | 0.99 s | 24.6 KB | SculpTunes · 弹壳落在水泥地上（户外）· Sonniss GDC 2020 |
| `bolt` | 1 | 1.25 s | 10.2 KB | Pole Position Production · M1903A3 拉栓 · Sonniss GDC 2020 |
| `stripperLoad` | 1 | 1.10 s | 9.2 KB | Pole Position Production · K98k 操作音 · Sonniss GDC 2020 |
| `magIn` | 1 | 0.65 s | 5.6 KB | Dramatic Cat · 步枪弹匣入位 · Sonniss GDC 2024 |
| `grenadePin` | 1 | 0.60 s | 5.1 KB | TS Sound · 火柴摩擦点燃 · Sonniss Game Audio Monthly #4 |
| `grenadeThrow` | 1 | 0.55 s | 4.9 KB | David Dumais Audio · 重挥破风 · Sonniss GDC 2020 |
| `explosionNear` | 3 | 2.40 s | 57.6 KB | Bluezone Corporation · 城区爆炸 · Sonniss GDC 2023 ／ Gamemaster Audio · 近距爆炸（偏亮 / 偏闷长尾）· Sonniss GDC 2017 |
| `explosionFar` | 1 | 2.60 s | 20.9 KB | Gamemaster Audio · 远处爆炸 · Sonniss GDC 2017 |
| `shellIncoming` | 1 | 2.00 s | 16.2 KB | Bluezone Corporation · 炮弹飞行啸声 · Sonniss GDC 2020 |
| `shellImpact` | 1 | 2.80 s | 22.5 KB | Coll Anderson · 野外迫击炮爆炸实录 · Sonniss GDC 2015 |
| `launcherPop` | 1 | 0.90 s | 7.6 KB | Bluezone Corporation · 榴弹发射 · Sonniss GDC 2023 |
| `dadaoSwing` | 3 | 0.55 s | 11.1 KB | Volcengine SeedAudio 1.0 · 大刀挥空（木质厚实 / 长嘶 / 刃嘶明亮）|
| `dadaoHit` | 1 | 0.67 s | 5.8 KB | Volcengine SeedAudio 1.0 · 大刀砍入人体 |
| `bayonetHit` | 1 | 1.37 s | 11.3 KB | Volcengine SeedAudio 1.0 · 刺刀刺入拔出 |
| `impactBrick` | 3 | 0.33 s | 12.2 KB | Gamemaster Audio · 弹着砖石 · GDC 2017 ／ PMSFX · 青砖碎裂 · GDC 2020 |
| `impactDirt` | 1 | 0.42 s | 3.9 KB | PMSFX · 弹着夯土 · Sonniss GDC 2020 |
| `impactWood` | 2 | 0.45 s | 8.7 KB | Double Trouble Audio · 木料受击（软/硬两条）· Sonniss GDC 2017 |
| `impactMetal` | 1 | 0.75 s | 6.4 KB | Gamemaster Audio · 弹着厚金属 · Sonniss GDC 2017 |
| `impactFlesh` | 1 | 0.50 s | 4.5 KB | PMSFX · 弹着人体 · Sonniss GDC 2020 |
| `footstepDirt` | 2 | 0.40 s | 7.4 KB | PMSFX · 土路单步 · Sonniss GDC 2019 |
| `footstepRubble` | 4 | 0.40 s | 14.9 KB | Studio 23 · 碎石路行走 · Sonniss GDC 2019 |
| `bodyFall` | 1 | 1.10 s | 9.2 KB | Red Libraries · 人体倒地（土地面）· Sonniss GDC 2019 |
| `hurt` | 2 | 0.58 s | 8.7 KB | Articulated Sounds · 男性痛呼 · GDC 2019 ／ 344 Audio · 士兵闷哼 · GDC 2020 |
| `heartbeat` | 1 | 0.70 s | 6.0 KB | Airborne Sound · 心跳 · Sonniss GDC 2018 |
| `bugleTone` | 1 | 1.00 s | 8.4 KB | U.S. Marine Corps 军号（PD）· Wikimedia Commons |
| `whistle` | 1 | 0.90 s | 7.6 KB | SpliceSound · 哨子（CC0）· Wikimedia Commons |

变体多的那几条不是随便给的：**每秒都在响的音必须多变体**（脚步、弹着砖、
中弹闷哼、步枪），一个固定样本循环起来就是机关枪。

### 白刃三音为什么是生成的，不是实录的

其余全部是实录，只有白刃这三条走火山引擎 SeedAudio 生成（2026-08-26 换掉）。
原因不是 Sonniss 里没有冷兵器音，是**兵器不对**：斧子入肉比大刀钝、西式利刃刺入
比三八式刺刀细，而白刃是这场仗的招牌动作，借来的音站不住。挥空那条尤其顶不住，
人工试听两轮才定。

提示词有一条反直觉的经验：**挥空音里一个字都不能提「大刀」**。直接说大刀，模型
两次都塌成两个极端 —— 要么全是 7 kHz 的嘶嘶（像喷气罐），要么全是 300 Hz 以下的
低吼（像一阵闷风）。有效的写法是描述拟音师真会做的事（竹竿 / 木棍抽过空气），
再补三句硬约束：点名中频、给时长、给包络（「由弱迅速涨到最强再立刻消失」）。
验收看两个数：`120 Hz–2 kHz 能量占比 ≥ 60 %`，包络是**一道弓形**（只有一个峰）。

挥空给三个变体是因为它是**连续动作**：连砍两下用同一个样本立刻露馅。三条**按顺序
轮**着出（`SAMPLE_CYCLE`），不是随机挑 —— 随机会连出两次同一条。砍中与刺中各一条，
就是人工选定的那条，原样播。这三个 cue 一律**不参与 ±3% 逐发变调**。

音量对齐的是**响度不是峰值**。这几条 take 从模型出来就比库里其它音「实」得多
（波峰因数 13—17 dB，实录冲击音是 19—27），按峰值归一会比 Sonniss 那批**响 13 dB**，
白刃一出手就盖住整场枪声，而 `SAMPLE_MIX` 里那几个数是照旧素材调的。所以烘焙时把每条
压到全库中位响度 −28.5 dBFS，再留一道 −6 dBFS 的峰值保险 —— 五条落在 −28.4—−28.6，
`SAMPLE_MIX` 一个数都不用动。另有一个坑：72 kbps 单声道编宽带噪声，**解出来的 RMS 会比
编码前高 2—3 dB**，所以要量成品自己再补一刀，不能只量编码前。

烘焙走 `Script_SeedAudioMeleeBake.mjs`，与 `Script_SfxBake.mjs` 分开：
**take 是人工试听选出来的，重掷不可复现**，所以它默认不调接口，只拿
`Audio/Sfx/_raw/SeedAudioMelee_*.mp3` 重新转码；take 缺失时宁可报错也不覆盖成品。
`--force` 才重新生成，会换掉已验收的音。take 另有一份归档在
`OneDrive\Sync\饮河\FPS\音频提取\刀具相关\`。

```bash
node Taierzhuang1938/Script_SeedAudioMeleeBake.mjs --dry
node Taierzhuang1938/Script_SeedAudioMeleeBake.mjs
```

## 冲锋号是特例：只借音色，不借号谱

军号取的是《Last Post》里一个**持续单音**，烘焙时用自相关量出基频
（实测 495.5 Hz，置信 1.00 —— 一支 G 号的 B4），引擎照它算 `playbackRate`，
按 `BUGLE_CHARGE` 那张中方动机表排出整段。

直接播一段美军 Charge 号会是另一支军队在冲锋。反过来，合成版的军号音色又
一直像风琴。所以拆开：**音色来自实录，调子仍归自己**。

也是因此，`Assembly bugle call` 这条素材被换掉了：它是 0.35 秒一个的短音，
切出来必带下一个音的头，量基频会量到两个音的混合（实测 398 与 497 Hz 各一半）。

## 重新烘焙

```bash
node Taierzhuang1938/Script_SfxBake.mjs            # 全量（缺素材就下载）
node Taierzhuang1938/Script_SfxBake.mjs K98k BAR   # 只烘这两组
node Taierzhuang1938/Script_SfxBake.mjs --report   # 只打候选起音点表，不落文件
node Taierzhuang1938/Script_SfxBake.mjs --recut    # 不下载，只重切
```

原始长片落在 `Audio/Sfx/_raw/`（已 gitignore，3 MB，切完就没用了）。
出网要经 `HTTP_PROXY`，所以下载走 `curl` 而不是 node 的 `fetch`——
undici 默认不认代理环境变量，`fetch` 会直接 Connect Timeout。

## 切割踩过的四个坑

1. **回退起音点必须封顶。** 原本「一路退到底噪附近」，遇到连发时每一发都会退到
   整串的第一个起音上，三发挑出来是同一份；`pick:"last"` 拿到的还是第一发，
   切出来是整串三响。现在最多退 24 格（120 ms）。
2. **衰减区间是硬筛。** 不加的话会挑出 0.05 秒的咔哒声当「落地声」——
   枪管里的机械动作也是个陡起音，打分比真正的枪响还高。
3. **连发素材抠不出干净的单发。** BAR 那条「双发」里第一发的尾巴压着第二发，
   抠出来的 zcr 只有 152（全是低频轰声），听着像闷炮不像机枪。
   换成本身就是单发的 L7A2 素材之后 zcr 3187。**能换素材就别调参数。**
4. **自动挑法在机械音上不可靠。** 拉栓、压弹、弹匣、掷弹筒这几条改用 `atS`
   直接钉死素材里的秒数 —— 先跑 `--report` 看候选表，看准了钉一个位置，
   比反复调阈值可靠得多。

## 验收

```bash
node Taierzhuang1938/Script_AudioTest.mjs
```

断言：清单 33 个 cue、33 条全部盖住合成配方、载入零报错、军号基频在 495.5 Hz
附近、逐条播得响、配方零异常、九二式 5 发点射真的按 200 rpm 排开。

音效的失败是**静默**的（404 → 吞掉退回合成 → 画面照跑、控制台干净），
所以这一层必须单独断言，开机冒烟与通关冒烟都测不出来。

烘焙侧我听不见，靠的是**看**：波形 + 对数频谱贴图逐条过一遍，
再配 peak/RMS/起音时间/过零率四个数。上面第 3 条就是这么发现的。

---

# 环境床：从「棕噪 + 撒枪声」换成分层实录

2026-08-20。这一层与音乐一起整个推倒重做了。

## 旧版错在哪

旧的环境床是三样东西：**棕噪过一个慢慢晃的低通**当风，一个每 0.4 秒掷骰子
撒远处枪声的调度器，以及夜里的合成蟋蟀（4.3 kHz 正弦被 27 Hz 方波门断开）
与黎明的合成鸟（振荡器扫频）。三条毛病，每一条都致命：

1. **噪声不是风。** 风是一团有结构的湍流，低通扫得再慢也只是「开着的嘶声」。
   玩家听到的是底噪，不是户外。
2. **战场没有底。** 真实的围城是一层**一直在响的远方** —— 几公里外的炮口连成
   一片闷雷，间杂人声。旧版只有稀疏的单发枪声撒在静音上：每一发都突兀，
   合起来还是安静的。**氛围不对的根子在这儿。**
3. **合成的虫和鸟是电子音**，而且季节还错了。滕县战役是 1938 年 3 月 14—17 日，
   华北平原刚开春，夜里在零上下 —— 蟋蟀要到五月才叫。

还有一条不算「音」的错：`Script_Main` 里写的是
`night ? "night" : dawn ? "dawn" : "battle"`，于是「烟尘白天」和「烧着的街」
共用同一档环境。**第五关满街在烧，却听不见火。**

## 现在的结构

一档环境 = **2—3 条实录的床** + 撒在上面的一次性音。档名与天空预设同名
（`Script_Sky` 的 `SKY_PRESETS`），关卡切场直接把 `phase.sky` 递进去。

### 2026-08-29｜默认环境改为无人声、以冷风为底

人工试听否决了把战斗人群当作「一片战场」的做法：即使压低和低通，仍会留下难听、
不可定位的人声噪杂。当前所有默认 preset 因此只用风、远炮、火与环境事件；
`windPlain` 是开阔战场的默认底，并且整组床的运行时增益已经下调，给实际枪声、脚步与剧情台词留出位置。

`battleFar`、`crowdFar` 与 `amb.moanFar` 保留在素材包和清单里，便于未来某段**明确审核过的**剧情单独调用；
它们不再由任何默认 preset 自动播放。

| 床 | 用在哪 | 素材 |
| --- | --- | --- |
| `windPlain` | 城外 / 城墙上 | Systematic Sound · 开阔平原风与深处低鸣 · GDC 2024 |
| `windStreet` | 巷战 | Articulated Sounds · 街道强风、枝叶与吱呀 · GDC 2020 |
| `windNight` | 夜（**无虫**） | Systematic Sound · 夜间林地，风与枝叶 · GDC 2024 |
| `dawnField` | 黎明 | Fox Audio · 乡野白天，公鸡与鸟 · GDC 2018 |
| `battleFar` | 素材包保留，默认不播放 | Coll Anderson · 持续交火中的人群 · GDC 2015 |
| `crowdFar` | 素材包保留，默认不播放 | Coll Anderson · 人群骚动 · GDC 2015 |
| `shellingFar` | 远处的炮火（**叠出来的**） | Pole Position · 远处火炮 · GDC 2017 |
| `fireNear` / `fireFar` | 烧着的街 | Pole Position · 房屋大火（近 / 弱）· GDC 2018 |

素材包的一次性音有 9 条：`amb.cannonFar` `amb.whizz` `amb.crow` `amb.dogFar` `amb.rooster`
`amb.creak` `amb.debris` `amb.planeFar` `amb.moanFar`；默认 preset 不调度最后那条人声素材。
它们**注册成新的配方**（与人声采样同一条路子），于是去重、预算闸、声像、
混响 send 这一整套原封不动地复用。与音效包不同的是：这些 cue 没有同名的合成
配方可盖，**载不到就是没有** —— 一只合成的乌鸦比没有乌鸦更糟。

成品 18 个文件 / 1.5 MB，在 `Audio/Amb/`，清单 `Data_AmbManifest.json`。

## 三条选材标准

1. **季节与纬度对得上。** 要的是华北平原早春：叶子还没长出来、干、冷、旷。
   宁可用「冬末的开阔地」也不要「春天的树林」—— 鸟一多、树叶一响，
   滕县立刻变成度假村。
2. **默认环境不使用人声。** 旧版曾尝试把 Coll Anderson 的战斗人群低通到听不出语言，
   但人工试听仍然觉得嘈杂；这些素材现仅保留在库内，不进入任何默认 preset。
3. **一次性音要真的是一次性音。** 狗吠、乌鸦、公鸡都从**单独录的素材**里切，
   不从别的环境录音里抠 —— 抠出来必带原录音的底噪，叠上去就是两层空气打架。

## 「不许贴循环样本」这条旧规矩，是记错了帐

上一版的注释写着「三十秒的战场循环听两遍就露馅」。露馅的不是「用了循环」，
是「每一圈都从同一个地方开始」。这一版**根本没有循环点**：

每条床同时挂两条播放头（`Script_Audio` 的 `LoopLayer`），各自从素材里的
**随机位置**起播，放十来秒就等功率交叉淡到下一个随机位置去。一条 23 秒的素材
因此永远不会以同样的方式接第二次，也不必把首尾烘成无缝 ——
顺带绕开了 MP3 的编码器补零（那玩意儿会让任何「无缝 loop」在接缝处咔一下，
而且不同浏览器补的量还不一样，没法在烘焙期抵消）。

代价是常驻 4 个节点/层。为此每条床都不开 panner（素材本身就是立体声，
宽度已经在里面了），四层封顶 —— 实测峰值 8 个常驻节点，冒烟里钉了 24 的上限。

## 床怎么挑：找「最无聊」的一段

打分是**负的**：电平方差越小越好、峰值离中位数越近越好（一段里混进一记关门声，
循环起来每 N 秒就砸你一下）、也不能挑到静音段。三条都能算，所以不必靠听。
实测挑出来的窗口方差 0.8—3.6 dB。

**`shellingFar` 是例外，它是叠出来的。** 那条素材本身一响一停（整条最平稳的一段
方差也有 31 dB），直接切一段当床就是「每 17 秒放一次同一记炮」。连绵的闷雷得自己
混：26 记真炮响随机错开时间叠起来，尾巴互相搭上，再低通到 420 Hz。
电影里那层连绵的炮声本来就是这么混的。

## 切一次性音踩到的三个坑

1. **冲头必须落在开头。** 起音回退会认错前面一个轻微的上升沿，切出来是
   「前面一秒无关声 + 真正的炮响」—— 实测远处火炮三个变体里两个峰值在 1.2 s
   之后。现在切完还验一道 `peakBy`（默认前 30%），不合格就换下一个候选。
   飞机通场是例外（本来就是慢慢涨上来的），单独放宽到 70%。
2. **弹啸的衰减是几毫秒。** 按别的音效那套 `decay >= 0.05 s` 起筛，会把真正的
   超音速音爆全筛掉，只剩跳弹的嗡鸣。这条的下限给到 4 ms。
   同时 `tail` 从 0.9 s 收到 0.32 s —— 素材是机枪朝镜头打，留长了会把整梭子
   都切进来（0.9 s 的版本里数得出 14 个冲头），四个变体听着一模一样。
3. **公鸡打鸣不能用起音检测切。** 那是「喔——喔喔——喔」好几个音节，
   起音检测只会切到第一节。这条走 `whole`：削掉首尾静音，整条用。

## 重新烘焙

```bash
node Taierzhuang1938/Script_AmbBake.mjs               # 全量（缺素材就下载）
node Taierzhuang1938/Script_AmbBake.mjs MeadowPlain   # 只烘这一组
node Taierzhuang1938/Script_AmbBake.mjs --report      # 只打候选表，不落文件
node Taierzhuang1938/Script_AmbBake.mjs --recut       # 不下载，只重切
```

---

# 音乐：从四条合成配方换成九段授权／生成曲

## 为什么整套删掉，而且不留合成兜底

旧的音乐是四条 WebAudio 配方（低音提琴式持续音 + 「简化铜管」+ 独奏弦 + 军鼓），
音高按 D 小调五声骨架排。思路没问题，出来的东西不行 ——
**一个振荡器过低通，包络写得再细也是电子管风琴**。铜管的「亮」是起音时冲上去
再回落，这个能仿；铜管真正的身份在吹嘴的噪声、管壁的共振、每次起音都不一样的
那点不稳，这些不是包络能给的。

整套删了，**没有留合成兜底**：载不到就是没有音乐。
**没有音乐的战场仍然是能打的战场，走调的配乐不是。**

顺带修掉的一处：旧版四个 cue 里**三个从来没进过游戏** ——
`audio.Music()` 全项目只有结局那一处调用。现在按关走（`Data_TengxianScript`
的 `music` 字段 → `PHASES` → `Script_Main`）。

## 素材从哪来

已试听确认的六段保留授权来源；不合适的夜间、战后和城墙三段改用火山引擎
`seed-audio-1.0`。`Script_SeedAudioMusicBake.mjs` 通过本项目账户直连
`https://openspeech.bytedance.com/api/v3/tts/create`，密钥只读环境变量
`VOLCENGINE_API_KEY`，原始 take 只留在系统临时目录。提示词与用途逐条记在
`Data_MusicSources.mjs`，最终来源也写入 `Data_MusicManifest.json`。

| cue | 用在哪 | level |
| --- | --- | --- |
| `menu` | 出川过场 | 0.55 |
| `siege` | 白天四关，垫在枪炮底下 | 0.30 |
| `tension` | 夜里入城 | 0.38 |
| `charge` | 夺回东关门、北门突围 | 0.60 |
| `aftermath` | 结局 | 0.62 |
| `wallPressure` | 城墙攻防，压在枪炮声下 | 0.24 |

成品 9 段，在 `Audio/Music/`，清单 `Data_MusicManifest.json`。

## 提示词的三条经验

* **先写场景里的声音关系，再写乐器。** 夜间曲让脚步和警戒声优先；战后曲不许
  写成悼念表演；城墙曲只承托远炮与石墙压力，不能另起一段英雄旋律。
* **反向约束必须具体。** 明确排除人声、鼓点、锣、唢呐、流行和弦与现代合成器，
  避免生成结果滑向宣传进行曲或影视预告片。
* **把生成 take 烘成固定时长。** SeedAudio 的 take 不作为直接部署文件；脚本以
  `-stream_loop` 延展、削高低频、统一电平，并首尾淡化后才交给运行时 `LoopLayer`
  交叉循环。

## 切段与播放

外部授权曲由 `Script_MusicBake.mjs` 切取稳定段；三段 SeedAudio 曲由
`Script_SeedAudioMusicBake.mjs` 从原始 take 烘成固定循环长度。两条链路都只把
最终 MP3 放进仓库，生成原始文件不进 Git。

播放复用环境床那个 `LoopLayer`，只是把随机起播点关掉（曲子必须从头放），
首尾各留 3.2 秒交叉淡，循环点因此听不出来。切 cue 是**交叉**不是硬切：
旧的淡出 1.6 秒，新的立刻淡入 —— 硬切在战斗里特别刺耳，玩家会以为自己把什么按坏了。

```bash
node Taierzhuang1938/Script_MusicBake.mjs           # 切（原曲要在 Audio/Music/_raw/）
node Taierzhuang1938/Script_MusicBake.mjs --fetch   # 下载登记的外部授权曲
node Taierzhuang1938/Script_SeedAudioMusicBake.mjs --dry
node Taierzhuang1938/Script_SeedAudioMusicBake.mjs --force
```

## 这两层的验收

```bash
node Taierzhuang1938/Script_AudioTest.mjs
```

在音效那 7 条断言之外又加了 11 条：三个包各自载入零报错、床与一次性音的数量对得上、
**每一档环境引用的床与配方条条都存在**（写错一个名字那一层就悄悄地少了，游戏照跑）、
逐档切一遍层数对不对、切走之后节点归零、五段音乐都能起播、停掉之后节点归零，
以及最要紧的一条 —— **床跨过两个交叉淡周期之后播放头还在、且没有越积越多**，
这是「循环有没有断、有没有泄漏」唯一的机器判据。

烘焙侧仍然靠**看**：波形 + 对数频谱贴图逐条过，配 时长/峰值位置/起音数/峰比中位
四个数。远处火炮的冲头在 1.2 s 之后、弹啸切成了整梭子机枪，都是这么看出来的。

**我听不见 —— 这两层里「像不像那个年代的华北」「二胡是不是二胡」这类判断，
机器测不了，得你来听。**


---

# 混音层：修「一打起来就充斥着不知道哪儿来的、带拖尾的音效」

2026-08-20。玩家的原话是「像是带有拖尾/延长一样的感觉，而且是很多音效杂糅在一起」。
**素材一条都没问题，坏的是它们怎么被送到耳朵里。**

## 怎么量

把 `AudioEngine.Play` 整个钩下来，逐条记 cue、到听者的距离，以及这一声在总线上
**实际的干声与混响电平**（干 = 源 gain × panner 的 inverse 曲线；
湿 = 源 gain × wet send × 混响回声增益）。七关各站着听十五秒，
再拿 `git archive HEAD` 导一份改之前的树，同一台浏览器、同一条路径跑一遍对照。

**踩到的坑：不点「进城」，听者根本不在玩家头上。** 听者贴着**相机**走，
而主菜单那台相机悬在半空看战场（实测离玩家 496 m，离最近的兵 96 m），
关卡开头的过场相机也不在玩家身上。头一轮就是这么量的，
得出「平均一百三十四米开外」这种数 —— 那是站在半空听的距离，不是玩家耳朵里的。
正确的入口是 `?menu=0&intro=0&phase=N` 再点 `#bootStart`，量之前先断言
`camera` 与 `player.position` 的差是 1.6 m（眼高）。

## 全场湿/干能量比（改前 → 改后）

一整场里所有播出去的声音，混响总能量比干声总能量。

| 关 | 中位交火距离 | 改之前 | 改之后 |
| --- | --- | --- | --- |
| 序 · 界河 | 63 m | 8.07 | **0.83** |
| 一 · 北沙河 | 82 m | 7.10 | **0.84** |
| 二 · 东关 | 97 m | 5.06 | **0.58** |
| 三 · 夺回东关门（夜）| 113 m | **19.75** | **1.89** |
| 四 · 城墙 | 88 m | 5.15 | **0.57** |
| 五 · 十字街 | 81 m | 4.21 | **0.58** |
| 六 · 北门 | 43 m | 7.79 | **0.93** |

**七关无一例外：玩家听到的东西里，混响是干声的四到二十倍。**
而混响是立体声、**不带任何方位**、在开阔地拖 2.6 s、在街巷拖 0.95 s ——
几十条叠在一起就是一片糊。「不知道从哪儿来」「带拖尾」「杂糅在一起」，
三句话说的是同一件事。最糟的是夜战那一关：开阔地的 IR 最长，交火距离又最远。

## 1. 混响 send 完全不吃距离衰减，还反着加（这是根子）

send 分在 Panner **之前**，那是对的（湿信号不该跟着头转，见 `Script_Audio.mjs`
文件头坑 1）。但它原来同时也不吃**距离**衰减，反而随距离往上加：
`wetScale = 1 + d × 0.03`，加到 1.0 封顶。于是一百六十米外那一枪：

| | 干声 | 混响 | 湿/干 |
| --- | --- | --- | --- |
| 改之前 | 0.024 | 1.0（封顶）| **20 倍** |
| 改之后 | 0.024 | 0.049 | 2.0 倍 |

正确的模型不是「混响不衰减」。房间里混响场近似均匀，那说的是**同一个房间里**；
一支枪在四百米外的野地上响，你这儿的混响场里当然也只剩那一点点能量。所以：

```
干 ∝ 1/(1+d)        湿 ∝ √(1/(1+d))      —— dB 上正好一半
```

湿/干比因此仍然**随距离上升**（远处更空旷的听感保住了：2 m 上 0.36、120 m 上 2.0），
但绝对电平跟着走：一百六十米外那条尾巴比原来轻 16 dB。

顺带修的一处：send 原来接在空气低通**之前**，于是远处一枪的尾巴带着全套高频，
听着像有人在你旁边的砖房里开枪。现在接在低通之后 —— 高频是在路上被空气吃掉的，
不是到了耳朵才吃。

## 2. 每开一枪跟一记迫击炮

`Script_Main` 里那行「0.62 s 是弹壳落地」播的是 **`shellImpact`** ——
「野外迫击炮爆炸实录」，2.8 秒长，混响 send 0.45。**弹壳这条 cue 当时根本不存在。**
现在有了（`shellDrop`，SculpTunes 的户外水泥地弹壳实录，降调 14% 压成步枪壳的重量），
不给 position（壳就掉在自己脚边）、pan 0.35（中正式与三八式都向右抛壳）。

同一类错还有一处，在 `Script_Combat.Blast`：
`radius > 8 ? "explosionNear" : "explosionNear"` —— 三元的两边一模一样，
于是两百米外的一颗手榴弹也拿贴脸那条 2.4 秒的城区爆炸播。改成按**听者的距离**挑。

素材侧还有个小坑：SculpTunes 那一库的录音里烘着一记 9056 Hz 的电子啸叫
（素材里 −72 dB，但切割时的归一化会把它抬到 −55 上下）。
每开一枪响一次的**稳态纯音**，耳朵一定会从噪声里把它拎出来 ——
所以给烘焙脚本加了 `notch` 字段（陷波在变速之前，写的是素材原始频率），
落地实测残留 −77 dB。

## 3. 撒出来的假枪声比真枪还响

环境一次性音里有几条远处的零星枪声（`rifleNraFar` / `rifleIjaFar` / `zb26` / `type92`）。
它们代表的是「比 160 m 还远的那些枪」，所以绝对电平**必须低于**一发真的
一百六十米外的枪（干声 0.021）。旧值折算下来比那还高 12 dB ——
也就是说：撒出来的假枪声比场上真在打的还响，而且不带方位（只有一个随机 pan）。
整体压了 7 dB 并减了次数。

同时给环境一次性音加了 `AMB_AIR`：位置音的空气低通由 `Play` 按距离算，
但这些东西没有 position，「在很远的地方」这件事没有任何东西可以表达，
于是原来一律带着全套高频从立体声里蹦出来。现在照那条公式反推着钉死
（两百米 ≈ 1200 Hz）。三条例外不滤：弹啸本来就从你耳边过去，
落屑与吱呀就在旁边的废墟上 —— 它们「近」正是它们吓人的原因。

## 4. 预算闸先到先得，丢的是随机的那一半

`NODE_BUDGET` 那道闸原来只看名字不看距离。实测「二·东关」二十秒里 367 次枪声请求
丢掉 172 次（47%），而丢的是随机的那 47%：眼前那一枪和一百米外那一枪一样看运气。
可这两者根本不是一回事 —— 远处那一枪本来就只剩一层糊音，眼前那一枪缺了就是穿帮。
现在超过 45 m（近场素材的作用边界）的位置音一律按低优先级算，**先丢远的**。

三道闸各自吃掉多少现在都记在 `audio.drops`（`{ dedupe, budget, distance }`）——
一条音「没响」有三种完全不同的原因，混在一个数里就查不出该去调哪一个。
这一轮就是靠它分清「远处的枪是被距离闸掐掉的还是被 22 ms 去重窗吃掉的」。

## 5. 距离闸（说实话：它不是这一轮的功臣）

新加了三档「听不见就别播」：枪 160 m（`GUN_CULL_M`，再远不播伪造的逐发枪声）、
喊话 90 m（人喊一嗓子传得到的距离）、其余 400 m 兜底。默认环境不再用战斗人群床填补这段距离。

**但现有七关里枪那一档几乎一次都不触发** —— AI 的交火距离由武器射程管着，
真在对射的基本都在 130 m 以内，两三百米外那几个兵根本没在开枪。
真正天天触发的是喊话那一档：一关十五秒里掐掉十几到六十次
（`drops.distance`，夜战那关最多 —— 战线拉得最开）。四百米外那句「卧倒」
不是听不清，是根本不存在，而它原来照样往混响里倒一勺。

枪那一档留着是**闸**不是功臣：保的是「哪一关的视野一旦拉开，也不会再糊回去」。

## 验收

```bash
node Taierzhuang1938/Script_AudioTest.mjs
```

在原有断言之外加了三条，因为**上面这些全都测不出来** ——
声音全在响，控制台干净，开机与通关冒烟全绿，只是听着糊：

* 湿/干随距离上升但不失控（2 m ≤ 0.6、120 m ≤ 3，且远处必须比近处湿）；
* 三百米外不逐发播、一百米外照播；
* 开三枪：`shellDrop` 要到了、`shellImpact` 一次都不许被请求。

通关冒烟里那条「每发之后补拉栓声与抛壳落地」也跟着改了：现在同时断言
**没去要 `shellImpact`**。

---

# 重制新增音效（2026-08-28 · 任务流程重制音效缺口批 A2）

七章重制排出来的音效缺口，一次补齐 **15 个 cue / 19 个文件 / 314 KB**，全部落
`Audio/Sfx/`，来源与切割参数登记在 `Data_SfxSources.mjs` 末尾那一段。
规格出处：`docs/Data_MissionRemake.md` §2/§3/§4/§5/§6/§7，以及
`Data_MissionCh1/3/4/5/6.mjs` 头注里与音频有关的那几条 `ENGINE_REQUEST`。

## 交付形态：先落 `pendingCues`，2026-08-29 已搬进 `cues`

`AudioEngine.LoadSfxPack` 对**没有同名合成配方**的 cue 是直接抛错的
（`Script_Audio.mjs` 的「没有同名配方，盖不上去」），所以这 15 条要是直接写进
`Data_SfxManifest.json` 的 `cues`，代价是：每次开机多十五条 `sfxErrors`，
`Script_AudioTest` 的三条计数断言（清单 cue 数 / 盖住数 / 载入零报错）当场全红。
**素材还没接线就先红一片测试不算交付**，所以它们先落在清单的 `pendingCues` 段：

- 文件在仓库里、清单里有账、`Data_SfxSources` 里有完整的来源与切法；
- 运行时看不见（`LoadSfxPack` 只遍历 `cues`）；
- `Script_AudioNormalize.mjs` 也不去动它们（它同样只读 `cues`）——
  所以**烘焙期就按它的口径对齐好了**（下面「验收数字」）。

### 集成批接线要做的四件事（2026-08-29 · INT3a 已全部做完）

1. ✅ `Script_Audio.RECIPES` 给这 15 个 cue 各加一条**合成兜底配方**（采样载不到时的
   回落，与原有 43 条同一条路子）。写得薄是刻意的：三到五个节点、不追求像，
   只保证「有东西响了，而且响的是对的那一类」——惨叫是浊音不是噪声、电键是干脆
   的一记不是嗡、扫射是一梭子不是一发。唯一不薄的是 `strafeNear`：航空机枪
   ~900 rpm 的身份就是「一梭子」，只给一发这条 cue 就不成立了，所以它走 `GunAuto`。
2. ✅ `SAMPLE_MIX` / `SAMPLE_WET` / `AMB_AIR` / `NODE_COST` 逐条加了行。
   两条不直观的：**一直在响的东西不能按「一次事件」配平**（`flareBurn` 0.35、
   `telegraphHum` 0.3，与脚步同一档）；**玩法反馈必须听得见**（`mgCharge` 0.95、
   `telegraphKey` 0.7，与 `bolt` 同一条理由 —— 卡壳清没清、这一下敲进去没有）。
   `AMB_AIR` 只加了 `strafeFar` 1100 与 `planeDive` 2200：其余十三条都由接线侧带着
   position 播，空气低通由 `Play` 按距离自己算，写进这张表反而会滤两遍。
3. ✅ `Script_AudioTest.mjs` 的 `RECIPE_COUNT` 从 41 改成 56。
   顺带把 `telegraphKey` 加进了 `SAMPLE_CYCLE`（A2 在素材表里点名要求的）：
   它的三条是从同一条素材里钉死三个位置切出来的，而**发报是连着敲的** ——
   随机挑必然连出两次同一条，听感就从「有人在发报」塌成「打字机在响」；
   0.2 秒的金属敲击也经不起 ±3% 逐发变调。
4. ✅ 把 `Data_SfxSources.mjs` 里这些组的 `pending: true` 删掉、**照组名重烘**，
   产物从 `pendingCues` 挪进了 `cues`。十九个 mp3 逐字节与重烘前相同 ——
   切法是确定性的，这一步只动清单。

顺带 bump 了 `Script_Audio.SFX_PACK_VERSION`（7 → 8）：清单换了内容，戳不动的话
浏览器会拿着缓存里的旧清单去要新文件（或者反过来）。

**重烘一律照组名点名。** 不带组名的全量会把清单从零重建，而 `Audio/Sfx/_raw/` 是
gitignore 的 —— 谁的本地没有原始长片，谁的 cue 就被从清单里抹掉。
另外注意 `Script_SfxBake.mjs` **没有 `--dry` 这个旗标**：不认识的 `--x` 会被当成
「没点名任何组」，于是走全量下载 + 全量重切那条路（实测会把 49 个已经由
`Script_AudioNormalize` 拉平过的老 mp3 重新切一遍、覆盖掉它们的响度）。
要「只看不写」请用 `--report`，且**同样要带组名**。

### 已修：部分重烘会把毕业的 cue 踢出 `pendingCues`（2026-08-29 · 抛光批 P2）

原来 `Script_SfxBake.Main()` 收尾那一段在 `partial` 模式下是
`{ ...(manifest.pendingCues || {}), ...pendingCues }` —— 只做并集，不做删除。
于是「组上的 `pending` 去掉了、照组名重烘」之后，这 15 条同时出现在 `cues`
与 `pendingCues` 里。运行时与 `AudioNormalize` 都只读 `cues`，不影响行为，
但清单上是一笔糊涂账 —— 而清单正是「这条音接没接线」唯一的账本。
INT3a 当时是**手工**把 `pendingCues` / `pendingNote` 两个键从 `Data_SfxManifest.json`
里删掉的；现在脚本自己会做：合并之后凡已经进了 `cues` 的键一律从 `pendingCues` 剔掉，
一条不剩就把这两个键一起摘掉，不留空对象充当「还有账没清」。

`Data_SfxSources.mjs` **不在 `index.html` 的 import map 里**（全项目只有 Node 侧的
烘焙脚本 import 它），所以 A2 那一批不需要 bump 任何 `?v=`；
接线批改了 `Script_Audio.mjs`，它的 `?v=` 由集成批统一 bump。

## 清单

| cue | 变体 | 时长 | 体积 | 用在哪 | 素材 |
| --- | ---: | ---: | ---: | --- | --- |
| `execScream` | 2 | 0.62 / 0.55 s | 10.2 KB | 三关处决段（隔墙、低概率、低音量） | SoundBits · 男性痛叫 · GDC 2016 ／ SoundBits · 男性短叫 · Game Audio Monthly #2 |
| `painMoan` | 1 | 2.60 s | 20.9 KB | 三/四关大出血伤员 | Airborne Sound · 三十多岁男性、捂着嘴的痛呼与喘 · GDC 2018 |
| `hitGrunt` | 1 | 0.51 s | 4.5 KB | 四关罗班长腹部中弹 | Bottle Rocket Fx · 男性痛哼 · GDC 2016 |
| `flareLaunch` | 1 | 2.60 s | 20.9 KB | 四关照明弹发射 | InspectorJ · 焰火近距离发射 · GDC 2023 |
| `flareIgnite` | 1 | 1.20 s | 9.8 KB | 顶空点燃 | TS Sound · 信号弹点燃 · Game Audio Monthly #4 |
| `flareBurn` | 1 **loop** | 6.00 s | 47.4 KB | 滞空持续燃烧 | 同上（同一次录音的稳定燃烧段） |
| `flareOut` | 1 | 2.90 s | 23.3 KB | 熄灭衰减 | 同上（同一次录音的**自然烧完段**） |
| `telegraphKey` | 3 | 0.21 / 0.25 / 0.23 s | 7.1 KB | 终章电键单点 | 344 Audio · 古董黄铜锁具 · GDC 2026 |
| `telegraphHum` | 1 **loop** | 6.00 s | 47.4 KB | 终章发报机电流底噪 | RedSonic · 电器低鸣与嗡声 · GDC 2017 |
| `planeDive` | 1 | 7.00 s | 55.1 KB | 一关日机俯冲通场 | Pole Position · 布里斯托尔「布伦海姆」1934 · GDC 2019 |
| `strafeNear` | 1 | 1.50 s | 12.3 KB | 空对地扫射（近） | Pole Position · M1919A4 .30cal 炮塔架 1 m · GDC 2016 |
| `strafeFar` | 1 | 2.20 s | 17.8 KB | 空对地扫射（远） | Pole Position · 同一挺枪、同一次射击、300 m 外的另一支麦 |
| `strafeDirt` | 1 | 2.90 s | 23.3 KB | 弹着扫过土路的一串近弹 | Pole Position · The Warfare Library 弹丸掠过与跳弹 · GDC 2017 |
| `mgOverheat` | 2 | 0.35 s | 6.6 KB | 五关重机枪过热咔哒 | Eiravaein Works · 铁匠铺轻锤敲热铁 · GDC 2015 |
| `mgCharge` | 1 | 0.90 s | 7.6 KB | 五关卡壳拉栓 | Pole Position · 重型枪机拉柄近录 · GDC 2016 |

许可：**全部 Sonniss GDC Game Audio Bundle（archive.org 镜像），免版税、可商用、
不要求署名**。厂商名照旧逐条记在 `Data_SfxSources.mjs` 里 —— 那是选材的依据，不是法务义务。
本批**没有一条走 TTS / SeedAudio / MiniMax**：三条人声按 `docs/Data_AudioAssets.md`
「交付档」一节的明令，非语言嗓音一律取真人实录。

## 复用了什么（这几件没有重做）

- **火车车轮声 loop**（终章尾声「电流声渐变序章火车车轮声」）—— 复用
  `Audio/Amb/AudioAmb_TrainInterior.mp3`（30 s 立体声床，含轮轨咔嗒，`beds.trainInterior`）。
  这处收束的意思就是「回到序章那节车厢」，**另录一条反而把首尾呼应拆散了**。
- **九二式重机连发** —— 已有的 `type92`（M1919A4 单发）＋ `SAMPLE_BURST` 的 200 rpm，
  「啄木鸟」那条身份证不动。缺口批只补了过热与卡壳。
- **日机远场盘旋** —— 已有的 `amb.planeFar` 与新的 `planeDive` 是**同一条素材、同一架飞机**
  的远近两次通场。
- **单发弹丸掠过** —— 已有的 `amb.whizz` 与新的 `strafeDirt` 同源，前者切单发、后者切一串。
- **伤员痛呼素材** —— `amb.moanFar`（Coll Anderson 战后群体呻吟）仍在素材包中，
  但默认环境不再调度；需要明确、具体的伤员反馈时继续使用 `painMoan`。

## 验收数字

响度口径与 `Script_AudioNormalize.mjs` 的「一次性音」组逐字相同（20 ms 帧、门限取最响帧的
10%、目标 −25 dBFS、峰值上限 −1 dBFS），**由 `Script_SfxBake` 的新字段 `alignDbfs`
在烘焙期量成品补差**（量成品不量 stage.wav —— 72 kbps 单声道编宽带噪声解出来会高 2—3 dB）：

- 有声段 RMS：**−25.15 … −24.70 dBFS**，散布 0.45 dB（容差 ±0.5）；
- 峰值：**−14.16 … −1.54 dBFS**，全部在 −1 dBFS 之下；
- 首尾端点电平：全部 ≤ −52 dB（两条 loop 的 −52/−53 是 20 ms 淡出落在稳态嘶声上，
  其余都在 −64 dB 以下）—— **没有硬切口，不会「咔」**。

搬进 `cues` 之后 `Script_AudioNormalize.mjs`（只读验收）对这 19 个文件**实测直接是绿的**
（2026-08-29：72 个文件、有声段 RMS −25.48…−24.58、散布 0.90 dB）。

白刃那五条 SeedAudio 成品此前让 SFX 组**恒红**，与 A2 无关：它们是按人工那一档
（整段 RMS −28.5 dBFS）压的，从来没并进 −25 这条库线。2026-08-29 的处置是
**给它们一条显式豁免，而不是拉平** —— 理由见下一节。

## 频谱验收（我听不见，靠看）

逐条渲染「波形 + 对数频谱」贴图过一遍，配 时长 / 有声段 RMS / 峰值 / 端点电平四个数。
逐条结论：

- `execScream` 两条 —— 起音后整条都是**有基频有共振峰**的浊音（实测基频 361→256 Hz
  与 230→134 Hz，都是成年男性区间），谐波梯清楚，无削顶，尾部由 0.14—0.16 s 的淡出收干净。
- `painMoan` —— 2.6 s 里三段发声夹两次换气，低频基频带明显（106—165 Hz），
  共振峰结构完整；这是全库唯一一段**真的低而持续**的男声痛呼，也是选「捂着嘴」那条素材的原因。
- `hitGrunt` —— 单个短事件，能量集中在低段并有结构（降调 18% 之后基频约 290 Hz），
  0.51 s 内收完，无第二次发声（不是惨叫）。
- `flareIgnite / flareBurn / flareOut` —— 点燃是一记冲头接嘶声；燃烧段 6 秒逐帧 RMS
  稳在 −25±1 dB（是「最无聊的一段」，适合循环）；熄灭段实测从 −22 dB 平滑掉到 −56 dB，
  **是素材里真的烧完了**，不是淡出曲线冒充的。
- `telegraphKey` 三条 —— 每条是一记主击＋一记轻的（按下＋抬起），引头只留 17 ms
  （按键音前面多五十毫秒空白，手感上就是「按下去慢半拍」）。
- `telegraphHum` —— 工频谐波稳定成条，6 秒里无起伏，低通 7 kHz 之后没有现代电源那种毛刺。
- `planeDive` —— 教科书式的通场包络：−36 dB 涨到 −9 dB 再落回 −34 dB，高频带随距离
  张开再收拢，**多普勒是录出来的**。
- `strafeNear / strafeFar` —— 同一次三连发的两个机位：近的低频冲击厚、瞬态硬；
  远的瞬态被吃掉只剩尖头加长尾。两张图摆一起就是「远近是两条真的录音」这条标准的样子。
- `strafeDirt` —— 2.9 秒里三十几记等间距的锐利音爆，中间没有断口。
- `mgOverheat` 两条 —— 冲头后有清楚的金属共振模态（横条纹），0.35 s 内衰完。
- `mgCharge` —— 一记宽带机械撞击加衰减，无金属振铃（是拉柄不是敲钟）。

**仍需人工试听的两处**：惨叫与痛呼是不是「克制不猎奇」、电键的「嗒」够不够干脆 ——
这两条机器判不了。

## 手榴弹雨（第二关）·「密集多发叠放会不会糊」评估

按分工只评估、不改 `Script_Audio.mjs`。第二关 brief 的口径是**集中六七十人、连续二三百枚**，
`mechanics.grenadeRain` 要求「玩家与背景守军同时投、落点在 0.3—0.8 s 内错开」。
沿现有链路（`Script_Combat.Blast` → `audio.Play("explosionNear")`）逐道闸算下来：

**不是瓶颈的三处：**

- **预算闸**：采样版 `explosionNear` 的 `NODE_COST` 是 2，`NODE_BUDGET` 120 ——
  理论上同时六十记爆炸才顶到天花板，一场手榴弹雨挤不满。
- **去重窗**：`DEDUPE_S` 22 ms 只合并**同一帧**的重复；落点按设计错开 0.3—0.8 s，
  基本撞不上这道窗。
- **距离闸**：`Blast` 按听者距离在 60 m 处分近/远，外壕投弹距玩家十几到三十米，
  全部走 `explosionNear`（2.4 s、`SAMPLE_MIX` 1.0 —— 全表最响的一条）。

**四处真的会糊，按严重程度排：**

1. ~~**`explosionNear` 只有一个变体。**~~ **2026-08-29 抛光批 P3 补上了，现在是 3 条。**
   本文件自己的规矩是「每秒都在响的音必须多变体」，手榴弹雨正是那种场合：
   二十几记爆炸全从同一条 2.4 s 的 wav 出，±3% 逐发变调盖不住 ——
   听感上会从「一片爆炸」塌成「同一记爆炸响了二十遍」。

   补的两条**不是**当初建议的「Bluezone BC0277 那一组里的另一条」：
   archive.org 的 Sonniss 镜像是**每家厂商只放四个文件**的抽样，
   `BluezoneCorp - Detonation - Explosion` 目录里带 `urban` 的**就那一条**，没有第二条同库的。
   改按**频谱选**而不是按文件名选 —— 拿现用的 BC0277 当靶子
   （谱心 1772 Hz、>4 kHz 占 11.9 %、降 20 dB 用 0.72 s），
   把镜像里所有非科幻的爆炸素材量了一遍，选出一深一亮把靶子夹在中间的两条：

   | 变体 | 素材 | 谱心 | >4 kHz | 成品电平 |
   | --- | --- | --- | --- | --- |
   | `_01` | Bluezone `BC0277_explosion_urban_004_02`（GDC 2023） | 1772 Hz | 11.9 % | −24.92 dBFS |
   | `_02` | Gamemaster `explosion_large_08`（GDC 2017） | 1807 Hz | 13.6 % | −25.03 dBFS |
   | `_03` | Gamemaster `explosion_med_long_tail_01`（GDC 2017） | 1453 Hz | 9.9 % | −24.99 dBFS |

   Gamemaster 这个包已经是 `explosionFar` 的来源，三条变体只出自两家厂商，
   底噪与房间感是一路的。三条包络都验过是单调衰减（没有第二记爆炸糊在 2.4 s 窗口里）。
   `explosionNear` **不在 `SAMPLE_CYCLE` 里**，所以走的仍是随机挑 + 逐发 ±3% 变调，
   这一批没有动这个语义。

   > **重切 `ExplosionUrban` 会把 `_01` 的响度打回原形。** 这一条差点悄悄过去：
   > `_01` 的 cut 上没有 `alignDbfs`，它现在的 −24.92 dBFS 是当年
   > `Script_AudioNormalize --write` **事后**拉平的；照组名重切会从原素材按
   > `gain: 0.97` 重新生成，量出来是 **−13.03 dBFS（响了将近 12 dB）**，
   > 而清单、测试、`--report` 之外的任何一道闸都不会响。
   > 补变体时必须把 `_01` 从 git 还原（新变体自己带 `alignDbfs: -25`，不受影响），
   > 或者重切完立刻跑一遍 `Script_AudioNormalize.mjs --report`。
   > 一般规律：**没有 `alignDbfs` 的老 cue 不要重切**。
2. **混响 send 是线性叠加的。** `SAMPLE_WET.explosionNear` 0.45，街巷 IR 0.95 s、
   开阔地 2.6 s；二十记同距离的爆炸叠上去，湿声总能量就是 0.45×N ——
   2026-08-20 那一轮定论过的「不知道哪儿来的、带拖尾」正是这个机制，只是那次的成因是
   距离不衰减，这次是**数量**。接线时建议给一个齐射感知的 wet 折减，
   或把超过前几记之外的爆炸改派 `explosionFar`（听觉上本来也只有最近几记有清楚的爆头）。
3. **主限幅器会抽。** master 上那只 `DynamicsCompressor` 是 threshold −8 dB、ratio 12、
   release 0.22 s；密集爆炸会让它一直压着不放，底下的枪声与人声整体被摁下去 ——
   听感就是「一打起来什么都听不清」。
4. **合成回落是个坑。** 采样包一旦载不到，`explosionNear` 走合成配方，`NODE_COST` 18，
   **六记同时的爆炸就吃光 120 的预算**，此后除了 `priority` 的声音全被丢。
   正常路径下遇不到，但这一关是全作爆炸最密的一关，值得在接线时给爆炸类单独设个并发上限。

## 重新烘焙

```bash
# 一律照组名重烘（不带组名的全量会从零重建清单、并且下载+重切全库，见上面第 4 条）
node Taierzhuang1938/Script_SfxBake.mjs ExecScreamShout ExecScreamCry   # 共用一个 cue 的组必须一起烘
node Taierzhuang1938/Script_SfxBake.mjs FlareBurn --recut          # 点燃/燃烧/熄灭三条同源，一起重切
node Taierzhuang1938/Script_SfxBake.mjs TelegraphKey --report      # 先看候选表再钉位置

# 2026-08-29 接线时全批重烘用的就是这一行（--recut = 不下载，只拿 _raw 重切）。
# 十九个 mp3 逐字节与重烘前相同，只有清单变了 —— 切法是确定性的。
node Taierzhuang1938/Script_SfxBake.mjs --recut \
  ExecScreamShout ExecScreamCry PainMoanMuffled HitGruntStifled \
  FlareLaunch FlareBurn TelegraphKey TelegraphHum \
  PlaneDive StrafeNear StrafeFar StrafeDirt MgOverheat MgCharge
```

原始长片仍落 `Audio/Sfx/_raw/`（已 gitignore）。本批新增的四个切割字段
（`fadeInS` / `fadeOutS` / `alignDbfs` / `loop`，与组上的 `pending`）
在 `Script_SfxBake.mjs` 头注里逐条写了为什么。

---

# 响度验收里的人工豁免（2026-08-29）

`Script_AudioNormalize.mjs` 是全仓库非对白音频的响度闸：一次性音按**有声段 RMS**
（20 ms 帧、门限取最响帧的 10%）对齐到 −25 dBFS，环境床与音乐按整段 RMS 对齐到
−27 dBFS，峰值一律不许过 −1 dBFS。

白刃那五条（`AudioSfx_DadaoSwing_01/02/03`、`AudioSfx_DadaoHit_01`、
`AudioSfx_BayonetHit_01`）**从来不在这条线上**，所以 SFX 组长期恒红。
2026-08-29 的处置是**给它们一条显式豁免，而不是把它们拉平**：

- **为什么不拉平。** 那个 −28.5 dBFS 不是漏掉的一步，是一条设计决定
  （见上面「白刃三音为什么是生成的，不是实录的」）：这几条 take 的波峰因数只有
  13—17 dB，而实录冲击音是 19—27，按同一条平线对齐会让**白刃一出手就盖住整场枪声**；
  而 `Script_Audio.SAMPLE_MIX` 里那几个数是照旧素材（Sonniss 顶包）调的，
  压到 −28.5 之后 SAMPLE_MIX 一个数都不用动。更根本的一条：这五条是**人工一条条
  试听选定**的 take，与 `SAMPLE_CYCLE`（挑过的变体按顺序轮播、不做逐发变调）
  是同一条规矩 —— **不许拿概率或平均值去糊人工选定的东西**。
- **豁免换的是两件事，不是一件。** 目标从 −25 换成 −28.5，量法从「有声段 RMS」
  换成「整段 RMS」（`Script_SeedAudioMeleeBake.TARGET_RMS_DB` 的口径）。
  只换目标不换量法会量错：这几条是短促冲击音，两种量法在它们身上差 2—3 dB
  （实测有声段 −25.52…−28.48、整段 −28.40…−28.56），拿有声段去对 −28.5
  会把三条本来合格的判成红。
- **豁免不等于不验。** 容差 ±0.5 dB 与 −1 dBFS 的峰值上限照旧走，
  报告里这五行标 `EXEM` 并打印它们走的是哪一档；谁把它们重烘成别的响度，
  这只脚本照样红。豁免的文件**一个字节都不碰**，`--write` 也不许覆盖。
- **散布只统计走库线的那些。** 把人工那一档混进「散布 0.90 dB」里的话，
  那个数量的是两条平线的间距，不是任何一条线自己有多齐。

要撤销豁免，先撤销上面那条设计决定，别从 `EXEMPTIONS` 那张表下手。

```
SFX: 72 files, activeRmsDbfs -25.48..-24.58 dBFS, spread 0.90 dB, target -25 dBFS（另有 5 个按人工档验收，不计入散布）
Ambience cues: 24 files, activeRmsDbfs -25.49..-24.85 dBFS, spread 0.64 dB, target -25 dBFS
Ambience beds: 10 files, rmsDbfs -27.47..-27.23 dBFS, spread 0.24 dB, target -27 dBFS
Music: 9 files, rmsDbfs -27.45..-27.43 dBFS, spread 0.02 dB, target -27 dBFS
Audio native levels are aligned.
```
