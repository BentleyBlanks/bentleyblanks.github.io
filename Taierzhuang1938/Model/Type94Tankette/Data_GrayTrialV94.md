# Type94 开口拖钩与独立锁闩候选 V94

按 [原图身份核对 V93](Data_ReferenceAuditV93.md)，移除旧 U 形环和五个旧固定组件，重建向前开口的拖钩、底座、横销、弹簧线圈与独立锁闩。静止钩身与可动锁闩分属不同控制节点。旧模型中的无关前装甲头保留；不能用宽松包围盒顺手删除其他部件。

源工程在外置 `TowHookV94`，固定件和锁闩均保留按作者零件命名的顶点组。新件 UV 为临时构造 UV，尚未接回完整 PBR；SurfaceV92 材质候选与 V70 游戏检查点分别保留，未替换 canonical 或发布。

旧件之外的 236 个网格及 291 个保留节点须逐值比较定向表面、法线、UV、姿态和父级。Hull 保留表面须是旧表面的精确子集，整车尺寸不变；实际保存源重开、重导与 GLB 导入分别复核。锁闩单独检查 0–55° 共 56 个姿态，对全部固定网格做零接触豁免扫查；55° 仅为推定演示行程。原有车辆运动检查继续运行，旧错误整圈运动检查由独立锁闩检查替代。

第一版部件过大，保存在外置 `Versions/InitialOversize`；底板局部旋转中心修正前的候选保存在 `Versions/PlatePivotBeforeFix`。钩根过渡和锁闩肩部仍简化，精确轮廓尚需继续与原图核对，不认定本部件已最终定型。实际身份、验证结果和未闭合项见 [Data_GrayTrialV94.json](Data_GrayTrialV94.json)。原图支持开口钩与锁闩的身份，不构成其精确截面、隐藏连接或整车参考验收。

```powershell
python -X utf8 Taierzhuang1938/_import/Script_Type94TowReferenceV93.py
node scripts/Script_BlenderMcp.mjs start --task Type94Tankette --batch Taierzhuang1938/_blender/Script_Type94TowHookTrialV94.py --json
node scripts/Script_BlenderMcp.mjs start --task Type94Tankette --batch Taierzhuang1938/_blender/Script_VerifyType94TowHookV94.py --json
python -X utf8 Taierzhuang1938/_import/Script_VerifyType94TowGeometryV94.py
node scripts/Script_BlenderMcp.mjs stop --json
node scripts/Script_BlenderMcp.mjs status --scan --json
```

此入口依赖哈希锁定的 V89 工程和已保存的 V93 组件审计；要重新建立审计，先用同一 launcher 运行 `Script_Type94TowAuditV93.py`。版本配方、依赖和本地对照页脚本保留在外置 `Rebuild/`。完整整车形态、V94 新件 PBR 和最终游戏派生仍须继续验收。
