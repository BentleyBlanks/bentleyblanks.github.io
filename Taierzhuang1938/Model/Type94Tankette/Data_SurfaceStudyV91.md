# Type94 V91 当前结构 PBR 整合

在 V89 结构候选上接回 V77 漆面、金属、履带和橡胶材质。旧车体 235 个网格及保留的 Hull 表面沿用原 UV；十二个新前装甲头、修订罩体和安装耳的 801 个多边形独立烘焙，放入旧 Paint 图集无占用的 1280×448 像素区域。完整贴图仍为四类材质、十二张标准 PBR 图。

移除旧圆头后重烘当前 Paint 的局部 AO，避免保留旧接触阴影。Paint 的 Base、Normal、Roughness 和 Metallic 在新增区域以外逐像素不变，其余三类材质全部保留。驾驶舱近景在隔离 AO 后与 V77 像素一致；正常 AO 下允许出现真实更新。新版并非进一步的整车磨损增强，后续磨损调整以此为结构和材质基准。

实际二进制 996 项检查、浏览器 12 项检查、保存源重开及实际 GLB 导入通过。238 个网格、293 个节点、622112 三角与 V89 的定向几何及法线一致；保存源重导的位置、法线、UV、节点及十二张贴图逐值一致。切线按当前导出器四位小数精度检查，方向符号相同；容器不声明字节一致。浏览器实测两侧反向履带、炮塔和机枪双轴；原生运动沿用经几何和控制精确保全的 V89 结果，没有宣称新跑过原生扫角。

本版本只在本地，身份与外置工程路径见 [Data_SurfaceStudyV91.json](Data_SurfaceStudyV91.json)。磨损为创作推定；整车参考和最终游戏派生版尚未完成，没有替换 canonical。

重建：`node Taierzhuang1938/_blender/Script_BuildType94PbrPatchV91.mjs`，顺序 Prepare → Bake → Composite → Finalize → Ao → Verify。环境变量 `TYPE94_PATCH_ROOT` 可指定隔离外置目录；其输入须保留已记录的 V77/V89 工程。独立验证：`python Taierzhuang1938/_import/Script_VerifyType94PbrPatchV91.py`。完整配方、依赖哈希和本地验收页脚本快照保存在外置 `SurfaceV91/Rebuild`。
