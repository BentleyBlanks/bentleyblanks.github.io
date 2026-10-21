# Patched Timber Bed

补片棉被木床，版本 `20261022WovenMatWornEdgesV7`。完整 GLB 仍以 **60,000 三角面、6 材质／6 primitive** 为硬上限。当前版本的准确面数、哈希与尺寸见 [Data_Asset.json](Data_Asset.json)。

这轮按用户标出的柱顶、木架与草席重做：

- 柱顶使用可读的多孔端纹、年轮与干裂，替换近乎纯棕色的旧端纹。四个端纹区与侧纹各有独立图集窗口，保留米制 UV 与 16 像素外扩。
- 24 个可见木构件沿原尺寸和姿态建立圆钝截面，边缘半径 2.2–3.8 mm，主要构件端部也倒圆。顺纹缺角与开口干裂使用真实切除。游戏网格完整保留这些可见表面；减面集中在隐藏承托木条，避免再次吃掉倒角和裂口。
- 草席以连续、磨旧的编织 BaseColor 打底，配套法线与粗糙度；外围使用五边截面的圆草梗、绑线和少量短断纤维。明确替换旧的刀片状减面草片。原角色 0/1 承托核心及其顶点保留。
- 被子、枕头、缝线和 BS 脚端布料通过最终 GLB 的独立几何、法线、UV、颜色及材质比对；枕头接缝和底边另做近景检查。

这是创作复原，并非某一文物的精确扫描。

## 材质源

草席与端纹通过内置 imagegen 生成，原图和完整提示词随资产保存：

- [Texture_BedAgedStrawSource.png](Texture_BedAgedStrawSource.png) ／ [提示词与来源](Data_StrawTextureSource.json)
- [Texture_BedAgedEndGrainSource.png](Texture_BedAgedEndGrainSource.png) ／ [提示词与来源](Data_EndGrainTextureSource.json)
- 侧面木纹与棉布继续使用已有 [木纹源](Data_TimberTextureSource.json) 和 [棉布源](Data_CottonTextureSource.json)。

生成源图经过米制映射、边界处理和 PBR 制作；运行时使用 GLB 内嵌图像，不依赖外部纹理请求。保留 COLOR_0、UV1、KHR_texture_transform、EXT_texture_webp 和各材质法线通道，不能用统一木材材质覆盖。BS 的 Base/Normal 原始 WebP 字节与 UV 变换保持。

## 工程与重建

外部工程根目录：`C:/Users/Bentl/OneDrive/AI/Models/Blender/PatchedTimberBed20261020/`。

仅保留最终 High／Game 两个 `.blend` 工程，以及 Inputs、当前 Bakes 和 Scripts。High 保留密集布料源及新木架几何；Game 保存完整最终 UV/PBR。六项 Inputs 哈希保持不变。木架每次从只读 checkpoint 重新构建，避免叠加破损。

```powershell
node Model/PatchedTimberBed/Script_PatchedTimberBedRebuild.mjs --stage=craft --review-root=tmp/BedCraft60kAcceptance
```

默认 `all` 依次执行基础重建、`uv-cloth`、`craft`。本轮实际验证的是 `craft` 增量阶段，未重新从头执行整条 `all` 链路。核心实现见 [Craft](Script_PatchedTimberBedCraft.py)、[SurfaceRevision](Script_PatchedTimberBedSurfaceRevision.py) 和 [Bake](Script_PatchedTimberBedBake.py)，配方同时复制到外部 Scripts 并嵌入工程 Text。

```powershell
node Model/PatchedTimberBed/Script_PatchedTimberBedTest.mjs --comparison --original=tmp/BedCraft60kAcceptance/Model_PreviousBed.glb --out=tmp/BedCraft60kAcceptance --max-triangles=60000 --url=http://127.0.0.1:8125
node Model/PatchedTimberBed/Script_PatchedTimberBedContactTest.mjs --report=tmp/BedCraft60kAcceptance/Data_ContactReview.json
node scripts/Script_BlenderMcp.mjs status --scan
```

数值验收包括完整面数／绘制数、零退化三角、UV 拉伸、42 点接触、四个冻结组件，以及冷读 High 表面与最终 GLB 的轮廓／切面距离。实际 ManagedGLTFLoader 验收涵盖 12 个视角及旋转、缩放，重点直接观察柱顶、接头、草席与枕头。接触采样不是全表面零相交证明。

[本轮本地预览](http://127.0.0.1:8125/tmp/BedCraft60kAcceptance/index.html)。验收网页、截图和诊断数据仅留本地忽略目录，不提交到站点仓库。坐标仍为米制、Y 向上、X 为床长、+X 脚端，轴心位于地面及整床 XZ 中心。
