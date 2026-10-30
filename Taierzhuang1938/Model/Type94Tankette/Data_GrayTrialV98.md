# Type94 远侧传动罩凸耳候选 V98

按 [V97 原图复核](Data_ReferenceAuditV97.md)，补出 2017 和 2014 同车照片可见的小凸耳。它作为固定子件挂在原 `FinalDriveHousingRight` 下；旧 239 个网格、295 个节点姿态／父级和传动轴均保持，近侧未按对称假设新增。既有规则圆头的照片身份仍未确认，没有因模型可见性推论而删除。

局部可见足迹作两图条件试算，厚度、截面及功能仍为推定；现有相机和传动罩截面均未通过这一局部试件得到认证。根部按实际底面射线延入当前传动罩，中心重叠约 4 mm，避免悬浮。新增 188 三角，整车包围尺寸保持。新的固定子件保留原网格法线／UV，不把重新拼接造成的数值变化当成无关误差放过。

实际源重开重导、GLB 导入、保留表面与节点、整车运动和锁闩扫查的结果见 [Data_GrayTrialV98.json](Data_GrayTrialV98.json)。PBR 当前仍保留 V96；此凸耳尚未接回材质，当前游戏派生版也未替换。局部试件不构成整车参考验收。

```powershell
python -X utf8 Taierzhuang1938/_import/Script_Type94CasingLugLayoutV97.py
node scripts/Script_BlenderMcp.mjs start --task Type94Tankette --batch Taierzhuang1938/_blender/Script_Type94CasingLugV98.py --json
node scripts/Script_BlenderMcp.mjs start --task Type94Tankette --batch Taierzhuang1938/_blender/Script_VerifyType94CasingLugV98.py --json
python -X utf8 Taierzhuang1938/_import/Script_VerifyType94CasingGeometryV98.py
node scripts/Script_BlenderMcp.mjs stop --json
node scripts/Script_BlenderMcp.mjs status --scan --json
```

`TYPE94_CASING_ROOT` 可指定隔离外置重建目录；输入为不可变 V95 源。照片、参数、源文件和本地对照页快照保留在外置 `ReferenceV97`／`CasingLugV98`，不提交验收图片或 `.blend`。
