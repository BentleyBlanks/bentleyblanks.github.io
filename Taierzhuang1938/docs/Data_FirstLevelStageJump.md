# 第一关 18 阶段与调试跳转

现行来源是 [2026-09-19 采用稿](Data_FirstLevelRebuildSource20260919.md) 与
[分包契约](Data_FirstLevelRebuild20260919Contract.md)。第一关公开 18 个阶段、27 个可玩内部步骤；流程表另有终止哨兵 `Complete`；
调试菜单保持 18 项。2026-09-14 及更早的军列、卸载场、黑屏跳到村口与旧撤退尾段均已下线。

玩家可在主菜单或暂停菜单打开“调试选项”，选择“第一关 · 18 阶段快速跳转”，点击“跳转并继续”。
agent 可调用：

```js
const debug = window.Taierzhuang.Debug;
debug.FirstLevelStages();       // 18 个目录条目：number / id / title / steps / current
await debug.FirstLevelJump(14); // 接受 1–18
await debug.FirstLevelJump("Handover"); // 等同第 16 阶段
```

必须等待 Promise 完成后再输入；加载中的第二次请求会被拒绝，无效编号在改动现场前报错。
`stage` / `index` 指内部步骤。Flow v2 快照按稳定 `stageId` 恢复，不兼容 2026-09-19 以前的 v1 旧存档。
跳转保留目标阶段的正常事实门、最短节奏和实际交互，不用计时器替代玩家、队伍或车辆真的到位。

从主菜单或其他测试场跳转时，接口沿选关流程导航到 `?whitebox=p012&missionStage=<阶段>`，先返回
`navigating/url/phaseNumber`；调用方继续等待新页面 `state.ready && state.running` 且
`phaseNumber` 等于目标阶段。刷新可重进同一阶段；退出第一关或普通选关清除此参数。

| 阶段 | id | 内部步骤 |
| --- | --- | --- |
| 1 黑屏、爆炸、受困 | `Trapped` | `Trapped` |
| 2 班长救人，撤入后交通壕 | `Rescue` | `BunkerRescue` → `RearTrench` |
| 3 接回第一批守军 | `Support` | `Support` |
| 4 接替火力，战车压口 | `MachineGun` | `MachineGun` |
| 5 班长带路取弹，炸停战车 | `Tank` | `Tank` |
| 6 回到伤员集结处，接下后送 | `Orders` | `Orders` |
| 7 沿沟南行 | `South` | `South` |
| 8 主街受阻 | `Village` | `Village` |
| 9 灶屋—连屋近战 | `Melee` | `Melee` |
| 10 打开内院，放行担架 | `Courtyard` | `Courtyard` |
| 11 抵达桥头接运点 | `TransferApproach` | `TransferApproach` |
| 12 掩护装载与离开 | `Transfer` | `Transfer` → `CartRide` |
| 13 日机空袭桥头道路与车列 | `AirFirst` | `AirFirst` |
| 14 第二轮扫射，转入西沟 | `Dive` | `Carry` → `Dive` → `Rescue` |
| 15 收拢、换手抬运、找到接收处 | `Regroup` | `Regroup` → `WallPath` → `ReceptionGate` |
| 16 完成交接 | `Handover` | `Handover` |
| 17 确认老周死亡 | `Death` | `Death` |
| 18 接应回援尾队，奉令毁桥，夜入滕城 | `Bridge` | `BridgeOrders` → `BridgeCover` → `BridgeWithdraw` → `NightMarch` |

跳转会重建本轮关卡、此前完成事实和目标阶段起点；不会沿用原现场的弹药、伤亡、破坏或未来事实。
回跳会同步退回掩蔽部、铁路桥和北门夜景的 scenario 状态，避免门已开、桥已毁、敌人已消失或担架状态残留。
普通“从当前检查点继续”恢复原现场，两者含义不同。阶段 1 从受困控制接管开始；阶段 2 从班长正在救人的现场开始；
阶段 3 以后使用已脱险场景。眼睑、眩晕和听觉模糊由任务实例持有，离开任务时必须复位。

验证从 worktree 根执行：

```powershell
node Taierzhuang1938/Script_FirstLevelMissionTest.mjs
node Taierzhuang1938/Script_FirstLevelMissionStageJumpTest.mjs
node Taierzhuang1938/Script_FirstLevelMissionBrowserTest.mjs --campaign --stage-to=7
node Taierzhuang1938/Script_FirstLevelMissionBrowserTest.mjs --campaign --stage-from=8 --stage-jumps
node Taierzhuang1938/Script_FirstLevelMissionBrowserTest.mjs --campaign --stage-from=15 --stage-jumps
node Taierzhuang1938/Script_FirstLevelMissionBrowserTest.mjs --campaign --stage-from=18 --stage-jumps
```

`Script_FirstLevelMissionTest` 核对目录、事实边界、列队状态和副本隔离；
`Script_FirstLevelMissionStageJumpTest` 是浏览器专项，核对 18 个真实起点、菜单操作、反向和重复跳转；
`--stage-jumps` 从指定阶段起点用真实输入推进，只用于阶段恢复验收。正常整关仍使用不带阶段跳转的
`Script_FirstLevelMissionBrowserTest.mjs --campaign`。截图和日志留在忽略目录
`_shots/FirstLevelStageJump`、`_shots/FirstLevelStageContinue` 与 `_shots/FirstLevelMission`，不能把调试通关当作正常通关证据。
