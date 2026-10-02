# 贴图管理与发布导入

2026-10-03：游戏「设置与工具 → 编辑器 → 贴图管理」打开独立窗口，再次点击复用窗口；关闭游戏编辑器不关闭贴图窗口，也不改变当前编辑器状态。可直接打开 `TextureManager.html`，入口不启动游戏；本地运行 `node scripts/Script_LocalPreview.mjs --no-open` 后访问 `/Taierzhuang1938/TextureManager.html`。

## 使用

- 普通贴图清单来自 `Data_TextureManifest`，当前 267 张独立 PNG/JPEG/WebP。最大边长 32–16384，默认只缩小且保留比例；NPOT 转换是显式选择的例外，可按最近／向上／向下的二次幂重采样。
- 「重新导入并预览」调用与发布相同的编码器，显示源图与结果、实际文件字节、尺寸；KTX2 由本机 GPU 解码，显示压缩格式、mip 层数与纹理数据显存。RGB、RGBA、单通道与 1:1 像素查看共用。
- 预览使用窗口剩余高度；「放大预览」隐藏两侧面板，Esc 恢复。Mipmap 选择器查看实际编码层级；压缩图保留完整 GPU mip 链并以显式 LOD 取样，不把末层压缩块误当成独立纹理。
- 「保存发布配置」写入 `Data_TextureImportSettings.json`。只有显式覆盖的文件进入 `textures`；恢复默认会删除此条。每次 Pages 发布自动应用已提交的配置，不需要手动改消费代码。
- 配置有 JSON 导入／导出，未保存草稿留在当前浏览器；保存使用内容版本检查，另一窗口改过配置时拒绝覆盖。线上静态 Pages 可查看／导出配置；本地服务提供写回与真实编码预览。
- 列表勾选或「选择筛选结果」后可把当前图全部设置应用到所选，消费方式不兼容的图片跳过并列明。Revert 只撤销当前图未保存修改；恢复默认删除当前图覆盖。
- 程序化页列出 50 套 `RECIPES` 和 DetailNormal、SkinLut，只在选择时由 Worker 生成当前一套。支持通道及尺寸预览，切换时终止旧任务；不离线化运行时配方、不输出发布压缩设置。
- GLB 内嵌贴图暂不管理。图片中有运行时 CPU 处理、纹理数组或 DOM 消费的，仍支持文件格式与尺寸设置，但禁用独立 GPU 压缩和 Mipmap 开关，避免破坏其消费契约。

## Unity Importer 对应项

界面按 Unity 的类型、Alpha、高级、采样与 Mipmap、平台设置分组；当前浏览器或游戏管线未接入的项保留为灰色，并说明原因。灰色项不写配置、不宣称生效。

| 分组 | 已接入 |
| --- | --- |
| 类型与颜色 | Default、Normal Map、Editor GUI、Single Channel；sRGB／Linear；高度转法线、强度、前向差分／Sobel、翻转绿色通道；单通道提取 |
| Alpha／通道 | 输入 Alpha、无 Alpha、灰度生成 Alpha；透明区域 RGB 扩边；RGBA 通道重排、反相与常数 0／1 |
| 尺寸与采样 | NPOT、最大尺寸、Mitchell／Lanczos3／Linear／Nearest 缩放；Repeat／Clamp／Mirror 的独立 U/V；Point／Bilinear／Trilinear；各向异性 1–16（受设备上限限制） |
| Mipmap | 开关、Box／Kaiser、边界 Clamp、覆盖率保持与 Alpha Cutoff、指定层范围淡出到灰色；原生图片生成 PNG mip 附件，KTX2 内嵌层级 |
| 格式 | PNG、JPEG（已有颜色 JPEG）、WebP 有损／无损、RGBA32；DXT1/BC1、DXT5/BC3、BC7、ETC2、ASTC 4×4；自动 UASTC／ETC1S |
| 平台 | 默认、桌面、Android、iOS 分别覆盖尺寸／格式／质量／缩放过滤；默认关闭覆盖，只为启用的平台生成派生文件 |
| Read/Write | 额外保存未压缩 RGBA CPU 副本，通过运行时 API 读取／修改；占用额外下载及内存 |

Sprite 切片与打包、Cursor／Cookie／Lightmap 类别、Cubemap／Array／3D、虚拟纹理、流送与优先级、全局 mip 限制组、Crunch、分离 Alpha、PNG Gamma／PSD Matte、Mirror Once，以及未接入编码器的 BC4/5/6H、PVRTC、其他 ASTC 块尺寸和浮点／打包格式均为灰色。部分格式可能被某些浏览器支持，但当前发布或材质管线尚未接入；说明中区分这两种原因。

DXT5 等指定格式实际交给 KTX2 转码器选择，BC3 即使输入不透明仍输出 BC3；BC1 拒绝含有效半透明的输入。GPU 不支持指定格式时自动选择该设备可用的格式或 RGBA32，预览显示**实际**格式。本版按浏览器平台选覆盖，不以操作系统之外的硬件型号做额外分包。UASTC 是传输编码，并不意味着所有设备使用同一种 GPU 格式。

## 构建与运行时

`Script_TextureImportRules` 是浏览器、保存端点、构建共用的配置校验。`Script_TextureImportBuild` 从原图生成产物，使用固定版本 sharp 0.34.5 和 BasisU 1.16.3（npm 包 `@gpu-tex-enc/basis` 1.16.4）；执行 npm install 即取得 Windows/Linux 编码器，不用额外安装 Unity、Blender 或系统 KTX CLI。

发布顺序：git archive 到独立 staging → `Script_BuildTextureImports.mjs --output-dir <staging>/Taierzhuang1938` → `Script_BuildBrowserBundle.mjs --deploy --output-dir <staging>/Taierzhuang1938` → 上传 Pages。构建器禁止输出到源项目目录。生成图片带源字节／配置／管线版本散列；源图、源清单不覆盖，生成文件不提交。产物报告是 `Data_TextureImportReport.json`。

默认配置为空，字节与游戏视觉保持原状。源格式且无像素变换时逐字节复制；质量配置 0–100（图片编码器下限映射到 1）；WebP 无损、PNG、RGBA32 无质量滑杆；ETC1S 质量映射到 BasisU 1–255；UASTC 映射到编码搜索级别 0–4。提高 UASTC 质量主要增加编码耗时／减少误差，不保证明显改变文件体积。RGBA32 以 PNG 传输，在 GPU 上使用未压缩 RGBA。

KTX2 开启 mip 时离线生成完整层级；「沿用当前材质」默认生成。普通图片显式开启或设置高级 mip 选项时生成离线层级，默认沿用游戏上传行为。覆盖率保持与淡出需要普通图片或 UASTC，ETC1S 的共享码本路径禁用这两项。颜色图沿用 sRGB，法线／ORM 等为线性数据；线性数据含 Alpha 时各通道独立缩放，避免高度 Alpha 被当作透明度参与 RGB 预乘。Alpha=0 仍含有效 RGB 的数据图拒绝 WebP／GPU 压缩，提示使用 PNG，防止透明像素优化破坏数据。JPEG 仅允许已有颜色 JPEG，禁止丢弃其他图的 Alpha 或数据通道。

`Script_TextureImports` 接 `MaterialLibrary` 与普通 TextureLoader 消费方，并给默认 LoadingManager 提供动态 URL 映射；地形／壕沟的 fetch 显式解析映射。DOM/CSS 的静态路径在 staging 中重写。runtime 表的源码默认空，发布写入实际产物；浏览器 bundle 从 staging 打包，因此设置变化参与内容戳。GLB 外链的普通图片通过 LoadingManager 映射，内嵌图片不受影响。

KTX2 与同版本 Three r185 loader／WASM 一起自托管，运行时最多两个转码 Worker。压缩纹理不能用 WebGL flipY，构建为两个 UV 方向输出共享设置的产物：普通 TextureLoader 使用翻转版本，作者 atlas 的 flipY=false 路径使用未翻转版本；只加载实际所需的一份。法线不使用会改写 Alpha 的 normal-map 特殊打包。

本地 `vendor/.../KTX2Loader.js` 小补丁：`load` 的第五参数／`parse` 的第四参数接受 `{ gpuFormat }`，按任务传入共享 Worker；指定格式任务隔离 ArrayBuffer 缓存，防止同一图的不同转码目标串用；先检查 Worker 错误，再读取成功数据。以后更新 vendor 须保留这些行为并跑 GPU 格式回归。

`ReadImportedTexture(texture)` 返回 CPU 副本，修改返回值不隐式影响 GPU；`WriteImportedTexture(texture, rgba)` 上传修改后的 RGBA 并重建 mip。写入压缩图时，该实例改为未压缩 RGBA32，不做运行时重压缩；CPU 副本采用未压缩、未翻转的导入像素。未启用 Read/Write 的图调用 API 会报错。

压缩 ORM 在材质载入时一次性读取 GPU 实际解码的粗糙度下界，覆盖全部 mip 层，不降采样；保留粗糙表面排除 SSR 的采样器预算优化。读回后恢复原渲染目标与状态，临时资源随即释放，不增加逐帧处理。

## 验证

- `Script_TextureImportTest`：配置白名单、默认原字节、NPOT／尺寸比例、像素变换、PNG/WebP/KTX2 编码、定制 mip 头与附件、CPU 副本、数据 Alpha、平台产物、staging 重写与原图保护。
- `Script_TextureManagerBrowserTest`：真实界面操作、保存／刷新、WebP 和 GPU 对比、程序化 Worker、旧版本与跨源写保护；真实 MaterialLibrary 与 ManagedTextureLoader 在两个 UV 方向上读回 GPU 像素比较，验证动态 URL、关闭 mip、ORM 粗糙度下界（含仅末层 mip 光滑）与渲染目标恢复。
- 同一浏览器门还覆盖大预览、灰色项、批量与撤销、平台保存／运行时选择、BC1/BC3/BC7 实际格式与能力缺失回退、定制 mip、采样器以及 CPU 写入后的 GPU 像素；`Script_EditorTest --launcher-only` 验证独立窗口复用与游戏编辑器状态。
- 图片目录规范仍由 `Script_TextureStandardsTest` 管源资产。验收截图在忽略的 `_shots/TextureManager/`，不发布。

保存端点为 `/__textures/status|save|preview|result/...`，仅 localhost 回环可写／编码，同源 JSON、固定配置目标、路径白名单、请求体上限、串行编码和原子写入。编码失败会显示实际错误，不伪造预览或静默发布源图。
