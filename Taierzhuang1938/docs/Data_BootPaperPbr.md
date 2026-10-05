# 加载报纸的轻微褶皱材质

2026-10-06：11 期史料原图保持逐字节不变，每张独立生成一张 UV 对齐的 OpenGL +Y 法线，并烘出配套粗糙度。印刷文字和照片不转高度，不改史料内容。

- 清单与参数：`Data_BootPapers.mjs` 的 `BootPaperPbrUrls`、`BOOT_PAPER_PBR`；颜色沿用原图的 sRGB，Normal 与 RoughnessMask 均为线性数据。
- 路径：`Texture/Menu/BootPaper/Texture_BootPaper<id>Normal.webp`、`Texture_BootPaper<id>RoughnessMask.webp`。数据图长边 512，按原图宽高比缩放，不平铺；两者是无损 WebP。RoughnessMask 的 RGB 是同值粗糙度，A 是纸面覆盖，避免纸外黑底反光。黑色印刷用边界连通填充区分，不挖空正文与照片。
- 法线：内置 imagegen 每期独立调用，参考该期原图的位置与折线，禁止文字浮雕；烘焙消除中性紫偏色，归一化并限制斜率，运行时再乘 `normalScale`。粗糙度按纸面斜率与纤维变化派生，保持哑光范围；并非测量得到的材质参数。
- 源提示词与生成文件 ID：`_import/Prompts/Texture_BootPaperPbr.txt`。重烘：`node Taierzhuang1938/_import/Script_BakeBootPaperPbr.mjs --source-dir=<源PNG目录>`，源名 `Texture_BootPaper<id>Normal.png`；原图、源图和产物的 SHA-256 记在 `_import/TextureBakes/Data_BootPaperPbr.json`。UI 图保留非方形 UV，使用专用烘焙入口，不适用通用平铺 PBR 的定色、去光照与方形裁切。

## 运行时

原图 decode 后立即淡入，不等数据图。`Script_BootPaperSurface` 创建 OffscreenCanvas，`Script_BootPaperWorker` 在后台完成解码、编译和单 quad 绘制，使用三个采样器，漫反射与 GGX 非金属高光。原图自带的博物馆摄影光照保留，新增受光在正面归一，以免二次压暗。

每次仅请求抽中的一期：原图加该期两个数据图，新增下载约 187–318 KiB。全套磁盘约 2.28 MiB；纳入 ui 与目录预算，不加入全局开机 PBR_SETS。现有贴图导入器将 menu 数据图识别为线性 CPU 解码资产。

CSS 外层继续负责拖动倾斜和合成线程回正，内层同步漂移原图与 canvas。Worker 随倾斜改变法线朝向，以相同 cubic-bezier 回正；静止无持续帧循环，输出长边最多 1400、DPR 最多 1.5。不会阻塞加载链，加载拖动让路契约保持。UI 位于世界后期之外，不加入世界预通道或运动矢量。

`Hide` / `Dispose` 立即终止 Worker、释放 canvas 和观察器。贴图缺失、Worker / OffscreenCanvas / WebGL 不可用、加载超时或 context loss 时保留原图与文字；过期 decode 不重建已隐藏的材质。Dispose 也移除指针事件监听。

## 验证

`Script_BootPaperPbrTest` 检查 11 套唯一来源、原图哈希、法线单位长度、粗糙度范围与覆盖；逐期在真实 Worker/WebGL 中出图并核对只请求本期三个 URL。逐一替换法线和粗糙度验证像素确实变化；再验拖动、回正、移动端、失败回退和资源释放。截图仅存 `tmp/BootPaperPbr/`。

配套 `BootPaperTest`、`TextureStandardsTest`、`TextureImportTest`、`ModuleGraphTest`、`TestRunnerTest`、`BootPayloadTest`；真实加载流畅度 `BootInteractionTest`，发布入口 `BrowserBundleTest`，独立渲染门禁 `MotionVectorContractTest`。
