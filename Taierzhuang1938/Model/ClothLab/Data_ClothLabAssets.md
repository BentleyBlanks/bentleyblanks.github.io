# 布料测试场独立资产

2026-10-24 首版。三件仅供布料测试场调整与比较，不替换正片的 `Model_SingleBlanket.glb`，也不修改旧布料参数。尺寸、补丁、颜色、绗缝及旗面布局均为**创作复原**。锦旗以川军“死字旗”的白底黑字作为外观主题；红边与斜绸带是本测试模型的简化设计，不能当作馆藏原件的逐项复刻。

| 文件 | 平面尺寸 | 双层厚度 | 材质 |
| --- | --- | --- | --- |
| `Model_DongguaQuilt.glb` | 1.40 × 1.90 m | 包边 1.4 cm，主体非均匀填棉、峰值 8.53 cm | 灰褐旧棉布、原五块补丁的派生底色、稀疏绗缝、独立深色背面与包边 |
| `Model_DoorCurtain.glb` | 1.25 × 1.90 m | 包边 1 cm，主体峰值 3.5 cm | 暗黄灰棉门帘，三道纵向缝线、下缘积灰、角部修补 |
| `Model_SichuanBanner.glb` | 1.45 × 1.75 m | 2.5 mm | 米白底、黑色楷体“死”、暗红边与对角绸带 |

包边在四周各增加最多 2 mm；旗的包边各增加 0.8 mm。厚度来自闭合网格，不依赖双面材质伪装：上下各一层 50 × 64 四边形网格，加连续侧边；每件 6,858 作者顶点、13,712 三角、1 网格 / 3 材质。GLB 按材质与 UV 拆分顶点，检查封闭性时须按位置焊接。各材质为不透明棉布，metallic 0、roughness 0.96、Blender Specular IOR Level 0.18，低强度平纹/细褶法线与柔和 sheen。

## 绑定契约

- 同现有 `BlanketClothRig`：`Blanket_Root` 加 18 行 × 12 列的 216 个独立子骨，最多四邻骨双线性权重。
- 四角名为 `Blanket_CornerHeadL` / `Blanket_CornerHeadR` / `Blanket_CornerTailL` / `Blanket_CornerTailR`；其余为 `Blanket_Grid_r{row}_c{column}`。
- Blender 源坐标 `(x,y,z)` 导为 glTF `(x,z,-y)`；运行时 X 为宽、Z 为长、Y 为上；r0 在 +Z，c0 在 +X。所有骨头头端在 Y=0 平面。
- `Blanket_Rig` 与网格节点是单位变换，网格上下层相对骨面有独立厚度。没有动画或 morph；运行时求解器通过骨骼写入实时姿态。
- `Mat_<AssetId>Front`、`Mat_<AssetId>Back`、`Mat_<AssetId>Binding` 三材质。GLTFLoader 可将三个 primitive 展开为共享同一骨架的三个 SkinnedMesh；不要只显示第一个 primitive。

## 重建与原工程

源工程统一位于 `C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/ClothLab/`，三件各自保存 `Scene_<AssetId>.blend`，所有贴图均已 packed。生成纹理也保留在该目录的 `Textures/`，不占用仓库 `Texture/` 的全局贴图目录。

在本仓任务独占 worktree 根执行：

```powershell
python Taierzhuang1938/_blender/Script_ClothLabAssetsTextures.py
node scripts/Script_BlenderMcp.mjs start --task ClothLabAssets --new
node scripts/Script_BlenderMcp.mjs exec --file Taierzhuang1938/_blender/Script_ClothLabAssetsBake.py
node scripts/Script_BlenderMcp.mjs exec --file Taierzhuang1938/_blender/Script_ClothLabAssetsPreview.py
node scripts/Script_BlenderMcp.mjs stop
node scripts/Script_BlenderMcp.mjs status --scan
```

有多个本树实例时，对 `exec` / `stop` 加入启动结果的 `--port`。烘焙脚本拒绝覆盖该源目录之外的已打开 Blender 文件。Python 纹理脚本需要 Pillow、numpy 和 Windows `simkai.ttf`；字体只栅格化一个字，不再分发字体文件。棉被底色由旧 `Texture_SingleBlanketBase.webp` 派生，法线复用 `Texture_SingleBlanketDetailNormal.webp`，两份旧输入文件均只读。每份 GLB 自包含最多 1024² 的 WebP 图片：棉被 3 图，门帘与旗各 2 图。

单件复建可通过 `runpy.run_path` 的 `init_globals={"ClothLabOnly":"DongguaQuilt"}` 运行烘焙脚本；无界面批处理也接受 `--only DongguaQuilt`。这条路径读取已有元数据，另外两件 GLB 不重新导出。

## V2 棉被填充与绗缝

实际测试场披覆后，V1 的浅绗缝在远景不够清楚。V2 只改棉被：每面凹槽从 4.5 mm 加深到 12 mm，凹槽高斯半宽约 3.3 cm；填充层保持非均匀圆鼓，主体峰值 8.53 cm，不增加规则充气格。线迹与布面适度拉开色差，且用翻转后的纹理 U 坐标与几何凹槽对齐。五块旧补丁及棉布纹理保留。门帘和旗的 GLB SHA-256 与 V1 完全一致。

## V3 三件包边切线修复

V1/V2 的侧边沿用了平面 UV，上下层在 UV 中重叠，侧边法线贴图的切线因此退化。V3 对三件的 Binding 单独展开为“累计周长 × 实际壳厚”的有面积条带，正反面 UV、造型、骨架、贴图、材质参数保持 V2；门帘和旗由此也产生新 GLB 哈希。

烘焙出口直接读取 GLB 的 NORMAL/TANGENT 验证，九个 primitive 的切线均非零、长度误差小于 6.7e-5，最大 `abs(dot(N,T))` 小于 1.24e-4（导出数值舍入）。Binding 三件最大值分别为 1.042e-4 / 1.001e-4 / 1.001e-4。逐项结果保存在 JSON 的 `checks.tangents`；当前身份为 `20261024ClothLabV3BindingUv`。

## 首轮验证

Blender 5.2.1 LTS 实际执行网格构建、GLB 导出及重导入。三件源网格均为 genus 0 的封闭壳，边界边 0；每顶点 1–4 个有效权重，和为 1（最大浮点误差小于 4.5e-8）。拉升一个头角 25 cm，蒙皮结果相对双线性预期最大误差小于 3e-8 m；真正导出的 GLB 重导入后顶点偏差为 0。骨格、尺寸、SHA-256、字节数和逐件验收数据见 [Data_ClothLabAssets.json](Data_ClothLabAssets.json)。

三张 640 × 480 本地渲染已检查：棉被填充有实体厚度、包边与旧补丁清楚；门帘缝线与下缘磨旧可见；旗面黑字与红带可辨。检查图在被 Git 忽略的 `tmp/ClothLabAssetPreview/`，不提交。预览中的弯曲只是检查姿态；最终布料运动与参数应以测试场的真实求解器验收为准。
