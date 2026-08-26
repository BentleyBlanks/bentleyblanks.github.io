# Taierzhuang1938 项目入口（agent 必读）

《滕县 一九三八》—— 1938 年 3 月滕县保卫战的浏览器 FPS 白盒。川军第 122 师守城四日，
七关线性关卡；玩法对标 Easy Red 2，枪感对标战地系列。Three.js 0.185 + Rapier3D，
全部 vendor 收在仓库内，零 CDN；渲染管线零 addon（后处理链从 RenderTarget 手搭）。

目录名叫 Taierzhuang1938 是历史遗留：台儿庄那套「开放战场 + 占领点」已整体作废
（`Data_Battle.mjs` 头注），正片是滕县七关，**每关只建一片切片、换关拆掉重建**
（`Script_Main.mjs` 头注）。一批老文件头还写着《血战台儿庄》，别被名字骗。

规模：175 个 `Script_*.mjs` + 38 个 `Data_*.mjs` 平铺在根目录，约十万行；`docs/` 39 篇分册。
本文件只放**硬规矩 + 路由表 + docs 导读**；细则、判据、事故过程在 `docs/` 与各文件头注。
**这个仓库的文件头注释是第一手文档**：为什么存在、架构取舍、踩过的坑都在头注里，
先读头注再读函数体。

## 硬规矩（三行一条：规矩 / 为什么 / 守着它的）

1. **改任何浏览器模块，必须 bump `index.html` import map 里那一行 `?v=`；新增模块必须登记进 import map。**
   只盖入口不盖模块图 = 「新壳配旧芯」：入口拿到新版、它 import 的模块吃缓存旧版，
   手机 Safari 黏得多所以只在移动端复现。症状是「改了没生效 / 音频丢了」。
   守着它的：`index.html:18-23` 头注；源码里一律不许自己写 `?v=`（同一模块两个 URL = 加载两份实例）。

2. **`Data_*.mjs` 与规则层不许 import three。**
   出图脚本、导航烘焙、剧本自检全在纯 Node 里跑；沾上 three，命令行工具就得拖起整个渲染库。
   守着它的：各 Data 文件头注「纯数据，不许 import three」；`Script_TexBake` / `Script_FarLand` /
   `Script_Identify` / `Script_CutsceneCheck` 同律。

3. **新静态几何一律走 `BuildSink` 分区合批（`Script_World.mjs:27`），不许散着 add Mesh。**
   人物合批前实测过一次：15 万三角形占掉一帧 1408 个 draw call（全场的 84%）——
   瓶颈是 three 每次提交的 JS 固定开销，不是三角形。
   守着它的：BootTest 的 draw call 红线；`Script_LivedInProps` 头注「全部走 BuildSink 合批」。

4. **开机红线：drawCalls ≤ 5000、triangles ≤ 6,000,000，七关逐关量，越线即 FAIL。**
   这是整机预算的唯一口径；docs 里旧设计书写的预算数字一律作废。
   守着它的：`Script_BootTest.mjs:36-37`（`MAX_DRAW_CALLS` / `MAX_TRIANGLES`）。

5. **坐标与朝向契约：X 向东、Z 向南、Y 向上，单位米，原点 = 城中心十字街口。**
   人物正面与枪口方向一律**局部 -Z**（`Script_RiggedModel.mjs:570`）；导入的 FBX/GLB 源朝
   glTF +Z，由桥接层翻转（`:428`）——新导入资产先查朝向再摆。
   守着它的：`Data_Tengxian.mjs` 头注；过场数据里「Actor 正面是局部 -Z」是探针核实过的约定。

6. **出图「一关只建一次城」：按关卡分批，关内连着拍完再换关。**
   建一次城十几秒，八十多个点位挨个重开页面就是二十分钟纯等待。
   守着它的：`Script_SamplePoints.SampleRunPlan`；口径在 `docs/Data_SamplePoints.md`
   与 `Script_SamplePointShot.mjs:18`。

7. **浏览器测试用现成 TestKit，禁止现写一次性浏览器探针脚本。**
   无头 Chromium 的指针锁在 Windows 上是全系统 `ClipCursor`：会把开发机上真人的鼠标
   夹在屏幕左上角，且无头下退出指针锁**不解夹**。游戏侧 `navigator.webdriver` 下走假锁
   （`Script_Main.mjs:2044 FAKE_POINTER_LOCK`），测试别读 `pointerLockElement`。
   现成入口：`../PrairieFire1937/Script_BrowserTestKit.mjs` 的 `LaunchBrowser` +
   本目录 `Script_DevServer.ServeRoot`；缺能力就往现有测试/出图脚本里加，别另起炉灶。

8. **grep / 全文搜索必须排除 `vendor/`。**
   `vendor/rapier/build/rapier.module.mjs` 是 2.86 MB 的**单行**文件，一条命中就把输出撑爆。
   守着它的：没有测试，只有你自己 —— `rg --glob '!vendor'` 或按文件类型过滤。

9. **worktree 里跑测试直接 `node` 调脚本，别信 `npm run` 的默认行为。**
   npm 以最近的 package.json 为项目根：本 worktree 根有 package.json 时没事；没有时向上爬到
   主仓库、测的是**另一棵树**，全绿也说明不了任何事。
   守着它的：`docs/Data_TestTiers.md` 第二节末段；出过一整轮白跑的事故（TunnelLight 记录）。

10. **材质两条铁律：albedo 标 `SRGBColorSpace`、normal/orm 必须 `NoColorSpace`；SSAO 只乘间接光。**
    反了的话：颜色发灰、法线方向错、粗糙度偏亮；SSAO 乘了直接光 = 太阳照到的墙角也发黑，
    那是脏，不是遮蔽。
    守着它的：`Script_Materials.mjs` 头注；`docs/Data_TechRenderPipeline.md` 的「坑」一节。

11. **新增 `Script_*Test.mjs` 必须登记进 `Script_TestRunner.mjs` 的 `testDefs` 并归 tier/domain。**
    没登记的测试没人跑，等于没写；新模块还要补 `changedDomainRules` 的领域映射。
    守着它的：`Script_TestRunnerTest.mjs` 扫描目录阻止漏登。

12. **数值只在代码里，文档写常量名不抄数。**
    抄进文档的数字第二天就过期，还会被下一个 agent 当真。
    守着它的：没有测试；本文件带头遵守。

## 常用命令

### 开发服务

```powershell
node Taierzhuang1938/Script_DevServer.mjs        # 默认端口 8171
```

服务的是 worktree 根，路径与线上一致；显式 MIME 表（Windows 注册表把 .js 映成
text/plain，不写显式表模块加载直接炸）。
**所有测试与出图脚本自带 `ServeRoot` 起临时服务，不需要预先开 DevServer。**

### 测试（分级细则、超时、历史红基线全在 `docs/Data_TestTiers.md`）

```powershell
node Taierzhuang1938/Script_TestRunner.mjs                          # Tier 0：BootTest + PlayTest + 纯 Node 快测
node Taierzhuang1938/Script_TestRunner.mjs --changed=origin/master  # 推荐：按 Git 改动自动追加 Tier 1
node Taierzhuang1938/Script_TestRunner.mjs --changed=... --dry-run  # 先看会选中什么，不执行
node Taierzhuang1938/Script_TestRunner.mjs --domain=combat          # 显式领域（仍叠加 Tier 0）
node Taierzhuang1938/Script_TestRunner.mjs --domain-only=terrain    # 排障：只跑领域探针，绕过 Tier 0
node Taierzhuang1938/Script_TestRunner.mjs --only=DamageTest        # 单项
node Taierzhuang1938/Script_TestRunner.mjs --tier=1                 # 全部自动 Tier 1
node Taierzhuang1938/Script_TestRunner.mjs --list                   # 完整分级表
```

- Tier 0 全程实测 12—17 分钟（机器相关，别当保证值）。
- Tier 2（性能与出图）不被 `--changed` 自动触发，只给提示；出图测试进程成功
  只代表产物生成成功，仍需人工看图。
- PlayTest 有历史红基线：`BASELINE` ≠ 全绿，新增断言名才算 `FAIL`；
  `--strict-baseline` 把历史红也算失败。

### 出图（视觉审查的唯一输入来源；全部落 `_shots/`，已 gitignore）

```powershell
node Taierzhuang1938/Script_SamplePointShot.mjs                 # 采样点基线：固定机位逐点拍；--compare= 与上一批逐张对位
node Taierzhuang1938/Script_ShotTest.mjs                        # 正片固定镜头（--probe / --only=名字）
node Taierzhuang1938/Script_CutsceneShot.mjs                    # 过场：播一场，指定秒数各落一张
node Taierzhuang1938/Script_DressingShot.mjs --phase=5 --x=...  # 布设自验：任意机位拍当前城
node Taierzhuang1938/Script_WeaponShot.mjs                      # 枪械台架四宫格（近距离穿模/贴图密度问题只有它拍得出）
node Taierzhuang1938/Script_TzmShot.mjs --id Type89Tank         # 单个 TZM 模型三视图
node Taierzhuang1938/Script_ActorPoseShot.mjs                   # 人物姿态联系图
```

### 性能与调试

```powershell
node Taierzhuang1938/Script_FrameProfileTest.mjs   # 整帧 CPU/GPU 剖析：逐项消融 GI/SSAO/阴影/MSAA
```

**实机常驻剖析器**：编辑器面板「渲染调试（可叠加）→ Profiler」开关，弹独立窗口，
玩法照跑：CPU 逐系统 / GPU 逐 pass / 掉帧取证 / GC，可导出快照 JSON。
没有页面内面板（用户点名去掉的）。内核 `Script_Profiler.mjs`、面板
`Script_EditorProfiler.mjs`，账在 `docs/Data_EditorSuite.md` 对应小节；
回归口 `Script_ProfilerTest`（render 域）。

调试页 `Probe.html`（`Script_Probe.mjs`）：材质 / 光照 / 后处理单独摆出来看，
URL 参数选 preset / quality / scene / gi。

## 路由表：改哪个系统，动哪些文件，先读哪份分册

### 引导 / 主循环
- `Script_Main.mjs` —— 装配层：启动顺序、关卡流程、每帧调度、输入接线。
  **任何规则不许写在这里**——规则在 Script_Ai / Script_Player / Script_Story / Data_*。
- `Script_BootProp` / `BootPropStage` / `BootPropWorker` —— 加载画面的可转道具台
  （展示的就是游戏内那批 TZM 模型；转动跑在 worker 里，建关卡不掉帧）。
- 先读：`docs/Data_TengxianIntegration.md`（模块契约与推定值索引）。

### 渲染管线 / GI / 灯光天空
- `Script_Post.mjs` —— 自研后处理：深度法线预通道 → SSAO → Bloom → 体积光 →
  tonemap → 抗锯齿，顺序错一条画面就「塑料」；帧结构在文件头。
- `Script_Gi.mjs` —— 半实时辐照度探针体（DDGI 式）+ `Data_GlobalShProbe.mjs`；
  回归口 `Script_GiTest.mjs`。
- `Script_Light.mjs` —— 太阳 + 跟随式阴影框（框只开 62 米、移动吸附纹素网格）、
  SH Probe、火光池、枪口闪光。
- `Script_Sky.mjs` —— 解析式天空 + PMREM 环境贴图；`Script_Water.mjs` —— Gerstner 护城河。
- 先读：`docs/Data_TechRenderPipeline.md`（唯一现状文档；GI 在 §12，坑表在末尾）。

### 材质 / 贴图
- `Script_TexBake.mjs` —— 纯 JS PBR 烘焙，每种材质出 albedo / normal / orm 三张裸字节。
- `Script_Materials.mjs` —— 包成 three 纹理与 MeshStandardMaterial，SSAO 注入间接光。
- `Script_Noise.mjs` —— 确定性噪声全家桶（Mulberry32 / Fbm / Worley…），一切散布参数的随机源。
- 先读：`docs/Data_TechRenderPipeline.md` §11；城墙专用 PBR 见 `docs/Data_CityWallPbr.md`。

### 世界生成底座（台儿庄时期沉淀，滕县共用）
- `Script_World.mjs` —— 鲁南民居 / 寨墙 / 清真寺建造器 + `BuildSink` 合批槽；
  尺寸全按 `docs/Data_HistoryMaterial.md` 的考据（鲁南民居对外不开窗是最重的形制铁律）。
- `Script_Geo.mjs` —— UV 密度统一（全场砖缝一样大）、破损形体、批合并。
- `Script_CityBlockKit.mjs` —— 院落六原型 × 三档 LOD，治「大量重复村庄」。
- `Script_RoadPath.mjs` + `Script_RoadSpline.mjs` —— 样条道路管线（铁路/大车路/大街
  的唯一铺路口径）；`Script_WallPlan.mjs` + `Script_WallSpline.mjs` —— 样条围墙管线
  （寨墙/坝墙/石墙村/村院墙，逐模块贴地 + InstancedMesh）。Plan/Path 层纯 Node 可测。
- 先读：`docs/Data_HistoryMaterial.md`（尺寸出处）；道路口径 `docs/Data_RoadSpline.md`、
  围墙口径 `docs/Data_WallSpline.md`。

### 地形 / 高度
- `Script_FarLand.mjs` —— 远景连续高度函数；网格、数据、道具落地三边必须问同一个函数
  （前身是「手抄高度表悄悄过期、道具整片浮空」）。
- `Script_JieheHeight.mjs` —— 序关（界河）最终地面采样器，纯算术。
- `Script_HeightmapCli.mjs` —— 真实 SRTM 高程下载 / 采样 / 布设贴地 CLI；数据在 `Heightmap/`。
- 先读：`docs/Data_TaierzhuangHeightmap.md`（运行时契约）。

### 滕县城 / 关卡
- `Script_TengxianCity.mjs` —— 整座城的生成器；数字全来自 `Data_Tengxian.mjs`
  （逐条带出处与「推定」标注），**任何尺寸不许在生成器里另起炉灶**。
- `Script_TengxianOutfield.mjs` —— 城外鲁南平原（序关/一关的战场都在城圈外）。
- `Script_TengxianField.mjs` —— 把「城」包成规则层认得的「战场」（GroundHeight /
  Raycast / covers… 的翻译层）。
- `Script_JieheField.mjs` —— 序关独立场景，不是城的切片。
- `Data_Battle.mjs` —— 七关目标链与切片边界；`Data_Levels.mjs` 是台儿庄旧版布局（留档）。
- 先读：`docs/Data_TengxianCity.md`（考据）、`Data_TengxianDesign.md`（关卡与过场设计书）。

### 地标（14 个，并行工作包纪律）
- `Script_LandmarkRegistry.mjs` —— kind → Build 函数注册表；并行制作期**冻结**，
  新增 kind 由主会话统一加。构建器契约在它的头注。
- `Script_Landmark_*.mjs` —— 一个工作包只改一个文件：车站 / 清真寺（Garrison）/ 衙门 /
  教会学校 / 电灯公司 / 监狱 / 122 师部 / 商业街 / 城郊四向 / Temple / Misc。
- 先读：注册表头注 + `docs/Data_TengxianCity.md` 对应地标小节（史实纪律逐条带可信度）。

### 布设 / 流送 / 外部资产
- `Script_TownDressing.mjs` —— 城内「每家每户」布设注册表（世界坐标登记一次，
  按关卡 bounds 过滤；同一只米袋三关不搬家）+ 10 份 `Data_Dressing_*.mjs` 分区工作包。
- `Script_PropStreaming.mjs` —— 视觉流送；**碰撞不流送**（AI/破坏/命中读碰撞表，
  随玩家位置加卸载会打出两样仗）。
- `Script_PropBatch.mjs` —— 布设 GPU instancing 桶管理器（几何×材质分桶、静态矩阵、
  流送标脏重写实例表；取舍与实测数字在文件头）。回归口 `Script_PropInstancingTest.mjs`。
- `Script_ExternalProps.mjs` —— 下载来的 .glb 布景，已升级成真的场上物体（有碰撞）；
  运行时摆位走 PropBatch 实例化，编辑器仍走克隆老路。
- `Script_LivedInProps.mjs` —— 程序化生活道具（全走 BuildSink）；`Script_TrimProps.mjs` ——
  ≤400 三角的 tzm 饰件层（物理契约不同，独立一层）。
- `Data_ExternalAssets_*.mjs` —— 三份外部资产目录（村居农具 / 家什 / ChineseLife）。
- 先读：`docs/Data_ExternalPropSources.md`（来源与署名）。

### 模型管线（TZM 与 GLB）
- `_blender/` —— 程序化 Blender 管线：`BuildAll.py` 等出 `Model/*.tzm.json`，
  `Verify.mjs` 与 `Data_Meshes.mjs`（手写但可校验的清单）逐字段互核。
- `Script_MeshLoad.mjs` —— TZM 加载器（为什么不用 glTF 见头注）。
- `Script_RiggedModel.mjs` —— GLB 蒙皮桥接：把程序化动画重定向到导入骨架，
  失败自动降级回程序化几何，不堵开机、不改战斗时序。
- 先读：`_blender/Verify.mjs` 头注；改模型只重建那一件，别跑全量 BuildAll。

### 人物 / AI / 合批
- `Script_Actor.mjs` —— 程序化人物（不用 SkinnedMesh：预通道 overrideMaterial
  不带 skinning，蒙皮会在 SSAO 里塌成原点，见头注）。
- `Script_ActorBatch.mjs` —— 按「几何 × 材质」收成 InstancedMesh；
  `Script_ActorCrowd.mjs` —— 远景人群（「看得见的人」与「画得起的人」分层）。
- `Script_Ai.mjs` —— 士兵 AI 与战斗结算（同屏活人上限、掩体、压制、士气）。
- `Script_Navigation.mjs` —— 「哪儿站得住」位图 + 按目标算的下坡场。
- 先读：`docs/Data_TechPhysics.md`（角色 IK 部分）。

### 玩法测试靶场（?range=1，人机共同测试）
- `Data_Range.mjs` —— 靶场配置（工位/靶位/携行，纯数据）；`Script_RangeField.mjs` ——
  独立场景（战场接口的第三个实现）。装配层在 `?range=1` 时整表替换关卡表，正片不知道它存在。
- 木桩兵 = `soldier.dummy`（Script_Ai 跳过 Think）；取证口 `Debug.Range`（State/GoTo/AimAt/Reset）。
- 回归口 `Script_RangeTest.mjs`（combat 域）。先读：`docs/Data_TestRange.md`（弹道两条账必读）。

### 武器 / 战斗 / 刺刀
- `Script_Player.mjs` —— 移动、碰撞、姿态、**自由瞄准**（枪口在视野里滑动，
  不钉屏幕中心）、压制、伤口。
- `Script_Viewmodel.mjs` —— 第一人称手与枪；里面几乎每个数字都是手感数字。
- `Script_Combat.mjs` —— 投掷物、白刃、日军间接火力、胜负判定。
- `Script_Identify.mjs` —— 准心指着谁（HUD / 难度 / 取证三处共读，纯几何不 import three）。
- `Data_Weapons.mjs` —— 武器数据；中方装备必须参差（杂牌军一个班至少三种枪）。
- 先读：`docs/Data_GunFeelReview.md`（常设审查表，自由瞄准口径在末节）、
  `Data_Bayonet.md`（刺刀）、`Data_PlayerDamage.md`（挨打链，别动 aiAccuracyBase）、
  `Data_BattlefieldNumbers.md`（BF1/BFV datamine 参考值）。

### 物理
- `Script_Physics.mjs` —— Rapier3D 封装（vendor/rapier；为什么换掉自写碰撞见头注：
  斜墙的 AABB 包围盒把 20 m 斜墙登记成 14×14 实心方块）。
- 回归口 `Script_PhysicsTest.mjs`；先读 `docs/Data_TechPhysics.md`。

### 通行 / 跳跃 / 翻越 / 攀爬
- `Data_Traversal.mjs` —— **通行高度阶梯**（膝高自动跨过 / 腰高翻越 / 肩高攀爬 /
  再高一律不可通过）。玩家、AI、autostep、导航图四处**共读这一张表**，
  判据不许各写各的；跳跃的净抬高压在 `vaultMin` 之下，所以跳不上任何该翻越的东西。
- 消费者：`Script_Player.TryVault` / `Script_Ai.TryVault` / `PhysicsWorld.autostepMax` /
  `NavGrid.stepOver`；取证口 `Debug.Traversal()` 与 `Debug.Vault()`。
- 回归口 `Script_JumpTest.mjs`（14 条，判据现取 `Debug.Traversal()`，断言里不抄数）。
- 先读：`docs/Data_Traversal.md`。

### 破坏
- `Script_Destruction.mjs` —— 统一场景破坏：离线预破碎 + 运行时代理；
  一次爆炸只重建一次拓扑；主体照旧分区合批守 draw call。
- `Script_FractureBake.mjs` —— 离线模板生成器（固定种子），产物提交进
  `Data_FracturePatterns.mjs`，运行时只读。
- 先读：`docs/Data_Destruction.md`。

### 音频
- `Script_Audio.mjs` —— 合成打底（32 个 WebAudio 配方）+ 实录采样逐条盖同名配方，
  盖不上就回落合成。
- 来源表：`Data_SfxSources` / `Data_AmbSources` / `Data_MusicSources` / `Data_Voice`
  （川军口令是**四川话**，不是普通话）。
- 烘焙：`Script_SfxBake` / `AmbBake` / `MusicBake` / `VoiceBake` / `SeedAudio*Bake`；
  响度对齐 `Script_AudioNormalize`；产物在 `Audio/`。
- 先读：`docs/Data_AudioAssets.md`。

### 过场 / 剧情
- `Script_Cutscene.mjs` —— 实机演出；只有用户点名的五场夺控制权，战斗内演出不夺。
- 分镜数据：`Data_Cutscene{Chuchuan,BeimenBreakout,LastWire,LiZongrenTang,WangMingzhang}.mjs`；
  `Script_CutsceneCheck.mjs` 纯 Node 数据自检（Cutscene 从它 re-export 校验器）。
- `Script_Story.mjs` —— 把 `Data_TengxianScript.mjs`（七关目标链 + 台词 + 分镜）按关派发；
  史实注记卡 `Data_History.mjs`；编剧红线在 `Data_Script.mjs` 头注与 `docs/Data_HistoryQuotes.md`。
- 先读：`docs/Data_CutsceneRedo.md`（五场施工单 + Notion 定稿状态）、`Data_TengxianDesign.md`。

### HUD / 菜单 / 输入
- `Script_Hud.mjs` —— 纯 DOM/CSS，不进 three 渲染；层级参考战地，含阵亡卡片。
- `Script_Menu.mjs` + `Data_Menu.mjs` —— 主菜单：活战场打底 + 一台相机导演（机位表是纯数据）。
- `Script_Input.mjs` —— 键位数据表 + 路由器；`Script_Interact.mjs` —— F 键按上下文分流；
  `Script_Wheel.mjs` —— 指挥径向轮盘；`Script_DebugOptions.mjs` —— 调试开关唯一真相。
- 先读：`docs/Data_MainMenu.md`。

### 编辑器（15 个模块，不对玩家开放）
- `Script_Editor.mjs` —— 外壳与调度；**一次只开一个**（九个要接管相机，同开必抖）。
- `Script_Editor{Scene,Actor,Weapon,Audio,Timeline,Vfx,Destruction,PropLibrary,SamplePoints,Terrain,Splines,Settings,Stage,Ui,DebugRendering,Profiler}.mjs`
  （Splines = 场景样条PCG：道路 + 围墙的中心线编辑，原「道路样条」扩围后改名）。
  DebugRendering 与 Profiler 是「可叠加」组：不接管相机、不暂停玩法；
  Profiler（独立窗口的性能剖析，内核 `Script_Profiler.mjs`）还带 keepOnClose ——
  关设置面板回去打仗它照记。
  出图模式（`?shot=1`）下整棵编辑器 DOM 是 display:none，进不了截图。
- 先读：`docs/Data_EditorSuite.md`。

### VFX
- `Script_Vfx.mjs` —— 粒子与特效：弹孔、砖粉、烟、碎砖弹跳；三条架构约束在头注。
- 先读：`docs/Data_TechRenderPipeline.md`。

### 测试 / 出图
- `Script_TestRunner.mjs` —— 分级入口（见「常用命令」）；`Script_BootTest.mjs` 七关开机 +
  性能红线；`Script_PlayTest.mjs` 真浏览器端到端通关，130 条断言**从运行时状态取证**；
  40+ 专项 `Script_*Test.mjs` 按领域挂在 Tier 1/2。
- 出图七支（见「常用命令」）+ `Script_SamplePoints.mjs`（一关一建的出图计划）+
  `Data_SamplePoints.mjs`（机位表，用采样点编辑器逐点调，出图脚本不自己算机位）。
- 先读：`docs/Data_TestTiers.md`、`Data_SamplePoints.md`、`Data_VisualReview.md`（评分表）。

### 资产目录
- `Model/`（tzm.json 与 glb）、`Texture/`、`Audio/`（烘出的 mp3 + 清单）、`Scene/`、
  `Heightmap/`、`BgmReview/`、`_import/`（外部资产取源/烘焙）、`_blender/`（Blender 管线）、
  `_shots/`（出图产物，gitignore）、`vendor/`（three + rapier，别 grep 进去）。

## docs/ 导读（39 篇：先分清「现状」与「留档」）

**现状口径（改对应系统前必读）**：
- `Data_TechRenderPipeline.md`（81 KB，渲染管线唯一现状文档）、`Data_TechPhysics.md`、
  `Data_TestTiers.md`、`Data_Destruction.md`、`Data_EditorSuite.md`、`Data_AudioAssets.md`。
- `Data_MissionDesign.md` —— **关卡层宪法**：线性剧情关，优先级高于之前的 ER2 占点结构。
- `Data_Traversal.md` —— **通行高度阶梯**（多高的东西过得去；跳跃/翻越/攀爬的规范）。
- `Data_Bayonet.md`、`Data_PlayerDamage.md`、`Data_GunFeelReview.md`（常设审查项，每轮都跑）、
  `Data_MainMenu.md`、`Data_SamplePoints.md`、`Data_VisualReview.md`。
- `Data_TengxianIntegration.md`（模块契约索引）、`Data_TengxianDesign.md`（关卡与过场设计书）、
  `Data_CutsceneRedo.md`（五场过场施工单）、`Data_CityWallPbr.md`、
  `Data_ExternalPropSources.md`、`Data_TaierzhuangHeightmap.md`、
  `Data_TestRange.md`（?range=1 玩法测试靶场与 Debug.Range 取证口）、
  `Data_RoadSpline.md`（样条道路）、`Data_WallSpline.md`（样条围墙 + 未迁移例外清单）。

**史实考据底本（三档可信度：信史 / 主流记载 / 流传待考；台词只建立在前两档上）**：
- `Data_HistoryMaterial.md`（装备/军服/建筑，建模级参数）、`Data_HistoryQuotes.md`（语录校勘）、
  `Data_HistoryTimeline.md`（台儿庄逐日）、`Data_TengxianTimeline.md`（滕县逐日与指挥链）、
  `Data_TengxianCity.md`（滕县城考据，地标史实全在这）、
  `Data_BattlefieldNumbers.md`（BF1/BFV 枪械 datamine，是参考值不是口径）。

**历史提案与留档（别按现状读）**：
- 六篇 `Data_EasyRed2*.md`（Benchmark / Controls / Parity / Plan / Systems / Visual，
  共约 380 KB）—— 对标 Easy Red 2 的调研与改造提案；其中的「现状」判断早已过期。
- `Data_DesignFirstPass.md` —— 首轮设计书，头注自标「留档」；**其性能预算作废，
  以 5000 / 600 万开机红线为准**。
- `Data_GunFeelRound1.md` —— 第 1 轮打分存档（常设表在 GunFeelReview）。
- `Data_StoryFlow.md` —— 台儿庄旧版六关剧情流程（滕县剧本在 `Data_TengxianScript.mjs`）。
- `Data_TechRepoLessons.md` —— 开工前的代码考古报告；它的「坑」清单（缓存戳 / 色彩空间 /
  指针锁 / WebAudio / worktree）至今全部有效，新 agent 值得通读一遍。

## 维护约定

- **新系统落地时更新本文件的路由表**；新 docs 分册写进导读并标明是现状还是留档。
- 新规矩三行以内：【规矩】一句 / 【为什么】一句 / 【守着它的】测试名或判据。
  超过三行就去 `docs/` 分册，这里只留路由。
- 事故过程、日期、用户原话、实测数字写进对应分册；本文件只留结论与判据。
- 本文件超过 400 行就该瘦身，不是加小节。
