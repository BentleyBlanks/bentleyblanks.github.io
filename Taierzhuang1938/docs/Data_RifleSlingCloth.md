# 步枪麻绳背带

2026-11-05 用户修订：旧扁带建模生硬、回弹太强，改成麻绳；两端须接实际背带环，不能接进木护板。2026-11-04 的布料实现及验收记录保留在 Git 历史。

## 资产与复建

- `Model/HempRifleSlingV2/Model_RifleSlingHempV2.glb`：7 mm 三股实体绳，32 骨，源静止长 1.6 m。主绳 18,432 三角；闭合穿环绳扣、收束线及中正式两款捆扎圈一起共 24,576 三角。
- 内置 imagegen **一级**生成自然纵向麻纤维；源图的 1024px WebP 和提示词在 `_import/Reference/HempRifleSlingV2/`。BlenderMCP 制作绳股、绳环和收束线，在物理尺度下烘焙细纤维法线。Base / OpenGL Normal 内嵌，粗糙度 0.94、非金属。
- 重建入口 `_blender/Script_HempRifleSlingBakeV2.py`，经 `scripts/Script_BlenderMcp.mjs` 执行；任务名 `HempRifleSlingV2`。脚本从自身位置或场景 `TaskRepoRoot` 找仓库，可通过 `REPO_ROOT`、`PROJECT_ROOT` 覆盖。合同 `Data_RifleSlingHempV2.json` 记录哈希、几何与制作边界。
- 完整 PNG、预览和工程在 `C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/HempRifleSlingV2_20261105/`；不向仓库放 blend、截图、验收网页或视频。制作结束关闭自身 Blender，并检查无自身实例残留。
- 麻绳材质、捻法与绑法是用户指定创作，不证明 1938 年国军或日军统一使用这类背带。Notion 对照表与游戏资料馆同轮标注。

## 实际挂点

`Data_RifleSlingMounts.mjs` 使用原模型米制 Y-up / 枪口 −Z 坐标，通过实际 `weaponGroup.matrixWorld` 转换，包含背架旋转、演员缩放补偿与白盒推枪终值。旧扁带只提供过肩绕腋路径及显隐。

| 枪 | 前端 | 后端 | 依据 |
| --- | --- | --- | --- |
| 汉阳造173R | `[0, .0068, -.581932]` | `[0, -.036744, .043710]` | 原 GLB 的 RearBand_ExternalAttachmentLoop、RearStock_ExternalAttachmentLoop 环孔中心 |
| 三八式 | `[.000420, -.003034, -.652613]` | `[.000420, -.080926, .069831]` | 原 TZM 的两个 U 形环；它们合在 wood 材质中，不能只查 steel |
| 中正式 | `[0, .011096, -.765401]` | `[0, -.078736, .13]` | 源模型没有背带环，绕实测前护箍及枪托做两圈捆扎，属于创作附件 |

汉阳造两环孔的最近几何净半径约 3.86 / 3.80 mm，容得下 7 mm 绳。原枪不改动。闭合绳环围绕枪环下横杆，主绳接在环孔下方 11.6 mm 的绳扣收束处；收束线沿绳端切线摆放。中正式直接接捆扎圈下缘。

`Script_RifleSlingGunContacts.mjs` 从实际背枪几何缓存纵向截面，只约束两端附近的绳段，避免绳身从木托另一侧穿过去才到达枪环。约束遇到枪身侧边时沿侧面绕开，不用一个向下平面把绳段强拉长。Node 另用原木托的 52,096 个实际三角面独立验证零穿越。

## 模拟与绘制

`Script_RifleSlingCloth.mjs` / `Data_Tuning_RifleSlingCloth.mjs`：32 个 PBD 质点，1/90 s 子步、20 轮约束、空气阻尼 14、惯性系数 0.15（每帧输入限 3 mm）。接触消除法向回弹速度，保留切向摩擦；身体顶点采样体素为 15 mm，下摆继续用真实三角面拦住线段穿越。

装上先收紧、垂稳，再把胸前引导贴到当前可见身体；按新路径弧长重新均匀采样、量长，留 2% 余量并再次垂稳。保留旧宽带长度会把细绳拱离小身材胸口，仅降低惯性不能修复。异步换身体、瞬移、远距重返及长期隐藏后重现都会重新贴合。

`Script_RifleSlingVisual.mjs` 按名称重排 Blender 骨，保留绑定旋转，移除顶点按蒙皮权重计算的轴向绑定偏移。绳股径向形状保留，骨平移沿求解器线段插值，避免普通绑定在肩部急弯把 7 mm 绳鼓出约 1 cm。只在加载时准备几何，逐帧只写骨矩阵；接通生产 PBR、预通道，发布时由 PC 资产路径规则自动发现。

`Script_RelaxedGait` 与 `Script_FirstLevelP012BackRifle` 注册旧带子和材质库，并调用 `SetRifleSlingWeapon` 传入实际背枪与武器编号。`Script_Main.RenderScene` 在唯一一次场景矩阵更新后、第一次渲染前调 `StepRifleSlings`。

新绳及附件挂场景根 `RifleSlingCloth` 组，避免换皮与伤口扫描隐藏它；原带子 layers 关闭、显隐随原逻辑。12 m 外隔帧、30 m 外冻结；关闭或释放恢复原 layer，清理几何和骨架，重挂场景时附件一同移动。枪本身仍由原背架驱动。

## 验证口径

- `Script_RifleSlingClothTest`：真实 Blender GLB 的三股几何、权重、CPU 蒙皮径向范围和固定点；原人体动作夹具的穿模、贴身、长度、确定性、瞬移、暂停、显隐与释放；急停末 0.25 s 余振小于 1 mm、总长变化小于 2.5%。另从实际汉阳造 GLB 独立核对环孔，验证实际枪坐标、缩放与背架旋转下的跑动端点。
- `Script_RifleSlingClothBrowserTest`：实际新绳写生产 RT1，静止为零，2 cm 平移约 6 px，非刚性弯曲与回摆方向正确；白盒七人逐个近景，以实际身体三角面量胸前接触至少 70%、最深不超过 8 mm；正、斜、侧、背及两端挂点截图默认 1280×720。连续走动无 NaN、端点误差小于 1 mm、每节拉长小于 25%、每根中位数小于 0.8 ms。
- 回归：MotionVectorContract、CarriagePropVelocity、BackRifleRun、FirstLevelP012Animation，模块图、数据、资产、文字和发布检查；运行时改动推送前跑 prepush。

## 2026-11-05 实测

- Node 专项 55 项通过：7 mm 外径、32 骨、蒙皮、身体与木托零线段穿越、三种枪挂点／捆扎圈、释放与暂停。原跑步夹具胸前摆幅约 2.8 cm、全绳约 6.7 cm；停步末 0.25 s 余振约 0.98 mm，总长变化约 0.03%。实际汉阳造挂点夹具最大单节约 1.05 倍。
- 浏览器专项 33/33：七人胸前真实贴合 90%–100%，前后绳扣近景、端点与长度门禁、连续走动和每根中位数小于 0.8 ms 门禁均通过。实际新 GLB 的 RT1 平移读回约 5.996 px，弯曲／回摆约 ±2.996 px，首帧和停止为零。
- 通用 MotionVector 49 个 GPU 情景、CarriagePropVelocity、BackRifleRun 与 P012 动作接入回归通过；P012 本轮审图用 1280×720，保持原断言。模块图、字体、数据来源／JSON／引用、发布资源与史实账本检查通过。新增文字字体已重烘，缓存戳 `20261105Hemp1`；资料馆实际界面已查看。
- prepush 实跑先通过 113 项，在既有 OpeningSetTest 引用已退役 `Model_HanYang.tzm.json` 处停止。该测试与远端基线一致，远端同样没有该文件；不能报告全仓全绿。
- BlenderMCP 源工程已保存并停止本任务实例；`status --scan` 无本任务实例。截图与证据只在本地。
