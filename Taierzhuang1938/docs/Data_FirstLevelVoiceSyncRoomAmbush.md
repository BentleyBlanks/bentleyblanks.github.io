# 第一关屋内伏击配音同步 · 2026-09-15

> **已被 2026-09-19 版取代。** 第一关 2026.09.19 重构把全部剧情 cue 换成了新的一套（见 [2026-09-19 配音同步](Data_FirstLevelVoiceSync20260919.md)），本页描述的 cue、录音与对齐已经下线，只作为历史记录保留，不要按它接线或验收。


本页只记这一拍新增的三段配音；这一拍的拍表、事实顺序与数值在 [屋内伏击](Data_FirstLevelRoomAmbush.md)，
人物动作在 [屋内伏击动画库](Data_FirstLevelAmbushAnimation.md)。第一关其余配音口径仍见 [2026-09-14 配音同步](Data_FirstLevelVoiceSyncSeptember14.md)，
维护规矩（唯一台词源、整段一次生成、同场环境声、字幕源时序、缓存戳）沿用那一页，不在这里另立一套。

## 需求来源

用户本次口述：第一关公开阶段 08「村口」与 10「院子」之间，罗班长命令顺子穿右手那间屋之后，
玩家带着老周的担架队进屋时遭屋内埋伏的日军刺刀伏击；玩家被捅一刀进挣脱 QTE，背景里老周与两名担架员被刺穿肚子；
玩家挣脱后罗班长、何有田、刘文财从灶屋方向赶到，一起清掉屋内日军。
惨叫仍走现有白刃与创伤音效，**不做 TTS**；只有成句台词是 Seed Audio cue。

三段 cue 的 id、说话人和台词由本轮三包共享的《Room ambush 契约》定死，本页照录并作为交付记录。

## 三段台词与角色

| cue | 触发 | 说话人 → 台词 | 时长 |
| --- | --- | --- | ---: |
| `RoomAmbush` | `ambushTriggered`（urgent） | 幺娃「顺哥！屋头有人——！」／担架员「有鬼子！放担架！」／老周「啊！肚子……狗日的……」／幺娃「周哥！周哥！！」 | 14.028 秒 |
| `RoomAmbushBreak` | `ambushBroken`（QTE 成败都算挣脱、还权之后） | 罗班长「顺子！屋头咋个了！」／何有田「屋头有鬼子！班长，进不进？」／罗班长「进！上刺刀！看准了打，里头有自己人！」 | 9.143 秒 |
| `RoomAmbushCleared` | `meleeResolved`（伏击的日军全死） | 幺娃「周哥……周哥你莫闭眼，看到我！」／老周「肚子……遭捅穿了……」／刘文财「两个抬担架的……都没得了。」／罗班长「文财！布！把他肚子压住！后头喊两个人上来抬！顺子——窗口那挺机枪还在响，去！」 | 19.540 秒 |

角色全部取自既有 `MISSION_VOICE_CAST`（`yaowa` / `bearer` / `zhou` / `heyoutian` / `liuwencai` / `luo`），没有新增人物或新声线条目。
台词原文的唯一来源是 `Data_FirstLevelMissionDialogue.mjs`，插在 `VillageAmbush` 与 `CourtyardOpen` 之间；字幕文字就是这份原文。

## 提示词要点

提示词由 `MissionVoicePrompt(cue)` 拼出（三段分别 479 / 409 / 543 字符，上限 3000）。每段自带 `soundscape` 与 `delivery`：

- 环境声（录进同一条录音，不是后期叠加）：`RoomAmbush` 是土墙灶屋内近身刺刀撞枪身的金属闷响、木担架砸地、衣料撕扯、鞋底刮土地面、短促喘息与近处闷枪声，屋外远处交火压低；
  `RoomAmbushBreak` 是屋外院坝跑动脚步、刺刀扣上枪口的金属声、装备衣料碰撞，屋里的闷响隔墙传出；
  `RoomAmbushCleared` 是刚打完的屋内急促呼吸、撕布、担架木杆刮地、血湿闷响，窗口那挺机枪仍在连续点射。
- 表演：幺娃第一句是撞见人影的惊叫并破音、末尾连喊两声撕心；担架员短促急吼；老周被捅后气一下泄掉、只剩断句；
  班长隔墙吼问后立刻下决断；清场后幺娃带哭腔但不嚎啕，刘文财压低声音报死讯，班长四道命令一句急过一句，末字吼出。
- 三段都写明「除稿中文字外不添加喊叫、惨叫或其他台词」，把惨叫留给音效层；提示词模板本身已有不删词改词、不念角色名、不加音乐。

## 生成次数与参数

Volcengine `seed-audio-1.0`，每段**一次请求、一条完整录音**，没有逐句生成、裁切或拼接。
`speech_rate` / `pitch_rate` / `loudness_rate` 全部为 0（未对这三段调速）。
母带处理沿用 baker：`loudnorm I=-19 TP=-3 LRA=10`、单声道 44.1 kHz、96 kbps。

**三段都是第一次生成即采用，没有重录**（每段 1 次，未使用 `--force`）。

| cue | 秒 | 字节 | SHA-256 |
| --- | ---: | ---: | --- |
| `RoomAmbush` | 14.028 | 169005 | `eb00cf1f028a95f3dcbbe7d8728655dd698fddf851884869fad4a42b66021c67` |
| `RoomAmbushBreak` | 9.143 | 110386 | `a089c6a0e8119a9f756fd9b76733db9aa79a3639acd43da4492d8b9c517cf7d2` |
| `RoomAmbushCleared` | 19.540 | 235147 | `e2cdfaf6ae818920f76e5bc53805aa8d47256996236312489acc43995fb74e32` |

清单写进 `Audio/FirstLevel/Data_FirstLevelVoiceManifest.json`（共 90 条），每条带 `requests: 1`、`continuous: true`、提示词哈希与文件哈希。

## 无提示转写证据

本地 faster-whisper 1.2.1 medium CPU int8，**不给提示词**先转一遍，只用来核对「句子在不在、顺序对不对、有没有多出台词」。
四川话同音误识是常态（下表括号里是稿中原字），**这不是人工听审**。

`RoomAmbush`（14.028 秒）

```
 0.72  1.36  孫悟空            → 顺哥
 1.96  2.76  我頭有人          → 屋头有人
 3.76  4.56  有鬼子
 5.12  5.96  放單架            → 放担架
 7.40  8.00  肚子              → 啊！肚子……
 9.28 10.20  狗死的            → 狗日的
11.88 12.40  糟糕              → 周哥
12.96 13.56  糟糕              → 周哥
```

`RoomAmbushBreak`（9.143 秒）

```
0.00 2.24  孙子 屋头咋个喽     → 顺子！屋头咋个了
2.92 3.92  屋头有鬼子
3.92 5.40  本大 进不进         → 班长，进不进
5.52 7.28  进 上刺刀
7.28 8.16  看尊了大            → 看准了打
8.16 9.12  里头有紫荆人        → 里头有自己人
```

`RoomAmbushCleared`（19.540 秒）

```
 0.00  0.60  走过                     → 周哥
 2.20  3.20  走过你没闭眼             → 周哥你莫闭眼
 3.80  4.60  看到我
 5.00  5.80  肚子
 6.40  8.00  早通喘了                 → 遭捅穿了
 8.40  9.60  两个抬担架的
10.40 11.20  都没得了
12.00 12.80  文采                     → 文财
13.00 13.60  不                       → 布
13.80 14.80  把他肚子压住
15.00 16.20  后头还有两个人上来抬     → 后头喊两个人上来抬
16.40 17.20  孙子                     → 顺子
17.20 19.00  窗口那天机枪还在响       → 窗口那挺机枪还在响
19.00 19.80  去
```

判定：三段的每一句都在、顺序与稿一致、没有多出可辨识台词；说话人数分别是 3 / 2 / 4，与稿一致。
每句平均 3.5 / 3.0 / 4.9 秒，其中 `RoomAmbush` 的空档落在老周中刀那一下、`RoomAmbushCleared` 的末句本身就有 38 字，属合理。
声线像不像本人、四川口音够不够地道，**自动转写判不了，仍待人工试听**。

## 对齐窗口与模型

`Script_FirstLevelVoiceAlign.py`，同一份 faster-whisper medium CPU int8 逐词强制对齐。三段都短于 30 秒，**不需要 `--groups`**。
结果抄进 `Data_FirstLevelMissionVoiceAlignment.mjs`，位置紧挨 `VillageAmbush`，附 `model: "faster-whisper medium CPU int8"`：

| cue | 逐句源区间（秒） |
| --- | --- |
| `RoomAmbush` | `[0, 2.72] [3.8, 6.48] [7.5, 10.32] [12.02, 13.58]` |
| `RoomAmbushBreak` | `[0, 2.26] [2.9, 5.4] [5.54, 9.12]` |
| `RoomAmbushCleared` | `[0, 4.94] [5.2, 8.38] [8.44, 11.68] [12.22, 19.52]` |

三段区间都递增、不重叠、末端不超过录音长度，一句一段没有塌成零长；对齐脚本未打印任何 `REVIEW`，因此没有手工改过窗口或编造时间点。

## 播放编排与事件

`MissionVoiceTimeline` 默认给每段一个 `WholeExchange` 段，本次只加两个段内事件标记，供运行时（A 包）对拍：

- `RoomAmbush`：`{at: lines[2][0], id: "AmbushZhouLine"}` —— 落在老周那句开口处（本录音 7.50 秒），担架上的那一刀跟着它。
- `RoomAmbushCleared`：`{at: lines[3][0], id: "AmbushLuoOrders"}` —— 落在罗班长最后一段连续命令开口处（本录音 12.22 秒）。

事件时点读的是对齐表，不是写死的秒数：换录音重对齐后自动跟着走。未加 `gate`、`wait`、`parallel` 或字幕特例。

## 字幕字体子集

新台词与提示词里带出 11 个原来不在子集里的字：`刮 咋 哭 啕 嚎 惨 扣 泄 添 湿 肚`（其中 `咋` `肚` 直接出现在字幕上，其余来自同模块的表演/环境声描述——
`Font/Script_FontChars.mjs` 走的是整份数据模块，不区分是否上屏）。同一轮里 A 包新增的「埋伏」又带出一个 `埋`，一并烘进去。

重跑：

```powershell
$env:PYTHONUTF8="1"
py -3 Taierzhuang1938/Font/Script_FontSubset.py <源字体目录> --only Font_TitleText,Font_UiSans_Regular,Font_UiSans_Bold,Font_UiLatin_Regular,Font_UiLatin_SemiBold
```

源字体不入库，本轮已暂存在本任务的忽略目录 `Taierzhuang1938/_shots/RoomAmbush/B/FontSources/`（五款，合计约 29 MB），
下载地址见 `Font/README.md`。**本关文案只要再改一个字就要重跑一次**：字表读的是整份 `Data_*` 模块，合并前最后跑一次最稳。

字表从 1665 字涨到 1677 字。实际改动的文件：`Font/Font_TitleText.woff2`（300.0 KB）、`Font/Font_UiSans_Regular.woff2`（231.6 KB）、
`Font/Font_UiSans_Bold.woff2`（235.0 KB）、以及清单 `Font/Font_TitleText.json`、`Font/Font_Ui.json`。
两份拉丁子集（`Font_UiLatin_Regular/SemiBold`）字表未变、重烘后字节相同，未进 diff；`Font_Title`（标题字表）未动。

**缓存戳尚未抬**：`Style_Interface.css` 的 6 条 `@font-face` 与 `index.html` 的 3 条 `<link rel=preload>` 现在都是
`?v=20260915050001`，两边逐字一致（`Script_TextTest` 第 5 节据此为绿）。本包不改 `index.html`，所以两边都保持原样，
由集成方在提交前**一次性把这 9 处改成同一个新戳**；只改一边就是两个 URL，字体白下一遍且页面毫无症状。

## 验收命令与结果

```powershell
node Taierzhuang1938/Script_SeedAudioFirstLevelBake.mjs --dry
node Taierzhuang1938/Script_SeedAudioFirstLevelBake.mjs --only=RoomAmbush,RoomAmbushBreak,RoomAmbushCleared
node Taierzhuang1938/Script_FirstLevelMissionTest.mjs --audio
node Taierzhuang1938/Script_VoiceTest.mjs
node Taierzhuang1938/Script_TextTest.mjs
```

- `Script_FirstLevelMissionTest.mjs --audio`：退出码 0，27 段全绿，含「all 90 continuous audio assets, current script/file hashes」
  与「all 28 autonomous enemy barks use current Sichuan recordings」。三段新 cue 的文件哈希、字节数、提示词哈希、语速参数、
  逐句源区间与当前台词哈希全部对上。
- `Script_TextTest.mjs`：0 失败（重烘子集前曾因缺 `埋` 红过两条，已修）；保留既有的 1 条动态键警告。
- `Script_VoiceTest.mjs`：31/31 通过，真实浏览器 AudioContext running。该测试只覆盖 `Data_Voice.mjs` 的战斗口令与章节台词，
  **不覆盖** 第一关剧情清单，因此另做了一次真实浏览器解码检查：

| cue | 解码时长 | 声道 | 采样率 | 峰值 | RMS | 近似静音占比 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| `RoomAmbush` | 14.028 s | 1 | 44100 | −3.29 dBFS | −20.88 dB | 3.0% |
| `RoomAmbushBreak` | 9.143 s | 1 | 44100 | −3.10 dBFS | −19.27 dB | 0.9% |
| `RoomAmbushCleared` | 19.540 s | 1 | 44100 | −3.34 dBFS | −20.24 dB | 0.6% |

解码时长与字节数与清单一致；静音占比极低，说明环境声确实贯穿整段录在同一条里。

生成候选、转写、逐词对齐证据与解码记录只留本地 `Taierzhuang1938/_shots/RoomAmbush/B/`（已忽略），不提交。

## 未验证事项

- **人工试听没做**：声线像不像各自角色、四川口音够不够地道、老周中刀后的气声与幺娃的哭腔是否可信、
  环境声与屋内外空间关系对不对，只能靠真人听。自动转写与强制对齐不代替这一步。
- 屋内实际播放（3D 声源位置、遮挡、`storyDuck`、与白刃音效的抢道）属运行时接线，由 A 包在实机里验；本包只交录音、字幕源时序与事件标记。
- `AmbushZhouLine` / `AmbushLuoOrders` 两个事件仅在数据层发出，消费方由 A 包决定；本包未在运行时验证过它们真的被接住。
- 字体缓存戳待集成方抬（见上一节），未抬之前老玩家浏览器仍可能用旧子集，新字会逐字回退到系统字体。
