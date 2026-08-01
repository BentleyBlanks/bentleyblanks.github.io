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

### 0.1 论点是「能藏、能打、能防」（改过一次，别改回去）

**早期版本把主题写成「保存自己，不是消灭敌人」，并禁止一切战斗。那是错的**，
它把电影《地道战》的论点砍掉了一半。电影本身是军事教育片，它的中心论点是
**地道要「三结合」：能藏、能打、能防**——民兵从枪眼放冷枪、拉地雷、封翻口
把敌人困死在村里。片子的弧线是**从被动挨打到主动打击**，不是一路躲到底。

所以：
- 第 2 幕仍然是「藏」与「转移」——那是基础，也是高老忠用命换来的时间。
- 第 3 幕的高潮从「逃出去」改成**「把敌人困在村子里打」**。全员脱险仍是前提，
  但收尾是村子反击得手，不是单纯撤离。
- 玩家**依然没有攻击键**（这是本作的手感基础，也是《勇敢的心》的形式底线）。
  玩家做的是**启动全村的反击**：拉地雷、开枪眼让民兵放冷枪、封翻口把敌人关进
  死胡同、引水灌烟反制。**扣扳机的是全村，不是玩家一个人。**
- 平民伤亡依然不计分、不做奖励。反击的对象是进村的敌人，不是"杀敌数"。

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
| `Script_Audio.mjs` | 音频 Agent | `Data_Contract.mjs`（**不许 three.js**） |
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
- 摄像机：**长焦透视**，看向 -Z，位于 `+Z` 远处。这是本作的 2.5D 基础，见下。

### 2.1 为什么是长焦透视而不是正交（改过一次，别改回去）

《勇敢的心》不是平贴的 2D：它的舞台**有厚度**——建筑露出侧面、地面向纵深退去、
远景随距离褪色变淡。正交相机永远给不出这个，因为它没有近大远小，所有层都是
同尺寸平贴，只能靠手动位移伪造视差（我们试过，act3 末端整层漂走 9.9 米）。

规格：
- `PerspectiveCamera`，**窄 FOV**（`CAMERA.fovDeg`，18–24°），相机拉到很远。
  窄 FOV 是关键：它保留横版的可读性（画面边缘几乎不畸变、竖直线仍然是竖直的），
  同时给出真实的层间视差与侧面透视。**广角会让横版立刻穿帮，不许调大。**
- 相机距离由「在玩法平面 z=0 上要看到多高」反推：
  `distance = (viewHeight / 2) / tan(fovDeg / 2)`
- **`state.camera.viewHeight` 的语义固定为「z=0 平面上的可视世界高度」**。
  玩法层的摄像机夹紧、机器人、冒烟测试全都建立在这个语义上，不许改。
  同理 z=0 上的可视半宽 = `viewHeight / 2 * aspect`。
- 相机只沿 X/Y 平移，**永远不许旋转**，永远看向 -Z。

### 2.3 镜头语言（玩的过程也要有电影感，不只是过场）

跟随镜头是"够用"，不是"好看"。要做出电影即视感，镜头必须**在玩的过程中就会
说话**。三件事：

**1. 机位区（`level.shots`）** —— 关卡数据可以在某些 X 区间指定专属机位：
```js
shots: [ {
  id, x0, x1,
  viewHeight,          // 这一段拉远/推近（比如进院子推近、上土坡拉远看全景）
  lift,                // 摄像机抬升（覆盖默认的地表 2.0 / 地道 0.55）
  anchorX,             // 有值时镜头锁在这个 x（定镜头：让玩家走进画面而不是画面跟着走）
  ease,                // 进入这段机位的过渡时长，默认 1.2 秒
  reason,              // 注释用："第一次看见钟" "敌人搜院子"
} ]
```
定镜头（`anchorX`）是最有电影感的一招：镜头不动，玩家走进构图里。用在
"第一次看见老槐树上的钟""从地道口探头看见街上的靴子"这种地方。

**2. 时间张弛。** 关键瞬间放慢：被发现的那一刻、地雷引爆、钟被敲响。
`state.timeScale`（0.25–1）由 Rules 驱动，渲染与音效都要跟着走。
**每次不超过 0.8 秒**，且**不许在玩家需要操作时放慢**（那是惩罚不是演出）。

**3. 呼吸感。** 跟随不许是刚性的：轻微滞后、静止时极缓的漂移、
紧张时（suspicion 高）镜头微微收紧。幅度要克制到"说不出哪里不一样但就是活的"。

### 2.2 舞台必须有厚度

光换相机不够，几何也得给出深度线索：
- 地面不是一条线，是一块**向 -Z 延伸**的台面（玩家站在它靠前的边缘附近）。
- 建筑是**体**不是片：要有可见的侧墙，屋檐、门洞、窗台有实际进深。
- 道具同理：碾盘、水缸、柴垛、驴槽都要有厚度，不能是立牌。
- 地道剖面：切面朝向观众，**能看进坑道内部**（内壁后墙、支撑木的进深）。
  这是透视相机白送的最大收益，务必吃到——地道要像壕沟，不像剪纸。
- 远景层用**大气透视**：越远越淡、越偏冷、对比越低，向天空色收敛。

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
  //     | "signal" | "mine" | "loophole"      ← 反击三件套，见第 0.1 / 4.1 节
  //   data 按 interact 定：
  //     hatch  → { hatchId }
  //     hide   → { capacity:1 }              躲进去后敌人看不见
  //     bell   → { rings:3 }                 敲钟，触发大事件
  //     pickup → { item:"lantern"|"plug"|"shovel"|"grain"|"note" }
  //     lever  → { channel:"gasSeal"|"waterDivert"|"gateOpen", needItem:null|"plug" }
  //     push   → { toX:number }              推到目标 x（堵洞/搭桥）
  //     talk   → { npcId }
  //     read   → { codexId }                 史料收集（Data_Story.CODEX）
  //     signal → { squadId, panels:[id] }    传令：把口令递给下一个小组，
  //                                          该组随后进入 ready，是反击的前提
  //     mine   → { channel, needSquad:squadId|null, panels:[id] }
  //                                          拉地雷。needSquad 有值时必须先传到那个组
  //     loophole → { squadId, panels:[id] }  开枪眼，让守在后面的民兵放冷枪；
  //                                          squad 必须已 ready

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

  // —— 过场：脚本化的镜头 + 走位，玩家交出操作权 ——
  cutscenes: { [id]: Cutscene },

  // —— 检查点：失败后从最近的检查点恢复 ——
  checkpoints: [ { id, x, y, label } ],

  // —— 目标清单（HUD 只显示当前一条）——
  objectives: [ { id, text, doneWhen } ],
  //   doneWhen: { trigger:id } | { propUsed:id } | { npcRescued:"all"|id } | { atExit:true }
};
```

### 3.1 过场（Cutscene）—— 仪式感的载体

过场不是"弹一串气泡"。它是**镜头自己会动、角色按脚本走位、玩家交出操作权**的
一段演出。用它给关键节拍仪式感：山田摸进村、高老忠上树敲钟、地道里传令、
反击得手。**每幕至少一段开场过场 + 一段高潮过场。**

```js
Cutscene = {
  id: "a1_cs_open",
  letterbox: "wide" | "full",      // full = 上下黑边压到最大，最正式
  skippable: true,                 // 允许跳过（长按/再按一次），但默认放完
  steps: [
    // 镜头：脱离玩家自己走。to 省略的字段保持不变
    { kind:"camera", to:{ x, y, viewHeight }, sec: 2.4, ease:"inOut" },
    // 角色走位：id 指向 enemies/npcs/player 里的任意一个，过场期间由脚本驱动
    { kind:"actor", id:"a1_e_yamada", to:{ x: 18 }, sec: 3.0, anim:"walk", facing: 1 },
    { kind:"panel", id:"a1_cs_p1" },   // 停下来等玩家翻页
    { kind:"wait",  sec: 0.8 },
    { kind:"sfx",   id:"boot" },
    { kind:"bell",  rings: 3 },        // 钟：镜头会自动看向钟
    { kind:"spawn", ids:["a1_e_search1"] },
    { kind:"fade",  to: 1, sec: 0.6 }, // 1 = 全黑，0 = 亮回来
    { kind:"reveal", ids:["a1_h_stove"] },
  ],
}
```

规则：
- 过场期间 `state.phase === "cutscene"`，玩家输入被忽略（只有"翻页/跳过"有效）。
- 过场里的 actor **不跑 AI**：不巡逻、不看见玩家、不涨警觉。结束后交还给 AI。
- `camera` step 直接写 `state.camera`，**不受跟随逻辑影响**，但仍然受关卡 bounds 夹紧。
- 过场结束后镜头**平滑交还**给玩家跟随，不许瞬移。
- 必须是确定性的：不许用 `Math.random()`。
- **过场不许吃掉玩法教学**：教操作的事归关卡布局，过场只负责叙事与仪式感。
- 触发方式：`trigger.emit.cutscene = "id"`，或 `CHAPTERS[].openingCutscene`。

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
- 平民伤亡不做奖励、不计分。高老忠之死不给玩家任何数值收益。
- 不给日军角色任何"可爱化"或滑稽化处理，也不写成纯符号。山田要有具体的、冷的判断力。

### 4.1 语域：这是《地道战》，不是默片（改过一次，别改回去）

**早期版本按《勇敢的心》的极端克制来写：24 字硬上限、全作 1 条旁白、
44 条气泡里 12 条纯图标、主题不许说破。结果是电影的声音被过滤干净了，
存在感太弱。** 形式仍然参考《勇敢的心》（漫画气泡、象形符号、不写大段独白），
但**语域必须是电影《地道战》的**：集体的、明确的、带教学腔的。

四件必须做出来的事：

1. **各小组的口令与呼应。** 地道里此起彼伏的喊话是电影集体感的来源——
   「各小组注意」「东头准备好了没有」「准备好了」。它把"一个人在地道里"
   变成"一个村子在地道里"。用新的 `signal` 互动做成玩法：玩家传令，
   下一个小组才动作。
2. **教学腔的战术演示。** 电影是军事教育片，它会明明白白讲地道怎么挖、
   三通怎么用、怎么防毒防水。史料（CODEX）不要再当收藏品，要**在剧情里
   真的教玩家**——林霞/高传宝在需要用到某个设施前后当场讲清楚它的原理。
3. **汤丙会**（伪军队长）。之前完全没有这个角色。他是"内部的敌人"，
   带来搜村的情报与背叛的紧张感，也让敌我不只是"日军 vs 村民"。
   他要有可信的动机与语气，不是脸谱化的走狗。
4. **那句台词。** 「悄悄地进村，打枪的不要」必须做进去，位置是**第一幕开场过场**——
   电影里它就是日军夜里摸进村时下的命令，而第一幕的开场恰恰是高老忠发现鬼子摸进村。
   **处理纪律**：这句话在今天的流行文化里被玩成了梗，但在原片语境里它是一道
   **冷的、要命的命令**——不许开枪，是为了不惊动全村，好把人堵在屋里。
   所以要演成**危险**，不是滑稽：夜、压低的声音、队列无声散开。
   不许配滑稽音效、不许让说话人显得蠢。这也是第 4 节"不给日军滑稽化处理"的延续。

5. **钟声母题。** 钟贯穿全作、响三次，每次含义不同：
   示警（第 1 幕，高老忠用命换的）→ 集合（第 2 幕，地道里听见地面的钟）
   → 反击的信号（第 3 幕）。三次的音色/节奏在音效上也要能听出区别。

**字数预算按 panel 类型分档**（`kind` 字段，剧情 Agent 负责标注）：

| kind | 上限 | 用途 |
|---|---|---|
| `beat` | 24 字 | 情感节拍、沉默、对视。保持《勇敢的心》的克制 |
| `call` | 20 字 | 小组口令与呼应，短促、可喊出来 |
| `brief` | 44 字 | 教学腔的战术说明（林霞/高传宝讲设施怎么用） |
| `narrate` | 40 字 | 旁白，上限放宽到 6 条 |

- 全作气泡总量从 44 条提到 **80–110 条**，密度要能撑起"一路上都有人说话"。
- 纯图标 panel 仍然保留（它们仍是最有力的工具），但比例降到 15% 以下。
- 「保存自己/消灭敌人」这类总结句依然不许直接写进台词——**论点靠演示，不靠宣告**。

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
export function StartCutscene(state, id);   // 进入过场
export function AdvanceCutscene(state);     // 翻页（panel step 时有效）
export function SkipCutscene(state);        // 跳过（skippable 时有效），要把副作用全部结算完
```

### 5.1 State 结构（渲染层只读这些字段）

```js
state = {
  levelIndex, level, phase,   // "play" | "panel" | "cutscene" | "won" | "lost" | "chapterEnd"
  cutscene: null | { id, stepIndex, t, letterbox, fade, skippable },
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
    squads:  { [squadId]: "idle" | "ready" | "fired" },   // 各小组的状态，反击的前提
    mines:   { [channel]: bool },                          // 已引爆的地雷
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

- **玩家没有攻击键**（手感基础，不许加）。但村子会打——玩家的动词是**启动反击**：
  `mine`(拉地雷) / `loophole`(开枪眼让民兵放冷枪) / `signal`(传令给下一个小组) /
  封翻口把敌人困死。扣扳机的是全村，不是玩家。见第 0.1 节。
- 反击必须是**被触发的、有前提的**：要么先传令让小组就位，要么先把敌人引进死胡同。
  不许做成"随时可按的攻击键换了个名字"。
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

### 6.2 胶片质感（Film Grade）

要电影即视感，画面就不能是"干净的实时渲染"。按这个顺序加，**每一项都要能单独关掉**
（`SetQuality("low")` 时全关）：

1. **色调分离（split toning）** —— 暗部压向冷蓝（夜）或冷褐（地道），亮部推向暖橙。
   这是"电影调色"最省力也最像的一招。
2. **胶片颗粒** —— 细、动态、**按亮度加权**（暗部多、亮部少）。静态噪点看起来像脏屏幕。
3. **暗角** —— 已有，配合镜头语言微调强度（紧张时收紧）。
4. **光晕/辉光** —— 只给暖光源（油灯、马灯、火把、枪口），冷月光不要。要柔、要小。
5. **轻微色差** —— 只在画面边缘，幅度极小（≤1px）。过量立刻廉价。
6. **快门感** —— 高速移动时的轻微拖影。可选，掉帧就砍。

**红线**：加完之后 `Script_RenderHealthTest.mjs` 的"画面有明暗层次/色调不单一/
角色所在处有对比"三条必须仍然全过——**调色不许把可读性调没了**。
潜行游戏里看不清敌人视锥就是设计事故。

### 6.1 视觉红线

- **必须是横版**。长焦透视（见第 2.1 节），看向 -Z，不许旋转、不许广角畸变。
  判据：画面里的竖直边缘要基本保持竖直，玩家在画面左右两端时体型变化不明显。
- 分层必须成立：`FORE` 层要有真实遮挡（玩家从柴垛后面走过时被挡住一部分）。
  透视下 FORE 会被放大，`LAYER_Z.FORE` 的物件尺寸要重新标定，别再吞掉玩家。
- 视差由透视天然产生，**不许再手动位移图层**（旧的 `gFore.position.x = -cx*k` 已经废除）。
- 地下剖面用 `THREE.Shape` + holes 挖出坑道，`ExtrudeGeometry` 出土层厚度——不要用一堆方块拼。
  透视下能看进坑道内部，内壁后墙必须做出来。
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

## 7.2 音频模块（`Script_Audio.mjs`）—— 电影感的一半在耳朵里

**全部 WebAudio 现场合成，不许加载任何音频文件。**

```js
export function CreateAudio(options) -> handle
handle = {
  Unlock(),                    // 首次用户交互后解锁 AudioContext
  Play(id, opts),              // 一次性音效（对应契约 5.3 的 sfx id）
  Sync(state, dt),             // 每帧：按局势推进音乐层与环境层
  SetMuted(on), SetVolume(v),
  Dispose(),
}
```

**分三层，必须都有：**

1. **环境层（ambience）** —— 地表夜风与虫声、地道里的滴水与闷响、土层压迫感的低频。
   地表 ⇄ 地道切换时交叉淡入淡出，跟 `player.layer` 走。
2. **紧张层（tension）** —— 挂在 `hud.suspicion` 上的低音持续层：
   0 时几乎听不见，涨起来时加入不谐和的二度、心跳、呼吸。
   **被发现的瞬间要有一记明确的"刺"**，不是渐变。
3. **母题层（motif）** —— **钟是全作的音乐母题**。三次敲钟的音色与余韵要能听出区别：
   示警（尖、急、三下）→ 集合（远、闷、隔着土层听）→ 反击（沉、长、带回声）。
   过场里可以让钟的分音单独延续成一段极简的持续音，作为"配乐"。

**纪律：**
- 没有旋律性 BGM。这个题材配不上罐头进行曲，**留白比配乐有力**。
- 音效要有空间感：按 `x` 与玩家的距离做声像与衰减；地表的声音在地道里要闷（低通）。
- 静音是工具：钟响的那一刻、`a1_close`、反击得手，都应该有**突然的静**。
- 不许阻塞主线程，不许每帧分配对象。
- 浏览器不支持 WebAudio 时静默降级，绝不能因为音频让游戏起不来。

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
