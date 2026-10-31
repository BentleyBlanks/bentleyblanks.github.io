# 第一关编排表与编排模型（第一关《往南的路》）

> **2026-10-31 用户要求废弃关卡编排工作台**（高级工具「关卡」菜单里的独立窗口）：工作台本体、俯视图、分类查看、
> 批注（`Notes/`、`/__notes` 保存口、`Script_MissionNotesCli`）与它们的测试都已删除。排关卡改用
> [白盒关卡编辑器](Data_EditorBlockout.md)。本文只留还在用的部分：四张编排表、编排模型
> `Script_MissionOrchestration.mjs`（白盒编辑器第一关的敌军站位读它）与只读 CLI。旧工作台的说明见 git 历史。

这一份是编排表与编排模型的**唯一口径**。四张表是游戏**实际在跑**的那几张。

有一条贯穿全文的分界，别弄混：

- **设计的预定安排**：写在表里的东西。其中由玩家行为触发的（绝大多数）**没有秒数**。
- **实际试玩发生的事**：只来自运行时 `flow.log`。它才有关卡时钟上的时刻。

把「玩家走到 front 锚点 26 m 内」画成「第 47 秒」是这套工具里最容易犯、也最贵的错：
它会让人对着一个根本不存在的节奏表调数值。

---

## 1. 数据：四张主表与场景信号（`Data_FirstLevelMissionGates.mjs`）

纯数据、零 three，Node 直接 import。数值一律**引用既有表**（`MISSION_TUNING` / `OPENING` /
`FRONT_SORTIE`），不在这里抄数字 —— 抄一次就多一个会悄悄走样的副本。

### `MISSION_STEP_SPAWNS`

`{ 步骤 id: [遭遇组 id, …] }`。运行时 `Enter(stage)` 在 `switch` 之前照这张表
`SpawnEncounter(id)`，顺序就是原来各 `case` 里的调用顺序。
**改这张表就等于改「哪一步放哪些人出来」**，不用动 `Script_FirstLevelMissionRuntime.mjs`。

### `MISSION_ENCOUNTER_ACTIVATION`

覆盖 `MISSION_ENCOUNTERS` 的**每一个**组，说清楚它怎么出现、怎么激活：

| 字段 | 含义 |
| --- | --- |
| `spawn.kind` | `step`（进入某步骤时生成）/ `fact`（某事实满足时）/ `threat`（转运区后一处威胁就绪） |
| `spawn.step` / `.fact` / `.threat` | 对应的步骤 id / 事实 id / 威胁组 id |
| `standbyUntil` | 生成了但**待命**，等这条事实满足才动（`front` / `machineGun` 等 `frontBattleStarted`） |
| `dormant` + `wake` | 生成即装睡；`wake.kind` 为 `playerWithinM`（带 `radiusM`、`step`）或 `fact` |
| `release` | 放行规则（`tacticNear`：玩家靠近战术点才放行） |
| `note` | 人话补充，会出现在工作台的详情栏 |

`village` 的 55 m 苏醒半径就在 `wake.radiusM` —— 运行时从这里取，不再是硬编码。

### `MISSION_VOICE_FACTS`

`{ 对白 cue: 事实 id }`。运行时 `VoiceDone(id)` 查这张表记事实；带额外逻辑的几条
（TrainRescue 那类）仍留在代码里，不进表。

### `MISSION_SCENARIO_SIGNALS`

可见场景的大换态只通过这张“信号名 → 事实名”映射进入空间层：`BunkerCollapsed → bunkerCollapsed`、
`RailBridgeDestroyed → bridgeDestroyed`、`NightGateShown → nightArrivalPlaced`。同名信号由
`Signalled` 直接查事实。运行时不能用 `OpenGate` 假装切换 scenario；回跳时空间层也据事实退回正确状态。

### `MISSION_TRANSFER_THREATS`（`Data_FirstLevelMission.mjs`）

阶段 12 现在只有两处威胁：`transfer` 进入 `Transfer` 就已在场，解除并记下
`loadingThreatResolved` 后，隔 `transferThreatGapS` 才放出 `transferAlley`；第二处解除事实是
`alleyThreatResolved`。工作台把它们画成 `threatArea`，边界来自各组成员坐标的包围盒，界面统一称
“第 n 处威胁”。旧四拍 `beat` 口径已经下线。

### `MISSION_FACT_GATES`

当前 120 条，`MISSION_STAGES` 的全部 `requirements` 事实均覆盖，外加
`frontBattleStarted` / `kitchenTraversed` / `bundleRoutePoint` 这类影响编排的触发。
每条至少带 `step` 与能生成人话的字段：

| `kind` | 怎么判 | 关键字段 |
| --- | --- | --- |
| `proximity` | 玩家进某点某半径 | `anchor` 或 `point`、`radiusM` |
| `proximityFamily` | 一族点逐个判（`bundleRoutePoint0…`） | `pointsFrom`、`radiusM`、`keys` |
| `interior` | 玩家进某个盒子 | `box`（`MISSION_PLACEMENT` 的键） |
| `voice` | 对白播完 | `cue` |
| `interaction` | 交互点被用 | `interaction`、`anchor` |
| `combat` / `column` / `cutscene` / `scripted` / `timer` | 战斗/车队/过场/脚本/计时判定 | `text`（人话）、`source`（运行时方法名） |

运行时的 `GateNear(fact)` 只认这张表：点 = `A[gate.anchor]` 或 `gate.point`，半径 = `gate.radiusM`。
**想改触发半径，改这里，不要去 `Script_FirstLevelMissionRuntime.mjs` 里找数字。**
开场那几步（Train→Shelter）在 `Script_FirstLevelOpening.mjs` 里跑，它的距离门同样走
`r.GateNear(fact)`：进沟的 `trenchEntered`、折角的 `shelterReached`（Shelter 步里那句喘息
台词判「人还在折角圈里」复用的也是这一条门）。

闸门 `node Taierzhuang1938/Script_MissionGatesTest.mjs`（纯 Node，秒级）除了对表，还
**静态对账两个源码文件**（运行时与开场脚本）：`SpawnEncounter("<字面量>")` 只许剩 2 处
（front 的 fact、威胁表的 `plan.id`），`.Near(` 的出现次数 = `GateNear` 里 1 处 + 两张逐行写明
理由的白名单（运行时 7 条、开场 2 条），`GateNear` 引的事实必须是表里的距离门。多一处就红。

---

## 2. 模型：`Script_MissionOrchestration.mjs`（纯，Node 可跑）

把上面那几张表 + `MISSION_STAGES` / `MISSION_ENCOUNTERS` / `MISSION_TACTICS` /
`MISSION_TRANSFER_THREATS` / `MISSION_LAYOUT` / 路线 / 锚点汇成一份，白盒关卡编辑器与 CLI 共用。

```js
BuildOrchestrationModel() → {
  version, levelId, bounds,
  phases[18]  { number, id, title, steps[], spawn }
  steps[28]   { id, index, phaseNumber, objective, target, cue, minimumSeconds, // 27 个可玩步骤 + Complete
                requirements[], guidance{label,route}, spawns[] }
  facts{69}   { id, kind, step, phaseNumber, anchor, point, radiusM, box, cue,
                interaction, encounter, member, requires, source, text }
  encounters[13] { id, phaseNumber, deferred, spawn, standbyUntil, dormant, wake, release,
                   members[{ id,x,z,weapon,hold,bayonet,team,reserve,releaseDelayS,
                             tactic, assaultLane, clearedAtPhase }] }
  transferThreats[2], routes{32}, anchors{51}, zones[44], friendlies[56], timeline[172], layout{…}
}
PhaseLayout(model, n)          // 这一阶段开始时：每组的 state + 区域/路线/友军/步骤
ApplyRuntimeState(model, rs)   // 运行时 State() → live（含 actualTimeline）
DescribeFact(model, factId)    // 人话：「玩家走到锚点 transfer 的 14 m 内」
FindOwner(model, id)           // 反查：属于哪组、哪步生成、怎么激活、被哪些事实引用
ModelSummary(model)            // CLI 摘要
```

`PhaseLayout` 的 state 词表：`pending`（还没出现）/ `spawned` / `standby`（生成了在待命）/
`dormant`（装睡）/ `active`（在打）/ `cleared`（跳到这一阶段时算已清除）。
**设计态下不会出现 `spawned` 与 `standby` 之外的歧义**：它按
`FIRST_LEVEL_ENCOUNTER_STARTS` / `..._DEFERRED_ENCOUNTERS` / `..._STAGE_ENCOUNTERS` /
`..._STAGE_CLEARED_ENEMIES` 推，与「跳关」用的是同一套口径。

`timeline` 的 `kind`：`entry` / `condition` / `timed` / `threat` / `delay` / `wake`。
**`condition` 没有 `atS`** —— 这是硬规矩，CLI 据此决定写不写秒数。

`ApplyRuntimeState(model, runtimeState)` 的 `runtimeState` = `runtime.State()` 再补
`{ player:{x,z,yaw}, guideRoute, spawned:[...runtime.spawned], transferBeats, squad }`。
产物 `live` 里的 `actualTimeline` 全部来自 `flow.log`（`stageEntry` 与 `fact` 两种，带关卡时钟）。

`live.squad` 是**班里那几个人的实时位置**：`[{ id, label, x, z, alive, yaw }]`。
工作台那一侧（`SquadState(runtime)`）把 `runtime.squad`（`companion.Handle(castId)`
拿到的演员句柄数组，开场之前是空的）折成这个形状，名字走文本表
（`Data_Companions` 的 `labelKey` → `T()`，查不到退回 castId）；模型这一层只把
坐标不是有限数的筛掉 —— 人还没造出来时 `position` 是 NaN，画上去就是一枚钉在原点的友军图标。

### CLI

```bash
node Taierzhuang1938/Script_MissionOrchestrationCli.mjs summary          # 全关摘要
node Taierzhuang1938/Script_MissionOrchestrationCli.mjs phase 12         # 某阶段：步骤/条件/敌军/时间轴
node Taierzhuang1938/Script_MissionOrchestrationCli.mjs step Transfer
node Taierzhuang1938/Script_MissionOrchestrationCli.mjs fact transferArrived
node Taierzhuang1938/Script_MissionOrchestrationCli.mjs encounter transfer
node Taierzhuang1938/Script_MissionOrchestrationCli.mjs member TransferGunner
node Taierzhuang1938/Script_MissionOrchestrationCli.mjs json             # 整份模型
```

agent 不开浏览器也能读到运行时用的那份编排。

---

## 3. 验收命令清单

```bash
# 纯 Node，秒级
node Taierzhuang1938/Script_MissionGatesTest.mjs
node Taierzhuang1938/Script_ModuleGraphTest.mjs
node Taierzhuang1938/Script_TestRunnerTest.mjs
node Taierzhuang1938/Script_TextTest.mjs

# 改了编排表还要跑
node Taierzhuang1938/Script_FirstLevelMissionTest.mjs
node Taierzhuang1938/Script_FirstLevelSpaceTest.mjs
node Taierzhuang1938/Script_FirstLevelMissionTopologyTest.mjs
node Taierzhuang1938/Script_FirstLevelMissionStageJumpTest.mjs
node Taierzhuang1938/Script_FirstLevelMissionTopologyBrowserTest.mjs
```

