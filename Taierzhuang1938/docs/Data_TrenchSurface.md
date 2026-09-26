# 通用壕沟表面：参考图 07

2026-09-26 第二次迭代：前版没有通过用户视觉验收。此次重做近景扫描土壤视差、碎土几何、石材覆土与坡面枯草根毯。入口是 `FirstLevelWhiteboxField.PrepareAssets / BuildWhiteBoxes`；参数在 `Data_TrenchSurface.mjs` 与 `Data_TrenchAppearance.mjs`。关卡路线、沟宽、沟深及碰撞高度保持原契约。

## 表面与接地

- 基础泥土采用 [Poly Haven Brown Mud 02](https://polyhaven.com/a/brown_mud_02) 的成套颜色、OpenGL 法线、粗糙度、AO 和位移数据。本轮近景铺设尺度为 0.85 m；扫描高度参与八步有界 POM，颜色、法线与粗糙度使用同一偏移坐标。三向投影连续混合，两组随机平移样本减少重复；POM 在 4–14 m 渐隐。不是只让独立湿斑遮罩移动。
- `BuildTrenchEarth` 在下半坡补可裁切的碎土表层，边缘埋入原高度场，叠加多尺度土块与沟脚细屑。其高度扰动只属于视觉装饰，不产生另一个导航或碰撞面。上半坡给根毯留出覆盖空间。
- 四种局部泥块/浅压痕仍打包在 `Texture_TrenchMudHeightMask.png`：R 高度、G 边缘遮罩、B 积水倾向、A 缝隙 AO。额外高度层降到 1.8 cm；湿润只轻微压暗，高光集中在接近平面的凹处，陡壁保持较高粗糙度。避免前版大面积黑斑与亮团。
- 泥层通过表面补丁在光照前修改颜色、法线、粗糙度和材质 AO；不另铺透明发亮平面。湿地表接既有 SSR，AO 仍只直接作用于间接光，直射微阴影沿用材质框架。
- `TerrainContactField` 上传已有物理高度网格，着色器用相同的三角形对角线插值出高度和法线。碎石下缘按到地表的法向距离与噪声混入同一套泥土颜色、法线、AO 和粗糙度；接触不依赖摄像机深度。碎石缩小、加深埋入、扩大覆土带，外露部分也混入土色；整个足迹顺坡，不能只把模型中心接地。
- 自然岩石 PBR 装入既有地形纹理数组的第 5 层，仍只占两只 array sampler；四层地形的权重和均值接口不变。高度场与泥层各增加一只 sampler；地形启用 SSR 后，最高画质 + GI + 弹坑变体为 16/16，普通湿泥/石土接触变体为 14/16。新增纹理前必须再跑 sampler 门禁。

这是适配现有 WebGL2 前向管线的材质内投影层与世界高度接触场，不是完整的 DBuffer 或运行时虚拟纹理系统。方法参考 [Unreal 的 decal 材质通道](https://dev.epicgames.com/documentation/unreal-engine/decal-materials-in-unreal-engine) 与 [Frostbite 的分层地形系统](https://www.ea.com/frostbite/amp/news/terrain-in-battlefield-3-a-modern-complete-and-scalable-system)。

## 模型、许可与重建

`Model_TrenchStone.glb` 为 80 三角的原创破碎石块。`Model_TrenchDryGrass.glb` 改为 1040 三角、带细侧枝的根束，仅少量布设并和碎土共用分区；导出顶点云为 Y 向上、下垂方向为局部 -Z。主要覆盖使用 `Texture_TrenchRootMat.png`：内置 imagegen 单张生成、保留真实 alpha，8×6 网格逐点贴合原坡面，随机尺度与左右镜像；alphaTest 0.42，不使用半透明排序。所有网格走 BuildSink，无逐簇 Mesh。

枯草根毯的完整生成提示词见 [Data_TrenchRootMatPrompt.md](Data_TrenchRootMatPrompt.md)。PNG 是运行资产，源图同时保留于生成工具的本地输出目录；不依赖外部素材站授权。

本轮可编辑工程保存于 `C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/TrenchSurface/Scene_TrenchNaturalSurface.blend`，前版工程保留。重建入口 `_import/Script_BakeTrenchSurface.py`，通过仓库 BlenderMCP 生命周期脚本运行：

```powershell
node scripts/Script_BlenderMcp.mjs start --task TrenchSurface
# 将下面路径替换为本任务 worktree 的绝对路径；runpy 提供脚本需要的 __file__。
node scripts/Script_BlenderMcp.mjs exec --code "import runpy; runpy.run_path(r'<worktree>/Taierzhuang1938/_import/Script_BakeTrenchSurface.py')"
node scripts/Script_BlenderMcp.mjs stop
node scripts/Script_BlenderMcp.mjs status --scan
```

石材来自 [Poly Haven Rock Boulder Dry](https://polyhaven.com/a/rock_boulder_dry)，CC0；摄影 Dimitrios Savva、处理 Rico Cilliers。`_import/Script_ImportTrenchMaterials.py` 从官方 API 获取源文件并转换为游戏 WebP：Base 1024²、Normal/ORM 512²；Base 使用 sRGB，其余使用线性数据，法线为 OpenGL 方向。基础泥土为 Rob Tuytel 制作的 Brown Mud 02（CC0）；扫描的 AO/粗糙度/位移重新打包为 Orh。草簇、石块几何及附加泥土高度遮罩由本仓重建脚本生成。

## 形变与验证

地表、土块、碎石和枯草都登记到 TerrainDeformationView。装饰物必须裁除所有朝向的三角形，包括向下的叶片与石块底面；仅裁向上三角形会留下悬空残片。每次 Flush 更新受影响范围的接触网格；Reset 恢复基底高度与原始几何。装饰物不另造可行走平面或修改 NPC 导航。

根毯的 map alpha 同时接入 Prepass 的 normal/depth 与 velocity 裁切，自动取源材质贴图、UV0 变换、alphaTest 和 opacity，保留对象原有回调。`MotionVectorContractTest` 增加半透明孔洞夹具的像素覆盖与实际运动检查；不是把世界植被标记为前景或排除速度。独立 alphaMap / 其它 UV 通道不属于此次新增支持范围。

`FirstLevelMissionFortificationsTest` 将已经过期的“圆柱根数量 / 15 万土块三角”断言改为实际根毯与嵌石存在，并对三种装饰的合计设置 115 万三角、64 个分区网格上限；不能只统计土块而漏掉草。

静态门禁：`Script_TrenchSurfaceTest.mjs`（源网格隔离、非单位网格更新/重置、模型方向及资产约束）、`Script_TerrainLayersTest.mjs`、`Script_ModuleGraphTest.mjs`。浏览器门禁：`Script_SamplerBudgetTest.mjs --only=firstLevel` 覆盖 low、medium + GI、ultra + GI，并确认湿泥、碎石和弹坑变体真实编译；形变走 `Script_CraterSurfaceTest.mjs`。资产还通过 `Script_AssetStandardsTest.mjs`。

材质诊断沿用地形已有的 `?terrainView=` 入口：4 湿润度、5 粗糙度、6 石土混合权重；不是后期 Debug Rendering 的新 pass。实际截图、材质诊断和爆炸取证只保存在本地忽略目录，不进入 Pages 仓库。关卡仍有白盒建筑；这些表面改动不能作为整场景已达到参考图画质的证明。
