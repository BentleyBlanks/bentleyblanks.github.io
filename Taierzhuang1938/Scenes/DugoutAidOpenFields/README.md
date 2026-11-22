# 沟底包扎 · 朝田野敞开的木棚

在本地场景编辑器选择 **DugoutAidOpenFields**，可编辑模型布设并保存场景文件。「查看原画机位」会打开游戏渲染器。镜头固定在沟底，从前后两排支柱之间向北看麦畦、村舍和枯树。原画中人物所在的位置留空。

- 场景编辑器使用 `/Taierzhuang1938/AdvancedTools/SceneEditor.html?scene=DugoutAidOpenFields`。
- 实机机位使用 `/Taierzhuang1938/?dugoutAidOpenFields=1&shot=1`。
- 场景、机位和布设见 [Scene_DugoutAidOpenFields.json](Scene_DugoutAidOpenFields.json)，环境由[场景环境](Environment_DugoutAidOpenFields.json)调用[棚外日光预设](../../Environment/EnvPreset_DugoutAidOpenFields.json)。

原图采用 `Reference_DugoutAidOpenFields.png` 的田野开敞版本。机位高度 1.09 米，垂直视场角 47°，俯角 10.3°。画面从上到下是覆土棚顶、田野开口和前景土坡，远处地平线约在画面 29% 高度。沟壁从右侧挡住支柱底部，棚外斜光擦过右侧沟壁和沟底。远景农舍的立面和麦畦按实机画面里可见的尺度制作。

## 模型预算

屏占比为机位画面中的可见宽幅估计。既有模型和此场景模型的三角数均从 GLB 三角图元的索引或顶点计数实测。

| 模型 | 画面位置与宽幅 | 项目基准 | 单件目标 | GLB 实测 |
| --- | --- | --- | ---: | ---: |
| 裂口木柱 | 前排单柱约 3–5%，后排更细 | `BattlefieldTimberBeam` 112，普通梁 | ≤ 700 | 650 |
| 破损覆土棚顶 | 上沿约 90%，画面顶部约四分之一高度 | `BattlefieldTrenchEarthwork` 14,928，连片工事几何 | ≤ 18,000 | 17,526 |
| 沟壁与土阶 | 右侧叠合约 30–35% | `BattlefieldTrenchEarthwork` 14,928，另参考 `TrenchCliffRootCrown` 330 | ≤ 6,000 | 5,796 |
| 残缺灰砖矮墙 | 左中景约 15% | `CityWallBreachShoulderLeft` 1,272，单处灰砖断口 | ≤ 3,000 | 2,664 |
| 柳条编篮 | 左中景约 5–6% | `WickerBasketLidded` 2,800 | ≤ 4,600 | 4,500 |
| 断角土石 | 右侧两块合占约 24%，其余为小碎石 | `TrenchAggregateHigh` 160 | ≤ 800 | 768 |
| 田边枯榆 | 主树约 5–7%，树线单株更小 | `LeaflessTreeLowPoly` 22,700 | ≤ 12,000 | 10,554 |
| 灰瓦农舍 | 远景单栋约 3–6% | `Model_ChineseRuralHouse.glb` 58,812 | ≤ 5,000 | 4,676 |
| 麦苗田畦 | 横向成片、单株低于画面 1% | `TrenchDryGrass` 1,040，单组草丛 | ≤ 5,500 | 5,152 |

带近景轮廓的木裂口、土阶、灰砖砂浆缝、篮筐口沿和石块断面由几何构成。模型包使用已有项目材质与烘焙的编纹贴图。运行时加载同一个 GLB 内的九个命名节点，实例位置、角度和尺寸由场景文件保存。三视图和审片图存于 OneDrive 的 Blender 源工程目录。

## 重建

从仓库根执行。Blender 5.1 的重建输出包含内嵌材质与贴图。

```powershell
node scripts/Script_BlenderMcp.mjs start --batch Taierzhuang1938/_import/Script_BakeDugoutAidOpenFields.py --task DugoutAidOpenFieldsBake
node Taierzhuang1938/_import/Script_BakeDugoutAidTerrain.mjs
node Taierzhuang1938/_import/Script_BakeDugoutAidTerrain.mjs --check
```

重建模型宽高以 GLB 节点包围盒为准。地形脚本只重建厘米制高度图，场景摆放、机位和环境直接保存在场景目录。编辑模型的源工程是 OneDrive 中的 `Taierzhuang1938/DugoutAidOpenFields/Scene_DugoutAidOpenFields.blend`。
