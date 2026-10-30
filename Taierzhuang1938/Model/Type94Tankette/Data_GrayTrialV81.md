# Type94 安装耳双头候选 V81

只修改 V79 的安装耳网格：保留实际上部头形，调整耳板宽高与横向位置，并补出下部凸起候选。总量由 622080 增至 622112 三角，仍为 238 网格、293 节点；其余 237 个车体网格、全部刚体节点姿态／父级和整车包围尺寸保持精确一致。上部头形的实际 GLB 定向表面也单独比较并保持一致。

新耳板采用推定的 55 × 90 × 4 mm 局部尺寸，横移 10 mm。下部截面暂沿用可编辑的六角头候选，不把用途或机械轴线当成已知史实。其深度受既有条件平面约束；原图位置、相机标定与完整连接关系仍未完成验收。

保存源工程实际重开并重导，与试件 GLB 字节一致。实际导入中两条观察射线均到达相应头部表面；安装耳保持固定，原有 39 项运动门禁通过。两张原图机位的灰模比较和七机位局部查看控件均已执行。验证范围与身份见 [Data_GrayTrialV81.json](Data_GrayTrialV81.json)。

源工程、完整 GLB、输入快照、验收图和本地网页位于外置 Blender 模型目录的 `FrontCornerV81`，不提交仓库。该版未烘新 PBR，没有替换 V77 材质预览、现有游戏候选或正式模型。

```powershell
node scripts/Script_BlenderMcp.mjs start --task Type94Tankette --batch Taierzhuang1938/_blender/Script_Type94EarPairTrialV81.py --json
node scripts/Script_BlenderMcp.mjs start --task Type94Tankette --batch Taierzhuang1938/_blender/Script_VerifyType94EarPairV81.py --json
python Taierzhuang1938/_import/Script_VerifyType94EarPairGeometryV81.py
node scripts/Script_BlenderMcp.mjs stop --json
node scripts/Script_BlenderMcp.mjs status --scan --json
```

接下来仍须核对传动罩接缝与头部布局、近侧前角及履带包络，并完成整车参考与最终 PBR／游戏派生验收。此局部试件不构成 Goal 完成。
