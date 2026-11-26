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

## 重建与贴图

- BlenderMCP 通过本仓 `scripts/Script_BlenderMcp.mjs` 驱动。`_blender/Script_Type89LauncherExterior.py` 生成独立、可编辑的外观部件。`_blender/BuildAll.py --only Type89Launcher` 输出游戏用 `Model/Model_Type89Launcher.tzm.json`，在导出阶段执行三角面预算和网格自检。
- OpenAI Images API 的 `gpt-image-2` 用四块馆藏钢材裁样生成 2K 源图。原始 PNG 与 Blender 工程一起保存在 OneDrive。用 `Script_MeasureType89LauncherSteel.py --photos <ReferencePhotos>` 和 NumPy、Pillow、SciPy 重算馆藏采样。仓库内无损源图可经 `python Taierzhuang1938/_import/Script_BakeType89LauncherSteel.py` 重烘。输出为 2048² 底色、2048² 切线法线与 1024² ORM。 [生成提示词](../_import/Prompts/Texture_Type89LauncherSteel.txt) [烘焙记录](../_import/TextureBakes/Texture_Type89LauncherSteel.json)
- 本地独立枪械检查台在 `AdvancedTools/Tool_WeaponInspection.html` 的「其他武器」栏。角色和预演使用同一个 TZM 材质桶。当前修订的工程、GLB 和对照保存在 `OneDrive/AI/Models/Blender/Taierzhuang1938/Type89Launcher_20261126/MetalFinishV36/`。参考图原件和 OpenAI API 源图分别在同级 `ReferencePhotos/` 与 `MetalFinishV2/`。
