# 外耳入口与头发修订 · 2026-09-12

## ear026：外部皮肤散射

外脸改为逐光源的 RGB 环绕漫反射近似，红色通道有更宽的明暗过渡；入射能量沿用真实灯光颜色、强度、距离与阴影。耳缘透光项按耳部空间、视角和背光方向加权，替换旧的固定方向暖色叠加。外部强度为 .58，内部 .18 保持原值，进入耳道时外部散射权重归零。外脸粗糙度收敛至 .35–.55，降低法线起伏并使用皮肤介质高光，保留原皮纹、血色渐变、顶点遮蔽和独立入口阴影。

这是用于实时近景的局部散射近似，没有屏幕空间模糊或新增透射渲染通道，不是完整体积随机游走 SSS。模型、头发、光照布局和内部材质行为保持原有契约。

实测 [Script_SkinScatteringTest.mjs](./Script_SkinScatteringTest.mjs) 6 项：侧光改变 107550 像素，红通道扩散强于绿/蓝；背光改变 23937 像素；全关灯及内部视角下开关外部 SSS 的像素差均为 0。渲染回归 17 项、触感细节 167 项及 48 组完整工具接触审计通过。检查前后侧脸和四种尺寸取出截图，初始 177620 三角面／34 次绘制；预览与报告仅留本地和 `C:/Users/Bentl/OneDrive/AI/Models/Blender/EarSpa3D/SkinSss/Review`。

## ear019：后脑连续覆盖与外景血色

后续反馈指出耳后有三角形露皮。本次独立续做 7 轮，保留第 7 轮：扩展原生后脑帽，增加连续不透明发幕，将三层 120 张发片投射到实际头部表面；90 根合批细丝保留，减少其纵向分段以控制面数。底层同样使用既有发丝颜色与凹凸，强制 alpha 为 1，外层保留透明发梢。贴图沿用 ear017 的内置 imagegen 成品，本次没有生成新位图。

实际渲染隔离检查确认，块状白色高光来自发片各向异性项；关闭该项后保留普通柔和高光、sheen 与低强度凹凸。额头帽边做边界平滑。外部皮肤增加低强度暖色校正和面颊、鼻尖、耳周空间渐变，保留皮纹、顶点遮蔽、薄皮散射；内部湿润与刺激逻辑不变。整体覆盖和材质更接近参考，后颈仍有梳理束的规则过渡，尚非摄影级随机发丝。

源工程：`C:/Users/Bentl/OneDrive/AI/Models/Blender/EarSpa3D/HairCoverage/Model_HairCoverage.blend`；原状态为同目录 `Model_HairCoverageBaseline.blend`。通过 BlenderMCP 在该独立工程加载 [Script_CompleteProfileHair.py](./Script_CompleteProfileHair.py)，执行 `Build()`、`Export()`，然后运行 `node EarSpa3D/Script_CompactModel.mjs`。依赖沿用既有 MakeHuman/ReferenceProfile 本地文件；`.blend`、脚本副本和每轮截图留在 OneDrive。重建仅修改三个头发节点。

Blender 基线对比：其余 61 个网格的顶点与拓扑一致。初始外景 177620 三角面、34 次绘制；新增外耳回归覆盖后脑区域三个方向的实体遮挡（532/532、532/532、475/475），测区 X=28–64、Y=-18–36 mm，刻意避开应外露的耳颈边缘。实测外耳 6 项、渲染 17 项、触感 167 项及 48 组完整工具接触审计通过。检查桌面、390×844、320×568、844×390 渲染；报告和截图保存在本地 `_dev` 与源工程的 `Review`。无页面或着色器报错，自动化结果不代表摄影相似度或真实手机稳定帧率。

## ear017：10 轮外耳与分层头发迭代

本次先按参考修塑外耳（第 1–4 轮），随后按用户纠正，将主要工作转为头发贴图与多层结构（第 5–10 轮）。达到 10 轮上限后停止继续美术迭代。实时模型比原版增加了凹腔层次和发丝表现，仍有发片接边及梳理规律感，与参考摄影的蓬松度、随机细丝和皮肤质感并不等同。

- 原生耳廓局部加密、雕出耳甲腔与对耳轮分叉，入口下移至耳屏后方，重新拟合渐进内壁；原来的深部耳道、鼓膜及全部工具顶点和拓扑保持不变。
- 耳廓烘焙局部半球遮蔽到顶点色，GLB 明确保留活动颜色层，运行时绑定对应材质。原入口深度 UV 契约继续生效。
- 现有一款发型保留头皮底层，替换为三层共 120 张弯曲发片，另加一个合批的 90 根轮廓细丝节点 `Model_ProfileHairWisps`。没有新增发型变体或动画。
- [Texture_LayeredDarkHair.png](./Textures/Texture_LayeredDarkHair.png)：内置 imagegen（第一级）一次生成成功，实际文件 1254×1254 RGBA；保留透明边缘。颜色沿 UV 采样发丝局部，完整 alpha 控制卡片覆盖，叠加低强度凹凸、柔和定向高光。未使用 Lovart 或即梦。
- 最终版本戳 `ear017-layered-20260912`。模型、运行模块和入口引用一同更新。

### 本次源工程与重建

工程：`C:/Users/Bentl/OneDrive/AI/Models/Blender/EarSpa3D/ConchaSculpt/Model_ConchaSculpt.blend`。原状态完整保存在同目录 `Model_ConchaBaseline.blend`；参考图、重建脚本副本与逐轮截图同样留在该目录。

从 baseline 的独立副本保存为 `Model_ConchaSculpt.blend` 后，通过 BlenderMCP 依次加载并执行 [Script_SculptConcha.py](./Script_SculptConcha.py) 的 `Build()`、[Script_LayerProfileHair.py](./Script_LayerProfileHair.py) 的 `Build()`；然后用前者 `MergeCurrentRuntime(当前运行时GLB绝对路径)` 保留其他任务已交付的工具，最后执行 `Export()` 和 `node EarSpa3D/Script_CompactModel.mjs`。两个 `Build()` 的默认参数对应最终保留的形体。沿用下文 ReferenceProfile 与 MPFB 的本地依赖；不得在其他任务的场景运行。

发布整合基线为 `4c77d2635`，保留并发任务的耳勺握柄、第二天碰撞缓存与沿壁面法线刮除逻辑；模型通过 BlenderMCP 只保留本任务四个修改节点、重新导入最新运行时其他节点后导出。整合前的第 10 轮源工程另存为 `Model_Round10BeforeIntegration.blend`，这一步不增加美术迭代轮次。

本次实测：渲染 17 项、触感细节 167 项（含 48 组完整工具接触审计）、物理 8 项、经营 13 项、方向接触 17 项，以及 [Script_OuterAnatomyTest.mjs](./Script_OuterAnatomyTest.mjs) 5 项均通过。后者确认贴图 alpha、实际像素贡献、顶点遮蔽与面数预算；贴图切换改变 358648 个像素。Blender 对比 baseline 验证 60 个未改模型的顶点坐标和拓扑完全一致。

检查了桌面与 390×844、320×568、844×390 取出视角截图；初始外景为 177300 三角面 / 34 次绘制，取出视角在 166100–170868 三角面范围，无页面或着色器错误。自动化结果不作为摄影相似度或稳定 60fps 的证明。截图和 JSON 只留 `_dev` 与源目录的 `Review`。

### 发丝贴图原始提示词

> Create one production-ready hair-card texture for a photorealistic 3D dark-haired East Asian woman's hairstyle. Square 2048x2048 PNG, actual transparent alpha background. An orthographic flat texture, not a head or hairstyle photograph. Fill the square with one dense broad sheet of parallel extremely fine individual dark espresso brown and black human hairs flowing vertically from the top edge down to bottom. Hair roots are dense at top, center densely overlapped with strand-scale subtle brown variation and soft neutral diffuse highlights, gradually separating at bottom into naturally tapered wispy ends; softer semitransparent sparse flyaway strands at left and right edges. All hairs generally vertical with very slight natural irregular curvature. Fine real human hair, silky cuticle strands, dark neutral brown, controlled low-contrast lighting suitable for PBR albedo, no white specular stripe, no chunky locks, no text, no border, no face, no scalp, no painted background. Intended for UV mapping to several layered curved hair cards in Blender. Deliver a file that can be copied to C:/Users/Bentl/Documents/Program/bentleyblanks_Codex_EarConchaSculpt_20260912/EarSpa3D/Textures/Texture_LayeredDarkHair.png.

## ear012 历史修订

用户截图中的入口混用了深部耳道材质，外景额外压暗后呈黑色突管。旧入口还把不同位置采样的皮肤深度加到倾斜圆环上，接缝与布尔侧壁重叠。

- BlenderMCP 修建耳甲腔入口：皮肤对齐偏移为游戏坐标 `(-3.5, .8, -6)` mm，椭圆口与同一轮廓采样共用边缘；去除布尔切割生成的额外侧壁，用 16 段连续过渡接入原耳道。入口零深度、深部管腔、工具接触和采耳相机保持原契约。
- `Model_OuterEar` 使用外耳 PBR；运行时按世界 XY / 20 投影，与 `Model_Temple` 的皮纹连贯。导出 UV 的 V 记录过渡深度，GLTF 翻转 V 后恢复为 `1 - uv.y`，用于从肤色向内部遮光平滑过渡。
- 原发型保留减面底层，增加 352 条确定性梳理的细发丝和轮廓碎发。发梢收细，保持两个合批头发节点。高频发丝纹理做导数滤波；停用在此长条 UV 上产生三角形高光的各向异性项，使用低强度柔和光泽。
- 没有调用位图生成，也没有新增付费图片、发型变体或动画。

## 源工程与重建

- 工程：`C:/Users/Bentl/OneDrive/AI/Models/Blender/EarSpa3D/OuterAnatomy/Model_OuterAnatomy.blend`
- 脚本：[Script_RepairOuterAnatomy.py](./Script_RepairOuterAnatomy.py)
- 依赖：既有 `ReferenceProfile/ConchaFit.json`、`ReferenceProfile/Model_ReferenceProfile.blend`、本机 MPFB CC0 基础拓扑及脚本引用的目标文件。
- 在独立 OuterAnatomy 工程导入修订前的 ear011 GLB（基线提交 `df704fd009e6f818d97c265bda28303fca5ddc6a`）后，通过 BlenderMCP 执行 `RepairConcha()`、`GroomHair()`、`Export()`。不要在其他任务的当前场景直接运行。脚本仅修改外部头部、入口和头发，保留导入的内部模型及器具。
- 导出后运行 `node EarSpa3D/Script_CompactModel.mjs`，移除运行时自行绑定的重复纹理负载。`.blend`、备份和截图留在 OneDrive 源目录／本地 `_dev`。

这是沿既有拓扑制作的实时美术修正，不是医学扫描或经过测量的患者解剖模型。

## 本次验收

- `Script_RenderingRegressionTest.mjs`：17 项通过，192 条 BVH 与完整网格射线误差为 0；桌面、390×844、320×568、844×390 的取出镜头均在面数和绘制预算内，无着色器／页面错误。
- `Script_TactileDetailTest.mjs`：167 项通过，含 48 组完整器具网格接触审计。
- 剥离物理 8 项、经营 13 项、方向接触 17 项通过，后者含 984 次独立表面比较。
- 本地检查开场、外耳近景与各尺寸的取出截图；近景属于固定诊断机位，取出截图使用真实指针输入后的游戏机位。所有图与原始报告仅保存在本地。
