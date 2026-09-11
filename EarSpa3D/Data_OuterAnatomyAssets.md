# 外耳入口与头发修订 · 2026-09-12

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
