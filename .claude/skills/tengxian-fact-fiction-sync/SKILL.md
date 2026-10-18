---
name: tengxian-fact-fiction-sync
description: 检查《台儿庄：血战滕县》（Taierzhuang1938）的 Notion 剧本、大纲、节拍表、空间设计和仓库实现（台词、任务、过场、白盒、带史料含义的资产）里哪些是创作、哪些有史料记载，逐个打开出处链接核对，按章节更新 Notion「史实与创作对照表」，同步游戏资料馆「史实与创作对照」页面并上线。用户说「查创作部分」「哪些是虚构的」「同步史实与创作」「更新对照表 / 史料页」「核对出处」时用它；改完滕县的剧本、对白、过场、空间设计，或做了军装、背包、武器、工事摆件这类资产之后也要用它——项目 AGENTS.md 跨系统契约第16条要求对照表跟着内容同一轮改，用户没提对照表也一样。
---

# 滕县 史实与创作同步

把游戏里「哪些来自史料、哪些是创作」这本账跟着内容一起记。账有两份，内容要一致：

- **Notion「史实与创作对照表」**：按章节分节的表格，逐条写标注和出处，是底稿。上级页「史实与创作」里有给玩家看的说明草稿。
- **游戏资料馆「史实与创作对照」**：`Taierzhuang1938/Data_HistoryCodex.mjs` 里 id 为 `HistoryAndCreation` 的条目，玩家在「史实注记 → 史实与创作」里看到的就是它。

这本账的用处是让玩家分得清史实和虚构。写错的代价是把创作说成史实，所以每一步都往保守那边站：拿不准就标「创作」或「出处待查」，不往史实那边靠。

## 两种跑法

- **同步**（默认）：查 → 改 Notion → 改资料馆 → 验证上线 → 报告。项目规矩是自验通过就提交部署。
- **只查不改**：用户说「看看」「列出来」「先别改」时，只做到第 3 步，把候选清单和建议标注报给用户。

范围默认是「上次核对以来的改动」。用户点名某一关（如「第二关」）或说「全量」时，按那个范围整页重读。

## 流程

### 0. 工作区

按仓库根 `AGENTS.md`：在本任务自己的 worktree 里改，先 `git fetch origin master`，落后就 rebase。下面的命令都从 worktree 根跑。

### 1. 找出改了什么

```bash
node Taierzhuang1938/Script_HistoryLedgerAudit.mjs
```

它读同步记号 `Taierzhuang1938/Data_HistoryLedgerSync.json`，列出上次核对以来动过的台词、过场、白盒、资产契约和设计文档，带新加的玩家文字片段；还列出资产契约里的史料边界（`reconstructionScope`、`historicalReferences`）、资料馆现有条目，以及上次核对时各 Notion 页的编辑时间。

脚本只看得见仓库。Notion 的改动只能靠比编辑时间发现：**脚本报「没有改动」也照样**逐页 `notion-fetch` 同步记号里的页面，拿 `page_last_edited_at` 跟记号比。变了的页面整页重读（Notion 拿不到逐字差异，只能拿当前全文对照现有账目）。剧本页常在一天里被别的会话改好几轮，对照表和上级页每次都要读当前版本。

页面在哪、各管什么、仓库里哪些文件带史料含义，见 [references/sources-and-pages.md](references/sources-and-pages.md)。

### 2. 列候选

从变了的页面、脚本列出的新文字和资产契约里，挑出「带史料含义」的内容：有日期地点的事件、命令和制度、日军或国军的做法、装备和规格、百姓生活（租佃、征兵）、编制。每条记下属于哪一关、哪一拍，现有账里有没有。

数字和尺寸（距离、宽度、人数、时长）归「复原说明」（`Data_Tengxian.mjs` 的 `PRESUMED`、`Data_TengxianScript.mjs` 的 `PRESUMED_STAGING`），不进这本账；只在报告里提一句。

全量检查时，先跑 `node Taierzhuang1938/Script_TextGather.mjs` 导出全部玩家文字（`Taierzhuang1938/_shots/TextGather.md`，只查不改时用 `--out=<scratchpad 目录>`），一关一关过。哪些文件是线上现行、哪些只喂白盒，见 sources-and-pages.md 的「每关文件地图」。

线上游戏和 Notion 新稿常常不同步（例如第一关线上还是旧流程，新剧本只在白盒里）。点名某一关时，把线上那一关的玩家文字按来源分组过一遍，跟 Notion 的拍号对：新稿删掉、线上还在的内容单列一组「线上旧版有、新剧本没有」，不自己写进账，报告里交给用户定；实现里的替代（模型机型、借位地形）照样按候选处理。

### 3. 定标注、核出处

四种标注、Notion 各种写法怎么对过来、什么不能对玩家展示，见 [references/marking-rules.md](references/marking-rules.md)。最要紧的几条：

- **链接必须亲手打开，确认它支持的正是这一句**，不是同一个话题而已。Notion、资产契约、剧本里附的链接都一样，都可能是错的。各类网页怎么打开见 sources-and-pages.md 的「打开出处」一节。
- 核不上的链接不挂，标注往下降一级；把它记进同步记号的 `rejectedSources`（写明原因），以后谁再挂上去，`--check` 会拦。
- 小说、戏剧之类的文学作品不算记载，只能挂在「创作」条目下，写明是文学作品；登记进 `literatureSources`。
- 别处、别的年份的材料只能做「类似记载」，正文写明年份和地点。
- 找出处先翻 Notion「文案资料」下的考据页（主题索引在 sources-and-pages.md）；新找到的链接同样要打开核对。Notion 里的史料转写、仓库 docs 里引的档案号都只是线索，对上原件才算核过。
- 候选多、链接开不完时，先开拟升级的和现有标注可疑的，再开拟降级的；开不了的照实写「没核」。

只查不改的跑法到这里结束，按第 7 步的格式报告。

### 4. 改 Notion

对照表：先 fetch，再用 `notion-update-page` 的 `update_content` 做最小的精确替换。改一行就替换那一行的 `<td>`；加行就把相邻一行连同新行一起替换。改完更新页首「状态」那一行：日期、这轮补了什么。改完重新 fetch 一遍核对：

- 中文直接写字，不要手写 `\u` 转义（形近字会悄悄错，「耿家庄」写成过「耕家庄」）；一处没匹配上，工具只给警告不报错，要看返回里的 `warnings`。
- 正文里写 `Data_X.md` 这类文件名，Notion 会自动把 `.md` 后缀变成假链接；写成「仓库里的某某文档」。

上级页：给玩家看的说明草稿分「来自史料的 / 为了讲故事加进去的 / 有类似记载、但滕县本地没查到的」三组，标注变了就把那一条挪到对应的组。

不要改剧本、大纲末尾各自的「史料与创作」小节（用户 2026-10-18 定的暂时不改），发现它们跟对照表对不上，写进报告。

### 5. 改资料馆条目

改 `Data_HistoryCodex.mjs` 的 `HistoryAndCreation`：

- `marks` 固定四组，顺序同 `HISTORY_CODEX_MARKS`：`recorded` 有记载、`similar` 创作，有类似记载、`invented` 创作、`pending` 出处待查。
- 每条 `{ title, text, refs }`，`refs` 是同条目 `sources` 的下标。同一组里同一个话题的几行合成一条；一组超过十五条左右，就把后几关并成一条按关列。
- `sources` 每条写 `title`、`url`、`note`，`note` 说清它支持什么、是什么性质（百科、回忆、报道、档案、地方志、小说）。同一个链接只登记一次。
- 文风跟资料馆其他条目一样：简洁中文，先说游戏里是什么，再说哪部分有出处、哪部分是创作。主要人物的生死不写（剧透）；制作内部的说法（「节拍表标了」）换成玩家听得懂的话。
- 条目和文案的翻译 id 按下标生成；动顺序前 `grep -r "historyCodex.HistoryAndCreation" Taierzhuang1938/Data_Locale_*.mjs`，有译文就别挪。

### 6. 验证、上线

1. `node Taierzhuang1938/Script_TextTest.mjs`。报「字体少 N 个字」就重烘：
   `PYTHONUTF8=1 python Taierzhuang1938/Font/Script_FontSubset.py <源字体目录> --only Font_TitleText,Font_UiSans_Regular,Font_UiSans_Bold,Font_UiLatin_Regular,Font_UiLatin_SemiBold`
   源字体先在其他 worktree 的 `tmp/fontsrc/` 找现成的拷到本 worktree 的 `tmp/fontsrc/`；没有再按 `Taierzhuang1938/Font/README.md` 下载。
2. 抬缓存戳（格式 `YYYYMMDDNN`）：`index.html` 里 `Data_HistoryCodex.mjs` 的 `?v=`；重烘过字体，再把 `Style_Interface.css` 六条 `@font-face`、`index.html` 三条字体 preload 和 `Style_Interface.css` 自己的 `?v=` 一起改成同一个新戳。`HISTORY_CODEX_VERSION` 只管史料图片 URL，图没变就不动它。
3. 跑检查：
   ```bash
   node Taierzhuang1938/Script_HistoryLedgerAudit.mjs --check
   node Taierzhuang1938/Script_TextTest.mjs
   node Taierzhuang1938/Script_ModuleGraphTest.mjs
   node Taierzhuang1938/Script_TextGather.mjs --check
   ```
4. 起本 worktree 的预览（`preview_start` 用 `.claude/launch.json` 的 `preview`，或 `node scripts/Script_LocalPreview.mjs <端口> --no-open`），核对 `/__preview/ping` 的根目录是本 worktree，再跑
   `node Taierzhuang1938/Script_HistoryCodexBrowserTest.mjs --url=http://127.0.0.1:<端口>`
   （缺 `sharp` 就在 worktree 根 `npm install --no-save --no-audit --no-fund --no-package-lock --prefix "$(pwd -W)"`）。亲眼看 `Taierzhuang1938/_shots/HistoryCodex/` 里改过的那几组 `Scene_Ledger_*.png`。
5. 写回同步记号，带上这轮整页读过的每个 Notion 页的编辑时间（改过的页用改完后重新 fetch 的时间；没整页读的页别填，留着下次读）：
   `node Taierzhuang1938/Script_HistoryLedgerAudit.mjs --mark-reviewed --commit=origin/master --notion=<页面id>=<page_last_edited_at> ...`
   `--commit` 填这轮读的基线（rebase 后的 `origin/master`），别填自己还要改的提交。
6. 提交（标题 `<AgentName> Taierzhuang1938: ...`）、`git push origin HEAD:master` 快进，主检出在 master 且干净时 `pull --ff-only`；等 Pages 部署完，核对线上 `index.html` 的 `Data_HistoryCodex.mjs?v=` 和新条目文字。

### 7. 报告

用简洁中文，先讲结果：

```
资料馆 有记载 N / 类似 N / 创作 N / 出处待查 N，提交 <hash>，线上戳 <v>。
新增：<标注> 条目名——一句话（出处，打开时看到了什么）
改动：条目名——改了什么、为什么
降级或撤链接：条目名——原链接实际写的是什么
出处待查：条目名——缺什么
线上旧版有、新剧本没有：内容——建议（交给用户定）
没进账的：数字和尺寸（归复原说明）、主要人物生死
别处的旧口径：剧本/大纲末尾小节、旧版史实注记 Data_History 里与对照表对不上的说法
Notion：改了哪几页；截图：<路径>
```

只查不改的跑法用同一个格式，「新增」「改动」换成「建议新增」「现有标注可能不对」，不写提交和截图；子代理跑时直接把报告作为回复文字返回。

## 容易出错的地方

- Notion 里别的会话整理的出处出过错：FRUS 1938 第4卷第521号是7月1日汕头的轰炸电报，不是广州扫射救护人员；「欠租抵债」附的是小说。核对是这个流程里最值钱的一步，别跳过。
- 百度百科用命令行只拿到安全验证页，改用内置浏览器读；遇到人机验证就停，不要绕。
- 资产契约的 `reconstructionScope` 说的是「按设计做、不是史料规格」的部分，这些写成「创作」；`historicalReferences` 的链接也要亲眼看过（图片就下载下来看）。
- 空间设计里常有「日常摆件顺带当掩体」这类措辞，照原意写，别改成「专门摆的掩体」。
- 线上游戏的第一关还是旧版流程，Notion 的 01–05 新剧本目前只在白盒和预演里。资料馆写的是整部游戏的口径；线上旧版里有、新剧本删掉的内容，报告里单列给用户定。
- 「有记载」只给滕县这一仗本身有出处的事；别处、别年的同类事哪怕原句对得上，也只能是「类似记载」（「伤兵后送、毛巾塞伤口」就是这样从有记载降下来的）。
- 剧本「史料与创作」小节里的出处名、年龄、细节常常跟原文对不上（如把人民政协网的新闻写成「国家公祭网证言」）；照原文写，差异报给用户。
