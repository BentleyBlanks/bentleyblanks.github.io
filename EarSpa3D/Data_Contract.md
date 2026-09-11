# EarSpa3D · 接口契约与协作边界

《采耳物语 · 3D 采耳 ASMR 解压游戏》的模块契约。**任何 Subagent 动手前先读本文件**；
不在本文件里的跨模块引用一律视为越界。改契约要先改本文件，再改实现。

## 0. 一句话产品定义

### 2026-09-11 整块取出重设计（当前入口，以本节为准）

固定目标：**真实接触 → 从边缘施力 → 整块松脱但仍被工具持住 → 工具带出 → 重力落盘**。
每轮只改进触感、可读性、沉浸和声音，不重新引入固定向下拖动、累计划动里程或缩小消除。

- `index.html` → `Script_ChunkGame.js` + `Script_ImmersiveScene.js` + `Script_PeelPhysics.mjs`。
  旧 ChunkScene / Main / Hand / Wax 留作参考，不是当前入口。
- BlenderMCP 独立建立耳廓、封闭耳道、鼓膜、竹耳勺、镊子、滴管、三种完整块体、陶瓷盘。
  源工程留 OneDrive，游戏只加载 GLB；重建方法见 `Data_ImmersiveAssets.md`。
- 毫米世界中的工具目标由当前相机射线和抓取平面决定。耳勺从最近边缘托起，镊子从接触点夹持。
  每块有五个独立粘附弹簧，偏心力产生转动；张开/剪切超过材质阈值才断裂。
  原地停留、反复微动、推向内壁不能凭操作里程消除；软化降低实际粘附强度。
- 状态：attached / peeling / returning / held / carrying / dropping / collected。
  未脱离时松手，由剩余粘附拉回。脱离后保留抓点和工具角向支撑，仍可移动；
  松手启动明确的托送辅助：工具沿耳道中心带出，镜头连续后退，夹爪松开/勺面倾斜，重力落盘。
  全程保持模型拓扑与世界尺寸，使用正常深度测试；没有裸块磁吸飞盘或尺寸缩放。
- 首次接触盘面才增加一次收藏和清洁度。最后一块收好后停留欣赏，玩家主动接下一位。
  `Script_Shop.js` 与 `earspa3d.shop.v1` 存档继续使用；工具升级提高持握弹簧效率。
- 手机一指操作：向管腔的空处托/拉，不要求固定屏幕方向。桌面同样交互；
  键盘可选块、空格抓放、方向键移动。UI 分区布局，声音和小铺在设置抽屉。
- 声音由接触、粘附断裂、落盘独立事件触发。连续摩擦随移动/受力变化，静止停止。
  新离线音频只使用 SeedAudio，保留合适素材；默认轻声 BGM，可调音量或静音。
- 验收：物理模块检查 + 真实鼠标/CDP 触屏整局，1000×900、390×844、320×568、844×390。
  检查静止、微动、反向压入、松手回落、软化、偏心转动、持握、可见工具带出、恒定尺寸、
  重力落盘、单次计数、结算、下一局与存档。查看固定 StepFrames 截图，不能只依赖 PASS。
  普通页只读 `__EarSpaProbe`；debug 页提供 `StepFrames` 与场景/物理探针。
  证据保留本地 `_dev/Data_RedesignAudit.json`，不得提交验收图或视频。

一款给「强迫症 + 采耳爱好者」量身定做的 3D 解压游戏：把真实采耳店的全套专业手法
（探、刮、挑、夹、扫、振、冲、吸、滴、照）做成可精细操作的交互，配上干净通透的
可爱画风和 ASMR 音景，让人一直想「再挖一下」。

## 1. 美术基调（硬约束，所有模块都要守）

**清新 · 可爱 · 舒适 · 解压**。参照物是「日式治愈系手游 + 精品解压玩具」，不是
医学教学片、不是恐怖游戏、不是写实恐怖谷。

- 不许出现：血腥、脓、虫、恶心特写、脏污、暗黑滤镜、刺眼的高饱和。
- 耵聍（耳屎）要做成**可爱的东西**：蜂蜜色 / 琥珀色 / 奶黄，半透明，像糖霜、像
  琥珀糖、像太妃糖；干性耵聍像小饼干屑、像麦片碎。取出来的时候要「好想把玩一下」。
- 耳道内壁要**健康粉嫩**，不是惨白也不是深红；有细微绒毛、湿润高光、柔和的
  皮下血管感（若有若无）。
- 场景是暖光、柔阴影、通透空气；要有少量飘浮的**微尘光点**（dust motes）来撑
  「质感」。整体接近 ACES 影调，不过曝、不脏。
- UI 是圆角、软阴影、奶油质感，主色见 `Data_Palette.mjs`。禁止直角硬边框、纯黑、
  细密小字。

## 2. 单位与坐标系（全项目唯一真相）

- **1 世界单位 = 1 毫米（mm）**。耳道全长 `28`，耳道口直径约 `8`，鼓膜直径约 `9`，
  头宽约 `180`，房间约 `3000`。相机 `near = 0.05`、`far = 6000`。
- Y 轴向上，右手系。
- **耳道空间（canal space）由 `Script_EarAnatomy.js` 定义**，其它模块只准通过它的
  API 换算，不准自己猜耳道形状：
  - `depth`：沿耳道中心线，`0` = 耳道口（耳甲腔处），向内递增，`Length` ≈ 28。
  - `angle`：横截面极角，弧度 `[0, 2π)`。`0` = 上方（superior），从耳道口向里看
    顺时针增大（后 → 下 → 前）。
  - `radius`：管腔半径（mm）。
- 分区常量（`CanalZones`，HUD 与判定共用）：

  | 名字 | 范围 (mm) | 含义 |
  | --- | --- | --- |
  | `cartilage` 软骨部 | 0 – 9 | 有耳毛与耵聍腺，皮脂多，耵聍主要产地 |
  | `bony` 骨部 | 9 – 21 | 皮肤极薄、极敏感，酥麻感来源 |
  | `danger` 危险区 | 21 – 25 | 再进就顶到鼓膜，判定为「危险」 |
  | `drum` 鼓膜 | 25 – 28 | 禁触，碰到立即中断并扣分 |

## 3. 模块与文件归属

**只改自己名下的文件**。需要别人的东西就 `import`，不要复制粘贴一份改。

| 文件 | 归属 | 职责 |
| --- | --- | --- |
| `Data_Contract.md`、`Data_Palette.mjs`、`index.html`、`Script_Core.js`、`Script_Main.js`、`Script_Session.js`、`Script_Input.js`、`Script_Camera.js` | lead | 骨架、渲染循环、输入、回合与评分、机位 |
| `Script_EarAnatomy.js`、`Script_Wax.js`、`Script_Character.js` | agent-anatomy | 耳廓 / 耳道 / 鼓膜 / 耵聍 / 可爱角色 |
| `Script_Tools.js`、`Data_EarTools.mjs` | agent-tools | 全套专业采耳工具几何 + 工具数据 |
| `Script_Materials.js`、`Script_Scene.js` | agent-look | 程序化贴图材质 + 治愈系房间与灯光 |
| `Script_Audio.js`、`Script_SeedAudioBake.mjs`、`Data_AudioSources.mjs`、`Audio/**` | agent-audio | 火山引擎 BGM/音效烘焙 + 运行时音频 |
| `Script_Ui.js`、`Style_EarSpa.css` | agent-ui | HUD、工具架、移动端布局 |

## 4. 工程约定

- ES Module，导入裸名 `three`（importmap 指向仓库内 vendor 的 three 0.185.1）：
  `import * as THREE from "three";`
- **模块顶层不许有副作用**：不碰 `document` / `window` / `navigator`，不建 renderer，
  不注册事件。一切从导出的工厂函数里开始。
- 对外 API 用 `PascalCase` 函数名，内部变量 `lowerCamelCase`，常量 `UPPER_SNAKE`。
  注释用中文，写「为什么」不写「是什么」。
- 随机数必须用**传入的种子 RNG**（`Data_Contract` 提供的 `MakeRng(seed)`），
  不许直接 `Math.random()`——同一场耳的耵聍分布要可复现，便于回归比对。
- 移动端性能预算（中低端手机 60fps 为上限）：
  - 全场景三角面 ≤ 180k，draw call ≤ 120（两个视角合计）。
  - 不许用 `ShaderMaterial` 写重后期；效果优先用顶点色 / 贴图 / 少量 uniform。
  - 粒子（灰尘、碎屑、绒毛）一律用 `InstancedMesh` 或 `Points`，单批 ≤ 2000。
  - 不给每根毛一个 Mesh；耳毛、鹅毛、马尾一律若干实例 + 程序化摆动。
- 所有导出函数必须能容忍「可选依赖缺失」：材质没传就退回 `MeshStandardMaterial`
  默认色，音频没就绪就静默，不许抛异常把游戏卡死。

## 5. 对外 API 契约

### 5.1 `Data_Palette.mjs`（lead 提供，已冻结）

```js
export const PALETTE = { cream, mint, peach, sky, honey, wood, skin, skinDeep,
                         blush, ink, inkSoft, waxDry, waxDryDeep, waxWet, waxWetDeep,
                         steel, bamboo, feather, cotton, water, glass, ... };
export const CSS_VARS = { "--ear-cream": "#FFF8F2", ... };   // UI 直接铺到 :root
```

### 5.2 `Script_EarAnatomy.js`

```js
export const CANAL_LENGTH = 28;          // mm
export const CANAL_ZONES = [ {id,label,from,to,hint}, ... ];

export function BuildEar(THREE_unused, { materials, quality } = {}) -> {
  group,                    // THREE.Group，已按耳道坐标系摆好，加进场景即可
  side: "right",            // 本模型是右耳；左耳由调用方 scale.x = -1 镜像
  canal: {
    length, drumDepth,
    CenterAt(depth) -> THREE.Vector3,             // 中心线
    TangentAt(depth) -> THREE.Vector3,            // 中心线切向（指向耳道深处）
    FrameAt(depth) -> { center, tangent, up, right },
    RadiusAt(depth, angle) -> number,             // 管腔半径
    PointAt(depth, angle, inflate = 0) -> THREE.Vector3,
    NormalAt(depth, angle) -> THREE.Vector3,      // 由管壁指向管腔中心
    Project(worldPoint) -> { depth, angle, radialDist, inside },  // 最近中心线投影
    ZoneAt(depth) -> "cartilage" | "bony" | "danger" | "drum",
  },
  landmarks: { concha: Vector3, tragus: Vector3, drumCenter: Vector3, ... },
  setQuality(quality),      // "low" | "mid" | "high"
  dispose(),
};
```

### 5.3 `Script_Wax.js`

```js
export const WAX_TYPES = ["dry", "wet", "impacted", "debris"];
export function MakeWaxField(THREE_unused, { canal, rng, materials, quality }) -> {
  group,
  deposits,        // [{ id, type, depth, angle, size, hardness, wetness, removed01, mesh }]
  softness01,      // 0..1 全局软化度（滴耳液/音叉会抬升）
  Update(dt, ctx),                 // ctx = { moisture, vibration01, heat01 }
  // 工具接触主入口：返回这一帧发生了什么
  Probe({ tip, tipPrev, tool, dt, motion }) -> {
    hit: boolean, depositId, spotDepth, spotAngle,
    removeNow,          // 本次取下的量（0..1，相对于该处耵聍）
    crumbCount,         // 掉落碎屑数（已自己生成）
    stretch01,          // 油性耵聍被拉丝的程度
    hardnessNow,        // 当前硬度（音叉/滴液后会降）
    finished,           // 该处是否已掏净
  },
  Vibration(center, radius, dt) -> number,   // 音叉共振：返回被影响到的耵聍数
  Soften(amount01),                          // 滴耳液
  Irrigate(stream) -> { washed },            // 冲洗带走的量
  Vacuum(center, radius, dt) -> { sucked },  // 吸引器
  Cleanliness() -> 0..1,                     // 1 - 剩余耵聍/初始耵聍
  Harvest() -> [{ type, size, depth, at }],  // 本次取出的「战利品」清单
  dispose(),
};
```

### 5.4 `Script_Character.js`

```js
export function BuildCharacter(THREE_unused, { materials, quality } = {}) -> {
  group,                 // 躺姿可爱角色，耳朵位置对齐 canal 空间原点
  earAnchor,             // THREE.Object3D，耳道坐标系原点（挂耳用）
  SetExpression(name, intensity01),   // "relaxed"|"ticklish"|"happy"|"shiver"|"surprise"|"sleepy"|"ouch"
  SetBreath01(v),        // 呼吸相位驱动的细微起伏
  Update(dt, state),     // state = { expression, comfort01, tickle01, depth, pain01 }
  Blink(),               // 手动触发眨眼
  setQuality(quality),
  dispose(),
};
```

### 5.5 `Script_Tools.js` + `Data_EarTools.mjs`

```js
// Data_EarTools.mjs
export const EAR_TOOLS = [ {
  id, name, cnName, category,          // category: "pick"|"clean"|"stimulate"|"inspect"|"care"
  realWorldNote,                        // 一句真实采耳店的用法/讲究（要查证过）
  material,                             // "bamboo"|"steel"|"feather"|"horsehair"|"cotton"|"glass"|"wood"
  mechanic,                             // "scoop"|"rake"|"sweep"|"pinch"|"wipe"|"vibrate"|"spray"|"irrigate"|"vacuum"|"light"
  lengthMm, tipRadiusMm,
  idealDepthRange: [from, to],
  idealSpeedRange: [minMmPerS, maxMmPerS],
  idealAngleDeg,                        // 相对管壁的理想夹角
  comfortGain, painRisk, crackRisk,     // 0..1 手感参数
  unlockAt,                             // 造诣/进度解锁
  sfx: { contact, success, fail },      // cue 名，交给 Script_Audio
}, ... ];

// Script_Tools.js
export function BuildTool(THREE_unused, { id, materials, quality }) -> {
  group, spec,             // spec = EAR_TOOLS 里那一条
  tip,                     // THREE.Object3D，位于工具最前端（接触判定用它的世界坐标）
  tipRadius,               // mm
  axis,                    // THREE.Vector3，工具朝向（局部）
  Update(dt, { active01, vibration01 }),   // 鹅毛摆动、音叉余振等
  dispose(),
};
export function ToolIds() -> string[];
```

### 5.6 `Script_Materials.js` + `Script_Scene.js`

```js
// Script_Materials.js
export function CreateMaterials(THREE_unused, { quality } = {}) -> {
  skin, skinInner, drum, waxDry, waxWet, waxImpacted, crumb,
  steel, steelDark, bamboo, wood, featherWhite, featherBrown, horsehair,
  cotton, glass, water, ceramic, cloth, hair, dust,
  textureSet,     // { skinMap, skinNormal, waxMap, woodMap, ... } 程序化生成的贴图
  dispose(),
};
export function MakeDustPoints(THREE_unused, { count, radius, seed }) -> THREE.Points; // 微尘光点

// Script_Scene.js —— 治愈系采耳店房间（清新可爱，不是医院）
export function BuildRoom(THREE_unused, { materials, quality } = {}) -> {
  group, lights, ambient, setMood(id),   // "rainNight"|"teaRoom"|"morning"|"sleepy"
  Update(dt, { mood01 }),
  dispose(),
};
```

### 5.7 `Script_Audio.js`

```js
export function CreateAudio() -> {
  ready,                       // Promise 或 boolean
  unlock(),                    // 首次用户手势时调用
  setBgm(id),                  // "rainNight"|"teaRoom"|"morning"|"sleepy"
  setAmbience(id),             // 环境层，可叠在 BGM 上
  playSfx(cue, { gain, rate, pan, delay } = {}),
  // 连续接触声（刮、扫、振）——必须现场合成，采样循环会像机关枪
  contact: {
    begin(kind),               // kind: "scrape"|"sweep"|"tickle"|"vibrate"|"wipe"|"water"
    update(kind, { speed01, pressure01, roughness01, dt }),
    end(kind),
  },
  setMaster(v), setSfxVolume(v), setBgmVolume(v),
  Update(dt),
  cues() -> string[],          // 可用 cue 名
  dispose(),
};
```

### 5.8 `Script_Ui.js`

```js
export function CreateUi({ palette, tools, on }) -> {
  // on = { toolSelect(id), action(name), mode(id), camera(id), settings(patch) }
  setCleanliness01(v), setComfort01(v), setRelax01(v),
  setDepth(mm, zoneId), setPressure01(v), setSpeed(mmPerS),
  setToolActive(id),
  tip(text, { tone, ms } = {}),           // 温和提示，禁止刺眼红字
  showHarvest(list),                      // 结算：本次取出的耵聍
  setExpressionHint(name),
  openPanel(id), closePanel(id),
  setBgm(id), setVolume(patch),
  setFpsHint(v),
  Update(dt),
  dispose(),
};
```

### 5.9 lead 侧（供参考，别人不用改）

- `Script_Core.js` → `CreateCore({ canvas, quality })` 渲染器 / 场景 / 循环 / 分级降载
- `Script_Input.js` → `CreateInput({ dom, camera })` 产出归一化指针、双指缩放、旋转、
  陀螺仪微调；把「拖拽」翻译成工具位移，「捏合」翻译成进深
- `Script_Camera.js` → `CreateCameraRig({ camera, canal })`，
  `setMode("shop"|"canal"|"macro")`，`Update(dt, { toolTip, focusDepth })`
- `Script_Session.js` → 回合流程、评分、成就、结算

## 6. 交叉验收（lead 负责，但你要自己先跑通）

### 可玩性与视图约定（2026-09-11）

- 工具 `tip` 是模型局部坐标，Hand 放置时必须计入 group.scale；显示尖端与接触点一致。
- `Hand.SetViewClip(camera, mode)` 在相机更新后按实际视平面裁掉近镜头的器械；店内关闭裁切。
- 店内与耳道切换直接落到安全机位，不穿过角色或墙体；耳道缩放不越过管口或鼓膜。
- Wax 的高度沿内法线长向管腔，保存原始管壁基点后再变形；读取缓存空间向量立即复制。
- `Wax.Probe` 接收 BuildTool 返回值并读取 `tool.spec`，`motion.actionHeld` 驱动清理；`removeNow` 是本帧真实取出量。
- UI 的 `action` 路由包括 `workStart/workEnd`、`toggleFine`、`shop`、`finish`；机位按钮走 `camera(mode)`。
- 店内角色按床位单独摆放，隐藏耳道、耵聍和工具；回内窥时恢复耳道坐标系。
- 滴耳液开局可用，避免硬结所需工具被锁导致无法通关。清理到 99.9% 后自动收工。
- 无独立日程面板时直接接待当前客人；小铺可切换未完成客人，结算后能继续下一位。
- 仪表只占边缘，中央画布接收拖动；角色小窗每帧完整合成且单独清色、清深度。

1. `node scripts/Script_LocalPreview.mjs --no-open` 起本地服，打开
   `http://127.0.0.1:<port>/EarSpa3D/index.html`，页面必须无 console 报错。
2. 手机验收用 `--lan`，扫输出的局域网地址。
3. 每个模块交付时必须给出：它导出什么、在浏览器里怎么被验证到、截图或数值证据。
4. 不许为了让页面「不报错」而降级成空实现；宁可少做几个工具，也不做一个假的。
