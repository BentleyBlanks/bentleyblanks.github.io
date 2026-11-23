# 凹路撤运 · 沟底仰视三机

- 本机场景编辑器 `/Taierzhuang1938/AdvancedTools/SceneEditor.html?scene=AircraftEvacuationDitch`
- 游戏固定机位 `/Taierzhuang1938/?aircraftEvacuationDitch=1&shot=1`
- 编辑器里的「查看原画机位」会在游戏渲染器打开上面的机位。高程、物件、镜头和烟源由[场景文件](Scene_AircraftEvacuationDitch.json)读取，光线、雾和天空由[场景环境](Environment_AircraftEvacuationDitch.json)与[环境预设](../../Environment/EnvPreset_AircraftEvacuationDitch.json)控制。

取景来自 `05B_凹路行军_沟底仰视三机.png`，参考白盒 `Plate05B` 的仰视方向。独立场景原点在镜头底下，镜头坐标 `[0, 1.55, 0]`，离沟底约 1.5 米，垂直视场角 57°，仰角 15.3°。以 1280×720 画幅计，几何地平线约在画面高度 75%。三机的投影中心约为 `(611,179)`、`(739,146)`、`(846,188)`，单架翼宽约 40–45 px。左侧近火和中距烟向上散开，空中灰霾压低远机的对比度。飞机沿用现有 Ki-30 网格，在场景中各自保留位置、朝向和标高。

近处右岸断榆与左岸碎枝勾出沟口。中景左侧摆破灰瓦土屋、邻棚和三层沙袋，局部火源在土屋左侧。下缘前左为灰驴与两轮木车，车上叠置包袱，空担架横向见于车右后。五个场景地标记录牵驴人、担架两端、担架乘员和后续撤离队列的位置。人物留空。

烟柱复用体积烟序列，沟口到远坡的灰霾由独立的三维密度场连接。中距烟团用原画与同机位实机亮度对照校准消光，运行时读取随风变形的 24 帧密度数据。低云带的方位、宽度、浓度和偏斜在环境预设的 `Clouds` 下，天际灰霾色在 `Sky` 下。地表选用 `SunkenRoad`，用压实车辙土、切面黄土和带根草茬表现沟底、冲刷沟壁及沟沿。近景高程按 20 厘米网格采样，枯草与碎土沿沟坎和树根分簇。伏地草根随坡面弯折，仍可在场景编辑器中单独挪动。

沟壁切面源贴图以 05B 原画右岸为参考，由内置 ImageGen 创作灰褐粉质黄土、剥落的土片与断续的斜向裂纹。表面图按 1.58 米的边长使用，色彩、法线及 ORH 在地形材质中分别采样。

## 模型预算

三角数用 GLB 三角图元的索引或顶点计数实测。近景断榆的枝干和撕裂面依靠几何轮廓，预算参考项目两种不同密度的无叶树。破土屋比远景农舍更大，增加了短瓦、破口、露出的木构和垂布。

| 模型 | 画幅与基准 | 单件目标 | 单件实测 |
| --- | --- | ---: | ---: |
| 裂干枯榆 | 右边约 25% 宽，`LeaflessTreeLowPoly` 22,700、`LeaflessTreeOak` 47,998 | ≤ 25,000 | 15,014 |
| 破灰瓦土屋 | 左边约 26% 宽，`Model_ChineseRuralHouse` 58,812、田野农舍 7,428 | ≤ 18,000 | 12,606 |
| 远机 ×3 | 单架约 3%–4% 宽，复用 `Model_MitsubishiKi30` | 复用 | 14,457 |
| 灰驴与两轮木车 | 下缘，复用 `Model_DonkeyCart` 的绑定姿势，共用原材质 | 复用 | 79,500 |
| 竹竿布兜担架 | 车右后，复用 `Model_BambooStretcher` | 复用 | 2,688 |

## 重建

从仓库根执行。高度图重建保留场景中的场景布设、烟源和镜头数据。原画、正交参考和审片图留在本地。两张三视图由内置 ImageGen 生成，原生尺寸分别是 1672×941 和 1774×887，另有长边 2048 的等比审阅副本。

```powershell
node scripts/Script_BlenderMcp.mjs start --batch Taierzhuang1938/_import/AircraftEvacuationDitch/Script_BakeDitchModels.py --task AircraftEvacuationDitchBake
node Taierzhuang1938/_import/AircraftEvacuationDitch/Script_BakeDitchTerrain.mjs
node Taierzhuang1938/_import/AircraftEvacuationDitch/Script_BakeDitchTerrain.mjs --check
python Taierzhuang1938/_import/AircraftEvacuationDitch/Script_BakeDitchSurfaces.py
python Taierzhuang1938/_import/AircraftEvacuationDitch/Script_BakeDitchHaze.py
node Taierzhuang1938/Script_SceneDocTest.mjs
node scripts/Script_LocalPreview.mjs 8134 --no-open
```

两件道具的 Blender 源工程位于 `C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/AircraftEvacuationDitch/Source_AircraftEvacuationDitch.blend`。运行时 GLB 位于 [Model/AircraftEvacuationDitch](../../Model/AircraftEvacuationDitch/)。
