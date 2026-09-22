# 关卡编排工作台（第一关《往南的路》）

这一份是**唯一口径**：编排表怎么读、模型怎么建、工作台怎么用、批注怎么交给 agent、
改完怎么对得回来。四张表是游戏**实际在跑**的那几张 —— 工作台不另写一套展示用的流程图，
所以「面板上看到的」与「运行时执行的」不可能对不上。

闭环一句话：

> 打开关卡 → 看真实编排（阶段/步骤/过关条件/触发关系，实时看见走到哪、在等什么）
> → 按阶段看敌我布局在真实俯视图上怎么变 → 现场圈选、画箭头、拖候选位、写意见
> → 存成结构化批注（**不改正式关卡**）→ agent 按批注改表 → 工作台自动同步、能对应回来 → 再试玩。

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
`MISSION_TRANSFER_THREATS` / `MISSION_LAYOUT` / 路线 / 锚点汇成一份，工作台、俯视图与 CLI 共用。

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
**`condition` 没有 `atS`** —— 这是硬规矩，工作台与 CLI 都据此决定画不画秒数。

`ApplyRuntimeState(model, runtimeState)` 的 `runtimeState` = `runtime.State()` 再补
`{ player:{x,z,yaw}, guideRoute, spawned:[...runtime.spawned], transferBeats, squad }`。
产物 `live` 里的 `actualTimeline` 全部来自 `flow.log`（`stageEntry` 与 `fact` 两种，带关卡时钟）。

`live.squad` 是**班里那几个人的实时位置**：`[{ id, label, x, z, alive, yaw }]`。
工作台那一侧（`SquadState(runtime)`）把 `runtime.squad`（`companion.Handle(castId)`
拿到的演员句柄数组，开场之前是空的）折成这个形状，名字走文本表
（`Data_Companions` 的 `labelKey` → `T()`，查不到退回 castId）；模型这一层只把
坐标不是有限数的筛掉 —— 人还没造出来时 `position` 是 NaN，画上去就是一枚钉在原点的友军图标。

### 分类查看：`Script_MissionOrchestrationFilter.mjs`（纯，Node 可跑）

「这一阶段哪几个人钉在原地不动」这种问题，眼睛在一百多个标记里是数不出来的。
这一层把「看哪些」做成数据：状态可序列化，集合交给俯视图，计数交给面板 ——
**面板上写的数就是图上画的数**，两边同一个来源。

```js
DefaultFilterState() → {
  preset: "all",
  categories: { enemies, friendlies, zones, routes, anchors, notes },   // 六个开关
  encounters | states | weapons | behaviors | friendlyKinds | zoneKinds | routes,  // null = 不限制
  onlyNewThisPhase: false,
  solo: null | { kind, id },        // 「只看」：压过一切别的筛选
}
BuildOrchestrationFilter(model, phaseLayout, state)
  → { members, encounters, routes, zones, friendlies, anchors, notes }   // Set 或 null（null = 全画）
FilterSummary(model, phaseLayout, state, { notes })                      // 分类树：每项 label/count/visible/on/soloed
EnemyTableRows(model, phaseLayout, live)                                 // 敌军布设表：一行一个敌人，九列
EnemyTableCsv(rows) / SortEnemyRows(rows, column, asc) / RowVisible(filter, row)
ApplyPreset(state, id) / ToggleFilterItem(state, kind, id, allIds) / SoloFilterItem(state, kind, id)
EncounterLabel(model, encounter)   // 「转运区第 1 处威胁」「村口的日军」
PRESETS  // 全部 / 只看敌军 / 只看友军 / 只看触发区 / 只看路线 / 只看本阶段新出现的
```

口径几条：

- `solo` 优先于一切：只留那一组 / 那一类，别的类别是**空集**（不是 null）。
- 敌人的「本阶段状态」直接取 `PhaseLayout` 的 `state`，这里不另推一套。
- 「按武器」那一节里有一项是**上了刺刀**：它和两支枪是「或」的关系（选了它 = 也要那些人）。
- 「行为」只分两种：`hold`（钉在原地）与 `mobile`（有路线或会跃进）。
- 路线跟着俯视图的规矩：这一阶段有自己的指引路线就只列那几条，一条都没有时列全部 ——
  面板要是自己另算，左边写「0 条」而图上二十一条线还在。
- 组名一律中文（`ENCOUNTER_LABELS`），路线名也是（`ROUTE_LABELS` / `RouteLabel(name)`：
  flank = 侧翼路、ordersRejoin = 接令归队…，没登记的兜底成「路线 &lt;编号&gt;」，不露英文键）；
  转运区两组按威胁事实表的顺序现算，旧内部叫法「拍」不进任何一个 label。闸门里有专门守这两条的断言。
- **按组的顺序是先按出现阶段、再按名字**（`SortByPhaseThenName`），分类树与布设表同一个顺序 ——
  按源表的顺序排的话，第 2 阶段的组会夹在第 15 阶段的组中间，那是写表的顺序，不是关卡里发生的顺序。

闸门：`node Taierzhuang1938/Script_MissionOrchestrationFilterTest.mjs`（纯 Node，毫秒级，
对着真模型跑：只看一组只剩 4 人、按状态筛的人数与 `PhaseLayout` 逐个数的一致、
六个预设各自只留对应类别、布设表行数 = 这一阶段全部成员、CSV 首行是中文表头）。

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

agent 不开浏览器也能读到与工作台**一模一样**的那份编排。

---

## 3. 工作台：`Script_EditorOrchestration.mjs`（叠加层，独立窗口）

入口：设置 · 工具（`` ` `` 键）→ **编辑器** → **关卡编排**。
按钮画在「编辑器」组里（用户找它的时候想的是「我要编关卡」），但**语义上它仍是叠加层**：
和 Debug Rendering / Profiler / WorldInfo / 玩家状态 / 敌军 AI 一样走 `ToggleOverlay`，
不接管相机、不暂停玩法、不碰指针锁，`keepOnClose = true` —— 边打边看正是主用例。
（`Script_Editor.mjs` 里它留在 `OVERLAYS` 数组中，只是分组表 `EDITOR_ENTRIES` 把按钮
画进编辑器那一组；`this.entries` 每个 id 仍只登记一次，面板按钮总数 26 不变。）
窗口名 `tzOrchestration`，默认 1380×900，主题链接从主窗口的
`link[data-interface-theme]` 复制过去。弹窗被浏览器拦截时 `Enter()` 抛错，入口开关自动复位。

**不用先通关。** 没有第一关运行时（在别的关、或还没点「进城」）时顶栏写
「还没有人在跑第一关」、左栏顶上给一句话说明，设计编排照样全看得见；每个阶段旁边有
「从这里试玩」＝ `window.Taierzhuang.Debug.FirstLevelJump(n)`（从主菜单会导航）。

### 界面骨架

与 `Style_Interface.css` / `Style_Editor.css` 同一套语言（黑标题栏、冷灰底、旧金选中、
读数等宽），只是宽松一档 —— 它是个桌面工具，不是贴在画面边上的抽屉。

- **标题栏**：关卡名 + **一枚**状态标签 + 右端的模型版本。没运行时写
  「还没有人在跑第一关」，有运行时写「实时 · 第 12 阶段 · 掩护装载与离开」。
  **步骤、关卡时钟、这一步用时、正在等的那几件事都不在顶栏** —— 它们是时间轴里的
  信息，顶栏再排一串就是同一份数据在屏幕上出现两次，而两处迟早会对不上。
  它们现在住在时间轴（见下面「底栏」）。
- **三栏可拖**：两条分栏线 `[data-orch="split-left"|"split-right"]`，宽度写在 `#cols`
  的 `--left` / `--right` 上，连同时间轴的折叠状态一起记在
  `localStorage["tengxian1938_orchestration_layout_FirstLevel"]`，下次开窗照旧。
  中间那栏有 360 px 的下限（俯视图再窄就没法看了）。
- **底部时间轴可折叠**（`[data-timeline="toggle"]` → `#tl[data-collapsed=0|1]`）。
- 字号只有四档：标题 18、栏标题 15、正文 13、次要 12，读数一律等宽；间距按 8 的倍数。
  深色滚动条、`:focus-visible` 有旧金描边。所有按钮、标签、提示都用普通中文
  （转运区两处威胁一律叫「第 n 处威胁」，旧内部叫法「拍」不上界面），
  表里的编号（步骤 id、组 id、事实 id）只当尾巴上的等宽小字，**内部字段名不进句子**。

### 左栏「流程」

18 个公开阶段做成**可折叠分组**（`[data-flow-phase=n]` 上的 `data-open=0|1`），
标题带状态 `data-phase-state=now|done|todo`（「正在这里」/「已走过」/不写）；
**当前阶段自动展开并滚到看得见**，选中某个步骤时也会把它那一组打开。
组里每步是一张小卡：目标一句在最上（步骤编号是右上角的等宽小字），
再逐行列要求的事实，然后才是对白 / 最短时长这类次要行，末尾是本步生成的组与指引路线的小标签（可点）。
每条事实是**人话（`DescribeFact`）+ 一枚状态圆点 + 等宽的事实编号**：

| 标记 | 含义 |
| --- | --- |
| `✓` | 运行时 `flow.Has(fact)` 为真 |
| `…` | 当前步、还没满足（正在等它） |
| `·` | 已经走过的步 |
| `—` | 未到该步 |

点阶段 / 步骤 / 事实 / 组都会选中并联动中间的俯视图（`SetPhase` + `FitPhase`）与右栏详情；
反过来，从图上或时间轴上选中一个步骤，左栏会把它那一组展开并滚过去。

### 中栏「俯视图」

P3b 的 `Script_EditorOrchestrationMap.mjs`（canvas 2D，零 three，北在上、一米就是一米）。

- **7 把工具**：选择、平移、圈选、箭头、折线、标注、候选位（把选中的敌人拖出一个
  建议位置，**不改模型**，只生成一枚 ghost 与 `proposal.to`）。每把都是「小图标 + 名字」
  的芯片，当前那把亮旧金；图标是 16×16 的描边 SVG（`TOOL_ICONS`），颜色跟着按钮走。
  「标注」点下去**在点击处就地长一个输入框**（`[data-orch="label-input"]`）：
  回车落笔、Esc 取消、失焦提交非空文本，空文本不生成形状。不用 `prompt` ——
  它会把整个弹窗冻住，而且无头测试根本没法给它输字。
- **每把工具都得有出口，而且不止一个**。「折线」单击落点、有一段跟着光标的橡皮筋，
  **双击 / 回车 / 右键任一都结束**（≥2 点才产出形状），**Esc 取消整条**，**退格退掉
  最后一个点**；换别的工具时已经画了两点以上就当画完了、只落了一个点就当没画。画到
  一半光标旁有一句「回车 / 双击结束 · Esc 取消」——**画在画布上，不是 DOM**。键盘只在
  「手上真有件没做完的事」时才接，而且焦点在输入框里一概不管（弹窗里有批注正文与标注
  输入框）。「圈选」「箭头」拖开不到 4 px 不产出：一次误点留下半径 1 m 的圈或零长的
  箭头，删起来比画还麻烦。对外是 `map.FinishPath()` / `map.CancelPath()` 与只读的
  `map.pathPoints`（永远是数组）。
- **自己画的那几笔也是对象**：select 工具下点得中（`PickAt` → `{kind:"sketch", index}`，
  index 是 `SetSketch` 那个数组的下标），圈按圈心或圈周、箭头与折线按端点或线段、标注
  按文字框、候选位按中心。选中的那一笔描一圈旧金的粗边，悬停提示写人话（「圈选 · 半径
  12 m」「候选位 · TransferGunner」）。拾取排名在触发区/路线之上、锚点之下，候选位与人
  同级且**同分时人赢**——「点到人拿到的永远是人」对草图同样成立。工作台在选中草图时接
  Delete 删掉它。「候选位」工具从已经摆出来的那枚 ghost 上按下再拖 = 重新放它（原来标的
  是谁不变），不必一次次从人身上重拖。
- **@ 提及**：按住 Ctrl（Mac 上 Meta）点图上任何点得中的对象 → `Emit("mention", sel)`，
  载荷与 `onSelect` 同形，但**不改选中、不改画面**——「我要在文字里提到它」和「我现在要
  看它」是两件事，混在一起就得为了提一句话丢掉正在看的东西。任何工具下都生效（含平移
  与画到一半的折线，这时不落点）。另有一次性的 `map.ArmMention(true)`（批注对话框那个「@」
  按钮用它）：下一次普通左键点击等同 Ctrl+点，**点完就解除，点空地也解除**，武装时光标
  变成十字、旁边写着「点一个对象 = @ 它」。注册器 `map.onMention(cb)`，与 `onSelect` 并列。
- **实机层还画跟着玩家走的那个班**：`SetLive(live)` 的 `live.squad = [{id,label,x,z,alive,yaw}]`
  （id 是角色号、label 是中文名、yaw 可能没有）。友军色的「我方士兵」图标，朝向跟玩家
  箭头同一套规则（世界 yaw 0 看向 −Z ＝ 屏幕上方），名字走同一套避让排版，阵亡画灰 ✕。
  点得中（`{kind:"friendly", id, live:true}`），提示写「实时 · 罗班长（活着）」。
  `drawnMarkers` 里记成 `kind:"liveFriendly"`。分类里的「友军」集合装的是**设计**友军点的
  id，跟角色号不是一个命名空间，所以**过滤不会把实时小队滤掉**——只有「实机」图层能关掉它。
- **打死一个人，设计层当场变**：实机名单里查得到而且 `alive===false` 的那一枚，设计层按
  「已击毙」画 —— 灰色、更淡、右下角一枚骷髅角标（跟「已清除」同一套画法与尺寸规则），
  `drawnMarkers` 里那个成员 `state:"dead"`，提示写「已击毙」。并成一枚的簇，人数芯片改写
  「活着/总数」（例如 `3/4`），全灭整撮转灰。**只有查得到而且死了才算死**：名单里没有的
  那个人多半是还没生成，算成死会在刚进这一阶段时就报全灭。这一层跟着「实机」图层走 ——
  关掉它就是要看纯设计，那时候不该有人是灰的。
- **14 个图层开关**收在工具条右端的「图层 n/14」下拉面板里（`[data-orch="layers-button"]`
  开合，面板是 `[data-orch="layers"]`，按钮仍是 `[data-layer=id]`）：地表 / 体块 / 壕沟 /
  道路 / 锚点 / 路线 / 触发区 / 友军 / 敌军 / 战术线 / 实机 / 批注 / 名字 / 图例，外加「全开」与
  「只看底图」（只留地表 / 体块 / 道路 / 壕沟）。摊在工具条上要占掉两行，那两行是从俯视图身上抠的。
  「图例」是画布左下角那块不透明的说明牌，它会盖住地图的左下角，所以这个开关必须在。
- **阶段步进器**：`◀` / `▶` + 「第 12 / 18 阶段 · 完整转运区防御」+ 一条细进度条
  （`[data-map="phase"]`，点哪儿跳哪儿、左右方向键走一格；原生 range 在这套界面里太出戏），
  右边一组是 **跟随实时** / 适配整关 / 适配本阶段。
- 实机层每 0.25 s 从 `host.game.missionRuntime` 取 `State()`（**每 tick 重新取**：
  换关会换对象）→ `ApplyRuntimeState` → `SetLive`。地图只在 live 指纹变了或选中变了时重画。

**点得中什么**：单个敌人、锚点、触发区、路线、友军、批注点，外加两种把手 ——
每个非「已清除」的遭遇组在成员质心旁有一枚芯片（`PickAt` → `{kind:"encounter", id}`），
转运区两处威胁的框各有一枚金色芯片（→ `{kind:"threat", id}`）。悬停 tooltip 与选中描亮
（整组成员逐个描亮）对这两种一视同仁，点它和从左栏 / 时间轴选它走的是**同一条反查**。
芯片是不透明的，所以画在成员**下面**、拾取也排在成员之后：**点到人拿到的永远是人**
（缩到整关视野时，一枚芯片能把它标的那几个人整个盖住 —— 这条不是洁癖）。
`map.HandlePoint(kind, id)` 给出芯片中心的屏幕坐标，取证与测试用它去点。

**跟随实时不抢视野**：用户自己滚轮缩放或拖动平移之后，视野被标成「手动」
（`map.viewTouched`）；跟随实时换阶段时**只在视野还是「自动」的时候**才重新框景，
否则只换阶段、镜头一动不动。「适配整关」「适配本阶段」（以及任何一次 `Fit*`）
把它复位回「自动」。理由两头都硬：不重新框景的话面板说「阶段 12」而图上是车站；
抢镜头的话，用户正放大盯着某个院子看的那一刻会被拽走。

### 分类抽屉与敌军布设表

工具条上的「分类 4/117」打开贴在俯视图**左边**的抽屉（`[data-orch="filter-drawer"]`，
可收起，宽度可拖；开合、页签、宽度、四个小节的折叠记在
`localStorage["tengxian1938_orchestration_filter_FirstLevel"]`）。
它管的是「这一类里看哪几个」，图层开关管的是「这一类画不画」—— 两件事。
按钮上那个 `4/117` 是**现在画出来几个人 / 这一阶段一共几个人**。

**页签一「分类」**：

- 顶上一排预设：全部 / 只看敌军 / 只看友军 / 只看触发区 / 只看路线 / 只看本阶段新出现的
  （最后一个 = 出现阶段正好是当前阶段的那几组）。
- 下面一棵树：六个类别各一行（开关 + 名字 + 计数 + 「只看」）；**敌军**底下再分四个可折叠小节
  —— 按组（当前 13 组，**先按出现阶段、再按名字**排，组名说人话，编号与本阶段状态在第二行的小字里）/ 按本阶段状态（未出现 ·
  已生成 · 待命 · 休眠 · 活跃 · 已清除，各几人）/ 按武器（步枪 · 机枪 · 上了刺刀）/
  按行为（钉在原地 · 会移动）。每一行：眼睛开关 + 小图标 + 名字 + `看得见/一共` + 「只看」。
- **「只看」再点一次取消**，点完把那一行滚回看得见的地方。
- 悬停 = **只描亮，不改画面上有什么**：能指到单个对象的（某一组、某一条路线、表里的某个人）
  在图上描一圈（`SetHover` + `SetSelection`，指针挪开就还给真正选中的那个）；
  指不到单个对象的（按状态 / 武器 / 行为 / 整个类别）**什么都不动**。
  早先那版是悬停即「临时只画这一类」，扫一遍列表整张图闪十几次，比没有还难看。
- 抽屉默认 220 px（分类树够用的最窄一档），可拖；工具条上的「分类」再点一次就收起，
  面板右上角也有「收起」。
- 换阶段会重算（每一组的状态都可能变）。

**页签二「布设表」**：这一阶段全部敌人一张表，九列 —— 组 / 编号 / 出现 / 本阶段 / 武器 /
特点 / 出生点 / 路线点 / 实时。点表头按那一列排（再点一次反序），**按组排 = 先按出现阶段、再按名字**，
每组一条可折叠的分组线；组名写在分组线上，所以按组排时行里那一格只剩图标，表头也跟着叫「图标」
（换别的排法就变回「组」，那时行里是有组名的）。
表**跟着筛选联动**（图上看不见的，表里也不列），点一行 = 选中那个人并把地图 `ZoomTo` 到他的出生点；
「复制 CSV」按现在的筛选与排序导出，首行是中文表头（CSV 里的「组」列始终是组名）。
「实时」列：这一局里有这个人就写活着 / 阵亡与当前位置（每 0.25 s 只改那几个格子，整张表不重建），
没有就写他这一阶段的状态（「已清除」「未出现」）—— 一整列破折号看着像面板坏了。

行首的小图标来自 `Data_OrchestrationIcons.mjs`（登记进 import map 才去取）；
取不到就退回彩色圆点 —— 少几张 PNG 不该让这块面板打不开。

### 图标（`Data_OrchestrationIcons.mjs` + `Texture/Editor/`）

图上的标记是图标，不是圆点方块。**哪个对象用哪张图标由登记表说了算**
（`Data_OrchestrationIcons.mjs`，纯数据零依赖），地图和面板都来问同一张表 ——
规则写在画布那一层的话，右栏就只能再抄一遍「机枪手用哪张图」，抄第二遍迟早对不上。

- **素材**：`Taierzhuang1938/Texture/Editor/Icon_Orch_<名字>.png`，23 张，64×64，
  **纯白剪影 + alpha**（白色是故意的：运行时才按状态染色）。进仓库，不是忽略目录。
- **登记表**：`ORCHESTRATION_ICONS[名字] = { file, label }`，`label` 是普通中文
  （「步枪兵」「机枪手」「补给箱」），图例、提示、总表上写的就是它，不写
  `pending` / `standby` / `threat` 这种排程表里的内部叫法。
- **选图规则**（纯函数，面板共用）：
  - `IconForMember(member, state, encounterId)` —— 飞机 → 机枪 → 钉在原地 → 上刺刀 →
    预备队 → 步枪兵，按这个顺序取第一条命中的。**图标只说「他是干什么的」**。
  - `StateBadge(state)` —— 状态角标：待命=沙漏、休眠=闭眼、已清除=骷髅；
    「未出现」不给角标（它本来就画得半透明，再挂一枚只会更糊）。
    **状态走颜色 + 角标**，颜色仍是 `MAP_COLORS.enemy*` 那一套。
  - `IconForFriendly(kind)` / `IconForAnchor(id)` / `IconForZone(zone)` / `IconForNote()`。
    锚点按它实际是个什么地方画：`gate` 画院门，`bundle`/`throw`/`transferSupply` 画补给箱，
    `train`/`unload`/`queue`/`transfer` 画车，`retreat*`/`reception`/`zhou*` 画担架。
- **画法**：图标是**固定屏幕尺寸**（整关视野 14 px，放大到细看封顶 22 px），
  不随缩放线性放大 —— 它是符号不是实物。染色走离屏 canvas 的 `source-in`，
  按「图标 × 颜色 × 像素尺寸」缓存；深色描边**烘进缓存**（剪影八向偏移），
  不是每帧描八遍，所以整关视野一帧仍是 1.5 ms 上下。
  试过在图标底下垫深色圆盘，14 px 时图标压在盘上成了一坨深色泥，改成描边才剥得干净。
- **每个标记中心还有一颗不透明的小芯**：一是图标只是符号，「他到底站在哪儿」得有个准点；
  二是测试要数像素 —— 细线图标缩到 14 px 再加半透明与抗锯齿，可能一个精确 RGB 的像素都
  剩不下，而「画上了却一个像素都验不到」是这个仓库栽过的跟头。
- **图还没加载完不会出现空白**：`map.ready`（Promise）解析前画的是原来的几何标记
  （圆 / 方 / 三角），到齐后自动重画一次。某张 PNG 丢了也只是那一类退回几何标记。
  测试与需要精确取证的地方必须 `await map.ready` 再量。
- **图例**就是这批图标本身（同一份染色缓存），所以图例和图面永远对得上。
  `map.IconSheetPng()` 出一张「图标总表」：大图 + 16 px / 22 px 缩略 + 中文名，
  测试存在 `_shots/OrchestrationMap/icons_sheet.png`。
- **重出素材**：黑底白剪影的 5×5 总表生成一张（生图三级回退，见 `AGENTS.md`），
  再按格切开、**按亮度取 alpha**（黑底本身就是 mask，PNG 自带的 alpha 不可信）、
  裁掉空白、统一缩到 64×64。哪一格不合格就单独补一张。

- **挤在一起就合并**：同一组里屏幕距离小于「图标宽 × 1.7」的人串成一枚簇标记
  （组里最常见的那张图标 + 右下角人数芯片），放大到彼此分开时自动散开；不同组不合并，
  战术线仍逐人画。簇可点（选中整组）可悬停（提示里写人数）。`map.SetClusterGap(px)`：
  `null` 自动、`0` 不合并（测试逐人数的时候用）、正数固定像素；`drawnMarkers` 里记成 `kind:"cluster"`。
- **角标按尺寸**：图标小于 18 px 时状态只画一枚小色点（休眠冷蓝灰、待命黄、已清除灰叉），
  18 px 以上才画闭眼 / 沙漏 / 骷髅。上刺刀的兵图上画成步枪兵，刺刀退成 18 px 以上才出现的角标
  （`MapIconForMember` / `TraitBadge`，画法限制在地图层；面板用大图标照旧画刺刀）。
- **锚点与触发区**：锚点只画一枚 12 px 图标居中压在坐标上；触发区不再画圈心图标，
  只留虚线圈 + 名字 + 一颗淡圈心点，转运两处威胁的方框保留图标与出现条件。

### 只看这一撮：`map.SetFilter(filter)`

```js
map.SetFilter({ members, encounters, routes, zones, friendlies, anchors, notes });  // 每项是 Set 或 null
map.SetFilter(null);            // 恢复全画
map.filter                      // 当前过滤（只读）
map.drawnMarkers                // 本帧真画出去的标记 [{kind, id, encounter?, state?, alive?, icon, x, y}]（屏幕坐标）
                                // kind ∈ member|cluster|zone|anchor|friendly|note|live|liveFriendly|player
                                // member 的 state 多一个 "dead"（这一局里被打死了）；cluster 的 alive 是这一撮还剩几个
```

`null` 表示这一类全画；不在集合里的对象**不画、不参与拾取、也不占标签位置** ——
「画上了但点不中」这种半吊子状态比不过滤还难用。`members` 与 `encounters` 同时给就是且的关系。
`drawnMarkers` 是回答「屏幕上到底有什么」的唯一口径，比翻模型准：模型里有的东西
可能被图层、过滤或视野挡掉了。

### 右栏：两个页签「详情 / 批注」

页签条在栏头右端（`[data-orch="detail-tabs"]`、`[data-detail-tab=detail|notes]`，
当前那个 `data-on="1"`），选哪一页记在 layout localStorage 里，下次开窗还停在这儿。
**写批注的表单不在右栏** —— 它搬进了浮在俯视图上的对话框（下一节）。

**页签一「详情」**：

- **详情卡**（`FindOwner` 反查）：卡头是「类别标签 + 名字」，卡身是一张键值表，
  左边一列是问题（属于哪组 / 怎么出现 / 出场后先待命 / 会怎么动 / 现在 …），
  右边一列是人话（「转运区第 2 处威胁，`loadingThreatResolved` 之后出现；解除后记 `alleyThreatResolved`」），
  表里的编号跟在值后面当等宽小字（`kind=threat`、`transfer`）。最下面是折叠的原始数据 JSON。
  成员那张表里**「现在」永远有一行**：这一局里有这个人就写「活着 · (113.0, 80.0)」或
  「已击毙」，没有他就写这一阶段的设计状态（「这一局里没有他 · 第 12 阶段是「已清除」」）——
  空着会让人以为面板没接上运行时。它和布设表的「实时」列、图上的灰角标说的是同一件事。
  选中一笔**草图**时（`{kind:"sketch", index}`）写的是那一笔本身：「草图 · 圈选 半径 12 米」
  加一句「怎么删掉：按 Delete，或点对话框里那枚芯片的 ✕」。
- **这个对象上的批注**：目标正好是当前选中那个对象的那几条（卡片样式见下）。

**页签二「批注」**：

- 全部批注（分段按钮：待处理 / 已处理 / 已忽略 / 全部 + 「重新加载」）。
  顶上一条 `[data-notes="hint"]` 镜着状态条那句话（对话框常常是关着的，
  「重新加载」按下去什么都不动会让人以为按钮坏了）。
- 每条是一张卡：状态小标签 + 目标 + 阶段 + 步骤（+「本地草稿」「已核对」）、意见正文、
  指的时候、建议、草图、**缩略图**、`resolution.summary`，以及 `NoteDrift` 的醒目警示条
  ——「写这条批注时记下的设置已经变了（n 处）」并把新旧值并排列出来；按钮：
  **在图上找到它**（回选目标并把地图跳过去）、**标记已核对**（写 `verified: true`），
  图还只在本地时再加一颗 **下载这张图**。
  缩略图的来源：本地草稿的图取自 IndexedDB 里的 dataURL，已经落盘的那张走绝对 URL
  （弹窗文档是 `about:blank`，相对路径在那儿解不出来）。
- 底部一行弱化的导出：复制交接文本 / 下载 JSON / 复制 JSON / 下载本图。

### 写批注：浮在俯视图上的那一个对话框

用户的原话是「右侧的批注太复杂了…我只需要一个对话框」。写批注这件事是**对着图说话**的：
圈一笔、拖个候选位、Ctrl 点两个人，然后写一句。这些动作全在图上，表单就该贴着图。

`[data-orch="note-dialog"]`（`data-open=0|1`）浮在俯视图右下角，标题栏可拖、右上角有 ✕；
工具条末尾（图层之后）一枚芯片「写批注」`[data-orch="note-button"]` 开合它（再点一次收起；
排在最后是因为窄栏下工具条本来就折两行，放末尾只占第二行的空位，不会把「分类 / 图层」挤下去）。
**在图上一动手它自己就开**：画了一笔 / 拖了候选位 / Ctrl 点提及了一个对象。
焦点不在输入框上时按 Esc 收起（**草稿不清**）。从上到下：

1. **「哪个阶段 · 哪个状态」下拉框** `[data-note-field="state"]`：18 个
   `<optgroup label="第 n 阶段 · 标题">`，每组里依次是 `phase:<id>`「阶段开始」、
   每个 `step:<id>`「步骤 · 目标一句」（缩进）、该步每条要求事实 `fact:<id>`
   「　等：&lt;DescribeFact 人话&gt;」。选谁决定这条批注的 `phaseNumber` / `step` /
   （选了事实时）`time = {kind:"fact", fact}`。默认落在正在看那一阶段的第一步；
   跟着实时而且实时正在这一阶段时落在实时那一步。翻到别的阶段它跟过去，
   已经落在这一阶段里就不动。
   **改下拉框只 `SetPhase` + `OpenPhase`，绝不动 selection** —— 刚在图上点中的那个敌人
   正是用户要说的那个。反过来成立：在左栏 / 时间轴 / 图上选中 phase / step / fact 时
   下拉框同步过去。**亲手定过的就钉住**（下拉框改过、或在左栏 / 时间轴上点过阶段 / 步骤 / 事实）：
   跟随实时换阶段时下拉框不再自动挪，清空或保存之后才恢复跟随 —— 否则在第 12 阶段打着、
   想给第 1 阶段的某件事提意见，下一拍就被拨回第 12 阶段。下拉框里没有的那一项（时间轴上点得到的事实不一定是某一步的过关条件）
   **退到它所属的那一步**：面板上显示的和草稿里记的必须是同一样东西。
2. **「哪里不对」** `[data-note-field="text"]` + 一行 **@ 提及芯片**
   `[data-note-field="mentions"]`：每枚 `[data-note-mention="<kind>:<id>"]` 写
   「类别 · 名字 ✕」，点它删掉；旁边一颗 **「@ 点图选」** `[data-note-action="mention-arm"]`
   （调 `map.ArmMention(true)`，武装时亮旧金，跟着 `map.mentionArmed` 走不自己记一份），
   底下小字「按住 Ctrl 点图上的东西也行」。收到 `map.onMention(sel)` 时：
   sel 是 phase / step / fact 就改下拉框，否则去重后加进 `draft.mentions`
   （存 `{kind, id, label, x?, z?}`），并在 textarea 光标处插入「@名字 」（draft.text 同步）。
3. **建议类型** `[data-note-field="proposal"]` 与 **秒数** `[data-note-field="timeValue"]`
   （「相对本步 n 秒」，为空即 null）一行。`time` 的优先级：下拉框选了事实 →
   `{kind:"fact"}`；否则填了秒数 → `{kind:"stageRelative"}`；否则 null。
   原来那个「时刻类型」下拉框没了 —— 选了事实还要再选一次「某件事发生时」是同一件事问两遍。
4. **草图行**：每一笔一枚带 ✕ 的芯片 `[data-shape-index=i]`，
   加一枚**候选位芯片** `[data-note-action="candidate-clear"]`（点它 = `SetCandidate(null)`）。
   在图上选中一笔草图（select 工具下草图可拾取）按 **Delete / Backspace** 也能删；
   `RemoveShape(index)` 在 `index >= draft.shapes.length` 时等价于 `SetCandidate(null)`
   —— `DraftShapes()` 把候选位 ghost 放在最后，不这么写「候选位加了就删不掉」。
5. **保存草稿 / 清空** + 状态条 `[data-notes="status"]`（**不弹窗**）。
   「清空」清的是这条意见（正文 / 草图 / 候选位 / 提及），**不清**「哪个阶段 · 哪个状态」。

**这条批注说的是哪个东西**（`DraftTarget()`）三级优先：① 现在选中的那个；
② 没选中就用第一枚 @ 提及；③ 都没有才落到下拉框选的那一项。
原来是「没选中一律落在阶段上」，于是所有「没点着东西但选了某一步」的意见全挂在阶段上。

### 底栏「时间轴」

左边一列固定写着「设计」「实际」，右边是横向 18 列，**宽度按步数分配，不按秒** ——
大部分事情本来就没有秒数可排。最上面一行是阶段的编号与名字，
**当前阶段整列（含表头）压一层旧金底**。

**顶栏搬下来的那几条信息都在这儿**：

- 「实际」那行的名字底下（`.tlNames .n.actual .muted`，等宽）写
  「关卡时钟 83.0 秒 · 这一步 12.0 秒 · 步骤 Transfer」，没运行时写「还没有人在跑这一关」。
  每 tick **只改这一个节点的文本**。
- 当前阶段那条**实际**泳道末尾，每件**正在等**的事一枚空心标记
  `.tlMark[data-marker-kind="waiting"]`（`○`，**没有 `data-marker-at`** —— 它要等玩家
  做到才发生），提示写「正在等：&lt;DescribeFact 人话&gt;……没有固定秒数，等玩家做到才发生」，
  点它选中那条事实。事实一满足就从 `live.remaining` 里掉出去，同时作为实心 `fact ●`
  出现在上面那串实际标记里 —— 两个符号是同一件事的前后两态。
  按 `live.phaseNumber + remaining` 的指纹增量维护，没变就不重建。
- 「跟随实时」芯片仍在阶段步进条上，不在这儿。

- **设计行**（青 / 金）：`model.timeline` 的 `entry ▸`、`condition ◇`、`timed ◆`、`threat ■`、
  `delay ·`、`wake ✶`。`condition` 只画菱形、`data-marker-at` **缺席**；
  `timed` / `delay` 标相对秒，`threat` 标进入条件与解除事实。
- **实际行**（绿）：`live.actualTimeline` 的 `stageEntry ▸` 与 `fact ●`，标的是真实关卡时钟。
- 悬停任意标记出一张自己画的提示卡（不是 native title）：阶段、步骤、这件事的人话、
  最后才是时刻 —— 没有秒数的那几类明写「没有固定秒数，等玩家做到才发生」。
  同一份文字也写在 `data-tip` 上，取证与测试读它。
- 点任意标记 = 选中对应的事实 / 组 / 成员 / 步骤；点表头 = 选中那一阶段。
- 图例在时间轴右上角；整条时间轴可以「收起」。

### DOM 钩子（测试与取证用）

`[data-orch]`：`header` / `live-status` / `version` / `flow` / `flow-hint` / `map` / `detail` / `timeline` /
`canvas` / `tools` / `layers` / `layers-button` / `layers-all` / `layers-none` / `stagebar` / `tip` /
`split-left` / `split-right` / `label-input`（标注工具开着时才有）/
`detail-tabs` / `note-button` / `note-dialog`（`data-open=0|1`）；
`[data-flow-phase=n]`（`data-open=0|1`、`data-phase-state=now|done|todo`）、`[data-flow-step=id]`、
`[data-fact=id]`（`data-fact-state=ok|wait|past|future|none`）、
`[data-flow-encounter=id]`、`[data-flow-route=name]`、`[data-jump=n]`、`[data-flow-orphan]`；
`[data-orch="filter-drawer"]`（`data-open=0|1`、`data-tab=tree|table`）、`filter-button` /
`filter-presets` / `filter-tabs` / `filter-tree` / `enemy-table` / `filter-close` / `filter-grip`；
`[data-filter-preset=…]`、`[data-filter-tab=tree|table]`、`[data-filter-section=groups|states|weapons|behaviors]`、
`[data-filter-row="<kind>:<id>"]`（`data-on=0|1`、`data-solo=0|1`、`data-filter-count`、`data-filter-visible`）、
`[data-filter-toggle="<kind>:<id>"]`、`[data-filter-solo="<kind>:<id>"]`，
`kind ∈ category|encounter|state|weapon|behavior|friendlyKind|zoneKind|route`；
布设表里 `[data-table="enemies"]`、`[data-table-sort=<列>]`、`[data-table-group=<组>]`、
`[data-table-row=<敌人编号>]`（`data-alive=0|1`）、`[data-table-action="csv"]`；
`[data-tool=…]`、`[data-layer=…]`、
`[data-map=phase|phase-label|prev|next|fit-all|fit-phase|follow|follow-chip]`
（`phase` 现在是那条细进度条，`follow` 是芯片里那个藏起来的 checkbox）；
`[data-detail=title|owner|json|json-box|notes]`、
`[data-detail-tab=detail|notes]`（`data-on=0|1`）、`[data-detail-panel=detail|notes]`（`data-on=0|1`）、
`[data-note-field=state|text|mentions|proposal|timeValue|sketch|candidate]`、
`[data-note-mention="<kind>:<id>"]`（提及芯片）、
`[data-note-action=save|clear|close|mention-arm|candidate-clear|handoff|download|copy|image|locate|verify]`
（`locate`/`verify`/`image` 也出现在每张批注卡片里，按 `[data-note=<id>]` 取用）、
`[data-notes=status|hint|list|filter|clipboard]`、`[data-notes-filter=…]`、`[data-note=<id>]`（`data-note-drift`）、
`[data-note-drift-detail=<id>]`（新旧值那张小表）、`[data-note-thumb=<id>]`（卡片里的缩略图）、
`[data-shape-index=i]`；
`[data-timeline=design|actual|legend|toggle]`、`#tl[data-collapsed=0|1]`、`[data-lane=n]`、
`.tlMark[data-marker-kind=…]`（有秒数的才有 `data-marker-at`；`waiting` 那几枚一定没有；
`data-tip` 是悬停提示的纯文本，`data-sel-kind` / `data-sel-id` 是点它选中谁）。
三栏宽度在 `#cols` 的 `--left` / `--right`；宽度、时间轴折叠状态与右栏停在哪一页（`detailTab`）存
`localStorage["tengxian1938_orchestration_layout_FirstLevel"]`。

对外方法（`T.editor.overlays.get("orchestration")`）：
`Select(sel)` / `SetPhase(n,{fit})` / `OpenPhase(n,{scroll})` / `SetTool(id)` / `SetLayer(id,on)` /
`SetAllLayers(on)` / `ToggleLayers(force?)` / `ToggleTimeline(force?)` / `SetFollowLive(on)` /
`OpenFilterDrawer(bool?)` / `SetFilterTab("tree"|"table")` / `ApplyPreset(name)` / `SetFilterState(patch)` /
`SoloTarget(kind,id)` / `ToggleFilterRow(kind,id)` / `SortEnemyTable(column)` / `ToggleTableGroup(id)` /
`EnemyRows()` / `EnemyCsv()` / `CopyEnemyCsv()` / `PickEnemyRow(memberId)`（只读字段 `filter` / `filterState` / `filterSummary`）/
`SetDetailTab("detail"|"notes")` /
`AddShape(shape)` / `RemoveShape(i)`（`i >= draft.shapes.length` = 取消候选位）/ `SetCandidate(point,target)` /
`OpenNoteDialog(force?)` / `SetNoteState("phase:<id>"|"step:<id>"|"fact:<id>")` /
`AddMention(sel)` / `RemoveMention(kind,id)` / `ArmMention(on)` /
`SetNoteText(text)` / `SetProposalKind(kind)` / `SetNoteTime(seconds)` / `SetNoteFilter(v)` /
`SetLabelText(text)` / `CommitLabel()` / `CancelLabel()` /
`ClearDraft()` / `await SaveDraft()` / `HandoffText()` / `CopyHandoff()` / `CopyJson()` /
`DownloadJson()` / `DownloadImage()` / `DownloadNoteImage(id)` / `await MarkVerified(id)` / `LocateNote(id)` /
`await LoadNotes()` / `await Jump(n)`；只读字段 `model` / `live` / `notes` / `localImages` /
`draft`（含 `draft.mentions` 与 `draft.state`）/ `map` / `selection` / `phaseNumber`。
俯视图那一侧（`tool.map`）另有 `HandlePoint(kind,id)`、`ArmMention(on)`、
`onMention(cb)`（Ctrl / Meta + 点任何可拾取对象时回调，**selection 不变**）、
`FinishPath()` / `CancelPath()`，以及只读的 `viewTouched` / `handles` / `mentionArmed`。
select 工具下草图形状可拾取：`onSelect` 会给出 `{kind:"sketch", index}`，
index 是上一次 `SetSketch(array)` 传进去那个数组的下标（ghost 在最后）。
`SetLive(live)` 认 `live.squad`（画成友军图标，拾取为 `{kind:"friendly", id, live:true}`）。

---

## 4. 批注：schema、端点、目录、CLI

口径在 `Script_MissionNotes.mjs`（纯模块，Node 与浏览器共用），闸门
`node Taierzhuang1938/Script_MissionNotesTest.mjs`。

### 一条批注长什么样

```js
{
  id: "n_YYYYMMDD_HHMMSS_xxxx", createdAt, updatedAt, status: "open"|"resolved"|"dismissed",
  level: "FirstLevel", missionVersion,               // 来自 model.version
  target: { kind: "phase"|"step"|"fact"|"encounter"|"member"|"threat"
                 |"route"|"zone"|"anchor"|"friendly"|"point"|"time", id?, x?, z? },
  phaseNumber, step,
  time: null | {kind:"stageRelative",seconds} | {kind:"fact",fact} | {kind:"actual",atS},
  text,                                              // 用户的意见
  mentions?: [{ kind, id?, label?, x?, z?, original? }],   // @ 出来的那几个对象（可选）
  original: SnapshotTarget(model, target),           // **写批注那一刻目标的真实数据**
  proposal: null | { kind:"move"|"delay"|"retime"|"reroute"|"remove"|"other",
                     to?, points?, seconds?, earliestS?, latestS?, note? },
  sketch: { shapes: [circle|arrow|path|label|ghost] },
  image: "<noteId>.png" | null,
  verified?: boolean,                                // 用户点过「标记已核对」
  resolution: null | { at, by:"agent", summary, commit?, applied? },
}
```

`beat` 只为读取旧批注保留在校验器里；现行工作台新建转运批注一律写 `kind:"threat"`，
并从 `model.transferThreats` 拍快照。

**`mentions`（@ 提及）**：一条意见常常要同时指到好几个东西（「这个机枪手压着
@老周那辆车走的路 的路」）。每一枚与 `target` 同一套形状，`ValidateNote` 复用同一条校验：
`kind` 必须在 `TARGET_KINDS` 里、要带 `id`（`point` 例外，要有限的 `x`/`z`）、**不许重复**
（同一个对象提两遍，agent 那边就得自己去重，而去重这件事只该做一次）。
`label` 是界面上的人话，`original` 是 `SaveDraft` 给每一枚拍的快照
（被 @ 的可能是**这一局实时的班里人**，编排表里没有他 —— `SnapshotTarget` 那时报
`{kind, id, missing:true}`，**不抛**：一条批注不该因为提到了一个活人就存不下去）。
整个字段**可选**，旧批注没有它照样合法；没提及时 `SaveDraft` 干脆不写这个键。
`NoteDrift` **不管 mentions** —— 漂移说的是这条批注的目标变没变。
`HandoffMarkdown` 在每条批注下面多一行「提及：类别 名字（`编号`）；…」。

**`original` 是这套东西能闭环的原因。** 批注是「这组敌人出现得太早」，而「早」是相对
**当时那份编排**说的。不存下当时的 spawn / 坐标 / 事实门，等 agent 改完回头看，
分不清是意见被采纳了还是这一版根本已经不是同一组敌人。`NoteDrift(note, model)`
拿当前模型再拍一张逐字段对，`diff` 的 `path` 直指变了的字段。
**不要手改 `original`** —— 改了就再也对不回来了。

### 目录（**进仓库**）

```
Taierzhuang1938/Notes/
  README.md
  FirstLevel/
    notes.json                     ← 批注数组，2 空格缩进，末尾一个换行
    n_20260918_101500_ab12.png     ← 该批注的俯视图标注图（≤ 1.5 MB，可选）
```

进仓库是为了**换一棵 worktree 的 agent 也拿得到**；躺在 localStorage 里就传不过去。

### 端点（只在本地预览服，回环）

`scripts/Script_LocalPreview.mjs`：

- `GET /__notes/status` → `{ writable, root }`
- `POST /__notes/save` body `{ level, notes:[…], images:{ "<noteId>.png": "data:image/png;base64,…" } }`
  → `{ ok, file, count, images }`

六道闸：回环 / 白名单正则 / 根目录校验 / body ≤ 8 MB / 每条 `ValidateNote` / 图片只收 PNG 且 ≤ 1.5 MB；
**先全部校验完再开始写**，写盘一律 `.tmp` + rename。
每次保存**只带还没上传的那些图**（全量带会撞 8 MB 上限）：工作台按单张 ≤ 1.5 MB、
一次 POST 图总量 ≤ 7 MB 切批，超了就分几次 POST，每批传成功就把那几张从 IndexedDB 删掉。

**读不需要端点**：工作台直接 `fetch("./Notes/FirstLevel/notes.json?t=…", {cache:"no-store"})`，
线上 Pages 也读得到。写不了时（线上、或没开预览服）退化成 localStorage 草稿
（键 `tengxian1938_orchestration_notes_FirstLevel`）+ 「下载 JSON / 复制 JSON」，
并把原因**明写在面板上**（例如 `保存失败：/__notes/status 404 · 已存进本地草稿…`）。

**退化时图也留着**：`image` 照写 `<noteId>.png`，PNG 的 dataURL 进 **IndexedDB**
（库 `tengxian1938_orchestration`，store `images`，键 = 批注 id），**不进 localStorage** ——
一张图就是几百 KB，localStorage 整个域才 5 MB，塞两三张就把**批注正文**挤没了，
而正文才是绝对不能丢的东西。下次有端点、保存成功时，这些图随那一次 POST 一起补传，
传完就从 IndexedDB 删掉；加载时本地草稿的图从 IndexedDB 取回显示缩略图，
卡片上的「下载本图」能把它另存出去。
只有 IndexedDB 也用不了（隐私模式）时才把 `image` 抹成 `null` 并在面板上说明 ——
指着一个哪儿都不存在的 PNG 比没有图更糟。

### CLI

```bash
node Taierzhuang1938/Script_MissionNotesCli.mjs list [--all]
node Taierzhuang1938/Script_MissionNotesCli.mjs handoff
node Taierzhuang1938/Script_MissionNotesCli.mjs drift
node Taierzhuang1938/Script_MissionNotesCli.mjs resolve <id> --summary "…" [--commit <sha>]
node Taierzhuang1938/Script_MissionNotesCli.mjs dismiss <id> [--summary "…"]
# --level=FirstLevel 换关卡（默认 FirstLevel）
```

---

## 5. 闭环流程

### 5.1 用户怎么用

1. 起本地预览：`node scripts/Script_LocalPreview.mjs --no-open`（8080 被占时看输出端口）。
2. 打开 `http://127.0.0.1:<port>/Taierzhuang1938/?whitebox=p012`；
   想从某一阶段开打就加 `&missionStage=<1..18>`。
3. `` ` `` 打开工具目录 → **编辑器** → **关卡编排**。允许弹窗。
4. 拖阶段滑条看布局怎么变；打起来之后开「跟随实时」，左栏会实时告诉你
   **正在等哪些事实**（底栏实际行末尾也有一枚枚空心标记），
   实际行还会记下真正发生的时刻、关卡时钟走到哪儿、这一步用了多久。
   自己缩放或拖动过之后，跟随实时就只换阶段、不再动你的镜头；想把框景交回去，
   点一下「适配本阶段」或「适配整关」。
5. 图上东西太多看不清时，按工具条上的 **分类**：左边那块面板能按类型单独看 ——
   预设「只看敌军」把友军 / 触发区 / 路线全收起来；敌军还能按组 / 本阶段状态 / 武器 /
   行为分开看，某一组点「只看」就图上只剩他们几个（再点一次取消）。
   要一眼看全「谁在哪、拿什么、会不会动」就切到 **布设表**：一行一个敌人，点表头排序，
   点一行跳到他身上，「复制 CSV」能整张端走。
6. 看到不对的：在俯视图上点中那个敌人 / 触发圈 / 路线 / **整组的把手** / **某一处威胁的标签**
   （或在左栏点阶段、步骤、事实、组），用圈选 / 箭头 / 折线 / 标注画出想说的地方
   （标注是在点的地方直接打字，回车落笔），要挪位置就用「候选位」把他拖到想要的位置。
   画错了：点草图芯片的 ✕，或者在图上点中那一笔按 **Delete**；候选位不要了点它的 ✕。
7. 手一动，**批注对话框**就自己浮出来（工具条末尾的「写批注」也能开）。
   在它里面：上面那个下拉框选「哪个阶段 · 哪个状态」（选到某一步、甚至某一件要等的事），
   写一句人话，要同时点到别的东西就按住 **Ctrl 点图上的它**（或按「@ 点图选」再点一下），
   选建议类型（要的话填「相对本步 n 秒」），点 **保存草稿**。
   状态条会告诉你是写进了 `Taierzhuang1938/Notes/FirstLevel/notes.json` 还是退化成了本地草稿
   （右栏「批注」页上也镜着同一句）。
   退化时那张俯视图不会丢：它躺在浏览器的 IndexedDB 里，等下一次能写盘时自动补传，
   卡片上也看得到缩略图。
8. 切到右栏的 **批注** 页，点 **复制交接文本** 把 `HandoffMarkdown` 拷给 agent
   （或者直接让 agent 自己去读 `notes.json`）。
9. agent 改完、提交之后回到工作台点「重新加载」：已处理的批注会显示
   `resolution.summary`；如果目标的数据确实变了，那条批注会标 **⚠ 原设置已变化** 并把新旧值并排。
   核对无误点 **标记已核对**。

**批注不是关卡数据**：它不参与游戏运行，写批注不会改任何玩法。

### 5.2 agent 怎么接

从 worktree 根跑（**不要 `npm run`**，npm 会把 cwd 换到主检出）：

1. **读**：`node Taierzhuang1938/Script_MissionNotesCli.mjs handoff`
   （按阶段分组，每条含目标 / 原设置 / 建议 / 草图 / 图片路径，末尾一个机器可读 JSON 块）。
   要看编排本身：`node Taierzhuang1938/Script_MissionOrchestrationCli.mjs phase <n>`。
2. **改表，不改脚本**：出现时机改 `MISSION_STEP_SPAWNS` / `MISSION_ENCOUNTER_ACTIVATION`，
   触发半径改 `MISSION_FACT_GATES`，位置与路线改 `MISSION_ENCOUNTERS` / `MISSION_TACTICS`，
   转运威胁的先后改 `MISSION_TRANSFER_THREATS`，间隔数值改 `Data_Tuning_FirstLevel`。
   在 `Script_FirstLevelMissionRuntime.mjs` 里写死一个数字 = 下一次 `MissionGatesTest` 变红。
3. **自测**：
   ```bash
   node Taierzhuang1938/Script_MissionGatesTest.mjs          # 表与运行时源码对账（必跑）
   node Taierzhuang1938/Script_FirstLevelMissionTest.mjs     # 任务流纯 Node 回归
   node Taierzhuang1938/Script_OrchestrationMapTest.mjs      # 俯视图（浏览器）
   node Taierzhuang1938/Script_OrchestrationEditorTest.mjs   # 工作台（浏览器）
   node Taierzhuang1938/Script_FirstLevelMissionStageJumpTest.mjs   # 跳关（浏览器，约 3 分钟）
   ```
4. **结案**：
   ```bash
   node Taierzhuang1938/Script_MissionNotesCli.mjs resolve <id> --summary "已把这组敌人推后到第 13 阶段" --commit <sha>
   ```
   `summary` 写**实际改了什么**，不是「已处理」。不打算改的走 `dismiss <id> --summary "…"`。
5. **提交**：`notes.json` 的改动一起提交，用户下次打开工作台才看得到结果。
6. 想知道哪些批注已经和当前关卡对不上：`node Taierzhuang1938/Script_MissionNotesCli.mjs drift`。

---

## 6. 验收命令清单

```bash
# 纯 Node，秒级
node Taierzhuang1938/Script_MissionGatesTest.mjs
node Taierzhuang1938/Script_MissionNotesTest.mjs
node Taierzhuang1938/Script_MissionOrchestrationFilterTest.mjs
node Taierzhuang1938/Script_ModuleGraphTest.mjs
node Taierzhuang1938/Script_TestRunnerTest.mjs
node Taierzhuang1938/Script_TextTest.mjs

# 浏览器
node Taierzhuang1938/Script_OrchestrationMapTest.mjs        # 俯视图（45 条）：数像素、PickAt、组/威胁把手、ToPng、工具回调
node Taierzhuang1938/Script_OrchestrationEditorTest.mjs     # 工作台（152 条）：三栏/分栏线/时间轴折叠、事实与 flow 一致、顶栏只剩一枚状态、时间轴接住时钟与「正在等」空心标记、live 指纹含玩家朝向与班里人、跟随实时不抢视野、标注输入框、分类抽屉与敌军布设表、右栏两页签、批注对话框（阶段/状态下拉框、@ 提及、候选位 ✕、Delete 删草图）、批注退化与图片补传、关窗还干净
node Taierzhuang1938/Script_EditorTest.mjs --launcher-only  # 入口面板 26 个按钮
node Taierzhuang1938/Script_WorldInfoEditorTest.mjs
node Taierzhuang1938/Script_PlayerStateEditorTest.mjs

# 改了编排表还要跑
node Taierzhuang1938/Script_FirstLevelMissionTest.mjs
node Taierzhuang1938/Script_FirstLevelSpaceTest.mjs
node Taierzhuang1938/Script_FirstLevelMissionTopologyTest.mjs
node Taierzhuang1938/Script_FirstLevelMissionStageJumpTest.mjs
node Taierzhuang1938/Script_FirstLevelMissionTopologyBrowserTest.mjs
```

截图落在 `Taierzhuang1938/_shots/Orchestration/` 与 `_shots/OrchestrationMap/`（忽略目录）。
