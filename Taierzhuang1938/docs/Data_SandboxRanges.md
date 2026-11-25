# 测试场登记表、插件与玩法时钟

2026-11-01 起，九个测试场（`?movement=1` `?weapons=1` `?range=1` `?explosions=1` `?melee=1` `?gore=1` `?impacts=1` `?reactions=1` `?cloth=1`）不再在 `Script_Main` 里各接一套线，改成「一张登记表 + 一份插件」；五处各自改 `dt` 的慢放改成往一个玩法时钟登记。门禁 `SandboxRangesTest`（纯 Node）。

## 1. 登记表 `Data_SandboxRanges.mjs`

纯数据、零 import（开机路由那个最小包也读它）。一行一个测试场：

| 字段 | 意思 |
|---|---|
| `id` | 网址开关名 `?<id>=1`，也是菜单 `sandboxMode` 与插件的键 |
| `bootLabel` | 开始按钮的文本键（null = 通用「开始」） |
| `invincible` | 玩家一律无敌（炸点就在人身边） |
| `pinsPhase` | 没有「通关进下一关」 |
| `externalProps` / `trimProps` | 要不要摆外部 GLB 布景 / tzm 饰件层 |
| `tightBounds` | 关卡边界只留 1 m 余量 |
| `muteAudio` | 不建音频上下文 |
| `ownsFrame` | 整帧交给测试场（布料实验室：不走第一人称移动、战斗、HUD、指针锁） |
| `identify` | 准心识别开不开（白刃实验场关） |
| `targetDetail` | 识别开着时要不要细节档（枪械射击场关） |
| `steadyView` | 关掉运动模糊与开镜近景虚化（枪械射击场） |
| `bayonetFixed` | 开局就上着刺刀（白刃实验场） |
| `meleeAnimations` | 开机预载白刃全身动画库（白刃实验场） |

`Data_StartupRouting`（进不进正式菜单、选章生成的网址）与 `Script_Main` 的选关、开局文字、无敌、换关、刺刀、后期都读这张表。

## 2. 插件 `Script_SandboxRanges.mjs`

每个测试场交代：关卡表 `phase`、场地类 `World`、`Create(host)`。`host` 是装配层交过来的工具箱（场地、玩家、相机、各系统，抢指针锁、藏枪模、给手榴弹、换枪补给这几只装配层函数，以及主文件的工具箱 `host.ctx`），插件只取改造前它就在用的那几样。

`Create` 返回的实例接口（没声明的装配层一律不调，门禁逐个核对）：

| 接口 | 谁有 |
|---|---|
| `debugName` / `api` → `window.Tengxian.Debug[debugName]` | MovementRange、WeaponRange、Range、MeleeCombat、GoreRange、ShellImpact、BattleReaction、ClothRange（名字与改造前一致）；`Debug.Explosions` 常驻，不在爆炸场时返回 null |
| `updateSlot` | `afterPlayer`（操作交互、断肢）/ `beforeAi`（枪械射击）/ `afterCombat`（爆炸、炮击扬尘、人物反应）——与改造前在 Frame 里的位置一致 |
| `ScaleDt` | 断肢（乘 timeScale）、炮击扬尘（暂停 / 单步 / 慢放）、人物反应 |
| `CapturesInput` / `ApplyCamera` | 炮击扬尘（自由观察相机） |
| `ownsFrame` / `UpdateCamera` | 布料 |
| `OnInstalled` / `armory` | 枪械射击场：登记后补弹药；装配层的补给、换弹、HUD、命中记账读 `armory` |
| `Maintain` | 靶场、白刃实验场：补兵那个 3 秒节拍里复位木桩兵（没有就不补兵） |
| `holdsRespawn` / `OnPlayerDown` | 白刃实验场：倒下停在原地等重开 |
| `BeforeMeleeUpdate` / `AfterMeleeUpdate` / `PreviewPose` | 白刃实验场：白刃层每帧前清点遭遇战、之后换成动作预览那一帧 |
| `OnKey` / `ActionPrompts` / `UpdatePanel` | 白刃实验场：遭遇点按 F 开打、整条底部提示、每 6 帧刷新面板 |

插件模块还可以带 `startup`（枪械射击场）：轻量开机，只加载列出的 PBR 组与音效、只预载武器模型，不预载担架、飞机、弹坑碎屑。

靶场与白刃实验场的运行时各在 `Script_RangeTargets` / `Script_MeleeLabRuntime`（2026-11-01 从 `Script_Main` 搬来）：木桩兵注册表、遭遇进度、面板与取证口都在那里，经 `host.ctx` 读写主文件的状态；状态跟页面走，换关重建不清，与搬家前一致。`Script_Main` 里已经没有任何测试场的名字。

**加一个测试场**：登记表加一行（含 `phaseId` 与 `sceneId`）→ 建独立场景文件 `Scenes/Test<Name>/Scene_Test<Name>.json` 并在 `Data_SceneAssets.SCENE_LIST` 登记 → 新建独立插件 `Script_SandboxPlugin_<Name>.mjs` 并在 `Script_SandboxRanges` 登记动态 `import()` 与在 `index.html` import map 登记 → 文本表加 `bootLabel` 的键 → `SandboxRangesTest` 的钩子表补一项。不改 `Script_Main`。

2026-11-25 起，全部 10 个功能测试场均已拆分为 9 份独立场景文件（`Scenes/Test*/Scene_Test*.json`，其中 `impacts` 与 `reactions` 共用 `TestShellImpact`）与独立按需插件 `Script_SandboxPlugin_<Name>.mjs`；`Script_BuildBrowserBundle` 采用两阶段共享模块表分包，将各测试场拆为独立 `Script_BundleChunk_*.mjs`，正式游戏与主菜单零下载任何测试场代码与场景文件。测试场景入口已从游戏主菜单「任务选择」移除，统一由本地独立页面 `AdvancedTools/TestScenes.html` 进入（配套桌面快捷方式 `Script_TestScenesLaunch.mjs --shortcut` 生成「测试场景」）。

### 2.1 测试场景实机封面规范与自动更新

- **存放与命名**：所有功能测试场的实机封面统一存放在 `Taierzhuang1938/AdvancedTools/Covers/Texture_TestSceneCover_<PascalId>.webp`（例如 `Texture_TestSceneCover_Explosions.webp`），规格固定为 `1280×720` WebP（位于 `AdvancedTools/` 下，不进入线上 GitHub Pages 发布包，不占玩家下载体积）。
- **自动采集与更新**：任何时候修改了测试场景布局（`Scenes/Test*/`）、场地渲染或新增了功能测试场，直接运行自动化工具进游戏静音实机重拍并覆盖对应 WebP：
  - `node Taierzhuang1938/AdvancedTools/Script_CaptureTestSceneCovers.mjs --changed`：按 Git 改动自动识别受影响的测试场（及缺失封面的新增测试场）增量重拍；
  - `node Taierzhuang1938/AdvancedTools/Script_CaptureTestSceneCovers.mjs --only=explosions,gore`：只重拍指定测试场；
  - `node Taierzhuang1938/AdvancedTools/Script_CaptureTestSceneCovers.mjs`：全量重拍全部功能测试场；
  - `node Taierzhuang1938/AdvancedTools/Script_CaptureTestSceneCovers.mjs --check`：纯 Node 校验全部功能测试场封面文件齐备、为合法 WebP 且体积合理（已接入 `Script_AdvancedToolsTest.mjs` 自动门禁）。
- **新增测试场**：在 `Script_CaptureTestSceneCovers.mjs` 的 `WATCH_PATTERNS` 与 `SHOT_PRESETS` 中补一条取景配置，跑一次 `--only=<id>` 生成封面即可。

## 3. 玩法时钟 `Script_GameClock.mjs`

`Frame` 开头只有 `dt = clock.Step(realDt)`。缩放器按 `order` 先后叠加（`CLOCK_ORDER`：白刃 QTE 10 → 测试场 20 → 编辑器持枪检查 50，与原来那五行的顺序一致）；可返回 0（暂停）或固定步长（单步）；`realDt` 原样留着给 QTE 按键窗口与编辑器面板。测试场的缩放器在 `InstallSandbox` 登记、`DisposeSandbox` 撤掉。取证口 `window.Tengxian.Debug.Clock()` 返回这一帧的真实 / 玩法时间与当前登记的缩放器。
