# 场景文件与资产引用（2026-10-31）

用户 2026-10-31 拍板：场景像 Unity 的 scene 一样，**只存「用哪个资产、摆在哪、朝哪、多大、有哪些开关」的引用列表**；白盒不是画质档，是一个长得像白盒的场景。白盒编辑器预演 / 试玩加载白盒场景，以后的正式场景是另一个独立场景，互不影响。

本文是格式与接口的唯一口径。代码：`Data_SceneAssets.mjs`（资产目录）、`Script_SceneDoc.mjs`（格式、校验、高度图、按范围取一块，纯）、`Script_SceneNode.mjs`（node 读文件）、`Script_SceneImportBlockout.mjs`（一次性转换，留着从 git 历史重放）。

## 1. 文件

```
Taierzhuang1938/Scenes/<Id>/Scene_<Id>.json         场景：物件引用列表 + 地面涂色 + 远景设置 + 设计标注
Taierzhuang1938/Scenes/<Id>/Scene_<Id>.height.bin   高度图：int16 小端、厘米，(cols+1)×(rows+1) 个格点，heights[iz*(cols+1)+ix]
```

- 现有场景：`FirstLevelWhitebox`（第一关新剧本 01–18 的白盒，三段合一，见 §5）。
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
  "terrain": { "file": "Scene_FirstLevelWhitebox.height.bin", "encoding": "int16-cm-le", "minX": -160, "minZ": -480, "cellM": 0.5, "cols": 960, "rows": 2920 },
  "look": { "heightTint": { "lo": -2.68, "hi": 3.85 }, "colorSemantics": ["foliage", …], "semanticColors": { "roof": "#4d473c", … } },
  "backdrop": { "far": 7000, "ground": {…}, "haze": {…}, "siteBounds": {…}, "paint": [ … ] },
  "paint": [ { "id": "Cleared", "color": "#7d8360", "poly": [ … ] }, … ],
  "ways": { "roads": [ [ {"x":…, "z":…}, … ] ], "trenches": [ … ] },
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

坐标同全项目：X 向东、Z 向南、Y 向上，米。

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
| `hideOn` / `showOn` | 场景信号：到了就消失 / 到了才出现；两个都写 = 先出现、后消失 |
| `layer` | 只有远景资产写 `"backdrop"`（只看不走：不碰撞、不进寻路） |
| `group` | 层级里归哪一组（场景编辑器的层级列表按它分） |
| `params` | 资产自己的参数（远景树冠的 `rx` / `rz`、颜色……） |
| `meta` | 其余原样带过去的字段（`prop`、`loophole`、`window`…… 预演与测试读） |

其他节：`markers` 是设计标注（白盒编辑器的地标，格式同 docs/Data_EditorBlockout.md §2.2 landmarks），不是物件；`paint` / `backdrop.paint` / `ways` 同白盒场景；`look` 是这个场景的样子（高度色带、保留语义色的几种块、改块色）；`backdrop.siteBounds` 是远景层围着的那片场地（按范围取一块时，取到这片的中心才带远景层）。

## 3. 资产与材质只写编号

`Data_SceneAssets.mjs`：`SCENE_ASSETS`（资产）与 `SCENE_MATERIALS`（材质）。场景里只写编号，编号 → 是什么、怎么画、在哪个文件查这张表；改文件名、换模型只改这张表一行。**编号被场景用上以后不改名**（Unity 的场景存 GUID 不存路径，同一个道理）。

现有资产：`Whitebox/Box`（米制长方体）、`Backdrop/Box|Blob|Hill|Tree`（远景层）。材质：`Whitebox/<语义>`（EarthDark、Plaster、Timber、Roof……），语义决定建场用哪个材质槽，颜色在 `look.semanticColors` 与第一关语义色表。以后加模型资产（构件库可布设清单 `Script_PlaceableCatalog`、外部道具目录）与 PBR 材质时照样登记编号。

## 4. 白盒编辑器怎么用场景

`Script_EditorBlockoutLevels.BLOCKOUT_LEVELS` 里第一关新剧本三段的 `scene` 是 `{ kind: "scene", url, region, priorSignals, objectMarginM, heightTint? }`：

- `Prepare()` 读场景 JSON 与高度图，`BlockoutSliceDoc(level, scene, heights)` → `Script_SceneDoc.BlockoutDocFromScene` 按 `region` 取一块，转成白盒场景形状（`tengxian-blockout-scene/1`，terrain 直接带解好的 `heights`），再走原来的 `LayoutFromSceneDoc`。**建场、渲染、物理一行没改。**
- `region` = 这一段原来的场地范围（01–05 `x −110…320, z −480…200`；06–10 `x −20…320, z 120…560`；11–18 `x −160…236, z 480…980`），地形按格点裁，玩家走不出去。物件取到范围外 `objectMarginM`（缺省 1 m：贴边的隐形墙；11–18 是 64 m，站在场地边看得见的村子带上）。
- `priorSignals`：前面段落出现过的信号都当已经发生——06–10 带 01–05 的三个 + `Stage0105Done`，11–18 带 01–05 与 06–10 的全部（`Script_SceneDocTest` 拿各段配置核对）。`hideOn` 它的物件直接不要，`showOn` 它的物件已经出现。
- `futureSignals`：这一段里不会发生的信号（01–05 的 `Stage0105Done`）——`hideOn` 它的物件当常驻块，`showOn` 它的不要。随信号的块在建场里是一个一个单独的模型、不合批，1207 段隐形墙不能那样建。
- `heightTint: null` = 这一块按自己的最低 / 最高定色带（06–10、11–18 原来就是这样）。
- 总控读地标时取 `markers` 里落在 `region` 的；「编辑布设」导出的路径写 `objects[i]` / `markers[i]`。
- node 里：`Script_SceneNode.ReadBlockoutSceneDocSync(levelKey)` 给出同样的那一块（生成器的摆位检查、场景 / 关键帧 / 预演测试都读它）。

## 5. 2026-10-31 三段合一的记录

`Script_SceneImportBlockout.mjs` 把 `Blockout/FirstLevel0105|0610|1218.scene.json`（合并前一刻由生成器重烘过 1218：那份文件停在 10-26，没跟上 06–10 今天开的窗、空心门房）合成 `Scenes/FirstLevelWhitebox`，然后三份旧文件删掉、`scene <Level>` 对这三段报「生成器已退休」。规矩：

- 地形拼成 960×2920 格（0.5 m）。重叠带按中线切开：z < 160 归 01–05，160…520 归 06–10，其余归 11–18。旧文件互相不一致的格点只在各自外边缘（z 198–200 差到 1.23 m、558–560 差 4 cm），中线两边逐点等于原文件。没人覆盖的角落取本带那段的边缘往外延。
- 物件按 id 合并：一模一样的合成一个；同 id 但相距 > 20 m 是重名的不同物件，后来的改名（`WaterVat_B1` → 06–10 那只叫 `WaterVat_B1_0610`）；同一物件几份不一样时，随信号的版本胜过 11–18 抄成常驻块（`from0610`）的版本，其余取所在那一带的段落的（实际只差 1 cm 取整）。01–05 南边界上封凹路口的隐形墙 `KeepIn_0536` 去掉（三段连通）；01–05 那圈「玩家出不了沟」的隐形墙（`KeepIn_*`，1207 段）加 `hideOn: "Stage0105Done"`——这个信号关键帧里不写，只在 06–10 / 11–18 的 `priorSignals` 里，所以后两段没有这圈墙（06–10 预演里妮儿原来正好走过它）。
- 地标同物件（`LmMainStreet` / `LmRiver` / `LmPostRoad` 的 11–18 那个改名带 `_1218`）；涂色、路与沟按顺序拼；远景层只有 01–05 有，1381 个远景物件进 `objects`（`layer: "backdrop"`）。
- 结果：3428 个物件 + 1381 个远景物件、239 个地标、200 项涂色；JSON 1.2 MB + 高度图 5.6 MB（原三份 JSON 共 9 MB）。三段各自取出来的那一块与旧文件对比：旧物件一个不少、位置尺寸逐位不变；多出来的是邻段落在重叠带里的东西（06–10 那一块多了 01–05 在 z 120–200 的 200 来件，11–18 多了村子边上的 400 来件）。
- 场景测试（`EditorBlockoutFirstLevel{0105,0610,1218}SceneTest`）改查场景取出来的那一块：设计约束（视线、唯一通路、高度、桥、窗）照旧全查；去掉「生成两次逐字相同」与和邻段文件的比对；数路、查旧版残留只算本段场地里的。

## 6. 场景编辑器（2026-10-31）

入口：高级工具 → 场景 → 「场景编辑器」（`Script_EditorSceneEntry`，同贴图管理开独立窗口），或直接打开 `SceneEditor.html?scene=FirstLevelWhitebox`。不起游戏，自己一个轻量三维视图。

- **页面**：`SceneEditor.html` 开机先同步读 `index.html` 里的 import map 插进来（线上发布的 index.html 也保留它），模块版本永远跟游戏同一套戳，不另抄。主程序 `Script_SceneEditor.mjs`，数据层 `Script_SceneEditModel.mjs`（纯，带撤销），样式 `Style_SceneEditor.css`（同设置页口径）。
- **画法**：地形按高度色带 + 地面涂色 + 米格线（`Script_WhiteboxGrid`，与游戏白盒同一段着色），网格太密时按步长抽稀（不超过约 90 万个顶点）；白盒体块按材质分批实例化、颜色取 `look.semanticColors` 与第一关语义色表；远景层画成盒子 / 椭球 / 锥（可关）；`visual: false` 的隐形墙勾「隐形墙」才画（半透明红）。「信号」里勾上的当已经发生（随它消失的藏、随它出现的显示）。段落按钮跳到三段各自的场地。
- **操作**：右键按住转视角、WASD 移动、Q/E 降升、Shift 加速、滚轮前后、中键平移；左键点选（Ctrl 多选、Shift 加选，层级里同样），拖红绿蓝箭头沿 X/Y/Z 挪、拖金圈绕竖轴转、按住已选中的物件直接在水平面上拖；Ctrl 吸附 0.5 m / 15°；F 看选中、Del 删除、Ctrl+D 复制、Ctrl+Z / Ctrl+Y 撤销重做、Esc 取消拖动。落地的物件被竖着挪就不再落地。检视面板改名字、材质、位置（含「落地」开关）、朝向、尺寸、挡人 / 看得见 / 不能翻 / 能站上去、标签、出现于 / 消失于信号、分组、params / meta（JSON）。资产页从目录加物件，放在画面中心看到的地面上。
- **存盘**：本机预览（`node scripts/Script_LocalPreview.mjs`）下 `POST /__scene/save { scene, doc, revision }` 直接写回场景文件；闸同 `/__blockout/save`（本机 Host、同源、JSON、版本号 = 读场景时原始字节的 sha1，对不上 409 + 当前版本号），过 `ValidateScene` 才按 `FormatSceneJson` 原子写；`GET /__scene/status` 报能不能写与版本号。线上（Pages）没有这个口，「保存」退化成下载，换掉 `Scenes/` 里那份再提交。高度图 v1 不开放写。
- **同步**：每 2 s 查一次版本号。外面（人 / agent / 别的窗口）改了场景文件：这边没改动就自动重读（相机、选中保留）；有没保存的改动就挂横幅，让人选重新读取还是先不管。存盘遇到 409 同样挂横幅，可下载自己的版本。
- **接白盒编辑器**：「在白盒编辑器里看」按画面中心的地面点找它落在哪一段，打开 `index.html?editor=blockout&level=<那一段>&pose=x,z,朝向,0,stand`。白盒编辑器每 2 s 也会发现场景文件变了、整片重建。
- **给 agent / 测试**：`window.SceneEditor`（`State()`、`Select(ids)`、`MoveBy(dx, dy, dz)`、`RotateBy(deg)`、`SetField(key, value)`、`Add(asset, opts)`、`Duplicate()`、`Delete()`、`Undo()`、`Redo()`、`Save()`、`Reload()`、`Doc()`、`PixelStats()`、`Signals(list)`、`Show({ backdrop, hidden })`）。
- 门禁：`Script_SceneEditModelTest`（纯 node：移动 / 转 / 改字段 / 加删复制改名 / 撤销顺序 / 存盘判定，真场景改一圈撤到底逐字相同）、`Script_SceneSaveTest`（真起本地预览：写成什么样、409 与各种拒绝都不落盘）、`Script_SceneEditorBrowserTest`（真浏览器：数像素证明画出来了、拖箭头、点选、Esc 取消、加删撤销、信号、保存 / 409、外部改动自动重读；存盘口在页面里拦截，不写仓库文件）。

## 7. 还没做的

- ~~去掉「白盒」画质档~~（2026-10-31 已做）：`GRAPHICS_PROFILES` 只剩 low / medium / high / ultra，白盒编辑器走正常渲染管线，灰表面 + 米格线是白盒材质本身的样子（`Script_WhiteboxMaterial`、`Data_Tuning_WhiteboxMaterial`；场景里的 `Whitebox/*` 材质按语义映射到它，`DressWorld` 装上）。光照写进场景还没做：现在白盒编辑器用本关光照 + `BLOCKOUT_EDITOR_FILL` 补光。
- 模型资产（构件库可布设清单、外部道具）与 PBR 材质进目录；场景编辑器里的地形刷子、地面涂色、框选；高度图存盘。
