# 台儿庄白盒测试分级（Data_TestTiers）

> 统一入口：`node Taierzhuang1938/Script_TestRunner.mjs`。
> 登记、领域和数量以 `Script_TestRunner.mjs --list` 与 `Script_TestRunnerTest.mjs` 为准，另含高度图 verify；这里不维护第二份固定测试总数。

## 一、目标与纪律

测试按“执行时机 × 爆炸半径”分配。日常不再把十几分钟整机回归绑在每次编辑后：

1. **quick（默认）**：`tier0Fast` 中的纯 Node 快测 + 命中领域的纯 Node 探针，供编辑循环；
2. **prepush**：完整领域探针，并按具体文件风险追加 Boot/BootStall/Geo，供推送前验收；
3. **full**：完整 Tier 0 + 命中领域，供共享底座、集成批和终验；
4. **Tier 2**：性能实测与出图仍是低频人工审查，不由 `--changed` 自动执行。

旧七章整局通关测试 `Script_PlayTest.mjs` 已删除。当前正片是新版第一关《往南的路》（`?whitebox=p012`），由 `FirstLevelMissionTest` 与 `FirstLevelMissionBrowserTest --campaign` 验证；旧 P0/P1/P2 浏览器测试只覆盖 `p012-archive`，不能替代新版通关。
跨模块安全网由 BootTest、当前任务浏览器验收及领域专项承担，领域专项仍负责深度，
例如伤害口径重放、整墙碰撞扫掠、碰撞盒与几何对账、AI 决策和编辑器数据契约。

## 二、推荐命令

```powershell
# 默认：quick，纯 Node 快速基座
node Taierzhuang1938/Script_TestRunner.mjs

# 编辑循环：比较提交、暂存/未暂存和未跟踪文件，只跑命中领域的纯 Node 探针
node Taierzhuang1938/Script_TestRunner.mjs --changed=origin/master --profile=quick --fail-fast

# 推送前：完整领域专项；只有高风险文件才追加 BootTest / GeoTest
node Taierzhuang1938/Script_TestRunner.mjs --changed=origin/master --profile=prepush --fail-fast

# 集成/终验：完整 Tier 0 + 命中领域
node Taierzhuang1938/Script_TestRunner.mjs --changed=origin/master --profile=full

# 先看自动选择，不执行
node Taierzhuang1938/Script_TestRunner.mjs --changed=origin/master --dry-run

# 显式领域：默认叠加快速基座；推送前加 --profile=prepush
node Taierzhuang1938/Script_TestRunner.mjs --domain=terrain

# 排障专用：只跑领域探针，明确绕过 Tier 0
node Taierzhuang1938/Script_TestRunner.mjs --domain-only=terrain

# 兼容旧入口：完整 Tier 0 / Tier 0 + 全部 Tier 1 / 独立人工 Tier 2 / 单项
node Taierzhuang1938/Script_TestRunner.mjs --tier=0
node Taierzhuang1938/Script_TestRunner.mjs --tier=1
node Taierzhuang1938/Script_TestRunner.mjs --tier=2
node Taierzhuang1938/Script_TestRunner.mjs --only=DamageTest
```

`--list` 显示完整分级；`--fail-fast` 第一条新增红即停；`--verbose` 透传全部输出；
`--strict-baseline` 把登记过的历史红（`expectedFailures`）也计为失败；现在没有测试登记基线。

自动选测会忽略 Markdown 及 `.blend/.py/.ps1` 等路径；纯说明修改只做静态检查。生成脚本、源工程或文档中的可执行代码变化仍须按实际产物与消费链补充验证，忽略路径不代表免验收。
未知运行时文件在 quick 显示警告，prepush 会保守补完整整机门禁。启动任何测试前会先检查
`playwright-core`；缺依赖时立即退出，不再先跑几十秒后逐项失败。

可以直接在 worktree 中运行上述 `node` 命令，也可以使用仓库的 npm scripts。
npm 根入口也已拆档：`npm test` 只调度 Git 改动命中的游戏项目，`npm run test:all`
才是明确的全仓冒烟；`npm run test:changed:dry` 只展示将运行哪些项目。
使用 npm 前以 `npm prefix` 核对实际项目根。正常 worktree 子目录仍能找到本树的 package.json；缺少它时可能找到其他祖先目录，不会仅因 worktree 身份就跳到共享主检出。优先从本任务 worktree 根直接 `node` 调脚本；依赖解析也按实际安装位置检查，见 `Data_TechRepoLessons.md` §3.0。

## 三、输出、超时与退出码

- 默认透出子测试的 `--- 阶段` 行，并每 60 秒打印心跳；其余输出只在失败时显示尾部。
- 选择阶段显示 profile、测试清单和基于历史量级的预计耗时；`--dry-run` 不做依赖预检。
- BootTest 上限 4 分钟，一般测试上限 10 分钟；
  性能/出图测试按项目登记放宽到 20—30 分钟。
- `Ctrl+C`、终止信号和超时会清理当前测试及其浏览器子进程。
- runner 启动的浏览器测试跨 worktree 共用一个全局槽；多 agent 最多排队 60 分钟，不再同时争抢 GPU/内存。存活 owner 不因锁龄被清理；刚创建而尚未写完或内容损坏的锁有 10 秒写入宽限，超过宽限且没有有效 owner 才回收。
- `PASS`：测试全绿；`BASELINE`：只有已登记历史红；`FAIL`：新增红、崩溃或超时。
- 默认只要没有 `FAIL` 就返回 0；`--strict-baseline` 下历史红也返回 1。
- **测试内部的等待另算**：`page.waitForFunction(fn, arg?, options?)` 的第二格是
  传给页面函数的实参，不是 options。写成 `waitForFunction(fn, { timeout: 180000 })`
  超时会静静落回 playwright 默认的 30 秒——快机器上照样全绿，慢机器或
  `quality=high` 的大关才随机炸成「Timeout 30000ms exceeded」，看着还像被测功能坏了。
  必须补 `null` 占位：`waitForFunction(fn, null, { timeout: 180000 })`。
  `TestRunnerTest` 会扫全部 `Script_*.mjs` 把漏写的挑出来（2026-08-26 一次修了 55 处）。

2026-08-24 在 master `5c0781b9` 上完整实测：BootTest 92.7 秒、（已删除的）PlayTest
610.5 秒、Tier 0 合计 703.7 秒；同日其他两轮曾达到 887.9 与 996.7 秒。
耗时受机器和渲染改动影响，不再使用“约 12 分钟”作为保证值。

## 四、Tier 0 —— 快速基座与整机门禁分开

| 测试 | 守什么 |
|---|---|
| BootPayloadTest | 开机贴图字节红线：`PBR_SETS` 的总量与单张上限、URL 存在性、fallback 指向真配方（纯 Node）|
| AutoQualityTest | 自动降档规则层：阶梯映射 / 持续 2 s 才降 / 降后锁 30 s / 升档要 8 s / 死区不抖（纯 Node，毫秒级） |
| TestRunnerTest | 分级选择、Git 映射、历史基线、登记完整性 |
| ModuleGraphTest | 从入口递归走模块图与 index.html import map 对账：新模块必登记、源码禁自写 ?v=（纯 Node） |
| HudPromptTest | HUD 提示纯逻辑 |
| RiggedModelTest | `.tzm.json` 绑定模型数据 |
| CharacterModelTest / CharacterHitboxMathTest | 蒙皮角色资产与子弹代理数学 |
| FractureBakeTest | 预破碎离线数据 |
| CutsceneControlTest | 过场导演机位与生命周期 |
| GeoTest / RoadPathTest / WallPlanTest | 几何快路、道路与围墙规划契约；其中 GeoTest 需浏览器，只在门禁档运行 |
| BootTest | 七片切片开机冒烟（序章 + 六片暂时废弃场景）、WebGL 健康、draw call/triangles 红线；prepush 按渲染/关卡风险触发 |
| BootStallTest | 外部贴图挂死降级；prepush 仅由材质/贴图/外部资产链触发 |

## 五、Tier 1 —— 自动领域探针

`--domain=…` 默认运行快速基座，加上下表中不启动浏览器的探针；prepush 才运行该领域
完整探针。`--changed` 依据文件名与共享底座规则匹配领域。`TestRunnerTest` 会扫描全部已跟踪
台儿庄文件，强制每个运行时文件“匹配领域或显式忽略”，不允许映射缺口长期积累。

| 领域 | 自动探针 |
|---|---|
| firstLevel | FirstLevelMissionTest / FirstLevelMissionBrowserTest（`--campaign`；quick 只跑纯 Node，prepush 包含浏览器） |
| terrain | HeightmapVerify → JieheTerrain → TengxianLayout → Physics → Jump → Destruction |
| physics | Physics → Collider → Jump → Destruction → FractureBake |
| combat | Damage → GunFeel → FixedCenterAim → ReticleCalibration → SprintCrosshair → SprintViewmodel → FpsArm → SprintMelee → Bayonet → Range → MeleeQte |
| ai | AiBehavior、Visibility |
| hud | HudPrompt、HudPromptBrowser |
| audio / voice | AudioTest / VoiceTest |
| menu | MenuTest、BootPropTest |
| editor | EditorTest、DestructionEditorTest |
| cutscene | CutsceneControl、ActorPose |
| render | 渲染子系统专项（下表）→ ActorBatch → PropInstancing → ExternalPropAsset → TownDressing → EastSuburbBlocks → EastSuburbNav → WestDistrictCoverage → WestSuburbBlocks → WestStation → DressingProbe → RespawnShaderWarm（换人 / 人物模型号首次进画面不现编着色器）；另提示相关 Tier 2 |
| perf | 不自动跑机器敏感测试，只提示 Tier 2 |
| infra | TestRunnerTest、ModuleGraphTest（测试入口与本地服务） |

改 `Script_Main.mjs` 会保守选择所有有自动探针的领域。测试文件本身按其登记领域反向映射。

### 渲染子系统专项（2026-09 3A 大修新增，全部登记在 `render` 领域）

对应章节见 [渲染管线](Data_TechRenderPipeline.md) 的 §1.12「逐章的回归口」。
「时长量级」是本机历史观测的量级，不是保证值；括号里是 runner 登记的超时上限。

| 测试 | 守什么 | 时长量级 | 真浏览器 |
|---|---|---|---|
| AutoQualityTest | 自动降档阶梯（Tier 0 快测，也在 render 领域里） | 毫秒级（默认 10 分钟） | 否，纯 Node |
| PostFrameGraphTest | 帧图地基契约：pass 顺序 / MRT 速度靶 / HZB / 太阳阴影接口 / 材质补丁三态 / 不重编译 | 分钟级（15 分钟） | 是 |
| SamplerBudgetTest | 采样器预算：四档 × `gi=0/1` 八轮正片，每个程序都链接成功且 sampler uniform ≤ `MAX_TEXTURE_IMAGE_UNITS` | **十分钟级**（40 分钟；八次开正片） | 是 |
| GtaoTest | GTAO / 弯曲法线 / 镜面遮蔽 / SSIL：接触暗带、时域收敛、无重投影残影、色板反弹 | 分钟级（15 分钟） | 是 |
| CsmTest | 级联阴影 / PCSS / 接触阴影：逐级图与分割、纹素吸附、级间重叠、节流排班、痤疮比例、三张调试图，末尾四档各加载一遍 | ~70 秒（15 分钟） | 是 |
| MaterialUpgradeTest | 材质着色升级：视差位移随视角反号 / 距离淡出 / 微阴影压直射 / 细节法线淡入 / 绒光与各向异性 / 皮肤散射红移 / 程序数稳态 | 分钟级（15 分钟） | 是（源码契约与纯 Node 两级也在同一进程里） |
| SsrTest | 屏幕空间反射：受控场景倒影 / 置信度边界 / 粗糙度上限 / 时域收敛与拖影 / 三张调试图 | 分钟级（15 分钟） | 是 |
| ClusteredLightsTest | 簇分配与暴力法逐簇相等（纯 Node）＋ 24 盏彩色点光逐盏读回、聚光锥内外、不重编译（真浏览器） | ~150 秒（20 分钟） | 混合：`--node` 只跑纯 Node 段（秒级），`--perf` 另加 1440p GPU/CPU 消融 |
| VolumetricsTest | froxel 体积雾：能见度不变差 / 图集单调 / 阴影切光柱 / 时域收敛 / 局部光与雾体 | 分钟级（25 分钟） | 是 |
| AtmosphereTest | 物理大气：四张 LUT / 十档预设的辐照度与色相标定 / 70 m 能见度不许降 / 大气透视近远端 | ~130 秒（15 分钟） | 是；`--shot` 再出 14 张 A/B 对照图 |
| ExposureTest | 直方图自动曝光 / 镜头光晕 / 3D LUT 分级（中灰标定、适应曲线、LUT ≤ 1/255、开关不改默认机位亮度） | 分钟级（30 分钟） | 是；`--calibrate` 量锚点、`--shots` 出对照图、`--baseline=<根目录>` 与另一份检出逐比特比对 |
| TaauTest | TAAU 两组分辨率 / 斜边锯齿能量 / 速度靶消鬼影 / 运动模糊快门 / 散景 CoC 与「枪不糊」 | 分钟级（20 分钟） | 是 |

这一组里除 AutoQualityTest 外都占**全局浏览器槽**（跨 worktree 串行，见第三节）。
单跑排障直接 `node Taierzhuang1938/Script_<名字>.mjs`；`SamplerBudgetTest` 最贵，
只有碰材质补丁 / 新增采样器时才必须跑。

新版第一关的配音完成验收另加 `node Taierzhuang1938/Script_FirstLevelMissionTest.mjs --audio` 与 `node Taierzhuang1938/Script_FirstLevelMissionBrowserTest.mjs --audio --campaign`。默认套件通过不代表配音完成；来源与未完成项见 [重构验收](Data_FirstLevelRebuildAcceptance.md)。仅在声音资产或相应完成声明涉及本次任务时追加严格门禁。

## 六、Tier 2 —— 低频人工审查

`ShotTest`、`GiTest`、`DeathViewTest`、`PerformanceTest`、`FrameProfileTest`、
`GodRaysPerformanceTest`。其中出图测试进程成功只代表产物生成成功，仍需人工看图。

## 七、历史红基线

整局通关测试 PlayTest 与它的三条历史红已于 2026-09-06 随第一关到终章的废弃一起删除。
runner 的基线机制（`testDefs[*].expectedFailures`，按**完整断言名和重复次数**核对）保留：

- 实际红是基线子集：显示 `BASELINE`，缺失项会提示“已转绿、应更新基线”；
- 出现未登记断言名：显示 `FAIL` 并返回 1；
- 没有正常的通关汇总（崩溃、卡死、超时）：始终 `FAIL`。

现在没有任何测试登记基线；新增基线前先修，修不了再登记并写明原因。

## 八、维护规则

- 新增 `Script_*Test.mjs` 必须登记到 `testDefs` 并归入 tier/domain；
  `Script_TestRunnerTest.mjs` 会扫描目录阻止漏登。
- 新模块要补 `changedDomainRules`；未匹配警告不能长期搁置。
- Tier 2 不得塞进自动领域 `tests`；用 `tier2Tests` 给出人工建议。
- 改玩法同步更新断言；历史红基线只隔离既有债务，不得用于吞掉新增回归。
- 修改 runner 后至少执行：
  `node --check Taierzhuang1938/Script_TestRunner.mjs` 和
  `node Taierzhuang1938/Script_TestRunnerTest.mjs`。
