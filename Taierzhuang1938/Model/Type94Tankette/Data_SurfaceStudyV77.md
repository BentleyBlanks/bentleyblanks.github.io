# Type94 V77 金属磨损预览

用户要求继续改善金属磨损。此版本从保留的 V68 源工程增加一层可编辑、可重建的表面磨损；磨损位置、程度及暗底层为创作推定，没有新增史实认定。V74 灰模试验、参考相机及正式游戏模型均未在本轮替换。

原高模的驾驶舱盖约 209 像素／米，毫米级磨损放大后容易发糊。本轮保留 UV 岛方向，重新分配空间并优先照顾舱盖和侧罩：舱盖约 758、侧罩约 632 像素／米，漆面图集实际覆盖率约 46.2%。正向统一缩放拟合的最大误差约 0.00168 像素。旧材质以线性光双线性采样转移，其他三种材质保持原像素。

磨损区分漆面擦伤、暗色底层过渡和裸钢，分别修改 Base、Roughness、Metallic 与薄漆层法线。掉漆边缘使用真实凸棱，逐段裁切到实际相邻面的 UV 三角形；平面擦痕按米制坐标采样并裁到所属表面，不描画三角网格。法线按局部图集密度合成近似浅凹凸，新增漆层厚度参数为 40 微米，细划痕最多约 5 微米，无几何置换。

初版宽遮罩与外扩暗边在近景中产生模糊亮斑和厚漆边，已否决，保留在外置 `SurfaceV77/Versions/RejectedBroadRelief`；保留旧稀疏 UV 的第二次尝试存于 `RejectedLowDensity`。保留版重排漆面 UV，取消暗边外扩，限制磨损到所属表面，并收薄法线。对照页在相同几何、相机和灯光下切换 V68／V77 各自的真实资产，保留各自的 UV 和切线基。

源工程、GLB、完整贴图、验收页及截图均只保留本地；实际身份、验证结果和路径见 [Data_SurfaceStudyV77.json](Data_SurfaceStudyV77.json)。验收包含与 V68 的 237 个网格实际位置、顶点法线、定向表面，以及 292 个节点姿态与控制的精确比较；源工程重开重导还比较新 UV、切线和全部 12 张实际导出贴图。浏览器检查材质、灰模切换、履带和炮塔／机枪控制。验证通过不等于整车参考与最终游戏版验收完成。

几何、顶点法线、UV 和图像采用精确比较。Blender 5.2 导出器按 `ROUNDING_DIGIT=4` 量化切线，源重导的少数角点可能跨过末位舍入边界；切线按该实际分量精度、单位长度和完全相同的方向符号检查，差异角点数、最大分量与角度都记录在验证文件中，不声明切线逐字节一致。

重建入口：

```powershell
node Taierzhuang1938/_blender/Script_BuildType94WearPreviewV77.mjs --dry-run
node Taierzhuang1938/_blender/Script_BuildType94WearPreviewV77.mjs
python Taierzhuang1938/_import/Script_VerifyType94WearV77.py
```

顺序为 Prepare → Atlas → Transfer → Clips → Raster → Apply → Normal → Verify。`TYPE94_WEAR_ROOT` 可指定独立外置重建目录；原 V68 的已记录源文件和输入资料须保留。局部重做可用 `--phase` 选择阶段。源工程在 OneDrive 的 Blender 模型目录，重建快照及本地页面脚本在该资产的 `SurfaceV77/Rebuild`。浏览器预览保持静音；本轮结束需通过 launcher 的 `stop` 与 `status --scan --json` 记录清理证据。
