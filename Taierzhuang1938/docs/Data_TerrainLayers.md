# 分层地形材质（2026-09-17）

2026-09-26：翻土层 SpoilEarth 已按[概念图 07 通用壕沟](Data_TrenchReference07.md)更新，使用新的内置 imagegen 源图与烘焙参数。其余三层、四层数组结构、采样器及高度场保持不变；下文翻土图的 Lovart 来源与旧标定值属于 2026-09-17 历史。

第一关《往南的路》地面的唯一现状文档。实现：`Script_TerrainMaterial.mjs`；数值：`Data_Tuning_Terrain.mjs`；
splat 权重：`Data_FirstLevelMissionTerrain.SampleMissionGroundSurface`；贴图烘焙：`_import/Script_BakeTerrainLayers.py`；
离线闸门：`Script_TerrainLayersTest.mjs`。

## 1. 为什么换（远处马赛克）

原来的地面是**一张** 2 m 平铺的土壤 PBR（`Texture_MissionSoil*`，见 [壕沟与土壤 PBR](Data_TrenchTerrainPbr.md)），
在 342 × 732 m 的地块上重复约四百遍。站在铁路边朝西看，远处一排排横纹，动起来颗粒在爬。实测原因三条：

1. **贴图不严格无缝**：左右边缘相邻像素差 0.095，图内相邻像素差 0.070。平铺四百遍后，每 2 m 一条接缝线在掠射角下压成横纹。
2. **高频细节欠采样**：法线与 AO 的颗粒远处一个像素盖几十个纹素，关 TAA 取亚像素移动前后两帧，远处亮度跳动明显。
3. **顶点色叠了一条规则正弦**（`0.94 + 0.06·sin(0.37x)·sin(0.29z)`，周期 17 m / 22 m），远处本身就是一张格子。

## 2. 方案：成熟的分层地形材质

对标 UE Landscape / Unity HDRP TerrainLit 那一族，逐项对应：

| 做法 | 对标 | 这里的取舍 |
|---|---|---|
| splat 权重 + 高度混合 | UE Layer Blend（Height Blend）/ Unity TerrainLit | 权重存顶点属性 `terrainLayers`（0.75 m 一格足够），零采样器 |
| 纹理数组 | Far Cry 5 / HDRP 的 Texture2DArray | 两张 `sampler2DArray` 替掉 map / normalMap / roughnessMap 三张 |
| 远近两套平铺 | UE 的 Distance Blend | 9 m 起混入远景平铺，34 m 后近景取样整段跳过；远近边长非整数倍 |
| 宏观变化 | UE Macro Variation | 三档值噪声（7.3 / 31 / 117 m）调亮度、色温、湿斑，零采样器 |
| 去重复 | Quilez「Texture Repetition」第三法 | 低频噪声切整数偏移，交界两份做**方差保持混合**（Heitz & Neyret 2018） |
| 远处法线淡出 | 通行的 normal distance fade | 6 m 起淡出，120 m 处剩 30% |
| 远处对比度淡出 | 同上一族的 far detail fade | 反照率高频明暗 10 m 起往该处混合均值收，50 m 处剩 30%（均值不变） |
| 陡坡 | Biplanar（Quilez）+ UDN 三平面法线（Golus 2017） | 只做俯视 + 主导侧面，45 m 内；沟壁不再被俯视投影拉成竖条 |

几何（0.75 m 规则网格、72 m 分块）**没动**：渲染、Rapier、角色与弹坑共用同一份三角高度采样（项目契约 5），
「马赛克」是着色问题，不是几何 LOD 问题。

### 2.1 四个图层

| 层号 | 图层 | 近 / 远平铺（米） | 权重来源 |
|---|---|---|---|
| 0 | FieldSoil 底土 | 2.0 / 11.3 | 其余三层分完剩下的 |
| 1 | CartTrack 车道硬地 | 3.1 / 16.9 | 顶点 r：道路走廊 + 站台 / 院落平台 |
| 2 | DryStubble 枯草茬 | 2.3 / 12.7 | 顶点 b（离道路、壕沟、平台、铁轨 3.5 m 以外才允许）× 宏观噪声阈值 |
| 3 | SpoilEarth 翻土 | 2.1 / 11.9 | 顶点 g：壕沟底、沟壁与沟沿外 0.8 m 的堆土 |

顶点色退回只管铁轨旁的道砟灰；原来道路提亮、壕沟压暗的调色改由图层本身表达。

## 3. 接进渲染管线

### 3.1 表面补丁

材质补丁注册表多了一个 **surface 槽**（`IndirectLightingPatches` 列表最前，占 ORM 那一路的位置），
`MaterialLibrary.InjectSurface(material, patch)` 挂上。地形材质**不挂** map / normalMap / roughnessMap：

| 锚点 | 写什么 |
|---|---|
| `<map_fragment>` | 四层采样、高度混合、侧投影、宏观变化，一次算完；写 `diffuseColor` 与全局量 |
| `<roughnessmap_fragment>` | `roughnessFactor` |
| `<normal_fragment_maps>` | `normal`（视空间） |
| `<aomap_fragment>` | 材质 AO 压间接光，与 ORM 补丁同口径（强度 0.72），早于 GTAO |

它自己声明并写 `gMaterialAo`，着色升级那一路的微阴影照常读；POM 与细节法线对地形不编
（地形有远近两套平铺与法线淡出，POM 高度在原来的土壤法线图里本来就不存在）。

着色器里**不许**按变量下标取向量分量或 uniform 数组：ANGLE-D3D11 会把它模拟成函数调用
（编译日志 `dynamic indexing of vectors and matrices is emulated`）。四层的代码由 JS 展开成常量下标。

### 3.2 与砸坑地表共存

`Script_TerrainDeformationView.ConfigureCraterSurface` 不走注册表，自己在源材质钩子跑完后做字符串替换，
代码总是紧贴 chunk、排在所有补丁之前。表面补丁在同一锚点上**整值写**粗糙度与法线，会把坑里的改动盖掉。
所以表面补丁每个锚点末尾留 `SurfacePatchEnd(anchor)` 标记，坑的代码走 `InsertAfterSurfacePatch` 插到标记之后；
没有表面补丁的材质找不到标记，退回紧贴锚点，生成的 GLSL 逐字节不变。

新建的坑瓦片同样带 `terrainLayers` 属性，由 `field.SampleGroundSurface` 在瓦片首次绘制时一并算出；
切地块用的 `CutTerrainRectangles` 按 Float32 复制所有属性，所以 `terrainLayers` 必须是 Float32。

### 3.3 采样器与分档

地形材质比原来的土壤 PBR **少两个采样器**：去掉 map / normalMap / roughnessMap / 细节法线四个，加两张数组。
实测（`Script_SamplerBudgetTest.mjs` 的三次第一关装载）：地形 12、砸坑变体 14（medium / ultra，gi=1）；
low 分别是 8 / 10。那三次装载同时断言地形程序与砸坑变体真的编出来了。

| 档位 | 去重复双采样 | 陡坡侧投影 |
|---|---|---|
| low | 关 | 关 |
| medium | 开 | 关 |
| high / ultra | 开 | 开 |

加载失败（超时、404）时 `PrepareAssets` 退回原来的单张土壤 PBR 与旧顶点色，关卡照常建成。

### 3.4 调试视图

`?terrainView=1` 权重（红车道 / 绿草茬 / 蓝翻土 / 灰底土），`2` 宏观变化前的混合反照率，`3` 世界法线。
页面里可直接改 `Script_TerrainMaterial.TERRAIN_DEBUG_UNIFORM.value`，不重编译。

## 4. 贴图

### 4.1 来源

**底土沿用仓库里已经在用的第一关土壤图**（`Texture_MissionSoilBase.webp`，2026-09-16 imagegen，来源见
[壕沟与土壤 PBR](Data_TrenchTerrainPbr.md)），只重做无缝、低频/行列拉平与法线/AO/粗糙度。远处马赛克是平铺方式的问题，
不是这张图的问题；它近看有卵石和草梗，比新生成的细土耐看（新生成的 FieldSoil 近看发糊，量过后弃用，源图留本地）。

缺的三层（车道、草茬、翻土）是新生成的。用户指定「用 Cursor CLI 的 grok 生成」：本机 Cursor 3.18.9 的
`cursor agent` 子命令没有无头出图入口，`cursor-agent` 可执行文件也未安装，因此按仓库生图顺序执行——第 1 级
Codex 内置 imagegen 当天额度用尽（`You've hit your usage limit`，到 2026-09-19），降到第 2 级 **Lovart**，
每张一个新会话（活跃项目 `oKHfWa1O2A`），没有触发付费确认。源图 `Gen_<Layer>.png`（1024²）只留本地
`_shots/TerrainLayers/Source/`。

提示词公共部分：

> Generate one image. Use case: production game terrain albedo texture. Square 1024x1024. A strictly top-down orthographic photographic texture scan of a {size} metre by {size} metre patch of {material} Location and period reference: rural plain near Tengxian, southern Shandong, North China, March 1938, early spring, dry season. Lighting: completely flat, even, shadowless overcast diffuse light, like a delit photogrammetry albedo; no cast shadows, no directional sunlight, no specular highlights, no vignetting, no perspective, no camera tilt. Uniform overall brightness and colour across the entire frame with NO large blotches, NO gradients and NO dominant single features, because the texture will be tiled hundreds of times on a large terrain. The image must tile seamlessly: the left edge continues perfectly into the right edge and the top edge into the bottom edge. Isotropic, no rows, no stripes, no directional marks. No text, no labels, no borders, no frames, no objects, no tools, no footprints, no tyre tracks, no people, no animals.

各层 `{size}` / `{material}`：

- FieldSoil 2.5：dry compacted fallow field earth: muted grey-brown silty loess loam, fine crumbly soil aggregates and tiny clods, very fine grit, a few scattered tiny pebbles, sparse short broken dry plant stems, faint hairline dry cracks. No grass cover.
- CartTrack 3：hard-packed dusty dirt cart road surface: pale grey-beige compacted silt, smooth trampled and slightly polished earth with fine loose dust, scattered small gravel and grit, subtle shallow scuffs. No grass, no ruts, no wheel lines.
- DryStubble 2.5：winter farmland edge: dry grey-brown soil partly covered by sparse short dead winter grass, flattened pale straw-coloured dry grass blades, weed stubble and dry leaf litter, a few tiny early green shoots, roughly forty percent vegetation cover evenly scattered.
- SpoilEarth 2：freshly dug trench spoil earth: loose clumpy slightly moist dark umber brown soil, broken clods from 2 to 8 centimetres with crumbly edges, small stones and a few pale root fragments, darker and slightly more saturated than dry field soil.

生成图是近似材质输入，不是实测扫描。

### 4.2 烘焙（`_import/Script_BakeTerrainLayers.py`）

只生成反照率，法线 / AO / 粗糙度 / 高度都从同一张高度场推，四张图逐像素对齐、法线约定由脚本定死：

1. **低频拉平**：周期边界 FFT 低通（σ 90 px）逐通道除掉。
2. **无缝**：半图偏移交叉淡化，掩码沿中尺度噪声等值线走，只让高度差轻推一把，交界带做方差保持混合。
   **不要让高度差主导**：「谁高谁在上」等于在过渡带里挑亮的那份，第一版因此每张图边缘一圈亮 4%，平铺后就是网格。
3. **行列拉平**：逐行、逐列均值除以自身 21 px 周期滑动平均。一行略暗的像素平铺几百遍就是一条横纹，
   σ 90 的低通管不到 20–60 px 宽的带子（旧土壤图本身带 4% 的边带亮度起伏，就是被这一步拉平的）。
4. **定色**：sRGB 均值与亮度标准差拉到层表目标（色相按旧地面在线性空间 b/g ≈ 0.5 对齐）。
5. **高度**：亮度两档带通（细颗粒 + 土块）归一化。
6. **法线**：x = −∂h/∂列、y = −∂h/∂行，按米换算坡度；着色器 uv = 世界 (x, z) / 平铺、`flipY = false`，
   扰动向量直接是 `vec3(n.x, 0, n.y)`。AO 取腔体遮蔽，粗糙度随高度微调。

产物（进仓库）：`Texture/Texture_Terrain<Layer>Base.webp`（1024²，sRGB）、`…Normal.webp` 与 `…Orh.webp`
（512²，R = AO、G = 粗糙度、B = 高度；地形没有金属，M 位换成高度）。四层合计 2.32 MB，
预算与尺寸由 `Script_TerrainLayersTest` 守。脚本每层打印两个平铺指标：`border`
（图边带与图内的局部对比度之比，现为 0.970–0.992）与 `swing`（亮度随「离图边距离」的起伏，现为 0.2–0.7%）。

### 4.3 亮度标定

旧 ORM 的 AO 几乎是常数 0.75（烘焙时 R 下限 190）。微阴影把它变成直射光约 −30%、间接光再 −18%。
新图是真实腔体 AO（均值 0.87–0.93），同样的反照率画面整体亮 9.1%：开阔地 12 个点俯视 0.55 rad，
天空像素逐位相同的条件下实测。没有照抄一张常数假 AO，而是在 `TERRAIN_SETS.MissionPlain.albedoScale`
统一乘 0.87 标定。定稿（底土换回卵石土、加对比度淡出之后）同一组 12 点：**−0.2%**，逐点 −10%…+6%
（宏观变化本来就让各处明暗不同）。改图或改 AO 之后重新做这组抽样。

## 5. 实测

### 5.1 远处马赛克（关 TAA，2560×1080，high）

指标：`shimmer` 为相机偏 0.27 px 前后两帧的平均亮度差；`streak` 为地面带逐行均值去掉慢变化后的标准差；
`grain` 为亮度减 3 px 模糊后的标准差。都除以带内平均亮度，只在远处地面带里量。
基线为未改动的 `33fd1e4dd`，同机、同机位、同一把尺子。

| 机位 | shimmer 旧 → 新 | streak 旧 → 新 | grain 旧 → 新 |
|---|---|---|---|
| 铁路边朝西（用户截图同角度） | 0.0154 → 0.0162 | **0.0200 → 0.0070** | **0.0496 → 0.0393** |
| 开阔地朝南（30–60 m 带） | 0.0172 → 0.0192 | 0.0024 → 0.0028 | 0.0435 → 0.0610 |
| 俯视 10° 近中景（10–20 m 带） | 0.0290 → 0.0309 | 0.0082 → 0.0068 | 0.0767 → 0.0837 |
| 壕沟远景 | 0.0196 → 0.0194 | **0.0055 → 0.0029** | 0.0512 → 0.0505 |

用户截图那个角度的横纹降 65%、颗粒降 21%；壕沟远景横纹降 47%。近中景（10–20 m）保留卵石土本来的颗粒，
与旧地面同一量级——这是有意的取舍：只用新生成的细土时那里 grain 0.056、shimmer 0.022，但近看发糊。
开阔地朝南 30–60 m 的 grain 升高来自远景平铺把卵石放大 5.65 倍；开 TAA 的对照图上看不出网格或条纹，
对比度淡出已压到 30%，再压就是把近处也抹平。

### 5.2 帧开销

`Script_FirstLevelFrameProbe --strict --views=front,frontEast --rounds=3`（3394×1348、high、dt = 0），
旧树 `--root=<基线>` 与新树**交替**各两轮（A B A B），RTX 4070 SUPER / ANGLE-D3D11。

| 机位 | main GPU 旧（两轮） | main GPU 新（两轮） | main ÷ shadow/c0 旧 | main ÷ shadow/c0 新 |
|---|---|---|---|---|
| front（机枪位朝北，地面占大半屏） | 6.45 / 5.18 ms | 4.79 / 4.66 ms | 1.87 / 1.99 | 2.01 / 2.07 |
| frontEast（沿交通壕朝东） | 6.27 / 4.57 ms | 5.50 / 4.21 ms | 2.05 / 1.94 | 2.07 / 2.25 |

draw call 与三角数两边完全相同（557 / 1.57 M，555 / 1.54 M）。同机另有负载，阴影 pass（与地形材质无关）
轮与轮之间同样浮动 30%，绝对毫秒数不能直接比；用 shadow/c0 归一后主通道约贵 5–8%，折合约 0.3 ms。
这组是在加对比度淡出之前量的；之后片元里只多一次三项加权与一次 smoothstep，没有新的纹理取样。

## 6. 验收入口

```powershell
node Taierzhuang1938/Script_TerrainLayersTest.mjs
node Taierzhuang1938/Script_SamplerBudgetTest.mjs --only=firstLevel
node Taierzhuang1938/Script_FirstLevelMissionFortificationsTest.mjs
node Taierzhuang1938/Script_CraterSurfaceTest.mjs
node Taierzhuang1938/Script_ModuleGraphTest.mjs
```

`FirstLevelMissionFortificationsTest` 断言地面材质契约：两张数组（1024²×4 sRGB / 512²×4 非颜色）、
不再绑 map / normalMap / roughnessMap、每个地块都有 `terrainLayers` 与顶点色。

## 7. 已知边界

- 只接了第一关（`MISSION_LAYOUT.ground.terrainLayers`）。别的场景要用，给布局补一个 `SampleGroundSurface` 与一套图层。
- 高度只用于图层混合，没做位移或 POM；碰撞面不变。
- 陡坡侧投影只取主导侧面，沟壁转角 45° 附近会看到两个侧面的分界（已用 smoothstep 过渡，近看仍可辨）。
- 地形的远景（地块边界外）不在本次范围。
