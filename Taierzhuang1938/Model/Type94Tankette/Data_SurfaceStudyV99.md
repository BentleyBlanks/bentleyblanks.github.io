# Type94 当前完整 PBR 输入 V99

V96 的完整材质接入 V98 独立传动罩凸耳，组成后续游戏派生与磨损工作的固定输入。694,476 三角、240 个网格所有者、296 个姿态／控制节点，每侧 80 个履带片；完整十二图保持 Paint 4K、Track／Steel 2K、Rubber 1K。

新凸耳单独展开至 Paint 图集空白 128×128 区域，旧采样足迹留出 12 像素保护。仅新件烘焙材质与局部遮蔽；其余 239 个网格、原 UV、原图区域保持精确一致。独立实际 GLB 检查 992 项通过，保存源重开、重导和实际 GLB 导入通过。源重导的切线按导出器四位小数精度比较，容器哈希不同，不声称字节一致。

身份与路径见 [Data_SurfaceStudyV99.json](Data_SurfaceStudyV99.json)。`.blend`、完整 GLB、贴图和验收材料保存在外置 `Type94Tankette/SurfaceV99`。V99 已被 V100 游戏证明和 V101 磨损引用，重建应使用新的外置目录：

```powershell
$env:TYPE94_HIGH_ROOT='C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/Type94Tankette/SurfaceReplayV99'
node Taierzhuang1938/_blender/Script_BuildType94HighV99.mjs --dry-run
node Taierzhuang1938/_blender/Script_BuildType94HighV99.mjs
```

输入为保留的 V96 材质源和 V98 结构源，按 manifest 哈希核对。凸耳位置及整体参考仍为条件验收；此材质接线不代表原图形态已经通过。
