# 八九式重掷弹筒外观复原

`Type89Launcher` 是滕县日军掷弹筒手和白盒预演共用的游戏道具。模型按同型实物和同期照片重建。原版 318 三角，全钢复原版 9,924 三角、一个网格块和一套 PBR 材质。模型保留 0.413 m 的项目道具基准和五个既有挂点。白盒预演继续按原轨道放大 1.4699 倍。

## 公开参考图

| 资料 | 本次核对的可见细节 |
| --- | --- |
| 美国水手博物馆 1946.0037.000001，8 张真品照片 | 第 1 张和馆藏旧照 `af178` 用于校准长短比例、第 2 和 5 张核对后段拨片与小环、第 3 和 4 张核对筒尾箍、侧面旋钮与窄槽、第 6 和 7 张核对钢表面。以同件展品的多角度照片为主要依据。 [馆藏照片](https://catalogs.marinersmuseum.org/object/CL2830) |
| 澳大利亚战争纪念馆 026541、026542，Thomas Fisher 摄，1942-09-07 | 两张战时黑白原照用于复核筒身、支柱和驻钣的轮廓与当时的深色表面。 [026541](https://www.awm.gov.au/collection/C10175) [026542](https://www.awm.gov.au/collection/C10176) |
| 澳大利亚战争纪念馆 082306，1944-10-31 | 战时黑白照片，作为筒身深色轮廓的补充参照。原图归档为 `ReferencePhotos/AWM082306.jpg`。 [082306](https://www.awm.gov.au/collection/C81503) |
| 澳大利亚战争纪念馆 RELAWM35524、RELAWM28924、RELAWM24923 | 馆藏登记核对同型实物、总长口径、全钢外观及个体标记差异。 [C151935](https://collection.awm.gov.au/C151935) [C145319](https://collection.awm.gov.au/C145319) [C141658](https://www.awm.gov.au/collection/C141658) |
| 小郡驻屯地、函馆驻屯地与哈巴罗夫斯克展品照片 | 补看日方和俄方展示的同型物件，核对收窄支柱、筒尾外轮廓和弧形驻钣。 [小郡](https://ki43.on.coocan.jp/injapan/heiki9/ogori/ogori.html) [函馆](https://ki43.on.coocan.jp/injapan/heiki/hakodate/hakodate.html) [哈巴罗夫斯克](https://ki43.on.coocan.jp/oversea/khaba/khaba.html) |
| 维基共享资源的两张公开影印照 | 核对驻钣在更接近正面的投影以及筒身可见的细线。 [静物影印](https://commons.wikimedia.org/wiki/File:Japanese_Type_89_grenade_discharger.gif) [人物影印](https://commons.wikimedia.org/wiki/File:Japanese50mmGrenadeMortar.jpg) |

筒身至尾箍约占整体长度的 42%，模型采用同一比例关系。筒口浅凹、支柱槽纹、侧面滚花、尾段环纹和鞍形驻钣均为静态外观。公开图证覆盖的是同型实物，滕县现场的具体批次和表面状态仍待考。

## 金属表面修订

- 美国水手博物馆馆藏的第 3、4、6、7 张近照提供滚花、支柱擦痕和筒身点蚀依据。第 1 张整体照用于驻钣凸面铸造纹，以及筒身的相对亮度和冷暖分布。滤去圆柱反光的宽亮带后保留局部氧化位置。冲压号 `44023` 参考第 6、7 张照片。 [馆藏](https://catalogs.marinersmuseum.org/object/CL2830) [筒身采样](../_import/Reference/Type89Launcher/Data_Type89LauncherSteelReference.json)
- BlenderMCP 重排 19 个 UV 区域。筒身、箍圈、旋钮、窄槽、尾套和驻钣分别控制露钢、残留发蓝层、腐蚀与抛光。驻钣边缘有独立区域，保留暗色铸造面和局部露钢。以粗糙度和金属度区分镜面反射和哑光氧化，浅点蚀和字戳使用切线法线，沿用一套材质。
- 第 7 张筒身近照、第 4 张支柱近照和整体照的驻钣正面用于校准局部擦亮、氧化和冷暖分布。第 3 张近照的频谱给出旋钮双向菱纹密度。筒身在磨亮钢与深锈之间增加受擦发蓝层，恢复中间调和细小周向擦痕。 [采样数据](../_import/Reference/Type89Launcher/Data_Type89LauncherSteelReference.json) [采样脚本](../_import/Script_MeasureType89LauncherSteel.py)
- 支柱擦亮区和驻钣正面通过检查台的表面交点校准 UV 方向，再按近照转移亮度关系和氧化色分布。第 6 张接头近照补充氧化层的暖色、光泽和冲压号位置。检查覆盖两套照明下同部位的新旧对照。
- 接头在共用 2K 图集中分到 512×384。按第 6 张近照逐字描摹冲压号，沿弧面配准并按检查台的实际投影校正字形比例。凹印用切线法线表现，凹处保留轻微积色，接头两侧按近照收敛亮边。 [号印描摹与采样](../_import/Reference/Type89Launcher/Data_Type89LauncherSteelReference.json)
- 后段拨片两侧分别按第 5、2 张近照取样。沿弧形表面配准擦亮的边缘及暖色氧化，环扣以单独的 UV 区域表现一侧的露钢和另一侧的哑光。近似馆藏布光和检查台默认照明均用于复核两侧的反光关系。
- 挂环按第 5 张近照的侧投影和第 2 张近照的反面弧线取样。第 5 张用于定位露钢距尖端的位置，第 2 张区分两段弧线的磨损。环扣 UV 扩大至 128×256 并在两个方向平滑接缝，饰面加入局部点蚀。挂环截面加密以减轻近景反光折线。侧面滚轮另设 UV 区域，按第 3 张近照分出擦亮窄边和齿间暖褐氧化。 [采样数据](../_import/Reference/Type89Launcher/Data_Type89LauncherSteelReference.json)
- 侧投影的表面交点表明，第 5 张近照的亮区绕过外缘。按横截面的照片色差将露钢延伸至对应 UV，再将滤去宽光带的细小亮暗变化用在底色、粗糙度与浅凹法线。挂环 UV 扩大至 256×256，共用图集维持 2K。 [外缘采样](../_import/Reference/Type89Launcher/Data_Type89LauncherSteelReference.json)
- 侧轮按第 3 张近照的四个完整齿面分别采样。以相位配准后的色差区分齿顶露钢、齿侧氧化和暗槽，再将去掉宽反光的细坑变化用于底色和粗糙度。256×128 的轮缘区域按四种齿面磨损展开，每齿环向有效像素由约 9 增至 58。轮缘两端面使用共用钢材，图集同时缩小驻钣的窄边区域。侧轮在四个机位及两套布光复核，照片另留一齿用于对照。 [轮缘采样](../_import/Reference/Type89Launcher/Data_Type89LauncherSteelReference.json)
- 对照在枪械检查台固定机位和照明拍摄，新旧材质另在近似馆藏的双条灯下同场比较。照片曝光、灯位和未拍到的表面仍有推定空间。检查范围包括筒口、筒身、筒尾箍、旋钮、驻钣和背面。
- 筒身按第 7 张近照配准细点蚀和氧化色差。采样图编码滤去宽反光后的局部亮度与色差，避开冲压痕并沿边缘衰减。可配准区域叠加照片采样，其余筒身用 OpenAI API 钢材源图生成相近尺度的点蚀。冲压轮廓单独描摹并烘入浅凹法线，磨花发蓝层的粗糙度与反射按正视、斜视和近似馆藏布光复核。 [采样数据](../_import/Reference/Type89Launcher/Data_Type89LauncherSteelReference.json)
- 筒身以第 1 张整体照和第 7 张近照的亮钢色为各自色差基准，配准露钢、发蓝和氧化区域。露钢、发蓝残留与褐色氧化按各自粗糙度和金属度混合，冲压号附近的磨损区域采用较柔的反射。原窄条 UV 从邻接筒身采样颜色、法线和 ORM，消除检查台默认灯光下过亮的白线。两组布光下分别复核正面整体与近景，并检查背面材质过渡。 [反光与色差采样](../_import/Reference/Type89Launcher/Data_Type89LauncherSteelReference.json)
- 菱纹握部保留第 3 张近照量出的菱纹密度，按暗槽积色、棱部露钢和局部崩点分配底色、粗糙度与浅凹法线。以同一裁剪尺寸和机位核对两组布光的细节对比度。2K 底色与 1K ORM 编码沿用原设置，调整 2K 法线编码后整套低于 1 MiB。 [烘焙记录](../_import/TextureBakes/Texture_Type89LauncherSteel.json)
- 筒身箍圈的外环单独展开，轴向有效采样由约 27 增至 136 像素。第 7 张近照以箍圈暗缝定位采样，滤去宽反光后保留左侧露钢的点蚀和右侧褐色氧化斑。按正视、斜视和两套照明检查光泽过渡。周围小件沿用共用钢材配方。 [箍圈采样](../_import/Reference/Type89Launcher/Data_Type89LauncherSteelReference.json)
- 菱纹握部从第 3 张近照滤去宽反光及主要重复频率，再把不规则崩点和积色配准到可见 UV 窗口。每格菱纹的磨平程度还从 OpenAI 钢材底图取样。以正视的两套照明和斜视复核点蚀与棱边高光，同时复测箍圈。 [磨损采样](../_import/Reference/Type89Launcher/Data_Type89LauncherSteelReference.json)
- 用同一张照片中的支柱和握部轮廓校正亮斑、崩点和氧化残留的配准方向。菱面按较哑的钢表面处理，擦亮区用近照的局部色差与 OpenAI 钢材细纹共同决定。滚花独占原图集区域后，近照对应部位的纵向有效采样从约 104 增至 200 像素。检查台默认灯下，滚花正视截面的宽幅明暗差从 93 降至 66 个灰阶，细节对比度为 0.271，馆藏近照为 0.278。
- 滚花图集重采样沿环向匹配两侧端点，压缩后接缝底色的平均通道差由 7.8 降至 2.2 个灰阶。两套布光复核了正视、斜视和接缝过渡。
- 第 4 张照片露出支柱遮挡侧的滚花。用直段两端和遮挡边缘配准单独的磨损采样，将照片展平到 UV 后滤去反复出现的菱纹反光。在同一窄带对照暗槽与露钢，分配槽内褐色氧化、粗糙度和棱面反光。固定侧光下，暗槽归一化红蓝差由 0.143 调到 0.274，近照为 0.281。另用检查台默认灯、双条灯和邻近机位复核。 [侧面采样](../_import/Reference/Type89Launcher/Data_Type89LauncherSteelReference.json)
- 第 4 张近照的一组斜向沟槽有更明显的褐色积层，按该方向分别烘焙槽底和磨亮窄边。相机和固定侧光一致时，这组斜纹占两组对比能量的比例由 43.5% 提至 65.3%，近照为 64.8%。同步复核了柔和补光、两个邻近机位和正面控制视图。
- 筒尾肩部在原共用区域内划出 544×112 的独立 UV 区。参照第 3、4 张照片的肩部边缘配准两段可见弧面，分别烘焙正面的暗灰积层、侧面的褐色氧化和露钢擦痕。侧面细节仅采自避开邻接件遮挡的钢面。固定对照灯光下，正面中值由 102.5 调到 69.9 个灰阶，近照为 69.5。侧面细节对比度由 0.029 提至 0.063，近照为 0.086。 [肩部采样](../_import/Reference/Type89Launcher/Data_Type89LauncherSteelReference.json)
- 用第 7 张近照的露钢和氧化区分别调节号印附近的反光。中性灯下近景的第 90 百分位亮度由 198.9 调到 170.2 个灰阶，近照为 164.3，亮度中值为 100.5，近照为 100.9。复核了柔和补光、斜视和第 1 张对应的整段筒身。 [筒身采样](../_import/Reference/Type89Launcher/Data_Type89LauncherSteelReference.json)
- 驻钣凸面沿第 1 张照片已配准的钢面取出 336×152 的细节采样。排除边缘背景与宽反光后，把局部点蚀、擦痕和偏暖的氧化细纹烘入基色、法线和粗糙度。固定补光下，配准区细纹相关系数由约 0.07 提至 0.77，细纹对比度由 0.061 调到 0.052，近照为 0.045。另复核了默认灯光和斜视。 [驻钣采样](../_import/Reference/Type89Launcher/Data_Type89LauncherSteelReference.json)
- 支柱沿第 4 张近照的配准范围提取 80×1152 的细节采样。过滤宽反光、邻面和结构交界后，把局部擦痕、点蚀和氧化细纹烘入基色、法线与粗糙度。默认灯光下，配准区细纹相关系数由 0.23 提至 0.75，细纹对比度由 0.057 调到 0.081，近照为 0.081。固定补光、斜视和驻钣对照也纳入复测。 [支柱采样](../_import/Reference/Type89Launcher/Data_Type89LauncherSteelReference.json)
- 拨片正反两面分别从第 5、2 张近照取 480×144 的细节采样。在钢面轮廓内滤去边缘与宽反光，把擦痕、点蚀和氧化烘入基色、法线和粗糙度。固定补光下，正面细纹相关系数由 0.13 提至 0.66，背面由 0.43 提至 0.83。正面亮度中值由 103.1 降至 83.3 个灰阶，近照为 78.5。默认灯和斜视复核均保留可辨的磨痕。 [拨片采样](../_import/Reference/Type89Launcher/Data_Type89LauncherSteelReference.json)
- 驻钣接头沿第 6 张照片的号印配准提取 256×152 的周围钢面细纹，遮掉字口后烘焙点蚀、擦痕和氧化。将氧化区调为较哑的粗糙表面，收敛强补光下偏白的反射。近似馆藏布光下，正视配准区细纹相关系数由 0.04 提至 0.64，亮度中值由 81.4 降至 75.2 个灰阶，近照为 72.9。另用默认灯、强补光和斜视复测。 [接头采样](../_import/Reference/Type89Launcher/Data_Type89LauncherSteelReference.json)
- 外套筒按第 1 张照片可见的钢面配准 88×352 的细节采样，压低共同反光条纹，将冷灰钢、细纹与端部褐锈分别烘入基色、法线和粗糙度。近似馆藏布光下，中段亮度中值由 56.9 降至 33.4 个灰阶，照片为 35.7。中段归一化红蓝差由 0.247 降至 0.040，照片为 0.051。另用中性灯、默认灯和斜视复测。 [外套筒采样](../_import/Reference/Type89Launcher/Data_Type89LauncherSteelReference.json)
- 外套筒提高了冷灰钢面的粗糙度，并分别校准暗部、中间调和已配准的细纹。近似馆藏布光下，正视亮度第 90 百分位从 54.6 降至 50.3，近照为 49.7。斜视同一指标从 61.5 降至 53.4，近照为 50.0，斜视中间调为 35.4，近照为 35.5。用中性灯、默认灯和驻钣接头对照复测。 [外套筒采样](../_import/Reference/Type89Launcher/Data_Type89LauncherSteelReference.json)
- 外套筒端部按第 1 张馆藏照加密取样，分别记录暗锈、较暖的氧化斑和裸露钢面。近似馆藏布光下，接触斑亮度中值从 51.6 降至 37.0，照片为 32.6。端部可见暖色像素占比从 68.4% 降至 56.3%，照片为 53.9%。斜视、中性灯、默认灯与中段对照均已复测。 [端部采样](../_import/Reference/Type89Launcher/Data_Type89LauncherSteelReference.json)
- 筒身按第 1 张馆藏照校正磨损发蓝层的中间调和深氧化的暗部，收敛非露钢区域的反光。沿钢面柔化暗斑边缘，并同步重采样相邻窄条。固定中性灯下，整段中间调从 101.8 升至 110.1 个灰阶，照片为 109.7。正视和斜视的亮度分布均更接近整段照片，并复核第 7 张对应的冲压区近景、默认灯和相邻外套筒。 [筒身采样](../_import/Reference/Type89Launcher/Data_Type89LauncherSteelReference.json)
- 支柱按第 4 张近照的磨亮区域校准露钢的亮度、粗糙度和金属度，再按已配准的照片区域修正暖色。把中间调对齐到近照后，固定补光下正视亮度第 90 百分位从 144.7 升到 166.1，近照为 167.0。斜视从 144.7 升到 165.8，近照为 165.4。另核对细纹对比度、较弱补光、默认灯光和相邻筒身。 [支柱采样](../_import/Reference/Type89Launcher/Data_Type89LauncherSteelReference.json)
- 筒尾肩部在原 2K 图集块内使用两片 UV，按现有网格环提高侧面轴向采样，从 8.0 行纹素增至 19.4 行。端盖采用共用箍圈钢面。侧面在新坐标重新采样第 4 张近照的细纹与氧化，固定布光下的细纹对比度从 0.0633 升至 0.0861，近照为 0.0861。侧面亮度中值为 115.3，近照为 116.1，正面中值为 69.9，近照为 69.5。检查两片 UV 的接缝与游戏网格实际三角面数。 [肩部采样](../_import/Reference/Type89Launcher/Data_Type89LauncherSteelReference.json)
- 按筒尾肩部侧面在固定机位中的表面坐标校准第 4 张近照的细纹落点。校正用于侧面高密度底色采样，原始照片采样与查找偏移可由生成脚本重建。细纹位置相关系数在固定补光下由 0.247 升至 0.524，在掠射光与默认灯光下分别升至 0.528 和 0.515，四个局部区域均有改善。固定补光下侧面细纹对比度为 0.0867，近照为 0.0861。 [肩部采样](../_import/Reference/Type89Launcher/Data_Type89LauncherSteelReference.json)
- 筒身冲压区按第 7 张近照校准深氧化的漫反射、露钢亮部和细点蚀的对比度。固定中性灯下，暗部亮度第 10 百分位从 56.5 提至 64.6，近照为 68.7。中间调从 96.6 提至 102.3，近照为 102.5。细纹对比度由 0.124 降至 0.102，近照为 0.098。另以斜视、柔光及第 1 张整段照复核。 [筒身采样](../_import/Reference/Type89Launcher/Data_Type89LauncherSteelReference.json)
- 拨片正反面分别按第 5 和第 2 张近照校准局部磨亮钢面、氧化暗部和暖色。中间调对齐的补光下，背面暗部从 79.6 降至 73.1，亮部从 155.5 升至 166.6，近照分别为 73.4 和 168.1。正面归一化红蓝差从 0.356 降至 0.290，近照为 0.290。斜视和默认灯光已复测，正面斜视亮度仍有偏差。 [拨片采样](../_import/Reference/Type89Launcher/Data_Type89LauncherSteelReference.json)
- 拨片正反面按实际纹素中心重采样点蚀与擦痕，并按磨亮钢面和氧化层分别校准光泽。固定补光下正视细纹相关系数由 0.65 提至 0.80，背面由 0.80 提至 0.87。固定灯光的斜视正面亮度中值由 85.6 降至 82.4 个灰阶，近照配准区为 80.2。游戏仍使用同一套 2K 底色、2K 法线和 1K ORM。 [拨片采样](../_import/Reference/Type89Launcher/Data_Type89LauncherSteelReference.json)
- 在原 2K 图集中重排拨片两面与驻钣背面的 UV。拨片被照片覆盖的窄边由约 30 行纹素增至正面 48 行、背面 40 行。第 4、5 张照片以 94 对可见细节配准，共同可见的磨痕用于校准正面的中尺度纹理。按第 4 张照片的原图像素对比，相关系数由 0.653 提至 0.747。驻钣背面重采样原钢材，两套灯光下亮度中值变化均小于 0.2 个灰阶。 [拨片采样](../_import/Reference/Type89Launcher/Data_Type89LauncherSteelReference.json)
- 第 7 张近照的筒身采样由 292×160 增至 584×320。沿冲压字线留出遮罩，保留相邻的真实点蚀，并校正细纹落点、冲压浅凹和侧边褐锈的漫反射。局部对照中，正视字旁点蚀相关系数由 0.25 提至 0.58。斜视褐锈区亮度中值由 99.4 调至 88.9，照片为 89.3。另参照第 1 张照片复测整段筒身。 [筒身采样](../_import/Reference/Type89Launcher/Data_Type89LauncherSteelReference.json)
- 在原 2K 图集内重新分配筒身 UV，近照覆盖区域的有效采样由约 288×160 增至 493×197 纹素，沿原外观网格环分配角向密度。从第 7 张照片提取露钢斑，单独校准露钢和褐锈的反光。检查台中性灯下正视同一区域的亮度中值由 97.4 降至 93.3，近照为 89.0。另在同一盏灯下斜视复测，并核对整段筒身、背面和窄条接缝。 [筒身采样](../_import/Reference/Type89Launcher/Data_Type89LauncherSteelReference.json)
- 对第 7 张近照的筒身褐锈区域，按固定中性灯正视、斜视共同出现的亮度余差校准局部对比和露钢高光，由默认灯光约束修正量。近照配准区域的本地平均亮度误差在正视下从 25.3 降至 21.1，柔光下从 23.8 降至 19.5，默认灯光下从 16.52 降至 16.23。另复测整段筒身、背面和箍圈。 [筒身采样](../_import/Reference/Type89Launcher/Data_Type89LauncherSteelReference.json)
- 按第 1 张馆藏照的实际像素密度校准外套筒底色。以近似馆藏布光和默认灯下都能测到的局部对比补足点蚀和擦痕。用独立的中性灯正视和斜视复测，按原图尺度衡量的细纹相关系数分别由 0.531 升到 0.909、由 0.539 升到 0.909。中性正视的亮度中值为 35.51，原照为 35.71。默认灯下的中值为 52.07，仍亮于原照。 [套筒采样](../_import/Reference/Type89Launcher/Data_Type89LauncherSteelReference.json)
- 对第 7 张近照覆盖的筒身钢面，在固定中性灯和默认灯下分别测底色、粗糙度和金属度对亮度的影响，按配准落点校准暗锈和露钢。整张近照覆盖面的本地平均亮度误差在正视下从 18.47 降到 15.70，默认灯下从 35.64 降到 23.01。独立斜视和柔光均复测，并用第 1 张整体照核对整段筒身。默认灯下右下部褐锈区的局部平均误差增加约 1.16 个灰阶，该区最亮一成的亮度偏差缩小约 4.80 个灰阶。 [筒身采样](../_import/Reference/Type89Launcher/Data_Type89LauncherSteelReference.json)
- 按馆藏第 7 张近照校准筒身钢面亮斑的冷暖和细小反光。把两套灯下共同的亮度偏差投回细纹采样位置，再用默认灯的材质响应限制露钢亮斑的亮度。中性正视下，褐锈区最亮一成由偏暗 24.28 个灰阶改善到偏暗 15.33 个灰阶。默认灯下由偏暗 6.32 个灰阶变为偏亮 3.93 个灰阶。独立斜视和柔光的细纹相关系数分别从 0.629、0.633 提至 0.715、0.718。四种布光下按亮度归一化的平均色差下降约三成。近照全覆盖面在中性正视和斜视下的平均亮度误差分别增加 0.24 和 0.53 个灰阶。 [筒身采样](../_import/Reference/Type89Launcher/Data_Type89LauncherSteelReference.json)
- 外套筒按第 1 张馆藏照分区校准粗糙度、金属度和底色，再按原照恢复反光中被盖住的细纹和偏蓝钢面的颜色。默认灯下中段亮度中值由 52.00 降到 45.57 个灰阶，仍亮于原照的 35.71。中性正视中值为 35.78，原图尺度的细纹相关系数由 0.908 提至 0.976，按亮度归一化的平均色差由 0.0453 降到 0.0220。另用未参与校准的近似馆藏布光和另一侧斜视复核。 [外套筒采样](../_import/Reference/Type89Launcher/Data_Type89LauncherSteelReference.json)
- BlenderMCP 按现有外套筒表面采样纹沟两侧的遮挡，取两侧都遮蔽的角度写入游戏材质。按每盏灯的方向计算直射可见性，再用原照校准细纹和颜色。默认灯下中段亮度中值从 45.57 降到 44.21 个灰阶，原照为 35.71。中性正视中值为 35.71，细纹相关系数从 0.846 提至 0.887。默认灯下原图尺度的细纹相关系数从 0.902 提至 0.909，屏幕细纹的相关系数从 0.856 降至 0.842。 [外套筒采样](../_import/Reference/Type89Launcher/Data_Type89LauncherSteelReference.json)
- 筒身按第 7 张近照的配准落点重测粗糙度、金属度和底色，分区修正钢面，再用实际回烘贴图复测露钢亮斑。中性正视下褐锈区的亮斑偏暗从 15.33 降到 11.35 个灰阶，独立柔光下从 21.10 降到 16.72。默认灯下近照覆盖面的平均亮度误差从 22.39 降到 21.11，局部最亮一成仍比原照亮 4.18 个灰阶。四组光照下细纹相关系数均提高，整段筒身另按第 1 张馆藏照复核。 [筒身采样](../_import/Reference/Type89Launcher/Data_Type89LauncherSteelReference.json)
- 筒身刻印按第 7 张近照分别校准磨亮的字口和暗凹。以字旁钢面为亮度基准，在中性灯与默认灯下测量底色响应，回烘后再校正一次。刻印亮暗与原照的相关系数在中性正视下由 0.58 提到 0.84，默认灯下由 0.48 提到 0.82。两种灯光下的刻印平均对比误差分别降低约 35% 和 37%。独立斜视和柔光均有改善，默认灯下的刻印对比仍弱于原照。 [筒身采样](../_import/Reference/Type89Launcher/Data_Type89LauncherSteelReference.json)
- 第 7 张近照下方的两处小印单独配准。根据各印痕的实际明暗校准边缘和暗部，避开相邻氧化斑。中性正视下，左右两处小印的平均对比误差分别从 0.148 降到 0.082、从 0.206 降到 0.128。默认灯、独立斜视和柔光均复测。 [筒身采样](../_import/Reference/Type89Launcher/Data_Type89LauncherSteelReference.json)
- 在原 2K 图集中按纹素中心重采样主刻印和两处小印，校正印边的亚像素落点。默认灯下主刻印与原照的亮暗相关系数由 0.82 提高到 0.86，左小印由 0.82 提高到 0.91，右小印由 0.79 提高到 0.87。中性正视、独立斜视和柔光下三处刻印的对比误差均降低。 [烘焙脚本](../_import/Script_BakeType89LauncherSteel.py)
- 筒身褐锈区按第 7 张近照校准露钢反光。在同机位实测横向切线法线和线性底色对中性灯、默认灯的响应，回烘后在亮斑上再校正一次。本地默认灯下，原照最亮一成的中位亮度偏差从偏亮约 8.3 降至约 0.1 个灰阶，该组像素的平均绝对误差从 15.5 降至 14.0。中性正视、独立斜视和柔光下这组亮斑也更接近原照。 [采样数据](../_import/Reference/Type89Launcher/Data_Type89LauncherSteelReference.json)
- 筒身中段用中性灯、默认灯与柔光共同测量横向切线法线、粗糙度和线性底色的正负响应。沿近照的氧化钢面重烘，并在刻印和外围逐渐衰减。默认灯下，本地中段亮度平均绝对误差由约 24.3 降至 20.5 个灰阶。中性灯、柔光和独立斜视、暖光复测的中段误差也降低。 [采样数据](../_import/Reference/Type89Launcher/Data_Type89LauncherSteelReference.json)
- 筒身细纹以第 7 张近照为准。用近似馆藏布光和默认灯共同测量点蚀及磨痕周围的对比度，将两套灯光均支持的修正烘入 2K 底色，在刻印周围衰减，并保留早先校准的露钢亮斑。本地近似馆藏布光正视的细纹相关系数由 0.918 提高到 0.951，独立斜视由 0.915 提高到 0.942。另用默认灯和柔光复测。 [采样数据](../_import/Reference/Type89Launcher/Data_Type89LauncherSteelReference.json)
- 驻钣凸面按第 1 张馆藏照的铸造纹和露钢亮面配准。在默认灯、近似馆藏补光及一侧斜视下实测切线法线、粗糙度和底色，再以回烘结果校正第二轮响应。默认灯下，配准区亮度平均绝对误差由约 43.5 降至 23.4 个灰阶。近似馆藏补光下由 12.1 降至 6.7，暗部由 10.8 降至 5.5。另用另一侧斜视、柔光和暖光复测。 [采样数据](../_import/Reference/Type89Launcher/Data_Type89LauncherSteelReference.json)
- 驻钣接头按第 6 张馆藏近照校准刻印周围的氧化色。用默认灯和近似馆藏布光实测线性底色的通道响应，按亮度归一化颜色，并在刻印附近衰减修正。本地默认灯下的归一化 RGB 平均误差由 0.076 降至 0.043，近似馆藏布光下由 0.036 降至 0.027。独立斜视和中性灯下也更接近原照。 [采样数据](../_import/Reference/Type89Launcher/Data_Type89LauncherSteelReference.json)
- 驻钣接头的刻印以第 6 张馆藏近照中的周围钢面为局部灰度基准。实测默认灯和近似馆藏布光下的底色响应，回烘字口亮边和凹处阴影，并对应用后的效果再校正一次。本地默认灯下的刻印亮暗相关性由约 0.13 提高至 0.77，近似馆藏布光、中性灯和独立斜视下的刻印平均对比误差也降低。 [采样数据](../_import/Reference/Type89Launcher/Data_Type89LauncherSteelReference.json)
- 支柱擦亮的钢面按第 4 张馆藏照配准。用默认灯、近似馆藏补光和柔光测量底色、粗糙度及两个切线方向的法线响应，在首轮回烘后再校正。本地默认灯下平均亮度误差由约 24.5 降至 9.2 个灰阶，亮斑区域由 28.2 降至 13.4。近似馆藏补光下由 13.9 降至 10.0，两侧独立斜视的误差也降低。补光下仍有局部中间调偏亮。 [采样数据](../_import/Reference/Type89Launcher/Data_Type89LauncherSteelReference.json)
- 拨片正面沿第 4、5 张馆藏照的共同磨痕校准细纹，再按默认灯、两张照片的对照布光及低亮暖光测量宽反光并回烘。默认灯下本地亮度平均误差从 32.2 降至 15.3 个灰阶，拟合第 4 张照片的机位和近似亮度后从 19.6 降至 10.3。两张照片的细纹对比误差均下降。低亮暖光下，拨片的整体亮度误差仍较大。 [采样数据](../_import/Reference/Type89Launcher/Data_Type89LauncherSteelReference.json)
- 滚花握部按第 3 张馆藏照收窄菱面的高光，调整磨亮棱边、粗糙度和暗槽底色。沿环向续接斜纹，用默认灯和两组侧灯测量反光后回烘。默认灯下，配准区的平均亮度误差由约 38.7 降至 27.5 个灰阶，宽反光误差由 28.1 降至 13.0。按第 7 张馆藏照校准的箍圈由约 38.1 降至 24.2 个灰阶。另用不同机位和侧灯复核。 [采样数据](../_import/Reference/Type89Launcher/Data_Type89LauncherSteelReference.json)
- 在现有滚花和点蚀遮蔽上叠加整件模型的几何接触遮蔽。接缝包括肩部与箍圈、旋钮根部、支柱窄槽、拨片支架和环扣、尾套环槽以及驻钣接头。检查台以默认灯和柔光对比接缝与开阔钢面。接触遮蔽在编码前乘入 1K ORM 的红通道。底色和法线文件沿用原件，粗糙度与金属度在重新压缩后核对偏差。 [接触遮蔽记录](../_import/Source/Type89Launcher/Data_Type89LauncherContactAo.json)
- 用第 4 张馆藏照的支柱和肩部拟合两组光源，滚花侧面留作独立对照。按各灯光下的材质响应校准滚花侧面的中间调和棱面反射。拨片按第 4、5 张近照，在默认灯、中性补光和低亮暖光下校准氧化面与露钢的光泽。两处修正均沿真实接触遮蔽衰减。 [采样记录](../_import/Reference/Type89Launcher/Data_Type89LauncherSteelReference.json)
- 在已配准的滚花侧面分别测两条斜纹的重复间距和位置。以第 4 张馆藏照为基准，对侧面格纹做局部校正，并在可见带边缘平滑回到原格纹。另用检查台默认灯和两组未参与格纹拟合的布光复测。 [配准数据](../_import/Reference/Type89Launcher/Data_Type89LauncherSteelReference.json)
- 按第 4 张近照的两道斜纹对比度，分开校准槽纹深浅、槽底氧化色和棱面反光。以相同亮度核对暗槽、磨面和亮棱的色差。纹理自身的细槽遮蔽随槽纹修正，装配网格烘焙出的几何接触遮蔽继续参与 ORM 合成。 [材质采样数据](../_import/Reference/Type89Launcher/Data_Type89LauncherSteelReference.json)
- 第 5 张照片的金属环用于校准同框布光，再测拨片的遮暗面与亮棱。用第 4 张近照的机位及检查台中性补光一起约束反光，平衡两张近照在强弱光下的亮度。滚花侧面以第 4 张近照重新测量侧光下的棱面反射和中间调。两处修正沿接触遮蔽衰减，并用未参与拟合的布光复测。 [多灯光采样数据](../_import/Reference/Type89Launcher/Data_Type89LauncherSteelReference.json)
- 加深肩部箍圈、旋钮根部、拨片底座和环扣、支柱槽、尾套沟槽及驻钣接头的接触遮蔽。用装配网格增加半球采样，并减缓近处遮挡的距离衰减。检查台以默认灯和柔光复核接缝。按七个机位计算，开阔钢面的亮度变化平均约半个灰阶。 [接缝遮蔽记录](../_import/Source/Type89Launcher/Data_Type89LauncherSeamAo.json)
- 按第 4、5 张馆藏近照测量拨片在不同灯向下的露钢反光与氧化色。粗糙度、金属度和切线法线经过不同布光复测，底色的色彩修正按线性亮度归一，并在深接缝处逐渐衰减。 [采样记录](../_import/Reference/Type89Launcher/Data_Type89LauncherSteelReference.json)
- 握部侧面按第 4 张近照校准近景与远景的钢色。用近远机位共同取到的 UV 区域测量亮度，重新分配底色细纹的对比度并校准中间调。修正在接缝及配准区域边缘衰减。 [采样记录](../_import/Reference/Type89Launcher/Data_Type89LauncherSteelReference.json)
- 肩部侧面的氧化钢与高光按第 4 张近照校准。在同一布光下从两个机位实测材质响应，联合拟合底色与切线法线。第三机位、独立灯向和接缝 AO 分别复核。 [采样记录](../_import/Reference/Type89Launcher/Data_Type89LauncherSteelReference.json)
- 筒身钢面与驻钣凸面分别按第 7 张近照和第 1 张馆藏照片校准底色与切线法线。拟合使用校准灯、斜视、默认灯和柔光的响应，并约束亮斑的亮度。刻印及深接缝有独立的衰减，另从反向斜视复测。 [采样记录](../_import/Reference/Type89Launcher/Data_Type89LauncherSteelReference.json)
- 以第 1 张馆藏照测量整段筒身亮带的横向轮廓，从三个光照及机位响应联合校准底色和切线法线。拟合约束默认灯的中间调，用柔光和第 7 张刻印近照独立复测。 [采样记录](../_import/Reference/Type89Launcher/Data_Type89LauncherSteelReference.json)
- 单独展开第二套接缝 UV，在轮齿、旋钮底座、两侧拨片支架、尾套沟槽和驻钣接头上各自烘焙遮蔽。独立 UV 消除钢材重叠处的暗缝丢失。原钢面底色和法线逐文件一致。游戏和检查台以 ORM 红通道读取这份遮蔽，三张贴图合计 1,046,648 字节。 [接缝烘焙记录](../_import/Source/Type89Launcher/Data_Type89LauncherJointAo.json)
- 第 8 张馆藏照用于校准背面筒身的两条宽亮带和磨蚀细纹。用箍圈、支柱、旋钮及驻钣等筒身外的钢件估计布光，分别调节底色与两个切线方向的法线，再从原图提取滤去宽反光的局部纹理。背面法线沿轴向减弱重复横纹。另两组布光和留出的轴向区段用于复测。 [背面采样记录](../_import/Reference/Type89Launcher/Data_Type89LauncherSteelReference.json)
- 外套筒背面以第 8 张馆藏照校准钢色、亮度和反光。第 1 张正面照及默认游戏灯光共同约束两张照片共见的钢面。从背面照片提取磨蚀细纹前，先去掉沟槽的周期性明暗。用另行留出的宽柔光、轴向区段和正面斜视复测。 [尾套采样记录](../_import/Reference/Type89Launcher/Data_Type89LauncherSteelReference.json)
- 箍圈用第 7 张近照及第 8 张背面照联合校准亮带。背面布光从其余钢件估计，默认游戏灯约束共见区。用实渲测量底色、两向切线法线和粗糙度响应，并从两张照片提取去除宽反光后的磨蚀细纹与色差。 [箍圈采样记录](../_import/Reference/Type89Launcher/Data_Type89LauncherSteelReference.json)
- 驻钣背面按第 8 张馆藏照校准深色氧化、露钢亮斑和磨蚀斑。以其余钢件估计布光，以驻钣外轮廓配准照片。用实渲测量底色、切线法线与粗糙度响应，沿第 1 张正面照实际覆盖的 UV 边界渐隐。默认灯与留出的宽柔光用于复测。 [驻钣采样记录](../_import/Reference/Type89Launcher/Data_Type89LauncherSteelReference.json)
- 箍圈、旋钮根部、侧轮齿根、拨片支架、支柱窄槽及驻钣接头增加近距离遮蔽。尾套将新增 AO 集中在深槽底部和端部贴合处，保留槽壁反光。按游戏检查台同机位对比默认灯和柔光，并复测第 8 张馆藏照的尾套钢面。 [近距离遮蔽记录](../_import/Source/Type89Launcher/Data_Type89LauncherContactDetailAo.json)
- 驻钣接头以第 6 张近照和第 8 张背面照配准到同一钢材图集。联合校准底色、切线法线、粗糙度和金属度，并提取背面氧化斑与点蚀细纹。校准灯下近照钢面的平均亮度误差由 12.2 降至 7.8 灰阶，背面由 17.4 降至 6.2 灰阶。另以独立补光、宽柔光、默认灯和斜视复测。 [接头采样记录](../_import/Reference/Type89Launcher/Data_Type89LauncherSteelReference.json)
- 尾套以第 1 张照片和第 8 张照片共同校准钢色、反光及环槽侧面的磨蚀。用轮廓与环槽亮暗位置复核背面配准，分别拟合底色、切线法线、粗糙度和金属度。按正面照片实际可见的 UV 范围衰减共见区的修正，并以多组布光、斜视和接缝 AO 复测。 [尾套采样记录](../_import/Reference/Type89Launcher/Data_Type89LauncherSteelReference.json)
- 箍圈以第 7 张近照和第 8 张背面照复校亮带形状与磨蚀细纹。用底色、切线法线、粗糙度、金属度和色差的实渲响应联合拟合，并用默认灯和斜侧光约束正面共见区。 [箍圈采样记录](../_import/Reference/Type89Launcher/Data_Type89LauncherSteelReference.json)
- 筒身以第 1 张整体照和第 8 张背面照联合校准反光、钢色和磨蚀细纹。从多组实渲响应分配底色、法线、粗糙度和金属度，并在第 7 张近照的刻印区衰减修正。 [筒身采样记录](../_import/Reference/Type89Launcher/Data_Type89LauncherSteelReference.json)
- 在默认灯和近似馆藏布光下分别测筒身正面钢材的响应，合并底色、切线法线、粗糙度和金属度修正。默认灯下对第 1 张照片的平均亮度误差从 36.9 降到 26.0 个灰阶。近似馆藏布光下由 11.1 降到 11.0，整条高光的横向分布仍有偏差。另以独立斜视和背面两组灯光复测，并复核第 7 张刻印近照与十个 AO 检查视角。 [筒身采样记录](../_import/Reference/Type89Launcher/Data_Type89LauncherSteelReference.json)
- 外套筒背面按第 8 张馆藏照复校钢色、粗糙度和金属度。用两组实渲响应提取去掉周期性沟槽明暗后的磨蚀细纹，把修正合入原有图集。独立布光下平均亮度误差从 16.8 降到 14.2 个灰阶，细纹相关系数从 0.543 提至 0.564。另在新版检查台复测正面默认灯和斜视，并用开关 AO 的对照核对十个视角的深缝和相邻部件。 [套筒采样记录](../_import/Reference/Type89Launcher/Data_Type89LauncherSteelReference.json)
- 支柱背面按第 8 张馆藏照复校发蓝钢的色调、反光和磨蚀，并由第 4 张近照约束正面共见区。用两套灯的实渲响应提取磨损细纹，从细纹修正里衰减沿轴延续的槽壁明暗。在独立布光下平均亮度误差从 17.2 降到 11.2 个灰阶，磨蚀细纹相关系数由 -0.070 提至 0.245。同机位复测正面、斜视和十个接缝 AO 视角。 [支柱采样记录](../_import/Reference/Type89Launcher/Data_Type89LauncherSteelReference.json)
- 筒身正面的亮带在新版检查台下重新校准。用第 1 张馆藏照和两组实渲响应修正横向反光，按两组布光共有的色差和磨蚀细节补回细纹。默认灯下平均亮度误差从 19.9 降到 17.8 个灰阶，高精度配准的细纹相关系数从 0.104 提至 0.250。独立斜视下平均亮度误差从 15.1 降到 13.7。另复测第 7 张刻印近照、第 8 张背面照和十个接缝 AO 视角。 [筒身采样记录](../_import/Reference/Type89Launcher/Data_Type89LauncherSteelReference.json)
- 驻钣正背面按第 1、8 张馆藏照复校钢色、粗糙度和反光。按默认灯与近似馆藏布光的共同响应恢复正面磨蚀细纹，近似馆藏布光下的亮度误差从 6.65 降到 5.28 个灰阶，默认灯下从 38.3 降到 33.7。另以独立斜视、背面三组布光和十个接缝 AO 视角复测。用现有 AO 视图映回 UV，在交界暗部平滑衰减材质修正。 [驻钣采样记录](../_import/Reference/Type89Launcher/Data_Type89LauncherSteelReference.json)
- 拨片正面按第 5、8 张馆藏图复校露钢反光和钢色，反面按第 2 张馆藏照补回磨蚀细纹。默认灯下正反面平均亮度误差分别从 19.5 降到 15.5、从 27.4 降到 21.8 个灰阶。另复测独立斜视、第 8 张整体照的背面补光和十个接缝 AO 视角。开关 AO 的对照用于把交界处阴影变化映回 UV，沿缝隙平滑衰减材质修正。 [拨片采样记录](../_import/Reference/Type89Launcher/Data_Type89LauncherSteelReference.json)
- 外套筒背面按第 8 张整件馆藏照重估布光，提取亮带、氧化色和多组布光共有的磨蚀细纹。细纹修正避开沟槽的周期明暗和深缝。独立布光下平均亮度误差从 14.56 降到 13.77 个灰阶，细纹相关系数从 0.578 提至 0.611。另复测正面默认灯、斜视、相邻筒身和十个接缝 AO 视角。 [外套筒采样记录](../_import/Reference/Type89Launcher/Data_Type89LauncherSteelReference.json)
- 筒尾肩部背面按第 8 张馆藏照校准发蓝钢面、氧化色和反光，以第 4 张近照复测正面和斜视。按十个 AO 视角的实渲差异定位到 UV，在交界暗部平滑衰减材质修正。独立布光下平均亮度误差从 12.58 降到 6.01 个灰阶，细纹相关系数从 0.306 提至 0.440。另以原照核对相邻箍圈的亮度。 [肩部采样记录](../_import/Reference/Type89Launcher/Data_Type89LauncherSteelReference.json)

- 筒身背面按第 8 张馆藏照复校钢面亮带、氧化色和磨蚀纹理。用两套布光下的材质响应分配底色、凹凸、粗糙度和金属度，沿共见表面和接缝遮蔽边缘过渡。独立布光下平均亮度误差从 9.77 降至 8.37 个灰阶，磨蚀细纹相关系数从 0.724 提至 0.769。另复测两段留出的钢面、正面刻印和十个接缝 AO 视角。 [筒身采样记录](../_import/Reference/Type89Launcher/Data_Type89LauncherSteelReference.json)

- 侧轮按第 3 张馆藏照复校齿侧和齿槽。用逐齿采样控制暖褐氧化层的底色、粗糙度和金属度，并沿轮缘逐渐衰减。独立柔光下，氧化面归一化红蓝差的平均误差由 0.45 降至 0.08。另复测留出的一齿、两处斜视和十个接缝 AO 视角。较弱布光下，槽底仍偏暗。 [轮缘采样记录](../_import/Reference/Type89Launcher/Data_Type89LauncherSteelReference.json)

- 滚花握部背面按第 8 张馆藏照校准钢色、反光和局部磨蚀。用两组灯的材质响应找出共见的磨痕，在第 4 张近照可见的 UV 范围和接缝暗部渐隐。独立布光下，平均亮度误差从 10.52 降至 6.52 个灰阶，细纹相关系数从 -0.122 提至 0.127。复测留出的轴向区段、正面两个机位和十个接缝 AO 视角。 [滚花采样记录](../_import/Reference/Type89Launcher/Data_Type89LauncherSteelReference.json)

- 滚花握部正面按第 4 张馆藏近照复校磨痕位置。按渲染像素覆盖范围重采原照，沿接缝暗部衰减材质修正。发布格式下，近景独立布光的平均亮度误差从 8.53 降至 6.23 个灰阶，细纹相关系数由 0.617 提至 0.740。复测留出的像素、斜视、远景、握部背面与十个接缝 AO 视角。 [滚花采样记录](../_import/Reference/Type89Launcher/Data_Type89LauncherSteelReference.json)

- 驻钣卷边用第 1 张馆藏照的可见长边校准相对明暗，用第 8 张照配准背面钢色和磨蚀。发布格式下，背面独立布光的平均亮度误差从 13.49 降至 8.55 个灰阶，原本较接近的窄边从 5.31 降至 4.42。正面卷边相对上表面的亮度从约 55% 提至 74%，第 1 张照约为 88%。另复测默认灯、斜视、相邻上表面和十个接缝 AO 视角。正面卷起处的轮廓仍有偏差。 [卷边采样记录](../_import/Reference/Type89Launcher/Data_Type89LauncherSteelReference.json)

- 握部按第 4 张馆藏照单独校准偏差较大的一组斜纹。用正面近景响应修正间距与落点，斜视与另一组灯留作复测。发布格式下，独立布光的细纹相关系数由正面 0.714 提至 0.772，斜视由 0.720 提至 0.785。另复测远景、背面及十个接缝 AO 视角。 [斜纹采样记录](../_import/Reference/Type89Launcher/Data_Type89LauncherSteelReference.json)

- 外套筒背面按第 8 张馆藏照校准钢面明暗与亮带强弱。用两组灯的材质响应回烘底色、粗糙度和金属度，共见钢面由正面默认灯和中性布光的实渲约束。发布格式下，背面独立布光的平均亮度误差从 13.76 降至 12.75 个灰阶，三个角向区域的亮带振幅平均误差从 0.040 降至 0.028。另复测留出的像素、正面斜视及十个接缝 AO 视角。细环纹位置仍有差异。 [套筒采样记录](../_import/Reference/Type89Launcher/Data_Type89LauncherSteelReference.json)

- 筒身背面以第 8 张馆藏照校准两组灯下同时存在的亮度和色差，按第 1 张照的正面可见区渐收修正。发布格式下，近似馆藏布光的平均亮度误差从 6.15 降至 4.42 个灰阶，独立布光从 8.38 降至 7.10，独立布光的细纹相关系数从 0.768 提至 0.809。正面及斜视的亮度平均变化均小于 0.31 个灰阶，第 7 张照片对应的刻印和十个接缝 AO 视角通过复测。独立布光下，馆藏照的窄亮带仍更强。 [筒身采样记录](../_import/Reference/Type89Launcher/Data_Type89LauncherSteelReference.json)

- 外套筒背面按配准后的馆藏照重烘细环纹在不同灯位下的反光，修正底色、切线法线、粗糙度和金属度。独立布光下，环纹明暗信号的相关系数从 0.457 提至 0.580，平均亮度误差从 12.73 降至 11.89 个灰阶。筒身窄亮带以正背两张馆藏照联合校准，独立布光的第 95 百分位亮度从 185.0 提至 191.9，照片为 202.9。复测正面两组布光、斜视、刻印和十个接缝 AO 视角。正面中性灯下共见区的平均亮度误差降低，局部细纹相关系数从 0.342 降至 0.313。 [钢面采样记录](../_import/Reference/Type89Launcher/Data_Type89LauncherSteelReference.json)

- 外套筒两侧分别按第 8 张馆藏照拟合环纹的间隔、明暗与亮缘位置。独立布光下，原先错位较明显一侧的环纹相关系数从 0.188 提至 0.260，整段平均亮度误差从 11.90 降至 11.13 个灰阶。筒身正面共见区按第 1 张照复校磨痕，相关系数从 0.315 提至 0.374。背面窄亮带在近似馆藏布光下达到约 203 个灰阶，独立布光下为约 194，照片为约 203。复测正面斜视、刻印和十个接缝 AO 视角。套筒两侧仍有局部错位，默认正面布光下的平均亮度误差增加约 0.12 个灰阶。 [钢面采样记录](../_import/Reference/Type89Launcher/Data_Type89LauncherSteelReference.json)

- 驻钣背面的钢色、氧化斑与反光按第 8 张照片重新拟合，并在第 1 张照片的共见区收小修正。发布格式下，背面平均亮度误差在近似馆藏布光下从 9.08 降至 5.12 个灰阶，独立布光下从 13.93 降至 8.26 个灰阶。独立布光下的磨痕相关系数从 0.581 提至 0.695。卷边相对于周围钢面的亮度通过复测，十个接缝 AO 视角通过验收。正面柔光下的平均亮度误差增加约 0.41 个灰阶。 [驻钣钢面采样记录](../_import/Reference/Type89Launcher/Data_Type89LauncherSteelReference.json)

- 筒身背面以平均钢色和两组灯之间的反光差共同拟合材质。宽光下的平均亮度误差从 5.42 降至 3.79 个灰阶，第三组布光下的窄亮带从约 194 提至约 196 个灰阶，照片约为 203。外套筒用低频材质响应校准背面的整体明暗，独立布光下的平均亮度误差从 11.12 降至 9.89。外套筒中段环纹相关系数从 0.742 降至 0.724，默认灯下正面平均亮度误差约增加 0.30 个灰阶。接头底缘在远景压缩中变浅的局部暗缝已补强，复测正面、刻印、驻钣及十个接缝 AO 视角。 [钢面采样记录](../_import/Reference/Type89Launcher/Data_Type89LauncherSteelReference.json)

- 以第 8 张馆藏照分段拟合外套筒环纹的亮暗幅度和相位，并以第 1 张照片的正面共见区约束材质响应。独立布光下，中段环纹的相关系数从 0.724 提至 0.758，右侧从 0.258 提至 0.315，中段亮暗幅度约为照片的 96%。筒身独立布光下的窄亮带从约 196 提至 199 个灰阶，照片约为 203。补强远景中支柱的局部贴合暗缝，复测十个接缝 AO 视角。外套筒背面的整体亮度误差增加约 0.25 个灰阶。 [钢面采样记录](../_import/Reference/Type89Launcher/Data_Type89LauncherSteelReference.json)

- 外套筒右侧按正反面实渲响应校准末段亮度，再拟合环纹相位。独立布光下，整片背面的平均亮度误差从 10.14 降到 9.36 个灰阶，右侧环纹相关系数从 0.315 提至 0.351，末段仍比照片暗约 26 个灰阶。支柱背面按第 8 张馆藏照复校钢色和磨痕，并用第 4 张近照约束正面。独立布光下亮度误差从 11.14 降至 7.51 个灰阶，磨痕相关系数从 0.242 提至 0.491。复测正面、斜视、筒身刻印、驻钣和十个接缝 AO 视角。 [钢面采样记录](../_import/Reference/Type89Launcher/Data_Type89LauncherSteelReference.json)

- 按第 8 张馆藏照校准侧轮轮缘与相邻钢面的冷暖反差，以第 3 张近照约束齿面氧化和齿顶高光。三组布光下，背面的相对色差降低约 16%–19%。复测四个近景角度、相邻钢件和十个接缝 AO 视角。弱光下齿根的暖色仍浅于馆藏近照。 [轮缘采样记录](../_import/Reference/Type89Launcher/Data_Type89LauncherSteelReference.json)

- 以第 3 张近照校准齿根的暗部反光，并以第 8 张馆藏照复测轮缘背面。四个近景角度的平均齿根与齿顶亮度比在弱光下由 3.9% 提高至 4.7%，近照约为 11.1%。柔光下明暗比例更接近近照，色差略有增加。外套筒末段由正背两张照片联合约束，独立布光下的亮度偏差由约 26 降至 23 个灰阶，整个背面的亮度平均误差由 9.36 降至 8.86。三组布光和偏移后的照片配准均复测环纹和末段亮度，另检查十个接缝 AO 视角。 [钢面采样记录](../_import/Reference/Type89Launcher/Data_Type89LauncherSteelReference.json)

- 按第 8 张馆藏照分段校准外套筒右侧环纹的反差。独立布光下，中段由馆藏照的 43% 提高到 70%，末端由 2.30 倍降到 1.47 倍。三组布光、七种小范围照片配准及留出的采样像素用于复测。另检查第 1 张照片对应的正面、斜视和十个接缝 AO 视角。 [钢面采样记录](../_import/Reference/Type89Launcher/Data_Type89LauncherSteelReference.json)

- 以第 1、8 张馆藏照共同约束外套筒末段底色。独立布光下，末段亮度差由 23.65 降至 18.58 个灰阶，整个背面的平均亮度误差由 8.84 降至 8.38。另复测变动配准、留出像素、正面、斜视及十个接缝 AO 机位。正面默认灯下平均亮度误差增加 0.35 个灰阶，末段环纹反差约为馆藏照的 1.53 倍。 [钢面采样记录](../_import/Reference/Type89Launcher/Data_Type89LauncherSteelReference.json)

- 沿驻钣轮廓重新配准第 8 张照片，并以第 1 张正面照约束折边的亮暗与钢色。三组布光在后缘的共同亮度偏差由 10.43 降至 7.85 个灰阶，独立布光下后缘细纹相关系数由 0.31 提至 0.40。原配准、三种轮廓校正幅度及留出的像素均复测，正面馆藏布光下平均亮度误差增加 0.34 个灰阶。另复测正面斜视、外缘和十个接缝 AO 视角。 [钢面采样记录](../_import/Reference/Type89Launcher/Data_Type89LauncherSteelReference.json)

- 以第 8 张馆藏照的筒身外沿校准左侧钢面的底色与反光方向，并用第 1、7 张照片约束正面亮带和刻印。沿两侧轮廓配准后，三组布光下该段的共同亮度偏差从 17.33 降至 10.26 个灰阶，原配准下从 15.01 降至 8.20 个灰阶。独立布光下亮度误差由 19.76 降至 12.73，局部细纹的位置与馆藏照仍有差异。正面、斜视、窄条、刻印与十个接缝 AO 视角通过复测。 [钢面采样记录](../_import/Reference/Type89Launcher/Data_Type89LauncherSteelReference.json)

## 重建与贴图

- BlenderMCP 通过本仓 `scripts/Script_BlenderMcp.mjs` 驱动。`_blender/Script_Type89LauncherExterior.py` 生成独立、可编辑的外观部件。`_blender/BuildAll.py --only Type89Launcher` 输出游戏用 `Model/Model_Type89Launcher.tzm.json`，在导出阶段执行三角面预算和网格自检。
- 在 BlenderMCP 中打开带 `ContactAo` UV 层的工程重烘接缝。先以 `Script_BakeType89LauncherSteel.py --legacy-orm <基准图.png>` 烘出 UV0 基准，再用 `Script_BakeType89LauncherContactAo.py` 的 `Main(legacyOrm=<基准图.png>)` 逐面追踪装配遮挡，把现有细纹遮蔽和各接触面的几何遮蔽写入独立图集。运行钢材烘焙脚本合入 ORM 红通道。粗糙度和金属度读取 UV0，遮蔽读取 UV1，三通道共用原 ORM 采样器。原 `Main()` 与 `Main(calibration=True)` 分别重建照片拟合使用的两张 UV0 遮蔽图。 [几何烘焙脚本](../_blender/Script_BakeType89LauncherContactAo.py) [接缝 UV 图集](../_blender/Data_Type89LauncherContactAtlas.json)
- 用同一工程运行 `Main(contactDetail=True)` 重建近距离遮蔽图。每纹素取四个子样本，仅汇总有效表面，填充图集留边后由钢材烘焙脚本合入 1K ORM 红通道。 [烘焙记录](../_import/Source/Type89Launcher/Data_Type89LauncherContactDetailAo.json)
- 驻钣接头的双照参数保存在 `neckJointFinish`。钢材烘焙在合成接缝遮蔽后应用接头的粗糙度与金属度变化，背面 16 位细纹图按配准的 UV 窗口叠入原 2K 底色。 [贴图烘焙脚本](../_import/Script_BakeType89LauncherSteel.py)
- 尾套的双照参数保存在 `sleeveJointFinish`。两张 16 位源图分别记录正反双照的 UV 覆盖权重和背面磨蚀细纹。粗糙度与金属度在接缝遮蔽合成后写入 ORM，三张运行时贴图合计低于 1 MiB。 [贴图烘焙脚本](../_import/Script_BakeType89LauncherSteel.py)
- 箍圈亮带复校保存在 `collarReflectanceFinish`。16 位源图记录实拍覆盖和细纹响应。粗糙度和金属度在接缝遮蔽合成之后更新，三张 WebP 源贴图合计低于 1 MiB。 [贴图烘焙脚本](../_import/Script_BakeType89LauncherSteel.py)
- 筒身正背复校保存在 `barrelJointFinish`。其 `frontLightCalibration` 记录了正面两套灯的响应帧及留出的轴向区段。整体钢面和相邻窄条共用一套最终光泽，窄条从筒身重采样，粗糙度和金属度的差量合并到已有 ORM。 [贴图烘焙脚本](../_import/Script_BakeType89LauncherSteel.py)
- 外套筒背面的修正合入 `sleeveJointFinish.detail` 的 16 位采样图。`rearResponse` 记录配准后的照片、背面布光和响应帧的哈希。底色与粗糙度、金属度从原有图集重烘，第二套 UV 继续读取装配遮蔽。 [贴图烘焙脚本](../_import/Script_BakeType89LauncherSteel.py)
- 支柱背面联合校准保存在 `stemJointFinish`。16 位采样图记录背面的 UV 覆盖范围和磨蚀细纹。正式回烘会校验原图、正面材质和接缝 AO 的哈希，再把材质修正合入现有三张贴图。 [贴图烘焙脚本](../_import/Script_BakeType89LauncherSteel.py)
- 新版检查台的筒身采样保存在 `barrelJointFinish.currentCameraCalibration`。记录包含默认灯与近似馆藏布光的响应帧、拍摄用灯光参数和上一版采样图的哈希。最终亮带和细纹使用同一张 16 位 UV 采样图烘焙。 [贴图烘焙脚本](../_import/Script_BakeType89LauncherSteel.py)
- 驻钣新版反光校准保存在 `saddleReflectanceFinish`。16 位覆盖和磨蚀源图保留交界处的柔和过渡。烘焙校验已有驻钣拟合和接缝 AO 后，把正背面材质修正合入三张运行时贴图。 [贴图烘焙脚本](../_import/Script_BakeType89LauncherSteel.py)
- 拨片两面的反光校准保存在 `tabReflectanceFinish` 和 `tabBackReflectanceFinish`。16 位覆盖图记录接缝附近的衰减，反面的磨蚀采样来自第 2 张馆藏照。烘焙校验前一版采样与接缝 AO 后合入三张运行时贴图。 [贴图烘焙脚本](../_import/Script_BakeType89LauncherSteel.py)
- 外套筒背面的新布光与响应帧保存在 `sleeveJointFinish.currentRearLighting`。本轮粗糙度、金属度与细纹合入原有 16 位采样图，并保留正面校准和独立接缝 UV 的读取方式。 [贴图烘焙脚本](../_import/Script_BakeType89LauncherSteel.py)
- 肩部背面的材质响应保存在 `shoulderReflectanceFinish`。烘焙校验正面、侧面采样及接缝遮蔽的哈希，通过 16 位覆盖图沿交界衰减背面反光修正。 [贴图烘焙脚本](../_import/Script_BakeType89LauncherSteel.py)
- OpenAI Images API 的 `gpt-image-2` 用四块馆藏钢材裁样生成 2K 源图。原始 PNG 与 Blender 工程一起保存在 OneDrive。用 `Script_MeasureType89LauncherSteel.py --photos <ReferencePhotos>` 和 NumPy、Pillow、SciPy 重算馆藏采样。仓库内无损源图可经 `python Taierzhuang1938/_import/Script_BakeType89LauncherSteel.py` 重烘。输出为 2048² 底色、2048² 切线法线与 1024² ORM。 [生成提示词](../_import/Prompts/Texture_Type89LauncherSteel.txt) [烘焙记录](../_import/TextureBakes/Texture_Type89LauncherSteel.json)
- 重新推导筒身亮度修正时，为采样命令加 `--barrel-evidence <MetalFinishV38/Evidence>`。三组控制帧的 SHA-256 与原照投影记录在 `registeredCalibration` 中。只重算照片采样时，匹配同一照片和投影的修正随记录保留。 [采样脚本](../_import/Script_MeasureType89LauncherSteel.py)
- 重新推导外套筒底色时加 `--sleeve-evidence <MetalFinishV39/Evidence>`。记录包含两组配准帧哈希、原照哈希和表面采样范围。只重算照片采样时，原照、采样线和采样范围一致的修正随记录保留。 [采样脚本](../_import/Script_MeasureType89LauncherSteel.py)
- 重新推导筒身对两套灯光的响应时加 `--barrel-response-evidence <MetalFinishV40/Evidence>`，使用 `V41ResponseDirect` 和 `V41ResponseDefault` 各自的基准帧、UV 帧与六张材质变化帧。原照与投影一致时，仅重算照片的命令保留这次响应校准。 [采样脚本](../_import/Script_MeasureType89LauncherSteel.py)
- 重新推导筒身细纹与颜色时加 `--barrel-finish-evidence <MetalFinishV41/Evidence>`。颜色使用 `V41BarrelFinalDirect` 和 `V41BarrelFinalDefault`，细纹使用 `V42FineResponseDirect` 和 `V42FineResponseDefault` 中的高分辨率基准帧、UV 帧与材质响应帧。 [采样脚本](../_import/Script_MeasureType89LauncherSteel.py)
- 重新推导外套筒材质响应时加 `--sleeve-response-evidence <MetalFinishV42/Evidence>`。用 `V43SleeveStudyneutral`、`V43SleeveStudydefault` 的基准、UV 和材质响应帧计算分区材质，再用 `V43RegionalNeutral`、`V43RegionalDefault`、`V43RegionalRake` 校正细纹和颜色。 [采样脚本](../_import/Script_MeasureType89LauncherSteel.py)
- 在 BlenderMCP 打开对应模型工程，运行 `_blender/Script_BakeType89LauncherSleeveHorizon.py` 生成 72×217 遮挡数据。只在八九式掷弹筒的原配材质上读取这份数据。带 `--sleeve-horizon-evidence <MetalFinishV43/Evidence>` 的照片采样命令可从 `V44RuntimeSleeveNeutral`、`V44RuntimeSleeveDefault`、`V44RuntimeSleeveRake` 重算对应的细纹与颜色修正。 [遮挡生成脚本](../_blender/Script_BakeType89LauncherSleeveHorizon.py) [材质脚本](../Script_Type89LauncherSleeveHorizon.mjs)
- 带 `--barrel-material-evidence <MetalFinishV44/Evidence>` 的照片采样命令使用 `V45BarrelStudyDirect`、`V45BarrelStudyDefault` 重算钢面的材质分区，再用 `V45BarrelResolveDirect`、`V45BarrelResolveDefault` 校准回烘后的亮斑。 [采样脚本](../_import/Script_MeasureType89LauncherSteel.py)
- 带 `--barrel-mark-evidence <MetalFinishV46/Evidence>` 的照片采样命令从 `V46MarkStudyDirect`、`V46MarkStudyDefault` 及回烘后的 `V46MarkResolveDirect`、`V46MarkResolveDefault` 重算刻印底色修正。每组使用基准帧、UV 帧和正负线性底色增益试验帧。只重算照片时，同一照片和投影下保留这张修正图。 [采样脚本](../_import/Script_MeasureType89LauncherSteel.py)
- 带 `--barrel-small-mark-evidence <MetalFinishV47/Evidence>` 的照片采样命令从 `V47StampStudyDirect`、`V47StampStudyDefault` 和回烘后的 `V47StampResolveDirect`、`V47StampResolveDefault` 重算小印底色。 [采样脚本](../_import/Script_MeasureType89LauncherSteel.py)
- 带 `--barrel-facet-evidence <MetalFinishV49/Evidence>` 的照片采样命令使用 `V49BrdfDirect`、`V49BrdfDefault` 及回烘后的 `V49FacetSettleDirect`、`V49FacetSettleDefault` 重算横向法线与底色。烘焙脚本在图集纹素中心采样，并用两组修正调整最终的底色和切线法线。 [采样脚本](../_import/Script_MeasureType89LauncherSteel.py)
- 带 `--barrel-band-evidence <MetalFinishV50/Evidence>` 的照片采样命令读取 `V50BandStudyDirect`、`V50BandStudyDefault` 和 `V50BandStudySoft`，重算中段的法线、底色与粗糙度。三张通道图以 16 位精度并排保存为一张采样板。 [采样脚本](../_import/Script_MeasureType89LauncherSteel.py)
- 带 `--barrel-grain-evidence <MetalFinishV51/Evidence>` 的照片采样命令使用 `V51ReferenceRigDirect` 和 `V51DefaultStudy` 的配准底色响应重算细纹。近似馆藏布光由中性灯设置调整环境亮度和补光强度，并通过独立斜视和未参与布光拟合的筒身区域复核。 [采样脚本](../_import/Script_MeasureType89LauncherSteel.py)
- 带 `--saddle-response-evidence <MetalFinishV52/Evidence>` 的照片采样命令读取驻钣两轮的默认灯、补光和斜视响应帧。以同一 UV 位置合并测量，重算底色、两个切线方向的法线修正和粗糙度。 [采样脚本](../_import/Script_MeasureType89LauncherSteel.py)
- 带 `--neck-chroma-evidence <MetalFinishV53/Evidence>` 的照片采样命令使用 `V53NeckStudyDefault` 和 `V53NeckStudyMuseum` 重算驻钣接头的底色通道修正。 [采样脚本](../_import/Script_MeasureType89LauncherSteel.py)
- 带 `--neck-mark-evidence <MetalFinishV54/Evidence>` 的照片采样命令使用 `V54NeckMarkStudyDefault`、`V54NeckMarkStudyMuseum` 及同机位的 `V54NeckMarkResolveDefault`、`V54NeckMarkResolveMuseum` 重算刻印的底色对比。 [采样脚本](../_import/Script_MeasureType89LauncherSteel.py)
- 带 `--stem-response-evidence <MetalFinishV55/Evidence>` 的照片采样命令读取 `V55StemFreshDefault`、`V55StemFreshFill`、`V55StemSoftBRDF` 及三组 `V55StemResolve` 回烘响应帧，重算支柱的底色、法线和粗糙度。 [采样脚本](../_import/Script_MeasureType89LauncherSteel.py)
- 带 `--tab-response-evidence <MetalFinishV56/Evidence>` 的照片采样命令读取 `V56TabStudy` 的底色试验帧，及 `V56TabSurface`、`V56TabResolve` 的两轮材质响应。两张照片须沿既有曲面配准，细纹与宽反光分别编码。 [采样脚本](../_import/Script_MeasureType89LauncherSteel.py)
- 带 `--grip-response-evidence <MetalFinishV57/Evidence/V57GripStudyControlled>` 的照片采样命令重算滚花握部和箍圈的底色、切线法线与粗糙度。滚花在另一侧补光下也测响应，减少单侧灯对结果的影响。 [采样脚本](../_import/Script_MeasureType89LauncherSteel.py)
- 用 `python Taierzhuang1938/_import/Script_MeasureType89LauncherLightResponse.py --photos <ReferencePhotos> --evidence <MetalFinishV59/Evidence>` 重算暖光拨片和滚花侧面的材质修正。输入包括两张馆藏照、同机位对照帧以及底色、粗糙度、金属度和两个切线方向的实测响应帧。 [材质响应采样脚本](../_import/Script_MeasureType89LauncherLightResponse.py)
- 加 `--knurl-pattern-evidence <MetalFinishV60/Evidence/V59GripLocal>` 可从三种校准灯下已配准的旧版帧重算格纹间距与位置。 [格纹配准脚本](../_import/Script_MeasureType89LauncherLightResponse.py)
- 滚花侧面槽纹和氧化色的参数保存在 `flankWear.grooveFinish`。用原照及已配准的同机位布光对照帧复核两道斜纹、亮度和同亮度下的色差。正式烘焙会校验这些参数对应的近照、格纹配准、材质响应和接触遮蔽。 [贴图烘焙脚本](../_import/Script_BakeType89LauncherSteel.py)
- 用 `python Taierzhuang1938/_import/Script_MeasureType89LauncherLightBalance.py --photos <ReferencePhotos> --tab-evidence <MetalFinishV62/Evidence/V62TabGuardResponses> --neutral-evidence <MetalFinishV62/Evidence/V62LegacyFillResponses> --photo4-evidence <MetalFinishV62/Evidence/V62LegacyPhoto4Responses> --grip-evidence <MetalFinishV62/Evidence/V62GripResponses>` 重算当前拨片和滚花的多灯光修正。输入包括配准后的照片、基准帧和测得的材质响应。 [采样脚本](../_import/Script_MeasureType89LauncherLightBalance.py)
- 拨片的两照材质修正保存在 `closeups.Tab.steelBalance` 对应的 16 位采样图中。`Script_BakeType89LauncherSteel.py` 在应用曲面、钢色和金属参数前核对照片投影、前一版材质和两份 AO 的哈希。用于拟合的逐帧响应和验证对照同工程归档。
- 握部的近远景底色参数及对照帧哈希保存在 `knurl.flankWear.albedoBalance`。烘焙在线性亮度中处理细纹对比度，并核对原照、上一版侧面材质和接触遮蔽。
- 肩部的跨机位反光参数保存在 `shoulder.Flank.reflectionBalance`。烘焙沿现有 UV 岛施加材质响应，并在照片覆盖边缘和深接缝内衰减。
- 筒身和驻钣的底色及切线法线参数分别保存在 `closeups.Barrel.surfaceBalance` 和 `closeups.Saddle.surfaceBalance` 对应的 16 位采样图中。烘焙前核对原照、原材质和两份接缝遮蔽的哈希。
- 整段筒身的亮带参数保存在 `barrelPatina.wideReflectionBalance`。计算以原 UV 弧度和轴向采样为基准，在第 7 张近照的校准区及深接缝衰减。
- 背面亮带系数和细纹采样保存在 `reverseReflectionBalance`。烘焙前核对原有正面和刻印材质、三份 AO 及 16 位采样图的哈希。背面修正按周向边缘、筒身两端和深接缝过渡，重采样相邻窄条 UV。 [贴图烘焙脚本](../_import/Script_BakeType89LauncherSteel.py)
- 尾套背面校准保存在 `sleeveReverseFinish`。烘焙核对原正面拟合、沟槽方向遮挡、接缝 AO 及背面 16 位磨蚀采样的哈希。系数只应用于尾套的底色和切线法线图集区域。 [贴图烘焙脚本](../_import/Script_BakeType89LauncherSteel.py)
- 箍圈联合校准保存在 `collarJointFinish`。底色和法线按周向、轴向响应表合成，粗糙度在校验既有 AO 烘焙后写入 ORM 绿通道。磨蚀细纹、红蓝色差来自 16 位采样图。重新编码后，在实际渲染中检查接缝暗度和阴影覆盖。 [贴图烘焙脚本](../_import/Script_BakeType89LauncherSteel.py)
- 驻钣联合校准保存在 `saddleJointFinish`。背面色差和明暗细纹来自 16 位采样图。烘焙核对正面拟合、原钢材和接缝 AO 的哈希，粗糙度修正在恢复已烘焙的接触遮蔽后合入绿通道。 [贴图烘焙脚本](../_import/Script_BakeType89LauncherSteel.py)
- 侧轮氧化校准保存在 `wheelOxideFinish`。回烘核对轮缘采样和接缝 AO，再将齿面底色与粗糙度、金属度合入现有贴图。 [贴图烘焙脚本](../_import/Script_BakeType89LauncherSteel.py)
- 滚花握部背面校准保存在 `gripRearFinish`。16 位图记录覆盖范围和磨蚀细节。回烘校验近照采样、原钢材及接缝 AO 后，合入底色、粗糙度和金属度。 [贴图烘焙脚本](../_import/Script_BakeType89LauncherSteel.py)
- 握部正面的新磨痕合入同一张 16 位磨蚀图。`gripRearFinish.frontWearRefinement` 记录正面布光、采样帧及烘焙前的纹理哈希。 [滚花采样记录](../_import/Reference/Type89Launcher/Data_Type89LauncherSteelReference.json)
- 驻钣卷边校准保存在 `saddleRimFinish`。16 位图记录覆盖和细纹，烘焙校验上表面材质及接缝 AO 后合入底色、粗糙度和金属度。 [贴图烘焙脚本](../_import/Script_BakeType89LauncherSteel.py)
- 新斜纹参数保存在 `gripFamilyPhase`。回烘校验侧照、握部材质和接缝 AO，从钢材源图分别生成基准与校准斜纹，再将局部响应合入握部原有磨蚀。 [贴图烘焙脚本](../_import/Script_BakeType89LauncherSteel.py)
- 外套筒背面光学修正保存在 `sleeveOpticalFinish`。16 位图保存材质响应与照片覆盖范围的乘积，烘焙校验既有套筒材质和接缝 AO 后合入底色、粗糙度及金属度。 [贴图烘焙脚本](../_import/Script_BakeType89LauncherSteel.py)
- 筒身背面两组布光的亮度均衡采样保存在 `barrelJointFinish.rearCommonLightCalibration`。修正合入原有 16 位筒身材质图，由正式烘焙脚本生成底色和 ORM。 [贴图烘焙脚本](../_import/Script_BakeType89LauncherSteel.py)
- 筒身正背共见区与套筒环纹的采样分别记录在 `barrelJointFinish.sharedHighlightCalibration` 和 `sleeveOpticalFinish.ringAlignment`。两张 16 位材质图由正式脚本生成底色、切线法线及 ORM。 [贴图烘焙脚本](../_import/Script_BakeType89LauncherSteel.py)
- 正面磨痕和套筒两侧环纹的复校参数保存在 `barrelJointFinish.wearAndHighlightRefinement` 与 `sleeveOpticalFinish.sideRingCalibration`。底色 WebP 编码质量设为 83.66，使三张源贴图合计低于 1 MiB。 [贴图烘焙记录](../_import/TextureBakes/Texture_Type89LauncherSteel.json)
- 驻钣大面材质复校保存在 `saddleSurfaceRefinement`。正式脚本核对已有钢面、两张馆藏照的采样记录及接缝 AO，再将 16 位响应图合入钢面的底色、法线、粗糙度和金属度。 [贴图烘焙脚本](../_import/Script_BakeType89LauncherSteel.py)
- 筒身的方向性反光和外套筒背面的整体明暗分别记录在 `barrelJointFinish.directionalResponseCalibration` 和 `sleeveOpticalFinish.rearToneCalibration`。接头底缘按 `contactAoRetouch` 中的接缝 UV 诊断调整 ORM 红通道，回烘时核对原接触遮蔽图的哈希。 [贴图烘焙脚本](../_import/Script_BakeType89LauncherSteel.py)
- 外套筒环纹反差与筒身窄亮带的复校记录在 `sleeveOpticalFinish.ringContrastCalibration` 和 `barrelJointFinish.glintProfileCalibration`。底色编码质量设为 83.48，使三张源贴图合计低于 1 MiB。 [贴图烘焙记录](../_import/TextureBakes/Texture_Type89LauncherSteel.json)
- 支柱背面与套筒右侧的复校记录在 `stemJointFinish.projectedFinishCalibration` 和 `sleeveOpticalFinish.rightSideFinishCalibration`。底色编码质量回到 83.66，三张源贴图合计仍低于 1 MiB。 [贴图烘焙记录](../_import/TextureBakes/Texture_Type89LauncherSteel.json)
- 侧轮背面的材质校准保存在 `wheelRearRefinement`。正式烘焙校验上一版氧化分布、接缝遮蔽及 16 位响应图，再将轮缘底色、切线法线、粗糙度和金属度合入三张贴图。 [贴图烘焙脚本](../_import/Script_BakeType89LauncherSteel.py)
- 齿根反光复校保存在 `wheelRearRefinement.cavityCalibration`，套筒末段保存在 `sleeveOpticalFinish.endReflectanceCalibration`。修正并入各自的 16 位采样图，再用正式脚本重烘三张贴图。 [贴图烘焙脚本](../_import/Script_BakeType89LauncherSteel.py)
- 套筒右侧的分段反差校准保存在 `sleeveOpticalFinish.ringContrastRefinement`。参数关联两张馆藏照与上一版的 16 位采样图。底色 WebP 编码质量设为 83.47，三张源贴图共 1,044,328 字节。 [贴图烘焙记录](../_import/TextureBakes/Texture_Type89LauncherSteel.json)
- 套筒末段的底色修正保存在 `sleeveOpticalFinish.balancedSleeveLighting`，关联正背两张馆藏照和上一版 16 位采样图。正式脚本重烘的底色、法线和 ORM 合计 1,044,198 字节。 [贴图烘焙记录](../_import/TextureBakes/Texture_Type89LauncherSteel.json)
- 驻钣后缘的校准保存在 `saddleSurfaceRefinement.edgeFinishRefinement`。记录关联正背两张照片、轮廓配准幅度和上一版 16 位采样图，正式重烘的三张源贴图合计 1,044,330 字节。 [贴图烘焙记录](../_import/TextureBakes/Texture_Type89LauncherSteel.json)
- 筒身左侧的校准保存在 `barrelJointFinish.leftEdgeFinishRefinement`。重烘底色和法线时沿用接缝 AO 的 ORM，三张源贴图共 1,044,292 字节。 [贴图烘焙记录](../_import/TextureBakes/Texture_Type89LauncherSteel.json)
- 本地独立枪械检查台在 `AdvancedTools/Tool_WeaponInspection.html` 的「其他武器」栏。角色和预演使用同一个 TZM 材质桶。当前修订的工程、GLB 和对照保存在 `OneDrive/AI/Models/Blender/Taierzhuang1938/Type89Launcher_20261126/MetalFinishV106/`。参考图原件和 OpenAI API 源图分别在同级 `ReferencePhotos/` 与 `MetalFinishV2/`。
