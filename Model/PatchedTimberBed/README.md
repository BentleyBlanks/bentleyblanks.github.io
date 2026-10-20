# PatchedTimberBed

最终完整整床为 **48,313 三角、8,698,444 字节、6 网格／材质／绘制**，版本 `20261021BnBs50kV2`，GLB SHA256 为 `0fdddc8bafabf5cb6d538938b5f4fb798f692da2708432d5e30b5e024823b435`。相对上一版 288,799 三角减少约 **83.27%**，低于整床 50,000 三角硬上限。统计包含主被面、BS 脚端、木架、草垫、枕头、缝线及全部承托附加几何；尺寸、图像与完整文件契约见 [Data_Asset.json](Data_Asset.json)。

本轮结构、独立接触、真实 WebGL 与独立人工视觉验收通过。直接对照用户红圈确认灰补片的液体旋涡色团已消除，平实灰棉布、大褶和缝线保留；木架旧化与主要草垫编织可见。42/42 接触点满足未放宽的 ±2 mm 门槛，实测间隙约 **0.24998–0.25004 mm**。冷开核验为 6 个游戏网格、14 张 packed 图像可解码、6 项只读输入哈希不变。本次证据保存在 `tmp/BedBnBs50kAcceptance/`，与最终 GLB 哈希对应；旧版证据另留在 `tmp/BedBnBsAcceptance/`。

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
| Straw | 高源临时合并后一次烘色，按原面角索引散回各源构件，再按角色逐件隔离减面；保留主要外露编织、绑绳及脚端延伸，不通过删除外露编织岛凑预算。原法线使用 UV0，强度 **0.12**。压实承托体与低模棉布下壳共同重建。 |
| Frame | 米制顺纹／端纹程序 PBR，表达裂缝、灰化、边角磨损露木和脚部潮渍；游戏版颜色 **2048**、法线 **1024**、粗糙度 **512**，原 2K 烘焙保留在源目录。同曝光整床与近景检查可见旧化。 |
| Pillow / Sewing | 各自 **512** PBR atlas，保留枕头体量、补片与主要缝线读感。 |
| BS_FootCloth | 原低频旧化 `COLOR_0`、独立 UV1、Base/Normal 各自变换及原 WebP 字节保持；法线强度仍为 **0.5**。 |

木架处理见 [Script_PatchedTimberBedWood.py](Script_PatchedTimberBedWood.py)。BaseColor 为 sRGB，法线和粗糙度为线性数据。材质烘焙排除直接光与间接光，不把摄影灯光写入 BaseColor。

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
  Scene_OriginalBed.blend
  Scene_PatchedTimberBedHigh.blend
  Scene_PatchedTimberBedGame.blend
  Bakes/
  Scripts/
  History/Revision_BnBsV1_20261021/
    Scene_PatchedTimberBedHigh.blend
    Scene_PatchedTimberBedGame.blend
    Scene_BedBakeProgress.blend
```

上一版 High、Game 与 Base/bake checkpoint 已备份到 `History/Revision_BnBsV1_20261021/`。本轮工作使用当前工程，旧版备份保留。

`Inputs/` 是只读重建输入。原始归档位于 `C:/Users/Bentl/OneDrive/AI/Models/Blender/DotsAcceptance20261020/BedBN/Restored/` 与同级 `BedBS/`，两处都不得覆盖。原参考、历史配方和完整高精度源继续保留；`.blend`、自动备份、过程图与验收素材不进入 github.io 仓库。

`Scene_OriginalBed.blend` 保留完整原源；本轮 High 保留原可见布面并调整木架材质，Game 保存 50k 预算内表示。摄影地面不参与游戏导出。当前配方复制到源目录 `Scripts/` 并嵌入工程 Text，执行以本轮 Bake/Rebuild 正式链路为准。

## 重建

在仓库根目录运行。需要本机 Blender、Python、NumPy 和带 WebP 支持的 Pillow；Blender 由仓库 `Script_BlenderMcp.mjs` 管理。

```powershell
node Model/PatchedTimberBed/Script_PatchedTimberBedRebuild.mjs --source-root=C:/Users/Bentl/OneDrive/AI/Models/Blender/PatchedTimberBed20261020
```

默认过程与验收目录为 `tmp/BedBnBs50kAcceptance/`。可选 `--review-root=<本地目录>`、`--output=<输出GLB>`、`--python=<Python命令或路径>`；参数使用 `--名称=值`，含空格时引用整个参数。例如：

```powershell
node Model/PatchedTimberBed/Script_PatchedTimberBedRebuild.mjs "--source-root=C:/Users/Bentl/OneDrive/AI/Models/Blender/PatchedTimberBed20261020" --review-root=tmp/BedBnBs50kAcceptance --output=Model/PatchedTimberBed/Model_PatchedTimberBed.glb
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

与上一版游戏模型比较：

```powershell
node Model/PatchedTimberBed/Script_PatchedTimberBedTest.mjs --comparison --original=tmp/BedBnBs50kAcceptance/Model_PreviousBed.glb "--original-label=上一版288799三角" --max-triangles=50000 --url=http://127.0.0.1:8125
```

`Model_PreviousBed.glb` 是本地上一版对照，不参与本轮 50k 交付。原始高模可由重建的 `--comparison` 生成，再通过测试的 `--comparison --original=tmp/BedBnBs50kAcceptance/Model_OriginalBed.glb` 使用。高模 WebGL 是原形体与颜色烘焙转换；原材质保真比较仍以相同 Cycles 灯光和机位的源渲染为准。

测试还支持 `--model=<GLB>`、`--out=<证据目录>`、`--contract=<资产清单>` 和 `--max-draws=<上限>`。省略 `--url` 时创建临时本地服务；复用本任务 8125 预览时，对照页生成在 [本轮本地验收入口](http://127.0.0.1:8125/tmp/BedBnBs50kAcceptance/index.html)。

人工视觉复核直接对照用户原红圈，确认灰补片液体旋涡色团消除，平实棉布、浅大褶、补片布局及缝线保留。Support、Frame、Front、Foot、Back 和整床视角通过：前缘主编织连续，未见浅色承托板或大洞，木架在同曝光整床与近景中可见顺纹裂缝、灰化、边角及脚部磨损；无明显悬空、穿透或黑缝。

实际结果引用本轮 `Data_StructuralReview.json`、`Data_ContactReview.json`、`Data_BrowserReview.json`、`Data_IndependentVisualReview.json` 和对应图像，并与 `Data_Asset.json` 的 GLB 哈希对齐。42 点与目视不构成全表面数学零相交证明。HTML、对照 GLB、渲染图、截图及报告只留在忽略的 `tmp/BedBnBs50kAcceptance/`；旧证据目录保留。全尺寸图保存在本地，日常观察使用长边不超过 640 像素的预览。HTTP 200 或导出日志本身不代表验收通过。
