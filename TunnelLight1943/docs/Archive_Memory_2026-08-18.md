# 归档：2026-08-18 从项目记忆并入 docs 后删掉的原文

> 这些条目的规矩已并入 `docs/*.md`（或本来就与 CLAUDE.md 重复），原文照录在此只为可追溯。
> **不进上下文、`where` 不索引**；确认 docs 里没漏什么之后可以整个删掉。

## tunnellight-25d-feedback

```markdown
---
name: tunnellight-25d-feedback
description: 用户对地道里的光的硬性要求：勇敢的心式横版2.5D、镜头禁止3D飞行插值、路过的注视不许接管镜头
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 7009bc7c-bf83-4784-bc83-968869259d26
  modified: 2026-08-14T04:37:19.623Z
---

《地道里的光》第一版做成了第三人称俯视 3D，用户判为**致命错误**：要的是《勇敢的心：世界大战》那样的横版 2D/2.5D；且过场镜头在 3D 空间长距离插值会"飞来飞去"。

**Why**：关卡设计文档开头就写着"参考《勇敢的心：世界大战》的章节结构"——参考对象的呈现形式本身就是需求的一部分，不只是章节结构；镜头插值晕眩感是硬伤不是风格偏好。

**How to apply**：
- 该项目（及用户的叙事向游戏原型）默认横版 2.5D：x 横轴 + 层（地表/地下剖面），视差背景，地道题材用"蚂蚁农场"剖面。
- **玩法段**镜头只允许横移/升降/推拉，**永不旋转**；过场构图切换用硬切+行内慢推（VH 语法），转场用 iris 圆形收光。
- **过场段 2026-08-13 起放开**（用户："把序章改成真正的实机过场动画……不用拘泥于2d视角，要勇敢的心那种过场动画的形式"）：cinematic 行可用 `cam:{kind:"free", from/to/at/atTo/roll}` 自由运镜（Main 插值、World.ApplyCineCamera），偏航/俯仰≲25°、画宽≈机距、室内画框顶≤屋高 2.4m、室内过场第四堵墙全隐（filmic）——四条尺度与范例（c1_thatday 序·那天）已写进 TunnelLight1943/CLAUDE.md 镜头规范。**别把这个 kind 用到玩法段，也别把玩法段的永不旋转"顺手统一"掉。**
- 用户给参考作品时，先确认呈现形式（视角/镜头/美术）是否也是要求，别只抽结构。

**推特写做功的那几拍，背后必须是真景散焦，不许纯色底板（2026-08-10）**。
用户原话：「镜头在打刨花的时候 为什么后面的场景不拍出来？搞的像在玩一个独立的
游戏一样，为了沉浸感你大可以远景做DOF嘛，但你搞了个纯色背景算什么」。
刨料/划线/接绳三张**活卡**（铺满画框、手按在上面）当初都铺了一整块渐变底板，
世界照旧在渲、只是被盖住。现在：`Art.LiveCardBase` 留透明底，`World.Render`
见 `dofOn` 就把世界渲进 40% 的离屏靶、横竖各一遍 9 抽头高斯、压暗压暖铺回画面，
卡再画在上头（**代价反而更低**：世界只按 16% 的像素渲一遍）。配套三条缺一不可：
① 活卡那一拍的 `cam` 给的是**背景的景别**（4~5m 半宽），不是特写——特写归卡管，
贴着台面 2.9m 拍背后只剩一片天；② 世界里的找路 UI 按 `liveCardOn` 收掉（糊成
一团的黄三角比不画还糟）；③ 定格插卡（过场里那几张画）不在此列，它们本来就是
一张画。这条也适用于以后任何"把镜头推进去做一件手上的活"的设计。

**路过的注视不许接管镜头（2026-08-13，用户暴怒级退回）**。第七稿 c1 在
出门路上放了两个 goto 触发的"无言的注视"微过场（纺车/弹孔墙；回程秃榆还有
两个）——微过场第一镜默认 iris 收黑，玩家读到的是"出门几步连吃两个切黑屏+
夺操控"。用户原话：「直接打断游戏体验 老子不是说过要改掉吗！这种弱提醒一下
不就好了」。
**Why**：走路途中的环境交代不是事件，配不上一次镜头接管；黑屏转场的代价
只配给真正的场景跳转（出村黑场那种 teleport）或玩家自己按 E 换来的特写。
**How to apply**：路过要交代的东西＝道具画在路边 + 链步骤 `note:` 出手记
toast（与 lookables 同口径），脚不停；过场只留给事件（车铃一响）和玩家
主动交互。规矩已写进 TunnelLight1943/CLAUDE.md 镜头规范一节（a9da41c）。
以后改剧本/加"镜头看一眼"的桥段，先过这条——这是用户第二次为同类打断发火。
同日第二轮（1d79e58）：「第一个交互是空的……没用就干掉」——toast 一次只挂
一条、后来的顶掉前面的，两个触发点隔得比一句话的阅读时间近（纺车↔弹孔墙
2.5m）第一条就是白写；挨太近的合成一条或整个删步骤（纺车已退回纯布景）。
交代性内容的删改不用请示，用户要的是干净的动线。

**「真正的过场动画」＝画，不是运镜（2026-08-14 第二次退回）**。用户拿六张
勇敢的心过场截图再退一次序章，并追加「也有这种左右分的镜头，和运镜」。
上一轮已经给了自由运镜，可实拍出来还是"游戏截图换个角度"：一屏米黄压米黄、
人物占画高三成、半屏空墙、**画面里没有一处是黑的**。
**Why**：差距不在镜头路径，在画面本身——这套画的贴图全是 CanvasTexture 没声明
colorSpace，上屏被提亮两档；而参考图里黑是构图的一部分。
**How to apply**：以后收到"不像过场/不够电影感"，先按这三件查，别先改运镜——
①**全屏分级**（对比+分离色调+晕影+颗粒，只在过场）；②**前景框景**（门框柱/
房梁/炕沿/瓮肩，压得很暗、被画框切掉——参考图**每一张**都有）；③**景别推到
人物占画高七八成**。三件的实现、坑与数值都在 TunnelLight1943/CLAUDE.md
「过场三件套」（commit 73830f4）。分屏 `cam:{kind:"split"}` 也在那儿。

相关 [[tunnellight1943-workflow]] [[tunnellight-contact-staging]]。
```

## tunnellight-anim-lab

```markdown
---
name: tunnellight-anim-lab
description: 《地道里的光》动画工作台（设置→调试·动画工作台 / F4 / ?anim=名字）+ CLI anims/anim——动画退回按名字点名，别再描述画面；索引怎么扫、哪些地方要同步
metadata: 
  node_type: memory
  type: project
  originSessionId: 24320616-d8b6-4326-9922-b74eac367f6a
  modified: 2026-08-17T14:54:45.986Z
---

2026-08-17 用户定：「按照动画名称指定重做，而不是靠描述/截图画面」→ 做了
**动画工作台**（commit 46e1480，合并上游 F3 时间轴后 5e1b702 上线 v=131）。

- **入口**：设置面板 → 「调试 · 动画工作台」/ `F4` / `index.html?anim=scoopChild`。
  全屏三栏：左清单（56 轨道 / 48 姿势 / 19 步态，搜名字/说明/节拍/谁在用），中预览
  （自带 THREE 渲染器 + `CreateRig` 同一具骨架喂 `PoseRig`，循环播/时间轴关键帧刻度/
  逐帧/换人 KIND_PRESETS/翻朝向/关键帧叠影/手脚头轨迹/离地量具/逐帧精确），右栏
  （`Script_Rig.mjs:行`、时长/循环/帧、源码说明、关键帧表、驱动、用在哪几拍、此刻关节值）。
  **「复制引用」**出一行：`轨道 scoopChild · Script_Rig.mjs:503 · 1.45s 单次 · 6 帧 · 用于 c1_descend / c1_tally · 柱子`。
- **CLI 同一份索引**：`node TunnelLight1943/Script_Cli.mjs anims [片段]` / `anim <名字>`；
  实拍 `menu anim --anim x --at 秒 --kind sister@0.60 --ghosts --flip`（要 playwright-core，
  worktree 里 `npm i -D playwright-core` 后 `git checkout -- package.json package-lock.json`）。
  钩子 `TunnelLight.AnimLab.{Open,Close,Select,Seek,Play,SetKind,SetOptions,LimbTips,Ref,Entries}`。
- **索引 = `Script_AnimIndex.mjs` 纯正则扫源码**（浏览器 fetch 同目录 .mjs / node fs 共用）：
  TRACKS 块二级键、PoseRig 那串 `if (s.pose === …)` 链、CALM_BREATH/NO_HIP、World 的
  PoseProgress/LIE_POSES、用法按名字前的字分类（FlashTrack/holdPose/track=/pose:/check）
  + 最近的 `id: "cN_x"` / function 名 + 主语→骨架种类猜测。**步态分支的条件文字改了要同步
  `LOCOMOTION[].cond`**（对不上清单里报「源码里没找到条件」；SmokeTest
  `TestAnimIndexIsComplete` 对账每条轨道/姿势/步态）。
- 上游同日有 **F3 过场时间轴**（Script_CineTimeline.js）与爬梯重做（`s.climb` 走 ClimbPose，
  工作台里没有梯子只演后备支）。两块调试面板并存：MenuKey 里工作台在最上层。
- **人物美术样式浏览器（设置→人物美术样式，另一会话建的）右栏 = 工作台的小舞台**
  （2026-08-17 用户退回「整身有点小、不能预览动作」，commit 258d86c）：`CreateRigStage`
  按 `DefaultPreset` 戏里体型跑这个人自己的动作（`EntriesForKind`），「工作台 ▸」跳过去；
  `menu art --who sister --anim loco:run` 实拍。老坑：`DrawCharacter` 收 `spec.scale`，传 `S` 没人读。
  这仓库并行会话多，推 master 前必 fetch+merge，缓存戳取上游最新 +1。

**Why:** 之前退回动画要先猜是 scoopChild 还是 scoopReach 还是 childArms，再实拍逐帧核
十几轮；有名字一句「scoopChild 第 3→4 帧太快」就说清。
**How to apply:** 用户退回动画 → 先 `anims 片段` / 开工作台点名、看关键帧表与量具再改；
改完 `menu anim --anim x --at t` 实拍对比。工作台顺手就能量出老问题（如 pullClose t=2.4
脚陷地 −0.16m）。相关 [[tunnellight-animation-tracks]] [[tunnellight1943-workflow]]。
```

## tunnellight-animation-tracks

```markdown
---
name: tunnellight-animation-tracks
description: "《地道里的光》动画层——静态姿势 vs 关键帧轨道的分界、FlashTrack/holdTrack/childArms/呼吸白名单/lift 缓动/gait 这几件引擎能力，以及\"抱\"的几何与腿长闭合式"
metadata: 
  node_type: memory
  type: project
  originSessionId: 388f5ff1-13fe-4a7b-ae06-bbba8e08036a
  modified: 2026-08-17T08:26:22.368Z
---

2026-08-13 用户退回「主角互动、娘的过场动画，妹妹的动画，都很生硬」换来的一整轮
（commit 344ffdb，已上线）。做法：**六切片并行审计 → 逐条对着源码证伪 → 96 条存活**
（24 blocker），然后我按存活清单逐处改。这个 workflow 形状很好用，同类"整体质量差"
的退回都可以照抄：审计 agent 只读、复核 agent 默认它错、汇总合并同根因。

**Why:** 病根只有一个——**判定层做完了就以为做完了**，而这一层的具体表现是
「有 pose 就算有动画」。实拍逐帧比对（`shot <id>@line=N,at=T`）才看得出来：
娘"一把将她拉进怀里、上下摸了一遍"用的是**拽水桶**那个 haulIn 并钉死在 poseK 0.55，
相隔 4 秒的两张截图**像素相同**；掀翻板四件事挂同一个造型 5.4 秒；c1_count 24 秒
妹妹一帧没动。

**How to apply:**

- **2026-08-17 追加一层病根：轨道写对了也可能"不流畅"，因为插值。**
  用户「抱起妹妹的动画太蠢了 优化一下，不流畅」。`SampleTrack` 原来对**每一段
  各自 smoothstep** ⇒ **每个关键帧上速度都归零**，四帧的轨道读出来是三下互不相干
  的推拉。已换成分段三次 Hermite（Catmull-Rom 切线 + Fritsch–Carlson 夹住不过冲）。
  **值得记的是判据**：一条轨道"卡"而每一帧姿势都对，先怀疑插值，别去加关键帧
  ——加得越密越像卡顿。（不过冲是这个项目的硬要求：角度全是按几何量出来的。）
- **判据：台词里带"过程"的动词，一律走关键帧轨道，不许只摆一个造型。**
  新加的 `FlashTrack(state, name, dur, who?)`（Core）＝一次性轨道，`until` 到点
  自动收回常态；`FlashPose` 从此只留给真的只有一格的东西。
  hold 类节拍可以声明 `holdTrack`（按住跑循环轨道、松手当帧撤掉）——但
  **`holdPose` 必须留着**：失败判定读的就是 `player.pose === "shelter"`
  （c1_bell / c1_hide），换掉当场判失败。PoseRig 里 track 优先于 pose，两者共存
  ＝画面走轨道、判定读姿势。
- **"抱"的几何：肘要吊下来。** `armF -84` 这种是把**肘**平端到身前，肘先占掉
  0.25m、手再往外 0.24m ⇒ 手落在身前 0.58m，而孩子的身子中心只在 0.31m——
  两条胳膊从她身上直穿过去指着背后的空气。抱人是**上臂几乎垂着、
  前臂横过来兜住**，行程全长在前臂上。同一条也治好了 shelter。
  ⚠️ **本条的具体数字 2026-08-17 已作废两轮，别照抄这里的角度**：一是全场
  51 处反关节翻号后 `fore` 只许为负（`ApplyPose` 里有硬闸），二是坐高从 0.42
  降到 0.28（0.42 那版她头顶比抱她的人还高一头＝「举」不是「抱」）。
  现行角度与推导过程在 `TunnelLight1943/CLAUDE.md`，以那儿为准。
- **两个人要看得见是两个人**：娘蹲下去抱孩子时，间距 0.31/0.44m 实拍出来
  两颗脑袋叠在一处、孩子被大襟长摆整个吞掉。0.59m 才读得出「搂着」——
  而且要算上**受方自己往施方倾**的那 0.2m。
- **静态姿势也要有生命体征**（Rig 末尾，`ApplyPose` 之前）：走白名单叠呼吸。
  两条不许碰：① 靠 `AimFrontHand` 两骨反解落在挂点上的那几支（crank/heaveMat/
  dragPlank/scoopAsh/unwrapJar…）叠角度就把手推离把手，RenderHealthTest 会红；
  ② 跪/按/咬布不许动 hipY（膝与手贴着地，一起伏就陷进去）。
- **`lift` 要缓动**（World.UpdateOne 的 `s.liftNow`，dt*6）：剧本写 `lift = 0.52`
  是当帧生效的，孩子凭空升高半米。阈值 >1.0m 仍瞬时（换层/跳幕）；翻越那条
  逐帧算好的弧线每帧变化很小，不受影响。
- **跑不是把走路放快**：走路循环幅度写死，3.4m/s 冲进屋也是散步的架势。
  World 按实测速度给 `gait` 0..1（1.5→3.2m/s），Rig 里步幅/小腿/躯干前倾/
  手臂摆幅一起变。**步频再按体型折算**（`moved * 3.4 / bodyScale`），
  否则妹妹踩着风火轮跟着走。
- **抱着人走是走姿不是姿势**：`state.player.childArms`（每帧清、抱着的那一帧
  自己立）——pose 会把走路整个顶掉，所以这类"上半身占用"要单开一档。
  被抱的那个也要有对应姿势（`heldChild`：腿折起来搭在小臂上；leanIn 是**站姿**，
  挂在被抱的人身上就是两条腿笔直垂着）。
- **腿长闭合式**（脚陷地的通治）：`hipY = 0.31·cos(大腿) + 0.31·cos(大腿+小腿) − 0.62`。
  shelter 一直埋 8cm、bow 埋 29cm（挨巴掌那一镜里柱子成了"半截人"）。
  改完用 `shot --probe` 的 `PlayerLimbTips` 对一遍，站姿脚 ≈ +0.072（体型 0.80）。
- **`ClearPoses` 只清 pose 不清 `poseT`**（已修）：上一拍那个还没到期的 FlashPose
  会在下一拍中途把新摆的姿势一并抹掉——抱着妹妹够门框那两拍就是这么变回站姿的
  （人举着空气、孩子浮在半空）。`poseU/poseK/poseStrain` 同理，演员那一路也要清。
- **进度驱动的姿势必须登记 `PoseProgress`**（World）——漏登记就冻在第一帧。
  这一轮新登记：twistTie / bandageWrap / ladleSteady / pinDown。
- **摆位错会让新动画白做**：娘掀翻板原来站在**洞口正中、背对着板**（板 1.25m、
  铰链在西 28.38、活动边 29.63，人得站到活动边外侧 30.05 去掀）；窖口那五个
  仰角机位 `y: UNDER_Y + 2.2` 把她整个框在画外（画框上沿 +0.06m，跪着的头顶
  0.86m、掀起的板顶 1.10m）——改 3.5 才装得下。手腕特写那八个机位一直偏着
  0.63m（袖口实际在 30.69）。**改动画之前先量"她在不在画框里、够不够得着"**。
- **盖板/道具的时长要和轨道对齐**：`state.lid` 加了 `delay`；合板 rate 1.8
  ＝0.56 秒就扣死，而手 0.9 秒才够到那条缝——「最后消失在板缝里的是那截袖子」
  于是无处可演。

**还没做的（下一轮的单子，审计报告在会话的 alive.json）**：躺姿翻面的缓动
（`LIE_POSES` 按 heading 当帧转 ±90° 并横移半米，c1_end「侧过脸」/c1_home
「睁开眼」/c1_share「躺下」各犯一次）、伤员那只从黑暗里伸出来的手（现在是
静态贴图 strawArm，接触戏隔着 0.65m）、c1_uncle 七叔那几处（起身/拍头/递豆子）、
妹妹章末那两下伸手攥袖口的轨道、眨眼通道（全作没有）。

相关 [[tunnellight-contact-staging]] [[tunnellight-rig-shoulder]] [[tunnellight1943-workflow]]。
```

## tunnellight-camera-one-scale

```markdown
---
name: tunnellight-camera-one-scale
description: 地道里的光只有一个景别档（玩法景别），绝不许俯瞰全村——用户 2026-08-08 定的，参考勇敢的心
metadata: 
  node_type: memory
  type: feedback
  originSessionId: d0181621-500b-4b3e-9d6f-8934e6af5dbe
  modified: 2026-08-14T03:07:32.513Z
---

《地道里的光》**全作只有一个景别档：玩法景别**。画面的变化只许来自镜头动画
（横移 `pan`、换机位、做功那一拍推特写），不许来自"把镜头拉远看全局"。

用户 2026-08-08 原话：「我不喜欢你开场动画里最前面的全场景总览+旁白的视角，
搞得跟剧透一样，我就要的是一个局部视角，参考勇敢的心，游戏视角基本上都是
保持一致的，除了镜头动画以外」。

**Why**：原来 `wide` 的 hw 是 26（半径 26 米）。实拍开场第一帧：整条村街一屏
摆完、房子只有指甲盖大，**连地道剖面和地窖都露出来了**——地图和「命藏在
脚底下」这个题眼在第一分钟就被交代完。勇敢的心从不这么做：它靠一次一处地
走过去交代世界，不靠一镜看完。

**景别的尺子是「人占画高多少」，不是"这一屏想装下什么"**（2026-08-14 用户又拿
《勇敢的心》的截图退回：「现在太宽了」）。那张图里的大人占画高 21~22%；当时
地表 hw 6.3（画高 7.09m）大人只占 19%、柱子（体型 0.80、实高 1.10m）只占 15.5%。
按"这屏要装下什么"配 hw 每次都会往宽了走——量比例才收得住。

**How to apply**：
- 景别只有一张表：`Script_Main.js` 的 `PLAY_HW`（地表 4.9 / 夜 4.8 / 地道村 6.2
  / 据点地道 4.7 ＝ 地表画高 5.51m、柱子占 20%）。别在别处另写 hw。
- 剧本里一百多处 `dist:` **不逐个改**：`HintShot` 的 wide/shot/close 统一过
  `TightenHw`（×0.78、下限 4.2、封顶 9.4）。改全片景别就改 `HW_TIGHTEN`；
  `insert`（铺满画框的卡）与 `free`（过场自由机位）不过这道，跟着缩会把主体挤出画。
- 机位收近之后**同一个 z 差的地平线差大了七成**（演员 0.6 从 +11px 到 +19px），
  Data_DepthSpec 与 CLAUDE.md 的那张 px 表已同步；再改 hw 记得一起改。
- 要"交代世界"就排成几镜、每镜只给一件东西，用横移串起来。
- 画面外的后果交给角落的照片小窗（pip），这正是不必拉远的原因。
- 规范已写进 `TunnelLight1943/CLAUDE.md` 的「镜头规范」一节。

**但"看不见"不等于该拉远——先分清是画没画还是框没框住**（2026-08-10，用户报
「家里的地道为什么攀爬之前都是隐藏状态」）。当时地窖一个 mesh 都没被藏
（逐 uuid 比对过地表/地下两种状态），纯粹是地表机位下边沿只到 −1.7m、
窖底在 −3.6m。这类"该看见的东西在画框外"一律先想升降/换机位，别动 hw。

**而且：玩法段的镜头不自己动**（同日用户定，原话「目前我看不需要这个自动
摇动镜头的功能，把这个开关/功能默认关闭吧」）。我当天做的窖口自动下沉
（走近窖口镜头沉下去把窖带进画框）**当天就被退回**——推着独轮车路过窖口时
镜头往下一摇，车头和前面的路一起出画。机制留在代码里但
**`Core.CAM_CELLAR_PEEK` 默认 false**。要让玩家看见什么，用固定机位的一拍
或过场交代，别做"走到某处画面自己摇过去"。

真要再开自动镜头，两条一起做：① 挂到 `state.steadyCam` 这**一个**让位判据上
（推车 / 被盯上 / 节拍声明 `steadyCam: true` 时一律不动）；② 位移量按**画高**
（`world.viewSize.h`）反算，不许写死米数——宽屏手机 2.16:1 的画高只有 16:9
的八成，同一个米数在手机上会把人头切出画外。

相关：[[tunnellight-25d-feedback]] [[tunnellight1943-workflow]]
```

## tunnellight-canvas-texture-washout

```markdown
---
name: tunnellight-canvas-texture-washout
description: 地道里的光全画面发灰发白的根因（CanvasTexture 没声明 sRGB），以及在不翻盘的前提下怎么配色
metadata: 
  node_type: memory
  type: project
  originSessionId: d0181621-500b-4b3e-9d6f-8934e6af5dbe
  modified: 2026-08-17T14:33:12.733Z
---

《地道里的光》整个画面看起来"发白、没对比"，根因是 `Script_World.js` 的
`CanvasTexture()` 从没设 `tex.colorSpace`。three r152+ 的 `renderer.outputColorSpace`
默认 sRGB，而贴图默认按线性处理——canvas 里写的 sRGB 值被当成线性再做一次
gamma 编码，等于整张图被抬亮。实测：源色 `#8d8578`(141) 上屏变成 (196)，
正好是 `(141/255)^(1/2.2)`。

**贴图那一行没有改**（`tex.colorSpace = THREE.SRGBColorSpace` 会把全作每一个
颜色一次性改掉，远景雾量、夜色、人物色相全是照着发白的样子调的），但
**2026-08-17 起在全屏后期那一遍把它补回来了**：World 的分级 pass 从"只在过场
开"改成常开，而那遍 pass 的主效果恰恰就是这道 gamma 的反函数——离屏靶是
`SRGBColorSpace`（渲进去编码一次、硬件采样解码一次），那块四边形又是裸
ShaderMaterial（three 不补输出编码），一解一不编 ＝ 全屏乘一道 ^2.2。
逐像素量过：老过场档的传递曲线逐点等于 `src^2.2` 再过对比曲线，误差 0.001，
"过场调色重"从头到尾不是滤镜，是**过场还了这笔债、玩法段没还**。
还多少由 `GRADE_GAMMA` 拨（显示值上的指数，1.0＝不还／2.2＝全还，现取 **1.55**）。
所以现在屏幕上的明度 ≈ `(源色/255)^(1/2.2)` 再 `^1.55`，比下面那条老公式暗一档；
**改 `GRADE_GAMMA` 等于改全作的调子**，改之前拿实拍逐像素量。

在此之前，配色的实操规则：**想要屏幕上某个明度，源色得压得比直觉低两档**。
反推公式 `src = 255 * (want/255)^2.2`：想要 176 → 写 #6f685c；想要 160 → #5c564c。
井台第一版调成 #a8a094 就是没算这一步，画出来比黄土路还亮。

**暗部这条曲线极陡，夜戏尤其要压狠**（2026-08-12 叠衣裳那张活卡实拍标定两轮）：
`#241a0e`(36) 的草苫上屏还有 150 上下，`#2a2418`(42) 的盖布直接到 200 ——两块
源色只差 6，屏幕上差了 50。一场"夜里一盏油灯照着的土窖"，整组源色最后落在
**8~26** 之间（窖壁 #060403 / 窖底 #0a0704 / 草苫 #100b05 / 褂子 #0a0b0e），
看着像纯黑，渲出来才对。**越往下压，两块颜色分得越开**——所以夜戏别怕黑。
配套两条：加色光（`globalCompositeOperation="lighter"` 的灯光池）会把暗部整体
抬起来，alpha 给到 0.4 就够；**渍/污这类"把底色染暗"的东西一律走 `multiply`**，
普通混合画深红在这条曲线下会变成一枚发亮的锈红饼。

**过场与玩法从此是同一张脸**（用户 2026-08-17：「过场的后处理调色调的比较强，
和实机差的比较多，统一游戏过场的内外」）。规矩：只要这遍后期有开关，开关两边
就必然是两张脸，所以它常开、曲线放轻（对比 0.28、晕影四角 10%、颗粒减半）；
要加"电影感"就加在**只有过场才有的东西**上（黑边、DOF、框景板 fg、运镜）。
另：那段 GLSL 写在 JS 模板字符串里，**注释里一个反引号都不许有**——一个就把
模板提前收口，整份 Script_World 当场 SyntaxError（页面白屏、shot 超时）。

相关：[[tunnellight-plain-geography]] [[tunnellight1943-workflow]]
[[tunnellight-25d-feedback]]
```

## tunnellight-child-proportions

```markdown
---
name: tunnellight-child-proportions
description: "地道里的光——小孩不是缩小的大人：等比缩放的 BODY_SCALE 与写死的脸长是\"孩子像大人\"的两个病根，四层改法与故意没动腿长的理由"
metadata: 
  node_type: memory
  type: project
  originSessionId: a00b11b6-a084-4e75-b4ee-8157eefe094f
  modified: 2026-08-17T14:03:29.647Z
---

《地道里的光》2026-08-17：用户退回「主角柱子的设计完全不像一个小男孩 看着倒像是一个
成年男人」。**两个病根都不在画得好不好上**，记下来是因为它们是这套骨架的结构性坑：

1. **`BODY_SCALE` 只会等比缩放。** 柱子第一章按 0.80 缩，身高 1.10m 是对的，可**比例
   还是成年人的**——头顶到脚是头高的 **7.8 倍**（成年男子正是这个数，小孩该在 6 倍上下）。
   **等比缩小的大人还是大人。**
2. **九种角色的脸长一模一样。** 比例表里那个 `chin` 是颏的**横**坐标（下巴往前收多少），
   颏的 **y 写死在 −0.34**。柱子跟他爹只差 crown 3% 与鼻尖 0.06——"孩子"从来没画进脸里。

改法分四层（成人全档恒等，老图一个像素不动），细节在 TunnelLight1943/CLAUDE.md
「小孩不是缩小的大人」一节：脸短颅不变（Art 的 `FK`/`CY`，头发头巾必须吃同一条压缩）、
头相对身子放大（Rig 的 `HEAD_K`，只放大 head 那个 group）、身子细（`LK`，只改粗细）、
矮一档（World 的 `boyScale` 0.80→0.75）。平贴图 `DrawCharacter` 的 `chHK` 要一起改。

**腿长故意没动**（想过，明确放弃）：孩子真正的比例是腿短躯干长，但腿一短就得改 `BONE`，
而落地恒等式 `hipY = 0.31cos+0.31cos−0.62`、`SoleLift`、`Script_Climb` 写死的
`SHOULDER_UP = 0.447`、`Data_DepthSpec` 的 `VAULT_HIP_STAND` 全挂在它上头，几十个手调过的
蹲/跪/爬姿势会一起塌（深度体检查不出演员姿势）。要动先把 BONE 改成按 kind 取。

两条验证口径（也是这一轮的教训）：
- **`footF` 不是常数，是 `BONE.sole × 体型`**（柱子 0.09×0.75＝0.072，改体型前 0.077）。
  看见它变了先算一遍，别当回归、更别照旧数字改代码。
- 孩子像不像，**要跟大人站在同一张图里**才看得出来——单看一颗头永远觉得够小了。
  用设置里的「人物美术样式」排一块儿对，或直接拍一张有娘在的过场（c1_thatday@line=8）。

顺带修了个老 bug：`boyScale` 原来写 `chapterIndex === 0 ? 0.80 : 0.93`，他在一二章之间
（只隔几天）会长高 15 公分；妹妹那一路本来就是 `<= 1`，他这一路漏了。

相关：[[tunnellight-rig-shoulder]] [[tunnellight-dev-workbenches]] [[tunnellight1943-workflow]]
[[tunnellight-animation-tracks]] [[tunnellight-indoor-actors]]
```

## tunnellight-cine-framing-math

```markdown
---
name: tunnellight-cine-framing-math
description: 地道里的光过场机位的三条硬账：黑边吃掉两成三画高、框景只有 free 档折算得了、CINE/FG 两个小工具在哪
metadata: 
  node_type: memory
  type: project
  originSessionId: dae45ae2-2de7-43b6-997d-c2d0c52178ba
  modified: 2026-08-15T18:59:33.228Z
---

《地道里的光》过场机位（2026-08-16 照 Notion 第一章分镜重排时立的，
工具在 `Data_ScriptC1.mjs` 顶部：`CINE(x, y, 画宽, [框景])` + `FG.*`）。

**① 景别的尺子要算上下黑边。** `#cineBars` 是**盖在整幅 16:9 上头**的
（`Style_Game.css` 各 11.5vh），可见画高只剩 **77%**，先被吃掉的正是头顶和
脚下。所以：
- 画高 = 0.536 × 机距，**可见画高 = 0.412 × 机距**，画宽 = 0.953 × 机距；
- **画宽 = 身高 / (占可见画高 × 0.432)**；
- 站在地上的主体 **注视点 y ≈ 0.15 × 画宽**（腰线居中、脚下留一成半）。
  给到成人视平线那么高，地平线就钉在画框下沿、上半屏一半是空墙。
身高按**实测姿势**取，不是站姿：柱子站 1.10 / 坐 0.78 / 跪 0.59，妹妹 0.95，
大人 1.37。照站姿配跪姿的机距会松一整档。

**② 框景（`fg`）的 u/v 折算原来只有 `free`/`split` 两档给得出相机**，别的传
null，而 `ForePlace` 见 cam 为空就把 u/v 当**世界坐标**用——板子飞到村东头。
已在 `Script_Main.UpdateCamera` 补上定点镜的反推机位（半宽 = 0.4765 × 机距），
现在 insert/shot/close/ots 也挂得住框景。玩法段仍只认节拍上的 `def.fg`
且**只能写世界坐标**。

**③ 框景要真的黑。** `ForeMix` 是 `k = 1/dim`，dim 1.2~1.35 只压掉两成，实拍
出来是一条中灰窄带；分镜图里那几块近乎全黑。第一章现在给到 **1.8~2.3**。
`beam` 的 `v` 不许过 0.4——梁身占板子上七成四，v 给高了整根缩进上黑边，
屏幕上只剩一排悬空的黑齿。

**别把 `free` 用到玩法段**（`c1_bell` 是 hold，机位保留 `shot`）：HintShot 的
free 分支把 hw 写死成 6、运动交给 ApplyCineCamera，那条路只走过场。

配套的两个"注解写了、代码没干"的老账（同类要先 grep 再信注解）：
`HAND_HELD` 的注解列了「破袄子」而数组里没有（衣裳因此贴在人脸上）；
妹妹的 `lift = 0.52` 从 §4 一路挂着（浮在半空半米）。

相关 [[tunnellight-25d-feedback]] [[tunnellight-camera-one-scale]]
[[tunnellight-storyboard-refs]] [[tunnellight1943-workflow]]。
```

## tunnellight-cine-timeline

```markdown
---
name: tunnellight-cine-timeline
description: 地道里的光 过场时间轴调试面板（F3/?cine=1）——用户与 agent 对过场说事以它的「复制定位」串为准（2026-08-17 加）
metadata: 
  node_type: memory
  type: project
  originSessionId: c1d0b630-9cbc-40b1-98fa-bdc0bbc11538
  modified: 2026-08-17T10:27:38.355Z
---

TunnelLight1943 有一张 **过场时间轴**（`Script_CineTimeline.js`，2026-08-17 上线，
commit cf43afa）：F3 / `?cine=1` / 设置→「调试 · 过场时间轴」。底栏 Unity Timeline
式：台词／镜头／on()／框景／音效／微过场六条轨，拖播放头游戏真的推到那一格并
冻住（渲染照跑，镜头缓动追上来），右侧检视器给句、cam 参数、台上每人位置/姿势/
轨道。用户点「复制定位」粘过来的第一行就是 `shot` 吃的 `c1_xx@line=N,at=T`，
后面几行是台上状态、相机、备注；「拍这一格」在本地 DevServer 上落
`_shots/cine_*.jpg`（定位＋路径进剪贴板）。

**Why**：用户原话「方便我直接和 ai 来定位 cutscene 名字、进度等，而不是截图＋
文字描述」。时间口径只有 Core 的 `CineTimeTable/CineLocator` 一处，面板与 CLI 共用。

**How to apply**：
- 用户贴来「【过场定位】c1_xx@line=N,at=T …」就直接
  `node TunnelLight1943/Script_Cli.mjs shot "c1_xx@line=N,at=T"` 拍同一格，别再问"哪一句"。
- 面板**不改剧本**（改台词仍去 Data_ScriptC*.mjs）；往回拖＝重跳这一拍再推（毫秒级），
  链里起的微过场只能往前推。
- 钩子 `TunnelLight.CineTimeline.{Toggle,Seek,SeekTime,Locator,SetSpeed}`；
  `--eval "(tl.CineTimeline.Toggle(true), tl.Tick(3), 'on')"` 能连面板一起实拍。
- 加轨道/加读数就往这个文件里加，加完写回 TunnelLight1943/CLAUDE.md 那一段。
- 相关 [[tunnellight1943-workflow]] [[tunnellight-shot-seek]]。
```

## tunnellight-climb-rig

```markdown
---
name: tunnellight-climb-rig
description: 地道里的光 爬梯系统（2026-08-17 重做）：Data_Ladder 落点表 + Script_Climb.PlanClimb 几何规划 + Rig 两骨反解；以后任何梯子/楼梯都换表复用；拍爬梯用 hold=s/w + dur 系列拼胶片条
metadata: 
  node_type: memory
  type: project
  originSessionId: a11cd14e-dfcb-4703-bdfc-c8c90340447a
  modified: 2026-08-17T10:38:15.733Z
---

2026-08-17 用户退回「爬楼梯怎么和楼梯一点关联没有 就像是个平移一样」后重做的爬梯：
`Data_Ladder.LadderHolds`（横档/手扒/脚踩世界 y，画笔+骨架+每档一响共用）→
`Script_Climb.PlanClimb({holds, base, dir, bs, oneHand})`（纯几何：跨档步/并档步、
四肢轮动、胯跟最低脚沉、井口蹲下扒梯头）→ `Rig.ClimbPose` 反解钉上去。
详细规矩在 TunnelLight1943/CLAUDE.md「爬梯：手脚钉在真横档上」一节。

**Why:** 用户明说「后续爬楼梯的动画都能复用这一套」——新梯子/楼梯只换一张落点表，
别再写新的正弦姿势；ArmIK 肘角折回 (−π,π] 那条是手举过头顶才炸的坑，改反解姿势要记得。

**How to apply:** 拍爬梯用 `shot "c1_walk@x=29,hold=s,dur=T"`（下）/ `level=under,hold=w`
（上）一串 dur 拼胶片条（PIL 横拼）看动作；抱着下用
`shot c1_descend --pre "a*8,Ew*40,a*14,.*130,s*N"`；关节角看 `--eval "tl.world.__rigPose('player')"`。
[[tunnellight-shot-seek]] [[tunnellight-rig-shoulder]] [[tunnellight-animation-tracks]]
```

## tunnellight-contact-staging

```markdown
---
name: tunnellight-contact-staging
description: "《地道里的光》接触戏（打/夺/拦/推）的定式——先站到一臂之内、受方轨道从负数起、落点角度反算；以及\"旗标立了但没人画它\"这类假实装"
metadata: 
  node_type: memory
  type: project
  originSessionId: 5e9e272d-1da1-41a0-9660-2c8c0a6e2cf9
  modified: 2026-08-10T17:23:51.571Z
---

2026-08-10 第十一场（搜家）重做换来的。用户两条：「你说你扛起了旧木板然后撑起来了，
但我在画面上完全看不到」「这他妈扇耳光，夺走布什么的一个动画都没做啊」。
逐行实拍核过，**都属实**——机制在、旗标在、测试全绿，画面上什么都没发生。

**Why:** 这两条是同一个病的两个面：判定层做完了就以为做完了。横版 2.5D 里
"发生了什么"只由画面上的**间距、角度、留下来的东西**说话，状态字段一个字也不说。

**How to apply:**

- **接触戏先摆位再起动作，间距 ≤1.15m**（半个身位＋一条胳膊）。旧版扇耳光的兵
  在 x=40.4、妹妹在 37.2，隔着三米抡空气；夺包袱只有一行 `sis.carry = null`。
  回归断言 `TestContactStagingIsCloseEnough`（SmokeTest 内）逐帧扫 c1_roster/
  c1_search：有人起了"动手"轨道而一臂之内没人在挨，当场红。**这条断言要自己
  验一次会不会失败**（把兵挪远四米跑一遍）。
- **成对轨道，受方 t 从负数起**（负的那段是"等"），让挨的那一下落在施的那一下上：
  buttStrike 砸在 0.95s → 受方写 `t: -0.95`；slap 甩出在 0.52s → `-0.52`；
  kickGut 蹬出在 0.46s → `-0.46`。**受方轨道第一帧必须是挨打前的姿势**——
  `struckFall` 老版第一帧就是跪姿，于是"等"的那段里人先自己跪下去。
- **手里的家伙要和动作对得上**：扇耳光时兵不能留着步枪（ALONG_ARM 顺前臂挂，
  抡手那一下整支枪横扫过去＝拿枪捅人）。用 `carry: ""` 压掉兵默认那支枪
  （`a.carry ?? 默认` 对空串不生效），完事再还回去。
- **一维线上两个人挤在一处只能靠深度分开**：倒地的人打 `a.rank = 1`
  （`RankDz(1)` = −1.6），下一拍站过来的人才不会踩在他身上。**但退档会把绘制
  序号压到 walk 带底下**——他会被工作台连同台上的料盖住（"爹只剩一个脑袋顶在
  台面上"），用完必须 `rank = 0` 收回来。
- **过肩不能用在一跪一站上**：被越过的那个人跪着，前景剪影就是一坨没形状的暗块
  （就是用户 2026-08-09 报的"椭球"）。正反打改用两个机位差——问的一镜抬到大人
  眼高稍退，答的一镜压到跪着的人的眼高推近。
- **"旗标立了" ≠ "画面上有了"**：`bracedA/bracedB` 立了旗标，全仓库没有一处画它们，
  玩家撑完地道里一根木头都不多。新旗标落地前先问一句：**谁画它？**
  回归断言 `TestBraceLeavesTimberBehind` 盯着旗标/道具/坐标三处对齐。
- **验收只能靠实拍逐行看**。这一轮改了七八轮，每一轮都是截图推翻上一轮的判断：
  枪横扫、榆钱从没有树的院子上空落下来、娘"抱住"其实是举着手、爹被工作台吃掉。
  SmokeTest 全绿的同时这些全在。

**「两个静态姿势来回切」＝脚一定会滑（2026-08-11，爹礅门轴）**。用户：「脚会
位移，而且我也看不出他是在修什么东西」。老版每帧在 `kneel` ⇄ `swing` 之间切
（还都是从别处借来的姿势），两者胯高差 44 厘米、hipX 差 0.12m、腿从跪变站——
每 0.85 秒弹起来蹲回去一次。**周期性动作一律写成轨道，并且把下半身在每个关键帧
上钉成同一组数**（hipY/hipX/两条腿/脚），脚就不可能滑；动作全长在上半身。
相位要由玩法量直接喂（`t = b.knockT`），声音/进度/落槌才是同一刻。
断言 `TestMalletTapDoesNotSlide` 按源码扫：除第一帧外任何一帧都不许再声明下半身。
配套两条：**举起来要往自己身后举**（往对手那边举，胳膊会横到旁边那个人身上，
读成"工具是他的"）；**做功的那个物件必须单独一张静态贴图**——空臼窝原来画进了
门扇贴图里，跟着门一起摆（门歪 15°，地上的石头也歪 15°），而且只有 `loose`
时才画。拆出来钉在地上、深度走 `obstacle`（画在跪着的人**之前**，否则被整个盖住），
进度画在石头上（轴头一点点填满 + 木屑一记一记攒）。机位也要跟着降——
特写机位 1.15m 把轴正好压在屏幕底部提示条底下，一整拍都没看见自己在修什么。

顺带修的同类假实装：妹妹的 `carry` 一直写的是**没登记过的标签「包袱」**，
掉进 DrawCarry 兜底那一支画成一米六的板子——她从井台起一路扛着块门板回家。
新携带物必须同时登记 DrawCarry 分支 + HAND_HELD/ROUND/HOLD_WEIGHT 三张表。

相关 [[tunnellight-rig-shoulder]] [[tunnellight1943-workflow]] [[tunnellight-indoor-actors]]。
```

## tunnellight-dev-workbenches

```markdown
---
name: tunnellight-dev-workbenches
description: 地道里的光——设置里现在挂着三块全屏工作台（人物美术样式/动画工作台/过场时间轴），都是给我对话定位用的；并行 agent 一天造了三块，改设置面板必先 fetch
metadata: 
  node_type: memory
  type: project
  originSessionId: a00b11b6-a084-4e75-b4ee-8157eefe094f
  modified: 2026-08-17T10:57:53.655Z
---

《地道里的光》2026-08-17：设置面板底下现在挂着**三块全屏开发工作台**，都不是玩家 UI，
入口一律在设置里（同调试面板）：

| 入口 | 干什么 | 代码 |
|---|---|---|
| 人物美术样式 | 九种角色的头／六块骨头零件／整身贴图并排渲出来 ＋「名目」列 kind·中文名·画笔分支·文件 | `Script_Main.js` 的 `ART_SHEET`/`PaintArt` |
| 调试 · 动画工作台 | 按名字预览每一条轨道／姿势／步态 | `Script_AnimLab.mjs` / `Script_AnimIndex.mjs` |
| 调试 · 过场时间轴（F3） | 拖到过场任一格、复制 `c1_xx@line=N,at=T` 定位串 | `Script_CineTimeline.js` |

**用户造它们的理由是同一个：跟我说话时能一句话定位**（「改 officer 的 crown」
「退回 scoopChild 那条轨道」），别再靠描述。所以他要看某个角色/动画长什么样时，
先想能不能让他自己开这块面板，而不是我现拍一张图。

两条协作账：
- **三块面板是三个并行 agent 在同一天各造一块的**，全都改 `index.html` 的设置面板、
  `Script_Main.js` 的 ui id 表与 `MenuFrozen`、`Style_Game.css` 的尾部。**动这四个地方
  之前必须先 `git fetch`**——那天三次推送两次撞冲突（都是加法冲突，两边都留即可）。
- `MenuFrozen()` 是唯一的"开着就停世界"的闸，新面板要自己登进去。

相关：[[tunnellight1943-workflow]] [[sophia-codex-parallel]] [[tunnellight-shot-seek]]
[[tunnellight-structure-refactor]]
```

## tunnellight-fake-perspective

```markdown
---
name: tunnellight-fake-perspective
description: 《地道里的光》房子的伪透视（灭点钉在东墙外）＋门框连门垛一起画的定式
metadata: 
  node_type: memory
  type: project
  originSessionId: a21dd085-de42-4ecb-b75b-31a76c09133a
  modified: 2026-08-17T08:43:07.165Z
---

2026-08-17，用户退回门框：「门框的设计还是太抽象了 门框就应该在家里啊 你这个都
不符合其他场景样式的透视效果，要么你把房子的四个面都做出来 伪造一下透视 然后再
画一个贴合的门框还差不多」。已实装并直推 master（5394d48）。

- **判据**：一件道具"抽象"往往不是它自己画得糙，是**它该依附的东西没画**。门框
  周围没有墙 → 牌坊。先问"这东西在现实里长在什么上面"。
- **伪透视＝真透视、假机位**：机位钉在每栋房子东墙外 2.15m，深度 d 上的点按
  D/(D+d) 朝灭点收（`Art.Recede/EyeY/VanishX`）。全街统一朝东收。
- **立面淡出（第四堵墙）时，门那一块墙不能跟着消失**——门框连着门垛一起画，
  西边化开、东边收在墙角。这是"门永远长在墙上"的机制保证，不是画法细节。
- 数值与规矩全写在 `TunnelLight1943/CLAUDE.md` 的「房子是个盒子」一节，改之前读它。

相关：[[tunnellight1943-workflow]]、[[tunnellight-shot-seek]]、
[[tunnellight-canvas-texture-washout]]
```

## tunnellight-ground-three-layers

```markdown
---
name: tunnellight-ground-three-layers
description: 地道里的光——地平线以下是三块地叠的，改路面别改错那一块；大地面是一把刀（在地平线附近画东西先问在它上头还是下头）；地面上不许有碎点
metadata: 
  node_type: memory
  type: project
  originSessionId: a00b11b6-a084-4e75-b4ee-8157eefe094f
  modified: 2026-08-17T15:11:20.505Z
---

《地道里的光》2026-08-17 重做：用户退回「你画的很多东西我都看不出来是什么」
「明明很多东西应该是放在路上的，结果你放在了路的上沿」「布料 焦木 灰 泥土 都不像」。

**地平线以下是三块东西叠出来的**，改路面之前先认清哪一块在管事：
`AddGroundPlane`（大地面，只能画田——横着 3.4 像素/米）、`AddRoadPlane`（**街面**，
新加的一块躺平几何，只管 z −4.3~3.4、贴图 64m 一循环 96 像素/米，路面细节全在这儿）、
`AddGroundBand`（竖幕布，被大地面的深度写入挡掉 97%，只剩断口那一线）。
老版的车辙草簇粪蛋全画在那张看不见的幕布上——这就是「堆在路的上沿」的来历。

`AddRoadPlane` 的纵向 UV 与顶点**按屏幕均分不按世界均分**（换算只剩 `RoadRow(z)`）。

**当天晚些时候用户又退回一次：「地面的纹理太丑了 太喧宾夺主了 会抢掉视觉重点啊
休掉」——撒点（蹄印/土坷垃/料礓石子/旱裂泥皮/糠秕/粪蛋/草茬＋三道车辙描线）
已整批删掉**（de61069），只剩三道大面积软渐变：底色、两道路肩、两条碾道。两笔账：
① **过场机位比玩法近一倍**，2.8m 半宽下一枚四厘米的石子上屏十几个像素，铺满画面下
三分之一就比人还抢眼——**地面是背景，背景的活是让人立得住，不是自己好看**；
② **AddRoadPlane 横贯全场（x0=−60..length+60），屋里屋外一视同仁**，所以车辙粪蛋是
画在自家屋里的夯土地面上的，而序章整场戏都在屋里。**画得对不够，还得问它铺到哪儿。**
要在路上摆东西一律**摆道具**（挂 `band`）——摆得住、看得清、也删得掉。

**材质靠形不靠颜色，但那说的是*一件东西*怎么画，不是*一整片地*该多热闹**：
三支通用笔在 Script_Art 顶上——`ClothFold`（褶是从受力点
辐射出去的谷＋绷亮的脊）、`CharScale`（焦木的龟裂；格子不许跟形体一样宽，五像素
粗的椽子铺网格＝三条铁链）、`DrawAshHeap`（灰**不许有边**，一描轮廓就读成石头，
所以堆身糊着填、硬东西压上去）。

`Data_Scenes.json` 的道具从此可以写逐件 `band` 覆盖类默认（仍只许从 BAND 表里挑）。

**`AddGroundPlane` 是一把刀**（2026-08-17 晚，用户「道路上的绿草被砍断了一半一样」，
commit f110814）。它是全场唯一**不透明又写深度**的几何，躺在
`SURFACE_Y − GROUND_PLANE_DIP`(0.02)、纵深铺到 z=2.5，**压在 z=2.2 那张地道剖面前面**；
它躺着，所以切口是**一条笔直的横线**（1600×900 默认机位 y≈889）。规矩：
**在地平线附近画东西，先问这一笔在那条线的上头还是下头**——下头只有地道那侧看得见
（断口的墨线/耕作层），上头才是地表看得见的（草茬、坷垃），**横跨的必须是"从地里长
出来"的形**（最粗的根落在线上、往上收尖），否则切口切在半腰上。
三处同病一起修的：① `DrawEarthStrata` 头一层土**自带 ±7px 上沿起伏**（画笔内部，
调用处没声明），横贯全场露出一条土色板带 → 土层上沿现在**剪在断口那条边底下**，
那条边 `Edge(px)` 是一处真相（三支正弦），剪土层/耕作层/墨线共用；② 草茬与土坷垃
改扎在**路面那条线** `rootY`；③ 井口九块碎土与井筒洞沿原按 `g.yTop`（地表线上 10cm）
起，整个浮在路面上头。另：**等距等大的一排坷垃只露同样厚的一片＝花纹不是土**。
排查这类问题的路子（比读源码快得多）：`shot --eval` 里把 `material.color.setRGB(3,0,0)`
给可疑网格上色，再逐列读 `getImageData` 找"所有列都终止在同一个 y"——那就是刀口。

细节写在 TunnelLight1943/CLAUDE.md 的「地面是三块」与「材质是形，不是颜色」两节。
相关：[[tunnellight1943-workflow]] [[tunnellight-canvas-texture-washout]]
[[tunnellight-camera-one-scale]] [[tunnellight-plain-geography]]
```

## tunnellight-indoor-actors

```markdown
---
name: tunnellight-indoor-actors
description: 地道里的光——演员/携带物的绘制序号必须钉死，NPC 进屋走 IndoorHidden 的门洞判据
metadata: 
  node_type: memory
  type: project
  originSessionId: d0181621-500b-4b3e-9d6f-8934e6af5dbe
  modified: 2026-08-10T04:57:50.567Z
---

《地道里的光》深度规范的两个非显然结论（2026-08-07，用户报「娘的深度和这个房子不对」修出来的）：

1. **`SetPlayOrder` 派的序号必须写进 `userData.fixedOrder`**。骨架挂在 z=ACTOR_Z 的
   容器下，骨头各自的**局部** z 全是 0；`ApplyDepthOrder` 只看局部 z，环境每重建
   一次（`builtKey` 里任一旗标翻动，打水链就翻两次）整个人被打回行走线那一档，
   沉到房子立面（`BAND.facade` 0.4）后头，而手上提的桶是 play 层的直接子物、
   局部 z 就是 CARRY_Z，照旧浮在墙外 —— 症状是"墙上挂着一只没人的水桶"。
   同一处 codex 在 origin/master 上独立修过一遍（还加了 `CheckBandZ` + tag）。

2. **NPC 走进可进入的屋子要走 `IndoorHidden`**，判据是**门洞中线**（`homeRange.door`
   = `p.x + p.w/2 - 25/PPM`，对齐 `DrawHouse` 里 door 洞的画法），不是屋子范围
   `x1`——用 x1 的话人还在东墙外一米就凭空消失。隐去时要连影子、castShadow、
   carryMesh、lampMesh 一起收，`SyncCarry` 里再把 `carryMesh.visible` 收回来。
   **跟着走的人（`a.following`）豁免**：玩家下地窖那一两秒妹妹还在地面上。
   玩家自己不走这条（他进门时立面正在淡，拿他当判据会闪一下）。

3. 携带物的标签表容易漏：同一只桶叫过「空水桶」「一桶水」「桶」「满桶水」，
   已统一成 `BUCKETS`/`ALONG_ARM`/`HAND_HELD`/`HOLD_WEIGHT` 四张表（Script_World
   模块顶部），画布、挂点、姿势都从它们取。`UpdateOne` 收的是**标签**不是布尔。

4. **`carry`（扛在肩）与 `hold`（提在手）是两档姿势**（Rig，2026-08-07 加的）。
   原先手里的东西也套扛的姿势——手臂抬到肩头，水桶就顶在脑袋上挡着脸。
   hold 按 `holdW` 0..1 插值：胳膊坠直、身子后仰配重、空手那侧甩得更开、步子小一档。
   挂点也跟着变：垂 0.20m 是迁就旧姿势的，胳膊坠直后桶会杵在地上（柱子才一米出头），
   收到 0.05，再往前挪 0.11m 免得桶整个盖住人的剪影。

**投掷靶心 = 三处同源**：`Data_Scenes` 的道具 x + `Data_PropArt` 的 yOffset +
Core 里 beat 的 `target`/`insert` 镜头。花布巾曾经 yOffset=5.2（老槐树才 3.0m 高），
布巾和靶心一起飘在树顶上方两米的空中。改一处必须改三处。
**弹药堆离投掷站位（靶心西 6m）要留 1.5m 以上**：挨太近的话捡完石子转身面朝东
那一下会把人推出站位，走回来再转身，来回没完——自动通关直接卡死（SmokeTest 会红）。

5. **过场调度先查 interior 隐藏区**（2026-08-09，风吹门那场修出来的）：柱子家
   `interior:true`，门洞以西整段是 `IndoorHidden` 区——把爹娘摆在 32-33 演戏、
   玩家又站在院里（门洞以东），立面是实的，**这一家人整段隐身**，镜头里只剩
   空门框（上线好几天没人发现，因为 SmokeTest 只断言 state 不断言"看得见"）。
   屋外的戏一律摆到门洞 x 以东；要在屋里演就走 `state.beat.indoorScene = true`
   （立面半隐 0.16，并行分支引入）。排查招：playwright 截图后逐个演员核对
   "state 里在场 ≠ 画面里在场"。

6. **"重量感"的配方**（2026-08-09 用户退回扶门「一点重量感也没有」定的）：
   跟手运动学（lean 朝手位收敛+限速）怎么调参都读成没分量。要 lean+vel 真动力学：
   重力恒拉（`G*(BIAS+sin(lean))`）、手是**有上限的**对抗力（弹簧+阻尼+力臂）、
   撒手加速坠、磕停带代价（掉进度+扬土+按速度给音量）。再配三件：反作用事件
   （爹每礅一下门往外弹，玩家手上一直有事）、角色 strain 姿势（braceDoor 按
   poseU 压腰）、按转角出粒的吱呀（doorCreak）。进度按"下"跳不按秒表涨。

相关 [[tunnellight1943-workflow]] [[tunnellight-25d-feedback]]。
```

## tunnellight-plain-geography

```markdown
---
name: tunnellight-plain-geography
description: 地道里的光——全作地理是冀中平原（不许画山），地平线上一排炮楼的实现与坑
metadata: 
  node_type: memory
  type: project
  originSessionId: d0181621-500b-4b3e-9d6f-8934e6af5dbe
  modified: 2026-08-07T11:54:32.118Z
---

《地道里的光》的地理是**冀中平原**，2026-08-07 用户点名纠的：「远处的炮楼周围应该是
大平原（按照历史）」。这是全作前提，不是美术偏好——**正因为一马平川、无险可守，
才只能往地下挖**。远景画成山梁，整个故事的因果就断了。

- **地平线一律压平**：`AddRidgeBand` 的 amp 从 40/26 收到 6/4。纵深改交给
  ①一层层雾 ②地平线上的防风林树行与几户人家的屋脊（`rows` 参数，跟带子画进
  同一张贴图，不多加网格） ③远村剪影 farTown ④中近景树列。
- **地平线上的炮楼**（`Data_Scenes` 的场景级 `horizonForts[]` + `Art.DrawHorizonFort`）：
  1942-43 冀中「囚笼政策」——公路、封锁沟、每隔几里一座炮楼。村庄 10 座 /
  fields 6 座 / tunnelVillage 7 座，间距刻意不匀、高矮各异（等高等距排过去像栅栏）。
  夜里楼顶点一粒灯（`lit = night && !ruined`）——这游戏讲的就是灯。
- **只用 hills 一层**。试过再往 farTown 加一档近的：两层视差速率不同，走着走着
  两座叠在一起，同形同色叠出来是畸形轮廓，读不成两座楼。同层间距固定不会撞。
- **糊与雾只给该层的一半、颜色另压暗 0.72**：按整层的量去糊，砖石塔就化进
  地平线没了。空地上竖着的塔本来就比田野轮廓硬、比远村色深。
- **楼顶不许画均匀垛口**——那是欧洲城堡的语汇；华北炮楼是砖砌方筒 + 一圈齐平
  女墙。**高宽比压到 1:2.4 上下**，给到 1:3 就成了烟囱。
- 摆位换算同 [[tunnellight-village-dressing]] 的 backdropFolk：x 是层内坐标，
  某座在 `camX ∈ x*COMP ± 6.3*(dist+|z|)/dist` 时进画面（村庄 dist=13.8 →
  hills COMP 2.833、窗口 ±26.4、一屏 18.6 个层内单位）。间距 6~8 ＝ 同屏两三座。

相关 [[tunnellight1943-workflow]] [[tunnellight-village-dressing]]。
```

## tunnellight-relics-bag

```markdown
---
name: tunnellight-relics-bag
description: 地道里的光 收藏品/包袱系统的架构与四个踩过的坑（fore层缩放、洗白双色、peek开合、CLI摆位语义）
metadata: 
  node_type: memory
  type: project
  originSessionId: d0181621-500b-4b3e-9d6f-8934e6af5dbe
  modified: 2026-08-10T16:37:40.213Z
---

《地道里的光》收藏品系统（2026-08-11 上线，commit a1348d3）。铜顶针孤例被用户退回（「铜顶针是什么鬼」），升级成勇敢的心式系统：9 件有史实出处的老物件（边区票/军鞋底+顶针/晋察冀日报残页/鸡毛信/弹壳哨子/石雷拉火管/红缨枪头/边区造手榴弹柄/识字班石板）+ 右缘包袱条 UI + fore 前景草半遮。

**架构**：数据在 `Data_Scenes.json` 各场景 `relics`/`fore` 数组（加载期校验）；拾取在 Core（守卫同 lookables）；持久 `tunnelLight1943.bag.v1`（localStorage，Main 灌回/存档）；画笔 `Art.DrawRelic`；UI 全在 Main（`#bagPanel`）。规范已写进 TunnelLight1943/CLAUDE.md「收藏品（老物件）与包袱」一节。

**四个坑，别再踩**：
1. **fore 层（z=+3.4）有层缩放**：组按 (D_REF−z)/D_REF 预缩，往里摆东西作者坐标要 `x / LAYER_COMP.fore` 除回去，否则 x=125 的草被画到世界 107、整层滑出画框。
2. **一支画笔两个去处两套色**：世界贴图走 CanvasTexture 被洗白，要 `dim:true` 预压 ~0.55；包袱条是 DOM canvas 不洗白，照原色。剪影档 `sil:true`。
3. **白天引导别用加色光晕**：土黄底上 0.4+ 强度照样看不见。用普通混合的四芒星白闪小贴图（缩放+透明度一起呼吸）。
4. **peek 与 open 是两个状态**：拾取后包袱条"探头"3 秒也可见但没打开；按钮开合必须判 `state.bagOpen`，按面板可见性判断会在 peek 期间把"打开"误判成"关上"（CLI 拍面板就是这么翻车的）。

CLI 顺手立的语义：`shot`/`state` 给了 `--x` 没给 `--level` 按 zone 全局约定落**地表**并清 cineWalk——DebugJump 逐拍结算常把人留在地下，不清的话 x 会被地下走行范围夹走。
```

## tunnellight-rig-shoulder

```markdown
---
name: tunnellight-rig-shoulder
description: 《地道里的光》骨架的两个隐形坑——胳膊挂在胯上（肩要按躯干角算）、脚贴图 0° 指向前；触地用 world.PlayerLimbTips() 量
metadata: 
  node_type: memory
  type: project
  originSessionId: b05e33e8-727e-4101-a2e9-1ee57c7282b6
  modified: 2026-08-10T09:18:00.642Z
---

2026-08-09 用户报「在地道里爬的动作是不对的 手都飞了」修出来的两条，写进了
`TunnelLight1943/CLAUDE.md` 的「骨架姿势」一节：

1. **两条胳膊挂在 `root`（胯）上，不是躯干上**。`ApplyPose` 里原本只写死了一个
   肩高 y（注释写着"躯干带着肩走"，但那是句空话），肩膀永远钉在胯正上方。
   站着走着躯干才前倾几度看不出来；**躯干一折下去就崩**——爬行躯干压到 76°，
   人趴下去了、胳膊还悬在胯上方半米（实测手离地 0.53m）。修法：
   肩点＝`(sin(torso)·0.86·BONE.torso, cos(torso)·…)`。这一改会动到所有大角度
   姿势（弯腰/扑/挨砸/按住/刨料/翻越/猫腰/挖土），改完要逐个出图复核。
2. **四肢贴图 0° 指向下，脚那块贴图 0° 指向前**。要让鞋底贴地往后铺，要的是
   「大腿+小腿+脚 ≈ 180°」而不是「≈0°」；按 0° 算脚会以踝为轴穿到地板下 0.2m。

**姿势是可以量的，别只靠眼睛**：新增 `Rig.LimbTips` / `world.PlayerLimbTips()`，
返回两手/两膝/两脚/头顶离地多少米（正=悬空，负=陷进地里）。新姿势先按骨长算
角度（膝跪地 → 胯高 = 大腿长 0.31；手撑地 → 肩高 = 两节胳膊 0.49），再用它对一遍。
爬行现在：手 −0.012~+0.089（撑地→往前够抬起来）、膝 +0.005~+0.044、脚 ±0.018，
头顶 0.735 与 `POSTURE_HEAD.crawl`(0.72) 对得上。

注意 `three` 在 node 里装不上，Script_Rig 进不了 SmokeTest；这类几何复核目前
只能在浏览器里跑（Browser 面板 + `world.PlayerLimbTips()`）。

**3. 上臂角 + 前臂角 = 这条胳膊的世界角；超过 −90° 就已经"举起来"了**
（2026-08-10 第十一场重做时抓出来的一整类 bug）。0° 指向下，负值往前上方转，
所以 −54° 是"手伸到身前偏下"，−154° 是"手举到脑袋上方"。栽在这条上的有：
`shelter`（搂住孩子，−154°）、`leanIn`（手蜷在胸口，−118°）、`press`（按住肩膀，
−118°，**还没修，在 c2**）——三个都读成"举着一只手"，手压根没落到人身上，
而且都是"修过一次"的（改的是上臂，没算总和）。**写姿势前先定落点**：
手要停在离地多少米、身前多远，反推世界角再拆成两节；**肘要折死就给前臂写正值**
（把小臂折回来），别靠继续加负数。同一把尺子也用于接触动作的落点——耳光第一版
照抡枪托写成 −82°，手从孩子头顶上方半尺扫过去（兵肩 1.22m、孩子脸 0.91m、
身前 0.4m ⇒ 正确是 −52°）。

**4. `poseK` 的来源判据是"在不在做那个动作"，不是"有没有值"**：`p.vaultK`
平时就是 0（不是 undefined），老写法 `p.vaultK ?? p.poseU` 里的 `??` 永远命中
那个 0，于是进度驱动的姿势（planePush / braceUp）一辈子拿不到进度、冻在第一帧。
master 已抽成 `PoseProgress(o)` 按 `o.pose` 分派——**新增进度驱动的姿势必须去
那张表里登记**，否则做出来是个静止的 pose。

相关 [[tunnellight1943-workflow]] [[tunnellight-stealth-rules]] [[tunnellight-contact-staging]]。
```

## tunnellight-shaft-mouth-ladder

```markdown
---
name: tunnellight-shaft-mouth-ladder
description: 地道里的光——窖口那架梯子只露一截也得认得出；地表本来根本没有洞；框景板漏 dim 就是灰饼
metadata: 
  node_type: memory
  type: project
  originSessionId: cbcb208e-dd68-40f6-a77d-fac43512657b
  modified: 2026-08-17T08:28:40.261Z
---

《地道里的光》2026-08-17 第二轮退回：「地道口掀开盖这个镜头太丑了 特别是梯子那里
完全认不出是梯子」（commit bad6897 → master 72d71cd）。

**先量再改，四个病根都是实拍逐层染红/藏掉查出来的**（`shot --eval` 里把嫌疑网格
`material.color.setRGB(3,0,0)` 或 `visible=false` 再拍一张对比，比读源码快一个量级）：

1. **地表压根没有洞。** 梯子直接从一整片平地里长出来——把梯子藏掉，那儿是块平地板。
   "掀开了什么"这件事在画面上从来没成立过。
2. **露在外头的那一截天生像长凳。** 地表机位只看得见地平线以上两三拃（4.2m 的梯子
   九成五被地面挡着，而且挡它的确实是地面、不是绘制序错），而老版露的正是：一根 1m
   宽的"井口木沿"横木＋两根 0.22m 短竖杆＋一道缩在两梃之间的横档。
   **这一带凡是横平的长条都会被读成家具**——洞沿的土坯第一版砌成两条规整横杠，
   当场又搭出两条扶手。
3. **"俯角"只俯了 12°。** 躺平的东西在 12° 下投影乘 sin12°＝只剩两成，洞给多深都
   看不见。24.5° 能看清（规范上限 25°），可**碎点撤掉之后地面是一整块平色，俯得越狠
   空得越厉害**——最后落在 16°，剩下的靠把洞画大（纵深 0.86m，按"上屏读得出"给，
   不按真尺寸给）。
4. **框景板 `fg` 漏了 `dim`** ＝按原色画，而它贴在镜头跟前一米以内、还要当画面里最暗
   的一块。序章五处手写 `vat` 全漏了，屏幕上是一大片发白没内容的灰饼，**还正压在这
   一镜的主角（窖口）上**。手写 fg 照 Data_ScriptC1 顶上那张 FG 表给（1.78~2.02）。

治法与"梯子怎么才认得出"的四条、以及框景板两条硬账，都写进
TunnelLight1943/CLAUDE.md（「窖口那架梯子」与「框景板（fg）的两条硬账」两节）。
最值得记的一条通用式：**横档两头要探出梯梃**——缩在两梃之间是格子，探出去才是
"穿过去别住的横档"，这是任何裁切下最强的"梯子"信号。

新工具：`WorldPaint.MakeShaftMouth`（躺平的洞，`rotation.x=-π/2`，排在地面之上、
梯子之下）。**竖立牌管平视那一档，躺平的几何管俯角**，两块都要。

相关：[[tunnellight-ground-three-layers]]（碎点撤掉之后俯角会更空，这两件事互相牵动）
[[tunnellight-cine-framing-math]] [[tunnellight-shot-seek]] [[sophia-codex-parallel]]
（这一轮 push 撞了三次并行会话，fetch→merge→跑测试→再 push 是常态）
```

## tunnellight-shot-seek

```markdown
---
name: tunnellight-shot-seek
description: 地道里的光实拍别用 --dur 猜时刻；用 @line/at + zoom + 冻帧（2026-08-12 加）
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 668e4e38-f85f-455d-9d63-b764bd985bc3
  modified: 2026-08-16T12:33:08.358Z
---

TunnelLight1943 拍过场里的某一格：**用 `shot "<beat>@line=N,at=T,zoom=<谁>"`**，
不要用 `--dur`。

**Why:** `--dur` 从整拍开头算，改一句台词时长后面全错位；而且游戏推到位之后
还要等渲染追上（镜头缓动/立面淡出/光照换挡都要真渲染几帧），那半秒里游戏又
往前走——2026-08-12 改妹妹睡姿时，十几张截图有一半不是要的那一格，白看白改，
占掉那一轮近一半的时间。

**How to apply:** `Freeze(true)` 已由 `shot` 自动开（没按着键的拍）：游戏钟停住、
渲染照跑。`zoom=sister|player|31.15:0.2` 直接多出一张近景，别再靠猜裁剪框、
也别再现写 PIL 裁图脚本。躺着的人 y 给 0.2 左右。

**在 worktree 里干活就必须在 worktree 根目录跑 `shot`**（2026-08-16 白跑一轮）：
`node TunnelLight1943/Script_Cli.mjs shot …` 是照**当前工作目录**那份仓库起服务的，
在主仓库路径下敲这条命令，拍到的是**没有你改动的旧代码**，而且它不会报错——
表现是"我加的台词一句都没出现、@line=N 还溢出到了下一拍"，很容易误判成
剧本没生效。开拍前先 `doctor` 看一眼「仓库」那一行是不是 worktree 路径。

同源教训：要问渲染层的事，先看 [[tunnellight1943-workflow]] 里的 CLI 表；
缺子命令就加进 `Script_Cli.mjs` 并写回 CLAUDE.md，别写一次性探针。
导剧本发给用户看走 [[tunnellight-script-export]]。
```

## tunnellight-stealth-rules

```markdown
---
name: tunnellight-stealth-rules
description: 《地道里的光》潜行的四条通用规则（第二关躲避重做定的）——藏是站到掩体背面、危险先可见、动得越猛越显眼、每道关口两条出路
metadata: 
  node_type: memory
  type: project
  originSessionId: b05e33e8-727e-4101-a2e9-1ee57c7282b6
  modified: 2026-08-06T19:25:13.642Z
---

2026-08-07 用户退回第二关躲避玩法（原话：「哪里按住了？」「娘自己不用遮蔽？」
「一点策略也没有」「就不能马车从远处开过来 直接从左侧出现吗」）后重做出来的
四条规则，写进了 `TunnelLight1943/CLAUDE.md`，**全作通用，新潜行段照抄**：

1. **藏 = 站到掩体背光的那一面**（`CoverHides`），不是站进掩体范围里。高掩体
   站着挡得住、矮的得蹲；沟/庄稼地/灌木（`INSIDE_COVERS`）是钻进去的、没有正反面。
   灯绕过去安全侧就易手。`p.hidden` 退回"任何方向都看不见"的强隐身（车影、被按住），
   静态掩体改在 `SoldierSeesPlayer` 里按方向判。
2. **危险先看得见再生效**：巡逻回头扫之前举灯顿 0.9s（`scanEvery`/`scanLift`）；
   掩体背光侧在地上铺影子（World 的 `shadeMeshes`）。安全在哪儿不许靠猜。
3. **动得越猛越显眼**：探测速率乘姿势与移动（站着快走 ×1.5、蹲着 ×0.7）。
   没有这一档，最优解永远是按住方向键跑过去，蹲下与掩体都是摆设。
4. **每道关口至少两条出路，都不能是"站着等"**：读节奏冲 / 跟移动掩体（板车
   **单向**从画框左外驶入、往东出画，`convoy` 的 armAt/spawn/exit/gap）/ 石子引开
   （`MakeNoise` 的 `face`：石子必须落在灯的**背后**他才转身；平飞 7.5m < 站立视距
   10.8m，所以得蹲着摸近）。同伴只演示与救急，绝不替玩家决定什么时候能动。

**娘按住你**＝`state.pressHold`：她丢下自己的掩体扑回来、手真的落在肩上
（Rig 的 `press`/`pressed` 是一对姿势），玩家被按成蹲姿、那一下真的走不动、
也真的因此没被照见；有冷却，且她去引开搜村的人之后这层保险就没了。

平衡自验用 scratchpad 的 `c2sim.mjs`（随机化巡逻相位跑 N 局，傻跑 vs 会玩两个
bot）：目标是**傻跑也过得去但要挨抓几次**（当前 4.25 次 / 27s），**会玩基本
不被抓**（0.05 次 / 28s）。只看 SmokeTest 的「笨玩家能过」抓不到"没牙"这种病。

相关 [[tunnellight1943-workflow]] [[tunnellight-25d-feedback]]。
```

## tunnellight-story-stakes

```markdown
---
name: tunnellight-story-stakes
description: 地道里的光——派差事必须交代前因后果/新人物先亮相；ARM_TOOL_TILT 工具偏角机制
metadata: 
  node_type: memory
  type: project
  originSessionId: 16c2718e-4134-41b8-945a-17548886c04d
  modified: 2026-08-10T05:48:22.649Z
---

2026-08-08 用户退回 c1 搬木料：「为什么搬？解决什么问题？送给谁？一开始也不知道
妹妹在那么远。」由此立了两条叙事铁律（已写进 TunnelLight1943/CLAUDE.md）：

- **派差事三问**（谁要的/为什么缺/去处在哪）必须交代，且优先用画面：爹 micro-cine
  亲口派活、完工后 doorLeafWip（showFlag:tenonDone）立在工作台边。
- **新地点/新人物先在画面里出现过再让玩家去找**：妹妹在 c1_barrow 开拍从家门跑过
  整条街，娘喊「就在老槐树底下玩」钉死地点；c1_cloth onStart 兜底归位（跳幕时）。

**How to apply:** 以后加/改任何"去取X/送X/找X"的差事，先过这三问；数值旗标要
StepPlane 式活玩法与 SettleBeat 跳幕两路都落（doneFlag 模式）。

技术备忘：
- alongArm 工具不都与前臂共线——`ARM_TOOL_TILT`（World，扫帚 0.42rad）绕握点加偏角，
  握点仍在手心。扫帚曾整根叠在小臂上像倚着的杆子。
- 新 prop kind 三处登记：Data_PropArt + Data_Scenes + **World AddProp switch 加 case**
  （漏 case 静默不画，加载校验查不出）。
- 改 Data_Scenes.json / Data_PropArt.json 禁用 python json.dump 重写（全文件重排，
  并行会话地狱冲突）——用 Edit 文本手术。
- `TunnelLight.Tick(n)` 的 n 是**帧数**（1/30s/帧），不是秒。
- micro-cine 相机别用 `kind:"wide"`（全村大全景，人蚂蚁大），用 `kind:"shot"` + dist。

2026-08-10 追加（量身高铺垫）：
- 「玩法要先有由头」也管**过场里的动作**：量身高被退回（「一点铺垫都没有」）。
  配方同修门三镜：撞见由头（插入镜：门框上无条件画着去年的旧刻痕）→ 说一句
  （「去年画的道道，才到这儿」）→ 叫人动作（「靠框上，站直」）→ 才轮到玩法。
  由头必须是**画面里real存在的东西**——旧刻痕原来只活在一条 toast 文字里。
- 细画法：凿槽=暗线+下沿亮茬双线；单根半透明细线在晨雾光照下读不出（实测）。
- ots 过肩镜会把被越过的人**藏掉**换前景剪影——剪影摆不进画框时人就凭空消失；
  机位不合适（主体被挡/剪影出画）一律换普通双人镜。
- 改 Art 后必须**同时 bump importmap 版本号**再实测——踩过两回：改了画笔
  以为没生效，其实浏览器吃的是旧模块。

2026-08-08 追加（丢石头重构）：
- **成功要有人接着**：玩家做成一件事，画面里得有角色回应（妹妹 cheerHop +
  「还是俺哥中」）——和"物体要答话"同级的规则，写角色不写 HUD。
- 投掷=拉弓拽石子（StepSlingAim，真弹道+预览即所得+throwWind 蓄力）；键盘 F
  仍是站位自动解弧的完整后备。新拟物动词记得写回 CLAUDE.md 的表。
- builtKey 里的旗标=该旗一翻就整场重建卡顿（clothDown 已摘，lanternOut 还在
  ——有 pending task chip）。
- 浏览器实拍投掷类交互：屏幕坐标要**每次 move 前用当下相机重投影**，相机跟随
  会漂，提前算好的一组坐标会拽歪。

相关：[[tunnellight1943-workflow]] [[tunnellight-village-dressing]]
```

## tunnellight-structure-refactor

```markdown
---
name: tunnellight-structure-refactor
description: 2026-08-15 六项结构整改后的文件版图——剧本按章在 Data_ScriptC*.mjs、画笔在 Script_WorldPaint、ChapterOneImagegen 冻结、where 认中文
metadata: 
  node_type: memory
  type: project
  originSessionId: e4007163-49c7-45d0-8167-e92bbd55a6fa
  modified: 2026-08-14T16:35:34.821Z
---

TunnelLight1943 2026-08-15 结构整改（六项全做完，已推 master，fd4a7ce→c6d0429）：

1. **`ChapterOneImagegen/` 是冻结快照**（README/CLAUDE 顶部有立牌、.gitattributes
   标 linguist-generated）。grep 命中它一律跳过；改游戏只改主树。
2. **剧本按章在 `Data_ScriptC1..C8.mjs`**：一章一个文件、`export function ChapterCN(K)`
   工厂＋解构参数（正文与拆前逐字相同）；Core **末尾**的 `SCRIPT_KIT` 组装并导出
   SCRIPTS/PROLOGUE_CLIPS（放末尾是躲 RAID_SPEED 的 TDZ）。新用 Core 帮手：章文件
   解构清单 + SCRIPT_KIT 各加一笔。**新章文件必须登 index.html 的 importmap**
   （TestModuleGraphIsCacheBusted 盯着，walker 已修成认数字文件名）。
3. **无状态画笔在 `Script_WorldPaint.mjs`**：LAYER_ORDER/DepthOrder/FixOrder/
   Set*Order、BakeSprite 一族、地形带/视差树/影子画笔/AddCover。可单独 import。
   可变雾色走 `AddRidgeBand` 的 `hazeTint` 参数。跟 state 走的绘制仍在 Script_World.js。
   踩过的坑：合并声明（`const A=1, B=2;`）搬走后 import 清单漏了 B——
   ORDER_GLOW 那次是 renderhealth 的板缝光柱抓出来的。
4. **`where` 认中文**（台词/prompt/章名/c1 场次/老物件）+ 声音（cue/BGM/混音）+
   HUD（DOM id/CSS 选择器）；索引 1086→1828 条。改声音/HUD 不用退回 grep。
5. CLAUDE.md 只留硬规矩；c1 逐拍梗概在 `Data_StoryC1.md`、砍掉的旧设计始末在
   `Data_DesignHistory.md`（再砍大设计就往后者追加）。
6. 有 `AGENTS.md` 指路文件（codex 只读它）。

**Why:** Core 11.5k→7.7k 行、World 6.5k→5.9k 行；grep 不再双份命中；每会话固定
token 省 ~2k；定位粒度到章/模块。
**How to apply:** 改台词去章文件不去 Core；改纯画笔去 WorldPaint；拆代码时合并
声明的每个名字都要过 import 清单；验证仍是 [[tunnellight1943-workflow]] 那套
（smoke 秒级、renderhealth 分钟级，改渲染才跑后者）。
```

## tunnellight-village-dressing

```markdown
---
name: tunnellight-village-dressing
description: 地道里的光——村庄场景充实（乡亲NPC/lookables/院墙鸡窝/地窖陈设）的机制与坑
metadata: 
  node_type: memory
  type: project
  originSessionId: d0181621-500b-4b3e-9d6f-8934e6af5dbe
  modified: 2026-08-07T10:04:04.624Z
---

《地道里的光》第一章场景整修（2026-08-07，用户点名：地窖、悬空摆件、背景空、村里没人、邻居家可交互细节）。机制与坑：

- **干活循环的 track 必须打 `ambient: true`**——`ClearPoses` 每次换幕清掉非 ambient
  轨道。李婶喂鸡（scatterFeed）、老汉扫院（sweeping）第一版没打标，跳完一幕就
  定格成木桩，排查半天。FatherSaw/MotherHoe 一直是这么写的。
- **顺前臂的长家伙，手臂抬多高家伙就横多平**：sweeping 第一版胳膊前伸 58°，
  扫帚横在胸口像端枪。扫地的胳膊只在垂线前后小幅摆（armF -14~-30），帚头才蹭地。
- **乡亲的进退场**：c1 cast 里 MakeActor("auntFeed"/"oldSweep", "villager")；
  c1_raid 第一行（村口喊声）on 里 visible=false 收进屋；散养鸡 prop 挂
  `hideFlag: "raidStarted"`，夜里（night）非 perch 的鸡不画（回窝了）。
- **lookables**（邻居家可交互细节）：`Data_Scenes` 场景级 `lookables[]`
  {id,x,w,note}，Core 通用处理（thimble 块旁边）——白天、非潜行、无其它 prompt 时
  「E · 看一眼」→toast，`state.lookSeen` 每章每处一次。内容走「别人家正在过的日子」。
- **画笔尺寸对着人量**：鸡原稿 0.8m 长跟条狗似的（DrawHen 加了 k=0.55 缩放参数）；
  麻绳盘线宽(1.7S)比圈距(1.5S)大，三圈糊成磨盘大的饼——线宽必须小于圈距。
  地面待拾物走 MakeGroundItemMesh（S=2.0），画小件时记得它会放大一倍。
- **地窖（village chamber）**：洞口暗角 vign 高度按有无 chamber 取 2.55/1.55——
  1.55 在 2.5m 的窖里拦腰一道硬缝；chamber 穹顶要单独补洞沿墨线（走廊墨线只描
  CeilY）。陈设 kind：vat/tuberPile/cellarShelf，`level:"under"` 摆在 Data_Scenes，
  梯子口（27）留空给躲扫荡的戏。
- 新背景 kind：yardWall（p.gate 控制柴门）/henCoop/clothesline；村庄场景
  farTown opacity 0.78、mid/near 树 step 16/14（其它场景保持稀疏）。
- **背景层里的乡亲（backdropFolk，2026-08-07 第二轮："背景里我也需要有同村的
  人物的活动状态"）**：`Data_Scenes` 的场景级 `backdropFolk[]`，World 的
  `AddBackdropFolk/StepBackdropFolk/FOLK_ACT`。四条要点：
  ① **必须用骨架，不许静止贴图平移**（那就是"翻越做了等于没做"的老毛病）；
  ② **层一律 midTrees(-15m)**——nearTrees 只退到 -7.5m，人有前景的六成半大，
     会跟玩家抢戏像第二个主角；midTrees 是四成八，一眼就是背景；
  ③ **x 是层内坐标不是前景 x**：层整体放大过 LAYER_COMP，视差还让它随镜头漂。
     某人在 `camX ∈ x*COMP ± 6.3*(dist+|z|)/dist` 时进画面（村庄 dist=13.8、
     画宽 12.6 → midTrees ±13.2）。坑位按这个窗口首尾相接排才能"沿街总有人"；
  ④ 背景层的糊与雾色是**烘进贴图**的，骨架烘不了——只能靠半透让雾色透上来
     （opacity =(1-LAYER_FADE×1.5)×该层树的 alpha）。
  连带改动：`SetLayerOrder`（SetPlayOrder 的通用版）、`SyncCarry` 认 `s.layerKey`
  且**背景层要把 HandPoint 的世界坐标 worldToLocal 换算**（不换锄头飞出十几米）、
  背景乡亲的家伙不打 persist、`ClearBackdropFolk` 自己收骨架材质（ClearGroup
  只 dispose 直接子级的 Mesh，碰不到 Group 里的）。调试口 `world.__folk()`。
  摆位忌讳：别把背景里同一个动作的人摆在前景同款工位的正后方（拉锯的曾在
  爹的工作台正后方，看着像重影）。
- 巡拍工具：scratchpad survey.mjs（钉 player.x 逐点截图）+ dumptex.mjs
  （按包围盒尺寸把可疑网格的贴图 toDataURL 倒出来看——查"这坨是谁画的"最快）
  + cover.mjs（沿街每 12m 采样，用 `v.project(cam)` 数背景里有几个人，
  比肉眼数可靠）。
- 撞车解决：master 把教翻越的柴垛换成 brokenWall「塌进巷子的院墙」(84)，
  与我的 yardWall 是两种东西，都保留。

相关 [[tunnellight1943-workflow]] [[tunnellight-indoor-actors]]。
```

## tunnellight1943-workflow（改写前的旧版）

```markdown
---
name: tunnellight1943-workflow
description: 《地道里的光》TunnelLight1943 白盒的架构、测试、部署工作流与遗留决定
metadata: 
  node_type: memory
  type: project
  originSessionId: 7009bc7c-bf83-4784-bc83-968869259d26
  modified: 2026-08-15T08:23:09.064Z
---

《地道里的光》Three.js 白盒（/TunnelLight1943/，2026-08-04 三轮迭代上线）。

- **井台三件事（2026-08-10，2812e0c）——都是"量一下就露馅"的那类问题**：①**接绳搬进活卡**（`state.knotCard`/`Art.DrawKnotCard`）。退回的话是「谁看得出来这是打结」，根因量得出来：1.5m 特写下整个结横过来才 0.23m ＝八分之一个画宽。新玩法＝**塞进圈眼穿过去 + 倒手拽三把勒死**（每勒一把结把绳吃进去一截、绳头缩回结跟前，手上一空所以必须重抓）；驱动器改成在卡坐标上拖，`state.ptrPressed` 只认按下那一帧，**测试驱动必须先松一帧再按**否则永远攥不住。②**辘轳加手劲**（`state.stamina` + `#staminaBar`，读数不是进度条）：顺着重量放绳几乎不费劲、**硬撑着不放最费**（撑光了桶自己一顿一顿往下溜，用户点名要的就是这个）、满桶往上摇最费；力气见底只降到 22% 效率，绝不卡死。③**摇辘轳的动作**——先发现**他根本够不着**：轴心 1.43m 比这孩子头顶 1.13m 还高 30cm。三条约束（够得着／圈不许扫过脸／鼓不许压住井口）夹出唯一解：轴心 0.9375、摇把移到西端面 −0.44、柄长 0.12、站位 −0.76；姿势相位取摇把角度，前手走新的 `Rig.ArmIK` 两骨反解（取肘朝下那组）真的落在握手上，**摇把排在人之前**（`BAND.obstacle` 的绘制序、位置仍在 `PlaceZ(BAND.loose)`）否则一伸手就被自己盖住。教训：**"角色动作蠢"先量够不够得着，再改动画**——手够不着的东西，K 多少帧都是假的。断言写进 `TestWinchIsACrankNotALever` ⑦（逐点量那一圈的距离与脸的间隙）。

- **先跑命令行工作台，别现写探针脚本（2026-08-10 起，master 上的 `Script_Cli.mjs`）**：`node TunnelLight1943/Script_Cli.mjs` 有 `where/beats/beat/state/shot/doctor` 六个子命令——`state <beatId>` 无头跑到某一拍喂真输入打状态，`shot <beatId>` 真浏览器真键盘实拍到 `_shots/`（已 gitignore）。CLAUDE.md 把这条立成硬规矩（理由是量过账：改这个游戏七成 token 花在"定位"上）。缺子命令就往 CLI 里加、加完写回 CLAUDE.md 那张表。
  **`shot` 的三个实用点（2026-08-12 拍活卡时踩出来的）**：① **`--eval` 在截图之前跑**，所以能拿它把玩法状态直接摆到想拍的那一格（`--eval "state.beat.foldState={n:3,...}"`），比"想办法真玩到那儿"快一个数量级；旗标之外的中间态全靠这条。② **计时类的相位（linger/倒计时）会在 CLI 的墙钟等待里自己走完**——`shot` 在 eval 前后各有 450/420ms 等待且 rAF 一直在跑，拍 2.5 秒的静场必须 `dur=0.005`（低于 0.01 就跳过 StepFrames 和那次 420ms 等待），否则拍到的是它之后那一拍。③ **worktree 里默认没有 node_modules**，`shot`/`Script_RenderHealthTest`/`Script_DepthAudit` 都要 playwright：先 `npm i -D playwright-core`（19 秒），**跑完记得 `git checkout -- package.json`**，别把版本号漂移带进提交。
- **手持物（ALONG_ARM）的三条画法规矩（2026-08-08，步枪，632d647）**：① **原点＝真实的握点**，不是道具的一端。步枪原来把原点放在枪口、整支枪往 +y 画 0.98m，而兵垂手时手心离地才 0.7m ——枪托直接穿进地面（用户："绑定的点位错误"）。按实物量：三八式握点在护木，离托底 0.42m、离枪口 0.83m，所以 **+y（手往下）只有一小截托，-y 是护木+枪管+刺刀一长条**。② **画布是"握点到最远端×2"**：`MakeCarryMesh` 的锚点固定在 `wPx/2, hPx/2`，刺刀尖离握点 56.6px 就必须 hPx≥114（原来 96，正因为够不着才把枪往下堆）。③ **粗细按实物折算，不按"看得见"折算**：第一版改完位置后枪管 5cm/护木 10cm/托 16cm，侧视里护木和人的躯干一样宽、托是块板子；收到 2.5/5/11cm 才像枪。`alongArm` 的语义是"贴图 +y 转到肘→手方向"，所以垂手＝道具朝下，抡起来＝道具甩到手的外侧（buttStrike 砸的仍是托）。

- **绕圈类交互的三条定式（2026-08-08，接绳打结，496b79c）**：① **指尖上的活不给长按后备**（用户："为什么还支持长按交互按钮的模式？干掉"）——判据是"乐趣是不是就在手上"：是（打结/缠绳）就只认手，不是、只是费力气（挖土/顶撑木）可留慢速档。**删后备必须同时给驱动器一条真输入的路**（`GetBeatTarget` 出专门动作 `knotAt` 带圆心半径，AutoPlay 真的绕圈），否则自动通关当场卡死。② **方向必须有意义**：老版 `Math.abs(d)` 两边都算涨＝"在这儿画圈满角度"不是缠绳；改成正向缠、反向解（缠满后倒转会把结解开）。③ **三处必须同向**：判定方向 / 绳圈**画**的方向 / HUD 提示演的方向。**换算备忘：世界角度递增（atan2，y 朝上）＝ 屏幕逆时针 ＝ CSS `rotate` 递减**——打结就是栽在这：绳圈按世界角度递增画（屏幕逆时针）而 CSS `rotate(0→360deg)` 是屏幕顺时针，提示和绳子当场打架。辘轳是对的可照抄。另：**能让道具自己招呼玩家就别挂 HUD 图标**（绳头在断头上晃，晃的方向就是该绕的方向）。

- **翻越＝撑手过去，不是跳（2026-08-07，c478a26，被退回两次才做对）**：前两次改的都是**峰值**（0.74→0.58），形状没动——而 `peak * sin(π*k)` 无论峰值多低都是**对称弧＝抛物线＝跳跃**。做对的形状是**带平台的梯形**：撑起(0→0.30)→**停在顶沿高度(0.30→0.64)**→松手加速落下。中段那个平台就是"手是支点、腿从顶上扫过"，是"翻"字唯一的视觉证据；姿势关键帧要补一帧 B2（还骑在顶沿、腿已从后扫到前）并与高度三段严格对齐。抬升按**绝对米数** `VaultLiftFor(top)=top+0.10−站立胯高(0.50)`，不按 top 的百分比（百分比会让矮的抬过头、高的抬不够）。**规范已立在 `Data_DepthSpec.mjs`**：`VAULT_MAX_TOP=0.85`（基准＝C1 那堵塌墙 0.82m，高过胯就是"攀"不是"翻"）/ `VAULT_MIN_TOP=0.25` / `VAULT_HIP_STAND=0.50`；三处拦截＝Data_Scenes 加载期抛（超限/缺 top/**贴图比声称顶沿还矮**）+ SmokeTest 全场景扫上下限 + **逐帧量平台占比（<25% 判成跳跃）**。新动作要判"是不是跳"，就量平台，别看峰值。

- **三条实拍抓出来的通用教训（2026-08-07，b4fc07a）**：① **画笔画出画布＝顶上被裁**——DrawFallenWood 画到 1.08m 而 sprite 只有 0.98m 高，裁平之后读成"一口麻袋"（用户原话"这什么鬼"）。改画笔前先核 `Data_PropArt` 的 `sprite.h` 与 `Data_Scenes` 的 `top/h`，三处必须同一个数。② **过场演出不许和 obstacle 带的路障同坐标**——obstacle(0.95) 比演员(0.6) 近，谁站上去谁被整个盖住；c1_father 审问戏曾整场跪在柴垛 x=38 里，只看得见一根枪管。新断言 `TestCineActorsClearOfObstacles` 逐帧扫过场演员与 `scene.vaults` 的水平间距（半宽+0.35），它当场又抓出第二处（妹妹）。③ **护送结束跟随者的 level 不会自动跟到玩家那层**——c1_father 抱妹妹那拍她留在地面、柱子在地窖，特写里是"搂着空气"；显式钉 `sis.level = state.player.level`。另：**大远景里的群戏等于没有**——52m 画宽下一个人十几像素，用户"还是没看到鬼子的队伍"，改成 dist 12-13 的中景才读得出队伍；**骑乘物的贴图中心不是鞍座**（自行车座偏后 9px），摆车要按座位偏移，`lift` = 座高 − 站立胯高(≈0.60m)。

- **进村车队（2026-08-07，3f90558，用户拿景区实拍立的规矩：日军出现不可能只有两个人）**：c1_raid 进村＝伪军自行车开道→挎斗摩托（驾驶+斗里的兵）→六人徒步纵队→翻译官；专门一个无字幕车队镜。机制：**坐骑=贴图+正常演员骑上去**（World `SyncMount`：自行车摆骑手身后 `BAND.loose`、摩托摆身前 `CARRY_Z` 让斗盖住兵的下半身；画笔 DrawBicycle/DrawMotorcycle 一律画朝 -x，朝 +x 整张镜像）；骑手 pose rideBike（蹬踏跟位移）/rideMoto/sitSide + lift 抬臀，**carry:"" 压掉兵默认手持步枪**（`a.carry ?? 默认` 对空串不生效，专门用这一点）；**pinTo 机制**（StepCineActors：a.x=host.x+dx·(host.heading≥0?-1:1)，偏移随镜像翻——斗永远在车尾侧）。考场不变难：判定仍只 raid1/raid2，其余 decor 撂东街 x≥112；收尾=整支队伍押着爹收队出村。合成音效 motorPutt（锯齿×8Hz 方波斩波，3 节点挂 4 秒不吃 VOICE_CAP）/bikeBell；cue 转发补 delay/pan/rate。回归断言 TestRaidColumn。**修了一个会冻死过场的真隐患**：某条配音的播放 promise 悬死（自动播放被拦/断流）→ speaking 永远 true → 全部过场卡住且静音解不开——Soundtrack 加 15s 看门狗。headless 验证时这个坑的表现是「行推进越走越慢/卡在某行」，遇到先想它。

- **C1 故事填充过审上线（2026-08-07，589e3e7）**：针对用户四条批评（不像一个村子/扫荡无铺垫/没刻画艰苦/走流程感）的填充，独立剧情审查 agent 两轮过审（第一轮 FAIL 卡「几万万人的华北」量级——华北沦陷区约一亿，只能说「一万万」；水不归摊派管、被卡死的是**盐**）。定式：①**警讯链五环**＝报信民兵跑过→街坊走进门消失→锣 J-cut→村口喊声→兵进村；②**艰苦长在道具里不喊苦**（断井绳=伪军收麻、木料=半袋高粱订的门、妹妹守树等槐花）；③**爹被抓三重因果**（铁匠旧事伏笔→问粮摇头→名单收口"梁家村，木匠"，底牌必须压在拒绝**之后**翻）；④**翻译官贯穿一二七章**（decor puppet "traitor"，MiniMax speech-2.8-hd 配音 voice_id=Chinese_gravelly_storyteller_nv1 记在 Data_VoiceCast roles.Traitor）；⑤娘全章唯一一句台词在 c1_water onStart 的 micro-cine 派活（**chain 的 micro-cine 在第一帧才起**——测试要先 step 一帧再排空 microCine，否则 interact 被吞）；⑥乡亲 wander 系统在 StepCineActors（过场里村子也得活着）。审查员格式（六维：因果/史实/村庄感/艰苦/规范合规/流程感 + PASS/FAIL + 必须修/建议修分级）好用，复用。

- **来源（2026-08-05 重构后的 Notion 树）**：主页《地道里的光》(3b160335-331c-81e4-84c9-dfff5b98c389)=电影式大纲（无台词）；子页三份——**剧本**(3b360335-331c-8158-99cb-ec791826805c，全部台词/旁白按章拆分，**与 SCRIPTS 同源**：scratchpad `extract-script.mjs` 从代码生成，改台词以代码为准回写)、**关卡设计**(3b160335-331c-8103-92ce-f85873828e06)、**音效**(3b360335-331c-817d-bb25-d85a2b1b2242，配乐6-mood表/音效清单+待补/配音体系含 Qwen3-TTS 音色锁定规范——那份规范是另一并行会话建的，已从主页搬入)。八章结构，三原则=小人物目标/行动表情感/保护而非杀敌。**2026-08-05 起两份长文档均按章拆子页**：剧本下 9 个子页（序章+八章），关卡设计下 8 个子页（父页只留总纲/铁律/动词表/教学曲线/章节索引）；改某章内容要更新对应子页，extract-script 回写也按章写子页。
- **C1 双评审通过（2026-08-05，演出组+关卡组各 FAIL→修订→双 PASS）**。定下的全作规范：①**旁白铁律**——只说画面外/心里话/时间，不实况复述画面动作（117 条舞台提示待按此审计，本次只改了 C1）；②惊变时刻旁白闭嘴走同期声，日军说话用日语原声无字幕；③**无文字引导三层配方**——NPC 图形气泡声明缺什么/目标同屏露一角（跑腿单程≤1.5屏）/NPC 视线手势即引导线；④妹妹等被护送者**永不成为失败原因**；⑤失败文案分级（首败无文字）、重试≤15秒。C1 修订要点：序章节奏曲线（1-5 快切→9 变速→10 起慢拍带小动作）、第13段粮铰链（呼应审问问粮）、第14段娘+妹妹一幅画登场、打水链两跳半教单格换手、独轮车运木料教推、投空石子惊飞鸡雀=声音后果演示、扫荡段四动词进考场。实测观察点五条已记在关卡设计 C1 节尾。
- **C1 已按定稿设计实装（2026-08-06，worktree 未提交待用户试玩）**。新节拍序：prologue(15段插卡,Ken Burns 慢推,btnSkipCine 跳过)→open(无声走位行)→doorframe→carve→mark(？气泡哑剧)→**barrow**(独轮车链:扛放+推,obj:"barrow" 复用 state.cart,完毕 cart=null+barrowHome 停 42.6)→**tenon**(strike 节拍:3+4 变奏,第三下敲歪 gag,楔子画在台面 y+0.98)→water(两跳半:屋内提桶31→挂桶发现绳断→woodpile drop 换手→绳头外露→接绳→折回取桶→winch→娘 36.4 门口接桶 carry"桶")→cloth(妹妹 reachJump 轨道+灰/实弧线 throwAim+投空 sparrowBurst)→sisterHome(onDone gong J-cut)→raid(村口喊声 VO+娘一推走位[line0 预走位解决护送拖尾]+考场布防 raid1[41.8,46.5]/raid2[36,40.5])→hide(peek 扒墙缝微过场+stonePile 45.2 软窗口+fallenWood 42.9 翻越)→father(日军 noSub 日语行+问粮补白+sobBreath+irisFocus 刻痕)。新系统：**vaults**(scene.vaults{x,w,top,flag},MovePlayer 自动翻越 VAULT_DUR0.62,followers 镜像 pose+crouch)、**Cue 队列**(state.cues→Soundtrack 排空;新合成 gong/henSquawk/flutter/sobBreath/tenon/whoosh/vault)、**气泡**(def.bubbles 回调逐帧+bubbleFlash 一次性;图标 plank/rope/q/stone 同一语汇)、链新步骤 **drop/pickupGround**(flags.bucketAt)、**失败分级**(StepDetection failN:首败 spotFlash「!」无文字)、noSub 字幕抑制、SkipPrologue 导出。测试：SmokeTest+新旗标断言/jumpcheck 78 幕/cine-audit 新期望表（行号已位移:father 8 行 raid 4 行）全绿。坑：DebugJump 需清 bubbleFlash/spotFlash；道具别放进 cover 区（plank 曾进 hayA@52）；节拍 def 与 prop 坐标要同步改（stonePile 42.5/45.2 错位教训）。
- **语音已切 Qwen3-TTS 1.7B 全量（未提交，待试听）**：Codex 检出的 153 条 Qwen mp3+manifest+烘焙脚本+8 参考声线已整体导入 worktree；补烘 23 条（序章15/C1修订3/同期声2/C2改稿3）；新增 Enemy 日军声线（seed 1943009,日语,SHA 7CCE0322…已锁進 Data_VoiceCast+音效文档,离线备份 TunnelLightQwen17Work/VoiceReference/Enemy.flac）；管线：node Script_VoiceExtract.mjs → TunnelLightQwenTtsCuda_20260805 venv 跑 Script_VoiceBakeQwen.py --workDir TunnelLightQwen17Work_20260805（**别设 HF_HUB_OFFLINE，transformers 要联网查一次元数据**）；角色级 language 字段支持外语行。\n- **潜行段两条硬规矩（2026-08-06 事故换来的）**：①**重置点绝不能落在任何人的视线里**——否则退回原地=退回敌人脸前，玩家「永远也跑不掉」（C1 考场曾把巡逻带 [41.8,46.5] 压在重置点 42.3 上）；②**撤退方向必须是空的**，兵放在玩家背后/侧后，别站在活路上。兜底：StepDetection 有 `beat.graceT`（重置后 1.5s 不判定）；节拍可写 `def.visionScale` 收视距（C1 考场 0.62→9.3m），它走 VisionScale() 所以判定/娘的决策/渲染光带三处自动同步。回归断言 `TestStealthEscapable`（SmokeTest 内）：笨玩家一路直走必须过得去，且不钳 detection——自动通关测试钳了 0.9，抓不到这类 bug。
- **HUD 糊的三个根因（2026-08-06 全修）**：①CSS 写了 `Noto Serif SC` 却没人加载它 → Windows 回退 SimSun，而 HUD 用 500/600 字重，SimSun 只有一档 → 浏览器合成假粗体（最主要）。修法：index.html 加 Google Fonts 四档 + 回退链改微软雅黑不落宋体；②`transform: translateX(-50%)` 居中 → Chrome 关次像素抗锯齿 + 奇数宽度钉在半像素上。修法：一律 `left:0;right:0;margin-inline:auto` 布局居中（toast 停稳后 `transform:none`）；③13px 字配 12-18px 的 text-shadow 光晕 → 笔画糊一圈，收到 2-3px 贴身暗边。**注意：DOM HUD 无法用 canvas.toDataURL 截图验证**（那只抓 WebGL 缓冲），Browser pane 隐藏时 innerWidth=0 也测不了 rect——只能验根因（document.fonts 里 400/500/600/700 都 loaded、computedStyle.transform === "none"），观感要用户自己看。
- **提示铁律：键名不进文案（2026-08-06 用户立的，"快捷键+文字有点蠢，参考勇敢的心；移动端可没快捷键"）**。写法：`E · 动词` / `按住 E · 动词` 前缀，`Core.SplitPrompt` 拆成 {act,hold,text}；HUD 按 `inputMode`（最后动过的输入设备，键盘/触屏各自置位）翻成**键帽**或**与右下角触屏钮逐笔相同的线描 SVG**。带键的走 `#actPrompt`——一枚徽章 + 一个≤6 字的动词，浮在柱子头顶（世界→屏幕换算用 `cam` + `world.viewSize`，同 irisFocus；落点取整像素、无 transform）；**没有键的状态行**（"跟上娘""！探杆就在头顶"）才留在底部 `#prompt`。长按的百分比不写成字，`state.promptFill` 画成徽章外圈 conic-gradient 进度环。回归断言 `TestPromptsAreDeviceNeutral`（SmokeTest 内，扫 SCRIPTS 全树 + Core 里写死的 prompt）：文案里出现"按 E""（C）"或动词超 6 字就红。坑：章节卡阶段 StepGame 提前 return，`state.prompt` 是死值——徽章必须用 `phase === "playing"` 兜住。
- **图标贴图的密度档 `ICON_SS = 12`（2026-08-06）**：引导气泡（`DrawIconBubble`）、失败「！」这类巴掌大的图标总在 3.2m 过肩特写里出镜，画面密度到 ~600px/米，而按 48px/米 标尺烘出来的贴图要放大十几倍。加密后特写下边缘最大梯度 46→167、过渡带 31px→10px（页内 A/B 量的）。合榫楔子走 PROP_SS（160×44 → ×4）。**新增任何会被推特写的小图标，先想密度档**。
- **干活的家人 + 后果小窗 + 景别推近（2026-08-06，未提交待试玩）**：①跑腿时爹娘不许站着围观——`FatherSaw/MotherHoe`（Core 里的小助手），Rig 新增 `sawing/hoeing` 循环轨道；锯/锄头是 DrawCarry 新 label，**长家伙跟着前臂转**（World.SyncCarry 的 alongArm 分支，用新导出的 `Rig.ElbowPoint` 算肘→手角度，贴图一律沿"手向下"画）；barrow onStart 娘走位去菜畦（新 prop veggieWest kind:crops x16.5），`def.tick` 每帧回调接"走到就开锄"。②**后果小窗**（勇敢的心画中画）：Core `state.pip={who,hw,t,onEnd}` + `ShowPip`（落 flags.pipShown 供测试）+ chain 的 `def.pipIdle={after,cooldown,on}`（负数计时=冷却）；winch 步新钩子 `st.onFilled`；World `SetPip/RenderPip(rect)`=第二台 PerspectiveCamera + scissor 剪裁区（视差层全锚世界坐标，第二相机白拿透视，渲完必须还原 viewport）；DOM `#pipFrame` **框用 border 画、背景必须透明**（GL 在画布上、DOM 在上层，背景色会把剪裁区盖死），出场只许白闪不许 transform（会跟 GL 区错位）；rect 每帧从 #pipView getBoundingClientRect 量。C1 打水：桶触水娘停锄回望+小窗、摇上来娘动身+小窗、卡住 22s 惦记一眼（onEnd 回去锄地）。③BaseShot 整体推近：村庄 7.2→6.3/夜 6.6→6.15/tunnelVillage 8.6→8.0/tunnelFort 6.4→6.0。④坑：World 的 digging 判据原是 `prompt.includes("%")`，百分比改进度环后就死了——已换成 `promptFill>0`；DebugJump/StartChapter 要清 state.pip。测试 `TestWorkStations`。
- **交互重做的判据：动词要有"手上的分量"（2026-08-06，用户否掉了敲木楔）**。原话「一点交互感代入感也没有…视角离这么老远 敲这玩意儿有啥意思」。合榫 `strike`（站十几米外按 E 敲三下）整个删掉，换成 **`plane` 刨料**：一趟长推，推得稳出一整条刨花、中途松手刨刃啃住只出碎屑（quality 1/0.6/0.35），三趟把灰毛料刨成亮木，刨花堆在地上。要点：①**姿势由输入进度驱动**（`poseK` 0..1，不是时间/循环）——Rig 里 planePush 与并行线的 vault 共用这一个参数，World 侧 `poseK: p.vaultK ?? p.poseU`；②**工具挂在 HandPoint 上**，绝不另算一份 u→x（两条线必然对不上，刨子会飘在手外）；③输入与划线同源（位移驱动 `dragX` + 按住 E 推），`state.dragTrack` 把 QTE 轨道通用化（tip 可换、推到头翻向）；④**镜头必须写 `cam`**：4.1m 画宽（老版没写 cam＝12.6m 跟随景别，这就是"离这么老远"的根）。坑：**按住 E 推会让 MovePlayer 先把人走出工位**——held 时要把 player.x 钉死；台面高 0.54m（DrawBench），料上沿 0.71m，画布中心偏移的**符号**写反料就飘在台面上方；这几件道具要走 `SetPlayOrder(z)` 而不是 FixOrder，否则料排到人前面挡住脑袋。测试 `TestPlaneBeat`。
- **自测不许瞬移玩家（2026-08-07，血的教训）**：刨料上线后用户第一句是"我什么都干不了 阻塞了"——示范结束柱子站在工位外 0.92m，判定圈只有 ±0.85m，屏幕上零提示。而我的每条断言都先 `state.player.x = workX` 把人挪过去，**恰好跳过了"玩家怎么走到工位"这一整段**，全绿的测试一个字没提。规矩：凡"玩家要自己走到某处"的节拍，测试必须走真实路径（只喂 input），并断言节拍自己把人送到位。同类：浏览器验证也要用真 PointerEvent 拖，别直接写 state。
- **`ClearPoses` 与 ambient 轨道（2026-08-07）**：`AdvanceBeat` 会调 ClearPoses 抹掉所有 pose/track——它本意是清过场残留，却把"干活的循环"一并清了：交完水桶链一结束，爹的锯和娘的锄同时定格，两个大活人在院里站到章末。干活轨道打 `{ ambient: true }`，ClearPoses 跳过；真要停活的地方本来就显式写 `track = null`。
- **旗标进 builtKey ＝ 整场景重建（2026-08-07，实测 931ms）**：`thimbleFound`/`henFlew`/`raidStarted` 这类"道具在不在"曾编进 builtKey，捡一枚顶针就把全村几十张 PROP_SS 贴图重烘一遍，明显一卡。现在：纯显隐走 `flagProps`（建一次，UpdateProps 切 visible）；只改画法的（井绳断口、木料堆绳头）走 `propRedraw` + `RedrawProp` 单张重烘（记得 `setTransform(ss,…)` 补回超采样缩放）。**旗标进 builtKey 前先问：它改的是"有没有"还是"长什么样"——两者都不该重建世界。**
- **人物贴图密度与线宽（2026-08-07）**：`PART_PPM` 150→**480**（刨料 4.1m 画宽下画面密度 ~900px/米，150 要放大六倍）。骨架美术里写死的 lw/amp 必须同比放大，否则墨线细成蛛丝——统一走 `INK_K = PART_PPM/150`，`DrawLimb/DrawTorsoPart/DrawHeadPart/DrawFootPart` 都收 k 参数。八种角色共 17MB 贴图，可接受。
- **人形比例与认人（2026-08-07 用户提的）**：躯干侧视厚度是**胸廓前后厚 ≈0.29m**（`BONE.torsoW`），不是肩宽——原来按 0.42m 画且下摆比肩还宽，人成了木桶；现在肩收/胸最厚/腰掐/摆散。**爹娘必须一眼分得开**：娘＝靛蓝土布（`PAL.mother` 蓝）＋脑后发髻＋大襟长摆（`LONG_COAT`）＋矮一档（BODY_SCALE 0.90），爹＝土褐短褂束腰。色相是远景唯一可靠的认人线索。
- **顺前臂摆的工具不许镜像（2026-08-07）**：锯/锄挂在 `HandPoint` 上、朝向由世界系 `atan2(肘→手)` 给；再乘 `scale.x=-1` 就是"先翻再转"，人一朝左工具就指到天上。`alongArm` 分支只旋转不镜像。另：链上**没捡的东西要全画**（`chainItemMeshes` 一件一槽），只画当前步那件会让第二根木料凭空出现、母鸡蹲在空气里。
- **拟物交互＝全作标准（2026-08-07 用户定的，已写进 CLAUDE.md「拟物交互」）**：任何"对物体做功"的交互不许是进度条/长按——玩家直接拖动、操纵被动物体本身。已立范式：长推（刨/划线,dragX）、攥住拖（石笔,pointerWorld）、绕圈（辘轳/打结,绕轴心转角）、**笔画做功 `StrokeWork`**（挖/按/顶/拴：down/up/circle 三种 stroke，step 上声明 `stroke:`+`gestureY:`，方向不对不涨，每攒满一下 Cue"dig"+FlashPose，松手功泄掉，键盘按住 E=0.85× 后备走同一账本）。长按+进度环只留给 `sustain: true` 的"保持状态"动作（c4_listen 听）——量时间不量功。测试 `TestStrokeWork`。坑：测试手动改 `beat.stepIndex` 会绕过链初始化（holdP undefined→NaN），先空跑一帧 StepGame 再改。
- **横在路上的东西要挡得住腿——`BAND.obstacle = 0.95`（2026-08-07）**：可翻越物挂在 `walk`(0) 上，演员（0.6）永远画在它前面，玩家读到的是"路边的景"，看不出它拦路（用户两次指出"障碍物没放在路上"）。挂到 `clutter`(1.6) 又被近景透视放大——0.82m 的墙撑成齐胸，把人吞掉半截。新加一档 `obstacle: 0.95`：够挡小腿，跟随景别下只放大 3%、特写 10%。`brokenWall`/`fallenWood` 都走它，规范已写进 CLAUDE.md 的带语义。
- **翻越难看的三个根因（2026-08-07 用户"太丑了"→ 全修）**：①**障碍比人还高**（1.24m vs 柱子 1.38m＝齐肩），动画只能作弊飞过去 → 降到 0.82m＝他的胯高；扫荡那处 1.08→0.72（塌下来的柴堆本就矮摊一片）。②**抬升弧峰值 0.74×top**，髋飞到齐胸，手够不着墙头 → 0.58。③**横移用对称 smoothstep**，人在墙上方匀速平移，"撑"完全看不出 → 拆成 `VaultTravel` 三段：迈上去按住(0~0.34) / 绕着撑手转几乎不前进(0.34~0.66) / 荡下去落地。④顶点姿势原来两手举在胸前，真做单手撑越时撑手在髋**后下方** → armF 转到正角。⑤`VAULT_DUR` 0.78→0.62。断言别挂在"抬升 > top×0.6"这种倍率上（一改障碍高度就红）——改判**髋有没有越过顶沿且没高出太多**。
- **可翻越物的合理化（同上）**：路当中码一垛柴说不通。换成**塌进巷子的院墙**（`brokenWall`/`DrawBrokenWall`）：土坯错缝、一头拽塌成斜茬、坯块散在两侧；绕不过去（横在两家院墙之间）、搬不动，只能跨。顶沿磨圆+豁口=翻越轮廓语法。**侧视里 prop 的 `w` 是沿路方向的厚度**，不是墙的长度——2.6m 厚的院墙是碉堡，1.5m 才是碴子摊开的宽度。
- **动词后续复用（设计定了、其余章节还没接）**：翻越→C2 断墙/C3 田埂/C7 据点矮墙；击打→C5 钉门板/C7 凿地沿（第七章开场先给一拍零压力手感回忆）。
- **「实装了」不等于「玩家感觉得到」（2026-08-06 用户反馈换来的）**：翻越当初数据、姿势、cue 全在，SmokeTest 也绿，但只有一个静止 pose + 一条直线位移，人从头到尾贴着地面平移——用户的判断是「从动画到关卡都没有」。重做后的定式：动作分关键帧按进度插值（`s.poseK`）、**人要真的离地**（Core 算 `p.lift`，World 加到 mesh.y 并把影子缩小变淡）、起手与落地是两条 cue（脚落地比动作结束早）、扛大件走另一档更慢的姿势（clamber）。断言也要盯抬升峰值，光断言「触发了」抓不到这种"做了等于没做"。可翻越物：`roadStack` 柴垛 84（去老槐树路上，往返各一次＝教学+复用）/ 倒塌柴垛 38（`flag:"raidStarted"`）；`top` 必须对齐美术画出来的高度，抬升弧按它算；推着车时不触发。
- **动作摆位的两条铁律（2026-08-06 第二轮反馈换来的）**：① **会打断走路的动作必须由玩家主动按**——自动翻越被判「居然是自动翻越」。现在可翻越物**挡路**，走到跟前顶住 + 头顶「E · 翻过去」徽章（`state.vaultHint`，在 Main 里排在 `state.prompt` 之前进 SplitPrompt），按互动键才翻；MovePlayer 触发后 `input.interact = false` 吃掉这一下，免得节拍重复消费。**提示只在朝着它（`p.heading === -side`）时出**——否则刚落地时背对着它仍在范围内，按键玩家会原路弹回去，来回没完。② **可翻越物不许压在跑腿路线上**：院子 31~70 是打水/扛木料/推车的地方，手里有东西时被要求翻墙很别扭。SmokeTest 有断言盯这条（常驻的不许落在该区间；落在该区间的必须带旗标）。挡路之后**自动通关驱动器与 `TestStealthEscapable` 都要加 `if (state.vaultHint) input.interact = true;`**，否则一挡就卡死。
- **架构（2.5D 横版，见 [[tunnellight-25d-feedback]]）**：Script_Core.mjs 纯逻辑（beat 剧本 + SCENES 条带布局，x 横轴 + surface/under 双层，W/S 爬梯换层，烟一维推进 frontX，横向视线束）；Script_World.js 侧视剖面白盒（视差背景层+地道剖面+探杆演出）；Script_Main.js 镜头（横向跟随基线，过场硬切+慢推，iris 转场）。cinematic 行支持 `on(state)` 走位回调；StartMicroCine 玩法中插微过场。
- **调试跳幕**（2026-08-05 加）：入口在**设置面板里**（齿轮 → 分隔线下方，不再常驻画面角落）/ `` ` `` / F2 / `?debug=1`，列出八章的分幕清单，点哪一幕落哪一幕；也可 `?chapter=N&beat=M`。Core 侧是 `ChapterBeatList` + `DebugJump`（前序幕按 `SettleBeat` 结算：过场逐行跑 `on()`、走位一次落位、玩法段补 flag + 把玩家挪到该幕终点，不逐帧重跑）。
- **测试**：`npm run test:tunnelLight1943` = 自动通关全 8 章双分支（一维行走+爬梯驱动器）；`test:tunnelLight1943:browser` = 逐章 GL/画面健康 + `Script_DebugJumpTest.mjs`（八章每一幕都跳一遍验落点）。实拍工具：`Script_DebugShot.mjs <目录> <章> <幕> [秒] [标签]`，env `LINE=` 推过场行、`PX=` 强制玩家位置、`PANEL=1` 带面板；`Script_ArtPreview.mjs <png> lamp` 单看灯的画法。（drawImage 采样必须与 Render 同任务，preserveDrawingBuffer=false。）
- **灯光**（2026-08-05 重做）：提灯不再是"人在发光"——手上挂一盏实物（`ART.DrawHandLamp` 马灯/纸灯笼，火心偏移见 `HAND_LAMP_FLAME`），光晕从火心发出；`Script_Light` 的遮挡着色器加了 `uBlockers`（人体躯干柱，最多 8 个）→ 人挡在灯前会在地面/墙上投出影子；每个演员另有一条随最近光源方向拉长的地面投影（`MakeCastShadow`）。**修掉的老 bug**：玩家煤油灯以前直接改 `mesh.position` 而没走 `userData.SetLight`，`uLightPos` 一直是原点，整片光被距离判定丢掉——地道各章其实一直只有 `ps.adapt` 那圈弱光在照明。
- **坑**：CSS 显式 display 会压过 [hidden]（需 `[hidden]{display:none!important}`）；代理下 `curl -sI` 首行是 CONNECT 200，验部署要用 `-w %{http_code}` 或 grep 内容；本地服务端口 8146/8148 都可能被并行会话占着（本 worktree 用 8149）（Script_DevServer.mjs 自带 MIME 表，launch.json 配置名 tunnelLight1943）。
- **三个反复会踩的架构坑（2026-08-05 修）**：① `Script_World.ClearGroup` 会 dispose 子物体的 geometry/material.map，而演员骨架的几何与贴图是 `rigCache` 里**全场共享**的（`CreateRig`→`CloneMesh` 只克隆材质）——BuildEnvironment 一重建（换章、任何进 builtKey 的 flag 变化）就把所有角色的资源销毁了，且 `UpdateActors` 末尾的回收循环特意跳过 `player`，于是**主角永远重建不回来**。现在骨架/影子/手持物打 `userData.persist=true`，ClearGroup 保留且绝不 dispose；同时 `InvalidateSceneCaches()` 把闭包里其它懒创建网格（marker/probe/lamp/item/fluid/cart/…）的引用清零，否则 `if (!markerMesh)` 判断落空、那些东西再也不出现。② `#hud{pointer-events:none}` 只给 `#hud button` 开了例外——面板里的 `input[type=range]` 一直不可交互；触屏还需 `touch-action:none`（否则拖动被当成滚动手势）。右上角按钮要放进一个统一算 safe-area 的 flex 容器，各自算 `env(safe-area-inset-*)` 会在刘海机上叠在一起。③ 遮挡光着色器的光线步进原来是"固定 18 步等分整段距离"，`adapt` 那盏 17m 半径的暗适应光步长≈0.94m > 洞顶土层厚度，斜射光线整段跳过土层→灯光糊进土里；改成世界尺度定长步进（`max(dist/48, 0.16)`）+ 着色点自身在实心里时 ×0.22。验证方法：开灯/关灯各渲一帧做差，土层内光照增益必须为 0。
- **`?fast=1` 只在静音时生效**：它把过场按 5 倍速推进，开着声音时旁白仍是正常语速，每句都被切在半截——看上去就像"台词没说完就切镜头"那个老 bug 复发。调试完记得把预览页导回不带参数的 URL。
- **剧情审查 agent**（6 维标准）两轮报告已全部落实；唯一挂起：**高家庄/高传宝沿用《地道战》1965 地名体系是否保留**（审查判定为自洽致敬，可接受；对外展示前需用户确认，或改村名如「沙河庄」）。
- **v0.3 关卡谜题化重做（2026-08-05，worktree tunnel-light-level-design-eb3c24，未提交待试玩）**：按勇敢的心关卡语法重写了 Notion 关卡设计文档与全部八章玩法。新引擎动词层（全在 Script_Core）：单格物品栏 `player.item`（big 件降速）、`chain` 链式谜题 beat（pickup/use/throwHit/talk/push/goto 步）、F 键投掷（自动瞄准 3–10.5m + 石子落地 MakeNoise 引敌 investigate）、看门狗 DOG_SPOTS（叫声召唤巡逻，喂窝头闭嘴）、`light` 周期探照灯（StepLightHazard）、`cartRide` 跟车掩体、digSeq 支顶木 `shore`、`smokeFloor` 防手慢软锁、烟吞灯自动熄。C1 井绳链+风筝投掷教学；C2 喂狗+打马灯；C3 推陷车+跟车过探照灯；C4 撑木链+湿棉被堵卡口（限时链）；C5 三条地表取材链×双层潜行（核心章）；C6 铁桶鞭炮；C7 顶木+凿子撬地沿；C8 敲凳腿。SmokeTest 驱动器新增 throwAt/pushAt，并断言 kiteDown/dogFed/lanternOut/trapBuilt/hiddenBuilt/bellBuilt/dogFed2 全链路旗标。
- 本 worktree `.claude/launch.json` 有 `tunnelLight1943` 配置（DevServer 必须显式传端口参数 "8148"，否则落到默认 8146）；worktree 未装 playwright-core，浏览器验证走内置 Browser 面板 + `window.TunnelLight` 钩子。**面板隐藏时 rAF 停走且 canvas 被压成 0×0**——手动调 `world.Resize(640,360)` → `BuildEnvironment/UpdateActors/UpdateProps` → `ApplyCamera` → `Render` → `gl.readPixels`（同一个任务里），就能在没有 playwright、也看不到画面的情况下做像素级断言（`world.debugLayers()` 拿 THREE / SURFACE_Y / UNDER_Y，`world.camera.project` 做世界→屏幕换算）。
- **触屏与镜头（2026-08-05）**：左下是**虚拟摇杆**（`#stick`），横推走、竖推爬梯下地道（竖直分量要 >0.55 且 >水平×1.25 才判爬梯，否则走路时拇指上下漂会被送上竖井），右侧只剩蹲/互动 + 手里有可投物才冒出来的投掷键。**beat 可以带 `cam`**，玩法段也认（`UpdateCamera` 的非过场分支），用常规跟随插值推进去而不是硬切——划线幕靠它把镜头推到 2.9m 特写。划线（`scribe`）改成拖动驱动：`input.dragX` 位移累加（拖过 45% 画宽≈一整道线），HUD 上有 QTE 轨道 `#scribeGuide`；C1 与 C8 两道刻痕现在是同一个 beat kind。
- **`setPointerCapture` 必须 try/catch**：指针已抬起或是合成事件时它抛 `NotFoundError`，不接住会把整个 handler 断在那儿（摇杆/拖动直接变死的）。
- **`RunFrame` 与 `TunnelLight.Tick(n)`**：一帧的全部（StepGame→World→镜头→HUD）抽成了 `RunFrame`，rAF 与测试钩子共用。**只调 StepGame 验证镜头或 HUD 等于什么都没验**——它们只在 RunFrame 里更新，而浏览器面板隐藏时 rAF 整个停摆。另有 `ReadInput()` 钩子走真实输入路径（键盘+摇杆），用来断言控件确实驱动得动玩法。
- **并行分支状态（2026-08-05）**：`claude/tunnel-light-level-design-eb3c24` = 关卡重做(3ad6f7a) + 合并 origin/master(607a2f8) + 摇杆/划线/调试入口(607110b)，**已全部推到 master 并上线**。冲突只有两处、都是同一段代码两条线各改各的：着色器里 master 的 `BlockedAt` 半影 × 我的世界尺度步进（互补——master 修的 `SetLight` 漏调让灯终于真亮了，我的步进保证它不漏进土里，合并后实测洞腔 +63 / 洞顶沿 +39 / 土层全 0）；`UpdateActors` 里 master 的 PushBlocker/track/PlayerTag × 我的单格物品栏携带判定。
- **两条设计铁律（2026-08-05 用户立的，写进了 Notion 文档）**：① 每个玩法元素过「1942-43 华北敌后穷苦农村会有这个吗」的历史检查——风筝已因此换成被风刮上树的花布头巾、「粉笔」改称石笔；新玩法入库前先查。② 每个玩法动词必须配角色动画，不许「人站着不动、字幕替他做」——已有 bow（弯腰拾）/throwArm（挥臂投）/crank（摇辘轳）/mark（抬臂划线）/digging（施工），Core 用 `FlashPose(state,name,dur)` 打带时限姿势（过场脚本设的 pose 无 poseT 不受影响）。
- **本轮新交互（2596c12）**：`winch` 链步=辘轳打水（S 放绳→触水灌满→W 摇起，松手辘轳倒转有 0.3s 棘齿宽限；`state.winchLock` 让井口竖推不当爬梯——c5 井台正压在 entW 竖井上，锁在 MovePlayer 之后清/beat 里立，用上一帧值）；scribe 改真实笔迹（canvas 逐段盖颗粒粉痕，head 可回退 drawn 只进不退，DrawDoorframe 永久刻痕高度已对齐 1.28/1.08m）；柱子家 interior:true → 立面+室内两层，玩家进 [x0,x1] 立面淡出（homeFacade/homeRange，z=0.4 在家具上演员下）。
- **章名规则（a86c7b2）**：取各章自己最硬的意象、不用抽象词——门框上的刻痕/灯停住了/半袋烟的工夫/最后一盏灯/东口的铃/没套的骡车/地道里的光/第二道刻痕（首尾成对）。改章名要同步 SmokeTest `TestChapterMeta` 的期望列表 + Notion 各章标题。视线光带是**贴地光池**（rotation.x=-π/2 躺平），不是竖光墙——竖的会把整条夜街的地面观感改掉（用户反馈「地面都变了」）；过场里也画（c2 教学幕靠它演示）。教学幕的坑：c2_open 把 sweep1 留在 x≈124，教学镜头框在 59——**过场里说到谁，必须先把谁挪进画框沿外一步再走进来**，否则演了个寂寞；教学节奏放慢（灯 1.6m/s 一寸寸压到草垛沿停一拍再走）。
- **过场图文审查流水线（d226866）**：scratchpad `cine-audit.mjs` = 按「字幕点到的人必须在画框里、动作方向/道具/姿势必须成立」逐行断言（每行起点+收尾两采样，画框从 cam hint 复刻 HintShot 半宽），自然时序播放不按跳过；首轮抓 21 处。**视觉复核**走 DevServer 新增的 `POST /__shot?name=`（写 `TunnelLight1943/_shots/*.jpg`，已 gitignore）——页面 readPixels→翻转→toDataURL→POST，我再 Read 看图，不用把 base64 倒进对话。教出来的定式：①硬切进新构图时**允许把演员预摆到画框沿外一步再走进来**（黑场 dip 里甚至可以整组重排）；②「架着走」要真的贴身钳住（同速同向 ±0.72m）；③`cineKeepHeading` 防 cineTarget 行走方向扳头（回头望的戏必用）；④负缩放翻贴图会翻绕序——单面材质整个被剔除（朝西的视线光带隐形半年都没人知道），凡用负 scale 的面必须 DoubleSide；⑤贴地平铺的面在平视机位下是几像素细缝，要读得出得用矮竖片（0.6m 贴地光带）。
- **潜行段的形态：掩体推进，不是等待（65a3d02）**。用户原话「等灯走远？什么狗屁玩法，按照勇敢的心来设计，加一些遮挡物不就好了，可以是移动的静态的」。`coverRun` beat：一串疏密不匀的掩体连成路，**高掩体（草垛/齐胸断墙 `tall:true`）站着就藏得住、矮的（柴堆/水瓮）才要蹲**——找掩体本身是玩法，不该再多按一个键；带路的 NPC 是**节奏演示者**（`PathLit()` 判下一段有没有被视线扫着，空了才冲，冲到贴着掩体等玩家跟上），玩家学的是"什么时候能动"；长空地配**移动掩体**（`movingCover` 板车来回推，`state.cart` + `state.cartCoverR` 进 hidden 判定，推车人在车**后**顶着 `-2.0*dir`）；每到一处掩体刷 `beat.snapshot`。判定与画面同源：娘的判断、玩家看到的光带、探测用的视距是同一个数。① 规则先安全地演一遍再开打（c2_teach：娘按你蹲下、第一盏灯扫过去没事）；② 危险可见——每个巡逻兵面前画视线光带，长度用 `VISION_RANGE * VisionScale(state)`，**渲染和判定必须取同一个数**（夜里 0.72 折）；③ 宽容——探测涨 0.45/s 消 0.8/s（涨满两秒多、消比涨快），leadFollow 每过路点刷新 `beat.snapshot`（失败退最近路口不退段首）。玩家的原话值得记住：「走了大老远然后一秒就死」——没有铺垫的潜行不是难，是莫名其妙。`GetBeatTarget`（自动通关驱动器）、`SettleDest` + `SettleBeat`（调试跳幕的落点与结算）。漏了后者不会让 SmokeTest 变红，但跳进那一章旗标全是假的。另外 `DebugJump` 现在会**跨章结算**（先把前面各章整章 settle 一遍）——第六章门板要对上的两条情报一条来自第三章问乡亲、一条来自第六章观察，只结算本章的话永远凑不齐，「自己推出来」那一支在调试里根本走不到。跳幕落点体检可以纯 node 跑（不需要 playwright）：遍历 `ChapterBeatList` 逐幕 `DebugJump`，断言落点在 `SCENES[].walk[level]` 范围内且落地后空转不抛错。
- **沉浸交互轮已并入 master（2026-08-06，提交 65c236f + 合并 f092326 上线）**。原 loveart-config-83bbb4 worktree 里那份未提交代码已由本会话经 `git apply --3way` 移植到新基线并推 master——**那个 worktree 的未提交状态已过时，别再移植一遍**。移植时的两类冲突定式：对方「外置/重写」vs 我方「基线上新增」→ 场景改动回填 JSON（roadStack/veggieWest/vaults）、新 kind 补 Data_PropArt 登记（woodStack）；提示文案冲突一律按「键名不进文案」裁（TestPromptsAreDeviceNeutral 会抓）。**SmokeTest 的 DT=1/30**：写逐帧交互测试时帧数要按它算（石笔测试曾按 1/60 校准，10 帧就把线划满、节拍提前推进）。
- **辘轳=转盘、打结/辘轳=井口特写（2026-08-06 本轮新做，用户定的方向）**：①辘轳不是竖拖——**鼠标绕轴心转圈**（顺时针放绳/逆时针摇起，`WINCH_HUB_Y=1.43`，空放 1.6 圈/满摇 2.6 圈），摇把角度 `crankA` 从绳的行程反推（键盘/鼠标/脱手倒转三条路画面同源），World 画摇把（歇息角 -0.6 免得与横杆混色）+ 未上手时呼吸引导圈；②**玩法步骤级特写 `state.closeUp`**——辘轳挂桶/打结起手时置 {x,y,hw}，Main 的 UpdateCamera 非过场分支里优先于 def.cam，走跟随插值推拉（不硬切），步骤结束/离开 zone 自动拉回；每帧在 StepGame 顶部清空、DebugJump 也清；③**交互时把人钉到井口西侧**（挂桶瞬间 x=zone.x-0.9，每帧夹 ≤zone.x-0.72）——站在井正中桶会挂在脑袋上；自动通关驱动器的 winchAt/holdAt 判定余量 1.35 够用；④回归 TestWinchIsACrankNotALever。手势 HUD 新 kind：crankDown/crankUp（CSS 转圈方向即手的方向）。
- **master 并行把敲楔换成了刨料（09675a2）**：tenon 动词已死，c1_tenon 现在是 `plane` beat（dragX 位移驱动 + #scribeGuide QTE 轨道）。我方手势管线统一走 `gest`：**gest.dx（横向拖，45% 画宽=一趟）喂 input.dragX** 给刨料，gest.dy 喂 pull，gest.world 喂 pointerWorld（石笔/转盘/打结）——别再开第二条指针通道；#scribeGuide 只剩刨料在用（石笔改攥笔后一度被删，恢复时连 CSS 基础样式一起）。①深度规范抽成 `Data_DepthSpec.mjs`（BAND 八档含新 `loose:0.3`=落地/待拾道具带、KIND_Z、CheckBandZ 运行时告警、`world.DepthViolations()` 必须为空）+ **`TunnelLight1943/CLAUDE.md` 项目规范**（agent 新建道具清单）；水桶被遮的根因=掩体带专职挡人而落点进了掩体足迹→Core `DropSpot()` 自动推出 covers/vaults；SetPlayOrder 现在同时写 fixedOrder（重建后 ApplyDepthOrder 不再按 position.z 重猜）。②世界内提示全部 `HINT_SS=4` 超采样（气泡/目标标/人字标/楔子；critter 2x；逐帧重画的用 setTransform）——默认镜头屏幕密度就是 PPM 的近 3 倍，1x 必糊。③**自由放下**：`state.groundItems`+StepGroundItems（E 放下/拾回/交换，pickedT 0.35s 防"拾起顺手又扔"；提示挂物品栏角标不占中央 prompt；落地道具头顶挂 `item:标签` 小样气泡=VH 式悬浮提示；链 pickup 占手时改为"E·先放下"）。④沉浸手势输入词汇：`input.pull/pullHeld`（竖拖）、`pointerWorld`（ScreenToWorld 世界坐标）、`tap`；HUD `#gestureHint` data-kind=dragDown/pullUp/circle/tap 纯 CSS 动效。辘轳=下拖放绳(封顶 dt*3)/上拽提桶+触水 Cue waterSplash；接绳=新链步 `knot`（绕圈 KNOT_TURNS=1.25 缠满→下拽勒紧，World 画引导圈+缠绳+绳头；键盘按住 E 全程后备，驱动器 holdAt）；敲楔=tap/下甩 flick（0.3s 冷却）。⑤本 worktree 无 playwright：浏览器验证=Browser 面板 + Resize+Tick+readPixels→`POST /__shot`，78 幕跳幕清零报错。SmokeTest 新增 TestGroundItems（断言落点避开 hayB 足迹）/TestKnotKeyboardFallback。
- **场景数据已外置为 JSON（2026-08-06，同一 worktree）**——用户要求「道具/楼房/地面的坐标、z、引用的贴图存进 json 以便后续检查替换」。四件套：`Data_Scenes.json`（每个物体**在哪**：x/level/w/h/旗标门 + zones/covers/vaults/tight/walk，1:1 搬自原 SCENES 字面量，设计理由保留成 note/_xxxNote 字段）、`Data_PropArt.json`（每类物体**长什么样、埋多深**：art 画笔名/band 深度带/sprite 烘焙画布{w,h,anchor,baseline}/shadow/yOffset/placeAt/drawnBy）、`Data_DepthSpec.mjs`（只剩带的**数值**，KIND_Z 已删——那是美术属性，归 PropArt 的 band）、`Data_Scenes.mjs`（同构加载器：Node 走 fs / 浏览器走 fetch + 顶层 await，**加载时校验**未登记 kind/非法 band/走不到的物体，并深冻结）。Script_Core 只 `export { SCENES }`；Script_World 的 AddProp/AddCover 变成 `SpriteOf(kind,obj)` 驱动，switch 里只剩条件绘制（断井绳/露绳头/烧过的屋子）。**这套白盒没有图片文件**，"引用的贴图"= art 字段里的 Script_Art 画笔函数名，换皮=换这个名字。sprite 尺寸写法：数字=固定，`{pad,per,default}` = pad + 物体 per 轴(米)×48。
- **`Script_SceneAudit.mjs` = 场景清单+体检**（`npm run scene:tunnelLight1943` 看表；`--quiet` 已接进 test:tunnelLight1943 当门禁；`--json` 给工具用）。列出全部 69 个物体的坐标/深度带/画笔/贴图尺寸，并交叉校验四类：①**剧本里的 drop 步骤压没压掩体**（从 SCRIPTS 精确取，不是所有 zone——潜行观察点本就以掩体命名，那些降级成"备注"）②挡人区间的物件是不是真的矮 ③翻越物撞没撞掩体 ④行走线穿插。它独立地把水桶事故重新抓了出来（c1_water 放桶点压 hayB 2.6m）→ 已修：只把 zones.woodpile 从 x70/w6 挪成 **x71.4/w3.4**（整段落在 hayB 终点 69.6 之东），**不碰掩体坐标**——covers 间距被文档标注为「关卡节奏本身」，属用户设计决定。
- **顺带查出、已修/已记的两处**：①`vat`（地道水瓮）原来在代码里写死 `z=0.2` 绕开了深度带（CheckBandZ 查不到 PlaceSprite），externalize 时归入 `loose`；②**高掩体的"两档交替"名存实亡**——`ART.Hash("cz"+id)` 对 czhayA..czhayE 这批相似短串全落 0.79 附近，9 个高掩体**全部**进 building 带，coverBands.tallPick 想要的层次感一直没出现。这是既有行为、改动会动视觉，**没擅自改**，由 SceneAudit 报成备注等用户定夺。
- **「上手的动作绝不能是进度条」（2026-08-06 用户第三次退回换来的：「我要的是玩家真的在控制一只粉笔 而不是画一条slider 根本不一样」）**。石笔那一拍原来是 `#scribeGuide` QTE 轨道 + `input.dragX` 位移累加，拖满就算成——已整条删除（HTML/CSS/SyncHud/dragX 全清）。重做的四条定式（**新玩法照抄，写进 CLAUDE.md**）：①**得先抓住它**——按下那一帧手必须落在物件上（`pointerWorld` 与物件的世界距离 < `CHALK_GRAB_R` 0.16m），画面别处拖一律无效，这是"控制一支笔"与"拖 slider"最根本的差别；②**物件有物理**——跟手走但有速度上限（复用 `def.speed`，每秒划过全线的百分比），手甩再快也只能一寸寸蹭；③**会失手**——手飘离刻线 >`CHALK_SLIP_Y` 0.16m 就脱手、印子当场断；④**反馈长在物件上不在 HUD**——笔压下去/随手劲倾斜/扬粉尘/沙沙声（`scribe` 新合成音效，Core 按"蹭过多少距离"发粒不是定时循环），印子还按手速定深浅（慢=实、快=虚）。键盘后备保留（`interactHeld`+`moveX`），并**新加"攥笔时脚不动"**（MovePlayer 的 `holdingChalk`）——否则按住 E 推方向人会走出这个 1.9m 的特写。断言 `TestChalkIsAPencilNotASlider`。
- **同一轮连带修掉的三个"假"（都是笔一变成主角才暴露的）**：①**石笔是 40cm 的大白棍**——当装饰没人看，玩家真去攥它尺寸不对整件事就假了；现在 9cm（`CHALK_SCALE=0.22`，贴图 `CHALK_SS=8`、刻痕画布 `SCRIBE_SS=3`，因为这一拍是 1.9m 特写≈330px/米，是 48px/米 标尺的七倍）。②**线划在门洞的空气里**——门框永久刻痕其实刻在左立柱上（世界 33.60→33.75 那 15cm），玩法却让玩家横跨 1.04m 门洞划；现在 `markX0/markX1` 对齐立柱、镜头收到 `dist 1.9` 并居中到柱子、门框走新的 `SS.closeup=8` 档。③**玩家要做的事画面上已经做完了**——`DrawDoorframe` 无条件画着 mark1，于是那一拍是握着笔去划一条已经在木头上的线；现在两道刻痕分别由 `flags.marked`/`flags.carved` 把门（`carveRebuild(marks)` 就地重绘，不整章重建），粗细也对齐玩家划出来的那道。④**近景收掉找路 UI**：人字标与目标箭头在 `viewW < 5m` 时自动隐藏——人字标曾正好压在石笔上。
- **2026-08-10 征夫告示批次（07e1813，已上线）**：①告示阅读层——noticeWall(23.3) 一臂内「E·查看告示」→ `state.noticeOpen` 冻结全世界（StepGame 顶部 return），DOM 覆盖层左图右文（图 `Texture/Texture_NoticeZhengfu.jpg` 是**用户 codex 会话出的 V2**，正文逐字可读；右栏铅字从 Core `ZHENGFU_NOTICE` 注入）；AutoPlay 有误开自愈。②出土处理按史实校正：猪圈薄层→院路洼处→第三筐装独轮车由 carrier 趁夜推出画（chain 的 `def.tick` 同步挪 `state.cart`）→扫帚清痕（use+hold 笔画）。③刺刀两拍：Rig 新轨道 `bayonetThrust`，襁褓离地=挑起停高位+carry 换襁褓（保留）。④**开场内容提示 + 弱化镜头选项做了又被撤（ce8c270）**——Notion 待实装清单里那条「增加历史战争暴力内容提示和弱化镜头选项」用户判为多余，原话「我这傻逼游戏有个几把暴力风险」。**别再照那条单子加回来**；c1_roster 保持静态 `lines`。教训：Notion 清单是设计意图不是验收标准，涉及给玩家加**门槛/免责/警示**类 UI 的条目，先问一句再做。**坑**：交互 prompt 动词 ≤7 字有测试契约；chain use zone 半宽必须 >1.2m（驱动器停步半径），1.1m 会站在圈外死锁；Lovart agent 推理积分耗尽时生图走 codex CLI（`--skip-git-repo-check`，工位目录不在 git 里会直接拒跑）。
- 后续打磨候选：c3/c6 潜行的挫败感调优（重置点密度）、士兵听觉/脚步声、移动端触控投掷按钮、音效层给新动词补音。相关 [[kangri-fenghuo-design]] [[kangri-tbs-whitebox]]。

**第一章现行版＝2026-08-12 按 Notion 用户改稿重排（commit 5bcf595，已推 master）**。
Notion 剧本页已改成**六章版**（子页全换新 id：c1《善意的谎言》3b360335-331c-81ac-8acd-ea0575dff05a），
旧的 21 拍版（16a1c85）与 9 子页结构全过时。c1 现在 12 拍：prologue→open（黑屏
肚子叫 bellyGrowl 起）→forage→meal（碗对调+「吃你的」）→tally→ask→answered→
**c1_elm**（打榆钱拆出来的独立拍：搁桶→砸一把→铺褂子 spreadCoat→再砸→兜包袱）→
c1_well（只剩井台四道手+倒水入缸收尾「她今天第一次笑」）→dusk→cellar→knows
（「底下冷」+递破袄子+门缝，"去找爹了"那几句删了——不点破）。全章暗线：瓦罐扎口
的**蓝底白花碎布＝窖角娘的短褂**（WRAP_CARD 与 FOLD_CARD 同一种白花；褂子是大襟+
右袖撕口+领口一根白头发）。c1_tally 从 scribe 改 chain（**抱起妹妹她自己画**，
sister.lift=0.52+pose mark、玩家 shelter；站位钉在左立柱 33.62 前——33.85 会把她
按进黑门洞隐形）；scribe 机制仍活在 c8_carve，机制单测也钉在那儿。
- **StepMicroCine 行内 on() 2026-08-12 才修活**：之前它从来不调 line.on()——全库
  micro-cine 行上写的走位/姿势全是死的（字幕说了画面没动）。现在行首触发一次
  （mc.fired，同 StepCinematic 的 lineFired）；**跳幕结算仍只跑 effect 不跑 on()**，
  旗标必须落在 effect、on() 只做画面。连带定式：chain 的 effect 不许假设手里有东西
  （SettleBeat 空手跑 effect——搁桶那两步都是 `player.item || 凭空一只真桶`，否则
  结算撂一件 undefined 在地上）；**micro-cine 起在链最后一步的 effect 里时，后面
  必须再垫一步 goto**，不然 AdvanceBeat 同帧就把下一拍（抉择面板）压在过场上。
- 新携带物：豁口碗（窖里刨坑用，needs 链）/破袄子（章末，配 FlashPose("leanIn")
  抱在胸口——默认携带姿势读成"举着黑板子"；DrawCarry 的前抱件要整卷挂在挂点
  **下方**（+y），对称压在挂点上会盖掉半张脸）。新 prop spreadCoat：showFlag/
  hideFlag 出没 + propRedraw 按 flags.elmDown 铺绿（同 woodpile ropeTaken 模式）。
  HUD_ITEM 表要同步登记新携带物，否则边缘牌面掉进 0.42 的兜底缩放。
- 地下镜头 y 一律 `UNDER_Y + 偏移`（绝对坐标）——写 0.9 会指着地表（再犯一次）。
- Notion 回写：**没做**。用户新稿的页面结构（章节定位/关键任务/正式剧本分节）与
  extract-script 的输出格式不同，回写会毁掉他的排版；台词与 Notion 一致性以这次
  实装为准，除非用户要求别动那页。

**实拍脚本的四个坑（2026-08-09 拉绳定向那轮，每个都卡了一次）**：写 scratchpad
里的 playwright 取景脚本时，① `ServeRoot(rootDir)` 的 rootDir **必须
`path.resolve`**——传 `C:/a/b` 这种正斜杠字符串，里面 `path.join` 出来是反斜杠，
`filePath.startsWith(rootDir)` 判false，整站 403；② URL 要写全 `/TunnelLight1943/
index.html`；③ 页面加载完 `window.TunnelLight` 有了但 **`tl.state` 还是 null**，
得先 `tl.StartGame(0)` 再 waitForFunction；④ **要拍活姿势就得真按键**
（`page.keyboard.down("d")`，键位 a/d/w/s 或方向键）——`StepFrames` 之后那几百毫秒
里页面自己的 rAF 仍在跑无输入帧，`FlashPose` 的 0.2s 姿势早过期了，截出来全是站姿。

**刨灰堆重做＝「发现必须长在手上」的样板（2026-08-15，c1e26f9）**：用户原话
「手插进灰堆的玩法太愚蠢了 既没有代入感 也不好玩 也没有解密感」。老版五把同
手势+第三把弹 toast 说碰到坛肩——**发现时刻被字幕抢走**就是三宗罪总病根。重做
成三层手感（浮灰滑 looseV／硬土 packedV 手落后于鼠标／第三把拽到半道**手钉住**
＋stoneLand 闷响，一个字不上屏），出路是**换方向顺着坛肩横抹**（抹哪儿露哪儿，
DrawAshMound 按 clear 分段露肩+指痕）。四条可复用教训：① 判「这一把是什么」
**看手往哪儿走，不看按在哪儿**——堆顶与坛肩几何上叠着，按点分模式必然误判；
两个动作方向只差 30° 时容差要收进夹角以内（wipeSkew 0.42＜扒的竖横比 0.58）。
② **链的未来拾取物会预先摆在世界里**（Script_World chainPickups，为了木料/母鸡
的合理性）——埋着/藏着的拾取物必须在 pickup 步骤声明 `worldDrawn: true`，否则
从进拍第一帧就摆在明面上自己剧透（这次是实拍截图抓出来的，SmokeTest 已钉死）。
③ 驱动器把手一步挪到 to 停住：**目标切换发生在攥着的半道时，to 必须顶到判定圈
沿外**，不然位移凑不满一把的长度、手停在半道死等；钉住态另配 pinHold 滑脱兜底。
④ 排查「画面上这是谁」：染红 `material.color.setRGB(3,0,0)` 比 `visible=false`
可靠——visible 每帧被管理代码写回。另：master 已大重构（SCRIPTS 按章拆
Data_ScriptC1..C8.mjs、剧情梗概在 Data_StoryC1.md、CLAUDE.md 只留硬规矩、World
抽出 Script_WorldPaint.mjs）——beat 改剧本去 Data_ScriptCN，机制仍在 Script_Core。
ChapterOneImagegen 是冻结快照（七稿），这次没同步。

**刨灰堆重做＝「发现必须长在手上」的样板（2026-08-15，c1e26f9）**：用户原话
「手插进灰堆的玩法太愚蠢了 既没有代入感 也不好玩 也没有解密感」。老版五把同
手势+第三把弹 toast 说碰到坛肩——**发现时刻被字幕抢走**就是三宗罪总病根。重做
成三层手感（浮灰滑 looseV／硬土 packedV 手落后于鼠标／第三把拽到半道**手钉住**
＋stoneLand 闷响，一个字不上屏），出路是**换方向顺着坛肩横抹**（抹哪儿露哪儿，
DrawAshMound 按 clear 分段露肩+指痕）。四条可复用教训：① 判「这一把是什么」
**看手往哪儿走，不看按在哪儿**——堆顶与坛肩几何上叠着，按点分模式必然误判；
两个动作方向只差 30° 时容差要收进夹角以内（wipeSkew 0.42＜扒的竖横比 0.58）。
② **链的未来拾取物会预先摆在世界里**（Script_World chainPickups，为了木料/母鸡
的合理性）——埋着/藏着的拾取物必须在 pickup 步骤声明 ，否则
从进拍第一帧就摆在明面上自己剧透（这次是实拍截图抓出来的，SmokeTest 已钉死）。
③ 驱动器把手一步挪到 to 停住：**目标切换发生在攥着的半道时，to 必须顶到判定圈
沿外**，不然位移凑不满一把的长度、手停在半道死等；钉住态另配 pinHold 滑脱兜底。
④ 排查「画面上这是谁」：染红  比 
可靠——visible 每帧被管理代码写回。另：master 已大重构（SCRIPTS 按章拆
Data_ScriptC1..C8.mjs、剧情梗概在 Data_StoryC1.md、CLAUDE.md 只留硬规矩、World
抽出 Script_WorldPaint.mjs）——beat 改剧本去 Data_ScriptCN，机制仍在 Script_Core。
ChapterOneImagegen 是冻结快照（七稿），这次没同步。
```

## tunnellight-four-verb-rework（改写前的旧版）

```markdown
---
name: tunnellight-four-verb-rework
description: 地道里的光 2026-08-16 重排——四个动词全部长在 E 上（已实装）＋序/章号合并（只改了 Notion）
metadata: 
  node_type: memory
  type: project
  originSessionId: 0b703ccc-9143-43c8-8ec9-af3648dd53d0
  modified: 2026-08-17T14:44:48.088Z
---

2026-08-16 用户定的两件事，一件已进代码，一件只在 Notion：

**① 四个动词（已实装，master `6273626`）**
用户原话：照《勇敢的心：世界大战》，**改掉所有的玩法，全部简化为前后有一定联系的基础的交互**。
`E`（瞬时）｜`长按 E`（保持状态）｜`E＋←/→`（横着做功）｜`E＋↑/↓`（竖着做功）。细则整节写进了 `TunnelLight1943/CLAUDE.md`（「四个动词，全部长在 E 上」），要点：
- **光按住 E 不再算做功**；按住 E 那一帧方向键归做功、不走路也不爬梯（`WORK_ACTIONS`）。
- 拟物玩法（掀苫子/扒烧土/拖门板/掰/撕/缝/抠泥封）共用一根 `VirtualHand` 虚拟指尖，手感一个字没改。
- 键位只进提示前缀，HUD 画两枚键帽；数据里 prompt 只写动词。
- CLI 新 token：`Ew/Es/Ea/Ed` ＝ 按住 E ＋ 上/下/左/右（`state <id> --input "Ew*200"`）。
- 下线：修井绳/接绳活卡、辘轳的墩桶与拽到井沿（`winch` 的 `simple: true`）。机制留在 Core 没人用，别顺手删。

**② 合并与顺移（只改了 Notion，代码没动）**
《序 · 那天》＋原《第一章 · 善意的谎言》→ 合并为序章第九稿（Notion 上；**代码里本来就是同一章 `SCRIPTS.c1`，28 拍没并**）；原《第二章 · 梳篦》→ 第一章（1943 谷雨），第三章及以后仍挂旧章号旧线。时间口径：序章＝1942年5月五一大扫荡（村里真没有八路军，所以「没人来叫」＝没有人了）；伤员＝区小队司号员，1943 第三章带蓝布条回来。

**③ 2026-08-17 又定的两条文档口径（也只在 Notion）**
- **剧本主文档只留戏，按键提示一行都不写**：用户原话「什么『按 e＋上下键』这种说明就别给我写在 notion 的主文档里了，就全部放进关卡设计」（序章与第一章都办了）。剧本页只留〔镜〕〔演〕〔音〕＋台词＋**目标**引用框与抉择选项。**搬走时要顺手把动作补成〔演〕**——原来「抱她够石笔／掰红薯干／缝三针／顶椽子」这些动作只写在按键行里，直接删就没人做了（我删完补了十几行）。
- **「太君前来」全作只演一次，演在开篇**（序 · 那天新增「〇 · 进村」）。队列口径：**一个伪军骑自行车开道 → 一辆挎斗摩托、太君坐在斗里 → 成建制日军两三人并排**。第一章《梳篦》原来那整段（队伍进村／摘手套／伪保长／两个字日语／封村）**已删**——理由是第一章太拖沓、同一支队伍看第二遍没分量；只留乌鸦、机器声、卷边的告示，外加两句**画外喊话**（伪保长照册子点户／翻译官喊连坐）交代「这一回为什么来」。**两处已定（2026-08-17）**：① 十个徒步伪军**并到日军后头**（新队序＝自行车／摩托坐太君／日军两三人并排／伪军稀拉在队尾；实装要改 `BuildRaidOrder` 的 `PUPPET_FILE` 位置＋`TestConvoyKeepsFormation` 的 order 数组，**2026-08-08「打头的是十个伪军」那条作废**）；② 斗里那位**就是三浦**（序里不给名字不给正脸，一年后靠告示落款对上）。
- **第一章有了自己的《过场分镜》子页**（`3bf60335331c8166b377e17cc8e7a978`，C1-00…C1-51）。写法照序章那份，但页首多一张**「氛围 → 镜头语法」对照表**（用户要求：分镜必须符合当下情景氛围）——轻松和谐＝跟人横移／长镜；压迫＝只推不拉、越切越短；屏息＝定机位不动、唯一在动的是落灰；潜行＝灯扫过来画面钉死；幽闭＝与爬行同速的长横移；决意＝极慢推向墙缝。**改分镜先对这张表。**

**三处「文档说了但没照做」**（理由与开关写在 Notion 关卡设计页末尾的黄条里）：找吃的仍是三处任翻（8-15 用户刚退回过直链）、下窖不拆「放下妹妹」（会请回瞬移 bug）、23→15 拍没并。

**④ 2026-08-17 第二轮（master `26216ac`…`fe466fd`，缓存戳 v=137）**——用户退回①那版：「整个游戏还有分红薯，打开糊在罐头上的泥巴等非按 E 的复杂交互存在 帮我改掉 改得更贴切一些（过场动画也需要配上 如果需要的话）」。病根：VirtualHand 只是替玩家拖老的指针判定，卡上没键帽（`prompt=null`）、分食第三段连键盘都走不通、两步共用一份账。改法＝各拍 `HeldDir(input, dir)` 直读方向键、每拍 `StrokePrompt` 亮键帽、分量留在时间里；「分进两只碗／放回她碗里」＝**一按 E ＋ 卡上动画**（那就是"配的过场"）。表见 `TunnelLight1943/CLAUDE.md`「四个动词」节。**用户同日追加「缝针的这个交互保留」**——`sew` 一字未动（VirtualHand 只剩它在用，别删）。两条新规矩：活卡铺着时脚不走（MovePlayer `LiveCardOn` 锁）；驱动器目标 `x` 报站位不报物件中心。划线我改成了 E＋→（Notion 表写的 ↓，横线横着划才贴切，已在 Notion 绿条注明）。

Notion 页：序 · 那天 `3bb60335331c81b98cf0e9972bd995fa` ＋子页关卡设计 `3b360335331c81b1afe7d4528c8af265`；第一章 · 梳篦 `3b360335331c81e4a352d7b38b0f54a6` ＋子页 `3b360335331c8153adedef8b4cb122b9`。

相关：[[tunnellight1943-workflow]]、[[tunnellight-structure-refactor]]、[[tunnellight-plain-geography]]（梳篦旧稿的梯田/炭窑已整段作废）。
```

