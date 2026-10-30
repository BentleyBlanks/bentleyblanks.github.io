# Type94 更正点位后的罩体候选 V89

保持相机、前缘、其他部件和刚体姿态不变，用更正后的 2017／2014／TourGuide 后缘交界共同核对罩体。相对 V87，后缘、后部高差、中心与宽度仅作毫米级更新。三视图局部一致性得到粗略支持，隐藏连接、准确截面和绝对尺寸仍明确为推定。

实际输出 622112 三角、238 网格、293 节点。其余 237 个网格的定向表面、全部刚体姿态／父级及整车尺寸精确保持。保存源工程实际重开重导与 GLB 字节一致，39 项运动门禁和四机位实际新旧 GLB 对照通过。身份、数值与验证范围见 [Data_GrayTrialV89.json](Data_GrayTrialV89.json)。

V87 原来的 2014 冲突结论已附加 V88 更正记录，原始观察及试件仍保留。V89 没有修改相机或烘新 PBR，V77 材质及原游戏模型保持原样。源工程、完整导出、输入与重建快照只留外置模型目录 `NoseV89`。

```powershell
python Taierzhuang1938/_import/Script_Type94RearJunctionCorrectionV88.py
python Taierzhuang1938/_import/Script_Type94RearJunctionStudyV88.py
node scripts/Script_BlenderMcp.mjs start --task Type94Tankette --batch Taierzhuang1938/_blender/Script_Type94CorrectedRearTrialV89.py --json
node scripts/Script_BlenderMcp.mjs start --task Type94Tankette --batch Taierzhuang1938/_blender/Script_VerifyType94CorrectedRearV89.py --json
python Taierzhuang1938/_import/Script_VerifyType94CorrectedRearGeometryV89.py
node scripts/Script_BlenderMcp.mjs stop --json
node scripts/Script_BlenderMcp.mjs status --scan --json
```

整车参考、完整 PBR 与最终游戏派生验收仍在进行，局部一致性不构成 Goal 完成。
