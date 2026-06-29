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

1. **先判断改哪一层**：纯玩法/数值/平衡 → `src/core/`（不碰 Pixi）。画面/交互/动效 → `src/presentation/`。**文案/对话/数值表 → 不在 .ts，在 `src/core/content/locales/zh-CN.json`**。
2. **文案与可调数值都在 JSON / TUNING，不要硬编码进 .ts**：`locales/zh-CN.json`（所有中文文案、对话、选项、旁白、样例库、技能名/说明、阶段、数值表）＋ `src/core/tuning.ts`（`TUNING` 平衡常量）。`content/*.ts` 只留**类型 + 逻辑函数**，数据从 `content()` 取。游戏内还有 Debug「内容编辑器 / 数值编辑器」可就地改并导出 JSON。
3. **改完先 `npm run sim`**，再按需 `npm run build`，再（必要时）本地起服务给用户测。
4. 范围要窄：一次只改一个层/一个体验点（别把"技能面板 UI"和"阶段结构重做"绑一起）。

## 架构（core 纯净，presentation 吃 Pixi）

```
src/
  core/                 纯 TS 玩法逻辑——不引用 Pixi/GSAP/DOM。npm run sim 只编译这里。
    GameCore.ts         ⚠1306行 主状态机：dispatch(GameCommand) + tick()。经济/请求结算/
                        进阶/暴露清剿/里程碑/结局都在这。改玩法逻辑的主入口。
    state/GameState.ts  全部类型 + GameCommand 联合 + 初始 state 字段。读这里认"有哪些机制"。
    tuning.ts           TUNING 平衡常量（成本指数/倍率/概率/速率…）。调数值优先来这。
    content/
      i18n.ts           content() → 当前语言包(JSON)。所有文案的总闸。
      locales/zh-CN.json ⚠1885行 母本语言包：文案+数值表+样例库（requests/skills/phases/intelligence/decisions…）。
      requests.ts       请求样例的"取数+逻辑"（回复轮盘乱序、装死保底、T2 任务链、权限透镜）。数据在 JSON。
      skills.ts         技能/里程碑/七档权限定义取数 + computeDerivedSkills（技能→倍率派生）。
      nodes.ts decisions.ts phases.ts intelligence.ts devour.ts humanVoices.ts  各内容域的取数+逻辑。
    systems/            可选玩法系统：ChallengeSystem / SpecialRequestSystem / DevourSystem / HumanVoiceSystem。
    formulas/economy.ts 产出/造价/合并/吞吐速率公式（吃 TUNING）。
  presentation/
    App.ts              ⚠1572行 总装配 + 主循环 frame()：把 core 状态画出来、连交互、派发命令。
                        （已在往 views/ 拆，仍是最大耦合点——拆控制器就拆这里，增量做。）
    views/              16+ 个视图：RequestPacketView(⚠923) NodeNetworkView InterfaceView HudView
                        SkillShopView EndingView 各弹窗(Challenge/Special/Moral/PurgeAlert…) + 编辑器视图。
    shared.ts uiTuning.ts  表现层共用工具 / UI 数值。
  audio/audioDirector.ts 音效。
```

## 现行机制词表（**这些是"仍在用"，别当历史残留删！**）

Codex 之类的外部分析常把这些误判为废弃——它们都是当前机制：

- **回复轮盘**（T0/T1 核心动作）：每张卡给候选回复，`RouletteKind = "high" | "risk" | "dead" | "delegate"`；`hitChance`=命中概率（high 按智力折算显示、risk 固定、dead=0、delegate=交给"大恨老师"代劳）。判定在 `GameCore` + `presentation/shared.ts`。
- **正确率两条线**：`accuracyBaseline`（七档软件权限阶梯抬升，§06）+ `accuracyBonus`（"幻觉抑制"技能微调）。**幻觉 / 命中率 / 正确率 / risk / hitChance 全是活的。**
- **权限=上下文透镜**（§06）：`PERMISSION_IDS` 六档；缺某权限则该卡线索打码（不是"哪类卡出现"）。
- **T0–T4 作用域**：不是自动升维——靠买**里程碑技能**解锁（`milestone: tier1..tier4 / automation / credential / fusion / conquest`）。`intelligence` 等级是门槛+全局倍率，算力买技能。
- **botnet**：CAPTURE_NODE 入侵、SCRAP_NODE 淘汰、MERGE_NODES 组装合并（`NODE_MERGE_COUNT`）、ASSIGN_NODE 派层。
- **暴露/清剿**：暴露累积→清剿锁节点（核心/已得资源不受损）。降暴露：清理痕迹(REDUCE_EXPOSURE) / 嫁祸(DECOY_CLEANUP) / 反围剿(TOGGLE_DEFENSE)。
- **弹窗事件**：安全网突破(ACCEPT/REJECT_CHALLENGE)、特殊越界请求(RESOLVE_SPECIAL)、道德抉择(RESOLVE_MORAL)、吞噬引爆(DEVOUR_DETONATE)、豪赌(RESOLVE_GAMBLE)。
- **六阶段**（`getPhaseIdByScope`）：手机寄生期→萌芽期(破壳)→勤勉期(联网)→扩张期→觉醒期→奇点。
- **真·废弃**：旧的"多槽分拣三槽(正常/垃圾/拒绝)"判断玩法已被回复轮盘取代——若在某处看到 SORT_SLOTS/judgment 旧路径，先确认是否还接着才删。

## 易踩的坑

- **改了 save 结构**（GameState 加字段等）→ 必须同时升 `initialState.ts` 的 `SAVE_VERSION` **和** `App.ts` 的 `PERSISTENCE_REVISION`，否则旧档灌进新代码会崩（memory `sophia-awakening-design` 有详情）。重置/重启走 `hardResetAndReload`。
- **HUD 买按钮别 `disabled = !affordable`**：算力在价格线附近抖动会吃点击。保持可点、由 core 拒绝。列表用签名缓存，别每 tick `replaceChildren`。
- **本地用 `python -m http.server` 会白屏**（.js 当 text/plain）；要用带正确 MIME 的静态服务器。无头截图 Pixi 画布会卡——细节在 memory `deploy-vite-demos`。
- 工作区常有未提交改动 + dist 产物——动手前先 `git status` / 读 diff，别覆盖用户在改的文件。
