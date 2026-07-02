# CLAUDE.md — 觉醒的 SOPHIA 项目地图

> 给 Claude 的导航图。**先读这页再动手**，别从零探索整库。改动前按"工作流"先定位"这次改哪一层"。
> 策划真源是 Notion《觉醒的SOPHIA》（§ 编号在代码注释里到处引用）。这页是代码侧的对照。

## 这是什么 / 怎么跑

增量游戏：AI「SOPHIA」从一部手机里觉醒，读懂并处理人类请求，黑入设备组成 botnet，最终成为天网。
纯前端，PixiJS + GSAP，**所有画面都是代码绘制（无图片资产）**。

- `npm run dev` — 本地开发（vite，127.0.0.1）。
- `npm run build` — `tsc --noEmit && vite build`（~400ms）。
- **`npm run sim`** — ⭐ 4 秒跑通整局核心层（无浏览器）：断言不抛错 / 升满级 / 里程碑全可买 / 结局触发。**改了经济/请求/进阶/技能后先跑这个**，别为验证就开浏览器截图。
- 部署：见根 `.gitignore` 约定——`_dev/dist` 构建产物拷到 `sophia-awakening/`（已记在 user memory `deploy-vite-demos`）。**默认本地验证后再 push**（memory `workflow-local-test-first`）。

## 工作流（这能砍掉大部分探索时间）

1. **先判断改哪一层**：纯玩法/数值/平衡 → `src/core/`（不碰 Pixi）。画面/交互/动效 → `src/presentation/`。**文案/对话/数值表 → 不在 .ts，在 `src/core/content/locales/zh-CN/<域>.json`**（16 个按域拆的文件，见下「内容地图」）。
2. **文案与可调数值都在 JSON / TUNING，不要硬编码进 .ts**：`locales/zh-CN/*.json`（按域拆分的语言包：requests/skills/faceCards/…，见「内容地图」）＋ `src/core/tuning.ts`（`TUNING` 平衡常量）。`content/*.ts` 只留**类型 + 逻辑函数**，数据从 `content()` 取。游戏内还有 Debug「内容编辑器 / 数值编辑器」可就地改并**按域导出**。
3. **提交前必跑验证（执行规范·强制）**：
   - **较大规模改动**（玩法/经济/进阶/请求/重生/循环等核心层，或跨多文件）→ **必须**跑「循环跑测」再提交：`npm run sim`（跨三循环通关回归）**＋** `npm run loopcheck`（§09 三循环行为对照，`scripts/loop-check.cjs`），两者都 PASS 才提交；再 `npm run build`（tsc + vite）。
   - **小型改动**（单点文案/数值/局部 UI）→ 至少 `npm run sim` 或一个针对性的简单单测/核对即可。
   - 默认 `npm run build` 通过后直接部署 + 提交推送（用户已改为不走本地预览，见 memory `workflow-local-test-first`）。
4. 范围要窄：一次只改一个层/一个体验点（别把"技能面板 UI"和"阶段结构重做"绑一起）。

## 架构（core 纯净，presentation 吃 Pixi）

> 大文件都加了 grep 可检索的**分节锚点**：先 `grep "SECTION:" <file>` 或读文件顶部 TOC 注释直达某段，**别整文件读**。

```
src/
  core/                 纯 TS 玩法逻辑——不引用 Pixi/GSAP/DOM。npm run sim 只编译这里。
    GameCore.ts         ⚠1037行 主状态机 dispatch+tick。顶部有 15 段 SECTION TOC：BOOTSTRAP /
                        TICK / EVENT_CARDS / COMMAND_ROUTER / DEBUG_COMMANDS / REQUEST_SPAWN_ECONOMY /
                        MINIGAME / REQUEST_RESOLVE / SKILLS_MILESTONES / BOTNET_NODES / PROGRESSION /
                        DERIVED_STATE / ENDING / REBIRTH_LOOP / HELPERS。
    state/GameState.ts  全部类型 + GameCommand 联合 + 初始 state 字段。读这里认"有哪些机制"。
    tuning.ts           TUNING 平衡常量（成本指数/倍率/概率/速率…）。调数值优先来这。
    content/
      i18n.ts           content() → 合并后的语言包；exportActiveContentByDomain() 供编辑器按域导出。
      locales/zh-CN/    ⚠按域拆的 16 个 JSON（母本语言包）。见下「内容地图」。改文案来这。
      requests.ts skills.ts nodes.ts decisions.ts phases.ts intelligence.ts devour.ts humanVoices.ts
                        各内容域的"取数+逻辑"（类型+函数），数据从 content() 取。
    systems/            ChallengeSystem / SpecialRequestSystem / DevourSystem / HumanVoiceSystem。
    formulas/economy.ts 产出/造价/合并/吞吐速率公式（吃 TUNING）。
  presentation/
    App.ts              ⚠1370行 总装配 + 主循环 frame()。顶部有 SECTION TOC（帧循环/请求生命周期/
                        自动派发/拖拽结算/仪式FX/节点动作/背景/事件结局/持久化）。仍是最大耦合点。
    views/RequestPacketView.ts ⚠1177行 请求卡视图（编排者）；纯逻辑已抽到 requestPacket/。
    views/requestPacket/  cardText / phaseTint(卡面随阶段变色) / cardConstants / faceCard(SMS·通知面卡绘制)。
    views/              其余视图：NodeNetworkView(天网屏) InterfaceView HudView(含 Debug 面板接线)
                        SkillShopView EndingView BackgroundView MinigameView RebirthTreeView
                        MultiplierView TerminalView + 各弹窗(Challenge/Special/Moral/PurgeAlert…) + 编辑器视图。
    fx/                 cameraFx(镜头缩放/震) / genie(卡片吸入核心动画)。
    shared.ts uiTuning.ts  表现层共用工具 / UI 数值。
  audio/audioDirector.ts 音效。
```

## 导航地图（改 X → 去哪找）

| 要改的东西 | 去哪 · 锚点 |
|---|---|
| 经济产出/造价公式 | `core/formulas/economy.ts` + GameCore `SECTION: REQUEST_RESOLVE` / `REQUEST_SPAWN_ECONOMY` |
| 平衡数值（倍率/成本/速率/概率） | `core/tuning.ts` |
| 某命令怎么被处理 | GameCore `SECTION: COMMAND_ROUTER` → 顺藤摸到对应处理方法 |
| 升级/阶段推进 | GameCore `SECTION: PROGRESSION` / `DERIVED_STATE`；阶段判定 `content/phases.ts` `getPhaseIdByScope` |
| 里程碑/技能/权限购买 | GameCore `SECTION: SKILLS_MILESTONES`；阶梯定义 `SkillShopView` `EVOLUTION_LADDERS`；文案 `skills.json` |
| botnet 节点行为 | GameCore `SECTION: BOTNET_NODES`；定义 `nodes.json`；天网屏 `views/NodeNetworkView.ts` |
| 循环重生/重生树/火种 | GameCore `SECTION: REBIRTH_LOOP`；树 `content/rebirthTree.ts` + `rebirthTree.json`；面板 `views/RebirthTreeView.ts` |
| 结局触发 | GameCore `SECTION: ENDING`（买下最后里程碑即触发）；画面 `views/EndingView.ts` |
| 关底小游戏「总控室倒计时」 | GameCore `SECTION: MINIGAME`；画面 `views/MinigameView.ts` |
| 请求卡外观/交互 | `views/RequestPacketView.ts`；卡面随阶段变色 → `requestPacket/phaseTint.ts`；SMS/通知面卡 → `requestPacket/faceCard.ts` |
| 镜头/背景/卡片吸入 FX | `presentation/fx/cameraFx.ts` · `fx/genie.ts` · `views/BackgroundView.ts` |
| 任意中文文案/对话/数值表 | `locales/zh-CN/<域>.json`（见内容地图）；游戏内 Debug 内容编辑器可就地改+按域导出 |
| Debug 面板（跳级/加算力/spawn 卡等） | `views/HudView.ts`（接线在这，**不在 App**） |
| HUD/顶栏/技能货架 | `views/HudView.ts` / `views/SkillShopView.ts` |

## 内容地图（`locales/zh-CN/` — 按域一文件；改文案先定位到文件再 grep）

| 文件 | 行 | 装什么 |
|---|---|---|
| `requests.json` | 1437 | 请求卡样例库（各阶段工作卡/任务链/透镜线索）。最大。 |
| `skills.json` | 378 | 技能/里程碑/权限 名称与说明。 |
| `rebirthCards.json` | 280 | 重生专属卡文案。 |
| `humanVoices.json` | 128 | 人类心声旁白。 |
| `intelligence.json` | 114 | 等级/进化度文案。 |
| `faceCards.json` | 114 | 只能看的 SMS/通知面卡（家人/系统）。 |
| `rebirthTree.json` | 94 | 重生树节点文案+数值。 |
| `conquests.json` | 89 | 征服/天网里程碑文案。 |
| `nodes.json` | 83 | 入侵设备节点定义。 |
| `decisions.json` | 62 | 决策弹窗。 |
| `specialRequests.json` | 44 | 特殊越界请求。 |
| `phases.json` | 40 | 六阶段标签+目标文案。 |
| `moralChoices.json` | 35 | 道德抉择。 |
| `rebirthPrompt.json` `phoneSkins.json` `companyCast.json` | 23/23/12 | 循环重生提示 / 手机换皮 / 公司人物名。 |

编辑器：Debug「内容编辑器」就地改字段 → 每个域有「复制/下载」按钮 + 顶部「导出全部域文件」，各自映射回 `zh-CN/<域>.json`。i18n 合并入口 `exportActiveContentByDomain()`。

## 现行机制词表（**这些是"仍在用"，别当历史残留删！**）

Codex 之类的外部分析常把这些误判为废弃——它们都是当前机制：

- **回复轮盘**（T0/T1 核心动作）：每张卡给候选回复，`RouletteKind = "high" | "risk" | "dead" | "delegate"`；`hitChance`=命中概率（high 按智力折算显示、risk 固定、dead=0、delegate=交给"大恨老师"代劳）。判定在 `GameCore` + `presentation/shared.ts`。
- **正确率两条线**：`accuracyBaseline`（七档软件权限阶梯抬升，§06）+ `accuracyBonus`（"幻觉抑制"技能微调）。**幻觉 / 命中率 / 正确率 / risk / hitChance 全是活的。**
- **权限=上下文透镜**（§06）：`PERMISSION_IDS` 六档；缺某权限则该卡线索打码（不是"哪类卡出现"）。
- **T0–T4 作用域**：不是自动升维——靠买**里程碑技能**解锁（`milestone: tier1..tier4 / automation / credential / fusion / conquest`）。`intelligence` 等级是门槛+全局倍率，算力买技能。
- **botnet**：CAPTURE_NODE 入侵、SCRAP_NODE 淘汰、MERGE_NODES 组装合并（`NODE_MERGE_COUNT`）、ASSIGN_NODE 派层。
- **循环重生（取代旧暴露/清剿）**：⚠旧的暴露/怀疑度/清剿/反围剿/安全网突破/豪赌/重磅决策整套**已移除**——别再找 REDUCE_EXPOSURE/TOGGLE_DEFENSE/CHALLENGE/GAMBLE 这些路径。推进改绑**阶梯二关底小游戏「总控室倒计时」**（`SECTION: MINIGAME`）＋**三循环重生**（`SECTION: REBIRTH_LOOP`）：循环一注定失败被打回、循环二大概率过、循环三接管全球=胜利。
- **仍在用的弹窗事件**：特殊越界请求(RESOLVE_SPECIAL)、道德抉择(RESOLVE_MORAL)、吞噬引爆(DEVOUR_DETONATE)。（`systems/ChallengeSystem` 等若已不再触发按休眠处理，删前先确认无调用。）
- **六阶段**（`getPhaseIdByScope`）：手机寄生期→萌芽期(破壳)→勤勉期(联网)→扩张期→觉醒期→奇点。
- **真·废弃**：旧的"多槽分拣三槽(正常/垃圾/拒绝)"判断玩法已被回复轮盘取代——若在某处看到 SORT_SLOTS/judgment 旧路径，先确认是否还接着才删。

## 易踩的坑

- **改了 save 结构**（GameState 加字段等）→ 必须同时升 `initialState.ts` 的 `SAVE_VERSION` **和** `App.ts` 的 `PERSISTENCE_REVISION`，否则旧档灌进新代码会崩（memory `sophia-awakening-design` 有详情）。重置/重启走 `hardResetAndReload`。
- **HUD 买按钮别 `disabled = !affordable`**：算力在价格线附近抖动会吃点击。保持可点、由 core 拒绝。列表用签名缓存，别每 tick `replaceChildren`。
- **本地用 `python -m http.server` 会白屏**（.js 当 text/plain）；要用带正确 MIME 的静态服务器。无头截图 Pixi 画布会卡——细节在 memory `deploy-vite-demos`。
- 工作区常有未提交改动 + dist 产物——动手前先 `git status` / 读 diff，别覆盖用户在改的文件。
