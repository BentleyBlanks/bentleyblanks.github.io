# Game Build From V10

GameV10 已冻结为 **2999 三角、单套 1024 PBR** 的本地正式资产，版本 `20261021GameV10-9f6051c0`。本轮完整烘焙、严格验证、保存源重开、浏览器交互及实际参考图复核已完成，七件正式文件已在本任务 worktree 替换旧 V6 输出，**保留本地，未推送**。最终上限仍为 ≤3000 三角（含所有可隐藏部件），见[需求核对](Data_RequirementsAudit.md)。此前 9870 三角及其他 3000/2999 候选只保留作历史记录。

雕刻源 `HighV10/Scene_SichuanPackSoftWearV10.blend` 与原图保留。独立 `GameV10/Scene_SichuanPackGameV10.blend` 从实际 V10 evaluated 形体取低模；实际烘焙源另存 `HighGameV10/Scene_SichuanPackGameBakeSourceV10.blend`。三者均位于 OneDrive `AI/Models/Blender/Taierzhuang1938/SichuanBlanketPack/`，不把 `.blend` 放入仓库。

2026-10-21 新 canonical 构建实测为 **2999 三角**：Bundle 1305、Binding 354、Jacket 212、StrawMat 308、Sandals 820，全部可隐藏部件均计入，零面积三角为零。游戏背面投平的最大调整为 2.38 mm，接触面积 0.09759 m²。

**用户最新明确草席横截面用贴图，不要内部卷层三角。** 此指示覆盖此前“必须保留内部螺旋、不得端盖”的制作方案与门禁；旧 56 段/224 三角开放卷层及 5% 槽宽均为历史方案。

当前草席使用真实外壳两端的 **24 点轮廓**作平面纹理端盖，每端 22 三角、共 **44 三角**，轴向平面误差为零；内部螺旋三角为零。当前端面卷层来自下述 MatEndV12 图像与独立高模载体的投射。外壳 192、端盖 44、随席卷隐藏的布带 72，共 308 三角。原高模卷层继续保留用于制作，不导出为游戏内部几何。

草鞋各保留完整高模编边包络的 **1.10 倍**厚边、开放中心、原鞋口带与悬绳。鞋沿改为 **4 边截面**，按实际高源曲线误差自适应取 18 站，每鞋厚沿 144 三角；两鞋连悬绳共 820。鞋底沿长取 6 段、7 个采样行，并用 70 个高源轮廓导引按同一 row/column 参数贴合实际低模鞋沿后脊，避免全局最近点误配和跟部退化面。

主连续布带保留 149 个路径站点，实际路径最大误差 **1.858 mm**；侧结路径误差上限 1.2 mm，实测最大 1.161 mm。短褂的 212 三角分为完整衣身 140、露出衣角 48、两条布扣路径 24；衣身表面误差 0.90 mm。衣角经 3D QEM 后受约束回贴一个实际高源特征点，最大源面距离从 4.66 mm 降至 **2.26 mm**，不翻转邻面，UV 属性哈希不变。源 UV 面积比只记录 3D LOD 属性近似，不宣称精确保留原始 UV 足迹。

`Script_SichuanGameBindingClearanceV10.py` 再把真实低模前带贴合到真实低模布面，只沿包局部 -Y 作最小位移，X/Z 路径、宽度与高源引用不变。当前最大额外位移 **1.244 mm**，处于 6 mm 硬上限内；0.30 mm 间隙目标同时经平面重叠极值和实际 BVH 距离检查，最小实际距离约 0.301 mm。这个位移与上面的高源路径采样误差分开记录。

`Script_SichuanGameFoldEnvelopeV10.py` 从实际高模折层重取 RightFold、LeftFold 和 Crown，本轮分配为 **右折 8 列×27 站、左折 6 列×17 站、冠部 6 列×10 站**，分别 432/204/116 三角。此前 4 列 33/18/15 站方案只作历史对照。三者分别独立闭口连通，边界边与非流形边均为零；并不宣称整个 Envelope 封闭。保留 core 的坐标 SHA 前后相同，高模不改；正面叶为 180 三角。逐个实际高源顶点到替换低面的最大距离为右折 4.64 mm、左折 4.79 mm、冠部 3.12 mm；这些是几何近似误差，不能当成参考图一致的证明。

补丁以原高模补丁相对真实高布面的抬升量 **0.451–1.471 mm**，贴合到实际低模布面。当前 28 个样本的最大源到游戏补丁位置调整为 **3.634 mm**，X/Z 足迹不变；每点保存高/低布面、原抬升量与最终位置，不把整片补丁推成凸起块。

`Script_SichuanGameRepairStitchesV10.py` 从真实高模手缝线取 **24 根针脚、48 三角**，作为 Bundle 下的独立细带几何随补丁一起显示。保留每针源长度/宽度、UV 以及贴合低模补丁的位移报告，不再只靠烘焙图尝试表现针脚。

`Script_SichuanGameUvV10.py` 对 **24 个网格、2999 个三角**实际排布 **16 次，最后 iteration 15** 后通过：精确重叠、越界、退化均为零，每个三角同时包含严格内部的 **1024 与 2048 像素中心**。鞋沿采用线性 2.5 倍 UV 分配权重；仅单三角图块可作每轴不超过半个 1024 像素的相位平移，之后重新执行全部门禁。首层 SurfaceUV 保留，运行时使用第二层 GameUV / TEXCOORD_1。生产 UV 检查与源 SurfaceUV 面积近似分开；几何或 UV 通过不证明贴图与最终外观完成。

本轮投射采用真实高面方向分组、爆炸投射、原局部坐标属性与原坐标锚点矩阵补偿。来源面按几何面与原角点法线的 **60° 锥角**过滤；仍须由实际烘焙法线门禁判断是否有效。每个真实高模在各格中只由“选中投射面 + 被省略面的 AO 遮挡补集”表示一次，避免完整遮挡物与选中源重复；支撑底面不再额外加入完整 AO 遮挡物。

临时复制材质统一断开 `BSDF.Normal` 输入，NORMAL 烘焙只读取真实高模的 smooth 几何角法线；原 sRGB Base、Roughness 与 AO 输入及原高模材质保留。原纤维微法线、2° 限制和针对个别失败面的特例不参与本轮投射，不翻转 RGB 法线像素来通过检查。

准备阶段已把带真实材质和重心 UV 的底面移至低模后方 **10 mm**，避免原 2 mm 底面抢先遮住高模折层。底面不导出游戏，不补画像素；材质必须引用原始持久 ID，不能把 depsgraph 临时材质存入源工程。具体锥角、底面深度和 AO 分区以本轮 `Data_BakeProjection.json` 与 `Data_GameBakeSupportsV10.json` 为准。

`Script_SichuanGameCottonBalanceV10.py` 在独立烘焙源上平衡旧棉布与灰带色调，保留原图、原材质与补丁底色；其源图微法线不参与本轮 NORMAL 投射。`Script_SichuanGameWovenLodV10.py` 使用内置 imagegen 的 GrassWeaveV11：按 **55 mm** 实际尺度，图块支路先作线性色乘 **[0.98, 0.91, 0.78]** 的暖色调整，再以 **50% 图块 / 50% 原旧草色**混合，最后投射到共同 GameUV。原 PNG、高模几何、UV 与原材质图保留。来源见 [GrassWeaveV11 记录](../../_import/SichuanBlanketPack/Source/GrassWeaveV11/Data_SichuanGrassWeaveV11.json)，其中提示词只保留设计意图摘要，明确不是逐字原文。

`Script_SichuanGameStrawToneV10.py` 随后仅对席卷、草鞋中 `AtlasRegion=straw` 的实际高模材质作线性色乘 **[0.96, 0.88, 0.70]**，不把灰布带、被子、席卷棉布绑带或挂鞋细绳染成草色。鞋沿的明暗落在每鞋真实三股编绳的面组与材质上，三股再分别乘 **[1.04, 1.02, 0.98] / [0.80, 0.77, 0.70] / [0.94, 0.90, 0.83]**。六个实际股面组各为 281 环、8 边截面、2242 个源面，报告保留顶点范围、面索引/拓扑哈希及最终材质槽；它们不增加低模三角。原材质图、图像、几何、UV 与变换保留，最终 `materialsAtBake` 按真实槽位记录，不能沿用处理前材质名。

草席端面的 MatEndV12 由 **内置 `image_gen__imagegen`** 生成，原图实为 **1254×1254**，准备过程仅 RGB 转换与 Pillow LANCZOS 缩至 **1024×1024**。完整提示词、原图与处理图路径/哈希/实际尺寸、处理步骤见 [MatEndV12 来源记录](../../_import/SichuanBlanketPack/Source/MatEndV12/Data_SichuanMatEndSourceV12.json)与[逐字提示词](../../_import/SichuanBlanketPack/Source/MatEndV12/Prompt_SichuanMatEndV12.txt)。处理图是烘焙源，随后进入共享 1024 GameUV 图集，不能冒称原始生成图或额外运行时贴图。

[`Script_SichuanGameMatEndSourceV10.py`](../../_blender/Script_SichuanGameMatEndSourceV10.py) 复制真实两端轮廓，为独立高模载体作六级共享边细分：实测 **91,698 顶点、180,268 三角**。载体从原图亮度的 9×9 平均值取得浅几何起伏，设定位移峰峰值 **0.225 mm**，向外基准 **0.250 mm**、平面后备层 **0.080 mm**；只供 Base/Normal/Roughness/AO 投射，不导出游戏。低模端盖仍为 44 三角，几何与 SurfaceUV/GameUV 哈希前后相同；全模型仍为 2999 三角，本轮没有重新修改几何或 UV。

端面源材质的整条 Base Color 分支使用 component-wise **MAXIMUM**，给干草暗缝设置线性深棕最低反射率 **[0.002, 0.0013, 0.0007]**，再作投射。它不改原图像素，也不改变由原图取得的高模起伏；不是按失败像素列例外或给烘焙图补色。原始黑色/透明/法线有效性门禁保持原样；本轮已以同一新源完成全部五部件、四通道重烘，编码器原始黑色 core 门禁通过，没有拼接旧源结果。

本轮已用实际新 GLB 复核侧折软感、席卷明暗和端面卷层、草鞋编边及补丁，保留当前色调，没有追加席卷整体加深。此前包括 `12f8` 候选在内的检查数、截图和 SHA 只作历史资料；以下证据均对应本轮冻结资产。

## Verified local delivery

| 项目 | 本轮实际结果 |
| --- | --- |
| 正式 GLB | [Model_SichuanBlanketPack.glb](Model_SichuanBlanketPack.glb)，2,563,816 bytes，SHA256 `9f6051c073af9539480188a4e79f18418fc4ddb97697822a7cb41ca4834fb288` |
| 低模与贴图 | 24 个网格、2999 三角，包含全部可隐藏部件；一套 1024 Base/Normal/ORM，内嵌/外部图像完整字节一致 |
| 严格验收 | 候选与复制后的正式 GLB 均为 **651 项通过、0 失败**；正式报告 `tmp/SichuanBlanketPack/Review/Data_Validation.json` |
| 浏览器 | 同一 GLB **41 项通过**，实检正/背/侧/三分之四、隐藏草席、隐藏短褂及完整短褂抽出，共 7 个视图 |
| 源工程重开 | 实际重开 GameV10 后为 24 网格/2999 三角，3 张 packed 1024 图、24 个持久材质支撑底面，GameUV 为第二层 |
| 切线复核 | 8997 个导出角点全部匹配；missing 0，GameUV 切线点积低于 0.99 为 0；实际法线贴图使用 TEXCOORD_1 |
| 复核状态 | `TechnicallyAndVisuallyReviewedForUser`；`sourceReopenVerified=true`、`referenceFidelityReviewed=true`，表示制作方已核对实际参考效果；**`finalModelApprovedByUser=false`**，未记录用户最终批准 |
| 本地替换 | GLB、3 张 WebP、贴图 manifest、资产元数据、完整烘焙记录共 7 件已复制正式路径；未推送、未声明线上发布 |

保存源身份：GameV10 SHA256 为 `1287f61c30de47de24c1e7233275ff40e68fef01ec0c24486f44192a03e84490`；独立 HighGameV10 烘焙源为 `962adce5e1eaa6adf35241b0433eafc0c7aef8102b11d7b11792a72e26155c41`。端面实际投射记录包含 `High_Pack_MatEndImageSourceV10`，并与该高源及最终材质槽一致。[正式元数据](Data_SichuanBlanketPack.json)保存来源和复核状态；截图、浏览器报告、切线复核及重开报告仍只留本地 `tmp/SichuanBlanketPack/GameV10/`。

同轮相关检查还包括 TextureStandardsTest（4176 项）、AssetStandardsTest 和 MotionVectorContractTest（49 个 GPU 场景），均通过。项目级 quick 在通过 8 项后，被已有 `SpeakerGestureTest` 的 `FrontObservation.02` 连续手势断言阻断；该断言及其 9 个输入文件与本分支 HEAD 一致，没有本任务资产依赖，未改动其他人物动作来消除该失败。证据留在本地 `Data_UnrelatedQuickFailure.json`。本任务 Blender 端口 9878 已停止，`status --scan` 记录无实例、无残留进程；本地预览服务保留供审阅。

## Current rebuild sequence

以下步骤均使用本任务专用的 `scripts/Script_BlenderMcp.mjs` 控制口，在已确认的任务源中执行。结束后 `stop` 并核对 `status --scan`。

1. 单独打开 `HighV10/Scene_SichuanPackSoftWearV10.blend`，确认该打开命令返回，再运行 `_blender/Script_SichuanGameBuildV10.py`。该入口已包含 `RefineFoldEnvelope`、`BuildRepairStitchRibbons` 与低模布带间隙贴合；不要在同一个 MCP 执行内重新打开文件并继续依赖旧上下文。
2. 以 `runpy.run_path` 取得 `_blender/Script_SichuanGameUvV10.py` 的 `BuildGameUv(Pack_Root, reviewBakePath)`，随后存盘。`reviewBakePath` 为本任务 `tmp/SichuanBlanketPack/GameV10/Bake`。
3. 运行 `_blender/Script_SichuanGamePrepareBakeV10.py`，依次应用 CottonBalance、WovenLod、StrawTone，记录真实最终材质槽，再建立 MatEndV12 高模端面载体及 **24 个 10 mm 真实底面**，存好独立高模烘焙源与游戏工程；载体和底面均不计入游戏输出。Prepare 的实际 `Data_GameBakeSupportsV10.json` 同时保存 `strawTone` 与 `endcapSourceProvenance`。
4. 取得 `_blender/Script_SichuanGameExplodedBakeV10.py` 的 `BakeExploded(Pack_Root, reviewBakePath)`，然后存盘。它调用 `Script_SichuanGameExplodedMergedProjectionV10.py`，使用最终低模的平面切线基准。直接场景投射的旧 `Script_SichuanGameBakeV10.py` 仅保留作诊断，不是最终烘焙路径。
5. 运行 `_import/Script_SichuanGameMapsV10.py --project <candidateProject> --review <reviewBakePath>`，把真正的四张 2048 RGBA 烘焙图编码成一套 1024 lossless WebP。内部漏烘与反法线必须失败，仅允许实测边缘邻域扩展。
6. 取得 `_blender/Script_SichuanGameExportV10.py` 的 `BindAndExportGame(Pack_Root, candidateProject)`。`candidateProject` 默认是忽略目录 `tmp/SichuanBlanketPack/GameV10/Delivery/Taierzhuang1938`。
7. 对候选运行严格 verifier，再实际检查 GLB 的视图、隐藏附件和原短褂抽出，重新打开保存的 GameV10 源核对打包贴图，最后运行 `_import/Script_SichuanGameMetadataV10.mjs` 写入实测元数据。候选通过后才替换仓库旧输出；网页、截图和视频继续仅留本地。

当前总额 2999，距用户上限仅余 1 三角；后续改动仍须重新核对总额。不能因鞋边、鞋口带和悬绳而削掉双鞋结构；最终按导出的全部索引验证。

## Required construction

- 五根节点直接归属 `Pack_Root`。短褂保持完整衣片与原纽扣，可整体抽出；草席的绑带、切端和内折叶随草席隐藏。两鞋、细悬绳、两肩环和连续井字布带保留。
- 去除不可见的重叠填充面后再分配低模预算，不能把高模整套盲目按同一比例 collapse。保留软轮廓、主要侧折层、衣角折口、草席外轮廓、厚编鞋沿和 24 根手缝线几何。草席端面遵循用户最新的纹理表现指示，不强加内部螺旋拓扑；细节由实际高源投射。
- 贴背接触叶保护为原生 Blender **Y=0**，轴心在其实际中心，米制与单位 1。只做必要数值清理，不能用旧 clamp 重新塑形。glTF 导出 `export_yup=True` 后验证 **Z=0、接触面朝 -Z**。
- 高模材质有部件坐标锚点。烘焙源复制/临时合并时保留原 UV、材质和锚点关系；不要未经补偿移动高模做 exploded bake。五部件分别隔离投射，避免席/鞋捕获其他物件的材质。
- 五部件均从 V10 真正投射 Base、Normal、Roughness、AO；只给主体投射 Normal、其他自烘是不够的。所有低模共用最终单套 1024 Base/Normal/ORM，法线缩采样后归一化，ORM 不得把 roughness 固定为 242。
- 从实际 GLB 检查三角数、GameUV、1024 图像、法线和纹理内容、轴心与平背，再以实际导出资产检查正/侧/背、隐藏席、隐藏衣服、抽出原衣服及肩带，不能沿用旧 147 项通过记录。

## Existing code boundaries

旧 `_blender/Script_SichuanPackSurfaceBake.py`、`Script_SichuanUvRepair.py`、`_import/Script_SichuanPackSurfaceMaps.py` 仅作历史实现参考。当前全部五部件的高到低投射、真实 roughness 读取、唯一 GameUV、完整字节导出由上述 V10 链执行。

最终验证器 `_blender/Script_SichuanBlanketPackVerify.mjs` 已硬限制最高 3000，不接受旧 10000 阈值。它检查真实可变 roughness 投射记录与 ORM.G 全像素一致、UV 精确相交、全部可选部件、平背/轴心以及内嵌与外部贴图完整字节。后续资产若有变化必须重新运行，不能复用本轮 651 项或冻结 SHA 作为新版本证据。

**禁止在 V10 上直接运行旧 `Script_SichuanBlanketPackBake.py` 或 V6 study/bake 入口。** 它会清空场景、调用旧 `SoftBundleV6`/Binding/Attachments 重建旧外形，并回写旧 10000 阈值。旧 SurfaceBake 的 `BakeSurfaces` 也不能不改即用：它仅对主体法线做高到低投射。
