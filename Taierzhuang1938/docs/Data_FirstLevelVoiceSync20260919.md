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
