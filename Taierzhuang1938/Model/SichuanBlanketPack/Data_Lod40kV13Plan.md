# Sichuan Pack — 40k delivery

2026-10-22 最新用户要求：先完成这版高质量，再压到 4 万面，清理中间生成的临时文件。按全部附件合计不超过 40000 三角执行。之前 2999 三角版本和 1829676 三角高源分别是历史版本与制作源，不是当前交付预算。

**当前正式版已验收，用户于 2026-10-22 确认并授权提交推送。** 版本 `20261022Lod40kV13-03d3d4f2`，共 **39939 三角、5 网格、15 张 4096 PBR 图**；`userApproved=true`，用户明确回复“就这样吧提交推送”。正式入口为 `Model_SichuanBlanketPack.gltf`、独立几何 BIN 和十五张 lossless WebP，全部单文件低于 100000000 字节。

| 部件 | 三角数 |
| --- | ---: |
| Bundle | 9364 |
| Binding | 4933 |
| Jacket | 2956 |
| StrawMat | 14500 |
| Sandals | 8186 |
| 合计 | 39939 |

以上读取本地正式 `Data_SichuanBlanketPack.json`，不沿用失败候选计数。canonical glTF SHA256 为 `03d3d4f2d1026b98d9e32ceb113cc4461e0be351c5192dcc1c152d679c88562f`。OneDrive 保留完整 GLB 为 `Lod40kV13/Exports/Model_SichuanBlanketPack.glb`，122073824 字节、SHA256 `146ecd32e483cec6a4fec434a5eaa658b86ec539577ef4bd1fbb108816b7b7fd`；超过仓库单文件安全线，因此仓库交付外置 glTF。

最终低源为 OneDrive 本资产 `Lod40kV13/Scene_SichuanPackLod40kV13.blend`，SHA256 `ba061bb249a92065ec3588c75361818f5ddba4442341d1a4d8d71fbb06a6f2d2`。已实际重开，五个部件网格和十五张 packed 4K 图完整。米制、游戏 Y-up、贴背中心轴心、平背、独立草席与短褂、整体抽出短褂和侧挂双鞋均保留。

高质量源已完成：23 网格、1829676 三角，独立源重开无丢失贴图；实际完整 PBR 文件 465 项通过，浏览器 425 项通过。19 个导出零切线由实际邻面 UV 基重建，位置、法线、UV、索引、JSON 和图片字节保持不变。草席主外织 337152 三角的实际黑/透明重心均为零；微毛边剩余 18 个采样空白总面积约 0.1285 平方毫米，记录而未补色。

保留高源：`C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/SichuanBlanketPack/QualityV12/Scene_SichuanPackQualityV12.blend`，及其带完整 QualityUV/PBR 的 `QualityV12/Exports/Model_SichuanBlanketPackQualityV12.glb`。当前重建从这两个完成源开始，不再依赖历史 HighV10/Study/Game 文件。

## Current pipeline

`_blender/Script_SichuanLod40kBuildV13.py` 载入完成的高 PBR 源，复制真实网格与完整层级，调用 `Script_SichuanQualityLod40kV13.py::BuildQualityLod40k`。减面后先作实际 `Mesh.validate` 清理，再建立烘焙基准，避免导出器后清理使法线基失效。已导出的首轮候选为 Bundle 9364、Binding 4933、Jacket 2956、StrawMat 17708、Sandals 3932，合计 38893 三角。平面卷口保持原样；实际几何、边界、双向表面距离与总预算仍须独立核验。

**该候选未通过画面验收。** 浏览器数值 398 项通过，但草席和草鞋出现碎黑三角，短褂抽出后也有黑片。旧方法保留高图集 UV 并只转法线，不能保证 QEM 新三角仍落在原高图表的覆盖区；纯法线排查后仍有外观问题。因此这些检查数、旧法线图与候选源不能作为最终完成证据。

最终版采用结构化草编。`Script_SichuanStructuredStrawV13.py` 从真实高源管条的拓扑和截面环恢复连续织条，按原位置采样环段，替换草席主织和两鞋编织，避免无约束减面把细草条压成碎面。

`Script_SichuanLodProjectionV13.py` 将每个低部件合并为独立网格，在几何不变的前提下重新展 UV，从完成高 PBR 源实际 selected-to-active 光线投射 Base/Normal/ORM。五个直接部件根、米制、Y-up、平背与隐藏/抽出功能保留；不要求继续保留首轮 23 网格。投射报告必须记录真实来源哈希、Low 重展前后 geometryOnlySha256 相同、新 UV 基准烘焙前后不变、High 几何/UV 不变，以及十五张实际 4096 图。

Cycles 光线投射和最近顶点自定义 cage 仍有漏射，因此使用 `Script_SichuanNearestSurfaceFallbackV13.py`：保留已命中的主光线结果，仅对实际低 UV 三角覆盖内 Base/ORM 为零或 alpha 为零的漏射 texel，使用 BVH 最近高表面三角及重心坐标读取原高 Base/ORM，并将采样高法线由 High TBN 转至 Low TBN。最终实际补烘 **3010 个 UV 像素**。它是有实际高表面来源的 PBR 转移，不生成新颜色，也不从邻像素填洞。原始主光线报告保持不变，最终报告通过 `nearestSurfaceFallback` 的真实 path/bytes/SHA/generator 连接来源；独立检查核过原高 atlas、High/Low 几何不变、精确 mask、mask 外图片字节不变及最终 UV 覆盖。

另一个根因是目标 ORM 同时具有 AO 与 Metallic/Roughness 两个纹理节点。`AssignImage` 已改为替换该通道全部实际纹理节点，避免 AO 继续读取旧图。glTF 附加组件会对 opaque ORM 去掉 alpha，但 RGB 一致；`Script_SichuanNormalizeProjectedImagesV13.mjs` 只有在原 PNG 与导出图片的完整解码 RGB8 严格一致、几何字节 SHA 不变时，才恢复真实原始投射 PNG payload。没有通过改色或覆盖错误通道来掩盖差异。

`Script_SichuanProjectionExportV13.py` 负责导出新投射后的五部件 PBR 与独立几何清单。重建所需阶段脚本包括 `Script_SichuanLod40kBuildV13.py`、`Script_SichuanQualityLod40kV13.py`、`Script_SichuanStructuredStrawV13.py`、`Script_SichuanLodProjectionV13.py`、`Script_SichuanNearestSurfaceFallbackV13.py`、`Script_SichuanProjectionExportV13.py`，以及共用 MeshEvidence/GLB 审计模块。图片阶段另保留 `Script_SichuanFallbackImagesV13.mjs`、`Script_SichuanNormalizeProjectedImagesV13.mjs`；切线扫描/必要的严格修复后用 `Script_SichuanFreezeCheckedExportV13.mjs` 冻结选择，再运行 packager 和 gated metadata writer。完整清单见正式 metadata 的 `source.rebuildScripts`。本轮实际运行并验收了这些制作阶段，没有声称另起空目录的一键完整重建已重跑。

`Script_SichuanLodPackageV13.mjs` 保留历史继承图集模式，同时以显式 `materialBakeMode=projected-high-to-low-new-uv` 接收真实投射报告。投射分支已核对十五张最终原图与 raw GLB 图片字节 SHA 相同，并完成 RGB8 无损 WebP 往返；不声称十张 Base/ORM 与高图集像素相同。原始 GLB 的几何 bufferView 字节、accessor 格式和层级在打包前后保持不变；17 个实际无效切线作严格的切线范围修复，位置、法线、UV、索引、JSON 和图像字节不变。

## Final verification

最终 raw GLB 独立检查 **16191 项通过**；同一 canonical 资产真实浏览器 **181 项通过、3 个视图**，包含草席/短褂隐藏、完整短褂抽出和恢复。最终低源实际重开通过。制作方对照 Source 与 Runtime 的 Cycles 图，草编连续规则、端盖卷纹可辨，两者外观一致；图片只留本地 `Lod40kV13/Review/Image_FinalSourceV13.png` 与 `Image_Lod40kV13_RuntimeThree.png`。这些是最终 V13 的实际记录，不复用旧版检查数。

## Cleanup scope

清理仅针对本背包的已确认中间文件，包括失败探针、旧版预览、重复大 GLB、原始烘焙缓存、未使用的阶段源和自动备份。保留最终 40k 模型/自包含源、必要 PBR、完成高源、确认 V02 与史料、使用过的生成图来源、必要重建脚本及最小最终验收记录。按实际依赖清单处理已验收后可以退役的采样缓存；`Script_SichuanLodPackageV13.mjs` 使用 V12 packager 的纯工具函数，后者仍是必要脚本。不得清理其他资产、其他 worktree 或用户自行打开的 Blender。

正式 V13 已完成技术与视觉验收，用户已确认并授权发布。实际清理 **1510 个中间文件、15345366330 字节（约 15.35 GB）及 171 个空目录**，包含重复导出、失败探针、原始烘焙/RGBA 缓存、旧阶段工程与自动备份。保留最终低工程/GLB、完整高工程/高 PBR GLB、必要来源和最小验收记录；清理后再次实核 21 个正式文件与源文件的大小、SHA256 均匹配。两次删除的凭据和同路径历史版本退休记录保留在本地 `tmp/SichuanBlanketPack/Cleanup/Data_FinalCleanupSummaryV13.json` 及其引用记录，原始最终验收报告没有改写。曾占用日志的本任务预览服务已静默换到资产临时目录之外，8099 继续提供最终模型；本任务 Blender 全部退出，`status --scan` 无残留。

报告中的原始 raw/PNG/Work 缓存路径已明确退役，不能再当作现存输入；继续制作使用保留的自包含最终工程和完整高源，按阶段脚本重新生成需要的缓存。模型预览、截图、清理凭据均只留本地。
