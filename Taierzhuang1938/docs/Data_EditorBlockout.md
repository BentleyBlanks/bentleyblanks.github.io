# 白盒关卡编辑器（Blockout Editor）· 设计契约 2026-10-13

用户需求（原话 8 条，2026-10-13）：

1. 编辑器需要有关卡筛选功能，不同关卡支持存储为不同的独立的 Config/Scene 结果，方便加卸载切换预览。
2. 不同的关卡加载时，整个场景随之切换为对应的 3D 白盒场景（地形也改为最简单的纯高度图效果）。
3. 画面里有一个实时俯视图（全关总图：布局数据 + 俯视图），显示玩家当前位置；俯视图就是「纸面上画的地图」，足够简单抽象，但位置要能对应实际 3D 场景；全关总图支持独立放大查看细节；第一关的全关总图直接从现有游戏 Demo 里出（参考性地对照 Notion）。
4. 只复用角色的通用资产/动画：WASD 自由移动、第一人称、持枪开枪；完全不要过场动画（只做关卡白盒测试用）。
5. POI / 目标点位 / 敌军，在 3D 和俯视图里都要特殊标记（敌军、友军始终带特效 / 特殊颜色 / HUD 标记），并显示他们即将去的方向和射界（3D 里也要画出来）；敌我布设是关键帧上的静态位置；切到下一个关键帧时，连贯的单位有移动动画（不瞬切）。
6. 俯视图之外，还要简单的文字 / 图案标注：下一步去哪里、此时发生了什么（简单概括）。
7. 一个进度条样的导航栏，快速切换到下一个关键帧位置做预览。
8. 整体 UI 简洁、现代、漂亮，没有浪费注意力的冗余和非功能内容。

本文冻结入口、文件、数据格式、模块接口与分工。实现包只按本文对接；改接口先改本文。

---

## 1. 入口与总体结构

```
index.html?editor=blockout&level=FirstLevel[&kf=03-2][&pose=x,z,朝向,俯仰,姿态][&quality=whitebox]
```

- `editor=blockout` 已经能把启动路由到 `Script_Main`（`Data_StartupRouting.IsMenuStartup` 认 `editor`），**不改路由表**。
- `level` 缺省 `FirstLevel`；`kf` 缺省第一个关键帧。
- `pose`（2026-10-13 追加）：落到关键帧之后再把玩家摆到这个机位（米 / 度，如 `-35.12,-97.3,-140.2,-5,stand`），就是 §4.2「复制当前位置」里那条「重现」链接；进来后地址栏去掉它（之后翻关键帧不再套用）。不合法就当没给。
- **菜单入口（用户 2026-10-13 追加）**：高级工具（同日另一轮已改成顶部菜单栏 + Inspector）的「关卡」菜单第一项「白盒关卡编辑器」（照 `TextureEditor` 的写法：一个只带静态 `id = "blockout"` / `label` / `hint` / `Open()` 的小类，放在 `Script_EditorBlockoutEntry.mjs`，`Script_Editor.mjs` 把它放进 `TOOL_MENUS` 的「关卡」并在 `Toggle` / `Open` 里按 id 特判）。`Open()` 跳到 `?editor=blockout&level=FirstLevel0105`（2026-10-20 起默认新剧本 01–05，`BLOCKOUT_DEFAULT_LEVEL`；没写 `level` 或写错时也进它；旧版第一关在关卡下拉里；保留当前 `quality` / `scale` / `audio` 参数，去掉 `whitebox` / `missionStage` / `phase` 等关卡参数）。已经在编辑器模式里时，这个按钮显示为当前项，点了不重载。菜单栏条目数因此 +1：`Script_EditorTest` 的 19 → 20。轻量菜单（`Script_MenuStartup`）里的「高级工具」本来就跳到带编辑器面板的完整页面，不另加入口。
- 该模式下：
  - `PHASE_TABLE` 换成 `BLOCKOUT_PHASES`（每个关卡一个 phase），关卡间切换走现成的 `JumpToLevel(i)`（整片拆除重建）。
  - **不建** `FirstLevelMissionRuntime`、过场、故事拍、`companion` / `setpieces`、`SeedSoldiers`（含每 3 s 的补兵）、主菜单。
  - 玩家按 `phase.loadoutOverride` 拿汉阳造 + 大刀 + 手榴弹，WASD / 开火 / 换弹全走原有 `Frame` 路径。
  - 敌我单位是编辑器自己摆的**独立演员（不进 AI、不吃子弹）**，位置与动作完全由关键帧数据决定。
  - 本会话内玩家无敌、无限弹药，**不写 localStorage**（不得改动用户持久化的调试选项）。

运行时结构：

```
Script_Main（薄钩子）
 ├─ Script_EditorBlockoutLevels   纯：关卡注册表、BLOCKOUT_PHASES、第一关白盒派生布局、场景文件 → 布局
 ├─ Script_EditorBlockout         浏览器：总控（读配置、切关、切关键帧、过渡、存取、Debug.Blockout）
 │   ├─ Script_EditorBlockoutPuppets   three：独立演员 + 车 / 担架等简单体块，过渡动画
 │   ├─ Script_EditorBlockoutMarkers   three + DOM：3D 地环 / 光柱 / 射界扇 / 去向箭头 / 头顶标签
 │   ├─ Script_EditorBlockoutUi        DOM：关卡选择、关键帧卡片、导航栏、全关总图外框、提示
 │   ├─ Script_EditorBlockoutMap       canvas 2D（零 three）：纸面俯视图（小地图 + 全关总图）
 │   └─ Script_EditorBlockoutStore     fetch：读配置、轮询外部修改、存档（本机端点 / 本地草稿 + 下载）
 └─ Script_EditorBlockoutConfig   纯：数据格式常量、校验、归一化、过渡规划、路径工具（node 与浏览器共用）
数据：Taierzhuang1938/Blockout/<Level>.json（配置）、Blockout/<Level>.scene.json（非第一关的场景）
工具：Script_EditorBlockoutFirstLevel（纯，从游戏数据生成第一关配置）、Script_EditorBlockoutSecondLevel（node，生成第二关草稿场景）、Script_EditorBlockoutCli
本机存档口：scripts/Script_LocalPreview.mjs 的 /__blockout/status、/__blockout/save
```

## 2. 关卡注册表与场景（`Script_EditorBlockoutLevels.mjs`，纯，零 three）

```js
export const BLOCKOUT_LEVELS = Object.freeze([
  { key: "FirstLevel",  label: "第一关 · 往南的路", configUrl: "./Blockout/FirstLevel.json",
    scene: { kind: "firstLevelMission" } },
  { key: "SecondLevel", label: "第二关 · 手榴弹雨（空间草稿）", configUrl: "./Blockout/SecondLevel.json",
    scene: { kind: "file", url: "./Blockout/SecondLevel.scene.json" } },
]);
export const BLOCKOUT_PHASES;                 // BLOCKOUT_LEVELS.map(MakeBlockoutPhase)，模块求值时建好
export function BlockoutLevelIndex(key);      // 找不到返回 0
export function DeriveFirstLevelBlockoutLayout();      // 见 2.1，结果缓存
export function LayoutFromSceneDoc(sceneDoc);          // 见 2.2
export function HeightGridSampler(terrain);            // int16 厘米网格 → (x,z)=>y，与渲染格同一三角剖分
```

- `BLOCKOUT_LEVELS` 的 key 必须 ⊆ `Script_EditorBlockoutConfig.BLOCKOUT_LEVEL_KEYS`（存档口只认这张表）。
- **关卡下拉的行（2026-10-25）**：一片场地一行；关卡可选 `parts: [{ id, from, label, short, note }]`，按剧本段落把一片场地拆成几行、共用同一个关卡键。`BLOCKOUT_MENU` 是摊平后的行（`{ id, key, from, label, era, badge, note, short }`，第一行 id 沿用关卡键），`BlockoutMenuRow(idOrKey)` 查行，`BlockoutMenuIdAt(levelKey, keyframeIds, index)` 算此刻落在哪一行（`from` 不晚于当前关键帧的最后一行）。现在只有 `FirstLevel1218` 拆成「11–14 · 转运与空袭」（`FirstLevel1218`，从 `11-1`）和「15–18 · 冬瓜之死与炸桥」（`FirstLevel1218_15`，从 `15-1`），新剧本四行对上 Notion 剧本的四大段。选别的场地的行 = 换关并跳到 `from`；选同一片场地的行 = 只跳关键帧；翻关键帧翻过 `15-1`，下拉的当前行跟着变。`?level=` 也认行 id（`BlockoutLevelIndex` 先换成关卡键），没写 `kf` 时从那一行的 `from` 开始；地址栏仍写关卡键 + `kf`。`Debug.Blockout.SwitchLevel` 同样认行 id。
- phase 形状（照 `MOVEMENT_RANGE_PHASE`，**从零写，不得展开 `FIRST_LEVEL_MISSION_PHASE`**，否则会继承 `contentId` 把第一关故事拍与同伴带进来）：
  `{ id: "Blockout_<key>", label, date: "", blockout: { key, configUrl, scene, Prepare }, sandbox: true, ambientAircraft: false, sky, ambience: null, music: null, minutes: 600, brief: [], bounds, spawn: {x,z,ry}, zones: [≥1], objectives: [与 zones 同长], nraPool: 9999, ijaPool: 0, ijaPressure: 0, ijaSpawn: [], ijaSupport: [], hud: { objectiveMarkers: false }, loadoutOverride: { primary: "HanYang", secondary: null, melee: "Dadao", throwables: { Grenade: 3 }, spareClips: 12 }, cameraFar: 650, whitebox: { layout, blockout: true, actorCapacity: 160 } }`。
  不得带 `contentId` / `p012` / `fullMission` / `smokeColumns` / `roster` / `chapter`。
- `blockout.Prepare()`：异步，`BuildField` 在 `new World(...)` 之前调用。第一关立即返回；文件场景在这里 fetch `scene.url`，再把 `LayoutFromSceneDoc` 的结果放进 `phase.whitebox.layout`（phase 对象因此不能整体冻结，或用持有者对象）。

### 2.1 第一关白盒布局（派生自 `MISSION_LAYOUT`，不改原表）

- `{ ...MISSION_LAYOUT, id: "BlockoutFirstLevel", legend: false, fortifications: false, materialLooks: false, railway: null, SampleGroundSurface: null, ground: { ...MISSION_LAYOUT.ground, pbr: undefined, terrainLayers: undefined }, SampleGroundColor: <高度色带> }`。
  新 id 让 `PrepareAssets` 不下第一关贴图集、不建室内遮蔽；地形仍用 `MISSION_TERRAIN`（cellM 0.75 + refine，与游戏完全一致，人在沟里走才判断得准）。
- `blocks` 拷贝后转换：`treeModel` 块（58 个）改成普通树干块（约 0.5×0.5，高取原值或 6 m，`solid: true`，semantic `foliage`），保留碰撞与地标作用；`airWall` 保留（不可见、只挡人）；水块（semantic `water`）要读得出是水（见 §6.3）。
- 场景态（掩蔽部完好 / 坍塌、夜门）与 8 个门照旧由 `layout.scenario` / `layout.gates` 管；当前关键帧的 `signals` 决定开关（§5.4）。

### 2.2 文件场景（`Blockout/<Level>.scene.json`）

```json
{
  "schema": "tengxian-blockout-scene/1",
  "level": "SecondLevel",
  "source": { "generator": "...", "generatedAt": "ISO", "notes": "..." },
  "bounds": { "minX": 400, "maxX": 640, "minZ": -250, "maxZ": 60 },
  "spawn": { "x": 470, "z": -65, "yawDeg": -90 },
  "terrain": { "kind": "heightmap", "minX": 400, "minZ": -250, "cellM": 1, "cols": 240, "rows": 310,
               "encoding": "int16-cm-base64", "data": "<base64>" },
  "blocks": [ { "id": "ZhaiWall_03", "x": 540, "z": -40, "w": 0.9, "d": 22, "h": 2.4, "ry": 0,
                "semantic": "structure", "solid": true, "cover": { "faceX": -1, "faceZ": 0 } } ],
  "ways": { "roads": [ [ {"x":305,"z":-65}, {"x":640,"z":-65} ] ] }
}
```

- 高度：`(cols+1)×(rows+1)` 个 int16 小端，单位厘米，`heights[iz*(cols+1)+ix]`。`LayoutFromSceneDoc` 给出 `terrain: "P012Heightfield"`、`terrainSampler: HeightGridSampler(terrain)`、`terrainSpec: null`、`gates: []`、`walkableSurfaces: []`、`legend: false`、`fortifications: false`、`materialLooks: false`。
- 块的 `y` 在加载时算：脚落在中心与四角中最低的地面上，`y = 最低地面 + h/2`（同 Layout 的 `GroundedBlock`）。**2026-10-18**：块可以显式写 `y`（块中心高度，米），给架在坑上的洞顶、悬着的横木用；写了就不落地。
- **2026-10-26 可选 `standOn`**：`standOn: true` = 演员脚下可以站上这块的顶面，**不受 1 m 台阶限制**（§5.6 站人取地 `BlockStandSampler`）。给比高度场高得多、但本来就是给人走的面用：1218 铁路桥每孔一条看不见的走道（`RailWalk_S1…S4`，`visual: false`、顶在枕木顶 2.55、宽 2.4，比河床高 5.25 m）。只在 `BlockStandSampler` 里起作用；物理、地图、摆位核对照旧当普通块。`LayoutFromSceneDoc` / `GroundedBlock` 原样传。不写的块与关卡逐位不变（0105 / 0610 没有这个字段）。
- **2026-10-21 可选 `tag` 与 `noClimb`**：`tag: "airWall"` = 只挡玩家的隐形墙（`Script_Physics` 只让角色控制器撞它；子弹、视线、手榴弹、布娃娃穿过去；通常配 `visual: false`、`semantic: "airWall"`，地图不画、站人地面与摆位核对不算它；`?airWalls=1` 画成半透明板）；`noClimb: true` = 不能攀：`Script_Player.ProbeVault` 见到它挡在前面就不翻越 / 攀爬（碰撞记录带着这个标，`FirstLevelWhiteboxField` 的静态块与 gate 都传）。翻越落点和人之间隔着 `airWall` 也不翻。校验：`tag` 是非空字符串、`noClimb` 是布尔。01–05 用法见 §13「2026-10-21 防止玩家跳出壕沟」。
- **2026-10-18 可选 `gates`**：与 `blocks` 同字段，再带 `signal`（信号到了就消失）或 `appearSignal`（信号到了才出现），id 与 `blocks` 一起全关唯一。`LayoutFromSceneDoc` 把它们原样交给 `FirstLevelWhiteboxField` 的 gate（与第一关的门同一套 `SyncScenario` / `RestoreScenario`），并给布局 `hideOpenGates: true`：文件场景里「打开」的 gate 是塌掉 / 炸掉的东西，直接隐藏，不走第一关「白门升起 1.2 m」的老画法。关键帧的 `signals` 决定此刻哪些信号为真（§5.4）。
- **2026-10-20 可选 `paint` / `heightTint` / `colorSemantics` / `semanticColors`**（坑北「田、路、村子看得见」那一轮加的，都只做加法，不写的关卡逐位不变）：
  ```json
  "heightTint": { "lo": -2.68, "hi": 3.72 },
  "colorSemantics": ["roof", "foliage"],
  "semanticColors": { "roof": "#3e3a35" },
  "paint": [
    { "id": "Field_1_01", "color": "#566540", "feather": 1.2, "poly": [ {"x": -112, "z": -80}, {"x": -90, "z": -80}, {"x": -90, "z": -110.6}, {"x": -112, "z": -110.2} ] },
    { "id": "NorthRoad", "color": "#d8cfb6", "strength": 1, "feather": 0.8, "halfW": 2.6, "line": [ {"x": 175, "z": -40}, {"x": 173, "z": -90} ] }
  ]
  ```
  - `paint`：地面涂色，按数组顺序叠（后面的盖前面的）。每项 `id`（全关唯一）、`color`（`"#rrggbb"`，sRGB）、多边形 `poly`（≥ 3 点）**或**折线 `line`（≥ 2 点）+ 半宽 `halfW`（米，> 0）；可选 `strength`（0–1，缺省 1，不透明度）、`feather`（米，(0, 20]，缺省 1：边界处覆盖一半，往外 feather/2 落到 0、往里 feather/2 到满，smoothstep）。至多 `BLOCKOUT_PAINT_MAX_ITEMS`（5000）项。
  - `LayoutFromSceneDoc` 用 `BuildGroundPaint(paint, bounds)` 把它烘成一张栅格（格距从 0.5 m 起，格数超过 40 万就翻倍；0105 是 1 m，约 300×470 格）：每格存预乘颜色 C 与覆盖度 A，逐项 `A ← A(1−a) + a`、`C ← C(1−a) + color·a`。布局给出 `groundPaint`（`{ Blend(x, z, rgb) }`：双线性取 C、A，`rgb ← rgb(1−A) + C`，返回 A；没写 paint 是 `null`）、`paint`（原样，给全关总图）、`SampleGroundColor` 也混进涂色。
  - `heightTint`：高度色带上下限（米，`hi > lo`）；不写 = 网格最低 / 最高。0105 坑北抬高了 5 m 上下，钉在南面（z ≥ −8）的最高点，南面颜色一点不变。
  - `colorSemantics`：这几种 semantic 的块在白盒画质里保留语义色（总控给它们的网格标 `whiteboxCharacter`，白盒渲染器原样画，照样加米格线）；默认白盒画质所有块都刷成同一种灰网格，远处的村子屋顶和墙分不开。至多 16 个。
  - `semanticColors`：`{ semantic: "#rrggbb" }`，盖在第一关那张语义色表上（只影响这一关）。至多 32 项。
- **2026-10-20 可选 `backdrop`（远景层，只看不走）**（01–05 坑北第三版加的；只做加法，不写的关卡逐位不变、远平面照旧 650）：场地（`bounds` / `terrain`）以外、玩家走不到的远处地面、田、路、村子、山包。
  ```json
  "backdrop": {
    "far": 7000,
    "ground": { "color": "#7a7150", "y": -2.86, "radiusM": 6000, "blendM": 160 },
    "haze": { "color": "#adb8c2", "fromM": 650, "toM": 6500, "max": 0.88 },
    "paint": [
      { "id": "BdCleared", "color": "#7d8360", "feather": 1.5, "poly": [ {"x": -3300, "z": -80}, … ] },
      { "id": "BdFields", "palette": ["#566540", "#5a4532", …], "rects": [ [x0, z0, x1, z1, 色号], … ] },
      { "id": "BdRoad", "color": "#d8cfb6", "halfW": 2.6, "line": [ {"x": 138, "z": -480}, … ] }
    ],
    "shapes": [
      { "id": "VillageA_Y01_House", "kind": "box", "x": 85.6, "z": -655.5, "w": 15.2, "d": 6, "h": 3.4, "color": "#a89c86" },
      { "id": "VillageA_Y01_Roof", "kind": "box", "x": 85.6, "z": -655.5, "w": 16, "d": 6.8, "h": 1.2, "lift": 3.4, "color": "#3e3a35" },
      { "id": "VillageB_Ring001", "kind": "blob", "x": -720, "z": -860, "rx": 6, "rz": 5.2, "h": 12, "lift": 1.5, "color": "#5a5446" },
      { "id": "Hill3", "kind": "hill", "x": 2420, "z": -1880, "rx": 400, "rz": 280, "h": 58, "ry": -1.12, "color": "#5f5a47", "topColor": "#6d6656" },
      { "id": "VillageA_Ring001", "kind": "tree", "x": 206, "z": -617, "h": 13 }
    ]
  }
  ```
  - `far`：这一关要的相机远平面（米，100…20000）；`ApplyLayout` 把 `phase.cameraFar` 设成 `max(650, far)`（`BLOCKOUT_CAMERA_FAR`）。
  - `ground`：远景地面。`y` 远处的地面高；`radiusM` 从场地边往外铺多远；`blendM`（0…2000，缺省 0）：离场地边 o 米处的高 = 「场地边上最近那一点的场地高」往 `y` 过渡 `smoothstep(o / blendM)`（`BackdropGroundSampler`，接缝上两边一样高）；颜色同理从场地的高度色带过渡到 `color`。
  - `haze`（可选）：远处变淡，按离相机的距离 `max · smoothstep(fromM, toM)` 往 `color` 混；场地本身不混，所以 `fromM` 要比常用机位到场地边远。
  - `paint`：按数组顺序画进远景地面。poly / line 两种同场景 `paint`（§2.2 上一条）；第三种 `{ id, palette: ["#rrggbb", …（≤ 64）], rects: [[x0, z0, x1, z1, 色号], …（≤ 40000）] }` 是轴对齐的田块（实边），省地方。至多 `BLOCKOUT_BACKDROP.maxPaint`（2000）项，id 与 `shapes` 一起全层唯一。
  - `shapes`（≤ 8000）：`box`（`w` × `d` × `h`，可带 `ry` 弧度、`lift` 离地米；房墙、屋顶、院墙）、`blob`（椭球树冠：`rx`、可选 `rz`、`h` 竖向全高、`lift`）、`hill`（低山包：长短半轴 `rx` / `rz`、`h`、`ry`，高度剖面 (1 − r²)² 加一点按角度的起伏，`color` → `topColor` 按高度过渡）、`tree`（编辑器的枯树模型，同场地里的树，只要 `x, z, h`）。除 `tree` 外都要 `color`。脚下的地面高都按 `ground` 那条规则算。
  - **只看不走**：`LayoutFromSceneDoc` 把它原样（深拷贝）交成 `layout.backdrop`，另给 `layout.backdropGroundAt`（上面那条地面高规则）与 `layout.cameraFar`；**不进 `blocks` / `gates`**（不碰撞、不进寻路、不进 colliders），`bounds` 不变（玩家走不出场地）。全关总图不画远景层。
  - 校验在 `ValidateBlockoutScene`（`BLOCKOUT_BACKDROP` 上限表）；地面图在 `RasterizeBackdropPaint`（纯 JS，零 three，node 测试也能跑）。
- **2026-10-20 可选 `landmarks`（地标）**（用户「每个关键位置、每个特殊 POI 区域加标记，例如狗洞，白盒下看不太清」；所有关卡共用的格式，只做加法，不写的关卡逐位不变）：白盒灰里看不清的特殊地方，编辑器画成亮色线框 + 光柱 + 头顶标签（§5.5，开关「地标」）。
  ```json
  "landmarks": [
    { "id": "LmDogHole", "name": "狗洞", "kind": "hole", "x": 81.5, "z": 488, "w": 0.7, "d": 0.45, "h": 0.4, "note": "0.45 m 宽、0.4 m 高，大人钻不过" },
    { "id": "LmCellar", "name": "地瓜窖", "kind": "pit", "x": 90.5, "z": 499.5, "y": -0.7, "w": 1.6, "d": 1.6, "h": 2, "note": "深 2 m" },
    { "id": "LmMainStreet", "name": "主街", "kind": "area", "x": 100, "z": 427.5, "w": 6, "d": 85 },
    { "id": "LmGully", "name": "干沟（集结处）", "kind": "area", "x": 56, "z": 152, "radiusM": 9 },
    { "id": "LmVillageSouth", "name": "村南口", "kind": "place", "x": 98, "z": 545, "radiusM": 2.5 }
  ]
  ```
  - 每项 `{ id, name, kind, x, z, y?, w?, d?, h?, ry?, radiusM?, note? }`：`id` 全关唯一（和 blocks 的 id 不是一张表）；`name` ≤ 24 字；`kind` 七种：`hole`（洞口 / 缝）、`door`（门）、`window`（窗）、`pit`（坑 / 窖）、`area`（片区：给 `w` / `d` 或 `radiusM`）、`prop`（物件：石碾、麦秸垛、水缸、土地庙）、`place`（地名：村北口、东街东头）；`x, z` 中心（米）；`y` 可选的中心高度（不写就落地；窖这种从坑底立到地面的写 `y`）；`w / d` 要一起给、`h` 可选（给了就画贴着它的线框）；`ry` 弧度；`radiusM` 画地环；`note` ≤ 60 字，标签上的一行小字。至多 `BLOCKOUT_LANDMARK_LIMITS.maxItems`（400）项。
  - 校验在 `ValidateBlockoutScene` → `LandmarkIssues`（单独导出给生成器与测试用），归一化 `NormalizeLandmarks`（坏项跳过）。`LayoutFromSceneDoc` **不碰**它（布局里没有地标）：总控 `LoadLandmarks()` 在每次进关后自己再读一次场景文件只取 `landmarks`（第一关没有场景文件 = 没有地标），交给标记层与俯视图。
  - 0610 的地标由生成器 `L0610Landmarks(sample)` 从锚点表填（§15）；0105 由 `L0105Landmarks(sample, blocks, bridgeDeckTop)` 填（2026-10-20，43 个：防炮洞与洞口、支沟、支沟机枪、审问处、台阶、迂回组爬出处、02 三处回身打的掩体（框就是那三个摆件）、板桥、坡顶与坡沿、干沟与坑窝、凹路口、沟口、机枪坑与甲乙丙三个射位、胸墙、前沿沟西头北折、拐角 1、斜折、坑北的孤坟 / 坟地 / 麦秸垛 / 干水沟与出沟点 / 地坎 / 掷弹筒 / 五道田埂（标签放在 x −88，写离坑多远）/ 战车露头；SceneTest 查齐、过校验、坑和洞的框从坑底立到地面、掩体框对得上摆件、板桥框朝向对得上门板）；**1218 要加地标**：在各自的场景生成器里照 0610 的写法加一个 `L0105Landmarks` / `L1218Landmarks`（坐标取各自 `Data_…Space` 的常量）写进 `scene.landmarks`，重跑 `scene <Level> --force`，SceneTest 加「地标齐、都在场地里、关键的框对得上」。
- `Data_FirstLevelP012Terrain.CreateP012Terrain` 加一个钩子：`layout.terrainSampler` 存在时，节点高度与 `RefineCells` 的细分高度都用它；**不存在时逐位不变**（`Script_FirstLevelWhiteboxTerrainTest --digest` 前后一致）。

## 3. 配置文件（`Blockout/<Level>.json`）

人能看懂、AI 能直接改。坐标为游戏世界坐标：X 向东、Z 向南、米。**朝向一律 `yawDeg`：0 = 朝北（−Z），+90 = 朝西，−90 = 朝东**（与玩家 / 演员 `rotation.y` 同号，前方 = (−sin, −cos)）；也可写 `faceTo: {x,z}`，归一化时换成 `yawDeg`。

```json
{
  "schema": "tengxian-blockout/1",
  "level": "FirstLevel",
  "title": "第一关 · 往南的路",
  "source": { "generator": "Script_EditorBlockoutCli.mjs export FirstLevel", "gameVersion": "<MISSION_WHITEBOX_VERSION>", "commit": "<sha>", "generatedAt": "ISO" },
  "zones": [ { "id": "A", "name": "前沿与后交通壕", "stages": [1, 6], "box": { "minX": -62, "maxX": 118, "minZ": -233, "maxZ": -84 } } ],
  "keyframes": [
    {
      "id": "03-2",
      "stage": 3,
      "stageTitle": "夺取右侧阵位",
      "name": "观察射台",
      "player": { "x": -23, "z": -131, "yawDeg": -33.6, "pitchDeg": -2.7, "stance": "stand" },
      "what": "班长停下来依次指：被困的守军、缺口、右边破墙冒火的机枪。",
      "next": { "text": "打掉右边破墙那挺机枪", "x": 24.9, "z": -153.9, "radiusM": 4 },
      "how": ["班长停下三指", "机枪火光一直在前面", "任务字"],
      "notes": "",
      "signals": ["BunkerCollapsed"],
      "units": [
        { "id": "FrontGunner", "side": "ija", "kind": "soldier", "name": "破墙机枪", "role": "machineGun", "weapon": "Type11",
          "x": 26.5, "z": -155, "yawDeg": 98, "stance": "prone", "aim": true,
          "arc": { "halfDeg": 25, "rangeM": 70 }, "intent": [], "group": "machineGun" }
      ],
      "pois": [ { "id": "gap", "name": "缺口", "kind": "poi", "x": -8, "z": -150, "radiusM": 3 } ]
    }
  ]
}
```

字段：

| 字段 | 说明 |
| --- | --- |
| `keyframes[].id` | 唯一，`[A-Za-z0-9_-]+`，建议 `<阶段两位>-<序号>` |
| `stage` / `stageTitle` / `name` | 公开阶段号（导航栏按它分段）、阶段标题、站位名 |
| `stageLabel` | 可选（2026-10-18），1–6 字的拍号，如节拍表里的「02末」：导航栏、卡片、俯视图用它代替两位阶段号；导航栏按 `stage` + `stageLabel` 分段 |
| `player` | `x, z, yawDeg, pitchDeg?(默认 0), stance?("stand"|"crouch"|"prone")` |
| `what` | 此时发生了什么，≤ 40 字为宜（校验 > 80 字报警告） |
| `next` | 下一步：`text`（≤ 20 字为宜）+ 目标点 `x,z` + `radiusM?`；没有移动目标时只写 `text` |
| `how` | 可选，靠什么让玩家知道（短语数组，界面上是小标签） |
| `notes` | 可选，设计 / 对照备注（如「Notion 写…；游戏现在…」），界面上弱显示 |
| `signals` | 可选，此刻为真的场景 / 门信号名（§5.4） |
| `units[]` | 见下表；同一个 `id` 在相邻关键帧里出现 = 同一个人，过渡时走过去 |
| `pois[]` | `{ id, name, kind: "objective"|"poi"|"landmark"|"danger", x, z, radiusM? }` |

单位：

| 字段 | 说明 |
| --- | --- |
| `id` | 关卡内稳定；同一关键帧内唯一 |
| `side` | `"ija"` 敌 / `"nra"` 友 / `"civ"` 百姓 |
| `kind` | `"soldier"`(缺省) `"officer"` `"civilian"` `"child"` `"tank"` `"litter"`(担架，含两名抬担架的人) `"cart"` `"animal"` |
| `name` | 可选短标签（罗班长、破墙机枪…）；无名的普通兵只显示图标 |
| `castId` | 可选（2026-10-18）：定妆角色 id（`Data_FirstLevelSpeakingCast` 的键，如 `luo` / `yaowa` / `comrade` / `ijaA`）。给了就用那个角色固定的身体与面部（同一个人每一帧长一个样），预演里台词才能动嘴（§14） |
| `role` / `group` | 可选，自由文本 / 遭遇组 id（俯视图图例、筛选用） |
| `weapon` | 可选，缺省：ija `Type38`、nra `HanYang`、civ 无；`Dadao`（大刀）同开场 01–02 罗班长的挂法（`actor.SetWeapon("Dadao")`），站着不动、没播片段时摆原生白刃戒备（§5.6） |
| `x, z, yawDeg | faceTo` | 位置与朝向 |
| `stance` / `aim` / `state` | `"stand"|"crouch"|"prone"`；`aim` 举枪；`state: "down"` = 倒地（伤 / 亡）；倒地的人在过渡 / 预演里换位置**只平移、保持躺姿**（被拖、被抬，§5.6） |
| `lie` | 可选（2026-10-18），只对倒地的人有意义：`"along"` = 身体顺着朝向躺、头朝 `yawDeg` 的前方、骨盆落在 `x,z`（被子 / 担架上被拖着走的伤员用：朝向写成拖的方向）；不写 = 原来的样子（演员倒地姿态原样，身子横在朝向两侧，已有数据不变）。校验只认 `"along"`；归一化时没写或写错都去掉 |
| `body` | 可选（2026-10-19），只对百姓 / 小孩（`civilian` / `child` / `side:"civ"`）有意义：`"rig"`（缺省）= 能放动作库片段的骨骼占位身体（§5.6）；`"procedural"` = 旧的程序化 tzm 身体（放不了片段、蹲不下）。预演 `spawn` 里也能写。校验只认这两个值；归一化时没写或写错都去掉 |
| `arc` | 可选射界 `{ halfDeg, rangeM, yawDeg? }`（中心缺省 = 朝向）；缺省时只有机枪手（Type11/Type92Hmg/Zb26）和战车按 §5.3 默认画 |
| `path` | 可选：从**上一关键帧**的位置走到这里的折线（不含起点，可含终点）；没有则直线 |
| `intent` | 可选：此刻「即将去」的折线，画成虚线箭头；没有且下一关键帧里这个人换了位置，则自动取下一关键帧的 `path`/直线 |
| `speedMps` | 可选过渡速度；缺省 ija 2.8、nra 2.4、civ 1.6、litter 1.2、tank 2.0 |
| `guess` | 可选 `true`：位置是推测的（游戏数据里没写），界面上用虚线圈 + 「?」 |
| `bearers` | 只对 `kind: "litter"`：抬担架的人数 0–2（缺省 2）；`0` = 担架放在地上 / 床边、没人抬；`1` = 只画前面一个抬担架的人（后头由玩家或别的单位抬着，或搁在地上）。担架的 `state: "down"` 只表示抬担架的人倒了 |
| `draft` | 可选（2026-10-20），只对 `kind: "cart"`：拉车的牲口模型 `"ox"` / `"horse"`；不写时名字带「牛」用牛、其余用马（§5.6） |
| `ride` | 可选（2026-10-20），人或担架**挂到车上**：`{ "on": "<车的单位 id>", "x", "z"（车本地米，+x 右、−z 前，缺省 0）, "y"（演员根离车底下地面多高，缺省 0）, "yawDeg"（相对车头，缺省 0） }`，`null` / 不写 = 不挂。`on` 要是**同一帧里**的 `cart` / `tank` / `litter`，不能是自己，不许一层层挂（挂着的担架再被人挂 → 错）。挂着时每帧位置 / 朝向 = 车当前位姿 ∘ 本地偏移，不贴地，自己的 `x, z` 只当备用（车不在场时）；人照常播片段（坐、抖、趴）。坐车尾的 `y` 怎么算见 §5.6（`BLOCKOUT_CART_SEATS`）。挂着的担架 `bearers` 应写 0（否则只警告） |

`Script_EditorBlockoutConfig.mjs`（纯，node 与浏览器共用，LocalPreview 也要 import，**导入时不得抛错、不得碰 DOM / three**）：

```js
export const BLOCKOUT_SCHEMA = "tengxian-blockout/1";
export const BLOCKOUT_SCENE_SCHEMA = "tengxian-blockout-scene/1";
export const BLOCKOUT_LEVEL_KEYS = Object.freeze(["FirstLevel", "SecondLevel"]);
export const BLOCKOUT_LEVEL_RE = /^[A-Za-z0-9]+$/;
export const BLOCKOUT_CONFIG_FILE_RE = /^Taierzhuang1938\/Blockout\/[A-Za-z0-9]+\.json$/;
export function BlockoutConfigPath(level);          // "Taierzhuang1938/Blockout/<level>.json"
export function ValidateBlockout(doc);              // → { ok, errors: [..], warnings: [..] }，错误信息用中文、带路径（keyframes[3].units[2].x）
export function ValidateBlockoutScene(doc);         // 场景文件校验
export function NormalizeBlockout(doc);             // 深拷贝 + 缺省值：faceTo→yawDeg、stance/kind/weapon/speed 缺省、默认射界、intent 自动推导
export function KeyframeIndex(doc, idOrIndex);
export function PlanTransition(prevKf, nextKf, opts); // 见 §5.2
export function PathLength(points); export function SamplePath(points, distanceM); // → {x,z,headingYawDeg}
export function YawDegFromTo(a, b); export function ForwardFromYawDeg(yawDeg);    // → {x,z}
export function DefaultArc(unit);                   // §5.3
export const BLOCKOUT_LIE_MODES;                    // ["along"]（§3 lie）
export const BLOCKOUT_RIDE_CARRIER_KINDS;           // ["cart", "tank", "litter"]（§3 ride 能挂到谁身上，2026-10-20）
export function RideIssues(ride, at);               // ride 的毛病清单（空 = 合法；null / undefined 不算错）；预演校验也用它
export function NormalizeRide(ride);                // → { on, x, z, y, yawDeg } | null（缺的补 0）
```

## 4. 界面（`Script_EditorBlockoutUi.mjs` + `Style_EditorBlockout.css`）

原则：只放有用的东西；外观与高级工具（`Style_Editor.css` 的 `#edRoot --ed-*`）同一套，即启动界面设置页的视觉语言（半透明暗色渐变底、象牙白文字、橄榄灰细线、左侧金边 + 渐变选中条、宽字距、衬线标题、金色填充细轨 + 竖条游标、直角，2026-10-14 同步），数字用等宽 `--ui-mono`；不用 ◀▶▲▼✕ 这类字体里没有的字符，一律画 SVG / CSS 形状；中文按现有编辑器口径可回落系统字体。

| 位置 | 内容 |
| --- | --- |
| 左上 · 关键帧卡片（宽约 380 px） | 第 1 行：金色阶段号「03」+ 阶段标题 + 灰色「· 站位名」；右上两个小按钮「复制当前位置」（§4.2）与「记下当前机位」（§7）。第 2 行「此时」+ `what`。第 3 行「下一步」+ 指向目标的小箭头（随视角转，正前方朝上）+ `next.text` + 距离「52 m」。可选第 4 行：`how` 小标签；`notes` 一行弱显示；有 `guess` 单位时一行「n 个位置是推测的」。右上角一个小按钮「记下当前机位」（§7）。 |
| 右上 · 关卡与图层（齿轮按钮左侧） | 关卡下拉（显示当前关卡名 + 下拉箭头）；6 个图标开关：射界（三档）/ 去向 / 标签（三档，2026-10-20：有名字的 → 全部 → 关）/ 穿墙显示 / 地标 / 站位（后两个 2026-10-20 加，缺省开；图标是自画的 SVG：杆上一面小旗、虚线路尽头一个小三角；三档的开关在「全部」档右上角有个金点）；配置状态小点（绿 = 已载入，蓝闪 = 检测到外部修改已同步，红 = 配置有错，悬停看原因）。**开关的选择记在 localStorage**（键 `tengxian1938_blockout_layers`，`Script_EditorBlockoutMarkerRules.SerializeLayers / ParseStoredLayers`，读写都包 try/catch；下次打开编辑器照上次的）。 |
| 左下 · 小地图（220×220 CSS px，按 DPR 出图） | 北朝上、跟随玩家；纸面风格；角落小字「M 展开」。 |
| 底部居中 · 导航栏（宽 min(1140 px, 64vw)，全关总图打开时仍在最上层可点） | 左右两个箭头按钮 + 一个重播按钮（当前是第一个关键帧时置灰）；中间轨道按阶段分段（段宽按该阶段关键帧数），段下方小字阶段号 01…18；每个关键帧一个刻度，当前关键帧金色滑块；悬停刻度弹出「03 · 观察射台」；点击跳转、拖动松手跳转；右侧计数「03 · 2/3」；最右一行极小的按键提示「, . 切换　M 地图　Esc 鼠标」。 |
| 全关总图（M 打开，图框铺满导航栏以上；半透明遮罩盖满整屏，导航栏浮在遮罩上） | 纸面大图，**开着时鼠标只归地图**（游戏不转头、不开枪、不抢锁、滚轮不换枪；点遮罩空处关图），**打开时以玩家为中心**（默认约 220 m 见方；用户缩放过就记住那个比例），跳关键帧时跟到新位置；滚轮以光标为中心缩放、拖动平移、双击回到全图；每个关键帧是带阶段号的小点，点之间连一条虚线路线；点击关键帧点直接跳转（图保持打开）；当前关键帧的单位、射界、去向、POI 全画；右上一个关闭按钮，M / Esc 关闭。 |
| 中上 · 提示条 | 短暂提示（「已载入」「配置已在外部修改，已同步」「机位已保存」「配置有 2 处错误」），2.5 s 淡出。 |

- 游戏 HUD：编辑器模式给 `body` 加 `blockoutMode` 类，隐藏任务字、简报卡、字幕、旧小地图、人数池等；保留准星、弹药、受伤反馈。
- 指针锁：锁定时编辑器界面可见但不可点（`pointer-events:none`）；Esc 解锁后可点；点 3D 画面重新锁定（现有逻辑）。窗口不给锁（Claude 桌面应用的内置浏览器面板会报 `SecurityError` / `WrongDocumentError`「root document … not valid for pointer lock」）时，`Script_Main` 改成**按住右键拖动转视角**、左键照常开枪，提示一次 `hud.hint.dragLook`；正常浏览器不受影响。**只有在画面上点击发起的抢锁被这样拒才退化**：普通 Edge 窗口不在系统前台时抢锁也报一字不差的同一句（2026-10-21 有头 Edge 实测；编辑器开机那一下、Alt / Esc 松开、1.3 s 重抢都可能撞上），以前一次就永久退成右键拖动、之后点画面也不再抢锁。退化之后每次点击仍顺手再要一次锁，要到了就回到正常锁定。编辑器 DOM 上的 `mousedown`/`wheel`/`keydown` 必须 `stopPropagation`，否则会触发抢锁、滚轮换枪。
- 按键（锁定 / 未锁定都有效）：`.` 下一个（带过渡动画）、`,` 上一个（直接到位）、`M` 全关总图（替代原 M 小地图）、`Y` 重播进入当前关键帧的过渡、`P` 复制当前位置（§4.2）、`N` 播 / 中断当前关键帧的预演（§14，2026-10-18；`V` 是近战键）、`O` 进 / 出飞行观察（§4.3，2026-10-21）。不得占用 `KEYMAP` 已绑的键。

```js
export class BlockoutUi {
  constructor(root, handlers) // handlers: { onPrev, onNext, onSeek(index), onLevel(key), onLayer(name, on), onSavePose(), onReplay(), onOpenMap(), onCloseMap(), onMapPick(index) }
  SetLevels(levels /*[{key,label}]*/, currentKey)   // 总控传的 key 是菜单行 id（§2 BLOCKOUT_MENU），onLevel 回的也是行 id
  SetKeyframes(list /*[{id,stage,stageTitle,name}]*/, index)
  SetCard({ stage, stageTitle, name, what, next: { text, distanceM, relYawDeg } | null, how, notes, guessCount })
  SetLayers({ arcs, intents, labels, xray, landmarks, stations })   // labels: true|false|"named"|"all"|"off"（2026-10-20）
  SetStatus({ state: "ok"|"synced"|"error"|"loading", message, writable, saveReason })
  SetTransition({ active, rate })   // 过渡中导航栏显示「快进 ×n」（rate > 1 时）
  Toast(text, kind /* "info"|"ok"|"warn"|"error" */)
  SetInteractive(on)                // false = 指针锁定中
  SetMapOpen(on)
  get miniCanvas(); get fullCanvas(); // 地图模块画进这两个 canvas
  Dispose()
}
```

`relYawDeg`：目标相对视线的水平角，0 = 正前方，正值 = 在左边（与 yaw 同号）。

### 4.1 纸面俯视图（`Script_EditorBlockoutMap.mjs`，canvas 2D，零 three）

- 底：米黄纸色（`#e6dfcd` 一带）+ 轻微山体阴影 + 1 m 细等高线、5 m 粗等高线；有 `naturalHeight` 时，开挖处（地面低于自然地面 0.25 m 以上：沟、下沉路）用淡褐色水洗。
- 块：按 `ry` 旋转画脚印；房屋 / 墙用深墨色，矮掩体（cover、高 ≤ 1.4 m）用中灰，`airWall` / `void` / `coping` 与 0.35 m 以下的碎块不画；水用淡蓝。
- 标记：敌 = 红三角（尖指朝向）、友 = 蓝圆点 + 朝向短线、百姓 = 绿点、战车 = 红色旋转矩形、担架 / 车 = 蓝色小矩形；射界 = 半透明扇形（同阵营色）；去向 = 虚线箭头；POI = 金色菱形；下一步目标 = 金色圆环；玩家 = 金色箭头 + 视锥；飞行观察相机（§4.3）= 青色圆 + 朝向小三角 + 青色视锥，到玩家本人拉一条淡虚线；推测位置 = 虚线圈。
- 静态层（地面 + 块）每关只烘一次，分块在空闲帧里做，切关缓存；小地图每次刷新 = 一次 `drawImage` + 动态标记，5–10 Hz。
- 全关总图在放大到 ≥ 4 px/m 时块改用矢量重画，不糊。
- 只在全关总图的 canvas 元素上挂鼠标监听，**不得往 window 挂监听**。

```js
export class BlockoutMap {
  constructor()
  SetScene({ levelKey, bounds, blocks /*[{x,z,w,d,h,ry,semantic,solid}]*/, sampleHeight /*(x,z)=>y*/, naturalHeight /*可选*/, ways /*可选 {roads, trenches}*/ })
  Bake()                                   // → Promise，空闲分块烘静态层
  SetKeyframes(list /*[{id,stage,player:{x,z}}]*/, index)
  SetDynamic({ player: {x,z,yawDeg}, fly /* 可选 {x,z,yawDeg}，飞行观察时有，小地图改以它为中心 */, units, pois, next })
  SetLandmarks(list)                       // 场景文件的地标（2026-10-20）：小地图与全关总图都画 kind 色小方块 + 墨边，有尺寸的画脚印（片区虚线），放大到 ≥ 1.5 px/m 排名字
  SetLayers({ arcs, intents, labels, landmarks, stations })   // stations 只管小地图上的站位点与虚线（全关总图的关键帧点一直在）
  PaintMini(canvas, { pxPerM })            // 北朝上，以玩家为中心并夹在边界内
  PaintFull(canvas)                        // 用内部视图 {cx,cz,pxPerM}
  FitBounds(); ZoomAt(px, py, factor); PanBy(dxPx, dyPx); ClearCache(levelKey?) /* 场景文件重读后丢掉烘好的静态层 */;
  PickKeyframe(px, py) /* → index | -1 */; ScreenToWorld(px, py); WorldToScreen(x, z);
  Dispose()
}
```

### 4.2 复制当前位置（`Script_EditorBlockoutSnapshot.mjs`，纯，零 three / DOM）

用户要把「我现在在哪、看着什么、在哪个关键帧」一键交给 agent，不走下载文件（用户 2026-10-13）。卡片右上的复制按钮或 `P`：

1. 总控 `Snapshot()` 收现场：关卡、当前关键帧（id、序号、阶段、此时、下一步、关键帧机位）、玩家（位置、眼高、朝向、俯仰、姿态）、
   准星正前方一条 300 m 射线（连地表；打到体块时按碰撞盒的中心与宽深从本关布局 `layout.blocks` 认回体块 `id`）、30 m 内的单位与 POI（最多 8 个，按远近）、
   全关总图开着时的视图中心与横向米数、当前地址。
2. `BuildBlockoutSnapshot` 取整成只有数字和字符串的对象（`schema: "tengxian-blockout-snapshot/1"`），`FormatBlockoutSnapshot` 排成一段文字：
   前面几行给人看（关卡与配置路径、关键帧、下一步在我哪边多远、我现在、准星对着什么、附近有谁、「重现这个机位」链接、坐标口径），
   **最后一行 `数据：{...}` 是整份快照的 JSON**，数字以它为准；`ParseBlockoutSnapshot(text)` 找这一行解析回来。
3. 写剪贴板：`navigator.clipboard.writeText` → 被拒再 `document.execCommand("copy")` → 两条都不行就松开鼠标、弹出一个文字已全选的框（按 Ctrl+C，Esc 收起；框里按键不翻关键帧）。

**agent 收到这段文字时**：「关键帧」那一行的 id 就是 `Blockout/<Level>.json` 里 `keyframes[].id`；「我现在」的 x / z / 朝向 / 俯仰可以原样写进那个关键帧的 `player`；
「准星对着：体块 X」的 X 是本关布局里的块 id；要看画面就无头打开「重现这个机位」链接截图。相对方位「左前 23°」= 要往左转 23° 才正对。

### 4.3 飞行观察（testFly，2026-10-21）

用户要一台不受碰撞的自由相机，在白盒场地里绕着看（空间关系、视线、高处俯瞰），看的时候玩家本人不动。

**键位**（写进契约；游戏与编辑器已绑的键一个没占）：

| 键 | 作用 |
| --- | --- |
| `O` | 进 / 出飞行观察（卡片右上的飞行按钮同效；`BLOCKOUT_FLY.toggleKey`）。游戏 `KEYMAP` 与编辑器（`, . Y P M N Esc`、反引号）都没人绑 O |
| `W` `S` `A` `D` | 沿视线前后（含俯仰，抬头 W 就往上飞）、横向左右 |
| `E` / `Q` | 世界竖直升 / 降 |
| `Shift`（按住） | 加速 ×4 |
| 滚轮 | 调飞行速度：一格 ×1.25（向上滚变快、向下滚变慢），夹在 0.5–400 m/s，缺省 8 m/s |
| 鼠标 | 转头（指针锁；锁不住的窗口照旧按住右键拖动，走的是 `Script_Main` 原来那条输入链，没有另写） |

飞行中 `E Q Shift W A S D` 是借用的：游戏里它们是探身 / 冲刺 / 走路，但飞行中整张键位表对玩家闸掉了（`CapturesInput()`），不冲突。`P` 复制、`M` 地图、`Esc` 解鼠标照常；`Esc` 只释放鼠标，**不**退出飞行（退出只用 `O`）。

**行为**：
- 进入：从当前相机的位置与朝向起飞（`FlyState().origin` 记着进入时相机与玩家的位姿）。退出：不用还原什么——玩家这期间一直没动，下一帧 `Script_Main` 把相机写回玩家的位置与朝向（实测误差 < 2 cm）。
- 不查碰撞：墙、体块、沟沿都穿过去，没有重力。唯一的限制是不低于地面（`groundAt` + 0.15 m），免得钻到地底下什么都看不见。
- 玩家原地不动：飞行中 `CapturesInput()` 为真，`Script_Main` 把走动 / 冲刺 / 探身 / 姿态 / 开火 / 开镜清零、键位动作（跳 / 换枪 / 装填 / 近战 / 投弹…）整张表闸掉（只放行 `map`），枪模与第一人称身体藏起（退出时还回）；玩家本来就无敌无限弹药。鼠标位移不给玩家转头，由 `Script_Main` 乘上与玩家同口径的灵敏度后交给 `FlyLook(dyaw, dpitch)`；鼠标键仍能抢指针锁（点画面就锁住）。
- 阴影框跟着相机走（`Script_Main` 在 `ApplyCamera` 之后更新，同炮击扬尘测试场的自由相机）。
- 关键帧：飞行中翻关键帧（`, .`、导航栏、地图点选）允许——玩家照旧被传到新站位、演员照旧走过渡，相机留在原处，正好站在高处看；退出时回到的是新站位的玩家视角。
- **预演规则**（最简单的一条）：相机归预演，预演不能和飞行共存。预演播放中**不让进**飞行（`O` 与 `Debug.Fly(true)` 都被拒，弹提示「预演播放中不能飞行观察：先按 N 或 Esc 中断」）；飞行中**开播预演**（`N` / 预演按钮 / `Previz.Play`）则自动退出飞行（`OnPrevizStart`），预演播完或中断后相机交还玩家，可再按 `O` 进。切关（`SwitchLevel`）同样自动退出。
- 地图：小地图改以飞行相机为中心（玩家标记照画，在视野里就看得到），全关总图打开时也对准相机；相机画成青色（`MAP_COLORS.fly`）的圆 + 朝向小三角 + 视锥，到玩家本人一条淡虚线。飞行中 `M` 照样开全关总图（地图开着时鼠标归地图，滚轮缩放地图而不是调速）。

**界面**（沿用 §4 的视觉：金边选中、细线、衬线标题、直角）：卡片右上多一个纸飞机图标按钮「飞行观察」（飞行中亮金边，`aria-pressed`）；飞行中卡片底多一条：金底「飞行」标签 + 「观察相机」+ 速度（`8.0 m/s`、按住 Shift 时写「×加速」）+ 退出钮，下一行相机的 x / z / 高 / 朝向 / 俯仰（等宽数字），再下一行按键提示；导航栏的按键提示多一个 `O 飞行`（飞行中变金）。预演播放时整张卡片只剩预演条，飞行条跟着藏。

**复制当前位置**（§4.2）：飞行中 `P` / 复制按钮 / `Snapshot()` 复制的是**飞行相机**的位姿，格式不变：`player` 块 = 相机的 `x / z`、`y` 与 `eyeY` 都是相机的绝对高度、`yawDeg / pitchDeg` 是相机朝向、`stance` 写 `stand`；多一个 `fly: { body }`（玩家本人没动的位置 / 朝向 / 姿态）。文字里「我现在（飞行观察相机）」「玩家本人没动」两行，准星射线从相机发出。「重现」链接的 `pose=` 多第 6 项相机绝对高度：`pose=x,z,yawDeg,pitchDeg,stand,flyY`（`PoseParam` / `ParsePoseParam`；5 项的旧格式不变）；打开后玩家落在 `x,z`，再从 `flyY` 这个高度、该朝向起飞。

`Script_Main` 的薄钩子（只加判断）：`BlockoutInputCaptured()` 对飞行也为真；`OnAction` 里放行 `map`（`blockout.AllowsMapKey()`）；`Frame` 里清零输入之后，飞行中把 `input.lookX/Y` 乘灵敏度交给 `blockout.FlyLook` 并清零（`lean` 也清）；`ApplyCamera` 之后飞行中更新阴影框。

### 4.4 编辑布设（全关总图里拖着微调、加说明标记，导出给 agent；2026-10-21）

用户原话（10-21）：在全关总图里做一个布设编辑——像总图上那些布设一样能自己拖着调位置，也能在 2D 图上加标记写说明；调好的布设 + 标记一键导出给 agent 读了去改。**不做保存**（编辑器里的编辑器），入口放在全关总图里；目的是人手微调细节位置。

- **入口**：全关总图图头「编辑布设」开关（关闭按钮左边，金边 = 开着，右上角数字 = 挪了几处 + 几个标记）。开着时图上左上一条工具栏、右上一块检查器，图头提示换成编辑的。关图、切关键帧都不丢；切关各关各一份（回来还在）；**关掉 / 刷新页面就没了**。
- **能拖的**：地标（场景文件 `landmarks`）、体块（布局里有 `id` 的、全关总图上画得出来的）、当前关键帧的人（`units`）/ 要点（`pois`）/ 下一步目标（`next`）、所有关键帧的玩家站位（`player`，关键帧点）、自己加的说明标记。
- **操作**：左键拖东西 = 挪（挪动量吸附到 0.1 m，坐标本身不吸附：没往 x 挪的东西 x 一位不变）；左键拖空地 = 平移、点空地 = 取消选择；Shift + 点 = 加选 / 减选，Shift + 拖空地 = 框选（中心落在框里的都选上，一座房子框住一起挪）；右键 / 中键拖 = 平移；滚轮缩放；编辑开着时双击不回全图。画布有焦点时：方向键微调 0.1 m（Shift 1 m）、Q / E 转 15°（Shift 5°，人和站位改 `yawDeg`，体块和地标改 `ry`）、Delete 还原选中的 / 删选中的标记、Ctrl+Z 撤销、Ctrl+Y / Ctrl+Shift+Z 重做、Esc 先取消拖动 / 放标记 / 选择，什么都没有才关图。画布有焦点时 WASD 不走（界面根拦着），点回 3D 画面照常。
- **画法**（只在全关总图、只在开着时；小地图和 3D 不变）：挪过的东西画在新位置（关键帧点、人、要点、下一步、地标都替换；人的去向箭头从新位置画起）；挪过的体块在原位置盖一层纸色 + 虚线框、新位置按原样式填色 + 金边；其余挪过的在原位置一个空心小圈、细虚线连到新位置；选中 = 金框 / 金圈，悬停 = 虚线圈 + 名字与坐标小牌，拖动中 = 挪动量小牌。说明标记 = 紫色圆钉 + 号 + 一行字（≤ 26 字，超出省略），带半径的再画一个虚线圆。
- **加标记**：工具栏第二个按钮（或检查器提示）→ 在图上点一下放一个点，按住拖开 = 圈一片（半径取整到 0.5 m）；放好后检查器里的文字框自动有焦点，直接敲字（敲字时 M / . / P 不触发编辑器按键）；检查器里还能改 x / z / 半径、删掉。
- **检查器**：没选中 = 操作说明；选中一个 = 是谁（`id`、语义、文件里的路径）、x / z / 朝向可以直接敲数、「原来 x z」、还原；站位多一个「跳到这个关键帧」；选中多个 = 各类几个、还原这几个、取消选择。
- **导出给 Agent**（工具栏金色按钮）：同 §4.2 的写剪贴板三级退路（`navigator.clipboard` → `execCommand` → 弹出文字已全选的框，框头「布设调整」）。文字格式（`Script_EditorBlockoutLayoutEdit.FormatLayoutEdit`）：
  ```
  【滕县白盒编辑器 · 布设调整】
  关卡：第一关 06–10（FirstLevel0610）
  文件：配置 Taierzhuang1938/Blockout/FirstLevel0610.json；场景 Taierzhuang1938/Blockout/FirstLevel0610.scene.json
  导出时停在关键帧：08-2
  在全关总图上挪了 3 处、加了 1 个说明标记（都只在编辑器里看，没存盘；按下面改到文件里）。

  挪动：
  1. 体块 KitchenNorth、KitchenSouth、… 等 10 块一起往东 3 m、往北 1 m（场景 blocks / gates 里按 id 找；各自的新坐标见数据行）
  2. 地标「狗洞」 LmDogHole（场景 landmarks[3]）：(81.50, 488.00) → (82.30, 487.10)，往东 0.8 m、往北 0.9 m
  3. 友方人「罗班长」 Luo（配置 keyframes[9].units[0]）：(100.00, 430.00) → (101.00, 430.00)，往东 1 m；朝向 10.0° → 25.0°

  说明标记：
  ① x 83.0  z 486.0，半径 4 m 这一片：「狗洞再往东一点」　附近：狗洞（LmDogHole） 在西南 1.3 m
  怎么改：……
  数据：{"schema":"tengxian-blockout-layout-edit/1", …}
  ```
  最后一行 `数据：` 是整份导出对象（`schema: "tengxian-blockout-layout-edit/1"`；`moves[]`：`kind`（landmark / block / unit / poi / next / station）、`id`、`name`、`file`（scene / config）、`keyframe`（只对人 / 要点 / 下一步 / 站位）、`path`、`from`、`to`（`x, z`，人和站位带 `yawDeg`，体块和地标带 `ry` 弧度）、`dx`、`dz`、可选 `dYawDeg` / `dRyDeg`；`markers[]`：`n`、`x`、`z`、可选 `radiusM`、`text`、`near[]`（15 m 内最近 4 个有名字的东西：kind / id / name / distM / dir 八方位））；`ParseLayoutEdit(text)` 找这一行解析回来。
- **agent 收到这段文字时**：数字以 `数据：` 行为准。`file: "config"` 的直接改 `Blockout/<Level>.json` 里 `path` 指的那一项（关键帧 id 用 `keyframe`，编辑器 2 s 内同步）；但 0105 / 0610 / 1218 的配置是关键帧生成器导出的，**用户手改过的 JSON 为准**，要不要同步回生成器（`Script_EditorBlockout<Level>Keyframes.mjs` / `Data_…Space.mjs`）看那一关的口径。`file: "scene"` 的地标 / 体块在场景文件里，场景文件是生成器烘的：改 `Script_EditorBlockout<Level>Scene.mjs` / `Data_EditorBlockout<Level>Space.mjs` 里对应的常量再 `node Taierzhuang1938/Script_EditorBlockoutCli.mjs scene <Level> --force`（只改 JSON 会被下次重烘冲掉）；第一关旧版（`FirstLevel`）没有场景文件，体块是游戏布局表。一座房子整组挪的体块合成一行，各自新坐标看数据行。说明标记是用户的话：按 `text` 去改，`near` 帮着认是哪儿。
- **已采纳**：配置重读（外部修改同步）、地标读回来、切关键帧时，总控拿数据里现在的位置对一遍（`LayoutEditSession.Reconcile`）：已经等于改到的位置（6 cm 内、朝向 0.6° 内）的条目拿掉并提示「有 n 处已经改到文件里了」；挪过但还没到位的把「原来」更新成新的数据位置。体块要重进这一关（场景文件重读）才对得上。
- **模块**：`Script_EditorBlockoutLayoutEdit.mjs`（纯，零 three / DOM：`LayoutEditSession` 改动记录 + 撤销栈 200 步、`BuildLayoutEditExport` / `FormatLayoutEdit` / `ParseLayoutEdit`）；`Script_EditorBlockoutMapEdit.mjs`（DOM + canvas 2D，零 three：`BlockoutMapEdit` 开关、工具栏、检查器、拾取、拖动、画）；`BlockoutMap` 加 `SetEditLayer(layer)` / `editing`，`BuildItems` 的每项带 `src`（块原来的 id / 位置 / 尺寸），导出 `BlockCorners` / `BlockStyleFill`；`BlockoutMapScene` 的块带 `id`；`BlockoutUi` 加 `mapHead` / `mapBody` / `mapCloseButton` / `SetMapHint`，`ShowCopyText(text, title)`，焦点在输入框里时编辑器按键不触发；总控 `PushEditContext` / `ExportLayoutEdit`，`Debug.Blockout.LayoutEdit`（`SetActive` / `State` / `Session` / `Export` / `Text` / `Copy` / `Context` / `Focus` / `ScreenPoint`）。
- **门禁**：`Script_EditorBlockoutLayoutEditTest`（纯 node）、`Script_EditorBlockoutMapEditBrowserTest`（浏览器，0610 08-1 真鼠标：拖狗洞、拖幺娃、框选整座灶屋拖、加标记敲字不串键、Ctrl+Z / Y、方向键、导出进剪贴板能解析、关掉后点关键帧照常跳、配置与场景文件逐字节不变）。

### 4.5 手机验收（触屏层，2026-10-23）

用户原话（10-23）：在外面、用 iPhone、只能打开 github.io，要能验收 agent 做完的白盒效果流程；**除了界面要收一收，游戏画面尽量和 PC 一致，不做画面割舍**（枪和手照留）；虚拟摇杆一直要有；减内存、手机上批注这一轮不做。所以手机验收就是**线上（Pages）的同一个编辑器**，加一层触屏输入，画面、画质、阴影、第一人称都不动。线上本来就不能存盘（§7），手机上「复制当前位置」照旧进剪贴板，贴进手机上的 Claude 对话就行。

- **开关**：触屏设备自动开（`matchMedia("(hover: none) and (pointer: coarse)")`，手机 / 平板）；`?touch=1` 强制开、`?touch=0` 强制关。桌面不开，什么都不变。模块 `Script_EditorBlockoutTouch.mjs`（只有 DOM，零 three；`WantsTouch`、`StickAxes` 是纯函数，数值在 `BLOCKOUT_TOUCH`）。
- **转视角**：屏幕空处单指拖动。一块铺满全屏的透明板（`#blockoutTouchLook`，z 1：画布与 HUD 之上、编辑器界面 z 30 与开发工具 z 40 之下，加载画面盖着时不出），手指位移 × `lookScale`（2.4，手指 1 px 当鼠标 2.4 px）交给宿主的 `Look(dx, dy)`，与鼠标走同一个 `input.lookX / lookY`（飞行中 `Script_Main` 照旧转给飞行相机）。透明板拦下触屏补发的兼容鼠标事件（不抢指针锁、不开枪、不换枪），`touchstart` 上 `preventDefault`（不双击放大、不弹长按菜单）。预演播放中、总图开着时拖动不转头。
- **摇杆**（左下，导航栏上方，常驻）：帽最远 48 px，死区 0.12，出死区后 0→1 重新爬；`ApplyMove(input)` 在 `Script_Main.ReadKeys` 读完键盘之后把它写进 `input.forward / strafe`（键盘按着方向键就让键盘），**手指拖到圈半径的 1.3 倍以外 = 冲刺**（圈亮金）。飞行中摇杆推飞行相机（`FlyAxes()`，`UpdateFly` 把它和键盘相加后夹在 ±1），拖出圈外 = ×4 加速。预演中摇杆变暗不吃手指；总图开着时收起。
- **大按钮**（右下一列，导航栏上方）：预演（这一帧有预演才出现，播放中变「停止」）/ 飞行（飞行中写「退出」）/ 地图。飞行中左边再一列：升 / 降（按住，同 E / Q）、加速（开关，同按住 Shift；退出飞行复位）。预演中只留「停止」。
- **界面收一收**（根上 `boTouch`、`body` 上 `blockoutTouch`，样式在 `Style_EditorBlockout.css` 末节）：卡片默认收成一行（阶段号 + 标题 + 站位名 + 展开箭头），点这一行展开 / 收起，展开后限高可滚、不压摇杆（`BlockoutUi.EnableTouch / SetCardCollapsed`）；右上关卡下拉 + 图层开关 + 音量 + 状态点收进「图层」按钮的面板（点空处收起，关卡列表就地展开）；小地图让位给摇杆（地图走右下按钮）；按键提示、悬停提示（触屏上会粘住）、记机位（线上只能存本机草稿）、卡片上的预演 / 飞行钮（挪到右下）、编辑布设开关与图例收起；游戏 HUD 的弹药与状态读数收起（准星、受伤反馈、帧率照留）；导航栏铺满底边、按钮 44 px，竖屏去掉计数；竖屏（≤ 560 px 宽）卡片挪到齿轮那一行下面铺满宽，帧率挪到左上角。刘海与底部横条按 `env(safe-area-inset-*)` 留边（`index.html` 已是 `viewport-fit=cover`）。iOS 的 `100vh` 比看得见的高，触屏下画布改用 `100dvh`（渲染尺寸本来就取 `innerHeight`，不改会被纵向拉伸）。
- **全关总图**：同一套 pointer 事件（`Script_EditorBlockoutMap`）：两根手指 = 以两指中点缩放 + 平移；手指点关键帧的拾取半径 24 px（鼠标 11）、10 px 以内的抖动还算点；两下快点（320 ms 内、30 px 内）= 回到全图。总图头的提示换成手势说明。
- **音频**：iOS 只把「手指抬起」算作能解锁音频的手势，开机挂的那次 `pointerdown` 解不开；触屏层在每次 `touchend` / `pointerup` 调宿主的 `UnlockAudio()`（`Script_Main` 里判断 `audio.ctx.state` 不是 running 才 `Unlock()`）。Safari 的双指缩放整页（`gesturestart`）拦掉。
- **宿主钩子**：`CreateBlockoutEditor` 多给 `Look`、`UnlockAudio` 两个函数；`ReadKeys` 末尾 `blockout.TouchMove(input)`。调试口 `Debug.Blockout.Touch()`（摇杆、飞行轴、转视角累计；没开 → null）。
- **门禁**：`Script_EditorBlockoutTouchBrowserTest`（§10）。真机（iPhone Safari）的帧率、内存、手感只能用户在手机上看，测试里用的是 Chromium 的手机模拟 + CDP 真触摸事件。

## 5. 关键帧、过渡与标记

### 5.1 切换

- `GoTo(index, { animate })`：玩家立即传送到新关键帧的 `player`（保留武器弹药，不走 `player.Spawn` 的整套复位）；卡片 / 导航 / 地图立即换成新关键帧。
- `animate` 只在「从第 i 个到第 i+1 个」（`.` 或导航栏点下一个）时为真；其余跳转（后退、跨多个、切关、首次载入）一律直接到位。
- `Y` 重播：先把单位摆回上一关键帧，再播进入当前关键帧的过渡。

### 5.2 过渡规划（`PlanTransition(prevKf, nextKf)`，纯函数）

- 两边都有的 `id`：`mode: "move"`，沿 `nextKf` 里该单位的 `path`（没有则直线）从旧位置走到新位置；每人按自己的自然速度（`speedMps` 或缺省）走，很短的挪动拉长到 0.6 s；走动时朝向顺着行进方向，最后 0.4 s 转到目标朝向；姿态在到达时切换（目标是蹲 / 卧则蹲着走）。
- 整段（最慢的那个人）超过 8 s 时**不提速，整段快进**：`playbackRate = durationS / 8`，消费方每帧按 `dt × playbackRate` 推进计划时间，演员动画也用同一倍率；导航栏在过渡中显示「快进 ×2.4」。
- 只在新关键帧有的：有 `path` 则 `mode: "appear"` 从 `path[0]` 走进来，否则原地出现（地环闪一下）。
- 只在旧关键帧有的：`mode: "vanish"`，过渡开始时消失（地环闪一下）；旧关键帧给了 `intent` 的，先沿 `intent` 走完再消失。
- 输出：`{ durationS, playbackRate, wallS, units: [{ id, mode, walkIn?, walkOut?, route, length, speedMps, startS, endS, from, to, unitFrom, unitTo }] }`；`SampleTransitionUnit(entry, t)` / `SampleTransition(plan, t)` 给出 t 秒（计划时间）时每人的 `{x, z, yawDeg, stance, moving, visible, speedMps, done}`。实现在 `Script_EditorBlockoutConfig.mjs`（已提交，各包直接用；要改先和集成负责人对齐）。

### 5.3 默认射界

`DefaultArc(unit)`：机枪（Type11 / Type92Hmg / Zb26）`{halfDeg: 25, rangeM: 70}`；战车 `{halfDeg: 20, rangeM: 90}`；其余单位不画（除非数据给了 `arc`）。图层开关「射界」有三档：全部（含按 `aim` 的步枪默认 `{halfDeg: 30, rangeM: 45}`）/ 只画数据给的与机枪战车（缺省）/ 关。

### 5.4 场景信号

- 当前关键帧 `signals` 里的名字视为「已发生」。`Script_Main` 每帧的 `SyncScenario` 回调加一句 `|| !!blockout?.Signalled(name)`（一次性 `OpenGate` 会被下一帧冲掉）。
- 往回跳到信号更少的关键帧：调一次 `battlefield.RestoreScenario({ signalled })`，再 `nav.Refresh(battlefield, { spread: true })`。
- 第一关（按剧情时刻，不按阶段起点）：`BunkerCollapsed`（01-2 起）、`MissionCourtyardGateOpen`（10-1 起，老耿开后门那一刻）、`MissionBridgeDestroyed`（13-2 起，第一轮扫射时记）、`RailBridgeDestroyed`（18-3 起）、`NightGateShown`（只在 18-4）。名字以 `MISSION_SCENARIO_SIGNALS` 与门的 `signal` / `appearSignal` 为准，生成器负责写对；运行时与测试一律读配置里的 `signals`，不按阶段号推。

### 5.5 3D 标记（`Script_EditorBlockoutMarkers.mjs`）

- 全部画在 `post.AddDebugOverlay(root)` 里（默认白盒画质会把场景里的 Sprite / Points 藏掉、把普通 Mesh 涂灰，debug overlay 不受影响）；颜色做曝光补偿（`root.userData.PrepareDebugOverlay`，照 `Script_EditorAi` 的 `AiOverlayGeometry`）。
- 每个单位：脚下地环（敌 `#d6604a`、友 `#9dc0e4`、百姓 `#9fc47f`、推测 = 虚线）；朝向短箭头；射界扇（贴地、半透明填充 + 描边）；去向虚线箭头（贴地）。
- 射界扇只画深度测试那一遍（不穿墙）、填充很淡（不透明度约 0.1）、描边细；扇子起点离相机 6 m 以内的整片淡出（第一人称低机位时近处的扇子会糊满屏幕）。地环、箭头、光柱照常两遍。
- POI：细光柱 0→8 m + 地环；下一步目标：金色光柱 0→14 m + 呼吸地环。
- **看得见 / 被挡住两种画法**：同一组几何画两遍，一遍做深度测试（亮），一遍不做（暗、半透明）。被墙挡住的人也能找到，但一眼分得出「现在看不看得见他」。图层开关「穿墙显示」关掉第二遍。2026-10-20（用户「标记盖住前景」）：叠加层和第一人称的手 / 枪共用一份深度，原来穿墙那一遍不做深度测试、半透明地盖在枪和手上。现在两遍都做深度测试，片元深度最近只算到离眼 1.25 m（`BLOCKOUT_FOREGROUND_M`；游戏的视图模型整支压在 `depthBudget` 1.22 m 内）：看得见那一遍取 max(自己, 1.25 m)，穿墙那一遍钉在 1.25 m——手和枪挡得住标记，1.25 m 外的墙照旧穿透；代价是贴脸 1.25 m 内的墙也不再穿透。只改 `gl_FragDepth`，不读预通道（白盒画质不跑预通道）。
- 头顶 DOM 标签池：有名字的显示「色点 + 名字」，无名普通兵只显示色点三角；120 m 外只保留有名字的与机枪；按近到远避让；下一步目标在屏幕外时贴边显示箭头 + 「下一步 · 文字 · 距离」。标签挂在单位的世界位置上（不挂 `actor.root` 子节点）。
- **三层新标记（2026-10-20，用户「每个人、每个关键位置、每个特殊 POI 区域加标记，都要能开关」）**。纯规则在 `Script_EditorBlockoutMarkerRules.mjs`（零 three / DOM，node 测试 `Script_EditorBlockoutMarkerRulesTest`），画法在 `Script_EditorBlockoutMarkers`，俯视图在 `Script_EditorBlockoutMap`：
  - **每个人都有标签**：「标签」开关改三档 `labels: "named" | "all" | "off"`（`true` / `false` 仍认 = named / off）。`named` = 原样（有名字的「色点 + 名字」，无名的只有色点，无名机枪写「机枪」）；`all` = 无名的人按身份兜底（`UnitFallbackText`：国军 / 日军 / 百姓 / 小孩 / 军官 / 日军军官 / 伤员（倒地的国军、百姓）/ 日军（倒地）/ 担架 / 驴车 / 战车 / 牲口 / 机枪），同一帧里同一种兜底不止一个时带 id 的尾号（`Walker04` → 「国军 04」，`UnitLabelTexts`）；距离、避让照旧，120 m 外仍只留有名字的与机枪（远处不会满屏）；`off` = 一个都不挂。
  - **地标**（场景文件 `landmarks`，§2.2；`SetLandmarks(list)`，开关「地标」缺省开）：按 kind 分色（`BLOCKOUT_LANDMARK_COLORS`：洞 / 缝粉 `#ff6fd8`、门青 `#3fe0e0`、窗紫 `#a98bff`、坑 / 窖薄荷绿 `#5ef0a8`、片区白 `#f2f2ee`、物件黄绿 `#c9f05a`、地名米白 `#e8e8e0`——和敌 / 友 / 百姓 / 要点 / 下一步 / 危险的颜色都不撞，测试钉着）。有 `w / d` 的画贴着它的亮线框（每边外扩 0.08 m、薄的撑到 0.3 m 厚、高至少 0.3 m；四个侧面与顶面淡淡填一层 0.16，远看是一块发光的盒子，线框边离相机 2.5 m 内填充整片淡掉、6.5 m 外不淡（石碾贴脸时那块填充会糊半个屏幕；按 0.1 一档量化、跨档才重建）；给了 `y` 就从 `y − h/2` 立起，窖是从坑底立到地面）；片区不立盒子、画贴地的虚线描边，`radiusM` 画虚线地环，地名脚下一个 0.8 m 的小地环；每个都竖一根细光柱（3.4 m，片区 / 地名 2.6 m，至少高过线框顶 0.6 m）、顶上两片交叉的小旗；DOM 标签挂在柱顶（方点 + 名字，有 `note` 跟一行小字），10 m 内有线框的改挂在线框顶上（第一人称里柱顶早出画面了），160 m 外不挂标签（线框照画）。被挡住的照「穿墙显示」画第二遍。几何只算到角点 / 高度这一步（`LandmarkGeometry`），画在 `_RebuildLandmarks`。
  - **站位**（`SetStations(list, index)`，开关「站位」缺省开）：这一关所有关键帧的 `player` 点：地上一个小三角朝着那一帧的 `yawDeg`（0.5 m；当前帧 0.7 m、亮色 `#ffd56a` 并带 0.9 m 地环，其余 `#f7e9c3` 淡一半），按顺序连一条 0.09 m 宽的细虚线（玩家这一关怎么走）；标签「拍号 + 名字」（`StationLabel`：「08-3 压窗口」），220 m 外不挂、离相机 2 m 内（就站在它上面）不挂。全关总图上的关键帧点与路线本来就有；小地图上加了同样的点与虚线（`PaintMiniStations`）。
  - 取证：`Debug.Blockout.Landmarks()`（这一关归一化后的地标）、`Labels()`（此刻挂着的标签文字，按 `units / pois / landmarks / stations` 分）、`Stats().markers` 多给 `landmarks / stations / unitLabels / landmarkLabels / stationLabels`。截图验收 `_shots/EditorBlockoutMarkers/`（不提交）。

```js
export class BlockoutMarkers {
  constructor({ post, camera, groundAt, labelRoot })
  SetUnits(units /*现场位置 + 数据：id,side,kind,name,x,z,yawDeg,arc,intent,guess,visible*/)
  SetPois(pois); SetNext(next /*{x,z,text}|null*/); SetLayers({ arcs, intents, labels, xray, landmarks, stations });
  SetLandmarks(list /*NormalizeLandmarks 的结果*/); SetStations(list /*[{id,name,x,z,yawDeg}]*/, index); LabelInfo();   // 2026-10-20
  Update(dt)   // 投影 DOM 标签；移动中的单位每帧重建它那几段几何，静止的不动
  Dispose()
}
```

### 5.6 演员（`Script_EditorBlockoutPuppets.mjs`）

- 独立演员：`host.actorFactory.Create(kind, { seed, weapon, modelVariant })`，挂在编辑器自己的 `Group` 下；**不进 `ai.soldiers`**（不被子弹打中、不挡人，这是有意的：这里只看布设）。
- 每帧 `actor.Update(dt, { moveSpeed: mps/3.6, moveSpeedMps: mps, locomotionTracked: true, aim, crouch, prone, grounded: true, ... })`；IJA 慢走装 `SetRelaxedGait(p, "alert")`，NRA 装 `InstallAllyGait(p)`（接受假 soldier 对象，实现时核对）。
- `kind`：`officer` → `ijaOfficer`/`nraOfficer`；`civilian`/`child` → `civilian`（child 缩放 0.62，若安全）；`tank` → 简单体块车身 5.75×2.18×1.9 + 炮塔块；`litter` → 担架块 2.1×0.7 + 前后两名抬担架的 NRA 演员；`cart` → 车块 + 可选 `animal` 块。
- 2026-10-20 正式模型（用户：白盒里的战车、飞机、树、牛车马车都用项目里现成的模型 + 动画）：`BLOCKOUT_PUPPETS.models`（缺省开）。
  - `tank` = 八九式 `Type89Tank`（`actorFactory.ModelInstance`，材质同 `Script_FirstLevelMissionView.BuildTank`）；炮塔转向 `arc.yawDeg`。车身摆法照旧（`TankGroundY`）。
  - `cart` = `Model_WoodenEvacCart` + 牛 / 马（`Script_DraftCartModel`，Walk 动画按走过的路程推，车轮跟着转，不滑步）；牲口取单位可选字段 `draft`（`"ox"` / `"horse"`），没写时名字带「牛」用牛、其余用马（驴车照游戏里老耿的车用马）；`animal: false` 不带牲口；车前 `hitchedAnimalM`（4 m）内另有 `animal` 单位时车自己的牲口藏起来（老耿的黑子拉车）。真车板顶 1.12 m，比 `BLOCKOUT_CART_SEATS` 的体块车板高约 0.1 m（坐车尾的人略低，数据没改）。
  - `animal` = 单独一匹马；`state: "down"` 侧躺、不迈腿。
  - 模型异步下载，下完前照旧是体块，载不进来就一直是体块；组上标 `whiteboxCharacter`，白盒画质里保留贴图。Probe 多给 `model`（`"Type89Tank"` / `"ox"` / `"horse"` / null）、`draftAnimalVisible`、`draftTravelM`。
  - 预演的飞机本来就是游戏机队的三菱 Ki-30 克隆（§14.2，`Script_EditorBlockoutPrevizAircraft`），不变。
- 2026-10-20 不打仗时不端枪（用户：下蹲、跑步、聊天这类大部分动作不会把枪拿在手上，换成看着正常的占位动作）。判断只看 `aim`：
  - 拿步枪（`BLOCKOUT_PUPPETS.slungWeapons`：汉阳造 / 三八式 / 中正式）、`aim` 为假的兵（国军日军一样）：站着 / 走 / 跑用游戏里的背枪步态（`Script_RelaxedGait` 的 `"slung"`：`RelaxedStand` / `RelaxedWalk` / `BackRifleRun`，枪挂背上）；蹲着不动、没在播片段时播 `PvCrouchRestRifle`（单膝跪、枪竖在身前歇着）。日军不戒备原来是端枪警戒步态（`"alert"`），现在也背枪；拿机枪的日军不戒备照旧 `"alert"`。
  - `aim` 为真：照旧端枪（国军友军步态、日军原生）。蹲着走、趴着、爬照旧端枪（没有空手的现成片段）；倒地的人手里的枪不动。
  - 预演片段：`PvStandTalkLowRifle`（右手提枪说话）运行时换成背枪版 `PvStandTalkSlung`（`PREVIZ_CLIP_REMAP`，数据不改）；`VilDuckProne`（卧倒抱头）进背枪表 `PREVIZ_WEAPON_SLUNG`。指路 / 招手 / 拦人（右手低提枪）、蹲着说话 / 歇着（枪竖着）不动。
  - 开场动作库与预演额外动作库改成编辑器一开就在后台下（`BlockoutPreviz.EnsureOpening`），不等第一次播预演（蹲着歇的片段要它）。
  - Probe 多给 `gait`、`rifleInHand`、`rifleOnBack`。
- 2026-10-21 担架用正式资产（用户）：`litter` 的担架换成全游戏同一副竹竿布兜担架（`Script_StretcherAsset`，`Model_BambooStretcher.glb`，开机就读了），挂在担架组下面，抬着 / 一头着地 / 放地上 / 挂车上的高度与倾角照旧（`LitterPose` / `ride`）；资产前头朝 +Z，这里转 180°、往下挪 0.09 m 让竿心落在原来体块竿子的高度。几何与材质全场共用。名字带「被」不带「担架」的 litter（01–05 两人拖的单被，`IsBlanketLitter`）不是担架：换成用户上传的五补丁单被（`Script_EditorBlockoutBlanket`，`Model_SingleBlanket.glb`，宽 1.4 m、长 1.9 m，见 `docs/Data_SingleBlanket.md`），头端朝前（单位朝向，拽的人那头）。Probe 的 `model` 给 `"BambooStretcher"` / `"SingleBlanket"`，被子多给 `blanketDrag`（0 没人拽 / 1 有角被拽着）与 `blanketCloth`（见下）。
- 2026-10-21 第二轮（用户：拖冬瓜的被子接一个比较基础的布料模拟）：单被走**布料模拟**（`Script_BlanketCloth.mjs`）。资产的 216 根变形骨是 18 行 × 12 列、全挂在 Root 下、静止朝向为单位阵、顶点按相邻四骨精确双线性蒙皮，所以一根骨 = 一个质点：世界空间里用 PBD 推这 216 个点（子步 1/90 s × 10 轮，2026-10-23 起 12 轮加长程系绳，见下；相邻不许拉长、压短较软，对角抗剪，隔一根很弱的抗弯），每根骨摆到质点上、朝向取该点布面的切线标架（法线跟着转）。顶点照旧 GPU 蒙皮，不改几何。每帧约 0.4 ms。
  - **谁拽**（`_BlanketEnv`）：别的单位此刻 `carryRole: "front"`、看得见、站在被头 3 m 内的人，按他在被子哪一侧拽哪个角，用那一侧更靠外的手的掌心（`rig.grips`，拖人片段 `PvBlanketDragL/R` 是外侧拳头攥被角）；手离那个被角的静止位置超过 2.5 m 不算。只有一边有人（另一边是玩家镜头）时另一角取镜像；都没人但被子在走（松手后往掩体后一拽、关键帧过渡）时两角贴地跟着被子走。两只拳头相距 1.62 m 比被头（1.4 m）宽，两边往里收到被头宽 × 1.04。被角以 3 m/s 挪到手上、到了就钉住。
    - **`dragSolo`（2026-10-23，被子单位的可选字段 / 预演演员键，§14.1）**：true = 只认真有手攥着的被角，另一角**不取镜像**、空着落地（都没人但被子在走时照旧两角贴地跟着走）。1218 14-5（第三版 10-26；第二版是 14-2）顺子扑倒松了手、只剩妮儿攥着一个角在拽就靠它（玩家那角是镜头、没有手，不写就一直「被攥着」）。预演键没写过时用单位的；Probe 多给 `blanketDragSolo`。
  - **身体**：倒着、骨盆落在被子范围里的人（冬瓜）整身胶囊（躯干、肩、头、胳膊、胯、腿，`BodyCapsules`）：身子正下方的点按在地上、水平跟着他走（静摩擦，`bodyHold` 0.8），其余推出胶囊；拽被角的人只算两条腿。地面用站人的地面（`standAt`），一下子比布高出 0.3 m 以上的实心块（路边弹药箱）不认，台阶按 1 m/s 渐进抬。被推开 / 被顶起的那一下限速，整体限 5 m/s（不然重铺时和身体交叠会把布弹上天）。
  - **重铺**：被子一帧挪 1.2 m 以上、`Apply` / 关键帧跳转、预演 `Seek` 时，按此刻的位姿平铺下去再空推 0.9 s（被角挪到手上、布落定）；`Settle` 在最后一步才重铺（大跳之后头一步人物模型还没跟上，手在上一个时刻的地方）。所以同一秒从哪儿 Seek 过来布都差不多一样（实测差 4 mm）。暂停的预演里人物原地走、布跟着手动。
  - **站位的物理限制**：拖人片段的拳头离地 0.77 m、在被子中心前 1.56 m（`STAGES.blanketDrag` 按 2.0 × 1.6 m 的被子摆的）；被子半边宽 0.7 m 比拳头高度还短，所以两手拽着时被头那条边中间落不到地上，被子会被手带着往前滑一截。冬瓜按关键帧平躺不动，于是他小腿伸出被尾约 0.3–0.5 m（真实拖人时人的头肩会被兜起来、整个人被往前带）。要改得在预演站位（`PULL`）或冬瓜的姿势上动，这里没动。
  - **2026-10-23 去「皮」感（用户：拖起来像一张皮，不像布料被子）**：实测旧参数下拳头旁一格被拉到 1.45–1.67 倍（尖角，像拉开的胶皮），压短 0.3 跑 10 轮实际接近不可压缩、堆不出褶。现在：12 轮；压短 0.02、抗弯 0.008、抗剪 0.3（布能堆、能垂）；**长程系绳**（`tether`）：每个硬钉的被角到其余各点的距离不超过静止距离 × 允许拉长，允许拉长在离被角 0.4 m 内是 1.02、到 1.9 m 线性放到 1.5（上面「站位的物理限制」：完全不可拉长时整床被子会从冬瓜身下被抽走，所以够不着的那段长度只许出在远离拳头、压在人身下的那段）；**攥一把**（`gatherSide` 1）：被角旁沿侧边那个点也软钉（0.15）到拳头下方 6 cm，拳头处布成团往下散褶。02-4 实测（Seek 6–14 s）：90% 的相邻点拉长 ≤ 1.06–1.10（旧 1.07–1.12），最大一格从 1.42–1.71 降到 1.20–1.83（大的那格在压住区边上、人身子底下）；冬瓜身下压住的行与旧版相当。被子本身是 1.4 cm 的双层壳（`docs/Data_SingleBlanket.md`），地面留 1.2 cm 不变（下层离地约 5 mm）。
  - **2026-10-31 吸血（用户：吸血的布弄到白盒里，看基本效果和位置）**：被子挂上布料测试场那套双面吸血（`Script_ClothBlood`，口径 `docs/Data_ClothBlood.md`，薄布档 `thin`），材质 / 几何是每副被子私有的克隆，多一个 sampler。出血点 = 倒地、骨盆落在被子范围里的人（同压布的判定）骨盆到胸口 0.6 处，正下方此刻是布上的哪一点（在布料质点此刻的世界位置里找包住它的三角形，按静止位置插值回被面 u/v；拖着走时人身下那块布跟着人滑，不能按被子根的平铺坐标算），正面渗、透到背面。重新铺平时出血点挪了 0.15 m 以上（或还没血）就清掉重来：倒 220 ml、当场空推 50 s 晕开（约 0.5 m²，约 0.2 s），之后每秒 1 ml 往外渗、总量 300 ml 停；挪动不大就不重算（拖预演时间条不卡，同一处 Seek 回去不擦血）。白盒只给位置和大概样子，不跟时间线逐帧对齐。参数在 `BLOCKOUT_BLANKET.blood`，Probe 的 `blanketCloth.blood` 给出血点（被面 u/v）、累计 ml、正反面面积。
  - **2026-10-31 冬瓜肚子上塞的毛巾（用户：他身上不是还塞了一块布么？）**：剧本 07「肚子上塞着一条毛巾，已经吸透了血」。`Script_EditorBlockoutWoundTowel`：倒地的人里名字是「冬瓜」的（或单位写 `woundTowel: true`；写 `false` 不塞）肚子上加一条叠起来的毛巾（0.20 × 0.25 m、厚 3.5 cm，程序化几何，不做布料模拟），每帧按骨盆→胸口与两肩摆到肚子正面（离脊柱 0.15 m）；站起来就拿掉、跟人一起拆。贴图借布料测试场毛巾样片的底色与法线，普通 `MeshStandardMaterial`；网格标 `whiteboxCharacter`（白盒画质是编辑器默认，不标会被刷成灰网格、血迹补丁看不见）。吸血同一套 `ClothBlood`（毛巾档 `towel`）：贴肚子的背面接血，造出来时倒 30 ml 空推 45 s（透到正面、边上浅），之后每秒 0.1 ml、到 45 ml 停。参数 `BLOCKOUT_WOUND_TOWEL`；Probe 的 `woundTowel` 给显没显示、累计 ml、正反面面积。
  - Probe 的 `blanketCloth`：`headL/headR/tailL/tailR`（世界坐标、离地、`held`、离手 `gapM`、钉点 `target`）、`topM` / `lowM`、相邻质点最大拉长 / 最小压短、贴地 / 被压住的点数、胶囊数、`resets`、`lastMs`、`root`、`lastReset`。`BLOCKOUT_BLANKET.cloth = false` 退回原来两条静态姿势（`Blanket_Flat` / `Blanket_DragPose` 按 moving 插值）。闸门：`Script_BlanketClothTest`（纯 Node，真 GLB）与 `Script_EditorBlockoutBlanketClothBrowserTest`。

### 5.7 树（`Script_EditorBlockoutTrees.mjs`，2026-10-20）

- 布局里标 `blockoutTree` 的块：第一关的 `treeModel` 树干块（`BlockoutBlock`，树高 `treeHeightM` = `treeModel.heightM`），场景文件里细高的 `foliage` 块（`IsSceneTreeBlock`：脚印 ≤ 1 m、高 ≥ 2 m，即 `DeadTree_xx`，树高 = 块高）。这些块 `visual: false`：只留碰撞，不画盒子。
- 同一位置种游戏里的枯树（`Model_BreakableDeadTree.glb` 的 Stump + Crown 树皮，不要断口盖），按树高 ÷ `BREAKABLE_TREES.heightM` 等比缩放，朝向按 id 散开，根埋 0.09 m；一关一只 `InstancedMesh`，`battlefield.layout` 换了就重种。不会被炸断。`Stats().trees` = `{ ready, failed, count }`。
- `state: "down"`：倒地姿态（用现有 `dead`/`prone` 状态，实现时选能用的）。2026-10-18：倒地的人放在身体周围 0.9 m 内**最低**的地面上（不再悬在土埂斜坡上方；陡沟壁上仍会斜躺，数据里把倒地位置放到沟底）。
- 2026-10-18：演员脚下的地面 = max(高度场, 点落在其脚印内、顶面比高度场高不超过 1.0 m 的实心块顶面)（`Script_EditorBlockoutPrevizPlan.BlockStandSampler`，总控 `standAt`；脚印按 `ry` 旋转判，gates 只算此刻在场的，水 / 空气墙不算）：机枪坑射击台、台阶上的人站在台上，洞顶、胸墙这种高块不算。关键帧摆人、预演的 eye 镜头与锚点、倒地、战车、3D 标记都用它；俯视图、地形上色、水面仍按纯高度场。战车按车身脚印上中心、四角、四边中点 9 处取**最高**的地面放（`TankGroundY`），压过沟时停在沟沿上而不是掉进沟底；蹲、卧的人一律按戒备姿态（原生 `KneelHold` / `CrouchIdle`），不被友军步态换成扛枪半蹲；有 `castId` 的单位用定妆身体（`SpeakingCastOptions`），按需下载的身体（如翻译 NRA06）先下完再造人（`PrepareCasts`），翻译不拿枪。
- 2026-10-26 `standOn`（§2.2）：写了 `standOn: true` 的块不受上面那 1.0 m 的限制——点落在它脚印内、顶面比这一点已有的地面高，就站到它顶上（再高也算）。最小做法：只改 `BlockStandSampler` 一处判断（`!e.standOn && 顶 − 高度场 > maxStepM` 才跳过），别的块、别的关卡不变；`Script_EditorBlockoutPrevizPlanTest`「站人取地：standOn 的块…」钉住，0105 / 0610 的关键帧 / 预演 / 场景测试照旧全绿。1218 铁路桥上的担架、兵、老耿妮儿（关键帧与预演）因此踩在枕木顶上走过桥。注意：走道是常驻块，**炸断的北头两孔上头走道还在**（看不见、站得上去）——预演与关键帧在 `BridgeBlown` 之后不往断孔上摆人（1218 PrevizTest 查），玩家实体在那两孔上也会踩在空中，游戏里做的时候要换成随信号的走道。
- 2026-10-18（第二轮）：
  - **倒地的人扶得起来**（2026-10-21）：关键帧 / `spawn` 里倒着的人，预演键 `state: "alive"` 那一帧就站起来（原来不起身：倒地是 `Actor` 里一次性的 `ragdollState`，`dead:false` 撤不掉，只有播片段时被片段盖住才像站着）。`BlockoutPuppets._Pose` 见到「不倒地了、人还倒着」就把这个人重造一遍（`_Revive`，同关键帧之间「从倒地站起来就重造」），同一帧强推一步；之后再写 `state: "down"` 是新人从头倒，`lie:"along"` 照样按 `DeathCollapseC` 落定、重新量头的方向再摆。站着背枪（§5.6 背枪步态）的人倒下后枪不再挂在背上（原来竖着戳出来）：拿回手里，由倒地动作摆在身边，同造出来就倒着的人。门禁 `Script_EditorBlockoutPrevizRuntimeBrowserTest` 第 7 项。
  - **倒地的人移动只平移**：`state: "down"` 的人在关键帧过渡和预演里换位置时 `moveSpeed` 记 0、`dead` 照旧（原来一「走动」就不算倒地、会站起来走），姿态保持躺着，位置平滑滑过去（拖被子、抬担架）。
  - **`lie: "along"`**（单位或预演键）：倒地姿态是按种子抽的死亡片段，头朝哪边不固定。人倒下落定后（造出来就直接落定）量一次头相对骨盆在人物本地的方向，以后每帧把整个人转到「头朝 `yawDeg` 的前方」、骨盆放在单位位置上；在播片段时不转（片段自己定姿势）。不写 `lie` 的照旧。
  - **武器**：预演键 `weapon`（阶跃）调 `actor.SetWeapon(id)` 换手里的家伙（`null` = 空手），没写过 = 造人时 / 关键帧那把，交还驱动时换回去。关键帧之间同一个人武器变了：两把都不是空手就地 `SetWeapon`，不再整个重造（空手 ↔ 拿武器要换步态，照旧重造）。
  - **大刀戒备**：手里是近战家伙（`weaponData.kind === "melee"`，如 `Dadao`）、站着不动、没播片段、不在抬担架时，给 `actor.Update` 带 `meleeCombat: { weapon, state: "idle", action: "Guard", clip: "DadaoGuard", … }`、`aim: 0`（同开场导演的 `meleeGuard`），不再端着大刀摆步枪据枪。
  - `Probe(id)` 多给：`down`、`lie`、`moving`、`dead`（已倒地落定）、`weapon`、骨盆 / 头的世界 xz、`headYawDeg`（头相对骨盆的世界朝向，`lie:"along"` 时 ≈ `yawDeg`）、`rootYawDeg`。
- 2026-10-18（第三轮，用户「小毛病全都修掉」）：
  - **`lie:"along"` 摆法**：原来骨盆落在单位位置上；倒地片段都是侧身蜷腿，骨盆居中时一只脚伸出 0.7 m 宽的单被（冬瓜，脚离被边 −0.24 m）。改成量一次「头、骨盆、两脚」，把它们的包围框中心放在单位位置上，身体轴在「骨盆→头」±8° 里取横向最窄的方向（头朝向仍与 `yawDeg` 差 ≤ 8°）；要顺着躺的人倒地片段固定用腿蜷得最窄的 `DeathCollapseC`（四段实测两脚离身体轴：C 0.41–0.44 m、B 0.48–0.53、D 0.55–0.59、A 0.56–0.59），倒着的人在关键帧之间换成 `lie:"along"` 时重造一次（好按 C 重新倒）。
  - **投弹**：预演键 `throw`（§14.1）→ 主角本人播步兵投弹片段 `GrenadeThrow`（`Script_InfantryAnimation`「背枪投弹」，游戏里 `Actor.BeginGrenadeThrow` / AI 齐投同一个片段，实测 4.23 s）：`actor.PlayImportedAnimation("GrenadeThrow")` 定住片段，片段时间按 `drive.throw.seconds` 直接设（Seek 确定）；手里的手榴弹由 `Actor._UpdateInfantryProps` 照游戏原样挂在片段的 grenade 挂点上、2.15 s 脱手后藏掉；抡的时候不举枪、不播开场片段。骨架上没有这个片段 → 记进 `Previz.State().missingClips`，照原生动画。
  - `Probe(id)` 再多给：`headY` / `pelvisY`（世界高度）、`feet`（两脚世界坐标）、`deathVariant`、`throwing`、`grenadeVisible`、`throwClipS`。
- 2026-10-19（白盒预演补齐，运行时包）：
  - **百姓 / 小孩换成能放片段的骨骼占位身体**（`kind` civilian / child、`side:"civ"`，含担架上百姓的抬杆人）：用 NRA 士兵骨架造人（`actorFactory.Create("nra", { modelVariant: 1 /* TengxianNra02，预演动作库都烘在它上面 */, weapon: null, noPool: true, uniformPalette: <十六进制色> })`），走空手步态；外观改成一眼认得出是老百姓：军装布按种子换成百姓的深蓝 / 黑 / 土布 / 靛青（`CIVILIAN_RIG_LOOK.cloth`，`Script_Actor.Create` 新认 `options.uniformPalette`，`Script_UniformColors.UniformMaterial` 新认十六进制色；不给 = 游戏老路一字不变）、帽徽 / 腰间枪套 / 胸前带子按材质名藏掉（`CIVILIAN_RIG_LOOK.hideMaterials`）。**军帽摘不掉**：它与军装是同一个网格、同一张图集，占位接受。`child` 照旧整体缩到 0.62，布固定深蓝（`CIVILIAN_RIG_LOOK.childCloth`，2026-10-23：按种子抽到土布褐时近镜头里像个兵）。只在白盒编辑器里当占位，不进 `Data_CharacterSelection`、不影响游戏正片。旧的程序化身体留作开关：单位 / 预演 `spawn` 写 `body: "procedural"`（§3），缺省 `BLOCKOUT_PUPPETS.civilianBody = "rig"`；两种之间切换时重造。
  - **军官**（nraOfficer / ijaOfficer，NRA05 / IJA01）本来就是骨骼身体，预演额外动作库并进它们的骨架后片段照播，运行时不拦；0610 的 PrevizTest 已放宽成「百姓 / 军官只许通用片段」（0105 的不动）。
  - `Probe(id)` 再多给：`body`（`"rig"` / `"procedural"`）、`bodyKind`、`rigged`、两手世界坐标 `handR` / `handL`、`mixerTime`（动画时钟，量慢动作）、`shownClip` / `shownClipSeconds`（开场动作层此刻真在播的片段）、`hiddenParts`。
  - 门禁：`Script_EditorBlockoutPrevizRuntimeBrowserTest.mjs`（§10）。
- 2026-10-20（挂到车上，用户「人挂不到车上」）：
  - **`ride`**（单位字段 §3 / 预演键 §14.1）：这个人或担架每帧的位姿 = 车（`cart` / `tank` / `litter`）**当前**位姿 ∘ 本地偏移 `{x, z, yawDeg}`，根高 = 车底下地面 + `y`，**不贴地、不走路**（关键帧过渡与预演的位置键都不管用：预演校验报警告、运行时 `Drive` 报一次），片段照播。车的位姿从车那个 puppet 自己的状态算（`_CarrierPose`：预演驱动值优先，不读它的 three 对象），所以同一帧先摆谁都一样；`Apply` / 过渡取样改成「先写完所有人的状态再摆」。挂着的担架平放（不按 `LitterPose` 抬 / 斜），担架组原点 = 布中心。车不在场时按自己的 `x, z` 落地。
  - **驴车尺寸实测**（`BLOCKOUT_CART_SEATS`，从 `BLOCKOUT_PUPPETS.cart` 量）：车板一整块 1.5 宽 × 2.4 长 × 0.55 厚、中心离地 0.75 → **车板顶 1.025 m**、车板底 0.475 m；白盒车没另做尾板，**车尾板顶 = 车板顶 1.025 m**，车尾沿在本地 `z = +1.2`（`tail: { x: 0, z: 1.2, y: 1.025, yawDeg: 180 }`），车辕朝 −z；车板中间 `bed: { x: 0, z: 0, y: 1.025 }`；担架平放车板上 `litterY = 1.075`（布 0.1 厚、布底贴车板）。
  - **坐车尾的人怎么算 `y`**：`y = 车尾板顶 − 片段坐高 × 缩放`（`SitRootY(seatY, clipSitH, scale)`）。`VilSitEdge` 的根在屁股正下方的地上、坐沿在根上方 **0.90 m**（清单 notes），小孩缩 0.62 → `y = 1.025 − 0.90 × 0.62 = 0.467`；大人坐车尾 `y = 0.125`。例（妮儿 07 坐车尾、背对车头）：
    ```json
    { "id": "Nier", "side": "civ", "kind": "child", "x": 54.5, "z": 156.2, "yawDeg": 90,
      "ride": { "on": "GengCart", "x": 0, "z": 1.2, "y": 0.467, "yawDeg": 180 } }
    ```
    预演里下车：`{ "t": 12, "ride": null }`，之后再写位置键才管用；临时上车：`{ "t": 3, "ride": { "on": "GengCart", "z": 1.2, "y": 0.467, "yawDeg": 180 }, "clip": "VilSitEdge" }`。挂到车上的担架（12–18 冬瓜那副）：`{ "kind": "litter", "bearers": 0, "ride": { "on": "GengCart", "z": -0.2, "y": 1.075 } }`，上面躺的人另写 `ride` 到同一辆车（`y` = 1.075 + 0.05，`state: "down"`、`lie: "along"`）。
  - `RideWorldPose(carrier, ride)` 是纯函数（本地 → 世界，与 `TankGroundY` 的脚印旋转同式）。`Probe(id)` 多给 `ride`（写的是什么）、`seat`（这一帧算出的世界位姿 + `carrierY` 车底下地面）、`rootY`、`rootAboveCarrierGround`。实测（RuntimeBrowserTest）：小孩 `VilSitEdge` 的骨盆落在车板顶上下 0.1 m 内、车走 5 s 两处取样位置误差 < 0.05 m。
- 距离分级：60 m 外每 3 帧更新一次动画，阴影只在 25 m 内开；趴着的人 25 m 外（`proneSkinFitM`）不做逐顶点防陷地（传 `proneSkinFit: false` 给 `ProneGroundContact`，身体顺坡与手脚贴地照做——2026-10-20，07-4 飞机过顶全队卧倒那一拍原来一帧 50 ms 花在这）；单关同时上限 120 个演员，超出时远处的只留地环与标签（报警告）。
- 切关、重载配置时全部回收；同一关切关键帧时按 `id` 复用。

```js
export class BlockoutPuppets {
  constructor({ scene, actorFactory, groundAt, library })   // library：战车材质（2026-10-20）
  Apply(units)                 // 直接到位
  Transition(plan, fromUnits, toUnits)
  get transitioning()
  Update(dt, cameraPosition)
  Live()                       // → [{ id, x, z, yawDeg, moving }]
  Dispose()
}
```

## 6. Script_Main 薄钩子（只加判断，不放规则）

1. `const BLOCKOUT = EDITOR_PARAM === "blockout";`；`SANDBOX` 加 `BLOCKOUT`；`PHASE_TABLE` 第一个分支 `BLOCKOUT ? BLOCKOUT_PHASES`；`START_PHASE` = `BlockoutLevelIndex(params.get("level"))`。
2. `WORLD_CLASSES` 把各 `Blockout_<key>` 映射到 `FirstLevelWhiteboxField`；`BuildField` 在 `new World(...)` 前 `await phase.blockout?.Prepare?.()`，并对 blockout phase 跳过 `AddExternalProps` / `AddTrimProps`。
3. `EnterLevel`：blockout phase 跳过 `companion.BeginLevel`、`setpieces.BeginLevel`；`story.BeginLevel` 传 `{ beats: [] }`；最后的分支加 `else if (BLOCKOUT) { state.pinned = true; }`（在 `SeedSoldiers` 之前）；`Frame` 里每 3 s 的补兵对 BLOCKOUT 不做。
4. 不建主菜单；启动完成后直接 `StartRun()`，加一次性 `pointerdown` 解锁音频；动态 `import("./Script_EditorBlockout.mjs")` 并构造，挂 `window.Tengxian.Debug.Blockout`。
5. `Frame` 里紧跟 `editor.UpdateOverlays(dt)` 调 `blockout?.Update(dt)`；`SyncScenario` 的 `signalled` 加 `|| !!blockout?.Signalled(name)`；`case "map"` 在 BLOCKOUT 下改调 `blockout.ToggleMap()`。
   全关总图开着时（`blockout.CapturesMouse()`）：`RequestPointerLock` 不抢锁、键位路由的 `Guard` 返回 false（不开枪、不起右键拖动转头）、`mousemove` 不转头、`cycleSlot`（滚轮）不换枪；键盘照常（M / Esc 关图、WASD 走动），所以不并进 `UiCapturing`。
6. 玩家无敌 / 无限弹药：只在本会话生效，不调会写 localStorage 的 `SetDebugOption`。
7. `Script_Main` 在文本门禁里：新增代码不得含中文字面量；需要的玩家可见文字走 `T()`。

### 6.1 `window.Tengxian.Debug.Blockout`（测试与 agent 用）

```js
State()      // → { level, index, id, count, transitioning, units, configState, mapOpen, pointerLocked }
GoTo(idOrIndex, { animate }) // → Promise（过渡结束才 resolve）
Next(); Prev(); Replay();
SwitchLevel(key)             // → Promise（新关卡与配置都就绪才 resolve）
Reload()                     // 重读配置
Units()                      // → 演员现场位置
ToggleMap(open?); SetLayers(partial);
Config()                     // → 归一化后的配置（深拷贝）
PlacePlayer(pose)            // 把玩家摆到任意机位，不改关键帧（相机要等下一帧才转过去）
Snapshot(); SnapshotText()   // §4.2 快照对象 / 贴给 agent 的文字（取的是相机当前朝向：摆完人先等一帧）
CopySnapshot()               // 真去写剪贴板 → Promise<{ ok, method: "clipboard"|"execCommand"|null, text }>
Probe(id)                    // 某个演员此刻的样子（§5.6）
StandAt(x, z)                // 站人的地面（2026-10-18 第三轮，取证用）
Fly(on?, pose?)              // 飞行观察（§4.3）：进 / 出（不给 on = 切换；进时可带机位 {x,y,z,yawDeg,pitchDeg}）→ FlyState
FlyState()                   // → { active, x, y, z, yawDeg, pitchDeg, speedMps, boost, keys, entered, origin:{camera,player}, player, camera, canEnter, previz }；camera 是 Three 相机此刻的真实位姿
FlyPose(pose)                // 飞行中把相机摆到任意机位
```

### 6.2 总控（`Script_EditorBlockout.mjs`）

- 启动：读 `BLOCKOUT_LEVELS` 与当前关卡配置 → 校验（错误进状态点与提示条，配置坏了仍能走场景）→ 建 UI / 地图 / 标记 / 演员 → 跳到 `kf` 指定的关键帧。
- 切关：回收演员与标记 → `await JumpToLevel(i)` → 重新取 battlefield 等（一律经 getter，旧引用会失效）→ 读新配置 → 地图 `SetScene` + `Bake` → `history.replaceState` 改 URL。
- 外部修改同步：页面可见时每 2 s 读一次配置文本，变了就重新归一化并按当前关键帧 `id` 重新摆（不重建场景）；状态点蓝闪 + 提示条。这是「AI 改完 JSON、编辑器里自动看到」的闭环。
  - 只换进**能解析、校验通过、有关键帧**的配置；改坏了（半截文件、校验错误、文件暂时不见）就保留上一份能用的配置与当前位置，状态点变红并写原因、只提示一次，期间「记下当前机位」拒绝保存。首次载入时配置就坏，才退回只有出生点的空配置（场景照样能走）。
  - 玩家只在当前关键帧的 `player` 块变了、或这个关键帧被删掉时才挪位置；改别的（单位、文字、POI）不打断人在场景里走动。
- 下一步指示：每帧算玩家到 `next` 的距离与相对角，喂给卡片箭头。

### 6.3 地形与水的样子

- 地形：高度色带（低处偏冷偏暗、高处偏暖偏亮，幅度克制）+ 白盒网格线；没有贴图、草、碎石、壕沟表面网格。
- 水：北沙河等水块要读得出是水，不能是灰盒子。第一关旧版仍走 `BuildWhiteboxWater`（正片河水着色）。
- **河沟示意（2026-10-22，`Script_EditorBlockoutCreek.mjs`，数据 `Data_Tuning_Whitebox.BLOCKOUT_CREEK_LOOK`）**：用户「河汊子最好简单的表现一下他的材质，不然我想象不出来」。只改编辑器这一层，不碰 Space / Scene 生成器 / 场景 JSON：
  - 文件场景的水块（`semantic "water"` / `blockoutWater`）顶面铺浑水贴图（`Texture/Editor/Texture_EditorCreekWaterBase.webp`，世界 xz 平铺 2 m、不透明度 0.88），网格 `BlockoutWater` 标 `whiteboxWater` + `whiteboxTerrain`（白盒画质「保留地形贴图」原样画，不换成蓝灰水色）。
  - 地面上**挨着水块的那一圈**按水块自己认（不针对哪一关写坐标）：逐顶点算到水块脚印（含 `ry` 旋转）的水平距离 `near`（≤ 3.5 m 满、8 m 淡到 0）、比水面高多少 `low`（≤ 2.2 m 满、3.4 m 淡到 0）、坡度 `steep`（1 − 法线 y 从 0.3 起、0.55 满）；泥权重 = `near × max(low, steep)`，写进顶点属性 `blockoutMud`。河汊子（沟深 3、水深 1、壁 2.5 m）：沟底、两壁、岸沿全是泥，岸上再往外约 4.5 m 渐淡。没有水块的关卡全 0、逐位不变。
  - 地面材质挂 `MUD_PATCH`（装在米格线补丁前面）：按权重把高度色带混成湿泥贴图（`Texture_EditorCreekMudBase.webp`，世界 xz 俯视投影 1.5 m 一张；三向投影在 45° 坡上出人字纹，弃用）、粗糙度压到 0.55，泥上的米格线再压一道（褐色上 15% 看不清）。
  - 两张贴图 Lovart 快速模式 GPT Image 2 生成（提示词 `_import/Prompts/Texture_EditorCreek*.txt`，清单 `EditorCreekMud / EditorCreekWater`，tier=editor），本地边缘交叉淡化去接缝后缩到 1024 webp；源图在 `tmp/EditorCreekTex/`（不进仓库）。截图 `_shots/EditorBlockoutCreek/`。
- 方块：沿用默认白盒画质的灰网格材质。
- **地面涂色（2026-10-20）**：场景文件写了 `paint`（§2.2）时，`DressWorld` 先按高度查表上色，再逐顶点把顶点的**世界** (x, z)（`mesh.matrixWorld` 换算；地面网格本来就在原点）丢给 `layout.groundPaint.Blend` 混进涂色（sRGB 里混，再换线性写进顶点色）；覆盖度 0 的顶点照旧写查表色。地面网格 0.5 m 一个顶点（`terrain.cellM`），20–60 m 宽的田块边界清楚。没有 `paint` 的关卡不进这条路，顶点色逐位不变。
- **块保留语义色（2026-10-20）**：场景文件 `colorSemantics` 列出的 semantic，`DressWorld` 把用这些语义材质的静态块网格标 `whiteboxCharacter`、补米格线，并让白盒渲染器重判一次（`post.whiteboxScene.Invalidate()`）；其它块照旧灰网格。
- 全关总图（Map 模块）在「blocks」那一步、路和块之前，把 `paint` 以 0.32 × strength 的不透明度铺一层（多边形填、折线按 2×halfW 描）。
- **远景层（2026-10-20，`Script_EditorBlockoutBackdrop.mjs`）**：场景文件写了 `backdrop`（§2.2）时，总控每帧 `backdrop.Sync(layout)`（布局换了才重建）：
  - 远景地面：围着场地一圈圈往外的环形网格（离场地边 −1.5 / 0 / 1 / 3 / 6 / 10 … 4000 m 和 `radiusM`，沿边 2 m 一个点）。−1.5 那一圈在场地里、比场地低 0.4 m 垫底（场地边上万一有缝，透出来的是地不是天），0 那一圈正好在场地边、高 = 场地网格（低 1 cm 让场地赢），往外按 `backdropGroundAt`。顶点色 = 场地高度色带（按边上那点的高）往 `ground.color` 过渡。
  - `paint` 用 `RasterizeBackdropPaint` 画成一张 RGBA 图（最长边 ≤ 4096 像素、≤ 显卡上限，01–05 是 4096×2295、1.83 m 一个像素；预乘累积，没涂到的像素 a = 0、rgb = `ground.color`，外框一圈透明），sRGB、mipmap、各向异性 ≤ 8。着色器按世界 (x, z) 取图、按覆盖度盖在顶点色上，再叠编辑器的米格线（场地地面同一个补丁，远了自己淡掉），出色之后按 `haze` 往远处变淡。
  - `box` / `blob` / `hill` 各合成一个网格（顶点色、同一份材质 + 变淡补丁）；`tree` 交给 §5.7 的树（`BlockoutTreeSpots` 多收远景层里的 `tree`，根按 `backdropGroundAt`，没有碰撞）。
  - 网格都标 `userData.whiteboxTerrain`（白盒画质保留地形贴图时原样画）+ `blockoutBackdrop`，不投影、不剔除；加进场景后让白盒渲染器重判一次。
  - `Debug.Blockout.Stats().backdrop`：`built / far / meshes / vertices / triangles / shapes / texture / rasterMs / buildMs / cameraFar`。
  - 01–05 实测：4 个网格、约 5.9 万顶点 / 8.8 万三角形；建一次约 0.6 s（其中画图 0.45 s），之后每帧 4 次绘制。

## 7. 存档（`Script_EditorBlockoutStore.mjs` + 本机端点）

- 读：`fetch("./Blockout/<Level>.json?t=" + Date.now(), { cache: "no-store" })`；404 / 非 JSON 视为没有配置（界面提示）。
- 写（只在本机 LocalPreview 下可写）：`GET /__blockout/status`（只收 GET / HEAD）→ `{ writable, root, revisions: { <Level>: "<sha1 原始字节>" | null }, reason? }`（不可写时 `reason` 写原因）；`POST /__blockout/save`，body `{ level, doc, revision }`：`revision` 必填（字符串，文件不存在时才可为 `null`），`doc.level` 必须等于 `level`。成功 200 `{ ok, level, file, revision, warnings }`（客户端留下返回的 `revision` 供下次保存）；状态码：方法不对 405、非本机 / Host / Origin 不对 403、Content-Type 不对 415、超 4 MB 413、坏 JSON / 校验不过 / 嵌套过深 400（校验不过 / 嵌套过深时带 `details`）、level 或路径不对 403、版本号不符 409（带当前 `revision`）、写盘失败 500。
- 版本号 = 文件**原始字节**的 sha1（工作区是 CRLF 时也一样）：客户端读配置时按响应的原始字节（`arrayBuffer`）算 sha1，作为「我改的是哪一版」随保存发出；不得用状态口当下返回的版本号（那会把外部刚改的内容静默盖掉）。
- 端点（照 `Script_TextureImportServer` 的加固写法）：本机 socket + Host 只认 localhost / 127.0.0.1、`Content-Type: application/json`、同源 Origin、body ≤ 4 MB、`level ∈ BLOCKOUT_LEVEL_KEYS` 且路径过 `BLOCKOUT_CONFIG_FILE_RE`、解析后路径必须在根目录下、`ValidateBlockout` 不过返回 400 + `details`、`revision` 不符返回 409、`.tmp` + rename 原子写（`JSON.stringify(doc, null, 2) + "\n"`）。任何拒绝都不落一个字节。路由放在 405 闸之前。场景文件 v1 不开放写。
- 不可写时（Pages、测试服、局域网、旧的预览进程）：存进 `localStorage`（键 `tengxian1938_blockout_<Level>`）+ 提供下载 JSON，界面写明原因。
- 编辑器 v1 只有一个写操作：「记下当前机位」= 把玩家当前位置 / 朝向 / 姿态写进当前关键帧的 `player` 并保存。其余改动直接改 JSON（人或 AI），编辑器 2 s 内同步。
- 关键帧机位的蹲 / 趴只管那一帧的画面（2026-10-20）：玩家离开机位走出 0.35 m 就自动站起来（头顶 1.0–1.8 m 有东西时先不站）；玩家自己按过 C / Z 之后就不再替他改。所以「记下当前机位」前要蹲着拍，就在机位上按 C。
- 根 `CLAUDE.md`「本地预览」与 LocalPreview 头注、`--help` 补这条端点。

## 8. 第一关关键帧清单（生成器按这张表出 `Blockout/FirstLevel.json`）

机位来源写的是现有数据里的 id：`K*` = `Data_FirstLevelSpaceKeyframes`，`G*` / `NN_n` = `Data_FirstLevelWhitebox0518Cameras`；写坐标的是锚点。机位找不到时用阶段出生点 + 看向 `next` 目标，并在 `notes` 里写明。`what` / `next` / `how` 是这次定的设计文字（来源：Notion 正文 + 10-12 改稿），生成器原样写入；单位、POI、信号由生成器从游戏数据算。

| id | 阶段 | 站位 | 机位来源 | what | next（目标） | how |
| --- | --- | --- | --- | --- | --- | --- |
| 01-1 | 1 炮火后的活人 | 洞内开场 | K1i | 洞里补弹说笑，传令兵从后交通壕跑来喊撤 | 跟着出洞（洞口） | 传令兵的喊声先到；众人出洞的方向就是撤退方向 |
| 01-2 | 1 | 压在塌木下 | K1 | 被塌顶木压住；日军贴着炮进沟，清折角、补刀、审问冬瓜 | 活下来，只能转头（02 的枪从台阶响） | 转头范围只放关键人物；汉阳造一直在画面下沿；台阶要在转头范围里 |
| 02-1 | 2 枪到手里 | 还权位 | K2b | 班长塞枪，顺子站起来能打了；前方还有日军 | 第一处完整土壁 | 班长先跑过去回头招手；敌人在反方向开枪；还权后 3.5 s 不挨打 |
| 02-2 | 2 | 后交通壕折角 | G02_3（缺则 G02_1） | 沿后交通壕撤，过了折角木框就是集结处 | 背坡集结处（−37,−101） | 折角木框（两柱一梁）；担架和伤员 = 安全；追兵在身后 |
| 03-1 | 3 夺取右侧阵位 | 集结处东北角 | G03_1 | 守军报信：老周和守军被一挺机枪困在土坎后，班长掉头往北 | 跟班长进支沟 | 班长往北走；逆着撤下来的伤兵；北边一直有老周的机枪声 |
| 03-2 | 3 | 观察射台 | K3 | 班长停下来依次指：被困的守军、缺口、右边破墙冒火的机枪 | 打掉右边破墙那挺机枪（阵位 24.9,−153.9） | 班长三指；机枪火光一直在前面；任务字 |
| 03-3 | 3 | 夺下的机枪座 | K4 | 夺下阵位；侧翼组和拔刀军官反扑，第一批 5 人从缺口撤 | 守住，直到第一批人过缺口 | 守军从左边跑过缺口；刘文财数人数；路弯后传来发动机声 |
| 04-1 | 4 战车压上来 | 机枪座看路弯 | K6 | 战车带四名跟车步兵开出路弯；守军死在缺口里；远处坡上一辆车在烧 | 打跟车的步兵 | 何有田喊「战车」；子弹打车只「当」一声；缺口里倒下的守军 |
| 04-2 | 4 | 阵位后墙 | K7 | 射口待不住退到后墙；日军翻进阵位前半边，隔着院子对打 | 跟班长走支沟 | 炮弹砸射口、班长回头招手；后墙看不见战车；守军说弟兄抱着弹摸过去了 |
| 05-1 | 5 支沟捡弹炸车 | 支沟去程 | G05_4 | 沿支沟往东北；日军从路边钻进沟；战车隔一会儿轰一下沟沿 | 沟中段倒下的弟兄（捡弹点） | 沟只有一条、班长在前；站起来就挨打；钻进沟的敌人有来路 |
| 05-2 | 5 | 捡弹点 | 锚点 bundleDrop，看向沟口 / 战车 | 先前抱弹的弟兄倒在沟里，两捆集束弹在他身边 | 沟口攻击位，车的侧面 | 班长「就是他，弹还在」；尸体朝沟口倒；车的侧面已在画面里 |
| 05-3 | 5 | 攻击位 | K9 | 车侧 8–10 m；先和班长打掉靠近这边的两名跟车 | 先扔履带边，再扔车尾后甲板 | 班长「它在打口子！就现在！」；第一捆后车一歪停住；第二捆冒黑烟、车组弃车 |
| 05-4 | 5 | 缺口重开 | K10 | 车哑了，跟车步兵退；最后两人过缺口，接防的人上来 | 原路撤回集结处 | 接防的人从后交通壕上来；走的是来时的沟 |
| 06-1 | 6 集结处接令 | 借火位 | K11 | 回到集结处；老周讨火；坡上妮儿在捡弹壳 | 借完火跟担架上坡往南 | 老周开口讨火；队伍起身上坡；坡上浅色的路；南边交通沟塌了 |
| 06-2 | 6 | 坡顶 | G06_3（缺则 G06_1） | 小路两边院墙和挡土墙，把路收成一条 | 南行沟 | 两边墙收路；担架队在前 |
| 07-1 | 7 沿沟南行 | 沟中 | 07_1 | 沿沟往南，顺子和幺娃说悄悄话；妮儿在沟沿上跟着 | 沟南口 | 沟只有一条；抬头看见沟沿上的妮儿 |
| 07-2 | 7 | 担架停点 | 锚点 southMouthHold，看向 mouthEmbankment | 东边田埂上机枪一响，担架停在沟口 | 压住东边机枪 | 机枪一响担架就停；何有田「东边！机枪！」；任务字 |
| 07-3 | 7 | 沟口土坎 | 锚点 southMouth，看向村北口 | 机枪压住了，担架冲过空地；两人往村里绕；妮儿先跑进村 | 村北巷 | 刘文财「有人往村里绕」；电线杆通向村子；村北口烟柱 |
| 08-1 | 8 主街受阻 | 村北口巷子 | G08_1 | 进村，巷子尽头是丁字口 | 主街口 | 车辙压进主街；班长先往主街口走 |
| 08-2 | 8 | 主街北口 | G08_2 | 主街被倒墙和翻车堵死；东窗机枪顺街扫；自己人蹲在街口压东窗 | 担架进墙后，找侧路 | 先看见街堵了；自己人的枪口指着威胁 |
| 08-3 | 8 | 回头朝西 | G08_3 | 老耿揪着妮儿出来，指自家灶屋；西边还有一条夹道 | 灶屋门或西侧夹道 | 老耿指门；灶屋门开着挂灯笼；两个入口要在同一画面里 |
| 09-1 | 9 穿屋到后院 | 灶屋过道 | G09_1 | 过道里被扑倒，按 F 反刺；连屋有人隔窗扔手榴弹 | 连屋 | 门那头最亮 |
| 09-2 | 9 | 西侧夹道 | 锚点 westAlleyNorth，看向 westAlleySouth | 2.4 m 宽的夹道，走到一半机枪屋侧门窜出人 | 后院（尽头的驴车） | 夹道只有一条；尽头看得见驴车 |
| 09-3 | 9 | 后院 | 锚点 westAlleySouth，看向侧屋窗口 | 两条路汇到后院；侧屋窗口机枪扫院门；屋顶上有扔手榴弹的 | 从侧面绕过去打掉窗口机枪 | 机枪扫院门 = 现在不能走；妮儿拍车板指屋顶 |
| 10-1 | 10 守巷口出村 | 院门东侧墙角 | 锚点 laneEast，看向巷尾草垛 | 老耿拔闩开后门；追兵分两拨从绕行巷东头来，巷尾草垛有机枪 | 守住巷口，让担架过门 | 追兵从门楼方向来；担架从身后过门 |
| 10-2 | 10 | 出村 | G10_2 | 担架都过了门，出村 | 村南门楼 | 门楼最高、挂灯笼；车辙 |
| 11-1 | 11 桥头接运点 | 出门楼 | G11_1 | 接运点：车、担架、走路的伤员；老耿的驴车在队里 | 交伤员上车，找老耿问路 | 东墙降矮看得见墙后；老耿骂驴先听到 |
| 12-1 | 12 掩护装载 | 低墙射位 | 12_3 | 村口低墙；追兵从门楼方向跃进；妮儿在墙根捡弹壳 | 守住，让车一批批走 | 何有田「右边有人」；刘文财「这批过了」；墙高 1.05–1.2 m |
| 12-2 | 12 | 回头看装载区 | 12_3 位置，看向 cartBoard | 老周的担架被抬上老耿的驴车，车头朝南 | 去车尾搭一把手 | 何有田「去搭把手」 |
| 12-3 | 12 | 驴车车尾 | 12_4 | 坐车往南；回头看低墙越来越远 | 坐车 | 车动了 |
| 13-1 | 13 空袭 | 车上 | 13_1 | 飞机扫路；黑子倒下，妮儿扑笼头被幺娃抱走 | 跳进路边浅沟 | 有人喊「飞机」；弹着从路那头犁过来 |
| 13-2 | 13 | 浅沟爬起 | 13_2 | 车走不了；老耿捆上锅抓住担架；接运兵指西沟 | 西沟口 | 接运兵手指；担架队往沟口走；地上的泥路 |
| 14-1 | 14 转入西沟 | 抬担架走向沟口 | G14_1 | 顺子抬老周后端；飞机在远处回转 | 沟口 | 沟口一直在画面中间；幺娃「它又转回来了」 |
| 14-2 | 14 | 沟口 | 14_1 | 顺子松手扑进沟；老耿先抓住抬杆 | 拿起枪，进沟 | 班长「枪拿起来」；追兵从车路方向来 |
| 15-1 | 15 降压步行 | 沟内收拢 | 14_2（或 G15_1 前一站） | 沟里点名：「没遭你松啥子手？」 | 跟队首沿沟走 | 班长「走西边沟」；刘文财站在前面 |
| 15-2 | 15 | 沟尾坡顶 | G15_1 | 沟到头，坡顶路牌指向两道墙夹出的口子 | 进夹道 | 路牌；担架队右拐 |
| 15-3 | 15 | 夹道拐角 | G15_2 | 夹道尽头像死路；左手矮墙上方有灯笼杆 | 左拐 | 灯笼杆；前抬手「前头往左拐」 |
| 15-4 | 15 | 院门 | G15_3（或 15_1） | 瓦顶门楼；守军确认身份；妮儿在门口画驴 | 进院，去厢房 | 门楼是唯一去处；守军「站住！哪部分的？」 |
| 16-1 | 16 交接 | 厢房门槛 | G16_1 | 抬老周过门槛，放到床位 | 放下担架（床位） | 军医「这副放这里」 |
| 17-1 | 17 老周死亡 | 厢房内 | 17_1 | 军医：人没了；门外又抬来一副 | 无，等传令 | 门外正对关着的院南门 |
| 18-1 | 18 毁桥回城 | 接令 | G18_1 | 传令兵：回城，接住桥上的尾队 | 从后门出去去桥头 | 门开着 vs 门关着；HUD 新任务 |
| 18-2 | 18 | 南岸射位 | 18_2 | 尾队从北往南过浮桥；北边土坎有敌火 | 打断妨碍尾队的火力 | 何有田「北边土坎！」；尾队在桥上跑 |
| 18-3 | 18 | 爆破安全区 | G18_4（或锚点 blastSafe） | 撤出爆破区，浮桥炸断 | 往滕县（行军路） | 军官「撤！」；炸完「往滕县！跟上前队！」 |
| 18-4 | 18 | 夜入北门 | 18_3 | 夜里到北门外，城里在搬弹药、分防区 | 进门 | 门洞最亮；带路军人「补东边阵位的，跟我来」 |

必须写进 `notes` 的对照（Notion vs 游戏）：

- 05-1 / 05-2：Notion 正文仍是「旧弹药屋取弹」；10-12 改稿与游戏是「支沟里捡弹」。
- 11-1：Notion 设定全关只有北沙河一座桥；游戏这里看见的是 x=76 的路桥（单桥方案待定）。
- 12-2：射位回头要看得见这辆车（09-28 记录只有 z 84–90 一个口互相看得见）。
- 12-3：现在坐车转头只有 ±16°，回头看不到低墙。
- 15-1：Notion 要求 15B→15C 经北沙河桥由北往南过河；游戏现在走西沟浅滩。
- 18-2：Notion 写铁路桥，游戏 09-30 起是浮桥；北边敌人点离射位约 82 m，能不能看清人取决于雾。

单位来源（生成器）：`PhaseLayout(BuildOrchestrationModel(), n)` 取活跃 / 待命组（去掉 `FIRST_LEVEL_STAGE_CLEARED_ENEMIES[n]`，远处休眠组不放），逐人回读 `MISSION_ENCOUNTERS` 原始行拿 `faceTo` / `yaw` / `role` / `route` / `lane`，`MISSION_TACTICS` 给 `intent` 与后一关键帧的 `path`；03–05 用 `FRONT_*` 表、`FRONT_TANK_PATH`（战车 `kind: "tank"`）与检查点哨位；我方班组按各表的哨位（`P.bunker`、`OPENING.frontPosts`、`FRONT_SORTIE.leader*`、`P.streetBlock.frontParty`、`P.ambushSquadPosts`、`MID_TUNING.streetFight`、`END_TUNING`、`P.receptionYard`、`P.bridge`、`P.night`），表里没有的按出生点附近摆并标 `guess: true`；担架队 `BuildFirstLevelCheckpoint(n).column.litters`（07 以后）；老耿 / 妮儿 / 驴车按 `Data_Tuning_FirstLevel.geng` 与 `MID_TUNING.streetFight`；18 对岸取 `Data_FirstLevelBridgeFarBank` 的真 AI 组（人群不放）。坐标系各表不同（`MISSION_PLACEMENT` 的 yaw 注释是「0 朝 +z 南」、相机表是度、`END_TUNING` 是 0 朝北），生成器统一换成本文的 `yawDeg` 并有单元测试钉住。

## 9. 第二关草稿场景（`Blockout/SecondLevel.scene.json` + `SecondLevel.json`）

- 范围 X 400…640、Z −250…60（东关大街 x≈449、寨墙 x=540、地隙 x≈548–562、外侧田野到 640）。
- 高度：node 里用现有城区地面函数（`TengxianCity` 的 `GroundHeight`）按 1 m 采样烘成 int16 厘米网格；不改城区代码。
- 块：`Data_Tengxian.EAST_SUBURB` 的院落 / 地块（按院落级体块，不做单间房）、寨墙按门洞与两处缺口（(540,−24) 宽 16、(540,52) 宽 12）切段、`EAST_DEFENSE` / `PROP_PCG_DOCUMENT` 东线射击位与铁丝网位置做矮掩体。
- 配置：4 个关键帧，对应 10-12 拓扑草稿的四片空间（后街第二街垒 / 主巷与北侧院子 / 寨墙投掷线 / 外壕与地隙），`what` 写「第二关流程未定稿，这里只是空间占位」，`next` 留空，不放单位，只放 POI（寨门、两处缺口、地隙、东关大街）。所有坐标以 `Data_Tengxian` 现状为准（旧文档的 x=520 不用）。

## 10. 测试与验收

| 测试 | 类型 | 内容 |
| --- | --- | --- |
| `Script_EditorBlockoutConfigTest.mjs` | 纯 node | 校验器正反例；`NormalizeBlockout` 缺省值与 yaw 换算（三种来源各一例钉死）；`PlanTransition` 四种 mode、时长夹取、路径采样；两份提交的配置与场景文件通过校验；生成器两次输出除 `generatedAt` 外逐字相同；每个关键帧玩家点在关卡边界内、不在实心块里；单位不在实心块里（超出只报警告并列出） |
| `Script_EditorBlockoutSaveTest.mjs` | 纯 node | 起真 LocalPreview（`--root=<临时目录>`）：status 可写、save 写对文件、各种拒绝（坏 level、`..`、超大、坏文档、GET、错误 Content-Type、外来 Origin / Host、revision 不符）零字节落盘、无 `.tmp` 残留、仓库里的 `Blockout/` 前后逐字节相同；`/__notes/status`、`/__tuning/status` 仍正常 |
| `Script_EditorBlockoutLayoutEditTest.mjs`（2026-10-21） | 纯 node | 编辑布设的改动记录与导出（§4.4）：from / to、挪回原处就删、整组平移吸附挪动量、撤销 / 重做 / 取消、标记、`Reconcile`、导出排序与文字、`数据：` 行往返 |
| `Script_EditorBlockoutMapEditBrowserTest.mjs`（2026-10-21） | 浏览器（游戏） | 0610 08-1 上真鼠标走一遍编辑布设（§4.4 门禁那条）；截图与导出文字存 `_shots/EditorBlockoutMapEdit/` |
| `Script_EditorBlockoutMapTest.mjs` | 浏览器（临时 harness 页） | 纸面底色、块脚印、旋转块、等高线、各阵营标记颜色按像素数计（不看 `.visible`）；小地图以玩家为中心；全关总图缩放 / 平移 / 关键帧拾取 |
| `Script_EditorBlockoutBrowserTest.mjs` | 浏览器（游戏） | `?editor=blockout&level=FirstLevel&quality=whitebox&scale=small&audio=0` 启动；没有任务运行时、没有过场；关键帧数与配置一致；`GoTo` 后玩家位置误差 < 0.5 m；`Next` 过渡中单位位置连续变化（不瞬移）、结束后到位；切到 `SecondLevel` 后场景边界与地形变化、再切回；小地图与卡片像素非空；配置文件被外部改写后 3 s 内同步；全程无未捕获错误；截图存 `_shots/EditorBlockout/` |
| `Script_EditorBlockoutFirstLevel0105KeepInBrowserTest.mjs`（2026-10-21） | 浏览器（游戏） | 01–05 玩家出不了沟：剧本通路逐 0.25 m 在「沟里」且离隐形墙 ≥ 0.4 m；19 处低处 × 8 个方向跳 + 翻三秒每帧都在沟里；射击台翻不过胸墙；顺交通沟 / 支沟走得到；手榴弹飞出沟；预演里翻出沟的 NPC 照常出沟；无错（§13 末） |
| `Script_EditorBlockoutFlyBrowserTest.mjs`（2026-10-21） | 浏览器（游戏） | `FirstLevel0105` 上钉飞行观察（§4.3）：O 不与 `KEYMAP` / 编辑器键冲突；按钮 / O 键进，起飞位姿 = 进入时相机；W S A D E Q 位移 = 速度 × 时间、Shift ×4、抬头沿视线斜飞、穿墙不查碰撞、唯一的地面下限；滚轮 ×1.25 / 夹上下限且不换枪；鼠标位移（`Debug.Look` 与真 mousemove）转飞行相机、玩家不转；狂按游戏键与左右键后玩家位置 / 朝向 / 姿态 / 血量 / 弹药 / 槽位不变；小地图与全关总图（M）里有青色相机标记；P 复制的是相机位姿、重现链接带第 6 项并真能从该高度起飞；O 退出后相机回到进入时玩家视角（< 2 cm）、枪模还回来；预演中进不去、飞行中开播预演自动退出、切关自动退出；无未捕获错误 |
| `Script_EditorBlockoutTouchBrowserTest.mjs`（2026-10-23） | 浏览器（游戏，手机模拟） | 手机验收触屏层（§4.5）：`FirstLevel0105` 上 390×844（isMobile + hasTouch，CDP 真触摸、能多指）不带参数自动开；该收的收起、枪模照旧可见；卡片 / 图层按钮 / 齿轮 / 导航栏 / 摇杆 / 大按钮在屏内不重叠、按钮 ≥ 44 px；卡片点标题收起展开；空处拖动转视角（方向、量）；摇杆往前走、松手停、拖出圈外冲刺更快、摇杆与转头两指并用；飞行里摇杆 1 s ≈ 8 m、按住「升」、「加速」×4、玩家原地、退出复位；预演按钮开播 / 停止、预演中摇杆不吃手指、拖动不转头；总图双指放大、两下快点回全图、手指点在关键帧旁 14 px 也能跳；图层面板展开 / 开关 / 点空处收起；导航栏「下一个」；横过来 844×390 同样不重叠；桌面不开触屏层；无未捕获错误；截图存 `_shots/EditorBlockoutTouch/` |
| `Script_EditorBlockoutPlayPlanTest.mjs`（2026-10-31） | 纯 node | 试玩（§17）：编排校验正反例；不写 mode 的推断；谁变 AI（掷弹筒组 / 翻译 / 倒地 / 战车 / 友军 / keep 不变）、push 按 id 与 group、打死不复活 / fresh 复活 / bayonet / 上限 / 第一步不 approach；过关判断四种；提交的 `*.play.json` 零错零警告、预设成立、fight 步放得出人、01–05 每帧都写了 |
| `Script_EditorBlockoutPlayBrowserTest.mjs`（2026-10-31） | 浏览器（游戏） | `FirstLevel0105` 02-4 上走一遍试玩：面板预设与开关缺省；开打后不再无敌、子弹有数；追兵是真 AI、在沟底（离地 < 0.4 m、y < −1.5）、不再摆演员；顶条文字；打光 → 过关 → 02-5 先走过去再放兵（fresh）；K 中止出小结、兵与尸体全撤、规则还原；K 再来一遍；Esc 回到编辑演员回来；阵亡出小结并摆回 02-4 机位、宿主换人不晚到；02-3 看戏步播预演、N 跳过进 02-4；无错；截图存 `_shots/EditorBlockoutPlay/` |
| `Script_EditorBlockoutPrevizRuntimeBrowserTest.mjs`（2026-10-19） | 浏览器（游戏） | `FirstLevel0610` 的 06-2 上注入一段预演（page.route）：百姓 / 小孩 / 国军军官 / 日军军官都能播预演动作库的片段且姿态真的变了（蹲下片段骨盆比站着低 ≥ 0.25 m、举手片段手比没片段时高 ≥ 0.25 m、趴下片段骨盆 < 0.3 m）、`body:"procedural"` 的百姓还是程序化身体；飞机模型载进来、Seek 到航线中段位置等于 `SamplePrevizAircraft`、在视锥里且正对 `look` 飞机锚、扫射段画出土点、过了末航点不可见；慢动作窗口里 `timeScale` = rate、墙上跑 0.9 s 预演只走 0.3 倍、人物动画时钟与走路同倍率；中断后克隆还回机队；**2026-10-20**：一辆 spawn 的驴车走起来，坐车尾的小孩（`VilSitEdge`，`ride.y` 0.467）与车板上的担架（`y` 1.075）两个时刻都跟着车（位置 = 车位姿 ∘ 本地偏移，误差 < 0.05 m）、小孩骨盆落在车板顶 ±0.1 m、不走路；url 音效 `babyCry`（`page.route` 喂生成的 WAV）装进声库并真放出一条 voice、`cellarSob` 404 只警告一次并进 `missingSfx`（这一趟因此**不带 `audio=0`**）；全程无未捕获错误；截图存 `_shots/EditorBlockoutPrevizRuntime/` |

- 新模块登记 `index.html` import map（带 `?v=`）；`Style_EditorBlockout.css` 加 `<link>`；`Script_TestRunner` 登记上面四个测试与 `changedDomainRules`（`Blockout/` 目录归 editor 域）。
- 验收只跑覆盖改动的测试（用户口径）；浏览器整趟每项 ≤ 2 次。
- 视觉验收看实际截图：`?quality=whitebox` 下 01-2、03-2、08-2、12-1、18-2 五个关键帧各一张 + 全关总图一张 + 第二关一张。

## 11. 分工

| 包 | 独占文件 | 说明 |
| --- | --- | --- |
| A 数据与生成 | `Script_EditorBlockoutFirstLevel.mjs`、`Data_EditorBlockoutFirstLevelStations.mjs`（§8 表）、`Script_EditorBlockoutSecondLevel.mjs`、`Script_EditorBlockoutCli.mjs`、`Blockout/*.json`、`Blockout/README.md`、`Script_EditorBlockoutConfigTest.mjs` | 纯 node；不碰浏览器模块。`Script_EditorBlockoutConfig.mjs` 已由集成负责人写好并提交：可以加函数、加校验，不改已有导出的签名与语义 |
| B 运行时 | `Script_Main.mjs`（只加 §6 的钩子）、`Script_EditorBlockoutEntry.mjs`、`Script_Editor.mjs`（只加 §1 的启动面板按钮）、`Script_EditorTest.mjs`（按钮数）、`Script_EditorBlockoutLevels.mjs`、`Data_FirstLevelP012Terrain.mjs`（只加 `terrainSampler` 钩子）、`Script_EditorBlockout.mjs`、`Script_EditorBlockoutPuppets.mjs`、`Script_EditorBlockoutMarkers.mjs`、`Script_EditorBlockoutStore.mjs`、`Script_EditorBlockoutBrowserTest.mjs`、`Data_Text_Boot.mjs`（若需要） | 先用 `Blockout/` 里的样例配置开发；C 的 `Script_EditorBlockoutUi.mjs` / `Script_EditorBlockoutMap.mjs` 未合入前，自己写同名同接口的最小占位实现（文件头注 `// STUB：集成时由 C 包替换`），合并时取 C 的 |
| C 界面与地图 | `Script_EditorBlockoutUi.mjs`、`Script_EditorBlockoutMap.mjs`、`Style_EditorBlockout.css`、`Script_EditorBlockoutMapTest.mjs` | 用 harness 页独立开发与测试；按 §4 接口交付 |
| D 存档与文档 | `scripts/Script_LocalPreview.mjs`（只加 `/__blockout/*`）、`Script_EditorBlockoutSaveTest.mjs`、根 `CLAUDE.md` 端点一条、`docs/Data_EditorSuite.md` 一节 | |
| 集成 | `index.html`、`Script_TestRunner.mjs`、`AGENTS.md`、`docs/Data_AgentReference.md`、本文 §12 | 由集成负责人做 |

各包 import map：只给**自己新建 / 修改**的模块加或抬 `?v=`（合并时冲突按「每个键取较新的戳」解决）。各包只在自己的分支提交，不 push、不合别人的分支、不改别人的独占文件。

## 12. 变更记录

- 2026-10-31（试玩）：新增 §17——卡片「试玩」/ `K` 选一段关键帧开打：那几帧的日军换成真 AI（守点 / 往玩家压、跨步留人、打死不复活），玩家不再无敌、子弹有数，一步打完自动进下一步（先走到站位再放兵），看戏步播预演，打完 / 阵亡 / 中止出小结；每关可选一份 `Blockout/<Level>.play.json`（01–05 已写）。模块 `Script_EditorBlockoutPlayPlan`（纯）/ `Script_EditorBlockoutPlay`；`Script_Main` 加无敌 / 弹药两处判断与 `ResetPlayer` / `ApplyDebugOptions` 两个宿主口；门禁 `EditorBlockoutPlayPlanTest`、`EditorBlockoutPlayBrowserTest`。
- 2026-10-25（关卡下拉照 Notion 四大段）：用户「明明设计了四个大段落，白盒剧本里只有 3 个」——11–14 和 15–18 合在 `FirstLevel1218` 一片场地里只占一行。§2 加 `parts` / `BLOCKOUT_MENU`：这片场地在下拉里拆成 11–14、15–18 两行，选 15–18 跳到 `15-1`，翻关键帧时当前行跟着变；`?level=FirstLevel1218_15` 直接打开 15–18。场地、配置、预演文件都不动。检查在 `Script_EditorBlockoutConfigTest`。
- 2026-10-23（手机验收）：新增 §4.5——触屏设备（或 `?touch=1`）自动加一层触屏输入：空处拖动转视角、左下常驻摇杆（拖出圈外冲刺，飞行中推相机）、右下预演 / 飞行 / 地图大按钮、飞行中升 / 降 / 加速；卡片收成一行、右上收进「图层」面板、小地图与按键提示收起；总图双指缩放、两下快点回全图、手指点选放大；iOS 抬手补解锁音频；游戏画面一样不动。新模块 `Script_EditorBlockoutTouch`，`Script_Main` 薄钩子（`Look` / `UnlockAudio` / `TouchMove`），门禁 `Script_EditorBlockoutTouchBrowserTest`。
- 2026-10-22（第一人称转视角身体跟着转、走路脚飘）：改在正片的第一人称身体上（白盒与游戏共用），口径见 [第一人称身体与持枪](Data_FirstPersonEmbodiment.md)「下半身」一节：站着转视角腿不动、超过 50° 才挪步转身；走路按走过的距离踩步、着地的脚锁在地上。
- 2026-10-21（01–05 防止玩家跳出壕沟）：场景块可选 `tag`（`airWall` 只挡玩家）与 `noClimb`（§2.2）；`Script_Player.ProbeVault` 认 `noClimb`、不隔着隐形墙翻；01–05 胸墙与板桥标不能攀、沟沿一圈 892 段隐形墙（`L0105KeepInWalls`），新闸门 `Script_EditorBlockoutFirstLevel0105KeepInBrowserTest`（§13 末、§10）。
- 2026-10-21（飞行观察 testFly）：新增 §4.3——`O` 键 / 卡片按钮进出一台不受碰撞的自由相机（WASD 沿视线、E 升 Q 降、Shift ×4、滚轮调速 0.5–400 m/s），玩家原地不动且不吃游戏输入，进时从当前视角起飞、退出相机自然回到玩家视角；预演中不让进、飞行中开播预演或切关自动退出；小地图 / 全关总图画青色相机标记（`MAP_COLORS.fly`，小地图以相机为中心）；`P` 复制的是相机位姿，`pose=` 多第 6 项相机高度；`Debug.Blockout.Fly / FlyState / FlyPose`；`Script_Main` 薄钩子（`BlockoutInputCaptured` 含飞行、放行 `map`、`FlyLook`、阴影框）；门禁 `Script_EditorBlockoutFlyBrowserTest.mjs`。
- 2026-10-21（编辑布设）：§4.4 全关总图图头加「编辑布设」开关：拖地标 / 体块 / 当前关键帧的人、要点、下一步 / 各关键帧站位，加说明标记，「导出给 Agent」进剪贴板（末行 `数据：` JSON）；不存盘、不动 3D；agent 改到位的条目自动拿掉。新模块 `Script_EditorBlockoutLayoutEdit`（纯）、`Script_EditorBlockoutMapEdit`（DOM + canvas），门禁 `…LayoutEditTest`、`…MapEditBrowserTest`。
- 2026-10-21（01–05 03-2 掷弹筒看得见）：顺子站上射击台看见坎后冒烟、嘭，跳下台后弹落坑东沿、台上东头的弟兄顺着台子掀翻落在台面上，再喊「丢弹筒！挪起走！」；`SHELL_032`、`PIT.pitNra1` 挪到机枪西边，见 §13 末「2026-10-21 03-2」。
- 2026-10-21（01–05 树不沿路种）：坑北大路两边、田间小路边成排的树去掉，换成田里零星 18 棵 + 远景层零星 14 棵（`L0105_BACKDROP_LONE_TREES`），见 §13 末「2026-10-21」。
- 2026-10-20（人名 / 站位 / 地标三层标记，都能开关）：§2.2 场景文件加可选 `landmarks`（七种 kind，`ValidateBlockoutScene` → `LandmarkIssues`，`NormalizeLandmarks`）；§5.5「标签」改三档（全部档无名的人按身份兜底、带 id 尾号）、新开关「地标」「站位」（右上同一排，缺省开，六个开关的选择记在 localStorage）；新模块 `Script_EditorBlockoutMarkerRules`（纯规则）+ `…MarkerRulesTest`；§4.1 俯视图画地标、小地图画站位；§15 0610 的场景文件填了 47 个地标（`L0610Landmarks`，坐标全取锚点表），SceneTest 钉地标齐、都在场地里、狗洞 / 墙缝 / 侧门 / 窖 / 北窗的框对得上；总控 `LoadLandmarks()` 进关后再读一次场景文件只取地标（`Script_EditorBlockoutLevels` 没动）。BrowserTest 加 0610 的地标 / 站位 / 三档 / 记忆用例。
- 2026-10-20（标记不压前景）：§5.5 3D 标记两遍都做深度测试、片元深度最近算到离眼 1.25 m，第一人称的手和枪不再被穿墙那一遍盖住（`Script_EditorBlockoutMarkers.BehindForeground`）。
- 2026-10-20（坑北第三版：照史料压平、窄条田、四个村子、东边低山）：§2.2 场景文件加可选 `backdrop`（远景层：远平面、远景地面、变淡、paint（poly / line / rects）、shapes（box / blob / hill / tree）），`ValidateBlockoutScene` 校验（`BLOCKOUT_BACKDROP`）、`LayoutFromSceneDoc` 交出 `backdrop` / `backdropGroundAt` / `cameraFar`、`ApplyLayout` 设 `phase.cameraFar`；§6.3 新模块 `Script_EditorBlockoutBackdrop` 画远景层，§5.7 的树多种远景层里的 `tree`；不写 `backdrop` 的关卡逐位不变、远平面照旧 650。§13 01–05 坑北压平、窄条田、散坟、村子挪进远景层（四个村子）、东边一串低山。
- 2026-10-20（坑北第二轮：田、路、村子看得见）：§2.2 场景文件加可选 `paint`（地面涂色，多边形 / 折线 + 半宽，按顺序叠）、`heightTint`、`colorSemantics`、`semanticColors`，`ValidateBlockoutScene` 校验、`LayoutFromSceneDoc` 给 `groundPaint`；§6.3 `DressWorld` 按高度上色后混涂色、列出的语义块在白盒画质里保留语义色，全关总图淡铺涂色；不写这些字段的关卡逐位不变。§13 01–05 坑北铺田块、大路北段与田间小路、村子挪到 290–365 m 做成 24 户。
- 2026-10-20（通用动作换成 Kimodo）：§14.5 本机 Kimodo 文生动作换掉 7 条手 K 的预演通用片段（说话 ×2、指、挥手前进、停止手势、逃跑、卧倒），新库 `Animation/PrevizKimodo` 排在预演动作库表第一；运行时改成并行下载、按表顺序并库（原来谁先下完谁先并，同名片段归属不确定）。另 11 条生成了但不如手 K，保留旧的。
- 2026-10-20（12–18 预演第二版）：§16 用上 `ride`（三副担架横搁车板、妮儿坐车尾、13-2 伤员挂到担架上被抬走；关键帧生成器 `CartWorld` / `NIER_TAIL_RIDE` / `PressPose` / `DOCTOR_PRESS`，摆位检查跳过挂着的人、`tending` 不报与伤员重叠）、`aircraft`（13-1 / 14-2 两架 Ki-30 顺着大路扫、13-2 / 14-1 兜圈子，弹着由 strafe 画）、`slowmo`（14-2 松手那 1.7 s）、百姓 / 小孩 / 军官 / 兵的占位片段、`clipRelease`（冬瓜攥袖子）、18-2 院里担架出院门上桥；PrevizTest 加飞机 / 慢动作 / 挂车 / 片段 / 院里担架 / `TalkPostureChecks`，KeyframesTest 加挂车与军医站位断言。
- 2026-10-20（挂到车上 + 预演音效直接放文件，运行时包 M）：§3 单位加可选 `ride`（挂到 `cart` / `tank` / `litter` 上，`Script_EditorBlockoutConfig` 校验 / 归一化，`RideIssues` / `NormalizeRide` / `BLOCKOUT_RIDE_CARRIER_KINDS`）；§5.6 `BlockoutPuppets` 按车位姿摆挂着的人与担架、驴车尺寸实测 `BLOCKOUT_CART_SEATS`（车板顶 1.025 m）、`SitRootY` / `RideWorldPose`、Probe 多给 `ride` / `seat` / `rootAboveCarrierGround`；§14.1 预演键 `ride`（阶跃，挂着写位置键报警告）；§14.3 `PREVIZ_SFX` 可写 `{ url }` 直接放 `Audio/BlockoutPreviz/` 的文件（解码进声库、按位置放、读不到只警告一次），别名加 `babyCry` / `cellarSob` / `gateSmash` / `jarShatter`；门禁 ConfigTest / PrevizPlanTest 加用例、`PrevizRuntimeBrowserTest` 加车 + 挂人 + url 音效（不再带 `audio=0`）。0610 的数据（07 妮儿坐车尾改成 `ride`）由之后的集成一路改。
- 2026-10-19（白盒预演补齐，运行时包）：§5.6 百姓 / 小孩换成能放片段的 NRA02 骨架占位身体（布换百姓色、帽徽 / 枪套 / 带子藏掉，军帽摘不掉），§3 单位 / spawn 可选 `body: "procedural"` 退回旧身体；军官片段不再被拦；§14.1 段里加 `aircraft[]`（机型 + 按时间航点 + 扫射段 + 引擎声，纯函数取样，镜头可锚飞机）与 `slowmo[]`（窗口倍率 + 渐变，人物 / 片段 / 特效 / 飞机 / 镜头一起慢，台词与音效照常）；§14.2 新模块 `Script_EditorBlockoutPrevizAircraft`、`State()` 多给 `timeScale` / `wallT` / `aircraft`；`Script_Actor.Create` 认 `options.uniformPalette`、`Script_UniformColors` 认十六进制色（不给 = 老路）；门禁 `Script_EditorBlockoutPrevizRuntimeBrowserTest`，0610 PrevizTest 放宽成「百姓 / 军官只许通用片段」。
- 2026-10-13：初版（入口、数据格式、接口、界面、第一关 44 个关键帧、第二关草稿、测试与分工）。
- 2026-10-13：追加「设置 → 高级工具」面板入口；`Script_EditorBlockoutConfig.mjs` 由集成负责人先写好；过渡改为按自然速度 + 整段快进；`Script_EditorBlockoutStore.mjs` 归 B 包。
- 2026-10-13（合 master）：高级工具改成菜单栏后入口挪进「关卡」菜单；按开发工具隔离规则，`Script_Main` 不再直接 import 编辑器模块，关卡表与总控经 `Script_DevTools.BlockoutPhases / BlockoutStartIndex / CreateBlockoutEditor` 取（剔除版返回空表 / null）。
- 2026-10-13（集成）：四包合并；§5.4 信号按剧情时刻；§3 担架加 `bearers`；§5.5 射界扇只画不穿墙的一遍并在近处淡出；§7 写明端点的必填字段、返回与状态码、版本号按原始字节；校验器报错不再回显嵌套值（防预览服务栈溢出）。
- 2026-10-13（用户反馈第一轮）：锁不住鼠标的窗口退化成按住右键拖动转视角；全关总图打开时对准玩家、导航栏压在总图上面仍可用；导航栏加重播按钮（同 `Y`）。
- 2026-10-21（用户在 Edge 里也看到右键拖动、Esc 后回不去）：右键拖动只在**点击发起**的抢锁被「root document」拒时才进；拿到锁就退出右键拖动。
- 2026-10-21（倒地的人扶得起来）：§5.6 / §14.1 关键帧里倒着的人被预演键 `state: "alive"` 扶起来时重造这个人，当帧站起来；再倒下照常倒（`lie:"along"` 照样摆顺），背枪的人倒下后枪不再竖在背上。
- 2026-10-21（预演切镜）：§14.2 预演镜头缺省切镜（运镜直接切到落幅，长且差得多的切成起幅 / 落幅两刀），单条 `keepMove: true` 照原样；`?previzCamera=move` 看旧的一镜到底。
- 2026-10-13（复制当前位置）：卡片加「复制当前位置」按钮与 `P` 键（§4.2），文字末行带整份 JSON；入口加 `pose=` 参数，「重现」链接原样打开回到同一机位。
- 2026-10-13（地图开着鼠标漏到游戏）：遮罩改成盖满整屏（导航栏两边那条原来露着，点一下会重新锁鼠标 / 在面板里直接开枪）；`Script_Main` 加 `BlockoutMouseCaptured()` 闸住抢锁、开枪、转头与滚轮换枪。
- 2026-10-20（01–05 集结处改弯沟）：§13 干沟由 15×50 m 方坑改成一条弯沟（坑窝 A / 中弯 / 坑窝 B，沟底宽 5–15 m，中弯往南接支沟放伤员，支沟南头接凹路、凹路在台地里往东到 x 83 才拐往南）；02 末的人分三小堆贴北岸、伤员放支沟里；锚点加 `GullyU` / `InGullyFloor`；0610 跟着挪妮儿、06-1–06-3 的站位，干沟进 0610 路网（中心线，不再是矩形区域）。
- 2026-10-19（12–18 新剧本白盒）：新关卡 `FirstLevel1218`（§16）；§14.3 预演音效别名加 `planeDrone` / `planeDive` / `strafeNear` / `strafeFar` / `strafeDirt`（飞机与扫射，映射到游戏音频库现成的键）。
- 2026-10-21（担架、单被）：§5.6 担架换竹竿布兜担架正式模型；单被换上传的五补丁单被，拖着走时兜起来。
- 2026-10-21（单被布料）：§5.6 单被换成布料模拟（216 根骨当质点），被角钉在拖的人手上、冬瓜身下压着布、尾巴拖地；Seek 重铺；Probe 加 `blanketCloth`。
- 2026-10-23（单被厚度与布感）：§5.6 被子换 1.4 cm 双层壳 + 卷边、不透明布面、平铺细皱织纹法线；布料加长程系绳与攥一把，压短 / 抗弯调软。
- 2026-10-31（单被吸血）：§5.6 单被挂上布料测试场的双面吸血，出血点取被子上倒地伤员的胸腹处；Probe 加 `blanketCloth.blood`。
- 2026-10-31（冬瓜的毛巾）：§5.6 倒地的冬瓜肚子上塞一条吸了血的毛巾；Probe 加 `woundTowel`。
- 2026-10-20（不端枪）：§5.6 不戒备的步枪兵站 / 走 / 跑背枪、蹲着歇枪竖着；预演里提枪说话换背枪版、卧倒抱头背枪；动作库开编辑器就下。
- 2026-10-20（默认关卡）：§1 白盒工具默认开新剧本 01–05（菜单入口、没写 / 写错 `level` 都进它），不再默认开旧版第一关。
- 2026-10-20（正式模型）：§5.6 战车 / 车 / 牲口换游戏里的八九式、撤运车 + 牛 / 马（带 Walk 动画），单位可选 `draft`；§5.7 树换枯树模型（树干块只留碰撞）；关键帧机位的蹲 / 趴走开就站起来（§7）。
- 2026-10-18（01–05 第三轮，「小毛病全都修掉」）：§14.2 白盒画质下预演的爆炸看得见了（`Script_EditorBlockoutPrevizFx` 在调试叠加层另画简易爆炸，只在编辑器、只在白盒特效关时画）；§14.1 演员键 `throw`（播投弹片段 + 弹的抛物线）、爆炸事件 `h`；§5.6 `lie:"along"` 按身体包围框居中、固定用 `DeathCollapseC`，Probe 再多给几项；§13 板桥门板缝 5 → 9 cm、旧门板厚薄高低不一，冬瓜在被子上一直躺着，桥下的人一律蹲 / 趴，05-3 顺子替身播投弹片段；补：白盒下的烟与枪口火、05-4 鬼子绕桥东头、04-3 刘文财猫腰过桥底。
- 2026-10-18（01–05 第二轮修补）：§3 单位加可选 `lie`、`weapon` 写 `Dadao` 摆白刃戒备；§5.6 倒地的人移动只平移、`lie:"along"` 顺着躺、预演 / 关键帧换武器就地 `SetWeapon`、Probe 多给几项；§14.1 演员键加 `lie`、`weapon`（阶跃）；§13 干沟南岸坎顶加矮土埂（南边平地看沟底余量 0.16 → 0.78 m）、板桥门板之间 5 cm 缝、05-2 桥下仰看与 05-3 甩手榴弹换机位、冬瓜顺着被子躺平滑跟着走、班长 02-2 抡大刀跳沟。
- 2026-10-18（01–05 返工）：§13 FirstLevel0105 按用户当天改稿重做地形、关键帧与预演（南沿迂回、两人并排拖单被、日常摆件、干沟集结处、路口板桥）。
- 2026-10-18（01–05 新剧本白盒）：新关卡 `FirstLevel0105`（§13）；场景文件加可选 `gates` 与块的显式 `y`，布局 `hideOpenGates`（§2.2）；关键帧可选 `stageLabel`、单位可选 `castId`（§3）；预演（§14，用户 10-18 拍板：编辑器里加预演，缺的动作先用现成动作顶上）。
- 2026-10-26（11–18 白盒第三版）：`FirstLevel1218` 按北沙河村那一版整体重摆（土路 → 官道 → 村口反坦克沟与板桥 → 北沙河村 → 村西麦地 → 铁路钢梁桥过沙河 → 南头河堤 → 北门），33 个关键帧；第二版的石板桥 / 渡口 / 浮桥 / 豁子删掉，见 §16。
- 2026-10-26（11–18 第三版第二轮：预演 + 台词 + 配音）：块可选字段 `standOn`（§2.2 / §5.6，只改 `BlockStandSampler` 一处），1218 铁路桥每孔一条看不见的走道，演员踩着枕木顶过桥；`Script_EditorBlockoutLevels` 里 1218 改名「北沙河村与铁路桥」、占位范围换第三版；1218 台词表、配音、预演按第三版重做（§16）。

## 13. 01–05 新剧本白盒（关卡键 `FirstLevel0105`，2026-10-18）

用户 10-18 在 Notion 定稿了第一关 01–05（剧本 + 子页「空间拓扑关系」的总图、按拍快照与草算尺寸表）。游戏里的第一关和 `Blockout/FirstLevel.json`（10-13 的旧剧情）都不动，另建一片独立场地：

| 文件 | 是什么 | 怎么来 |
| --- | --- | --- |
| `Data_EditorBlockoutFirstLevel0105Space.mjs` | 空间锚点（唯一口径）：原点 = 沟口，X 东 Z 南；前沿沟 / 交通沟 / 支沟 / 爬沟中心线、路、机枪坑三射位、防炮洞、坡顶、集结处干沟（10-20 起弯沟：中心线 + 支沟 + `GullyU`；两岸枯树、南岸土埂、凹路）、路口板桥、支沟南沿土垄、沟里日常摆件表、02 迂回组爬出点、03 远处日军、场景信号名 | 集成负责人按 Notion 图（约 2.2 px/米）换算，表头注释列着与草算尺寸的对照 |
| `Script_EditorBlockoutFirstLevel0105Scene.mjs` → `Blockout/FirstLevel0105.scene.json` | 0.5 m 高度网格（四条沟用 `Script_TrenchPlan.CompileTrenchNetwork` 烘进去；坑、散兵坑、洞是平底开挖；干沟与凹路算自然地形）+ 体块（日常摆件、板桥横木与门板、枯树）+ 随信号体块 | `node Taierzhuang1938/Script_EditorBlockoutCli.mjs scene FirstLevel0105 --force` |
| `Script_EditorBlockoutFirstLevel0105Keyframes.mjs` → `Blockout/FirstLevel0105.json` | 25 个关键帧（01-1…05-4，02末用 `stageLabel`），坐标全从锚点算 | `... export FirstLevel0105 --force`（**会覆盖手改**；以后以 JSON 为准，手改后别再重导） |
| `Data_EditorBlockoutFirstLevel0105Lines.mjs` + `Script_EditorBlockoutFirstLevel0105Voice.mjs` → `Audio/Blockout0105/*.mp3` + `Blockout/FirstLevel0105.voice.json` | 01–05 全部台词的占位配音（SeedAudio，整段一次生成后按逐字时间戳切句），清单给预演用 | 见脚本头注；默认只生成缺的场 |
| `Blockout/FirstLevel0105.previz.json` | 每个关键帧的预演时间线（§14） | 预演数据生成器 / 手改 |

场景信号：`DugoutCollapsed`（01 塌洞）、`PitShelled`（03 末战车一炮打塌坑沿）、`TankDisabled`（05 战车瘫在桥头，桥面两块门板压断下沉）。场景文件里对应的块写在 `gates`（§2.2）。

**2026-10-18 返工（用户当天改稿，Notion 文字已改、图还是旧的）**：02 反冲改成南沿迂回（何有田带一个弟兄留在支沟口台阶上顺支沟压住北沿机枪，班长带刘文财和两个弟兄从支沟口往南 10 m 爬出交通沟、贴支沟南沿土垄外侧往东爬到审问处对面，「打！」从南沿上来）；拖单被改成顺子和何有田并排站在被子头上往前拖、班长倒退断后，三处躲：支沟里一垛弹药箱、支沟口台阶拐角、拐角 2；沟里铺日常摆件（弹药箱垛、土袋垛、靠沟壁的门板、水缸、木头堆、塌方土堆，能挡子弹的齐腰高，每段 ≥15 m 直沟至少一件，留 ≥2.2 m 通道；不要猫耳洞）；集结处从坡后浅洼地改成一道东西向干沟（沟底约 15×50 m、比坡顶低 4 m、两岸 2.5 m 陡坎、南岸一排枯树、东南头接往南的凹路），交通沟顺北岸切成坡道下到沟底；路口交通沟上搭板桥（顺路三根横木 + 门板，桥面 3.8 m 宽、与路面齐平，桥下沟底到横木底约 1.8 m），05 班长判断「只有走那座板桥」、带顺子钻到桥下趴着，车刚过桥甩手榴弹，车瘫在桥头（这一拍剧本用户还没最后拍板，白盒先这样做）。两条视线（集结处看不见前沿、南边平地 1.6 m 眼高看不进沟底）与北沿机枪看不见南沿土垄外爬的人，由场景生成器 notes 与 `Script_EditorBlockoutFirstLevel0105SceneTest.mjs` 核对。

**2026-10-20 集结处改弯沟（用户：方坑太规矩、人挤一处像活靶子）**：
- 形状：锚点 `L0105_GULLY` 由矩形改成沟底中心线 `line`（逐点沟底半宽 `halfW`）+ 往南的短支沟 `branch`；沟底半宽按弧长再有 ±12% 的起伏（`wobble`）。挖法统一在 Space 的 `GullyU(x, z)`（≤ 0 沟底、0…1 坎上、≥ 1 沟外），场景生成器按它烘地形，关键帧按 `InGullyFloor` 判断在不在沟底。三处坑窝 `L0105_GULLY_POCKETS`：A (43,144.8) 坡道东边、mid (56,152) 中弯、B (71,145.5) 东头；量出来沟底宽 5–15 m、中心线连续沟底约 51 m、坎高 2.5 m。
- 位置：西头收到坡道西边 4 m，沟底离大路 ≥ 20 m（原来方坑西北角 8 m）；三处坑窝与支沟离路口板桥 ≥ 28 m。
- 后送：伤员放支沟（`woundedBay`，冬瓜躺 `donguaRest`），支沟南头 = 凹路口；凹路在台地里往东到 (83,161) 才拐往南。台地南沿在 x 50–82 往南鼓 5 m（`TerraceSouthRimZ`），南岸土埂一长段绕过支沟压在凹路南边，凹路北边另堆一小段弃土埂。视线②的观察点跟着台地南沿走（南沿往南 12 / 22 / 37 m）。两条视线：前沿看集结处最少挡 2.4 m，南边平地看沟底最少挡 0.63 m。
- 人：02 末分三小堆贴北岸坎根（坑窝 A 两兵一伤员、中弯 + 支沟是冬瓜 / 卫生兵 / 何有田 / 班长一伙和四个躺着的伤员、坑窝 B 两个坐着的轻伤和两个兵）；拖单被顺沟底走到支沟里；03-1 撤下来的人顺沟往东两两散开；05-4 班长顺沟底往东。KeyframesTest 查三堆都有人、伤员 ≥ 4 在支沟。
- 0610：冬瓜躺过的地方用 `donguaRest`；妮儿挪到支沟南头坎脚 (58.5,160.6)；06-1 起点坑窝 A、06-2 玩家站中弯西边 (50.5,149.2)、06-3 的人平移到新凹路上；路网把干沟中心线和支沟连到凹路口（不再是矩形区域）。1218 不受影响（重烘后内容逐字相同）。
- 史实：集结处形状、位置、人怎么摆是创作；滕县城外救护 / 集结位置没查到出处（Notion 对照表）。

**2026-10-18 第二轮修补（用户「没改的都改好」）**：
- 干沟南岸坎顶堆一道连续的矮土埂（锚点 `L0105_GULLY_SOUTH_BERM`，烘进高度场，不用体块）：顶高 0.6–0.8 m（按弧长起伏）、底宽约 2.2 m、顶宽 0.8 m；中心线从干沟西头的缓坎绕过西南角、顺南岸坎顶一直堆到凹路拐弯处，凹路把它切开（凹路本身是开口）；树照旧在南岸。南边平地（离南岸 ≥ 12 m、眼高 1.6）看沟底站着的人：最少多挡 0.16 → 0.78 m；SceneTest 门槛从 `> 0` 提到 `≥ 0.6`，另查土埂连续、高度、坎高扣掉土埂仍 2.5 m。
- 板桥门板每块单独一个块，顺路之间留 `L0105_BRIDGE.gapM` = 5 cm 的缝（SceneTest 查 4–6 cm）。
- 冬瓜在单被上 `lie: "along"`、朝向 = 被子朝向（头朝拖的人）；预演里跟被子同一条路、同一个时间窗的 walk 位置键（去掉原来的 90° 补偿与 0.25 s 一步的瞬移）。03-4 幺娃拖机枪手同理（`lie: "along"`，crawl 慢速匀速滑过去）。
- 02-2：关键帧班长 `weapon: "Dadao"`；预演里爬上南沿、跳沟（`DadaoAmbush` 举刀）、落地冲过去（`CreepDadao`）、劈甲（`LuoDadaoChopRear`）都是大刀；台词按剧本「打！」→「敌袭！」→「杀——！」（2026-10-19 改成班长在南沿上撑起身子喊：机枪一哑镜头先扫一眼台阶上起身往前冲的压制组，再转回南沿；这句是单句补录，台词表 `pickup`，其余四句仍是整场录音）→ 班长跳沟落地「砍！」。02-3 开场接着拿大刀，走到顺子跟前时换回 `HanYang`，再 `LuoHandRifle` 把枪塞过去。02-2 关键帧玩家视角改成顺着支沟往西偏南（113°、仰 6°），看得见南沿开火的人、跳下来的班长和沟里倒下的人。
- 05-2：桥下仰看的 eye 挪到桥面南沿往南约 2 m 的沟底（蹲姿眼高）、朝西北 38°、仰 26–30°、视场 76°：画面从下往上是门板底面、桥沿、压在桥上的车身、天空；落土是烟 + 说明字。05-3：甩手榴弹换成顺子身后沟上方的宽镜头（视场 72°），前景顺子替身探身（没有扔手榴弹的片段，`PointBlockade` 顶上），越过沟沿是车尾和那块铁板。

**2026-10-18 第三轮修补（用户「小毛病全都修掉」）**：
- **爆炸看得见**：默认白盒画质（特效关）把 VfxSystem 整棵藏掉（`Script_Vfx` 的 `scene.onBeforeRender` 读 `scene.userData.whiteboxEffects`，`WhiteboxSceneRenderer` 还把 Points / Sprite / 半透明特效网格逐个藏掉），预演里 03 掷弹筒落点、05-3 炸车尾都看不见。编辑器预演另画一份简易爆炸（§14.2），游戏本身的爆炸不动。验收（1280×720，爆前 0.05 s 与爆后对比，爆点投到屏幕、半径 140 px 内隔一个像素取样，RGB 差之和 > 60 算变色）：03-2 掷弹筒落点爆后 0.12 s 变色 5567 / 15400 个取样点（其中偏暖的火光色 4070），爆后 1 s 土柱 10150 / 15379；05-3 车尾爆后 0.12 s 4543 / 15392（火光色 2638），爆后 1 s 10364 / 15393。
- **板桥门板**：缝 5 → 9 cm（`L0105_BRIDGE.gapM`；块中心只到厘米，实测 8–9 cm），每块门板逐块给 `boardJitter`：厚 6–9 cm、底面压在横木顶上或垫高 1–2 cm、顶面高低差 3 cm 上下、横向长短 ±10 cm、歪 ±0.9°。板比缝薄，桥下仰看斜着也透得出天光；从上往下看一块块板之间露出沟底。横木位置不变，桥下净空（横木底离沟底）仍是 1.76 m。SceneTest 查缝 6–10 cm、至少两种厚度、顶面高低差 2–4 cm、门板底面不压进横木。
- **冬瓜躺在被子上**：02-3 攥顺子袖子那一下原来播 `WoundedReach`（坐起来伸手、半个身子在被子外）且转身面朝顺子，改成不播片段、不转身，只动嘴 + 说明字「（冬瓜躺在被子上，一把攥住顺子的袖子）」；`lie:"along"` 按身体包围框居中、固定用 `DeathCollapseC`（§5.6）。实测（02-3 被子铺开起到 02E-2，预演每 0.25 s + 关键帧之间的过渡全程）：骨盆、头、两脚全在被子（0.7 × 2.1 m）里，离被边最少 0.124 m（原来左脚出去 0.24 m）；骨盆离地 ≤ 0.21 m、头 ≤ 0.23 m，一直是躺着。
- **烟与枪口火**：白盒下 `smoke` / `muzzle` 事件原来同爆炸一样看不见（VfxSystem 的烟源、枪口火整棵被藏），预演里另画（§14.2）。验收同爆炸（前后成对截图数变色）：05-2 板缝漏土，桥下仰看 6.55 s → 7.8 s 变色 7665 / 11683，侧看 5.75 s → 6.3 s 5648 / 15383；04-1 鬼子开枪，枪口那一下（+0.03 s）半径 60 px 内 741 / 2823。掷弹筒出膛的白烟在预演原来的机位里被坑沿胸墙和土坎挡着（本来就看不见），换一个旁观机位（测试时临时注入，预演文件没改）验：1.35 s → 2.9 s 变色 761 / 11309；05-3 车尾黑烟旁观机位 4.55 s → 9 s 2439 / 20101。
- **投弹**：05-3 顺子替身在 1.5 s 起播投弹片段（`throw`，§14.1），3.65 s 脱手，那捆手榴弹沿抛物线飞 0.9 s 落在车尾铁板上（离地 1.5 m），4.6 s 在那里炸（爆炸事件 `h: 1.5`）。全 01–05 里别的「扔手榴弹」：02-1 甲甩手榴弹、02-2 甲咬弦都是日军现成片段（`IjaGrenadeKnockThrow` / `IjaGrenadeBitePin`，不动）；04-1 / 04-2「手榴弹扔进来」镜头里没有扔的人（只有落点爆炸 + 说明字），没有顶替的片段，不在这一轮换。
- **桥下头顶**：桥下的人头顶（头骨点 + 0.2 m）离上方门板 / 横木 / 压断塌下来的门板底面一律 ≥ 0.1 m，身子不穿横木。改动：05-1 班长、幺娃、机枪手钻桥底时出发就猫腰（原来走到地方才蹲）；05-2 班长一直蹲着（原来车压上桥时趴下、过后再蹲起来：从趴到蹲那一下动作库先站起来再跪）；05-3 班长钻出桥底、在桥面南沿外一步蹲着端枪（原来站在桥下正中，站直了头顶贴着桥板）；04-3 班长挪到板桥北沿外一步回身招呼，刘文财跑到桥北沿外、猫腰钻过桥底、在桥南几步蹲下（关键帧里也是蹲着）；05-4 坡顶上的四个鬼子（跟车步兵三个 + 沟里追来的一个）关键帧 `path` 与预演都改成绕桥东头（`Script_EditorBlockoutFirstLevel0105Keyframes.BRIDGE_EAST_DETOUR`：沿路走到横木端头外 1.25 m、横过路面往东南、从沟东边绕上坡顶；沟里那个先绕过靠沟壁的门板、从沟东沿爬出来），不再直线穿过桥头横木端头、不再从桥底钻。实测余量（预演每 0.2 s + 关键帧过渡全程；头或骨盆落在桥的块的脚印内 0.15 m 都算）：04-3 刘文财 0.53 m；05-1 班长 0.64、幺娃 0.48、机枪手 0.62；05-2 班长 0.88；05-3、05-4 没人在桥底下；过渡 04-2→04-3 刘文财 0.38、04-3→05-1 最少 0.32（机枪手）、05-1→05-2 0.88、05-2→05-3 班长 0.13（蹲着从压断塌下来的门板底下钻过去）、05-3→05-4 没有人进桥底也没有人碰到横木（原来班长 0.02 m、跟车步兵穿横木端头 −0.43 m）。0105 PrevizTest 另查：04-3…05-4 的关键帧布设、预演每 0.1 s、关键帧之间的过渡路线（过渡里目标是站就站着走）都不许站着从桥底下过。

**2026-10-19 占位动作接进预演（用户：「哪怕是白盒，很多需要的人物动作你还是按照文档里要求的来占位制作一下」「我看到一个讲话还拿着枪的很出戏」）**：四个占位动作库（PrevizTalk / PrevizCare / PrevizCombat / PrevizIja，§14.1）接进 0105 预演，凡是拿别的片段顶着、或者只有说明字的地方都换成了新片段，并定了说话姿态规矩（§14.4）。换了什么：
- 01：冬瓜伸膀子 `PvSitOfferArm`、塞背包 `PvSitStuffPack`、按住顺子的手 `PvSitGrabHand`、说「今天就跑」那一串坐着 `WoundedSitRifleIdle`；幺娃数炮 `PvCrouchCountFingers`；班长在洞里说话 `PvStandTalkSlung`、指人 `PvStandPointL`、挥手让幺娃走 `PvStandWaveOnL`、洞口叫人 `PvStandBeckonL`；幺娃「我去！」`PvStandTalkSlung`；01-4 甲打手势分开 `PvIjaSignalSplit`；迂回组四个人翻出交通沟 `PvClimbOutTrench`（运行时按清单 `rootPath` 把根往前、往上挪，往上的量按沟深等比放大，播完用位置键挪到沟沿）。
- 02-1：乙举刺刀 `PvIjaBayonetRaiseThreat`、甲抬手拦 `PvStandHaltL`；枪托砸脸成对（乙 `PvIjaButtStrikeFace` + 冬瓜 `PvCaptiveButtHit`，冬瓜先转过来冲着乙，乙站在他正前 0.8 m，冬瓜晚 0.38 s 起播，砸完侧倒，不再切回跪姿）；揪头发 `PvIjaCrouchHairLift`（乙在顺子眼睛前 0.70 m；顺子眼高拽到 0.56 m，原来镜头拽到 0.72 m，后面整段第一人称眼高跟着改成 0.56）；甲「没时间了」「丁。刺刀。」`PvStandTalkLowRifle`、「下一个，他」`PvStandPointL`。
- 02-2：副射手被掀下沟沿 `PvBlastThrownBack`（原来 `ShotCollapse` + 走位挪人）；乙「敌袭！」边喊边开枪、刘文财「顺子在底下！」边喊边开枪（打仗当下端枪喊）；班长「杀——！」`PvStandWaveOnL`；何有田扒土 `PvKneelDig`。
- 02-3：何有田扒土 `PvKneelDig`、跪着喊 `PvCrouchTalkRifle`、铺被子 `PvKneelPullBlanket`（被子在 2.55 s 落地那一刻才出现）、班长和何有田挪人 `PvKneelHaulBody`；冬瓜躺着攥顺子袖子 `PvLieGrabSleeve`（原来只有说明字；说完清掉片段 = 松手；顺子蹲到他右肩旁，镜头看脸和手）；班长「还能打不？」`PvStandTalkLowRifle`、「跟到老子，走！」`PvStandWaveOnL`。
- 拖被子（02-3 末…02-7）：何有田 `PvBlanketDragL`、顺子替身 `PvBlanketDragR`，速度 1.4 → **1.2 m/s**（片段基准 0.8 m/s，播放约 1.5 倍；生成器 `DRAG_MPS`）；到了掩体何有田松开被角回身取枪 `PvBlanketReleaseTurn`（原来 `PullComrade`），播完再退到掩体后；02-7 坡顶的兵「快过来！」`PvProneBeckonL`（原来端着枪对着顺子）。
- 02末：卫生兵跪在冬瓜胸口旁按伤口 `CareMedicPress`（CollectionCare，跪在靠顺子那一侧）；担架员 `PvCrouchGripLitter`；班长问话 `PvStandTalkSlung`、指何有田 `PvStandPointL`；刘文财摇头 `PvStandShakeHead`（原来两个转身键）。
- 03：挤人「往哪走！」`PvShoulderShove`；远处的掷弹筒组（关键帧里的 `IjaMortar1/2`）`PvIjaLauncherFire` + `PvIjaLauncherLoad`（2 s 一发，`Mortar()` 的「嘭」对齐 1.60 s 发射；03-3 两发挪了 0.6 / 1.0 s 对齐）；03-2 坑沿的兵被掀翻 `PvBlastThrownBack`；机枪手边打边喊「丢弹筒！」；正面日军跃进后扑倒 `PvStandToProneDive`；刘文财「左边沟里头有人！」`PvCrouchPointL`；03-4 机枪手腿中弹 `PvLegHitKneelClutch`；抱捆的弟兄猫腰到坑沿 → 扑出去 → `PvCrawlCarryBundle` 抱着那捆爬；03-5 班长「走了！」不再端枪对着顺子，`PvStandWaveOnL`。
- 03-5…05-4 幺娃架机枪手走：机枪手 `PvSupportedHop`、幺娃在他左边 0.5 m `PvSupportWalkL`（生成器 `SupportGo`；05-1 钻桥底那段仍是蹲着走）。
- 04：班长回身招呼 `PvStandBeckonL`（04-1、04-3）；拼刺刀一条到底 `PvIjaLungeParriedFall`（原来 `BayonetClearWood` + `ShotCollapse`）。05-1：班长判断 `PvStandPointL`、拽顺子钻桥底 `PvCrouchRunPullBehind`；05-3 幺娃「搭把手！」`PvStandBeckonL`；05-4 刘文财 `PvStandTalkLowRifle`、班长「表看了，走！」`PvStandWaveOnL`。
- 时长：总长 749 → 773 s；01-4 40.9 → 51.5 s（翻沟）；02（02-1…02-7）236 → 249 s，连 02末 295 → 308 s（约 5.1 分钟，节拍表给 02 整拍约 3.5 分钟，长出来的主要是 02-1 审问 70 s 和四段拖被子）。

**2026-10-20 坑北前景（用户在 03 坑沿朝北看：「日军这么一马平川合理吗」，拍板「坑北前景」改稿）**：地物没有史料出处，是创作（鲁南农田三月的常见样子）。锚点全在 `Data_EditorBlockoutFirstLevel0105Space.L0105_PIT_NORTH`（+ `L0105_RUSH_STATIONS`；第四轮起 `L0105_RUSH_REPLACEMENT` / `L0105_DITCH_FLANK` 换成 `L0105_RUSH_KEY` / `L0105_RUSH_FALLEN` / `L0105_DITCH_SQUAD`，见本节末「第四轮」），场景生成器的「坑北前景」一节（`PitNorthHeight` / `PitNorthBlocks` / `PitNorthChecks`）只碰 z < −8，南面（前沿沟、坑、交通沟、集结处、坡顶、凹路）逐点不变，0610 接缝最大差 0。
- **0–80 m 扫清射界**（z −8…−80）：没有起伏（原来坑北略低 0.8 m 的缓坡照旧）；15 个树桩（体块 `FieldStump_01…15`，0.45 m 见方、高 0.3–0.5，不挡人）；两道田埂 N1 `z = −42 + 2.5·sin(0.035x + 0.6)`（x −95…150）、N2 `z = −68 + 3·sin(0.028x + 2.0)`（x −100…160）；两座孤坟 (−20, −55) 高 1.1、(45, −65) 高 1.15。田埂一律高 0.3、顶宽 0.6、两侧各 0.45 m 落到地面、两头 3 m 收尖（烘进高度场）；坟是圆顶，底半径 1.5 m（直径约 2.5 m 处还有四分之一高）。
- **80–200 m**：田埂 F1 `z = −110 + 3.5·sin(0.022x + 0.3)`、F2 `z = −150 + 3·sin(0.019x + 1.7)`、F3 `z = −190 + 3.5·sin(0.017x + 2.9)`，都横贯 x −110…190。
- **坟地 + 柏树**（轻机枪 1）：五座坟 G1 (−35, −117) 1.2、G2 (−28, −115.5) 1.1、G3 (−31, −122) 1.3、G4 (−24, −120.5) 1.0、G5 (−37, −123.5) 1.15 m；三棵柏树（体块 1.1 m 见方）(−33.5, −127.5) 8 m、(−25.5, −126) 6.5 m、(−40, −120) 7 m。轻机枪 1 趴在 G2 东肩后 (−26.85, −116.84)，副射手在 G2 正后 (−28.34, −117.58)。
- **麦秸垛**（轻机枪 2）：中心 (40, −138)（原来 −140，往南挪 2 m 给干水沟留出 2 m），4×3 m、高 2.5（下层 4×3×1.9 + 上层 3.2×2.2×0.6）；轻机枪 2 趴在垛西南角 (37.2, −137.4)，副射手 (36.0, −139.4)。原来的小土包块 `EnemyLmgWestMound`、弹坑与 `EnemyLmgEastLip` 去掉。
- **干水沟**：折线 (190, −245) → (130, −200) → (70, −165) → (10, −125) → (−40, −92) → (−70, −72)，全长约 312 m；沟底宽 1.5、口宽 3、自然地面往下 1.2 m，两沿各翻一条 0.3 m 高、1.2 m 宽的土（清淤堆的）；西南头最后 8 m 渐浅到地面（尽头在 N2 田埂北边约 4 m，离坑心约 95 m）。从坟地（沟北约 20 m）和麦秸垛（沟南约 5 m）之间过，不碰坑、前沿沟、交通沟（离它们 > 40 m）。沟底按「起伏 + 地坎之后、田埂之前」的地面往下挖，所以穿田埂处沟底不被垫高。
- **地坎**（原来 90 m 宽、高 2.2 m 的土坎去掉）：中心线 `z = −206 + 4.5·sin(0.016·(x − 28))`（x 28 处正好 −206，全场 ±4.5 m），横贯 x −110…190，北低南高 2.0 m，坎面 2 m 宽（陡）；干水沟穿过处（约 x 138）坎面放宽到 16 m，成一个豁口（顺沟走 1 m 内高差 ≤ 0.11 m）。掷弹筒组仍在 (28, −213)，坎线北 7 m。
- **远处村子**：村前一排 17 棵杨树（体块 1.4 m 见方，12–15 m 高）沿 z −398.5…−402、x −38…169；后面 10 间土坯房（墙块高 3 m + 草顶 0.35，体块 `VillageHouse_*` / `VillageRoof_*`）：(−10, −420) 9×6、(15, −418) 8×6、(40, −425) 10×6、(70, −419) 8×5、(98, −423) 9×6、(128, −418) 8×6、(25, −447) 9×6、(60, −452) 10×6、(110, −450) 8×6、(145, −455) 9×5（东西×南北，米）。
- **大起伏**：z < −80 起 60 m 内渐强，`0.6·sin(0.0105x + 0.0062z + 0.4) + 0.4·sin(−0.0068x + 0.0121z + 2.1)`（波长约 450–520 m，±1 m）；另叠一层往北缓缓抬的坡（`tilt`）：z −80 → −206 抬 1.5 m（约 1 % 的坡，看不出来），坎下 z −225 → −340 再抬 2.0 m（村子在略高的地上）。不抬的话坎下整片比交通沟底还低，编辑器的高度色带把它染成一片冷色，远看像水；现在坎下只剩 20 m 上下一条低地（掷弹筒组在里面）。路 `L0105_ROAD` 在 z > −40，不受影响。
- **边界与文件**：`L0105_BOUNDS.minZ` −235 → −480（全 0.5 m 网格，没另做低分辨率），网格 600×870 → 600×1360；`FirstLevel0105.scene.json` 1 423 695 → 2 218 984 字节（+56%）；体块 76 → 131。编辑器开销（无头 Chromium 1280×720，旧 / 新场景文件交替各 3 次，去掉第一次冷启动）：打开到就绪 9.3–9.7 s → 9.5–12.0 s，开全关总图 364–413 → 452–653 ms，关 360 → 417–586 ms，切关键帧 150–250 ms 不变，静止帧均 18.3 → 20–23.6 ms。
- **视线核对**（`PitNorthChecks`，场景生成器 notes 与 SceneTest 共用；观察者 = 坑里北壁射击台上站着，眼高世界 1.08 m，胸墙一线 6 个点）：坎下掷弹筒组蹲着的头（离地 1.25）全被地坎挡住，最少挡 0.98 m；发射的烟（离地 3 m）看得见，最少露 0.56 m；干水沟里弯腰的人（沟底 + 1.2 m）沿沟每 3 m 全看不见，最少挡 0.15 m；两挺轻机枪趴着的头看得见；跃进的人每一格（有掩体的）趴着的身子（离地 0.2）都被掩体挡住。SceneTest 另查坟高 1.0–1.3、田埂约 0.3、沟底宽、沟沿到沟底 ≥ 1.2、地坎落差 1.7–2.3 与坎面陡、扫清带里除了田埂 / 孤坟没加别的起伏、坑北函数不碰 z ≥ −8、各体块尺寸。
- **03 的日军**（关键帧 `export FirstLevel0105` 重导，预演 `--force` 重生成；坑里的我方、镜头、台词时间不动）：
  - 两挺轻机枪按上面的新位置，趴着、枪口朝胸墙（射界 `ArcTo(…, PL.parapet)`）。
  - （第四轮已改，下面两条是第一轮的记录，现行口径见本节末「第四轮」。）正面跃进的 IjaRush1–8 按 `L0105_RUSH_STATIONS`（五格 = 03-2 / 03-3 开场 / 第一次跃进后 / 第二次跃进后 = 03-4 / 03-5）：每格是田埂后 1.3 m、坟包往远离坑的方向 1.9 m（两人左右各 0.75 m）、或干水沟北沿外 3 m；03-2、03-3、03-4 全员趴在掩体后端枪，03-5 一、三组趴在 N1 后、二、四组还在往前跑（站着）。预演 03-3 里每一跃（`RushBound`：跑 4.2 m/s、最少 2.4 s，跑到掩体前 0.8 m 朝坑扑倒）落在下一格上；IjaRush4 第一次跃进跑出去 3.4 s 中弹倒下，顶上来的 IjaRushR1 从 F1 田埂后 (−2, −110.4) 起身、扑到 N2 田埂后 (−9, −66.35)（03-4 起 IjaRush4 就是他）。各组路线：一组 F1 → 沟北沿 → N2 → 孤坟 (−20,−55) → N1；二组 F2 → 沟北沿 → N2 → N1 → 往前跑；三组 F2 → 沟北沿 → F1 → N2 → N1；四组沟北沿 → F1 → 孤坟 (45,−65) → N1 → 往前跑。坐标见 Space 表。关键帧里这些人标 `climb`（野地里跨沟、翻埂，不报高差）。
  - 「左边沟里头有人！」（03-3，`DitchFlank`）：IjaFlank1–3 一开场就在干水沟里（尽头渐浅段往东北 26–32 m），蹲着顺沟往西南走，12.0 / 12.6 / 13.2 s 走到渐浅段起点，起身露头、跑出沟尽头，21.6–23.4 s 扑到 N1 田埂后 x −40 / −44 / −36（坑西北约 50 m，从丙位散兵坑看是同一个方向）。刘文财 16.4 s 那句照旧；IjaFlank1 的那一枪从 17.6 s 挪到 23.2 s（趴稳了才打，原来在开阔地上边跑边打），IjaFlank2 36–45 s 蹲着退回沟尽头。
  - 掷弹筒组位置不变（坎下）；`Mortar()` 的白烟仍在 (28, −211)。
- 截图：`_shots/EditorBlockout0105/PitNorth/`（不提交）。

**2026-10-20 第二轮：田、路、村子看得见（用户从坑里朝北看：「这里看起来还是大平原，房子也没有，路也没有，田也看不到，我不知道你做了什么」）**：
原因：白盒地面只按高度上一种色，田块分不出来；0.3 m 田埂远了就没了；10 间 3 m 的房子在 400 多米外只是天边几粒，还被杨树挡；没有通村子的路。坑沿射击台上眼高只比地面高 1 m，80–200 m 的地在 1280×720 画面里挤在地平线下 10–20 个像素里，所以只能靠「颜色拉开 + 往北的坡抬起来 + 成排的树和深色屋顶」让人一眼认出来。都是创作（鲁南农田三月），不是史料复原；锚点在 `Data_EditorBlockoutFirstLevel0105Space`（`L0105_NORTH_ROAD` / `L0105_FIELD_PATH` / `L0105_FIELD_PAINT` / `L0105_FIELD_BANDS` / `L0105_VILLAGE` / `L0105_VILLAGE_HOMES` / `L0105_FIELD_TREES` / `L0105_ROAD_TREES` / `L0105_PATH_TREES`），场景生成器 `PitNorthBlocks` / `L0105Paint`。
- **涂色**（场景文件 `paint`，§2.2 / §6.3）：105 项，全在 z ≤ −8.5（SceneTest 查 z −7.9 一线覆盖度为 0）。扫清带 `Cleared` `#7d8360`（被踩过的麦地），z −12…−80 横贯全场，坑前爬沟 / 丙位散兵坑一圈 x −11.5…−1.5、z −12…−17.5 留出来涂新土；前沿沟西头北折那截 x −68…−56、z −12…−27 也留出。田块 76 块：十条横带（南北界依次 z −80 直线、F1、F2、F3 田埂、地坎、三道只涂色的地界 z ≈ −248 / −286 / −330 / −378 / −428、场地北边），每条带东西切成长条地（宽度按带在 20–45 … 30–60 m 里按序号抖），麦地 `#566540` / `#61704a`（28 块）、翻过的地 `#5a4532`（23）、撂荒地 `#b09a66`（25），左右相邻两块不同。田埂和地界线 `#6a5842`（半宽 0.45 m，0.7–0.75）；干水沟连两沿翻土 `#7a6143`（半宽 2.7 m）；地坎坎面 `#5b4a38`（半宽 1.3 m）；七座坟 `#594634`（半径 1.9 m 八边形）；村里整片夯土 `#a08f72`、两片场院 `#c3b38c`、后街和胡同 `#d0c5a6`；路 `#d8cfb6`（比撂荒地更白更灰）。
- **路**：大路 `L0105_ROAD` 一个点不动（SceneTest 逐点核对；03-4 战车露头 (159,−20)、04 / 05 战车走的都是它，关键帧与预演重导后逐字不变）。大路在坑北那一截 (175,−40)→(151.7,−11.5) 涂成路色。大路北段 `L0105_NORTH_ROAD` (175,−40) → (173,−90) → (166,−150) → (156,−205) → (140,−262) → (124,−296) → 村子东口 (112,−318) → 顺前街 → 村西头 (−52,−318)，涂色半宽 2.6 m；两边杨树 `RoadPoplar_*` 43 棵（离路 4.4 m ± 0.4、10 m ± 1.6 一棵、高 11–15 m、脚印 0.6 m → 编辑器种成树），从北段 48 m 处（扫清带外，z ≈ −88）种到村口，干水沟、地坎坎面、小路边上不种。田间小路 `L0105_FIELD_PATH` 从前街胡同口 (−5,−318) → 胡同 → (−22,−262) → (−40,−222) → (−44,−200) → (−40,−165) → 坟地北边 (−33,−134)，半宽 1.3 m，单独一条（不接进 `L0105_ROAD`）；坎下到村口那一截西北侧 7 棵树（14 m 一棵、10–13 m）。路穿地坎：坎面在大路两侧 7 m 内放宽 14 m、小路两侧 4 m 内放宽 9 m（坡道，顺路 1 m 内高差 ≤ 0.35）；大路过干水沟（约 (153,−216)）路面下填平，离路边 3 m 渐回原深。`ways.roads` 多了大路北段和小路两条（全关总图画路）。
- **地形**：坎下 z −225 → −300 抬 2 → 5.5 m（正对坑的缓坡，最陡约 11 %），村里 z −296 → −366 再抬 4.5 m（后排比前排高一截）。地面：坎下 (28,−213) −2.03、坡上 (30,−260) 0.25、村前 (30,−296) 3.3、村里 (30,−340) 6.28；全场最高 9.28。场景文件 `heightTint` 钉在 −2.68…3.72（=南面的最低 / 最高），南面颜色不变。
- **村子**（`L0105_VILLAGE` / `L0105_VILLAGE_HOMES`，确定性生成）：x −48…116，三排院子（z −298…−314、−322…−338、−346…−362，离坑 290–355 m），中间两条东西街（z −318 前街 = 大路北段、−342 后街），胡同 x −8…−2。24 户，院子 15–22 m 宽 × 16 m 深、院间 1.5 m；每户四面院墙（2 m、0.5 m 厚、`plaster`，南墙在门口断开 3 m，东西墙顺坡分两截），正房坐北（宽 = 院宽 − 2、深 6、墙 3.0–3.6 m）、一侧厢房（4.8×6、3 m），每三户有一户两边都有厢房，共 54 间；屋顶块（`roof`，比墙宽 0.8 m、厚 1.0–1.5 m）上再压一条屋脊块（0.6 m，顺长边、宽 0.45 倍）。大户（第二排第四户）院墙 2.6 m、正房 4 m，院子东南角一座炮楼 (30.5,−325.5) 4×4 m、墙 8.5 m + 顶 1.2 m（全村最高）。屋顶在白盒画质里用深色（`semanticColors.roof` `#3e3a35`、`colorSemantics` 含 roof），柏树块也保留暗绿（`foliage`）。村边、院里大树 17 棵（13–17 m）；村南两片场院（x −46…−18、84…108）三垛麦秸（4×4×2.8 m）。原来 400 多米外 17 棵杨树、10 间房去掉。
- **田边树**（`L0105_FIELD_TREES`）9 棵：(−88,−152)、(−96,−238)、(96,−176)、(122,−128)、(64,−258)、(−76,−276)、(176,−332)、(−100,−402)、(150,−410)，10–13.5 m；都不在扫清带、不在 03 跃进的地方。坟地柏树、麦秸垛、树桩不动。
- **03 的人**：日军站位、掷弹筒、沟里摸过来的三个人都没动；关键帧（`export --force`）与预演（`--force`）重导后内容不变（关键帧只有文件头的 commit / 时间变，没留），新块里没有站人（KeyframesTest / PrevizTest 过）。视线核对全照旧（掷弹筒组最少挡 0.98 m、烟露 0.56 m、沟里弯腰的人最少挡 0.15 m）；`PitNorthChecks` 的地坎落差跳过路两侧的坡道、沟深跳过大路填平那一截。
- **文件**：`FirstLevel0105.scene.json` 2 218 984 → 2 422 717 字节（+9 %），体块 131 → 512。
- **验收截图**（`_shots/EditorBlockout0105/PitNorth2/`，不提交）：03-3 坑沿射击台站着朝北（1280×720 / 2000×834）、03-2 坑里蹲着朝北、坑上方 20 m 朝北、60 m 鸟瞰、路边朝村子、全关总图。坑沿那一张里：近处一整片绿褐的扫清带，往北一条条绿 / 褐 / 黄的田，右边一排树顺大路一直排到村子，正前方天边一片浅墙深顶、前后错落的房子和一座炮楼。

**2026-10-20 第三版：照史料压平、窄条田、四个村子、东边低山（用户查了史料后拍板第三版草图）**：
史料要点（用户查证）：1938 年战报写北沙河到界河一路「途中五里一村庄」（约 2.5 km 一个）；房子都聚在村里、村外是开阔地，远看村子是一团团树；田里散着坟丘和河沟；界河一线东边有低山包（龙山、普阳山一类）；田是分家分碎的南北向窄长条、宽窄不一。村子 / 山包的具体位置大小、田怎么分、坟摆在哪是创作。锚点在 `Data_EditorBlockoutFirstLevel0105Space`（`L0105_FARM` / `L0105_FIELD_GRAVES` / `L0105_NORTH_ROAD` / `L0105_FIELD_PATH` / `L0105_BACKDROP_*`），场景生成器 `FarmLayout` / `L0105Paint` / `L0105Backdrop` / `VillageShapes` / `RoadPoplarSpots`。
- **压平**：第二轮往北抬的那层（`tilt`：扫清带外到地坎 +1.5 m、坎下缓坡 +5.5 m、村里 +4.5 m）整个去掉。坑北 = 前沿一带 − 0.8 m（坑北略低，照旧）+ 80 m 外 ±1 m 的大起伏（`roll` 照旧）+ 原来那层 ±0.3 m 的小起伏；地坎（北低南高 2 m，坎面 2 m，干水沟豁口、路的坡道）照旧。实测坎下 (28,−213) −3.53、(30,−260) −3.72、(30,−340) −3.55、北边界 (30,−480) −3.13；坎以北一大片 −4.1…−2.2（扣掉田埂 / 坟 / 沟）。`heightTint` 钉在南面的最低 / 最高（−2.68…3.72），南面颜色一点不变。
- **窄条田**（`L0105_FARM`，场地里的 `paint` 与远景层的 `rects` 同一套分组网格，接缝两边对得上）：组排南北界 z −80（扫清带北沿）、地坎、−318、−432，再往北每排 120–210 m；每排从 x −3800 起切成 110–240 m 宽的组，组与组、排与排之间是 2.2 m 宽的田间小路（`fieldPath` `#c4b792`，场地里先涂一整片小路色、田块盖上去留出缝）；组里南北向长条 5–20 m 宽（u^1.4 偏窄），麦地 36 % / 翻地 34 % / 撂荒 30 %，每种两档深浅，组里左右相邻两条不种同一样。组心离坑 1.9 km 以外一组一块（拼块）。场地里 112 条（翻地 40 + 撂荒 36 + 麦地 36），远景层 4024 块，铺满 x −3300…3800、z −4200…−80；扫清带往东西接着延伸。坟地柏树、麦秸垛、干水沟、田埂照旧。
- **散坟**（`L0105_FIELD_GRAVES`）16 座，0.8–1.2 m，圆土包烘进高度场（底半径 1.5 m，同坟地），涂新土色 `#7b6246`：(−92,−96)、(−80,−142)、(−100,−180)、(92,−92)、(118,−158)、(140,−110)、(104,−172)、(−62,−238)、(62,−262)、(−18,−300)、(100,−318)、(−88,−352)、(12,−372)、(168,−392)、(−40,−428)、(80,−452)。离跃进站位 > 8 m、离干水沟 > 8 m、离掷弹筒组 > 20 m、离路 > 6 m（SceneTest 查）。
- **路**：`L0105_ROAD` 一个点不动。大路北段 `L0105_NORTH_ROAD` (175,−40) → (173,−90) → (166,−150) → (156,−205) → (148,−262) → (143,−330) → (140,−400) → 北边界 (138,−480)；远景层 `L0105_BACKDROP_ROAD` 接着 (138,−480) → (136,−566) → 穿村 A (135,−617) → 北口 (133,−672) → 往东北 (300,−860) → (620,−1200) → (980,−1560) → (1300,−1840) → 穿村 D (1500,−2010) → (1700,−2190) → (2050,−2560)。杨树顺新路 13 m 一棵，场地里 59 棵（体块）、出了北边界到村 A 南口 12 棵（远景层 `tree`）。田间小路 `L0105_FIELD_PATH` 从坟地北边 (−33,−134) 往北出场地 (−62,−480)，西侧 15 棵树；远景层 `L0105_BACKDROP_PATHS` 五条把四个村子连起来（小路接着往北到村 C、半路岔去村 B，村 A 西口接过来，村 B → 村 C，村 C → 村 D）。
- **村子**（第二轮 300 m 那个 24 户带炮楼的村子拿掉，炮楼没查到出处；四个村子都在远景层）：
  | 村 | 村心 | 离坑 / 方位 | 房那一片（东西 × 南北） | 体块 |
  | --- | --- | --- | --- | --- |
  | A（日军集结） | (136,−617) | 625 m，北偏东 12° | 124 × 88 m，三排院子、中间一条南北街（大路） | 院墙 + 正房 + 厢房 153 块（墙 `#a89c86`，屋顶 `#3e3a35`）；一圈 64 棵枯树模型（离房 12 m 宽一圈、6.5 m 一棵，街口断开） |
  | B | (−850,−860) | 1.2 km，西北 45° | 220 × 160 m | 208 块；树冠团 132 个 |
  | C | (−60,−2010) | 2.0 km，正北偏西 2° | 260 × 190 m | 282 块；树冠团 153 个 |
  | D | (1500,−2010) | 2.5 km，东北 37°，在大路上 | 240 × 180 m | 232 块；树冠团 134 个 |
  树冠团：一成多是细高的杨树（半径 2.2–3.4 m、19–24 m），其余圆树冠半径 4–8 m、高 9–18 m，暗灰褐四种；树圈一段段疏密不一，院里隔一户一棵（村 A 隔两户），远看是一团团高低不齐的树里露出几排深色房顶。
- **东边低山**（`L0105_BACKDROP_HILLS`，7 座，西北—东南一串，`ry` −1.05…−1.3）：(1960,−2400) 32 m、(2250,−2080) 46 m、(2420,−1880) 58 m、(2700,−1470) 44 m、(2930,−980) 26 m、(3060,−480) 40 m、(3150,80) 24 m；长短半轴 300–400 × 220–280 m，离坑 3.06–3.16 km，方位 39°–92°。从坑里看是东北到东天边一串矮丘（最高那座仰角约 1°）。
- **远景层其它**：`far` 7000 m，地面 `y` −2.86（北边界的平均地面）、铺出去 6000 m、`blendM` 160 m，远处没切田块的地 `#7a7150`；`haze` 照白盒底色 `#adb8c2`、650 → 6500 m、最多 0.88（2.5 km 处约 0.2、3.1 km 约 0.33）。
- **03 的人**：日军站位、跃进、沟里摸过来、轻机枪、掷弹筒路线都没动；关键帧（`export --force`）与预演（`--force`）重导后内容不变（关键帧只有文件头的 commit / 时间变，没留；预演逐字不变），KeyframesTest / PrevizTest 过（新块里没有站人）。压平以后的视线（`PitNorthChecks`，坑里射击台上站着眼高世界 1.08 m）：掷弹筒组蹲着的头全被地坎挡住，最少挡 0.87 m（第二轮 0.98）；发射烟看得见，最少露 0.58 m（0.56）；干水沟里弯腰的人全看不见，最少挡 0.17 m（0.15）；两挺轻机枪趴着的头看得见（−0.27 / −0.30）；跃进的人每一格都被掩体挡住（SceneTest ≥ 0.02 m，37 格以上）。战车路线（`L0105_ROAD`）没动。
- **文件与开销**：`FirstLevel0105.scene.json` 2 437 219 → 3 094 664 字节（+27 %，其中远景层紧凑 JSON 约 29 万字节、缩进后约 75 万）；场地体块 512 → 181（村子挪走）+ 17 随信号；远景层体块 1 371（box 875、blob 419、tree 76、hill 7）。编辑器开销（无头 Chromium 1280×720，旧 / 新场景文件交替各 4 次、去掉第一次冷启动）：打开到就绪 9.0–9.8 s → 9.7–10.7 s（多出来的是画远景地面图，之后把大矩形改成直接算，再省 0.1 s）；开全关总图 208–452 → 214–271 ms；切关键帧 124–194 → 132–190 ms；静止帧均 9.7–13.1 → 9.8–14.6 ms（同一轮里旧 / 新差 0.3 ms 以内，第一轮 12.9 → 14.6 是机器热身）。
- **验收截图**（`_shots/EditorBlockout0105/PitNorth3/`，不提交）：03-3 坑沿射击台朝北（1280×720 / 2000×834）、同一机位朝东北、坑上方 20 m 朝北、80 m 鸟瞰朝北、100 m 鸟瞰朝东北、北边界接缝、东边界接缝、全关总图。

**2026-10-20 第四轮（日军怎么过开阔地；用户问「日军真是在大平面上直直冲过来的？没遮挡不就是活靶子？」→ 查史料后拍板四拍）**：
- 依据：日军进攻偏爱包抄、正面牵制主力打侧翼，出发线放在挡得住枪弹的地方（美军 TM-E 30-480，1944，第七章进攻）；滕县外围日军先用飞机、大炮轰再冲锋，正面打不下来就由右翼迂回截断后路（人民政协网 2014 普及文章、中文维基）。「先压住再跳」、每跃多远是按步兵通常的做法设计的（同一本手册也写日军步兵常常不等对方机枪被压住就冲）。人数、路线、时刻是创作。对照表与资料馆同一轮改。
- **来路**：正面四组 IjaRush1–8，组 1 / 组 3 开场趴在 F3（约 185 m）后，组 2 / 组 4 还在地坎北边 6 m 的低地里蹲着（`{ scarp: x }`，坑里看不见）；03-3 一开场翻坎、扑到 F3 后。
- **短跃进**：`L0105_RUSH_STATIONS` 每人一串站位，`L0105_RUSH_KEY` 定哪一拍用第几格（03-2 / 03-3 = 0、03-4 = 3、03-5 = 4）；两道田埂之间约 40 m 跳三次，中间两次扑在麦地里（`{ field: [x, z] }`，没有掩体、只靠趴得低）；一跃 12–18 m（翻坎那一跃约 25 m），预演里跑 4.8 m/s、最少 2.4 s。整个 03-3 正面只从 F3 推到 F2（约 140 m），03-5 在 130 m 上下。IjaRush4 第二跃里中弹倒在 (−7.4, −181)（`L0105_RUSH_FALLEN`），03-4 起躺在那里；顶替的 IjaRushR1 去掉了。
- **压制拍**（预演 03-3 甲位）：轻机枪一梭子扫过坑沿（土点沿胸墙一路溅过来 + `strafeDirt`），镜头 0.3 s 降到蹲、盯着胸墙的土两秒，再抬回来；缩头那两秒正面一组起跳。甲位这一段按举枪瞄准的视野（`fov` 32；开场看地坎那 6 秒 26），丙位 45；190 m 外的人在默认 60° 里只有几个像素。
- **侧面主攻**：`L0105_DITCH_SQUAD` 一个班 8 人（班长 IjaFlank1、轻机枪 IjaFlankLmg + 装填手、步兵 IjaFlank2–6），03-2 / 03-3 开场在干水沟里弯着腰排成一串（沟上弧长 270 m 起、隔 3.2 m）；03-3 12.3 s 停下、14.6 s 班长站起来探头（刘文财 16.4 s「左边沟里头有人！」）、15.8 s 起猫腰快走（1.8 m/s）到出沟点；轻机枪组趴进渐浅段（弧长 309.5 / 307.8）打丙位；步兵一个个出沟扑到 N2 后（离坑约 60 m），IjaFlank2 / IjaFlank4 出沟跑到六成处被丙位打倒；03-4 IjaFlank1 / IjaFlank3 先扑进麦地、再跳到 N1 后（离坑约 45 m）。
- **东沟**：清沟的 IjaTrench1–3 03-3 开场在前沿沟 x 40 / 46 / 52，乙位那段（44–56 s）顺沟一个弯一个弯清到 x 15 / 20 / 26（= 03-4 关键帧）。04-1 占了坑的改成这三个（原来是正面跃进上来的 IjaRush1/2）。
- SceneTest：有掩体的站位都被挡住（≥ 0.02 m）；相邻两格 9.5–18 m（翻坎那一跃 ≤ 26 m）；麦地里趴的地方平；坎下蹲着的（眼高 1.0）坑里看不见；那个班开场都在沟中心线 0.8 m 内。验收图（`_shots/EditorBlockout0105/Rush4*`，不提交）：四拍的旁观机位、玩家视角缩头、编辑器总图 03-4。

**2026-10-21 树不沿路种（用户看了俯视图：「整个场景其实都应该稀疏的有几颗，而不会是沿着路种树（应该历史上没有这样的设定）」）**：
- 第二轮为了从坑里认出路，大路北段两边种了成排的杨树（场地里 59 棵 `RoadPoplar_*`、出了北边界到村 A 南口 12 棵 `BdRoadPoplar_*`），田间小路西侧一排 15 棵 `PathTree_*`；从 02 坡顶、03 坑里往北看连成一道树墙。路边行道树没查到出处，全部去掉（`L0105_ROAD_TREES` / `L0105_PATH_TREES` / `RoadPoplarSpots` 删掉）。
- 换成**零星的树**，一棵一棵散在田边地头：场地里 `L0105_FIELD_TREES` 9 → 18 棵（10.5–13.5 m），远景层新加 `L0105_BACKDROP_LONE_TREES` 14 棵（`BdLoneTree01–14`，kind `tree`，场地外到村子之间、村与村之间）。都是创作。
- SceneTest 钉：没有 `RoadPoplar_` / `PathTree_` / `BdRoadPoplar`；田里的树两两隔 25 m 以上、离大路 / 大路北段 / 田间小路中心 ≥ 10 m、每条路 15 m 内最多一棵（不成排）、离干水沟中心线 ≥ 3 m、离地坎坎面 ≥ 6 m、离坟 ≥ 3 m、不在扫清带和 03 跃进那一片（x −75…75、z > −215）；远景的零星树离远景的路和小路 ≥ 20 m、不在村子树圈边上、都在场地外。
- 不动的：干沟南岸的枯树（06 老耿的驴车停在树底下，0610 接缝要对上）、坟地柏树、扫清带的树桩、四个村子外圈那一团团树（远看村子是一团团树，第三版的史料依据）。03 的人、关键帧、预演不受影响（KeyframesTest / PrevizTest 过）。
- 场地体块 181 → 116；`FirstLevel0105.scene.json` 3.10 → 3.09 MB；远景层的树 76 → 78。验收图 `_shots/EditorBlockout0105/SparseTrees/`（不提交）：03-3 坑沿朝北改前改后对比、02-7、全关总图。

**2026-10-21 03-2「进坑就挨一发掷弹筒」看得见（用户：卡片写着坑沿挨一发、一个弟兄被掀翻，预演里看不到这一下）**：
- 原因：「嘭」那一刻（1.4 s）镜头还在交通沟里，坑底眼高比胸墙顶低 0.5 m，坎后的烟看不见；落地那一下爆点被台上另一个站着的弟兄（PitNra1，跟挨炸的 PitNra2 隔 0.6 m）挡住，随后镜头就转走了；挨炸的 PitNra2 关键帧里是倒地（`down`），预演键写 `state: "alive"` 也没把他立起来，没播片段的时候一直是躺着的（只有播 `PvBlastThrownBack` 那几秒站起来）。
- 现在的顺序（预演 `S0302`，19.8 s）：进坑（0–4.2 s）→ 站上射击台往北看（4.2–7.6 s，视野 18°）：5.6 s 坎后冒一股烟、嘭，字幕「（坎后头冒起一股烟——嘭）」→ 跳下台蹲在坑底 (0.6, −6.9)，看着台上东头那个弟兄朝东端枪 → 11.1 s 落在坑东沿（`SHELL_032.hit` = (4.34, −9.64)），他顺着射击台往西掀翻，落在台面上 → 12.1 s 机枪手「丢弹筒！挪起走！」（`PitHold.02`，原录音）→ 幺娃看见顺子愣一下。
- 站位：`SHELL_032`（Keyframes 导出，预演与 03-2 的「弹落点（坑东沿）」POI 同一个点）—— PitNra2 站在射击台东头 (2.5, −9.15) 朝东偏北 −75°（护着丢掉的东段前沿沟），弹落在他正前方 1.9 m；03-2 关键帧里他改成站着端枪，03-3 起照旧躺在坑底东南角。`PIT.pitNra1` 挪到机枪西边 (−3.0, −9.05)（03-2 / 03-3 / 03-4 关键帧；离幺娃 0.89 m）。
- 镜头不跨射击台边：预演机位高度 = 那一点的地面 + h，跨过台边会跳 0.7 m，所以「站上台」是在台子南边 0.15 m 的坑底上把眼抬到台上站着的高度（h = 0.7 + 1.62）。
- 验收图（`_shots/EditorBlockout0105/Mortar032/`，不提交）：`before/` 改前第一人称；`after/` 同一组时刻的第一人称（FP_*）和旁观机位（Side_*，改 previz JSON 的 camera 注入，盘上文件不动）；拼图 `Mortar032_Sheet_20261021.jpg`。旁观机位从坑东沿顺着台子看：人平躺在台面上，没悬空。

**2026-10-21 防止玩家跳出壕沟（用户：只做两层——沟壁胸墙不能攀 + 沟沿一圈只挡玩家的隐形墙；不做「出去就被打死」）**：
- 实测原因（改前，`?editor=blockout&level=FirstLevel0105`，按住 W 连按 Space 三秒）：前沿沟、交通沟、坡顶段的人全走了出去——**多数不是翻越**，是顺着沟壁走上去：沟壁是高度场（解析地面），角色控制器只把脚提到地面高，没有坡度上限；坑沿射击台上朝北是翻越 + 攀爬过胸墙。
- **① 不能攀（`noClimb`，§2.2）**：胸墙三截 + 塌下来那摊土、板桥的横木与门板（共 19 块，此刻在场上的 16 块）。`Script_Player.ProbeVault`：前面要翻的东西里有 `noClimb` 就整个不翻（射击台不标，照样站上去露头开枪）；另加一条——落点和人之间隔着隐形墙（`tag airWall`，按墙自己的朝向算线段相交）也不翻：翻越是照曲线挪过去的，不走角色控制器，墙拦不住它。
- **② 沟沿隐形墙（`L0105KeepInWalls`，体块 `KeepIn_0001…`）**：「沟里」= 比没挖之前的地面（`UncutHeight`：`NaturalHeight` 去掉干沟、凹路两刀）低 ≥ 0.6 m、和机枪坑连得上的那一片格点（`KeepInMask`，z ≥ −30；坑北的干水沟不圈）——前沿沟两段、坑、爬沟、散兵坑、交通沟（板桥底下、坡顶段、坡道）、支沟与台阶、防炮洞、干沟（坑窝、支沟）、凹路（往南变浅到 0.6 m 处封口）。它的边（沟里格点与沟外格点之间那条格线）顺着「沟里在左手」串成一个环、按 0.3 m 容差拉直，每段一块斜墙：厚 0.2 m、两头各多伸出 0.1 m（拐角不漏缝），墙脚 = 沟里一侧 0.4 m 处最低地面 − 0.6、墙顶 = 两侧最高地面 + 3.0（站在 0.9 m 的摆件上也跳不过去）。892 段，`tag/semantic airWall`、`visual: false`。物理上只挡角色控制器（`Script_Physics` `IG_AIR_WALL`）：子弹、视线射线、手榴弹、碎块、布娃娃都穿过去；预演 / 关键帧里的人不是物理角色，站人的地面（`BlockStandSampler`）与关键帧摆位核对（`SolidsFor`）都不算它。墙线在 0.6 m 深那条线上，所以人能顺沟壁上到离沟沿约 0.6 m 处（同站在射击台上露头），再往外就挡住。
- 通路不堵（静态核对）：前沿沟、交通沟（含坡道到干沟）、支沟到防炮洞口、爬沟到散兵坑、沟口—坑底—甲位、沟口—乙位、干沟中心线、干沟—支沟—凹路口、凹路头 40 m 逐 0.25 m 都在沟里、离墙 ≥ 0.4 m；每个关键帧顺子站的点都在沟里。
- 验收（`Script_EditorBlockoutFirstLevel0105KeepInBrowserTest.mjs`，24 项）：19 处低处 / 空子（坡顶段与坡道上沿、两处塌方摆件旁、支沟台阶顶与支沟口、坑沿射击台甲位 / 东头 / 西头爬沟口、板桥两头、沟口和坑的东西接缝、散兵坑、前沿沟西头北折、干沟南北岸下、凹路、防炮洞口）× 8 个方向，按住 W（后半加 Shift）每 0.5 s 一下 Space 三秒，152 趟、起跳 742 次、翻越 9 次，每一帧都还在沟里；射击台朝北 `ProbeVault` 为空；从乙位顺交通沟过板桥底下、坡顶、坡道走到集结处，从防炮洞口顺支沟上台阶到交通沟，从坑底到前沿沟西段，都走得到（没卡住）；手榴弹从前沿沟里往北扔，飞到沟北 35 m；01-4 班长翻出沟（`PvClimbOutTrench`）以后照常在沟外爬；站人的地面在墙线上是地面不是墙顶；全程无错。截图 `_shots/EditorBlockout0105/KeepIn/`（`?airWalls=1` 把墙画成半透明板，不提交）。

- **第六版空间（2026-10-24，用户看了俯视图嫌「简陋不合理」→ 查史料、画规划图、用户点头）**：前沿改三段、各班一段、错开断开（西段 x −70…−28 往南错 8 m，本班 x −18…30 沟口 / 坑 / 射位不动，东段 x 44…98 往北错 9 m），段间浅连沟（2.4 宽、1 m 深），每段 3 个往外凸的射击位，一折 6–9 m、前后错 1.5–3 m（《新步兵操典草案》1934 第 358/213/299 条；FM 5-15）；第二条交通沟 `traffic2` 从西段斜通坡后（西邻班退路，01–05 不走）；主交通沟一个点不改，沿沟加 10 个让担架的龛；每段后壁弹药龛 ×2 + 隔开 ≥ 3 m 的手榴弹龛（《步兵工作教范摘要》1936 p.46）、机枪坑弹药箱、排长掩蔽部兼通信所 (17,28)、坡后预备队 (−32,144)、连弹药所 (50,136)、干沟里连指挥所 / 绷带所地标。北边原来固守的阵地（放弃了）：沿地坎南沿三段旧射击沟、三个空机枪掩体、顶塌半边的掩蔽部、没收的尸体 / 弹药箱 / 破枪，往南的旧交通沟，往北穿地坎通警戒阵地（z −440…−460 两段短沟 + 散兵坑）的旧交通沟；03 掷弹筒组蹲在这条沟坎下那一截 (28,−216)，烟从沟外冒。干水沟改成北沙河小支沟（沙底 5.2、顶 8.6、深 1.4、两岸不齐，东北头接长）。田改拼块（片 50–110 m、条 10–32 m、各片 ±3–14°、五分之一整块；600 m 内远景同切法），四片家族林、散坟、零星树、有头有尾的老驿道（无行道树）、四条田间小路。日军车辆改九四式轻装甲车（3.36×1.62×1.63、2 人、1 挺机枪、无炮，`Script_EditorBlockoutPuppets` 新 `tankette` 形状，单位 `shape:"tankette"`、kind 仍是 `tank`），三辆从东边麦田 x 260–300 冒出（场地东界 190 → 320）：03-4 机枪扫坑沿、胸墙改掷弹筒弹打塌；05 A 上板桥被炸瘫、B 停在交通沟东沿 (39.5,98.5) 打坡顶、C 在 (150,42) 抛锚两乘员下车就地打，徒步步兵两三百米后头没跟上，05-4 上坡顶的只有沟里追来的两个。0610 接缝（x −18…150、z 121…190）最大差 0。依据完整出处见 Notion「第一关 01–18 地图设计的依据」；具体坐标、段数、谁在哪是创作。截图 `_shots/Rev0105_20261024/`。

## 14. 预演（previz，2026-10-18）

用户 10-18 拍板：白盒编辑器默认仍是「走关键帧看布设」（§1 的「完全不要过场动画」对普通浏览照旧成立）；**每个关键帧可以挂一段预演**，按卡片上的「预演」按钮或 `N` 播放（`V` 是近战键，§4 不许占）：镜头轨、人物调度（走位 / 姿态 / 现成动作片段）、台词（字幕 + 占位配音 + 口型）、事件（白光、黑场、爆炸、烟、枪口火、塌洞等场景信号、震屏、音效）。播完按 `then` 跳到下一个关键帧（直接到位），玩家又能走。缺的动作先用现成动作顶上（用户 10-18），缺口列清单，白盒走顺了再补正式动画。

### 14.1 文件（`Blockout/<Level>.previz.json`，可选）

编辑器切到某关时顺手读 `./Blockout/<key>.previz.json?t=…`（404 = 这关没有预演，按钮不出现）；有文件时页面可见期间和配置一起每 2 s 查一次，变了就重读（正在播的那段播完才换）；没有文件时不每 2 s 轮询（浏览器每次 404 都在控制台报错），只在配置变化、`Reload`、切关时和每 30 s 再查一次。

```json
{
  "schema": "tengxian-blockout-previz/1",
  "level": "FirstLevel0105",
  "voice": "./Blockout/FirstLevel0105.voice.json",
  "faceTracks": "./Audio/Blockout0105/Data_Blockout0105FaceTracks.json",
  "sequences": [
    {
      "keyframe": "01-3",
      "title": "最后两个人：今天就跑",
      "durationS": 41.5,
      "then": "next",
      "camera": [
        { "t": 0, "dur": 8, "eye": { "x": 66.2, "z": 64.4, "stance": "crouch", "yawDeg": 120, "pitchDeg": -8, "toYawDeg": 95 } },
        { "t": 8, "dur": 4, "from": { "actor": "Donggua", "offset": [1.2, 1.1, -0.6] }, "look": { "actor": "Donggua", "offset": [0, 1.0, 0] }, "fov": 45, "ease": "inOut" }
      ],
      "actors": [
        { "id": "Donggua", "keys": [ { "t": 0, "stance": "crouch", "clip": "WoundedSitRifleIdle" }, { "t": 6.5, "faceTo": "player" } ] },
        { "id": "Luo", "keys": [ { "t": 2, "faceTo": "player" }, { "t": 9, "x": 61.5, "z": 64.6, "move": "walk", "path": [ { "x": 62.6, "z": 64.5 } ] } ] },
        { "id": "ExtraShell", "spawn": { "side": "nra", "kind": "soldier", "x": 60, "z": 64.5 }, "keys": [ { "t": 0, "visible": false } ] }
      ],
      "lines": [ { "t": 1.2, "line": "LastTwo.01" }, { "t": 4.0, "line": "LastTwo.02", "actor": "Luo" } ],
      "events": [
        { "t": 36.0, "type": "flash", "dur": 0.35 },
        { "t": 36.1, "type": "signal", "name": "DugoutCollapsed", "on": true },
        { "t": 36.2, "type": "black", "dur": 4.0, "fade": 0.15 }
      ]
    }
  ]
}
```

- `keyframe`：从这个关键帧的布设（单位、玩家机位、信号）起播；一个关键帧最多一段。`durationS` 可省（= 所有轨道、台词、事件的最晚结束）。`then`：`"next"`（缺省，播完直接到下一个关键帧）/ 某个关键帧 id / `"stay"`（留在这一帧，单位回到关键帧布设）。
- 点 `{x, z, h?}`：`h` 是离地高（米，缺省 1.6；地面按场景高度场取）。演员锚 `{ "actor": "<单位 id>", "offset": [dx, dy, dz] }`：偏移按世界轴、相对演员脚下，不随演员转身（同 `Data_CutsceneRedo.md` 的 `fromActor`）；`"actor": "player"` = 顺子（玩家机位）。
- **镜头** `camera[]`（按 `t` 排，每条管 `[t, t+dur)`，空档沿用上一条的最后一帧）：
  - `eye`：顺子的眼睛（第一人称）。`stance` 定眼高（stand 1.62 / crouch 1.05 / prone 0.32 m，离地），`yawDeg` / `pitchDeg` 起始朝向，`toYawDeg` / `toPitchDeg` 可选（这一条里转头过去）；受困拍就这么写。
    - `look` / `toLook`（2026-10-21，可选）：默认视线的起幅 / 落幅也可以写锚点（点 `{x,z,h?}`、演员锚、飞机锚 `{ aircraft }`），写了就不看对应的 `yawDeg` / `pitchDeg`；锚点每次取样重算，所以 `look: { aircraft: "Ki30Lead" }` = 视线跟着飞机走。
    - `free: true`（2026-10-21，**能转头不能走**）：眼睛位置、姿态钉死（`x / z` 必填），默认视线照上面放；玩家一动鼠标或按方向键（← → ↑ ↓），这一条剩下的时间视线归玩家，WASD 本来就不起作用；**紧挨着的几条 `free` 眼睛只要位置、姿态一样算同一段**（默认视线分几条写，玩家转到的方向不被夺回），下一条不一样的镜头开始时收回。Seek / 没人碰鼠标 = 默认视线（确定性，测试、截图都按它）。鼠标走预演自己挂的 `mousemove`（不抢指针锁，`Script_Main` 那条链在预演中本来就把位移扔了）；数在 `PREVIZ_FREE_LOOK`（0.11°/px、方向键 90°/s、俯仰 ±85°），同一段的判断是 `PrevizFreeLookSegment(camera, index)`；`Debug.Blockout.Previz.Look(dx, dy)` 给测试喂位移，`State().freeLook` → `{ available, active, yawDeg, pitchDeg }`。切镜模式下 free 眼睛的默认视线照 §14.2 切。07-4 飞机过头顶那 10 s 用的就是它（§15）。
  - 否则 `from`（必填）/ `to`（可选，机位移动）+ `look`（必填）/ `lookTo`（可选）；`fov` 垂直视场度数（缺省 60）；`ease`：`"linear"` / `"inOut"`（缺省）；`shake` 0–1。
  - `keepMove: true`（可选，2026-10-21）：这一条在切镜模式下也照原样运镜（§14.2「切镜」）——留给游戏里真做镜头动画的那几条。
- **演员** `actors[]`：`id` 是当前关键帧里的单位 id，或带 `spawn`（§3 单位字段，`x/z` 必填）临时加一个人（只活在这段预演里）。`keys[]` 按 `t` 排，每个键只写变了的字段：
  - 位置：`x, z`（`path` 是途经点；`move`：`"walk"` / `"run"` / `"crawl"` / `"drag"`（倒退着拖，朝向反过来）/ `"cut"`（到点瞬移），缺省 `walk`）。**带位置的键的 `t` 是到达时刻**：从上一个带位置的键（没有就是关键帧布设、t = 0）出发，按 `move` 的自然速度走（walk 1.4、run 3.5、crawl 0.5、drag 0.9 m/s），出发时刻 = max(上一个位置键的 t, 本键 t − 路长 / 速度)；窗口不够就从上一个位置键起匀速赶到。`t = 0` 的位置键 = 开场直接摆到那里（瞬移）。要控制「几点出发」，在出发时刻加一个同位置的键。`crawl` 走动时强制卧姿。
  - 朝向：`yawDeg` 或 `faceTo`（点 `{x,z}` 或单位 id 或 `"player"`）。走动中顺着行进方向（`drag` 反向），到点后 0.4 s 转到本键的朝向；本键没写朝向就保持到达时的行进方向，等后面的朝向键再转。
  - 姿态与状态：`stance`、`aim`、`state`（`"down"` 倒地）、`visible`、`carryRole`（`"front"` / `"rear"`，抬担架 / 拖单被）、`woundedWalk`、`talking`。这些与 `clip` 都是**阶跃**：取 t 之前最近写过这个字段的键。倒着的人写 `state: "alive"` 当帧站起来、再写 `"down"` 重新倒（2026-10-21，§5.6）。
  - `dragSolo`（2026-10-23，只对单被 litter 有意义，阶跃，没写过 = 用关键帧单位的）：`true` = 被子只认真有手攥着的角，另一角不取镜像、落地（§5.6）；拖的人松了手写在被子的键上（1218 14-2 顺子扑倒那一下），两人都攥着时写回 `false`。
  - 2026-10-18（第二轮）：`lie`（`"along"` / `null`，阶跃；没写过沿用关键帧单位 / spawn 的 `lie`）—— 倒地的人顺着朝向躺，见 §3、§5.6；倒地的人带位置的键照常写 `move`（`walk` 跟拖的人同速），运行时只平移、不起身，走动中朝向 = 行进方向（`drag` 反向），所以「头朝拖的人」= 用 `walk`。`weapon`（武器 id 或 `null`，阶跃）—— 换手里的武器（如班长 `Dadao` → `HanYang`）；**只有键里写过才有值**，`SamplePrevizActor` 在第一个 `weapon` 键之前返回 `undefined`（= 用造人时那把，不回填关键帧的缺省武器）。
  - `ride`（2026-10-20，阶跃）：`{ on, x?, z?, y?, yawDeg? }` 挂到车 / 战车 / 担架上跟着走，`null` 下车；没写过沿用关键帧单位 / `spawn` 的 `ride`（`spawn` 里也能写）。口径同 §3、§5.6；`on` 要是关键帧里的单位或这一段 `spawn` 的、种类是 `cart` / `tank` / `litter`。**挂着时位置键不管用**（校验按键的顺序跟踪「此刻挂在谁身上」，挂着写 `x, z` 报警告「要下车先写 ride: null」）。`SamplePrevizActor` 多给 `ride`（归一化后的对象或 `null`）。
  - 投弹（2026-10-18 第三轮）：`throw: { x, z, h?, flightS? }`（一次性，键的 `t` = 开始抡）。这个人播步兵投弹片段 `GrenadeThrow`（游戏里扔手榴弹的同一个片段，§5.6），手里看得到手榴弹；`PREVIZ_THROW.releaseS`（2.15 s，= `INFANTRY_RELEASE_SECONDS`）脱手，弹沿抛物线飞到落点（地面 + `h`，缺省 0.15 m），飞行 `flightS` 秒（缺省按水平距离 0.55 + 0.06 × 米，夹在 0.6–1.8 s），弧顶比两端连线高 max(1.2, 0.22 × 距离) m；出手点 = 这一刻脚下 + 1.95 m、往前 0.25 m、往右 0.2 m。抡的 `PREVIZ_THROW.clipS`（4.2 s）里 `SamplePrevizActor` 给 `throw: { seconds, x, z }`、`clip` 让位、`stance` 记 `stand`。落点的爆炸照旧另写 `explosion` 事件，`t` = throw 的 `t` + 2.15 + 飞行秒数。`throw` 不能和 `clip` 写在同一个键。
  - 动作片段：`clip`（开场动作库等现成片段名，`null` = 清掉回原生动画）、`clipFrom`（从片段第几秒起）、`clipHold`（播完停在最后一帧；不写则播完回原生动画）。片段按骨架分：有 `castId` 的单位骨架固定，片段不在这具骨架上时退回原生动画并在状态里报一次（`Debug.Blockout.Previz.State().missingClips`）。
  - `clipRelease`（2026-10-19，片段秒数）：只对清单里带停住段（`holdLoop [a, b]`）的片段有用——片段播到这一秒放开停住段、接着放出口（开场动作层的 `pose.holdUntil`）；不写就一直在停住段里循环（0105 的 `PvStandPointL` 等靠这个停住）。0610 的撒尿看守（`VilIjaPissStand`）、压刺刀的鬼子（`VilIjaPinBayonet`）最后一遍写 `clipRelease: 2, clipHold: true`：系好裤子回头 / 被咬甩手后仰，放完停末帧。
  - 额外动作库（2026-10-19）：预演读完开场动作库后，按 `Data_BlockoutPrevizClips.mjs` 的 `BLOCKOUT_PREVIZ_CLIP_LIBRARIES` 逐个读别的库，用 `Script_OpeningStoryboardAnimation.AddOpeningClipLibrary` 并进去（骨名一致的每具骨架都并，同名不覆盖），所以 `clip` 也能写这些库的片段名。现有 PrevizTalk（说话 / 手势）、PrevizCare（伤员、拖被子）、PrevizCombat（国军战斗）、PrevizIja（日军）四个占位库（`_import/Script_Previz<名>Clips.py` 在 Blender 里手 K，只烘 TengxianNra02，所有身体都能播），外加 06 的 CollectionCare。库没烘出来就跳过、只警告一次。播 `PREVIZ_WEAPON_SLUNG` 里的片段或清单写了 `weaponSlung` 的片段时，步枪背到背上；片段自带 weapon 道具轨时以道具轨为准。循环片段（清单 `loop: true`）一直循环到下一个 `clip` 键。别的关卡要加自己的动作包，在这张表里加一行，片段名别和已有的撞（`Pv` 前缀是 01–05 这批）。
- **台词** `lines[]`：`line` 是 `voice` 清单里的句子 id；`actor` 可省（省了 = 当前关键帧里 `castId` 等于这句 `who` 的单位；找不到就从玩家头上放、不动嘴）。字幕显示这句的 `speaker` + `subtitle`；有口型轨按 sha256 用口型轨，否则用音频包络张嘴（单位要有带面部的身体：`castId` 属于 `Data_FirstLevelSpeakingCast`）。
- **事件** `events[]`（`type` 必填）：
  - `flash` `{dur, strength?}` 白光；`black` `{dur, fade?}` 黑场（`fade` 渐入渐出秒数）；`caption` `{text, dur}` 非台词的说明字（弱显示，如「（耳鸣）」）。
  - `explosion` `{x, z, h?, kind?, radius?}`（`kind` 同 `VfxSystem.Explosion`；`h` 2026-10-18 第三轮加，爆点离地高 0–10 m，如炸在车尾铁板上写 1.5，缺省 0.3）；`smoke` `{x, z, kind?, dur?}`（`SmokeDust` / `SmokeWhite` / `SmokeBlack`）；`muzzle` `{actor | x,z,h, count?, interval?}` 枪口火；`shake` `{dur, strength}`。
  - `signal` `{name, on}`：在这一刻把场景信号打开 / 关掉（塌洞、坑沿被炸、战车瘫），播完或中断时恢复到 `then` 那个关键帧的 `signals`。
  - `sfx` `{name, x?, z?, volume?}`：`name` 用 §14.3 的别名。
- **飞机** `aircraft[]`（2026-10-19，用户「有飞机模型，你自己看下」）：一段里可以放几架，每架一条轨：
  ```json
  "aircraft": [{
    "id": "Ki30A", "model": "MitsubishiKi30",
    "path": [ { "t": 6, "x": 60, "h": 120, "z": -150 }, { "t": 12, "x": 58, "h": 60, "z": 150 }, { "t": 18, "x": 50, "h": 95, "z": 450 } ],
    "strafe": [ { "t0": 10, "t1": 11.5, "from": { "x": 60, "z": 120 }, "to": { "x": 60, "z": 175 }, "hz": 15 } ],
    "sound": { "drone": true, "diveT": 9 }
  }]
  ```
  - `model`：`Data_AircraftAssets` 的 id（`MitsubishiKi30` 九七式轻爆 / `MitsubishiKi21Ia` 九七式重爆 / `NakajimaKi43` 隼），缺省 Ki-30；模型借游戏自己的机队（`Script_Aircraft.AircraftFlight.AcquireClone`，白盒关卡里原机本来藏着），播完 / 中断还回池子。
  - `path`：≥ 2 个按时间**严格升序**的航点 `{t, x, z, y | h}`（`y` 世界高、`h` 离那一点地面的高，二选一）。位置是按时间的样条（非均匀 Catmull-Rom），**机头顺着速度方向、爬升角按高度变化、转弯时按偏航角速度带坡度**（`PREVIZ_AIRCRAFT.bankPerRadPerS`，夹 ±0.7 rad；在这套坐标里左转为正）。第一个航点之前 / 最后一个之后飞机不在天上（`visible: false`），要「从远处来」就把第一个航点放远。
  - `strafe[]`（可选）：扫射段 `{t0, t1, from:{x,z}, to:{x,z}, hz?}`，`[t0, t1)` 里弹着点沿 `from → to` 匀速推进、每秒 `hz`（缺省 15）发、横向确定性散布 ±0.8 m；地上的土点由 §14.2 的简易特效当「子弹打在土里」画（Seek 也看得见），开始那一刻按机身离听者远近放 `strafeNear` / `strafeFar`，每 3 发一声 `strafeDirt`。时间不在航线里只警告。
  - `sound`（可选）：`drone`（缺省 true）= 飞机在天上时 `planeDrone` 一直响、每帧跟着机身搬位置 + 按速度做多普勒；`diveT` = 那一秒放一次 `planeDive`（录好多普勒的通场）。别名就是 §14.3 的那五个，不另加。
  - 镜头锚可以指飞机：`{ "aircraft": "Ki30A", "offset": [dx, dy, dz] }`（`from` / `to` / `look` / `lookTo` 都行）。
  - `SamplePrevizAircraft(entry, t, { groundAt })` 是纯函数：Seek 到哪一秒飞机就在哪儿、机头朝哪儿；`PrevizStrafeImpacts(entry)` 给全部弹着点。
- **慢动作** `slowmo[]`（2026-10-19，用户「慢动作你直接做一个」）：`[{ "t": 12.0, "dur": 1.5, "rate": 0.3, "fade": 0.25 }]` —— 窗口 `[t, t + dur)` 里预演时钟按 `rate` 倍走（0.05–1），进出各 `fade` 秒线性渐变（缺省 0.25，夹到 `dur/2`）。人物走位、动作片段、特效、飞机、镜头都按预演时间求值，所以**一起慢**；台词照常速放（慢动作里排了台词校验报警告）；音效照常（没做变闷）。`durationS`、`Seek`、进度条都按**预演时间**，墙上时间更长（`PrevizWallTime(seq, t)` / `PrevizTimeFromWall(seq, wall)` 精确换算，`PrevizTimeScale(seq, t)` 是那一刻的倍率）。窗口不许重叠。
- 校验：`Script_EditorBlockoutPrevizPlan.mjs`（纯，node 与浏览器共用）导出 `BLOCKOUT_PREVIZ_SCHEMA`、`PREVIZ_LIE_MODES`、`PREVIZ_THROW`、`PrevizThrows(seq, baseOf, standAt, opts)`（这一段所有投弹的飞行：出手 / 落地时刻与两端点）、`SampleThrowFlight(flight, t)`、`ValidateBlockoutPreviz(doc, { config?, voice? })`（给了配置就核对 `keyframe` / 单位 id，给了清单就核对 `line`）、`NormalizeBlockoutPreviz(doc)`、`SamplePrevizActor(actorEntry, t, baseUnit)`、`SamplePrevizCamera(camera, t, resolve)`；2026-10-19 加 `PREVIZ_AIRCRAFT`、`SamplePrevizAircraft`、`PrevizStrafeImpacts`、`PREVIZ_SLOWMO`、`PrevizTimeScale`、`PrevizWallTime`、`PrevizTimeFromWall`。

### 14.2 播放（`Script_EditorBlockoutPreviz.mjs` + 总控）

- 播：卡片上的「预演」按钮或 `N`（当前关键帧有预演时；键码集中在 `Script_EditorBlockoutPreviz.mjs` 头部的 `PREVIZ_KEY`）；再按 `N` 或 `Esc` 中断。播放期间：相机归预演（`Script_Main` 在玩家相机写完之后调 `blockout?.ApplyCamera?.(camera)`，返回 true 表示这一帧相机已被接管）、第一人称枪模藏起来、鼠标归预演（同全关总图：不开枪、不转头、不抢锁）、玩家站在原地不吃 WASD、3D 标记与头顶标签藏起来、卡片换成「预演 · 标题 · 进度」、导航栏不响应。
- **切镜（2026-10-21，缺省）**：用户「直接切镜我大概就能 get 意思」「实际游戏我也不会做镜头动画（除了非常少的几个）」。镜头轨照写的口径存，播放时不插值：每条镜头一开始就切到落幅（转头 = 直接看过去，推拉 = 直接到终点）；长于 1.2 s、且起幅落幅差得多（转角 > 20° 或机位挪 > 1.5 m）的切成两个定镜，前半段起幅、后半段落幅；挂在演员 / 飞机上的锚照样跟着动；震屏照旧；写了 `keepMove: true` 的那条照原样运镜。台词、走位、事件的时刻一律不变（时长由台词与动作决定）。数在 `PREVIZ_CUTS`，取样 `SamplePrevizCamera(camera, t, resolve, { cuts: true })`（缺省 false，各关数据测试按照写的运镜采样）。`?previzCamera=move` 或 `Debug.Blockout.Previz.SetCameraMode("move")` 看照写的运镜；`State().cameraMode`。
- 单位就是当前关键帧的演员（`BlockoutPuppets`），预演按 `SamplePrevizActor` 每帧摆位；播完 / 中断时恢复：`then` 指的关键帧直接到位（§5.1 的 `GoTo(..., { animate: false })`）。
- 字幕由预演自己的 DOM 显示（编辑器模式隐藏游戏字幕的规则不动）：底部居中、导航栏上方，「说话人 · 字幕」，与编辑器同一套视觉。
- `window.Tengxian.Debug.Blockout.Previz`：`Has(idOrIndex)`、`Play(idOrIndex)` → Promise（播完 resolve）、`Stop()`、`Seek(t)`（暂停在 t 秒，确定性求值，截图用）、`Resume()`、`Reload()`、`CameraPose(t)`、`State()` → `{ playing, paused, keyframe, t, durationS, missingClips, missingLines, missingSfx }`；`Debug.Blockout.Probe(id)` 查一个演员的现场状态（取证用）。
- 实现口径（2026-10-18 运行时包）：
  - `Script_Main` 的钩子：`BlockoutInputCaptured()`（预演中键位动作、走动、冲刺、开火、开镜、姿态切换都清零），玩家相机写完之后 `blockout?.ApplyCamera?.(camera)`，预演中第一人称枪模与身体一起藏；鼠标走全关总图那套 `CapturesMouse()` 闸。
  - 中断与播完一样按 `then` 跳关键帧。
  - `Seek` 只对**持续状态**确定（演员、镜头、白光、黑场、说明字、字幕、嘴、信号、持续的烟）；一次性的爆炸、枪口火、音效 Seek 时不补放。按走过的距离推身体的走路片段（带 `referenceSpeedMps`，如 `IjaWalkStabProne`）Seek 时身体停帧，正常播放没问题。
  - 嘴：previz 文件写了 `faceTracks` 就按 mp3 sha256 用口型轨，没有就用配音的音频包络。
  - 预演期间小地图照常显示。
- 简易爆炸与飞行中的手榴弹（2026-10-18 第三轮，`Script_EditorBlockoutPrevizFx.mjs`）：默认白盒画质（特效关）出画前把 VfxSystem 整棵藏掉，`vfx.Explosion` 在白盒下什么都画不出来。预演自己在 `post.AddDebugOverlay` 的调试叠加层里另画：爆炸 = 一团火光（橙、0.3–0.5 s 胀大退掉，半径 = 0.22 × radius，夹在 0.25–2 m）+ 土柱 / 烟尘（7 团褐灰球往上冒、胀大变淡，2.6 s，顶高 0.75 × radius）+ 贴地尘环（写了 `h` > 0.5 的不画）；`radius ≤ 1` 的「子弹打在土里」只有一小团土（0.6 s）。**只在白盒且特效关时画**（`post.whiteboxScene.config.effects === false`；其它画质 VfxSystem 自己画得出来，不叠两份）；游戏本身各画质的爆炸不动。演员键 `throw` 的弹（一捆五根深色短圆柱 + 一条淡色拖尾）任何画质都画。两样都按预演时间求值：**Seek 到爆炸那一秒也看得见**（VfxSystem 的爆炸、枪口火、音效 Seek 时照旧不补放）。同一轮补了**烟**（`smoke` 事件：窗口 `[t, t + dur)` 里每个烟源 9 个槽位等间隔冒烟球，每团往上冒、往外飘、胀大、先浓后淡，窗口结束后已冒出来的散完；`SmokeDust` 褐黄土雾（冒 1.4 m、寿命 2.4 s）、`SmokeWhite` 灰白烟（掷弹筒出膛，冒 4.5 m、3 s）、`SmokeBlack` 黑烟柱（冒 5.5 m、3.6 s），表在 `PREVIZ_SMOKE_LOOK`）与**枪口火**（`muzzle` 事件：每一发 0.07 s 亮黄火光 + 0.6 s 一小团灰烟，位置取演员枪口，顺子自己开枪不画），同爆炸只在白盒特效关时画、按 t 求值。`Previz.State().fx` → `{ blasts, grenades, smokes, muzzles, blastsDrawn }`（这一帧画了几团爆炸、几颗弹、几个烟源、几下枪口火，白盒简易特效开没开）。

- 飞机与慢动作的运行时（2026-10-19）：飞机在 `Script_EditorBlockoutPrevizAircraft.mjs`（借 `editorHost.aircraft`——`Script_Main` 的 `game.aircraft` 取值器、`Script_Editor.editorHost` 转出——的 `AcquireClone` / `ReleaseClone`，自己的组标 `whiteboxCharacter` 所以白盒画质里保留贴图；引擎声 `audio.Play("planeDrone")` 起一条 voice 后每帧 `MoveVoice` 搬到机身、离场 / 中断 `StopVoice` 淡出；`audio=0` 时只画不响）。慢动作在 `Script_EditorBlockoutPreviz.Update`：`run.t += dt × PrevizTimeScale(seq, run.t)`，总控把 `dt × previz.TimeScale()` 喂给演员层（`BlockoutPuppets.Update`），所以人物步态 / 片段 / 动画时钟一起慢；卡片的秒数前写「慢 ×0.3」。`Previz.State()` 多给 `timeScale`、`wallT`（墙上已播秒数）、`aircraft[]`（每架的机型 / 可见 / 位置 / 模型有没有载进来）、`missingModels`。模型还没载进来（机队异步下载）那一帧跳过、下一帧再试。
- 门禁：`Script_EditorBlockoutPrevizRuntimeBrowserTest.mjs`（§10）。

### 14.3 音效别名（`sfx.name`）

运行时把别名映射到现有音频库的键（映射表 `PREVIZ_SFX` 在 `Script_EditorBlockoutPreviz.mjs` 头部）；找不到的别名静默跳过并记进 `State().missingSfx`。

**2026-10-20 直接放文件**：`PREVIZ_SFX` 里的一项也可以写 `{ url: "./Audio/BlockoutPreviz/xxx.mp3" }`（相对页面）。播这一段之前（`Prepare`）把用到的文件解码进游戏音频引擎的声库（`audio.LoadVoices`，键 `blockoutPrevizSfx.<别名>`，缓存戳 `PREVIZ_SFX_URL_VERSION`，文件重做了就抬），放的时候走 `audio.Play("voice.blockoutPrevizSfx.<别名>", { position, volume })`，所以照样按事件的 `x / z` 定位（地面 + 1 m）、`volume` 起作用、受引擎的距离衰减 / 预算闸。文件读不到或解不开**只警告一次**（console）、记进 `missingSfx`（`别名→url`），预演照常播；`audio=0` 时不装不报。`State().urlSfx` → `{ loaded, failed, loading, played }`、`State().audioState`（音频上下文状态）。两张表（`PREVIZ_SFX_ALIASES` 与 `PREVIZ_SFX`）要一致，`PrevizPlanTest` 核对。

| 别名 | 用在 |
| --- | --- |
| `artilleryFar` / `artilleryNear` | 01 炮声一阵接一阵、近处落一发 |
| `shellBlast` | 塌洞那一发 |
| `tinnitus` | 塌洞后耳鸣 |
| `mgBurstFar` / `mgBurstNear` | 坑里捷克式、支沟沿日军机枪、坡顶机枪 |
| `rifleVolley` / `rifleShot` | 02「打！」一排枪、零星枪声 |
| `mortarPop` / `mortarImpact` | 03 掷弹筒「嘭」与落地 |
| `grenadeBlast` | 手榴弹 |
| `tankTracks` / `tankGun` | 04–05 履带声、03 战车一炮 |
| `dirtFall` | 05 履带碾过、土往下掉 |
| `slap` / `stab` / `bodyFall` | 02 审问 |
| `planeDrone` / `planeDive` | 12–14 飞机远远嗡嗡、顺着大路俯冲下来（2026-10-19） |
| `strafeNear` / `strafeFar` / `strafeDirt` | 13–14 扫射：近处一串、远处一串、子弹打在土里（2026-10-19） |
| `babyCry` | 09-3 / 09-4 窖里的婴儿哭（文件 `Audio/BlockoutPreviz/Sfx_BabyCry.mp3`，2026-10-20） |
| `cellarSob` | 09-3 / 09-4 地底下压着嗓子的哭（`Sfx_CellarSob.mp3`） |
| `gateSmash` | 10-4 枪托砸门、一脚踹（`Sfx_GateSmash.mp3`，代替原来拿重物落地顶的） |
| `jarShatter` | 09-7 陶罐摔碎、弹壳撒一地（`Sfx_JarShatter.mp3`，代替碎屑声） |

### 14.4 占位动作与说话姿态（2026-10-19）

- **说话姿态**（用户 10-19）：说话那一刻正在开枪的（前后 1.5 s 内有他的 `muzzle` 事件）可以端枪；其余说话的人一律不端枪：不打仗的地方（01 防炮洞、02末集结处、03-1 交通沟里走）站着 `PvStandTalkSlung`、跪 / 蹲 `PvCrouchTalkRifle`、坐着 `WoundedSitRifleIdle` 这类；打仗的地方站着 `PvStandTalkLowRifle`，要指 / 挥 / 招 / 拦用 `PvStandPointL` / `PvStandWaveOnL` / `PvStandBeckonL` / `PvStandHaltL`（蹲着 `PvCrouchPointL`、趴着 `PvProneBeckonL`）。绝不能枪口对着顺子说话。
- **门禁**：`Script_EditorBlockoutFirstLevel0105PrevizTest.mjs` 的 `TalkPostureChecks`：每句写了说话人的台词开始时，说话人要么在播片段，要么倒地 / 在投弹，要么前后 1.5 s 内自己开过枪；跑着喊、没据枪的也算（`moving && !aim`）。端着枪（`aim`）又没开枪 → 错；没播片段干站 / 干蹲着拿枪 → 错。片段过了时长的算法同运行时（循环片段一直放，不循环的过了时长没写 `clipHold` 就清掉）。被子上的冬瓜那条放开给躺姿片段（`PREVIZ_LYING_CLIPS`）。
- **运行时补的能力**（只做加法）：
  - 走 / 爬循环片段（清单 `loop: true` 且有 `referenceSpeedMps`：拖被子、架伤员、抱捆爬、猫腰拽人）在走位途中照样播，身体时钟按实际速度推（播放速率 = 实际速度 / referenceSpeedMps），站住就停在那一帧，脚不滑（`Script_EditorBlockoutPuppets._ApplyClip`）。
  - 顺着躺（`lie: "along"`）的倒地的人播片段时，照样按片段里头 / 骨盆 / 两脚的方向把身子摆顺（`_LieClip`；淡入期间每帧量，淡完缓存）。
  - 片段带 `rootPath`（`PvClimbOutTrench`）：根顺着朝向往前、往上挪，往上的量按「末尾那一点的地面 − 起点地面」等比放大（`_ApplyRootPath`）；播完由生成器用位置键挪到末尾那一点（`ClimbOut`）。自带位移的 `PvBlastThrownBack` / `PvStandToProneDive` 同样：前者一直留着片段（`clipHold`），后者播完挪到片段末尾（`Dive`）。
  - 道具轨的网格：`Script_OpeningProps.RegisterOpeningProp`（只做加法，游戏不登记）+ 新模块 `Script_EditorBlockoutPrevizProps.mjs`：`launcher`（八九式掷弹筒，武器网格）、`shell`（弹）、`bundle`（一捆手榴弹）。掉地上的枪按片段的 `weapon` 轨落地（片段一直 `clipHold` 着）。
  - 背枪名单 `PREVIZ_WEAPON_SLUNG` 补上各库标「背枪」、又不带 weapon 道具轨的片段；`PREVIZ_WEAPON_HIDDEN`（抱捆爬、躺着攥袖子）手里、背上都不画枪（背枪那把是竖着挂的，趴下会戳上天）。
  - 预演里循环片段一直循环到下一个 `clip` 键（`ClipDuration`）。
- 生成器小工具（`Script_EditorBlockoutFirstLevel0105Previz.mjs`）：`Off`（往前 / 往右偏）、`SupportGo`（架伤员）、`Dive`、`ClimbOut`、`MortarCrew`；常量 `TALK_SLUNG` / `TALK_LOW` / `TALK_CROUCH`、`DRAG_MPS`。
- 截图验收：`_shots/EditorBlockout0105/Clips2/`（不提交）：`<拍号>_<人物>_<片段>_t<秒>.png`，第一人称的带 `FP_` 前缀。

**第二轮（2026-10-19）**：
- **背枪跟着上身走**：用 `AddOpeningClipLibrary` 登记的背枪片段、清单写了 `weaponSlung` 的片段、`PREVIZ_WEAPON_SLUNG` 里的片段，背上那把枪按开场库 `SlungRifle` 'back' 的挂法斜贴着背：枪托在后腰偏左、枪口从右肩后伸出去、准星朝外；姿态框架每帧从骨盆→脖子、左右上臂量（`Script_OpeningStoryboardAnimation.PlaceSlungAcrossBack`），人弯腰、趴下枪跟着倒。游戏开场的 `InterrogateCrouch` 照旧原来的挂法。抱捆爬改回背着枪（`PREVIZ_WEAPON_HIDDEN` 只剩躺着攥袖子）。
- **不打仗的拍子里不说话的人歇着**：PrevizTalk V2（`20261019PrevizTalkV2`）加 `PvCrouchRestRifle`（单膝跪，枪竖在身前、枪托着地，两手叠在护木上歇着，4 s 循环）、`PvSitRestRifle`（背靠沟壁 / 洞壁坐，枪竖在两膝之间两手抱着，根离墙 0.35 m，4 s 循环）。生成器 `PREVIZ_REST_BEATS`（01-1 / 01-2 / 01-3 防炮洞、02末-1 / 02末-2 集结处、03-1 交通沟里往回走）收尾时过一遍（`RestPass`）：这些拍子里所有人 `aim` 一律 false，蹲着干待着（没播片段、没在走）满 0.6 s 的空档插 `PvCrouchRestRifle`（洞里何有田背后是洞壁，用 `PvSitRestRifle`；01-2 冬瓜 `WoundedSitRifleIdle`），一走动就清掉。坡顶守着的兵（`CrestNra*`）和日军不管。02末-2 卫生兵接着按伤口（同 02末-1 的站位）。
- **门禁**：0105 PrevizTest 加 `RestBeatChecks`：这些拍子里任何人任何时刻不许据枪，也不许蹲着干待着不播片段（不到 0.6 s 的空档不算）。打仗的拍子里不说话的人照旧端枪。
- **03-3 刘文财和被掀翻的兵分开**：关键帧 `PitNra2` 从坑里 (2.8, 1.4) 挪到 (3.0, 2.2)（坑的本地坐标），朝向 180°、`lie: "along"`（倒地动作原来把身子甩回刘文财那边）；实测骨盆离刘文财 0.97 m、脚离他约 0.85 m（03-2…03-5 四帧，`export FirstLevel0105` 重导，其余单位一个没变）。
- **05-1 桥下头顶余量**（头骨点 + 0.2 m 到上方门板 / 横木底面，0.1 s 一采样，整段最小）：班长 0.42 m（钻桥底那一下播 `PvCrouchRunPullBehind`）、幺娃 0.47 m、机枪手 0.62 m，都 ≥ 0.1 m，不用改。
- **掷弹筒组按真实尺寸**（PrevizIja V2，`20261019PrevizIjaV2`）：八九式全长 0.610 m，游戏模型从筒口到底钣只有 0.415 m，`Script_EditorBlockoutPrevizProps.mjs` 把网格挂在一个等比放大 1.4699 倍的内层里（外层跟 `launcher` 道具轨走；倍数读清单 `props.launcher.scale`，`SetPrevizPropScales`）；装填手在射手右前 (0.82, 0.86) m、左转 107°（生成器 `MortarCrew`）。发射 1.60 s、弹进筒口 0.92 s 没变，「嘭」的对齐不动。

### 14.5 通用动作换成 Kimodo 文生动作（2026-10-20）

用户：「白盒工具里的通用动作用本地 Kimodo 生成，替换掉不够好的。」本机 Kimodo（`C:/Users/Bentl/kimodo` 的 venv，模型 `Kimodo-SOMA-RP-v1.2`，12 GB 显卡上文字模型放 CPU）一次只能跑一份——Kimodo 网页演示（`KimodoWorkbench/kimodo_demo.bat`）也占一份 8B 文字模型，生成前先关掉。

- **流水线**（都在 `_import/`）：
  1. `Data_KimodoPrevizPrompts.json`：每条片段的英文提示词、生成秒数、样本数、种子；`knee` / `hand` 写旧片段跪哪条腿 / 哪只手比划（Kimodo 偶尔左右搞反：跪姿先按膝盖、再按哪只手动得多，反了就整段左右镜像）；`pick` = 定稿用第几个样本，`rejected` = 生成过、但不如手 K、保留旧片段（写了原因）。
  2. `Script_KimodoPrevizGenerate.py`（Kimodo venv）：模型只加载一次，逐条生成 SOMA77 npz 到 `tmp/KimodoPreviz/<片段>/`（不提交）。18 条 × 3–4 样本约 12 分钟。
  3. `Script_KimodoPrevizRetarget.py`（普通 Python + numpy，SOMA77 中性站姿在 `Data_KimodoSoma77Neutral.json`）：Kimodo 全局旋转是相对它自己的 T 字中性站姿的，换算 `W目标(t) = H · R源(t) · A_b · W静止目标`：手脚按「骨头→子骨头」方向对齐（T 字 vs 游戏骨架静止姿势），躯干 / 颈 / 头两边静止都是站直朝前、直接一一对应（按方向对齐会把头往后仰约 15°）；骨盆高度按腿长比缩放。手指沿用旧片段；循环片段在样本里找首尾最接近、且手一直在动（≥ 最忙窗口的 60%）的一段再交叉淡化接缝；带停住段（`holdLoop`）的按「手停下来」的那一刻对齐旧的停住起点，最多加速 1.6 倍，再快就把停住段往后挪、片段跟着变长（清单的 `holdLoop` / `duration` 写新的）。整段按脚 / 膝 / 骨盆 / 胸 / 头的着地高度统一抬落。
     枪：`lowRight`（右手低提）右手两骨 IK 到旧片段的握枪位置（随骨盆朝向走），枪刚性跟手；`slungBack` 枪跟胸（运行时照旧按背枪挂法摆）；`upright` / `ground` 道具轨照旧、手 IK 上去。产物 `Animation/PrevizKimodo/`（同手 K 库的记录 + 清单格式，清单每条带 `source`：提示词、种子、样本、原始 npz 的 sha256、换的是哪个库的哪条）。
  4. 挑样本：`Script_KimodoPrevizRetarget.py --all-samples --out tmp/KimodoPreviz/lib` 出全部样本，`node Taierzhuang1938/_import/Script_KimodoPrevizShot.mjs <片段,…>` 出真模型联系图（第一行旧的手 K、往下各样本，6 个时刻，`tmp/KimodoPreviz/shots/`），`Script_KimodoPrevizSheet.py` 出火柴人图。
- **怎么替换**：`Data_BlockoutPrevizClips.BLOCKOUT_PREVIZ_CLIP_LIBRARIES` 第一项是 `PrevizKimodo`，片段名与被换的手 K 片段相同。运行时 `LoadExtraClipLibraries` 并行下载、**按表的顺序**并库（`AddOpeningClipLibrary` 同名不覆盖 → 表里靠前的赢）；生成器 `PrevizClipMeta` 和三关 PrevizTest 读清单本来就是靠前的赢，口径一致。删掉那一行就整套退回手 K。
- **这一轮换了 7 条**：`PvStandTalkLowRifle`、`PvStandTalkSlung`、`PvStandPointL`、`PvStandWaveOnL`、`PvStandHaltL`（停住段 0.4 → 0.81 s 起，片段 2.01 s）、`VilPanicRun`（参考速度 2.89 m/s）、`VilDuckProne`（停住段 1.35 s 起，人往前扑 0.77 m）。三关预演里共 112 处用到。
- **生成了但没换的**（`rejected` 写了原因）：跪 / 坐 / 趴着手扶固定道具枪的五条（Kimodo 的身体离旧的枪太远，IK 上去胳膊拧着）、`PvStandBeckonL`（像摸头敬礼）、`PvStandShakeHead`（样本里根本没摇头）、`VilCrouchHold` / `VilCowerWhimper`（没蹲下去）、`VilIjaShoutPoint`（没伸手指）。
- 已知：游戏骨架胳膊比 Kimodo 的人短约 6 cm、肩更高，Kimodo 自然垂下的手落在腰胯处，看着像叉腰（肘角两边逐帧一致，不是换算错）。

## 15. 06–10 新剧本白盒（关卡键 `FirstLevel0610`，2026-10-18）

按 Notion 06–10（10-18 晚定稿）与集成负责人的搭建契约 §3–§4，照 §13 的做法另建一片场地：干沟 → 凹路 → 耿家庄。**坐标与 `FirstLevel0105` 同一套**（原点 = 沟口，X 东 Z 南），06 的干沟、南岸枯树、凹路头一段从 `Data_EditorBlockoutFirstLevel0105Space.mjs` import，不抄数字；北半截（z < 205）的地面直接调 0105 的 `L0105Ground`，所以两片白盒在干沟一带逐点一致（场景生成器 notes 与测试抽 4000 点比对，差 0）。游戏里的第一关、`FirstLevel`、`FirstLevel0105` 都不动。

| 文件 | 是什么 | 怎么来 |
| --- | --- | --- |
| `Data_EditorBlockoutFirstLevel0610Space.mjs` | 空间锚点（唯一口径）：场地范围、平地大形、凹路南段（路底按弧长的控制点）、河汊子、整村压平高度、街、老耿家（前屋 / 大门过道 / 后院 / 灶屋 / 偏屋 / 石磨 / 地瓜窖 / 柴草垛 / 后门与水缸 / 共用墙上的狗洞 / 墙缝 / 侧门）、邻院、东街与主街两侧的院子、日常摆件表、五个场景信号、地名、出生点。头注列着与契约草稿不一致的地方 | 集成负责人的契约 §3 换算；摆不下 / 接不上的才挪 |
| `Script_EditorBlockoutFirstLevel0610Scene.mjs` → `Blockout/FirstLevel0610.scene.json` | 0.5 m 高度网格（540×880）+ 体块 + 随信号体块 + 路 / 沟中心线 + 47 个地标（`L0610Landmarks`，2026-10-20，见下） | `node Taierzhuang1938/Script_EditorBlockoutCli.mjs scene FirstLevel0610 --force` |

**地标（§2.2 `landmarks`，2026-10-20）**：`L0610Landmarks(sample)` 从锚点表填，坐标一律取 `Data_EditorBlockoutFirstLevel0610Space` 的常量。47 个：06 的干沟（集结处，半径 9）、老耿的驴车停处（南岸树底下）、妮儿捡弹壳的沟沿、凹路口、凹路尽头；村口路沟（片区）、路沟东半截（后送队）、街口坡道射击位（四人趴的那一溜）、村北口、巷子口；夹道 / 巷子东西那截 / 南北那截、主街、小空地、小空地北角、东街、后门外的小路（都是片区虚线）；翻倒的大车；老耿家的北窗（机枪，框从窗台到窗洞顶）、前门、大门（车道）、大门过道、前屋南门、灶屋门、偏屋门、石磨、柴垛、地瓜窖（框从坑底立到院子地面）、后门、水缸（堵后门，挪前的位置，note 写 10-6 推到门东边）；邻院西墙的小门、**狗洞**（框 0.7×0.45×0.4，就是共用墙上那个口子）、**墙缝**、**侧门**；石碾、场院、麦秸垛、土地庙、北边砸开的三道院门（①场院西隔墙 ②北侧第一个院西墙 ③北角北墙）、南边翻墙处、掷弹筒藏处、东街东头；河汊子（片区）、村南口。SceneTest 钉：≥ 40 个、七种 kind 都用到、过校验、都在场地里、狗洞 / 墙缝 / 侧门的框对准共用墙上的口子（宽 = 口子宽、狗洞高 = 过梁下沿）、窖的框从坑底到地面、北窗从窗台到窗洞顶、大车 / 麦秸垛的框和体块同心同尺寸、三道院门离门板 ≤ 0.3 m。12–18 的场景 `BlocksFrom0610` 只带体块，不带地标（12–18 要不要地标由它自己的会话加）。
| `Script_EditorBlockoutFirstLevel0610Keyframes.mjs` → `Blockout/FirstLevel0610.json` | 20 个关键帧（06-1…10-4），坐标全从锚点算；人物走位按村里的路网（凹路、主街、小空地、东街、巷子、各道门）自动排 | `... export FirstLevel0610 --force`（**会覆盖手改**） |
| `Script_EditorBlockoutFirstLevel0610SceneTest.mjs` / `...KeyframesTest.mjs` | 纯 node 门禁（见下） | `node Taierzhuang1938/Script_EditorBlockoutFirstLevel0610SceneTest.mjs` 等 |

地形：凹路沿用 0105 的折线到 (80,199)，再接 (84,230)→(90,260)→(96,320)→(100,378)，最后 12 m 坡道升到村口地面；路底宽 4 m、两壁 1.4 m；中段两侧地略高（+1.0），路深 1.9…2.6 m，村口前约 1.2 m。河汊子（村西，x 约 13…25）是南北向干沟，沟底绝对高 −2.7、宽约 6 m、两壁 2.5 m 内陡起、岸上一道矮土埂，沟底一线水块（只做样子）。耿家庄 x 40…235、z 383…548 整村压平到 +0.3，街面压低 12 cm，地瓜窖平底开挖 2 m。

体块：院墙 2.2 m（`plaster`）带门洞 / 窗洞 / 狗洞 / 墙缝，实心房子 3.2 m（`structure`，两座塌了一角），老耿家三间屋是空心的（墙 + 平顶 `roof` + 北女墙，前屋 3.5 m、灶屋 / 偏屋 3.0 m；窗台 0.9、门洞 2.0、大门过道 2.6 m 宽），石磨、窖沿与掀开的盖板、柴草垛、水缸、鸡笼、磨盘、门板、草帘、翻倒的大车、干沟里的血迹 / 绷带 / 空水壶，南岸枯树照 0105 的表。随信号体块（`gates`）：

| 信号 | 意思 | 从哪个关键帧起 |
| --- | --- | --- |
| `CartDeparted` | 老耿赶车走了：车上那几箱弹药（体块）跟着车走。编辑器没有「块跟着单位」的能力，用信号收掉 | 06-3 |
| `CellarBlast` | 窖里闷响一声：盖板飞开、窖口冒烟（只是样子） | 09-3（剧本炸在这一拍末） |
| `SideGateOpen` | 侧门从里头拔开门闩：门扇从门洞里消失、开着的门扇出现在老耿家这边 | 09-4 |
| `MgSilenced` | 北窗机枪组被从背后打掉：窗台上那挺十一年式没了，石碾后头出现一挺 | 10-1 |
| `BackVatMoved` | 老耿把堵门的水缸往东推开 1.7 m（(98,504) → (99.7,504)，让开门口）；10-20 第四版从 `BackDoorOpen` 拆出来 | 10-6（预演里片段 2.8 s） |
| `BackDoorOpen` | 后门闩拔开、门扇拉开到西墙边 | 10-6（预演里片段约 6.0 s） |

与契约 §3 草稿不一致的地方（都在锚点文件头注）：凹路 z 185…230 这一段中线在 x 80…84（为了与 0105 的凹路逐点接上，比契约西 2…6 m）；老耿家前屋收到 x 82…106.4、x 106.9…109.5 留一道 2.6 m 的大门过道（契约前屋占满院宽，后院就没有车能进的门，11 驴车要从后门出村）、前门因此从 x≈108 挪到 x 104、偏屋挪到 x 110…118.25；灶屋收到 z 480…487（契约到 492，狗洞 z 488 会开进灶屋）、门在东墙 z 483.5；前屋南门放在 x 94；巷子南北那截中线 x 58.75（契约 ≈56，贴着邻院西墙 x 60 走）；地瓜窖坑挖 1.6×1.6（0.5 m 网格挖 1.2 m 只剩一个尖）；**地瓜窖从契约的 (110,499) 挪到 (90.5,499.5)**：契约坐标离侧门 28 m，剧本写「留下的那个鬼子站在八九米外」、契约自己也写「9 m 左右」，按剧本的距离来（截图里 28 m 外的人根本看不清），墙缝随之从 z 493 挪到 z 496.5、缝 0.2 m（从缝里看窖口斜 18°，0.5 m 厚的墙上的缝看得到；z 493 要斜 36°，看不到）；石碾挪到 (113.2,465.7)；妮儿捡弹壳的坎顶挪到 (50,138.8)（契约 (50,140.5) 在坎的斜面上）。

运行时缺的能力（先凑、报告里也列了）：演员只能站在 ≤1 m 的块顶上，房顶 3.5 m 站不上去——房顶扔手榴弹的鬼子位置记在房顶坐标，运行时他会站在屋里地面上；没有「被人背着」的姿态，用蹲着的伤员 + 旁边架着的人顶替；体块不跟着单位走（车上的弹药箱用 `CartDeparted` 收掉）；玩家的武器固定是汉阳造，10-2 石碾后那挺缴来的机枪用随信号体块表示；单位没有 `y`，窖里的人站在窖底（按高度场）。

**预演（2026-10-18，第二批）**：`Script_EditorBlockoutFirstLevel0610Previz.mjs --force` → `Blockout/FirstLevel0610.previz.json`，20 段、每个关键帧一段、播完 `then: next`（10-4 `stay`），总长约 11 分钟（06 约 1.3 min、07 2.5、08 1.8、09 3.0、10 2.4；每段 16–67 s，07-3 数铜板那段 67 s 是整段对白）。写法同 0105（§14）：镜头大半是顺子的眼睛（`eye`），走着说、挤过后送队、穿院子用 `from/to` 跟拍；台词用 `Blockout/FirstLevel0610.voice.json` 的句子按录音间隔排，不互压；玩家要按键的时刻（掀被角、两次捂嘴、推刺刀、拔大刀）用说明字标出，不出按键。
- 门缝 / 墙缝（09-2 / 09-3 / 09-4 开头）：镜头一直是贴在缝后的眼睛（视场 40°），不给院里的特写。**0.5 m 厚的墙上 0.2 m 的竖缝斜着看窖口（18°），能看见的只剩约 2° 宽的一条**（视线要同时穿过墙的近面和远面两个口子）；09-2 把汉子爬出来、被捅倒都排在「眼睛 → 窖口」这条线上才看得见。侧门缝南边只有 0.1 m 的门扇，扇面约 15°（−4°…+11°），挑襁褓、甩在窖沿、门里贴墙的妮儿都在这个扇面里。眼睛位置和扇面由 `SlitEye` / `GATE_EYE` 算，PrevizTest 用 2D 视线核。
- 襁褓：剧本里只是老太太怀里的包袱，不建人；预演用一个按比例缩小的倒地 `child` 替身（`Bundle`）占位，挑起来那一刻才在窖沿上露面，镜头不推近。
- 现成动作顶不上的缺口（按大小排，运行时没有的能力也列在这）：① 百姓（老耿、妮儿、村民、窖里一家、石磨上的老汉）和军官是程序化身体，**一个动作片段都放不了、`stance: crouch` 也蹲不下来**（Probe 报 crouch，身子还是站着）：拍肩膀、比划、捡弹壳、举手爬出窖、被拖、呜咽、咬手腕、扑倒、挪水缸、拔门闩全是走位 / 姿态 / 说明字，「蹲下来比划」只有说明字；② 没有「扑倒 → 压刺刀」的成对动作：鬼子扑出来是 `BayonetClearWood`，压刺刀是 `ButtThreat` + 倒地仰视的眼睛，被咬手一松是 `RifleDeflect`，顺子的大刀两刀是两声 `stab` + 说明字；③ 没有扔手榴弹进窖、磕钢盔的片段（`DuckBlast` 顶）；没有撒尿姿态（站着背对，半转身用 `GuardTurn`）；没有数铜板、掀被角、拽袖子；④ 挑襁褓只有刺刀上扬的 `BayonetClearWood`，没有「从怀里扯、挑起来甩」；⑤ 房顶的鬼子站不上 3.5 m 平顶（在屋里地面上倒下，说明字注明）；⑥ 石碾后的机枪是随信号体块，从 10-1 `MgSilenced` 起就在，演不出「拖过去」那一下；玩家武器固定汉阳造，机枪连发用捷克式的声音顶；⑦ 没有「被人背着」、罐子落地声（`dirtFall` 顶）、婴儿哭、窖里哭声、飞机过顶（都是说明字）；⑧ 慢动作一秒半做不了（预演没有时间缩放）。
- 门禁：`Script_EditorBlockoutFirstLevel0610PrevizTest.mjs`（`--fresh` 查生成器当场生成的那份并核两次逐字相同）：校验器、片段按骨架（百姓 / 军官一个都不许）、台词不互压、走位点与路线不进实心块（按那一刻的信号算随信号体块）、机位与眼睛不在块里、说话人可见、缝后的眼睛到演员的 2D 视线不被 ≥1 m 的块挡、五个信号按拍开、09-1 每次挪动前 2.5 s 内有机枪响、掷弹筒越落越近。`Script_TestRunner` 已登记（tier0Fast、editor 域）；`Script_EditorBlockoutPrevizPlanTest` 也顺手过一遍这份文件。截图验收：`_shots/EditorBlockout0610/Previz/`（不提交）。

门禁（纯 node）：`Script_EditorBlockoutFirstLevel0610SceneTest.mjs` 钉住：生成两次逐字相同、与 0105 北半截逐点一致（干沟沟底 −1.0 / 坎顶 +1.5 / 凹路口接沟底）、凹路各段深度、河汊子宽深与陡壁、整村压平、窖深、狗洞 0.4…0.5 m 宽 / 过梁 ≤ 0.5 m（大人钻不过）、墙缝 ≤ 0.2 m、侧门口看得见窖边的人（门关着被门扇挡、门缝 / 墙缝里看得见窖口）、北窗顺主街看到村北口、石碾后顺东街看到东头、东街 3.5 m 净空且两边墙在一条直线上、主街净空、五个信号的随信号体块齐全。`Script_EditorBlockoutFirstLevel0610KeyframesTest.mjs` 钉住：生成可复现、校验 0 错 0 警告、摆位 / 走位问题 0、20 帧齐全、信号按拍起、后送队 12 副担架 + 24 个走着的伤员停在凹路里、冬瓜一直躺在自己的担架上、所有人脚下都在地面上（站在高度场或 ≤1 m 的块顶、身子不进实心块；房顶那个单独核在平顶范围里）、09-4 门开了玩家看得见撒尿的鬼子、09-2 / 09-3 缝里看得见窖口、08-1 村口看得见北窗里的机枪手、10-2 石碾后看得见东头与街上趴着的鬼子、妮儿走巷子进邻院、从狗洞钻进后院、进灶屋走灶屋门。预演与占位配音是第二批（契约 §5），这次没做。

**第二版（2026-10-19，用户当天拍板的 06–10 新稿）**：剧情改了四处——不上房、08 正面打、08 末妮儿跑、09 顺子意外进院、10 背后打 + 守东街四步——场景 / 关键帧 / 测试按第二版契约 §2–§5 重做；预演（`...Previz.mjs` / `.previz.json`）第二批同日按 25 帧重写（见下「第二版预演」）。改了什么：
- **场景**：村口外新加东西向的**村口路沟**（`L0610_DITCH`：中线 z 380、沟底 3 m 宽、−0.9，与凹路末端路底一致，x 56…125；凹路直接接进沟底，不再有 12 m 坡道升到村口；街口那一段南壁放缓成 3.6 m 的坡道给驴车上主街，别处 1.3 m 陡壁）。巷子主街那头封死，北边那片院子中间开 2 m 宽的南北**夹道**（x 79…81）、巷子口 (80,384) 开在路沟南沿上（北窗机枪从窗口看不见巷子口和巷子任何一段，SceneTest 核七个点）。**翻倒的大车**挪到 (100.8,446)、横在主街偏东（x 99.5…102.1）、加高到 1.15 m，车轮立在车身上。主街东侧最南那院的西南角收成小空地的**北角**（`L0610_STREETS.pocket`，x 103.25…112、z 452…460），北墙上开一道院门。**灶屋**收成 x 82…90、z 480…486。东街：北侧第二个院改成敞着的**场院**（南墙 x 156…176 不要，不盖房），中间 4.2×4×3 m 的**麦秸垛** (164,452)，掷弹筒组躲它北侧；南侧院墙外贴着街一座**土地庙** (192,466.4)（三面薄墙 + 顶，开口朝北，标 `prop:"Shrine"`，净空检查放过）；主街东侧的院子收到 x 118.25（第一版 x 到 135，与东街北侧院子叠着）。**北边抄后路的院子链**：场院西隔墙的门 (150,450) → 北侧第一个院西墙的门 (118.25,455) → 北角院门 (108,452)，三道门扇随新信号 **`NorthYardGatesBroken`**（10-4 起）消失、倒在地上的门扇出现。`roofPost` 改指大门过道（`gatePost`，旧名保留给旧预演 import）。老耿的车挪到干沟南岸树底下 (54.5,155)，妮儿蹲在凹路口边上的沟沿 (56.5,157.3)。197 块 + 21 随信号块。
- **关键帧**：25 帧（06-1…06-3、07-1…07-4、08-1…08-5、09-1…09-7、10-1…10-6，id 照第二版契约 §3，配音按 id 挂）。08 四个压窗口的人**趴在街口坡道上半截**（`L0610_MOUTH_SHOOTERS`：x 97.4…102.6、z 384.2…384.5，顺子在最西头、离巷子口 17.5 m）——契约写「路沟西半截 x 78…98」，但主街只有 6 m 宽、北窗离沟 90 m，趴在 x < 97 视线被主街西墙北头挡死；班长带何有田和后送队两个兵（`Escort1/2`）顺主街**东边**的门洞摸到大车北侧（契约写西边：车在西半边会挡住看北窗的视线扇），一个兵倒在车边；大门过道两个（`GateIja1` 甩手榴弹、`GateIja2` 08-4 跑去喊人，10-2 把大队带回来、在土地庙后）、前屋分队长 + 两杆步枪（08-3 挪到过道）、窖口三个、灶屋一个，共 11 个鬼子，没有人在房顶。08-4 喊人的鬼子出大门横过小空地、贴西墙往街里跑几步再掉头从北角拐去东街（大车挡着街心，只有车西边那 2.5 m 从街口看得见；KeyframesTest 沿他的路算可见 ≥ 1.5 s）。08-5 妮儿从车尾顺沟底往西跑、爬上南沿进巷子口。09-2 妮儿钻狗洞后缩在柴垛南边 (85.2,505.1)；09-4 窖里炸了（`CellarBlast`）、拎手榴弹的跑去前屋、拖人的进偏屋、留一个看守；09-5 门开了（`SideGateOpen`）看守在撒尿；09-6 顺子蹲在 (86,497)（离侧门 5.4 m）透过前屋南门看见**副射手**的后背（机枪手被前屋南墙挡；灶屋为此收小）；09-7 灶屋门口倒地仰视。10-1 前屋 + 过道 7 人全倒、剩 `Rifle2` 往东街跑；10-2 东街先头 6 个：3 个倒在离石碾 37…59 m 处、3 个缩在土地庙东边；10-3 掷弹筒组 3 人在麦秸垛北侧（从石碾后看不见垛子本身，只听得见响、看得见烟）；10-4 北边 4 个在院子链里（最前头的在北角院门外的院里），文财、幺娃堵在北角口；10-5 南边 3 个在南侧第一个院翻南墙 (126,490)，何有田去守后门，后送队穿院子（担架走大门过道、走着的走前门穿前屋，`CONVOY_IN` 表给每人落点；石碾后由 Squad3 顶着），妮儿抱老耿的腿；10-6 `BackDoorOpen`，冬瓜的担架抬出后门，幺娃趴在石碾后接过机枪。07 后送队贴西坎停成一长溜 z 190…315（12 副担架含冬瓜那副、16 个走着的、4 个架人的），车在玩家前头 6 m 靠路东边、妮儿站在车尾（没有坐姿），冬瓜那副在 z≈301，班长 / 排长蹲在东坎顶 (99.2,312)，07-4 全体趴下（百姓趴不下）。08–10-4 后送队缩在路沟东半截（7 副 + 冬瓜、9 个走着的）与凹路末段（5 副、7 个）。路网加了路沟、街口坡道、北角、夹道，过道尽头直通后院各口（过道盒子与后院盒子在 z 481 搭着一点，原来站在那条线上的人走不到后门）。
- **测试**：SceneTest 新钉：路沟沟底 / 宽 / 两沿 / 街口坡道单调上升且每米 ≤ 0.55 m、四个趴着的人都看得见北窗机枪手（头 1.15）、北窗看不见巷子七个点、09-6 侧门里看得见机枪组至少一人的后背、北窗看不见大车北侧的人、巷子主街那头封死、夹道通到路沟南沿、场院南墙中段敞开、北角里没墙、三道门砸倒后通、麦秸垛 / 土地庙 / 大车（1.1…1.2 m 高、在东半边、车轮在车上）在、邻院小门没门扇、六个信号。KeyframesTest 新钉：25 帧 id、`what` ≤ 60 字 / `next.text` ≤ 20 字、没有人在房顶（脚下不等于任何平顶的顶面）、六个信号按拍、07 车在玩家前头 5–7 m / 妮儿在车尾 / 07-4 全趴、08 四人趴在坡道上 / 班长四人在大车北侧 / 喊人的可见 ≥ 1.5 s / 妮儿顺沟往西过巷子口 / 后送队在东半截与凹路末段、09 走夹道过拐角 / 狗洞 / 柴垛后 / 一家人 / 看守撒尿→进偏屋 / 09-6 视线、10 东街 6 人（倒 2+、庙后 2+）/ 掷弹筒在垛北 / 北边 3–4 在院子链 / 南边翻墙 / 何有田守后门 / 幺娃接枪，另加 08-3 班长可见且被车挡住机枪、10-2 庙后的人被庙挡、10-3 掷弹筒组看不见、10-4 看得见北角院门、从过道尽头去后门走后门。
- **运行时做不到、先凑的**：百姓是程序化身体，趴不下、坐不了（07-4 妮儿站着，车尾「坐」= 站在车尾）；没有飞机、罐子、砸门声、落点的单位（预演用说明字 / 音效 / 爆炸事件）；体块不跟着单位走（弹药箱随 `CartDeparted` 收掉）；玩家武器固定汉阳造，石碾后那挺枪仍是随信号体块 `RollerMg`；掷弹筒组看不见只听得见；慢动作做不了。截图验收：`_shots/EditorBlockout0610v2/`（不提交）。
- **第二版预演（2026-10-19，第二批）**：`Script_EditorBlockoutFirstLevel0610Previz.mjs --force` → `Blockout/FirstLevel0610.previz.json`，25 段、每帧一段、播完 `then: next`（10-6 `stay`），总长约 13.8 min（06 1.3 / 07 3.1 / 08 2.8 / 09 3.6 / 10 3.1 min；最长 07-1 71 s 是整段数铜板的对白，07-2 50 s 是「我妹今年十二」+ 走到队头）。写法同 0105 / 第一版：台词按 `voice.json` 的录音间隔排、不互压，玩家要按键的时刻用说明字标出。这一版新加的做法：
  - **边走边说（07-1 / 07-2）**：眼睛是 `from/to` 机位、眼高 1.55，一直看着车尾的妮儿（`look` 演员锚 `Nier`），停停走走地挤（走 5–6 m 停 4 s；运行时按自然速度走，所以走慢只能靠停）；车、老耿、妮儿、小队各自保持离凹路中线的横向偏移（`LaneLat`）一起挪，车在眼睛前头 5–7 m（测试核每段走完的距离）。「我妹今年十二」在 07-2 开头站着说，眼前就是车尾的妮儿，不推特写。
  - **07-4 短过场（非第一人称，约 22 s）**：三个机位——东坎上俯看一长溜担架（人往坎底缩：小队 / 后送队 `stance: prone` 键错峰，妮儿最后一个抬头朝北）→ 凹路前头往回看全班弯腰跑、车跟在后头 → 凹路尽头北沿望见耿家庄冒烟（`SmokeBlack` × 3）、响枪；最后 2.6 s 切回眼睛趴在街口坡道上接 08。**飞机没有模型、也没有飞机的声音**：说明字 + 由北往南掠过的履带声低音量顶引擎 + 轻震屏。
  - **08 正面打**：08-3 班长四人从沟底街口分四段（392 / 408.5 / 432.5 / 大车）顺主街东边贴墙摸，玩家打一阵停一阵，窗口回一梭打沟沿、玩家停火那一刻掉头打班长（说明字点出）；过道里的 `GateIja1` 用演员键 `throw` 甩手榴弹落在大车东南角、3.75 s 后 `explosion`，`Escort2` 倒；08-4 喊人的先贴街西墙往街里跑到 (98.5,452)（大车西边、沟沿看得见）再从北角拐去东街；08-5 妮儿身边中枪的伤兵挪到她身边两步（布设里 `Walker04` 在 x 114，预演开场把他摆到 (104.6,380.9)），她从车尾顺沟底往西跑进巷子口、路上五个小土点追脚后跟，老耿爬出去被幺娃拽回，最后眼睛从坡道下沟、顺沟底往西冲到巷子口。
  - **09**：09-1 妮儿跑在前头进邻院小门，眼睛按「响了才挪」四段到门口；09-2 钻狗洞那一下是 `cut`（没有钻洞动作，墙里不能走）；09-3 / 09-4 墙缝、门缝照第一版 `SlitEye` / `GATE_EYE`，分队长调人的吼挂在前屋的 `Leader` 上；09-5 演「按到了」那支（看守系好裤子进偏屋，不说「嗯？」，`PisserGrunt.*` 两句这一版不用），「没按到」只写一句说明字；09-6 眼睛蹲在 (86,497) 透过前屋南门看副射手的后背，再贴西墙三段挪到灶屋门口、中途第二次呜咽；09-7 照第一版。
  - **10**：10-1 从前屋南门进去四枪打倒机枪组、分队长、从后院跑来的那个，班长喊「机枪哑了」从大车后冲上来，过道里的 `GateIja1` 被街上打倒、`Rifle2` 跑去东街；10-2 东街先头六个从 x 206…220 两个两个贴门洞往前跳，三个倒在离石碾 37 / 50 / 59 m，三个缩到土地庙后（`EastIja5` 当军官，四句 `EastEndOfficer.*` 都挂他）；10-3 三发掷弹筒落在 15 / 8 / 4 m，麦秸垛后只看得见烟；10-4 砸门声（`bodyFall` 顶）从场院门 → 北侧第一个院的门 → 北角院门往西挪，门倒（`NorthYardGatesBroken`）后四个人穿院子链钻到北角院门外，文财、幺娃蹲到北角口；10-5 后送队从街上进院、南边两人翻南院墙（翻过墙那一下 `cut`）、何有田去守后门、妮儿扑过去抱老耿的腿；10-6 挪缸开门、担架出后门、小空地一个宽镜头看幺娃接枪（`weapon: Type11`）。
  - **缺口**（第二版当时的；第三版做掉的划掉，剩下的见下）：~~① 飞机没有模型 / 声音~~；~~② 百姓趴不下、坐不了~~；~~③ 没有钻狗洞、翻墙的动作（硬切）~~；~~④ 没有扑倒 → 压刺刀的成对动作、没有慢动作~~；⑤ 没有砸门声、罐子落地声（重物落地 / 碎屑声顶；~~飞机声~~ 有了）；⑥ 走得比自然步速慢做不到（07 边走边说只能停停走走）；~~⑦ 撒尿、系裤子没有姿态~~；⑧ 石碾后的机枪仍是随信号体块，「拖过去」演不出；⑨ 10-2 东街没有军官单位，军官的口令从庙后的 `EastIja5` 头上放。
  - 门禁：`Script_EditorBlockoutFirstLevel0610PrevizTest.mjs`（`--fresh`）按 25 帧重写 DesignChecks：六个信号按拍、07 边走边说（镜头一直看妮儿、车离眼睛 5–7 m、「我妹今年十二」时站着）、07-4 前 18 s 无第一人称 + 三个机位 + 妮儿最后抬头、08-3 四段 + `throw` + 炸了才倒、08-4 可见段、08-5 四句顺序 + 先冲再被吼、09-1 / 09-6 响了才挪、09-5 不许「嗯？」、10-2 倒 2–3 个在 25–70 m、10-3 越落越近且首发 ≥ 10 m、10-4 砸门声往西 + 门倒了才钻、10-5 / 10-6 各自的到位。截图验收：`_shots/EditorBlockout0610v2/Previz/`（不提交）。
- **第三版预演（2026-10-19，白盒预演补齐 v3 契约 §3）**：同一个生成器 / 文件，25 段、总长 821 s ≈ 13.7 min（06 75 s / 07 184 / 08 168 / 09 221 / 10 174），百姓、军官全换成能放片段的骨骼占位身体（§5.6），用 PrevizVillage 的 Vil 片段 + PrevizTalk / PrevizCare / PrevizIja / CollectionCare 的 Pv / Care 片段：
  - **07-4 飞机**：段里 `aircraft[]` 一架 `MitsubishiKi30` 由北（z 20、高 85 m）往南（z 670）飞，凹路上空离地约 22 m、约 70 m/s、不开枪，`sound.drone` 引擎声跟着机身走、4.2 s 一次通场声；镜头 ① 3.2–6.4 s 用飞机锚 `look: { aircraft }` 看着它掠过头顶。人群 `VilDuckProne`（末帧停住）错峰扑倒：小队 2.2 s 起、排长 2.5、卫生兵 3.0、后送队 2.7–4.0、老耿拽完驴 4.5，妮儿坐在车尾听不见、6.0 s 最后一个趴（飞机 4.9 s 过顶）。
  - **百姓 / 军官的片段**（成对动作按清单 `stages` 的相对站位与 `offsetS` 摆，生成器 `StagePlace` / `StageAnchorFrom` 直接读清单；带根位移的播完用 `RootEndAt` 把人切到清单 `root.end`，小孩按 0.62 缩）：06 妮儿 `VilCrouchHold` 捡弹壳、何有田 `PvSitStuffPack` 收拾 / `PvStandWaveOnL` 赶人、老耿 `PvStandTalkSlung` 拍肩、班长 `PvStandWaveOnL`「都跟斗走」；07-1…07-3 妮儿 `VilSitEdge` 坐车尾（根钉在车尾板外 0.1 m、背对车，车动她 `move: drag` 倒退着跟）、幺娃 / Helper02 `PvStandTalkLowRifle` 边走边说、Helper03 背 Walker08（`VilNraCarryOnBack` + `VilRideOnBack`，同根同向）、卫生兵 `CareMedicBandage`、排长 `PvCrouchPointL`、班长 `PvCrouchTalkRifle` → `PvStandBeckonL`；08-1 村民 `VilPanicRun`、中枪 `ShotCollapse`、滚进沟的 `VilCrouchHold`；08-2 班长 `PvCrouchTalkRifle` / 点名 `PvCrouchPointL`、老耿 `PvStandPointL` 朝西朝东比、排长 `PvCrouchTalkRifle`、卫生兵 `CareMedicBandage`；08-5 妮儿 `VilPanicRun`、老耿 `VilReachPinned` + 幺娃 `VilNraYankBack`（stage yankBack，两人同时起、1.4 s 揪住拽回、播完各落到 root.end）、老耿 `PvCrouchPointL`「老总！俺妮儿」；09-1 妮儿 `VilPanicRun`、拎手榴弹的 `VilIjaShoutPoint`「出来！」；09-2 妮儿 `VilCrawlHole` 钻狗洞（根在墙西面外 0.25 m，爬完切到墙东边）；09-3 汉子 / 媳妇 / 老太太 `VilHandsUpClimbOut`（根在窖沿外、起步时骨盆在窖坑里）、拿刺刀的 `VilIjaBayonetThrust` + 汉子 `VilStabbedFall`（stage bayonetVictim，末帧是尸体 `clipHold`）、分队长 `VilIjaShoutPoint` 调人；09-4 拖人的 `VilIjaDragByArm` + 媳妇 `VilDraggedByArm`（stage dragByArm，两人 `move: drag` 倒退着拖 6 m 出扇面再切进偏屋）、挑襁褓 `VilIjaBayonetLiftFling`（甩出那一下襁褓占位露面）、老太太 `VilKneelCrawlToPit`、磕钢盔 `VilIjaHelmetGrenadeLob`（1.9 s 后窖里闷响）、留下的看守 `VilIjaPissStand`、妮儿 `VilCowerWhimper`；09-5 妮儿 `VilUnboltDoor`（门板在她前方 0.28 m，1.75 s 门开信号）→ `VilCowerWhimper` 呜咽，看守 `VilIjaPissStand`（停住段每 1.9 s 重起一遍，最后一遍 `clipHold` 走系裤子的出口）；09-6 妮儿 `VilClingHem` 攥衣角跟在眼睛后 0.28 m（stage clingHem，每段都重摆）、中途 `VilCowerWhimper`；09-7 灶屋鬼子 `VilIjaShoulderCharge` 从门里撞出来（根往前 1.2 m）→ 切到 `VilIjaPinBayonet` 骑跪压刺刀（眼睛趴在他前方 0.55 m 仰视，停住段每 1.9 s 重起、最后一遍 `clipHold`）、妮儿 `VilBiteWrist`（stage pinBite：他右侧 0.54 m / 前 0.38 m、晚 1.5 s 起播、0.5 s 咬中 = 他 2.0 s）、砍完 `VilCowerWhimper`；10-1 班长 `VilNraWaveCharge`（根往前 0.8 m，起点挪到大车西北角后、冲出去不撞车）；10-2 班长 `PvStandPointL`、军官 `VilIjaShoutPoint`；10-3 军官 `VilIjaShoutPoint`、掷弹筒组 `PvIjaLauncherFire` / `PvIjaLauncherLoad`（stage launcherCrew，`clipFrom` 对齐第一发「嘭」）；10-4 三道门各一个人 `VilIjaGateSmash`（根在门板前 0.55 m，砸 0.45 / 0.95 s 落砸门声、1.6 s 那一踹北角院门倒 = 信号）；10-5 翻墙的 `VilIjaClimbWall`（根在南墙北边 0.5 m，播完切到墙南边）、妮儿 `VilHugLegs`（stage hugLegs：老耿在她前方 0.341 m 面对她，`clipHold` 抱着不放）、Helper01 背 Walker01 进院；10-6 老耿 `VilPushVat`（根在缸北边 0.55 m，2.6 s 拔门闩时切信号）；各处蹲着的百姓一律 `VilCrouchHold`。
  - **09-7 慢动作**：`slowmo: [{ t: 11.1, dur: 1.5, rate: 0.3, fade: 0.25 }]`，咬中那一刻（11.4 s）在平台段里，窗口里没有台词，惨叫 12.65 s 在窗口过了才响（实机 Resume 0.6 s 墙上时间预演走 0.22 s，`State().timeScale` 0.3；Seek 暂停时 `timeScale` 仍报 1，取证看 `wallT`）。
  - **门禁**（`...0610PrevizTest.mjs`）新加：Vil 片段都在 PrevizVillage 清单里；`StageChecks` 按清单 stages 核每一对（捅 / 拖 / 咬 / 拽 / 背 ×2 / 抱腿 / 攥衣角 ≥ 8 对）的相对站位（≤ 0.12 m）、朝向（≤ 4°）、起播时差（`offsetS` ±0.1 s）；07-4 有且只有一架 Ki-30、由北往南、不开枪、引擎声开、凹路上空离地 15–40 m、过顶在妮儿趴下之前、镜头里看得见它（机位视场 0.75 倍内）且有一条镜头用飞机锚、不再拿履带声顶、十个人都有 `VilDuckProne` 且妮儿最后一个、错峰 ≥ 2 s；07 妮儿坐车尾（车中心北 1.2–1.5 m、朝北、`drag` 跟车）与背人的一对；09-2 钻洞的根在狗洞西口、播完才切；09-3 爬完才捅、尸体 `clipHold`；09-4 挑襁褓 → 露面 1.4–1.8 s、磕钢盔 → 闷响 1.7–2.4 s、拖的两人 `drag`；09-5 拔门闩 → 信号 1.3–2.0 s、撒尿片段重起 ≥ 4 遍且间隔 ≤ 2 s、最后一遍 `clipHold` 放完才走；09-7 肩撞从门里起、压刺刀重起 ≥ 2 遍、咬手腕晚 1.5 s、慢动作 1.5 s / 0.3 倍 / 带渐变 / 咬中在平台段 / 窗口里没台词 / 惨叫在窗口后；10-1 挥手冲跟着「冲！」起且播完切到 root.end；10-4 三道门各有人砸、往西、砸门声落在门上、北角那一踹 = 信号、门倒了才穿院子；10-5 翻墙的根在墙北 0.5 m / 播完切到墙南、抱腿 `clipHold`；10-6 挪缸的根在缸北 0.55 m、信号在 1.3–3.2 s；镜头采样的 resolver 认飞机锚。去掉了「百姓趴不下用抬头顶」「飞机要有说明字」这两条已经做到的断言。截图验收：`_shots/EditorBlockout0610v3/Previz/`（不提交）。
  - **还剩的缺口**（第四版做掉的划掉，见下）：① **占位身体的军帽摘不掉**（NRA02 的帽子和军装是同一个网格，§5.6）：老耿、妮儿、村民、窖里一家都戴着国军帽、穿着军装布换色的衣服；② ~~带 `holdLoop` 的片段出口放不出来~~（10-19 已补：预演键 `clipRelease`，见 §14 动作片段一条；撒尿的看守最后一遍系好裤子回头再走，压刺刀的鬼子被咬时甩手后仰；`EditorBlockoutPrevizRuntimeBrowserTest` 核显示秒数）；③ ~~**人物没法挂在车上**：妮儿坐车尾的根钉在车尾板外，车动的那几秒她的腿按原生步态走（`drag` 倒退）、停了又坐回去；小孩身体缩到 0.62 后坐高 0.56 m，车尾板顶 1.03 m，她的屁股陷在车尾板里~~（10-20 第四版：§3 `ride`）；④ 07 后送队背人的一对站着不动时停在循环的第一帧（走着才动）；⑤ ~~没有砸门声、罐子落地声（重物落地 / 碎屑声顶）、没有婴儿哭、窖里哭声~~（10-20：四条占位音效）；⑥ 走得比自然步速慢做不到（07 边走边说只能停停走走）；⑦ 石碾后的机枪仍是随信号体块、「拖过去」演不出，10-2 东街没有军官单位；⑧ ~~09-3 举手爬出窖的清单按 1.5 m 深 45° 坡写，白盒的窖是 2 m 深直壁坑，爬的人在坑里悬着半米~~（10-20：PrevizVillage V2 + 窖壁收直）；⑨ ~~10-6 `VilPushVat` 把缸往右（西）推，随信号体块把缸换到门东边——方向对不上，缸是跳过去的~~（10-20：V2 往东推 1.7 m、缸位照清单、两个信号）；⑩ 09-4 媳妇被拖进偏屋只拖头 6 m，出了门缝的扇面就切进偏屋；⑪ 冬瓜躺在担架上没给片段（担架上的倒地的人播躺姿片段会不会浮 / 陷没验过）。
- **第四版预演（2026-10-20，白盒预演补三处 v4 契约 §4：人挂到车上、窖与推缸对上、缺的声音）**：同一个生成器 / 文件，25 段、总长 827 s ≈ 13.8 min（只有 09-3 24.9 → 27.3 s、10-6 26.4 → 29.9 s 变了，其余 23 段逐字不变）。场景 `BuildFirstLevel0610Scene` 197 块 + 21 随信号块（数不变），关键帧 25 帧 1454 位次（数不变）：
  - **07 妮儿坐车尾跟车走**：关键帧 07-1…07-4 的 `Nier` 带 §3 `ride: { on: "GengCart", x: 0, z: 1.2, y: 0.467, yawDeg: 180 }`（生成器 `NIER_RIDE`：车尾沿 + `SitRootY(1.025, 0.90, 0.62)`，`U()` 新认 `ride`，`UNIT_KEY_ORDER` 加进去；摆位检查「站在车身里」放过挂在这辆车上的人），她自己的 `x / z` 写成车尾那一点、朝北；06-3 与 08 起都不挂。预演 07-1 / 07-2（`CrowdWalk`）/ 07-3 只给 `VilSitEdge`、**一个位置键都没有**（原来的 `drag` 跟车键全删了）；07-4 她坐着跟车挪到坎边，5.6 s `{ ride: null, x, z（车尾外半步）, move: "cut", stance: "stand" }` 从车尾滑下来站在车边抬头，6.0 s `VilDuckProne` 在车边扑倒（最后一个）——没让她在车上缩成一团：`VilDuckProne` 的根在脚下的地上，挂在 0.467 的车尾沿上播它人会悬在半空；爬上车板缩成一团没有片段，而且她本来就是「看见别人都趴了才学着趴」。08-1 起她在沟里，不挂。
  - **09-3 从 2 m 直壁爬出窖**：锚点 `cellar.wallM` 0.4 → 0.15（契约与 V2 清单都按「四壁直的」写；0.5 m 网格里坑心 ±0.5 m 是坑底、0.5…1.0 m 一段 45° 斜壁、1.0 m 外整高——原来 0.4 时坑口在网格里宽到 3 m、1.0 m 处是半深），窖沿矮块固定在坑心外 1.2…1.4 m（`CELLAR.floorW/2 + L0610_CELL_M`，不再跟 `wallM` 走）。三个人的根（`CELLAR_RIM_M` = 1.0 + 清单 `wallBehindM` 0.10 = 1.1 m）：汉子在视线上、x 方向离坑心 1.1 m（东壁）、背对窖口（原来的 `RIM_E` 是径向 1.6 m），媳妇 / 老太太在南沿 (90.0 / 91.0, 500.6) 朝南——起步时骨盆（根后 0.55）都在坑里的坑底上。汉子 4.2 s 起爬、5.0 s 爬完举手（停住段喘气），9.2 s 切到清单 `root.end`（根前 0.38）接 `VilStabbedFall`，刺刀的锚点按 `root.end` 反算；媳妇 10.0 s 上、老太太 14.0 s 上（一个爬到顶另一个才上，同一个口子），分队长吼与眼睛离开缝都往后挪（段长 +2.4 s）。PrevizTest 核：根离坑心 1.1 m 上下、背对窖口 ±25°、起步骨盆在坑里、两人间隔 ≥ 3.5 s、爬完先切 root.end、捅在爬完（5.0 s）之后；窖沿 1.3 m 内不报「落在斜坡上」。
  - **10-6 推缸开门**：老耿的根 (96.95, 504) 朝东（清单 `vatStart` 1.05 m），缸 (98,504) 沿 z 504 往东推 1.7 m → `L0610_GENG.backVatMoved` (99.7, 504.0)（原 (99.7,503.4)）；`BackDoorOpen` 拆成 **`BackVatMoved`**（`BackVat` 消失 / `BackVatMoved` 出现，片段 2.8 s `vatMoved`）与 **`BackDoorOpen`**（门扇，切在拉门半道 6.03 s = `doorGrab` 5.75 与 `handsOff` 6.3 的中点），时刻都从清单 `clips.VilPushVat.events` 读；10-6 关键帧两个信号都为真；播完（7.6 s）切到清单 `root.end`（(97.85, 504.55) 朝南：门东边、面朝门口）再绕北边走到关键帧位置让担架过；妮儿挪到他西北 (96.6, 502.9)，不蹲在推道上。12–18 的场景 `scene FirstLevel1218 --force` 重烘（`BlocksFrom0610` 带过来的 `BackVatMoved` 块现在标 `from0610: "BackVatMoved"`），1218 的 Scene / Keyframes / Previz 测试照旧过、源文件没动。
  - **四条新音效**（§14.3；文件时长 ffprobe 实测：babyCry 3.53 s、cellarSob 4.00、gateSmash 2.33、jarShatter 1.53）：09-1 第二段停下听见「出来！」时与吼完各放一遍 `cellarSob`（从窖口放：窖底 −1.7，声源在地面下）、09-3 一家出来前 0.5 / 4.6 s 两遍；09-4 `babyCry` 倒着排——文件尾对齐刺刀扎下去那一刻（10.1 s，从 6.57 s 起，预演音效没有「掐断」），从老太太怀里放，「孩子在哭」的说明字跟着提前到 6.8 s；09-7 罐子掉地 `jarShatter`（原 `dirtFall`）；10-4 每道门一遍 `gateSmash`，文件里第一下（0.07 s）对齐片段第一下砸（0.45 s），后两下比片段的 0.95 / 1.6 s 晚 0.27 / 0.44 s（文件里的间隔比片段宽，认了）。PrevizTest 核五处别名、位置、时刻，并禁掉旧的 `bodyFall` / `dirtFall` 顶替。
  - **门禁**：SceneTest 七个信号、缸推 1.7 m 让开门口、窖坑网格（±0.5 坑底 / 1.0 外整高）、矮块位置；KeyframesTest 两个信号从 10-6 起、07 四帧 `ride` 逐字、别的帧不挂、缸位 (99.7,504)；PrevizTest 如上（`RideChecks` / 09-3 / 10-6 / 音效）；PrevizPlanTest、ConfigTest 照跑。截图验收：`_shots/EditorBlockout0610v4/Previz/`（不提交）。
  - **还剩的缺口**：① 占位身体的军帽摘不掉（§5.6）；④ 背人的一对站着不动时停在循环第一帧；⑥ 走得比自然步速慢做不到；⑦ 石碾后的机枪仍是随信号体块、10-2 东街没有军官单位；⑩ 媳妇只拖头 6 m 就切进偏屋；⑪ 冬瓜躺担架没给片段；新的：⑫ 窖口在 0.5 m 网格里是 45° 斜壁（0.5…1.0 m），爬的人的脚和手比真直壁靴 0.1–0.25 m 进土；⑬ 09-3 结束时汉子的尸体在视线上 (92.0, 500.0)，09-4 开场照关键帧放在 (93.0, 498.2)，差约 2 m（第三版就这样）；⑭ 砸门声文件三下的间隔比片段宽（后两下晚 0.27 / 0.44 s）；⑮ 婴儿哭只能靠文件尾对齐刺刀，哭声里最后一阵 2.4–3.5 s 正好在扎之前，但 1.0–2.4 s 那一段是空的；⑯ 07-4 妮儿从坐着到站在地上是一下切过去的，没有「滑下车」的片段；⑰ 挂在车上的人每帧跟车，车在关键帧之间走时她跟着走，但 06-3 → 07-1 她是在切关键帧时「上车」的（06-3 末她还在车边走）。
- **07-4 飞机改（2026-10-21 用户改）**：用户原话「飞机第一次半低空出现 应该是去轰炸县城的 理论上不止一架飞机……不应该飞得这么低，只是正好路过看到了这里有很多士兵，所以第二次执行完任务返航、再一次出动的时候才低空凌射的」。一架贴麦地低飞 → **三架 `MitsubishiKi30` 排成人字**（领机凹路正上方 x 98，左右僚机横开 45 m、落后 35 m），离地约 400 m、约 85 m/s 由北往南（z −55 → 880）飞过去炸县城，不俯冲、不开枪（没有 `diveT` / `strafe`），引擎声各自跟着机身；右后那架在头顶上往外偏 13 m 再回来（航线拐个小弯，运行时按转弯给坡度 ±0.3–0.5 rad = 斜了斜翅膀：看见了凹路里的人）。镜头 ① 1.6–3.6 s 用飞机锚看着领机（仰角 56°–78°），过顶前落回坎底看人缩；人群扑倒照旧。13 那两架低空扫射的 Ki-30 = 它们炸完回去、再一次出动来的：13-1 说明字写「先前那种日机，这回两架贴着地皮……」（12-1 远处县城冒烟试过：烟在 370 m 外、眼睛朝着车，画面里看不见，撤了）。门禁改成：≥ 3 架、都是 Ki-30、都由北往南、整条航线离地 ≥ 250 m、不许 `strafe` / `diveT`、至少一架坡度 > 0.25 rad、领机过顶在妮儿趴下之前、镜头里看得见、有镜头用飞机锚。
- **第五版空间（2026-10-21，用户「随便绕啊现在是」）**：第四版里河汊子（x 19）离庄子西墙还隔 17 m 空地、东北角东南角也空着，从村口路沟往西、往东都能绕到村南，08「绕不过去」不成立。改成往南只剩主街 → 老耿家 → 后门 → 村南一条：
  - 河汊子中线 x 34.5（沟底 31.5…37.5），东壁坎沿顶到庄子西墙根 x 40，墙根平地 0.2 m；庄子那段（z 372…548）东岸不堆土埂（`eastBankOff`），以北以南照旧；沟底铺满 1 m 深的水（水面 −1.7）：一个人蹚得过，抬着肚子开了口的伤号不行；
  - 村口路沟西头不收口，沟底 −0.9 一直挖到河汊子东壁、落进河沟（排水口），西岸还在，顺沟底走不出去；
  - 补满三块院子（`L0610_FILL_YARDS`）：西南 (40…60, 492…545)、东北 (118.25…232, 388…440)、东南 (135…232, 490…545)，共墙不重画，外沿一整圈墙不开门；东北北墙放在 z 388 是为了让开街口坡道看东北道的视线；
  - 两道没门扇的后门：主街西边北头那院西墙 z 425 → 巷子，主街东边最北那院北墙 x 110 → 路沟东半截（08-1 村民从这两道门逃出来）；
  - 东街东头出去一条往东北的土路 `L0610_EAST_ROAD` (232,465)→(300,320)，压低 0.15，道边三个坟头、两棵树；场地往东放宽到 x 320（`Script_EditorBlockoutLevels` 的占位 bounds 跟着改）；地标 50 个（+东北道、两道后门）；
  - 视线实测：趴在街口坡道上看东北道，道中线 x ≥ 274 那一截才稳看得见（(272,388) 擦着主街东侧院子北墙东头，余量 < 1 cm）；凹路里蹲着，眼睛比两边麦地低，地面挡死，07 末要直起腰才看得见庄子和道。庄子东沿外仍是开阔麦地，往东绕在白盒里走得通（约 330 m），「绕不过去」靠的是鬼子正顺东北道进庄（07 末、08 都看得见）。
  - SceneTest 新钉：西边封死（z 390…540 每 2 m 平地 ≤ 0.5、x 40 墙无缝）、路沟西头落进河汊子、水 1 m 深铺满沟底、两道后门门洞通、三块补的院子朝外无门洞、巷子南头封死、10-4 院子链 / 10-5 翻墙处 / 11 后门外小路不被堵、东北道在场地里并从东街头出去、x 250…320 没有怪坡、两个观察点看东北道不被块挡、关键帧单位都不在新墙里。
- **第六版预演（2026-10-21，用户改稿）**：25 段、总长 894 s ≈ 14.9 min。
  - **07-4 全程第一人称**（用户不要切出第一人称）：0–2.6 s 蹲着跟班长后背跑；排长「飞机！贴到坎！」，2.6–12.6 s 顺子半蹲在东坎根，用 §14.1 新加的 `eye.free`（能转头不能走）——默认视线先看车尾的妮儿、再抬头跟领机、滑到斜翅膀的右后那架、落回坎底，一动鼠标视线就归玩家；飞机轨不动；班长「起来！走！」后蹲着跑，末段班长先直起腰、顺子跟着直起来，望见耿家庄冒烟和东北道上四个鬼子（x 280…295）；到路沟班长回头压手「趴倒！」，眼睛落到 08-1 的趴姿位置。
  - **08-1 村民走岔路**：两个从主街东边 z 432.5 院门冲上主街被北窗机枪打倒；一个从巷子后门顺巷子三截跑到巷子口、滚进沟倒在顺子脚边（「东头……过来的……进庄了……」）；两个从路沟后门下到沟东半截。老耿两句：「那是俺家……狗日的占了俺家。」「窖里还藏着街坊哩。」
  - **08-2** 按新台词一人一场排（班长直接问有没有别的路；老耿：西边河汊子水齐腰深、东边是鬼子来的道、往南得从俺家后门出；卫生兵：泡一哈冷水就没得了），老耿朝东指时默认视线转向东北道上的鬼子。08-3 班长改「过不去了！日他先人，一冒头就是一梭子！」。
  - **08-5 顺子直接跟进巷子**：删掉「玩家不动老耿就再喊一遍」；老耿喊完接约 10 s 第一人称，顺子爬起来顺沟南沿往西跑进巷子，到 (80,394) 交还操作；刘文财「往哪跑」时说明字讲清他趴在东边 5 m、没看见妮儿钻巷子，班长缩在大车北边背对路沟，只喊「压到起！哪个龟儿停了？！」。09-1 起点改到 (80,394.5)。07-1 / 07-2 回头看得见后头两步的刘文财（他听到了「路费」那段）。
  - 台词：07-3 卫生兵「……就等到挖坑埋人！」、07-2 幺娃「……你刚才说的，老子一个字都没听到。表跟第二个人讲。」；班长「都跟斗来！磨你妈啥子！」不改。配音 14 次请求（CopperCoins 2 次、StretcherDonggua 到 3 次上限），旧场 `NoWayAround` 拆成一人一场（多嗓子合录必串），`--face` 补齐口型轨。
  - 门禁：PrevizTest 07-4 加「整段第一人称、飞机过顶那段是位置不动的蹲姿 free 眼睛、默认视线里出现过东北道上的鬼子」（原有飞机断言保留）；08-1「主街倒两个、两道后门出来的三个活着、滚进沟那个离顺子 ≤ 2 m」；08-5「最后眼睛在巷子里、离巷子口 ≥ 8 m、没有再喊一遍」。PrevizPlanTest +1、`Script_EditorBlockoutPrevizRuntimeBrowserTest` +3（free look）。

- **第六版空间（2026-10-22，用户「过于规整，不像华北平原的村子」「至少也是七拐八拐的小路」）**：耿家庄按新编《滕县志》居住 / 乡村建设、《巨野县志》院落、莒南县地情资料住宅重摆（出处写在 Space 文件头，史实与创作账见资料馆「滕县旧时的院子和村路」「院子大小不一」）。
  - **院子**：四合院 / 半面槽院 / 排房院混着（`L0610_YARDS` 60 院 + 老耿家 / 街坊家 / 本家院），进深面宽 8…32 m、相邻院子后墙前后错 2–6 m，夹 8 块菜园 / 空宅基、1 个取土坑积水、5 处粪堆、36 棵零散的树；真实尺度（北屋 10×5、配房 4×6–7、南屋 10×4）。院门在东南 / 西南角，胡同在北边的那排只能开北墙角。主街拉直 6 m 是创作。
  - **胡同**（`L0610_STREETS` 41 条）：1.5 / 2 / 2.5 m 混着，东西向的在每个街块交界错开 3–8 m 成丁字口、错位口，8 条死胡同；除锁定的主街 73 m、东街头一段 72 m 外最长直段 46 m。生成器 `LaneWalls` 给每条胡同出两侧墙和死胡同尽头墙、丁字口自动留口。
  - **塌墙堵路**（07 末「几处房顶冒烟」也算它们）：6 堆瓦砾把唯一那条路的岔口全堵死（`L0610_RUBBLE`）；另有 6 座塌了一角的房子、3 截倒在胡同里的墙分散在全村。顺子和妮儿从巷子口 (80,384) 到老耿家灶屋门只有一条路（`L0610_ROUTE`：夹道 → 街坊家半掩的西南角院门 → 西配房西北角豁口、东墙窗洞看窖口 9.7 m → 出院门 → L4 往西 → 南北夹道 → 本家院 → 共用墙上的狗洞 / 便门），只留 L4 东头通丁字路口（搜窖的鬼子去支援走这条）。
  - **老耿家**改半面槽院：北屋三间（后墙三个枪眼，堂屋那个正对主街、离地 1.1，原北窗机枪搬到这里；枪眼是创作、出处待查），西屋两间是灶屋，院门东南角开在东墙上；没有后门、水缸、大门过道、偏屋。往南只剩老耿家东墙外拐三道弯的窄胡同到新村南口 (117,545)（原 (98,545) 往东挪），中段 WD2 东墙随 `LaneWallCollapse` 倒进胡同，踩 1.2 m 的柴垛翻进 DY 院、从它的院门出来接回胡同；村南口东南种一棵 9 m 的大槐树 `bigLocust` (121.5,548.5)，从窄胡同拐进出村那截看得见树冠。`BarrageHit` 塌老耿家北屋东间、石碾旁出一堆新瓦砾（草顶着火只用烟事件，没做体块）。
  - **东街**拐两道弯；探头点（门洞、豁子、枪眼、庙、垛）都在石碾往东 ±7°、33–88 m；0.5 m 厚墙上的枪眼顺街打不到石碾，对着路口的两个开在第一道弯的正面墙（x 182）上，过了弯的两个门洞标 hidden；石碾南北 8 m 内是实墙。`L0610_JIEFANG.glimpse` 用 (65.8,468.2)（站着斜看得见窖口）。
  - **信号**：删 `BackVatMoved` / `BackDoorOpen`，加 `BarrageHit`、`LaneWallCollapse`。12–18 的出村小路跟着改折线 (117,545)→(117,552)→(98,566)→(98,612)，`backDoor` 改名 `gengGate`，`gengSmoke` 挪到老耿家院子。
  - **门禁**（SceneTest）：从巷子口在 0.25 m 可走格子上泛洪只到唯一那条路沿线（便门 `SideGateOpen` 前后两态）；从丁字路口不穿院子往南只有窄胡同，`LaneWallCollapse` 后必须经柴垛翻 DY 院；院子口径；探头点扇面；石碾两侧实墙；院门外必须是胡同 / 菜园；大槐树看得见；关键帧里的人不落进挡人的块（门洞过梁、磨盘底座不算）；与 0105 接缝差 0、生成两次逐字相同。俯视图：`_shots/EditorBlockout0610v6b/TopView_clean.png`（不提交）。

- **第七版预演（2026-10-22，Notion 定稿 + 第六版空间：老耿家半面槽院、机枪从北屋后墙的枪眼里打、往南只剩东墙外的窄胡同）**：关键帧 25 帧并成 **24 帧**（08 四帧、09 七帧、10 六帧，06 / 07 不动），预演 24 段、总长 999 s ≈ 16.7 min（06 79 s、07 199、08 178、09 312、10 232）。`Blockout/FirstLevel0610.json` / `.previz.json` / `.voice.json` 重导。
  - **08**：08-1「枪眼」（字幕里「窗口」一律改「枪眼」；老耿只说「那是俺家……狗日的占了俺家」）；08-2「绕不过去」按新顺序：班长先朝东看一眼「东边是狗日的来的路，走不得」（默认视线转向东北道上的鬼子）再问「西边喃」→ 老耿河汊子 → 卫生兵蹚水 → 老耿「往南就一条道，俺家东墙外头那条小胡同，胡同口就挨着俺家」（视线回到枪眼）→ 排长 → 顺子 → 卫生兵 → 班长「把那个枪眼压到」；08-3「压枪眼」没有台词，班长四人蹲在坡道脚下等；08-4「妮儿跑·班长定计」把旧 08-4 / 08-5 并了：伤兵中枪 → 妮儿顺沟底往西钻巷子 → 老耿被幺娃拽回 → 顺子追（约 5 s 不能操作）→ 刘文财「顺子！你狗日的往哪……」半句被「闭嘴！压到枪眼！」喝断 → 班长冲巷子口「带到她顺巷子摸过去，摸到那狗日的屁股后头！老子在前头给你吸住火！」→ 进巷子十来米交还操作（`eye.free`，身后只听得见）→ 班长四人贴主街东边门洞摸到大车后头「过不去了！一冒头就是一梭子！」→ 墙角一个鬼子横过街口往东跑（幺娃「跑了一个！」）。大车 1.6 m 宽，四个人一溜排在它正北 x 101.8…103.7 那条影子里才都挡得住。
  - **09**：抓住妮儿（80,394.5）→ 一眼瞥见（L4 上、院门外 1 m、「窖口 → 门洞」那条线上：空间表的 glimpse (66.5,469.2) 正对门洞往北看，门缝里看不到偏东的窖口，关键帧用了 HoleEye 的那个点）→ 豁口·窗户纸·捂嘴（西配房窗后 0.6 m，蹲姿；爬出窖 / 被捅 / 被拖 / 老太太；妮儿呜咽 + 捂嘴按键，没按到正好一梭机枪盖过去）→ 大缸·哨子（探进门洞「ん？」→ 街上枪声密了 + 哨 → 「おい！はやくかたをつけろ！ろじぐちへいくぞ！」→ 挑襁褓 / 婴儿哭断 / 磕钢盔扔手榴弹 CellarBlast → 四个人出院门顺 L4 往东去路口）→ 狗洞·便门（穿院子出院门、夹道、本家院；妮儿绕过东厢房钻狗洞、沿北屋南墙和灶屋北墙之间 0.5 m 的夹缝到院子、便门里拔门闩 SideGateOpen）→ 屁股对到老子（门洞 1.2 m、机枪手正对门后 3.5 m：院子南墙根 x 97.8…102.2 那一截才看得进门里的后背，站点 (98.6,484.4)；再贴西墙响了才挪到灶屋门口）→ 灶屋（罐子掉地 → 肩撞进灶屋 → 压刺刀 → 妮儿咬手腕**不放慢** → 拔刀砍两刀 → 北屋过来的东西两间递弹的两个「どうした！」在灶屋门口撞上、屋里打，倒在灶屋里 / 门口）。两人一路拉着手走唯一的路（`HandInHand`：妮儿前头半步、眼睛跟着她，全程蹲姿）；删了攥衣角、第二次呜咽、撒尿的看守、门缝 / 墙缝那两段。
  - **10**：背后打（灶屋出来顺屋檐到堂屋门，六个全倒，先机枪组；MgSilenced；班长「机枪哑了！冲！」；墙角五个两面挨打倒两个、三个往东街跑）→ 守路口·试探（机枪从北屋拖到石碾约 45 m；东街的鬼子两三人一组从街北院门冲出来扑进下一个门洞、街南豁子 / 第一道弯枪眼打冷枪、过了弯 hidden；「つぎのもんまで、はしれ！」「ふせろ！」「左手第二道门！」「右边墙豁子！」）→ 掷弹筒·北边抄（土地庙后轻机枪、麦秸垛后「嘭」三发越落越近、砸门往西 NorthYardGatesBroken（10-3 起）、「左手院子！文财、幺娃，给老子堵到！」「幺娃，接到！」幺娃接过机枪）→ 后送队过胡同（顺主街跑到路口贴着石碾背后一副一副拐进窄胡同，担架小跑；老耿的车进胡同，妮儿从院门跑出来抱腿；老耿看一眼地上的人、看一眼顺子）→ 炮·撤（「ぜんいん、さがれ！ほうげきがくるぞ！」吹哨全退、静两三秒、「炮！进屋！」第一排炮 BarrageHit + 耳鸣、「撤！走胡同！跟斗老子！」、幺娃枪栓扔水缸、何有田院门框边卡手榴弹「滚！表挡事！」）→ 炮里撤（全程跑；班长六句短喊；LaneWallCollapse 砸塌胡同、踩柴垛翻墙进旁边院子、挨了弹片的被两人一边一个架着跑（PvLegHitKneelClutch / PvSupportWalkL·R / PvSupportedHop）、「往那棵大槐树跑！过了槐树就是村口！」、出村南口后送队缩在路沟里，then stay）。删了「突撃」「南は塀を越えろ」「有田！滚去后门守到！」、挪缸开后门、担架穿院。
  - **走位速度**（用户：别像散步）：挨着枪的一律跑（NRA 3.2、鬼子 3.6）、抬担架小跑 1.9、09 潜行 1.0–1.6 蹲着挪、10-6 全程跑；KeyframesTest 钉「08–10 里当兵的每一次 ≥ 2 m 的移动 speedMps ≥ 1.9」（百姓、拖着人的鬼子除外），上一轮 10 里的 21 处走路速度和路沟后送队的 1.0 全改了。
  - **日军人数**：08 开头 15（北屋机枪组 3 + 分队长 + 东西两间枪眼 4、墙角 2、搜窖 4、灶屋 1）；08-4 墙角一个去喊人；09-7 灶屋 1 + 北屋来的 2 死在灶屋；10-1 北屋 6 全倒、墙角倒 2 跑 3；10-2 起东街是喊来的小队（约 45 人，白盒摆看得见的 14 个 + 过了弯 hidden 3 个；10-3 再加轻机枪 2、掷弹筒 3、抄北边 4：10-3 看得见 19 个）。
  - **12-1 跟着改**：`Script_EditorBlockoutFirstLevel1218Keyframes` 12-1 的 what / how 改「出了村南口」「身后村里的炮停了、轰一声（院门框上那颗手榴弹）」；1218 预演 12-1 字幕同改（机枪声换成炮声 mortarImpact）；`Data_EditorBlockoutFirstLevel1218Lines` RoadWest 场景改口径、删「推门了」那句、去掉 pickup，整场重配（2 次，第一次老耿念错）。1218 的 Scene / Keyframes / Previz 三个测试绿。
  - **配音**：0610 改了字 / 场景 / 句数的 21 场重抽（23 次请求：LuoSendsShunzi 第 1 次多念了一句、HeGrenadeGate 三次都报削波、装第 3 次）；一字没动的照旧复用。口型轨重烘（烘焙器退出码 2 只是报字体子集缺字形；用户 10-22 定不下载源字体重烘，缺的字回退系统字体）。
  - **门禁**：KeyframesTest / PrevizTest 按 24 帧、七个信号（+BarrageHit 10-5、+LaneWallCollapse 10-6、NorthYardGatesBroken 挪到 10-3）、新台词顺序、新站位、拉手 / 蹲姿 / 跑速重写；成对动作 ≥ 7（攥衣角删了）。BrowserTest 狗洞地标那一检查从 09-2 挪到 09-5、站位 24。大槐树（`bigLocust` (121.5,548.5)）和 `glimpse` (65.8,468.2) 已合进第六版空间；EM1 的北屋紧贴朝路沟的后门，08-1 村民从门洞起算。

- **第八版预演（2026-10-24）：两路**。用户 10-24：「这里班长和顺子应该分两路穿插巷口，而不是傻傻的等着吧……他们都是悄悄的进村而不是大张旗鼓的正面迎敌……离敌人越近越好打……大刀手榴弹……倾向于和日军贴身打近战而不是正面硬刚。」顺子那一路（09 全部）照旧不动；班长那一路改成穿主街东边两个院子摸到路口墙角那伙鬼子的侧后，正面留人吸火。24 帧、24 段，总长 1021 s ≈ 17.0 min（第七版 999 s；08-4 55 → 78 s、09-4 → 38 s、09-7 → 28 s 变长，其余只加了背景戏）。
  - **路线**（`Data_EditorBlockoutFirstLevel0610Space.L0610_EAST_YARD_ROUTE`，坐标米、X 东 Z 南）：大车后头 (102.3,443.8) → 顺主街东沿 (102.4,439.5) → 主街东边 z 432.5 那道敞着的院门（EM2 西墙 (103.25,432.5)，门在大车的影子里）→ EM2 院子西南角 → 墙根的柴垛 `EastClimbPile`（(104.75,434.2)，1.6×1.1×1.2，贴着 EM2 / EM3 之间 z 435 那道墙的北面；起跳点 `climb.from` (104.75,432.95)、落点 `climb.to` (104.75,436.4)，照 `L0610_SOUTH_LANE.climb` 做成「链接」，墙不开口子）→ EM3 北屋西边 2.5 m 宽的空地（x 103.5…106、z 435…440.5）→ 从空地南头 (104.8,441.4) 穿 EM3 院子 → 蹲在 EM3 南墙的院门（就是路口东北角 pocket 的北门 (106.5,458)）后头：班长 (105.8,456.5)、何有田 (107.3,456.6)、Escort1 (106.5,455.1)。09-7 末隔墙甩两颗手榴弹（落点 (107.4,460.6)、(105.4,461.4)）、撞开门（新信号 **`EastGateBurst`**：`PocketGateLeaf` 随它消失、门扇倒在 pocket 里）、班长换大刀冲进去（10-1 站位 (106.2,460.3) / (107.6,461.8) / (105.2,461.6)）。
  - **逐帧**（关键帧 `EAST_ROUTE`）：08-4 四人在大车后头（照旧）；09-1 刚进 EM2 院门 (104.6,433.1) / (104.5,431.5) / (105.5,432.5)；09-2 EM2 院里 (105.9,433.0) / (104.4,431.2) / (106.8,431.6)；09-3 柴垛跟前：何有田蹲在起跳点、班长 (105.6,432.1)、Escort1 (104.0,431.3) 盯院门；09-4 人梯：班长 (104.75,432.2) 在何有田身后；09-5 落在 EM3 空地 (104.7,438.4) / (104.6,436.3) / (104.8,437.2)（显式 path 经柴垛两边、标 climb / through）；09-6 / 09-7 门后；10-1 pocket 里（班长 `weapon: "Dadao"`）。Escort2 09 一直留在大车北侧 (102.5,440.0) 吸火，10-1 上街 (101.9,441.0)。坡道上三个每帧换一次窝（`SHOOTER_SLOTS_09`：四个射击位里挑三个，顺子那个 08-4 起空出来了）。关键帧 `how` 末尾各加一条「班长三人这时在……」，POI `LuoRoute` 标他们的位置。EM2 / EM3 院里各加一口水缸（`WaterVat_EM2` (108.4,418)、`WaterVat_EM3` (104.1,447)）。
  - **视线核对**：SceneTest 核路线上 10 个点、KeyframesTest 核 09 每帧三人——堂屋 / 西间 / 东间三个枪眼后的人（1.1）和 pocket 里每个鬼子（蹲着 1.2）都看不见这条路上蹲着的人（0.9）：院门被大车的影子挡（从堂屋枪眼看，车的影子在 z 432.5 处是 x 102.2…104.7）、院里的点被主街东墙 x 103.25 和 pocket 北墙 z 458 挡。10-1 顺子贴在东间枪眼上看得见 pocket 里的班长（枪眼正对墙角 ±17°）。
  - **预演**：08-4 班长喊完「带到她顺巷子摸过去……老子从东边院子穿过去——你那头一响，老子这头就动手！」（22 s）再冲坡道上喊「幺娃！你们三个给老子把枪眼压到，打一枪换个窝，莫停！」（30 s，Squad3 爬到顺子空出来的射击位），四人分三段摸到大车后头（41–60 s），「过不去了！一冒头就是一梭子！」（61 s）→「走院子！」（67 s）→ 班长、何有田、Escort1 错开 1.3 s 猫腰顺东沿钻进院门，Escort2 冒头一枪。09-1…09-6 每段末三人挪到下一帧的站位（`EastRouteMove`，1.0–1.1 m/s 蹲着走）、坡道上三个各打一枪趴着爬到下一帧的窝（`ShooterShuffle`）、Escort2 冒头一枪（`CartPotShot`）。09-4 街上枪声一密（探头的「ん？」之后）何有田压着嗓子「班长，踩到老子肩膀上来」（8.6 s），班长在起跳点面朝南播 `VilIjaClimbWall`（13.6–17.0 s）切到墙那边，Escort1、何有田接着翻（人梯和「回身拉上去」是说明字）。09-7 惨叫（11.6 s）响过约 1 s：13.9 / 14.8 s 两声手榴弹（班长、何有田各一个 `throw` 键，爆炸、`grenadeBlast`、土烟都在 pocket 里，眼睛还趴在灶屋里——听得见、看不见）、墙角一个鬼子「手榴弾っ！」、守着的那个（CornerIja1）炸倒；北屋两个「どうした」说完（20.0 s）`EastGateBurst` + `gateSmash`，班长 `weapon: Dadao`、`DadaoAmbush` → `CreepDadao` 冲进 pocket「杀——！」、`LuoDadaoChopRear` 砍倒拖人的那个（CellarIja3，随机骨架只许通用片段，倒地用 `ShotCollapse` 顶），何有田、Escort1 端枪跟进，剩下三个往东街跑。10-1 开场班长三人在 pocket 里，机枪一哑（6.9 s）班长在墙角里扭头冲八十米外的坡道吼「机枪哑了！冲！」（7.6 s，`PvStandWaveOnL`），坡道三个和 Escort2 顺主街冲上来；12 s 镜头切到东间枪眼：墙角里的班长三人、脚下两具尸体——两路在丁字路口会合；14.6 s 班长 `weapon: HanYang`。10-3 北边院子链只剩两道门要砸（场院西隔墙、北侧第一个院西墙），第二道那一踹 = `NorthYardGatesBroken`，最前头那个穿院子到敞着的北角院门外。
  - **台词**（`Data_EditorBlockoutFirstLevel0610Lines.mjs` 第五版；这几句是新写的，还没进 Notion 剧本）：`LuoSendsShunzi.02` 后半句改字；新加 `LuoHoldsMouth`（「窗子」写成「枪眼」：第四版起字幕里没有窗）、`PinnedAtCart.02`「走院子！」、`LadderWhisper`、`PocketGrenade`（ijaB「てきだんっ！」）、`LuoKillShout`「杀——！」；`MgSilenced` 字不动、context 改成在墙角里冲坡道吼（提示词变了照旧重抽）。七场重抽（`LuoHoldsMouth` 第一次把角色名也念出来了，重抽一次）、`--face` 重烘口型轨（烘焙器退出码 2 还是字体子集缺字，10-22 用户定了不重烘）；`LuoSendsShunzi` 的 context 加了「两路的计划」「约好的信号」那几版提示词过不了 SeedAudio 的文本审核（HTTP 400 45001125，三种措辞都不过），context / direction 退回第四版原文、只改台词就过了。
  - **史料依据**（写进说明字的口径）：川军贴近了打——日军《歩兵第六十三聯隊史》说川军约三分之一以上没有步枪，各带手榴弹约六枚，夜里摸到阵前三十米投手榴弹（姜克实《日本軍の史料から見る滕県作戦の実記録》2015）；第二集团军参谋长对卡尔逊说进攻多在夜里，贴近了日军炮兵用不上，打成肉搏；士兵的排序是手榴弹比日军机枪管用、大刀最管用（Carlson《Twin Stars of China》1940）——**有依据**。分两路：1935《步兵操典新草案》以「每排一班分轻机关铳组及步铳组」为编制基础，两组分工有依据（班攻击具体条文没拿到）；喜峰口夜袭队分两路、台儿庄敢死队搭人梯翻高墙——**有依据**。小股日军占民房据守、窗口架机枪、门口 / 墙角放哨，其余在屋里（姜克实据日军战斗详报：第 10 中队突入东关后占民家一角过夜；美军 1943 情报通报：要点警戒 4–7 人）——**有依据**。白天悄悄摸进被占村子的国军一手战例查不到——**创作**。凿墙打洞推进是日军工兵的做法，国军这里只翻墙、不凿墙。
  - **门禁**：SceneTest 八个信号、`PocketGateLeaf` 随 `EastGateBurst`、柴垛贴墙不开口子、翻墙是链接（不翻进不了 EM3、翻了到得了南门后头、门没撞开进不了 pocket）、路线十个点三个枪眼 + 墙角哨都看不见；KeyframesTest `EastGateBurst` 从 10-1 起、09 每帧三人不在大车后头 / 09-1…09-4 在 EM2 / 09-5…09-7 在 EM3 / 09-6、09-7 离南门 ≤ 3 m / 全程蹲着不端枪 / 逐帧视线 / Escort2 留在大车后头 / 坡道三个趴在射击位且每帧换窝 / 10-1 三人在 pocket、班长大刀；PrevizTest 08-4 新台词顺序 + 走院子后进院门 + Escort2 冒头一枪 + 换窝、09 班长那一路没有 muzzle、每段末到下一帧站位、09-4 人梯（何有田那句 → 起跳点面朝南的 `VilIjaClimbWall` → 3.4 s 后切到墙那边、班长翻时何有田在 1.2 m 内、班长翻过去了下一个才翻）、09-7 两声爆炸在 pocket / 晚于惨叫 / 段结束前 / 炸了才撞门 / 撞门前换大刀 / 撞开门才「杀」/ 最后在 pocket、10-1 班长在 pocket 里喊冲 + 坡道三个喊了才冲 + 会合说明字、10-3 两道门。旧断言「班长从大车后冲上来」「VilNraWaveCharge」「三道门」换成新口径。截图 `_shots/Rev0610_20261024/`（旁观机位临时注入 previz 的 camera，盘上文件不动）。
  - **拿不准、怎么定的**：① 说明里写的「GateIja1 手榴弹炸倒 Escort2」是第四版以前的戏，第七版起 08-3 没人倒、Escort2 一直活到 10-6（挨弹片的就是他）——所以班长那一路是三个人（班长、何有田、Escort1），Escort2 留在大车后头吸火，没杀他；② 跑掉的鬼子保持三个（10-2「跑在最后那个被机枪扫倒」用的是第三个），所以手榴弹只倒一个、大刀倒一个；③ 新台词「窗子」写成「枪眼」；④ 门扇只有一个信号位，北角院门改挂 `EastGateBurst`，10-3 砸门改成两道；⑤ 人梯没有现成片段：何有田蹲在起跳点旁当垫脚是说明字，翻墙三人都用 `VilIjaClimbWall`，「回身拉上去」也是说明字。

- **第八版空间（2026-10-24，用户「地图太规整……河汊子不可能是笔直的；队伍旁边一大片空地；田怎么分的；路为什么只有一条；厕所、庙、买卖的地方、坟地」）**：只改空间，08–10 的戏不动，关键帧 / 预演重导跟上。依据见 Space 文件头（新编《滕县志》、1954 年美军图、卜凯、Smith；完整出处 Notion「第一关 01–18 地图设计的依据」）。河汊子改天然弯河：中线折线弯一个来回 80–95 m、水面 4–9 m、凹岸陡凸岸泥滩、西来小沟汇入，河弯离开庄子西墙那段是苇子洼（烂泥 −0.9），西边照旧封死；横断面数与接缝 z 556 的中线 34.5 不变，1218 不用改。凹路几道缓弯、两边坎高低不一、坎上零散树和坟。田按拼块铺（17 块、每块 50–110×70–140、方向各异、五分之一整块），返青麦 / 翻过的地 / 撂荒分色，田埂 0.25 烘进地面。耿家林 / 王家林 / 义林 + 田里单坟 20 座。老驿道从北界接到东北大道、往东邻庄的大道、11 条田间小路。庄子：锁定的 26 个院子（剧情 / 路线 / 1218 借的）轴对齐不动，其余 22 个转 ±3°…±8° 往里收 11–18%（房子不缩），外沿去掉 NE2b / SE6b / SE9 换成空地树丛残墙，外沿 5 处单门独院；村南西半边、东街南边院子后头、村东南、东北角的小巷改折线（拐角 1°–64°、宽窄不一）。新加关帝庙（WM2 改，兼村塾）、杂货铺（EM1 临街一间）、村外小庙（东北道边）、土炮楼（NE4 东北角 (229.5,390.5)）、浇地井 3 + 吃水井 4、每个住人院子一个茅圈（49 个）、场院 2、菜园、庄东北取土坑；东北道视线带里的场院、独院、菜园都挪开了。核心院子斜 2–4.5° 这一项没做（09 路线 / 枪眼 / 门洞要跟着重摆）。SceneTest：`Intersects` 改成按转过的框分离轴判；新加河 / 庄子 / 田 / 路 / 建筑门禁。俯视图 `_shots/EditorBlockout0610v8/`。
- **第九版预演（2026-10-24，Notion 剧本 07–10 按用户同日点头的新版改）**：用户「哪有班长等顺子的道理？……要么妮儿是自己来的」「（08 那几句）写的罗里吧嗦也没听懂要说什么」。班长不等顺子、不上主街，一句话定计分三拨；妮儿自己跟来；08 那几句啰嗦的删了。24 段，总长 1014 s ≈ 16.9 min（第八版 1019 s；08-1 30 → 56 s、08-2 50 → 46 s、08-4 76 → 51 s、09-1 16 → 23 s、09-2 74 → 66 s）。
  - **07-4 末**：直起腰先看庄子（19.8 s 起）：冒烟的都在主街以东（x > 110；白盒画质特效默认关，简易烟球只冒五六米、隔着村墙和东头的房子看不见，smoke 事件新加可选 `scale`：冒的高度乘 scale、烟团大小 / 飘散 / 寿命乘 √scale，这四处用 3 倍、冒到十六七米），东头一阵一阵枪声，夹着远处听不清的日本话（`ijaShoutFar`：借 09-4 搜窖那句日语配音远远放，不另配）；22.4–24.6 s 一条定镜（fov 50）朝东北角：四个鬼子（RoadIja1–4，占老耿家那伙的尾巴）离了大路，弯着腰斜穿麦地往土炮楼那边钻，离凹路尽头 112–120 m。
  - **08-1**：Villager1 从庄子东北角外 (166,385.2) 13.9 s 起顺北墙根、路沟北沿往西跑；15.5 s 土炮楼西北角外 (226.6,386.5) 的 NeCornerIja 露头打一梭（6 发，土在他脚后跟溅起一串，不往沟里打），露一下就缩回去、08-2 起不摆；36.4 s 他扑进沟东半截爬到坡道边 (104,381.6)，38.4 s「东头……过来的……进庄了……」边说边往东指。两个从院门冲上主街被打倒、两个从路沟后门 (110,385) 钻出来照旧，班长看了那道后门一眼（说明字：记住了）；夹道那边不再有人跑出来。
  - **08-2 / 08-3**：班长先扭头朝东看一眼（镜头跟到东北角刚才开枪的墙角），最后一句改短「……日他妈。打！给老子把那个枪眼压到！」（39.4 s）。08-3 班长四人蹲在坡道脚下不动（不往大车摸了），拍末机枪回一梭扫进沟，妮儿身边的伤兵中枪、血溅她一脸，她缩在沟底（`VilCowerWhimper`）。
  - **08-4**：2.4 s 班长瞄一眼后门，一句定计「压到枪眼！有田，跟老子穿院子。顺儿，你走巷子，摸到他屁股后头。哪个先到哪个先打！」；11.3–18.9 s 班长、何有田、Escort1 错开起步，顺沟底往东、猫腰钻后门进 EM1；顺子顺沟南沿往西爬进巷子口（约 5 s 不能操作），13.0 s 刘文财「让他一个人走？……」、16.2 s 班长头也不回「闭嘴！压到枪眼！」；进巷子十来米交还操作；20.6 s 老耿「妮儿！妮儿——！」、24.5 s 幺娃「老人家你不要命了嗦！」（妮儿趁乱溜出沟，顺沟底往西爬上南沿钻进巷子：看不见，只听得见）；31.3 s「跑了一个！往东边跑了！」墙角一个鬼子出路口往东跑。Escort2 爬上坡道补顺子空出来的射击位，段末换到 09-1 的窝。
  - **09-1**：顺子一个人在第一道弯直着拐进往西那条死胡同（`alleyWestStub`），12 s 走到头被瓦砾堵死；14.8 s 妮儿追上来拽他衣角（`VilClingHem`）；他回过身，她松开衣角退半步（离眼睛 0.85 m：贴着拽衣角那 0.28 m 往下看只看得见头顶），镜头平着看她脸上还糊着血、朝他摇头（`PvStandShakeHead`），再攥住他的手往南带。09-2 起照旧。
  - **班长那一路**（关键帧逐帧，全程蹲着、不开枪、不上主街，每帧核过北屋三个枪眼和墙角哨都看不见）：08-4 后门跟前 (109.8,382.3) → 09-1 刚进 EM1 (109.3,387.6) → 09-2 EM1 / EM2 之间的豁口（班长已钻过、何有田在豁口里、Escort1 排在北边）→ 09-3 EM2 西边空地南头的柴垛跟前 → 09-4 人梯翻 z 435 那道墙 → 09-5 翻进 EM3 → 09-6 / 09-7 蹲在 EM3 南门后。坡道上四个（幺娃、刘文财、Squad3、Escort2）每段相邻两人换一次窝。09-7 / 10-1 照第八版「两路」；10-1 冲上来的是坡道上那四个，大车后头没人了。
  - **空间**：EM1 / EM2 之间 z 410 那道墙塌了一角，豁口开在西头 x 103.9…105.6（宽 1.7 m；墙头两截参差、地上两堆碎土坯，做法同街坊家西配房的豁口）——说明里写的 x 108…116 后头正贴着 EM2 的排房，钻过去就是房墙。EM1 北屋收成两间、挪到后门东边（原来堵在门里头），EM2 的茅圈挪到东南角（原来自动落在西北角，正堵豁口）。新地标 `LmEm1Breach`。
  - **台词与配音**（`Data_EditorBlockoutFirstLevel0610Lines.mjs`）：删 `LuoHoldsMouth`、`PinnedAtCart`（「过不去了」「走院子」）、`NierRuns.03`「老总！俺妮儿——！」；`LiuWhereTo` 改成 `LiuMutters`「让他一个人走？……」；`LuoSendsShunzi` 只剩「闭嘴！压到枪眼！」改名 `LuoShutUp`；新加 `LuoSplitsUp` 定计一句；`VillageMouth`（东头跑来、往东指）、`DecideLuo`（改短）改了字或 context。六场重抽（VillageMouth、DecideLuo、LuoSplitsUp、LiuMutters、LuoShutUp、NierRuns），删掉 7 个旧 mp3，`--face` 重烘口型轨（烘焙器退出码 2 还是字表缺字，照 10-22 口径不管）。`LiuMutters` 抽了三次：第 2 次母带失败、第 3 次台词前面多嘟囔了 1.3 s，装回第 1 次（`--pick=LiuMutters:1`）；第 1 次的转写把尾巴上的气声听成了字、标了「疑似念错」，配音引擎自己的逐字时间对得上，待人耳核对。
  - **测试**：PrevizTest 换成新口径（07-4 冒烟在东头、东北角定镜 ≤ 120 m、08-1 东头跑来的村民和那一梭子、08-2 先朝东看、08-3 / 08-4 没人走到大车边、08-4 台词顺序、09-1 顺子先到死胡同尽头妮儿后到、班长那一路不开枪不上主街、10-1 没有大车后头那个兵）；「经过豁口」改成 09-1 或 09-2 两段里经过就算（09-2 那一帧 Escort1 还排在豁口北边）。KeyframesTest、SceneTest 跟着加了班长那一路和豁口的门禁。截图 `_shots/Rev0610_20261024b/`。
- **第十版预演（2026-10-30，用户当天定的第十版剧本）**：用户「硬闯除非运气很好，不然大概率是要被日军打死」「带名字后面要出现的 NPC 最多就是受伤……可以增加一些无名小卒」「没有让你潜行压短」「第一发炮落下来……主角被震飞，然后引出班长要求对话」。24 段、总长 1117.8 s ≈ 18.6 min（第九版 1014 s）。
  - **两路**：刘文财跟顺子走巷子（「文财，你跟到顺儿走巷子」；删「让他一个人走？」「闭嘴」），班长定计改成「枪眼只朝前打，屁股后头是空的……摸到他屁股后头之前，哪个都不准放枪」，坡道上的人「打一阵歇一阵」。
  - **日军人数**：尖兵分队 15 = 老耿家 9（北屋机枪组 3 + 分队长 Leader + 东西两间 Rifle1 / Rifle3；Rifle2 / Rifle4 删了；墙角 2；灶屋 1）+ 搜人 6（街坊家 CellarIja1…4、隔壁院 WA1 `NextDoorIja1/2`）。07-4 末再远一条定镜看东北道尽头一长溜人马带驮炮的骡马（`ColumnIja1…10` + `PackMule1…3`，kind animal；场景边界内只摆得到离眼睛约 205–225 m，不是剧本写的五六百米）。10 东头 `FarIja1…3` 陆续来（代替删掉的 EastIja14/15），10-3 看得见 18 个（活 13 + 街上倒 5）。
  - **谁倒下**（从倒下那帧起每帧 down、位置不变）：日军——09-4 门房 CellarIja4；09-6 灶屋 KitchenIja；09-7 北屋 MgGunner / MgLoader / MgThird / Rifle1（扑倒顺子那个），墙角 CornerIja1 / NextDoorIja1 / CellarIja3；跑掉五个（Leader、Rifle3 翻东间窗洞，CellarIja1 / CellarIja2 / NextDoorIja2 从墙角），10-2 跑在最后的 Rifle3 被石碾后的机枪扫倒；喊来的分队倒 EastIja1 / EastIja2（跳门洞）、ChargeIja1…3（冲路口空地）。剧本、拓扑页快照照这套数改过（北屋倒四个、墙角倒三个，不是早上写的「六七个」）。我方只死没名字的：Squad3（08-3 坡道上被枪眼打死，第一个）、Bearer01 + Walker04（08-3 路沟里）、Escort1（09-7 墙角被临死甩出的手榴弹炸死）、Bearer02（10-3 掷弹筒落胡同口）、Escort2（10-4 石碾边脖子中枪）、Bearer03/04（出村路上）。有名字的人全程不 down（KeyframesTest 钉死）；何有田挨一刺刀（借 `PvLegHitKneelClutch` 蹲捂）、排长 10-4 胳膊中枪、10-6 被幺娃和刘文财架着。
  - **09 照拍子展开**：09-1 死胡同、妮儿拽衣角，「跟到个女娃子走？」「她屋就在那头。」；09-2 三人走巷子，瞥见窖口、隔壁踹门响一枪；09-3 删探头 / 大缸，刘文财在豁口里「隔壁还有」（镜头 25.8 s 转过去对着他），捂嘴是按住键、两只手占着拦不住；09-4 哨子（音效表没有哨声，用 `ijaShoutFar` 顶）→ 了结 → 五个去路口 → 门房剩一个 → 顺子砍偏、扭打、刘文财补刺刀（街坊家南屋是实心块，人蹲在西山墙根门口翻东西）；09-5 刘文财钻狗洞卡住、妮儿钻过去开便门；09-6 灶屋悄悄一刀；09-7 约 65 s 一口气（剧本写约 90 s）：先机枪组、分队长手榴弹满院土、Rifle1 扑倒顺子 / 妮儿咬手腕挪进北屋、墙外两颗手榴弹 + 撞门 + 大刀同时，`EastGateBurst` 从 09-7 起。
  - **10**：10-2 换弹斗说明字停 4 s、担架计数说明字「担架过去了 n / 12」；10-3 一组冲路口空地被扫倒、掷弹筒一发落胡同口、砸两道院门、机枪掉头扫北角院门；10-4 担架 7…12 过完、Escort2 倒在石碾底座、顺子站到石碾西边 (110.2,466.0)（石碾正南 z > 466.75 是东街南墙）；10-5 吹哨全停、静 4.4 s，第一发落石碾东边 (114.5,465.5)：flash / shake / 耳鸣、镜头 0.6 s 往西抛 5 m 落地、黑—白—黑、「枪脱手」，班长蹲到跟前 12.8 s「顺儿！……还能动不？起来！撤——走胡同！」，「按 F 弯腰捡回来」说明字（正片的冲击波 / 枪脱手系统没接进白盒）；10-6 末「顺儿、文财，你两个帮到车！」then stay。
  - **台词与配音**（`Data_EditorBlockoutFirstLevel0610Lines.mjs` 第七版）：新抽 15 场（DitchHit、LuoBeforeHelp、LuoSplitsUp 重写、LuoToRamp、LiuKnows、LiuGirlLeads、ShunziHerHome、NextDoorShout、LiuNextDoor、GatehouseHowl、LeaderBehind、BeiwuLunge、BeiwuBitten、LuoPullsUp、LuoHelpCart），4 场重抽（DitchHit 削波、LiuKnows / LiuGirlLeads 多念一句、LuoToRamp 前两次把提示词念了出来）；删 LiuMutters、LuoShutUp、DoorPeek、KitchenLunge / KitchenBitten / KitchenCheck、LuoShellsIn。口型轨重烘 85 条。
  - **测试**：KeyframesTest / PrevizTest 按新口径重写（人数 15、有名字的不死、死者按帧累加、刘文财那一路、10-5 静 ≥ 2 s / 抛镜 ≥ 2 m / 耳鸣里那句 / 捡枪字）；`Script_EditorBlockoutBrowserTest.mjs` 一条旧断言改站坡道朝东看沟东半截。截图 `_shots/Rev0610_20261030/`（不进仓库）。
  - **还没做的**：远处大队只到二百来米；09-7 没到 90 s；哨子、墙外脚步没有专门的声音（用远处日语吼、低音量落土顶）；门房要真进屋得改场景。
- **第十一版：一路的窗户与 09-2 夹道（2026-10-31）**：用户「白盒里没有把必要的一路上的房子的窗户做出来……不看窗户不知道日军在哪里、不知道蹲下走路的必要性；超级长的一段路……节奏垮掉」。
  - **路线**：`L0610_ROUTE` 删 `glimpse` 段（原来为了在街坊家门口瞥一眼要走到 L4 再折回豁口），窄夹道走到 z 448 就拐进西配房豁口；全程 227 → 182.5 m。门缝视线保留（09-4/09-5 出院门时经过）。
  - **一路两处蹲着过窗**（`L0610_ALLEY_WINDOWS`）：A = WM1 西厢房挪到后墙贴巷子（x 72.25…76.25），后窗 z 412；B = 隔壁院 WY4 东厢房挪到后墙贴窄夹道（x 58…62、z 445.5…452），后窗 z 448；都宽 0.7、窗台 1.2、窗顶 1.8，屋子空心。屋里的人离里墙面约 1 m：蹲着（眼高 1.05）看得见他站起来时的头肩，看不见胸口；站着整个上半身都看得见（SceneTest / KeyframesTest 核）。
  - **隔壁两个**：隔壁院从 WA1 改成 WY4，人数不加（尖兵还是 15）。一个在 A 屋窗下翻木箱（`Chest_A`），一个在 B 屋窗下翻东西、再踹门开那一枪；09-3 两人从 L4 拐进窄夹道往北跑过豁口外，去踹 WA1 的院门；09-4 吹哨后去路口。
  - **预演 09-2**：68.6 s → 34.4 s。刘文财挤到前头，在窗前蹲下、回头压手（PvCrouchPointL）→ 定镜看窗洞，屋里那个站起来 → 蹲着挪过去 → 三次切镜跳过路 → 窄夹道里隔墙听窖口吼、窖里哭 → 窗 B 前又压手 → 屋里人站起、踹门、吼、一枪。眼睛全程蹲着。
  - **开窗**（白盒留洞 + 窗台 / 过梁，`HollowHouse` 支持 `windows: []`，旧 `window` 兼容）：老耿家北屋东间后窗 x 104.3（宽 0.8、窗台 0.9，在塌墙段上随 BarrageHit 一起塌）；北屋南窗两扇 x 96.6 / 103.4（09-6 在院里看得见西间步枪手）；灶屋东窗 z 478（09-6 摸过去之前从窗里看见灶台边那个）；街坊家北屋南窗两扇 x 71.2 / 76.8；街坊家南屋（门房）空心、门朝院子开在西头，09-4 站位没动。地图加 9 个地标。
  - **09-7 翻后窗**：分队长、Rifle3 跑到窗里蹲下、蹲着挪到窗台跟前，过墙那 0.5 m 用切（镜头切开看刘文财 0.9 s），落在窗外正对面墙根再站起来跑；库里没有对得上 0.9 m 窗台的翻越片段（PvClimbOutTrench 撑 1.4 m、VilHandsUpClimbOut 从窖底爬），不用 VilIjaClimbWall（会挂在墙面上方）。
  - **测试**：0610 四个、PrevizPlanTest、ConfigTest、1218 三个、0105 三个、PrevizRuntimeBrowserTest 43/43、BrowserTest 149/149、MapTest 60/60、ModuleGraphTest 全过。1218 借的老耿家体块要那边重烘 scene.json 才带新窗（已告诉 12–18 的会话）。白盒 JSON 带 `?t=` no-store 取，不用抬缓存戳。

## 16. 11–18 新剧本白盒（关卡键 `FirstLevel1218`，2026-10-26 第三版：北沙河村）

口径是集成负责人 10-26 的《FirstLevel1218 白盒第三版契约》（用户 10-26 认的北沙河村这一版）。第一版（10-19 大路往西、排水沟）、第二版（10-23 墙根小路、石板桥、河滩、渡口、浮桥、庄子西南角豁子）都整体作废。照 §13 / §15 的做法另建一片场地：耿家庄村南口 → 土路 → 官道 → 村口反坦克沟上的板桥 → 北沙河村（斜穿的主街、教堂、救护所、女娃家）→ 村西麦地 → 津浦铁路的钢梁桥（过沙河）→ 南头河堤 → 北门。**坐标与 0105 / 0610 同一套**（原点 = 01–05 的沟口，X 东 Z 南）；z < 556 的地面直接调 0610 的 `L0610Ground`（0610 场地以西 x < −60 只叠本关的铁路路基），0610 的体块按中心或南头伸进 z ≥ 470 的带过来（随信号体块取 10-4 全开的样子，静态；第二版不带的村西 / 村南边墙这回照原样带）。游戏里的第一关和 `FirstLevel` / `FirstLevel0105` / `FirstLevel0610` 都不动。

| 文件 | 是什么 | 怎么来 |
| --- | --- | --- |
| `Data_EditorBlockoutFirstLevel1218Space.mjs` | 空间锚点（唯一口径）：场地 x −160…236、z 480…980；土路、官道（沟北 / 主街 / 东南出村三截）、主街坐标 `StreetPoint(s,d)`、村里小街；村口反坦克沟、板桥、杂木、村北沿战壕、铁丝网；北沙河村 20 个院子（老汉家、钻洞的一家）、枕木垛、标语、教堂（顺街斜摆）、救护所（两处洞）、女娃家、驴车停处；树、坟头、田埂；铁路路基与上下路基的土坡、沙河 `RiverAtX(x)`（陡坎、沙床、一股水、两处滑坡道）、铁路桥（四孔钢梁）、桥北土坎、南头河堤与散兵坑、北门；摆件、五个信号、地名、出生点。头注写了史料依据和与契约建议值不一样的地方 | 集成负责人契约；摆不下 / 视线不成立才改 |
| `Script_EditorBlockoutFirstLevel1218Scene.mjs` → `Blockout/FirstLevel1218.scene.json` | 0.5 m 高度网格（792×1000）+ 约 1090 个体块 + 66 个随信号体块 + 地面涂色（`paint`：麦地、村子、路、沙床、那一股水、路基）+ 50 个地标 + `colorSemantics` / `semanticColors`（屋顶、杂木、教堂、标语、钢梁、枕木在白盒画质里留颜色） | `node Taierzhuang1938/Script_EditorBlockoutCli.mjs scene FirstLevel1218 --force` |
| `Script_EditorBlockoutFirstLevel1218Keyframes.mjs` → `Blockout/FirstLevel1218.json` | 33 个关键帧（11-1…18-8；`stageLabel` 15A / 15B / 15C、18A / 18B / 18C / 18夜），约 900 个单位位次 | `... export FirstLevel1218 --force`（**会覆盖手改**） |
| `Data_EditorBlockoutFirstLevel1218Lines.mjs` + `Script_EditorBlockoutFirstLevel1218Voice.mjs` → `Blockout/FirstLevel1218.voice.json`、`Audio/Blockout1218/` | 占位配音（第三版 23 场，台词照契约原字；字没变的 8 场沿用第二版录音，其余整场重新生成，删掉的场连 mp3 一起清掉） | `node Taierzhuang1938/Script_EditorBlockoutFirstLevel1218Voice.mjs [--face]` |
| `Script_EditorBlockoutFirstLevel1218Previz.mjs` → `Blockout/FirstLevel1218.previz.json` | 33 段预演（一帧一段，切镜为主） | `node Taierzhuang1938/Script_EditorBlockoutFirstLevel1218Previz.mjs --force` |
| `Script_EditorBlockoutFirstLevel1218SceneTest.mjs` / `...KeyframesTest.mjs` | 纯 node 门禁（见下） | `node Taierzhuang1938/Script_EditorBlockoutFirstLevel1218SceneTest.mjs` 等 |

地理上的几条定论（史料：北沙河村在沙河北岸，津浦铁路在村西约一公里南北走，老官道从西北往东南斜穿村子；七二七团在村外挖战壕、架铁丝网，村口官道用反坦克沟截断、堆杂木；村民家家挖洞、墙上刷抗日标语、有人躲进村里的德国教堂；北沙河以北的铁路 2 月被拆、枕木让老乡拿去当柴；3 月 14 日 17 时令七二七团回城、炸铁路桥。沙河水情、教堂位置、救护所借的院子、女娃家、老汉门口、桥北土坎是创作）：
- 村南口 (117,545) 出来一条 3 m 土路往南 58 m，在 (106,602) 接上从场地东边偏北 (236,568) 斜下来的 4 m 官道；官道到村口沟前拐成往南，过板桥进村就是西北 → 东南的主街（直段 (100,641) → (198,740)），从村东南角出去顺沙河北岸往东南。
- 村口反坦克沟 x 82…112、z 631…635：顶宽 4、底宽 2.4、沟底 −2.5（深 2.8）、四壁陡；沟南沿堆杂木（板桥口子留 3.8 m）。板桥是三块门板（x 95.7…98.3、z 630.5…635.5、面顶 0.2 与两头路面齐平），**桥板正下方垫一道土墩（顶 −0.75）**：演员只能站在比高度场高 ≤ 1 m 的块顶上，不垫站不上去。村北沿战壕（壕底 −0.9、北沿堆土）西段 x 52…83、东段 x 111…204，两头接进沟的两端（村北沿每条南北线都被沟或壕切断）；铁丝网在壕外 z 627。
- 主街两边的院子轴对齐、坐北朝南，跟着斜街排成锯齿，院门开在朝街那面；教堂顺着街斜摆（院门朝街敞着，礼拜堂 6.2 m、钟楼 10.5 m），正对西头的街口 (146.6,688)。救护所 x 58…92、z 666…700（东墙院门 z 690.5；正房、灶屋实心，厢房 x 58.5…66.5 空心、东墙门洞带 0.15 门槛；院里两处洞：洞口 + 坡道 3 m + 洞内一小间，洞底 −1.7、洞顶 0.3 厚、净高 1.7，东边那处洞顶留一条 0.3 m 的缝）。女娃家在救护所南边，两院共用的那道墙 x 66…85 塌成 0.6 高的墙根 + 土堆。驴车停在院门外那块空地 (97.4,686.6)。
- 村西口 (56,721.5) 往西南一条 2 m 田间小路穿过麦地，到铁路桥北头东坡的土坡（z 755）上路基。铁路路基 x −104、顶 2.6（高 2.3、顶宽 5），**北段只有光路基**、桥南有轨有枕木；桥南头东坡另一处土坡（z 822，在河堤南边）下到南岸路，南岸路顺路基东边到北门（城墙 z 950、门洞 x −88）。
- 沙河东西走，北坎顶 z ≈ 763、南坎顶 ≈ 807（铁路一带拉直，别处随 x 有一点弯）：陡坎 3 m（2 m 内落完）、河床沙面 −2.7、中间一股水宽 7、深 0.4（水块，河汊子材质照 §6.3 自动铺）；北岸 x −82 / 南岸 x −78 两处滑坡道。铁路桥四孔（每孔 11 m）：两头石桥台、三座石墩、每孔两根钢梁、枕木 0.24 宽每 0.6 m 一根（顶 2.55）、两根轨，无栏杆。
- 桥北土坎 x −92…−68、z 730（顶 1.3，比麦地高 1 m），**坎背后挖低 0.3 一溜**：蹲着的人才藏得住北边 40 m 外的机枪（坟头旁、路基东脚 (−97.2,695)）；离开土坎往桥头跑就在它枪口下；南头河堤顶（z 813、1.8）上路基东边 10 m 趴着的人从土坎西头与路基之间的空当看得见它（118 m）。
- 河汊子（0610 的直段，中线 34.5）在接缝以南收住（z 574 起渐浅、582 平），不往南伸。北门照旧压近（南岸往南约 143 m）。

随信号体块：

| 信号 | 意思 | 从哪个关键帧起 |
| --- | --- | --- |
| `FamilyHidden` | 钻洞的那一家拿席子盖住洞口（席子出现） | 12-6 |
| `CartOverturned` | 救护所院门口，拴在车辕里的黑子挨了一梭，连车带驴翻在地上（翻倒的车 + 车轮出现；立着的车 `GengCart` 从这一帧起不再摆，黑子倒地） | 14-3 |
| `GirlHoleCovered` | 女娃她娘把席子拉上、盖住洞口 | 18-2 |
| `ChargesSet` | 北头两座桥墩上的炸药、引线顺着桥拉到南头河堤后 | 18-4 |
| `BridgeBlown` | 北头两孔的钢梁、枕木、轨没了，断梁和散落的枕木砸在河床上 | 18-6 |

人怎么表现：百姓一律程序化身体（`body: "procedural"`：老汉、钻洞的一家、教堂里的百姓、女娃和她娘、蹚水的老乡、北门的百姓）；老耿、妮儿平时也是程序化身体，只有 14-4 / 14-5 / 14-6 妮儿、14-6 老耿（拖被子 `PvBlanketDragL/R`）、15-1 老耿（跪着按毛巾）、15-3 妮儿（蹲着画驴）、17-1 老耿（跪着拉单被盖脸）是骨骼身体。七二七团的兵（哨兵、连长、机枪、医官、工兵、军官）是 NRA 骨骼身体，用名字区分。冬瓜 11-1…12-6 躺在车板上的竹竿担架上（`ride` 挂在 `GengCart` 上），12-7 起连单被搁在救护所墙根（`BlanketDonggua`，布料模拟），18 起留在厢房里不再摆。九四式用 0105 那套占位（`kind: "tank"`、`shape: "tankette"`）。

**铁路桥桥面站人（2026-10-26 第二轮）**：枕木顶比河床高 5.25 m，原来 `BlockStandSampler` 只认比高度场高 ≤ 1 m 的块顶，演员站不上去。现在每孔加一条看不见的 `standOn` 走道（§2.2 / §5.6），关键帧与预演里桥上的人都站在枕木顶上（18-3 担架、兵、老耿妮儿走桥面；18-5 班长他们跑过桥）；摆位检查对桥上不再豁免（`OnRailBridge` 只用来让路网把桥面和底下的河床分开），KeyframesTest 查桥上的人脚下是枕木顶。炸断的两孔上走道还在，见 §5.6 的注意。板桥照旧用垫土墩（顶比高度场高不到 1 m）。

门禁（纯 node）：`Script_EditorBlockoutFirstLevel1218SceneTest.mjs` 钉住契约「必须成立」七条——①村南口 → 土路 → 官道 → 板桥 → 主街 → 救护所院门这条路连续、每 0.5 m 落差 ≤ 0.12、横向 ±1.25 m 高差 ≤ 0.2、离中线 1.25 m 内没有挡路的块，与 0610 接缝（z 556±1、x −20…236）差 0；②沟里站着看不到两边沟沿外、沟壁陡（1 m 内落 ≥ 2 m）、村北沿 x 53…203 每条南北线都被沟或壕切断（板桥那条除外）；③沟口东段战壕底站着看得见两辆车和两座坟头，车在沟北沿外；④救护所院门 → 村西口 → 田间小路 → 土坡 → 桥北头走得通、枕木从北桥头铺到南桥头（缝 0.2…0.42 m）、北段没轨桥南有轨；⑤沙河两岸陡、沙床 −2.7、那一股水宽 7 深 0.4，北岸滑坡道 → 河床 → 南岸滑坡道走得通；⑥机枪看不见土坎后蹲着的人、看得见离开土坎的人，南头河堤上看得见机枪；⑦没有第二版的块（石板桥、渡口、浮桥、接收院、豁子、旧北门）、旧北堤 / 南堤 / 北沙河 / 低洼的地形，河汊子在沟尾收住。另查生成两次逐字相同、过 `ValidateBlockoutScene`、地标齐且在场地里、涂色、救护所（院门、厢房门与门槛、两处洞能钻进去、墙根到洞口十几步中间无挡）、女娃家塌墙（墙根越过塌墙看得见她家洞口）、教堂比民房高且院门朝街、北门、五个信号。`Script_EditorBlockoutFirstLevel1218KeyframesTest.mjs` 钉住：生成可复现、校验 0 错 0 警告、摆位 / 走位问题 0、33 帧齐全、信号按拍起、台词照契约原字、没有旧戏的词、百姓身体与例外帧、车 / 黑子 / 冬瓜每帧在哪、13 两辆九四式在沟北、14 拖被子一路往洞口、18 桥面上有人且脚下是枕木顶、所有人脚下在地面（或桥面）上、关键视线（村南口看得见村口、战壕看得见车、妮儿越过塌墙看得见女娃、14-5 看得见妮儿和冬瓜、刘文财在院门口看得见、河堤上看得见机枪、机枪看不见坎后的班长、河堤上看得见北岸的鬼子）。

**第二轮（预演 + 台词 + 配音，2026-10-26）**：
- 台词表 `Data_EditorBlockoutFirstLevel1218Lines.mjs`：23 场，一场挂一个关键帧，字照契约第一节原字（喊话、哼声之外不另编带信息的句子）。沿用第二版录音的 8 场：`AlmostThere`（12-1）、`LookBack`（12-2）、`BalkingMule`（12-4）、`PlanesWarning`（13-3）、`BringHim`（14-4）、`Threshold`（16-1，「军医」改「医官」）、`KeepMoving`（18-7）、`NorthGate`（18-8，第三句「有地方歇脚！跟我来！」标 `cut`）；新场 15 个：`RetreatOrder`、`DitchSentry`、`BackSoon`、`OldMan`、`AidArrive`、`GoSeeDonggua`、`InTheHole`、`XiangDoorQueue`、`NoMore`、`WhatHappened`、`Orders727`、`GoNow`、`HoldOn`、`ComeOver`（「快过来」这回是顺子喊）、`LightIt`。借嗓子：七二七团哨兵 / 喊飞机的 → shouter，连长 / 守门的兵 → guard，老汉 → peasant，医官 / 门里有人 → bearer，七二七团军官 → zhou。
- 预演 `Script_EditorBlockoutFirstLevel1218Previz.mjs`：33 段一帧一段、镜头以定镜为主（走着的眼睛按路网拆成几段定镜，`Walker`）；车沿 `CART_LINE` 走（`CartOn` 从 Keyframes 导出）；13-1 两辆九四式顺官道开到沟沿外、车上机枪（muzzle 点在车上，`h` 1.6）扫我们这边的沟沿；13-3 末信号弹（`flare` SignalRed）、飞机进场、「飞机！趴倒！」；14-1 顺战壕扫 + 沟口小炸弹 + 掉头扫街；14-2 顺子跑到救护所门前，飞机顺西头的街扫过来，黑子挨一梭、`CartOverturned`（黑子 14 倒地）；14-5 松手 `slowmo` + 被子 `dragSolo`；14-6 老耿接角拖进洞；18-2 洞口席子（`GirlHoleCovered` 先关后开）；18-3 走桥面、老乡顺滑坡道下河床蹚水；18-6「点！」后 `BridgeBlown`；18-8 黑场 + 日期字幕、`then: stay`。
- 门禁：`Script_EditorBlockoutFirstLevel1218PrevizTest.mjs`（通用几条照旧；水只算沙河中间那股水，蹚水的 `Wader*` 例外；演员位置按 `path` 折线插值）+ 第三版剧本口径（33 段、台词按序、片段、飞机与扫射段、松手、桥面上的人脚下是枕木顶、断孔上没人、不用删掉的台词和旧地名）。浏览器：`EditorBlockoutBlanketClothBrowserTest` 第 7 组改查 14-5 的 `dragSolo`，`FlareEffectsBrowserTest` 白盒那段改查 13-3。

## 17. 试玩（2026-10-31）

用户 10-31：「有没有一个编辑器，比现在的白盒预演更进一步，能直接分段进行正式一点的白盒游玩 + 战斗」——当时没有：编辑器里的敌我是演员（不进 AI、不吃子弹），能真打的只有旧剧本 P012 正式关加 `missionStage` 跳关。商量后定：不另做编辑器，在白盒编辑器里加一个「试玩」开关（同 Unity 的 Play），读同一份关卡文件、同一批关键帧；用户：「功能加上，把 01-05 做出来 play 感受一下」。

### 17.1 怎么用

- 卡片右上「试玩」按钮（准星图标）或 `K`：打开设置面板——段落预设（来自试玩编排的 `ranges`，外加「从这一帧打到底」）、起点 / 终点两个下拉、三个开关「无敌 / 无限子弹 / 播过场」、「开打」（面板开着再按 `K` 也是开打）。`K` 不在游戏键位表里、不撞编辑器已有的键（浏览器门禁钉着）。
- 开打：玩家按本关携行重新领一遍装备、回满血，摆到第一步的机位；**不再无敌、子弹有数**（面板开关可改；宿主读 `blockout.PlayOverrides()`，只改本会话那一份调试选项，不写存档）。
- 试玩中顶部一条（右上工具条下面，不压关卡下拉）：第几步 / 站位名 / 目标（走过去时写距离、撑时间时写剩几秒）/ 敌几个 / 用时 / 「结束」。`K` 中止。导航栏、翻关键帧、重播、地图点选、预演键（看戏步里除外）、飞行观察都不理；外部改了配置等回到编辑后再同步。3D 标记里日军不再有地环（他们是真人了），友军、地标照旧；要点与站位标记收起，「下一步」光柱改指当前目标。
- 打完 / 阵亡 / 中止：放出来的兵（含尸体）全撤，无敌与无限子弹还回去，出小结——用时、打死几个、掉多少血、走到第几步，每一步一行（拍号、名字、打 / 走 / 看、用时、结果）。「再来一遍」（`K`）、「从这一步重来」（失败或中止那一步起）、「回到编辑」（`Esc`，摆回那一步的关键帧）。阵亡时玩家马上换回活人并摆回那一步的机位（宿主的阵亡卡计时撤掉，不会几秒后被送回关卡出生点）。

### 17.2 试玩编排（`Blockout/<Level>.play.json`，可选）

与关键帧配置分开放：关键帧 JSON 由生成器重导会覆盖手改，试玩编排单独一份不会被冲掉；agent 直接改它。这一关第一次打开试玩面板（或开打）时才读，之后开着的编辑器 2 s 内读到改动（试玩中改的下一次开打生效）。进关时不读：大多数关卡没有这份文件，浏览器会把 404 记成控制台错误，别的浏览器门禁的「全程没有未捕获错误」会因此红（10-31 实测 `EditorBlockoutBrowserTest` / `FlyBrowserTest` 就是这么红的）。没有这份文件就全按关键帧推断。格式与每个字段的意思写在 `Script_EditorBlockoutPlayPlan.mjs` 文件头，这里只列要点：

- 一步 = 一个关键帧。`mode`：`fight`（这一帧的日军换成真 AI；先走到这一帧的玩家站位，到了才放兵）/ `move`（走到目标点）/ `watch`（有预演就播，`N` / `Esc` 跳过；关了「播过场」就停 `watchS` 秒）/ `skip`。不写：有能变 AI 的日军 → fight，否则 next 有坐标 → move，否则 watch。
- 过关 `clear`（满足任一条）：`kill: "all" | n`、`reach: true | {x, z, r}`（true = 关键帧 next 的坐标，没有就下一帧的玩家站位）、`time: 秒`。fight 不写 = 打光；一个能打的人都没有（前面都打死了）就直接过，不卡。
- 谁变 AI：日军、`kind` 是 soldier / officer、没倒地、`role` 不是掷弹筒手 / 掷弹筒副手 / 翻译、不在 `keep` 里；一步最多 28 个。战车、担架、友军、百姓、倒地的照旧是演员（友军不开枪、不挡子弹）。机枪手给十一式，其余三八式；`role: bayonet` 或步上写 `bayonet: true` 的上刺刀。
- `push`（单位 id 或 group）：往玩家那边压（AI `order: advance`，先朝玩家去 6 s，之后班组自己追）；其余守在关键帧摆的位置（`order: hold`，守点半径 `holdM`，缺省 2.5 m）。同一个人跨步还活着就留着、挪守点；这一步没有他、或这一步是看戏 → 撤场；打死的人后面的步不再出现，`fresh: true` 的步例外（同一批追兵每到一处都重新来一波）。
- `alert`（缺省开）：放兵 0.6 s 后、之后每 4 s 走 AI 自己的听觉入口报一声「玩家在这儿开了一枪」（传 600 m）。实测：远处守点的机枪光靠眼睛看不见蹲在坑里的人，听来的觉察十来秒就消退，玩家自己的枪声只传 150 m，不报的话 03 坑外的跃进组和东边机枪一直是「没察觉」。偷着摸进去的段落写 `false`。
- `mortar: { from: [演员 id], everyS, firstS, spreadM, flightS }`：掷弹筒（演员）往玩家身边打 `Combat.FireShell`（八九式的伤害与半径，有出膛声、啸声，落地走 `Combat.Blast`，敌我都炸）。
- `objective`：顶部那条的目标字（缺省关键帧 next 的字）。`approach: false`：不先走到站位。`ranges`：面板上的段落预设。`defaults`：三个开关的缺省。

### 17.3 实现与坑

- 模块：`Script_EditorBlockoutPlayPlan.mjs`（纯，零 three：校验、归一化、`PlayStepPlan` 一步怎么打、`PlayStepCleared` 过关判断、`PlayRange`）+ `Script_EditorBlockoutPlay.mjs`（运行时与界面：放兵 / 收兵、每帧记账、掷弹筒、面板 / 顶条 / 小结）。总控 `Script_EditorBlockout` 只接：摆演员前过 `PuppetUnits`（变成 AI 的人、打死的人摘掉，过渡两头都摘）、`Busy()` 闸导航、`K` 键、轮询时顺手查编排、`PlayOverrides()`。`Script_Main` 只加两处判断（`ApplyDebugOptions` 的无敌、`EffectiveInfiniteAmmo`）和宿主两个口（`ResetPlayer`：撤掉换人计时与阵亡卡再 `RespawnPlayer`；`ApplyDebugOptions`）。
- **放兵会被挤到沟沿上**：`AiDirector.Spawn` 用站立胶囊（半径 0.34、高 1.78）`FindFreeSpot`，窄沟的斜壁被当成「站不下」，一圈圈往外挪（实测 02-4 的追兵一放出来就站在沟沿上，y 0～1.2，沟底 −2.3）。放兵后照编辑器摆玩家的口径（半径 0.2、高 1.2 的探针，膝盖以上真埋进墙才 0.1 m 一圈往外挪，`NudgeFree`）挪回原位。挪回去之后 AI 在沟里走得好好的：沟沿那圈隐形墙（§13）挡所有角色控制器，导航网格也把它们当墙。
- 宿主的阵亡卡（`REINFORCE.deathCardSeconds`）比小结（2.6 s）先到点，`Finish` 时人已经被宿主换到关卡出生点了：所以按结果（`dead`）摆机位，不按此刻活没活。
- 开打那一声报得太早没用：刚放出来的人感知在第一次想事时才挂上，同一帧报的记不住（所以延 0.6 s）。

### 17.4 01–05 的编排（`Blockout/FirstLevel0105.play.json`）

| 段 | 怎么打 |
| --- | --- |
| 01-1…02-3 | 看戏（7 段预演，约 4.8 min，`N` 跳） |
| 02-4 / 02-5 / 02-6 | 打：三个追兵顺着支沟压过来（`push` pursuers），打光过；02-5、02-6 `fresh`（每到一处来一波） |
| 02-7 | 走：翻坡顶、下干沟（到 next 坐标） |
| 02末-1 / 02末-2 | 看戏 |
| 03-1 | 走：逆着人流挤到沟口机枪坑（约 150 m） |
| 03-2 | 看戏（进坑挨一发掷弹筒） |
| 03-3 | 打：23 个 AI——两挺机枪 + 副手守点，四组跃进、干水沟包抄班、东头清沟三人往坑里压；掷弹筒每 11 s 一发；撑 90 s 过 |
| 03-4 | 打：同一批人接着打（没在这一帧里的撤场），掷弹筒 9 s 一发，撑 30 s |
| 03-5 | 打：边挨打边去捡坑沿外那捆手榴弹（到点过） |
| 04-1 / 04-2 | 打：拐角 1 回身顶、拐角 2 近战（上刺刀），`fresh`，打光过 |
| 04-3 | 打：前面没打死的两个追着，退到路口（到点过），战车和远处护车步兵是演员 |
| 05-1…05-3 | 看戏（桥下、压桥、炸车尾） |
| 05-4 | 打：坡顶两个鬼子架枪，顺干沟往东走（到点过） |

实测（2026-10-31，内置浏览器 1280×760、small）：03-3 开打 10 s 后 23 人里 21 个进入交战、15 个在开火，跃进组 16 s 压近到 80–100 m；23 个 AI 时约 53 fps。02-4 不开无敌、站着不还手 38 s 被打死（真玩会还手；难度没调过）。03-1 → 05-4 十二步用脚本走一遍（摆到目标、打死、跳过场）全部按顺序过、收场后场上 0 个兵。

### 17.5 没做的

- 友军还是演员：不开枪、不挡子弹，日军只打玩家。
- 炸战车（05-3）、拖被子（02-3…02-7）、捡枪这些交互没做成玩法，05-3 是看戏。
- 难度没调：AI 的命中、人数、撑多少秒都是第一版，要用户打过再说。
- 06–10、12–18 还没写试玩编排（不写也能打：按推断，fight 步打光过、move 步到 next 过）。
