# Dots Type38 511 runtime integration

## 当前外观：后视反光 · 2026-11-23

把[同一实物的后视照](https://commons.wikimedia.org/wiki/File:Arisaka_Type_38_rifle_(rear_view).JPG)中的柄头、柄颈、覆面、相邻木料和圆盘放在一个透视画面内。公开照片记录为 Canon PowerShot SD1000、1/60 秒、f/2.8、ISO 200、闪光已触发。室内补光、相机处理和实物反射率未知，不能由像素亮度反推出唯一材质。

- 使用八个外观标记近似拟合相机，再由圆盘以外的四个区域选择局部测试光。固定该相机与灯位，比较旧版与发布编码版；不改变游戏相机、关卡光照或曝光。柄颈保留窄亮带而不通体发白，柄头有较宽的暖灰反射；覆面提高中间调。圆盘在原 UV 上调整微法线、点间粗糙度、凸点及中央圆纹，亮带仍随入射光移动。
- 七个区域各取亮度 10%、50%、90% 分位，21 项的平均绝对差由 **31.5 降至 22.8**（0–255 显示亮度）；未参与选灯的圆盘三区，由 **20.0 降至 13.6**。中心中位值参考约 134、新版约 132；上、下半区参考约 206 / 136，新版约 186 / 154。不会把剩余差值当作已消失，也不按照片上亮下暗直接画底色。
- 相对前版变更 11 张内嵌图，226 个几何访问器和十张木料图逐字节不变。另测 8 机位 × 3 灯位，源模型与压缩版的前景亮度 SSIM 最低 0.9878（向下取四位）。仍为 **72,088 / 67,480** 三角、45 部件、116 图，只保留刻度。适用范围是可见游戏外观，不是扫描级复刻或逐痕鉴定。

## 栓尾盘与托尾 · 2026-11-23（前一版）

按[同一实物的后视照片](https://commons.wikimedia.org/wiki/File:Arisaka_Type_38_rifle_(rear_view).JPG)重做栓尾盘外壳。原网格近圆，左上有缺口，却没有照片左下的短凸耳。现版左下凸耳、连续盘缘、向后收窄的侧壁和中央凹部／圆圈均由顶点形成；点纹只承担表面细节，连续铺到凸耳。后视照片能证明外轮廓，不能单独确定侧壁的精确曲率；侧壁是游戏外观近似，不是实物测绘。

[整枪侧照](https://commons.wikimedia.org/wiki/File:Arisaka_Type_38_rifle.JPG)与[反侧照片](https://commons.wikimedia.org/wiki/File:Arisaka_Type_38_rifle_action.JPG)显示托尾靠底板偏暗、向前过渡到暖棕，和前段亮琥珀色不同。仅重分配托尾既有材质中的染色与漆层磨光，未改变木托轮廓、UV 或增加文字。托尾三处木面取样和圆盘上下半区的显示亮度留在本地验收记录，均不作绝对反射率。

近景 **72,088** 三角，普通 NPC **67,480**，预算 **80,000**；仍为 45 部件与 116 图。相对前一版只替换一个外观网格（尾盘 1,599 → 2,880 三角），不改节点挂点与动作。资产回归直接检查左下轮廓和中央凸圈顶点高度，防止退回仅用底色、法线描形。

## 漆木与钢件对照 · 2026-11-23（前一版）

主要依据是[整枪侧照](https://commons.wikimedia.org/wiki/File:Arisaka_Type_38_rifle.JPG)、[中箍和前段木料近照](https://commons.wikimedia.org/wiki/File:Arisaka_Type_38_rifle_(front_stock_detail).JPG)、[反侧斜照](https://commons.wikimedia.org/wiki/File:Arisaka_Type_38_rifle_action.JPG)、[后视](https://commons.wikimedia.org/wiki/File:Arisaka_Type_38_rifle_(rear_view).JPG)和[刻度框顶视](https://commons.wikimedia.org/wiki/File:Arisaka_Type_38_rifle_rear_sight_(top_view).JPG)。仅参考外观，不使用实物照片像素制作运行时贴图；不复刻编号、徽记、刻字。不同机位、闪光强度与曝光不能作为实测 PBR。

- 整体侧照中，托尾与靠近前端的木料偏深，中段更暖；中箍特写又区分出深红上护木、漆木露边和琥珀色下木。底色分区随模型表面连续变化。木孔、薄漆亮带和局部脱漆分别进入颜色、粗糙度、微法线与清漆图。
- 长木托旧 UV 面积仅占图集约 11.5%。仅沿 U 方向拉开原有图岛（不旋转、不翻转、不改变顶点或原接缝），使覆盖率达到 31.8%，横向采样提高 2.77 倍。在新坐标回填材质，重映射共用的数据图、保留透明通道，并把图岛外无效的覆盖值清零。
- 中箍邻近的窄嵌条改为有圆收头、窄边高光的深灰钢，不是覆在木面的大片银色噪声。中箍、裸露长钢面、深色前端与覆面分别处理；刻度框与中央钢面在纹理和失光程度上分开。枪栓、所有几何、动作、挂点和贴图数量不变。
- 检查器在 **8 个机位 × 3 种光照**下对照旧版、新版源模型与实际 GPU 发布副本；近轴闪光仅供局部照片对标，不更改游戏光照。中箍侧面下木／上木显示亮度比：参考 **4.73**、旧版 **1.24**、新版 GPU **5.10**；嵌条／下木各为 **0.44、1.72、0.39**。匹配的是部位关系和外观趋势，并非所有曝光和磨痕逐像素相同。
- 网页压缩相对源模型的 24 组前景亮度 SSIM 最低 **0.9878**（下取四位），指标仅用来检查压缩是否损害质感。运行时 **70,807** 三角，普通 NPC **66,199**；45 部件，116 张内嵌图。源模型由下方 `Script_Type38Surface.py` 重建。

## 馆藏钢件 · 2026-11-23（前一版）

主参考是 Ca.garcia.s 同一件实物的[后视](https://commons.wikimedia.org/wiki/File:Arisaka_Type_38_rifle_(rear_view).JPG)、[反侧斜照](https://commons.wikimedia.org/wiki/File:Arisaka_Type_38_rifle_action.JPG)、[上方斜照](https://commons.wikimedia.org/wiki/File:Arisaka_Type_38_rifle_rear_sight_detail.JPG)和[木箍与长金属面的同框照](https://commons.wikimedia.org/wiki/File:Arisaka_Type_38_rifle_(front_stock_detail).JPG)。取它们共同支持的轮廓与相对明暗，不把室内暖色闪光烘入纹理。

- 柄颈原截面近似方柱，近景拉出平面高光。现在单独重做外观壳与该壳 UV，保留原挂点；圆颈缓慢过渡到较饱满的深色卵形柄头，两段不再是同色银灰。尾部圆面有独立的中央圆纹和错列凸点，坡面响应入射光，而不是只有原法线中的模糊点影。
- 长覆面从蓝黑粗斑转为中性旧钢，反光连续，局部失光来自较大尺度的粗糙度变化；前段外露长金属面按中箍特写改为较亮的钢灰。全枪木件不变，仍仅留刻度；不改变动作或可用功能。游戏近景 **70,807** 三角，普通 NPC **66,199**，仍为 45 部件、116 图。
- 后视与斜侧照片不是正交扫描，柄头曲面与 PBR 响应是外观近似；灯型、相机白平衡及个体表面反射率没有实测标定。

## 直纹木料与初版钢件 · 2026-11-23（前一版）

现版按游戏美术要求不复刻馆藏个体标记：木面刻字、托尾「387」、金属铭文及徽记均不保留，仅保留表尺刻度与刻度数字。木件的底色、法线、粗糙度、清漆和金属顶面的底色、粗糙度均从无字的表面场重建，不用颜色盖住旧字。面数、UV、切线、部件与相机挂点不变；近景 70,822 三角，普通 NPC 66,214，116 张内嵌图。

- 木料用 Poly Haven 的 [Wood Table 001](https://polyhaven.com/a/wood_table_001) 同一采样位置的底色、高度和粗糙度；从直纹带取样，沿模型长度定向投射，两块木件另选木纹。纤维连续跨 UV 岛。薄漆覆盖量和漆层粗糙度分别调制，露木、木孔和抛光区域不共用一个高光值。
- 钢件从 [Metal Plate 02](https://polyhaven.com/a/metal_plate_02) 的粗糙度图取局部小样，不把铁板颜色、接缝或照片光影贴到模型上。暗钢、灰钢和抛亮钢分层，边缘磨亮量随网格弯折和局部磨损变化。保留数字刻度的原法线，不添加新标识。
- 两套通用材质均按 [Poly Haven CC0](https://polyhaven.com/license) 使用，并非这支馆藏实物的实测 PBR；参考照片仅指导外观。程序把表面信息烘回原 UV，并在岛外做 18 像素延边。游戏直接使用 glTF 原色，不再以 2.5 倍统一提亮材质。

**网页副本验收：** 不降低两块木料、刻度、暗钢顶面、亮柄和灰钢箍的发布图分辨率；缩小的是小五金、局部底面及部分辅助图。使用实际压缩模型，在检查器同一机位比较高清版与网页副本；7 机位 × 2 灯位中，排除背景后最小亮度 SSIM 为 0.98513，最大平均亮度偏差 0.865 / 255。这是压缩误差，不是美术质量评分。原 `.blend` 和 Git 中的源 GLB 均保留全分辨率。

**当前重建入口**（Python：NumPy、Pillow、SciPy、OpenCV；第一次从 Poly Haven 下载四份带哈希校验的输入，之后离线使用缓存）。

```powershell
python Taierzhuang1938/_blender/Script_Type38Surface.py
node Taierzhuang1938/Script_Type38_511AssetTest.mjs
node Taierzhuang1938/Script_Type38_511BrowserTest.mjs
```

## 历史外观版 · 2026-11-22（含字，不是现版）

近景 / 检查器 / 地面模型 **70,822** 三角，普通 NPC **66,214**，上限 80,000。仍是 45 个部件 / 116 张内嵌图，不增加材质、采样器或绘制批次。下方 11 月 8 日的历史记录不是本版数据。现版哈希、部件面数增量、每张成品图哈希与各部件的粗糙度分位值见同目录 JSON。

| 可见问题 | 实物依据 | 本版处理与证据边界 |
| --- | --- | --- |
| 图二正面准星中央透光 | [三八式长步枪完整侧照，放大前端](https://commons.wikimedia.org/wiki/File:Arisaka_Type_38_rifle.JPG) | 原 GLB 中央外形与外底座分离。延伸既有外皮，保留顶点高度；用侧向射线和回导正面近景检查，不建内部件。 |
| 图一、三深色金属、亮柄和护圈像同一种光泽 | [澳大利亚战争纪念馆 C142149 的材质记录](https://www.awm.gov.au/collection/C142149)、[实物环箍特写](https://commons.wikimedia.org/wiki/File:Arisaka_Type_38_rifle_(front_stock_detail).JPG)、[实物近照](https://commons.wikimedia.org/wiki/File:Arisaka_Type_38_rifle_action.JPG) | 暗色表面、磨亮的环箍和亮柄分开调色；粗糙度叠加局部抛光、细条纹及轻微斑驳。照片光照不同，不以照片亮度作绝对反射率。 |
| 木料高频斑纹与接缝高光 | 同一组环箍细照、[后部视图](https://commons.wikimedia.org/wiki/File:Arisaka_Type_38_rifle_(rear_view).JPG)、[照门顶视](https://commons.wikimedia.org/wiki/File:Arisaka_Type_38_rifle_rear_sight_(top_view).JPG) | 分离木料大纹理和亮色纤维，降低划痕对比，保留薄漆反射。对托底板、中箍、木托金属嵌边、护圈等可见硬边做局部双段倒角。其余接缝通过原有几何和表面层次显示，不把所有交接处刷成白线。 |
| 使用状态 | [C138903：战损藏品](https://www.awm.gov.au/collection/C138903)、[C153513：严重腐蚀藏品](https://www.awm.gov.au/collection/C153513) | 用来区分不同保存状态；不照搬缺件或重锈。本版不是某支滕县实枪的扫描；旧痕、反光强度及不可见面没有逐处实物认证。 |

### 单件实物外观对标

主参考限定为 Ca.garcia.s 于 **2013-05-17** 同一晚拍摄的三八式照片组（Wikimedia Commons，CC BY-SA 3.0）。它们是历史实物的现代照片，不是 1938 年战地照；澳大利亚战争纪念馆照片只用于辨别不同保存状态，不从另一件藏品移植附件或磨痕。游戏材质手工绘制，不将照片的闪光、阴影或背景烘进贴图。

| 部位 | 主参考 | 实际落实与边界 |
| --- | --- | --- |
| 托尾 | [完整侧照](https://commons.wikimedia.org/wiki/File:Arisaka_Type_38_rifle.JPG) | 手绘单侧竖排「387」，沿木纹保留不均匀墨色；它是这件实物的外观标志，不是滕县参战枪编号的证据。 |
| 前段木料、中箍 | [中箍侧面](https://commons.wikimedia.org/wiki/File:Arisaka_Type_38_rifle_(front_stock_detail).JPG)、完整侧照 | 中箍为磨亮的灰钢；一侧狭长嵌条通过现有 UV 的底色、金属度、粗糙度、法线表现，不建隐藏结构。前后木料减弱碎亮纤维，重新写入清漆贴图 R/G；旧版两块木料的清漆 R 通道均为零。 |
| 上护木刻痕 | [木面刻痕近照](https://commons.wikimedia.org/wiki/File:Arisaka_Type_38_rifle_inscriptions.JPG) | 按可见笔画画出深浅不一的痕迹，局部破漆；未认定文字含义。沿木料的方向可见，照片裁切缺乏两端定位，纵向落点为估计。 |
| 上方金属铭文 | [铭文与磨损纹样](https://commons.wikimedia.org/wiki/File:Arisaka_Type_38_rifle_action_inscriptions.JPG) | 保留可读「三八式」与纹样两侧残留轮廓，中间作擦磨，不还原成完整徽记。划痕位置与光泽是表现性重建，不是逐痕测绘。 |
| 尾端金属圆面 | [尾端近照](https://commons.wikimedia.org/wiki/File:Arisaka_Type_38_rifle_(rear_view).JPG) | 外圈细密点纹、内圈圆痕以及亮暗差异通过底色、粗糙度、法线表现，不增加几何面。 |
| 上方框面 | [顶视](https://commons.wikimedia.org/wiki/File:Arisaka_Type_38_rifle_rear_sight_(top_view).JPG) | 将顶视照片与现有法线贴图分行转正，逐字符核对：两行所含数字与顺序一致。保留原字形，仅将凹笔画同时写入底色与粗糙度，改善顺光可读性；另区分内片与圆面颜色，补圆面斜线。实机左端一个字符被原有外形遮住。数字内容相符不等于字体、物理位置或整张顶视外形全等。 |
| 托部双印定位 | [双印特写](https://commons.wikimedia.org/wiki/File:Inscriptions_on_a_Japanese_Arisaka_Type_38_rifle.JPG)、[反侧斜照](https://commons.wikimedia.org/wiki/File:Arisaka_Type_38_rifle_action.JPG)、完整侧照 | 同组侧照与反侧斜照均看不到能与特写同时对应的两个印形及邻近缺口。用木面局部作三个尺度的特征配准，未取得可验证变换；同图旋转缩小的阳性对照能配准。不能由此断定实物没有双印，也不在模型上猜位置。 |
| 证据边界 | [作者在 Commons 的公开上传](https://commons.wikimedia.org/wiki/Special:ListFiles/Ca.garcia.s) | 核验时作者上传清单共 103 项，未分页；已辨认的同组三八式照片为九张。双印图、整侧照、反侧斜照和后视图的文件记录各仅有一个图像版本，未列其他版本。这不能排除作者有未公开照片。未覆盖面、绝对反射率、磨痕精确分布及 1938 年的个体状态均未确认。 |

**中箍外露木边复查。** 把[原始近照](https://commons.wikimedia.org/wiki/File:Arisaka_Type_38_rifle_(front_stock_detail).JPG)转为与侧照相同的方向，可见从灰钢箍到深色长段之间还有一段红棕漆木，另侧边缘有一处磨暗的漆斑。旧版上护木在箍内结束，固定相机下完全不露。现版仅调整既有上护木网格的端部轮廓、相应法线和切线，并在木材贴图上区分露边与局部磨漆。不改变索引、UV、三角面数、其他部件或玩法挂点。验证包括同机位两灯位、侧面首个可见表面判定、网格切线和非退化检查。露边长短按照片中与箍宽的视觉比例取近似，不把透视照片当测绘。

未新增部件、材质或贴图槽。近景实机对照固定相机、灯光和曝光；浏览器回归在木面有效纹素上抽样验证清漆，避免再次出现材质参数非零但贴图完全屏蔽清漆的情况。

**网页发布贴图。** 源 GLB、Blender 工程和玩法不因传输预算而修改。仅在发布副本给 20 张金属部件贴图设置逐图尺寸上限；木料、铭记、凹字和木边相邻长金属面的分辨率不变。用同一源模型分别运行正式发布编译器，得到 34,426,492 与 28,612,292 字节；剩余 96 张编码成品逐字节相同。检查台用两个实际 GPU 版本、12 机位 × 2 灯位对照，排除背景后的最小亮度 SSIM 为 0.99793；该值衡量本轮压缩差异，不证明历史一致。逐视图数据与最大差异局部留在本地 Review 目录。

**重建 11 月 22 日历史版，不是当前入口**（仓库根目录，系统 Python 需要 NumPy / Pillow；Blender 使用 5.2）：

```powershell
python Taierzhuang1938/_blender/Script_Type38ExteriorFinish.py
node Taierzhuang1938/Script_Type38_511AssetTest.mjs
node Taierzhuang1938/Script_Type38_511BrowserTest.mjs
```

脚本从 Git 读取经哈希验证的未调色原图（`33062973`）及上版已验收的 Blender 网格（`0ad1f3a0`）。不重复调色、不重新排序顶点、不必存几份旧 GLB。普通 NPC 共用近景贴图。下方旧命令只用于重建基线，不要覆盖现版。固定机位对照与可编辑工程在 OneDrive 的 `Blender/Taierzhuang1938/Type38_Exterior_20261122/`，不随游戏发布。

## 原接入基线 · 2026-11-08

The `Type38` gameplay id now resolves to the 511 GLB for FPS, NPC/carried weapons,
ground pickups and the weapon editor. `Type38_511` is its external model id. The
old TZM remains an offline source/regression fixture and is not requested by the
game's weapon preload path. Failure of the new GLB is explicit, with retry.

The user requested performance in the same class as the in-game HanYang (68,657
triangles), with as much visible detail retained as possible. The accepted
reduction is 69,454 triangles from 473,796. The runtime adds a real 4.5 mm rear
sight notch (+132 triangles), for **69,586 triangles, 45 parts, 116 images**.
`Data_Type38_511.json` records the source/runtime hashes and each original image
payload hash. Images, UVs, source normals/tangents and material definitions are
retained; only the sight crosspiece changes at import.

The pre-integration high/low comparison uses identical lighting and six views
at 1280x720. Silhouette-mask mismatch is 0.115–0.570%; mean foreground RGB
difference is 0.75–1.61 on a 0–255 scale. Sampled surface deviation peaks at
0.2085 mm across 867,125 samples. These are measurements of the accepted
reduction before the intentional runtime sight-notch cut. Original reports and
paired images are in `Reduction68K_20261108/Reports` and its local review folder.
The runtime has 45 parts/37,566,608 bytes; HanYang has 44 parts/61,640,884 bytes.
This compares geometry and asset footprint, not full-scene FPS equivalence.

High-poly author source, the 473,796-triangle PBR high model, the accepted reduced
GLB, and the editable high/low Blender project remain in OneDrive:

`C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/Type38_511Audit_20261108/`

The original delivery's SHA256 is
`450e5435ad7f2e8146eda68f1b82fbd08fcba4cdf02708912a890d7089c37df6`.
The accepted reduced source is
`Reduction68K_20261108/Exports/Model_Type38_511_Reduced68K.glb`, SHA256
`1abb1e89443bd420b1ff86eba80584ee20c87ce68a2969c7c4739cc038fd6f82`.

## Coordinate and mechanical interface

Ordinary NPCs use 64,978 triangles: only `Exterior_FoldedFrame12` changes from
5,760 to 1,152 triangles. The other 44 parts retain their exact full geometry;
all materials/images are shared. FPS, editor/world model instances and explicit
NPC closeup detail keep 69,586 triangles. `Model_Type38_511NpcLod.glb` adds only
251,172 bytes of geometry, with no second copy of any image. Its source UV
normal/tangent field is transferred, with maximum sampled surface deviation
0.156 mm. Four 1280x720 closeup pairs have mean whole-image RGB differences
0.08–0.22/255. This fixes the measured legacy phase6 render budget from 9.032M
to 8.875M triangles under the unchanged 9M limit. It does not alter the FPS gun.

Source vertices independently confirm metres, Y-up, muzzle -Z. The rigid offset
`[0,-0.005,-0.027]` aligns the source to the game's trigger/stock frame without
resizing or deforming it. `Data_Type38_511.mjs` owns the measured muzzle, eye line,
feed/ejection, bolt pivot and handle, and the semantic moving-part lists.

The four authored handle/tail parts form `boltBody`; the two cover halves form
`dustCover` and translate independently without inheriting bolt rotation. The
existing Type38 action/shot/reload clocks and cartridge inventory remain in use.
The source's two "visual only" Actions are not imported as verified gameplay
animation. The actual front blade lives in the retained imported remainder;
`FrontUpperRoot80` is its base, not its aiming crown.

First-person contact and shoulder data are fitted to the new actual mesh. Hand
mesh, skin weights, skeleton and bone lengths are unchanged. ADS uses a 0.38 m
eye distance for the source's farther-forward sight. The original metal sling
loops are independently measured in the new GLB, after the same frame offset.

## Materials and ownership

`Script_Type38_511` loads through `ManagedGLTFLoader`. FPS/world instances own
private geometry and share the configured source PBR materials/textures. Normal
and tangent regeneration/welding is prohibited: their transferred UV fields
preserve the accepted wood and metal microdetail. Clearcoat/specular are retained.
A `preserveAuthored` material policy bypasses character-name classification:
the source's "Skin" and "Head" names describe several metal shells. Their PBR
must not become skin scattering or lose physical material layers.
A uniform colour gain of 2.5 compensates for author studio exposure, matching the
existing authored-rifle policy; relative part colours, roughness, metalness and
image pixels are retained. Texture anisotropy is capped at the device's 16 limit.
Published KTX2 normal/ORM/coat/specular-intensity maps are explicitly tagged
`NoColorSpace`, matching the source numeric-data slots; base colour retains sRGB.
This normalizes decoder metadata without modifying pixels, mips or GPU format.
The actual published mixed-format GLB passes the complete gameplay acceptance,
including the unchanged strict normal/ORM tag assertions.
The original clearcoat strength/roughness slots share one texture. The
`sharedClearcoat1` registry patch makes their R/G lookups use one sampler;
both slots, UV transforms and filtered channel values remain intact. This
keeps the full material within the fragment-stage budget with GI, SSR and
three world-shadow cascades. BatchedMesh's two vertex table samplers count
against the separate vertex/combined limits.

Pages uses the existing automatic GPU-image publication path, including its
explicit 2048 maximum and KTX2 rules. Original source images stay in Git/the local
source package; GPU compression is not a claim of pixel-identical online images.
Four packed data images (indices14,83,91,96) contain valid RGB at zero alpha.
Their explicit `#image/N` rules use lossless PNG, retaining all four channels;
the other112 images use BC7. Publication tests compare the actual four decoded
RGBA buffers exactly and read zero-alpha RGB back from a real GPU upload.
The local publication candidate is29,703,856 bytes versus37,566,608 source bytes.
Source/published rendering measures foreground RGB mean difference0.519/255
and95th-percentile difference2/255, with unchanged bounds and zero GL errors.

## Rebuild and verification

From an owned worktree, set `TYPE38_REPO_ROOT` to that worktree. The optional
`TYPE38_AUDIT_ROOT` overrides the OneDrive root above. Then run:

```powershell
node scripts/Script_BlenderMcp.mjs start --batch Taierzhuang1938/_blender/Script_Type38_511Runtime.py --task Type38Runtime
node scripts/Script_BlenderMcp.mjs start --batch Taierzhuang1938/_blender/Script_Type38NpcLod.py --task Type38NpcLod
node scripts/Script_BlenderMcp.mjs stop
node scripts/Script_BlenderMcp.mjs status --scan
node Taierzhuang1938/Script_Type38_511AssetTest.mjs
node Taierzhuang1938/Script_Type38_511BrowserTest.mjs
```

The local reduction and high/low reconstitution scripts remain next to the
OneDrive editable project. They preserve 24 source parts exactly; the runtime
notch is the recorded exception. Runtime builder imports the accepted hash,
changes only that crosspiece, and copies the full source image payloads.

Additional gates: `ModelFacingTest`, `AssetStandardsTest`,
`RifleSlingClothTest`, `AdsSightTest --only=Type38`,
`FpsArmTest --only=Type38`, `FpsHandContactTest --only=Type38`,
`FpsReloadMechanicsTest`, `WeaponRangeTest --only=Type38`,
`MotionVectorContractTest`, `SamplerBudgetTest` and the normal prepush profile.
Screenshots, model review pages and high/low comparisons stay local.

Exterior colour, grain, rust, wear and hidden construction are artistic
reconstruction, not a trace-by-trace scan or evidence for a particular rifle at
Tengxian. Sight, grip and action adaptations are game design. This boundary is
also recorded in the game's HistoryAndCreation entry and Notion ledger.

## Integration validation (2026-11-08)

The final mapped prepush selection covers304 tests:280 pass,24 have verified
pre-existing failures on unmodified `d896167b4e5be025bdffb776757b6f595c6d23a2`.
No new failures remain. The initial sampler/link error and9.032M scene-budget
regression were fixed; phase6 now submits8.875M under the unchanged9M limit.
Respawn timing and sling timing were rerun without parallel browser loads and
pass, including35/35 sling checks. The geometry-only NPC change additionally
passes all8 targeted factory/ownership, actual FPS/NPC, facing, standards, motion
vector and crowd/batch checks. The opt-in PBR policy leaves other assets unchanged.

Raw logs, baseline comparisons and screenshots are archived locally under
`Integration_20261108/Reports` beside the retained OneDrive source project.
No baseline assertions were removed or weakened. Verified baseline failures:

| Test | Existing failure |
|---|---|
| `EditorFirstPersonMotionBrowserTest` | slow-motion movement; first-person camera toggle; fixed-view torso twist; camera/slow-motion restoration |
| `EditorBlockoutMapEditBrowserTest` | legacy Kitchen box selection; group movement; Ctrl+Z/Ctrl+Y marker undo; exported legacy Kitchen entries |
| `EditorBlockoutBlanketClothBrowserTest` | 02-3 initial flat blanket state: drag=1, top=0.721 instead of flat |
| `TrenchEditorTest` | Exit adds ten geometries in both trees (current 718 to 728, baseline 632 to 642) |
| `HeadshotTest` | Distant kneeling head hit returns shape:null |
| `EditorTest` | Menu entry count; Asset table labels; Legacy ZB26 stats; FPS debug nonMetal assertion; Debug metalness pixel coverage |
| `FirstPersonEmbodimentTest` | Stand look-down shows the actual body mesh |
| `FpsHandLeftSelfContactTest` | leftHolding: digits 1/2 have 60 transverse crossing skin triangles |
| `MeleeAnimationTest` | BayonetLight: first-person hand absent for most frames (10/31) |
| `EmplacementViewBrowserTest` | mounted Zb26: actual left skin penetrates gun solids (1 vertices, 0.04284116233272198mm) |
| `TestSceneLightingTest` | Legacy cast-count fixture expects ten unique models; both trees return seven |
| `TaauTest` | Velocity-buffer isolation ratio: moving/static pixel difference 4.545/3.14 current versus 4.548/3.14 baseline; DOF draw-saving count below existing threshold; current saves two, baseline saves zero |
| `PropInstancingTest` | phase2: instancing increases draws by 23; phase4: instancing increases draws by 3; phase5: instancing increases draws by 27 |
| `FrameDebuggerTest` | switching editors must release captured GPU resources before editing |
| `SavedGraphicsWarmTest` | Grenade fixture: thrown=false, explosion frame=-1, killed=0/3 |
| `WhiteboxShaderWarmTest` | First main-scene pass links one additional program |
| `ClothBloodBrowserTest` | At line154, actual undefined versus expected false |
| `FirstLevelP012DebugTest` | normal R reload works after skipping issue (line58) |
| `CommandRoomPublicationTest` | Fixture does not create Model/Character output directory for Model_AzumaShiro_Mobilea3e20baf202bbbd68e2398cd.glb |
| `DeathMenuTest` | actual rifle hand is in the frame at death, not just an enabled root (line86) |
| `BootInteractionTest` | Loading UI wait times out after120000ms at line105; worker parity and drag lifecycle33/32 checks pass |
| `OldGengCharacterBrowserTest` | Final httpFailures assertion includes navigation-cancelled model requests (net::ERR_ABORTED) |
| `MenuTest` | FAIL 从设置/编辑器回来再「继续」，大刀还在手里; FAIL 先换到大刀（这一段按玩家那次的持械走）; FAIL 只剩正式章节与八项测试入口两组，没有「暂时废弃场景」组; FAIL 实际渲染 Blender 指挥室、独立相机及烘焙光照; FAIL 收起设置·controls 仍在设置页，大刀还在手里; FAIL 收起设置·graphics 仍在设置页，大刀还在手里; FAIL 收起设置·sound 仍在设置页，大刀还在手里; FAIL 点进设置·controls 时大刀还在手里; FAIL 点进设置·graphics 时大刀还在手里; FAIL 点进设置·sound 时大刀还在手里; FAIL 训练入口显示八项测试，方向键停在当前分组; FAIL 选章列出操作、枪械、玩法、爆炸、白刃、断肢、炮击扬尘、人物战场反应八项测试入口（第一关已归入正式章节） |
| `BootTest` | Legacy phase0 explosion-light envelope and four particle-instance fixtures; Legacy phases1–6 Japanese distance-recognition material count=0 |
