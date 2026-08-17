# TunnelLight1943 项目规范（agent 必读）

《地道里的光》2.5D 横版白盒。改这个目录前先读本文件；改完跑「验证」一节。
本文件只放**每次都要守的硬规矩**和**去哪儿读细则的路由**；系统级的说明、判据、
坑都在 `docs/` 分册里（按需读，不自动进上下文）；事故过程与被砍的旧设计在
`Data_DesignHistory.md`；c1 逐拍梗概在 `Data_StoryC1.md`。

> **`ChapterOneImagegen/` 是冻结快照，别碰。** 2026-08-14 交付的整树副本，已分叉、
> 不维护。grep/搜索命中它一律跳过；改游戏只改本目录这一层。

## 路由表：改哪个系统，先读哪份分册

| 要改的东西 | 先读 | 里头是什么 |
|---|---|---|
| 台词 / 节拍 / 微过场 / 旗标 / 字卡 / 光柱 / 院外动静 / 叙事 | [`docs/Script.md`](docs/Script.md) | 剧本口径（描述≠旁白、settle/on()、活卡三处同步）、历史与叙事铁律 |
| 挪东西 / 换贴图 / 深度带 / 路面地面 / 绘制序 | [`docs/Depth.md`](docs/Depth.md) | 场景数据在哪、地面是三块、Z 轴深度规范、地平线规范 |
| 任何画笔 / 材质 / 人物长相 / 制服 / 头饰 / 剖面 / 房子 / 梯子 / 昼夜 | [`docs/Art.md`](docs/Art.md) | 画笔通病、材质是形、椭圆、小孩比例、脸八稿、遮眼、气泡、美术样式浏览器、人物与队伍、昼夜 |
| 姿势 / 轨道 / 爬梯 / 接触戏 / 步态 | [`docs/Rig.md`](docs/Rig.md) | 骨架姿势、静态姿势≠动画、爬梯落点表、接触戏两条硬规矩、动画工作台 |
| 景别 / 机位 / 过场运镜 / 后期分级 / 框景板 / 黑屏 / 插卡 / 小窗 | [`docs/Camera.md`](docs/Camera.md) | 镜头规范、过场三件套、框景板两条硬账、黑屏、活动插卡、地平线以下用 pip |
| 玩法步骤 / 动词 / 提示 / 掩体 / 潜行 / 翻越 / 收藏品 | [`docs/Interaction.md`](docs/Interaction.md) | 四个动词、拟物交互（第 0~12 条）、找东西不排直线、一个动作要多长、罚玩家先让他看懂、翻越尺度、藏身处、潜行四条、包袱 |
| 菜单 / 存档 / HUD / 拇指 / 目标牌 / 告示阅读层 | [`docs/Ui.md`](docs/Ui.md) | 主菜单与存档、HUD 清晰度、拇指落点、画框边缘牌、角上牌、程序化那张纸 |
| 拍图 / 量状态 / 改 `Script_Cli.mjs` | [`docs/Cli.md`](docs/Cli.md) | `state`/`shot`/`--eval`/`--pre`/`--hold`/冻帧/Settle 的顺序与坑 |

源码注释里写的「CLAUDE.md 拟物交互第 N 条」「CLAUDE.md 过场三件套」等，按上表进
对应分册找同名小节，编号没变。

## 开工三件事

**① 先用命令行工作台定位，别一上来就读源码**（`SmokeTest.TestCliAnswersQuestions` 守着；
由头见 `Data_DesignHistory.md`「先用命令行工作台」）：

```bash
node TunnelLight1943/Script_Cli.mjs
```

| 子命令 | 回答什么 |
|---|---|
| `where <片段>` | 这东西在哪：节拍/函数/画笔/道具/姿势/规范章节/中文台词/声音/HUD → `文件:行` |
| `beats [c1]` · `beat <id>` | 全部节拍 · 某一拍的步骤/区域/needs/旗标/台词/源码位置 |
| `state <id> [--x --level --step --input --flag --frames --json --cues]` | 无头跑到那一拍、喂真输入、打状态；`--cues` 验声音 |
| `shot <id ...>` / `shot "<id>@line=N,at=T,zoom=<谁>,<旗标>=1"` | 实拍→`_shots/`；过场钉格用 `@line/at`，别用 `--dur` 猜；`--probe` 报深度违规与手脚离地 |
| `menu [页]` | 拍菜单类界面（splash/标题/继续/确认/操作/设置/暂停/调试/anim/art；`--keys` 真按键 `--eval` 问一句） |
| `anims [片段]` · `anim <名字>` | 骨架全部动作清单 · 一条动作的关键帧/驱动/用在哪几拍。**改动画先在这儿点名** |
| `doctor` | 分支/上游落后/未提交/缓存戳/端口 |

- 要问游戏状态先跑 `state`，**不许现写探针脚本**；缺子命令就往 `Script_Cli.mjs` 加，加完写回上表。
- 要拨游戏开关用 `--flag`／`@key=v`；一条命令拍好几拍；「画面上这块是哪张网格」走 `--eval`。
- 过场对位以页面 F3 时间轴的「复制定位」为准（`c1_xx@line=N,at=T` 直接喂 `shot`）。
- 用法细则（`--eval` 是表达式、`pre → eval → hold → 冻帧 → 截图` 的先后、`Settle`）见 `docs/Cli.md`。

**② 场景物体不写在代码里**（详见 `docs/Depth.md`）：

| 文件 | 管什么 |
|---|---|
| `Data_Scenes.json` | 每个物体在哪：x / level / w / h / 旗标门 / 区域 / 掩体 / 翻越物 / 逐件 `band` 覆盖 |
| `Data_PropArt.json` | 每类物体长什么样、埋多深：画笔名 / 深度带 / 烘焙画布 |
| `Data_DepthSpec.mjs` | 深度带与尺度的**数值**（唯一一处） |
| `Data_Scenes.mjs` | 加载 + 解析 + 开局校验（配错立即抛） |

**③ 改完必跑「验证」一节。**

## 硬规矩清单（一条一行；细则与判据在分册）

### 剧本与过场（`docs/Script.md`）
- 剧本按章在 `Data_ScriptC1..C8.mjs`；帮手函数在 `Script_Core.mjs`；新章文件要登 index.html import map（`TestModuleGraphIsCacheBusted`）。
- **描述不是旁白**：`say+who`＝对白、`stage`＝真旁白、`act`＝演出说明（不上屏不配音）；字卡走 `state.titleCard`。c1 已分好，c2 起逐章翻新（`TestChapterOneShowsOnlyRealNarration`）。
- 旗标落在 `effect`，`on()` 只做画面；一整段戏只在微过场里的拍必须写 `settle`，且与 `on()` 调同一个函数。
- cinematic 不跑 `onStart`——过场拍的布景写在第一行的 `on()`。
- 新加活卡三处同步：每帧清、DebugJump 重置、Main 的 SetLiveCard；判定与作画共用同一份版面。
- 光柱：`CustomBlending` 真加法、绘制序过 `FixOrder` 排在压暗罩之后、直射必配间接光、人挡光走 `BlockedSeg` 解析不走步进。判据：`shot "c2_hush@hold=e,dur=1.2"` 光柱无等距横杠。
- 序章「院外动静」走 `SetDin/StopDin` 调度器，改完用 `state <id> --cues` 验，别靠听。
- 声音默认关（`SOUND_KEY`），别改回去；旁白/音效不许 `Math.random`，无头要能复现。
- 视频序章已删、`Video/`／`proN` 卡／旧旁白是无引用遗产，**别顺手删**（始末见 History）。

### 深度与摆位（`docs/Depth.md`）
- 带的数值只在 `Data_DepthSpec.mjs`，哪类物体用哪带只在 `Data_PropArt.json`（或 `Data_Scenes.json` 逐件 `band`）；**放置代码里不许写裸 z / renderOrder**。
- 摆位走 `PlaceZ(band)`，排序走 `SetPlayOrder/DepthOrder(band)`；行走线上的一切位置压回 walk 那条线；`world.DepthViolations()` 必须为空；`Script_DepthAudit.mjs` 逐章扫。
- 两个人绝不共用一个绘制序号——用 `SetPlayOrder` 第四参 nudge，不许改 z；`FixOrder` 不遍历，别拿它钉骨架。
- 落地贴图底边＝地平线，不许为观感手抬 y；例外走 `yOffset`。道具落点走 `DropSpot()`，不进掩体足迹。
- 地面是三张：`AddGroundPlane`（田，画不了细节，且是**一把刀**——地平线附近的东西先问在它上头还是下头）、`AddRoadPlane`（街面，只有调子）、`AddGroundBand`（几乎不管事）。**地面上不许有碎点**；路上要摆东西摆成道具。
- 一条街不许排在一根尺子上：纯布景件散到 `obstacle/clutter`，会做活的留 `walk`；挪完跑 `npm run scene:tunnelLight1943` + `Script_DepthAudit.mjs`。
- 主相机看不到地平线以下；要演井底用小窗（pip）那台相机（`PIP_LAYER`）。

### 镜头（`docs/Camera.md`）
- **全作只有一个景别档**（`Script_Main.PLAY_HW`），尺子是「人占画高多少」；`wide`≠全景，`HintShot` 封顶 `HW_WIDE_MAX`；**绝不许俯瞰全村**。
- 玩法段镜头只跟人走、永不旋转、不自己摇（`CAM_CELLAR_PEEK` 默认 false）；过场可 `kind:"free"` 自由运镜，守四条尺度（偏航俯仰小幅、画宽≈机距、室内不越屋高、门不给正脸）。
- 路过的注视不许接管镜头：走路途中的 goto 不许起 `StartMicroCine`；手记 toast 一次一条。
- 屋里的戏立面必须**让开**（绘制序挪到演员之后）而不是变透明；微过场也算过场。
- 分级后期常开、过场与玩法同一条曲线；只动明度不动色相；把手是 `GRADE_GAMMA`，改之前先实拍逐像素量。
- 框景板 `fg` 必写 `dim`（照 `Data_ScriptC1` 顶上 `FG` 表）、往主体另一侧塞、等距同宽描墨线＝一排零件。
- 黑屏黑到底（`#fadeOverlay` 层级在字幕之下）、空黑 ≤ 短旁白的长度；硬切用 `cut:true`。
- 正脸/手势只能走活动插卡（`Art.INSERT_LIVE`），改卡用 `Script_ArtPreview.mjs card:<名>`。

### 画笔与人物美术（`docs/Art.md`）
- 画的顺序跟事情发生的顺序一致；四边笔直＝没有手；**不许在有内容的画布上用 `destination-out`**（唯一例外：立面门洞）。
- 材质靠形不靠颜色（`ClothFold`/`CharScale`/`DrawAshHeap` 三支通用笔）；一团东西只许一条外轮廓；手绘画布上不许出现完美几何形；横躺圆柱不画端面椭圆；细长件不铺龟裂鳞。
- **朝上的那一面一律画出来，压扁多少由机位算（`TopRy`/`TopFace`，夸张系数 `TOP_STYLE`），别在画笔里手写 ry**——一屏里只有两件有透视比全都没有还别扭；用户点名「有点透视」的那件就是他要的样子。**贴地的东西一丝不许压到地平线以下**（底圆最低点落在 `groundY`，往下探的只有 `NEAR_Z` 一族与 `MakeShaftMouth`）。
- CanvasTexture 没声明 sRGB 会提亮，**配色一律往下压、必须页内实拍看**，别信色值。
- 骨架零件两头是圆的；小孩不是缩小的大人（`FK/CY`、`HEAD_K`、`LK`、`boyScale` 四层，腿长故意不动）；`footF` 必须等于 `BONE.sole × 体型`。
- 自家人不画脸，表情走 `DrawMoodBubble`；日军/军官走 `hard` 一路；眼睛由头发/帽檐**真的遮住**，眼窝不抹阴影；耳朵必须画。
- 脸的预览必须按游戏的 `k` 给；线宽是「不像人」的正主；五官 `clipFace()`；**改完脸/帽子九种角色一次全看**（`--eval` 九连渲或设置→人物美术样式）。
- 三种兵剪影一眼分开（`Script_Art.UNIFORM`）；伪军是本乡人不做丑角；行军是「排」不是一条线（`RAID_ORDER` 唯一真相）。
- 房子是盒子（假机位钉东墙外，`Recede/EyeY/VanishX`）；门框连门垛画；门只有一个（加载期校验抛）。
- 昼夜是连续曲线（`Data_DayCycle.mjs`），时间只往前走；日伪在村天色就阴（`raidGloom`）。

### 骨架与动画（`docs/Rig.md`）
- **改动画先 `anims/anim` 点名**（或 F4 工作台），别靠描述/截图；退回动画先开工作台。
- 台词里带过程的动词一律走关键帧轨道（`FlashTrack`），`FlashPose` 只留给真只有一格的东西；轨道插值走单调 Hermite，不过冲。
- 有过程的动作三样齐：起手接上一个姿势、有预备动作、成对（被抱/被打的一方有自己的轨道）。
- 膝只能往后屈（`shin ≥ 0`）、肘只能往前屈（`fore ≤ 0`）；`ApplyPose` 硬夹、IK 先挑解剖对的解；改姿势**先算落点再写角度**。
- 胳膊挂在胯上、肩点按躯干角算；四肢 0°＝指向下、脚贴图 0°＝指向前；世界角超 −90° 就是「举起来」。
- 闲着的手顺重力吊、肘要折、左右不同角；低头别低成干呕（头的世界角判据）；三人一排同朝向＝复制人。
- 躺着的姿势不掰关节，整具骨架转 90°（`LIE_POSES`），角度在躺下之后反算。
- 进度驱动的姿势必须登进 `PoseProgress`，Rig 里读 `s.poseK`；`??` 会被 0 吃掉。
- 触地量 `world.PlayerLimbTips()`／`LimbTipsOf`；接触戏先站到一臂之内、受方轨道从负 t 起、落点按实物量（无测试守着，用 `LimbTipsOf` 量间距）。
- 爬的东西全走 `Data_Ladder.LadderHolds` 落点表 + `Script_Climb.PlanClimb`（`TestClimbPlanLocksToRungs`）；换层不许瞬移，`lift` 自己走完；抱着的人跟着换层。
- 抱人：肘吊下来、坐在胯上（`SEAT_LIFT`）、`childArms` 静止帧与 `scoopChild` 末帧只许一处真相。

### 交互（`docs/Interaction.md`）
- 全作只有四个输入：E / 长按 E / E＋←→ / E＋↑↓（`stroke`），键帽必亮；缝三针保留 `pointerCard`（用户点名）。
- **进度条/QTE 轨道禁止**（`TestGestureBlobStaysDead`、`!state.dragTrack`）；玩家操纵的必须是画面里那件东西；物体要答话；HUD 上不留进度指示。
- 长按+进度环只留给「保持一个状态」（`sustain:true`）；做功的拍不许有可拖的 HUD 轨道。
- 认不出的小件推镜头治不好——实际尺寸÷画宽太小就上活卡（`TestGrabbablesAreBigEnoughToRead`）；活卡底透明、背后真景散焦、cam 给背景景别。
- 指尖上的活不给长按后备；删后备必须给驱动器一条真输入的路（`GetBeatTarget`），HUD 上那颗键一起撤。
- 新加做功步骤：驱动器要按方向（`holdAt`+`stroke`），漏了自动通关卡死；判定圈钉在 `state.handAt`。
- 手必须真落在那件东西上（IK 到挂点，RenderHealthTest「手真落在挂点上」）；会被手挡住的小件排在人之前。
- 玩法先有由头（前因后果用画面交代）；动作要对得上被做的那件事；「按一下 E 就完」不算交互；抽象手势图标已拆除别再造。
- 找东西不排成直线（`searchAny`，`StepChain/GetBeatTarget/BeatHintIcon` 三处都认）；每处东西不一样且都有用；相邻两道手别同一动词。
- 罚玩家之前先让他看懂：门的开关画在画面上、输入写进 prompt、同一场戏一章只演一遍；写了没人读的状态字段＝提示不存在。
- 翻越尺度只在 `Data_DepthSpec`（`VAULT_*`），抬升算绝对米数；曲线是带平台的梯形不是正弦。
- 藏身处＝前景里一件挡得住人的实体（`clutter` 带掩体），不是阴影；高度必须实拍量；判定区＝那件东西的足迹。
- 潜行四条：藏＝站到掩体背光面 / 危险先看得见再生效 / 动得越猛越显眼 / 每道关口两条出路。
- 收藏品每件要真有史实出处、注解成掌故；开合判断看 `bagOpen`；疑兵草丛必须掺。

### UI（`docs/Ui.md`）
- 标题页只有一列条目、版式照《勇敢的心》（活场景打底＝`state.tableau` 那台戏，不存档不走 StepGame；按任意键→红条菜单）；选关只在调试面板；一个自动存档位按幕存、认 id 不认序号；设置面板即暂停（`MenuFrozen`）；改完必看 `menu` 实拍。
- 会被盯着看的 canvas 必须超采样（`HINT_SS/PROP_SS/DETAIL_SS`）。
- 拇指落点上不许压别的东西：判据用画高不用画宽、通知不吃触摸、底边让开安全区（RenderHealthTest「拇指控件三态无遮挡」）。
- 目标 HUD 只有左上角那一枚牌（`#objectiveTab`）＋出框时画框边缘牌，同源同画笔（`Core.BeatHintIcon` ↔ `Art.HudGlyph`）。
- 阅读层那张纸程序化画（`Art.DrawNoticeSheet`）：繁体竖排自右向左，字号搜到装得下的最大档，做旧上限由字定。

### 历史与叙事铁律（`docs/Script.md` 末节，改玩法/文案前过一遍）
- 每个玩法元素过「1942-43 华北敌后穷苦农村会有这个吗」。
- 画面里的汉字按 1942 年写法：繁体、竖排或横排自右向左、「徵」不作「征」；告示是纸、标语是石灰水。
- 派差事必须有前因后果；新地点/新人物先在画面里出现过再让玩家去找。
- 旁白不实况复述；惊变时刻旁白闭嘴走同期声；日军讲日语无字幕。
- 被护送者永不成为失败原因；首败无文字；重试 ≤15 秒；潜行重置点不落在敌人视线里。
- 全作是冀中平原，不许画山；只有一个景别档，不许俯瞰全村。

## 项目事实（会变的状态，过期就改这里）
- 玩家只见前两章（`PLAYABLE_CHAPTERS`）；c3 起仍是旧线，与新一二章尚未接上。
- three.js 收在 `vendor/three/`，不吃 CDN。
- 新台词配音未烘（`Voice_Manifest` 没有的行静默出字幕）；有 TTS 环境时跑 `Script_VoiceExtract` + 烘焙流程。
- 第九稿下线但机制留着的：接绳活卡、辘轳墩桶/拽到井沿（`simple:true`）；别顺手删。

## 写规矩的格式（防止本文件长回去）
1. 新规矩三行以内：**【规矩】一句 / 【为什么】一句 / 【守着它的】测试名或 `shot` 判据**。超过就去对应 `docs/` 分册。
2. 事故过程、日期、用户原话、实测数字写进 `Data_DesignHistory.md`；分册里只留结论与判据。
3. **数值只在代码里**（`Data_DepthSpec` / `Data_Ladder` / `PLAY_HW` …），文档写常量名不抄数。
4. 一条规矩有测试守着就写测试名，不必再讲事故。
5. 本文件超过 400 行就该瘦身，不是加分册。

## 验证

自动通关的驱动器要走进判定区才按得响：`GetBeatTarget` 交出 `reach`（＝zone 半宽），走位与按键用同一个数；新加窄判定区不用迁就常量，但 zone 半宽别小到人挤不进去。

```bash
npm run test:tunnelLight1943            # node：自动通关全 8 章双分支 + 机制断言 + 场景体检
npm run scene:tunnelLight1943           # 场景清单：谁在哪、埋多深、用哪支画笔
npm run test:tunnelLight1943:browser    # 浏览器：逐章渲染健康 + 跳幕体检
node TunnelLight1943/Script_DepthAudit.mjs   # 落地体检（悬空/陷地）
node TunnelLight1943/Script_Cli.mjs doctor   # 开工前：分支/落后/未提交/缓存戳/端口
```

改完某一拍，最快的自检是把它单独跑一遍再看一眼：

```bash
node TunnelLight1943/Script_Cli.mjs state c1_well --x 43.0 --input "e,d*300"
```

改台词以代码为准，用 scratchpad 的 extract-script 流程回写 Notion（见项目记忆）。
