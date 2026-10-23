# Nakajima Ki-4 / 九四式侦察机

本资产仅为 **Ki-4 裸轮陆基构型的同型外形复原**。照片不属于滕县现场；模型不证明它已参加滕县城内攻城，也不改变现有任务使用的 Ki-30。主参考为 Notion 资料页三张 Commons 照片，版本、尺寸锚点、冲突与推定见 [Data_ReferenceContract.json](Data_ReferenceContract.json)。

## 原始依据

- [Notion 资料页](https://app.notion.com/p/40260335331c81ce8b26eb0e1cd6f9cb)。已纠正原来的“下单翼”；实图与原件均为错列不等翼双翼结构。
- [陸軍航空本部《九四式偵察機説明書》1937年5月改订本](https://dl.ndl.go.jp/pid/8815746)，[NDL 馆藏目录](https://ndlsearch.ndl.go.jp/books/R100000002-I024881858)，原件 USB-13 R213:0837–0998 / RG243。
- 扫描第5页（书内第1页）：上翼展12.000m、下翼展8.520m、全长约8.250m、高约3.310m、轮距2.250m；表列翼弦上1.720m/下1.240m、气动力平均翼弦1.580m。
- 扫描第6页：翼间隔约1.595m、错列约0.4725m、后退0°、上反4°、上/下翼安装角2°/4°，垂直尾翼左3°40′。NACA M6 坐标来自 [UIUC 数据库](https://m-selig.ae.illinois.edu/ads/coord/nacam6.dat)。
- 扫描第64/68页：机身；72–75页：翼与撑杆；83–84页：尾翼；96页：起落架。翼图最大弦约上2.000m/下1.250m，不把轮距当作上翼弦长。
- 翼肋按上翼1–38、下翼1–23的编号与翼端加密关系复原；可读的上翼端196/204/178/160/98mm间隔沿用，尚不能精确辨读的内部站位按扫描图比例校准，不伪称完整工厂尺寸测绘。

现代汇编常见7.73m/3.50m，与原始说明书不同。本模型采用上述原件的一套锚点，不拼接两套尺寸。三张原图、相关原始图页、辅助三视图及其来源/哈希保留在本机 References 目录，未随站点分发。

主照片02的后机身可读“141（中島製）”，只在照片所见一侧复原；前缀辨作“機番”，因小字清晰度有限保留推定，字形采用项目 Noto Sans 源字体近似。照片01的另一套大号数字和尾翼文字不移植到此版本。此标记不用于推断部队或滕县参战。

## 交付与坐标

- 运行时：[Model_NakajimaKi4.glb](Model_NakajimaKi4.glb)，自包含 BaseColor、OpenGL tangent Normal 和 ORM（R=AO/G=Roughness/B=Metallic）。
- 可编辑高源：`C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/NakajimaKi4/Scene_NakajimaKi4.blend`；24张贴图已打包，保留独立网格、曲线、UV、材质和作者脚本。
- 高质量导出：同目录 `Exports/Model_NakajimaKi4High.glb`。游戏版独立派生，只合并相同父节点/材质的静态件，不合并铰链。
- Blender：米制，X向右、+Y机首、Z向上。glTF：X向右、Y向上、**-Z机首**。原点位于地面基准上的机身中线；游戏版无整体缩放。
- 实测字节、三角面、尺寸、贴图指纹和误差见 `Data_ExportAudit.json`。派生的双向顶点到表面误差按部件逐一测量；这不是数学上完整的 Hausdorff 证明。

## 可动节点

| 节点 | glTF局部轴 | 演示范围 |
| --- | --- | --- |
| `Pivot_Propeller` | -Z | 连续旋转 |
| `Pivot_WheelLeft` / `Pivot_WheelRight` | X | 独立轮转，滚动半径0.43m |
| `Pivot_Rudder` | Y | ±25° |
| `Pivot_ElevatorLeft` / `Pivot_ElevatorRight` | X | ±25° |
| `Pivot_AileronLeft` / `Pivot_AileronRight` | X（斜向铰链的局部轴） | ±18°验收，左右反向 |

副翼与垂尾具有非零安装方向。驱动时在节点原始四元数后乘局部轴旋转，不用新的Euler值覆盖原始姿态。精确生产批次、颜色、座舱内饰、隐藏五金与尾部运动间隙未由照片证实，均为推定；演示范围不作原厂操纵限值引用。

## 重建与复核

从本任务 worktree 根运行；源 `.blend` 始终写到上述 OneDrive 独立目录。

```powershell
python Taierzhuang1938/_blender/Script_NakajimaKi4Textures.py
node scripts/Script_BlenderMcp.mjs start --task NakajimaKi4
node scripts/Script_BlenderMcp.mjs exec --code "import os; os.environ['KI4_STAGE']='pbr'"
node scripts/Script_BlenderMcp.mjs exec --file Taierzhuang1938/_blender/Script_NakajimaKi4Build.py
node scripts/Script_BlenderMcp.mjs stop
node scripts/Script_BlenderMcp.mjs start "C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/NakajimaKi4/Scene_NakajimaKi4.blend" --task NakajimaKi4
node scripts/Script_BlenderMcp.mjs exec --file Taierzhuang1938/_blender/Script_NakajimaKi4Audit.py
node scripts/Script_BlenderMcp.mjs stop
node scripts/Script_BlenderMcp.mjs status --scan
python Taierzhuang1938/_blender/Script_NakajimaKi4Receipt.py
node Taierzhuang1938/Script_NakajimaKi4AssetTest.mjs
```

纹理脚本需要 NumPy/Pillow，以及项目字体说明中的 NotoSansSC-Bold.otf（首次放到 `tmp/fontsrc/`，随后归档至本资产 OneDrive 的 Fonts 目录）。BlenderMCP代码执行的环境变量在进程中保留；灰模用 `KI4_STAGE='gray'`，仅灰模通过后再切PBR。最后的 Audit 导入是临时验收状态，不再保存覆盖作者源。

材质分区为铝皮、银漆布翼、黑漆机罩、钢件、机加工金属、橡胶、皮革和热氧化排气管。布纹尺度、漆边露金属、维修口擦伤、排气积污和局部铁氧化分开烘焙；不是一层全表面统一噪声，也未在BaseColor中烘灯光。具体色相无法从黑白/褐色照片证明。

本地实时比较页、截图、运动报告均在忽略目录或 OneDrive Evidence 中，不随 GitHub Pages 发布。验收使用实际重导入的 GLB，包括静态对照、局部PBR、52个单部件采样与9个舵面组合；不能把导出成功当作参考匹配通过。
