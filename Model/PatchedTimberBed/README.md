# PatchedTimberBed

本轮为 `20261021ReferenceWoodV4` 木架实物参考修订，采用共享表面配方 `ReferenceElmSurfaceV6` 与真实局部破损配方 V3。完整交付为 **49,513 三角、6,957,176 字节、6 网格／材质／绘制**，其中 Frame **7,200 三角**；GLB SHA256 为 `44d64adfde72fea58494719ce753bc5cc17095786dae1baf9c4a3e80b807ce0b`。整床低于 50,000 三角硬上限，统计包含全部床部件与承托附加几何。尺寸、图像与文件身份见匹配该哈希的 [Data_Asset.json](Data_Asset.json)。

本轮独立视觉、结构、真实 WebGL、接触及源工程冷开检查通过。Frame 真实几何变化，其余五组件的世界三角、法线、UV、颜色和材质语义精确保持。8 视角包含木架接头近景，42/42 接触点通过原 ±2 mm 门槛。7 构件、10 处实际切面全部保留在最终低模，163 个保护顶点的最大非足底偏差约 0.133 微米；切面探针最大距离约 0.045 毫米。本次证据保存在 `tmp/BedWoodReferenceAcceptance/`，均绑定最终哈希。

`Model_PatchedTimberBed.glb` 是包含完整床架、草垫、枕头、主被面、缝线和脚端垂布的独立共享资产，保留用户选定的旧式补片棉被与旧木床设计。本目录未增加关卡布设或注册，既有程序床不代表本资产已接入。造型属于创作复原，不将具体尺寸、补片和旧化做法宣称为唯一历史实物。

## 本轮形体与性能契约

本轮针对木架的实物质感与破损形态：放弃上一版等距黑条、理想同心靶圈以及仅靠颜色压暗的旧化。按真实构件生成有限共享表面窗口，低对比长纤维与不规则深包浆、黄褐裸木磨蚀共同表达老木；真正的缺角、端头裂口由局部几何承担。当前方案涉及 7 个构件、10 个局部区域，具体形态、面数和低模口沿保留情况以最终破损及视觉报告为准。源高模、游戏低模与其他五组件分别检查，不能把材质函数自身不移动顶点等同于本轮 Frame 没有几何变化。

被面与草席沿用之前已验收的实现，本轮不重新设计它们。以下被面和承托算法说明用于完整重建；其冻结结果仍须在本轮新 GLB 中重新核对。

旧流程有两个会放大融化般被面的因素。上一版高度带 Fit 会把可见褶侧下拉超过 100 mm，改变原有浅褶；此外，先合并、减面，再在稀疏低模角点烘原材质颜色，会使细纹采样混叠形成大片色团，分区间的面数分配还会削弱真实覆盖层。本轮移除旧 high/game 高度带 Fit，并改为高源先烘色、再减面。原源灰补片本身仍带有高频旋涡，先烘色只能减轻混叠，单靠这一顺序修正不足以满足原红圈的视觉要求。

Quilt 源 BaseColor 上游为 UV、图像和颜色层混合，没有 Geometry、Pointiness、AO 或 Generated 依赖；单纯减弱法线贴图不能解决源颜色中的旋涡。因此逐高源分区预烘色之外，另对分区 7 的密集源颜色做低通，再以统一细纱织纹恢复布感，保留真实几何浅褶和缝线。

分区 7 的定向修正位于密集源颜色烘焙之后、减面之前：以世界坐标建立 **12.5 mm 的三维体素**，分别对线性颜色质量（colour mass）和采样密度（density）施加 **σ=30 mm 的归一化 Gaussian**，再以质量／密度恢复平滑颜色，避免空体素拉黑表面。高频残差保留权重压到 **1.5%**，平滑偏差权重为 **55%**。它只调整该分区的颜色，不移动原几何，不改边界拓扑或缝线，最后再以统一细棉纱织纹恢复细节。新 WebGL 局部、Cycles 整床及独立人工对照均已核验该修正。

`Script_PatchedTimberBedContact.py` 通过 `AddCompactMatContact` 根据原草垫采样、桥接小采样缺口，重建压实承托体与同拓扑棉布下壳，覆盖实际承托足迹。连续低频承托是明确重建的几何，不宣称原始稻草网格本来就连续。既有承托处理毛新增 8,275 三角，其中草垫承托体 1,914、棉布承托及收边 1,796、切分额外面 4,565；清除隐藏面和冗余后，全部计入整床预算。它不按 42 个验收坐标打补丁；本轮仍需重测接触，复核浅色承托板、大洞和黑缝。

Frame 为 7,200 三角，高源为 19,474 三角；局部破损全部纳入整床 50k 硬上限。其余五组件的面数与属性通过上一版冻结契约核对。既有 Straw 源角色阶段目标为 12,500，保留独立构件最小拓扑后实际为 15,708，再经接触处理和清理得到 15,371；过程目标数不替代本轮实际封装统计。

50k 是完整交付 GLB 的硬上限，不能排除被里、缝线或草纤维后统计。高精度原源保留在仓库外；低模需保住整床轮廓、连贯大褶、主要缝边和床架构造。面积及接触门槛不因减面而放宽。

## 加载与坐标

使用 [ManagedGLTFLoader](../../Taierzhuang1938/Script_ModelImports.mjs) 的原生 GLB/PBR 路径，保留模型自带材质。单位为米，glTF 为 Y 向上、X 床长轴、Z 床宽轴、+X 脚端；轴心位于地面与整床 XZ 包围盒中心。

消费者必须保留 `COLOR_0`、第二组 UV（`TEXCOORD_1` / Three.js `uv1`）、`KHR_texture_transform`、`EXT_texture_webp`、采样器与法线通道。不得用 `WoodBeam` 等统一材质覆盖整床，或通过仅携带 position/normal/uv 的 TZM、简化合批丢弃属性。

## 材质与旧化

| 组成 | 本轮表示与检查重点 |
| --- | --- |
| Quilt | 各原密集材质分区先独立烘色，再在分区内焊接和减面；保护可见覆盖层，合并后保留 CORNER `COLOR_0`，不在低模重烘颜色。结合既有 BS 纱束细纹和物理 UV1；原法线使用 UV0，强度 **0.15**。 |
| Straw | 保留按角色减面的主要外露编织、绑绳及脚端延伸；`AgedStrawV2` 用同一物理高度场生成 **3 张 512×512** 的 Base／ORM／Normal 平铺图，全部使用同一 UV1，法线强度 **0.62**。角色颜色表现褐黄老草、磨损与绑绳积垢，仍为单材质。 |
| Frame | `ReferenceElmSurfaceV6` 使用共享米制表面与宏观 `COLOR_0`：非等距纤维、破碎深包浆和黄褐裸木片，配合真实局部缺角与裂口。Base **2048**、Normal **1024**、ORM **512** 同 UV0、单材质；ORM 的 G 为粗糙度、B 区分铁件中性区。**7,200 三角**，视觉、切面保留及冷开检查通过。 |
| Pillow / Sewing | 各自 **512** PBR atlas，保留枕头体量、补片与主要缝线读感。 |
| BS_FootCloth | 原低频旧化 `COLOR_0`、独立 UV1、Base/Normal 各自变换及原 WebP 字节保持；法线强度仍为 **0.5**。 |

木架处理见 [Script_PatchedTimberBedWood.py](Script_PatchedTimberBedWood.py)。BaseColor 为 sRGB，法线和粗糙度为线性数据。材质烘焙排除直接光与间接光，不把摄影灯光写入 BaseColor。

Frame 真实破损与材质映射分别实现：[WoodDamage](Script_PatchedTimberBedWoodDamage.py) 负责有限区域的真实缺角、裂口及口沿标记，[Wood](Script_PatchedTimberBedWood.py) 读取真实切面 `WoodDamageData`，仅在这些新切面少量混入灰褐裸木，不刷亮所有棱边。旧微缺口版本独立防止重复累积；本轮新增局部破损不受此前“只改材质”结论覆盖。

共享图侧面域虚拟覆盖 **2.6 m × 0.28 m**，各构件从域内选择有限物理窗口，复用横向纤维密度；端面有 4 个偏心、非完整弧变体，另设铁件和暗凹槽中性区。贴图与宏观颜色乘合为原生 PBR，三图来自一致高度特征，Normal 使用物理导数、OpenGL +Y，强度 **0.48**。没有子矩形循环或跨区采样，也不再把整套木架独占低密度 atlas 后宣称细纹完整复现。屏幕像素、斜视和 mip 仍限制最终细节，必须看真实整床、构件近景及端头。

实物参考为 [Chairish 6368349 山西榆木日床](https://www.chairish.com/product/6368349/antique-shanxi-province-elm-opium-daybed) 的深包浆、断续裸木磨痕与圆润旧棱，以及 [Unsplash 2fDOcq3vW5k 断木端面](https://unsplash.com/photos/a-piece-of-wood-that-has-been-cut-in-half-2fDOcq3vW5k) 的偏心局部弧和参差沿纹裂口。仅取材质尺度与断裂原理，不复制家具形制或室外绿腐烂，也未把参考照片像素直接嵌入游戏图像。

草席材质处理见 [Script_PatchedTimberBedStrawAge.py](Script_PatchedTimberBedStrawAge.py)。每个源构件用 PCA 判断主轴并选择对应 source UV 方向，再写入独立 UV1，使草纤维沿真实长轴。Base、ORM 与 OpenGL +Y Normal 来自同一周期高度场，Roughness 取 ORM 的 G 通道，金属度为 0；它们共享 UV1，避免颜色、凹凸与粗糙度方向冲突。原 UV0 和 `BR_original_low_frequency_color` 原数据保留在可编辑源工程中，运行时导出新的 `StrawAgedLowFrequencyColor`，没有额外增加材质或绘制。

Quilt 的先烘色流程见 [Script_PatchedTimberBedQuilt.py](Script_PatchedTimberBedQuilt.py)，源分区 6、7 的真实可见覆盖层获得单独配额，不跨层焊接。Straw 的 [角色减面](Script_PatchedTimberBedStraw.py) 与 [合并烘色及面角散回](Script_PatchedTimberBedColorBake.py) 分开：已检查其原 BaseColor 只依赖 UV、颜色层与图像，因此可在不改 UV/颜色的高密临时合并对象上单次采样。902 个结构源参与角色减面，没有为配额整件舍弃结构源；主编织面携带 `StrawProtectedStructure=1`，减面后的按岛预算清理删除受保护结构面 **0** 个，明确的长裂微纤维装饰省略。接触处理在真实遮蔽区域另裁掉了 **3,874 个带保护标记的结构面碎片**；保护标记不禁止这种隐藏区裁剪，不能据此宣称所有原结构面完整未删。具体保留、裁剪与最小拓扑超额见本轮收据。

BS 的 Base 与 Normal 都使用 UV1；仅 Base 使用 `scale=[0.5240554213523865,0.5240554213523865]`、`offset=[0,0.4759445786476135]`，Normal 保留原采样尺度，不能互套变换。原角颜色来自 `BR_lowfrequency_corner_colors.npz`，必须显式导出正确颜色层，不能以白色 `COLOR_0` 代替。封装保留 `BS_BaseColor.webp` 与 `BS_Normal.webp` 原字节。

减面、角颜色采样和材质烘焙有近似取舍，不宣称逐像素复现高模。纹理无损封装只保证对应图像的解码像素，不代表删除的几何细节已完整进入法线贴图。

## 外部源工程与保护

源工程根目录保持为：

```text
C:/Users/Bentl/OneDrive/AI/Models/Blender/PatchedTimberBed20261020/
  Inputs/BN/Restored/Bed_BN_Complete_Editable_Checkpoint.blend
  Inputs/BS/BedBS/BS_material_only.blend
  Inputs/BS/BedBS/BR_lowfrequency_corner_colors.npz
  Inputs/BS/BedBS/BS_BaseColor.webp
  Inputs/BS/BedBS/BS_Normal.webp
  Inputs/BS/BedBS/BS_fiber_bundle_Base_1024.png
  Scene_PatchedTimberBedHigh.blend
  Scene_PatchedTimberBedGame.blend
  Bakes/
  Scripts/
```

长期保留独立 High（**147,734,798 字节**）、Game（**8,877,659 字节**）及全部 `Inputs/`。Game 已移除 964 个重复隐藏高模和相应无用数据，完整可编辑高源仍在独立 High 中。最终冷开确认 Game 六网格、16 张使用图像 packed 且可解码，六项只读输入哈希不变；当前配方与源目录 Scripts 的哈希匹配，并嵌入两份工程 Text。

此前按用户授权清理了 **21 个生成文件**：7 个备份工程文件（3 个旧 `.blend`、4 个 `.blend1`）、2 个临时工程及 12 个废弃 Bakes。该次源工程目录从 **1,920,826,653 字节**降至 **370,426,646 字节**，净释放 **1,550,400,007 字节**；这是已完成的清理记录，不是本轮重建后目录体积。`Scene_OriginalBed.blend`、`Scene_BedBakeProgress.blend` 已清理，完整重建可重新生成；History 中旧工程文件已删，不要求 OneDrive 空目录同时消失。当前 Bakes、Scripts、全部 Inputs 和 High／Game 保留。

另清理旧验收目录中 **9 个临时 GLB，共 601,391,432 字节**，包含约 477 MB 的原高模展示 GLB；当前新预览使用的约 8.7 MB 上一版 baseline GLB 保留。两部分合计净释放 **2,151,791,439 字节（约 2.15 GB）**。正式流程设置 `save_version=0`，避免每次保存继续生成 `.blend1`；清理简表同时记录在资产清单的 `source.generatedFileCleanup`。

本轮再清理 3 张废弃木架 Bakes 和标准临时 GLB，共 **13,873,048 字节**；Frame transfer 工程在载入后自动移除。目录只保留两个最终 `.blend`，无 `.blend1`，本任务 Blender 实例已停止。当前 Bakes、Scripts 和 Inputs 保留，收据为 `Data_ReferenceSourceCleanup.json`。

`Inputs/` 是只读重建输入。原始归档位于 `C:/Users/Bentl/OneDrive/AI/Models/Blender/DotsAcceptance20261020/BedBN/Restored/` 与同级 `BedBS/`，两处都不得覆盖。原参考、历史配方和完整高精度源继续保留；`.blend`、自动备份、过程图与验收素材不进入 github.io 仓库。

只读 `Inputs/` 保留完整原始来源；High 保留可编辑高源与更新的材质，Game 保存 50k 预算内游戏表示。摄影地面不参与游戏导出。当前配方复制到源目录 `Scripts/` 并嵌入工程 Text，执行以本轮 Bake/Rebuild 正式链路为准。完整重建会按需重新生成 Original/Progress 临时检查点，不要求长期保存这些过程工程。

## 重建

在仓库根目录运行。需要本机 Blender、Python、NumPy 和带 WebP 支持的 Pillow；Blender 由仓库 `Script_BlenderMcp.mjs` 管理。

```powershell
node Model/PatchedTimberBed/Script_PatchedTimberBedRebuild.mjs --source-root=C:/Users/Bentl/OneDrive/AI/Models/Blender/PatchedTimberBed20261020 --review-root=tmp/BedWoodReferenceAcceptance
```

脚本默认过程目录仍为 `tmp/BedBnBs50kAcceptance/`；本轮使用 `--review-root=tmp/BedWoodReferenceAcceptance` 指定独立证据目录。其他可选参数为 `--output=<输出GLB>`、`--python=<Python命令或路径>`；参数使用 `--名称=值`，含空格时引用整个参数。例如：

```powershell
node Model/PatchedTimberBed/Script_PatchedTimberBedRebuild.mjs "--source-root=C:/Users/Bentl/OneDrive/AI/Models/Blender/PatchedTimberBed20261020" --review-root=tmp/BedWoodReferenceAcceptance --output=Model/PatchedTimberBed/Model_PatchedTimberBed.glb
```

本轮实际执行从已保存 High／Game 只替换 Frame 的 `wood-reference` 阶段，五个其他组件保持冻结；对应入口如下。该阶段使用 `Scripts/Data_WoodDamage.json` 保留已成功切削的幂等收据，新验收目录自动复制当前资产坐标清单。

```powershell
node Model/PatchedTimberBed/Script_PatchedTimberBedRebuild.mjs --stage=wood-reference --review-root=tmp/BedWoodReferenceAcceptance
```

默认 `all` 从 Inputs 完整重烘本轮未整条重跑。为适配新 Frame 配额，完整链路将无效面校验提前到接触预算分配；真实 Mesh/BMesh fixture 的 16 项检查覆盖退化与重复面清理、合法细面保留，以及 UV、FLOAT32 颜色和来源标签精确保真。整床 50k 与受保护草结构预算门禁保持。

追加 `--comparison` 可生成本地原始高模对照与源渲染，大型对照 GLB 不作为游戏交付。

链路为：只读 BN/BS 输入 → 保留可见布面、更新木架 PBR 的高源 → Quilt/Straw 高源先烘色 → 按分区和角色减面、建立紧凑承托，其他部件烘 PBR atlas → 标准临时 GLB → WebP 封装 → 独立结构、接触和真实 WebGL 验收。入口为 [Bake](Script_PatchedTimberBedBake.py)、[Rebuild](Script_PatchedTimberBedRebuild.mjs) 与 [Pack](Script_PatchedTimberBedPack.py)。有效顶点属性、UV、颜色、采样器及独立纹理变换均保留；BS 恢复原 WebP 字节，其余内嵌 PNG 按同尺寸无损转换，并记录解码像素哈希。

退化面仍按世界坐标 float64 叉积长度 `<1e-12` 过滤，不放宽硬面积门槛。收据记录各 primitive 的过滤结果、索引和图像哈希。Blender 工作结束后核对本任务实例已停止：

```powershell
node scripts/Script_BlenderMcp.mjs status --scan
```

## 独立验收与对照

最终 49,513 三角、6 组原生材质与绘制通过结构检查，米制轴心、法线、有限坐标、零近零面积三角及 BS 属性符合契约。42/42 接触点通过 **±2 mm** 原门槛，实测间隙约 0.250 毫米；其他五组件的冻结检查通过。源工程冷开及真实切面保留检查通过。

```powershell
node Model/PatchedTimberBed/Script_PatchedTimberBedTest.mjs --max-triangles=50000
node Model/PatchedTimberBed/Script_PatchedTimberBedTest.mjs --structural-only --max-triangles=50000
node Model/PatchedTimberBed/Script_PatchedTimberBedContactTest.mjs
```

网页验收使用真实 `ManagedGLTFLoader` 完成图像解码、WebGL 渲染、视角切换及拖动缩放，后台浏览器显式静音。`--structural-only` 和浏览器功能通过均不能替代视觉检查。

与上一版木架对照：

```powershell
node Model/PatchedTimberBed/Script_PatchedTimberBedTest.mjs --comparison --original=tmp/BedWoodReferenceAcceptance/Model_PreviousBed.glb "--original-label=上一版木架" --out=tmp/BedWoodReferenceAcceptance --max-triangles=50000 --url=http://127.0.0.1:8125
```

`Model_PreviousBed.glb` 是本地上一版对照，不参与本轮 50k 交付。原始高模可由完整重建的 `--comparison` 生成，再通过测试的 `--comparison --original=tmp/BedWoodReferenceAcceptance/Model_OriginalBed.glb` 使用。高模 WebGL 是原形体与颜色烘焙转换；原材质保真比较仍以相同 Cycles 灯光和机位的源渲染为准。

测试还支持 `--model=<GLB>`、`--out=<证据目录>`、`--contract=<资产清单>` 和 `--max-draws=<上限>`。省略 `--url` 时创建临时本地服务；复用本任务 8125 预览时，对照页生成在 [本轮本地验收入口](http://127.0.0.1:8125/tmp/BedWoodReferenceAcceptance/index.html)。

独立人工复核实际覆盖 8 视角及前柱、长梁局部：木纹、包浆磨蚀、约 4 毫米有效缺角与偏置劈口可读，长梁外棱剥落可见。前柱横向条带经同模型关闭纹理、法线及阴影的隔离实验确认为预览自阴影伪影；最终缩紧阴影相机并调整 bias，保留投影后条带消失，未因此修改资产法线。原灰补片、草席前缘、承托与脚端未退化。正式 8 视角在修正阴影后重新检查通过。

最终结果引用本轮 `Data_StructuralReview.json`、`Data_ContactReview.json`、`Data_BrowserReview.json`、`Data_IndependentVisualReview.json` 及破损／冻结审计，均与 `Data_Asset.json` 的最终哈希对齐。42 点与目视不构成全表面数学零相交证明。HTML、对照 GLB、渲染图、截图及报告只留在忽略的 `tmp/BedWoodReferenceAcceptance/`。全尺寸图保存在本地，日常观察使用长边不超过 640 像素的预览。
