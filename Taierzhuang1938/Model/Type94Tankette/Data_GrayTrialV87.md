# Type94 罩体后缘交界试件 V87

只重建前部罩体，依据主参考与 TourGuide 的后缘交界调整后部位置、高差、横向中心和宽度。条件参数约为：后缘 Y 0.8182 m、后部高差 63.0 mm、中心 X −0.2000 m、宽度 0.6458 m；前缘 Y 和 140 mm 升高量保留。隐藏后部连接、精确截面和绝对尺寸仍为推定。

2014 年照片存在约 75 像素交界冲突，尚未区分点位身份、机位或结构状态原因。因此该版是局部候选，不是三图全部通过的最终几何。馆方 7 视图额外核对了罩体／驾驶舱关系，原有中面数据的射线不再首先击中罩体；这些数据仍不自动等同可见照片角点。

实际导出为 622080 三角、238 网格、293 节点。与 V85 相比少 32 三角，变化限于罩体；其余 237 个网格定向表面、全部刚体姿态／父级、整车尺寸保持精确一致。保存源实际重开重导与当前 GLB 字节一致，39 项运动门禁及四机位新旧实际渲染对照通过。完整身份与范围见 [Data_GrayTrialV87.json](Data_GrayTrialV87.json)。

源、备份、完整 GLB、输入与重建快照均位于外置模型目录 `NoseV87`。`Versions/LineOnlyUnaccepted` 保留先前只约束后缘直线的试件。V87 没有烘新 PBR，也没有替换 V77 材质或原游戏模型。

```powershell
node scripts/Script_BlenderMcp.mjs start --task Type94Tankette --batch Taierzhuang1938/_blender/Script_Type94RearEdgeTrialV87.py --json
node scripts/Script_BlenderMcp.mjs start --task Type94Tankette --batch Taierzhuang1938/_blender/Script_VerifyType94RearEdgeV87.py --json
python Taierzhuang1938/_import/Script_VerifyType94RearEdgeGeometryV87.py
node scripts/Script_BlenderMcp.mjs stop --json
node scripts/Script_BlenderMcp.mjs status --scan --json
```

最终参考、完整材质与游戏派生验收继续，Goal 未完成。

后续更正：上述约 75 像素冲突来自误选的 2014 交界点，已由 [V88 点位复核](Data_ReferenceAuditV88.json) 撤回。原点与原试件保留为历史记录，当前采用更正后的观察继续核对，不据此认定照片中的结构不同。
