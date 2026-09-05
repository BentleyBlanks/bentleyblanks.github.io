# Taierzhuang1938 项目入口

《滕县 一九三八》是浏览器 FPS 白盒，正片为滕县七章线性关卡；目录名是历史遗留。每章只建当前切片，换章拆掉重建。Three.js 与 Rapier3D 均使用仓库内 vendor，零 CDN；渲染管线不引入 addon。

仓库协作、命名、资产生成与发布遵循 [根 AGENTS.md](../AGENTS.md)。这里保留跨系统契约；涉及的模块、接口与分册在 [系统参考](docs/Data_AgentReference.md) 中按需查阅。源码头注是定位线索，仍需结合实现与测试确认现状。

## 跨系统契约

1. 浏览器模块变更更新 `index.html` import map 对应的 `?v=`，新增模块登记 import map；源码 import 不自带 `?v=`，避免同一模块形成两个实例。验收：`Script_ModuleGraphTest.mjs`。
2. `Data_*.mjs`、规则层及要求纯 Node 运行的 TexBake / FarLand / Identify / CutsceneCheck 保持无 three 依赖。
3. 新静态几何走 `BuildSink` 分区合批，不零散 add Mesh；开机预算统一取 `SCENE_RENDER_LIMITS`。涉及场景预算时按七关检查，验收：`Script_BootTest.mjs`。
4. 世界坐标 X 向东、Z 向南、Y 向上，单位米，原点为城中心十字街口。人物正面与枪口为局部 -Z；外部 FBX/GLB 先查源朝向再经桥接层对齐。验收：CharacterModelTest 与 ActorPoseTest。
5. 地面由共享采样器决定；界河 `L0_Jiehe` 统一使用 `SampleJieheHeight(x,z)` / 注入的 `groundAt`，渲染、角色、AI、弹道和布设不得另写高度公式或硬编码绝对 y。改高度图或界河地形时运行 HeightmapCli verify、JieheTerrainTest、BootTest；下载、贴地与原始数据规则见 [高度图说明](docs/Data_TaierzhuangHeightmap.md) 及系统参考末节。
6. 材质 albedo 为 `SRGBColorSpace`，normal/orm 为 `NoColorSpace`；SSAO 只乘间接光。验收与依据：`Script_Materials.mjs`、`docs/Data_TechRenderPipeline.md`。
7. 枪械、战车减面按 `WEAPON_TRIANGLE_LIMIT` / `VEHICLE_TRIANGLE_LIMIT`；先排除展示件、备用状态及重复壳，超阈值才减面，降幅不超过 5% 时保留原始拓扑。特例与登记取 `SPECIAL_TRIANGLE_TARGETS` / `EXTERNAL_GLB_STANDARDS`，全场预算同步进 `SCENE_RENDER_LIMITS`。验收：AssetStandardsTest。
8. 新增 `Script_*Test.mjs` 登记 `Script_TestRunner.mjs` 的 `testDefs` 与 tier/domain，新模块补 `changedDomainRules`；验收：`Script_TestRunnerTest.mjs`。数值以代码常量为准，不在多份说明里复制易过时的预算。
9. 大刀与装刺刀武器统一走 `Script_MeleeCombat.mjs`，玩家、敌友军及白盒不得另建伤害判定。F 推架零生命伤害；QTE 只在真实僵持或倒地压制时触发，成功不自动杀敌。动画与验收入口见 [白刃战说明](docs/Data_MeleeQte.md)。

## 调查与工具

- 检索自有代码默认排除 vendor 大型压缩文件；调查第三方问题时定向读取相关 vendor，避免整行巨量输出。
- 浏览器验证优先复用 `../PrairieFire1937/Script_BrowserTestKit.mjs` 的 `LaunchBrowser` 和 `Script_DevServer.mjs` 的 `ServeRoot`。需要新诊断时可扩展这些入口，保留浏览器释放及现有并发测试槽。
- Windows 无头测试不要触发真实指针锁；游戏在 `navigator.webdriver` 下用假锁，测试不以 `pointerLockElement` 作为状态依据。这条保护真实鼠标操作，不能因补探针而绕过。
- 多点截图按切片分组，同一场景复用建城结果；常用入口见系统参考。现有截图不覆盖问题时可补充定向取证。
- 从本任务 worktree 用 node 直接运行脚本；不把 npm 在缺少本地 package.json 时的向上查找误当作正在测试本树。

## 验证入口

命令从 worktree 根执行。测试风险映射、超时、并发与基线见 [Data_TestTiers.md](docs/Data_TestTiers.md)。

```powershell
node Taierzhuang1938/Script_DevServer.mjs
node Taierzhuang1938/Script_TestRunner.mjs --changed=origin/master --profile=quick --fail-fast
node Taierzhuang1938/Script_TestRunner.mjs --changed=origin/master --profile=prepush --fail-fast
```

- 页面手工预览可启动 DevServer；测试与出图脚本自带临时服务，无需额外起服。
- 编辑循环用 quick；运行时变化推送前用 prepush，按文件风险追加浏览器门禁。集成验收用 `--profile=full`，需按 diff 筛选时加 `--changed=<base>`；`--list` 查表，`--only=<name>` 或 `--domain-only=<domain>` 用于定向排障。
- 纯文档或源工程说明变化由 `--changed` 跳过运行时测试，不为入口整理全跑七关。
- `BASELINE` 表示已有失败，不能报告为全绿；新增失败阻断交付。`--strict-baseline` 将历史失败也视为阻断。
- 视觉改动需查看实际截图；数值通过不能代替视觉验收。Tier 2 出图不自动执行。

## 系统索引

[系统参考](docs/Data_AgentReference.md) 保留原路由表、截图/性能命令和分册导读：引导、渲染、材质、地形、模型、AI、白盒、战斗、物理、音频、过场、交互、编辑器及资产。旧文档引用 AGENTS.md 中这些章节时，对应内容已迁到该参考。

新增系统更新参考中的路由；改变跨系统契约更新本入口与测试。历史提案、事故记录和操作细节留在分册，不升级为所有任务的固定步骤。
