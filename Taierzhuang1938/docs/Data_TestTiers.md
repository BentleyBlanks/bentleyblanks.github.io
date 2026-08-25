# 台儿庄白盒测试分级（Data_TestTiers）

> 统一入口：`node Taierzhuang1938/Script_TestRunner.mjs`。
> 最后登记核对：2026-08-26，48/48 个 `Script_*Test.mjs` 已登记（以 `Script_TestRunnerTest.mjs` 的实数为准），另含高度图 verify。

## 一、目标与纪律

测试按爆炸半径分档，领域选择既可以显式指定，也可以从 Git 改动自动推断：

1. **Tier 0 每次必跑**：七关开机、端到端通关和纯 Node 快测；
2. **Tier 1 按领域追加**：优先使用 `--changed` 自动选择，或显式 `--domain=…`；
3. **Tier 2 低频人工审查**：性能实测与出图不被 `--changed` 自动触发，只给出建议。

`Script_PlayTest.mjs` 是跨模块整机安全网，但领域专项仍负责它够不到的深度，
例如伤害口径重放、整墙碰撞扫掠、AI 决策和编辑器数据契约。

## 二、推荐命令

```powershell
# 默认：Tier 0
node Taierzhuang1938/Script_TestRunner.mjs

# 推荐：比较 origin/master、当前提交、暂存/未暂存和未跟踪文件，
# 自动运行 Tier 0 + 命中的 Tier 1，并提示相关 Tier 2
node Taierzhuang1938/Script_TestRunner.mjs --changed=origin/master

# 先看自动选择，不执行
node Taierzhuang1938/Script_TestRunner.mjs --changed=origin/master --dry-run

# 显式领域：默认仍会叠加 Tier 0
node Taierzhuang1938/Script_TestRunner.mjs --domain=terrain

# 排障专用：只跑领域探针，明确绕过 Tier 0
node Taierzhuang1938/Script_TestRunner.mjs --domain-only=terrain

# Tier 0 + 全部自动 Tier 1 / 独立人工 Tier 2 / 单项
node Taierzhuang1938/Script_TestRunner.mjs --tier=1
node Taierzhuang1938/Script_TestRunner.mjs --tier=2
node Taierzhuang1938/Script_TestRunner.mjs --only=DamageTest
```

`--list` 显示完整分级；`--fail-fast` 第一条新增红即停；`--verbose` 透传全部输出；
`--strict-baseline` 把 PlayTest 的历史红也计为失败。

可以直接在 worktree 中运行上述 `node` 命令，也可以使用仓库的 npm scripts。
npm 会以**向上找到的第一个** `package.json` 为项目根：worktree 根签出了 package.json
时就是 worktree 自己（安全）；没签出、或在子目录里敲时会一路爬回共享主检出，测的是
另一棵树。拿不准就先跑 `npm prefix` 看一眼，或干脆直接 `node`（详见
`Data_TechRepoLessons.md` §3.0，2026-08-18 有一轮白跑的实案）。

## 三、输出、超时与退出码

- 默认透出子测试的 `--- 阶段` 行，并每 60 秒打印心跳；其余输出只在失败时显示尾部。
- BootTest 上限 4 分钟，PlayTest 上限 20 分钟，一般测试上限 10 分钟；
  性能/出图测试按项目登记放宽到 20—30 分钟。
- `Ctrl+C`、终止信号和超时会清理当前测试及其浏览器子进程。
- `PASS`：测试全绿；`BASELINE`：只有已登记历史红；`FAIL`：新增红、崩溃或超时。
- 默认只要没有 `FAIL` 就返回 0；`--strict-baseline` 下历史红也返回 1。

2026-08-24 在 master `5c0781b9` 上完整实测：BootTest 92.7 秒、PlayTest
610.5 秒、Tier 0 合计 703.7 秒；同日其他两轮曾达到 887.9 与 996.7 秒。
耗时受机器和渲染改动影响，不再使用“约 12 分钟”作为保证值。

## 四、Tier 0 —— 每次改动必跑

| 测试 | 守什么 |
|---|---|
| BootTest | 七关开机冒烟、WebGL 健康、draw call/triangles 红线 |
| PlayTest | 真浏览器端到端通关，130 条运行时断言 |
| TestRunnerTest | 分级选择、Git 映射、历史基线、登记完整性 |
| ModuleGraphTest | 从入口递归走模块图与 index.html import map 对账：新模块必登记、源码禁自写 ?v=（纯 Node） |
| HudPromptTest | HUD 提示纯逻辑 |
| RiggedModelTest | `.tzm.json` 绑定模型数据 |
| FractureBakeTest | 预破碎离线数据 |
| CutsceneControlTest | 过场导演机位与生命周期 |

## 五、Tier 1 —— 自动领域探针

`--domain=…` 默认运行 Tier 0 加下表自动探针。`--changed` 依据文件名与共享底座
规则匹配一个或多个领域；无法识别的台儿庄文件会明确列出，并由 Tier 0 保守兜底。

| 领域 | 自动探针 |
|---|---|
| terrain | HeightmapVerify → JieheTerrain → TengxianLayout → Physics → Jump → Destruction |
| physics | Physics → Jump → Destruction → FractureBake |
| combat | Damage → GunFeel → FixedCenterAim → ReticleCalibration → SprintCrosshair → SprintViewmodel |
| ai | AiBehavior、Visibility |
| hud | HudPrompt、HudPromptBrowser |
| audio / voice | AudioTest / VoiceTest |
| menu | MenuTest、BootPropTest |
| editor | EditorTest、DestructionEditorTest |
| cutscene | CutsceneControl、ActorPose |
| render | ActorBatch → PropInstancing → ExternalPropAsset → TownDressing → EastSuburbBlocks → EastSuburbNav → WestDistrictCoverage → WestSuburbBlocks → WestStation → DressingProbe；另提示相关 Tier 2 |
| perf | 不自动跑机器敏感测试，只提示 Tier 2 |

改 `Script_Main.mjs` 会保守选择所有有自动探针的领域。测试文件本身按其登记领域反向映射。

## 六、Tier 2 —— 低频人工审查

`ShotTest`、`GiTest`、`DeathViewTest`、`PerformanceTest`、`FrameProfileTest`、
`GodRaysPerformanceTest`。其中出图测试进程成功只代表产物生成成功，仍需人工看图。

## 七、PlayTest 历史红基线

截至 2026-08-26，PlayTest 有 6 条历史红。runner 按**完整断言名和重复次数**核对：

- 实际红是基线子集：显示 `BASELINE`，缺失项会提示“已转绿、应更新基线”；
- 出现未登记断言名：显示 `FAIL` 并返回 1；
- 没有正常的通关汇总（崩溃、卡死、超时）：始终 `FAIL`；
- 同名历史红的实际细节仍会列出，不等于问题已被认可或修复。

当前基线包括两条火力节奏、击杀回执（08-25 曾转绿、08-26 在干净 2cbd54d8 上归因为
master 存量回归后重新登记，killConfirm 听觉 cue 不增长）、夜袭携行、姿态可见度和
Esc 指针锁。清理一条后应立即删除 runner 中对应基线。

## 八、维护规则

- 新增 `Script_*Test.mjs` 必须登记到 `testDefs` 并归入 tier/domain；
  `Script_TestRunnerTest.mjs` 会扫描目录阻止漏登。
- 新模块要补 `changedDomainRules`；未匹配警告不能长期搁置。
- Tier 2 不得塞进自动领域 `tests`；用 `tier2Tests` 给出人工建议。
- 改玩法同步更新断言；历史红基线只隔离既有债务，不得用于吞掉新增回归。
- 修改 runner 后至少执行：
  `node --check Taierzhuang1938/Script_TestRunner.mjs` 和
  `node Taierzhuang1938/Script_TestRunnerTest.mjs`。
