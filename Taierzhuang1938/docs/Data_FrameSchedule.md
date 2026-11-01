# 每帧调度表

2026-11-01 起，`Script_Main.Frame` 不再是一个 755 行、先后靠注释、中途十一处提前结束的函数，而是：

```js
function Frame(dt, render = true) {
  if (FrameFrozen(dt, render)) return;        // ① 失败画面 / 任务结束：只出画面
  BeginFrame(frameState, dt, render);         // ② 帧头：玩法时钟、帧号、叠加层、流送、远方机队
  FRAME_MODE_STEPS[FrameMode()](frameState);  // ③ 按模式分派
}
```

表在 `Data_FrameSchedule.mjs`（纯数据），模式在 `Script_FrameModes.mjs`，步骤在 `Script_FrameSteps{Player,World,Rules,Present}.mjs`，门禁 `FrameScheduleTest`（纯 Node）。

## 模式（FRAME_MODES，按先后判）

| 模式 | 什么时候 | 跑什么 |
|---|---|---|
| `editor` | 高级工具 / 设置页接管界面 | 设置页、编辑器、指挥部预览、灯光与阴影框跟编辑器相机、出画 |
| `shellShot` | 第一关 0 段炮弹镜头 | 镜头、天空灯光、特效、战斗、出画 |
| `loading` | 换关建切片中 | 什么都不跑 |
| `lab` | 测试场插件声明 `ownsFrame`（布料实验室） | 测试场自己、天空灯光、出画 |
| `play` | 其余 | 下面的步骤表 |

## 正常游戏的步骤（FRAME_PLAY_STEPS）

33 步，一步一个函数 `PlayStep<Id>(ctx, f)`，按系统分在四个文件里（玩家这一侧 / 世界模拟 / 规则与任务 / 表现与出画），每个文件导出一组 `<组>_STEPS`；`Script_Main` 把四组合进 `PLAY_STEP_FUNCS`，`PLAY_STEPS` 按表的顺序生成（名字对不上开机就抛错）：

deathTimer → input → carry → player → emplacement → interact → hands → foley → prompts → firearms → cameraFov → view → alliesDown → flare → companion → ai → physics → vfx → combat → lights → playerDown → firewalls → checkpoint → mission → p012 → objectives → narrative → setpieces → scenario → outcome → spawn → hud → render

- 步骤之间要传的这一帧的量放在 `frameState`：`dt`（玩法时间）、`realDt`（真实时间，白刃 QTE 用）、`render`、`weapon`（cameraFov 写、hud 读）、`phase`（outcome 写、spawn / hud 读）。每帧覆盖同一个对象，不产生垃圾。
- 任何一步返回 `STOP` 就结束这一帧：任务失败（playerDown）、第一关通关（mission）、P012 通关（p012）。步骤里不许写裸 `return;`（拆开之后它只结束这一步），门禁拦。
- 性能分段（`profiler.B/E`）原样留在各步里，Profiler 的口径不变。

## 工具箱（ctx）

步骤与模式不读 `Script_Main` 的全局变量，一律从工具箱 `ctx` 取：`ctx.player`、`ctx.ai`、`ctx.RenderScene()`……
`ctx` 定义在 `Script_Main`（搜 `const ctx = {`），三类：

- **会变的状态**（53 项）：取值器，现读 —— 换关、换人以后拿到的是新的那份，所以步骤里不要把它们先存进局部变量再跨调用用；步骤会写的 14 项（`fireEdge`、`adsFovT` 等）带写入器。
- **服务与常量**（38 项）：`hud`、`profiler`、`state`、`PLAY_STEPS` 等。
- **主文件里的函数**（33 项）：`ReadKeys`、`TryFire`、`RenderScene` 等。

步骤要用主文件里新的东西，就在 `ctx` 里加一行；门禁会查每个 `ctx.<名字>` 都登记过、步骤文件不 import `Script_Main`。模块里的东西（`WEAPONS`、`FREE_AIM` 等）照常 import。
按源码查「A 在 B 前面」的旧静态测试用 `Script_FrameFlatSource.FlatMainSource()`：按调度表把步骤拼回一段平铺的 Frame 再查。

## 先后规则（FRAME_ORDER_RULES）

18 条「A 必须排在 B 前面」，理由抄自原 Frame 的注释，例如：负重在玩家移动之前（不然刚抬起来还能冲刺一步）、照明弹与同伴在 AI 之前（倍率与 goal 要赶上这一帧的 Think）、死亡判定在所有伤害系统之后（不然手榴弹炸死会被整帧吞掉）、检查点在死亡判定之后。改顺序要先过这些规则。

## 怎么改

- **加一个每帧要跑的系统**：在 `FRAME_PLAY_STEPS` 合适的位置加一步，`Script_Main` 里写 `PlayStep<Id>`，登记进 `PLAY_STEP_FUNCS`；它若依赖别的步骤的结果，在 `FRAME_ORDER_RULES` 写一条带理由的先后。
- **改先后**：动表并说明理由；门禁会告诉你违反了哪条。
- **加一种整帧接管的情况**：加一个模式（`FRAME_MODES` + `FrameMode<Id>` + `FRAME_MODE_STEPS` + `FrameMode()` 的判断）。

## 改造时怎么验的

拆之前用探针（`_shots/AiRedProbe/Probe_FrameTrace.mjs`，不提交）在浏览器里录下每帧各子系统方法与性能分段的调用顺序：正片第一关开局、第 4 阶段、旧章节 `?phase=1` 三种情况各 4 帧（每帧 93–163 次调用），同一份代码录两次完全一致；拆完再录，三种情况每一帧与拆前逐条一致。步骤挪进各自文件、改走工具箱之后又录一次，与最初的录像逐字节相同。

## 还没做的

- 移植 UE 时：一步大致对应一个 Tick Group 里的一个系统，模式对应 GameMode / 输入模式，先后规则对应 Tick 先决条件（AddTickPrerequisite）。
