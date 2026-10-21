# PatchedTimberBed

完整床资产版本 `20261021NaturalTimberV6`：**58,951 三角面、6 网格／材质／绘制、13,118,916 字节**。用户本轮授权上限为整床 **60,000 三角面**，包含被里、草席承托、缝线和真实木损。GLB SHA256：`94ef1e53a6532b764d61cc3405c62dccd692af3b4fb8c1e3acafeb907266da10`。完整身份及坐标见 [Data_Asset.json](Data_Asset.json)。

本轮修正木架 UV 拉伸及灰色被面的材质、三角面痕迹。真实 ManagedGLTFLoader/WebGL 的 9 个视角、拖动缩放、棋盘格检查、独立 UV Jacobian 审计、42 点接触、源工程冷开和输入哈希检查通过。验收网页、截图、对照模型与报告只在忽略目录 `tmp/BedUvCloth60kAcceptance/`，不随仓库发布。

## 木架 UV

上一版把物理 **2.6 × 0.28 米**映射到约 **1472 × 1984 像素**的共享区，纵横像素密度相差约 12.5 倍；倒角附近逐面选择横向投影轴还会产生不连续采样。

新侧纹区是 **1472 × 1472 像素 / 0.64 × 0.64 米**，两方向均为 **2300 texel/m**。木材沿构件长轴及矩形截面周长连续展开，保留原来源／破损标签，另用 UV 成员标签管理坐标。纹理周期边界在真实网格上切分，避免三角面跨越 UV 首尾；纹理沿长轴周期化并外扩 **16 px gutter**，消除白边和重复接缝漏色。

最终木架为 **9,534 三角面**：减面后 8,100，UV 接缝切分增加 1,434。Base 2048、OpenGL +Y Normal 1024、ORM 512，单材质。端面保留独立图区，铁件／木销使用专用中性区。

独立读取最终 GLB，按世界三角面积加权计算实际纹理像素 Jacobian：侧面拉伸比 P95 从 **12.533 降至 1.308**，P99 为 **1.595**，比例大于 4 的侧面面积约 **0.019%**。这些小区域位于切口、倒角等复杂面，不宣称全局严格等距。棋盘格侧纹单格 20 mm，端面约 20 mm。

本版进一步更换了木纹底图：旧程序纹理本身的长条柔化仍会产生拉丝观感，单纯修 UV 比例不能解决。新的 [Texture_BedAgedTimberSource.png](Texture_BedAgedTimberSource.png) 保留局部纹理转折、木眼及短孔隙细节；原图由内置 imagegen 生成，完整提示词与处理记录见 [Data_TimberTextureSource.json](Data_TimberTextureSource.json)。周期加平滑分解只处理拼接连续性，不对图像作方向性拉伸。微法线来自细节亮度残差约 70 µm RMS 的艺术高度近似。

本次木纹替换未改变网格或 UV；与上版 58,951 面 GLB 比对，其余五组件（包含已修正被面）的几何、法线、UV、颜色及材质语义精确不变。

## 被面

保留原 Quilt 承托底层及其他补片共 **4,903 三角面**，只重建可见来源分区 **6 / 7 / 9**，分别分配 **11,200 / 7,600 / 1,400** 三角面，最终 Quilt **25,103 三角面**。分区独立处理，保留覆盖层和缝边；未重新生成草席接触体或下拉可见外壳。

旧法线被替换，颜色中的大块明暗团被压低，同时保留修补片色相。新的角度展开图按真实表面积独立缩放，所有布面 PBR 图共同使用 `UVMap.001`（运行时 UV1），物理周期 **0.35 米**。面积加权 UV 各向异性 P99 约 **1.069**。细织纹、磨毛和轻微污渍由独立底色承载，主要褶皱由几何承担。

棉布原图为内置 imagegen 生成的 [Texture_BedAgedCottonSource.png](Texture_BedAgedCottonSource.png)，**1254 × 1254**，原始 RGB 像素保留；完整提示词、哈希与处理记录见 [Data_CottonTextureSource.json](Data_CottonTextureSource.json)。Normal 1024、ORM 512；微法线从移除 5 px Gaussian 后的细纤维亮度残差派生，使用约 45 µm RMS 的艺术高度近似。它不是标定的扫描 PBR 数据。

## 保留与验证

- BS 脚端布料、Pillow、Sewing、Straw 四组件的世界三角、节点变换、法线、UV、颜色及材质渲染语义逐值保持；图像编码字节和解码 RGBA 哈希独立比对通过。
- 42/42 接触点通过原 **±2 mm** 门槛，实测间隙约 **0.250 mm**。承托底层保持；采样与目视不构成全表面零相交证明。
- 原 7 构件、10 处真实木损保留。163 个保护点及切面内部探针对最终 GLB 检查通过，最大切面距离约 **0.045 mm**。
- glTF PBR、有效法线、有限坐标、米制轴心、17 张内嵌图像、6 draw 与零近零面积三角通过检查，世界面积叉积门槛仍为 `1e-12`。
- 灰布近景与木架接头均重新观察，检查器使用同一几何和相机替换材质。预览保留投影；此前的横向 shadow acne 通过收紧阴影相机和调整 bias 修正。

## 加载

使用 `Taierzhuang1938/Script_ModelImports.mjs` 的 `ManagedGLTFLoader` 原生 PBR 路径。单位米、Y 向上、X 为床长、Z 为床宽、+X 脚端，轴心位于地面和整床 XZ 中心。

消费者须保留 `COLOR_0`、UV1、`KHR_texture_transform`、`EXT_texture_webp`、采样器和法线通道，不用统一 WoodBeam 材质覆盖，也不用仅 position/normal/uv 的合批格式丢弃属性。BS Base 和 Normal 的 UV1 变换、原始 WebP 字节仍保持。本资产独立交付，未添加关卡布设。

## 源工程与重建

源根目录：`C:/Users/Bentl/OneDrive/AI/Models/Blender/PatchedTimberBed20261020/`。

根目录只保留 `Scene_PatchedTimberBedHigh.blend` 和 `Scene_PatchedTimberBedGame.blend` 两个工程；High 保留密集来源几何及来源材质，Game 保存最新 UV／材质和 60k 内表示。全部 Inputs 保留，六项只读输入哈希不变。当前 Bakes、Scripts、棉布原图和幂等木损收据是必要重建资料。

核心配方是 [SurfaceRevision](Script_PatchedTimberBedSurfaceRevision.py)、[Bake](Script_PatchedTimberBedBake.py) 和 [Quilt](Script_PatchedTimberBedQuilt.py)，脚本同时复制至外部源目录并嵌入工程 Text。Frame 原始破损几何仍由独立 WoodDamage 配方管理。

本轮实际执行并验证从 High／Game 增量重建的 `uv-cloth` 阶段：

```powershell
node Model/PatchedTimberBed/Script_PatchedTimberBedRebuild.mjs --stage=uv-cloth --review-root=tmp/BedUvCloth60kAcceptance
```

默认 `all` 先从只读 Inputs 完整重建基础床，再串接 `uv-cloth`，本轮未从头整条重跑。接触预算前的真实 Mesh/BMesh 校验 fixture 在上一版已验证，50k 基础阶段及最终 60k 门槛均保留。标准临时 GLB 在成功封装后删除，transfer 工程在载入后删除，自动 `.blend1` 关闭。

```powershell
node Model/PatchedTimberBed/Script_PatchedTimberBedTest.mjs --comparison --original=tmp/BedUvCloth60kAcceptance/Model_PreviousBed.glb --out=tmp/BedUvCloth60kAcceptance --max-triangles=60000 --url=http://127.0.0.1:8125
node Model/PatchedTimberBed/Script_PatchedTimberBedContactTest.mjs --report=tmp/BedUvCloth60kAcceptance/Data_ContactReview.json
node scripts/Script_BlenderMcp.mjs status --scan
```

[本轮本地预览](http://127.0.0.1:8125/tmp/BedUvCloth60kAcceptance/index.html)，选择“接头端纹”或“布面近景”。历史旧木参考为 [旧榆木实物](https://www.chairish.com/product/6368349/antique-shanxi-province-elm-opium-daybed) 与 [木材劈裂端面](https://unsplash.com/photos/a-piece-of-wood-that-has-been-cut-in-half-2fDOcq3vW5k)；造型属于创作复原。
