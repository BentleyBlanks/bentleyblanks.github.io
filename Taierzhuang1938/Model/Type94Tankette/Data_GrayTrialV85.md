# Type94 前部罩体后部轮廓试件 V85

仅重建 `NoseHousing` 的几何：保留前缘 140 mm、宽度、横向中心及前后位置，将后部升高量从原推定 120 mm 改为 12 mm。12 mm 仍是独立试件参数，后部连接和精确深度没有经图证或测绘确立。新坡度同时更新同部件上的提手、两枚小头形及其着陆位置。

改动针对馆方 7 视图中罩体遮住驾驶舱下部的问题。原相机保持不变，实际导入 GLB 的两条下部数据射线不再首先命中前部罩体。已分别检查 2017、2014、TourGuide、馆方 7 的原图和新旧灰模；局部遮挡改善不代表整车比例或后部尺寸验收完成。

总量仍为 622112 三角、238 网格、293 节点。其余 237 个网格的实际定向表面、全部节点刚体姿态／父级和整车包围尺寸精确保持。实际源工程重开重导 GLB 与试件字节一致，39 项运动门禁通过。验证、身份和本地入口见 [Data_GrayTrialV85.json](Data_GrayTrialV85.json)。

```powershell
node scripts/Script_BlenderMcp.mjs start --task Type94Tankette --batch Taierzhuang1938/_blender/Script_Type94NoseTaperTrialV85.py --json
node scripts/Script_BlenderMcp.mjs start --task Type94Tankette --batch Taierzhuang1938/_blender/Script_VerifyType94NoseTaperV85.py --json
python Taierzhuang1938/_import/Script_VerifyType94NoseGeometryV85.py
node scripts/Script_BlenderMcp.mjs stop --json
node scripts/Script_BlenderMcp.mjs status --scan --json
```

源工程、备份、完整 GLB、对照网页和验收图只留在外置模型目录 `NoseV85`。重建快照包含使用的上游构造函数源码。该版 UV 为临时值，新 PBR 尚未烘焙；V77 材质与原游戏候选均保留。整车参考、最终材质与游戏派生验收仍未完成。
