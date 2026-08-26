# 编辑器套件

开发用的八个编辑器 + 一个入口面板。**不对玩家开放**：出图模式（`?shot=1`）下整棵
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

## 八个编辑器

### 人物动作 `Script_EditorActor.mjs`

这个项目**没有动画剪辑**：`Actor` 是程序化姿态，每帧的姿势由 `Actor.Update(dt, state)`
里那十三个连续量算出来。所以「动作列表」不是资产清单，是 `t → state` 的配方表
（`CLIPS`，18 条）—— 列一堆并不存在的 `.anim` 名字才是骗人。

能取的证：`meshSource`（`box` = Blender 模型没读到、静默退回了方块几何，最常见的换模事故）、
步频步幅（1 m 米格 + 支撑相不打滑）、持枪挂点、五个 kind 站一排时的身高差。

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
不是史料。车辆与掷弹筒没有几何，只出数据卡。

第一人称栏里的「放大准心校准」使用正片相同的 `adsFovScale` 收窄 FOV。红十字是枪口
真实弹道在屏幕上的固定中心；拖动画面或用 X/Y 滑杆移动铁瞄，直到准星尖与红十字重合。
读数采用 900p 基准像素，拖拽会按当前画布高度自动换算。校准覆盖只活在编辑器这一轮里，
退出后重新装备玩家枪械，不会破坏正常战斗“准心、弹道、机械瞄具共用屏幕中心”的规则。

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

### 构件库预览 `Script_EditorPropLibrary.mjs`

专门浏览场景关卡编辑器能布设的全部构件，以及 `Script_ExternalProps` 已放进正式战场的
带署名 GLB（乡村房屋 / 手推车 / 栅栏 / 木箱 / 砖瓦堆）。每次在共用摄影棚里展示一项，
程序化构件走同一个 `BuildSink` / `Script_World` 生成器，tzm 模型走同一个
`InstantiateModel`，外部道具走同一个缓存与运行时材质克隆；不维护第二份预览几何。
分类、来源、参数、网格数、碰撞定义与包围尺寸都在取证栏显示。
这个入口只预览，不写场景文档、不推进碰撞盒。

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
