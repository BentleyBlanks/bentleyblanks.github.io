# EarSpa3D 验收索引

按改动影响选择下表中的相关检查，不把整表当作每次必跑清单。共享物理、接触或经营改动覆盖受影响链路；纯说明整理检查内容、链接、命令与 diff。检查的通过与历史失败分别记录，不能削弱断言或用调试状态冒充真实操作。

## 调用方式

命令从本任务 worktree 根执行。使用本机已安装的 `playwright-core` 与 Edge；可用 `EARSPA_BROWSER` 指定其他 Chromium 可执行文件。先检查脚本实际依赖解析，不假定兄弟 worktree 自动共享依赖。

```powershell
node scripts/Script_LocalPreview.mjs --no-open
# 下面的 8080 替换为服务实际输出端口，并用 /__preview/ping 核对检出根
node EarSpa3D/Script_ToolDragPlayTest.mjs --url=http://127.0.0.1:8080/EarSpa3D/
node EarSpa3D/Script_PeelPhysicsTest.mjs
```

下表文件均位于 `EarSpa3D/`；用 `node EarSpa3D/<脚本>` 调用。使用浏览器的检查传 `--url=http://127.0.0.1:<实际端口>/EarSpa3D/`（尾部斜杠保留）；不要依赖脚本的历史默认端口。

| 改动范围 | 对应检查（按实际影响选用） |
| --- | --- |
| 直接操控、工作面与边缘接触 | `Script_ToolDragPlayTest.mjs`、`Script_InstrumentInteractionTest.mjs`、`Script_WaxEdgeContactTest.mjs`、`Script_WaxEdgePlayTest.mjs`、`Script_ControlPlayTest.mjs`、`Script_TweezersExtractionTest.mjs` |
| 薄壳、剥离与黏聚断裂 | `Script_PeelPhysicsTest.mjs`、`Script_SoftWaxPhysicsTest.mjs`、`Script_SoftWaxPlayTest.mjs`、`Script_CohesivePhysicsTest.mjs`、`Script_CohesiveScrapingPlayTest.mjs`、`Script_DirectionalPhysicsTest.mjs` |
| 油耳、体积与显示曲面 | `Script_OilyCoatingTest.mjs`、`Script_SlimePhysicsTest.mjs`、`Script_OilyWaxPlayTest.mjs`、`Script_OilyFilmPlayTest.mjs`、`Script_OilyRenderingTest.mjs`、`Script_OilyDetailTest.mjs`、`Script_OilyVisibilityTest.mjs` |
| 羽毛与刷拢 | `Script_FeatherSweepPlayTest.mjs`、`Script_BrushGatherPlayTest.mjs` |
| 经营、完整服务与收集 | `Script_EconomyTest.mjs`、`Script_ChunkPlayTest.mjs`、`Script_TactilePlayTest.mjs` |
| 声音触发与接触门控 | `Script_LandingSoundTest.mjs`、`Script_ContactFrictionTest.mjs`、`Script_ContactFrictionPlayTest.mjs` |
| 画质与物理设置 | `Script_RenderQualityPlayTest.mjs`、`Script_PhysicsSettingsTest.mjs`、`Script_PhysicsSettingsPlayTest.mjs` |
| 外耳、材质与渲染 | `Script_RenderingRegressionTest.mjs`、`Script_OuterAnatomyTest.mjs`、`Script_SkinScatteringTest.mjs`、`Script_MetalRenderingTest.mjs`、`Script_TactileDetailTest.mjs` |
| 加载、跨日与碎裂性能 | `Script_ContactLoadingTest.mjs`、`Script_DayTwoPerformanceTest.mjs`、`Script_OilyFracturePerformanceTest.mjs` |

## 证据要求

- 实际输入、持久化与接触改动优先 `Script_ToolDragPlayTest.mjs`，画质／换客设置用 `Script_RenderQualityPlayTest.mjs`；这些脚本包含浏览器错误和四种视口检查。不能只凭启动服务、HTTP 200 或截图判断没有错误。
- 桌面与触屏整局检查使用真实鼠标／CDP 触屏，覆盖桌面、390×844、320×568、844×390 的受影响视口。`Script_ChunkPlayTest.mjs` 默认通过共享驱动覆盖四种视口；`Script_TactilePlayTest.mjs` 另有 `--touch`，`Script_OilyFracturePerformanceTest.mjs` 可追加 `--touch --label=Touch`。
- 改耳道空间、机位、光照或材质时，查看 `_dev/` 实际截图及相应探针读数。普通页的 `__EarSpaProbe()` 只读；`?debug=1` 下用 `__EarSpaDebug.StepFrames(n)` 主动推进，避免把后台 rAF 节流造成的未完成动画当作画面结果。窄屏由浏览器 context viewport／CDP device metrics 设置，不靠窗口外框尺寸。
- 油耳检查保留真实曲面间隙、绘制顺序、闭合断口、体积／质量守恒和离壁收拢；每次只挖局部一团，持续握持不再次取母体，静止耳勺不加载。
- 音频信号和输出电平能验证起音、静音、门控及素材完整性；主观音色定稿仍须试听，不把数值结果称为听感通过。
- `_dev/` 只存本地报告、截图、录屏及一次性诊断。通用检查脚本应放在已跟踪位置；不再引用不存在的 `_dev/Script_Probe.mjs`、`Diag_Step.js` 或 `Script_ShotCdp.mjs`。
