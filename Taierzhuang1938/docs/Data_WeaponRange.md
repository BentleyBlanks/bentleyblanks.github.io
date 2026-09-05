# 枪械白盒（现状）

独立入口为 `Taierzhuang1938/?weapons=1`。主菜单的测试场景也提供入口，场内可以返回正片主菜单。场景不进入正式章节表，不改写章节完成进度；退出通过修改查询参数并重载，避免把测试武器、目标与无限弹状态带回正式关卡。

角色展示采用五个测试场共用的 [中性日光基准](Data_TestSceneLighting.md)，固定曝光与阴影补光，保留军服原色。

## 操作与范围

到枪桌前看向陈列武器，按 **F** 拾取。左键击发、右键瞄准、**R** 装填继续使用正式游戏的输入、第一人称动画和真实弹道。枪表从 `Data_Weapons.WEAPONS` 中带弹药类型及弹匣容量的条目生成，包含固定机枪在本白盒里的测试适配；刀具与投掷物不属于本场的枪械陈列。

默认无限弹模式保留每发枪机循环、后坐、散布和弹道，弹匣不减少，按 R 可以演示真实装填动作。装填模式正常消耗弹匣，只让备弹无限，便于验收空仓与换弹。模式只对本场生效。

本场允许全部枪械直接右键开镜，包括尚未架设两脚架的捷克式；这由场景的 `allowUndeployedAds` 配置控制。正式章节仍保留架设要求，本场也没有自动给未架设的机枪施加两脚架的稳定加成。

每个标称距离都有静止与移动日军。移动靶沿中央射击点的等距圆弧往返；测距点、距离表与圆弧运动由 `Data_WeaponRange.mjs` 定义。走出测距点后，应以当前玩家至靶子的实际距离为准。冻结按钮停止运动，恢复按钮继续；命中和倒地仍然有效。死亡目标在 `WEAPON_RANGE_RESPAWN_S` 后移除旧演员与物理对象再重生，不能不断往场上添加尸体。复位按钮重置整场目标、计数与弹药。

瞄准辅助只把视线转向选定目标的身体中心，不改变伤害、散布、下坠或目标血量。弹道仍从正式枪口起步；远距离与大散布枪种可能脱靶，不能把每次辅助瞄准都命中当作正确性的条件。

## 模块边界

| 文件 | 职责 |
| --- | --- |
| `Data_WeaponRange.mjs` | 纯数据：场景、枪桌、枪表、距离、目标、运动采样、截图机位 |
| `Script_WeaponRangeField.mjs` | 程序化白盒环境、实体枪桌与标记 |
| `Script_WeaponRangeRuntime.mjs` | 枪桌交互、移靶、场内控制与射击取证 |
| `Script_WeaponRangeTest.mjs` | 独立浏览器验收及可重复截图入口 |

运行时通过 `Script_Main.mjs` 装配。场内按 F6 冻结/恢复移动靶，F7 切换无限弹匣与换弹测试，F8 复位；也可按住 Alt 释放鼠标并点击面板，松开后继续控制视角。开镜时收起大面板，保持瞄具周围清晰。调试门面仅在枪械白盒启用：

| 接口 | 用途 |
| --- | --- |
| `Debug.WeaponRange.State()` | 场景模式、玩家、目标及事件计数快照 |
| `Targets()` / `Weapons()` | 靶子状态与实际枪表 |
| `GoTo('table', weaponId)` / `GoTo('firing')` | 传送到枪桌拾取位或中央测距点 |
| `AimAt(targetId)` | 调整视线；不负责开枪或命中 |
| `AimedTarget()` | 当前实际瞄准的目标，以及标称距离和玩家当前位置的距离 |
| `Pickup(weaponId)` | 共用拾取回调；仍受距离与动作状态限制 |
| `SetMoving(on)` / `SetAmmoMode(mode)` | 冻结/恢复；模式为 `infinite` 或 `reload` |
| `Reset()` | 整场复位 |
| `LastShot()` | 最近真实射击的枪种、目标、距离、命中与弹道记录 |
| `Shots()` | 有界的近期真实射击历史，可作为自动化证据 |

验收使用 `Debug.Key('KeyF')`、`Debug.Key('KeyR')`、`Debug.Mouse()` 与 `Debug.Fire()` 驱动正式链路，不用 `Pickup()` 替代 F 键断言，不直接调用伤害或死亡函数。传送只负责测试夹具摆位，不属于玩家移动验收。

完整调用路径是 `window.Taierzhuang.Debug.WeaponRange`（`window.Tengxian` 为同一对象的别名）。例如读取 `Targets()` 后，用 `AimAt('S200')` 瞄准远端静止靶，再通过正式开火接口击发，用 `LastShot()` 核对枪种、实际命中、伤害与弹道下坠。桌前拾取必须先到对应武器的 `pickupPosition`，不能远程领取。

## 本地验收与出图

在待测 worktree 根目录直接运行：

```powershell
node Taierzhuang1938/Script_WeaponRangeTest.mjs
node Taierzhuang1938/Script_WeaponRangeTest.mjs --shot
node Taierzhuang1938/Script_WeaponRangeTest.mjs --smoke
node Taierzhuang1938/Script_WeaponRangeTest.mjs --only=HanYang,ServicePistol
node Taierzhuang1938/Script_FpsArmTest.mjs --only=HanYang,Zb26,ServicePistol,Type11
node Taierzhuang1938/Script_WeaponShot.mjs --reload
```

`--smoke` 用代表枪种快速检查开机、目标、操作、运动和近距离命中，跳过超弹匣、多轮重生及菜单重载；它不能替代完整验收。`--only` 只缩小逐枪操作范围，枪表完整性仍对照全部正式火器。

通用换弹由 `Script_Viewmodel` 的握持点支轴与 `Script_RiggedModel` 的动态手掌接触共同控制。`Script_FpsArmTest` 覆盖腰射及开镜起手、装填中段和收招归零；`Script_WeaponShot --reload` 为每把枪生成对应关键帧图，便于检查整枪横移、手腕扭转及装填动作。

脚本复用 `LaunchBrowser` 与 `ServeRoot`，自动为当前 worktree 启动临时本地服务，结束后关闭。不要另写一次性浏览器探针。无头测试不请求系统指针锁。

自动检查包含固定射击线实际 Canvas 下半帧的近白/近黑比例、平均亮度与亮度离散度，DOM 面板不参与取样；这条闸用于发现雾白、严重过曝与黑屏回归，统计写入 `renderHealth`。自动检查还覆盖枪表完整性、桌前真实拾取、逐枪瞄准及无限弹击发、R 动作、正常弹匣消耗、靶子运动/冻结/恢复、演员与 Rapier/骨骼命中体同步、近远真实弹道与伤害、多轮死亡重生以及正式进度隔离。证据保存至 `_shots/WeaponRange/Data_Acceptance.json`。

`--shot` 额外保存整体场景、枪桌、射击线、远靶和逐枪 ADS 截图至 `_shots/WeaponRange/`。自动断言通过不代表画面已验收：还要逐张检查枪桌可读性、远靶可见性、准星与照门的对齐、枪口和手臂遮挡、武器零件穿模。截图文件已在忽略目录，不进入正式站点资源。
