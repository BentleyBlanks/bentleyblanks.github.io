# PrairieFire1937 —— 《燎原 · 敌后1937》 Agent 指南

线上：`https://bentleyblanks.github.io/PrairieFire1937/`
类型：three.js 三维六角回合制策略（4X 骨架 + 敌后游击战主题），零外部运行时依赖。

> 本页与 `TaihangDemo/`、`taihang/` 完全隔离：自己的存档键、自己的 vendor、自己的脚本，不共用任何状态。

## 一、题材边界（改动前必读）

- 场景是**综合化的华北敌后县域**，不对应单一真实县份；战役固定 1937 年秋 — 1945 年夏，共 **32 回合（一回合一个季度）**。
- **1945 年日本投降是不可改写的史实终点。** 玩家能改变的只有人民与组织付出的代价、根据地的存续与建设水平。
- **代价账本红线**：平民伤亡、流离、被焚村庄、粮食被夺、骨干损失只进 `state.ledger`，**绝不转化为资源、分数或任何奖励**。减灾类效果（`seizureResist` / `civilianShelter`）只能压低账本增长，账本项永不为负、永不回落。
- 评分主轴是根据地存续、群众基础、建设水平、人民安全；**歼敌不是主要计分项**，破袭牵制有强收益递减（`GetVictoryAssessment` 里的 `disruption` 用对数封顶）。
- 文案克制、具体、档案式。侵略者暴行如实陈述但不做感官刺激描写；**不得伪造具体历史人物的原话**（`Data_History.quotes` 的出处一律泛化）。

## 二、模块地图与所有权

| 文件 | 职责 | 性质 |
|---|---|---|
| `Script_Hex.mjs` | 轴向坐标契约、确定性随机、噪声。**全项目的地基，改动需全量回归** | 纯逻辑 |
| `Script_MapGen.mjs` + `Data_Terrain.mjs` | 地形生成（太行山脊→丘陵→平原）、河流、铁路、村镇、据点种子 | 纯逻辑 |
| `Script_Rules.mjs` | **集成骨架**：建局、回合结算、产出、群众基础、建设、科技政策、视野情报、存档、终局评定 | 纯逻辑 |
| `Script_Combat.mjs` | 游击战结算：隐蔽/暴露、伏击、缴获、攻坚、撤退、反扫荡 | 纯逻辑 |
| `Script_Ai.mjs` | 日伪军分层 AI：治安战方针 → 扫荡轴线 → 据点战术 | 纯逻辑 |
| `Data_Tech.mjs` / `Data_Units.mjs` / `Data_History.mjs` | 双科技树与政策卡 / 单位与区域 / 时期与史实事件 | 纯逻辑 |
| `Script_Renderer.mjs` + `Script_Materials.mjs` | three.js 场景、地形网格、光照阴影、后处理、拾取、相机 | 渲染 |
| `Script_Effects.mjs` + `Script_Models.mjs` | GPU 粒子特效、天气、行军动画 / 程序化低模与建筑 | 渲染 |
| `Script_Ui.mjs` + `Style_Game.css` | HUD、五大面板、事件卡、小地图、响应式与无障碍 | DOM |
| `Script_Audio.mjs` | WebAudio 现场合成的五声音阶生成式配乐与音效 | 音频 |
| `Script_Main.mjs` | 装配与主循环、输入、存档、特效派发 | 集成 |

**并行改动纪律**：一个 agent 只动自己那一栏的文件。跨模块的字段变更必须先改 `Script_Rules.mjs` 的状态契约，再同步各消费方。

## 三、硬性约束

1. **纯逻辑模块禁止** `window` / `document` / `three` / `Math.random()`。随机一律走 `Script_Hex.mjs` 的 `CreateRng` / `StepRng(state.rngState)`，保证同种子可复现。
2. **渲染模块顶层不得有 DOM/WebGL 副作用**（冒烟测试会扫描并报错）。所有访问放进函数体内。
3. **零外部运行时依赖**：无 CDN、无外部字体/图片/音频文件。纹理程序化生成，模型代码建模，音频 WebAudio 合成。three.js **r160** vendored 在 `vendor/three/`，通过 index.html 的 importmap 解析 `three` 与 `three/addons/`。
4. **对外不可变**：`PerformAction` / `EndTurn` / `SetResearch` 等一律 `CloneState` 后推进，不得就地修改传入的 state。
5. 命名遵守仓库规范：文件名 `<Category>_<PascalCase>.<ext>`、**无连字符**、导出函数 PascalCase、变量 lowerCamelCase。玩家可见文案用中文。
6. 存档键固定 `prairiefire1937_campaign_v1`（设置键 `_settings`、手动档 `_manual`）。改状态结构时必须同步 `saveVersion` 并保证 `DeserializeState` 对旧档安全返回 `null`。

## 四、核心机制速查

- **六种资源**：粮 `grain` / 工 `labor` / 械 `ordnance` / 药 `medicine` / 情报 `intel` / 干部 `cadre`。械主要靠缴获，药永远稀缺，干部最贵。
- **群众基础 `hex.massBase` (0-100)** 是本作最核心的创新层：决定产出系数、情报精度、隐蔽恢复、撤退成功率与控制归属（≥62 根据地 / ≥34 游击区 / ≥12 争夺区）。
- **暴露度 `exposure`** 因进攻上升、每回合衰减；**打完不转移会让暴露度暴涨 3 倍以上**，这是玩家必须内化的节奏。暴露度与警备度共同触发扫荡。
- **敌进我进**：AI 组织扫荡时会从沿线据点真实抽走守备（`stronghold.garrison` 下降且玩家可见），这就是反打其后方的战略窗口。
- **扫荡预警**：`ForecastSweep` 提前 2 回合给出轴线，预警精度取决于该地区的 `hex.intel` 覆盖。
- **五个时期**：开辟(0-5) / 发展(6-13) / 困难(14-21) / 恢复(22-27) / 反攻(28-31)，AI 方针与光照色调随之切换。

## 五、改动后必须做的验证

```bash
node PrairieFire1937/Script_SmokeTest.mjs      # 或 npm run test:prairieFire1937
```

测试锁死这些红线，**不得为了让测试通过而放宽断言**：

- 坐标往返、环/范围格数、随机可复现、噪声平滑
- 地图连通、9 种地形齐全、相邻高差 ≤ 0.285、起始点 2 环内 ≥ 4 村庄、同种子同地图
- 科技树依赖闭合无环、解锁引用的单位/区域/工事/政策全部存在
- **第 1 回合就看得见敌军且够得着攻击目标**
- 行动与 AI 均不修改传入 state；整局 32 回合可跑通并出评级；存档往返一致
- **策略排序：会玩 > 消极不作为，且会玩 > 莽撞拼消耗**；莽撞打法的人民代价显著更高
- 代价账本单调不减、且账本增长的回合资源不得暴涨（防止把代价换成收益）
- 评级闸门（根据地村 < 8 封 C）、破袭得分收益递减且封顶
- 表现层模块顶层无副作用、全项目无 CDN / 无外部资产、页面装配完整、CSS 括号配平与响应式断点、文件命名规范

视觉回归另需在无头 Chromium 里实拍多视口截图（桌面 / 笔记本 / 平板 / 移动），并检查控制台零报错、`renderer.info.render.calls` 处于个位数到低两位数量级。

## 六、交付

站点只从 `master` 部署。提交信息前缀固定：

```text
PrairieFire1937: short change summary
```
