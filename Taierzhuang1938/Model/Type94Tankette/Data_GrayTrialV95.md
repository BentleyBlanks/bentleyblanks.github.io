# Type94 钩根与锁闩肩部 V95

在 V94 的独立固定钩／锁闩结构上继续校对 2017、2014 与 TourGuide 原图。2014 年同车照片补充了钩根连入底板和锁闩方孔的可见证据；其不同涂装没有混入当前材质。下半钩身在该图被栏杆遮挡，不能作为未遮挡的完整轮廓验收。

取消额外块状或鼓包过渡，改为原钩身与实际底板的连续联合表面，并收圆钩尖。其余隐藏截面仍是推定，1.25 mm 体素只用于本地高源构造，不是实车精度声明。源工程保存根部、肩部、销轴等作者零件顶点组，以及完整重建脚本和参数文本。

锁闩上部为真实穿透方孔，左右有实际边框；横销的可见跨度按主图收小，原来无清楚图像对应的外侧长支脚由后方中部支承和两侧锁闩耳替代。背面轴承截面、支承细节、弹簧圈数及 55° 演示行程均属推定，没有认定真实止挡或承载能力。

实际源工程与 GLB 检查包括根部闭合／连通性、自交、开孔射线、56 个锁闩姿态零接触豁免扫查和 38 项保留车辆运动检查。其他 237 个网格及全部 295 个节点姿态／父级须精确保留，整车包围尺寸不变。隔离重建以已记录的 V94 源为输入，不宣称从空网格完整重造整车。

实际身份、验证数量与外置路径见 [Data_GrayTrialV95.json](Data_GrayTrialV95.json)。本版尚未证明整个前部／履带包络及全部参考机位，不能写成整车参考已通过。当前完整 PBR 整合见 [V96](Data_SurfaceStudyV96.md)；旧 V94 和 V92 分别保留。

```powershell
node scripts/Script_BlenderMcp.mjs start --task Type94Tankette --batch Taierzhuang1938/_blender/Script_Type94TowShoulderV95.py --json
node scripts/Script_BlenderMcp.mjs start --task Type94Tankette --batch Taierzhuang1938/_blender/Script_VerifyType94TowShoulderV95.py --json
python -X utf8 Taierzhuang1938/_import/Script_VerifyType94TowGeometryV95.py
node scripts/Script_BlenderMcp.mjs stop --json
node scripts/Script_BlenderMcp.mjs status --scan --json
```

`TYPE94_TOW_ROOT` 可指定隔离外置构造目录。重建所需的 V94 源、参数与依赖哈希保存在外置 `TowShoulderV95/Rebuild`。验收页面和图片只留本地。
