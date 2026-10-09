# 三维流体体积资产

这些 `Volume_*.bin.gz` 是空间密度／燃烧场序列，不是二维贴图。来源为 [JangaFX 免费 VDB](https://jangafx.com/software/embergen/download/free-vdb-animations)，原始包和本目录 LICENSE.txt 均注明 CC0；作者 JangaFX LLC。

| 运行资产 | 官方原包 | 用途 |
| --- | --- | --- |
| Campfire | SmallCampfireVDB.zip | 残骸营火、火舌 |
| ChimneySmoke | IndustrialChimneySmokeVDB.zip | 狭长烟柱、风切烟带 |
| DenseSmoke | Smoke_Plume_01.rar | 浓烟、白烟、低矮烟幕 |
| DustImpact | GrenadeDustImpactVDB.zip | 破片爆炸土尘、间歇尘爆 |
| GroundExplosion | GroundExplosionVDB.zip | 燃油爆炸、航空炸弹冷却烟体 |

原包留在仓库外。Data_*Volume.json 记录原包 SHA-256、选帧、原始范围、上轴转换、密度标尺、采样统计和产物 SHA-256。运行数据由 `_import/Script_ParticleVolumeBake.py` 重建，使用 numpy + openvdb；Windows 可用本机 Blender 5.2 的独立 Python，不启动 Blender。

示例（从仓库根目录）：

```powershell
& 'C:/Program Files/Blender Foundation/Blender 5.2/5.2/python/bin/python.exe' Taierzhuang1938/_import/Script_ParticleVolumeBake.py --source '<原包路径>/SmallCampfireVDB.zip' --source-url https://jangafx.com/software/embergen/download/free-vdb-animations --asset Campfire --start 48 --end 111 --frames 64 --bounds-grid flames --size 64,96,64 --density-scale .003 --flame-scale 1 --output Taierzhuang1938/Volume/Volume_Campfire.bin.gz
```

其余命令沿用示例，参数分别为：

- ChimneySmoke：48 帧，尺寸 48,96,96，density-scale .5，完整序列。
- DenseSmoke：48 帧，尺寸 64,96,64，density-scale 2.2，完整序列。
- GroundExplosion：64 帧，尺寸 64,96,64，density-scale 1，flame-scale 6，完整序列。
- DustImpact：64 帧，尺寸 96,64,96，density-scale .6，完整序列。

播放 FPS 为作者预览使用的 30；VDB 自身 simulation_time 也保留在元数据中，不能把二者混为同一个时钟。原数据为 Z-up，运行时转换为项目的 Y-up。选帧使用自然数字顺序，避免旧 RAR 中 `1,10,100,2` 的字典序错误。

TVOL 包含 magic、JSON 元数据和 x-fast 的 R8/RG8 3D 数据；R/G 分别是经过平方根编码的 density/flames。降采样用体素面积平均保留薄烟质量。帧在 XYZ 三轴分块，目前最大纹理边为 384；不生成会串帧的 mipmap。重建后同时更新数据、报告和 Data_ParticleVolumeAssets 的 cache-bust。

这是**预计算流体序列的实时三维播放**，不是浏览器现场求解流体。烟使用视线消光和光源方向的体积自遮光；火的 flames 场映射到美术校准的温度区间和相对辐亮度，并非源数据提供的绝对 Kelvin。循环使用顺向重叠，不倒放；单粒子持续源跨寿命周期保持同一相位。
