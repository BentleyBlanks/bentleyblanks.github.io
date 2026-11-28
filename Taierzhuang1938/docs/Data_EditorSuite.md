# 编辑器套件

## 窗口样式

设置与编辑器使用 `Style_Interface.css` 的 World at War 主题，`Style_Editor.css` 定义工具布局。
黑色标题栏、冷灰底色、旧金选中条与菜单一致；读数保留等宽字体，阵营和错误状态保留语义色。
通用按钮、开关、选项及关闭按钮使用原生 button，支持 Tab / Enter / Space；开关和选项同步
`aria-pressed`。高级工具是 Unity 式布局：顶部菜单栏 + 右侧 Inspector（菜单栏高 46 px，
Inspector 宽 380 / 宽版 460 px，CSS 变量 `--ed-bar-h` / `--ed-inspector-w`）。外观沿用启动界面（指挥室菜单、
设置 / 声音页）的视觉语言：半透明暗色渐变底、象牙白文字、橄榄灰细线、左侧金边 + 渐变的选中条、宽字距分组标题、
衬线标题（TzTitleText）、金色填充细轨 + 竖条滑块、直角控件；取值与 `Style_Menu.css` 的设置页同源（`#edRoot` 上的 `--ed-*`）。
2026-10-13 试过一版中性深灰 + 蓝色强调的「现代编辑器」皮，用户否了：要和启动界面同一种风格。窄屏时菜单栏横向滚动，
Inspector 改成底部抽屉。玩家设置页（2026-11-06 起）是主菜单设置页的右栏：画面 / 声音 / 操作由 `SettingsHost` 嵌入模式画进 `.mnSettingsDetail`；直接 `settings.Open(id)` 仍是画在 `#settingsRoot` 的浮窗（测试用）。开发工具画在 `#edRoot`，两棵根分开。
Profiler 仍在独立窗口运行，复制当前入口带版本的主题链接。

外观与操作验收见 [主菜单文档](Data_MainMenu.md) 的 `--interface-only`；相机、设置持久化与
编辑工具功能继续由 `Script_EditorTest.mjs` 验证。

开发工具分两块，**都不对玩家开放**，出图模式（`?shot=1`）下整棵 DOM 是 `display:none`：

- **高级工具**（菜单 设置 → 高级工具、齿轮或 `` ` ``）：共 15 项，按场景、关卡、角色、武器、特效与声音、资产六组排列。13 项经独立工具边界接入，白盒关卡编辑器和 Timeline 使用整页入口。
- **高级工具音量**（2026-10-20，用户：高级工具页面要有独立的音量调节）：菜单栏右侧（Debug工具下拉与「返回主菜单」之间）一条
  喇叭 + 滑条 + 百分比（`Script_EditorVolume`），点喇叭静音 / 取消，滑条上滚轮一格 5%。存在自己的 localStorage 键
  `tengxian1938_tools_volume_v1`（`{ volume, muted }`），**不碰**游戏「声音」设置那份 `tengxian1938_audio_v1`；第一次用时从
  玩家当前的总音量起步。游戏内高级工具 / `Tool_Studio` / 白盒关卡编辑器开启或预演时，`Script_Audio.SetToolsVolume(音量)` 盖过玩家的总音量（`outputVolume = toolsVolume ?? masterVolume`），退出时调
  `SetToolsVolume(null)` 还回去；`ToolWindowShell` 独立页面（如 `Tool_AudioPreview.html`）本身不读玩家设置，改用 `SetMasterVolume` 直接同步并写入 `tengxian1938_tools_volume_v1`。白盒关卡编辑器右上角工具条里也有同一条（同一份存档）。
- **Debug工具**（菜单 设置 → Debug工具；高级工具菜单栏右侧、音量条左边的「Debug工具」下拉）：Debug Rendering / Profiler / Frame Debugger / WorldInfo / 玩家状态 / 敌军 AI / 环境，外加 FPS 显示。两处入口开关同一份状态
  （`EditorSuite.DebugToolStates` / `ToggleDebugTool`，顺序与文案都取 `Data_DevTools.DEBUG_TOOL_IDS` 与
  `Data_Text_Menu` 的 `menu.debugTools.*`）；下拉条目带 `data-debug-tool`，不算编辑器条目（不带 `data-editor`），
  开着的打金方块，弹独立窗口的几项后缀 ↗。独立窗口被浏览器拦下时下拉不会静悄悄地没反应：拦截原因写到画面顶上的提示行，5 秒后收掉
  （2026-10-22 起；之前高级工具菜单栏不列它们，只能回设置页开）。
  标题菜单（独立启动，没有战局）里这一页只读，提示进关后从暂停菜单开。

玩家设置（画面 / 声音 / 操作）不属于开发工具，见下文「设置不在高级工具里」。
各编辑器的过时 / 有问题 / 信息冗余清单（2026-10-13 审计，待挑选处理）见 [编辑器审计](Data_EditorAudit20261013.md)。

## 开发工具隔离与打包剔除

打包时会整组剔除高级工具与 Debug工具，所以运行时只经两个边界模块碰它们：

| 边界 | 谁用 | 剔除版 |
| --- | --- | --- |
| `Script_DevTools.mjs`（`CreateDevTools(host)` → `EditorSuite`） | `Script_Main` | `Script_DevToolsStub.mjs`：返回 `null` |
| `Data_DevTools.mjs`（`DEV_TOOLS_ENABLED`、`DEBUG_TOOL_IDS`，零依赖） | `Script_MenuStartup`、`Script_Editor` | `Data_DevToolsStub.mjs`：`false` / 空表 |

- 剔除 = `node Taierzhuang1938/Script_BuildBrowserBundle.mjs --deploy --strip-dev-tools --output-dir <staging>`：
  esbuild 插件把两个边界模块换成剔除版，其余代码不动。现在 Pages 发布**默认不剔除**。
- 宿主拿到 `editor === null` 就按「没有开发工具」跑：不建齿轮、`` ` `` 不响应、菜单不列「Debug工具」「高级工具」
  （`Script_Menu` 看宿主给的 `DevToolsAvailable`），`Debug.OpenEditor` 等取证口回答「没有」。
- 名字带 Editor 却随包发布的只有两个：`Script_EditorSettings`（设置页的类）、`Script_EditorUi`（控件工具箱）。
  它们不许 import 任何开发模块。（原来的第三个 `Script_EditorWhiteboxQuality`——白盒画质那一栏——2026-10-31 随白盒画质档一起删了。）
- 样式：菜单栏 / Inspector 停靠只写在 `#edRoot` 下（`Style_Editor.css`「高级工具」两节），控件样式两边共用；
  剔除时 CSS 可原样留着（选择器落空），要瘦身再把 `#edRoot` 专属段落拆出去。
- 闸门 `Script_DevToolsIsolationTest.mjs`：两对边界模块导出同名；剔除后游戏包与菜单包里没有任何开发模块
  （有人绕过边界直接 import 编辑器时报出是谁拉进来的）；标题菜单包从不带编辑器；`--browser` 真浏览器跑剔除包，
  标题菜单与第一关都能开机、设置三页可用、菜单里没有两项开发入口。2026-10-13 实测剔除省 817 KB、43 个模块。

## AdvancedTool ControlCenter 与独立工具宿主（2026-11-12）

一部分高级工具从游戏里拆到 `Taierzhuang1938/AdvancedTools/`，用本地控制中心和独立宿主页打开；方向只许 **AdvancedTools → 游戏**。

- **范围**：独立网页 4 个整页搬走、旧网址不留跳转壳——场景编辑器 `SceneEditor.html`、遭遇设计 `Tool_LevelFlow.html`、Mixamo 动作预览 `Tool_MixamoAnimationPreview.html`、贴图管理 `TextureManager.html`（连同只给它们用的模块与样式）；摄影棚类 9 个（`assetStandards audio props actor facial squadMarch weapon firstPerson vfx`）源码搬进该目录，连同只被它们用的 `Script_EditorParticleInspector / FallingSoil / FlareField`、`Script_FacialReview`、`Script_PlaceableCatalog`。被留在游戏里的代码导入的模块一律留在原地（如 `Script_MixamoProps`、`Script_TextureImports`），AdvancedTools 里用 `../X.mjs` 引。白盒 / Timeline、全部 Debug工具与共用的 `Script_EditorStage / Ui / Settings / Volume / Home`、`Script_Editor` 本体不动。
- **控制中心** `AdvancedTools/ControlCenter.html`（`Script_ControlCenter.mjs`，目录表 `Data_AdvancedTools.mjs` 零依赖）：版式照工具首页，按 `TOOL_MENUS` 六组列工具。独立窗口页开各自页面，摄影棚类开 `Tool_Studio.html?tool=<id>`，留在游戏里的标「游戏内」并链到游戏入口（blockout / timeline 用入口类静态 `Url()`）。资产组另有本地 [3D 模型制作工作台](Data_ModelWorkbench.md)，用于参考图审批、建模和独立验收。Debug 工具在游戏设置里。

- **角色制作管线** 在控制中心的「角色」分组。点击后，本地预览服自动启动或复用 OneDrive `Sync/饮河/FPS/角色/Tripo/CharacterWorkbench` 下的现有工作台，并打开 `http://127.0.0.1:8743/`。自动启动需要本机 Python 和工作台依赖，新启动的服务在两小时后退出。
  「拆件模型」阶段可逐件选择「用 Tripo 生成」；确认后用已核对的拆件图经本机 Codex 的 Tripo Studio MCP 生成一个 GLB，并按当前参考版本登记。手动 Studio 入口仍可用。两套工作台共用同一次 [Tripo MCP 配置与授权](Data_ModelWorkbench.md#本机依赖与记录)。
- **独立工具宿主** `AdvancedTools/Tool_Studio.html?tool=<id>`（`Script_ToolStudio.mjs` 外壳 + `Script_ToolStudioRenderBase.mjs` 渲染底座）：不改 `Script_Main`，底座照 Main 的建系统与出画顺序自己装配（画质档与玩家存档同一套，天光 / 地台照工具首页那一关），host 字段同 `EditorSuite.editorHost`，差别只有 `game` 是最小桩、`playerWeaponId` 取 `DEFAULT_PLAYER_WEAPON`。页面 `<base href="../">`，游戏模块里按游戏根写的 `./Model/…` 相对路径照旧可用；外部 PBR 清单照抄 Main 的表（`Data_ToolStudioPbrSets.mjs`，Main 改表要同步）。`?manual=1` 时钟归测试（`window.ToolStudio.StepFrames`）。
- **搬家后的路径**：独立页面读 `../index.html` 的 import map，键值按 index.html 位置解析成绝对地址再插入（避免同一模块两个实例）；入口类用 `new URL("../", import.meta.url)` 解析 `TOOL_INFO.window.url`（相对 `Taierzhuang1938/` 根）。`index.html` 的 import map 里搬走的模块登记为 `./AdvancedTools/X.mjs`。
- **游戏内入口暂时保留、行为不变**：两对拆分边界模块（写法同 `Script_DevTools` / `Data_DevTools`）——`Script_DevToolsSplit.mjs` 导出 `SPLIT_TOOL_CLASSES`（13 个工具类，游戏里唯一可以 import `./AdvancedTools/` 的模块）、`Data_DevToolsSplit.mjs` 导出 `SPLIT_TOOLS_AVAILABLE`（零依赖）；`TOOL_INFO` 里 13 项带 `split: true`，`TOOL_MENUS` 按 `!split || SPLIT_TOOLS_AVAILABLE` 过滤；`Script_Editor` 的类表 / 互斥表由本地类加 `SPLIT_TOOL_CLASSES` 组装。
- **线上剔除**：Pages 发布始终把这两对换成 `*Stub`（`Script_BuildBrowserBundle --deploy` 自动带，`--strip-dev-tools` 全剔路径仍可用），发布副本不含 `AdvancedTools/`（`PUBLISH_EXCLUDE` + `Script_PublishScope.IsPublishedSource`），`Script_PublishPrune.StripAdvancedToolsImports` 摘掉 `index.html` import map 里指向它的条目（排在盖戳之前），`Script_StampImportMaps` 不进该目录。效果：线上菜单 / 设置 → 高级工具里这 13 项消失（整组拆空的「特效与声音」也不列），其余工具照旧。
- **桌面启动器** `AdvancedTools/Script_ControlCenterLaunch.mjs` 和本地预览快捷方式共用端口规则。默认优先复用 8080 上同一检出的当前预览服务，其次查找相邻端口上同一检出的当前服务。旧版同检出服务可原地更新。没有同检出的服务时只尝试 8080，被占用会提示。测试时可通过命令行传入数字端口以保留端口回退。`--dry-run` 只打印计划，`--shortcut` 创建桌面快捷方式，`--shortcut-dir=<dir>` 指定创建位置。
- **门禁**：`Script_AdvancedToolsTest`（纯 Node：目录表、搬家、入口类地址、卡片、启动器）、`Script_AdvancedToolsBrowserTest`（控制中心、九个工具在独立宿主逐个打开、四个页面新地址）、`Script_ToolStudioParityBrowserTest`（九个工具游戏宿主 vs 独立宿主整页截图平均绝对差 ≤ 2/255，约 20+ 分钟，tier2）、`Script_DevToolsIsolationTest`（拆分边界导出对账、游戏不 import AdvancedTools、发布构建 / 发布副本 / 菜单剔除）。

- **2026-11-13**：样条与撒点验证界面移入 `AdvancedTools/`，入口为 `Tool_Pcg.html?tool=splines|propPcg`。宿主复用工具渲染底座与界面外壳，通过 `TengxianField` / `FirstLevelWhiteboxField`、`AddExternalProps` 装配场地与真实布设。生产生成器和数据仍由游戏共享调用，发布包剔除这两项验证界面。环境转入 Debug工具独立窗口，第一人称持枪移动检查删除。控制中心共 17 项，15 项已拆分，白盒与 Timeline 共 2 项仍走游戏入口。
- **2026-11-21**：新增独立窗口工具「动作衔接对比」（`motionCompare`，入口 `AdvancedTools/Tool_MotionCompare.html` + `Script_MotionCompare.mjs` + `Script_EditorMotionCompare.mjs`），归入「角色」分组；左右同步分屏实机对比 3C 动作系统优化前后（2D 混合 / 朝向扭曲 / 原地转身 / BlenderMCP 9 帧 Aim Offset / 开火叠加 / 第一人称双腿防穿插 / WASD 沙盒）。控制中心共 18 项，16 项已拆分，白盒与 Timeline 共 2 项仍走游戏入口。
- **2026-11-22**：删除「小队行进」编辑器及其独立宿主与游戏内入口。控制中心共 17 项，其中 8 项使用摄影棚宿主、7 项开独立窗口、2 项走游戏入口。
- **2026-11-22**：枪械检查台改用独立窗口，控制中心现有 7 项使用摄影棚宿主、8 项开独立窗口、2 项走游戏入口。[枪械检查台](#枪械检查台)
- **2026-11-25**：构件库预览拆出游戏，成为只在控制中心出现的独立只读页面 `Tool_PropLibrary.html`（见 [构件库预览](#构件库预览-advancedtoolstool_proplibraryhtml只在控制中心)）。游戏菜单 17 项（15 项拆分、2 项游戏内），控制中心 19 张卡（另含构件库预览与模型制作工作台两张只在控制中心的卡）；工具宿主剩 `actor facial assetStandards`。
- **2026-11-25**：高级工具控制中心与所有拆分独立工具页面改为普通浏览器标签页打开（移除 `TOOL_INFO[id].window` / `STANDALONE_TOOLS` 的 `popup,width=...,height=...` `features` 以及控制中心点击拦截的 `window.open(..., features)`，改为原生 `<a target="...">` 或无 `features` 的 `window.open(url, name)`；同源命名标签页不设 `rel="noopener"` 以保留同名标签页复用及「← 控制中心」返回原标签页）。仅在游戏内伴随实时画面运行的 Debug 工具（Profiler / FrameDebugger / WorldInfo / PlayerState / Environment）仍保留独立弹窗。
- **2026-11-25**：资产规范拆出游戏，改成只在控制中心出现的独立配置器 `Tool_AssetStandards.html`（见 [资产规范与限制](#资产规范与限制-advancedtoolstool_assetstandardshtml只在控制中心)）；规范真相从游戏根的 `Data_AssetStandards.mjs` 搬到 `AssetPipeline/Data_AssetStandards.json`，游戏运行时不再读它。游戏菜单 16 项（14 项拆分、2 项游戏内），控制中心仍 19 张卡（另含构件库预览、资产规范与限制、模型制作工作台三张只在控制中心的卡）；工具宿主只剩人物、面部两个摄影棚工具，旧地址 `Tool_Studio.html?tool=assetStandards` 转到新页。
- **2026-11-23**：特效预览与音效音乐拆为独立窗口（`Tool_VfxPreview.html`、`Tool_AudioPreview.html`，共用窗口壳 `Script_ToolWindowShell.mjs`、入口类 `Script_EditorMediaEntry.mjs`），从游戏灯光 / 后处理 / 天空 / 材质库 / 关卡数据解耦：音效窗口只装 `AudioEngine` 与固定听者，零渲染依赖；特效窗口装 `VfxSystem` + 中性预览台 `Script_VfxPreviewStage.mjs` / 预览灯 `Script_VfxPreviewLights.mjs`（与游戏共用 `Script_EffectLightEnvelope.mjs`、`Script_ToneMapCurves.mjs`）+ 昼夜读取项目环境预设 `Script_VfxPreviewEnvironment.mjs`（`Environment/EnvPreset_*.json` 的 looks，不写死时段）。共享预通道标记（`Script_RenderTags.mjs`）、太阳阴影采样（`Script_SunShadowSampling.mjs`）、体积噪声（`Script_VolumetricNoise.mjs`）与烟场样式（`Data_SmokePlumeStyles.mjs`）从重模块拆出，也顺带让主菜单包去掉了整条后处理与灯光链。游戏内回归测试（`?editor=vfx`、`Debug.OpenEditor("vfx")`）经 `VfxPreviewEntry.harness` 保留原游戏宿主口径；旧 `Tool_Studio.html?tool=vfx|audio` 重定向至新页。控制中心现有 4 项使用工具宿主（`actor facial props assetStandards`）、11 项开独立窗口（另含模型制作工作台共 12 张独立窗口卡）、2 项走游戏入口。
- **2026-11-28**：音效音乐（`audio` / `Tool_AudioPreview.html`）彻底切出游戏高级工具菜单、拆分边界与运行时，改为 `ControlCenter` 独占独立工具（`Data_AdvancedTools.STANDALONE_TOOLS`，归入 `media` 分组 `vfx` 之后；旧地址 `Tool_Studio.html?tool=audio` 仍重定向并保留 `?audio=` 参数）：从 `Data_DevTools`、`Script_DevToolsSplit`、`Script_EditorMediaEntry` 移除 `audio` / `AudioPreviewEntry`；清除 `Script_Editor` 中已失效的 `activeId === "audio"` 特判；`Script_EditorAudio` 改从 `Data_AdvancedTools` 读取名称与提示、脱离 `Data_DevTools`；`ToolWindowShell` 改用 `SetMasterVolume`（仍读写 `tengxian1938_tools_volume_v1`，不再调核心引擎的 `SetToolsVolume`；`SetToolsVolume` 仍保留供游戏内 `Script_Editor`、`Script_EditorBlockout`、`Script_EncounterPlay`、`Script_ToolStudio` 使用）。改动后游戏菜单 15 项（13 项拆分、2 项游戏内；`media` 组本地仅剩 `vfx`，发布构建中该组消失），控制中心共 22 张卡片（含 7 项 `STANDALONE_TOOLS`）。

## 精简测试界面

所有设置、编辑器与渲染调试只展示选择对象、核心操作、必要参数和少量测试结果。
实现原理、源码路径和长篇解释留在文档，不放在面板正文；失败、不可用和保存结果仍需明确提示。
渲染调试保留视图/着色/碰撞体开关，移除“当前靶”诊断表；详细检查继续通过调试 API 和验收脚本读取。
人物动作保留资产/程序化动作、播放、单帧和速度，不再展示连续状态的手动混合滑杆。
完整场景面板只保留场景、机位、路线叠加和环境切换，移除只读 JSON 与种子列表；数据仍供验收脚本查询。
各工具的结果表通过 `Facts(parent, keys)` 明确列出核心字段；性能耗时表本身就是测试结果，保留（资产规范表 2026-11-25 起在控制中心的独立配置器里）。

## 怎么进

| 路子 | 什么时候能用 |
| --- | --- |
| 菜单 设置 → 高级工具 | 主菜单或暂停菜单。右栏按 `Data_DevTools.TOOL_MENUS` 分组列出全部工具（清单与文案在 `TOOL_INFO`，编辑器的 `static label / hint` 与 `window.open` 参数也读它）。独立工具在新标签页打开，其余在游戏宿主内打开，标题菜单的单工具链接为 `?editor=tools&tool=<id>`。从独立标题菜单打开高级工具总入口时，本地进控制中心，发布版进游戏内工具首页。暂停菜单进来的退出后回设置页 |
| 菜单 设置 → Debug工具（右栏） | 暂停菜单（Esc）。勾上后「继续」即可边打边看；暂停菜单开着时开发工具层整层收起 |
| 高级工具菜单栏 → Debug工具 | 高级工具开着时（含工具首页）。同一套开关，开完退出高级工具照样留着（keepOnClose） |
| 点右上角齿轮 | **没拿指针锁**的时候（开局那张「进城」页、或玩家按过 Esc）；打开的是高级工具 |
| 按 `` ` ``（Backquote） | 任何时候（玩家设置页开着时除外）。打游戏当中这是唯一的入口 |
| `window.Tengxian.Debug.OpenEditor("actor")` / `Debug.ToggleDebugTool("debugRendering")` | 测试与自动化 |

指针锁一挂上，浏览器就把所有鼠标事件路由给 canvas，DOM 上的按钮谁也点不着 ——
这不是 bug 是指针锁的定义。所以 `` ` `` 那条路在开面板时会顺手交还指针锁。

Esc：下拉菜单开着时只收菜单，否则退出高级工具；过场正在播时 Esc 归过场（跳过），不会顺手把编辑器也关了。

### 游戏内工具首页

本地 `?editor=tools` 总入口转到 `AdvancedTools/ControlCenter.html`。本地带 `tool`、关卡或测试场参数的链接仍进游戏宿主。本地可用 `?editor=tools&menu=0` 直接打开游戏内工具首页，Pages 发布版的 `?editor=tools` 总入口也在这里。

从标题菜单进高级工具**不建任何关卡**：PHASE_TABLE 换成 `Data_ToolsHome.TOOLS_HOME_PHASE` 一片空地
（`Script_ToolsHomeField`，只为引擎有地方站），画面由整页的工具首页（`Script_EditorHome`）盖住，
按菜单栏同一分组列出全部工具，等人自己挑。

- 摄影棚类工具（人物、面部）在首页上打开（构件库预览、资产规范 2026-11-25 起只在控制中心）。Esc 先回首页，首页上再按 Esc 回标题菜单。
- 场景编辑器卡片标 ↗，点了直接开独立窗口，不用载入关卡。
- 场景类工具（样条、PCG 撒点）卡片标「载入关卡」：先弹单子选七章之一，
  再整页换到 `?phase=N&editor=tools&tool=<id>`，载入完自动打开那个工具（菜单栏里点它们也走这张单子）。
  （原场景关卡 / 地形 / 采样点同样走这张单子，完整场景预览另有三选一：2026-10-31 用户要求删除，已不存在。）
- 带关卡参数的老入口（`?phase=2&editor=tools`、`?whitebox=p012&editor=tools`）照旧：先建那一关再开工具。
- 回归：`node Taierzhuang1938/Script_TestRunner.mjs --only=ToolsHomeTest`。
工作窗（Inspector）右上的 × 只关当前工具、回到空 Inspector，不退出高级工具。
菜单栏右端只有「返回主菜单」文字按钮（`.edMenuMainMenu`，2026-11-05 起；2026-11-05 用户反馈 ⏻ 和「退出高级工具」重复，而白盒编辑器、第一关等页面上一直没有「返回主菜单」，随后要求删掉「关闭当前工具」「退出高级工具」两个入口，并把 ⏻ 换成「返回主菜单」，取代 2026-10-22 那套「× + ⏻」的设计）：
所有页面都有；在带活场景主菜单的标题页里页内打开主菜单，其他页面（白盒编辑器、正片第一关、各测试场、工具首页）整页回到干净的标题页（`SandboxUrl` 去掉 editor / level / kf / tool 等参数）。
没有「游戏」菜单、没有菜单栏 ×、没有 ⏻：退出高级工具 = Esc / `` ` ``；关工具用工作窗右上的 ×，或再点一次菜单里打勾的那项（`TogglePanel(false)` / `CloseTool()` 接口保留）。
标题栏 × 左侧的无边框右箭头隐藏 Inspector，保留当前工具、装备、视角、参数及滚动位置，玩法继续暂停；
菜单栏「返回主菜单」左侧的左箭头恢复原面板。两个图标按钮沿用关闭按钮的尺寸、颜色与悬停效果，保留操作提示与无障碍名称。
选择另一个工具或重新进入高级工具时自动展开。
空 Inspector 同样可收起；独立调试浮窗及玩家设置不参与折叠。

## 一次只开一个

互斥编辑器里多数要接管相机（摄影棚 `cameraMode="studio"`、自由飞行 `"fly"`；2026-10-31 删掉场景关卡 / 地形 /
完整场景预览 / 采样点 / 可破坏场景后，菜单栏里剩十二个互斥编辑器，另有一个不进菜单的「出图机位」），过场时间轴还要把相机交给过场导演。
同时开两个的结果是两边每帧各写一次 `camera.position`，画面会抖。
所以菜单栏里的工具虽然是勾选项，语义是**换到这一个**：开新的自动关旧的；再点一次打勾的那项就关掉它。
不接管相机的（音频 / 过场时间轴；资产规范 2026-11-25 起已不在游戏里）也走同一条互斥路 —— 它们改的都是
这一局的运行时状态，退出时得各自收干净。可叠加的六个工具不在这条规矩里。

## 设置不在高级工具里

**它们不是一回事。** 设置改的是玩家自己的偏好、要落盘、与这一局无关；
编辑器改的是这一局的运行时状态、退出时必须还干净。2026-10-13 起画面 / 声音 / 操作三页
只从菜单「设置」进，宿主是 `Script_SettingsHost`（标题菜单与游戏共用，画在 `#settingsRoot`），
高级工具里不再有它们；剔除开发工具后它们照常工作。页面类仍在 `Script_EditorSettings`。

### 画质 `Script_EditorSettings.GraphicsSettings`

TAA 开放当前帧权重、抖动幅度和锐化；GI 开放采样偏移、反射遮蔽及光照/遮挡历史权重；太阳阴影开放深度偏移、法线偏移和覆盖半径。面板仅用短标签与数值，全部即时应用并随偏好保存，恢复出厂同时恢复这些参数与当前档位的阴影分辨率。GI 仍需 medium 及以上档位；low 面板给出一行提示。


存 `localStorage` 键 `tengxian1938_graphics_v1`，**开机时装回去**
（`ApplySavedSettings`，`Script_Main` 建 `SettingsHost` 时调，标题菜单同样）——只在打开面板时才生效的
设置不叫设置，那叫开关。

- **渲染分辨率**是唯一真正省时间的一根：整条合成链（法线深度、AO、泛光六级、
  体积光、运动模糊）都按 post 靶的尺寸走，减半就是省掉四分之三。它改的是
  `post.SetSize()`，不是 `renderer.setPixelRatio` —— 最后一 pass 照样铺满屏幕。
- **后处理强度一律是倍率**，乘在天光预设算出来的值上。预设决定这一关长什么样
  （曝光、雾色、泛光阈值是美术意图），设置只决定画多重。两件事混在一张表里的
  下场是玩家把画质调低之后夜战关变成纯黑 —— 那一关的 `exposure` 是 3.6，被当成
  画质项一起压了。
- **开关阴影不重编译**（2026-09-11 改）。原来它翻 `renderer.shadowMap.enabled` 并把
  全场材质 `needsUpdate = true`：那一位是编译期的 `#define USE_SHADOWMAP`，在 cache key
  上，翻一次等于把上百个 program 删掉重编 —— 城里实测**那一帧 25~30 秒**（不是毫秒），
  正是玩家说的「点一下阴影卡好一会儿」。现在总闸走运行时：
  `lights.SetShadowsEnabled()` → 逐级 `shadow.intensity = 0`（`CsmSunVisibility` 开头
  按这一位早退，整套 blocker search + 盘抽样都不跑）+ 不再点 `shadow.needsUpdate`
  （三方 `WebGLShadowMap.render` 整趟早退，烘焙的 draw call 一个不剩）。
  省的东西一样，翻转的代价是零个新 program。看门狗在 `Script_CsmTest`「阴影总闸」两条。
  同一条闸顺带管住接触阴影与英雄光阴影（后者仍是编译期的，但出厂就关）。
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
音效编辑器要在暂停时试听，Timeline 要听得见预演里的台词与音效。已经在飞的一次性音
（最长两秒的尾巴）让它响完，硬掐会「咔」一声。

一处容易漏的接缝：音效编辑器 `Exit()` 会把环境床与音乐还原成进来时那一份，
而那时候游戏**还停着**（面板还开着）。所以它还原完要再 `StopBackground()` 一次，
真正的恢复由离开暂停时的 `SetPaused(false)` 按 `pausedState` 做。

玩家可以在音效设置里关掉这条（「暂停时静音背景」），关掉之后 `SetPaused` 直接短路。

## 打开编辑器 = 暂停玩法

`Script_Main.Frame()` 看到 `editor.Capturing` 就只走
`editor.Update` + `RenderScene`，玩家、AI、特效、剧本全停。

同时做三件善后：交还指针锁、收起 HUD（`body.edHideHud`，过场自己的 `.csRoot` 留着）、
把键位路由闸掉（`OnAction` / `Guard` 里判 `editor.Capturing`；不闸的话在编辑器里按 R
会真的去装填，而那是在一个暂停的世界里改状态）。

从主菜单或暂停菜单点进任意一个**编辑器**时，`EditorSuite.Open` 会先收起整棵菜单；
编辑器画面里不能残留“继续／设置／调试选项”。退出编辑器后按进入时记下的层级回到主菜单
或暂停菜单。画质、音效和按键设置不属于编辑器，允许继续显示在暂停菜单上。

## 编辑器与取证工具

### 人物面部 `Script_EditorFacial.mjs`

独立摄影棚工具，高级工具「角色」菜单里的「人物面部」。按角色筛选配套对白，支持真实录音同步口型、字幕、波形、逐帧、慢放、循环选句、近景角度和中性表情对照。表情关键帧与检查备注可本地保存、导入导出；无面部骨骼的角色明确标注。资产范围及验证见 [人物面部编辑器](Data_FacialEditor.md)。

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

### 枪械检查台

ControlCenter → 武器 → 枪械检查台打开独立窗口 `AdvancedTools/Tool_WeaponInspection.html`。游戏的高级工具菜单使用相同窗口入口，旧的 `Tool_Studio.html?tool=weapon` 跳转到新页。

左侧按名称或编号找模型。中央正交视口用左键拖动旋转、右键拖动平移、滚轮围绕鼠标指向的位置缩放，视口聚焦时按 Home 适配。触屏单指拖动旋转，双指捏合缩放（以捏合中点为锚）并同时拖动平移，双击适配。比例尺随相机倍率更新，放大到最细可显示 1 mm（0.1 cm）。网格和挂点可以切换。支持刺刀的模型提供独立附件预览。右侧显示模型文件、实际三角面数和台架包围盒的毫米尺寸。

视口上方切换渲染通道，默认显示完整材质与台架照明。法线与切线用 RGB 表示视空间方向，法线含法线贴图，切线取顶点数据或 UV 推导，缺少有效切线时显示中灰。Albedo 显示底色，Roughness、Metallic、AO 显示材质灰阶，未带 AO 的部件显示白色。Reflection 将环境镜面反射提亮显示，Shadow 显示台架主灯的阴影可见度，白色无遮挡，黑色遮挡。换模型时沿用当前通道，可在同一机位对照各通道。

视口下方的「环境光」调节环境漫反射和镜面反射，默认 180%，100% 为原台架照明。外观、第一人称和材质球共享该设置，Shadow 继续显示主灯遮挡。

顶栏默认选「单视口」。「双视口」在左边打开原画视口，右边继续显示同一模型。可一次选取或拖入多张本地原画、贴图，点击缩略图切换。原画支持滚轮及 ± 缩放、放大后拖动查看、Home 或「适配」复位。每张图记住本次检查的缩放与位置，切回单视口再打开仍可继续。图片在当前标签页本地读取。

右侧把模型概况、网格渲染器与材质分区。概况突出总三角面和三轴尺寸。网格渲染器可选部件，读出顶点、三角面与各子网格。点击子网格行会在外观视口高亮所选子网格并打开对应材质，再点一次取消高亮。视口下方的「线框」可查看三角面拓扑。「材质」可独立选择，材质球使用同一份运行时材质。常用数值集中显示在材质球下方，随后列出贴图的文件名、像素尺寸、色彩空间和 UV 通道。

台架复用游戏的尺寸、模型和 PBR 材质，使用独立中性灯光。架设武器按检视姿态落地，车辆保留节点树。视口左上方的「第一人称持枪」为步枪、轻机枪和手枪提供 16:9 的站立持枪预设。预设使用游戏的 Viewmodel、双臂、持枪位置和存档视野角度，默认 55°。切回「外观」会恢复同一模型的外观机位。换手持枪械时沿用预设，换到其他模型时回到外观。检查台保持只读，视口状态在当前窗口内生效。第一人称动画检查走下方的「第一人称持枪检查」。

验收命令为 `node Taierzhuang1938/Script_AdvancedToolsBrowserTest.mjs --only=weapon`。台架四格和 HUD 剪影从同一检查台读取模型，脚本为 `Script_WeaponShot.mjs` 与 `Script_HudWeaponSilhouette.mjs`。

### 第一人称持枪检查 `Script_EditorFirstPerson.mjs`

这是后续第一人称手位与枪姿调整的固定基础检查，不是第二套 Viewmodel。玩家视角直接显示
正片相机下的最终结果；外部检查把**同一棵** Viewmodel 临时移到摄影棚，允许从右后、左后、
枪口和俯视四个固定机位检查，也可拖动环绕。装备表覆盖当前可进入第一人称视模的步枪、轻机枪、
手枪、手榴弹/集束手榴弹与近战武器，动作按钮仍调用正片的开火、拉栓、装填、白刃和投掷接口；
有射速的枪多一个「连续开火」，可上刺刀的枪多一个「上刺刀预览」（切换 `Script_Viewmodel` 的同一件模型，换装备即收起）。

「放大准心校准」（2026-10-31 从枪械编辑器搬来，只给步枪 / 轻机枪 / 手枪）只在玩家视角下生效：「进入校准」切到玩家视角 + 开镜，
FOV 按正片相同的 `adsFovScale` 收窄。红十字是枪口真实弹道在屏幕上的固定中心；左键拖动画面或用 X/Y 滑杆移动铁瞄，
直到准星尖与红十字重合。读数采用 900p 基准像素，拖拽会按当前画布高度自动换算。校准覆盖只活在编辑器这一轮里，
退出时 `Viewmodel.Equip` 清掉它，不会破坏正常战斗“准心、弹道、机械瞄具共用屏幕中心”的规则。专项闸门 `Script_ReticleCalibrationTest`。

可视化分三层：TZM 武器节点提供 `muzzle / gripR / gripL / sight / magazine` 的真实位置；
`HandRight / HandLeft` 是运行时 IK 目标坐标系；蒙皮骨架用真实指骨构造的 `RuntimeFpsGripR/L`
是最终掌心。彩色挂点、坐标轴、白色掌心和两条残差线同时显示，面板另报位置/角度残差与臂长
拉伸。残差小只说明“解算追到了目标”，**不表示目标方向、肩肘平面或最终轮廓在人眼看来正确**，
所以外部视角截图仍是必验项。

工具没有滑杆写回、保存姿态或覆盖常量的入口；退出会恢复 Viewmodel 父节点、局部变换、玩家武器、
外观变体与刺刀状态。自动化入口是 `Debug.OpenEditor("firstPerson")`，随后可调用
`SetWeapon / SetView / SetInspectPreset / SetPose / Snapshot / EnterCalibration / SetCalibration`；固定出图入口是
`Script_FpsGripEditorShot.mjs`，加 `--all` 可把全部 15 项的玩家/右后外部视角一次拍完。

「骨骼动画时间轴」列两类片段：Blender 导出的骨骼片段（如汉阳造「持枪呼吸」），以及可检查的
程序动作（当前是白刃，大刀显示为「大刀劈砍（程序动作）」，值为 `action:melee`）。程序动作不另写
动画：时间轴给正片动作设 `action.hold`（0..1），`Viewmodel._StepAction` 就不推进、不收招，每帧照常
从 `_ResetAnimatedParts` 起按这个进度重算，按 60 fps 计帧。拖动 / 逐帧后会按同一进度多走几步，
让带历史限速的肘平面落定。投掷（会真扔出手榴弹）和装填（提交弹药、发声）不进时间轴。
`Debug.FirstPersonAnimation({ weapon:"Dadao", clip:"action:melee", normalized:0.46 })` 与面板同一条路。

### 第一人称持枪移动检查（2026-11-13 删除）

按用户要求删除工具、热键、观察机位、慢放和主循环接线。

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

### 环境窗口（2026-11-13）

入口为设置 → Debug工具 → 环境，或高级工具菜单栏里的 Debug工具 → 环境。
`Script_EditorEnvironmentWindow` 打开独立的 `EnvironmentEditor.html`，窗口内的 `Script_EnvironmentWindow`
复用 `EnvironmentEditor`、组件参数视图、昼夜时间轴、撤销和带 revision 的存取接口。
目标列表可加载两个场景与登记的正片关卡配置。目标与宿主当前场景相同时连接同一环境系统，修改参数立即参与游戏出画。
白盒内部的共用控制器继续处理关键帧时间和外部文件同步。

### Timeline 过场 `Script_EditorTimeline.mjs`（2026-10-31 重做）

2026-11-13 核对：`Timeline/FirstLevelOpening.timeline.json` 是独立的过场编排源文件，包含 7 段子序列。旧版 01–05 的白盒预演与试玩通过 `OverlayTimelinePreviz` 读取这份原件并共用 `BlockoutPreviz` 播放器。正式第一关仍由 `FirstLevelMissionRuntime` 调用 `FirstLevelOpening` 等导演模块，运行时尚需接入统一的 Timeline 资源播放接口。

**旧版已删**：原来的 Timeline 驱动 `CutsceneDirector` 播 7 场分镜式过场（序章《出川》、第一关关中
《空地上的三个人》、旧战役五场）。2026-10-31 用户：7 场都过时了，连同播放器、`?preview=` 页、
关首 / 关末 / 关中过场入口一起删掉（第一关正片早就一场都不播了）。

**现在**：一个融合 UE Sequencer / Unity Timeline 思路、**以 agent 为主、人为辅**的过场时间轴。

- **数据**：`Timeline/<Id>.timeline.json`（schema `tengxian-timeline/1`），登记在
  `Script_TimelinePlan.TIMELINES`。一份 Timeline = 按顺序首尾相接的几段**子序列**
  （Sequencer 的 Shot / Unity 的 Control Clip）；每段就是一段白盒预演（字段口径
  [白盒编辑器 §14.1](Data_EditorBlockout.md)：镜头轨、演员键、台词、事件、飞机、慢动作），从自己那个关键帧的布设起播。
  现有一份 `FirstLevelOpening` = 第一关开场 01-1…02-3（7 段，Notion 01–02 第四版）。
- **原件，不是拷贝（2026-11-01）**：用户「接入到白盒编排 / 编辑器里去，试玩 / 预演就可以直接播放这一段，而不是再做一次」。
  `TIMELINES` 里写了 `ownsPreviz: true` 的 Timeline 是本关这几个关键帧预演的原件：
  - 白盒编辑器读本关预演时，这几个关键帧的段换成 Timeline 的（`Script_TimelinePlan.OverlayTimelinePreviz`，
    `Script_EditorBlockoutPreviz.Load` 每次连 Timeline 文件一起读，2 s 一查，改了就重读）——卡片上的预演按钮、N 键、
    试玩里「看」的那几步播的都是 Timeline，`Previz.State().ownedKeyframes` 报哪几段来自原件；
  - 本关的预演生成器（0105 的 `BuildPreviz({ config, voice, timelines })`）写 `Blockout/FirstLevel0105.previz.json` 时同样整段抄，
    磁盘上那份与播的一致，0105 PrevizTest 的台词 / 说话姿态 / 歇着的门禁照样查这几段；
  - 改这几段只改 `Timeline/FirstLevelOpening.timeline.json`，改完跑一次生成器 `--force` 让磁盘上的预演跟上；
    CLI `sync`（从预演往回拷）对原件拒绝执行。没写 `ownsPreviz` 的（`new` 建出来的）仍是拷贝，`copiedFrom` + `sync` 照旧。
- **不另写播放器**：播、停、拖、逐帧全走白盒编辑器里那一个预演播放器（`Script_EditorBlockoutPreviz`）。
  面板用 `UseSource(doc)` 把它的数据换成 Timeline 那份，按主时间轴调 `Play / Seek / Pause / Resume`；
  预演的 Seek 是确定性求值，拖到 41.2 s 就是那一帧。跨段时先从那一段的关键帧起播再 Seek；
  播放中一段播完自动接下一段。关掉面板 `UseSource(null)` 还回本关自己的预演文件。
- **入口**：高级工具 → 关卡 → Timeline 过场。它和白盒关卡编辑器一样是跳转入口：整页换成
  `?editor=blockout&level=<关卡>&timeline=<Id>`；已经在白盒编辑器里就只开面板。
- **界面**（人用，越简单越好）：白盒编辑器底部一条面板，导航栏与小地图让开。头一行：名字、当前段、
  走带（回到开头 / 上一镜 / 上一帧 / 播放暂停 / 下一帧 / 下一镜）、时码 `mm:ss:ff`（30 帧）、核对状态、关闭；
  下面四条轨：**段**（子序列）/ **镜头**（每条 camera 一格，运镜保留的 `keepMove` 标蓝）/ **台词**（一句一条，长度 = 录音时长）/
  **事件**（白光、黑场、说明字、烟、震屏、慢动作画成区间，爆炸、音效、信号画成竖标）。点格子跳到格子开头，点空处或拖动跳到那一秒；
  悬停看时刻、内容和数据位置（`sequences[i].camera[j]`）。键：空格播放 / 暂停，`,` `.` 逐帧，Shift+`,` `.` 上一镜 / 下一镜，Home / End。
- **不做**：片段混合 / 淡入淡出叠片（两套播放器都不混合，画出来就和实际对不上）、曲线编辑器（机位只有起幅→落幅 + 缓动，
  游戏里几乎不做镜头动画）、多层子序列嵌套、拍摄记录与渲染出片（出图已有）。第一版只看不改，改内容改文件。
- **agent 用法**：
  - 命令行 `node Taierzhuang1938/Script_TimelineCli.mjs list | show [Id] [--segment=01-2] | check [Id] | sync [Id] | new <Id> --from=<Level> --keyframes=a,b,c`。
    `show` 按主时间轴列每段的镜头 / 台词 / 事件和数据位置；`check` 对着关卡配置与台词清单核对。
  - 改内容直接改 `Timeline/<Id>.timeline.json`，开着的面板 2 s 内重读并回到刚才那一秒。
  - 浏览器 `window.Tengxian.Debug.Blockout.Timeline`：`List / Open / Close / State / Play / Pause / Seek(t) / Step(frames) / StepShot(±1) / Reload / Layout / Tracks`；
    `State()` 给主时间轴秒数、时码、当前段与段内秒数、当前镜、正在说的台词、字幕、机位、核对结果与缺的动作 / 台词 / 音效。
- **门禁**：`Script_TimelineTest.mjs`（纯 Node，tier0Fast）、`Script_TimelineBrowserTest.mjs`（实机：开机打开、各轨格数、Seek 与预演播放器一致且确定、
  逐帧 / 下一镜、播放 / 暂停 / 跨段接播、按钮与点轨道、改文件重读、关掉还原）。

### 场景关卡 `Script_EditorScene.mjs`

> **已删除（2026-10-31 用户要求删除）**：`Script_EditorScene.mjs` 连同其中的地图参考标记、世界文档 / `worldEditDocument` 一并删除；
> 构件目录（`PLACEABLE` 等）搬到 `Script_PlaceableCatalog.mjs`，构件库预览继续用它。以下为历史记录。

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

> **已删除（2026-10-31 用户要求删除）**：工具、`?editor=fullScene` 入口与车厢静态布景（`CutsceneDirector.MountStaticSet`）都已删；
> `?phase=fullscene`（`Data_Menu.FULL_SCENE_PHASE`）作为不带工具的开发入口保留。以下为历史记录。

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

第一关视图入口为 `?whitebox=p012&fullSceneView=firstLevel&editor=fullScene&menu=0`。它不另建
切片，就是正式第一关（P012 白盒「往南的路」）那一片：`EnterLevel` 照常建好地形、布景与兵员，
但开机时收掉加载画面、不 `StartRun`，任务流程停在第 0 秒。六个巡场机位的看点取自
`MISSION_ANCHORS`（军列卸载 / 前沿阵地 / 村落内院 / 转运棚 / 后撤出口）加整体俯瞰，
高度按看点处 `GroundHeight` 抬升。县城 Spline 与种子不在这一片上，面板不显示；切回县城或
车厢时 URL 会清掉 `whitebox` 与 `missionStage`。

Spline、环境与种子三块 JSON 都用 `<details>` 默认折叠；列表与摘要读数始终可见，只有用户
主动展开或点击 JSON 按钮时才占用面板高度。

### 构件库预览 `AdvancedTools/Tool_PropLibrary.html`（只在控制中心）

2026-11-25 用户：构件库预览不需要植入游戏，做成独立的只读可视化器。游戏的高级工具菜单、`TOOL_INFO`、拆分边界
`Script_DevToolsSplit`、工具宿主 `Tool_Studio.html` 与 `index.html` 的 import map 里都不再有它；入口只有 AdvancedTool ControlCenter
资产组第一张卡片（`Data_AdvancedTools.STANDALONE_TOOLS`，与模型制作工作台同一类），旧地址 `Tool_Studio.html?tool=props` 转到新页。
原游戏内编辑器 `Script_EditorPropLibrary.mjs` 已删。

- 代码：页面 `Script_PropLibrary.mjs`（目录、筛选、读数）+ 三维台 `Script_PropLibraryStage.mjs` + `Style_PropLibrary.css`，版式同枪械检查台三栏。
  三维台自己建 WebGLRenderer、三盏棚灯、小房间 PMREM 反射、投影接收地面与自适应米格，**不建**游戏的后处理、天空、灯光组、人物与特效；
  材质库按工具宿主同一口径烘全部配方 + 外部 PBR 清单（`Data_ToolStudioPbrSets`）。外部道具加载器 `Script_ExternalProps` 经 TengxianCity / Water
  静态带进后处理等模块，只加载不实例化（`Script_AdvancedToolsTest` 守模块图里没有主程序 / 编辑器宿主 / 工具宿主）。
- 目录 = 构件目录 `Script_PlaceableCatalog.PLACEABLE` 的 tzm（武器、战车；持续烟火归特效预览）+ `ExternalPropCatalog()` 的外部 GLB，共 182 项。
  构件仍走正片同一套实例化（`InstantiateExternalProp` / `InstantiateModel`），不维护第二份预览几何；不写场景、不推进碰撞盒。
- **2026-11-25 清理**（用户：老第一关场景与启动界面都不再用）：26 个程序化构件（树、电线杆、院落小件、沙包封门、防空洞口、四合院 / 房屋 / 院门楼、
  牌坊等 16 个地标）从目录摘掉，生成器仍归旧滕县城；9 件建筑 / 饰件 tzm 不再进目录，其中窗棂 `WindowLattice`、门墩石 `DoorPier` 无人使用、连模型删除，
  其余 7 件仍由旧城 `Script_TrimProps` 用；滕县建造套件（`Model_TengxianConstructionKit.glb`、数据表与 Blender 重建脚本）整套删除；
  战场包的战壕地形 / 地面片 / 岩石与接收院的折叠包扎布从目录摘掉（共享 GLB 不重烘，节点仍在）。
- 界面：左栏搜索（名称 / 编号 / 文件）+ 来源筛选（GLB / TZM）+ 类别筛选（带计数，外部 GLB 按物体品类并入同一套类别，`车辆` `接收院医疗陈设` 等额外类别排在后面）
  + 占满整栏的分组列表（↑↓ / PageUp/Down 换项，地址栏 `?id=` 记住选择）；中栏视角（斜视 / 正面 / 侧面 / 顶视）、镜头（广角 / 标准 / 长焦）、米格、
  1.7 m 人高参照、重新取景、逐项浏览；右栏名称、编号、包围尺寸三格、三角面 / 网格 / 碰撞盒 / 可调参数 / 来源 / 署名 / tzm 说明，八九式中战车另有可动件演示。
- 取证口 `window.PropLibrary`（`entries` / `Select` / `stage` / `selected` / `visible` / `vehicle`）；门禁 `Script_PropLibraryBrowserTest`，
  火车两件的懒载与 PBR 由 `Script_TrainLibraryTest` 在同一页面上查。

### 资产规范与限制 `AdvancedTools/Tool_AssetStandards.html`（只在控制中心）

2026-11-25 用户：资产规范与限制完全从游戏里解耦，只作为**资产导出规范的配置器与预览器**——它产出的规范文件给资产导入 / 烘焙管线和验收门禁用，
游戏运行时不读。游戏的高级工具菜单、`TOOL_INFO`、拆分边界、工具宿主与 `index.html` 的 import map 里都不再有它；入口只有控制中心资产组第二张卡
（`Data_AdvancedTools.STANDALONE_TOOLS`），旧地址 `Tool_Studio.html?tool=assetStandards` 转到新页。原游戏内编辑器 `Script_EditorAssetStandards.mjs`
与游戏根的 `Data_AssetStandards.mjs` 已删。

- **唯一真相** `AssetPipeline/Data_AssetStandards.json`（`schema: tengxian.assetStandards`、`version: 1`）：枪械 / 战车分类上限、5% 免减面阈值、
  全场单帧预算 `sceneRenderLimits`、程序化 TZM 分类预算、指定特例、有源 TZM 逐件登记（`sourceAssets`）、外部 GLB 逐件登记（`externalGlb`）、
  规则卡（`otherRules`）与使用方清单（`consumers`）。agent 直接改它也行，开着的配置器 2 s 内同步。
- **判定公式** `AssetPipeline/Script_AssetStandards.mjs`（纯函数、零 import，第一个参数是规范文档）：`SourceTarget` / `ComplianceFor` /
  `ExternalComplianceFor` / `ValidateAssetStandards` / `FormatAssetStandardsJson`，配置器、本机存盘口与 Node 门禁共用；Node 侧读盘口是
  `AssetPipeline/Script_AssetStandardsNode.mjs`（冻结的 `SCENE_RENDER_LIMITS`、`EXTERNAL_GLB_STANDARDS` 等，BootTest、整关驾驶 Kit 与各资产门禁从这里取）。
- **实际面数**：有源 TZM 与程序化 TZM 读构建产物 `Model/Data_ModelIndex.json`（`_blender/BuildAll.py` 每次重建都重写它），不读游戏的 `Data_Meshes.mjs`；
  外部 GLB 的实际面数由各资产构建脚本实测后登记在规范里。
- **页面**：`Script_AssetStandardsTool.mjs` + `Style_AssetStandards.css`（自带样式，不加载游戏的 Style_Interface / Style_Editor / vendor）。
  三栏：左栏分类导航（总览、全局规则、七个分类，带件数与红黄点）；中栏是规则卡 + 搜索 + 状态筛选（全部 / 需处理 / 合规）+ 资产表
  （原始、实际、限制 / 目标与来由、降幅、预算占用条、自带 / 游戏内贴图、状态）；右栏是选中资产的推导说明（为什么是这个目标）与编辑表单。
  改任何数即时重算合规；地址 `#view=<分类>&id=<资产>` 可深链。
- **存盘**：本机预览服务的 `/__assetStandards/status|save`（闸同场景存盘口：本机 Host、同源、application/json、revision = 读文件时原始字节的 sha1，
  对不上 409；`ValidateAssetStandards` 不过 400）；静态服务 / 线上只读，改完「下载 JSON」。`Ctrl+S` 保存。
- **Blender 镜像**：`_blender/AssetBudgets.py` 目前仍手抄分类上限、5% 阈值与特例（用户 2026-11-25：Blender 管线暂时不动），
  `Script_AssetStandardsTest` 逐项对账，改了上限要同步那份。
- **门禁**：`Script_AssetStandardsTest`（规范与构建产物、Blender 镜像对账；游戏运行时不 import `AssetPipeline/`，配置器只 import 判定模块）、
  `Script_AssetStandardsSaveTest`（存盘口写盘 / 拒绝矩阵）、`Script_AssetStandardsBrowserTest`（真浏览器：入口、导航计数、筛选、编辑重算、只读退化、写盘与自动同步）。
  发布副本不含 `AssetPipeline/`（`PUBLISH_EXCLUDE` + `IsPublishedSource`）。

2026-11-01 删掉了构件库里只在这里用、正片和旧章都不建的条目：寨墙段、沙包路障、天主堂（旧通用版）、
清真寺，以及建筑与地标的「炮击初损 / 严重破坏」两档预建模战损（`BuildingDamageEarly/Severe` PBR 与
`AddBuildingDamageDetails` 近景细节层）。建筑仍按各自的 `damage` 参数出破损轮廓；要找回旧实现看 git 历史。

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

> **已删除（2026-10-31 用户要求删除）**：连同场景关卡一起删。以下为历史记录。

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

> **已删除（2026-10-31 用户要求删除）**：连同整套场景破坏系统一起删（见 [场景破坏系统](Data_Destruction.md) 顶部说明）。以下为历史记录。

直接进入七关的正式场景，调用正片同一套 `DestructionSystem.Hit/Blast` 检查墙面、
楼板、桥面与布景的耐久、局部破口、Rapier 碰撞拆分、残骸、掩体和导航重建。
`cityWall` / `rampart` / `ramp` / `tower` 是承重白名单，编辑器会用蓝色碰撞框标出，
再高的测试能量也不会拆除。

进入时抓取“视觉 + 碰撞 + 耐久 + 导航”快照；按 R、点「复原预览」或退出时都会
完整恢复。只清 shader 破口不算复原，因为那会留下看不见但可穿行的物理洞。

### Debug Rendering `Script_EditorDebugRendering.mjs`（叠加层）

不接管相机、不暂停玩法，负责把当前帧的渲染靶直接送到主画布。与 Profiler 一样
`static keepOnClose = true`：**退出高级工具、回去打仗都不收它** —— 运行时才复现的渲染 bug
（第一人称手上的暗块、移动中的雾/AO 闪烁）只能开着调试视图边打边看；材质假彩色
uniform 与送屏视图都原样保留，浮窗留在画面左侧照常刷新。要停：设置 → Debug工具 里再点一次
「Debug Rendering」或叉掉浮窗（送屏回到最终画面）。暂停菜单开着时浮窗随开发工具层收起，继续后还原。
`Script_EditorTest` 两条断言各守一头。除 GBuffer、材质、
光照与 GI 外，「后处理」分组还把三段容易串线的结果拆开：`Bloom 提取` 是阈值/软膝后的
半分辨率亮部，`Bloom 合成` 是正式 Composite 真正采样的多级叠加靶；`雾量` 从
NormalDepth 和本帧 Composite uniforms 重算距离雾×高度衰减，`景深 CoC` 以同样方式
重算散焦系数。`Motion Vector` 也由同一份深度与前一帧相机矩阵重投影，明确标作相机速度：
当前管线没有逐物体速度缓冲。光照组则能在材质着色器内部截取正式 `reflectedLight` 的
直射漫反射、直射镜面、IBL 反射和 GI/IBL 间接漫反射四条贡献。雾/CoC/Motion Vector
不另建全分辨率调试靶，避免只为编辑器多占显存；蓝→暖黄的假彩色明确显示 0→最大效果量。
景深只在阵亡镜头触发，未触发时 CoC 视图保留深蓝底而不是黑屏。

**着色模式**（面板顶部，Unity Scene 视图 Shading Mode 那三档，`PostPipeline.SetShadingMode`）：
`着色` 是正片；`着色线框` 在主场景画完后用一份 `MeshBasicMaterial({ wireframe })` 覆盖材质把场景
再画一遍进**同一张** hdr 靶（吃主场景的深度，进 TAA 与合成，是「带线的正片」）；`线框` 不画着色场景，
hdr 靶清成深灰再画亮线，`final` 视图改为把 hdr 靶 0-1 直通送屏 —— 不过曝光 / 雾 / 泛光 / 调色，
TAA 抖动同时停掉（1 px 的线会逐帧爬），其它视图不受影响。线框那一趟藏掉 `allowOverride === false`
的材质（烟、火、粒子、天空穹、水面）、`skipNormalDepth` 的对象与 Points / Sprite / Line ——
覆盖材质换不掉它们，再画一遍只会把加性粒子叠亮一倍；第一人称照常出线（深度压缩是节点缩放，
不在材质里）。贴在面上的线靠 `Script_Post.InjectDepthPull`（视空间朝相机缩 0.2%–0.3%）赢过面的深度；
**别改成常数 NDC 偏置**，那在 100 m 处等价于十米，墙后整条街的线都会透出来。

**物理 · 碰撞体线框**（`ColliderWireframe`，挂成 `post.debugOverlays` 里的一棵 Object3D，主场景之后、
TAA 之前用同一张 hdr 靶与深度再画一遍）：画的是 Rapier 世界里**实际存在**的碰撞体 —— 逐只读
`collider.shape`（长方体 / 胶囊 / 球 / 三角网）与世界位姿，按刚体类型与形状分五类着色（静态实体绿、
地形块黄、角色胶囊青、动态刚体橙、传感器品红；图例与 `COLLIDER_CATEGORIES` 同源）。破坏摘掉的不画、
编辑器新加的会出现、地形炸出来的 trimesh 也在。静态层只在成员变化时重建（碰撞体总数一变或每 60 帧
全扫一遍 `world.colliders` 对账缓存句柄），动态层每帧直接走 `physics.characters / dynamics`。
相机所在的那只角色胶囊不画：第一人称时它前面那根竖棱正好是一条贯穿屏幕正中的竖线，像个坏掉的准星；
自由飞行镜头离开身体后照常出现。「透视」关掉深度测试隔墙看，五个分类各有开关。不用
`world.debugRender()`：它每帧把一万多只静态盒整份拷出 wasm，而且只按刚体类型给色。
叠加层不进场景图，预通道 / SSAO / 假彩色重画都看不见它。Exit 必须把着色模式还回 `shaded`、
摘掉叠加层并 dispose 几何 —— 冒烟末尾「关掉之后有没有还干净」那一节盯着这两项。

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

### WorldInfo `Script_EditorWorldInfo.mjs`（叠加层，独立窗口）

入口：设置 → Debug工具 → WorldInfo。独立窗口实时显示当前玩家脚底世界 XYZ、偏航和俯仰角、地形高度、脚底距地形、眼高和视点世界高度，以及水平/垂直速度、姿态和接地状态。位置/高度以米计，旋转以度计。地形高度沿用玩家当前 world 的共享采样器；距地形不等于距楼板或道具。

只读玩家控制器，不跟随编辑器/过场相机，也不修改角色。读数每 0.1 秒刷新；场景加载时清空旧数据。退出高级工具或切换其他编辑器时保留，关闭独立窗口或在 Debug工具里再点一次时退出；宿主页面离开和套件销毁时关闭窗口。浏览器拦截弹窗时开关恢复关闭。

### 玩家状态 `Script_EditorPlayerState.mjs`（叠加层，独立窗口）

入口：设置 → Debug工具 → 玩家状态。独立窗口（`window.open`，游戏拿着指针锁时照样能看）实时显示 HUD 不给出的玩家状态，分七组：生存（血量、失血、伤口、绷带、包扎回血、腿伤/臂伤系数、出生保护与剧情无敌剩余）、受击与压制（压制、闪红、受击晕眩）、体力与呼吸（体力及上限、冲刺、屏息、水深、搬运移速）、姿态与移动（姿态过渡、换姿被拦原因、接地、跳跃/翻越、侧身、架枪）、瞄准与散布（开镜量、自由瞄准偏角与上限、后坐余量、摇摆、散布真值、连射扩散、枪口贴墙）、武器与弹药（槽位、弹仓、手榴弹、攥弹、射击冷却、刺刀、白刃蓄力、第一人称动作）、控制与调试（控制权、搬运、机枪位、白刃镜头、无限弹药、穿墙/快速/无敌）。

字段是文件里的 `GROUPS` 一张表，加一项加一行；读取容错，缺的字段显示「—」。`PlayerController` 身上没有的（射击冷却、剧情无敌、搬运、机枪位、第一人称动作、无限弹药）由 `Script_Main` 的 `game.PlayerRuntime()` 交出只读快照。只读、不改角色；每 0.1 秒刷新，值变了的那一行闪 0.6 秒；「冻结读数」停在当前帧，「复制快照 JSON」把全部读数放进剪贴板。生命周期与 WorldInfo 相同：退出高级工具保留，叉掉浮窗或在 Debug工具里再点一次退出，弹窗被拦时开关复位。回归口 `Script_PlayerStateEditorTest.mjs`。

### 敌军 AI `Script_EditorAi.mjs`（叠加层）

入口：设置 → Debug工具 → 敌军 AI。与 Debug Rendering / Profiler 同在 Debug工具：不接管相机、不暂停玩法、
不碰指针锁，`static keepOnClose = true` —— 它要看的东西（谁选了哪个掩体、谁探头、谁拿到攻击令牌）
**只在打仗时存在**，关掉菜单回去打正是主用例。停它：Debug工具里再点一次，或叉掉浮窗。
设计口径与验收在 [Data_EnemyAi.md §14](Data_EnemyAi.md)。

六个分节用 Chips 切页，DOM 常驻（冒烟按 `.edPanel.ai [data-page]` 数得到六个）：

| 分节 | 有什么 | 读的是谁 |
| --- | --- | --- |
| 概览 | 存活/掩体/令牌/射线每秒/压制:瞄准/探头的读数板 + 状态、任务、警戒三张横条直方图 | `AiDirector.DebugState()` |
| 行为图 | `Data_AiBrainGraph.BRAIN_GRAPH` 画成 SVG：节点=状态（显示当前人数）、边=转移（`when` 在 title 里）；选中的兵所在节点与他最近走过的边高亮；**点边跳到「调参」里那根滑杆并闪一下** | `BRAIN_GRAPH` + `DebugState().states` + `stateLog` |
| 单兵 | 按到相机距离排序的活人列表（前 40）、「跟随最近的敌人」开关、`DebugSoldier` 全字段读数、30 s 状态时间带 | `AiDirector.DebugSoldier(s)` |
| 世界 | 七个图层开关 + 掩体点色例 + 开销读数；「头顶标签」直接开关 `?aidebug=1` 那套 DOM 标签 | 见下 |
| 调参 | 五张表的数值叶子自动列成滑杆（布尔给开关），按表 Chips 切、按导出名分节；「重置到文件值 / 复制 mjs 片段 / 保存到源码」 | 见下 |
| 试验场 | 「撒一个班（对面有墙）/ 玩家无敌 / 清场还原 / 重置本局 AI 记忆」 | `Script_AiProbeScene.mjs` |

**世界叠加**画的是：选中者的标杆、水平视锥（半角 = `FOV.halfAngleDeg[警戒] × stanceScale[姿态]`，
远弧在当前 `SightRange` 上、近弧 15 m，脚下一圈是 `omniRadiusM`）、到目标的通视线（通=绿/挡=红）、
LKP 十字、掩体的隐蔽位/射击位/法线、`task.point`、班组连到本班重心、相机 60 m 内的掩体点
（验证过=绿 / 选上未验证=黄 / 被占=蓝 / 无=灰）。

三条实现纪律，改的时候别破坏：

- **线段与点不进 `scene`。** 走 `post.AddDebugOverlay`（没有后处理管线时才退回 `scene.add`）——
  进了场景图会被预通道当几何写法线、被线框着色模式的覆盖材质换掉、被 SSAO 当遮挡物。
  查「挂上了没有」用 `tool.OverlayAttached()`：post 那条路是一个 Set，`root.parent` 永远是 null。
- **每帧只写属性，不建对象。** 两块预分配的 `BufferGeometry` + `setDrawRange`；`Nearby` 与掩体点的
  地表采样一起限流到 0.5 s、最多 400 个点；面板 DOM 4 Hz、行为图 2 Hz。实测每帧 0.1–0.2 ms。
- **曝光补偿峰值压到 0.75**，不是补满 1.0。补满会被 ACES 拉成白色，「绿=通视/红=被挡」这类
  靠颜色说话的层当场作废（实拍过）。

**调参**枚举五张表（`Data_Tuning_Ai` 只收 `BRAIN / ENGAGE / SQUAD`，其余四张全收）的 270 个数值叶子。
两条枚举口径：同一个对象只列一次；**凡是自己有导出名的对象，聚合根一律不往里走**
（`COVER.weights === COVER_WEIGHTS`，不这么办那十四个权重会被叫成 `COVER.weights.*`，
行为图点边就跳不过去）。滑杆量程默认 0—4×文件值（文件值为 0 时 0—1）。改动**直接写回表对象**，
四个模块都在调用时读表，下一次 Think 就生效 —— 前提是表没被冻住（`Data_EnemyAi.md` §14.4：
本机 localhost / `?aiedit=1` 才不冻）；冻着时面板顶部写明「只读」并禁用全部滑杆。
「保存到源码」先问 `GET /__tuning/status`，可写才按文件分组 `POST /__tuning/save`；
404 或失败一律**退化为复制片段**并把原因写在面板上，不静默失败。

冒烟：`node Taierzhuang1938/Script_AiEditorTest.mjs`（浏览器，29 条）。

### 关卡编排（2026-10-31 删除）

用户要求废弃：批注从没用过，排关卡改用白盒关卡编辑器。工作台、俯视图、分类查看、批注与 `/__notes` 保存口及测试都删了；
还在用的编排表与编排模型见 [Data_MissionOrchestration.md](Data_MissionOrchestration.md)。

### 白盒关卡编辑器 `Script_EditorBlockout.mjs`（整页模式）

入口：高级工具菜单栏「关卡」→ 白盒关卡编辑器（第一项）。它跳到 `index.html?editor=blockout&level=FirstLevel`
（保留当前的画质 / 尺寸 / 声音参数）；也可以直接开
`?editor=blockout&level=<关卡>[&kf=<关键帧 id>][&quality=low|medium|high|ultra]`。已经在这个模式里时按钮显示为当前项，
点了不重新加载。数据格式、接口与分工见 [Data_EditorBlockout.md](Data_EditorBlockout.md)，这里只记怎么用。

这是整页模式，不是叠加面板：只建白盒场景（地形只有高度色带和网格）、玩家（汉阳造 + 大刀 + 手榴弹，
WASD / 开火 / 换弹照旧）和按关键帧摆的敌我单位；没有任务流程、过场和补兵，单位不进 AI、不吃子弹。
玩家这一次无敌、弹药不减，不改存下来的调试选项。

| 位置 | 有什么 |
| --- | --- |
| 左上 | 关键帧卡片：阶段号 + 阶段标题 + 站位名；「此时」发生了什么；「下一步」去哪（随视角转的箭头 + 距离）；可选的提示标签、对照备注、推测位置的个数；右上角「记下当前机位」 |
| 右上 | 关卡下拉；射界 / 去向 / 标签 / 穿墙显示四个开关；配置状态点（绿 = 已载入，蓝闪 = 外部修改已同步，红 = 配置有错，悬停看原因） |
| 左下 | 小地图：纸面俯视图，北朝上，跟着玩家 |
| 底部 | 关键帧导航栏：按阶段分段，点刻度或拖滑块跳转；过渡太长时显示「快进 ×n」 |
| 3D 里 | 敌红、友蓝、百姓绿的地环，朝向箭头、射界扇、去向虚线；POI 与下一步目标的光柱；被墙挡住的人用暗色透出来 |

按键（拿着鼠标或按过 Esc 都有效）：`.` 下一个关键帧（连贯的单位走过去）、`,` 上一个（直接到位）、
`M` 全关总图（替代平时的小地图；滚轮缩放、拖动平移、双击回全图、点关键帧点跳转，M / Esc 关）、
`Y` 重播进入当前关键帧的过渡、`Esc` 交还鼠标（交还后界面才能点，点画面重新拿鼠标）。

文件都在 `Taierzhuang1938/Blockout/`：`<Level>.json` 是配置（关键帧、玩家机位、此时 / 下一步文字、
敌我单位、POI），人和 AI 都直接改它；`<Level>.scene.json` 是第一关以外的关卡用的高度图 + 体块
（第一关直接用游戏里的地形与体块）。页面开着时每 2 s 读一次配置，外部改了就按当前关键帧重新摆
（不重建场景），状态点蓝闪并提示。

存盘只有一个操作「记下当前机位」：把玩家当前的位置、朝向、姿态写进当前关键帧，再整份存回。
本机预览（localhost / 127.0.0.1 打开的页面）下先问 `GET /__blockout/status`（只收 GET / HEAD），回
`{ writable, root, revisions, reason? }`：`revisions` 是各关配置文件**原始字节**的 sha1（文件不在是 `null`），
不可写时 `reason` 写原因。可写才 `POST /__blockout/save`，body `{ level, doc, revision }`：

- `revision` 必填，填编辑器**读配置时**按响应原始字节算的 sha1（工作区是 CRLF 也照原样算），意思是「我改的是这一版」；
  文件还不存在时才写 `null`。不要拿 status 当下报的版本号来填 —— 那会把外部刚改的内容悄悄盖掉。
- `doc.level` 必须等于 `level`。服务端过 `ValidateBlockout` 后写成 `JSON.stringify(doc, null, 2)` + 换行（LF），
  先写 `.tmp` 再改名。成功回 200 `{ ok, level, file, revision, warnings }`，下一次保存用回来的 `revision`。
- 版本号对不上回 409 并带上盘上当前的 `revision`：文件在编辑器外被人或 AI 改过。等 2 s 同步（或 `Reload()`）
  读到新内容后再记一次，不要直接拿 409 里的版本号重发。
- 其他拒绝：方法不对 405；不是本机、Host / Origin 不对、level 不在名单里 403；Content-Type 不是
  `application/json` 415；超过 4 MB 413；坏 JSON、校验不过、嵌套太深 400（校验不过 / 嵌套太深时带 `details`）；写盘失败 500。
  任何拒绝都不落一个字节。

写不了时（Pages、测试服、局域网、旧的预览进程）存进 `localStorage["tengxian1938_blockout_<Level>"]` 并提供
下载 JSON，界面上写明原因。场景文件不开放写。

`window.Tengxian.Debug.Blockout`（测试与 agent 用）：`State()`、`GoTo(idOrIndex, { animate })`、
`Next()`、`Prev()`、`Replay()`、`SwitchLevel(key)`、`Reload()`、`Units()`、`ToggleMap(open?)`、
`SetLayers(partial)`、`Config()`。`GoTo` 等过渡结束、`SwitchLevel` 等新关卡和配置都就绪才 resolve。

命令行（纯 node，从 worktree 根跑）：

```
node Taierzhuang1938/Script_EditorBlockoutCli.mjs export FirstLevel [--out=<path>] [--force]   从游戏数据生成第一关配置
node Taierzhuang1938/Script_EditorBlockoutCli.mjs scene SecondLevel [--force]                  生成第二关草稿场景与占位配置
node Taierzhuang1938/Script_EditorBlockoutCli.mjs validate [FirstLevel|SecondLevel|all]        校验配置与场景文件（缺省 all）
node Taierzhuang1938/Script_EditorBlockoutCli.mjs summary [Level]                              每个关键帧一行：机位、各阵营人数、推测、POI、警告
node Taierzhuang1938/Script_EditorBlockoutCli.mjs kf <Level> <id>                              看一个关键帧的全部单位与 POI
```

`export` / `scene` 默认不覆盖已有文件（可能刚被人或 AI 改过），确认要覆盖再加 `--force`；
`--commit=<sha>` / `--generated-at=<ISO>` 写进 `source`（缺省 git HEAD / 现在）。不带子命令运行打印用法。

冒烟：`node Taierzhuang1938/Script_EditorBlockoutConfigTest.mjs`（数据与生成器）、
`node Taierzhuang1938/Script_EditorBlockoutSaveTest.mjs`（存档口，真起一次本地预览）、
`node Taierzhuang1938/Script_EditorBlockoutMapTest.mjs`（俯视图，浏览器）、
`node Taierzhuang1938/Script_EditorBlockoutBrowserTest.mjs`（整页，浏览器）。

### Profiler `Script_EditorProfiler.mjs`（叠加层，独立窗口）

与 Debug Rendering 同在 设置 → Debug工具，不接管相机、不暂停玩法 ——
它量的就是战斗中的帧。面板里就是一颗开关（**没有页面内面板**，用户点名去掉的）：
点开即 `FrameProfiler.Enable()`（内核在 `Script_Profiler.mjs`，表格排版在
`Script_ProfilerReport.mjs`，函数采样在 `Script_ProfilerSampler.mjs`）并弹一个
`window.open` 独立窗口。

#### 第四版（2026-10-14，对标 UE 的 stat unit / Unreal Insights）

起因：用户录了一段 20 fps 的战斗，结论要靠五个外部取证脚本才拿得到 —— 哪一步慢、谁占着
draw、机器是不是被别的会话的无头浏览器占着（那份录制同样的活单价是空闲时的 1.7–2.0 倍）、
前 495 帧其实是暂停空转。用户原话「看起来很全其实不够细，也不够美观；对标 UE 的 Profiler」。
外观与游戏设置页共用主题。2026-11-20 起窗口顶部为录制、导入、导出 JSON 和设置，帧导航旁显示可点击的卡点。
实时与暂停默认取缓冲里工作时间最长的帧，选帧或选段后按选区取帧。卡点比较同帧主线程和 GPU 时长，再显示最耗时的独占插桩。帧间隔与工作耗时分别记录。

| 区 | 对标 UE | 内容 |
|---|---|---|
| 帧图 | `stat unitgraph` | 根桶堆叠 + 浏览器侧 + GPU 折线 + **预算线**（按帧间隔估出来的刷新率，或工具条选的目标帧率）。顶道：红=顶出纵轴、白=GC、金=现编着色器、彩色=事件标记、竖线=阶段切换/自动降档。底道：机器忙闲（琥珀 ≥1.25 倍、红 ≥1.6 倍）。灰底=非游戏帧 |
| 时间轴 | Insights Timing | 选中一帧时出现（同旧版） |
| CPU | Insights Timers | 插桩树表、耗时、调用次数、矩阵访问和分配 |
| GPU 页 | `stat gpu` | 同旧版 |
| 渲染统计页 | `stat scenerendering` / `stat rhi` | 逐 pass：draw、**材质切换**、程序切换、**变体重算**、实例、提交 CPU、**µs/draw** |
| 计数器页 | Insights Counters | 敌我存活、阵亡、粒子实例、刚体、碰撞体、同时发声、着色器程序、几何体、纹理、JS 堆、机器忙闲；带曲线，点一行叠画到帧图上 |
| 事件页 | Insights Bookmarks / Log | 阶段、爆炸、阵亡、补兵、自动降档、现编着色器、GC、≥50 ms 卡顿；按类别筛，点一行定位那一帧 |
| Draw 清单页 | GPU Visualizer 逐 draw | 「抓下一帧」记每个 draw 的 pass / 物体 / 顶层子树 / 材质 / 三角 / 实例 / CPU µs，按 pass、子树、材质、物体分组 |
| 函数采样页 | Insights CPU 采样 | 浏览器 JS Self-Profiling：自身耗时、含子调用、**按桶归属**（样本时刻落进哪一帧的哪一条 B/E）、按文件。要求页面响应头 `Document-Policy: js-profiling` —— 本地预览与测试服都发，GitHub Pages 发不了（线上这一页显示不可用）。浏览器采样间隔约 10–16 ms，要采够秒数 |
| 场景、环境 | `memreport` 一类 | 场景节点统计、采集环境、选区快照 |

内核新增（都只在 `Enable()` 期间装、`Disable()` 一件不剩地还原，`Script_ProfilerTest` 盯着）：
- **帧状态与阶段**：`Script_Main` 每帧 `SetFrameContext(状态, 阶段)`（`ProfilerFrameState` 的分支顺序照抄 `LoopStep`）。
  汇总默认只算 `play` / `cutscene`（`profiler.activeOnly`，面板「只看游戏帧」可关）；一帧活动帧都没有时退回全部帧。
  1 版录制没有 state：主线程没干活、一个桶都没记的帧推断为暂停。阶段一变自动打一个 `stage` 标记。
- **机器忙闲**：Worker 里每 0.5 s 跑一段固定整数运算（约 3–4 ms），耗时 ÷ 本机最快一次（存 localStorage，
  跨会话）= 「慢几倍」；另读 Compute Pressure（系统 CPU 压力四档）。Worker 在别的核上跑，系统被占满时它一样抢不到核。
- **渲染统计**：包实例上的 `renderer.renderBufferDirect`，按当前 GPU 分段数材质切换（`material.id` 变）、
  程序切换、变体重算（同一材质这次画用的 program 跟上次不同）、实例数；`RequestDrawCapture()` 抓下一帧逐 draw 清单。
  每个 draw 多约 0.2–0.4 µs，记在渲染提交里。
- **计数器** `AddCounter(名字, 取值, { label, unit, group })`：每 `COUNTER_EVERY`（6）帧取一次，坏取值函数记 NaN 不拖垮整帧；
  录制里每帧 `ctr` 按下标对齐 `counters` 名表（只追加不删）。登记在 `Script_Main`（剖析器构造之后）。
- **事件** `Mark(类别, 文字)`：`Script_Main` 打阶段（自动）、爆炸（`onBlast`）、阵亡/补兵（存活人数差）、自动降档。
- 每帧另记 `t0`（主线程开工的绝对时刻），JS 采样按它归桶。录制文件版本 2，另存 `counters` / `environment` /
  `busyBaselineMs`（以及面板做过采样时的 `sampler` 结果）；1 版文件照读。

命令行：`--print=<录制>` 默认也只算游戏帧，打出「结论（stat unit）」段；`--all-frames` 连暂停帧一起算，
`--target-fps=60` 改预算线。录制里有 draw 清单的帧用 `--frame=<帧号>` 会一并打出来。

#### 录制与回放（照 Unity Profiler）

- **录制键**（空格）：`FrameProfiler.Pause()` 只停记录、**不拆钩子**，环形缓冲原样冻住；
  `Resume()` 接着记，接缝那一帧标 `gap`（间隔是暂停时长，不进帧率、最差帧与尖峰）。
  暂停期间 `_Poll` 照收 GPU 查询，暂停前最后几帧的 GPU 数不会丢。缓冲帧数 300–7200 可选。
- **帧图**：按根桶**堆叠**（AI / 物理 / 渲染提交…各一色，没登记的根桶散列取色）+ 顶上一截
  浏览器侧 + GPU 合计折线；纵轴按视窗 90 分位自动取档，顶出去的帧打红点。
  点一帧选中、拖动选一段、滚轮缩放、Shift+滚轮平移、双击回到最新；下面的缩略条是整条缓冲，
  可以直接拖。选中后视窗不再跟着新帧滚（录制照常），「最新」/ End / Esc 回到跟随。
  ← → 逐帧（Shift 十帧）、[ ] 跳上/下一个尖峰（间隔 ≥ 活帧中位数 ×1.5 且多 4 ms）。
- **选中一帧**：两张表换成这一帧的 ms / 占比 / 调用次数，下面出**时间轴**：每一对 B/E 一条
  （`ai/act` 一个兵一条，桶表里只看得到合计），按嵌套深度分行；GPU 分段另占一行（区间是
  提交 CPU，GPU 耗时在标签与悬停里）。滚轮缩放、拖动平移、点一条或点表格一行 → 两边一起高亮
  同名的全部实例。**空白 = 没打标记的主线程工作**，主线程结束线之后到帧末是浏览器侧。
- **选中一段**：表是这一段的 avg / p95 / max，取证栏是这一段里最差一帧（带「定位到这一帧」）。
- **导出 / 导入录制**：`ExportRecording()` 保存完整缓冲。样本列名在 `sampleFields` 和 `gpuSegmentFields`，
  `nameId` 用 `names` 解码。面板还写入选区、卡点和已完成的浏览器原始采样。导入后停录并恢复文件里的选区与名字表，
  丢弃在飞的旧 GPU 查询。恢复录制会清空已导入的帧。命令行 `--print=<录制> --frame=` 可读取同一文件。
- **现编指名**（2026-09-17）：帧图顶上的金色标记 = 这一帧新编译了着色器程序。每帧记
  `newPrograms`（个数）与 `newProgramNames`（逐个写「材质名（类型）@ 物体 < 带名字的父节点」），
  悬停提示、最差一帧那一行、事件栏（按名字计次，同一份材质反复现编会写 ×N）都列出来。
  比对按**程序对象身份**，不看 `renderer.info.programs` 的长度净增 —— 同一帧一个释放一个新建时
  净增是 0，旧口径会漏。找主人要走一遍场景树，只在出现新程序的那一帧走；后处理全屏片这类不在
  场景树里的材质写「(不在场景树里)」。起因：用户 09-16 录到两次 750 ms 现编，旧录制只有个数、
  查不出是谁。回归口 `Script_ProfilerTest`（摆一件带独有 define 的材质，断言那一帧写出它的主人）。
- **样本怎么记**：`B/E` 在 E 时往复用的 typed array 写 `[名字号, 深度, 起点, 时长]`，
  GPU 段写 `[名字号, 起点, 提交 CPU, draw, 三角]`，帧末一次 `slice` 进记录 ——
  不在 B/E 里分配，否则「分配KB」会把剖析器自己算进业务桶。名字号查 `profiler.names`
  （整个会话一张，清空历史不清）。汇总统一走纯函数 `SummarizeFrames(rows)`：
  `Summary(秒)`、`SummaryRange(帧号)`、命令行读录制都是它。

命令行入口是 `Script_ProfileCli.mjs`（见 [系统参考](Data_AgentReference.md) 的性能段）：
它读的是同一份 `profiler.Summary()`、排版走同一个 `Script_ProfilerReport`，
所以不会出现「面板说 12 ms、脚本说 9 ms」这种谁也说服不了谁的局面。
面板导出的 JSON 可以直接喂给 `--print=<文件>` 排成同样的表。

#### 两张表的读法

- **CPU 表按子桶分层。** 标记名带斜杠就是子桶（`ai/act/anim`、`story/mission/voice`），
  存储是平的（key 就是整条路径），分层只发生在显示层。B/E 是真的嵌套调用，
  所以**父行的数字已经含子行**，父行后面跟一条「自身 = 父 − 子之和」。
  标记打在 `Script_Main` 的 Frame/RenderScene、`Script_Ai.Update`、
  `Script_FirstLevelMissionRuntime.Update` 三处。
- **「矩阵访问/帧」这一列**：剖析期间包一层 `Object3D` 的
  `updateMatrixWorld` / `updateWorldMatrix` / `traverse`，按当前栈顶桶数节点访问次数。
  矩阵与遍历本来散在各桶里看不见，而车厢机位一帧有一万六千多次。
  **这一层本身有开销**（每次访问一次数组读 + 一次自增），所以剖析开着时
  `cpuMs` 比不剖析时略高；它量的是相对大小，不是绝对帧时间。
- **「分配KB」这一列**：B/E 两侧读 `performance.memory.usedJSHeapSize` 的正增量
  （Chrome 系才有）。分配大户由此可以指名道姓，不必再从整帧的分配速率倒推。
  这一列整列空，说明这台浏览器没有 `performance.memory`，或者它被量化/限速到
  读不出逐帧差（无头 Edge 实测就是这样）—— Chrome 系加
  `--enable-precise-memory-info` 才逐帧有数。CLI 会在表底下写明这一条。
- **GPU 表显示英文原名**，与 `PostPipeline.passes` 一字不差；中文解释在 `title`。
  逐段另有 draw call 与三角形两列，读法（什么时候 GPU 读数只是提交时间的影子）
  见 [渲染管线](Data_TechRenderPipeline.md) §17.11。阴影按级联拆成 `shadow/c0`…。
- **两张表都是数据驱动的**：汇总里出现什么 key 就显示什么行。
  旧版写死 11 个 GPU 名字，帧图里新加的 pass 哪怕吃了 3.7 ms 也一行都看不到 ——
  别再往回改成固定名单。
- **「浏览器侧」** = 整帧间隔 − 主线程工作。浏览器提供的 `long-animation-frame` 读数存入录制。

四条特殊行为，改的时候别破坏：

- **`static keepOnClose = true`**：关设置面板（回去打仗）不收它 —— 主用例就是
  边玩边记。停它：面板里再点一次开关，或直接叉掉独立窗口（Update 检测
  `win.closed` 自我关闭）。弹窗被拦截时 Enter 抛错、开关弹回，不留瞎状态。
- **钩子必须成对还原**：Enable 会把 `renderer.info.autoReset` 改成手动、包
  `shadowMap.render`、包 `Object3D` 的三个矩阵/遍历方法、挂 `long-animation-frame`
  观察者、把自己挂到 `post.profiler`；Exit/Disable 一样不落地还回去。
  守着它的：`Script_ProfilerTest`（render 域），它逐条断名字（`ProfiledUpdateMatrixWorld`
  这些）与还原后的状态，以及面板的暂停 / 选帧 / 时间轴出像素 / 选段 / 加载录制 / 继续录制；
  录制口径（样本深度、接缝帧、尖峰、存读往返、命令行读录制）在纯 Node 的
  `Script_ProfilerRecordingTest`。
- **GPU 查询结果晚几帧到**（ANGLE/D3D11 连 `gl.finish` 都不算数），`_Poll` 每帧收、
  挂回历史记录；headless 是 SwiftShader，GPU 数字只证明接线，不许当性能结论。
- **自身开销记在「编辑器叠加层」桶里**。帧图有新数据时每 3 帧更新，实时表格每 0.5 s 更新，
  选区在 GPU 结果返回时补算。场景普查和事件页有独立节流。
  用户实测过一次 10 ms 的自刷新突刺，节流与便宜路径就是冲它去的 —— 改刷新
  频率前先看这一桶有没有涨回去。场景普查**自己走栈**，不用被包了计数的
  `scene.traverse`：用它等于把七千个节点算进面板自己的桶里，读数被自己的诊断顶花。

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

### 构件目录与出图机位（2026-10-31）

- `Script_PlaceableCatalog.mjs`：可放置构件总表（`PLACEABLE` / `MODEL_PLACEABLE` / `PLACEABLE_CATEGORIES`、`BuildPlaceableVisual`、
  `FlushSinkProps`），从已删的场景关卡编辑器里原样搬出；构件库预览（独立页面 `Tool_PropLibrary.html`）用它，以后的新场景编辑器也复用它当资产目录。
- `Script_EditorShotCamera.mjs`（id `shotCamera`，不进菜单）：采样点编辑器删除后留下的最小一块 ——
  出图脚本与几支浏览器测试用 `Debug.OpenEditor("shotCamera")` 暂停玩法、接管相机、藏视图模型，再调 `ApplyPose` 摆镜头
  （位姿口径：`y` 绝对高度，缺省取 地高 + `h`；没写 `fov` 取画质档出厂值，没写 `far` 取 620 m）。

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
node Taierzhuang1938/Script_AiEditorTest.mjs
```

编辑器套件 169 条断言（2026-09-05 计），另有破坏预览专项取证；退出码即成败。重点不是「能不能打开」，
而是**关掉之后有没有还干净** ——
编辑器是这个项目里唯一会去动运行时状态的一批代码（藏世界、换相机、包 `GroundHeight`、
往 `city.colliders` 里塞盒子、给 viewmodel 换枪），有一处没还回去，症状会在很远的地方
才冒出来：撞到空气、退出后视角歪了、举着别人的枪。

改了编辑器以外的东西照旧跑 `Script_BootTest.mjs`（画面健康 + draw call 红线）与
`Script_PlayTest.mjs`（玩法与剧本）。
