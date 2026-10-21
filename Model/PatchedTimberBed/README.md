# PatchedTimberBed

最终完整整床为 **48,313 三角、8,537,412 字节、6 网格／材质／绘制**，版本 `20261021AgedTimberStrawV3`，GLB SHA256 为 `7a1394840595196c429ff19e260e6e79082b1bf5024a5c6806a5059f2e15fb9f`。相对最初 288,799 三角版本减少约 **83.27%**，低于整床 50,000 三角硬上限；相对上一版已验收的 48,313 三角版本，本轮提升木架与草席材质表现，面数保持不变。统计包含全部床部件及承托附加几何；尺寸、图像与完整文件契约见 [Data_Asset.json](Data_Asset.json)。

本轮结构、独立接触、真实 WebGL 与独立人工视觉验收通过。7 个视角和两张局部检查确认长梁的模糊云斑收敛、顺纹及断续长裂清楚，草席纵向纤维取代旧交叉网纹，旧化在整床中可读。上一轮已修好的灰补片、浅褶与缝线保留。42/42 接触点满足未放宽的 ±2 mm 门槛，实测间隙约 **0.24998–0.25004 mm**；最终 GLB 内嵌 16 张图像。本次证据保存在 `tmp/BedAgedMaterialsAcceptance/`，与新 GLB 哈希对应；早期证据另留在 `tmp/BedBnBs50kAcceptance/` 与 `tmp/BedBnBsAcceptance/`。

`Model_PatchedTimberBed.glb` 是包含完整床架、草垫、枕头、主被面、缝线和脚端垂布的独立共享资产，保留用户选定的旧式补片棉被与旧木床设计。本目录未增加关卡布设或注册，既有程序床不代表本资产已接入。造型属于创作复原，不将具体尺寸、补片和旧化做法宣称为唯一历史实物。

## 本轮形体与性能契约

旧流程有两个会放大融化般被面的因素。上一版高度带 Fit 会把可见褶侧下拉超过 100 mm，改变原有浅褶；此外，先合并、减面，再在稀疏低模角点烘原材质颜色，会使细纹采样混叠形成大片色团，分区间的面数分配还会削弱真实覆盖层。本轮移除旧 high/game 高度带 Fit，并改为高源先烘色、再减面。原源灰补片本身仍带有高频旋涡，先烘色只能减轻混叠，单靠这一顺序修正不足以满足原红圈的视觉要求。

Quilt 源 BaseColor 上游为 UV、图像和颜色层混合，没有 Geometry、Pointiness、AO 或 Generated 依赖；单纯减弱法线贴图不能解决源颜色中的旋涡。因此逐高源分区预烘色之外，另对分区 7 的密集源颜色做低通，再以统一细纱织纹恢复布感，保留真实几何浅褶和缝线。

分区 7 的定向修正位于密集源颜色烘焙之后、减面之前：以世界坐标建立 **12.5 mm 的三维体素**，分别对线性颜色质量（colour mass）和采样密度（density）施加 **σ=30 mm 的归一化 Gaussian**，再以质量／密度恢复平滑颜色，避免空体素拉黑表面。高频残差保留权重压到 **1.5%**，平滑偏差权重为 **55%**。它只调整该分区的颜色，不移动原几何，不改边界拓扑或缝线，最后再以统一细棉纱织纹恢复细节。新 WebGL 局部、Cycles 整床及独立人工对照均已核验该修正。

新的 `Script_PatchedTimberBedContact.py` 通过 `AddCompactMatContact` 根据原草垫采样、桥接小采样缺口，重建压实承托体与同拓扑棉布下壳，覆盖实际承托足迹。连续低频承托是本轮重建的几何，不宣称原始稻草网格本来就连续。接触处理毛新增 8,275 三角，其中草垫承托体 1,914、棉布承托及收边 1,796、切分额外面 4,565；清除隐藏面和冗余后，全部计入最终 48,313 三角。它不按 42 个验收坐标打补丁。无承托处的悬垂、主要外侧编织和破口保留，整床与近景检查未见浅色承托板或大洞。

最终封装的分部面数为 Quilt 17,999、Straw 15,371、Frame 6,000、BS 脚端 4,999、Pillow 2,200、Sewing 1,744。Straw 源角色阶段目标为 12,500，保留独立构件最小拓扑后实际为 15,708，再经接触处理和清理得到 15,371；目标数不替代实际导出数。

50k 是完整交付 GLB 的硬上限，不能排除被里、缝线或草纤维后统计。高精度原源保留在仓库外；低模需保住整床轮廓、连贯大褶、主要缝边和床架构造。面积及接触门槛不因减面而放宽。

## 加载与坐标

使用 [ManagedGLTFLoader](../../Taierzhuang1938/Script_ModelImports.mjs) 的原生 GLB/PBR 路径，保留模型自带材质。单位为米，glTF 为 Y 向上、X 床长轴、Z 床宽轴、+X 脚端；轴心位于地面与整床 XZ 包围盒中心。

消费者必须保留 `COLOR_0`、第二组 UV（`TEXCOORD_1` / Three.js `uv1`）、`KHR_texture_transform`、`EXT_texture_webp`、采样器与法线通道。不得用 `WoodBeam` 等统一材质覆盖整床，或通过仅携带 position/normal/uv 的 TZM、简化合批丢弃属性。

## 材质与旧化

| 组成 | 本轮表示与检查重点 |
| --- | --- |
| Quilt | 各原密集材质分区先独立烘色，再在分区内焊接和减面；保护可见覆盖层，合并后保留 CORNER `COLOR_0`，不在低模重烘颜色。结合既有 BS 纱束细纹和物理 UV1；原法线使用 UV0，强度 **0.15**。 |
| Straw | 保留按角色减面的主要外露编织、绑绳及脚端延伸；`AgedStrawV2` 用同一物理高度场生成 **3 张 512×512** 的 Base／ORM／Normal 平铺图，全部使用同一 UV1，法线强度 **0.62**。角色颜色表现褐黄老草、磨损与绑绳积垢，仍为单材质。 |
| Frame | `AgedBrownTimberV3` 保留深棕包浆和局部灰化，收窄低频云斑，加入 **10.5 mm 间距顺纹、41 mm 间距稀疏长干裂**，另有铁渗、脚潮和局部摩擦暗亮。保留 **6,000 三角**及既有 GameUV；Base **2048**、Normal **1024**、Roughness **512**。 |
| Pillow / Sewing | 各自 **512** PBR atlas，保留枕头体量、补片与主要缝线读感。 |
| BS_FootCloth | 原低频旧化 `COLOR_0`、独立 UV1、Base/Normal 各自变换及原 WebP 字节保持；法线强度仍为 **0.5**。 |

木架处理见 [Script_PatchedTimberBedWood.py](Script_PatchedTimberBedWood.py)。BaseColor 为 sRGB，法线和粗糙度为线性数据。材质烘焙排除直接光与间接光，不把摄影灯光写入 BaseColor。

Frame 本轮不再施加几何缺口，材质版本与几何版本独立，避免重复累积旧缺口。主色采用深棕包浆与轻微灰化，沿米制横纹坐标生成边界清楚、缓弯的纵向纹理与长干裂，保留真实铁件附近的渗染及榫肩、脚部旧化。2K／1K atlas 的采样仍有现实限制：1.5–3.2 mm 窄纹不能保证处处获得多个 texel，不宣称毫米细节完整复现；验收以游戏距离、整床和近景实际表现为准。

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

长期保留独立的 High、Game 两个最终工程及全部 `Inputs/`。High 为 **148,286,658 字节**，Game 为 **11,776,164 字节**；Game 已移除 964 个重复隐藏高模和相应无用数据，从约 157.4 MB 缩减为约 11.8 MB，完整可编辑高源仍在独立 High 中。两份工程不依赖在 Game 里藏一整套高模。清理后冷开复核通过：Game 保留 6 个网格、16 张 packed 图像可解码，6 项只读输入哈希不变；最终 `7a1394…fb9f` 的世界空间三角几何审计位移为 0。

按用户授权共清理 **21 个生成文件**：7 个备份工程文件（3 个旧 `.blend`、4 个 `.blend1`）、2 个临时工程及 12 个废弃 Bakes。源工程目录从 **1,920,826,653 字节**降至 **370,426,646 字节**，净释放 **1,550,400,007 字节**。`Scene_OriginalBed.blend`、`Scene_BedBakeProgress.blend` 已删除，完整重建可重新生成；History 中的旧工程文件已删除，不要求 OneDrive 的空目录同时消失。当前 Bakes、Scripts、全部 Inputs 和最终 High／Game 均保留。

另清理旧验收目录中 **9 个临时 GLB，共 601,391,432 字节**，包含约 477 MB 的原高模展示 GLB；当前新预览使用的约 8.7 MB 上一版 baseline GLB 保留。两部分合计净释放 **2,151,791,439 字节（约 2.15 GB）**。正式流程设置 `save_version=0`，避免每次保存继续生成 `.blend1`；清理简表同时记录在资产清单的 `source.generatedFileCleanup`。

`Inputs/` 是只读重建输入。原始归档位于 `C:/Users/Bentl/OneDrive/AI/Models/Blender/DotsAcceptance20261020/BedBN/Restored/` 与同级 `BedBS/`，两处都不得覆盖。原参考、历史配方和完整高精度源继续保留；`.blend`、自动备份、过程图与验收素材不进入 github.io 仓库。

只读 `Inputs/` 保留完整原始来源；High 保留可编辑高源与更新的材质，Game 保存 50k 预算内游戏表示。摄影地面不参与游戏导出。当前配方复制到源目录 `Scripts/` 并嵌入工程 Text，执行以本轮 Bake/Rebuild 正式链路为准。完整重建会按需重新生成 Original/Progress 临时检查点，不要求长期保存这些过程工程。

## 重建

在仓库根目录运行。需要本机 Blender、Python、NumPy 和带 WebP 支持的 Pillow；Blender 由仓库 `Script_BlenderMcp.mjs` 管理。

```powershell
node Model/PatchedTimberBed/Script_PatchedTimberBedRebuild.mjs --source-root=C:/Users/Bentl/OneDrive/AI/Models/Blender/PatchedTimberBed20261020 --review-root=tmp/BedAgedMaterialsAcceptance
```

脚本默认过程目录仍为 `tmp/BedBnBs50kAcceptance/`；本轮使用 `--review-root=tmp/BedAgedMaterialsAcceptance` 指定独立证据目录。其他可选参数为 `--output=<输出GLB>`、`--python=<Python命令或路径>`；参数使用 `--名称=值`，含空格时引用整个参数。例如：

```powershell
node Model/PatchedTimberBed/Script_PatchedTimberBedRebuild.mjs "--source-root=C:/Users/Bentl/OneDrive/AI/Models/Blender/PatchedTimberBed20261020" --review-root=tmp/BedAgedMaterialsAcceptance --output=Model/PatchedTimberBed/Model_PatchedTimberBed.glb
```

追加 `--comparison` 可生成本地原始高模对照与源渲染，大型对照 GLB 不作为游戏交付。

链路为：只读 BN/BS 输入 → 保留可见布面、更新木架 PBR 的高源 → Quilt/Straw 高源先烘色 → 按分区和角色减面、建立紧凑承托，其他部件烘 PBR atlas → 标准临时 GLB → WebP 封装 → 独立结构、接触和真实 WebGL 验收。入口为 [Bake](Script_PatchedTimberBedBake.py)、[Rebuild](Script_PatchedTimberBedRebuild.mjs) 与 [Pack](Script_PatchedTimberBedPack.py)。有效顶点属性、UV、颜色、采样器及独立纹理变换均保留；BS 恢复原 WebP 字节，其余内嵌 PNG 按同尺寸无损转换，并记录解码像素哈希。

退化面仍按世界坐标 float64 叉积长度 `<1e-12` 过滤，不放宽硬面积门槛。收据记录各 primitive 的过滤结果、索引和图像哈希。Blender 工作结束后核对本任务实例已停止：

```powershell
node scripts/Script_BlenderMcp.mjs status --scan
```

## 独立验收与对照

最终 GLB 的 48,313 三角、6 组原生材质与绘制通过结构检查，米制、轴心、完整部件、有效法线、有限坐标及 BS 属性符合契约，零近零面积三角。独立三角射线接触检查 **42/42 PASS**，实测间隙约 0.24998–0.25004 mm，原 **±2 mm** 门槛不变。独立视觉检查也已直接覆盖原红圈灰补片及整床关键视角。

```powershell
node Model/PatchedTimberBed/Script_PatchedTimberBedTest.mjs --max-triangles=50000
node Model/PatchedTimberBed/Script_PatchedTimberBedTest.mjs --structural-only --max-triangles=50000
node Model/PatchedTimberBed/Script_PatchedTimberBedContactTest.mjs
```

真实 `ManagedGLTFLoader` 的图像解码、WebGL 渲染、视角切换及拖动缩放检查通过，后台浏览器显式静音。`--structural-only` 和浏览器功能通过均不能替代视觉检查。

与上一版已验收的 48,313 三角游戏模型比较：

```powershell
node Model/PatchedTimberBed/Script_PatchedTimberBedTest.mjs --comparison --original=tmp/BedAgedMaterialsAcceptance/Model_PreviousBed.glb "--original-label=上一版已验收48313三角" --out=tmp/BedAgedMaterialsAcceptance --max-triangles=50000 --url=http://127.0.0.1:8125
```

`Model_PreviousBed.glb` 是本地上一版对照，不参与本轮 50k 交付。原始高模可由完整重建的 `--comparison` 生成，再通过测试的 `--comparison --original=tmp/BedAgedMaterialsAcceptance/Model_OriginalBed.glb` 使用。高模 WebGL 是原形体与颜色烘焙转换；原材质保真比较仍以相同 Cycles 灯光和机位的源渲染为准。

测试还支持 `--model=<GLB>`、`--out=<证据目录>`、`--contract=<资产清单>` 和 `--max-draws=<上限>`。省略 `--url` 时创建临时本地服务；复用本任务 8125 预览时，对照页生成在 [本轮本地验收入口](http://127.0.0.1:8125/tmp/BedAgedMaterialsAcceptance/index.html)。

人工视觉复核直接检查新版本的 7 个视角及 2 张局部：木架长梁云斑收敛、顺纹与断续长裂清楚，草席纵向纤维取代交叉网纹，整床旧化可读。原红圈灰补片保持平实棉布、大褶和缝线，前缘主编织连续，未见浅色承托板、大洞或明显悬空、穿透、黑缝。此结论来自新 GLB 的独立实图，不沿用上一版视觉报告。

实际结果引用本轮 `Data_StructuralReview.json`、`Data_ContactReview.json`、`Data_BrowserReview.json`、`Data_IndependentVisualReview.json` 和对应图像，并与 `Data_Asset.json` 的新 GLB 哈希对齐。42 点与目视不构成全表面数学零相交证明。HTML、对照 GLB、渲染图、截图及报告只留在忽略的 `tmp/BedAgedMaterialsAcceptance/`；旧证据目录保留。全尺寸图保存在本地，日常观察使用长边不超过 640 像素的预览。HTTP 200 或导出日志本身不代表验收通过。
