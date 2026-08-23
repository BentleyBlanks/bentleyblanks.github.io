# PrairieFire1937 —— 《燎原 · 敌后1937》 Agent 指南

线上：`https://bentleyblanks.github.io/PrairieFire1937/`
类型：three.js 三维六角回合制策略（4X 骨架 + 敌后游击战主题），**仅支持 PC 端**。

> 本页与 `TaihangDemo/`、`taihang/` 完全隔离：自己的存档键、自己的 vendor、自己的脚本，不共用任何状态。
> 仓库级纪律（**本机主检出多 agent 共用，任何改动必须在独立 git worktree 里做**、分支命名、
> master 只许快进）见根目录 `AGENTS.md`，先读那份再读这份。

## 〇、当前状态（2026-07 交接快照）

**视觉侧**：已通过第八轮独立视觉审核 PASS（64/80），分数轨迹 34→43→48→51→59→60→61→64。
分项：地形 9 / 单位 8 / 光照 7 / 迷雾 8 / UI 8 / 本地化 8 / PC 适配 8 / 技术 8，无 P0。
用户验收基准："画面不能差于文明6"。差距路线图见本页末尾第九节。

**玩法侧（2026-07-30 起三轮大改造，独立评审驱动）**：
- 第一轮独立玩法评审（系统/节奏/体验三视角）总分 29.5+7=36.5/80，三大死症：
  不开枪种田是最优解、45/45 局落同一失败结局、围困因补给量纲 bug 数学上不可能。
- 三轮改造后（缴获经济反转/据点压制场+拔点开花/扫荡真咬人/饥荒累进/时期修正接线/
  预警分级模糊化/研究竞争/事件词汇表全消费/结局与评级按聚落口径重标/集成缝焊接），
  第二轮独立复审 44.5/80（D6 体验 8.0、D7 引导 7.5 已过线；系统侧 4~5 分段，
  其 P0——AI 采纳块丢字段、缴获双重入账——已在第三轮修复）。
- 参照 bot 天梯（校准口径）：打+建 48.7 > 纯种田 34.7 > 只伏击 24 > 消极 7.7 ≈ 莽撞 8.3；
  结局按打法分流（一寸一寸/化整为零/退回山里/一张空图）；最好参照局 B 级。
- 验证电池：node 冒烟 **66/66**（含第九节玩法整改回归 + 四条全链路集成闸门）、
  真实鼠标交互 8/8、渲染健康 3 视口全过。

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
| `Script_SmokeTest.mjs` | node 冒烟 46 项（规则/经济/AI/命名/断点红线） | 测试 |
| `Script_ClickSmokeTest.mjs` + `Script_RenderHealthTest.mjs` + `Script_BrowserTestKit.mjs` | 浏览器实测：真实鼠标 8 项交互、GL/shader 健康 3 视口 | 测试 |

**并行改动纪律**：一个 agent 只动自己那一栏的文件。跨模块的字段变更必须先改 `Script_Rules.mjs` 的状态契约，再同步各消费方。

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

| 事故 | 根因 | 修法与防线 |
|---|---|---|
| 鼠标全不可点（用户盛怒） | 宿主页兜底 `.ui-root > * { pointer-events: auto }` 按源顺序压过组件规则，五个全屏层拦截点击 | 兜底选择器用 `:where()` 归零特异度；全屏层的 `pointerEvents` 直接写内联 style；**新增全屏层必须跑 `Script_ClickSmokeTest.mjs`** |
| "推演中"永久卡死 | busy 指示层 z-85 + `pointer-events:auto` 盖住 z-70 的事件卡，事件卡等点击、点击永远到不了 | 指示层只看不摸（内联 `pointerEvents:none`）；过场/事件/结局弹层前先 `SetBusy(false)`；特效 await 一律 3.5s 超时竞速 |
| 地图整块消失但页面"正常" | ultra 档 CSM defines 令片元编译失败，three 静默吞掉 | 单一渲染路径；`Script_RenderHealthTest.mjs` 读 `gl.getError()` + 材质编译状态 + 地形三角数 |
| 全场模型压黑 | `new THREE.Color()` 之后又 `convertSRGBToLinear()`，双重转换 | 见约束 7；改材质颜色时搜一遍 `convertSRGBToLinear` |
| 高画质反而更锯齿 | EffectComposer 离屏 RT 默认 `samples=0`，旁路了画布 MSAA | `composer.renderTarget1/2.samples = 4` |
| 扫荡一半战果被静默丢弃（威胁全程不可见） | AI 采纳外部结算时只回抄 map/units/enemies/ledger/exposure/alert 六个字段，bases 降级、敌进我进战果、抢粮、ledgerLog 全丢 | 采纳块一律 `Object.assign(next, adopted)` 整体采纳再补 AI 字段；**部分字段回抄的采纳块一律禁止**；冒烟第九节有走真实 EndTurn 的集成闸门 |
| 缴获经济按声明参数 2 倍运行 | Combat 四条路径已 ApplyCaptures 入库，Rules 又按 report.captures 加一遍 | 入账权归战斗模块独有；冒烟有「入账==战报缴获」等值闸门 |
| 冒烟 62/62 全绿但装配是断的 | 闸门全部直调模块函数，测的是零件不是装配 | 大机制必配「走真实 EndTurn 全链路」的集成闸门（扫荡落资产/缴获等值/tap-and-run/围困有险四条已在） |
| 迷雾成乳白糊团 | three 内置 `fog_fragment` 排在 tonemapping 后，被拉向亮雾色 | 自写"越远越沉"雾，混合在 tonemapping 之前 |
| 隐蔽单位被地形穿透 | 半透明材质顺手关了 `depthWrite` | 恢复 `depthWrite:true` |
| 21 连发 404 红字 | 启动时逐个探测资产文件是否存在 | 默认零请求 + `?assets=1` 门 + `CREDITS.md` 哨兵 |
| 紧凑档字号从未生效 | CSS 写了死选择器 `.pf-res-value`（真名 `.pf-res-stock`） | 改选择器前先在 DOM 里确认类名真的存在 |
| 云层三轮改动全不可见 | 依次是：带在相机可达域外 / 噪声尺度差 1.5 个数量级退化成常数 / ΔL≈2% 被 ACES 压平 / 窗口整段在地平线下 | 视觉改动必须实拍量化（读回像素差分），"我改了参数"不等于"画面变了" |

**方法论结论（本项目最贵的教训）**：截图 + 程序化设置状态验证不了可点性；控制台无异常验证不了 shader 没炸；
参数改了验证不了画面变了。**交互用真实合成事件测，渲染用 GL 错误码测，视觉用像素差分测。**

## 五、核心机制速查（2026-07-30 大改后口径）

- **六种资源**：粮 `grain` / 工 `labor` / 械 `ordnance` / 药 `medicine` / 情报 `intel` / 干部 `cadre`。
  **械真的主要靠缴获**（种田系数 0.08，captureScale 0.7 单次入账，缴获含粮比 0.85——
  打赢一仗能让全县少饿一季）；械有按火力档次的维持费、情报存量 >120 按 15%/季过期、
  药在打散归队/治疗里真实消耗；干部最贵且**连续饥荒会流失干部**（famineTurns 累进）。
- **群众基础 `hex.massBase` (0-100)**：决定产出、情报精度、隐蔽恢复、撤退成功率与控制归属
  （≥62 根据地 / ≥34 游击区 / ≥12 争夺区）。无组织自然衰减+分层上限（村 34/地物 24/旷野 16）。
  **据点压制场**：未拔除的据点按守备比例辐射压制（炮楼 1 环 / 大点 2 环，d1 -1.1 d2 -0.5）——
  不拔点百姓就一直受难；拔点一次性开花（+14/+10）并解除压制。恢复/反攻期群众工作 ×1.35/×1.2。
- **暴露度 `exposure`**：比例衰减（高位回快、低位回慢，困难期 0.10），设计目标带 15-60；
  打完不转移代价 4 倍。**扫荡真咬人**：受创当回合禁疗、hp 归零=被打散
  （就近我方控制区归队，收药钱；无掩护则永失入账）、基地可被降级/停摆（disrupted）。
- **反扫荡四方针**（一次一定）：分散=保人保部队、敌沿轴线通行无阻；工事=保工程保百姓、部队顶着挨打；
  敌进我进=打其后方+迫敌早撤（ledgerScale 0.85 封顶）+缴获、百姓暴露比分散高；决战=击退判定的真赌博。
- **围困**：supply 6~12 与 blockadeSupplyDrain 同量纲，孤立炮楼一个时期内可拔；
  **不是零风险**——守敌按补给/守备比例出击袭扰，围困标记有邻接校验（tap-and-run 无效）；
  围困积累 `undermined`(0-4) 削弱后续强攻的工事防御，撤围逐季回填。
- **预警**：`Rules.ForecastSweep` 一律走 AI 模糊化版——情报覆盖决定信息量
  （无情报可以完全无预警；覆盖 80+ 才给准目标与全轴线；库存与 sweepWarning 科技加成可信度）。
  情报是研究燃料（研究每季抽库存 6 加速）：攒着换预警、花掉换科技，是贯穿全程的取舍。
- **五个时期**：开辟(0-5)/发展(6-13)/困难(14-21)/恢复(22-27)/反攻(28-31)。
  `era.modifiers` 全部生效（困难期产出 ×0.72、编成 ×1.35、干部更稀缺）；
  反攻期开场敌军塌方（守备折半+弱炮楼弃守）+攻坚械耗减半；敌修堡预算恢复期 ×0.5、反攻期 0。
- **经济防膨胀**：`hexYieldScale 0.3`、加成封顶 1.2、按格维持费、部队械/粮维持。改参数必跑冒烟。
- **效果词汇表全消费**：工事效果与事件效果的每个 key 都必须有消费点（冒烟双闸门：
  「声明必消费」+「事件键必消费+unlock id 必须存在」）。playerEffects 缓存
  （RecomputeEconomy 写入）供 Combat/Ai 消费 combatAmbush/captureRate/puppetDefection 等。
- **评级带**：S≥68 / A≥56 / B≥45 / C≥32（按大改后真实分布重标）；八结局门槛为聚落口径
  （治下村占比/聚落群众均值/人口对县域基准比），参照打法可达 B 与正面结局链。

## 六、验证电池（改动后必须全绿才许提交）

```bash
# 1) node 纯逻辑冒烟：66 项（含第九节玩法整改回归 + 全链路集成闸门），分钟级
node PrairieFire1937/Script_SmokeTest.mjs        # 或 npm run test:prairieFire1937

# 2) 浏览器实测：真实鼠标交互 8 项 + 渲染健康 3 视口
#    首次准备：npm i -D playwright-core（用本机已装的 Edge/Chrome，不用下载浏览器）
#    浏览器找不到时：设 PF_BROWSER_PATH=<chrome/msedge 可执行文件路径>
npm run test:prairieFire1937:browser
```

- 第九节的**玩法整改闸门不得为通过而放宽**：打游击必须领先纯种田 ≥8 分、结局多样且好局
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

地表不是"每格一个平顶六棱柱"，而是**跨格连续曲面**：

1. **共享角点**：每个六角角点的高度/起伏取共享该角的三格平均（`CornerBlend`，有 `cornerBlendCache`）。
2. **边缘融合带**：格内半径 `radialT ∈ [0.5, 1.0]` 用 `SmoothStep` 把中心高度渐变到共享边缘目标高度（`EdgeTargetAt` / `SampleTopHeight`），颜色同样在边缘与邻格做 0.5 lerp（`BlendEdgeColor`）。
3. **内部侧壁全删**（`if (neighbour) continue;`），只保留地图外缘裙壁（手工外向法线）。
4. **解析法线**：世界空间差分（epsilon 0.05）算顶面法线，然后 `WeldCoincidentNormals` 按位置哈希
   （`round(x*400) | round(z*400)`）把共位顶点法线平均归一，只焊顶面（`facets` 标记）。
   `FinalizeGeometry` 里 `computeNormals:false`——用 three 的自动法线会把折痕带回来。
5. `tileRadius = 1.0`（见约束 8）。

## 八、可选资产投放（等用户投放素材）

流程见 `Assets/README.md`：用户用 LoveArt 生成 8 张事件插画、找 5 首免费 BGM + 16 条 SFX，
按精确文件名放进 `Assets/` 并附 `CREDITS.md`（来源+许可，**没有许可记录的文件不要提交**）。
访问 `?assets=1` 验证；用户确认后把 `Script_Audio.mjs` / `Script_Ui.mjs` 里的
`ExternalAssetsEnabled()` 改为默认开启。BGM 整轨淡入接管合成配乐（按时期切轨），SFX 逐条替换，
插画覆盖程序化画面并自动压暗角。任何文件缺失都自动回退程序化方案，不报错。

## 九、与文明6 的差距路线图（第八轮审核 PASS 时附带，未启动）

按性价比排序：① 山脊线跨格成脉（全图连续噪声而非逐格取样）② 河流沿格边成水网
③ 单位朝向与待机/行军动画 ④ 天气对地表的响应（雪积地表、雨湿反光）
⑤ 地块小品密度分层（田埂/梯田/碎石）⑥ UI 微动效（面板滑入、资源跳字）。

## 十、交付

- 站点只从 `master` 部署（GitHub Pages 用户主页仓库的强制约束）。
- 流程：worktree 里开发 → push 功能分支 → 验证电池全绿 → `master` **快进**合并推送。
  master 被别的会话推进时先 `fetch` + `rebase`，分支用 `--force-with-lease`，**master 永远不许 force**。
- 提交信息前缀固定：

```text
<AgentName> PrairieFire1937: short change summary
```
