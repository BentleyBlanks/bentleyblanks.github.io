# Sichuan Pack — QualityV12

本页记录已完成的 QualityV12 高质量制作源。2026-10-22 用户后续要求在完成质量版之后压到 4 万面；当前最终交付按全部附件合计 ≤40000 三角执行，见 [V13 交付记录](Data_Lod40kV13Plan.md)。原 2999 三角版本 `9f6051c0` / 提交 `e80b6824` 保留作历史备份；用户指定的草席横截面贴图方案继续有效。米制、游戏 Y-up、贴背中心轴心、平背、独立草席、可抽出的折好短褂和侧挂双草鞋等结构要求不变。

## Native source

`C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/SichuanBlanketPack/QualityV12/Scene_SichuanPackQualityV12.blend`

已实际建立并渲染原生工程，可见 23 网格、1,829,676 三角；没有减面。Binding 490772、Bundle 470088、Jacket 370032、Sandals 127376、StrawMat 371408。原 HighV10 文件哈希保持不变。

- 主体、连续布带、毛边、补丁及针线保留原生 evaluated 细节；独立相对形态键修平贴背接触，不破坏原 Basis。
- 草鞋保留真实杯形、三股编绳、鞋口带、磨洞与细草。
- 草席保留实际外织，复制 sheet 后仅留最外一圈；旧切端乱草和内卷仅隐藏排除。两端各 130 轮廓点的平面沿用 MatEndV12 图，内部卷层细节由贴图表现。
- 短褂原完整剪裁位于历史名 `Pack_ClothButtonLoop` 中。原露角与盘扣保留；衣身局部细分和渐消柔褶、0.65 mm 厚度及真实边界软连接一并补齐，仍以折好状态整体抽出，不擅自增加展开功能。

历史形体制作入口：`_blender/Script_SichuanQualityBuildV12.py`，依次调用 `Script_SichuanQualityStrawV12.py` 与 `Script_SichuanQualityJacketV12.py`。该历史入口从原 HighV10 开始；当前 V13 重建从完成的 QualityV12 源与其完整运行时 PBR GLB 开始，不以旧 HighV10/Study/Game 缓存作为必要依赖，也不能覆盖完成高源。

## Material export

原生 `.blend` 的完整复杂材质已经保留，预览在本地 `tmp/SichuanBlanketPack/QualityV12/Review/`。标准完整 PBR GLB 已完成，保留在同源 `QualityV12/Exports/Model_SichuanBlanketPackQualityV12.glb`。它具有 23 网格、1829676 三角、五部件十五张实际 4096 图；独立检查 465 项通过，真实浏览器 425 项通过，独立高源重开无丢失贴图。这是 V13 制作用高源，不能作为 4 万三角的最终交付。

`Script_SichuanQualityExportV12.py::BakeQualityPbr` 的主路为 evaluated 高几何副本、五部件独立 4096 QualityUV，自烘实际 Base/Normal/Roughness/AO，并组成 ORM。原生 UV、材质、形态键和坐标锚点保持原样。`Script_SichuanQualityProbeV12.py` 提供 RNA 能力检查和单草席实烘探针。

完成输出采用连续管条 UV：200 根管、600 图表、337152 三角的目标 UV 无退化，有效图面积约占窗口 77.5%，每三角面积至少 2.765 像素平方。唯一外织对象使用该图表，其他对象独立 Smart Project 后放进数学不相交的窗口。源 shader 的原 UV 输入显式固定，源 UV 和材质保持不变；曾失败的全局多对象 pack 与 1K/4K 探针只保留历史诊断用途。

Blender 5.2 的 glTF 附加材质组调用官方 `create_settings_group` 工厂建立完整接口，不再手造仅有 Occlusion 的旧组。以上探针问题已在完成高源管条 UV/完整烘焙中处理：实际草席主外织 337152 三角重心黑/透明为零；微毛边仍有 18 个空白采样、总面积约 0.1285 平方毫米，按实记录而未补色。19 个实际导出零切线由邻面 UV 基严格重建，位置、法线、UV、索引、JSON 与图像字节不变。标准 PBR、实际像素、导出后外观及部件功能已经对完整高质量输出验收，单草席探针没有被用作最终证据。

所有诊断、截图与探针仅留本地；完成当轮后必须停止自己的 Blender 并保存 `status --scan` 证据。以该高源制作的最终 V13 已完成 39939 三角本地正式交付和原生/GLB 外观、独立部件及单位/轴心验收，用户已确认并授权发布；最终 V13 使用自身的 16191/181 检查记录，未复用高源或旧 651/41 检查证明完成。
