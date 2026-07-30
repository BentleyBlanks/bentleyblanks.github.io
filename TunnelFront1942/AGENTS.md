# TunnelFront1942 —— 《地下长城 · 冀中1942》 Agent 指南与设计基线

线上：`https://bentleyblanks.github.io/TunnelFront1942/`
类型：three.js 三维**双层六角**回合制策略白盒（地道战 · 反扫荡），**PC 优先**。
借鉴文明VI 的六角格、回合流程、单位操作与信息呈现方式；**不是 4X**——没有扩张涂色与科技膨胀，
核心是「规划和运用地道网络，对抗敌军扫荡」。

> 本页与 `TaihangDemo/`、`PrairieFire1937/` 等完全隔离：自己的存档键（`tunnelfront1942_v1`）、
> 自己的 vendor（three r160，复制自 PrairieFire1937）、自己的脚本。
> 仓库级纪律（worktree、master 只许快进、命名规范、提交格式）见根目录 `AGENTS.md`，先读那份再读这份。

## 〇、当前状态

- R0：脚手架 + 设计种子（本文档）。轮次记录见 `CHANGELOG.md`，独立审查记录见 `CHANGELOG.md` 各轮 verdict。

## 一、不可动摇的核心与题材红线（改动前必读）

1. **核心保留项**：无论如何重设计，「玩家规划并运用地道网络，对抗敌军的侦察、封锁与扫荡」必须是
   游戏的主轴。地道必须是**有代价、有风险、可被反制的真实战略空间**，不是装饰或无风险传送门。
2. **场景是综合化的冀中平原敌后村落群**，不对应单一真实村庄；村名一律虚构（马家河、赵家窑、高家坡等），
   不使用真实历史村庄名，不伪造真实历史人物原话。
3. **代价账本红线**（与本仓库 PrairieFire1937 一致）：群众伤亡、被抓、房屋被焚、粮食被夺、骨干牺牲
   只进 `state.ledger`，**绝不转化为资源、分数或任何奖励**；减灾类效果只能压低账本增长。
   账本项永不为负、永不回落。
4. **歼敌不是主要计分项**：评级主轴是「人民与根据地的保存」；歼敌与牵制收益用对数封顶。
5. 文案克制、具体、档案式；不做感官刺激的暴行描写，白盒阶段不做血腥表现。
6. **不要用堆内容掩盖核心玩法问题**：审查未过的机制先修或删，不添新系统转移注意力。

## 二、玩法规则 v1（设计种子 · 供设计委员会修订）

每条规则标注：【MUST】核心不可删 /【SHOULD】强烈建议 /【CUT-OK】v1 可删。

### 2.1 一句话与核心循环

> 敌人在头顶搜庄，你在地下调兵——把整个村庄群变成一件武器。

核心循环【MUST】：
**情报（上级通报敌情）→ 平静期备战（挖网/藏粮/组织）→ 扫荡期周旋（藏 / 转移 / 诱敌 / 伏击 / 破袭）→
敌军撤退 → 结算恢复 → 下一波更强的扫荡**。

紧张感引擎（双时钟）【MUST】：
- 敌军每回合都在**积累搜索进度**、抢走地面存粮：**纯缩头会输**（入口被逐个挖出、粮尽、无通风闷人）。
- 敌军有**行动力池**：伤亡、拖延、破路会加速其撤退：**主动袭扰能提前结束扫荡**，但每次出手都冒暴露风险。

### 2.2 回合与阶段【MUST】

- 关卡 = 若干「波次」：`平静期(约4回合) → 扫荡期(6~12回合) → 平静期 → 扫荡期(更强)…`。
- 每回合：**玩家阶段**（文明式逐单位操作，可任意顺序，支持「下一个未行动单位」循环）→
  **敌军阶段**（逐纵队行动，玩家可见范围内动画/事件逐条播报）→ **结算**（产出、烟/水蔓延、憋闷、
  搜索判定、情报刷新、胜负检查）。
- 单位有 2 移动力（MP）+ 一个「主动作」（挖掘/攻击/伏击等，用后该单位本回合结束）。

### 2.3 地图与地形【MUST】

- 单关地图约 11×9 轴向矩形（±些许），平顶六角。地形：
  `village 村庄`（3 个村 + 1 个区队部所在主村，若干格团簇）、`field 农田`、`woods 树林`、
  `grave 坟地`、`river 河沟`（不可挖穿、灌水源）、`open 开阔地`；`road 道路` 是格上叠加旗标，
  敌纵队沿路移动更快；【SHOULD】后期波次在路口出现 `tower 炮楼`。
- 地形属性：掩护（隐蔽加成）、可挖性、入口初始隐蔽度（村3/林3/坟3/田2/开阔1）。

### 2.4 双层战场与地道系统【MUST——本作灵魂】

- 每格 = 地表格 + 地下格。地下初始几乎为空（区队部有 1 个起始入口 + 2 格地道）。
- **挖掘**：从已有地道格/入口向相邻格挖；每格需 2 点进度（村庄下 1 点）；河沟下不可挖。
  挖新入口：地下向上打通 2 点进度；地表侧只能在村庄格直接新开（民居内，隐蔽 3）。
- **入口**：地表↔地下的唯一通道，有隐蔽度（1~3）。上下穿越花 1 MP。
  **在敌视线内使用入口 → 该入口立刻暴露（known）**；暴露的入口敌军会利用/破坏。
- **设施**（在已有地道格上挖，各 2 点进度）：
  - `storage 储藏室`：藏粮上限 +6（藏进来的粮敌军抢不走，除非攻入地道）。
  - `vent 通风口`：所在**空气分区**不再积累憋闷；本身有隐蔽度 2，可被搜出后灌烟。
  - `rest 休息室`：容量 +3，驻留可回血。【CUT-OK】
  - `fight 战斗位`（翻口/枪眼）：敌人进入该格时守方先手 +1 伤害。
  - `trap 陷阱`：敌人进入该格受 2 伤并瘫痪一回合，触发后失效。
  - `door 隔断门`（挖在**边**上）：关闭时阻挡烟/水蔓延与敌通行；敌工兵可花 2 回合破门。
- **容量与空气**【MUST 反缩头机制】：每地道格容纳 2 单位/群众批；无通风口的空气分区中，
  地下停留会积累憋闷，憋闷满则每回合掉血，**群众憋闷到阈值会不顾危险自行涌出地面**（后果进代价账本）。
- **自毁封口**【SHOULD】：主动塌毁己方入口，断开敌军利用，需重新挖通。

### 2.5 单位【MUST】

我方（上限约 6 个作战/工作单位 + 群众批次）：

| 单位 | HP | 攻 | MP | 挖掘力 | 说明 |
|---|---|---|---|---|---|
| 游击小队 | 3 | 2 | 3 | 1 | 攻击耗弹药 1；伏击后可「打了就钻」 |
| 民兵组 | 2 | 1 | 2 | 1 | 便宜，多面手 |
| 工作队 | 1 | — | 2 | 2 | 从村庄劳力征来，挖掘/搬运主力，可解散回村 |

敌方（按波次脚本进场，编成纵队）：

| 单位 | HP | 攻 | MP | 搜索力 | 说明 |
|---|---|---|---|---|---|
| 日军步兵班 | 4 | 2 | 2 | 1 | 骨干，视野 2 |
| 伪军队 | 3 | 1 | 2 | 1（无日军督战减半） | 士气差；伏击损伤易导致纵队谨慎 |
| 特务/便衣 | 2 | 1 | 3 | 2 | 【wave2+】伪装为村民标记，近距或行动才现形 |
| 工兵班 | 3 | 1 | 2 | 1 | 【wave2+】执行烟攻/爆破/灌水/破门 |
| 炮楼守备 | — | 2(射程2) | — | — | 【CUT-OK v1】固定据点 |

### 2.6 战斗（确定性，无命中骰）【MUST】

- 攻击 = 主动作，射程 1。伤害 = 攻击力；受击方在掩护地形 -1（最低 1）。
  双方相邻普通对攻：同时互击。
- **伏击**：处于「伏击」状态（在掩护/入口旁设伏）对进入触发区的敌人先手 +1 伤害、无反击；
  伏击击杀且身处未暴露入口格 → 可免费转入地下（「打了就钻」）。
- **缴获**【MUST 反缩头经济】：伏击/近战击杀日军 +2 弹药、伪军 +1。弹药是攻击的燃料——
  不出手就没有弹药，出手才能维持战斗力。
- 地道内战斗：敌人视野 1、攻击 -1（地形不熟）；踩陷阱/撞战斗位按设施规则结算。

### 2.7 侦察、隐蔽与暴露【MUST】

- 敌单位视野 2（树林/村庄阻挡视线延伸）。我方地面单位在敌视线内即被发现并被追击；
  「隐蔽」状态 + 掩护地形可不被发现（移动即解除）。地下单位敌军完全不可见（除非攻入地道）。
- **搜索**：敌单位主动作「搜索」向所在格累计搜索力；累计 ≥ 入口隐蔽度×2 → 入口暴露。
  玩家对看得见的搜索行为能看到**进度豆**（文明式明牌信息：「这个入口还有 2 回合被搜出」）。
- **佯动**【SHOULD 诱敌核心】：单位主动现身（不暴露入口），在敌情报中留下「目击」，
  牵引纵队改道——把敌人拖离粮仓、拖进伏击口袋、拖过陷阱区。
- 情报分级：波次开始必有「上级通报」（入侵方向/兵力/目标村，永远明牌）；
  纵队**下一步意图箭头**在被我方单位或组织度≥2 的村庄哨网看见时显示，否则显示最后目击虚影。

### 2.8 敌军扫荡与反制【MUST】

- 每波敌军按脚本从地图边缘进场，编成 2~3 个纵队，各有目标村与规划路线（可被佯动/目击改变）。
- 进村后逐回合：抢夺**未藏入地下**的存粮、按波次脚本焚房（进代价账本）、执行搜索。
- **反地道作战**（wave2+，入口暴露后工兵选择）：
  - `烟攻`：烟雾沿开放边蔓延，隔断门可挡；烟中每回合掉血、群众恐慌外涌。
  - `爆破`：毁掉入口及该格设施，格内单位重伤。
  - `灌水`：仅入口邻河沟时可用，水沿开放边蔓延，淹没格不可通行。
  - `攻入`：小队下地道逐格推进（吃陷阱/战斗位亏）。
- **行动力池**：每波敌军有行动力（如 18）；超过第 3 回合每回合 -1（战线补给压力）、
  损失 1 单位 -2、破路致补给中断每回合额外 -1。池空 → 次回合宣布撤退并退场。
  硬上限回合数到也撤。**伤亡会让纵队进入 2 回合「谨慎」（并队、减速）**——袭扰实际改变敌行为。
- 波次升级：wave1 搜粮为主（无反地道）；wave2 +特务+工兵+反地道；【CUT-OK】wave3 铁壁合围+炮楼。

### 2.9 经济与群众【MUST】

- 资源三种：**粮食**（村庄地面粮仓 + 地下储藏室；平静期村庄少量产出）、**劳力**（村庄人口池，
  征工作队/挖掘的来源）、**弹药**（只靠开局配给 + 缴获）。
- 藏粮：单位在入口旁执行「藏粮」把地面粮搬入地下储藏室（每次 3）；组织度≥1 的村平静期每回合自动藏 1。
- 转移群众：单位在村执行「组织转移」把 3 批群众送入相邻地道网；地道里的群众受空气/容量约束。
- 组织：单位在村执行「组织」提升组织度（0~3）：加自动藏粮、开哨网情报、征兵折扣。
- 征募：消耗劳力+粮，在村征民兵/工作队。**群众伤亡永不产生任何收益**（红线）。

### 2.10 胜负与评级【MUST】

- 失败（立即）：区队部主村被敌连续占领 3 回合；或我方作战单位全灭；或人口跌破开局 50%。
- 胜利：撑过全部波次（敌撤退）。
- 评级（0~100 → S/A/B/C/D）：基分 − 代价账本扣分（群众伤亡/被抓/焚房/夺粮/骨干）
  + 保存分（人口/存粮/组织度/地道网存续）+ 歼敌牵制分（**对数封顶**）+ 提前逼退奖励。
  群众伤亡有硬封顶闸门（≥5 最高 B，≥10 最高 C）。

### 2.11 防退化策略设计意图（审查 Agent 按此逐项攻击）

| 退化策略 | 必须被什么规则打败 |
|---|---|
| 纯缩头（全程躲地道） | 搜索进度持续累计挖出入口链；地面粮被抢光→饥荒；无通风憋闷+群众外涌；评级的保存分与逼退分拿不到 |
| 纯莽夫（不挖地道对射） | 敌正面战力碾压 + 弹药枯竭 + 无处补员 |
| 无脑全图挖网 | 挖掘消耗平静期有限劳力回合；入口越多暴露面越大；无设施的裸网挡不住烟/水 |
| 单一安全屋 | 单入口=被堵死/闷死；烟攻惩罚无隔断/无二口的网络拓扑 |
| 永远佯动放风筝 | 佯动不产生资源；敌谨慎状态并队后风筝失效；粮/组织度荒废 |

## 三、状态契约（两个实现 Agent 共同的法律）

顶层 `state` 可 JSON 序列化、`CloneState` 深拷贝、同种子同操作序列必须逐字节一致：

```js
state = {
  meta: { level: "L1", seed: 7, turn: 1, phase: "player" },      // phase: player|enemy|resolve|over
  wave: { index: 0, status: "quiet",            // quiet|sweep|withdrawing
          quietTurnsLeft: 4, sweepTurn: 0, pool: 18, maxTurns: 12, cautionTurns: 0 },
  rngState: 123456,                              // 只经 StepRng 推进
  map: { hexes: { "q,r": { terrain, road: false, roadBroken: 0, villageId: null } },
         villages: { v1: { name, hexKeys: [], pop, popStart, grainOpen, organize, hasHq, burned } } },
  tunnels: {
    cells:     { "q,r": { facilities: { storage: {grain}, vent: true, rest: true, fight: true },
                          trapArmed: false, smoke: 0, water: 0, civs: 0, civBreath: 0 } },
    edges:     { "q,r|q2,r2": { door: null } },  // 键为排序后的两格键拼接；存在即挖通
    entrances: { "q,r": { conceal: 3, known: false, collapsed: false } },
    digs:      { siteKey: { kind, target, need, progress } },
  },
  units: { u1: { id, side: "ally",              // ally|enemy
                 type,                            // guerrilla|militia|workteam|inf|puppet|spy|sapper
                 hp, mp, acted: false, layer: "surface",  // surface|under
                 pos: "q,r", stance: "normal",   // normal|hidden|ambush|stunned
                 breath: 0, ammoNote: null } },
  resources: { ammo: 4 },
  enemy: { columns: [ { id, unitIds: [], targetVillage, route: ["q,r"], mode } ],
           knownEntrances: [], searchProgress: { "q,r": 0 }, sightings: { unitId: {pos, turn} } },
  ledger: { civDead: 0, civTaken: 0, housesBurned: 0, grainSeized: 0, cadresLost: 0 },  // 永不回落
  score: { enemyLosses: { inf: 0, puppet: 0, spy: 0, sapper: 0 }, withdrewEarlyTurns: 0 },
  log: [ { turn, kind, text, hex? } ],           // 玩家可见事件流
  result: null,                                  // | { won, grade, points, breakdown }
}
```

约定：
- 所有键名 lowerCamelCase；格键一律 `HexKey(q,r)` 字符串；边键 = 两个格键按字典序 `a|b` 拼接。
- **纯逻辑模块禁止** `window` / `document` / three / `Math.random()` / `Date.now()`；
  随机一律 `StepRng(state.rngState)` 并写回。
- `PerformAction` / `EndTurn` 等对外接口一律 `CloneState` 后推进，**不得就地修改传入 state**，
  返回 `{ state, events }`。
- 渲染/UI 永远不自己算规则；一切「玩家能看到什么」由 `Script_Visibility.mjs` 的
  `DeriveView(state)` 给出（可见敌单位、虚影、意图箭头、搜索进度豆、烟水层、可达格、合法动作）。

## 四、动作协议（`Script_Actions.mjs`）

`LegalActions(state, unitId?) → [action]`；`PerformAction(state, action) → { state, events, illegal? }`。
动作为纯 JSON（CLI 与 UI 共用同一协议）：

```
{type:"Move", unit, path:["q,r",...]}          {type:"UseEntrance", unit}          // 上/下穿越
{type:"Dig", unit, target:"q,r"}               {type:"DigEntrance", unit, at:"q,r"}
{type:"DigFacility", unit, cell:"q,r", facility:"storage|vent|rest|fight|trap"}
{type:"DigDoor", unit, edge:"a|b"}             {type:"ToggleDoor", unit, edge}
{type:"Ambush", unit}   {type:"Hide", unit}    {type:"Attack", unit, target}
{type:"Feint", unit}    {type:"BreakRoad", unit}
{type:"HideGrain", unit}                       {type:"MoveCivs", unit, count}
{type:"Organize", unit} {type:"Recruit", villageId, kind:"militia|workteam"}
{type:"Collapse", unit, at:"q,r"}              {type:"Disband", unit}   // 工作队回村
{type:"Rest", unit}     {type:"EndTurn"}
```

## 五、模块地图与所有权（并行改动纪律：一个 Agent 只动自己那栏）

| 文件 | 职责 | 领域 |
|---|---|---|
| `Script_Hex.mjs` | 坐标契约与确定性随机（**冻结**，改动需全量回归） | 地基 |
| `Data_Rules.mjs` | 全部可调数值 `CFG` + 地形/单位/设施定义表 + 文案 | 数值平衡 |
| `Data_Levels.mjs` | 关卡：手工地图布局、波次脚本、目标、教学提示 | 关卡任务 |
| `Script_State.mjs` | 建局、CloneState、序列化、选择器（分区/容量/连通） | 核心玩法 |
| `Script_Actions.mjs` | 合法动作枚举与结算 | 核心玩法 |
| `Script_Visibility.mjs` | 视线、暴露、搜索、情报、`DeriveView` | 核心玩法 |
| `Script_EnemyAi.mjs` | 波次脚本执行、纵队规划、搜索/反地道决策、行动力池 | 敌军 AI |
| `Script_Turn.mjs` | 回合管线：敌阶段→结算→胜负；波次切换 | 核心玩法 |
| `Script_Bots.mjs` | 乱打/缩头/莽撞/会玩 四个策略 bot | 数值平衡 |
| `Script_PlayCli.mjs` | 审查 Agent 的完整游玩接口（见 §7.3） | 审查接口 |
| `Script_AsciiMap.mjs` | 双层 ASCII 地图渲染（CLI 用） | 审查接口 |
| `Script_SmokeTest.mjs` | node 冒烟：契约/纯度/确定性/策略排序/页面装配 | 质检 |
| `Script_Balance.mjs` | 多种子批量模拟与统计输出 | 数值平衡 |
| `Script_Renderer.mjs` | three 场景：双层六角、单位、覆盖层、拾取、相机 | 表现层 |
| `Script_Ui.mjs` | HUD/面板/事件log/提示/存档 UI | 表现层 |
| `Script_Main.mjs` | 装配、输入、主循环、`window.TunnelFront` 调试接口 | 表现层 |
| `Style_Game.css` / `index.html` | 样式与页面（importmap → `vendor/three/`） | 表现层 |

跨模块字段变更必须先改本文件 §三 的状态契约，再同步各消费方。

## 六、工程纪律

1. 命名遵守根 AGENTS.md：文件 PascalCase + `Script_`/`Data_`/`Style_` 前缀；导出函数 PascalCase，
   变量 lowerCamelCase；玩家可见文案中文。
2. 零外部运行时依赖：无 CDN、无外部字体/图片/音频；three r160 已 vendor。
3. 渲染模块顶层不得有 DOM/WebGL 副作用（冒烟会扫描）；单一渲染路径、不分画质档 shader。
4. three r152+ 颜色只转换一次：`new THREE.Color(hex)` 已做 sRGB→Linear，
   **禁止再叠 `convertSRGBToLinear()`**。
5. 性能底线：六角格与单位用 Instanced/合批网格；白盒目标 60fps @ 1080p。
6. 改动游戏脚本后必须 bump `index.html` 里的 `Script_Main.mjs?v=N` 缓存参数。

## 七、测试与验收

### 7.1 冒烟（`node TunnelFront1942/Script_SmokeTest.mjs`，退出码即成败，必须 < 90s）

- 坐标/状态契约、动作合法性模糊测试（随机 bot 数百回合无崩溃、无负资源、无 MP 越界）。
- 确定性：同种子同动作序列 → 终局状态 JSON 哈希一致。
- 纯度扫描：核心模块源码不得含 `window|document|three|Math.random|Date.now`。
- **策略排序红线**：`会玩 > 缩头`、`会玩 > 莽撞`（胜负与评级双排序）；
  **缩头必须输掉或 ≤C**；**莽撞（不挖地道）必须失败**。这是「地道有意义 + 无缩头最优解」的机器闸门。
- 页面装配：index.html 引用存在、importmap 正确、缓存参数一致。

### 7.2 浏览器实测（表现层 / 操作反馈领域）

- Playwright（仓库根 `playwright-core`，chromium 在 `/opt/pw-browsers`）：真实点选单位→高亮→
  下达移动/挖掘、切层视图、结束回合跑敌阶段、截图检查。

### 7.3 审查 Agent 完整游玩接口（`Script_PlayCli.mjs`）

```
node TunnelFront1942/Script_PlayCli.mjs new  --level L1 --seed 3 --save /tmp/g.json   # 开局+简报+ASCII
node TunnelFront1942/Script_PlayCli.mjs show --save /tmp/g.json --layer both          # 双层地图+单位表
node TunnelFront1942/Script_PlayCli.mjs legal --save /tmp/g.json [--unit u1]          # 合法动作清单
node TunnelFront1942/Script_PlayCli.mjs act  --save /tmp/g.json --json '{...}'        # 执行+事件回报
node TunnelFront1942/Script_PlayCli.mjs end  --save /tmp/g.json                       # 结束回合→敌阶段全过程
node TunnelFront1942/Script_PlayCli.mjs run  --level L1 --seed 3 --bot Skilled        # bot 整局→总结 JSON
```

输出必须让「只读文档的外人」能完整游玩：每步都带可见事件、双层 ASCII、资源/波次/池状态。

### 7.4 独立玩法审查（每轮流程，五项标准）

审查 Agent **只读 `README.md` 与 CLI**（不读设计文档与源码）完整游玩多局多策略后按五项打分：
① 核心循环清晰有趣；② 地上与地下都有意义；③ 敌军能合理反制玩家套路；④ 存在多种可行策略；
⑤ 无重复劳动、无唯一最优解。全 PASS 才算达标；结论记入 `CHANGELOG.md`。

## 八、交付流程

1. 会话分支：`claude/tunnel-warfare-strategy-demo-1ilbhs`；提交信息 `TunnelFront1942: 摘要`（无句号结尾）。
2. 每轮：冒烟全绿 → commit → push 分支 → **快进** `git push origin HEAD:master`（站点只从 master 部署，
   禁 force）→ `curl -sI https://bentleyblanks.github.io/TunnelFront1942/` 验证。
3. 根 `package.json` 挂 `test:tunnelFront1942` 并入总 `test` 链。
