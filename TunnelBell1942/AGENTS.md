# TunnelBell1942 ·《地道战 · 钟声》— 模块契约

Three.js 横版叙事冒险白盒。形式参考《勇敢的心：世界大战》，题材是电影《地道战》。
线上地址：`https://bentleyblanks.github.io/TunnelBell1942/`

**这份文档是并行开发的唯一契约。任何模块只许读它、按它实现，不许改别的模块的文件。**

---

## 0. 一句话设计

侧视 2.5D。地表是高家庄（月夜、土墙、碾盘、老槐树），地下是地道剖面（土层挖空、马灯照亮）。
玩家在地表躲避搜索，在地下穿行转移，靠**环境互动**而不是战斗解决问题。
一个动词表：走 / 猫腰 / 用 / 携带一件物品 / 呼应。没有枪战，没有血条。

三幕，每幕 3–6 分钟：

| 幕 | 标题 | 主角 | 空间 | 核心体验 |
|---|---|---|---|---|
| 1 | 钟声 | 高老忠 | 地表 | 潜行 + 互动教学；敲响老槐树上的钟，全村得以转移；他没能回来 |
| 2 | 翻口 | 高传宝 | 地下 | 地道穿行：猫腰、竖井、翻口、卡口；把乡亲带到暗室 |
| 3 | 转移 | 高传宝 | 地表 ⇄ 地下 | 敌人灌水放烟 → 封卡口、上地表引水、避开巡逻、带全村撤出黑风口 |

第 1 幕结尾玩家操作的角色不会活着离开，这是本作的情感支点，不许改成"打赢"。
第 3 幕结尾必须是一次**完整的转移/逃脱**（全员抵达出口），不是击毙敌人。

---

## 1. 文件所有权（谁都不许越界写别人的文件）

| 文件 | 负责 Agent | 允许 import |
|---|---|---|
| `Data_Contract.mjs` | 集成者（已完成，只读） | 无 |
| `Data_Levels.mjs` | 关卡 Agent | `Data_Contract.mjs` |
| `Data_Story.mjs` | 剧情 Agent | 无 |
| `Script_Rules.mjs` | 玩法 Agent | `Data_Contract.mjs` `Data_Levels.mjs` `Data_Story.mjs` |
| `Script_Render.mjs` | 视觉 Agent | `Data_Contract.mjs` `vendor/three` `Script_Actor.mjs` |
| `Script_Actor.mjs` | 动画 Agent | `Data_Contract.mjs` `vendor/three` |
| `Script_Main.mjs` `index.html` `Style_Game.css` `Script_SmokeTest.mjs` | 集成者 | 全部 |

**硬性约束：**

- `Data_Levels.mjs` / `Data_Story.mjs` / `Script_Rules.mjs` **绝对不许 import three.js**。
  它们必须能在纯 Node 里跑（冒烟测试靠这一点）。
- `Script_Render.mjs` / `Script_Actor.mjs` **绝对不许写 state**。只读 `state`，只画。
- 三方库只有 `./vendor/three/build/three.module.mjs` 及 `./vendor/three/examples/jsm/**`。不许加新依赖、不许 CDN、不许外部图片/音频文件。
- 文件名遵守仓库规范：英文 PascalCase 词干、`Script_` / `Data_` / `Style_` 前缀、不用连字符。
- 变量 lowerCamelCase，导出函数 PascalCase。
- 玩家可见文本用简体中文，代码注释可中文。

---

## 2. 世界坐标与单位

- 1 单位 = 1 米。X 向右为正，Y 向上为正，Z 向观众为正。
- 地表地面 `y = 0`。地下坑道在 `y ∈ [-11, -2.6]`。
- 关卡沿 X 展开，长度 100–190 米。
- 摄像机：**正交**，看向 -Z。可视高度 `Data_Contract.CAMERA.viewHeight`，跟随玩家。

深度层（`Data_Contract.LAYER_Z`）：

```
FAR   = -26  远山、月亮、天幕
BACK  = -14  远处村舍剪影
MID   =  -6  中景房屋、树、院墙（地下：土层剖面墙）
PLAY  =   0  玩家、NPC、敌人、可互动道具、地面
FORE  =  +5  前景遮挡物（柴垛、树干、土坡），近黑剪影，只做构图
```

---

## 3. 关卡数据格式（`Data_Levels.mjs` 产出，`Script_Rules.mjs` 消费）

```js
export const LEVELS = [Level, Level, Level];
export function GetLevel(index) // 返回深拷贝，运行时可安全改写

Level = {
  id: "act1",              // "act1" | "act2" | "act3"
  chapterId: "act1",       // 对应 Data_Story.CHAPTERS[].id
  title: "钟声",
  actor: "laozhong",       // 玩家扮演谁："laozhong"(高老忠) | "chuanbao"(高传宝)
  bounds: { x0: 0, x1: 160, yTop: 6, yBottom: -12 },
  startX: 4, startY: 0,
  exit: { x: 152, y: 0, radius: 2.2, needAllVillagers: false, label: "村口" },
  timeOfDay: "night",      // "night" | "dusk" | "dawn"（影响视觉配色）

  // —— 可站立地板。玩家只在地板上走。允许重叠，取脚下最高的那块 ——
  floors: [ { id, x0, x1, y, kind } ],
  //   kind: "dirt" 土地 | "stone" 石板 | "roof" 屋顶 | "tunnel" 地道底 | "plank" 木板

  // —— 天花板/净空。用来判定必须猫腰的低矮段 ——
  ceils: [ { x0, x1, y } ],   // y 是净空顶的高度；floor.y 到 ceil.y 之间是可通行空间

  // —— 竖向通道（梯子/绳/土坡/地道口的竖井） ——
  shafts: [ { id, x, yTop, yBottom, kind, requiresHatch } ],
  //   kind: "ladder" | "rope" | "dirt"（土壁攀爬，慢）
  //   requiresHatch: hatchId | null —— 有值时必须先开这个地道口才能用

  // —— 地道口：地表 ⇄ 地下的入口，藏在道具里 ——
  hatches: [ { id, x, shaftId, hidden, opened, revealBy, label, propId } ],
  //   hidden:true 时不显示提示，需要 revealBy（trigger id 或 prop id）触发后才现形
  //   opened:false 时首次交互播放"开口"动画

  // —— 道具：既是视觉物件也是互动点 ——
  props: [ { id, x, y, z, kind, facing, interact, data, label } ],
  //   kind（视觉 Agent 按 kind 画）：
  //     地表 "house" "wall" "gate" "well" "millstone"(碾盘) "stove"(灶台) "kang"(炕)
  //          "vat"(水缸) "haystack"(柴垛) "trough"(驴槽) "tree" "bell"(老槐树上的钟)
  //          "cart" "fence" "lamp" "corpse" "sign"
  //     地下 "prop_beam"(支撑木) "lantern"(马灯) "crock"(粮罐) "chokepoint"(卡口)
  //          "vent"(通气孔) "trapdoor"(翻口) "waterpipe"(水道) "loophole"(枪眼)
  //   interact:
  //     "none" | "hatch" | "hide" | "bell" | "pickup" | "lever" | "push" | "talk" | "read"
  //   data 按 interact 定：
  //     hatch  → { hatchId }
  //     hide   → { capacity:1 }              躲进去后敌人看不见
  //     bell   → { rings:3 }                 敲钟，触发大事件
  //     pickup → { item:"lantern"|"plug"|"shovel"|"grain"|"note" }
  //     lever  → { channel:"gasSeal"|"waterDivert"|"gateOpen", needItem:null|"plug" }
  //     push   → { toX:number }              推到目标 x（堵洞/搭桥）
  //     talk   → { npcId }
  //     read   → { codexId }                 史料收集（Data_Story.CODEX）

  // —— 敌人 ——
  enemies: [ {
    id, x, y, kind, facing,
    patrol: { x0, x1, speed, pauseSec },   // 在 [x0,x1] 之间来回
    vision: { range, halfAngleDeg, height },
    hearing: 6.0,                          // 听觉半径（米），玩家发出噪音时用
    probeAt: [x, x, ...] | null,           // 地下敌人：在这些 x 上向下捅刺刀
  } ],
  //   kind: "search"(搜索兵) | "guard"(哨兵，站桩转头) | "dog"(军犬，听觉大) | "officer"(山田)

  // —— 需要带走的乡亲 ——
  npcs: [ { id, x, y, name, role, follow, rescued } ],
  //   role: "villager" | "child" | "elder" | "militia"
  //   follow:false 时原地等待，玩家靠近并交互后变 true 跟随

  // —— 环境危害（地下为主）——
  hazards: [ { id, kind, x0, x1, y, armAt, speed, sealedBy } ],
  //   kind: "gas"(毒烟) | "water"(灌水) | "collapse"(塌方)
  //   armAt: triggerId | null —— 被触发后开始蔓延
  //   sealedBy: leverChannel | null —— 拉对应的闸/塞住后停止

  // —— 触发区：玩家进入后发一次事件 ——
  triggers: [ { id, x0, x1, yMin, yMax, once, emit } ],
  //   emit: { panels:[panelId], reveal:[hatchId|propId], arm:[hazardId],
  //           spawn:[enemyId], objective:"文本", checkpoint:true, win:false }

  // —— 检查点：失败后从最近的检查点恢复 ——
  checkpoints: [ { id, x, y, label } ],

  // —— 目标清单（HUD 只显示当前一条）——
  objectives: [ { id, text, doneWhen } ],
  //   doneWhen: { trigger:id } | { propUsed:id } | { npcRescued:"all"|id } | { atExit:true }
};
```

**关卡设计红线：**

- 第 1 幕必须在 60 秒内让玩家学会：走 → 猫腰躲避视线 → 用（开/敲）。教学靠关卡布局，不靠文字。
- 每一幕开头 15 秒内必须出现一个"看得见的目标"（钟 / 亮着的马灯 / 出口方向的光）。
- 地道段必须体现"三通"：高低相通（竖井）、内外相通（通到村外）、街道相通（两个院子之间）。
- 不许出现玩家看不见就会死的陷阱。所有危害都要有前摇（声音事件 + 视觉预警）。
- 每幕至少 2 个检查点，失败重来不超过 30 秒进度。

---

## 4. 剧情数据格式（`Data_Story.mjs`）

Valiant Hearts 的表达方式：**几乎不用整句旁白，用象形气泡 + 极短台词**。遵守它。

```js
export const SAVE_KEY = "tunnelbell1942_v1";

export const PANELS = {
  a1_open: {
    speaker: "高老忠",       // 说话人；旁白用 ""
    text: "…",              // ≤ 24 个汉字。这是硬上限。
    mood: "talk",           // "talk" | "think" | "shout" | "silent" | "narrate"
    icons: ["bell", "run"], // 象形符号，渲染成气泡里的图标（见下表）
    portrait: "laozhong",   // "laozhong" | "chuanbao" | "linxia" | "villager" | "yamada" | null
  },
  ...
};

// 允许的 icon 名（视觉 Agent 会画这些，别用表里没有的）：
// bell 钟 / run 跑 / dig 挖 / down 向下 / up 向上 / eye 看 / quiet 噤声 /
// fire 火 / water 水 / gas 烟 / lantern 灯 / heart 心 / child 孩子 /
// grain 粮 / rifle 枪 / boot 军靴 / tunnel 地道 / village 村 / cross 亡 / clock 时间

export const CHAPTERS = [
  { id:"act1", index:1, title:"钟声", subtitle:"一九四二年 · 冀中 · 高家庄",
    opening:[panelId...], closing:[panelId...],
    epilogue:"…"          // 幕间黑屏上的一行字，≤ 30 字
  }, ...
];

export const CODEX = [
  { id:"codex_santong", title:"地道三通", body:"…" },  // body ≤ 90 字
  ...
];  // 6–10 条。史料注解，玩家在关卡里"读"到，不影响玩法。
```

**剧情红线：**

- 不许写成"抗日神剧"。没有以一敌百，没有手撕鬼子。敌人有威胁性。
- 主题必须由玩法承载：**地道战的本质是"保存自己"而不是"消灭敌人"**。
  台词不许直接说这句话——让玩家在第 3 幕带着全村人爬出黑风口时自己感受到。
- 平民伤亡不做奖励、不计分。高老忠之死不给玩家任何数值收益。
- 不给日军角色任何"可爱化"或滑稽化处理，也不写成纯符号。山田要有具体的、冷的判断力。

---

## 5. 玩法模块 API（`Script_Rules.mjs`）

```js
export const SAVE_KEY;                 // 从 Data_Story 转出
export function CreateState(levelIndex = 0);
export function ResetLevel(state, levelIndex);       // 重开某一幕
export function RespawnAtCheckpoint(state);
export function StepPlay(state, dt);   // dt 秒；内部 clamp 到 ≤ 1/30，超出则分多个子步
export function DrainEvents(state);    // 返回事件数组并清空
export function SerializeProgress(state);            // -> JSON string
export function LoadProgress(raw);     // -> { levelIndex, checkpointId, codex:[] } | null
export function CurrentPrompt(state);  // -> { key:"E"|"S"|"W", label:"开地道口" } | null
export function ActiveObjective(state);// -> string
```

### 5.1 State 结构（渲染层只读这些字段）

```js
state = {
  levelIndex, level, phase,   // phase: "play" | "panel" | "won" | "lost" | "chapterEnd"
  time,                       // 累计秒
  player: {
    x, y, vx, vy,
    facing: 1 | -1,
    layer: "surface" | "tunnel",     // y < -1 视为 tunnel
    onGround, onShaft, crouch, sneak, hidden, dead,
    carrying: null | "lantern" | "plug" | "shovel" | "grain" | "note",
    anim: { name, t, speed },        // 见 5.2
    noise: 0..1,                     // 当前噪音强度，给敌人听觉用
    lightRadius,                     // 携带马灯时变大，渲染层用
  },
  camera: { x, y, viewHeight, shake },   // Rules 负责算，渲染层直接用
  enemies: [ { id, x, y, facing, kind, state, alertness, anim, visionRange, visionHalfAngleDeg } ],
  //   state: "patrol" | "suspicious" | "search" | "spotted" | "probe" | "idle"
  //   alertness: 0..1，>=1 判定被抓
  npcs: [ { id, x, y, facing, name, role, follow, rescued, anim } ],
  hazards: [ { id, kind, x0, x1, y, active, level } ],   // level 0..1 蔓延程度
  world: {
    hatches: { [id]: { opened, hidden, x, shaftId } },
    levers:  { [channel]: bool },
    pushed:  { [propId]: x },
    picked:  { [propId]: true },
    codex:   { [codexId]: true },
    revealed:{ [id]: true },
  },
  story: { chapterId, queue: [panelId...], seen: {}, objectiveText },
  hud: { prompt, objective, suspicion, villagersSafe, villagersTotal, codexCount },
  input: { moveX, up, down, crouch, sneak, interactPressed, itemPressed, callPressed },
  events: [],
  checkpointId,
  stats: { deaths, timeInLevel },
};
```

### 5.2 动画状态名（动画 Agent 必须实现全部）

```
idle | walk | sneak | crouchIdle | crawl | climb | fall | land |
use | dig | push | ring | hide | call | caught | dead | carryIdle | carryWalk
```

`anim.t` 是该状态已持续的秒数，`anim.speed` 是移动速度标量（0..1，用于步频）。

### 5.3 事件（`DrainEvents` 返回，渲染/音效/UI 消费）

```js
{ kind:"panel",  id }                 // 弹漫画气泡
{ kind:"sfx",    id, x, y }           // 音效：step_dirt step_stone dig bell_ring cloth
                                      //   hatch_open ladder water gas alarm shout dog
                                      //   pickup lever push land breath heartbeat
{ kind:"shake",  power }              // 0..1
{ kind:"dust",   x, y, power }        // 粒子
{ kind:"spot",   enemyId }            // 被发现
{ kind:"lost",   reason }             // 失败
{ kind:"won" }                        // 通关本幕
{ kind:"checkpoint", id }
{ kind:"objective", text }
{ kind:"codex",  id }
```

### 5.4 玩法红线

- **不许有战斗**。玩家没有攻击键。冲突全靠躲、藏、堵、引。
- 被敌人看到不是立刻失败：`alertness` 有 1.2 秒左右的爬升，给玩家躲回去的机会。
- 猫腰时噪音减半、身高降到 `PLAYER.crouchHeight`，可进矮通道。
- 携带只能一件（VH 规则）。捡新的会放下旧的。
- 所有解谜必须是**环境解谜**：拉闸引水灭毒烟、推碾盘堵洞口、用木塞塞通气孔、点马灯照亮塌方处。不许出现"找钥匙开门"。
- `StepPlay` 必须是确定性的：不许用 `Math.random()`。需要随机就用 state 里的种子（`Data_Contract.NextRandom`）。
- 玩家死亡/被抓 → 1.5 秒后自动 `RespawnAtCheckpoint`，不弹失败菜单。

---

## 6. 渲染模块 API（`Script_Render.mjs`）

```js
export function CreateRenderer(canvas, options = {}) -> handle
handle = {
  scene, camera, renderer, three,
  BuildLevel(level),          // 销毁旧场景内容，按 level 重建静态几何
  Sync(state, dt),            // 每帧：同步动态对象 + 摄像机 + 光照 + 雾
  ConsumeEvent(event),        // 接收 DrainEvents 的事件做视觉反馈（dust/shake）
  Resize(width, height, dpr),
  SetQuality("low"|"medium"|"high"),
  Dispose(),
  stats: { drawCalls, triangles },
}
```

### 6.1 视觉红线

- **必须是横版**。正交相机，看向 -Z，不许有透视穿帮和自由旋转。
- 分层必须成立：`FORE` 层要有真实遮挡（玩家从柴垛后面走过时被挡住一部分）。
- 地下剖面用 `THREE.Shape` + holes 挖出坑道，`ExtrudeGeometry` 出土层厚度——不要用一堆方块拼。
- 地表夜景：冷月光（顶光偏蓝）+ 暖点光（油灯、火把、马灯）。地下：只有马灯的暖光 + 极暗环境光，靠 fog 制造纵深与压迫感。
- 色板要能一眼区分地表/地下：地表偏青灰蓝，地下偏赭褐橙。
- 角色一律**剪影优先**：深色主体 + 轮廓边光，站位清楚。不追求贴图细节。
- 全程程序化生成，不加载任何外部图片。需要纹理就用 `CanvasTexture` 现场画。
- 目标：1920×1080 下 draw calls < 260，稳定 60fps；中端设备 medium 档 ≥ 45fps。

---

## 7. 动画模块 API（`Script_Actor.mjs`）

```js
export function CreateActorRig(kind, three) -> rig
//   kind: "laozhong" | "chuanbao" | "villager" | "child" | "elder" |
//         "soldier" | "officer" | "dog"
rig = { group, joints:{ hip, torso, head, armL, armR, legL, legR, ... }, kind, height }

export function PoseActor(rig, anim, facing, time)  // anim = state.player.anim 形状
export function DisposeRig(rig)
export function CreateBellRig(three)      // 老槐树上的钟，单独一个可摆动的 rig
export function PoseBell(rig, ringT)
```

### 7.1 动画红线

- 全程序化关节动画，不用骨骼文件、不用 GLTF。
- 走路要有重量：躯干上下起伏 + 手臂反向摆动 + 落脚微停顿。
- 猫腰/爬行是本作的招牌姿态，必须一眼可读（重心极低、背弓起、手撑地）。
- 敌人搜索时的手电/刺刀朝向要跟 `facing` 与 `state` 对上。
- 状态切换要插值，不许硬切（内部保留上一姿态做 0.12s 混合）。
- `PoseActor` 不许分配新对象（每帧调用，注意 GC）。

---

## 8. 集成方式（Script_Main.mjs 已经写好，别改）

```
每帧：
  Main 采集键盘/触摸 → state.input
  Rules.StepPlay(state, dt)
  const events = Rules.DrainEvents(state)
  events → UI（panel 队列）/ 音效（WebAudio 现场合成）/ render.ConsumeEvent
  render.Sync(state, dt)
```

## 9. 验收（`node TunnelBell1942/Script_SmokeTest.mjs` 必须退出码 0）

- 三幕都能 `CreateState` 且 `StepPlay` 300 帧不抛错。
- 机器人玩家能在每一幕从起点走到出口（用 `DebugAutoPlay`）。
- 第 1 幕：敲钟事件必然发生；地道口能开；躲进柴垛后敌人 alertness 不上升。
- 第 2 幕：竖井上下可用；矮通道站立进不去、猫腰进得去；全部乡亲可救。
- 第 3 幕：毒烟触发后不封卡口会失败；封了卡口 + 引水后能带全员抵达出口。
- `SerializeProgress` → `LoadProgress` 往返一致。
- `StepPlay` 确定性：同样输入序列跑两遍，玩家末位置完全一致。
