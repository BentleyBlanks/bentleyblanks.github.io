# 编辑器审计（2026-10-13）：过时 / 有问题 / 信息冗余

> **2026-10-31 用户要求删除** 场景关卡、地形编辑器、完整场景预览、采样点四个工具（代码已删，构件目录搬到 `Script_PlaceableCatalog.mjs`，另留不进菜单的 `Script_EditorShotCamera.mjs`）：下表里这四个工具的行已作废，仅作历史记录。

状态：**只列问题，未处理**，等用户挑选。基线是高级工具重构前的 HEAD `066c0502`；文件:行号以该提交为准
（本轮只改了外壳 `Script_Editor.mjs`、设置宿主与菜单，下面各编辑器正文的行号仍有效）。

方法：逐文件读代码，核对运行时接口是否还在，对照 `git log` 与 AGENTS.md / docs 的下线说明；再实机复核——
`?phase=2` 打开 25 个入口、`?whitebox=p012`（真实第一关）打开 15 个，console 零 error、无 pageerror。
「确认」= 代码或实机证实；「推断」= 只由代码推出。

**结论**：没有一个编辑器打不开。问题集中在三类：

1. **读旧七章 / 旧县城数据**：场景关卡、地形、可破坏预览、PCG 撒点、采样点、完整场景、场景样条、过场时间轴。
   `Data_Battle.PHASES` 是 2026-09-06（`048620a3`）退出菜单的七章切片表；真实第一关是 `?whitebox=p012`，那时 `phaseIndex` 恒为 0。
2. **读数白名单吞数**：`Script_EditorUi.mjs:260-286` 的 `Facts(parent, keys)` 丢掉不在白名单里的键。
   `9656fef8`（09-06「simplify editor panels」）加了白名单却没删后面的计算，于是不上屏的读数仍每帧在算；
   反过来，音效音乐与过场时间轴里「出错才出现」的行也被吞掉了。
3. **少数真 bug**（见下）。

## 清单 1：过时 / 没作用 / 有问题

### 1A. 面向旧七章 / 旧县城的编辑器

| 编辑器 | 文件:行号 | 证据 | 程度 | 建议 | 确认度 |
|---|---|---|---|---|---|
| 场景关卡 | `Script_EditorScene.mjs:47, 796-806` | 「关卡切片」列表读 `PHASES`：序章·出川 + 第一到五关 + 终章共 7 项；第一关下点任一项 = `JumpToLevel` 重载当前关 | 过时 + bug | 删这一节；要留就改读 `host.game.PHASES` | 确认 |
| 场景关卡 | `Script_EditorScene.mjs:1934-1941, 1768` | 「当前关」用 `PHASES[state.phaseIndex]`，第一关显示 `CH0_Chuchuan · 序章 · 出川`；存档 `level` 字段也写这个错值 | bug | 改读 `game.PHASES` 或删 | 确认 |
| 场景关卡 | `Script_EditorScene.mjs:978, 1921-1951` | 取证白名单只留 3 项，机位 / 地高 / draw call / 三角 / 碰撞盒 / 切片 / 天光全丢，却每帧算并 `info.reset()` | 无作用 | 删被丢的计算 | 确认 |
| 场景关卡 | `Script_EditorScene.mjs:551-559, 1465-1470` | 「模型」类没过滤停用的 `ServicePistol`；`:559` 三元两支相同；注释仍写「六关、界河」 | 过时（轻） | 过滤 `WeaponShelved`，改注释 | 确认（手枪一项推断） |
| 地形编辑器 | `Script_EditorTerrain.mjs`（继承 SceneEditor）；`Script_EditorScene.mjs:1688-1710` | 笔刷只认旧县城 `CityPlatform` / `OuterGround`；第一关场地没有 `city`，每笔只提示「这片网格太疏」。唯一提交 08-24；继承来的切片列表同病 | 无作用 + 重复 | 删，或并回场景关卡 | 笔刷无效推断；列表确认 |
| 可破坏场景预览 | `Script_EditorDestruction.mjs:19-25, 55, 140-149, 219-248` | hint 写「七关」；墙 / 楼板 / 承重 tag 是旧县城的，第一关只有 `whiteboxWall` / `airWall`；`Data_Destruction.GAMEPLAY_DESTRUCTION_ENABLED = false` | 过时 | 标「搁置特性」或折叠 | 列表确认；定位失效推断 |
| 可破坏场景预览 | `Script_EditorDestruction.mjs:202-204, 502-541` | 白名单吞关卡 / 可破坏 / shader 体积等，`Update` 每帧遍历全部 colliders | 无作用 | 改按需取证 | 确认 |
| PCG 撒点 | `Data_PropPcg.mjs:201-262`；`Script_EditorPropPcg.mjs:322` | 全是旧县城坐标，第一关范围外；第一关下仍列 21 区，零产出 | 过时 | 删，或只留给 `?phase=N` | 确认 |
| PCG 撒点 | `Script_EditorPropPcg.mjs:172, 435-442` | 区段叫「规则与 GPU 取证」，GPU 读数 6 项全被吞 | 无作用 | 删 `Set`、改标题 | 确认 |
| PCG 撒点 | `Script_EditorPropPcg.mjs:569, 574` | localStorage 读写没 try，存储被禁用时编辑器打不开 | bug（低） | 补 try | 推断 |
| PCG 撒点 | `Script_EditorPropPcg.mjs:292-308, 489-494` | 样条体切到矩形 / 院落格后 `count` / `chance` 滑杆值为 undefined | bug（低） | 切换时补默认值 | 推断 |
| 采样点 | `Data_SamplePoints.mjs`；`Script_EditorSamplePoints.mjs:249-260` | 85 点全是旧县城基线，第一关 0 个；点一个镜头飞到县城坐标 | 过时 | 归档或标「仅 overview」 | 确认 |
| 采样点 | `Script_EditorSamplePoints.mjs:101, 196-200` | 说明写「仅显示当前切片内的点位」，实际只按分组过滤 | bug（文案） | 改文案或真过滤 | 确认 |
| 完整场景预览 | `Script_EditorFullScene.mjs:22, 54-70, 224-228, 320-333` | 「奇观 · 出川车厢」挂旧序章 `CS_Chuchuan.props`；「完整县城」是旧县城 | 过时 | 删车厢视图；县城由你定 | 车厢确认 |
| 完整场景预览 | `Script_EditorFullScene.mjs:306-318, 373-483` | 县城样条段是场景样条PCG 的只读子集 | 重复 | 删样条段 | 确认 |
| 完整场景预览 | `Script_EditorFullScene.mjs:92-96, 173-198` | `ENV_LABELS` 缺 `firstLevelBattleDay` / `firstLevelNight`（显示英文 id）；`CollapsedJson` / `seedList` 无人调用 | bug（低）+ 死代码 | 补标签、删死代码 | 确认 |
| 场景样条PCG | `Script_EditorSplines.mjs:229-325, 431-434` | `levelId` 用 `PHASES[builtPhase]`；第一关 51 条路线里 28 条是县城数据 | 过时 + bug | 按场地过滤 | 确认 |
| 场景样条PCG | `Script_EditorSplines.mjs:69, ~640-649, 1429` | 4 个墙预设（17 根滑杆）只被旧县城使用；`LEGACY_STORE_KEY` 是 08-27 改名前的旧存档 | 无作用 | 无墙时折叠；删迁移 | 墙确认 |
| 过场时间轴 | `Script_EditorTimeline.mjs:30, 70`；`Data_TengxianScript.mjs:355-361, 452-457` | 7 场里只有 `CS_MachineGunCaptives` 还在正片，其余 6 场注释写「从正片流程脱钩」；hint 写「五场」；「出川」重名两条 | 过时 | 旧场折叠成「留档」 | 确认 |
| 过场时间轴 | `Script_EditorTimeline.mjs:105, 122, 288-299, 329-333` | 自检白名单只留「自检 / Play 失败」，问题明细被吞；「轨道最快」不可见（现在自检全过，潜伏） | bug（潜伏） | 明细放进白名单 | 确认 |
| 音效音乐 | `Script_EditorAudio.mjs:253, 307, 319, 552-608` | 白名单吞了采样 / 人声 / 环境 / 音乐的「报错」行——文件头说这是查「为什么读不到」唯一有用的信息 | bug | 出错行必须放行 | 确认 |
| 音效音乐 | `Script_EditorAudio.mjs:69-76, 82-135, 295-319` | 一批音效 / 音乐只被旧章引用；说明还写「三关处决段」「终章发报」；头注「33 个配方」实际 120 | 过时 | 折叠「旧章」组、改文案 | 部分推断 |
| 音效音乐 | `Script_EditorAudio.mjs:134-135, 173-175, 334-339` | `VOICE_KIND` 缺 `yell` / `tank` / `nier` / `story`，显示英文且没有「喊 X」按钮 | 无作用（轻） | 补表 | 确认 |

### 1B. 人物 / 枪械

| 编辑器 | 文件:行号 | 证据 | 程度 | 建议 | 确认度 |
|---|---|---|---|---|---|
| 人物面部 | `Script_EditorFacial.mjs:133-134` | 19 条对白的对齐表 sha 与新录音对不上，代码不回退 `SceneAlignment`，直接报「缺少当前录音的有效说话人对齐」 | bug | sha 不符时回退或重生成对齐表 | 数据确认，界面推断 |
| 人物面部 | `Script_EditorFacial.mjs:32, 94` | `retired:true` 的 3 条对白没过滤；角色「keeper」只出现在退役对白里 | 过时 | 过滤 retired | 确认 |
| 人物动作 | `Script_EditorActor.mjs:561, 850-902` | 白名单只留 4 项，`meshSource` 等丢了，模型加载失败看不见（与 Data_EditorSuite.md 矛盾） | 无作用 | 补回或删计算并改文档 | 确认 |
| 人物动作 | `Script_EditorActor.mjs:489-490` | 武器下拉把 3 辆战车和迫击炮也给人拿 | bug（疑似） | 排除车辆 | 推断 |
| 人物动作 | `Script_EditorActor.mjs:1-19, 41-43, 398, 413-417` | `this.manual` 恒 false，连带死分支；头注数字过期 | 过时 | 清理 | 确认 |
| 人物动作 | 百姓类 | 默认模式下百姓动作列表为空，看不到妮儿（`girl`） | 缺口 | 自动切程序化 + 变体选择 | 确认 |
| 小队行进 | `Script_EditorSquadMarch.mjs:158` | `modelVariant:i%4`，但选模清单只批准 1 和 4，其余静默退回随机 | 旧数据 | 改取获准变体轮换 | 确认 |
| 枪械 | `Script_EditorWeapon.mjs:265, 631-682` | 数据卡白名单只剩「模型」一行，约 20 行全丢（docs 仍写「照抄 Data_Weapons」） | 无作用 | 恢复常用字段或删 | 确认 |
| 枪械 | `Script_EditorWeapon.mjs:367-378` | 「复制配置」输出格式没有运行时表接收 | 无作用 | 删或补接收 | 推断 |
| 枪械 | `Script_EditorWeapon.mjs:97-101, 477-480` | 停用手枪、迫击炮、掷弹筒、战车在第一人称下是空手，无提示 | 无作用 | 选中时禁用第一人称 | 确认 |
| 第一人称持枪检查 | `Script_EditorFirstPerson.mjs:298, 767-800` | 白名单只留 3 行，另 10 行全丢 | 无作用 | 删这些 `Set` | 确认 |
| 第一人称持枪检查 | `Script_EditorFirstPerson.mjs:246-266, 513-584` | 动画片段只有汉阳造 Idle 一条，其余 8 件装备的播放控件全是空转 | 无作用（8/9） | 无片段时隐藏 | 确认 |
| 枪械 ↔ 第一人称持枪检查 | `Script_EditorWeapon.mjs:211-233` / `Script_EditorFirstPerson.mjs:40, 199-245` | 都有装备列表、开火 / 拉栓 / 装填 / 白刃与开镜；口径不一致（`Type92Hmg`） | 重复 | 动作按钮只留一处 | 推断 |

### 1C. Debug工具（叠加层）

| 工具 | 文件:行号 | 证据 | 程度 | 建议 | 确认度 |
|---|---|---|---|---|---|
| Debug Rendering | `Script_EditorDebugRendering.mjs:766-824, 853-867` | 簇热图 / 光源球函数在、UI 开关丢了（`1f08e5ac` 时还有），全仓无调用；渲染管线文档 §15.8 仍写有 | 无作用 | 删或补 UI | 确认 |
| Debug Rendering | `:826-847` | `FirstPersonStatus()` 无人调用 | 无作用 | 删 | 确认 |
| Debug Rendering | `:29/:35`（dof / dofCoc）、`:40/:41`（motionVector / velocity） | 新旧两套视图并存，旧的自述「旧版」 | 重复 | 删旧的 | 推断 |
| Debug Rendering | `:872-874` | 两个 if 互相覆盖，「当前画质不支持」提示可能被盖掉 | bug（低） | 修 | 确认 |
| WorldInfo ↔ 玩家状态 | `Script_EditorWorldInfo.mjs:80-85` | 姿态 / 接地 / 水平速度重复；WorldInfo 独有的只有位置、朝向、地高、眼高、垂直速度 | 重复 | WorldInfo 并进玩家状态当一个分组 | 确认 |
| 敌军 AI | `Script_EditorAi.mjs:62-69` | `STATE_COLORS` 缺 `watch`，落到兜底灰 | bug（小） | 补色 | 确认 |
| 敌军 AI ↔ 玩家状态 | `Script_EditorAi.mjs:1404-1413`；`Script_AiProbeScene.mjs:202-205` | 试验场「玩家无敌」把血量写成 1e9，不走 `player.debug.invincible`，两套无敌各说各的 | 口径冲突 | 合并 | 推断 |
| Profiler | `Script_ProfilerReport.mjs:44, 83-105` | `CPU_LABELS` 的 story / mission / train 发射点已删；`GPU_NOTES` 缺 4 个新 pass | 过时 | 删死标签、补说明 | 确认 |
| Frame Debugger | — | 接口全在，未见过时或 bug | 无 | 只有冗余（清单 2） | 确认 |

### 1D. 关卡编排工作台

与 18 阶段 / 27 步骤口径一致，接口都在，不与其它编辑器重复。细节问题：

| 位置 | 文件:行号 | 证据 | 程度 | 建议 |
|---|---|---|---|---|
| 批注保存 | `Script_EditorOrchestration.mjs:2653, 2871` | 整表覆盖不合并：agent 用 CLI 结案后，没点「重新加载」就保存，会把结案写回待处理 | bug | 保存前重读、按 id 合并 |
| 「从这里试玩」 | `:2483`；`Script_Main.mjs:2617` | `midCutscenes=false`，与菜单「阶段跳转」（true）不一致 | 重复 / bug | 合并入口或传参 |
| 敌军组中文名表 | `Script_MissionOrchestrationFilter.mjs:100-120` | 缺 7 组（`sapInfiltrators`、`tankCrew`、`southMouth`、`streetPush`、`alleyPop`、`roofThrower`、`laneWave2`），显示英文 id；`bundleApproach` 已改名 | 过时 | 补表 |
| 路线 fallback | `Script_MissionOrchestrationFilter.mjs:239` 等 | 没有 guidance 的阶段画全部 34 条，含标「无人走」的与 4 对重复、已删的 `flank` | 过时 / 重复 | fallback 不画 |
| 友军 · 防御点 | `Script_MissionOrchestration.mjs:265` | 5 段沙袋墙被画成 5 枚友军 Hold 图标 | 归类错 | 从友军删 |
| 预备队 / 放行 | `Script_EditorOrchestration.mjs:98-100, 3181-3182` | 实跑 103 人这几栏全空；现行 `frontReserve` 用 `role:"reserve"` 没读 | 无作用 | 改读 role |
| 「会怎么动」 | `:3188-3189` | 剧情脚本驱动的 40 多人被写成「不动，守在原地」 | 读数不实 | 写「由剧情脚本驱动」 |
| 死字段 / 遗留 | `:703-704`、`Script_MissionOrchestration.mjs:478`、`Data_OrchestrationIcons.mjs:111` | `spawned`、`transferBeats`、`Retreat*`、`train` / `unload` | 过时 | 删 |
| 开关重复 | 图层面板、分类抽屉眼睛、6 个预设 | 三套机制开关同一批类别 | 重复 | 留一处 |

另：`Script_OrchestrationEditorTest` 的「敌军按组列出 18 组」（实际 24）与「80 人」（实际 103）两条断言在 03–11 重构加组后就红，是基线红，与本轮外壳改动无关。

### 1E. 其他

| 编辑器 | 文件:行号 | 证据 | 程度 | 建议 |
|---|---|---|---|---|
| 构件库预览 | `Script_EditorPropLibrary.mjs:30-39` | 11 个接收院医疗陈设进不了分类列表，只能「上一个 / 下一个」翻到 | bug | 分类并入外部目录类别 |
| 构件库预览 | `:100, 279-305` | 取证白名单丢 8 行；同一次选择重复建预览 | 无作用 | 删 |
| 特效预览 | `Script_EditorVfx.mjs:236, 278` | 切到「空白粒子效果」把全局 `loop` 置 false，「自动重播」开关不同步 | bug（轻） | 同步开关 |
| 特效预览 | `:280-284, 386` | 暂停时每帧对每个系统 `Export`（含 JSON 深拷贝） | 性能浪费 | 节流 |
| 资产规范 | `Script_EditorAssetStandards.mjs:182` | 未用变量、空 `Update`；docs 写 44 行实际 56 | 无实质问题 | 清理 |
| 贴图管理 | `TextureManager.html` | 清单有效；importmap 有 2 个依赖戳落后、残留 `Script_RailBridgeSet` 戳 | 轻微 | 同步戳 |

## 清单 2：信息冗余

| 编辑器 | 分节 / 控件 | 文件:行号 | 为什么冗余 | 建议 |
|---|---|---|---|---|
| 全体 | 被白名单吞掉的 `Set` 及每帧计算 | `Script_EditorUi.mjs:260-286` + 12 个编辑器的 `RefreshFacts` | 不上屏仍每帧算 | 统一清：删或移到取证口；出错行放行 |
| 第一人称持枪检查 | 「截图与取证」5 行 JSON 文本框 | `Script_EditorFirstPerson.mjs:294-295, 798` | 每 0.15 s 序列化整份快照，「复制检查 JSON」已能做 | 删文本框 |
| 第一人称持枪检查 | 右下图例；腰射 / 开镜 / 冲刺 chips 与「开镜权重」滑杆 | `:221-234, 302-317` | 挂点已有文字标签；两控件管同一件事 | 删图例，留一个 |
| 人物动作 | 牛马车 Note、两组播放按钮 | `Script_EditorActor.mjs:549-592, 749, 853-856` | 尺寸写两处；人物与牛马车各一组相同按钮 | 合并 |
| 枪械 | 校准文本框与 Note、每帧刷新 | `Script_EditorWeapon.mjs:260-262, 362-390, 609-628` | 说明重复，文本框每帧写 | 删其一，变化时写 |
| 小队行进 | 侧栏「全队状态·最近 15 秒」 | `Script_EditorSquadMarch.mjs:101-103, 196-197` | 只剩一行图例，真时间线在底部浮层 | 删，降频 |
| 人物面部 | 每帧重画波形；三条常驻提示 | `Script_EditorFacial.mjs:41-61, 245-250` | 空闲没人看；长期说明常驻 | 只在播放时刷新；说明改悬停 |
| 特效预览 | 「运行状态」6 行；预设页 9 行 JSON + 三条导入导出路；5 条常驻 Note | `Script_EditorVfx.mjs:227-263, 378-382` | 与列表、滑块重复 | 删前三行；折叠，只留下载与选文件 |
| 特效预览 | 每条曲线的坐标轴说明 + 4 按钮 | `Script_EditorParticleInspector.mjs:35-39` | 几十条曲线重复渲染 | 选中再展开 |
| 音效音乐 | 三块 Facts；按钮墙（环境床 13 + 音乐 17，按钮上是内部 id）；「盲听指认」整节 | `Script_EditorAudio.mjs:253-386` | 每帧算再丢；按钮墙；偶尔才用 | 先修报错行；改下拉或折叠 |
| 过场时间轴 | 日志框 12 行每帧重取；「Alt 释放鼠标」常驻 | `Script_EditorTimeline.mjs:104, 121-128` | 常驻说明 | 日志默认折叠 |
| 场景关卡 / 地形 | 「关卡切片」整节；「取证」整节；名牌 HUD 每帧投影 | `Script_EditorScene.mjs:794-807, 976-979, 1339-1410` | 指向错误；只剩 3 行；每帧对约 100 个点投影 | 删；并入「已放置」；节流 |
| PCG 撒点 | 状态 Note；样条体控制点 TextArea；「存取 / 交付」5 行 TextArea | `Script_EditorPropPcg.mjs:179-183, 243-259, 443-444` | 常量文字；裸 JSON 常驻 | 只在出错时显示；折叠；导出走下载 |
| 场景样条 | 取证区每帧重建路径；两句说明重复；17 根墙滑杆 | `Script_EditorSplines.mjs:555-683, 1654` | 基本不变；说两遍；第一关空转 | 事件驱动；留一处；按关过滤 |
| 可破坏预览 | 「最近结果」写读数又写 `SetHint` | `Script_EditorDestruction.mjs:194, 511, 560` | 同一句每帧两处 | 留一处 |
| 完整场景预览 | 巡场说明；环境区 14 个 chips（含开发用预设）+ 重复的预设行 | `Script_EditorFullScene.mjs:290-348, 491` | 副标题已有；chips 选中后又写一行 | 删；砍到几个 |
| 采样点 | 6 行导出 / 导入文本框；固定说明 | `Script_EditorSamplePoints.mjs:101, 181, 187` | 导出后才有内容却常驻；说明与事实不符 | 折叠；删说明 |
| 白盒画质 | 「实际运行：Pass 链」每帧写；长说明 | `Script_EditorWhiteboxQuality.mjs:36, 59, 74-77` | 与「当前：白盒画质」重叠 | 变化时写；删长说明 |
| Debug Rendering | 56 个视图格；物理区 5 个分类开关 + 图例 | `Script_EditorDebugRendering.mjs:20-81, 672-701` | 白盒画质下大量格子只出「不可用」斜纹；常用的只有开关与透视 | 按画质置灰；低频组折叠；分类开关折叠 |
| Frame Debugger | 右栏底部约 500 字说明；Render State / Properties 默认展开、逐纹理 GPU 读回 | `Script_EditorFrameDebugger.mjs:147, 246-252, 380-392, 562-713` | 三处重复 GPU/CPU；按住步进时读回最吃；Raw JSON 与导出、agent 接口重复 | 说明改「?」；默认折叠；点开再读；删 Raw JSON |
| WorldInfo | 底部说明句；视点世界 Y、眼高 | `Script_EditorWorldInfo.mjs:88` | 常驻说明；调参才用 | 随合并处理 |
| 玩家状态 | 约 63 行里的纯开发读数；弹药槽位；调试开关只读副本；JSON 导出；说明 | `Script_EditorPlayerState.mjs:72-202` | `heartbeat` / `airTime` 等调参数；HUD 已显示弹药；开关与调试选项重复 | 折叠「开发取证」；删重复项 |
| Profiler | 场景节点普查表（每秒遍历全场景）；导出两份；三行说明；`headStats` | `Script_EditorProfiler.mjs:306-392, 1496-1521` | 不属于热点定位；与 ProfileCli 重叠；指标与图例重复 | 默认折叠；留一个导出 |
| Profiler | 「掉帧取证」+「事件」两块文本 | `:357-365, 1623-1633` | 与尖峰标记、时间轴重复 | 留最差帧跳转，事件折叠 |
| 敌军 AI | 单兵 / 黑板 Facts 约 20 行内部字段 | `Script_EditorAi.mjs:938-939` | 设计者看不懂 | 只留 state / role / alert / suppression / target / cover.phase / task.kind |
| 敌军 AI | 概览 11 个开发计数；世界页「开销」；试验场「现场」 | `:597-646, 1130-1133, 1356-1419` | 调优后才有意义；与概览重复 | 概览只留存活与攻击令牌 |
| 敌军 AI | 调参页 423 根滑杆按表分页不折叠 | `:1202-1227` | 一页 70~108 根 | 分组默认折叠 + 搜索框 |
| 敌军 AI | 掩体点层每帧重填 400 点 | `:526-531, 1046 起` | 停在概览页也在画 | 默认关，仅世界页画 |
| 关卡编排 | 步骤卡标签用内部 id；长提示；顶栏版本号 | `Script_EditorOrchestration.mjs:771, 959-1015, 2971` | 主文字是代码名 | 中文名为主，id 放悬停 |
| 关卡编排 | 地图 72 个锚点常驻（49 个无引用）、英文标签；分类抽屉默认展开 | `Script_EditorOrchestrationMap.mjs:1422-1577, 2410-2440`；`:3541` | 吃地图宽度；与图层重复 | 默认关锚点、短名、抽屉收起 |
| 关卡编排 | 敌军布设表 9 列；详情卡原始 JSON；内部引用行 | `:1531-1617, 1705, 3103, 3203-3210` | agent 读 notes.json 与 CLI，不读界面 | 移到取证口 |
| 关卡编排 | 批注卡编号 / 路径 / 新旧对照表；导出 4 按钮；失败文案带 localStorage 键名 | `:1740-1744, 2733-2736, 3328-3395` | 缩略图已显示；违背「源码路径不放面板」 | 放悬停；留「复制交接文本」；一句话 |
| 关卡编排 | 结案批注仍画在图上；「实际」行 4 Hz 跳；每 0.25 s 拉整份运行时状态；地图每 0.5 s 全量重画 | `:687-726, 2008-2042, 2783, 3325, 3702-3715` | 用 10 个字段却取几百个；签名带时钟 | 只画待处理；轻量取数口；签名去时钟 |

资产规范的 8 列表本身是测试结果，保留。

## 需要实机确认的点

1. 第一关里地形笔刷是否每笔都提示「太疏」；可破坏预览三个「定位」是否找不到东西；PCG 是否零产出；点采样点是否飞到县城。
2. 「关卡切片」列表点任一行（含越界下标）的真实表现，以及可破坏预览会不会绑到上一个场地（`JumpToLevel` 不 clamp）。
3. 人物面部选那 19 条对白，是否真的报「缺少当前录音的有效说话人对齐」。
4. 过场时间轴选 `CS_MachineGunCaptives` 在非对应场景是否错位。
5. 人物动作给人配坦克 / 迫击炮的实际渲染；`Type92Hmg` 在枪械第一人称视图能否显示。
6. 标「推断」的各项，以及 `flareLaunch` / `telegraphKey` / `mgOverheat` 是否还有动态拼名的调用。
7. 体验类：Frame Debugger 按住步进是否掉帧；关卡编排首次开窗 `BuildGround`（约 30 万格采样）卡顿；15–18 阶段敌军为空是否有意。
8. 开机有 119–124 条 `THREE.Texture: Unable to serialize Texture` 警告与一条「这一章没有剧本：FirstLevelP012Whitebox」，与编辑器无关，未追。

## 文档同步欠账

`Data_EditorSuite.md` 里 Audio「32 个」、资产规范「44 行」、DebugRendering「当前靶」、第一人称「15 项」（现 9 项）、
关卡编排步骤描述、「七关」；`Data_TechRenderPipeline.md` §15.8 的簇热图；`Data_FacialEditor.md`「整段多人录音仍是一条原始 MP3」。
