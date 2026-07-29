# 《黑石峪 · 一九四三年冬》· 模块契约（本项目唯一 API 事实源）

> 本文件由首席架构师产出。**所有 agent 必须严格照此实现**：签名不许改、字段不许改名、所有权不许越界。
> 需要别人没提供的能力 → 写进第十节「跨模块需求」，**不要自己发明 API，也不要去改别人的文件**。
> 上位文档：仓库根 `AGENTS.md`（命名/提交/worktree）与制作纲领 `Brief.md`（创意）。冲突时：红线 > 纲领 > 本文件 > 个人判断。

项目根：`/home/user/bentleyblanks_Claude_Blackstone1943_20260729/Blackstone1943/`
线上：`https://bentleyblanks.github.io/Blackstone1943/`

---

## 一、项目定位与红线

**定位**：Three.js（r185，已 vendor）第三人称敌后潜行动作冒险。1943 年冬，华北敌后虚构村庄「黑石峪」。三幕垂直切片全部可玩通，一周目 20—30 分钟。核心资产是**沈铁（38 岁侦察排长）与冯小满（13 岁儿童团员）的情感张力**：累赘 → 搭档 → 他为她违背命令。

**红线（原样保留，违反即返工；视觉/剧情 agent 有一票否决权）**

1. **侵略责任明确**：日本侵略军与伪军是加害方，不做"双方各有苦衷"式模糊。**违反即返工**
2. **不猎奇展示苦难**：不出现尸体特写、血肉、性暴力、虐杀镜头；暴力的重量用声音、留白、事后痕迹表达。**违反即返工**
3. **平民伤亡与苦难永不计分、不转化为资源或奖励**，只进入"代价"记录。**违反即返工**
4. **拒绝抗日神剧**：主角不是超人，会疼会怕会打空；一个鬼子兵也很难打；正面交火几乎必死。潜行与逃脱永远优于突突突。**违反即返工**
5. **村庄、人物为虚构复合体**，不影射具体真实县份与个人。**违反即返工**
6. **敌兵是被军国主义驱动的具体的人**，不做小丑化处理；但绝不为侵略行为开脱。**违反即返工**

**工程红线（同样违反即返工）**

7. **零外部运行时依赖**：不外链 CDN / 字体 / 图片 / 音频。所有美术与音频程序化生成（Canvas2D 贴图 + 程序化几何 + WebAudio 合成）。
8. **不碰 `vendor/`**；importmap 固定为 `{"three":"./vendor/three/build/three.module.js","three/addons/":"./vendor/three/examples/jsm/"}`。
9. **命名**：文件/函数 PascalCase，变量/参数 lowerCamelCase，禁止连字符，类别前缀 `Script_ / Data_ / Style_ / Texture_`。玩家可见文本中文，代码标识符全英文。
10. **一个文件只有一个 owner**（见第二节）。跨模块通信走事件总线，不互相 import 玩法模块。
11. **无 console 报错、无未捕获 Promise**；每个 `.mjs` 写完必须 `node --check` 通过，`node Blackstone1943/Script_SmokeTest.mjs` 必须通过。

**台词纪律**：克制、具体、有生活质感（"先把鞋绑紧" > "我们一定会赢"）。**禁止口号腔、禁止说教、禁止爽台词。**

---

## 二、文件所有权表

一个文件 = 一个 owner。**非 owner 一行都不许改**（含格式化、加注释、"顺手修 bug"）。

| # | 文件 | 领域 | Owner |
|---|---|---|---|
| 1 | `Script_Config.mjs` | 全部可调常量（唯一数值源） | **AgentFoundation** |
| 2 | `Script_Math.mjs` | 随机/噪声/缓动/几何工具（**禁止 import three**） | **AgentFoundation** |
| 3 | `Script_Event.mjs` | 事件总线 + 事件名常量 | **AgentFoundation** |
| 4 | `index.html` | 页面外壳 / HUD DOM 骨架 / importmap | **AgentBoot** |
| 5 | `Script_Boot.mjs` | 装配、ctx 创建、主循环、生命周期 | **AgentBoot** |
| 6 | `Script_SmokeTest.mjs` | node 冒烟测试（**禁止 import three / DOM**） | **AgentBoot** |
| 7 | `Script_Art.mjs` | 渲染栈：材质库/贴图/光照/雾/天空/后处理/天气/特效 | **AgentArt** |
| 8 | `Script_World.mjs` | 地形/村庄/碰撞/导航/掩体/视线/遮挡/交互物 | **AgentWorld** |
| 9 | `Script_Character.mjs` | 程序化骨骼角色 + 动画状态机（玩家与 NPC 共用） | **AgentCharacter** |
| 10 | `Script_Player.mjs` | 第三人称控制器 + 相机 + 输入（含触屏） | **AgentPlayer** |
| 11 | `Script_EnemyAi.mjs` | 感知/状态机/小队协同/搜索/军犬/探照灯 | **AgentEnemy** |
| 12 | `Script_Combat.mjs` | 武器/近战/投掷/伤害/潜行处决 | **AgentSystems** |
| 13 | `Script_Rules.mjs` | 纯逻辑（**禁止 import three / DOM**）：任务机、生存数学、探测数学、结算、存档 | **AgentSystems** |
| 14 | `Script_Survival.mjs` | 资源/合成/体温/失血/背包 | **AgentSystems** |
| 15 | `Script_Story.mjs` | 剧情导演 + 小满伴随 AI + 字幕调度 | **AgentStory** |
| 16 | `Data_Story.mjs` | 全部叙事文本/对白/章节数据（纯数据，**零 import**） | **AgentStory** |
| 17 | `Script_Audio.mjs` | WebAudio 程序化音效与音乐（零音频文件） | **AgentInterface** |
| 18 | `Script_Hud.mjs` | HUD/菜单/字幕/无障碍/触屏控件绑定 | **AgentInterface** |
| 19 | `Style_Game.css` | 全部 UI 样式（含移动端与无障碍） | **AgentInterface** |
| — | `vendor/**` | three.js r185 | **只读，任何人不许改** |
| — | `AGENTS.md` | 本契约 | **AgentArchitect**（他人只能追加第十节） |

**16 个带公开 API 的 `.mjs` 模块**（第五节逐个写死签名）：Config、Math、Event、Boot、Art、World、Character、Player、EnemyAi、Combat、Survival、Rules、Story、Data_Story、Audio、Hud。

---

## 三、依赖 DAG（禁止循环 import）

```
叶子（谁都能 import，自身不 import 任何项目文件）：
  Script_Config.mjs     零 import
  Script_Math.mjs       零 import（禁止 import three）
  Script_Event.mjs      零 import
  Data_Story.mjs        零 import

Script_Art        → three, Config, Math
Script_World      → three, Config, Math, Art
Script_Character  → three, Config, Math, Art
Script_Rules      → Config                       （纯：禁止 three / Art / World / DOM）
Script_Survival   → Config, Rules, Event
Script_Combat     → three, Config, Math, Event, Character
Script_EnemyAi    → three, Config, Math, Event, Character
Script_Player     → three, Config, Math, Event, Character
Script_Story      → Config, Event, Data_Story, Rules
Script_Audio      → Config, Math, Event
Script_Hud        → Config, Event, Rules, Data_Story
Script_Boot       → three + 以上全部
Script_SmokeTest  → Config, Math, Event, Rules, Data_Story（仅这五个）
```

**规则**

- 上表未列出的 import 一律禁止。特别地：**World 不 import Character/Player/EnemyAi**；**EnemyAi 不 import World/Player**；**Story 不 import three/Character/World**。
- 需要别的模块的运行时能力，一律通过 `ctx.xxx` 取（Boot 已挂好）或通过事件总线，**不加 import**。
  - 例：Story 要造小满的模型 → `ctx.characters.Spawn('FengXiaoman', {...})`，不 import `Script_Character.mjs`。
  - 例：EnemyAi 要导航/视线 → `ctx.world.FindPath(...)` / `ctx.world.HasLineOfSight(...)`。
  - 例：Hud 要开火 → 不调 Combat，监听 `GunFired` 事件。
- `Script_Rules.mjs` 与 `Data_Story.mjs` 必须能在 **纯 node** 下 import（无 DOM、无 WebGL、无 three）。Rules 的向量参数一律用普通对象 `{x,y,z}`，**不许出现 `THREE.Vector3`**。
- 只读 three 类型引用（`ctx.THREE`）不算 import，但 Rules/Data_Story/SmokeTest 连这个都不许用。

---

## 四、共享上下文 `ctx`

由 `Script_Boot.mjs` 创建，逐帧作为第二参数传给所有 `Update(dt, ctx)`。**任何模块不得往 ctx 上挂自定义字段**（需要就写进第十节，由 Boot owner 加）。

装配分四个阶段，字段可用性以阶段为准：**P0 = 上下文构建**、**P1 = 渲染栈**、**P2 = 世界与角色**、**P3 = 玩法与表现**、**RT = 每帧刷新**。

| 字段 | 类型 | 创建者 | 可用阶段 | 说明 |
|---|---|---|---|---|
| `ctx.THREE` | `typeof THREE` | Boot | P0 | three 命名空间；Rules/Data_Story/Hud 不得使用 |
| `ctx.version` | `string` | Boot | P0 | 构建版本串，用于缓存与 HUD 角标 |
| `ctx.config` | `Config` | Foundation | P0 | 只读常量树，**运行时禁止写** |
| `ctx.bus` | `EventBus` | Foundation | P0 | 事件总线 |
| `ctx.random` | `Random` | Math | P0 | 主随机源（种子来自 chapter.worldSeed） |
| `ctx.clock` | `THREE.Clock` | Boot | P0 | — |
| `ctx.canvas` | `HTMLCanvasElement` | Boot | P0 | — |
| `ctx.mount` | `HTMLElement` | Boot | P0 | 挂载根（`#GameRoot`） |
| `ctx.isMobile` | `boolean` | Boot | P0 | 触屏 + 窄屏判定 |
| `ctx.quality` | `'low'\|'medium'\|'high'` | Boot | P0 | 初值由设备猜测，Art 可回调降级 |
| `ctx.debug` | `Debug` | Boot | P0 | `{enabled, flags:Set<string>, Log(tag,...args), Watch(key,value), gizmos:THREE.Group}` |
| `ctx.save` | `SaveApi` | Boot | P0 | `{Load():object\|null, Save(obj):boolean, Clear():void, key:string}` |
| `ctx.renderer` | `THREE.WebGLRenderer` | Art | P1 | — |
| `ctx.scene` | `THREE.Scene` | Art | P1 | — |
| `ctx.camera` | `THREE.PerspectiveCamera` | Art | P1 | Player 每帧驱动其 transform |
| `ctx.art` | `Art` | Art | P1 | — |
| `ctx.rules` | `Rules` | Rules | P1 | 纯逻辑，早于世界即可用 |
| `ctx.world` | `World` | World | P2 | 章节切换会**整体替换**此对象 |
| `ctx.characters` | `CharacterFactory` | Character | P2 | 角色工厂（**纲领 ctx 清单的架构补充**） |
| `ctx.audio` | `Audio` | Audio | P2 | 未 Unlock 前所有播放静默返回 null |
| `ctx.input` | `Input` | Player | P3 | — |
| `ctx.player` | `Player` | Player | P3 | 装配后才有；P2 及之前禁止访问 |
| `ctx.survival` | `Survival` | Survival | P3 | — |
| `ctx.combat` | `Combat` | Combat | P3 | 需要 ctx.player 已存在 |
| `ctx.enemies` | `EnemyDirector` | EnemyAi | P3 | — |
| `ctx.story` | `Story` | Story | P3 | — |
| `ctx.companion` | `Companion` | Story | P3 | `=== ctx.story.companion`；第一幕开场前为 `null` |
| `ctx.hud` | `Hud` | Hud | P3 | — |
| `ctx.dt` | `number` | Boot | RT | 已 clamp 到 `[0, config.Loop.maxDeltaSeconds]`，已乘 timeScale |
| `ctx.rawDt` | `number` | Boot | RT | 未缩放的真实帧时间 |
| `ctx.elapsed` | `number` | Boot | RT | 游戏内累计秒（暂停不走） |
| `ctx.frame` | `number` | Boot | RT | 帧序号，从 0 起 |
| `ctx.timeScale` | `number` | Boot | RT | 慢动作/hitstop 用，默认 1 |
| `ctx.paused` | `boolean` | Boot | RT | 暂停时只跑 hud/audio/art.Render |

**读写纪律**：`ctx.dt / rawDt / elapsed / frame / timeScale / paused / quality` 只有 Boot 能写；`ctx.timeScale` 通过 `ctx.bus.Emit('RequestTimeScale',{scale,seconds})` 请求修改。其余字段全部只读引用。

---

## 五、模块公开 API（16 个模块逐个写死）

统一形状：`export function CreateXxx(ctx, options) { return { Update(dt, ctx), Dispose(), /* 公开 API */ } }`。
所有 `Update(dt, ctx)` 返回 `void`。所有 `Dispose()` 必须释放 geometry/material/texture/事件订阅/DOM/AudioNode。
签名里 `Vector3` = `THREE.Vector3`；`Vec3Like` = `{x:number,y:number,z:number}` 普通对象。

---

### 5.1 `Script_Config.mjs` — AgentFoundation

```js
/** 唯一数值源。运行时只读；任何硬编码数值都应搬进这里。 */
export const Config: ConfigTree

/** 点路径读取，如 GetTuning('Stealth.Noise.gunshotRifle', 40) */
export function GetTuning(path: string, fallback?: any): any

/** 章节相关的数值覆盖（Boot 在换章时调用），返回合并后的只读快照 */
export function ApplyChapterOverrides(chapterId: string): ConfigTree

/** 设备档位覆盖：'low' | 'medium' | 'high' */
export function ApplyQualityPreset(level: string): ConfigTree
```

`ConfigTree` 必须包含以下顶层分组（字段名固定，值可调；未列出的可自行增补）：

```js
Config.Loop        = { targetFps: 60, maxDeltaSeconds: 0.05, fixedStep: 1/60, hitstopMaxSeconds: 0.12 }
Config.Render      = { shadowMapSize: 1024, shadowDistance: 45, pixelRatioCap: 2, fogNear: 12, fogFar: 90,
                       toneMappingExposure: 1.05, bloomStrength: 0.35, vignette: 0.42, filmGrain: 0.05 }
Config.Camera      = { fov: 58, aimFov: 42, near: 0.1, far: 400, shoulderOffset: {x:0.62,y:1.52,z:0}, distance: 3.1,
                       aimDistance: 1.65, crouchHeightOffset: -0.42, followLambda: 9, breathAmplitude: 0.011,
                       handheldAmplitude: 0.006, collisionRadius: 0.28 }
Config.Player      = { walkSpeed: 1.85, runSpeed: 4.40, crouchSpeed: 1.05, proneSpeed: 0.55, aimSpeed: 1.15,
                       acceleration: 14, deceleration: 18, radius: 0.34, height: 1.76, eyeHeight: 1.62,
                       crouchHeight: 1.18, proneHeight: 0.55, stepHeight: 0.42, turnLambda: 12,
                       injuredSpeedScale: 0.72, vaultMaxHeight: 1.25 }
Config.Stealth     = { Noise: { footstepWalk: 3, footstepRun: 9, footstepCrouch: 1.2, footstepProne: 0.5,
                                gunshotRifle: 40, gunshotPistol: 34, boltCycle: 6, stone: 12, grenade: 45,
                                meleeHit: 8, stealthKill: 5, doorOpen: 6, doorForce: 14, vault: 4, craft: 2,
                                container: 4, dogBark: 25, companionMove: 1.6 },
                       alertYellow: 0.34, alertRed: 0.75, alertRiseBase: 0.55, alertDecayPerSecond: 0.12,
                       alertGraceSeconds: 3.0, alertMemorySeconds: 22,
                       concealmentCrouchBonus: 0.30, concealmentProneBonus: 0.45,
                       footprintLifeSeconds: 90, footprintNoticeRange: 4.5 }
Config.Enemy       = { viewRangeDay: 22, viewRangeDusk: 14, viewRangeNight: 9, viewHalfAngleDeg: 55,
                       peripheralHalfAngleDeg: 100, peripheralScale: 0.35, hearingRangeScale: 1.0,
                       searchSeconds: 26, searchRadius: 11, squadCallRadius: 30, reactionSeconds: 0.55,
                       fireIntervalSeconds: 1.9, accuracyBase: 0.32, accuracyRamp: 0.06, health: 100,
                       flashlightRange: 26, flashlightHalfAngleDeg: 18, searchlightRange: 55, dogViewScale: 0.6,
                       dogScentRange: 14 }
Config.Combat      = { AmmoBudget: { total: 12, chapter1: 2, chapter2: 4, chapter3: 6 },
                       hitstopSeconds: 0.09, meleeLightDamage: 34, meleeHeavyDamage: 62, meleeStaminaLight: 12,
                       meleeStaminaHeavy: 24, blockStaminaPerHit: 18, dodgeStamina: 16, dodgeIFrames: 0.32,
                       stealthKillSeconds: 1.35, stealthKillCooldown: 4.0, stealthKillConeDeg: 80,
                       stealthKillRange: 1.35, grenadeRadius: 5.5, grenadeDamage: 120, throwChargeMax: 1.2 }
Config.Survival    = { maxHealth: 100, maxStamina: 100, maxWarmth: 100, maxHunger: 100,
                       bleedPerSecond: 1.6, healthRegenPerSecond: 0.0, staminaDrainRun: 11, staminaRegen: 9,
                       staminaRegenDelay: 1.1, warmthDrainBlizzard: 1.1, warmthDrainOpen: 0.45,
                       warmthGainFire: 6.0, warmthLowThreshold: 30, hungerDrainPerSecond: 0.08,
                       inventorySlots: 10, interactSeconds: 1.4, craftSeconds: 2.2 }
Config.World       = { tileSize: 2, chunkSpan: 128, navGridStep: 1.0, groundFriction: 1,
                       coverLowHeight: 0.95, coverHighHeight: 1.75, lootDensity: 0.55 }
Config.Weather     = { LightSnow: {...}, Overcast: {...}, Blizzard: {...} }   // 见 Art.SetWeather
Config.Audio       = { masterVolume: 0.8, busMusic: 0.55, busSfx: 0.9, busAmbience: 0.6, busVoice: 1.0,
                       maxVoices: 24, rolloffRefDistance: 4, rolloffMaxDistance: 60 }
Config.Hud         = { subtitleSeconds: 3.2, subtitleMinSeconds: 1.6, toastSeconds: 2.4,
                       promptFadeSeconds: 0.12, fontScale: 1.0, safeAreaPadding: 16 }
Config.Save        = { key: 'blackstone1943_progress_v1', settingsKey: 'blackstone1943_settings_v1', version: 1 }
Config.Debug       = { enabled: false, showNav: false, showCovers: false, showViewCones: false, showStats: false }
```

---

### 5.2 `Script_Math.mjs` — AgentFoundation

**禁止 import three。** 纯数字与普通对象。

```js
export const Tau: number                              // 6.283185307179586
export const DegToRad: number
export const RadToDeg: number

/** 确定性随机（xorshift128 / sfc32），同种子必须逐位可复现 */
export function CreateRandom(seed: number | string): Random
Random = {
  seed: number,
  Next(): number,                                     // [0,1)
  Range(min: number, max: number): number,
  Int(minInclusive: number, maxExclusive: number): number,
  Pick<T>(list: Array<T>): T,
  PickWeighted<T>(list: Array<T>, weights: Array<number>): T,
  Shuffle<T>(list: Array<T>): Array<T>,               // 原地
  Chance(probability: number): boolean,
  Sign(): number,                                     // -1 或 1
  Unit2(): { x: number, y: number },
  Gauss(mean?: number, deviation?: number): number,
  Fork(tag: string): Random,                          // 派生子流，互不干扰
  Reset(seed?: number): void,
}

// —— 噪声（确定性、无状态） ——
export function Hash1(x: number): number              // [0,1)
export function Hash2(x: number, y: number): number   // [0,1)
export function Hash3(x: number, y: number, z: number): number
export function Noise2(x: number, y: number): number  // value noise, [-1,1]
export function Fbm2(x: number, y: number, octaves?: number, lacunarity?: number, gain?: number): number
export function Ridge2(x: number, y: number, octaves?: number): number
export function Worley2(x: number, y: number): number // 最近特征点距离，[0,1]
export function Curl2(x: number, y: number, out?: object): { x: number, y: number }

// —— 标量 ——
export function Clamp(value: number, min: number, max: number): number
export function Clamp01(value: number): number
export function Lerp(a: number, b: number, t: number): number
export function InvLerp(a: number, b: number, value: number): number
export function Remap(value: number, inMin: number, inMax: number, outMin: number, outMax: number): number
export function SmoothStep(edge0: number, edge1: number, x: number): number
export function SmootherStep(edge0: number, edge1: number, x: number): number
export function MoveTowards(current: number, target: number, maxDelta: number): number
export function Damp(current: number, target: number, lambda: number, dt: number): number  // 帧率无关指数逼近
export function SmoothDamp(current: number, target: number, velocityRef: { value: number },
                           smoothTime: number, dt: number, maxSpeed?: number): number
export function Approach(current: number, target: number, riseRate: number, fallRate: number, dt: number): number

// —— 角度 ——
export function WrapAngle(radians: number): number     // 归一到 (-PI, PI]
export function AngleDelta(from: number, to: number): number
export function LerpAngle(from: number, to: number, t: number): number
export function DampAngle(current: number, target: number, lambda: number, dt: number): number

// —— 缓动 ——
export function EaseInQuad(t), EaseOutQuad(t), EaseInOutQuad(t): number
export function EaseInCubic(t), EaseOutCubic(t), EaseInOutCubic(t): number
export function EaseOutBack(t), EaseOutElastic(t), EaseOutBounce(t): number
export function PingPong(t: number, length: number): number

// —— 平面几何（XZ 平面，y 忽略） ——
export function Distance2(ax: number, az: number, bx: number, bz: number): number
export function DistanceSq2(ax: number, az: number, bx: number, bz: number): number
export function Direction2(fromX, fromZ, toX, toZ, out?: object): { x: number, z: number }  // 已归一
export function PointInCone(fromX, fromZ, dirX, dirZ, toX, toZ,
                            halfAngleRadians: number, range: number): boolean
export function ConeFalloff(fromX, fromZ, dirX, dirZ, toX, toZ,
                            halfAngleRadians: number, range: number): number  // [0,1]，0 = 视野外
export function SegmentPointDistance(ax, az, bx, bz, px, pz): number
export function SegmentCircleHit(ax, az, bx, bz, cx, cz, radius: number): boolean
export function ClosestPointOnSegment(ax, az, bx, bz, px, pz, out?: object): { x: number, z: number }
export function RotatePoint2(x: number, z: number, radians: number, out?: object): { x: number, z: number }

// —— 表现辅助 ——
export function Wobble(time: number, seed?: number): number             // [-1,1] 平滑抖动
export function Shake2(time: number, seed?: number, out?: object): { x: number, y: number }
export function Breath(time: number, rate: number, amplitude: number): number
export function CreateSpring(stiffness: number, damping: number): Spring
Spring = { value: number, velocity: number, target: number, Update(dt: number): number, Reset(value: number): void }
```

---

### 5.3 `Script_Event.mjs` — AgentFoundation

```js
export function CreateEventBus(options?: { debug?: boolean, historyLimit?: number }): EventBus

EventBus = {
  /** 返回退订函数；priority 越大越先收到，默认 0 */
  On(name: string, handler: (payload: object) => void, options?: { once?: boolean, priority?: number }): (() => void),
  Once(name: string, handler: (payload: object) => void): (() => void),
  Off(name: string, handler: (payload: object) => void): void,
  /** 同步派发。必须对重入安全（handler 内 Emit / On / Off 不得破坏本次遍历） */
  Emit(name: string, payload?: object): void,
  /** 入队，由 Boot 在每帧固定点调用 Flush() 统一派发；用于避免 Update 中途改状态 */
  EmitLater(name: string, payload?: object): void,
  Flush(): void,
  Clear(name?: string): void,
  ListenerCount(name: string): number,
  History(name?: string, limit?: number): Array<{ name: string, payload: object, time: number }>,
  SetDebug(enabled: boolean): void,
  Dispose(): void,
}

/** 事件名常量表。所有 Emit/On 必须用 EventNames.Xxx，不许写字符串字面量。 */
export const EventNames: Readonly<Record<string, string>>
```

`EventNames` 的键与值同名，覆盖第六节全部事件。

---

### 5.4 `Data_Story.mjs` — AgentStory

**零 import。纯数据 + 纯查表函数。禁止任何副作用、禁止 Math.random。**

```js
export const StoryChapters: Array<Chapter>            // 三幕，顺序即游玩顺序
export const StoryBeats: Record<string, Beat>         // beatId → Beat
export const Dialogue: Record<string, DialogueLine>   // lineId → 单条台词
export const DialogueSets: Record<string, Array<string>>  // setId → lineId[]（成组播放）
export const BarkTables: Record<string, Array<string>>    // barkId → lineId[]（情境随机）
export const ItemCatalog: Record<string, { name: string, description: string, stack: number, weight: number,
                                            kind: 'Consumable'|'Material'|'Ammo'|'Weapon'|'Key'|'Story' }>
export const RecipeCatalog: Record<string, Recipe>
export const UiStrings: Record<string, string>        // HUD 全部中文文案
export const CostLedgerLabels: Record<string, string> // 代价记录条目名（永不计分）
export const EndingCatalog: Record<string, Ending>

export function FindChapter(chapterId: string): Chapter | null
export function FindBeat(beatId: string): Beat | null
export function GetLine(lineId: string): DialogueLine | null
export function GetBarks(barkId: string): Array<string>          // 找不到返回 []
export function GetItem(itemId: string): object | null
export function GetText(key: string, fallback?: string): string
export function ListChapterIds(): Array<string>

DialogueLine = {
  id: string,
  speaker: 'ShenTie' | 'Xiaoman' | 'Radio' | 'Narrator' | 'Enemy',
  text: string,                     // 中文，克制、具体
  duration?: number,                // 秒，缺省由字数推算
  emotion?: 'Flat'|'Low'|'Tense'|'Warm'|'Sharp'|'Broken',
  requires?: { beatDone?: string, flag?: string, notFlag?: string },
  setsFlag?: string,
}

Beat = {
  id: string,
  chapterId: string,
  trigger: { kind: 'Enter'|'Objective'|'Event'|'Timer'|'Manual',
             anchorId?: string, radius?: number, objectiveId?: string,
             eventName?: string, seconds?: number },
  once: boolean,
  lines?: Array<string>,            // lineId[]
  cinematic?: { cameraAnchorId?: string, seconds?: number, letterbox?: boolean, lockInput?: boolean },
  companionMode?: string,           // 见 Companion.SetMode
  objectiveId?: string,             // 触发后激活的目标
  musicState?: string,
  choiceId?: string,                // 非空则弹选择
  ledger?: Array<string>,           // 写入代价记录的条目 key
}

Ending = { id: string, title: string, lines: Array<string>, tone: 'Bitter'|'Quiet'|'Costly' }
Recipe = { id: string, name: string, inputs: Array<{ id: string, count: number }>,
           output: { id: string, count: number }, seconds: number, noiseRadius: number, requiresFire?: boolean }
```

`Chapter` / `Objective` 结构见第八节。

---

### 5.5 `Script_Rules.mjs` — AgentSystems

**纯逻辑。禁止 import three、禁止碰 DOM、禁止 `Math.random()`（用传入的 random 或纯函数）。必须能在 node 里直接跑。**

```js
export function CreateRules(options?: { config?: object, chapters?: Array<object> }): Rules

Rules = {
  state: RulesState,

  // —— 章节与目标 ——
  StartChapter(chapterId: string, chapterData: object): void,
  GetChapterId(): string,
  GetObjectives(): Array<Objective>,
  GetActiveObjective(): Objective | null,
  SetActiveObjective(objectiveId: string): boolean,
  ReportProgress(objectiveId: string, amount: number): Objective | null,
  CompleteObjective(objectiveId: string): boolean,
  FailObjective(objectiveId: string, reason: string): boolean,
  IsObjectiveDone(objectiveId: string): boolean,
  IsChapterComplete(): boolean,
  AdvanceChapter(): string | null,                      // 返回下一 chapterId，无则 null

  // —— 节拍与旗标 ——
  MarkBeat(beatId: string): boolean,                    // 已标记返回 false
  IsBeatDone(beatId: string): boolean,
  SetFlag(key: string, value: any): void,
  GetFlag(key: string, fallback?: any): any,
  RecordChoice(choiceId: string, optionId: string): void,
  GetChoice(choiceId: string): string | null,

  // —— 代价记录（永不计分、永不转化为奖励） ——
  RecordCost(entryKey: string, note?: string): void,
  GetLedger(): Array<{ key: string, note: string, at: number }>,

  // —— 统计 ——
  Tally(key: string, amount?: number): void,            // 'shotsFired'|'stealthKills'|'detections'|'kills'|'reloads'
  GetStats(): Record<string, number>,
  Update(dt: number, snapshot: RulesSnapshot): Array<RulesEffect>,
  Reset(): void,
}

RulesSnapshot = { chapterId, elapsed, playerPosition: Vec3Like, playerHealth, playerWarmth, playerStamina,
                  bleeding: boolean, ammoTotal, alertLevel: 0|1|2, enemiesAlive, companionMode, indoors: boolean }
RulesEffect   = { kind: 'ObjectiveChanged'|'ChapterChanged'|'GameOver'|'StoryBeat'|'Toast', payload: object }

// —— 纯数学（无状态，供 EnemyAi / Survival / Combat / Hud 复用；必须是纯函数） ——

/** 每秒警戒增量。返回 [-1,1]，负值表示回落 */
export function ComputeDetection(params: {
  distance: number, viewRange: number, coneFalloff: number, lineOfSight: boolean,
  lightLevel: number, concealment: number, targetSpeed: number,
  crouched: boolean, prone: boolean, inCover: boolean, weather: number, alert: number
}): number

/** 噪音可听度 [0,1]。0 = 听不见 */
export function ComputeNoiseAudibility(distance: number, radius: number, occlusion: number): number

/** 由音量与遮挡得到"是否值得调查"与优先级 */
export function ScoreInvestigation(audibility: number, kind: string, alert: number): number

export function ComputeWarmthDelta(params: { exposure: number, nearFire: boolean, indoors: boolean,
                                             moving: boolean, wet: boolean, clothing: number, dt: number }): number
export function ComputeStaminaDelta(params: { sprinting: boolean, aiming: boolean, warmth: number,
                                              health: number, idleSeconds: number, dt: number }): number
export function ComputeBleedDelta(params: { bleeding: boolean, bandaged: boolean, moving: boolean, dt: number }): number

/** 伤害结算。part 影响倍率；lethal 表示本次致死 */
export function ComputeDamage(params: { baseDamage: number, part: string, distance: number, falloffStart: number,
                                        falloffEnd: number, armor: number, currentHealth: number
                                      }): { amount: number, lethal: boolean, part: string, multiplier: number }

/** 瞄准散布（弧度）。呼吸、体力、受伤、架枪、移动共同决定 */
export function ComputeAimSway(params: { holdSeconds: number, stamina: number, health: number, braced: boolean,
                                         crouched: boolean, prone: boolean, moving: boolean, warmth: number,
                                         time: number }): { spread: number, swayX: number, swayY: number }

export function ResolveCraft(recipeId: string, inventory: Array<{ id: string, count: number }>,
                             recipes: Record<string, object>, context?: { nearFire?: boolean }
                            ): { ok: boolean, reason: string, consumed: Array<object>, produced: object | null }

export function EvaluateEnding(state: RulesState): { endingId: string, ledger: Array<object>, stats: Record<string, number> }

// —— 存档 ——
export const SaveKey: string          // 'blackstone1943_progress_v1'
export const SaveVersion: number      // 1
export function SerializeProgress(state: RulesState, extra?: object): object
export function DeserializeProgress(raw: object | string): RulesState | null   // 版本不符/损坏返回 null
```

---

### 5.6 `Script_Art.mjs` — AgentArt

拥有 renderer / scene / camera / 材质库 / 贴图 / 光照 / 雾 / 天空 / 后处理 / 天气粒子 / 屏幕特效。
**质量门槛 1、2 主要由本模块负责**：冬日冷灰 + 火光暖橙的唯一暖色对比、体积雾、飘雪、景深感天际线。

```js
export function CreateArt(ctx, options?: { canvas?: HTMLCanvasElement, quality?: string }): Art

Art = {
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.PerspectiveCamera,
  effectsGroup: THREE.Group,          // 所有特效挂这里，换章不销毁
  stats: { drawCalls: number, triangles: number, programs: number, fps: number, frameMs: number },

  // —— 材质与贴图（World / Character 唯一取材质的入口；必须共享实例以控 draw call） ——
  GetMaterial(key: MaterialKey, overrides?: object): THREE.Material,
  GetTexture(key: TextureKey): THREE.Texture,
  MakeVariant(key: MaterialKey, variantId: string, overrides: object): THREE.Material,  // 缓存复用
  RegisterMaterial(key: string, material: THREE.Material): THREE.Material,

  // —— 环境 ——
  SetTimeOfDay(preset: 'Dawn'|'Noon'|'Dusk'|'Night', blendSeconds?: number): void,
  SetWeather(preset: 'Clear'|'LightSnow'|'Overcast'|'Blizzard', blendSeconds?: number): void,
  GetWeather(): { preset: string, snowRate: number, windDirection: THREE.Vector2, windSpeed: number,
                  fogDensity: number, visibility: number, ambientLight: number },
  SetWindGust(strength: number, seconds: number): void,
  GetAmbientLightLevel(position: Vector3): number,        // [0,1]，World.GetLightLevel 会调用

  // —— 动态光 ——
  CreateFireLight(position: Vector3, options?: { radius?: number, intensity?: number, flicker?: number }): LightHandle,
  CreateSpotLight(options: { position: Vector3, direction: Vector3, range: number, halfAngleDeg: number,
                             intensity?: number, kind?: 'Flashlight'|'Searchlight'|'Flare' }): LightHandle,
  CreateFlare(position: Vector3, options?: { seconds?: number, driftVelocity?: Vector3 }): LightHandle,
  LightHandle = { object: THREE.Object3D, SetPosition(v: Vector3): void, SetDirection(v: Vector3): void,
                  SetIntensity(v: number): void, SetEnabled(v: boolean): void, Dispose(): void },

  // —— 一次性特效（全部对象池化，不得每次 new） ——
  SpawnImpact(position: Vector3, normal: Vector3, surface: SurfaceKind): void,
  SpawnMuzzleFlash(position: Vector3, direction: Vector3, scale?: number): void,
  SpawnSnowBurst(position: Vector3, strength?: number): void,
  SpawnBreathPuff(position: Vector3, direction: Vector3, strength?: number): void,
  SpawnFootprint(position: Vector3, forward: Vector3, surface: SurfaceKind, side: 'L'|'R'): void,
  SpawnSmoke(position: Vector3, options?: { seconds?: number, scale?: number }): void,
  SpawnDebris(position: Vector3, count?: number, surface?: SurfaceKind): void,
  ClearTransient(): void,                                  // 换章时清空池中活动实例

  // —— 屏幕表现 ——
  ShakeCamera(strength: number, seconds: number, frequency?: number): void,
  FlashScreen(color: number, strength: number, seconds: number): void,
  SetVignette(strength: number, blendSeconds?: number): void,
  SetDamageOverlay(intensity: number): void,               // 低血/低温边缘结霜，非血
  SetAimMode(on: boolean, blendSeconds?: number): void,
  SetLetterbox(on: boolean, blendSeconds?: number): void,
  SetDesaturation(amount: number, blendSeconds?: number): void,
  SetTimeScaleVisual(scale: number): void,                 // hitstop 时的视觉配合

  // —— 生命周期 ——
  Resize(width: number, height: number, pixelRatio: number): void,
  SetQuality(level: 'low'|'medium'|'high'): void,
  GetQuality(): string,
  Render(ctx): void,                                       // 主循环唯一渲染入口
  Update(dt: number, ctx): void,                           // 特效/天气/光照推进；必须在 Render 前调
  Dispose(): void,
}
```

**`MaterialKey` 固定枚举**（World/Character 只能用这些，需要新增写进第十节）：
`'SnowGround' | 'SnowPacked' | 'Ice' | 'Dirt' | 'Mud' | 'Gravel' | 'Rock' | 'RockDark' | 'StoneWall' | 'MudWall' | 'BrickBurnt' | 'Wood' | 'WoodOld' | 'CharredWood' | 'Thatch' | 'Straw' | 'Paper' | 'ClothCoarse' | 'ClothPadded' | 'FabricGray' | 'FabricKhaki' | 'FabricBlue' | 'FabricRed' | 'Fur' | 'SkinPale' | 'SkinWeathered' | 'MetalDull' | 'MetalRust' | 'Gunmetal' | 'Glass' | 'Water' | 'Sandbag' | 'BarbedWire' | 'PaperWindow' | 'CanvasTent' | 'Foliage' | 'FoliageDead'`

**`TextureKey`** 一律 `Texture_` 前缀且程序化生成，如 `'Texture_SnowNoise'`、`'Texture_MudWall'`、`'Texture_CharredPlank'`、`'Texture_ClothWeave'`、`'Texture_PaperGrain'`。

**`SurfaceKind`**：`'Snow' | 'Ice' | 'Dirt' | 'Stone' | 'Wood' | 'Metal' | 'Cloth' | 'Water' | 'Straw'`（与 `World.SampleGroundKind` / Audio 脚步音一一对应）。

---

### 5.7 `Script_World.mjs` — AgentWorld

导航、碰撞、视线、遮挡、掩体、交互物、脚印全部由本模块提供。**EnemyAi 与 Player 完全依赖这些查询，不许自己 raycast 场景。**

```js
export function CreateWorld(ctx, options: { chapterId: string, preset: string, seed: number }): World

World = {
  group: THREE.Group,                       // 已 add 到 ctx.scene；Dispose 时整棵释放
  chapterId: string,
  preset: string,
  bounds: { minX: number, maxX: number, minZ: number, maxZ: number },

  // —— 地形采样 ——
  SampleHeight(x: number, z: number): number,
  SampleSlope(x: number, z: number): number,                    // 弧度
  SampleNormal(x: number, z: number, out?: Vector3): Vector3,
  SampleGroundKind(x: number, z: number): SurfaceKind,
  IsInsideBounds(x: number, z: number): boolean,

  // —— 移动与碰撞 ——
  /** 胶囊体扫掠 + 贴地。返回可行的最终位置（写入 out 并返回） */
  ResolveMove(from: Vector3, to: Vector3, radius: number, out?: Vector3): Vector3,
  /** 返回上次 ResolveMove 的接触信息，供踢石/贴墙判断 */
  GetLastMoveContact(): { hit: boolean, normal: Vector3, surface: SurfaceKind, blocked: boolean },
  IsPositionFree(position: Vector3, radius: number, height: number): boolean,
  SnapToGround(position: Vector3, out?: Vector3): Vector3,
  Raycast(origin: Vector3, direction: Vector3, maxDistance: number
         ): { point: Vector3, normal: Vector3, distance: number, surface: SurfaceKind, objectKind: string } | null,

  // —— 感知支持（EnemyAi 的生命线） ——
  HasLineOfSight(fromVec3: Vector3, toVec3: Vector3, ignoreY?: boolean): boolean,
  /** 部分遮挡程度 [0,1]，1 = 完全挡住。用于"只看到半个身子" */
  SampleVisibility(fromVec3: Vector3, toVec3: Vector3, targetRadius?: number): number,
  /** 噪音穿墙衰减 [0,1]，1 = 完全隔绝。墙/地窖/雪堆各有系数 */
  SampleOcclusion(fromVec3: Vector3, toVec3: Vector3): number,
  /** 藏匿度 [0,1]：草垛、断墙后、灌木、阴影 */
  SampleConcealment(position: Vector3, crouched: boolean, prone: boolean): number,
  /** 光照强度 [0,1]，含 Art 的动态光与探照灯 */
  GetLightLevel(position: Vector3): number,
  IsIndoors(position: Vector3): boolean,

  // —— 导航 ——
  FindPath(fromVec3: Vector3, toVec3: Vector3, out?: Array<object>): Array<{ x: number, z: number }>,
  FindNearestNavPoint(position: Vector3, out?: object): { x: number, z: number },
  IsNavigable(x: number, z: number): boolean,
  /** 从 origin 出发、远离 threat 的可达点（逃跑/侧翼用） */
  FindRetreatPoint(origin: Vector3, threat: Vector3, minDistance: number): Vector3 | null,
  FindFlankPoint(origin: Vector3, target: Vector3, side: -1 | 1, maxDistance: number): Vector3 | null,
  /** 搜索段落用：在 center 半径内取 count 个互相分散的可达点 */
  SampleSearchPoints(center: Vector3, radius: number, count: number): Array<Vector3>,

  // —— 掩体 ——
  covers: Array<Cover>,
  GetCoversNear(position: Vector3, radius: number): Array<Cover>,
  FindCover(fromVec3: Vector3, threatVec3: Vector3, maxDistance: number): Cover | null,
  ClaimCover(coverId: string, ownerId: string): boolean,
  ReleaseCover(coverId: string, ownerId: string): void,
  Cover = { id: string, position: Vector3, forward: Vector3, height: number,
            kind: 'Wall'|'LowWall'|'Crate'|'Rock'|'Haystack'|'Ruin'|'Cart'|'Sandbag',
            width: number, occupiedBy: string | null, canVault: boolean, canPeekLeft: boolean, canPeekRight: boolean },

  // —— 出生点与锚点 ——
  spawns: {
    playerStart: { position: Vector3, yaw: number },
    companionStart: { position: Vector3, yaw: number } | null,
    enemyPosts: Array<{ id: string, position: Vector3, yaw: number, lookArcDeg: number,
                        squadId: string, archetype: string, route: Array<Vector3> | null }>,
    lootSpots: Array<{ id: string, position: Vector3, container: string, tableId: string }>,
    storyAnchors: Record<string, { position: Vector3, yaw: number, radius: number }>,
    patrolRoutes: Record<string, Array<Vector3>>,
    coverPoints: Array<Vector3>,
    fireSpots: Array<Vector3>,
  },

  // —— 交互物 ——
  interactables: Array<Interactable>,
  RegisterInteractable(def: object): Interactable,
  QueryInteractable(position: Vector3, forward: Vector3, maxDistance: number): Interactable | null,
  SetInteractableState(id: string, state: string): boolean,
  Interactable = { id: string, position: Vector3,
                   kind: 'Door'|'Container'|'Ladder'|'Vault'|'DogHole'|'Fire'|'Lever'|'Body'|'StoryItem',
                   label: string, seconds: number, noiseRadius: number,
                   state: 'Idle'|'Open'|'Locked'|'Used'|'Broken',
                   requiresItem: string | null, companionOnly: boolean, tableId: string | null },
  SetDoorOpen(doorId: string, open: boolean): boolean,

  // —— 触发体 ——
  QueryTriggers(position: Vector3, radius: number): Array<{ id: string, kind: string, payload: object }>,

  // —— 雪地脚印（加分项；供 EnemyAi 发现） ——
  StampFootprint(position: Vector3, forward: Vector3, ownerId: string, surface: SurfaceKind): void,
  QueryFootprints(position: Vector3, radius: number, ownerId?: string
                 ): Array<{ position: Vector3, forward: Vector3, ownerId: string, age: number }>,

  Update(dt: number, ctx): void,
  Dispose(): void,
}
```

---

### 5.8 `Script_Character.mjs` — AgentCharacter

程序化骨骼（`THREE.Group` 层级，无外部模型）、程序化动画状态机。玩家、小满、伪军、日军、军犬、村民共用。
**质量门槛 3（轮廓清晰、有重量感、不能刚体滑行）由本模块负责。**

```js
export function CreateCharacterFactory(ctx, options?): CharacterFactory
CharacterFactory = {
  group: THREE.Group,
  Spawn(archetype: ArchetypeKey, options?: { seed?: number, scale?: number, palette?: object,
                                             id?: string, lod?: boolean }): Character,
  Despawn(character: Character): void,
  GetById(id: string): Character | null,
  count: number,
  Update(dt: number, ctx): void,        // 统一推进所有角色的动画与 LOD
  Dispose(): void,
}

export const ArchetypeKeys: Array<string>
// 'ShenTie' | 'FengXiaoman' | 'PuppetSoldier' | 'PuppetOfficer' | 'JapaneseSoldier' | 'JapaneseNco'
// | 'Dog' | 'Villager' | 'Courier'

export const ActionNames: Array<string>
// 移动：'Idle','Walk','Run','TurnLeft','TurnRight','CrouchIdle','CrouchWalk','ProneIdle','ProneCrawl'
// 交互：'Interact','Search','PickUp','Craft','OpenDoor','Vault','Climb','Squeeze','Land'
// 战斗：'AimRaise','AimIdle','AimLower','Fire','BoltCycle','Reload','ThrowCharge','ThrowRelease',
//       'MeleeLight','MeleeHeavy','Block','BlockHit','Dodge','TakedownAttacker','TakedownVictim'
// 受创：'Hurt','Stagger','Down','Dead','Limp'
// 表演：'Point','Wave','Shiver','WarmHands','Listen','Hide','Sit','Kneel','Comfort','Salute','Cower'

Character = {
  id: string,
  archetype: string,
  group: THREE.Group,                        // 根节点；外部只改这个的 position/quaternion
  bones: {
    hips, spine, chest, neck, head,
    shoulderLeft, elbowLeft, handLeft,
    shoulderRight, elbowRight, handRight,
    hipLeft, kneeLeft, footLeft,
    hipRight, kneeRight, footRight,
    weapon,                                   // 手持物挂点
  },                                          // 全部为 THREE.Object3D
  height: number,
  eyeHeight: number,
  radius: number,

  GetBone(name: string): THREE.Object3D | null,
  GetWorldPosition(boneName: string, out?: Vector3): Vector3,
  GetEyePosition(out?: Vector3): Vector3,
  GetMuzzlePosition(out?: Vector3): Vector3,
  GetMuzzleDirection(out?: Vector3): Vector3,
  GetChestPosition(out?: Vector3): Vector3,

  // —— 命中盒（Combat / EnemyAi 唯一命中来源） ——
  hitboxes: Array<{ name: HitPart, radius: number, offset: Vector3, multiplier: number }>,
  GetHitSphere(part: HitPart, out?: object): { center: Vector3, radius: number } | null,
  RaycastHitbox(origin: Vector3, direction: Vector3, maxDistance: number
               ): { part: HitPart, point: Vector3, distance: number, multiplier: number } | null,
  // HitPart = 'Head' | 'Torso' | 'ArmLeft' | 'ArmRight' | 'LegLeft' | 'LegRight'

  // —— 动画 ——
  PlayAction(name: string, options?: { fade?: number, speed?: number, loop?: boolean,
                                       layer?: 'Base'|'Upper'|'Additive', onDone?: () => void }): ActionHandle,
  StopAction(name: string, fade?: number): void,
  IsPlaying(name: string): boolean,
  GetActionProgress(name: string): number,      // [0,1]，未播放返回 0
  ActionHandle = { name: string, Cancel(): void, done: boolean },

  /** 每帧由控制器写入，驱动 base 层混合。不调用此方法角色就会"刚体滑行"。 */
  SetLocomotion(params: { speed: number, strafe: number, turnRate: number,
                          crouch: boolean, prone: boolean, aiming: boolean,
                          injured: number, carrying: boolean, grounded: boolean,
                          surface: SurfaceKind }): void,
  SetLookAt(worldPosition: Vector3 | null, weight?: number): void,
  SetAimPitch(radians: number): void,
  SetHolding(item: 'None'|'Rifle'|'Pistol'|'Knife'|'Shovel'|'Grenade'|'Lantern'|'Stone'|'Bundle'): void,
  SetBreath(intensity: number): void,           // [0,1]，喘息幅度
  SetShiver(intensity: number): void,           // [0,1]，低温发抖
  SetInjury(level: number): void,               // [0,1]，跛行/护腰
  SetTension(level: number): void,              // [0,1]，肩颈紧绷（小满的怕）
  SetVisible(visible: boolean): void,
  SetOpacity(alpha: number): void,
  SetPalette(palette: object): void,

  // —— 变换 ——
  Warp(position: Vector3, yaw: number): void,
  SetPosition(position: Vector3): void,
  GetPosition(out?: Vector3): Vector3,
  SetYaw(radians: number): void,
  GetYaw(): number,

  /** 脚落地回调：由动画系统在脚触地帧调用，用于脚步声与脚印。控制器订阅它。 */
  OnFootstep(handler: (info: { side: 'L'|'R', position: Vector3, speed: number }) => void): (() => void),

  Update(dt: number, ctx): void,
  Dispose(): void,
}
```

---

### 5.9 `Script_Player.mjs` — AgentPlayer

第三人称控制器 + 相机 + 输入（含触屏）。**质量门槛 4（100ms 内反馈）与 7（移动端可玩）主要由本模块 + Hud 共同负责。**

```js
export function CreateInput(ctx, options?: { element?: HTMLElement }): Input

Input = {
  axes: { moveX: number, moveY: number, lookX: number, lookY: number },   // [-1,1]
  /** 按键名固定：'sprint','crouch','prone','aim','fire','melee','throw','interact','reload','swap',
   *  'command','pause','menu','flashlight','peekLeft','peekRight' */
  Down(name: string): boolean,          // 持续按住
  Pressed(name: string): boolean,       // 本帧按下沿
  Released(name: string): boolean,      // 本帧抬起沿
  Consume(name: string): boolean,       // 取沿并吞掉，防多方重复消费
  AnyInputSinceSeconds(): number,

  // 触屏（Hud 创建 DOM 后调这些反向注入）
  SetVirtualAxis(name: 'move'|'look', x: number, y: number): void,
  SetVirtualButton(name: string, down: boolean): void,
  SetTouchEnabled(enabled: boolean): void,
  isTouch: boolean,

  SetSensitivity(value: number): void,
  SetInvertY(value: boolean): void,
  SetEnabled(enabled: boolean, reason?: string): void,
  RequestPointerLock(): void,
  ExitPointerLock(): void,
  isPointerLocked: boolean,
  GetBindingsText(): Array<{ action: string, key: string, label: string }>,   // 供 HUD 显示键位

  Update(dt: number, ctx): void,
  Dispose(): void,
}

export function CreatePlayer(ctx, options?: { spawn?: object }): Player

Player = {
  character: Character,
  object: THREE.Object3D,                 // = character.group
  position: THREE.Vector3,                // 活引用，外部只读
  velocity: THREE.Vector3,
  yaw: number, pitch: number,

  state: {
    stance: 'Stand'|'Crouch'|'Prone',
    sprinting: boolean, aiming: boolean, braced: boolean,
    inCover: boolean, coverId: string | null, peeking: -1|0|1,
    grounded: boolean, moving: boolean, speed: number,
    surface: SurfaceKind, indoors: boolean,
    controlEnabled: boolean, interacting: boolean, dead: boolean,
    noiseRadius: number, concealment: number, lightLevel: number,
  },

  GetEyePosition(out?: Vector3): Vector3,
  GetAimRay(out?: object): { origin: Vector3, direction: Vector3 },
  GetAimPoint(maxDistance: number, out?: Vector3): Vector3,
  GetForward(out?: Vector3): Vector3,

  /** EnemyAi 唯一的"玩家可被感知度"入口，禁止自行拼装 */
  GetStealthProfile(): { position: Vector3, eyePosition: Vector3, height: number,
                         moving: boolean, speed: number, crouched: boolean, prone: boolean,
                         inCover: boolean, concealment: number, lightLevel: number, indoors: boolean },

  Teleport(position: Vector3, yaw?: number): void,
  ApplyImpulse(vector: Vector3): void,
  SetControlEnabled(enabled: boolean, reason?: string): void,
  SetStance(stance: 'Stand'|'Crouch'|'Prone'): boolean,
  SetWeaponDrawn(kind: string): void,
  EmitNoise(kind: string, radiusOverride?: number): void,       // 走 NoiseEmitted 事件
  StartInteract(interactable: object): boolean,
  CancelInteract(): void,
  ForceStagger(fromPosition: Vector3, strength: number): void,
  PlayScriptedPose(actionName: string, seconds: number): void,  // 剧情用

  // —— 相机（Player 独占驱动 ctx.camera） ——
  SetCameraMode(mode: 'Follow'|'Aim'|'Cover'|'Cinematic'|'Dialogue'|'Free',
                options?: { anchor?: THREE.Object3D, position?: Vector3, lookAt?: Vector3, blendSeconds?: number }): void,
  GetCameraMode(): string,
  SetCameraShakeEnabled(enabled: boolean): void,                // 无障碍开关
  NudgeCamera(yawDelta: number, pitchDelta: number): void,

  Update(dt: number, ctx): void,
  Dispose(): void,
}
```

---

### 5.10 `Script_EnemyAi.mjs` — AgentEnemy

**必须走 `ctx.world` 拿导航/视线/遮挡/掩体，走 `ctx.rules.ComputeDetection` 算警戒，走 `ctx.player.GetStealthProfile()` 拿玩家可感知度。禁止自己写 raycast/寻路/探测公式。**

```js
export function CreateEnemyDirector(ctx, options?: { profile?: string }): EnemyDirector

EnemyDirector = {
  group: THREE.Group,
  enemies: Array<Enemy>,

  Spawn(def: { id?: string, archetype: string, squadId: string, position: Vector3, yaw: number,
               post?: object, route?: Array<Vector3>, weapon?: string, hasFlashlight?: boolean }): Enemy,
  Despawn(enemyId: string): void,
  SpawnFromWorld(): Array<Enemy>,                     // 按 world.spawns.enemyPosts 批量生成
  GetEnemy(enemyId: string): Enemy | null,
  GetNearest(position: Vector3, maxDistance?: number,
             filter?: (e: Enemy) => boolean): Enemy | null,
  QueryInRadius(position: Vector3, radius: number): Array<Enemy>,
  AliveCount(): number,

  // —— 小队 ——
  GetSquad(squadId: string): { id: string, members: Array<string>, alert: number,
                               lastKnownTarget: Vector3 | null, state: string } | null,
  AlertSquad(squadId: string, position: Vector3, level: 0|1|2, source: string): void,
  AlertAll(position: Vector3, level: 0|1|2, source: string): void,
  ReportNoise(payload: { position: Vector3, radius: number, kind: string, sourceId?: string }): void,
  ReportBody(position: Vector3, enemyId: string): void,
  ReportFootprints(position: Vector3): void,

  // —— 全局状态（HUD / Audio / Story 读它） ——
  GetGlobalAlert(): number,                                    // [0,1]
  GetAlertLevel(): 0|1|2,                                      // 白/黄/红
  GetAlertLevelName(): 'Calm'|'Suspicious'|'Combat',
  IsPlayerDetected(): boolean,
  GetThreatDirection(fromPosition: Vector3): number | null,    // 弧度，供 HUD 方向指示
  GetLastKnownPlayerPosition(): Vector3 | null,

  SetChapterProfile(profileId: 'PuppetPatrol'|'Checkpoint'|'JapaneseSearch'): void,
  SetDifficulty(scale: number): void,
  SetSpawningEnabled(enabled: boolean): void,
  DebugDraw(enabled: boolean): void,

  Update(dt: number, ctx): void,
  Dispose(): void,
}

Enemy = {
  id: string, squadId: string, archetype: string,
  character: Character,
  position: THREE.Vector3, yaw: number,
  health: number, alive: boolean, downed: boolean,
  alert: number,                                     // [0,1]
  alertLevel: 0|1|2,
  state: EnemyState,
  hasSeenPlayer: boolean,
  lastKnownPlayerPosition: THREE.Vector3 | null,
  weapon: string,
  light: object | null,                              // 手电/探照灯句柄

  SetPatrolRoute(points: Array<Vector3>, loop?: boolean): void,
  SetPost(position: Vector3, yaw: number, lookArcDeg: number): void,
  Investigate(position: Vector3, priority?: number): void,
  ForceState(state: EnemyState): void,
  Distract(position: Vector3, seconds: number): void,

  GetViewCone(): { origin: Vector3, forward: Vector3, halfAngle: number, range: number },
  CanSee(targetPosition: Vector3): boolean,
  GetVisibilityOf(profile: object): number,          // [0,1]

  ApplyDamage(amount: number, params?: { part?: string, source?: string, position?: Vector3, direction?: Vector3 }
             ): { applied: number, killed: boolean, staggered: boolean },
  /** 潜行处决入口；不满足条件返回 false。必须无展示性血腥。 */
  TryStealthKill(attackerPosition: Vector3, attackerForward: Vector3): boolean,
  Suppress(position: Vector3, seconds: number): void,
}

// EnemyState = 'Idle'|'Patrol'|'Post'|'Chat'|'Suspicious'|'Investigate'|'Search'|'Alerted'
//            | 'Engage'|'TakeCover'|'Flank'|'Reload'|'CallForHelp'|'Retreat'|'Stagger'|'Downed'|'Dead'
```

---

### 5.11 `Script_Combat.mjs` — AgentSystems

**红线约束**：全流程弹药 ≤ 12 发；栓动步枪每发要拉栓；命中要 hitstop；正面交火几乎必死；处决无炫技、无血腥展示。

```js
export function CreateCombat(ctx, options?): Combat

Combat = {
  // —— 武器 ——
  GetWeaponDef(weaponId: string): WeaponDef | null,
  ListWeapons(): Array<string>,
  EquipPlayerWeapon(weaponId: 'None'|'RifleZhongzheng'|'PistolMauser'|'KnifeBayonet'|'Shovel'): boolean,
  GetEquipped(): { id: string, loaded: number, reserve: number, chambered: boolean,
                   ready: boolean, cooldown: number },
  WeaponDef = { id: string, kind: 'Rifle'|'Pistol'|'Melee'|'Thrown', damage: number,
                magazine: number, boltAction: boolean, fireCooldown: number, reloadSeconds: number,
                boltSeconds: number, noiseRadius: number, recoil: number, spreadBase: number,
                falloffStart: number, falloffEnd: number, ammoType: string, label: string },

  // —— 瞄准与射击 ——
  BeginAim(): void,
  EndAim(): void,
  IsAiming(): boolean,
  GetAimState(): { spread: number, swayX: number, swayY: number, braced: boolean, holdSeconds: number },
  TryFire(): FireResult,
  TryCycleBolt(): boolean,
  TryReload(): boolean,
  FireResult = { ok: boolean, reason: 'Ok'|'Empty'|'NeedBolt'|'Cooldown'|'NoWeapon'|'Blocked',
                 hit: HitResult | null },

  // —— 近战 ——
  TryMelee(kind: 'Light'|'Heavy'): boolean,
  SetBlocking(down: boolean): void,
  TryDodge(direction: Vector3): boolean,
  IsInvulnerable(): boolean,

  // —— 投掷 ——
  BeginThrow(itemId: 'Stone'|'Grenade'): boolean,
  GetThrowPreview(charge: number, out?: Array<Vector3>): Array<Vector3>,   // 抛物线预览点
  ReleaseThrow(charge: number): boolean,
  CancelThrow(): void,

  // —— 潜行处决 ——
  CanStealthKill(): { ok: boolean, target: object | null, reason: string },
  TryStealthKill(): boolean,

  // —— 通用解算（EnemyAi 开枪也走这里，保证一致） ——
  ResolveShot(origin: Vector3, direction: Vector3,
              params: { damage: number, spread: number, maxDistance: number, sourceId: string,
                        ignoreId?: string, falloffStart?: number, falloffEnd?: number }): HitResult | null,
  HitResult = { kind: 'Enemy'|'Player'|'World', targetId: string | null, part: string,
                point: Vector3, normal: Vector3, distance: number, damage: number,
                killed: boolean, surface: SurfaceKind },
  ApplyExplosion(position: Vector3, radius: number, damage: number, sourceId: string): void,
  ApplyDamageToPlayer(amount: number, params?: { part?: string, source?: string, position?: Vector3 }): void,

  /** 让非玩家角色可被射击/近战命中。返回退订函数 */
  RegisterHittable(handle: { id: string, character: Character, kind: string,
                             OnHit: (hit: HitResult) => void }): (() => void),

  hitstop: number,          // 剩余 hitstop 秒数，Boot 读它调 timeScale
  Update(dt: number, ctx): void,
  Dispose(): void,
}
```

---

### 5.12 `Script_Survival.mjs` — AgentSystems

```js
export function CreateSurvival(ctx, options?): Survival

Survival = {
  stats: { health: number, maxHealth: number, bleeding: boolean, bleedSeconds: number,
           stamina: number, maxStamina: number, warmth: number, maxWarmth: number,
           hunger: number, maxHunger: number, wet: number, clothing: number },
  ammo: { rifle: number, pistol: number },

  // —— 背包 ——
  inventory: Array<{ id: string, count: number }>,
  Has(itemId: string, count?: number): boolean,
  Count(itemId: string): number,
  Add(itemId: string, count?: number, source?: string): { ok: boolean, added: number, reason: string },
  Remove(itemId: string, count?: number): boolean,
  GetCapacity(): { used: number, max: number },
  ListInventory(): Array<{ id: string, count: number, name: string, description: string, kind: string }>,

  // —— 使用与合成 ——
  Use(itemId: string): { ok: boolean, reason: string },
  GetRecipes(): Array<object>,
  CanCraft(recipeId: string): { ok: boolean, reason: string, missing: Array<object> },
  Craft(recipeId: string): { ok: boolean, reason: string },

  // —— 状态改动（唯一入口，别处不许直接写 stats） ——
  ApplyDamage(amount: number, params?: { part?: string, source?: string, causesBleed?: boolean }): void,
  Heal(amount: number): void,
  StartBleeding(): void,
  StopBleeding(): void,
  SpendStamina(amount: number): boolean,
  RestoreStamina(amount: number): void,
  AddWarmth(amount: number): void,
  SetNearFire(near: boolean): void,
  SetExposure(value: number): void,               // [0,1]，由天气与是否室内决定
  SetClothing(level: number): void,

  // —— 弹药（受 Config.Combat.AmmoBudget 约束，超预算必须拒绝） ——
  GetAmmo(type: 'rifle'|'pistol'): number,
  AddAmmo(type: string, count: number, source?: string): number,   // 返回实际加入数
  ConsumeAmmo(type: string, count?: number): boolean,
  GetTotalAmmoGranted(): number,

  // —— 搜刮 ——
  RollLoot(tableId: string, random?: object): Array<{ id: string, count: number }>,
  /** 搜刮尸体只返回弹药类，且不产生任何视觉展示（红线 2） */
  LootBody(enemyId: string): Array<{ id: string, count: number }>,

  Snapshot(): { health: number, stamina: number, warmth: number, hunger: number,
                bleeding: boolean, ammoTotal: number, itemCount: number, alive: boolean },
  IsAlive(): boolean,
  Reset(chapterId?: string): void,

  Update(dt: number, ctx): void,
  Dispose(): void,
}

export const ItemIds: Readonly<Record<string, string>>
// 'Bandage','Cloth','Liquor','Match','PineBranch','Firewood','Ration','Herb','RifleAmmo','PistolAmmo',
// 'Grenade','Stone','Knife','Crowbar','RadioPart','Letter','PaddedCoat','Rope','Lantern'
```

---

### 5.13 `Script_Story.mjs` — AgentStory

剧情导演 + 小满伴随 AI + 字幕调度。**不 import three / Character / World**，一切通过 `ctx`。

```js
export function CreateStory(ctx, options?): Story

Story = {
  chapterId: string,
  beatId: string | null,
  companion: Companion | null,        // 同时挂到 ctx.companion

  StartChapter(chapterId: string): void,
  GetChapterData(): object,
  TriggerBeat(beatId: string, options?: { force?: boolean }): boolean,
  IsBeatDone(beatId: string): boolean,
  GetActiveBeat(): object | null,

  // —— 台词 ——
  Say(speaker: string, lineIdOrText: string, options?: { duration?: number, priority?: number,
                                                         interrupt?: boolean }): boolean,
  QueueDialogue(lineIds: Array<string>, options?: { gap?: number }): void,
  SkipDialogue(): void,
  IsSpeaking(): boolean,
  /** 情境性台词（不是随机播报）：受伤/杀人/低温/发现物品/被发现时由各系统请求 */
  RequestBark(barkId: string, context?: object): boolean,
  SetBarkCooldown(barkId: string, seconds: number): void,

  // —— 选择 ——
  OfferChoice(choiceId: string): Promise<string>,        // resolve 为 optionId
  MakeChoice(choiceId: string, optionId: string): void,
  GetChoice(choiceId: string): string | null,

  // —— 演出 ——
  PlayCinematic(beatId: string): Promise<void>,
  SetLetterbox(on: boolean): void,
  IsCinematic(): boolean,

  Update(dt: number, ctx): void,
  Dispose(): void,
}

Companion = {                          // 冯小满
  character: Character,
  position: THREE.Vector3,
  mode: CompanionMode,
  state: { hidden: boolean, scared: number, trust: number, tired: number,
           carrying: string | null, busy: boolean },

  SetMode(mode: CompanionMode, options?: { anchor?: Vector3, targetId?: string }): void,
  GetMode(): string,
  // CompanionMode = 'Follow'|'Stay'|'Hide'|'Lead'|'Squeeze'|'Watch'|'Distract'|'Carry'
  //               | 'Captured'|'Comfort'|'Scripted'

  CommandFollow(): boolean,
  CommandStay(): boolean,
  CommandHide(): boolean,
  CommandInteract(interactableId: string): boolean,     // 钻狗洞 / 开门 / 递东西
  CanReach(interactableId: string): boolean,
  GiveItem(itemId: string, count?: number): boolean,    // 递弹药/绷带给沈铁
  RequestItem(itemId: string): boolean,

  IsHidden(): boolean,
  IsSafe(): boolean,
  GetDistanceToPlayer(): number,
  GetStealthProfile(): object,          // 形状同 Player.GetStealthProfile
  ApplyScare(amount: number, source?: string): void,
  Capture(byEnemyId: string): void,
  Rescue(): void,
  Teleport(position: Vector3, yaw?: number): void,

  Update(dt: number, ctx): void,
}
```

**小满的行为纪律**：台词与玩家行为呼应（受伤 → 关心/害怕；开枪杀人 → 沉默或退后；低温 → 提醒生火），**不做随机播报**；被抓触发救援段落；她永远不能被当作资源或计分对象（红线 3）。

---

### 5.14 `Script_Audio.mjs` — AgentInterface

**零音频文件。全部 WebAudio 合成。** 必须为关键声音发 `SoundCaption` 事件供无障碍方向字幕（质量门槛 8）。

```js
export function CreateAudio(ctx, options?): Audio

Audio = {
  ready: boolean,
  Unlock(): Promise<boolean>,                       // 首次用户手势时调用，失败返回 false 且全程静音降级

  PlaySfx(id: string, options?: { position?: Vector3, volume?: number, pitch?: number,
                                  delay?: number, caption?: boolean }): SfxHandle | null,
  PlayLoop(id: string, options?: { position?: Vector3, volume?: number, fade?: number }): LoopHandle | null,
  StopLoop(handle: object, fadeSeconds?: number): void,
  StopAll(fadeSeconds?: number): void,
  SfxHandle = { id: string, Stop(): void, SetVolume(v: number): void, done: boolean },
  LoopHandle = { id: string, SetPosition(v: Vector3): void, SetVolume(v: number): void,
                 SetPitch(v: number): void, Stop(fade?: number): void },

  SetListener(position: Vector3, forward: Vector3, up: Vector3): void,
  SetAmbience(presetId: 'VillageDawn'|'ValleyNoon'|'PassDusk'|'Blizzard'|'Indoor'|'Cellar'|'Silence',
              fadeSeconds?: number): void,
  SetMusicState(stateId: 'Silence'|'Unease'|'Tension'|'Chase'|'Grief'|'Resolve', fadeSeconds?: number): void,
  SetWindIntensity(value: number): void,
  SetMuffled(value: number): void,                   // 室内/低血/爆炸后耳鸣
  SetHeartbeat(value: number): void,                 // 低血/高警戒

  SetMasterVolume(value: number): void,
  SetBusVolume(bus: 'music'|'sfx'|'ambience'|'voice', value: number): void,
  GetVolumes(): { master: number, music: number, sfx: number, ambience: number, voice: number },
  SetMuted(muted: boolean): void,

  /** 每帧最新一条"值得字幕化"的声音；Hud 读它渲染方向字幕 */
  GetSoundCaptions(): Array<{ text: string, directionRadians: number, distance: number, at: number }>,

  Update(dt: number, ctx): void,
  Dispose(): void,
}

export const SfxIds: Readonly<Record<string, string>>
// 脚步：'FootstepSnow','FootstepIce','FootstepWood','FootstepStone','FootstepStraw','FootstepWater'
// 武器：'RifleFire','RifleBolt','RifleReload','PistolFire','MeleeSwing','MeleeHitFlesh','MeleeHitWood',
//       'MeleeBlock','GrenadePin','GrenadeBounce','Explosion','BulletWhizz','ImpactSnow','ImpactWood',
//       'ImpactStone','ImpactMetal','DryFire'
// 交互：'DoorOpen','DoorForce','DrawerOpen','JarShift','ClothTear','MatchStrike','FireCrackle','CraftDone',
//       'PickUp','InventoryOpen'
// 生存：'Breath','BreathHard','Shiver','Heartbeat','BandageApply','Eat','Hurt','HurtHeavy','Down'
// 环境：'WindLow','WindHigh','SnowFall','TreeCreak','CrowCall','DogBark','DogGrowl','TruckDistant',
//       'FlareLaunch','SearchlightHum'
// 敌人：'EnemyAlertShort','EnemyAlertLong','EnemyChatter','EnemyWhistle','EnemyFootstepSnow','BodyFall'
// UI：'UiMove','UiConfirm','UiCancel','UiObjective','UiChapter'
```

---

### 5.15 `Script_Hud.mjs` — AgentInterface

HUD/菜单/字幕/无障碍/触屏。**不 import three。** DOM 骨架在 `index.html`，样式在 `Style_Game.css`。

```js
export function CreateHud(ctx, options?: { root?: HTMLElement }): Hud

Hud = {
  root: HTMLElement,
  SetVisible(visible: boolean): void,

  // —— 字幕与提示 ——
  ShowSubtitle(speaker: string, text: string, durationSeconds?: number): void,
  ClearSubtitle(): void,
  ShowSoundCaption(text: string, directionRadians: number, distance: number): void,
  ShowPrompt(text: string, keyLabel: string, kind?: 'Interact'|'Companion'|'Hint'): void,
  HidePrompt(): void,
  ShowInteractProgress(progress01: number, label?: string): void,
  HideInteractProgress(): void,
  ShowToast(text: string, kind?: 'Info'|'Item'|'Warning'|'Cost', durationSeconds?: number): void,

  // —— 目标与章节 ——
  ShowObjective(text: string, kind?: 'New'|'Update'|'Done'|'Failed'): void,
  SetObjectiveList(objectives: Array<{ id: string, text: string, done: boolean, optional: boolean }>): void,
  ShowChapterTitle(title: string, subtitle: string, durationSeconds?: number): Promise<void>,

  // —— 状态 ——
  SetVitals(vitals: { health: number, maxHealth: number, stamina: number, maxStamina: number,
                      warmth: number, maxWarmth: number, bleeding: boolean }): void,
  SetAmmo(ammo: { weapon: string, label: string, loaded: number, reserve: number, chambered: boolean }): void,
  SetStealthState(state: { level: 0|1|2, concealed: boolean, noiseRadius: number,
                           threatDirection: number | null }): void,
  SetCrosshair(mode: 'Hidden'|'Dot'|'Aim'|'Melee'|'Throw', spread?: number): void,
  SetThrowArc(points: Array<{ x: number, y: number }> | null): void,
  SetCompanionState(state: { mode: string, distance: number, hidden: boolean, scared: number }): void,

  // —— 菜单与流程 ——
  OpenInventory(): void, CloseInventory(): void, ToggleInventory(): void,
  OpenMenu(menuId: 'Pause'|'Settings'|'Controls'|'Accessibility'|'Ledger'): void,
  CloseMenu(): void,
  IsMenuOpen(): boolean,
  ShowChoice(prompt: string, options: Array<{ id: string, text: string }>,
             seconds?: number): Promise<string>,
  ShowEnding(result: { endingId: string, title: string, lines: Array<string>,
                       ledger: Array<object>, stats: object }): Promise<void>,
  ShowGameOver(reason: string): Promise<'Retry'|'Menu'>,
  FadeTo(alpha: number, seconds: number, color?: string): Promise<void>,
  SetLetterbox(on: boolean): void,
  SetLoading(loading: boolean, text?: string): void,

  // —— 触屏与无障碍 ——
  SetTouchVisible(visible: boolean): void,
  BindTouchControls(): void,                       // 内部把事件回灌 ctx.input.SetVirtualAxis/Button
  GetSettings(): Settings,
  ApplySettings(settings: object): void,
  Settings = { fontScale: number, subtitlesOn: boolean, soundCaptionsOn: boolean,
               cameraShake: boolean, flashEffects: boolean, highContrast: boolean,
               sensitivity: number, invertY: boolean, holdToAim: boolean,
               masterVolume: number, musicVolume: number, sfxVolume: number },

  SetDebugText(text: string): void,
  Update(dt: number, ctx): void,
  Dispose(): void,
}
```

**Hud 必须做到**：所有关键声音有方向字幕；可关闭镜头抖动与闪光；可调字号；键位可见；安全区 `env(safe-area-inset-*)` 适配；`@media` 断点；触摸不误触（按钮 ≥ 44px，摇杆区与视角区分离）。

---

### 5.16 `Script_Boot.mjs` — AgentBoot

```js
/** 页面入口。index.html 里 import 并调用一次。 */
export function Boot(options?: { mount?: HTMLElement, canvas?: HTMLCanvasElement,
                                 chapterId?: string, debug?: boolean, autoStart?: boolean
                               }): Promise<GameHandle>

export function CreateContext(options?: object): object      // 只造 P0 字段，便于测试

GameHandle = {
  ctx: object,
  Start(): void,
  Pause(reason?: string): void,
  Resume(): void,
  IsRunning(): boolean,
  LoadChapter(chapterId: string, options?: { fromSave?: boolean }): Promise<void>,
  Restart(chapterId?: string): Promise<void>,
  SaveNow(): boolean,
  Dispose(): void,
}
```

**Boot 的职责**：按第四节阶段顺序装配 ctx → 绑定 resize / visibilitychange / 首次手势 Unlock 音频 → 跑主循环（第七节）→ 处理换章（销毁旧 World/Enemies，保留 Art/Hud/Audio）→ 处理 `RequestTimeScale` 与 hitstop → 捕获所有异常（`window.onerror` / `unhandledrejection`）并降级到可读错误页，**绝不允许白屏**。

---

### 5.17 `index.html` / `Style_Game.css` / `Script_SmokeTest.mjs`

`index.html`（AgentBoot）：`<meta viewport>` 含 `viewport-fit=cover`；固定 importmap；`#GameRoot` 容器 + `#GameCanvas` + HUD 全部 DOM 骨架（id 见下）；`<noscript>` 中文提示；`Style_Game.css` 用 `<link>`。

HUD DOM 契约（Hud owner 依赖这些 id，Boot owner 不得改名）：
`#GameRoot #GameCanvas #HudRoot #HudVitals #HudAmmo #HudObjective #HudSubtitle #HudSoundCaption #HudPrompt #HudProgress #HudToast #HudCrosshair #HudAlert #HudCompanion #HudChapterTitle #HudTouch #HudTouchStick #HudTouchButtons #HudMenu #HudInventory #HudChoice #HudEnding #HudFade #HudLetterbox #HudLoading #HudDebug`

`Style_Game.css`（AgentInterface）：所有类名 `PascalCase` 或 `Style_` 前缀，禁止连字符类名；必须含 `@media (max-width: 820px)` 与 `@media (pointer: coarse)`；`prefers-reduced-motion` 降级；`env(safe-area-inset-*)`；字号用 `--HudFontScale` CSS 变量。

`Script_SmokeTest.mjs`（AgentBoot）：

```js
export function RunSmokeTests(): { passed: number, failed: number,
                                   results: Array<{ name: string, ok: boolean, message: string }> }
```
CLI 直跑时打印结果并以退出码表示成败。**只许 import Config / Math / Event / Rules / Data_Story。**
必须覆盖：随机确定性、噪声值域、缓动边界、事件总线重入与退订、Rules 三幕流程可通关、目标完成/失败、探测公式单调性、噪音衰减单调性、合成消耗正确、弹药总量不超 `AmmoBudget.total`、存档 round-trip、章节数据完整性（每章 objectives 非空且 nextChapterId 链完整）、Data_Story 全部 lineId 引用可解析、**代价记录不参与任何计分**。

---

## 六、事件总线协议

所有事件通过 `ctx.bus`，名字用 `EventNames.Xxx`。payload 一律普通对象；**Rules/Hud 的订阅方不得假设 payload 里有 THREE.Vector3 之外还能改它**（payload 视为只读）。

| 事件 | 发布者 | payload |
|---|---|---|
| `NoiseEmitted` | Player/Combat/World/Story/Survival | `{position:Vector3, radius:number, kind:string, sourceId:string, hostile:boolean}` |
| `GunFired` | Combat | `{weaponId, position:Vector3, direction:Vector3, shooterId, isPlayer:boolean, ammoLeft:number}` |
| `MeleeHit` | Combat | `{attackerId, targetId, kind:'Light'\|'Heavy'\|'Block', damage, position:Vector3}` |
| `StealthKill` | Combat | `{attackerId, targetId, position:Vector3}` |
| `ThrowLanded` | Combat | `{itemId, position:Vector3, radius:number, sourceId}` |
| `EnemyAlertChanged` | EnemyAi | `{enemyId, squadId, level:0\|1\|2, previous:0\|1\|2, alert:number, position:Vector3}` |
| `EnemySpotted` | EnemyAi | `{enemyId, squadId, targetKind:'Player'\|'Companion'\|'Body'\|'Footprints', position:Vector3}` |
| `EnemyDown` | EnemyAi | `{enemyId, squadId, byPlayer:boolean, silent:boolean, position:Vector3}` |
| `SquadAlerted` | EnemyAi | `{squadId, level, position:Vector3, source:string}` |
| `PlayerDamaged` | Survival/Combat | `{amount, part, source, position:Vector3\|null, health, causedBleed:boolean}` |
| `PlayerDowned` | Survival | `{reason:'Shot'\|'Melee'\|'Bleed'\|'Cold'\|'Explosion'}` |
| `HealthChanged` | Survival | `{health, maxHealth, delta, bleeding:boolean}` |
| `StaminaChanged` | Survival | `{stamina, maxStamina, delta}` |
| `WarmthChanged` | Survival | `{warmth, maxWarmth, delta, low:boolean}` |
| `ItemPicked` | Survival | `{itemId, count, source, total}` |
| `ItemCrafted` | Survival | `{recipeId, outputId, count}` |
| `ItemUsed` | Survival | `{itemId, effect:string}` |
| `AmmoChanged` | Survival/Combat | `{type:'rifle'\|'pistol', reserve, loaded, delta}` |
| `InteractPrompt` | Player/World | `{visible:boolean, text:string, keyLabel:string, kind:string, targetId:string\|null}` |
| `InteractStarted` | Player | `{targetId, kind, seconds}` |
| `InteractFinished` | Player | `{targetId, kind, completed:boolean}` |
| `ObjectiveChanged` | Rules/Story | `{objectiveId, text, state:'New'\|'Updated'\|'Done'\|'Failed', optional:boolean}` |
| `StoryBeat` | Story | `{id, chapterId}` |
| `Subtitle` | Story/Audio | `{speaker, text, duration, emotion}` |
| `SoundCaption` | Audio | `{text, directionRadians, distance}` |
| `CompanionState` | Story | `{mode, hidden:boolean, scared:number, distance:number, busy:boolean}` |
| `CompanionCaptured` | Story | `{byEnemyId, position:Vector3}` |
| `WeatherChanged` | Art | `{preset, snowRate, windSpeed, visibility}` |
| `ChapterChanged` | Rules/Boot | `{chapterId, index, title, subtitle}` |
| `GameOver` | Rules/Boot | `{reason, chapterId, allowRetry:boolean}` |
| `GameEnded` | Rules/Story | `{endingId, ledger:Array, stats:object}` |
| `CostRecorded` | Rules | `{key, label, note}` （**只记录，永不计分**） |
| `RequestTimeScale` | Combat/Story | `{scale:number, seconds:number, reason:string}` |
| `RequestCameraShake` | Combat/Art 消费 | `{strength, seconds, frequency}` |
| `SettingsChanged` | Hud | `{settings:object, changed:Array<string>}` |
| `QualityChanged` | Boot/Art | `{level:'low'\|'medium'\|'high', reason:string}` |
| `PauseChanged` | Boot | `{paused:boolean, reason:string}` |
| `SaveWritten` | Boot | `{key, chapterId, ok:boolean}` |

**订阅纪律**：`Update` 里不要 `Emit` 会立即改动本模块自身状态的事件，用 `EmitLater`。所有 `On` 的退订函数必须在 `Dispose` 中调用。

---

## 七、主循环顺序与每帧预算

Boot 固定顺序（**不许调换**）：

```
0  帧头：rawDt = clock.getDelta(); dt = clamp(rawDt) * timeScale
1  ctx.input.Update(dt)
2  ctx.player.Update(dt, ctx)
3  ctx.story.Update(dt, ctx)        // 内含 companion.Update
4  ctx.enemies.Update(dt, ctx)
5  ctx.combat.Update(dt, ctx)
6  ctx.survival.Update(dt, ctx)
7  ctx.rules.Update(dt, snapshot) → 消费返回的 RulesEffect
8  ctx.world.Update(dt, ctx)
9  ctx.characters.Update(dt, ctx)   // 所有骨骼求值，必须在 Render 前、World 之后
10 ctx.bus.Flush()                  // 派发本帧 EmitLater
11 ctx.art.Update(dt, ctx)
12 ctx.art.Render(ctx)
13 ctx.hud.Update(dt, ctx)
14 ctx.audio.Update(dt, ctx)
```

暂停时只跑 10 → 12 → 13 → 14（dt 传 0）。

**每帧预算（1080p / 60fps，16.6ms 总额）**

| 段 | 预算 | 说明 |
|---|---|---|
| input + player | 0.8 ms | — |
| story + companion | 0.8 ms | 对白调度是低频状态机，不许每帧扫全表 |
| enemies | 1.6 ms | 每敌视线检测**分帧**：每帧只跑 1/3 敌人（`frame % 3`） |
| combat | 0.7 ms | — |
| survival + rules | 0.4 ms | Rules 每 0.25s 跑一次即可 |
| world | 0.8 ms | 导航路径请求排队，每帧最多解 2 条 |
| characters | 1.2 ms | 12m 外角色降到 15Hz 更新，30m 外只更新 root |
| art.Update + Render | 9.0 ms | draw call 目标 ≤ 220（合并静态几何、共享材质、树/雪/栅栏用 InstancedMesh） |
| hud | 0.6 ms | DOM 写入**只在值变化时**执行，禁止每帧 `innerHTML` |
| audio | 0.4 ms | 同时活跃音源 ≤ `Config.Audio.maxVoices` |
| 余量 | 0.3 ms | — |

移动端：`quality='low'` 时关阴影、粒子减半、pixelRatio ≤ 1.5、敌人分帧改 1/4，目标 ≥ 30fps。

---

## 八、章节 / 关卡数据结构

三幕，`Data_Story.StoryChapters` 顺序即游玩顺序。

```js
Chapter = {
  id: string,                       // 'ChapterSnowCellar' | 'ChapterBrokenValley' | 'ChapterWindPass'
  index: 1 | 2 | 3,
  title: string,                    // '雪窖' / '断谷' / '风雪垭口'
  subtitle: string,                 // '一九四三年十二月十七日 · 拂晓'
  timeOfDay: 'Dawn' | 'Noon' | 'Dusk' | 'Night',
  weather: 'LightSnow' | 'Overcast' | 'Blizzard',
  worldPreset: 'Village' | 'Valley' | 'Pass',
  worldSeed: number,
  enemyProfile: 'PuppetPatrol' | 'Checkpoint' | 'JapaneseSearch',
  companionPresent: boolean,
  ammoGrant: number,                // 本章最多能获得的子弹数，三章合计 ≤ Config.Combat.AmmoBudget.total
  ambience: string,                 // Audio.SetAmbience 预设名
  musicState: string,
  objectives: Array<Objective>,     // 顺序即推进顺序；optional 的不阻塞
  beats: Array<string>,             // beatId[]，本章可能触发的节拍
  introBeatId: string | null,
  outroBeatId: string | null,
  nextChapterId: string | null,     // 第三幕为 null
}

Objective = {
  id: string,
  text: string,                     // 玩家可见中文，动词开头，具体（'撬开磨坊的地窖门'）
  hint: string | null,
  optional: boolean,
  kind: 'Reach' | 'Interact' | 'Collect' | 'Survive' | 'Escort' | 'Avoid' | 'Choice' | 'Escape',
  target: {
    anchorId?: string,              // world.spawns.storyAnchors 的键
    interactableId?: string,
    itemId?: string,
    count?: number,                 // Collect / Avoid 计数
    radius?: number,                // Reach 判定半径，默认 2.5
    seconds?: number,               // Survive 时长
    choiceId?: string,
  },
  beatOnStart: string | null,
  beatOnComplete: string | null,
  failOn: Array<'CompanionCaptured' | 'PlayerDowned' | 'Detected' | 'Timeout'>,
  failText: string | null,
}
```

**三幕骨架（AgentStory 按此填内容，id 固定，其余可扩）**

| 幕 | chapterId | 目标骨架 |
|---|---|---|
| 一 · 雪窖 | `ChapterSnowCellar` | `ObjectiveWakeUp`（教学移动/蹲伏）→ `ObjectiveScavengeVillage`（搜刮 3 处）→ `ObjectivePryCellar`（撬门，发现小满）→ `ObjectiveEvadePatrol`（伪军搜村，第一次潜行）→ `ObjectiveLeaveVillage` |
| 二 · 断谷 | `ChapterBrokenValley` | `ObjectiveReachRoad` → `ObjectiveCompanionDogHole`（小满钻狗洞开门）→ `ObjectiveCrossCheckpoint`（潜行绕过 或 交火）→ `ObjectiveGunneryTutorial`（可选，第一次枪战）→ `ObjectiveEnterValleyExit` |
| 三 · 风雪垭口 | `ChapterWindPass` | `ObjectiveClimbPass`（暴风雪、体温）→ `ObjectiveEvadeSearch`（狗/探照灯/照明弹）→ `ObjectiveProtectCompanion`（Escort）→ `ObjectiveFinalChoice`（`kind:'Choice'`, `choiceId:'ChoiceStationReveal'`）→ 结局 |

**终局抉择**：`ChoiceStationReveal` 两个 option：`OptionRevealStation`（暴露交通站救小满）/ `OptionLetHerWalk`（让她独自走完最后一段）。**落点是情感，不是战果**；两者都不给"更优结局"评分，只写进代价记录。

**存档**

```js
key: 'blackstone1943_progress_v1'     // = Rules.SaveKey = Config.Save.key
{
  version: 1,
  chapterId: string,
  objectiveId: string | null,
  beatsDone: Array<string>,
  flags: Record<string, any>,
  choices: Record<string, string>,
  stats: { health: number, stamina: number, warmth: number, hunger: number },
  inventory: Array<{ id: string, count: number }>,
  ammo: { rifle: number, pistol: number, granted: number },
  ledger: Array<{ key: string, note: string, at: number }>,
  tally: Record<string, number>,
  playSeconds: number,
  savedAt: number,
}
```
设置另存 `blackstone1943_settings_v1`（Hud owner）。存档在**章节切换与目标完成时**由 Boot 写入；`localStorage` 不可用时静默降级（不许抛错）。

---

## 九、质量门槛与自检命令

**质量门槛（照抄纲领第四节，低于此线返工）**

1. **第一眼像一个真游戏**：有构图、有光影层次、有雾与景深感的天际线，不是"灰盒子摆在绿地上"。
2. **氛围**：色调统一（冬日冷灰 + 火光暖橙的唯一暖色对比）、体积雾、飘雪、风声、脚步材质区分、镜头呼吸与手持微抖。
3. **角色可读**：轮廓清晰、有重量感、有蹲伏/受伤/紧张的体态差异；动画不能是刚体滑行。
4. **交互反馈**：所有输入 100ms 内有视觉+听觉回应；瞄准/受击/潜行状态在画面上一眼可辨。
5. **性能**：桌面 1080p ≥ 55fps，移动端 ≥ 30fps；draw call 受控（合并几何、共享材质、实例化）。
6. **无 console 报错**，无未捕获 Promise，`node --check` 全过，冒烟测试全过。
7. **移动端可玩**：虚拟摇杆 + 动作键，安全区适配，`@media` 断点，触摸不误触。
8. **无障碍**：所有关键声音有方向字幕，可关闭镜头抖动/闪光，可调字号，键位可见。

**自检命令（每次改完自己跑，全绿才算完成）**

```bash
BASE=/home/user/bentleyblanks_Claude_Blackstone1943_20260729

# 1) 语法（改哪个跑哪个；提交前全量跑）
node --check $BASE/Blackstone1943/Script_<Yours>.mjs
for f in $BASE/Blackstone1943/*.mjs; do node --check "$f" || echo "FAIL $f"; done

# 2) 冒烟测试（退出码即成败）
node $BASE/Blackstone1943/Script_SmokeTest.mjs

# 3) 无头浏览器 QA（consoleErrors / pageErrors 必须为空，截图必须像个游戏）
SP=/tmp/claude-0/-home-user-bentleyblanks-github-io/ed7ba146-bd8b-560d-83bd-5678b0d54b36/scratchpad
node $SP/Qa.mjs --steps "wait:3000;shot:Boot" --out $SP/shots

# 4) 越界自检：不许出现 CDN / 外链 / 音频图片文件（输出必须为空）
grep -rnE "https?://|\.(png|jpg|jpeg|gif|webp|mp3|ogg|wav|woff2?|ttf|glb|gltf|fbx)\b" \
  $BASE/Blackstone1943 --include=*.mjs --include=*.html --include=*.css --exclude-dir=vendor

# 5) 依赖自检：确认自己没有越过第三节的 DAG
grep -n "^import" $BASE/Blackstone1943/Script_<Yours>.mjs
```

**完成定义（DoD）**：语法过 + 冒烟过 + QA 无 console 报错 + 截图能看出你负责的部分生效 + 没改别人的文件 + 没新增 ctx 字段 + 需求写进第十节。

---

## 十、跨模块需求（实现者追加，**只许 append，不许改上面任何一节**）

格式：`- [提出者] → [被请求方] 需求：<签名或行为> · 原因：<一句话> · 状态：待确认/已实现/已拒绝`

<!-- APPEND BELOW THIS LINE -->

- （示例，勿删格式）[AgentEnemy] → [AgentWorld] 需求：`World.SampleWindDirection(position): Vector2` · 原因：军犬循气味需要顺风判定 · 状态：待确认

### AgentBoot（装配层 + 可运行灰盒）交付说明与需求

**已交付**：`Script_Boot.mjs`、`Script_SmokeTest.mjs`，外加一批**可运行灰盒占位**——
`Script_Art.mjs` / `Script_World.mjs` / `Script_Character.mjs` / `Script_Player.mjs`（真能跑、能走、能看）与
`Script_EnemyAi.mjs` / `Script_Combat.mjs` / `Script_Survival.mjs` / `Script_Story.mjs` / `Script_Audio.mjs` / `Data_Story.mjs`（签名正确的最小占位）。
**各模块 owner 请直接整体重写自己的文件**：公开 API 已按第五节写死，Boot 不需要改动。

- [AgentBoot] → [AgentInterface] 需求：按 5.15 导出 `CreateHud(ctx, { root })` 于 `Script_Hud.mjs` · 原因：该文件尚不存在，Boot 目前用**动态 import + 静默替身**兜底（缺文件不阻塞开机），文件一出现就会自动接管 · 状态：待确认
- [AgentBoot] → [AgentArt] 需求：`MakeVariant(key, variantId, overrides)` 必须把 `vertexColors` / `color` 等 overrides 透传给材质 · 原因：地形用 `MakeVariant('SnowGround','TerrainVillage',{ vertexColors:true, color:0xffffff })` 让顶点色独占明暗 · 状态：已实现（灰盒）
- [AgentBoot] → [AgentArt] 需求：`Art.Render` 内必须 `renderer.info.autoReset = false` + 手动 `reset()` 再 `composer.render()` · 原因：否则 `stats.drawCalls` 只剩最后一个后处理全屏四边形（1 call / 1 tri），性能门槛 5 无法验收 · 状态：已实现（灰盒）
- [AgentBoot] → [AgentArt] 需求：投影关键光的仰角**不要**直接用 `Config.TimeOfDay.<preset>.sunElevationDeg`（Dawn = 8°） · 原因：8° 的太阳会被四周山脊整片挡住，整个村子黑成剪影；灰盒里天上的日盘保留低角度、投影光另取 ≥30° · 状态：已实现（灰盒）
- [AgentBoot] → [AgentArt] 需求：程序化贴图的灰度 base 请贴近 1.0（只用对比度做细节） · 原因：`map` 是与 `color` 相乘的，base 压到 0.6 等于把整个 Palette 再暗一遍 · 状态：已实现（灰盒）
- [AgentBoot] → [AgentWorld] 需求：`spawns.playerStart` 必须落在**空地**（离所有碰撞体 ≥ 3m）且朝向村子中心；房屋要按四角地形最低点下沉、按落差加高墙体 · 原因：否则开场面壁 / 房子半悬空 · 状态：已实现（灰盒）
- [AgentBoot] → [AgentSystems] 需求：`Combat.hitstop` 保持为「剩余秒数」的数字字段 · 原因：Boot 每帧读它把 `ctx.timeScale` 压到 0.06 做命中停顿，优先级高于 `RequestTimeScale` · 状态：已实现（灰盒）
- [AgentBoot] → 全体 需求：不要往 `ctx.debug.watch` 里塞 `THREE.Object3D` / `Set` / 循环引用 · 原因：`window.__Blackstone.debug` 会被无头 QA 探针 `JSON.stringify`，塞进去就炸 · 状态：待确认
- [AgentBoot] → 全体 说明：主循环把契约第七节的 1—8 步放在**固定步长**（`Config.Loop.fixedStep`，每帧最多 4 个子步）里跑，9—14 步按帧的可变 dt 跑一次。`Update(dt, ctx)` 因此可能一帧被调用多次，**请勿在 Update 里假设"一帧一次"**（用 `ctx.frame` 判断分帧）。
- [AgentBoot] → [AgentStory] 需求：`Data_Story.mjs` 的三章 id / 目标 id / `nextChapterId` 链 / `EndingCatalog` 的三个结局 id（`EndingLetHerWalk` / `EndingRevealStation` / `EndingAlone`）请保持不变 · 原因：`Script_Rules.EvaluateEnding` 与冒烟测试都按这套 id 断言 · 状态：待确认

### AgentIntegration（集成校验）· 首轮合流的实现—契约偏差与修复

三个地基 agent 并行落地后的第一次全量集成校验。冒烟 24/24 通过、`node --check` 全过、
无头 QA（桌面 1600×900 + 移动 414×896 触屏）`consoleErrors` / `pageErrors` / `requestFails` 全空。
以下是**已经改掉的实现缺陷**与**留给各 owner 的待办**。第一至九节一字未改。

**已修（改实现，不改契约）**

- [AgentIntegration] → [AgentPlayer] 修复：`CreateInput` 的按下/抬起沿此前**全程失效**。`Input.Update` 在帧头 `pressed.clear()`，而 DOM keydown 落在帧与帧之间，沿在任何消费者读到之前就被抹掉，`Pressed/Consume` 恒为 false（蹲伏/伏地/交互/上膛/投掷/近战/背包/暂停全部按不动）。现改为事件写 `pendingPressed/pendingReleased`，由 `Update` 整体交接给本帧可见的 `pressed/released`；`SetEnabled(false)` 一并清掉未派发的沿。**重写 Player 时请保留这个「事件缓冲 → Update 交接」的次序。** · 状态：已实现
- [AgentIntegration] → [AgentBoot] 修复：`Script_Hud.mjs` 发的 `RequestPause` / `RequestRestart` / `RequestTitle` **无人订阅**，暂停菜单不停帧、失败重试与返回标题两个按钮全是死键。Boot 现已订阅这三条：`RequestPause{paused,reason}` → `Pause/Resume(reason)`；`RequestRestart{reason}` → 清空暂停理由后 `handle.Restart()`（`reason==='Ending'` 时回到第一章）；`RequestTitle` → 先 `SaveNow()` 再 `location.reload()`（外壳 `index.html` 的 `booted` 闭包无法从模块内复位，重载是唯一干净的回路）· 状态：已实现
- [AgentIntegration] → [AgentInterface] 修复：背包面板直接显示英文 id（`RadioPart` / `Match` / `Crowbar`），违反「玩家可见文本用中文」。`Survival.ListInventory()` 目前只填 `name = id`，Hud 现改为在 `name`/`description` 缺失时回落到已 import 的 `Data_Story.ItemCatalog`（新增 `ItemDescription()`，与既有 `ItemName()` 成对），合成配方的用料也一并本地化 · 状态：已实现
- [AgentIntegration] → [AgentSystems] 修复：`Survival.Update` 逐帧改 `stats.warmth` / `stats.stamina` 却从不广播，HUD 的体温/体力条是死的。现按契约第六节（两者的发布者都是 Survival）补发 `WarmthChanged{warmth,maxWarmth,delta,low}` 与 `StaminaChanged`，用「变化 ≥ 0.5 点或跨过低温门槛」节流，避免逐帧砸 DOM · 状态：已实现
- [AgentIntegration] → [AgentArt] 修复：`ApplyWeather` 从不发 `WeatherChanged`，而契约第六节写明发布者是 Art（Hud 的「起风了」提示、EnemyAi 的视距缩放都等它）。现在 `ApplyWeather` 末尾经 `ctx.bus` 发出 `{preset,snowRate,windSpeed,visibility}` · 状态：已实现

**契约补充（第六节事件表未列，但实现已依赖，请后续 owner 沿用这三个名字）**

- `RequestPause` · 发布者 Hud · 消费者 Boot · payload `{paused:boolean, reason:string}`。`reason` 用作暂停理由的键，同名的 true/false 必须配对，否则 Boot 的 `pauseReasons` 不会清空。
- `RequestRestart` · 发布者 Hud · 消费者 Boot · payload `{reason:string}`。`reason === 'Ending'` 表示从第一章重来，其余从当前章重来。
- `RequestTitle` · 发布者 Hud · 消费者 Boot · payload `{reason:string}`。
- 三者与 `RequestTimeScale` / `RequestCameraShake` 同属「系统请求」族。**`Script_Event.mjs` 的 `EventNames` 尚未收录它们**，收发两侧目前都用字面量字符串；AgentFoundation 若要补进 `EventNames`，请保持字符串值与名字一致，收发两端不必改。

**未修 · 留给 owner（都不阻塞运行，但对着质量门槛是缺口）**

- [AgentIntegration] → [AgentArt] 需求：把「烧过的墙」从纯黑里捞回来 · 现象：`InstancedBurntWall`（`Material_BrickBurnt` = `#4a3d38`）在 15—28m 处实测出屏像素只有 `rgb(0,0,0)`—`rgb(13,12,15)`，同一批几何的 `InstancedMudWall`（`#8a7a63`）是 `rgb(91,96,101)`——两者反照率只差 3.7 倍，出屏亮度却差了一个数量级。关掉 `shadowMap` 无变化，故不是阴影粉刺；是 Dawn 低角度太阳 + 补光偏弱 + ACES 在暗部的强压缩 + `uVignette=0.42` 四者叠加，把 `#4a` 以下的反照率整片吃进黑洞。断墙于是变成没有体积、没有材质、没有轮廓的黑板，直接打在质量门槛 1「不是灰盒子摆在绿地上」。建议：抬半球光/环境光的下半球分量，或把 `BrickBurnt` / `CharredWood` / `Rock` 的反照率提到 `#5a` 以上再靠贴图压暗 · 状态：待确认
- [AgentIntegration] → [AgentEnemy] 需求：按契约第六节发 `EnemyAlertChanged{enemyId,squadId,level,previous,alert,position}` · 原因：Hud 已订阅并据此驱动潜行状态条与威胁指示器，现在从不更新，「潜行状态一眼可辨」（门槛 4）拿不到数据 · 状态：待确认
- [AgentIntegration] → [AgentSystems] 需求：按契约第六节发 `GunFired{weaponId,position,direction,shooterId,isPlayer,ammoLeft}` · 原因：Hud 已订阅，用于弹药回读与开火反馈；另 `Combat` 目前也没发 `MeleeHit` / `StealthKill` · 状态：待确认
- [AgentIntegration] → [AgentSystems] 需求：`Survival.ListInventory()` 按 5.12 补齐 `name` / `description` / `kind`（现在 `name` 直接等于 id，`kind` 恒为 `'Material'`）· 原因：Hud 侧已做了回落兜底，但契约写的是 Survival 出这三个字段。注意第三节 DAG 不允许 Survival import `Data_Story`，名字要么由 Boot 经 `options` 注入，要么在第十节里申请放宽 · 状态：待确认
- [AgentIntegration] → 全体 说明：无头 QA 跑在 SwiftShader 软件光栅上，单帧 `render` 就要 3—130ms，`debug.fps` 只有 6—8，游戏内时间约为真实时间的 1/5。**截图里「按住 W 人没动」是探针环境的正常现象，不是控制器坏了**（实测 `player.state.speed` 稳定在 1.67 m/s）。判断移动是否正常请读 `ctx.player.position` / `velocity`，别看两张截图的构图差。

<!-- APPEND ABOVE THIS LINE -->
