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
- 当前 SurfaceV2 可编辑高源：`C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/NakajimaKi4/SurfaceV2/Scene_NakajimaKi4.blend`；30张贴图已打包，保留独立网格、曲线、UV、材质和作者脚本。
- 高质量导出：同目录 `Exports/Model_NakajimaKi4High.glb`。游戏版独立派生，只合并相同父节点/材质的静态件，不合并铰链。
- Blender：米制，X向右、+Y机首、Z向上。glTF：X向右、Y向上、**-Z机首**。原点位于地面基准上的机身中线；游戏版无整体缩放。
- 实测字节、三角面、尺寸、贴图指纹和误差见 `Data_ExportAudit.json`。派生的双向顶点到表面误差按部件逐一测量；这不是数学上完整的 Hausdorff 证明。
- V1 原始 `.blend` 仍保留在上一层；其正式 GLB、原收据与说明完整归档在上一层 `ArchiveV1/`，Git 基线为 `3bdd77c9`。V2 未覆盖这份源工程。

## SurfaceV2 材质依据

2026-10-24 复核版保留原说明书外形与八个铰链，细化表面材质。新增 [SDASM 同型照片](https://www.flickr.com/photos/sdasmarchives/7586032330)仍是黑白外形依据；[TTTNIS 的光三发动机照片](https://commons.wikimedia.org/wiki/File:1936_Nakajima_Hikari_3_01.jpg)和 [Poly Haven brown_leather](https://polyhaven.com/a/brown_leather)仅作现代材质类比，均为 CC0。皮革作者为 Rob Tuytel，原样本覆盖 0.4m。

缺少同型彩色近照的部分，以内置 imagegen 的推定三视图和三个材质近景明确表面目标；实际烘焙输入是另生成的平面铝皮、银漆布、机罩漆和钢材四色图集。生成图的错误几何已按实际模型视图修正，尺寸始终以原始说明书为准。三视图原图只留本机；可重建输入和来源记录在 `_import/Source/NakajimaKi4/`，完整提示词在 `_import/Source/NakajimaKi4/Prompts/Texture_NakajimaKi4Surface*.txt`。这些材料不能证明历史漆色、旧损位置或原机座舱皮革。

十套 Base/Normal/ORM 分别用于机身铝皮、银漆布、肋带、机罩漆、机加工铝、铸铝、钢、橡胶、排气管和皮革。拉丝与交错细划痕、板缝及浅铆钉、肋间张紧细褶与针孔、橘皮及漆边露金属、铸造颗粒和热氧化分别制作；颜色、法线与 ORM 的旧损范围对应。机罩、金属圆柱、座舱包边、可变翼弦和排气弯管按米制展开；椭球形坐垫的样本尺度按子午线近似校准。

180k 三角上限保留浅铆钉实体、每缸24片散热片和顺弧排气管。游戏版静态合并为30网格；尺寸、法线、UV、八个铰链及逐像素材质身份由专用门禁检查。参考匹配的逐项观察见 [Data_ReferenceReview.json](Data_ReferenceReview.json)，不是由导出成功或贴图数量自动批准。

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
node scripts/Script_BlenderMcp.mjs start "C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/NakajimaKi4/SurfaceV2/Scene_NakajimaKi4.blend" --task NakajimaKi4
node scripts/Script_BlenderMcp.mjs exec --code "import os; os.environ['KI4_STAGE']='pbr'"
node scripts/Script_BlenderMcp.mjs exec --file Taierzhuang1938/_blender/Script_NakajimaKi4Build.py --timeout 600
node scripts/Script_BlenderMcp.mjs stop
node scripts/Script_BlenderMcp.mjs start "C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/NakajimaKi4/SurfaceV2/Scene_NakajimaKi4.blend" --task NakajimaKi4
node scripts/Script_BlenderMcp.mjs exec --file Taierzhuang1938/_blender/Script_NakajimaKi4Audit.py --timeout 600
node scripts/Script_BlenderMcp.mjs stop
node scripts/Script_BlenderMcp.mjs status --scan
python Taierzhuang1938/_blender/Script_NakajimaKi4Receipt.py
node Taierzhuang1938/Script_NakajimaKi4AssetTest.mjs
```

纹理脚本需要 NumPy/Pillow，以及项目字体说明中的 NotoSansSC-Bold.otf（首次放到 `tmp/fontsrc/`，随后归档至 SurfaceV2 的 Fonts 目录）。BlenderMCP代码执行的环境变量在进程中保留，新进程需要重新设置；灰模用 `KI4_STAGE='gray'`，仅灰模通过后再切PBR。最后的 Audit 导入是临时验收状态，不再保存覆盖作者源。等待 Audit 命令成功返回后才 `stop`。

需要保留当前正式结果时，在本进程执行 Build/Audit 前设置 `KI4_ASSET_ROOT` 为本任务的临时输出目录；普通 Python Receipt/Test 同时设置同名环境变量。`KI4_SOURCE_ROOT` 可选，用于另建外置工程；默认是上述 SurfaceV2，绝不回写 V1。

本地实时比较页、截图、运动报告均在忽略目录或 OneDrive Evidence 中，不随 GitHub Pages 发布。验收使用实际重导入的 GLB，包括三视图、局部PBR、宽光和掠射光、52个单部件采样与9个舵面组合；轮动检查刚性、轴心和等速同向，三角穿插检查覆盖舵面／桨叶对静态机体及组合舵面。Receipt 另解码全部30张实际内嵌图，与当前烘焙 PNG 逐像素核对，并检查材质槽的通道对应。
