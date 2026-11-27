# Dots Type38 511 runtime integration

## 当前交付版 v29

游戏使用 `511-seated-plate-29`。近景 79,894 三角，普通 NPC 75,286 三角。游戏 GLB 有 23 个渲染子网格和 68 张内嵌贴图。枪身仅保留刻度线和刻度数字。下方修订记录对应各版产物。

| 用途 | 入口 |
| --- | --- |
| 游戏取用 | [运行时配置](../../Data_Type38_511.mjs) · [近景 GLB](Model_Type38_511.glb) · [NPC 照门 LOD](Model_Type38_511NpcLod.glb) |
| 重建与核对 | [外观重建脚本](../../_blender/Script_Type38Surface.py) · [子网格与贴图合并](../../_blender/Script_Type38RenderBatches.py) · [资产清单与 SHA-256](Data_Type38_511.json) |
| 回归测试 | [资产检查](../../Script_Type38_511AssetTest.mjs) · [第一人称与 NPC 实机检查](../../Script_Type38_511BrowserTest.mjs) |

## 尾盘下方的钢片贴合缝 · 2026-11-27

标注两侧的锯齿来自木托肩部的局部凹槽和顶点法线。恢复木托曲面，按钢片轮廓拟合接缝附近的法线，并使钢片底边嵌进木面。沿两侧以 464 处近边缘采样检查贴合，再离线重烘木托和钢片的局部 AO。以两侧近景与斜光检查高光。 [贴合修复脚本](../../_blender/Script_Type38SeatFit.py)

## 后部倒角与高密度离线 AO · 2026-11-27

后视照片用来核对尾盘的窄外缘和凸点，侧斜照片用来核对覆壳唇边、钢环和侧板贴木处的明暗过渡。俯视与馆藏照片辅助校准外露钢面的磨光范围。 [后视照片](https://commons.wikimedia.org/wiki/File:Arisaka_Type_38_rifle_(rear_view).JPG) · [侧斜照片](https://commons.wikimedia.org/wiki/File:Arisaka_Type_38_rifle_action.JPG) · [钢面俯视](https://commons.wikimedia.org/wiki/File:Arisaka_Type_38_rifle_action_inscriptions.JPG) · [澳大利亚战争纪念馆](https://www.awm.gov.au/collection/C142149)

用离线射线烘焙重算后部接缝的 AO。该区域每个样点用 144 条射线，局部 UV 烘焙网格最长边为 1536。通过面法线剔除穿过起始表面的射线，活动件之间按近接触衰减。尾盘点纹之间的微遮蔽依据其材质法线计算。覆壳唇边、侧钢板、钢环与尾盘的倒角沿现有曲面调顺粗糙度和微法线，高光线在同机位斜光下核对。 [后部烘焙脚本](../../_blender/Script_Type38RearFinish.py)

局部重烘可用 `Script_Type38RearFinish.py --input <v27 资产目录> --output <输出目录>`。

## 钢件倒角和木面漆边高光 · 2026-11-27

按相邻法线的转向和现有圆角挑出外露边缘。钢件磨亮处在 ORM 的 G/B 通道降低粗糙度并提高金属度。木件沿凸起的圆角减小清漆粗糙度并提高清漆覆盖，在压痕、孔隙和凹缝处衰减磨光。用同机位的主灯和两侧斜光核对高光。 [倒角材质烘焙脚本](../../_blender/Script_Type38EdgeHighlights.py)

局部重烘可用 `Script_Type38EdgeHighlights.py --input <v26 资产目录> --output <输出目录>`。

## 加深接缝和木面凹部遮蔽 · 2026-11-27

加深箍口、机匣和木钢交界的接触遮蔽。前托和握持区沿已有压痕补环境遮蔽，局部木孔使用木材法线的凹谷烘焙。AO 按木料范围写入两件木面的 ORM R，并与几何遮蔽一起采样。

## 接缝环境遮蔽 · 2026-11-27

沿已装配网格的可见表面烘焙短程遮蔽，覆盖前后箍、木托接缝、照门座、机匣、护圈和托底板边缘。相对运动的部件只保留贴近接触的遮蔽，避免在游戏动画中出现宽阴影。检查台的 AO 通道和游戏的外观材质共用 ORM 的 R 通道，G/B 保留粗糙度和金属度。 [遮蔽烘焙脚本](../../_blender/Script_Type38AmbientOcclusion.py)

完整重建另需 Python 包 `embreex==4.4.0.post1`。本地已有配套的 GLB、资产清单和 NPC LOD 清单时，可用 `Script_Type38AmbientOcclusion.py --input <源目录> --output <输出目录>` 单独重烘 AO。

## 前段钢面、木托使用痕迹和接缝 · 2026-11-27

标记处的前段钢面沿长轴重烘细磨纹。局部磨亮的位置粗糙度更低，暗灰氧化区略散光。底色、金属度、粗糙度和法线分别烘焙，同机位用主灯和斜光检查高光是否连续。 [前段实物近照](https://commons.wikimedia.org/wiki/File:Arisaka_Type_38_rifle_(front_stock_detail).JPG)

前托、握持区和托尾的旧漆加入零散压痕与脱漆。压痕底部保留暗色压实的木纤维，只有少数边缘露出浅木。凹面和漆边共用遮罩驱动法线、底色、粗糙度和清漆层。 [实物全长侧照](https://commons.wikimedia.org/wiki/File:Arisaka_Type_38_rifle.JPG)

顺修了照门内框、外沿、滑块肩角和座边的外露转折，并按曲面方向重烘窄磨光。准星顶面的三角折面合为连续的朝向，沿用原最高点。 [照门实物近照](https://commons.wikimedia.org/wiki/File:Arisaka_Type_38_rifle_rear_sight_detail.JPG)

中箍的上弧顺着模型已有的外露木面收紧，侧面渐变接回下沿。实物近照显示箍面与木托贴合，外侧留细接缝。模型的验收按这一可见外观取样。 [中箍实物近照](https://commons.wikimedia.org/wiki/File:Arisaka_Type_38_rifle_(front_stock_detail).JPG)

运行时将材质设置兼容、跟随同一动画节点的网格合并，按原有纹素比例重排 PBR 图集。资产清单记录实际渲染网格数和每张内嵌图的校验值。Blender 源工程保留逐件编辑。

## 后部圆角和接缝露木 · 2026-11-26

按用户标记的近景重做覆面后缘、槽口唇边、柄根、后钢环、侧板以及尾盘外缘的可见圆角。磨光分布按原网格的转折方向烘进粗糙度和底色，在主灯、反向灯和掠射光下核对边缘高光。 [后部实物照](https://commons.wikimedia.org/wiki/File:Arisaka_Type_38_rifle_(rear_view).JPG) · [侧斜实物照](https://commons.wikimedia.org/wiki/File:Arisaka_Type_38_rifle_action.JPG)

局部收顺接缝里突出的露木，保留木纹坐标并重烘遮蔽处的旧木底色和漆层。实机检查用同一张木托贴图对照接缝内的低光泽木面与外露木面。

## 上护木和前段钢色 · 2026-11-26

按用户标记的检视器机位，重烘上护木的棕红旧漆和前段木托的顺纹。木纤维、孔隙与局部漆磨损共用贴图坐标。前段露钢采用连续的深灰色，近箍处保留小范围磨光。新增一张磨纹法线，受光时可见细擦纹和钢面的浅起伏。 [实物侧照](https://commons.wikimedia.org/wiki/File:Arisaka_Type_38_rifle.JPG) · [中箍实物近照](https://commons.wikimedia.org/wiki/File:Arisaka_Type_38_rifle_(front_stock_detail).JPG)

加宽两道箍口的实际圆弧并重做前箍外露台阶的圆角。圆角上较常磨到的部分粗糙度略低，换灯时亮线沿弧面移动。实物侧照用于核对大面积木色和钢色，近照用于核对局部高光与接缝。

## 木孔、钢面细磨纹及接缝圆角 · 2026-11-26

从现有材质扫描分离顺着木纤维的细纹和木孔。木孔同时影响底色、法线和漆面的局部粗糙度，漆层在干磨、凹槽和打磨过的位置形成不同宽度的反光。钢面在原有暗灰色上加入细磨纹和浅蚀点。光扫过前段和覆面时，可以看到分散的细反光。 [木托和钢件全长侧照](https://commons.wikimedia.org/wiki/File:Arisaka_Type_38_rifle.JPG) · [前箍实物近照](https://commons.wikimedia.org/wiki/File:Arisaka_Type_38_rifle_(front_stock_detail).JPG)

在护木端缘、托尾、外壳唇边、下方钢面和前箍等 11 个部件上增加圆角。两道箍口使用与端面、外壁相切的圆弧，使高光沿接缝移动时连续转过边缘。生成脚本通过 BlenderMCP 重建局部边缘网格，再按同一 UV 烘焙运行时贴图。验收使用主灯、反向灯和掠射光，覆盖枪托两侧的木面、护木、前段、后部钢件和底部接缝。 [圆角重建](../../_blender/Script_Type38Roundovers.py)

## 栓柄与覆面的钢色 · 2026-11-26

按标注图校准柄根、柄颈、柄头和尾盘。栓柄和尾部钢件共用覆面的暗灰钢色范围。柄颈去掉独立的底色增益，增加擦纹间的粗糙度变化，减弱沿柄身拉长的镜面反光。尾盘点纹顶端留有磨亮钢色，凹部使用较暗的旧钢。重烘了六张内嵌底色与金属粗糙度贴图。

使用标注图机位固定相机、灯位和曝光，按可见部件取样。主灯下柄颈的显示亮度中位数由 163 降到 87，旁边覆面为 82。反向灯下柄颈由 154 降到 73，覆面为 72。另用后视与侧视检查点纹和柄头随灯位变化的反光。

## 木纹与旧钢 · 2026-11-26

木料的底色、毛孔与漆层粗糙度共用沿木纹分布的扫描区域，邻近区域连续相接。托尾保留红棕木色和细纹，护木与长枪托各自使用一套纹样。漆层在磨过的位置形成窄反光，凹处和旧漆较暗。 [实物全长侧照](https://commons.wikimedia.org/wiki/File:Arisaka_Type_38_rifle.JPG) · [实物前段近照](https://commons.wikimedia.org/wiki/File:Arisaka_Type_38_rifle_(front_stock_detail).JPG)

钢面的拉丝、细坑与粗糙度依照表面方向连续变化。覆面另有低频的氧化层变化。栓柄和后钢环采用更深的暖灰钢色，接触处的磨亮反光和底色分开。尾盘点纹保留局部磨亮，凹部使用暗钢。 [后视参考](https://commons.wikimedia.org/wiki/File:Arisaka_Type_38_rifle_(rear_view).JPG) · [侧斜参考](https://commons.wikimedia.org/wiki/File:Arisaka_Type_38_rifle_action.JPG)

在烘焙图上沿旧重复间隔比较，枪托粗糙度样区的相关性从 0.42 降到 0.07，覆面底色样区从 0.30 降到 0.02。验收同时比较枪托两侧、护木全长和后部钢件的换灯效果。

## 栓柄、后钢环和尾盘的旧钢质感 · 2026-11-26

重烘了标注区域的底色、粗糙度和细部法线。栓柄采用暖灰底色、零散氧化斑和移动的磨亮高光。后钢环靠环口的反光压窄，磨损色过渡到尾盘边缘。盘面保留凸点受光，中心凹部用较暗、较粗糙的钢色。前后版本使用相同的游戏相机、灯位和曝光，并与同件实物的后视和侧斜照分别核对。 [实物后视](https://commons.wikimedia.org/wiki/File:Arisaka_Type_38_rifle_(rear_view).JPG) · [实物侧斜照](https://commons.wikimedia.org/wiki/File:Arisaka_Type_38_rifle_action.JPG)

后视配准后的盘面中间亮度从 152 调到 178，实物取样是 184。中心凹部从 148 调到 137，实物取样是 135。侧斜照下柄头中间亮度为 59，与实物样区相近。这里的读数来自 8 位显示图。此次涉及 11 张内嵌图。发布压缩版也使用这组机位复核。

## 托底板、前箍和柄根 · 2026-11-26

托底板沿原游戏模型与木托相接的外轮廓重新铺面，托底正面的反光顺着曲面过渡到一圈窄边。近景在正后和两侧掠射光下复核。实物侧照用于核对钢片与木托的交线和厚薄，托底正后方使用游戏模型的同机位前后对照。[托底侧照](https://commons.wikimedia.org/wiki/File:Arisaka_Type_38_rifle.JPG)

前段两道箍的边缘改为连续的小圆角，随光位带出窄反光。箍旁木料降低了整条漆光的亮度，保留木纹、红棕色和局部磨过的漆层。覆面上缘两侧共用一条连续的法线过渡。[前段实物特写](https://commons.wikimedia.org/wiki/File:Arisaka_Type_38_rifle_(front_stock_detail).JPG)

柄根的可见网格接到同行的外观壳面。使用现有游戏动画逐帧检查拉栓和换弹，分别覆盖 74 帧和 178 帧。Blender 回导验证了柄根、中箍挂环、托底板与木料三个接触处。 [实物后视](https://commons.wikimedia.org/wiki/File:Arisaka_Type_38_rifle_(rear_view).JPG)

## 栓柄钢面的双视角对照 · 2026-11-24

以前版上线模型为基线。后视沿用已校对的相机和闪光，另用同一件实物的侧斜照核对柄头。侧斜机位按外轮廓配准，边缘偏差中位数约 0.9 像素（640 × 480），取景只包含这件金属外观。每组对照的前后两版共用光照。后视下，实物柄颈和柄头的亮部面积分别约 31% 和 19%，前版约 26% 和 21%，新版约 30% 和 20%。侧斜照中，柄头最亮一带的长宽比约为 2∶1，前版约为 1.1∶1，新版约为 2∶1。[实物后视](https://commons.wikimedia.org/wiki/File:Arisaka_Type_38_rifle_(rear_view).JPG) · [实物侧斜视](https://commons.wikimedia.org/wiki/File:Arisaka_Type_38_rifle_action.JPG)

柄颈与柄头分别烘焙钢色、粗糙度和磨损分布。方向性反射沿柄颈、过渡处和椭圆端连续变化，旋转模型或移动照明时，高光跟随表面移动。方向与强度写入现有线性数据图集的空白区域，由 glTF 的 `KHR_materials_anisotropy` 读取。此次修改三张内嵌图和一个材质，沿用 45 个部件、116 张图，近景与普通 NPC 分别为 72,460、67,852 三角。

## 旧钢表面 · 2026-11-24

前版钢板样本带有拼板接缝，会在中箍和覆面上留下横线及成片暗斑。新版沿金属表面方向烘焙细擦纹，用独立的细点控制局部氧化。中箍的各层围绕圆周连续，柄颈呈窄亮带，椭圆柄头保留较宽的钢面反射和零星失光点。实物照片只供比对，运行时底色、粗糙度及已有法线使用 CC0 材质样本重建。此次涉及 41 个外观部件和 102 张内嵌图。两件木料的 10 张图与上一版逐字节相同。[钢面实物近照](https://commons.wikimedia.org/wiki/File:Arisaka_Type_38_rifle_action_inscriptions.JPG) · [柄头实物后视](https://commons.wikimedia.org/wiki/File:Arisaka_Type_38_rifle_(rear_view).JPG) · [Metal 009](https://ambientcg.com/view?id=Metal009) · [Metal 046 B](https://ambientcg.com/view?id=Metal046B)

固定相机和灯光，使用实物后视的相邻木料与尾盘校对光照，再检查柄头。按相同亮度门限采样，椭圆柄头的亮部面积占比从约 8% 变为约 21%，照片约 19%。柄颈约从 7% 变为 26%，照片约 31%。整枪侧照中另取三段前钢与相邻木材，中位亮度比在照片中为 0.71、0.75、0.89。近景和普通 NPC 分别为 72,460 与 67,852 三角。刻度和木料沿用已验收版本。[前段实物特写](https://commons.wikimedia.org/wiki/File:Arisaka_Type_38_rifle_(front_stock_detail).JPG) · [整枪侧照](https://commons.wikimedia.org/wiki/File:Arisaka_Type_38_rifle.JPG)

网页副本的左右覆面和上方钢面底色图使用 1024 × 1024 的 BC7。原 ETC1S 在暗灰色的拉丝带上出现了紫绿斑点。固定机位比较源模型和发布模型，上方钢面样区的色差以红减绿、蓝减绿两个通道衡量，90 分位误差从 6 降到 1（8 位显示值）。两种编码使用同一份源贴图。

## 栓尾盘与中箍挂环 · 2026-11-24

后视采用同件实物照片，在手柄、木托和前景共用的固定机位下核对盘面所占画幅。盘缘向外展开，左下凸耳有更清楚的收角。中央凹圈的边唇由网格成形，点纹用法线和粗糙度表现。按 640 × 480 后视照片人工勾出的可见盘缘计算，网页模型的投影交并比由 0.722 升至 0.921。这个数值只描述该照片中的外轮廓。[实物后视](https://commons.wikimedia.org/wiki/File:Arisaka_Type_38_rifle_(rear_view).JPG)

中箍下方沿用原挂环和贴图坐标，调整其悬垂姿态，在底弧增加 372 个三角面，并为磨亮的弧面另烘粗糙度。近景为 **72,460** 三角，普通 NPC 为 **67,852** 三角，共 45 部件、116 张图。两件木料沿用前版漆木分层，整枪仅保留刻度。[中箍与挂环近照](https://commons.wikimedia.org/wiki/File:Arisaka_Type_38_rifle_(front_stock_detail).JPG)

## 前段漆木与旧钢 · 2026-11-24

以[同件实物完整侧照](https://commons.wikimedia.org/wiki/File:Arisaka_Type_38_rifle.JPG)与[中箍闪光近照](https://commons.wikimedia.org/wiki/File:Arisaka_Type_38_rifle_(front_stock_detail).JPG)交叉核对：近照的亮斑不能作为整段钢的底色。保留中箍旁磨亮的钢面，向前过渡到暗色旧钢；调整相邻前木的棕色，让全枪侧面仍读作漆木，而不是一条银色长杆。两张照片独立取景、用相邻材质选灯，随后锁定照明比较钢面；不修改游戏灯光、曝光或形状。

- 前段由近及远分三区，侧照钢面／旁侧木面的中位亮度比分别为 **0.71 / 0.75 / 0.89**，旧版 **0.93 / 1.64 / 2.31**，实际 GPU 版 **0.70 / 0.73 / 0.79**。另取局部闪光钢面中位亮度，照片 **191.9**、旧版 **156.3**、新版 **191.0**；照片高端存在过曝，不能据此标定绝对反射率。靠近前端处比照片略暗，未将亮度比说成逐像素一致。
- 只改变源 GLB 的 3 张内嵌图（21、22、98），其余 113 张、全部节点、226 个几何访问器及原有刻度不变。68 组源模型／GPU 发布模型渲染的前景亮度 SSIM 最低 **0.98622**；另用顶视、低侧视、斜近景核对接缝和材质过渡。**72,088 / 67,480** 三角，45 部件，116 张图。已保留前段局部和整枪十组实物对照。
- 网页副本在不降分辨率的前提下，另将六张钢件底色图改为 ETC1S。两件木材的清漆与 ORM（索引 13、17、95、99）用同尺寸无损 WebP；四张图在发布副本中重新解码，与源图逐通道比较，最大误差为 **0**。相同源模型、相同发布编译器下，此步单独节省 **1.81 MiB**，其余 112 张发布图未变；整件本地发布 GLB 为 **20,610,116 字节**，源模型与该副本 68 组对照的最低前景亮度 SSIM 为 0.98628。不提高整站预算门禁，不覆盖高清 Blender 工程和源 GLB。

## 槽下亮带宽度 · 2026-11-24（前一版）

从[同件实物的完整侧照](https://commons.wikimedia.org/wiki/File:Arisaka_Type_38_rifle.JPG)原始像素裁取木托，在原图和游戏原始截图上按凹槽两端配准，分别沿 90 处横截面测量。锁定用槽内颜色及窄亮边确定的测试灯位，宽亮带不参与选灯；校对峰值的同时检查亮带占宽，不用曝光增益弥补宽度。

- 只调整既有的清漆粗糙度、底层粗糙度和介质反射强度，使磨光木面的中段反射更集中，向两端自然过渡；不改几何、法线、底色、金属或文字。三个槽内控制取样在相同灯位下没有受此改动牵连。
- 以 0–255 显示亮度 210 为亮带阈值，中段占宽为 **参考 19.3%、旧版 27.7%、发布编码版 20.0%**。90 处横截面的典型亮度为 **238.4、239.7、237.8**；阈值和相机曝光不是物理单位，普通光及反侧光仍独立验收。
- 相对前版仅 3 张内嵌图变动（95、96、99），其余 113 张、全部节点及 226 个几何访问器未变。源模型与发布副本 74 组实机画面的最低前景亮度 SSIM 为 **0.98623**。保留十组实物／压缩模型对照，以及高清 Blender 工程。近景 **72,088**、普通 NPC **67,480** 三角，继续仅保留刻度。

## 槽下木面反射 · 2026-11-24（前一版）

在[同件藏品完整侧照](https://commons.wikimedia.org/wiki/File:Arisaka_Type_38_rifle.JPG)上，将槽底木色和槽内窄反光用作测试灯位的约束，不用下方待改的宽亮带选灯；选定后旧版与新版使用同一机位、灯位和曝光。此处和上一轮选灯依据不同，各自的数据只在本轮对照内比较。

- 仅更新槽下有参考依据的一侧：局部调整底色、漆层覆盖与粗糙度，使用原介质反射强度图的 alpha 通道，将连续弧面的微法线转回原 UV 切线基。底色没有白亮条，普通光与反侧光下反射会离开这块木面。原槽底及其他木件、全部金属、刻度和既有动作均保留。
- 取 90 个横截面的亮带高分位值，再求中位数，0–255 显示亮度为 **实物 238.2 / 旧版 201.7 / 网页压缩版 238.0**。中段亮带亮像素占该取样区横向宽度的均值分别为 **19.2% / 7.9% / 27.1%**；新版亮度接近，局部宽度仍有差别。槽内暗部中位数旧版 **101.7**、新版 **101.8**，验证不是靠让整块木托变亮。
- 编码副本与源模型 74 组实机图的最低前景亮度 SSIM 为 **0.98624**（下取五位）；只变更下木托的 5 张内嵌材质图，全部节点和几何访问器不变。可编辑工程及全枪十组对照保存在 OneDrive。近景 **72,088**、普通 NPC **67,480** 三角，45 部件、116 图。普通照片没有已知灯具尺寸、完整曲面信息及绝对反射率，不能据此证明逐痕、逐像素相同。

## 木托侧面漆光 · 2026-11-24（前一版）

[同一件实物的完整侧照](https://commons.wikimedia.org/wiki/File:Arisaka_Type_38_rifle.JPG)可见木托中段的一条浅凹槽。原网格已经有圆边和内凹轮廓，上一版却没有把这一区域的染色和清漆与旁边的琥珀色木面区分开。本版仅在照片支持的那一侧，按已有曲面局部调整凹槽的红棕染色、圆边清漆、微法线和下方木面的磨光。没有复制照片的白亮带，也没有添加刻字。

验收先转正实物侧照、对齐凹槽两端，再用槽外木面的亮度分布选定测试灯位，最后在固定灯位下比较槽内（不以槽内数据选灯）。90 个截面的暗部显示亮度：参考 **95.8**、旧版 **132.9**、新版 GPU **92.5**；槽内暗部 RGB 中位数分别约为 **156/82/35、210/116/38、150/79/33**。普通光和反侧光下不应出现固定在底色里的白线。槽外磨光区的亮带宽度与峰值仍受未标定的拍摄照明影响。

只改下木托的 4 张内嵌图（底色、法线、粗糙度／金属度、清漆），其余 112 张、所有节点和 226 个几何访问器均与上一版相同。源模型与网页压缩模型另核对 **74** 组画面，最低前景亮度 SSIM **0.98626**。近景仍为 **72,088** 三角，普通 NPC **67,480**，45 部件、116 图。验收留有本处三列对照及整枪十组对照；照片不能独立证明不可见面的形态或与实物相同的绝对反射率。

## 框端露木 · 2026-11-23（前一版）

[实物顶视](https://commons.wikimedia.org/wiki/File:Arisaka_Type_38_rifle_rear_sight_(top_view).JPG)可见两块红棕表面，中间隔着暗钢；[斜侧照片](https://commons.wikimedia.org/wiki/File:Arisaka_Type_38_rifle_rear_sight_detail.JPG)也可见框内木色。旧版的灰黑衬片将已有护木遮满。现版只重做该外观网格为带倒角的两处开口，沿用原来的部件、材质、可见侧壁和 **1,000 三角面**；没有在钢面上印木纹，也没有改变刻度、挂点或动作。局部受遮挡漆木的底色、清漆和粗糙度与周围木料连续过渡。窗口形状是按可见外观重建，不是实物内部构造的测绘。

- 同一模型姿态、相机和照明下，在旧版原先被衬片遮住的区域比较第一命中表面。顶视 645 个取样点：新版 228 个落在原有上护木、417 个落在钢边；斜视 97 个取样点：19 个落在上护木、78 个落在钢边。两组均无背景漏出。资产门禁还从顶面分别检验两块木面和中央钢边。
- 两块露木区域的参考照片中位 RGB 为 **81/37/28、100/37/23**，新版实际 GPU 压缩渲染为 **88/31/22、91/34/22**；是同视图下的颜色比较，不代表不同照明也应有相同像素值。
- 仅衬片的几何访问器与 5 张内嵌图发生变化，原刻度法线、其他 44 个部件的几何和全部节点不变。源模型与发布副本对照 **16 机位、53 组**，前景亮度 SSIM 最低 **0.98624**。近景 **72,088** 三角、普通 NPC **67,480**，45 部件、116 张图，继续仅保留刻度。固定机位、整枪八组实物对照与可编辑工程留在 OneDrive。
- **网页传输（2026-11-24）**：保持每张图的原发布分辨率，只重编码十张底色图。八张金属底色使用 ETC1S，两张木料底色使用质量 96 的 WebP；法线、粗糙度、清漆、数字凹笔画等数据图沿用原编码。相同源文件和本地发布编译器下，模型从 27,104,628 降到 23,036,940 字节（节省 3.88 MiB）；其余 106 张发布成品逐字节相同。未降低全站预算门禁或覆盖高清源文件。

## 刻度框与磨亮钢边 · 2026-11-23（前一版）

以[同一实物的顶视照](https://commons.wikimedia.org/wiki/File:Arisaka_Type_38_rifle_rear_sight_(top_view).JPG)和[侧斜照](https://commons.wikimedia.org/wiki/File:Arisaka_Type_38_rifle_rear_sight_detail.JPG)对照外观。两端与刻度带共用材质，但不是同一种表面：端部保留暗氧化层和磨亮边缘，刻度带呈较浅的旧钢色；横片在直射光下有不均匀高光。分区烘焙底色和粗糙度，不把曝光亮斑画进底色。原刻度法线的像素不变，中央小圆面恢复可见斜痕。中箍窄钢条仅调局部色泽与失光，木面、轮廓、文字策略均不变。

预览中先用中央明暗区域选择近光位置，再锁定相机和照明，用独立的端部区域比较前后。两端五个区域的亮度中位数对照片的平均绝对差，从旧版 **39.9** 降至 GPU 版 **4.7**（0–255 显示亮度）；中央亮／暗区域为 **245 / 129**，照片为 **253 / 130**。窄钢条另以[中箍侧照](https://commons.wikimedia.org/wiki/File:Arisaka_Type_38_rifle_(front_stock_detail).JPG)取 120 条横断面，中位显示亮度 **97.2**，照片 **94.6**。这些是固定视图的外观比较，不是实测反射率；个别笔画的遮挡和角度也不等于扫描复刻。

源模型与实际 GPU 压缩模型核对 13 个机位、43 组画面，前景亮度 SSIM 最低 **0.98339**；该指标仅评价压缩损失。与前版相比，改变 10 张内嵌图，226 个几何访问器和所有节点逐字节／结构相同。仍为 45 部件、116 图，近景 **72,088** 三角、普通 NPC **67,480**。完整外观证据另汇集了整枪侧面、托尾、护木、中箍、栓尾、覆面、刻度框和前端八组实物对照。

## 上护木漆层与窄钢条 · 2026-11-23（前一版）

[上护木近照](https://commons.wikimedia.org/wiki/File:Arisaka_Type_38_rifle_inscriptions.JPG)、[上方斜照](https://commons.wikimedia.org/wiki/File:Arisaka_Type_38_rifle_rear_sight_detail.JPG)和[中箍特写](https://commons.wikimedia.org/wiki/File:Arisaka_Type_38_rifle_(front_stock_detail).JPG)显示两种相邻但不同的外观：中段迎光侧为橙棕色漆木，箍边仍为深红。只参考木材和漆层，不复刻照片上的汉字、编号或徽记。

- 上护木按木纹方向、部位与表面朝向分开染色。其漆层使用同一木料采样的高度与粗糙度，避免钢板样本的分块痕迹出现在木面。近轴局部光和普通检查器光分别验收，不将照片的中心亮斑写进底色。
- 窄钢条的中段转折与圆头直接沿原木面 UV 表现；各三角的切线基决定横向弧面的高光方向，磨亮区比两端更光滑。没有独立增加钢条网格、采样器或绘制批次。
- 固定相机与光照，以无字区域取显示色中位数，护木参考 RGB **210/77/13**、旧版 **102/34/23**、新版 GPU **202/74/36**。用照片标注和渲染中钢条金属度投影取 120 条横断面，显示亮度中位数分别为 **94.6 / 208.3 / 110.0**；亮带随长度变化，不再全段接近饱和白。模型仍比照片稍浅，不能把照片的曝光、白平衡视为实测固有色。
- 相对前版仅 8 张木件内嵌材质图发生变化，226 个几何访问器逐字节不变。11 机位的常规、闪光、反侧光及 4 个局部补充近光，共 **37** 对源模型／发布压缩模型渲染；前景亮度 SSIM 最低 **0.9834**。几何和玩法契约不变：近景 **72,088**、普通 NPC **67,480** 三角，45 部件、116 张图，仅保留刻度。

## 圆盘点纹与反光 · 2026-11-23（前一版）

以[实物后视照](https://commons.wikimedia.org/wiki/File:Arisaka_Type_38_rifle_(rear_view).JPG)为参照，固定上一版已经用柄头、柄颈、覆面和木料选定的相机与灯位。分别归一化实物和模型的盘面椭圆，排除凸耳、中心和轮廓像素，在同一相对半径的上下半区取样。本次没有重新选灯，也没有把照片中的亮带画进底色。

- 上版环列偏密；加大环距，分别调整点顶和点间底面的粗糙度、点纹法线与盘面整体反射，使较大的亮区跨过数排点纹。圆盘几何、凸耳轮廓、中央凹部及外圈尺寸不变。
- 归一化环带内，参考照上／下中位显示亮度 **207 / 132**，上版 **187 / 154**，新版 GPU **199 / 144**。下半区细纹局部对比度（去除低频后的亮度标准差）分别为 **12.4、10.1、12.2**。两个指标一同使用，以免只因抹平点纹而让平均亮度接近。该取样与下方前版固定矩形／椭圆区域数值略有不同。
- 与上一版比，只有圆盘自身的 3 张内嵌图变化；全部几何访问器、其余 113 张图（含十张木料图）、刻度及玩法均不变。近景 **72,088**、普通 NPC **67,480** 三角。8 机位 × 3 灯位的源模型／GPU 对照中，前景亮度 SSIM 最低 0.9878（向下取四位）。此项只核验压缩，不能证明实物逐像素一致。

## 后视反光 · 2026-11-23（前一版）

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

**当前重建入口**（Python 使用 NumPy、Pillow、SciPy、OpenCV。第一次下载带哈希校验的材质样本，之后复用缓存。）

```powershell
python Taierzhuang1938/_blender/Script_Type38Surface.py
python Taierzhuang1938/_blender/Script_Type38Surface.py --author --output tmp/Type38Author
node Taierzhuang1938/Script_Type38_511AssetTest.mjs
node Taierzhuang1938/Script_Type38_511BrowserTest.mjs
```

默认入口生成游戏 GLB 并同步该资产的发布贴图规则。带 `--author` 的入口生成可在 Blender 逐件编辑的版本，源工程存于 OneDrive 的 `Blender/Taierzhuang1938/Type38_Exterior_20261122/`。

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
