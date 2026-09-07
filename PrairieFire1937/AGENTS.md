# PrairieFire1937 —— 《燎原 · 敌后1937》 Agent 指南

线上：`https://bentleyblanks.github.io/PrairieFire1937/`
类型：three.js 三维六角回合制策略（4X 骨架 + 敌后游击战主题），**仅支持 PC 端**。

> 本页与 `TaihangDemo/`、`taihang/` 完全隔离：自己的存档键、自己的 vendor、自己的脚本，不共用任何状态。
> 仓库级纪律（**本机主检出多 agent 共用，任何改动必须在独立 git worktree 里做**、分支命名、
> master 只许快进）见根目录 `AGENTS.md`，先读那份再读这份。

## 〇、当前状态（2026-07 交接快照）

见 [系统与历史参考](Data_AgentReference.md) 对应章节；仅在相关任务中查阅。

## 一、题材边界（改动前必读）

- 场景是**综合化的华北敌后县域**，不对应单一真实县份；战役固定 1937 年秋 — 1945 年夏，共 **32 回合（一回合一个季度）**。
- **1945 年日本投降是不可改写的史实终点。** 玩家能改变的只有人民与组织付出的代价、根据地的存续与建设水平。
- **代价账本红线**：平民伤亡、流离、被焚村庄、粮食被夺、骨干损失只进 `state.ledger`，**绝不转化为资源、分数或任何奖励**。减灾类效果（`seizureResist` / `civilianShelter`）只能压低账本增长，账本项永不为负、永不回落。
- 评分主轴是根据地存续、群众基础、建设水平、人民安全；**歼敌不是主要计分项**，破袭牵制有强收益递减（`GetVictoryAssessment` 里的 `disruption` 用对数封顶）。
- 文案克制、具体、档案式。侵略者暴行如实陈述但不做感官刺激描写；**不得伪造具体历史人物的原话**（`Data_History.quotes` 的出处一律泛化）；事件插画**不要血腥画面**。

## 二、模块地图与所有权

| 文件 | 职责 | 性质 |
|---|---|---|
| `Script_Hex.mjs` | 轴向坐标契约、确定性随机、噪声。**全项目的地基，改动需全量回归** | 纯逻辑 |
| `Script_MapGen.mjs` + `Data_Terrain.mjs` | 太行地貌生成（山脊→丘陵→平原）、河流、铁路、村镇、据点种子 | 纯逻辑 |
| `Script_Rules.mjs` | **集成骨架**：建局、回合结算、产出、群众基础、建设、科技政策、视野情报、存档、终局评定 | 纯逻辑 |
| `Script_Combat.mjs` | 游击战结算：隐蔽/暴露、伏击、缴获、攻坚、撤退、反扫荡。`ResolveHexStats` 统一地形+工事叠加 | 纯逻辑 |
| `Script_Ai.mjs` | 日伪军分层 AI：五方针治安战 → 扫荡轴线 → 据点战术 | 纯逻辑 |
| `Data_Tech.mjs` / `Data_Units.mjs` / `Data_History.mjs` | 双科技树与政策卡 / 单位与区域 / 时期与史实事件 | 纯逻辑 |
| `Data_Assets.mjs` | **可选**外部资产清单（BGM 5 / SFX 16 / 事件插画 8），默认不发任何请求 | 数据 |
| `Script_Renderer.mjs` + `Script_Materials.mjs` | three.js 场景、连续地形网格、光照阴影、后处理、拾取、相机 | 渲染 |
| `Script_Effects.mjs` + `Script_Models.mjs` | 合批粒子特效、天气、行军动画 / 程序化低模与建筑 | 渲染 |
| `Script_Ui.mjs` + `Style_Game.css` | HUD、五大面板、事件卡、小地图、**屏幕空间单位牌 pf-plate** | DOM |
| `Script_Audio.mjs` | WebAudio 五声音阶生成式配乐与音效；外部整轨 BGM/SFX 接管通道 | 音频 |
| `Script_Main.mjs` | 装配与主循环、输入、存档、特效派发、`window.PrairieFire` 调试接口 | 集成 |
| `Script_SmokeTest.mjs` | Node 冒烟（规则/经济/AI/命名/断点红线）；数量以实际套件为准 | 测试 |
| `Script_ClickSmokeTest.mjs` + `Script_RenderHealthTest.mjs` + `Script_BrowserTestKit.mjs` | 浏览器实测：真实鼠标 8 项交互、GL/shader 健康 3 视口 | 测试 |

**并行改动纪律**：表中列的是模块职责，编辑归属以本次明确分工为准；独立任务可修改实现所需的相关模块。跨模块的字段变更必须先改 `Script_Rules.mjs` 的状态契约，再同步各消费方。

## 三、硬性约束（每一条背后都有一次真实翻车）

1. **纯逻辑模块禁止** `window` / `document` / `three` / `Math.random()`。随机一律走 `Script_Hex.mjs` 的 `CreateRng` / `StepRng(state.rngState)`，保证同种子可复现。
2. **渲染模块顶层不得有 DOM/WebGL 副作用**（冒烟测试会扫描并报错）。所有访问放进函数体内。
3. **单一渲染路径**：画质档在 UI 上还有四个名字，但全部映射到同一个 `singleQualityProfile`。
   **禁止再引入分档 shader define 分支**——曾经 ultra 档的 CSM 宏组合让片元着色器编译失败
   （`'[]' : array index out of range`，GL 1282），three 静默吞掉，用户 Edge 上整个地图消失。
   分档 = 制造一条你没验证过的 shader 编译路径。设备差异只由 `Resize()` 里的 pixelRatio 降档吸收。
4. **仅支持 PC 端（决策级）**：移动/平板断点已全部删除，冒烟测试反向锁死
   `max-width: 1199/900/640/380px` 不得回潜。视口门槛 `#pcGate` 为 960×520，必须保留
   "仍要进入"出口——Windows 125%/150% 缩放会把 1366×768 的真实笔记本压到 CSS 1092×614。
5. **零外部运行时依赖，唯一例外是可选资产槽位**：无 CDN、无外部字体；纹理程序化、模型代码建模、音频 WebAudio 合成。three.js **r160** vendored 在 `vendor/three/`，importmap 解析 `three` 与 `three/addons/`。可选资产（`Assets/` 目录）**默认零请求**，仅 URL 带 `?assets=1` 时经 `CREDITS.md` 哨兵探测后启用——浏览器网络层的 404 红字是 catch 不掉的，别把探测改成"直接试着加载"。
6. **对外不可变**：`PerformAction` / `EndTurn` / `SetResearch` 等一律 `CloneState` 后推进，不得就地修改传入的 state。
7. **颜色只转换一次**：three r152+ 的 ColorManagement 下 `new THREE.Color(hex)` 已经做了 sRGB→Linear，
   **再调 `convertSRGBToLinear()` 会把颜色二次压暗**（#5f6d7c 直接压到 14% 亮度，全场模型发黑）。
8. **地形几何红线**：`worldConfig.tileRadius` 必须是 `1.0`（0.985 是有侧壁时代的遗物，会让全图勾缝漏光）；
   相邻格共享角点高度必须经 `CornerBlend` 取三格平均；解析法线之后必须过 `WeldCoincidentNormals`
   共位焊接（不焊的话跨格法线折痕平均 25.6°，焊后 0.005°）。动地形网格生成前先读第七节。
9. 命名遵守仓库规范：文件名 `<Category>_<PascalCase>.<ext>`、**无连字符**、导出函数 PascalCase、变量 lowerCamelCase。玩家可见文案（含战报、效果标签、兜底文案）**必须全中文**，不许露裸坐标或英文 key。
10. 存档键固定 `prairiefire1937_campaign_v1`（设置键 `_settings`、手动档 `_manual`）。改状态结构时必须同步 `saveVersion` 并保证 `DeserializeState` 对旧档安全返回 `null`。

## 四、事故档案（同类错误不许再犯第二次）

见 [系统与历史参考](Data_AgentReference.md) 对应章节；仅在相关任务中查阅。

## 五、核心机制速查（2026-07-30 大改后口径）

见 [系统与历史参考](Data_AgentReference.md) 对应章节；仅在相关任务中查阅。

## 六、验证电池（按本次改动影响选测）

运行时变化执行冒烟；交互、UI、渲染及共享基础设施变化追加浏览器验收。纯说明文档整理检查内容、链接和 diff，不触发游戏回归；所选检查必须通过。坐标和随机等地基变更仍做全量回归。

```bash
# 1) Node 冒烟：玩法整改回归与全链路集成闸门，具体数量以套件为准
node PrairieFire1937/Script_SmokeTest.mjs        # 或 npm run test:prairieFire1937

# 2) 浏览器实测：真实鼠标交互 8 项 + 渲染健康 3 视口
#    缺依赖时先检查本任务 package.json 和现有依赖；使用本机 Edge/Chrome
#    浏览器找不到时：设 PF_BROWSER_PATH=<chrome/msedge 可执行文件路径>
node PrairieFire1937/Script_ClickSmokeTest.mjs
node PrairieFire1937/Script_RenderHealthTest.mjs
```

- `Script_SmokeTest.mjs` 的**玩法整改闸门不得为通过而放宽**：打游击必须领先纯种田 ≥8 分、结局多样且好局
  不落失败档、围困可行且有险、扫荡战果走真实 EndTurn 落到玩家资产、缴获入账与战报严格等值、
  事件效果键必消费。改平衡参数后这些闸门就是"玩法没有回潮"的证据。
- 平衡校准工具在会话 scratchpad `calibration/`（vanguard 参照 bot + 8 bot 天梯），
  非仓库资产、随会话销毁；要长期保留可比照 Script_SmokeTest 第六节的 bot 复刻。

- 冒烟锁死的红线**不得为了让测试通过而放宽断言**：坐标往返、同种子同地图、第 1 回合就看得见敌军、
  策略排序（会玩 > 消极 > 莽撞）、账本单调不减且不换收益、评级闸门、表现层顶层无副作用、
  无 CDN、命名规范、**PC-only 断点反向锁死**。
- 交互测试是**一票否决**：8 项里任何一项失败都禁止部署（教训见第四节第一行）。
- 视觉改动另需实拍：无头 Chromium 截 1920×1080 / 1600×900 / 1366×768，
  用到的量化验收线——跨格法线夹角 < 0.1°、探明区平均饱和度 ≥ 0.32、
  移动范围叠加层像素差分 `pctChanged≈23% / meanDelta≈15 / p90≈40`（乳白糊团与不可见都是翻过的车）、
  地形起伏 `localDiffMean ≥ 0.01`。SwiftShader 软渲染很慢，无头跑图给足 timeout（900s 级）。
- 调试入口：`window.PrairieFire`（`GetState/SetState/Rules/handle/ui/audio/view/EndTurn/SetAutoPlay/definitions`）。
  自动化推进回合前**必须** `SetAutoPlay(true)`（跳过过场与事件卡，保证 `EndTurn` 一定 resolve）。

## 七、连续地形方案速查（文明6 同款路线，动 `Script_Renderer.mjs` 网格前必读）

见 [系统与历史参考](Data_AgentReference.md) 对应章节；仅在相关任务中查阅。

## 八、可选资产投放

素材接入见 [Assets/README.md](Assets/README.md)。用户提供的素材核对来源与许可；任务要求生成素材时，图片和离线音频遵循根入口的供应商、成本与密钥规则，不固定由用户手工制作。

可选资产默认不请求，仅在 `?assets=1` 下验证。默认启用属于产品行为变化，按当前任务授权处理；缺失文件仍回退程序化方案。

## 九、与文明6 的差距路线图（第八轮审核 PASS 时附带，未启动）

见 [系统与历史参考](Data_AgentReference.md) 对应章节；仅在相关任务中查阅。

## 十、交付

- 站点由本仓 `.github/workflows/pages.yml` 从 master 部署；遵循 [根流程](../AGENTS.md) 完成本地验收、提交前缓存更新、fetch/rebase 与快进推送，不额外要求先推功能分支，不使用强推。
- 按第六节选择与改动相关的检查并确认通过；纯说明整理不运行游戏回归。
- 提交信息：

```text
<AgentName> PrairieFire1937: short change summary
```
