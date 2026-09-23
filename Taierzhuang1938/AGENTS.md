# Taierzhuang1938 项目入口

《台儿庄：血战滕县》是浏览器 FPS 白盒；目录名是历史遗留。Three.js 与 Rapier3D 均使用仓库内 vendor，零 CDN；渲染管线不引入 addon。

仓库协作、命名、资产生成与发布遵循 [根 AGENTS.md](../AGENTS.md)。这里保留跨系统契约；涉及的模块、接口与分册在 [系统参考](docs/Data_AgentReference.md) 中按需查阅。源码头注是定位线索，仍需结合实现与测试确认现状。

## 当前入口与任务范围

- **03–05 当前采用稿为 Notion 2026.09.22 修订**：[正文](docs/Data_FirstLevelFrontSource20260922.md)、[白盒与连续流程](docs/Data_FirstLevelFrontTopology20260922.md)。以右侧夺点、同一撤口、同一道路战车、东南旧院取弹、原路返回攻击支路为准。导演为 `Script_FirstLevelFrontBattle`。本轮用户限定实机验收 03–06：`Script_FirstLevelMissionBrowserTest.mjs --campaign --stage-from=3 --stage-to=6`，仅加载时初始化 03，之后连续推进，不测试 07 及其他阶段。
- **01–02 沿用 Notion 2026.09.21 修订**：[正文](docs/Data_FirstLevelOpeningSource20260921.md)、[分镜与验收](docs/Data_OpeningStoryboards20260922.md)。01 一个俘虏被枪杀，02 主审/翻译与大刀反扑、拖救踢枪。导演为 `Script_OpeningStoryboards`，既有动作从 `Animation/OpeningStoryboards` 加载。2026-09-23 现场反馈追加：四名先头兵必须由小队真实清场后才拖救还权；前沿五组敌军在 02 预置，03–05 不因接近临时生成。此项用 `--campaign --stage-to=3` 从 01 连续复测。06–18 沿用既有来源与连接；前沿新版衔接 06 的原集结处。

- 正片第一关是《往南的路》，入口 `?whitebox=p012`，序章已并入。需求来源是 Notion `2026.09.19` 采用稿（转录见 [采用稿](docs/Data_FirstLevelRebuildSource20260919.md)），跨包接口冻结在 [分包契约](docs/Data_FirstLevelRebuild20260919Contract.md)（步骤 id、事实名、锚点/路线键、遭遇组 id、cue id 都在那里改，不各自改名）。任务、对白和数值分别由 `Data_FirstLevelMission`、`Data_FirstLevelMissionDialogue`、`Data_Tuning_FirstLevel` 管理；范围决定、逐阶段通过条件与未完成项见 [重构验收](docs/Data_FirstLevelRebuildAcceptance.md)。
- **18 个公开阶段、27 个可玩内部步骤**（调试菜单 18 项；流程表另有终止哨兵 `Complete`）：1 Trapped｜2 Rescue(`BunkerRescue`→`RearTrench`)｜3 Support｜4 MachineGun｜5 Tank｜6 Orders｜7 South｜8 Village｜9 Melee｜10 Courtyard｜11 TransferApproach｜12 Transfer(`Transfer`→`CartRide`)｜13 AirFirst｜14 Dive(`Carry`→`Dive`→`Rescue`)｜15 Regroup(`Regroup`→`WallPath`→`ReceptionGate`)｜16 Handover｜17 Death｜18 Bridge(`BridgeOrders`→`BridgeCover`→`BridgeWithdraw`→`NightMarch`)。旧的 `Train` `Unloading` `TrenchEntry` `Shelter` `Retreat*` `Reception` `FinalCarry` `FinalDefense` `Exit` 已下线。调试菜单与 agent 跳转接口见 [阶段跳转](docs/Data_FirstLevelStageJump.md)。
- 各段的实装口径分三册，改哪一段读哪一册：[阶段 1–7](docs/Data_FirstLevelFront20260919.md)、[阶段 8–14](docs/Data_FirstLevelMid20260919.md)、[阶段 15–18](docs/Data_FirstLevelEnd20260919.md)。通过条件一律挂在「真的发生了」上 —— 人真的走到、车真的开走、敌人真的被打掉；不许用计时器顶替。新玩法逻辑放新模块，`Script_FirstLevelMissionRuntime` 只留自己步骤的 `Enter` 分支与 `Update` 段那几行薄钩子。
- 空间按采用稿分四区，Z 单调南行：A 掩蔽部与前沿（−220…−96）→ B 村落（−30…46）→ C 桥头接运（86…145）→ 北沙河（z=153）→ D 桥南接收与铁路桥（165…252）；18 是唯一一次回头向北。河上只有三处能过：西沟浅滩、路桥（x=76）、铁路桥（x=−77，炸掉后不可逆）。掩蔽部完好/坍塌与关尾北门夜景走 `layout.scenario` 线性三态（由事实驱动，回跳自动退回），**scenario 体块不在 `MISSION_LAYOUT.blocks` 里，净空检查要分态单独扫**。坐标、锚点/路线键、gate 与信号、验收口径见 [空间拓扑](docs/Data_FirstLevelTopology20260919.md)；转弯路段进度按路线投影判断，不能用单一 X/Z 坐标比较替代。
- 第一关配音口径见 [2026-09-19 配音同步](docs/Data_FirstLevelVoiceSync20260919.md)。**连续对白整段一次生成成一条录音，不逐句生成后拼接。01–06（2026-09-23 起）再按句切开、各自从说话人位置播放**：定妆参考音（`Data_FirstLevelVoiceCast` + `Script_SeedAudioCastBake`）→ 一个场景一次请求（`Script_SeedAudioFirstLevelBake`，最多 3 条参考音、`@音频N` 指派说话人、干声不烘环境声，只有硬错误才整段重抽，同场最多 3 次）→ 整段一次母带 → 按逐字时间戳在句间静音处切成 `Audio/FirstLevel/Lines/` 片段（整段原录音保留）→ 导演表 `Data_FirstLevelDialogueDirection`（默认沿用录音里的原始间隔，只覆盖等动作/gate/截断/压尾音几处）→ 多声部播放器 `Script_DialoguePlayer`（每句挂说话人头上、侧链让路），玩法包调 `voice.PlayScene/PlayLine/Signal/Speech`；某句在整段里分错嗓子时才单独补录那一句（例外，清单记 `source: "patch"`）；**07–18 仍是一段连续多人对白 = 一个 cue = 一次 SeedAudio 请求 = 一条 mp3、整条播放**；班组（罗/幺娃/何/刘/老周/顺子）的战斗短句另有用各自定妆音录的本人版本（`Script_SeedAudioSquadBarkBake`，一人一次请求；声库键 `<key>@<who>`，`Script_Audio.Bark` 按 `who` 或第一关的认人钩子只在本人版本里挑），动作打断处用 `VoiceTiming` 在同一条音频里停/续，不拆成多条；日语行送 TTS 用纯假名（侧表 `Data_FirstLevelJapaneseSpeech.mjs`，不进字体字表），屏幕字幕显示中文译文。**台词表 `Data_FirstLevelMissionDialogue.mjs` 是 cue id 的唯一来源**，`Script_FirstLevelVoiceTest`（含 `--audio`）静态扫运行时引用，「还没有触发点的 cue」名单写死在它里面且只许变短。台词变更同步整段录音、四川话表演、对齐与触发点，不得只改文字后继续用旧录音。
- 整关驾驶脚本：公共部分在 `Script_FirstLevelCampaignKit.mjs`（`ParseCampaignArgs` / `OpenCampaign` / `CampaignActions(ctx)` → `JumpStage` `Route` `Interact` `WaitStage` `WaitOutCutscene` `Capture` `RetryCampaign`），三段各自一只 `Script_FirstLevelCampaign<Front|Mid|End>.mjs`。改 Kit 要保持向后兼容。验收：`Script_FirstLevelMissionTest`、`Script_FirstLevelFront/Mid/EndTest`、`Script_FirstLevelSpaceTest`、`Script_FirstLevelVoiceTest`（配音变化加 `--audio`）；实机走 `Script_FirstLevelMissionBrowserTest.mjs --campaign`，分段用 `--stage-from=8|11|15|18 --stage-jumps` 或 `--stage-to=7`。
- 关中过场《空地上的三个人》（`CS_MachineGunCaptives`）**不再由任务触发** —— 那个主题已经由 01 掩蔽部门外那一拍承担。过场的资产、数据与自身回归全部保留，任务侧的断言改成「不触发」；分镜与配音清单见 [04 关中过场](docs/Data_MachineGunCaptivesCutscene.md)。
- 公开阶段 9（内部步骤 `Melee`）是**灶屋—连屋近战**：玩家先进灶屋，日军从与东巷相通的连屋进来；担架队停在 08 的遮挡里**不进屋**。提前打掉近战敌人就不走固定 QTE，敌人真的贴上来才走共用白刃僵持（`Script_MeleeCombat` 自己开，这一层一次都不调 `BeginBind`）。通过条件仍只有 `meleeResolved`。**旧的屋内伏击拍（老周挨刀、两名担架员阵亡）已下线**，`ambush*` 数值与动画模块随之删除，[屋内伏击](docs/Data_FirstLevelRoomAmbush.md) 只作历史记录。
- 第一关罗班长负责实体带路与停点等候，HUD 按 COD WWII / WaW 单人战役约定显示唯一跟随或任务标记；新增可重复短命令不能抢断剧情对白。编排、台词与验收见[罗班长任务引导](docs/Data_FirstLevelLeaderGuide.md)；原有战壕掩护门与搬运职责优先。
- 正式菜单以 `Data_Menu.CAMPAIGN_ENTRIES` 为准：第一关可玩，第二关到终章为标注“未完成”的占位，点击提示“敬请期待”。旧序章及旧章节不恢复进菜单；`?phase=N` / `Debug.StartLevel` 只建原切片，不装旧剧本、摆点或换关。每次只建当前切片，换章拆除重建。
- 第一关的编排（哪一步放哪些人、什么条件过关、组怎么激活）**是表不是脚本**：`Data_FirstLevelMissionGates.mjs` 的四张表 + `Data_FirstLevelMission*`，运行时只读表；用户的现场意见走「关卡编排」工作台存进 `Taierzhuang1938/Notes/<Level>/notes.json`（进仓库，agent 用 `Script_MissionNotesCli.mjs` 读与结案），改完跑 `Script_MissionGatesTest.mjs`。口径见 [关卡编排工作台](docs/Data_MissionOrchestration.md)。
- `?whitebox=p012-archive` 是旧 P0–P2 的开发回归夹具，旧资产与组件契约继续保留。旧任务表、旧 Notion 摘录和旧通关结果不能替代新版需求与验收；任务涉及哪条入口，就核对对应运行时及测试。新需求在当前任务授权范围内同步数据、消费方和文档，不按旧提案自行恢复已废弃内容。

## 跨系统契约

1. 浏览器模块变更更新 `index.html` import map 对应的 `?v=`，新增模块登记 import map；源码 import 不自带 `?v=`，避免同一模块形成两个实例。验收：`Script_ModuleGraphTest.mjs`。
2. `Data_*.mjs`、规则层及要求纯 Node 运行的 TexBake / FarLand / Identify / CutsceneCheck 保持无 three 依赖。
3. 新静态几何走 `BuildSink` 分区合批，不零散 add Mesh；开机预算统一取 `SCENE_RENDER_LIMITS`。涉及场景预算时按七关检查，验收：`Script_BootTest.mjs`。
4. 世界坐标 X 向东、Z 向南、Y 向上，单位米，原点为城中心十字街口。人物正面、枪口、车头与机首一律为局部 -Z。外部 FBX/GLB/glTF 的源朝向**用顶点云量出来并写进数据**（飞机 `Data_AircraftAssets.noseDir`、导入战车 `ImportVehicles.SOURCES.sourceNose` / `Data_Meshes.facing`），由桥接层对齐；不以目测印象或源站默认约定替代朝向测量。验收：CharacterModelTest、ActorPoseTest，飞机与战车走 `Script_ModelFacingTest.mjs`（新增外部模型必须登记进它）。
5. 地面由共享采样器决定；界河 `L0_Jiehe` 统一使用 `SampleJieheHeight(x,z)` / 注入的 `groundAt`，渲染、角色、AI、弹道和布设不得另写高度公式或硬编码绝对 y。改高度图或界河地形时运行 HeightmapCli verify、JieheTerrainTest、BootTest；下载、贴地与原始数据规则见 [高度图说明](docs/Data_TaierzhuangHeightmap.md) 及系统参考末节。
6. 材质 albedo 为 `SRGBColorSpace`，normal/orm 为 `NoColorSpace`；**GTAO / SSIL 只乘间接光**（直射项归微阴影与接触阴影，不在 `<aomap_fragment>` 上压直射）。验收与依据：`Script_GtaoTest.mjs`、`docs/Data_TechRenderPipeline.md` §5 与 §7。
7. 枪械、战车减面按 `WEAPON_TRIANGLE_LIMIT` / `VEHICLE_TRIANGLE_LIMIT`；先排除展示件、备用状态及重复壳，超阈值才减面，降幅不超过 5% 时保留原始拓扑。特例与登记取 `SPECIAL_TRIANGLE_TARGETS` / `EXTERNAL_GLB_STANDARDS`，全场预算同步进 `SCENE_RENDER_LIMITS`。验收：AssetStandardsTest。
8. 新增 `Script_*Test.mjs` 登记 `Script_TestRunner.mjs` 的 `testDefs` 与 tier/domain，新模块补 `changedDomainRules`；验收：`Script_TestRunnerTest.mjs`。数值以代码常量为准，不在多份说明里复制易过时的预算。
9. 大刀与装刺刀武器统一走 `Script_MeleeCombat.mjs`，玩家、敌友军及白盒不得另建伤害判定。F 推架零生命伤害；QTE 只在真实僵持或倒地压制时触发，成功不自动杀敌。动画与验收入口见 [白刃战说明](docs/Data_MeleeQte.md)。
10. **玩家可见文本与玩法数值一律数据驱动。** 代码里不写玩家能看见的中文：HUD / 菜单 / 目标 / 交互标签 / 系统字幕走 `Script_Text.T("domain.key")`，表在 `Data_Text_<Domain>.mjs`（由 `Data_Locale_zhCN.mjs` 拼成基准语言；加语言只加一份 `Data_Locale_<id>.mjs`）；章节台词、过场、史料卡的原稿仍在各 `Data_Mission*` / `Data_Cutscene*`，经 `Script_Text.Localize(id, text)` 可被译文覆盖，翻译清单由 `Script_TextGather.mjs` 导出。手感 / 平衡 / 节奏数值放 `Data_Tuning_<System>.mjs`（纯数据、带出处注释），代码只读表；任务编排（拍表、交互点、指引、名册）是数据不是代码。开发者诊断（console / throw / 编辑器面板）不走文本表。验收：`Script_TextTest.mjs`（各表 `GATED_MODULES` 登记的模块零中文字面量），口径见 [docs/Data_TextAndTuning.md](docs/Data_TextAndTuning.md)。
11. **往 `MeshStandardMaterial` 插 GLSL 只走 `Script_MaterialPatches` 注册表**（three 一个材质只有一个 `onBeforeCompile`，谁后写谁静默覆盖前一个）。克隆已装补丁的材质用 `Script_Materials.CloneShadedMaterial`，它按 `PatchesOf(source)` 重挂补丁，不抄钩子。每个材质变体的 sampler uniform ≤ `MAX_TEXTURE_IMAGE_UNITS`（ANGLE-D3D11 上是 16；超了程序不链接、只有一行日志，那只材质整个不画）。验收：`Script_SamplerBudgetTest.mjs`；预算表与打包手段见 [渲染管线](docs/Data_TechRenderPipeline.md) §1.8。
12. **画质旋钮与分档只在 `Data_Tuning_Graphics.mjs` 与各 `Data_Tuning_*`**（纯数据、零 three），`Script_Post` / `Script_Main` / `Script_EditorSettings` 只读不写。新增帧图 pass 按 [渲染管线](docs/Data_TechRenderPipeline.md) §1.3 的 pass 契约接入、调试视图按 §1.11 的三条登记路登记，不往 `Render()` 里插代码。验收：`Script_PostFrameGraphTest.mjs`、`Script_EditorTest.mjs`。

    **所有现有及新增 renderer 统一遵守 [MotionVector 接入规范](docs/Data_MotionVectorContract.md)**：世界 Mesh / SkinnedMesh（SkinnedMeshRenderer）和骨骼挂件自动写真实运动；前景根的后续子孙继承明确零速度；透明 / 天空按约定排除。不能以逐件手动标记决定是否接入，不得覆盖对象原有 draw 钩子。未实现历史的移动实例、morph / 自定义形变不得直接用于新增近景角色与挂件。`Script_MotionVectorContractTest.mjs` 是独立 GPU 门禁，Script / Data / GLB 变更在 prepush 自动选中；改预通道或近景移动道具还须通过 `Script_CarriagePropVelocityTest.mjs` 的 high 画质真实资产检查 —— 它的被测对象随军列开场下线换成了 12/13 牛马车上老周的担架与车上近景件（名字里的 Carriage 是历史遗留）。不得以 low 画质、整屏占比或关闭后期代替，也不得随关卡重构删除门禁。历史原因见 [车厢复发调查](docs/Data_CarriagePropVelocity.md)。
13. **带路跑采用跨关卡共用的 NPC 跑停节奏。** 普通随队士兵跑出几步后自然减速，短停喘息、左右观察，再继续跑；每人的首次停步、停留时长与再次起跑独立错峰，不能只错开动画相位却让全队同时停走。班长不参加普通队员的随机喘息停步，按带路、回看、等候和战术职责行动。战斗、避险、通行及协作搬运优先；不得用喘息阻塞窄口、拖断队伍或锁住玩家。规则由共享行为与数据驱动，关卡只配置路线、角色职责和情境覆盖，不按关卡号或角色姓名复制特例。完整要求与后续验收见 [NPC 带路跑通用设计](docs/Data_NpcGuideCadence.md)；共享入口为 `SquadMarchAi`，可视化工具为「小队行进」；接入方式与分项验收状态见该文档第 8–9 节。

人物外观必须遵循[用户确认的选模清单](docs/Data_CharacterSelection.md)，运行时与编辑器共用 `Data_CharacterSelection.mjs`；保留的源模型或动作参考不等于允许重新启用其人物外观。

## 调查与工具

以下视频与动作要求仅用于动画素材、重定向或动作验收任务；普通玩法与文档修改按涉及系统查阅。

- 视频转骨骼资产统一存放于 `C:\Users\Bentl\OneDrive\Sync\饮河\FPS\视频转骨骼`，沿用 `Blender`、`Models`、`Video`、`Preview` 四目录。此工作流的 Blender 工程使用该专用目录，优先于根规范的通用 Blender 路径。
- 动作验收默认三栏同步查看原始视频、重定向前的原始恢复骨骼、最新重定向模型；按原片选段时间对应播放、暂停与逐帧。模型必须实时播放，不能用录制视频代替。主界面只展示最新效果，旧版本收进每个动作的“效果历史”，不默认并排比较 V1/V2。新增动作登记来源、选段、原始恢复、版本、可编辑工程和验收状态，具体见 [视频转骨骼标准](docs/Data_VideoToSkeletonStandard.md)。
- GVHMR 正式素材使用清楚完整的单人视频；多人裁剪及协作组装另标为实验。原 BIP/FBX 已有动作与视频恢复动作分组。持枪手部须单独验收掌面、手指、肘部与枪托接触，不能只凭握点距离判断正确。
- 后续动作视频默认用约 45° 斜向半俯视固定镜头，完整覆盖站立到倒地的全身范围；避免纯水平侧视下肢重叠。镜头选择不能替代深度、膝盖方向和接地验收。

- 工具与技能按根入口的适用范围选择；本项目页面通过 GitHub Pages 发布。本次目标需要生成或编辑素材时才加载相应技能；模型、纹理、动画和音频分别遵循既有管线，不自动扩展为无关的生成任务。
- 检索自有代码默认排除 vendor 大型压缩文件；调查第三方问题时定向读取相关 vendor，避免整行巨量输出。
- 浏览器验证优先复用 `../PrairieFire1937/Script_BrowserTestKit.mjs` 的 `LaunchBrowser` 和 `Script_DevServer.mjs` 的 `ServeRoot`。需要新诊断时可扩展这些入口，保留浏览器释放及现有并发测试槽。
- Windows 无头测试不要触发真实指针锁；游戏在 `navigator.webdriver` 下用假锁，测试不以 `pointerLockElement` 作为状态依据。这条保护真实鼠标操作，不能因补探针而绕过。
- 多点截图按切片分组，同一场景复用建城结果；常用入口见系统参考。现有截图不覆盖问题时可补充定向取证。
- 从本任务 worktree 用 node 直接运行脚本；不把 npm 在缺少本地 package.json 时的向上查找误当作正在测试本树。

## 验证入口

命令从 worktree 根执行。测试风险映射、超时、并发与基线见 [Data_TestTiers.md](docs/Data_TestTiers.md)。

```powershell
node Taierzhuang1938/Script_DevServer.mjs
node Taierzhuang1938/Script_TestRunner.mjs --changed=origin/master --profile=quick --fail-fast
node Taierzhuang1938/Script_TestRunner.mjs --changed=origin/master --profile=prepush --fail-fast
```

- 页面手工预览可启动 DevServer；测试与出图脚本自带临时服务，无需额外起服。
- 编辑循环用 quick；运行时变化推送前用 prepush，按文件风险追加浏览器门禁。集成验收用 `--profile=full`，需按 diff 筛选时加 `--changed=<base>`；`--list` 查表，`--only=<name>` 或 `--domain-only=<domain>` 用于定向排障。
- 纯文档或源工程说明变化检查内容、链接、命令与 diff，不为入口整理全跑七关。生成脚本、源工程或嵌入代码有变化时，按实际产物与消费链验收；`--changed` 的忽略规则不等于免验收。
- 新版第一关任务变化执行 `Script_FirstLevelMissionTest.mjs`；流程、交互、空间或装配变化追加 `Script_FirstLevelMissionBrowserTest.mjs --campaign`。配音资产变化或宣称配音完成时，再执行两者的 `--audio` 严格门禁。截图和过程记录留在忽略目录；调试跳转、改写任务事实或旧 P012 通关不算新版正常通关证据。
- `BASELINE` 表示已有失败，不能报告为全绿；新增失败阻断交付。`--strict-baseline` 将历史失败也视为阻断。
- 视觉改动需查看实际截图；数值通过不能代替视觉验收。Tier 2 出图不自动执行。

## 系统索引

[系统参考](docs/Data_AgentReference.md) 保留原路由表、截图/性能命令和分册导读：引导、渲染、材质、地形、模型、AI、白盒、战斗、物理、音频、过场、交互、编辑器及资产。旧文档引用 AGENTS.md 中这些章节时，对应内容已迁到该参考。

渲染侧另有唯一现状文档 [渲染管线](docs/Data_TechRenderPipeline.md)：§1 是接入契约，§2–§16 按帧图顺序一子系统一章（大气 / 预通道 / SSR / GTAO / 阴影 / 主场景材质 / 体积雾 / TAA-TAAU / 曝光 / 运动模糊 / 景深 / 泛光光晕 / composite / 簇光 / GI），§17 性能与分档、§18 预热、§19 坑、§20 3A 验收清单，设计期草案在文末附录 A。系统参考里的渲染路由表按这个章号走。

新增系统更新参考中的路由；改变跨系统契约更新本入口与测试。历史提案、事故记录和操作细节留在分册，不升级为所有任务的固定步骤。

## Pages 启动产物

- Pages 在独立 staging 目录运行 `Script_BuildBrowserBundle.mjs --deploy --output-dir <staging>/Taierzhuang1938`，将第一方模块合为带内容戳的入口；Three/Rapier 仍用本仓 vendor。每次部署重建，生成文件不提交。
- 源码与本地默认入口继续使用 import map，模块修改仍更新对应版本戳。发布 HTML 仅预载合并入口与 vendor，不再预载全部源码。
- 本地验收：`node Taierzhuang1938/Script_BuildBrowserBundle.mjs --preview` 后用 LocalPreview 打开 `/Taierzhuang1938/_check_Bundle.html?whitebox=p012`；回归入口 `Script_BrowserBundleTest.mjs` 验证普通白盒开始按钮、正式菜单与脚本请求数。
