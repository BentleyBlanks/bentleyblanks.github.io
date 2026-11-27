# Unity-style Timeline v2 架构与接入规范（`tengxian-timeline/2`）

2026-11-28 起，`Taierzhuang1938` 正式引入 Unity Timeline 式的**自包含过场与演出系统**：关卡运行时仅依赖一份 `Timeline/<Id>.timeline.json`（schema `tengxian-timeline/2`）中间文件，通过薄封装的 Prefab、Scene Binding、Animator 与声明式 Action 注册表统一驱动全部开场、关中并发演出与关尾过场，彻底解耦旧 `Blockout/*.json` 与 `Script_EditorBlockoutPreviz.mjs`。

---

## 1. 模块分层

| 模块 | 职责 | 依赖约束 |
| --- | --- | --- |
| [Script_TimelineAsset.mjs](../Script_TimelineAsset.mjs) | `tengxian-timeline/2` Schema 校验、归一化、静态依赖扫描（`CollectTimelineDependencies`）、确定性求值 `EvaluateTimelineAt(func(t))`、离散事件与 `onSkip` 收集、v1→v2 编译器 | 纯 JS，零 Three / 零 DOM，Node 与浏览器共用 |
| [Script_TimelineBindings.mjs](../Script_TimelineBindings.mjs) | `TimelinePrefabRegistry`（统一把 `Cast/*` / `Soldier/*` / `Vehicle/*` / `Prop/*` / `Litter/*` / `Animal/*` / `Aircraft/*` 包装成统一 `PlayableHandle`）与 `TimelineSceneBinder`（按 `live → spawnFallback / skip / error` 解析场景绑定槽） | 薄适配层，不重写 Actor / XBot / ExternalProps |
| [Script_TimelineActions.mjs](../Script_TimelineActions.mjs) | 声明式 `TimelineActionRegistry`（替代 JSON 内直写脚本路径），内置 22 个标准动作并支持 `Register(id, handler)` 扩展自定义脚本，强制 `onSkip: "apply" \| "ignore"` | 零动态路径 `import()`，打包与静态检查安全 |
| [Script_TimelineDirector.mjs](../Script_TimelineDirector.mjs) | `TimelineDirector`（单实例 PlayableDirector，支持 `Play / Pause / Resume / Seek / Step / Skip / Stop / SignalGate`，切镜自动调 `post.NotifyCameraCut()`）与 `TimelineManager`（多实例并发调度、聚合输入锁与预热清单） | 零 `Script_EditorBlockoutPreviz` 依赖 |
| [Script_TimelineCli.mjs](../Script_TimelineCli.mjs) | 命令行工具：`list` / `show` / `check` / `deps` / `compile-v2` | 纯 Node |

---

## 2. 三大核心契约

### 2.1 三种运行模式（轨道决定接管权）
- **`cinematic`**：接管相机、隐藏枪模与 HUD、`inputLock: "all"`、允许按 `Space` 跳过（跳过前自动补发所有剩余 `onSkip: "apply"` 状态事件）。例：开场 `FirstLevelOpeningCampaign`、关尾 `FirstLevelEndingNightMarch`。
- **`interactive`**：分层锁输入（`movementOnly` / `lookOnly`），支持 `timeline.pauseForGate`（`GateMarker`）暂停等待玩家按 `F` 或游戏事件放行。
- **`setpiece`**：**不锁玩家操作、不抢相机、不藏枪模**，通过 `TimelineManager` 与实玩战斗并发多实例运行。例：`13d` 并发桥爆破 `FirstLevelBridgeDemolition`。

### 2.2 Live 实体接管与三条边界规则
1. **活 AI 士兵接管（零重影）**：`Data_SoldierComponents.SOLDIER_TAGS` 新增 `timelineControlled`。`TimelineSceneBinder` 匹配到场上存活的 AI 士兵后置位该标签，`Script_Ai` 跳过其 `Think` / `Act` 与人群推挤（仅同步物理胶囊），由 `TimelineDirector` 直接驱动其 `Actor + XBotSkin`；播完或跳过时清标签，原地无缝切回 AI。
2. **动态场景件跳过合批**：`Scene_*.json` 物件新增可选 `bindId` 字段（`Script_SceneDoc.SCENE_OBJECT_KEYS`）。带 `bindId` 的物件在 `BlockoutDocFromScene` 分流进 `bindables`，在 `FirstLevelWhiteboxField.BuildBindables()` 中跳过静态 `BuildSink` 合批、挂 `MarkDynamicPrepass`（遵守 MotionVector 契约）并支持 `SetBindableTransform` 同步更新网格与碰撞体。
3. **跨环境缺失兜底（`onMissing`）**：每条 `bindings[]` 槽位声明 `onMissing: "spawnFallback" | "skip" | "error"`——实玩时无缝接管活实体，独立预览或单段跳关时按 `fallbackPrefab` 自动生成替身，关键物件缺失直接报错。

### 2.3 静态依赖预热（防止 WebGL 过场首帧卡顿）
关卡加载阶段调用 `timelines.PreloadDependencies(urls)`，经纯函数 `CollectTimelineDependencies(doc)` 提前扫出全部 Prefab、CastId、动画片段、语音与音效键，与主加载流程并行预热。

---

## 3. 第一关正式战役接入清单

| 资产文件 | 模式 | 触发时机 | 关键能力 |
| --- | --- | --- | --- |
| `Timeline/FirstLevelOpeningCampaign.timeline.json` | `cinematic` | 阶段 01 开场（01-1…02-2） | 自包含 6 段 41 轨，零 `Blockout/FirstLevel0105.json` 依赖，Space 跳过自动补发 `DugoutCollapsed` |
| `Timeline/FirstLevelBridgeDemolition.timeline.json` | `setpiece` | `13d` 按 F 点火炸桥 | 与实玩战斗并发、不锁操作不抢镜头，触发连环爆破、`combat.blastFeedback` 与 `BridgeBlown` 信号 |
| `Timeline/FirstLevelEndingNightMarch.timeline.json` | `cinematic` | `13d` 爆破完成后接 `13e` | Live Binding 接管场上活着的罗班长/何有田/刘文财/幺娃及平民、22:00 夜景跟拍、收尾执行 `encounter.complete` |

---

## 4. 调试与验证入口

- 浏览器调试口：`window.Tengxian.Debug.Timeline`（`Catalog / State / Play / Seek / Step / Pause / Skip / Stop / SignalGate`）。
- CLI 校验与依赖查看：
  ```powershell
  node Taierzhuang1938/Script_TimelineCli.mjs check
  node Taierzhuang1938/Script_TimelineCli.mjs deps FirstLevelOpeningCampaign
  ```
- 自动化门禁：
  - 纯 Node：`node Taierzhuang1938/Script_TimelineDirectorTest.mjs`（`TimelineDirectorTest`，`tier0Fast`）
  - 实机浏览器：`node Taierzhuang1938/Script_TimelineDirectorBrowserTest.mjs`（`TimelineDirectorBrowserTest`）
