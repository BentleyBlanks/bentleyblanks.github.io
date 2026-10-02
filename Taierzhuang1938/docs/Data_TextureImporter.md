# 贴图管理与发布导入

2026-10-03：编辑器「贴图管理」，也可直接打开 `TextureManager.html`。入口不启动游戏；本地运行 `node scripts/Script_LocalPreview.mjs --no-open` 后访问 `/Taierzhuang1938/TextureManager.html`。

## 使用

- 普通贴图清单来自 `Data_TextureManifest`，当前 267 张独立 PNG/JPEG/WebP。选择一张后设置最大边长（不放大、保留比例）、格式、质量和 Mipmap。
- 「重新导入并预览」调用与发布相同的编码器，显示源图与结果、实际文件字节、尺寸；KTX2 由本机 GPU 解码，显示压缩格式、mip 层数与纹理数据显存。RGB、RGBA、单通道与 1:1 像素查看共用。
- 「保存发布配置」写入 `Data_TextureImportSettings.json`。只有显式覆盖的文件进入 `textures`；恢复默认会删除此条。每次 Pages 发布自动应用已提交的配置，不需要手动改消费代码。
- 配置有 JSON 导入／导出，未保存草稿留在当前浏览器；保存使用内容版本检查，另一窗口改过配置时拒绝覆盖。线上静态 Pages 可查看／导出配置；本地服务提供写回与真实编码预览。
- 程序化页列出 50 套 `RECIPES` 和 DetailNormal、SkinLut，只在选择时由 Worker 生成当前一套。支持通道及尺寸预览，切换时终止旧任务；不离线化运行时配方、不输出发布压缩设置。
- GLB 内嵌贴图暂不管理。图片中有运行时 CPU 处理、纹理数组或 DOM 消费的，仍支持文件格式与尺寸设置，但禁用独立 GPU 压缩和 Mipmap 开关，避免破坏其消费契约。

## 构建与运行时

`Script_TextureImportRules` 是浏览器、保存端点、构建共用的配置校验。`Script_TextureImportBuild` 从原图生成产物，使用固定版本 sharp 0.34.5 和 BasisU 1.16.3（npm 包 `@gpu-tex-enc/basis` 1.16.4）；执行 npm install 即取得 Windows/Linux 编码器，不用额外安装 Unity、Blender 或系统 KTX CLI。

发布顺序：git archive 到独立 staging → `Script_BuildTextureImports.mjs --output-dir <staging>/Taierzhuang1938` → `Script_BuildBrowserBundle.mjs --deploy --output-dir <staging>/Taierzhuang1938` → 上传 Pages。构建器禁止输出到源项目目录。生成图片带源字节／配置／管线版本散列；源图、源清单不覆盖，生成文件不提交。产物报告是 `Data_TextureImportReport.json`。

默认配置为空，字节与游戏视觉保持原状。源格式且不缩放时逐字节复制；WebP 有损质量 1–100；WebP 无损、PNG 无质量滑杆；ETC1S 质量映射到 BasisU 1–255；UASTC 映射到编码搜索级别 0–4。提高 UASTC 质量主要增加编码耗时／减少误差，不保证明显改变文件体积。

KTX2 开启 mip 时离线生成完整层级；「沿用当前材质」默认生成。普通图片 mip 开关在上传时施加。颜色图沿用 sRGB，法线／ORM 等为线性数据；线性数据含 Alpha 时各通道独立缩放，避免高度 Alpha 被当作透明度参与 RGB 预乘。Alpha=0 仍含有效 RGB 的数据图拒绝 WebP／GPU 压缩，提示使用 PNG，防止透明像素优化破坏数据。JPEG 仅允许已有颜色 JPEG，禁止丢弃其他图的 Alpha 或数据通道。

`Script_TextureImports` 接 `MaterialLibrary` 与普通 TextureLoader 消费方，并给默认 LoadingManager 提供动态 URL 映射；地形／壕沟的 fetch 显式解析映射。DOM/CSS 的静态路径在 staging 中重写。runtime 表的源码默认空，发布写入实际产物；浏览器 bundle 从 staging 打包，因此设置变化参与内容戳。GLB 外链的普通图片通过 LoadingManager 映射，内嵌图片不受影响。

KTX2 与同版本 Three r185 loader／WASM 一起自托管，运行时最多两个转码 Worker。压缩纹理不能用 WebGL flipY，构建为两个 UV 方向输出共享设置的产物：普通 TextureLoader 使用翻转版本，作者 atlas 的 flipY=false 路径使用未翻转版本；只加载实际所需的一份。法线不使用会改写 Alpha 的 normal-map 特殊打包。

压缩 ORM 在材质载入时一次性读取 GPU 实际解码的粗糙度下界，覆盖全部 mip 层，不降采样；保留粗糙表面排除 SSR 的采样器预算优化。读回后恢复原渲染目标与状态，临时资源随即释放，不增加逐帧处理。

## 验证

- `Script_TextureImportTest`：配置白名单、默认原字节、尺寸比例、PNG/WebP/KTX2 编码、mip 头、数据 Alpha、staging 重写与原图保护。
- `Script_TextureManagerBrowserTest`：真实界面操作、保存／刷新、WebP 和 GPU 对比、程序化 Worker、旧版本与跨源写保护；真实 MaterialLibrary 与 ManagedTextureLoader 在两个 UV 方向上读回 GPU 像素比较，验证动态 URL、关闭 mip、ORM 粗糙度下界（含仅末层 mip 光滑）与渲染目标恢复。
- 图片目录规范仍由 `Script_TextureStandardsTest` 管源资产。验收截图在忽略的 `_shots/TextureManager/`，不发布。

保存端点为 `/__textures/status|save|preview|result/...`，仅 localhost 回环可写／编码，同源 JSON、固定配置目标、路径白名单、请求体上限、串行编码和原子写入。编码失败会显示实际错误，不伪造预览或静默发布源图。
