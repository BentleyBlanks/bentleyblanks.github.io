# Taierzhuang1938 项目入口（agent 必读）

《滕县 一九三八》—— 1938 年 3 月滕县保卫战的浏览器 FPS 白盒。川军第 122 师守城四日，
七章线性关卡；玩法对标 Easy Red 2，枪感对标战地系列。Three.js 0.185 + Rapier3D，
全部 vendor 收在仓库内，零 CDN；渲染管线零 addon（后处理链从 RenderTarget 手搭）。
目录名叫 Taierzhuang1938 是历史遗留：台儿庄那套「开放战场 + 占领点」已整体作废，
正片是滕县七章，**每章只建一片切片、换章拆掉重建**（`Script_Main.mjs` 头注）。

规模：175 个 `Script_*.mjs` + 38 个 `Data_*.mjs` 平铺在根目录，约十万行；`docs/` 39 篇分册。
本文件只放**硬规矩 + 路由表 + docs 导读**；细则、判据、事故过程在 `docs/` 与各文件头注。
**这个仓库的文件头注释是第一手文档**：先读头注再读函数体。

## 硬规矩（三行一条：规矩 / 为什么 / 守着它的）

1. **改任何浏览器模块，必须 bump `index.html` import map 里那一行 `?v=`；新增模块必须登记进 import map。**
   只盖入口不盖模块图 = 「新壳配旧芯」：入口拿到新版、它 import 的模块吃缓存旧版，
   手机 Safari 黏得多所以只在移动端复现。症状是「改了没生效 / 音频丢了」。
   守着它的：`Script_ModuleGraphTest`；源码里一律不许自己写 `?v=`（同一模块两个 URL = 两份实例）。

2. **`Data_*.mjs` 与规则层不许 import three。**
   出图脚本、导航烘焙、剧本自检全在纯 Node 里跑；沾上 three，命令行工具就得拖起整个渲染库。
   守着它的：各 Data 文件头注「纯数据，不许 import three」；TexBake / FarLand / Identify /
   CutsceneCheck 四只脚本同律。

3. **新静态几何一律走 `BuildSink` 分区合批，不许散着 add Mesh。**
   实测过一次：15 万三角形占掉一帧 1408 个 draw call（全场的 84%）——
   瓶颈是 three 每次提交的 JS 固定开销，不是三角形。守着它的：BootTest 的 draw call 红线。

4. **开机红线统一读 `SCENE_RENDER_LIMITS`，七关逐关量，越线即 FAIL。**
   这是整机预算的唯一口径；docs 里旧设计书写的预算数字一律作废。
   守着它的：`Script_BootTest.mjs:36-37`（`MAX_DRAW_CALLS` / `MAX_TRIANGLES`）。

5. **坐标与朝向契约：X 向东、Z 向南、Y 向上，单位米，原点 = 城中心十字街口。**
   人物正面与枪口一律**局部 -Z**；导入的 FBX/GLB 源朝 glTF +Z，由桥接层翻转 ——
   新导入资产先查朝向再摆（十套军人 GLB 的那一刀是 `Script_CharacterModel.MODEL_FORWARD_YAW`；
   漏翻的代价是全场军人背对自己的朝向，2026-08-25 漏到 09-02 才有人问「日军怎么背对我开枪」）。
   守着它的：`CharacterModelTest` 的朝向闸（逐个 GLB 现量）＋ `ActorPoseTest` 的 `checkFacing`
   （十套模型逐个从世界矩阵验收整条链）。

6. **出图「一片只建一次城」：按切片分批，片内连着拍完再换。**
   建一次城十几秒，八十多个点位挨个重开页面就是二十分钟纯等待。
   守着它的：`Script_SamplePoints.SampleRunPlan`；口径在 `docs/Data_SamplePoints.md`。

7. **浏览器测试用现成 TestKit，禁止现写一次性浏览器探针脚本。**
   无头 Chromium 的指针锁在 Windows 上是全系统 `ClipCursor`，会把真人的鼠标夹在屏幕左上角
   且退出**不解夹**；游戏侧 `navigator.webdriver` 下走假锁，测试别读 `pointerLockElement`。
   现成入口：`../PrairieFire1937/Script_BrowserTestKit.LaunchBrowser` + `Script_DevServer.ServeRoot`。

8. **grep / 全文搜索必须排除 `vendor/`。**
   `vendor/rapier/build/rapier.module.mjs` 是 2.86 MB 的**单行**文件，一条命中就把输出撑爆。
   守着它的：没有测试，只有你自己 —— `rg --glob '!vendor'` 或按文件类型过滤。

9. **worktree 里跑测试直接 `node` 调脚本，别信 `npm run` 的默认行为。**
   npm 以最近的 package.json 为项目根：没有时会向上爬到主仓库、测的是**另一棵树**，
   全绿也说明不了任何事。守着它的：`docs/Data_TestTiers.md` 第二节末段。

10. **材质两条铁律：albedo 标 `SRGBColorSpace`、normal/orm 必须 `NoColorSpace`；SSAO 只乘间接光。**
    反了就颜色发灰、法线方向错；SSAO 乘了直接光 = 太阳照到的墙角也发黑，那是脏不是遮蔽。
    守着它的：`Script_Materials.mjs` 头注；`docs/Data_TechRenderPipeline.md` 的「坑」一节。

11. **新增 `Script_*Test.mjs` 必须登记进 `Script_TestRunner.mjs` 的 `testDefs` 并归 tier/domain。**
    没登记的测试没人跑，等于没写；新模块还要补 `changedDomainRules` 的领域映射。
    守着它的：`Script_TestRunnerTest.mjs` 扫描目录阻止漏登。

12. **数值只在代码里，文档写常量名不抄数。**
    抄进文档的数字第二天就过期，还会被下一个 agent 当真。
    守着它的：没有测试；本文件带头遵守。

13. **外部枪械仅在选定源几何超过 `WEAPON_TRIANGLE_LIMIT` 时减面；战车同理读 `VEHICLE_TRIANGLE_LIMIT`。**
    展示件/备用状态/重复壳先排除，超过阈值才尽量贴线；若目标降幅 ≤5%，仍保留原始拓扑。
    指定特例读 `SPECIAL_TRIANGLE_TARGETS`；外部 GLB 的逐件原始/实际/目标登记读 `EXTERNAL_GLB_STANDARDS`。
    单件面数变化引起的全场预算同步进 `SCENE_RENDER_LIMITS`；守着它的：`Script_AssetStandardsTest` + 编辑器「资产规范」。

## 常用命令

### 开发服务

```powershell
node Taierzhuang1938/Script_DevServer.mjs        # 默认端口 8171，服务 worktree 根
```

**所有测试与出图脚本自带 `ServeRoot` 起临时服务，不需要预先开 DevServer。**

### 测试（分级细则、超时、历史红基线全在 `docs/Data_TestTiers.md`）

```powershell
node Taierzhuang1938/Script_TestRunner.mjs                          # quick：纯 Node 快速基座，编辑循环约几十秒
node Taierzhuang1938/Script_TestRunner.mjs --changed=origin/master --profile=quick --fail-fast    # 编辑循环
node Taierzhuang1938/Script_TestRunner.mjs --changed=origin/master --profile=prepush --fail-fast  # 推送前领域专项 + 风险门禁
node Taierzhuang1938/Script_TestRunner.mjs --changed=origin/master --profile=full                  # 集成/终验
node Taierzhuang1938/Script_TestRunner.mjs --domain-only=terrain    # 排障：只跑领域探针，绕过 Tier 0
node Taierzhuang1938/Script_TestRunner.mjs --only=DamageTest        # 单项
node Taierzhuang1938/Script_TestRunner.mjs --list                   # 完整分级表（另有 --domain= / --tier= / --dry-run）
```

- quick 的 11 项基座不启动浏览器；旧版完整 Tier 0 实测 12—17 分钟，只由 full、
  显式 `--tier=0` 或 prepush 的高风险文件触发。Tier 2 仍不自动执行，出图仍需人工看图。
- 浏览器测试先做 `playwright-core` 预检，并跨 worktree 共用全局测试槽，避免多 agent
  同时抢 GPU/内存；纯文档与源工程改动由 `--changed` 明确跳过。
- PlayTest 有历史红基线：`BASELINE` ≠ 全绿，新增断言名才算 `FAIL`；`--strict-baseline` 全算。

### 出图（视觉审查的唯一输入来源；全部落 `_shots/`，已 gitignore）

```powershell
node Taierzhuang1938/Script_SamplePointShot.mjs                 # 采样点基线；--compare= 与上一批逐张对位
node Taierzhuang1938/Script_ShotTest.mjs                        # 正片固定镜头（--probe / --only=名字）
node Taierzhuang1938/Script_CutsceneShot.mjs                    # 过场：播一场，指定秒数各落一张
node Taierzhuang1938/Script_DressingShot.mjs --phase=5 --x=...  # 布设自验：任意机位拍当前城
node Taierzhuang1938/Script_WeaponShot.mjs                      # 枪械台架四宫格（近距离穿模只有它拍得出）
node Taierzhuang1938/Script_TzmShot.mjs --id Type89Tank         # TZM 三视图；姿态图 Script_ActorPoseShot.mjs
```

### 性能与调试

```powershell
node Taierzhuang1938/Script_FrameProfileTest.mjs   # 整帧 CPU/GPU 剖析：逐项消融 GI/SSAO/阴影/MSAA
```

**实机常驻剖析器**：编辑器面板「渲染调试（可叠加）→ Profiler」弹独立窗口，玩法照跑
（CPU 逐系统 / GPU 逐 pass / 掉帧取证 / GC）。**没有页面内面板**（用户点名去掉的）。
内核 `Script_Profiler.mjs` + 面板 `Script_EditorProfiler.mjs`，回归口 `Script_ProfilerTest`；
调试页 `Probe.html` 把材质 / 光照 / 后处理单独摆出来看。

## 路由表：改哪个系统，动哪些文件，先读哪份分册

### 引导 / 主循环
- `Script_Main.mjs` —— 装配层：启动顺序、关卡流程、每帧调度、输入接线。
  **任何规则不许写在这里**——规则在 Script_Ai / Script_Player / Script_Story / Data_*。
- `Script_BootProp` / `BootPropStage` / `BootPropWorker` —— 加载画面的可转道具台
  （转动跑在 worker 里，建关卡不掉帧）。
- 先读：`docs/Data_TengxianIntegration.md`（模块契约与推定值索引）。

### 渲染管线 / GI / 灯光天空
- `Script_Post.mjs` —— 自研后处理：深度法线预通道 → SSAO → Bloom → 体积光 → tonemap →
  抗锯齿，**顺序错一条画面就「塑料」**；帧结构在文件头。
- `Script_FirstPersonSelfShadow.mjs` —— 第一人称手臂/武器专用 packed-depth + 3×3 PCF
  自阴影；与战场太阳阴影图隔离，禁止改成 Viewmodel 直接 `castShadow=true`。
- `Script_Gi.mjs`（半实时辐照度探针体 + `Data_GlobalShProbe.mjs`，回归口 `Script_GiTest.mjs`）、
  `Script_Light.mjs`（太阳 + 跟随式阴影框 + 火光池 + 枪口闪光）、
  `Script_Sky.mjs`（解析式天空 + PMREM）、`Script_Water.mjs`（Gerstner 护城河）。
- 先读：`docs/Data_TechRenderPipeline.md`（唯一现状文档；GI 在 §12，坑表在末尾）。

### 材质 / 贴图
- `Script_TexBake.mjs`（纯 JS PBR 烘焙，每种材质出 albedo / normal / orm）→
  `Script_Materials.mjs`（包成 three 纹理，SSAO 注入间接光）。
- `Script_Noise.mjs` —— 确定性噪声全家桶，**一切散布参数的随机源**（不许 Math.random）。
- 先读：`docs/Data_TechRenderPipeline.md` §11；城墙专用 PBR 见 `docs/Data_CityWallPbr.md`。

### 世界生成底座（台儿庄时期沉淀，滕县共用）
- `Script_World.mjs` —— 鲁南民居 / 寨墙 / 清真寺建造器 + `BuildSink` 合批槽；尺寸全按
  `docs/Data_HistoryMaterial.md` 的考据（**鲁南民居对外不开窗**是最重的形制铁律）。
- `Script_Geo.mjs`（UV 密度统一、破损形体、批合并）、`Script_CityBlockKit.mjs`
  （院落六原型 × 三档 LOD，治「大量重复村庄」）。
- `Script_RoadPath.mjs` + `Script_RoadSpline.mjs` —— 样条道路管线（**唯一铺路口径**）；
  `Script_WallPlan.mjs` + `Script_WallSpline.mjs` + `Script_YardWall.mjs` —— 样条围墙管线
  （**全项目布墙的唯一口径**，逐模块贴地 + InstancedMesh）。Plan/Path 层纯 Node 可测；
  布设参数集中在 `Script_WallSpline.WALL_PRESETS` 一张表 ——
  **调用点不许再自己写间隔/重叠/抖动**，那正是收拢前的病根。
- 先读：`docs/Data_HistoryMaterial.md`（尺寸出处）、`docs/Data_RoadSpline.md`、
  `docs/Data_WallSpline.md`（含没迁进样条的那几类墙的清单）。

### 地形 / 高度
- `Script_FarLand.mjs` —— 远景连续高度函数；网格、数据、道具落地**三边必须问同一个函数**
  （前身是「手抄高度表悄悄过期、道具整片浮空」）。
- `Script_JieheHeight.mjs`（界河地面采样器，纯算术）、`Script_HeightmapCli.mjs`
  （SRTM 高程下载 / 采样 / 布设贴地 CLI，数据在 `Heightmap/`）。
- 先读：`docs/Data_TaierzhuangHeightmap.md`（运行时契约）。

### 滕县城 / 关卡
- `Script_TengxianCity.mjs` —— 整座城的生成器；数字全来自 `Data_Tengxian.mjs`（逐条带出处
  与「推定」标注），**任何尺寸不许在生成器里另起炉灶**。
- `Script_TengxianOutfield.mjs`（城外鲁南平原）＋ `Script_TengxianField.mjs`
  （把「城」翻译成规则层认得的「战场」）；`Script_JieheField.mjs` 是界河**独立场景**，
  不是城的切片（入口 `?jiehe=1`）。
- **章节数据一章一个文件**：`Data_MissionCh0…6.mjs` 各导出 `CHAPTER`（史料字段 + zones +
  beats + `tuning`）与 `VOICE_LINES`，过场在 `Data_CutsceneCh*.mjs`。
  `Data_TengxianScript.mjs` 与 `Data_Battle.mjs` 只是**组装层**，自己不再写关表；
  分层校验（打法字段不许摊在 CHAPTER 顶层、zones 数 == objectives 数、zone id 全局唯一、
  路标必须落在本章切片内）在 Data_TengxianScript 的组装处执行。
- **没有哪一章会生成整座城了**（重制取消了「城墙关」）：要全城就走 `?phase=overview`
  （`Data_Menu.OVERVIEW_PHASE`，bounds = `Data_Battle.OVERVIEW_BOUNDS`，天光钉死 smokyDay）。
  它**不进 PHASES、不进选章**，只服务出图与自检 —— 采样点表八成的机位、Script_ShotTest
  的 Z 系列、Script_TownDressingDump 都从这条入口进。
- 先读：`docs/Data_MissionRemake.md`（**本轮任务流程的唯一口径**，§10 是工程契约）、
  `docs/Data_TengxianCity.md`（考据）。

### 地标（14 个，并行工作包纪律）
- `Script_LandmarkRegistry.mjs` —— kind → Build 函数注册表；并行制作期**冻结**，
  新增 kind 由主会话统一加。`Script_Landmark_*.mjs` **一个工作包只改一个文件**。
- 先读：注册表头注 + `docs/Data_TengxianCity.md` 对应地标小节（史实纪律逐条带可信度）。

### 布设 / 流送 / 外部资产
- `Script_TownDressing.mjs` —— 城内「每家每户」布设注册表（世界坐标登记一次、按 bounds 过滤，
  同一只米袋三关不搬家）+ 10 份 `Data_Dressing_*.mjs` 分区工作包。
- `Data_PropPcg.mjs` + `Script_PropPcg.mjs` —— 生活用具 / 工事支援的确定性规则布设；纯生成器
  不 import three，按院落 / 防区生成完整语义组合，并用 Catmull-Rom 样条铺沙袋/铁丝障碍线，
  统一做 AABB、坡度、间距、已手摆构件裁决。
  自动小物默认 `solid:false`，只进视觉实例，禁止随机桶凳改写 AI 导航、射界或玩家移动；
  未来逐资产 opt-in 碰撞时必须补交火 / 导航回归。
  编辑入口 `Script_EditorPropPcg.mjs`；回归口 `Script_PropPcgTest.mjs` / `Script_PropPcgEditorTest.mjs`。
- `Script_PropStreaming.mjs` —— 视觉流送；**碰撞不流送**（随玩家位置加卸载会打出两样仗）。
- `Script_PropBatch.mjs` —— 布设 GPU instancing 桶管理器（取舍与实测数字在文件头）；
  回归口 `Script_PropInstancingTest.mjs`。
- `Script_ExternalProps.mjs`（下载来的 .glb 布景，有碰撞）＋ `Script_LivedInProps.mjs`
  （程序化生活道具，全走 BuildSink）＋ `Script_TrimProps.mjs`（≤400 三角的 tzm 饰件层，
  物理契约不同所以独立一层）；目录 `Data_ExternalAssets_*.mjs`，来源见 `docs/Data_ExternalPropSources.md`。

### 模型管线（TZM 与 GLB）
- `_blender/` —— 程序化 Blender 管线出 `Model/*.tzm.json`；`Verify.mjs` 与
  `Data_Meshes.mjs` 逐字段互核。加载器 `Script_MeshLoad.mjs`（为什么不用 glTF 见头注）。
- `Script_RiggedModel.mjs` —— 第一人称 GLB 蒙皮桥接：国军 01 派生的制服双臂保留
  完整十指与源动作，肩—肘—腕解析 IK 跟随各枪左右握持坐标系；失败自动降级回
  程序化几何，不堵开机、不改战斗时序。资产契约与画面握把残差分别由
  `Script_RiggedModelTest.mjs` / `Script_FpsArmTest.mjs` 守。
- 十名蒙皮士兵（`Model/Character/`）由 `_import/Script_BakeLugouCharacters.{ps1,py}`
  从 3ds Max 桥烘出。**动它之前先读那份 py 的模块头注**：2026-08-29 有一次重烘把根骨
  位移轨道烘丢了，十六条 clip 的人全钉在站立高度，而当时唯一的贴地审计对此完全看不见
  （悬空的人不会陷进地里）。姿态闸现在是「逐 clip 量骨盆高度」，且
  `Script_CharacterModelTest` 直接解析 GLB 现量（`_import/Script_LugouGlbPose.mjs`），
  不看烘焙自报的清单数。那次的离线修复留在 `_import/Script_RestoreLugouPelvisTracks.mjs`。
- 先读：`_blender/Verify.mjs` 头注；改模型只重建那一件，别跑全量 BuildAll。
- **视频转骨骼**（AI 视频 → RTMW3D → Biped clip）：`_import/Script_MocapVideoExtract.py`
  → `_import/Script_MocapRetargetClips.mjs` → 十套 GLB；联系图 `Script_MocapClipShot.mjs`。
  素材要求、坐标口径、偏航硬夹与遮挡回退的账全在 `docs/Data_MocapPipeline.md`，
  改流水线前先读它。首批三条 clip：CarryStretcherFront/Rear、WoundedLimp。

### 人物 / AI / 合批
- `Script_Actor.mjs` —— 程序化人物（不用 SkinnedMesh：预通道 overrideMaterial 不带 skinning，
  蒙皮会在 SSAO 里塌成原点，见头注）；`Script_ActorBatch.mjs` 收成 InstancedMesh，
  `Script_ActorCrowd.mjs` 管远景人群。
- `Script_Ai.mjs`（士兵 AI 与战斗结算）、`Script_Navigation.mjs`（「哪儿站得住」位图 + 下坡场）。
- 先读：`docs/Data_TechPhysics.md`（角色 IK 部分）。

### 玩法测试靶场（?range=1，人机共同测试）
- `Data_Range.mjs` —— 靶场配置（工位/靶位/携行，纯数据）；`Script_RangeField.mjs` ——
  独立场景（战场接口的第三个实现）。装配层在 `?range=1` 时整表替换关卡表，正片不知道它存在。
- 木桩兵 = `soldier.dummy`（Script_Ai 跳过 Think）；取证口 `Debug.Range`（State/GoTo/AimAt/Reset）。
- 回归口 `Script_RangeTest.mjs`（combat 域）。先读：`docs/Data_TestRange.md`（弹道两条账必读）。

### 白刃 QTE 测试章（?melee=1，六式共用正片规则）
- `Data_MeleeQte.mjs`（六 pattern / 触发数值 / 工位）与 `Script_MeleeQte.mjs`（纯规则）是唯一判定源；
  AI 刺刀、F 处决、HUD、Actor 与 Viewmodel 只能接 `Begin* / View*`，不得另算一套成功条件。
- 专用章与正片共用正式 Soldier/Actor/伤害/死亡链；`Debug.MeleeQte` 只做摆位和取证。
- 回归口 `Script_MeleeQteTest.mjs`（combat 域）。先读：`docs/Data_MeleeQte.md`。

### 第一关策划白盒（?whitebox=1，独立测试章节）
- `Data_FirstLevelWhitebox.mjs` 是唯一 phase / 体块布局数据，`Script_FirstLevelWhiteboxField.mjs`
  是独立场景实现；它们不进 `PHASES`，也不借 `TengxianOutfield`、PCG、贴图或外部模型。
- 可见环境只能是程序化 `BoxGeometry` + 纯白无贴图 `MeshStandardMaterial`，接受正片太阳与阴影。
  边界必须用可见实体白墙表达，不得恢复空气墙、世界说明卡或未来剧情标注。
- 场景 id 是 `FirstLevelWhitebox`，内容 id 通过 `Script_FirstLevelWhiteboxFlow.mjs` 复用正式
  `CH1_NanLu`；具名同伴、对白、后送队、担架、空袭与事件摆点必须跑正式第一章链路。
- 护送门与折返门由正式剧情信号改变网格和 Rapier 碰撞，目标由事实门推进，不能退回
  “走进目标圈就算完成”。回归口：`Script_FirstLevelWhiteboxTest.mjs` 与
  `Script_FirstLevelWhiteboxBrowserTest.mjs`。

### 第一关 P0/P1/P2 场景白盒（?whitebox=p012，额外独立版本）

- `Data_FirstLevelP012Layout.mjs` 管 P2 坐标、体块、颜色语义和通行路线；
  `Data_FirstLevelP012Whitebox.mjs` 管独立 phase、现有角色/对白适配和节奏参数。
- 与旧 `?whitebox=1`、正式第一关并存，不覆盖它们。这个版本按用户要求使用
  灰地面、黄跨步、橙翻越、紫攀爬、蓝掩体、黑边界、红危险、绿任务路、青担架路。
  环境仍是程序化无贴图体块，人物及已烘焙声音复用现有配置。
- `Script_FirstLevelP012Flow.mjs` 是纯任务事实编排；`Script_FirstLevelP012Runtime.mjs`
  适配真实演员、人流、防守、炮击与扑沟输入。不能以目标时刻或虚拟队头替代真实完成。
- `Script_FirstLevelP012CastAppearance.mjs` 只在本白盒给具名同伴的衣服使用私有纯色材质；
  不修改人物源资产、肤色或武器，不把临时识别色带入正式关卡。ActorTest 验共享材质隔离。
- 几何、Flow、Runtime、Actor 均有同名 `Test`；`Script_FirstLevelP012BrowserTest.mjs`
  的 `--prelude --geometry` 验证实际开场和通行，`--campaign` 驱动整关真实移动/射击/交互。
  测试夹具的传送不计入通关时长；验收证据与设计来源见 `docs/Data_FirstLevelP012Acceptance.md`。

### 界河白盒（?jiehe=1，退出正片但资产完整的那片城北原野）
- 切片是 `Data_Menu.JIEHE_SANDBOX_PHASE`。**id 仍是 `L0_Jiehe`** —— `OUTFIELD_SCENES` /
  `PLACEMENTS` / `TRIM_PLACEMENTS` 三张表都按这个 levelId 分组，换 id 等于把布景摘光；
  bounds / spawn / 路标与重制前的 L0 关逐字相同，打法字段抽干（无日军、不结算、不换关）。
- 不进玩家可见的「测试场景」组，只保留 `?jiehe=1` 内部直达入口；进出与靶场同一条路：
  **改 query 再重载**。
  回归口 `Script_JieheTerrainTest.mjs`（terrain 域）。

### 武器 / 战斗 / 刺刀
- `Script_Player.mjs`（移动/碰撞/姿态/**自由瞄准** —— 枪口在视野里滑动、不钉屏幕中心）、
  `Script_Viewmodel.mjs`（第一人称手与枪，几乎每个数字都是手感数字）、
  `Script_Combat.mjs`（投掷物/白刃/日军间接火力/胜负判定）、
  `Script_Identify.mjs`（准心指着谁，纯几何不 import three）。
- `Data_Weapons.mjs` —— 武器数据；中方装备必须参差（杂牌军一个班至少三种枪）。
- 先读：`docs/Data_GunFeelReview.md`（常设审查表，自由瞄准口径在末节）、`Data_Bayonet.md`、
  `Data_PlayerDamage.md`（挨打链，**别动 aiAccuracyBase**）、`Data_BattlefieldNumbers.md`。

### 物理
- `Script_Physics.mjs` —— Rapier3D 封装（为什么换掉自写碰撞见头注：斜墙的 AABB 把 20 m
  斜墙登记成 14×14 实心方块）。回归口 `Script_PhysicsTest.mjs`；先读 `docs/Data_TechPhysics.md`。

### 通行 / 跳跃 / 翻越 / 攀爬
- `Data_Traversal.mjs` —— **通行高度阶梯**（膝高跨过 / 腰高翻越 / 肩高攀爬 / 再高不可通过）。
  玩家、AI、autostep、导航图四处**共读这一张表**；跳跃的净抬高压在 `vaultMin` 之下，
  所以跳不上任何该翻越的东西。取证口 `Debug.Traversal()` / `Debug.Vault()`。
- 回归口 `Script_JumpTest.mjs`（14 条，判据现取 `Debug.Traversal()`，断言里不抄数）。
- 先读：`docs/Data_Traversal.md`。

### 破坏
- `Script_Destruction.mjs` —— 统一场景破坏：离线预破碎 + 运行时代理，**一次爆炸只重建一次拓扑**。
  模板由 `Script_FractureBake.mjs` 固定种子离线生成，产物在 `Data_FracturePatterns.mjs`，
  运行时只读。先读：`docs/Data_Destruction.md`。

### 音频
- `Script_Audio.mjs` —— 合成配方打底 + 实录采样逐条盖同名配方，盖不上就回落合成。
- 来源表 `Data_SfxSources` / `Data_AmbSources` / `Data_MusicSources` / `Data_Voice`
  （川军口令是**四川话**）；烘焙 `Script_{Sfx,Amb,Music,Voice,SeedAudio*}Bake`，
  响度对齐 `Script_AudioNormalize`，产物在 `Audio/`。
- 先读：`docs/Data_AudioAssets.md`。

### 过场 / 剧情
- `Script_Cutscene.mjs` —— 实机演出；只有用户点名的几场夺控制权，战斗内演出不夺。
  分镜数据在 `Data_Cutscene*.mjs`，纯 Node 自检 `Script_CutsceneCheck.mjs`。
- `Script_Story.mjs` —— 把七章目标链 + 台词 + 分镜按章派发；史实注记卡 `Data_History.mjs`，
  编剧红线在 `Data_Script.mjs` 头注与 `docs/Data_HistoryQuotes.md`。先读 `docs/Data_CutsceneRedo.md`。

### HUD / 菜单 / 输入
- `Script_Hud.mjs` —— 纯 DOM/CSS，不进 three 渲染；层级参考战地，含阵亡卡片。
- `Script_Menu.mjs` + `Data_Menu.mjs` —— 主菜单（活战场打底 + 相机导演）；`Data_Menu` 还放着
  **两片不进 PHASES 的切片**：全城俯瞰 `OVERVIEW_PHASE` 与界河白盒 `JIEHE_SANDBOX_PHASE`。
- `Script_Input.mjs`（键位表 + 路由器）、`Script_Interact.mjs`（F 键分流）、
  `Script_Wheel.mjs`（指挥轮盘）、`Script_DebugOptions.mjs`（调试开关唯一真相）。
- 先读：`docs/Data_MainMenu.md`。

### 交互 / 负重（担架·搬运·救护交互点）
- `Script_Interact.mjs` —— 两层：**内建分支**（拾枪/分弹药）＋**可注册交互点框架**
  （`Register(spec)`，三种手势）；文件末尾十个**救护类预制**全是纯函数，摆点是章节的事。
- `Script_Carry.mjs` —— 负重状态机（`CARRY_KINDS` 一张表）。三条卸载路径：F 放下、左键扔下、
  脚本 `ForceRelease`；`canDrop:false` 是「拒绝松手」变体（第四章抬罗班长）。与玩家控制器的
  接口只有 `player.carrySpeedScale`；「能不能开枪」在装配层 `TryFire` 读 `carry.Blocking`。
- 回归口 `Script_CarryTest.mjs`（纯 Node）；取证口 `Debug.Carry` / `Debug.Interact`，
  HUD 侧是 `.hudInteractRing` 与 `.hudCarry`，武器 UI 禁用态挂在 `#hud.carrying`。

### 架设武器（可接管的固定机枪位）
- `Script_Emplacement.mjs` —— `EMPLACEMENT_KINDS` 一张表 ＋ 一台状态机（射界限位、热量、
  两种卡壳、弹板与补弹）。**纯规则，不 import three**；弹道借装配层的 `Fire(shot)` 走同一条
  `MarchBullet`，接管/补弹是 `Script_Interact` 的注册点。
  **脚本只能把枪弄坏，上/下枪位永远是玩家自己按的那一下。**
- NPC 射手与 `Script_Ai` 共用同一道闸：战位名就是 `soldier.emplacementId`，不另建占位表。
  键位 F 接管/离位、R 拉枪机、左键开火。
- 回归口 `Script_EmplacementTest.mjs`（纯 Node）；取证口 `Debug.Emplacement`，
  HUD 是 `.hudEmplacement`，武器 UI 禁用态挂在 `#hud.emplaced`。

### 日机扫射（第一关的核心演出）
- `Script_AircraftStrafe.mjs` —— 一条通场的状态机，四个节拍出 `OnPhase` 与 `story.Signal`。
  **纯规则，不 import three**；三条预设 `STRAFE_PRESETS`。
  牺牲**全靠白名单点名**（`victims` 必死、`immune` 必不死），**一次随机都不掷**
  （§0 保留的三项创作性还原第 1 条）。玩家那一下是一扇可配置的窗。
- `Script_Aircraft.mjs` —— 远方机群（**没动**）＋ 扫射的渲染那一半；
  `MakeAircraftStrafeHost` 是宿主适配器（曳光/弹着/音效定位/玩家挨这一下）。
- 回归口 `Script_AircraftStrafeTest.mjs`（纯 Node）；取证口 `Debug.Strafe`。
  摆点示例（CH1 三条航线坐标）与音效备胎在 `Script_AircraftStrafe.mjs` 头注。

### 照明弹（第四关的招牌机制）
- `Script_Flare.mjs` —— 五相位时间线（升空 / 顶空点燃 / 伞降燃烧 / 熄灭 / **暗适应**）。
  **纯规则，不 import three**；两条预设 `FLARE_PRESETS`，两枚都是剧情节拍。
- **暴露机制是它的另一半产物**：燃烧期把 `Script_Ai.SIGHT_BY_STANCE` 三档**同乘**一个倍率
  （敌我一起暴露）。乘法保住了「姿态决定被发现的距离」；写入口只有 `AiDirector.SetSightScale`，
  **换关 / Abort 必须还原成 1**。画面借现有池子（火光池 + 烟源），draw call 红线不动。
- 回归口 `Script_FlareTest.mjs`（纯 Node）；取证口 `Debug.Flare`（带 `ai.SightState()` ——
  光强对了不算数，要三档真的一起抬起来）。摆点示例与音效备胎在文件头注。

### 发报（终章亲手发出最后一封电报）
- `Script_Telegraph.mjs` —— 码组状态机（按一下发一组、一组四位），断线是**脚本推的**
  （`ForceDisconnect` / `breakAfterGroup`，夹进 `[1, total−1]`），重连走 hold 手势。**纯规则**。
- **不夺控制权**：玩家可以中途走开去打仗，进度原样保留，没有任何超时会失败。两个交互点预制
  由本文件出，`interact.Register` 摆点 —— 交互框架不反向依赖玩法系统。
  「发毕。」是章节台词，**本层一个字都不说**，只回 `OnComplete`。
- 回归口 `Script_TelegraphTest.mjs`（纯 Node）；取证口 `Debug.Telegraph`，
  HUD 是报码纸 `.hudTelegraph`（**不压暗武器 UI** —— 发报不占手）。

### 任务流程引擎钩子（集成批 INT1：七章内容与新系统之间的引擎侧原语）
- **关中过场**：beats 的 `{ type:"cutscene", id }`、`story.Signal(名字)`
  （`Script_Story.SIGNAL_CUTSCENES`）、`Taierzhuang.PlayMidCutscene(id)` 三条路
  **共用同一个 RunCutscene**，所以 Esc 跳过与补卡语义与关首过场一致。
- **LEVEL_CUES 自动构建**：`Script_Story.BuildLevelCues(CHAPTER_EVENTS)` 照各章
  `export const EVENTS` 建判定表，判据走**受限文法解析、不 eval**。
- `Script_Companion.mjs` —— 具名同伴。**从 nra 名额里出人**（`MAX_COMPANIONS = 6`），
  所以开机红线不受影响；`SetAbsent` 跨关保留（罗班长四关牺牲、五关起缺席）。
- `Script_Checkpoint.mjs` —— 脚本检查点。**不扣兵员池、不弹死亡卡**，
  必须在把伤害提交给死亡链路**之前**调 —— 打完再调，卡已经弹了。
- **钉关** `CHAPTER.mechanics.pinFinalZone`：等 `story.Signal("ChapterRelease")` 放行，
  保险丝是配置时长 + 240 s。
- 回归口 `Script_MissionHooksTest.mjs`（纯 Node）＋ `Script_CutsceneControlTest.mjs`
  的过场引擎三条；取证口 `Debug.Companions` / `Debug.Checkpoint` / `Debug.ChapterPin` /
  `Debug.MidCutscenes`。字段口径与过场引擎三件小补见 `docs/Data_MissionRemake.md` §10.6。

### 进过场要先预热着色器（别把它当加载资源）
- 布景是当场建的，几十个新 program 全在**第一帧**同步编出来 —— 那就是「点序章后冻十几秒」。
  `Script_Main.WarmupShaders` 把它分四段摊到加载画面背后（提交编译 / 重编场景光照 /
  出画落实 / 载入网格），期间 `state.warming` 禁出画、`CutsceneDirector` 的 `hold` 按住时间轴。
- **改这条链前先读 `docs/Data_TechRenderPipeline.md` §16**（含两条会让预热白做的坑：
  藏东西要用 `layers` 不能用 `visible`、放出来的那一批必须 `frustumCulled = false`）。
- 回归口：`Script_MenuTest.mjs`「开始」那三条（预热期间有加载画面与进度条、放行后时间轴真的走、
  开演时 `t < 1.5 s`）。

### 章节摆点（集成批 INT2：七章内容 × 九个玩法系统的唯一接缝）
- `Script_MissionSetpieces.mjs` —— **纯规则，不 import three**。`SETPIECES` 一张按 levelId
  索引的表，**一章一条**，四种钩子 `Setup` / `onZone` / `onVoice` / `Update`；装配层里因此
  **一行 `if (章 id)` 都没有**。`s` 是判空过的门面，章节数据不写 `if (s.carry)`。
- 三条纪律：**不夺移动权**、**不重复实现玩法**（只负责摆）、与叙事层的接缝只有 `story.Signal(name)`。
- **`event:` 的判据一律「事实 ‖ 时刻」两条都写** —— 只写事实的在「玩家不动」的回归里
  一条都不成立，各空等 80 s（只挂 `zone:` 是 95 s）。
- 回归口 `Script_MissionSetpiecesTest.mjs`（纯 Node）；取证口 `Debug.Setpieces` /
  `Debug.SetpieceFacts` / `Debug.SetpieceProps` / `Debug.Firewalls`。
  口径与施工单见 `docs/Data_MissionRemake.md` §10.7。

### 编辑器（20 个模块，不对玩家开放）
- `Script_Editor.mjs` —— 外壳与调度；**一次只开一个**（要接管相机的同开必抖）。
- `Script_Editor{Scene,FullScene,Actor,Weapon,FirstPerson,Audio,Timeline,Vfx,Destruction,PropLibrary,PropPcg,SamplePoints,Terrain,Splines,Settings,Stage,Ui,DebugRendering,Profiler}.mjs`
  （另含 AssetStandards = 资产规范只读总表；Splines = 场景样条PCG：道路 + 围墙的中心线编辑 + 拼接资产台与 WALL_PRESETS 滑杆）。
  PropPcg = 生活用具 / 工事支援的规则 volume、真实模型预览与正片 GPU 实例桶取证；
  FullScene = 完整县城与四门外 / 出川军列车厢静态布景的只读巡场、种子、Spline 与环境取证；
  FirstPerson = 正片 Viewmodel 的装备切换、玩家/外部检查视角、武器挂点/IK 目标/真实掌心与骨骼残差可视化，只读不写姿态表；
  车厢不播放 CS_Chuchuan 时间轴、不加载演员/对白/字幕，不读写 Scene 的关卡文档。
  DebugRendering 与 Profiler 是「可叠加」组：不接管相机、不暂停玩法。
  出图模式（`?shot=1`）下整棵编辑器 DOM 是 display:none，进不了截图。
- 先读：`docs/Data_EditorSuite.md`。

### VFX
- `Script_Vfx.mjs` —— 粒子与特效（弹孔/砖粉/烟/碎砖弹跳）；三条架构约束在头注。
  先读：`docs/Data_TechRenderPipeline.md`。

### 测试 / 出图
- `Script_TestRunner.mjs` 分级入口；`Script_BootTest.mjs` 七章开机 + 性能红线；
  `Script_PlayTest.mjs` 真浏览器端到端通关（130 条断言**从运行时状态取证**）；
  40+ 专项 `Script_*Test.mjs` 按领域挂在 Tier 1/2。
- 出图七支 + `Script_SamplePoints.mjs`（一片一建的出图计划）+ `Data_SamplePoints.mjs`
  （机位表，用采样点编辑器逐点调，出图脚本不自己算机位）。
- 先读：`docs/Data_TestTiers.md`、`Data_SamplePoints.md`、`Data_VisualReview.md`（评分表）。

### 资产目录
- `Model/`（tzm.json 与 glb）、`Texture/`、`Audio/`（烘出的 mp3 + 清单）、`Scene/`、
  `Heightmap/`、`BgmReview/`、`_import/`（外部资产取源/烘焙）、`_blender/`（Blender 管线）、
  `_shots/`（出图产物，gitignore）、`vendor/`（three + rapier，别 grep 进去）。

## docs/ 导读（39 篇：先分清「现状」与「留档」）

**现状口径（改对应系统前必读）**：
- `Data_TechRenderPipeline.md`（渲染管线唯一现状文档）、`Data_TechPhysics.md`、
  `Data_TestTiers.md`、`Data_Destruction.md`、`Data_EditorSuite.md`、`Data_AudioAssets.md`。
- `Data_MissionRemake.md` —— **本轮任务流程的唯一口径**；`Data_MissionDesign.md` —— 关卡层宪法
  （线性剧情关，优先级高于之前的 ER2 占点结构）；`Data_Traversal.md` —— 通行高度阶梯。
- `Data_Bayonet.md`、`Data_PlayerDamage.md`、`Data_GunFeelReview.md`（常设审查项，每轮都跑）、
  `Data_MainMenu.md`、`Data_SamplePoints.md`、`Data_VisualReview.md`。
- `Data_MocapPipeline.md`（视频转骨骼动画流水线：素材要求 / 提取 / 反解 / 接线点名单）。
- `Data_TengxianIntegration.md`（模块契约索引）、`Data_TengxianDesign.md`、`Data_CutsceneRedo.md`、
  `Data_CityWallPbr.md`、`Data_ExternalPropSources.md`、`Data_TaierzhuangHeightmap.md`、
  `Data_TestRange.md`（?range=1）、`Data_MeleeQte.md`（?melee=1）、`Data_RoadSpline.md`、
  `Data_WallSpline.md`（样条道路/围墙 + 未迁移例外清单）。

**史实考据底本（三档可信度：信史 / 主流记载 / 流传待考；台词只建立在前两档上）**：
- `Data_HistoryMaterial.md`（装备/军服/建筑，建模级参数）、`Data_HistoryQuotes.md`（语录校勘）、
  `Data_HistoryTimeline.md` 与 `Data_TengxianTimeline.md`（逐日与指挥链）、
  `Data_TengxianCity.md`（滕县城考据，地标史实全在这）、
  `Data_BattlefieldNumbers.md`（BF1/BFV datamine，是参考值不是口径）。

**历史提案与留档（别按现状读）**：
- 六篇 `Data_EasyRed2*.md`（约 380 KB，对标调研与提案，「现状」判断早已过期）、
  `Data_DesignFirstPass.md`（首轮设计书，**性能预算作废**，以开机红线为准）、
  `Data_GunFeelRound1.md`、`Data_StoryFlow.md`（台儿庄旧版剧情流程）。
- `Data_TechRepoLessons.md` —— 开工前的代码考古报告；它的「坑」清单（缓存戳 / 色彩空间 /
  指针锁 / WebAudio / worktree）至今全部有效，新 agent 值得通读一遍。

## 维护约定

- **新系统落地时更新本文件的路由表**；新 docs 分册写进导读并标明是现状还是留档。
- 新规矩三行以内：【规矩】一句 / 【为什么】一句 / 【守着它的】测试名或判据。
  超过三行就去 `docs/` 分册，这里只留路由。
- 事故过程、日期、用户原话、实测数字写进对应分册；本文件只留结论与判据。
- 本文件超过 400 行就该瘦身，不是加小节。
