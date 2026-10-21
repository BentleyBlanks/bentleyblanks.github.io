# Sichuan Blanket Pack — V10 Soft Wear

本文记录 **HighV10 高模历史阶段**：从 V9 继续修正久用旧布的软感、带子浅皱及草席卷口。V9 与 HighV10 基准保留。后续独立 GameV10 已完成新纹理端盖方案的 2999 三角/24 网格、整套烘焙及实际验收，本任务 worktree 的旧游戏资产已正式替换，**保留本地、未推送**。用户最新要求游戏席端用贴图、不要内部卷层三角；下文原高模的卷层/无盘盖描述不构成游戏版限制。当前重建入口及最终证据见 [GameV10 制作记录](Data_GameBuildV10Plan.md)。

## Source

`C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/SichuanBlanketPack/HighV10/Scene_SichuanPackSoftWearV10.blend`

米制、居中的贴背轴心、平背与独立草席/草鞋/短褂组件继续沿用。Blender 原生 Z-up，后续 glTF 导出转换 Y-up。图像与对应重建脚本文本均打包进工程。

## Reference corrections

- 内置 imagegen 以 V9 棉布原图和用户确认的 V02 参考为输入，校正贴伏浮毛、卷曲断纱与洗淡层次，减轻连续深泥底边。原图保存在 `Source/MaterialAtlasV10/Image_SichuanSoftOldCottonV10.png`；[提示词](Data_SoftOldCottonV10Prompt.txt)与[1024 PBR 来源](Data_SichuanCottonReliefV10.json)随资产保留。
- 贴图准备仅把生成源 RGB/Lanczos 缩至 1024。法线从 1–8 px 的中频纤维导出，排除细砂点和宽范围污渍梯度。材质保留软旧棉布的哑光与轻微绒面。
- `SoftCottonWearV10` 形态键提供八处稀疏弧形浅褶，以及四个带子交叉处、上翻处的浅皱和局部卷边。Basis、UV、父子关系与背平面不变，补丁区域排除；重复运行不累计。
- 草席内圈真实压紧与向内增厚，外面的一整圈、外织及席带原位保留。卷口旧宽草束及附属细筋的面被移除，沿整条压紧后的卷边重建三股轴向有起伏的扁交编草束；换位相位由全局弧长连续驱动，只保留少数短断头，没有逐段重置为碎片。没有用圆盘遮盖或把暗缝涂浅。
- 草席起卷边延伸为贯穿全宽的窄折入叶，压向内核的小裂口；它与原片起边相连，并非独立端盖。鞋底只压磨短横草束的截面，保留各截面中心形成的杯弧，鞋边和鞋口带排除。
- 草编使用独立的纵向旧草纤维源，突出植物筋脉、细裂纹与磨白断纤维；交织由几何承担，材质没有预烘编绳。加入不连续灰褐积尘，磨损坐标随各独立部件移动。来源见[草纤维提示](Data_WornStrawV10Prompt.txt)与[1024 PBR 记录](Data_SichuanWornStrawV10.json)。

## Rebuild

```powershell
py Taierzhuang1938/_import/Script_SichuanCottonReliefV10.py
py Taierzhuang1938/_import/Script_SichuanWornStrawV10.py
node scripts/Script_BlenderMcp.mjs start C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/SichuanBlanketPack/HighV9/Scene_SichuanPackReferenceWearV9.blend --task SichuanBlanketPack
node scripts/Script_BlenderMcp.mjs exec --file Taierzhuang1938/_blender/Script_SichuanReferenceRefinementV10.py
node scripts/Script_BlenderMcp.mjs stop
node scripts/Script_BlenderMcp.mjs status --scan
```

构建过程按软褶、材质、真实压紧、切端分束、内折叶、鞋底压磨及附着纤维的顺序执行。新纤维从带形态键的 evaluated 网格取表面，随后恢复可编辑源网格。卷口模块保留原网格顶点索引、坐标及完整假用户基线，便于重复修改；新草束为草席组件的子物件。

本页高模渲染与报告保留在本地 `tmp/SichuanBlanketPack/Review/`，不作为最终低模外观证明。冻结游戏版为 **2999 三角**：Bundle 1305、Binding 354、Jacket 212、StrawMat 308、Sandals 820。右折采用 8 列×27 站，左折 6 列×17 站，冠部 6 列×10 站；24 根真实针脚随薄贴补丁显示。依用户新指示，草席两端使用各 24 点/22 三角平纹理端盖，内部卷层仅留在高源烘焙，游戏内部螺旋三角为零。鞋沿为 4 边截面、18 站，鞋底沿长 6 段；前带额外贴合最大 1.244 mm。

独立 HighGameV10 烘焙源保留 CottonBalance 与 55 mm、50/50 暖色支路 GrassWeaveV11，原 HighV10 雕刻源保留。本轮随后新增 StrawTone：只把实际席、鞋草材质线性色乘 **[0.96, 0.88, 0.70]**，并在两鞋真实三股编绳面组赋不同明暗，保持原材质/几何/UV/图像；被子、灰带、席卷棉布绑带与挂鞋细绳不染草色。

当前游戏端面改用 **MatEndV12** 内置 imagegen 原图 **1254×1254 → RGB/LANCZOS 1024×1024**，保留[完整提示词与原图/处理图证据](../../_import/SichuanBlanketPack/Source/MatEndV12/Data_SichuanMatEndSourceV12.json)。独立高模载体实为 **91,698 顶点、180,268 三角**，用原图亮度取得设定峰峰值 0.225 mm 的浅几何起伏，仅投射到原有 44 三角端盖，不进入游戏几何。端面 Base 源材质整支路 `MAXIMUM` 深棕最低反射率为线性 **[0.002, 0.0013, 0.0007]**；原图像素/哈希、起伏取样与低模几何/两层 UV 均未改变，黑色/透明/法线门禁保持原样。实现详见 [GameV10 制作记录](Data_GameBuildV10Plan.md)。

临时投射材质只取真实高几何角法线和实际源 Base/Roughness/AO；生产 GameUV 经 16 次排布（最后 iteration 15），同时达到每三角的严格 1024/2048 像素中心覆盖。本轮已对五部件、四通道使用同一最新源完成重烘，全模型仍为 2999 三角。

冻结版本为 `20261021GameV10-9f6051c0`，GLB SHA256 `9f6051c073af9539480188a4e79f18418fc4ddb97697822a7cb41ca4834fb288`。候选及本地正式文件均 **651 项严格检查通过、0 失败**；浏览器 **41 项通过、7 视图实检**，包括独立附件隐藏和原短褂抽出。保存的 GameV10 已实际重开核到 24 网格/2999 三角、3 张 packed 1024 图与 24 个持久材质支撑底面；8997 个导出角点的 GameUV 切线全部匹配。新源身份、外观对照、重开与切线证据均留在本地 `tmp/SichuanBlanketPack/GameV10/`，包括 `12f8` 在内的旧候选只作历史资料。

七件正式文件已在本任务 worktree 替换；保留本地、未推送。元数据状态为 `TechnicallyAndVisuallyReviewedForUser`，制作方参考复核与源重开均为 true，**`finalModelApprovedByUser=false`**；没有记录用户对最终模型的批准。
