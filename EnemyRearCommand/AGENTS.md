# EnemyRearCommand ——《烽线 · 敌后指挥》Agent 指南

线上：`https://bentleyblanks.github.io/EnemyRearCommand/`

类型：Three.js 三维六角回合制战役策略。核心参考《统一指挥2》对交通线、战线、包围与战斗预判的表达，但规则、美术、地图、文案和“群众网络”机制均为原创。

## 题材与历史边界

- 地图是综合化的华北敌后战区，不对应单一真实县份；战役覆盖 1937 年秋至 1945 年夏，共 32 回合，一回合一个季度。
- 1945 年日本投降是不可改写的史实终点。玩家改变的是人民与组织付出的代价、根据地存续、交通牵制与战略贡献。
- 平民伤亡、流离、村庄被毁、粮食被夺和骨干损失只进入 `state.ledger`。不得转化为资源、分数或奖励，账本只增不减。
- 文案采用克制、具体的档案式口吻。不伪造历史人物原话，不把侵略者暴行娱乐化。

## 核心玩法契约

1. 地面控制与群众网络是两层空间：占领格子不等于建立根据地；群众基础决定情报、隐蔽、补给接力和撤退安全。
2. 补给从根据地、村镇、缴获点沿道路与群众网络传递。铁路、公路、关隘、桥梁和县城是可争夺的作战脉络。
3. 被敌方控制区或敌军威胁切断的部队进入低补给；完全失去通路则视作孤立。孤立影响移动、战斗、恢复与撤退。
4. 正面强攻不是默认最优解。伏击、破袭、诱敌、包围、夹击、战后转移和敌进我进必须构成不同节奏。
5. 战斗前必须提供有解释的区间预测；战斗后明确显示压制、减员、退却、缴获、暴露与补给变化。
6. AI 应公开多回合意图并产生可反制的压力：守枢纽、修交通、救被围部队、组织扫荡、从据点抽兵形成薄弱窗口。
7. 第 1 回合必须看得见敌军且存在可执行攻击或破袭目标。

## 模块所有权

| 文件 | 职责 |
|---|---|
| `Script_Hex.mjs`、`Script_MapGen.mjs`、`Data_Terrain.mjs` | 地图、交通走廊、战线、关隘、补给节点 |
| `Script_Combat.mjs`、`Data_Units.mjs` | 战斗、协同、包围、单位 |
| `Script_Ai.mjs` | 敌军战役 AI 与意图 |
| `Script_Supply.mjs`、`Script_Rules.mjs` | 补给网络、状态机、回合结算、存档 |
| `Data_Campaign.mjs`、`Data_History.mjs`、`Data_Tech.mjs` | 任务、战役节奏、事件、政策 |
| `Script_Renderer.mjs`、`Script_Materials.mjs`、`Script_Models.mjs`、`Script_Effects.mjs` | Three.js 地图表现、程序化低模、特效 |
| `Script_Ui.mjs`、`Style_Game.css`、`index.html` | HUD、战斗预判、补给/战线图层、响应式 |
| `Script_Audio.mjs` | WebAudio 生成式音乐与反馈 |
| `Script_Main.mjs` | 装配、输入、存档与表现派发 |

并行开发时一个 Agent 只修改自己负责的文件。跨模块字段先在 `Script_Rules.mjs` 给出安全默认值，再由消费方读取。

## 工程约束

- 纯逻辑模块禁止引用 `window`、`document`、`three` 或 `Math.random()`；随机统一走 `Script_Hex.mjs` 的确定性随机。
- 规则 API 对外不可变，任何行动先克隆 state 再推进。
- 零外部运行时依赖。Three.js r160 vendored 在 `vendor/three/`；模型、纹理、特效和音频程序化生成。
- 新文件、函数和资产遵循根 `AGENTS.md` 的英文命名规则。
- 存档键为 `enemyrearcommand_campaign_v1`。状态结构不兼容时必须提升 `saveVersion`。
- 首屏 960×520 以上完整可用；键鼠、触控、键盘按钮和 reduced motion 均需安全降级。

## 验证

```powershell
node EnemyRearCommand/Script_SmokeTest.mjs
```

测试至少锁定：确定性地图、交通与战线契约、第一回合可交战、补给切断和重连、包围/夹击收益、AI 不作弊且可复现、32 回合可跑通、存档往返、账本红线、策略 Bot 排序、零 CDN、CSS 配平与表现层无顶层副作用。

视觉回归需覆盖 1920×1080、1366×768、1024×768 和 390×844，检查控制台错误、文字遮挡、地图可读性、战斗反馈与渲染调用量。

提交信息：

```text
EnemyRearCommand: short change summary
```
