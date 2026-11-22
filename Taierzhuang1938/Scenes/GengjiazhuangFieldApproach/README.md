# 从沟沿望向耿家庄

- 项目渲染入口 `/Taierzhuang1938/?gengjiazhuangFieldApproach=1&shot=1`
- 本机场景编辑器 `/Taierzhuang1938/AdvancedTools/SceneEditor.html?scene=GengjiazhuangFieldApproach`
- 相机离场景原点 1.36 米，俯仰 −4.52°，竖直视角 42°。镜头右下裁入木车，左侧老榆树遮住一部分天空。坡地按高度场建模，土路、矮麦、翻土与田埂沿纵深交错。灰瓦村落和远岗在地平线附近，屋后只有一处烟源。原画中的人物本轮留空。

场景和环境文件可直接编辑。造型依据为用户提供的 `Reference_GengjiazhuangFieldApproach.png`。十件道具先使用内置 ImageGen 生成 2172×724 正交参考，再在 Blender 中制作几何与材质。三视图只供建模核对。运行时读取独立 GLB、米制高程、分层地表和环境预设。模型 GLB 已打包所需底色与法线。植被使用几何叶片，颜色写入材料。沟壁、农舍、农具的具体样子按原画创作。

## 模型预算

三角面数按导出的 GLB 图元实测。同类参照取项目里用途接近的网格或独立节点。小屏占比村屋、田间细树与驮驴的预算按本镜头的重复量和距离收紧。老榆树、近景载货木车、带细稻草和绑绳的草垛与栅栏保留了可读的几何结构。

| 模型 | 项目参照 | 目标上限 | 导出三角面 |
| --- | --- | ---: | ---: |
| 老榆树 | `LeaflessTreeOak` 47,998 / `LeaflessTree01` 60,000 | 55,000 | 53,426 |
| 载草木车 | `MarketHandcart` 4,200 / 撤运木车 10,140 / 驴车的车体 16,016 | 14,000 | 12,880 |
| 灰瓦农舍 | `Model_ChineseRuralHouse` 58,812 | 8,000 | 7,428 |
| 田边草垛 | 农具包 `HayStack` 488 | 3,000 | 2,854 |
| 枝条栅栏 | `Model_WoodFence` 298 | 700 | 620 |
| 田间细榆树 | `LeaflessTreeLowPoly` 22,700 | 5,000 | 4,312 |
| 矮麦苗 | `TrenchDryGrass` 1,040 | 300 | 264 |
| 沟沿干草与细根 | `TrenchDryGrass` 1,040 | 600 | 560 |
| 翻土块 | `TrenchAggregate` 的近档 160、远档 56 | 160 | 156 |
| 驮草小驴 | `Model_Donkey` 79,888 | 5,500 | 5,042 |

## 重建

从仓库根目录运行。可编辑源工程的路径为 `C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/GengjiazhuangFieldApproach/Source_GengjiazhuangFieldApproach.blend`，每个模型有三台共用比例的正交相机。

```powershell
node scripts/Script_BlenderMcp.mjs start --batch Taierzhuang1938/_import/GengjiazhuangFieldApproach/Script_BakeFieldApproachModels.py
node Taierzhuang1938/_import/GengjiazhuangFieldApproach/Script_BakeFieldApproachTerrain.mjs
node Taierzhuang1938/Script_SceneDocTest.mjs
node scripts/Script_LocalPreview.mjs 8127 --no-open
```

模型脚本可通过 `--batch-args` 接受 JSON 参数数组，传 `--source <路径>` 存源工程或传 `--review <目录>` 烘正交检查图。地形脚本默认只写高度图。需要重建初版布局与灯光时显式添加 `--seed-scene`，该开关会重写本场景的 JSON 和环境预设。
