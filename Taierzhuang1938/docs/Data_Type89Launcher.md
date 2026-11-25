# 八九式重掷弹筒外观复原

`Type89Launcher` 是滕县日军掷弹筒手和白盒预演共用的游戏道具。模型按同型实物和同期照片重建。原版 318 三角，全钢复原版 9,924 三角、一个网格块和一套 PBR 材质。模型保留 0.413 m 的项目道具基准和五个既有挂点。白盒预演继续按原轨道放大 1.4699 倍。

## 公开参考图

| 资料 | 本次核对的可见细节 |
| --- | --- |
| 美国水手博物馆 1946.0037.000001，8 张真品照片 | 第 1 张和馆藏旧照 `af178` 用于校准长短比例、第 2 和 5 张核对后段拨片与小环、第 3 和 4 张核对筒尾箍、侧面旋钮与窄槽、第 6 和 7 张核对钢表面。以同件展品的多角度照片为主要依据。 [馆藏照片](https://catalogs.marinersmuseum.org/object/CL2830) |
| 澳大利亚战争纪念馆 026541、026542，Thomas Fisher 摄，1942-09-07 | 两张战时黑白原照用于复核筒身、支柱和驻钣的轮廓与当时的深色表面。 [026541](https://www.awm.gov.au/collection/C10175) [026542](https://www.awm.gov.au/collection/C10176) |
| 澳大利亚战争纪念馆 RELAWM35524、RELAWM28924、RELAWM24923 | 馆藏登记核对同型实物、总长口径、全钢外观及个体标记差异。 [C151935](https://collection.awm.gov.au/C151935) [C145319](https://collection.awm.gov.au/C145319) [C141658](https://www.awm.gov.au/collection/C141658) |
| 小郡驻屯地、函馆驻屯地与哈巴罗夫斯克展品照片 | 补看日方和俄方展示的同型物件，核对收窄支柱、筒尾外轮廓和弧形驻钣。 [小郡](https://ki43.on.coocan.jp/injapan/heiki9/ogori/ogori.html) [函馆](https://ki43.on.coocan.jp/injapan/heiki/hakodate/hakodate.html) [哈巴罗夫斯克](https://ki43.on.coocan.jp/oversea/khaba/khaba.html) |
| 维基共享资源的两张公开影印照 | 核对驻钣在更接近正面的投影以及筒身可见的细线。 [静物影印](https://commons.wikimedia.org/wiki/File:Japanese_Type_89_grenade_discharger.gif) [人物影印](https://commons.wikimedia.org/wiki/File:Japanese50mmGrenadeMortar.jpg) |

筒身至尾箍约占整体长度的 42%，模型采用同一比例关系。筒口浅凹、支柱槽纹、侧面滚花、尾段环纹和鞍形驻钣均为静态外观。公开图证覆盖的是同型实物，滕县现场的具体批次和表面状态仍待考。

## 金属表面修订

- 美国水手博物馆馆藏的第 3、4、6、7 张近照提供滚花、支柱擦痕、驻钣铸造纹和筒身点蚀依据。以整体照采样筒身相对亮度和冷暖变化，滤去圆柱反光的宽亮带后保留局部氧化位置。冲压号 `44023` 参考第 6、7 张照片。 [馆藏](https://catalogs.marinersmuseum.org/object/CL2830) [筒身采样](../_import/Reference/Type89Launcher/Data_Type89LauncherSteelReference.json)
- BlenderMCP 重排 17 个 UV 区域。筒身、箍圈、旋钮、窄槽、尾套和驻钣分别控制露钢、残留发蓝层、腐蚀与抛光。驻钣边缘有独立区域，保留暗色铸造面和局部露钢。以粗糙度和金属度区分镜面反射和哑光氧化，浅点蚀和字戳使用切线法线，沿用一套材质。
- 第 7 张筒身近照、第 4 张支柱近照和整体照的驻钣正面用于校准局部擦亮、氧化和冷暖分布。第 3 张近照的频谱给出旋钮双向菱纹密度。筒身在磨亮钢与深锈之间增加受擦发蓝层，恢复中间调和细小周向擦痕。 [采样数据](../_import/Reference/Type89Launcher/Data_Type89LauncherSteelReference.json) [采样脚本](../_import/Script_MeasureType89LauncherSteel.py)
- 支柱擦亮区和驻钣正面通过检查台的表面交点校准 UV 方向，再按近照转移亮度关系和氧化色分布。第 6 张接头近照补充氧化层的暖色、光泽和冲压号位置。检查覆盖两套照明下同部位的新旧对照。
- 接头在共用 2K 图集中分到 512×384。按第 6 张近照逐字描摹冲压号，沿弧面配准并按检查台的实际投影校正字形比例。凹印用切线法线表现，凹处保留轻微积色，接头两侧按近照收敛亮边。 [号印描摹与采样](../_import/Reference/Type89Launcher/Data_Type89LauncherSteelReference.json)
- 后段拨片两侧分别按第 5、2 张近照取样。沿弧形表面配准擦亮的边缘及暖色氧化，环扣以单独的 UV 区域表现一侧的露钢和另一侧的哑光。近似馆藏布光和检查台默认照明均用于复核两侧的反光关系。
- 挂环按第 5 张近照的侧投影和第 2 张近照的反面弧线取样。第 5 张用于定位露钢距尖端的位置，第 2 张区分两段弧线的磨损。环扣 UV 扩大至 128×256 并在两个方向平滑接缝，饰面加入局部点蚀。挂环截面加密以减轻近景反光折线。侧面滚轮另设 UV 区域，按第 3 张近照分出擦亮窄边和齿间暖褐氧化。 [采样数据](../_import/Reference/Type89Launcher/Data_Type89LauncherSteelReference.json)
- 侧投影的表面交点表明，第 5 张近照的亮区绕过外缘。按横截面的照片色差将露钢延伸至对应 UV，再将滤去宽光带的细小亮暗变化用在底色、粗糙度与浅凹法线。挂环 UV 扩大至 256×256，共用图集维持 2K。 [外缘采样](../_import/Reference/Type89Launcher/Data_Type89LauncherSteelReference.json)
- 对照在枪械检查台固定机位和照明拍摄，新旧材质另在近似馆藏的双条灯下同场比较。照片曝光、灯位和未拍到的表面仍有推定空间。检查范围包括筒口、筒身、筒尾箍、旋钮、驻钣和背面。

## 重建与贴图

- BlenderMCP 通过本仓 `scripts/Script_BlenderMcp.mjs` 驱动。`_blender/Script_Type89LauncherExterior.py` 生成独立、可编辑的外观部件。`_blender/BuildAll.py --only Type89Launcher` 输出游戏用 `Model/Model_Type89Launcher.tzm.json`，在导出阶段执行三角面预算和网格自检。
- OpenAI Images API 的 `gpt-image-2` 用四块馆藏钢材裁样生成 2K 源图。原始 PNG 与 Blender 工程一起保存在 OneDrive。仓库内无损源图可经 `python Taierzhuang1938/_import/Script_BakeType89LauncherSteel.py` 重烘。输出为 2048² 底色、2048² 切线法线与 1024² ORM。 [生成提示词](../_import/Prompts/Texture_Type89LauncherSteel.txt) [烘焙记录](../_import/TextureBakes/Texture_Type89LauncherSteel.json)
- 本地独立枪械检查台在 `AdvancedTools/Tool_WeaponInspection.html` 的「其他武器」栏。角色和预演使用同一个 TZM 材质桶。当前修订的工程、GLB 和对照保存在 `OneDrive/AI/Models/Blender/Taierzhuang1938/Type89Launcher_20261126/MetalFinishV8/`。参考图原件和 OpenAI API 源图分别在同级 `ReferencePhotos/` 与 `MetalFinishV2/`。
