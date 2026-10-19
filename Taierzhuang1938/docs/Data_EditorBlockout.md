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
| `body` | 可选（2026-10-19），只对百姓 / 小孩（`civilian` / `child` / `side:"civ"`）有意义：`"rig"`（缺省）= 能放动作库片段的骨骼占位身体（§5.6）；`"procedural"` = 旧的程序化 tzm 身体（放不了片段、蹲不下）。预演 `spawn` 里也能写。校验只认这两个值；归一化时没写或写错都去掉 |
| `arc` | 可选射界 `{ halfDeg, rangeM, yawDeg? }`（中心缺省 = 朝向）；缺省时只有机枪手（Type11/Type92Hmg/Zb26）和战车按 §5.3 默认画 |
| `path` | 可选：从**上一关键帧**的位置走到这里的折线（不含起点，可含终点）；没有则直线 |
| `intent` | 可选：此刻「即将去」的折线，画成虚线箭头；没有且下一关键帧里这个人换了位置，则自动取下一关键帧的 `path`/直线 |
| `speedMps` | 可选过渡速度；缺省 ija 2.8、nra 2.4、civ 1.6、litter 1.2、tank 2.0 |
| `guess` | 可选 `true`：位置是推测的（游戏数据里没写），界面上用虚线圈 + 「?」 |
| `bearers` | 只对 `kind: "litter"`：抬担架的人数 0–2（缺省 2）；`0` = 担架放在地上 / 床边、没人抬；`1` = 只画前面一个抬担架的人（后头由玩家或别的单位抬着，或搁在地上）。担架的 `state: "down"` 只表示抬担架的人倒了 |
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
- 2026-10-18（第三轮，用户「小毛病全都修掉」）：
  - **`lie:"along"` 摆法**：原来骨盆落在单位位置上；倒地片段都是侧身蜷腿，骨盆居中时一只脚伸出 0.7 m 宽的单被（冬瓜，脚离被边 −0.24 m）。改成量一次「头、骨盆、两脚」，把它们的包围框中心放在单位位置上，身体轴在「骨盆→头」±8° 里取横向最窄的方向（头朝向仍与 `yawDeg` 差 ≤ 8°）；要顺着躺的人倒地片段固定用腿蜷得最窄的 `DeathCollapseC`（四段实测两脚离身体轴：C 0.41–0.44 m、B 0.48–0.53、D 0.55–0.59、A 0.56–0.59），倒着的人在关键帧之间换成 `lie:"along"` 时重造一次（好按 C 重新倒）。
  - **投弹**：预演键 `throw`（§14.1）→ 主角本人播步兵投弹片段 `GrenadeThrow`（`Script_InfantryAnimation`「背枪投弹」，游戏里 `Actor.BeginGrenadeThrow` / AI 齐投同一个片段，实测 4.23 s）：`actor.PlayImportedAnimation("GrenadeThrow")` 定住片段，片段时间按 `drive.throw.seconds` 直接设（Seek 确定）；手里的手榴弹由 `Actor._UpdateInfantryProps` 照游戏原样挂在片段的 grenade 挂点上、2.15 s 脱手后藏掉；抡的时候不举枪、不播开场片段。骨架上没有这个片段 → 记进 `Previz.State().missingClips`，照原生动画。
  - `Probe(id)` 再多给：`headY` / `pelvisY`（世界高度）、`feet`（两脚世界坐标）、`deathVariant`、`throwing`、`grenadeVisible`、`throwClipS`。
- 2026-10-19（白盒预演补齐，运行时包）：
  - **百姓 / 小孩换成能放片段的骨骼占位身体**（`kind` civilian / child、`side:"civ"`，含担架上百姓的抬杆人）：用 NRA 士兵骨架造人（`actorFactory.Create("nra", { modelVariant: 1 /* TengxianNra02，预演动作库都烘在它上面 */, weapon: null, noPool: true, uniformPalette: <十六进制色> })`），走空手步态；外观改成一眼认得出是老百姓：军装布按种子换成百姓的深蓝 / 黑 / 土布 / 靛青（`CIVILIAN_RIG_LOOK.cloth`，`Script_Actor.Create` 新认 `options.uniformPalette`，`Script_UniformColors.UniformMaterial` 新认十六进制色；不给 = 游戏老路一字不变）、帽徽 / 腰间枪套 / 胸前带子按材质名藏掉（`CIVILIAN_RIG_LOOK.hideMaterials`）。**军帽摘不掉**：它与军装是同一个网格、同一张图集，占位接受。`child` 照旧整体缩到 0.62。只在白盒编辑器里当占位，不进 `Data_CharacterSelection`、不影响游戏正片。旧的程序化身体留作开关：单位 / 预演 `spawn` 写 `body: "procedural"`（§3），缺省 `BLOCKOUT_PUPPETS.civilianBody = "rig"`；两种之间切换时重造。
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
Probe(id)                    // 某个演员此刻的样子（§5.6）
StandAt(x, z)                // 站人的地面（2026-10-18 第三轮，取证用）
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
| `Script_EditorBlockoutMapTest.mjs` | 浏览器（临时 harness 页） | 纸面底色、块脚印、旋转块、等高线、各阵营标记颜色按像素数计（不看 `.visible`）；小地图以玩家为中心；全关总图缩放 / 平移 / 关键帧拾取 |
| `Script_EditorBlockoutBrowserTest.mjs` | 浏览器（游戏） | `?editor=blockout&level=FirstLevel&quality=whitebox&scale=small&audio=0` 启动；没有任务运行时、没有过场；关键帧数与配置一致；`GoTo` 后玩家位置误差 < 0.5 m；`Next` 过渡中单位位置连续变化（不瞬移）、结束后到位；切到 `SecondLevel` 后场景边界与地形变化、再切回；小地图与卡片像素非空；配置文件被外部改写后 3 s 内同步；全程无未捕获错误；截图存 `_shots/EditorBlockout/` |
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

- 2026-10-20（12–18 预演第二版）：§16 用上 `ride`（三副担架横搁车板、妮儿坐车尾、13-2 伤员挂到担架上被抬走；关键帧生成器 `CartWorld` / `NIER_TAIL_RIDE` / `PressPose` / `DOCTOR_PRESS`，摆位检查跳过挂着的人、`tending` 不报与伤员重叠）、`aircraft`（13-1 / 14-2 两架 Ki-30 顺着大路扫、13-2 / 14-1 兜圈子，弹着由 strafe 画）、`slowmo`（14-2 松手那 1.7 s）、百姓 / 小孩 / 军官 / 兵的占位片段、`clipRelease`（冬瓜攥袖子）、18-2 院里担架出院门上桥；PrevizTest 加飞机 / 慢动作 / 挂车 / 片段 / 院里担架 / `TalkPostureChecks`，KeyframesTest 加挂车与军医站位断言。
- 2026-10-20（挂到车上 + 预演音效直接放文件，运行时包 M）：§3 单位加可选 `ride`（挂到 `cart` / `tank` / `litter` 上，`Script_EditorBlockoutConfig` 校验 / 归一化，`RideIssues` / `NormalizeRide` / `BLOCKOUT_RIDE_CARRIER_KINDS`）；§5.6 `BlockoutPuppets` 按车位姿摆挂着的人与担架、驴车尺寸实测 `BLOCKOUT_CART_SEATS`（车板顶 1.025 m）、`SitRootY` / `RideWorldPose`、Probe 多给 `ride` / `seat` / `rootAboveCarrierGround`；§14.1 预演键 `ride`（阶跃，挂着写位置键报警告）；§14.3 `PREVIZ_SFX` 可写 `{ url }` 直接放 `Audio/BlockoutPreviz/` 的文件（解码进声库、按位置放、读不到只警告一次），别名加 `babyCry` / `cellarSob` / `gateSmash` / `jarShatter`；门禁 ConfigTest / PrevizPlanTest 加用例、`PrevizRuntimeBrowserTest` 加车 + 挂人 + url 音效（不再带 `audio=0`）。0610 的数据（07 妮儿坐车尾改成 `ride`）由之后的集成一路改。
- 2026-10-19（白盒预演补齐，运行时包）：§5.6 百姓 / 小孩换成能放片段的 NRA02 骨架占位身体（布换百姓色、帽徽 / 枪套 / 带子藏掉，军帽摘不掉），§3 单位 / spawn 可选 `body: "procedural"` 退回旧身体；军官片段不再被拦；§14.1 段里加 `aircraft[]`（机型 + 按时间航点 + 扫射段 + 引擎声，纯函数取样，镜头可锚飞机）与 `slowmo[]`（窗口倍率 + 渐变，人物 / 片段 / 特效 / 飞机 / 镜头一起慢，台词与音效照常）；§14.2 新模块 `Script_EditorBlockoutPrevizAircraft`、`State()` 多给 `timeScale` / `wallT` / `aircraft`；`Script_Actor.Create` 认 `options.uniformPalette`、`Script_UniformColors` 认十六进制色（不给 = 老路）；门禁 `Script_EditorBlockoutPrevizRuntimeBrowserTest`，0610 PrevizTest 放宽成「百姓 / 军官只许通用片段」。
- 2026-10-13：初版（入口、数据格式、接口、界面、第一关 44 个关键帧、第二关草稿、测试与分工）。
- 2026-10-13：追加「设置 → 高级工具」面板入口；`Script_EditorBlockoutConfig.mjs` 由集成负责人先写好；过渡改为按自然速度 + 整段快进；`Script_EditorBlockoutStore.mjs` 归 B 包。
- 2026-10-13（合 master）：高级工具改成菜单栏后入口挪进「关卡」菜单；按开发工具隔离规则，`Script_Main` 不再直接 import 编辑器模块，关卡表与总控经 `Script_DevTools.BlockoutPhases / BlockoutStartIndex / CreateBlockoutEditor` 取（剔除版返回空表 / null）。
- 2026-10-13（集成）：四包合并；§5.4 信号按剧情时刻；§3 担架加 `bearers`；§5.5 射界扇只画不穿墙的一遍并在近处淡出；§7 写明端点的必填字段、返回与状态码、版本号按原始字节；校验器报错不再回显嵌套值（防预览服务栈溢出）。
- 2026-10-13（用户反馈第一轮）：锁不住鼠标的窗口退化成按住右键拖动转视角；全关总图打开时对准玩家、导航栏压在总图上面仍可用；导航栏加重播按钮（同 `Y`）。
- 2026-10-13（复制当前位置）：卡片加「复制当前位置」按钮与 `P` 键（§4.2），文字末行带整份 JSON；入口加 `pose=` 参数，「重现」链接原样打开回到同一机位。
- 2026-10-13（地图开着鼠标漏到游戏）：遮罩改成盖满整屏（导航栏两边那条原来露着，点一下会重新锁鼠标 / 在面板里直接开枪）；`Script_Main` 加 `BlockoutMouseCaptured()` 闸住抢锁、开枪、转头与滚轮换枪。
- 2026-10-19（12–18 新剧本白盒）：新关卡 `FirstLevel1218`（§16）；§14.3 预演音效别名加 `planeDrone` / `planeDive` / `strafeNear` / `strafeFar` / `strafeDirt`（飞机与扫射，映射到游戏音频库现成的键）。
- 2026-10-18（01–05 第三轮，「小毛病全都修掉」）：§14.2 白盒画质下预演的爆炸看得见了（`Script_EditorBlockoutPrevizFx` 在调试叠加层另画简易爆炸，只在编辑器、只在白盒特效关时画）；§14.1 演员键 `throw`（播投弹片段 + 弹的抛物线）、爆炸事件 `h`；§5.6 `lie:"along"` 按身体包围框居中、固定用 `DeathCollapseC`，Probe 再多给几项；§13 板桥门板缝 5 → 9 cm、旧门板厚薄高低不一，冬瓜在被子上一直躺着，桥下的人一律蹲 / 趴，05-3 顺子替身播投弹片段；补：白盒下的烟与枪口火、05-4 鬼子绕桥东头、04-3 刘文财猫腰过桥底。
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

## 16. 12–18 新剧本白盒（关卡键 `FirstLevel1218`，2026-10-19）

按集成负责人 10-19 给用户的 12–18 扩写稿（还没进 Notion）与同日的分拍空间图，照 §13 / §15 的做法另建一片场地：出村小路 → 沿北沙河北岸往西的大路（12 车边、13 空袭、14 松手）→ 路南的排水沟（15A / 15B）→ 北岸桥头接收院（15C、16 过门槛、17 门槛上）→ 守桥头、过浮桥、炸桥（18-1…18-4）→ 北门（18-5）。**坐标与 0105 / 0610 同一套**（原点 = 01–05 的沟口，X 东 Z 南）；z < 556 的地面直接调 0610 的 `L0610Ground`，村南那一截（老耿家后院、后门、后门小路、村南两片院子、河汊子直段）逐点一致，0610 的体块按 10-4 那一刻五个信号全开的样子取静态带过来。游戏里的第一关和 `FirstLevel` / `FirstLevel0105` / `FirstLevel0610` 都不动。

| 文件 | 是什么 | 怎么来 |
| --- | --- | --- |
| `Data_EditorBlockoutFirstLevel1218Space.mjs` | 空间锚点（唯一口径）：场地范围、接缝、出村小路、大路与路边浅沟、拐弯往西的河汊子、排水沟、两道河堤、北沙河、浮桥（14 段）、桥头空场与散兵坑、接收院（正房 / 灶屋 / 空心厢房与门槛 / 院门灯桩）、旁边两个院子、最后一拨人躲的南北向土坎、远处铁路桥、南岸路与北门、日常摆件、三个场景信号、地名、出生点。头注写了地理定论和与草稿不一致的地方 | 集成负责人草稿；子代理摆不下 / 视线不成立才改 |
| `Script_EditorBlockoutFirstLevel1218Scene.mjs` → `Blockout/FirstLevel1218.scene.json` | 0.5 m 高度网格（800×830）+ 240 个体块 + 25 个随信号体块 | `node Taierzhuang1938/Script_EditorBlockoutCli.mjs scene FirstLevel1218 --force` |
| `Script_EditorBlockoutFirstLevel1218Keyframes.mjs` → `Blockout/FirstLevel1218.json` | 19 个关键帧（12-1…18-5，15 拆成 `stageLabel` 15A / 15B / 15C），839 个单位位次；沟里的人按弧长摆在排水沟中线上（`DitchPoint`） | `... export FirstLevel1218 --force`（**会覆盖手改**） |
| `Data_EditorBlockoutFirstLevel1218Lines.mjs` + `Script_EditorBlockoutFirstLevel1218Voice.mjs` → `Audio/Blockout1218/*.mp3` + `Blockout/FirstLevel1218.voice.json` | 12–18 全部台词的占位配音（SeedAudio 整段一次生成后按逐字时间戳切句）与口型轨 | 见脚本头注；默认只生成缺的场 |
| `Script_EditorBlockoutFirstLevel1218SceneTest.mjs` / `...KeyframesTest.mjs` | 纯 node 门禁（见下） | `node Taierzhuang1938/Script_EditorBlockoutFirstLevel1218SceneTest.mjs` 等 |

地理上的几条定论（改之前先想清楚牵连）：08 说「西边是河汊子，车下不去」，所以河汊子在村西南拐弯往西、一直在大路北边（过了 x −100 再往北偏，让开桥头北边那个院子），大路夹在河汊子与北沙河河堤之间往西走；北沙河往西流（滕州的河往西流进微山湖），断桥往下游（西）漂；浮桥窄、一回只过一副担架，所以桥头堵成长队、接收院在北岸桥头；排水沟从大路南边的沟口一直通到桥脚东边的河滩，沟底 −1.9、两岸 0.3（深 2.2，沟比人深）。北门实际离北沙河十来里，白盒里挪到南岸往南约 150 m，预演用黑场带过。

地形：平地 = 0105 `NaturalHeight` + 0.3（与 0610 `BaseHeight` 在 z ≥ 372 同式），叠村子压平的余波；出村小路压低 0.1、大路压低 0.15、路两边各一道 0.45 深的浅沟（13 人往里扑）；河汊子横断面照 0610（沟底 −2.7）；两道河堤顶 1.5（高出平地 1.2），浮桥处留口子；北沙河水面 −1.6、河底 −2.6，浮桥底下 x 方向半宽 3 的一溜浅滩 −1.85（演员只能站在 ≤ 1 m 的块顶上：桥面顶 −0.95）；浮桥两头的引道穿过堤口子从平地高斜到桥面高；散兵坑深 0.9、北段 11 m + 南段 8.5 m（南段到 z 623.5 为止，再往南会被排水沟切断）；土坎顶 1.7（南北向，挡住东边机枪趴着看蹲着的人）。

体块：浮桥 14 段桥面板（每段一块、显式 y、相邻板多给 2 cm 不留缝）+ 每段一条船 + 栏杆桩 + 三根马灯桩；接收院（院墙 2.2、东墙大门 1.8、正房与灶屋实心、厢房空心 + 北墙门洞 1.2 + 门槛块 0.15、麦秸、马灯、院门里侧 2.8 m 灯桩 `gateLamp`）；旁边两个院子；散兵坑东沿土袋；路上丢下的包袱、小车；远处铁路桥（两座墩 + 钢梁 + 两截路基）；北门城墙（厚 6、高 8，门洞宽 4、高 4.5）与门内街两边的房子、火把桩、运沙土的小车。随信号体块：

| 信号 | 意思 | 从哪个关键帧起 |
| --- | --- | --- |
| `CartOverturned` | 驴车被扫翻在路边（翻倒的车 + 车轮出现；立着的车是单位 `GengCart`，从 13-2 起不再摆） | 13-2（预演里 13-1 中段打开） |
| `ChargesSet` | 北头四条船上绑了炸药包、引线顺着桥面拉到南岸 | 18-1 |
| `BridgeBlown` | 北头四段桥面与船没了、碎桥面与歪船往下游（西）漂；炸药包和引线跟着没了 | 18-4（预演里 18-3 末打开） |

运行时缺的能力（10-19 第一版先凑的；10-20 第二版补上了一半，见下）：黑子是单独的 `animal` 单位；军医是空手的国军兵，没有定妆；桥头军官用 `frontOfficer` 定妆；抬担架都是 bearers 0、前后的人各离担架中心 1.3 m，编辑器画不出玩家手里的杠子，担架也斜不起来（14-2「前头着地、后头还举着」靠站位 + 说明字）；铁路桥爆炸、远处炮火没有单位，用 POI（danger）标。

**第二版（2026-10-20，用上 §3 `ride`、§5.6 骨骼占位身体、§14.1 `aircraft` / `slowmo` / `clipRelease`）**：
- **车上的东西**（关键帧 + 预演）：12-1…13-1 三副担架横搁在车板上（担架 2.1 m 长、车板 1.5 m 宽，只能横着搁，三副 0.7 m 宽正好铺满 2.4 m 的车板；`CART_LITTER_SLOTS` 本地 z +0.75 / 0 / −0.75，冬瓜那副靠车尾），布底贴车板 `y 1.075`、躺在上面的人 `y 1.125`，另两副是新单位 `CartLitter1/2` + `CartWounded1/2`（翻车后不再摆）；12-1 / 12-2 妮儿坐车尾沿（`NIER_TAIL_RIDE`：z +1.2、y 0.467、背对车头）。单位的 `x / z` 仍写车上那一点的世界坐标（`CartWorld`，车不在场时的备用），摆位检查对挂着的人 / 担架不查重叠、车身、实心块。预演里挂着的不写位置键：12-3 开场妮儿先用预演键挂回车尾再 `ride: null` 溜下去；13-1 车翻那一下所有人 `ride: null` + 切到甩出去的位置；13-2 被甩下来的两个伤员在担架经过时 `ride` 到 `Litter01 / Litter02` 上被抬走（实测：坐车尾的骨盆离车板顶 0.04 m、躺在车板担架上的骨盆离地 1.31 m、被抬的担架上 1.02 m）。
- **飞机**：13-1 / 13-2 / 14-1 / 14-2 两架九七式轻爆（`TwoPlanes`：B 机晚 1.4 s、偏北 20 多米）。13-1 从身后顺着大路压下来（最低 24 m、约 70 m/s），A 机 `strafe` 从 x 24 犁到 −40（t 7.4–8.56，弹着超前机身 30 多米，翻车在弹着经过车那一刻 8.08 s）；13-2 在河南边野地上空兜大弯（`Circle` 圆心 (−140, 330)、半径 280）；14-1 从东北边绕回来；14-2 第二轮 A 机 `strafe` 从 (−8, 614.3) 犁到 (−46, 614.3)——在冬瓜（z 613.3）与担架（615.6）之间、离谁都一步远。镜头各有一条锚在飞机上；不再手放 planeDrone / planeDive / strafe 音效（12-3 东边由远而近、15 往南越来越小的仍是音效）。
- **慢动作**：14-2 `slowmo` 1.7–3.4 s、0.3 倍、进出 0.3 s，盖住扑倒、杠子脱手（1.9 s 说明字）、担架前头着地（2.2 s）；窗口里没有台词。
- **百姓 / 小孩 / 军官 / 兵放片段**：妮儿 VilSitEdge（坐车尾）/ PvSitGrabHand（坐到车板上攥袖子，`NIER_BOARD_RIDE` y 1.025）/ VilClingHem（攥笼头、18-1 攥老耿后襟）/ VilCowerWhimper（怀里挣）/ VilDuckProne（趴着抱头）/ VilCrouchHold（沟里蹲）/ PvKneelDig（画驴，占位）；老耿 VilDuckProne（13-1 扑沟、14-2 扑在冬瓜身上）/ PvKneelHaulBody（翻冬瓜）/ PvStandPointL（指沟口）/ PvCrouchGripLitter（抓杠子）/ CareMedicPress（15A 按毛巾，站位按 CollectionCare 清单 `stages.press`：`PressPose`）/ PvSitRestRifle（15C 靠东墙坐，根离墙面 0.35 m）/ PvKneelPullBlanket（17 拉棉袄盖脸）/ PvStandTalkSlung；冬瓜 CareLieWrithe（车上抖）/ CareLieTreated / PvLieGrabSleeve（15A 攥袖子，`clipRelease` 在「抵了」说完那一秒放开、`clipHold` 停末帧）；军医 CareMedicPress（关键帧站位就是跪在 `YardWounded09` 右边的 `DOCTOR_PRESS`，17-1 跪在冬瓜右边即担架西边）/ PvStandPointL（指厢房、冲门口吼）；守门的兵 PvStandHaltL；刘文财 PvCrouchTalkRifle / PvCrouchCountFingers / PvStandTalkSlung；桥头军官 PvStandTalkSlung 说、PvStandPointL 下令（不拿枪说话）；班长 / 何有田 PvStandTalkLowRifle、班长 PvStandWaveOnL（撤 / 走）、PvStandPointL（还有人 / 那挺机枪）；工兵 PvKneelDig（绑炸药）、南岸 PvCrouchGripLitter（捏引线）；幺娃 PvStandBeckonL（快过来）；撤下来的 VilNraCarryOnBack + VilRideOnBack 一对、百姓 VilPanicRun；带路的兵 PvStandBeckonL；院里烧水的 / 蹲着的 VilCrouchHold。门禁 `TalkPostureChecks` 同 0105 / 0610。
- **18-2「等」**：`YardLitter3` 和军医开场在院门里侧，接收院的担架一副一副（0.5 / 2 / 8 s 出发）抬出院门插进队里上桥到南岸，军医 9.6 s 跟着最后一副出门；镜头 10–14.6 s 看着院门。
- 还没有合适片段、仍用站位 + 说明字的：老耿脱棉袄扔过去、掰妮儿的手；刘文财箍住妮儿；妮儿画驴 / 摆弹壳（PvKneelDig 顶着）；舀水、推小车、扛木料。车板上的担架块和车板同色，远看分不出（人躺的高度对）。

门禁（纯 node）：`Script_EditorBlockoutFirstLevel1218SceneTest.mjs` 钉住：生成两次逐字相同、接缝两侧与 0610 地面逐点一致（抽 4200 点差 0）、河汊子拐弯后离大路 ≥ 15 m 且沟底 −2.7、排水沟直段深 ≥ 2.0 / 沟底宽 ≥ 1.4 / 沟口坡不陡于 1:2.5、两道堤顶与口子、浮桥 14 段连续且每段有船 / 桥面离浅滩 ≤ 1.0 / 引道接桥面高差 ≤ 0.15、接收院大门 ≥ 1.6、厢房门与门槛、散兵坑深、北门门洞与城墙高、三个信号的随信号体块齐全，五条视线（小路口往西望得到桥头、散兵坑里看得到鬼子机枪、机枪看不到土坎西边的人、南岸看得到北岸堤上的人、南岸看得到院门灯桩）。`Script_EditorBlockoutFirstLevel1218KeyframesTest.mjs` 钉住：生成可复现、校验 0 错 0 警告、摆位 / 走位问题 0、19 帧齐全、信号按拍起、所有人脚下在高度场或 ≤ 1 m 的块顶（浮桥桥面算块顶）、身子不进实心块、没人站在水里、冬瓜从 12-1 到 17-3 每帧都在（down）且担架跟着他、关键视线（13-1 看得见路当中的妮儿、14-2 看得见老耿和滑到路当中的冬瓜、15-2 在沟里看不见大路上的人、16-1 看得见厢房里放担架的地方、18-2 看得见机枪组与土坎、18-4 看得见北岸堤上的鬼子）。
