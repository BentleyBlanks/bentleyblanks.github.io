# Nakajima Ki-4 / 九四式侦察机

## 当前 V48 游戏接入（2026-10-28）

当前完整游戏版为 **179679 三角、40 网格、43 张内嵌 PBR/AO 图、10 个真实枢轴**，登记在“高级工具 → 构件库预览 → 模型 → 九四式侦察机 · 141（参考复原）”。按需加载，沿用原生材质和 UV；既有任务机型保持原配置。

已重开高源和游戏源，并用实际 GLB 检查 80 个有限动作姿态、10 个维修口与全部清晰出口射线、252 个发动机部件的机罩净空；副翼近铰链 176 个光滑表面法线查询沿用原 5°／1.5mm 范围，保存低源到实际导出的法线另作一致性检查。保留全部 216 片散热片和 1512 颗三层实体铆钉。游戏合批烘入固定基准矩阵，按原面／角点保存法线与部件三角范围，不跨真实活动枢轴。GLB 保持自包含，AO 的 PNG 存储转换保留解码后的全部 RGBA8 像素与原尺寸。

当前高源在 `C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/NakajimaKi4/ReferenceV48_GameRelease/Scene_NakajimaKi4.blend`；完整游戏低源在同目录 `Game/Scene_NakajimaKi4.blend`，未合批低源为 `Game/Scene_NakajimaKi4Parts.blend`。正式字节、尺寸和检查身份见 [导出收据](Data_ExportAudit.json)，重建输入见 [交付配方](Data_ReleaseRecipe.json)。从完成高源重建到独立目录：

```powershell
node Taierzhuang1938/_blender/Script_RebuildNakajimaKi4.mjs
node Taierzhuang1938/Script_NakajimaKi4AssetTest.mjs
```

**没有宣称原照逐点完全一致。** V47 的翼缘、尾翼、辅助图桨叶及阴影仍有原门槛外偏差，数值和历史推定边界保留在 [当前复核记录](Data_ReferenceReview.json)。本次维修口和低模派生不重新定义参考点、不放宽原摄影门槛；下方 SurfaceV2 和 V30–47 均为历史过程。此前正式 GLB 与配套说明已保存在外置 `ArchiveSurfaceV2BeforeV48/`。

本资产仅为 **Ki-4 裸轮陆基构型的同型外形复原**。照片不属于滕县现场；模型不证明它已参加滕县城内攻城，也不改变现有任务使用的 Ki-30。主参考为 Notion 资料页三张 Commons 照片，版本、尺寸锚点、冲突与推定见 [Data_ReferenceContract.json](Data_ReferenceContract.json)。

## 原始依据

- [Notion 资料页](https://app.notion.com/p/40260335331c81ce8b26eb0e1cd6f9cb)。已纠正原来的“下单翼”；实图与原件均为错列不等翼双翼结构。
- [陸軍航空本部《九四式偵察機説明書》1937年5月改订本](https://dl.ndl.go.jp/pid/8815746)，[NDL 馆藏目录](https://ndlsearch.ndl.go.jp/books/R100000002-I024881858)，原件 USB-13 R213:0837–0998 / RG243。
- 扫描第5页（书内第1页）：上翼展12.000m、下翼展8.520m、全长约8.250m、高约3.310m、轮距2.250m；表列翼弦上1.720m/下1.240m、气动力平均翼弦1.580m。
- 扫描第6页：翼间隔约1.595m、错列约0.4725m、后退0°、上反4°、上/下翼安装角2°/4°，垂直尾翼左3°40′。NACA M6 坐标来自 [UIUC 数据库](https://m-selig.ae.illinois.edu/ads/coord/nacam6.dat)。
- 扫描第64/68页：机身；72–75页：翼与撑杆；83–84页：尾翼；86页：主起落架，89–90页：尾橇；96页为方向舵操纵装置。翼图最大弦约上2.000m/下1.250m，不把轮距当作上翼弦长。
- 翼肋按上翼1–38、下翼1–23的编号与翼端加密关系复原；可读的上翼端196/204/178/160/98mm间隔沿用，尚不能精确辨读的内部站位按扫描图比例校准，不伪称完整工厂尺寸测绘。

现代汇编常见7.73m/3.50m，与原始说明书不同。本模型采用上述原件的一套锚点，不拼接两套尺寸。三张原图、相关原始图页、辅助三视图及其来源/哈希保留在本机 References 目录，未随站点分发。

主照片02的后机身可读“141（中島製）”，只在照片所见一侧复原；前缀辨作“機番”，因小字清晰度有限保留推定，字形采用项目 Noto Sans 源字体近似。照片01的另一套大号数字和尾翼文字不移植到此版本。此标记不用于推断部队或滕县参战。

## 交付与坐标

- 运行时：[Model_NakajimaKi4.glb](Model_NakajimaKi4.glb)，自包含 BaseColor、OpenGL tangent Normal 和 ORM（R=AO/G=Roughness/B=Metallic）。
- SurfaceV2 历史可编辑高源：`C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/NakajimaKi4/SurfaceV2/Scene_NakajimaKi4.blend`；30张贴图已打包，保留独立网格、曲线、UV、材质和作者脚本。
- 高质量导出：同目录 `Exports/Model_NakajimaKi4High.glb`。游戏版独立派生，只合并相同父节点/材质的静态件，不合并铰链。
- Blender：米制，X向右、+Y机首、Z向上。glTF：X向右、Y向上、**-Z机首**。原点位于地面基准上的机身中线；游戏版无整体缩放。
- 实测字节、三角面、尺寸、贴图指纹和误差见 `Data_ExportAudit.json`。派生的双向顶点到表面误差按部件逐一测量；这不是数学上完整的 Hausdorff 证明。
- V1 原始 `.blend` 仍保留在上一层；其正式 GLB、原收据与说明完整归档在上一层 `ArchiveV1/`，Git 基线为 `3bdd77c9`。V2 未覆盖这份源工程。

## SurfaceV2 材质依据

2026-10-24 复核版保留原说明书外形与八个铰链，细化表面材质。[SDASM 馆藏扫描01_00086146](https://www.flickr.com/photos/sdasmarchives/7586032330)与主照片02为同一照片的不同裁切，只作黑白外形依据，不作为另一架独立机体或彩色材质的证据；[TTTNIS 的光三发动机照片](https://commons.wikimedia.org/wiki/File:1936_Nakajima_Hikari_3_01.jpg)和 [Poly Haven brown_leather](https://polyhaven.com/a/brown_leather)仅作现代材质类比，均为 CC0。皮革作者为 Rob Tuytel，原样本覆盖 0.4m。

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

## SurfaceV2 历史重建命令

仅供历史追溯；当前交付使用上方 V48 重建入口。

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

## 本地自由外倾与加载灰模 V30（未提升为正式资产）

V28已按原图修正主V架的1.200m侧视安装点斜距和前791／后645mm轴线落差。V29进一步按第88图页的自由眼距1020.5mm、弹簧自由长度238.8mm、外筒436.2mm重建缓冲脚柱；长外筒采用断开画法，不能把整图直接按比例量长。上接头33°参考线的垂线用于推定轴向。V30按第86图页加入飞行状态4°轮外倾及相应的倾斜固定轴。载轴座放到旋转轮件内侧，固定车轴与轮件分开，并补出下连接叉槽和隐藏轴孔；这些站位、圈数、半径与五金尺寸仍属装配复原。这是自由尺寸几何基准，照片加载、停机姿态、光照和整机外形仍待核实，正式GLB未替换。

可编辑工程在 `C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/NakajimaKi4/ReferenceV30/Scene_NakajimaKi4.blend`。重开源工程核验了眼位、弹簧包络、外筒长度、封闭部件、4°轮件姿态和三个轮转姿态的倾斜轴孔间隙。其余894个源网格、37张图和10个控制保留。灰模游戏派生为188792三角、39网格；保留1512颗铆钉及三层高度环，低模改为5边环，实际高到低表面误差约0.535mm，仍满足原0.8mm门禁。新几何PBR／AO与完整运动、整机参考验收尚未完成。

V29、V30均以受哈希保护的V28源副本独立更新，入口为 [OleoUpdate](../../_blender/Script_NakajimaKi4OleoUpdate.py)，构造在 [Oleo](../../_blender/Script_NakajimaKi4Oleo.py)，派生在 [OleoLod](../../_blender/Script_NakajimaKi4OleoLod.py)，[OleoCompose](../../_blender/Script_NakajimaKi4OleoCompose.mjs)复用未改动的几何和图片原字节并实际合批。V28依赖的 [MainGearUpdate](../../_blender/Script_NakajimaKi4MainGearUpdate.py) 与外置V28源仍保留。新建副本、环境、输入指纹及步骤保存在各外置目录的 `Data_BuildRecipe.json`，不替代正式PBR验收。原Notion资料页已同步标注尺寸与推定边界；资料馆原有“同型外观复原、未证实滕县参战”分类保留。

[LoadRig](../../_blender/Script_NakajimaKi4LoadRig.mjs)用于本地机械加载试算：实际V架、车轴、车轮和下眼绕机身连接轴转动，刚性外筒按真实眼距滑移，弹簧沿螺旋线框重算而保留丝径；实际轮胎与尾橇支撑共同解停机姿态。试算保留原照全部标记和误差范围，尚无姿态同时通过轮廓、地面投影与机身翼影验收。1194mm横向标注与140mm轮廓偏移仍待完整状态解释；另一窄轮的直径也未确认，未据此替换860×300mm轮胎。所有加载、机位与光照试算均未采用为正式默认。

### V31 起落架材质派生试作（整体尚未验收）

独立 `ReferenceV31` 工程从受保护V30源复制，46个支架、缓冲柱和轮毂零件建立独立2048² AO UV；实际高模按固定件／同轮转组分别烘焙，其余882个源网格及37张原图指纹保持不变。重开源工程的828个独立余弦射线探针与AO贴图比较，RMS约0.030，95%绝对差约0.048，少数紧贴表面仍有较大局部差异。游戏版1157649个覆盖像素有600个在约1.80mm内从真实高面补采样，不能把覆盖检查当成完整AO质量通过。

派生试作为188792三角、40网格、38图、10控制；旧轮毂螺栓AO岛按原像素重排并补算Mikk切线。逐角点复核发现的主UV约定差异和低模自定义法线重编码已修复：游戏主UV按实际保存高模表面重投射，原游戏法线按三角角点直接保留，切线随之正交化。高低模539812个三角逐一核对位置、法线和绕序；46个零件的实际导出UV与保存源／投射记录最大差约6×10⁻⁸。保留件主UV不变，未使用猜测的统一翻转规则。真实浏览器另检查纹理通道与高低模明亮近景；相邻旧表面AO、紧贴处AO差异、完整运动与整机参考验收仍待完成。此试作不替代V30灰模几何基准，也不是正式PBR交付。

入口：[硬件AO](../../_blender/Script_NakajimaKi4HardwareAo.py)、[保存源复核](../../_blender/Script_NakajimaKi4HardwareCheck.py)、[AO岛重排](../../_blender/Script_NakajimaKi4HardwareAoAtlas.py)、[螺栓切线](../../_blender/Script_NakajimaKi4BoltTangents.py)、[源主UV投射](../../_blender/Script_NakajimaKi4HardwareUv0.py)、[合成](../../_blender/Script_NakajimaKi4HardwareCompose.mjs)、[导出角点审查](../../_blender/Script_NakajimaKi4HardwareExportCheck.mjs)。作者工程、试作GLB、重建步骤和失败记录留在OneDrive；验收页与截图不进仓库。

### V32 主V架材质原件纠正（整体尚未验收）

[第10扫描页](https://dl.ndl.go.jp/api/iiif/8815746/R0000010/full/full/0/default.jpg)第53节区分了一号铝合金V型脚柱和容纳缓冲装置的钢管脚柱；此前把两侧主V架也赋了钢材。V32只将这两个部件改用现有铝材PBR，并按铝材微观AO重烘对应区域，缓冲柱钢管保留。现代牌号、漆色、旧损和粗糙度没有由原件确认，通用铝材表面仍是推定。入口为 [VFrameMaterial](../../_blender/Script_NakajimaKi4VFrameMaterial.py)。

V32从受保护V31源独立复制，928个源网格的几何、UV及法线保持一致，926个部件的网格指纹不变，原37张图片原字节保留。高低模仍为351020／188792三角，游戏版40网格、38图、10控制；源主UV、原游戏法线保留和逐三角核对继续执行。实际浏览器核对了两侧主V架的铝材角色及相同机位／光照下的高低模近景；这不构成整机参考、完整运动或全表面AO验收。

第54节同时说明缓冲脚柱两端为万向连接，57°仅为当前安装复原，不能因与33°参考线垂直而称为原厂飞行轴向。第86图页的140mm尺寸线连接两条轮胎外廓底部基准，具体加载状态对应仍未解清，不作缓冲行程或轮心高度的直接依据。自由轮高度／柱轴方向联合试算没有改善整体匹配，未改动实际几何；当前翼缘、地面叠影及辅助视角仍待迭代，正式GLB未替换。

### V34 硬件AO图块修复（整体尚未验收）

独立栅格核查发现旧硬件AO的UV1存在内部覆盖：高模9284像素、最多9层，游戏版1716像素，主要来自弹簧绕圈的投影重叠。V34将弹簧按真实螺旋相位和丝径圆周角展开，端盖独立分区；其他图块只拆分实际相交的投影面，重新合排。另给微小／塌缩图块至少4像素的包围框采样面积，避免几何细面没有覆盖任何像素中心。只改AO UV1和遮蔽图，几何、主UV、法线、材质类别和10控制保留。

实际高低GLB的46件硬件AO内部重叠均为0；高模覆盖1924441、游戏版覆盖1209243个内部像素。高模828个独立射线探针RMS约0.0223、95%绝对差约0.0461；最大约0.228仍位于连接壳紧贴处，不能据此称全表面AO通过。游戏AO的646个漏射像素从实际高面约1.83mm内补采样。高低模539812个三角、主UV及原游戏法线继续核对，实际浏览器重核了AO通道、铝材角色和高低模近景。相邻旧表面AO、完整运动与整机参考仍未完成。

作者工程在 `C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/NakajimaKi4/ReferenceV34/Scene_NakajimaKi4.blend`。图块入口为 [HardwareUv1](../../_blender/Script_NakajimaKi4HardwareUv1.py)，保存源更新为 [HardwareUv1Update](../../_blender/Script_NakajimaKi4HardwareUv1Update.py)；其他派生入口沿用V31／V32。V31、V32与中间V33源保留，当前试作未替换正式资产。

### V35 轮胎AO修复（整体尚未验收）

原有轮胎AO在部分侧面偏暗，独立当前轮组射线约0.95时，旧图约0.53；这些位置不存在UV重叠。V35只为两侧轮胎建立连续圆周／胎面AO图块，按实际轮组128射线、2m范围重烘，几何、主UV、法线及基础色／法线贴图／粗糙度保留。保存后重开源工程的192个256射线探针，两侧RMS从约0.105／0.087降至约0.0076，最大绝对差约0.028／0.025。新图实际高低模均覆盖1999872个内部像素，重叠及零采样三角均为0；圆周接缝最大差约0.020。

高低模539812个实际三角的几何、法线、已有切线、主UV和世界矩阵按字节核对；只有1792个轮胎三角的AO坐标改变，其余AO坐标保留。原38张图片原字节保留，游戏轮胎与原有胎侧细线拆为各自批次，仍为188792三角、42网格、39图、10控制。实际浏览器核对AO通道、图尺寸及高低模相同机位近景，轮胎沿用基线的法线贴图导数计算方式。新AO不是对整机材质的批准。

作者工程在 `C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/NakajimaKi4/ReferenceV35/Scene_NakajimaKi4.blend`；入口为 [TireAo](../../_blender/Script_NakajimaKi4TireAo.py)、[合成](../../_blender/Script_NakajimaKi4TireAoCompose.mjs)、[实际导出检查](../../_blender/Script_NakajimaKi4TireAoCheck.mjs)。V34保留。旧AO图集的剩余1458个重叠像素已定位到尾橇鞋，机身旧遮蔽、部分微小板边的采样和全表面检查仍待完成。

另用当前V34几何、真实轮胎／尾橇接地和原观测点重新拟合辅助照片03，仍有机翼局部约20像素偏差。推力线／机身轴线安装假说在主图与辅助图未取得一致，未据此改变形状、安装角、停机姿态或默认相机。原主图观测、整机投影与完整80操纵姿态验收继续保留，正式GLB未替换。

### V36–V37 尾橇鞋AO及接缝（整体尚未验收）

尾橇鞋原有的厚度修改器生成了背面与侧壁，却复用了正面AO坐标，造成上述1458个重叠像素和20个退化三角。V36保留本地推定的6mm厚度，将实际评估网格显式化，为18个表面分配独立AO图块并按实际固定组重烘。原4片可编辑曲面与厚度修改器另保留在源工程隐藏的修改器参考层；导出仍使用原有36个三角，位置、法线、主UV及已有切线字段保留。保存源重开的36个256射线探针，RMS从约0.339降至约0.0124，最大绝对差约0.0264。

V37沿同材质、平滑相邻的36条物理边界过滤AO接缝，保留几何与两个UV层。实际PNG抽样接缝最大差约0.0030，密集边界约0.0032；面内探针误差保留。游戏派生为188792三角、43网格、40图、10控制，只有一张尾橇AO图片在V37改变，其他39张图片与V36原字节相同。高低模旧有的约1μm位置／微小法线数值差分别保留，没有用高模法线覆盖原游戏字段。实际浏览器重核了512² AO、通道1和高低模近景。

当前完整打包源为 `C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/NakajimaKi4/ReferenceV37_Repacked/Scene_NakajimaKi4.blend`。初次V37保存时，外部PNG已更新但旧packed数据未替换；已复用完成的PNG重新打包到这个独立工程，并重开核对。无后缀的V37为该次未更新packed数据的中间记录，不作当前源。入口：[ShoeAo](../../_blender/Script_NakajimaKi4ShoeAo.py)、[ShoeAoCompose](../../_blender/Script_NakajimaKi4ShoeAoCompose.mjs)、[实际导出检查](../../_blender/Script_NakajimaKi4ShoeAoCheck.mjs)、[接缝](../../_blender/Script_NakajimaKi4ShoeAoSeams.py)、[单图合成与字节检查](../../_blender/Script_NakajimaKi4ShoeAoSeamsCompose.mjs)。

当前高模四张实际AO图均无内部重叠；游戏旧4K图仍有383个重叠像素，涉及机身、尾翼与胎侧细线，新轮胎／尾橇及硬件图未发现重叠。原图的微小／退化表面采样、旧机身遮蔽、完整运动与整机外形仍未完成，不能把这轮局部材质修复当作参考一致性通过。三张原照的观察点和误差范围保留，加载、推力线及相机假说仍未采用。

### V38 尾橇原件尺寸灰模（整体尚未验收）

重新观察[第89图页](https://dl.ndl.go.jp/api/iiif/8815746/R0000089/full/full/0/default.jpg)后，核实上眼在机身轴线以上307mm、V型支柱上端横向安装点间距330mm；此前模型分别为215／260mm。独立V38灰模纠正这两个尺寸，重开源工程实测307.0001／330.0000mm。第10扫描页第56节同时说明上端装在第五隔框金具、下部接该框下方V型支柱。26°30′与图中自由／加载位置的对应仍未完全解释，不继续称为已确认的自由飞行轴向；14.5°名义轴向、70mm前后偏移、下支点位置和隐藏连接仍为图面／装配复原。第90图页1000mm的端点与实际鞋底连接站位、图中170mm的状态对应也保留说明，不将其当作已确认原厂行程。

当前13件尾橇机构960个三角单独更新，其余537892个高低模三角的位置、法线、已有切线、两个UV及世界矩阵按实际导出逐一核对，原40张图片保留。低模为188792三角、41网格、40图、10控制。新增尾撑QA机构保持V臂绕机身连接轴刚性转动、杆筒刚性伸缩、鞋底刚性随动，以实际轮胎和鞋底顶点重新求接地；九组主架／尾撑组合的真实浏览器检查通过。0–170mm仅为加载试算范围，非原厂行程认证；实际照片仍未通过，不作默认加载状态。

作者工程：`C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/NakajimaKi4/ReferenceV38/Scene_NakajimaKi4.blend`。入口：[TailDatum](../../_blender/Script_NakajimaKi4TailDatum.py)、[合成](../../_blender/Script_NakajimaKi4TailDatumCompose.mjs)、[实际导出检查](../../_blender/Script_NakajimaKi4TailDatumCheck.mjs)、[加载QA](../../_blender/Script_NakajimaKi4TailLoadRig.mjs)。V37完整PBR源仍保留，V38变更部件的PBR／AO和相邻接触遮蔽待重烘，灰模不代替其材质验收。

辅助照片03的刚性机身／机翼／轮件轮廓，能够被相机外参和机身停机姿态同时变换而保持投影不变，现有观测没有尾橇或独立地面／垂线约束，故不能单独识别尾撑载荷。实际15243点的物理相机变换验证像素差小于10⁻⁸，未做图片变形。主图另保留原墙柱垂线、全部地面投影和明亮地面约束；尾撑加载试算仍未使全部独立组通过，机翼、机身与光影仍需继续迭代。

### V39 两照片与地面影联合诊断（未改入模型）

独立数值求解器从整机与机翼单独匹配的机位出发，固定几何的辅助照片翼缘最大误差仍约18.55像素。分别暂时留出机身下缘、垂尾、轮廓或轮毂等一组后，翼缘仍约12.48–19.22像素，未找到仅移除一组即可同时解释其余观测的结果。径向镜头畸变、像素比例／倾斜、轮架前后位置、发动机安装位置和自由状态边界等诊断也未解决整体失配，均未采用。

后机身的既有摄影外廓原先随固定主图机位拟合，本轮改为两张照片共享同一套外廓与未确定安装参数、各自使用独立物理相机和实际刚性加载。共享外廓幅度的几何诊断将辅助翼缘最大误差降至8.51像素，但原范围仍为7像素；固定这套几何后，原19个地面影边界与4个明亮地面点的独立检查仍有约13.87像素最大偏差。进一步共同拟合原四个外廓站位的平滑曲线和全部地面观测后，辅助翼缘仍约8.30像素、地面影约10.66像素，超过原7／8像素范围，主图和其他辅助组也未全部通过。

这组数值候选还需要约4.21°的推力线／机身轴线夹角；它是未确认的摄影重建参数，不是原厂安装角。原翼展、翼弦、相对推力线的上2°／下4°安装角、4°上反角、机身隔框站位、轮径／轮距及完整发动机尺寸继续保留。没有修改原照、观察点或误差范围，也没有把数值候选作为实际重建、重导入或参考验收通过。

实际阅读[扫描第9幅](https://dl.ndl.go.jp/api/iiif/8815746/R0000009/full/full/0/default.jpg)与[第10幅](https://dl.ndl.go.jp/api/iiif/8815746/R0000010/full/full/0/default.jpg)，确认正文第9页后跳至第14页，正文10–13页的翼组内容缺失。另取得的162页镜像PDF属于同一NDL扫描，并非另一份独立原件。原尺寸表与翼图继续有效；缺页不能用于猜定推力线夹角。另核对的[JACAR运输要目表](https://www.jacar.archives.go.jp/das/meta/C14020820300)含机体／翼组装运记录，未据此更改飞行状态尺寸或消解7.73／8.25米的资料差异。

完整数值结果、原观测文件指纹、缺页证据及本地核对页保存在OneDrive的 `NakajimaKi4/AnalysisV39/`，总记录为 `Data_CameraCalibrationAudit.json`。当前V38几何源、V37_Repacked材质源和正式GLB均保留原指纹；未提交模型更新或发布。精确源重建／重导入、原照片与真实投影、机身留出影边、完整操纵和材质／AO验收仍待完成。

### V40 有源工程的联合安装灰模（未验收，保留候选）

当前独立高源在 `C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/NakajimaKi4/ReferenceV40_Connected/Scene_NakajimaKi4.blend`。它从受保护V38重建，原始348908三角、修改器评估351020三角、928个源网格和40张原打包图均保留；重开源工程逐一核对了928个网格指纹及40张图片。原V38、V37_Repacked、早期V40与正式GLB均保留。高源灰模实际GLB为351020三角，尚无本版游戏派生。

本轮发现仅优化投影的候选会把名义机高推到约3.416米，已拒绝采用；随后将既有整机尺寸门槛直接并入求解和作者工程审查。当前实际重导入尺寸为翼展12.000米、名义机高约3.34999米、长约8.25611米，保留原12米／3.31±0.04米／8.25±0.05米门槛。约4.09°的机身／推力线关系和共享外廓仍是摄影重建假设，不是原厂角度证据。机翼与完整发动机分别刚性安装，原相对上2°／下4°安装角、上反角、翼形、隔框站位和机轮原件尺寸继续保留。

实际网格检查确认旧脚点使四根舱间支柱下端离机身表面约44／80毫米。连接修正版沿原杆轴与真实机身网格求交，再将端部接入结构空间；四个实际导出端盖均位于机身外廓以内，上翼端点保持。杆截面不变，主UV按实际椭圆周长与新轴向长度展开；内部套接方式属于复原。1512个铆钉以刚性分量跟随新表面，135个无关源网格加8个零位移部件保持原指纹。入口为 [DatumCandidate](../../_blender/Script_NakajimaKi4DatumCandidate.py)，重开审查为 [DatumSourceCheck](../../_blender/Script_NakajimaKi4DatumSourceCheck.py)；参数、输入哈希与执行步骤归档在外置工程的 `Data_BuildRecipe.json`。

左右独立主架载荷已在真实导出网格上检查10组状态，由两轮和尾橇共同解水平地面的停机仰角、侧倾与位置。新高源实际重导入另通过10个枢轴的30个单件刚性采样及尺寸检查，不能替代完整80组合净空验收。主照片的遮挡桨相位在比较页明确标为推定，未当成原厂设置；其地面影仍需按实际姿态复核。

形态尚未通过：实际高源主图可见翼缘含肋带约6.72像素、辅助翼缘约7.27像素，仍超过原6／7像素范围；机罩、机轮、其他可见舵面／尾翼、完整影边和辅助机位继续检查。灰模保留中性玻璃角色，导出不包含本轮重烘的表面贴图；原40张图的保留只证明输入未丢失。变更部件及邻接面的PBR／AO、完整运动、180k游戏派生、正式登记与发布仍未完成，本版未提升为正式资产。

### V41 水平尾翼安装站位（未验收，保留候选）

正文第14页说明左右升降舵通过各三个铰链接在第六隔框的水平安定板后梁安装轴管；第83图页的660毫米为安装轴间距，邻接60毫米为后方铰链偏距，不是根弦。结合第94图页的安装关系，独立V41将固定水平尾翼和左右升降舵安装轴整体前移360毫米，铰链机身坐标Y由−4.025改为−3.665米。两根尾翼斜撑保留原机身脚点并接到新尾翼接点；绝对高度与安装角仍未由原件确定，本轮未采用数值试算的高度和角度。

可编辑源在 `C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/NakajimaKi4/ReferenceV41_TailStation/Scene_NakajimaKi4.blend`。已重开核对928个源网格和40张原打包图；仅6个尾翼网格变化，922个其他网格保留V40指纹。实际高源GLB重导入为351020三角，名义尺寸仍为12.000／3.34999／8.25611米；源工程和实际GLB的九组方向舵／升降舵极限组合均未发现尾部相交，实际浏览器另通过30个单件枢轴采样。这些不替代完整80组合验收。重建与核对入口为 [TailStation](../../_blender/Script_NakajimaKi4TailStation.py) 和 [TailStationCheck](../../_blender/Script_NakajimaKi4TailStationCheck.py)。

补充主图垂尾左缘4点、水平尾翼上缘12点和辅助图尾翼上缘7点后，发现此前未完整覆盖的偏差：旧机位下实际主图垂尾顶端约47.46像素、水平尾翼约25.38像素，辅助尾翼约15.14像素。主图旧顶端估点曾由早期几何代入，不能用它证明当前实际网格相符。新增圆弧翼尖点使用连续的二维轮廓距离，其原像素与7像素不确定度保留；其余既有扫描线量测和全部原误差范围保留。两图联合机位、舵角、包络及安装试算仍未通过，未写入作者工程或提升为正式资产。

[EngineLodStudy](../../_blender/Script_NakajimaKi4EngineLodStudy.py)另验证252件发动机零件的细分减面可行性，保留9缸、216片散热片、9个摇臂罩和18根推杆；逐顶点、边中点与三角中心的双向表面采样最大误差约1.878毫米，低于原2毫米范围，各件闭合且体积为正。若其余派生面数不变，可从旧188792三角节省8928至179864三角；这是预算试算，尚无完整V41游戏派生、UV／法线／AO迁移或材质验收。完整照片、影边、PBR／AO、全组合操纵及发布仍待完成。

### V42 三图联合曲线源（未验收，当前可编辑灰模候选）

源工程在 `C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/NakajimaKi4/ReferenceV42_ThreePhotoShape/Scene_NakajimaKi4.blend`，保存后的SHA256为 `678846bfd6430719a6d6133f028ad94307dda95c0f4cd14aacae6d58e1f40f05`。从受保护V41重建机身包络、机翼／完整发动机安装、未标尺寸的方向舵后缘和水平尾翼外段，保留12米翼展及原高度／机长门槛；方向舵高度1808.5毫米、最大后弦约875毫米、前平衡部205毫米及真实铰链保留。未标曲线、安装高度和角度仍属摄影复原，不能称为原厂测绘。

已重开逐一核对928个网格指纹与40张原打包图；792个网格变化，136个保留V41指纹，其中128个属于受保护的不相关网格。六根连接杆重接到实际机身／尾翼表面，截口顶点已检查进入实体蒙皮；1512颗铆钉按刚性分量随皮肤更新。原清玻璃角色保留，源工程在导出中性灰之前保存。源与实际GLB的九组尾部组合净空、实际浏览器三十个单件枢轴采样通过；导出为351020三角，名义尺寸约12.000／3.34964／8.25373米。三图实际导出量测与数值候选最大差约0.000059像素；这只证明重建和导出相符。

原参考误差仍未全部通过：主图翼缘约8.38像素、机罩约14.16像素，辅助图翼缘约9.02像素，均超原6／12／7像素范围。另补测十个可见尾翼下缘点，发现上缘单独拟合会漏掉升降舵宽面板；在原±25度范围内调整舵角能改善下缘，但上下缘尚未同时全部通过。包含新下缘的下一轮数值拟合已完成，仍有超差，尚未写入作者工程。

实际浏览器351010个不透明三角已用于完整投影与几何射线复核。沿扫描线的误差和原二维边界距离不能混用；原二维影边仍约10–12像素，并非通过。独立七个机身影边点最大误差约10像素，也超过原6像素范围；光源和机位试算未采用。新增几何的PBR／AO、相邻接收面、完整80组合操纵／开口净空及180k游戏派生仍待完成，正式资产和线上版本保持原值。

重建与核对入口为 [ThreePhotoShape](../../_blender/Script_NakajimaKi4ThreePhotoShape.py)、[ThreePhotoSourceCheck](../../_blender/Script_NakajimaKi4ThreePhotoSourceCheck.py) 和 [DatumMetadata](../../_blender/Script_NakajimaKi4DatumMetadata.py)。最后一步仅校正实际安装矩阵等元数据，原源工程和灰模已在外置目录归档，GLB几何二进制逐字节保留；新文件身份已重新核验。以上均为局部技术证据，不能替代整机形态、材质与全部原照验收。

V42另导出实际PBR诊断视图：沿用原底色、法线、金属度和粗糙度输入，将待重烘的25条几何AO分支临时中和，未保存回作者工程。轮胎底图sRGB平均约14／255，实际平均线性亮度约0.00466；额外RGB通道试算在正确的线性空间放大约4.293倍，解码后均值约0.02004，保留细节、原alpha和全部几何／UV／法线／粗糙度／金属度。该值用于改善过黑橡胶的物理输入，不是原机反射率实测；实际浏览器三图已出诊断，尚未采用为正式材质。轮毂和轮辋沿用氧化钢材质，仍需结合原件和照片辨别。原40张打包输入与正式资产均未覆盖。

### V43 轮胎反射率工作源（局部修正，整机仍未验收）

独立可编辑源为 `C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/NakajimaKi4/ReferenceV43_RubberReflectance/Scene_NakajimaKi4.blend`，SHA256 为 `352d0be61571ce955a4655239c681a73e1d006b2ab8209c445713da54100b8a9`。只把已检查的约2%线性反射率轮胎底色写入工作源；928个网格及全部UV、法线、变换保持V42指纹，40张原图逐字节保留，另加1张修正底色。实际重开检查通过。该数值仍是PBR复原选择，不能当作原机橡胶实测值。

源工程保留原AO节点，并明确标记修订几何仍待重烘。另从该源导出临时中和旧几何AO的诊断GLB，SHA256 为 `34a730dd30c3b6564a0322652de56cc1a300aa4849cfa8c5b84483e2a47e116b`。导出器重开后产生的6处UV／切线末位差及2个重合顶点索引选择已恢复到V42原数据；独立核对5173个几何属性／索引访问器逐字节一致，材质仅轮胎底色不同，解码像素与先前试样完全相同。实际三图渲染无页面错误；这不等于整机参考或完整PBR验收通过。重建入口为 [RubberReflectance](../../_blender/Script_NakajimaKi4RubberReflectance.py)、[RubberExportStable](../../_blender/Script_NakajimaKi4RubberExportStable.py) 与 [RubberReflectanceCheck](../../_blender/Script_NakajimaKi4RubberReflectanceCheck.py)。原始重导文件留在外置源的 `Exports/`，不覆盖正式游戏资产。

原说明书扫描14页、书内22页第93条已复核为金属制双叶分离式螺旋桨，未在该条获得具体合金、涂层或桨距数值。新桨叶轮廓试算的叠图发现部分新增采样落在叶片内部，暂列待重描草稿，不能把其误差当作正式验收门槛；原有三图／尺寸／阴影门槛均未改动。轮毂材质仍未查实，未因发黑而改成铝。翼缘、机罩、尾翼、阴影、修订AO、完整操纵及180k派生仍待完成，本轮没有提交或推送。

### V46 完整桨叶外缘工作源（当前候选，整机未验收）

当前源工程为 `C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/NakajimaKi4/ReferenceV46_FullBladeOutline/Scene_NakajimaKi4.blend`，SHA256 为 `06ba44dbc3b92e733725b7acba375433634f11589a3a88d2c4dcf5edee8b69df`。只重建两片桨叶，其余926个网格指纹保持V43；保留41张既有图，新增一张桨叶组件AO，实际重开为928网格／42张打包图。高源导出354832三角，每片新桨叶1950三角，闭合且体积为正；根部进入原桨毂。源与实际GLB的24个旋转位置无桨叶—机罩或桨叶互交。新UV、单位正交法线／切线、±1手性、3946个实际解码AO接缝样本通过；最大接缝差小于1字节。底色、法线、粗糙度和金属度沿用先前机加工材质，几何AO仅由同一旋转组件烘焙，未烘入随桨转变化的机罩／地面阴影。

当前PBR诊断GLB的SHA256为 `ad2120e62e6ac2a39cfae8c5eaae34b1b1ba604b554df6d1b293cfdfd0365430`。导出器浮点合包产生的2099个AO像素1字节差异已逐像素恢复为烘焙PNG值；所有原二进制前缀、访问器、网格、节点、材质／采样器绑定和G／B／alpha保留。其他修订几何AO仍只在诊断导出中临时中和，源工程保留待重烘节点，不能称为完整PBR验收。重建顺序为 [PropellerSection](../../_blender/Script_NakajimaKi4PropellerSection.py)／[PropellerSectionUpdate](../../_blender/Script_NakajimaKi4PropellerSectionUpdate.py)，再运行 [PropellerAoCompose](../../_blender/Script_NakajimaKi4PropellerAoCompose.py) 并用 [PropellerSectionCheck](../../_blender/Script_NakajimaKi4PropellerSectionCheck.py) 重开、导入实际成品核对；已保存目录不可覆盖，下一轮须使用新配方目录。

参考覆盖已扩大：最初25个边缘点通过的V45仍漏过主图桨叶左弧，补测后该弧最大差约14.28像素。V46保留原25点及5像素不确定度，加入5个左弧点，按实际三角面外缘检查30点：主图右／上弧约5.43像素、左弧5.11，辅助图两片约5.21／5.80，端部约4.87；因此5像素门槛仍失败。V46作为覆盖更完整、整体更接近的工作候选保留，未把原25点通过当作桨叶完成。桨毂比例、完整前端外观、第三张照片的桨叶及材质观感仍待复核；叶形、截面、轴向安装、非线性扭转和直径均为摄影复原，不能称为原厂尺寸。

本地三图参考姿态也改为共同检查尾翼上下缘：升降舵约21.185°／25°／25°，实际下缘最大差约1.75／3.74／5.38像素，均在原7像素内；上缘仍约9.56／8.50／14.41像素，未通过。仅改变既有真实舵轴的参考展示角度，没有修改尾翼网格、原点、照片或不确定度。主翼约8.38／9.02像素、主图机罩约14.16像素等原失败继续保留；影边、新几何整体AO、全80组合／开口、完整UV／法线、180k游戏派生及发布仍未完成。旧179864三角预算针对旧88三角桨叶，新源两片合计3900三角，不能沿用旧预算作为当前派生已达标的证据。本轮仍未提交或推送。

### V47 三图联合整机工作源（当前候选，参考仍未全部通过）

当前源工程为 `C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/NakajimaKi4/ReferenceV47_AirframeJoint/Scene_NakajimaKi4.blend`，SHA256 为 `a201fe342341ccd198f41e53b0bea3eb89c43979a83de3bac36d0f462a48b97c`。当前PBR诊断GLB的SHA256为 `bbd1937b9d7f4a3919c42ec3ba920beafe7798ee5110484c272e217bfb4b9d41`，灰模为 `deee27275e93e9664e560b620d76ecc4df01ad3e032006f15dbf906d3ac538a1`。实际重开928网格／42张打包图，保留41张非桨叶AO输入，重新烘焙桨叶组件AO；相对V46有792个网格的几何或安装指纹变化，128个其他网格保留。仍为354832三角，实际名义尺寸约12.000／3.34950／8.25375米，原尺寸范围保留。

本轮共同更新机身上下包络、机翼与完整发动机的共同基准、尾翼安装和未标尺寸的机罩前段曲线，保留印制翼安装角关系、第六隔框／60毫米铰链位置、真实舵轴和548毫米发动机机匣／安装段。机罩前段约前移49.7毫米、局部半径减约20.0毫米，属于照片复原；发动机、机匣和桨毂端盖尺寸没有为此缩短。六根连接杆已重接入实际机身／尾翼蒙皮，1512颗铆钉按刚性分量随表面更新。源和实际重导入GLB的九组尾部极限组合、24个桨叶旋转位置及机罩对252件发动机零件均无相交；实际高源GLB另完成62个单关节和18个组合姿态采样，共80项无相交。轮轴承预期接触未用静态相交测试判定，有限采样不等于连续运动或未来低模已通过。

实际浏览器量测与数值重建最大差约0.000081像素。主图机罩最大误差由V46约14.16降为11.33像素，进入原12像素范围；前斜视尾翼上缘由14.41降为7.07像素，但仍略超原7像素，下缘约7.12也未通过。其他两图尾翼上下缘约9.50／6.85与8.92／6.44像素；翼缘约8.16／9.15像素、主轮约6.13像素、辅助图桨叶约5.14／5.56像素等仍有失败。照片、参考点、不确定度和门槛均未改动，不能把改善或技术检查当作整机参考验收。

独立方向舵外包络积分更新了切口前面积，实际侧面积保留率约99.38%，原98%门槛不变；原始元数据版本留在外置归档中。机身／机翼／尾翼等其他几何AO仍待重烘，诊断导出只临时中和这些旧AO，不能称完整PBR交付。新桨叶的解码像素、3946个AO接缝采样、UV／单位正交法线与切线通过；全整机UV／法线、开口、实际影边、≤180k低模及最终上线仍待完成。重建入口为 [AirframeUpdate](../../_blender/Script_NakajimaKi4AirframeUpdate.py)、[PropellerBake](../../_blender/Script_NakajimaKi4PropellerBake.py)、[AoCompose](../../_blender/Script_NakajimaKi4PropellerAoCompose.py)、[AirframeCheck](../../_blender/Script_NakajimaKi4AirframeCheck.py) 和 [AirframeMotion](../../_blender/Script_NakajimaKi4AirframeMotion.py)。背面黑漆与机库反射仅做过未采用的照明／材质诊断，没有改写资产来烘入照片阴影。本轮仍未提交或推送。

补充实测仍有明确失败：952个维修口背板三角中心中，6条出口射线被保留的机身蒙皮阻挡；同法复核V46已有3条，V47新增3条，尚未执行后续运行时出口射线通过判定。阻挡已定位到上部百叶组／单孔附近，下一轮应切除真实残片，不能用深色材质代替开口。检查入口为 [AirframeServiceCheck](../../_blender/Script_NakajimaKi4AirframeServiceCheck.py) 与 [ServiceDiagnostic](../../_blender/Script_NakajimaKi4ServiceDiagnostic.py)。当前354822个实际不透明三角的阴影掩模也未通过原19点／4像素极性要求，独立7个机身影边点最大约10.39像素，超过原6像素。光源试算改善了前方两条影带，但左圆端和机身影边仍失败，未采用。沿扫描线的坐标差与最短二维影边距离属于不同量测，不能相互替代或用局部改善宣布阴影通过。
