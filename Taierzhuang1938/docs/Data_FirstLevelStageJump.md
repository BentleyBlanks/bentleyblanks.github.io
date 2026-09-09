# 第一关 18 阶段与调试跳转

来源：[Notion 第一关｜往南的路](https://app.notion.com/p/3d360335331c81ea86f6f637ab92327c)，本轮读取的页面版本 2026-09-07 09:30 UTC。最后的第六至十三阶段扩展修订覆盖原文转运区编号，因此 11 为抵达、12 为完整防御、13 为第一轮空袭及接替担架；其后沿原文第 14–18 阶段。仅读取需求，不写回 Notion。

玩家在主菜单或暂停菜单打开“调试选项”，选择“第一关 · 18 阶段快速跳转”，点击“跳转并继续”。

```javascript
const debug = window.Tengxian.Debug; // window.Taierzhuang 同一接口
debug.FirstLevelStages(); // 18 个目录条目、number、id、title、steps、current
await debug.FirstLevelJump(14); // 1–18；返回跳转完成后的任务状态
await debug.FirstLevelJump("Reception"); // 等同于第 16 阶段
debug.FirstLevelMission(); // phaseNumber / phaseId / phaseTitle / phaseCount
```

必须等待 Promise 完成后再输入；加载中的第二次请求会被拒绝。无效编号在修改现场之前报错。`stage`、`index` 与旧快照仍指内部执行步骤，保持已有回归脚本兼容。正常流程的所有事实门和最短节奏保留。

从主菜单或其他测试场跳转时，沿既有选关流程导航到第一关页面，API 返回 `navigating/url/phaseNumber` 回执；agent 应等待新页面的 `state.ready && state.running` 与目标 `phaseNumber`。也可直接打开 `?whitebox=p012&missionStage=14`（支持编号或 id），加载完成即从指定阶段开始；刷新重进同一阶段，退出第一关或普通选关会清除此参数。

| 阶段 | id | 执行步骤 |
|---|---|---|
| 1 军列上的人味 | Train | Train |
| 2 接近卸载点，遭遇炮击 | Unloading | Unloading |
| 3 支援外围阵地 | Support | Support |
| 4 接手机枪 | MachineGun | MachineGun |
| 5 集束手榴弹炸停战车 | Tank | Tank |
| 6 后送命令 | Orders | Orders |
| 7 真正往南 | South | South |
| 8 村口截击 | Village | Village |
| 9 第一次大刀／刺刀近战 | Melee | Melee |
| 10 夺院并掩护伤员通过 | Courtyard | Courtyard |
| 11 转运区抵达 | TransferApproach | TransferApproach |
| 12 完整转运区防御 | Transfer | Transfer |
| 13 空袭与接替担架 | AirFirst | AirFirst → Carry |
| 14 第二轮扫射与松手 | Dive | Dive → Rescue |
| 15 撤向接收院 | RetreatFirst | RetreatFirst → RetreatWall → RetreatYard |
| 16 接收院战斗 | Reception | Reception → FinalCarry |
| 17 老周牺牲 | Death | Death |
| 18 接收院撤离 | FinalDefense | FinalDefense → Exit |

跳转是可重复的阶段起点：重建本轮关卡和此前完成事实，保留当前阶段的任务条件。原先本轮的弹药、伤亡、破坏与未来事实不沿用；这避免后退时门已打开、敌人消失、QTE 或担架状态残留。调试开关沿用菜单设置。普通“从当前检查点继续”仍恢复原现场，两者含义不同。

`Script_FirstLevelMissionCheckpoint` 用原后送系统离线推进队列、装载、车辆离开、空袭损坏和接收院进度，缓存独立副本。`Script_FirstLevelMissionStageJump` 装配实际演员、机枪、车门、战车、未完成遭遇、对白回执与持担架状态。第二阶段按车厢对白及停顿时长还原军列已行驶距离，再由真实炮击触发刹车；重试点保存在车厢局部坐标。当前阶段之后继续使用正常 Runtime.Update 和真实交互。

验收入口：`Script_FirstLevelMissionTest.mjs` 检查目录、事实边界、列队状态及副本隔离；`Script_FirstLevelMissionStageJumpTest.mjs` 检查 18 个真实浏览器起点、菜单操作、反向/重复跳转及空袭/临终续接；`Script_FirstLevelMissionBrowserTest.mjs --campaign --stage-jumps` 从每个阶段起点分别用真实输入推进到下一阶段，最后通关；不带 `--stage-jumps` 单独验证正常通关。调试跳转验收不能当作正常通关证据。截图和日志保存在本地 `_shots/FirstLevelStageJump`、`_shots/FirstLevelStageContinue` 和 `_shots/FirstLevelMission`。

接收院及结尾可用 `node Taierzhuang1938/Script_TestRunner.mjs --only=FirstLevelMissionStageTailTest --verbose` 定向复测；它复用同一真实输入流程，只从第 16 阶段开始，证据保存到 `_shots/FirstLevelStageTail`。

2026-09-09 本次验收：18 个入口及反向/重复跳转通过（162.9 秒）；第 1–15 阶段在逐段测试中各自完成至下一阶段，第 16 阶段入口落点修正后，第 16–18 阶段定向复测通过并到达 Complete（140.3 秒）。正常整关 `--campaign --audio` 独立通过（1244.1 秒），包含原有任务事实、真实输入、配音播放与节奏断言。64 项 quick 检查、菜单、打包入口、七切片启动、任务表现与车厢动画专项均通过；截图已检查。完整逐段测试与末段复测的证据分开保留，不将调试通关计为正常通关。
