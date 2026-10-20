# PatchedTimberBed

最终游戏版为 288,799 三角、6 网格／材质／绘制，GLB 24,821,764 字节；原床不计摄影地面为 2,443,300 三角、964 网格、115 材质。高模继续保留，游戏版减面约 88.2%。纹理全内嵌，RGBA8 不计 mip 约 29 MiB。本资产适合按需加载的近景道具，未进行关卡批量布设。

42 个独立接触采样点通过 ±2 mm 门槛。自适应里衬设有 120k 三角预算，全域仍有局部残差；不据采样与目视验收宣称整张表面数学零相交。原版与最终版的同光全景、局部及 WebGL 交互证据只保存在本地。

`Model_PatchedTimberBed.glb` 是可独立加载的完整补片棉被木床，包括木架、草席支撑、枕头、缝线、主被面和脚端垂布。它沿用原选旧式补片棉被、旧木床与草垫的整体创作设计，作为共享 `Model` 资产交付。本目录不包含关卡布设或注册；现有关卡中的程序床也不代表本模型已经接入。

最终文件身份、米制尺寸、面数、材质数、绘制开销、图像哈希与预算以 [Data_Asset.json](Data_Asset.json) 为准。统计应从最终封装 GLB 独立读取，不能用 Blender 原源或中间导出数字替代。

## 加载与坐标

通过 [ManagedGLTFLoader](../../Taierzhuang1938/Script_ModelImports.mjs) 的原生 GLB/PBR 路径加载，并保留模型自带材质。模型单位为米，glTF 使用 Y 向上、X 为床长轴、Z 为床宽轴、+X 为脚端；轴心位于地面与整床 XZ 包围盒中心。

不得使用 `WoodBeam` 等统一材质覆盖，也不能通过仅携带 position/normal/uv 的 TZM 或简化合批丢弃颜色与独立 UV。消费者需要支持 `COLOR_0`、第二组 UV（glTF `TEXCOORD_1` / Three.js `uv1`）、`KHR_texture_transform` 和 `EXT_texture_webp`。原生材质路径应同时保留节点、纹理采样器、纹理通道与法线贴图。

## 材质表示与细节取舍

| 组成 | 游戏版表示 |
| --- | --- |
| Quilt / Straw | 使用 Cycles 将原材质的表面颜色烘入 CORNER 颜色层，显式导出为 `COLOR_0`；保留原有平铺法线与对应 UV。Quilt 再乘既有 BS 纱束的中性细纹图，以独立物理 UV1 保持约 19.627 cm 平铺，并补偿平均亮度。颜色烘焙排除直接光与间接光，不把摄影灯光烘进 BaseColor。 |
| Frame / Pillow / Sewing | 分别建立专属 PBR atlas，烘焙 BaseColor、切线法线和粗糙度，再使用原生 PBR 材质。 |
| BS_FootCloth | 保留 BS 的低频旧化 `COLOR_0`、独立 UV1、Base 纹理变换及原 Normal 采样方式；封装时精确嵌入原 `BS_BaseColor.webp` 与 `BS_Normal.webp` 字节。 |

BS 的 Base 与 Normal 均使用 UV1，但只有 Base 使用 `scale=[0.5240554213523865,0.5240554213523865]`、`offset=[0,0.4759445786476135]`；两张图的变换不能互相套用。原低频角颜色来自 `BR_lowfrequency_corner_colors.npz`，不能改成白色颜色层或仅凭颜色属性存在就视为保留了旧化。

高模保留完整可编辑对象与材质。游戏版通过减面、按组成合并对象及材质重表达降低开销，保留床架轮廓、草席支撑与破口、被面聚拢、脚端垂坠和主要缝边。细纱纤维、细小草茎和高频颜色在游戏版中属于采样及插值近似；纹理无损封装只保证对应图像的解码像素，不意味着减面、角颜色采样或材质烘焙逐像素复现高模。对照验收应同时检查整床轮廓、主要软褶与关键局部。

## 外部源工程

Blender 工程统一保留在仓库外：

```text
C:/Users/Bentl/OneDrive/AI/Models/Blender/PatchedTimberBed20261020/
  Inputs/BN/Restored/Bed_BN_Complete_Editable_Checkpoint.blend
  Inputs/BS/BedBS/BS_material_only.blend
  Inputs/BS/BedBS/BR_lowfrequency_corner_colors.npz
  Inputs/BS/BedBS/BS_BaseColor.webp
  Inputs/BS/BedBS/BS_Normal.webp
  Inputs/BS/BedBS/BS_fiber_bundle_Base_1024.png
  Scene_OriginalBed.blend
  Scene_PatchedTimberBedHigh.blend
  Scene_PatchedTimberBedGame.blend
  Bakes/
```

`Inputs` 是原档的任务副本，作为只读重建输入使用。原 BN/BS 归档位于 `C:/Users/Bentl/OneDrive/AI/Models/Blender/DotsAcceptance20261020/BedBN/Restored/` 与同级 `BedBS/`，不得覆盖；参考图、历史配方及原输入继续保留在原档。`.blend`、自动备份、烘焙过程图和高精度源不进入 github.io 仓库。

`Scene_OriginalBed.blend` 保留变形前的完整原源；`Scene_PatchedTimberBedHigh.blend` 保存合并 BS 与形体修正后的高模；`Scene_PatchedTimberBedGame.blend` 保存游戏版。连续世界坐标变形同时作用于主被面、脚端及对应缝线，摄影地面不参与导出。当前重建脚本同时复制到源目录 `Scripts/` 并嵌入工程 Text。

原床的被壳与草垫之间存在广泛气隙。修正源按真实被壳上下包络与草垫顶面，下压被子的底壳及相应低处缝线，保留上表面褶皱和原草垫外形。游戏版在真实低模草垫上再次拟合，并重建连续的棉布被里承托面；里衬与原外壳合入同一 Quilt 材质和绘制，其新增面计入预算，无承托处的悬垂保留。原网格先焊接重合几何顶点再减面，UV、材质和角颜色仍按面角保存。接触由独立三角射线检查，保持 ±2 mm 门槛。

## 重建

在仓库根目录运行。需要本机 Blender、Python、NumPy 和带 WebP 支持的 Pillow；Blender 由仓库 `Script_BlenderMcp.mjs` 管理。

```powershell
node Model/PatchedTimberBed/Script_PatchedTimberBedRebuild.mjs --source-root=C:/Users/Bentl/OneDrive/AI/Models/Blender/PatchedTimberBed20261020
```

可选 `--review-root=<本地目录>`、`--output=<输出GLB>`、`--python=<Python命令或路径>` 和 `--comparison`（额外生成本地原版对照与源渲染，约 480 MB 的高模 GLB 不入库）。参数使用 `--名称=值`；包含空格时引用整个参数。例如：

```powershell
node Model/PatchedTimberBed/Script_PatchedTimberBedRebuild.mjs "--source-root=C:/Users/Bentl/OneDrive/AI/Models/Blender/PatchedTimberBed20261020" --review-root=tmp/BedBnBsAcceptance --output=Model/PatchedTimberBed/Model_PatchedTimberBed.glb
```

链路为：只读 BN/BS 输入 → 可编辑修正高模 → 游戏网格与材质烘焙 → 标准临时 GLB → WebP 封装 → 独立 GLB 检查与真实 WebGL 验收。重建调用 [Script_PatchedTimberBedBake.py](Script_PatchedTimberBedBake.py) 与 [Script_PatchedTimberBedPack.py](Script_PatchedTimberBedPack.py)。封装保留顶点属性、UV、颜色、采样器和纹理变换；除 BS 原 WebP 字节替换外，将其余内嵌 PNG 按相同尺寸无损转换为 WebP，并记录解码像素哈希。

源及导出中的退化面按世界坐标 float64 叉积长度 `<1e-12` 清除，保留有效顶点属性。封装收据记录每个 primitive 的过滤结果、输出索引与图像哈希；不能通过放宽面积门禁获得通过。Blender 工作结束后检查本任务实例状态：

```powershell
node scripts/Script_BlenderMcp.mjs status --scan
```

## 独立验收

默认验收读取最终 GLB，同时进行结构检查、真实 `ManagedGLTFLoader` 图像解码与 WebGL 渲染、视角切换和拖动缩放检查。后台浏览器显式静音。

```powershell
node Model/PatchedTimberBed/Script_PatchedTimberBedTest.mjs
node Model/PatchedTimberBed/Script_PatchedTimberBedTest.mjs --structural-only
node Model/PatchedTimberBed/Script_PatchedTimberBedTest.mjs --comparison
node Model/PatchedTimberBed/Script_PatchedTimberBedContactTest.mjs
```

`--structural-only` 仅检查结构与资产契约，不能替代视觉验收。`--comparison` 还需要本地 `tmp/BedBnBsAcceptance/Model_OriginalBed.glb`，可通过重建命令追加 `--comparison` 生成；这是原版形体与颜色烘焙对照，用于原版和最终版同光全景及局部比较，不作为游戏交付。原材质的保真比较以相同 Cycles 灯光与机位的 `Render_OriginalSource.png`、`Render_FinalHigh.png` 和 `Render_FinalGame.png` 为准；WebGL 原版的角颜色采样属于近似转换。

测试可使用 `--model=<GLB>`、`--original=<原版GLB>`、`--out=<本地证据目录>`、`--contract=<资产清单>`；预算可通过 `--max-triangles=<数值>` 和 `--max-draws=<数值>` 显式收紧。默认从 `Data_Asset.json` 读取已声明的预算及精确几何契约。`--url=<仓库预览根地址>` 可复用已启动的本任务预览；省略时测试自行创建临时本地服务。

验收 HTML、对照 GLB、渲染图、截图与报告保留在已忽略的 `tmp/BedBnBsAcceptance/`。全尺寸截图作为本地证据保存，日常观察使用同目录长边不超过 640 像素的 JPEG。实际显示和交互结果以本次验收报告为证，HTTP 200、导出日志或加载器对象图检查本身不足以证明视觉通过。
