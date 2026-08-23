# 台儿庄白盒测试分级（Data_TestTiers）

> 分级入口：`node Taierzhuang1938/Script_TestRunner.mjs`。本文解释每一档为什么存在、什么时候跑。
> 最后全量核对日期：2026-08-23（origin/master @ `11f90d93`，33 个测试）。

## 一、原则：按爆炸半径分档，不按"被碰的模块"分档

一个需求当然会牵连别的模块——但这个仓库的牵连方式是特定的：

- **静态依赖是星型**：`Script_Physics`、`Script_Combat`、`Script_Input` 都只被
  `Script_Main.mjs` 一个文件 import，模块之间不互调，全在 Main 里装配后才运行时耦合。
- **跨模块回归发生在整机里**，而 `Script_PlayTest.mjs` 就是那台整机：真浏览器端到端
  （输入→移动→开火→AI→目标点→阵亡换人→过关），15 组断言，音频 cue 计数、翻越、拾取、
  径向轮盘都在里面。所以不管你在哪个模块改代码，Tier 0 都会把它兜住。
- 领域专项测的不是"有没有坏"，而是 **PlayTest 够不到的深度**（伤害口径重放、整墙碰撞
  扫掠、AI 决策树）。只在深碰那个子系统时才值得花这份时间。

三句话纪律：

1. **每次改动跑 Tier 0**（约 12 分钟，本机实测）；
2. **碰共享底座（高度图/物理/弹道输入链）跑成串**（对应 domain 的全部下游）；
3. **叶子系统（音频/语音/菜单/编辑器）碰了才跑**，其余靠 Tier 0 兜底。

## 二、用法

```powershell
node Taierzhuang1938/Script_TestRunner.mjs                  # = --tier=0，默认档
node Taierzhuang1938/Script_TestRunner.mjs --tier=2         # 低频人工审查类
node Taierzhuang1938/Script_TestRunner.mjs --domain=terrain # 领域专项（--list 查全部领域）
node Taierzhuang1938/Script_TestRunner.mjs --only=DamageTest
node Taierzhuang1938/Script_TestRunner.mjs --list           # 列出全部分级
```

输出纪律：子进程输出默认只留**失败尾巴**（省 token），`--verbose` 才透传全程；
`--fail-fast` 第一红即停。退出码即成败。

worktree 里直接 `node` 本脚本，不要经 `npm run`（npm 会把 cwd 挪回主仓库，
测的是另一棵树）。

## 三、Tier 0 —— 每次改动必跑

| 测试 | 守什么 | 本机耗时 |
|---|---|---|
| BootTest | 七关开机冒烟 + draw call/triangles 红线 | ~80 s |
| PlayTest | 端到端通关 15 组断言，跨模块安全网 | ~620 s |
| HudPromptTest | HUD 提示规则（纯 Node） | <1 s |
| RiggedModelTest | .tzm.json 绑定模型数据（纯 Node） | <1 s |
| FractureBakeTest | 预破碎离线数据（纯 Node） | <1 s |
| CutsceneControlTest | 过场导演机位/生命周期（桩 three，纯 Node） | <1 s |

## 四、Tier 1 —— 领域触发（`--domain=`）

| 领域 | 何时跑 | 包含 |
|---|---|---|
| terrain | 动高度图/地形（AGENTS.md 点名必跑的 verify 在这里） | HeightmapVerify → JieheTerrain → Physics → Jump → Destruction |
| physics | 动碰撞、移动、破坏链（共享底座，下游成串） | Physics → Jump → Destruction → FractureBake |
| combat | 动武器/伤害/弹道/瞄准输入（共享底座） | Damage → GunFeel → FixedCenterAim → ReticleCalibration → SprintCrosshair → SprintViewmodel |
| ai | 动 AI 决策或战场内容预算 | AiBehavior、Visibility |
| hud | 动 HUD 提示/交互 | HudPrompt（Node+浏览器两条） |
| audio / voice | 动音效烘焙管线 / 语音资产 | AudioTest / VoiceTest |
| menu | 动主菜单、开机陈设 | MenuTest、BootPropTest |
| editor | 动场景编辑器或可破坏编辑器 | EditorTest、DestructionEditorTest |
| cutscene | 动过场、车厢生活动作 | CutsceneControl、ActorPose |
| render | 动光照/GI/合批/出图审查 | GiTest、ActorBatch（产品契约）、DeathView、Shot（人工审） |
| perf | 动渲染负载、LOD、体积光 | Performance、FrameProfile、GodRaysPerformance |

## 五、Tier 2 —— 低频人工审查

ShotTest / GiTest / DeathViewTest / FrameProfileTest / GodRaysPerformanceTest /
PerformanceTest。对机器敏感或需要人看图，不进常规回归，按里程碑跑。

## 六、已知红清单（截至 2026-08-23 @ origin/master `11f90d93`）

Tier 0 里 BootTest 与四个纯 Node 测试全绿；**PlayTest 有 10 条红（120/130 过），
全部先于本次改动存在**。清零之前，L0 的 PlayTest 输出需人工判读。按性质分两组：

疑似过期预期（玩法有意改了、断言没跟上，改断言即可）：

- P4 夜袭携行应为 L3_WhiteTowel，实际吃到 `L3_Fanji_override`
  （`17dc8c84` 引入 per-phase `loadoutOverride`，PlayTest 预期未同步）
- 单人 draw call ≤26，实测 31 块网格/2994 三角
  （模型精修 `5522ac92`/`5522ac92` 系列之后预算没抬）
- 头六十秒全场开火 >200，实测 121（火力节奏改动后阈值未校，需复核是有意放慢还是回归）

疑似真回归（要先修代码再谈断言）：

- Esc 通道指针锁不释放（escape:仍锁着；HEAD `11f90d93` 刚动过菜单接线，重点排查）
- 姿态可见度全 false（站@60 都看不见，潜行链路疑似坏）
- 玩家亲手击杀四连败（四周六米没有打得出去的方位，命中回执链路）

## 七、维护规矩

- 新增测试必须在 `Script_TestRunner.mjs` 的 `TestDefs` 登记并归档（tier/domain 二选一起步）。
- 改玩法必须同步受影响的断言；让 PlayTest 长期带红等于拆掉唯一的安全网。
- 本文的红清单过期时直接整节重写，注明新的核对日期与 commit。
