# EarSpa3D 验收索引

按改动影响选择下表中的相关检查，不把整表当作每次必跑清单。共享物理、接触或经营改动覆盖受影响链路；纯说明整理检查内容、链接、命令与 diff。检查的通过与历史失败分别记录，不能削弱断言或用调试状态冒充真实操作。

## 调用方式

命令从本任务 worktree 根执行。使用本机已安装的 `playwright-core` 与 Edge；可用 `EARSPA_BROWSER` 指定其他 Chromium 可执行文件。先检查脚本实际依赖解析，不假定兄弟 worktree 自动共享依赖。

```powershell
node scripts/Script_LocalPreview.mjs --no-open
# 下面的 8080 替换为服务实际输出端口，并用 /__preview/ping 核对检出根
node EarSpa3D/Script_AssistedPlayTest.mjs --url=http://127.0.0.1:8080/EarSpa3D/
node EarSpa3D/Script_PeelPhysicsTest.mjs
```

下表文件均位于 `EarSpa3D/`；用 `node EarSpa3D/<脚本>` 调用。使用浏览器的检查传 `--url=http://127.0.0.1:<实际端口>/EarSpa3D/`（尾部斜杠保留）；不要依赖脚本的历史默认端口。

| 改动范围 | 对应检查（按实际影响选用） |
| --- | --- |
| 默认辅助操作、逐件托送、触屏 | `Script_AssistedPlayTest.mjs --url=...`：自然耳垢、真实输入，首客单勺交单、静止不剥离、闭镊、滴液、刷拢与羽毛落盘、深部路线、取消、触控与质量 |
| 成长经济、收藏评级、防刷 | `Script_EconomyTest.mjs`、`Script_ProgressionTest.mjs`：新档、旧档迁移、难度与完整度、同源碎片合价、疼痛无小费、单次结算／售卖和存储 |
| 商店完整流程 | `Script_CareerShopPlayTest.mjs --url=...`：受控服务夹具之后用真实按钮售卖、购买、灯光升级和刷新；实际提取证据使用辅助操作检查 |
| 固定／随动照明、弹性刷毛、最高级特效 | `Script_BristleDynamicsTest.mjs`、`Script_CareerEffectsPlayTest.mjs --url=...`：灯光固定与明确调向、升级强度、实际毛簇碰壁、特效分级门控、一次性和过期；升级与闪光为受控渲染夹具 |
| 病例目标、交单、练习与深部路线 | `Script_CareCasesTest.mjs` 验证目标和多代碎片；`Script_AssistedPlayTest.mjs` 与 `--case2`、`--practice-grade` 专项验证真实输入、双目标慢渗透、深部夹取、交单及营业恢复；旧 `Script_CareCasesPlayTest.mjs` 为原精细输入历史轨迹 |
| 鼠标与工作端定位 | 当前辅助定位用 `Script_AssistedPlayTest.mjs`；`Script_PointerAlignmentTest.mjs` 保留原自由深度平面定位的历史回归，不要求辅助贴合时工作端与自由指针逐像素重合 |
| 辅助定位、工作面与边缘接触 | `Script_AssistedPlayTest.mjs` 检查空夹、双侧闭镊、软化、静止不剥离、勺背无效、托送、质量及取消；`Script_InstrumentInteractionTest.mjs`、`Script_WaxEdgeContactTest.mjs` 为独立物理断言 |
| 薄壳、剥离与黏聚断裂 | `Script_PeelPhysicsTest.mjs`、`Script_SoftWaxPhysicsTest.mjs`、`Script_SoftWaxPlayTest.mjs`、`Script_CohesivePhysicsTest.mjs`、`Script_CohesiveScrapingPlayTest.mjs`、`Script_DirectionalPhysicsTest.mjs` |
| 油耳、体积与显示曲面 | `Script_OilyCoatingTest.mjs`、`Script_SlimePhysicsTest.mjs`、`Script_OilyRenderingTest.mjs`、`Script_OilyDetailTest.mjs`、`Script_OilyVisibilityTest.mjs`；`Script_AssistedBoundaryPlayTest.mjs` 用真实指针核对油耳每团上限 .32、静止不续产、母体留壁、局部托送落盘与全耳质量账本，并记录浅／深湿块的辅助悬停耗时 |
| 羽毛与刷拢 | `Script_AssistedPlayTest.mjs` 验证刷拢→鹅绒掸接触→逐件托送落盘；`Script_CareerEffectsPlayTest.mjs` 验证毛簇弹性与完整壁面间隙；`Script_FeatherQueuePlayTest.mjs` 验证真实多组托送与12组持有状态夹具的队列边界（不把夹具称为一划拾取12组）。旧扫刷轨迹保留为历史参考 |
| 耳垢与微屑形体 | `Script_WaxMorphologyTest.mjs` 验证 96 种封闭薄壳及 576 粒碎屑的拓扑、可复现性、接触范围和薄壳静态绑定；`Script_MaterialResponseTest.mjs` 验证实景与受力材质；`Script_AssistedPlayTest.mjs` 验证真实接触及收集 |
| 自然掉落、搬运与薄壳性能 | `Script_LightWaxPhysicsTest.mjs` 检查 9810 mm/s² 重力轨迹、阻力耗散、30/60/120 Hz 一致性、240 Hz 子步碰撞及整体节点搬运；可加 `--compare=<commit>` 对照旧薄壳求解器并记录局部耗时。`Script_LightWaxRenderTest.mjs --url=...` 检查加载／断口法线、受控自然飞行与实际落盘；可加 `--compare=<commit>` 对照旧法线实现。真实鼠标／键盘使用 `Script_AssistedPlayTest.mjs`，不得把受控夹具称为真实手动操作 |
| 经营、完整服务与收集 | `Script_EconomyTest.mjs`、`Script_ProgressionTest.mjs`、`Script_CareerShopPlayTest.mjs` 与 `Script_AssistedPlayTest.mjs`；旧全局自动操作脚本仅作历史参考 |
| 声音触发与接触门控 | `Script_LandingSoundTest.mjs`、`Script_ContactFrictionTest.mjs`、`Script_ContactFrictionPlayTest.mjs` |
| 画质与物理设置 | `Script_RenderQualityPlayTest.mjs`、`Script_PhysicsSettingsTest.mjs`、`Script_PhysicsSettingsPlayTest.mjs` |
| 外耳、材质与渲染 | `Script_RenderingRegressionTest.mjs`、`Script_OuterAnatomyTest.mjs`、`Script_SkinScatteringTest.mjs`、`Script_MetalRenderingTest.mjs`、`Script_TactileDetailTest.mjs` |
| 厚度、受力材质与动态遮蔽 | `Script_SoftWaxPhysicsTest.mjs`、`Script_MaterialResponseTest.mjs`、`Script_AssistedPlayTest.mjs`；材质检查显式要求 `--url=`，包含四种材质／四种视口截图、受控物理夹具与真实像素着色错误检查 |
| 加载、跨日与碎裂性能 | `Script_ContactLoadingTest.mjs`、`Script_DayTwoPerformanceTest.mjs`、`Script_OilyFracturePerformanceTest.mjs`；`Script_RuntimeWarmupTest.mjs --url=...` 检查工具／油耳／阴影预热和毛刷法线；`Script_SlimeKernelTest.mjs --physics` 检查 JS/WASM 216 帧完全一致及体积、碎裂守恒 |

## 证据要求

- 实际输入、旧设置迁移与接触改动优先 `Script_AssistedPlayTest.mjs`，画质／换客设置用 `Script_RenderQualityPlayTest.mjs`；核对真实输入、浏览器错误和受影响视口。不能只凭启动服务、HTTP 200 或截图判断没有错误。
- 默认辅助检查使用真实鼠标和浏览器触控事件，不修改锚点或姿态取得提取成功；桌面截图1280×720，另验窄屏布局。旧精细检查只代表其底层接口，不能代替当前默认输入验证。
- `Script_ToolDragPlayTest.mjs`、`Script_ForcepsControlPlayTest.mjs`、`Script_ControlPlayTest.mjs`、`Script_TweezersExtractionTest.mjs`、`Script_BrushGatherPlayTest.mjs`、`Script_FeatherSweepPlayTest.mjs` 中旧拖拽／跟随／旋扫断言仅作历史参考，不作为当前辅助入口验收要求。其他旧操作轨迹中的物理夹具可用于对应求解器回归，不能据此宣称现行真实输入通过。
- 改耳道空间、机位、光照或材质时，查看 `_dev/` 实际截图及相应探针读数。普通页的 `__EarSpaProbe()` 只读；`?debug=1` 下用 `__EarSpaDebug.StepFrames(n)` 主动推进，避免把后台 rAF 节流造成的未完成动画当作画面结果。窄屏由浏览器 context viewport／CDP device metrics 设置，不靠窗口外框尺寸。
- 油耳检查保留真实曲面间隙、绘制顺序、闭合断口、体积／质量守恒和离壁收拢；每次手动接触只挖局部一团，母体须重新接触，静止接触不积累撕取功。自然质心掉落与凝胶内部柔变分别验证。
- 音频信号和输出电平能验证起音、静音、门控及素材完整性；主观音色定稿仍须试听，不把数值结果称为听感通过。
- `_dev/` 只存本地报告、截图、录屏及一次性诊断。通用检查脚本应放在已跟踪位置；不再引用不存在的 `_dev/Script_Probe.mjs`、`Diag_Step.js` 或 `Script_ShotCdp.mjs`。

`Script_ClickControlPlayTest.mjs` 的旧点选全自动路径与 `Script_PrecisionPlayTest.mjs` 的独立进退／转腕输入都保留历史检查用途。当前入口为辅助贴合，新的操作说明和基准见 [Data_PrecisionControls.md](Data_PrecisionControls.md)。

本轮模型通过 Blender 原工程恢复参考并重新烘焙，形体与资产重建记录见 `Data_WaxSculptAssets.md`。新增导入的 CPU 模块测试加载器使用绝对URL解析，不改变物理断言。
