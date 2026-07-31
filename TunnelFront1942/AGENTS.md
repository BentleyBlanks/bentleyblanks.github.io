# TunnelFront1942 《地火线》 —— Agent 指南

线上：`https://bentleyblanks.github.io/TunnelFront1942/`
类型：three.js 三维**双层六角**回合制策略白盒（地道战 · 掩护群众撤离），**PC 优先，触控可用**。
借鉴文明VI 的六角格、回合流程、单位操作与信息呈现；**不是 4X**——没有扩张涂色与科技树，
核心是「**勘察土层、规划并运用地道网络，在敌军扫荡下把群众送出去**」。

> 与 `TaihangDemo/`、`PrairieFire1937/` 等完全隔离：自己的存档键、自己的脚本。
> three.js 复用 `../taihang/vendor/three/`（importmap 指向该路径，不在本目录另存一份）。
> 仓库级纪律（worktree、master 只许快进、命名规范、提交格式）见根目录 `AGENTS.md`。

## 〇、当前状态与沿革

- 本作由前一位 agent（Fable）建立并迭代三轮，现由后续 agent 接手继续 /loop 迭代。
- 轮次记录与独立审查 verdict 见 `CHANGELOG.md`。
- **接手须知**：曾有一条并行的重写线（模块拆分更细、含四 bot 与平衡工具），
  经用户裁决**放弃**，只保留本线。归档 tag：`opus-line-v0.1-archived`（仅供参考，不要合回来）。

## 一、不可动摇的核心与题材红线

1. **核心保留项**：「玩家规划并运用地道网络，对抗敌军的侦察、封锁与扫荡」是主轴。
   地道必须**有代价、有风险、可被反制**——土层决定挖掘代价与噪音、结构会塌、出口会被封、烟会灌进来。
2. 场景是**综合化的冀中平原**，不对应单一真实村庄；不伪造真实历史人物原话。
3. **代价账本红线**：群众伤亡、被抓、房屋被焚只进账本，**绝不转化为资源、分数或奖励**。
   `群众安全` 只会下降不会因战果上升。冒烟测试锁死此项（「civilian harm never creates tools,
   organization, intel, or ammunition」）。
4. **歼敌不是计分项**：战斗只用于打断敌工兵、争取撤离窗口。
5. 文案克制、具体、档案式；白盒不做血腥表现。
6. **不要用堆内容掩盖核心玩法问题**：审查未过的机制先修或删，不添新系统转移注意力。

## 二、玩法骨架（`Data_Level.mjs` + `Script_Rules.mjs` 为准）

- **关卡**：11 回合；第 4 回合起可送群众；第 5 回合扫荡开始；需送出 3 批共 8 名群众（`MissionConfig`）。
- **资源五项**：工具 15 / 组织 6 / 情报 0 / 暴露 12 / 群众安全 100。
- **地形**（`TerrainCatalog`）：麦田 / 枣林 / 村落 / 封锁路 / 干沟 / 苇塘，各有 moveCost 与 cover。
- **土层**（`SoilCatalog`，本作的规划核心）：
  | 土层 | 挖掘成本 | 稳定度 | 噪音 | 特性 |
  |---|---|---|---|---|
  | 夯土 packed | 1 | 3 | 4 | 稳固，适合主干道 |
  | 黏土 clay | 2 | 4 | 3 | 费工具，但显著减缓烟流 |
  | 树根层 root | 1 | 3 | 8 | 开挖声大，易留地表证据 |
  | 返沙层 loose | 1 | 1 | 6 | 下回合开裂，必须支护 |
- **玩家动作**（`ActionIds`）：Move / EnterTunnel / ExitTunnel / Dig / Brace 支护 / Recon 侦察 /
  Decoy 假迹 / Ambush 伏击 / Trap 陷阱 / Attack / Evacuate 送群众 / ClearSeal 清除封堵 / EndTurn。
- **当前回合路径**：`GetActionPathPlans` 默认只为 Move / Dig 生成无歧义的本回合连续终点；
  CLI 的 `legal` 可请求 `includeAmbiguous`，用完整 route 分别列出共享终点的明确分支；
  `ApplyPlayerActionPath` 必须逐步重放 `ApplyPlayerAction`，不跨回合、不自动结束、不自动支护或改道。
  走廊外未知土层、返沙开裂、烟段、进入敌军视线、伏击离位与接通出口都要强制停下重新确认；
  规划侦察须揭示两条候选走廊的逐格土层，保证已选走廊上的连续开挖真实可用。
- **撤离预测**：`GetCivilianTransitEstimate` 必须复用正式群众推进规则，保持纯读，并只使用玩家公开信息；
  未揭示的敌军意图不得改变出口窗口或预测。`remainingSchedule` 是“当前候选批次占用本回合发车位后”的
  剩余排班条件下界：固定当前已通路线，假设下一批前不再开路/抢通，且不计敌军、拥堵与其他新风险；
  UI/CLI 必须连同这些条件展示，不能把它表述成无条件必败或胜利承诺。
- **在途预测**：`GetActiveCivilianTransitEstimate` 只接受 `Moving` / `Trapped` 批次，必须把到口回合与安全回合分开，
  保留当前队列、路径位置、烟流、封口、塌方及公开预警，并忽略未揭示意图和未来 `PlanEnemyTurn`。
  `recoveryActions[].ifAppliedNow` 只允许来自当前真实合法动作的反事实：支护、出口复查、抢通、重挖、
  公开预警绑定的设陷/伏击或地面压制；预计造成的不可逆群众安全损失也必须在 UI/CLI 成本中明示。
  尚需移动/资源时只能列 `recoveryNeeds`，不得承诺 ETA。`Trapped` 不等于终态：群众所在格塌方可由相邻地道队重挖恢复，
  但前方格中断的现行规则没有已知恢复动作。UI 在途/被困卡可点开只读时刻表，Safe 卡保持禁用；CLI `show` / `legal` 同步输出。
- **敌军意图**（`EnemyIntentIds`，明牌可预读）：Patrol / Investigate / Attack / PrepareSeal→ResolveSeal
  封堵出口 / PrepareSmoke→ResolveSmoke 灌烟 / Search / Stalled。**两段式意图（Prepare→Resolve）是
  玩家的反制窗口**，不得改成一回合完成。工兵在多个已确认洞口间先比较未过期公开证据强度、
  再比较距离；假迹必须遵守认领归属且只消费一次调查行动，不得借“已确认洞口”重复生效。
- **胜利**：3 批共 8 人全部 Safe，且 `tunnelsDug ≥ 1`、`planningReconCompleted`、`sweepActive`、`turn ≥ 6`
  ——即**不许抢在扫荡到来前跑光**，必须在压力下完成转移。
- **失败**：`peopleSafety ≤ 45`（转移秩序崩溃）或存活骨干 < 2。
- **路线分类** `ClassifyRoute`：ambush / deception / interdiction / stealth ——
  用于识别玩家走的是哪条策略路线，**是「多种策略」这一验收标准的机器表达**，
  改动玩法时必须保证四条路线都仍然走得通。

## 三、模块与所有权（并行改动纪律：一个 Agent 只动自己那栏）

| 文件 | 职责 | 性质 |
|---|---|---|
| `Data_Level.mjs` | 关卡配置、地形表、土层表、地图布局、群众批次 | 数据 |
| `Script_Rules.mjs` | **规则内核**：建局、动作合法性与结算、敌军信念与规划、撤离、结算评定、存档 | 纯逻辑 |
| `Script_Game.mjs` | three.js 场景、双层渲染、输入、HUD 装配 | 表现层 |
| `Script_PlayCli.mjs` + `Script_AsciiMap.mjs` | 审查用命令行完整游玩接口与双层 ASCII | 审查接口 |
| `Script_SmokeTest.mjs` | node 冒烟，退出码即成败 | 质检 |
| `Style_Game.css` / `index.html` | 样式与页面（importmap → `../taihang/vendor/three/`） | 表现层 |

## 四、硬性约束

1. **纯逻辑模块禁止** `window` / `document` / `three` / `Math.random()` / `Date.now()`；
   随机走状态内的确定性随机源，保证同种子可复现、存档读档续跑一致。
2. 规则内核对外接口不得就地修改传入 state（`ApplyPlayerAction` / `RunEnemyPhase` / `AdvanceTurn`）。
   连续路径失败也必须原子返回原 state；禁止按路径长度汇总扣费、直接写终点或合并逐格证据。
3. 表现层不自己算规则；玩家看不见的敌军信息不得泄漏到 UI 或日志。
4. 零外部运行时依赖：无 CDN、无外部字体/图片/音频。three.js 走 `../taihang/vendor/three/`。
5. three r152+ 颜色只转换一次：`new THREE.Color(hex)` 已 sRGB→Linear，禁止再叠 `convertSRGBToLinear()`。
6. 改动游戏脚本后必须 bump `index.html` 里的 `?v=` 缓存参数。
7. 命名遵守根 AGENTS.md：文件 PascalCase + `Script_`/`Data_`/`Style_` 前缀；导出函数 PascalCase、
   变量 lowerCamelCase；玩家可见文案中文。

## 五、测试与验收

### 5.1 冒烟（必须全绿）

```
node TunnelFront1942/Script_SmokeTest.mjs      # 退出码即成败
```
根 `package.json` 已挂 `test:tunnelFront1942`。断言覆盖：规则契约、撤离物流、敌军封堵/灌烟的
两段式反制窗口、代价账本红线（群众受难绝不产出资源）、存档 round-trip、页面装配。

### 5.2 独立玩法审查（每轮必做，五项标准）

审查 Agent **只读 `README.md` 与 CLI**（不读设计文档与源码），完整游玩多局多策略后逐项 PASS/FAIL：
① 核心循环清晰有趣；② 地上与地下都有意义；③ 敌军能合理反制玩家套路；④ 存在多种可行策略
（对照 `ClassifyRoute` 的四条路线）；⑤ 无重复劳动、无唯一最优解。结论进 `CHANGELOG.md`。

### 5.3 浏览器实测

Playwright（根 `playwright-core`，chromium 在 `/opt/pw-browsers/chromium`，需显式
`executablePath`）：加载页面断言零 console error，切层、选中下令、结束回合跑敌军阶段，截图检查。

## 六、迭代循环（/loop）

设计 → 实现 → 完整游玩 → 独立审查 → 修改或删除 → 再次验证 → 提交 + 部署。
每轮：冒烟全绿 → commit（`TunnelFront1942: 摘要`，无句号结尾）→ push 会话分支 →
**快进** `git push origin HEAD:master`（站点只从 master 部署，禁 force）→
`curl -sI https://bentleyblanks.github.io/TunnelFront1942/` 验证 → 更新 `CHANGELOG.md`。
