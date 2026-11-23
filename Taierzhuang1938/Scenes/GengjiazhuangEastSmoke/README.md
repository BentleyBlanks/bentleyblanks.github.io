# 凹路尽头 · 望庄东

- 本机场景编辑器 `/Taierzhuang1938/AdvancedTools/SceneEditor.html?scene=GengjiazhuangEastSmoke`，可保存布设。「查看原画机位」打开游戏渲染器。
- 固定机位 `/Taierzhuang1938/?gengjiazhuangEastSmoke=1&shot=1`，静音。相机、铺盖、人物留位、烟源和道具见 [场景文件](Scene_GengjiazhuangEastSmoke.json)。光照走[场景环境](Environment_GengjiazhuangEastSmoke.json)和[烟尘阴天预设](../../Environment/EnvPreset_GengjiazhuangEastSmoke.json)。

取景依据 `07C_喘口气_凹路尽头望庄东.png`。用 Plate07C 判断观察方向，在独立米制场地里重定机位。相机位置 `[0, 1.45, 0]`，朝 −Z，俯 0.4°，竖直视角 43°。前景 3–11 米是沟沿、枯根、轻微车辙和裁入画面的撤运车。约 24–34 米是残茬田、低棚与枯树。院门在约 42 米，屋顶火点在约 50 米。黑烟从屋顶沿 +X 向右抬升，再散进更远的烟层。约 82 米的左远端三只驮驴和一层淡扬尘留下了驮队构图。

`CartPallet`、`RoadsideAid` 和 `PackTrain` 分别记录车板伤员位、沟沿蹲姿人员位和左远端队形范围。车上有草席、展开的单被、揉起的单被和绷带卷。场景只布置这些静置物件和站位。

## 模型与面数

按 GLB 三角图元计数。院墙预算参考沟底包扎场景的残墙（2,664 面）与城墙缺口单侧断肩（1,272 面）。院门在机位里约占 14% 画宽，需要容纳两段断壁、门框和瓦檐。残茬预算参考项目的沟沿干草（560 面），单株较细，以折断的高度和根部接地为主。

| 新建模型 | 目标上限 | GLB 实测 |
| --- | ---: | ---: |
| 破损院墙与门洞 | 4,000 | 3,814 |
| 折断的玉米残茬 | 520 | 482 |

主要复用件的单件面数如下。木车和单被沿用原 GLB，单被团使用原有 `Crumpled` 形态。

| 场景用途 | 单件三角面 |
| --- | ---: |
| 撤运木车 | 10,140 |
| 单被（各形态） | 12,880 |
| 草席、绷带卷 | 1,992 / 992 |
| 灰瓦农舍、旧矮墙 | 7,428 / 2,664 |
| 田间覆土棚、裂口木柱 | 17,526 / 650 |
| 低棚沙袋、柳条篮 | 572 / 4,500 |
| 近处枯榆、远处细榆 | 10,554 / 4,312 |
| 驮驴、干草、土块 | 5,042 / 560 / 156 |

## 烟雾与地表

屋脊的火点与烟场各自定位。烟场使用带风切和扰动的三维体素序列。烘焙时按 07C 的天空明暗约束两层烟的光学厚度，火口仍由世界空间的烟核塑形。三层贴地雾分别覆盖田边、村前与左远端，会按真实场景深度遮挡。固定镜头验收使用高画质。

独立地面材质集 `EastSmokeField` 采用两张内置 ImageGen 俯视材质源图。沟沿源图以实土裂层和碎土团为主，田地源图以灰褐土和散落的折断秸秆为主。两套运行时底色为 1024²，法线和 Orh 为 512²。高度图按 0.25 米采样，沟沿土石、草根及较高的残茬另有可编辑的道具布设。

## 重建与审片

源码工程在 `C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/GengjiazhuangEastSmoke`。`Source_GengjiazhuangEastSmoke.blend` 存院墙，`Source_EastSmokeMaizeStubble.blend` 存残茬。两份工程各带正交相机和已打包的三视图。内置 ImageGen 的三视图原件和两张俯视土壤源图位于 `Reference`，`Review` 保留模型正交检查图和 1280×720 游戏机位的多轮原画对照。

从仓库根执行。模型脚本重建实际使用的 GLB。地形脚本只重建厘米制高度图。

```powershell
node scripts/Script_BlenderMcp.mjs start --batch Taierzhuang1938/_import/GengjiazhuangEastSmoke/Script_BakeCourtyardGate.py --task GengjiazhuangEastSmokeBake
node scripts/Script_BlenderMcp.mjs start --batch Taierzhuang1938/_import/GengjiazhuangEastSmoke/Script_BakeMaizeStubble.py --task EastSmokeMaizeStubbleBake
python Taierzhuang1938/_import/GengjiazhuangEastSmoke/Script_BakeEastSmokeMaterials.py
python Taierzhuang1938/_import/GengjiazhuangEastSmoke/Script_BakeEastSmokeBank.py
node Taierzhuang1938/_import/GengjiazhuangEastSmoke/Script_BakeEastSmokeTerrain.mjs
node Taierzhuang1938/_import/GengjiazhuangEastSmoke/Script_BakeEastSmokeTerrain.mjs --check
node scripts/Script_LocalPreview.mjs 8135 --no-open
```
