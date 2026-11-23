# 场景文件与资产引用（2026-10-31）

用户 2026-10-31 拍板：场景像 Unity 的 scene 一样，**只存「用哪个资产、摆在哪、朝哪、多大、有哪些开关」的引用列表**；白盒不是画质档，是一个长得像白盒的场景。白盒编辑器预演 / 试玩加载白盒场景，以后的正式场景是另一个独立场景，互不影响。

本文是格式与接口的唯一口径。代码：`Data_SceneAssets.mjs`（资产目录）、`Script_SceneDoc.mjs`（格式、校验、高度图、按范围取一块，纯）、`Script_SceneNode.mjs`（node 读文件）、`Script_SceneImportBlockout.mjs`（一次性转换，留着从 git 历史重放）。

## 1. 文件

```
Taierzhuang1938/Scenes/<Id>/Scene_<Id>.json         场景：物件引用列表 + 地面涂色 + 远景设置 + 设计标注
Taierzhuang1938/Scenes/<Id>/Scene_<Id>.height.bin   高度图：int16 小端、厘米，(cols+1)×(rows+1) 个格点，heights[iz*(cols+1)+ix]；沟没挖之前的地面（§9）
Taierzhuang1938/Scenes/<Id>/Scene_<Id>.trench.bin   有壕沟时：挖沟基准面，几块 1 m 格依次排（§9）
Taierzhuang1938/Scenes/<Id>/Environment_<Id>.json   场景的环境：昼夜时钟默认值 + 区域列表（区域引用 Environment/EnvPreset_*.json），见 docs/Data_Environment.md
```

- 现有场景（清单 `Data_SceneAssets.SCENE_LIST`，场景编辑器的下拉、存盘口都认这张表）：
  - `FirstLevelWhitebox`（第一关新剧本 01–18 的白盒，三段合一，见 §5）：白盒编辑器的编辑与预演跑它；
  - `FirstLevel`（第一关正式场景，2026-11-01，见 §8）：白盒编辑器的试玩跑它，之后单独打磨细节。
  - `DugoutAidOpenFields` 是独立环境「沟底包扎 · 朝田野敞开的木棚」。在场景编辑器里选它，点「查看原画机位」就会用游戏渲染器加载保存的机位。详见[场景说明](../Scenes/DugoutAidOpenFields/README.md)。
  - `AircraftEvacuationDitch` 是独立环境「凹路撤运 · 沟底仰视三机」。在场景编辑器里可调整远机、撤离道具和沟岸布设，点「查看原画机位」进入固定机位。详见[场景说明](../Scenes/AircraftEvacuationDitch/README.md)。
- **场景文件就是这个场景的唯一真相**：人、agent、以后的场景编辑器都直接改它；没有生成器在后面覆盖。改完跑 `node Taierzhuang1938/Script_EditorBlockoutCli.mjs validate all`。
- JSON 一律 LF（`.gitattributes`），大数组一行一项，方便按 id grep 与 diff。

## 2. 格式（`tengxian-scene/1`）

```json
{
  "schema": "tengxian-scene/1",
  "id": "FirstLevelWhitebox",
  "title": "第一关 · 白盒（01–18 新剧本）",
  "source": { "importedFrom": […], "importer": "…", "importedAt": "ISO", "notes": "…" },
  "bounds": { "minX": -160, "maxX": 320, "minZ": -480, "maxZ": 980 },
  "spawn": { "x": 66.5, "z": 64.2, "yawDeg": 90 },
  "camera": { "position": [0, 1.36, 0], "yawDeg": 0, "pitchDeg": -4.52, "fovDeg": 42 },
  "terrain": { "file": "Scene_FirstLevelWhitebox.height.bin", "encoding": "int16-cm-le", "minX": -160, "minZ": -480, "cellM": 0.5, "cols": 960, "rows": 2920 },
  "look": { "heightTint": { "lo": -2.68, "hi": 3.85 }, "colorSemantics": ["foliage", …], "semanticColors": { "roof": "#4d473c", … } },
  "backdrop": { "far": 7000, "ground": {…}, "haze": {…}, "siteBounds": {…}, "paint": [ … ] },
  "paint": [ { "id": "Cleared", "color": "#7d8360", "poly": [ … ] }, … ],
  "ways": { "roads": [ [ {"x":…, "z":…}, … ] ], "trenches": [ … ] },
  "trenches": { "seed": "…", "earthProfile": "compact", "datum": {…}, "noBerm": [ … ], "segments": [ { "id": "FrontMid", "preset": "fire", "points": [[-18, 2.4], …], "look": "bare" }, … ] },
  "markers": [ { "id": "LmDugout", "name": "防炮洞", "kind": "pit", "x": 66.5, "z": 64.5, … } ],
  "objects": [
    { "id": "ParapetWest", "asset": "Whitebox/Box", "material": "Whitebox/EarthDark",
      "pos": [-3, -0.04, -10.6], "size": [3, 0.8, 1.4], "noClimb": true, "cover": { "faceX": 0, "faceZ": -1 }, "group": "01–05" },
    { "id": "ParapetMiddle", "asset": "Whitebox/Box", "material": "Whitebox/EarthDark",
      "pos": [0, -0.08, -10.6], "size": [3, 0.8, 1.4], "hideOn": "PitShelled", "group": "01–05" },
    { "id": "BdLoneTree01", "asset": "Backdrop/Tree", "pos": [-240, null, -560], "layer": "backdrop", "group": "远景", "params": { "h": 12 } }
  ]
}
```

坐标同全项目：X 向东、Z 向南、Y 向上，单位为米。独立场景可用 `camera` 保存摄影机的 `position: [x, y, z]`、`yawDeg`、`pitchDeg`、垂直视场角 `fovDeg`，以及可选的近景对焦距离 `nearFocusM` 和独立渲染机位的暗角强度 `vignette`（0 到 1）。正式场景可设 `look.proceduralDressing: false`，由场景物件提供植被和零散土石。`look.terrainLayers` 可选择 `Data_Tuning_Terrain.TERRAIN_SETS` 中的四层地面材质，游戏与场景编辑器共用该选择，省略时使用 `MissionPlain`。

注册表的 `previewParam` 让场景编辑器打开对应项目渲染入口。`look.groundPaintCellM` 可细化地表涂色采样。
各 `paint` 项可用 `tint` 设置正式地表的反照率倍率，支持六位 Hex 或 0–2 的三个 sRGB 倍率。
显式标高的道具可用 `params.grounding: "authored"` 控制贴地。独立预览的 `smokeColumns` 复用游戏的烟源，`heightOffset` 相对于烟源下方的采样地面。

场景可在 `smokeColumns[].options.backdrop.volume` 提供已登记的 TVOL 资产 `asset`、三轴全尺寸 `bounds`、消光系数 `density` 和播放倍率 `speed`。`backdrop` 还需要 `seed`、`life`，可用绝对米制坐标 `ignition` 设烟场锚点。明火可通过 `options.firePosition` 单独定位。

独立预览可用 `fogVolumes` 登记贴地雾。每条写 `shape`（`sphere` 或 `box`）、世界坐标 `position`、三轴半尺寸 `size`、消光 `density`、反照率 `albedo` 和可选的边缘衰减 `falloff`。支持体积雾的画质档将它们注入游戏雾系统。

一个物件：

| 字段 | 写什么 |
| --- | --- |
| `id` | 场景内唯一 |
| `asset` | 资产编号，必须在 `Data_SceneAssets.SCENE_ASSETS` 里（见 §3） |
| `material` | 材质编号，`SCENE_MATERIALS` 里的；`Whitebox/Box` 必填 |
| `pos` | `[x, y, z]`：底面中心。**`y` 写 `null` = 落地**（载入时落在脚印中心与四角里最低的地面上，地形改了它跟着走） |
| `yawDeg` | 绕竖轴的角度（同 three 的 rotation.y；0 = 正面朝北，+90 = 朝西）；不写 = 0 |
| `size` | `[w, h, d]`（米），可缩放的资产必填 |
| `solid` / `visual` | 不写 = 挡 / 看得见；`false` 关掉 |
| `noClimb` / `standOn` / `tag` / `cover` | 同白盒场景的块（`tag: "airWall"` 只挡玩家；`noClimb` 不能翻；`standOn` 演员能站顶面；`cover` 掩体朝向） |
| `hideOn` / `showOn` | 剧情事件（代码里叫信号）：这件事发生了就消失 / 发生了才出现；两个都写 = 先出现、后消失。名字与中文名在 `Data_SceneEvents.SCENE_EVENTS`（例：`BridgeBlown` 桥炸了，18-6 起），哪一刻发生由白盒编辑器那一关关键帧的 `signals` 决定；场景里用到的都要有中文名（`Script_SceneDocTest`） |
| `layer` | 只有远景资产写 `"backdrop"`（只看不走：不碰撞、不进寻路） |
| `group` | 层级路径，「/」分层，像 Unity 的父子层级：`06–10/建筑/WN1`、`01–05/道具/弹药箱`、`11–18/空气墙`、`远景/村 C`。2026-11-01 由 `Script_SceneGroupHierarchy.mjs` 一次性归类（段落 / 类别 / 院子或种类；类别有建筑、街巷墙、道具、树木草丛、水、铁路、工事、空气墙、其他），之后在场景编辑器里拖动或改「分组」 |
| `params` | 资产自己的参数（远景树冠的 `rx` / `rz`、颜色……） |
| `meta` | 其余原样带过去的字段（`prop`、`loophole`、`window`…… 预演与测试读） |

其他节：`trenches` 是样条壕沟网络（§9，读场景时按它挖地面）；`ways.trenches` 只剩不归网络管的几条中线（06–10 的排水沟、反坦克沟……，给俯视图与地面涂色），网络里的沟中线读场景时现取；`markers` 是设计标注（白盒编辑器的地标，格式同 docs/Data_EditorBlockout.md §2.2 landmarks），不是物件；`paint` / `backdrop.paint` / `ways` 同白盒场景；`look` 是这个场景的样子（高度色带、保留语义色的几种块、改块色）；`backdrop.siteBounds` 是远景层围着的那片场地（按范围取一块时，取到这片的中心才带远景层）。

## 3. 资产与材质只写编号

`Data_SceneAssets.mjs`：`SCENE_ASSETS`（资产）与 `SCENE_MATERIALS`（材质）。场景里只写编号，编号 → 是什么、怎么画、在哪个文件查这张表；改文件名、换模型只改这张表一行。**编号被场景用上以后不改名**（Unity 的场景存 GUID 不存路径，同一个道理）。

现有资产：`Whitebox/Box`（米制长方体，两个场景都用）、`Prop/<模型>`（外部道具，22 种，`model` 是 `Script_ExternalProps` 的 id，带缺省尺寸）、`Tree/Dead` / `Tree/Cypress`（树）、`Backdrop/Box|Blob|Hill|Tree`（远景层）。资产的 `kind`：box 样子看材质；prop 按 size 那只盒子缩放摆模型、碰撞仍是那只盒子、`semantic` 是弹着表面；tree 由白盒编辑器的树种植挑模型、size 是树干碰撞盒。

材质：只有 `Whitebox/<语义>`（EarthDark、Plaster、Timber、Roof……，两个场景的体块都用，灰面 + 米格线），语义决定建场用哪个材质槽，颜色在 `look.semanticColors` 与第一关语义色表。体块没有贴图外观——用户 2026-11-01：房子、墙这些体块「不算正式资产，你不要自己造出来」，等有正式的房子模型再换资产。场景编辑器按场景的样子列资产（`SceneAssetsFor`：白盒 = 体块 + 远景，正式 = 体块、道具、树 + 远景）。

## 4. 白盒编辑器怎么用场景

`Script_EditorBlockoutLevels.BLOCKOUT_LEVELS` 里第一关新剧本三段的 `scene` 是 `{ kind: "scene", url, region, priorSignals, objectMarginM, heightTint? }`：

- `Prepare()` 读场景 JSON 与高度图，`BlockoutSliceDoc(level, scene, heights)` → `Script_SceneDoc.BlockoutDocFromScene` 按 `region` 取一块，转成白盒场景形状（`tengxian-blockout-scene/1`，terrain 直接带解好的 `heights`），再走原来的 `LayoutFromSceneDoc`。**建场、渲染、物理一行没改。**
- `region` = 这一段原来的场地范围（01–05 `x −110…320, z −480…200`；06–10 `x −20…320, z 120…560`；11–18 `x −160…320, z 480…1080`，2026-11-02 第四版加长），地形按格点裁，玩家走不出去。物件取到范围外 `objectMarginM`（缺省 1 m：贴边的空气墙；11–18 是 64 m，站在场地边看得见的村子带上）。
- `priorSignals`：前面段落出现过的信号都当已经发生——06–10 带 01–05 的三个 + `Stage0105Done`，11–18 带 01–05 与 06–10 的全部（`Script_SceneDocTest` 拿各段配置核对）。`hideOn` 它的物件直接不要，`showOn` 它的物件已经出现。
- `futureSignals`：这一段里不会发生的信号（01–05 的 `Stage0105Done`）——`hideOn` 它的物件当常驻块，`showOn` 它的不要。随信号的块在建场里是一个一个单独的模型、不合批，1207 段空气墙不能那样建。
- `heightTint: null` = 这一块按自己的最低 / 最高定色带（06–10、11–18 原来就是这样）。
- 总控读地标时取 `markers` 里落在 `region` 的；「编辑布设」导出的路径写 `objects[i]` / `markers[i]`。
- node 里：`Script_SceneNode.ReadBlockoutSceneDocSync(levelKey)` 给出同样的那一块（生成器的摆位检查、场景 / 关键帧 / 预演测试都读它）。

## 5. 2026-10-31 三段合一的记录

`Script_SceneImportBlockout.mjs` 把 `Blockout/FirstLevel0105|0610|1218.scene.json`（合并前一刻由生成器重烘过 1218：那份文件停在 10-26，没跟上 06–10 今天开的窗、空心门房）合成 `Scenes/FirstLevelWhitebox`，然后三份旧文件删掉、`scene <Level>` 对这三段报「生成器已退休」。规矩：

- 地形拼成 960×2920 格（0.5 m）。重叠带按中线切开：z < 160 归 01–05，160…520 归 06–10，其余归 11–18。旧文件互相不一致的格点只在各自外边缘（z 198–200 差到 1.23 m、558–560 差 4 cm），中线两边逐点等于原文件。没人覆盖的角落取本带那段的边缘往外延。
- 物件按 id 合并：一模一样的合成一个；同 id 但相距 > 20 m 是重名的不同物件，后来的改名（`WaterVat_B1` → 06–10 那只叫 `WaterVat_B1_0610`）；同一物件几份不一样时，随信号的版本胜过 11–18 抄成常驻块（`from0610`）的版本，其余取所在那一带的段落的（实际只差 1 cm 取整）。01–05 南边界上封凹路口的空气墙 `KeepIn_0536` 去掉（三段连通）；01–05 那圈「玩家出不了沟」的空气墙（`KeepIn_*`，1207 段）加 `hideOn: "Stage0105Done"`——这个信号关键帧里不写，只在 06–10 / 11–18 的 `priorSignals` 里，所以后两段没有这圈墙（06–10 预演里妮儿原来正好走过它）。
- 地标同物件（`LmMainStreet` / `LmRiver` / `LmPostRoad` 的 11–18 那个改名带 `_1218`）；涂色、路与沟按顺序拼；远景层只有 01–05 有，1381 个远景物件进 `objects`（`layer: "backdrop"`）。
- 结果：3428 个物件 + 1381 个远景物件、239 个地标、200 项涂色；JSON 1.2 MB + 高度图 5.6 MB（原三份 JSON 共 9 MB）。三段各自取出来的那一块与旧文件对比：旧物件一个不少、位置尺寸逐位不变；多出来的是邻段落在重叠带里的东西（06–10 那一块多了 01–05 在 z 120–200 的 200 来件，11–18 多了村子边上的 400 来件）。
- 场景测试（`EditorBlockoutFirstLevel{0105,0610,1218}SceneTest`）改查场景取出来的那一块：设计约束（视线、唯一通路、高度、桥、窗）照旧全查；去掉「生成两次逐字相同」与和邻段文件的比对；数路、查旧版残留只算本段场地里的。

## 6. 场景编辑器（2026-10-31）

入口：高级工具 → 场景 → 「场景编辑器」（`Script_EditorSceneEntry`，同贴图管理开独立窗口），或直接打开 `SceneEditor.html?scene=FirstLevelWhitebox`。不起游戏，自己一个轻量三维视图。

- **页面**：`SceneEditor.html` 开机先同步读 `index.html` 里的 import map 插进来（线上发布的 index.html 也保留它），模块版本永远跟游戏同一套戳，不另抄。主程序 `Script_SceneEditor.mjs`，数据层 `Script_SceneEditModel.mjs`（纯，带撤销），样式 `Style_SceneEditor.css`（同设置页口径）。
- **画法**：白盒场景的地形按高度色带 + 地面涂色 + 米格线（`Script_WhiteboxGrid`，与游戏白盒同一段着色）；正式场景的地形同试玩那份分层地表（MissionPlain 四层贴图，权重 `BuildSceneGroundSurface`，读不到贴图就退回色带并在状态栏说）；网格太密时按步长抽稀（不超过约 90 万个顶点）；白盒体块按材质分批实例化、颜色取 `look.semanticColors` 与第一关语义色表；远景层画成盒子 / 椭球 / 锥（可关）；`visual: false` 的空气墙勾「空气墙」才画（半透明红）。画面上方「剧情事件」里勾上的当已经发生（随它消失的藏、随它出现的显示），每个事件显示中文名与第一次发生的关键帧。段落按钮跳到三段各自的场地。
- **操作**：右键按住转视角、WASD 移动、Q/E 降升、Shift 加速、滚轮前后、中键平移；左键点选（Ctrl 多选、Shift 加选，层级里同样），拖红绿蓝箭头沿 X/Y/Z 挪、拖金圈绕竖轴转、按住已选中的物件直接在水平面上拖；Ctrl 吸附 0.5 m / 15°；F 看选中、Del 删除、Ctrl+D 复制、Ctrl+Z / Ctrl+Y 撤销重做、Esc 取消拖动。落地的物件被竖着挪就不再落地。**层级**（2026-11-01）：按 `group` 路径一层层文件夹，单击展开 / 收起（记在本机），双击选中文件夹里全部，把物件拖到文件夹上 = 挪进那个分组；物件行前的小图标分体块（语义色）/ 道具 ◆ / 树 ♣ / 空气墙 ▢，跟剧情事件走的带 ⚑；画面里点选会展开到它、滚到它。
- **检视**：实例卡显示可见性、名称、Prefab 来源和分组。组件独立成卡，可展开或收起，折叠状态记在本机。变换卡保留 X / Y / Z 拖拽调值（Shift 十倍），外观卡提供材质，碰撞卡头勾选控制挡人。剧情事件、参数和附加数据按需展开。
- **资产**：按构件、道具、植被和远景浏览 Prefab，可按名称、编号或类别搜索。拖到视图地面时先看放置预览，松手创建默认实例并选中，可一步撤销。也可选中资产后点「放到中心」。放置后的材质、尺寸、分组与壕沟套餐在检视里调整。视口右下角的「操作键」可展开快捷键。
- **存盘**：本机预览（`node scripts/Script_LocalPreview.mjs`）下 `POST /__scene/save { scene, doc, revision }` 直接写回场景文件；闸同 `/__blockout/save`（本机 Host、同源、JSON、版本号 = 读场景时原始字节的 sha1，对不上 409 + 当前版本号），过 `ValidateScene` 才按 `FormatSceneJson` 原子写；`GET /__scene/status` 报能不能写与版本号。线上（Pages）没有这个口，「保存」退化成下载，换掉 `Scenes/` 里那份再提交。高度图 v1 不开放写。
- **同步**：每 2 s 查一次版本号。外面（人 / agent / 别的窗口）改了场景文件：这边没改动就自动重读（相机、选中保留）；有没保存的改动就挂横幅，让人选重新读取还是先不管。存盘遇到 409 同样挂横幅，可下载自己的版本。
- **接白盒编辑器**：「在白盒编辑器里看」按画面中心的地面点找它落在哪一段，打开 `index.html?editor=blockout&level=<那一段>&pose=x,z,朝向,0,stand`。白盒编辑器每 2 s 也会发现场景文件变了、整片重建。
- **壕沟**（2026-11-01，§9）：
  - **层级与选中**：每段沟一行（〰，挂在它的 `group` 下，缺省「壕沟」）；画面里点在沟里（沟沿弃土也算）就选中那段沟。
  - **改走向**：选中后，金色控制点按住能拖（Ctrl 吸附半米）；Alt + 点地面，在最近的那一截加点；Del 删选中的点，没选点就删整段。
  - **重挖**：松手后，按样条重挖改动的那一块地面。只改套餐、细节不重挖，只重摆构件。
  - **检视**：
    - 走向：选中点的 X / Z、加点、删点、掉头；
    - 断面：沟型 + 段上改的数，空着用沟型的；
    - 表现套餐；
    - 每一项细节：标题条上的勾 = 开关，展开改参数，灰字是缺省值，● = 段上改过；
    - 沿沟深度 / 基准面抬降 / 塌方（JSON）。
  - **新建**：从资产页拖入「样条壕沟」，沿当前视线方向生成一段两点的新沟。
  - **预览**：构件（护壁、踏板、射击位、杂物）照游戏那份摆成半透明盒子；土崖、土团、草根这些土面细节只在游戏里画。
- **给 agent / 测试**：`window.SceneEditor`（`State()`、`Select(ids)`、`MoveBy(dx, dy, dz)`、`RotateBy(deg)`、`SetField(key, value)`、`Add(asset, opts)`、`Duplicate()`、`Delete()`、`Undo()`、`Redo()`、`Save()`、`Reload()`、`Doc()`、`PixelStats()`、`Signals(list)`、`Show({ backdrop, hidden })`、`TerrainReady()`、`Tree()`、`Open(paths)`；壕沟：`Trench(id)`、`SelectTrench(id, point)`、`MoveTrenchPoint(id, i, x, z)`、`SetTrenchField(id, key, value)`、`SetTrenchDetail(id, key, value)`、`AddTrench(opts)`、`HeightAt(x, z)`（挖好的 / 没挖的）、`ProjectTrenchPoint(id, i)`）。
- 门禁：`Script_SceneEditModelTest`（纯 node：移动 / 转 / 改字段 / 加删复制改名 / 撤销顺序 / 存盘判定，真场景改一圈撤到底逐字相同）、`Script_SceneSaveTest`（真起本地预览：写成什么样、409 与各种拒绝都不落盘）、`Script_SceneEditorBrowserTest`（真浏览器：数像素证明画出来了、拖箭头、点选、Esc 取消、加删撤销、信号、保存 / 409、外部改动自动重读；存盘口在页面里拦截，不写仓库文件）。

## 7. 还没做的

- ~~去掉「白盒」画质档~~（2026-10-31 已做）：`GRAPHICS_PROFILES` 只剩 low / medium / high / ultra，白盒编辑器走正常渲染管线，灰表面 + 米格线是白盒材质本身的样子（`Script_WhiteboxMaterial`、`Data_Tuning_WhiteboxMaterial`；场景里的 `Whitebox/*` 材质按语义映射到它，`DressWorld` 装上）。~~光照写进场景还没做~~（2026-11-02 已做）：场景的天光由同目录的 `Environment_<Id>.json`（区域）+ `Environment/EnvPreset_<Id>.json`（预设）出，见 [环境系统](Data_Environment.md)；`BLOCKOUT_EDITOR_FILL` 补光照旧乘在上面。
- ~~外部道具与 PBR 材质进目录~~（2026-11-01 已做，§8）；构件库可布设清单（`Script_PlaceableCatalog`）还没进；场景编辑器里的地形刷子、地面涂色、框选；高度图存盘。
- 壕沟：
  - 场景编辑器改一次地形约 1.3 s：整张地面重画，正式场景还要重算分层权重；只重画改动的那一块还没做。
  - 01–05 沟沿那一圈空气墙（`KeepIn_*`）是按原来的沟烘的物件，沟挪了它不跟着走。
  - 积水 / 湿泥是全关的水位模型，不能按段开关。
- 正式场景的房子、墙、工事还是白盒体块（灰面 + 米格线），等做了正式的房子 / 构件模型再换成资产；场景编辑器里道具、树画成盒子 / 锥，不是真模型。

## 8. 第一关正式场景（2026-11-01）

用户 2026-11-01：场景编辑器里两个场景——白盒版第一关，和「相对正式也会不断打磨细节的正式场景」；**白盒预演都在白盒版上做，试玩在正式场景上做**；正式场景「用现在第一关（已经上线在章节里可选的）的场景设计标准，把已经有的资产、布设给做进去」。

- **布局照白盒复制**：`Script_SceneForkFormal.mjs`（一次性转换，留着重放 / 对照）把 `FirstLevelWhitebox` 复制成 `Scenes/FirstLevel/Scene_FirstLevel.json` + 同一份高度图。位置、尺寸、碰撞、信号、分组、地标、涂色、路与沟一个不动——试玩编排（`Blockout/<Level>.play.json`）与关键帧的坐标都在这套布局上。**转完以后正式场景就是它自己的唯一真相**，单独打磨，不再跟白盒同步（白盒改了布局要不要搬过来，按需手搬）。
- **有正式资产的换成正式的，没有的留白盒**（用户 2026-11-01：村子里的房子「还是暂时用白盒网格纹理……因为他不算正式资产，你不要自己造出来；地形以及匹配的构件什么的可以用正式的」）：
  - 体块（房子、墙、屋顶、工事、水、空气墙、苇丛、鹿砦……）原样留 `Whitebox/Box` + `Whitebox/*`，和白盒场景逐个一样，画灰面 + 米格线、保留语义色同白盒（`look.colorSemantics`）。（第一版 1cd14eb99 给体块挑过现行第一关的 PBR 外观，当天撤了。）
  - 有现成外部模型的道具盒（`meta.prop`）→ `Prop/<模型>`（对照表 `PROP_TO_ASSET`：弹药箱、手榴弹箱、木箱、水缸、井台、磨盘、草垛、草席、柴堆、枕木堆、树枝、沙袋、碎砖堆、桌凳、马灯、车轮、麻袋、绷带），194 件；建场时盒子不画、碰撞照旧，模型按盒子缩放与落地（同现行第一关的替换表 `PlanPropDressing`，`params.tile` 一只长盒子里排几件）。
  - 细高的植物块与 `meta.prop` Tree / Cypress → `Tree/Dead` / `Tree/Cypress`（228 棵，白盒编辑器照旧种枯树模型）。苇丛、草丛体块是植物语义，正式场景的植被照旧在原位长成苇子 / 草卡片；水同白盒编辑器铺浑水面。
  - 地面：分层 PBR 土（`MissionPlain` 四层：底土 / 车道 / 草茬 / 翻土），权重不写进物件，建场时算（`Script_EditorBlockoutLevels.BuildSceneGroundSurface`，数在 `Data_SceneGroundLayers`）：涂色按 id 归层（路面、院场 → 车道；旧壕、坟头、沟里的沙、河床 → 翻土；阵地前清过的地 → 底土；田、田埂与没涂的地方 → 草茬），路的折线（`ways.roads`）踩实成车道，沟的折线（`ways.trenches`）与陡坡（坡度 0.55 起）是翻土。
  - 现行第一关的枯草丛与碎砖瓦也撒：`Data_FirstLevelVegetation.SceneDressingContext` 把撒点的「路线」换成场景的路与沟、锚点换成出生点，没有旧关卡的河与弹坑表；规则 `SCENE_VEGETATION`（去掉按旧坐标挖的空圈、`Reed_` 也按苇子长）。三段各 7–9 万丛草、碎砖瓦 10 / 1130 / 1444 块。
- **建场**：`BlockoutDocFromScene` 带出 `style: "formal"`，物件带 `propModel` / `sceneTree`；`LayoutFromSceneDoc` 对正式场景不开 `materialLooks`、地面挂 `terrainLayers: "MissionPlain"` 与 `SampleGroundSurface`、列 `sceneProps`；`FirstLevelWhiteboxField` 摆道具模型与碎砖瓦（`AddScenePropModels`）、植被按场景撒；白盒编辑器 `DressWorld` 对正式场景不碰地面（分层地表），只把体块的语义材质（`semanticColors` 那几份 + `Whitebox`）改成灰面 + 米格线、铺水面——道具、碎砖瓦、地表的材质不动。
- **白盒编辑器怎么切**：关卡注册表的 `scene.playUrl` 是正式场景；phase 的 `blockout.variant`（edit / play）决定建哪个。试玩「开打」先整片重建成正式场景（`UseSceneVariant("play")`，无头浏览器约 18–25 s），关小结「回到编辑」换回白盒；换关回到白盒。地址栏 `scene=FirstLevel` 进关后直接换成正式场景（试玩中刷新、场景编辑器「在白盒编辑器里看（正式场景）」都走这条）。`Debug.Blockout.Play.Scene()` / `UseScene(variant)` 给测试与 agent。
- **场景编辑器**：下拉里两个场景（显示标题）；正式场景的资产页列白盒体块、道具、树与远景，材质下拉两个场景一样是 `Whitebox/*`；道具画成按语义色提亮的盒子、树画成锥。
- 门禁：`Script_SceneFormalTest`（纯 node）、`Script_SceneFormalBrowserTest`（真浏览器：白盒 / 正式互换、体块仍是米格线且道具材质没被刷白、分层地表、道具全摆上、体块数同白盒、试玩换正式 / 回编辑换白盒、06–10 / 11–18 建得起来、场景编辑器两个场景）。截图 `_shots/SceneFormal/`。

## 8.1 11–18 第四版重建（2026-11-02）

集成负责人 11-02 的《FirstLevel1218 白盒第四版契约》（`tmp/Contract1218_v4.md`）把 11–18 整片换掉。做法是**可重跑的脚本** `Script_SceneRebuild1218.mjs`（一次性重建、可重放，同 Script_SceneForkFormal 的口径，不进 TestRunner）：读两份场景文件（`.json` / `.height.bin` / `.trench.bin`）→ 高度图往南加长到 z 1080（`bounds.maxZ`、`terrain.rows` 2920 → 3120）→ 删掉 z ≥ 556 的物件 / 地标 / 伸到 z > 556 的涂色、路、沟中线 → 按新锚点 `Data_EditorBlockoutFirstLevel1218Space` 生成（`Script_EditorBlockoutFirstLevel1218Scene.BuildFirstLevel1218Site`）、`Script_SceneImportBlockout.BlockToObject` 转物件、`Script_SceneGroupHierarchy.HierarchyPaths` 归层级、正式场景过 `FormalObject` → 写回。同一输入跑两次逐字相同（`source.importedAt` / `forkedAt` 原样留着）。

- z < 556 的格点与物件一个不动（0610 的耿家庄，含 group 是 `11–18/…` 但 z < 556 的借来的块）；只有 x < −20、z 480…556 这一条（0610 场地没盖到，合并时是往外延的边缘值 + 第三版 x −104 的路基）按 0610 的解析地面重算、叠第四版 x −80 的路基。
- 高度图仍是「沟没挖之前」的地面：村口反坦克沟烘进去（不归样条网络，中线在 `ways.trenches`）；村北沿战壕两段 `VillageNorthWest` / `VillageNorthEast` 换成第四版的点（契约 2.3），`depthAlong` 按基准面算到壕底 −0.9；基准面第二块重烘（x 30…222、z 641…668，1 m 格）、`.trench.bin` 重写；`noBerm` 里旧的 11–18 那一条换成板桥 / 官道那条线。
- 剧情事件（`Data_SceneEvents`）：新加 `GuandaoBridgeBlown`（13-2）、`DugoutBombed`（14-2）、`RaidAftermath`（15-1）；`ChargesSet` 改到 18-3 起；`FamilyHidden` 删了（场景里没有用它的物件了）。
- 结果：两个场景各 5144 个物件（11–18 南片 877 个：体块 762 + 随信号 115）、246 个地标、226 项涂色、28 段样条沟；正式场景的 11–18 换了 61 件道具、67 棵树。`Script_SceneDocTest` 里「随信号的块 < 80」放到 < 140。
- 再改 11–18 的空间：改锚点 → `node Taierzhuang1938/Script_SceneRebuild1218.mjs`（`--check` 只算不写）；别手改高度图。

## 9. 场景里的样条壕沟（2026-11-01）

用户 2026-11-01：「样条编辑器管不到场景……现在的白盒 / 场景编辑器里的壕沟不是 PCG 样条做的吗」「第一关的沟里那些细节能匹配壕沟的样条做 PCG 生成吗」。

- **原来**：01–05 的沟是退休生成器拿 `Script_TrenchPlan` 挖好、烘进高度图的，场景里只剩坑。
- **现在**：沟是场景里的样条，读场景时现挖；细节跟着样条生成，每段单独开关（[壕沟细节参数表](Data_TrenchDetails.md)）。

- **文件**：
  - `Scene_<Id>.height.bin` 存沟没挖之前的地面；
  - `trenches.segments` 是一段段样条沟；
  - `trenches.datum` 指向 `Scene_<Id>.trench.bin`：挖沟基准面，沟底 = 基准面 − 深度。

  基准面和地面分开存：地面上有坑、凹路、土包，沟穿过它们时沟底不该跟着落下去。样条拖出基准面的范围，就用地面当基准。
- **一段沟**的写法：

| 字段 | 写什么 |
|---|---|
| `id` | 网络内唯一（字母数字下划线） |
| `preset` | 沟型：`communication` 交通壕 / `fire` 射击壕 / `evacuation` 后送壕 / `loop` 回环 / `sap` 敌方掘壕（`Script_TrenchPlan.TRENCH_PRESETS`） |
| `points` | 控制点 `[[x, z], …]`，至少两个；拐角按 `cornerRadiusM` 倒圆 |
| `depth` / `floorW` / `bankW` / `bermH` / `bermW` / `bermSide` / `cornerRadiusM` / `jitterScale` / `widthScale` | 断面，不写用沟型的；`bermSide` 是弃土堆在哪侧（`plus` = 顺着点的方向右手、`minus` 左手、`both`、`none`） |
| `depthAlong` | `[[弧长 m, 深 m], …]`：沿沟变深浅，只改沟底，沟沿仍在原地面上 |
| `datumAlong` | `[[弧长 m, 抬高 m], …]`：整个断面连沟沿一起挪（坡道顺着坎切下去、桥下整体压低） |
| `collapses` | `[{ s, halfLenM, featherM, depthM }]`：塌方，弧长 s 前后那一截回填到只剩 `depthM` 深 |
| `look` / `details` | 表现套餐与每一项细节（[参数表](Data_TrenchDetails.md)） |
| `group` / `note` | 场景编辑器层级里放哪（缺省「壕沟」）/ 备注 |

- **网络级**（`trenches` 一节）：
  - `seed`：位置噪声的种子，接口处读同一个值；
  - `earthProfile`：断面档，`compact` = 照片 01/14 的压实手挖土，`null` = 老断面；
  - `look`：给所有段的套餐；
  - `propKinds`：沟底杂物缺省撒哪些 `Prop/*`；
  - `noBerm`：这些范围里不堆弃土，写成圆 `{ x, z, r }`、框 `{ minX, … }`，或带宽的线 `{ line: [[x, z(, 半宽)]…], halfW }`；
  - `noBermBelowM`：地面比基准面低这么多以上（坑、掩蔽部、龛）不堆弃土。
- **读场景**：三处都走 `Script_SceneTrenches.PrepareSceneTerrain`，得到挖好的整张高度图和编好的网络。
  - node：`Script_SceneNode.ReadSceneSync`；
  - 游戏：`Script_EditorBlockoutLevels` 的 `Prepare`；
  - 场景编辑器：`LoadScene`。

  `BlockoutDocFromScene` 只带过去跟这一块范围沾边的段（`SliceTrenchPlan`：01–05 那块 26 段、06–10 那块 1 段、11–18 那块 2 段），沟中线并进 `ways.trenches`。
- **建场**：
  - **构件**：`LayoutFromSceneDoc` 把构件（`SceneTrenchDressing` → `PlanTrenchDressing`）摆成体块，白盒、正式都有。
    - 手摆体块按 keepOut 让开，空气墙不算；
    - 杂物是 `Prop/*` 时，正式场景换模型。
  - **土面细节**：网络挂在 `layout.trenchPlan`。正式场景的 `FirstLevelWhiteboxField` 按它画土崖、土团、草根、碎石、干草（同现行第一关那套 `BuildTrenchEarth` / `BuildTrenchSurface`）。白盒场景只挖沟，不画土面细节。
  - **地表与植被**：分层地表的翻土层跟着实际沟沿走（`BuildSceneGroundSurface`），植被避开沟（`SceneDressingContext.trenchCorridor`）。
- **第一关两个场景**（`Script_SceneTrenchMigrate.mjs` 一次性转换，留着对照）：
  - **01–05 二十六段**：从 `L0105TrenchSpec` 原样搬过来，前沿、交通沟用 `bare`，旧阵地用 `abandoned`。生成器挖完沟后补的几刀改成了参数：
    - 交通沟板桥往南的坡道 → `datumAlong`；
    - 支沟口不许把交通沟挖深 → 支沟 `depthAlong`；
    - 旧交通沟塌的三截 → `collapses`；
    - 板桥两头路面、干沟沟底 → `noBerm`；
    - 弃土不进机枪坑 / 掩蔽部 → `noBermBelowM: 0.4`。
  - **11–18 村北沿战壕两段**：原来是方坑手挖，改成 `fire` + `scrape`，壕底仍落在原来的绝对高度（`depthAlong`）。
  - **现挖和原高度图比**：280 万格点里，差超过 10 cm 的 466 个，超过 25 cm 的 26 个，最大 0.6 m。差都在弃土垄的形状上：干沟北沿那一截、村北战壕的土垄起点。
- **改**：
  - 用场景编辑器（§6）；
  - 或直接改 JSON：改完跑 `node Taierzhuang1938/Script_SceneDocTest.mjs`，开着的场景编辑器 2 s 内重读重挖。

  高级工具里的「场景样条PCG」壕沟档，仍然只改现行第一关那份网络（`Data_FirstLevelMissionTrenches`）。
- **门禁**：
  - `Script_TrenchPlanTest`：细节的三层取值，`depthAlong` / `datumAlong` / 塌方 / 不堆土区；
  - `Script_SceneDocTest`：白盒 50 段 / 正式场景 28 段、挖前挖后、套餐解析、校验报错、按段取的段数；
  - `Script_SceneEditModelTest`：壕沟编辑与撤销；
  - `Script_SceneFormalBrowserTest`：白盒带网络但不画细节；正式场景画土面细节；编辑器拖点重挖、撤销、换套餐摆构件。

### 集结处沟网（2026-11-15）

白盒 `AssemblyWestLink` 从西邻班 `Traffic2` 的末段接入干沟西口，净沟底宽 3.8 m；沿沟基准面让沟底由约 −0.24 m 缓降到 −1 m，不修改高度图。只拆除新通道穿过的旧 `KeepIn_*` 空气墙，不改其他边界。田路由 `AssemblyWestRoadBridge` 跨过联络沟，桥下站立净空超过 2 m，桥两端接原路面，人员不必爬出壕沟横穿车道。

集结处按用途分开：北口接本班交通沟，西口接西邻班，中央保留人员集结和伤员转运，南口通凹路负责伤员、弹药装运，东侧宽湾为封闭待命区而非另一个出口。原剧情坐标、南侧路线与正式场景保持不变。Encounter Designer 的 2D 与 3D 共用场景联络沟和入口地标；`Script_SceneDocTest` 检查全程沟底、通行宽度、旧墙障碍、桥下净空和桥头落地。

### 河汊子两头收尾（2026-11-17）

河汊子（0610 的弯河）原来头尾都是一刀切：z 196 的沟头在麦地里直接露出 3 m 深的沟口，z 574 的沟尾 8 m 内从沟底拉回平地。三份场景（`FirstLevelWhitebox` / `FirstLevel` / `FirstLevelEncounter`）的高度图和水块一起改了，改法是在原高度图上就地重挖，没有生成器：

- **沟头**：中线往北接长 24 m（`(34.8,172) → (33.4,184) → (30,196)`），水面半宽 0.9 → 2.6，深度从 z 170 起 44 m 渐浅到平地（z 214 满深）；断面是碗形，两边先浅、中间后深，水线在 z≈197 收成一个舌头。新水块 `RiverWater_1_00`，沟头浅洼里补 5 丛苇子（`Reed_HechaHead_*`），地标 `LmHechaHead`（河汊子沟头）。北边集结处干沟不相连。
- **沟尾**：z 561 起 22 m 渐浅（原来 574 起 8 m），半宽 3 → 2，水线在 z≈573 收成舌头；尾水块分三截收窄（`HechaTailWater` / `_2` / `_3`，底一律 −2.7 与上游同水面 −1.7），尾上补 5 丛苇子（`Reed_HechaTail_*`）。z 583 起是官道旁的平地，z 556±1 接缝与 0610 解析地面逐点相同（1218 测试 0.001 m 门限）。
- 中线 z 214…561 一格不动，`L0610_RIVER` 的折线与半宽数据没改（头尾是场景里的补充，不在 `Data_*` 里）。`Script_EditorBlockoutFirstLevel0610SceneTest`（沟头一路渐浅、水块）与 `1218SceneTest`（沟尾一路渐浅、三截水块）钉住。

### 变体场景北段继承（`doc.inherit`，2026-11-22）

当多个关卡变体共用前半程场地、只在某道分界线往南分叉时，`tengxian-scene/1` 支持可选头字段 `inherit: { scene: "<基线场景ID>", maxZ: <分界Z> }`（须满足 `inherit.maxZ === terrain.minZ`）：

- **磁盘只存分叉南段**：例如 `Scenes/FirstLevelMerged/Scene_FirstLevelMerged.json` 写 `inherit: { scene: "FirstLevelEncounter", maxZ: 355 }`，自身只存 `z >= 355` 的高度图、壕沟、物件、涂色与地标，不复制 `01–07` 北段数据。
- **运行时毫秒级无缝拼接**：`Script_SceneInherit.mjs`（`ResolveInheritedScene` / `FetchResolvedScene`）在浏览器与 Node 侧自动裁取基线场景 `z < maxZ` 的高度行、壕沟基准面、物件、样条与地表，与变体南段拼成标准内存场景，供 `Script_EditorBlockoutLevels`、`EncounterPlay` 与 `Tool_LevelFlow` 统一消费。
- **场景编辑器只读北段预览与原生存盘**：`SceneEditor.html` 打开带 `inherit` 的场景时，在顶栏提示继承来源、提供「编辑基线 ↗」与「遭遇设计 ↗」直跳，并在视图中以冷灰半透明只读组渲染基线北段（`z < maxZ`）及切口虚线；`Ctrl+S`（`/__scene/save`）仍只写回变体自身的 `z >= maxZ` 南段。门禁见 `Script_SceneDocTest.mjs` 与 `Script_EncounterVariantsTest.mjs`。
