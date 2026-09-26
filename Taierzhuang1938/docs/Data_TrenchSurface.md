# 通用壕沟表面：参考图 07

2026-09-26：在既有开挖高度场上增加湿泥、自然碎石和下垂枯草。入口是 `FirstLevelWhiteboxField.PrepareAssets / BuildWhiteBoxes`；参数统一在 `Data_TrenchSurface.mjs`。关卡路线、沟宽、沟深及碰撞高度保持原契约。

## 表面与接地

- 基础泥土采用 [Poly Haven Brown Mud 02](https://polyhaven.com/a/brown_mud_02) 的成套颜色、OpenGL 法线、粗糙度、AO 和位移数据，按源资产 1.3 m 尺度铺设，替换壕沟翻土层的推导数据；其它地层不变。
- 宏观土块继续使用 `BuildTrenchEarth`。四种局部泥块/浅压痕打包进 `Texture_TrenchMudHeightMask.png`：R 高度、G 边缘遮罩、B 积水倾向、A 缝隙 AO，全部是线性数据。近景最多六步高度视差，距离渐隐；高度梯度形成额外法线，湿润区域降低粗糙度并压暗反照率。投影采用连续三向混合，避免沟沿法线转折处出现硬边。
- 泥层通过表面补丁在光照前修改颜色、法线、粗糙度和材质 AO；不另铺透明发亮平面。湿地表接既有 SSR，AO 仍只直接作用于间接光，直射微阴影沿用材质框架。
- `TerrainContactField` 上传已有物理高度网格，着色器用相同的三角形对角线插值出高度和法线。碎石下缘按到地表的法向距离与噪声混入同一套泥土颜色、法线、AO 和粗糙度；接触不依赖摄像机深度。碎石几何沿真实坡面埋入，不能只把模型中心接地。
- 自然岩石 PBR 装入既有地形纹理数组的第 5 层，仍只占两只 array sampler；四层地形的权重和均值接口不变。高度场与泥层各增加一只 sampler；地形启用 SSR 后，最高画质 + GI + 弹坑变体为 16/16，普通湿泥/石土接触变体为 14/16。新增纹理前必须再跑 sampler 门禁。

这是适配现有 WebGL2 前向管线的材质内投影层与世界高度接触场，不是完整的 DBuffer 或运行时虚拟纹理系统。方法参考 [Unreal 的 decal 材质通道](https://dev.epicgames.com/documentation/unreal-engine/decal-materials-in-unreal-engine) 与 [Frostbite 的分层地形系统](https://www.ea.com/frostbite/amp/news/terrain-in-battlefield-3-a-modern-complete-and-scalable-system)。

## 模型、许可与重建

`Model_TrenchStone.glb` 是 80 三角的原创破碎石块，随机缩放/旋转后沿沟脚成簇布设；`Model_TrenchDryGrass.glb` 是 1320 三角的原创折叠草叶束，有直立短叶与弯曲下垂长叶。导出后的顶点云实测为 Y 向上、主要下垂方向为局部 -Z；运行时把 -Z 朝向沟心。均按空间分区交给 BuildSink 合批，草叶使用不透明双面几何，不产生透明排序或整片卡片轮廓。

可编辑工程保存于 `C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/TrenchSurface/Scene_TrenchSurface.blend`。重建入口 `_import/Script_BakeTrenchSurface.py`，通过仓库 BlenderMCP 生命周期脚本运行：

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

静态门禁：`Script_TrenchSurfaceTest.mjs`（源网格隔离、非单位网格更新/重置、模型方向及资产约束）、`Script_TerrainLayersTest.mjs`、`Script_ModuleGraphTest.mjs`。浏览器门禁：`Script_SamplerBudgetTest.mjs --only=firstLevel` 覆盖 low、medium + GI、ultra + GI，并确认湿泥、碎石和弹坑变体真实编译；形变走 `Script_CraterSurfaceTest.mjs`。资产还通过 `Script_AssetStandardsTest.mjs`。

材质诊断沿用地形已有的 `?terrainView=` 入口：4 湿润度、5 粗糙度、6 石土混合权重；不是后期 Debug Rendering 的新 pass。实际截图、材质诊断和爆炸取证只保存在本地忽略目录，不进入 Pages 仓库。关卡仍有白盒建筑；这些表面改动不能作为整场景已达到参考图画质的证明。
