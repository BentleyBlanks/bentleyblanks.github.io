# 从沟沿望向东侧战车道

- 本地场景编辑器使用 `/Taierzhuang1938/AdvancedTools/SceneEditor.html?scene=TanketteAdvanceEastTrack`。
- 编辑器的「查看原画机位」打开游戏渲染器 `/Taierzhuang1938/?tanketteAdvanceEastTrack=1&shot=1`。
- [场景文件](Scene_TanketteAdvanceEastTrack.json)保存固定相机、可编辑撤离沟样条、道具与局部烟源。[场景环境](Environment_TanketteAdvanceEastTrack.json)引用[阴云与浮尘预设](../../Environment/EnvPreset_TanketteAdvanceEastTrack.json)。

依据用户指定的 `06A_坦克车_沟沿看东侧战车道.png`。局部坐标的 −Z 是画面朝向。机位高程 1.41 米、俯角 5.4°、竖直视角 38°。近景用裁边断榆、横梁、灰木护壁框住下层撤离沟。伤员地标在担架处，右侧留照护位，横梁外留低姿观察位，沿沟向镜头后方撤离。中景两辆等尺寸九四式都在上层车道，离机位约 11.4 米与 21.7 米。

地表使用 `EastTrack` 分层材质。车辙和硬土走灰褐细粒土，沟壁走切土层，裸地间按稀疏簇状布置伏草、碎根和小土团。近处主横梁、下道横木、劈开的竖板与搭布护壁共用重烘的灰木材质。原画上空的明暗转成体积烟的消光深度，黑烟随三维密度场流动，两处近地烟源各有独立发散。车前、后车和远田另有贴地雾区。右侧扬土由地标发射短时细土、实体土块与尘体，土块参与地表碰撞。

担架、草席、单被、沙袋、弹药箱、远树、碎土和车复用游戏已有资产。两辆车是可移动和旋转的静态场景物件。固定机位用已有角色与救护动作库取样七个静态姿态，场景 JSON 的 `markers` 保存站位与朝向。沟道与木支护的尺寸、摆放及色调为场景设计。

## 模型预算

表中是实际交付 GLB 的单件三角面。屏占比取 1280×720 固定机位的可见宽幅。横梁和护壁导出为一个组件。

| 模型 | 可见宽幅 | 项目内同类实测 | 目标上限 | 交付实测 |
| --- | --- | --- | ---: | ---: |
| 裂口榆树干 | 约 14–16%，沿左缘裁切 | `LeaflessTreeOak` 47,998，`LeaflessTree01` 60,000 | 22,700 | 16,860 |
| 灰木沟壁支护 | 近处约 23%，远处一件更小 | `BattlefieldTimberBeam` 单梁 112，`BattlefieldTrenchEarthwork` 完整工事 14,928 | 3,200（搭布版 4,000） | 3,032（搭布版 3,752） |
| 九四式轻装甲车 | 近车约 16%，后车约 7% | 项目现有 `20261030CurrentWearV106-43969e24` | 沿用原件 | 78,716 × 2 |

两件模型各自用内置 ImageGen 生成 2110×745 正交三视图。断榆三视图要求厚干、短断叉和两处剥落，支护三视图要求厚横梁、错列立板和斜撑。补烘所用两张材质参考由内置 ImageGen 生成，实际输出各 1254×1254。车道提示词要求正投影扫描灰褐碾实粉土、细矿粒与稀疏根茎，木纹要求正投影扫描连续风化旧榆木，保留顺纹裂缝、灰化早材与嵌土。Reference、实机对照图和 Blender 源工程存于 OneDrive 的 `AI/Models/Blender/Taierzhuang1938/TanketteAdvanceEastTrack/`。

## 重建

从仓库根执行。

```powershell
python -X utf8 Taierzhuang1938/_import/TanketteAdvanceEastTrack/Script_BakeEastTrackMaterials.py
python -X utf8 Taierzhuang1938/_import/TanketteAdvanceEastTrack/Script_BakeEastTrackSmoke.py
node scripts/Script_BlenderMcp.mjs start --batch Taierzhuang1938/_import/TanketteAdvanceEastTrack/Script_BakeEastTrackModels.py --task TanketteAdvanceEastTrackBake
node Taierzhuang1938/_import/TanketteAdvanceEastTrack/Script_BakeEastTrackTerrain.mjs
node Taierzhuang1938/_import/TanketteAdvanceEastTrack/Script_BakeEastTrackTerrain.mjs --check
node scripts/Script_LocalPreview.mjs 8136 --no-open
```

模型脚本支持 `--batch-args` 传入含 `["--source", "<绝对路径>"]` 的 JSON 文件。当前 Blender 源工程是 `Source_TanketteAdvanceEastTrackShoring_20261123.blend`，含可编辑网格、已打包材质及三向正交相机。地形脚本默认只重建未挖沟的厘米制高度图，沟由游戏和编辑器读取样条时现场挖出。改沟应在编辑器调整控制点与断面。仅重置到种子布局时使用 `--seed-scene`，该开关会写回场景和环境 JSON。

烟体默认从仓库内的光学深度数据重建。要重新测量，可给烟体脚本传 `--reference` 指定原画，并用 `--clear` 传入关闭烟体后在同机位取得的底片。烟体的世界包围盒与机位参数须与场景文件对齐。
