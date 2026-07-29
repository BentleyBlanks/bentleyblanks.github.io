# Blackstone1943 · 制作纲领（所有 agent 的唯一事实源）

项目根目录（**所有路径都以此为准，绝不写别处**）：
`<仓库根目录>/Blackstone1943/`

上线地址：`https://bentleyblanks.github.io/Blackstone1943/`

## 一、作品定位

《黑石峪 · 一九四三年冬》——1943 年冬，华北敌后（虚构的太行山区村庄「黑石峪」）。
第三人称潜行动作冒险，《最后生还者》式的**沉浸感、压抑真实的战时氛围、两个角色之间的情感张力**。
Three.js（已 vendor 在 `vendor/three/`，r185，MIT）。约 20—30 分钟一周目。

**一句话**：把一个失去父母的孩子和一台缴获电台的关键零件，从被"扫荡"清剿过的村子，送到十里外的交通站。

### 角色（情感张力是本作的核心资产）
- **沈铁**，38 岁，八路军某部侦察排长。腿部负伤、与部队失散。沉默、务实、手上有血；他把小满当"任务"，后来不是。
- **冯小满**，13 岁，黑石峪儿童团员。父母在扫荡中遇难。认得草药、认得山路、嘴硬心软、会顶嘴、会怕。
- 关系弧：**累赘 → 搭档 → 他为她做了违背命令的选择**。结局在交通站：他向组织隐瞒了一件事，为了让她留下。
- 台词要克制、具体、有生活质感（"先把鞋绑紧"比"我们一定会赢"强一百倍）。禁止口号腔、禁止说教。

### 三幕结构（垂直切片必须全部可玩通）
1. **【雪窖】** 清晨，被烧过的村庄废墟。教学：移动/蹲伏/搜刮/撬门。在磨坊地窖发现小满。伪军搜村小队进村 → 第一次潜行。
2. **【断谷】** 正午，山谷公路、碉堡与哨卡。资源见底。伙伴机制：小满钻狗洞开门、递东西、放风。可选潜行绕过或交火；第一次枪战教学（全身只有 3 发子弹）。
3. **【风雪垭口】** 黄昏转夜，暴风雪，被追击。日军小队搜山：狗、探照灯、照明弹。终局抉择：暴露交通站救小满 / 让她独自走完最后一段。落点是情感，不是战果。

### 历史与伦理红线（**违反即返工，视觉/剧情 agent 有一票否决权**）
- 侵略责任明确：日本侵略军与伪军是加害方，不做"双方各有苦衷"式模糊。
- **不猎奇展示苦难**：不出现尸体特写、血肉、性暴力、虐杀镜头；暴力的重量用声音、留白、事后痕迹表达。
- **平民伤亡与苦难永不计分、不转化为资源或奖励**，只进入"代价"记录。
- 拒绝抗日神剧：主角不是超人，会疼会怕会打空；一个鬼子兵也很难打；正面交火几乎必死。潜行与逃脱永远优于突突突。
- 村庄、人物为虚构复合体，不影射具体真实县份与个人。
- 敌兵是被军国主义驱动的具体的人，不做小丑化处理；但绝不为侵略行为开脱。

## 二、玩法系统（各 agent 在此框架内自主发挥细节）

- **潜行**：蹲伏/伏地、草垛与断墙遮蔽、噪音传播模型（脚步 3m / 奔跑 9m / 开枪 40m / 石块 12m）、敌人注意力条（白→黄→红三段，可回落）、丢石块引开、背后处决（需匕首、有声音、有冷却、绝不炫技）、雪地脚印会被发现（加分项）。
- **枪战**：中正式步枪（栓动，每发要拉栓）、盒子炮（可选，后坐大）、自制手榴弹。**全流程弹药 ≤ 12 发**。瞄准要呼吸晃动、要架枪（靠墙更稳）、命中要有停顿感（hitstop）。
- **近战**：铁锹/刺刀。轻击/重击/格挡/闪避 + 体力条。近战是最后手段，赢了也要付出体力和噪音。
- **生存**：体温（暴雪掉温，篝火/棉衣回温）、失血（绷带止血）、体力、饥饿（干粮）。合成：破布 + 烧酒 → 绷带；火柴 + 松枝 → 火堆。
- **搜集**：抽屉/木箱/水缸/灶台/背包搜刮，交互要有等待条与手部动画感；资源极稀缺；搜刮尸体只写"取走弹药"不做视觉展示。
- **伴随 AI（小满）**：跟随并会主动躲藏、指路、钻小洞开门、递弹药、放风示警、会被抓走触发救援段落、按情境触发台词（不是随机播报，要与玩家行为呼应：你受伤了她会说什么，你杀人了她会怎么看你）。

## 三、技术契约（架构 agent 负责落成代码；其余 agent 严格遵守）

### 目录（全部在项目根目录内，命名遵守仓库 AGENTS.md：英文 PascalCase + 类别前缀，禁止连字符）
```
index.html            页面外壳 + HUD DOM + importmap
Style_Game.css        全部 UI 样式（含移动端与无障碍）
vendor/three/         已 vendor 完毕，勿改
Script_Config.mjs     全部可调常量（唯一数值源）
Script_Math.mjs       随机/噪声/缓动/向量工具
Script_Event.mjs      事件总线
Script_Boot.mjs       入口：装配 + 主循环
Script_Art.mjs        渲染栈：材质库/光照/雾/天空/后处理/天气粒子
Script_World.mjs      地形/村庄/碰撞/导航/掩体/视线/掉落点
Script_Character.mjs  程序化骨骼角色 + 动画状态机（玩家与 NPC 共用）
Script_Player.mjs     第三人称控制器：相机、移动、蹲伏、瞄准、贴墙
Script_EnemyAi.mjs    感知 + 状态机 + 小队协同 + 搜索
Script_Combat.mjs     武器/近战/投掷/伤害/潜行处决
Script_Survival.mjs   资源、合成、体温、背包（与 Rules 对接）
Script_Rules.mjs      纯逻辑（禁止 import three、禁止碰 DOM）：任务状态机、生存数学、探测数学、结算
Script_Story.mjs      剧情导演：节拍推进、小满伴随行为、字幕调度
Data_Story.mjs        全部叙事文本/对白数据（纯数据，零 import）
Script_Audio.mjs      WebAudio 程序化音效与音乐（零音频文件）
Script_Hud.mjs        HUD/菜单/字幕/无障碍/触屏控件绑定
Script_SmokeTest.mjs  node 冒烟测试（必须能 `node Blackstone1943/Script_SmokeTest.mjs` 通过）
AGENTS.md             本项目 agent 指南 + 模块契约 + 所有权表
```

### importmap（index.html 内，固定写法）
```json
{ "imports": {
  "three": "./vendor/three/build/three.module.js",
  "three/addons/": "./vendor/three/examples/jsm/"
} }
```

### 依赖 DAG（**禁止出现循环 import**）
```
Script_Config / Script_Math / Script_Event / Data_Story   ← 叶子，谁都能 import
Script_Art        → Config, Math
Script_World      → Config, Math, Art(材质库)
Script_Character  → Config, Math, Art(材质库)
Script_Rules      → Config                （纯：不得 import three / Art / World）
Script_Survival   → Config, Rules, Event
Script_Combat     → Config, Math, Event, Character
Script_EnemyAi    → Config, Math, Event, Character
Script_Player     → Config, Math, Event, Character
Script_Story      → Config, Event, Data_Story, Rules
Script_Audio      → Config, Math, Event
Script_Hud        → Config, Event, Rules, Data_Story
Script_Boot       → 以上全部
```
跨模块通信一律走 `Script_Event.mjs` 事件总线，**不要互相 import 玩法模块**。

### 共享上下文 `ctx`（由 Boot 创建并逐帧传递给所有 Update）
`{ THREE, scene, camera, renderer, clock, dt, elapsed, random, bus, config, world, art, player, companion, enemies, combat, survival, rules, story, audio, hud, input, debug }`

### 每个玩法模块的统一形状
```js
export function CreateXxx(ctx, options) { /* ... */ return { Update(dt, ctx), Dispose(), /* 该模块公开 API */ }; }
```

### 主循环顺序（Boot 固定）
input → player → companion/story → enemies → combat → survival → world → art.Render → hud → audio

### 事件总线约定（名字固定，各方按需订阅）
`NoiseEmitted{position,radius,kind}`、`GunFired`、`MeleeHit`、`StealthKill`、`ThrowLanded`、
`EnemyAlertChanged{enemyId,level}`、`EnemySpotted`、`EnemyDown`、`SquadAlerted`、
`PlayerDamaged`、`PlayerDowned`、`HealthChanged`、`StaminaChanged`、`WarmthChanged`、
`ItemPicked`、`ItemCrafted`、`AmmoChanged`、`InteractPrompt`、
`ObjectiveChanged`、`StoryBeat{id}`、`Subtitle{speaker,text,duration}`、`CompanionState`、
`WeatherChanged`、`ChapterChanged`、`GameOver{reason}`。

## 四、质量门槛（视觉审查 agent 对照 3A 标准逐轮打分）

必须做到（低于此线就返工）：
1. **第一眼像一个真游戏**：有构图、有光影层次、有雾与景深感的天际线，不是"灰盒子摆在绿地上"。
2. **氛围**：色调统一（冬日冷灰 + 火光暖橙的唯一暖色对比）、体积雾、飘雪、风声、脚步材质区分、镜头呼吸与手持微抖。
3. **角色可读**：轮廓清晰、有重量感、有蹲伏/受伤/紧张的体态差异；动画不能是刚体滑行。
4. **交互反馈**：所有输入 100ms 内有视觉+听觉回应；瞄准/受击/潜行状态在画面上一眼可辨。
5. **性能**：桌面 1080p ≥ 55fps，移动端 ≥ 30fps；draw call 受控（合并几何、共享材质、实例化）。
6. **无 console 报错**，无未捕获 Promise，`node --check` 全过，冒烟测试全过。
7. **移动端可玩**：虚拟摇杆 + 动作键，安全区适配，`@media` 断点，触摸不误触。
8. **无障碍**：所有关键声音有方向字幕，可关闭镜头抖动/闪光，可调字号，键位可见。

## 五、纪律

- 只改自己拥有的文件；需要别的模块提供能力时，在自己文件里通过 `ctx`/事件总线获取，并把需求写进 `AGENTS.md` 的「跨模块需求」小节。
- 每次改完自己跑：`node --check`（对 .mjs 用 `node --input-type=module --check` 或直接 `node --check` 皆可）+ `node Blackstone1943/Script_SmokeTest.mjs`。
- 中文面向玩家，代码/文件名/标识符全英文。变量 lowerCamelCase，函数与文件 PascalCase。
- 禁止新增外部运行时依赖（除已 vendor 的 three）。禁止外链 CDN、字体、图片。所有美术与音频**程序化生成**。
- 提交信息前缀固定：`Blackstone1943: <简短描述>`。
