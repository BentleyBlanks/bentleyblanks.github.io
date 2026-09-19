# 第一关配音同步 · 2026-09-19 重构版

需求来源：[Notion 2026.09.19 采用稿转录](Data_FirstLevelRebuildSource20260919.md)（台词一字不改）。
接口冻结在 [分包契约](Data_FirstLevelRebuild20260919Contract.md) §5。
本页取代 [2026-09-14 配音同步](Data_FirstLevelVoiceSyncSeptember14.md) 与 [屋内伏击配音同步](Data_FirstLevelVoiceSyncRoomAmbush.md)：那两页的 cue、录音、对齐已全部下线。

## 1. 一句话口径

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

<!--CUE_TABLE-->

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

<!--ACCEPTANCE-->

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
