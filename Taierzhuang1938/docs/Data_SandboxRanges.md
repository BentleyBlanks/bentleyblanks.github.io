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
| `respawn` | 补兵：null 不补；`range` / `melee` 走装配层的木桩兵复位 |
| `externalProps` / `trimProps` | 要不要摆外部 GLB 布景 / tzm 饰件层 |
| `tightBounds` | 关卡边界只留 1 m 余量 |
| `muteAudio` | 不建音频上下文 |
| `ownsFrame` | 整帧交给测试场（布料实验室：不走第一人称移动、战斗、HUD、指针锁） |

`Data_StartupRouting`（进不进正式菜单、选章生成的网址）与 `Script_Main` 的选关、开局文字、无敌、补兵、换关都读这张表。

## 2. 插件 `Script_SandboxRanges.mjs`

每个测试场交代：关卡表 `phase`、场地类 `World`、`Create(host)`。`host` 是装配层交过来的工具箱（场地、玩家、相机、各系统，以及抢指针锁、藏枪模、给手榴弹、换枪补给、撒木桩兵这几只装配层函数），插件只取改造前它就在用的那几样。

`Create` 返回的实例接口（没声明的装配层一律不调，门禁逐个核对）：

| 接口 | 谁有 |
|---|---|
| `debugName` / `api` → `window.Tengxian.Debug[debugName]` | MovementRange、WeaponRange、GoreRange、ShellImpact、BattleReaction、ClothRange（名字与改造前一致）；`Debug.Explosions` 常驻，不在爆炸场时返回 null |
| `updateSlot` | `afterPlayer`（操作交互、断肢）/ `beforeAi`（枪械射击）/ `afterCombat`（爆炸、炮击扬尘、人物反应）——与改造前在 Frame 里的位置一致 |
| `ScaleDt` | 断肢（乘 timeScale）、炮击扬尘（暂停 / 单步 / 慢放）、人物反应 |
| `CapturesInput` / `ApplyCamera` | 炮击扬尘（自由观察相机） |
| `ownsFrame` / `UpdateCamera` | 布料 |
| `OnInstalled` / `armory` | 枪械射击场：登记后补弹药；装配层的补给、换弹、HUD、命中记账读 `armory` |

装配层只剩三个测试场还有逻辑留在 `Script_Main`：靶场撒 / 复位木桩兵、白刃实验场（面板与木桩）、枪械射击场的弹药规则与轻量开机资产。这些等装配层整体拆成系统时再搬。

**加一个测试场**：登记表加一行 → 插件里写 `phase` / `World` / `Create` → 文本表加 `bootLabel` 的键 → `SandboxRangesTest` 的钩子表补一项。不改 `Script_Main`。

发布包（esbuild 整包，不开代码分割）照旧把测试场代码打在游戏包里；按需加载要改打包设置，是另一件事。

## 3. 玩法时钟 `Script_GameClock.mjs`

`Frame` 开头只有 `dt = clock.Step(realDt)`。缩放器按 `order` 先后叠加（`CLOCK_ORDER`：白刃 QTE 10 → 测试场 20 → 编辑器持枪检查 50，与原来那五行的顺序一致）；可返回 0（暂停）或固定步长（单步）；`realDt` 原样留着给 QTE 按键窗口与编辑器面板。测试场的缩放器在 `InstallSandbox` 登记、`DisposeSandbox` 撤掉。取证口 `window.Tengxian.Debug.Clock()` 返回这一帧的真实 / 玩法时间与当前登记的缩放器。
