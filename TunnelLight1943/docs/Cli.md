# 命令行工作台：用法细则

> TunnelLight1943 规范分册（从 CLAUDE.md 拆出，2026-08-18）。**改 `Script_Cli.mjs`、拍图、量状态之前读。`node Script_Cli.mjs` 无参打印子命令表；这里是那张表背后的坑与顺序（pre → eval → hold → 冻帧 → 截图）。**
> 硬规矩摘要与各分册的路由表在 [`../CLAUDE.md`](../CLAUDE.md)；本文件按需读，不自动进上下文。
> 往这里加条目：**【规矩】一句 / 【为什么】一句 / 【守着它的】测试名或 shot 判据**；
> 事故过程、日期、用户原话、实测数字写进 [`../Data_DesignHistory.md`](../Data_DesignHistory.md)，数值只写常量名。

## 先用命令行工作台，别一上来就读源码

```bash
node TunnelLight1943/Script_Cli.mjs
```

| 子命令 | 回答什么 |
|---|---|
| `where <片段>` | **这东西在哪**：节拍 / 函数 / 画笔 / 道具登记 / 骨架轨道姿势 / 规范章节 / **中文也认**（台词/提示语/章名/场次/老物件）/ 声音（cue/BGM/混音）/ HUD（DOM id/样式） → `文件:行` |
| `beats [c1]` | 列出全部节拍（章 · 序号 · id · kind） |
| `beat <id>` | 某一拍的全部：步骤/区域/needs/prompt/旗标/台词/源码位置 |
| `state <id> [选项]` | **无头**跑到那一拍、喂真输入、把状态打出来（`--x --level --step --input --flag --frames --trace --json --cues`） |
| `state <id> --cues` | **这一段响了些什么**（哪几种音效、各几声、音量区间）——声音是截图问不出来的那一样 |
| `shot <id ...> [选项]` | 实拍（真浏览器真键盘）→ `_shots/`（`--pre --step --hold --dur --phases --actor --clip --flag --probe --eval`）。**可以一条命令拍好几拍** |
| `shot <id>@line=N,at=T` | **钉到"第 N 句台词的第 T 秒"**那一格（拍过场用这个，别拿 `--dur` 猜）。**微过场也认**：链的某一步 `effect` 里起的那种，配 `step=N,pre=e,cine=keep` 用，数的是 `microCine.i` |
| `shot <id>@zoom=<谁>` | 顺手再裁一张近景（`zoom=sister` / `zoom=player` / `zoom=31.15:0.2`） |
| `shot <id>@hold=d,dur=1.5,live=1` | **拍走动中的那一格**（走/跑姿势、脚下的土这类随步子发的东西）：按住键、不冻帧不 Settle。默认的 hold 拍在走满 dur 后冻帧再 Settle 三秒——位移归零，走路是按位移判的，人当场站定、土也散了，拍出来永远是站姿 |
| `menu [页 ...]` | 拍**菜单类界面**（`splash` 按任意键那一屏 / `title` / `continue` 有存档 / `confirm` / `controls` / `settings` / `pause` / `debug` / `anim`）→ `_shots/menu_*.png`。`shot` 一上来就 StartGame，看不到标题页；各态怎么摆（存档要先写 localStorage 再刷新、确认框要有档才弹得出来、第一屏要真按一下键菜单才出来）都固化在这儿。`--keys ArrowDown,Enter` 真按几颗键再拍（验回车按不按得下去），`--eval` 截图前在页面里问一句（同 shot）。`menu anim --anim scoopChild --at 0.55` 拍动画工作台钉在某一秒 |
| `anims [片段]` | **骨架里全部动作的清单**（56 轨道 / 48 姿势 / 19 步态）：名字 · 时长/循环/帧数 · `Script_Rig.mjs:行` · 谁在用 · 用于哪几拍。改动画先在这儿点名，别再描述画面 |
| `anim <名字>` | 一条动作的全部：源码说明 / 关键帧表（每帧的 14 个关节值 + 行内注释）/ 由什么驱动（poseK/poseU/呼吸/相位）/ 用在哪几拍（文件:行 + 节拍 id + 谁）/ 一行可贴的引用 |
| `doctor` | 分支/上游落后/未提交/缓存戳/端口占用 |

**页面里还有一张过场时间轴（2026-08-17 加，`Script_CineTimeline.js`）**：F3 /
`?cine=1` / 设置 → 「调试 · 过场时间轴」。底栏 Unity Timeline 式：台词／镜头／
on()／框景／音效／微过场六条轨，拖播放头游戏就推到那一格并冻住（渲染照跑），
右侧检视器给这一格的句、镜头参数、台上每个人的位置/姿势/轨道。**用户与 agent
对过场说事，以它的「复制定位」为准**——复制出来的第一行就是 `shot` 吃的那一串
`c1_thatday@line=5,at=1.20`（后面几行是台上状态与备注），agent 拿它
`node Script_Cli.mjs shot "…"` 拍到的就是用户看到的同一格；「拍这一格」在本地
DevServer 上直接落 `_shots/cine_*.jpg`（定位＋路径一起进剪贴板）。时间的口径只有
Core 的 `CineTimeTable / CineLocator` 一处（面板与 CLI 共用），别另立一套秒数。
它**不改剧本**——改台词仍去 `Data_ScriptC*.mjs`。键：空格 播放/暂停、← → 逐帧
（Shift ×10）、[ ] 上一句/下一句、Home/End；倍速 0.25~4×；`⟲句` 循环当前句。
往回拖＝重跳这一拍再推（几毫秒），链里起的微过场只能往前推（它回不去）。
钩子：`TunnelLight.CineTimeline.{Toggle,Seek,SeekTime,Locator,SetSpeed}`。


- **要问游戏状态，先跑 `state`，不许现写探针脚本**；缺子命令就往 `Script_Cli.mjs`
  里加，加完写回这张表。一次性脚本写完就扔，下一个 agent 还得重写一遍。
- **要拨游戏里的开关，用 `--flag`**（`state` 和 `shot` 都吃）。地道挖通没有、
  门修好没有、车上装了几件料——这些是/否的记号决定画面长什么样，要拍
  「没挖通 / 挖了一半 / 挖通了」三张对比图就得能手拨：

  ```bash
  node TunnelLight1943/Script_Cli.mjs shot "c2_digout@x=42.3,level=under,tunnelDug=0" "c2_digout@x=42.5,level=under,digStarted=1,out=挖了一半" "c2_digout@x=43,level=under,tunnelDug=1,out=通了"
  ```

  `@` 后面**认识的键是参数（x/level/hold/dur/pre/actor/cine/out/clip/phases），
  不认识的一律当开关**——不用再记第二套语法。旗标在跳幕与微过场之后才写进去，
  所以 beat 自己的 `onStart` 盖不掉它。
- **一条命令拍好几拍**，共用一个浏览器；跨章也不用重开页面（`JumpToBeat` 吃章号）。
  实测：6 拍跨 5 个章节 19 秒；一拍一条命令要 40 秒，而且每次都要重写引导代码。
- **要问"画面上这块是哪张网格"，用 `--eval`**（截图前在页面里跑一段 JS 并打印
  结果，拿得到 `tl/state/world`）。页面渲染只在浏览器真的合成帧时才跑，所以
  这类问题**只能走实拍这条路**——`state` 子命令是无头的，`world` 里一张网格都没有。
  排查配方：先 `world.debugLayers().layers.play` 列出可疑区域的 `renderOrder/z/宽高`，
  再把嫌疑网格 `visible=false` 或 `material.color.setRGB(3,0,0)` 重拍一张对比。
  **别按 x 过滤网格**——横贯全场的那几张（地表断面带 230m 宽）中心点在场景正中，
  按"离目标 4 米内"一筛就正好把真凶筛掉了（井那次就绕了这个远路）。
  两条用法细则（2026-08-15 改抱姿时各栽了一次，加起来白跑五六轮）：
  · **`--eval` 收的是一个表达式**（内部是 `return (你写的)`，带 `tl/state/world`
    三个参数），写 `const x = …` 当场 SyntaxError；要写多句就套一个 IIFE。
  · **`--eval` 在 `Settle` 之前跑**，而骨架是渲染侧摆的：拿 `LimbTipsOf` /
    `PlayerLimbTips` 量姿势前，必须自己先在表达式里
    `tl.StepFrames(n), tl.Settle(m)` 把两侧都推够——不推的话量到的是**上一帧**
    的骨架，改了角度也纹丝不动，看着像"改了不生效"。同一条老规矩的新证据：
    **看不到本该变的东西时，先想是不是渲染侧没走够帧。**
  · 顺带：`--dur` 在无头下推不动游戏钟（rAF 几乎不走），想让一条 1.1 秒的
    `FlashTrack` 过期，也得靠 `tl.StepFrames(n)`，别指望 `dur=2.4`。
  · **三件事的先后是 `pre` → `--eval` → 按住 `hold` → 冻帧 → 截图**（2026-08-17
    拍抱人动画时白跑了三轮换来的）。两条推论：
    ① **`--eval` 看不到"按住键才存在"的状态**——它在按键之前跑。要 eval 观察
      长按中段（`holdP`/进度姿势/刚起的轨道），把操作放进 **`--pre "Ew*40"`**
      （`Ew`＝E＋↑ 同一帧，四动词的做功都是这种组合 token），eval 就看得见了；
    ② 反过来，**光靠 `--pre` 拍不到长按的姿势**：`pre` 跑完之后 rAF 还在跑无输入帧，
      `holdP` 一路衰减、`p.pose` 当场清掉，截出来是站姿（报告里 `pose=null` 就是
      这个）。**拍长按中段必须真按住**：`@hold=ew,dur=0.35`——按住时 `dur` 是
      盯着 `state.time` 等的，游戏钟真的会走。
- **`--probe`**：截图同时报两件**有明确对错**的事——深度带用错没有
  （`DepthViolations`）、手脚离地多少（`PlayerLimbTips`）。**好不好看得自己看图**，
  这个开关不替你判断画面，只是把已有的两个体检数顺手打出来。
- **拍过场里的某一格，用 `@line=N,at=T`，别用 `--dur`**（2026-08-12 睡姿那次为此
  白跑了十几轮）。`--dur` 是从整拍开头算的：改一句台词的时长，后面全错位；而且
  推完之后还要等渲染追上（镜头缓动、立面淡出、光照换挡都要真渲染几帧），
  那半秒里游戏又往前走了——截出来的根本不是你要的那一格。现在 `shot` 在拍之前
  **冻帧**（`TunnelLight.Freeze`：游戏钟停住、渲染照跑），所以 `at` 说几秒就是几秒。
  **"这东西在画面上哪儿"也别再靠猜裁剪框**：`@zoom=sister` 直接给一张近景。
- **要截图，跑 `shot`**。那套引导代码有三个必踩的坑，已经固化在里面：
  `ServeRoot` 的 rootDir 必须 `path.resolve`（正斜杠字符串会 403）、页面 load 完
  `tl.state` 还是 null 得先 `StartGame`、**拍姿势必须真按键**（`FlashPose` 只有
  0.2 秒，`StepFrames` 之后的等待里 rAF 还在跑无输入帧，截出来全是站姿）。
  跳幕之后**等圆形黑幕拉开再拍**（轮询 `TunnelLight.iris`，Script_Main 挂的调试
  钩子）——死等固定秒数会拍到一个圆洞，而且等多久随机器快慢变，猜不准。
- **渲染侧的时间只在 rAF 里走，而无头浏览器没有合成器、rAF 慢到几乎不动**
  （实测 `--hold e --dur 12` 之后游戏钟只走了 0.58 秒）。`StepFrames` 推的只是
  `StepGame`；镜头缓动、立面淡出、**昼夜换挡（2.6 秒）**、光柱亮度吸附全在
  渲染那一侧。所以 `shot` 每拍之前还会调 `TunnelLight.Settle(n)`（2026-08-13 加）
  把渲染侧也推够帧数——不推的话拍到的是**过渡刚开始**那一格：序章那间该黑的
  窖一直拍成亮的，看图的人会判成"光根本没做出来"。
  **看不到本该渐变出来的东西时，先想是不是渲染侧没走够帧，别急着改数值。**
- **声音用 `state <id> --cues` 验，别靠听也别现写探针**。注意 `state.cues` 是
  只进不出的队列，**清空是宿主的活**（`Script_Soundtrack` 每帧 `cues.length = 0`）：
  自己收的时候不照做，就是每帧把整条队列重数一遍——18 秒的序章会报出
  "响了 20951 声"。
- **声音（旁白/音效/配乐）默认是关的**（用户定；2026-08-14 又从"默认开"回归过
  一次，别再改回去）：`Script_Main` 里 `localStorage.getItem(SOUND_KEY) === "on"`，
  没开过就是静的，开关记在本地。`Script_BgmTest` 因此要在 `addInitScript` 里
  先把那面本地开关拨开——它测的是"开了声音之后 BGM 怎么走"。
- `SmokeTest` 的 `TestCliAnswersQuestions` 盯着它——CLI 坏了不会有别的测试变红。

## 工作目录、帧数、投掷实拍的几条坑（2026-08-18 从项目记忆并入）

- 【规矩】**在 worktree 里干活必须在 worktree 根目录跑 `shot`**——它照当前工作目录那份仓库起服务，在主仓库路径下敲拍到的是旧代码且不报错（表现是「加的台词一句没出现、@line=N 溢出到下一拍」）；开拍前 `doctor` 看「仓库」那一行。
- 【规矩】worktree 里默认没有 node_modules：`shot`/`Script_RenderHealthTest`/`Script_DepthAudit` 都要 playwright，先 `npm i -D playwright-core`，**跑完 `git checkout -- package.json`**，别把版本号漂移带进提交。
- 【规矩】`TunnelLight.Tick(n)` 的 n 是**帧数**（1/30s），不是秒；SmokeTest 的 DT=1/30，逐帧交互测试的帧数按它算。
- 【规矩】浏览器实拍投掷类交互：屏幕坐标每次 move 前用当下相机重投影，相机跟随会漂，提前算好的一组坐标会拽歪。
- 【规矩】`?fast=1` 只在静音时生效（开着声音旁白仍正常语速，每句被切在半截，像「台词没说完就切镜头」复发）；调完把预览页导回不带参数的 URL。
- 【规矩】面板隐藏时 rAF 停走、canvas 被压成 0×0——没有 playwright 也看不到画面时，`world.Resize` → BuildEnvironment/UpdateActors/UpdateProps → ApplyCamera → Render → `gl.readPixels` 同一个任务里跑，就能做像素级断言；DOM HUD 无法用 canvas.toDataURL 验证（只抓 WebGL 缓冲），只能验根因（fonts loaded、transform none）。
- 【规矩】只调 `StepGame` 验证镜头或 HUD 等于什么都没验——它们只在 `RunFrame` 里更新；`ReadInput()` 钩子走真实输入路径。
