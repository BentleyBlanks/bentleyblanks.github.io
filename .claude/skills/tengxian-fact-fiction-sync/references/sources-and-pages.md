# 页面、文件与打开出处

## Notion 页面

同步记号 `Taierzhuang1938/Data_HistoryLedgerSync.json` 的 `notionPages` 是要看的页面清单；新页面先在那里登记 `id`、`title`、`role`。

| 页面 | id | 管什么 |
| --- | --- | --- |
| 史实与创作（上级页） | 3fd60335331c818fa24deadb6d72ca70 | 给玩家看的说明草稿（三组）、四种标注、维护规则 |
| 史实与创作对照表（子页） | 3fd60335331c8194aa82f0b238084d34 | 逐条账目，按章节分节 |
| 滕县保卫战（总纲） | 3c360335331c81be876fcf4cb0928e1b | 「明确保留的三项创作性还原」：日机扫射担架、救护点处决、照明弹夜战 |
| 全剧故事大纲 | 3f960335331c81d8bd65e07e7288f7d2 | 各关情节、人物前史；末尾有自己的「史料与创作」小节（不归本流程改） |
| 全剧节拍表 | 3f960335331c81bfa32efb286dffc0a6 | 一拍一行；「发生了什么」一列常带「（有史料）」字样，要逐个核 |
| 第一关剧本 | 3fb60335331c81faa38dfe84c25d29f0 | 01–18 逐场；末尾有自己的「史料与创作」小节（不归本流程改） |
| 空间拓扑关系 | 3fc60335331c814f8be8e23d43500eb5 | 第一关 01–05 的地点、尺寸、走位；尺寸归复原说明 |
| 文案资料 | 3c360335331c80988907c6e9b5ee9aca | 考据页总目录：守军干部、军民互助（筑防、运伤）、四川抓壮丁、武汉公祭、王树增摘录等，找出处先翻这里 |

「归档」下的旧版章节页是过去的版本，不作依据。第二关以后还没有单独的剧本页，以大纲和节拍表为准。

### 「文案资料」主题索引（找出处先看这里）

| 主题 | 页面 id | 备注 |
| --- | --- | --- |
| 《悲壮的滕县之役》全文转写 | 3ed60335331c816b81a0d53c1e8ce02c | 1938 年原刊，当时的战报和通讯合集；转写有 OCR 错字，升级标注前要对 Commons 上的扫描原件（见下） |
| 守军干部资料与照片（37 人名录） | 3ed60335331c81bc84b5cafa945a4751 | 人名、职务、照片出处 |
| 建制：班排连营人数与已知军官 | 3ed60335331c814593f2c52432affd76 | 编制、人数 |
| 军民互助：筑防、运伤与藏护官兵 | 3ed60335331c8114be30c42465c9a363 | 第二关百姓支前、伤员后送 |
| 桥梁史料汇编（台儿庄、滕县与徐州周边） | 3eb60335331c81fda6dfe38153bcec45 | 北沙河、浮桥、桥型 |
| 四川「抓壮丁」史料汇编 | 3f960335331c81e58824e011707ddc85 | 征兵、强拉 |
| 王铭章武汉迎灵与公祭 | 3ed60335331c81cfaabef9340f05b2be | 王铭章身后 |
| 王树增《抗日战争》摘录 | 3cf60335331c815a8f7ee6a08ad9038a | 二手叙述 |
| 张宣武《台儿庄会战的前奏》参考图 | 3ed60335331c816e8781d3cf1d1605c1 | 亲历者回忆 |
| 抗战影像资料（CriticalPast 等） | 3ed60335331c81a1987fcde474df3014 | 影像，多数不是滕县 |

《悲壮的滕县之役》扫描原件：<https://upload.wikimedia.org/wikipedia/commons/c/c6/NLC416-07jh008596-3580_%E6%82%B2%E5%A3%AF%E7%9A%84%E6%BB%95%E7%B8%A3%E4%B9%8B%E5%BD%B9.pdf>（95 页；资料馆的王铭章遗像就取自第 10 页）。

仓库里也有考据文档（`Taierzhuang1938/docs/Data_TengxianCity.md`、`Data_HistoryTimeline.md`、`Data_HistoryQuotes.md`、`Data_HistoryMaterial.md`），里面标「信史」、引 JACAR 档案号的说法多转引自研究论文；它们是找原件的线索，本身不算核过的出处。

### 对照表的结构

节标题依次是：全剧 / 第一关｜往南的路（### 01–05、### 06–18）/ 第二关｜手榴弹雨 / 第三关｜救护所 / 第四关｜东关之夜 / 第五关｜城墙没有了 / 终章｜最后一封。序章还没列，要加时放在「全剧」之后。

每节一张三列表：内容 / 标注 / 出处 / 说明。fetch 出来是这样：

```
<tr>
<td>内容</td>
<td>创作</td>
<td>说明，链接写成 [标题](url)</td>
</tr>
```

跨关共用的事实写在「全剧」，各关里写「见「全剧」」。页首灰色 callout 的「状态」一行记最近一次核对。

## 仓库里带史料含义的文件

路径相对 `Taierzhuang1938/`。`Script_HistoryLedgerAudit.mjs` 按这几组列改动：

| 组 | 文件 | 看什么 |
| --- | --- | --- |
| 台词、任务、过场 | `Data_MissionCh*.mjs`、`Data_FirstLevelMission*.mjs`（对白在 `...Dialogue.mjs`）、`Data_Cutscene*.mjs`、`Data_Voice.mjs`、`Data_TengxianScript.mjs`、`Data_Levels.mjs`、`Data_Weapons.mjs` | 玩家看得见、听得见的说法 |
| 白盒与空间 | `Blockout/*.json`（含 `.previz.json` 的字幕）、`Data_EditorBlockout*.mjs` | 新剧本的地点、走位、预演字幕 |
| 资产契约 | `Model/**/Data_*.json` 里的 `reconstructionScope`、`historicalReferences`；`Data_CharacterSelection.mjs` | 按设计做的部分写成创作；参考链接要核 |
| 复原说明 | `Data_Tengxian.mjs` 的 `PRESUMED`、`Data_TengxianScript.mjs` 的 `PRESUMED_STAGING` | 推定的数字和尺寸，菜单「复原说明」里展示，不进对照表 |
| 资料馆本体 | `Data_HistoryCodex.mjs`、`Data_History.mjs` | `Data_History` 是旧版史实注记（信史 / 主流记载 / 流传待考三档），里面的说法也要按本流程的标准看 |

全量检查用 `node Taierzhuang1938/Script_TextGather.mjs`，它把全部玩家文字导出到 `_shots/TextGather.md`（按来源分节）。

### 每关文件地图（2026-10-18）

| 关 | 线上现行（玩家现在玩到的） | 只喂白盒 / 新稿 | 备注 |
| --- | --- | --- | --- |
| 序章 | `Data_MissionCh0.mjs`、过场 `Data_CutsceneChuchuan.mjs` | | |
| 第一关 | `Data_FirstLevelMission*.mjs`（文本 id `mission.firstLevel.*`，对白在 `...Dialogue.mjs`）、过场 `Data_CutsceneMachineGunCaptives.mjs` | `Data_MissionCh1.mjs`（2026-09-06 起正片入口已废弃，人物、台词仍供「P0/P1/P2 场景白盒」）；`Blockout/FirstLevel0105*.json`（Notion 01–05 新剧本的白盒与预演字幕） | 空袭机型在 `Data_FirstLevelMission.mjs` 的 `MISSION_AIRCRAFT_ID`，选型理由见 `docs/Data_AircraftAssets.md` |
| 第二关—终章 | `Data_MissionCh2.mjs`—`Data_MissionCh6.mjs`（只有简报级文字，各十来条）、过场 `Data_CutsceneWangMingzhang.mjs`、`Data_CutsceneLastWire.mjs` 等 | | 以 Notion 大纲和节拍表为准 |

文件的头注会写它现在是不是正片入口，拿不准先读头注。实现里的替代也算候选：模型机型（如用 Ki-30 顶替当时的飞机）、借位地形（`PRESUMED_OUTFIELD`）、武器选型。

## 打开出处

每个链接都要确认支持的是这一句话本身。记下核对时看到了什么，写进 `note`。

- **一般网页**：`WebFetch`，提示词问具体那句话在不在、原文怎么写。
- **GBK / GB2312 编码的中文站**（WebFetch 可能出乱码）：`curl -s -L -A "Mozilla/5.0" -o page.htm <url>`，用 Python 按页面声明的 charset 解码，写成 UTF-8 文件再读。文件放 scratchpad。
- **证书过期的 http 站**：WebFetch 会自动升 https 而失败，用 `curl -k` 取原 http 地址。
- **百度百科**：命令行只拿到「百度安全验证」，用内置浏览器 `mcp__Claude_Browser__navigate` 打开，再用 `javascript_tool` 在 `document.body.innerText` 里找关键词。遇到人机验证就停，报告里写「未能核对」。
- **很长的百科页**：WebFetch 默认只读前 10 万字，答案没找到就带 `offset` 接着读，或 curl 下来 grep。
- **图片**（资产契约常用照片做依据）：在页面源码里找到图注附近的 `<img src>`，curl 下载到 scratchpad 的单独目录，用 Read 看图，描述你亲眼看到的（如「背着鼓起来的软包裹，看不清捆法，未注年份」）。
- **PDF**（地方志等）：下载后按页读，记页码。
- **英文档案**（如 FRUS）：看发信人、地点、日期是否对得上 Notion 的说法，常见错误是链到了同一卷里的另一份文件。

### Windows 下的坑

- scratchpad 路径很长，在它里面跑 curl 会报「path longer than allowed」。从 worktree 根执行，`-o` 写绝对路径。
- `python -I` 会忽略 `PYTHONUTF8`、`PYTHONIOENCODING`，往终端打中文会乱码。解码后写成 UTF-8 文件，再用 Read 看。
- Bash 工具里大段 heredoc 夹中文引号、反斜杠容易被吃坏；长脚本先用 Write 写成文件再跑。仓库文件在本机是 CRLF，脚本里按实际换行符匹配。
