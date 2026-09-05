# 编辑器套件

## 窗口样式

设置与编辑器使用 `Style_Interface.css` 的 World at War 主题，`Style_Editor.css` 定义工具布局。
黑色标题栏、冷灰底色、旧金选中条与菜单一致；读数保留等宽字体，阵营和错误状态保留语义色。
通用按钮、开关、选项及关闭按钮使用原生 button，支持 Tab / Enter / Space；开关和选项同步
`aria-pressed`。窄屏将目录放在上方、当前工作窗放在下方，各自滚动。
Profiler 仍在独立窗口运行，复制当前入口带版本的主题链接。

外观与操作验收见 [主菜单文档](Data_MainMenu.md) 的 `--interface-only`；相机、设置持久化与
编辑工具功能继续由 `Script_EditorTest.mjs` 验证。

开发用的十五个互斥编辑器、两个可叠加渲染工具 + 一个入口面板。**不对玩家开放**：出图模式（`?shot=1`）下整棵
DOM 是 `display:none`，任何截图里都不会有它。

## 怎么进

| 路子 | 什么时候能用 |
| --- | --- |
| 点右上角齿轮 | **没拿指针锁**的时候（开局那张「进城」页、或玩家按过 Esc） |
| 按 `` ` ``（Backquote） | 任何时候。打游戏当中这是唯一的入口 |
| `window.Tengxian.Debug.OpenEditor("actor")` | 测试与自动化 |

指针锁一挂上，浏览器就把所有鼠标事件路由给 canvas，DOM 上的按钮谁也点不着 ——
这不是 bug 是指针锁的定义。所以 `` ` `` 那条路在开面板时会顺手交还指针锁。

Esc 关面板；过场正在播时 Esc 归过场（跳过），不会顺手把编辑器也关了。

## 一次只开一个

八个里有六个要接管相机（摄影棚 / 自由飞行）、一个要把相机交给过场导演。
同时开两个的结果是两边每帧各写一次 `camera.position`，画面会抖。
所以入口面板虽然是一排开关，语义是**换到这一个**：开新的自动关旧的。

## 面板分两组：设置 / 编辑器

**它们不是一回事。** 设置改的是玩家自己的偏好、要落盘、与这一局无关；
编辑器改的是这一局的运行时状态、退出时必须还干净。摆在同一排会让人以为
「画质」也是个要小心退出的东西。

### 画质 `Script_EditorSettings.GraphicsSettings`

存 `localStorage` 键 `tengxian1938_graphics_v1`，**开机时装回去**
（`ApplySavedSettings`，`EditorSuite` 的构造函数调）——只在打开面板时才生效的
设置不叫设置，那叫开关。

- **渲染分辨率**是唯一真正省时间的一根：整条合成链（法线深度、AO、泛光六级、
  体积光、运动模糊）都按 post 靶的尺寸走，减半就是省掉四分之三。它改的是
  `post.SetSize()`，不是 `renderer.setPixelRatio` —— 最后一 pass 照样铺满屏幕。
- **后处理强度一律是倍率**，乘在天光预设算出来的值上。预设决定这一关长什么样
  （曝光、雾色、泛光阈值是美术意图），设置只决定画多重。两件事混在一张表里的
  下场是玩家把画质调低之后夜战关变成纯黑 —— 那一关的 `exposure` 是 3.6，被当成
  画质项一起压了。
- **开关阴影要连着重编译一次全场材质**（`material.needsUpdate = true`）：
  `renderer.shadowMap.enabled` 是编译期的 `#define USE_SHADOWMAP`，只改标志位的话
  着色器还在采一张不再更新的图，画面会留着一层永不变化的假阴影。几百毫秒的卡顿，
  但这是设置动作不是每帧的事。
- **第一人称自阴影**单独走 `Script_FirstPersonSelfShadow` 的小型 packed-depth 靶与
  3×3 PCF，只压手臂/武器自己的直射光。Viewmodel 仍保持 `castShadow=false`，因此
  压缩后的枪模不会把巨大的假影投到战场墙面；此项服从「阴影」总闸并随画质设置落盘。
- **档位（low/medium/high/ultra）热切不了**：MSAA 采样数、AO 靶比例、泛光级数是
  `PostPipeline` 建靶时定死的。所以那一栏老实带 `?quality=` 刷新，不假装能实时换。

### 音效 `Script_EditorSettings.AudioSettings`

存 `tengxian1938_audio_v1`。三条分路音量写的是 `sfxUser` / `musicUser` /
`ambienceUser` 三个专门的增益节点，**不是 `xxxBus.gain`** —— 那几个是系统自己的
配平：`Music()` 换 cue 时会重写 `musicBus`，duck 会把 `duckGain` 压下去再放回来，
滑杆写在同一个参数上，下一次换 cue 就把玩家的设置抹掉了。

## 暂停 ≠ 安静

**暂停玩法一点也拦不住声音。** 这两件事根本不在同一条通道上：玩法停靠
`Frame()` 提前返回，而环境床是一张自己在跑的 WebAudio 节点图 + 一个 400 ms 的
`setTimeout` 调度器，每一轮按概率撒远处的枪炮；音乐同理。`Frame()` 返不返回
它们都照响 —— 症状就是「我暂停了，背景里的枪声还在」。

所以 `EditorSuite.RefreshStatus()` 在 `Capturing` 变化时调 `audio.SetPaused()`，
它只停**背景层**（环境床 + 音乐），不 `suspend` 整个 `AudioContext`：
音效编辑器要在暂停时试听，Timeline 要听得见过场自己的音效。已经在飞的一次性音
（最长两秒的尾巴）让它响完，硬掐会「咔」一声。

一处容易漏的接缝：音效编辑器 `Exit()` 会把环境床与音乐还原成进来时那一份，
而那时候游戏**还停着**（面板还开着）。所以它还原完要再 `StopBackground()` 一次，
真正的恢复由离开暂停时的 `SetPaused(false)` 按 `pausedState` 做。

玩家可以在音效设置里关掉这条（「暂停时静音背景」），关掉之后 `SetPaused` 直接短路。

## 打开编辑器 = 暂停玩法

与过场同一条通道。`Script_Main.Frame()` 看到 `editor.Capturing` 就只走
`editor.Update` + `RenderScene`，玩家、AI、特效、剧本全停。**这一条排在过场那一条之前**
—— Timeline 编辑器要自己按走带的步长推 `cutscene.Update`，排在后面过场会被推两次。

同时做三件善后：交还指针锁、收起 HUD（`body.edHideHud`，过场自己的 `.csRoot` 留着）、
把键位路由闸掉（`OnAction` / `Guard` 里判 `editor.Capturing`；不闸的话在编辑器里按 R
会真的去装填，而那是在一个暂停的世界里改状态）。

从主菜单或暂停菜单点进任意一个**编辑器**时，`EditorSuite.Open` 会先收起整棵菜单；
编辑器画面里不能残留“继续／设置／调试选项”。退出编辑器后按进入时记下的层级回到主菜单
或暂停菜单。画质、音效和按键设置不属于编辑器，允许继续显示在暂停菜单上。

## 编辑器与取证工具

### 人物动作 `Script_EditorActor.mjs`

军人有两层动作来源：`Model/Character/` 十个蒙皮 GLB 内的 16 条源动作，以及保留下来的
`Actor.Update(dt, state)` 程序化驱动量。导入动作先由
`Script_CharacterModel.LUGOU_ANIMATION_PROFILE_BY_KIND` 标出适用的阵营和身份；面板只列出当前
角色可用的条目，并在每项右侧显示「国军士兵／国军军官／日军士兵／日军军官」。切角色时不适用的
选择会重置；本阵营对比也会逐人复核，绝不把士兵动作强套到军官。程序化层可切到 18 条
`t → state` 配方或手动滑杆。`本阵营 4兵+1官对比` 会按当前阵营放入 01—04 士兵与 05 军官。

源 `CrouchIdle` 是 5.37 秒静止坏定格：躯干前倾约 59.4°、双臂和枪拖到脚边。GLB 与清单
仍保留它供 10×16 源资产审计，但正式播放通过 `LUGOU_PLAYBACK_CLIP_ALIASES` 改用同阵营、
同骨架的 `RifleIdle` 单膝待机（约 17.6° 前倾）；编辑器动作名、悬停说明与取证栏都明确标注
这次姿态校正，且移动胶囊按蹲姿显示，不能只换中文标签掩盖坏曲线。

离线导入会在 3ds Max 中分别以国军 01、日军 01 的本阵营绑定姿势逐帧采样 16 条 BIP，
再按同阵营每个目标模型自己的绑定轴与骨段比例重建姿态；两军的 Figure/bind 轴不同，
不能拿国军 01 的姿态增量直接套给日军。Blender 对 160 组「模型 × 动作」逐帧核对源姿态，并以实际
变形后的军靴网格计算 `GroundRoot` 高度；成品 GLB 重导入后，清单中的 `animationAudit` 必须
同时满足姿态矩阵误差不超过 `0.001`、地面穿透不超过 `0.002 m`，否则烘焙与测试直接失败。
`人物动作(点缓存).max` 只保存 `.pc2` 变形结果、没有 Biped 骨架，是视觉参考而不是可复用
运行时动作源；可复用曲线来自同包 `bip/`，但必须经过上述两套阵营源骨架分别采样。

能取的证：`meshSource` 必须是 `glb:Lugou…`、当前模型编号、动画名、武器/背刀 Socket、
骨骼命中体数量与移动胶囊。军人出现 `box` / `model` 表示角色 GLB 加载失败，属于阻断问题。

武器栏的默认项读取 `Script_Actor.KIND_SPEC.defaultWeapon`，不在编辑器里另抄人物配枪表。
单人预览切人物会随正式配置换枪；本阵营对比会让四名士兵与一名军官各拿自己的默认装备。
选择一把具体武器会立即替换当前人物，对比模式中则统一替换五人；另有明确的空手选项。

#### 「判定（碰撞盒）」一节

画的是**规则层真正在用的碰撞体**，不是示意图：

| 线框 | 数据源 | 是什么 |
| --- | --- | --- |
| 红色球/胶囊组 | `Script_CharacterModel.HITBOX_DEFS` + 当前骨骼世界变换 | **子弹判定**。头、胸、骨盆、双臂、双腿每帧随蒙皮骨架更新；`MarchBullet` 返回真实命中部位。GLB 缺席时才回退 `COMBAT.hitbox` 固定球。 |
| 蓝胶囊 | `Script_Ai.CAPSULE[stance]` | **移动碰撞**。交给 Rapier 的运动学角色控制器，尺寸随姿态换；算式与 `Script_Physics.CharacterBody._MakeCollider` 逐字一致。 |

三条读这一节之前要知道的：

- **两个体互不相干。** 胶囊决定人挤不挤得过去，球决定子弹算不算打中。
- **AI 不碰这组几何。** AI 之间、AI 打玩家仍是概率命中（`COMBAT.aiAccuracyBase` 那一串）。
- **命中体必须随姿态和身高动。** 切到蹲、卧、跑或倒地时，红线要始终包住相应骨段；
  如果仍悬在站姿高度，说明骨骼语义或矩阵更新断了。
- 「穿透显示」默认开（`depthTest=false`）：命中体埋在人体内，不穿透时多数线段看不见。

### 枪械 `Script_EditorWeapon.mjs`

两种看法各答一个问题：**台架**（几何剪影与挂点，枪口/前握画成红蓝小方块）、
**第一人称**（`Script_Viewmodel` 的 rig）。第一人称模型要在近裁面里假装 FOV、压深度、
做后坐弹簧，用世界几何直接摆会穿模。原来的“手持”只是重复的世界几何检查，
没有独有调校入口，已移除。

可上刺刀的枪在两种视图中都显示“上刺刀预览”：台架把独立刺刀模型按 `socket` 挂到
枪口，第一人称直接切换 `Script_Viewmodel` 的同一件模型；不支持刺刀的武器完全不显示该
选项。动作区也按当前第一人称武器的真实能力过滤，不能投掷、拉栓或装填的条目没有无效按钮；
台架不显示动作区。自转默认关闭，只有明确打开才旋转台架。

数据卡照抄 `Data_Weapons`，琥珀色的几项（后坐 / 开镜 / 散布）标出来是**手感调校值**，
不是史料。没有登记几何的条目只出数据卡；已有模型的架设武器按各自姿态落地预览。

用户可见的「待考」只表示源素材不足以确认具体型号或阵营，不是未解锁、未识别或加载失败。
此类条目的右侧分类按资产本身写成弹体、三脚架组件、架设武器或迫击炮，不再把所有
`kind: "mortar"` 的导入资产笼统显示成「掷弹筒」。

第一人称栏里的「放大准心校准」使用正片相同的 `adsFovScale` 收窄 FOV。红十字是枪口
真实弹道在屏幕上的固定中心；拖动画面或用 X/Y 滑杆移动铁瞄，直到准星尖与红十字重合。
读数采用 900p 基准像素，拖拽会按当前画布高度自动换算。校准覆盖只活在编辑器这一轮里，
退出后重新装备玩家枪械，不会破坏正常战斗“准心、弹道、机械瞄具共用屏幕中心”的规则。

### 第一人称持枪检查 `Script_EditorFirstPerson.mjs`

这是后续第一人称手位与枪姿调整的固定基础检查，不是第二套 Viewmodel。玩家视角直接显示
正片相机下的最终结果；外部检查把**同一棵** Viewmodel 临时移到摄影棚，允许从右后、左后、
枪口和俯视四个固定机位检查，也可拖动环绕。装备表覆盖当前可进入第一人称视模的步枪、轻机枪、
手枪、手榴弹/集束手榴弹与近战武器，动作按钮仍调用正片的开火、拉栓、装填、白刃和投掷接口。

可视化分三层：TZM 武器节点提供 `muzzle / gripR / gripL / sight / magazine` 的真实位置；
`HandRight / HandLeft` 是运行时 IK 目标坐标系；蒙皮骨架用真实指骨构造的 `RuntimeFpsGripR/L`
是最终掌心。彩色挂点、坐标轴、白色掌心和两条残差线同时显示，面板另报位置/角度残差与臂长
拉伸。残差小只说明“解算追到了目标”，**不表示目标方向、肩肘平面或最终轮廓在人眼看来正确**，
所以外部视角截图仍是必验项。

工具没有滑杆写回、保存姿态或覆盖常量的入口；退出会恢复 Viewmodel 父节点、局部变换、玩家武器、
外观变体与刺刀状态。自动化入口是 `Debug.OpenEditor("firstPerson")`，随后可调用
`SetWeapon / SetView / SetInspectPreset / SetPose / Snapshot`；固定出图入口是
`Script_FpsGripEditorShot.mjs`，加 `--all` 可把全部 15 项的玩家/右后外部视角一次拍完。

### 音效音乐 `Script_EditorAudio.mjs`

每个音有**两层**：底层是 WebAudio 现场合成的 32 个配方，上面盖着一层实录采样
（`Audio/Sfx/`，来源与切割见 `Data_SfxSources.mjs`、`docs/Data_AudioAssets.md`）。
采样是异步 fetch 的，盖不上去就自动退回合成 —— 所以列表每条都标了「实录 / 合成」，
选中时下面写出这一条实录素材的出处。当前到底在响哪一层，只有摆出来才答得清。

配方名（`rifleNra` / `impactFlesh` / `shellIncoming`）光看字面认不出是什么声音，
于是每条配一句中文说明 + 它在游戏里什么时候响（`SOUND_INFO`，32 条，冒烟断言一条不许漏）。

**盲听指认**：随机播一个、给四个候选。认错的那几对通常就是需要重新配平的
（拉栓与压弹分不开、砖与土分不开，玩家在战场上也就分不开）。

环境床与音乐是常驻的，退出编辑器时会还原成进来时那一份。

### Timeline 过场 `Script_EditorTimeline.mjs`

驱动的**就是正片那一个 `CutsceneDirector`**，只把 `Update` 的步长接到走带上 ——
另写一个预览器等于把那条时间轴抄第二遍，抄漏一条就会「预览里对、正片里不对」。

回拨靠重放：director 的时间只能往前（字幕靠 `prevTime→time` 的跨越触发、`fired` 是 Set），
所以「拖到 12.4 秒」= 从头 `Play` 再用 1/60 步长快进过去。快进时把 `director.audio`
摘掉，否则拖一次进度条会把整场的枪声一次性放出来。

自检栏读 `ValidateCutscene`，另外自己算一条**轨道最快速度**：两个关键帧之间跨太远
就是「演员以几十米每秒横穿画面」（`hidden` 的那一段是故意瞬移，不算）。

### 场景关卡 `Script_EditorScene.mjs`

城是 `Script_TengxianCity` 按 `Data_Tengxian` 的图纸现生成的，这个编辑器不去改那座城
（改它要改图纸与生成规则，那是源码层的事）。它保留原工具的关卡切片、自由飞行、
回到玩家 / 把玩家挪来 / 俯瞰全城、落点拾取、放置 / 挪动 / 删除、碰撞盒和 JSON 存取，
但**不显示也不接受地形笔刷**。

放置层来自 `Script_World` 的构件（四合院 / 房屋 / 门楼 / 牌坊 / 警报楼 / 清真寺 /
天主堂 / 方形炮楼院 / 沙包路障 / 沙包封门 / 防空洞 / 寨墙段 / 树 / 电线杆 / 水井 /
石磨 / 水缸）与 `Model/*.tzm.json` 的道具、枪和车辆。碰撞盒**真的推进
`city.colliders` 与 Rapier**；退出时按 tag/句柄摘干净。

场景文档另有一层**文本标记**。标记分 `region`（区域，占地框）与 `road`（道路，
带宽和走向），名称用 CanvasTexture 生成中文世界牌，只有编辑器接管时可见，不进入
玩法碰撞、AI 或正式出图。标记可新增、改名、选择、移动、删除，并和构件、地形一起
写进同一份 v2 JSON 的 `markers` 数组；读旧版 v1 文档时按空标记层兼容。
单份文档最多读入 96 个标记，导入时统一重编号，避免异常 JSON 用重复 id 搅乱选择，
或一次建立成百上千张中文纹理耗尽显存。

「载入滕县图纸标记」不维护第二份坐标表：公共院落直接读取 `CITY_FEATURES` / `LANDMARKS`，
道路直接读取 `STREETS`；四门与四侧城外则读取 `GATES`、`EAST_SUBURB`、`WEST_SUBURB`、
`NORTH_SUBURB`、`OUTER_LANDMARKS`。因此学校、警察所、县公署、四座城门，以及西关铁路／
电灯厂、东关、北关、南关天主堂等外围节点都会随正式图纸同步。
按钮只替换 `source:"map"` 的图纸标记，自定义标记保留。

标记的名字有两套显示，各管一头：

- **名牌 HUD（默认开）**：屏幕空间 DOM 层（`.edMapHud`，`UpdateHudLabels` 每帧投影）。
  显示内容 = 文档里的标记 + 布防图参考名（`MapReferenceMarkers()` 现算，按 `sourceId`
  与文档去重，「载入」之后不出双份）。参考名走虚线 `ref` 样式与文档标记区分。
  近的先占屏幕、挤在一起的只留最近那张（选中的永远保留）。**为什么必须走 DOM**：
  世界牌是定死的世界尺寸，五百米俯瞰机位下只剩几个像素 —— 用户第一轮的反馈
  「文本标记怎么都没有生效」一半就是它。
- **视口显示（世界牌 + 占地框）**：CanvasTexture Sprite 与地面框线，近处巡场用。

同一轮修的另一半：拾取射程原是 600 m 定值，TopDown 机位五六百米起步，画面边缘的
射线量程先用完 —— 表现是「点哪儿都放不下、还提示没有地面」。现在
`Pick` 的 `maxDist` 跟随 `camera.far`，`PickWorld` 的采样步数按射程等密度放大
（≈7 m 一步，上限 420 步），守着它的是 EditorTest 的「俯瞰机位」两条断言。

### 完整场景预览 `Script_EditorFullScene.mjs`

它与「场景关卡」是两件工具。场景关卡继续负责章节切片、摆件文档和关卡标记；完整场景
预览只读，不写 `worldEditDocument`，也不改变任何章节任务数据。县城入口固定为
`?phase=fullscene&menu=0&editor=fullScene`：独立 `FULL_SCENE_PHASE` 一次生成城内和四门外，
边界覆盖北关坝墙、城西津浦路、东郊农田与南侧善国门，同时保留既有 `?phase=overview`
出图基线不动。

面板把四类运行时真相放在同一处：完整县城与出川军列车厢静态场景切换；县城总种子、
派生种子与车厢静态 props 中的 `seed` 字段；`CollectSceneSplineRoutes` 从正式街道、铁路、
东关巷路、寨墙和北关坝墙收集的只读中心线；`SKY_PRESETS` 的天空、灯光、雾、曝光、
Bloom、体积光、饱和度和对比度完整参数。Spline 叠加层按正式 `MakeRoadPath` 采样并逐点问
当前战场 `GroundHeight`，所以中心线与生成几何共用同一坐标和地面。

车厢入口固定为 `?phase=fullscene&fullSceneView=carriage&editor=fullScene&menu=0`。它通过
`CutsceneDirector.MountStaticSet` 复用同源 props 建造器，但明确不调用 `Play`：不进入
`playing`，不触发序章镜头、演员、对白、字幕、音频或交接，只提供自由飞行和五个静态巡场
机位。退出工具时卸掉静态布景，并恢复进入前的相机投影和环境预设。

Spline、环境与种子三块 JSON 都用 `<details>` 默认折叠；列表与摘要读数始终可见，只有用户
主动展开或点击 JSON 按钮时才占用面板高度。

### 构件库预览 `Script_EditorPropLibrary.mjs`

专门浏览场景关卡编辑器能布设的全部构件，以及 `Script_ExternalProps` 已放进正式战场的
带署名 GLB（乡村房屋 / 手推车 / 栅栏 / 木箱 / 砖瓦堆）。每次在共用摄影棚里展示一项，
程序化构件走同一个 `BuildSink` / `Script_World` 生成器，tzm 模型走同一个
`InstantiateModel`，外部道具走同一个缓存与运行时材质克隆；不维护第二份预览几何。
筛选只按物体本身的品类（景观 / 院落小件 / 工事 / 建筑 / 地标 / 模型），不再另设
“外部道具”这一来源分类；来源、参数、网格数、碰撞定义与包围尺寸仍在取证栏显示。
这个入口只预览，不写场景文档、不推进碰撞盒。

### 资产规范 `Script_EditorAssetStandards.mjs`

这是独立于构件库的只读分类，不摆模型、不接管相机。枪械、架设/炮械、刀剑/刺刀、战车、
程序化 TZM、外部 GLB 与贴图规范分七栏；有源 TZM 与四套重点外部 GLB 都逐件显示选定源几何、游戏实际三角形、
分类限制或指定目标、面数降幅、自带贴图、游戏内贴图策略与合规状态。展示件、备用状态、
重复壳先从“原始”口径排除；史实补件与强制退化面清理单独标注，不伪装成减面。

规则真相在纯数据 `Data_AssetStandards.mjs`，实际面数仍读 `Data_Meshes.mjs`；Blender 侧阈值、
三件特例及“目标降幅 ≤5% 不减面”在 `_blender/AssetBudgets.py`。外部 GLB 页当前登记乡村房屋、
Battlefield Pack 24 件、Chinese Life 16 件与无叶乔木三变体，共 44 行。
`Script_AssetStandardsTest.mjs` 同时核对两边、
`Model/Index.json` 构建元数据、import map 与编辑器分类，防止面数表悄悄过期。

建筑与地标如果登记了预建模战损，会额外出现「建模状态」三选一：原始状态保留构件自己的
历史缺省；「炮击初损」统一使用中等 `damage` 与 `BuildingDamageEarly` PBR；「严重破坏」
使用高 `damage`、焦烧语义与 `BuildingDamageSevere` PBR。三档仍调用同一个正式生成器，
切换时几何、残砖、碰撞定义和表面贴图一起重建；牌坊、警报楼、外部 GLB 等没有真实战损
生成逻辑的条目不显示这栏，不能用换色冒充建模变体。

两档另外共用 `Script_World.AddBuildingDamageDetails` 的确定性近景构件层：初损有内陷弹着面、
缺砖冲击圈、放射裂缝和墙脚落砖；严重档在此基础上增加更大的缺口、逐皮墙角残砖、斜落断梁
与散瓦。它们仍进入 `BuildSink` 的既有材质桶，不按碎砖逐件建 Mesh；房屋本体的严重档还会
拿掉一侧窗间墙并同步取消那段碰撞，门楼和教堂则分别出现断门额、残塔与外露锥顶木架。

### 生活用具 / 工事 PCG `Script_EditorPropPcg.mjs`

这是正式布设规则的可视化编辑器，不维护一套只供编辑器看的假数据。`Data_PropPcg.mjs`
登记可用资产占地、语义模板、规则组和世界坐标 volume；`Script_PropPcg.mjs` 是不 import
three 的纯生成器；`Script_ExternalProps.mjs` 在每章加载时把结果接到正式资产、距离流送
与实例桶。编辑器只在玩法暂停期间克隆真实模型做全量预览，退出立即清掉克隆并
恢复正片 `PropBatcher`，所以编辑器显示的高 draw call 不能拿来代表生产性能。

四类规则组各自解决不同问题：

- `householdLife` 以院落 cell 为锚点，从「取水洗濯、劈柴修补、院心桌凳、收拾到一半、
  农具靠墙、灶间陶瓮」中选一个完整生活组合；不把单只桶、凳子、碗随机撒满地图。
- `defenseSupport` 在城墙分段矩形内生成手榴弹补给、墙根歇兵或就地取材组合。城门口和
  道路没有 volume，拒绝自动造碉堡或壕沟。
- `defenseFiringLine` 把三种沙袋组沿 Catmull-Rom 控制线按弧长稀疏布置，朝向跟随切线；
  城墙四门、马道、缺口和任务轴通过把长线切成独立安全段主动留空。
- `defenseWireLine` 用同一套 spline 规则拼接蛇腹网/三道桩网；允许相邻模块按预设小幅压茬，
  但仍逐件接受真实 AABB、坡度、手摆件与排除区裁决。

纯生成器逐落点检查 volume / 世界 bounds、排除区、真实 AABB、已手摆构件、坡度、资产
占地半径和组间距。种子按 `document → volume → cell/anchor` 分层：只改一户不会洗牌整座城，
同一院落在相邻章节切片里也保持相同模板、坐标、朝向与缩放。面板可新建、复制、删除 volume，
调规则组、院落/矩形/样条形状、密度、控制点、弧长间隔、起终点退让、侧偏/抖动、最小间距
和 seed offset；还能切换真实构件 / volume 框 /
落点标记、把相机对准所选区，并做本地保存、JSON 导入导出。试调键是
`tengxian1938_propPcg_v2`；正式交付必须把 JSON 结果誊回 `Data_PropPcg.mjs`。

生产优化口径固定为「生成时避真实碰撞、自动小物默认不造物理体、视觉流送、同资产同材质
GPU 实例桶」：PCG 输出就是普通 ExternalProps placement，但默认 `solid:false`，避免随机
桶凳改变 AI 导航、射界或玩家移动；沙袋/铁丝网是唯一显式 `solid:true` 的自动工事，且只能
来自已切开通路的 spline volume，并由纯规则与两张真实关卡浏览器回归共同守门。静态件继续进入
`THREE.InstancedMesh` + `StaticDrawUsage`，不新建每件 draw call。
编辑器的取证栏同时显示生成件 / 组合 / volume / 拒绝原因、正片 live 数、
实例数、live / reserved bucket 与 buffer overflow。纯规则回归口是 `Script_PropPcgTest.mjs`，
真浏览器开关、预览、JSON 往返和退出还原由 `Script_PropPcgEditorTest.mjs` 守。

### 地形 `Script_EditorTerrain.mjs` + `Script_EditorScene.mjs` 共享内核

只提供关卡切片、自由飞行与抬高 / 压低 / 弹坑 / 抹平。笔刷同时改**网格顶点**与
**解析高程 `GroundHeight`**；只改前者的下场是「看着是个坑，人在坑口上平地走过去」。

三条被网格分辨率定死的规矩：

1. **刷得动的只有城内台地**（`|x|`、`|z|` < 318 m，636 m 铺 116×116 ≈ 5.5 m 一格）。
   城外那张地面是绕城的方环，七百米以外每两百米才一个顶点。
2. **一笔动不到任何顶点就整笔拒绝**，并在屏幕上说清楚为什么。宁可「刷不动」，
   也不留下「解析高程凹了但网格没动」。
3. 半径小于 ~8 m 在 5.5 m 的格子上刷出来是几个尖不是坑，所以默认 14。

一次按下只合成一个 op；包围球与法线攒到停笔 0.2 秒后再算。地形模式左键只涂、
右键才转视角。场景关卡编辑器放置的构件作为只读参照带进来：落笔时可见节点逐帧贴地，
松手后 AABB 与 Rapier 碰撞体按新地高重建，所以地面抬升不会把 Prop 留在原高度。

场景与地形共用一份会话文档；切换入口不丢未保存改动。构件、标记、地形三层仍可存为 JSON
（`localStorage` 键 `tengxian1938_sceneedit_v1`，或导出到文本框）。

三个入口的相机面板都能调整 **FOV** 与**远裁剪面**。这些是本次预览的临时值；
`Studio` / `FlyCam` 退出时会恢复原来的 `fov`、`near` 与 `far` 并重算投影矩阵。

### 可破坏场景预览 `Script_EditorDestruction.mjs`

直接进入七关的正式场景，调用正片同一套 `DestructionSystem.Hit/Blast` 检查墙面、
楼板、桥面与布景的耐久、局部破口、Rapier 碰撞拆分、残骸、掩体和导航重建。
`cityWall` / `rampart` / `ramp` / `tower` 是承重白名单，编辑器会用蓝色碰撞框标出，
再高的测试能量也不会拆除。

进入时抓取“视觉 + 碰撞 + 耐久 + 导航”快照；按 R、点「复原预览」或退出时都会
完整恢复。只清 shader 破口不算复原，因为那会留下看不见但可穿行的物理洞。

### Debug Rendering `Script_EditorDebugRendering.mjs`（叠加层）

不接管相机、不暂停玩法，负责把当前帧的渲染靶直接送到主画布。与 Profiler 一样
`static keepOnClose = true`：**关设置面板回去打仗不收它** —— 运行时才复现的渲染 bug
（第一人称手上的暗块、移动中的雾/AO 闪烁）只能开着调试视图边打边看；材质假彩色
uniform 与送屏视图都原样保留，浮窗留在画面一侧照常刷「当前靶」。要停：面板里再点一次
「Debug Rendering」、叉掉浮窗，或按「全部关掉」（它按字面办，keepOnClose 的叠加层
也一起收，送屏回到最终画面）。`Script_EditorTest` 两条断言各守一头。除 GBuffer、材质、
光照与 GI 外，「后处理」分组还把三段容易串线的结果拆开：`Bloom 提取` 是阈值/软膝后的
半分辨率亮部，`Bloom 合成` 是正式 Composite 真正采样的多级叠加靶；`雾量` 从
NormalDepth 和本帧 Composite uniforms 重算距离雾×高度衰减，`景深 CoC` 以同样方式
重算散焦系数。`Motion Vector` 也由同一份深度与前一帧相机矩阵重投影，明确标作相机速度：
当前管线没有逐物体速度缓冲。光照组则能在材质着色器内部截取正式 `reflectedLight` 的
直射漫反射、直射镜面、IBL 反射和 GI/IBL 间接漫反射四条贡献。雾/CoC/Motion Vector
不另建全分辨率调试靶，避免只为编辑器多占显存；蓝→暖黄的假彩色明确显示 0→最大效果量。
景深只在阵亡镜头触发，未触发时 CoC 视图保留深蓝底而不是黑屏。

正式军人与编辑器摄影棚里的十套蒙皮人物也必须走同一条材质注入链：GLB 自带的
`MeshStandardMaterial` 在接入时明确把军装、皮肤、头发的金属度归零，并保留作者的
粗糙度标量/贴图；BaseColor、粗糙度、金属度、太阳阴影和四路光照分量视图都要覆盖人物，
不能只覆盖 `MaterialLibrary.Get/Plain` 造出的环境与武器材质。角色网格同时逐件开启
`castShadow/receiveShadow`。透明头发在假彩色重画时保留原 alpha，不能变成一整块实心壳。

**第一人称的手与枪同样是被覆盖对象**，而且它有两条独立的链，坏哪条都只坏一半视图，
面板底部因此分两项报（`第一人称预通道` / `第一人称材质`）：

- **材质注入**（决定材质 / 光照 / GI 共十一个假彩色视图画不画得到它）。双臂
  （`Script_RiggedModel.FpsArmRig`）与手榴弹（`Script_GrenadeAsset` 的第一人称克隆）
  是外来 GLB，必须经 `MaterialLibrary.ConfigureExternalPbr` 接入 —— 与人物同一条规矩，
  同一个坑：glTF 的 `metallicFactor` 缺省是 1，这两份材质都没写该字段，接之前一双手
  一直在按**纯金属**渲，而且假彩色一帧里的手画的是最终颜色，是假的。
- **前景预通道**（决定 GBuffer / AO / 雾 / CoC 共七个视图看不看得见它）。整棵
  `viewmodel.root` 走 `Script_Post.MarkForegroundPrepass`：不透明件照常吃覆盖材质，
  写**真法线**，但视深写常数 `FOREGROUND_VIEW_DEPTH = 1 m` 的近景标签 —— 视图模型带
  一层非等比深度压缩，按它自己的视深写进去，开镜近景 DOF 会把正在瞄的枪整支糊掉、
  相机运动模糊按 0.2 m 的视差把枪拖成一片。半透明/加性件（枪口焰）没有可用的法线，
  按约定整只 `skipNormalDepth` 藏出预通道。
  **不要退回 `MarkNoPrepass`**：那不是"不进预通道"，只是"不换材质"，物体照样被画进
  `rtNormalDepth`，写进去的 xyz 是它自己的光照颜色（当法线用是纯垃圾，SSAO 直接读错）。

`Script_EditorTest` 的两条断言守着这一节：一条对账两条链的标记与注入位，另一条把
第一人称藏起来再拍一次，只认像素差 —— "接线对了"不等于"屏幕上看得见"。

### Profiler `Script_EditorProfiler.mjs`（叠加层，独立窗口）

与 Debug Rendering 同在「渲染调试（可叠加）」组，不接管相机、不暂停玩法 ——
它量的就是战斗中的帧。面板里就是一颗开关（**没有页面内面板**，用户点名去掉的）：
点开即 `FrameProfiler.Enable()`（内核在 `Script_Profiler.mjs`）并弹一个
`window.open` 独立窗口：帧时间条图、CPU 主线程逐系统（B/E 标记打在
`Script_Main` 的 Frame/RenderScene 里）、GPU 逐 pass（EXT_disjoint_timer_query_webgl2
分段计时，阴影烘焙靠包一层 `shadowMap.render` 从预通道里拆出来）、最近 10 秒最差
一帧的桶归因、GC/长任务/堆分配速率，以及「导出快照 JSON」。

四条特殊行为，改的时候别破坏：

- **`static keepOnClose = true`**：关设置面板（回去打仗）不收它 —— 主用例就是
  边玩边记。停它：面板里再点一次开关，或直接叉掉独立窗口（Update 检测
  `win.closed` 自我关闭）。弹窗被拦截时 Enter 抛错、开关弹回，不留瞎状态。
- **钩子必须成对还原**：Enable 会把 `renderer.info.autoReset` 改成手动、包
  `shadowMap.render`、把自己挂到 `post.profiler`；Exit/Disable 一样不落地还回去。
  守着它的：`Script_ProfilerTest`（render 域）。
- **GPU 查询结果晚几帧到**（ANGLE/D3D11 连 `gl.finish` 都不算数），`_Poll` 每帧收、
  挂回历史记录；headless 是 SwiftShader，GPU 数字只证明接线，不许当性能结论。
- **自身开销记在「编辑器叠加层（含本面板）」桶里**，用户看得见：条图每 3 帧一画、
  表格 0.5 s、取证/事件 1 s（走 `Summary(10, {buckets:false})` 便宜路径）。
  用户实测过一次 10 ms 的自刷新突刺，节流与便宜路径就是冲它去的 —— 改刷新
  频率前先看这一桶有没有涨回去。

「CPU 分线程」的诚实口径：玩法期间没有 worker（加载台的旋转 worker 只活在开机），
逻辑与渲染提交全在主线程；GPU 进程按 pass 列出；WebAudio 在浏览器音频线程，页面
测不到。面板上原样写明，别许诺测不到的东西。

### 摄影棚里没有人物合批

`Studio.Open()` 藏世界的同时把 `ActorBatcher` 关掉，`Close()` 按进来时的原值装回去
（`Studio.SetActorBatch`）。这不是省事，是一次事故的修法：

`WorldMask.Hide` 藏的是 scene 的**直属子节点**，其中包括开编辑器之前就建好的那一批
`ActorBatch_*` `InstancedMesh`。而 `ActorFactory.Create` 会把台上新造的人也登记进合批层、
把它的分件挪到 `BATCH_LAYER`（等于不自己出画）——于是实例矩阵写进了**已经被藏起来的**
批次里：人在、材质对、`root.visible` 为真，屏幕上一个像素都没有。

**为什么当时看着像「只有川军步兵坏了」**：批次是按「几何 × 材质 × 投不投影」分桶，
桶里的 `InstancedMesh` 头一次真的有实例时才建。川军是玩家的自己人、永远在近处走完整
Actor，桶早就建好（所以被藏）；城里那几关的日军几乎全在远景层（`ActorCrowd`），精细桶
还没建过，编辑器里现建的那几个是在 `Hide` 之后加进 scene 的、不在 mask 的名单里，
于是看得见。同一份代码两种表现，全凭「这个桶是在藏之前还是藏之后建的」。
（当时画面上那支浮在空中的中正式，就是一个恰好在藏之后才建的桶。）

不给 mask 开白名单：放行合批网格 = 把外面全城的人一起放进摄影棚。台上只有一到六个人，
合批省下的几十个 draw call 换不来这一整类看不见的显示事故。

回归口：`Script_EditorTest` 的「川军步兵在摄影棚里真的画出了像素」——
它**数颜色**（藏人前后逐像素比差值），不数 `visible`。这一类事故躲得过任何
`visible` / `meshSource` / 材质属性的断言，之前那六条就是全绿着放它过去的。

### 拾取与落点

拾取不用 `THREE.Raycaster`（城是几十个几万三角的合批网格，逐三角求交点一下卡半秒），
走的是「沿射线走、比脚下的解析高程」+ 二分。两条一定要记住的：

- **判据是「任何一次变号」，不是「从上往下扎」。** 写成 `prevGap > 0 && gap <= 0` 的话，
  相机正好贴在地面上（`gap` 恰好为 0）时永远进不了那个分支 —— 症状是「点哪儿都放不下
  东西」，而且完全没有报错。「回到玩家」曾经就把镜头放在这个高度上。
- **俯仰不许归零。** 归零 = 正对地平线，而水平射线永远碰不到平地：屏幕上半边点哪儿
  都没有落点。所以「回到玩家」压 25°、抬 2 m。

屏幕正中那个十字**不能用**：拾取走的是鼠标位置，两者不是一个点。落点画在世界里
（黄环 + 竖针，`RefreshGizmo`），打不到地的时候整个藏起来并把原因写在屏幕顶上。

**换关的时机是这个文件里最容易写错的一处**：搬家只能在 `state.ready` 重新变回 `true`
的那一刻做，不能在「`battlefield` 变了」那一刻做 —— `TengxianCity.BuildSteps` 走到最后会
`this.colliders = sink.colliders.concat(...)` 整根换掉那个数组，在那之前推进去的盒子
会被连锅端走，而地形位移那时候连地面网格都还没建出来。

## 加一个新编辑器

在 `Script_Editor.mjs` 的 `EDITORS`（或 `SETTINGS`）里加一条。要实现的接口只有这些：

```js
export class XxxEditor {
  static id = "xxx";            // 唯一名，Debug.OpenEditor 用它
  static label = "面板上显示的名字";
  static hint = "鼠标悬停的一句话";
  constructor(host) { this.cameraMode = "studio" | "fly" | "none"; }
  Enter(root) {}                // 把自己的面板 append 到 root
  Update(dt) {}                 // 每帧
  Exit() {}                     // **把改过的运行时状态一样不落地还回去**
  OnClick(event, button) {}     // 可选：视口点击
  OnPaint(event, button) {}     // 可选：视口拖动（笔刷）
  OnDrag(dx, dy, button) {}     // 可选：自己接管相机拖动
  OnWheel(delta) {}             // 可选
}
```

`host` 给的是渲染侧（renderer / scene / camera / canvas / library / lights）、
各系统（actorFactory / viewmodel / audio / cutscene / destruction）、`game`（state / player /
battlefield 取值器 / PHASES / JumpToLevel），以及 `studio` / `flycam` / `SetHint` /
`SetCrosshair` / `SetViewmodelVisible` / `Close`。

**新模块必须登记进 `index.html` 的 import map**（那张表是版本戳的唯一来源）。

## 冒烟

```
node Taierzhuang1938/Script_EditorTest.mjs
node Taierzhuang1938/Script_DestructionEditorTest.mjs
```

编辑器套件 71 条断言，另有破坏预览专项取证；退出码即成败。重点不是「能不能打开」，
而是**关掉之后有没有还干净** ——
编辑器是这个项目里唯一会去动运行时状态的一批代码（藏世界、换相机、包 `GroundHeight`、
往 `city.colliders` 里塞盒子、给 viewmodel 换枪），有一处没还回去，症状会在很远的地方
才冒出来：撞到空气、退出后视角歪了、举着别人的枪。

改了编辑器以外的东西照旧跑 `Script_BootTest.mjs`（画面健康 + draw call 红线）与
`Script_PlayTest.mjs`（玩法与剧本）。
