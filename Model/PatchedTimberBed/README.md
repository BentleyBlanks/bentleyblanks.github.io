# Patched Timber Bed

补片棉被木床，版本 `20261022M17CottonBoundReedsV9`。完整 GLB 为 **59,238 三角面、6 材质／6 primitive**，保持 60,000 三角面上限。哈希与尺寸见 [Data_Asset.json](Data_Asset.json)。

本轮以原始 `M17_C_编席补缀草床.png` 为主要形态和材质参考；来源路径与哈希保存在资产说明中。

- 木材调整为灰褐、干旧的哑光表面，保留独立端纹、米制 UV 和 16 像素图集外扩。连续坐标着色与面积／角度加权法线减轻三角亮块；端面和真实破口仍保留硬面。
- 24 个可见木构件保留 2.2–3.8 mm 圆钝边缘，本轮增加 12 处疏密不一的真实裂损和分段缺角。游戏网格保留可见表面，减面集中在隐藏承托木条。
- 草席换成细草梗成束、横向绑线的 BaseColor，并配套法线与粗糙度。几何补充卷边、绑线和散草，Blender -Y 正面有 52 根弯折散草，背面有 8 根；原角色 0/1 承托核心保持。
- 被子、BS 脚端布料和缝线使用同一连续形变，形成不等的侧缘短褶与自然垂坠。原始位置保存在 `M17CottonRestPosition` 属性中，重复运行不叠加形变。承托附近锁定，实际最大位移为 12.88 mm。
- 被子的 Base／Normal／ORM 使用原生 `KHR_texture_transform` 等比缩放 1.45，有效纹理周期约 0.241379 m；原 UV、颜色和图像像素保持。枕头通过精确比对保持原样。

这是创作复原，并非某一文物的精确扫描。

## 材质源

草席与端纹通过内置 imagegen 生成，源图和完整提示词随资产保存：

- 当前束草：[Texture_BedBoundReedSource.png](Texture_BedBoundReedSource.png) ／ [提示词与来源](Data_BoundReedTextureSource.json)
- 历史编织重建输入：[Texture_BedAgedStrawSource.png](Texture_BedAgedStrawSource.png) ／ [提示词与来源](Data_StrawTextureSource.json)
- [Texture_BedAgedEndGrainSource.png](Texture_BedAgedEndGrainSource.png) ／ [提示词与来源](Data_EndGrainTextureSource.json)
- 侧面木纹与棉布继续使用已有 [木纹源](Data_TimberTextureSource.json) 和 [棉布源](Data_CottonTextureSource.json)。

生成源图经过米制映射、边界处理和 PBR 制作；运行时使用 GLB 内嵌图像，不依赖外部纹理请求。保留 COLOR_0、UV1、KHR_texture_transform、EXT_texture_webp 和各材质法线通道，不能用统一木材材质覆盖。BS 的 Base/Normal 原始 WebP 字节与 UV 变换保持。

## 工程与重建

外部工程根目录：`C:/Users/Bentl/OneDrive/AI/Models/Blender/PatchedTimberBed20261020/`。

仅保留最终 High／Game 两个 `.blend` 工程，以及 Inputs、当前 Bakes 和 Scripts。High 保留密集原始布料重建来源及当前木架；Game 保存最终褶皱、rest-position 属性和完整 UV/PBR。六项 Inputs 哈希保持不变。木架每次从只读 checkpoint 重新构建，避免叠加破损。清理仅涉及冷读 High／Game 均不引用的中间烘焙图。

```powershell
node scripts/Script_BlenderMcp.mjs start
# 使用 start 返回的本任务端口；本轮端口为 9878。
node Model/PatchedTimberBed/Script_PatchedTimberBedRebuild.mjs --stage=reference-fidelity --review-root=tmp/BedReferenceFidelityAcceptance --mcp-port=9878
node scripts/Script_BlenderMcp.mjs stop
```

默认 `all` 依次执行基础重建、`uv-cloth`、`reference-fidelity`，最后一阶段复用 `craft` 的木架构建流程。本轮通过本任务的 live BlenderMCP 验证了 `reference-fidelity` 增量阶段，未从 Inputs 重跑整条 `all` 链路；`--mcp-port` 仅用于单阶段执行。核心实现见 [ReferenceFidelity](Script_PatchedTimberBedReferenceFidelity.py)、[Craft](Script_PatchedTimberBedCraft.py) 和 [Bake](Script_PatchedTimberBedBake.py)，配方同时复制到外部 Scripts 并嵌入工程 Text。

```powershell
node Model/PatchedTimberBed/Script_PatchedTimberBedTest.mjs --comparison --original=tmp/BedReferenceFidelityAcceptance/Model_PreviousBed.glb --original-label=上版 --out=tmp/BedReferenceFidelityAcceptance --max-triangles=60000 --url=http://127.0.0.1:8125
node Model/PatchedTimberBed/Script_PatchedTimberBedContactTest.mjs --report=tmp/BedReferenceFidelityAcceptance/Data_ContactReview.json
node scripts/Script_BlenderMcp.mjs status --scan
```

数值验收包括完整面数／绘制数、零退化三角、UV 拉伸、42／42 点接触、布料逐角 UV／颜色签名与实际位移、枕头精确比对，以及冷读 High 木架与最终 GLB 的表面距离。木纹面积加权 UV 各向异性 P95 为 1.226；17 张 packed 图像可冷读解码。实际 ManagedGLTFLoader 验收涵盖 14 个视角及旋转、缩放，包括原图构图、脚端散草、柱顶和布料近景。接触采样不是全表面零相交证明。

[本轮本地预览](http://127.0.0.1:8125/tmp/BedReferenceFidelityAcceptance/index.html)。验收网页、截图和诊断数据仅留本地忽略目录，不提交到站点仓库。坐标仍为米制、Y 向上、X 为床长、+X 脚端，轴心位于地面及整床 XZ 中心。
