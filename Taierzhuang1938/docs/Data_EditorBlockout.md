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
- **菜单入口（用户 2026-10-13 追加）**：高级工具（同日另一轮已改成顶部菜单栏 + Inspector）的「关卡」菜单第一项「白盒关卡编辑器」（照 `TextureEditor` 的写法：一个只带静态 `id = "blockout"` / `label` / `hint` / `Open()` 的小类，放在 `Script_EditorBlockoutEntry.mjs`，`Script_Editor.mjs` 把它放进 `TOOL_MENUS` 的「关卡」并在 `Toggle` / `Open` 里按 id 特判）。`Open()` 跳到 `?editor=blockout&level=FirstLevel`（保留当前 `quality` / `scale` / `audio` 参数，去掉 `whitebox` / `missionStage` / `phase` 等关卡参数）。已经在编辑器模式里时，这个按钮显示为当前项，点了不重载。菜单栏条目数因此 +1：`Script_EditorTest` 的 19 → 20。轻量菜单（`Script_MenuStartup`）里的「高级工具」本来就跳到带编辑器面板的完整页面，不另加入口。
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
- **2026-10-18 可选 `gates`**：与 `blocks` 同字段，再带 `signal`（信号到了就消失）或 `appearSignal`（信号到了才出现），id 与 `blocks` 一起全关唯一。`LayoutFromSceneDoc` 把它们原样交给 `FirstLevelWhiteboxField` 的 gate（与第一关的门同一套 `SyncScenario` / `RestoreScenario`），并给布局 `hideOpenGates: true`：文件场景里「打开」的 gate 是塌掉 / 炸掉的东西，直接隐藏，不走第一关「白门升起 1.2 m」的老画法。关键帧的 `signals` 决定此刻哪些信号为真（§5.4）。
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
| `arc` | 可选射界 `{ halfDeg, rangeM, yawDeg? }`（中心缺省 = 朝向）；缺省时只有机枪手（Type11/Type92Hmg/Zb26）和战车按 §5.3 默认画 |
| `path` | 可选：从**上一关键帧**的位置走到这里的折线（不含起点，可含终点）；没有则直线 |
| `intent` | 可选：此刻「即将去」的折线，画成虚线箭头；没有且下一关键帧里这个人换了位置，则自动取下一关键帧的 `path`/直线 |
| `speedMps` | 可选过渡速度；缺省 ija 2.8、nra 2.4、civ 1.6、litter 1.2、tank 2.0 |
| `guess` | 可选 `true`：位置是推测的（游戏数据里没写），界面上用虚线圈 + 「?」 |
| `bearers` | 只对 `kind: "litter"`：抬担架的人数 0–2（缺省 2）；`0` = 担架放在地上 / 床边、没人抬；`1` = 只画前面一个抬担架的人（后头由玩家或别的单位抬着，或搁在地上）。担架的 `state: "down"` 只表示抬担架的人倒了 |

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
```

## 4. 界面（`Script_EditorBlockoutUi.mjs` + `Style_EditorBlockout.css`）

原则：只放有用的东西；外观与高级工具（`Style_Editor.css` 的 `#edRoot --ed-*`）同一套，即启动界面设置页的视觉语言（半透明暗色渐变底、象牙白文字、橄榄灰细线、左侧金边 + 渐变选中条、宽字距、衬线标题、金色填充细轨 + 竖条游标、直角，2026-10-14 同步），数字用等宽 `--ui-mono`；不用 ◀▶▲▼✕ 这类字体里没有的字符，一律画 SVG / CSS 形状；中文按现有编辑器口径可回落系统字体。

| 位置 | 内容 |
| --- | --- |
| 左上 · 关键帧卡片（宽约 380 px） | 第 1 行：金色阶段号「03」+ 阶段标题 + 灰色「· 站位名」；右上两个小按钮「复制当前位置」（§4.2）与「记下当前机位」（§7）。第 2 行「此时」+ `what`。第 3 行「下一步」+ 指向目标的小箭头（随视角转，正前方朝上）+ `next.text` + 距离「52 m」。可选第 4 行：`how` 小标签；`notes` 一行弱显示；有 `guess` 单位时一行「n 个位置是推测的」。右上角一个小按钮「记下当前机位」（§7）。 |
| 右上 · 关卡与图层（齿轮按钮左侧） | 关卡下拉（显示当前关卡名 + 下拉箭头）；4 个图标开关：射界 / 去向 / 标签 / 穿墙显示；配置状态小点（绿 = 已载入，蓝闪 = 检测到外部修改已同步，红 = 配置有错，悬停看原因）。 |
| 左下 · 小地图（220×220 CSS px，按 DPR 出图） | 北朝上、跟随玩家；纸面风格；角落小字「M 展开」。 |
| 底部居中 · 导航栏（宽 min(1140 px, 64vw)，全关总图打开时仍在最上层可点） | 左右两个箭头按钮 + 一个重播按钮（当前是第一个关键帧时置灰）；中间轨道按阶段分段（段宽按该阶段关键帧数），段下方小字阶段号 01…18；每个关键帧一个刻度，当前关键帧金色滑块；悬停刻度弹出「03 · 观察射台」；点击跳转、拖动松手跳转；右侧计数「03 · 2/3」；最右一行极小的按键提示「, . 切换　M 地图　Esc 鼠标」。 |
| 全关总图（M 打开，图框铺满导航栏以上；半透明遮罩盖满整屏，导航栏浮在遮罩上） | 纸面大图，**开着时鼠标只归地图**（游戏不转头、不开枪、不抢锁、滚轮不换枪；点遮罩空处关图），**打开时以玩家为中心**（默认约 220 m 见方；用户缩放过就记住那个比例），跳关键帧时跟到新位置；滚轮以光标为中心缩放、拖动平移、双击回到全图；每个关键帧是带阶段号的小点，点之间连一条虚线路线；点击关键帧点直接跳转（图保持打开）；当前关键帧的单位、射界、去向、POI 全画；右上一个关闭按钮，M / Esc 关闭。 |
| 中上 · 提示条 | 短暂提示（「已载入」「配置已在外部修改，已同步」「机位已保存」「配置有 2 处错误」），2.5 s 淡出。 |

- 游戏 HUD：编辑器模式给 `body` 加 `blockoutMode` 类，隐藏任务字、简报卡、字幕、旧小地图、人数池等；保留准星、弹药、受伤反馈。
- 指针锁：锁定时编辑器界面可见但不可点（`pointer-events:none`）；Esc 解锁后可点；点 3D 画面重新锁定（现有逻辑）。窗口不给锁（Claude 桌面应用的内置浏览器面板会报 `SecurityError` / `WrongDocumentError`「root document … not valid for pointer lock」）时，`Script_Main` 改成**按住右键拖动转视角**、左键照常开枪，提示一次 `hud.hint.dragLook`；正常浏览器不受影响。编辑器 DOM 上的 `mousedown`/`wheel`/`keydown` 必须 `stopPropagation`，否则会触发抢锁、滚轮换枪。
- 按键（锁定 / 未锁定都有效）：`.` 下一个（带过渡动画）、`,` 上一个（直接到位）、`M` 全关总图（替代原 M 小地图）、`Y` 重播进入当前关键帧的过渡、`P` 复制当前位置（§4.2）、`N` 播 / 中断当前关键帧的预演（§14，2026-10-18；`V` 是近战键）。不得占用 `KEYMAP` 已绑的键。

```js
export class BlockoutUi {
  constructor(root, handlers) // handlers: { onPrev, onNext, onSeek(index), onLevel(key), onLayer(name, on), onSavePose(), onReplay(), onOpenMap(), onCloseMap(), onMapPick(index) }
  SetLevels(levels /*[{key,label}]*/, currentKey)
  SetKeyframes(list /*[{id,stage,stageTitle,name}]*/, index)
  SetCard({ stage, stageTitle, name, what, next: { text, distanceM, relYawDeg } | null, how, notes, guessCount })
  SetLayers({ arcs, intents, labels, xray })
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
- 标记：敌 = 红三角（尖指朝向）、友 = 蓝圆点 + 朝向短线、百姓 = 绿点、战车 = 红色旋转矩形、担架 / 车 = 蓝色小矩形；射界 = 半透明扇形（同阵营色）；去向 = 虚线箭头；POI = 金色菱形；下一步目标 = 金色圆环；玩家 = 金色箭头 + 视锥；推测位置 = 虚线圈。
- 静态层（地面 + 块）每关只烘一次，分块在空闲帧里做，切关缓存；小地图每次刷新 = 一次 `drawImage` + 动态标记，5–10 Hz。
- 全关总图在放大到 ≥ 4 px/m 时块改用矢量重画，不糊。
- 只在全关总图的 canvas 元素上挂鼠标监听，**不得往 window 挂监听**。

```js
export class BlockoutMap {
  constructor()
  SetScene({ levelKey, bounds, blocks /*[{x,z,w,d,h,ry,semantic,solid}]*/, sampleHeight /*(x,z)=>y*/, naturalHeight /*可选*/, ways /*可选 {roads, trenches}*/ })
  Bake()                                   // → Promise，空闲分块烘静态层
  SetKeyframes(list /*[{id,stage,player:{x,z}}]*/, index)
  SetDynamic({ player: {x,z,yawDeg}, units, pois, next })
  SetLayers({ arcs, intents, labels })
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
- **看得见 / 被挡住两种画法**：同一组几何画两遍，一遍做深度测试（亮），一遍不做（暗、半透明）。被墙挡住的人也能找到，但一眼分得出「现在看不看得见他」。图层开关「穿墙显示」关掉第二遍。
- 头顶 DOM 标签池：有名字的显示「色点 + 名字」，无名普通兵只显示色点三角；120 m 外只保留有名字的与机枪；按近到远避让；下一步目标在屏幕外时贴边显示箭头 + 「下一步 · 文字 · 距离」。标签挂在单位的世界位置上（不挂 `actor.root` 子节点）。

```js
export class BlockoutMarkers {
  constructor({ post, camera, groundAt, labelRoot })
  SetUnits(units /*现场位置 + 数据：id,side,kind,name,x,z,yawDeg,arc,intent,guess,visible*/)
  SetPois(pois); SetNext(next /*{x,z,text}|null*/); SetLayers({ arcs, intents, labels, xray });
  Update(dt)   // 投影 DOM 标签；移动中的单位每帧重建它那几段几何，静止的不动
  Dispose()
}
```

### 5.6 演员（`Script_EditorBlockoutPuppets.mjs`）

- 独立演员：`host.actorFactory.Create(kind, { seed, weapon, modelVariant })`，挂在编辑器自己的 `Group` 下；**不进 `ai.soldiers`**（不被子弹打中、不挡人，这是有意的：这里只看布设）。
- 每帧 `actor.Update(dt, { moveSpeed: mps/3.6, moveSpeedMps: mps, locomotionTracked: true, aim, crouch, prone, grounded: true, ... })`；IJA 慢走装 `SetRelaxedGait(p, "alert")`，NRA 装 `InstallAllyGait(p)`（接受假 soldier 对象，实现时核对）。
- `kind`：`officer` → `ijaOfficer`/`nraOfficer`；`civilian`/`child` → `civilian`（child 缩放 0.62，若安全）；`tank` → 简单体块车身 5.75×2.18×1.9 + 炮塔块；`litter` → 担架块 2.1×0.7 + 前后两名抬担架的 NRA 演员；`cart` → 车块 + 可选 `animal` 块。
- `state: "down"`：倒地姿态（用现有 `dead`/`prone` 状态，实现时选能用的）。2026-10-18：倒地的人放在身体周围 0.9 m 内**最低**的地面上（不再悬在土埂斜坡上方；陡沟壁上仍会斜躺，数据里把倒地位置放到沟底）。
- 2026-10-18：演员脚下的地面 = max(高度场, 点落在其脚印内、顶面比高度场高不超过 1.0 m 的实心块顶面)（`Script_EditorBlockoutPrevizPlan.BlockStandSampler`，总控 `standAt`；脚印按 `ry` 旋转判，gates 只算此刻在场的，水 / 空气墙不算）：机枪坑射击台、台阶上的人站在台上，洞顶、胸墙这种高块不算。关键帧摆人、预演的 eye 镜头与锚点、倒地、战车、3D 标记都用它；俯视图、地形上色、水面仍按纯高度场。战车按车身脚印上中心、四角、四边中点 9 处取**最高**的地面放（`TankGroundY`），压过沟时停在沟沿上而不是掉进沟底；蹲、卧的人一律按戒备姿态（原生 `KneelHold` / `CrouchIdle`），不被友军步态换成扛枪半蹲；有 `castId` 的单位用定妆身体（`SpeakingCastOptions`），按需下载的身体（如翻译 NRA06）先下完再造人（`PrepareCasts`），翻译不拿枪。
- 2026-10-18（第二轮）：
  - **倒地的人移动只平移**：`state: "down"` 的人在关键帧过渡和预演里换位置时 `moveSpeed` 记 0、`dead` 照旧（原来一「走动」就不算倒地、会站起来走），姿态保持躺着，位置平滑滑过去（拖被子、抬担架）。
  - **`lie: "along"`**（单位或预演键）：倒地姿态是按种子抽的死亡片段，头朝哪边不固定。人倒下落定后（造出来就直接落定）量一次头相对骨盆在人物本地的方向，以后每帧把整个人转到「头朝 `yawDeg` 的前方」、骨盆放在单位位置上；在播片段时不转（片段自己定姿势）。不写 `lie` 的照旧。
  - **武器**：预演键 `weapon`（阶跃）调 `actor.SetWeapon(id)` 换手里的家伙（`null` = 空手），没写过 = 造人时 / 关键帧那把，交还驱动时换回去。关键帧之间同一个人武器变了：两把都不是空手就地 `SetWeapon`，不再整个重造（空手 ↔ 拿武器要换步态，照旧重造）。
  - **大刀戒备**：手里是近战家伙（`weaponData.kind === "melee"`，如 `Dadao`）、站着不动、没播片段、不在抬担架时，给 `actor.Update` 带 `meleeCombat: { weapon, state: "idle", action: "Guard", clip: "DadaoGuard", … }`、`aim: 0`（同开场导演的 `meleeGuard`），不再端着大刀摆步枪据枪。
  - `Probe(id)` 多给：`down`、`lie`、`moving`、`dead`（已倒地落定）、`weapon`、骨盆 / 头的世界 xz、`headYawDeg`（头相对骨盆的世界朝向，`lie:"along"` 时 ≈ `yawDeg`）、`rootYawDeg`。
- 距离分级：60 m 外每 3 帧更新一次动画，阴影只在 25 m 内开；单关同时上限 120 个演员，超出时远处的只留地环与标签（报警告）。
- 切关、重载配置时全部回收；同一关切关键帧时按 `id` 复用。

```js
export class BlockoutPuppets {
  constructor({ scene, actorFactory, groundAt })
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
- 水：北沙河等水块要读得出是水（淡蓝半透明），不能是灰盒子。
- 方块：沿用默认白盒画质的灰网格材质。

## 7. 存档（`Script_EditorBlockoutStore.mjs` + 本机端点）

- 读：`fetch("./Blockout/<Level>.json?t=" + Date.now(), { cache: "no-store" })`；404 / 非 JSON 视为没有配置（界面提示）。
- 写（只在本机 LocalPreview 下可写）：`GET /__blockout/status`（只收 GET / HEAD）→ `{ writable, root, revisions: { <Level>: "<sha1 原始字节>" | null }, reason? }`（不可写时 `reason` 写原因）；`POST /__blockout/save`，body `{ level, doc, revision }`：`revision` 必填（字符串，文件不存在时才可为 `null`），`doc.level` 必须等于 `level`。成功 200 `{ ok, level, file, revision, warnings }`（客户端留下返回的 `revision` 供下次保存）；状态码：方法不对 405、非本机 / Host / Origin 不对 403、Content-Type 不对 415、超 4 MB 413、坏 JSON / 校验不过 / 嵌套过深 400（校验不过 / 嵌套过深时带 `details`）、level 或路径不对 403、版本号不符 409（带当前 `revision`）、写盘失败 500。
- 版本号 = 文件**原始字节**的 sha1（工作区是 CRLF 时也一样）：客户端读配置时按响应的原始字节（`arrayBuffer`）算 sha1，作为「我改的是哪一版」随保存发出；不得用状态口当下返回的版本号（那会把外部刚改的内容静默盖掉）。
- 端点（照 `Script_TextureImportServer` 的加固写法）：本机 socket + Host 只认 localhost / 127.0.0.1、`Content-Type: application/json`、同源 Origin、body ≤ 4 MB、`level ∈ BLOCKOUT_LEVEL_KEYS` 且路径过 `BLOCKOUT_CONFIG_FILE_RE`、解析后路径必须在根目录下、`ValidateBlockout` 不过返回 400 + `details`、`revision` 不符返回 409、`.tmp` + rename 原子写（`JSON.stringify(doc, null, 2) + "\n"`）。任何拒绝都不落一个字节。路由放在 405 闸之前。场景文件 v1 不开放写。
- 不可写时（Pages、测试服、局域网、旧的预览进程）：存进 `localStorage`（键 `tengxian1938_blockout_<Level>`）+ 提供下载 JSON，界面写明原因。
- 编辑器 v1 只有一个写操作：「记下当前机位」= 把玩家当前位置 / 朝向 / 姿态写进当前关键帧的 `player` 并保存。其余改动直接改 JSON（人或 AI），编辑器 2 s 内同步。
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
| `Script_EditorBlockoutMapTest.mjs` | 浏览器（临时 harness 页） | 纸面底色、块脚印、旋转块、等高线、各阵营标记颜色按像素数计（不看 `.visible`）；小地图以玩家为中心；全关总图缩放 / 平移 / 关键帧拾取 |
| `Script_EditorBlockoutBrowserTest.mjs` | 浏览器（游戏） | `?editor=blockout&level=FirstLevel&quality=whitebox&scale=small&audio=0` 启动；没有任务运行时、没有过场；关键帧数与配置一致；`GoTo` 后玩家位置误差 < 0.5 m；`Next` 过渡中单位位置连续变化（不瞬移）、结束后到位；切到 `SecondLevel` 后场景边界与地形变化、再切回；小地图与卡片像素非空；配置文件被外部改写后 3 s 内同步；全程无未捕获错误；截图存 `_shots/EditorBlockout/` |

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

- 2026-10-13：初版（入口、数据格式、接口、界面、第一关 44 个关键帧、第二关草稿、测试与分工）。
- 2026-10-13：追加「设置 → 高级工具」面板入口；`Script_EditorBlockoutConfig.mjs` 由集成负责人先写好；过渡改为按自然速度 + 整段快进；`Script_EditorBlockoutStore.mjs` 归 B 包。
- 2026-10-13（合 master）：高级工具改成菜单栏后入口挪进「关卡」菜单；按开发工具隔离规则，`Script_Main` 不再直接 import 编辑器模块，关卡表与总控经 `Script_DevTools.BlockoutPhases / BlockoutStartIndex / CreateBlockoutEditor` 取（剔除版返回空表 / null）。
- 2026-10-13（集成）：四包合并；§5.4 信号按剧情时刻；§3 担架加 `bearers`；§5.5 射界扇只画不穿墙的一遍并在近处淡出；§7 写明端点的必填字段、返回与状态码、版本号按原始字节；校验器报错不再回显嵌套值（防预览服务栈溢出）。
- 2026-10-13（用户反馈第一轮）：锁不住鼠标的窗口退化成按住右键拖动转视角；全关总图打开时对准玩家、导航栏压在总图上面仍可用；导航栏加重播按钮（同 `Y`）。
- 2026-10-13（复制当前位置）：卡片加「复制当前位置」按钮与 `P` 键（§4.2），文字末行带整份 JSON；入口加 `pose=` 参数，「重现」链接原样打开回到同一机位。
- 2026-10-13（地图开着鼠标漏到游戏）：遮罩改成盖满整屏（导航栏两边那条原来露着，点一下会重新锁鼠标 / 在面板里直接开枪）；`Script_Main` 加 `BlockoutMouseCaptured()` 闸住抢锁、开枪、转头与滚轮换枪。
- 2026-10-18（01–05 第二轮修补）：§3 单位加可选 `lie`、`weapon` 写 `Dadao` 摆白刃戒备；§5.6 倒地的人移动只平移、`lie:"along"` 顺着躺、预演 / 关键帧换武器就地 `SetWeapon`、Probe 多给几项；§14.1 演员键加 `lie`、`weapon`（阶跃）；§13 干沟南岸坎顶加矮土埂（南边平地看沟底余量 0.16 → 0.78 m）、板桥门板之间 5 cm 缝、05-2 桥下仰看与 05-3 甩手榴弹换机位、冬瓜顺着被子躺平滑跟着走、班长 02-2 抡大刀跳沟。
- 2026-10-18（01–05 返工）：§13 FirstLevel0105 按用户当天改稿重做地形、关键帧与预演（南沿迂回、两人并排拖单被、日常摆件、干沟集结处、路口板桥）。
- 2026-10-18（01–05 新剧本白盒）：新关卡 `FirstLevel0105`（§13）；场景文件加可选 `gates` 与块的显式 `y`，布局 `hideOpenGates`（§2.2）；关键帧可选 `stageLabel`、单位可选 `castId`（§3）；预演（§14，用户 10-18 拍板：编辑器里加预演，缺的动作先用现成动作顶上）。

## 13. 01–05 新剧本白盒（关卡键 `FirstLevel0105`，2026-10-18）

用户 10-18 在 Notion 定稿了第一关 01–05（剧本 + 子页「空间拓扑关系」的总图、按拍快照与草算尺寸表）。游戏里的第一关和 `Blockout/FirstLevel.json`（10-13 的旧剧情）都不动，另建一片独立场地：

| 文件 | 是什么 | 怎么来 |
| --- | --- | --- |
| `Data_EditorBlockoutFirstLevel0105Space.mjs` | 空间锚点（唯一口径）：原点 = 沟口，X 东 Z 南；前沿沟 / 交通沟 / 支沟 / 爬沟中心线、路、机枪坑三射位、防炮洞、坡顶、集结处干沟（+ 南岸枯树、东南头凹路）、路口板桥、支沟南沿土垄、沟里日常摆件表、02 迂回组爬出点、03 远处日军、场景信号名 | 集成负责人按 Notion 图（约 2.2 px/米）换算，表头注释列着与草算尺寸的对照 |
| `Script_EditorBlockoutFirstLevel0105Scene.mjs` → `Blockout/FirstLevel0105.scene.json` | 0.5 m 高度网格（四条沟用 `Script_TrenchPlan.CompileTrenchNetwork` 烘进去；坑、散兵坑、洞是平底开挖；干沟与凹路算自然地形）+ 体块（日常摆件、板桥横木与门板、枯树）+ 随信号体块 | `node Taierzhuang1938/Script_EditorBlockoutCli.mjs scene FirstLevel0105 --force` |
| `Script_EditorBlockoutFirstLevel0105Keyframes.mjs` → `Blockout/FirstLevel0105.json` | 25 个关键帧（01-1…05-4，02末用 `stageLabel`），坐标全从锚点算 | `... export FirstLevel0105 --force`（**会覆盖手改**；以后以 JSON 为准，手改后别再重导） |
| `Data_EditorBlockoutFirstLevel0105Lines.mjs` + `Script_EditorBlockoutFirstLevel0105Voice.mjs` → `Audio/Blockout0105/*.mp3` + `Blockout/FirstLevel0105.voice.json` | 01–05 全部台词的占位配音（SeedAudio，整段一次生成后按逐字时间戳切句），清单给预演用 | 见脚本头注；默认只生成缺的场 |
| `Blockout/FirstLevel0105.previz.json` | 每个关键帧的预演时间线（§14） | 预演数据生成器 / 手改 |

场景信号：`DugoutCollapsed`（01 塌洞）、`PitShelled`（03 末战车一炮打塌坑沿）、`TankDisabled`（05 战车瘫在桥头，桥面两块门板压断下沉）。场景文件里对应的块写在 `gates`（§2.2）。

**2026-10-18 返工（用户当天改稿，Notion 文字已改、图还是旧的）**：02 反冲改成南沿迂回（何有田带一个弟兄留在支沟口台阶上顺支沟压住北沿机枪，班长带刘文财和两个弟兄从支沟口往南 10 m 爬出交通沟、贴支沟南沿土垄外侧往东爬到审问处对面，「打！」从南沿上来）；拖单被改成顺子和何有田并排站在被子头上往前拖、班长倒退断后，三处躲：支沟里一垛弹药箱、支沟口台阶拐角、拐角 2；沟里铺日常摆件（弹药箱垛、土袋垛、靠沟壁的门板、水缸、木头堆、塌方土堆，能挡子弹的齐腰高，每段 ≥15 m 直沟至少一件，留 ≥2.2 m 通道；不要猫耳洞）；集结处从坡后浅洼地改成一道东西向干沟（沟底约 15×50 m、比坡顶低 4 m、两岸 2.5 m 陡坎、南岸一排枯树、东南头接往南的凹路），交通沟顺北岸切成坡道下到沟底；路口交通沟上搭板桥（顺路三根横木 + 门板，桥面 3.8 m 宽、与路面齐平，桥下沟底到横木底约 1.8 m），05 班长判断「只有走那座板桥」、带顺子钻到桥下趴着，车刚过桥甩手榴弹，车瘫在桥头（这一拍剧本用户还没最后拍板，白盒先这样做）。两条视线（集结处看不见前沿、南边平地 1.6 m 眼高看不进沟底）与北沿机枪看不见南沿土垄外爬的人，由场景生成器 notes 与 `Script_EditorBlockoutFirstLevel0105SceneTest.mjs` 核对。

**2026-10-18 第二轮修补（用户「没改的都改好」）**：
- 干沟南岸坎顶堆一道连续的矮土埂（锚点 `L0105_GULLY_SOUTH_BERM`，烘进高度场，不用体块）：顶高 0.6–0.8 m（按弧长起伏）、底宽约 2.2 m、顶宽 0.8 m；中心线从干沟西头的缓坎绕过西南角、顺南岸坎顶一直堆到凹路拐弯处，凹路把它切开（凹路本身是开口）；树照旧在南岸。南边平地（离南岸 ≥ 12 m、眼高 1.6）看沟底站着的人：最少多挡 0.16 → 0.78 m；SceneTest 门槛从 `> 0` 提到 `≥ 0.6`，另查土埂连续、高度、坎高扣掉土埂仍 2.5 m。
- 板桥门板每块单独一个块，顺路之间留 `L0105_BRIDGE.gapM` = 5 cm 的缝（SceneTest 查 4–6 cm）。
- 冬瓜在单被上 `lie: "along"`、朝向 = 被子朝向（头朝拖的人）；预演里跟被子同一条路、同一个时间窗的 walk 位置键（去掉原来的 90° 补偿与 0.25 s 一步的瞬移）。03-4 幺娃拖机枪手同理（`lie: "along"`，crawl 慢速匀速滑过去）。
- 02-2：关键帧班长 `weapon: "Dadao"`；预演里爬上南沿、跳沟（`DadaoAmbush` 举刀）、落地冲过去（`CreepDadao`）、劈甲（`LuoDadaoChopRear`）都是大刀；台词按剧本「打！」→「敌袭！」→「杀——！」（何有田在台阶那头喊，压制组同时往前冲，镜头扫一眼台阶）→ 班长跳沟落地「砍！」。02-3 开场接着拿大刀，走到顺子跟前时换回 `HanYang`，再 `LuoHandRifle` 把枪塞过去。02-2 关键帧玩家视角改成顺着支沟往西偏南（113°、仰 6°），看得见南沿开火的人、跳下来的班长和沟里倒下的人。
- 05-2：桥下仰看的 eye 挪到桥面南沿往南约 2 m 的沟底（蹲姿眼高）、朝西北 38°、仰 26–30°、视场 76°：画面从下往上是门板底面、桥沿、压在桥上的车身、天空；落土是烟 + 说明字。05-3：甩手榴弹换成顺子身后沟上方的宽镜头（视场 72°），前景顺子替身探身（没有扔手榴弹的片段，`PointBlockade` 顶上），越过沟沿是车尾和那块铁板。

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
  - 否则 `from`（必填）/ `to`（可选，机位移动）+ `look`（必填）/ `lookTo`（可选）；`fov` 垂直视场度数（缺省 60）；`ease`：`"linear"` / `"inOut"`（缺省）；`shake` 0–1。
- **演员** `actors[]`：`id` 是当前关键帧里的单位 id，或带 `spawn`（§3 单位字段，`x/z` 必填）临时加一个人（只活在这段预演里）。`keys[]` 按 `t` 排，每个键只写变了的字段：
  - 位置：`x, z`（`path` 是途经点；`move`：`"walk"` / `"run"` / `"crawl"` / `"drag"`（倒退着拖，朝向反过来）/ `"cut"`（到点瞬移），缺省 `walk`）。**带位置的键的 `t` 是到达时刻**：从上一个带位置的键（没有就是关键帧布设、t = 0）出发，按 `move` 的自然速度走（walk 1.4、run 3.5、crawl 0.5、drag 0.9 m/s），出发时刻 = max(上一个位置键的 t, 本键 t − 路长 / 速度)；窗口不够就从上一个位置键起匀速赶到。`t = 0` 的位置键 = 开场直接摆到那里（瞬移）。要控制「几点出发」，在出发时刻加一个同位置的键。`crawl` 走动时强制卧姿。
  - 朝向：`yawDeg` 或 `faceTo`（点 `{x,z}` 或单位 id 或 `"player"`）。走动中顺着行进方向（`drag` 反向），到点后 0.4 s 转到本键的朝向；本键没写朝向就保持到达时的行进方向，等后面的朝向键再转。
  - 姿态与状态：`stance`、`aim`、`state`（`"down"` 倒地）、`visible`、`carryRole`（`"front"` / `"rear"`，抬担架 / 拖单被）、`woundedWalk`、`talking`。这些与 `clip` 都是**阶跃**：取 t 之前最近写过这个字段的键。
  - 2026-10-18（第二轮）：`lie`（`"along"` / `null`，阶跃；没写过沿用关键帧单位 / spawn 的 `lie`）—— 倒地的人顺着朝向躺，见 §3、§5.6；倒地的人带位置的键照常写 `move`（`walk` 跟拖的人同速），运行时只平移、不起身，走动中朝向 = 行进方向（`drag` 反向），所以「头朝拖的人」= 用 `walk`。`weapon`（武器 id 或 `null`，阶跃）—— 换手里的武器（如班长 `Dadao` → `HanYang`）；**只有键里写过才有值**，`SamplePrevizActor` 在第一个 `weapon` 键之前返回 `undefined`（= 用造人时那把，不回填关键帧的缺省武器）。
  - 动作片段：`clip`（开场动作库等现成片段名，`null` = 清掉回原生动画）、`clipFrom`（从片段第几秒起）、`clipHold`（播完停在最后一帧；不写则播完回原生动画）。片段按骨架分：有 `castId` 的单位骨架固定，片段不在这具骨架上时退回原生动画并在状态里报一次（`Debug.Blockout.Previz.State().missingClips`）。
- **台词** `lines[]`：`line` 是 `voice` 清单里的句子 id；`actor` 可省（省了 = 当前关键帧里 `castId` 等于这句 `who` 的单位；找不到就从玩家头上放、不动嘴）。字幕显示这句的 `speaker` + `subtitle`；有口型轨按 sha256 用口型轨，否则用音频包络张嘴（单位要有带面部的身体：`castId` 属于 `Data_FirstLevelSpeakingCast`）。
- **事件** `events[]`（`type` 必填）：
  - `flash` `{dur, strength?}` 白光；`black` `{dur, fade?}` 黑场（`fade` 渐入渐出秒数）；`caption` `{text, dur}` 非台词的说明字（弱显示，如「（耳鸣）」）。
  - `explosion` `{x, z, kind?, radius?}`（`kind` 同 `VfxSystem.Explosion`）；`smoke` `{x, z, kind?, dur?}`（`SmokeDust` / `SmokeWhite` / `SmokeBlack`）；`muzzle` `{actor | x,z,h, count?, interval?}` 枪口火；`shake` `{dur, strength}`。
  - `signal` `{name, on}`：在这一刻把场景信号打开 / 关掉（塌洞、坑沿被炸、战车瘫），播完或中断时恢复到 `then` 那个关键帧的 `signals`。
  - `sfx` `{name, x?, z?, volume?}`：`name` 用 §14.3 的别名。
- 校验：`Script_EditorBlockoutPrevizPlan.mjs`（纯，node 与浏览器共用）导出 `BLOCKOUT_PREVIZ_SCHEMA`、`PREVIZ_LIE_MODES`、`ValidateBlockoutPreviz(doc, { config?, voice? })`（给了配置就核对 `keyframe` / 单位 id，给了清单就核对 `line`）、`NormalizeBlockoutPreviz(doc)`、`SamplePrevizActor(actorEntry, t, baseUnit)`、`SamplePrevizCamera(camera, t, resolve)`。

### 14.2 播放（`Script_EditorBlockoutPreviz.mjs` + 总控）

- 播：卡片上的「预演」按钮或 `N`（当前关键帧有预演时；键码集中在 `Script_EditorBlockoutPreviz.mjs` 头部的 `PREVIZ_KEY`）；再按 `N` 或 `Esc` 中断。播放期间：相机归预演（`Script_Main` 在玩家相机写完之后调 `blockout?.ApplyCamera?.(camera)`，返回 true 表示这一帧相机已被接管）、第一人称枪模藏起来、鼠标归预演（同全关总图：不开枪、不转头、不抢锁）、玩家站在原地不吃 WASD、3D 标记与头顶标签藏起来、卡片换成「预演 · 标题 · 进度」、导航栏不响应。
- 单位就是当前关键帧的演员（`BlockoutPuppets`），预演按 `SamplePrevizActor` 每帧摆位；播完 / 中断时恢复：`then` 指的关键帧直接到位（§5.1 的 `GoTo(..., { animate: false })`）。
- 字幕由预演自己的 DOM 显示（编辑器模式隐藏游戏字幕的规则不动）：底部居中、导航栏上方，「说话人 · 字幕」，与编辑器同一套视觉。
- `window.Tengxian.Debug.Blockout.Previz`：`Has(idOrIndex)`、`Play(idOrIndex)` → Promise（播完 resolve）、`Stop()`、`Seek(t)`（暂停在 t 秒，确定性求值，截图用）、`Resume()`、`Reload()`、`CameraPose(t)`、`State()` → `{ playing, paused, keyframe, t, durationS, missingClips, missingLines, missingSfx }`；`Debug.Blockout.Probe(id)` 查一个演员的现场状态（取证用）。
- 实现口径（2026-10-18 运行时包）：
  - `Script_Main` 的钩子：`BlockoutInputCaptured()`（预演中键位动作、走动、冲刺、开火、开镜、姿态切换都清零），玩家相机写完之后 `blockout?.ApplyCamera?.(camera)`，预演中第一人称枪模与身体一起藏；鼠标走全关总图那套 `CapturesMouse()` 闸。
  - 中断与播完一样按 `then` 跳关键帧。
  - `Seek` 只对**持续状态**确定（演员、镜头、白光、黑场、说明字、字幕、嘴、信号、持续的烟）；一次性的爆炸、枪口火、音效 Seek 时不补放。按走过的距离推身体的走路片段（带 `referenceSpeedMps`，如 `IjaWalkStabProne`）Seek 时身体停帧，正常播放没问题。
  - 嘴：previz 文件写了 `faceTracks` 就按 mp3 sha256 用口型轨，没有就用配音的音频包络。
  - 预演期间小地图照常显示。

### 14.3 音效别名（`sfx.name`）

运行时把别名映射到现有音频库的键（映射表在 `Script_EditorBlockoutPreviz.mjs` 头部）；找不到的别名静默跳过并记进 `State().missingSfx`。

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

## 15. 06–10 新剧本白盒（关卡键 `FirstLevel0610`，2026-10-18）

按 Notion 06–10（10-18 晚定稿）与集成负责人的搭建契约 §3–§4，照 §13 的做法另建一片场地：干沟 → 凹路 → 耿家庄。**坐标与 `FirstLevel0105` 同一套**（原点 = 沟口，X 东 Z 南），06 的干沟、南岸枯树、凹路头一段从 `Data_EditorBlockoutFirstLevel0105Space.mjs` import，不抄数字；北半截（z < 205）的地面直接调 0105 的 `L0105Ground`，所以两片白盒在干沟一带逐点一致（场景生成器 notes 与测试抽 4000 点比对，差 0）。游戏里的第一关、`FirstLevel`、`FirstLevel0105` 都不动。

| 文件 | 是什么 | 怎么来 |
| --- | --- | --- |
| `Data_EditorBlockoutFirstLevel0610Space.mjs` | 空间锚点（唯一口径）：场地范围、平地大形、凹路南段（路底按弧长的控制点）、河汊子、整村压平高度、街、老耿家（前屋 / 大门过道 / 后院 / 灶屋 / 偏屋 / 石磨 / 地瓜窖 / 柴草垛 / 后门与水缸 / 共用墙上的狗洞 / 墙缝 / 侧门）、邻院、东街与主街两侧的院子、日常摆件表、五个场景信号、地名、出生点。头注列着与契约草稿不一致的地方 | 集成负责人的契约 §3 换算；摆不下 / 接不上的才挪 |
| `Script_EditorBlockoutFirstLevel0610Scene.mjs` → `Blockout/FirstLevel0610.scene.json` | 0.5 m 高度网格（540×880）+ 186 个体块 + 15 个随信号体块 + 路 / 沟中心线 | `node Taierzhuang1938/Script_EditorBlockoutCli.mjs scene FirstLevel0610 --force` |
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
| `BackDoorOpen` | 水缸挪到门边、后门扇开到西墙边 | 10-4 |

与契约 §3 草稿不一致的地方（都在锚点文件头注）：凹路 z 185…230 这一段中线在 x 80…84（为了与 0105 的凹路逐点接上，比契约西 2…6 m）；老耿家前屋收到 x 82…106.4、x 106.9…109.5 留一道 2.6 m 的大门过道（契约前屋占满院宽，后院就没有车能进的门，11 驴车要从后门出村）、前门因此从 x≈108 挪到 x 104、偏屋挪到 x 110…118.25；灶屋收到 z 480…487（契约到 492，狗洞 z 488 会开进灶屋）、门在东墙 z 483.5；前屋南门放在 x 94；巷子南北那截中线 x 58.75（契约 ≈56，贴着邻院西墙 x 60 走）；地瓜窖坑挖 1.6×1.6（0.5 m 网格挖 1.2 m 只剩一个尖）；**地瓜窖从契约的 (110,499) 挪到 (90.5,499.5)**：契约坐标离侧门 28 m，剧本写「留下的那个鬼子站在八九米外」、契约自己也写「9 m 左右」，按剧本的距离来（截图里 28 m 外的人根本看不清），墙缝随之从 z 493 挪到 z 496.5、缝 0.2 m（从缝里看窖口斜 18°，0.5 m 厚的墙上的缝看得到；z 493 要斜 36°，看不到）；石碾挪到 (113.2,465.7)；妮儿捡弹壳的坎顶挪到 (50,138.8)（契约 (50,140.5) 在坎的斜面上）。

运行时缺的能力（先凑、报告里也列了）：演员只能站在 ≤1 m 的块顶上，房顶 3.5 m 站不上去——房顶扔手榴弹的鬼子位置记在房顶坐标，运行时他会站在屋里地面上；没有「被人背着」的姿态，用蹲着的伤员 + 旁边架着的人顶替；体块不跟着单位走（车上的弹药箱用 `CartDeparted` 收掉）；玩家的武器固定是汉阳造，10-2 石碾后那挺缴来的机枪用随信号体块表示；单位没有 `y`，窖里的人站在窖底（按高度场）。

**预演（2026-10-18，第二批）**：`Script_EditorBlockoutFirstLevel0610Previz.mjs --force` → `Blockout/FirstLevel0610.previz.json`，20 段、每个关键帧一段、播完 `then: next`（10-4 `stay`），总长约 11 分钟（06 约 1.3 min、07 2.5、08 1.8、09 3.0、10 2.4；每段 16–67 s，07-3 数铜板那段 67 s 是整段对白）。写法同 0105（§14）：镜头大半是顺子的眼睛（`eye`），走着说、挤过后送队、穿院子用 `from/to` 跟拍；台词用 `Blockout/FirstLevel0610.voice.json` 的句子按录音间隔排，不互压；玩家要按键的时刻（掀被角、两次捂嘴、推刺刀、拔大刀）用说明字标出，不出按键。
- 门缝 / 墙缝（09-2 / 09-3 / 09-4 开头）：镜头一直是贴在缝后的眼睛（视场 40°），不给院里的特写。**0.5 m 厚的墙上 0.2 m 的竖缝斜着看窖口（18°），能看见的只剩约 2° 宽的一条**（视线要同时穿过墙的近面和远面两个口子）；09-2 把汉子爬出来、被捅倒都排在「眼睛 → 窖口」这条线上才看得见。侧门缝南边只有 0.1 m 的门扇，扇面约 15°（−4°…+11°），挑襁褓、甩在窖沿、门里贴墙的妮儿都在这个扇面里。眼睛位置和扇面由 `SlitEye` / `GATE_EYE` 算，PrevizTest 用 2D 视线核。
- 襁褓：剧本里只是老太太怀里的包袱，不建人；预演用一个按比例缩小的倒地 `child` 替身（`Bundle`）占位，挑起来那一刻才在窖沿上露面，镜头不推近。
- 现成动作顶不上的缺口（按大小排，运行时没有的能力也列在这）：① 百姓（老耿、妮儿、村民、窖里一家、石磨上的老汉）和军官是程序化身体，**一个动作片段都放不了、`stance: crouch` 也蹲不下来**（Probe 报 crouch，身子还是站着）：拍肩膀、比划、捡弹壳、举手爬出窖、被拖、呜咽、咬手腕、扑倒、挪水缸、拔门闩全是走位 / 姿态 / 说明字，「蹲下来比划」只有说明字；② 没有「扑倒 → 压刺刀」的成对动作：鬼子扑出来是 `BayonetClearWood`，压刺刀是 `ButtThreat` + 倒地仰视的眼睛，被咬手一松是 `RifleDeflect`，顺子的大刀两刀是两声 `stab` + 说明字；③ 没有扔手榴弹进窖、磕钢盔的片段（`DuckBlast` 顶）；没有撒尿姿态（站着背对，半转身用 `GuardTurn`）；没有数铜板、掀被角、拽袖子；④ 挑襁褓只有刺刀上扬的 `BayonetClearWood`，没有「从怀里扯、挑起来甩」；⑤ 房顶的鬼子站不上 3.5 m 平顶（在屋里地面上倒下，说明字注明）；⑥ 石碾后的机枪是随信号体块，从 10-1 `MgSilenced` 起就在，演不出「拖过去」那一下；玩家武器固定汉阳造，机枪连发用捷克式的声音顶；⑦ 没有「被人背着」、罐子落地声（`dirtFall` 顶）、婴儿哭、窖里哭声、飞机过顶（都是说明字）；⑧ 慢动作一秒半做不了（预演没有时间缩放）。
- 门禁：`Script_EditorBlockoutFirstLevel0610PrevizTest.mjs`（`--fresh` 查生成器当场生成的那份并核两次逐字相同）：校验器、片段按骨架（百姓 / 军官一个都不许）、台词不互压、走位点与路线不进实心块（按那一刻的信号算随信号体块）、机位与眼睛不在块里、说话人可见、缝后的眼睛到演员的 2D 视线不被 ≥1 m 的块挡、五个信号按拍开、09-1 每次挪动前 2.5 s 内有机枪响、掷弹筒越落越近。`Script_TestRunner` 已登记（tier0Fast、editor 域）；`Script_EditorBlockoutPrevizPlanTest` 也顺手过一遍这份文件。截图验收：`_shots/EditorBlockout0610/Previz/`（不提交）。

门禁（纯 node）：`Script_EditorBlockoutFirstLevel0610SceneTest.mjs` 钉住：生成两次逐字相同、与 0105 北半截逐点一致（干沟沟底 −1.0 / 坎顶 +1.5 / 凹路口接沟底）、凹路各段深度、河汊子宽深与陡壁、整村压平、窖深、狗洞 0.4…0.5 m 宽 / 过梁 ≤ 0.5 m（大人钻不过）、墙缝 ≤ 0.2 m、侧门口看得见窖边的人（门关着被门扇挡、门缝 / 墙缝里看得见窖口）、北窗顺主街看到村北口、石碾后顺东街看到东头、东街 3.5 m 净空且两边墙在一条直线上、主街净空、五个信号的随信号体块齐全。`Script_EditorBlockoutFirstLevel0610KeyframesTest.mjs` 钉住：生成可复现、校验 0 错 0 警告、摆位 / 走位问题 0、20 帧齐全、信号按拍起、后送队 12 副担架 + 24 个走着的伤员停在凹路里、冬瓜一直躺在自己的担架上、所有人脚下都在地面上（站在高度场或 ≤1 m 的块顶、身子不进实心块；房顶那个单独核在平顶范围里）、09-4 门开了玩家看得见撒尿的鬼子、09-2 / 09-3 缝里看得见窖口、08-1 村口看得见北窗里的机枪手、10-2 石碾后看得见东头与街上趴着的鬼子、妮儿走巷子进邻院、从狗洞钻进后院、进灶屋走灶屋门。预演与占位配音是第二批（契约 §5），这次没做。
