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

## 1. 数据：四张表（`Data_FirstLevelMissionGates.mjs`）

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
| `spawn.kind` | `step`（进入某步骤时生成）/ `fact`（某事实满足时）/ `beat`（转运拍）/ `opening`（开场脚本生成） |
| `spawn.step` / `.fact` / `.beat` | 对应的步骤 id / 事实 id / 拍 id |
| `standbyUntil` | 生成了但**待命**，等这条事实满足才动（`front` / `machineGun` 等 `frontBattleStarted`） |
| `dormant` + `wake` | 生成即装睡；`wake.kind` 为 `playerWithinM`（带 `radiusM`、`step`）或 `fact` |
| `release` | 放行规则（`tacticNear`：玩家靠近战术点才放行） |
| `note` | 人话补充，会出现在工作台的详情栏 |

`village` 的 55 m 苏醒半径就在 `wake.radiusM` —— 运行时从这里取，不再是硬编码。

### `MISSION_VOICE_FACTS`

`{ 对白 cue: 事实 id }`。运行时 `VoiceDone(id)` 查这张表记事实；带额外逻辑的几条
（TrainRescue 那类）仍留在代码里，不进表。

### `MISSION_FACT_GATES`

69 条，`MISSION_STAGES` 里出现的 58 条 `requirements` 事实**全覆盖**，外加
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
（front 的 fact、拍的 `plan.id`），`.Near(` 的出现次数 = `GateNear` 里 1 处 + 两张逐行写明
理由的白名单（运行时 7 条、开场 2 条），`GateNear` 引的事实必须是表里的距离门。多一处就红。

---

## 2. 模型：`Script_MissionOrchestration.mjs`（纯，Node 可跑）

把上面那几张表 + `MISSION_STAGES` / `MISSION_ENCOUNTERS` / `MISSION_TACTICS` /
`MISSION_TRANSFER_BEATS` / `MISSION_LAYOUT` / 路线 / 锚点汇成一份，工作台、俯视图与 CLI 共用。

```js
BuildOrchestrationModel() → {
  version, levelId, bounds,
  phases[18]  { number, id, title, steps[], spawn }
  steps[27]   { id, index, phaseNumber, objective, target, cue, minimumSeconds,
                requirements[], guidance{label,route}, spawns[] }
  facts{69}   { id, kind, step, phaseNumber, anchor, point, radiusM, box, cue,
                interaction, encounter, member, requires, source, text }
  encounters[21] { id, phaseNumber, deferred, spawn, standbyUntil, dormant, wake, release,
                   members[{ id,x,z,weapon,hold,bayonet,team,reserve,releaseDelayS,
                             tactic, assaultLane, clearedAtPhase }] }
  beats[4], routes{21}, anchors{26}, zones[45], friendlies[56], timeline[172], layout{…}
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

`timeline` 的 `kind`：`entry` / `condition` / `timed` / `beat` / `delay` / `wake`。
**`condition` 没有 `atS`** —— 这是硬规矩，工作台与 CLI 都据此决定画不画秒数。

`ApplyRuntimeState(model, runtimeState)` 的 `runtimeState` = `runtime.State()` 再补
`{ player:{x,z,yaw}, guideRoute, spawned:[...runtime.spawned], transferBeats }`。
产物 `live` 里的 `actualTimeline` 全部来自 `flow.log`（`stageEntry` 与 `fact` 两种，带关卡时钟）。

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

入口：设置 · 工具（`` ` `` 键）→ 调试 → **关卡编排**。
与 Debug Rendering / Profiler / WorldInfo / 玩家状态 / 敌军 AI 同组：
不接管相机、不暂停玩法、不碰指针锁，`keepOnClose = true` —— 边打边看正是主用例。
窗口名 `tzOrchestration`，默认 1380×900，主题链接从主窗口的
`link[data-interface-theme]` 复制过去。弹窗被浏览器拦截时 `Enter()` 抛错，入口开关自动复位。

**不用先通关。** 没有第一关运行时（在别的关、或还没点「进城」）时顶部写
「未加载第一关 · 仅显示设计编排」，设计编排照样全看得见；每个阶段旁边有
「从这里试玩」＝ `window.Taierzhuang.Debug.FirstLevelJump(n)`（从主菜单会导航）。

### 左栏「流程」

18 个公开阶段 → 27 个内部步骤（其中 `Complete` 不属于任何公开阶段，单列在末尾）。
每步显示目标、对白 cue、最短时长、指引路线、本步生成的组，以及每条要求事实的
**人话（`DescribeFact`）+ 实时状态**：

| 标记 | 含义 |
| --- | --- |
| `✓` | 运行时 `flow.Has(fact)` 为真 |
| `…` | 当前步、还没满足（正在等它） |
| `·` | 已经走过的步 |
| `—` | 未到该步 |

点阶段 / 步骤 / 事实 / 组都会选中并联动中间的俯视图（`SetPhase` + `FitPhase`）与右栏详情。
顶部一行实时状态：当前阶段、步骤、关卡时钟、本步时长、**正在等哪些事实**。

### 中栏「俯视图」

P3b 的 `Script_EditorOrchestrationMap.mjs`（canvas 2D，零 three，北在上、一米就是一米）。

- **13 个图层开关**：地表 / 体块 / 壕沟 / 道路 / 锚点 / 路线 / 触发区 / 友军 / 敌军 / 战术线 /
  实机 / 批注 / 名字。
- **7 把工具**：选择、平移、圈选、箭头、折线、标注、候选位（把选中的敌人拖出一个
  建议位置，**不改模型**，只生成一枚 ghost 与 `proposal.to`）。
  「标注」点下去**在点击处就地长一个输入框**（`[data-orch="label-input"]`）：
  回车落笔、Esc 取消、失焦提交非空文本，空文本不生成形状。不用 `prompt` ——
  它会把整个弹窗冻住，而且无头测试根本没法给它输字。
- 阶段滑条 / 上一阶段 / 下一阶段 / 适配整关 / 适配本阶段 / **跟随实时**。
- 实机层每 0.25 s 从 `host.game.missionRuntime` 取 `State()`（**每 tick 重新取**：
  换关会换对象）→ `ApplyRuntimeState` → `SetLive`。地图只在 live 指纹变了或选中变了时重画。

**点得中什么**：单个敌人、锚点、触发区、路线、友军、批注点，外加两种把手 ——
每个非「已清除」的遭遇组在成员质心旁有一枚芯片（`PickAt` → `{kind:"encounter", id}`），
四个转运拍的框各有一枚金色芯片（→ `{kind:"beat", id}`）。悬停 tooltip 与选中描亮
（整组成员逐个描亮）对这两种一视同仁，点它和从左栏 / 时间轴选它走的是**同一条反查**。
芯片是不透明的，所以画在成员**下面**、拾取也排在成员之后：**点到人拿到的永远是人**
（缩到整关视野时，一枚芯片能把它标的那几个人整个盖住 —— 这条不是洁癖）。
`map.HandlePoint(kind, id)` 给出芯片中心的屏幕坐标，取证与测试用它去点。

**跟随实时不抢视野**：用户自己滚轮缩放或拖动平移之后，视野被标成「手动」
（`map.viewTouched`）；跟随实时换阶段时**只在视野还是「自动」的时候**才重新框景，
否则只换阶段、镜头一动不动。「适配整关」「适配本阶段」（以及任何一次 `Fit*`）
把它复位回「自动」。理由两头都硬：不重新框景的话面板说「阶段 12」而图上是车站；
抢镜头的话，用户正放大盯着某个院子看的那一刻会被拽走。

### 右栏「详情 / 批注」

- **反查**（`FindOwner`）：属于哪组、哪步生成、按什么出现（`kind=beat/step/fact/opening`）、
  待命/苏醒条件、移动路线与放行点、本阶段状态、实机死活与位置、引用它的事实，
  外加一个折叠的原始数据 JSON。
- **批注区**：本对象相关批注 + 全部批注（待处理 / 已处理 / 不处理 / 全部筛选）。
  每条显示目标、阶段、意见、建议、草图、图片路径与**缩略图**、`resolution.summary`，
  以及 `NoteDrift` 的「⚠ 原设置已变化」和新旧值并排；按钮：
  **定位**（回选目标并把地图跳过去）、**标记已核对**（写 `verified: true`），
  图还只在本地时再加一颗 **下载本图**（把那张 PNG 另存出去）。
  缩略图的来源：本地草稿的图取自 IndexedDB 里的 dataURL，已经落盘的那张走绝对 URL
  （弹窗文档是 `about:blank`，相对路径在那儿解不出来）。
- **新建批注**：意见文字、建议类型（`PROPOSAL_KINDS`）、时间点（阶段内第 N 秒 / 某事实满足时 / 不限）、
  草图（地图工具画的形状实时列出、点一下删掉）、候选位；
  然后 **保存草稿** / 复制交接文本 / 下载 JSON / 复制 JSON / 下载本图 / 清空草稿。

### 底栏「时间轴」

横向 18 条泳道，**宽度按步数分配，不按秒** —— 大部分事情本来就没有秒数可排。

- **设计行**（青 / 金）：`model.timeline` 的 `entry ▸`、`condition ◇`、`timed ◆`、`beat ■`、
  `delay ·`、`wake ✶`。`condition` 只画菱形、`data-marker-at` **缺席**，鼠标悬停写
  「无秒数（由玩家行为触发）」；`timed` / `delay` 标相对秒，`beat` 标窗口区间。
- **实际行**（绿）：`live.actualTimeline` 的 `stageEntry ▸` 与 `fact ●`，标的是真实关卡时钟。
- 点任意标记 = 选中对应的事实 / 组 / 成员 / 步骤。

### DOM 钩子（测试与取证用）

`[data-orch]`：`header` / `live-status` / `version` / `flow` / `map` / `detail` / `timeline` / `canvas` /
`tools` / `layers` / `stagebar` / `label-input`（标注工具开着时才有）；
`[data-flow-phase=n]`、`[data-flow-step=id]`、`[data-fact=id]`（`data-fact-state=ok|wait|past|future|none`）、
`[data-flow-encounter=id]`、`[data-flow-route=name]`、`[data-jump=n]`、`[data-flow-orphan]`；
`[data-tool=…]`、`[data-layer=…]`、`[data-map=phase|phase-label|prev|next|fit-all|fit-phase|follow]`；
`[data-detail=title|owner|json|json-box|notes|form]`、
`[data-note-field=text|proposal|timeKind|timeValue|sketch|candidate]`、
`[data-note-action=save|handoff|download|copy|image|clear|locate|verify]`
（`locate`/`verify`/`image` 也出现在每张批注卡片里，按 `[data-note=<id>]` 取用）、
`[data-notes=status|list|filter|clipboard]`、`[data-notes-filter=…]`、`[data-note=<id>]`（`data-note-drift`）、
`[data-note-thumb=<id>]`（卡片里的缩略图）、`[data-shape-index=i]`；
`[data-timeline=design|actual|legend]`、`[data-lane=n]`、`.tlMark[data-marker-kind=…]`（有秒数的才有 `data-marker-at`）。

对外方法（`T.editor.overlays.get("orchestration")`）：
`Select(sel)` / `SetPhase(n,{fit})` / `SetTool(id)` / `SetLayer(id,on)` / `SetFollowLive(on)` /
`AddShape(shape)` / `RemoveShape(i)` / `SetCandidate(point,target)` /
`SetNoteText(text)` / `SetProposalKind(kind)` / `SetNoteTime(kind,value)` / `SetNoteFilter(v)` /
`SetLabelText(text)` / `CommitLabel()` / `CancelLabel()` /
`ClearDraft()` / `await SaveDraft()` / `HandoffText()` / `CopyHandoff()` / `CopyJson()` /
`DownloadJson()` / `DownloadImage()` / `DownloadNoteImage(id)` / `await MarkVerified(id)` / `LocateNote(id)` /
`await LoadNotes()` / `await Jump(n)`；只读字段 `model` / `live` / `notes` / `localImages` / `draft` /
`map` / `selection` / `phaseNumber`。
俯视图那一侧（`tool.map`）另有 `HandlePoint(kind,id)` 与只读的 `viewTouched` / `handles`。

---

## 4. 批注：schema、端点、目录、CLI

口径在 `Script_MissionNotes.mjs`（纯模块，Node 与浏览器共用），闸门
`node Taierzhuang1938/Script_MissionNotesTest.mjs`。

### 一条批注长什么样

```js
{
  id: "n_YYYYMMDD_HHMMSS_xxxx", createdAt, updatedAt, status: "open"|"resolved"|"dismissed",
  level: "FirstLevel", missionVersion,               // 来自 model.version
  target: { kind: "phase"|"step"|"fact"|"encounter"|"member"|"beat"
                 |"route"|"zone"|"anchor"|"friendly"|"point"|"time", id?, x?, z? },
  phaseNumber, step,
  time: null | {kind:"stageRelative",seconds} | {kind:"fact",fact} | {kind:"actual",atS},
  text,                                              // 用户的意见
  original: SnapshotTarget(model, target),           // **写批注那一刻目标的真实数据**
  proposal: null | { kind:"move"|"delay"|"retime"|"reroute"|"remove"|"other",
                     to?, points?, seconds?, earliestS?, latestS?, note? },
  sketch: { shapes: [circle|arrow|path|label|ghost] },
  image: "<noteId>.png" | null,
  verified?: boolean,                                // 用户点过「标记已核对」
  resolution: null | { at, by:"agent", summary, commit?, applied? },
}
```

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
3. `` ` `` 打开工具目录 → 调试 → **关卡编排**。允许弹窗。
4. 拖阶段滑条看布局怎么变；打起来之后开「跟随实时」，左栏会实时告诉你
   **正在等哪些事实**，底栏实际行会记下真正发生的时刻。
   自己缩放或拖动过之后，跟随实时就只换阶段、不再动你的镜头；想把框景交回去，
   点一下「适配本阶段」或「适配整关」。
5. 看到不对的：在俯视图上点中那个敌人 / 触发圈 / 路线 / **整组的把手** / **转运拍的标签**
   （或在左栏点阶段、步骤、事实、组），用圈选 / 箭头 / 折线 / 标注画出想说的地方
   （标注是在点的地方直接打字，回车落笔），要挪位置就用「候选位」把他拖到想要的位置。
6. 右栏写一句人话 + 选建议类型（+ 时间点），点 **保存草稿**。
   面板会告诉你是写进了 `Taierzhuang1938/Notes/FirstLevel/notes.json` 还是退化成了本地草稿。
   退化时那张俯视图不会丢：它躺在浏览器的 IndexedDB 里，等下一次能写盘时自动补传，
   卡片上也看得到缩略图。
7. 点 **复制交接文本** 把 `HandoffMarkdown` 拷给 agent（或者直接让 agent 自己去读 `notes.json`）。
8. agent 改完、提交之后回到工作台点「重新加载」：已处理的批注会显示
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
   拍的窗口改 `MISSION_TRANSFER_BEATS`，数值改 `Data_Tuning_FirstLevel`。
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
node Taierzhuang1938/Script_ModuleGraphTest.mjs
node Taierzhuang1938/Script_TestRunnerTest.mjs
node Taierzhuang1938/Script_TextTest.mjs

# 浏览器
node Taierzhuang1938/Script_OrchestrationMapTest.mjs        # 俯视图（45 条）：数像素、PickAt、组/拍把手、ToPng、工具回调
node Taierzhuang1938/Script_OrchestrationEditorTest.mjs     # 工作台（64 条）：三栏/时间轴、事实与 flow 一致、跟随实时不抢视野、标注输入框、批注退化与图片补传、关窗还干净
node Taierzhuang1938/Script_EditorTest.mjs --launcher-only  # 入口面板 26 个按钮
node Taierzhuang1938/Script_WorldInfoEditorTest.mjs
node Taierzhuang1938/Script_PlayerStateEditorTest.mjs

# 改了编排表还要跑
node Taierzhuang1938/Script_FirstLevelMissionTest.mjs
node Taierzhuang1938/Script_FirstLevelMissionStageJumpTest.mjs
```

截图落在 `Taierzhuang1938/_shots/Orchestration/` 与 `_shots/OrchestrationMap/`（忽略目录）。
