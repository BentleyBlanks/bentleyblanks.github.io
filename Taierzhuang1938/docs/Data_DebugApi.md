# 调试口 window.Tengxian

`window.Tengxian`（与 `window.Taierzhuang` 是同一个对象）是测试脚本、出图脚本与 agent 驱动游戏的入口：`StepFrames`、`JumpToPhase`、`state`、`player`、`Debug.Fire / Key / Slots / FirstLevelJump……`。仓库里 180 多个测试脚本靠这些名字跑。

## 在哪

2026-11-01 起不再手写在 `Script_Main.Boot` 里（原来约 790 行），而是：

| 文件 | 管什么 |
|---|---|
| `Script_DebugApi.mjs` | `InstallDebugApi(ctx)`：顶层挂出主文件里的对象（`renderer`、`player`、`state`、取值器 `gi` / `meleeCombat` / `aircraft`……），把三组 Debug 合起来，再挂换关后要现读的 `battlefield` / `physics` / `nav`、测试场常驻口、`Clock`、`TerrainDeformation`、`Gore`、`TerrainTrails`、`HitReaction`、靶场 `Range` |
| `Script_DebugApiPlayer.mjs` | 玩家这一侧：键鼠、武器、动作、交互、准星与指针锁（34 个） |
| `Script_DebugApiWorld.mjs` | 世界：AI、同伴、空袭与照明弹、物理与环境、声音分区（20 个） |
| `Script_DebugApiMission.mjs` | 关卡与任务：换关跳段、钉关、检查点、摆点、第一关与 P012、叙事结果（30 个） |

主文件里的东西一律从工具箱 `ctx` 取（见 [每帧调度表](Data_FrameSchedule.md)「工具箱」）。开机之后，测试场、编辑器、设置页、菜单、白盒编辑器还会各自往 `Debug` 上挂自己的口（`OpenEditor`、`MenuAct`、`Blockout`……），那些仍在各自装配的地方。

## 规矩

- **名字只加不改。** 改名或删名要同步改所有用到它的测试脚本。
- **加新口**：放进它所属的那一组（不确定就按上表的分法），然后 `node Script_DebugApiTest.mjs --write` 重写名字登记表 `Data_DebugApiKeys.json`，提交说明里写清加了什么。
- 三组之间不许重名（合并是展开，重名会悄悄覆盖）。
- 顶层那些不是取值器的属性（`player`、`ai`、`story`……）是开机那一刻的值，与原来一样；换关会换掉的对象（`battlefield`、`physics`、`nav`）是取值器。

## 门禁

`Script_DebugApiTest.mjs`（纯 Node，秒级）：用假工具箱跑一遍 `InstallDebugApi`，名字与登记表逐个对；三组不重名；调试口文件不 import `Script_Main`、用到的每个 `ctx.<名字>` 都登记过；`Script_Main` 只调一次 `InstallDebugApi(ctx)`。

## 搬家时怎么验的

浏览器探针（`_shots/AiRedProbe/Probe_DebugApiShape.mjs`，不提交）在正片 P012、旧章节、靶场、白刃、断肢五个入口开机后，把 `window.Tengxian` 每个名字的属性类型（值 / 取值器、可枚举、可写）、值的类型、函数参数个数，连同 `Debug` 下每个子对象的形状全部记下来；搬前搬后五个入口逐项一致，页面零报错。
