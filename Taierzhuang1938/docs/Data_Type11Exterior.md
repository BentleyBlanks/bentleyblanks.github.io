# 十一年式轻机枪外观

游戏继续从 `Model/Model_Type11.tzm.json` 载入十一年式。外观基于 [buh 的 Type 11 6.5mm Machine gun](https://sketchfab.com/3d-models/type-11-65mm-machine-gun-outdated-4a24c481a48a413d92208ccfe7772ecc)，按 [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) 署名。衍生版本调整了散热环、弹斗盖和第一人称手部接触，新增木钢共用 Base、Normal、ORM 图集。来源包的展示件不参与导出。留档的旧游戏模型用于沿用操作柄、导轨和命名接口。

| 观察 | 逐图对照 |
| --- | --- |
| 左、右侧 | 英国国立陆军博物馆 1981-01-9-1 两相反侧面用于核对细颈弯托、宽跟和收拢的两脚架。检查台使用同向侧视观察散热环的连续剪影与枪托曲线。 |
| 左上弹斗近景 | 澳洲战争纪念馆 RELAWM24898 第三张照片用于核对弹斗壁、上缘和钢面高光。游戏用独立网格表现弹斗盖，开放时的手位使用游戏视模坐标。 |
| 展开侧影 | RELAWM24898 第一、二张和 1943 年美军图56用于核对枪身和散热段的视觉关系。游戏资产的静止外观选择收拢姿态。 |
| 木托 | 两件馆藏的色差和旧损分布不同。游戏为弯颈和木托边缘烘焙纵向木纹、局部抛亮和旧托尾嵌件，钢件使用局部接触磨损。颜色和磨损按美术设定取舍。 |

来源为[澳大利亚战争纪念馆 RELAWM24898](https://www.awm.gov.au/collection/C141633)、[英国国立陆军博物馆 1981-01-9-1](https://collection.nam.ac.uk/detail.php?acc=1981-01-9-1)及[1943年《Japanese Infantry Weapons》印刷第88页图56](https://commons.wikimedia.org/wiki/File:Japanese_Infantry_Weapons_(IA_1943-12-31JapaneseInfantryWeapons).pdf)。它们提供同型外观证据。滕县战场该枪的单件外观待查。

可编辑工程位于 `OneDrive/AI/Models/Blender/Taierzhuang1938/Type11Exterior_20261128/Model_Type11Exterior.blend`，同目录 `Bakes/` 保留三张 1024×1024 PNG。使用工作树的 BlenderMCP 执行 `_blender/Script_Type11ExteriorBake.py` 的 `Bake()`，以 `_blender/BuildAll.py -- --only Type11` 导出编辑后的工程，再运行 `python Taierzhuang1938/_import/Script_PackageType11Exterior.py`。封装脚本保留无损法线和金属通道，并对 AO 去噪、粗糙度作低位量化。三张发布用 WebP 共 525,378 字节。

运行时外观为 14,106 三角、四个网格块、三个合批桶，枪口到托尾的模型跨度约 1.100 米。枪身、导轨、操作柄、弹斗盖在工程里独立编辑。第一人称用现有开镜与换弹时间线，校准准星视线、手部接触点及抛壳特效的机匣侧口挂点。
