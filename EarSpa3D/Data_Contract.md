# EarSpa3D · 接口契约与协作边界

《采耳物语 · 3D 采耳 ASMR 解压游戏》的模块契约。**任何 Subagent 动手前先读本文件**；
不在本文件里的跨模块引用一律视为越界。改契约要先改本文件，再改实现。

## 0. 一句话产品定义

### 2026-09-11 拟物采耳与经营重设计（当前入口，以本节为准）

ear010 补充：取出镜头与开场共用实时头部和耳廓；移除侧脸图片。耳垢按客人种子生成黏附层、长薄片、硬结及天然细屑。左键按住沿工具当前方向施力，右键拖动在固定接触点旋转；移动端显式转向/施力模式。锚点按实际形态配置、240 Hz 子步；切割方向由抓点和局部拉力决定，可递归三代（比旧版多两级），以切割体积比例分配质量，总清洁质量保持 9。白灰色密集耳毛根部固定、末梢轻微运动。

ear009 历史补充：用户最后明确选择全套写实拟物，取代此前治愈 UI。新增 Script_ToolContact.js、Script_TactileMaterials.js 与 Script_InstrumentShop.js。旧版资产见 [Data_TactileAssets.md](./Data_TactileAssets.md)，当前实现与边界见 [Data_DirectionalAssets.md](./Data_DirectionalAssets.md)。

- 六种工具的尖端、夹臂、杆身参与表面约束及分步扫掠；输入目标与可见工具共用修正位姿。审计另外检查完整顶点及真实壁面射线。
- 三套 Blender 器形各有独立生成的三视图，覆盖五级升级；羽毛工具另有独立三视图；小铺提供当前/下一等级的三维比较、工作端和握柄特写，购买沿用原有存档与效果。木、玉皮肤仅影响握柄。
- 皮肤、蜡质与握柄绑定完整生成式 PBR 通道。皮肤采用薄层 SSS 近似、AO 与网格阴影；干拉局部红肿，软化形成渐进湿膜。不能宣称扫描级素材或无限精度物理。
- 检查灯默认关闭，开启后随鼠标/触屏指向照明。取出后由实时客人头部承接耳外收集视角，避免只留下空场景。
- 客人反馈独立折叠、保留本次服务的满意度变化记录；器具小铺与声音设置是两个独立对话框，打开任一面板都会暂停操作。
- 新增 Script_TactileDetailTest.mjs，覆盖灯光真实像素、湿润、独立小铺、升级、反馈和 48 组整件工具网格接触审计。


固定方向：**真实接触与受力 → 因材质选择手法 → 松脱或真实碎裂 → 带出/吸入 → 清洁反馈 → 满意度结算 → 购置工具与皮肤**。
只沿清晰度、空间一致性、触感、声音、反馈和经营推进迭代，不回退到固定向下拖、累计手势里程或缩小消除。

- 当前入口是 Script_ChunkGame.js、Script_ImmersiveScene.js、Script_PeelPhysics.mjs、Script_FractureGeometry.js 与 Style_Chunk.css。
- 耳廓参照实拍与 Gray 解剖图在 BlenderMCP 建模，耳道有厚度、膜、360 根浅灰白毛发；纹理与耳垢追求自然材质。
  当前用户的写实要求取代历史“可爱琥珀糖”约定。保留暖光和舒适体验，无需血腥表现。
- 1 单位 = 1 毫米；手指/鼠标射线决定工具抓点与平面位移，9／13 个形态锚点与力矩决定原生块松脱，碎片使用独立尺寸锚点。
  耳勺从边缘托干薄片，对湿块/硬块只松边；镊子夹湿块，硬夹干片会裂。
  未软化硬结的粘附更强，强拉先痛再裂，客人抱怨并扣满意度；滴液约 3 秒逐步渗透。
  每局包含 108 粒微屑，初始及迁移存档免费配羽毛工具，只有羽毛能成片带走最细碎屑。柔毛刷沿切向扫松较大的干碎片；吸引管只能吸入湿碎屑，几何经喷嘴遮挡进入滤芯。
- 碎裂切开真实三角面并封住切口，按实际拉扯方向分成数量不定的独立碎片，可继续细裂至第三代，短暂散开沉降后仍须逐片清理。
  状态包含 attached / peeling / returning / held / carrying / dropping / collected / fractured / settling。
  清洁度按收集质量累计，母块被切开不增加清洁量，所有后代碎片合计保留母块的质量。
- 松脱后仍由工具持住，松手启用托送辅助，沿耳道带出，重力落盘。
  吸引是独立收集路径，进入滤芯后计数。普通取出保持尺寸，正常深度测试与碰撞支撑。
- 常驻 HUD 是小型顶部状态和浮动工具栏，画面占满视口；成功有清洁增量、音效、短促触觉与客人反馈。
  服务上限 210 秒，小铺/设置暂停；到时按实际清洁度与满意度结算，未落盘不计收益。结算卡让出收集盘。满意度影响小费、声望与下位客人；接待、收款、采购、下一位形成闭环。
- 继续使用 earspa3d.shop.v1 存储键，版本 2 增加工具库存、每件工具独立皮肤与装备状态，
  兼容旧存档的金币、等级和天数。毛刷 48，吸引管 85；胡桃木 28、白玉 45，原色免费。
- 离线声音只用 Volcengine seed-audio-1.0；接触/撕开/疼痛/落盘由实际事件触发。
  保留现场 WebAudio 连续接触声。移动端低档仍有抗锯齿与最高 2 倍像素密度，持续慢帧先关闭阴影。
- 验收：Script_PeelPhysicsTest.mjs、Script_EconomyTest.mjs、Script_ChunkPlayTest.mjs、
  Script_TactilePlayTest.mjs（桌面与 --touch）。包括真实指针/CDP 触屏、不同材质、
  碎裂后整局、质量守恒、满意度、库存持久化及真实操作的音频电平。
  1000×900、390×844、320×568、844×390，查溢出、UI 占比与三角面/绘制预算。
  普通页只读 __EarSpaProbe；仅 debug=1 页有可写测试入口。
  截图和 JSON 报告留本地 _dev；信号检测不能代替人的主观试听。

## 1. 当前美术基调

自然耳廓、皮纹与蜡质优先，使用有真实材质层次的器具与轻量拟物 HUD。
参考、源工程及可重建脚本见 Data_ImmersiveAssets.md。
以下旧模块接口供兼容维护使用；已被 §0 替代的玩法、美术与历史人员归属不再约束当前入口。

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

下表记录旧模块职责，不代表本任务的人员分工；修改依赖时同步消费方与验证。

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
